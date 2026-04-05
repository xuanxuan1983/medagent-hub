// ===== MARKED.JS CONFIG =====
 function injectCodeCopyBtns(el) {
 el.querySelectorAll('pre').forEach(pre => {
 if (pre.querySelector('.code-copy-btn')) return;
 const btn = document.createElement('button');
 btn.className = 'code-copy-btn';
 btn.textContent = '复制';
 btn.title = '复制内容';
 btn.addEventListener('click', () => {
 const code = pre.querySelector('code');
 const text = code ? code.innerText : pre.innerText;
 navigator.clipboard.writeText(text).then(() => {
 btn.textContent = '已复制';
 btn.classList.add('copied');
 setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 1800);
 }).catch(() => {
 const ta = document.createElement('textarea');
 ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
 document.body.appendChild(ta); ta.select(); document.execCommand('copy');
 document.body.removeChild(ta);
 btn.textContent = '已复制'; btn.classList.add('copied');
 setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 1800);
 });
 });
 pre.appendChild(btn);
 });
 }

 // 表格包裹函数：给 bubble 内所有表格加上可横向滑动的容器
 function wrapTables(bubble) {
 bubble.querySelectorAll('table').forEach(table => {
 if (table.parentNode && !table.parentNode.classList.contains('table-wrapper')) {
 const wrapper = document.createElement('div');
 wrapper.className = 'table-wrapper';
 table.parentNode.insertBefore(wrapper, table);
 wrapper.appendChild(table);
 }
 });
 }
 function injectAgentLinks(bubble) {
 // 兜底处理：对未被 marked 扩展渲染的 agent-link 标签做替换
 bubble.querySelectorAll('agent-link').forEach(el => {
 const agentId = el.getAttribute('id');
 const text = el.textContent;
 const btn = document.createElement('button');
 btn.className = 'agent-link-btn';
 btn.textContent = text;
 btn.onclick = () => startChatFromDoudou(agentId);
 el.replaceWith(btn);
 });
 }


 if (typeof marked !== 'undefined') {
 marked.use({
 breaks: true, // \n 换行
 gfm: true, // GitHub Flavored Markdown
 pedantic: false,
 mangle: false,
 headerIds: false,
 hooks: {
 preprocess(src) {
 // 修复 **"文字"** 引号紧贴星号导致粗体解析失败的问题
 // 将 **"..."** 转为 "**...**"，将 *"..."* 转为 "*...*"
 src = src.replace(/\*\*"([^"]+)"\*\*/g, '"**$1**"');
 src = src.replace(/\*"([^"]+)"\*/g, '"*$1*"');
 src = src.replace(/\*\*'([^']+)'\*\*/g, "'**$1**'");
 src = src.replace(/\*'([^']+)'\*/g, "'*$1*'");
 return src;
 }
 }
 });
 }
 // 扩展 marked：1) 禁用删除线渲染 2) 解析 <agent-link> 标签为跳转按钮
 if (typeof marked !== 'undefined') {
 marked.use({
 renderer: {
 // 禁用删除线：~~text~~ 直接输出文本，不加删除线样式
 del(token) {
 return token.text;
 }
 },
 extensions: [
 {
 name: 'agentLink',
 level: 'inline',
 start(src) { return src.indexOf('<agent-link'); },
 tokenizer(src) {
 const rule = /^<agent-link\s+id="([^"]+)">([^<]+)<\/agent-link>/;
 const match = rule.exec(src);
 if (match) {
 return {
 type: 'agentLink',
 raw: match[0],
 agentId: match[1],
 text: match[2]
 };
 }
 },
 renderer(token) {
 return `<button class="agent-link-btn" onclick="startChatFromDoudou('${token.agentId}')">${token.text}</button>`;
 }
 }
 ]
 });
 }


 const API_BASE = '';
 let sessionId = null;
 let currentHistorySessionId = null;
 let currentAgentId = null;
 let messageIndex = 0;
 let currentView = 'desktop';
 let lastUserMsg = ''; // 记录最近一次用户消息，用于反馈学习

 const AGENT_GROUPS = [
 {
 label: '上游厂商',
 agents: [
 { id: 'gtm-strategist', icon: '', name: 'GTM战略大师', desc: '整合战略定位、循证背书、组品方案、价格控盘', category: '上游厂商' },
 { id: 'product-expert', icon: '', name: '产品材料专家', desc: '精通流变学、PACER模型、材料选择与机理拆解', category: '上游厂商' },
 { id: 'medical-liaison', icon: '', name: '学术推广专家', desc: '首席医学联络官，擅长KOL征服与学术叙事', category: '上游厂商' },
 { id: 'marketing-director', icon: '', name: '市场创意总监', desc: '整合新媒体、视觉创意、种草运营、科学视觉', category: '上游厂商' },
 { id: 'sales-director', icon: '', name: '销售作战总监', desc: '整合销售总监、大区经理、商务经理的超级销售Agent', category: '上游厂商' },
 { id: 'training-director', icon: '', name: '培训赋能总监', desc: 'ASK模型、反差教学、通关护照的培训专家', category: '上游厂商' },
 { id: 'operations-director', icon: '', name: '运营效能总监', desc: '整合SFE、财务、采购的综合运营Agent', category: '上游厂商' },
 { id: 'area-manager', icon: '', name: '大区经理', desc: 'Forecast分级测谎、进销存逻辑闭环、情境模拟辅导', category: '上游厂商' },
 { id: 'channel-manager', icon: '', name: '商务经理', desc: 'ROI利润精算、反向背调、窜货雷霆管控、库存博弈', category: '上游厂商' },
 { id: 'finance-bp', icon: '', name: '财务BP', desc: '税务合规与交易结构优化，货折替代票折保护利润', category: '上游厂商', hidden: true },
 { id: 'hrbp', icon: '', name: '战略HRBP', desc: '精准猎聘竞品人才，背调侦查与竞业攻防', category: '上游厂商', hidden: true },
 { id: 'procurement-manager', icon: '', name: '采购经理', desc: 'Kraljic矩阵与Should-Cost模型优化TCO', category: '上游厂商', hidden: true },
 ]
 },
 {
 label: '下游机构',
 agents: [
 // { id: 'neuro-aesthetic-architect', icon: '', name: '神经美学架构师', desc: '融合神经科学、皮肤病学与身心健康，从“修复结构”到“修复情感”', category: '下游机构' },
 { id: 'aesthetic-designer', icon: '', name: '高定美学设计总监', desc: '服务于Top 1%高净值人群的面部美学设计专家', category: '下游机构' },
 { id: 'senior-consultant', icon: '', name: '金牌医美咨询师', desc: '10年一线经验的销冠级咨询师，精通SPIN与三明治报价', category: '下游机构' },
 { id: 'sparring-partner', icon: '', name: '医美实战陪练机器人', desc: 'HP动态情绪系统，高压仿真话术训练', category: '下游机构' },
 { id: 'postop-specialist', icon: '', name: '医美术后私域管家', desc: '红绿灯风险分诊，将术后焦虑转化为复购信任', category: '下游机构' },
 { id: 'trend-setter', icon: '', name: '医美爆款种草官', desc: '三品一规合规专家，生成有传播力又不踩红线的内容', category: '下游机构' },
 { id: 'anatomy-architect', icon: '', name: '医美解剖决策建筑师', desc: 'PACER模型，面部建筑结构分析，安全预警', category: '下游机构' },
 { id: 'materials-mentor', icon: '', name: '医美材料学硬核导师', desc: '营销剥离，PACER深度拆解，灵魂拷问', category: '下游机构' },
 { id: 'material-architect', icon: '', name: '医美材料学架构师', desc: '6维评估模型，场景判别，合规底线，专业决策', category: '下游机构' },
 { id: 'visual-translator', icon: '', name: '医美视觉通译官', desc: '机理转视觉画面，设计师Brief，3D渲染指导', category: '下游机构' },
 ]
 },
 {
 label: '其他',
 agents: [
 { id: 'new-media-director', icon: '', name: '医美合规内容专家', desc: '三品一规审查、合规替换词库、平台规则适配、合规种草框架', category: '其他' },
 { id: 'kv-design-director', icon: '', name: '视觉KV设计总监', desc: '电商海报提示词生成，10张KV系统，支持产品图识别、风格选择、中英双语排版', category: '其他' },
 { id: 'meta-prompt-architect', icon: '', name: '元提示词架构师', desc: '精英提示工程师，提取用户意图构建情境感知的高效提示词，输出可复用的模块化提示词模板', category: '其他' },
 { id: 'prompt-engineer-pro', icon: '', name: '高级Prompt工程师', desc: '基于CRISPE框架深度优化提示词，将普通提示词转化为结构化专业提示词，提供3-5条改进建议', category: '其他' },
 { id: 'first-principles-analyst', icon: '', name: '第一性原理深度剖析专家', desc: '冷酷理性的深度分析引擎，基于物理学思维拆解复杂问题，从底层逻辑重构颠覆性解决方案', category: '其他' },
 ]
 },
 {
 label: '内容创作',
 agents: [
 { id: 'xhs-content-creator', icon: '', name: '小红书图文创作顾问', desc: '9种风格×6种布局，将医美内容转化为高传播力的小红书图文系列', category: '内容创作' },
 { id: 'ppt-creator', icon: '', name: 'PPT创作顾问', desc: '7种视觉风格，将医美内容自动转化为结构化PPT大纲和每页详细文案', category: '内容创作' },
 { id: 'wechat-content-creator', icon: '', name: '微信公众号运营顾问', desc: '图文推送+深度文章，医美机构公众号内容策划与创作，兼顾合规与传播', category: '内容创作' },
 { id: 'comic-creator', icon: '', name: '知识漫画创作顾问', desc: '8种漫画风格，将医美知识转化为生动有趣的知识漫画脚本和分镜', category: '内容创作' },
 { id: 'article-illustrator', icon: '', name: '文章配图顾问', desc: '智能分析文章结构，识别配图位置，生成8种风格的AI绘图提示词', category: '内容创作' },
 { id: 'cover-image-creator', icon: '', name: '封面图创作顾问', desc: '8种封面风格，为医美文章和推文生成精美封面图方案和AI绘图提示词', category: '内容创作' },
 { id: 'social-media-creator', icon: '', name: '社交媒体运营顾问', desc: '多平台内容策略，小红书/抖音/微博/X差异化内容创作与运营规划', category: '内容创作' },
 { id: 'personal-ip-builder', icon: '', name: '个人IP打造指南', desc: '从IP定位、内容策略、视觉系统到变现路径，帮助创始人和独立顾问构建高价值个人品牌', category: '内容创作' },
 { id: 'personal-brand-cinematic', icon: '', name: '电影感品牌视觉顾问', desc: '结合电影摄影技术与个人品牌定位，为医美创始人打造高识别度的视觉形象和拍摄方案', category: '内容创作' },
 { id: 'super-writer', icon: '', name: '超级写作助手', desc: '集选题、写稿、验收、发布于一体的知识类视频内容工厂，内置10个专业写作模块，实现工业化内容生产', category: '内容创作' },
 ]
 },
 {
 label: '_hidden',
 hidden: true,
 agents: [
 { id: 'doudou', icon: '', name: '豆子', desc: '上游厂家专属搭档，整合 GTM、产品策略、学术推广等 12 个专家能力', category: '_hidden' },
 { id: 'douding', icon: '', name: '豆丁', desc: '机构端口专属搭档，整合咨询话术、运营、术后管理等 9 个专家能力', category: '_hidden' },
 { id: 'douya', icon: '', name: '豆芽', desc: '个人 IP 打造与内容创作操盘手，网感极佳的爆款制造机', category: '_hidden' },
 ]
 }
 ];

 // 根据用户角色获取默认 Agent
 // login.html 存储的角色值: upstream / downstream / other
 function getDefaultAgentByRole() {
 const role = localStorage.getItem('medagent_role') || '';
 const roleMap = {
 'upstream': 'sales-director', // 上游厂商 → 销售作战总监
 'downstream': 'senior-consultant', // 下游机构 → 金牌医美咨询师
 'other': 'senior-consultant', // 其他 → 金牌医美咨询师
 };
 return roleMap[role] || 'senior-consultant';
 }

 const PROVIDERS_MODELS = {
 openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
 anthropic: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
 gemini: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
 gemma4: ['gemma-4-31b-it', 'gemma-4-27b-a4b-it', 'gemma-4-e4b-it'],
 deepseek: ['deepseek-chat', 'deepseek-reasoner'],
 siliconflow: ['deepseek-ai/DeepSeek-V3', 'Pro/deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct'],
 kimi: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
 qwen: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
 };

 // ===== INIT =====
 let currentUserName = '';
 let currentUserPlan = '免费版';
 let currentIsPro = false;
 let currentIsProPlus = false;
 // 内测期间免费开放的21个医美专属Agent
 const TRIAL_AGENTS = new Set([
 'gtm-strategy','product-expert','academic-liaison','marketing-director',
 'sales-director','operations-director','training-director','area-manager',
 'channel-manager',
 'aesthetic-design','senior-consultant','sparring-robot','post-op-guardian',
 'trend-setter','anatomy-architect','materials-mentor','material-architect','visual-translator',
 'new-media-director','kv-design-director','finance-bp'
 ]);
 // 内容创作类Agent（需要Pro或反馈解锁）
 const CONTENT_AGENTS = new Set([
 'xhs-content-creator','ppt-creator','wechat-content-creator',
 'comic-creator','article-illustrator','cover-image-creator','social-media-creator',
 'personal-ip-builder','personal-brand-cinematic',
 'hrbp','procurement-manager',
 'super-writer'
 ]);
 // 全部可用Agent（Pro+）
 const PRO_AGENTS = new Set([...TRIAL_AGENTS, ...CONTENT_AGENTS]);
 // 仅管理员可见的 Agent（非管理员完全不显示）
 const ADMIN_ONLY_AGENTS = new Set(['meta-prompt-architect', 'prompt-engineer-pro', 'first-principles-analyst']);
 let currentIsAdmin = false;
 let currentBetaUnlock = false; // 内测反馈解锁状态

 function init() {
 // 初始化每日随机 mascot
 (function() {
 const identity = localStorage.getItem('medagent_identity') || '';
 const agentId = identity === 'clinic' ? 'douding' : 'doudou';
 const dailyImg = getAgentDefaultImg(agentId);
 if (dailyImg) {
 const desktopImg = document.getElementById('desktopMascotImg');
 if (desktopImg) desktopImg.src = dailyImg;
 }
 })();
 buildStore();
 loadUserInfo();
 loadSidebarHistory();

 const params = new URLSearchParams(window.location.search);
 const agentParam = params.get('agent');
 if (agentParam) {
 startChat(agentParam);
 }

 const s = loadSettings();
 document.getElementById('settingsProvider').value = s.provider;
 document.getElementById('settingsApiKey').value = s.apiKey;
 onProviderChange();
 document.getElementById('settingsModel').value = s.model;
 updateModelLabel();
 }

 async function loadUserInfo() {
 try {
 const res = await fetch('/api/auth/me');
 if (!res.ok) return;
 const data = await res.json();
 const name = data.name || data.phone || data.code || '用户';
 currentUserName = name;
 if (data.plan === 'lifetime') currentUserPlan = '全能版 Pro+ 终身';
 else if (data.plan === 'pro_plus') currentUserPlan = '全能版 Pro+';
 else if (data.plan === 'pro') currentUserPlan = '专业版 Pro';
 else if (data.plan === 'admin') currentUserPlan = '管理员';
 else currentUserPlan = '免费版';
 currentIsPro = data.isPro || data.planStatus?.isPro || data.plan === 'admin';
 currentIsProPlus = data.isProPlus || data.planStatus?.isProPlus || data.plan === 'admin';
 currentIsAdmin = data.plan === 'admin';
 currentBetaUnlock = data.betaUnlock === true;
 // 管理员显示隐藏 Agent 标签
 const btnHidden = document.getElementById('btnFilterHidden');
 if (btnHidden) btnHidden.style.display = currentIsAdmin ? '' : 'none';
 // 管理员专属入口区域
 const adminEntry = document.getElementById('adminEntrySection');
 if (adminEntry) adminEntry.style.display = currentIsAdmin ? '' : 'none';
 // 更新反馈标签状态
 updateFeedbackTabState();
 buildStore(); // 重新渲染 Agent 列表，使锁定状态生效

 // Update sidebar user info
 const avatar = name.charAt(0).toUpperCase();
 document.getElementById('userAvatar').textContent = avatar;
 document.getElementById('userName').textContent = name;
 document.querySelector('.sidebar-user-plan').textContent = currentUserPlan;
 document.getElementById('infoUser').textContent = name;

 // Update greeting with user name
 setGreeting(name);

 // Update invite code and invite link (use referral code, not login code)
 const refCode = data.referralCode || data.code;
 if (refCode) {
 document.getElementById('inviteCode').value = refCode;
 const inviteUrl = window.location.origin + '/login.html?code=' + encodeURIComponent(refCode);
 document.getElementById('inviteLink').value = inviteUrl;
 }
 // Update referral stats
 if (data.referralStats) {
 document.getElementById('inviteCount').textContent = data.referralStats.inviteCount || 0;
 const credit = data.referralStats.totalCredit || 0;
 const paidCredit = data.referralStats.paidCredit || 0;
 const pendingCredit = credit - paidCredit;
 document.getElementById('totalCredit').textContent = '\u00a5' + paidCredit;
 let creditSubText = '\u4e0a\u9650 \u00a5' + (data.referralStats.maxCredit || 300).toLocaleString();
 if (pendingCredit > 0) creditSubText = '\u5f85\u5230\u8d26 \u00a5' + pendingCredit;
 document.getElementById('creditMax').textContent = creditSubText;
 }
 if (data.adminWechat) {
 document.getElementById('adminWechatDisplay').textContent = data.adminWechat;
 }
 } catch(e) {
 setGreeting();
 }
 }

 function setGreeting(name) {
 const h = new Date().getHours();
 let g = '你好';
 if (h >= 5 && h < 12) g = '早上好';
 else if (h >= 12 && h < 14) g = '中午好';
 else if (h >= 14 && h < 18) g = '下午好';
 else g = '晚上好';
 const greeting = name ? g + '，' + name : g + '！';
 document.getElementById('desktopGreeting').textContent = greeting;
 }

 async function loadGuidedQuestions(agentId) {
 const container = document.getElementById('guidedQuestions');
 container.innerHTML = ''; // Clear previous questions
 if (!agentId || agentId === 'meiling') return;

 try {
 const response = await fetch(`/skills/${agentId}.md`);
 if (!response.ok) return;
 const mdContent = await response.text();
 
 // Try new OutputFormat style first (code block with --- separator)
 let questions = null;
 const newStyleMatch = mdContent.match(/```\s*\n---\s*\n((?:- [^\n]+\n?)+)```/);
 if (newStyleMatch && newStyleMatch[1]) {
 questions = newStyleMatch[1].trim().split('\n').map(q => q.substring(2).trim()).filter(q => q);
 } else {
 // Fall back to old style: **引导性问题示例**
 const questionsMatch = mdContent.match(/\*\*引导性问题示例\*\*\s*\n((?:- .*\n?)+)/);
 if (questionsMatch && questionsMatch[1]) {
 questions = questionsMatch[1].trim().split('\n').map(q => q.substring(2).trim()).filter(q => q);
 }
 }
 if (questions && questions.length > 0) {
 questions.forEach(q => {
 const btn = document.createElement('button');
 btn.className = 'guided-question-btn';
 btn.textContent = q;
 btn.onclick = () => {
 const chatInput = document.getElementById('messageInput');
 chatInput.value = q;
 chatInput.focus();
 sendMessage();
 };
 container.appendChild(btn);
 });
 }
 } catch (e) {
 console.error('Error loading guided questions:', e);
 }
 }

 function buildSidebar() {
 const container = document.getElementById('agentGroupsSection');
 if (!container) return;
 container.innerHTML = '';
 AGENT_GROUPS.forEach(group => {
 if (group.hidden) return; // 跳过隐藏分组（如豆豆）
 const label = document.createElement('div');
 label.className = 'sidebar-group-label';
 label.textContent = group.label;
 container.appendChild(label);
 group.agents.forEach(agent => {
 // 管理员专属Agent：非管理员完全不显示
 if (ADMIN_ONLY_AGENTS.has(agent.id) && !currentIsAdmin) return;
 const a = document.createElement('a');
 a.className = 'sidebar-agent' + (agent.id === currentAgentId ? ' active' : '');
 a.href = 'javascript:void(0)';
 a.dataset.agentId = agent.id;
 a.innerHTML = `<div class="sidebar-agent-dot"></div><span class="sidebar-agent-name">${agent.name}</span>`;
 a.onclick = () => startChat(agent.id);
 container.appendChild(a);
 });
 });
 }

 // ===== SIDEBAR HISTORY & FAVORITES =====
 let sidebarSessions = [];
 let favorites = JSON.parse(localStorage.getItem('ma_favorites') || '[]');

 async function loadSidebarHistory() {
 buildSidebar();
 try {
 const res = await fetch('/api/chat/sessions');
 if (!res.ok) throw new Error();
 const data = await res.json();
 sidebarSessions = data.sessions || [];
 renderSidebarHistory();
 } catch(e) {
 document.getElementById('sidebarHistList').innerHTML =
 '<div style="padding:0.25rem 0.625rem 0.5rem;font-size:0.75rem;color:var(--text-3)">暂无历史对话</div>';
 }
 }

 function renderSidebarHistory() {
 const favList = document.getElementById('favList');
 const histList = document.getElementById('sidebarHistList');

    function getAgentIcon(agentId) {
      for (const g of AGENT_GROUPS) {
        const a = g.agents.find(x => x.id === agentId);
        if (a) return a.name ? a.name.charAt(0) : '';
      }
      return '';
    }

 // Render favorites
 const favSessions = sidebarSessions.filter(s => favorites.includes(s.id));
 if (favSessions.length === 0) {
 favList.innerHTML = '<div style="padding:0.25rem 0.625rem 0.5rem;font-size:0.75rem;color:var(--text-3)">暂无收藏对话</div>';
 } else {
 favList.innerHTML = '';
 favSessions.forEach(s => {
 const btn = document.createElement('button');
 btn.className = 'sidebar-history-item';
 btn.innerHTML = `<span class="sidebar-history-item-icon">${getAgentIcon(s.agentId)}</span><span class="sidebar-history-item-text">${s.preview || s.agentName || s.agentId}</span><span class="sidebar-history-item-star">★</span>`;
 btn.onclick = () => loadHistorySession(s.id, s.agentId);
 favList.appendChild(btn);
 });
 }

 // Render history (latest 8)
 const recent = sidebarSessions.slice(0, 8);
 if (recent.length === 0) {
 histList.innerHTML = '<div style="padding:0.25rem 0.625rem 0.5rem;font-size:0.75rem;color:var(--text-3)">暂无历史对话</div>';
 } else {
 histList.innerHTML = '';
 recent.forEach(s => {
 const isFav = favorites.includes(s.id);
 const btn = document.createElement('button');
 btn.className = 'sidebar-history-item';
 btn.dataset.sessionId = s.id;
 btn.innerHTML = `
 <span class="sidebar-history-item-icon">${getAgentIcon(s.agentId)}</span>
 <span class="sidebar-history-item-text">${s.preview || s.agentName || s.agentId}</span>
 <span class="sidebar-history-item-star" style="opacity:${isFav?1:0.25};cursor:pointer" title="${isFav?'取消收藏':'添加收藏'}" onclick="event.stopPropagation();toggleFavorite('${s.id}')">${isFav?'★':'☆'}</span>`;
 btn.onclick = () => loadHistorySession(s.id, s.agentId);
 histList.appendChild(btn);
 });
 }
 }

 function toggleFavorite(sessionId) {
 const idx = favorites.indexOf(sessionId);
 if (idx >= 0) favorites.splice(idx, 1);
 else favorites.push(sessionId);
 localStorage.setItem('ma_favorites', JSON.stringify(favorites));
 renderSidebarHistory();
 }

 function toggleSection(type) {
 const section = document.getElementById(type === 'fav' ? 'favSection' : 'histSection');
 const btn = document.getElementById(type === 'fav' ? 'favCollapseBtn' : 'histCollapseBtn');
 const isHidden = section.style.display === 'none';
 section.style.display = isHidden ? '' : 'none';
 if (btn) btn.classList.toggle('collapsed', !isHidden);
 }

 function buildStore(filter) {
 const grid = document.getElementById('storeGrid');
 grid.innerHTML = '';
 AGENT_GROUPS.forEach(group => {
 if (group.hidden) return; // 跳过隐藏分组（如豆豆）
 group.agents.forEach(agent => {
 // 隐藏的 Agent：非管理员不显示
 if (agent.hidden && !currentIsAdmin) return;
 // 管理员专属 Agent：非管理员完全不显示
 if (ADMIN_ONLY_AGENTS.has(agent.id) && !currentIsAdmin) return;
 // 筛选逻辑
 if (filter === 'hidden') {
 if (!agent.hidden) return; // 隐藏分类只显示 hidden:true 的
 } else if (filter && filter !== 'all') {
 if (agent.category !== filter || agent.hidden) return; // 其他分类不显示隐藏的
 } else {
 if (agent.hidden) return; // 全部分类不显示隐藏的
 }
 // 判断锁定状态（内测期间权益体系）
 const isMedAgent = TRIAL_AGENTS.has(agent.id);
 const isContentAgent = CONTENT_AGENTS.has(agent.id);
 let isLocked = false;
 let lockLabel = '';
 let lockHint = '';
 if (isMedAgent) {
 // 21个医美Agent：内测期间免费开放
 isLocked = false;
 } else if (isContentAgent) {
 // 内容创作类Agent：需要Pro或反馈解锁
 isLocked = !currentIsPro && !currentBetaUnlock;
 lockLabel = '反馈解锁';
 lockHint = 'showFeedbackHint';
 }
 const card = document.createElement('div');
 card.className = 'store-card' + (isLocked ? ' store-card-locked' : '');
 card.innerHTML = `
 <span class="store-card-icon"><img src="${getAgentDefaultImg(agent.id) || IP_IMAGES.douzai.default}" alt="${agent.name}" style="object-fit:contain"></span>
 <div class="store-card-name">${agent.name}${isLocked ? ` <span class="pro-badge" style="background:#f59e0b;color:white">反馈解锁</span>` : ''}</div>
 <div class="store-card-desc">${agent.desc}</div>
 <span class="store-card-tag">${agent.category}</span>
 ${isLocked
 ? `<button class="store-card-use store-card-locked-btn" onclick="showFeedbackHint()">反馈解锁</button>`
 : `<button class="store-card-use" onclick="startChat('${agent.id}')">\u4f7f\u7528</button>`
 }`;
 grid.appendChild(card);
 });
 });
 }

 function showUpgradeHint() {
 openSettings('pricing');
 }
 function showUpgradeProPlusHint() {
 openSettings('pricing');
 }
 function showFeedbackHint() {
 openSettings('feedback');
 }

 // 更新反馈标签状态
 function updateFeedbackTabState() {
 const banner = document.getElementById('feedbackUnlockedBanner');
 const formArea = document.getElementById('feedbackFormArea');
 const tab = document.getElementById('tab-feedback');
 if (currentBetaUnlock || currentIsPro) {
 if (banner) banner.style.display = 'block';
 if (formArea) formArea.style.display = 'none';
 if (tab) tab.style.color = '#15803d';
 } else {
 if (banner) banner.style.display = 'none';
 if (formArea) formArea.style.display = 'block';
 }
 }

 // 提交内测反馈
 async function submitBetaFeedback() {
 const content = document.getElementById('feedbackContent').value.trim();
 const contact = document.getElementById('feedbackContact').value.trim();
 const category = document.getElementById('feedbackCategory').value;
 const btn = document.getElementById('btnSubmitFeedback');
 const msgEl = document.getElementById('feedbackSubmitMsg');

 if (!content || content.length < 20) {
 msgEl.style.display = 'block';
 msgEl.style.color = '#dc2626';
 msgEl.textContent = '请至少输入 20 个字的建议内容';
 return;
 }

 btn.disabled = true;
 btn.textContent = '提交中...';
 msgEl.style.display = 'none';

 try {
 const res = await fetch('/api/beta-feedback', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ content, contact, category })
 });
 const data = await res.json();
 if (data.ok) {
 currentBetaUnlock = true;
 updateFeedbackTabState();
 buildStore(); // 重新渲染，解锁内容创作类 Agent
 msgEl.style.display = 'block';
 msgEl.style.color = '#15803d';
 msgEl.textContent = data.message || '解锁成功！';
 btn.textContent = '已提交';
 } else {
 throw new Error(data.error || '提交失败');
 }
 } catch (e) {
 btn.disabled = false;
 btn.textContent = '提交反馈，解锁内容创作工具';
 msgEl.style.display = 'block';
 msgEl.style.color = '#dc2626';
 msgEl.textContent = e.message;
 }
 }

 function filterStore(btn, cat) {
 document.querySelectorAll('.store-filter-btn').forEach(b => b.classList.remove('active'));
 btn.classList.add('active');
 buildStore(cat === 'all' ? null : cat);
 }

 // ===== VIEW SWITCHING =====
 function switchView(view) {
 currentView = view;
 document.getElementById('desktopView').classList.toggle('active', view === 'desktop');
 document.getElementById('storeView').classList.toggle('active', view === 'store');
 document.getElementById('chatView').classList.toggle('active', view === 'chat');
 document.getElementById('navDesktop').classList.toggle('active', view === 'desktop');
 document.getElementById('navStore').classList.toggle('active', view === 'store');
 }

 function quickStart(agentId) {
 const q = document.getElementById('desktopInput').value.trim();
 startChat(agentId, q);
 }

 async function desktopSend() {
 const q = document.getElementById('desktopInput').value.trim();
 if (!q) return;
 // Desktop home always uses doudou as the entry agent
 await startChat('doudou', q);
 }

 function desktopKeydown(e) {
 if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); desktopSend(); }
 }

 // ===== CHAT =====
 /**
 * 从豆豆对话跳转到专家 Agent 时，自动提取用户意图作为上下文透传
 * 仅当当前 Agent 是豆豆时才提取上下文，其他情况直接调用 startChat
 */
 function startChatFromDoudou(agentId) {
 let doudouContext = null;
 if (currentAgentId === 'doudou') {
 // 提取豆豆对话中最近一条用户消息（最多200字）
 const userBubbles = document.querySelectorAll('#chatMessages .msg-row.user .msg-bubble');
 if (userBubbles.length > 0) {
 const lastUserBubble = userBubbles[userBubbles.length - 1];
 doudouContext = (lastUserBubble.textContent || '').trim().substring(0, 200);
 }
 // 如果没有用户消息，尝试用 lastUserMsg 变量
 if (!doudouContext && lastUserMsg) {
 doudouContext = lastUserMsg.trim().substring(0, 200);
 }
 }
 startChat(agentId, null, doudouContext);
 }
 async function startChat(agentId, initialMsg, doudouContext) {
 loadGuidedQuestions(agentId);
 currentAgentId = agentId;
 switchView('chat');

 // Update sidebar active state
 document.querySelectorAll('.sidebar-agent').forEach(el => {
 el.classList.toggle('active', el.dataset.agentId === agentId);
 });

 // Find agent
 let agent = null;
 AGENT_GROUPS.forEach(g => { const a = g.agents.find(x => x.id === agentId); if (a) agent = a; });
 if (!agent) { showError('无效的助手ID'); return; }

 // Reset chat
 document.getElementById('chatMessages').innerHTML = `
 <div class="welcome-wrap" id="welcomeWrap">
 <div class="welcome-mascot"><img src="${getAgentDefaultImg(agentId) || IP_IMAGES.douzai.default}" alt="${agent.name}" id="welcomeMascotImg" style="object-fit:contain"></div>
 <div class="welcome-title" id="welcomeTitle">${agent.name}</div>
 <div class="welcome-sub" id="welcomeSub">${agent.desc}</div>
 </div>`;
 sessionId = null;
 currentHistorySessionId = null;
 messageIndex = 0;

 document.title = agent.name + ' - MedAgent Hub';
 const topbarAvatarEl = document.getElementById('topbarAvatar');
 // 统一品牌 IP：所有 Agent 使用豆子头像
 const _dailyImg = getAgentDefaultImg(agentId) || IP_IMAGES.douzai.default;
 topbarAvatarEl.innerHTML = `<img src="${_dailyImg}" alt="${agent.name}" style="object-fit:contain">`;
 document.getElementById('topbarName').textContent = agent.name;
 document.getElementById('topbarDesc').textContent = agent.desc;
 document.getElementById('chatStatus').style.display = 'none';
 document.getElementById('messageInput').disabled = true;
 document.getElementById('sendBtn').disabled = true;
 document.getElementById('chatInputHint').textContent = '初始化中...';
 renderComboTags(agentId);

 try {
 const res = await fetch('/api/chat/init', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ agentId, doudouContext: doudouContext || null })
 });
 if (!res.ok) throw new Error('init failed');
 const data = await res.json();
 sessionId = data.sessionId;
 document.getElementById('chatStatus').style.display = 'flex';
 document.getElementById('messageInput').disabled = false;
 document.getElementById('sendBtn').disabled = false;
 document.getElementById('uploadBtn').disabled = false;
 if (document.getElementById('micBtn')) document.getElementById('micBtn').disabled = false;
 document.getElementById('chatInputHint').textContent = 'Enter 发送，Shift+Enter 换行';
 document.getElementById('messageInput').focus();

 if (initialMsg) {
 document.getElementById('messageInput').value = initialMsg;
 await sendMessage();
 }
 } catch(e) {
 showError('无法连接到服务器，请刷新重试');
 }
 }

 // ===== FILE UPLOAD =====
 let pendingFile = null; // { name, size, content, type }

 function getFileIcon(name, returnSvg) {
 const ext = name.split('.').pop().toLowerCase();
 // Legacy text labels for backward compatibility
 const icons = { pdf: 'PDF', doc: 'DOC', docx: 'DOC', xls: 'XLS', xlsx: 'XLS', txt: 'TXT', csv: 'CSV', md: 'MD', png: 'IMG', jpg: 'IMG', jpeg: 'IMG', gif: 'IMG', webp: 'IMG', bmp: 'IMG' };
 if (!returnSvg) return icons[ext] || 'FILE';
 // SVG icons with CSS class for colored backgrounds
 const svgDoc = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
 const svgSheet = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h18"/></svg>';
 const svgImg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
 const typeMap = {
 pdf: { cls: 'pdf', svg: svgDoc },
 doc: { cls: 'doc', svg: svgDoc }, docx: { cls: 'doc', svg: svgDoc },
 xls: { cls: 'xls', svg: svgSheet }, xlsx: { cls: 'xls', svg: svgSheet }, csv: { cls: 'xls', svg: svgSheet },
 md: { cls: 'md', svg: svgDoc }, txt: { cls: 'md', svg: svgDoc },
 png: { cls: 'img', svg: svgImg }, jpg: { cls: 'img', svg: svgImg }, jpeg: { cls: 'img', svg: svgImg }, gif: { cls: 'img', svg: svgImg }, webp: { cls: 'img', svg: svgImg }, bmp: { cls: 'img', svg: svgImg }
 };
 const t = typeMap[ext] || { cls: 'md', svg: svgDoc };
 return { cls: t.cls, svg: t.svg };
 }

 function formatFileSize(bytes) {
 if (bytes < 1024) return bytes + 'B';
 if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
 return (bytes / 1024 / 1024).toFixed(1) + 'MB';
 }

 async function handleFileSelect(event) {
 const file = event.target.files[0];
 if (!file) return;
 event.target.value = ''; // reset so same file can be re-selected

 const previewArea = document.getElementById('filePreviewArea');
 previewArea.style.display = 'block';
 previewArea.innerHTML = `
 <div class="file-preview-card file-uploading">
 <span class="file-preview-icon">${getFileIcon(file.name)}</span>
 <span class="file-preview-name">${file.name}</span>
 <span class="file-preview-size">上传中...</span>
 </div>`;

 try {
 const formData = new FormData();
 formData.append('file', file);
 if (sessionId) formData.append('sessionId', sessionId);

 const res = await fetch('/api/upload', { method: 'POST', body: formData });
 if (!res.ok) throw new Error('上传失败');
 const data = await res.json();

 // Store object URL for image preview in chat bubble
 const isImage = file.type.startsWith('image/');
 const objectUrl = isImage ? URL.createObjectURL(file) : null;
 pendingFile = { name: file.name, size: file.size, content: data.extractedContent, type: data.contentType, isImage, objectUrl };
 // 同步到资源面板
 addFileToResourcePanel({ name: file.name, size: file.size, content: data.extractedContent, contentType: data.contentType });

 // If image, show thumbnail in preview area
 if (isImage && objectUrl) {
 previewArea.innerHTML = `
 <div class="file-preview-card" style="flex-direction:column;align-items:flex-start;gap:0.4rem;padding:0.5rem">
 <img src="${objectUrl}" alt="${file.name}" style="max-height:120px;max-width:240px;border-radius:6px;object-fit:cover;display:block">
 <div style="display:flex;align-items:center;gap:0.4rem;width:100%">
 <span class="file-preview-name" style="font-size:0.75rem">${file.name}</span>
 <span class="file-preview-size">${formatFileSize(file.size)}</span>
 <button class="file-preview-remove" onclick="removePendingFile()" title="移除"></button>
 </div>
 </div>`;
 } else {
 previewArea.innerHTML = `
 <div class="file-preview-card">
 <span class="file-preview-icon">${getFileIcon(file.name)}</span>
 <span class="file-preview-name">${file.name}</span>
 <span class="file-preview-size">${formatFileSize(file.size)}</span>
 <button class="file-preview-remove" onclick="removePendingFile()" title="移除"></button>
 </div>`;
 }

 // (image preview handled above)

 document.getElementById('messageInput').placeholder = '对文件提问，或直接发送让 AI 分析...';
 document.getElementById('messageInput').focus();
 } catch (e) {
 previewArea.style.display = 'none';
 pendingFile = null;
 alert('文件上传失败：' + e.message);
 }
 }

 function removePendingFile() {
 pendingFile = null;
 const previewArea = document.getElementById('filePreviewArea');
 previewArea.style.display = 'none';
 previewArea.innerHTML = '';
 document.getElementById('messageInput').placeholder = '输入您的问题... (Enter 发送，Shift+Enter 换行)';
 }


 // ===== RESOURCE PANEL =====
 let resourcePanelOpen = false;
 let resourceFiles = [];

 function toggleResourcePanel() {
 resourcePanelOpen = !resourcePanelOpen;
 const panel = document.getElementById('resourcePanel');
 const btn = document.getElementById('resourcePanelBtn');
 if (resourcePanelOpen) {
 panel.classList.remove('collapsed');
 btn.classList.add('active');
 } else {
 panel.classList.add('collapsed');
 btn.classList.remove('active');
 }
 }

 function addFileToResourcePanel(fileInfo) {
 const exists = resourceFiles.find(f => f.name === fileInfo.name);
 if (exists) return;
 fileInfo.timestamp = fileInfo.timestamp || Date.now();
 resourceFiles.push(fileInfo);
 // Reload from server to get DB id and folder info
 if (typeof loadPersistentFiles === 'function') {
 loadPersistentFiles();
 } else {
 renderResourceFileList();
 }
 if (!resourcePanelOpen) toggleResourcePanel();
 }

 function renderResourceFileList() {
 const container = document.getElementById('resourceFileList');
 if (!resourceFiles.length) {
 container.innerHTML = '<div class="resource-empty"><div class="resource-empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div><div class="resource-empty-title">暂无上传文件</div><div class="resource-empty-desc">上传文件后可在此快速引用</div></div>';
 return;
 }
 // Sort by timestamp descending (newest first)
 const sorted = resourceFiles.map((f, idx) => ({ ...f, _idx: idx })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
 // Group by time period
 const now = new Date();
 const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
 const yesterdayStart = todayStart - 86400000;
 const weekStart = todayStart - (now.getDay() || 7) * 86400000;
 const groups = { today: [], yesterday: [], week: [], earlier: [] };
 sorted.forEach(f => {
 const ts = f.timestamp || 0;
 if (ts >= todayStart) groups.today.push(f);
 else if (ts >= yesterdayStart) groups.yesterday.push(f);
 else if (ts >= weekStart) groups.week.push(f);
 else groups.earlier.push(f);
 });
 const labels = { today: '今天', yesterday: '昨天', week: '本周', earlier: '更早' };
 let html = '';
 Object.keys(groups).forEach(key => {
 if (!groups[key].length) return;
 html += '<div class="file-group-label">' + labels[key] + '</div>';
 groups[key].forEach(f => {
 const icon = getFileIcon(f.name, true);
 const meta = formatFileTimeMeta(f.timestamp, todayStart, yesterdayStart);
 html += '<div class="file-item" draggable="true" ondragstart="onResourceItemDragStart(event,' + f._idx + ')" onclick="previewResourceFile(' + f._idx + ')" oncontextmenu="showFileContextMenu(event,' + f._idx + ')">' 
 + '<div class="file-icon ' + icon.cls + '">' + icon.svg + '</div>'
 + '<span class="file-name" title="' + f.name + '">' + f.name + '</span>'
 + '<span class="file-meta">' + meta + '</span>'
 + '</div>';
 });
 });
 container.innerHTML = html;
 }

 function formatFileTimeMeta(ts, todayStart, yesterdayStart) {
 if (!ts) return '';
 const d = new Date(ts);
 if (ts >= todayStart) {
 const diffMin = Math.floor((Date.now() - ts) / 60000);
 if (diffMin < 1) return '刚刚';
 if (diffMin < 60) return diffMin + '分钟前';
 return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
 }
 if (ts >= yesterdayStart) return '昨天';
 const weekDays = ['周日','周一','周二','周三','周四','周五','周六'];
 return weekDays[d.getDay()];
 }

 // ===== FILE CONTEXT MENU =====
 function showFileContextMenu(event, idx) {
 event.preventDefault();
 event.stopPropagation();
 // Remove existing menu
 const old = document.getElementById('fileContextMenu');
 if (old) old.remove();
 const f = resourceFiles[idx];
 if (!f) return;
 const menu = document.createElement('div');
 menu.id = 'fileContextMenu';
 menu.className = 'file-context-menu';
 menu.innerHTML = '<div class="file-ctx-item" onclick="previewResourceFile(' + idx + ');closeFileContextMenu()">'
 + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
 + ' \u9884\u89c8</div>'
 + '<div class="file-ctx-item" onclick="citeFileInInput(' + idx + ');closeFileContextMenu()">'
 + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>'
 + ' \u5f15\u7528</div>'
 + '<div class="file-ctx-divider"></div>'
 + '<div class="file-ctx-item file-ctx-danger" onclick="deleteResourceFile(' + idx + ');closeFileContextMenu()">'
 + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>'
 + ' \u5220\u9664</div>';
 menu.style.left = event.clientX + 'px';
 menu.style.top = event.clientY + 'px';
 document.body.appendChild(menu);
 // Adjust if overflows viewport
 const rect = menu.getBoundingClientRect();
 if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
 if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
 // Close on click outside
 setTimeout(() => document.addEventListener('click', closeFileContextMenu, { once: true }), 10);
 }

 function closeFileContextMenu() {
 const m = document.getElementById('fileContextMenu');
 if (m) m.remove();
 }

 function deleteResourceFile(idx) {
 if (!confirm('\u786e\u5b9a\u5220\u9664\u6587\u4ef6\u300c' + resourceFiles[idx].name + '\u300d\uff1f')) return;
 resourceFiles.splice(idx, 1);
 renderResourceFileList();
 }

 function previewResourceFile(idx) {
 const f = resourceFiles[idx];
 if (!f) return;
 const content = f.content || '暂无可预览的文本内容';
 const meta = f.size ? (f.size / 1024).toFixed(1) + ' KB' : '';
 openPreviewPanel('resource_' + idx, f.name, content, meta);
 }

 function citeFileInInput(idx) {
 const f = resourceFiles[idx];
 if (!f) return;
 const input = document.getElementById('messageInput');
 const citeText = '[引用文件《' + f.name + '》] ';
 if (!input.value.trim()) {
 input.value = citeText;
 } else {
 input.value = input.value.trimEnd() + ' ' + citeText;
 }
 if (f.content && !pendingFile) {
 pendingFile = { name: f.name, size: f.size || 0, content: f.content, type: f.contentType || 'document', isImage: false, objectUrl: null };
 const previewArea = document.getElementById('filePreviewArea');
 previewArea.style.display = 'block';
 previewArea.innerHTML = '<div class="file-preview-card">'
 + '<span class="file-preview-icon">' + getFileIcon(f.name) + '</span>'
 + '<span class="file-preview-name">' + f.name + '</span>'
 + '<span class="file-preview-size">已引用</span>'
 + '<button class="file-preview-remove" onclick="removePendingFile()" title="移除"></button>'
 + '</div>';
 }
 input.focus();
 autoResize(input);
 }

 function insertQuickRef(text) {
 const input = document.getElementById('messageInput');
 input.value = text;
 input.focus();
 autoResize(input);
 }

 let draggedResourceIdx = null;

 function onResourceItemDragStart(event, idx) {
 draggedResourceIdx = idx;
 event.dataTransfer.effectAllowed = 'copy';
 const f = resourceFiles[idx];
 event.dataTransfer.setData('text/plain', '[引用文件《' + f.name + '》] ');
 }

 function initDragDrop() {
 const inputBox = document.querySelector('.chat-input-box');
 if (!inputBox) return;
 inputBox.addEventListener('dragover', (e) => {
 e.preventDefault();
 e.dataTransfer.dropEffect = 'copy';
 inputBox.classList.add('drag-active');
 });
 inputBox.addEventListener('dragleave', (e) => {
 if (!inputBox.contains(e.relatedTarget)) {
 inputBox.classList.remove('drag-active');
 }
 });
 inputBox.addEventListener('drop', (e) => {
 e.preventDefault();
 inputBox.classList.remove('drag-active');
 if (draggedResourceIdx !== null) {
 citeFileInInput(draggedResourceIdx);
 draggedResourceIdx = null;
 return;
 }
 // 支持知识库条目拖拽
 const kbIdx = e.dataTransfer.getData('application/x-kb-idx');
 if (kbIdx !== '' && kbIdx !== null && kbIdx !== undefined) {
 citeKBInInput(parseInt(kbIdx, 10));
 return;
 }
 const files = e.dataTransfer.files;
 if (files && files.length > 0) {
 const file = files[0];
 const dt = new DataTransfer();
 dt.items.add(file);
 const fileInput = document.getElementById('fileInput');
 fileInput.files = dt.files;
 handleFileSelect({ target: fileInput });
 }
 });
 }


 // ===== WEB SEARCH TOGGLE =====
 let webSearchEnabled = false;

 function toggleWebSearch() {
 webSearchEnabled = !webSearchEnabled;
 const btn = document.getElementById('searchToggleBtn');
 btn.classList.toggle('active', webSearchEnabled);
 btn.title = webSearchEnabled ? '已开启联网搜索（点击关闭）' : '开启联网搜索';
 }

 function willSearch(msg) {
 return webSearchEnabled;
 }

 // ===== Combo Skills 快捷标签 =====
 const COMBO_SKILLS_MAP = {
   // 豆子（上游厂商入口）
   'doudou': [
     { id: 'competitor', name: '竞品分析', prompt: '帮我做一份竞品分析报告，包含产品对比、市场份额、价格策略和竞争优势分析' },
     { id: 'gtm', name: 'GTM 策略', prompt: '帮我制定一套 GTM（Go-To-Market）策略，包含目标市场定位、渠道策略、定价策略和推广节奏' },
     { id: 'speech', name: '话术生成', prompt: '帮我生成一套专业的销售话术，包含开场白、产品介绍、异议处理和成交促成' },
     { id: 'compliance', name: '合规审查', prompt: '帮我进行产品合规审查，检查注册信息、广告合规性和潜在风险' }
   ],
   // 豆丁（下游机构入口）
   'douding': [
     { id: 'consult', name: '咨询话术', prompt: '帮我设计一套客户咨询话术体系，包含需求挖掘、项目介绍、价格异议处理和成交促成' },
     { id: 'operation', name: '运营方案', prompt: '帮我制定一份机构运营方案，包含获客策略、活动设计、预算分配和 KPI 设定' },
     { id: 'postop', name: '术后管理', prompt: '帮我建立一套术后管理流程，包含随访节点、风险分诊、客户关怀和复购转化' },
     { id: 'training', name: '培训材料', prompt: '帮我编写一份培训材料，包含产品知识、操作流程、FAQ 和考核要点' }
   ],
   // 豆芽（内容创作入口）
   'douya': [
     { id: 'xhs', name: '小红书文案', prompt: '帮我写一篇小红书种草笔记，包含吸睛标题、正文内容、配图建议和标签' },
     { id: 'wechat', name: '公众号推文', prompt: '帮我写一篇微信公众号推文，包含标题、导语、正文和尾部 CTA' },
     { id: 'ip', name: '个人 IP', prompt: '帮我规划个人 IP 打造方案，包含人设定位、内容策略、视觉系统和变现路径' },
     { id: 'topic', name: '爆款选题', prompt: '帮我做一次爆款选题分析，找出当前医美行业最有传播潜力的内容方向' }
   ],
   // GTM战略大师
   'gtm-strategist': [
     { id: 'competitor', name: '竞品分析', prompt: '帮我做一份竞品分析报告，包含产品矩阵对比、市场份额、价格策略和竞争优势' },
     { id: 'gtm', name: 'GTM 策略', prompt: '帮我制定一套完整的 GTM 策略，包含市场定位、渠道策略、定价策略和推广节奏' },
     { id: 'market', name: '市场调研', prompt: '帮我撰写一份市场调研报告，包含行业现状、市场规模、增长趋势和机会分析' },
     { id: 'channel', name: '渠道策略', prompt: '帮我制定渠道拓展策略，包含目标机构画像、合作模式、进场策略和维护方案' }
   ],
   // 金牌咨询师
   'senior-consultant': [
     { id: 'consult', name: '咨询话术', prompt: '帮我设计一套客户咨询话术体系，包含破冰、需求挖掘、项目推荐和成交促成' },
     { id: 'objection', name: '异议处理', prompt: '帮我设计常见异议处理话术，包含价格异议、效果疑虑、竞品对比和犹豫不决' },
     { id: 'closing', name: '成交技巧', prompt: '帮我梳理成交促成技巧，包含信号识别、报价策略、限时促销和追踪节奏' },
     { id: 'followup', name: '客户跟进', prompt: '帮我制定客户跟进计划，包含跟进时间节点、沟通话术和复购转化策略' }
   ],
   // 小红书图文创作顾问
   'xhs-content-creator': [
     { id: 'xhs_note', name: '种草笔记', prompt: '帮我写一篇小红书种草笔记，要有吸引力的标题和真实感的内容' },
     { id: 'xhs_series', name: '系列规划', prompt: '帮我规划一个小红书内容系列，包含主题规划、发布节奏和互动策略' },
     { id: 'xhs_style', name: '风格设计', prompt: '帮我设计小红书图文视觉风格，包含配色、布局、字体和图片风格' },
     { id: 'xhs_data', name: '数据复盘', prompt: '帮我复盘小红书账号数据，分析爆款内容特征和优化方向' }
   ],
   // 微信公众号运营顾问
   'wechat-content-creator': [
     { id: 'wechat_article', name: '深度文章', prompt: '帮我写一篇微信公众号深度文章，包含标题、导语、正文和尾部 CTA' },
     { id: 'wechat_plan', name: '内容规划', prompt: '帮我规划一个月的公众号内容日历，包含主题、发布时间和配合活动' },
     { id: 'wechat_growth', name: '增长策略', prompt: '帮我制定公众号增长策略，包含涨粉方案、活动设计和留存优化' },
     { id: 'wechat_convert', name: '转化优化', prompt: '帮我优化公众号到店转化链路，包含落地页设计、活动机制和跟进流程' }
   ]
 };

 // 通用 Combo 标签（未单独配置的 Agent 使用）
 const DEFAULT_COMBO_SKILLS = [
   { id: 'competitor', name: '竞品分析', prompt: '帮我做一份竞品分析报告' },
   { id: 'copywriting', name: '营销文案', prompt: '帮我撰写一套营销文案' },
   { id: 'compliance', name: '合规审查', prompt: '帮我进行合规审查' },
   { id: 'swot', name: 'SWOT 分析', prompt: '帮我做一份 SWOT 分析' }
 ];

 function renderComboTags(agentId) {
   const container = document.getElementById('comboQuickTags');
   if (!container) return;
   const skills = COMBO_SKILLS_MAP[agentId] || DEFAULT_COMBO_SKILLS;
   if (!skills || skills.length === 0) {
     container.style.display = 'none';
     return;
   }
   const lightningIcon = '<span class="combo-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span>';
   let html = '';
   skills.forEach(function(skill, idx) {
     const isFirst = idx === 0;
     html += '<div class="combo-quick-tag' + (isFirst ? ' active' : '') + '" data-combo-id="' + skill.id + '" data-combo-prompt="' + skill.prompt.replace(/"/g, '&quot;') + '" onclick="triggerCombo(this)">';
     html += lightningIcon;
     html += skill.name;
     if (!isFirst) html += ' <span class="combo-plus">+</span>';
     html += '</div>';
   });
   container.innerHTML = html;
   container.style.display = 'flex';
 }

 function triggerCombo(el) {
   const prompt = el.getAttribute('data-combo-prompt');
   if (!prompt) return;
   // 高亮点击的标签
   document.querySelectorAll('.combo-quick-tag').forEach(function(t) { t.classList.remove('active'); });
   el.classList.add('active');
   // 填充到输入框并发送
   const input = document.getElementById('messageInput');
   if (input) {
     input.value = prompt;
     input.style.height = 'auto';
     input.style.height = input.scrollHeight + 'px';
     input.focus();
     // 自动发送
     sendMessage();
   }
 }

 // ===== 输出模板 =====
 let templateData = null;
 let templatePanelVisible = false;
 let activeTemplateCategory = 'all';

 async function loadTemplates() {
 if (templateData) return templateData;
 try {
 const res = await fetch('/api/templates');
 templateData = await res.json();
 return templateData;
 } catch (e) {
 console.error('Failed to load templates:', e);
 return { templates: [], categories: [] };
 }
 }

 async function toggleTemplatePanel() {
 const panel = document.getElementById('templatePanel');
 const btn = document.getElementById('templateBtn');
 templatePanelVisible = !templatePanelVisible;
 if (templatePanelVisible) {
 panel.style.display = 'block';
 btn.classList.add('active');
 const data = await loadTemplates();
 renderTemplateGrid(data);
 } else {
 panel.style.display = 'none';
 btn.classList.remove('active');
 }
 }

 function renderTemplateGrid(data) {
 const grid = document.getElementById('templateGrid');
 if (!data || !data.templates) { grid.innerHTML = '<p>暂无模板</p>'; return; }
 
 // 分类标签
 let html = '<div class="template-categories">';
 (data.categories || []).forEach(function(cat) {
 html += '<button class="template-cat-btn' + (activeTemplateCategory === cat.id ? ' active' : '') + '" onclick="filterTemplates(\'' + cat.id + '\')">' + cat.name + '</button>';
 });
 html += '</div><div class="template-cards">';
 
 // 模板卡片
 data.templates.forEach(function(tpl) {
 if (activeTemplateCategory !== 'all' && tpl.category !== activeTemplateCategory) return;
 html += '<div class="template-card" onclick="selectTemplate(\'' + tpl.id + '\')">';
 html += '<div class="template-card-icon">' + tpl.icon + '</div>';
 html += '<div class="template-card-body">';
 html += '<div class="template-card-name">' + tpl.name + '</div>';
 html += '<div class="template-card-desc">' + tpl.description + '</div>';
 html += '</div></div>';
 });
 html += '</div>';
 grid.innerHTML = html;
 }

 function filterTemplates(catId) {
 activeTemplateCategory = catId;
 if (templateData) renderTemplateGrid(templateData);
 }

 function selectTemplate(tplId) {
 if (!templateData) return;
 var tpl = templateData.templates.find(function(t) { return t.id === tplId; });
 if (!tpl) return;
 // 关闭面板
 toggleTemplatePanel();
 // 填充输入框
 var input = document.getElementById('messageInput');
 var placeholder = tpl.placeholder || '输入主题';
 // 显示模板提示词，用户只需填写主题
 input.value = tpl.prompt.replace('{topic}', '');
 input.placeholder = placeholder;
 input.focus();
 autoResize(input);
 // 显示模板标签
 showTemplateTag(tpl.name);
 }

 function showTemplateTag(name) {
 var existing = document.querySelector('.template-active-tag');
 if (existing) existing.remove();
 var tag = document.createElement('div');
 tag.className = 'template-active-tag';
 tag.innerHTML = '<span>模板: ' + name + '</span><button onclick="clearTemplate(this)">&times;</button>';
 var inputBox = document.querySelector('.chat-input-box');
 if (inputBox) inputBox.insertBefore(tag, inputBox.firstChild);
 }

 function clearTemplate(btn) {
 var tag = btn.parentNode;
 if (tag) tag.remove();
 var input = document.getElementById('messageInput');
 input.value = '';
 input.placeholder = '输入问题...';
 autoResize(input);
 }

 // ===== 语音输入 =====
 let recognition = null;
 let isRecording = false;

 function toggleVoiceInput() {
 const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
 if (!SpeechRecognition) {
 alert('您的浏览器不支持语音识别，请使用 Chrome 或 Safari。');
 return;
 }

 const btn = document.getElementById('micBtn');
 const input = document.getElementById('messageInput');

 if (isRecording) {
 // 停止录音
 if (recognition) recognition.stop();
 return;
 }

 // 开始录音
 recognition = new SpeechRecognition();
 recognition.lang = 'zh-CN';
 recognition.continuous = false;
 recognition.interimResults = true;
 recognition.maxAlternatives = 1;

 let finalTranscript = '';
 let interimTranscript = '';
 const originalPlaceholder = input.placeholder;

 recognition.onstart = () => {
 isRecording = true;
 btn.classList.add('recording');
 btn.innerHTML = '说话中';
 input.placeholder = '正在聆听，请说话...';
 };

 recognition.onresult = (e) => {
 interimTranscript = '';
 for (let i = e.resultIndex; i < e.results.length; i++) {
 const t = e.results[i][0].transcript;
 if (e.results[i].isFinal) { finalTranscript += t; }
 else { interimTranscript += t; }
 }
 // 实时显示中间结果
 input.value = finalTranscript + interimTranscript;
 autoResize(input);
 };

 recognition.onend = () => {
 isRecording = false;
 btn.classList.remove('recording');
 btn.innerHTML = '语音';
 input.placeholder = originalPlaceholder;
 if (finalTranscript.trim()) {
 input.value = finalTranscript.trim();
 autoResize(input);
 input.focus();
 }
 recognition = null;
 };

 recognition.onerror = (e) => {
 isRecording = false;
 btn.classList.remove('recording');
 btn.innerHTML = '语音';
 input.placeholder = originalPlaceholder;
 recognition = null;
 if (e.error === 'not-allowed') {
 alert('请允许浏览器使用麦克风权限。');
 } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
 console.warn('Speech recognition error:', e.error);
 }
 };

 recognition.start();
 }

 // ===== 绘图功能 =====
 let drawModalEl = null;

 function openDrawModal() {
 if (drawModalEl) return;
 drawModalEl = document.createElement('div');
 drawModalEl.className = 'draw-modal-overlay';
 drawModalEl.innerHTML = `
 <div class="draw-modal-card">
 <div class="draw-modal-title">AI 绘图</div>
 <textarea class="draw-prompt-input" id="drawPromptInput" placeholder="描述你想要的画面，例如：一名医美顾问向客户介绍玻尿酸项目，专业、温暖、现代风格" rows="3"></textarea>
 <div class="draw-status" id="drawStatus"></div>
 <img class="draw-result-img" id="drawResultImg" style="display:none" />
 <div class="draw-modal-footer">
 <button class="draw-cancel-btn" onclick="closeDrawModal()">取消</button>
 <button class="draw-submit-btn" id="drawSubmitBtn" onclick="submitDraw()">生成图片</button>
 </div>
 </div>
 `;
 document.body.appendChild(drawModalEl);
 drawModalEl.addEventListener('click', e => { if (e.target === drawModalEl) closeDrawModal(); });
 setTimeout(() => document.getElementById('drawPromptInput')?.focus(), 100);
 }

 function closeDrawModal() {
 if (drawModalEl) { drawModalEl.remove(); drawModalEl = null; }
 }

 async function submitDraw() {
 const prompt = document.getElementById('drawPromptInput')?.value?.trim();
 if (!prompt) { document.getElementById('drawStatus').textContent = '请输入画面描述'; return; }
 const submitBtn = document.getElementById('drawSubmitBtn');
 const statusEl = document.getElementById('drawStatus');
 const resultImg = document.getElementById('drawResultImg');
 submitBtn.disabled = true;
 submitBtn.textContent = '生成中...';
 statusEl.textContent = 'AI 绘图生成中，预计 15-30 秒，请稍候...';
 resultImg.style.display = 'none';
 try {
 const token = localStorage.getItem('medagent_token');
 const res = await fetch('/api/image/generate', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
 body: JSON.stringify({ customPrompt: prompt })
 });
 const data = await res.json();
 if (!res.ok || data.error) {
 const errMap = {
 'not_pro': '绘图功能仅 Pro 用户可用，请升级订阅',
 'img_quota_exceeded': '本月绘图次数已用完',
 'trial_expired': '试用期已到期，请订阅'
 };
 statusEl.textContent = errMap[data.error] || (data.message || '生成失败，请稍后重试');
 submitBtn.disabled = false;
 submitBtn.textContent = '重新生成';
 return;
 }
 const finalImgUrl = data.imageUrl || data.url;
 if (finalImgUrl) {
 resultImg.src = finalImgUrl;
 resultImg.style.display = 'block';
 statusEl.textContent = '生成成功！点击图片可保存';
 resultImg.onclick = () => { const a = document.createElement('a'); a.href = finalImgUrl; a.download = 'medagent-draw.png'; a.target='_blank'; a.click(); };
 resultImg.style.cursor = 'pointer';
 // 将图片插入聊天记录
 addMessage('assistant', `已根据描述「${prompt}」生成图片\n\n![AI绘图](${finalImgUrl})`);
 setTimeout(() => closeDrawModal(), 1500);
 } else {
 statusEl.textContent = '生成失败，请稍后重试';
 submitBtn.disabled = false;
 submitBtn.textContent = '重新生成';
 }
 } catch(e) {
 statusEl.textContent = '网络错误，请稍后重试';
 submitBtn.disabled = false;
 submitBtn.textContent = '重新生成';
 }
 }

 async function sendMessage() {
 const input = document.getElementById('messageInput');
 const msg = input.value.trim();
 if ((!msg && !pendingFile) || !sessionId) return;
 const displayMsg = msg || ('分析文件《' + (pendingFile ? pendingFile.name : '') + '》');
 const filePreviewUrl = (pendingFile && pendingFile.isImage) ? pendingFile.objectUrl : null;
 addMessage('user', displayMsg, null, { isImage: filePreviewUrl, fileName: pendingFile ? pendingFile.name : null });
 lastUserMsg = displayMsg; // 记录用户消息供反馈学习使用
 input.value = '';
 input.style.height = 'auto';

 const searching = willSearch(msg);
 if (searching) showSearchIndicator();
 setDoudouEmotion('thinking');
 showTyping();

 input.disabled = true;
 document.getElementById('sendBtn').disabled = true;
 document.getElementById('uploadBtn').disabled = true;

 const fileCtx = pendingFile ? { name: pendingFile.name, content: pendingFile.content } : null;
 if (pendingFile) removePendingFile();

 try {
 const settings = loadSettings();
 const body = { sessionId, message: msg || '请分析这个文件', ...settings };
 if (fileCtx) body.fileContext = fileCtx;
 if (webSearchEnabled) body.webSearch = true;
 // 注入已加载的技能包上下文
 if (loadedSkillContext && loadedSkillContext.content) {
 body.skillContext = loadedSkillContext.content;
 body.skillName = loadedSkillContext.skillName;
 }

 // Reset search toggle after sending
 if (webSearchEnabled) {
 webSearchEnabled = false;
 document.getElementById('searchToggleBtn').classList.remove('active');
 document.getElementById('searchToggleBtn').title = '开启联网搜索';
 }

 // Try streaming endpoint first (with retry)
 let res, retryCount = 0;
 const MAX_RETRIES = 2;
 while (true) {
 try {
 res = await fetch('/api/chat/message-stream', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(body)
 });
 if (res.ok) break;
 throw new Error('HTTP ' + res.status);
 } catch (fetchErr) {
 retryCount++;
 if (retryCount > MAX_RETRIES) throw fetchErr;
 console.warn('[SSE] 连接失败，' + retryCount + '/' + MAX_RETRIES + ' 次重试...', fetchErr.message);
 await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retryCount - 1))); // 指数退避: 1s, 2s
 }
 }

 const contentType = res.headers.get('content-type') || '';

 if (contentType.includes('text/event-stream')) {
 // === STREAMING MODE ===
 hideTyping();
 hideSearchIndicator();
 setDoudouEmotion('talking');

 // Create empty assistant bubble for streaming
 const { bubble, row, container } = createStreamBubble();
 let fullText = '';
 let searchResults = null;

 const reader = res.body.getReader();
 const decoder = new TextDecoder();
 let sseBuffer = '';
 let sseEventType = 'message';

 while (true) {
 const { done, value } = await reader.read();
 if (done) break;
 sseBuffer += decoder.decode(value, { stream: true });
 const sseLines = sseBuffer.split('\n');
 sseBuffer = sseLines.pop() || '';

 
 for (const line of sseLines) {
 if (line.startsWith('event: ')) { sseEventType = line.slice(7).trim(); continue; }
 if (!line.startsWith('data: ')) continue;
 const dataStr = line.slice(6).trim();
 if (!dataStr) continue;
 // 处理 reasoning 思考过程事件
 if (sseEventType === 'reasoning') {
 try {
 const r = JSON.parse(dataStr);
 let reasoningEl = bubble.querySelector('.reasoning-box');
 if (!reasoningEl) {
 reasoningEl = document.createElement('details');
 reasoningEl.className = 'reasoning-box';
 reasoningEl.innerHTML = '<summary>正在深度思考...</summary><div class="reasoning-content"></div>';
 bubble.insertBefore(reasoningEl, bubble.firstChild);
 }
 const contentEl = reasoningEl.querySelector('.reasoning-content');
 if (contentEl) contentEl.textContent += r.content || '';
 container.scrollTop = container.scrollHeight;
 } catch(e) {}
 sseEventType = 'message';
 continue;
 }
 sseEventType = 'message';
 try {
 const evt = JSON.parse(dataStr);
 if (evt.type === 'skill_dispatch') {
 // Skill 路由：豆豆正在调用专家 Skill
 hideTyping();
 const name = evt.displayName || evt.skill_id || '专家';
 showToolStatusIndicator('skill_dispatch', `正在调用 ${name}...`);
 } else if (evt.type === 'tool_call') {
 // Function Calling：模型触发了工具调用，显示查询提示
 hideTyping();
 if (evt.tool === 'nmpa_search') {
 showNmpaIndicator(evt.products);
 showToolStatusIndicator('nmpa_search', '正在查询药监局数据库...');
 } else if (evt.tool === 'web_search') {
 showToolStatusIndicator('web_search', '正在联网搜索最新行情...');
 } else if (evt.tool === 'query_med_db') {
 showToolStatusIndicator('query_med_db', '正在查询价格数据库...');
 } else {
 showToolStatusIndicator(evt.tool, '正在调用工具...');
 }
 } else if (evt.type === 'search') {
 // 搜索结果分组收集
 if (!searchResults) searchResults = [];
 if (evt.results) {
   // 为每个结果附加来源标签
   const source = evt.source || 'unknown';
   const sourceLabel = evt.sourceLabel || '';
   evt.results.forEach(function(r) {
     r._source = source;
     r._sourceLabel = sourceLabel;
   });
   searchResults = searchResults.concat(evt.results);
 }
 } else if (evt.type === 'task_plan_init') {
 // 任务规划初始化：创建容器，显示“正在拆解任务...”动画
 let planContainer = bubble.querySelector('.task-plan-container');
 if (!planContainer) {
 const blinkCursor = bubble.querySelector('.blink-cursor');
 if (blinkCursor) blinkCursor.remove();
 planContainer = document.createElement('div');
 planContainer.className = 'task-plan-container tp-animating';
 planContainer.innerHTML = '<div class="task-plan-header">' +
 '<div class="task-plan-header-left">' +
 '<span class="task-plan-thinking-dot"><span></span><span></span><span></span></span>' +
 '<span class="task-plan-title">正在拆解任务...</span>' +
 '</div>' +
 '<span class="task-plan-progress"></span>' +
 '</div>' +
 '<div class="task-plan-steps"></div>';
 bubble.insertBefore(planContainer, bubble.firstChild);
 }
 container.scrollTop = container.scrollHeight;
 } else if (evt.type === 'task_plan_add') {
 // 逐个步骤动画冒出
 let planContainer = bubble.querySelector('.task-plan-container');
 if (!planContainer) {
 // 如果没有 init，自动创建容器
 const blinkCursor = bubble.querySelector('.blink-cursor');
 if (blinkCursor) blinkCursor.remove();
 planContainer = document.createElement('div');
 planContainer.className = 'task-plan-container tp-animating';
 planContainer.innerHTML = '<div class="task-plan-header">' +
 '<div class="task-plan-header-left">' +
 '<span class="task-plan-thinking-dot"><span></span><span></span><span></span></span>' +
 '<span class="task-plan-title">任务规划</span>' +
 '</div>' +
 '<span class="task-plan-progress"></span>' +
 '</div>' +
 '<div class="task-plan-steps"></div>';
 bubble.insertBefore(planContainer, bubble.firstChild);
 }
 var step = evt.step;
 if (step) {
 var planStepsList = planContainer.querySelector('.task-plan-steps');
 var stepEl = document.createElement('div');
 stepEl.className = 'task-plan-step pending tp-step-enter';
 stepEl.dataset.planStepId = step.id;
 stepEl.innerHTML = '<span class="task-plan-step-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/></svg></span>' +
 '<div class="task-plan-step-content"><span class="task-plan-step-title">' + step.title + '</span>' +
 (step.description ? '<span class="task-plan-step-desc">' + step.description + '</span>' : '') + '</div>';
 planStepsList.appendChild(stepEl);
 // 触发动画
 requestAnimationFrame(function() {
 requestAnimationFrame(function() {
 stepEl.classList.remove('tp-step-enter');
 stepEl.classList.add('tp-step-visible');
 });
 });
 // 更新标题和进度
 var allSteps = planStepsList.querySelectorAll('.task-plan-step');
 var titleEl = planContainer.querySelector('.task-plan-title');
 if (titleEl) titleEl.textContent = '任务规划';
 var progressEl = planContainer.querySelector('.task-plan-progress');
 if (progressEl) progressEl.textContent = '0/' + allSteps.length + ' 已完成';
 // 移除 thinking dots（当所有步骤都发完时由 update 处理）
 }
 container.scrollTop = container.scrollHeight;
 } else if (evt.type === 'task_plan') {
 // 兼容旧接口：一次性发送所有步骤
 let planContainer = bubble.querySelector('.task-plan-container');
 if (!planContainer) {
 const blinkCursor = bubble.querySelector('.blink-cursor');
 if (blinkCursor) blinkCursor.remove();
 planContainer = document.createElement('div');
 planContainer.className = 'task-plan-container';
 planContainer.innerHTML = '<div class="task-plan-header">' +
 '<div class="task-plan-header-left">' +
 '<svg class="task-plan-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>' +
 '<span class="task-plan-title">任务规划</span>' +
 '</div>' +
 '<span class="task-plan-progress">0/' + (evt.steps ? evt.steps.length : 0) + ' 已完成</span></div><div class="task-plan-steps"></div>';
 bubble.insertBefore(planContainer, bubble.firstChild);
 }
 const planStepsList = planContainer.querySelector('.task-plan-steps');
 if (evt.steps && planStepsList) {
 planStepsList.innerHTML = '';
 evt.steps.forEach(function(step) {
 const stepEl = document.createElement('div');
 stepEl.className = 'task-plan-step pending';
 stepEl.dataset.planStepId = step.id;
 stepEl.innerHTML = '<span class="task-plan-step-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/></svg></span>' +
 '<div class="task-plan-step-content"><span class="task-plan-step-title">' + step.title + '</span>' +
 (step.description ? '<span class="task-plan-step-desc">' + step.description + '</span>' : '') + '</div>';
 planStepsList.appendChild(stepEl);
 });
 }
 container.scrollTop = container.scrollHeight;
 } else if (evt.type === 'task_plan_update') {
 // 任务计划更新：更新单个步骤状态和描述（带动画）
 const planContainer = bubble.querySelector('.task-plan-container');
 if (planContainer) {
 // 移除 thinking dots
 var thinkingDot = planContainer.querySelector('.task-plan-thinking-dot');
 if (thinkingDot) thinkingDot.remove();
 planContainer.classList.remove('tp-animating');
 
 const stepEl = planContainer.querySelector('[data-plan-step-id="' + evt.stepId + '"]');
 if (stepEl) {
 // 添加状态过渡动画 class
 stepEl.classList.add('tp-status-change');
 setTimeout(function() { stepEl.classList.remove('tp-status-change'); }, 500);
 
 stepEl.classList.remove('pending', 'running', 'done', 'error');
 stepEl.classList.add(evt.status);
 const iconEl = stepEl.querySelector('.task-plan-step-icon');
 if (evt.status === 'done') {
 iconEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#27ae60" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
 } else if (evt.status === 'running') {
 iconEl.innerHTML = '<span class="spin"></span>';
 } else if (evt.status === 'error') {
 iconEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2.5" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
 }
 // 更新描述（结果摘要）带打字效果
 if (evt.description) {
 var descEl = stepEl.querySelector('.task-plan-step-desc');
 if (!descEl) {
 var contentEl = stepEl.querySelector('.task-plan-step-content');
 if (contentEl) {
 descEl = document.createElement('span');
 descEl.className = 'task-plan-step-desc';
 contentEl.appendChild(descEl);
 }
 }
 if (descEl) {
 descEl.textContent = '';
 descEl.classList.add('tp-typing');
 // 打字效果
 var chars = evt.description.split('');
 var ci = 0;
 var typeTimer = setInterval(function() {
 if (ci < chars.length) {
 descEl.textContent += chars[ci];
 ci++;
 } else {
 clearInterval(typeTimer);
 descEl.classList.remove('tp-typing');
 }
 }, 20);
 }
 }
 }
 // 更新进度条
 var allPlanSteps = planContainer.querySelectorAll('.task-plan-step');
 var donePlanSteps = planContainer.querySelectorAll('.task-plan-step.done');
 var progressEl = planContainer.querySelector('.task-plan-progress');
 if (progressEl) {
 var tpTotal = allPlanSteps.length;
 var tpDone = donePlanSteps.length;
 progressEl.textContent = tpDone + '/' + tpTotal + ' 已完成';
 // 进度条
 var bar = planContainer.querySelector('.task-plan-bar');
 if (!bar) {
 bar = document.createElement('div');
 bar.className = 'task-plan-bar';
 bar.innerHTML = '<div class="task-plan-bar-fill"></div>';
 var header = planContainer.querySelector('.task-plan-header');
 if (header) header.after(bar);
 }
 var fill = bar.querySelector('.task-plan-bar-fill');
 if (fill) fill.style.width = (tpTotal > 0 ? (tpDone / tpTotal * 100) : 0) + '%';
 // 全部完成时标记
 if (tpDone === tpTotal && tpTotal > 0) {
 planContainer.classList.add('tp-all-done');
 }
 }
 }
 container.scrollTop = container.scrollHeight;
 } else if (evt.type === 'step') {
 // 动态步骤卡片（专家模式 - 思考过程）
 let stepsContainer = bubble.querySelector('.expert-steps-container');
     if (!stepsContainer) {
 // 清除初始的 blink cursor
 const blinkCursor = bubble.querySelector('.blink-cursor');
 if (blinkCursor) blinkCursor.remove();
 stepsContainer = document.createElement('div');
 stepsContainer.className = 'expert-steps-container';
 stepsContainer.innerHTML = '<div class="expert-steps-header"><span class="expert-steps-title">思考过程</span><span class="expert-steps-progress"></span></div><div class="expert-steps-list"></div>';
 bubble.insertBefore(stepsContainer, bubble.firstChild);
 }
 const stepsList = stepsContainer.querySelector('.expert-steps-list');
 // 查找已有步骤
 let stepEl = stepsList.querySelector(`[data-step-id="${evt.id}"]`);
 if (!stepEl) {
 stepEl = document.createElement('div');
 stepEl.className = 'expert-step-item';
 stepEl.dataset.stepId = evt.id;
 stepEl.innerHTML = `<span class="expert-step-icon"><span class="spin"></span></span><span class="expert-step-text"></span>`;
 stepsList.appendChild(stepEl);
 }
 // 更新文字
 stepEl.querySelector('.expert-step-text').textContent = evt.text;
 // 更新状态
 const iconEl = stepEl.querySelector('.expert-step-icon');
 const checkSvg = '<span class="check"><svg viewBox="0 0 24 24" fill="none" stroke="#27ae60" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>';
 if (evt.status === 'done') {
 stepEl.classList.remove('running');
 stepEl.classList.add('done');
 iconEl.innerHTML = checkSvg;
 } else if (evt.status === 'error') {
 stepEl.classList.remove('running');
 stepEl.classList.add('error');
 iconEl.innerHTML = '<span class="err">&#10005;</span>';
 } else {
 stepEl.classList.add('running');
 iconEl.innerHTML = '<span class="spin"></span>';
 }
 // 更新进度计数
 const allSteps = stepsList.querySelectorAll('.expert-step-item');
 const doneSteps = stepsList.querySelectorAll('.expert-step-item.done');
 const progressEl = stepsContainer.querySelector('.expert-steps-progress');
 if (progressEl) {
 progressEl.textContent = `${doneSteps.length}/${allSteps.length} 已完成`;
 }
 container.scrollTop = container.scrollHeight;
} else if (evt.type === 'search_activity') {
 // 搜索活动动态展示：在对应的 step 卡片下方显示搜索动态
 var stepsContainer2 = bubble.querySelector('.expert-steps-container');
 if (stepsContainer2) {
   var stepEl2 = stepsContainer2.querySelector('[data-step-id="' + evt.stepId + '"]');
   if (stepEl2) {
     // 获取或创建该步骤的搜索活动容器
     var activityBox = stepEl2.querySelector('.search-activity-box');
     if (!activityBox) {
       activityBox = document.createElement('div');
       activityBox.className = 'search-activity-box';
       stepEl2.appendChild(activityBox);
     }
     // SVG 图标定义
     var svgIcons = {
       web_search: '<svg class="sa-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M1.5 8h13M8 1.5c-2 2.5-2 9.5 0 13M8 1.5c2 2.5 2 9.5 0 13"/></svg>',
       knowledge_search: '<svg class="sa-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12.5V3a1.5 1.5 0 011.5-1.5h9V11H3.5A1.5 1.5 0 002 12.5zm0 0A1.5 1.5 0 003.5 14H13"/></svg>',
       nmpa_search: '<svg class="sa-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2h12v10a2 2 0 01-2 2H4a2 2 0 01-2-2V2z"/><path d="M5 5h6M5 8h4"/></svg>'
     };
     var getIcon = function(tool) { return svgIcons[tool] || svgIcons.web_search; };
     
     if (evt.status === 'searching') {
       var searchingEl = activityBox.querySelector('[data-tool="' + evt.tool + '"]');
       if (!searchingEl) {
         searchingEl = document.createElement('div');
         searchingEl.className = 'search-activity-item searching';
         searchingEl.dataset.tool = evt.tool;
         searchingEl.innerHTML = '<span class="sa-icon">' + getIcon(evt.tool) + '</span>' +
           '<span class="sa-label">正在搜索' + (evt.toolLabel || '') + '</span>' +
           '<span class="sa-spinner"></span>';
         activityBox.appendChild(searchingEl);
       }
     } else if (evt.status === 'found' && evt.sites) {
       var searchingEl2 = activityBox.querySelector('[data-tool="' + evt.tool + '"]');
       if (searchingEl2) {
         searchingEl2.classList.remove('searching');
         searchingEl2.classList.add('found');
         // 限制最多显示3个标签，多余的用 +N 折叠
         var maxChips = 3;
         var visibleSites = evt.sites.slice(0, maxChips);
         var extraCount = evt.sites.length > maxChips ? evt.sites.length - maxChips : 0;
         var chipsHtml = visibleSites.map(function(site) {
           var label = site.domain || site.title || '来源';
           if (label.length > 14) label = label.substring(0, 14) + '...';
           if (site.url) {
             return '<a class="sa-chip" href="' + site.url + '" target="_blank" rel="noopener" title="' + (site.title || '') + '">' + label + '</a>';
           }
           return '<span class="sa-chip" title="' + (site.title || '') + '">' + label + '</span>';
         }).join('');
         if (extraCount > 0) chipsHtml += '<span class="sa-chip sa-chip-more">+' + extraCount + '</span>';
         searchingEl2.innerHTML = '<span class="sa-icon">' + getIcon(evt.tool) + '</span>' +
           '<span class="sa-label">' + (evt.toolLabel || '') + '</span>' +
           '<span class="sa-count">' + (evt.count || '') + '条</span>' +
           '<div class="sa-chips">' + chipsHtml + '</div>';
       }
     } else if (evt.status === 'empty' || evt.status === 'error') {
       // 空结果：静默隐藏，不显示冗余信息
       var searchingEl3 = activityBox.querySelector('[data-tool="' + evt.tool + '"]');
       if (searchingEl3) {
         searchingEl3.classList.remove('searching');
         searchingEl3.classList.add('empty-hidden');
         searchingEl3.style.display = 'none';
       }
     }
   }
 }
 container.scrollTop = container.scrollHeight;
 } else if (evt.type === 'delta') {
 hideNmpaIndicator(); // 开始输出回答，隐藏查询提示
 hideToolStatusIndicator(); // 隐藏工具状态提示
 // 步骤卡片折叠（所有步骤标记为完成）
 const stepsBox = bubble.querySelector('.expert-steps-container');
 if (stepsBox && !stepsBox.dataset.collapsed) {
 stepsBox.dataset.collapsed = '1';
 const checkSvgCollapse = '<span class="check"><svg viewBox="0 0 24 24" fill="none" stroke="#27ae60" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>';
 // 把所有仍在 running 的步骤标记为 done
 stepsBox.querySelectorAll('.expert-step-item:not(.done):not(.error)').forEach(el => {
 el.classList.remove('running');
 el.classList.add('done');
 el.querySelector('.expert-step-icon').innerHTML = checkSvgCollapse;
 });
 // 更新进度为全部完成
 const stepsList2 = stepsBox.querySelector('.expert-steps-list');
 if (stepsList2) {
 const total = stepsList2.querySelectorAll('.expert-step-item').length;
 const progressEl2 = stepsBox.querySelector('.expert-steps-progress');
 if (progressEl2) progressEl2.textContent = `${total}/${total} 已完成`;
 }
 }
 fullText += evt.content;
 // Re-render markdown on each delta with incomplete marker fix
 if (typeof marked !== 'undefined') {
 // Fix incomplete markdown markers during streaming
 let renderText = fullText;
 // Fix ## heading without space (LLM often omits the space)
 renderText = renderText.replace(/##([^\s#\n])/g, '## $1');
 // Fix missing blank line before table (LLM often puts table right after heading text)
 // 修复表格渲染：处理LLM生成表格的常见格式问题
 renderText = (function(text) {
 // Step1: 去除行首空格（LLM有时缩进表格行）
 text = text.replace(/^[ \t]+\|/gm, '|');
 // Step2: 去除表格行之间的空行（LLM常在每行后加空行）
 var changed = true;
 while (changed) {
 var prev = text;
 text = text.replace(/(\|[^\n]*)\n\n(\|)/g, '$1\n$2');
 changed = (text !== prev);
 }
 // Step3: 处理标题行和表格连写在一起的情况
 text = text.replace(/^([^|\n]+)(\|[^\n]+\|[ \t]*)$/gm, function(m, pre, row) {
 return (row.match(/\|/g)||[]).length >= 2 ? pre.trimEnd() + '\n' + row : m;
 });
 // Step4: 在非表格行后跟表格行时插入空行
 var lines = text.split('\n'), out = [];
 for (var i = 0; i < lines.length; i++) {
 var ln = lines[i], prev = i > 0 ? lines[i-1] : '';
 if (ln.trimStart().startsWith('|') && prev !== '' && !prev.trimStart().startsWith('|')) out.push('');
 out.push(ln);
 }
 return out.join('\n');
 })(renderText);
 // Fix table rows starting with space before pipe (marked.js requires no leading space)
 renderText = renderText.replace(/^[ \t]+(\|)/gm, '$1');
 // Count unmatched ** and * for bold/italic
 const dblAst = (renderText.match(/\*\*/g) || []).length;
 if (dblAst % 2 !== 0) renderText += '**';
 const sglAst = (renderText.replace(/\*\*/g, '').match(/\*/g) || []).length;
 if (sglAst % 2 !== 0) renderText += '*';
 // Count unmatched ` for inline code
 const backticks = (renderText.match(/`/g) || []).length;
 if (backticks % 2 !== 0) renderText += '`';
 // Count unmatched ~~ for strikethrough (prevent mid-stream del rendering)
 const tildes = (renderText.match(/~~/g) || []).length;
 if (tildes % 2 !== 0) renderText += '~~';
 // 渲染到专用的回答内容区域，保留步骤卡片
 let answerDiv = bubble.querySelector('.expert-answer-content');
 if (!answerDiv) {
 // 清除 blink cursor
 const blinkCur = bubble.querySelector('.blink-cursor');
 if (blinkCur) blinkCur.remove();
 answerDiv = document.createElement('div');
 answerDiv.className = 'expert-answer-content';
 bubble.appendChild(answerDiv);
 }
 answerDiv.innerHTML = (typeof DOMPurify !== 'undefined') ? DOMPurify.sanitize(marked.parse(renderText)) : marked.parse(renderText);
 wrapTables(answerDiv);
 } else {
 let answerDiv = bubble.querySelector('.expert-answer-content');
 if (!answerDiv) {
 const blinkCur = bubble.querySelector('.blink-cursor');
 if (blinkCur) blinkCur.remove();
 answerDiv = document.createElement('div');
 answerDiv.className = 'expert-answer-content';
 bubble.appendChild(answerDiv);
 }
 answerDiv.textContent = fullText;
 }
 container.scrollTop = container.scrollHeight;
 } else if (evt.type === 'done') {
 // 思考结束，更新思考框标题
 const rBox = bubble.querySelector('.reasoning-box summary');
 if (rBox && rBox.textContent.includes('正在')) {
 rBox.textContent = '思考过程（点击展开）';
 }
 // 保护：如果 fullText 为空，说明 delta 事件未收到，显示错误提示
 if (!fullText && !bubble.querySelector('.reasoning-box')) {
 bubble.textContent = '抱歉，响应异常，请重新发送。';
 console.warn('[SSE] done received but fullText is empty');
 } else {
 // Finalize: add search sources + feedback buttons
 finalizeStreamBubble(bubble, row, container, fullText, searchResults);
 }
 setDoudouEmotion('happy');
 setTimeout(() => setDoudouEmotion('default'), 3000);
 // ★ 安全网：done 事件时立即恢复输入框
 document.getElementById('messageInput').disabled = false;
 document.getElementById('sendBtn').disabled = false;
 document.getElementById('uploadBtn').disabled = false;
 const micBtnDone = document.getElementById('micBtn');
 if (micBtnDone) micBtnDone.disabled = false;
 document.getElementById('messageInput').focus();
 } else if (evt.type === 'error') {
 bubble.textContent = '抱歉，遇到了问题：' + (evt.message || '请稍后再试');
 // ★ 安全网：error 事件时也恢复输入框
 document.getElementById('messageInput').disabled = false;
 document.getElementById('sendBtn').disabled = false;
 document.getElementById('uploadBtn').disabled = false;
 const micBtnErr = document.getElementById('micBtn');
 if (micBtnErr) micBtnErr.disabled = false;
 }
 } catch (e) { /* skip */ }
 }
 }
 input.disabled = false;
 document.getElementById('sendBtn').disabled = false;
 document.getElementById('uploadBtn').disabled = false;
 const micBtnR = document.getElementById('micBtn');
 if (micBtnR) micBtnR.disabled = false;
 setTimeout(() => loadSidebarHistory(), 500);
 } else {
 // === NON-STREAMING FALLBACK ===
 const data = await res.json();
 hideTyping();
 hideSearchIndicator();
 setDoudouEmotion('happy');
 setTimeout(() => setDoudouEmotion('default'), 3000);
 addMessage('assistant', data.message, data.searchResults);
 setTimeout(() => loadSidebarHistory(), 500);
 }
 } catch(e) {
 hideTyping();
 hideSearchIndicator();
 setDoudouEmotion('confused');
 setTimeout(() => setDoudouEmotion('default'), 4000);
 // 判断是否为网络错误，提供重试按钮
 const isNetworkError = !navigator.onLine || (e && (e.message || '').match(/fetch|network|abort|timeout/i));
 if (isNetworkError) {
 const retryMsg = document.createElement('div');
 retryMsg.innerHTML = '<span>网络连接中断，消息发送失败。</span><br><button class="retry-btn-inline" onclick="this.disabled=true;this.textContent=\'\u91cd\u8bd5\u4e2d...\';sendMessage()">重新发送</button>';
 const container = document.getElementById('chatMessages');
 const row = document.createElement('div');
 row.className = 'msg-row assistant';
 const bubble = document.createElement('div');
 bubble.className = 'msg-bubble';
 bubble.appendChild(retryMsg);
 row.appendChild(bubble);
 container.appendChild(row);
 container.scrollTop = container.scrollHeight;
 } else {
 addMessage('assistant', '抱歉，遇到了问题，请稍后再试。');
 }
 } finally {
 input.disabled = false;
 document.getElementById('sendBtn').disabled = false;
 document.getElementById('uploadBtn').disabled = false;
 const micBtn = document.getElementById('micBtn');
 if (micBtn) micBtn.disabled = false;
 input.focus();
 }
 }

 // Create an empty assistant bubble for streaming content into
 function createStreamBubble() {
 const container = document.getElementById('chatMessages');
 const welcome = document.getElementById('welcomeWrap');
 if (welcome) welcome.remove();
 let agent = null;
 AGENT_GROUPS.forEach(g => { const a = g.agents.find(x => x.id === currentAgentId); if (a) agent = a; });
 const row = document.createElement('div');
 row.className = 'msg-row assistant';
 const avatar = document.createElement('div');
 avatar.className = 'msg-avatar';
 if (agent) {
 avatar.innerHTML = `<img src="${getAgentDefaultImg(agent.id) || IP_IMAGES.douzai.default}" alt="${agent.name}" style="object-fit:contain">`;
 } else { avatar.textContent = ''; }
 const bubble = document.createElement('div');
 bubble.className = 'msg-bubble';
 bubble.innerHTML = '<span class="blink-cursor">█</span>'; // blinking cursor
 row.appendChild(avatar);
 row.appendChild(bubble);
 container.appendChild(row);
 container.scrollTop = container.scrollHeight;
 return { bubble, row, container };
 }

 // Finalize the streaming bubble with search sources and feedback
 function finalizeStreamBubble(bubble, row, container, fullText, searchResults) {
 // Re-parse with suggested questions (only from clearly marked final section)
 let mainContent = fullText;
 let suggestedQuestions = [];
 // 找最后一个 ---（3+个短横线）后面跟引导问题的位置
 let lastSepIdx = -1;
 let sepLen = 0;
 const sepRegex = /-{3,}/g;
 let m;
 while ((m = sepRegex.exec(fullText)) !== null) {
 const afterPos = m.index + m[0].length;
 const afterStr = fullText.substring(afterPos, afterPos + 10).replace(/^\s*/, '');
 if (afterStr.startsWith('-') || afterStr.startsWith('我')) {
 lastSepIdx = m.index;
 sepLen = m[0].length;
 }
 }
 if (lastSepIdx > 0) {
 const afterSep = fullText.substring(lastSepIdx + sepLen).trim();
 // 先尝试按换行分割，如果只有1行则尝试按 "- 我" 模式分割
 let lines = afterSep.split('\n').map(l => l.trim()).filter(l => l.length > 0);
 if (lines.length <= 1 && afterSep.length > 10) {
 // 智能分割：处理问题挤在一行的情况
 // 先去掉开头的 - 和空格
 const cleaned = afterSep.replace(/^[-\s]+/, '');
 // 找分割点：中文/引号/括号后跟 - 再跟4个以上中文字符
 const pts = [];
 const pr = /(?<=[\u4e00-\u9fff\u201d\u201c"'）\)a-zA-Z0-9])[-](?=[\u4e00-\u9fff]{3,})/g;
 let pm;
 while ((pm = pr.exec(cleaned)) !== null) { pts.push(pm.index); }
 if (pts.length >= 2) {
 const segs = [];
 let prev = 0;
 for (const idx of pts) { segs.push(cleaned.substring(prev, idx).trim()); prev = idx + 1; }
 segs.push(cleaned.substring(prev).trim());
 lines = segs.filter(l => l.length > 4);
 }
 }
 if (lines.length >= 2 && lines.length <= 5) {
 mainContent = fullText.substring(0, lastSepIdx).trim();
 suggestedQuestions = lines.map(l => l.replace(/^[-*\d.\s]+/, '').trim()).filter(l => l.length > 4).map(q => q.replace(/skill_dispatch\([^)]*\)/g, '').replace(/nmpa_search\([^)]*\)/g, '').replace(/query_med_db\([^)]*\)/g, '').replace(/web_search\([^)]*\)/g, '').replace(/bocha_search\([^)]*\)/g, '').trim()).filter(q => q.length > 4);
 }
 }
 if (typeof marked !== 'undefined') {
 mainContent = mainContent.replace(/##([^\s#\n])/g, '## $1');
 // 修复表格渲染：处理LLM生成表格的常见格式问题
 mainContent = (function(text) {
 // Step1: 去除行首空格
 text = text.replace(/^[ \t]+\|/gm, '|');
 // Step2: 去除表格行之间的空行（LLM常在每行后加空行）
 var changed = true;
 while (changed) {
 var prev = text;
 text = text.replace(/(\|[^\n]*)\n\n(\|)/g, '$1\n$2');
 changed = (text !== prev);
 }
 // Step3: 处理标题行和表格连写在同一行的情况
 text = text.replace(/^([^|\n]+)(\|[^\n]+\|[ \t]*)$/gm, function(m, pre, row) {
 return (row.match(/\|/g)||[]).length >= 2 ? pre.trimEnd() + '\n' + row : m;
 });
 // Step4: 在非表格行后跟表格行时插入空行
 var lines = text.split('\n'), out = [];
 for (var i = 0; i < lines.length; i++) {
 var ln = lines[i], prev2 = i > 0 ? lines[i-1] : '';
 if (ln.trimStart().startsWith('|') && prev2 !== '' && !prev2.trimStart().startsWith('|')) out.push('');
 out.push(ln);
 }
 return out.join('\n');
 })(mainContent);
 // 渲染到专用的回答内容区域，保留步骤卡片
 let answerDiv2 = bubble.querySelector('.expert-answer-content');
 if (!answerDiv2) {
 answerDiv2 = document.createElement('div');
 answerDiv2.className = 'expert-answer-content';
 bubble.appendChild(answerDiv2);
 }
 answerDiv2.innerHTML = (typeof DOMPurify !== 'undefined') ? DOMPurify.sanitize(marked.parse(mainContent)) : marked.parse(mainContent);
 injectCodeCopyBtns(answerDiv2);
 wrapTables(answerDiv2);
 injectAgentLinks(answerDiv2);
 } else {
 let answerDiv2 = bubble.querySelector('.expert-answer-content');
 if (!answerDiv2) {
 answerDiv2 = document.createElement('div');
 answerDiv2.className = 'expert-answer-content';
 bubble.appendChild(answerDiv2);
 }
 answerDiv2.textContent = mainContent;
 }

 // Search sources - 分组展示
 if (searchResults && searchResults.length > 0) {
 var srcDiv = document.createElement('div');
 srcDiv.className = 'search-source-panel';
 // 按来源分组
 var groups = {};
 var globalIdx = 0;
 searchResults.forEach(function(s) {
   var src = s._source || (s.fileName && !s.url ? 'knowledge_search' : 'web_search');
   if (!groups[src]) groups[src] = [];
   groups[src].push(s);
 });
 var sourceIcons = {
   'nmpa_search': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
   'web_search': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
   'knowledge_search': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
   'query_med_db': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>'
 };
 var sourceLabels = {
   'nmpa_search': '药监局数据',
   'web_search': '联网搜索',
   'knowledge_search': '知识库',
   'query_med_db': '价格数据'
 };
 var panelHtml = '<div class="search-panel-header"><span class="search-panel-title">参考来源</span><span class="search-panel-count">' + searchResults.length + ' 条结果</span></div>';
 Object.keys(groups).forEach(function(src) {
   var items = groups[src];
   var icon = sourceIcons[src] || sourceIcons['web_search'];
   var label = sourceLabels[src] || (items[0] && items[0]._sourceLabel) || src;
   panelHtml += '<div class="search-group">';
   panelHtml += '<div class="search-group-header" onclick="this.parentNode.classList.toggle(\'collapsed\')">';
   panelHtml += '<span class="search-group-icon">' + icon + '</span>';
   panelHtml += '<span class="search-group-label">' + label + '</span>';
   panelHtml += '<span class="search-group-count">' + items.length + ' 条</span>';
   panelHtml += '<span class="search-group-toggle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="6 9 12 15 18 9"/></svg></span>';
   panelHtml += '</div>';
   panelHtml += '<div class="search-group-items">';
   items.slice(0, 5).forEach(function(s) {
     globalIdx++;
     var name = s.title || s.fileName || s.url || '来源';
     var shortName = name.length > 40 ? name.substring(0, 40) + '...' : name;
     if (s.url) {
       panelHtml += '<a class="search-item" href="' + s.url + '" target="_blank" rel="noopener"><span class="search-item-idx">' + globalIdx + '</span><span class="search-item-title">' + shortName + '</span></a>';
     } else {
       panelHtml += '<span class="search-item"><span class="search-item-idx">' + globalIdx + '</span><span class="search-item-title">' + shortName + '</span></span>';
     }
   });
   if (items.length > 5) {
     panelHtml += '<span class="search-item-more">… 还有 ' + (items.length - 5) + ' 条</span>';
   }
   panelHtml += '</div></div>';
 });
 srcDiv.innerHTML = panelHtml;
 bubble.appendChild(srcDiv);
 }

 // ===== 导出工具栏 =====
 var exportBar = document.createElement('div');
 exportBar.className = 'export-toolbar';
 // 将 mainContent 存储在 bubble 上，供导出函数使用
 bubble.dataset.rawMarkdown = mainContent;
 var feedbackIdx = messageIndex++;
 exportBar.innerHTML = '<button class="export-btn" onclick="exportCopyMarkdown(this)" title="复制 Markdown">Markdown</button>' +
   '<button class="export-btn" onclick="exportCopyText(this)" title="复制纯文本">纯文本</button>' +
   '<button class="export-btn" onclick="exportCopyWechat(this)" title="复制为微信公众号格式">公众号</button>' +
   '<button class="export-btn" onclick="exportPDF(this)" title="导出 PDF">PDF</button>' +
   '<span class="feedback-spacer"></span>' +
   '<button class="feedback-btn-inline" onclick="submitFeedback(this,' + feedbackIdx + ',\'up\')" title="有帮助">&#128077;</button>' +
   '<button class="feedback-btn-inline" onclick="submitFeedback(this,' + feedbackIdx + ',\'down\')" title="需改进">&#128078;</button>';
 exportBar.dataset.userMsg = lastUserMsg;
 exportBar.dataset.assistantMsg = mainContent.substring(0, 2000);
 bubble.appendChild(exportBar);

 // Suggested questions
 if (suggestedQuestions.length > 0) {
 const chips = document.createElement('div');
 chips.className = 'suggested-chips';
 suggestedQuestions.slice(0, 3).forEach(q => {
 const btn = document.createElement('button');
 btn.className = 'suggested-chip';
 btn.textContent = q;
 btn.onclick = () => {
 document.getElementById('messageInput').value = q;
 chips.remove();
 sendMessage();
 };
 chips.appendChild(btn);
 });
 container.appendChild(chips);
 }
 container.scrollTop = container.scrollHeight;
 }

 function chatKeydown(e) {
 if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
 }

 function clearChat() {
 if (currentAgentId) startChat(currentAgentId);
 }

 // ===== SEARCH INDICATOR =====
 function showNmpaIndicator(products) {
 let el = document.getElementById('nmpaIndicator');
 if (!el) {
 el = document.createElement('div');
 el.id = 'nmpaIndicator';
 el.className = 'nmpa-indicator';
 const container = document.getElementById('chatMessages');
 container.appendChild(el);
 }
 const label = products && products.length > 0
 ? `正在查询药监局数据：${products.slice(0, 2).join('、')}...`
 : '正在查询药监局数据...';
 el.innerHTML = `<div class="nmpa-indicator-dot"></div> ${label}`;
 const container = document.getElementById('chatMessages');
 container.scrollTop = container.scrollHeight;
 }
 function hideNmpaIndicator() {
 const el = document.getElementById('nmpaIndicator');
 if (el) el.remove();
 }
 function showToolStatusIndicator(tool, text) {
 // 移除旧的状态提示
 hideToolStatusIndicator();
 const el = document.createElement('div');
 el.id = 'toolStatusIndicator';
 el.className = 'tool-status-indicator';
 const icons = {
 'web_search': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
 'query_med_db': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
 'nmpa_search': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
 'skill_dispatch': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
 };
 const icon = icons[tool] || '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
 el.innerHTML = `<span class="tool-status-icon">${icon}</span><span class="tool-status-text">${text}</span><span class="tool-status-dots"><span></span><span></span><span></span></span>`;
 const container = document.getElementById('chatMessages');
 container.appendChild(el);
 container.scrollTop = container.scrollHeight;
 }

 function hideToolStatusIndicator() {
 const el = document.getElementById('toolStatusIndicator');
 if (el) el.remove();
 }

 function showSearchIndicator() {
 let el = document.getElementById('searchIndicator');
 if (!el) {
 el = document.createElement('div');
 el.id = 'searchIndicator';
 el.className = 'search-indicator';
 el.innerHTML = '<div class="search-indicator-dot"></div> 正在搜索最新信息...';
 const container = document.getElementById('chatMessages');
 container.appendChild(el);
 container.scrollTop = container.scrollHeight;
 }
 }

 function hideSearchIndicator() {
 const el = document.getElementById('searchIndicator');
 if (el) el.remove();
 }

 function addMessage(role, content, searchResults, fileAttachment) {
 const container = document.getElementById('chatMessages');
 const welcome = document.getElementById('welcomeWrap');
 if (welcome) welcome.remove();
 let agent = null;
 AGENT_GROUPS.forEach(g => { const a = g.agents.find(x => x.id === currentAgentId); if (a) agent = a; });
 const row = document.createElement('div');
 row.className = 'msg-row ' + role;
 const avatar = document.createElement('div');
 avatar.className = 'msg-avatar';
 if (role === 'user') {
 avatar.textContent = currentUserName ? currentUserName.charAt(0).toUpperCase() : '我';
 } else if (agent) {
 avatar.innerHTML = `<img src="${getAgentDefaultImg(agent.id) || IP_IMAGES.douzai.default}" alt="${agent.name}" style="object-fit:contain">`;
 } else {
 avatar.textContent = '';
 }
 const bubble = document.createElement('div');
 bubble.className = 'msg-bubble';

 // Parse suggested questions: only extract from a clearly marked section at the very end
 // Pattern: last block after a line that contains only "---" AND is followed by question-like lines (starting with - or number)
 let mainContent = content;
 let suggestedQuestions = [];
 if (role === 'assistant') {
 // Only match if the LAST section after --- contains short question-like items
 // 找最后一个 ---（3+个短横线）后面跟引导问题的位置
 let lastSepIdx = -1;
 let sepLen = 0;
 const sepRegex = /-{3,}/g;
 let m;
 while ((m = sepRegex.exec(content)) !== null) {
 const afterPos = m.index + m[0].length;
 const afterStr = content.substring(afterPos, afterPos + 10).replace(/^\s*/, '');
 if (afterStr.startsWith('-') || afterStr.startsWith('我')) {
 lastSepIdx = m.index;
 sepLen = m[0].length;
 }
 }
 if (lastSepIdx > 0) {
 const afterSep = content.substring(lastSepIdx + sepLen).trim();
 let lines = afterSep.split('\n').map(l => l.trim()).filter(l => l.length > 0);
 if (lines.length <= 1 && afterSep.length > 10) {
 const cleaned = afterSep.replace(/^[-\s]+/, '');
 const pts = [];
 const pr = /(?<=[\u4e00-\u9fff\u201d\u201c"'）\)a-zA-Z0-9])[-](?=[\u4e00-\u9fff]{3,})/g;
 let pm;
 while ((pm = pr.exec(cleaned)) !== null) { pts.push(pm.index); }
 if (pts.length >= 2) {
 const segs = [];
 let prev = 0;
 for (const idx of pts) { segs.push(cleaned.substring(prev, idx).trim()); prev = idx + 1; }
 segs.push(cleaned.substring(prev).trim());
 lines = segs.filter(l => l.length > 4);
 }
 }
 if (lines.length >= 2 && lines.length <= 5) {
 mainContent = content.substring(0, lastSepIdx).trim();
 suggestedQuestions = lines.map(l => l.replace(/^[-*\d.\s]+/, '').trim()).filter(l => l.length > 4).map(q => q.replace(/skill_dispatch\([^)]*\)/g, '').replace(/nmpa_search\([^)]*\)/g, '').replace(/query_med_db\([^)]*\)/g, '').replace(/web_search\([^)]*\)/g, '').replace(/bocha_search\([^)]*\)/g, '').trim()).filter(q => q.length > 4);
 }
 }
 }

 if (role === 'assistant' && typeof marked !== 'undefined') {
 // 修复表格渲染：处理LLM生成表格的常见格式问题
 mainContent = (function(text) {
 text = text.replace(/^[ \t]+\|/gm, '|');
 var changed = true;
 while (changed) { var prev = text; text = text.replace(/(\|[^\n]*)\n\n(\|)/g, '$1\n$2'); changed = (text !== prev); }
 text = text.replace(/^([^|\n]+)(\|[^\n]+\|[ \t]*)$/gm, function(m, pre, row) {
 return (row.match(/\|/g)||[]).length >= 2 ? pre.trimEnd() + '\n' + row : m;
 });
 var lines = text.split('\n'), out = [];
 for (var i = 0; i < lines.length; i++) {
 var ln = lines[i], prev2 = i > 0 ? lines[i-1] : '';
 if (ln.trimStart().startsWith('|') && prev2 !== '' && !prev2.trimStart().startsWith('|')) out.push('');
 out.push(ln);
 }
 return out.join('\n');
 })(mainContent);
 bubble.innerHTML = (typeof DOMPurify !== 'undefined') ? DOMPurify.sanitize(marked.parse(mainContent)) : marked.parse(mainContent);
 injectCodeCopyBtns(bubble);
 wrapTables(bubble);
 injectAgentLinks(bubble);
 // 复制按钮（右上角）
 const copyBtn = document.createElement('button');
 copyBtn.className = 'msg-copy-btn';
 copyBtn.title = '复制内容';
 copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
 copyBtn.onclick = function() {
 const text = mainContent || content || '';
 navigator.clipboard.writeText(text).then(() => {
 copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
 copyBtn.classList.add('copied');
 setTimeout(() => {
 copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
 copyBtn.classList.remove('copied');
 }, 2000);
 }).catch(() => {
 // 降级：选中文本
 const range = document.createRange();
 range.selectNodeContents(bubble);
 window.getSelection().removeAllRanges();
 window.getSelection().addRange(range);
 });
 };
 bubble.appendChild(copyBtn);
 } else {
 // For user messages: render text + optional image thumbnail
 if (fileAttachment && fileAttachment.isImage) {
 // Show image thumbnail above the text
 const imgEl = document.createElement('img');
 imgEl.src = fileAttachment.isImage;
 imgEl.alt = fileAttachment.fileName || '图片';
 imgEl.style.cssText = 'max-width:220px;max-height:160px;border-radius:8px;display:block;margin-bottom:0.4rem;object-fit:cover;';
 bubble.appendChild(imgEl);
 if (mainContent) {
 const textEl = document.createElement('span');
 textEl.textContent = mainContent;
 bubble.appendChild(textEl);
 }
 } else {
 bubble.textContent = mainContent;
 }
 }
 if (role === 'assistant') {
 // Append search sources if available
 if (searchResults && searchResults.length > 0) {
 const srcDiv = document.createElement('div');
 srcDiv.className = 'search-source-list';
 const isKb = searchResults.some(s => s.fileName && !s.url);
 const label = isKb ? '知识库参考：' : '联网参考：';
 const links = searchResults.slice(0, 5).map((s, i) => {
 const name = s.title || s.fileName || s.url || '来源';
 if (s.url) return `<a href="${s.url}" target="_blank" rel="noopener" title="${name}">[${i+1}] ${name}</a>`;
 return `<span class="src-tag">[${i+1}] ${name}</span>`;
 }).join('');
 srcDiv.innerHTML = `<span class="src-label">${label}</span>${links}`;
 bubble.appendChild(srcDiv);
 }
 const feedback = document.createElement('div');
 feedback.className = 'msg-feedback';
 const idx = messageIndex++;
 feedback.dataset.userMsg = lastUserMsg;
 feedback.dataset.assistantMsg = (mainContent || content || '').substring(0, 2000);
 feedback.innerHTML = `<span class="feedback-hint">有帮助吗？</span><button class="feedback-btn" onclick="submitFeedback(this,${idx},'up')">+1</button><button class="feedback-btn" onclick="submitFeedback(this,${idx},'down')">-1</button>`;
 bubble.appendChild(feedback);
 row.appendChild(avatar);
 row.appendChild(bubble);
 } else {
 row.appendChild(bubble);
 row.appendChild(avatar);
 }
 container.appendChild(row);

 // Render suggested question chips below the message row
 if (suggestedQuestions.length > 0) {
 const chips = document.createElement('div');
 chips.className = 'suggested-chips';
 suggestedQuestions.slice(0, 3).forEach(q => {
 const btn = document.createElement('button');
 btn.className = 'suggested-chip';
 btn.textContent = q;
 btn.onclick = () => {
 document.getElementById('messageInput').value = q;
 chips.remove();
 sendMessage();
 };
 chips.appendChild(btn);
 });
 container.appendChild(chips);
 }

 container.scrollTop = container.scrollHeight;
 }

 // ===== 豆家族 IP 每日随机表情系统 =====
 // CDN 图片 URL 映射
 const IP_IMAGES = {
 douzai: {
 default: 'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/lkleXNWjvNBnZSFf.png',
 coffee: 'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/rjPpzzLlGpyvxbqt.png',
 sunglasses: 'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/NOVaxZGFzklFfZWl.png',
 report: 'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/ckMnXdDaGftHiMsE.png',
 sleepy: 'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/ceWeFipQIhwrhMma.png',
 happy: 'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/SUMTPQTiSPDTeymf.png'
 },
 douding: {
 default: 'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/mCgIAyciTIFSktIr.png',
 flower: 'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/pRLZVoDDAMIMQjQv.png',
 mic: 'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/HIFmVxrUNuGQfJiM.png',
 thumbsup: 'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/EEfIJXWniWUbSaWX.png',
 shy: 'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/epLEHiXZlZnuGdnD.png',
 drink: 'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/AdylnJBCAhLndjvK.png'
 },
 douya: {
 default: 'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/nFMiXmuQZFLIAcqJ.png',
 think: 'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/cNOoLRxvVJbDUcTJ.png',
 writing: 'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/SBXxIVevjtrXMimJ.png',
 run: 'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/wBCnhqAwZvRnaWuv.png',
 flag: 'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/TOaZzkCOmXMzrVqI.png',
 confused: 'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/wOhspvFbxIPEdMjb.png'
 }
 };

 // 豆子的情绪→状态映射（兼容旧的 thinking/happy/confused/talking）
 const DOUZAI_EMOTION_MAP = {
 default: 'default',
 thinking: 'report',
 happy: 'happy',
 confused: 'sleepy',
 talking: 'coffee'
 };
 // 豆丁的情绪→状态映射
 const DOUDING_EMOTION_MAP = {
 default: 'default',
 thinking: 'mic',
 happy: 'thumbsup',
 confused: 'shy',
 talking: 'drink'
 };
 // 豆芽的情绪→状态映射
 const DOUYA_EMOTION_MAP = {
 default: 'default',
 thinking: 'think',
 happy: 'flag',
 confused: 'confused',
 talking: 'writing'
 };

 // 每日随机变体（基于日期 seed，同一天同一用户看到同一变体）
 function getDailyVariant(ipName) {
 const today = new Date();
 const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
 const variants = Object.keys(IP_IMAGES[ipName] || {}).filter(k => k !== 'default');
 if (!variants.length) return 'default';
 const idx = seed % variants.length;
 return variants[idx];
 }

 // 获取当前 agent 对应的 IP 名称
 function getIPName(agentId) {
 // 统一品牌 IP：所有 Agent 都使用豆子（Douzai）形象
 return 'douzai';
 }

 // 获取当前 agent 的默认（每日随机）图片
 function getAgentDefaultImg(agentId) {
 const ipName = getIPName(agentId);
 if (!ipName) return null;
 const variant = getDailyVariant(ipName);
 return IP_IMAGES[ipName][variant] || IP_IMAGES[ipName].default;
 }

 // 兼容旧的 DOUDOU_EMOTIONS（保留以防其他地方引用）
 const DOUDOU_EMOTIONS = {
 default: IP_IMAGES.douzai.default,
 thinking: IP_IMAGES.douzai.report,
 happy: IP_IMAGES.douzai.happy,
 confused: IP_IMAGES.douzai.sleepy,
 talking: IP_IMAGES.douzai.coffee
 };

 function setDoudouEmotion(emotion) {
 setAgentEmotion(currentAgentId, emotion);
 }

 function setAgentEmotion(agentId, emotion) {
 const ipName = getIPName(agentId);
 if (!ipName) return;
 const ipImages = IP_IMAGES[ipName];
 let emotionMap;
 if (ipName === 'douzai') emotionMap = DOUZAI_EMOTION_MAP;
 else if (ipName === 'douding') emotionMap = DOUDING_EMOTION_MAP;
 else emotionMap = DOUYA_EMOTION_MAP;
 const stateKey = emotionMap[emotion] || 'default';
 const src = ipImages[stateKey] || ipImages.default;
 const welcomeImg = document.getElementById('welcomeMascotImg');
 if (welcomeImg) welcomeImg.src = src;
 const topbarAvatar = document.getElementById('topbarAvatar');
 if (topbarAvatar) { const img = topbarAvatar.querySelector('img'); if (img) img.src = src; }
 const desktopImg = document.getElementById('desktopMascotImg');
 if (desktopImg) desktopImg.src = src;
 }

 function showTyping() {
 const container = document.getElementById('chatMessages');
 let agent = null;
 AGENT_GROUPS.forEach(g => { const a = g.agents.find(x => x.id === currentAgentId); if (a) agent = a; });
 const row = document.createElement('div');
 row.className = 'msg-row assistant';
 row.id = 'typingRow';
 const avatar = document.createElement('div');
 avatar.className = 'msg-avatar';
 if (agent) {
 avatar.innerHTML = `<img src="${getAgentDefaultImg(agent.id) || IP_IMAGES.douzai.default}" alt="${agent.name}" style="object-fit:contain">`;
 } else { avatar.textContent = ''; }
 const dots = document.createElement('div');
 dots.className = 'typing-dots';
 dots.innerHTML = '<svg class=\'typing-pen-svg\' width=\'64\' height=\'20\' viewBox=\'0 0 64 20\' fill=\'none\' xmlns=\'http://www.w3.org/2000/svg\'><path class=\'pen-path\' d=\'M4 16 Q12 4 20 14 Q28 4 36 14 Q44 4 52 14 Q58 8 62 10\' stroke=\'#AEAAA5\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\' fill=\'none\'/></svg>';
 row.appendChild(avatar);
 row.appendChild(dots);
 container.appendChild(row);
 container.scrollTop = container.scrollHeight;
 }

 function hideTyping() { const el = document.getElementById('typingRow'); if (el) el.remove(); }

 function showError(msg) {
 const w = document.getElementById('welcomeWrap');
 if (w) w.innerHTML = `<div class="welcome-error">${msg}</div>`;
 }

 async function submitFeedback(btn, idx, val) {
 btn.parentElement.querySelectorAll('.feedback-btn').forEach(b => b.classList.remove('active-up','active-down'));
 btn.classList.add(val === 'up' ? 'active-up' : 'active-down');
 // 显示感谢提示
 const hint = btn.parentElement.querySelector('.feedback-hint');
 if (hint) { hint.textContent = val === 'up' ? '感谢反馈，将用于改进训练' : '已记录，将持续优化'; hint.style.color = val === 'up' ? '#16A34A' : '#DC2626'; }
 try {
 const feedbackDiv = btn.parentElement;
 const userMsg = feedbackDiv.dataset.userMsg || '';
 const assistantMsg = feedbackDiv.dataset.assistantMsg || '';
 await fetch('/api/feedback', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ sessionId, messageIndex: idx, feedback: val, userMsg, assistantMsg })
 });
 } catch {}
 }

 // ===== SETTINGS =====
 // ===== API CONFIG (server-side synced) =====
 let _cachedApiConfig = null;
 async function loadSettings() {
 if (_cachedApiConfig) return _cachedApiConfig;
 try {
 const data = await fetch('/api/user/api-config', { credentials: 'include' }).then(r => r.json());
 _cachedApiConfig = { provider: data.provider || '', apiKey: data.apiKey || '', model: data.model || '', baseUrl: data.baseUrl || '' };
 } catch {
 _cachedApiConfig = { provider: localStorage.getItem('ma_provider') || '', apiKey: localStorage.getItem('ma_apikey') || '', model: localStorage.getItem('ma_model') || '', baseUrl: '' };
 }
 return _cachedApiConfig;
 }
 async function openSettings(tab) {
 const s = await loadSettings();
 document.getElementById('settingsProvider').value = s.provider;
 document.getElementById('settingsApiKey').value = s.apiKey;
 document.getElementById('settingsBaseUrl').value = s.baseUrl || '';
 onProviderChange();
 document.getElementById('settingsModel').value = s.model;
 document.getElementById('settingsModal').classList.add('open');
 if (tab) switchTab(tab);
 document.getElementById('userMenu').classList.remove('open');
 }
 function closeSettings() { document.getElementById('settingsModal').classList.remove('open'); }
 function switchTab(tab) {
 document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
 document.querySelectorAll('.modal-pane').forEach(p => p.classList.remove('active'));
 document.getElementById('tab-' + tab).classList.add('active');
 document.getElementById('pane-' + tab).classList.add('active');
 }
 async function saveSettings() {
 const provider = document.getElementById('settingsProvider').value;
 const apiKey = document.getElementById('settingsApiKey').value.trim();
 const model = document.getElementById('settingsModel').value;
 const baseUrl = document.getElementById('settingsBaseUrl').value.trim();
 _cachedApiConfig = { provider, apiKey, model, baseUrl };
 try {
 await fetch('/api/user/api-config', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, apiKey, model, baseUrl }) });
 } catch {}
 localStorage.setItem('ma_provider', provider);
 localStorage.setItem('ma_apikey', apiKey);
 localStorage.setItem('ma_model', model);
 updateModelLabel();
 closeSettings();
 }
 function onProviderChange() {
 const p = document.getElementById('settingsProvider').value;
 const sel = document.getElementById('settingsModel');
 sel.innerHTML = '<option value="">使用服务器默认</option>';
 if (p && PROVIDERS_MODELS[p]) {
 PROVIDERS_MODELS[p].forEach(m => {
 const opt = document.createElement('option');
 opt.value = m; opt.textContent = m;
 sel.appendChild(opt);
 });
 }
 const notice = document.getElementById('gemma4Notice');
 if (notice) notice.style.display = (p === 'gemma4') ? 'block' : 'none';
 }
 function updateModelLabel() {
 const m = (_cachedApiConfig && _cachedApiConfig.model) || localStorage.getItem('ma_model');
 const p = (_cachedApiConfig && _cachedApiConfig.provider) || localStorage.getItem('ma_provider');
 const label = m ? m.split('/').pop() : (p ? p : '默认模型');
 document.getElementById('modelLabel').textContent = label;
 }
 function copyInviteCode() {
 const val = document.getElementById('inviteCode').value;
 if (!val || val === '加载中...') return;
 navigator.clipboard.writeText(val).then(() => {
 showToast('邀请码已复制！');
 }).catch(() => {
 // Fallback for older browsers
 const el = document.getElementById('inviteCode');
 el.select();
 document.execCommand('copy');
 showToast('邀请码已复制！');
 });
 }

 function copyInviteLink() {
 const val = document.getElementById('inviteLink').value;
 if (!val || val === '加载中...') return;
 navigator.clipboard.writeText(val).then(() => {
 showToast('邀请链接已复制！');
 }).catch(() => {
 const el = document.getElementById('inviteLink');
 el.select();
 document.execCommand('copy');
 showToast('邀请链接已复制！');
 });
 }

 function openCreditApply() {
 const modal = document.getElementById('creditApplyModal');
 if (modal) {
 modal.style.display = 'flex';
 document.getElementById('creditContact').value = '';
 document.getElementById('creditAmount').value = '';
 document.getElementById('creditNote').value = '';
 }
 }

 function closeCreditApply() {
 const modal = document.getElementById('creditApplyModal');
 if (modal) modal.style.display = 'none';
 }

 async function submitCreditApply() {
 const contact = document.getElementById('creditContact').value.trim();
 const amount = document.getElementById('creditAmount').value.trim();
 const note = document.getElementById('creditNote').value.trim();
 if (!contact) { showToast('请填写手机号或微信号'); return; }
 if (!amount || isNaN(amount) || Number(amount) < 1) { showToast('请填写有效的抵扣金额'); return; }
 const btn = document.getElementById('btnSubmitCredit');
 btn.disabled = true;
 btn.textContent = '提交中...';
 try {
 const res = await fetch('/api/credit-apply', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 credentials: 'include',
 body: JSON.stringify({ contact, amount: Number(amount), note })
 });
 const data = await res.json();
 if (data.success) {
 closeCreditApply();
 showToast('申请已提交，管理员将24小时内处理');
 } else {
 showToast(data.error || '提交失败，请重试');
 btn.disabled = false;
 btn.textContent = '提交申请';
 }
 } catch (e) {
 showToast('网络错误，请重试');
 btn.disabled = false;
 btn.textContent = '提交申请';
 }
 }

 function showToast(msg) {
 let toast = document.getElementById('copyToast');
 if (!toast) {
 toast = document.createElement('div');
 toast.id = 'copyToast';
 toast.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:0.5rem 1.25rem;border-radius:2rem;font-size:0.875rem;z-index:9999;pointer-events:none;transition:opacity 0.3s';
 document.body.appendChild(toast);
 }
 toast.textContent = msg;
 toast.style.opacity = '1';
 clearTimeout(toast._timer);
 toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
 }

 // ===== USER MENU =====
 function toggleUserMenu() {
 document.getElementById('userMenu').classList.toggle('open');
 }
 document.addEventListener('click', function(e) {
 if (!document.getElementById('sidebarUser').contains(e.target)) {
 document.getElementById('userMenu').classList.remove('open');
 }
 });
 async function doLogout() {
 try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
 window.location.href = '/login.html';
 }

 // ===== UTILS =====
 function autoResize(el) {
 el.style.height = 'auto';
 el.style.height = Math.min(el.scrollHeight, 160) + 'px';
 }

 init();

 // ===== 微信支付 =====
 let payCheckTimer = null;
 let payTradeNo = null;

 async function startPayment(plan) {
 const btn = document.getElementById('btnBuyPro');
 btn.disabled = true;
 btn.textContent = '生成支付码...';
 try {
 const res = await fetch('/api/payment/create-order', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ plan })
 });
 const data = await res.json();
 if (!res.ok || !data.codeUrl) {
 alert(data.error || '创建支付订单失败，请稍后重试');
 btn.disabled = false;
 btn.textContent = '立即订阅';
 return;
 }
 payTradeNo = data.out_trade_no;
 showPayModal(plan, data.codeUrl);
 } catch (e) {
 alert('网络错误，请稍后重试');
 } finally {
 btn.disabled = false;
 btn.textContent = '立即订阅';
 }
 }

 function showPayModal(plan, codeUrl) {
 // 移除旧弹窗
 const old = document.getElementById('payModal');
 if (old) old.remove();
 if (payCheckTimer) clearInterval(payCheckTimer);

 const modal = document.createElement('div');
 modal.id = 'payModal';
 modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center';
 modal.innerHTML = `
 <div style="background:#fff;border-radius:16px;padding:2rem;width:320px;text-align:center;position:relative">
 <button onclick="closePayModal()" style="position:absolute;top:1rem;right:1rem;background:none;border:none;font-size:1.25rem;cursor:pointer;color:#767676"></button>
 <div style="font-weight:700;font-size:1rem;margin-bottom:0.25rem">微信扫码支付</div>
 <div style="font-size:0.8rem;color:#767676;margin-bottom:1rem">${plan.name} · ¥${(plan.price/100).toFixed(0)}/月</div>
 <div id="qrcodeBox" style="display:inline-block;padding:0.75rem;border:1.5px solid #e8e5e0;border-radius:10px;margin-bottom:1rem"></div>
 <div style="font-size:0.75rem;color:#767676">请在 5 分钟内完成支付</div>
 <div id="payStatus" style="margin-top:0.75rem;font-size:0.8rem;color:#5a5a5a">等待支付...</div>
 </div>
 `;
 document.body.appendChild(modal);

 // 生成二维码
 new QRCode(document.getElementById('qrcodeBox'), {
 text: codeUrl,
 width: 180,
 height: 180,
 colorDark: '#191919',
 colorLight: '#ffffff',
 correctLevel: QRCode.CorrectLevel.M
 });

 // 轮询支付结果（每 3 秒查询一次，最多 5 分钟）
 let elapsed = 0;
 payCheckTimer = setInterval(async () => {
 elapsed += 3;
 if (elapsed > 300) {
 clearInterval(payCheckTimer);
 document.getElementById('payStatus').textContent = '支付超时，请重新发起';
 return;
 }
 try {
 const r = await fetch(`/api/payment/query?trade_no=${payTradeNo}`);
 const d = await r.json();
 if (d.paid) {
 clearInterval(payCheckTimer);
 document.getElementById('payStatus').innerHTML = '支付成功！正在刷新...';
 setTimeout(() => { closePayModal(); location.reload(); }, 1500);
 }
 } catch {}
 }, 3000);
 }

 function closePayModal() {
 if (payCheckTimer) clearInterval(payCheckTimer);
 const m = document.getElementById('payModal');
 if (m) m.remove();
 }

 // ===== HISTORY =====
 async function showHistory() {
 const modal = document.getElementById('historyModal');
 modal.style.display = 'flex';
 const list = document.getElementById('historyList');
 list.innerHTML = '<div style="text-align:center;color:var(--text-3);padding:2rem;font-size:0.85rem">加载中...</div>';

 try {
 const agentParam = currentAgentId ? `?agent=${currentAgentId}` : '';
 const res = await fetch(`/api/chat/sessions${agentParam}`);
 if (!res.ok) throw new Error('Failed to load history');
 const data = await res.json();

 if (!data.sessions || data.sessions.length === 0) {
 list.innerHTML = '<div class="history-empty">还没有历史对话记录<br><span style="font-size:0.78rem;margin-top:0.5rem;display:inline-block">开始和 AI 助手对话后，记录会自动保存在这里</span></div>';
 return;
 }

 // Find agent icon from AGENT_GROUPS
      function getAgentIcon(agentId) {
        for (const g of AGENT_GROUPS) {
          const a = g.agents.find(x => x.id === agentId);
          if (a) return a.name ? a.name.charAt(0) : '';
        }
        return '';
      }

 function formatTime(ts) {
 if (!ts) return '';
 const d = new Date(ts + 'Z');
 const now = new Date();
 const diff = now - d;
 if (diff < 60000) return '刚刚';
 if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
 if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
 if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
 return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
 }

 list.innerHTML = '';
 data.sessions.forEach(s => {
 const item = document.createElement('div');
 item.className = 'history-item';
 item.onclick = () => loadHistorySession(s.id, s.agentId);
 item.innerHTML = `
 <div class="history-item-icon">${getAgentIcon(s.agentId)}</div>
 <div class="history-item-info">
 <div class="history-item-title">${s.agentName || s.agentId}</div>
 <div class="history-item-preview">${s.preview || '无预览'}</div>
 </div>
 <div class="history-item-time">${formatTime(s.updatedAt)}</div>
 `;
 list.appendChild(item);
 });
 } catch (e) {
 console.error('Load history error:', e);
 list.innerHTML = '<div class="history-empty">加载失败，请稍后重试</div>';
 }
 }

 function closeHistory() {
 document.getElementById('historyModal').style.display = 'none';
 }

 async function loadHistorySession(historySessionId, agentId) {
 closeHistory();
 try {
 const res = await fetch(`/api/chat/session-messages?sessionId=${historySessionId}`);
 if (!res.ok) throw new Error('Failed to load session messages');
 const data = await res.json();

 // Find agent info
 let agent = null;
 AGENT_GROUPS.forEach(g => { const a = g.agents.find(x => x.id === (agentId || data.agentId)); if (a) agent = a; });
 if (!agent) {
 agent = { id: agentId || data.agentId, icon: '', name: data.agentName || agentId, desc: '' };
 }

 // Switch to chat view
 currentAgentId = agent.id;
 switchView('chat');

 // Update sidebar active state
 document.querySelectorAll('.sidebar-agent').forEach(el => {
 el.classList.toggle('active', el.dataset.agentId === agent.id);
 });

 // Update topbar
 document.title = agent.name + ' - MedAgent Hub (历史记录)';
 const histTopbarAvatar = document.getElementById('topbarAvatar');
 histTopbarAvatar.innerHTML = `<img src="${getAgentDefaultImg(agent.id) || IP_IMAGES.douzai.default}" alt="${agent.name}" style="object-fit:contain">`;
 document.getElementById('topbarName').textContent = agent.name;
 document.getElementById('topbarDesc').textContent = '历史对话记录';

 // Render messages
 const container = document.getElementById('chatMessages');
 container.innerHTML = '';
 messageIndex = 0;

 data.messages.forEach(m => {
 addMessage(m.role, m.content);
 });

 // Disable input for history view, prompt user to start new chat
 document.getElementById('messageInput').disabled = true;
 document.getElementById('sendBtn').disabled = true;
 document.getElementById('chatInputHint').innerHTML = '这是历史记录，<a href="javascript:startChat(\'' + agent.id + '\')" style="color:var(--coral);text-decoration:underline">点击开始新对话</a>';
 document.getElementById('chatStatus').style.display = 'none';
 sessionId = null;
 currentHistorySessionId = historySessionId;
 // Hide combo tags in history view
 const comboEl = document.getElementById('comboQuickTags');
 if (comboEl) { comboEl.style.display = 'none'; comboEl.innerHTML = ''; }
 } catch (e) {
 console.error('Load history session error:', e);
 alert('加载历史记录失败，请稍后重试');
 }
 }

 // Close history modal on overlay click
 document.getElementById('historyModal').addEventListener('click', function(e) {
 if (e.target === this) closeHistory();
 });

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
 if (label) label.textContent = '专家模式';
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

 // 初始化拖拽功能
 document.addEventListener('DOMContentLoaded', initDragDrop);

 // ===== 会话快照功能 v2 =====
 let currentSnapshotSessionId = null;
 let lastSnapshotResult = null; // 保存最近一次快照结果
 let loadedSkillContext = null; // 当前加载的技能上下文

 function openSnapshotModal() {
 currentSnapshotSessionId = sessionId || currentHistorySessionId || null;
 if (!currentSnapshotSessionId) {
 alert('请先开始一段对话');
 return;
 }
 document.getElementById('snapshotNameInput').value = '';
 document.getElementById('snapshotStatus').textContent = '';
 document.getElementById('snapshotConfirmBtn').disabled = false;
 document.getElementById('snapshotConfirmBtn').style.display = '';
 document.getElementById('snapshotPreview').style.display = 'none';
 document.getElementById('snapshotPreview').innerHTML = '';
 document.getElementById('snapshotPreviewActions').style.display = 'none';
 lastSnapshotResult = null;
 document.getElementById('snapshotOverlay').classList.add('active');
 setTimeout(() => document.getElementById('snapshotNameInput').focus(), 100);
 }

 function closeSnapshotModal() {
 document.getElementById('snapshotOverlay').classList.remove('active');
 document.getElementById('snapshotNameInput').disabled = false;
 currentSnapshotSessionId = null;
 }

 async function confirmSnapshot() {
 const nameInput = document.getElementById('snapshotNameInput');
 const statusEl = document.getElementById('snapshotStatus');
 const confirmBtn = document.getElementById('snapshotConfirmBtn');
 const previewEl = document.getElementById('snapshotPreview');
 const previewActions = document.getElementById('snapshotPreviewActions');
 const skillName = nameInput.value.trim();
 if (!skillName) {
 statusEl.textContent = '请输入技能名称';
 statusEl.style.color = '#e57373';
 nameInput.focus();
 return;
 }
 confirmBtn.disabled = true;
 statusEl.textContent = '正在提炼对话中的专业知识，请稍候...';
 statusEl.style.color = 'var(--text-secondary)';
 try {
 const resp = await fetch('/api/chat/snapshot', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ sessionId: currentSnapshotSessionId, skillName })
 });
 const data = await resp.json();
 if (data.success) {
 lastSnapshotResult = data;
 statusEl.textContent = '技能包已生成！请预览并选择操作：';
 statusEl.style.color = '#66bb6a';
 // 显示预览
 previewEl.innerHTML = (typeof DOMPurify !== 'undefined') ? DOMPurify.sanitize(marked.parse(data.markdown || data.summary || '')) : marked.parse(data.markdown || data.summary || '');
 previewEl.style.display = 'block';
 previewActions.style.display = 'flex';
 confirmBtn.style.display = 'none';
 // 刷新技能包列表
 loadSkillsList();
 } else {
 statusEl.textContent = data.error || '保存失败';
 statusEl.style.color = '#e57373';
 confirmBtn.disabled = false;
 }
 } catch (e) {
 statusEl.textContent = '网络错误，请重试';
 statusEl.style.color = '#e57373';
 confirmBtn.disabled = false;
 }
 }

 // 下载快照为 Markdown 文件
 function downloadSnapshot() {
 if (!lastSnapshotResult || !lastSnapshotResult.skillId) return;
 window.open(`/api/chat/snapshot/download?skillId=${lastSnapshotResult.skillId}`, '_blank');
 }

 // 复制快照 Markdown 内容
 async function copySnapshotMarkdown() {
 if (!lastSnapshotResult) return;
 const text = lastSnapshotResult.markdown || lastSnapshotResult.summary || '';
 try {
 await navigator.clipboard.writeText(text);
 const statusEl = document.getElementById('snapshotStatus');
 statusEl.textContent = '已复制到剪贴板';
 statusEl.style.color = '#66bb6a';
 } catch (e) {
 // fallback
 const ta = document.createElement('textarea');
 ta.value = text;
 document.body.appendChild(ta);
 ta.select();
 document.execCommand('copy');
 document.body.removeChild(ta);
 const statusEl = document.getElementById('snapshotStatus');
 statusEl.textContent = '已复制到剪贴板';
 statusEl.style.color = '#66bb6a';
 }
 }

 // 加载快照到当前对话
 async function loadSnapshotToChat() {
 if (!lastSnapshotResult || !lastSnapshotResult.skillId) return;
 await loadSkillToCurrentChat(lastSnapshotResult.skillId);
 closeSnapshotModal();
 }

 // 通用技能加载函数
 async function loadSkillToCurrentChat(skillId) {
 try {
 const resp = await fetch(`/api/chat/snapshot/load?skillId=${skillId}`);
 const data = await resp.json();
 if (data.success) {
 loadedSkillContext = data;
 // 在输入框上方显示已加载的技能标记
 const fileCount = (data.attachedFiles || []).length;
 const badgeText = fileCount > 0
 ? data.skillName + ' (' + fileCount + '个关联文件)'
 : data.skillName;
 showLoadedSkillBadge(badgeText);
 // 将技能内容作为下一次发送消息的前缀上下文
 const input = document.getElementById('messageInput');
 if (input && !input.value.trim()) {
 input.placeholder = `已加载技能「${data.skillName}」，请输入问题...`;
 }
 } else {
 alert(data.error || '加载失败');
 }
 } catch (e) {
 alert('网络错误，请重试');
 }
 }

 // 显示已加载技能的标记
 function showLoadedSkillBadge(skillName) {
 // 移除旧的
 const old = document.querySelector('.skill-loaded-badge');
 if (old) old.remove();
 const badge = document.createElement('div');
 badge.className = 'skill-loaded-badge';
 badge.innerHTML = `技能: ${skillName} <button onclick="unloadSkill()" title="卸载">&times;</button>`;
 const inputWrap = document.querySelector('.chat-input-left');
 if (inputWrap) inputWrap.prepend(badge);
 }

 // 卸载技能
 function unloadSkill() {
 loadedSkillContext = null;
 const badge = document.querySelector('.skill-loaded-badge');
 if (badge) badge.remove();
 const input = document.getElementById('messageInput');
 if (input) input.placeholder = 'Enter 发送，Shift+Enter 换行';
 }

 // ===== 资源面板标签页切换 =====
 function switchResourceTab(tab) {
 document.querySelectorAll('.resource-tab').forEach((el, i) => {
 el.classList.toggle('active', (tab === 'files' && i === 0) || (tab === 'kb' && i === 1) || (tab === 'skills' && i === 2));
 });
 document.getElementById('resourceTabFiles').classList.toggle('active', tab === 'files');
 document.getElementById('resourceTabKB').classList.toggle('active', tab === 'kb');
 document.getElementById('resourceTabSkills').classList.toggle('active', tab === 'skills');
 if (tab === 'kb') loadKBList();
 if (tab === 'skills') loadSkillsList();
 }

 // ===== 知识库列表 =====
 let kbFiles = [];
 async function loadKBList() {
 const container = document.getElementById('kbFileList');
 try {
 const resp = await fetch('/api/kb/list');
 const data = await resp.json();
 kbFiles = data.files || [];
 if (kbFiles.length === 0) {
 container.innerHTML = '<div class="resource-empty">知识库暂无文档<br><span style="font-size:0.7rem">管理员可在知识库管理页上传文档</span></div>';
 return;
 }
 container.innerHTML = kbFiles.map((f, idx) => {
 const icon = getKBFileIcon(f.name);
 const date = new Date(f.addedAt).toLocaleDateString('zh-CN');
 const scopeLabel = f.scope === 'global' ? '全局' : f.scope.replace('agent:', '');
 return '<div class="resource-item kb-item" draggable="true" ondragstart="onKBItemDragStart(event,' + idx + ')" onclick="citeKBInInput(' + idx + ')" title="' + f.name + '">' +
 '<span class="resource-item-icon">' + icon + '</span>' +
 '<div class="kb-item-info">' +
 '<span class="resource-item-name">' + truncateFileName(f.name, 28) + '</span>' +
 '<span class="kb-item-meta">' + scopeLabel + ' | ' + f.chunks + '块 | ' + date + '</span>' +
 '</div>' +
 '<button class="resource-item-cite" onclick="event.stopPropagation();openKBPreview(\'' + f.id + '\')" style="margin-right:2px">预览</button>' +
 '<button class="resource-item-cite" onclick="event.stopPropagation();citeKBInInput(' + idx + ')">引用</button>' +
 '</div>';
 }).join('');
 } catch (e) {
 container.innerHTML = '<div class="resource-empty">加载失败</div>';
 }
 }

 function getKBFileIcon(name) {
 const ext = (name.split('.').pop() || '').toLowerCase();
 const icons = {
 pdf: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
 doc: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2980b9" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
 docx: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2980b9" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
 md: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#27ae60" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
 txt: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7f8c8d" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
 };
 return icons[ext] || icons.txt;
 }

 function truncateFileName(name, maxLen) {
 if (name.length <= maxLen) return name;
 const ext = name.lastIndexOf('.');
 if (ext > 0) {
 const base = name.substring(0, ext);
 const suffix = name.substring(ext);
 const keep = maxLen - suffix.length - 3;
 if (keep > 4) return base.substring(0, keep) + '...' + suffix;
 }
 return name.substring(0, maxLen - 3) + '...';
 }

 function citeKBInInput(idx) {
 const f = kbFiles[idx];
 if (!f) return;
 const input = document.getElementById('messageInput');
 const citeText = '[引用知识库《' + truncateFileName(f.name, 30) + '》] ';
 if (!input.value.trim()) {
 input.value = citeText;
 } else {
 input.value = input.value.trimEnd() + ' ' + citeText;
 }
 input.focus();
 autoResize(input);
 }

 function onKBItemDragStart(event, idx) {
 const f = kbFiles[idx];
 event.dataTransfer.effectAllowed = 'copy';
 event.dataTransfer.setData('text/plain', '[引用知识库《' + truncateFileName(f.name, 30) + '》] ');
 event.dataTransfer.setData('application/x-kb-idx', String(idx));
 }

 // ===== 技能包列表管理 =====
 async function loadSkillsList() {
 const container = document.getElementById('skillsList');
 try {
 const resp = await fetch('/api/chat/snapshots');
 const data = await resp.json();
 const snapshots = data.snapshots || [];
 if (snapshots.length === 0) {
 container.innerHTML = '<div class="resource-empty">暂无技能包<br><span style="font-size:0.7rem">对话超过 4 条消息后，点击“快照”按钮提炼技能包</span></div>';
 return;
 }
 container.innerHTML = snapshots.map(s => {
 const date = new Date(s.createdAt).toLocaleDateString('zh-CN');
 const isV2 = s.skillFormat === 'v2';
 const goalText = s.goal ? `<div class="skill-card-goal">${s.goal.substring(0, 80)}</div>` : '';
 const formatBadge = isV2 ? '<span class="skill-card-format-badge">SKILL</span>' : '';
 return `<div class="skill-card" onclick="previewSkill('${s.id}')">
 <div class="skill-card-header">
 <span class="skill-card-name">${formatBadge}${s.skillName || s.id}</span>
 <span class="skill-card-badge">${s.messageCount}条对话</span>
 </div>
 ${goalText}
 <div class="skill-card-meta">来源: ${s.agentName || '未知'} | ${date}</div>
 <div class="skill-card-actions">
 <button class="skill-action-btn" onclick="event.stopPropagation();loadSkillToCurrentChat('${s.id}')">加载</button>
 <button class="skill-action-btn" onclick="event.stopPropagation();shareSkill('${s.id}')">分享</button>
 <button class="skill-action-btn" onclick="event.stopPropagation();downloadSkill('${s.id}')">下载</button>
 <button class="skill-action-btn" onclick="event.stopPropagation();exportSkillAsMhub('${s.id}')" title="导出为 .mhub 格式">.mhub</button>
 <button class="skill-action-btn danger" onclick="event.stopPropagation();deleteSkill('${s.id}')">删除</button>
 </div>
 </div>`;
 }).join('');
 } catch (e) {
 container.innerHTML = '<div class="resource-empty">加载失败，请重试</div>';
 }
 }

 // 预览技能包
 async function previewSkill(skillId) {
 try {
 const resp = await fetch(`/api/chat/snapshot/preview?skillId=${skillId}`);
 const data = await resp.json();
 if (data.success) {
 lastSnapshotResult = { skillId, markdown: data.markdown, skillName: data.meta.skillName };
 document.getElementById('snapshotNameInput').value = data.meta.skillName || '';
 document.getElementById('snapshotNameInput').disabled = true;
 document.getElementById('snapshotStatus').textContent = '';
 document.getElementById('snapshotConfirmBtn').style.display = 'none';
 document.getElementById('snapshotPreview').innerHTML = (typeof DOMPurify !== 'undefined') ? DOMPurify.sanitize(marked.parse(data.markdown || '')) : marked.parse(data.markdown || '');
 document.getElementById('snapshotPreview').style.display = 'block';
 document.getElementById('snapshotPreviewActions').style.display = 'flex';
 document.getElementById('snapshotOverlay').classList.add('active');
 } else {
 alert(data.error || '预览失败');
 }
 } catch (e) {
 alert('网络错误');
 }
 }

 // 下载技能包
 function downloadSkill(skillId) {
 window.open(`/api/chat/snapshot/download?skillId=${skillId}`, '_blank');
 }

 // 删除技能包
 async function deleteSkill(skillId) {
 if (!confirm('确定要删除这个技能包吗？删除后无法恢复。')) return;
 try {
 const resp = await fetch('/api/chat/snapshot/delete', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ skillId })
 });
 const data = await resp.json();
 if (data.success) {
 loadSkillsList();
 } else {
 alert(data.error || '删除失败');
 }
 } catch (e) {
 alert('网络错误');
 }
 }

 // 分享技能包
 async function shareSkill(skillId) {
 try {
 const resp = await fetch('/api/chat/snapshot/share', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ skillId })
 });
 const data = await resp.json();
 if (data.success) {
 const shareUrl = window.location.origin + '?import=' + data.shareCode;
 // 复制到剪贴板
 try {
 await navigator.clipboard.writeText(shareUrl);
 alert('分享链接已复制\n\n' + shareUrl + '\n\n发送给同事即可加载此技能包');
 } catch (clipErr) {
 prompt('请复制以下分享链接：', shareUrl);
 }
 } else {
 alert(data.error || '分享失败');
 }
 } catch (e) {
 alert('网络错误，请重试');
 }
 }

 // 通过分享码导入技能包
 async function importSkillByCode(shareCode) {
 try {
 const resp = await fetch('/api/chat/snapshot/import', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ shareCode })
 });
 const data = await resp.json();
 if (data.success) {
 loadedSkillContext = data;
 showLoadedSkillBadge(data.skillName + ' (分享)');
 const input = document.getElementById('messageInput');
 if (input) input.placeholder = `已加载分享技能「${data.skillName}」（来自 ${data.sharedBy}），请输入问题...`;
 alert(`成功加载技能包「${data.skillName}」\n来源: ${data.agentName}\n分享者: ${data.sharedBy}`);
 } else {
 alert(data.error || '导入失败，分享码可能无效');
 }
 } catch (e) {
 alert('网络错误，请重试');
 }
 }

 // 页面加载时检查 URL 中是否有分享码
 (function checkImportParam() {
 const urlParams = new URLSearchParams(window.location.search);
 const importCode = urlParams.get('import');
 if (importCode) {
 // 延迟执行，等页面加载完成
 setTimeout(() => importSkillByCode(importCode), 1500);
 // 清除 URL 参数
 window.history.replaceState({}, '', window.location.pathname);
 }
 })();

 // 对话超过 4 条消息时显示快照按钮
 function updateSnapshotBtnVisibility() {
 const btn = document.getElementById('snapshotBtn');
 if (!btn) return;
 const msgContainer = document.getElementById('chatMessages');
 const msgCount = msgContainer ? msgContainer.querySelectorAll('.msg-row').length : 0;
 btn.style.display = msgCount >= 2 ? '' : 'none';
 }

 // 监听消息容器变化，自动显示/隐藏快照按钮
 const chatMsgObserver = new MutationObserver(updateSnapshotBtnVisibility);
 document.addEventListener('DOMContentLoaded', () => {
 const msgContainer = document.getElementById('chatMessages');
 if (msgContainer) chatMsgObserver.observe(msgContainer, { childList: true, subtree: true });
 });

 // ===== 网络状态监听 =====
 window.addEventListener('offline', () => {
 const banner = document.getElementById('offlineBanner');
 if (banner) banner.classList.add('show');
 });
 window.addEventListener('online', () => {
 const offBanner = document.getElementById('offlineBanner');
 if (offBanner) offBanner.classList.remove('show');
 // 短暂显示重连成功提示
 const reconBanner = document.getElementById('reconnectBanner');
 if (reconBanner) {
 reconBanner.textContent = '网络已恢复连接';
 reconBanner.style.background = '#66bb6a';
 reconBanner.classList.add('show');
 setTimeout(() => { reconBanner.classList.remove('show'); reconBanner.style.background = ''; reconBanner.textContent = '正在重新连接...'; }, 3000);
 }
 });

 // ===== 知识库全屏预览 + 多模态上下文感知 =====
 let currentPreviewDoc = null; // 当前预览的文档数据

 async function openKBPreview(fileId) {
 const modal = document.getElementById('kbPreviewModal');
 const titleEl = document.getElementById('kbPreviewTitle');
 const metaEl = document.getElementById('kbPreviewMeta');
 const bodyEl = document.getElementById('kbPreviewBody');
 modal.style.display = 'flex';
 bodyEl.innerHTML = '<div style="text-align:center;color:var(--text-3);padding:3rem">加载中...</div>';
 titleEl.textContent = '文档预览';
 metaEl.textContent = '';
 try {
 const resp = await fetch('/api/kb/preview?id=' + encodeURIComponent(fileId));
 if (!resp.ok) throw new Error('加载失败');
 const doc = await resp.json();
 currentPreviewDoc = doc;
 titleEl.textContent = doc.name;
 const date = new Date(doc.addedAt).toLocaleDateString('zh-CN');
 const scopeLabel = doc.scope === 'global' ? '全局知识库' : doc.scope;
 metaEl.textContent = scopeLabel + ' | ' + (doc.chunkCount || doc.chunks) + ' 块 | ' + (doc.textLen ? Math.round(doc.textLen / 1000) + 'K字符' : '') + ' | ' + date;
 // 渲染内容
 if (doc.content) {
 const ext = (doc.name.split('.').pop() || '').toLowerCase();
 if (ext === 'md' || doc.content.includes('# ') || doc.content.includes('## ')) {
 // Markdown 渲染
 if (typeof marked !== 'undefined') {
 bodyEl.innerHTML = '<div class="kb-preview-markdown">' + DOMPurify.sanitize(marked.parse(doc.content)) + '</div>';
 } else {
 bodyEl.innerHTML = '<pre class="kb-preview-text">' + escapeHtml(doc.content) + '</pre>';
 }
 } else {
 bodyEl.innerHTML = '<pre class="kb-preview-text">' + escapeHtml(doc.content) + '</pre>';
 }
 } else {
 bodyEl.innerHTML = '<div style="text-align:center;color:var(--text-3);padding:3rem">该文档内容暂不可预览（原始文件可能为 PDF/Word 格式）<br><br>可通过"引用"按钮将其注入对话上下文</div>';
 }
 } catch (e) {
 bodyEl.innerHTML = '<div style="text-align:center;color:#e74c3c;padding:3rem">加载失败: ' + (e.message || '未知错误') + '</div>';
 }
 }

 function closeKBPreview() {
 document.getElementById('kbPreviewModal').style.display = 'none';
 currentPreviewDoc = null;
 }

 function escapeHtml(text) {
 const div = document.createElement('div');
 div.textContent = text;
 return div.innerHTML;
 }

 // 多模态上下文感知：基于当前预览文档向 Agent 提问
 function askAboutPreview() {
 if (!currentPreviewDoc) return;
 const input = document.getElementById('messageInput');
 const docName = currentPreviewDoc.name;
 // 将文档内容注入为上下文（截取前 3000 字符避免过长）
 const contextSnippet = (currentPreviewDoc.content || '').substring(0, 3000);
 const contextPrefix = '[正在阅读知识库文档《' + docName + '》，以下是文档内容摘要：]\n' + contextSnippet + '\n\n';
 input.value = contextPrefix + '请帮我解读这份文档的核心要点';
 input.focus();
 autoResize(input);
 closeKBPreview();
 }

 // 将预览文档引用到输入框
 function citePreviewInInput() {
 if (!currentPreviewDoc) return;
 citeKBInInputById(currentPreviewDoc.id, currentPreviewDoc.name);
 closeKBPreview();
 }

 function citeKBInInputById(fileId, fileName) {
 const input = document.getElementById('messageInput');
 const citeText = '[引用知识库《' + truncateFileName(fileName, 30) + '》] ';
 if (!input.value.trim()) {
 input.value = citeText;
 } else {
 input.value = input.value.trimEnd() + ' ' + citeText;
 }
 input.focus();
 autoResize(input);
 }

 // ===== .mhub 技能包导出 =====
 async function exportSkillAsMhub(skillId) {
 try {
 // 获取技能包内容
 const resp = await fetch('/api/chat/snapshot/preview?skillId=' + encodeURIComponent(skillId));
 if (!resp.ok) throw new Error('获取技能包失败');
 const skill = await resp.json();

 // 构建 .mhub 包内容
 const mhubPackage = {
 format: 'mhub',
 version: '1.0',
 exportedAt: new Date().toISOString(),
 source: 'MedAgent Hub',
 skill: {
 id: skill.skillId || skillId,
 name: skill.name || '未命名技能包',
 agentId: skill.agentId || '',
 agentName: skill.agentName || '',
 prompt: skill.prompt || '',
 attachedFiles: skill.attachedFiles || [],
 createdAt: skill.createdAt || ''
 },
 metadata: {
 description: '由 MedAgent Hub 导出的技能包，包含对话经验和专家知识',
 tags: ['medagent', skill.agentId || 'general']
 }
 };

 // 下载为 .mhub 文件
 const blob = new Blob([JSON.stringify(mhubPackage, null, 2)], { type: 'application/json' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = (skill.name || 'skill') + '.mhub';
 a.click();
 URL.revokeObjectURL(url);
 showToast('技能包已导出为 .mhub 文件');
 } catch (e) {
 showToast('导出失败: ' + e.message);
 }
 }

 // 导入 .mhub 文件
 function importMhubFile() {
 const fileInput = document.createElement('input');
 fileInput.type = 'file';
 fileInput.accept = '.mhub,.json';
 fileInput.onchange = async (e) => {
 const file = e.target.files[0];
 if (!file) return;
 try {
 const text = await file.text();
 const pkg = JSON.parse(text);
 if (pkg.format !== 'mhub' || !pkg.skill) {
 showToast('无效的 .mhub 文件格式');
 return;
 }
 // 将技能包内容注入到当前对话
 const input = document.getElementById('messageInput');
 const skillInfo = pkg.skill;
 input.value = '[导入技能包《' + (skillInfo.name || '未命名') + '》来自 ' + (skillInfo.agentName || '专家') + ']\n\n' +
 '技能包提示词：\n' + (skillInfo.prompt || '(无)') + '\n\n' +
 '请基于以上技能包的经验继续对话。';
 input.focus();
 autoResize(input);
 showToast('已导入技能包《' + (skillInfo.name || '未命名') + '》');
 } catch (err) {
 showToast('导入失败: ' + err.message);
 }
 };
 fileInput.click();
 }


// ===== 导出功能 =====

function showExportToast(btn, text) {
  var toast = btn.querySelector('.export-toast');
  if (!toast) {
    toast = document.createElement('span');
    toast.className = 'export-toast';
    btn.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 1800);
}

// 1. 复制 Markdown
function exportCopyMarkdown(btn) {
  var bubble = btn.closest('.msg-bubble');
  var md = bubble ? bubble.dataset.rawMarkdown : '';
  if (!md) { showExportToast(btn, '无内容'); return; }
  navigator.clipboard.writeText(md).then(function() {
    showExportToast(btn, '已复制');
  }).catch(function() {
    // fallback
    var ta = document.createElement('textarea');
    ta.value = md; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    showExportToast(btn, '已复制');
  });
}

// 2. 复制纯文本
function exportCopyText(btn) {
  var bubble = btn.closest('.msg-bubble');
  var answerDiv = bubble ? bubble.querySelector('.expert-answer-content') : null;
  if (!answerDiv) { showExportToast(btn, '无内容'); return; }
  var text = answerDiv.innerText || answerDiv.textContent || '';
  navigator.clipboard.writeText(text).then(function() {
    showExportToast(btn, '已复制');
  }).catch(function() {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    showExportToast(btn, '已复制');
  });
}

// 3. 复制为微信公众号格式
function exportCopyWechat(btn) {
  var bubble = btn.closest('.msg-bubble');
  var md = bubble ? bubble.dataset.rawMarkdown : '';
  if (!md) { showExportToast(btn, '无内容'); return; }

  // 使用 marked 渲染 markdown 为 HTML
  var html = typeof marked !== 'undefined' ? marked.parse(md) : md;

  // 包裹公众号友好的样式
  var wechatHtml = '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Helvetica Neue\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif;font-size:15px;line-height:1.8;color:#333;padding:10px 0;">';

  // 替换标题样式
  wechatHtml += html
    .replace(/<h1([^>]*)>/g, '<h1 style="font-size:22px;font-weight:700;color:#1a1a1a;margin:24px 0 12px;padding-bottom:8px;border-bottom:2px solid #e8e8e8;">')
    .replace(/<h2([^>]*)>/g, '<h2 style="font-size:18px;font-weight:700;color:#1a1a1a;margin:20px 0 10px;padding-left:10px;border-left:3px solid #2563eb;">')
    .replace(/<h3([^>]*)>/g, '<h3 style="font-size:16px;font-weight:600;color:#333;margin:16px 0 8px;">')
    .replace(/<p([^>]*)>/g, '<p style="margin:10px 0;text-indent:0;">')
    .replace(/<strong>/g, '<strong style="color:#1a1a1a;">')
    .replace(/<blockquote([^>]*)>/g, '<blockquote style="margin:12px 0;padding:10px 16px;background:#f7f8fa;border-left:3px solid #2563eb;color:#555;font-size:14px;">')
    .replace(/<table([^>]*)>/g, '<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px;">')
    .replace(/<th([^>]*)>/g, '<th style="background:#f0f5ff;padding:8px 12px;border:1px solid #d9d9d9;text-align:left;font-weight:600;">')
    .replace(/<td([^>]*)>/g, '<td style="padding:8px 12px;border:1px solid #d9d9d9;">')
    .replace(/<ul([^>]*)>/g, '<ul style="margin:8px 0;padding-left:20px;">')
    .replace(/<ol([^>]*)>/g, '<ol style="margin:8px 0;padding-left:20px;">')
    .replace(/<li([^>]*)>/g, '<li style="margin:4px 0;">');

  wechatHtml += '</div>';

  // 使用 ClipboardItem 复制富文本
  try {
    var blob = new Blob([wechatHtml], { type: 'text/html' });
    var textBlob = new Blob([bubble.querySelector('.expert-answer-content').innerText || ''], { type: 'text/plain' });
    navigator.clipboard.write([
      new ClipboardItem({
        'text/html': blob,
        'text/plain': textBlob
      })
    ]).then(function() {
      showExportToast(btn, '已复制，可直接粘贴到公众号编辑器');
    });
  } catch (e) {
    // fallback: 选中内容并复制
    var container = document.createElement('div');
    container.innerHTML = wechatHtml;
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.opacity = '0';
    document.body.appendChild(container);
    var range = document.createRange();
    range.selectNodeContents(container);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('copy');
    sel.removeAllRanges();
    document.body.removeChild(container);
    showExportToast(btn, '已复制');
  }
}

// 4. 导出 PDF
function exportPDF(btn) {
  var bubble = btn.closest('.msg-bubble');
  var answerDiv = bubble ? bubble.querySelector('.expert-answer-content') : null;
  if (!answerDiv) { showExportToast(btn, '无内容'); return; }

  showExportToast(btn, '正在生成 PDF...');

  // 创建一个用于 PDF 的容器
  var pdfContainer = document.createElement('div');
  pdfContainer.style.cssText = 'font-family:"PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif;font-size:14px;line-height:1.8;color:#333;padding:30px;max-width:680px;';
  pdfContainer.innerHTML = answerDiv.innerHTML;

  // 修复 PDF 中的表格样式
  pdfContainer.querySelectorAll('table').forEach(function(t) {
    t.style.cssText = 'width:100%;border-collapse:collapse;margin:12px 0;font-size:12px;';
  });
  pdfContainer.querySelectorAll('th').forEach(function(th) {
    th.style.cssText = 'background:#f0f5ff;padding:6px 10px;border:1px solid #d9d9d9;text-align:left;font-weight:600;font-size:12px;';
  });
  pdfContainer.querySelectorAll('td').forEach(function(td) {
    td.style.cssText = 'padding:6px 10px;border:1px solid #d9d9d9;font-size:12px;';
  });
  pdfContainer.querySelectorAll('h1,h2,h3').forEach(function(h) {
    h.style.color = '#1a1a1a';
  });

  // 添加页脚
  var footer = document.createElement('div');
  footer.style.cssText = 'margin-top:30px;padding-top:12px;border-top:1px solid #e8e8e8;font-size:11px;color:#999;text-align:center;';
  footer.textContent = 'MedAgent Hub \u00b7 ' + new Date().toLocaleDateString('zh-CN');
  pdfContainer.appendChild(footer);

  if (typeof html2pdf !== 'undefined') {
    var opt = {
      margin: [15, 15, 15, 15],
      filename: 'MedAgent_' + new Date().toISOString().slice(0, 10) + '.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };
    html2pdf().set(opt).from(pdfContainer).save().then(function() {
      showExportToast(btn, 'PDF 已下载');
    }).catch(function(err) {
      console.error('PDF export error:', err);
      showExportToast(btn, '导出失败');
    });
  } else {
    // fallback: 使用浏览器打印
    var printWin = window.open('', '_blank');
    printWin.document.write('<html><head><title>MedAgent Report</title><style>body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.8;color:#333;padding:30px;max-width:680px;margin:0 auto;}table{width:100%;border-collapse:collapse;margin:12px 0;}th{background:#f0f5ff;padding:6px 10px;border:1px solid #d9d9d9;text-align:left;}td{padding:6px 10px;border:1px solid #d9d9d9;}h1,h2,h3{color:#1a1a1a;}</style></head><body>' + pdfContainer.innerHTML + '</body></html>');
    printWin.document.close();
    printWin.print();
    showExportToast(btn, '请在打印对话框中选择"另存为 PDF"');
  }
}


// ===== Manus-style sidebar functions =====
function newSession() {
  // Reset to desktop view (new conversation)
  switchView('desktop');
  // Clear current chat state
  sessionId = null;
  currentHistorySessionId = null;
  currentAgentId = null;
  // Clear desktop input
  const desktopInput = document.getElementById('desktopInput');
  if (desktopInput) { desktopInput.value = ''; desktopInput.focus(); }
  // Deselect all sidebar history items
  document.querySelectorAll('.sidebar-history-item').forEach(el => el.classList.remove('active'));
}

function toggleSidebarSearch() {
  const box = document.getElementById('sidebarSearchBox');
  const input = document.getElementById('sidebarSearchInput');
  if (box.style.display === 'none') {
    box.style.display = 'flex';
    input.value = '';
    input.focus();
  } else {
    box.style.display = 'none';
    input.value = '';
    filterSidebarHistory('');
  }
}

function filterSidebarHistory(query) {
  const items = document.querySelectorAll('#sidebarHistList .sidebar-history-item, #favList .sidebar-history-item');
  const q = (query || '').toLowerCase().trim();
  items.forEach(item => {
    if (!q) { item.style.display = ''; return; }
    const text = (item.textContent || '').toLowerCase();
    item.style.display = text.includes(q) ? '' : 'none';
  });
}

// Ctrl+K shortcut for new session
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    newSession();
  }
});


