// ===== WEB VIEWER (网页深度感知) =====
// 在预览面板中内嵌网页浏览 + 一键截取发给 Agent 分析

// --- State ---
var webViewerUrl = '';
var webViewerContent = null; // { title, content, description, url }

// --- Open URL input dialog ---
function openWebUrlInput() {
  var dialog = document.getElementById('webUrlDialog');
  if (!dialog) {
    dialog = document.createElement('div');
    dialog.id = 'webUrlDialog';
    dialog.className = 'web-url-dialog-overlay';
    dialog.onclick = function(e) { if (e.target === dialog) dialog.classList.remove('active'); };
    dialog.innerHTML =
      '<div class="web-url-dialog">' +
        '<div class="web-url-dialog-header">' +
          '<h4>打开网页</h4>' +
          '<button class="web-url-dialog-close" onclick="document.getElementById(\'webUrlDialog\').classList.remove(\'active\')">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="web-url-dialog-body">' +
          '<input type="text" id="webUrlInput" placeholder="输入网址，例如 https://example.com" autocomplete="off">' +
          '<div class="web-url-dialog-hint">支持 HTTP/HTTPS 网页，将在预览面板中加载</div>' +
        '</div>' +
        '<div class="web-url-dialog-footer">' +
          '<button class="web-url-dialog-cancel" onclick="document.getElementById(\'webUrlDialog\').classList.remove(\'active\')">取消</button>' +
          '<button class="web-url-dialog-open" onclick="loadWebUrl()">打开</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dialog);

    // Enter key to submit
    document.getElementById('webUrlInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); loadWebUrl(); }
    });
  }

  document.getElementById('webUrlInput').value = webViewerUrl || '';
  dialog.classList.add('active');
  setTimeout(function() { document.getElementById('webUrlInput').focus(); }, 100);
}

// --- Load URL into preview panel ---
function loadWebUrl() {
  var input = document.getElementById('webUrlInput');
  var url = (input ? input.value : '').trim();
  if (!url) { showToast('请输入网址'); return; }

  // Add protocol if missing
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  webViewerUrl = url;
  webViewerContent = null;

  // Close dialog
  var dialog = document.getElementById('webUrlDialog');
  if (dialog) dialog.classList.remove('active');

  // Open preview panel with iframe
  showWebInPreview(url);
}

// --- Show web page in preview panel ---
function showWebInPreview(url) {
  // Use the existing openPreviewPanel mechanism
  var previewPanel = document.getElementById('previewPanel');
  if (!previewPanel) return;

  // Show preview panel
  previewPanel.style.display = 'flex';

  // Update preview header
  var titleEl = previewPanel.querySelector('.preview-title');
  if (titleEl) {
    var domain = '';
    try { domain = new URL(url).hostname; } catch(e) { domain = url; }
    titleEl.textContent = domain;
  }

  // Update preview body with iframe
  var body = previewPanel.querySelector('.preview-body');
  if (!body) return;

  body.innerHTML =
    '<div class="web-viewer-container">' +
      '<div class="web-viewer-toolbar">' +
        '<div class="web-viewer-url-bar">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>' +
          '<span class="web-viewer-url-text" title="' + url + '">' + url + '</span>' +
        '</div>' +
        '<div class="web-viewer-actions">' +
          '<button class="web-viewer-btn" onclick="extractWebContent()" title="截取内容">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
            ' 截取内容' +
          '</button>' +
          '<button class="web-viewer-btn web-viewer-btn-primary" onclick="extractAndSendToAgent()" title="截取并发送给 Agent">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
            ' 发送给 Agent' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="web-viewer-iframe-container">' +
        '<iframe id="webViewerIframe" src="' + url + '" sandbox="allow-same-origin allow-scripts allow-popups allow-forms" class="web-viewer-iframe" loading="lazy"></iframe>' +
        '<div class="web-viewer-loading" id="webViewerLoading">' +
          '<div class="web-viewer-spinner"></div>' +
          '<span>加载中...</span>' +
        '</div>' +
      '</div>' +
    '</div>';

  // Handle iframe load events
  var iframe = document.getElementById('webViewerIframe');
  var loading = document.getElementById('webViewerLoading');
  if (iframe) {
    iframe.onload = function() {
      if (loading) loading.style.display = 'none';
    };
    iframe.onerror = function() {
      if (loading) {
        loading.innerHTML = '<span style="color:var(--text-3)">无法加载此页面，请尝试"截取内容"功能</span>';
      }
    };
    // Timeout fallback
    setTimeout(function() {
      if (loading && loading.style.display !== 'none') {
        loading.innerHTML = '<span style="color:var(--text-3)">页面加载较慢或被阻止，可直接使用"截取内容"</span>';
      }
    }, 15000);
  }

  // Update toolbar buttons
  updatePreviewToolbarForWeb();
}

