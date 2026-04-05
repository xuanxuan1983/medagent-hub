// ===== CHAT EXPORT (对话导出) =====
// 支持导出为 Markdown / PDF / Word 格式

// --- 显示导出对话框 ---
function showExportDialog() {
  // 检查是否有对话内容
  var chatContainer = document.getElementById('chatMessages');
  if (!chatContainer) { showToast('请先打开一个对话'); return; }
  var msgRows = chatContainer.querySelectorAll('.msg-row');
  if (msgRows.length === 0) { showToast('当前没有对话内容可导出'); return; }

  var dialog = document.getElementById('exportDialog');
  if (!dialog) {
    dialog = document.createElement('div');
    dialog.id = 'exportDialog';
    dialog.className = 'web-url-dialog-overlay';
    dialog.onclick = function(e) { if (e.target === dialog) dialog.classList.remove('active'); };
    dialog.innerHTML =
      '<div class="web-url-dialog" style="max-width:420px">' +
        '<div class="web-url-dialog-header">' +
          '<h4>导出对话</h4>' +
          '<button class="web-url-dialog-close" onclick="document.getElementById(\'exportDialog\').classList.remove(\'active\')">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="web-url-dialog-body">' +
          '<div style="margin-bottom:12px;color:var(--text-2);font-size:13px">选择导出格式：</div>' +
          '<div class="web-send-options" id="exportOptions">' +
            '<label class="web-send-option active" data-format="markdown">' +
              '<input type="radio" name="exportFormat" value="markdown" checked>' +
              '<span class="web-send-option-icon" style="font-size:18px">' +
                '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
              '</span>' +
              '<span class="web-send-option-text">' +
                '<strong>Markdown</strong>' +
                '<small>纯文本格式，方便编辑和二次加工</small>' +
              '</span>' +
            '</label>' +
            '<label class="web-send-option" data-format="pdf">' +
              '<input type="radio" name="exportFormat" value="pdf">' +
              '<span class="web-send-option-icon" style="font-size:18px">' +
                '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><text x="7" y="18" font-size="7" fill="#e74c3c" stroke="none" font-weight="bold">PDF</text></svg>' +
              '</span>' +
              '<span class="web-send-option-text">' +
                '<strong>PDF</strong>' +
                '<small>保留排版格式，适合存档和分享</small>' +
              '</span>' +
            '</label>' +
            '<label class="web-send-option" data-format="word">' +
              '<input type="radio" name="exportFormat" value="word">' +
              '<span class="web-send-option-icon" style="font-size:18px">' +
                '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2b579a" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><text x="8" y="18" font-size="6" fill="#2b579a" stroke="none" font-weight="bold">W</text></svg>' +
              '</span>' +
              '<span class="web-send-option-text">' +
                '<strong>Word</strong>' +
                '<small>可编辑文档，适合报告和汇报</small>' +
              '</span>' +
            '</label>' +
          '</div>' +
          '<div class="export-options-extra" style="margin-top:12px">' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;color:var(--text-2);cursor:pointer">' +
              '<input type="checkbox" id="exportIncludeTimestamp" checked style="accent-color:var(--primary)">' +
              '包含时间戳' +
            '</label>' +
          '</div>' +
        '</div>' +
        '<div class="web-url-dialog-footer">' +
          '<button class="web-url-dialog-cancel" onclick="document.getElementById(\'exportDialog\').classList.remove(\'active\')">取消</button>' +
          '<button class="web-url-dialog-open" onclick="executeExport()">导出</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dialog);

    // 绑定选项点击事件
    dialog.querySelectorAll('.web-send-option').forEach(function(opt) {
      opt.addEventListener('click', function() {
        dialog.querySelectorAll('.web-send-option').forEach(function(o) { o.classList.remove('active'); });
        opt.classList.add('active');
      });
    });
  }

  // 重置状态
  var options = dialog.querySelectorAll('.web-send-option');
  options.forEach(function(o, i) {
    o.classList.toggle('active', i === 0);
    var radio = o.querySelector('input[type=radio]');
    if (radio) radio.checked = (i === 0);
  });

  dialog.classList.add('active');
}

