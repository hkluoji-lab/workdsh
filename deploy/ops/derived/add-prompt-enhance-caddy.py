#!/usr/bin/env python3
"""派生 Caddyfile：在兜底 route 之前插入 /prompt-enhance/* 反代路由。

用法：add-prompt-enhance-caddy.py <in> <out>

背景（2026-10-01 定位）：
  dsh-prompt-enhance@0.2.7 的宿主路由 `/prompt-enhance/enhance[-stream]` 带
  loopback 围栏（src/loopback.ts#isTrustedRequest），四道判定：
    1) 不得出现 X-Forwarded-For / Forwarded 头
    2) socket 远端地址必须是 127.0.0.1 / ::1
    3) Host 头必须是 localhost / 127.0.0.1 / ::1（缺失则放行）
    4) Origin 若存在，其 hostname 也必须是上述回环名
  经 https://<域名> 访问时，Cloudflare→Caddy 链路上的 Host=dsh.10ge.cn、
  X-Forwarded-For 由 Caddy 注入、浏览器 POST 又自带
  Origin: https://dsh.10ge.cn，三条同时不满足 ⇒ 403
  {"ok":false,"error":{"code":"internal","message":"forbidden: loopback-only"}}。

  这与本部署既有的 @settings_api 是同一类问题、同一套解法：门禁照旧，
  只在最后一跳把上游看到的那几个头改写成回环形态，并在改写前用
  @unexpected_origin 顶掉跨站请求（Origin 必须为空或等于本站 origin）。

幂等：已含 `@prompt_enhance` 时原样输出。
"""
import sys

# 唯一出现一次的锚点：`@prompt_enhance` 本身在插入块里出现两次（定义 + route 引用）。
MARKER = "@prompt_enhance path"
ANCHOR = "\troute {\n"
INSERT = (
    "\t# 提示词增强（dsh-prompt-enhance）：插件宿主路由自带 loopback 围栏\n"
    "\t# （禁 X-Forwarded-For/Forwarded、socket 必须回环、Host 必须回环、\n"
    "\t#  Origin 必须与 Host 同源）。经域名访问时 Host/Origin/XFF 三条同时\n"
    "\t# 不满足 ⇒ 403 forbidden: loopback-only。与 @settings_api 同一套做法：\n"
    "\t# 门禁不变，仅在最后一跳改写成回环形态，并用 @unexpected_origin 挡跨站。\n"
    "\t@prompt_enhance path /prompt-enhance/*\n"
    "\troute @prompt_enhance {\n"
    "\t\timport portal_headers_strip\n"
    "\t\timport portal_gate\n"
    "\t\trespond @unexpected_origin \"Forbidden\" 403\n"
    "\t\treverse_proxy 127.0.0.1:3080 {\n"
    "\t\t\theader_up Host 127.0.0.1:3080\n"
    "\t\t\theader_up -Origin\n"
    "\t\t\theader_up -X-Forwarded-For\n"
    "\t\t\theader_up -Forwarded\n"
    "\t\t\theader_up -Authorization\n"
    "\t\t\tflush_interval -1\n"
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
    assert patched.count(MARKER) == 1, "prompt-enhance route missing"
    assert patched.index(MARKER) < patched.index(ANCHOR), "prompt-enhance route must precede the catch-all"
    assert braces(patched) == 0, "patched Caddyfile braces are not balanced"
    # 3080 上游本来就有三处：route @portal_root、route @settings_api、兜底 route。
    assert patched.count("reverse_proxy 127.0.0.1:3080") == 4, "dsh proxy count changed"
    assert patched.count("reverse_proxy 127.0.0.1:3081") == 1, "keepalive proxy disturbed"
    assert patched.count("reverse_proxy 127.0.0.1:3082") == 1, "survey proxy disturbed"
    # 门户上游只有 route @portal_public 那一处 reverse_proxy（另外两处是 forward_auth）。
    assert patched.count("reverse_proxy 127.0.0.1:3083") == 1, "portal proxy count changed"
    # 门禁 import 本来三处：@settings_api、/plugins/events、兜底 route。
    assert patched.count("import portal_gate\n") == 4, "portal gate import count changed"
    assert len(patched) == len(text) + len(INSERT), "unexpected size delta"

    with open(dst, "w", encoding="utf-8") as handle:
        handle.write(patched)
    print(f"patched Caddyfile: {len(text)} -> {len(patched)} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
