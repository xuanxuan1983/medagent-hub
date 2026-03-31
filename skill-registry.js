/**
 * MedAgent Hub — Skill 注册中心 v1.0
 *
 * 功能：
 * 1. 启动时扫描 skills/ 目录，从 frontmatter 自动构建路由表
 * 2. 用 fs.watch 监听文件变化，热加载无需重启 PM2
 * 3. 导出 agentSkillMap、agentNames、SKILL_DISPLAY_NAMES 等，供 api-server.js 和 tools/index.js 使用
 *
 * Skill frontmatter 新增字段（可选，向后兼容）：
 *   agent_id:      string   - 对应的 agentId（默认等于 skill filename）
 *   display_name:  string   - 前端展示名称（默认等于 name 字段）
 *   ip_owner:      string   - 所属 IP（doudou/douding/douya，多个用逗号分隔）
 *   redirect_from: string   - 当其他 IP 错误路由到此 skill 时，重定向到哪个 skill
 */

'use strict';

const fs = require('fs');
const path = require('path');

const skillsDir = path.join(__dirname, 'skills');

// ─── 静态兜底表（保证旧 Skill 文件不加 agent_id 也能正常工作）─────────────────
// key: skillFileName (不含 .md)，value: agentId
const STATIC_AGENT_ID_MAP = {
  'product-strategist':  'product-expert',
  'sfe-director':        'operations-director',
  'creative-director':   'visual-translator',
};

// key: agentId，value: displayName（前端展示）
const STATIC_DISPLAY_NAMES = {
  'gtm-strategist':          'GTM战略大师',
  'product-expert':          '产品材料专家',
  'medical-liaison':         '学术推广专家',
  'marketing-director':      '市场创意总监',
  'sales-director':          '销售作战总监',
  'operations-director':     '运营效能总监',
  'aesthetic-designer':      '高定美学设计总监',
  'senior-consultant':       '金牌医美咨询师',
  'sparring-partner':        '医美实战陪练机器人',
  'postop-specialist':       '医美术后私域管家',
  'trend-setter':            '医美爆款种草官',
  'training-director':       '培训赋能总监',
  'anatomy-architect':       '医美解剖决策建筑师',
  'materials-mentor':        '医美材料学硬核导师',
  'visual-translator':       '医美视觉通译官',
  'material-architect':      '医美材料学架构师',
  'area-manager':            '大区经理',
  'channel-manager':         '商务经理',
  'finance-bp':              '财务BP',
  'hrbp':                    '战略HRBP',
  'procurement-manager':     '采购经理',
  'new-media-director':      '医美合规内容专家',
  'kv-design-director':      '视觉KV设计总监',
  'meta-prompt-architect':   '元提示词架构师',
  'prompt-engineer-pro':     '高级Prompt工程师',
  'first-principles-analyst':'第一性原理深度剖析专家',
  'doudou':                  '豆子',
  'douding':                 '豆丁',
  'douya':                   '豆芽',
  'xhs-content-creator':     '小红书图文创作顾问',
  'ppt-creator':             'PPT创作顾问',
  'wechat-content-creator':  '微信公众号运营顾问',
  'comic-creator':           '知识漫画创作顾问',
  'article-illustrator':     '文章配图顾问',
  'cover-image-creator':     '封面图创作顾问',
  'social-media-creator':    '社交媒体运营顾问',
  'personal-ip-builder':     '个人IP打造指南',
  'personal-brand-cinematic':'电影感品牌视觉顾问',
  'super-writer':            '超级写作助手',
};

// ─── 解析单个 Skill 文件的 frontmatter ──────────────────────────────────────
function parseSkillFrontmatter(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.startsWith('---')) return {};
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return {};
    const fm = fmMatch[1];
    const meta = {};
    for (const line of fm.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (val === 'true') meta[key] = true;
      else if (val === 'false') meta[key] = false;
      else if (val.startsWith('[') && val.endsWith(']')) {
        meta[key] = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
      } else {
        meta[key] = val;
      }
    }
    return meta;
  } catch (e) {
    return {};
  }
}

// ─── 扫描 skills/ 目录，构建完整注册表 ──────────────────────────────────────
function buildRegistry() {
  const agentSkillMap = {};    // agentId -> skillFileName
  const agentNames = {};       // agentId -> displayName
  const skillDisplayNames = {}; // skillFileName -> displayName（供 tools/index.js 用）
  const ipWhitelist = {        // ipAgentId -> Set<skillId>
    doudou: new Set(),
    douding: new Set(),
    douya: new Set(),
  };

  let files;
  try {
    files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
  } catch (e) {
    console.error('[SkillRegistry] 无法读取 skills 目录:', e.message);
    return { agentSkillMap, agentNames, skillDisplayNames, ipWhitelist };
  }

  for (const file of files) {
    const skillName = file.replace(/\.md$/, '');
    const meta = parseSkillFrontmatter(path.join(skillsDir, file));

    // 确定 agentId：优先 frontmatter 的 agent_id，其次静态兜底表，最后等于 skillName
    const agentId = meta.agent_id || STATIC_AGENT_ID_MAP[skillName] || skillName;

    // 确定 displayName：优先 frontmatter 的 display_name，其次静态表，最后用 name 字段
    const displayName = meta.display_name
      || STATIC_DISPLAY_NAMES[agentId]
      || meta.name
      || agentId;

    agentSkillMap[agentId] = skillName;
    agentNames[agentId] = displayName;
    skillDisplayNames[skillName] = displayName;

    // 处理 ip_owner 字段，自动注册到对应 IP 的白名单
    if (meta.ip_owner) {
      const owners = String(meta.ip_owner).split(',').map(s => s.trim());
      for (const owner of owners) {
        if (ipWhitelist[owner]) {
          ipWhitelist[owner].add(agentId);
        }
      }
    }
  }

  console.log(`[SkillRegistry] 扫描完成：${files.length} 个 Skill，${Object.keys(agentSkillMap).length} 个 Agent`);
  return { agentSkillMap, agentNames, skillDisplayNames, ipWhitelist };
}

// ─── 注册表单例（可变，热加载时原地更新）───────────────────────────────────
let _registry = buildRegistry();

// 导出引用（调用方通过 registry.agentSkillMap 访问，热加载后自动获得新值）
const registry = {
  get agentSkillMap()    { return _registry.agentSkillMap; },
  get agentNames()       { return _registry.agentNames; },
  get skillDisplayNames(){ return _registry.skillDisplayNames; },
  get ipWhitelist()      { return _registry.ipWhitelist; },

  /** 手动触发重建（测试用） */
  reload() {
    _registry = buildRegistry();
    console.log('[SkillRegistry] 手动重载完成');
  }
};

// ─── fs.watch 热加载（防抖 500ms，避免编辑器多次触发）────────────────────────
let _debounceTimer = null;
function scheduleReload(filename) {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    console.log(`[SkillRegistry] 检测到文件变化: ${filename}，重建注册表...`);
    _registry = buildRegistry();
    _debounceTimer = null;
  }, 500);
}

try {
  fs.watch(skillsDir, { persistent: false }, (eventType, filename) => {
    if (filename && filename.endsWith('.md')) {
      scheduleReload(filename);
    }
  });
  console.log('[SkillRegistry] 热加载监听已启动，修改 skills/*.md 无需重启服务');
} catch (e) {
  console.warn('[SkillRegistry] fs.watch 启动失败（降级为静态加载）:', e.message);
}

module.exports = registry;
