/**
 * MedAgent 用户记忆系统 v2.0
 * 双轨提取：关键词快速提取（同步）+ LLM 深度提取（异步，每5轮触发）
 * 扩展字段：role, budget, skinType, concerns, city, ageGroup, treatmentHistory, goals
 * 存储位置：user-profiles.json 中的 memory 字段
 */

const https = require('https');

// ============================================================
// 关键词提取规则（同步，毫秒级）
// ============================================================

const ROLE_PATTERNS = [
  { pattern: /我是(医美机构|诊所|医院|美容院)/, role: '机构运营' },
  { pattern: /我们(机构|诊所|医院|门诊)/, role: '机构运营' },
  { pattern: /我(做|从事|负责).*(销售|代理|推广)/, role: '厂商销售' },
  { pattern: /我(代理|销售|推广).*(产品|品牌)/, role: '厂商销售' },
  { pattern: /我们(公司|品牌|团队)/, role: '厂商销售' },
  { pattern: /我是(顾问|咨询师|美容顾问|医美顾问)/, role: '医美顾问' },
  { pattern: /我是(医生|医师|护士|护理|医美医生)/, role: '医疗从业者' },
  { pattern: /我是消费者|我是用户|我是患者|我是求美者/, role: '消费者' },
  { pattern: /我(想|准备|考虑|打算).*(做|打|注射|手术|项目)/, role: '消费者' },
  { pattern: /我(最近|刚|已经|曾经).*(做了|打了|注射了|手术了)/, role: '消费者' },
];

const BUDGET_PATTERNS = [
  { pattern: /预算[是在约]?\s*(\d+)\s*万/, extract: m => parseInt(m[1]) * 10000 },
  { pattern: /预算[是在约]?\s*(\d+)\s*千/, extract: m => parseInt(m[1]) * 1000 },
  { pattern: /预算[是在约]?\s*(\d+)\s*元/, extract: m => parseInt(m[1]) },
  { pattern: /(\d+)\s*万以内/, extract: m => parseInt(m[1]) * 10000 },
  { pattern: /(\d+)[~\-到至]\s*(\d+)\s*万/, extract: m => Math.round((parseInt(m[1]) + parseInt(m[2])) / 2) * 10000 },
  { pattern: /(\d+)[~\-到至]\s*(\d+)\s*千/, extract: m => Math.round((parseInt(m[1]) + parseInt(m[2])) / 2) * 1000 },
];

const SKIN_PATTERNS = [
  { pattern: /皮肤[比较有点很]*(干|干燥|缺水)/, type: '干性皮肤' },
  { pattern: /皮肤[比较有点很]*(油|出油|油腻)/, type: '油性皮肤' },
  { pattern: /混合(型|性)皮肤|T区出油/, type: '混合性皮肤' },
  { pattern: /敏感(肌|皮肤|型)|皮肤敏感/, type: '敏感肌' },
  { pattern: /皮肤[比较有点很]*(暗|暗沉|发黄)/, type: '暗沉肌' },
];

const CONCERN_PATTERNS = [
  { pattern: /抗衰|抗老|除皱|皱纹/, concern: '抗衰老' },
  { pattern: /提升|提拉|下垂|松弛/, concern: '提升紧致' },
  { pattern: /祛斑|美白|提亮|色斑|黄褐斑/, concern: '美白祛斑' },
  { pattern: /填充|凹陷|苹果肌|泪沟|太阳穴/, concern: '填充塑形' },
  { pattern: /瘦脸|瘦腿|肉毒|咬肌/, concern: '瘦身塑形' },
  { pattern: /祛痘|痘印|痘坑|痤疮/, concern: '祛痘修复' },
  { pattern: /双眼皮|眼袋|黑眼圈|眼部/, concern: '眼部改善' },
  { pattern: /鼻子|隆鼻|鼻综合/, concern: '鼻部塑形' },
];

