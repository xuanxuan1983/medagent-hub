/**
 * MedAgent 用户记忆系统
 * 从对话中自动提取用户属性（职业、预算、皮肤类型、偏好等），
 * 并在后续对话中注入个性化上下文，提升回答精准度。
 *
 * 存储位置：user-profiles.json 中的 memory 字段
 * 格式：{ memory: { role, budget, skinType, concerns, preferences, lastUpdated } }
 */

// ============================================================
// 属性提取规则（基于关键词，无需LLM，毫秒级）
// ============================================================

const ROLE_PATTERNS = [
  { pattern: /我是(医美机构|诊所|医院|美容院)/, role: '机构运营' },
  { pattern: /我(做|从事|负责).*(销售|代理|推广)/, role: '厂商销售' },
  { pattern: /我是(顾问|咨询师|美容顾问)/, role: '医美顾问' },
  { pattern: /我是(医生|医师|护士|护理)/, role: '医疗从业者' },
  { pattern: /我(想|准备|考虑).*(做|打|注射|手术)/, role: '消费者' },
  { pattern: /我(代理|销售|推广).*(产品|品牌)/, role: '厂商销售' },
  { pattern: /我们(机构|诊所|医院|门诊)/, role: '机构运营' },
];

const BUDGET_PATTERNS = [
  { pattern: /预算[是在约]?\s*(\d+)\s*万/, extract: m => parseInt(m[1]) * 10000 },
  { pattern: /预算[是在约]?\s*(\d+)\s*千/, extract: m => parseInt(m[1]) * 1000 },
  { pattern: /预算[是在约]?\s*(\d+)\s*元/, extract: m => parseInt(m[1]) },
  { pattern: /(\d+)\s*万以内/, extract: m => parseInt(m[1]) * 10000 },
  { pattern: /(\d+)[~-](\d+)\s*万/, extract: m => Math.round((parseInt(m[1]) + parseInt(m[2])) / 2) * 10000 },
  { pattern: /(\d+)[~-](\d+)\s*千/, extract: m => Math.round((parseInt(m[1]) + parseInt(m[2])) / 2) * 1000 },
];

const SKIN_PATTERNS = [
  { pattern: /皮肤[比较|有点|很]*(干|干燥|缺水)/, type: '干性皮肤' },
  { pattern: /皮肤[比较|有点|很]*(油|出油|油腻)/, type: '油性皮肤' },
  { pattern: /混合(型|性)皮肤|T区出油/, type: '混合性皮肤' },
  { pattern: /敏感(肌|皮肤|型)|皮肤敏感/, type: '敏感肌' },
  { pattern: /皮肤[比较|有点|很]*(暗|暗沉|发黄)/, type: '暗沉肌' },
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

// ============================================================
// 从单条消息中提取用户属性
// ============================================================
function extractFromMessage(message) {
  const extracted = {};

  // 提取职业/角色
  for (const { pattern, role } of ROLE_PATTERNS) {
    if (pattern.test(message)) {
      extracted.role = role;
      break;
    }
  }

  // 提取预算
  for (const { pattern, extract } of BUDGET_PATTERNS) {
    const m = message.match(pattern);
    if (m) {
      extracted.budget = extract(m);
      break;
    }
  }

  // 提取皮肤类型
  for (const { pattern, type } of SKIN_PATTERNS) {
    if (pattern.test(message)) {
      extracted.skinType = type;
      break;
    }
  }

  // 提取关注点（可多个）
  const concerns = [];
  for (const { pattern, concern } of CONCERN_PATTERNS) {
    if (pattern.test(message)) concerns.push(concern);
  }
  if (concerns.length > 0) extracted.concerns = concerns;

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

  // 合并提取的属性（新值覆盖旧值，concerns 合并去重）
  if (extracted.role && extracted.role !== mem.role) {
    mem.role = extracted.role;
    updated = true;
  }
  if (extracted.budget && extracted.budget !== mem.budget) {
    mem.budget = extracted.budget;
    updated = true;
  }
  if (extracted.skinType && extracted.skinType !== mem.skinType) {
    mem.skinType = extracted.skinType;
    updated = true;
  }
  if (extracted.concerns && extracted.concerns.length > 0) {
    const existing = mem.concerns || [];
    const merged = [...new Set([...existing, ...extracted.concerns])];
    if (merged.length !== existing.length) {
      mem.concerns = merged.slice(0, 6); // 最多保留6个关注点
      updated = true;
    }
  }

  if (updated) {
    mem.lastUpdated = new Date().toISOString();
  }

  return updated;
}

// ============================================================
// 生成个性化上下文注入文本
// ============================================================
function buildMemoryContext(memory) {
  if (!memory || Object.keys(memory).length === 0) return null;

  const parts = [];

  if (memory.role) {
    parts.push(`用户身份：${memory.role}`);
  }
  if (memory.budget) {
    const budgetStr = memory.budget >= 10000
      ? `${(memory.budget / 10000).toFixed(1)}万元`
      : `${memory.budget}元`;
    parts.push(`预算范围：约${budgetStr}`);
  }
  if (memory.skinType) {
    parts.push(`皮肤类型：${memory.skinType}`);
  }
  if (memory.concerns && memory.concerns.length > 0) {
    parts.push(`关注方向：${memory.concerns.join('、')}`);
  }

  if (parts.length === 0) return null;

  return `===== 用户个人档案（历史对话记忆）=====\n以下是根据用户历史对话自动记录的个人信息，请在回答时考虑这些背景，提供更有针对性的建议：\n\n${parts.join('\n')}\n\n请根据以上用户背景，给出更精准、更个性化的回答。`;
}

// ============================================================
// 专业程度评估（根据用户历史对话判断）
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
  let expertScore = 0;
  let beginnerScore = 0;
  const userMessages = messages.filter(m => m.role === 'user').map(m => m.content || '').join(' ');
  for (const pattern of EXPERT_SIGNALS) {
    if (pattern.test(userMessages)) expertScore++;
  }
  for (const pattern of BEGINNER_SIGNALS) {
    if (pattern.test(userMessages)) beginnerScore++;
  }
  if (expertScore >= 2) return 'expert';
  if (beginnerScore >= 2) return 'beginner';
  if (expertScore >= 1) return 'intermediate';
  return 'unknown';
}

const STYLE_PROMPTS = {
  expert: '用户是医美行业专业人士，请使用专业术语，直接给出核心结论，省略基础科普，可以引用数据和文献。',
  intermediate: '用户有一定医美知识背景，可以使用行业术语但需简要解释，回答要有深度但不要过于学术化。',
  beginner: '用户是医美新手，请用通俗易懂的语言，避免专业术语或用括号注解，多用类比和例子，语气亲切耐心。',
  unknown: null,
};

// ============================================================
// 获取用户记忆上下文（供api-server.js调用）
// ============================================================
function getUserMemoryContext(profiles, userCode, recentMessages) {
  const mem = profiles[userCode]?.memory;
  const baseContext = buildMemoryContext(mem);

  // 评估专业程度并注入风格指令
  const expertLevel = assessExpertLevel(recentMessages);
  const stylePrompt = STYLE_PROMPTS[expertLevel];

  if (!baseContext && !stylePrompt) return null;

  const parts = [];
  if (baseContext) parts.push(baseContext);
  if (stylePrompt) parts.push(`\n===== 回答风格指令 =====\n${stylePrompt}`);

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
  buildMemoryContext,
  getUserMemoryContext,
  getUserMemorySummary
};
