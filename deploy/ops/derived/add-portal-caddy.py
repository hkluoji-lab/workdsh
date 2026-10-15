#!/usr/bin/env python3
"""派生 Caddyfile：接入企业门户与登录门禁（ADR-0034）。

用法：add-portal-caddy.py <in> <out>

做三处改动：
  1. 在顶层全局块之后定义两个 snippet：portal_gate / portal_gate_root；
  2. 在 `route @settings_api` 之前插入门户公开面与根路径两条 route；
  3. 在既有三条受保护 route 的首行插入 `import portal_gate`。

`route @survey` 刻意不加门禁：/survey 是标注「可公开」的问卷填写入口。
Caddy 同名指令按文件中出现顺序执行且 route 是终止性的，因此门户公开面
会先于兜底被命中。

幂等：已含 127.0.0.1:3083 时原样输出。
"""
import sys

MARKER = "127.0.0.1:3083"
GLOBAL_END = "\tskip_install_trust\n}\n"

SNIPPETS = (
    "\n"
    "# 登录门禁（ADR-0034）：未登录时按调用点决定去向。\n"
    "# 工作区与 API 回登录页并带回跳；根路径先给门户首页。\n"
    "(portal_gate) {\n"
    "\tforward_auth 127.0.0.1:3083 {\n"
    "\t\turi /api/portal/auth\n"
    "\t\t@unauth status 401\n"
    "\t\thandle_response @unauth {\n"
    "\t\t\tredir * /login?next={http.request.uri.path} 302\n"
    "\t\t}\n"
    "\t}\n"
    "}\n"
    "\n"
    "(portal_gate_root) {\n"
    "\tforward_auth 127.0.0.1:3083 {\n"
    "\t\turi /api/portal/auth\n"
    "\t\t@unauth status 401\n"
    "\t\thandle_response @unauth {\n"
    "\t\t\tredir * /portal 302\n"
    "\t\t}\n"
    "\t}\n"
    "}\n"
)

PUBLIC_ROUTES = (
    "\t# 门户公开面：静态页与登录/退出/会话校验 API，由门户服务处理，不经过门禁。\n"
    "\t@portal_public path /portal /portal/* /login /logout /api/portal/*\n"
    "\troute @portal_public {\n"
    "\t\treverse_proxy 127.0.0.1:3083 {\n"
    "\t\t\theader_up -Authorization\n"
    "\t\t}\n"
    "\t}\n"
    "\n"
    "\t# 根路径：已登录放行工作台；未登录交给门户首页（门户自身 302 → /portal）。\n"
    "\t@portal_root path / /index.html\n"
    "\troute @portal_root {\n"
    "\t\timport portal_gate_root\n"
    "\t\treverse_proxy 127.0.0.1:3080 {\n"
    "\t\t\theader_up -Authorization\n"
    "\t\t}\n"
    "\t}\n"
    "\n"
)

GATE_LINE = "\t\timport portal_gate\n"

SETTINGS_ANCHOR = "\troute @settings_api {\n"
EVENTS_ANCHOR = "\troute /plugins/events {\n"
CATCHALL_ANCHOR = "\troute {\n"


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

    for anchor in (GLOBAL_END, SETTINGS_ANCHOR, EVENTS_ANCHOR, CATCHALL_ANCHOR):
        if text.count(anchor) != 1:
            raise SystemExit(f"expected exactly one anchor {anchor!r}, found {text.count(anchor)}")
    if braces(text) != 0:
        raise SystemExit("source Caddyfile braces are not balanced")
    assert text.count("reverse_proxy 127.0.0.1:3080") == 2, "unexpected dsh proxy count in source"

    patched = text.replace(GLOBAL_END, GLOBAL_END + SNIPPETS, 1)
    patched = patched.replace(SETTINGS_ANCHOR, PUBLIC_ROUTES + SETTINGS_ANCHOR, 1)
    for anchor in (SETTINGS_ANCHOR, EVENTS_ANCHOR, CATCHALL_ANCHOR):
        patched = patched.replace(anchor, anchor + GATE_LINE, 1)

    assert patched.count(MARKER) == 3, "portal endpoints missing"
    assert patched.count("(portal_gate) {") == 1, "portal_gate snippet missing"
    assert patched.count("(portal_gate_root) {") == 1, "portal_gate_root snippet missing"
    assert patched.count("import portal_gate\n") == 3, "portal_gate imports wrong"
    assert patched.count("import portal_gate_root\n") == 1, "portal_gate_root import wrong"
    assert patched.count("@portal_public") == 2, "portal public matcher wrong"
    # 门禁必须覆盖三条受保护 route，且 @survey 不在其中。
    assert patched.count(GATE_LINE) == 3, "gate line count changed"
    assert "\troute @survey {\n\t\treverse_proxy" in patched, "survey route must stay ungated"
    assert patched.index("@portal_public") < patched.index(SETTINGS_ANCHOR), "portal route must precede settings"
    assert braces(patched) == 0, "patched Caddyfile braces are not balanced"
    # 3080 上游现有三处：@settings_api、@portal_root、兜底。
    assert patched.count("reverse_proxy 127.0.0.1:3080") == 3, "dsh proxy count changed"
    assert patched.count("reverse_proxy 127.0.0.1:3081") == 1, "keepalive proxy disturbed"
    assert patched.count("reverse_proxy 127.0.0.1:3082") == 1, "survey proxy disturbed"
    assert "\troute {\n\t\timport portal_gate\n\t\treverse_proxy 127.0.0.1:3080 {\n" in patched, (
        "catch-all block content changed"
    )
    expected = len(text) + len(SNIPPETS) + len(PUBLIC_ROUTES) + 3 * len(GATE_LINE)
    assert len(patched) == expected, f"unexpected size delta: {len(patched)} != {expected}"

    with open(dst, "w", encoding="utf-8") as handle:
        handle.write(patched)
    print(f"patched Caddyfile: {len(text)} -> {len(patched)} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
