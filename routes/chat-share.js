// ===== CHAT SHARE API v1.0 =====
// 对话分享：生成分享链接，访客可查看对话内容

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SHARE_DIR = path.join(__dirname, '..', 'data', 'shares');

// 确保目录存在
if (!fs.existsSync(SHARE_DIR)) {
  fs.mkdirSync(SHARE_DIR, { recursive: true });
}

function generateShareId() {
  return crypto.randomBytes(16).toString('hex');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function handleChatShareRoutes(req, res, url, body, getUserCode, isAuthenticated) {
  const pathname = url.pathname;

  // POST /api/chat/share - 创建分享
  if (req.method === 'POST' && pathname === '/api/chat/share') {
    try {
      const { sessionId, title, messages, agentName, agentAvatar, expiresIn } = body || {};

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '缺少消息内容' }));
        return true;
      }

      const shareId = generateShareId();
      const now = Date.now();

      let expiresAt = null;
      if (expiresIn && expiresIn !== 'never') {
        const days = parseInt(expiresIn) || 7;
        expiresAt = now + days * 24 * 60 * 60 * 1000;
      }

      const shareData = {
        shareId,
        sessionId: sessionId || '',
        title: title || '对话分享',
        agentName: agentName || 'Agent',
        agentAvatar: agentAvatar || '',
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp || null
        })),
        createdAt: now,
        expiresAt,
        viewCount: 0
      };

      const filePath = path.join(SHARE_DIR, shareId + '.json');
      fs.writeFileSync(filePath, JSON.stringify(shareData, null, 2));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ shareId, shareUrl: '/share/' + shareId, expiresAt }));
    } catch (e) {
      console.error('创建分享失败:', e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '创建分享失败' }));
    }
    return true;
  }

  // GET /api/chat/shares - 获取分享列表
  if (req.method === 'GET' && pathname === '/api/chat/shares') {
    try {
      const files = fs.readdirSync(SHARE_DIR).filter(f => f.endsWith('.json'));
      const shares = [];
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(SHARE_DIR, file), 'utf8'));
          if (data.expiresAt && Date.now() > data.expiresAt) {
            fs.unlinkSync(path.join(SHARE_DIR, file));
            continue;
          }
          shares.push({
            shareId: data.shareId,
            title: data.title,
            agentName: data.agentName,
            messageCount: data.messages.length,
            viewCount: data.viewCount || 0,
            createdAt: data.createdAt,
            expiresAt: data.expiresAt
          });
        } catch (e) { /* skip */ }
      }
      shares.sort((a, b) => b.createdAt - a.createdAt);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(shares));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '获取分享列表失败' }));
    }
    return true;
  }

  // GET /api/chat/share/:id - 获取分享数据
  const apiMatch = pathname.match(/^\/api\/chat\/share\/([a-f0-9]{32})$/);
  if (req.method === 'GET' && apiMatch) {
    const shareId = apiMatch[1];
    const filePath = path.join(SHARE_DIR, shareId + '.json');
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '分享不存在或已过期' }));
      return true;
    }
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (data.expiresAt && Date.now() > data.expiresAt) {
        fs.unlinkSync(filePath);
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '分享已过期' }));
        return true;
      }
      data.viewCount = (data.viewCount || 0) + 1;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '读取分享失败' }));
    }
    return true;
  }

  // DELETE /api/chat/share/:id - 删除分享
  if (req.method === 'DELETE' && apiMatch) {
    const shareId = apiMatch[1];
    const filePath = path.join(SHARE_DIR, shareId + '.json');
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return true;
  }

  // GET /share/:id - 分享页面 HTML
  const pageMatch = pathname.match(/^\/share\/([a-f0-9]{32})$/);
  if (req.method === 'GET' && pageMatch) {
    const shareId = pageMatch[1];
    const filePath = path.join(SHARE_DIR, shareId + '.json');

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;color:#666"><h2>分享不存在或已过期</h2></body></html>');
      return true;
    }

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (data.expiresAt && Date.now() > data.expiresAt) {
        fs.unlinkSync(filePath);
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;color:#666"><h2>分享已过期</h2></body></html>');
        return true;
      }
      data.viewCount = (data.viewCount || 0) + 1;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

      const html = generateSharePage(data);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;color:#666"><h2>加载失败</h2></body></html>');
    }
    return true;
  }

  return false;
}

