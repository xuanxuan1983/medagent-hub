/**
 * MedAgent Hub — 任务规划层 (Task Planner)
 * 
 * 功能：
 * 1. 意图判断：检测用户消息是否需要多步骤规划
 * 2. 任务分解：调用 LLM 将复杂目标拆解为 3-5 个子任务
 * 3. 进度推送：通过 SSE 将规划步骤推送到前端任务监控面板
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
 * 调用 LLM 生成任务计划
 * @param {string} message 用户消息
 * @param {string} agentName Agent 名称
 * @param {string} apiKey SiliconFlow API Key
 * @param {string} model 模型名称
 * @returns {Promise<Array<{id, title, description, status}>>}
 */
async function generatePlan(message, agentName, apiKey, model) {
  const systemPrompt = `你是一个任务规划助手。用户提出了一个复杂请求，请将其拆解为 3-5 个清晰的执行步骤。

要求：
1. 每个步骤要具体、可执行
2. 步骤之间有逻辑顺序
3. 最后一步通常是"生成最终输出"
4. 用JSON数组格式返回，每项包含 id(数字)、title(步骤标题，10字以内)、description(步骤说明，20字以内)

只返回JSON数组，不要有其他文字。示例：
[{"id":1,"title":"信息收集","description":"搜索相关数据和资料"},{"id":2,"title":"数据分析","description":"分析关键指标和趋势"},{"id":3,"title":"生成报告","description":"整合分析结果输出报告"}]`;

  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: model || 'Qwen/Qwen2.5-7B-Instruct',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请为以下请求制定执行计划：\n${message}` }
      ],
      max_tokens: 400,
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
          // 提取 JSON 数组
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const steps = JSON.parse(jsonMatch[0]);
            resolve(steps.map(s => ({ ...s, status: 'pending' })));
          } else {
            resolve(getDefaultPlan(message));
          }
        } catch (e) {
          resolve(getDefaultPlan(message));
        }
      });
    });

    req.on('error', () => resolve(getDefaultPlan(message)));
    req.setTimeout(8000, () => { req.destroy(); resolve(getDefaultPlan(message)); });
    req.write(body);
    req.end();
  });
}

/**
 * 默认计划（LLM 调用失败时的降级方案）
 */
function getDefaultPlan(message) {
  const hasSearch = /搜索|查询|调研|市场|竞品/.test(message);
  const hasAnalysis = /分析|对比|评估|研究/.test(message);
  const hasOutput = /报告|方案|文案|总结|输出/.test(message);

  const steps = [{ id: 1, title: '理解需求', description: '解析用户目标和关键要素', status: 'pending' }];
  if (hasSearch) steps.push({ id: steps.length + 1, title: '信息检索', description: '搜索相关数据和资料', status: 'pending' });
  if (hasAnalysis) steps.push({ id: steps.length + 1, title: '深度分析', description: '分析关键指标和规律', status: 'pending' });
  if (hasOutput) steps.push({ id: steps.length + 1, title: '生成输出', description: '整合结果输出最终内容', status: 'pending' });
  else steps.push({ id: steps.length + 1, title: '整合回复', description: '综合信息生成完整回答', status: 'pending' });
  return steps;
}

/**
 * 将规划步骤通过 SSE 推送到前端
 * @param {Object} res HTTP 响应对象
 * @param {Array} steps 步骤数组
 */
function pushPlanToClient(res, steps) {
  try {
    res.write(`data: ${JSON.stringify({ type: 'task_plan', steps })}\n\n`);
  } catch (e) {
    // 忽略推送错误
  }
}

/**
 * 更新某个步骤的状态并推送
 * @param {Object} res HTTP 响应对象
 * @param {number} stepId 步骤 ID
 * @param {string} status 'running' | 'done' | 'error'
 */
function updatePlanStep(res, stepId, status) {
  try {
    res.write(`data: ${JSON.stringify({ type: 'task_plan_update', stepId, status })}\n\n`);
  } catch (e) {
    // 忽略推送错误
  }
}

module.exports = {
  needsPlanning,
  generatePlan,
  pushPlanToClient,
  updatePlanStep,
  getDefaultPlan
};
