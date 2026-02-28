# MedAgent Hub 技术文档

**版本**: 1.0
**最后更新**: 2026-02-28

---

## 1. 项目概述

MedAgent Hub 是一个专为医美行业设计的 AI 助手平台。它集成了多个针对不同业务场景（如市场营销、客户咨询、产品策略等）的专业 AI Agent，旨在为医美行业的上游厂商和下游机构提供全链路的智能支持。

### 1.1. 核心功能

- **多 Agent 聊天界面**: 用户可以在一个统一的界面中与 21 个不同角色的专业 AI Agent 进行对话。
- **邀请码系统**: 通过邀请码机制管理用户注册和访问权限，支持限制每个邀请码的使用次数。
- **订阅与支付**: 集成微信支付 Native Pay，实现用户按套餐（如专业版、全能版）付费订阅，并通过回调自动激活订阅。
- **管理后台**: 为管理员提供一个数据看板，用于监控核心指标、管理邀请码、查看用户对话、手动激活订阅以及导出数据。
- **动态 AI Provider**: 支持通过环境变量在多个大语言模型提供商（如 SiliconFlow, Gemini, Kimi 等）之间灵活切换。

### 1.2. 技术栈

- **后端**: 原生 Node.js (Vanilla Node.js)，不依赖任何外部 Web 框架（如 Express）。
- **前端**: 原生 HTML, CSS, 和 JavaScript，使用 `marked.js` 库渲染 Markdown 格式的对话内容。
- **数据存储**: 使用本地 JSON 文件作为轻量级数据库，进行数据持久化。
- **进程管理**: 使用 PM2 在服务器上管理和守护 Node.js 进程。
- **支付集成**: 使用原生 Node.js `https` 和 `crypto` 模块与微信支付 v3 API 对接，不依赖第三方 SDK。

---

## 2. 系统架构

项目采用简单的客户端-服务器（Client-Server）架构。

- **客户端 (Frontend)**: 一系列静态的 HTML, CSS, 和 JavaScript 文件，负责用户界面的展示和交互。所有页面（如首页、登录页、聊天页、管理后台）都是独立的 HTML 文件。
- **服务器 (Backend)**: 一个单一的 Node.js 文件 `api-server.js`，它构建了一个原生的 HTTP 服务器，处理所有业务逻辑，包括：
  - API 请求路由
  - 用户认证与授权
  - 与 AI Provider 的交互
  - 微信支付订单的创建与回调处理
  - 本地 JSON 数据的读写操作

这种架构的优点是简单、轻量、易于部署，非常适合中小型应用或快速原型开发。所有核心逻辑都集中在后端，前端只负责展示。

---

## 3. 后端详解 (`api-server.js`)

`api-server.js` 是整个项目的核心，包含了所有的后端逻辑。

### 3.1. 核心模块

- `http`: 用于创建和管理 HTTP 服务器。
- `fs`: 用于同步读写本地 JSON 文件（作为数据库）。
- `https`: 用于向微信支付等第三方 API 发送安全的 HTTPS 请求。
- `crypto`: 用于生成微信支付 API v3 签名和解密回调通知。
- `url`: 用于解析请求的 URL 和查询参数。

### 3.2. 数据持久化

项目使用多个 JSON 文件来存储数据，模拟数据库的行为。所有数据文件都存储在项目根目录。

| 文件名 | 用途 |
| --- | --- |
| `invite-codes.json` | 存储所有邀请码及其使用次数、上限和等级。 |
| `user-profiles.json` | 存储用户的个人资料，如手机号、登录时间等。 |
| `user-subscriptions.json` | 存储用户的订阅信息，包括套餐类型和到期时间。 |
| `conversations/` | 每个用户的对话历史都以 `[invite_code].jsonl` 的格式存储在此目录下。 |
| `orders.json` | 存储所有微信支付订单的状态和详情。 |

### 3.3. 认证机制

认证基于 Cookie 实现。

