#!/usr/bin/env bash
# 站点资产备份 —— 看护启动器。
# 与门户/问卷/VAS 同构：循环常驻，单次失败不影响下一轮（备份失败不能让看护退出）。
# 默认每 24 小时执行一次；容器重启会重新拉起，并在启动时立即补一次当天快照。
set -u

INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"

while true; do
  bash /data/dsh/tools/backup-assets.sh || printf 'backup run failed (%s); will retry next interval.\n' "$(date -Is)" >&2
  sleep "$INTERVAL"
done
