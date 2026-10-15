#!/bin/bash
# dsh-sse-watch.sh — 只读统计 dsh SSE(/plugins/events) 被远端取消的频次与间隔。
# 不读写成产配置、不重启任何服务；仅 journalctl 查询 + 追加自身统计文件。
set -u
DIR=/var/lib/dsh-sse-watch
RAW="$DIR/events.tsv"        # 去重明细: iso_ts \t stream \t dest \t ip
LOG="$DIR/cron.log"

mkdir -p "$DIR"

# 3 小时回看窗口：容忍 cron 漏跑 / 机器重启 / 手动补跑
journalctl -u cloudflared --no-pager -o short-iso --since "3 hours ago" 2>/dev/null \
  | grep -F 'canceled by remote with error code 0' \
  | grep -F 'type=http' \
  | sed -E 's/^([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8})[^ ]*.*error="stream ([0-9]+) canceled by remote with error code 0".*dest=([^ ]+) .*ip=([^ ]+) type=http.*$/\1\t\2\t\3\t\4/' \
  | grep -E '^[0-9]{4}-' \
  | sort -u >> "$DIR/events.new"

cat "$RAW" "$DIR/events.new" 2>/dev/null | sort -u > "$DIR/events.tmp"
mv "$DIR/events.tmp" "$RAW"
rm -f "$DIR/events.new"

{
  echo "===== $(date -Is) run ====="
  echo "总计被取消事件数: $(wc -l < "$RAW"       2>/dev/null || echo 0)"
  echo "窗口(最早→最新)  : $(head -1 "$RAW" 2>/dev/null | cut -f1)  →  $(tail -1 "$RAW" 2>/dev/null | cut -f1)"
  echo "按小时分布:"
  cut -f1 "$RAW" 2>/dev/null | cut -d: -f1 | uniq -c | awk '{printf "  %s  %s 次\n",$2,$1}'
  echo "相邻间隔(s) [最常见 top5]:"
  cut -f1 "$RAW" 2>/dev/null | awk -F'[T:]' '{t=mktime($1" "$2" "$3" "$4" "$5" "$6); if(NR>1) printf "%.0f\n", t-prev; prev=t}' \
    | sort -n | uniq -c | sort -rn | head -5 | awk '{printf "  %ss x%s\n",$2,$1}'
  echo "CF 边缘节点 IP（非终端用户）:"
  cut -f4 "$RAW" 2>/dev/null | sort | uniq -c | sort -rn | head -10 | awk '{printf "  %s  %s\n",$2,$1}'
} >> "$LOG" 2>&1
