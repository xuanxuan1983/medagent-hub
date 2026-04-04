#!/usr/bin/env python3
"""
MedAgent Hub — 专家模式注入脚本 v3.0（完全修复版）

修复内容：
  1. 路由代码改用现有的 SiliconFlowProvider 类（不引用不存在的变量）
  2. SSE 流式输出与现有 parseSSEStream 模式完全一致
  3. 专家模式颜色改为黑灰色系（符合整体 UI 调性）
  4. 注入位置：desktop-input-wrap 之前（正确的可见区域）
"""

import re
import sys
import shutil
import glob
from datetime import datetime

API_SERVER = 'api-server.js'
CHAT_HTML  = 'chat.html'

def backup(filepath):
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    bak = f'{filepath}.bak_{ts}'
    shutil.copy2(filepath, bak)
    print(f'  [备份] {bak}')

def rollback_latest(filepath):
    pattern = f'{filepath}.bak_*'
    backups = sorted(glob.glob(pattern))
    if backups:
        latest = backups[-1]
        shutil.copy2(latest, filepath)
        print(f'  [回滚] 已从 {latest} 恢复')

# ============================================================
# 1. 后端路由代码（完全基于现有 SiliconFlowProvider 架构）
# ============================================================
EXPERT_ROUTE_CODE = r"""
  // ===== 专家模式路由 v3.0 =====
  if (url.pathname === '/api/chat/expert-stream' && req.method === 'POST') {
    try {
      if (!isAuthenticated(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      const body = await parseRequestBody(req);
      const { sessionId, message } = body;

      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid session ID' }));
        return;
      }

      const session = sessions.get(sessionId);
      const userCode = getUserCode(req);
      const planStatus = getUserPlanStatus(userCode);

      // 仅限 Pro+ 和 admin
      if (!planStatus.isProPlus) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'expert_mode_locked',
          message: '专家模式为 Pro+ 专属功能，请升级后使用'
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

      // 推送思考步骤
      function sendStep(text) {
        res.write(`data: ${JSON.stringify({ type: 'delta', content: text })}\n\n`);
      }

      // 1. 意图分类
      const intentResult = classifyIntentFast(message);
      sendStep(`\n> **专家模式** | 意图：${intentResult.intent}\n\n`);

      // 2. NMPA 合规查询（如果检测到产品关键词）
      let nmpaContext = '';
      const detectedProducts = detectNmpaProduct(message);
      if (detectedProducts) {
        sendStep(`> 正在查询药监局数据库...\n\n`);
        try {
          const nmpaData = await nmpaSearch(message, detectedProducts);
          if (nmpaData.success && nmpaData.results.length > 0) {
            nmpaContext = '\n\n【药监局合规数据】\n' + nmpaData.results.map(r =>
              `- ${r.title}: ${r.snippet}`
            ).join('\n');
          }
        } catch (e) { /* 静默失败 */ }
      }

      // 3. 用户记忆注入
      let memContext = '';
      try {
        const userMemModule = require('./user-memory');
        const profiles = loadProfiles();
        const memUpdated = userMemModule.updateUserMemory(profiles, userCode, message);
        if (memUpdated) saveProfiles(profiles);
        memContext = userMemModule.getUserMemoryContext(profiles, userCode, session.messages) || '';
      } catch (e) { /* 静默失败 */ }

      // 4. 构建增强系统提示词（专家模式：更严谨、更结构化）
      const expertSystemPrompt = (session.systemPrompt || '') +
        (memContext ? '\n\n' + memContext : '') +
        nmpaContext +
        '\n\n【专家模式指令】请以专业医美顾问的身份，给出深度、结构化的分析。' +
        '回答需包含：核心判断、关键数据/依据、具体建议（分步骤）、注意事项。' +
        '使用 Markdown 格式，层次清晰。';

      // 5. 使用 DeepSeek-R1 深度思考模型（专家模式专用）
      const expertProvider = new SiliconFlowProvider();
      expertProvider.model = process.env.EXPERT_MODEL || 'Pro/deepseek-ai/DeepSeek-R1';
      expertProvider.apiKey = process.env.SILICONFLOW_API_KEY || '';

      sendStep(`> 正在深度分析（${expertProvider.model}）...\n\n`);

      // 6. 流式输出
      async function* parseSSEStreamLocal(stream) {
        let buf = '';
        for await (const chunk of stream) {
          buf += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const s = line.slice(6).trim();
            if (s === '[DONE]') continue;
            try { yield JSON.parse(s); } catch (e) { /* skip */ }
          }
        }
      }

      let fullContent = '';
      let thinkingContent = '';
      let inThinking = false;
      let thinkingSent = false;

      const stream = await expertProvider.chatStream(expertSystemPrompt, session.messages.concat([
        { role: 'user', content: message }
      ]));

      for await (const parsed of parseSSEStreamLocal(stream)) {
        const choice = parsed.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta || {};

        // 处理 reasoning_content（DeepSeek-R1 思考链）
        if (delta.reasoning_content) {
          thinkingContent += delta.reasoning_content;
          if (!thinkingSent) {
            res.write(`data: ${JSON.stringify({ type: 'thinking_start' })}\n\n`);
            thinkingSent = true;
          }
          res.write(`data: ${JSON.stringify({ type: 'thinking', content: delta.reasoning_content })}\n\n`);
        }

        if (delta.content) {
          if (thinkingSent && !inThinking) {
            res.write(`data: ${JSON.stringify({ type: 'thinking_end' })}\n\n`);
            inThinking = true;
          }
          fullContent += delta.content;
          res.write(`data: ${JSON.stringify({ type: 'delta', content: delta.content })}\n\n`);
        }

        if (choice.finish_reason === 'stop') break;
      }

      // 7. 保存消息到会话
      session.messages.push({ role: 'user', content: message });
      session.messages.push({ role: 'assistant', content: fullContent });

      try {
        stmtInsertMessage.run(sessionId, 'user', message);
        stmtInsertMessage.run(sessionId, 'assistant', fullContent);
        stmtUpdateSessionTime.run(sessionId);
      } catch (dbErr) {
        console.error('[ExpertMode] DB error:', dbErr.message);
      }

      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();

    } catch (error) {
      console.error('[ExpertMode] 路由错误:', error);
      try {
        res.write(`data: ${JSON.stringify({ type: 'delta', content: '\n\n> 专家模式遇到错误，请重试。' })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
      } catch (e) {}
    }
    return;
  }

  // 专家模式状态查询
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
      version: '3.0'
    }));
    return;
  }
"""

