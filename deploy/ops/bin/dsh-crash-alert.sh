#!/bin/bash
# dsh 崩溃频率告警 v1（2026-10-02 建立）
#
# 背景：dsh 的 node 进程存在 V8 层 SIGSEGV（Node v24.21.0，已排除原生缓存与原生模块）。
#   单次崩溃已被 entrypoint(1s 重拉) + Caddy(lb_try_duration 15s) 完全吸收，用户无感
#   （实测：3 次崩溃窗口内 419 请求、0 个 5xx）。
#   需要升级处理的是**频率**：一旦 10 分钟内崩超过阈值，说明进入崩溃循环，
#   15 秒重试窗口会被击穿，用户就会开始看到错误。那时必须有人知道。
#
# 判据：读 docker logs 最近 CRASH_WINDOW_MIN 分钟内的 "exited after startup"（status 139）。
set -u
ALERT=/usr/local/bin/dsh-alert.sh
STATE=/var/lib/dsh-crash-alert
LOG=/var/log/dsh-crash-alert.log
WINDOW_MIN=10
WARN_N=3
CRIT_N=8
mkdir -p "$STATE"

NOW=$(date +%s)
SINCE=$(( NOW - WINDOW_MIN*60 ))
TXT=$(docker logs dsh --since "${WINDOW_MIN}m" -t 2>&1 || true)
N=$(printf '%s\n' "$TXT" | grep -c "exited after startup" || true)
SEG=$(printf '%s\n' "$TXT" | grep -c "Segmentation fault" || true)
UP=$(docker inspect dsh --format '{{.State.StartedAt}}' 2>/dev/null || echo '?')

printf '%s crashes_%dmin=%s seg=%s\n' "$(date -Is)" "$WINDOW_MIN" "${N:-0}" "${SEG:-0}" >> "$LOG"
[ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 2000 ] && { tail -1000 "$LOG" > "$LOG.t"; mv "$LOG.t" "$LOG"; }

if [ "${N:-0}" -ge "$CRIT_N" ]; then
  TIMES=$(printf '%s\n' "$TXT" | grep "exited after startup" | grep -oE "[0-9]{2}:[0-9]{2}:[0-9]{2}" | tail -8 | tr '\n' ' ')
  "$ALERT" critical "dsh 崩溃循环（${WINDOW_MIN} 分钟 ${N} 次）" \
    "已进入高频崩溃，15 秒重试窗口可能被击穿，用户将开始看到错误。
崩溃时刻：$TIMES
容器启动于：$UP
排查：docker logs dsh --tail 120
注：单次崩溃已由重试层吸收；本告警针对的是**频率**。" >/dev/null 2>&1 || true
  echo "CRITICAL n=$N"
elif [ "${N:-0}" -ge "$WARN_N" ]; then
  "$ALERT" warn "dsh 崩溃频率偏高（${WINDOW_MIN} 分钟 ${N} 次）" \
    "单次崩溃用户无感，但频率偏高需关注。
容器启动于：$UP
查看趋势：docker exec dsh /data/dsh/tools/crash-counter.sh --status" >/dev/null 2>&1 || true
  echo "WARN n=$N"
else
  echo "ok n=$N"
fi
exit 0
