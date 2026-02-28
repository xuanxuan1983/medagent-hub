# MedAgent Hub 技术文档

**版本**: 2.0
**最后更新**: 2026-02-28

---

## 1. 项目概述

MedAgent Hub 是一个专为医美行业设计的 AI 助手平台。它集成了多个针对不同业务场景（如市场营销、客户咨询、产品策略等）的专业 AI Agent，旨在为医美行业的上游厂商和下游机构提供全链路的智能支持。

### 1.1. 核心功能

- **多 Agent 聊天界面**: 用户可以在一个统一的界面中与 21 个不同角色的专业 AI Agent 进行对话。
- **聊天历史记录**: 用户的所有对话都会被持久化存储，可以随时回顾。
- **邀请码系统**: 通过邀请码机制管理用户注册和访问权限，支持限制每个邀请码的使用次数。
- **订阅与支付**: 集成微信支付 Native Pay，实现用户按套餐（如专业版、全能版）付费订阅，并通过回调自动激活订阅。
- **管理后台**: 为管理员提供一个数据看板，用于监控核心指标、管理邀请码、查看用户对话、手动激活订阅以及导出数据。
- **动态 AI Provider**: 支持通过环境变量在多个大语言模型提供商（如 SiliconFlow, Gemini, Kimi 等）之间灵活切换，并允许用户在前端临时覆盖使用自己的 API Key。

### 1.2. 技术栈

| 分类 | 技术 | 用途 |
|---|---|---|
| **后端** | 原生 Node.js | 构建 HTTP 服务器，处理所有业务逻辑 |
| **前端** | 原生 HTML, CSS, JavaScript | 构建用户界面和交互逻辑 |
| **数据库** | SQLite (via `better-sqlite3`) | 持久化存储聊天会话和消息 |
| **数据格式** | JSON | 用于配置文件和部分旧数据的存储 |
| **进程管理** | PM2 | 在服务器上管理和守护 Node.js 进程 |
| **支付集成** | `wechatpay-node-v3` | 与微信支付 v3 API 对接 |
| **Excel 导出** | `exceljs` | 将对话记录和用户数据导出为 Excel 文件 |
| **Markdown 渲染** | `marked.js` | 在前端渲染 AI 返回的 Markdown 格式回复 |

---

## 2. 系统架构

项目采用简单的客户端-服务器（Client-Server）架构。

- **客户端 (Frontend)**: 一系列静态的 HTML, CSS, 和 JavaScript 文件，负责用户界面的展示和交互。所有页面（如首页、登录页、聊天页、管理后台）都是独立的 HTML 文件。
- **服务器 (Backend)**: 一个单一的 Node.js 文件 `api-server.js`，它构建了一个原生的 HTTP 服务器，处理所有业务逻辑，包括：
  - API 请求路由
  - 用户认证与授权
  - 与 AI Provider 的交互
  - 微信支付订单的创建与回调处理
  - SQLite 数据库的读写操作

这种架构的优点是简单、轻量、易于部署，非常适合中小型应用或快速原型开发。所有核心逻辑都集中在后端，前端只负责展示。

---

## 3. 数据库设计

项目从 v2.0 开始引入 SQLite 作为主数据库，用于持久化存储核心业务数据，替代了之前纯 JSON 文件的方案。

- **数据库文件**: `medagent.db`
- **驱动**: `better-sqlite3`

### 3.1. 表结构

#### `chat_sessions` - 聊天会话表

存储每个聊天会话的元信息。

| 字段名 | 类型 | 描述 |
|---|---|---|
| `id` | TEXT | 会话唯一 ID (主键) |
| `user_code` | TEXT | 用户邀请码，用于关联用户 |
| `user_name` | TEXT | 用户名 |
| `agent_id` | TEXT | 使用的 Agent ID |
| `agent_name` | TEXT | 使用的 Agent 中文名 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 最后更新时间 |

#### `chat_messages` - 聊天消息表

存储每一条具体的聊天消息。

| 字段名 | 类型 | 描述 |
|---|---|---|
| `id` | INTEGER | 消息唯一 ID (主键, 自增) |
| `session_id` | TEXT | 所属会话 ID (外键, 关联 `chat_sessions.id`) |
| `role` | TEXT | 角色 ('user' 或 'assistant') |
| `content` | TEXT | 消息内容 |
| `created_at` | TEXT | 创建时间 |

### 3.2. 数据兼容性

为了保证数据分析的连续性，系统在将对话记录写入 SQLite 的同时，仍然会以 JSONL 格式向 `conversations.jsonl` 文件中追加一份日志。这种双写策略确保了历史数据的完整性，并为未来的数据迁移或分析提供了灵活性。

---

## 4. 后端详解 (`api-server.js`)

`api-server.js` 是整个项目的核心，包含了所有的后端逻辑。

### 4.1. 认证机制

认证基于 Cookie 实现。

