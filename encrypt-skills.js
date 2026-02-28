#!/usr/bin/env node
/**
 * encrypt-skills.js
 * 将 skills/ 目录下所有 .md 文件加密，输出 .env 格式的环境变量
 * 用法：node encrypt-skills.js [--key <32字节hex密钥>]
 *
 * 首次运行会自动生成随机密钥，请将输出的 SKILL_KEY 保存到服务器 .env 文件
 * 后续更新 skill 时，使用同一个 SKILL_KEY 重新加密
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ── 密钥处理 ──────────────────────────────────────────────────────────────────
let keyHex = process.env.SKILL_KEY;

// 从命令行参数读取
const keyArgIdx = process.argv.indexOf('--key');
if (keyArgIdx !== -1 && process.argv[keyArgIdx + 1]) {
  keyHex = process.argv[keyArgIdx + 1];
}

// 如果没有密钥，生成新的
if (!keyHex) {
  keyHex = crypto.randomBytes(32).toString('hex');
  console.error('⚠️  未提供 SKILL_KEY，已自动生成新密钥（请保存！）：');
  console.error(`SKILL_KEY=${keyHex}`);
  console.error('');
}

const KEY = Buffer.from(keyHex, 'hex');
if (KEY.length !== 32) {
  console.error('❌ SKILL_KEY 必须是 64 位十六进制字符串（32字节）');
  process.exit(1);
}

// ── 加密函数 ──────────────────────────────────────────────────────────────────
function encrypt(plaintext) {
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16-byte auth tag
  // Format: iv(12) + tag(16) + ciphertext → base64
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

// ── 读取并加密所有 skill 文件 ──────────────────────────────────────────────────
const skillsDir = path.join(__dirname, 'skills');
const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md');

const lines = [`SKILL_KEY=${keyHex}`];

for (const file of files) {
  const skillName = file.replace('.md', '');
  const content = fs.readFileSync(path.join(skillsDir, file), 'utf8');
  // Remove YAML frontmatter before encrypting
  const withoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '');
  const encrypted = encrypt(withoutFrontmatter);
  // Convert skill name to env var key: replace - with _
  const envKey = `SKILL_${skillName.replace(/-/g, '_').toUpperCase()}`;
  lines.push(`${envKey}=${encrypted}`);
  console.error(`✅ 已加密: ${skillName} → ${envKey}`);
}

// 输出到 stdout（可重定向到文件）
console.log(lines.join('\n'));
console.error('');
console.error('📋 请将以上内容追加到服务器 .env 文件，然后重启服务。');
console.error('🔒 加密完成后，可以删除或清空 skills/*.md 文件内容（保留文件名即可）。');
