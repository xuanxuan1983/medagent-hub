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
  const { query, search_depth = "basic", expert_mode = false } = args;
  
  if (!apiKey) {
    return {
      success: false,
      content: "未配置 Tavily API Key，无法执行联网搜索。"
    };
  }

  // 专家模式下使用更深度的搜索配置
  const isDeep = expert_mode || search_depth === 'advanced';
  const https = require('https');
  const data = JSON.stringify({
    api_key: apiKey,
    query: query,
    search_depth: isDeep ? 'advanced' : search_depth,
    include_answer: isDeep,
    include_images: false,
    include_raw_content: isDeep,
    max_results: isDeep ? 8 : 5
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
      const maxItems = isDeep ? 8 : 5;
      const items = tavilyData.results.slice(0, maxItems);
      
      const resultsText = items.map((item, i) => {
        let text = `[${i+1}] ${item.title}\n来源: ${item.url}\n摘要: ${item.content}`;
        // 深度模式下附加原始网页内容（截取前2000字）
        if (isDeep && item.raw_content) {
          text += `\n详细内容: ${item.raw_content.substring(0, 2000)}`;
        }
        return text;
      }).join('\n\n');
      
      // 如果 Tavily 返回了 AI 摘要，附加到内容前面
      let answerSection = '';
      if (tavilyData.answer && isDeep) {
        answerSection = `【AI 搜索摘要】\n${tavilyData.answer}\n\n`;
      }
      
      // rawResults 保留完整的 Tavily 结果对象（包含 raw_content）
      return {
        success: true,
        content: `${answerSection}【实时搜索结果（${searchDate}）】\n\n${resultsText}`,
        rawResults: items.map(item => ({
          title: item.title,
          url: item.url,
          content: item.content,
          raw_content: item.raw_content || null,
          score: item.score
        })),
        answer: tavilyData.answer || null
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