// --- 执行导出 ---
function executeExport() {
  var selected = document.querySelector('input[name=exportFormat]:checked');
  var format = selected ? selected.value : 'markdown';
  var includeTimestamp = document.getElementById('exportIncludeTimestamp');
  var withTimestamp = includeTimestamp ? includeTimestamp.checked : true;

  // 关闭对话框
  var dialog = document.getElementById('exportDialog');
  if (dialog) dialog.classList.remove('active');

  // 收集对话内容
  var chatData = collectChatData(withTimestamp);
  if (!chatData || chatData.messages.length === 0) {
    showToast('没有可导出的内容');
    return;
  }

  switch (format) {
    case 'markdown':
      exportAsMarkdown(chatData);
      break;
    case 'pdf':
      exportAsPDF(chatData);
      break;
    case 'word':
      exportAsWord(chatData);
      break;
  }
}

// --- 收集对话数据 ---
function collectChatData(withTimestamp) {
  var chatContainer = document.getElementById('chatMessages');
  if (!chatContainer) return null;

  var agentName = '';
  var titleEl = document.getElementById('topbarName');
  if (titleEl) agentName = titleEl.textContent || '';

  var messages = [];
  var msgRows = chatContainer.querySelectorAll('.msg-row');

  msgRows.forEach(function(row) {
    var isUser = row.classList.contains('user');
    var bubble = row.querySelector('.msg-bubble');
    if (!bubble) return;

    // 获取纯文本内容（去除复制按钮等）
    var cloned = bubble.cloneNode(true);
    // 移除复制按钮、引导问题等非内容元素
    cloned.querySelectorAll('.msg-copy-btn, .suggested-questions, .export-toolbar, .msg-feedback').forEach(function(el) {
      el.remove();
    });

    var textContent = cloned.innerText.trim();
    var htmlContent = cloned.innerHTML;

    if (textContent) {
      messages.push({
        role: isUser ? 'user' : 'assistant',
        roleName: isUser ? '我' : (agentName || 'Agent'),
        content: textContent,
        html: htmlContent
      });
    }
  });

  return {
    agentName: agentName,
    exportTime: new Date().toLocaleString('zh-CN'),
    messages: messages,
    withTimestamp: withTimestamp
  };
}

// --- 导出为 Markdown ---
function exportAsMarkdown(chatData) {
  var md = '# ' + (chatData.agentName || 'MedAgent') + ' 对话记录\n\n';
  if (chatData.withTimestamp) {
    md += '> 导出时间：' + chatData.exportTime + '\n\n';
  }
  md += '---\n\n';

  chatData.messages.forEach(function(msg) {
    md += '**' + msg.roleName + '：**\n\n';
    md += msg.content + '\n\n';
    md += '---\n\n';
  });

  // 下载文件
  var filename = (chatData.agentName || 'chat') + '_' + formatDateForFilename() + '.md';
  downloadTextFile(md, filename, 'text/markdown');
  showToast('Markdown 导出成功');
}

