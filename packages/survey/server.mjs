#!/usr/bin/env node
/**
 * 企业 Agent 工作台 · 需求调研问卷 —— 收集服务（零依赖）
 *
 * 由 dsh 容器内 Caddy 以 route /survey 反代到 127.0.0.1:3082。
 *   GET  /survey/                     问卷表单
 *   GET  /survey/admin?t=<token>      结果管理台
 *   POST /survey/api/submit           提交答卷（公开）
 *   GET  /survey/api/list?t=<token>   全部答卷 JSON
 *   GET  /survey/api/export.csv?t=..  CSV 导出（type=all|matrix）
 *   GET  /survey/healthz              健康探针
 *
 * 答卷落盘：<本目录>/data/submissions.ndjson（每行一条 JSON）。
 */
import { createServer } from 'node:http';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.SURVEY_PORT || 3082);
const BIND = process.env.SURVEY_BIND || '127.0.0.1';
const DATA_DIR = process.env.SURVEY_DATA_DIR || path.join(DIR, 'data');
const STORE = path.join(DATA_DIR, 'submissions.ndjson');
const TOKEN_FILE = path.join(DATA_DIR, 'admin-token.txt');
const MAX_BODY = 256 * 1024;
const IP_SALT = process.env.SURVEY_IP_SALT || 'agent-survey-v1';

let TOKEN = process.env.SURVEY_TOKEN || '';

/* ------------------------------------------------------------------ 工具 */

const log = (...a) => console.log(new Date().toISOString(), ...a);

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const clientIp = (req) => {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || '';
};

const ipHash = (ip) => createHash('sha256').update(IP_SALT + ip).digest('hex').slice(0, 16);

/* ------------------------------------------------- 限流（内存，粗粒度） */

const buckets = new Map();
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
  return b.count <= limit;
}

/* --------------------------------------------------------------- 静态页 */

const PAGES = {
  'index.html': { file: path.join(DIR, 'index.html'), type: 'text/html; charset=utf-8', secret: false },
  'admin.html': { file: path.join(DIR, 'admin.html'), type: 'text/html; charset=utf-8', secret: true },
};

async function sendPage(res, name) {
  const page = PAGES[name];
  if (!page) return send(res, 404, 'text/plain; charset=utf-8', 'not found');
  try {
    const body = await readFile(page.file);
    res.writeHead(200, {
      'Content-Type': page.type,
      'Cache-Control': 'no-store',
      'Content-Length': body.length,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    });
    res.end(body);
  } catch (err) {
    log('page read failed', name, err.message);
    send(res, 500, 'text/plain; charset=utf-8', 'page unavailable');
  }
}

function send(res, code, type, body, extra = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  res.writeHead(code, {
    'Content-Type': type,
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  });
  res.end(buf);
}

const sendJson = (res, code, obj) => send(res, code, 'application/json; charset=utf-8', JSON.stringify(obj));

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('payload too large'), { code: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const str = (v, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const arr = (v, max = 20) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => x.trim().slice(0, 200)).slice(0, max) : []);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/* -------------------------------------------------------------- 存储层 */

async function loadAll() {
  try {
    const raw = await readFile(STORE, 'utf8');
    return raw
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      })
      .filter(Boolean);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function appendRecord(rec) {
  await mkdir(DATA_DIR, { recursive: true });
  await appendFile(STORE, JSON.stringify(rec) + '\n', 'utf8');
}

/* ------------------------------------------------------------- 校验层 */

const MATRIX_KEYS = ['frequency', 'duration', 'rules', 'central', 'risk'];

