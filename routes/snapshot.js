'use strict';
/**
 * MedAgent Hub — 会话快照 (Session Snapshot) 模块 v2
 *
 * 功能：
 * 1. 将当前对话的多轮消息 + 上传文件 + Agent 信息打包成"快照"
 * 2. 利用 LLM 从对话中提取关键逻辑，生成 Markdown 格式的 Skill 文件
 * 3. 生成的 Skill 文件保存到 skills/ 目录，由 skill-registry.js 自动热加载
 * 4. 支持预览、下载、加载技能到新对话
 */

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');
const SNAPSHOTS_DIR = path.join(__dirname, '..', 'data', 'snapshots');
if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });

/**
 * 从对话历史中提取关键信息并生成 Skill Markdown
 */
async function createSnapshot(options) {
  const {
    sessionId, messages, agentId, agentName,
    userCode, userName, skillName, aiProvider, db
  } = options;

  if (!messages || messages.length < 4) {
    return { success: false, error: '对话轮次不足（至少需要 2 轮对话）' };
  }

  // 1. 准备对话摘要（截取最近 30 轮，避免 Token 超限）
  const recentMessages = messages.slice(-60);
  const conversationText = recentMessages.map(m => {
    const role = m.role === 'user' ? '用户' : '助手';
    const content = (m.content || '').substring(0, 800);
    return `[${role}]: ${content}`;
  }).join('\n\n');

  // 2. 查询关联的上传文件
  let uploadedFiles = [];
  try {
    uploadedFiles = db.prepare(
      'SELECT original_name, content_type, extracted_content FROM uploaded_files WHERE session_id = ? LIMIT 10'
    ).all(sessionId);
  } catch (e) { /* 表可能不存在 */ }

  const fileContext = uploadedFiles.length > 0
    ? '\n\n关联文件：\n' + uploadedFiles.map(f => `- ${f.original_name}（${f.content_type}）`).join('\n')
    : '';

  // 3. 调用 LLM 提取关键逻辑，输出 SKILL.md 格式
  const extractPrompt = `你是一个 Agent 技能萃取专家。请根据以下对话记录，提取其中的核心业务逻辑，生成一份符合 SKILL.md 规范的可复用技能文档。

输出必须严格按以下结构：

## Goal
用 1-2 句话概括这个技能的核心目标和价值。

## 触发场景
列出此技能应该在什么情况下被触发使用，包括关键词和场景描述。

## Steps
分步骤写出执行流程，每个步骤要具体可执行。

## 话术模板
提取对话中的可复用话术，保留原始表述，用 {{变量}} 标记可替换部分。每条话术用引用块 > 包裹。

## 判断标准
提取关键的判断标准和决策逻辑，用表格或列表呈现。

## 注意事项
列出使用此技能时的注意事项和常见错误。

## Output
描述期望的输出格式和内容。

创作原则：
1. 简洁优先，控制在 500 行以内
2. 第三人称描述，如"处理客户咨询"而非"我可以帮你"
3. 步骤要具体可执行，避免模糊指令
4. 话术模板保留原始表述，用 {{变量}} 标记可替换部分
5. 只用 ## 作为章节标题，不用 ### 或更深层级
6. 不使用代码块、emoji、装饰符号

对话记录：
${conversationText}
${fileContext}

请直接输出 Markdown 内容，不要包含代码块标记。`;

  let extractedContent;
  try {
    const result = await aiProvider.chat(extractPrompt, [
      { role: 'user', content: '请开始提取。' }
    ]);
    extractedContent = result.message;
  } catch (e) {
    return { success: false, error: 'LLM 提取失败: ' + e.message };
  }

  // 4. 生成 Skill 文件
  const skillId = `custom-${userCode}-${Date.now()}`;
  const safeSkillName = skillName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_\- ]/g, '').substring(0, 50);
  const skillFileName = `${skillId}.md`;
  const now = new Date();

  const skillContent = buildSkillMarkdown({
    skillId, safeSkillName, userName, userCode, agentName, agentId,
    sessionId, messages, uploadedFiles, extractedContent, now
  });

  // 5. 保存 Skill 文件
  const skillPath = path.join(SKILLS_DIR, skillFileName);
  fs.writeFileSync(skillPath, skillContent, 'utf8');

  // 6. 保存快照元数据
  // 从提取内容中解析触发场景和目标
  let metaWhenToUse = '';
  const metaTrigger = extractedContent.match(/##\s*触发场景\s*\n([\s\S]*?)(?=\n##|$)/);
  if (metaTrigger) metaWhenToUse = metaTrigger[1].trim().replace(/\n/g, ' ').substring(0, 200);

  let metaGoal = '';
  const goalMatch = extractedContent.match(/##\s*Goal\s*\n([\s\S]*?)(?=\n##|$)/);
  if (goalMatch) metaGoal = goalMatch[1].trim().replace(/\n/g, ' ').substring(0, 200);

  const snapshotMeta = {
    id: skillId,
    sessionId,
    agentId,
    agentName,
    userCode,
    userName,
    skillName: safeSkillName,
    skillPath: skillFileName,
    messageCount: messages.length,
    fileCount: uploadedFiles.length,
    attachedFiles: uploadedFiles.map(f => ({ name: f.original_name, type: f.content_type })),
    createdAt: now.toISOString(),
    summary: extractedContent.substring(0, 300),
    goal: metaGoal,
    whenToUse: metaWhenToUse,
    categories: ['自定义', agentName, '经验沉淀'],
    skillFormat: 'v2'
  };
  fs.writeFileSync(
    path.join(SNAPSHOTS_DIR, `${skillId}.json`),
    JSON.stringify(snapshotMeta, null, 2),
    'utf8'
  );

  console.log(`[Snapshot] Created skill: ${skillId} (${safeSkillName}) from session ${sessionId}`);

  return {
    success: true,
    skillId,
    skillPath: skillFileName,
    skillName: safeSkillName,
    summary: extractedContent.substring(0, 300) + '...',
    markdown: skillContent
  };
}

/**
 * 构建标准化的 Skill Markdown 文件内容
 */
function buildSkillMarkdown(opts) {
  const {
    skillId, safeSkillName, userName, userCode, agentName, agentId,
    sessionId, messages, uploadedFiles, extractedContent, now
  } = opts;

  // 从提取内容中解析触发场景
  let whenToUse = '';
  const triggerMatch = extractedContent.match(/##\s*触发场景\s*\n([\s\S]*?)(?=\n##|$)/);
  if (triggerMatch) {
    whenToUse = triggerMatch[1].trim().replace(/\n/g, ' ').substring(0, 200);
  }

  return `---
name: ${skillId}
display_name: ${safeSkillName}
description: ${safeSkillName} - 由 ${userName || userCode} 从与「${agentName}」的对话中提炼
when_to_use: ${whenToUse}
categories: [自定义, ${agentName}, 经验沉淀]
usage_count: 0
last_updated: ${now.toISOString().split('T')[0]}
source_agent: ${agentId}
source_session: ${sessionId}
access: free
---

# ${safeSkillName}

> 本技能由「${userName || userCode}」从与「${agentName}」的对话中自动提炼生成。
> 原始对话包含 ${messages.length} 条消息${uploadedFiles.length > 0 ? `，关联 ${uploadedFiles.length} 个参考文件` : ''}。
> 创建时间：${now.toLocaleDateString('zh-CN')}

---

${extractedContent}

---

## 使用说明

本技能文件可通过以下方式使用：

- **在线加载**：在 MedAgent Hub 中点击"加载技能"，选择本文件即可将其注入为对话上下文
- **离线参考**：下载为 Markdown 文件，作为标准化操作手册在团队内部流转
- **二次编辑**：可根据实际业务需求修改话术模板中的 {{变量}} 部分
`;
}

/**
 * 获取用户的所有快照列表
 */
function listSnapshots(userCode) {
  try {
    const files = fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith('.json'));
    const snapshots = [];
    for (const file of files) {
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, file), 'utf8'));
        if (meta.userCode === userCode) {
          snapshots.push(meta);
        }
      } catch (e) { /* skip corrupt files */ }
    }
    return snapshots.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (e) {
    return [];
  }
}