1.  用户在登录页面输入邀请码。
2.  服务器验证邀请码的有效性和使用次数。
3.  验证通过后，服务器在响应头中设置一个 `HttpOnly` 的 Cookie `medagent_auth`，其值为用户的邀请码。
4.  后续所有需要认证的 API 请求，服务器都会检查这个 Cookie 来识别用户身份。
5.  管理员身份通过比对 Cookie 中的邀请码是否等于环境变量 `ADMIN_CODE` 来确定。

### 3.4. AI Provider 集成

系统设计了一个工厂模式（Factory Pattern）来动态创建 AI Provider 实例。这使得在不同的 AI 模型之间切换变得非常容易，只需修改 `.env` 文件中的 `AI_PROVIDER` 环境变量即可。

- **Provider 基类**: 定义了所有 Provider 都必须实现的通用接口（如 `chat` 方法）。
- **具体 Provider 实现**: 为每个 AI 服务（如 SiliconFlow, Gemini）创建一个类，实现与该服务 API 的对接逻辑。
- **工厂函数**: 根据 `AI_PROVIDER` 的值，实例化并返回对应的 Provider 对象。

### 3.5. 微信支付集成

微信支付功能完全使用 Node.js 原生模块实现，以避免第三方 SDK 的潜在问题（如网络依赖、不兼容等）。

- **创建订单 (`/api/payment/create-native`)**: 
  1. 生成唯一的商户订单号。
  2. 构建符合微信支付 API v3 规范的请求体（JSON）。
  3. 使用 `crypto` 模块和商户私钥 (`apiclient_key.pem`) 生成 `Authorization` 请求头所需的签名。
  4. 使用 `https` 模块向微信的 `v3/pay/transactions/native` 接口发送 POST 请求。
  5. 返回从微信获取的 `code_url`，前端使用此 URL 生成支付二维码。

- **支付回调 (`/api/payment/notify`)**:
  1. 接收微信支付服务器发送的 POST 请求。
  2. 使用商户私钥和证书序列号验证请求头的签名，确保请求来自微信。
  3. 使用 API v3 密钥解密请求体中的加密信息，获取真实的订单状态。
  4. 如果支付成功，更新 `user-subscriptions.json` 文件，为用户激活相应的订阅套餐。
  5. 向微信服务器返回成功或失败的响应。

### 3.6. API 端点

| 路径 | 方法 | 描述 |
| --- | --- | --- |
| `/health` | GET | 健康检查，返回服务器状态和 AI Provider。 |
| `/api/auth/login` | POST | 用户登录。 |
| `/api/auth/status` | GET | 检查用户登录状态。 |
| `/api/chat` | POST | 处理聊天请求。 |
| `/api/payment/create-native` | POST | 创建微信支付订单。 |
| `/api/payment/notify` | POST | 接收微信支付回调。 |
| `/api/admin/stats` | GET | 获取管理后台的统计数据。 |
| `/api/admin/export/users-csv` | GET | 导出用户数据为 CSV 文件。 |
| `/api/admin/export/convos-csv` | GET | 导出对话记录为 CSV 文件。 |

---

## 4. 前端详解

前端由一系列独立的 HTML 文件构成，使用原生 JavaScript 与后端 API 进行交互。

### 4.1. 文件结构

- `index.html`: 项目的营销和介绍首页。
- `login.html`: 用户输入邀请码的登录页面。
- `chat.html`: 核心的 AI Agent 聊天应用界面。
- `admin.html`: 管理员使用的数据看板和后台管理页面。
- `pricing.html`: 展示不同订阅套餐及价格，并集成微信支付按钮。
- `assets/`: 存放图片、CSS 等静态资源。

### 4.2. 核心页面逻辑

- **`chat.html`**: 
  - 页面加载时，请求 `/api/auth/status` 检查登录状态，如果未登录则跳转到 `login.html`。
  - 左侧边栏动态加载所有可用的 AI Agent (Skills)。
  - 用户发送消息后，将对话历史和新消息发送到 `/api/chat` 接口。
  - 使用 `marked.js` 将返回的 Markdown 格式的 AI 回复渲染成 HTML 并显示在聊天窗口中。

