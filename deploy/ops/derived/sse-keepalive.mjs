#!/usr/bin/env node
// sse-keepalive.mjs — 在 dsh 后端与 Caddy 之间，为空闲的 SSE 流注入注释心跳。
//
// 为什么需要它：/plugins/events 握手后先发一帧插件图，随后长期静默。办公出口路径会在
// ~120-127 秒把空闲连接静默清除。让这条流始终有字节流动，即可避免被按空闲回收。
//
// 只做三件事：
//   1. 转发请求与响应（流式，不缓冲）；
//   2. 移除 Accept-Encoding，保证上游 SSE 未被压缩——否则插入明文注释会破坏 gzip 帧；
//   3. 空闲超过 IDLE_MS 时向下游写一行 SSE 注释 `: keepalive`。
//
// 只注入注释行，不改变状态帧、不介入会话、不缓存。压缩由 Caddy 按客户端能力处理。
import http from 'node:http';

const LISTEN_HOST = process.env.SSE_KEEPALIVE_HOST ?? '127.0.0.1';
const LISTEN_PORT = Number(process.env.SSE_KEEPALIVE_PORT ?? 3081);
const UPSTREAM_HOST = process.env.SSE_KEEPALIVE_UPSTREAM_HOST ?? '127.0.0.1';
const UPSTREAM_PORT = Number(process.env.SSE_KEEPALIVE_UPSTREAM_PORT ?? 3080);
const IDLE_MS = Number(process.env.SSE_KEEPALIVE_IDLE_MS ?? 25000);

// 逐跳首部，不得从上游响应原样复制到下游。
const HOP_BY_HOP = ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'te', 'trailer'];

function log(message) {
  process.stdout.write(`[sse-keepalive] ${message}\n`);
}

const server = http.createServer((req, res) => {
  const headers = { ...req.headers };
  // 上游必须返回未压缩流，中继才能安全地把明文注释行插入流中。
  delete headers['accept-encoding'];
  for (const name of HOP_BY_HOP) delete headers[name];

  const upstream = http.request(
    { host: UPSTREAM_HOST, port: UPSTREAM_PORT, method: req.method, path: req.url, headers },
    (up) => {
      const isSse = /^text\/event-stream\b/i.test(up.headers['content-type'] ?? '');
      const outHeaders = { ...up.headers };
      for (const name of HOP_BY_HOP) delete outHeaders[name];
      res.writeHead(up.statusCode ?? 502, outHeaders);

      let idleTimer = null;
      const clearIdle = () => {
        if (idleTimer) {
          clearTimeout(idleTimer);
          idleTimer = null;
        }
      };
      const armIdle = () => {
        clearIdle();
        idleTimer = setTimeout(() => {
          if (res.writableEnded) return;
          res.write(': keepalive\n\n');
          armIdle();
        }, IDLE_MS);
        idleTimer.unref?.();
      };

      if (isSse) armIdle();

      up.on('data', (chunk) => {
        if (isSse) armIdle();
        if (!res.write(chunk)) {
          up.pause();
          res.once('drain', () => up.resume());
        }
      });
      up.on('end', () => {
        clearIdle();
        res.end();
      });
      up.on('error', () => {
        clearIdle();
        res.destroy();
      });
    },
  );

  upstream.on('error', (error) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    if (!res.writableEnded) res.end(`sse-keepalive: upstream error: ${error.message}\n`);
  });

  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
});

server.on('clientError', (_error, socket) => socket.destroy());

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  log(`listening on ${LISTEN_HOST}:${LISTEN_PORT} -> ${UPSTREAM_HOST}:${UPSTREAM_PORT}, idle=${IDLE_MS}ms`);
});
