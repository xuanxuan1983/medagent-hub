/**
 * MedAgent 经验记忆系统 v1.0
 * 
 * 核心理念：Agent 从历史对话中学习，越用越懂用户
 * 
 * 三大记忆类型：
 * 1. 偏好记忆（Preference）— 用户喜欢的风格、格式、表达方式
 * 2. 纠错记忆（Correction）— 用户纠正过的错误，避免重犯
 * 3. 习惯记忆（Habit）— 用户的工作习惯和常用操作模式
 * 
 * 触发机制：
 * - 用户点踩（feedback=down）→ 自动提取纠错记忆
 * - 用户明确纠正（"不对"、"应该是"等）→ 同步提取纠错记忆
 * - 每10轮对话 → LLM 异步提取偏好和习惯记忆
 * 
 * 存储位置：data/experiential-memory/{userCode}.json
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const MEMORY_DIR = path.join(__dirname, 'data', 'experiential-memory');
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });

// 每个用户最多保留的经验记忆条数
const MAX_MEMORIES_PER_TYPE = 30;
// 每个用户最多保留的总经验记忆条数
const MAX_TOTAL_MEMORIES = 60;

// ============================================================
// 数据模型
// ============================================================
/**
 * 单条经验记忆结构：
 * {
 *   id: string,          // 唯一ID
 *   type: string,        // 'preference' | 'correction' | 'habit'
 *   agentId: string,     // 来源Agent
 *   content: string,     // 记忆内容（自然语言描述）
 *   context: string,     // 触发场景（简短描述）
 *   confidence: number,  // 置信度 0-1（被多次验证的记忆置信度更高）
 *   hitCount: number,    // 被引用次数
 *   createdAt: string,   // 创建时间
 *   updatedAt: string,   // 最后更新时间
 * }
 */

// ============================================================
// 同步检测：用户是否在纠正 Agent
// ============================================================
const CORRECTION_PATTERNS = [
  { pattern: /不对[，,。！!]|不是这样|说错了|搞错了|弄错了/, type: 'correction' },
  { pattern: /应该是|正确的是|其实是|实际上是/, type: 'correction' },
  { pattern: /不要用|别用|不要写|别写|不要说|别说/, type: 'correction' },
  { pattern: /换一[个种]|改一下|修改|重新[写来做]/, type: 'correction' },
  { pattern: /太(长|短|正式|随意|专业|口语|啰嗦|简单)了/, type: 'preference' },
  { pattern: /我(喜欢|偏好|习惯|倾向于|更想要).*的(风格|格式|方式|语气|口吻)/, type: 'preference' },
  { pattern: /以后(都|请|帮我|记住)/, type: 'preference' },
  { pattern: /每次都要|总是要|一直要/, type: 'habit' },
  { pattern: /我(通常|一般|平时|经常|总是)/, type: 'habit' },
];

/**
 * 同步检测用户消息中是否包含纠正/偏好/习惯信号
 * @param {string} message 用户消息
 * @returns {{ detected: boolean, type: string|null, signal: string|null }}
 */
function detectExperientialSignal(message) {
  if (!message || message.length < 4) return { detected: false, type: null, signal: null };
  
  for (const { pattern, type } of CORRECTION_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      return { detected: true, type, signal: match[0] };
    }
  }
  return { detected: false, type: null, signal: null };
}

// ============================================================
// 加载/保存用户经验记忆
// ============================================================
function loadUserExperientialMemory(userCode) {
  const filePath = path.join(MEMORY_DIR, `${userCode}.json`);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    console.warn(`[经验记忆] 加载失败 (${userCode}):`, e.message);
  }
  return { memories: [], stats: { totalExtracted: 0, totalHits: 0 } };
}

