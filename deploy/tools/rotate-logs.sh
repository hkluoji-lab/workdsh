#!/usr/bin/env bash
# 日志轮转与归档（C2）
#
# 由来（2026-09-28 实测）：portal/admin/admin.log 涨到 27 MB，最后写入停在 09-27 14:48。
# 上下文是 **EADDRINUSE 127.0.0.1:3084** —— 管理后台被重复拉起、端口冲突，
# 看护循环每 3 秒重启一次并打一整段堆栈，一天堆出 27 MB。
# 也就是说：日志暴涨的根因是**崩溃循环没有退避与去重**，轮转只是兜底，
# 真正要记住的是「同一个错误每 3 秒重复一次」这件事本身需要被看见。
#
# 做法：对 /data/dsh 下超过阈值的 *.log
#   ① 先 gzip 归档为 <原名>.<时间戳>.log.gz（copytruncate 语义）
#   ② 再截断原文件（写者若为 `>>` / O_APPEND 不会丢写；非 append 写者会短暂稀疏，属已知取舍）
#   ③ 每类保留最近 KEEP 份
#
# 用法：
#   rotate-logs.sh            执行一轮
#   rotate-logs.sh --dry-run  只报告，不改动
#   rotate-logs.sh --ensure   确保后台轮转循环在跑（幂等；由 backup-assets.sh 在每次启动时调用）
#   rotate-logs.sh --loop     前台常驻循环（间隔 LOG_INTERVAL_SECONDS，默认 600）
#
# 环境变量：LOG_MAX_BYTES（默认 5 MiB）、LOG_KEEP（默认 5）、LOG_ROOT（默认 /data/dsh）
set -u

ROOT="${LOG_ROOT:-/data/dsh}"
MAX="${LOG_MAX_BYTES:-5242880}"
KEEP="${LOG_KEEP:-5}"
INTERVAL="${LOG_INTERVAL_SECONDS:-600}"
PIDFILE="${LOG_PIDFILE:-/data/dsh/tmp/rotate-logs.pid}"
SELF="$(readlink -f "$0")"
# 不碰：沙箱/临时区、依赖目录、npm 自管的日志，以及本脚本自己的归档产物
PRUNE='-path */tmp/* -o -path */node_modules/* -o -path */.npm/* -o -name *.log.gz'

rotate_once() {
  local dry="${1:-}"
  local n=0
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    local size; size=$(stat -c %s "$f" 2>/dev/null || echo 0)
    [ "$size" -gt "$MAX" ] || continue
    local ts; ts=$(date +%Y%m%d-%H%M%S)
    local arc="$f.$ts.log.gz"
    if [ "$dry" = "--dry-run" ]; then
      printf '  [dry-run] %s (%s bytes) → %s\n' "$f" "$size" "$(basename "$arc")"
    else
      if gzip -c "$f" > "$arc" 2>/dev/null; then
        chmod 600 "$arc" 2>/dev/null
        : > "$f"                                   # copytruncate：截断而非删除，保住写者的 fd
        printf '  rotated %s (%s bytes) → %s\n' "$f" "$size" "$(basename "$arc")"
      else
        rm -f "$arc"
        printf '  rotate FAILED %s (保留原文件)\n' "$f" >&2
      fi
    fi
    # 每类保留最近 KEEP 份
    local dir base cnt
    dir=$(dirname "$f"); base=$(basename "$f")
    cnt=$(ls -1t "$dir/$base".*.log.gz 2>/dev/null | wc -l)
    if [ "$cnt" -gt "$KEEP" ]; then
      ls -1t "$dir/$base".*.log.gz | tail -n "$(( cnt - KEEP ))" | while read -r old; do
        [ "$dry" = "--dry-run" ] || rm -f "$old"
      done
    fi
    n=$((n+1))
  done < <(find "$ROOT" -type f -name '*.log' ! \( $PRUNE \) 2>/dev/null)
  [ "$n" -eq 0 ] && echo "  无需轮转（阈值 ${MAX} 字节）"
  return 0
}

case "${1:-}" in
  --dry-run) rotate_once --dry-run ;;
  --loop)
    printf 'log rotation loop started (interval %ss, threshold %s bytes)\n' "$INTERVAL" "$MAX"
    while true; do rotate_once; sleep "$INTERVAL"; done ;;
  --ensure)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null; then
      echo "log rotation loop already running (pid $(cat "$PIDFILE"))"; exit 0
    fi
    nohup bash "$SELF" --loop >>/data/dsh/backups/log-rotate.out 2>&1 &
    echo $! > "$PIDFILE"
    echo "log rotation loop started (pid $(cat "$PIDFILE"))" ;;
  *) rotate_once ;;
esac
