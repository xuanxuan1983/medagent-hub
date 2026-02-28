# 免费方案调研笔记

## 一、纯免费向量数据库（自部署/本地）

### 1. ChromaDB（完全免费开源）
- 开源协议：Apache 2.0
- 本地运行，零成本
- pip install chromadb 即可
- 适合：小规模 RAG，原型开发
- 限制：性能有限，不适合大规模

### 2. Qdrant（开源版免费）
- 开源协议：Apache 2.0
- 本地 Docker 部署，零成本
- Rust 编写，性能好
- Qdrant Cloud 免费层：1GB 存储

### 3. FAISS（Meta 开源）
- 完全免费
- 纯向量检索库，非数据库
- 需自行管理持久化

### 4. pgvector（PostgreSQL 扩展）
- 完全免费
- 复用已有 PostgreSQL
- Supabase 免费版：500MB 数据库，含 pgvector

## 二、云端免费额度

### Zilliz Cloud（Milvus 商业版）
- Free 集群：5GB 存储（约100万个768维向量）
- 每月 250 万免费 vCU 额度
- 无需信用卡

### Supabase（pgvector）
- 免费版：500MB PostgreSQL 数据库
- 含 pgvector 扩展
- 50,000 月活用户
- 1GB 文件存储

## 三、一站式 RAG 平台（含知识库）

### Coze 扣子
- 个人免费版：知识库 1GB
- 每天 500 资源点免费
- 内置向量检索

### Dify（社区版）
- 完全开源免费，自部署
- 知识库容量 5GB（云版）
- 私有部署无限制
- 内置 FAISS 向量检索

### FastGPT
- 开源免费，自部署
- 知识库容量仅受硬件限制
- 支持多种向量模型

### RAGFlow
- 开源免费
- 专注 RAG 质量
- 深度文档解析
