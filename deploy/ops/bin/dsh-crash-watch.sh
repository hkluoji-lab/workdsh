#!/bin/bash
# dsh 崩溃持续统计（只读，不干预生产）
# 每行带上当前 V8 开关配置，便于分臂对照。
set -u
D=/var/lib/dsh-crash-watch
mkdir -p "$D"
LOG="$D/log.txt"
EP=/opt/1panel/apps/deepseek-harness/deepseek-harness/data/dsh/tmp/docker-entrypoint.sh
FLAGS=$(grep -oE "node --expose-internals[^/]*" "$EP" 2>/dev/null | sed "s/node --expose-internals *//;s/ *$//")
[ -z "$FLAGS" ] && FLAGS="(none)"
A=$(date -u -d "10 minutes ago" +%Y-%m-%dT%H:%M:%S)
B=$(date -u +%Y-%m-%dT%H:%M:%S)
T=$(docker logs -t dsh --since "$A" --until "$B" 2>&1)
seg=$(printf "%s\n" "$T" | grep -c "Segmentation fault")
post=$(printf "%s\n" "$T" | grep -c "exited after startup")
startup=$(printf "%s\n" "$T" | grep -c "exited during startup")
narb=$(printf "%s\n" "$T" | grep -c "host preparation failed")
lock=$(printf "%s\n" "$T" | grep -c "cred-lock")
health=$(docker inspect dsh --format "{{.State.Health.Status}}" 2>/dev/null || echo missing)
printf "%s health=%s flags=[%s] seg=%s post_ready_crash=%s startup_fail=%s narb_fail=%s lock_reaped=%s\n" \
  "$B" "$health" "$FLAGS" "$seg" "$post" "$startup" "$narb" "$lock" >> "$LOG"
