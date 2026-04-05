/**
 * MedAgent Hub — 深度研究模块 (Deep Research)
 * 
 * 借鉴 Youmind Board 模式的多轮迭代搜索架构：
 * 1. 主题分析：拆解研究问题为多个子查询
 * 2. 多源并行：同时查询知识库、药监局、联网搜索
 * 3. 结果评估：评估信息充分性，决定是否需要补充搜索
 * 4. 深度整合：将多源信息整合为结构化上下文
 * 
 * 触发条件：
 * - 用户消息包含"深度研究/深度分析/详细调研"等关键词
 * - 专家模式下的复杂分析任务（由 task-planner 判断）
 */
'use strict';

const https = require('https');

/**
 * 判断是否需要深度研究模式
 * @param {string} message 用户消息
 * @returns {boolean}
 */
function needsDeepResearch(message) {
  if (!message || message.length < 10) return false;
  
  // 强触发词（明确要求深度研究）
  const strongTriggers = [
    /深度(研究|分析|调研|报告)/,
    /详细(调研|分析|报告|对比)/,
    /全面(分析|调研|评估|对比)/,
    /系统(分析|梳理|整理|研究)/,
    /(帮我|请).*(深入|全面|系统|详细).*(分析|研究|调研)/,
  ];
  if (strongTriggers.some(t => t.test(message))) return true;
  
  // 普通触发词（涉及市场/品牌/竞品/策略等需要联网信息的主题）
  const normalTriggers = [
    /(竞品|竞争|市场|行业).*(分析|调研|报告|格局|趋势)/,
    /(品牌|产品|公司).*(推广|营销|运营|策略|打法)/,
    /(进入|打入|开拓|布局).*(中国|市场|渠道)/,
    /(怎么做|如何做|怎样做).*(推广|营销|运营|品牌)/,
    /(对比|比较|区别|优劣|评估).*(产品|品牌|方案)/,
    /(想知道|想了解).*(怎么|如何|策略|方案|打法)/,
    /(生成|制作|撰写|输出).*(报告|方案|分析)/,
    /包括.*(和|与|以及)/,
  ];
  if (normalTriggers.some(t => t.test(message))) return true;
  
  // 40字以上的消息默认触发（专家模式下长消息大概率是复杂问题）
  if (message.length >= 40) return true;
  
  return false;
}

/**
 * 将研究主题拆解为多个子查询
 * @param {string} message 用户消息
 * @param {string} apiKey SiliconFlow API Key
 * @returns {Promise<string[]>} 子查询列表
 */
async function decomposeQueries(message, apiKey) {
  const systemPrompt = `你是一个搜索查询优化助手。用户提出了一个研究主题，请将其拆解为 3-5 个具体的搜索查询词。

要求：
1. 每个查询词要具体、可搜索
2. 覆盖不同角度（如产品、价格、合规、市场、趋势）
3. 只返回 JSON 数组格式，每项是一个查询字符串
4. 不要有其他文字

示例输入：帮我深度分析玻尿酸填充剂市场
示例输出：["玻尿酸填充剂 市场规模 2025","玻尿酸品牌 竞品对比 价格","玻尿酸 NMPA注册证 合规","玻尿酸 最新趋势 技术创新","玻尿酸 消费者需求 医美"]`;

  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: 'Qwen/Qwen2.5-7B-Instruct',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      max_tokens: 300,
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
            const queries = JSON.parse(jsonMatch[0]);
            resolve(queries.filter(q => typeof q === 'string' && q.length > 2));
          } else {
            resolve(getDefaultQueries(message));
          }
        } catch (e) {
          resolve(getDefaultQueries(message));
        }
      });
    });

    req.on('error', () => resolve(getDefaultQueries(message)));
    req.setTimeout(6000, () => { req.destroy(); resolve(getDefaultQueries(message)); });
    req.write(body);
    req.end();
  });
}

/**
 * 默认查询拆解（LLM 失败时的降级方案）
 */
function getDefaultQueries(message) {
  // 提取关键词
  const keywords = message.replace(/帮我|请|深度|详细|全面|系统|分析|研究|调研|报告|生成|制作|撰写/g, '').trim();
  return [
    keywords,
    keywords + ' 市场分析',
    keywords + ' 最新趋势'
  ];
}

/**
 * 执行多源并行搜索
 * @param {Object} options 搜索选项
 * @returns {Promise<Object>} 搜索结果汇总
 */
