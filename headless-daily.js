/**
 * MedAgent Hub — 医美行业日报无头模式 (Headless Daily Agent) v2.0
 *
 * 数据源架构（双轨并行）：
 *   国内轨道：Bocha 联网搜索 → 新氧、丽格、医美头条、NMPA 等中文媒体
 *   海外轨道：last30days-skill → Instagram、TikTok、YouTube 真实社交内容
 *
 * 流程：
 *   1. Bocha 多主题并行搜索（国内医美新闻）
 *   2. last30days Python 脚本（海外社交媒体趋势）
 *   3. LLM 整合双轨数据，生成结构化日报
 *   4. 写入 daily-briefs.json，供 /api/daily-brief/latest 接口使用
 *
 * 调度：PM2 cron 每天 08:00 触发，或通过 node headless-daily.js 手动运行
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execFile } = require('child_process');

// ============================================================
// 环境变量
// ============================================================
const BOCHA_API_KEY       = process.env.BOCHA_API_KEY;
const AI_PROVIDER         = process.env.AI_PROVIDER || 'siliconflow';
const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY;
const DEEPSEEK_API_KEY    = process.env.DEEPSEEK_API_KEY;

// last30days-skill 路径（优先检查 ~/.agents/skills/last30days）
const LAST30_SCRIPT = (() => {
  const candidates = [
    path.join(process.env.HOME || '/root', '.agents/skills/last30days/scripts/last30days.py'),
    path.join(process.env.HOME || '/root', '.claude/skills/last30days/scripts/last30days.py'),
    '/opt/last30days/scripts/last30days.py',
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
})();

const BRIEF_FILE = path.join(__dirname, 'daily-briefs.json');

// ============================================================
// 工具函数：HTTP POST（支持 http 和 https）
// ============================================================
function httpPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? https : http;
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

// ============================================================
// 国内轨道：Bocha 联网搜索（真实新闻，非 AI 生成）
// ============================================================
async function searchBocha(query, count = 5) {
  if (!BOCHA_API_KEY) {
    console.warn('[Daily] Bocha API Key 未配置，跳过国内搜索');
    return [];
  }
  try {
    const result = await httpPost(
      'https://api.bochaai.com/v1/web-search',
      { Authorization: `Bearer ${BOCHA_API_KEY}` },
      { query, freshness: 'oneDay', summary: true, count }
    );
    const items = result?.data?.webPages?.value || [];
    return items.map(item => ({
      title:         item.name || '',
      snippet:       item.snippet || item.summary || '',
      url:           item.url || '',
      datePublished: item.datePublished || '',
      source:        'bocha',
    }));
  } catch (e) {
    console.warn('[Daily] Bocha 搜索失败:', e.message);
    return [];
  }
}

async function gatherDomesticNews() {
  const topics = [
    { key: 'trend',      query: '医美行业最新动态 新品上市 政策法规 2026' },
    { key: 'product',    query: '医美热门项目 水光针 肉毒素 热玛吉 最新价格趋势' },
    { key: 'regulation', query: '医美监管 NMPA 医疗美容 合规 最新政策' },
    { key: 'market',     query: '医美市场 机构动态 融资 并购 新氧 更美' },
  ];

  console.log('[Daily] 🇨🇳 开始抓取国内医美新闻（Bocha）...');
  const results = {};
  for (const topic of topics) {
    const items = await searchBocha(topic.query, 4);
    results[topic.key] = items;
    console.log(`[Daily]   ${topic.key}: ${items.length} 条`);
    await new Promise(r => setTimeout(r, 400));
  }
  return results;
}

// ============================================================
// 海外轨道：last30days-skill（Instagram / TikTok / YouTube）
// ============================================================
function runLast30Days(topic, sources = 'instagram,tiktok,youtube') {
  return new Promise((resolve) => {
    if (!LAST30_SCRIPT) {
      console.warn('[Daily] last30days-skill 未安装，跳过海外数据源');
      return resolve({ items: [], error: 'not_installed' });
    }

    const args = [
      LAST30_SCRIPT,
      topic,
      '--quick',
      '--emit=json',
      '--no-native-web',
      `--search=${sources}`,
    ];

    // 透传 ScrapeCreators Key（如果 .env 文件已配置则自动读取，这里额外透传）
    const env = {
      ...process.env,
      HOME: process.env.HOME || '/root',
    };

    console.log(`[Daily] 🌍 运行 last30days: ${topic} (sources: ${sources})`);

    const child = execFile('python3', args, {
      env,
      timeout: 90000,   // 90 秒超时
      maxBuffer: 5 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error && error.code !== 0) {
        console.warn('[Daily] last30days 运行错误:', error.message?.slice(0, 200));
      }
      if (stderr) {
        // 只打印关键信息，过滤掉进度条
        const importantLines = stderr.split('\n')
          .filter(l => l.includes('[Error]') || l.includes('Found') || l.includes('✓') || l.includes('✅'))
          .join('\n');
        if (importantLines) console.log('[Daily] last30days:', importantLines);
      }

      // 解析 JSON 输出
      try {
        // last30days --emit=json 输出可能包含多个 JSON 对象，取最后一个完整的
        const jsonMatches = stdout.match(/\{[\s\S]*\}/g);
        if (jsonMatches && jsonMatches.length > 0) {
          const parsed = JSON.parse(jsonMatches[jsonMatches.length - 1]);
          const items = extractSocialItems(parsed);
          console.log(`[Daily]   海外社交数据: ${items.length} 条`);
          return resolve({ items, raw: parsed });
        }
      } catch (e) {
        console.warn('[Daily] last30days JSON 解析失败:', e.message);
      }

      // 如果 JSON 解析失败，尝试从 compact 格式提取
      const items = parseCompactOutput(stdout);
      console.log(`[Daily]   海外社交数据（compact 解析）: ${items.length} 条`);
      resolve({ items });
    });

    // 确保子进程在超时后被杀死
    setTimeout(() => {
      try { child.kill('SIGTERM'); } catch (_) {}
    }, 92000);
  });
}

/**
 * 从 last30days JSON 输出中提取社交媒体内容
 */
