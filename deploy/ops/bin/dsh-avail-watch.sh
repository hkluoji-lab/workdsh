#!/bin/bash
# dsh 可用性看护 v1（2026-10-02 建立）
#
# 定位：dsh.10ge.cn 在 2026-09-30 与 2026-10-01 两次长时间 502，根因分别是
#   (a) 容器被人为停止后 dockerd 拒绝重启（hasBeenManuallyStopped / restart canceled）；
#   (b) 陈旧凭据锁导致 dsh 启动卡死 -> 容器崩溃循环。
# 这两种都是「容器级」故障：容器内的 entrypoint 看护（DSH_RUNTIME_SUPERVISION_BLOCK_V1）
# 只能在 dsh 进程 SIGSEGV 后原地重拉，救不了容器本身。本脚本补这一段。
#
# 分工：
#   容器内 entrypoint  -> dsh 进程崩溃后秒级原地重拉（不碰）
#   本脚本             -> 端到端探测 + 容器级有界自愈 + 全程留痕
#    tunnel-watchdog   -> 只管 Cloudflare 隧道（已刻意不探 dsh，避免把应用故障当隧道故障）
#
# 判据（关键教训：不要用状态码白名单）：
#   健康 = 任何「源站活着」的应答：2xx/3xx/401/403
#   故障 = 000（连不上）或网关/边缘错误 502/503/504/520-527/530
# 连续 FAIL_THRESHOLD 次故障才处置，避免单次抖动误伤。
set -u

LOG_DIR=/var/lib/dsh-avail-watch
LOG="$LOG_DIR/events.log"
STATE="$LOG_DIR/fails"
STAMP="$LOG_DIR/lastrestart"
PROBE="https://dsh.10ge.cn/"
FAIL_THRESHOLD=3
COOLDOWN=900            # 处置冷却（秒）
MEM_WARN_PCT=8          # 主机可用内存低于该比例时不处置（主机自身有麻烦，重启容器无益）
LOG_MAX=2000

mkdir -p "$LOG_DIR"
date +%s > "$LOG_DIR/last_run"   # 存活心跳：cat 此文件即为上次运行时刻
[ -f "$STATE" ] || echo 0 > "$STATE"
log() { printf '%s %s\n' "$(date -Is)" "$*" >> "$LOG"; logger -t dsh-avail-watch "$*"; }
# ALERT_HOOK_V1：站外告警出口（未配置 webhook 时只写本地日志，绝不阻塞本脚本）
ALERT=/usr/local/bin/dsh-alert.sh
alert() { [ -x "$ALERT" ] && "$ALERT" "$1" "$2" "$3" >/dev/null 2>&1 || true; }
trim() { [ "$(wc -l < "$LOG" 2>/dev/null || echo 0)" -gt "$LOG_MAX" ] && tail -n "$LOG_MAX" "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; return 0; }

# 0. 主机内存前置：内存被榨干时连 docker inspect 都可能卡住，先不动作
MEM_AVAIL_PCT=$(awk '/MemAvailable/{a=$2} /MemTotal/{t=$2} END{printf "%d", a*100/t}' /proc/meminfo 2>/dev/null || echo 100)
if [ "${MEM_AVAIL_PCT:-100}" -lt "$MEM_WARN_PCT" ]; then
  log "skip: host memory low (available=${MEM_AVAIL_PCT}% < ${MEM_WARN_PCT}%)"
  exit 0
fi

# 1. 端到端探测
CODE=$(curl -s -o /dev/null -m 10 -w "%{http_code}" "$PROBE" 2>/dev/null); CODE=${CODE:-000}
case "$CODE" in
  200|201|202|204|301|302|303|307|308|401|403)
    if [ "$(cat "$STATE" 2>/dev/null || echo 0)" != "0" ]; then
      log "recovered: probe=$CODE (was failing)"
      alert info "dsh.10ge.cn 已恢复" "端到端探测恢复为 $CODE，看护未执行重启。"
    fi
    echo 0 > "$STATE"
    exit 0 ;;
esac

FAILS=$(( $(cat "$STATE" 2>/dev/null || echo 0) + 1 ))
echo "$FAILS" > "$STATE"
log "probe=$CODE fail_count=$FAILS/$FAIL_THRESHOLD"

[ "$FAILS" -lt "$FAIL_THRESHOLD" ] && exit 0

# 2. 冷却期
NOW=$(date +%s)
LAST=$(cat "$STAMP" 2>/dev/null || echo 0)
if [ $(( NOW - LAST )) -lt "$COOLDOWN" ]; then
  log "fail threshold reached but in cooldown ($(( NOW - LAST ))s < ${COOLDOWN}s); no action"
  alert warn "dsh.10ge.cn 仍不可用（冷却期内）" "连续 $FAILS 次探测为 $CODE，容器 $CSTATUS/$HEALTH；距上次处置 $(( NOW - LAST ))s，冷却 ${COOLDOWN}s 内不重复重启。"
  exit 0
fi

CSTATUS=$(timeout 15 docker inspect dsh --format '{{.State.Status}}' 2>/dev/null || echo unknown)
HEALTH=$(timeout 15 docker inspect dsh --format '{{.State.Health.Status}}' 2>/dev/null || echo unknown)

# 3. 若容器自己正在积极重拉 dsh，让它先跑完（避免与容器内看护打架）
if [ "$CSTATUS" = "running" ]; then
  RECENT=$(timeout 15 docker logs dsh --since 180s 2>&1 | grep -cE "exited (during|after) startup|DeepSeek Harness is available" || echo 0)
  if [ "${RECENT:-0}" -gt 0 ]; then
    log "container running and self-healing (recent=$RECENT); no action"
    alert warn "dsh.10ge.cn 不可用（容器正在自愈）" "连续 $FAILS 次探测为 $CODE，容器 $CSTATUS/$HEALTH。容器内看护正在重拉 dsh，暂不干预。"
    exit 0
  fi
fi

# 4. 有界处置：容器已不在运行，或容器在跑但已 3 分钟无自救动静 -> 重建容器
log "ACTION: restarting dsh (container=$CSTATUS health=$HEALTH probe=$CODE fails=$FAILS)"
alert critical "dsh.10ge.cn 不可用，看护已重启容器" "连续 $FAILS 次探测为 $CODE；容器状态 $CSTATUS/$HEALTH；且 3 分钟内未见容器内自救动作，判定为容器级故障。"
if timeout 120 docker restart dsh >/dev/null 2>&1; then
  echo "$NOW" > "$STAMP"
  sleep 20
  NEW=$(curl -s -o /dev/null -m 10 -w "%{http_code}" "$PROBE" 2>/dev/null || echo 000)
  log "restart done; probe=$NEW"
  case "$NEW" in
    200|201|202|204|301|302|303|307|308|401|403)
      alert info "dsh.10ge.cn 重启后已恢复" "docker restart dsh 后探测为 $NEW。" ;;
    *)
      alert critical "dsh.10ge.cn 自动重启后仍未恢复" "docker restart dsh 后探测仍为 $NEW，需要人工介入：\ndocker logs dsh --tail 80\ndocker inspect dsh --format '{{.State.Status}} {{.State.Health.Status}}'" ;;
  esac
  echo 0 > "$STATE"
else
  log "ERROR: docker restart dsh failed or timed out"
fi
trim
