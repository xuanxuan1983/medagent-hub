#!/usr/bin/env node
/**
 * 一键加密 skill 文件并自动更新 ecosystem.config.js
 * 
 * 用法:
 *   node scripts/apply-encryption.js              # 首次运行：自动生成新 KEY
 *   node scripts/apply-encryption.js <KEY_HEX>    # 使用已有 KEY（更新 skill 后重新加密）
 * 
 * 运行后会自动:
 *   1. 加密所有 skill 文件
 *   2. 将 SKILL_KEY 和所有 SKILL_XXX 写入 ecosystem.config.js
 *   3. 备份原始 ecosystem.config.js（→ ecosystem.config.js.bak）
 *   4. 提示执行 pm2 restart
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ECOSYSTEM_PATH = path.join(ROOT, 'ecosystem.config.js');
const SKILLS_DIR = path.join(ROOT, 'skills');

// ============================================================
// 需要加密保护的 skill 列表（新增 agent 时在此添加）
// ============================================================
const SKILLS_TO_ENCRYPT = [
  // 高价值核心 agent
  'doudou',
  'senior-consultant',
  'sparring-partner',
  'neuro-aesthetic-architect',
  'gtm-strategist',
  'material-architect',
  'aesthetic-designer',
  'kv-design-director',
  'first-principles-analyst',
  // 内容创作类 agent
  'xhs-content-creator',
  'ppt-creator',
  'wechat-content-creator',
  'comic-creator',
  'article-illustrator',
  'cover-image-creator',
  'social-media-creator',
  // 其他专业 agent
  'sales-director',
  'marketing-director',
  'product-strategist',
  'medical-liaison',
  'hrbp',
  'finance-bp',
  'sfe-director',
  'procurement-manager',
  'postop-specialist',
  'new-media-director',
  'creative-director',
  'channel-manager',
  'area-manager',
  // 补充加密（铁律：所有 skill 必须加密）
  'anatomy-architect',
  'materials-mentor',
  'meta-prompt-architect',
  'operations-director',
  'personal-brand-cinematic',
  'personal-ip-builder',
  'prompt-engineer-pro',
  'super-writer',
  'training-director',
  'visual-translator',
];

// ============================================================
// 加密函数
// ============================================================
function encryptSkill(content, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(content, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

// ============================================================
// 主流程
// ============================================================
let keyHex = process.argv[2];
let isNewKey = false;

if (!keyHex) {
  keyHex = crypto.randomBytes(32).toString('hex');
  isNewKey = true;
  console.log('\n🔑 已自动生成新的加密 KEY（请妥善保存！）:');
  console.log(`   SKILL_KEY = ${keyHex}\n`);
} else {
  if (keyHex.length !== 64) {
    console.error('❌ SKILL_KEY 必须是 64 位十六进制字符串（32 字节）');
    process.exit(1);
  }
  console.log(`\n✅ 使用传入的 SKILL_KEY: ${keyHex.substring(0, 8)}...\n`);
}

const key = Buffer.from(keyHex, 'hex');

// 加密所有 skill
const encryptedMap = {};
const missing = [];

console.log('📦 正在加密 skill 文件...');
SKILLS_TO_ENCRYPT.forEach(skillName => {
  const skillPath = path.join(SKILLS_DIR, `${skillName}.md`);
  if (!fs.existsSync(skillPath)) {
    missing.push(skillName);
    return;
  }
  let content = fs.readFileSync(skillPath, 'utf8');
  content = content.replace(/^---\n[\s\S]*?\n---\n/, ''); // 移除 YAML frontmatter
  const envKey = `SKILL_${skillName.replace(/-/g, '_').toUpperCase()}`;
  encryptedMap[envKey] = encryptSkill(content, key);
  console.log(`   ✅ ${skillName}`);
});

if (missing.length > 0) {
  console.log(`\n⚠️  以下 skill 文件不存在，已跳过: ${missing.join(', ')}`);
}

// 读取当前 ecosystem.config.js
const originalContent = fs.readFileSync(ECOSYSTEM_PATH, 'utf8');

// 备份
const backupPath = ECOSYSTEM_PATH + '.bak';
fs.writeFileSync(backupPath, originalContent);
console.log(`\n💾 已备份原始配置到: ${backupPath}`);

// 解析并更新 env 块
// 策略：找到 env: { ... } 块，注入/更新 SKILL_KEY 和所有 SKILL_XXX
let newContent = originalContent;

// 构建要注入的字符串
const skillLines = [
  `\n        // 🔐 Skill 加密配置（由 scripts/apply-encryption.js 自动生成）`,
  `        SKILL_KEY: '${keyHex}',`,
];
Object.entries(encryptedMap).forEach(([envKey, encrypted]) => {
  skillLines.push(`        ${envKey}: '${encrypted}',`);
});
const injectionBlock = skillLines.join('\n');

// 移除旧的 SKILL_ 配置块（如果存在）
newContent = newContent.replace(/\n\s*\/\/ 🔐 Skill 加密配置[\s\S]*?(?=\n\s*\/\/|\n\s*})/g, '\n');
newContent = newContent.replace(/\n\s*SKILL_[A-Z_]+:\s*'[^']*',/g, '');

// 在 env: { 的最后一个已知 key 之后注入
// 找到 NOTION_DATABASE_IDS 这行（或最后一个非空 env 行）后面注入
if (newContent.includes('NOTION_DATABASE_IDS')) {
  newContent = newContent.replace(
    /(NOTION_DATABASE_IDS:\s*'[^']*',)/,
    `$1${injectionBlock}`
  );
} else {
  // 回退：在 env: { 后面的第一个 key 前注入
  newContent = newContent.replace(
    /(env:\s*\{)/,
    `$1${injectionBlock}`
  );
}

// 写入新配置
fs.writeFileSync(ECOSYSTEM_PATH, newContent);

console.log('\n✅ ecosystem.config.js 已更新！');
console.log('\n🚀 请执行以下命令使配置生效:');
console.log('   pm2 start ecosystem.config.js --update-env\n');

if (isNewKey) {
  console.log('⚠️  重要提醒：请将以下 KEY 保存到安全的地方，下次更新 skill 时需要用到:');
  console.log(`   node scripts/apply-encryption.js ${keyHex}\n`);
}
