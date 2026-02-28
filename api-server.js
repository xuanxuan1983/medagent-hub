#!/usr/bin/env node

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3002;
const ADMIN_CODE = process.env.ADMIN_CODE || 'admin2026';
const COOKIE_NAME = 'medagent_auth';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

const DATA_DIR = process.env.DATA_DIR || __dirname;

// ===== SQLite Database =====
const DB_PATH = path.join(DATA_DIR, 'medagent.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    user_code TEXT NOT NULL,
    user_name TEXT,
    agent_id TEXT NOT NULL,
    agent_name TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON chat_sessions(user_code);
  CREATE INDEX IF NOT EXISTS idx_sessions_agent ON chat_sessions(agent_id);
  CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id);
`);
console.log('\u2705 SQLite \u6570\u636e\u5e93\u521d\u59cb\u5316\u6210\u529f:', DB_PATH);

// Prepared statements for performance
const stmtInsertSession = db.prepare('INSERT INTO chat_sessions (id, user_code, user_name, agent_id, agent_name) VALUES (?, ?, ?, ?, ?)');
const stmtInsertMessage = db.prepare('INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)');
const stmtUpdateSessionTime = db.prepare("UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?");
const stmtGetUserSessions = db.prepare('SELECT id, agent_id, agent_name, created_at, updated_at FROM chat_sessions WHERE user_code = ? ORDER BY updated_at DESC LIMIT 50');
const stmtGetSessionMessages = db.prepare('SELECT role, content, created_at FROM chat_messages WHERE session_id = ? ORDER BY id ASC');
const stmtGetSessionById = db.prepare('SELECT * FROM chat_sessions WHERE id = ?');
const stmtGetSessionPreview = db.prepare('SELECT content FROM chat_messages WHERE session_id = ? AND role = ? ORDER BY id ASC LIMIT 1');
const CODES_FILE = path.join(DATA_DIR, 'invite-codes.json');
const USAGE_FILE = path.join(DATA_DIR, 'invite-usage.json');
const USAGE_LIMITS_FILE = path.join(DATA_DIR, 'invite-usage-limits.json');
const PROFILES_FILE = path.join(DATA_DIR, 'user-profiles.json');
const MAX_USES_PER_CODE = parseInt(process.env.MAX_USES_PER_CODE || '5');

function loadProfiles() {
  try {
    if (fs.existsSync(PROFILES_FILE)) return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
  } catch {}
  return {};
}

function saveProfiles(profiles) {
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2));
}

function loadCodes() {
  try {
    if (fs.existsSync(CODES_FILE)) return JSON.parse(fs.readFileSync(CODES_FILE, 'utf8'));
  } catch {}
  const defaults = { 'medagent2026': '默认用户' };
  fs.writeFileSync(CODES_FILE, JSON.stringify(defaults, null, 2));
  return defaults;
}

function saveCodes(map) {
  fs.writeFileSync(CODES_FILE, JSON.stringify(map, null, 2));
}

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
  // Admin code is always authenticated
  if (code === ADMIN_CODE) return true;
  const codes = loadCodes();
  // Only check if code exists, not usage count (usage is checked at login time)
  return code in codes;
}

function getUserName(req) {
  const cookies = parseCookies(req);
  const codes = loadCodes();
  return codes[cookies[COOKIE_NAME]] || '未知用户';
}

function getUserCode(req) {
  const cookies = parseCookies(req);
  return cookies[COOKIE_NAME] || '';
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

// 微信支付初始化
let wechatPay = null;
try {
  const WechatPay = require('wechatpay-node-v3');
  const certPath = path.join(__dirname, 'wechat_cert', 'apiclient_cert.pem');
  const keyPath = path.join(__dirname, 'wechat_cert', 'apiclient_key.pem');
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    wechatPay = new WechatPay({
      appid: 'wx10951656e9a582db',
      mchid: '1684977594',
      publicKey: fs.readFileSync(certPath),
      privateKey: fs.readFileSync(keyPath),
    });
    console.log('✅ 微信支付初始化成功');
  } else {
    console.warn('⚠️  微信支付证书文件不存在，支付功能不可用');
  }
} catch (e) {
  console.error('❌ 微信支付初始化失败:', e.message);
}

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

class SiliconFlowProvider {
  constructor() {
    this.apiKey = process.env.SILICONFLOW_API_KEY;
    this.baseUrl = 'https://api.siliconflow.cn/v1';
    this.model = process.env.SILICONFLOW_MODEL || 'deepseek-ai/DeepSeek-V3';
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
        model: this.model,
        messages: formattedMessages,
        temperature: 0.7,
        max_tokens: 800
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'SiliconFlow API error');
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

// Medical aesthetics image prompt templates
const MEDAESTHETIC_IMAGE_PROMPTS = {
  skin_rejuvenation: {
    label: '皮肤焕活',
    prompt: 'Ultra-close macro photograph of flawless porcelain skin texture, luminous glow, visible collagen structure, soft diffused studio lighting, clinical beauty photography, 8K resolution, pristine white background, hyper-realistic skin detail, dewy moisture, professional medical aesthetics editorial style'
  },
  clinic_environment: {
    label: '高端诊所',
    prompt: 'Luxury medical aesthetics clinic interior, minimalist white and gold design, soft warm lighting, sterile yet elegant atmosphere, modern treatment room, premium medical equipment, fresh flowers, marble surfaces, professional healthcare environment, architectural photography, wide angle, 8K'
  },
  doctor_portrait: {
    label: '医生形象',
    prompt: 'Professional female doctor in pristine white coat, confident warm smile, modern clinic background softly blurred, natural window light, clean medical aesthetics environment, trust and expertise, editorial portrait photography, shallow depth of field, 85mm lens, 8K resolution'
  },
  xiaohongshu_beauty: {
    label: '小红书美容',
    prompt: 'Elegant Asian woman in her 30s, radiant glowing skin, minimal makeup, soft pink and white aesthetic, holding luxury skincare product, natural soft light, lifestyle beauty photography, clean background, warm tones, Instagram-worthy composition, vertical format, 4K'
  },
  collagen_science: {
    label: '胶原蛋白科普',
    prompt: 'Scientific visualization of collagen fiber network under skin, biophotonic microscopy style, glowing blue and gold collagen strands, cellular regeneration, medical illustration aesthetic, dark background with luminous fibers, educational infographic style, ultra-detailed, 8K'
  },
  before_after_concept: {
    label: '焕肤概念',
    prompt: 'Split concept image showing skin transformation, left side dull tired skin texture, right side radiant luminous rejuvenated skin, clinical comparison photography, neutral grey background, professional medical aesthetics documentation style, sharp detail, 8K'
  },
  brand_founder: {
    label: '创始人品牌',
    prompt: 'Confident professional Chinese woman entrepreneur in her 40s, sophisticated business attire, modern minimalist office with medical aesthetics branding, natural light from large windows, personal brand photography, warm authoritative presence, editorial style, 85mm portrait lens, 8K'
  },
  product_showcase: {
    label: '产品展示',
    prompt: 'Luxury medical aesthetics product flat lay, premium serum bottles and ampoules, white marble surface, fresh botanicals, soft diffused light, clinical elegance, high-end beauty product photography, overhead shot, pristine composition, 8K resolution'
  }
};

// Image generation via SiliconFlow
async function generateImage(promptKey, customPrompt) {
  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) throw new Error('SILICONFLOW_API_KEY not configured');

  const template = MEDAESTHETIC_IMAGE_PROMPTS[promptKey];
  const finalPrompt = customPrompt
    ? `${template ? template.prompt + ', ' : ''}${customPrompt}`
    : (template ? template.prompt : customPrompt);

  const response = await fetch('https://api.siliconflow.cn/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'black-forest-labs/FLUX.1-dev',
      prompt: finalPrompt,
      image_size: '1024x1024',
      num_inference_steps: 28,
      guidance_scale: 3.5
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Image generation failed');
  return { url: data.images[0].url, prompt: finalPrompt };
}

// Providers config exposed to frontend
const PROVIDERS_CONFIG = {
  international: [
    { id: 'openai',     name: 'OpenAI',              baseUrl: 'https://api.openai.com/v1',                          models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],                                          keyHint: 'sk-...' },
    { id: 'anthropic',  name: 'Anthropic (Claude)',   baseUrl: null,                                                 models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],             keyHint: 'sk-ant-...' },
    { id: 'gemini',     name: 'Google Gemini',        baseUrl: null,                                                 models: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],                    keyHint: 'AIza...' },
  ],
  domestic: [
    { id: 'deepseek',    name: 'DeepSeek',            baseUrl: 'https://api.deepseek.com/v1',                        models: ['deepseek-chat', 'deepseek-reasoner'],                                             keyHint: 'sk-...' },
    { id: 'siliconflow', name: '硅基流动',             baseUrl: 'https://api.siliconflow.cn/v1',                      models: ['deepseek-ai/DeepSeek-V3', 'Pro/deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct'], keyHint: 'sk-...' },
    { id: 'kimi',        name: 'Kimi (月之暗面)',      baseUrl: 'https://api.moonshot.cn/v1',                         models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],                         keyHint: 'sk-...' },
    { id: 'qwen',        name: '通义千问',             baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',  models: ['qwen-max', 'qwen-plus', 'qwen-turbo'],                                            keyHint: 'sk-...' },
  ]
};

// Generic OpenAI-compatible provider
class OpenAICompatibleProvider {
  constructor(baseUrl, apiKey, model) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(systemPrompt, messages) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.7,
        max_tokens: 800
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'API error');
    return {
      message: data.choices[0].message.content,
      usage: { input_tokens: data.usage.prompt_tokens, output_tokens: data.usage.completion_tokens }
    };
  }
}

// Factory: create provider from user-supplied config
function createProviderFromConfig(providerId, apiKey, model) {
  const allProviders = [...PROVIDERS_CONFIG.international, ...PROVIDERS_CONFIG.domestic];
  const config = allProviders.find(p => p.id === providerId);
  if (!config) throw new Error(`Unknown provider: ${providerId}`);

  if (providerId === 'gemini') {
    const p = new GeminiProvider();
    p.apiKey = apiKey;
    return p;
  }

  if (providerId === 'anthropic') {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const resolvedModel = model || 'claude-sonnet-4-6';
    return {
      chat: async (systemPrompt, messages) => {
        const res = await client.messages.create({ model: resolvedModel, max_tokens: 800, system: systemPrompt, messages });
        return { message: res.content[0].text, usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens } };
      }
    };
  }

  return new OpenAICompatibleProvider(config.baseUrl, apiKey, model || config.models[0]);
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
    case 'siliconflow':
      aiProvider = new SiliconFlowProvider();
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

  // Auth status check via cookie
  if (url.pathname === '/api/auth/status' && req.method === 'GET') {
    if (isAuthenticated(req)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ authenticated: true, userName: getUserName(req) }));
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ authenticated: false }));
    }
    return;
  }

  // Login
  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const { code, phone } = await parseRequestBody(req);
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
      
      // Save phone number if provided
      if (phone && code !== ADMIN_CODE) {
        const profiles = loadProfiles();
        if (!profiles[code]) profiles[code] = {};
        profiles[code].phone = phone;
        profiles[code].loginAt = new Date().toISOString();
        saveProfiles(profiles);
        console.log(`📱 邀请码 ${code} 绑定手机号: ${phone}`);
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

  // Get available providers config
  if (url.pathname === '/api/config/providers' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(PROVIDERS_CONFIG));
    return;
  }

  // Get medical aesthetics image prompt templates
  if (url.pathname === '/api/image/prompts' && req.method === 'GET') {
    const templates = Object.entries(MEDAESTHETIC_IMAGE_PROMPTS).map(([key, val]) => ({
      key, label: val.label
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(templates));
    return;
  }

  // Generate medical aesthetics image
  if (url.pathname === '/api/image/generate' && req.method === 'POST') {
    try {
      if (!isAuthenticated(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      const { promptKey, customPrompt } = await parseRequestBody(req);
      if (!promptKey && !customPrompt) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'promptKey or customPrompt required' }));
        return;
      }
      const result = await generateImage(promptKey, customPrompt);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
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
      const userCode = getUserCode(req);
      const userName = getUserName(req);
      sessions.set(sessionId, {
        agentId,
        agentName: agentNames[agentId],
        userName,
        userCode,
        systemPrompt,
        messages: []
      });

      // Save session to SQLite
      try {
        stmtInsertSession.run(sessionId, userCode, userName, agentId, agentNames[agentId] || agentId);
      } catch (dbErr) {
        console.error('DB insert session error:', dbErr.message);
      }

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

      const { sessionId, message, provider: userProvider, apiKey: userApiKey, model: userModel } = await parseRequestBody(req);

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

      // Use user-supplied provider if provided, otherwise fall back to server default
      const activeProvider = (userProvider && userApiKey)
        ? createProviderFromConfig(userProvider, userApiKey, userModel)
        : aiProvider;

      // Call AI provider
      const response = await activeProvider.chat(session.systemPrompt, session.messages);

      session.messages.push({
        role: 'assistant',
        content: response.message
      });

      // Log conversation turn for future fine-tuning
      const logEntry = JSON.stringify({
        ts: new Date().toISOString(),
        agent: session.agentId,
        agent_name: session.agentName,
        user_name: session.userName,
        user: message,
        assistant: response.message,
        feedback: null
      });
      const logLine = logEntry + '\n';
      fs.appendFile(path.join(DATA_DIR, 'conversations.jsonl'), logLine, () => {});

      // Save messages to SQLite
      try {
        stmtInsertMessage.run(sessionId, 'user', message);
        stmtInsertMessage.run(sessionId, 'assistant', response.message);
        stmtUpdateSessionTime.run(sessionId);
      } catch (dbErr) {
        console.error('DB insert message error:', dbErr.message);
      }

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

  // Get conversation history (current session from memory)
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

  // Get user's chat session list (from SQLite)
  if (url.pathname === '/api/chat/sessions' && req.method === 'GET') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const userCode = getUserCode(req);
    const agentFilter = url.searchParams.get('agent') || null;
    try {
      let sessionList;
      if (agentFilter) {
        sessionList = db.prepare('SELECT id, agent_id, agent_name, created_at, updated_at FROM chat_sessions WHERE user_code = ? AND agent_id = ? ORDER BY updated_at DESC LIMIT 50').all(userCode, agentFilter);
      } else {
        sessionList = stmtGetUserSessions.all(userCode);
      }
      // Add first user message as preview
      const result = sessionList.map(s => {
        const preview = stmtGetSessionPreview.get(s.id, 'user');
        return {
          id: s.id,
          agentId: s.agent_id,
          agentName: s.agent_name,
          preview: preview ? preview.content.substring(0, 60) : '',
          createdAt: s.created_at,
          updatedAt: s.updated_at
        };
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessions: result }));
    } catch (dbErr) {
      console.error('DB get sessions error:', dbErr.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database error' }));
    }
    return;
  }

  // Get messages of a specific session (from SQLite)
  if (url.pathname === '/api/chat/session-messages' && req.method === 'GET') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const targetSessionId = url.searchParams.get('sessionId');
    if (!targetSessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing sessionId' }));
      return;
    }
    const userCode = getUserCode(req);
    try {
      const sessionInfo = stmtGetSessionById.get(targetSessionId);
      if (!sessionInfo || sessionInfo.user_code !== userCode) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access denied' }));
        return;
      }
      const messages = stmtGetSessionMessages.all(targetSessionId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        agentId: sessionInfo.agent_id,
        agentName: sessionInfo.agent_name,
        messages: messages.map(m => ({ role: m.role, content: m.content }))
      }));
    } catch (dbErr) {
      console.error('DB get messages error:', dbErr.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database error' }));
    }
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

  // Export Excel
  if (url.pathname === '/api/admin/export-excel' && req.method === 'GET') {
    if (!isAdmin(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'MedAgent Hub';
      workbook.created = new Date();

      // Sheet 1: 用户列表
      const usersSheet = workbook.addWorksheet('用户列表');
      usersSheet.columns = [
        { header: '用户名', key: 'name', width: 16 },
        { header: '邀请码', key: 'code', width: 20 },
        { header: '手机号', key: 'phone', width: 16 },
        { header: '职业身份', key: 'role', width: 20 },
        { header: '已使用次数', key: 'usage', width: 12 },
        { header: '上限次数', key: 'maxUses', width: 12 },
        { header: '剩余次数', key: 'remaining', width: 12 },
        { header: '首次登录时间', key: 'loginAt', width: 22 },
      ];
      usersSheet.getRow(1).font = { bold: true };
      usersSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E5E0' } };

      const codes = loadCodes();
      const usage = loadUsage();
      const usageLimits = loadUsageLimits();
      const profiles = loadProfiles();

      Object.entries(codes).forEach(([code, name]) => {
        const currentUsage = usage[code] || 0;
        const maxUses = usageLimits[code] || MAX_USES_PER_CODE;
        const profile = profiles[code] || {};
        usersSheet.addRow({
          name: name || '',
          code: code,
          phone: profile.phone || '',
          role: profile.role || '',
          usage: currentUsage,
          maxUses: maxUses,
          remaining: Math.max(0, maxUses - currentUsage),
          loginAt: profile.loginAt ? profile.loginAt.replace('T', ' ').slice(0, 19) : '',
        });
      });

      // Sheet 2: 对话记录
      const convSheet = workbook.addWorksheet('对话记录');
      convSheet.columns = [
        { header: '时间', key: 'ts', width: 22 },
        { header: 'Agent ID', key: 'agent', width: 24 },
        { header: 'Agent 名称', key: 'agent_name', width: 20 },
        { header: '用户邀请码', key: 'user_name', width: 20 },
        { header: '用户提问', key: 'user', width: 40 },
        { header: 'Agent 回复', key: 'assistant', width: 50 },
        { header: '反馈', key: 'feedback', width: 8 },
      ];
      convSheet.getRow(1).font = { bold: true };
      convSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E5E0' } };

      const logPath = path.join(DATA_DIR, 'conversations.jsonl');
      if (fs.existsSync(logPath)) {
        const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
        lines.forEach(line => {
          try {
            const entry = JSON.parse(line);
            convSheet.addRow({
              ts: entry.ts ? entry.ts.replace('T', ' ').slice(0, 19) : '',
              agent: entry.agent || entry.agentId || '',
              agent_name: entry.agent_name || agentNames[entry.agent || entry.agentId] || '',
              user_name: entry.user_name || '',
              user: entry.user || '',
              assistant: entry.assistant || '',
              feedback: entry.feedback === 'up' ? '👍' : entry.feedback === 'down' ? '👎' : '',
            });
          } catch {}
        });
      }

      const filename = `MedAgent-数据导出-${new Date().toISOString().slice(0,10)}.xlsx`;
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
      });
      await workbook.xlsx.write(res);
      res.end();
    } catch (e) {
      console.error('Excel export error:', e);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Export failed' }));
      }
    }
    return;
  }

  // ===== CORPUS API =====
  // Corpus stats overview
  if (url.pathname === '/api/admin/corpus/stats' && req.method === 'GET') {
    if (!isAdmin(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }
    const logPath = path.join(DATA_DIR, 'conversations.jsonl');
    let total = 0, labeled = 0, needsReview = 0, agentCounts = {};
    if (fs.existsSync(logPath)) {
      const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
      total = lines.length;
      lines.forEach(line => {
        try {
          const entry = JSON.parse(line);
          const agentId = entry.agentId || 'unknown';
          agentCounts[agentId] = (agentCounts[agentId] || 0) + 1;
          if (entry.feedback === 'up') labeled++;
          if (entry.feedback === 'down') needsReview++;
        } catch {}
      });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ total, labeled, needsReview, agentCounts }));
    return;
  }

  // Corpus list (paginated)
  if (url.pathname === '/api/admin/corpus' && req.method === 'GET') {
    if (!isAdmin(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
    const agentFilter = url.searchParams.get('agent') || '';
    const logPath = path.join(DATA_DIR, 'conversations.jsonl');
    let items = [];
    if (fs.existsSync(logPath)) {
      const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
      lines.forEach((line, idx) => {
        try {
          const entry = JSON.parse(line);
          if (!agentFilter || entry.agentId === agentFilter) {
            items.push({ ...entry, _idx: idx });
          }
        } catch {}
      });
    }
    const total = items.length;
    const start = (page - 1) * pageSize;
    const data = items.slice(start, start + pageSize);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ total, page, pageSize, data }));
    return;
  }

  // Needs analysis (demand analysis from conversations)
  if (url.pathname === '/api/admin/needs' && req.method === 'GET') {
    if (!isAdmin(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }
    const needsPath = path.join(DATA_DIR, 'needs-summary.json');
    if (fs.existsSync(needsPath)) {
      const data = fs.readFileSync(needsPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } else {
      // Generate basic needs analysis from conversations
      const logPath = path.join(DATA_DIR, 'conversations.jsonl');
      const agentFreq = {};
      if (fs.existsSync(logPath)) {
        const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
        lines.forEach(line => {
          try {
            const entry = JSON.parse(line);
            const a = entry.agentId || 'unknown';
            agentFreq[a] = (agentFreq[a] || 0) + 1;
          } catch {}
        });
      }
      const topAgents = Object.entries(agentFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([agentId, count]) => ({ agentId, count }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ topAgents, generatedAt: new Date().toISOString() }));
    }
    return;
  }

  // Export corpus as JSONL
  if (url.pathname === '/api/admin/corpus/export' && req.method === 'GET') {
    if (!isAdmin(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }
    const logPath = path.join(DATA_DIR, 'conversations.jsonl');
    if (!fs.existsSync(logPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No corpus data yet' }));
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Content-Disposition': `attachment; filename="corpus-${new Date().toISOString().slice(0,10)}.jsonl"`
    });
    fs.createReadStream(logPath).pipe(res);
    return;
  }

  // 微信支付 - 创建订单
  if (url.pathname === '/api/payment/create-order' && req.method === 'POST') {
    try {
      if (!isAuthenticated(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      if (!wechatPay) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '支付功能暂不可用，请联系客服' }));
        return;
      }
      const { plan } = await parseRequestBody(req);
      const out_trade_no = `medagent_${Date.now()}`;
      const params = {
        appid: 'wx10951656e9a582db',
        mchid: '1684977594',
        description: `MedAgent Hub - ${plan.name}`,
        out_trade_no,
        amount: { total: plan.price },
        notify_url: 'https://medagent.filldmy.com/api/payment/notify',
      };
      const result = await wechatPay.transactions_native(params);
      console.log('WeChat Pay result:', JSON.stringify(result));
      const codeUrl = (result.data && result.data.code_url) || result.code_url;
      if (!codeUrl) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '支付二维码生成失败，请稍后重试' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ codeUrl, out_trade_no }));
    } catch (error) {
      console.error('Error creating WeChat Pay order:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '创建支付订单失败' }));
    }
    return;
  }

  // 微信支付 - 查询订单状态
  if (url.pathname === '/api/payment/query' && req.method === 'GET') {
    try {
      if (!isAuthenticated(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      if (!wechatPay) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '支付功能暂不可用', paid: false }));
        return;
      }
      const tradeNo = url.searchParams.get('trade_no');
      if (!tradeNo) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '缺少 trade_no 参数', paid: false }));
        return;
      }
      const result = await wechatPay.query({ mchid: '1684977594', out_trade_no: tradeNo });
      const tradeState = (result.data && result.data.trade_state) || result.trade_state;
      const paid = tradeState === 'SUCCESS';
      if (paid) {
        // 支付成功，升级用户套餐
        const cookies = parseCookies(req);
        const username = getUserName(req);
        const usersPath = path.join(DATA_DIR, 'users.json');
        try {
          if (fs.existsSync(usersPath)) {
            let users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
            const user = users.find(u => u.username === username || u.name === username);
            if (user) {
              user.plan = 'pro';
              user.plan_expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
              fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
              console.log('✅ 用户', username, '已升级为专业版 Pro');
            }
          }
        } catch (e) { console.error('升级用户套餐失败:', e.message); }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ paid, trade_state: tradeState }));
    } catch (error) {
      console.error('Error querying WeChat Pay order:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '查询订单失败', paid: false }));
    }
    return;
  }

  // 微信支付 - 支付回调
  if (url.pathname === '/api/payment/notify' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const paymentLog = path.join(DATA_DIR, 'payment-log.json');
        let payments = [];
        try {
          if (fs.existsSync(paymentLog)) payments = JSON.parse(fs.readFileSync(paymentLog, 'utf8'));
        } catch {}
        const data = JSON.parse(body);
        payments.push({ ...data, received_at: new Date().toISOString() });
        fs.writeFileSync(paymentLog, JSON.stringify(payments, null, 2));
        console.log('✅ 支付回调收到:', data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 'SUCCESS', message: '成功' }));
      } catch (error) {
        console.error('Error handling payment notify:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 'FAIL', message: '处理失败' }));
      }
    });
    return;
  }

  // Serve static files
  const staticDir = path.join(__dirname);
  let filePath = path.join(staticDir, url.pathname === '/' ? 'index.html' : url.pathname);
  const ext = path.extname(filePath);
  const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  const protectedPages = ['chat.html'];
  const adminPages = ['admin.html', 'corpus.html'];
  const requestedFile = path.basename(filePath);
  if (adminPages.includes(requestedFile) && !isAdmin(req)) {
    res.writeHead(302, { Location: '/login.html' });
    res.end();
    return;
  }
  if (protectedPages.includes(requestedFile) && !isAuthenticated(req)) {
    const redirectTo = encodeURIComponent(req.url);
    res.writeHead(302, { Location: `/login.html?redirect=${redirectTo}` });
    res.end();
    return;
  }
  try {
    const stat = fs.statSync(filePath);
    // Support Range requests for video streaming
    if (ext === '.mp4' && req.headers.range) {
      const range = req.headers.range;
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4'
      });
      fileStream.pipe(res);
    } else {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
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
