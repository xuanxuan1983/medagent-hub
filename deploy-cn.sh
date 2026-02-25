#!/bin/bash
# MedAgent Hub 国内服务器一键部署脚本
# 适用：腾讯云/阿里云轻量应用服务器 Ubuntu 22.04
# 使用方法：bash deploy-cn.sh

set -e

REPO_URL="https://github.com/xuanxuan1983/medagent-hub.git"
APP_DIR="/home/ubuntu/medagent-hub"
NODE_VERSION="20"

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
  sudo npm install -g pm2
fi
echo "✅ PM2 $(pm2 -v)"

# 3. 拉取代码
if [ -d "$APP_DIR" ]; then
  echo "🔄 更新代码..."
  git -C "$APP_DIR" pull origin main
else
  echo "📥 克隆代码..."
  git clone "$REPO_URL" "$APP_DIR"
fi

# 4. 创建 .env 文件（如果不存在）
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "⚙️  创建 .env 配置文件..."
  cat > "$ENV_FILE" << 'ENVEOF'
PORT=3002
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=填入你的DeepSeek_API_Key
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

# 5. 开放防火墙端口（腾讯云/阿里云还需在控制台安全组放行 3002 端口）
sudo ufw allow 3002/tcp 2>/dev/null || true

# 6. 启动/重启服务
echo "🎯 启动服务..."
pm2 stop medagent 2>/dev/null || true
pm2 start "$APP_DIR/api-server.js" \
  --name medagent \
  --env-file "$ENV_FILE" \
  --log "$APP_DIR/server.log" \
  --time

# 7. 设置开机自启
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null || true

echo ""
echo "✅ 部署完成！"
echo ""
echo "🌐 访问地址：http://$(curl -s ifconfig.me 2>/dev/null || echo '服务器IP'):3002"
echo "📊 服务状态：pm2 status"
echo "📝 查看日志：pm2 logs medagent"
echo "🔄 更新代码：bash ~/deploy-cn.sh"
echo ""
echo "⚠️  记得在腾讯云/阿里云控制台 → 安全组 → 放行 3002 端口"
