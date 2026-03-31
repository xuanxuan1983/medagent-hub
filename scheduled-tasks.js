/**
 * MedAgent Hub — 定时任务模块 v1.0
 * ─────────────────────────────────────────────────────────────
 * 功能：
 *   1. 定时任务 CRUD（创建/读取/更新/删除）
 *   2. cron 表达式解析与下次执行时间计算
 *   3. 调度引擎：每分钟扫描到期任务并触发 AI 执行
 *   4. 执行记录（最近 50 条）
 *
 * 数据存储：SQLite（复用 api-server.js 中的 db 实例）
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

// ============================================================
// cron 解析（轻量实现，支持 5 字段标准格式）
// 格式：分 时 日 月 周  (0-59 0-23 1-31 1-12 0-6)
// 支持：* / , - 以及预设别名
// ============================================================

const CRON_PRESETS = {
  '@daily':   '0 9 * * *',
  '@weekly':  '0 9 * * 1',
  '@monthly': '0 9 1 * *',
  '@hourly':  '0 * * * *',
};

function parseCronField(field, min, max) {
  if (field === '*') return null; // 匹配所有
  const values = new Set();
  for (const part of field.split(',')) {
    if (part.includes('/')) {
      const [range, step] = part.split('/');
      const s = parseInt(step);
      const [lo, hi] = range === '*' ? [min, max] : range.split('-').map(Number);
      for (let i = (lo === undefined ? min : lo); i <= (hi === undefined ? lo : hi); i += s) values.add(i);
    } else if (part.includes('-')) {
      const [lo, hi] = part.split('-').map(Number);
      for (let i = lo; i <= hi; i++) values.add(i);
    } else {
      values.add(parseInt(part));
    }
  }
  return values;
}

function parseCron(expr) {
  let e = (CRON_PRESETS[expr] || expr).trim();
  const parts = e.split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron: ${expr}`);
  return {
    minute:  parseCronField(parts[0], 0, 59),
    hour:    parseCronField(parts[1], 0, 23),
    day:     parseCronField(parts[2], 1, 31),
    month:   parseCronField(parts[3], 1, 12),
    weekday: parseCronField(parts[4], 0, 6),
  };
}

function matchesCron(parsed, date) {
  const m = date.getMinutes(), h = date.getHours(),
        d = date.getDate(), mo = date.getMonth() + 1, wd = date.getDay();
  if (parsed.minute  && !parsed.minute.has(m))  return false;
  if (parsed.hour    && !parsed.hour.has(h))    return false;
  if (parsed.day     && !parsed.day.has(d))     return false;
  if (parsed.month   && !parsed.month.has(mo))  return false;
  if (parsed.weekday && !parsed.weekday.has(wd)) return false;
  return true;
}

/** 计算下次执行时间（从 now 起最多向前推 366 天） */
function nextRunTime(cronExpr, fromDate) {
  try {
    const parsed = parseCron(cronExpr);
    const d = new Date(fromDate || Date.now());
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + 1); // 从下一分钟开始
    for (let i = 0; i < 60 * 24 * 366; i++) {
      if (matchesCron(parsed, d)) return d.toISOString();
      d.setMinutes(d.getMinutes() + 1);
    }
  } catch(e) {}
  return null;
}

/** 人类可读的 cron 描述 */
function cronDescription(expr) {
  const e = (CRON_PRESETS[expr] || expr).trim();
  const p = e.split(/\s+/);
  if (p.length !== 5) return expr;
  const [min, hr, , , wd] = p;
  const timeStr = (hr !== '*' && min !== '*') ? `${hr.padStart ? hr : hr}:${String(min).padStart(2,'0')}` : '';
  const weekMap = { '1':'周一','2':'周二','3':'周三','4':'周四','5':'周五','6':'周六','0':'周日' };
  if (wd !== '*') return `每${weekMap[wd] || '周'} ${timeStr}`;
  if (p[2] !== '*') return `每月 ${p[2]} 日 ${timeStr}`;
  if (hr !== '*') return `每天 ${timeStr}`;
  if (min !== '*') return `每小时第 ${min} 分`;
  return `每分钟`;
}

// ============================================================
// 数据库初始化
// ============================================================

let db = null;
let sessions = null; // 引用 api-server.js 中的 sessions Map

