#!/usr/bin/env python3
"""
将公开支付API注入到 api-server.js 中。
1. PRICING_PLANS + pendingOrders → 在 "// 微信支付初始化" 之前
2. 公开支付路由 → 在 "// 微信支付 - 创建订单" 之前
3. 登录时迁移套餐 → 在 saveProfiles 之后、Set-Cookie 之前
"""
import os, sys

API_SERVER = '/home/ubuntu/medagent-hub/api-server.js'

with open(API_SERVER, 'r') as f:
    content = f.read()

if '/api/payment/public-order' in content:
    print('[跳过] 公开支付API已存在')
    sys.exit(0)

# ===== 1. 注入 PRICING_PLANS + pendingOrders =====
PRICING_BLOCK = """
// ===== 公开支付套餐定义 =====
const PRICING_PLANS = {
  'pro-monthly':      { name: 'Pro 专业版 月付',    price: 29900,  plan: 'pro',      months: 1,  display: '¥299/月' },
  'pro-yearly':       { name: 'Pro 专业版 年付',    price: 286800, plan: 'pro',      months: 12, display: '¥2,388/年' },
  'pro_plus-monthly': { name: 'Pro+ 全能版 月付',   price: 49900,  plan: 'pro_plus', months: 1,  display: '¥499/月' },
  'pro_plus-yearly':  { name: 'Pro+ 全能版 年付',   price: 478800, plan: 'pro_plus', months: 12, display: '¥3,988/年' },
};

// 待支付订单暂存（内存，30分钟过期）
const pendingOrders = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingOrders) {
    if (now - v.createdAt > 30 * 60 * 1000) pendingOrders.delete(k);
  }
}, 60000);

"""

m1 = '// 微信支付初始化'
assert m1 in content, f'找不到标记: {m1}'
content = content.replace(m1, PRICING_BLOCK + m1, 1)
print('[1/3] 注入 PRICING_PLANS + pendingOrders')