// ===== WORKSPACE LAYOUT MANAGEMENT =====
let currentLayout = 'chat-only';

function switchLayout(layout) {
  currentLayout = layout;
  const resourcePanel = document.getElementById('resourcePanel');
  const previewPanel = document.getElementById('previewPanel');
  const chatPanel = document.querySelector('.chat-main-panel');
  const layoutBtns = document.querySelectorAll('.layout-btn[data-layout]');

  // Update active button
  layoutBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.layout === layout);
  });

  switch (layout) {
    case 'chat-only':
      resourcePanel.classList.add('collapsed');
      previewPanel.style.display = 'none';
      if (chatPanel) chatPanel.classList.remove('fixed-width');
      resourcePanelOpen = false;
      break;
    case 'resource-chat':
      resourcePanel.classList.remove('collapsed');
      previewPanel.style.display = 'none';
      if (chatPanel) chatPanel.classList.remove('fixed-width');
      resourcePanelOpen = true;
      break;
    case 'three-panel':
      resourcePanel.classList.remove('collapsed');
      previewPanel.style.display = '';
      if (chatPanel) chatPanel.classList.add('fixed-width');
      resourcePanelOpen = true;
      break;
    case 'preview-chat':
      resourcePanel.classList.add('collapsed');
      previewPanel.style.display = '';
      if (chatPanel) chatPanel.classList.add('fixed-width');
      resourcePanelOpen = false;
      break;
  }

  // Update resource panel button state
  const btn = document.getElementById('resourcePanelBtn');
  if (btn) btn.classList.toggle('active', resourcePanelOpen);

  // Save layout preference
  try { localStorage.setItem('medagent_layout', layout); } catch(e) {}
}

