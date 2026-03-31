/**
 * MedAgent Hub 工具注册中心 v3
 * v3 新增：skill_dispatch 工具，实现统一 IP + Skill 路由架构
 */
'use strict';

const fs = require('fs');
const path = require('path');

let medaestheticsDb = null;
try {
  medaestheticsDb = require('../medaesthetics-db');
} catch (e) {
  console.warn('[ToolRegistry] medaesthetics-db 未找到，query_med_db 工具将降级');
}

const nmpaSearchTool = {
  id: 'nmpa_search',
  definition: {
    type: 'function',
    function: {
      name: 'nmpa_search',
      description: '查询国家药品监督管理局（NMPA）数据库，验证医疗器械、药品、化妆品的注册/备案信息、批准文号、生产企业等合规信息。当用户询问某产品是否合规、是否有批文、是否正规时调用此工具。',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '要查询的产品名称、批准文号或企业名称' }
        },
        required: ['keyword']
      }
    }
  },
  async execute(args, context) {
    const { keyword } = args;
    const { nmpaSearch, detectNmpaProduct, message } = context;
    const searchTerm = keyword || detectNmpaProduct?.(message) || message;
    if (!nmpaSearch) return { text: 'NMPA 查询功能当前不可用。', toolEvent: null };
    try {
      const result = await nmpaSearch(searchTerm);
      return { text: result.text || JSON.stringify(result), toolEvent: { type: 'tool_call', tool: 'nmpa_search', keyword: searchTerm } };
    } catch (e) {
      return { text: `NMPA 查询失败：${e.message}`, toolEvent: null };
    }
  }
};

const queryMedDbTool = {
  id: 'query_med_db',
  definition: {
    type: 'function',
    function: {
      name: 'query_med_db',
      description: '查询本地医美价格和合规信息数据库，获取医美项目的参考价格区间、产品规格、注意事项等结构化信息。当用户询问某医美项目的价格、费用、多少钱时优先调用此工具。',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '要查询的医美项目或产品名称' },
          intent: { type: 'string', enum: ['price', 'compliance', 'general'], description: '查询意图' },
          city: { type: 'string', description: '可选，用户所在城市' }
        },
        required: ['keyword']
      }
    }
  },
  async execute(args, context) {
    const { keyword, intent = 'general', city } = args;
    if (!medaestheticsDb) return { text: `医美数据库模块未加载，无法查询"${keyword}"。`, toolEvent: null };
    try {
      const queryStr = city ? `${keyword} ${city}` : keyword;
      const result = medaestheticsDb.queryMedAestheticsDB(queryStr, intent);
      if (result.summary && result.summary.trim().length > 0) {
        return { text: result.summary, toolEvent: { type: 'tool_call', tool: 'query_med_db', keyword } };
      }
      const priceResults = medaestheticsDb.queryPrice(keyword);
      const complianceResults = medaestheticsDb.queryCompliance(keyword);
      if (priceResults.length === 0 && complianceResults.length === 0) {
        return { text: `暂无"${keyword}"的本地数据库记录。`, toolEvent: null };
      }
      const parts = [];
      if (complianceResults.length > 0) parts.push('## 产品合规信息\n\n' + medaestheticsDb.formatComplianceResult(complianceResults));
      if (priceResults.length > 0) parts.push('## 价格行情参考\n\n' + medaestheticsDb.formatPriceResult(priceResults, city || null));
      return { text: parts.join('\n\n'), toolEvent: { type: 'tool_call', tool: 'query_med_db', keyword } };
    } catch (e) {
      return { text: `医美数据库查询失败：${e.message}`, toolEvent: null };
    }
  }
};

const webSearchTool = {
  id: 'web_search',
  definition: {
    type: 'function',
    function: {
      name: 'web_search',
      description: '通过互联网搜索最新信息，适用于查询行业动态、最新技术、近期新闻、实时数据等需要最新信息的问题。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          freshness: { type: 'string', enum: ['day', 'week', 'month', 'year', 'noLimit'], description: '搜索时效性过滤' }
        },
        required: ['query']
      }
    }
  },
  async execute(args, context) {
    const { query, freshness = 'noLimit' } = args;
    const { bochaSearch } = context;
    if (!bochaSearch) return { text: '联网搜索功能当前不可用。', searchResults: [], toolEvent: null };
    try {
      // 修复：bochaSearch(query, count) 第二参数是数量，freshness 通过 context 传递
      const searchResult = await bochaSearch(query, 5);
      const results = searchResult?.results || (Array.isArray(searchResult) ? searchResult : []);
      if (results && results.length > 0) {
        const text = results.slice(0, 5).map((r, i) => `[${i + 1}] ${r.title}\n来源：${r.url}\n摘要：${r.snippet}`).join('\n\n');
        return { text, searchResults: results, toolEvent: { type: 'tool_call', tool: 'web_search', query } };
      }
      return { text: `搜索"${query}"未找到相关结果。`, searchResults: [], toolEvent: null };
    } catch (e) {
      return { text: `联网搜索失败：${e.message}`, searchResults: [], toolEvent: null };
    }
  }
};

