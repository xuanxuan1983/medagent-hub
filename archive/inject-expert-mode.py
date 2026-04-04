#!/usr/bin/env python3
"""
MedAgent Hub — 专家模式注入脚本 v1.0
功能：
  1. 在 api-server.js 中注入 /api/chat/expert-stream 路由
  2. 在 api-server.js 中注入 /api/expert/status 状态查询路由
  3. 在 chat.html 中注入专家模式 UI（切换开关 + 升级提示）
  4. 在 chat.html 中注入 SSE 事件处理（expert_start 事件）

设计原则：纯追加/注入，不修改任何现有逻辑
"""

import re
import sys
import shutil
from datetime import datetime

API_SERVER = 'api-server.js'
CHAT_HTML = 'chat.html'

def backup(filepath):
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    bak = f'{filepath}.bak_{ts}'
    shutil.copy2(filepath, bak)
    print(f'  [备份] {bak}')

# ============================================================
# 1. 注入后端路由到 api-server.js
# ============================================================
EXPERT_ROUTE_CODE = r"""
  // ===== 专家模式路由（Expert Mode）=====
  // 新增于 v2.5，纯增量，不影响现有 /api/chat/message-stream
  if (url.pathname === '/api/chat/expert-stream' && req.method === 'POST') {
    try {
      if (!isAuthenticated(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      const { sessionId, message } = await parseRequestBody(req);
      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid session ID' }));
        return;
      }
      const session = sessions.get(sessionId);
      const userCode = session.userCode || getUserCode(req);
      const planStatus = getUserPlanStatus(userCode);

      // 专家模式仅限 Pro+ 用户
      if (!planStatus.isProPlus) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'expert_mode_locked',
          message: '专家模式为 Pro+ 专属功能，请升级后使用',
          planStatus
        }));
        return;
      }

      // SSE 响应头
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });

      // 加载编排器（懒加载，不影响启动速度）
      const expertOrchestrator = require('./expert-orchestrator');
      const sfKey = process.env.SILICONFLOW_API_KEY || '';
      let medDB = null;
      try { medDB = require('./medaesthetics-db'); } catch(e) {}

      // 将消息追加到会话历史
      session.messages.push({ role: 'user', content: message });

      const result = await expertOrchestrator.runExpertPipeline({
        message,
        session,
        res,
        vectorMemory,
        db,
        nmpaSearch,
        detectNmpaProduct,
        bochaSearch,
        notionClient,
        searchNotion,
        knowledgeBase: kb,
        medaestheticsDb: medDB,
        taskPlanner,
        getUserPlanStatus,
        siliconflowApiKey: sfKey,
        siliconflowModel: process.env.SILICONFLOW_MODEL || 'deepseek-ai/DeepSeek-V3'
      });

      // 保存助手回复到会话历史
      if (result && result.fullContent) {
        session.messages.push({ role: 'assistant', content: result.fullContent });
        try {
          stmtInsertMessage.run(sessionId, 'user', message);
          stmtInsertMessage.run(sessionId, 'assistant', result.fullContent);
          stmtUpdateSessionTime.run(sessionId);
        } catch(dbErr) { console.error('[ExpertMode] DB error:', dbErr.message); }

        // 异步保存向量记忆
        if (sfKey && result.fullContent.length > 50) {
          setImmediate(async () => {
            try {
              await vectorMemory.saveMemory(db, userCode, session.agentId, message, result.fullContent, sfKey);
            } catch(e) { console.warn('[ExpertMode] 向量记忆保存跳过:', e.message); }
          });
        }
      }
    } catch (error) {
      console.error('[ExpertMode] 路由错误:', error);
      try {
        res.write(`data: ${JSON.stringify({ type: 'delta', content: '\n\n> 专家模式遇到错误，请重试。' })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
      } catch(e) {}
    }
    return;
  }

  // 专家模式状态查询（供前端判断是否可用）
  if (url.pathname === '/api/expert/status' && req.method === 'GET') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const userCode = getUserCode(req);
    const planStatus = getUserPlanStatus(userCode);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      available: planStatus.isProPlus,
      plan: planStatus.plan,
      model: process.env.EXPERT_MODEL || 'Pro/deepseek-ai/DeepSeek-R1',
      version: '2.5'
    }));
    return;
  }
"""

# ============================================================
# 2. 注入前端 UI 到 chat.html
# ============================================================

