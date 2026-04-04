/**
 * Tavily AI Search 联网搜索工具
 */

const TAVILY_TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "web_search",
    description: "联网搜索最新行业资讯、新闻、价格、政策变动等实时信息。当用户询问最近发生的事情、趋势、当前价格或要求查阅最新资料时，或者当你觉得自身知识可能过时（如2024年以后的信息）时，必须调用此工具进行全网搜索。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索关键词。尽量简洁、准确，可以包含年份或特定领域词汇以提高准确度（例如：'2024 医美行业 政策'）"
        },
        search_depth: {
          type: "string",
          enum: ["basic", "advanced"],
          description: "搜索深度。'basic' 较快，适合普通查询；'advanced' 更慢但更深入全面，适合复杂调研。"
        }
      },
      required: ["query"]
    }
  }
};

/**
 * 执行 Tavily 搜索
 * @param {Object} args 工具参数
 * @param {String} apiKey Tavily API Key
 * @returns {Promise<Object>} 查询结果
 */
async function executeTavilySearch(args, apiKey) {
  const { query, search_depth = "basic" } = args;
  
  if (!apiKey) {
    return {
      success: false,
      content: "未配置 Tavily API Key，无法执行联网搜索。"
    };
  }

  const https = require('https');
  const data = JSON.stringify({
    api_key: apiKey,
    query: query,
    search_depth: search_depth,
    include_answer: false,
    include_images: false,
    include_raw_content: false,
    max_results: 5
  });

  const options = {
    hostname: 'api.tavily.com',
    port: 443,
    path: '/search',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  try {
    const tavilyData = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let resData = '';
        res.on('data', chunk => resData += chunk);
        res.on('end', () => {
          try { 
            resolve(JSON.parse(resData)); 
          } catch(e) { 
            reject(new Error("解析 Tavily 响应失败")); 
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(8000, () => { 
        req.destroy(); 
        reject(new Error("Tavily 搜索超时")); 
      });
      req.write(data);
      req.end();
    });

    if (tavilyData && tavilyData.results && tavilyData.results.length > 0) {
      const searchDate = new Date().toLocaleDateString('zh-CN', {timeZone:'Asia/Shanghai'});
      const items = tavilyData.results.slice(0, 5);
      
      const resultsText = items.map((item, i) =>
        `[${i+1}] ${item.title}\n来源: ${item.url}\n摘要: ${item.content}`
      ).join('\n\n');
      
      return {
        success: true,
        content: `【实时搜索结果（${searchDate}）】\n\n${resultsText}`,
        rawResults: items
      };
    }
    
    return {
      success: true,
      content: "实时搜索：未获取到相关结果。",
      rawResults: []
    };
  } catch (error) {
    console.error('[Tavily Tool] 执行失败:', error.message);
    return {
      success: false,
      content: `执行联网搜索时发生错误: ${error.message}`
    };
  }
}

module.exports = {
  TAVILY_TOOL_DEFINITION,
  executeTavilySearch
};