// --- Update preview toolbar to show web-specific buttons ---
function updatePreviewToolbarForWeb() {
  var toolbar = document.querySelector('.preview-toolbar');
  if (!toolbar) return;

  // Check if web buttons already exist
  if (toolbar.querySelector('.web-toolbar-btn')) return;

  // Add web-specific buttons before close button
  var closeBtn = toolbar.querySelector('.preview-close-btn') || toolbar.lastElementChild;

  var webBtnGroup = document.createElement('div');
  webBtnGroup.className = 'web-toolbar-group';
  webBtnGroup.innerHTML =
    '<button class="preview-toolbar-btn web-toolbar-btn" onclick="openWebUrlInput()" title="打开新网页">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>' +
    '</button>';

  if (closeBtn) {
    toolbar.insertBefore(webBtnGroup, closeBtn);
  } else {
    toolbar.appendChild(webBtnGroup);
  }
}

// --- Extract web content via backend API ---
async function extractWebContent() {
  if (!webViewerUrl) {
    showToast('没有打开的网页');
    return;
  }

  showToast('正在截取网页内容...');

  try {
    var resp = await fetch('/api/web/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ url: webViewerUrl })
    });
    var data = await resp.json();

    if (data.success) {
      webViewerContent = {
        title: data.title,
        content: data.content,
        description: data.description,
        url: data.url
      };

      // Show extracted content in preview panel
      showExtractedContent(data);
      showToast('内容截取成功');
    } else {
      showToast(data.error || '截取失败');
    }
  } catch (e) {
    showToast('截取失败: ' + e.message);
  }
}

// --- Show extracted content in preview panel ---
function showExtractedContent(data) {
  var body = document.querySelector('.preview-body');
  if (!body) return;

  // Update title
  var titleEl = document.querySelector('.preview-title');
  if (titleEl) titleEl.textContent = data.title || '网页内容';

  var contentHtml =
    '<div class="web-extracted-content">' +
      '<div class="web-extracted-header">' +
        '<div class="web-extracted-title">' + (data.title || '无标题') + '</div>' +
        '<div class="web-extracted-url">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>' +
          '<a href="' + data.url + '" target="_blank" rel="noopener">' + data.url + '</a>' +
        '</div>' +
        (data.description ? '<div class="web-extracted-desc">' + data.description + '</div>' : '') +
      '</div>' +
      '<div class="web-extracted-actions">' +
        '<button class="web-extracted-btn" onclick="sendExtractedToAgent()">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
          ' 发送给 Agent 分析' +
        '</button>' +
        '<button class="web-extracted-btn web-extracted-btn-secondary" onclick="copyExtractedContent()">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>' +
          ' 复制内容' +
        '</button>' +
        '<button class="web-extracted-btn web-extracted-btn-secondary" onclick="showWebInPreview(\'' + data.url.replace(/'/g, "\\'") + '\')">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>' +
          ' 返回网页' +
        '</button>' +
      '</div>' +
      '<div class="web-extracted-body">' +
        '<pre class="web-extracted-text">' + escapeHtml(data.content) + '</pre>' +
      '</div>' +
    '</div>';

  body.innerHTML = contentHtml;
}

// --- Helper: escape HTML ---
function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Send extracted content to Agent ---
function sendExtractedToAgent() {
  if (!webViewerContent || !webViewerContent.content) {
    showToast('没有可发送的内容');
    return;
  }

  var chatInput = document.getElementById('messageInput');
  if (!chatInput) {
    showToast('请先打开一个对话');
    return;
  }

  // Build context message
  var contextMsg = '请分析以下网页内容：\n\n';
  contextMsg += '**来源：** ' + webViewerContent.url + '\n';
  contextMsg += '**标题：** ' + webViewerContent.title + '\n\n';
  contextMsg += '---\n\n';
  // Truncate content if too long
  var content = webViewerContent.content;
  if (content.length > 8000) {
    content = content.substring(0, 8000) + '\n\n[内容已截断，共 ' + webViewerContent.content.length + ' 字]';
  }
  contextMsg += content;

  chatInput.value = contextMsg;
  if (typeof autoResize === 'function') autoResize(chatInput);
  chatInput.focus();

  showToast('内容已填入输入框，按回车发送');
}

// --- Extract and immediately send to Agent ---
async function extractAndSendToAgent() {
  if (!webViewerUrl) {
    showToast('没有打开的网页');
    return;
  }

  showToast('正在截取并准备发送...');

  try {
    var resp = await fetch('/api/web/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ url: webViewerUrl })
    });
    var data = await resp.json();

    if (data.success) {
      webViewerContent = {
        title: data.title,
        content: data.content,
        description: data.description,
        url: data.url
      };
      sendExtractedToAgent();
    } else {
      showToast(data.error || '截取失败');
    }
  } catch (e) {
    showToast('截取失败: ' + e.message);
  }
}

// --- Copy extracted content ---
function copyExtractedContent() {
  if (!webViewerContent || !webViewerContent.content) {
    showToast('没有可复制的内容');
    return;
  }

  var text = '# ' + webViewerContent.title + '\n\n';
  text += '来源: ' + webViewerContent.url + '\n\n';
  text += webViewerContent.content;

  navigator.clipboard.writeText(text).then(function() {
    showToast('内容已复制到剪贴板');
  }).catch(function() {
    // Fallback
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('内容已复制');
  });
}