1.  用户在登录页面输入邀请码。
2.  服务器验证邀请码的有效性和使用次数。
3.  验证通过后，服务器在响应头中设置一个 `HttpOnly` 的 Cookie `medagent_auth`，其值为用户的邀请码。
4.  后续所有需要认证的 API 请求，服务器都会检查这个 Cookie 来识别用户身份。我们通过 `getUserCode(req)` 辅助函数来获取当前用户的邀请码。
5.  管理员身份通过比对 Cookie 中的邀请码是否等于环境变量 `ADMIN_CODE` 来确定。

### 4.2. AI Provider 集成

系统设计了一个工厂模式（Factory Pattern）来动态创建 AI Provider 实例。这使得在不同的 AI 模型之间切换变得非常容易。

- **默认 Provider**: 通过 `.env` 文件中的 `AI_PROVIDER` 环境变量设置，作为全局默认的 AI 服务。
- **用户自定义 Provider**: 用户可以在前端的“设置”中临时提供自己的 API Key 和模型，这些信息会随聊天请求发送到后端。后端会使用 `createProviderFromConfig` 函数动态创建一个临时的 Provider 实例，仅用于当次请求。
- **支持的 Provider**: 目前已内置支持 SiliconFlow, Gemini, Kimi, DeepSeek, Anthropic 以及所有兼容 OpenAI API 格式的服务。

### 4.3. API 端点

| 路径 | 方法 | 描述 | 认证 |
|---|---|---|---|
| `/health` | GET | 健康检查，返回服务器状态和 AI Provider。 | 否 |
| `/api/auth/login` | POST | 用户登录。 | 否 |
| `/api/auth/status` | GET | 检查用户登录状态。 | 否 |
| `/api/chat/init` | POST | 初始化一个新的聊天会话。 | 是 |
| `/api/chat/message` | POST | 发送聊天消息。 | 是 |
| `/api/chat/sessions` | GET | 获取当前用户的历史会话列表。 | 是 |
| `/api/chat/session-messages` | GET | 获取指定会话的所有消息。 | 是 |
| `/api/payment/create-native` | POST | 创建微信支付订单。 | 是 |
| `/api/payment/notify` | POST | 接收微信支付回调。 | 否 |
| `/api/admin/users` | GET | 获取所有用户列表和使用情况。 | 管理员 |
| `/api/admin/codes` | POST | 创建新的邀请码。 | 管理员 |
| `/api/admin/export` | GET | 导出对话记录为 Excel 文件。 | 管理员 |

---

## 5. 前端详解

前端由一系列独立的 HTML 文件构成，使用原生 JavaScript 与后端 API 进行交互。

### 5.1. 核心页面逻辑

- **`chat.html`**: 
  - **视图管理**: 通过 `switchView()` 函数在“工作台”、“Agent 商店”和“聊天”三个视图之间切换。
  - **会话初始化**: 调用 `/api/chat/init` 获取 `sessionId`，并启用聊天输入框。
  - **消息发送**: 调用 `/api/chat/message` 发送用户消息并接收 AI 回复。
  - **历史记录**: 
    - 点击“历史”按钮调用 `showHistory()`，通过 `/api/chat/sessions` 获取会话列表并渲染到弹窗中。
    - 点击列表中的某一项，调用 `loadHistorySession()`，通过 `/api/chat/session-messages` 获取该会话的完整消息并展示。
  - **引导问题**: 通过 `loadGuidedQuestions()` 从 Agent 的 skill 文件中解析并显示引导问题。

### 5.2. P0 级 Bug 修复记录

- **对话记录缺失 Agent 名称**: 
  - **问题**: `conversations.jsonl` 和 Excel 导出中只有 `agentId`，没有 `agentName`。
  - **修复**: 在 `/api/chat/message` 中，将 `session.agentName` 加入到 `logEntry` 中。同时，在 Excel 导出逻辑中，增加“Agent 名称”列，并通过 `agentId` 从 `agentNames` 映射表中反查。

- **支付弹窗标题显示异常**: 
  - **问题**: 弹窗标题显示为 `${plan.name} · ¥${(plan.price/100).toFixed(0)}/月` 而不是解析后的内容。
  - **修复**: 经排查为浏览器缓存问题。通过强制刷新浏览器 (`Ctrl+F5` 或 `Cmd+Shift+R`) 解决了问题。

---

## 6. 部署与环境

### 6.1. 依赖安装

