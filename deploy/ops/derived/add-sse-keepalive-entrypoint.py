#!/usr/bin/env python3
"""派生 docker-entrypoint.sh：在 Caddy 之前启动 SSE 保活中继，并把它纳入 wait -n。

用法：add-sse-keepalive-entrypoint.py <in> <out>

只做两处改动：在 caddy 启动块之前插入中继启动；把 wait -n 的目标加上 keepalive_pid。
中继意外退出时容器随 restart policy 重启（与 dsh/caddy 一致的 fail-fast）。
幂等：已含中继启动时原样输出。
"""
import sys

RELAY_LAUNCH = (
    "# SSE keepalive relay: /plugins/events is proxied through it so the idle stream\n"
    "# stops being reclaimed by the office egress (~127s). See ADR-0028.\n"
    "gosu node env HOME=/data/dsh/home \\\n"
    "  node /data/dsh/tmp/sse-keepalive.mjs &\n"
    "keepalive_pid=$!\n"
    'pids+=("$keepalive_pid")\n'
    "\n"
)

ANCHOR = "gosu caddy env \\\n"
WAIT_OLD = 'wait -n "$dsh_pid" "$caddy_pid" || status=$?\n'
WAIT_NEW = 'wait -n "$dsh_pid" "$caddy_pid" "$keepalive_pid" || status=$?\n'
MARKER = "sse-keepalive.mjs"


def main() -> int:
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8") as handle:
        text = handle.read()

    if MARKER in text:
        with open(dst, "w", encoding="utf-8") as handle:
            handle.write(text)
        print("already patched; copied unchanged")
        return 0

    if text.count(ANCHOR) != 1:
        raise SystemExit(f"expected exactly one caddy launch anchor, found {text.count(ANCHOR)}")
    if text.count(WAIT_OLD) != 1:
        raise SystemExit(f"expected exactly one wait -n line, found {text.count(WAIT_OLD)}")

    patched = text.replace(ANCHOR, RELAY_LAUNCH + ANCHOR, 1)
    patched = patched.replace(WAIT_OLD, WAIT_NEW, 1)

    assert MARKER in patched, "relay launch missing"
    assert 'wait -n "$dsh_pid" "$caddy_pid" "$keepalive_pid"' in patched, "wait -n not updated"
    assert patched.count("gosu caddy env \\\n") == 1, "caddy launch disturbed"
    assert patched.count(WAIT_NEW) == 1, "wait line duplicated"
    assert len(patched) == len(text) + len(RELAY_LAUNCH) + len(WAIT_NEW) - len(WAIT_OLD), (
        "unexpected size delta"
    )

    with open(dst, "w", encoding="utf-8") as handle:
        handle.write(patched)
    print(f"patched entrypoint: {len(text)} -> {len(patched)} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
