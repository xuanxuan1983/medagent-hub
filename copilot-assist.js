/**
 * P2: 陪伴式副驾 - 编辑时实时合规建议 + 违禁词提醒
 * 当用户在文档编辑器中编辑内容时，自动检测违禁词并提供合规建议
 */

(function() {
  'use strict';

  // ===== 医美行业违禁词库 =====
  var FORBIDDEN_WORDS = {
    // 绝对化用语
    absolute: {
      label: '绝对化用语',
      level: 'error',
      words: ['最好', '最佳', '最优', '第一', '唯一', '顶级', '极致', '绝对', '100%', '百分百',
              '永久', '根治', '彻底', '完全消除', '零风险', '无副作用', '无风险', '万能',
              '国家级', '世界级', '全球首创', '独一无二', '史无前例', '前所未有']
    },
    // 医疗效果承诺
    medical: {
      label: '医疗效果承诺',
      level: 'error',
      words: ['保证效果', '确保效果', '包治', '药到病除', '立竿见影', '一次见效',
              '签约治疗', '无效退款', '承诺疗效', '保证治愈', '必定', '肯定有效',
              '治愈率100%', '成功率100%', '零失败']
    },
    // 虚假宣传
    falseAd: {
      label: '虚假宣传',
      level: 'error',
      words: ['明星同款', '网红推荐', '专家推荐', '医生推荐', '名人代言',
              '央视推荐', '国家认证', '权威认证', '获奖产品']
    },
    // 诱导性用语
    inducing: {
      label: '诱导性用语',
      level: 'warning',
      words: ['限时', '限量', '抢购', '秒杀', '清仓', '跳楼价', '亏本', '血亏',
              '仅此一次', '错过不再', '最后机会', '名额有限', '先到先得',
              '不买后悔', '买到赚到']
    },
    // 敏感表述
    sensitive: {
      label: '敏感表述',
      level: 'warning',
      words: ['变美', '逆龄', '冻龄', '回春', '换脸', '整容', '削骨',
              '脱胎换骨', '焕然一新', '判若两人', '女神', '男神',
              '丑', '难看', '老态', '皱纹横生']
    },
    // 建议替换
    suggest: {
      label: '建议优化',
      level: 'info',
      words: ['打针', '开刀', '手术', '动刀'],
      replacements: {
        '打针': '注射治疗',
        '开刀': '手术治疗',
        '手术': '医疗美容项目',
        '动刀': '手术治疗'
      }
    }
  };

  // ===== 状态 =====
  var copilotState = {
    isEnabled: true,
    isVisible: false,
    checkTimer: null,
    lastContent: '',
    results: [],
    panelEl: null
  };

  // ===== 初始化 =====
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setup);
    } else {
      setup();
    }
  }

  function setup() {
    createCopilotPanel();
    observeEditorChanges();
    addCopilotToggle();
  }

  // ===== 创建副驾面板 =====
  function createCopilotPanel() {
    var panel = document.createElement('div');
    panel.id = 'copilotPanel';
    panel.className = 'copilot-panel';
    panel.innerHTML = [
      '<div class="copilot-panel-header">',
      '  <div class="copilot-panel-title">',
      '    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      '    <span>\u5408\u89c4\u526f\u9a7e</span>',
      '  </div>',
      '  <div class="copilot-panel-actions">',
      '    <button class="copilot-btn-recheck" onclick="window.copilotRecheck()" title="\u91cd\u65b0\u68c0\u67e5">',
      '      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
      '    </button>',
      '    <button class="copilot-btn-close" onclick="window.toggleCopilotPanel()" title="\u5173\u95ed">',
      '      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      '    </button>',
      '  </div>',
      '</div>',
      '<div class="copilot-panel-summary" id="copilotSummary"></div>',
      '<div class="copilot-panel-body" id="copilotBody">',
      '  <div class="copilot-empty">',
      '    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>',
      '    <p>\u5f00\u59cb\u7f16\u8f91\u540e\u81ea\u52a8\u68c0\u67e5\u5408\u89c4\u6027</p>',
      '  </div>',
      '</div>'
    ].join('\n');

    document.body.appendChild(panel);
    copilotState.panelEl = panel;
  }

  // ===== 添加副驾切换按钮 =====
  function addCopilotToggle() {
    // 在预览面板工具栏中添加副驾按钮
    setTimeout(function() {
      var toolbars = document.querySelectorAll('.preview-panel-actions');
      toolbars.forEach(function(toolbar) {
        if (toolbar.querySelector('.copilot-toggle-btn')) return;

        var btn = document.createElement('button');
        btn.className = 'preview-action-btn copilot-toggle-btn';
        btn.title = '\u5408\u89c4\u526f\u9a7e';
        btn.onclick = function() { window.toggleCopilotPanel(); };
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
        toolbar.appendChild(btn);
      });
    }, 1000);
  }

  // ===== 监听编辑器变化 =====
  function observeEditorChanges() {
    // 监听编辑器输入事件
    document.addEventListener('input', function(e) {
      var target = e.target;
      if (target.classList && (
        target.classList.contains('doc-editor-textarea') ||
        target.classList.contains('preview-editor') ||
        target.id === 'previewEditor' ||
        target.closest && target.closest('.doc-editor-pane')
      )) {
        scheduleCheck(target.value || target.textContent);
      }
    });

    // 也监听 contenteditable
    document.addEventListener('keyup', function(e) {
      var target = e.target;
      if (target.contentEditable === 'true' && target.closest && target.closest('.preview-panel')) {
        scheduleCheck(target.textContent);
      }
    });
  }

  function scheduleCheck(content) {
    if (!copilotState.isEnabled) return;
    if (content === copilotState.lastContent) return;
    copilotState.lastContent = content;

    clearTimeout(copilotState.checkTimer);
    copilotState.checkTimer = setTimeout(function() {
      runComplianceCheck(content);
    }, 800); // 800ms 防抖
  }

  // ===== 合规检查核心 =====
  function runComplianceCheck(content) {
    if (!content || content.trim().length < 5) {
      updatePanel([]);
      return;
    }

    var results = [];

    // 遍历所有违禁词类别
    Object.keys(FORBIDDEN_WORDS).forEach(function(category) {
      var cat = FORBIDDEN_WORDS[category];
      cat.words.forEach(function(word) {
        var idx = 0;
        var lowerContent = content;
        while (true) {
          var pos = lowerContent.indexOf(word, idx);
          if (pos === -1) break;

          // 获取上下文（前后各20字）
          var contextStart = Math.max(0, pos - 20);
          var contextEnd = Math.min(content.length, pos + word.length + 20);
          var context = content.substring(contextStart, contextEnd);

          var result = {
            word: word,
            category: cat.label,
            level: cat.level,
            position: pos,
            context: context,
            contextStart: contextStart,
            replacement: cat.replacements ? cat.replacements[word] : null
          };

          results.push(result);
          idx = pos + word.length;
        }
      });
    });

    // 去重（同一位置同一词只报一次）
    var seen = {};
    results = results.filter(function(r) {
      var key = r.word + '_' + r.position;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });

    // 按严重程度排序
    var levelOrder = { error: 0, warning: 1, info: 2 };
    results.sort(function(a, b) {
      return (levelOrder[a.level] || 9) - (levelOrder[b.level] || 9);
    });

    copilotState.results = results;
    updatePanel(results);

    // 自动显示面板（如果有严重问题）
    if (results.length > 0 && !copilotState.isVisible) {
      var hasError = results.some(function(r) { return r.level === 'error'; });
      if (hasError) {
        showCopilotPanel();
      }
    }
  }

  // ===== 更新面板 UI =====
  function updatePanel(results) {
    var summary = document.getElementById('copilotSummary');
    var body = document.getElementById('copilotBody');
    if (!summary || !body) return;

    // 统计
    var errorCount = results.filter(function(r) { return r.level === 'error'; }).length;
    var warningCount = results.filter(function(r) { return r.level === 'warning'; }).length;
    var infoCount = results.filter(function(r) { return r.level === 'info'; }).length;

    // 摘要
    if (results.length === 0) {
      summary.innerHTML = '<div class="copilot-summary-ok"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg> \u5185\u5bb9\u5408\u89c4\uff0c\u672a\u53d1\u73b0\u95ee\u9898</div>';
      summary.className = 'copilot-panel-summary ok';
    } else {
      var parts = [];
      if (errorCount > 0) parts.push('<span class="copilot-count error">' + errorCount + ' \u4e25\u91cd</span>');
      if (warningCount > 0) parts.push('<span class="copilot-count warning">' + warningCount + ' \u8b66\u544a</span>');
      if (infoCount > 0) parts.push('<span class="copilot-count info">' + infoCount + ' \u5efa\u8bae</span>');
      summary.innerHTML = '<div class="copilot-summary-issues">\u53d1\u73b0 ' + results.length + ' \u4e2a\u95ee\u9898\uff1a' + parts.join(' ') + '</div>';
      summary.className = 'copilot-panel-summary issues';
    }

    // 详细列表
    if (results.length === 0) {
      body.innerHTML = '<div class="copilot-empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="1.5"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg><p>\u5185\u5bb9\u5408\u89c4\uff0c\u672a\u53d1\u73b0\u8fdd\u7981\u8bcd</p></div>';
      return;
    }

    var html = '';
    results.forEach(function(r, i) {
      var levelIcon = '';
      if (r.level === 'error') {
        levelIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
      } else if (r.level === 'warning') {
        levelIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      } else {
        levelIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
      }

      // 高亮上下文中的违禁词
      var escapedWord = r.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var highlightedContext = escapeHtml(r.context).replace(
        new RegExp(escapeHtml(r.word), 'g'),
        '<mark class="copilot-highlight-' + r.level + '">' + escapeHtml(r.word) + '</mark>'
      );

      html += '<div class="copilot-issue copilot-issue-' + r.level + '">';
      html += '  <div class="copilot-issue-header">';
      html += '    ' + levelIcon;
      html += '    <span class="copilot-issue-word">' + escapeHtml(r.word) + '</span>';
      html += '    <span class="copilot-issue-category">' + r.category + '</span>';
      html += '  </div>';
      html += '  <div class="copilot-issue-context">...' + highlightedContext + '...</div>';

      if (r.replacement) {
        html += '  <div class="copilot-issue-suggestion">';
        html += '    <span>\u5efa\u8bae\u66ff\u6362\u4e3a\uff1a</span>';
        html += '    <strong>' + escapeHtml(r.replacement) + '</strong>';
        html += '    <button class="copilot-replace-btn" onclick="window.copilotReplace(' + i + ')">\u66ff\u6362</button>';
        html += '  </div>';
      } else {
        html += '  <div class="copilot-issue-tip">\u5efa\u8bae\u5220\u9664\u6216\u4fee\u6539\u8be5\u8868\u8ff0</div>';
      }

      html += '</div>';
    });

    body.innerHTML = html;
  }

  // ===== 一键替换 =====
  window.copilotReplace = function(index) {
    var result = copilotState.results[index];
    if (!result || !result.replacement) return;

    // 查找编辑器
    var editor = document.querySelector('.doc-editor-textarea') ||
                 document.querySelector('.preview-editor') ||
                 document.getElementById('previewEditor');

    if (editor) {
      var content = editor.value || editor.textContent;
      var newContent = content.split(result.word).join(result.replacement);

      if (editor.value !== undefined) {
        editor.value = newContent;
      } else {
        editor.textContent = newContent;
      }

      // 触发 input 事件以重新检查
      editor.dispatchEvent(new Event('input', { bubbles: true }));

      if (typeof showToast === 'function') {
        showToast('\u5df2\u66ff\u6362\uff1a' + result.word + ' \u2192 ' + result.replacement);
      }
    }
  };

  // ===== 面板显隐 =====
  window.toggleCopilotPanel = function() {
    if (copilotState.isVisible) {
      hideCopilotPanel();
    } else {
      showCopilotPanel();
    }
  };

  function showCopilotPanel() {
    var panel = copilotState.panelEl || document.getElementById('copilotPanel');
    if (panel) {
      panel.classList.add('visible');
      copilotState.isVisible = true;

      // 如果有内容，立即检查
      if (copilotState.lastContent) {
        runComplianceCheck(copilotState.lastContent);
      }
    }
  }

  function hideCopilotPanel() {
    var panel = copilotState.panelEl || document.getElementById('copilotPanel');
    if (panel) {
      panel.classList.remove('visible');
      copilotState.isVisible = false;
    }
  }

  // ===== 手动重新检查 =====
  window.copilotRecheck = function() {
    var editor = document.querySelector('.doc-editor-textarea') ||
                 document.querySelector('.preview-editor') ||
                 document.getElementById('previewEditor');

    if (editor) {
      var content = editor.value || editor.textContent;
      copilotState.lastContent = '';  // 强制重新检查
      scheduleCheck(content);

      if (typeof showToast === 'function') {
        showToast('\u6b63\u5728\u91cd\u65b0\u68c0\u67e5...');
      }
    }
  };

  // ===== 提供 API 给聊天输入框也能检查 =====
  window.checkCompliance = function(text) {
    var results = [];
    Object.keys(FORBIDDEN_WORDS).forEach(function(category) {
      var cat = FORBIDDEN_WORDS[category];
      cat.words.forEach(function(word) {
        if (text.indexOf(word) !== -1) {
          results.push({
            word: word,
            category: cat.label,
            level: cat.level,
            replacement: cat.replacements ? cat.replacements[word] : null
          });
        }
      });
    });
    return results;
  };

  // ===== 工具函数 =====
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  init();

})();
