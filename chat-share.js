// ===== CHAT SHARE v1.0 =====
// 对话分享：生成分享链接

(function() {
  'use strict';

  // 显示分享对话框
  window.showShareDialog = function() {
    // 检查是否有对话
    var messages = document.querySelectorAll('.msg-row');
    if (!messages || messages.length === 0) {
      if (typeof showToast === 'function') showToast('当前没有对话内容可分享', 'warning');
      return;
    }

    // 创建对话框
    var overlay = document.createElement('div');
    overlay.className = 'share-dialog-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:10000;display:flex;align-items:center;justify-content:center;';

    var dialog = document.createElement('div');
    dialog.className = 'share-dialog';
    dialog.style.cssText = 'background:var(--bg,#fff);border-radius:12px;padding:1.5rem;width:400px;max-width:92vw;box-shadow:0 20px 60px rgba(0,0,0,0.2);';

    dialog.innerHTML =
      '<div style="font-size:1rem;font-weight:600;margin-bottom:1rem;color:var(--text,#191919)">分享对话</div>' +
      '<div style="margin-bottom:1rem">' +
        '<label style="font-size:0.8rem;color:var(--text-2,#5a5a5a);display:block;margin-bottom:4px">分享标题</label>' +
        '<input id="shareTitle" type="text" value="" placeholder="对话分享" style="width:100%;padding:8px 12px;border:1px solid var(--border,#E8E5E0);border-radius:6px;font-size:0.85rem;background:var(--bg-warm,#FAF8F5);color:var(--text,#191919);outline:none">' +
      '</div>' +
      '<div style="margin-bottom:1.25rem">' +
        '<label style="font-size:0.8rem;color:var(--text-2,#5a5a5a);display:block;margin-bottom:4px">有效期</label>' +
        '<select id="shareExpiry" style="width:100%;padding:8px 12px;border:1px solid var(--border,#E8E5E0);border-radius:6px;font-size:0.85rem;background:var(--bg-warm,#FAF8F5);color:var(--text,#191919);outline:none">' +
          '<option value="1">1 天</option>' +
          '<option value="7" selected>7 天</option>' +
          '<option value="30">30 天</option>' +
          '<option value="never">永久有效</option>' +
        '</select>' +
      '</div>' +
      '<div style="display:flex;gap:0.5rem;justify-content:flex-end">' +
        '<button id="shareCancelBtn" style="padding:8px 16px;border:1px solid var(--border,#E8E5E0);border-radius:6px;background:transparent;color:var(--text-2,#5a5a5a);cursor:pointer;font-size:0.85rem">取消</button>' +
        '<button id="shareConfirmBtn" style="padding:8px 16px;border:none;border-radius:6px;background:var(--coral,#E8715A);color:white;cursor:pointer;font-size:0.85rem;font-weight:500">生成链接</button>' +
      '</div>';

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // 自动填入标题
    var agentName = document.querySelector('.chat-agent-name');
    var titleInput = document.getElementById('shareTitle');
    if (agentName && titleInput) {
      titleInput.value = agentName.textContent.trim() + ' 对话分享';
    }

    // 关闭
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    document.getElementById('shareCancelBtn').onclick = function() { overlay.remove(); };

    // 生成分享
    document.getElementById('shareConfirmBtn').onclick = function() {
      createShare(overlay);
    };
  };

  // 创建分享
  function createShare(overlay) {
    var title = document.getElementById('shareTitle').value || '对话分享';
    var expiry = document.getElementById('shareExpiry').value;
    var confirmBtn = document.getElementById('shareConfirmBtn');

    // 收集消息
    var msgRows = document.querySelectorAll('.msg-row');
    var messages = [];
    msgRows.forEach(function(row) {
      var isUser = row.classList.contains('user');
      var bubble = row.querySelector('.msg-bubble');
      if (!bubble) return;
      messages.push({
        role: isUser ? 'user' : 'assistant',
        content: bubble.innerText || bubble.textContent || '',
        timestamp: Date.now()
      });
    });

    if (messages.length === 0) {
      if (typeof showToast === 'function') showToast('没有消息可分享', 'warning');
      return;
    }

    // 获取 Agent 信息
    var agentNameEl = document.querySelector('.chat-agent-name');
    var agentAvatarEl = document.querySelector('.chat-agent-avatar');
    var agentName = agentNameEl ? agentNameEl.textContent.trim() : 'Agent';
    var agentAvatar = agentAvatarEl ? agentAvatarEl.textContent.trim() : '';

    // 获取 sessionId
    var sessionId = '';
    if (typeof currentSessionId !== 'undefined') sessionId = currentSessionId;

    confirmBtn.textContent = '生成中...';
    confirmBtn.disabled = true;

    fetch('/api/chat/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionId,
        title: title,
        messages: messages,
        agentName: agentName,
        agentAvatar: agentAvatar,
        expiresIn: expiry
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) {
        if (typeof showToast === 'function') showToast(data.error, 'error');
        confirmBtn.textContent = '生成链接';
        confirmBtn.disabled = false;
        return;
      }

      // 显示分享链接
      var shareUrl = window.location.origin + data.shareUrl;
      showShareResult(overlay, shareUrl, data.expiresAt);
    })
    .catch(function(e) {
      if (typeof showToast === 'function') showToast('分享失败: ' + e.message, 'error');
      confirmBtn.textContent = '生成链接';
      confirmBtn.disabled = false;
    });
  }

  // 显示分享结果
  function showShareResult(overlay, shareUrl, expiresAt) {
    var dialog = overlay.querySelector('.share-dialog');
    if (!dialog) return;

    var expiryText = expiresAt ? '有效期至 ' + new Date(expiresAt).toLocaleDateString('zh-CN') : '永久有效';

    dialog.innerHTML =
      '<div style="text-align:center;padding:0.5rem 0">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" style="margin-bottom:0.75rem"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' +
        '<div style="font-size:1rem;font-weight:600;color:var(--text,#191919);margin-bottom:0.25rem">分享链接已生成</div>' +
        '<div style="font-size:0.75rem;color:var(--text-3,#767676);margin-bottom:1rem">' + expiryText + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:0.5rem;margin-bottom:1rem">' +
        '<input id="shareUrlInput" type="text" value="' + shareUrl + '" readonly style="flex:1;padding:8px 12px;border:1px solid var(--border,#E8E5E0);border-radius:6px;font-size:0.8rem;background:var(--bg-warm,#FAF8F5);color:var(--text,#191919);outline:none">' +
        '<button id="shareCopyBtn" style="padding:8px 14px;border:none;border-radius:6px;background:var(--coral,#E8715A);color:white;cursor:pointer;font-size:0.8rem;white-space:nowrap">复制</button>' +
      '</div>' +
      '<div style="display:flex;gap:0.5rem;justify-content:center">' +
        '<button id="shareOpenBtn" style="padding:8px 16px;border:1px solid var(--border,#E8E5E0);border-radius:6px;background:transparent;color:var(--text-2,#5a5a5a);cursor:pointer;font-size:0.8rem">打开预览</button>' +
        '<button id="shareDoneBtn" style="padding:8px 16px;border:1px solid var(--border,#E8E5E0);border-radius:6px;background:transparent;color:var(--text-2,#5a5a5a);cursor:pointer;font-size:0.8rem">完成</button>' +
      '</div>';

    document.getElementById('shareCopyBtn').onclick = function() {
      var input = document.getElementById('shareUrlInput');
      if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl).then(function() {
          document.getElementById('shareCopyBtn').textContent = '已复制';
          setTimeout(function() {
            var btn = document.getElementById('shareCopyBtn');
            if (btn) btn.textContent = '复制';
          }, 2000);
        });
      } else {
        input.select();
        document.execCommand('copy');
        document.getElementById('shareCopyBtn').textContent = '已复制';
      }
    };

    document.getElementById('shareOpenBtn').onclick = function() {
      window.open(shareUrl, '_blank');
    };

    document.getElementById('shareDoneBtn').onclick = function() {
      overlay.remove();
    };
  }

})();
