// ===== DARK THEME TOGGLE v1.0 =====

(function() {
  'use strict';

  var STORAGE_KEY = 'medagent-theme';

  // 获取保存的主题，默认跟随系统
  function getSavedTheme() {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    // 跟随系统
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  // 应用主题
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
    // 更新 meta theme-color
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = theme === 'dark' ? '#1A1A1A' : '#FAF8F5';
  }

  // 切换主题
  window.toggleDarkTheme = function() {
    var current = document.documentElement.getAttribute('data-theme') || 'light';
    var next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  };

  // 注入切换按钮到聊天工具栏
  function injectToggleButton() {
    var topbarActions = document.querySelector('.chat-topbar-actions');
    if (!topbarActions) return;
    if (document.getElementById('themeToggleBtn')) return;

    var btn = document.createElement('button');
    btn.id = 'themeToggleBtn';
    btn.className = 'chat-topbar-btn theme-toggle-btn';
    btn.title = '切换主题';
    btn.onclick = function() { toggleDarkTheme(); };
    btn.innerHTML =
      '<svg class="icon-moon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>' +
      '<svg class="icon-sun" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

    // 插入到工具栏第一个按钮前面
    var firstBtn = topbarActions.querySelector('.chat-topbar-btn');
    if (firstBtn) {
      topbarActions.insertBefore(btn, firstBtn);
    } else {
      topbarActions.appendChild(btn);
    }
  }

  // 也在侧边栏底部添加一个切换入口
  function injectSidebarToggle() {
    var userInfo = document.querySelector('.sidebar-user');
    if (!userInfo) return;
    if (document.getElementById('sidebarThemeToggle')) return;

    var btn = document.createElement('button');
    btn.id = 'sidebarThemeToggle';
    btn.className = 'sidebar-new-btn';
    btn.style.cssText = 'margin: 0 0.75rem 0.5rem; padding: 0.35rem; font-size: 0.75rem;';
    btn.onclick = function() { toggleDarkTheme(); };

    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.innerHTML = isDark
      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> 浅色模式'
      : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg> 深色模式';

    userInfo.parentNode.insertBefore(btn, userInfo);
  }

  // 监听系统主题变化
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
      // 只在用户没有手动设置时跟随系统
      var saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  // 主题变化时更新侧边栏按钮文字
  var themeObserver = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      if (m.attributeName === 'data-theme') {
        var btn = document.getElementById('sidebarThemeToggle');
        if (btn) {
          var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
          btn.innerHTML = isDark
            ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> 浅色模式'
            : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg> 深色模式';
        }
      }
    });
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // 初始化
  function initTheme() {
    applyTheme(getSavedTheme());
    injectToggleButton();
    injectSidebarToggle();
  }

  if (document.readyState === 'loading') {
    // 立即应用主题防止闪烁
    applyTheme(getSavedTheme());
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(function() {
        injectToggleButton();
        injectSidebarToggle();
      }, 500);
    });
  } else {
    initTheme();
  }

  // 监听 DOM 变化，确保按钮在视图切换后也能注入
  var btnObserver = new MutationObserver(function() {
    injectToggleButton();
    injectSidebarToggle();
  });
  btnObserver.observe(document.body, { childList: true, subtree: true });
  setTimeout(function() { btnObserver.disconnect(); }, 8000);
})();
