#!/usr/bin/env python3
"""派生 docker-entrypoint.sh：启动 Caddy 前等待 loopback 后端就绪，消除启动期 502。

用法：add-portguard-entrypoint.py <in> <out>

起因：门户(3083)、sse-keepalive(3081)、survey(3082) 与 Caddy 是并行拉起的，Caddy
先绑定 8443 时，受门禁路径的 forward_auth 会拿到
`dial tcp 127.0.0.1:3083: connect: connection refused`，Caddy 直接判为 502。
（dsh web 3080 不受影响：entrypoint 已在前面用 curl 等它就绪。）

做一处改动：在 `pids+=("$portal_pid")` 之后插入 `wait_for_port()` 及三行调用。
超时非致命——后端确实起不来时仍启动 Caddy，不把整站永久阻塞在一个坏后端上。

幂等：已含 `wait_for_port() {` 时原样输出。
"""
import subprocess
import sys
import tempfile

ANCHOR = 'pids+=("$portal_pid")\n'
CADDY_LAUNCH = "caddy run --config /etc/caddy/Caddyfile"
MARKER = "wait_for_port() {"

BLOCK = '''
# 启动次序门禁：Caddy 一旦绑定 8443 就对外服务，而门户(3083)等 loopback 后端是并行
# 拉起的。Caddy 先就绪时，受门禁路径的 forward_auth 会得到
# `dial tcp 127.0.0.1:3083: connect: connection refused`，Caddy 直接判为 502。
# 故启动 Caddy 前先等各后端监听成功，消除该启动窗口。超时非致命：后端确实起不来时
# 仍要让 Caddy 起来，不把整站永久阻塞在一个坏后端上。
wait_for_port() {
  local label="$1" port="$2" timeout="${3:-60}" waited=0
  while (( waited < timeout )); do
    if node -e '
      const socket = require("node:net").connect(Number(process.argv[1]), "127.0.0.1");
      const done = (code) => { socket.destroy(); process.exit(code); };
      socket.on("connect", () => done(0));
      socket.on("error", () => done(1));
      setTimeout(() => done(1), 1500);
    ' "$port"; then
      printf '%s is listening on 127.0.0.1:%s (after %ss).\\n' "$label" "$port" "$waited"
      return 0
    fi
    sleep 1
    waited=$(( waited + 1 ))
  done
  printf 'warning: %s was not listening on 127.0.0.1:%s within %ss; starting Caddy anyway.\\n' \\
    "$label" "$port" "$timeout" >&2
  return 0
}

wait_for_port portal 3083 90
wait_for_port sse-keepalive 3081 30
wait_for_port survey 3082 30

'''


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__.split("用法：")[1].splitlines()[0].strip(), file=sys.stderr)
        return 2
    src, dst = sys.argv[1], sys.argv[2]
    text = open(src, encoding="utf-8").read()

    if MARKER in text:
        open(dst, "w", encoding="utf-8").write(text)
        print("UNCHANGED: 已含 wait_for_port，原样输出")
        return 0

    count = text.count(ANCHOR)
    assert count == 1, f"锚点出现 {count} 次（期望 1）: {ANCHOR!r}"
    assert text.count(CADDY_LAUNCH) == 1, "Caddy 启动语句不唯一"
    assert text.count("PORTAL_PORT=3083") == 1, "门户端口声明不唯一"

    out = text.replace(ANCHOR, ANCHOR + BLOCK)
    assert MARKER in out, "插入失败"
    assert out.index(MARKER) < out.index(CADDY_LAUNCH), "门禁必须在 Caddy 启动之前"
    assert out.index("wait_for_port portal 3083") < out.index(CADDY_LAUNCH)
    assert out.count("wait_for_port portal 3083") == 1

    with tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False, encoding="utf-8") as handle:
        handle.write(out)
        probe = handle.name
    subprocess.run(["bash", "-n", probe], check=True)
    open(dst, "w", encoding="utf-8").write(out)
    print(f"PATCHED: {len(text)} → {len(out)} bytes (+{len(out) - len(text)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