function normalise(payload, req) {
  const meta = payload && typeof payload.meta === 'object' && payload.meta ? payload.meta : {};
  const dept = str(meta.dept, 60);
  const q1 = str(payload.q1, 4000);
  const errors = [];
  if (!dept) errors.push('部门必填');
  if (!q1) errors.push('第 1 题必填');

  const q2 = (Array.isArray(payload.q2) ? payload.q2 : [])
    .map((r) => ({ task: str(r && r.task, 200), time: str(r && r.time, 60) }))
    .filter((r) => r.task || r.time)
    .slice(0, 5);

  const q4raw = payload.q4 && typeof payload.q4 === 'object' ? payload.q4 : {};
  const q4 = {
    name: str(q4raw.name, 200),
    trigger: str(q4raw.trigger, 300),
    steps: str(q4raw.steps, 2000),
    systems: str(q4raw.systems, 400),
    roles: str(q4raw.roles, 300),
    duration: str(q4raw.duration, 100),
  };

  const q5raw = payload.q5 && typeof payload.q5 === 'object' ? payload.q5 : {};
  const q5 = { tags: arr(q5raw.tags, 8), text: str(q5raw.text, 3000) };

  const q6 = (Array.isArray(payload.q6) ? payload.q6 : [])
    .map((r) => {
      const row = { task: str(r && r.task, 200) };
      for (const k of MATRIX_KEYS) row[k] = num(r && r[k]);
      return row;
    })
    .filter((r) => r.task || MATRIX_KEYS.some((k) => r[k] !== null))
    .slice(0, 5);

  const q8raw = payload.q8 && typeof payload.q8 === 'object' ? payload.q8 : {};
  const q8 = { hours: num(q8raw.hours), usage: str(q8raw.usage, 2000) };

  const q9 = (Array.isArray(payload.q9) ? payload.q9 : [])
    .map((r) => ({ scene: str(r && r.scene, 2000), deliverable: str(r && r.deliverable, 300) }))
    .filter((r) => r.scene || r.deliverable)
    .slice(0, 4);

  if (errors.length) return { errors };

  const startedAt = str(payload.startedAt, 40);
  return {
    record: {
      id: randomUUID(),
      submittedAt: new Date().toISOString(),
      meta: {
        dept,
        name: str(meta.name, 60),
        role: str(meta.role, 60),
        elapsedMs: num(meta.elapsedMs),
        startedAt: startedAt || null,
        ipHash: ipHash(clientIp(req)),
        ua: str(req.headers['user-agent'], 300),
      },
      q1,
      q2,
      q3: arr(payload.q3, 12),
      q3Other: str(payload.q3Other, 200),
      q4,
      q5,
      q6,
      q7: arr(payload.q7, 12),
      q7Other: str(payload.q7Other, 200),
      q8,
      q9,
      q10: arr(payload.q10, 8),
      q11: str(payload.q11, 3000),
      q12: arr(payload.q12, 8),
      q13: arr(payload.q13, 12),
      q13Other: str(payload.q13Other, 200),
      q14: str(payload.q14, 3000),
    },
  };
}

/* ---------------------------------------------------------------- CSV */

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csvRow = (cells) => cells.map(csvCell).join(',') + '\r\n';

/** Agent 化优先分：频率+耗时+规则明确+数据集中（4—20），出错代价高另标风险。 */
export const priorityScore = (row) => {
  const parts = ['frequency', 'duration', 'rules', 'central'].map((k) => (typeof row[k] === 'number' ? row[k] : 0));
  return parts.reduce((a, b) => a + b, 0);
};

function buildCsv(records, type) {
  if (type === 'matrix') {
    let out = '\uFEFF' + csvRow([
      '提交编号', '提交时间', '部门', '姓名', '岗位', '任务', '频率', '单次耗时', '规则明确度', '数据集中度', '出错代价', 'Agent化优先分', '是否需人工确认',
    ]);
    for (const r of records) {
      for (const row of r.q6 || []) {
        out += csvRow([
          r.id, r.submittedAt, r.meta?.dept, r.meta?.name, r.meta?.role, row.task,
          row.frequency, row.duration, row.rules, row.central, row.risk,
          priorityScore(row), row.risk >= 4 ? '是' : '否',
        ]);
      }
    }
    return out;
  }
  const head = [
    '提交编号', '提交时间', '部门', '姓名', '岗位', '填报用时(秒)',
    'Q1 岗位核心职责',
    'Q2 主要工作1', 'Q2 工作1日耗时', 'Q2 主要工作2', 'Q2 工作2日耗时', 'Q2 主要工作3', 'Q2 工作3日耗时',
    'Q3 使用系统', 'Q3 其他',
    'Q4 流程名称', 'Q4 触发条件', 'Q4 涉及环节', 'Q4 涉及系统', 'Q4 参与角色', 'Q4 整体耗时',
    'Q5 痛点标签', 'Q5 痛点说明',
    'Q6 任务数', 'Q6 最高优先分',
    'Q7 耗时根因', 'Q7 其他',
    'Q8 每周可省小时', 'Q8 时间用在哪',
    'Q9 期望场景', 'Q9 期望交付物',
    'Q10 须人工确认',
    'Q11 数据存放与权限',
    'Q12 安全合规要求',
    'Q13 验收指标', 'Q13 其他',
    'Q14 建议与顾虑',
  ];
  let out = '\uFEFF' + csvRow(head);
  for (const r of records) {
    const q2 = r.q2 || [];
    const q6 = r.q6 || [];
    const q9 = r.q9 || [];
    out += csvRow([
      r.id, r.submittedAt, r.meta?.dept, r.meta?.name, r.meta?.role,
      r.meta?.elapsedMs ? Math.round(r.meta.elapsedMs / 1000) : '',
      r.q1 || '',
      q2[0]?.task || '', q2[0]?.time || '', q2[1]?.task || '', q2[1]?.time || '', q2[2]?.task || '', q2[2]?.time || '',
      (r.q3 || []).join(' / '), r.q3Other || '',
      r.q4?.name || '', r.q4?.trigger || '', r.q4?.steps || '', r.q4?.systems || '', r.q4?.roles || '', r.q4?.duration || '',
      (r.q5?.tags || []).join(' / '), r.q5?.text || '',
      q6.length, q6.length ? Math.max(...q6.map(priorityScore)) : '',
      (r.q7 || []).join(' / '), r.q7Other || '',
      r.q8?.hours ?? '', r.q8?.usage || '',
      q9.map((x) => x.scene).filter(Boolean).join(' || '), q9.map((x) => x.deliverable).filter(Boolean).join(' / '),
      (r.q10 || []).join(' / '),
      r.q11 || '',
      (r.q12 || []).join(' / '),
      (r.q13 || []).join(' / '), r.q13Other || '',
      r.q14 || '',
    ]);
  }
  return out;
}