项目依赖在 `package.json` 中定义，通过 `npm install` 安装。

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.74.0",
    "better-sqlite3": "^12.6.2",
    "exceljs": "^4.4.0",
    "wechatpay-node-v3": "^2.2.1"
  }
}
```

### 6.2. 环境变量 (`.env`)

项目通过一个 `.env` 文件管理所有敏感信息和配置。新增了 `SILICONFLOW_MODEL` 和 `DEEPSEEK_API_KEY` 等环境变量。

### 6.3. 运行服务器

项目使用 PM2 进行进程管理。

- **启动**: `env $(cat .env | xargs) pm2 start api-server.js --name medagent-hub`
- **重启**: `pm2 restart medagent-hub`
- **日志**: `pm2 logs medagent-hub`

### 6.4. Git 忽略项 (`.gitignore`)

为了防止敏感文件和数据库文件被提交到版本库，`.gitignore` 中新增了以下规则：

```
wechat_cert/
*.db
*.db-wal
*.db-shm
user-profiles.json
```

---

## 7. Agent (Skills) 系统

Agent 的能力和行为由位于 `/skills` 目录下的 Markdown 文件定义。每个文件包含 YAML Front Matter 和一系列 Prompt 指令，用于塑造 Agent 的角色、技能和行为。具体结构请参考源文件。


### 7.1. Agent 列表

系统共包含 21 个专业 AI Agent，覆盖医美行业的全链路场景。

| Agent ID | 中文名称 | Skill 文件 |
|---|---|---|
| `gtm-strategy` | GTM战略大师 | `gtm-strategist.md` |
| `product-expert` | 产品材料专家 | `product-strategist.md` |
| `academic-liaison` | 学术推广专家 | `medical-liaison.md` |
| `marketing-director` | 市场创意总监 | `marketing-director.md` |
| `sales-director` | 销售作战总监 | `sales-director.md` |
| `operations-director` | 运营效能总监 | `sfe-director.md` |
| `training-director` | 培训赋能总监 | `medaesthetic-hub.md` |
| `aesthetic-design` | 高定美学设计总监 | `aesthetic-designer.md` |
| `senior-consultant` | 金牌医美咨询师 | `senior-consultant.md` |
| `sparring-robot` | 医美实战陪练机器人 | `sparring-partner.md` |
| `post-op-guardian` | 医美术后私域管家 | `postop-specialist.md` |
| `trend-setter` | 医美爆款种草官 | `new-media-director.md` |
| `anatomy-architect` | 医美解剖决策建筑师 | `medaesthetic-hub.md` |
| `materials-mentor` | 医美材料学硬核导师 | `product-strategist.md` |
| `visual-translator` | 医美视觉通译官 | `creative-director.md` |
| `material-architect` | 医美材料学架构师 | `material-architect.md` |
| `area-manager` | 大区经理 | `area-manager.md` |
| `channel-manager` | 商务经理 | `channel-manager.md` |
| `finance-bp` | 财务BP | `finance-bp.md` |
| `hrbp` | 战略HRBP | `hrbp.md` |
| `procurement-manager` | 采购经理 | `procurement-manager.md` |

---

## 8. 项目文件结构

```
medagent-hub/
├── api-server.js           # 后端核心：HTTP 服务器 + 所有 API 路由
├── package.json            # Node.js 依赖配置
├── .env                    # 环境变量（敏感，不入库）
├── .gitignore              # Git 忽略规则
├── start.sh                # 服务启动脚本
├── deploy-cn.sh            # 国内部署脚本
│
├── chat.html               # 核心聊天应用界面
├── index.html              # 营销首页
├── login.html              # 登录页
├── admin.html              # 管理后台
├── pricing.html            # 定价页
├── landing.html            # 落地页
├── corpus.html             # 语料库页面
│
├── skills/                 # Agent Prompt 文件目录
│   ├── senior-consultant.md
│   ├── sparring-partner.md
│   └── ... (共 21+ 个 .md 文件)
│
├── assistants/             # Agent 配置 JSON 文件
│   ├── index.json
│   └── ... (每个 Agent 一个 .json)
│
├── wechat_cert/            # 微信支付证书（敏感，不入库）
│   ├── apiclient_cert.pem
│   ├── apiclient_key.pem
│   └── apiclient_cert.p12
│
├── analysis/               # 数据分析报告和脚本
│   ├── conversation_analysis.py
│   ├── impact_analysis.py
│   └── ... (报告和图表)
│
├── meiling-main.png        # 吉祥物图片
├── meiling-sitting.png
├── meiling-wave.png
│
├── medagent.db             # SQLite 数据库（运行时生成，不入库）
├── conversations.jsonl     # 对话日志（不入库）
├── invite-codes.json       # 邀请码数据（不入库）
└── user-profiles.json      # 用户资料（不入库）
```

---

## 9. 变更日志

### v2.0 (2026-02-28)

**新增功能**:
- 引入 SQLite 数据库 (`better-sqlite3`)，实现聊天历史记录的持久化存储。
- 新增 `/api/chat/sessions` API，支持获取用户的历史会话列表。
- 新增 `/api/chat/session-messages` API，支持获取指定会话的完整消息。
- 前端新增"历史记录"面板，用户可以回顾过去的对话。
- 新增 `getUserCode()` 辅助函数，用于获取当前用户的邀请码标识。
- `.gitignore` 新增 `wechat_cert/`、`*.db`、`user-profiles.json` 等规则。

**Bug 修复**:
- **[P0]** 修复对话记录中缺失 Agent 名称的问题，`conversations.jsonl` 和 Excel 导出现在都包含 `agent_name` 字段。
- **[P0]** 修复支付弹窗标题模板字符串未正确解析的问题（`\\$` 转义符错误）。
- 修复 Excel 导出时字段名不一致的问题（`entry.agentId` → `entry.agent`）。

### v1.0 (初始版本)

- 项目初始发布，包含多 Agent 聊天、邀请码系统、微信支付、管理后台等核心功能。
