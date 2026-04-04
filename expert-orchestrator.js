'use strict';
/**
 * MedAgent Hub — 专家模式编排器 v1.0
 *
 * 功能：
 * 1. 接收用户复杂问题，执行五阶段 ReAct 深度思考流程
 * 2. 多源信息并行收集（NMPA、向量记忆、RAG、MedDB、联网搜索）
 * 3. 调用 DeepSeek-R1（SaaS 版）或本地 Gemma 4 26B MoE（私有化版）进行深度推理
 * 4. 通过 SSE 向前端实时推送思考过程、任务步骤和最终回答
 *
 * 设计原则：纯增量新增，不修改任何现有模块
 */

const fetch = require('node-fetch');

// ===== 专家模式专用 System Prompt =====
const EXPERT_SYSTEM_PROMPT = `你是 MedAgent Hub 的专家模式引擎，拥有医美行业最深度的专业知识。

在专家模式下，你必须：
1. 对问题进行深度、多角度的分析，不满足于表面答案
2. 主动引用你所掌握的行业数据、合规信息和历史案例
3. 输出结构化的专业报告，包含：背景分析、核心洞察、具体建议、风险提示
4. 在回答末尾标注关键信息的来源依据
5. 使用 Markdown 格式，包含标题、表格和重点标注

你的回答质量标准：一位拥有10年经验的医美行业顾问会给出的专业意见。`;

// ===== 专家模式触发判断 =====
function isComplexQuery(message) {
  const complexPatterns = [
    /(分析|调研|制定|规划|设计|评估|对比).*(方案|策略|报告|计划)/,
    /(帮我|请).{0,10}(写|生成|制作|整理|起草)/,
    /为什么.{10,}|如何.{20,}/,
    message.length > 60
  ];
  return complexPatterns.some(p => typeof p === 'boolean' ? p : p.test(message));
}