# 2a. 专家模式切换开关 CSS（注入到 </style> 之前的最后一个 </style>）
EXPERT_CSS = """
    /* ===== 专家模式开关 ===== */
    .expert-mode-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0.75rem;
      background: linear-gradient(90deg, #f0f4ff 0%, #f8f0ff 100%);
      border-top: 1px solid #e2e8f0;
      border-bottom: 1px solid #e2e8f0;
      font-size: 0.78rem;
      color: #64748b;
      transition: background 0.2s;
    }
    .expert-mode-bar.active {
      background: linear-gradient(90deg, #ede9fe 0%, #fce7f3 100%);
      color: #6d28d9;
    }
    .expert-toggle {
      position: relative;
      width: 36px;
      height: 20px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .expert-toggle input { opacity: 0; width: 0; height: 0; }
    .expert-slider {
      position: absolute;
      inset: 0;
      background: #cbd5e1;
      border-radius: 20px;
      transition: 0.3s;
    }
    .expert-slider:before {
      content: '';
      position: absolute;
      width: 14px;
      height: 14px;
      left: 3px;
      bottom: 3px;
      background: white;
      border-radius: 50%;
      transition: 0.3s;
    }
    .expert-toggle input:checked + .expert-slider { background: #7c3aed; }
    .expert-toggle input:checked + .expert-slider:before { transform: translateX(16px); }
    .expert-badge {
      background: #7c3aed;
      color: white;
      font-size: 0.65rem;
      padding: 1px 5px;
      border-radius: 4px;
      font-weight: 600;
    }
    .expert-locked-tip {
      font-size: 0.72rem;
      color: #94a3b8;
    }
    /* 升级提示横幅 */
    .upgrade-banner {
      display: none;
      align-items: center;
      justify-content: space-between;
      padding: 0.5rem 1rem;
      background: linear-gradient(90deg, #6d28d9, #db2777);
      color: white;
      font-size: 0.8rem;
      gap: 0.5rem;
    }
    .upgrade-banner.show { display: flex; }
    .upgrade-banner a {
      color: white;
      font-weight: 600;
      text-decoration: underline;
      white-space: nowrap;
    }
    .upgrade-banner-close {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      font-size: 1rem;
      padding: 0 0.25rem;
      flex-shrink: 0;
    }
"""

# 2b. 专家模式 HTML（注入到 id="chatInput" 的 div 之前）
EXPERT_BAR_HTML = """
      <!-- 专家模式切换栏（v2.5 新增） -->
      <div class="upgrade-banner" id="expertUpgradeBanner">
        <span>MedAgent Hub 已升级至 v2.5 — 新增「专家模式」，支持深度推理 + 多源信息融合分析</span>
        <a href="/pricing.html" target="_blank">升级 Pro+</a>
        <button class="upgrade-banner-close" onclick="document.getElementById('expertUpgradeBanner').classList.remove('show');localStorage.setItem('ma_v25_seen','1')">&#x2715;</button>
      </div>
      <div class="expert-mode-bar" id="expertModeBar">
        <label class="expert-toggle" title="专家模式：深度推理 + 多源信息融合">
          <input type="checkbox" id="expertModeToggle" onchange="onExpertModeToggle(this)">
          <span class="expert-slider"></span>
        </label>
        <span id="expertModeLabel">专家模式</span>
        <span class="expert-badge" id="expertBadge" style="display:none">Pro+</span>
        <span class="expert-locked-tip" id="expertLockedTip" style="display:none">— 升级 Pro+ 解锁</span>
      </div>
"""

# 2c. 专家模式 JS（注入到 </script> 之前）
EXPERT_JS = """
  // ===== 专家模式 JS（v2.5 新增）=====
  let _expertModeEnabled = false;
  let _expertModeAvailable = false;

  // 初始化：检查专家模式是否可用
  async function initExpertMode() {
    try {
      const r = await fetch('/api/expert/status', { credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json();
      _expertModeAvailable = data.available;
      const bar = document.getElementById('expertModeBar');
      const badge = document.getElementById('expertBadge');
      const lockedTip = document.getElementById('expertLockedTip');
      const toggle = document.getElementById('expertModeToggle');
      if (_expertModeAvailable) {
        badge.style.display = 'inline';
        lockedTip.style.display = 'none';
        toggle.disabled = false;
      } else {
        badge.style.display = 'none';
        lockedTip.style.display = 'inline';
        toggle.disabled = true;
      }
      // 显示升级提示横幅（仅首次）
      if (!localStorage.getItem('ma_v25_seen')) {
        document.getElementById('expertUpgradeBanner').classList.add('show');
      }
    } catch(e) { console.warn('[ExpertMode] 状态检查失败:', e.message); }
  }

  function onExpertModeToggle(checkbox) {
    if (!_expertModeAvailable) {
      checkbox.checked = false;
      window.open('/pricing.html', '_blank');
      return;
    }
    _expertModeEnabled = checkbox.checked;
    const bar = document.getElementById('expertModeBar');
    const label = document.getElementById('expertModeLabel');
    if (_expertModeEnabled) {
      bar.classList.add('active');
      label.textContent = '专家模式已开启';
    } else {
      bar.classList.remove('active');
      label.textContent = '专家模式';
    }
  }

  // 覆盖发送函数：专家模式时调用 /api/chat/expert-stream
  const _origSendMessage = typeof sendMessage === 'function' ? sendMessage : null;

  async function sendMessageWithExpertMode(message) {
    if (!_expertModeEnabled || !_expertModeAvailable) {
      if (_origSendMessage) return _origSendMessage(message);
      return;
    }
    // 专家模式：调用 expert-stream 端点
    const sessionId = window._currentSessionId;
    if (!sessionId) {
      if (_origSendMessage) return _origSendMessage(message);
      return;
    }
    // 复用现有的 UI 逻辑（显示消息气泡、typing 等）
    // 这里直接 patch fetch 调用，让 sendMessage 内部的 /api/chat/message-stream 变成 /api/chat/expert-stream
    const origFetch = window.fetch;
    window.fetch = function(url, opts) {
      if (typeof url === 'string' && url.includes('/api/chat/message-stream')) {
        url = url.replace('/api/chat/message-stream', '/api/chat/expert-stream');
      }
      return origFetch.call(this, url, opts);
    };
    try {
      if (_origSendMessage) await _origSendMessage(message);
    } finally {
      window.fetch = origFetch; // 恢复原始 fetch
    }
  }

  // 处理 expert_start SSE 事件（在现有 SSE 解析器中追加）
  document.addEventListener('DOMContentLoaded', function() {
    initExpertMode();
    // 监听 expert_start 事件，显示专家模式启动提示
    const origEvtHandler = window._sseExtraHandler;
    window._sseExtraHandler = function(evt) {
      if (evt.type === 'expert_start') {
        showToolStatusIndicator('expert', evt.message || '专家模式深度分析中...');
      }
      if (origEvtHandler) origEvtHandler(evt);
    };
  });
"""

