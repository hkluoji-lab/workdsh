#!/usr/bin/env node
/**
 * 给 entrypoint 加上 dsh 运行期看护（DSH_RUNTIME_SUPERVISION_BLOCK_V1）。
 *
 * 背景（2026-10-01 实测）
 * ----------------------
 * 这个容器里的 dsh node 进程会因 V8 GC 缺陷**在就绪之后**偶发 SIGSEGV。
 * 当天 docker 日志里 8 次 `Segmentation fault`，其中 5 次发生在本次会话期间：
 *   10:13:18 / 10:13:38 / 10:22:08 / 10:43:21 / 10:55:34 / 10:57:00 (UTC)
 * 每一次都精确对应一次容器整体重启（+08 的 18:13 / 18:22 / 18:43 / 18:55 / 18:57）。
 *
 * 为什么它会带走整个容器
 * ----------------------
 * entrypoint 末尾是：
 *   wait -n "$dsh_pid" "$caddy_pid" "$keepalive_pid" "$survey_pid" "$portal_pid"
 *   exit "$status"
 * 只要其中任一进程退出，entrypoint 立即整容器退出，再由 `restart: unless-stopped`
 * 拉起。而现有的重试逻辑（`while [[ "$ready" != true ]]`）**只覆盖"就绪之前"**，
 * 就绪之后的段错误没有任何缓冲 —— 正在进行的 agent 会话会被直接打断。
 * 对比：survey / portal / admin / vas 都是 `while true` 循环看护的，只有 dsh 是裸的。
 *
 * 本补丁把 dsh 单独看护起来：dsh 崩了就在原地重启它，其余子进程（caddy / keepalive /
 * survey / portal）继续运行，容器不再因 dsh 段错误而整体重启。其它任一被 wait 的
 * 进程若退出，行为保持原样（容器退出），不改变既有语义。
 *
 * 幂等：已存在标记时直接退出。
 * 带断言：任一校验失败即报错退出，绝不写出坏文件
 * （entrypoint 有语法错误会让容器直接崩溃循环）。
 *
 * 用法：add-dsh-supervision-entrypoint.mjs <in> <out>
 */
import fs from 'node:fs';

const MARK = 'DSH_RUNTIME_SUPERVISION_BLOCK_V1';

const ANCHOR = `status=0
wait -n "$dsh_pid" "$caddy_pid" "$keepalive_pid" "$survey_pid" "$portal_pid" || status=$?
exit "$status"
`;

const REPLACEMENT = `status=0
# dsh 运行期看护（${MARK}）：dsh 的 node 进程会因 V8 GC 缺陷在就绪之后偶发 SIGSEGV
# （2026-10-01 实测 8 次，每次都会让整个容器重启并打断进行中的会话）。原来的重试只覆盖
# "就绪之前"，这里补上运行期：只有 dsh 崩了就原地重启它，其它子进程照常运行。
while true; do
  wait -n "$dsh_pid" "$caddy_pid" "$keepalive_pid" "$survey_pid" "$portal_pid" || status=$?
  # 不是 dsh 退出（caddy / keepalive / survey / portal）-> 保持原有语义：容器退出。
  if kill -0 "$dsh_pid" 2>/dev/null; then
    break
  fi
  printf 'dsh exited after startup (status %s, %s); restarting dsh in 3s (container stays up).\\n' \\
    "$status" "$(date -Is)" >&2
  sleep 3
  start_dsh
  status=0
done
exit "$status"
`;

const [src, dst] = process.argv.slice(2);
if (!src || !dst) {
  console.error('用法: add-dsh-supervision-entrypoint.mjs <in> <out>');
  process.exit(2);
}

const text = fs.readFileSync(src, 'utf8');
if (text.includes(MARK)) {
  console.log('已存在运行期看护块，跳过（幂等）');
  if (src !== dst) fs.writeFileSync(dst, text);
  process.exit(0);
}

const idx = text.indexOf(ANCHOR);
if (idx === -1) {
  console.error('未找到 entrypoint 末尾的 wait -n 锚点，拒绝改写');
  process.exit(1);
}
if (text.indexOf(ANCHOR, idx + 1) !== -1) {
  console.error('锚点不唯一，拒绝改写');
  process.exit(1);
}

const out = text.slice(0, idx) + REPLACEMENT + text.slice(idx + ANCHOR.length);

const fail = (message) => {
  console.error(`断言失败：${message}`);
  process.exit(1);
};
if (out.length !== text.length - ANCHOR.length + REPLACEMENT.length) fail('长度不等于原文减旧块加新块');
if (out.split(MARK).length - 1 !== 1) fail('标记出现次数异常');
if ((out.match(/wait -n "\$dsh_pid"/g) || []).length !== 1) fail('wait -n 出现次数异常');
if (!out.includes('start_dsh\n  status=0')) fail('缺少重启后的状态复位');
if ((out.match(/^exit "\$status"$/gm) || []).length !== 1) fail('exit 语句次数异常');
// 关键语义必须保留：非 dsh 退出时仍然整容器退出。
if (!out.includes('if kill -0 "$dsh_pid" 2>/dev/null; then')) fail('缺少 dsh 存活判定');

fs.writeFileSync(dst, out);
console.log(`已注入 dsh 运行期看护（${ANCHOR.length} -> ${REPLACEMENT.length} 字节）`);