/**
 * 获取单个快照的完整 Markdown 内容（用于预览和下载）
 */
function getSnapshotContent(skillId, userCode) {
  const metaPath = path.join(SNAPSHOTS_DIR, `${skillId}.json`);
  if (!fs.existsSync(metaPath)) return { success: false, error: '快照不存在' };

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (meta.userCode !== userCode) return { success: false, error: '无权访问' };

    const skillPath = path.join(SKILLS_DIR, meta.skillPath);
    if (!fs.existsSync(skillPath)) return { success: false, error: '技能文件已丢失' };

    const markdown = fs.readFileSync(skillPath, 'utf8');

    // 分离 frontmatter 和正文
    let body = markdown;
    let frontmatter = {};
    const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (fmMatch) {
      body = fmMatch[2];
      // 简单解析 frontmatter
      fmMatch[1].split('\n').forEach(line => {
        const idx = line.indexOf(':');
        if (idx > 0) {
          const key = line.substring(0, idx).trim();
          const val = line.substring(idx + 1).trim();
          frontmatter[key] = val;
        }
      });
    }

    return {
      success: true,
      meta,
      markdown: body.trim(),
      frontmatter,
      fileName: `${meta.skillName || skillId}.md`
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 获取技能文件的原始 Markdown（用于加载到对话上下文）
 */
function loadSkillForChat(skillId, userCode) {
  const metaPath = path.join(SNAPSHOTS_DIR, `${skillId}.json`);
  if (!fs.existsSync(metaPath)) return { success: false, error: '技能不存在' };

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (meta.userCode !== userCode) return { success: false, error: '无权访问' };

    const skillPath = path.join(SKILLS_DIR, meta.skillPath);
    if (!fs.existsSync(skillPath)) return { success: false, error: '技能文件已丢失' };

    const markdown = fs.readFileSync(skillPath, 'utf8');

    // 提取正文部分（去掉 frontmatter）
    let body = markdown;
    const fmMatch = markdown.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    if (fmMatch) body = fmMatch[1];

    return {
      success: true,
      skillName: meta.skillName,
      agentName: meta.agentName,
      content: body.trim(),
      attachedFiles: meta.attachedFiles || [],
      sourceAgent: meta.agentId
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 删除快照及对应的 Skill 文件
 */
function deleteSnapshot(skillId, userCode) {
  const metaPath = path.join(SNAPSHOTS_DIR, `${skillId}.json`);
  if (!fs.existsSync(metaPath)) return { success: false, error: '快照不存在' };

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (meta.userCode !== userCode) return { success: false, error: '无权删除' };

    // 删除 Skill 文件
    const skillPath = path.join(SKILLS_DIR, meta.skillPath);
    if (fs.existsSync(skillPath)) fs.unlinkSync(skillPath);

    // 删除快照元数据
    fs.unlinkSync(metaPath);

    console.log(`[Snapshot] Deleted: ${skillId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = { createSnapshot, listSnapshots, getSnapshotContent, loadSkillForChat, deleteSnapshot };