function init(dbInstance, sessionsMap) {
  db = dbInstance;
  sessions = sessionsMap;

  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id          TEXT PRIMARY KEY,
      user_code   TEXT NOT NULL,
      title       TEXT NOT NULL,
      description TEXT NOT NULL,
      cron_expr   TEXT NOT NULL,
      agent_id    TEXT NOT NULL DEFAULT 'doudou',
      enabled     INTEGER NOT NULL DEFAULT 1,
      next_run    TEXT,
      last_run    TEXT,
      run_count   INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sched_user ON scheduled_tasks(user_code);
    CREATE INDEX IF NOT EXISTS idx_sched_next ON scheduled_tasks(next_run, enabled);

    CREATE TABLE IF NOT EXISTS task_run_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id     TEXT NOT NULL,
      user_code   TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'running',
      output      TEXT,
      error       TEXT,
      started_at  TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_log_task ON task_run_logs(task_id);
    CREATE INDEX IF NOT EXISTS idx_log_user ON task_run_logs(user_code);
  `);
}

// ============================================================
// CRUD
// ============================================================

function generateId() {
  return 'st_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function createTask(userCode, { title, description, cronExpr, agentId }) {
  const id = generateId();
  const next = nextRunTime(cronExpr);
  db.prepare(`
    INSERT INTO scheduled_tasks (id, user_code, title, description, cron_expr, agent_id, next_run)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userCode, title, description, cronExpr, agentId || 'doudou', next);
  return getTask(id);
}

function getTask(id) {
  return db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id);
}

function getUserTasks(userCode) {
  return db.prepare('SELECT * FROM scheduled_tasks WHERE user_code = ? ORDER BY created_at DESC').all(userCode);
}

function updateTask(id, userCode, fields) {
  const allowed = ['title', 'description', 'cron_expr', 'agent_id', 'enabled'];
  const updates = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { updates.push(`${k} = ?`); vals.push(v); }
  }
  if (updates.length === 0) return getTask(id);
  // 如果更新了 cron，重新计算 next_run
  if (fields.cron_expr) {
    updates.push('next_run = ?');
    vals.push(nextRunTime(fields.cron_expr));
  }
  updates.push("updated_at = datetime('now')");
  vals.push(id, userCode);
  db.prepare(`UPDATE scheduled_tasks SET ${updates.join(', ')} WHERE id = ? AND user_code = ?`).run(...vals);
  return getTask(id);
}

function deleteTask(id, userCode) {
  db.prepare('DELETE FROM task_run_logs WHERE task_id = ?').run(id);
  db.prepare('DELETE FROM scheduled_tasks WHERE id = ? AND user_code = ?').run(id, userCode);
}

function getTaskLogs(taskId, limit = 20) {
  return db.prepare('SELECT * FROM task_run_logs WHERE task_id = ? ORDER BY id DESC LIMIT ?').all(taskId, limit);
}

function getUserLogs(userCode, limit = 50) {
  return db.prepare(`
    SELECT l.*, t.title as task_title, t.agent_id
    FROM task_run_logs l
    JOIN scheduled_tasks t ON l.task_id = t.id
    WHERE l.user_code = ?
    ORDER BY l.id DESC LIMIT ?
  `).all(userCode, limit);
}

// ============================================================
// 执行引擎
// ============================================================

let aiExecutor = null; // 由 api-server.js 注入

function setAIExecutor(fn) {
  aiExecutor = fn;
}

async function executeTask(task) {
  const logId = db.prepare(`
    INSERT INTO task_run_logs (task_id, user_code, status, started_at)
    VALUES (?, ?, 'running', datetime('now'))
  `).run(task.id, task.user_code).lastInsertRowid;

  try {
    console.log(`[ScheduledTask] Running: ${task.title} (${task.id}) for ${task.user_code}`);

    let output = '';
    if (aiExecutor) {
      output = await aiExecutor({
        userCode: task.user_code,
        agentId: task.agent_id,
        message: task.description,
        taskId: task.id,
      });
    } else {
      output = `[定时任务执行] ${task.title}\n\n${task.description}`;
    }

    // 更新日志
    db.prepare(`
      UPDATE task_run_logs SET status='success', output=?, finished_at=datetime('now') WHERE id=?
    `).run(output.slice(0, 4000), logId);

    // 更新任务状态
    const next = nextRunTime(task.cron_expr);
    db.prepare(`
      UPDATE scheduled_tasks SET last_run=datetime('now'), run_count=run_count+1, next_run=? WHERE id=?
    `).run(next, task.id);

    console.log(`[ScheduledTask] Done: ${task.title}`);
  } catch (err) {
    db.prepare(`
      UPDATE task_run_logs SET status='error', error=?, finished_at=datetime('now') WHERE id=?
    `).run(err.message, logId);
    const next = nextRunTime(task.cron_expr);
    db.prepare(`UPDATE scheduled_tasks SET last_run=datetime('now'), next_run=? WHERE id=?`).run(next, task.id);
    console.error(`[ScheduledTask] Error: ${task.title} — ${err.message}`);
  }
}

