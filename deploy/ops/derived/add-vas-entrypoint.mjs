#!/usr/bin/env node
/**
 * 向 entrypoint 注入增值业务后台（VAS）的随容器自愈启动块。
 * 幂等：已存在 VAS_ADMIN_BLOCK_V1 标记时直接退出，不重复插入。
 * 带断言：任一校验失败即报错退出，绝不写出坏文件（entrypoint 语法错误会导致容器崩溃循环）。
 * 用法：add-vas-entrypoint.mjs <in> <out>
 */
import fs from 'node:fs';

const MARK = 'VAS_ADMIN_BLOCK_V1';
const BLOCK = `
# 增值业务产品页后台（${MARK}）：独立进程，随门户一起被看护；崩溃 3 秒自动重启。
# 与门户同一账号表与签名密钥口径，因此复用门户会话 Cookie，不新建身份体系；
# 模块位于 /data/dsh/vas（独立数据目录与模板，不影响既有的 FTTR 产品页后台）。
(
  while true; do
    gosu node env HOME=/data/dsh/home \\
      DSH_AUTH_USERNAME="$auth_username" \\
      DSH_AUTH_PASSWORD="$portal_password" \\
      PORTAL_MODULE_DIR=/data/dsh/portal \\
      VAS_BIND=127.0.0.1 \\
      VAS_PORT=3085 \\
      VAS_DATA_DIR=/data/dsh/vas/data \\
      VAS_PUBLIC_DIR=/data/dsh/vas/public \\
      VAS_TEMPLATE=/data/dsh/vas/tools/product.template.html \\
      VAS_PUBLISH_DIR=/data/dsh/portal/site/products \\
      VAS_BACKUP_DIR=/data/dsh/vas/backups \\
      VAS_ORDERS_DIR=/data/dsh/vas/data/orders \\
      node /data/dsh/vas/src/server.mjs
    printf 'vas admin exited (%s); restarting in 3s.\\n' "$(date -Is)" >&2
    sleep 3
  done
) &
vas_pid=$!
pids+=("$vas_pid")
`;

const [src, dst] = process.argv.slice(2);
if (!src || !dst) { console.error('用法: add-vas-entrypoint.mjs <in> <out>'); process.exit(2); }

const text = fs.readFileSync(src, 'utf8');
if (text.includes(MARK)) {
  console.log('已存在 VAS 启动块，跳过（幂等）');
  if (src !== dst) fs.writeFileSync(dst, text);
  process.exit(0);
}

const anchor = 'admin_pid=$!\npids+=("$admin_pid")\n';
const idx = text.indexOf(anchor);
if (idx === -1) { console.error('未找到 admin 启动块锚点，拒绝改写'); process.exit(1); }
if (text.indexOf(anchor, idx + 1) !== -1) { console.error('admin 启动块锚点不唯一，拒绝改写'); process.exit(1); }

const at = idx + anchor.length;
const out = text.slice(0, at) + BLOCK + text.slice(at);

// 断言：只允许纯新增
const fail = (m) => { console.error('断言失败：' + m); process.exit(1); };
if (!out.startsWith(text.slice(0, at))) fail('前缀被意外修改');
if (!out.endsWith(text.slice(at))) fail('后缀被意外修改');
if (out.split('vas_pid=$!').length - 1 !== 1) fail('vas_pid 赋值次数异常');
if (out.length <= text.length) fail('输出未增长');
const count = (s, sub) => s.split(sub).length - 1;
if (count(out, '(') !== count(text, '(') + count(BLOCK, '(')) fail('左括号数不符');
if (count(out, ')') !== count(text, ')') + count(BLOCK, ')')) fail('右括号数不符');
if (!out.includes('VAS_PORT=3085')) fail('缺少 VAS_PORT');
if (!out.includes('node /data/dsh/vas/src/server.mjs')) fail('缺少启动命令');

fs.writeFileSync(dst, out);
console.log(`已注入 VAS 启动块：${text.length} → ${out.length} 字节`);
