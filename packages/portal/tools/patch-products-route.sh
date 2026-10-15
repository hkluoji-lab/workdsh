#!/usr/bin/env bash
# 把 2026Q3 产品简介页挂到企业门户公开路径 /portal/products/2026Q3.html
# 步骤：① 放置页面文件 ② 幂等补丁门户边缘服务 ③ 语法检查 ④ 备用端口预检 ⑤ 切换生产进程
set -euo pipefail

P=/data/dsh/portal/src/server.mjs
SITE=/data/dsh/portal/site/products
SRC=/data/dsh/home/dsh/2026Q3-zhengqi-fttr-products.html
PROBE_PORT=3097
STAMP=$(date +%Y%m%d%H%M%S)

echo "=== ① 放置页面 ==="
mkdir -p "$SITE"
cp -p "$SRC" "$SITE/2026Q3.html"
ls -la "$SITE/2026Q3.html"

echo "=== ② 幂等补丁 $P ==="
node - "$P" <<'NODE'
const fs = require('fs');
const P = process.argv[2];
let src = fs.readFileSync(P, 'utf8');
if (src.includes('serveProductPage')) { console.log('SKIP: 已包含 products 路由'); process.exit(0); }
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
fs.writeFileSync(P + '.bak.products.' + stamp, src);
console.log('备份 -> ' + P + '.bak.products.' + stamp);

const A1 = 'const ASSET_TYPES = new Map([';
if (!src.includes(A1)) throw new Error('anchor1 missing');
const INS1 = String.raw`// 公开产品资料页（/portal/products/<name>.html）。
// 这些页面是单文件自包含站点（内联样式与脚本），因此仅对该路径放宽 CSP。
const PRODUCT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.html$/;
const PRODUCT_CSP = [
  "default-src 'none'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

`;
src = src.replace(A1, INS1 + A1);

const A2 = 'async function serveAsset(res, requestPath) {';
if (!src.includes(A2)) throw new Error('anchor2 missing');
const INS2 = String.raw`async function serveProductPage(res, requestPath) {
  const name = requestPath.slice('/portal/products/'.length);
  if (!PRODUCT_NAME_RE.test(name) || name.includes('..')) return sendText(res, 404, 'Not found');
  const base = resolve(config.siteDir, 'products');
  const target = resolve(base, name);
  if (!target.startsWith(base + sep)) return sendText(res, 404, 'Not found');
  try {
    if (!(await stat(target)).isFile()) return sendText(res, 404, 'Not found');
    send(res, 200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': PRODUCT_CSP }, await readFile(target));
  } catch {
    sendText(res, 404, 'Not found');
  }
}

`;
src = src.replace(A2, INS2 + A2);

const A3 = "  if (path.startsWith('/portal/assets/')) return serveAsset(res, path);";
if (!src.includes(A3)) throw new Error('anchor3 missing');
src = src.replace(A3, A3 + "\n  if (path.startsWith('/portal/products/')) return serveProductPage(res, path);");

const n = (src.match(/serveProductPage/g) || []).length;
if (n !== 2) throw new Error('serveProductPage 出现次数应为 2，实际 ' + n);
if (!src.includes('PRODUCT_CSP')) throw new Error('PRODUCT_CSP missing');
fs.writeFileSync(P, src);
console.log('PATCH OK');
NODE

node --check "$P" && echo "语法检查通过"

echo "=== ④ 备用端口 ${PROBE_PORT} 预检（不影响生产） ==="
PORTAL_BIND=127.0.0.1 PORTAL_PORT=$PROBE_PORT \
  DSH_AUTH_USERNAME=probe DSH_AUTH_PASSWORD=probe-password-123456 \
  PORTAL_ASSETS_DIR=/data/dsh/portal/assets \
  node "$P" >/tmp/portal-probe.$$.log 2>&1 &
PROBE_PID=$!
sleep 2
code() { curl -s -o /dev/null -w "%{http_code}" "$1"; }
echo "产品页            = $(code http://127.0.0.1:$PROBE_PORT/portal/products/2026Q3.html)  (期望 200)"
echo "产品页 CSP        = $(curl -sI http://127.0.0.1:$PROBE_PORT/portal/products/2026Q3.html | grep -i '^content-security-policy' | head -c 120)"
echo "路径穿越          = $(code "http://127.0.0.1:$PROBE_PORT/portal/products/..%2f..%2fsrc%2fserver.mjs")  (期望 404)"
echo "非 html           = $(code "http://127.0.0.1:$PROBE_PORT/portal/products/x.js")  (期望 404)"
echo "门禁 /api/portal/auth = $(code http://127.0.0.1:$PROBE_PORT/api/portal/auth)  (期望 401)"
echo "门户首页 /portal  = $(code http://127.0.0.1:$PROBE_PORT/portal)  (期望 200)"
echo "登录页 /login     = $(code http://127.0.0.1:$PROBE_PORT/login)  (期望 200)"
echo "样式表            = $(code http://127.0.0.1:$PROBE_PORT/portal/styles.css)  (期望 200)"
kill "$PROBE_PID" 2>/dev/null || true
sleep 1
echo "预检进程已停止"

echo "=== ⑤ 切换生产门户进程（entrypoint 看护循环 3 秒内自动拉起新代码） ==="
PORTAL_PID=$(for p in /proc/[0-9]*; do
  if tr '\0' ' ' < "$p/cmdline" 2>/dev/null | grep -q 'portal/src/server.mjs'; then echo "${p#/proc/}"; fi
done | head -1)
if [ -z "$PORTAL_PID" ]; then echo "未找到门户进程，放弃"; exit 1; fi
echo "门户 PID=$PORTAL_PID -> kill"
kill "$PORTAL_PID" || true
sleep 7

echo "=== ⑥ 生产验证 ==="
echo "本地 3083 产品页  = $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3083/portal/products/2026Q3.html)  (期望 200)"
echo "本地 3083 门禁    = $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3083/api/portal/auth)  (期望 401)"
echo "公网 产品页       = $(curl -sk -o /dev/null -w '%{http_code}' https://dsh.10ge.cn/portal/products/2026Q3.html)  (期望 200)"
echo "公网 产品页字节   = $(curl -sk https://dsh.10ge.cn/portal/products/2026Q3.html | wc -c)"
echo "公网 门户首页     = $(curl -sk -o /dev/null -w '%{http_code}' https://dsh.10ge.cn/portal)  (期望 200)"
echo "公网 根路径       = $(curl -sk -o /dev/null -w '%{http_code}' https://dsh.10ge.cn/)  (期望 302 跳登录/门户)"
echo "公网 问卷健康     = $(curl -sk -o /dev/null -w '%{http_code}' https://dsh.10ge.cn/survey/healthz)  (期望 200)"
echo "内容抽查          = $(curl -sk https://dsh.10ge.cn/portal/products/2026Q3.html | grep -c '政企全光融合')"
echo "=== 完成 ==="
