/**
 * P5: 后台自主运行 - 定时自动化任务
 * 支持用户创建定时任务（如每天自动检索竞品动态、定时生成日报等）
 */

const fs = require('fs');
const path = require('path');

const TASKS_DIR = path.join(__dirname, '..', 'data', 'auto-tasks');

// 确保目录存在
if (!fs.existsSync(TASKS_DIR)) {
  fs.mkdirSync(TASKS_DIR, { recursive: true });
}

// 内存中的定时器
const activeTimers = {};

function handleAutoTaskRoutes(req, res, url, body, getUserCode, isAuthenticated) {
  const pathname = url.pathname;

  // 获取任务列表
  if (pathname === '/api/auto-tasks' && req.method === 'GET') {
    const userCode = getUserCode(req);
    if (!userCode) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '未登录' }));
      return true;
    }

    const tasks = loadUserTasks(userCode);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tasks: tasks }));
    return true;
  }

  // 创建任务
  if (pathname === '/api/auto-tasks/create' && req.method === 'POST') {
    const userCode = getUserCode(req);
    if (!userCode) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '未登录' }));
      return true;
    }

    const { name, description, agentId, prompt, schedule, enabled } = body;
    if (!name || !prompt || !schedule) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '缺少必要参数' }));
      return true;
    }

    const taskId = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    const task = {
      id: taskId,
      name: name,
      description: description || '',
      agentId: agentId || null,
      prompt: prompt,
      schedule: schedule, // { type: 'interval'|'daily'|'weekly', value: ... }
      enabled: enabled !== false,
      createdAt: new Date().toISOString(),
      lastRun: null,
      runCount: 0,
      lastResult: null,
      status: 'idle'
    };

    const tasks = loadUserTasks(userCode);
    tasks.push(task);
    saveUserTasks(userCode, tasks);

    if (task.enabled) {
      scheduleTask(userCode, task);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, task: task }));
    return true;
  }

  // 更新任务
  if (pathname === '/api/auto-tasks/update' && req.method === 'POST') {
    const userCode = getUserCode(req);
    if (!userCode) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '未登录' }));
      return true;
    }

    const { taskId } = body;
    if (!taskId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '缺少任务ID' }));
      return true;
    }

    const tasks = loadUserTasks(userCode);
    const idx = tasks.findIndex(t => t.id === taskId);
    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '任务不存在' }));
      return true;
    }

    // 更新字段
    if (body.name !== undefined) tasks[idx].name = body.name;
    if (body.description !== undefined) tasks[idx].description = body.description;
    if (body.agentId !== undefined) tasks[idx].agentId = body.agentId;
    if (body.prompt !== undefined) tasks[idx].prompt = body.prompt;
    if (body.schedule !== undefined) tasks[idx].schedule = body.schedule;
    if (body.enabled !== undefined) {
      tasks[idx].enabled = body.enabled;
      if (body.enabled) {
        scheduleTask(userCode, tasks[idx]);
      } else {
        cancelTask(taskId);
        tasks[idx].status = 'paused';
      }
    }

    saveUserTasks(userCode, tasks);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, task: tasks[idx] }));
    return true;
  }

  // 删除任务
  if (pathname === '/api/auto-tasks/delete' && req.method === 'POST') {
    const userCode = getUserCode(req);
    if (!userCode) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '未登录' }));
      return true;
    }

    const { taskId } = body;
    const tasks = loadUserTasks(userCode);
    const filtered = tasks.filter(t => t.id !== taskId);
    saveUserTasks(userCode, filtered);
    cancelTask(taskId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return true;
  }

  // 手动执行任务
  if (pathname === '/api/auto-tasks/run' && req.method === 'POST') {
    const userCode = getUserCode(req);
    if (!userCode) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '未登录' }));
      return true;
    }

    const { taskId } = body;
    const tasks = loadUserTasks(userCode);
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '任务不存在' }));
      return true;
    }

    // 标记运行状态
    task.lastRun = new Date().toISOString();
    task.runCount = (task.runCount || 0) + 1;
    task.status = 'running';
    saveUserTasks(userCode, tasks);

    // 返回任务信息，前端负责实际发送到 Agent
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      task: task,
      executePrompt: task.prompt,
      executeAgent: task.agentId
    }));
    return true;
  }

  // 获取任务执行历史
  if (pathname === '/api/auto-tasks/history' && req.method === 'GET') {
    const userCode = getUserCode(req);
    if (!userCode) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '未登录' }));
      return true;
    }

    const taskId = url.searchParams.get('taskId');
    const historyFile = path.join(TASKS_DIR, userCode + '_history.json');
    let history = [];
    if (fs.existsSync(historyFile)) {
      try { history = JSON.parse(fs.readFileSync(historyFile, 'utf-8')); } catch(e) {}
    }

    if (taskId) {
      history = history.filter(h => h.taskId === taskId);
    }

    // 返回最近 50 条
    history = history.slice(-50);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ history: history }));
    return true;
  }

  // 记录执行结果
  if (pathname === '/api/auto-tasks/result' && req.method === 'POST') {
    const userCode = getUserCode(req);
    if (!userCode) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '未登录' }));
      return true;
    }

    const { taskId, result, status } = body;
    const tasks = loadUserTasks(userCode);
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      task.lastResult = (result || '').substring(0, 500);
      task.status = status || 'idle';
      saveUserTasks(userCode, tasks);
    }

    // 追加历史
    const historyFile = path.join(TASKS_DIR, userCode + '_history.json');
    let history = [];
    if (fs.existsSync(historyFile)) {
      try { history = JSON.parse(fs.readFileSync(historyFile, 'utf-8')); } catch(e) {}
    }
    history.push({
      taskId: taskId,
      timestamp: new Date().toISOString(),
      result: (result || '').substring(0, 500),
      status: status || 'completed'
    });
    // 保留最近 200 条
    if (history.length > 200) history = history.slice(-200);
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return true;
  }

  return false;
}

