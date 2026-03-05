/**
 * MedAgent 医美行业资讯实时抓取模块
 * 抓取来源：医美部落、动脉网、美业观察、新氧等公开RSS/页面
 * 缓存策略：内存缓存2小时，避免频繁请求
 */

const https = require('https');
const http = require('http');

// ============================================================
// 资讯缓存（内存缓存，2小时TTL）
// ============================================================
const newsCache = {
  data: [],
  lastFetch: 0,
  TTL: 2 * 60 * 60 * 1000  // 2小时
};

// ============================================================
// RSS 源配置（医美行业公开RSS）
// ============================================================
const RSS_SOURCES = [
  {
    name: '医美部落',
    url: 'https://www.medbelove.com/feed',
    type: 'rss',
    category: '行业资讯'
  },
  {
    name: '动脉网（医美标签）',
    url: 'https://vcbeat.top/tag/%E5%8C%BB%E7%BE%8E/feed',
    type: 'rss',
    category: '投融资'
  }
];

// ============================================================
// 工具函数：HTTP 请求（支持 http 和 https）
// ============================================================
function fetchUrl(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MedAgentBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      },
      timeout
    }, (res) => {
      // 处理重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, timeout).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ============================================================
// RSS 解析（简单正则，无需外部库）
// ============================================================
function parseRSS(xmlText, sourceName, category) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemXml = match[1];

    const titleMatch = itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
                       itemXml.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/) ||
                      itemXml.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/);
    const descMatch = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
                      itemXml.match(/<description>([\s\S]*?)<\/description>/);
    const dateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/);

    if (titleMatch && linkMatch) {
      const title = titleMatch[1].trim().replace(/<[^>]+>/g, '');
      const link = linkMatch[1].trim();
      const desc = descMatch ? descMatch[1].trim().replace(/<[^>]+>/g, '').substring(0, 200) : '';
      const pubDate = dateMatch ? new Date(dateMatch[1].trim()) : new Date();

      items.push({
        title,
        url: link,
        summary: desc,
        source: sourceName,
        category,
        publishedAt: pubDate.toISOString(),
        timestamp: pubDate.getTime()
      });
    }
  }

  return items;
}

// ============================================================
// 抓取所有 RSS 源
// ============================================================
async function fetchAllNews() {
  const allItems = [];

  for (const source of RSS_SOURCES) {
    try {
      const xml = await fetchUrl(source.url);
      const items = parseRSS(xml, source.name, source.category);
      allItems.push(...items);
      console.log(`✅ [资讯抓取] ${source.name}: ${items.length} 条`);
    } catch (e) {
      console.warn(`⚠️ [资讯抓取] ${source.name} 失败: ${e.message}`);
    }
  }

  // 按时间排序，最新的在前
  allItems.sort((a, b) => b.timestamp - a.timestamp);

  return allItems.slice(0, 50);  // 最多保留50条
}

// ============================================================
// 获取资讯（带缓存）
// ============================================================
async function getNews(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && newsCache.data.length > 0 && (now - newsCache.lastFetch) < newsCache.TTL) {
    return newsCache.data;
  }

  try {
    const news = await fetchAllNews();
    if (news.length > 0) {
      newsCache.data = news;
      newsCache.lastFetch = now;
    }
    return newsCache.data;
  } catch (e) {
    console.warn('[资讯模块] 抓取失败，返回缓存:', e.message);
    return newsCache.data;
  }
}

// ============================================================
// 根据关键词搜索资讯
// ============================================================
async function searchNews(query, topK = 5) {
  const news = await getNews();
  if (!news || news.length === 0) return [];

  const kw = query.toLowerCase();
  const keywords = kw.split(/[\s，,、]+/).filter(k => k.length >= 2);

  const scored = news.map(item => {
    const text = (item.title + ' ' + item.summary).toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (item.title.toLowerCase().includes(kw)) score += 3;  // 标题匹配权重更高
      if (item.summary.toLowerCase().includes(kw)) score += 1;
    }
    return { ...item, score };
  }).filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || b.timestamp - a.timestamp);

  return scored.slice(0, topK);
}

// ============================================================
// 格式化资讯结果为文本
// ============================================================
function formatNewsResult(newsItems) {
  if (!newsItems || newsItems.length === 0) return null;

  return newsItems.map((item, i) => {
    const date = new Date(item.publishedAt).toLocaleDateString('zh-CN');
    return `[${i + 1}] ${item.title}\n来源：${item.source} | 日期：${date}\n摘要：${item.summary}\n链接：${item.url}`;
  }).join('\n\n');
}

// ============================================================
// 获取最新行业动态（用于趋势查询）
// ============================================================
async function getLatestTrends(limit = 8) {
  const news = await getNews();
  return news.slice(0, limit);
}

module.exports = {
  getNews,
  searchNews,
  formatNewsResult,
  getLatestTrends
};