function extractSocialItems(parsed) {
  const items = [];

  // Instagram Reels
  const igItems = parsed?.instagram_items || parsed?.instagram || [];
  for (const item of igItems) {
    if (item.caption || item.title) {
      items.push({
        source:   'instagram',
        platform: 'Instagram',
        title:    item.title || item.caption?.slice(0, 80) || '',
        snippet:  item.caption || item.transcript_snippet || '',
        url:      item.url || '',
        views:    item.views || 0,
        likes:    item.likes || 0,
        creator:  item.creator || item.username || '',
        date:     item.date || '',
      });
    }
  }

  // TikTok
  const tkItems = parsed?.tiktok_items || parsed?.tiktok || [];
  for (const item of tkItems) {
    if (item.caption || item.title) {
      items.push({
        source:   'tiktok',
        platform: 'TikTok',
        title:    item.title || item.caption?.slice(0, 80) || '',
        snippet:  item.caption || '',
        url:      item.url || '',
        views:    item.views || 0,
        likes:    item.likes || 0,
        creator:  item.creator || item.username || '',
        date:     item.date || '',
      });
    }
  }

  // YouTube
  const ytItems = parsed?.youtube_items || parsed?.youtube || [];
  for (const item of ytItems) {
    if (item.title) {
      items.push({
        source:   'youtube',
        platform: 'YouTube',
        title:    item.title || '',
        snippet:  item.transcript_highlights || item.description || '',
        url:      item.url || '',
        views:    item.views || 0,
        likes:    item.likes || 0,
        creator:  item.channel || item.creator || '',
        date:     item.date || '',
      });
    }
  }

  return items;
}

