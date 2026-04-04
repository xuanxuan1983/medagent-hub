/**
 * MedAgent Hub — 任务规划层 v2 (Task Planner)
 * 
 * v2 改进：
 * 1. 智能步骤生成：基于意图分析生成与实际工具调用绑定的步骤
 * 2. 工具绑定：每个步骤可关联具体工具（knowledge_search/nmpa_search/web_search）
 * 3. 动态进度：步骤状态与工具执行实时同步
 * 4. 结果摘要：工具执行完成后自动附加结果摘要到步骤
 * 
 * 触发条件（满足其一即触发规划）：
 * - 消息包含"帮我"+"分析/生成/制作/整理/调研"等多步骤动词
 * - 消息包含"报告/方案/计划/策略"等产出物关键词
 * - 消息长度超过 80 字且包含多个目标
 */
'use strict';

const https = require('https');

// ===== 触发规划的关键词 =====
const PLAN_TRIGGERS = [
  // 多步骤动词组合
  /帮(我|我们).*(分析|调研|整理|生成|制作|撰写|起草|规划|设计|优化)/,
  /请.*(分析|调研|整理|生成|制作|撰写|起草|规划|设计|优化).*(并|然后|再|同时)/,
  // 产出物关键词
  /(生成|制作|写|撰写|起草|输出).*(报告|方案|计划|策略|文案|话术|分析|总结)/,
  // 多目标连接词
  /首先.*然后.*最后/,
  /第一.*第二.*第三/,
  // 复杂分析任务
  /(竞品|竞争对手|市场|行业).*(分析|调研|对比|报告)/,
  /(制定|规划|设计).*(方案|策略|计划|流程)/,
];

// ===== 不触发规划的排除词（简单问答）=====
const PLAN_EXCLUDES = [
  /^(什么是|怎么|如何|为什么|哪个|哪些|多少|是不是|有没有)/,
  /^(你好|你是|介绍一下|说说|讲讲)/,
  /画一张|展示|显示|看看/,
];

// ===== 工具显示名称和图标 =====
const TOOL_META = {
  'knowledge_search': { label: '检索内部知识库', icon: '📚' },
  'nmpa_search':      { label: '查询国家药监局数据库', icon: '📋' },
  'web_search':       { label: '联网搜索最新信息', icon: '🌐' },
  'query_med_db':     { label: '查询价格数据库', icon: '💰' },
  'skill_dispatch':   { label: '调用专家技能', icon: '🎯' },
};

/**
 * 判断是否需要任务规划
 * @param {string} message 用户消息
 * @returns {boolean}
 */
function needsPlanning(message) {
  if (!message || message.length < 20) return false;
  // 排除简单问答
  for (const exc of PLAN_EXCLUDES) {
    if (exc.test(message)) return false;
  }
  // 检查触发条件
  for (const trigger of PLAN_TRIGGERS) {
    if (trigger.test(message)) return true;
  }
  // 长消息且包含多个逗号/分号（可能是复杂需求）
  if (message.length > 80 && (message.match(/[，,；;]/g) || []).length >= 3) return true;
  return false;
}

/**
 * 分析消息可能需要的工具
 * @param {string} message 用户消息
 * @param {boolean} webSearchEnabled 是否开启联网搜索
 * @returns {string[]} 可能用到的工具 ID 列表
 */
function predictTools(message, webSearchEnabled) {
  const tools = [];
  
  // 知识库检索：涉及内部文档、SOP、培训资料
  if (/知识库|SOP|流程|培训|内部|文档|操作规范|术后|护理|注射|手法/.test(message)) {
    tools.push('knowledge_search');
  }
  
  // NMPA 查询：涉及药监局、注册证、批文、合规
  if (/药监|NMPA|注册证|批文|批号|合规|备案|审批|医疗器械/.test(message)) {
    tools.push('nmpa_search');
  }
  
  // 联网搜索：涉及市场、趋势、最新、价格、竞品
  if (webSearchEnabled || /市场|趋势|最新|价格|竞品|行业|新闻|动态|政策/.test(message)) {
    tools.push('web_search');
  }
  
  return tools;
}

/**
 * 生成智能任务计划（基于意图分析 + 工具预测）
 * @param {string} message 用户消息
 * @param {string} agentName Agent 名称
 * @param {string} apiKey SiliconFlow API Key
 * @param {string} model 模型名称
 * @param {boolean} webSearchEnabled 是否开启联网搜索
 * @returns {Promise<Array<{id, title, description, status, toolId?, resultSummary?}>>}
 */
