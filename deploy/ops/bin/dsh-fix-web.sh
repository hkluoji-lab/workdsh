#!/bin/bash
# 2026-09-27 运维会话: 重启 dsh 以清除内存中残留的 dsh-prompt-polish 注册
LOG=/var/log/dsh-fix-web.log
{
  echo "=== $(date -Is) 已挂起, 等待 30s 让会话消息送达 ==="
  sleep 30
  echo "--- $(date -Is) 重启 dsh 容器 ---"
  cd /opt/1panel/apps/deepseek-harness/deepseek-harness || exit 1
  docker compose restart
  echo "--- $(date -Is) 重启返回, 等待服务就绪 ---"
  sleep 45
  echo "=== $(date -Is) 验证前端引导数据是否已清除残留插件 ==="
  BAD=$(docker exec -u 1000 dsh sh -c 'curl -s -m 15 http://127.0.0.1:3080/ 2>/dev/null' 2>/dev/null | grep -c "dsh-prompt-polish")
  echo "引导数据中 dsh-prompt-polish 出现次数: $BAD  (应为 0)"
  [ "$BAD" = "0" ] && echo "✅ 已清除, 前端可正常启动" || echo "❌ 仍残留, 需进一步处理"
  echo "--- 是否还有未激活条目 ---"
  docker logs dsh --since 3m 2>&1 | grep -iE "did not activate|skipping profile bundle|failed to import" | tail -5
  echo "(以上为空即正常)"
  echo "--- 容器与站点 ---"
  docker inspect dsh --format 'dsh: {{.State.Status}} health={{.State.Health.Status}}'
  curl -sk -o /dev/null -m 10 -w 'dsh.10ge.cn: %{http_code}\n' https://dsh.10ge.cn/ 2>/dev/null
  echo "=== 完成 $(date -Is) ==="
} >> "$LOG" 2>&1
