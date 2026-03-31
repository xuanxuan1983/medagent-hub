/**
 * MedAgent Hub — 向量记忆系统 (Vector Memory)
 * 
 * 功能：
 * 1. 对话摘要存储：每轮对话结束后，将对话摘要 + 向量存入 SQLite
 * 2. 语义检索：每次对话前，检索最相关的历史对话（余弦相似度）
 * 3. 记忆注入：将检索到的相关历史注入 system prompt，让 AI "记住"用户
 * 
 * 存储结构（SQLite）：
 *   vector_memories (
 *     id INTEGER PRIMARY KEY,
 *     user_code TEXT,           -- 用户标识
 *     agent_id TEXT,            -- Agent ID
 *     summary TEXT,             -- 对话摘要（用于展示）
 *     user_msg TEXT,            -- 用户原始消息（前200字）
 *     assistant_msg TEXT,       -- AI 回复摘要（前300字）
 *     vector TEXT,              -- JSON 序列化的向量
 *     created_at INTEGER        -- 时间戳
 *   )
 */
'use strict';

const https = require('https');

const EMBED_MODEL = 'BAAI/bge-m3';
const TOP_K = 3;          // 每次检索返回最相关的 3 条
const MIN_SCORE = 0.65;   // 最低相似度阈值
const MAX_MEMORIES = 200; // 每个用户最多保存 200 条记忆

// ===== 余弦相似度 =====
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ===== 获取文本向量（SiliconFlow Embedding API）=====
async function getEmbedding(text, apiKey) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: EMBED_MODEL,
      input: [text.slice(0, 512)], // 限制长度
      encoding_format: 'float'
    });

    const options = {
      hostname: 'api.siliconflow.cn',
      path: '/v1/embeddings',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.data?.[0]?.embedding || null);
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.setTimeout(6000, () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

// ===== 初始化数据库表 =====
function initDB(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vector_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_code TEXT NOT NULL,
      agent_id TEXT NOT NULL DEFAULT 'default',
      summary TEXT,
      user_msg TEXT,
      assistant_msg TEXT,
      vector TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_vm_user ON vector_memories(user_code, agent_id);
  `);
}

// ===== 保存对话记忆（异步，不阻塞主流程）=====
async function saveMemory(db, userCode, agentId, userMsg, assistantMsg, apiKey) {
  if (!db || !userCode || !userMsg || !assistantMsg) return;
  try {
    // 生成摘要文本（用于向量化）
    const summaryText = `用户：${userMsg.slice(0, 150)}\nAI：${assistantMsg.slice(0, 200)}`;
    
    // 获取向量
    const vector = await getEmbedding(summaryText, apiKey);
    
    // 存入数据库
    const stmt = db.prepare(`
      INSERT INTO vector_memories (user_code, agent_id, summary, user_msg, assistant_msg, vector)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      userCode,
      agentId || 'default',
      summaryText.slice(0, 400),
      userMsg.slice(0, 200),
      assistantMsg.slice(0, 300),
      vector ? JSON.stringify(vector) : null
    );

    // 超出上限时删除最旧的记录
    const countStmt = db.prepare('SELECT COUNT(*) as cnt FROM vector_memories WHERE user_code = ?');
    const { cnt } = countStmt.get(userCode);
    if (cnt > MAX_MEMORIES) {
      db.prepare(`
        DELETE FROM vector_memories WHERE user_code = ? AND id IN (
          SELECT id FROM vector_memories WHERE user_code = ? ORDER BY created_at ASC LIMIT ?
        )
      `).run(userCode, userCode, cnt - MAX_MEMORIES);
    }
  } catch (e) {
    console.error('[VectorMemory] 保存记忆失败:', e.message);
  }
}

// ===== 检索相关历史记忆 =====
async function retrieveMemories(db, userCode, agentId, currentQuery, apiKey) {
  if (!db || !userCode || !currentQuery) return [];
  try {
    // 获取当前查询的向量
    const queryVector = await getEmbedding(currentQuery.slice(0, 512), apiKey);
    if (!queryVector) return [];

    // 从数据库加载该用户的记忆（最近 100 条，避免全表扫描）
    const rows = db.prepare(`
      SELECT id, summary, user_msg, assistant_msg, vector, created_at
      FROM vector_memories
      WHERE user_code = ? AND agent_id = ? AND vector IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 100
    `).all(userCode, agentId || 'default');

    if (rows.length === 0) return [];

    // 计算余弦相似度并排序
    const scored = rows.map(row => {
      try {
        const vec = JSON.parse(row.vector);
        const score = cosineSimilarity(queryVector, vec);
        return { ...row, score };
      } catch (e) {
        return { ...row, score: 0 };
      }
    });

    // 过滤低相似度，取 TOP_K
    return scored
      .filter(r => r.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K)
      .map(r => ({
        userMsg: r.user_msg,
        assistantMsg: r.assistant_msg,
        score: Math.round(r.score * 100) / 100,
        createdAt: r.created_at
      }));
  } catch (e) {
    console.error('[VectorMemory] 检索记忆失败:', e.message);
    return [];
  }
}

// ===== 将检索到的记忆格式化为 system prompt 片段 =====
function formatMemoriesForPrompt(memories) {
  if (!memories || memories.length === 0) return '';
  const lines = memories.map((m, i) => {
    const date = m.createdAt ? new Date(m.createdAt * 1000).toLocaleDateString('zh-CN') : '历史';
    return `[${i + 1}] (${date}) 用户曾问：${m.userMsg} → AI回答要点：${m.assistantMsg.slice(0, 100)}`;
  });
  return `\n\n【相关历史记忆（语义检索）】\n${lines.join('\n')}\n请参考以上历史记忆，保持与用户的对话连贯性。`;
}

// ===== 获取用户记忆统计（用于管理页面）=====
function getMemoryStats(db, userCode) {
  if (!db || !userCode) return { total: 0, withVector: 0 };
  try {
    const total = db.prepare('SELECT COUNT(*) as cnt FROM vector_memories WHERE user_code = ?').get(userCode)?.cnt || 0;
    const withVector = db.prepare('SELECT COUNT(*) as cnt FROM vector_memories WHERE user_code = ? AND vector IS NOT NULL').get(userCode)?.cnt || 0;
    return { total, withVector };
  } catch (e) {
    return { total: 0, withVector: 0 };
  }
}

// ===== 清除用户记忆 =====
function clearMemories(db, userCode, agentId) {
  if (!db || !userCode) return;
  try {
    if (agentId) {
      db.prepare('DELETE FROM vector_memories WHERE user_code = ? AND agent_id = ?').run(userCode, agentId);
    } else {
      db.prepare('DELETE FROM vector_memories WHERE user_code = ?').run(userCode);
    }
  } catch (e) {
    console.error('[VectorMemory] 清除记忆失败:', e.message);
  }
}

module.exports = {
  initDB,
  saveMemory,
  retrieveMemories,
  formatMemoriesForPrompt,
  getMemoryStats,
  clearMemories
};
