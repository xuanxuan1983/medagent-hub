#!/bin/bash
SENDKEY="SCT318800Tfern1vFw9cjqK7OPKiskenT4"
DOMAIN="medagent.filldmy.com"
DATE=$(date "+%Y-%m-%d %H:%M:%S")
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
DISK_INFO=$(df -h / | awk 'NR==2 {print $3 " / " $2 " (" $5 ")"}')
MEM_TOTAL=$(free -m | awk 'NR==2 {print $2}')
MEM_USED=$(free -m | awk 'NR==2 {print $3}')
MEM_USAGE=$(echo "scale=2; $MEM_USED/$MEM_TOTAL*100" | bc | cut -d. -f1)
MEM_INFO="${MEM_USED}MB / ${MEM_TOTAL}MB (${MEM_USAGE}%)"
PM2_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; data=json.load(sys.stdin); p=[x for x in data if x['name']=='api-server']; print(p[0]['pm2_env']['status'] if p else 'not_found')" 2>/dev/null || echo "error")
PM2_RESTARTS=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; data=json.load(sys.stdin); p=[x for x in data if x['name']=='api-server']; print(p[0]['pm2_env']['restart_time'] if p else 0)" 2>/dev/null || echo "0")
if [ "$PM2_STATUS" == "online" ]; then PM2_INFO="🟢 正常运行 (重启次数: $PM2_RESTARTS)"; else PM2_INFO="🔴 异常 ($PM2_STATUS)"; fi
HTTP_STATUS=$(curl -o /dev/null -s -w "%{http_code}" "https://$DOMAIN" --max-time 10 )
if [ "$HTTP_STATUS" == "200" ]; then WEB_INFO="🟢 正常访问 (HTTP 200)"; else WEB_INFO="🔴 异常 (HTTP $HTTP_STATUS)"; fi
EXPIRATION_DATE=$(echo | openssl s_client -servername $DOMAIN -connect $DOMAIN:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$EXPIRATION_DATE" ]; then
  EXP_EPOCH=$(date -d "$EXPIRATION_DATE" +%s); CUR_EPOCH=$(date +%s); DAYS_LEFT=$(( ($EXP_EPOCH - $CUR_EPOCH) / 86400 ))
  if [ $DAYS_LEFT -le 15 ]; then SSL_INFO="🔴 即将过期 (剩余 $DAYS_LEFT 天)"; elif [ $DAYS_LEFT -le 30 ]; then SSL_INFO="⚠️ 需关注 (剩余 $DAYS_LEFT 天)"; else SSL_INFO="🟢 正常 (剩余 $DAYS_LEFT 天)"; fi
else SSL_INFO="🔴 无法获取证书信息"; fi
TITLE="MedAgent Hub 每日巡检报告"
CONTENT="### 巡检时间\n$DATE\n\n### 🌐 服务状态\n- **网站访问**: $WEB_INFO\n- **SSL 证书**: $SSL_INFO\n- **PM2 (api-server)**: $PM2_INFO\n\n### 💻 服务器资源\n- **磁盘 (根目录)**: $DISK_INFO\n- **内存使用**: $MEM_INFO\n\n---\n*此消息由自动监控脚本发送*"
if [[ "$PM2_INFO" == *"🔴"* ]] || [[ "$WEB_INFO" == *"🔴"* ]] || [[ "$SSL_INFO" == *"🔴"* ]] || [ "$DISK_USAGE" -gt 90 ] || [ "$MEM_USAGE" -gt 90 ]; then TITLE="🚨 [告警] MedAgent Hub 巡检发现异常！"; fi
curl -s -X POST "https://sctapi.ftqq.com/$SENDKEY.send" -d "title=$TITLE" --data-urlencode "desp=$CONTENT" > /dev/null
echo "[$DATE] 巡检完成 ，标题: $TITLE" >> /home/ubuntu/medagent-hub/monitor.log
