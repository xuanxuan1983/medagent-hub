/**
 * P1: 面板可拖拽调整宽度
 * 三栏布局（资源面板 | 预览面板 | 聊天面板）之间的分割线可拖拽
 */

(function() {
  'use strict';

  // 配置
  var CONFIG = {
    minWidth: 200,       // 面板最小宽度
    maxWidthPct: 60,     // 面板最大宽度百分比
    handleWidth: 6,      // 拖拽手柄宽度
    storageKey: 'medagent_panel_widths',
    doubleClickReset: true
  };

  // 状态
  var resizeState = {
    isDragging: false,
    activeHandle: null,
    startX: 0,
    startWidths: {},
    panels: {}
  };

  // 初始化
  function init() {
    // 等待 DOM 就绪
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setup);
    } else {
      setup();
    }
  }

  function setup() {
    // 查找所有 chat-view 容器
    var chatViews = document.querySelectorAll('.chat-view');
    chatViews.forEach(function(chatView) {
      setupResizeHandles(chatView);
    });

    // 监听新的 chat-view 创建（MutationObserver）
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType === 1 && node.classList && node.classList.contains('chat-view')) {
            setupResizeHandles(node);
          }
          // 也检查子节点
          if (node.nodeType === 1 && node.querySelectorAll) {
            var views = node.querySelectorAll('.chat-view');
            views.forEach(function(v) { setupResizeHandles(v); });
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // 全局鼠标事件
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // 触摸事件
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);

    // 恢复保存的宽度
    restoreSavedWidths();
  }

  function setupResizeHandles(chatView) {
    // 避免重复设置
    if (chatView.dataset.resizeInit) return;
    chatView.dataset.resizeInit = 'true';

    var children = Array.from(chatView.children);
    var panels = [];

    // 找到所有面板（排除已有的 resize-handle）
    children.forEach(function(child) {
      if (child.classList.contains('resize-handle')) return;
      if (child.classList.contains('resource-panel') ||
          child.classList.contains('preview-panel') ||
          child.classList.contains('chat-main-panel')) {
        panels.push(child);
      }
    });

    // 在相邻面板之间插入拖拽手柄
    for (var i = 0; i < panels.length - 1; i++) {
      var leftPanel = panels[i];
      var rightPanel = panels[i + 1];

      // 检查手柄是否已存在
      var existingHandle = leftPanel.nextElementSibling;
      if (existingHandle && existingHandle.classList.contains('resize-handle')) continue;

      var handle = createResizeHandle(leftPanel, rightPanel, chatView);
      leftPanel.after(handle);
    }
  }

  function createResizeHandle(leftPanel, rightPanel, container) {
    var handle = document.createElement('div');
    handle.className = 'resize-handle';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('tabindex', '0');

    // 内部装饰线
    var line = document.createElement('div');
    line.className = 'resize-handle-line';
    handle.appendChild(line);

    // 鼠标事件
    handle.addEventListener('mousedown', function(e) {
      startResize(e, handle, leftPanel, rightPanel, container);
    });

    // 触摸事件
    handle.addEventListener('touchstart', function(e) {
      var touch = e.touches[0];
      startResize(touch, handle, leftPanel, rightPanel, container);
    }, { passive: false });

    // 双击重置
    if (CONFIG.doubleClickReset) {
      handle.addEventListener('dblclick', function() {
        resetPanelWidths(leftPanel, rightPanel, container);
      });
    }

    // 键盘支持
    handle.addEventListener('keydown', function(e) {
      var step = e.shiftKey ? 50 : 10;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        adjustPanelWidth(leftPanel, rightPanel, container, -step);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        adjustPanelWidth(leftPanel, rightPanel, container, step);
      }
    });

    return handle;
  }

  function startResize(e, handle, leftPanel, rightPanel, container) {
    e.preventDefault();
    resizeState.isDragging = true;
    resizeState.activeHandle = handle;
    resizeState.startX = e.clientX || e.pageX;
    resizeState.leftPanel = leftPanel;
    resizeState.rightPanel = rightPanel;
    resizeState.container = container;
    resizeState.startWidths = {
      left: leftPanel.getBoundingClientRect().width,
      right: rightPanel.getBoundingClientRect().width
    };

    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

    // 添加遮罩防止 iframe 捕获事件
    addOverlay();
  }

  function onMouseMove(e) {
    if (!resizeState.isDragging) return;
    doResize(e.clientX);
  }

  function onTouchMove(e) {
    if (!resizeState.isDragging) return;
    e.preventDefault();
    doResize(e.touches[0].clientX);
  }

  function doResize(clientX) {
    var dx = clientX - resizeState.startX;
    var containerWidth = resizeState.container.getBoundingClientRect().width;
    var maxWidth = containerWidth * (CONFIG.maxWidthPct / 100);

    var newLeftWidth = resizeState.startWidths.left + dx;
    var newRightWidth = resizeState.startWidths.right - dx;

    // 约束最小/最大宽度
    if (newLeftWidth < CONFIG.minWidth) {
      newLeftWidth = CONFIG.minWidth;
      newRightWidth = resizeState.startWidths.left + resizeState.startWidths.right - CONFIG.minWidth;
    }
    if (newRightWidth < CONFIG.minWidth) {
      newRightWidth = CONFIG.minWidth;
      newLeftWidth = resizeState.startWidths.left + resizeState.startWidths.right - CONFIG.minWidth;
    }
    if (newLeftWidth > maxWidth) {
      newLeftWidth = maxWidth;
      newRightWidth = resizeState.startWidths.left + resizeState.startWidths.right - maxWidth;
    }
    if (newRightWidth > maxWidth) {
      newRightWidth = maxWidth;
      newLeftWidth = resizeState.startWidths.left + resizeState.startWidths.right - maxWidth;
    }

    // 应用宽度
    resizeState.leftPanel.style.flex = '0 0 ' + newLeftWidth + 'px';
    resizeState.leftPanel.style.minWidth = newLeftWidth + 'px';
    resizeState.leftPanel.style.maxWidth = newLeftWidth + 'px';

    resizeState.rightPanel.style.flex = '0 0 ' + newRightWidth + 'px';
    resizeState.rightPanel.style.minWidth = newRightWidth + 'px';
    resizeState.rightPanel.style.maxWidth = newRightWidth + 'px';
  }

  function onMouseUp() {
    if (!resizeState.isDragging) return;
    endResize();
  }

  function onTouchEnd() {
    if (!resizeState.isDragging) return;
    endResize();
  }

  function endResize() {
    resizeState.isDragging = false;

    if (resizeState.activeHandle) {
      resizeState.activeHandle.classList.remove('active');
    }

    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';

    removeOverlay();
    saveCurrentWidths();
  }

  // 键盘调整
  function adjustPanelWidth(leftPanel, rightPanel, container, delta) {
    var leftWidth = leftPanel.getBoundingClientRect().width + delta;
    var rightWidth = rightPanel.getBoundingClientRect().width - delta;
    var containerWidth = container.getBoundingClientRect().width;
    var maxWidth = containerWidth * (CONFIG.maxWidthPct / 100);

    leftWidth = Math.max(CONFIG.minWidth, Math.min(maxWidth, leftWidth));
    rightWidth = Math.max(CONFIG.minWidth, Math.min(maxWidth, rightWidth));

    leftPanel.style.flex = '0 0 ' + leftWidth + 'px';
    leftPanel.style.minWidth = leftWidth + 'px';
    leftPanel.style.maxWidth = leftWidth + 'px';

    rightPanel.style.flex = '0 0 ' + rightWidth + 'px';
    rightPanel.style.minWidth = rightWidth + 'px';
    rightPanel.style.maxWidth = rightWidth + 'px';

    saveCurrentWidths();
  }

  // 双击重置
  function resetPanelWidths(leftPanel, rightPanel, container) {
    leftPanel.style.flex = '';
    leftPanel.style.minWidth = '';
    leftPanel.style.maxWidth = '';
    rightPanel.style.flex = '';
    rightPanel.style.minWidth = '';
    rightPanel.style.maxWidth = '';

    try { localStorage.removeItem(CONFIG.storageKey); } catch(e) {}

    // 显示提示
    if (typeof showToast === 'function') {
      showToast('面板宽度已重置');
    }
  }

  // 遮罩层（防止 iframe 捕获鼠标事件）
  function addOverlay() {
    var overlay = document.getElementById('resizeOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'resizeOverlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;cursor:col-resize;';
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'block';
  }

  function removeOverlay() {
    var overlay = document.getElementById('resizeOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  // 持久化
  function saveCurrentWidths() {
    try {
      var data = {};
      var panels = document.querySelectorAll('.resource-panel, .preview-panel, .chat-main-panel');
      panels.forEach(function(panel) {
        var key = '';
        if (panel.classList.contains('resource-panel')) key = 'resource';
        else if (panel.classList.contains('preview-panel')) key = 'preview';
        else if (panel.classList.contains('chat-main-panel')) key = 'chat';
        if (key && panel.style.flex) {
          data[key] = panel.getBoundingClientRect().width;
        }
      });
      if (Object.keys(data).length > 0) {
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
      }
    } catch(e) {}
  }

  function restoreSavedWidths() {
    try {
      var saved = localStorage.getItem(CONFIG.storageKey);
      if (!saved) return;
      var data = JSON.parse(saved);

      // 延迟执行以确保面板已渲染
      setTimeout(function() {
        var panels = document.querySelectorAll('.resource-panel, .preview-panel, .chat-main-panel');
        panels.forEach(function(panel) {
          var key = '';
          if (panel.classList.contains('resource-panel')) key = 'resource';
          else if (panel.classList.contains('preview-panel')) key = 'preview';
          else if (panel.classList.contains('chat-main-panel')) key = 'chat';
          if (key && data[key]) {
            var w = data[key];
            panel.style.flex = '0 0 ' + w + 'px';
            panel.style.minWidth = w + 'px';
            panel.style.maxWidth = w + 'px';
          }
        });
      }, 500);
    } catch(e) {}
  }

  init();

})();