def inject_api_server():
    print('[1/3] 注入后端专家模式路由到 api-server.js...')
    with open(API_SERVER, 'r', encoding='utf-8') as f:
        content = f.read()

    # 检查是否已注入
    if '/api/chat/expert-stream' in content:
        print('  [跳过] 路由已存在，无需重复注入')
        return

    # 注入点：在 "// Send message (non-streaming fallback)" 之前
    target = '  // Send message (non-streaming fallback)'
    if target not in content:
        # 备用注入点：在 /api/chat/message 路由之前
        target = "  if (url.pathname === '/api/chat/message' && req.method === 'POST') {"

    if target not in content:
        print('  [错误] 未找到注入点，请手动检查 api-server.js')
        return

    new_content = content.replace(target, EXPERT_ROUTE_CODE + '\n  ' + target.strip(), 1)
    with open(API_SERVER, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('  [完成] 已注入 /api/chat/expert-stream 和 /api/expert/status 路由')

def inject_chat_html():
    print('[2/3] 注入前端专家模式 UI 到 chat.html...')
    with open(CHAT_HTML, 'r', encoding='utf-8') as f:
        content = f.read()

    # 检查是否已注入
    if 'expert-mode-bar' in content:
        print('  [跳过] UI 已存在，无需重复注入')
        return

    # 注入 CSS：在最后一个 </style> 之前
    css_target = '  </style>'
    if css_target in content:
        # 找最后一个出现位置
        last_idx = content.rfind(css_target)
        content = content[:last_idx] + EXPERT_CSS + '\n' + content[last_idx:]
        print('  [完成] CSS 已注入')
    else:
        print('  [警告] 未找到 CSS 注入点')

    # 注入 HTML 横幅：在 id="chatInput" 的 div 之前
    # 找到输入区域的父容器
    html_targets = [
        'id="chatInput"',
        'id="inputArea"',
        'class="chat-input-area"',
    ]
    injected_html = False
    for ht in html_targets:
        if ht in content:
            # 找到该元素所在行的开始
            idx = content.find(ht)
            # 向前找到 < 符号（标签开始）
            tag_start = content.rfind('<', 0, idx)
            content = content[:tag_start] + EXPERT_BAR_HTML + '\n      ' + content[tag_start:]
            print(f'  [完成] HTML 横幅已注入（锚点: {ht}）')
            injected_html = True
            break
    if not injected_html:
        print('  [警告] 未找到 HTML 注入点，跳过')

    # 注入 JS：在最后一个 </script> 之前
    js_target = '</script>'
    if js_target in content:
        last_idx = content.rfind(js_target)
        content = content[:last_idx] + EXPERT_JS + '\n' + content[last_idx:]
        print('  [完成] JS 已注入')
    else:
        print('  [警告] 未找到 JS 注入点')

    with open(CHAT_HTML, 'w', encoding='utf-8') as f:
        f.write(content)

def main():
    print('=' * 50)
    print('MedAgent Hub 专家模式注入脚本 v1.0')
    print('=' * 50)

    # 备份原始文件
    print('[0/3] 备份原始文件...')
    backup(API_SERVER)
    backup(CHAT_HTML)

    inject_api_server()
    inject_chat_html()

    print('[3/3] 验证注入结果...')
    with open(API_SERVER, 'r') as f:
        api_ok = '/api/chat/expert-stream' in f.read()
    with open(CHAT_HTML, 'r') as f:
        html_ok = 'expert-mode-bar' in f.read()

    print(f'  api-server.js: {"OK" if api_ok else "FAIL"}')
    print(f'  chat.html:     {"OK" if html_ok else "FAIL"}')

    if api_ok and html_ok:
        print()
        print('=' * 50)
        print('[完成] 注入成功！请执行：pm2 reload api-server')
        print('=' * 50)
    else:
        print()
        print('[错误] 部分注入失败，请检查上方日志')
        sys.exit(1)

if __name__ == '__main__':
    main()