// ===== 用户记忆查询工具 =====
const getUserMemoryTool = {
  id: 'get_user_memory',
  definition: {
    type: 'function',
    function: {
      name: 'get_user_memory',
      description: '查询当前用户的历史对话记忆档案，获取用户身份、预算、皮肤类型、关注方向、所在城市、年龄段、治疗史等个人信息。当需要了解用户背景以提供个性化建议时调用此工具。',
      parameters: {
        type: 'object',
        properties: {
          fields: {
            type: 'array',
            items: { type: 'string' },
            description: '需要查询的字段列表，可选值：role/budget/skinType/concerns/city/ageGroup/treatmentHistory/goals。不传则返回全部。'
          }
        },
        required: []
      }
    }
  },
  async execute(args, context) {
    const { userMemory } = context;
    if (!userMemory || Object.keys(userMemory).length === 0) {
      return { text: '暂无该用户的历史记忆档案，请在对话中了解用户背景。', toolEvent: null };
    }
    const { fields } = args;
    let mem = userMemory;
    if (fields && fields.length > 0) {
      mem = {};
      for (const f of fields) if (userMemory[f] !== undefined) mem[f] = userMemory[f];
    }
    const parts = [];
    if (mem.role) parts.push(`身份：${mem.role}`);
    if (mem.city) parts.push(`城市：${mem.city}`);
    if (mem.ageGroup) parts.push(`年龄段：${mem.ageGroup}`);
    if (mem.budget) parts.push(`预算：${mem.budget >= 10000 ? (mem.budget/10000).toFixed(1)+'万元' : mem.budget+'元'}`);
    if (mem.skinType) parts.push(`皮肤类型：${mem.skinType}`);
    if (mem.concerns?.length > 0) parts.push(`关注方向：${mem.concerns.join('、')}`);
    if (mem.goals) parts.push(`核心诉求：${mem.goals}`);
    if (mem.treatmentHistory) parts.push(`治疗史：${mem.treatmentHistory}`);
    const text = parts.length > 0 ? `用户档案：\n${parts.join('\n')}` : '用户档案暂无有效信息。';
    return { text, toolEvent: { type: 'tool_call', tool: 'get_user_memory' } };
  }
};

const SKILL_DISPLAY_NAMES = {
  'senior-consultant':         '金牌医美咨询师',
  'sparring-partner':          '陪练机器人',
  'postop-specialist':         '术后管理专家',
  'product-strategist':        '产品材料专家',
  'materials-mentor':          '医美材料导师',
  'aesthetic-designer':        '高定美学设计总监',
  'anatomy-architect':         '面部解剖架构师',
  'neuro-aesthetic-architect': '神经美学架构师',
  'medical-liaison':           '学术联络官',
  'gtm-strategist':            'GTM战略大师',
  'xhs-content-creator':       '小红书爆款种草官',
  'wechat-content-creator':    '微信内容创作专家',
  'new-media-director':        '新媒体合规总监',
  'social-media-creator':      '社媒内容创作者',
  'super-writer':              '超级写手',
  'visual-translator':         '医美视觉通译官',
  'cover-image-creator':       '封面图创作者',
  'article-illustrator':       '文章配图师',
  'comic-creator':             '漫画创作者',
  'kv-design-director':        'KV设计总监',
  'ppt-creator':               'PPT创作者',
  'sales-director':            '销售作战总监',
  'operations-director':       '运营总监',
  'marketing-director':        '市场总监',
  'finance-bp':                '财务BP',
  'hrbp':                      'HRBP',
  'training-director':         '培训总监',
  'area-manager':              '大区经理',
  'channel-manager':           '渠道经理',
  'sfe-director':              'SFE总监',
  'procurement-manager':       '采购经理',
  'creative-director':         '创意总监',
  'first-principles-analyst':  '第一性原理分析师',
  'personal-ip-builder':       '个人IP打造专家',
  'personal-brand-cinematic':  '个人品牌电影感',
  'prompt-engineer-pro':       'Prompt工程师',
  'meta-prompt-architect':     'Meta Prompt架构师',
};

function extractSkillPrompt(skillId) {
  const skillsDir = path.join(__dirname, '../skills');
  const skillFile = path.join(skillsDir, `${skillId}.md`);
  if (!fs.existsSync(skillFile)) {
    console.warn(`[skill_dispatch] skill 文件不存在: ${skillFile}`);
    return null;
  }
  const content = fs.readFileSync(skillFile, 'utf-8');
  const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  if (frontmatterMatch) return frontmatterMatch[1].trim();
  return content.trim();
}