- **`admin.html`**: 
  - 页面加载时，请求 `/api/admin/stats` 等接口获取数据并填充到看板中。
  - 提供生成新邀请码、查看用户列表、导出数据等功能按钮。
  - 所有操作都通过调用后端的 admin API 完成。

- **`pricing.html`**: 
  - 点击“立即订阅”按钮后，向后端 `/api/payment/create-native` 发送请求。
  - 获取到 `qrCodeUrl` 后，使用第三方库（如 `qrcode.js`）或直接在弹窗中显示支付二维码。
  - 轮询后端接口检查支付状态，支付成功后自动跳转到 `chat.html`。

---

## 5. 部署与环境

### 5.1. 依赖安装

项目仅有一个后端依赖 `wechatpay-node-v3`（虽然现在已被原生代码替代，但仍在 `package.json` 中）。通过 `npm install` 安装。

### 5.2. 环境变量 (`.env`)

项目通过一个 `.env` 文件管理所有敏感信息和配置。启动服务器前必须确保此文件存在且配置正确。

| 变量名 | 描述 |
| --- | --- |
| `AI_PROVIDER` | 指定使用的 AI 提供商，如 `siliconflow`。 |
| `SILICONFLOW_API_KEY` | SiliconFlow 的 API Key。 |
| `ADMIN_CODE` | 管理员登录使用的特殊邀请码。 |
| `WECHAT_APP_ID` | 微信支付关联的应用 AppID。 |
| `WECHAT_MCH_ID` | 微信支付商户号。 |
| `WECHAT_API_V3_KEY` | 微信支付 API v3 密钥。 |
| `WECHAT_SERIAL_NO` | 微信支付平台证书的序列号。 |
| `WECHAT_NOTIFY_URL` | 微信支付回调通知的 URL。 |

### 5.3. 运行服务器

项目使用 PM2 进行进程管理。

- **启动**: `env $(cat .env | xargs) pm2 start api-server.js --name medagent-hub`
  - 此命令会先加载 `.env` 文件中的所有环境变量，然后再启动 `api-server.js`。
- **保存**: `pm2 save`
  - 保存当前 PM2 进程列表，以便在服务器重启后自动恢复。
- **日志**: `pm2 logs medagent-hub`
  - 查看实时日志，用于调试和监控。

---

## 6. Agent (Skills) 系统

AI Agent 的能力和行为由一系列 Markdown 文件定义，这些文件位于 `/skills` 目录下。

### 6.1. Skill 文件结构

每个 `.md` 文件代表一个 Agent，其内容遵循特定的格式：

- **Front Matter**: 文件开头的 YAML 部分，定义了 Agent 的元数据（如名称、描述、分类等）。
- **Profile**: Agent 的角色定义。
- **Skills**: Agent 掌握的核心技能列表。
- **Goals**: Agent 在对话中需要达成的目标。
- **Constraints**: Agent 必须遵守的约束和说话风格。
- **Workflow**: Agent 响应用户请求时应遵循的思考和行动步骤。
- **OutputFormat**: 对 Agent 输出格式的具体要求。
- **Initialization**: Agent 的开场白和初始化指令。

### 6.2. Prompt 工程

Agent 的表现高度依赖于 Prompt 的设计。在本次维护中，我们修复了几个 Prompt 问题：

- **禁止假图片占位符**: 明确禁止 AI 在回复中使用 `[🖼️ 视觉辅助]` 等不存在的图片标签。
- **禁止删除线**: 禁止 AI 使用 `~~...~~` 语法，避免文本被错误地渲染为删除线。
- **禁止多余引号**: 指导 AI 不要在回复的开头和结尾添加不必要的引号。

这些修改都通过在 Prompt 的 `OutputFormat` 和 `Constraints` 部分添加严格的负向指令来约束实现，向来完成。
