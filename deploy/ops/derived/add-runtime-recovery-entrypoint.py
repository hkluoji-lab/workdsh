#!/usr/bin/env python3
"""派生 entrypoint：运行期重启补齐「无主凭据锁回收 + 更短中断」（2026-10-02）。

用法：add-runtime-recovery-entrypoint.py <in> <out>

背景：
  DSH_RUNTIME_SUPERVISION_BLOCK_V1 让 dsh 在就绪之后 SIGSEGV 也能原地重拉，但它直接调
  `start_dsh`，**没有**走启动路径里的 `reap_stale_cred_locks`。后果：
  一次运行期崩溃若遗留 /data/dsh/.credentials.yaml.lock，新进程会卡在必需插件
  `connection` 的启动超时上 —— 容器进程活着、3080 始终不监听、公网持续 502，
  而该循环只重启一次便回到 `wait -n`，不会再自愈。
  这正是 2026-10-01 「容器在跑但一直 502」那一类故障的同一根因，只是发生在运行期。

改动（最小侵入，不动 wait/exit 语义）：
  1) `sleep 3` -> `sleep 1`：把崩溃后的空窗压到最短（后面由 Caddy 侧 lb_try_duration 覆盖）。
  2) 在 `start_dsh` 前补一次 `reap_stale_cred_locks`，与启动路径对齐。

幂等：已含 RUNTIME_CRED_LOCK_REAP_V1 时原样输出。
"""
import sys

MARKER = "RUNTIME_CRED_LOCK_REAP_V1"

OLD = (
    "  printf 'dsh exited after startup (status %s, %s); restarting dsh in 3s (container stays up).\\n' \\\n"
    "    \"$status\" \"$(date -Is)\" >&2\n"
    "  sleep 3\n"
    "  start_dsh\n"
)

NEW = (
    "  printf 'dsh exited after startup (status %s, %s); restarting dsh in 1s (container stays up).\\n' \\\n"
    "    \"$status\" \"$(date -Is)\" >&2\n"
    "  sleep 1\n"
    "  # RUNTIME_CRED_LOCK_REAP_V1（2026-10-02）：运行期重启必须与启动路径一样先回收无主凭据锁，\n"
    "  # 否则一旦遗留 .credentials.yaml.lock，新进程会卡在必需插件 connection 的启动超时上，\n"
    "  # 表现为「容器在跑、3080 始终不监听、公网持续 502」且不再自愈。\n"
    "  reap_stale_cred_locks\n"
    "  start_dsh\n"
)


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    src, dst = sys.argv[1], sys.argv[2]
    text = open(src, encoding="utf-8").read()

    if MARKER not in text:
        assert text.count(OLD) == 1, f"运行期重启锚点不唯一（count={text.count(OLD)}），拒绝改写"
        text = text.replace(OLD, NEW, 1)

    assert "reap_stale_cred_locks\n  start_dsh" in text, "改写后缺少锁回收调用"
    open(dst, "w", encoding="utf-8").write(text)
    print(f"ok: wrote {dst} ({len(text)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
