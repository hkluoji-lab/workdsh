#!/bin/sh
# 崩溃计数器（第 0c 步）：把"dsh 重启事件 + 存活时长 + 是容器重启还是进程重启"落到数据盘。
#
# 为什么需要它：
#   入口脚本的运行期看护会在 dsh 死后 3 秒原地重启它，并往容器 stdout 打一行
#   "dsh exited after startup (status 139, ...)"（139 = SIGSEGV）。但容器日志在 1Panel 侧，
#   不便于长期对比。本脚本从容器内部采样 /proc，把重启事件与时间线记到数据盘，
#   这样"到底多久崩一次、是进程崩还是整容器重启"可以直接查，不依赖任何宿主权限。
#
# 用法：
#   crash-counter.sh --once     采一次样（首次只记录基线，不误报）
#   crash-counter.sh --loop     常驻循环（间隔 CRASH_INTERVAL_SECONDS，默认 60 秒）
#   crash-counter.sh --ensure   幂等拉起 --loop（后台；已有实例则不重复启动）
#   crash-counter.sh --status   打印汇总（重启次数、按天分布、最近事件）
#
# 回滚：rm -f /data/dsh/tools/crash-counter.sh /data/dsh/tmp/crash-counter.pid
#       （日志/状态文件只是记录，可保留）
set -u

INTERVAL=${CRASH_INTERVAL_SECONDS:-60}
LOG=${CRASH_LOG:-/data/dsh/tmp/crash-counter.log}
STATE=${CRASH_STATE:-/data/dsh/tmp/crash-counter.state}
PIDFILE=${CRASH_PIDFILE:-/data/dsh/tmp/crash-counter.pid}
MAX_LINES=${CRASH_MAX_LINES:-500}

now_iso() { date -Is; }

# dsh harness 的 pid：按 cmdline 扫 /proc（容器里没有 ps/pgrep）
find_dsh_pid() {
  for d in /proc/[0-9]*; do
    [ -r "$d/cmdline" ] || continue
    if tr '\0' ' ' < "$d/cmdline" 2>/dev/null | grep -q 'dsh/lib/bin.js web'; then
      echo "${d#/proc/}"
      return 0
    fi
  done
  return 1
}

# 进程启动时刻（epoch 秒）：btime + starttime/CLK_TCK，纯 /proc 计算
start_epoch() {
  _pid=$1
  [ -r "/proc/$_pid/stat" ] || return 1
  btime=$(awk '/^btime /{print $2}' /proc/stat 2>/dev/null)
  # 先去掉 "pid (comm) " 前缀，避免 comm 里的空格打乱字段序号
  ticks=$(sed 's/^[^)]*) //' "/proc/$_pid/stat" 2>/dev/null | awk '{print $20}')
  [ -n "$btime" ] && [ -n "$ticks" ] || return 1
  echo $((btime + ticks / 100))
}

rotate_log() {
  n=$(wc -l < "$LOG" 2>/dev/null || echo 0)
  [ "$n" -gt "$MAX_LINES" ] || return 0
  tail -n 200 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
  printf '%s\n' "{\"at\":\"$(now_iso)\",\"event\":\"log-rotated\",\"keptLines\":200}" >> "$LOG"
}

# 报告目录上限：node --report-* 出错即落盘，进程反复崩会持续产出。
# 只保留最新 50 份，避免它变成新的无界增长点（上次 42GB core 的教训）。
prune_reports() {
  _d=${REPORT_DIR:-/data/dsh/tmp/reports}
  [ -d "$_d" ] || return 0
  ls -1t "$_d"/report.*.json 2>/dev/null | tail -n +51 | while read -r _f; do rm -f -- "$_f"; done
}