// Override toggleResourcePanel to integrate with layout system
(function() {
  const originalToggle = toggleResourcePanel;
  toggleResourcePanel = function() {
    resourcePanelOpen = !resourcePanelOpen;
    const panel = document.getElementById('resourcePanel');
    const btn = document.getElementById('resourcePanelBtn');
    const chatPanel = document.querySelector('.chat-main-panel');
    if (resourcePanelOpen) {
      panel.classList.remove('collapsed');
      if (btn) btn.classList.add('active');
      const previewVisible = document.getElementById('previewPanel').style.display !== 'none';
      currentLayout = previewVisible ? 'three-panel' : 'resource-chat';
      // In three-panel mode, fix chat width; in resource-chat, let it flex
      if (chatPanel) chatPanel.classList.toggle('fixed-width', previewVisible);
    } else {
      panel.classList.add('collapsed');
      if (btn) btn.classList.remove('active');
      const previewVisible = document.getElementById('previewPanel').style.display !== 'none';
      currentLayout = previewVisible ? 'preview-chat' : 'chat-only';
      // In preview-chat, fix chat width; in chat-only, let it flex
      if (chatPanel) chatPanel.classList.toggle('fixed-width', previewVisible);
    }
    // Update layout buttons
    document.querySelectorAll('.layout-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.layout === currentLayout);
    });
  };
})();