# ============================================================
# 2. 前端 CSS（黑灰色系，符合整体调性）
# ============================================================
EXPERT_CSS = """
    /* ===== 专家模式开关 v3.0 ===== */
    .expert-mode-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.3rem 0.75rem;
      background: #f8f8f8;
      border: 1px solid #e0e0e0;
      border-radius: 8px 8px 0 0;
      border-bottom: none;
      font-size: 0.75rem;
      color: #666;
      transition: background 0.2s, color 0.2s;
      margin-bottom: -1px;
    }
    .expert-mode-bar.active {
      background: #1a1a1a;
      color: #f0f0f0;
      border-color: #333;
    }
    .expert-toggle {
      position: relative;
      width: 32px;
      height: 18px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .expert-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
    .expert-slider {
      position: absolute;
      inset: 0;
      background: #ccc;
      border-radius: 18px;
      transition: 0.25s;
    }
    .expert-slider:before {
      content: '';
      position: absolute;
      width: 12px;
      height: 12px;
      left: 3px;
      bottom: 3px;
      background: white;
      border-radius: 50%;
      transition: 0.25s;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    .expert-toggle input:checked + .expert-slider { background: #1a1a1a; }
    .expert-toggle input:checked + .expert-slider:before { transform: translateX(14px); }
    .expert-toggle input:disabled + .expert-slider { opacity: 0.4; cursor: not-allowed; }
    .expert-badge {
      background: #1a1a1a;
      color: white;
      font-size: 0.6rem;
      padding: 1px 5px;
      border-radius: 3px;
      font-weight: 700;
      letter-spacing: 0.03em;
    }
    .expert-mode-bar.active .expert-badge {
      background: white;
      color: #1a1a1a;
    }
    .expert-locked-tip {
      font-size: 0.7rem;
      color: #999;
    }
    .expert-locked-tip a {
      color: #555;
      text-decoration: underline;
    }
    .expert-locked-tip a:hover { color: #111; }
    /* 升级提示横幅（黑色系） */
    .upgrade-banner {
      display: none;
      align-items: center;
      justify-content: space-between;
      padding: 0.45rem 1rem;
      background: #1a1a1a;
      color: #f0f0f0;
      font-size: 0.78rem;
      gap: 0.5rem;
      border-radius: 8px;
      margin-bottom: 0.5rem;
    }
    .upgrade-banner.show { display: flex; }
    .upgrade-banner a {
      color: white;
      font-weight: 600;
      text-decoration: underline;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .upgrade-banner-close {
      background: none;
      border: none;
      color: rgba(255,255,255,0.6);
      cursor: pointer;
      font-size: 0.9rem;
      padding: 0 0.2rem;
      flex-shrink: 0;
      line-height: 1;
    }
    .upgrade-banner-close:hover { color: white; }
"""

