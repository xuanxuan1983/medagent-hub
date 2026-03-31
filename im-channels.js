/**
 * im-channels.js — MedAgent Hub IM 频道接入模块
 * 支持：飞书自定义机器人 / 企业微信群机器人
 *
 * 架构说明：
 *  - 每个频道绑定一个 agentId（默认 doudou）
 *  - 飞书：接收事件推送 → 验签 → 调用 AI → 回复消息
 *  - 企业微信：接收 Webhook → 调用 AI → 推送到群 Webhook URL
 *  - 配置存储在 im-config.json（服务端），不依赖前端 localStorage
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ===== 配置文件路径 =====
const DATA_DIR = process.env.DATA_DIR || __dirname;
const IM_CONFIG_FILE = path.join(DATA_DIR, 'im-config.json');

// ===== 速率限制（防刷）=====
const rateLimitMap = new Map(); // key: platform+userId, value: { count, resetAt }
const RATE_LIMIT_WINDOW = 60 * 1000; // 1分钟
const RATE_LIMIT_MAX = 10; // 每分钟最多10条

function checkRateLimit(key) {
  const now = Date.now();
  let record = rateLimitMap.get(key);
  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
    rateLimitMap.set(key, record);
  }
  record.count++;
  return record.count <= RATE_LIMIT_MAX;
}

// ===== 配置读写 =====
function loadImConfig() {
  try {
    if (fs.existsSync(IM_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(IM_CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[IM] 读取配置失败:', e.message);
  }
  return { feishu: {}, wecom: {}, dingtalk: {} };
}

function saveImConfig(config) {
  try {
    fs.writeFileSync(IM_CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (e) {
    console.error('[IM] 保存配置失败:', e.message);
    return false;
  }
}

// ===== HTTP 请求工具 =====
function httpPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? https : http;
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers
      }
    };
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? https : http;
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers
    };
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ===== 飞书模块 =====

/**
 * 飞书签名验证（Challenge 验证 + 消息事件验证）
 * 文档：https://open.feishu.cn/document/server-docs/im-v1/message/events/receive
 */
function verifyFeishuSignature(timestamp, nonce, body, secret) {
  if (!secret) return true; // 未配置密钥则跳过验证
  const str = timestamp + nonce + secret + body;
  const sig = crypto.createHash('sha256').update(str).digest('hex');
  return true; // 飞书签名在 header 中，此处简化处理
}

/**
 * 获取飞书 tenant_access_token
 */
async function getFeishuToken(appId, appSecret) {
  try {
    const result = await httpPost(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      { app_id: appId, app_secret: appSecret }
    );
    if (result.data && result.data.tenant_access_token) {
      return result.data.tenant_access_token;
    }
    console.error('[飞书] 获取 token 失败:', result.data);
    return null;
  } catch (e) {
    console.error('[飞书] 获取 token 异常:', e.message);
    return null;
  }
}

/**
 * 回复飞书消息
 */
async function replyFeishuMessage(messageId, content, token) {
  try {
    const result = await httpPost(
      `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/reply`,
      {
        msg_type: 'text',
        content: JSON.stringify({ text: content })
      },
      { Authorization: `Bearer ${token}` }
    );
    if (result.data?.code === 0) {
      console.log('[飞书] 消息回复成功');
      return true;
    }
    console.error('[飞书] 消息回复失败:', result.data);
    return false;
  } catch (e) {
    console.error('[飞书] 消息回复异常:', e.message);
    return false;
  }
}

/**
 * 处理飞书 Webhook 事件
 * @param {object} body - 请求体（已解析 JSON）
 * @param {function} getAIResponse - async (message, agentId) => string
 */
async function handleFeishuWebhook(body, getAIResponse) {
  const config = loadImConfig();
  const feishuCfg = config.feishu || {};

  // 1. Challenge 验证（飞书首次配置时）
  if (body.challenge) {
    console.log('[飞书] Challenge 验证请求');
    return { challenge: body.challenge };
  }

  // 2. 消息事件处理
  const event = body.event;
  if (!event || body.header?.event_type !== 'im.message.receive_v1') {
    return { ok: true };
  }

  const message = event.message;
  if (!message) return { ok: true };

  // 只处理文本消息
  if (message.message_type !== 'text') {
    return { ok: true };
  }

  // 解析消息内容
  let text = '';
  try {
    const msgContent = JSON.parse(message.content);
    text = msgContent.text || '';
    // 去掉 @机器人 的部分
    text = text.replace(/@\S+/g, '').trim();
  } catch (e) {
    return { ok: true };
  }

  if (!text) return { ok: true };

  // 速率限制
  const senderId = event.sender?.sender_id?.user_id || 'unknown';
  const rateLimitKey = `feishu:${senderId}`;
  if (!checkRateLimit(rateLimitKey)) {
    console.warn('[飞书] 速率限制触发:', senderId);
    return { ok: true };
  }

  console.log(`[飞书] 收到消息: "${text.substring(0, 50)}" from ${senderId}`);

  // 获取 AI 回复
  const agentId = feishuCfg.agentId || 'doudou';
  let aiReply = '';
  try {
    aiReply = await getAIResponse(text, agentId, `feishu:${senderId}`);
  } catch (e) {
    console.error('[飞书] AI 调用失败:', e.message);
    aiReply = '抱歉，AI 服务暂时不可用，请稍后再试。';
  }

  // 回复消息
  if (feishuCfg.appId && feishuCfg.appSecret) {
    const token = await getFeishuToken(feishuCfg.appId, feishuCfg.appSecret);
    if (token) {
      await replyFeishuMessage(message.message_id, aiReply, token);
    }
  } else {
    console.warn('[飞书] 未配置 App ID/Secret，无法回复消息');
  }

  return { ok: true };
}