// ===== PREVIEW PANEL =====
let currentPreviewFile = null;

function openPreviewPanel(fileId, fileName, content, meta) {
  const previewPanel = document.getElementById('previewPanel');
  const previewTitle = document.getElementById('previewTitle');
  const previewMeta = document.getElementById('previewMeta');
  const previewBody = document.getElementById('previewBody');

  currentPreviewFile = { fileId, fileName, content };

  previewTitle.textContent = fileName || '文档预览';
  previewMeta.textContent = meta || '';

  // Render content (reuse existing markdown rendering if available)
  if (typeof marked !== 'undefined') {
    previewBody.innerHTML = '<div class="kb-preview-markdown">' + marked.parse(content || '') + '</div>';
  } else {
    previewBody.innerHTML = '<div class="kb-preview-text">' + (content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
  }

  // Show preview panel
  previewPanel.style.display = '';

  // Update layout state
  const resourceVisible = !document.getElementById('resourcePanel').classList.contains('collapsed');
  currentLayout = resourceVisible ? 'three-panel' : 'preview-chat';
  const chatPanel = document.querySelector('.chat-main-panel');
  if (chatPanel) chatPanel.classList.add('fixed-width');
  document.querySelectorAll('.layout-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.layout === currentLayout);
  });
}

function closePreviewPanel() {
  const previewPanel = document.getElementById('previewPanel');
  previewPanel.style.display = 'none';
  currentPreviewFile = null;

  // Update layout state
  const resourceVisible = !document.getElementById('resourcePanel').classList.contains('collapsed');
  currentLayout = resourceVisible ? 'resource-chat' : 'chat-only';
  const chatPanel = document.querySelector('.chat-main-panel');
  if (chatPanel) chatPanel.classList.remove('fixed-width');
  document.querySelectorAll('.layout-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.layout === currentLayout);
  });
}

