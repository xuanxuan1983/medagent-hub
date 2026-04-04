/**
 * NMPA (国家药监局) 查询工具
 */

const NMPA_TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "nmpa_search",
    description: "查询国家药品监督管理局（NMPA）的医疗器械和药品注册信息。当用户询问医美产品（如玻尿酸、肉毒素、光电仪器等）是否合规、是否有批文，或者询问产品的具体注册证号、适用范围时，必须调用此工具。如果用户问题中包含具体的品牌或产品名称，请提取出来作为参数传入。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "用户的原始查询问题"
        },
        products: {
          type: "array",
          items: {
            type: "string"
          },
          description: "从用户问题中提取的医美产品名称或品牌列表（如：['保妥适', '嗨体']）。如果没有明确提到具体产品，可传空数组。"
        }
      },
      required: ["query"]
    }
  }
};

/**
 * 执行 NMPA 查询
 * @param {Object} args 工具参数
 * @param {Function} nmpaSearchFn 原始的 NMPA 查询函数
 * @returns {Promise<Object>} 查询结果
 */
async function executeNmpaSearch(args, nmpaSearchFn) {
  const { query, products = [] } = args;
  try {
    const nmpaData = await nmpaSearchFn(query, products);
    if (nmpaData.success && nmpaData.results && nmpaData.results.length > 0) {
      const resultsText = nmpaData.results.map(r =>
        `[来源] ${r.title}\n链接: ${r.url}\n摘要: ${r.snippet}`
      ).join('\n\n');
      
      return {
        success: true,
        content: `找到了 ${nmpaData.results.length} 条相关的药监局注册信息：\n\n${resultsText}`,
        rawResults: nmpaData.results
      };
    }
    return {
      success: true,
      content: "未找到相关的药监局数据。可能该产品未在国内注册，或者名称不准确。",
      rawResults: []
    };
  } catch (error) {
    console.error('[NMPA Tool] 执行失败:', error.message);
    return {
      success: false,
      content: `查询药监局数据时发生错误: ${error.message}`
    };
  }
}

module.exports = {
  NMPA_TOOL_DEFINITION,
  executeNmpaSearch
};