/**
 * 从 compact 文本格式提取内容（备用解析器）
 */
function parseCompactOutput(text) {
  const items = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 匹配 Instagram: **IG1** (score:N) @creator ...
    if (line.includes('instagram.com/reel/') || line.includes('@') && line.includes('views')) {
      const urlMatch = line.match(/https:\/\/www\.instagram\.com\/reel\/[^\s)]+/);
      const captionLine = lines[i + 1] || '';
      if (urlMatch) {
        items.push({
          source:   'instagram',
          platform: 'Instagram',
          title:    captionLine.slice(0, 80),
          snippet:  captionLine,
          url:      urlMatch[0],
          views:    0,
          likes:    0,
          creator:  '',
          date:     '',
        });
      }
    }
    // 匹配 TikTok
    if (line.includes('tiktok.com/')) {
      const urlMatch = line.match(/https:\/\/www\.tiktok\.com\/[^\s)]+/);
      if (urlMatch) {
        items.push({
          source:   'tiktok',
          platform: 'TikTok',
          title:    (lines[i + 1] || '').slice(0, 80),
          snippet:  lines[i + 1] || '',
          url:      urlMatch[0],
          views:    0,
          likes:    0,
          creator:  '',
          date:     '',
        });
      }
    }
  }

  return items;
}

// ============================================================
// LLM 生成结构化日报
// ============================================================
async function generateBriefWithLLM(domesticNews, overseasItems) {
  // 构建国内新闻文本
  const keyNames = { trend: '行业趋势', product: '热门项目', regulation: '监管政策', market: '市场动态' };
  const domesticText = Object.entries(domesticNews).map(([key, items]) => {
    if (!items || items.length === 0) return '';
    const itemsText = items.map(i => `- [${i.title}](${i.url})：${i.snippet.slice(0, 120)}`).join('\n');
    return `【${keyNames[key] || key}】\n${itemsText}`;
  }).filter(Boolean).join('\n\n');

  // 构建海外社交媒体文本
  const overseasText = overseasItems.length > 0
    ? '【海外医美趋势（Instagram/TikTok/YouTube）】\n' +
      overseasItems.slice(0, 8).map(i =>
        `- [${i.platform}] ${i.creator ? '@' + i.creator + ' ' : ''}${i.title}` +
        (i.views > 0 ? `（${(i.views / 1000).toFixed(1)}K 播放）` : '') +
        (i.snippet ? `：${i.snippet.slice(0, 100)}` : '')
      ).join('\n')
    : '';

  const allText = [domesticText, overseasText].filter(Boolean).join('\n\n');

  if (!allText.trim()) {
    return generateFallbackBrief();
  }

  const systemPrompt = `你是医美行业资深分析师，专为医美机构运营者和从业者提供每日简报。
风格要求：专业、简洁、有洞察，突出对机构运营的实际影响，不要泛泛而谈。
重要：所有内容必须基于提供的真实新闻和社交媒体数据，不得凭空捏造。`;

  const userPrompt = `请基于以下今日医美行业真实数据，生成一份结构化日报。

${allText}

请输出以下 JSON 格式（只输出 JSON，不要有任何其他文字）：
{
  "headline": "今日最重要的一句话总结（20字以内）",
  "highlights": [
    {
      "title": "标题（10字内）",
      "content": "内容（80字内，说明对机构的实际影响）",
      "tag": "趋势/政策/产品/市场/海外之一",
      "source_url": "来源链接（如有）"
    }
  ],
  "overseas_signal": "海外医美趋势一句话（30字内，如无海外数据则填 null）",
  "actionable": "今日建议：机构运营者今天应该关注或行动的一件事（50字内）",
  "sentiment": "positive/neutral/negative（今日行业情绪）"
}

highlights 最多 5 条，优先选择有具体数据支撑的信息。`;

  try {
    let apiKey, baseUrl, model;
    if (AI_PROVIDER === 'siliconflow') {
      apiKey  = SILICONFLOW_API_KEY;
      baseUrl = 'https://api.siliconflow.cn/v1';
      model   = 'deepseek-ai/DeepSeek-V3';
    } else {
      apiKey  = DEEPSEEK_API_KEY;
      baseUrl = 'https://api.deepseek.com/v1';
      model   = 'deepseek-chat';
    }

    const result = await httpPost(
      `${baseUrl}/chat/completions`,
      { Authorization: `Bearer ${apiKey}` },
      {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens:  1000,
      }
    );

    const rawText = result?.choices?.[0]?.message?.content || '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.warn('[Daily] LLM 生成失败:', e.message);
  }

  return generateFallbackBrief();
}

