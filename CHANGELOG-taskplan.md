# MedAgent 任务拆解功能集成 - 变更说明

## 功能概述

在专家模式中集成了 **任务拆解（Task Planning）** 功能。当用户在专家模式下提出复杂请求时，系统会自动将任务分解为 3-5 个清晰的执行步骤，并在前端以可视化清单的形式展示实时进度。

## 触发条件

任务拆解仅在 **专家模式** 下触发，且需满足以下条件之一：

| 条件类型 | 示例 |
|---------|------|
| 多步骤动词组合 | "帮我分析...并生成..." |
| 产出物关键词 | "生成报告"、"制定方案"、"撰写文案" |
| 复杂分析任务 | "竞品分析"、"市场调研"、"行业对比" |
| 多目标连接词 | "首先...然后...最后..." |
| 长消息多目标 | 超过 80 字且包含 3 个以上逗号/分号 |

简单问答（如"什么是玻尿酸"、"你好"等）不会触发任务拆解。

## 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `routes/unified-chat-stream.js` | 集成 task-planner 模块，在专家模式中生成任务计划并通过 SSE 推送步骤状态更新 |
| `chat-app.js` | 新增 `task_plan` 和 `task_plan_update` SSE 事件处理，渲染任务规划清单 UI |
| `chat-styles.css` | 新增 `.task-plan-*` 系列样式，绿色主题清单组件 |
| `middleware/chat-middlewares.js` | SSEStreamer 类已有 `sendTaskPlan` 和 `updateTaskPlan` 方法（无需修改） |
| `task-planner.js` | 已有模块，提供 `needsPlanning()` 和 `generatePlan()` 方法（无需修改） |

## 工作流程

```
用户发送复杂问题（专家模式）
    |
    v
needsPlanning() 判断是否需要任务拆解
    |
    ├── 否 → 发送普通 step 事件（"分析问题意图"）
    |
    └── 是 → generatePlan() 调用 Qwen 生成 3-5 步计划
              |
              v
         sendTaskPlan() → 前端渲染步骤清单（所有步骤 pending）
              |
              v
         updateTaskPlan(step1, 'running') → 第一步开始
              |
              v
         [工具调用阶段]
         updateTaskPlan(step1, 'done') → 第一步完成
         updateTaskPlan(step2, 'running') → 第二步开始
              |
              v
         [工具执行完成]
         updateTaskPlan(step2, 'done') → 第二步完成
              |
              v
         [生成回答阶段]
         updateTaskPlan(lastStep, 'running') → 最后一步开始
              |
              v
         [回答完成]
         所有步骤标记为 done → 进度显示 "N/N 已完成"
```

## 前端 UI 效果

任务规划清单组件特征：

- 绿色主题背景（`#f8faf8` 渐变到 `#f0f7f0`）
- 绿色边框（`#d4e8d4`）
- 文件图标 + "任务规划" 标题 + 进度计数器
- 每个步骤包含标题和描述
- 步骤状态图标：空心圆（pending）→ 旋转加载（running）→ 绿色勾选（done）→ 红色叉号（error）
- 进度计数器实时更新（如 "2/4 已完成"）

## 部署方式

代码已推送到 GitHub，在服务器上执行：

```bash
ssh root@81.70.145.7 'bash -s' < deploy-taskplan.sh
```

或手动执行：

```bash
cd /home/ubuntu/medagent-hub
git pull origin master
pm2 restart all
```

前端使用 `Date.now()` 作为 cache buster，无需手动清缓存。
