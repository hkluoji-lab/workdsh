#!/usr/bin/env python3
"""派生 Caddyfile：修两处认证边界问题（2026-10-02 审计发现）。

用法：add-register-and-gate-caddy.py <in> <out>

问题 1（注册死循环）：
  portal.env 里 PORTAL_REGISTRATION=invite（注册本应可用，且已配邀请码），
  登录页也渲染了「注册」链接指向 /register。但 Caddy 的公开白名单
     @portal_public path /portal /portal/* /login /logout /api/portal/*
  不含 /register —— 未登录访问 /register 会被 forward_auth 判 401 后重定向回
  /login?next=/register，形成死循环，注册表单永远到不了。

问题 2（裸 401）：
  门户首页直接链接 /portal/zengzhi/admin。该路径不在门户的服务端改写名单里
  （server.mjs 只改写 /portal/admin 与 /api/portal/admin/*），于是未登录时
  直接返回 9 字节裸文本「未登录」，而不是跳登录页。对照 /portal/admin 会正确
  302 到 /login。此处用同一套 portal_gate 给它补上门禁。

幂等：已含 REGISTER_AND_GATE_V1 时原样输出。
"""
import sys

MARK = "REGISTER_AND_GATE_V1"

OLD_PUBLIC = "\t@portal_public path /portal /portal/* /login /logout /api/portal/*\n"
NEW_PUBLIC = OLD_PUBLIC + (
    "\t# REGISTER_AND_GATE_V1：/register 必须公开，否则注册链接会 401->重定向回登录页，形成死循环。\n"
    "\t@portal_register path /register\n"
    "\troute @portal_register {\n"
    "\t\treverse_proxy 127.0.0.1:3083 {\n"
    "\t\t\theader_up -Authorization\n"
    "\t\t}\n"
    "\t}\n"
    "\n"
    "\t# REGISTER_AND_GATE_V1：/portal/<产品>/admin 未登录时应跳登录页，而不是裸 401「未登录」。\n"
    "\t# 正则刻意不匹配 /portal/admin（那条已由门户服务端改写处理）。\n"
    "\t@portal_product_admin path_regexp portal_admin ^/portal/[A-Za-z0-9_-]+/admin(/.*)?$\n"
    "\troute @portal_product_admin {\n"
    "\t\timport portal_headers_strip\n"
    "\t\timport portal_gate\n"
    "\t\treverse_proxy 127.0.0.1:3083 {\n"
    "\t\t\theader_up -Authorization\n"
    "\t\t}\n"
    "\t}\n"
    "\n"
)


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__); return 2
    src, dst = sys.argv[1], sys.argv[2]
    s = open(src, encoding="utf-8").read()
    if MARK not in s:
        assert s.count(OLD_PUBLIC) == 1, f"@portal_public 锚点不唯一（{s.count(OLD_PUBLIC)}）"
        s = s.replace(OLD_PUBLIC, NEW_PUBLIC, 1)
    assert s.count("{") == s.count("}"), "花括号不配平，拒绝写出"
    assert "/register" in s and "portal_product_admin" in s
    open(dst, "w", encoding="utf-8").write(s)
    print(f"ok: wrote {dst} ({len(s)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
