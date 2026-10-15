#!/usr/bin/env python3
"""从官方 Caddyfile 派生「无 Basic Auth」版本：仅删除 basic_auth 块，其余字节不动。"""
import sys

BLOCK_START = "basic_auth"


def strip_basic_auth(text):
    out = []
    removed = []
    state = 0  # 0=正常 1=块内 2=刚闭合（用于吃掉块后的空行）
    for line in text.split("\n"):
        stripped = line.strip()
        if state == 0:
            if stripped.startswith(BLOCK_START):
                state = 1
                removed.append(line)
                continue
            out.append(line)
            continue
        if state == 1:
            removed.append(line)
            if stripped == "}":
                state = 2
            continue
        state = 0
        if stripped == "":
            continue
        out.append(line)
    return "\n".join(out), removed


src = open(sys.argv[1], encoding="utf-8").read()
dst, removed = strip_basic_auth(src)

assert len(removed) == 3, "期望删除 3 行，实际 %d 行：%r" % (len(removed), removed)
assert removed[0].strip().startswith(BLOCK_START), "首行不是 basic_auth 块起始"
assert removed[-1].strip() == "}", "末行不是块闭合"
assert "basic_auth" not in dst, "basic_auth 未被移除"
assert dst.count("{") == dst.count("}"), "派生文件花括号不配平"
assert "reverse_proxy" in dst and "tls internal" in dst, "派生文件缺少关键指令"
assert len(src.splitlines()) - len(dst.splitlines()) <= 4, "删除行数超出预期"

open(sys.argv[2], "w", encoding="utf-8").write(dst)
print("OK removed_lines=%d removed_bytes=%d" % (len(removed), len(src) - len(dst)))
for line in removed:
    print("  -| %s" % line)