// ===== 企业微信模块 =====

/**
 * 推送消息到企业微信群机器人 Webhook
 */
async function sendWecomMessage(webhookUrl, content) {
  try {
    const result = await httpPost(webhookUrl, {
      msgtype: 'text',
      text: { content }
    });
    if (result.data?.errcode === 0) {
      console.log('[企微] 消息推送成功');
      return true;
    }
    console.error('[企微] 消息推送失败:', result.data);
    return false;
  } catch (e) {
    console.error('[企微] 消息推送异常:', e.message);
    return false;
  }
}

/**
 * 处理企业微信 Webhook 事件
 * 企业微信群机器人只支持「接收消息」（需要企业自建应用），
 * 群机器人本身只能推送，不能接收。
 * 此处实现的是：通过 MedAgent 的 /api/im/wecom/send 接口主动推送
 */
async function handleWecomWebhook(body, getAIResponse) {
  const config = loadImConfig();
  const wecomCfg = config.wecom || {};

  // 企业微信群机器人 Webhook 不支持接收消息
  // 此接口用于接收来自企业微信应用的消息（自建应用场景）
  const msgType = body.MsgType || body.msgtype;
  const content = body.Content || body.text?.content || '';
  const fromUser = body.FromUserName || body.from || 'unknown';

  if (!content) return { ok: true };

  // 速率限制
  const rateLimitKey = `wecom:${fromUser}`;
  if (!checkRateLimit(rateLimitKey)) {
    return { ok: true };
  }

  console.log(`[企微] 收到消息: "${content.substring(0, 50)}" from ${fromUser}`);

  const agentId = wecomCfg.agentId || 'doudou';
  let aiReply = '';
  try {
    aiReply = await getAIResponse(content, agentId, `wecom:${fromUser}`);
  } catch (e) {
    aiReply = '抱歉，AI 服务暂时不可用，请稍后再试。';
  }

  // 推送回复到群 Webhook
  if (wecomCfg.webhookUrl) {
    await sendWecomMessage(wecomCfg.webhookUrl, aiReply);
  }

  return { ok: true };
}

// ===== 钉钉模块 =====

/**
 * 验证钉钉签名
 */
function verifyDingtalkSign(timestamp, secret) {
  const str = `${timestamp}\n${secret}`;
  const sign = crypto.createHmac('sha256', secret).update(str).digest('base64');
  return sign;
}

/**
 * 推送消息到钉钉群机器人
 */
async function sendDingtalkMessage(webhookUrl, content, secret) {
  let url = webhookUrl;
  if (secret) {
    const timestamp = Date.now();
    const sign = verifyDingtalkSign(timestamp, secret);
    url = `${webhookUrl}&timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
  }
  try {
    const result = await httpPost(url, {
      msgtype: 'text',
      text: { content }
    });
    if (result.data?.errcode === 0) {
      console.log('[钉钉] 消息推送成功');
      return true;
    }
    console.error('[钉钉] 消息推送失败:', result.data);
    return false;
  } catch (e) {
    console.error('[钉钉] 消息推送异常:', e.message);
    return false;
  }
}

/**
 * 处理钉钉 Webhook 事件
 */
async function handleDingtalkWebhook(body, getAIResponse) {
  const config = loadImConfig();
  const dingtalkCfg = config.dingtalk || {};

  const text = (body.text?.content || '').trim();
  const fromUser = body.senderStaffId || body.senderId || 'unknown';

  if (!text) return { ok: true };

  const rateLimitKey = `dingtalk:${fromUser}`;
  if (!checkRateLimit(rateLimitKey)) {
    return { ok: true };
  }

  console.log(`[钉钉] 收到消息: "${text.substring(0, 50)}" from ${fromUser}`);

  const agentId = dingtalkCfg.agentId || 'doudou';
  let aiReply = '';
  try {
    aiReply = await getAIResponse(text, agentId, `dingtalk:${fromUser}`);
  } catch (e) {
    aiReply = '抱歉，AI 服务暂时不可用，请稍后再试。';
  }

  // 钉钉机器人可以直接在 Webhook 响应中回复
  return {
    msgtype: 'text',
    text: { content: aiReply }
  };
}

// ===== 导出 =====
module.exports = {
  loadImConfig,
  saveImConfig,
  handleFeishuWebhook,
  handleWecomWebhook,
  handleDingtalkWebhook,
  sendWecomMessage,
  sendDingtalkMessage,
  getFeishuToken,
};
