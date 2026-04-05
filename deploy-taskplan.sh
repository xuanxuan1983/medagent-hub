#!/bin/bash
# ============================================================
# MedAgent Hub - 任务拆解功能部署脚本
# 执行方式：ssh root@81.70.145.7 'bash -s' < deploy-taskplan.sh
# ============================================================
set -e
cd /home/ubuntu/medagent-hub
echo "=========================================="
echo "  MedAgent Hub - 任务拆解功能部署"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# 步骤 1: 拉取最新代码
echo ""
echo "[1/3] 拉取 GitHub 最新代码..."
git pull origin master
echo "git pull 完成"

# 步骤 2: 验证关键文件语法
echo ""
echo "[2/3] 验证关键文件..."
node --check routes/unified-chat-stream.js && echo "  unified-chat-stream.js: OK"
node --check task-planner.js && echo "  task-planner.js: OK"
node --check api-server.js && echo "  api-server.js: OK"

# 步骤 3: 重启服务
echo ""
echo "[3/3] 重启 PM2 服务..."
pm2 restart all
sleep 3
pm2 status

echo ""
echo "=========================================="
echo "  部署完成！"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="
