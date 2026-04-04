/**
 * 提取的聊天中间件和公共逻辑
 * 将 expert-stream 和 message-stream 中重复的权限检查、意图分类等逻辑抽取出来
 */

/**
 * 权限检查中间件
 * 整合了试用期、Agent权限、每日配额、搜索配额的检查
 */
function checkChatPermissions(req, res, session, userCode, planStatus, webSearch, envConfig) {
  const { TRIAL_AGENTS, CONTENT_AGENTS_META, PRO_MONTHLY_SEARCH_LIMIT, loadProfiles } = envConfig;

  // 1. 检查试用期是否到期
  if (planStatus.isTrialExpired) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'trial_expired',
      message: '免费试用期已结束，请升级为 Pro 会员继续使用',
      planStatus
    }));
    return false;
  }

  // 2. 检查 Agent 访问权限（内测期间分级控制）
  if (session.agentId && TRIAL_AGENTS && !TRIAL_AGENTS.includes(session.agentId)) {
    // 内容创作类Agent：需要Pro+或已解锁beta权益
    if (CONTENT_AGENTS_META && CONTENT_AGENTS_META.has(session.agentId)) {
      const userProfile = loadProfiles()[userCode] || {};
      const hasBetaUnlock = userProfile.beta_unlock === true;
      if (!planStatus.isPro && !hasBetaUnlock) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'agent_locked_content',
          message: '该 Agent 为内容创作类专属，升级 Pro 或提交有价值反馈后可解锁',
          planStatus
        }));
        return false;
      }
    }
  }

  // 3. 检查每日消息配额
  if (planStatus.dailyRemaining <= 0) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'daily_limit_exceeded',
      message: `今日消息配额已用尽（${planStatus.dailyLimit}条/天），明日自动重置`,
      planStatus
    }));
    return false;
  }

  // 4. 检查联网搜索权限
  if (webSearch && !planStatus.canSearch) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'search_not_allowed',
      message: planStatus.isPro
        ? `本月联网搜索配额已用尽（${PRO_MONTHLY_SEARCH_LIMIT}次/月）`
        : '联网搜索为 Pro 会员专属功能，请升级以使用',
      planStatus
    }));
    return false;
  }

  return true;
}

/**
 * 专家模式权限检查
 */
function checkExpertPermissions(req, res, planStatus) {
  if (!planStatus.isProPlus) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'expert_mode_locked',
      message: '专家模式为 Pro+ 专属功能，请升级后使用'
    }));
    return false;
  }
  return true;
}

/**
 * SSE 流式响应辅助工具
 */
class SSEStreamer {
  constructor(res) {
    this.res = res;
    this.stepCounter = 0;
  }

  init() {
    this.res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
  }

  sendStep(text, status = 'running') {
    const id = ++this.stepCounter;
    this.res.write(`data: ${JSON.stringify({ type: 'step', id, text, status })}\n\n`);
    return id;
  }

  updateStep(id, text, status = 'done') {
    this.res.write(`data: ${JSON.stringify({ type: 'step', id, text, status })}\n\n`);
  }

  sendDelta(content) {
    this.res.write(`data: ${JSON.stringify({ type: 'delta', content })}\n\n`);
  }

  sendDone() {
    this.res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  }

  sendError(message) {
    this.res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
  }

  sendSearch(results) {
    this.res.write(`data: ${JSON.stringify({ type: 'search', results })}\n\n`);
  }

  sendToolCall(tool, args) {
    this.res.write(`data: ${JSON.stringify({ type: 'tool_call', tool, ...args })}\n\n`);
  }
}

module.exports = {
  checkChatPermissions,
  checkExpertPermissions,
  SSEStreamer
};