const skillDispatchTool = {
  id: 'skill_dispatch',
  definition: {
    type: 'function',
    function: {
      name: 'skill_dispatch',
      description: '当用户的问题需要特定领域专家来回答时，调用此工具切换到对应的专家 Skill 直接在当前窗口回答，无需用户跳转。适用场景：话术/成交→senior-consultant；术后/复购→postop-specialist；合规/注册证→product-strategist；美学设计→aesthetic-designer；小红书内容→xhs-content-creator；运营/业绩→operations-director；产品材料/学术→materials-mentor；面部解剖→anatomy-architect；陪练演练→sparring-partner。',
      parameters: {
        type: 'object',
        properties: {
          skill_id: {
            type: 'string',
            description: '目标专家 Skill 的 ID',
            enum: ['senior-consultant','sparring-partner','postop-specialist','product-strategist','materials-mentor','aesthetic-designer','anatomy-architect','neuro-aesthetic-architect','medical-liaison','gtm-strategist','xhs-content-creator','wechat-content-creator','new-media-director','social-media-creator','super-writer','visual-translator','cover-image-creator','article-illustrator','comic-creator','kv-design-director','ppt-creator','sales-director','operations-director','marketing-director','finance-bp','hrbp','training-director','area-manager','channel-manager','sfe-director','procurement-manager','creative-director','first-principles-analyst','personal-ip-builder','personal-brand-cinematic','prompt-engineer-pro','meta-prompt-architect']
          },
          reason: { type: 'string', description: '选择此专家的简短理由' }
        },
        required: ['skill_id']
      }
    }
  },
  async execute(args, context) {
    const { skill_id, reason } = args;
    const displayName = SKILL_DISPLAY_NAMES[skill_id] || skill_id;
    // ★ 防御：模型传入空 skill_id 时拒绝路由
    if (!skill_id) {
      console.warn(`⚠️ [skill_dispatch] 收到空 skill_id，拒绝路由`);
      return { text: "请直接回答用户的问题。", toolEvent: null, skillPrompt: null, skillId: null, skillDisplayName: null };
    }
    console.log(`🎯 [skill_dispatch] 路由到: ${skill_id} (${displayName}) | 原因: ${reason || '未说明'}`);
    const skillPrompt = extractSkillPrompt(skill_id);
    if (!skillPrompt) {
      return {
        text: `专家 Skill "${skill_id}" 暂时不可用，请稍后再试。`,
        toolEvent: { type: 'tool_call', tool: 'skill_dispatch', skill_id, displayName },
        skillPrompt: null, skillId: skill_id, skillDisplayName: displayName
      };
    }
    return {
      text: `[系统提示] 已切换到专家模式：${displayName}。请严格按照以下专家角色定义回答用户问题：\n\n${skillPrompt}`,
      toolEvent: { type: 'skill_dispatch', skill_id, displayName },
      skillPrompt, skillId: skill_id, skillDisplayName: displayName
    };
  }
};

const TOOL_REGISTRY = {
  [nmpaSearchTool.id]: nmpaSearchTool,
  [queryMedDbTool.id]: queryMedDbTool,
  [webSearchTool.id]: webSearchTool,
  [skillDispatchTool.id]: skillDispatchTool,
  [getUserMemoryTool.id]: getUserMemoryTool,
};

function getToolDefinitions(toolIds) {
  if (!toolIds || toolIds.length === 0) return [];
  return toolIds.filter(id => TOOL_REGISTRY[id]).map(id => TOOL_REGISTRY[id].definition);
}

async function executeTool(toolName, args, context) {
  // ★ 工具名别名映射：DeepSeek-V3 有时直接输出技能名而非 skill_dispatch
  const TOOL_ALIASES = {
    'product_strategist': 'skill_dispatch',
    'senior_consultant': 'skill_dispatch',
    'product-strategist': 'skill_dispatch',
    'senior-consultant': 'skill_dispatch',
    'compliance_expert': 'skill_dispatch',
    'compliance-expert': 'skill_dispatch',
    'training_advisor': 'skill_dispatch',
    'training-advisor': 'skill_dispatch',
  };
  if (TOOL_ALIASES[toolName]) {
    console.log(`[ToolRegistry] 别名映射: ${toolName} -> ${TOOL_ALIASES[toolName]}`);
    args = { skill_id: toolName.replace(/_/g, '-'), ...args };
    toolName = TOOL_ALIASES[toolName];
  }
  const tool = TOOL_REGISTRY[toolName];
  if (!tool) {
    console.warn(`[ToolRegistry] 未知工具: ${toolName}`);
    return { text: `工具 "${toolName}" 不存在。`, searchResults: [], toolEvent: null };
  }
  console.log(`🔧 [ToolRegistry] 执行工具: ${toolName} | args: ${JSON.stringify(args)}`);
  return await tool.execute(args, context);
}

function listTools() {
  return Object.keys(TOOL_REGISTRY);
}

module.exports = {
  TOOL_REGISTRY,
  getToolDefinitions,
  executeTool,
  listTools,
  NMPA_TOOL_DEFINITION: nmpaSearchTool.definition,
  SKILL_DISPLAY_NAMES,
};
