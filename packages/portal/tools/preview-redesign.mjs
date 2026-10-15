// 首页改版本地预览服务（2026-10-01）。
//
// 用途：只为本机核对改版后的首页渲染、窄屏导航与合作表单提交路径，
// 不参与生产、不监听公网、不读取任何凭据。
//
// 为什么需要它：生产门户在 Caddy 后面带登录门禁，未登录访问 /portal 会 302 到登录页；
// 而改版要验证的恰恰是首页本身（含 CSP 是否放行 /api/portal/orders 的同源请求）。
// 本服务复刻门户的三条静态路由与安全响应头，并把需求单接口转发到一个**指定的**
// 后台地址（默认不转发，避免任何测试提交落进生产线索库）。
//
// 用法：
//   node tools/preview-redesign.mjs
//   PREVIEW_PORT=3099 PREVIEW_ORDER_TARGET=http://127.0.0.1:3094/api/admin/orders \
//     node tools/preview-redesign.mjs
// 停止：Ctrl+C 或 kill；进程退出后端口即失效。

import { createServer, request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const SITE_DIR = resolve(process.env.PREVIEW_SITE_DIR ?? join(here, '..', 'site'));
const ASSETS_DIR = resolve(process.env.PREVIEW_ASSETS_DIR ?? join(here, '..', 'assets'));
const PORT = Number(process.env.PREVIEW_PORT ?? 3099);
const BIND = process.env.PREVIEW_BIND ?? '127.0.0.1';
// 留空即不转发：表单会收到一条明确的 503，而不是静默写进生产订单表。
const ORDER_TARGET = process.env.PREVIEW_ORDER_TARGET ?? '';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

// 诊断开关：PREVIEW_NO_CSP=1 时不发 CSP 头，用于判断"页面渲染异常是否由 CSP 引起"。
// 生产与默认预览都带 CSP，此开关只服务于本地排查。
const SEND_CSP = process.env.PREVIEW_NO_CSP !== '1';

const SECURITY_HEADERS = {
  ...(SEND_CSP ? {
    'Content-Security-Policy': [
      "default-src 'none'",
      "img-src 'self'",
      "style-src 'self'",
      "script-src 'self'",
      "connect-src 'self'",
      "form-action 'self'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
  } : {}),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
};

const sendFile = async (response, filePath) => {
  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('未找到');
  }
};

const readBody = (request, limit = 64 * 1024) => new Promise((resolvePromise, reject) => {
  const chunks = [];
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > limit) { reject(new Error('too_large')); request.destroy(); return; }
    chunks.push(chunk);
  });
  request.on('end', () => resolvePromise(Buffer.concat(chunks)));
  request.on('error', reject);
});

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const path = url.pathname;

  // —— 需求单接口：只在显式配置了目标时转发 ——
  if (path === '/api/portal/orders') {
    if (request.method !== 'POST') {
      response.writeHead(405, { ...SECURITY_HEADERS, allow: 'POST' });
      response.end();
      return;
    }
    if (ORDER_TARGET === '') {
      response.writeHead(503, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: false, errors: ['预览环境未配置订单转发目标（PREVIEW_ORDER_TARGET）'] }));
      return;
    }
    try {
      const body = await readBody(request);
      // 与门户 src/server.mjs 的 proxyAdmin 同口径：**原样保留原始 Host 与 Origin**。
      // 后台的 sameOrigin() 用 Origin 比对 http(s)://<Host>；这里若改写任一者，
      // 测出来的"通过"就不代表生产能通过（生产同样是保留原始 Host 透传的）。
      const target = new URL(ORDER_TARGET);
      await new Promise((resolvePromise, rejectPromise) => {
        const upstream = httpRequest(
          {
            host: target.hostname,
            port: target.port === '' ? 80 : Number(target.port),
            method: 'POST',
            path: target.pathname + target.search,
            headers: { ...request.headers, host: request.headers.host, 'content-length': body.length },
          },
          (up) => {
            response.writeHead(up.statusCode ?? 502, {
              ...SECURITY_HEADERS,
              'Content-Type': 'application/json; charset=utf-8',
            });
            up.pipe(response);
            up.on('end', resolvePromise);
          },
        );
        upstream.on('error', rejectPromise);
        upstream.end(body);
      });
    } catch (error) {
      response.writeHead(502, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: false, errors: [`转发失败：${error?.message ?? error}`] }));
    }
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, SECURITY_HEADERS);
    response.end();
    return;
  }

  // —— 静态路由：与 src/server.mjs 的 SITE_FILES / INDEX_HTML / 素材路由同形 ——
  const staticRoutes = new Map([
    ['/portal', join(SITE_DIR, 'index.html')],
    ['/portal/', join(SITE_DIR, 'index.html')],
    ['/portal/index.html', join(SITE_DIR, 'index.html')],
    ['/portal/styles.css', join(SITE_DIR, 'styles.css')],
    ['/portal/portal.js', join(SITE_DIR, 'portal.js')],
    ['/portal/login', join(SITE_DIR, 'login.html')],
    ['/portal/register', join(SITE_DIR, 'register.html')],
  ]);

  const mapped = staticRoutes.get(path);
  if (mapped) {
    await sendFile(response, mapped);
    return;
  }

  if (path.startsWith('/portal/assets/')) {
    const name = normalize(path.slice('/portal/assets/'.length));
    if (name.includes('..')) { response.writeHead(400, SECURITY_HEADERS); response.end(); return; }
    await sendFile(response, join(ASSETS_DIR, name));
    return;
  }

  if (path.startsWith('/portal/products/')) {
    const name = normalize(path.slice('/portal/products/'.length));
    if (name.includes('..')) { response.writeHead(400, SECURITY_HEADERS); response.end(); return; }
    await sendFile(response, join(SITE_DIR, 'products', name));
    return;
  }

  response.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('未找到');
});

server.listen(PORT, BIND, () => {
  process.stdout.write(`改版预览：http://${BIND}:${PORT}/portal\n`);
  process.stdout.write(`  站点目录：${SITE_DIR}\n`);
  process.stdout.write(`  素材目录：${ASSETS_DIR}\n`);
  process.stdout.write(`  订单转发：${ORDER_TARGET === '' ? '（未配置，表单提交将返回 503）' : ORDER_TARGET}\n`);
});
