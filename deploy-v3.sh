#!/bin/bash
# ============================================================
# MedAgent Hub v3.0 部署脚本
# 包含：skill.md 指令化改写 + 用户记忆 v2.0 + Function Calling 修复
# 执行方式：ssh root@81.70.145.7 'bash -s' < deploy-v3.sh
# ============================================================

set -e
cd /home/ubuntu/medagent-hub

echo "=========================================="
echo "  MedAgent Hub v3.0 部署开始"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# ===== 步骤 1: 拉取最新代码 =====
echo ""
echo "【1/5】拉取 GitHub 最新代码..."
git pull origin main
echo "✅ git pull 完成"

# ===== 步骤 2: 执行用户记忆系统 patch =====
echo ""
echo "【2/5】执行用户记忆系统 patch..."
if [ -f "patch-api-server-memory.js" ]; then
    node patch-api-server-memory.js
    echo "✅ 用户记忆 patch 完成"
else
    echo "⚠️ patch-api-server-memory.js 不存在，跳过"
fi

# ===== 步骤 3: 执行工具系统 patch =====
echo ""
echo "【3/5】执行工具系统 patch..."
if [ -f "patch-api-server-tools.js" ]; then
    node patch-api-server-tools.js
    echo "✅ 工具系统 patch 完成"
else
    echo "⚠️ patch-api-server-tools.js 不存在，跳过"
fi

# ===== 步骤 4: 验证关键文件 =====
echo ""
echo "【4/5】验证关键文件..."
echo -n "  user-memory.js: "
if [ -f "user-memory.js" ]; then
    node --check user-memory.js && echo "✅ 语法正常" || echo "❌ 语法错误"
else
    echo "❌ 文件不存在"
fi

echo -n "  tools/index.js: "
if [ -f "tools/index.js" ]; then
    node --check tools/index.js && echo "✅ 语法正常" || echo "❌ 语法错误"
else
    echo "❌ 文件不存在"
fi

echo -n "  api-server.js: "
if [ -f "api-server.js" ]; then
    node --check api-server.js && echo "✅ 语法正常" || echo "❌ 语法错误"
else
    echo "❌ 文件不存在"
fi

# ===== 步骤 5: 重启服务 =====
echo ""
echo "【5/5】重启 PM2 服务..."
pm2 restart all
sleep 3
pm2 status

echo ""
echo "=========================================="
echo "  MedAgent Hub v3.0 部署完成！"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="
echo ""
echo "📊 内存使用情况:"
pm2 show api-server 2>/dev/null | grep -E 'memory|status|uptime' || true
echo ""
echo "🔍 最近日志 (最后20行):"
pm2 logs api-server --lines 20 --nostream 2>/dev/null || true
