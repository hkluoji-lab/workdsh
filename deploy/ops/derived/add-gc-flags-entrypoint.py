#!/usr/bin/env python3
"""派生 entrypoint：把 V8 并发 GC 缓解旗标注入 dsh 启动行（2026-11-14）。

用法：add-gc-flags-entrypoint.py <in> <out>

背景：
  线上 dsh 主进程反复因 V8 并发标记 GC 缺陷 SIGSEGV（2026-11-14 当日 13 次）。
  根因与最小复现见 workdsh docs/evidence/v8-gc-sigsegv-repro.md。该缺陷跨
  v22 / v24 / v26 三个 Node 主版本存在，macOS arm64 不复现；旗标矩阵实验
  （同文件 §5.1）证明**没有任何旗标组合能把崩溃率降到 0**——因此本改动是
  **降频缓解，不是修复**。

  2026-11-07 曾把同样的旗标加在 `/data/dsh/runtime/bin/node` 包装器的 exec 行，
  但该 runtime 目录连同包装器已不存在（当前 entrypoint 直接调用镜像自带
  /usr/local/bin/node，v24.22.2）。本次改为注入 entrypoint 启动行，使缓解
  不再依赖自造运行时，也不引入第二份 node 二进制。

  不可用 NODE_OPTIONS：实测 v24.22.2 拒绝 V8 旗标进入 NODE_OPTIONS
  （`--no-concurrent-marking is not allowed in NODE_OPTIONS`）。

改动（最小侵入，仅一处）：
  `node --expose-internals .../dsh/lib/bin.js` ->
  `node --no-concurrent-marking --no-concurrent-sweeping --expose-internals .../dsh/lib/bin.js`

代价：并发标记/清扫收回主线程，GC 停顿变长。效果须以崩溃计数回归验证
（主机侧 /usr/local/bin/dsh-crash-watch.sh 逐条留档，crash.log 的 gcFlags
字段即用于分离「有旗标 / 无旗标」两臂）。

幂等：已含 GC_CONCURRENT_FLAGS_V1 标记时原样输出。

回滚：cp -p docker-entrypoint.sh.bak.gcflags.<时间戳> docker-entrypoint.sh
      然后 docker compose up -d --force-recreate（挂载的是文件，须重建换 inode）。
"""
import sys

MARKER = "GC_CONCURRENT_FLAGS_V1"

OLD = "node --expose-internals /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js"
NEW = (
    "node --no-concurrent-marking --no-concurrent-sweeping --expose-internals "
    "/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js"
)


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    src, dst = sys.argv[1], sys.argv[2]
    text = open(src, encoding="utf-8").read()

    if MARKER not in text and "--no-concurrent-marking" not in text:
        assert text.count(OLD) == 1, (
            f"dsh 启动行锚点不唯一（count={text.count(OLD)}），拒绝改写"
        )
        # GC_CONCURRENT_FLAGS_V1（2026-11-14）：把并发标记/清扫收回主线程，
        # 收窄 V8 GC 竞态窗口。只降频、不修复，见文件头说明。
        text = text.replace(OLD, NEW, 1)

    assert NEW in text, "改写后缺少 GC 缓解旗标"
    assert "bin.js" in text, "改写后缺少 dsh 启动入口"
    open(dst, "w", encoding="utf-8").write(text)
    print(f"ok: wrote {dst} ({len(text)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
