#!/usr/bin/env node
/**
 * 加密 skill 文件 → 输出可直接写入 ecosystem.config.js 的环境变量值
 * 用法: node scripts/encrypt-skills.js <SKILL_KEY_HEX>
 * 若不传 KEY，则自动生成一个新的 32 字节随机 KEY
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SKILLS_TO_ENCRYPT = [
  'meta-prompt-architect',
  'prompt-engineer-pro',
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

console.log('='.repeat(60));
console.log('请将以下内容添加到服务器的 ecosystem.config.js 的 env 中:');
console.log('='.repeat(60));
console.log(`\nSKILL_KEY: '${keyHex}',`);

SKILLS_TO_ENCRYPT.forEach(skillName => {
  const skillPath = path.join(skillsDir, `${skillName}.md`);
  if (!fs.existsSync(skillPath)) {
    console.error(`\n❌ 文件不存在: ${skillPath}`);
    return;
  }
  let content = fs.readFileSync(skillPath, 'utf8');
  // 移除 YAML frontmatter
  content = content.replace(/^---\n[\s\S]*?\n---\n/, '');
  
  const envKey = `SKILL_${skillName.replace(/-/g, '_').toUpperCase()}`;
  const encrypted = encryptSkill(content);
  console.log(`\n${envKey}: '${encrypted}',`);
});

console.log('\n' + '='.repeat(60));
console.log('⚠️  加密完成后，请从 GitHub 仓库删除对应的 .md 文件！');
console.log('='.repeat(60) + '\n');
