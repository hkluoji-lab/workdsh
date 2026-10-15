#!/usr/bin/env node
/**
 * survey.10ge.cn 公网网关（宿主机侧，零依赖）
 *
 * 为什么需要它：
 *   dsh 容器内的 Caddy 只认 Host: dsh.10ge.cn，且它的兜底路由会把整个 AI 工作台暴露出去。
 *   直接把 survey.10ge.cn 指到容器 Caddy，等于把「无鉴权的 AI 工作台」复制到新域名上。
 *   这个网关只放行问卷相关路径，其余一律 404，工作台不会被带出去。
 *
 * 链路：Cloudflare 隧道 → http://127.0.0.1:3092(本进程) → https://127.0.0.1:3080(容器内 Caddy，Host: dsh.10ge.cn)
 *
 * 路由：
 *   /                      302 → /survey/
 *   /admin[...]            302 → /survey/admin[...]
 *   /survey/...            原样转发
 *   其他                    404
 *   /__gw/health           本网关健康探针
 */
import http from 'node:http';
import https from 'node:https';

const PORT = Number(process.env.GW_PORT || 3092);
const BIND = process.env.GW_BIND || '127.0.0.1';
const PUBLIC_HOST = process.env.GW_PUBLIC_HOST || 'survey.10ge.cn';
const UP_HOST = process.env.GW_UPSTREAM_HOST || '127.0.0.1';
const UP_PORT = Number(process.env.GW_UPSTREAM_PORT || 3080);
const UP_SNI = process.env.GW_UPSTREAM_SNI || 'dsh.10ge.cn';

const log = (...a) => console.log(new Date().toISOString(), ...a);

const HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length',
]);

function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end();
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end('Not Found');
}

const server = http.createServer((req, res) => {
  const ip = req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '';
  let url;
  try {
    url = new URL(req.url, 'http://gateway.local');
  } catch {
    return notFound(res);
  }
  const pathname = decodeURIComponent(url.pathname);
  const search = url.search || '';

  if (pathname === '/__gw/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, host: PUBLIC_HOST, upstream: `${UP_HOST}:${UP_PORT}`, port: PORT }));
  }

  // 只放行问卷相关路径，工作台（/、/api、/plugins 等）一律不转发
  let target = null;
  if (pathname === '/') target = '/survey/' + search;
  else if (pathname === '/admin' || pathname === '/admin/') target = '/survey/admin' + search;
  else if (pathname === '/survey' || pathname.startsWith('/survey/')) target = pathname + search;

  if (target === null) return notFound(res);
  if (pathname === '/' || pathname === '/admin' || pathname === '/admin/' || pathname === '/survey') {
    return redirect(res, target);
  }

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_HEADERS.has(k.toLowerCase())) headers[k] = v;
  }
  headers.Host = UP_SNI;
  headers['X-Forwarded-Proto'] = 'https';
  const priorXff = req.headers['x-forwarded-for'];
  headers['X-Forwarded-For'] = priorXff ? `${priorXff}, ${ip}` : String(ip);

  const upstream = https.request(
    {
      host: UP_HOST,
      port: UP_PORT,
      method: req.method,
      path: target,
      headers,
      servername: UP_SNI,          // SNI，否则容器内 Caddy 拿不到站点名
      rejectUnauthorized: false,   // Caddy 用 tls internal 自签
      timeout: 30_000,
    },
    (up) => {
      const outHeaders = {};
      for (const [k, v] of Object.entries(up.headers)) {
        if (!HOP_HEADERS.has(k.toLowerCase())) outHeaders[k] = v;
      }
      res.writeHead(up.statusCode || 502, outHeaders);
      up.pipe(res);
    },
  );

  upstream.on('timeout', () => upstream.destroy(new Error('upstream timeout')));
  upstream.on('error', (err) => {
    log('upstream error', target, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Gateway');
    } else {
      res.end();
    }
  });

  req.pipe(upstream);
});

server.on('clientError', (err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

server.listen(PORT, BIND, () => {
  log(`survey gateway on http://${BIND}:${PORT}  ->  https://${UP_HOST}:${UP_PORT} (Host: ${UP_SNI})  public=${PUBLIC_HOST}`);
});
