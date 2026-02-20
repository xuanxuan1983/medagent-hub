#!/bin/bash

# MedAgent Hub 启动脚本

echo "🎯 启动医美智能助手平台..."
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未安装 Node.js"
    echo "请访问 https://nodejs.org 安装 Node.js"
    exit 1
fi

# 检查 Anthropic API Key
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "⚠️  警告: 未设置 ANTHROPIC_API_KEY 环境变量"
    echo ""
    echo "请设置您的 API Key:"
    echo "  export ANTHROPIC_API_KEY='your-api-key-here'"
    echo ""
    echo "或者在 ~/.zshrc 或 ~/.bashrc 中添加:"
    echo "  export ANTHROPIC_API_KEY='your-api-key-here'"
    echo ""
    read -p "是否继续启动? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 检查并安装依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖包..."
    npm install @anthropic-ai/sdk
fi

# 启动 API 服务器
echo "🚀 启动 API 服务器 (端口 3001)..."
node api-server.js &
API_PID=$!

# 等待服务器启动
sleep 2

# 检查服务器是否启动成功
if curl -s http://localhost:3001/health > /dev/null; then
    echo "✅ API 服务器启动成功"
else
    echo "❌ API 服务器启动失败"
    kill $API_PID 2>/dev/null
    exit 1
fi

# 启动 HTTP 服务器提供静态文件
echo "🌐 启动 Web 服务器 (端口 8080)..."
python3 -m http.server 8080 &
WEB_PID=$!

sleep 1

echo ""
echo "✨ 医美智能助手平台已启动!"
echo ""
echo "📋 访问地址:"
echo "   主界面: http://localhost:8080/medagent-hub-ui-final.html"
echo "   API服务: http://localhost:3001"
echo ""
echo "💡 使用说明:"
echo "   1. 在浏览器中打开主界面"
echo "   2. 点击任意助手的「启动」按钮"
echo "   3. 在弹出的聊天窗口中与助手对话"
echo ""
echo "⏹  按 Ctrl+C 停止服务"
echo ""

# 等待用户中断
trap "echo ''; echo '👋 正在停止服务...'; kill $API_PID $WEB_PID 2>/dev/null; echo '✅ 服务已停止'; exit 0" INT

# 保持脚本运行
wait