# ============================================================
# 3. 前端 HTML（注入到 desktop-input-wrap 之前）
# ============================================================
EXPERT_BAR_HTML = """      <!-- 专家模式升级横幅 v3.0 -->
      <div class="upgrade-banner" id="expertUpgradeBanner">
        <span>MedAgent v3.0 新增「专家模式」— DeepSeek-R1 深度推理 + 合规数据融合</span>
        <a href="/pricing.html" target="_blank">升级 Pro+</a>
        <button class="upgrade-banner-close" onclick="document.getElementById('expertUpgradeBanner').classList.remove('show');localStorage.setItem('ma_v30_seen','1')">&#x2715;</button>
      </div>
      <!-- 专家模式切换栏 v3.0 -->
      <div class="expert-mode-bar" id="expertModeBar">
        <label class="expert-toggle" title="专家模式：DeepSeek-R1 深度推理 + NMPA 合规校验">
          <input type="checkbox" id="expertModeToggle" onchange="onExpertModeToggle(this)">
          <span class="expert-slider"></span>
        </label>
        <span id="expertModeLabel">专家模式</span>
        <span class="expert-badge" id="expertBadge" style="display:none">Pro+</span>
        <span class="expert-locked-tip" id="expertLockedTip" style="display:none">— <a href="/pricing.html" target="_blank">升级 Pro+ 解锁</a></span>
      </div>
"""

# ============================================================
# 4. 前端 JS
# ============================================================
EXPERT_JS = """
  // ===== 专家模式 JS v3.0 =====
  let _expertModeEnabled = false;
  let _expertModeAvailable = false;

  async function initExpertMode() {
    try {
      const r = await fetch('/api/expert/status', { credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json();
      _expertModeAvailable = data.available;
      const badge = document.getElementById('expertBadge');
      const lockedTip = document.getElementById('expertLockedTip');
      const toggle = document.getElementById('expertModeToggle');
      if (!badge || !lockedTip || !toggle) return;
      if (_expertModeAvailable) {
        badge.style.display = 'inline';
        lockedTip.style.display = 'none';
        toggle.disabled = false;
      } else {
        badge.style.display = 'none';
        lockedTip.style.display = 'inline';
        toggle.disabled = true;
      }
      if (!localStorage.getItem('ma_v30_seen')) {
        const banner = document.getElementById('expertUpgradeBanner');
        if (banner) banner.classList.add('show');
      }
    } catch(e) {}
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
      bar && bar.classList.add('active');
      if (label) label.textContent = '专家模式已开启';
    } else {
      bar && bar.classList.remove('active');
      if (label) label.textContent = '专家模式';
    }
  }

  // Patch desktopSend：专家模式时调用 expert-stream 端点
  document.addEventListener('DOMContentLoaded', function() {
    initExpertMode();

    const origDesktopSend = window.desktopSend;
    window.desktopSend = async function() {
      if (!_expertModeEnabled || !_expertModeAvailable) {
        return origDesktopSend && origDesktopSend();
      }
      const origFetch = window.fetch;
      window.fetch = function(url, opts) {
        if (typeof url === 'string' && url.includes('/api/chat/message-stream')) {
          url = url.replace('/api/chat/message-stream', '/api/chat/expert-stream');
        }
        return origFetch.call(this, url, opts);
      };
      try {
        await (origDesktopSend && origDesktopSend());
      } finally {
        window.fetch = origFetch;
      }
    };
  });
"""