/* --------------------------------------------------------------- 路由 */

const authed = (url) => {
  const t = url.searchParams.get('t') || '';
  return TOKEN.length >= 16 && timingSafeEqual(t, TOKEN);
};

const server = createServer(async (req, res) => {
  const ip = clientIp(req);
  let url;
  try {
    url = new URL(req.url, 'http://127.0.0.1');
  } catch {
    return send(res, 400, 'text/plain; charset=utf-8', 'bad request');
  }
  const p = url.pathname;

  if (!rateLimit('all:' + ip, 240, 60_000)) return send(res, 429, 'text/plain; charset=utf-8', 'too many requests');
  if (req.method === 'OPTIONS') return send(res, 204, 'text/plain', '');

  try {
    if (p === '/survey' || p === '/survey/') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain; charset=utf-8', 'method not allowed');
      if (p === '/survey') return send(res, 302, 'text/plain; charset=utf-8', '', { Location: '/survey/' });
      return sendPage(res, 'index.html');
    }

    if (p === '/survey/index.html') return sendPage(res, 'index.html');

    if (p === '/survey/admin' || p === '/survey/admin/' || p === '/survey/admin.html') {
      if (!authed(url)) return send(res, 404, 'text/plain; charset=utf-8', 'not found');
      return sendPage(res, 'admin.html');
    }

    if (p === '/survey/healthz') return sendJson(res, 200, { ok: true, port: PORT });

    if (p === '/survey/api/submit') {
      if (req.method !== 'POST') return send(res, 405, 'text/plain; charset=utf-8', 'method not allowed');
      const ct = String(req.headers['content-type'] || '');
      if (!ct.includes('application/json')) return sendJson(res, 415, { ok: false, error: '请使用 application/json 提交' });
      if (!rateLimit('submit:' + ip, 6, 3_600_000)) {
        return sendJson(res, 429, { ok: false, error: '提交过于频繁，请稍后再试或联系调研发起人' });
      }
      let payload;
      try {
        payload = JSON.parse(await readBody(req));
      } catch (err) {
        const code = err.code === 413 ? 413 : 400;
        return sendJson(res, code, { ok: false, error: code === 413 ? '答卷内容过大' : 'JSON 解析失败' });
      }
      if (!payload || typeof payload !== 'object') return sendJson(res, 400, { ok: false, error: '答卷格式不正确' });
      if (str(payload.website, 100)) return sendJson(res, 200, { ok: true, id: 'ignored' }); // 蜜罐

      const { record, errors } = normalise(payload, req);
      if (errors) return sendJson(res, 400, { ok: false, error: errors.join('；'), errors });
      await appendRecord(record);
      log('submitted', record.id, record.meta.dept, 'q6=' + record.q6.length);
      return sendJson(res, 200, { ok: true, id: record.id, submittedAt: record.submittedAt });
    }

    if (p === '/survey/api/list') {
      if (!authed(url)) return sendJson(res, 404, { ok: false, error: 'not found' });
      const records = await loadAll();
      records.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
      return sendJson(res, 200, { ok: true, count: records.length, records });
    }

    if (p === '/survey/api/export.csv') {
      if (!authed(url)) return send(res, 404, 'text/plain; charset=utf-8', 'not found');
      const type = url.searchParams.get('type') === 'matrix' ? 'matrix' : 'all';
      const records = await loadAll();
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      return send(res, 200, 'text/csv; charset=utf-8', buildCsv(records, type), {
        'Content-Disposition': `attachment; filename="agent-survey-${type}-${stamp}.csv"`,
      });
    }

    return send(res, 404, 'text/plain; charset=utf-8', 'not found');
  } catch (err) {
    log('handler error', p, err && err.stack ? err.stack : err);
    return sendJson(res, 500, { ok: false, error: 'internal error' });
  }
});

async function ensureToken() {
  await mkdir(DATA_DIR, { recursive: true });
  if (TOKEN) return;
  try {
    TOKEN = (await readFile(TOKEN_FILE, 'utf8')).trim();
  } catch {
    /* 首次运行：生成并落盘 */
  }
  if (!TOKEN) {
    TOKEN = randomUUID().replace(/-/g, '');
    await writeFile(TOKEN_FILE, TOKEN + '\n', { mode: 0o600 });
    log('generated admin token ->', TOKEN_FILE);
  }
}

await ensureToken();
server.listen(PORT, BIND, () => {
  log(`survey collector listening on http://${BIND}:${PORT}  store=${STORE}`);
});
