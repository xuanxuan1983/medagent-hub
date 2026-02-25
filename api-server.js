#!/usr/bin/env node

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3002;
const ADMIN_CODE = process.env.ADMIN_CODE || 'admin2026';
const COOKIE_NAME = 'medagent_auth';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

// Data directory: use DATA_DIR env var for persistent storage (e.g. Railway volumes)
const DATA_DIR = process.env.DATA_DIR || __dirname;
const CODES_FILE = path.join(DATA_DIR, 'invite-codes.json');
const USAGE_FILE = path.join(DATA_DIR, 'invite-usage.json');
const USAGE_LIMITS_FILE = path.join(DATA_DIR, 'invite-usage-limits.json');
const MAX_USES_PER_CODE = parseInt(process.env.MAX_USES_PER_CODE || '5'); // 默认每个邀请码最大使用次数

function loadCodes() {
  try {
    if (fs.existsSync(CODES_FILE)) return JSON.parse(fs.readFileSync(CODES_FILE, 'utf8'));
  } catch {}
  // Default seed
  const defaults = { 'medagent2026': '默认用户' };
  fs.writeFileSync(CODES_FILE, JSON.stringify(defaults, null, 2));
  return defaults;
}

function saveCodes(map) {
  fs.writeFileSync(CODES_FILE, JSON.stringify(map, null, 2));
}

// Invite code usage tracking
function loadUsage() {
  try {
    if (fs.existsSync(USAGE_FILE)) return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
  } catch {}
  return {};
}

function saveUsage(usage) {
  fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
}

function loadUsageLimits() {
  try {
    if (fs.existsSync(USAGE_LIMITS_FILE)) return JSON.parse(fs.readFileSync(USAGE_LIMITS_FILE, 'utf8'));
  } catch {}
  return {};
}

function saveUsageLimits(limits) {
  fs.writeFileSync(USAGE_LIMITS_FILE, JSON.stringify(limits, null, 2));
}

function getCodeMaxUses(code) {
  const limits = loadUsageLimits();
  // For default codes (medagent2026, xuanyi2026), use default limit
  if (limits[code]) return limits[code];
  // For dynamically generated codes without explicit limit, default to 1 (single-use)
  const codes = loadCodes();
  if (code in codes && code.startsWith('ma')) return 1; // Single-use for generated codes
  return MAX_USES_PER_CODE; // Default for legacy codes
}

function getCodeUsage(code) {
  const usage = loadUsage();
  return usage[code] || 0;
}

function incrementCodeUsage(code) {
  const usage = loadUsage();
  usage[code] = (usage[code] || 0) + 1;
  saveUsage(usage);
  return usage[code];
}

function isCodeAvailable(code) {
  const codes = loadCodes();
  if (!(code in codes)) return false;
  const usage = getCodeUsage(code);
  const maxUses = getCodeMaxUses(code);
  return usage < maxUses;
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map(c => c.trim().split('=').map(decodeURIComponent)));
}

function isAuthenticated(req) {
  const cookies = parseCookies(req);
  const code = cookies[COOKIE_NAME];
  const codes = loadCodes();
  
  // Check if code exists
  if (!(code in codes)) return false;
  
  // Admin code always valid
  if (code === ADMIN_CODE) return true;
  
  // Check usage limit (only for non-admin)
  return isCodeAvailable(code);
}

function getUserName(req) {
  const cookies = parseCookies(req);
  const codes = loadCodes();
  return codes[cookies[COOKIE_NAME]] || '未知用户';
}

function isAdmin(req) {
  const cookies = parseCookies(req);
  return cookies[COOKIE_NAME] === ADMIN_CODE;
}

// AI Provider configuration
const AI_PROVIDER = process.env.AI_PROVIDER || 'gemini'; // gemini, kimi, deepseek, anthropic

// Load skill prompts
const skillsDir = path.join(__dirname, 'skills');

function loadSkillPrompt(skillName) {
  const skillPath = path.join(skillsDir, `${skillName}.md`);
  try {
    const content = fs.readFileSync(skillPath, 'utf8');
    // Remove YAML frontmatter
    const withoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '');
    return withoutFrontmatter;
  } catch (error) {
    console.error(`Error loading skill ${skillName}:`, error.message);
    return null;
  }
}