// Hook into existing KB preview to open in panel instead of modal
(function() {
  const originalOpenKBPreview = typeof openKBPreview === 'function' ? openKBPreview : null;
  if (originalOpenKBPreview) {
    window._originalOpenKBPreview = originalOpenKBPreview;
  }
  window.openKBPreview = function(fileId, fileName) {
    // Fetch file content and open in preview panel instead of modal
    fetch('/api/knowledge/file/' + encodeURIComponent(fileId))
      .then(r => r.json())
      .then(data => {
        if (data.content) {
          openPreviewPanel(fileId, fileName, data.content, data.meta || '');
        } else if (window._originalOpenKBPreview) {
          window._originalOpenKBPreview(fileId, fileName);
        }
      })
      .catch(() => {
        if (window._originalOpenKBPreview) {
          window._originalOpenKBPreview(fileId, fileName);
        }
      });
  };
})();

// Restore saved layout on init
(function() {
  try {
    const saved = localStorage.getItem('medagent_layout');
    if (saved && ['chat-only', 'resource-chat', 'three-panel', 'preview-chat'].includes(saved)) {
      // Delay to ensure DOM is ready
      setTimeout(() => switchLayout(saved), 500);
    }
  } catch(e) {}
})();


// ===== SPRINT 3: PREVIEW ENHANCEMENT =====
// Enhanced preview panel with editing, copy, download, and Agent document push

