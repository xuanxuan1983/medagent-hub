#!/usr/bin/env node
/**
 * 将 collagen-registration.md 向量化并写入全局知识库索引
 * 在服务器上执行：node scripts/vectorize-collagen.js
 */

const path = require('path');
const fs = require('fs');

// 加载 .env（如果存在）
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^([^=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
} catch {}

const kb = require('../knowledge-base');

const filePath = path.join(__dirname, '..', 'knowledge', 'global', 'collagen-registration.md');
const sfKey = process.env.SILICONFLOW_API_KEY;

if (!sfKey) {
  console.error('❌ 缺少 SILICONFLOW_API_KEY 环境变量');
  console.error('   请先执行: export SILICONFLOW_API_KEY=your_key');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error('❌ 文件不存在:', filePath);
  process.exit(1);
}

console.log('📄 开始向量化:', path.basename(filePath));
console.log('   文件大小:', fs.statSync(filePath).size, 'bytes');

kb.addDocument(filePath, 'global', sfKey, (progress) => {
  const bar = '█'.repeat(Math.floor((progress.progress || 0) / 5)) + '░'.repeat(20 - Math.floor((progress.progress || 0) / 5));
  process.stdout.write(`\r   [${bar}] ${progress.progress || 0}% - ${progress.step}`);
  if (progress.chunks) process.stdout.write(` (${progress.done || 0}/${progress.total || progress.chunks} chunks)`);
}).then(result => {
  console.log('\n✅ 向量化完成！');
  console.log('   文件ID:', result.fileId);
  console.log('   文件名:', result.fileName);
  console.log('   分块数:', result.chunks);
  console.log('   范围:', result.scope);
  
  // 验证写入结果
  const stats = kb.getStats();
  console.log('\n📊 当前知识库统计:');
  console.log('   全局向量块总数:', stats.globalChunks);
  console.log('   全局文件数:', stats.globalFiles);
}).catch(err => {
  console.error('\n❌ 向量化失败:', err.message);
  process.exit(1);
});
