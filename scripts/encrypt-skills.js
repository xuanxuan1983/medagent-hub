#!/usr/bin/env node
/**
 * 加密 skill 文件 → 输出可直接写入 ecosystem.config.js 的环境变量值
 * 用法: node scripts/encrypt-skills.js <SKILL_KEY_HEX>
 * 若不传 KEY，则自动生成一个新的 32 字节随机 KEY
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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
];

// 获取或生成 KEY
let keyHex = process.argv[2];
if (!keyHex) {
  keyHex = crypto.randomBytes(32).toString('hex');
  console.log('\n⚠️  未传入 SKILL_KEY，已自动生成新 KEY（请保存好！）:');
  console.log(`SKILL_KEY=${keyHex}\n`);
} else {
  console.log(`\n✅ 使用传入的 SKILL_KEY: ${keyHex.substring(0, 8)}...\n`);
}

const key = Buffer.from(keyHex, 'hex');
const skillsDir = path.join(__dirname, '..', 'skills');

function encryptSkill(content) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(content, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

const results = [];
const missing = [];

SKILLS_TO_ENCRYPT.forEach(skillName => {
  const skillPath = path.join(skillsDir, `${skillName}.md`);
  if (!fs.existsSync(skillPath)) {
    missing.push(skillName);
    return;
  }
  let content = fs.readFileSync(skillPath, 'utf8');
  // 移除 YAML frontmatter
  content = content.replace(/^---\n[\s\S]*?\n---\n/, '');
  const envKey = `SKILL_${skillName.replace(/-/g, '_').toUpperCase()}`;
  const encrypted = encryptSkill(content);
  results.push({ envKey, encrypted });
});

console.log('='.repeat(70));
console.log('请将以下内容添加到服务器的 ecosystem.config.js 的 env 块中:');
console.log('='.repeat(70));
console.log(`\n        SKILL_KEY: '${keyHex}',`);
results.forEach(({ envKey, encrypted }) => {
  console.log(`        ${envKey}: '${encrypted}',`);
});

if (missing.length > 0) {
  console.log('\n⚠️  以下 skill 文件不存在，已跳过:');
  missing.forEach(s => console.log(`   - ${s}.md`));
}

console.log('\n' + '='.repeat(70));
console.log('✅ 加密完成！后续步骤:');
console.log('   1. 将上方配置写入服务器 /home/ubuntu/medagent-hub/ecosystem.config.js');
console.log('   2. 执行: pm2 start ecosystem.config.js --update-env');
console.log('   3. （可选）从 GitHub 删除已加密的 .md 文件以保护提示词');
console.log('='.repeat(70) + '\n');
