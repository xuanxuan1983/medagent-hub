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
          btn.textContent = '✓ 已复制';
          btn.classList.add('copied');
          setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 1800);
        }).catch(() => {
          const ta = document.createElement('textarea');
          ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta); ta.select(); document.execCommand('copy');
          document.body.removeChild(ta);
          btn.textContent = '✓ 已复制'; btn.classList.add('copied');
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
      breaks: true,      // \n 换行
      gfm: true,         // GitHub Flavored Markdown
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
  // 扩展 marked：1) 禁用删除线渲染  2) 解析 <agent-link> 标签为跳转按钮
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
  let lastUserMsg = '';  // 记录最近一次用户消息，用于反馈学习

  const AGENT_GROUPS = [
    {
      label: '上游厂商',
      agents: [
        { id: 'gtm-strategist',        icon: '🎯', name: 'GTM战略大师',         desc: '整合战略定位、循证背书、组品方案、价格控盘', category: '上游厂商' },
        { id: 'product-expert',      icon: '🧪', name: '产品材料专家',         desc: '精通流变学、PACER模型、材料选择与机理拆解', category: '上游厂商' },
        { id: 'medical-liaison',    icon: '🎓', name: '学术推广专家',         desc: '首席医学联络官，擅长KOL征服与学术叙事', category: '上游厂商' },
        { id: 'marketing-director',  icon: '✨', name: '市场创意总监',         desc: '整合新媒体、视觉创意、种草运营、科学视觉', category: '上游厂商' },
        { id: 'sales-director',      icon: '⚔️', name: '销售作战总监',         desc: '整合销售总监、大区经理、商务经理的超级销售Agent', category: '上游厂商' },
        { id: 'training-director',   icon: '📚', name: '培训赋能总监',         desc: 'ASK模型、反差教学、通关护照的培训专家', category: '上游厂商' },
        { id: 'operations-director', icon: '⚙️', name: '运营效能总监',         desc: '整合SFE、财务、采购的综合运营Agent', category: '上游厂商' },
        { id: 'area-manager',        icon: '🗺️', name: '大区经理',             desc: 'Forecast分级测谎、进销存逻辑闭环、情境模拟辅导', category: '上游厂商' },
        { id: 'channel-manager',     icon: '🤝', name: '商务经理',             desc: 'ROI利润精算、反向背调、窜货雷霆管控、库存博弈', category: '上游厂商' },
        { id: 'finance-bp',          icon: '💰', name: '财务BP',               desc: '税务合规与交易结构优化，货折替代票折保护利润', category: '上游厂商', hidden: true },
        { id: 'hrbp',                icon: '🎯', name: '战略HRBP',             desc: '精准猎聘竞品人才，背调侦查与竞业攻防', category: '上游厂商', hidden: true },
        { id: 'procurement-manager', icon: '📦', name: '采购经理',             desc: 'Kraljic矩阵与Should-Cost模型优化TCO', category: '上游厂商', hidden: true },
      ]
    },
    {
      label: '下游机构',
      agents: [
        // { id: 'neuro-aesthetic-architect', icon: '🧠', name: '神经美学架构师',     desc: '融合神经科学、皮肤病学与身心健康，从“修复结构”到“修复情感”', category: '下游机构' },
        { id: 'aesthetic-designer',    icon: '💎', name: '高定美学设计总监',     desc: '服务于Top 1%高净值人群的面部美学设计专家', category: '下游机构' },
        { id: 'senior-consultant',   icon: '🥇', name: '金牌医美咨询师',       desc: '10年一线经验的销冠级咨询师，精通SPIN与三明治报价', category: '下游机构' },
        { id: 'sparring-partner',      icon: '🥊', name: '医美实战陪练机器人',   desc: 'HP动态情绪系统，高压仿真话术训练', category: '下游机构' },
        { id: 'postop-specialist',    icon: '🛡️', name: '医美术后私域管家',     desc: '红绿灯风险分诊，将术后焦虑转化为复购信任', category: '下游机构' },
        { id: 'trend-setter',        icon: '🔥', name: '医美爆款种草官',       desc: '三品一规合规专家，生成有传播力又不踩红线的内容', category: '下游机构' },
        { id: 'anatomy-architect',   icon: '🏗️', name: '医美解剖决策建筑师',   desc: 'PACER模型，面部建筑结构分析，安全预警', category: '下游机构' },
        { id: 'materials-mentor',    icon: '🧬', name: '医美材料学硬核导师',   desc: '营销剥离，PACER深度拆解，灵魂拷问', category: '下游机构' },
        { id: 'material-architect',  icon: '🏗️', name: '医美材料学架构师',     desc: '6维评估模型，场景判别，合规底线，专业决策', category: '下游机构' },
        { id: 'visual-translator',   icon: '🎨', name: '医美视觉通译官',       desc: '机理转视觉画面，设计师Brief，3D渲染指导', category: '下游机构' },
      ]
    },
    {
      label: '其他',
      agents: [
        { id: 'new-media-director',  icon: '📋', name: '医美合规内容专家',     desc: '三品一规审查、合规替换词库、平台规则适配、合规种草框架', category: '其他' },
        { id: 'kv-design-director',    icon: '🎨', name: '视觉KV设计总监',         desc: '电商海报提示词生成，10张KV系统，支持产品图识别、风格选择、中英双语排版', category: '其他' },
        { id: 'meta-prompt-architect',  icon: '🏗️', name: '元提示词架构师',       desc: '精英提示工程师，提取用户意图构建情境感知的高效提示词，输出可复用的模块化提示词模板', category: '其他' },
        { id: 'prompt-engineer-pro',    icon: '✨', name: '高级Prompt工程师',         desc: '基于CRISPE框架深度优化提示词，将普通提示词转化为结构化专业提示词，提供3-5条改进建议', category: '其他' },
        { id: 'first-principles-analyst', icon: '⚛️', name: '第一性原理深度剖析专家', desc: '冷酷理性的深度分析引擎，基于物理学思维拆解复杂问题，从底层逻辑重构颠覆性解决方案', category: '其他' },
      ]
    },
    {
      label: '内容创作',
      agents: [
        { id: 'xhs-content-creator',    icon: '📱', name: '小红书图文创作顾问',   desc: '9种风格×6种布局，将医美内容转化为高传播力的小红书图文系列', category: '内容创作' },
        { id: 'ppt-creator',            icon: '📊', name: 'PPT创作顾问',           desc: '7种视觉风格，将医美内容自动转化为结构化PPT大纲和每页详细文案', category: '内容创作' },
        { id: 'wechat-content-creator', icon: '💬', name: '微信公众号运营顾问',   desc: '图文推送+深度文章，医美机构公众号内容策划与创作，兼顾合规与传播', category: '内容创作' },
        { id: 'comic-creator',          icon: '🎭', name: '知识漫画创作顾问',     desc: '8种漫画风格，将医美知识转化为生动有趣的知识漫画脚本和分镜', category: '内容创作' },
        { id: 'article-illustrator',    icon: '🖼️', name: '文章配图顾问',         desc: '智能分析文章结构，识别配图位置，生成8种风格的AI绘图提示词', category: '内容创作' },
        { id: 'cover-image-creator',    icon: '🎨', name: '封面图创作顾问',       desc: '8种封面风格，为医美文章和推文生成精美封面图方案和AI绘图提示词', category: '内容创作' },
        { id: 'social-media-creator',   icon: '🌐', name: '社交媒体运营顾问',     desc: '多平台内容策略，小红书/抖音/微博/X差异化内容创作与运营规划', category: '内容创作' },
        { id: 'personal-ip-builder',    icon: '🚀', name: '个人IP打造指南',         desc: '从IP定位、内容策略、视觉系统到变现路径，帮助创始人和独立顾问构建高价值个人品牌', category: '内容创作' },
        { id: 'personal-brand-cinematic', icon: '🎬', name: '电影感品牌视觉顾问',   desc: '结合电影摄影技术与个人品牌定位，为医美创始人打造高识别度的视觉形象和拍摄方案', category: '内容创作' },
        { id: 'super-writer',             icon: '✍️', name: '超级写作助手',         desc: '集选题、写稿、验收、发布于一体的知识类视频内容工厂，内置10个专业写作模块，实现工业化内容生产', category: '内容创作' },
      ]
    },
    {
      label: '_hidden',
      hidden: true,
      agents: [
        { id: 'doudou', icon: '🌱', name: '豆子', desc: '上游厂家专属搭档，整合 GTM、产品策略、学术推广等 12 个专家能力', category: '_hidden' },
        { id: 'douding', icon: '🌿', name: '豆丁', desc: '机构端口专属搭档，整合咨询话术、运营、术后管理等 9 个专家能力', category: '_hidden' },
        { id: 'douya', icon: '💡', name: '豆芽', desc: '个人 IP 打造与内容创作操盘手，网感极佳的爆款制造机', category: '_hidden' },
      ]
    }
  ];

  // 根据用户角色获取默认 Agent
  // login.html 存储的角色值: upstream / downstream / other
  function getDefaultAgentByRole() {
    const role = localStorage.getItem('medagent_role') || '';
    const roleMap = {
      'upstream':   'sales-director',   // 上游厂商 → 销售作战总监
      'downstream': 'senior-consultant', // 下游机构 → 金牌医美咨询师
      'other':      'senior-consultant', // 其他 → 金牌医美咨询师
    };
    return roleMap[role] || 'senior-consultant';
  }

  const PROVIDERS_MODELS = {
    openai:      ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    anthropic:   ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    gemini:      ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    deepseek:    ['deepseek-chat', 'deepseek-reasoner'],
    siliconflow: ['deepseek-ai/DeepSeek-V3', 'Pro/deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct'],
    kimi:        ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    qwen:        ['qwen-max', 'qwen-plus', 'qwen-turbo'],
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
        if (a) return a.icon;
      }
      return '🤖';
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
    btn.classList.toggle('collapsed', !isHidden);
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
          <span class="store-card-icon"><img src="/avatars/${agent.id}.svg" alt="${agent.name}" onerror="this.parentNode.textContent='${agent.icon}'"></span>
          <div class="store-card-name">${agent.name}${isLocked ? ` <span class="pro-badge" style="background:#f59e0b;color:white">🎁 反馈解锁</span>` : ''}</div>
          <div class="store-card-desc">${agent.desc}</div>
          <span class="store-card-tag">${agent.category}</span>
          ${isLocked
            ? `<button class="store-card-use store-card-locked-btn" onclick="showFeedbackHint()">🎁 反馈解锁</button>`
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
        btn.textContent = '已提交 ✓';
      } else {
        throw new Error(data.error || '提交失败');
      }
    } catch (e) {
      btn.disabled = false;
      btn.textContent = '提交反馈，解锁内容创作工具 🎁';
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
        <div class="welcome-mascot"><img src="${getAgentDefaultImg(agentId) || '/mascot-default.png'}" alt="${agentId === 'doudou' ? '豆子' : agentId === 'douding' ? '豆丁' : '豆芽'}" id="welcomeMascotImg"></div>
        <div class="welcome-title" id="welcomeTitle">${agent.name}</div>
        <div class="welcome-sub" id="welcomeSub">${agent.desc}</div>
      </div>`;
    sessionId = null;
    currentHistorySessionId = null;
    messageIndex = 0;

    document.title = agent.name + ' - MedAgent Hub';
    const topbarAvatarEl = document.getElementById('topbarAvatar');
    // 豆豆使用专属表情图而非 SVG
    if (agentId === 'doudou' || agentId === 'douding' || agentId === 'douya') {
      const _dailyImg = getAgentDefaultImg(agentId) || '/mascot-default.png';
      const _altName = agentId === 'doudou' ? '豆子' : agentId === 'douding' ? '豆丁' : '豆芽';
      topbarAvatarEl.innerHTML = `<img src="${_dailyImg}" alt="${_altName}">`;
    } else {
      topbarAvatarEl.innerHTML = `<img src="/avatars/${agent.id}.svg" alt="${agent.name}" onerror="this.parentNode.textContent='${agent.icon}'">`;
    }
    document.getElementById('topbarName').textContent = agent.name;
    document.getElementById('topbarDesc').textContent = agent.desc;
    document.getElementById('chatStatus').style.display = 'none';
    document.getElementById('messageInput').disabled = true;
    document.getElementById('sendBtn').disabled = true;
    document.getElementById('chatInputHint').textContent = '初始化中...';

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

  function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const icons = { pdf: '📕', doc: '📄', docx: '📄', xls: '📊', xlsx: '📊', txt: '📝', csv: '📊', md: '📝', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️', bmp: '🖼️' };
    return icons[ext] || '📎';
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
              <button class="file-preview-remove" onclick="removePendingFile()" title="移除">✕</button>
            </div>
          </div>`;
      } else {
        previewArea.innerHTML = `
          <div class="file-preview-card">
            <span class="file-preview-icon">${getFileIcon(file.name)}</span>
            <span class="file-preview-name">${file.name}</span>
            <span class="file-preview-size">${formatFileSize(file.size)}</span>
            <button class="file-preview-remove" onclick="removePendingFile()" title="移除">✕</button>
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
    resourceFiles.push(fileInfo);
    renderResourceFileList();
    if (!resourcePanelOpen) toggleResourcePanel();
  }

  function renderResourceFileList() {
    const container = document.getElementById('resourceFileList');
    if (!resourceFiles.length) {
      container.innerHTML = '<div class="resource-empty">暂无上传文件<br><span style="font-size:0.7rem">上传文件后可在此快速引用</span></div>';
      return;
    }
    container.innerHTML = resourceFiles.map((f, idx) => {
      const icon = getFileIcon(f.name);
      return '<div class="resource-item" draggable="true" ondragstart="onResourceItemDragStart(event,' + idx + ')" onclick="citeFileInInput(' + idx + ')">'
        + '<span class="resource-item-icon">' + icon + '</span>'
        + '<span class="resource-item-name" title="' + f.name + '">' + f.name + '</span>'
        + '<button class="resource-item-cite" onclick="event.stopPropagation();citeFileInInput(' + idx + ')">引用</button>'
        + '</div>';
    }).join('');
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
        + '<button class="file-preview-remove" onclick="removePendingFile()" title="移除">✕</button>'
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
      btn.innerHTML = '🔴 说话中';
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
      btn.innerHTML = '🎙️ 语音';
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
      btn.innerHTML = '🎙️ 语音';
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
        <div class="draw-modal-title">🎨 AI 绘图</div>
        <textarea class="draw-prompt-input" id="drawPromptInput" placeholder="描述你想要的画面，例如：一名医美顾问向客户介绍玻尿酸项目，专业、温暖、现代风格" rows="3"></textarea>
        <div class="draw-status" id="drawStatus"></div>
        <img class="draw-result-img" id="drawResultImg" style="display:none" />
        <div class="draw-modal-footer">
          <button class="draw-cancel-btn" onclick="closeDrawModal()"> 取消</button>
          <button class="draw-submit-btn" id="drawSubmitBtn" onclick="submitDraw()"> 生成图片</button>
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
        addMessage('assistant', `🎨 已根据描述「${prompt}」生成图片\n\n![AI绘图](${finalImgUrl})`);
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
    lastUserMsg = displayMsg;  // 记录用户消息供反馈学习使用
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
                  reasoningEl.innerHTML = '<summary>🧠 正在深度思考...</summary><div class="reasoning-content"></div>';
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
                searchResults = evt.results;
              } else if (evt.type === 'step') {
                // 动态步骤卡片（专家模式）
                let stepsContainer = bubble.querySelector('.expert-steps-container');
                if (!stepsContainer) {
                  stepsContainer = document.createElement('div');
                  stepsContainer.className = 'expert-steps-container';
                  bubble.insertBefore(stepsContainer, bubble.firstChild);
                }
                // 查找已有步骤
                let stepEl = stepsContainer.querySelector(`[data-step-id="${evt.id}"]`);
                if (!stepEl) {
                  stepEl = document.createElement('div');
                  stepEl.className = 'expert-step-item';
                  stepEl.dataset.stepId = evt.id;
                  stepEl.innerHTML = `<span class="expert-step-icon"><span class="spin"></span></span><span class="expert-step-text"></span>`;
                  stepsContainer.appendChild(stepEl);
                }
                // 更新文字
                stepEl.querySelector('.expert-step-text').textContent = evt.text;
                // 更新状态
                const iconEl = stepEl.querySelector('.expert-step-icon');
                if (evt.status === 'done') {
                  stepEl.classList.add('done');
                  iconEl.innerHTML = '<span class="check">✓</span>';
                } else if (evt.status === 'error') {
                  stepEl.classList.add('error');
                  iconEl.innerHTML = '<span class="err">✗</span>';
                } else {
                  iconEl.innerHTML = '<span class="spin"></span>';
                }
                container.scrollTop = container.scrollHeight;
              } else if (evt.type === 'delta') {
                hideNmpaIndicator(); // 开始输出回答，隐藏查询提示
                hideToolStatusIndicator(); // 隐藏工具状态提示
                // 步骤卡片折叠（所有步骤标记为完成）
                const stepsBox = bubble.querySelector('.expert-steps-container');
                if (stepsBox && !stepsBox.dataset.collapsed) {
                  stepsBox.dataset.collapsed = '1';
                  // 把所有仍在 running 的步骤标记为 done
                  stepsBox.querySelectorAll('.expert-step-item:not(.done):not(.error)').forEach(el => {
                    el.classList.add('done');
                    el.querySelector('.expert-step-icon').innerHTML = '<span class="check">✓</span>';
                  });
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
                  bubble.innerHTML = (typeof DOMPurify !== 'undefined') ? DOMPurify.sanitize(marked.parse(renderText)) : marked.parse(renderText);
                  wrapTables(bubble);
                } else {
                  bubble.textContent = fullText;
                }
                container.scrollTop = container.scrollHeight;
              } else if (evt.type === 'done') {
                // 思考结束，更新思考框标题
                const rBox = bubble.querySelector('.reasoning-box summary');
                if (rBox && rBox.textContent.includes('正在')) {
                  rBox.textContent = '💡 思考过程（点击展开）';
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
      avatar.innerHTML = (agent.id === 'doudou' || agent.id === 'douding' || agent.id === 'douya') ? `<img src="${getAgentDefaultImg(agent.id) || '/mascot-default.png'}" alt="${agent.id === 'doudou' ? '豆子' : agent.id === 'douding' ? '豆丁' : '豆芽'}" style="object-fit:contain">` : `<img src="/avatars/${agent.id}.svg" alt="${agent.name}" onerror="this.parentNode.textContent='${agent.icon}'">`;
    } else { avatar.textContent = '🤖'; }
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.innerHTML = '<span style="opacity:0.5">█</span>'; // blinking cursor
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
      bubble.innerHTML = (typeof DOMPurify !== 'undefined') ? DOMPurify.sanitize(marked.parse(mainContent)) : marked.parse(mainContent);
      injectCodeCopyBtns(bubble);
      wrapTables(bubble);
      injectAgentLinks(bubble);
    } else {
      bubble.textContent = mainContent;
    }

    // Search sources
    if (searchResults && searchResults.length > 0) {
      const srcDiv = document.createElement('div');
      srcDiv.className = 'search-source-list';
      const links = searchResults.slice(0, 5).map((s, i) =>
        '<a href="' + s.url + '" target="_blank" rel="noopener" title="' + (s.title || s.url) + '">[' + (i+1) + '] ' + (s.title || s.url) + '</a>'
      ).join('');
      srcDiv.innerHTML = '<span class="src-label">🔍 联网参考：</span>' + links;
      bubble.appendChild(srcDiv);
    }

    // Feedback buttons
    const feedback = document.createElement('div');
    feedback.className = 'msg-feedback';
    const idx = messageIndex++;
    feedback.dataset.userMsg = lastUserMsg;
    feedback.dataset.assistantMsg = mainContent.substring(0, 2000);  // 最多取2000字
    feedback.innerHTML = '<span class="feedback-hint">有帮助吗？</span><button class="feedback-btn" onclick="submitFeedback(this,' + idx + ',\'up\')">👍 有用</button><button class="feedback-btn" onclick="submitFeedback(this,' + idx + ',\'down\')">👎 不准</button>';
    bubble.appendChild(feedback);

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
      avatar.innerHTML = (agent.id === 'doudou' || agent.id === 'douding' || agent.id === 'douya') ? `<img src="${getAgentDefaultImg(agent.id) || '/mascot-default.png'}" alt="${agent.id === 'doudou' ? '豆子' : agent.id === 'douding' ? '豆丁' : '豆芽'}" style="object-fit:contain">` : `<img src="/avatars/${agent.id}.svg" alt="${agent.name}" onerror="this.parentNode.textContent='${agent.icon}'">`;
    } else {
      avatar.textContent = '🤖';
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
        const links = searchResults.slice(0, 5).map((s, i) =>
          `<a href="${s.url}" target="_blank" rel="noopener" title="${s.title || s.url}">[${i+1}] ${s.title || s.url}</a>`
        ).join('');
        srcDiv.innerHTML = `<span class="src-label">🔍 联网参考：</span>${links}`;
        bubble.appendChild(srcDiv);
      }
      const feedback = document.createElement('div');
      feedback.className = 'msg-feedback';
      const idx = messageIndex++;
      feedback.dataset.userMsg = lastUserMsg;
      feedback.dataset.assistantMsg = (mainContent || content || '').substring(0, 2000);
      feedback.innerHTML = `<span class="feedback-hint">有帮助吗？</span><button class="feedback-btn" onclick="submitFeedback(this,${idx},'up')">👍 有用</button><button class="feedback-btn" onclick="submitFeedback(this,${idx},'down')">👎 不准</button>`;
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
      default:    'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/rpNxPtAcoLvqMBIl.png',
      coffee:     'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/rJcjoSULfwDshywp.png',
      sunglasses: 'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/jYOWNiRUyEvLypVK.png',
      report:     'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/aupTInjkDYGWHQZw.png',
      sleepy:     'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/tyMugFuBhiHGazel.png',
      happy:      'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/HXUhLsdKlxAVnrOX.png'
    },
    douding: {
      default:    'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/owNRYStTXHONGuNk.png',
      flower:     'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/amGXwiWJukeVrApc.png',
      mic:        'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/FUXToJndeiZTKbzJ.png',
      thumbsup:   'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/gYAbNPtZtiEqfBgU.png',
      shy:        'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/PuVHCCTmJzppcVbD.png',
      drink:      'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/DruqwjMUtHeKCnOm.png'
    },
    douya: {
      default:    'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/GgMEvsMLAyXIubDF.png',
      think:      'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/fKgyTLGOmpokvoHJ.png',
      writing:    'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/OPptYAnRovlCOmzi.png',
      run:        'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/PoAScGLLnDEAcYVk.png',
      flag:       'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/koYOZXMmvdeBeavQ.png',
      confused:   'https://files.manuscdn.com/user_upload_by_module/session_file/309929252235541334/zKpYKEHvnUVthQdj.png'
    }
  };

  // 豆子的情绪→状态映射（兼容旧的 thinking/happy/confused/talking）
  const DOUZAI_EMOTION_MAP = {
    default:  'default',
    thinking: 'report',
    happy:    'happy',
    confused: 'sleepy',
    talking:  'coffee'
  };
  // 豆丁的情绪→状态映射
  const DOUDING_EMOTION_MAP = {
    default:  'default',
    thinking: 'mic',
    happy:    'thumbsup',
    confused: 'shy',
    talking:  'drink'
  };
  // 豆芽的情绪→状态映射
  const DOUYA_EMOTION_MAP = {
    default:  'default',
    thinking: 'think',
    happy:    'flag',
    confused: 'confused',
    talking:  'writing'
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
    if (agentId === 'doudou') return 'douzai';
    if (agentId === 'douding') return 'douding';
    if (agentId === 'douya') return 'douya';
    return null;
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
    default:  IP_IMAGES.douzai.default,
    thinking: IP_IMAGES.douzai.report,
    happy:    IP_IMAGES.douzai.happy,
    confused: IP_IMAGES.douzai.sleepy,
    talking:  IP_IMAGES.douzai.coffee
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
      avatar.innerHTML = (agent.id === 'doudou' || agent.id === 'douding' || agent.id === 'douya') ? `<img src="${getAgentDefaultImg(agent.id) || '/mascot-default.png'}" alt="${agent.id === 'doudou' ? '豆子' : agent.id === 'douding' ? '豆丁' : '豆芽'}" style="object-fit:contain">` : `<img src="/avatars/${agent.id}.svg" alt="${agent.name}" onerror="this.parentNode.textContent='${agent.icon}'">`;
    } else { avatar.textContent = '🤖'; }
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
    if (hint) { hint.textContent = val === 'up' ? '✓ 感谢反馈，将用于改进训练' : '✓ 已记录，将持续优化'; hint.style.color = val === 'up' ? '#16A34A' : '#DC2626'; }
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
        showToast('申请已提交，管理员將24小时内处理 ✅');
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
        <button onclick="closePayModal()" style="position:absolute;top:1rem;right:1rem;background:none;border:none;font-size:1.25rem;cursor:pointer;color:#767676">✕</button>
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
          document.getElementById('payStatus').innerHTML = '✅ 支付成功！正在刷新...';
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
          if (a) return a.icon;
        }
        return '🤖';
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
        agent = { id: agentId || data.agentId, icon: '🤖', name: data.agentName || agentId, desc: '' };
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
      histTopbarAvatar.innerHTML = `<img src="/avatars/${agent.id}.svg" alt="${agent.name}" onerror="this.parentNode.textContent='${agent.icon}'">`;
      document.getElementById('topbarName').textContent = agent.name;
      document.getElementById('topbarDesc').textContent = '📜 历史对话记录';

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
        showLoadedSkillBadge(data.skillName);
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
      el.classList.toggle('active', (tab === 'files' && i === 0) || (tab === 'skills' && i === 1));
    });
    document.getElementById('resourceTabFiles').classList.toggle('active', tab === 'files');
    document.getElementById('resourceTabSkills').classList.toggle('active', tab === 'skills');
    if (tab === 'skills') loadSkillsList();
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
        return `<div class="skill-card" onclick="previewSkill('${s.id}')">
          <div class="skill-card-header">
            <span class="skill-card-name">${s.skillName || s.id}</span>
            <span class="skill-card-badge">${s.messageCount}条对话</span>
          </div>
          <div class="skill-card-meta">来源: ${s.agentName || '未知'} | ${date}</div>
          <div class="skill-card-actions">
            <button class="skill-action-btn" onclick="event.stopPropagation();loadSkillToCurrentChat('${s.id}')">加载</button>
            <button class="skill-action-btn" onclick="event.stopPropagation();downloadSkill('${s.id}')">下载</button>
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
