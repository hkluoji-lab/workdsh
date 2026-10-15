#!/bin/bash
# dsh.10ge.cn 抗故障改造：原子应用 + 失败自动回滚（2026-10-02）
#
# 应用两处已校验过的改动：
#   1) Caddyfile            <- Caddyfile.next.fallback          （已 caddy validate 通过）
#      ・指向 3080 的反代加 lb_try_duration 15s：崩溃重拉窗口内重试而非立刻 502
#      ・站点级 handle_errors：重试仍失败时根路径回落门户 3083、其余给 503 友好页
#   2) docker-entrypoint.sh <- docker-entrypoint.sh.next.runtime （已 bash -n 通过）
#      ・运行期重启 3s -> 1s
#      ・运行期重启前回收无主凭据锁（对齐启动路径，消除「容器在跑但一直 502」）
#
# 中断：docker compose restart ≈ 15—25 秒（实测容器 start->ready 13 秒）
# 回滚：任一步失败自动还原备份并重启；也可手工跑 dsh-harden-rollback.sh
set -uo pipefail

APP=/opt/1panel/apps/deepseek-harness/deepseek-harness
D=$APP/data/dsh/tmp
TS=$(date +%Y%m%d%H%M%S)
BK=$D/harden-backup-$TS
PROBE=https://dsh.10ge.cn/

probe() { curl -s -o /dev/null -m 6 -w '%{http_code}' "$PROBE" 2>/dev/null || echo 000; }
healthy() { case "$1" in 200|301|302|303|307|308|401|403) return 0;; *) return 1;; esac; }

for f in Caddyfile.next.fallback docker-entrypoint.sh.next.runtime; do
  [ -s "$D/$f" ] || { echo "FATAL: 缺少已暂存文件 $D/$f"; exit 1; }
done

mkdir -p "$BK"
cp -a "$D/Caddyfile" "$BK/Caddyfile"
cp -a "$D/docker-entrypoint.sh" "$BK/docker-entrypoint.sh"
printf '%s\n' "$BK" > "$D/harden-last-backup"
echo "backup -> $BK"

install -m 0644 "$D/Caddyfile.next.fallback"            "$D/Caddyfile"
install -m 0755 "$D/docker-entrypoint.sh.next.runtime"  "$D/docker-entrypoint.sh"

if ! bash -n "$D/docker-entrypoint.sh"; then
  echo "FATAL: entrypoint 语法检查失败，回滚"
  cp -a "$BK/Caddyfile" "$D/Caddyfile"; cp -a "$BK/docker-entrypoint.sh" "$D/docker-entrypoint.sh"
  exit 1
fi

echo "before restart: probe=$(probe)"
cd "$APP" || exit 1
docker compose restart >/dev/null 2>&1

OK=no; C=000
for i in $(seq 1 60); do
  sleep 2
  C=$(probe)
  if healthy "$C"; then OK=yes; break; fi
done

if [ "$OK" = yes ]; then
  echo "APPLY OK: probe=$C after $((i*2))s"
  docker compose ps dsh 2>/dev/null | tail -2
  docker inspect dsh --format 'status={{.State.Status}} health={{.State.Health.Status}}'
  exit 0
fi

echo "APPLY FAILED: probe=$C -> rolling back"
cp -a "$BK/Caddyfile" "$D/Caddyfile"
cp -a "$BK/docker-entrypoint.sh" "$D/docker-entrypoint.sh"
docker compose restart >/dev/null 2>&1
for i in $(seq 1 30); do sleep 2; C=$(probe); healthy "$C" && break; done
echo "ROLLED BACK: probe=$C"
exit 1
