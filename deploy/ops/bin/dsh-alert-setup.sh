#!/bin/bash
# 一键接入企业微信告警（2026-10-02）
# 用法：dsh-alert-setup.sh '<企业微信群机器人 webhook url>'
#       dsh-alert-setup.sh --test        # 只发一条测试消息
#       dsh-alert-setup.sh --off         # 关闭站外推送（保留本地日志）
set -euo pipefail
CONF=/usr/local/etc/dsh-alerts.conf

if [ "${1:-}" = "--test" ]; then
  exec /usr/local/bin/dsh-alert.sh info "dsh.10ge.cn 告警通道测试" "这是一条测试消息。收到即表示告警出口可用。"
fi
if [ "${1:-}" = "--off" ]; then
  sed -i 's|^CHANNEL=.*|CHANNEL=none|' "$CONF"
  echo "已关闭站外推送（仍写 /var/log/dsh-alerts.log）"
  exit 0
fi

URL="${1:-}"
[ -n "$URL" ] || { echo "用法: dsh-alert-setup.sh '<webhook url>' | --test | --off"; exit 2; }
case "$URL" in
  https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=*) : ;;
  https://qyapi.weixin.qq.com/*) echo "提示：这不像标准企微机器人地址，仍继续" ;;
  *) echo "警告：地址不是 qyapi.weixin.qq.com 开头，确认后再继续" ;;
esac

BK="/root/dsh-alerts.conf.bak.$(date +%Y%m%d%H%M%S)"
cp -a "$CONF" "$BK"; echo "备份 -> $BK"

python3 - "$URL" <<'PY'
import sys, re
url = sys.argv[1]
p = '/usr/local/etc/dsh-alerts.conf'
s = open(p, encoding='utf-8').read()
s = re.sub(r'^CHANNEL=.*$', 'CHANNEL=wecom', s, flags=re.M)
s = re.sub(r'^WEBHOOK_URL=.*$', 'WEBHOOK_URL=' + url.replace('\\', '\\\\'), s, flags=re.M)
open(p, 'w', encoding='utf-8').write(s)
PY
chmod 600 "$CONF"   # 含凭据，收紧权限
echo "已写入 CHANNEL=wecom（配置权限 600）"
echo "--- 发送测试告警 ---"
/usr/local/bin/dsh-alert.sh info "dsh.10ge.cn 告警通道已接通" "这是接入后的第一条测试消息。收到即表示告警出口可用。"
