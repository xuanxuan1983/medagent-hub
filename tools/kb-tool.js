/**
 * 混合 RAG 知识库检索工具
 */

const KB_TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "knowledge_search",
    description: "查询医美内部知识库（RAG 系统）。当用户询问内部文档、SOP、过往经验、机构专属规定、或者特定的培训资料时，必须调用此工具进行检索。系统会自动使用向量和BM25双路召回并进行重排序（Rerank）。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "检索关键词或短语，越具体越好。例如：'水光针注射SOP'、'光子嫩肤术后护理'"
        },
        top_k: {
          type: "number",
          description: "希望返回的最相关结果数量，默认 5 个。",
          default: 5
        }
      },
      required: ["query"]
    }
  }
};

/**
 * 执行知识库查询
 * @param {Object} args 工具参数
 * @param {Object} kb 知识库实例
 * @param {String} agentId Agent ID
 * @param {String} sfKey SiliconFlow API Key
 * @param {Function} bm25RetrieveFn BM25检索函数
 * @param {Function} mergeRetrievalResultsFn 合并结果函数
 * @param {Function} rerankChunksFn 重排序函数
 * @returns {Promise<Object>} 查询结果
 */
async function executeKbSearch(args, kb, agentId, sfKey, bm25RetrieveFn, mergeRetrievalResultsFn, rerankChunksFn) {
  const { query, top_k = 5 } = args;
  
  if (!kb) {
    return {
      success: false,
      content: "知识库模块未初始化。"
    };
  }

  try {
    const kbStats = kb.getStats();
    if (kbStats.totalFiles === 0) {
      return {
        success: true,
        content: "知识库为空，未找到相关内容。",
        rawResults: []
      };
    }

    // 并行执行向量检索和BM25检索
    const [vectorChunks, bm25Chunks] = await Promise.all([
      Promise.race([
        kb.retrieve(query, agentId, sfKey, top_k),
        new Promise(resolve => setTimeout(() => resolve([]), 5000))
      ]),
      (async () => {
        try {
          const globalIndex = kb.loadVectorIndex('global');
          const agentIndex = agentId ? kb.loadVectorIndex(`agent:${agentId}`) : [];
          const combined = [...globalIndex, ...agentIndex];
          return bm25RetrieveFn(query, combined, top_k);
        } catch (e) { return []; }
      })()
    ]);

    // 混合去重
    const mergedChunks = mergeRetrievalResultsFn(vectorChunks || [], bm25Chunks || [], top_k * 2);
    
    // Rerank 重排序，取前 top_k 个
    const rerankedChunks = rerankChunksFn(query, mergedChunks).slice(0, top_k);

    if (rerankedChunks.length > 0) {
      const kbContext = kb.formatKnowledgeContext(rerankedChunks);
      
      return {
        success: true,
        content: `【内部知识库参考资料】\n\n${kbContext}`,
        rawResults: rerankedChunks
      };
    }
    
    return {
      success: true,
      content: "在知识库中未找到高度相关的内容。",
      rawResults: []
    };
  } catch (error) {
    console.error('[KB Tool] 执行失败:', error.message);
    return {
      success: false,
      content: `执行知识库检索时发生错误: ${error.message}`
    };
  }
}

module.exports = {
  KB_TOOL_DEFINITION,
  executeKbSearch
};