const CITY_PATTERNS = [
  /我在(北京|上海|广州|深圳|杭州|成都|重庆|武汉|西安|南京|苏州|天津|郑州|长沙|青岛|宁波|厦门|合肥|昆明|贵阳|福州|济南|哈尔滨|沈阳|大连)/,
  /(北京|上海|广州|深圳|杭州|成都|重庆|武汉|西安|南京|苏州|天津|郑州|长沙|青岛|宁波|厦门|合肥|昆明|贵阳|福州|济南|哈尔滨|沈阳|大连)(这边|当地|本地|的机构|的医院|的诊所)/,
];

const AGE_PATTERNS = [
  { pattern: /我\s*(\d{2})\s*岁/, extract: m => getAgeGroup(parseInt(m[1])) },
  { pattern: /(\d{2})\s*岁的我/, extract: m => getAgeGroup(parseInt(m[1])) },
  { pattern: /二十多岁|20多岁|20几岁/, extract: () => '20-29岁' },
  { pattern: /三十多岁|30多岁|30几岁/, extract: () => '30-39岁' },
  { pattern: /四十多岁|40多岁|40几岁/, extract: () => '40-49岁' },
  { pattern: /五十多岁|50多岁/, extract: () => '50岁以上' },
];

function getAgeGroup(age) {
  if (age < 20) return '20岁以下';
  if (age < 30) return '20-29岁';
  if (age < 40) return '30-39岁';
  if (age < 50) return '40-49岁';
  return '50岁以上';
}

// ============================================================
// 从单条消息中提取用户属性（同步）
// ============================================================
function extractFromMessage(message) {
  const extracted = {};

  for (const { pattern, role } of ROLE_PATTERNS) {
    if (pattern.test(message)) { extracted.role = role; break; }
  }

  for (const { pattern, extract } of BUDGET_PATTERNS) {
    const m = message.match(pattern);
    if (m) { extracted.budget = extract(m); break; }
  }

  for (const { pattern, type } of SKIN_PATTERNS) {
    if (pattern.test(message)) { extracted.skinType = type; break; }
  }

  const concerns = [];
  for (const { pattern, concern } of CONCERN_PATTERNS) {
    if (pattern.test(message)) concerns.push(concern);
  }
  if (concerns.length > 0) extracted.concerns = concerns;

  for (const pattern of CITY_PATTERNS) {
    const m = message.match(pattern);
    if (m) { extracted.city = m[1]; break; }
  }

  for (const { pattern, extract } of AGE_PATTERNS) {
    const m = message.match(pattern);
    if (m) { extracted.ageGroup = extract(m); break; }
  }

  return extracted;
}

// ============================================================
// 更新用户记忆（合并新提取的属性）
// ============================================================
function updateUserMemory(profiles, userCode, message) {
  if (!profiles[userCode]) profiles[userCode] = {};
  if (!profiles[userCode].memory) profiles[userCode].memory = {};

  const mem = profiles[userCode].memory;
  const extracted = extractFromMessage(message);
  let updated = false;

  if (extracted.role && extracted.role !== mem.role) { mem.role = extracted.role; updated = true; }
  if (extracted.budget && extracted.budget !== mem.budget) { mem.budget = extracted.budget; updated = true; }
  if (extracted.skinType && extracted.skinType !== mem.skinType) { mem.skinType = extracted.skinType; updated = true; }
  if (extracted.city && extracted.city !== mem.city) { mem.city = extracted.city; updated = true; }
  if (extracted.ageGroup && extracted.ageGroup !== mem.ageGroup) { mem.ageGroup = extracted.ageGroup; updated = true; }

  if (extracted.concerns && extracted.concerns.length > 0) {
    const existing = mem.concerns || [];
    const merged = [...new Set([...existing, ...extracted.concerns])];
    if (merged.length !== existing.length) { mem.concerns = merged.slice(0, 6); updated = true; }
  }

  if (updated) mem.lastUpdated = new Date().toISOString();
  return updated;
}

