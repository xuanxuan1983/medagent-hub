#!/usr/bin/env node
/**
 * decrypt-skill.js
 * 验证工具：解密单个 skill 环境变量，确认内容正确
 * 用法：SKILL_KEY=xxx node decrypt-skill.js SKILL_SENIOR_CONSULTANT
 */

const crypto = require('crypto');

const keyHex = process.env.SKILL_KEY;
if (!keyHex) { console.error('❌ 请设置 SKILL_KEY 环境变量'); process.exit(1); }

const KEY = Buffer.from(keyHex, 'hex');
const envKey = process.argv[2];
if (!envKey) { console.error('用法: SKILL_KEY=xxx node decrypt-skill.js SKILL_XXX'); process.exit(1); }

const encrypted = process.env[envKey];
if (!encrypted) { console.error(`❌ 环境变量 ${envKey} 不存在`); process.exit(1); }

function decrypt(b64) {
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.slice(0, 12);
  const tag = buf.slice(12, 28);
  const ciphertext = buf.slice(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

try {
  const plaintext = decrypt(encrypted);
  console.log(plaintext.substring(0, 200) + '\n...(前200字符)');
  console.error(`✅ 解密成功，总长度: ${plaintext.length} 字符`);
} catch (e) {
  console.error('❌ 解密失败:', e.message);
}
