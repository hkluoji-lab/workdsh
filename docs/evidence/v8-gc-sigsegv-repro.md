# V8 并发标记 GC SIGSEGV：最小复现与现场分析

本文件是为上报 Node.js / V8 上游而整理的自包含材料。全部数据来自 2026-09-17 / 09-18 在一台
Linux 服务器上的实测，未做推测性填充；凡未验证的部分均在「未排除」一节显式标注。

## 1. 摘要

在 Linux x86_64、Node.js **v24.21.0（V8 13.6.233.17-node.53）** 上，一个 **约 20 行、零依赖的纯 JS
负载**可以稳定触发 SIGSEGV，故障点固定在：

```
MarkingVisitorBase<ConcurrentMarkingVisitor>::ProcessStrongHeapObject<FullHeapObjectSlot>
```

故障线程是 `node::PlatformWorkerThread`（V8 平台工作线程池），故障指令在同一 node 二进制上恒为
`0xe971d9`（`mov (%r14),%rax`，前一条是 `and $0xfffffffffffc0000,%r14`，即把传入的 HeapObject
掩码成 256 KiB 页基址后解引用）。实测崩溃率约 35%（7/20），**不需要** `--stress-compaction`、
**不需要** 任何原生 addon、**不需要** Node 主进程业务代码。

同一脚本在 macOS arm64、V8 13.6.233.17-node.**48** 上 **0/20 崩溃**（含进一步加压的 0/5），因此
该问题与平台强相关，但当前证据**不足以区分**是 CPU 架构（x86_64）还是操作系统（Linux）导致。

## 2. 环境

| 角色 | 平台 | Node | V8 | ABI |
|---|---|---|---|---|
| 复现 | Linux x86_64，20 核，Docker（`node` 官方二进制，sha256 与上游一致） | v24.21.0 | 13.6.233.17-node.53 | 137 |
| 复现（另一运行时） | 同机，宿主 `/usr/bin/node` | v22.22.2 | 12.4.254.21-node.39 | 127 |
| 对照 | macOS 15.7.5，arm64 | v24.15.0 | 13.6.233.17-node.**48** | — |

复现环境所用 node 二进制与上游官方包 sha256 完全一致
（`7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c`），非自编译。

## 3. 最小复现器

```js
// biggc.js —— 零依赖，纯 JS
const keep = [];
for (let i = 0; i < 400000; i++) {
  keep.push({ i, s: 'str' + i, arr: [i, i + 1] });
}
for (let k = 0; k < 300; k++) {
  global.gc({ type: 'major' });
}
console.log('alive', process.version, Math.round(process.memoryUsage().heapUsed / 1048576) + 'MB');
```

运行方式：

```
node --expose-gc biggc.js
```

- 存活堆约 **62 MB**，每轮约 **300 次** 老生代 Mark-Compact。
- 复现环境的观测：N=5 时 2/5；作为旗标矩阵基线 N=10 时 8/10；N=20 时 **7/20**。
- 对照环境（macOS arm64）：**0/20**。把堆加大到约 119 MB、GC 加到 400 次后仍是 **0/5**。

触发条件可归纳为「**较大的存活堆 + 反复老生代 Mark-Compact**」，与 GC 次数本身关系较弱：
零分配的对照脚本（`while` 空转 3 秒）在同一夹具下累计约 6000 次 Mark-Compact 仍 0/8 崩溃。

### 3.1 与线上生产现场的同一性

该最小复现器并非「另一个 bug」：它的崩溃栈与线上生产进程的现场**逐帧一致**（含同一条故障指令）：

```
#0  0x0000000000e971d9  MarkingVisitorBase<ConcurrentMarkingVisitor>::ProcessStrongHeapObject<FullHeapObjectSlot>(...)
#1  0x0000000000e975b2  BodyDescriptorBase::IteratePointers<ConcurrentMarkingVisitor>(...)
#2  0x0000000000e9b554  ConcurrentMarking::RunMajor(...)
#3  0x0000000000e9d4dc  ConcurrentMarking::JobTaskMajor::Run(...)
#4  0x000000000207da55  v8::platform::DefaultJobWorker::Run()
#5  0x00000000009de618  node::(anonymous namespace)::PlatformWorkerThread(void*)
```

## 4. 现场数据

故障瞬间（gdb 附加，`handle SIGSEGV stop print nopass`）：

- `Thread 5 "V8Worker" received signal SIGSEGV, Segmentation fault.`
- `rip = 0xe971d9`（即 `ProcessStrongHeapObject<FullHeapObjectSlot>+41`）
- 寄存器：`r12 = rcx = 0x000071f5df19c8f1`，`r14 = 0x000071f5df180000`
  （`r14` 恰为 `r12` 掩码 256 KiB 后的页基址，与故障指令前的 `and $0xfffffffffffc0000,%r14` 吻合）
- 取故障瞬间的 `/proc/<pid>/maps`（843 条映射）做归属分类：**`r12`、`r14` 两者都不落在任何映射内**，
  落在 `0x3fc677640000-0x7f45d4000000` 的空洞（约 69 TiB）中
- `r12` 低位为 1（按 V8 表示法像 Smi），但数值远超 31 位 Smi 范围，不是可用标记值
- 另有一次现场（同一进程族、默认旗标）落在同一函数同一指令，寄存器形态相同

同一服务器上，对生产进程用 80 ms 间隔采样 `/proc/<pid>/maps` 得到的结论：故障页**从未映射**
（`grep -c` = 0），排除「页面被回收」这一解释。

### 4.1 故障点跨 GC 子系统