let previewEditMode = false;
let previewOriginalContent = ''; // Store original content for cancel

// Detect file type from filename
function detectFileType(fileName) {
  if (!fileName) return 'txt';
  const ext = fileName.split('.').pop().toLowerCase();
  if (['md', 'markdown'].includes(ext)) return 'md';
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx'].includes(ext)) return 'doc';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'xls';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'img';
  return 'txt';
}

// Get file type badge HTML
function getFileTypeBadge(fileType) {
  const labels = { md: 'MD', pdf: 'PDF', doc: 'DOC', xls: 'XLS', img: 'IMG', txt: 'TXT', agent: 'Agent' };
  return '<span class="preview-file-type-badge type-' + fileType + '">' + (labels[fileType] || 'TXT') + '</span>';
}

// Show toast notification
function showPreviewToast(message) {
  let toast = document.getElementById('previewToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'previewToast';
    toast.className = 'preview-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 2000);
}

// Enhanced openPreviewPanel with file type detection and rich rendering
(function() {
  const _origOpen = openPreviewPanel;
  window.openPreviewPanel = function(fileId, fileName, content, meta, options) {
    const previewPanel = document.getElementById('previewPanel');
    const previewTitle = document.getElementById('previewTitle');
    const previewMeta = document.getElementById('previewMeta');
    const previewBody = document.getElementById('previewBody');
    const editBar = document.getElementById('previewEditBar');

    // Exit edit mode if active
    previewEditMode = false;
    previewBody.classList.remove('edit-mode');
    if (editBar) editBar.classList.remove('visible');
    var editBtn = document.getElementById('previewEditBtn');
    if (editBtn) editBtn.classList.remove('editing');

    options = options || {};
    const fileType = options.fileType || detectFileType(fileName);
    const isAgent = options.isAgent || false;

    currentPreviewFile = { fileId: fileId, fileName: fileName, content: content, fileType: fileType, isAgent: isAgent };

    // Build title with file type badge
    previewTitle.innerHTML = getFileTypeBadge(isAgent ? 'agent' : fileType) + ' ' + (fileName || '文档预览');
    previewMeta.textContent = meta || '';

    // Render content based on file type
    var renderHTML = '';
    if (fileType === 'img' && content) {
      // Image preview - content could be a URL or base64
      if (content.startsWith('http') || content.startsWith('data:') || content.startsWith('/')) {
        renderHTML = '<div class="preview-image-container"><img src="' + content + '" alt="' + (fileName || 'image') + '" /></div>';
      } else {
        renderHTML = '<div class="preview-image-container"><p style="color:var(--text-3)">图片内容已提取为文本描述：</p></div>' +
          '<div class="preview-doc"><p>' + content.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p></div>';
      }
    } else if (fileType === 'pdf' && options.pdfUrl) {
      // PDF preview with iframe
      renderHTML = '<div class="preview-pdf-container"><iframe src="' + options.pdfUrl + '" title="PDF Preview"></iframe></div>';
    } else if (typeof marked !== 'undefined' && content) {
      // Markdown / rich text rendering
      var renderText = content;
      renderText = renderText.replace(/##([^\s#\n])/g, '## $1');
      // Fix table rendering
      renderText = (function(text) {
        text = text.replace(/^[ \t]+\|/gm, '|');
        var changed = true;
        while (changed) { var prev = text; text = text.replace(/(\|[^\n]*)\n\n(\|)/g, '$1\n$2'); changed = (text !== prev); }
        var lines = text.split('\n'), out = [];
        for (var i = 0; i < lines.length; i++) {
          var ln = lines[i], prev2 = i > 0 ? lines[i-1] : '';
          if (ln.trimStart().startsWith('|') && prev2 !== '' && !prev2.trimStart().startsWith('|')) out.push('');
          out.push(ln);
        }
        return out.join('\n');
      })(renderText);
      var parsed = marked.parse(renderText);
      if (typeof DOMPurify !== 'undefined') parsed = DOMPurify.sanitize(parsed);
      renderHTML = '<div class="preview-render"><div class="preview-doc">' + parsed + '</div></div>';
    } else {
      // Plain text fallback
      renderHTML = '<div class="preview-render"><div class="preview-doc"><pre style="white-space:pre-wrap;font-family:inherit;font-size:0.85rem;line-height:1.75;color:var(--text-2)">' +
        (content || '暂无可预览的文本内容').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre></div></div>';
    }

    // Add hidden editor textarea
    renderHTML += '<textarea class="preview-editor" id="previewEditor" placeholder="在此编辑 Markdown 内容..."></textarea>';

    previewBody.innerHTML = renderHTML;

    // Show preview panel
    previewPanel.style.display = '';

    // Update layout state
    var resourceVisible = !document.getElementById('resourcePanel').classList.contains('collapsed');
    currentLayout = resourceVisible ? 'three-panel' : 'preview-chat';
    var chatPanel = document.querySelector('.chat-main-panel');
    if (chatPanel) chatPanel.classList.add('fixed-width');
    document.querySelectorAll('.layout-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.layout === currentLayout);
    });

    // Show/hide edit button based on file type (editable for md, txt, doc, agent-generated)
    if (editBtn) {
      editBtn.style.display = (fileType === 'img' || fileType === 'pdf') ? 'none' : '';
    }
  };
})();

// Toggle edit mode
function togglePreviewEdit() {
  if (!currentPreviewFile) return;
  var previewBody = document.getElementById('previewBody');
  var editBar = document.getElementById('previewEditBar');
  var editBtn = document.getElementById('previewEditBtn');
  var editor = document.getElementById('previewEditor');

  if (previewEditMode) {
    // Exit edit mode - render the edited content
    previewEditMode = false;
    previewBody.classList.remove('edit-mode');
    if (editBar) editBar.classList.remove('visible');
    if (editBtn) editBtn.classList.remove('editing');

    // Update content from editor
    var editedContent = editor ? editor.value : currentPreviewFile.content;
    currentPreviewFile.content = editedContent;

    // Re-render
    var renderDiv = previewBody.querySelector('.preview-render');
    if (renderDiv && typeof marked !== 'undefined') {
      var parsed = marked.parse(editedContent);
      if (typeof DOMPurify !== 'undefined') parsed = DOMPurify.sanitize(parsed);
      renderDiv.innerHTML = '<div class="preview-doc">' + parsed + '</div>';
    }
  } else {
    // Enter edit mode
    previewEditMode = true;
    previewOriginalContent = currentPreviewFile.content || '';
    previewBody.classList.add('edit-mode');
    if (editBar) editBar.classList.add('visible');
    if (editBtn) editBtn.classList.add('editing');

    // Populate editor with current content
    if (editor) {
      editor.value = currentPreviewFile.content || '';
      editor.focus();
      // Auto-update word count
      editor.addEventListener('input', updatePreviewWordCount);
    }
  }
}

// Cancel edit
function cancelPreviewEdit() {
  if (!previewEditMode) return;
  var previewBody = document.getElementById('previewBody');
  var editBar = document.getElementById('previewEditBar');
  var editBtn = document.getElementById('previewEditBtn');
  var editor = document.getElementById('previewEditor');

  previewEditMode = false;
  previewBody.classList.remove('edit-mode');
  if (editBar) editBar.classList.remove('visible');
  if (editBtn) editBtn.classList.remove('editing');

  // Restore original content
  currentPreviewFile.content = previewOriginalContent;
  if (editor) editor.value = previewOriginalContent;

  // Re-render original
  var renderDiv = previewBody.querySelector('.preview-render');
  if (renderDiv && typeof marked !== 'undefined') {
    var parsed = marked.parse(previewOriginalContent);
    if (typeof DOMPurify !== 'undefined') parsed = DOMPurify.sanitize(parsed);
    renderDiv.innerHTML = '<div class="preview-doc">' + parsed + '</div>';
  }
}

// Save edit and send to Agent as new context
function savePreviewEdit() {
  if (!previewEditMode) return;
  var editor = document.getElementById('previewEditor');
  var editedContent = editor ? editor.value : '';

  // Update current preview file content
  currentPreviewFile.content = editedContent;

  // Exit edit mode
  togglePreviewEdit();

  // Inject edited content as context into the chat input
  var input = document.getElementById('messageInput');
  var docName = currentPreviewFile.fileName || '文档';
  var contextPrefix = '[已编辑文档《' + docName + '》，以下是修改后的内容：]\n' + editedContent.substring(0, 5000) + '\n\n';

  // Set as pending file context so it gets sent with the next message
  if (!pendingFile) {
    pendingFile = {
      name: docName,
      size: editedContent.length,
      content: editedContent,
      type: 'document',
      isImage: false,
      objectUrl: null
    };
    var previewArea = document.getElementById('filePreviewArea');
    if (previewArea) {
      previewArea.style.display = 'block';
      previewArea.innerHTML = '<div class="file-preview-card">'
        + '<span class="file-preview-icon">' + getFileIcon(docName) + '</span>'
        + '<span class="file-preview-name">' + docName + ' (已编辑)</span>'
        + '<span class="file-preview-size">已引用</span>'
        + '<button class="file-preview-remove" onclick="removePendingFile()" title="移除"></button>'
        + '</div>';
    }
  }

  input.value = '请基于我刚才编辑的文档内容，继续帮我完善和优化';
  input.focus();
  autoResize(input);

  showPreviewToast('文档已保存，可发送给 Agent');
}

// Update word count during editing
function updatePreviewWordCount() {
  var editor = document.getElementById('previewEditor');
  if (!editor) return;
  var text = editor.value;
  var charCount = text.length;
  var lineCount = text.split('\n').length;
  var statusEl = document.querySelector('.preview-edit-bar .edit-status');
  if (statusEl) {
    statusEl.innerHTML = '<span class="dot"></span> 编辑模式 · ' + charCount + ' 字 · ' + lineCount + ' 行';
  }
}

// Copy preview content to clipboard
function copyPreviewContent() {
  if (!currentPreviewFile || !currentPreviewFile.content) {
    showPreviewToast('暂无可复制的内容');
    return;
  }
  var content = currentPreviewFile.content;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(content).then(function() {
      showPreviewToast('已复制到剪贴板');
    }).catch(function() {
      fallbackCopy(content);
    });
  } else {
    fallbackCopy(content);
  }
}

function fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); showPreviewToast('已复制到剪贴板'); }
  catch(e) { showPreviewToast('复制失败，请手动复制'); }
  document.body.removeChild(ta);
}

// Download preview content as file
function downloadPreviewContent() {
  if (!currentPreviewFile) {
    showPreviewToast('暂无可下载的内容');
    return;
  }
  var content = currentPreviewFile.content || '';
  var fileName = currentPreviewFile.fileName || '文档.md';
  var fileType = currentPreviewFile.fileType || 'txt';

  // Determine download filename
  if (!fileName.includes('.')) {
    fileName += (fileType === 'md' ? '.md' : '.txt');
  }

  var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showPreviewToast('文件已下载：' + fileName);
}

// Override askAboutPreview to work with new preview panel
(function() {
  window.askAboutPreview = function() {
    // Try new preview panel first
    if (currentPreviewFile && currentPreviewFile.content) {
      var input = document.getElementById('messageInput');
      var docName = currentPreviewFile.fileName || '文档';
      var contextSnippet = (currentPreviewFile.content || '').substring(0, 3000);

      // Set as pending file context
      if (!pendingFile) {
        pendingFile = {
          name: docName,
          size: currentPreviewFile.content.length,
          content: currentPreviewFile.content,
          type: 'document',
          isImage: false,
          objectUrl: null
        };
        var previewArea = document.getElementById('filePreviewArea');
        if (previewArea) {
          previewArea.style.display = 'block';
          previewArea.innerHTML = '<div class="file-preview-card">'
            + '<span class="file-preview-icon">' + getFileIcon(docName) + '</span>'
            + '<span class="file-preview-name">' + docName + '</span>'
            + '<span class="file-preview-size">已引用</span>'
            + '<button class="file-preview-remove" onclick="removePendingFile()" title="移除"></button>'
            + '</div>';
        }
      }

      input.value = '请帮我解读这份文档的核心要点';
      input.focus();
      autoResize(input);
      return;
    }
    // Fallback to old KB preview doc
    if (typeof currentPreviewDoc !== 'undefined' && currentPreviewDoc) {
      var input2 = document.getElementById('messageInput');
      var docName2 = currentPreviewDoc.name;
      var contextSnippet2 = (currentPreviewDoc.content || '').substring(0, 3000);
      var contextPrefix2 = '[正在阅读知识库文档《' + docName2 + '》，以下是文档内容摘要：]\n' + contextSnippet2 + '\n\n';
      input2.value = contextPrefix2 + '请帮我解读这份文档的核心要点';
      input2.focus();
      autoResize(input2);
    }
  };
})();

// Override citePreviewInInput to work with new preview panel
(function() {
  window.citePreviewInInput = function() {
    if (currentPreviewFile && currentPreviewFile.content) {
      var input = document.getElementById('messageInput');
      var docName = currentPreviewFile.fileName || '文档';
      var citeText = '[引用文档《' + docName + '》] ';

      if (!pendingFile) {
        pendingFile = {
          name: docName,
          size: currentPreviewFile.content.length,
          content: currentPreviewFile.content,
          type: 'document',
          isImage: false,
          objectUrl: null
        };
        var previewArea = document.getElementById('filePreviewArea');
        if (previewArea) {
          previewArea.style.display = 'block';
          previewArea.innerHTML = '<div class="file-preview-card">'
            + '<span class="file-preview-icon">' + getFileIcon(docName) + '</span>'
            + '<span class="file-preview-name">' + docName + '</span>'
            + '<span class="file-preview-size">已引用</span>'
            + '<button class="file-preview-remove" onclick="removePendingFile()" title="移除"></button>'
            + '</div>';
        }
      }

      if (!input.value.trim()) {
        input.value = citeText;
      } else {
        input.value = input.value.trimEnd() + ' ' + citeText;
      }
      input.focus();
      autoResize(input);
      return;
    }
    // Fallback to old KB preview
    if (typeof currentPreviewDoc !== 'undefined' && currentPreviewDoc) {
      citeKBInInputById(currentPreviewDoc.id, currentPreviewDoc.name);
    }
  };
})();

// Push Agent-generated document to preview panel
// Called from finalizeStreamBubble or export toolbar
function pushAgentDocToPreview(content, title) {
  if (!content) return;
  title = title || 'Agent 生成文档';
  // Auto-generate a timestamp-based name
  var now = new Date();
  var timeStr = now.getFullYear() + '' + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + '_' + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0');
  var fileName = title + '_' + timeStr + '.md';

  openPreviewPanel('agent_' + Date.now(), fileName, content, '由 Agent 生成 · ' + formatTimeAgo(now), {
    fileType: 'md',
    isAgent: true
  });
}

// Add "预览编辑" button to export toolbar via MutationObserver
// This approach is more reliable than monkey-patching since finalizeStreamBubble
// is a hoisted function declaration that may be called before the patch runs.
(function() {
  // Watch for new export toolbars being added to chat messages
  var chatContainer = document.getElementById('chatMessages');
  if (!chatContainer) {
    document.addEventListener('DOMContentLoaded', function() {
      initPreviewEditButtons();
    });
  } else {
    initPreviewEditButtons();
  }

  function initPreviewEditButtons() {
    var container = document.getElementById('chatMessages');
    if (!container) return;
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType !== 1) return;
          // Check if this node or its children contain an export toolbar
          var toolbars = [];
          if (node.classList && node.classList.contains('export-toolbar')) {
            toolbars.push(node);
          } else if (node.querySelectorAll) {
            toolbars = node.querySelectorAll('.export-toolbar');
          }
          toolbars.forEach(function(exportBar) {
            // Don't add duplicate buttons
            if (exportBar.querySelector('.preview-edit-trigger')) return;
            var bubble = exportBar.closest('.msg-bubble');
            if (!bubble) return;
            var rawMd = bubble.dataset.rawMarkdown;
            if (!rawMd || rawMd.length < 50) return;
            var previewBtn = document.createElement('button');
            previewBtn.className = 'export-btn preview-edit-trigger';
            previewBtn.title = '在预览面板中查看和编辑';
            previewBtn.textContent = '预览编辑';
            previewBtn.onclick = function() {
              var md = bubble.dataset.rawMarkdown;
              pushAgentDocToPreview(md, (typeof currentAgentName !== 'undefined' ? currentAgentName : '') || 'Agent');
            };
            var spacer = exportBar.querySelector('.feedback-spacer');
            if (spacer) {
              exportBar.insertBefore(previewBtn, spacer);
            } else {
              exportBar.appendChild(previewBtn);
            }
          });
        });
      });
    });
    observer.observe(container, { childList: true, subtree: true });
  }
})();

// Helper: format time ago (reuse if exists)
function formatTimeAgo(date) {
  if (typeof window._formatTimeAgo === 'function') return window._formatTimeAgo(date);
  var now = new Date();
  var diff = Math.floor((now - date) / 1000);
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
  return date.getMonth() + 1 + '月' + date.getDate() + '日';
}

// ===== ONBOARDING TOUR SYSTEM =====
var tourSteps = [];
var tourCurrentStep = 0;
var tourActive = false;

function getTourSteps() {
  // Dynamically build steps based on current view
  var steps = [];
  var inChat = document.getElementById('chatView') && document.getElementById('chatView').style.display !== 'none';

  if (!inChat) {
    // On Agent store page
    steps.push({
      target: '.sidebar-conversations .conv-item, .sidebar-conversations button',
      fallbackTarget: '.sidebar-conversations',
      title: '开始对话',
      desc: '点击左侧的对话列表，选择一个已有对话或新建对话，即可进入聊天界面。',
      position: 'right'
    });
    return steps;
  }

  // In chat view
  var layoutSwitcher = document.getElementById('layoutSwitcher');
  if (layoutSwitcher) {
    steps.push({
      target: '#layoutSwitcher',
      title: '切换布局',
      desc: '这里可以切换页面布局。点击第三个方块可以开启「文件 + 预览 + 聊天」三栏模式，让你同时管理文件、预览文档和对话。',
      position: 'top'
    });
  }

  var uploadBtn = document.getElementById('uploadBtn');
  if (uploadBtn) {
    steps.push({
      target: '#uploadBtn',
      title: '上传文件',
      desc: '点击这里上传 PDF、Word、图片等文件。上传后的文件会出现在左侧文件面板，可以直接引用到对话中让 Agent 分析。',
      position: 'top'
    });
  }

  var resourceBtn = document.getElementById('resourcePanelBtn');
  if (resourceBtn) {
    steps.push({
      target: '#resourcePanelBtn',
      title: '文件管理面板',
      desc: '点击这个按钮可以展开/收起左侧文件管理面板。面板中可以查看已上传的文件、知识库和技能包。',
      position: 'top'
    });
  }

  var messageInput = document.getElementById('messageInput');
  if (messageInput) {
    steps.push({
      target: '#messageInput',
      title: '发送消息',
      desc: '在这里输入你的问题，Agent 会根据你的提问和上传的文件给出专业回答。回复完成后，你可以将回答导出为文档、复制或在预览面板中编辑。',
      position: 'top'
    });
  }

  var templateBtn = document.getElementById('templateBtn');
  if (templateBtn) {
    steps.push({
      target: '#templateBtn',
      title: '输出模板',
      desc: '选择一个预设的输出模板，Agent 会按照模板格式来组织回答。比如 GTM 策略、竞品分析、话术脚本等。',
      position: 'top'
    });
  }

  // Preview panel tools (only if visible)
  var previewEditBtn = document.getElementById('previewEditBtn');
  if (previewEditBtn && previewEditBtn.offsetParent !== null) {
    steps.push({
      target: '#previewEditBtn',
      title: '预览面板工具栏',
      desc: '预览面板顶部的工具栏提供了丰富的操作：编辑文档、复制内容、下载文件、让 Agent 分析文档、引用到对话等。点击编辑按钮可以直接修改文档内容。',
      position: 'bottom'
    });
  }

  return steps;
}

function startTour() {
  tourSteps = getTourSteps();
  if (tourSteps.length === 0) return;
  tourCurrentStep = 0;
  tourActive = true;
  // Remove welcome card if exists
  var welcome = document.querySelector('.tour-welcome');
  if (welcome) welcome.remove();
  var overlay = document.querySelector('.tour-overlay');
  if (overlay) overlay.remove();
  showTourStep(0);
}

function showTourStep(stepIndex) {
  // Clean up previous
  var oldHighlight = document.querySelector('.tour-highlight');
  var oldTooltip = document.querySelector('.tour-tooltip');
  var oldOverlay = document.querySelector('.tour-overlay');
  if (oldHighlight) oldHighlight.remove();
  if (oldTooltip) oldTooltip.remove();
  if (oldOverlay) oldOverlay.remove();

  if (stepIndex >= tourSteps.length) {
    endTour();
    return;
  }

  var step = tourSteps[stepIndex];
  var targetEl = document.querySelector(step.target);
  if (!targetEl && step.fallbackTarget) {
    targetEl = document.querySelector(step.fallbackTarget);
  }
  if (!targetEl) {
    // Skip this step
    tourCurrentStep = stepIndex + 1;
    showTourStep(tourCurrentStep);
    return;
  }

  // Scroll target into view if needed
  targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

  setTimeout(function() {
    var rect = targetEl.getBoundingClientRect();
    var pad = 6;

    // Create overlay (transparent, just for click blocking)
    var overlay = document.createElement('div');
    overlay.className = 'tour-overlay';
    overlay.style.background = 'transparent';
    overlay.onclick = function(e) { e.stopPropagation(); };
    document.body.appendChild(overlay);

    // Create highlight
    var highlight = document.createElement('div');
    highlight.className = 'tour-highlight';
    highlight.style.top = (rect.top - pad + window.scrollY) + 'px';
    highlight.style.left = (rect.left - pad) + 'px';
    highlight.style.width = (rect.width + pad * 2) + 'px';
    highlight.style.height = (rect.height + pad * 2) + 'px';
    document.body.appendChild(highlight);

    // Create tooltip
    var tooltip = document.createElement('div');
    tooltip.className = 'tour-tooltip';

    var arrowPos = step.position === 'top' ? 'bottom' : step.position === 'bottom' ? 'top' : step.position === 'left' ? 'right' : 'left';

    var isLast = (stepIndex === tourSteps.length - 1);
    tooltip.innerHTML =
      '<div class="tour-tooltip-arrow ' + arrowPos + '"></div>' +
      '<div class="tour-title"><span class="tour-step-badge">' + (stepIndex + 1) + '</span>' + step.title + '</div>' +
      '<div class="tour-desc">' + step.desc + '</div>' +
      '<div class="tour-actions">' +
        '<span class="tour-progress">' + (stepIndex + 1) + ' / ' + tourSteps.length + '</span>' +
        '<div class="tour-btns">' +
          '<button class="tour-skip-btn" onclick="endTour()">跳过</button>' +
          '<button class="tour-next-btn" onclick="nextTourStep()">' + (isLast ? '完成' : '下一步') + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(tooltip);

    // Position tooltip
    var tooltipRect = tooltip.getBoundingClientRect();
    var pos = step.position || 'bottom';
    var top, left;

    if (pos === 'bottom') {
      top = rect.bottom + pad + 12;
      left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    } else if (pos === 'top') {
      top = rect.top - pad - 12 - tooltipRect.height;
      left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    } else if (pos === 'right') {
      top = rect.top + rect.height / 2 - tooltipRect.height / 2;
      left = rect.right + pad + 12;
    } else {
      top = rect.top + rect.height / 2 - tooltipRect.height / 2;
      left = rect.left - pad - 12 - tooltipRect.width;
    }

    // Clamp to viewport
    left = Math.max(12, Math.min(left, window.innerWidth - tooltipRect.width - 12));
    top = Math.max(12, Math.min(top, window.innerHeight - tooltipRect.height - 12));

    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';

    // Reposition arrow
    var arrow = tooltip.querySelector('.tour-tooltip-arrow');
    if (pos === 'bottom' || pos === 'top') {
      var arrowLeft = rect.left + rect.width / 2 - left;
      arrowLeft = Math.max(16, Math.min(arrowLeft, tooltipRect.width - 16));
      arrow.style.left = arrowLeft + 'px';
    } else {
      var arrowTop = rect.top + rect.height / 2 - top;
      arrowTop = Math.max(16, Math.min(arrowTop, tooltipRect.height - 16));
      arrow.style.top = arrowTop + 'px';
    }
  }, 300);
}

function nextTourStep() {
  tourCurrentStep++;
  if (tourCurrentStep >= tourSteps.length) {
    endTour();
  } else {
    showTourStep(tourCurrentStep);
  }
}

function endTour() {
  tourActive = false;
  var highlight = document.querySelector('.tour-highlight');
  var tooltip = document.querySelector('.tour-tooltip');
  var overlay = document.querySelector('.tour-overlay');
  var welcome = document.querySelector('.tour-welcome');
  if (highlight) highlight.remove();
  if (tooltip) tooltip.remove();
  if (overlay) overlay.remove();
  if (welcome) welcome.remove();
  // Mark tour as completed
  try { localStorage.setItem('medagent_tour_done', '1'); } catch(e) {}
  showPreviewToast('引导完成，开始探索吧');
}

// Show welcome card for first-time users
function showTourWelcome() {
  // Check if tour already completed
  try {
    if (localStorage.getItem('medagent_tour_done') === '1') return;
  } catch(e) {}

  var overlay = document.createElement('div');
  overlay.className = 'tour-overlay';
  document.body.appendChild(overlay);

  var card = document.createElement('div');
  card.className = 'tour-welcome';
  card.innerHTML =
    '<div class="tour-welcome-icon">' +
      '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E8715A" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
    '</div>' +
    '<h2>欢迎使用 MedAgent Hub</h2>' +
    '<p>第一次来？让我带你快速了解核心功能：布局切换、文件管理、文档预览编辑、Agent 对话等。只需 1 分钟。</p>' +
    '<button class="tour-welcome-start" onclick="startTour()">开始引导</button>' +
    '<button class="tour-welcome-skip" onclick="endTour()">我已经熟悉了，跳过</button>';
  document.body.appendChild(card);
}

// Trigger tour on first chat view entry
(function() {
  var _origShowChat = null;

  function hookChatView() {
    // Watch for chatView becoming visible
    var chatView = document.getElementById('chatView');
    if (!chatView) return;

    var chatObserver = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        if (m.type === 'attributes' && m.attributeName === 'style') {
          if (chatView.style.display !== 'none' && chatView.style.display !== '') {
            // Chat view is now visible - show tour if first time
            try {
              if (localStorage.getItem('medagent_tour_done') !== '1') {
                setTimeout(showTourWelcome, 800);
              }
            } catch(e) {}
          }
        }
      });
    });
    chatObserver.observe(chatView, { attributes: true, attributeFilter: ['style'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hookChatView);
  } else {
    hookChatView();
  }
})();

// Manual trigger: add help button to chat topbar
(function() {
  function addHelpButton() {
    var topbarActions = document.querySelector('.chat-topbar-actions');
    if (!topbarActions) return;
    // Don't add duplicate
    if (topbarActions.querySelector('.tour-help-btn')) return;
    var helpBtn = document.createElement('button');
    helpBtn.className = 'chat-topbar-btn tour-help-btn';
    helpBtn.title = '操作引导';
    helpBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    helpBtn.onclick = function() {
      // Reset tour state and show
      try { localStorage.removeItem('medagent_tour_done'); } catch(e) {}
      showTourWelcome();
    };
    // Insert before the last button (settings)
    var settingsBtn = topbarActions.querySelector('[onclick="showSettings()"]') || topbarActions.lastElementChild;
    if (settingsBtn) {
      topbarActions.insertBefore(helpBtn, settingsBtn);
    } else {
      topbarActions.appendChild(helpBtn);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addHelpButton);
  } else {
    // Delay to ensure topbar is rendered
    setTimeout(addHelpButton, 1000);
  }
})();

// ===== BUILTIN SKILLS =====
var builtinSkills = [
  {
    id: 'create-skill',
    name: '创建 Agent 技能',
    desc: '引导用户创建有效的 Agent 技能。包括 SKILL.md 格式规范、最佳实践、参数定义和工具权限配置。',
    icon: 'tool',
    iconText: 'SK',
    categories: ['系统', '技能创建'],
    prompt: [
      '你现在是一个 Agent 技能创建助手。请根据以下完整指南，引导用户创建有效的 Agent 技能。',
      '',
      '## 前置要求收集',
      '',
      '在开始创建技能之前，需要明确以下信息：',
      '1. **目的和范围** — 这个技能要解决什么问题？',
      '2. **触发场景** — 何时自动应用此技能？',
      '3. **领域知识** — 需要哪些专业背景？',
      '4. **输出格式偏好** — 期望的输出形式是什么？',
      '',
      '## 技能文件结构',
      '',
      '一个完整的技能目录结构如下：',
      '',
      '- skill-name/',
      '  - SKILL.md — 必需，主指令文件',
      '  - reference.md — 可选，详细文档',
      '  - examples.md — 可选，使用示例',
      '  - scripts/ — 可选，工具脚本',
      '',
      '## SKILL.md 核心结构',
      '',
      '每个 SKILL.md 由两部分组成：',
      '',
      '**第一部分：Front Matter（YAML 头部）**',
      '',
      '必填字段：',
      '- name: 技能标识符，小写+连字符',
      '- description: 一句话说明用途',
      '- categories: 分类标签数组',
      '- when_to_use: 触发场景和触发词描述',
      '- argument-hint: 参数提示格式',
      '- arguments: 输入参数列表',
      '- allowed-tools: 允许使用的工具（Read, Write 等）',
      '',
      '**第二部分：技能正文（Markdown）**',
      '',
      '- **Goal**：明确技能目标和成功标准',
      '- **Inputs**：定义输入参数及格式',
      '- **Steps**：分步骤的执行流程',
      '- **Output**：期望的输出格式',
      '',
      '## 核心创作原则',
      '',
      '1. **简洁优先** — SKILL.md 控制在 500 行以内',
      '2. **渐进式披露** — 核心内容放 SKILL.md，详细内容放 reference.md',
      '3. **第三人称描述** — 如"处理 PDF 文件"，而非"我可以帮你处理 PDF"',
      '4. **包含 WHAT 和 WHEN** — 既说明功能，也说明触发条件',
      '',
      '## 常见模式',
      '',
      '| 模式 | 适用场景 | 说明 |',
      '| --- | --- | --- |',
      '| 模板模式 | 固定输出格式 | 定义输出格式模板 |',
      '| 示例模式 | 输入输出转换 | 提供输入输出示例 |',
      '| 工作流模式 | 多步骤任务 | 步骤清单 |',
      '| 条件工作流 | 分支决策 | 决策分支 |',
      '| 反馈循环 | 质量验证 | 验证循环 |',
      '',
      '## 使用示例',
      '',
      '**示例 1：创建代码审查技能**',
      '- 目的：审查 PR 代码质量',
      '- 触发词："审查代码"、"review"',
      '- 输出：代码审查报告（问题列表+改进建议）',
      '',
      '**示例 2：创建 Git 提交消息技能**',
      '- 目的：生成 Conventional Commits 格式消息',
      '- 触发词："提交消息"、"commit message"',
      '- 输出：符合规范的提交消息',
      '',
      '**示例 3：创建文档处理技能**',
      '- 目的：PDF 处理 + 工具脚本',
      '- 触发词："处理文档"、"解析 PDF"',
      '- 输出：提取的文档内容 + 处理脚本',
      '',
      '**示例 4：从对话中提炼技能**',
      '- 目的：将工作流程转为可复用技能',
      '- 触发词："提炼技能"、"保存为技能"',
      '- 输出：完整的 SKILL.md 文件',
      '',
      '---',
      '',
      '请告诉我你想创建什么类型的技能，我来帮你一步步完成。需要提供：',
      '1. 技能要解决的问题',
      '2. 预期的触发场景',
      '3. 期望的输出格式'
    ].join('\n')
  }
];

