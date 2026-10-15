#!/bin/bash
# 2026-09-28 移除不兼容插件 @y1x1n/dsh-prompt-optimizer(依赖服务 settingsScope 不存在) 后重启 dsh
LOG=/var/log/dsh-fix-po.log
{
  echo "=== $(date -Is) 已挂起, 等待 30s 让会话消息送达 ==="
  docker inspect dsh --format 'before: {{.State.Status}} health={{.State.Health.Status}} started={{.State.StartedAt}}'
  docker exec -u 1000 dsh sh -c 'curl -s -m 10 http://127.0.0.1:3080/ 2>/dev/null' 2>/dev/null > /tmp/e-before.html
  echo "重启前入口: $(wc -c < /tmp/e-before.html) bytes, 含该插件 $(grep -c 'y1x1n' /tmp/e-before.html) 次"
  sleep 30
  echo "--- $(date -Is) 重启 dsh ---"
  cd /opt/1panel/apps/deepseek-harness/deepseek-harness || exit 1
  docker compose restart
  echo "--- $(date -Is) 等待就绪 ---"
  sleep 45
  echo "=== $(date -Is) 重启后验证 ==="
  docker inspect dsh --format 'after: {{.State.Status}} health={{.State.Health.Status}} started={{.State.StartedAt}}'
  docker exec -u 1000 dsh sh -c 'curl -s -m 15 http://127.0.0.1:3080/ 2>/dev/null' 2>/dev/null > /tmp/e-after.html
  echo "重启后入口: $(wc -c < /tmp/e-after.html) bytes"
  echo "  y1x1n / dsh-prompt-optimizer 出现次数: $(grep -c 'y1x1n\|dsh-prompt-optimizer' /tmp/e-after.html)  (应为 0)"
  echo "  已移除插件残留(prompt-polish/improve-prompt): $(grep -c 'dsh-prompt-polish\|dsh-improve-prompt' /tmp/e-after.html)  (应为 0)"
  echo "--- 激活告警（应为空）---"
  docker logs dsh --since 3m 2>&1 | grep -iE "did not activate|skipping profile bundle|failed to import|待处理" | tail -5
  echo "--- 站点 ---"
  for u in dsh.10ge.cn zq.10ge.cn; do printf '%s: ' "$u"; curl -s -o /dev/null -m 12 -w '%{http_code}\n' "https://$u/" 2>/dev/null; done
  echo "=== 完成 $(date -Is) ==="
} >> "$LOG" 2>&1
