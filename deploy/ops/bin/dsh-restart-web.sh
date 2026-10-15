#!/bin/bash
# 2026-09-27 运维会话: 按用户要求重启 dsh web 服务
LOG=/var/log/dsh-restart-web.log
{
  echo "=== $(date -Is) 已挂起, 等待 30s 让会话消息送达 ==="
  echo "--- 重启前快照 ---"
  docker inspect dsh --format 'before: status={{.State.Status}} health={{.State.Health.Status}} started={{.State.StartedAt}}'
  docker exec -u 1000 dsh sh -c 'curl -s -m 10 http://127.0.0.1:3080/ 2>/dev/null' 2>/dev/null > /tmp/entry-before.html
  echo "入口大小(before): $(wc -c < /tmp/entry-before.html 2>/dev/null) bytes; prompt-polish 次数: $(grep -c dsh-prompt-polish /tmp/entry-before.html 2>/dev/null)"
  sleep 30
  echo "--- $(date -Is) 重启 dsh web ---"
  cd /opt/1panel/apps/deepseek-harness/deepseek-harness || exit 1
  docker compose restart
  echo "--- $(date -Is) 等待服务就绪 ---"
  sleep 45
  echo "=== $(date -Is) 重启后验证 ==="
  docker inspect dsh --format 'after: status={{.State.Status}} health={{.State.Health.Status}} started={{.State.StartedAt}}'
  docker exec -u 1000 dsh sh -c 'curl -s -m 15 http://127.0.0.1:3080/ 2>/dev/null' 2>/dev/null > /tmp/entry-after.html
  echo "入口大小(after): $(wc -c < /tmp/entry-after.html 2>/dev/null) bytes"
  echo "  dsh-prompt-polish 次数: $(grep -c dsh-prompt-polish /tmp/entry-after.html 2>/dev/null) (应 0)"
  echo "  dsh-improve-prompt 次数: $(grep -c dsh-improve-prompt /tmp/entry-after.html 2>/dev/null) (应 0)"
  echo "--- 未激活/加载失败条目（应为空）---"
  docker logs dsh --since 3m 2>&1 | grep -iE "did not activate|skipping profile bundle|failed to import" | tail -5
  echo "--- 站点 ---"
  for u in dsh.10ge.cn zq.10ge.cn 100.10ge.cn odoo.10ge.cn; do
    printf '%s: ' "$u"; curl -s -o /dev/null -m 12 -w '%{http_code}\n' "https://$u/" 2>/dev/null
  done
  echo "--- 容器总数 ---"; echo "running: $(docker ps -q | wc -l)/$(docker ps -aq | wc -l)"
  echo "=== 完成 $(date -Is) ==="
} >> "$LOG" 2>&1