// ===== 核心编排函数 =====
async function runExpertPipeline(options) {
  const {
    message,
    session,
    res,
    // 依赖注入：复用现有模块
    vectorMemory,
    db,
    nmpaSearch,
    detectNmpaProduct,
    bochaSearch,
    notionClient,
    searchNotion,
    knowledgeBase,
    medaestheticsDb,
    taskPlanner,
    getUserPlanStatus,
    siliconflowApiKey,
    siliconflowModel,
  } = options;

  const userCode = session.userCode || '';
  const agentId = session.agentId || 'doudou';

  // ===== SSE 辅助函数 =====
  function send(obj) {
    try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch (e) { /* 连接已关闭 */ }
  }

  // ===== 阶段 1：意图分析 + 任务分解 =====
  send({ type: 'expert_start', message: '专家模式已启动，正在深度分析问题...' });

  let planSteps = [];
  try {
    planSteps = await taskPlanner.generatePlan(message, session.agentName || 'MedAgent', siliconflowApiKey, 'Qwen/Qwen2.5-7B-Instruct');
    send({ type: 'task_plan', steps: planSteps });
    console.log(`[ExpertMode] 任务分解完成，共 ${planSteps.length} 步`);
  } catch (e) {
    console.warn('[ExpertMode] 任务分解失败，使用默认步骤:', e.message);
    planSteps = [
      { id: 1, title: '信息收集', description: '检索相关数据和历史记录', status: 'pending' },
      { id: 2, title: '深度分析', description: '多角度分析问题', status: 'pending' },
      { id: 3, title: '生成报告', description: '输出结构化专业建议', status: 'pending' }
    ];
    send({ type: 'task_plan', steps: planSteps });
  }

  // ===== 阶段 2：多源信息并行收集 =====
  send({ type: 'task_plan_update', stepId: planSteps[0]?.id || 1, status: 'running' });
  send({ type: 'tool_call', tool: 'expert_gather', message: '正在并行收集多源信息...' });

  let enrichedContext = '';
  const contextParts = [];

  // 并行执行所有信息收集
  await Promise.allSettled([
    // 1. 向量记忆检索
    (async () => {
      try {
        if (siliconflowApiKey && session.messages.length >= 2) {
          const memories = await vectorMemory.retrieveMemories(db, userCode, agentId, message, siliconflowApiKey);
          if (memories.length > 0) {
            const memCtx = vectorMemory.formatMemoriesForPrompt(memories);
            contextParts.push({ priority: 1, content: memCtx });
            send({ type: 'memory_retrieved', count: memories.length });
            console.log(`[ExpertMode] 向量记忆: ${memories.length} 条`);
          }
        }
      } catch (e) { console.warn('[ExpertMode] 向量记忆跳过:', e.message); }
    })(),

    // 2. NMPA 合规查询
    (async () => {
      try {
        const products = detectNmpaProduct(message);
        if (products) {
          const nmpaData = await nmpaSearch(message, products);
          if (nmpaData.success && nmpaData.results.length > 0) {
            const nmpaCtx = nmpaData.results.map(r =>
              `[来源] ${r.title}\n链接: ${r.url}\n摘要: ${r.snippet}`
            ).join('\n\n');
            contextParts.push({
              priority: 2,
              content: `\n\n===== 药监局实时注册信息 =====\n${nmpaCtx}`
            });
            send({ type: 'tool_call', tool: 'nmpa_search', products, message: `查询到 ${nmpaData.results.length} 条合规信息` });
            console.log(`[ExpertMode] NMPA: ${nmpaData.results.length} 条`);
          }
        }
      } catch (e) { console.warn('[ExpertMode] NMPA跳过:', e.message); }
    })(),

    // 3. 医美本地数据库
    (async () => {
      try {
        if (medaestheticsDb) {
          const result = medaestheticsDb.queryMedAestheticsDB(message, 'general');
          if (result.summary && result.summary.trim().length > 20) {
            contextParts.push({
              priority: 3,
              content: `\n\n===== 医美价格与合规数据库 =====\n${result.summary}`
            });
            send({ type: 'tool_call', tool: 'query_med_db', message: '已查询本地医美数据库' });
          }
        }
      } catch (e) { console.warn('[ExpertMode] MedDB跳过:', e.message); }
    })(),

    // 4. RAG 知识库检索
    (async () => {
      try {
        if (knowledgeBase && siliconflowApiKey) {
          const chunks = await Promise.race([
            knowledgeBase.retrieve(message, agentId, siliconflowApiKey, 5),
            new Promise(resolve => setTimeout(() => resolve([]), 8000))
          ]);
          if (chunks && chunks.length > 0) {
            const kbCtx = knowledgeBase.formatKnowledgeContext(chunks);
            contextParts.push({ priority: 4, content: '\n\n' + kbCtx });
            send({ type: 'tool_call', tool: 'knowledge_base', message: `知识库检索到 ${chunks.length} 段相关内容` });
            console.log(`[ExpertMode] RAG: ${chunks.length} 段`);
          }
        }
      } catch (e) { console.warn('[ExpertMode] RAG跳过:', e.message); }
    })(),

    // 5. 联网搜索（仅对时效性问题触发）
    (async () => {
      try {
        const needsWeb = /最新|今年|2025|2026|趋势|行情|新品|刚上市/.test(message);
        if (needsWeb && bochaSearch) {
          const searchData = await bochaSearch(message, 3);
          if (searchData.success && searchData.results.length > 0) {
            const searchCtx = searchData.results.map(r =>
              `[${r.index}] ${r.title}\n来源: ${r.url}\n摘要: ${r.snippet}`
            ).join('\n\n');
            contextParts.push({
              priority: 5,
              content: `\n\n===== 联网搜索最新资讯 =====\n${searchCtx}`
            });
            send({ type: 'tool_call', tool: 'web_search', message: `联网搜索到 ${searchData.results.length} 条最新资讯` });
          }
        }
      } catch (e) { console.warn('[ExpertMode] 联网搜索跳过:', e.message); }
    })()
  ]);

  // 按优先级合并上下文
  contextParts.sort((a, b) => a.priority - b.priority);
  enrichedContext = contextParts.map(p => p.content).join('');

  send({ type: 'task_plan_update', stepId: planSteps[0]?.id || 1, status: 'done' });

  // ===== 阶段 3：构建深度推理 Prompt =====
  send({ type: 'task_plan_update', stepId: planSteps[1]?.id || 2, status: 'running' });

  const expertSystemPrompt = EXPERT_SYSTEM_PROMPT +
    (session.systemPrompt ? `\n\n===== 当前 Agent 专业背景 =====\n${session.systemPrompt}` : '') +
    enrichedContext;

  // 历史消息（最多保留最近 10 轮，节省 Token）
  const recentMessages = session.messages.slice(-20);

  // ===== 阶段 4：调用深度推理模型（DeepSeek-R1 via SiliconFlow）=====
  const expertModel = process.env.EXPERT_MODEL || 'Pro/deepseek-ai/DeepSeek-R1';
  const expertApiKey = siliconflowApiKey;
  const expertBaseUrl = process.env.EXPERT_BASE_URL || 'https://api.siliconflow.cn/v1';

  console.log(`[ExpertMode] 调用深度推理模型: ${expertModel}`);

  const requestBody = {
    model: expertModel,
    messages: [
      { role: 'system', content: expertSystemPrompt },
      ...recentMessages,
      { role: 'user', content: message }
    ],
    temperature: 0.6,
    max_tokens: 4096,
    stream: true
  };

  let streamResponse;
  try {
    streamResponse = await fetch(`${expertBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${expertApiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!streamResponse.ok) {
      const errText = await streamResponse.text();
      throw new Error(`Expert model API error ${streamResponse.status}: ${errText}`);
    }
  } catch (e) {
    console.error('[ExpertMode] 模型调用失败:', e.message);
    send({ type: 'delta', content: `\n\n> 专家模式暂时不可用，已切换到标准模式。错误：${e.message}` });
    send({ type: 'done' });
    return;
  }

  // ===== 阶段 5：流式解析并推送到前端 =====
  let fullContent = '';
  let reasoningContent = '';
  let inReasoning = false;
  let buf = '';

  try {
    for await (const chunk of streamResponse.body) {
      buf += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      const lines = buf.split('\n');
      buf = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const s = line.slice(6).trim();
        if (s === '[DONE]') continue;

        let parsed;
        try { parsed = JSON.parse(s); } catch (e) { continue; }

        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        // 处理 reasoning_content（DeepSeek-R1 专属）
        if (delta.reasoning_content) {
          reasoningContent += delta.reasoning_content;
          // 以 SSE event:reasoning 格式推送，复用前端现有的 reasoning-box 渲染
          res.write(`event: reasoning\ndata: ${JSON.stringify({ content: delta.reasoning_content })}\n\n`);
        }

        // 处理正文内容
        if (delta.content) {
          fullContent += delta.content;
          send({ type: 'delta', content: delta.content });
        }
      }
    }
  } catch (e) {
    console.error('[ExpertMode] 流式解析错误:', e.message);
  }

  // ===== 完成：更新步骤状态 =====
  send({ type: 'task_plan_update', stepId: planSteps[1]?.id || 2, status: 'done' });
  if (planSteps[2]) {
    send({ type: 'task_plan_update', stepId: planSteps[2].id, status: 'done' });
  }
  send({ type: 'done' });

  console.log(`[ExpertMode] 完成 | 推理: ${reasoningContent.length} chars | 回答: ${fullContent.length} chars`);

  return { fullContent, reasoningContent };
}

module.exports = { runExpertPipeline, isComplexQuery };