// --- 导出为 PDF ---
function exportAsPDF(chatData) {
  showToast('正在生成 PDF...');

  // 构建 HTML 内容
  var html = buildExportHTML(chatData);

  // 创建临时容器
  var tempDiv = document.createElement('div');
  tempDiv.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;padding:40px;font-family:"Noto Serif SC","Inter",sans-serif;font-size:14px;line-height:1.8;color:#1a1a1a';
  tempDiv.innerHTML = html;
  document.body.appendChild(tempDiv);

  // 使用 html2pdf.js
  if (typeof html2pdf !== 'undefined') {
    var opt = {
      margin: [15, 15, 15, 15],
      filename: (chatData.agentName || 'chat') + '_' + formatDateForFilename() + '.pdf',
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    html2pdf().set(opt).from(tempDiv).save().then(function() {
      document.body.removeChild(tempDiv);
      showToast('PDF 导出成功');
    }).catch(function(err) {
      document.body.removeChild(tempDiv);
      console.error('PDF export error:', err);
      showToast('PDF 导出失败，已降级为 Markdown');
      exportAsMarkdown(chatData);
    });
  } else {
    document.body.removeChild(tempDiv);
    showToast('PDF 库未加载，已降级为 Markdown');
    exportAsMarkdown(chatData);
  }
}

// --- 导出为 Word (HTML 格式的 .doc) ---
function exportAsWord(chatData) {
  showToast('正在生成 Word...');

  var html = buildExportHTML(chatData);

  // Word 兼容的 HTML 包装
  var wordDoc =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
    '<head><meta charset="utf-8">' +
    '<style>' +
      'body { font-family: "微软雅黑", "Noto Serif SC", sans-serif; font-size: 12pt; line-height: 1.8; color: #1a1a1a; padding: 20px; }' +
      'h1 { font-size: 18pt; color: #1a1a1a; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }' +
      '.export-meta { color: #6b7280; font-size: 10pt; margin-bottom: 16px; }' +
      '.msg-block { margin-bottom: 16px; page-break-inside: avoid; }' +
      '.msg-role { font-weight: bold; color: #374151; margin-bottom: 4px; font-size: 11pt; }' +
      '.msg-role.user { color: #2563eb; }' +
      '.msg-content { padding: 10px 14px; border-radius: 8px; background: #f9fafb; border: 1px solid #e5e7eb; }' +
      '.msg-content.user { background: #eff6ff; border-color: #bfdbfe; }' +
      'table { border-collapse: collapse; width: 100%; margin: 8px 0; }' +
      'th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; font-size: 10pt; }' +
      'th { background: #f3f4f6; font-weight: bold; }' +
      'hr { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }' +
      'code { background: #f3f4f6; padding: 2px 4px; border-radius: 3px; font-size: 10pt; }' +
      'pre { background: #f3f4f6; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 10pt; }' +
    '</style></head><body>' + html + '</body></html>';

  var filename = (chatData.agentName || 'chat') + '_' + formatDateForFilename() + '.doc';
  var blob = new Blob(['\ufeff' + wordDoc], { type: 'application/msword' });
  downloadBlob(blob, filename);
  showToast('Word 导出成功');
}

// --- 构建导出 HTML ---
function buildExportHTML(chatData) {
  var html = '<h1>' + escapeExportHtml(chatData.agentName || 'MedAgent') + ' 对话记录</h1>';
  if (chatData.withTimestamp) {
    html += '<div class="export-meta">导出时间：' + escapeExportHtml(chatData.exportTime) + '</div>';
  }
  html += '<hr>';

  chatData.messages.forEach(function(msg) {
    var roleClass = msg.role === 'user' ? 'user' : 'assistant';
    html += '<div class="msg-block">';
    html += '<div class="msg-role ' + roleClass + '">' + escapeExportHtml(msg.roleName) + '</div>';
    html += '<div class="msg-content ' + roleClass + '">';

    if (msg.role === 'assistant') {
      // 保留 HTML 格式（表格、加粗等），但清理危险标签
      var cleanHtml = msg.html || escapeExportHtml(msg.content);
      // 移除 script/style 标签
      cleanHtml = cleanHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      cleanHtml = cleanHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
      html += cleanHtml;
    } else {
      html += '<p>' + escapeExportHtml(msg.content).replace(/\n/g, '<br>') + '</p>';
    }

    html += '</div></div>';
  });

  return html;
}

// --- Helper: escape HTML for export ---
function escapeExportHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Helper: format date for filename ---
function formatDateForFilename() {
  var d = new Date();
  return d.getFullYear() +
    ('0' + (d.getMonth() + 1)).slice(-2) +
    ('0' + d.getDate()).slice(-2) + '_' +
    ('0' + d.getHours()).slice(-2) +
    ('0' + d.getMinutes()).slice(-2);
}

// --- Helper: download text file ---
function downloadTextFile(content, filename, mimeType) {
  var blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
  downloadBlob(blob, filename);
}

// --- Helper: download blob ---
function downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(function() {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
