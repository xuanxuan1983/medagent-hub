#!/bin/bash
# MedAgent Hub 腾讯云服务器部署/更新脚本
# 服务器：腾讯云 Ubuntu 22.04，IP: 81.70.145.7
# 使用方法：bash deploy-cn.sh
#
# 注意：腾讯云服务器访问 GitHub 可能较慢或超时
# 如 git pull 卡住，请改用 CDN 更新方式（见脚本末尾说明）

set -e

REPO_URL="https://github.com/xuanxuan1983/medagent-hub.git"
APP_DIR="/home/ubuntu/medagent-hub"
NODE_VERSION="20"
PM2_APP_NAME="medagent-hub"

echo "🚀 MedAgent Hub 部署开始..."

# 1. 安装 Node.js
if ! command -v node &> /dev/null; then
  echo "📦 安装 Node.js ${NODE_VERSION}..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "✅ Node.js $(node -v)"

# 2. 安装 PM2（进程守护，开机自启）
if ! command -v pm2 &> /dev/null; then
  echo "📦 安装 PM2..."
  npm install -g pm2
fi
echo "✅ PM2 $(pm2 -v)"

# 3. 拉取代码（如超时请改用 CDN 方式，见脚本末尾）
if [ -d "$APP_DIR" ]; then
  echo "🔄 更新代码..."
  git -C "$APP_DIR" pull origin master
else
  echo "📥 克隆代码..."
  git clone "$REPO_URL" "$APP_DIR"
fi

# 4. 安装依赖
cd "$APP_DIR"
npm install --production

# 5. 创建 .env 文件（如果不存在）
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "⚙️  创建 .env 配置文件..."
  cat > "$ENV_FILE" << 'ENVEOF'
PORT=3002
GEMINI_API_KEY=填入你的Gemini_API_Key
BOCHA_API_KEY=填入你的Bocha_API_Key
ADMIN_CODE=admin2026
MAX_USES_PER_CODE=5
ENVEOF
  echo ""
  echo "⚠️  请先编辑配置文件，填入 API Key："
  echo "   nano $ENV_FILE"
  echo ""
  echo "编辑完成后，重新运行此脚本启动服务。"
  exit 0
fi

# 6. 开放防火墙端口（腾讯云还需在控制台安全组放行 3002 端口）
ufw allow 3002/tcp 2>/dev/null || true

# 7. 启动/重启服务
echo "🎯 启动服务..."
pm2 stop "$PM2_APP_NAME" 2>/dev/null || true
pm2 start "$APP_DIR/api-server.js" \
  --name "$PM2_APP_NAME" \
  --log "$APP_DIR/server.log" \
  --time

# 8. 设置开机自启
pm2 save
env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo ""
echo "✅ 部署完成！"
echo ""
echo "🌐 访问地址：http://81.70.145.7:3002"
echo "📊 服务状态：pm2 list"
echo "📝 查看日志：pm2 logs medagent-hub"
echo "🔄 重启服务：pm2 restart medagent-hub"
echo ""
echo "⚠️  记得在腾讯云控制台 → 安全组 → 放行 3002 端口"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📡 如 git pull 超时，可单独更新文件："
echo "   curl -o $APP_DIR/chat.html <CDN_URL>"
echo "   pm2 restart medagent-hub"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