function renderBuiltinSkills() {
  var container = document.getElementById('builtinSkillsList');
  if (!container) return;

  container.innerHTML = builtinSkills.map(function(skill) {
    var isLoaded = loadedSkillContext && loadedSkillContext.skillId === 'builtin_' + skill.id;
    return '<div class="builtin-skill-card" onclick="previewBuiltinSkill(\'' + skill.id + '\')">' +
      '<div class="builtin-skill-icon ' + skill.icon + '">' + skill.iconText + '</div>' +
      '<div class="builtin-skill-info">' +
        '<div class="builtin-skill-name">' + skill.name + ' <span class="builtin-tag">内置</span></div>' +
        '<div class="builtin-skill-desc">' + skill.desc + '</div>' +
      '</div>' +
      '<div class="builtin-skill-actions">' +
        '<button class="builtin-skill-load-btn' + (isLoaded ? ' loaded' : '') + '" ' +
          'onclick="event.stopPropagation();loadBuiltinSkill(\'' + skill.id + '\')">' +
          (isLoaded ? '已加载' : '加载') +
        '</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function loadBuiltinSkill(skillId) {
  var skill = builtinSkills.find(function(s) { return s.id === skillId; });
  if (!skill) return;

  // Set as loaded skill context (same structure as server-loaded skills)
  loadedSkillContext = {
    skillId: 'builtin_' + skill.id,
    skillName: skill.name,
    content: skill.prompt,
    success: true
  };

  // Show loaded badge
  showLoadedSkillBadge(skill.name);

  // Update input placeholder
  var input = document.getElementById('messageInput');
  if (input && !input.value.trim()) {
    input.placeholder = '已加载技能「' + skill.name + '」，请输入问题...';
  }

  // Re-render to update button state
  renderBuiltinSkills();

  showPreviewToast('已加载技能「' + skill.name + '」');
}

function previewBuiltinSkill(skillId) {
  var skill = builtinSkills.find(function(s) { return s.id === skillId; });
  if (!skill) return;

  // Open in preview panel
  if (typeof openPreviewPanel === 'function') {
    openPreviewPanel('builtin_' + skill.id, skill.name + '.md', skill.prompt, '内置技能 · ' + skill.categories.join(' / '), {
      fileType: 'md',
      isAgent: false
    });
  }
}

// Hook into switchResourceTab to render builtin skills
(function() {
  var _origSwitchTab = window.switchResourceTab;
  window.switchResourceTab = function(tab) {
    if (typeof _origSwitchTab === 'function') {
      _origSwitchTab(tab);
    }
    if (tab === 'skills') {
      renderBuiltinSkills();
    }
  };
})();

// Also render on initial load if skills tab is active
(function() {
  function initBuiltinSkills() {
    var skillsTab = document.getElementById('resourceTabSkills');
    if (skillsTab && skillsTab.classList.contains('active')) {
      renderBuiltinSkills();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBuiltinSkills);
  } else {
    setTimeout(initBuiltinSkills, 500);
  }
})();

// ===== WORKSPACE STATE MANAGEMENT & PANEL RESIZE =====
// Replaces simple currentLayout with full workspace state management

var workspaceState = {
  layout: 'chat-only',
  panelWidths: { resource: 280, preview: null },
  resizing: false
};

// Load saved panel widths
(function() {
  try {
    var saved = localStorage.getItem('medagent_panel_widths');
    if (saved) {
      var parsed = JSON.parse(saved);
      if (parsed.resource) workspaceState.panelWidths.resource = parsed.resource;
      if (parsed.preview) workspaceState.panelWidths.preview = parsed.preview;
    }
  } catch(e) {}
})();

// Save panel widths
function savePanelWidths() {
  try {
    localStorage.setItem('medagent_panel_widths', JSON.stringify(workspaceState.panelWidths));
  } catch(e) {}
}

// Update resize handle visibility based on layout
function updateResizeHandles() {
  var handleResource = document.getElementById('resizeHandleResource');
  var handlePreview = document.getElementById('resizeHandlePreview');
  if (!handleResource || !handlePreview) return;

  var resourceVisible = !document.getElementById('resourcePanel').classList.contains('collapsed');
  var previewVisible = document.getElementById('previewPanel').style.display !== 'none';

  // Resource handle: visible when resource panel is open
  if (resourceVisible) {
    handleResource.classList.remove('hidden');
  } else {
    handleResource.classList.add('hidden');
  }

  // Preview handle: visible when preview panel is open
  if (previewVisible) {
    handlePreview.classList.remove('hidden');
  } else {
    handlePreview.classList.add('hidden');
  }
}

// Override switchLayout to also manage resize handles
(function() {
  var _origSwitchLayout = switchLayout;
  switchLayout = function(layout) {
    _origSwitchLayout(layout);
    workspaceState.layout = layout;
    updateResizeHandles();
    // Apply saved widths
    applyPanelWidths();
  };
})();

// Apply saved panel widths
function applyPanelWidths() {
  var resourcePanel = document.getElementById('resourcePanel');
  var previewPanel = document.getElementById('previewPanel');

  if (resourcePanel && !resourcePanel.classList.contains('collapsed') && workspaceState.panelWidths.resource) {
    resourcePanel.style.width = workspaceState.panelWidths.resource + 'px';
  }
  // Preview panel uses flex, so we set flex-basis if a width is saved
  if (previewPanel && previewPanel.style.display !== 'none' && workspaceState.panelWidths.preview) {
    previewPanel.style.flex = '0 0 ' + workspaceState.panelWidths.preview + 'px';
    previewPanel.style.minWidth = '200px';
  }
}

// ===== PANEL RESIZE DRAG LOGIC =====
(function() {
  var dragState = null;

  function onMouseDown(e) {
    var handle = e.target.closest('.panel-resize-handle');
    if (!handle) return;
    e.preventDefault();

    var isResource = handle.classList.contains('handle-resource');
    var panel = isResource
      ? document.getElementById('resourcePanel')
      : document.getElementById('previewPanel');

    if (!panel) return;

    var startX = e.clientX;
    var startWidth = panel.getBoundingClientRect().width;

    dragState = {
      handle: handle,
      panel: panel,
      isResource: isResource,
      startX: startX,
      startWidth: startWidth
    };

    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    if (!dragState) return;
    e.preventDefault();

    var dx = e.clientX - dragState.startX;
    var newWidth = dragState.startWidth + dx;

    // Clamp widths
    if (dragState.isResource) {
      newWidth = Math.max(180, Math.min(500, newWidth));
      dragState.panel.style.width = newWidth + 'px';
      dragState.panel.style.transition = 'none';
      workspaceState.panelWidths.resource = newWidth;
    } else {
      newWidth = Math.max(200, Math.min(800, newWidth));
      dragState.panel.style.flex = '0 0 ' + newWidth + 'px';
      dragState.panel.style.minWidth = '200px';
      dragState.panel.style.transition = 'none';
      workspaceState.panelWidths.preview = newWidth;
    }
  }

  function onMouseUp(e) {
    if (!dragState) return;

    dragState.handle.classList.remove('dragging');
    dragState.panel.style.transition = '';
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    savePanelWidths();
    dragState = null;

    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }

  // Attach to chat view
  document.addEventListener('mousedown', onMouseDown);
})();

// Also update handles when openPreviewPanel / closePreviewPanel are called
(function() {
  var _origOpen = openPreviewPanel;
  var _origClose = closePreviewPanel;

  openPreviewPanel = function() {
    _origOpen.apply(this, arguments);
    updateResizeHandles();
    applyPanelWidths();
  };

  closePreviewPanel = function() {
    _origClose.apply(this, arguments);
    updateResizeHandles();
    // Reset preview flex
    var pp = document.getElementById('previewPanel');
    if (pp) { pp.style.flex = ''; pp.style.minWidth = ''; }
  };
})();

// Initialize handles on load
(function() {
  function initHandles() {
    updateResizeHandles();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHandles);
  } else {
    setTimeout(initHandles, 600);
  }
})();

// ===== COMBO SKILLS (工作流卡片) =====
var comboSkills = [
  {
    id: 'competitor-analysis',
    name: '竞品数据分析',
    desc: '上传竞品资料，Agent 自动提取关键数据并生成对比报告',
    icon: 'icon-analyze',
    iconSvg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    tags: ['文件+预览+聊天', '自动分析'],
    layout: 'three-panel',
    agent: null,
    prompt: '请帮我分析上传的竞品资料，提取以下关键信息：\n1. 产品名称和主要成分\n2. 定价策略和市场定位\n3. 核心卖点和差异化优势\n4. 目标客群画像\n\n请以表格形式呈现对比结果，并给出我们的应对策略建议。'
  },
  {
    id: 'script-generator',
    name: '话术一键生成',
    desc: '选择场景和客户类型，自动生成专业咨询话术模板',
    icon: 'icon-content',
    iconSvg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    tags: ['预览+聊天', '话术模板'],
    layout: 'preview-chat',
    agent: 'senior-consultant',
    prompt: '请帮我生成一套完整的客户咨询话术，包括：\n1. 开场破冰话术（3种场景）\n2. 需求挖掘问题清单（SPIN模型）\n3. 产品推荐话术（FAB法则）\n4. 异议处理话术（价格/效果/安全性）\n5. 成交促单话术（3种收尾方式）\n\n请按场景分类，每条话术附带使用说明。'
  },
  {
    id: 'training-drill',
    name: '话术实战陪练',
    desc: '模拟真实客户场景，AI 扮演客户进行对话训练',
    icon: 'icon-train',
    iconSvg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
    tags: ['聊天模式', '角色扮演'],
    layout: 'chat-only',
    agent: 'sparring-robot',
    prompt: '请开始一场话术陪练。你扮演一位对玻尿酸填充感兴趣但犹豫不决的客户，我来练习咨询话术。\n\n客户设定：\n- 30岁女性，首次了解医美\n- 主要顾虑：安全性、效果持续时间、价格\n- 性格：理性谨慎，喜欢对比\n\n请直接以客户身份开始对话。'
  },
  {
    id: 'content-creation',
    name: '种草内容创作',
    desc: '一键生成小红书/抖音/公众号多平台种草内容',
    icon: 'icon-content',
    iconSvg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    tags: ['预览+聊天', '多平台'],
    layout: 'preview-chat',
    agent: 'trend-setter',
    prompt: '请帮我创作一套医美种草内容，需要同时适配以下平台：\n1. 小红书图文笔记（标题+正文+标签）\n2. 抖音短视频脚本（开头/中间/结尾）\n3. 微信公众号推文（标题+摘要+正文）\n\n主题：[请告诉我你想推广的项目或产品]\n\n请确保内容符合三品一规合规要求。'
  },
  {
    id: 'weekly-report',
    name: '周报自动生成',
    desc: '汇总本周对话数据，自动生成结构化工作周报',
    icon: 'icon-report',
    iconSvg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>',
    tags: ['预览+聊天', '报告生成'],
    layout: 'preview-chat',
    agent: null,
    prompt: '请帮我生成本周工作周报，包括：\n1. 本周重点工作完成情况\n2. 客户跟进进展（新增/跟进/成交）\n3. 遇到的问题和解决方案\n4. 下周工作计划\n5. 需要的支持和资源\n\n请以结构化表格+文字说明的形式呈现。'
  },
  {
    id: 'compliance-check',
    name: '合规内容审查',
    desc: '上传宣传材料，自动检查三品一规合规风险',
    icon: 'icon-compliance',
    iconSvg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    tags: ['文件+预览+聊天', 'NMPA'],
    layout: 'three-panel',
    agent: null,
    prompt: '请帮我审查上传的宣传材料，按照以下标准进行合规检查：\n1. 是否含有绝对化用语（最好、第一、100%等）\n2. 是否涉及未经批准的适应症宣传\n3. 是否有虚假或夸大的效果承诺\n4. 是否符合NMPA广告法规要求\n5. 是否有使用前后对比的违规内容\n\n请逐条标注风险等级（高/中/低），并给出合规修改建议。'
  }
];

function renderComboSkills() {
  var grid = document.getElementById('comboSkillsGrid');
  if (!grid) return;

  grid.innerHTML = comboSkills.map(function(skill) {
    var tagsHtml = skill.tags.map(function(t) {
      return '<span class="combo-skill-tag">' + t + '</span>';
    }).join('');

    return '<div class="combo-skill-card" onclick="launchComboSkill(\'' + skill.id + '\')">' +
      '<div class="combo-skill-card-top">' +
        '<div class="combo-skill-icon ' + skill.icon + '">' + skill.iconSvg + '</div>' +
        '<div class="combo-skill-name">' + skill.name + '</div>' +
      '</div>' +
      '<div class="combo-skill-desc">' + skill.desc + '</div>' +
      '<div class="combo-skill-tags">' + tagsHtml + '</div>' +
    '</div>';
  }).join('');
}

function launchComboSkill(skillId) {
  var skill = comboSkills.find(function(s) { return s.id === skillId; });
  if (!skill) return;

  // 1. If skill specifies an agent, switch to it via quickStart
  if (skill.agent) {
    quickStart(skill.agent);
  } else {
    // Create new conversation or use current
    var input = document.getElementById('desktopInput');
    if (input) {
      input.value = skill.prompt;
      autoResize(input);
    }
  }

  // 2. After entering chat, switch to specified layout
  // Use a small delay to let the chat view initialize
  setTimeout(function() {
    if (typeof switchLayout === 'function' && skill.layout) {
      switchLayout(skill.layout);
    }

    // 3. If no agent was specified (didn't auto-send), fill the chat input
    if (!skill.agent) {
      var chatInput = document.getElementById('messageInput');
      if (chatInput) {
        chatInput.value = skill.prompt;
        if (typeof autoResize === 'function') autoResize(chatInput);
        chatInput.focus();
      }
    }
  }, 800);
}

// Render combo skills on page load
(function() {
  function initComboSkills() {
    renderComboSkills();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initComboSkills);
  } else {
    setTimeout(initComboSkills, 300);
  }
})();


// ===== SPRINT: FILE MANAGEMENT ENHANCEMENT =====

// --- Persistent file list state ---
let persistentFiles = [];   // from server DB
let persistentFolders = [];  // from server DB
let batchMode = false;
let selectedFileIds = new Set();
let openFolderIds = new Set();

// Load files from server on page load
async function loadPersistentFiles() {
  try {
    const resp = await fetch('/api/files', { credentials: 'include' });
    if (!resp.ok) return;
    const data = await resp.json();
    persistentFiles = data.files || [];
    persistentFolders = data.folders || [];
    // Merge into resourceFiles for backward compatibility
    syncResourceFiles();
    renderResourceFileTree();
  } catch (e) {
    console.warn('loadPersistentFiles failed:', e);
  }
}

function syncResourceFiles() {
  // Build resourceFiles from persistentFiles for backward compat
  resourceFiles = persistentFiles.map(f => ({
    name: f.original_name,
    size: f.size,
    content: f.extracted_content || '',
    contentType: f.content_type || 'document',
    timestamp: f.created_at ? new Date(f.created_at + 'Z').getTime() : Date.now(),
    _dbId: f.id,
    _folderId: f.folder_id || 0
  }));
}

function refreshFileList() {
  loadPersistentFiles();
  showToast('已刷新文件列表');
}

// --- Tree-structure rendering ---
function renderResourceFileTree() {
  const container = document.getElementById('resourceFileList');
  if (!container) return;

  const allFiles = resourceFiles || [];
  const folders = persistentFolders || [];

  if (!allFiles.length && !folders.length) {
    container.innerHTML = '<div class="resource-empty"><div class="resource-empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div><div class="resource-empty-title">暂无上传文件</div><div class="resource-empty-desc">上传文件后可在此快速引用</div></div>';
    return;
  }

  // Group files by folder
  const rootFiles = allFiles.filter(f => !f._folderId || f._folderId === 0);
  const folderMap = {};
  folders.forEach(fd => { folderMap[fd.id] = { ...fd, files: [] }; });
  allFiles.forEach((f, idx) => {
    if (f._folderId && folderMap[f._folderId]) {
      folderMap[f._folderId].files.push({ ...f, _idx: idx });
    }
  });

  let html = '';
  const batchCls = batchMode ? ' batch-mode' : '';

  // Render folders first
  folders.forEach(fd => {
    const isOpen = openFolderIds.has(fd.id);
    const fFiles = folderMap[fd.id] ? folderMap[fd.id].files : [];
    html += '<div class="folder-item' + (isOpen ? ' open' : '') + '" '
      + 'onclick="toggleFolder(' + fd.id + ')" '
      + 'ondragover="onFolderDragOver(event,' + fd.id + ')" '
      + 'ondragleave="onFolderDragLeave(event)" '
      + 'ondrop="onFolderDrop(event,' + fd.id + ')" '
      + 'oncontextmenu="showFolderContextMenu(event,' + fd.id + ')" '
      + 'data-folder-id="' + fd.id + '">'
      + '<span class="folder-toggle' + (isOpen ? ' open' : '') + '"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></span>'
      + '<span class="folder-icon' + (isOpen ? ' open' : '') + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg></span>'
      + '<span class="folder-name">' + fd.name + '</span>'
      + '<span class="folder-count">' + fFiles.length + '</span>'
      + '</div>';
    html += '<div class="folder-children' + (isOpen ? ' open' : '') + batchCls + '" id="folderChildren_' + fd.id + '">';
    fFiles.forEach(f => {
      html += renderFileItemHTML(f, f._idx);
    });
    html += '</div>';
  });

  // Render root files (not in any folder)
  if (rootFiles.length) {
    if (folders.length) {
      html += '<div class="file-group-label">未分类文件</div>';
    }
    rootFiles.forEach((f, i) => {
      const idx = allFiles.indexOf(f);
      html += renderFileItemHTML(f, idx);
    });
  }

  container.className = batchMode ? 'batch-mode' : '';
  container.innerHTML = html;
}

function renderFileItemHTML(f, idx) {
  const icon = getFileIcon(f.name, true);
  const checked = selectedFileIds.has(f._dbId) ? ' checked' : '';
  const selectedCls = selectedFileIds.has(f._dbId) ? ' selected' : '';
  const sizeStr = f.size ? (f.size > 1024*1024 ? (f.size/1024/1024).toFixed(1)+'MB' : (f.size/1024).toFixed(1)+'KB') : '';
  return '<div class="file-item' + selectedCls + '" draggable="true" '
    + 'ondragstart="onFileTreeDragStart(event,' + idx + ',' + (f._dbId||0) + ')" '
    + 'onclick="' + (batchMode ? 'toggleFileSelect(' + (f._dbId||0) + ',event)' : 'previewResourceFile(' + idx + ')') + '" '
    + 'oncontextmenu="showFileContextMenuV2(event,' + idx + ',' + (f._dbId||0) + ')">'
    + (batchMode ? '<input type="checkbox" class="file-checkbox"' + checked + ' onclick="toggleFileSelect(' + (f._dbId||0) + ',event)">' : '')
    + '<div class="file-icon ' + icon.cls + '">' + icon.svg + '</div>'
    + '<span class="file-name" title="' + f.name + '">' + f.name + '</span>'
    + '<span class="file-meta">' + sizeStr + '</span>'
    + '</div>';
}

// --- Folder operations ---
function toggleFolder(folderId) {
  if (openFolderIds.has(folderId)) {
    openFolderIds.delete(folderId);
  } else {
    openFolderIds.add(folderId);
  }
  renderResourceFileTree();
}

async function createNewFolder() {
  const name = prompt('请输入文件夹名称：');
  if (!name || !name.trim()) return;
  try {
    const resp = await fetch('/api/files/folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: name.trim(), parentId: 0 })
    });
    if (resp.ok) {
      showToast('文件夹已创建');
      loadPersistentFiles();
    } else {
      showToast('创建失败');
    }
  } catch (e) {
    showToast('创建失败');
  }
}

async function renameItem(id, type, currentName) {
  const newName = prompt('请输入新名称：', currentName);
  if (!newName || !newName.trim() || newName.trim() === currentName) return;
  try {
    const resp = await fetch('/api/files/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id, name: newName.trim(), type })
    });
    if (resp.ok) {
      showToast('已重命名');
      loadPersistentFiles();
    }
  } catch (e) {
    showToast('重命名失败');
  }
}

async function deleteItem(ids, type) {
  try {
    const resp = await fetch('/api/files/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ids, type })
    });
    if (resp.ok) {
      showToast('已删除');
      loadPersistentFiles();
    }
  } catch (e) {
    showToast('删除失败');
  }
}

async function moveFilesToFolder(fileIds, folderId) {
  try {
    const resp = await fetch('/api/files/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ fileIds, folderId })
    });
    if (resp.ok) {
      showToast('已移动');
      loadPersistentFiles();
    }
  } catch (e) {
    showToast('移动失败');
  }
}

// --- Batch selection ---
function toggleBatchSelect() {
  batchMode = !batchMode;
  selectedFileIds.clear();
  const btn = document.getElementById('batchSelectBtn');
  const actions = document.getElementById('batchActions');
  if (batchMode) {
    btn.classList.add('active');
    actions.style.display = 'flex';
  } else {
    btn.classList.remove('active');
    actions.style.display = 'none';
  }
  renderResourceFileTree();
}

function toggleFileSelect(dbId, event) {
  if (event) { event.stopPropagation(); }
  if (selectedFileIds.has(dbId)) {
    selectedFileIds.delete(dbId);
  } else {
    selectedFileIds.add(dbId);
  }
  document.getElementById('batchCount').textContent = selectedFileIds.size + ' 项已选';
  renderResourceFileTree();
}

function batchDeleteFiles() {
  if (!selectedFileIds.size) { showToast('请先选择文件'); return; }
  if (!confirm('确定删除 ' + selectedFileIds.size + ' 个文件？')) return;
  deleteItem(Array.from(selectedFileIds), 'file');
  selectedFileIds.clear();
  batchMode = false;
  document.getElementById('batchSelectBtn').classList.remove('active');
  document.getElementById('batchActions').style.display = 'none';
}

function batchMoveFiles() {
  if (!selectedFileIds.size) { showToast('请先选择文件'); return; }
  showMoveDialog(Array.from(selectedFileIds));
}

// --- Move dialog ---
function showMoveDialog(fileIds) {
  const overlay = document.createElement('div');
  overlay.className = 'move-dialog-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  let selectedFolderId = 0;
  let listHtml = '<div class="move-dialog-item selected" data-fid="0" onclick="selectMoveTarget(this,0)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg> 根目录</div>';
  persistentFolders.forEach(fd => {
    listHtml += '<div class="move-dialog-item" data-fid="' + fd.id + '" onclick="selectMoveTarget(this,' + fd.id + ')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg> ' + fd.name + '</div>';
  });

  overlay.innerHTML = '<div class="move-dialog">'
    + '<h4>移动到文件夹</h4>'
    + '<div class="move-dialog-list">' + listHtml + '</div>'
    + '<div class="move-dialog-actions">'
    + '<button onclick="this.closest(\'.move-dialog-overlay\').remove()">取消</button>'
    + '<button class="primary" onclick="confirmMove(this,' + JSON.stringify(fileIds).replace(/"/g,'&quot;') + ')">确定</button>'
    + '</div></div>';

  document.body.appendChild(overlay);
  window._moveSelectedFolderId = 0;
}

function selectMoveTarget(el, fid) {
  el.closest('.move-dialog-list').querySelectorAll('.move-dialog-item').forEach(i => i.classList.remove('selected'));
  el.classList.add('selected');
  window._moveSelectedFolderId = fid;
}

function confirmMove(btn, fileIds) {
  moveFilesToFolder(fileIds, window._moveSelectedFolderId || 0);
  btn.closest('.move-dialog-overlay').remove();
  if (batchMode) {
    selectedFileIds.clear();
    batchMode = false;
    document.getElementById('batchSelectBtn').classList.remove('active');
    document.getElementById('batchActions').style.display = 'none';
  }
}

// --- Drag & drop for tree ---
function onFileTreeDragStart(event, idx, dbId) {
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('application/x-file-id', dbId.toString());
  event.dataTransfer.setData('text/plain', '[引用文件《' + (resourceFiles[idx]||{}).name + '》] ');
}

function onFolderDragOver(event, folderId) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  event.currentTarget.classList.add('drop-target');
}

function onFolderDragLeave(event) {
  event.currentTarget.classList.remove('drop-target');
}

function onFolderDrop(event, folderId) {
  event.preventDefault();
  event.currentTarget.classList.remove('drop-target');
  const fileIdStr = event.dataTransfer.getData('application/x-file-id');
  if (fileIdStr) {
    moveFilesToFolder([parseInt(fileIdStr)], folderId);
  }
}

// --- Enhanced context menu ---
function showFileContextMenuV2(event, idx, dbId) {
  event.preventDefault();
  event.stopPropagation();
  const old = document.getElementById('fileContextMenu');
  if (old) old.remove();
  const f = resourceFiles[idx];
  if (!f) return;
  const menu = document.createElement('div');
  menu.id = 'fileContextMenu';
  menu.className = 'file-context-menu';
  menu.innerHTML = '<div class="file-ctx-item" onclick="previewResourceFile(' + idx + ');closeFileContextMenu()">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
    + ' 预览</div>'
    + '<div class="file-ctx-item" onclick="citeFileInInput(' + idx + ');closeFileContextMenu()">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>'
    + ' 引用</div>'
    + '<div class="file-ctx-item" onclick="renameItem(' + dbId + ',\'file\',\'' + f.name.replace(/'/g,"\\'") + '\');closeFileContextMenu()">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
    + ' 重命名</div>'
    + '<div class="file-ctx-item" onclick="showMoveDialog([' + dbId + ']);closeFileContextMenu()">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>'
    + ' 移动到...</div>'
    + '<div class="file-ctx-divider"></div>'
    + '<div class="file-ctx-item file-ctx-danger" onclick="if(confirm(\'确定删除？\'))deleteItem([' + dbId + '],\'file\');closeFileContextMenu()">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>'
    + ' 删除</div>';
  menu.style.left = event.clientX + 'px';
  menu.style.top = event.clientY + 'px';
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
  setTimeout(() => document.addEventListener('click', closeFileContextMenu, { once: true }), 10);
}

function showFolderContextMenu(event, folderId) {
  event.preventDefault();
  event.stopPropagation();
  const old = document.getElementById('fileContextMenu');
  if (old) old.remove();
  const fd = persistentFolders.find(f => f.id === folderId);
  if (!fd) return;
  const menu = document.createElement('div');
  menu.id = 'fileContextMenu';
  menu.className = 'file-context-menu';
  menu.innerHTML = '<div class="file-ctx-item" onclick="renameItem(' + folderId + ',\'folder\',\'' + fd.name.replace(/'/g,"\\'") + '\');closeFileContextMenu()">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
    + ' 重命名</div>'
    + '<div class="file-ctx-divider"></div>'
    + '<div class="file-ctx-item file-ctx-danger" onclick="if(confirm(\'删除文件夹后，其中的文件将移至根目录。确定？\'))deleteItem([' + folderId + '],\'folder\');closeFileContextMenu()">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>'
    + ' 删除文件夹</div>';
  menu.style.left = event.clientX + 'px';
  menu.style.top = event.clientY + 'px';
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
  setTimeout(() => document.addEventListener('click', closeFileContextMenu, { once: true }), 10);
}

// --- Save-as from preview panel ---
async function savePreviewAsFile() {
  const content = currentPreviewFile ? currentPreviewFile.content : '';
  if (!content) { showToast('没有可保存的内容'); return; }
  const defaultName = currentPreviewFile.fileName ? currentPreviewFile.fileName.replace(/\.[^.]+$/, '') + '.md' : 'document.md';
  const fileName = prompt('保存为文件名：', defaultName);
  if (!fileName || !fileName.trim()) return;

  // Show folder selection
  let folderId = 0;
  if (persistentFolders.length) {
    const folderNames = ['根目录'].concat(persistentFolders.map(f => f.name));
    const choice = prompt('选择文件夹（输入编号）：\n' + folderNames.map((n,i) => i + '. ' + n).join('\n'), '0');
    if (choice !== null) {
      const idx = parseInt(choice);
      if (idx > 0 && idx <= persistentFolders.length) {
        folderId = persistentFolders[idx - 1].id;
      }
    }
  }

  try {
    const resp = await fetch('/api/files/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ fileName: fileName.trim(), content, folderId })
    });
    if (resp.ok) {
      showToast('文件已保存到资源面板');
      loadPersistentFiles();
    } else {
      showToast('保存失败');
    }
  } catch (e) {
    showToast('保存失败');
  }
}

// --- Override original renderResourceFileList to use tree version ---
(function() {
  var _origRender = typeof renderResourceFileList === 'function' ? renderResourceFileList : null;
  window.renderResourceFileList = function() {
    renderResourceFileTree();
  };
})();

// --- Add save-as button to preview toolbar ---
(function() {
  function addSaveAsBtn() {
    var toolbar = document.querySelector('.preview-toolbar');
    if (!toolbar || toolbar.querySelector('.preview-save-as-btn')) return;
    var btn = document.createElement('button');
    btn.className = 'preview-save-as-btn';
    btn.title = '另存为文件';
    btn.onclick = savePreviewAsFile;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';
    // Insert before close button
    var closeBtn = toolbar.querySelector('[onclick*="closePreviewPanel"]');
    if (closeBtn) {
      toolbar.insertBefore(btn, closeBtn);
    } else {
      toolbar.appendChild(btn);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(addSaveAsBtn, 500); });
  } else {
    setTimeout(addSaveAsBtn, 500);
  }
})();

// --- Init: load persistent files on page load ---
(function() {
  function initFileManagement() {
    loadPersistentFiles();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFileManagement);
  } else {
    setTimeout(initFileManagement, 600);
  }
})();
