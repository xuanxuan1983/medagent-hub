/**
 * 统一聊天流式路由 (Unified Chat Stream)
 * 合并了原本分离的 expert-stream 和 message-stream
 * 使用 Function Calling 架构动态调用工具，替代硬编码触发
 */

const { checkChatPermissions, checkExpertPermissions, SSEStreamer } = require('../middleware/chat-middlewares');
const toolRegistry = require('../tools/index');

/**
 * 统一流式处理入口
 */
async function handleUnifiedChatStream(req, res, deps) {
 const {
 sessions,
 parseRequestBody,
 isAuthenticated,
 getUserCode,
 getUserPlanStatus,
 envConfig,
 classifyIntentFast,
 aiProvider,
 createProviderFromConfig,
 stmtInsertMessage,
 stmtUpdateSessionTime,
 fs,
 path,
 DATA_DIR,
 stmtInsertConvLog,
 recordTokenUsage,
 incrementDailyMsg,
 incrementMonthlySearch,
 recordBochaUsage,
 SiliconFlowProvider,
 isExpertMode // 新增参数：区分是否为专家模式调用
 } = deps;

 try {
 if (!isAuthenticated(req)) {
 res.writeHead(401, { 'Content-Type': 'application/json' });
 res.end(JSON.stringify({ error: 'Unauthorized' }));
 return;
 }

 const body = await parseRequestBody(req);
 const { sessionId, message, fileContext, provider: userProvider, apiKey: userApiKey, model: userModel, webSearch, skillContext, skillName: loadedSkillName } = body;

 if (!sessionId || !sessions.has(sessionId)) {
 res.writeHead(400, { 'Content-Type': 'application/json' });
 res.end(JSON.stringify({ error: 'Invalid session ID' }));
 return;
 }

 const session = sessions.get(sessionId);
 const userCode = session.userCode || getUserCode(req);
 const planStatus = getUserPlanStatus(userCode);

 // 1. 基础权限检查
 if (!checkChatPermissions(req, res, session, userCode, planStatus, webSearch, envConfig)) {
 return;
 }

 // 2. 专家模式权限检查
 if (isExpertMode && !checkExpertPermissions(req, res, planStatus)) {
 return;
 }

 // 初始化 SSE 流
 const streamer = new SSEStreamer(res);
 streamer.init();

 // 3. 构建用户消息
 let userContent = message;
 if (fileContext) {
 userContent = `用户上传了文件《${fileContext.name}》，内容如下：\n\n---\n${fileContext.content.substring(0, 8000)}\n---\n\n用户问题：${message}`;
 }

 session.messages.push({ role: 'user', content: userContent });
 console.log(` [${session.agentName}] User (${isExpertMode ? 'Expert' : 'Normal'}): ${message.substring(0, 50)}...`);

 // 3.1 智能会话压缩：当消息超过阈值时，自动摘要早期对话而非硬截断
 const MAX_MESSAGES = 60; // 30轮 = 60条消息 (user+assistant)
 const COMPRESS_THRESHOLD = 40; // 超过 20 轮开始压缩
 const KEEP_RECENT = 20; // 压缩后保留最近 10 轮
 if (session.messages.length > COMPRESS_THRESHOLD && !session._compressing) {
 session._compressing = true;
 try {
 const earlyMessages = session.messages.slice(0, session.messages.length - KEEP_RECENT);
 const earlyText = earlyMessages.map(m => `${m.role === 'user' ? '用户' : (m.role === 'assistant' ? 'AI' : '系统')}: ${(m.content || '').substring(0, 200)}`).join('\n');
 if (earlyText.length > 100) {
 const summaryPrompt = '请用 2-3 句话概括以下对话的核心内容和关键信息，保留重要的事实、数据和结论：';
 const summaryMessages = [{ role: 'user', content: summaryPrompt + '\n\n' + earlyText.substring(0, 3000) }];
 let summary = null;
 try {
 const summaryResult = await aiProvider.chat('你是一个对话摘要助手。只输出摘要，不要添加任何前缀或解释。', summaryMessages);
 summary = summaryResult.message;
 } catch (sumErr) {
 console.warn(`[ Compress] 摘要生成失败，降级为硬截断:`, sumErr.message);
 }
 if (summary && summary.length > 10) {
 const recentMessages = session.messages.slice(session.messages.length - KEEP_RECENT);
 session.messages = [
 { role: 'system', content: `[对话历史摘要] ${summary}` },
 ...recentMessages
 ];
 console.log(`[ Compress] 压缩了 ${earlyMessages.length} 条早期消息为摘要，当前历史: ${session.messages.length} 条`);
 } else {
 const trimmed = session.messages.length - MAX_MESSAGES;
 session.messages = session.messages.slice(trimmed);
 console.log(`[ Trim] 摘要失败，截断了 ${trimmed} 条早期消息`);
 }
 }
 } catch (compressErr) {
 console.error(`[ Compress] 压缩异常:`, compressErr.message);
 if (session.messages.length > MAX_MESSAGES) {
 session.messages = session.messages.slice(session.messages.length - MAX_MESSAGES);
 }
 } finally {
 session._compressing = false;
 }
 } else if (session.messages.length > MAX_MESSAGES) {
 const trimmed = session.messages.length - MAX_MESSAGES;
 session.messages = session.messages.slice(trimmed);
 console.log(`[ Trim] 截断了 ${trimmed} 条早期消息，当前历史: ${session.messages.length} 条`);
 }

 // 3.5 注入已加载的技能包上下文
 if (skillContext) {
 session.messages.push({
 role: 'system',
 content: `[已加载技能包：${loadedSkillName || '未命名'}] 请参考以下技能包内容回答用户问题：\n\n${skillContext.substring(0, 6000)}`
 });
 console.log(`[SkillLoad] 注入技能包上下文: ${loadedSkillName}`);
 }

 // 4. 意图分类与系统提示词准备
 const intentResult = classifyIntentFast(message);
 let enrichedSystemPrompt = session.systemPrompt;
 
 // 用户记忆注入
 try {
 const userMemModule = require('../user-memory');
 const profiles = envConfig.loadProfiles();
 const memUpdated = userMemModule.updateUserMemory(profiles, userCode, message);
 if (memUpdated) envConfig.saveProfiles(profiles);
 const memContext = userMemModule.getUserMemoryContext(profiles, userCode, session.messages);
 if (memContext) {
 session._memoryContext = memContext;
 enrichedSystemPrompt += '\n\n' + memContext;
 }
 } catch (e) { /* 静默失败 */ }

 // 专家模式专属指令增强
 if (isExpertMode) {
 enrichedSystemPrompt += '\n\n【专家模式指令】请以专业医美顾问的身份，给出深度、结构化的分析。回答需包含：核心判断、关键数据/依据、具体建议（分步骤）、注意事项。使用 Markdown 格式，层次清晰。遇到不确定的信息，必须使用工具查询，不要编造。';
 // 发送思考过程步骤
 streamer.sendStep(`分析问题意图：${intentResult.intent} (专家模式)`, 'done');
 }

 // 4.5 检测用户消息中的 [引用知识库《xxx》] 标签，强制触发 knowledge_search
 const kbCitePattern = /\[引用知识库《(.+?)》\]/g;
 const kbCiteMatches = [...message.matchAll(kbCitePattern)];
 let forcedKbResults = null;
 if (kbCiteMatches.length > 0) {
 const citeNames = kbCiteMatches.map(m => m[1]);
 console.log(`[ KB Force] 检测到知识库引用标签: ${citeNames.join(', ')}`);
 const kbStepId = isExpertMode ? streamer.sendStep(`检索知识库：${citeNames.join('、')}`, 'running') : null;
 try {
 const kbQuery = message.replace(kbCitePattern, '').trim() || citeNames.join(' ');
 const kbResult = await toolRegistry.executeTool('knowledge_search', { query: kbQuery, top_k: 5 }, {
 kb: deps.kb, agentId: session.agentId,
 sfKey: process.env.SILICONFLOW_API_KEY,
 bm25Retrieve: deps.bm25Retrieve,
 mergeRetrievalResults: deps.mergeRetrievalResults,
 rerankChunks: deps.rerankChunks,
 message: kbQuery
 });
 if (kbResult && kbResult.text) {
 forcedKbResults = kbResult;
 enrichedSystemPrompt += `\n\n【强制知识库检索结果】用户引用了知识库文档，以下是检索结果，请基于这些内容回答用户问题：\n${kbResult.text}`;
 if (kbResult.searchResults && kbResult.searchResults.length > 0) {
 searchResults = searchResults.concat(kbResult.searchResults);
 }
 console.log(`[ KB Force] 强制检索成功，注入 ${kbResult.text.length} 字符上下文`);
 streamer.sendToolCall('knowledge_search', { query: kbQuery, source: 'forced_cite' });
 if (kbStepId) {
 streamer.updateStep(kbStepId, `检索知识库：${citeNames.join('、')}`, 'done');
 } else {
 streamer.sendStep('已从知识库检索引用内容', 'done');
 }
 if (kbResult.searchResults && kbResult.searchResults.length > 0) {
 streamer.sendSearch(kbResult.searchResults);
 }
 }
 } catch (kbErr) {
 console.error(`[ KB Force] 强制检索失败:`, kbErr.message);
 }
 }

 // 5. 准备可用的工具列表
 const availableToolIds = ['knowledge_search', 'nmpa_search'];
 if (webSearch || isExpertMode) {
 availableToolIds.push('web_search');
 }
 // 豆子（导航 Agent）需要 skill_dispatch 工具来路由到对应专家
 if (session.agentId === 'doudou') {
 availableToolIds.push('skill_dispatch');
 }
 
 const tools = toolRegistry.getToolDefinitions(availableToolIds);
 
 // 6. 确定使用的模型 Provider
 let activeProvider = aiProvider;
 if (isExpertMode) {
 // 专家模式强制使用 R1 或指定的专家模型
 activeProvider = new SiliconFlowProvider();
 activeProvider.model = process.env.EXPERT_MODEL || 'Pro/deepseek-ai/DeepSeek-R1';
 activeProvider.apiKey = process.env.SILICONFLOW_API_KEY || '';
 } else if (userProvider && userApiKey) {
 activeProvider = createProviderFromConfig(userProvider, userApiKey, userModel);
 }

 // 7. 工具上下文注入
 const toolContext = {
 nmpaSearch: deps.nmpaSearch,
 detectNmpaProduct: deps.detectNmpaProduct,
 tavilyApiKey: process.env.TAVILY_API_KEY,
 kb: deps.kb,
 agentId: session.agentId,
 sfKey: process.env.SILICONFLOW_API_KEY,
 bm25Retrieve: deps.bm25Retrieve,
 mergeRetrievalResults: deps.mergeRetrievalResults,
 rerankChunks: deps.rerankChunks,
 message: message
 };

 // 8. 执行支持 Function Calling 的流式对话
 let fullMessage = '';
 let searchResults = [];

 if (typeof activeProvider.chatStreamWithTools === 'function') {
 try {
 const stream1 = await activeProvider.chatStreamWithTools(enrichedSystemPrompt, session.messages, tools);
 
 let toolCallId = null;
 let toolCallName = null;
 let toolCallArgsBuf = '';
 let firstRoundContent = '';
 let firstRoundContentBuf = ''; // 缓冲区，等确认不是工具调用后再发送
 let hasToolCalls = false;
 let assistantMsg1 = null;

 // 第一轮对话（可能包含工具调用）
 for await (const parsed of deps.parseSSEStream(stream1)) {
 const choice = parsed.choices?.[0];
 if (!choice) continue;
 const delta = choice.delta || {};
 
 if (delta.content) {
 firstRoundContent += delta.content;
 // 如果已检测到 tool_calls，不发送 content（可能是 JSON 参数泄露）
 if (!hasToolCalls) {
 firstRoundContentBuf += delta.content;
 }
 }
 
 if (delta.tool_calls) {
 hasToolCalls = true;
 for (const tc of delta.tool_calls) {
 if (tc.id) toolCallId = tc.id;
 if (tc.function?.name) toolCallName = tc.function.name;
 if (tc.function?.arguments) toolCallArgsBuf += tc.function.arguments;
 }
 }
 
 if (choice.finish_reason === 'tool_calls') {
 assistantMsg1 = {
 role: 'assistant',
 content: firstRoundContent || null,
 tool_calls: [{ id: toolCallId, type: 'function', function: { name: toolCallName, arguments: toolCallArgsBuf } }]
 };
 }
 }

 // 如果没有工具调用，才把缓冲的内容发送给前端
 if (!hasToolCalls && firstRoundContentBuf) {
 streamer.sendDelta(firstRoundContentBuf);
 } else if (hasToolCalls && firstRoundContentBuf) {
 // 检查缓冲内容是否是 JSON（工具参数泄露），如果不是则发送
 const trimmed = firstRoundContentBuf.trim();
 const looksLikeJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
 if (!looksLikeJson) {
 streamer.sendDelta(firstRoundContentBuf);
 } else {
 console.log(`[Stream1] 拦截了疑似工具参数的 content 输出 (${trimmed.length} 字符)`);
 }
 }

 // 处理工具调用
 if (assistantMsg1 && toolCallName) {
 let toolArgs = {};
 try { toolArgs = JSON.parse(toolCallArgsBuf); } catch (e) {}
 
 streamer.sendToolCall(toolCallName, toolArgs);
 // 生成可读的工具步骤描述
 const toolStepNames = {
 'knowledge_search': '检索内部知识库',
 'nmpa_search': '查询国家药监局数据库',
 'web_search': '联网搜索最新信息',
 'query_med_db': '查询价格数据库',
 'skill_dispatch': `转接专家：${toolArgs.skill_id || ''}`
 };
 const toolStepText = toolStepNames[toolCallName] || `调用工具：${toolCallName}`;
 const stepId = streamer.sendStep(toolStepText, 'running');
 
 // 执行工具
 const toolResult = await toolRegistry.executeTool(toolCallName, toolArgs, toolContext);
 
 if (toolResult.searchResults && toolResult.searchResults.length > 0) {
 searchResults = searchResults.concat(toolResult.searchResults);
 streamer.sendSearch(toolResult.searchResults);
 }
 
 streamer.updateStep(stepId, toolStepText, 'done');

 // skill_dispatch 特殊处理：用专家的 skillPrompt 替换 system prompt
 let stream2SystemPrompt = enrichedSystemPrompt;
 if (toolResult.skillPrompt) {
 stream2SystemPrompt = toolResult.skillPrompt;
 console.log(`[SkillDispatch] 切换到专家: ${toolResult.skillDisplayName || toolCallName}`);
 // 发送专家切换事件给前端
 if (toolResult.toolEvent) {
 streamer.sendDelta('');
 }
 }

 // 发送“整合信息”步骤
 const integrateStepId = streamer.sendStep('整合信息，生成回答', 'running');

 // 第二轮对话（携带工具结果）
 // 将 tool/assistant(with tool_calls) 消息转换为普通消息，避免 DeepSeek 再次输出 tool_calls 标记
 const messagesForStream2 = [
 ...session.messages,
 { role: 'assistant', content: assistantMsg1.content || '（正在查询数据）' },
 { role: 'user', content: '工具查询结果：' + toolResult.text }
 ];

 // 使用不带工具的 chatStream，避免模型再次调用工具
 let stream2;
 console.log(`[Stream2] 开始第二轮对话, systemPrompt长度: ${stream2SystemPrompt.length}, messages数: ${messagesForStream2.length}`);
 try {
 if (typeof activeProvider.chatStream === 'function') {
 stream2 = await activeProvider.chatStream(stream2SystemPrompt, messagesForStream2);
 } else {
 stream2 = await activeProvider.chatStreamWithTools(stream2SystemPrompt, messagesForStream2, []);
 }
 console.log(`[Stream2] API 请求成功, stream类型: ${typeof stream2}`);
 } catch (stream2Err) {
 console.error(`[Stream2] API 请求失败:`, stream2Err.message);
 // 降级：直接输出工具结果摘要
 const fallbackMsg = toolResult.text || '抱歉，专家回复暂时不可用，请稍后重试。';
 fullMessage = fallbackMsg;
 streamer.sendDelta(fallbackMsg);
 stream2 = null;
 }
 if (stream2) {
 let stream2ChunkCount = 0;
 let integrateStepDone = false;
 for await (const parsed of deps.parseSSEStream(stream2)) {
 stream2ChunkCount++;
 let delta = parsed.choices?.[0]?.delta?.content || '';
 // 过滤 DeepSeek tool_calls 原生标记
 if (delta && delta.includes('tool')) {
 delta = delta.replace(/<\|tool[\u2581_].*?\|>/g, '').replace(/<｜tool[\u2581_].*?｜>/g, '');
 }
 if (delta) {
 // 第一个有内容的 delta 到达时，标记整合步骤完成
 if (!integrateStepDone) {
 streamer.updateStep(integrateStepId, '整合信息，生成回答', 'done');
 integrateStepDone = true;
 }
 fullMessage += delta;
 streamer.sendDelta(delta);
 }
 }
 // 如果 stream2 结束但整合步骤未完成（空响应），也标记完成
 if (!integrateStepDone) {
 streamer.updateStep(integrateStepId, '整合信息，生成回答', 'done');
 }
 console.log(`[Stream2] 完成, 共收到 ${stream2ChunkCount} 个chunk, 输出长度: ${fullMessage.length}`);
 // 降级：如果 stream2 返回了但没有任何内容，直接输出工具结果摘要
 if (!fullMessage.trim() && toolResult && toolResult.text) {
 console.warn('[Stream2] 空响应，降级输出工具结果');
 fullMessage = toolResult.text;
 streamer.sendDelta(toolResult.text);
 }
 }
 } else {
 fullMessage = firstRoundContent;
 }
 } catch (err) {
 console.error('[UnifiedStream] 工具调用流式处理失败:', err.message);
 // 降级处理
 fullMessage = await fallbackStream(activeProvider, enrichedSystemPrompt, session.messages, streamer, deps);
 }
 } else {
 // 不支持工具调用的 Provider，直接流式输出
 fullMessage = await fallbackStream(activeProvider, enrichedSystemPrompt, session.messages, streamer, deps);
 }

 // 9. 保存与记录
 session.messages.push({ role: 'assistant', content: fullMessage });
 try {
 stmtInsertMessage.run(sessionId, 'user', message);
 stmtInsertMessage.run(sessionId, 'assistant', fullMessage);
 stmtUpdateSessionTime.run(sessionId);
 } catch (dbErr) { console.error('DB error:', dbErr.message); }

 // 记录日志
 const logTs = new Date().toISOString();
 const logEntry = JSON.stringify({ ts: logTs, agent: session.agentId, agent_name: session.agentName, user_code: userCode, user_name: session.userName, user: message, assistant: fullMessage, feedback: null });
 fs.appendFile(path.join(DATA_DIR, 'conversations.jsonl'), logEntry + '\n', () => {});
 try { stmtInsertConvLog.run(logTs, 'chat', session.agentId, session.agentName, userCode, session.userName, message, fullMessage, null); } catch (e) { /* non-fatal */ }
 
 // 配额记录
 const estInputTokens = Math.ceil((message.length + (session.systemPrompt || '').length) / 4);
 const estOutputTokens = Math.ceil(fullMessage.length / 4);
 const providerName = isExpertMode ? 'SiliconFlow(Expert)' : (userProvider || deps.AI_PROVIDER);
 const chatApiType = (webSearch || isExpertMode) ? 'chat_with_search' : 'chat';
 
 recordTokenUsage(session.userCode, session.userName, session.agentId, providerName, '', estInputTokens, estOutputTokens, chatApiType);
 incrementDailyMsg(userCode);
 if (webSearch || (isExpertMode && searchResults.length > 0)) incrementMonthlySearch(userCode);

 streamer.sendDone();
 res.end();

 } catch (error) {
 console.error('[UnifiedStream] 路由错误:', error);
 try {
 if (!res.headersSent) {
 res.writeHead(500, { 'Content-Type': 'application/json' });
 res.end(JSON.stringify({ error: 'Stream failed', details: error.message }));
 } else {
 res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
 res.end();
 }
 } catch (e) { /* connection may be closed */ }
 }
}

/**
 * 降级流式处理（不使用工具）
 */
async function fallbackStream(provider, systemPrompt, messages, streamer, deps) {
 let fullMessage = '';
 // 如果 provider 没有 chatStream 方法，降级为非流式 chat
 if (typeof provider.chatStream !== 'function') {
 if (typeof provider.chat === 'function') {
 const result = await provider.chat(systemPrompt, messages);
 fullMessage = result.message || '';
 streamer.sendDelta(fullMessage);
 return fullMessage;
 }
 throw new Error('Provider does not support chatStream or chat');
 }
 const stream = await provider.chatStream(systemPrompt, messages);
 for await (const parsed of deps.parseSSEStream(stream)) {
 // 兼容 OpenAI 格式 (choices[0].delta.content) 和 Gemini/Gemma 格式 (candidates[0].content.parts[0].text)
 let delta = '';
 if (parsed.choices?.[0]?.delta?.content) {
 delta = parsed.choices[0].delta.content;
 } else if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
 delta = parsed.candidates[0].content.parts[0].text;
 }
 if (delta) {
 fullMessage += delta;
 streamer.sendDelta(delta);
 }
 }
 return fullMessage;
}

module.exports = {
 handleUnifiedChatStream
};
