#!/usr/bin/env python3
"""派生 Caddyfile：在兜底 route 之前插入 /survey 反代路由。

用法：add-survey-caddy.py <in> <out>

只做一处改动：在兜底的 `route { ... }`（反代 3080）之前，插入一条
`route @survey { reverse_proxy 127.0.0.1:3082 }`。Caddy 同名指令按文件中
出现顺序执行，且 route 是终止性的，因此 /survey 会先于兜底被命中。

幂等：已含 3082 反代时原样输出。
"""
import sys

MARKER = "127.0.0.1:3082"
ANCHOR = "\troute {\n"
INSERT = (
    "\t# 调研问卷：静态页 + 提交 API，见 data/dsh/survey/README.md\n"
    "\t@survey path /survey /survey/*\n"
    "\troute @survey {\n"
    "\t\treverse_proxy 127.0.0.1:3082 {\n"
    "\t\t\theader_up -Authorization\n"
    "\t\t}\n"
    "\t}\n"
    "\n"
)


def braces(text: str) -> int:
    return text.count("{") - text.count("}")


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
        raise SystemExit(f"expected exactly one catch-all route anchor, found {text.count(ANCHOR)}")
    if braces(text) != 0:
        raise SystemExit("source Caddyfile braces are not balanced")

    patched = text.replace(ANCHOR, INSERT + ANCHOR, 1)

    assert patched.count(ANCHOR) == 1, "catch-all route disturbed"
    assert patched.count(MARKER) == 1, "survey proxy missing"
    assert patched.index("@survey") < patched.index(ANCHOR), "survey route must precede the catch-all"
    assert braces(patched) == 0, "patched Caddyfile braces are not balanced"
    # 3080 上游本来就有两处：route @settings_api 与兜底 route。插入后仍应只有这两处。
    assert patched.count("reverse_proxy 127.0.0.1:3080") == 2, "dsh proxy count changed"
    assert patched.count("reverse_proxy 127.0.0.1:3081") == 1, "keepalive proxy disturbed"
    assert "route {\n\t\treverse_proxy 127.0.0.1:3080 {\n\t\t\theader_up -Authorization\n" in patched, (
        "catch-all block content changed"
    )
    assert len(patched) == len(text) + len(INSERT), "unexpected size delta"

    with open(dst, "w", encoding="utf-8") as handle:
        handle.write(patched)
    print(f"patched Caddyfile: {len(text)} -> {len(patched)} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
