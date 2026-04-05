/**
 * P0: 增强文档编辑器 - 分屏实时预览 + Agent 上下文回传
 * 将预览面板从"只读预览"升级为"可编辑文档工作台"
 */

(function() {
  'use strict';

  // ========== 状态管理 ==========
  var editorState = {
    isEditing: false,
    isSplitView: true,       // 分屏模式
    autoSave: null,          // 自动保存定时器
    lastSavedContent: '',
    undoStack: [],
    redoStack: [],
    maxUndo: 50,
    changesSinceLastSave: 0,
    syncScrollEnabled: true
  };

  // ========== 覆盖 togglePreviewEdit ==========
  var _origToggle = window.togglePreviewEdit;
  window.togglePreviewEdit = function() {
    if (!window.currentPreviewFile) return;

    if (editorState.isEditing) {
      exitEnhancedEdit();
    } else {
      enterEnhancedEdit();
    }
  };

  // ========== 进入增强编辑模式 ==========
  function enterEnhancedEdit() {
    editorState.isEditing = true;
    editorState.lastSavedContent = window.currentPreviewFile.content || '';
    editorState.undoStack = [];
    editorState.redoStack = [];
    editorState.changesSinceLastSave = 0;

    var previewBody = document.getElementById('previewBody');
    var editBar = document.getElementById('previewEditBar');
    var editBtn = document.getElementById('previewEditBtn');

    // 标记编辑模式
    previewBody.classList.add('edit-mode');
    previewBody.classList.add('enhanced-edit');
    if (editBtn) editBtn.classList.add('editing');

    // 替换编辑栏为增强版
    if (editBar) {
      editBar.innerHTML = buildEnhancedEditBar();
      editBar.classList.add('visible');
      editBar.classList.add('enhanced');
    }

    // 构建分屏编辑器
    var content = window.currentPreviewFile.content || '';
    previewBody.innerHTML = buildSplitEditor(content);

    // 初始化编辑器
    initEditor();

    // 启动自动保存
    editorState.autoSave = setInterval(function() {
      autoSaveCheck();
    }, 30000); // 30秒自动保存
  }

  // ========== 退出编辑模式 ==========
  function exitEnhancedEdit() {
    editorState.isEditing = false;

    if (editorState.autoSave) {
      clearInterval(editorState.autoSave);
      editorState.autoSave = null;
    }

    var previewBody = document.getElementById('previewBody');
    var editBar = document.getElementById('previewEditBar');
    var editBtn = document.getElementById('previewEditBtn');

    previewBody.classList.remove('edit-mode', 'enhanced-edit');
    if (editBar) {
      editBar.classList.remove('visible', 'enhanced');
    }
    if (editBtn) editBtn.classList.remove('editing');

    // 重新渲染预览内容
    var content = window.currentPreviewFile.content || '';
    var renderHTML = '';
    if (typeof marked !== 'undefined') {
      var parsed = marked.parse(content);
      if (typeof DOMPurify !== 'undefined') parsed = DOMPurify.sanitize(parsed);
      renderHTML = '<div class="preview-render"><div class="preview-doc">' + parsed + '</div></div>';
    } else {
      renderHTML = '<div class="preview-render"><div class="preview-doc"><pre style="white-space:pre-wrap">' +
        content.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre></div></div>';
    }
    renderHTML += '<textarea class="preview-editor" id="previewEditor" placeholder="在此编辑 Markdown 内容..."></textarea>';
    previewBody.innerHTML = renderHTML;

    // 恢复原始编辑栏
    if (editBar) {
      editBar.innerHTML = '<div class="edit-status"><span class="dot"></span> 编辑模式 \u00b7 修改后可保存并发送给 Agent</div>' +
        '<div class="edit-actions"><button class="edit-cancel-btn" onclick="cancelPreviewEdit()">取消</button>' +
        '<button class="edit-save-btn" onclick="savePreviewEdit()">保存并发送</button></div>';
    }

    // 同步全局状态
    window.previewEditMode = false;
  }

  // ========== 构建增强编辑栏 ==========
  function buildEnhancedEditBar() {
    return '<div class="enhanced-edit-toolbar">' +
      '<div class="edit-toolbar-left">' +
        '<div class="edit-status-indicator"><span class="dot"></span> <span id="editorStatus">编辑中</span></div>' +
        '<div class="edit-format-btns">' +
          '<button class="fmt-btn" onclick="editorFormat(\'bold\')" title="加粗 Ctrl+B"><b>B</b></button>' +
          '<button class="fmt-btn" onclick="editorFormat(\'italic\')" title="斜体 Ctrl+I"><i>I</i></button>' +
          '<button class="fmt-btn" onclick="editorFormat(\'heading\')" title="标题">H</button>' +
          '<button class="fmt-btn" onclick="editorFormat(\'list\')" title="列表">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>' +
          '</button>' +
          '<button class="fmt-btn" onclick="editorFormat(\'table\')" title="插入表格">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>' +
          '</button>' +
          '<button class="fmt-btn" onclick="editorFormat(\'quote\')" title="引用">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/></svg>' +
          '</button>' +
          '<span class="fmt-divider"></span>' +
          '<button class="fmt-btn" onclick="editorUndo()" title="撤销 Ctrl+Z">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>' +
          '</button>' +
          '<button class="fmt-btn" onclick="editorRedo()" title="重做 Ctrl+Y">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="edit-toolbar-right">' +
        '<button class="fmt-btn view-toggle" onclick="toggleEditorView()" title="切换视图" id="viewToggleBtn">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>' +
          ' 分屏' +
        '</button>' +
        '<span class="edit-word-count" id="editorWordCount">0 字</span>' +
        '<button class="edit-cancel-btn" onclick="cancelEnhancedEdit()">取消</button>' +
        '<button class="edit-save-btn" onclick="saveEnhancedEdit(false)">保存</button>' +
        '<button class="edit-send-btn" onclick="saveEnhancedEdit(true)">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
          ' 保存并发送' +
        '</button>' +
      '</div>' +
    '</div>';
  }

  // ========== 构建分屏编辑器 ==========
  function buildSplitEditor(content) {
    return '<div class="doc-editor-container" id="docEditorContainer">' +
      '<div class="doc-editor-pane editor-pane" id="editorPane">' +
        '<div class="editor-pane-header">' +
          '<span class="pane-label">Markdown 编辑</span>' +
          '<span class="pane-hint">支持 Markdown 语法</span>' +
        '</div>' +
        '<textarea class="doc-editor-textarea" id="docEditorTextarea" spellcheck="false" placeholder="在此编辑 Markdown 内容...">' +
          escapeHtml(content) +
        '</textarea>' +
        '<div class="editor-line-numbers" id="editorLineNumbers"></div>' +
      '</div>' +
      '<div class="doc-editor-divider" id="editorDivider">' +
        '<div class="divider-handle"></div>' +
      '</div>' +
      '<div class="doc-editor-pane preview-pane" id="previewPane">' +
        '<div class="editor-pane-header">' +
          '<span class="pane-label">实时预览</span>' +
          '<span class="pane-hint">所见即所得</span>' +
        '</div>' +
        '<div class="doc-editor-preview" id="docEditorPreview">' +
          '<div class="preview-doc">' + renderMarkdown(content) + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ========== 初始化编辑器 ==========
  function initEditor() {
    var textarea = document.getElementById('docEditorTextarea');
    if (!textarea) return;

    // 实时预览更新
    textarea.addEventListener('input', function() {
      updatePreview();
      updateWordCount();
      pushUndoState();
      editorState.changesSinceLastSave++;
      updateSaveStatus();
    });

    // 键盘快捷键
    textarea.addEventListener('keydown', function(e) {
      // Tab 缩进
      if (e.key === 'Tab') {
        e.preventDefault();
        var start = this.selectionStart;
        var end = this.selectionEnd;
        if (e.shiftKey) {
          // 反缩进
          var lineStart = this.value.lastIndexOf('\n', start - 1) + 1;
          var line = this.value.substring(lineStart, end);
          if (line.startsWith('  ')) {
            this.value = this.value.substring(0, lineStart) + line.substring(2);
            this.selectionStart = Math.max(start - 2, lineStart);
            this.selectionEnd = end - 2;
          }
        } else {
          this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
          this.selectionStart = this.selectionEnd = start + 2;
        }
        updatePreview();
        return;
      }

      // Ctrl+B 加粗
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        editorFormat('bold');
        return;
      }

      // Ctrl+I 斜体
      if (e.ctrlKey && e.key === 'i') {
        e.preventDefault();
        editorFormat('italic');
        return;
      }

      // Ctrl+Z 撤销
      if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        editorUndo();
        return;
      }

      // Ctrl+Y 或 Ctrl+Shift+Z 重做
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        editorRedo();
        return;
      }

      // Ctrl+S 保存
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        saveEnhancedEdit(false);
        return;
      }
    });

    // 同步滚动
    textarea.addEventListener('scroll', function() {
      if (!editorState.syncScrollEnabled) return;
      var preview = document.getElementById('docEditorPreview');
      if (!preview) return;
      var ratio = this.scrollTop / (this.scrollHeight - this.clientHeight || 1);
      preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight);
    });

    // 分割线拖拽
    initEditorDivider();

    // 初始化状态
    updateWordCount();
    pushUndoState();
    updateLineNumbers();

    // 行号更新
    textarea.addEventListener('scroll', updateLineNumbers);
    textarea.addEventListener('input', updateLineNumbers);

    textarea.focus();
  }

  // ========== 实时预览更新 ==========
  function updatePreview() {
    var textarea = document.getElementById('docEditorTextarea');
    var previewDiv = document.getElementById('docEditorPreview');
    if (!textarea || !previewDiv) return;

    var content = textarea.value;
    previewDiv.innerHTML = '<div class="preview-doc">' + renderMarkdown(content) + '</div>';
  }

  // ========== Markdown 渲染 ==========
  function renderMarkdown(text) {
    if (!text) return '<p style="color:var(--text-3)">开始编辑...</p>';
    if (typeof marked === 'undefined') return '<pre>' + escapeHtml(text) + '</pre>';

    // 预处理
    var processed = text.replace(/##([^\s#\n])/g, '## $1');
    // 修复表格
    processed = processed.replace(/^[ \t]+\|/gm, '|');
    var changed = true;
    while (changed) {
      var prev = processed;
      processed = processed.replace(/(\|[^\n]*)\n\n(\|)/g, '$1\n$2');
      changed = (processed !== prev);
    }

    var html = marked.parse(processed);
    if (typeof DOMPurify !== 'undefined') html = DOMPurify.sanitize(html);
    return html;
  }

  // ========== 字数统计 ==========
  function updateWordCount() {
    var textarea = document.getElementById('docEditorTextarea');
    var countEl = document.getElementById('editorWordCount');
    if (!textarea || !countEl) return;

    var text = textarea.value;
    var chars = text.length;
    var lines = text.split('\n').length;
    countEl.textContent = chars + ' 字 \u00b7 ' + lines + ' 行';
  }

  // ========== 行号 ==========
  function updateLineNumbers() {
    var textarea = document.getElementById('docEditorTextarea');
    var lineNumEl = document.getElementById('editorLineNumbers');
    if (!textarea || !lineNumEl) return;

    var lines = textarea.value.split('\n').length;
    var html = '';
    for (var i = 1; i <= lines; i++) {
      html += '<div>' + i + '</div>';
    }
    lineNumEl.innerHTML = html;
    lineNumEl.scrollTop = textarea.scrollTop;
  }

  // ========== 格式化操作 ==========
  window.editorFormat = function(type) {
    var textarea = document.getElementById('docEditorTextarea');
    if (!textarea) return;

    var start = textarea.selectionStart;
    var end = textarea.selectionEnd;
    var selected = textarea.value.substring(start, end);
    var before = textarea.value.substring(0, start);
    var after = textarea.value.substring(end);
    var insert = '';
    var cursorOffset = 0;

    switch (type) {
      case 'bold':
        insert = '**' + (selected || '粗体文本') + '**';
        cursorOffset = selected ? insert.length : 2;
        break;
      case 'italic':
        insert = '*' + (selected || '斜体文本') + '*';
        cursorOffset = selected ? insert.length : 1;
        break;
      case 'heading':
        // 在行首添加 ##
        var lineStart = before.lastIndexOf('\n') + 1;
        var linePrefix = before.substring(lineStart);
        if (linePrefix.startsWith('## ')) {
          // 移除标题
          before = before.substring(0, lineStart) + linePrefix.substring(3);
          insert = selected;
          cursorOffset = selected.length;
        } else {
          before = before.substring(0, lineStart) + '## ' + linePrefix;
          insert = selected;
          cursorOffset = selected.length;
        }
        break;
      case 'list':
        if (selected) {
          insert = selected.split('\n').map(function(line) {
            return line.startsWith('- ') ? line.substring(2) : '- ' + line;
          }).join('\n');
        } else {
          insert = '- 列表项';
        }
        cursorOffset = insert.length;
        break;
      case 'table':
        insert = '\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n';
        cursorOffset = insert.length;
        break;
      case 'quote':
        if (selected) {
          insert = selected.split('\n').map(function(line) {
            return line.startsWith('> ') ? line.substring(2) : '> ' + line;
          }).join('\n');
        } else {
          insert = '> 引用内容';
        }
        cursorOffset = insert.length;
        break;
    }

    textarea.value = before + insert + after;
    textarea.selectionStart = start + cursorOffset;
    textarea.selectionEnd = start + cursorOffset;
    textarea.focus();
    updatePreview();
    updateWordCount();
    pushUndoState();
  };

  // ========== 撤销/重做 ==========
  function pushUndoState() {
    var textarea = document.getElementById('docEditorTextarea');
    if (!textarea) return;

    var currentContent = textarea.value;
    var lastState = editorState.undoStack[editorState.undoStack.length - 1];
    if (lastState && lastState.content === currentContent) return;

    editorState.undoStack.push({
      content: currentContent,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd
    });

    if (editorState.undoStack.length > editorState.maxUndo) {
      editorState.undoStack.shift();
    }

    editorState.redoStack = [];
  }

  window.editorUndo = function() {
    if (editorState.undoStack.length <= 1) return;
    var textarea = document.getElementById('docEditorTextarea');
    if (!textarea) return;

    var current = editorState.undoStack.pop();
    editorState.redoStack.push(current);

    var prev = editorState.undoStack[editorState.undoStack.length - 1];
    textarea.value = prev.content;
    textarea.selectionStart = prev.selectionStart;
    textarea.selectionEnd = prev.selectionEnd;
    updatePreview();
    updateWordCount();
  };

  window.editorRedo = function() {
    if (editorState.redoStack.length === 0) return;
    var textarea = document.getElementById('docEditorTextarea');
    if (!textarea) return;

    var next = editorState.redoStack.pop();
    editorState.undoStack.push(next);

    textarea.value = next.content;
    textarea.selectionStart = next.selectionStart;
    textarea.selectionEnd = next.selectionEnd;
    updatePreview();
    updateWordCount();
  };

  // ========== 视图切换 ==========
  window.toggleEditorView = function() {
    var container = document.getElementById('docEditorContainer');
    var btn = document.getElementById('viewToggleBtn');
    if (!container) return;

    editorState.isSplitView = !editorState.isSplitView;

    if (editorState.isSplitView) {
      container.classList.remove('editor-only', 'preview-only');
      if (btn) btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg> 分屏';
    } else {
      container.classList.add('editor-only');
      container.classList.remove('preview-only');
      if (btn) btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> 仅编辑';
    }
  };

  // ========== 编辑器分割线拖拽 ==========
  function initEditorDivider() {
    var divider = document.getElementById('editorDivider');
    var container = document.getElementById('docEditorContainer');
    if (!divider || !container) return;

    var isDragging = false;

    divider.addEventListener('mousedown', function(e) {
      isDragging = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      var rect = container.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var pct = (x / rect.width) * 100;
      pct = Math.max(20, Math.min(80, pct));

      var editorPane = document.getElementById('editorPane');
      var previewPane = document.getElementById('previewPane');
      if (editorPane) editorPane.style.flex = '0 0 ' + pct + '%';
      if (previewPane) previewPane.style.flex = '0 0 ' + (100 - pct - 1) + '%';
    });

    document.addEventListener('mouseup', function() {
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  // ========== 自动保存 ==========
  function autoSaveCheck() {
    if (editorState.changesSinceLastSave === 0) return;

    var textarea = document.getElementById('docEditorTextarea');
    if (!textarea) return;

    window.currentPreviewFile.content = textarea.value;
    editorState.lastSavedContent = textarea.value;
    editorState.changesSinceLastSave = 0;
    updateSaveStatus('已自动保存');

    // 如果有 _dbId，保存到服务器
    if (window.currentPreviewFile.fileId) {
      saveToServer(window.currentPreviewFile.fileId, textarea.value);
    }
  }

  function updateSaveStatus(msg) {
    var statusEl = document.getElementById('editorStatus');
    if (!statusEl) return;
    if (msg) {
      statusEl.textContent = msg;
      setTimeout(function() {
        if (statusEl) statusEl.textContent = '编辑中';
      }, 2000);
    } else if (editorState.changesSinceLastSave > 0) {
      statusEl.textContent = '编辑中 \u00b7 未保存';
    }
  }

  // ========== 保存到服务器 ==========
  function saveToServer(fileId, content) {
    fetch('/api/files/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: window.currentPreviewFile.fileName || '文档.md',
        content: content,
        folderId: null
      })
    }).catch(function() {});
  }

  // ========== 取消编辑 ==========
  window.cancelEnhancedEdit = function() {
    if (editorState.changesSinceLastSave > 0) {
      if (!confirm('有未保存的修改，确定要放弃吗？')) return;
    }
    // 恢复原始内容
    window.currentPreviewFile.content = editorState.lastSavedContent;
    exitEnhancedEdit();
  };

  // ========== 保存并可选发送给 Agent ==========
  window.saveEnhancedEdit = function(sendToAgent) {
    var textarea = document.getElementById('docEditorTextarea');
    if (!textarea) return;

    var content = textarea.value;
    window.currentPreviewFile.content = content;
    editorState.lastSavedContent = content;
    editorState.changesSinceLastSave = 0;

    // 保存到服务器
    if (window.currentPreviewFile.fileId) {
      saveToServer(window.currentPreviewFile.fileId, content);
    }

    if (sendToAgent) {
      // 退出编辑模式
      exitEnhancedEdit();

      // 将编辑内容作为上下文发送给 Agent
      var docName = window.currentPreviewFile.fileName || '文档';
      var input = document.getElementById('messageInput');

      if (typeof pendingFile !== 'undefined') {
        window.pendingFile = {
          name: docName,
          size: content.length,
          content: content,
          type: 'document',
          isImage: false,
          objectUrl: null
        };
        var previewArea = document.getElementById('filePreviewArea');
        if (previewArea) {
          previewArea.style.display = 'block';
          previewArea.innerHTML = '<div class="file-preview-card">'
            + '<span class="file-preview-icon">' + (typeof getFileIcon === 'function' ? getFileIcon(docName) : '📄') + '</span>'
            + '<span class="file-preview-name">' + docName + ' (\u5df2\u7f16\u8f91)</span>'
            + '<span class="file-preview-size">\u5df2\u5f15\u7528</span>'
            + '<button class="file-preview-remove" onclick="removePendingFile()" title="\u79fb\u9664"></button>'
            + '</div>';
        }
      }

      if (input) {
        input.value = '\u8bf7\u57fa\u4e8e\u6211\u521a\u624d\u7f16\u8f91\u7684\u6587\u6863\u5185\u5bb9\uff0c\u7ee7\u7eed\u5e2e\u6211\u5b8c\u5584\u548c\u4f18\u5316';
        input.focus();
        if (typeof autoResize === 'function') autoResize(input);
      }

      showPreviewToast('\u6587\u6863\u5df2\u4fdd\u5b58\uff0c\u53ef\u53d1\u9001\u7ed9 Agent');
    } else {
      updateSaveStatus('\u5df2\u4fdd\u5b58');
      showPreviewToast('\u6587\u6863\u5df2\u4fdd\u5b58');
    }
  };

  // ========== 覆盖 cancelPreviewEdit ==========
  var _origCancel = window.cancelPreviewEdit;
  window.cancelPreviewEdit = function() {
    if (editorState.isEditing) {
      cancelEnhancedEdit();
    } else if (_origCancel) {
      _origCancel();
    }
  };

  // ========== 覆盖 savePreviewEdit ==========
  var _origSave = window.savePreviewEdit;
  window.savePreviewEdit = function() {
    if (editorState.isEditing) {
      saveEnhancedEdit(true);
    } else if (_origSave) {
      _origSave();
    }
  };

  // ========== 工具函数 ==========
  function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showPreviewToast(msg) {
    if (typeof window.showPreviewToast === 'function' && window.showPreviewToast !== showPreviewToast) {
      // 使用已有的 toast
    }
    var toast = document.getElementById('previewToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'previewToast';
      toast.className = 'preview-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(function() { toast.classList.remove('show'); }, 2000);
  }

})();