// ===== 辅助函数 =====

function loadUserTasks(userCode) {
  const file = path.join(TASKS_DIR, userCode + '.json');
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch(e) {
    return [];
  }
}

function saveUserTasks(userCode, tasks) {
  const file = path.join(TASKS_DIR, userCode + '.json');
  fs.writeFileSync(file, JSON.stringify(tasks, null, 2));
}

function scheduleTask(userCode, task) {
  cancelTask(task.id); // 先取消已有的

  if (!task.schedule || !task.enabled) return;

  var intervalMs;
  switch (task.schedule.type) {
    case 'interval':
      intervalMs = (task.schedule.value || 60) * 60 * 1000; // 小时转毫秒
      break;
    case 'daily':
      intervalMs = 24 * 60 * 60 * 1000;
      break;
    case 'weekly':
      intervalMs = 7 * 24 * 60 * 60 * 1000;
      break;
    default:
      intervalMs = 24 * 60 * 60 * 1000;
  }

  // 最小间隔 5 分钟
  if (intervalMs < 5 * 60 * 1000) intervalMs = 5 * 60 * 1000;

  activeTimers[task.id] = setInterval(function() {
    // 更新运行状态
    var tasks = loadUserTasks(userCode);
    var t = tasks.find(x => x.id === task.id);
    if (t) {
      t.lastRun = new Date().toISOString();
      t.runCount = (t.runCount || 0) + 1;
      t.status = 'scheduled-run';
      saveUserTasks(userCode, tasks);
    }
    console.log('[AutoTask] Scheduled run: ' + task.name + ' (' + task.id + ')');
  }, intervalMs);

  console.log('[AutoTask] Scheduled: ' + task.name + ' every ' + (intervalMs / 60000) + ' min');
}

function cancelTask(taskId) {
  if (activeTimers[taskId]) {
    clearInterval(activeTimers[taskId]);
    delete activeTimers[taskId];
  }
}

module.exports = { handleAutoTaskRoutes };
