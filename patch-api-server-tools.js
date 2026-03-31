/**
 * patch-api-server-tools.js
 * 为 api-server.js 中的 executeTool 调用添加 userMemory 上下文
 * 同时为 get_user_memory 工具添加专门处理逻辑
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'api-server.js');
let content = fs.readFileSync(filePath, 'utf-8');
let count = 0;

// ===== Patch 1: query_med_db 调用添加 userMemory =====
const OLD1 = `              const toolResult = await toolRegistry.executeTool('query_med_db', toolArgs, {
                message, nmpaSearch, detectNmpaProduct, bochaSearch
              });`;
const NEW1 = `              const toolResult = await toolRegistry.executeTool('query_med_db', toolArgs, {
                message, nmpaSearch, detectNmpaProduct, bochaSearch,
                userMemory: profiles?.[userCode]?.memory || {}
              });`;
if (content.includes(OLD1)) { content = content.replace(OLD1, NEW1); count++; console.log('✅ Patch 1: query_med_db 上下文'); }
else console.log('❌ Patch 1 未找到');

// ===== Patch 2: skill_dispatch 调用添加 userMemory =====
const OLD2 = `              const toolResult = await toolRegistry.executeTool('skill_dispatch', toolArgs, {
                message, nmpaSearch, detectNmpaProduct, bochaSearch
              });`;
const NEW2 = `              const toolResult = await toolRegistry.executeTool('skill_dispatch', toolArgs, {
                message, nmpaSearch, detectNmpaProduct, bochaSearch,
                userMemory: profiles?.[userCode]?.memory || {}
              });`;
if (content.includes(OLD2)) { content = content.replace(OLD2, NEW2); count++; console.log('✅ Patch 2: skill_dispatch 上下文'); }
else console.log('❌ Patch 2 未找到');

// ===== Patch 3: 通用工具调用添加 userMemory =====
const OLD3 = `              const toolResult = await toolRegistry.executeTool(toolCallName, toolArgs, {
                message, nmpaSearch, detectNmpaProduct, bochaSearch
              });`;
const NEW3 = `              const toolResult = await toolRegistry.executeTool(toolCallName, toolArgs, {
                message, nmpaSearch, detectNmpaProduct, bochaSearch,
                userMemory: profiles?.[userCode]?.memory || {}
              });`;
if (content.includes(OLD3)) { content = content.replace(OLD3, NEW3); count++; console.log('✅ Patch 3: 通用工具上下文'); }
else console.log('❌ Patch 3 未找到');

if (count > 0) {
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`\n✅ 共完成 ${count} 处 patch，文件已保存`);
} else {
  console.log('\n⚠️ 没有任何 patch 被应用');
}
