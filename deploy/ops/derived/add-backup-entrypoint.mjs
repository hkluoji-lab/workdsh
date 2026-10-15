#!/usr/bin/env node
/**
 * 向 entrypoint 注入站点资产备份的随容器自愈启动块（P0-2）。
 *
 * 为什么需要注入：备份循环必须活过容器重启。手工 nohup 起来的进程只活到下一次重启，
 * 之后会静默停止——备份静默失效比没有备份更危险。
 *
 * 幂等：已存在 ASSET_BACKUP_BLOCK_V1 标记时直接退出，不重复插入。
 * 带断言：任一校验失败即报错退出，绝不写出坏文件
 * （entrypoint 有语法错误会让容器直接崩溃循环）。
 *
 * 用法：add-backup-entrypoint.mjs <in> <out>
 */
import fs from 'node:fs';

const MARK = 'ASSET_BACKUP_BLOCK_V1';
const BLOCK = `
# 站点资产定时备份（${MARK}）：独立进程，随容器一起被看护；崩溃 3 秒自动重启。
# 备份 MCP 连接、资料库、专家、技能、门户用户表与插件配置到 /data/dsh/backups/assets。
# 默认每 24 小时一份、保留最近 14 份；同一天重复执行覆盖当天快照。
(
  while true; do
    gosu node env HOME=/data/dsh/home \\
      BACKUP_DIR=/data/dsh/backups/assets \\
      BACKUP_KEEP=14 \\
      BACKUP_INTERVAL_SECONDS=86400 \\
      bash /data/dsh/tools/run-backup.sh
    printf 'asset backup exited (%s); restarting in 3s.\\n' "$(date -Is)" >&2
    sleep 3
  done
) &
backup_pid=$!
pids+=("$backup_pid")
`;

const [src, dst] = process.argv.slice(2);
if (!src || !dst) {
  console.error('用法: add-backup-entrypoint.mjs <in> <out>');
  process.exit(2);
}

const text = fs.readFileSync(src, 'utf8');
if (text.includes(MARK)) {
  console.log('已存在备份启动块，跳过（幂等）');
  if (src !== dst) fs.writeFileSync(dst, text);
  process.exit(0);
}

// 锚点选在 VAS 块之后：那是最靠近该文件末尾的一段已知结构。
const anchor = 'vas_pid=$!\npids+=("$vas_pid")\n';
const idx = text.indexOf(anchor);
if (idx === -1) {
  console.error('未找到 vas 启动块锚点，拒绝改写');
  process.exit(1);
}
if (text.indexOf(anchor, idx + 1) !== -1) {
  console.error('vas 启动块锚点不唯一，拒绝改写');
  process.exit(1);
}

const at = idx + anchor.length;
const out = text.slice(0, at) + BLOCK + text.slice(at);

const fail = (message) => {
  console.error(`断言失败：${message}`);
  process.exit(1);
};
if (!out.startsWith(text.slice(0, at))) fail('前缀被意外修改');
if (!out.endsWith(text.slice(at))) fail('后缀被意外修改');
if (out.split('backup_pid=$!').length - 1 !== 1) fail('backup_pid 赋值次数异常');
if (out.length !== text.length + BLOCK.length) fail('长度不等于原文加新增块');

fs.writeFileSync(dst, out);
console.log(`已注入备份启动块（+${BLOCK.length} 字节）`);