// Agent ID to skill name mapping
const agentSkillMap = {
  'gtm-strategy': 'gtm-strategist',
  'product-expert': 'product-strategist',
  'academic-liaison': 'medical-liaison',
  'marketing-director': 'marketing-director',
  'sales-director': 'sales-director',
  'operations-director': 'sfe-director',
  'training-director': 'medaesthetic-hub',
  'aesthetic-design': 'aesthetic-designer',
  'senior-consultant': 'senior-consultant',
  'sparring-robot': 'sparring-partner',
  'post-op-guardian': 'postop-specialist',
  'trend-setter': 'new-media-director',
  'anatomy-architect': 'medaesthetic-hub',
  'materials-mentor': 'product-strategist',
  'visual-translator': 'creative-director',
  'material-architect': 'material-architect',
  'area-manager': 'area-manager',
  'channel-manager': 'channel-manager',
  'finance-bp': 'finance-bp',
  'hrbp': 'hrbp',
  'procurement-manager': 'procurement-manager'
};

const agentNames = {
  'gtm-strategy': 'GTM战略大师',
  'product-expert': '产品材料专家',
  'academic-liaison': '学术推广专家',
  'marketing-director': '市场创意总监',
  'sales-director': '销售作战总监',
  'operations-director': '运营效能总监',
  'training-director': '培训赋能总监',
  'aesthetic-design': '高定美学设计总监',
  'senior-consultant': '金牌医美咨询师',
  'sparring-robot': '医美实战陪练机器人',
  'post-op-guardian': '医美术后私域管家',
  'trend-setter': '医美爆款种草官',
  'anatomy-architect': '医美解剖决策建筑师',
  'materials-mentor': '医美材料学硬核导师',
  'visual-translator': '医美视觉通译官',
  'material-architect': '医美材料学架构师',
  'area-manager': '大区经理',
  'channel-manager': '商务经理',
  'finance-bp': '财务BP',
  'hrbp': '战略HRBP',
  'procurement-manager': '采购经理'
};

// Store conversation sessions
const sessions = new Map();

