# Skill Registry 集成说明

## 概述

`skill-registry.js` 是 MedAgent Hub 的 Skill 注册中心，实现：
- **热加载**：修改 `skills/*.md` 文件后，无需重启 PM2，500ms 内自动生效
- **自动路由注册**：从 Skill 的 frontmatter 自动构建 `agentSkillMap`、`agentNames`、IP 白名单

## 服务器集成步骤

### 1. 拉取最新代码

```bash
cd /home/ubuntu/medagent-hub
git pull origin main
```

### 2. 修改 api-server.js（3 处改动）

**改动 A：在文件顶部 require 区域添加（约第 17 行附近）**

```js
const skillRegistry = require('./skill-registry');
```

**改动 B：替换硬编码的 agentSkillMap 和 agentNames（约第 1659-1741 行）**

将原来的：
```js
const agentSkillMap = { ... };  // 约 40 行硬编码
const agentNames = { ... };     // 约 40 行硬编码
```

替换为：
```js
// ── 动态路由表（由 skill-registry.js 从 frontmatter 自动构建）──
const agentSkillMap = skillRegistry.agentSkillMap;
const agentNames    = skillRegistry.agentNames;
```

**改动 C：替换硬编码的 IP_AGENT_WHITELIST（约第 1649-1658 行）**

将原来的：
```js
const IP_AGENT_WHITELIST = {
  'doudou':  new Set([...]),
  'douding': new Set([...]),
  'douya':   new Set([...]),
};
```

替换为：
```js
// ── IP 白名单（由 skill frontmatter 的 ip_owner 字段自动构建）──
const IP_AGENT_WHITELIST = skillRegistry.ipWhitelist;
```

### 3. 修改 tools/index.js（1 处改动）

将原来的硬编码 `SKILL_DISPLAY_NAMES` 替换为：

```js
const skillRegistry = require('../skill-registry');
const SKILL_DISPLAY_NAMES = skillRegistry.skillDisplayNames;
```

### 4. 重启服务

```bash
pm2 restart all
```

重启后，日志中应看到：
```
[SkillRegistry] 扫描完成：41 个 Skill，41 个 Agent
[SkillRegistry] 热加载监听已启动，修改 skills/*.md 无需重启服务
```

## 新增 Agent 的流程（改造后）

1. 在 `skills/` 目录新建 `your-new-agent.md`
2. frontmatter 中填写：
   ```yaml
   ---
   name: your-new-agent
   agent_id: your-new-agent
   display_name: 你的 Agent 名称
   ip_owner: doudou        # 或 douding / douya，多个用逗号分隔
   access: free            # free / pro / admin
   nmpa: false
   allowed_tools: []
   ---
   ```
3. **无需重启服务**，500ms 后自动生效

## 注意事项

- `IP_DISPATCH_REDIRECT`（路由重定向规则）目前仍需手动维护，后续版本会支持 frontmatter 配置
- `sales-director.md` 因 GitHub workflow 保护规则，本次推送失败，需在服务器上手动添加 frontmatter 字段
