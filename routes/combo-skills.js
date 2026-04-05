/**
 * MedAgent Hub — Combo Skills (自定义工作流) 模块
 *
 * 功能：
 * 1. 用户可将多个技能包串联为一个"工作流"（Combo）
 * 2. 支持 CRUD：创建、读取、更新、删除
 * 3. 每个 Combo 包含有序步骤列表，每步可绑定技能包 + 自定义 prompt + 目标 Agent
 * 4. 执行时按步骤顺序触发
 */

const fs = require('fs');
const path = require('path');

const COMBOS_DIR = path.join(__dirname, '..', 'data', 'combos');
if (!fs.existsSync(COMBOS_DIR)) fs.mkdirSync(COMBOS_DIR, { recursive: true });

/**
 * 获取用户的所有 Combo 工作流
 */
function listCombos(userCode) {
  try {
    const files = fs.readdirSync(COMBOS_DIR).filter(f => f.endsWith('.json'));
    const combos = [];
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(COMBOS_DIR, file), 'utf8'));
        if (data.userCode === userCode) {
          combos.push(data);
        }
      } catch (e) { /* skip corrupt */ }
    }
    return combos.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  } catch (e) {
    return [];
  }
}

/**
 * 获取单个 Combo
 */
function getCombo(comboId, userCode) {
  const filePath = path.join(COMBOS_DIR, `${comboId}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (data.userCode !== userCode) return null;
    return data;
  } catch (e) {
    return null;
  }
}

/**
 * 创建或更新 Combo
 */
function saveCombo(options) {
  const { comboId, userCode, name, description, steps, layout, icon, tags } = options;

  // 验证
  if (!name || !name.trim()) return { success: false, error: '请输入工作流名称' };
  if (!steps || !Array.isArray(steps) || steps.length === 0) return { success: false, error: '至少需要一个步骤' };
  if (steps.length > 10) return { success: false, error: '步骤数量不能超过 10 个' };

  // 验证每个步骤
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step.prompt || !step.prompt.trim()) {
      return { success: false, error: `步骤 ${i + 1} 缺少提示词` };
    }
    step.order = i + 1;
  }

  const now = new Date().toISOString();
  const id = comboId || `combo-${userCode}-${Date.now()}`;
  const isUpdate = !!comboId;

  // 如果是更新，检查权限
  if (isUpdate) {
    const existing = getCombo(comboId, userCode);
    if (!existing) return { success: false, error: '工作流不存在或无权修改' };
  }

  const combo = {
    id,
    userCode,
    name: name.trim().substring(0, 50),
    description: (description || '').trim().substring(0, 200),
    steps: steps.map((s, i) => ({
      order: i + 1,
      skillId: s.skillId || null,
      skillName: s.skillName || '',
      prompt: s.prompt.trim().substring(0, 2000),
      agentId: s.agentId || null,
      agentName: s.agentName || ''
    })),
    layout: layout || 'preview-chat',
    icon: icon || 'icon-workflow',
    tags: Array.isArray(tags) ? tags.slice(0, 5) : [],
    createdAt: isUpdate ? (getCombo(comboId, userCode) || {}).createdAt || now : now,
    updatedAt: now
  };

  fs.writeFileSync(
    path.join(COMBOS_DIR, `${id}.json`),
    JSON.stringify(combo, null, 2),
    'utf8'
  );

  console.log(`[ComboSkills] ${isUpdate ? 'Updated' : 'Created'}: ${id} (${combo.name})`);
  return { success: true, combo };
}

/**
 * 删除 Combo
 */
function deleteCombo(comboId, userCode) {
  const filePath = path.join(COMBOS_DIR, `${comboId}.json`);
  if (!fs.existsSync(filePath)) return { success: false, error: '工作流不存在' };

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (data.userCode !== userCode) return { success: false, error: '无权删除' };
    fs.unlinkSync(filePath);
    console.log(`[ComboSkills] Deleted: ${comboId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 处理 Combo Skills HTTP 路由
 */
function handleComboRoutes(req, res, url, body, getUserCode, isAuthenticated) {
  // GET /api/combos — 列表
  if (url.pathname === '/api/combos' && req.method === 'GET') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '未登录' }));
      return true;
    }
    const userCode = getUserCode(req);
    const combos = listCombos(userCode);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, combos }));
    return true;
  }

  // POST /api/combos — 创建/更新
  if (url.pathname === '/api/combos' && req.method === 'POST') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '未登录' }));
      return true;
    }
    const userCode = getUserCode(req);
    const result = saveCombo({
      comboId: body.comboId || null,
      userCode,
      name: body.name,
      description: body.description,
      steps: body.steps,
      layout: body.layout,
      icon: body.icon,
      tags: body.tags
    });
    res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return true;
  }

  // POST /api/combos/delete — 删除
  if (url.pathname === '/api/combos/delete' && req.method === 'POST') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '未登录' }));
      return true;
    }
    const userCode = getUserCode(req);
    const result = deleteCombo(body.comboId, userCode);
    res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return true;
  }

  // GET /api/combos/:id — 获取单个
  if (url.pathname.startsWith('/api/combos/') && req.method === 'GET' && url.pathname !== '/api/combos/delete') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '未登录' }));
      return true;
    }
    const userCode = getUserCode(req);
    const comboId = url.pathname.split('/').pop();
    const combo = getCombo(comboId, userCode);
    if (!combo) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '工作流不存在' }));
      return true;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, combo }));
    return true;
  }

  return false; // not handled
}

module.exports = { listCombos, getCombo, saveCombo, deleteCombo, handleComboRoutes };