/** 每分钟扫描到期任务 */
function startScheduler() {
  const tick = () => {
    try {
      const now = new Date();
      // 查找 enabled=1 且 next_run <= now 的任务
      const due = db.prepare(`
        SELECT * FROM scheduled_tasks
        WHERE enabled = 1 AND next_run IS NOT NULL AND next_run <= datetime('now', '+30 seconds')
      `).all();

      for (const task of due) {
        // 立即更新 next_run 防止重复触发
        const next = nextRunTime(task.cron_expr);
        db.prepare(`UPDATE scheduled_tasks SET next_run=? WHERE id=?`).run(next, task.id);
        executeTask(task).catch(e => console.error('[ScheduledTask] Uncaught:', e));
      }
    } catch (e) {
      console.error('[ScheduledTask] Scheduler tick error:', e);
    }
  };

  // 对齐到下一分钟整点启动
  const msToNextMinute = 60000 - (Date.now() % 60000);
  setTimeout(() => {
    tick();
    setInterval(tick, 60000);
  }, msToNextMinute);

  console.log(`[ScheduledTask] Scheduler started, first tick in ${Math.round(msToNextMinute/1000)}s`);
}

// ============================================================
// HTTP 路由处理（由 api-server.js 调用）
// ============================================================

async function handleRequest(url, method, body, userCode, res) {
  const path = url.pathname;

  // GET /api/scheduled-tasks — 获取用户所有任务
  if (path === '/api/scheduled-tasks' && method === 'GET') {
    const tasks = getUserTasks(userCode).map(t => ({
      ...t,
      cronDescription: cronDescription(t.cron_expr),
      enabled: !!t.enabled,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tasks }));
    return true;
  }

  // POST /api/scheduled-tasks — 创建任务
  if (path === '/api/scheduled-tasks' && method === 'POST') {
    const { title, description, cronExpr, agentId } = body || {};
    if (!title || !description || !cronExpr) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing_fields', message: '请填写任务名称、描述和执行周期' }));
      return true;
    }
    // 验证 cron 表达式
    try { parseCron(cronExpr); } catch(e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_cron', message: '执行周期格式不正确' }));
      return true;
    }
    const task = createTask(userCode, { title, description, cronExpr, agentId });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ task: { ...task, cronDescription: cronDescription(task.cron_expr), enabled: !!task.enabled } }));
    return true;
  }

  // PATCH /api/scheduled-tasks/:id — 更新任务
  const patchMatch = path.match(/^\/api\/scheduled-tasks\/([^/]+)$/);
  if (patchMatch && method === 'PATCH') {
    const id = patchMatch[1];
    const fields = {};
    if (body.title !== undefined)       fields.title = body.title;
    if (body.description !== undefined) fields.description = body.description;
    if (body.cronExpr !== undefined)    fields.cron_expr = body.cronExpr;
    if (body.agentId !== undefined)     fields.agent_id = body.agentId;
    if (body.enabled !== undefined)     fields.enabled = body.enabled ? 1 : 0;
    const task = updateTask(id, userCode, fields);
    if (!task) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
      return true;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ task: { ...task, cronDescription: cronDescription(task.cron_expr), enabled: !!task.enabled } }));
    return true;
  }

  // DELETE /api/scheduled-tasks/:id — 删除任务
  if (patchMatch && method === 'DELETE') {
    deleteTask(patchMatch[1], userCode);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  // POST /api/scheduled-tasks/:id/run — 立即执行
  const runMatch = path.match(/^\/api\/scheduled-tasks\/([^/]+)\/run$/);
  if (runMatch && method === 'POST') {
    const task = getTask(runMatch[1]);
    if (!task || task.user_code !== userCode) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
      return true;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, message: '任务已触发执行' }));
    executeTask(task).catch(e => console.error('[ScheduledTask] Manual run error:', e));
    return true;
  }

  // GET /api/scheduled-tasks/:id/logs — 获取执行记录
  const logsMatch = path.match(/^\/api\/scheduled-tasks\/([^/]+)\/logs$/);
  if (logsMatch && method === 'GET') {
    const logs = getTaskLogs(logsMatch[1]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ logs }));
    return true;
  }

  // GET /api/scheduled-tasks/logs/all — 获取用户所有执行记录
  if (path === '/api/scheduled-tasks/logs/all' && method === 'GET') {
    const logs = getUserLogs(userCode);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ logs }));
    return true;
  }

  return false; // 未匹配
}

module.exports = { init, handleRequest, startScheduler, setAIExecutor, cronDescription, nextRunTime, createTask, getUserTasks, getTask, updateTask, deleteTask, getTaskLogs, getUserLogs };