async function executeParallelSearch(options) {
  const {
    queries,
    toolContext,
    toolRegistry,
    streamer,
    taskPlanSteps,
    taskPlanner
  } = options;

  const allResults = {
    knowledge: [],
    nmpa: [],
    web: [],
    meddb: [],
    totalSources: 0
  };

  // 对每个子查询执行多源搜索
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const queryLabel = `子查询 ${i + 1}/${queries.length}: ${query.substring(0, 25)}`;
    
    // 发送搜索进度
    const searchStepId = streamer.sendStep(queryLabel, 'running');

    // 并行执行多个工具
    const searchPromises = [];

    // 知识库搜索
    if (toolContext.kb) {
      searchPromises.push(
        toolRegistry.executeTool('knowledge_search', { query, top_k: 3 }, toolContext)
          .then(r => {
            if (r.searchResults && r.searchResults.length > 0) {
              allResults.knowledge.push(...r.searchResults);
              streamer.sendSearchGrouped('knowledge_search', r.searchResults);
            }
            return { tool: 'knowledge_search', result: r };
          })
          .catch(e => ({ tool: 'knowledge_search', error: e.message }))
      );
    }

    // NMPA 搜索（仅对第一个查询执行）
    if (i === 0 && toolContext.nmpaSearch) {
      searchPromises.push(
        toolRegistry.executeTool('nmpa_search', { query }, toolContext)
          .then(r => {
            if (r.searchResults && r.searchResults.length > 0) {
              allResults.nmpa.push(...r.searchResults);
              streamer.sendSearchGrouped('nmpa_search', r.searchResults);
            }
            return { tool: 'nmpa_search', result: r };
          })
          .catch(e => ({ tool: 'nmpa_search', error: e.message }))
      );
    }

    // 联网搜索
    if (toolContext.tavilyApiKey) {
      searchPromises.push(
        toolRegistry.executeTool('web_search', { query, expert_mode: true }, toolContext)
          .then(r => {
            if (r.searchResults && r.searchResults.length > 0) {
              allResults.web.push(...r.searchResults);
              streamer.sendSearchGrouped('web_search', r.searchResults);
            }
            return { tool: 'web_search', result: r };
          })
          .catch(e => ({ tool: 'web_search', error: e.message }))
      );
    }

    // 等待所有搜索完成
    const results = await Promise.allSettled(searchPromises);
    
    // 更新步骤状态
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value && !r.value.error).length;
    streamer.updateStep(searchStepId, `${queryLabel} (${successCount} 个来源)`, 'done');
  }

  // 计算总来源数
  allResults.totalSources = allResults.knowledge.length + allResults.nmpa.length + allResults.web.length + allResults.meddb.length;

  return allResults;
}

/**
 * 将多源搜索结果整合为结构化上下文
 * @param {Object} allResults 搜索结果汇总
 * @returns {string} 整合后的上下文文本
 */
function buildResearchContext(allResults) {
  let context = '';

  if (allResults.knowledge.length > 0) {
    context += '\n\n===== 内部知识库检索结果 =====\n';
    // 去重
    const seen = new Set();
    allResults.knowledge.forEach((r, i) => {
      const key = r.title || r.fileName || '';
      if (seen.has(key)) return;
      seen.add(key);
      context += `[知识库-${i + 1}] ${r.title || r.fileName || '文档'}\n`;
      if (r.content) context += r.content.substring(0, 800) + '\n';
    });
  }

  if (allResults.nmpa.length > 0) {
    context += '\n\n===== 国家药监局注册信息 =====\n';
    allResults.nmpa.forEach((r, i) => {
      context += `[药监局-${i + 1}] ${r.title || '记录'}\n`;
      if (r.url) context += `链接: ${r.url}\n`;
      if (r.snippet) context += `摘要: ${r.snippet}\n`;
    });
  }

  if (allResults.web.length > 0) {
    context += '\n\n===== 联网搜索最新信息 =====\n';
    // 去重
    const seen = new Set();
    allResults.web.forEach((r, i) => {
      const key = r.url || r.title || '';
      if (seen.has(key)) return;
      seen.add(key);
      context += `[联网-${i + 1}] ${r.title || '网页'}\n`;
      if (r.url) context += `来源: ${r.url}\n`;
      if (r.content) context += `摘要: ${r.content.substring(0, 500)}\n`;
      // 包含原始网页内容（如果有）
      if (r.raw_content) context += `详细内容: ${r.raw_content.substring(0, 1500)}\n`;
    });
  }

  return context;
}

module.exports = {
  needsDeepResearch,
  decomposeQueries,
  executeParallelSearch,
  buildResearchContext,
  getDefaultQueries
};