在确定性夹具下另抓到 4 个现场，故障线程**全部**是 `PlatformWorkerThread`，但落在三个子系统：

| # | 故障函数 | 子系统 |
|---|---|---|
| 1 | `Sweeper::RawSweep` → `HeapObject::SizeFromMap`（`rcx=0x19`） | 清扫 |
| 2 | `ConcurrentMarking::RunMajor` → `HasBytecodeArrayForFlushing` | 并发标记 |
| 3 | `ConcurrentMarking::RunMajor` → `ProcessStrongHeapObject<FullHeapObjectSlot>` | 并发标记 |
| 4 | `Evacuator::RawEvacuatePage` → … → `SharedFunctionInfo::BodyDescriptor::IterateBody<RecordMigratedSlotVisitor>` | 压缩 / 迁移 |

这说明不是某条遍历链的局部错误，而是**被遍历的对象引用本身在 GC 期间失效**。

## 5. 已排除

| 假设 | 实验 | 结果 |
|---|---|---|
| 原生 addon 内存破坏 | 用 `process.dlopen` 桩把 `.node` 全部中性化（插件树仍完整加载） | 崩溃率未下降（10/12 vs 对照 6/12），**排除** |
| 业务/第三方 JS 代码 | 上述最小复现器（不含任何业务代码、零依赖） | 同样崩溃，**排除** |
| `--stress-compaction` | 最小复现器只用 `--expose-gc` + 显式 major GC | 同样崩溃，**该旗标只是加速器** |
| Node 主版本 | 换 v22.22.2（V8 12.4）同一夹具 | 8/8 仍崩，**排除「13.6 回归」** |
| V8 旗标可规避 | 见下 | **无任何单旗标或组合将崩溃率降到 0** |
| `--verify-heap` / `--track-heap-objects` | 全程无任何 V8 断言，进程始终以裸 SIGSEGV 退出 | 失效对象不在堆校验覆盖范围内 |

### 5.1 旗标矩阵

夹具为上述 `biggc.js`。N=10 一轮后，对表现最好的单旗标与组合做了 N=20 复核：

| 旗标 | N=10 崩溃 | N=20 崩溃 |
|---|---|---|
| 基线 `--expose-gc` | 8/10 | **7/20** |
| `--no-concurrent-marking` | 5/10 | — |
| `--no-concurrent-sweeping` | 5/10 | — |
| `--predictable` | 4/10 | — |
| `--no-parallel-marking` | 2/10 | — |
| `--jitless` | 2/10 | — |
| `--no-incremental-marking` | 1/10 | **6/20** |
| `--single-threaded` | 1/10 | — |
| `--no-incremental-marking --no-parallel-marking` | — | **4/20** |
| 以上四个 no-\* 全开 | — | **8/20** |

**N=10 出现的 1/10、2/10 是小样本假象**：N=20 复核后全部落在 20%—40% 区间，与基线 35% 无统计
显著差异（Fisher 精确检验，7/20 vs 4/20 → p≈0.48）。**关键结论是没有任何组合给出 0 崩溃**——
若某旗标真能规避，20 次运行应全部正常。

## 6. 未排除

- **架构 vs 操作系统未分离**。macOS arm64 不崩，但复现环境是 Linux x86_64，两个变量同时变化。
  做 x86_64 macOS（Rosetta）对照需要下载 x64 node 二进制，而本次实验中下载源（`nodejs.org`）在
  两台机器上都无法解析，未能执行。
- **是否为上游已知问题未核实**。未检索 V8 / Node issue tracker（同样受网络限制），故本文件不声称
  这是新发现，只提供可复现性与现场。
- macOS 对照所用 V8 补丁号（-node.48）与复现环境（-node.53）不同，严格来说不是「同版本跨平台」，
  但二者同属 13.6.233.17。
- 未在第三台机器上复现，因此「该服务器特有的内核 / 内存子系统」这一可能未被独立排除。

## 7. 建议的排查方向

1. `ConcurrentMarking` 在标记工作列表（worklist / bailout）与对象可达性判定上的边界条件；故障
   现场横跨清扫 / 标记 / 迁移三个子系统，指向**对象引用生命周期**而非单条遍历链。
2. 平台差异：x86_64 与 arm64 在内存模型、页大小、弱内存序重排上的差异，是否会使某个「先发布后
   可见」的顺序在 x86_64 上暴露为垃圾指针。
3. 崩溃只在「较大存活堆 + 反复老生代 Mark-Compact 迁移」下出现，建议关注**迁移（Evacuate）与并发
   标记重叠**时的对象地址更新路径。

## 8. 证据文件索引

复现环境（服务器 `192.168.11.205`，隔离目录 `/home/luoji/wd-repro/`）：

- `bare/biggc.js`、`bare/big.js`、`bare/zero.js`、`bare/alloc.js` —— 四档纯 JS 负载
- `bare/bigger.js` —— 加压版（~119 MB / 400 次 major GC），用于 macOS 对照
- `gdbdump4/caught-2.gdb` —— 最小复现器上捕获的完整现场（栈 / 寄存器 / 内存窗口）
- `gdbdump4/maps-2.txt` —— 同一时刻的 `/proc/<pid>/maps`（843 条），用于归属分类
- `gdbdump2/caught-{1,2}.gdb`、`gdbdump3/caught-{1,2}.gdb` —— 生产负载上的现场
- `/tmp/bare-*.out`、`/tmp/flags.out`、`/tmp/flags2.out` —— 各臂逐轮结果
- `/tmp/wd-mapsclassify.py` —— 寄存器 / 映射归属分类器
