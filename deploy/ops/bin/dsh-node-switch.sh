#!/bin/bash
# 背景：v22.23.3 (V8 12.4) 与 v24.21.0 (V8 13.6) 均存在 V8 GC SIGSEGV（实测 v22 复现器 2/30 崩）。
#   v26.10.0 (V8 14.6) 全量压测 0/65 崩，modules=147 与 v22 相同，唯一需补 libatomic（已随挂载提供）。
# 用法：dsh-node-switch.sh 26|22|24|status
set -euo pipefail
APP=/opt/1panel/apps/deepseek-harness/deepseek-harness
COMPOSE="$APP/docker-compose.yml"
MARK26='node26/current/bin/node'
MARK22='node22/current/bin/node'

cd "$APP"
case "${1:-status}" in
  status)
    echo "挂载 Node26: $(grep -c "$MARK26" "$COMPOSE" || true)  Node22: $(grep -c "$MARK22" "$COMPOSE" || true)"
    echo "容器内 node: $(docker exec dsh node -v 2>/dev/null || echo '(取不到)')"
    echo "/opt/node26/current -> $(readlink -f /opt/node26/current 2>/dev/null || echo '未安装')"
    exit 0 ;;
  26)
    if grep -q "$MARK26" "$COMPOSE"; then echo "已是 Node26 模式"; exit 0; fi
    [ -x /opt/node26/current/bin/node ] || { echo "FATAL: /opt/node26/current/bin/node 不存在"; exit 1; }
    cp -a "$COMPOSE" "/root/dsh-compose.bak.$(date +%Y%m%d%H%M%S)"
    python3 - "$COMPOSE" <<'PY'
import sys
p = sys.argv[1]
lines = open(p, encoding='utf-8').read().splitlines(keepends=True)
out, done = [], False
old22 = '            - /opt/node22/current/bin/node:/usr/local/bin/node:ro'
for l in lines:
    if not done and old22 in l:
        out.append('            - /opt/node26/current/bin/node:/usr/local/bin/node:ro\n')
        out.append('            - /opt/node26/lib/libatomic.so.1:/usr/lib/x86_64-linux-gnu/libatomic.so.1:ro\n')
        done = True
        continue
    out.append(l)
assert done, '未找到 node22 挂载行'
open(p, 'w', encoding='utf-8').write(''.join(out))
print("compose 已切到 Node26 + libatomic")
PY
    ;;
  22)
    if grep -q "$MARK22" "$COMPOSE"; then echo "已是 Node22 模式"; exit 0; fi
    [ -x /opt/node22/current/bin/node ] || { echo "FATAL: /opt/node22/current/bin/node 不存在"; exit 1; }
    cp -a "$COMPOSE" "/root/dsh-compose.bak.$(date +%Y%m%d%H%M%S)"
    python3 - "$COMPOSE" <<'PY'
import sys
p = sys.argv[1]
lines = open(p, encoding='utf-8').read().splitlines(keepends=True)
out = [l for l in lines if 'node26/current/bin/node' not in l and 'libatomic.so.1' not in l]
s = ''.join(out)
anchor = '        volumes:\n'
assert s.count(anchor) == 1
s = s.replace(anchor, anchor + '            - /opt/node22/current/bin/node:/usr/local/bin/node:ro\n', 1)
open(p, 'w', encoding='utf-8').write(s)
print("compose 已切回 Node22")
PY
    ;;
  *) echo "用法: dsh-node-switch.sh 26|22|24|status"; exit 2 ;;
esac

echo "--- compose 校验 ---"
docker compose config >/dev/null && echo "OK"
echo "--- 重建容器 ---"
docker compose up -d --force-recreate 2>&1 | tail -3
echo "done. 现在可轮询 https://dsh.10ge.cn/"