# core 上限：第 0b 步一旦在宿主机打开 core，这里保证最多留最新 2 份（上次是 42GB 无界堆积）。
prune_cores() {
  _d=${CORE_DIR:-/data/dsh/tmp/cores}
  [ -d "$_d" ] || return 0
  ls -1t "$_d"/*.core 2>/dev/null | tail -n +3 | while read -r _f; do rm -f -- "$_f"; done
}

# 凭据锁观察（只记录，绝不删）：
#   实测过一次 20 连败的启动失败，真因是 atomic-write 等 /data/dsh/.credentials.yaml.lock 超时，
#   导致必需插件 connection 无法激活 → dsh 起不来 → 网站完全打不开。
#   这里只在"锁存在且超过阈值仍未消失"时记一条事件，属于取证，不参与清理（乱删锁可能损坏凭据文件）。
LOCK_FILE=${CRED_LOCK_FILE:-/data/dsh/.credentials.yaml.lock}
LOCK_ALERT_SECONDS=${CRED_LOCK_ALERT_SECONDS:-90}
watch_cred_lock() {
  [ -e "$LOCK_FILE" ] || { rm -f "${STATE}.lock"; return 0; }
  _now=$(date +%s)
  _mtime=$(stat -c %Y "$LOCK_FILE" 2>/dev/null || echo "$_now")
  _age=$((_now - _mtime))
  [ "$_age" -ge "$LOCK_ALERT_SECONDS" ] || return 0
  # 同一次持锁只记一条
  if [ -r "${STATE}.lock" ] && [ "$(cat "${STATE}.lock" 2>/dev/null)" = "$_mtime" ]; then return 0; fi
  echo "$_mtime" > "${STATE}.lock"
  printf '%s\n' "{\"at\":\"$(now_iso)\",\"event\":\"cred-lock-stale\",\"ageSec\":$_age,\"path\":\"$LOCK_FILE\"}" >> "$LOG"
  rotate_log
}

sample() {
  prune_reports
  prune_cores
  watch_cred_lock
  dsh_pid=$(find_dsh_pid || echo '')
  container_start=$(start_epoch 1 || echo '')
  dsh_start=''
  [ -n "$dsh_pid" ] && dsh_start=$(start_epoch "$dsh_pid" || echo '')

  prev_c=''; prev_p=''; prev_s=''
  if [ -r "$STATE" ]; then
    # 状态文件格式：containerStart dshPid dshStart
    read -r prev_c prev_p prev_s < "$STATE" 2>/dev/null || true
  fi

  event=''
  if [ -z "$prev_c" ]; then
    event='baseline'
  elif [ "$container_start" != "$prev_c" ]; then
    event='container-restart'
  elif [ -n "$dsh_pid" ] && [ "$dsh_pid" != "$prev_p" ]; then
    event='harness-restart'
  elif [ -z "$dsh_pid" ] && [ -n "$prev_p" ]; then
    event='harness-absent'
  fi

  if [ -n "$event" ]; then
    uptime_prev=''
    if [ -n "$prev_s" ] && [ "$prev_s" -gt 0 ] 2>/dev/null; then
      uptime_prev=$(( $(date +%s) - prev_s ))
      [ "$uptime_prev" -lt 0 ] && uptime_prev=0
    fi
    printf '%s\n' "{\"at\":\"$(now_iso)\",\"event\":\"$event\",\"containerStart\":${container_start:-0},\"dshPid\":${dsh_pid:-0},\"prevDshPid\":${prev_p:-0},\"prevUptimeSec\":${uptime_prev:-0}}" >> "$LOG"
    rotate_log
  fi

  printf '%s %s %s\n' "${container_start:-0}" "${dsh_pid:-0}" "${dsh_start:-0}" > "$STATE"
}

status() {
  if [ ! -r "$LOG" ]; then echo "还没有记录（先跑 --once 建基线）"; return 0; fi
  printf '总事件 %s 条\n' "$(wc -l < "$LOG" | tr -d ' ')"
  printf '按事件类型：\n'
  sed -n 's/.*"event":"\([a-z-]*\)".*/  \1/p' "$LOG" | sort | uniq -c | sort -rn | sed 's/^/ /'
  printf '按天（重启类事件）：\n'
  grep -E '"event":"(harness-restart|container-restart)"' "$LOG" | sed -n 's/.*"at":"\([0-9-]*\)T.*/  \1/p' | sort | uniq -c | sed 's/^/ /'
  printf '最近 8 条：\n'
  tail -n 8 "$LOG" | sed 's/^/  /'
}

case "${1:---once}" in
  --once) sample ;;
  --loop)
    while true; do sample; sleep "$INTERVAL"; done
    ;;
  --ensure)
    if [ -r "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null; then
      echo "已在运行（pid $(cat "$PIDFILE")）"
    else
      nohup sh "$0" --loop >/dev/null 2>&1 &
      echo $! > "$PIDFILE"
      echo "已拉起（pid $(cat "$PIDFILE")，间隔 ${INTERVAL}s）"
    fi
    ;;
  --status) status ;;
  *) echo "用法：$0 [--once|--loop|--ensure|--status]"; exit 2 ;;
esac