// ============================================================
// LLM 辅助提取（异步，每5轮触发，不阻塞响应）
// ============================================================
async function extractWithLLM(messages, currentMemory) {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  // 只取用户消息，最多15条，避免 Token 过多
  const userMessages = messages
    .filter(m => m.role === 'user')
    .slice(-15)
    .map(m => m.content || '')
    .join('\n---\n');

  if (!userMessages.trim()) return null;

  const prompt = `你是用户画像分析专家。根据以下用户对话内容，提取用户的基本信息。

对话内容：
${userMessages}

当前已知信息（如有）：
${JSON.stringify(currentMemory || {}, null, 2)}

请从对话中提取或更新以下信息（只提取对话中明确或强烈暗示的信息，不要猜测）：
- role: 用户身份（消费者/机构运营/医美顾问/医疗从业者/厂商销售，选一个）
- budget: 预算金额（数字，单位元，如30000）
- skinType: 皮肤类型（干性皮肤/油性皮肤/混合性皮肤/敏感肌/暗沉肌）
- concerns: 关注方向数组（从：抗衰老/提升紧致/美白祛斑/填充塑形/瘦身塑形/祛痘修复/眼部改善/鼻部塑形 中选）
- city: 所在城市（如北京、上海）
- ageGroup: 年龄段（20岁以下/20-29岁/30-39岁/40-49岁/50岁以上）
- treatmentHistory: 治疗史摘要（简短描述用户提到的已做过的项目，不超过50字）
- goals: 核心诉求摘要（用户最想解决的问题，不超过30字）

只返回 JSON，不要解释。如果某字段无法从对话中确定，不要包含该字段。
示例：{"role":"消费者","concerns":["抗衰老"],"goals":"改善法令纹和面部松弛"}`;

  try {
    const baseURL = process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1';
    const model = process.env.LLM_MODEL || 'deepseek-chat';

    const response = await callLLMAPI(baseURL, apiKey, model, prompt);
    if (!response) return null;

    // 解析 JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.warn('[用户记忆LLM] 提取失败:', e.message);
    return null;
  }
}

