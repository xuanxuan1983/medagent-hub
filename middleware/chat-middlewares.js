/**
 * 提取的聊天中间件和公共逻辑 v2
 * 增强：搜索结果分组展示、任务计划步骤描述更新
 */

/**
 * 权限检查中间件
 */
function checkChatPermissions(req, res, session, userCode, planStatus, webSearch, envConfig) {
  const { TRIAL_AGENTS, CONTENT_AGENTS_META, PRO_MONTHLY_SEARCH_LIMIT, loadProfiles } = envConfig;

  if (planStatus.isTrialExpired) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'trial_expired',
      message: '免费试用期已结束，请升级为 Pro 会员继续使用',
      planStatus
    }));
    return false;
  }

  if (session.agentId && TRIAL_AGENTS && !TRIAL_AGENTS.includes(session.agentId)) {
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

  if (planStatus.dailyRemaining <= 0) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'daily_limit_exceeded',
      message: `今日消息配额已用尽（${planStatus.dailyLimit}条/天），明日自动重置`,
      planStatus
    }));
    return false;
  }

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
 * SSE 流式响应辅助工具 v2
 * 新增：搜索结果分组展示、任务计划步骤描述更新
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

  /**
   * 发送带来源分组的搜索结果
   * @param {string} source 来源工具名称 (nmpa_search/web_search/knowledge_search)
   * @param {Array} results 搜索结果数组
   */
  sendSearchGrouped(source, results) {
    const sourceLabels = {
      'nmpa_search': '药监局数据',
      'web_search': '联网搜索',
      'knowledge_search': '知识库',
      'query_med_db': '价格数据'
    };
    this.res.write(`data: ${JSON.stringify({
      type: 'search',
      source: source,
      sourceLabel: sourceLabels[source] || source,
      results: results
    })}\n\n`);
  }

  sendToolCall(tool, args) {
    this.res.write(`data: ${JSON.stringify({ type: 'tool_call', tool, ...args })}\n\n`);
  }

  /**
   * 初始化任务规划容器（只发标题，不发步骤）
   * @param {number} totalSteps 预计总步骤数
   */
  sendTaskPlanInit(totalSteps) {
    this.res.write(`data: ${JSON.stringify({ type: 'task_plan_init', totalSteps })}\n\n`);
  }

  /**
   * 逐个追加任务规划步骤（带延迟动画效果）
   * @param {Object} step 步骤对象 {id, title, description, status}
   */
  sendTaskPlanStep(step) {
    this.res.write(`data: ${JSON.stringify({ type: 'task_plan_add', step })}\n\n`);
  }

  /**
   * 逐步发送任务规划（先初始化容器，再逐个发送步骤，每步间隔 250ms）
   * @param {Array} steps 步骤数组
   * @returns {Promise<void>}
   */
  async sendTaskPlanAnimated(steps) {
    this.sendTaskPlanInit(steps.length);
    for (let i = 0; i < steps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 250));
      this.sendTaskPlanStep(steps[i]);
    }
  }

  /**
   * 兼容旧接口：一次性发送所有步骤
   */
  sendTaskPlan(steps) {
    this.res.write(`data: ${JSON.stringify({ type: 'task_plan', steps })}\n\n`);
  }

  updateTaskPlan(stepId, status) {
    this.res.write(`data: ${JSON.stringify({ type: 'task_plan_update', stepId, status })}\n\n`);
  }

  /**
   * 更新任务计划步骤的状态和描述（附加结果摘要）
   * @param {number} stepId 步骤 ID
   * @param {string} status 状态
   * @param {string} description 新的描述文本
   */
  updateTaskPlanDesc(stepId, status, description) {
    this.res.write(`data: ${JSON.stringify({
      type: 'task_plan_update',
      stepId,
      status,
      description
    })}\n\n`);
  }
}

module.exports = {
  checkChatPermissions,
  checkExpertPermissions,
  SSEStreamer
};