# ===== 2. 注入公开支付API路由 =====
ROUTES_BLOCK = """
  // ===== 公开支付API（无需认证）=====

  // 公开支付 - 创建订单
  if (url.pathname === '/api/payment/public-order' && req.method === 'POST') {
    try {
      if (!wechatPay) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '支付功能暂不可用，请联系客服' }));
        return;
      }
      const { planId, name, org } = await parseRequestBody(req);
      if (!planId || !PRICING_PLANS[planId]) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '无效的套餐类型' }));
        return;
      }
      if (!name || !name.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '请填写姓名' }));
        return;
      }
      const planDef = PRICING_PLANS[planId];
      const out_trade_no = `medagent_${Date.now()}`;
      const params = {
        appid: 'wx10951656e9a582db',
        mchid: '1684977594',
        description: `MedAgent Hub - ${planDef.name}`,
        out_trade_no,
        amount: { total: planDef.price },
        notify_url: 'https://medagent.filldmy.com/api/payment/notify',
      };
      const result = await wechatPay.transactions_native(params);
      const codeUrl = (result.data && result.data.code_url) || result.code_url;
      if (!codeUrl) {
        console.error('WeChat Pay no code_url:', JSON.stringify(result));
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '支付二维码生成失败，请稍后重试' }));
        return;
      }
      pendingOrders.set(out_trade_no, {
        planId, planDef, name: name.trim(), org: (org || '').trim(),
        createdAt: Date.now(), paid: false, inviteCode: null
      });
      console.log(`📦 公开订单创建: ${out_trade_no}, 套餐: ${planDef.name}, 用户: ${name.trim()}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ codeUrl, out_trade_no, planName: planDef.name }));
    } catch (error) {
      console.error('Error creating public order:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '创建支付订单失败' }));
    }
    return;
  }

  // 公开支付 - 查询订单状态+自动生成邀请码
  if (url.pathname === '/api/payment/public-query' && req.method === 'GET') {
    try {
      if (!wechatPay) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '支付功能暂不可用', paid: false }));
        return;
      }
      const tradeNo = url.searchParams.get('trade_no');
      if (!tradeNo) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '缺少 trade_no 参数', paid: false }));
        return;
      }
      const order = pendingOrders.get(tradeNo);
      if (!order) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '订单不存在或已过期', paid: false }));
        return;
      }
      if (order.paid && order.inviteCode) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ paid: true, trade_state: 'SUCCESS', inviteCode: order.inviteCode }));
        return;
      }
      const result = await wechatPay.query({ mchid: '1684977594', out_trade_no: tradeNo });
      const tradeState = (result.data && result.data.trade_state) || result.trade_state;
      const paid = tradeState === 'SUCCESS';
      if (paid && !order.paid) {
        const inviteCode = 'MA' + Math.random().toString(36).slice(2, 6).toUpperCase() + Date.now().toString(36).slice(-3).toUpperCase();
        const codes = loadCodes();
        codes[inviteCode] = order.name;
        saveCodes(codes);
        const usageLimits = loadUsageLimits();
        usageLimits[inviteCode] = 1;
        saveUsageLimits(usageLimits);
        const profiles = loadProfiles();
        const now = new Date();
        const expires = new Date(now);
        expires.setMonth(expires.getMonth() + order.planDef.months);
        profiles['__pending_' + inviteCode] = {
          plan: order.planDef.plan,
          plan_expires: expires.toISOString(),
          trial_start: now.toISOString(),
          payment_name: order.name,
          payment_org: order.org,
          payment_trade_no: tradeNo,
          payment_plan: order.planId,
        };
        saveProfiles(profiles);
        order.paid = true;
        order.inviteCode = inviteCode;
        pendingOrders.set(tradeNo, order);
        const paymentLog = path.join(DATA_DIR, 'payment-log.json');
        let payments = [];
        try { if (fs.existsSync(paymentLog)) payments = JSON.parse(fs.readFileSync(paymentLog, 'utf8')); } catch {}
        payments.push({
          type: 'public_payment', trade_no: tradeNo, plan: order.planId,
          name: order.name, org: order.org, inviteCode,
          amount: order.planDef.price, paid_at: now.toISOString(),
        });
        fs.writeFileSync(paymentLog, JSON.stringify(payments, null, 2));
        console.log('✅ 公开支付成功: ' + tradeNo + ', 用户: ' + order.name + ', 邀请码: ' + inviteCode + ', 套餐: ' + order.planDef.name);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ paid: true, trade_state: 'SUCCESS', inviteCode }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ paid: false, trade_state: tradeState }));
      }
    } catch (error) {
      console.error('Error querying public order:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '查询订单失败', paid: false }));
    }
    return;
  }

  // 公开支付 - 获取套餐列表
  if (url.pathname === '/api/payment/plans' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ plans: PRICING_PLANS }));
    return;
  }

"""

m2 = '  // 微信支付 - 创建订单'
assert m2 in content, f'找不到标记: {m2}'
content = content.replace(m2, ROUTES_BLOCK + m2, 1)
print('[2/3] 注入公开支付API路由')

# ===== 3. 注入登录时迁移套餐逻辑 =====
# 插入在 "if (phone) console.log(`📱 邀请码" 之后
MIGRATE_BLOCK = """
        // 迁移公开支付预设的套餐信息
        try {
          const pendingKey = '__pending_' + code;
          if (profiles[pendingKey]) {
            const pending = profiles[pendingKey];
            if (!profiles[code]) profiles[code] = {};
            profiles[code].plan = pending.plan;
            profiles[code].plan_expires = pending.plan_expires;
            if (pending.payment_name) profiles[code].payment_name = pending.payment_name;
            if (pending.payment_org) profiles[code].payment_org = pending.payment_org;
            if (pending.payment_trade_no) profiles[code].payment_trade_no = pending.payment_trade_no;
            if (pending.payment_plan) profiles[code].payment_plan = pending.payment_plan;
            delete profiles[pendingKey];
            saveProfiles(profiles);
            console.log('✅ 迁移支付套餐: ' + pendingKey + ' → ' + code);
          }
        } catch (e) { console.error('迁移支付套餐失败:', e.message); }
"""

m3 = "        if (phone) console.log(`📱 邀请码 ${code} 绑定手机号: ${phone}`);"
assert m3 in content, f'找不到标记: {m3}'
content = content.replace(m3, m3 + '\n' + MIGRATE_BLOCK, 1)
print('[3/3] 注入登录时迁移套餐逻辑')

# 写入
with open(API_SERVER, 'w') as f:
    f.write(content)

print('[完成] api-server.js 已更新')