function saveUserExperientialMemory(userCode, data) {
  const filePath = path.join(MEMORY_DIR, `${userCode}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn(`[经验记忆] 保存失败 (${userCode}):`, e.message);
  }
}

// ============================================================
// 添加一条经验记忆
// ============================================================
function addMemory(userCode, memory) {
  const data = loadUserExperientialMemory(userCode);
  
  // 检查是否已有相似记忆（通过内容相似度判断）
  const existing = data.memories.find(m => 
    m.type === memory.type && 
    m.content === memory.content
  );
  
  if (existing) {
    // 已有相似记忆，增加置信度
    existing.confidence = Math.min(1, existing.confidence + 0.2);
    existing.hitCount += 1;
    existing.updatedAt = new Date().toISOString();
    console.log(`[经验记忆] 强化已有记忆: ${existing.content} (置信度: ${existing.confidence})`);
  } else {
    // 新记忆
    const newMemory = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
      type: memory.type,
      agentId: memory.agentId || 'general',
      content: memory.content,
      context: memory.context || '',
      confidence: memory.confidence || 0.6,
      hitCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.memories.push(newMemory);
    console.log(`[经验记忆] 新增记忆: [${memory.type}] ${memory.content}`);
    
    // 超出上限时，淘汰最旧且置信度最低的记忆
    if (data.memories.length > MAX_TOTAL_MEMORIES) {
      data.memories.sort((a, b) => {
        // 优先保留高置信度和高引用次数的记忆
        const scoreA = a.confidence * 0.6 + Math.min(a.hitCount / 10, 0.4);
        const scoreB = b.confidence * 0.6 + Math.min(b.hitCount / 10, 0.4);
        return scoreB - scoreA;
      });
      data.memories = data.memories.slice(0, MAX_TOTAL_MEMORIES);
    }
  }
  
  data.stats.totalExtracted += 1;
  saveUserExperientialMemory(userCode, data);
  return data;
}

// ============================================================
// LLM 辅助提取经验记忆（异步）
// ============================================================
async function extractExperientialMemoryWithLLM(userCode, agentId, messages, previousAssistantMsg) {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  // 取最近的对话上下文（最多10轮）
  const recentMessages = messages.slice(-20).map(m => {
    const role = m.role === 'user' ? '用户' : 'Agent';
    const content = (m.content || '').substring(0, 300);
    return `${role}: ${content}`;
  }).join('\n');

  if (!recentMessages.trim()) return [];

  const existingMemory = loadUserExperientialMemory(userCode);
  const existingList = existingMemory.memories
    .slice(0, 10)
    .map(m => `- [${m.type}] ${m.content}`)
    .join('\n');

  const prompt = `你是用户行为分析专家。分析以下用户与AI助手的对话，提取用户的**偏好、纠正和习惯**。

对话记录：
${recentMessages}

已有的经验记忆（避免重复）：
${existingList || '（暂无）'}

请提取以下三类经验记忆（只提取对话中明确体现的，不要猜测）：

1. **偏好记忆（preference）**：用户喜欢的回答风格、格式、长度、语气等
   - 例："用户偏好简洁的表格式对比，不喜欢长篇大论"
   - 例："用户要求文案风格偏口语化、接地气"

2. **纠错记忆（correction）**：用户纠正过的事实错误或表达错误
   - 例："用户指出'嗨体'的正确写法不是'海体'"
   - 例："用户纠正：他们公司代理的是华熙生物而非爱美客"

3. **习惯记忆（habit）**：用户的工作模式和常用操作
   - 例："用户每次都先要竞品分析再写推广方案"
   - 例："用户习惯让Agent先列大纲再展开写"

返回JSON数组，每条记忆包含 type、content、context 字段。如果没有可提取的经验，返回空数组 []。
示例：[{"type":"preference","content":"用户偏好简洁的要点式回答","context":"多次要求缩短回答长度"}]`;

  try {
    const baseURL = process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1';
    const model = process.env.LLM_FAST_MODEL || process.env.LLM_MODEL || 'deepseek-chat';

    const response = await callLLMForMemory(baseURL, apiKey, model, prompt);
    if (!response) return [];

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    
    const memories = JSON.parse(jsonMatch[0]);
    return Array.isArray(memories) ? memories : [];
  } catch (e) {
    console.warn('[经验记忆LLM] 提取失败:', e.message);
    return [];
  }
}

/**
 * 从用户点踩的消息中提取纠错记忆
 */
async function extractFromFeedback(userCode, agentId, userMsg, assistantMsg, reason) {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = `用户对AI助手的回答点了"不准"（踩），请分析原因并提取一条经验教训。

用户问题：${(userMsg || '').substring(0, 500)}
AI回答：${(assistantMsg || '').substring(0, 500)}
用户反馈原因：${reason || '（未填写）'}

请提取一条简短的经验教训（不超过50字），让AI下次遇到类似问题时能避免同样的错误。
只返回JSON：{"content":"经验教训内容","context":"触发场景简述"}
如果无法判断具体原因，返回：{"content":"","context":""}`;

  try {
    const baseURL = process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1';
    const model = process.env.LLM_FAST_MODEL || process.env.LLM_MODEL || 'deepseek-chat';

    const response = await callLLMForMemory(baseURL, apiKey, model, prompt);
    if (!response) return null;

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const result = JSON.parse(jsonMatch[0]);
    if (!result.content) return null;
    
    return {
      type: 'correction',
      agentId,
      content: result.content,
      context: result.context || '用户反馈不准',
      confidence: 0.8, // 点踩的纠错记忆置信度较高
    };
  } catch (e) {
    console.warn('[经验记忆] 反馈提取失败:', e.message);
    return null;
  }
}

/**
 * 从用户的纠正性消息中同步提取经验
 */
function extractFromCorrection(message, previousAssistantMsg, agentId) {
  // 简单的规则提取
  const corrections = [];
  
  // "应该是X" / "正确的是X"
  const shouldBe = message.match(/(?:应该是|正确的是|其实是|实际上是)[：:「"']?\s*(.{2,50})/);
  if (shouldBe) {
    corrections.push({
      type: 'correction',
      agentId,
      content: `正确表述：${shouldBe[1].replace(/[」"']$/, '')}`,
      context: `用户纠正了Agent的回答`,
      confidence: 0.8,
    });
  }
  
  // "不要用X" / "别用X"
  const dontUse = message.match(/(?:不要用|别用|不要写|别写|不要说|别说)[：:「"']?\s*(.{2,30})/);
  if (dontUse) {
    corrections.push({
      type: 'correction',
      agentId,
      content: `禁止使用：${dontUse[1].replace(/[」"']$/, '')}`,
      context: `用户明确要求不使用某表述`,
      confidence: 0.9,
    });
  }
  
  // "以后都/请/记住 + X"
  const fromNowOn = message.match(/(?:以后都|以后请|以后帮我|以后记住|以后注意)[：:，,]?\s*(.{2,80})/);
  if (fromNowOn) {
    corrections.push({
      type: 'preference',
      agentId,
      content: fromNowOn[1].replace(/[。！!]$/, ''),
      context: `用户明确要求的长期偏好`,
      confidence: 0.9,
    });
  }
  
  // "太长了/太短了/太正式了" 等风格反馈
  const styleMatch = message.match(/太(长|短|正式|随意|专业|口语|啰嗦|简单|复杂|详细|简略)了/);
  if (styleMatch) {
    const opposites = {
      '长': '更简洁', '短': '更详细', '正式': '更口语化', '随意': '更正式',
      '专业': '更通俗', '口语': '更专业', '啰嗦': '更精炼', '简单': '更深入',
      '复杂': '更简洁', '详细': '更精炼', '简略': '更详细',
    };
    corrections.push({
      type: 'preference',
      agentId,
      content: `用户偏好${opposites[styleMatch[1]] || '调整'}的回答风格`,
      context: `用户反馈回答太${styleMatch[1]}`,
      confidence: 0.7,
    });
  }
  
  return corrections;
}

// ============================================================
// 构建经验记忆上下文（注入到系统提示词中）
// 支持传入用户当前消息，用于关键词相关性匹配
// ============================================================
function buildExperientialContext(userCode, agentId, currentUserMessage) {
  const data = loadUserExperientialMemory(userCode);
  if (!data.memories || data.memories.length === 0) return null;
  
  // 筛选与当前Agent相关的记忆 + 通用记忆
  let candidates = data.memories
    .filter(m => m.agentId === agentId || m.agentId === 'general');
  
  if (candidates.length === 0) return null;

  // ---- 相关性匹配：根据用户当前消息提升相关记忆的优先级 ----
  const msgText = (currentUserMessage || '').toLowerCase();
  for (const m of candidates) {
    // 基础分 = 置信度 * 0.5 + 引用频率 * 0.2
    m._score = m.confidence * 0.5 + Math.min(m.hitCount / 10, 0.2);
    
    // 纠错记忆始终获得额外权重（最重要，必须遵循）
    if (m.type === 'correction') m._score += 0.3;
    
    // 关键词匹配加分：记忆内容中的关键词出现在用户消息中
    if (msgText.length > 2) {
      const sepRegex = /[，。！？、；："'()（）\[\]【】\s]+/g;
      const contentWords = m.content.replace(sepRegex, ' ').split(' ').filter(w => w.length >= 2);
      const contextWords = (m.context || '').replace(sepRegex, ' ').split(' ').filter(w => w.length >= 2);
      const allWords = [...new Set([...contentWords, ...contextWords])];
      let matchCount = 0;
      for (const word of allWords) {
        if (msgText.includes(word.toLowerCase())) matchCount++;
      }
      // 每匹配一个关键词加 0.15，最多加 0.45
      m._score += Math.min(matchCount * 0.15, 0.45);
    }
  }
  
  // 按综合得分排序，取 top 10
  candidates.sort((a, b) => b._score - a._score);
  const relevant = candidates.slice(0, 10);
  
  // 按类型分组
  const corrections = relevant.filter(m => m.type === 'correction');
  const preferences = relevant.filter(m => m.type === 'preference');
  const habits = relevant.filter(m => m.type === 'habit');
  
  // ---- 增强措辞强度：分级强制遵循 ----
  const parts = [];
  parts.push('━━━━━━━━━━ 用户经验记忆（强制遵循） ━━━━━━━━━━');
  parts.push('以下规则来自用户的历史纠正和明确偏好，优先级高于你的默认行为。');
  parts.push('违反这些规则等同于回答错误。');
  parts.push('');
  
  if (corrections.length > 0) {
    parts.push('🚫 【必须遵循的纠错规则 — 违反即错误】');
    for (const m of corrections) {
      const strength = m.confidence >= 0.8 ? '⚠️ 用户曾明确纠正' : '📝 历史纠错';
      parts.push('  ' + strength + '：' + m.content);
    }
    parts.push('');
  }
  if (preferences.length > 0) {
    parts.push('📌 【必须遵循的用户偏好】');
    for (const m of preferences) {
      parts.push('  - ' + m.content);
    }
    parts.push('');
  }
  if (habits.length > 0) {
    parts.push('🔄 【用户工作习惯（尽量遵循）】');
    for (const m of habits) {
      parts.push('  - ' + m.content);
    }
    parts.push('');
  }
  parts.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // 更新命中计数
  for (const m of relevant) {
    const original = data.memories.find(om => om.id === m.id);
    if (original) {
      original.hitCount += 1;
      original.updatedAt = new Date().toISOString();
    }
  }
  data.stats.totalHits += relevant.length;
  saveUserExperientialMemory(userCode, data);
  
  // 清理临时评分字段
  for (const m of candidates) delete m._score;
  
  return parts.join('\n');
}

// ============================================================
// LLM API 调用工具函数
// ============================================================
function callLLMForMemory(baseURL, apiKey, model, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.1,
    });

    const url = new URL(`${baseURL}/chat/completions`);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 15000,
    };

    const lib = url.protocol === 'https:' ? https : require('http');
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.choices?.[0]?.message?.content || null);
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', (e) => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

// ============================================================
// 获取用户经验记忆摘要（供管理员查看）
// ============================================================
function getExperientialMemorySummary(userCode) {
  const data = loadUserExperientialMemory(userCode);
  return {
    totalMemories: data.memories.length,
    corrections: data.memories.filter(m => m.type === 'correction').length,
    preferences: data.memories.filter(m => m.type === 'preference').length,
    habits: data.memories.filter(m => m.type === 'habit').length,
    stats: data.stats,
    topMemories: data.memories
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map(m => ({ type: m.type, content: m.content, confidence: m.confidence })),
  };
}

// ============================================================
// 导出
// ============================================================
module.exports = {
  detectExperientialSignal,
  loadUserExperientialMemory,
  addMemory,
  extractExperientialMemoryWithLLM,
  extractFromFeedback,
  extractFromCorrection,
  buildExperientialContext,
  getExperientialMemorySummary,
};
