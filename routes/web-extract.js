/**
 * MedAgent Hub — 网页内容抓取模块
 *
 * 功能：
 * 1. 接收 URL，使用 Node.js 内置 http/https 模块抓取网页
 * 2. 使用简单的 HTML 解析提取正文内容（不依赖 cheerio）
 * 3. 返回标题、正文文本、摘要
 * 4. 安全限制：超时 10s、大小 500KB、基本 URL 校验
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// 简单的 HTML 标签清理和正文提取
function extractTextFromHTML(html) {
  // 移除 script 和 style 标签及其内容
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '');

  // 提取 title
  let title = '';
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) title = titleMatch[1].trim();

  // 提取 meta description
  let description = '';
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);
  if (descMatch) description = descMatch[1].trim();
  if (!description) {
    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([\s\S]*?)["']/i);
    if (ogDescMatch) description = ogDescMatch[1].trim();
  }

  // 尝试提取 article/main 内容
  let mainContent = '';
  const articleMatch = html.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  if (articleMatch) {
    mainContent = articleMatch[1];
  } else {
    const mainMatch = html.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
    if (mainMatch) {
      mainContent = mainMatch[1];
    } else {
      // 尝试提取 body 中最大的 div
      const bodyMatch = html.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        mainContent = bodyMatch[1];
      } else {
        mainContent = text;
      }
    }
  }

  // 将 <br>, <p>, <div>, <li>, <h1-6> 转为换行
  mainContent = mainContent.replace(/<br\s*\/?>/gi, '\n');
  mainContent = mainContent.replace(/<\/p>/gi, '\n\n');
  mainContent = mainContent.replace(/<\/div>/gi, '\n');
  mainContent = mainContent.replace(/<\/li>/gi, '\n');
  mainContent = mainContent.replace(/<\/h[1-6]>/gi, '\n\n');
  mainContent = mainContent.replace(/<h[1-6][^>]*>/gi, '\n\n## ');

  // 提取链接文本
  mainContent = mainContent.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1');

  // 移除所有剩余 HTML 标签
  mainContent = mainContent.replace(/<[^>]+>/g, '');

  // 解码 HTML 实体
  mainContent = mainContent
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, function(_, num) { return String.fromCharCode(parseInt(num)); });

  // 清理多余空白
  mainContent = mainContent.replace(/\n{3,}/g, '\n\n').trim();
  // 移除每行首尾空白
  mainContent = mainContent.split('\n').map(function(line) { return line.trim(); }).join('\n');
  // 移除空行连续超过2行
  mainContent = mainContent.replace(/(\n\s*){3,}/g, '\n\n');

  return {
    title: title.replace(/<[^>]+>/g, '').trim(),
    description: description.replace(/<[^>]+>/g, '').trim(),
    content: mainContent.substring(0, 50000) // 限制 50K 字符
  };
}

// 抓取网页内容
function fetchWebPage(targetUrl, timeout) {
  return new Promise(function(resolve, reject) {
    var parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch (e) {
      reject(new Error('无效的 URL'));
      return;
    }

    // 安全检查
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      reject(new Error('仅支持 HTTP/HTTPS 协议'));
      return;
    }

    // 禁止访问内网
    var hostname = parsedUrl.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
      reject(new Error('不允许访问内网地址'));
      return;
    }

    var client = parsedUrl.protocol === 'https:' ? https : http;
    var options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MedAgent/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'identity' // 不压缩，简化处理
      },
      timeout: timeout || 10000
    };

    var req = client.request(options, function(res) {
      // 处理重定向
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        var redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('/')) {
          redirectUrl = parsedUrl.protocol + '//' + parsedUrl.host + redirectUrl;
        }
        fetchWebPage(redirectUrl, timeout).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error('HTTP ' + res.statusCode));
        return;
      }

      var chunks = [];
      var totalSize = 0;
      var maxSize = 500 * 1024; // 500KB

      res.on('data', function(chunk) {
        totalSize += chunk.length;
        if (totalSize > maxSize) {
          req.destroy();
          reject(new Error('页面内容超过 500KB 限制'));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', function() {
        var charset = 'utf-8';
        var contentType = res.headers['content-type'] || '';
        var charsetMatch = contentType.match(/charset=([^\s;]+)/i);
        if (charsetMatch) charset = charsetMatch[1].toLowerCase();

        var buffer = Buffer.concat(chunks);
        var html = '';

        // 尝试检测 charset
        if (charset === 'gbk' || charset === 'gb2312' || charset === 'gb18030') {
          try {
            var iconv = require('iconv-lite');
            html = iconv.decode(buffer, charset);
          } catch (e) {
            html = buffer.toString('utf-8');
          }
        } else {
          html = buffer.toString('utf-8');
        }

        // 检查 HTML 中的 meta charset
        if (!charsetMatch) {
          var metaCharset = html.match(/<meta[^>]*charset=["']?([^\s"'>]+)/i);
          if (metaCharset) {
            var detectedCharset = metaCharset[1].toLowerCase();
            if (['gbk', 'gb2312', 'gb18030'].includes(detectedCharset)) {
              try {
                var iconv = require('iconv-lite');
                html = iconv.decode(buffer, detectedCharset);
              } catch (e) { /* keep utf-8 */ }
            }
          }
        }

        resolve({
          html: html,
          url: targetUrl,
          contentType: contentType,
          size: totalSize
        });
      });

      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', function() {
      req.destroy();
      reject(new Error('请求超时（10秒）'));
    });

    req.end();
  });
}

/**
 * 处理网页抓取 HTTP 路由
 */
function handleWebExtractRoutes(req, res, url, body, getUserCode, isAuthenticated) {
  // POST /api/web/extract — 抓取网页内容
  if (url.pathname === '/api/web/extract' && req.method === 'POST') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '未登录' }));
      return true;
    }

    var targetUrl = body.url;
    if (!targetUrl || !targetUrl.trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '请提供 URL' }));
      return true;
    }

    // 确保 URL 有协议前缀
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://' + targetUrl;
    }

    fetchWebPage(targetUrl, 10000)
      .then(function(result) {
        var extracted = extractTextFromHTML(result.html);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          url: result.url,
          title: extracted.title,
          description: extracted.description,
          content: extracted.content,
          size: result.size,
          contentType: result.contentType
        }));
      })
      .catch(function(err) {
        console.error('[WebExtract] Error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '抓取失败: ' + err.message }));
      });

    return true;
  }

  return false;
}

module.exports = { handleWebExtractRoutes, fetchWebPage, extractTextFromHTML };