function generateSharePage(data) {
  const messagesHtml = data.messages.map(function(m) {
    var isUser = m.role === 'user';
    var avatar = isUser
      ? '<div style="width:36px;height:36px;border-radius:50%;background:#E8715A;color:white;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">U</div>'
      : '<div style="width:36px;height:36px;border-radius:50%;background:#FAF8F5;border:1px solid #E8E5E0;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">' + escapeHtml(data.agentAvatar || 'A') + '</div>';

    var bubbleStyle = isUser
      ? 'background:#E8715A;color:white;border-radius:16px 16px 4px 16px;'
      : 'background:#FAF8F5;color:#191919;border-radius:16px 16px 16px 4px;border:1px solid #E8E5E0;';

    var content = escapeHtml(m.content || '');
    content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    content = content.replace(/\*(.*?)\*/g, '<em>$1</em>');
    content = content.replace(/`(.*?)`/g, '<code style="background:rgba(0,0,0,0.06);padding:1px 4px;border-radius:3px;font-size:0.9em">$1</code>');
    content = content.replace(/\n/g, '<br>');

    var time = m.timestamp ? '<div style="font-size:11px;color:#999;margin-top:4px">' + new Date(m.timestamp).toLocaleString('zh-CN') + '</div>' : '';

    return '<div style="display:flex;gap:10px;align-items:flex-start;' + (isUser ? 'flex-direction:row-reverse' : '') + '">' +
      avatar +
      '<div style="max-width:75%">' +
        '<div style="padding:12px 16px;' + bubbleStyle + 'font-size:14px;line-height:1.7;word-break:break-word">' + content + '</div>' +
        time +
      '</div>' +
    '</div>';
  }).join('');

  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + escapeHtml(data.title) + ' - MedAgent Hub</title>' +
    '<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;background:#F5F3EF;color:#191919}' +
    '@media(max-width:640px){.share-container{margin:0!important;border-radius:0!important}.share-messages{padding:12px!important}}</style>' +
    '</head><body>' +
    '<div class="share-container" style="max-width:720px;margin:20px auto;min-height:calc(100vh - 40px);background:white;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.08);overflow:hidden">' +
      '<div style="padding:16px 20px;border-bottom:1px solid #E8E5E0;display:flex;align-items:center;gap:10px;background:#FAF8F5">' +
        '<div style="width:40px;height:40px;border-radius:50%;background:#FAF8F5;border:1px solid #E8E5E0;display:flex;align-items:center;justify-content:center;font-size:18px">' + escapeHtml(data.agentAvatar || 'A') + '</div>' +
        '<div style="flex:1"><div style="font-size:15px;font-weight:600">' + escapeHtml(data.title) + '</div>' +
        '<div style="font-size:12px;color:#999;margin-top:2px">' + escapeHtml(data.agentName) + ' &middot; ' + data.messages.length + ' 条消息 &middot; ' + (data.viewCount || 0) + ' 次查看</div></div>' +
      '</div>' +
      '<div class="share-messages" style="padding:20px;display:flex;flex-direction:column;gap:16px">' + messagesHtml + '</div>' +
      '<div style="padding:16px 20px;border-top:1px solid #E8E5E0;text-align:center;font-size:12px;color:#999">' +
        '由 <a href="/chat.html" style="color:#E8715A;text-decoration:none;font-weight:500">MedAgent Hub</a> 生成' +
        (data.expiresAt ? ' &middot; 有效期至 ' + new Date(data.expiresAt).toLocaleDateString('zh-CN') : '') +
      '</div>' +
    '</div>' +
    '</body></html>';
}

module.exports = { handleChatShareRoutes };
