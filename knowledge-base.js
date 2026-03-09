/**
 * MedAgent Hub - RAG 知识库核心模块
 * 支持 PDF / Word / TXT 文档的解析、分块、向量化与检索
 * 优化：启动时预加载向量到内存，避免每次对话重复读取大文件
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const embeddingAgent = new https.Agent({ keepAlive: true, maxSockets: 3, timeout: 10000 } );
const crypto = require('crypto');

// ===== 配置 =====
const KB_ROOT = path.join(__dirname, 'knowledge');
const GLOBAL_DIR = path.join(KB_ROOT, 'global');
const AGENTS_DIR = path.join(KB_ROOT, 'agents');
const VECTORS_DIR = path.join(KB_ROOT, 'vectors');
const AGENTS_VECTORS_DIR = path.join(VECTORS_DIR, 'agents');
const META_FILE = path.join(KB_ROOT, 'meta.json');

const CHUNK_SIZE = 800;        // 每块字符数
const CHUNK_OVERLAP = 100;     // 块间重叠字符数
const TOP_K = 5;               // 检索返回最相关块数
const EMBED_MODEL = 'BAAI/bge-m3'; // SiliconFlow embedding 模型（多语言）
const EMBED_BATCH = 16;        // 每批向量化数量

// 确保目录存在
[KB_ROOT, GLOBAL_DIR, AGENTS_DIR, VECTORS_DIR, AGENTS_VECTORS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ===== 内存缓存（启动时预加载，避免每次对话重复读取大文件）=====
const vectorCache = new Map(); // scope -> Array of vector entries

function getVectorPath(scope) {
  if (scope === 'global') return path.join(VECTORS_DIR, 'global.json');
  const agentId = scope.replace('agent:', '');
  return path.join(AGENTS_VECTORS_DIR, `${agentId}.json`);
}

function loadVectorIndex(scope) {
  // 优先从内存缓存读取
  if (vectorCache.has(scope)) return vectorCache.get(scope);
  const p = getVectorPath(scope);
  if (!fs.existsSync(p)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    vectorCache.set(scope, data);
    return data;
  } catch { return []; }
}

function saveVectorIndex(scope, index) {
  const p = getVectorPath(scope);
  fs.writeFileSync(p, JSON.stringify(index), 'utf8');
  // 同步更新内存缓存
  vectorCache.set(scope, index);
}

function invalidateCache(scope) {
  vectorCache.delete(scope);
}

// 启动时预加载全局向量索引
function preloadVectors() {
  const globalPath = getVectorPath('global');
  if (fs.existsSync(globalPath)) {
    try {
      const start = Date.now();
      const data = JSON.parse(fs.readFileSync(globalPath, 'utf8'));
      vectorCache.set('global', data);
      console.log(`[KB] ✅ 预加载全局向量索引: ${data.length} 个向量块，耗时 ${Date.now() - start}ms`);
    } catch (e) {
      console.warn('[KB] ⚠️  全局向量索引加载失败:', e.message);
    }
  } else {
    console.log('[KB] ℹ️  暂无全局向量索引');
  }

  // 预加载 agent 专属索引
  if (fs.existsSync(AGENTS_VECTORS_DIR)) {
    fs.readdirSync(AGENTS_VECTORS_DIR).forEach(f => {
      if (f.endsWith('.json')) {
        const agentId = f.replace('.json', '');
        const scope = `agent:${agentId}`;
        try {
          const data = JSON.parse(fs.readFileSync(path.join(AGENTS_VECTORS_DIR, f), 'utf8'));
          vectorCache.set(scope, data);
          console.log(`[KB] ✅ 预加载 Agent(${agentId}) 向量索引: ${data.length} 个向量块`);
        } catch (e) {
          console.warn(`[KB] ⚠️  Agent(${agentId}) 向量索引加载失败:`, e.message);
        }
      }
    });
  }
}

// 立即执行预加载
preloadVectors();

// ===== 元数据管理 =====
function loadMeta() {
  if (!fs.existsSync(META_FILE)) return { files: [] };
  try { return JSON.parse(fs.readFileSync(META_FILE, 'utf8')); }
  catch { return { files: [] }; }
}

function saveMeta(meta) {
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf8');
}

// ===== 文档解析 =====
async function parseDocument(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let text = '';

  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    try {
      const data = await pdfParse(buffer, { max: 0 });
      text = data.text || '';
    } catch (e) {
      console.warn(`[KB] PDF解析警告 ${path.basename(filePath)}: ${e.message}`);
      text = '';
    }
  } else if (ext === '.docx' || ext === '.doc') {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    text = result.value || '';
  } else if (ext === '.txt' || ext === '.md') {
    text = fs.readFileSync(filePath, 'utf8');
  } else {
    throw new Error(`不支持的文件格式: ${ext}`);
  }

  // 清理文本
  text = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{3,}/g, ' ')
    .trim();

  return text;
}

// ===== 文本分块 =====
function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  if (!text || text.length === 0) return chunks;

  const paragraphs = text.split(/\n\n+/);
  let current = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (current.length + trimmed.length + 2 <= chunkSize) {
      current += (current ? '\n\n' : '') + trimmed;
    } else {
      if (current) {
        chunks.push(current);
        const words = current.split(/\s+/);
        const overlapWords = words.slice(-Math.floor(overlap / 5));
        current = overlapWords.join(' ') + '\n\n' + trimmed;
      } else {
        for (let i = 0; i < trimmed.length; i += chunkSize - overlap) {
          chunks.push(trimmed.slice(i, i + chunkSize));
        }
        current = '';
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.filter(c => c.length >= 50);
}

// ===== 向量化（SiliconFlow Embedding API）=====
async function embedTexts(texts, apiKey) {
  if (!apiKey) throw new Error('缺少 SILICONFLOW_API_KEY');
  if (!texts || texts.length === 0) return [];

  const allVectors = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const vectors = await embedBatch(batch, apiKey);
    allVectors.push(...vectors);
    if (i + EMBED_BATCH < texts.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return allVectors;
}

function embedBatch(texts, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: EMBED_MODEL,
      input: texts,
      encoding_format: 'float'
    });

    const options = {
      hostname: 'api.siliconflow.cn',
      path: '/v1/embeddings',
      method: 'POST',
      agent: embeddingAgent,
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
          if (parsed.error) return reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
          const vectors = parsed.data.map(item => item.embedding);
          resolve(vectors);
        } catch (e) {
          reject(new Error(`向量化响应解析失败: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('向量化请求超时')); });
    req.write(body);
    req.end();
  });
}

// ===== 余弦相似度 =====
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ===== 添加文档到知识库 =====
async function addDocument(filePath, scope, apiKey, onProgress) {
  const fileName = path.basename(filePath);
  const fileId = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(filePath).toLowerCase();

  onProgress && onProgress({ step: 'parse', file: fileName, progress: 0 });

  let text;
  try {
    text = await parseDocument(filePath);
  } catch (e) {
    throw new Error(`文档解析失败: ${e.message}`);
  }

  if (!text || text.length < 50) {
    throw new Error('文档内容为空或太短，可能是扫描版PDF（无文字层）');
  }

  onProgress && onProgress({ step: 'chunk', file: fileName, progress: 20, textLen: text.length });

  const chunks = chunkText(text);
  if (chunks.length === 0) throw new Error('文档分块失败，无有效内容');

  onProgress && onProgress({ step: 'embed', file: fileName, progress: 30, chunks: chunks.length });

  const allVectors = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const vectors = await embedBatch(batch, apiKey);
    allVectors.push(...vectors);
    const pct = 30 + Math.floor(((i + batch.length) / chunks.length) * 60);
    onProgress && onProgress({ step: 'embed', file: fileName, progress: pct, done: i + batch.length, total: chunks.length });
    if (i + EMBED_BATCH < chunks.length) await new Promise(r => setTimeout(r, 200));
  }

  // 追加到现有索引（从缓存读取，避免重新读文件）
  const index = loadVectorIndex(scope);
  const newEntries = chunks.map((chunk, i) => ({
    id: `${fileId}_${i}`,
    fileId,
    fileName,
    scope,
    text: chunk,
    vector: allVectors[i]
  }));
  index.push(...newEntries);
  saveVectorIndex(scope, index); // 同时更新缓存

  const meta = loadMeta();
  const stat = fs.statSync(filePath);
  meta.files.push({
    id: fileId,
    name: fileName,
    scope,
    size: stat.size,
    chunks: chunks.length,
    textLen: text.length,
    addedAt: new Date().toISOString()
  });
  saveMeta(meta);

  onProgress && onProgress({ step: 'done', file: fileName, progress: 100, chunks: chunks.length });

  return { fileId, fileName, scope, chunks: chunks.length };
}

// ===== 删除文档 =====
function removeDocument(fileId) {
  const meta = loadMeta();
  const fileInfo = meta.files.find(f => f.id === fileId);
  if (!fileInfo) throw new Error('文档不存在');

  const scope = fileInfo.scope;
  const index = loadVectorIndex(scope);
  const newIndex = index.filter(entry => entry.fileId !== fileId);
  saveVectorIndex(scope, newIndex); // 同时更新缓存

  meta.files = meta.files.filter(f => f.id !== fileId);
  saveMeta(meta);

  return fileInfo;
}

// ===== RAG 检索（全内存操作，无磁盘 IO）=====
async function retrieve(query, agentId, apiKey, topK = TOP_K) {
  if (!apiKey) return [];

  // 对 query 向量化（唯一的网络请求）
  let queryVector;
  try {
    let vectors;
    try {
      vectors = await embedBatch([query], apiKey);
    } catch (firstErr) {
      console.warn('[KB] 向量化首次失败，500ms后重试:', firstErr.message);
      await new Promise(r => setTimeout(r, 500));
      vectors = await embedBatch([query], apiKey);
    }
    queryVector = vectors[0];
  } catch (e) {
    console.warn('[KB] 查询向量化失败:', e.message);
    return [];
  }

  // 从内存缓存读取（无磁盘 IO）
  const globalIndex = loadVectorIndex('global');
  const agentIndex = agentId ? loadVectorIndex(`agent:${agentId}`) : [];
  const combined = [...globalIndex, ...agentIndex];

  if (combined.length === 0) return [];

  // 计算相似度并排序
  const scored = combined.map(entry => ({
    ...entry,
    score: cosineSimilarity(queryVector, entry.vector)
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map(({ vector, ...rest }) => rest);
}

// ===== 格式化知识库上下文（注入 System Prompt）=====
function formatKnowledgeContext(chunks) {
  if (!chunks || chunks.length === 0) return '';

  const lines = ['--- 知识库参考资料（请优先基于以下内容回答）---'];
  chunks.forEach((chunk, i) => {
    lines.push(`\n[${i + 1}] 来源：${chunk.fileName}`);
    lines.push(chunk.text);
  });
  lines.push('\n--- 知识库参考资料结束 ---');
  return lines.join('\n');
}

// ===== 获取知识库统计 =====
function getStats() {
  const meta = loadMeta();
  const globalIndex = loadVectorIndex('global');

  const agentStats = {};
  if (fs.existsSync(AGENTS_VECTORS_DIR)) {
    fs.readdirSync(AGENTS_VECTORS_DIR).forEach(f => {
      if (f.endsWith('.json')) {
        const agentId = f.replace('.json', '');
        const idx = loadVectorIndex(`agent:${agentId}`);
        agentStats[agentId] = idx.length;
      }
    });
  }

  return {
    totalFiles: meta.files.length,
    globalChunks: globalIndex.length,
    agentStats,
    files: meta.files
  };
}

module.exports = {
  addDocument,
  removeDocument,
  retrieve,
  formatKnowledgeContext,
  getStats,
  loadMeta,
  parseDocument,
  chunkText,
  loadVectorIndex,
  GLOBAL_DIR,
  AGENTS_DIR,
  KB_ROOT
};