async function generatePlan(message, agentName, apiKey, model, webSearchEnabled) {
  // 预测可能用到的工具
  const predictedTools = predictTools(message, webSearchEnabled);
  
  // 构建步骤：分析意图 → [工具步骤] → 深度分析 → 生成输出
  const steps = [];
  let stepId = 1;
  
  // 第一步：分析意图
  steps.push({
    id: stepId++,
    title: '分析问题',
    description: '理解需求，制定研究策略',
    status: 'pending',
    phase: 'analyze'
  });
  
  // 中间步骤：基于预测的工具生成
  for (const toolId of predictedTools) {
    const meta = TOOL_META[toolId] || { label: toolId, icon: '🔧' };
    steps.push({
      id: stepId++,
      title: meta.label,
      description: `${meta.icon} 正在准备...`,
      status: 'pending',
      phase: 'tool',
      toolId: toolId
    });
  }
  
  // 如果没有预测到工具，添加一个通用的信息收集步骤
  if (predictedTools.length === 0) {
    steps.push({
      id: stepId++,
      title: '信息收集',
      description: '收集相关数据和资料',
      status: 'pending',
      phase: 'collect'
    });
  }
  
  // 倒数第二步：深度分析
  steps.push({
    id: stepId++,
    title: '深度分析',
    description: '整合信息，提炼关键洞察',
    status: 'pending',
    phase: 'analyze_deep'
  });
  
  // 最后一步：生成输出
  steps.push({
    id: stepId++,
    title: '生成回答',
    description: '输出结构化的专业分析',
    status: 'pending',
    phase: 'output'
  });
  
  // 尝试用 LLM 优化步骤标题（异步，不阻塞）
  try {
    const refinedSteps = await refinePlanWithLLM(message, steps, apiKey, model);
    if (refinedSteps && refinedSteps.length > 0) {
      return refinedSteps;
    }
  } catch (e) {
    console.warn('[TaskPlanner] LLM 优化失败，使用默认计划:', e.message);
  }
  
  return steps;
}

/**
 * 用 LLM 优化步骤标题和描述（保持工具绑定不变）
 */
async function refinePlanWithLLM(message, baseSteps, apiKey, model) {
  const systemPrompt = `你是一个任务规划助手。用户提出了一个请求，我已经初步拆解了执行步骤。请优化每个步骤的标题和描述，使其更具体、更贴合用户需求。

要求：
1. 保持步骤数量不变（${baseSteps.length}个）
2. 每个步骤的 title 控制在 10 字以内
3. 每个步骤的 description 控制在 20 字以内
4. 保持原有的 id、phase、toolId 等字段不变
5. 只返回 JSON 数组

当前步骤：
${JSON.stringify(baseSteps, null, 2)}`;

  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: model || 'Qwen/Qwen2.5-7B-Instruct',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `用户请求：${message}` }
      ],
      max_tokens: 600,
      temperature: 0.3,
      stream: false
    });

    const options = {
      hostname: 'api.siliconflow.cn',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.message?.content || '';
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const refined = JSON.parse(jsonMatch[0]);
            // 确保保留原始的 phase 和 toolId
            const merged = baseSteps.map((base, i) => ({
              ...base,
              title: refined[i]?.title || base.title,
              description: refined[i]?.description || base.description,
              status: 'pending'
            }));
            resolve(merged);
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

/**
 * 根据工具调用结果更新步骤描述
 * @param {Array} steps 步骤数组
 * @param {string} toolName 工具名称
 * @param {Object} result 工具执行结果
 * @returns {Object|null} 匹配的步骤
 */
function findStepByTool(steps, toolName) {
  if (!steps) return null;
  return steps.find(s => s.toolId === toolName);
}

/**
 * 生成工具结果摘要
 * @param {string} toolName 工具名称
 * @param {Object} result 工具执行结果
 * @returns {string} 结果摘要
 */
function getToolResultSummary(toolName, result) {
  if (!result) return '';
  const count = result.searchResults ? result.searchResults.length : 0;
  const meta = TOOL_META[toolName] || {};
  
  switch (toolName) {
    case 'nmpa_search':
      return count > 0 ? `找到 ${count} 条注册信息` : '未找到匹配记录';
    case 'web_search':
      return count > 0 ? `获取 ${count} 条搜索结果` : '搜索完成';
    case 'knowledge_search':
      return count > 0 ? `匹配 ${count} 条知识文档` : '未找到相关文档';
    case 'query_med_db':
      return count > 0 ? `查询到 ${count} 条数据` : '查询完成';
    default:
      return '执行完成';
  }
}

/**
 * 默认计划（LLM 调用失败时的降级方案）
 */
function getDefaultPlan(message) {
  const hasSearch = /搜索|查询|调研|市场|竞品/.test(message);
  const hasAnalysis = /分析|对比|评估|研究/.test(message);
  const hasOutput = /报告|方案|文案|总结|输出/.test(message);

  const steps = [{ id: 1, title: '理解需求', description: '解析用户目标和关键要素', status: 'pending', phase: 'analyze' }];
  if (hasSearch) steps.push({ id: steps.length + 1, title: '信息检索', description: '搜索相关数据和资料', status: 'pending', phase: 'collect' });
  if (hasAnalysis) steps.push({ id: steps.length + 1, title: '深度分析', description: '分析关键指标和规律', status: 'pending', phase: 'analyze_deep' });
  if (hasOutput) steps.push({ id: steps.length + 1, title: '生成输出', description: '整合结果输出最终内容', status: 'pending', phase: 'output' });
  else steps.push({ id: steps.length + 1, title: '整合回复', description: '综合信息生成完整回答', status: 'pending', phase: 'output' });
  return steps;
}

/**
 * 将规划步骤通过 SSE 推送到前端
 */
function pushPlanToClient(res, steps) {
  try {
    res.write(`data: ${JSON.stringify({ type: 'task_plan', steps })}\n\n`);
  } catch (e) { /* 忽略推送错误 */ }
}

/**
 * 更新某个步骤的状态并推送
 */
function updatePlanStep(res, stepId, status) {
  try {
    res.write(`data: ${JSON.stringify({ type: 'task_plan_update', stepId, status })}\n\n`);
  } catch (e) { /* 忽略推送错误 */ }
}

module.exports = {
  needsPlanning,
  generatePlan,
  predictTools,
  findStepByTool,
  getToolResultSummary,
  pushPlanToClient,
  updatePlanStep,
  getDefaultPlan,
  TOOL_META
};
