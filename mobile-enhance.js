// ===== MOBILE ENHANCEMENT v1.0 =====
// 移动端适配：侧边栏抽屉、底部导航、面板切换

(function() {
  'use strict';

  var isMobile = function() {
    return window.innerWidth <= 640;
  };

  // --- 创建侧边栏遮罩 ---
  function createOverlay() {
    var overlay = document.getElementById('sidebarOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sidebarOverlay';
      overlay.className = 'sidebar-overlay';
      overlay.onclick = function() { closeMobileSidebar(); };
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  // --- 打开侧边栏 ---
  window.openMobileSidebar = function() {
    var sidebar = document.querySelector('.sidebar');
    var overlay = createOverlay();
    if (sidebar) {
      sidebar.classList.add('mobile-open');
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  };

  // --- 关闭侧边栏 ---
  window.closeMobileSidebar = function() {
    var sidebar = document.querySelector('.sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
  };

  // --- 创建汉堡菜单按钮 ---
  function injectMenuButton() {
    if (!isMobile()) return;
    var topbar = document.querySelector('.chat-topbar');
    if (!topbar) return;
    if (document.getElementById('mobileMenuBtn')) return;

    var btn = document.createElement('button');
    btn.id = 'mobileMenuBtn';
    btn.className = 'mobile-menu-btn';
    btn.title = '菜单';
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
    btn.onclick = function() { openMobileSidebar(); };

    // 插入到 topbar 最前面
    var firstChild = topbar.firstChild;
    topbar.insertBefore(btn, firstChild);
  }

  // --- 创建底部导航栏 ---
  function injectBottomNav() {
    if (!isMobile()) return;
    if (document.getElementById('mobileBottomNav')) return;

    var nav = document.createElement('div');
    nav.id = 'mobileBottomNav';
    nav.className = 'mobile-bottom-nav';
    nav.innerHTML =
      '<button class="mobile-nav-item active" data-target="chat" onclick="mobileNavTo(\'chat\')">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>' +
        '<span>对话</span>' +
      '</button>' +
      '<button class="mobile-nav-item" data-target="files" onclick="mobileNavTo(\'files\')">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>' +
        '<span>文件</span>' +
      '</button>' +
      '<button class="mobile-nav-item" data-target="preview" onclick="mobileNavTo(\'preview\')">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
        '<span>预览</span>' +
      '</button>' +
      '<button class="mobile-nav-item" data-target="store" onclick="mobileNavTo(\'store\')">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>' +
        '<span>商店</span>' +
      '</button>';

    document.body.appendChild(nav);
  }

  // --- 底部导航切换 ---
  window.mobileNavTo = function(target) {
    if (!isMobile()) return;

    // 更新导航高亮
    var items = document.querySelectorAll('.mobile-nav-item');
    items.forEach(function(item) {
      item.classList.toggle('active', item.dataset.target === target);
    });

    // 关闭所有面板
    var resourcePanel = document.querySelector('.resource-panel');
    var previewPanel = document.querySelector('.preview-panel');

    switch (target) {
      case 'chat':
        if (resourcePanel) resourcePanel.classList.remove('mobile-visible');
        if (previewPanel) previewPanel.classList.remove('mobile-visible');
        break;
      case 'files':
        if (resourcePanel) resourcePanel.classList.add('mobile-visible');
        if (previewPanel) previewPanel.classList.remove('mobile-visible');
        break;
      case 'preview':
        if (resourcePanel) resourcePanel.classList.remove('mobile-visible');
        if (previewPanel) previewPanel.classList.add('mobile-visible');
        break;
      case 'store':
        if (resourcePanel) resourcePanel.classList.remove('mobile-visible');
        if (previewPanel) previewPanel.classList.remove('mobile-visible');
        // 调用已有的 Agent 商店函数
        if (typeof switchView === 'function') switchView('store');
        break;
    }
  };

  // --- 资源面板关闭按钮（移动端） ---
  function injectResourcePanelClose() {
    if (!isMobile()) return;
    var panel = document.querySelector('.resource-panel');
    if (!panel) return;
    if (panel.querySelector('.resource-panel-close-mobile')) return;

    var btn = document.createElement('button');
    btn.className = 'resource-panel-close-mobile';
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    btn.onclick = function() {
      panel.classList.remove('mobile-visible');
      // 切回对话导航
      var items = document.querySelectorAll('.mobile-nav-item');
      items.forEach(function(item) {
        item.classList.toggle('active', item.dataset.target === 'chat');
      });
    };
    panel.style.position = 'relative';
    panel.appendChild(btn);
  }

  // --- 拦截侧边栏对话点击，自动关闭侧边栏 ---
  function interceptSidebarClicks() {
    var sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    sidebar.addEventListener('click', function(e) {
      if (!isMobile()) return;
      // 如果点击的是对话项或 Agent 项
      var item = e.target.closest('.sidebar-history-item, .sidebar-agent');
      if (item) {
        setTimeout(function() { closeMobileSidebar(); }, 200);
      }
    });
  }

  // --- 拦截预览面板打开，移动端自动全屏 ---
  var _origOpenPreview = window.openPreviewPanel;
  if (typeof _origOpenPreview === 'function') {
    window.openPreviewPanel = function() {
      _origOpenPreview.apply(this, arguments);
      if (isMobile()) {
        var panel = document.querySelector('.preview-panel');
        if (panel) panel.classList.add('mobile-visible');
        // 切换底部导航高亮
        var items = document.querySelectorAll('.mobile-nav-item');
        items.forEach(function(item) {
          item.classList.toggle('active', item.dataset.target === 'preview');
        });
      }
    };
  }

  // --- 拦截预览面板关闭 ---
  var _origClosePreview = window.closePreviewPanel;
  if (typeof _origClosePreview === 'function') {
    window.closePreviewPanel = function() {
      _origClosePreview.apply(this, arguments);
      if (isMobile()) {
        var panel = document.querySelector('.preview-panel');
        if (panel) panel.classList.remove('mobile-visible');
        var items = document.querySelectorAll('.mobile-nav-item');
        items.forEach(function(item) {
          item.classList.toggle('active', item.dataset.target === 'chat');
        });
      }
    };
  }

  // --- 触摸滑动手势：左滑关闭侧边栏 ---
  var touchStartX = 0;
  var touchStartY = 0;

  document.addEventListener('touchstart', function(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', function(e) {
    if (!isMobile()) return;
    var touchEndX = e.changedTouches[0].clientX;
    var touchEndY = e.changedTouches[0].clientY;
    var diffX = touchEndX - touchStartX;
    var diffY = Math.abs(touchEndY - touchStartY);

    // 水平滑动大于 80px 且垂直偏移小于 50px
    if (Math.abs(diffX) > 80 && diffY < 50) {
      var sidebar = document.querySelector('.sidebar');
      if (diffX > 0 && touchStartX < 30) {
        // 从左边缘右滑：打开侧边栏
        openMobileSidebar();
      } else if (diffX < 0 && sidebar && sidebar.classList.contains('mobile-open')) {
        // 左滑：关闭侧边栏
        closeMobileSidebar();
      }
    }
  }, { passive: true });

  // --- 窗口大小变化时清理移动端状态 ---
  window.addEventListener('resize', function() {
    if (!isMobile()) {
      closeMobileSidebar();
      var resourcePanel = document.querySelector('.resource-panel');
      var previewPanel = document.querySelector('.preview-panel');
      if (resourcePanel) resourcePanel.classList.remove('mobile-visible');
      if (previewPanel) previewPanel.classList.remove('mobile-visible');
      // 移除底部导航
      var nav = document.getElementById('mobileBottomNav');
      if (nav) nav.style.display = 'none';
    } else {
      var nav = document.getElementById('mobileBottomNav');
      if (nav) nav.style.display = '';
    }
  });

  // --- 初始化 ---
  function initMobile() {
    if (!isMobile()) return;
    createOverlay();
    injectMenuButton();
    injectBottomNav();
    injectResourcePanelClose();
    interceptSidebarClicks();
  }

  // DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(initMobile, 500);
    });
  } else {
    setTimeout(initMobile, 500);
  }

  // 也在 chat view 激活时初始化
  var observer = new MutationObserver(function() {
    if (isMobile()) {
      injectMenuButton();
      injectBottomNav();
      injectResourcePanelClose();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  // 5秒后停止观察避免性能问题
  setTimeout(function() { observer.disconnect(); }, 5000);
})();
