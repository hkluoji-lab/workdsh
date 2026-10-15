#!/bin/bash
# 回滚「dsh.10ge.cn 宿主层兜底」（2026-10-02 建立）
#
# 做两件事：
#   1) 隧道源站改回直连容器：http://127.0.0.1:3090  ->  https://192.168.11.205:3080
#      （优先用切换时保存的 /root/cf-tunnel-backup-*.json；没有就按规则改）
#   2) 停用宿主 nginx 站点（停在 3090 上的那个 server），并按需恢复被移走的 vhost
#
# 用法：dsh-host-fallback-rollback.sh            # 只回滚隧道
#       dsh-host-fallback-rollback.sh --full     # 连宿主 nginx 一起停掉并恢复 vhost
set -euo pipefail

CERT=/root/.cloudflared/cert.pem
TUNNEL=de305491-d57d-40b0-93ca-bcf592d5a8d5
HOSTNAME=dsh.10ge.cn
OLD_SERVICE="https://192.168.11.205:3080"

TOK=$(python3 -c "
import re,base64,json
t=open('$CERT').read()
print(base64.b64decode(re.search(r'-----BEGIN ARGO TUNNEL TOKEN-----\s*(.*?)\s*-----END',t,re.S).group(1)).decode())
")
ACCT=$(echo "$TOK" | python3 -c "import json,sys;print(json.load(sys.stdin)['accountID'])")
API=$(echo "$TOK" | python3 -c "import json,sys;print(json.load(sys.stdin)['apiToken'])")
BASE="https://api.cloudflare.com/client/v4/accounts/$ACCT/cfd_tunnel/$TUNNEL/configurations"

echo "== 回滚隧道源站 =="
python3 - "$API" "$BASE" "$HOSTNAME" "$OLD_SERVICE" <<'PY'
import json, subprocess, sys
api, base, host, old = sys.argv[1:5]
def sh(c): return subprocess.run(c, shell=True, capture_output=True, text=True)
cur = json.loads(sh(f"curl -s -H 'Authorization: Bearer {api}' '{base}'").stdout)
cfg = cur["result"]["config"]
n = 0
for rule in cfg["ingress"]:
    if rule.get("hostname") == host:
        rule["service"] = old
        rule["originRequest"] = {"noTLSVerify": True}
        n += 1
assert n == 1, f"未找到 {host} 规则"
open("/tmp/rb.json","w").write(json.dumps({"config": cfg}, ensure_ascii=False))
r = json.loads(sh(f"curl -s -X PUT -H 'Authorization: Bearer {api}' -H 'Content-Type: application/json' --data @/tmp/rb.json '{base}'").stdout)
assert r.get("success"), r
print("  已回滚 ->", old, " version=", r["result"].get("version"))
PY
rm -f /tmp/rb.json

if [ "${1:-}" = "--full" ]; then
  echo "== 停用宿主 nginx 兜底站点 =="
  rm -f /etc/nginx/conf.d/dsh-fallback.conf
  systemctl disable --now nginx || true
  BK=$(ls -td /root/nginx-fallback-backup-* 2>/dev/null | head -1 || true)
  if [ -n "$BK" ]; then
    [ -f "$BK/default.removed" ] && mv "$BK/default.removed" /etc/nginx/sites-enabled/default
    [ -L "$BK/sites-enabled-backup/1panel.symlink" ] && cp -a "$BK/sites-enabled-backup/1panel.symlink" /etc/nginx/sites-enabled/1panel
    echo "  已从 $BK 恢复被移走的 vhost"
  fi
  rm -f /etc/systemd/system/nginx.service.d/10-restart.conf
  systemctl daemon-reload
fi

echo "== 等待边缘收敛 =="
sleep 20
for i in 1 2 3; do
  printf '  https://%s/ -> %s\n' "$HOSTNAME" "$(curl -s -o /dev/null -m 20 -w '%{http_code}' https://$HOSTNAME/)"
  sleep 3
done
