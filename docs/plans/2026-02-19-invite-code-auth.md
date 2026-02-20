# Invite Code Auth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add invite-code gate to medagent-hub so only paying users can access the agents.

**Architecture:** A single `auth.js` middleware checks a cookie against a hardcoded list of valid invite codes. The login page sets the cookie on success. All HTML pages redirect to login if cookie is missing. No database needed.

**Tech Stack:** Node.js (existing api-server.js), vanilla JS, browser cookies

---

### Task 1: Add invite code validation to api-server.js

**Files:**
- Modify: `api-server.js`

**Step 1: Add invite codes config and cookie helper near top of file (after PORT declaration)**

```js
const INVITE_CODES = (process.env.INVITE_CODES || 'medagent2026').split(',').map(c => c.trim());
const COOKIE_NAME = 'medagent_auth';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map(c => c.trim().split('=').map(decodeURIComponent)));
}

function isAuthenticated(req) {
  const cookies = parseCookies(req);
  return INVITE_CODES.includes(cookies[COOKIE_NAME]);
}
```

**Step 2: Add POST /api/auth/login route (before the static file handler)**

```js
if (url.pathname === '/api/auth/login' && req.method === 'POST') {
  const { code } = await parseRequestBody(req);
  if (INVITE_CODES.includes(code)) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(code)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  } else {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '邀请码无效' }));
  }
  return;
}
```

**Step 3: Add auth check to /api/chat/init and /api/chat/message routes**

In both routes, add at the top of the try block:
```js
if (!isAuthenticated(req)) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
  return;
}
```

**Step 4: Add redirect logic in static file handler**

Before serving the file, add:
```js
const protectedPages = ['index.html', 'chat.html'];
const requestedFile = path.basename(filePath);
if (protectedPages.includes(requestedFile) && !isAuthenticated(req)) {
  res.writeHead(302, { Location: '/login.html' });
  res.end();
  return;
}
```

---

### Task 2: Create login.html

**Files:**
- Create: `login.html`

**Step 1: Write login.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MedAgent Hub - 登录</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', sans-serif;
      background: linear-gradient(135deg, #FFF9F5 0%, #FFE8D9 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: white;
      border-radius: 20px;
      padding: 2.5rem;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 20px 60px rgba(255,107,107,0.15);
    }
    .logo { font-size: 2rem; text-align: center; margin-bottom: 0.5rem; }
    h1 { text-align: center; font-size: 1.5rem; color: #1F2937; margin-bottom: 0.25rem; }
    .subtitle { text-align: center; color: #6B7280; font-size: 0.875rem; margin-bottom: 2rem; }
    label { display: block; font-size: 0.875rem; font-weight: 500; color: #374151; margin-bottom: 0.5rem; }
    input {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 1.5px solid #FFE8D9;
      border-radius: 10px;
      font-size: 1rem;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus { border-color: #FF6B6B; }
    button {
      width: 100%;
      padding: 0.875rem;
      background: linear-gradient(135deg, #FF6B6B, #FF922B);
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      margin-top: 1.25rem;
      transition: opacity 0.2s;
    }
    button:hover { opacity: 0.9; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .error { color: #DC2626; font-size: 0.875rem; margin-top: 0.75rem; text-align: center; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🏥</div>
    <h1>MedAgent Hub</h1>
    <p class="subtitle">医美行业AI助手团队</p>
    <label for="code">邀请码</label>
    <input type="password" id="code" placeholder="请输入邀请码" autocomplete="off">
    <button id="btn" onclick="login()">进入</button>
    <p class="error" id="err"></p>
  </div>
  <script>
    document.getElementById('code').addEventListener('keydown', e => {
      if (e.key === 'Enter') login();
    });
    async function login() {
      const code = document.getElementById('code').value.trim();
      const btn = document.getElementById('btn');
      const err = document.getElementById('err');
      if (!code) return;
      btn.disabled = true;
      btn.textContent = '验证中...';
      err.style.display = 'none';
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        const data = await res.json();
        if (res.ok) {
          window.location.href = '/index.html';
        } else {
          err.textContent = data.error || '邀请码无效';
          err.style.display = 'block';
          btn.disabled = false;
          btn.textContent = '进入';
        }
      } catch {
        err.textContent = '连接失败，请重试';
        err.style.display = 'block';
        btn.disabled = false;
        btn.textContent = '进入';
      }
    }
  </script>
</body>
</html>
```

---

### Task 3: Add INVITE_CODES to .env

**Files:**
- Modify: `.env`

**Step 1: Add invite codes**

```
INVITE_CODES=medagent2026,xuanyi2026
```

(Comma-separated. Each code = one paying user or group.)

---

### Task 4: Test end-to-end

**Step 1:** Restart server
```bash
cd /Users/xuan/medagent-hub && node --env-file=.env api-server.js
```

**Step 2:** Visit `http://localhost:3002/index.html` — should redirect to `/login.html`

**Step 3:** Enter wrong code — should show "邀请码无效"

**Step 4:** Enter `medagent2026` — should redirect to `index.html`

**Step 5:** Click any agent "立即使用" — should open chat and work normally

---
