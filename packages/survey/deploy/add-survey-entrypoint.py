#!/usr/bin/env python3
"""派生 docker-entrypoint.sh：启动问卷收集服务，并纳入 wait -n。

用法：add-survey-entrypoint.py <in> <out>

只做两处改动：
  1. 在 Caddy 启动块之前插入收集服务启动（带容器内自动重启循环，避免
     单次崩溃直接拖垮整个容器）；
  2. 把 survey_pid 加进 wait -n 的目标列表。

幂等：已含 survey/server.mjs 时原样输出。
"""
import sys

LAUNCH = (
    "# 调研问卷收集服务：/survey 由 Caddy 反代到它。失败时容器内自动重启，\n"
    "# 避免采集服务单点崩溃把整个工作台一起带走。\n"
    "(\n"
    "  while true; do\n"
    "    gosu node env HOME=/data/dsh/home \\\n"
    "      node /data/dsh/survey/server.mjs\n"
    "    printf 'survey collector exited (%s); restarting in 3s.\\n' \"$(date -Is)\" >&2\n"
    "    sleep 3\n"
    "  done\n"
    ") &\n"
    "survey_pid=$!\n"
    'pids+=("$survey_pid")\n'
    "\n"
)

ANCHOR = "gosu caddy env \\\n"
WAIT_OLD = 'wait -n "$dsh_pid" "$caddy_pid" "$keepalive_pid" || status=$?\n'
WAIT_NEW = 'wait -n "$dsh_pid" "$caddy_pid" "$keepalive_pid" "$survey_pid" || status=$?\n'
MARKER = "survey/server.mjs"


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

    patched = text.replace(ANCHOR, LAUNCH + ANCHOR, 1)
    patched = patched.replace(WAIT_OLD, WAIT_NEW, 1)

    assert MARKER in patched, "collector launch missing"
    assert patched.count(WAIT_NEW) == 1, "wait -n not updated once"
    assert patched.count("gosu caddy env \\\n") == 1, "caddy launch disturbed"
    assert patched.count("sse-keepalive.mjs") == 1, "keepalive launch disturbed"
    assert patched.count("while true; do") == 1, "restart loop duplicated"
    assert len(patched) == len(text) + len(LAUNCH) + len(WAIT_NEW) - len(WAIT_OLD), "unexpected size delta"

    with open(dst, "w", encoding="utf-8") as handle:
        handle.write(patched)
    print(f"patched entrypoint: {len(text)} -> {len(patched)} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
