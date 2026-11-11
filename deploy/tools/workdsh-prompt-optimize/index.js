// workdsh-prompt-optimize — Host 半身（Node，运行在 DSH Host 的插件容器里）。
//
// 职责：注册 POST /prompt-optimize/optimize 路由，把浏览器半身传来的输入框草稿
// 交给 ctx.llm（复用 DSH 已配置的 DeepSeek 路由，无需单独 API Key）做提示词改写，
// 返回 { ok, optimized }。
//
// 约束（沿用社区插件约定）：
//   - 本文件必须是 ESM（package.json 已 "type": "module"）
//   - 只导出 name / inject / apply，不要 import 任何 @deepseek-ai/* 运行时包
//   - 使用的服务必须写进 inject 数组
//
// 参考实现：官方 dsh-session-title-*（ctx.llm.prepareCall / call.stream）、
// 社区 dsh-mcp-manager-plus（ctx.webServer.register prefix 路由）。

import { randomUUID } from 'node:crypto';

export const name = 'prompt-optimize';

export const inject = ['webServer', 'llm'];

const ROUTE_PATH = '/optimize';
const API_PREFIX = '/prompt-optimize';

const SYSTEM_PROMPT = `你是「提示词优化助手」。用户会给你一段准备发给 AI 助手的原始输入。
你的任务是把它改写成更高质量的提示词，规则：
1. 严格保留原意与事实，不虚构用户没说的信息；拿不准的用合理且中性的措辞补齐结构，不添加实质性新需求。
2. 让任务目标更清晰：必要时补出「背景 / 目标 / 约束 / 期望输出」的结构，但不要过度模板化。
3. 保持与用户输入相同的语言（中文输入用中文输出，英文同理）。
4. 只输出改写后的提示词本体，不要解释、不要前后缀、不要引号包裹。`;

export function apply(ctx, config = {}) {
  const cfg = {
    provider: config.provider || 'deepseek-official',
    model: config.model || 'deepseek-flash',
    maxInputBytes: Number.isFinite(config.maxInputBytes) ? config.maxInputBytes : 4096,
    maxOutputTokens: Number.isFinite(config.maxOutputTokens) ? config.maxOutputTokens : 2048,
    timeoutMs: Number.isFinite(config.timeoutMs) ? config.timeoutMs : 60000,
  };

  const handler = async (req, res) => {
    // webServer 的 prefix 路由不会剥掉前缀，handler 收到的是完整路径
    let pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (pathname.startsWith(API_PREFIX)) {
      pathname = pathname.slice(API_PREFIX.length) || '/';
    }
    if (pathname !== ROUTE_PATH || req.method !== 'POST') {
      return sendJson(res, 404, { ok: false, error: 'not found' });
    }

    let body;
    try {
      body = await readJsonBody(req, cfg.maxInputBytes + 2048);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: '请求体无效或过大' });
    }

    const text = typeof body?.text === 'string' ? body.text : '';
    if (!text.trim()) {
      return sendJson(res, 400, { ok: false, error: 'empty input' });
    }
    if (Buffer.byteLength(text, 'utf8') > cfg.maxInputBytes) {
      return sendJson(res, 413, { ok: false, error: '输入过长' });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const call = await ctx.llm.prepareCall(
        { provider: cfg.provider, model: cfg.model, maxTokens: cfg.maxOutputTokens },
        controller.signal,
      );
      const stream = call.stream({
        ...call.config,
        system: SYSTEM_PROMPT,
        messages: [
          {
            id: randomUUID(),
            role: 'user',
            content: [{ type: 'text', text }],
            source: { kind: 'workdsh-prompt-optimize' },
          },
        ],
        sessionId: `prompt-optimize-${randomUUID()}`,
        purpose: 'prompt-optimize',
        signal: controller.signal,
      });
      let optimized = '';
      let finishReason = '';
      for await (const chunk of stream) {
        if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') {
          optimized += chunk.text;
        } else if (chunk && chunk.type === 'finish') {
          try { finishReason = JSON.stringify(chunk); } catch (e) { finishReason = String(chunk.reason); }
        }
      }
      optimized = optimized.trim();
      if (!optimized) {
        return sendJson(res, 502, { ok: false, error: `模型返回为空（finish: ${finishReason || 'unknown'}）` });
      }
      return sendJson(res, 200, { ok: true, optimized });
    } catch (err) {
      const msg = controller.signal.aborted ? '优化超时，请重试' : String(err?.message || err || 'optimize failed');
      return sendJson(res, controller.signal.aborted ? 504 : 502, { ok: false, error: msg });
    } finally {
      clearTimeout(timer);
    }
  };

  ctx.effect(() =>
    ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler }),
    'workdsh-prompt-optimize: prompt optimize API',
  );
}

function readJsonBody(req, cap) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > cap) {
        reject(new Error('body too large'));
        req.destroy();
      } else {
        chunks.push(c);
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (e) {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}
