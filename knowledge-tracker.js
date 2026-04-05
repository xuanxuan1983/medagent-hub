/**
 * P3: 隐性知识显性化 - 前端
 * 追踪用户编辑行为，展示风格画像，管理写作模板
 */

(function() {
  'use strict';

  var knowledgeState = {
    prefs: null,
    trackingEnabled: true,
    lastEditorContent: '',
    panelVisible: false
  };

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setup);
    } else {
      setup();
    }
  }

  function setup() {
    loadUserPrefs();
    trackEditorChanges();
    addKnowledgeButton();
  }

  // ===== 加载用户偏好 =====
  function loadUserPrefs() {
    fetch('/api/user-prefs', { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          knowledgeState.prefs = data.data;
        }
      })
      .catch(function() {});
  }

  // ===== 追踪编辑变化 =====
  function trackEditorChanges() {
    // 监听编辑器的 blur 事件（编辑完成时记录）
    document.addEventListener('focusout', function(e) {
      var target = e.target;
      if (!knowledgeState.trackingEnabled) return;

      if (target.classList && (
        target.classList.contains('doc-editor-textarea') ||
        target.classList.contains('preview-editor') ||
        target.id === 'previewEditor'
      )) {
        var currentContent = target.value || target.textContent;
        if (currentContent && currentContent !== knowledgeState.lastEditorContent && knowledgeState.lastEditorContent) {
          recordEdit('edit', knowledgeState.lastEditorContent, currentContent);
        }
        knowledgeState.lastEditorContent = currentContent;
      }
    });

    // 监听编辑器的 focus 事件（记录初始内容）
    document.addEventListener('focusin', function(e) {
      var target = e.target;
      if (target.classList && (
        target.classList.contains('doc-editor-textarea') ||
        target.classList.contains('preview-editor') ||
        target.id === 'previewEditor'
      )) {
        knowledgeState.lastEditorContent = target.value || target.textContent;
      }
    });
  }

  // ===== 记录编辑到后端 =====
  function recordEdit(type, original, modified) {
    if (!original && !modified) return;
    if (original === modified) return;

    fetch('/api/user-prefs/edit-record', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: type,
        originalText: original.substring(0, 500),
        modifiedText: modified.substring(0, 500),
        context: document.title || ''
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success && data.styleProfile) {
        if (knowledgeState.prefs) {
          knowledgeState.prefs.styleProfile = data.styleProfile;
        }
      }
    })
    .catch(function() {});
  }

  // ===== 添加知识面板按钮 =====
  function addKnowledgeButton() {
    setTimeout(function() {
      // 在预览面板工具栏添加按钮
      var toolbars = document.querySelectorAll('.preview-panel-actions');
      toolbars.forEach(function(toolbar) {
        if (toolbar.querySelector('.knowledge-toggle-btn')) return;

        var btn = document.createElement('button');
        btn.className = 'preview-action-btn knowledge-toggle-btn';
        btn.title = '\u98ce\u683c\u753b\u50cf';
        btn.onclick = function() { toggleKnowledgePanel(); };
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';
        toolbar.appendChild(btn);
      });
    }, 1200);
  }

  // ===== 知识面板 =====
  function toggleKnowledgePanel() {
    var panel = document.getElementById('knowledgePanel');
    if (panel) {
      knowledgeState.panelVisible = !knowledgeState.panelVisible;
      panel.classList.toggle('visible', knowledgeState.panelVisible);
      if (knowledgeState.panelVisible) {
        refreshKnowledgePanel();
      }
      return;
    }

    // 创建面板
    panel = document.createElement('div');
    panel.id = 'knowledgePanel';
    panel.className = 'knowledge-panel visible';
    knowledgeState.panelVisible = true;

    panel.innerHTML = [
      '<div class="knowledge-panel-header">',
      '  <div class="knowledge-panel-title">',
      '    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
      '    <span>\u6211\u7684\u98ce\u683c\u753b\u50cf</span>',
      '  </div>',
      '  <button class="knowledge-close-btn" onclick="document.getElementById(\'knowledgePanel\').classList.remove(\'visible\')">',
      '    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      '  </button>',
      '</div>',
      '<div class="knowledge-panel-body" id="knowledgePanelBody"></div>'
    ].join('\n');

    document.body.appendChild(panel);
    refreshKnowledgePanel();
  }

  function refreshKnowledgePanel() {
    fetch('/api/user-prefs', { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          knowledgeState.prefs = data.data;
          renderKnowledgePanel(data.data);
        }
      })
      .catch(function() {
        var body = document.getElementById('knowledgePanelBody');
        if (body) body.innerHTML = '<div class="knowledge-empty">\u52a0\u8f7d\u5931\u8d25</div>';
      });
  }

  function renderKnowledgePanel(prefs) {
    var body = document.getElementById('knowledgePanelBody');
    if (!body) return;

    var profile = prefs.styleProfile || {};
    var html = '';

    // 风格画像卡片
    html += '<div class="knowledge-section">';
    html += '<div class="knowledge-section-title">\u5199\u4f5c\u98ce\u683c</div>';

    if (prefs.editHistory && prefs.editHistory.length >= 5) {
      var toneMap = { formal: '\u6b63\u5f0f\u4e13\u4e1a', casual: '\u8f7b\u677e\u53e3\u8bed\u5316', warm: '\u6e29\u6696\u4eb2\u5207' };
      var lenMap = { concise: '\u7b80\u6d01\u7cbe\u70bc', moderate: '\u9002\u4e2d', detailed: '\u8be6\u7ec6\u5145\u5206' };

      html += '<div class="knowledge-profile-grid">';
      html += '<div class="knowledge-profile-item">';
      html += '  <span class="knowledge-profile-label">\u8bed\u6c14</span>';
      html += '  <span class="knowledge-profile-value">' + (toneMap[profile.tonePreference] || '\u5f85\u5206\u6790') + '</span>';
      html += '</div>';
      html += '<div class="knowledge-profile-item">';
      html += '  <span class="knowledge-profile-label">\u957f\u5ea6</span>';
      html += '  <span class="knowledge-profile-value">' + (lenMap[profile.lengthPreference] || '\u5f85\u5206\u6790') + '</span>';
      html += '</div>';
      html += '<div class="knowledge-profile-item">';
      html += '  <span class="knowledge-profile-label">\u7f16\u8f91\u6b21\u6570</span>';
      html += '  <span class="knowledge-profile-value">' + prefs.editHistory.length + '</span>';
      html += '</div>';
      html += '</div>';

      if (profile.commonPhrases && profile.commonPhrases.length > 0) {
        html += '<div class="knowledge-tags-section">';
        html += '<div class="knowledge-tags-label">\u5e38\u7528\u8868\u8ff0</div>';
        html += '<div class="knowledge-tags">';
        profile.commonPhrases.slice(0, 12).forEach(function(phrase) {
          html += '<span class="knowledge-tag">' + escapeHtml(phrase) + '</span>';
        });
        html += '</div></div>';
      }

      if (profile.avoidedPhrases && profile.avoidedPhrases.length > 0) {
        html += '<div class="knowledge-tags-section">';
        html += '<div class="knowledge-tags-label">\u907f\u514d\u4f7f\u7528</div>';
        html += '<div class="knowledge-tags">';
        profile.avoidedPhrases.slice(0, 8).forEach(function(phrase) {
          html += '<span class="knowledge-tag avoid">' + escapeHtml(phrase) + '</span>';
        });
        html += '</div></div>';
      }
    } else {
      var needed = 5 - (prefs.editHistory ? prefs.editHistory.length : 0);
      html += '<div class="knowledge-empty-hint">\u8fd8\u9700\u7f16\u8f91 ' + needed + ' \u6b21\u5373\u53ef\u751f\u6210\u98ce\u683c\u753b\u50cf</div>';
    }
    html += '</div>';

    // 写作模板
    html += '<div class="knowledge-section">';
    html += '<div class="knowledge-section-title">';
    html += '\u5199\u4f5c\u6a21\u677f';
    html += '<button class="knowledge-add-template-btn" onclick="window.addWritingTemplate()">\u65b0\u5efa</button>';
    html += '</div>';

    if (prefs.writingTemplates && prefs.writingTemplates.length > 0) {
      prefs.writingTemplates.forEach(function(tpl) {
        html += '<div class="knowledge-template-item">';
        html += '  <div class="knowledge-template-name">' + escapeHtml(tpl.name) + '</div>';
        html += '  <div class="knowledge-template-preview">' + escapeHtml((tpl.content || '').substring(0, 60)) + '...</div>';
        html += '  <div class="knowledge-template-actions">';
        html += '    <button onclick="window.useTemplate(\'' + tpl.id + '\')">\u4f7f\u7528</button>';
        html += '    <button onclick="window.deleteTemplate(\'' + tpl.id + '\')">\u5220\u9664</button>';
        html += '  </div>';
        html += '</div>';
      });
    } else {
      html += '<div class="knowledge-empty-hint">\u6682\u65e0\u6a21\u677f\uff0c\u70b9\u51fb\u201c\u65b0\u5efa\u201d\u521b\u5efa</div>';
    }
    html += '</div>';

    // 风格摘要（可复制给 Agent）
    html += '<div class="knowledge-section">';
    html += '<div class="knowledge-section-title">\u98ce\u683c\u6458\u8981</div>';
    html += '<div class="knowledge-summary-box" id="knowledgeSummaryBox">\u52a0\u8f7d\u4e2d...</div>';
    html += '<button class="knowledge-copy-summary-btn" onclick="window.copyStyleSummary()">\u590d\u5236\u6458\u8981\u53d1\u7ed9 Agent</button>';
    html += '</div>';

    body.innerHTML = html;

    // 加载风格摘要
    fetch('/api/user-prefs/style-summary', { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var box = document.getElementById('knowledgeSummaryBox');
        if (box && data.success) {
          box.textContent = data.summary || '\u6682\u65e0\u6570\u636e';
        }
      })
      .catch(function() {});
  }

  // ===== 写作模板操作 =====
  window.addWritingTemplate = function() {
    var name = prompt('\u6a21\u677f\u540d\u79f0\uff1a');
    if (!name) return;

    var content = prompt('\u6a21\u677f\u5185\u5bb9\uff08\u652f\u6301 Markdown\uff09\uff1a');
    if (!content) return;

    fetch('/api/user-prefs/template', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, content: content })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        if (typeof showToast === 'function') showToast('\u6a21\u677f\u5df2\u4fdd\u5b58');
        refreshKnowledgePanel();
      }
    })
    .catch(function() {});
  };

  window.useTemplate = function(templateId) {
    if (!knowledgeState.prefs) return;
    var tpl = knowledgeState.prefs.writingTemplates.find(function(t) { return t.id === templateId; });
    if (!tpl) return;

    // 填入编辑器
    var editor = document.querySelector('.doc-editor-textarea') ||
                 document.querySelector('.preview-editor') ||
                 document.getElementById('previewEditor');

    if (editor) {
      if (editor.value !== undefined) {
        editor.value = tpl.content;
      } else {
        editor.textContent = tpl.content;
      }
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      if (typeof showToast === 'function') showToast('\u5df2\u5e94\u7528\u6a21\u677f\uff1a' + tpl.name);
    } else {
      // 如果没有编辑器，复制到剪贴板
      navigator.clipboard.writeText(tpl.content).then(function() {
        if (typeof showToast === 'function') showToast('\u6a21\u677f\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f');
      });
    }
  };

  window.deleteTemplate = function(templateId) {
    if (!confirm('\u786e\u5b9a\u5220\u9664\u8be5\u6a21\u677f\uff1f')) return;

    fetch('/api/user-prefs/template/delete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId: templateId })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        if (typeof showToast === 'function') showToast('\u6a21\u677f\u5df2\u5220\u9664');
        refreshKnowledgePanel();
      }
    })
    .catch(function() {});
  };

  window.copyStyleSummary = function() {
    var box = document.getElementById('knowledgeSummaryBox');
    if (!box) return;

    var text = '\u8bf7\u6309\u7167\u4ee5\u4e0b\u7528\u6237\u98ce\u683c\u504f\u597d\u751f\u6210\u5185\u5bb9\uff1a\n' + box.textContent;
    navigator.clipboard.writeText(text).then(function() {
      if (typeof showToast === 'function') showToast('\u98ce\u683c\u6458\u8981\u5df2\u590d\u5236\uff0c\u53ef\u7c98\u8d34\u5230\u804a\u5929\u8f93\u5165\u6846');
    });
  };

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  init();

})();
