/**
 * patch-api-server-memory.js
 * 为 api-server.js 添加 LLM 异步记忆提取调用
 * 在两处用户记忆更新代码后，添加异步 LLM 提取（不阻塞响应）
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'api-server.js');
let content = fs.readFileSync(filePath, 'utf-8');

// ===== 第一处 patch =====
const OLD1 = `      // ===== 用户记忆系统：提取属性并注入上下文 =====
      try {
        const userMemModule = require('./user-memory');
        const profiles = loadProfiles();
        const memUpdated = userMemModule.updateUserMemory(profiles, userCode, message);
        if (memUpdated) saveProfiles(profiles);
        const memContext = userMemModule.getUserMemoryContext(profiles, userCode, session.messages);
        if (memContext) {
          session._memoryContext = memContext;  // 缓存到session，避免重复读取
        }
      } catch (e) {
        console.warn('[用户记忆] 提取跳过:', e.message);
      }`;

const NEW1 = `      // ===== 用户记忆系统：提取属性并注入上下文 =====
      try {
        const userMemModule = require('./user-memory');
        const profiles = loadProfiles();
        const memUpdated = userMemModule.updateUserMemory(profiles, userCode, message);
        if (memUpdated) saveProfiles(profiles);
        const memContext = userMemModule.getUserMemoryContext(profiles, userCode, session.messages);
        if (memContext) {
          session._memoryContext = memContext;  // 缓存到session，避免重复读取
        }
        // LLM 深度提取（异步，每5轮触发，不阻塞响应）
        if (userMemModule.updateUserMemoryWithLLM) {
          userMemModule.updateUserMemoryWithLLM(profiles, userCode, session.messages, saveProfiles).catch(() => {});
        }
      } catch (e) {
        console.warn('[用户记忆] 提取跳过:', e.message);
      }`;

// ===== 第二处 patch =====
const OLD2 = `      // ===== 用户记忆系统：提取属性并注入上下文 =====
      try {
        const userMemModule2 = require('./user-memory');
        const profiles2 = loadProfiles();
        const memUpdated2 = userMemModule2.updateUserMemory(profiles2, userCode2, message);
        if (memUpdated2) saveProfiles(profiles2);
        const memContext2 = userMemModule2.getUserMemoryContext(profiles2, userCode2, session2.messages);
        if (memContext2) session2._memoryContext = memContext2;
      } catch (e) {
        console.warn('[用户记忆] 提取跳过:', e.message);
      }`;

const NEW2 = `      // ===== 用户记忆系统：提取属性并注入上下文 =====
      try {
        const userMemModule2 = require('./user-memory');
        const profiles2 = loadProfiles();
        const memUpdated2 = userMemModule2.updateUserMemory(profiles2, userCode2, message);
        if (memUpdated2) saveProfiles(profiles2);
        const memContext2 = userMemModule2.getUserMemoryContext(profiles2, userCode2, session2.messages);
        if (memContext2) session2._memoryContext = memContext2;
        // LLM 深度提取（异步，每5轮触发，不阻塞响应）
        if (userMemModule2.updateUserMemoryWithLLM) {
          userMemModule2.updateUserMemoryWithLLM(profiles2, userCode2, session2.messages, saveProfiles).catch(() => {});
        }
      } catch (e) {
        console.warn('[用户记忆] 提取跳过:', e.message);
      }`;

let count = 0;
if (content.includes(OLD1)) {
  content = content.replace(OLD1, NEW1);
  count++;
  console.log('✅ 第一处 patch 成功');
} else {
  console.log('❌ 第一处 patch 未找到目标代码');
}

if (content.includes(OLD2)) {
  content = content.replace(OLD2, NEW2);
  count++;
  console.log('✅ 第二处 patch 成功');
} else {
  console.log('❌ 第二处 patch 未找到目标代码');
}

if (count > 0) {
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`\n✅ 共完成 ${count} 处 patch，文件已保存`);
} else {
  console.log('\n⚠️ 没有任何 patch 被应用，请检查目标代码是否已变更');
}
