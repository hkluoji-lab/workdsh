#!/usr/bin/env python3
"""派生 Caddyfile：把 /plugins/events 的 SSE 上游改指向保活中继（127.0.0.1:3081）。

用法：add-sse-keepalive.py <in> <out>

只新增一段 route（位于 catch-all route 之前，Caddy 的 route 按顺序匹配），
不改动任何既有指令。幂等：已含该 route 时原样输出。
"""
import sys

RELAY_BLOCK = (
    "\troute /plugins/events {\n"
    "\t\treverse_proxy 127.0.0.1:3081 {\n"
    "\t\t\theader_up -Authorization\n"
    "\t\t\tflush_interval -1\n"
    "\t\t}\n"
    "\t}\n"
    "\n"
)

ANCHOR = "\troute {\n"
MARKER = "route /plugins/events"


def main() -> int:
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8") as handle:
        text = handle.read()

    if MARKER in text:
        with open(dst, "w", encoding="utf-8") as handle:
            handle.write(text)
        print("already patched; copied unchanged")
        return 0

    found = text.count(ANCHOR)
    if found != 1:
        raise SystemExit(f"expected exactly one catch-all route anchor, found {found}")

    patched = text.replace(ANCHOR, RELAY_BLOCK + ANCHOR, 1)

    assert "reverse_proxy 127.0.0.1:3081" in patched, "relay route missing"
    assert patched.count(ANCHOR) == 1, "catch-all route lost"
    assert patched.count("{") == patched.count("}"), "unbalanced braces"
    assert patched.count('"') == text.count('"'), "quote count changed"
    assert patched.count("reverse_proxy 127.0.0.1:3080") == text.count(
        "reverse_proxy 127.0.0.1:3080"
    ), "existing upstreams changed"
    assert len(patched) == len(text) + len(RELAY_BLOCK), "unexpected size delta"

    with open(dst, "w", encoding="utf-8") as handle:
        handle.write(patched)
    print(f"patched Caddyfile: {len(text)} -> {len(patched)} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