def inject_api_server():
    print('[1/3] 注入后端专家模式路由...')
    with open(API_SERVER, 'r', encoding='utf-8') as f:
        content = f.read()

    if '/api/chat/expert-stream' in content:
        print('  [跳过] 路由已存在（已在回滚步骤处理）')
        return

    # 注入点：在 message-stream 路由之前（找 parseRequestBody 第一次出现的路由）
    # 使用 "Send message (non-streaming fallback)" 或 message-stream 的 if 判断
    target = "  if (url.pathname === '/api/chat/message-stream' && req.method === 'POST') {"
    if target not in content:
        # 备用：找任何 POST 路由
        target = "  if (url.pathname === '/api/chat/message' && req.method === 'POST') {"

    if target not in content:
        print('  [错误] 未找到注入点')
        return

    new_content = content.replace(target, EXPERT_ROUTE_CODE + '\n  ' + target.lstrip(), 1)
    with open(API_SERVER, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('  [完成] /api/chat/expert-stream 和 /api/expert/status 已注入')

def inject_chat_html():
    print('[2/3] 注入前端专家模式 UI...')
    with open(CHAT_HTML, 'r', encoding='utf-8') as f:
        content = f.read()

    if 'expertModeBar' in content:
        print('  [跳过] UI 已存在（已在回滚步骤处理）')
        return

    # 注入 CSS
    last_style_idx = content.rfind('  </style>')
    if last_style_idx != -1:
        content = content[:last_style_idx] + EXPERT_CSS + '\n' + content[last_style_idx:]
        print('  [完成] CSS 已注入')

    # 注入 HTML：desktop-input-wrap 之前
    target_html = '      <div class="desktop-input-wrap">'
    if target_html in content:
        content = content.replace(target_html, EXPERT_BAR_HTML + target_html, 1)
        print('  [完成] HTML 已注入到 desktop-input-wrap 之前')
    else:
        print('  [错误] 未找到 desktop-input-wrap')

    # 注入 JS
    last_script_idx = content.rfind('</script>')
    if last_script_idx != -1:
        content = content[:last_script_idx] + EXPERT_JS + '\n' + content[last_script_idx:]
        print('  [完成] JS 已注入')

    with open(CHAT_HTML, 'w', encoding='utf-8') as f:
        f.write(content)

def main():
    print('=' * 55)
    print('MedAgent Hub 专家模式注入脚本 v3.0（完全修复版）')
    print('=' * 55)

    print('[0/3] 回滚上次注入并备份...')
    rollback_latest(API_SERVER)
    rollback_latest(CHAT_HTML)
    backup(API_SERVER)
    backup(CHAT_HTML)

    inject_api_server()
    inject_chat_html()

    print('[3/3] 验证注入结果...')
    with open(API_SERVER, 'r') as f:
        api_ok = '/api/chat/expert-stream' in f.read()
    with open(CHAT_HTML, 'r') as f:
        html_ok = 'expertModeBar' in f.read()

    print(f'  api-server.js: {"OK" if api_ok else "FAIL"}')
    print(f'  chat.html UI:  {"OK" if html_ok else "FAIL"}')

    if api_ok and html_ok:
        print()
        print('=' * 55)
        print('[完成] 注入成功！请执行：pm2 reload api-server')
        print('=' * 55)
    else:
        print()
        print('[错误] 部分注入失败，请检查上方日志')
        sys.exit(1)

if __name__ == '__main__':
    main()