// ============================================================
// 备用日报（当搜索和 LLM 都失败时）
// ============================================================
function generateFallbackBrief() {
  return {
    headline:        '今日医美行业动态获取中',
    highlights:      [{ title: '数据更新中', content: '今日行业动态正在获取，请稍后刷新查看。', tag: '趋势', source_url: '' }],
    overseas_signal: null,
    actionable:      '建议关注新氧、丽格等平台的最新动态。',
    sentiment:       'neutral',
  };
}

// ============================================================
// 主流程
// ============================================================
async function runDailyBrief() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`\n[Daily] ========== 开始生成 ${today} 医美日报 ==========`);

  // 读取历史日报
  let briefs = [];
  try {
    if (fs.existsSync(BRIEF_FILE)) {
      briefs = JSON.parse(fs.readFileSync(BRIEF_FILE, 'utf8'));
    }
  } catch (_) { briefs = []; }

  // 检查今天是否已生成
  if (briefs.length > 0 && briefs[0].date === today) {
    console.log('[Daily] 今日日报已存在，跳过');
    return briefs[0];
  }

  // === 双轨并行抓取 ===
  const [domesticNews, overseasResult] = await Promise.all([
    gatherDomesticNews(),
    runLast30Days('medical aesthetics cosmetic procedures botox filler skincare'),
  ]);

  const overseasItems = overseasResult.items || [];
  console.log(`[Daily] 数据汇总：国内 ${Object.values(domesticNews).flat().length} 条，海外 ${overseasItems.length} 条`);

  // === LLM 整合生成日报 ===
  const brief = await generateBriefWithLLM(domesticNews, overseasItems);

  // === 组装完整记录 ===
  const allDomesticItems = Object.values(domesticNews).flat();
  const briefRecord = {
    date:        today,
    generatedAt: new Date().toISOString(),
    version:     '2.0',
    dataSources: {
      domestic: allDomesticItems.length,
      overseas: overseasItems.length,
    },
    ...brief,
    // 来源链接（国内 + 海外）
    sources: [
      ...allDomesticItems.slice(0, 4).map(i => ({ title: i.title, url: i.url, type: 'domestic' })),
      ...overseasItems.slice(0, 3).map(i => ({ title: i.title, url: i.url, type: 'overseas', platform: i.platform })),
    ],
  };

  // 保存（只保留最近 30 天）
  briefs.unshift(briefRecord);
  if (briefs.length > 30) briefs = briefs.slice(0, 30);
  fs.writeFileSync(BRIEF_FILE, JSON.stringify(briefs, null, 2));

  console.log(`[Daily] ✅ ${today} 日报生成完成: ${brief.headline}`);
  console.log(`[Daily]    情绪: ${brief.sentiment} | 海外信号: ${brief.overseas_signal || '无'}`);
  return briefRecord;
}

// ============================================================
// 导出和直接执行
// ============================================================
module.exports = { runDailyBrief };

if (require.main === module) {
  runDailyBrief()
    .then(brief => {
      console.log('\n========== 日报内容 ==========');
      console.log(JSON.stringify(brief, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error('[Daily] 日报生成失败:', err);
      process.exit(1);
    });
}
