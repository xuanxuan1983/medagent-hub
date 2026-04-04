/**
 * Admin 路由模块
 * 从 api-server.js 提取的 ~1280 行 admin 路由代码
 * 使用依赖注入模式，统一中间件鉴权
 */

const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { execSync } = require('child_process');

/**
 * 处理 Admin 路由请求
 * @param {Object} req HTTP 请求
 * @param {Object} res HTTP 响应
 * @param {URL} url 解析后的 URL
 * @param {Object} deps 依赖注入
 * @returns {Promise<boolean>} 是否已处理该请求
 */
async function handleAdminRoutes(req, res, url, deps) {
  const {
    DATA_DIR,
    // 用户/邀请码管理
    loadCodes, saveCodes, loadUsage, loadUsageLimits, saveUsageLimits,
    loadProfiles, saveProfiles,
    loadReferralRecords, saveReferralRecords, loadReferralCodes,
    // 请求解析与鉴权
    parseRequestBody, getUserPlanStatus, getCodeMaxUses, isAuthenticated, getUserCode,
    // 常量
    MAX_USES_PER_CODE, REFERRAL_CREDIT_REFERRER,
    CHANNEL_FILE, CHANNEL_RECORDS_FILE,
    CHANNEL_COMMISSION_SUBSCRIPTION, CHANNEL_COMMISSION_LEVEL2,
    // 数据库
    db,
    stmtConvLogStats, stmtConvLogToday, stmtConvLogTodayUser,
    stmtConvLogAgentCounts, stmtConvLogUserCounts, stmtConvLogRecent,
    stmtConvLogPaged, stmtConvLogPagedCount,
    stmtGetImpQueueAll, stmtGetImpQueuePending,
    stmtCountImpQueuePending, stmtUpdateImpQueueStatus,
    // 知识库
    kb, kbUploadMiddleware,
    // Notion
    notionClient, NotionClient, NOTION_DATABASE_IDS, searchNotion,
    // Agent 名称映射
    agentNames
  } = deps;

  // ===== 渠道数据加载/保存（内部函数）=====
  function loadChannels() {
    try { if (fs.existsSync(CHANNEL_FILE)) return JSON.parse(fs.readFileSync(CHANNEL_FILE, 'utf8')); } catch {}
    return [];
  }
  function saveChannels(data) { fs.writeFileSync(CHANNEL_FILE, JSON.stringify(data, null, 2)); }
  function loadChannelRecords() {
    try { if (fs.existsSync(CHANNEL_RECORDS_FILE)) return JSON.parse(fs.readFileSync(CHANNEL_RECORDS_FILE, 'utf8')); } catch {}
    return [];
  }
  function saveChannelRecords(data) { fs.writeFileSync(CHANNEL_RECORDS_FILE, JSON.stringify(data, null, 2)); }


  // Admin: 查看内测反馈列表
  if (url.pathname === '/api/admin/beta-feedback' && req.method === 'GET') {
    try {
      const feedbackFile = path.join(DATA_DIR, 'beta-feedback.jsonl');
      if (!fs.existsSync(feedbackFile)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ feedbacks: [], total: 0 }));
        return true;
      }
      const lines = fs.readFileSync(feedbackFile, 'utf8').split('\n').filter(Boolean);
      const feedbacks = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      feedbacks.sort((a, b) => new Date(b.ts) - new Date(a.ts));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ feedbacks, total: feedbacks.length }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return true;
  }
  // Admin: get conversation feedback (thumbs up/down)
  if (url.pathname === '/api/admin/conversation-feedback' && req.method === 'GET') {
    try {
      const limit = parseInt(url.searchParams.get('limit') || '100');
      const rows = db.prepare(`SELECT ts, agent, agent_name, user_name, feedback FROM conversation_logs WHERE type='feedback' ORDER BY ts DESC LIMIT ?`).all(limit);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ feedbacks: rows, total: rows.length }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return true;
  }


  // Admin: list users with usage stats
  if (url.pathname === '/api/admin/users' && req.method === 'GET') {
    const codes = loadCodes();
    const usage = loadUsage();
    // 加载订阅和 profile 数据
    const subsPath = path.join(DATA_DIR, 'user-subscriptions.json');
    const profilesPath = path.join(DATA_DIR, 'user-profiles.json');
    const subs = fs.existsSync(subsPath) ? JSON.parse(fs.readFileSync(subsPath, 'utf8')) : {};
    const profiles = fs.existsSync(profilesPath) ? JSON.parse(fs.readFileSync(profilesPath, 'utf8')) : {};
    // 今日对话数（按用户码统计）—— 使用 SQLite 索引查询，O(1) 速度
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayMsgMap = {};
    try {
      const todayRows = stmtConvLogTodayUser.all(todayStr + 'T00:00:00.000Z');
      todayRows.forEach(r => { todayMsgMap[r.user_code] = r.cnt; });
    } catch (e) {
      // 降级：全文件扫描（兼容旧数据）
      const logPath = path.join(DATA_DIR, 'conversations.jsonl');
      if (fs.existsSync(logPath)) {
        const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
        lines.forEach(line => {
          try {
            const e = JSON.parse(line);
            if (e.ts && e.ts.startsWith(todayStr) && e.user_code) {
              todayMsgMap[e.user_code] = (todayMsgMap[e.user_code] || 0) + 1;
            }
          } catch {}
        });
      }
    }
    const users = Object.entries(codes).map(([code, name]) => {
      const maxUses = getCodeMaxUses(code);
      const used = usage[code] || 0;
      const sub = subs[code] || {};
      const profile = profiles[code] || {};
      const planId = sub.planId || 'free';
      return {
        code,
        name,
        usage: used,
        maxUses,
        remaining: Math.max(0, maxUses - used),
        plan: planId,
        expiresAt: sub.expiresAt || null,
        createdAt: profile.loginAt || profile.trial_start || null,
        todayMessages: todayMsgMap[code] || 0
      };
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ users }));
    return true;
  }

  // Admin: 升级用户为 Pro
  if (url.pathname === '/api/admin/set-pro' && req.method === 'POST') {
    try {
      const { code, months } = await parseRequestBody(req);
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '请提供用户邀请码' }));
        return true;
      }
      const profiles = loadProfiles();
      if (!profiles[code]) profiles[code] = {};
      const m = parseInt(months) || 1;
      const now = new Date();
      // 如果已是 Pro 且未过期，在现有到期时间基础上延长
      const currentExpires = profiles[code].plan_expires ? new Date(profiles[code].plan_expires) : null;
      const base = (currentExpires && currentExpires > now) ? currentExpires : now;
      const expires = new Date(base);
      expires.setMonth(expires.getMonth() + m);
      profiles[code].plan = 'pro';
      profiles[code].plan_expires = expires.toISOString();
      if (!profiles[code].trial_start) profiles[code].trial_start = now.toISOString();
      saveProfiles(profiles);
      console.log(`💳 管理员将 ${code} 升级为 Pro，到期: ${expires.toISOString()}`);

      // 自动给邀请人标记赠金（将该用户对应的邀请记录状态改为 paid）
      let referrerCredited = null;
      try {
        const records = loadReferralRecords();
        // 找到该用户作为 invitee 的记录（通过邀请码登录时记录的）
        // invitee 字段存的是手机号，也可能是邀请码本身，需要查 profiles 中的 phone
        const userPhone = profiles[code] && profiles[code].phone ? profiles[code].phone : null;
        let updated = false;
        for (let i = 0; i < records.length; i++) {
          const r = records[i];
          if (r.creditStatus === 'pending' && (
            (userPhone && r.inviteePhone === userPhone) ||
            r.inviteeCode === code
          )) {
            records[i].creditStatus = 'paid';
            records[i].paidAt = now.toISOString();
            referrerCredited = r.referrer;
            updated = true;
            console.log(`🎁 自动赠金: ${r.referrer} 邀请了 ${code}，¥${REFERRAL_CREDIT_REFERRER} 余额已到账`);
            break;
          }
        }
        if (updated) saveReferralRecords(records);
      } catch(e) {
        console.error('自动赠金处理失败:', e.message);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, code, plan: 'pro', plan_expires: expires.toISOString(), months: m, referrerCredited }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return true;
  }

  // Admin: 降级用户为免费
  if (url.pathname === '/api/admin/revoke-pro' && req.method === 'POST') {
    try {
      const { code } = await parseRequestBody(req);
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '请提供用户邀请码' }));
        return true;
      }
      const profiles = loadProfiles();
      if (!profiles[code]) profiles[code] = {};
      profiles[code].plan = 'free';
      profiles[code].plan_expires = null;
      saveProfiles(profiles);
      console.log(`🔒 管理员将 ${code} 降级为免费`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, code, plan: 'free' }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return true;
  }

  // Admin: 升级用户为全能版 Pro+
  if (url.pathname === '/api/admin/set-pro-plus' && req.method === 'POST') {
    try {
      const { code, months } = await parseRequestBody(req);
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '请提供用户邀请码' }));
        return true;
      }
      const profiles = loadProfiles();
      if (!profiles[code]) profiles[code] = {};
      const m = parseInt(months) || 1;
      const now = new Date();
      const currentExpires = profiles[code].plan_expires ? new Date(profiles[code].plan_expires) : null;
      const base = (currentExpires && currentExpires > now) ? currentExpires : now;
      const expires = new Date(base);
      expires.setMonth(expires.getMonth() + m);
      profiles[code].plan = 'pro_plus';
      profiles[code].plan_expires = expires.toISOString();
      if (!profiles[code].trial_start) profiles[code].trial_start = now.toISOString();
      saveProfiles(profiles);
      console.log(`💳 管理员将 ${code} 升级为 Pro+，到期: ${expires.toISOString()}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, code, plan: 'pro_plus', plan_expires: expires.toISOString(), months: m }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return true;
  }

  // Admin: 生成终身版邀请码（Level 2 赠品）
  if (url.pathname === '/api/admin/generate-lifetime-code' && req.method === 'POST') {
    try {
      const { name, note } = await parseRequestBody(req);
      if (!name || !name.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '请填写客户姓名' }));
        return true;
      }
      // 生成邀请码
      const code = 'lt' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const codes = loadCodes();
      codes[code] = name.trim();
      saveCodes(codes);
      // 设置为单次使用
      const usageLimits = loadUsageLimits();
      usageLimits[code] = 1;
      saveUsageLimits(usageLimits);
      // 预设终身版权益（注册时自动生效）
      const profiles = loadProfiles();
      profiles[code] = {
        name: name.trim(),
        plan: 'lifetime',
        plan_expires: '2099-12-31T23:59:59.000Z',
        trial_start: new Date().toISOString(),
        note: note || 'Level 2 赠品',
        created_at: new Date().toISOString()
      };
      saveProfiles(profiles);
      console.log(`🎁 生成终身版邀请码: ${code} 客户: ${name.trim()}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, code, name: name.trim(), plan: 'lifetime', note: note || 'Level 2 赠品' }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return true;
  }

  // Admin: 查询用户权限状态
  if (url.pathname === '/api/admin/user-plan' && req.method === 'GET') {
    const queryCode = url.searchParams.get('code');
    if (!queryCode) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '请提供 code 参数' }));
      return true;
    }
    const planInfo = getUserPlanStatus(queryCode);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: queryCode, ...planInfo }));
    return true;
  }

  // Credit apply: 用户申请余额抵扣
  if (url.pathname === '/api/credit-apply' && req.method === 'POST') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '请先登录' }));
      return true;
    }
    const userCode = getUserCode(req);
    try {
      const { contact, amount, note } = await parseRequestBody(req);
      if (!contact || !amount || amount < 1) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '请填写联系方式和金额' }));
        return true;
      }
      // 记录申请到文件
      const applyFile = path.join(DATA_DIR, 'credit_applies.json');
      let applies = [];
      try { applies = JSON.parse(fs.readFileSync(applyFile, 'utf8')); } catch(e) {}
      applies.push({
        code: userCode,
        contact,
        amount,
        note: note || '',
        time: new Date().toISOString(),
        status: 'pending'
      });
      fs.writeFileSync(applyFile, JSON.stringify(applies, null, 2));
      console.log(`💰 余额抵扣申请: ${userCode} 联系方式:${contact} 金额:${amount}元`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return true;
  }

  // Admin: 查看余额抵扣申请列表
  if (url.pathname === '/api/admin/credit-applies' && req.method === 'GET') {
    const applyFile = path.join(DATA_DIR, 'credit_applies.json');
    let applies = [];
    try { applies = JSON.parse(fs.readFileSync(applyFile, 'utf8')); } catch(e) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ applies }));
    return true;
  }

  // Admin: 查看日报页面邀请码申请列表
  if (url.pathname === '/api/admin/invite-requests' && req.method === 'GET') {
    const inviteFile = path.join(DATA_DIR, 'invite-requests.jsonl');
    let requests = [];
    try {
      const lines = fs.readFileSync(inviteFile, 'utf8').trim().split('\n').filter(Boolean);
      requests = lines.map(l => JSON.parse(l)).reverse(); // 最新的在前
      requests = lines.map(l => JSON.parse(l)).reverse();
    } catch(e) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ total: requests.length, requests }));
    return true;
  }

  // Admin: approve invite request (generate code and mark as done)
  if (url.pathname === '/api/admin/invite-approve' && req.method === 'POST') {
    try {
      const { id, name } = await parseRequestBody(req);
      // Generate a unique invite code
      const inviteCode = 'MA' + Math.random().toString(36).slice(2, 6).toUpperCase() + Date.now().toString(36).slice(-3).toUpperCase();
      // Register the code in the system (single-use)
      const codes = loadCodes();
      codes[inviteCode] = (name || '\u65e5\u62a5\u7533\u8bf7\u7528\u6237').trim();
      saveCodes(codes);
      const usageLimits = loadUsageLimits();
      usageLimits[inviteCode] = 1;
      saveUsageLimits(usageLimits);
      // Update the invite request record
      const inviteFile = path.join(DATA_DIR, 'invite-requests.jsonl');
      try {
        const lines = fs.readFileSync(inviteFile, 'utf8').trim().split('\n').filter(Boolean);
        const updated = lines.map(l => {
          try {
            const r = JSON.parse(l);
            if (String(r.id || r.ts) === String(id)) {
              return JSON.stringify({ ...r, status: 'done', inviteCode, approvedAt: Date.now() });
            }
            return l;
          } catch(e) { return l; }
        });
        fs.writeFileSync(inviteFile, updated.join('\n') + '\n');
      } catch(e) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, inviteCode }));
    } catch(error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return true;
  }

  // Admin: reject invite request
  if (url.pathname === '/api/admin/invite-reject' && req.method === 'POST') {
    try {
      const { id } = await parseRequestBody(req);
      const inviteFile = path.join(DATA_DIR, 'invite-requests.jsonl');
      try {
        const lines = fs.readFileSync(inviteFile, 'utf8').trim().split('\n').filter(Boolean);
        const updated = lines.map(l => {
          try {
            const r = JSON.parse(l);
            if (String(r.id || r.ts) === String(id)) {
              return JSON.stringify({ ...r, status: 'rejected', rejectedAt: Date.now() });
            }
            return l;
          } catch(e) { return l; }
        });
        fs.writeFileSync(inviteFile, updated.join('\n') + '\n');
      } catch(e) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch(error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return true;
  }

  // Admin: list invite codes (GET)
  if (url.pathname === '/api/admin/codes' && req.method === 'GET') {
    try {
      const codes = loadCodes();
      const usageLimits = loadUsageLimits();
      const usageData = loadUsage();
      const codeList = Object.entries(codes).map(([code, name]) => {
        const maxUses = usageLimits[code] || 1;
        const usage = usageData[code] || 0;
        return {
          code,
          name,
          maxUses,
          usage,
          remaining: Math.max(0, maxUses - usage),
          status: usage >= maxUses ? 'used' : 'active'
        };
      });
      // 按 code 倒序（code 中含时间戳 base36，越新越大）
      codeList.sort((a, b) => b.code.localeCompare(a.code));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ codes: codeList }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return true;
  }

  // Admin: create invite code
  if (url.pathname === '/api/admin/codes' && req.method === 'POST') {
    try {
      const { name, maxUses } = await parseRequestBody(req);
      if (!name || !name.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '请填写用户名' }));
        return true;
      }
      const code = 'ma' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const codes = loadCodes();
      codes[code] = name.trim();
      saveCodes(codes);
      
      // Set custom max uses for this code (default to 1 for single-use codes)
      const codeMaxUses = maxUses ? parseInt(maxUses) : 1;
      const usageLimits = loadUsageLimits();
      usageLimits[code] = codeMaxUses;
      saveUsageLimits(usageLimits);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code, name: name.trim(), maxUses: codeMaxUses }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return true;
  }

  // Admin: delete invite code
  if (url.pathname.startsWith('/api/admin/codes/') && req.method === 'DELETE') {
    const code = decodeURIComponent(url.pathname.replace('/api/admin/codes/', ''));
    const codes = loadCodes();
    if (!(code in codes)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '邀请码不存在' }));
      return true;
    }
    delete codes[code];
    saveCodes(codes);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  // Admin: get stats from conversations.jsonl
  if (url.pathname === '/api/admin/stats' && req.method === 'GET') {
    try {
      // 使用 SQLite 索引查询，替代全文件扫描
      const globalStats = stmtConvLogStats.get();
      const todayStr2 = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';
      const todayStats2 = stmtConvLogToday.get(todayStr2);
      const agentRows = stmtConvLogAgentCounts.all();
      const userRows = stmtConvLogUserCounts.all();
      const recentRows = stmtConvLogRecent.all();

      const agentCounts = {};
      agentRows.forEach(r => { agentCounts[r.agent] = r.cnt; });
      const userCounts = {};
      userRows.forEach(r => { userCounts[r.user_name || '未知'] = r.cnt; });
      const feedbackCounts = { up: globalStats.feedbackUp || 0, down: globalStats.feedbackDown || 0 };
      const recentConvs = recentRows.map(r => ({
        ts: r.ts, agent: r.agent, agent_name: r.agent_name,
        user_name: r.user_name, user: r.user_msg, assistant: r.assistant_msg
      }));

      const codesPath = path.join(DATA_DIR, 'invite-codes.json');
      const codes = fs.existsSync(codesPath) ? JSON.parse(fs.readFileSync(codesPath, 'utf8')) : {};
      const totalCodes = Object.keys(codes).length;
      const totalUsers = userRows.length;
      const totalMessages = globalStats.totalMessages || 0;
      const todayMessages = todayStats2.cnt || 0;
      const todayActive = todayStats2.users || 0;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ agentCounts, userCounts, feedbackCounts, totalTurns: globalStats.total || 0, recentConvs, totalUsers, totalMessages, todayMessages, todayActive, totalCodes, proUsers: 0 }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return true;
  }

  // Admin: token usage stats
  if (url.pathname === '/api/admin/token-stats' && req.method === 'GET') {
    try {
      // Total stats
      const totalStats = db.prepare(`
        SELECT 
          COUNT(*) as totalRequests,
          SUM(input_tokens) as totalInputTokens,
          SUM(output_tokens) as totalOutputTokens,
          SUM(estimated_cost) as totalCost
        FROM token_usage
      `).get();

      // Today stats
      const todayStats = db.prepare(`
        SELECT 
          COUNT(*) as totalRequests,
          SUM(input_tokens) as totalInputTokens,
          SUM(output_tokens) as totalOutputTokens,
          SUM(estimated_cost) as totalCost
        FROM token_usage WHERE created_at >= date('now')
      `).get();

      // Last 7 days stats
      const weekStats = db.prepare(`
        SELECT 
          COUNT(*) as totalRequests,
          SUM(input_tokens) as totalInputTokens,
          SUM(output_tokens) as totalOutputTokens,
          SUM(estimated_cost) as totalCost
        FROM token_usage WHERE created_at >= date('now', '-7 days')
      `).get();

      // Per-user stats (top 20)
      const userStats = db.prepare(`
        SELECT 
          user_code, user_name,
          COUNT(*) as requests,
          SUM(input_tokens) as inputTokens,
          SUM(output_tokens) as outputTokens,
          SUM(estimated_cost) as cost
        FROM token_usage
        GROUP BY user_code
        ORDER BY cost DESC
        LIMIT 20
      `).all();

      // Per-provider stats
      const providerStats = db.prepare(`
        SELECT 
          provider,
          COUNT(*) as requests,
          SUM(input_tokens) as inputTokens,
          SUM(output_tokens) as outputTokens,
          SUM(estimated_cost) as cost
        FROM token_usage
        GROUP BY provider
        ORDER BY cost DESC
      `).all();

      // Daily trend (last 14 days)
      const dailyTrend = db.prepare(`
        SELECT 
          date(created_at) as day,
          COUNT(*) as requests,
          SUM(estimated_cost) as cost
        FROM token_usage
        WHERE created_at >= date('now', '-14 days')
        GROUP BY date(created_at)
        ORDER BY day ASC
      `).all();

      // Per api_type stats (breakdown by function type)
      const apiTypeStats = db.prepare(`
        SELECT 
          COALESCE(api_type, 'chat') as api_type,
          provider,
          model,
          COUNT(*) as requests,
          SUM(input_tokens) as inputTokens,
          SUM(output_tokens) as outputTokens,
          SUM(estimated_cost) as cost
        FROM token_usage
        GROUP BY COALESCE(api_type, 'chat'), provider
        ORDER BY cost DESC
      `).all();

      // Per api_type stats today
      const apiTypeStatsToday = db.prepare(`
        SELECT 
          COALESCE(api_type, 'chat') as api_type,
          COUNT(*) as requests,
          SUM(estimated_cost) as cost
        FROM token_usage
        WHERE created_at >= date('now')
        GROUP BY COALESCE(api_type, 'chat')
        ORDER BY cost DESC
      `).all();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      // Per-agent stats (today) for dashboard chart
      const agentStatsToday = db.prepare(`
        SELECT 
          agent_id,
          SUM(input_tokens + output_tokens) as totalTokens,
          SUM(estimated_cost) as cost
        FROM token_usage
        WHERE created_at >= date('now')
        GROUP BY agent_id
        ORDER BY totalTokens DESC
        LIMIT 10
      `).all();
      const byAgent = {};
      agentStatsToday.forEach(r => { byAgent[r.agent_id] = r.totalTokens; });
      res.end(JSON.stringify({ totalStats, todayStats, weekStats, userStats, providerStats, dailyTrend, apiTypeStats, apiTypeStatsToday, byAgent }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return true;
  }

  // Admin: referral stats
  if (url.pathname === '/api/admin/referral-stats' && req.method === 'GET') {
    try {
      const records = loadReferralRecords();
      const refs = loadReferralCodes();
      const codes = loadCodes();
      // Build per-referrer summary
      const referrerMap = {};
      records.forEach(r => {
        if (!referrerMap[r.referrer]) {
          referrerMap[r.referrer] = { name: codes[r.referrer] || r.referrer, inviteCount: 0, totalCredit: 0, pendingCredit: 0, paidCredit: 0, records: [] };
        }
        referrerMap[r.referrer].inviteCount++;
        const credit = REFERRAL_CREDIT_REFERRER;
        referrerMap[r.referrer].totalCredit += credit;
        if (r.creditStatus === 'paid') referrerMap[r.referrer].paidCredit += credit;
        else referrerMap[r.referrer].pendingCredit += credit;
        referrerMap[r.referrer].records.push(r);
      });
      const summary = Object.entries(referrerMap).map(([code, data]) => ({ code, ...data }));
      summary.sort((a, b) => b.inviteCount - a.inviteCount);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        totalReferrals: records.length,
        totalPendingCredit: records.filter(r => r.creditStatus === 'pending').length * REFERRAL_CREDIT_REFERRER,
        totalPaidCredit: records.filter(r => r.creditStatus === 'paid').length * REFERRAL_CREDIT_REFERRER,
        referrers: summary,
        records
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return true;
  }

  // Admin: mark referral credit as paid
  if (url.pathname === '/api/admin/referral-pay' && req.method === 'POST') {
    try {
      const { referrer, index } = await parseRequestBody(req);
      const records = loadReferralRecords();
      // Mark specific record or all records for a referrer
      if (typeof index === 'number') {
        if (records[index]) records[index].creditStatus = 'paid';
      } else if (referrer) {
        records.forEach(r => { if (r.referrer === referrer) r.creditStatus = 'paid'; });
      }
      saveReferralRecords(records);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return true;
  }

  // ===== CHANNEL PARTNER APIS =====

  // 加载/保存渠道数据

  // Admin: 创建渠道代理
  if (url.pathname === '/api/admin/channel/create' && req.method === 'POST') {
    try {
      const { name, wechat, commissionRate } = await parseRequestBody(req);
      if (!name) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '请提供渠道名称' })); return; }
      const channels = loadChannels();
      // 生成渠道专属邀请码：ch_ + 6位随机
      const channelCode = 'ch_' + Math.random().toString(36).substr(2, 6);
      // 将渠道码注册为可用邀请码（复用现有邀请码系统）
      const codes = loadCodes();
      codes[channelCode] = name + '（渠道）';
      saveCodes(codes);
      // 设置渠道码使用次数上限（999，基本无限）
      const limits = loadUsageLimits();
      limits[channelCode] = 999;
      saveUsageLimits(limits);
      const channel = {
        id: channelCode,
        name,
        wechat: wechat || '',
        commissionRate: parseFloat(commissionRate) || CHANNEL_COMMISSION_SUBSCRIPTION,
        createdAt: new Date().toISOString(),
        totalConversions: 0,
        totalRevenue: 0,
        totalCommission: 0,
        paidCommission: 0
      };
      channels.push(channel);
      saveChannels(channels);
      console.log(`📢 新渠道代理: ${name} (${channelCode})`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, channel }));
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return true;
  }

  // Admin: 查询所有渠道及转化统计
  if (url.pathname === '/api/admin/channel/list' && req.method === 'GET') {
    try {
      const channels = loadChannels();
      const records = loadChannelRecords();
      const result = channels.map(ch => {
        const myRecords = records.filter(r => r.channelId === ch.id);
        const totalRevenue = myRecords.reduce((s, r) => s + (r.amount || 0), 0);
        const totalCommission = myRecords.reduce((s, r) => s + (r.commission || 0), 0);
        const paidCommission = myRecords.filter(r => r.status === 'paid').reduce((s, r) => s + (r.commission || 0), 0);
        const pendingCommission = totalCommission - paidCommission;
        return { ...ch, totalConversions: myRecords.length, totalRevenue, totalCommission, paidCommission, pendingCommission, records: myRecords };
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, channels: result }));
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return true;
  }

  // Admin: 记录渠道转化（开通订阅或 Level 2 成交时调用）
  if (url.pathname === '/api/admin/channel/record' && req.method === 'POST') {
    try {
      const { channelId, userCode, plan, amount, type } = await parseRequestBody(req);
      if (!channelId || !userCode) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '请提供渠道ID和用户码' })); return; }
      const channels = loadChannels();
      const channel = channels.find(c => c.id === channelId);
      if (!channel) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '渠道不存在' })); return; }
      const commissionRate = type === 'level2' ? CHANNEL_COMMISSION_LEVEL2 : (channel.commissionRate || CHANNEL_COMMISSION_SUBSCRIPTION);
      const commission = Math.round((amount || 0) * commissionRate);
      const records = loadChannelRecords();
      const record = { channelId, channelName: channel.name, userCode, plan: plan || '', amount: amount || 0, commission, commissionRate, type: type || 'subscription', status: 'pending', createdAt: new Date().toISOString() };
      records.push(record);
      saveChannelRecords(records);
      console.log(`💰 渠道转化: ${channel.name} 带来 ${userCode}，金额 ¥${amount}，佣金 ¥${commission}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, record }));
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return true;
  }

  // Admin: 标记渠道佣金已结算
  if (url.pathname === '/api/admin/channel/settle' && req.method === 'POST') {
    try {
      const { channelId, recordIndex } = await parseRequestBody(req);
      const records = loadChannelRecords();
      if (typeof recordIndex === 'number') {
        if (records[recordIndex]) { records[recordIndex].status = 'paid'; records[recordIndex].paidAt = new Date().toISOString(); }
      } else if (channelId) {
        records.forEach((r, i) => { if (r.channelId === channelId && r.status === 'pending') { records[i].status = 'paid'; records[i].paidAt = new Date().toISOString(); } });
      }
      saveChannelRecords(records);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return true;
  }

  // Admin: 自动检测用户是否通过渠道码注册（set-pro 时联动）
  // 当用户通过渠道码（ch_xxx）登录时，记录渠道关系到 user-profiles
  // 这部分在登录逻辑中已通过 invited_by_channel 字段记录

  // Admin: NMPA 药监局数据手动触发同步
  if (url.pathname === '/api/admin/nmpa-sync' && req.method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const forceAll = body.forceAll === true;
      const productIds = Array.isArray(body.productIds) ? body.productIds : null;
      // 异步执行，先返回接受响应
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, message: '同步任务已启动，请稍候查看日志' }));
      // 异步执行同步
      const nmpaSync = require('./nmpa-sync');
      nmpaSync.syncAll({ forceAll, productIds })
        .then(r => console.log('[NMPA Sync] 完成:', JSON.stringify(r.stats)))
        .catch(e => console.error('[NMPA Sync] 失败:', e.message));
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return true;
  }

  // Admin: NMPA 同步状态查看
  if (url.pathname === '/api/admin/nmpa-status' && req.method === 'GET') {
    try {
      const nmpaSync = require('./nmpa-sync');
      const summary = nmpaSync.getCacheSummary();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(summary));
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return true;
  }

  // Admin: 医美数据库查看
  if (url.pathname === '/api/admin/meddb' && req.method === 'GET') {
    try {
      const meddb = require('./medaesthetics-db');
      // PRICE_DB 结构: { injection: [{category, items:[{name,unit,price_low,price_high,price_avg}]}], ... }
      const allPrices = [];
      let priceIdx = 0;
      for (const [type, groups] of Object.entries(meddb.PRICE_DB || {})) {
        for (const group of (Array.isArray(groups) ? groups : [])) {
          for (const item of (group.items || [])) {
            allPrices.push({
              id: `price_${priceIdx++}`,
              category: group.category || type,
              name: item.name,
              minPrice: item.price_low,
              maxPrice: item.price_high,
              avgPrice: item.price_avg,
              unit: item.unit,
              tier: item.tier
            });
          }
        }
      }
      // COMPLIANCE_DB 结构: { hyaluronic_acid: [{name, brand, registrationNo, ...}], ... }
      const allCompliance = [];
      let compIdx = 0;
      for (const [type, products] of Object.entries(meddb.COMPLIANCE_DB || {})) {
        for (const product of (Array.isArray(products) ? products : [])) {
          allCompliance.push({
            id: `comp_${compIdx++}`,
            category: type,
            name: product.name,
            brand: product.brand,
            registrationNo: product.registrationNo,
            indications: product.indications || [],
            contraindications: product.contraindications || []
          });
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ prices: allPrices, compliance: allCompliance }));
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return true;
  }

  // Admin: 用户记忆查看
  if (url.pathname === '/api/admin/user-memory' && req.method === 'GET') {
    try {
      const profiles = loadProfiles();
      const codes = loadCodes();
      const memories = Object.entries(profiles)
        .filter(([code, p]) => p.memory && Object.keys(p.memory).length > 0)
        .map(([code, p]) => ({
          userCode: code,
          userName: codes[code] || code,
          memory: p.memory
        }))
        .sort((a, b) => {
          const ta = a.memory?.lastUpdated || '';
          const tb = b.memory?.lastUpdated || '';
          return tb.localeCompare(ta);
        });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ memories }));
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return true;
  }

  // ===== Admin: 待优化队列（反馈学习）=====
  if (url.pathname === '/api/admin/improvement-queue' && req.method === 'GET') {
    try {
      const status = url.searchParams ? url.searchParams.get('status') : null;
      const items = status === 'pending' ? stmtGetImpQueuePending.all() : stmtGetImpQueueAll.all();
      const pendingCount = stmtCountImpQueuePending.get().cnt;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ items, pendingCount }));
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return true;
  }

  if (url.pathname === '/api/admin/improvement-queue/resolve' && req.method === 'POST') {
    try {
      const { id, status, adminNote } = await parseRequestBody(req);
      if (!id || !['resolved', 'dismissed'].includes(status)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid params' }));
        return true;
      }
      stmtUpdateImpQueueStatus.run(status, adminNote || '', id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return true;
  }

  // Admin: download conversations.jsonl
  if (url.pathname === '/api/admin/export' && req.method === 'GET') {
    const logPath = path.join(DATA_DIR, 'conversations.jsonl');
    if (!fs.existsSync(logPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No data yet' }));
      return true;
    }
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Content-Disposition': `attachment; filename="conversations-${new Date().toISOString().slice(0,10)}.jsonl"`
    });
    fs.createReadStream(logPath).pipe(res);
    return true;
  }

  // Export Excel
  if (url.pathname === '/api/admin/export-excel' && req.method === 'GET') {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'MedAgent Hub';
      workbook.created = new Date();

      // Sheet 1: 用户列表
      const usersSheet = workbook.addWorksheet('用户列表');
      usersSheet.columns = [
        { header: '用户名', key: 'name', width: 16 },
        { header: '邀请码', key: 'code', width: 20 },
        { header: '手机号', key: 'phone', width: 16 },
        { header: '职业身份', key: 'role', width: 20 },
        { header: '已使用次数', key: 'usage', width: 12 },
        { header: '上限次数', key: 'maxUses', width: 12 },
        { header: '剩余次数', key: 'remaining', width: 12 },
        { header: '首次登录时间', key: 'loginAt', width: 22 },
      ];
      usersSheet.getRow(1).font = { bold: true };
      usersSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E5E0' } };

      const codes = loadCodes();
      const usage = loadUsage();
      const usageLimits = loadUsageLimits();
      const profiles = loadProfiles();

      Object.entries(codes).forEach(([code, name]) => {
        const currentUsage = usage[code] || 0;
        const maxUses = usageLimits[code] || MAX_USES_PER_CODE;
        const profile = profiles[code] || {};
        usersSheet.addRow({
          name: name || '',
          code: code,
          phone: profile.phone || '',
          role: profile.role || '',
          usage: currentUsage,
          maxUses: maxUses,
          remaining: Math.max(0, maxUses - currentUsage),
          loginAt: profile.loginAt ? profile.loginAt.replace('T', ' ').slice(0, 19) : '',
        });
      });

      // Sheet 2: 对话记录
      const convSheet = workbook.addWorksheet('对话记录');
      convSheet.columns = [
        { header: '时间', key: 'ts', width: 22 },
        { header: 'Agent ID', key: 'agent', width: 24 },
        { header: 'Agent 名称', key: 'agent_name', width: 20 },
        { header: '用户邀请码', key: 'user_name', width: 20 },
        { header: '用户提问', key: 'user', width: 40 },
        { header: 'Agent 回复', key: 'assistant', width: 50 },
        { header: '反馈', key: 'feedback', width: 8 },
      ];
      convSheet.getRow(1).font = { bold: true };
      convSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E5E0' } };

      const logPath = path.join(DATA_DIR, 'conversations.jsonl');
      if (fs.existsSync(logPath)) {
        const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
        lines.forEach(line => {
          try {
            const entry = JSON.parse(line);
            convSheet.addRow({
              ts: entry.ts ? entry.ts.replace('T', ' ').slice(0, 19) : '',
              agent: entry.agent || entry.agentId || '',
              agent_name: entry.agent_name || agentNames[entry.agent || entry.agentId] || '',
              user_name: entry.user_name || '',
              user: entry.user || '',
              assistant: entry.assistant || '',
              feedback: entry.feedback === 'up' ? '👍' : entry.feedback === 'down' ? '👎' : '',
            });
          } catch {}
        });
      }

      const filename = `MedAgent-数据导出-${new Date().toISOString().slice(0,10)}.xlsx`;
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
      });
      await workbook.xlsx.write(res);
      res.end();
    } catch (e) {
      console.error('Excel export error:', e);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Export failed' }));
      }
    }
    return true;
  }

  // ===== CORPUS API =====
  // Corpus stats overview
  if (url.pathname === '/api/admin/corpus/stats' && req.method === 'GET') {
    // 使用 SQLite 索引查询
    const corpusStats = stmtConvLogStats.get();
    const corpusAgentRows = stmtConvLogAgentCounts.all();
    const corpusAgentCounts = {};
    corpusAgentRows.forEach(r => { corpusAgentCounts[r.agent || 'unknown'] = r.cnt; });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      total: corpusStats.total || 0,
      labeled: corpusStats.feedbackUp || 0,
      needsReview: corpusStats.feedbackDown || 0,
      agentCounts: corpusAgentCounts
    }));
    return true;
  }

  // Corpus list (paginated)
  if (url.pathname === '/api/admin/corpus' && req.method === 'GET') {
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
    const agentFilter = url.searchParams.get('agent') || '';
    // 使用 SQLite 分页查询
    const offset = (page - 1) * pageSize;
    const countRow = stmtConvLogPagedCount.get(agentFilter, agentFilter);
    const total = countRow.cnt;
    const rows = stmtConvLogPaged.all(agentFilter, agentFilter, pageSize, offset);
    const data = rows.map(r => ({
      ts: r.ts, agent: r.agent, agentId: r.agent, agent_name: r.agent_name,
      user_name: r.user_name, user: r.user_msg, assistant: r.assistant_msg,
      feedback: r.feedback, _idx: r.id
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ total, page, pageSize, data }));
    return true;
  }

  // Needs analysis (demand analysis from conversations)
  if (url.pathname === '/api/admin/needs' && req.method === 'GET') {
    const needsPath = path.join(DATA_DIR, 'needs-summary.json');
    if (fs.existsSync(needsPath)) {
      const data = fs.readFileSync(needsPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } else {
      // 使用 SQLite 索引查询生成需求分析
      const needsAgentRows = stmtConvLogAgentCounts.all();
      const topAgents = needsAgentRows.slice(0, 10).map(r => ({ agentId: r.agent, count: r.cnt }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ topAgents, generatedAt: new Date().toISOString() }));
    }
    return true;
  }

  // Export corpus as JSONL
  if (url.pathname === '/api/admin/corpus/export' && req.method === 'GET') {
    const logPath = path.join(DATA_DIR, 'conversations.jsonl');
    if (!fs.existsSync(logPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No corpus data yet' }));
      return true;
    }
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Content-Disposition': `attachment; filename="corpus-${new Date().toISOString().slice(0,10)}.jsonl"`
    });
    fs.createReadStream(logPath).pipe(res);
    return true;
  }

  // ===== Notion 知识库配置接口 =====
  // 获取 Notion 配置状态
  if (url.pathname === '/api/admin/notion/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      configured: !!notionClient,
      databaseCount: NOTION_DATABASE_IDS.length,
      databaseIds: NOTION_DATABASE_IDS
    }));
    return true;
  }

  // 测试 Notion 连接
  if (url.pathname === '/api/admin/notion/test' && req.method === 'POST') {
    const { apiKey, databaseId } = await parseRequestBody(req);
    try {
      const testClient = new NotionClient({ auth: apiKey });
      const testResult = await testClient.users.me();
      let dbInfo = null;
      if (databaseId) {
        const db = await testClient.databases.retrieve({ database_id: databaseId });
        const titleProp = Object.values(db.properties || {}).find(p => p.type === 'title');
        dbInfo = {
          id: db.id,
          title: db.title?.[0]?.plain_text || '（无标题）',
          properties: Object.keys(db.properties || {})
        };
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, user: testResult.name || testResult.id, database: dbInfo }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return true;
  }

  // 搜索 Notion 知识库（测试用）
  if (url.pathname === '/api/admin/notion/search' && req.method === 'POST') {
    const { query } = await parseRequestBody(req);
    const result = await searchNotion(query || '医美', 5);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return true;
  }

  // 强制重置接口：丢弃本地修改并拉取最新代码
  if (url.pathname === '/api/admin/git-force-reset' && req.method === 'POST') {
    try {
      const appDir = __dirname;
      try { execSync('git stash', { cwd: appDir, timeout: 10000 }); } catch(se) {}
      try { execSync('git checkout -- .', { cwd: appDir, timeout: 10000 }); } catch(se) {}
      const pullOut = execSync('git pull origin master', { cwd: appDir, timeout: 30000 }).toString();
      // 尝试多种方式重启 pm2
      let restartOut = 'pm2重启跳过';
      let pm2List = '';
      const pm2Paths = ['/usr/local/bin/pm2', '/usr/bin/pm2', '/root/.npm-global/bin/pm2', '/root/.nvm/versions/node/v18.20.7/bin/pm2', '/root/.nvm/versions/node/v20.0.0/bin/pm2'];
      let restarted = false;
      for (const p of pm2Paths) {
        try {
          if (require('fs').existsSync(p)) {
            try { pm2List = execSync(`${p} list --no-color`, { timeout: 10000 }).toString(); } catch(le) {}
            // 尝试按名称重启
            try { restartOut = execSync(`${p} restart api-server`, { timeout: 15000 }).toString(); restarted = true; break; }
            catch(e1) {
              // 尝试按ID重启
              try { restartOut = execSync(`${p} restart 0`, { timeout: 15000 }).toString(); restarted = true; break; }
              catch(e2) {
                // 尝试 reload
                try { restartOut = execSync(`${p} reload all`, { timeout: 15000 }).toString(); restarted = true; break; }
                catch(e3) {
                  // 最后尝试：通过 pm2 describe 获取PID然后发SIGUSR2信号触发重载
                  try {
                    const descOut = execSync(`${p} describe api-server --no-color 2>/dev/null || ${p} describe 0 --no-color`, { timeout: 5000 }).toString();
                    const pidMatch = descOut.match(/pid\s*[:\|]\s*(\d+)/i);
                    if (pidMatch) {
                      const pid = parseInt(pidMatch[1]);
                      process.kill(pid, 'SIGUSR2'); // pm2 支持 SIGUSR2 触发 graceful reload
                      restartOut = `通过SIGUSR2信号重载 PID=${pid}`;
                      restarted = true;
                    } else {
                      restartOut = `${p} 失败: ` + e3.message;
                    }
                  } catch(e4) { restartOut = `${p} 失败: ` + e3.message + ' | SIGUSR2: ' + e4.message; }
                }
              }
            }
          }
        } catch(e) { restartOut = `${p} 失败: ` + e.message; }
      }
      // 如果所有pm2方式失败，先返回响应，然后用process.exit让pm2自动重启
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, pull: pullOut, restart: restarted ? restartOut : 'process.exit重启', pm2List }));
      if (!restarted) {
        // 延迟500ms后退出，让响应先发出去，pm2会自动重启进程加载新代码
        setTimeout(() => { process.exit(0); }, 500);
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return true;
  }
  // 远程部署接口：git pull + pm2 restart
  if (url.pathname === '/api/admin/deploy' && req.method === 'POST') {
    try {
      const appDir = __dirname;
      // 先 stash 本地修改，避免冲突
      try { execSync('git stash', { cwd: appDir, timeout: 10000 }); } catch(se) { /* ignore */ }
      const pullOut = execSync('git pull origin master', { cwd: appDir, timeout: 30000 }).toString();
      // 尝试多种方式重启 pm2
      let restartOut = '';
      const pm2Candidates = ['/usr/local/bin/pm2', '/usr/bin/pm2', `${process.env.HOME || '/root'}/.npm-global/bin/pm2`, `${process.env.HOME || '/root'}/.nvm/versions/node/v18.20.7/bin/pm2`];
      let pm2Bin = 'pm2';
      for (const p of pm2Candidates) { try { if (require('fs').existsSync(p)) { pm2Bin = p; break; } } catch(e) {} }
      try { restartOut = execSync(`${pm2Bin} restart 0`, { timeout: 15000 }).toString(); }
      catch(e1) { try { restartOut = execSync(`${pm2Bin} restart api-server`, { timeout: 15000 }).toString(); }
      catch(e2) { try { restartOut = execSync(`${pm2Bin} reload all`, { timeout: 15000 }).toString(); }
      catch(e3) { restartOut = 'pm2重启跳过: ' + e3.message; } } }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, pull: pullOut, restart: restartOut }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return true;
  }
  // ===== 知识库管理 API =====
  // 获取知识库统计
  if (url.pathname === '/api/admin/kb/stats' && req.method === 'GET') {
    try {
      const stats = kb.getStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return true;
  }

  // 删除知识库文档
  if (url.pathname === '/api/admin/kb/delete' && req.method === 'POST') {
    try {
      const { fileId } = await parseRequestBody(req);
      const removed = kb.removeDocument(fileId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, removed }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return true;
  }

  // 上传并向量化文档（SSE 流式进度）
  if (url.pathname === '/api/admin/kb/upload' && req.method === 'POST') {
    kbUploadMiddleware(req, res, async (err) => {
      if (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return true;
      }
      if (!req.file) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '未收到文件' }));
        return true;
      }
      const scope = req.body?.scope || 'global';
      const filePath = req.file.path;
      const sfKey = process.env.SILICONFLOW_API_KEY;
      // 使用 SSE 推送进度
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
      try {
        const result = await kb.addDocument(filePath, scope, sfKey, (progress) => send(progress));
        // 删除临时文件
        try { fs.unlinkSync(filePath); } catch {}
        send({ step: 'complete', ...result });
        res.end();
      } catch (e) {
        try { fs.unlinkSync(filePath); } catch {}
        send({ step: 'error', error: e.message });
        res.end();
      }
    });
    return true;
  }


  // 未匹配任何路由
  return false;
}

module.exports = { handleAdminRoutes };