// ============================================================
// 简单的 LLM API 调用（避免依赖 axios）
// ============================================================
function callLLMAPI(baseURL, apiKey, model, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
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
      timeout: 10000,
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
// 异步更新用户记忆（LLM辅助，每5轮触发）
// ============================================================
async function updateUserMemoryWithLLM(profiles, userCode, messages, saveProfilesFn) {
  if (!profiles[userCode]) profiles[userCode] = {};
  if (!profiles[userCode].memory) profiles[userCode].memory = {};

  const mem = profiles[userCode].memory;

  // 计数器：每5轮触发一次LLM提取
  const msgCount = messages.filter(m => m.role === 'user').length;
  if (msgCount % 5 !== 0 || msgCount === 0) return;

  console.log(`[用户记忆LLM] 触发深度提取 (用户: ${userCode}, 消息数: ${msgCount})`);

  try {
    const extracted = await extractWithLLM(messages, mem);
    if (!extracted) return;

    let updated = false;
    const fields = ['role', 'budget', 'skinType', 'city', 'ageGroup', 'treatmentHistory', 'goals'];
    for (const field of fields) {
      if (extracted[field] !== undefined && extracted[field] !== mem[field]) {
        mem[field] = extracted[field];
        updated = true;
      }
    }

    // concerns 合并
    if (extracted.concerns && extracted.concerns.length > 0) {
      const existing = mem.concerns || [];
      const merged = [...new Set([...existing, ...extracted.concerns])];
      if (merged.length !== existing.length) { mem.concerns = merged.slice(0, 8); updated = true; }
    }

    if (updated) {
      mem.lastUpdated = new Date().toISOString();
      mem.llmExtracted = true;
      saveProfilesFn(profiles);
      console.log(`[用户记忆LLM] 更新成功:`, JSON.stringify(mem));
    }
  } catch (e) {
    console.warn('[用户记忆LLM] 异步更新失败:', e.message);
  }
}

// ============================================================
// 生成个性化上下文注入文本（精简版，减少Token消耗）
// ============================================================
function buildMemoryContext(memory) {
  if (!memory || Object.keys(memory).length === 0) return null;

  const parts = [];
  if (memory.role) parts.push(`身份:${memory.role}`);
  if (memory.city) parts.push(`城市:${memory.city}`);
  if (memory.ageGroup) parts.push(`年龄:${memory.ageGroup}`);
  if (memory.budget) {
    const b = memory.budget >= 10000 ? `${(memory.budget/10000).toFixed(1)}万` : `${memory.budget}元`;
    parts.push(`预算:${b}`);
  }
  if (memory.skinType) parts.push(`皮肤:${memory.skinType}`);
  if (memory.concerns?.length > 0) parts.push(`关注:${memory.concerns.join('/')}`);
  if (memory.goals) parts.push(`诉求:${memory.goals}`);
  if (memory.treatmentHistory) parts.push(`治疗史:${memory.treatmentHistory}`);

  if (parts.length === 0) return null;

  return `[用户档案] ${parts.join(' | ')}\n请根据以上背景提供个性化回答。`;
}

// ============================================================
// 专业程度评估
// ============================================================
const EXPERT_SIGNALS = [
  /透明质酸|玻璃酸钠|肉毒杆菌素|A型肉毒毒素|聚左旋乳酸|聚己内酯|羟基磷灰石/,
  /国械注准|CFDA|NMPA|注册证|备案号|临床试验|适应症|禁忌症/,
  /射频|超声刀|热玛吉|皮秒|点阵激光|IPL|强脉冲光|光子嫩肤/,
  /成纤维细胞|胶原蛋白|弹性蛋白|透皮吸收|真皮层|皮下组织/,
  /LD50|半衰期|代谢周期|交联度|分子量|浓度单位/,
];

const BEGINNER_SIGNALS = [
  /玻尿酸是什么|肉毒素是什么|什么是.*针|.*有什么用/,
  /第一次|从来没有|不太了解|不懂|小白|新手/,
  /会不会痛|疼不疼|安不安全|有没有副作用|会不会有问题/,
  /多少钱|贵不贵|值不值|要花多少/,
];

function assessExpertLevel(messages) {
  if (!messages || messages.length === 0) return 'unknown';
  let expertScore = 0, beginnerScore = 0;
  const userMessages = messages.filter(m => m.role === 'user').map(m => m.content || '').join(' ');
  for (const p of EXPERT_SIGNALS) if (p.test(userMessages)) expertScore++;
  for (const p of BEGINNER_SIGNALS) if (p.test(userMessages)) beginnerScore++;
  if (expertScore >= 2) return 'expert';
  if (beginnerScore >= 2) return 'beginner';
  if (expertScore >= 1) return 'intermediate';
  return 'unknown';
}

const STYLE_PROMPTS = {
  expert: '用户是医美专业人士，使用专业术语，直接给结论，省略科普。',
  intermediate: '用户有一定医美知识，可用术语但需简要解释，回答有深度。',
  beginner: '用户是医美新手，用通俗语言，避免术语或加括号注解，语气亲切。',
  unknown: null,
};

// ============================================================
// 获取用户记忆上下文（供 api-server.js 调用）
// ============================================================
function getUserMemoryContext(profiles, userCode, recentMessages) {
  const mem = profiles[userCode]?.memory;
  const baseContext = buildMemoryContext(mem);
  const expertLevel = assessExpertLevel(recentMessages);
  const stylePrompt = STYLE_PROMPTS[expertLevel];

  if (!baseContext && !stylePrompt) return null;

  const parts = [];
  if (baseContext) parts.push(baseContext);
  if (stylePrompt) parts.push(`[回答风格] ${stylePrompt}`);
  return parts.join('\n');
}

// ============================================================
// 获取用户记忆摘要（供管理员查看）
// ============================================================
function getUserMemorySummary(profiles, userCode) {
  return profiles[userCode]?.memory || null;
}

module.exports = {
  extractFromMessage,
  updateUserMemory,
  updateUserMemoryWithLLM,
  buildMemoryContext,
  getUserMemoryContext,
  getUserMemorySummary,
};
