/**
 * P3: 隐性知识显性化 - 后端 API
 * 记录用户编辑修改历史，提炼写作风格偏好
 */

const fs = require('fs');
const path = require('path');

const PREFS_DIR = path.join(__dirname, '..', 'data', 'user-prefs');

// 确保目录存在
function ensureDir() {
  if (!fs.existsSync(PREFS_DIR)) {
    fs.mkdirSync(PREFS_DIR, { recursive: true });
  }
}

function getUserPrefsPath(userCode) {
  return path.join(PREFS_DIR, `${userCode}.json`);
}

function loadUserPrefs(userCode) {
  ensureDir();
  const filePath = getUserPrefsPath(userCode);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch(e) {
      return createDefaultPrefs();
    }
  }
  return createDefaultPrefs();
}

function saveUserPrefs(userCode, prefs) {
  ensureDir();
  const filePath = getUserPrefsPath(userCode);
  fs.writeFileSync(filePath, JSON.stringify(prefs, null, 2), 'utf8');
}

function createDefaultPrefs() {
  return {
    editHistory: [],         // 编辑历史记录
    styleProfile: {          // 风格画像
      tonePreference: null,  // 语气偏好：formal/casual/warm
      lengthPreference: null,// 长度偏好：concise/moderate/detailed
      structurePreference: null, // 结构偏好：list/paragraph/mixed
      vocabularyLevel: null, // 用词水平：simple/professional/academic
      commonPhrases: [],     // 常用短语
      avoidedPhrases: [],    // 避免的表述
      industryTerms: []      // 行业术语偏好
    },
    writingTemplates: [],    // 用户自定义写作模板
    feedbackHistory: [],     // Agent 输出的反馈记录
    lastUpdated: null
  };
}

// 处理路由
function handleUserPrefsRoutes(req, res, url, method, getUserCode, isAuthenticated, parseRequestBody) {
  const pathname = url.pathname;

  // 获取用户偏好
  if (pathname === '/api/user-prefs' && method === 'GET') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '未授权' }));
      return true;
    }

    const userCode = getUserCode(req);
    const prefs = loadUserPrefs(userCode);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: prefs }));
    return true;
  }

  // 记录编辑历史
  if (pathname === '/api/user-prefs/edit-record' && method === 'POST') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '未授权' }));
      return true;
    }

    parseRequestBody(req, (body) => {
      try {
        const userCode = getUserCode(req);
        const prefs = loadUserPrefs(userCode);

        const record = {
          id: Date.now().toString(36),
          timestamp: new Date().toISOString(),
          type: body.type || 'edit',           // edit/rewrite/delete/add
          originalText: (body.originalText || '').substring(0, 500),
          modifiedText: (body.modifiedText || '').substring(0, 500),
          context: (body.context || '').substring(0, 200),
          agentId: body.agentId || null
        };

        prefs.editHistory.push(record);

        // 保留最近200条
        if (prefs.editHistory.length > 200) {
          prefs.editHistory = prefs.editHistory.slice(-200);
        }

        // 自动分析风格
        analyzeStyle(prefs);

        prefs.lastUpdated = new Date().toISOString();
        saveUserPrefs(userCode, prefs);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, styleProfile: prefs.styleProfile }));
      } catch(e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return true;
  }

  // 保存反馈（用户对 Agent 输出的修改反馈）
  if (pathname === '/api/user-prefs/feedback' && method === 'POST') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '未授权' }));
      return true;
    }

    parseRequestBody(req, (body) => {
      try {
        const userCode = getUserCode(req);
        const prefs = loadUserPrefs(userCode);

        const feedback = {
          id: Date.now().toString(36),
          timestamp: new Date().toISOString(),
          agentOutput: (body.agentOutput || '').substring(0, 1000),
          userModified: (body.userModified || '').substring(0, 1000),
          feedbackType: body.feedbackType || 'modify', // like/dislike/modify
          tags: body.tags || []
        };

        prefs.feedbackHistory.push(feedback);

        // 保留最近100条
        if (prefs.feedbackHistory.length > 100) {
          prefs.feedbackHistory = prefs.feedbackHistory.slice(-100);
        }

        prefs.lastUpdated = new Date().toISOString();
        saveUserPrefs(userCode, prefs);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch(e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return true;
  }

  // 保存写作模板
  if (pathname === '/api/user-prefs/template' && method === 'POST') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '未授权' }));
      return true;
    }

    parseRequestBody(req, (body) => {
      try {
        const userCode = getUserCode(req);
        const prefs = loadUserPrefs(userCode);

        const template = {
          id: Date.now().toString(36),
          name: body.name || '未命名模板',
          content: body.content || '',
          category: body.category || 'general',
          createdAt: new Date().toISOString()
        };

        prefs.writingTemplates.push(template);

        // 最多50个模板
        if (prefs.writingTemplates.length > 50) {
          prefs.writingTemplates = prefs.writingTemplates.slice(-50);
        }

        prefs.lastUpdated = new Date().toISOString();
        saveUserPrefs(userCode, prefs);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, template }));
      } catch(e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return true;
  }

  // 删除写作模板
  if (pathname === '/api/user-prefs/template/delete' && method === 'POST') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '未授权' }));
      return true;
    }

    parseRequestBody(req, (body) => {
      try {
        const userCode = getUserCode(req);
        const prefs = loadUserPrefs(userCode);

        prefs.writingTemplates = prefs.writingTemplates.filter(t => t.id !== body.templateId);

        prefs.lastUpdated = new Date().toISOString();
        saveUserPrefs(userCode, prefs);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch(e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return true;
  }

  // 获取风格摘要（供 Agent system prompt 使用）
  if (pathname === '/api/user-prefs/style-summary' && method === 'GET') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '未授权' }));
      return true;
    }

    const userCode = getUserCode(req);
    const prefs = loadUserPrefs(userCode);
    const summary = generateStyleSummary(prefs);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, summary }));
    return true;
  }

  return false;
}

