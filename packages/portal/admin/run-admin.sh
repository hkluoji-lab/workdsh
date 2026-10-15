#!/usr/bin/env bash
# 产品页管理后台看护循环。
#
# 2026-09-28 加固（C2 的根因修复，不只是轮转兜底）：
#   此前是固定 `sleep 3` 无条件重启。09-27 曾因「两个实例抢同一个端口」触发
#   EADDRINUSE 127.0.0.1:3084 → 崩溃循环 → 一天写出 27 MB 日志
#   （归档里 79,692 处 EADDRINUSE，见 portal/admin/admin.log.*.log.gz）。
#   现在加三道约束：
#     ① 启动前先探端口：已被占用就明确退出，不再抢绑（避免制造第二个实例）；
#     ② 连续快速失败时退避 3s→6s→…→最多 60s，抑制日志暴涨；
#     ③ 运行满 60 秒视为稳定、重置退避；进程正常退出（code 0）不再重启。
set -u

PORT="${ADMIN_PORT:-3084}"
BACKOFF=3
MAX_BACKOFF=60

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; }

if port_busy; then
  printf 'admin console: 127.0.0.1:%s 已被占用，本脚本不再拉起第二个实例。\n' "$PORT" >&2
  exit 1
fi

while true; do
  START=$(date +%s)
  env HOME=/data/dsh/home \
    DSH_AUTH_USERNAME="${DSH_AUTH_USERNAME:-}" \
    DSH_AUTH_PASSWORD="${DSH_AUTH_PASSWORD:-}" \
    PORTAL_MODULE_DIR=/data/dsh/portal \
    ADMIN_BIND=127.0.0.1 \
    ADMIN_PORT="$PORT" \
    ADMIN_PUBLISH_DIR=/data/dsh/portal/site/products \
    node /data/dsh/portal/admin/src/server.mjs
  code=$?
  RAN=$(( $(date +%s) - START ))

  if [ "$code" -eq 0 ]; then
    printf 'admin console exited normally (%s).\n' "$(date -Is)" >&2
    exit 0
  fi
  [ "$RAN" -ge 60 ] && BACKOFF=3
  printf 'admin console exited code=%s after %ss (%s); restarting in %ss.\n' \
    "$code" "$RAN" "$(date -Is)" "$BACKOFF" >&2
  sleep "$BACKOFF"
  BACKOFF=$(( BACKOFF * 2 ))
  [ "$BACKOFF" -gt "$MAX_BACKOFF" ] && BACKOFF=$MAX_BACKOFF
done