// AI Provider adapters
class GeminiProvider {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.baseUrl = 'generativelanguage.googleapis.com';
  }

  async chat(systemPrompt, messages) {
    const contents = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const requestBody = JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: contents
    });

    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseUrl,
        path: `/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${this.apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (res.statusCode !== 200) {
              reject(new Error(response.error?.message || 'Gemini API error'));
              return;
            }
            resolve({
              message: response.candidates[0].content.parts[0].text,
              usage: {
                input_tokens: response.usageMetadata?.promptTokenCount || 0,
                output_tokens: response.usageMetadata?.candidatesTokenCount || 0
              }
            });
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => reject(error));
      req.write(requestBody);
      req.end();
    });
  }
}

class KimiProvider {
  constructor() {
    this.apiKey = process.env.KIMI_API_KEY;
    this.baseUrl = 'https://api.moonshot.cn/v1';
  }

  async chat(systemPrompt, messages) {
    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'moonshot-v1-8k',
        messages: formattedMessages,
        temperature: 0.7
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Kimi API error');
    }

    return {
      message: data.choices[0].message.content,
      usage: {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens
      }
    };
  }
}

class DeepSeekProvider {
  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY;
    this.baseUrl = 'https://api.deepseek.com/v1';
  }

  async chat(systemPrompt, messages) {
    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: formattedMessages,
        temperature: 0.7,
        max_tokens: 800
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'DeepSeek API error');
    }

    return {
      message: data.choices[0].message.content,
      usage: {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens
      }
    };
  }
}

class AnthropicProvider {
  constructor() {
    const Anthropic = require('@anthropic-ai/sdk');
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  async chat(systemPrompt, messages) {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages
    });

    return {
      message: response.content[0].text,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens
      }
    };
  }
}

// Initialize AI provider
let aiProvider;
try {
  switch (AI_PROVIDER.toLowerCase()) {
    case 'gemini':
      aiProvider = new GeminiProvider();
      break;
    case 'kimi':
      aiProvider = new KimiProvider();
      break;
    case 'deepseek':
      aiProvider = new DeepSeekProvider();
      break;
    case 'anthropic':
      aiProvider = new AnthropicProvider();
      break;
    default:
      console.warn(`Unknown AI provider: ${AI_PROVIDER}, defaulting to Gemini`);
      aiProvider = new GeminiProvider();
  }
  console.log(`✅ Using AI Provider: ${AI_PROVIDER.toUpperCase()}`);
} catch (error) {
  console.error('Failed to initialize AI provider:', error.message);
  process.exit(1);
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      port: PORT,
      provider: AI_PROVIDER
    }));
    return;
  }

  // Login
  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const { code } = await parseRequestBody(req);
      const codes = loadCodes();
      
      // Check if code exists
      if (!(code in codes) && code !== ADMIN_CODE) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '邀请码无效' }));
        return;
      }
      
      // Check usage limit (skip for admin)
      if (code !== ADMIN_CODE && !isCodeAvailable(code)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `邀请码已达使用上限（${MAX_USES_PER_CODE}人）` }));
        return;
      }
      
      // Increment usage count (skip for admin)
      if (code !== ADMIN_CODE) {
        const currentUsage = incrementCodeUsage(code);
        const maxUses = getCodeMaxUses(code);
        console.log(`📝 邀请码 ${code} 使用次数: ${currentUsage}/${maxUses}`);
      }
      
      res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(code)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, isAdmin: code === ADMIN_CODE }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // Initialize chat session
  if (url.pathname === '/api/chat/init' && req.method === 'POST') {
    try {
      if (!isAuthenticated(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      const { agentId } = await parseRequestBody(req);

      if (!agentId || !agentSkillMap[agentId]) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid agent ID' }));
        return;
      }

      const skillName = agentSkillMap[agentId];
      const systemPrompt = loadSkillPrompt(skillName);

      if (!systemPrompt) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to load agent prompt' }));
        return;
      }

      const sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
      sessions.set(sessionId, {
        agentId,
        agentName: agentNames[agentId],
        userName: getUserName(req),
        systemPrompt,
        messages: []
      });

      console.log(`[USAGE] ${new Date().toISOString()} agent=${agentId}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        sessionId,
        agentName: agentNames[agentId],
        provider: AI_PROVIDER
      }));
    } catch (error) {
      console.error('Error initializing chat:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // Send message
  if (url.pathname === '/api/chat/message' && req.method === 'POST') {
    try {
      if (!isAuthenticated(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      const { sessionId, message } = await parseRequestBody(req);

      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid session ID' }));
        return;
      }

      const session = sessions.get(sessionId);
      session.messages.push({
        role: 'user',
        content: message
      });

      console.log(`💬 [${session.agentName}] User: ${message.substring(0, 50)}...`);

      // Call AI provider
      const response = await aiProvider.chat(session.systemPrompt, session.messages);

      session.messages.push({
        role: 'assistant',
        content: response.message
      });

      // Log conversation turn for future fine-tuning
      const logEntry = JSON.stringify({
        ts: new Date().toISOString(),
        agent: session.agentId,
        user_name: session.userName,
        user: message,
        assistant: response.message,
        feedback: null
      });
      const logLine = logEntry + '\n';
      fs.appendFile(path.join(DATA_DIR, 'conversations.jsonl'), logLine, () => {});

      console.log(`🤖 [${session.agentName}] Response: ${response.message.substring(0, 50)}...`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: response.message,
        usage: response.usage
      }));
    } catch (error) {
      console.error('Error sending message:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to get response',
        details: error.message
      }));
    }
    return;
  }

  // Check invite code usage (public endpoint)
  if (url.pathname === '/api/auth/code-status' && req.method === 'GET') {
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing code parameter' }));
      return;
    }
    
    const codes = loadCodes();
    const usage = getCodeUsage(code);
    const maxUses = code === ADMIN_CODE ? '无限制' : getCodeMaxUses(code);
    const available = code === ADMIN_CODE ? true : isCodeAvailable(code);
    const remaining = code === ADMIN_CODE ? '无限制' : Math.max(0, maxUses - usage);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      code,
      exists: code in codes || code === ADMIN_CODE,
      usage,
      maxUses,
      available,
      remaining
    }));
    return;
  }

  // Get conversation history
  if (url.pathname === '/api/chat/history' && req.method === 'GET') {
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId || !sessions.has(sessionId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid session ID' }));
      return;
    }

    const session = sessions.get(sessionId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      agentName: session.agentName,
      messages: session.messages
    }));
    return;
  }

  // Submit feedback (thumbs up/down)
  if (url.pathname === '/api/feedback' && req.method === 'POST') {
    try {
      if (!isAuthenticated(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      const { sessionId, messageIndex, feedback } = await parseRequestBody(req);
      if (!['up', 'down'].includes(feedback)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid feedback value' }));
        return;
      }
      const session = sessions.get(sessionId);
      const agentId = session ? session.agentId : 'unknown';
      const userName = session ? session.userName : getUserName(req);
      const feedbackEntry = JSON.stringify({
        ts: new Date().toISOString(),
        type: 'feedback',
        agent: agentId,
        user_name: userName,
        message_index: messageIndex,
        feedback
      });
      fs.appendFile(path.join(DATA_DIR, 'conversations.jsonl'), feedbackEntry + '\n', () => {});
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // Admin: list users with usage stats
  if (url.pathname === '/api/admin/users' && req.method === 'GET') {
    if (!isAdmin(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }
    const codes = loadCodes();
    const usage = loadUsage();
    const users = Object.entries(codes).map(([code, name]) => {
      const maxUses = getCodeMaxUses(code);
      const used = usage[code] || 0;
      return {
        code,
        name,
        usage: used,
        maxUses,
        remaining: Math.max(0, maxUses - used)
      };
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(users));
    return;
  }

  // Admin: create invite code
  if (url.pathname === '/api/admin/codes' && req.method === 'POST') {
    if (!isAdmin(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }
    try {
      const { name, maxUses } = await parseRequestBody(req);
      if (!name || !name.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '请填写用户名' }));
        return;
      }
      const code = 'ma' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const codes = loadCodes();
      codes[code] = name.trim();
      saveCodes(codes);
      
      // Set custom max uses for this code (default to 1 for single-use codes)
      const codeMaxUses = maxUses ? parseInt(maxUses) : 1;
      const usageLimits = loadUsageLimits();
      usageLimits[code] = codeMaxUses;
      saveUsageLimits(usageLimits);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code, name: name.trim(), maxUses: codeMaxUses }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Admin: delete invite code
  if (url.pathname.startsWith('/api/admin/codes/') && req.method === 'DELETE') {
    if (!isAdmin(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }
    const code = decodeURIComponent(url.pathname.replace('/api/admin/codes/', ''));
    const codes = loadCodes();
    if (!(code in codes)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '邀请码不存在' }));
      return;
    }
    delete codes[code];
    saveCodes(codes);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Admin: get stats from conversations.jsonl
  if (url.pathname === '/api/admin/stats' && req.method === 'GET') {
    if (!isAdmin(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }
    try {
      const logPath = path.join(DATA_DIR, 'conversations.jsonl');
      const lines = fs.existsSync(logPath)
        ? fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean)
        : [];
      const agentCounts = {};
      const userCounts = {};
      const feedbackCounts = { up: 0, down: 0 };
      const recentConvs = [];
      lines.forEach(line => {
        try {
          const entry = JSON.parse(line);
          if (entry.type === 'feedback') {
            feedbackCounts[entry.feedback] = (feedbackCounts[entry.feedback] || 0) + 1;
          } else {
            agentCounts[entry.agent] = (agentCounts[entry.agent] || 0) + 1;
            userCounts[entry.user_name || '未知'] = (userCounts[entry.user_name || '未知'] || 0) + 1;
            if (recentConvs.length < 50) recentConvs.push(entry);
          }
        } catch {}
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ agentCounts, userCounts, feedbackCounts, totalTurns: lines.length, recentConvs }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Admin: download conversations.jsonl
  if (url.pathname === '/api/admin/export' && req.method === 'GET') {
    if (!isAdmin(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }
    const logPath = path.join(DATA_DIR, 'conversations.jsonl');
    if (!fs.existsSync(logPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No data yet' }));
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Content-Disposition': `attachment; filename="conversations-${new Date().toISOString().slice(0,10)}.jsonl"`
    });
    fs.createReadStream(logPath).pipe(res);
    return;
  }

  // Serve static files
  const staticDir = path.join(__dirname);
  let filePath = path.join(staticDir, url.pathname === '/' ? 'index.html' : url.pathname);
  const ext = path.extname(filePath);
  const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
  const contentType = mimeTypes[ext] || 'text/plain';
  const protectedPages = ['chat.html'];
  const adminPages = ['admin.html'];
  const requestedFile = path.basename(filePath);
  if (adminPages.includes(requestedFile) && !isAdmin(req)) {
    res.writeHead(302, { Location: '/login.html' });
    res.end();
    return;
  }
  if (protectedPages.includes(requestedFile) && !isAuthenticated(req)) {
    res.writeHead(302, { Location: '/login.html' });
    res.end();
    return;
  }
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`🎯 MedAgent API Server running on http://localhost:${PORT}`);
  console.log(`🤖 AI Provider: ${AI_PROVIDER.toUpperCase()}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   - POST /api/auth/login      - Login with invite code`);
  console.log(`   - GET  /api/auth/code-status - Check invite code usage`);
  console.log(`   - POST /api/chat/init       - Initialize chat session`);
  console.log(`   - POST /api/chat/message    - Send message`);
  console.log(`   - GET  /api/chat/history    - Get conversation history`);
  console.log(`   - GET  /health              - Health check`);
  console.log(`\n🔑 Invite Code Limit: ${MAX_USES_PER_CODE} uses per code`);
  console.log(`\n✨ Ready to serve medical aesthetics agents!`);
  console.log(`\n⚠️  Required API Key: ${AI_PROVIDER.toUpperCase()}_API_KEY`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down MedAgent API Server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