// 自动分析风格偏好
function analyzeStyle(prefs) {
  if (prefs.editHistory.length < 5) return; // 至少5条记录才分析

  const recentEdits = prefs.editHistory.slice(-50);
  const profile = prefs.styleProfile;

  // 分析语气偏好
  let formalCount = 0, casualCount = 0, warmCount = 0;
  const formalWords = ['您', '贵', '敬请', '恳请', '特此', '兹', '鉴于'];
  const casualWords = ['哈', '呢', '啦', '嘛', '吧', '哦', '呀'];
  const warmWords = ['亲', '宝', '姐', '小仙女', '美丽', '温柔', '贴心'];

  recentEdits.forEach(edit => {
    const text = edit.modifiedText || '';
    formalWords.forEach(w => { if (text.includes(w)) formalCount++; });
    casualWords.forEach(w => { if (text.includes(w)) casualCount++; });
    warmWords.forEach(w => { if (text.includes(w)) warmCount++; });
  });

  if (formalCount > casualCount && formalCount > warmCount) {
    profile.tonePreference = 'formal';
  } else if (warmCount > casualCount) {
    profile.tonePreference = 'warm';
  } else if (casualCount > 0) {
    profile.tonePreference = 'casual';
  }

  // 分析长度偏好
  const avgLength = recentEdits.reduce((sum, e) => sum + (e.modifiedText || '').length, 0) / recentEdits.length;
  if (avgLength < 100) {
    profile.lengthPreference = 'concise';
  } else if (avgLength < 300) {
    profile.lengthPreference = 'moderate';
  } else {
    profile.lengthPreference = 'detailed';
  }

  // 提取常用短语（出现3次以上的2-4字短语）
  const phraseCount = {};
  recentEdits.forEach(edit => {
    const text = edit.modifiedText || '';
    for (let len = 2; len <= 4; len++) {
      for (let i = 0; i <= text.length - len; i++) {
        const phrase = text.substring(i, i + len);
        if (/^[\u4e00-\u9fa5]+$/.test(phrase)) {
          phraseCount[phrase] = (phraseCount[phrase] || 0) + 1;
        }
      }
    }
  });

  profile.commonPhrases = Object.entries(phraseCount)
    .filter(([_, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([phrase]) => phrase);

  // 分析避免的表述（用户删除的内容中的高频词）
  const deletedPhrases = {};
  recentEdits.filter(e => e.type === 'delete' || e.type === 'rewrite').forEach(edit => {
    const text = edit.originalText || '';
    for (let len = 2; len <= 4; len++) {
      for (let i = 0; i <= text.length - len; i++) {
        const phrase = text.substring(i, i + len);
        if (/^[\u4e00-\u9fa5]+$/.test(phrase)) {
          deletedPhrases[phrase] = (deletedPhrases[phrase] || 0) + 1;
        }
      }
    }
  });

  profile.avoidedPhrases = Object.entries(deletedPhrases)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase]) => phrase);
}

// 生成风格摘要（可注入 Agent system prompt）
function generateStyleSummary(prefs) {
  const profile = prefs.styleProfile;
  const parts = [];

  if (profile.tonePreference) {
    const toneMap = { formal: '正式专业', casual: '轻松口语化', warm: '温暖亲切' };
    parts.push('语气风格：' + (toneMap[profile.tonePreference] || profile.tonePreference));
  }

  if (profile.lengthPreference) {
    const lenMap = { concise: '简洁精炼', moderate: '适中', detailed: '详细充分' };
    parts.push('内容长度偏好：' + (lenMap[profile.lengthPreference] || profile.lengthPreference));
  }

  if (profile.commonPhrases && profile.commonPhrases.length > 0) {
    parts.push('常用表述：' + profile.commonPhrases.slice(0, 10).join('、'));
  }

  if (profile.avoidedPhrases && profile.avoidedPhrases.length > 0) {
    parts.push('避免使用：' + profile.avoidedPhrases.slice(0, 5).join('、'));
  }

  if (prefs.writingTemplates && prefs.writingTemplates.length > 0) {
    parts.push('已保存 ' + prefs.writingTemplates.length + ' 个写作模板');
  }

  parts.push('编辑记录数：' + (prefs.editHistory || []).length);

  return parts.join('；');
}

module.exports = { handleUserPrefsRoutes };
