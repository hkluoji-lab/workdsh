#!/usr/bin/env bash
# 在宿主机安装并启动 survey.10ge.cn 公网网关（幂等）。
#
# 网关只放行 /survey/ 与 /admin，其余一律 404，避免把无鉴权的 AI 工作台
# 通过新域名暴露出去。
set -uo pipefail

A=/opt/1panel/apps/deepseek-harness/deepseek-harness
SRC=$A/data/dsh/home/dsh/survey/host-gateway
DST=/opt/survey-gateway
UNIT=/etc/systemd/system/survey-gateway.service
REPORT=$DST/enable-report.txt

mkdir -p "$DST"
log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" | tee -a "$REPORT"; }
fail() { printf '[%s][FAIL] %s\n' "$(date +%H:%M:%S)" "$*" | tee -a "$REPORT" >&2; exit 1; }

log "=== 安装 survey 公网网关 ==="
[[ -f "$SRC/gateway.mjs" ]] || fail "缺少 $SRC/gateway.mjs"
command -v node >/dev/null || fail "宿主机没有 node"
log "node: $(node --version)"

# 端口占用检查
if ss -ltn 2>/dev/null | grep -q ':3092 '; then
  if ! systemctl is-active --quiet survey-gateway; then
    fail "宿主 3092 已被其它进程占用，请先释放"
  fi
fi

install -m 0755 "$SRC/gateway.mjs" "$DST/gateway.mjs"
install -m 0644 "$SRC/survey-gateway.service" "$UNIT"
log "已安装 $DST/gateway.mjs 与 $UNIT"

systemctl daemon-reload
systemctl enable --now survey-gateway >/dev/null 2>&1
sleep 2
systemctl restart survey-gateway
sleep 2

systemctl is-active --quiet survey-gateway || {
  journalctl -u survey-gateway --no-pager -n 20 | tee -a "$REPORT"
  fail "网关未启动"
}
log "服务状态：$(systemctl is-active survey-gateway)"

log "--- 网关本地自检 ---"
curl -fsS -m 5 http://127.0.0.1:3092/__gw/health | tee -a "$REPORT"; echo | tee -a "$REPORT"
printf '首页(应 302): ' | tee -a "$REPORT"
curl -s -o /dev/null -m 8 -w '%{http_code} -> %{redirect_url}\n' http://127.0.0.1:3092/ | tee -a "$REPORT"
printf '跟随跳转后(应 200): ' | tee -a "$REPORT"
curl -sL -o /tmp/gw-form.html -m 12 -w '%{http_code} size=%{size_download}\n' http://127.0.0.1:3092/ | tee -a "$REPORT"
grep -q '岗位工作与 Agent 化机会调研问卷' /tmp/gw-form.html && log "表单内容校验通过" || fail "网关取到的不是问卷表单"
printf '工作台根路径(应 404): ' | tee -a "$REPORT"
curl -s -o /dev/null -m 8 -w '%{http_code}\n' http://127.0.0.1:3092/ | tee -a "$REPORT"
printf '/api/settings.describe(应 404): ' | tee -a "$REPORT"
curl -s -o /dev/null -m 8 -w '%{http_code}\n' http://127.0.0.1:3092/api/settings.describe | tee -a "$REPORT"
printf '/plugins/events(应 404): ' | tee -a "$REPORT"
curl -s -o /dev/null -m 8 -w '%{http_code}\n' http://127.0.0.1:3092/plugins/events | tee -a "$REPORT"

log "=== 网关安装完成 ==="
