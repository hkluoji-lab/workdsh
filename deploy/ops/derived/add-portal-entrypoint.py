#!/usr/bin/env python3
"""派生 docker-entrypoint.sh：启动企业门户服务，并纳入 wait -n。

用法：add-portal-entrypoint.py <in> <out>

做三处改动：
  1. 在 unset 口令之前保留一份 portal_password（门户需要它派生会话签名密钥）；
  2. 在 Caddy 启动块之前插入门户服务启动（带容器内自动重启循环，避免门禁
     单点崩溃拖垮整站）；
  3. 把 portal_pid 加进 wait -n 的目标列表。

幂等：已含 /data/dsh/portal/src/server.mjs 时原样输出。
"""
import sys

RETAIN = 'portal_password="$auth_password"\n'
UNSET_ANCHOR = "unset HTTPS_ACCESS_HOST DSH_AUTH_USERNAME DSH_AUTH_PASSWORD auth_password\n"

LAUNCH = (
    "# 企业门户与登录门禁：/portal、/login、/logout、/api/portal/* 由 Caddy 反代到它；\n"
    "# 其余路径先经它校验会话。失败时容器内自动重启，避免门禁单点崩溃拖垮整站。\n"
    "(\n"
    "  while true; do\n"
    "    gosu node env HOME=/data/dsh/home \\\n"
    '      DSH_AUTH_USERNAME="$auth_username" \\\n'
    '      DSH_AUTH_PASSWORD="$portal_password" \\\n'
    "      PORTAL_BIND=127.0.0.1 \\\n"
    "      PORTAL_PORT=3083 \\\n"
    "      PORTAL_ASSETS_DIR=/data/dsh/portal/assets \\\n"
    "      node /data/dsh/portal/src/server.mjs\n"
    "    printf 'portal service exited (%s); restarting in 3s.\\n' \"$(date -Is)\" >&2\n"
    "    sleep 3\n"
    "  done\n"
    ") &\n"
    "portal_pid=$!\n"
    'pids+=("$portal_pid")\n'
    "\n"
)

CADDY_ANCHOR = "gosu caddy env \\\n"
WAIT_OLD = 'wait -n "$dsh_pid" "$caddy_pid" "$keepalive_pid" "$survey_pid" || status=$?\n'
WAIT_NEW = 'wait -n "$dsh_pid" "$caddy_pid" "$keepalive_pid" "$survey_pid" "$portal_pid" || status=$?\n'
MARKER = "/data/dsh/portal/src/server.mjs"


def main() -> int:
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8") as handle:
        text = handle.read()

    if MARKER in text:
        with open(dst, "w", encoding="utf-8") as handle:
            handle.write(text)
        print("already patched; copied unchanged")
        return 0

    for anchor in (UNSET_ANCHOR, CADDY_ANCHOR, WAIT_OLD):
        if text.count(anchor) != 1:
            raise SystemExit(f"expected exactly one anchor {anchor!r}, found {text.count(anchor)}")

    patched = text.replace(UNSET_ANCHOR, RETAIN + UNSET_ANCHOR, 1)
    patched = patched.replace(CADDY_ANCHOR, LAUNCH + CADDY_ANCHOR, 1)
    patched = patched.replace(WAIT_OLD, WAIT_NEW, 1)

    assert patched.count(RETAIN) == 1, "portal_password retention missing or duplicated"
    assert patched.index(RETAIN) < patched.index(UNSET_ANCHOR), "portal_password must be set before unset"
    assert patched.count(MARKER) == 1, "portal launch missing"
    assert patched.count(WAIT_NEW) == 1, "wait -n not updated once"
    assert patched.count("gosu caddy env \\\n") == 1, "caddy launch disturbed"
    assert patched.count("sse-keepalive.mjs") == 1, "keepalive launch disturbed"
    assert patched.count("survey/server.mjs") == 1, "survey launch disturbed"
    assert patched.count("while true; do") == 2, "restart loop count changed"
    expected = len(text) + len(RETAIN) + len(LAUNCH) + len(WAIT_NEW) - len(WAIT_OLD)
    assert len(patched) == expected, f"unexpected size delta: {len(patched)} != {expected}"

    with open(dst, "w", encoding="utf-8") as handle:
        handle.write(patched)
    print(f"patched entrypoint: {len(text)} -> {len(patched)} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
