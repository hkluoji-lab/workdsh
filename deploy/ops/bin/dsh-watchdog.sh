#!/usr/bin/env bash
# dsh 看门狗：连续 3 次(约 6 分钟) 非 healthy 则重启容器，兜住「进程卡死但容器不退出」这一类故障。
# 只读 Docker 健康状态，不碰应用数据。
set -u
f=/tmp/dsh-unhealthy-count
s=$(docker inspect dsh --format '{{.State.Health.Status}}' 2>/dev/null || echo missing)
case "$s" in
  healthy)  echo 0 > "$f"; exit 0 ;;
  none)     exit 0 ;;                       # 无 healthcheck，不干预
  starting) exit 0 ;;
  unhealthy) : ;;                  # 异常，计入
  *)        echo 0 > "$f"; exit 0 ;;        # 容器缺失或查询失败，不干预
esac
c=$(( $(cat "$f" 2>/dev/null || echo 0) + 1 ))
echo "$c" > "$f"
if [ "$c" -ge 3 ]; then
  echo "$(date -Is) restart dsh after $c consecutive '$s'" >> /var/log/dsh-watchdog.log
  docker restart dsh >> /var/log/dsh-watchdog.log 2>&1
  echo 0 > "$f"
fi
