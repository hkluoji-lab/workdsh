// 手册管理模块（HANDBOOK_ADMIN_V1）
//
// 设计约束（沿袭本仓库既有约定）：
//  1) 不新建对外监听端口、不改 Caddy —— /portal/* 与 /api/portal/* 在边缘已属免门禁前缀，
//     因此后端与前端都挂在这两个前缀之下即可被公网访问，无需触碰隧道与容器生命周期。
//  2) /api/portal/* 在 Caddy 层免门禁，所以**所有管理端点必须在本模块内自行校验会话与角色**。
//  3) 模块自包含：只依赖 node 核心模块，通过 handleHandbook(req,res,ctx) 接收 server.mjs 传入的
//     会话/鉴权/配置上下文，避免与 server.mjs 形成循环依赖。
//  4) 草稿 / 已发布双文件：编辑只动 draft.json，显式「发布」才覆盖 published.json 并存历史快照。
//     对外的 /api/portal/handbook/state 默认只读 published.json —— 未发布的内容不会泄漏到公网。
//
// 数据落点：/data/dsh/portal/handbook/{draft.json,published.json,history/,media/}

import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { readFile, writeFile, mkdir, readdir, stat, unlink, rename, copyFile } from 'node:fs/promises';
import { join, resolve, sep, extname } from 'node:path';

const HANDLE_PREFIXES = ['/portal/handbook', '/api/portal/handbook', '/portal/handbook-media',
  /* 书刊阅读页（多书）：/portal/book/<id> */
  '/portal/book'];

// 允许的页面类型。cover/toc/sec 走 HTML 正文；img/imgpair 走整页图片。
const PAGE_TYPES = new Set(['cover', 'toc', 'sec', 'img', 'imgpair', 'free']);
// 自由画布页（type=free）：设计宽度取 750 = 单页宽，因此桌面双页对开时不会被中缝劈开。
const CANVAS_W = 750;
const CANVAS_H = 1061;                 // 750 × 1.414 ≈ A4 纵向
const MAX_ELEMENTS = 150;              // 单页元素上限
const MAX_ELEMENT_HTML = 60 * 1024;    // 单个自定义 HTML 元素上限
const ELEMENT_KINDS = new Set(['text', 'image', 'button', 'rect', 'ellipse', 'divider', 'html',
  'icon', 'qrcode', 'video', 'gallery', 'form', 'countdown']);
// 图标库白名单：内联 SVG，不引外部图片，公网页无需放宽 img-src
const ICON_NAMES = new Set(['phone', 'mail', 'chat', 'star', 'check', 'location', 'clock', 'gift',
  'shield', 'cloud', 'wifi', 'chart', 'doc', 'user', 'arrow', 'cart', 'wrench', 'link']);
// 入场动效：所有元素通用（none 时不落库，避免给老数据添无意义字段）
const ANIM_NAMES = new Set(['none', 'fade', 'up', 'down', 'left', 'right', 'zoom']);
const FORM_FIELD_TYPES = new Set(['text', 'tel', 'email', 'textarea', 'select']);
const MAX_GALLERY_IMAGES = 12;
const MAX_FORM_FIELDS = 10;
const MAX_QR_TEXT = 600;
const MAX_TEMPLATES = 60;
const MAX_PAGES = 200;
const MAX_BODY_BYTES = 400 * 1024;      // 单页正文上限
const MAX_JSON_BYTES = 12 * 1024 * 1024; // 上传请求体上限（base64 后大于原始文件）
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const MAX_MEDIA_TOTAL = 120 * 1024 * 1024;
// 自托管视频：公网 CSP 没有 frame-src，第三方播放器（YouTube/B 站 iframe）结构性不可用，
// 因此只支持上传到本站图库的 mp4/webm。上传走 base64 JSON，8MB 原片约 10.7MB，
// 仍在 MAX_JSON_BYTES(12MB) 之内，不为了视频放宽请求体上限（容器内存敏感）。
const MAX_VIDEO_BYTES = 8 * 1024 * 1024;

const MIME_BY_EXT = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
};
const EXT_BY_MIME = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
  'video/mp4': '.mp4', 'video/webm': '.webm',
};
const VIDEO_EXTS = new Set(['.mp4', '.webm']);

// 可选：若本机存在 sharp 就把上传图压成 webp 再落盘（体积友好）。不存在则原样保存，不影响功能。
let sharp = null;
try {
  const req = createRequire(process.env.PORTAL_SHARP_BASE ?? '/data/dsh/profiles/web/node_modules/');
  sharp = req('sharp');
} catch { sharp = null; }

// 可选：二维码生成库（MIT）。与 sharp 同一路径口径；缺失时接口返回 503，
// 前端会显示占位而不是坏图 —— 不为了一个装饰性组件阻断整站。
let qrcodeLib = null;
try {
  const reqQr = createRequire(process.env.PORTAL_SHARP_BASE ?? '/data/dsh/profiles/web/node_modules/');
  qrcodeLib = reqQr('qrcode');
} catch { qrcodeLib = null; }

// 表单提交限流：IP → 最近提交时间戳数组（滑动窗口 1 小时，最多 20 次）
const FORM_HITS = new Map();

export function isHandbookPath(path) {
  return HANDLE_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));
}

/* ---------------- HTTP 小工具（自带安全头，不依赖 server.mjs 内部实现） ---------------- */

function baseHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    ...extra,
  };
}
function json(res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(status, baseHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
  }));
  res.end(body);
}
function fail(res, status, error, extra = {}) { json(res, status, { ok: false, error, ...extra }); }

const ADMIN_CSP = [
  "default-src 'none'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  // 自托管视频：没有 media-src 会回落到 default-src 'none'，<video> 直接被浏览器拦掉
  "media-src 'self'",
  "connect-src 'self'",
  "frame-src 'self'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

// 预览页会被后台以同源 iframe 引用，因此只放行同源嵌套；其余与后台一致。
// 注意：预览页的渲染脚本是页面内联的（单文件、不额外发请求），所以 script-src 必须放行
// 'unsafe-inline'，否则浏览器会整段拦截、预览区一片空白（2026-10-01 由真实浏览器实测发现）。
const PREVIEW_CSP = [
  "default-src 'none'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "media-src 'self'",
  "connect-src 'self'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join('; ');

// 后台静态资源白名单（name → Content-Type）
/* 阅读页 CSP：只放开同源脚本/样式、同源图片与同源接口。
   书刊页需要 fetch 本站 /api/portal/handbook/state，因此 connect-src 'self'。 */
const READER_CSP = [
  "default-src 'none'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

const SITE_ASSETS = {
  'admin.html': 'text/html; charset=utf-8',
  'preview.html': 'text/html; charset=utf-8',
  'page.css': 'text/css; charset=utf-8',
  'render.js': 'text/javascript; charset=utf-8',
  'free-editor.js': 'text/javascript; charset=utf-8',
  /* 书刊阅读器（HANDBOOK_MULTIBOOK_V1）：与静态单文件共用同一份引擎与样式，
     静态产物在 portal-work 里构建后同步到本目录，保证两端版式永远一致。 */
  'reader.css': 'text/css; charset=utf-8',
  'reader.js': 'text/javascript; charset=utf-8',
  'reader-boot.js': 'text/javascript; charset=utf-8',
};

async function readJsonBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('body too large'), { code: 'TOO_LARGE' });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw === '') return {};
  return JSON.parse(raw);
}

/* ---------------- 内容仓库 ---------------- */

export class HandbookStore {
  constructor(dir) {
    this.dir = dir;
    this.draftFile = join(dir, 'draft.json');
    this.publishedFile = join(dir, 'published.json');
    this.historyDir = join(dir, 'history');
    this.mediaDir = join(dir, 'media');
    this.editorsFile = join(dir, 'editors.json');
    this.submissionsFile = join(dir, 'submissions.jsonl');
    this.pagetemplatesFile = join(dir, 'pagetemplates.json');
    this.templatesDir = join(dir, 'templates');
    this.cache = new Map(); // 文件内容缓存：{ mtimeMs, value }
  }

  async init() {
    await mkdir(this.mediaDir, { recursive: true });
    await mkdir(this.historyDir, { recursive: true });
    await mkdir(this.templatesDir, { recursive: true });
  }

  async readJson(file, fallback = null) {
    try {
      const info = await stat(file);
      const cached = this.cache.get(file);
      if (cached && cached.mtimeMs === info.mtimeMs) return cached.value;
      const value = JSON.parse(await readFile(file, 'utf8'));
      this.cache.set(file, { mtimeMs: info.mtimeMs, value });
      return value;
    } catch {
      return fallback;
    }
  }

  async writeJson(file, value) {
    const tmp = file + '.tmp-' + process.pid + '-' + Date.now();
    await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
    await rename(tmp, file);
    this.cache.delete(file);
    return value;
  }

  draft() { return this.readJson(this.draftFile, null); }
  published() { return this.readJson(this.publishedFile, null); }
  saveDraft(doc) { return this.writeJson(this.draftFile, doc); }

  async publish() {
    const draft = await this.draft();
    if (!draft) throw new Error('no-draft');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    // 快照：发布前先固化「即将生效」的版本，便于回滚
    await this.writeJson(join(this.historyDir, 'v' + String(draft.rev ?? 0).padStart(4, '0') + '-' + stamp + '.json'), draft);
    await copyFile(this.draftFile, this.publishedFile).catch(async () => {
      await this.writeJson(this.publishedFile, draft);
    });
    this.cache.delete(this.publishedFile);
    return draft;
  }

  async history() {
    try {
      const names = (await readdir(this.historyDir)).filter((n) => n.endsWith('.json')).sort().reverse();
      const out = [];
      for (const name of names.slice(0, 30)) {
        const info = await stat(join(this.historyDir, name));
        out.push({ name, size: info.size, mtime: info.mtime.toISOString() });
      }
      return out;
    } catch { return []; }
  }

  async restore(name) {
    if (!/^[A-Za-z0-9._-]+\.json$/.test(name) || name.includes('..')) throw new Error('bad-snapshot');
    const doc = await this.readJson(join(this.historyDir, name), null);
    if (!doc) throw new Error('snapshot-not-found');
    doc.rev = (doc.rev ?? 0) + 1000; // 回滚也计入修订，避免与历史同名
    return this.saveDraft(doc);
  }

  /* 表单提交：只追加（JSONL），永不覆盖历史；读取时取最近 N 条。 */
  async appendSubmission(entry) {
    await appendFile(this.submissionsFile, JSON.stringify(entry) + '\n', 'utf8');
    return entry;
  }
  async submissions(limit = 50) {
    try {
      const raw = await readFile(this.submissionsFile, 'utf8');
      const lines = raw.split('\n').filter(Boolean);
      const out = [];
      for (const line of lines.slice(-Math.max(1, Math.min(limit, 500)))) {
        try { out.push(JSON.parse(line)); } catch { /* 跳过坏行，不影响其余记录 */ }
      }
      return out.reverse();
    } catch { return []; }
  }
  async submissionCount() {
    try { return (await readFile(this.submissionsFile, 'utf8')).split('\n').filter(Boolean).length; } catch { return 0; }
  }
  /* 页面模板库：把某一页（通常是自由画布页）存成可复用模板 */
  pageTemplates() { return this.readJson(this.pagetemplatesFile, []); }
  savePageTemplates(list) { return this.writeJson(this.pagetemplatesFile, list); }

  async mediaList() {
    try {
      const names = (await readdir(this.mediaDir)).filter((n) => !n.startsWith('.'));
      const out = [];
      let total = 0;
      for (const name of names) {
        const info = await stat(join(this.mediaDir, name));
        total += info.size;
        out.push({ name, size: info.size, mtime: info.mtime.toISOString() });
      }
      out.sort((a, b) => b.mtime.localeCompare(a.mtime));
      return { files: out, total };
    } catch { return { files: [], total: 0 }; }
  }

  async saveMedia(name, buffer) {
    const info = await this.mediaList();
    if (info.total + buffer.length > MAX_MEDIA_TOTAL) throw new Error('media-quota-exceeded');
    const tmp = join(this.mediaDir, '.' + name + '.tmp');
    await writeFile(tmp, buffer);
    await rename(tmp, join(this.mediaDir, name));
    return name;
  }

  async deleteMedia(name) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes('..')) throw new Error('bad-name');
    await unlink(join(this.mediaDir, name));
    return name;
  }

  // 编辑者白名单：管理员之外，允许被点名的账号编辑内容（需求 4）。
  async editors() {
    const doc = await this.readJson(this.editorsFile, null);
    const list = Array.isArray(doc && doc.editors) ? doc.editors : [];
    return list.map((x) => String(x)).filter((x) => /^[A-Za-z0-9._-]{1,64}$/.test(x));
  }
  async saveEditors(list) {
    await this.writeJson(this.editorsFile, { editors: list, updatedAt: new Date().toISOString() });
    return list;
  }
  async templates() {
    try {
      const names = (await readdir(this.templatesDir)).filter((n) => n.endsWith('.json')).sort();
      const out = [];
      for (const n of names) {
        const i = await stat(join(this.templatesDir, n));
        out.push({ name: n, size: i.size, mtime: i.mtime.toISOString() });
      }
      return out;
    } catch { return []; }
  }
}

/* ---------------- 校验与规范化 ---------------- */

function str(value, max) {
  const s = typeof value === 'string' ? value : (value == null ? '' : String(value));
  return s.length > max ? s.slice(0, max) : s;
}

function normalizePage(input, existing) {
  const now = new Date().toISOString();
  const type = PAGE_TYPES.has(input.type) ? input.type : (existing?.type ?? 'sec');
  const page = {
    id: existing?.id ?? 'pg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    type,
    label: str(input.label ?? existing?.label ?? '未命名', 80),
    updatedAt: now,
  };
  if (type === 'img' || type === 'imgpair') {
    page.title = str(input.title ?? existing?.title ?? '', 200);
    page.subtitle = str(input.subtitle ?? existing?.subtitle ?? '', 300);
    page.foot = str(input.foot ?? existing?.foot ?? '', 200);
    if (type === 'img') {
      page.image = mediaName(input.image ?? existing?.image ?? '');
    } else {
      const list = input.images ?? existing?.images ?? [];
      page.images = (Array.isArray(list) ? list : []).map(mediaName).filter(Boolean).slice(0, 4);
    }
  } else if (type === 'free') {
    page.title = str(input.title ?? existing?.title ?? '', 200);
    page.canvas = normalizeCanvas(input.canvas ?? existing?.canvas);
    const list = input.elements ?? existing?.elements ?? [];
    if (!Array.isArray(list)) throw new Error('bad-elements');
    if (list.length > MAX_ELEMENTS) throw new Error('too-many-elements');
    page.elements = list.map(normalizeElement).filter(Boolean);
  } else {
    page.title = str(input.title ?? existing?.title ?? '', 200);
    page.subtitle = str(input.subtitle ?? existing?.subtitle ?? '', 300);
    const body = input.body ?? existing?.body ?? '';
    if (Buffer.byteLength(String(body), 'utf8') > MAX_BODY_BYTES) throw new Error('body-too-large');
    page.body = String(body);
    /* 可选扩展（HANDBOOK_MULTIBOOK_V1）：只增字段，不改既有语义，
       因此现有手册的页面数据与后台表单完全不受影响。
       · theme   —— 眉标/章节号，如「01 · 业务覆盖」
       · image   —— 整页配图（img 类型之外的页面也用得到）
       · asset   —— srcset 用的资产基名，如 skills
       · caption —— 配图说明
       · foot    —— 页脚注释行 */
    const theme = str(input.theme ?? existing?.theme ?? '', 120);
    if (theme !== '') page.theme = theme;
    const image = mediaName(input.image ?? existing?.image ?? '');
    if (image !== '') page.image = image;
    const asset = str(input.asset ?? existing?.asset ?? '', 60);
    if (asset !== '' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(asset)) page.asset = asset;
    const caption = str(input.caption ?? existing?.caption ?? '', 200);
    if (caption !== '') page.caption = caption;
    const foot = str(input.foot ?? existing?.foot ?? '', 200);
    if (foot !== '') page.foot = foot;
  }
  return page;
}

/* 自由画布页：画布与元素的规范化。所有几何值都按设计尺寸（750×1061）保存，
   渲染时转成百分比，因此任意屏幕/任意缩放都不需要重新计算坐标。 */
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$|^rgba?\([0-9.,\s%]+\)$/;

function num(v, min, max, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, Math.round(n)));
}
function color(v, dflt) {
  const s = typeof v === 'string' ? v.trim() : '';
  return COLOR_RE.test(s) ? s : dflt;
}
function safeHref(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s === '') return '';
  return /^(https?:|tel:|mailto:|\/)/i.test(s) ? s.slice(0, 800) : '';
}
function normalizeCanvas(c) {
  const o = c && typeof c === 'object' ? c : {};
  return { w: CANVAS_W, h: CANVAS_H, bg: color(o.bg, '#ffffff') };
}
function normalizeElement(input) {
  if (!input || typeof input !== 'object') return null;
  const kind = ELEMENT_KINDS.has(input.kind) ? input.kind : 'text';
  const p = input.props && typeof input.props === 'object' ? input.props : {};
  const el = {
    id: /^el-[A-Za-z0-9-]{4,40}$/.test(String(input.id ?? ''))
      ? String(input.id)
      : 'el-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    kind,
    x: num(input.x, -CANVAS_W, CANVAS_W * 2, 0),
    y: num(input.y, -CANVAS_H, CANVAS_H * 2, 0),
    w: num(input.w, 4, CANVAS_W * 2, 240),
    h: num(input.h, 2, CANVAS_H * 2, 60),
    z: num(input.z, 0, 999, 1),
    props: {
      text: str(p.text ?? '', 2000),
      fontSize: num(p.fontSize, 8, 200, 22),
      color: color(p.color, '#15243a'),
      bg: p.bg ? color(p.bg, '') : '',
      weight: num(p.weight, 100, 900, 400),
      align: ['left', 'center', 'right'].includes(p.align) ? p.align : 'left',
      lineHeight: Math.round(Math.max(1, Math.min(3, Number(p.lineHeight) || 1.5)) * 100) / 100,
      radius: num(p.radius, 0, 400, 0),
      href: safeHref(p.href),
      image: p.image ? mediaName(p.image) : '',
      fit: ['cover', 'contain', 'fill'].includes(p.fit) ? p.fit : 'cover',
    },
  };
  // 入场动效：只在非默认时落库
  const anim = ANIM_NAMES.has(p.anim) ? p.anim : 'none';
  if (anim !== 'none') {
    el.props.anim = anim;
    const animDelay = num(p.animDelay, 0, 3000, 0);
    if (animDelay > 0) el.props.animDelay = animDelay;
  }
  // 图标：只认内置图标名，不开第二个「任意 SVG 注入」入口
  if (kind === 'icon') {
    el.props.icon = ICON_NAMES.has(p.icon) ? p.icon : 'check';
  }
  // 二维码：内容与配色，编码在渲染时由内联编码器完成（零外部请求）
  if (kind === 'qrcode') {
    el.props.qrText = str(p.qrText ?? '', MAX_QR_TEXT);
    el.props.qrEc = ['L', 'M', 'Q', 'H'].includes(p.qrEc) ? p.qrEc : 'M';
    el.props.qrFg = color(p.qrFg, '#15243a');
    el.props.qrBg = color(p.qrBg, '#ffffff');
  }
  // 视频：只允许站内图库文件
  if (kind === 'video') {
    el.props.video = p.video ? mediaName(p.video) : '';
    el.props.poster = p.poster ? mediaName(p.poster) : '';
    el.props.controls = p.controls !== false;
    el.props.autoplay = p.autoplay === true;
    el.props.loop = p.loop === true;
    el.props.muted = p.muted === true;
  }
  // 图集：站内图片数组 + 栅格参数
  if (kind === 'gallery') {
    const imgs = Array.isArray(p.images) ? p.images : [];
    el.props.images = imgs.map((n) => mediaName(n)).filter(Boolean).slice(0, MAX_GALLERY_IMAGES);
    el.props.cols = num(p.cols, 1, 4, 2);
    el.props.gap = num(p.gap, 0, 40, 8);
    el.props.captions = (Array.isArray(p.captions) ? p.captions : [])
      .slice(0, MAX_GALLERY_IMAGES).map((c) => str(c, 80));
  }
  // 表单：字段定义；提交落到 POST /api/portal/handbook/form（见 formSubmit 分支）
  if (kind === 'form') {
    const fields = Array.isArray(p.fields) ? p.fields : [];
    el.props.fields = fields.slice(0, MAX_FORM_FIELDS).map((f) => {
      const o = f && typeof f === 'object' ? f : {};
      return {
        label: str(o.label ?? '', 40),
        type: FORM_FIELD_TYPES.has(o.type) ? o.type : 'text',
        required: o.required === true,
        options: (Array.isArray(o.options) ? o.options : []).slice(0, 8).map((x) => str(x, 40)),
      };
    }).filter((f) => f.label !== '');
    el.props.submitText = str(p.submitText ?? '提交', 20);
    el.props.successText = str(p.successText ?? '已收到，我们会尽快联系你。', 120);
    el.props.note = str(p.note ?? '', 200);
  }
  // 倒计时：目标时间（ISO 字符串）与三段文案
  if (kind === 'countdown') {
    el.props.until = str(p.until ?? '', 40);
    el.props.label = str(p.label ?? '', 60);
    el.props.doneText = str(p.doneText ?? '活动已结束', 60);
  }
  // 分组：自由画布页「成组」的标记。字段必须在这里登记，否则会被白名单剥掉 ——
  // 表现就是「编辑时看着是组，保存重开后散组」。守卫：hbtest/group-roundtrip.mjs
  const gid = String(input.group ?? '');
  if (/^grp-[A-Za-z0-9-]{2,40}$/.test(gid)) el.group = gid;
  if (kind === 'html') {
    const h = String(p.html ?? '');
    if (Buffer.byteLength(h, 'utf8') > MAX_ELEMENT_HTML) throw new Error('element-html-too-large');
    el.props.html = h;
  }
  return el;
}

function mediaName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name === '') return '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes('..') || name.includes('/')) throw new Error('bad-media-name');
  return name;
}

// 自托管视频识别：mp4 以 ftyp box 起始；webm 以 EBML 魔数 1A 45 DF A3 起始。
// 只校验头部魔数（不解析容器），配合扩展名与体积上限使用。
function detectVideo(buffer, declaredMime) {
  if (buffer.length < 16) return null;
  const isMp4 = buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  const isWebm = buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
  if (isMp4) return '.mp4';
  if (isWebm) return '.webm';
  // 视频不看声明的 MIME：真实容器一定有魔数，允许按声明回落等于把任意字节存成视频
  return null;
}

function detectImage(buffer, declaredMime) {
  if (buffer.length < 12) return null;
  const isPng  = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isJpg  = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isGif  = buffer.subarray(0, 3).toString('ascii') === 'GIF';
  const isWebp = buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (isPng) return '.png';
  if (isJpg) return '.jpg';
  if (isGif) return '.gif';
  if (isWebp) return '.webp';
  if (EXT_BY_MIME[declaredMime]) return EXT_BY_MIME[declaredMime];
  return null;
}

/* ---------------- 路由 ---------------- */

export async function handleHandbook(req, res, ctx) {
  const { path, url, now, currentSession, requireAdmin, config, log } = ctx;
  /* 这本书是谁（HANDBOOK_MULTIBOOK_V1）：
     · /api/portal/handbook/admin/book/<id>/<action>  —— 后台按书切换用
     · ?book=<id>                                     —— 阅读页/兼容调用用
     缺省（''）= 现有手册，行为与地址完全不变。 */
  let bookSelector = str(url.searchParams.get('book') ?? '', 32);
  let adminAction = null;
  if (path.startsWith('/api/portal/handbook/admin/book/')) {
    const rest = path.slice('/api/portal/handbook/admin/book/'.length);
    const slash = rest.indexOf('/');
    bookSelector = slash >= 0 ? str(rest.slice(0, slash), 32) : str(rest, 32);
    adminAction = slash >= 0 ? rest.slice(slash + 1) : '';
  }
  let book;
  try {
    book = await resolveBook(ctx, bookSelector);
  } catch (error) {
    const code = String(error?.message ?? error);
    return fail(res, code === 'book-not-found' ? 404 : 400, code);
  }
  const store = bookStore(book.dir);
  const method = req.method ?? 'GET';

  /* --- 公开：媒体文件 --- */
  if (path.startsWith('/portal/handbook-media/')) {
    if (method !== 'GET' && method !== 'HEAD') return fail(res, 405, 'method-not-allowed');
    const name = path.slice('/portal/handbook-media/'.length);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes('..')) return fail(res, 404, 'not-found');
    const type = MIME_BY_EXT[extname(name).toLowerCase()];
    if (!type) return fail(res, 404, 'not-found');
    try {
      const file = join(store.mediaDir, name);
      if (!resolve(file).startsWith(resolve(store.mediaDir) + sep)) return fail(res, 404, 'not-found');
      const info = await stat(file);
      if (!info.isFile()) return fail(res, 404, 'not-found');
      const etag = 'W/"' + name + '-' + info.size + '-' + Math.round(info.mtimeMs) + '"';
      const headers = baseHeaders({
        'Content-Type': type,
        'Cache-Control': 'public, max-age=604800, immutable',
        'Content-Length': info.size,
        'ETag': etag,
      });
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, baseHeaders({ ETag: etag })); return res.end(); }
      // 视频要能拖进度条就必须支持 Range（单段）。没有它浏览器只能从头顺序播，
      // 拖动会被忽略。图片走原来的整文件 200 路径不受影响。
      const range = String(req.headers.range ?? '').trim();
      const rm = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (rm && (rm[1] !== '' || rm[2] !== '')) {
        let start = rm[1] === '' ? Math.max(0, info.size - Number(rm[2])) : Number(rm[1]);
        let end = rm[1] === '' ? info.size - 1 : (rm[2] === '' ? info.size - 1 : Number(rm[2]));
        if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= info.size) {
          res.writeHead(416, baseHeaders({ 'Content-Range': 'bytes */' + info.size }));
          return res.end();
        }
        end = Math.min(end, info.size - 1);
        res.writeHead(206, baseHeaders({
          'Content-Type': type,
          'Cache-Control': 'public, max-age=604800, immutable',
          'Content-Length': end - start + 1,
          'Content-Range': 'bytes ' + start + '-' + end + '/' + info.size,
          'Accept-Ranges': 'bytes',
          'ETag': etag,
        }));
        if (method === 'HEAD') return res.end();
        const { createReadStream } = await import('node:fs');
        return createReadStream(file, { start, end }).pipe(res);
      }
      headers['Accept-Ranges'] = 'bytes';
      res.writeHead(200, headers);
      if (method === 'HEAD') return res.end();
      const { createReadStream } = await import('node:fs');
      return createReadStream(file).pipe(res);
    } catch { return fail(res, 404, 'not-found'); }
  }

  /* --- 公开：手册内容（默认只返回已发布版本） --- */
  if (path === '/api/portal/handbook/state') {
    if (method !== 'GET' && method !== 'HEAD') return fail(res, 405, 'method-not-allowed');
    const session = currentSession(req, now);
    const isAdmin = Boolean(session && session.record.role === 'admin');
    const wantsDraft = url.searchParams.get('draft') === '1';
    const doc = (wantsDraft && isAdmin)
      ? (await store.draft()) ?? (await store.published())
      : (await store.published()) ?? (await store.draft());
    if (!doc) return fail(res, 503, 'handbook-empty');
    return json(res, 200, {
      ok: true,
      rev: doc.rev ?? 0,
      meta: doc.meta ?? {},
      pages: doc.pages ?? [],
      mode: (wantsDraft && isAdmin) ? 'draft' : 'published',
      mediaBase: '/portal/handbook-media/',
      book: { id: book.id, name: book.name },
    });
  }

  /* --- 公开：二维码（服务端生成，前端只放同源 <img>）
     为什么放在服务端：QR 编码（RS 纠错、掩码选择、版本信息）自己写极易出错，
     用成熟库几行就够，且公网页 CSP 的 img-src 'self' 天然允许。 --- */
  if (path === '/api/portal/handbook/qr') {
    if (method !== 'GET' && method !== 'HEAD') return fail(res, 405, 'method-not-allowed');
    const text = str(url.searchParams.get('t') ?? '', MAX_QR_TEXT);
    const rawEc = String(url.searchParams.get('ec') ?? 'M').toUpperCase();
    const ec = ['L', 'M', 'Q', 'H'].includes(rawEc) ? rawEc : 'M';
    const fg = color(url.searchParams.get('fg'), '#15243a');
    const bg = color(url.searchParams.get('bg'), '#ffffff');
    if (text === '') return fail(res, 400, 'empty-text');
    if (!qrcodeLib) return fail(res, 503, 'qr-unavailable');
    let svg = '';
    try {
      // 注意：qrcode 的 toString 不带回调时返回 Promise（一开始漏了 await → 500）
      svg = await qrcodeLib.toString(text, {
        type: 'svg', errorCorrectionLevel: ec, margin: 1,
        color: { dark: fg, light: bg },
      });
    } catch (error) {
      return fail(res, 400, 'qr-failed', { message: String(error?.message ?? error).slice(0, 80) });
    }
    const body = Buffer.from(svg, 'utf8');
    res.writeHead(200, baseHeaders({
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
      'Content-Length': body.length,
    }));
    return res.end(body);
  }

  /* --- 公开：自由画布页的表单提交 ---
     只收「本手册某一页上定义过的字段」，落 JSONL 追加，不做任何外发。
     限流按来源 IP 滑动窗口；蜜罐字段 _hp 被填即视为机器人，静默成功但不落库。 */
  if (path === '/api/portal/handbook/form') {
    if (method !== 'POST') return fail(res, 405, 'method-not-allowed');
    const body = await readJsonBody(req, 64 * 1024);
    if (String(body._hp ?? '') !== '') return json(res, 200, { ok: true, spam: true });
    const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
    const nowMs = Date.now();
    const hits = FORM_HITS.get(ip) ?? [];
    const recent = hits.filter((t) => nowMs - t < 3600 * 1000);
    if (recent.length >= 20) return fail(res, 429, 'too-many-submissions');
    recent.push(nowMs);
    FORM_HITS.set(ip, recent);
    if (FORM_HITS.size > 500) {
      for (const [k, v] of FORM_HITS) if (!v.some((t) => nowMs - t < 3600 * 1000)) FORM_HITS.delete(k);
    }
    const items = (Array.isArray(body.items) ? body.items : []).slice(0, MAX_FORM_FIELDS).map((it) => {
      const o = it && typeof it === 'object' ? it : {};
      return { label: str(o.label ?? '', 40), value: str(o.value ?? '', 500) };
    }).filter((it) => it.label !== '');
    if (items.length === 0) return fail(res, 400, 'empty-submission');
    // 必填校验在服务端也做一遍：前端被绕过时不能把空表单记成有效线索。
    // 依据是「该页面上 form 元素的字段定义」，而不是客户端传来的任何标志。
    // 已发布页与新草稿页都要找：新页往往还没发布就在试用。
    const pub = await store.published();
    const dr = await store.draft();
    const wantId = str(body.pageId ?? '', 60);
    const pg = (((pub && pub.pages) || []).concat((dr && dr.pages) || [])).find((p) => p.id === wantId);
    const formEl = pg && (pg.elements || []).find((e) => e.kind === 'form');
    if (formEl) {
      const defs = formEl.props.fields || [];
      const missing = defs.filter((f) => f.required && !items.some((it) => it.label === f.label && String(it.value).trim() !== ''));
      if (missing.length) return fail(res, 400, 'required-missing', { fields: missing.map((f) => f.label) });
    }
    const entry = {
      at: new Date(nowMs).toISOString(),
      pageId: str(body.pageId ?? '', 60),
      pageLabel: str(body.pageLabel ?? '', 80),
      items,
      ua: str(req.headers['user-agent'] ?? '', 200),
      ipHash: createHash('sha256').update(ip + '|handbook').digest('hex').slice(0, 16),
    };
    try {
      await store.appendSubmission(entry);
    } catch (error) {
      log?.('handbook.form.failed', { message: String(error?.message ?? error) });
      return fail(res, 500, 'store-failed');
    }
    log?.('handbook.form.received', { pageId: entry.pageId, fields: items.length });
    return json(res, 200, { ok: true });
  }

  /* --- 管理端页面与预览页 --- */
  /* 公开阅读页（HANDBOOK_MULTIBOOK_V1）：/portal/book/<id>
     与 /portal/products/*.html 的区别：这一版是"接口驱动"的，
     后台发布后刷新即见，不需要重新构建静态文件。 */
  if (path === '/portal/book' || path.startsWith('/portal/book/')) { /* MULTIBOOK_PROBE_2026 */
    if (method !== 'GET' && method !== 'HEAD') return fail(res, 405, 'method-not-allowed');
    const bookId = str(path.slice('/portal/book'.length).replace(/^\//, '').split('/')[0] ?? '', 32);
    let target;
    try {
      target = await resolveBook(ctx, bookId);
    } catch (error) {
      return fail(res, 404, String(error?.message ?? error));
    }
    try {
      const tpl = await readFile(join(config.handbookSiteDir, 'reader.html'), 'utf8');
      /* 标题与描述由这本书的 meta 驱动：阅读页静态模板只放占位，
         这样多本书共用一份模板也不会互相串标题。 */
      const store = bookStore(target.dir);
      const doc = (await store.published()) ?? (await store.draft());
      const meta = doc?.meta ?? {};
      const title = str(meta.title ?? target.name, 120);
      const sub = str(meta.subtitle ?? '', 200);
      const desc = str(meta.description ?? (title + '：' + sub), 300);
      const esc = (x) => String(x).replace(/[&<>"]/g, (ch) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[ch]));
      /* 阅读页也要能"从内容跳到管理"：只有登录且在该书编辑名单里的账号才注入入口，
         公网访客拿到的 HTML 里不含编辑链接。 */
      const session = currentSession(req, now);
      const isAdmin = Boolean(session && session.record && session.record.role === 'admin');
      const editorList = await store.editors();
      const isEditor = isAdmin || Boolean(session && editorList.includes(session.user));
      const cfg = {
        bookId: target.id,
        canEdit: isEditor,
        adminUrl: isEditor && target.id ? ('/portal/handbook/book/' + encodeURIComponent(target.id)) : '',
      };
      const html = tpl
        .replace('BOOKID_PLACEHOLDER', target.id)
        .replace('/*@CFG@*/', JSON.stringify(cfg))
        .replace('<!--@TITLE@-->', esc(title) + ' · 在线翻页电子书刊 | WorkDSH 企业级 AI 智能体工作台')
        .replace('<!--@DESC@-->', esc(desc));
      res.writeHead(200, baseHeaders({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': READER_CSP,
        'X-Book-Reader': 'v2',
      }));
      return res.end(html);
    } catch (error) {
      log?.('handbook.reader.missing', { message: String(error?.message ?? error) });
      return fail(res, 500, 'reader-missing');
    }
  }

  /* 多书后台页（HANDBOOK_MULTIBOOK_V1）：/portal/handbook/book/<id>
     复用同一份 admin.html，只在 <head> 注入 book 前缀改写。
     这样现有 /portal/handbook 一个字节都不受影响，也不必维护第二套后台 UI。 */
  if (path === '/portal/handbook/book' || path.startsWith('/portal/handbook/book/')) {
    if (method !== 'GET' && method !== 'HEAD') return fail(res, 405, 'method-not-allowed');
    const bookId = str(path.slice('/portal/handbook/book'.length).replace(/^\//, '').split('/')[0] ?? '', 32);
    let target;
    try {
      target = await resolveBook(ctx, bookId);
    } catch (error) {
      return fail(res, 404, String(error?.message ?? error));
    }
    try {
      const raw = await readFile(join(config.handbookSiteDir, 'admin.html'), 'utf8');
      res.writeHead(200, baseHeaders({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': ADMIN_CSP,
      }));
      return res.end(injectBookScope(raw, target));
    } catch (error) {
      log?.('handbook.admin.missing', { message: String(error?.message ?? error) });
      return fail(res, 500, 'admin-ui-missing');
    }
  }

  if (path === '/portal/handbook' || path === '/portal/handbook/' || path === '/portal/handbook/preview') {
    if (method !== 'GET' && method !== 'HEAD') return fail(res, 405, 'method-not-allowed');
    const isPreview = path === '/portal/handbook/preview';
    try {
      const html = await readFile(join(config.handbookSiteDir, isPreview ? 'preview.html' : 'admin.html'));
      res.writeHead(200, baseHeaders({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': isPreview ? PREVIEW_CSP : ADMIN_CSP,
      }));
      return res.end(html);
    } catch (error) {
      log?.('handbook.admin.missing', { message: String(error?.message ?? error) });
      return fail(res, 500, 'admin-ui-missing');
    }
  }

  /* --- 后台静态资源（白名单，避免目录穿越） --- */
  if (path.startsWith('/portal/handbook/asset/')) {
    if (method !== 'GET' && method !== 'HEAD') return fail(res, 405, 'method-not-allowed');
    const name = path.slice('/portal/handbook/asset/'.length);
    const type = SITE_ASSETS[name];
    if (!type) return fail(res, 404, 'not-found');
    try {
      const file = join(config.handbookSiteDir, name);
      if (!resolve(file).startsWith(resolve(config.handbookSiteDir) + sep)) return fail(res, 404, 'not-found');
      const body = await readFile(file);
      res.writeHead(200, baseHeaders({
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'Content-Length': body.length,
      }));
      return res.end(body);
    } catch { return fail(res, 404, 'not-found'); }
  }

  /* --- 管理端 API ---
     两级权限（需求 4）：
       · 编辑者（editor）= admin 角色，或在 editors.json 白名单里的账号 —— 可改内容、上传、发布、回滚；
       · 管理员（admin）= 仅 admin 角色 —— 可管理编辑者名单、导入模板（会整体替换内容）。
     内容编辑不再要求 admin，因此可以对外只开放「编辑」而保留「改权限/换模板」在我方手里。 */
  if (path.startsWith('/api/portal/handbook/admin/')) {
    const session = currentSession(req, now);
    const action = adminAction !== null ? adminAction : path.slice('/api/portal/handbook/admin/'.length);
    const isAdmin = Boolean(session && session.record && session.record.role === 'admin');
    const editorList = await store.editors();
    const isEditor = isAdmin || Boolean(session && editorList.includes(session.user));
    const ADMIN_ONLY = new Set(['editors', 'template/import', 'submissions']);
    const needAdmin = ADMIN_ONLY.has(action);
    if ((needAdmin && !isAdmin) || (!needAdmin && !isEditor)) {
      log?.('handbook.rejected', { user: session?.user ?? null, action, needAdmin });
      return json(res, 403, { ok: false, error: needAdmin ? 'admin-required' : 'editor-required' });
    }
    try {
      if (action === 'state' && (method === 'GET' || method === 'HEAD')) {
        const draft = (await store.draft()) ?? (await store.published());
        const published = await store.published();
        const media = await store.mediaList();
        return json(res, 200, {
          ok: true,
          draft, publishedRev: published?.rev ?? 0,
          media: media.files, mediaTotal: media.total,
          history: await store.history(),
          user: session.user,
          isAdmin,
          isEditor,
          editors: editorList,
          book: { id: book.id, name: book.name },
          books: [{ id: '', name: DEFAULT_BOOK.name }, ...(await readBooksRegistry(ctx.config.handbookDir))],
          sharp: Boolean(sharp),
          limits: {
            maxUploadBytes: MAX_UPLOAD_BYTES, maxPages: MAX_PAGES,
            maxElements: MAX_ELEMENTS, elementKinds: [...ELEMENT_KINDS],
            canvas: { w: CANVAS_W, h: CANVAS_H },
          },
        });
      }

      if ((method === 'POST' || method === 'PUT' || method === 'DELETE') && action === 'page') {
        const body = await readJsonBody(req, MAX_JSON_BYTES);
        const doc = (await store.draft()) ?? (await store.published());
        if (!doc) return fail(res, 503, 'handbook-empty');
        const index = body.id ? doc.pages.findIndex((p) => p.id === body.id) : -1;
        const page = normalizePage(body, index >= 0 ? doc.pages[index] : undefined);
        if (index >= 0) doc.pages[index] = page;
        else {
          if (doc.pages.length >= MAX_PAGES) return fail(res, 400, 'too-many-pages');
          const at = Number.isInteger(body.at) ? Math.max(0, Math.min(body.at, doc.pages.length)) : doc.pages.length;
          doc.pages.splice(at, 0, page);
        }
        doc.rev = (doc.rev ?? 0) + 1;
        doc.meta = { ...(doc.meta ?? {}), updatedAt: new Date().toISOString(), updatedBy: session.user };
        await store.saveDraft(doc);
        return json(res, 200, { ok: true, rev: doc.rev, page, index: doc.pages.findIndex((p) => p.id === page.id), pages: doc.pages.length });
      }

      if (method === 'POST' && action === 'page/delete') {
        const body = await readJsonBody(req, 64 * 1024);
        const doc = await store.draft();
        if (!doc) return fail(res, 503, 'handbook-empty');
        const before = doc.pages.length;
        doc.pages = doc.pages.filter((p) => p.id !== body.id);
        if (doc.pages.length === before) return fail(res, 404, 'page-not-found');
        doc.rev = (doc.rev ?? 0) + 1;
        doc.meta = { ...(doc.meta ?? {}), updatedAt: new Date().toISOString(), updatedBy: session.user };
        await store.saveDraft(doc);
        return json(res, 200, { ok: true, rev: doc.rev, pages: doc.pages.length });
      }

      if (method === 'POST' && action === 'page/move') {
        const body = await readJsonBody(req, 64 * 1024);
        const doc = await store.draft();
        if (!doc) return fail(res, 503, 'handbook-empty');
        const from = doc.pages.findIndex((p) => p.id === body.id);
        if (from < 0) return fail(res, 404, 'page-not-found');
        const to = body.to === 'first' ? 0
          : body.to === 'last' ? doc.pages.length - 1
          : Math.max(0, Math.min(from + (body.dir === 'up' ? -1 : 1), doc.pages.length - 1));
        const [moved] = doc.pages.splice(from, 1);
        doc.pages.splice(to, 0, moved);
        doc.rev = (doc.rev ?? 0) + 1;
        doc.meta = { ...(doc.meta ?? {}), updatedAt: new Date().toISOString(), updatedBy: session.user };
        await store.saveDraft(doc);
        return json(res, 200, { ok: true, rev: doc.rev, index: to });
      }

      if (method === 'POST' && action === 'page/duplicate') {
        const body = await readJsonBody(req, 64 * 1024);
        const doc = await store.draft();
        if (!doc) return fail(res, 503, 'handbook-empty');
        const from = doc.pages.findIndex((p) => p.id === body.id);
        if (from < 0) return fail(res, 404, 'page-not-found');
        const copy = JSON.parse(JSON.stringify(doc.pages[from]));
        copy.id = 'pg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
        copy.label = (copy.label ?? '副本') + '（副本）';
        doc.pages.splice(from + 1, 0, copy);
        doc.rev = (doc.rev ?? 0) + 1;
        await store.saveDraft(doc);
        return json(res, 200, { ok: true, rev: doc.rev, page: copy, index: from + 1, pages: doc.pages.length });
      }

      if (method === 'POST' && action === 'meta') {
        const body = await readJsonBody(req, 64 * 1024);
        const doc = (await store.draft()) ?? (await store.published());
        if (!doc) return fail(res, 503, 'handbook-empty');
        doc.meta = {
          ...(doc.meta ?? {}),
          title: str(body.title ?? doc.meta?.title ?? '', 120),
          subtitle: str(body.subtitle ?? doc.meta?.subtitle ?? '', 200),
          brand: str(body.brand ?? doc.meta?.brand ?? '', 120),
          updatedAt: new Date().toISOString(),
          updatedBy: session.user,
        };
        doc.rev = (doc.rev ?? 0) + 1;
        await store.saveDraft(doc);
        return json(res, 200, { ok: true, rev: doc.rev, meta: doc.meta });
      }

      if (method === 'POST' && action === 'upload') {
        const body = await readJsonBody(req, MAX_JSON_BYTES);
        const dataUrl = String(body.dataUrl ?? '');
        const m = dataUrl.match(/^data:([A-Za-z0-9/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/);
        if (!m) return fail(res, 400, 'invalid-data-url');
        const buffer = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
        if (buffer.length === 0) return fail(res, 400, 'empty-file');
        const wantsVideo = VIDEO_EXTS.has(EXT_BY_MIME[m[1]] ?? '');
        const limitBytes = wantsVideo ? MAX_VIDEO_BYTES : MAX_UPLOAD_BYTES;
        if (buffer.length > limitBytes) return fail(res, 413, 'file-too-large', { maxBytes: limitBytes });
        const ext = wantsVideo ? detectVideo(buffer, m[1]) : detectImage(buffer, m[1]);
        if (!ext) return fail(res, 415, wantsVideo ? 'unsupported-video-type' : 'unsupported-image-type');

        let payload = buffer;
        let outExt = ext;
        let optimized = false;
        if (sharp && !wantsVideo && ext !== '.gif') {
          try {
            payload = await sharp(buffer).rotate().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 78, effort: 5 }).toBuffer();
            outExt = '.webp';
            optimized = true;
          } catch { payload = buffer; outExt = ext; optimized = false; }
        }
        const slug = String(body.name ?? (wantsVideo ? 'video' : 'image')).toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
        const name = `${slug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}${outExt}`;
        await store.saveMedia(name, payload);
        log?.('handbook.media.saved', { name, bytes: payload.length, optimized });
        return json(res, 200, {
          ok: true, name, url: '/portal/handbook-media/' + name,
          bytes: payload.length, originalBytes: buffer.length, optimized, type: MIME_BY_EXT[outExt],
        });
      }

      if (method === 'POST' && action === 'media/delete') {
        const body = await readJsonBody(req, 64 * 1024);
        await store.deleteMedia(String(body.name ?? ''));
        return json(res, 200, { ok: true, name: body.name });
      }

      if (method === 'POST' && action === 'publish') {
        const draft = await store.draft();
        if (!draft) return fail(res, 503, 'handbook-empty');
        draft.rev = (draft.rev ?? 0) + 1;
        draft.meta = { ...(draft.meta ?? {}), updatedAt: new Date().toISOString(), updatedBy: session.user, publishedAt: new Date().toISOString() };
        await store.saveDraft(draft);
        const published = await store.publish();
        log?.('handbook.published', { rev: published.rev, pages: published.pages?.length, user: session.user });
        return json(res, 200, { ok: true, rev: published.rev, pages: published.pages?.length ?? 0 });
      }

      if (action === 'history' && (method === 'GET' || method === 'HEAD')) {
        return json(res, 200, { ok: true, history: await store.history() });
      }

      if (method === 'POST' && action === 'restore') {
        const body = await readJsonBody(req, 64 * 1024);
        const doc = await store.restore(String(body.name ?? ''));
        return json(res, 200, { ok: true, rev: doc.rev, pages: doc.pages?.length ?? 0 });
      }

      if (method === 'POST' && action === 'reset') {
        const published = await store.published();
        if (!published) return fail(res, 503, 'handbook-empty');
        const copy = JSON.parse(JSON.stringify(published));
        copy.rev = (published.rev ?? 0) + 1;
        await store.saveDraft(copy);
        return json(res, 200, { ok: true, rev: copy.rev, pages: copy.pages?.length ?? 0 });
      }

      if (action === 'editors' && (method === 'GET' || method === 'HEAD')) {
        return json(res, 200, { ok: true, editors: await store.editors() });
      }
      if (method === 'POST' && action === 'editors') {
        const body = await readJsonBody(req, 64 * 1024);
        const list = Array.isArray(body.editors) ? body.editors : [];
        const clean = [...new Set(list.map((x) => String(x).trim()).filter((x) => /^[A-Za-z0-9._-]{1,64}$/.test(x)))].slice(0, 50);
        await store.saveEditors(clean);
        log?.('handbook.editors.saved', { by: session.user, count: clean.length });
        return json(res, 200, { ok: true, editors: clean });
      }
      // 模板导出：把当前草稿（或已发布）整包导出为 JSON，可在另一套部署里导入 —— 即「可复制使用的模板」。
      if (action === 'template/export' && (method === 'GET' || method === 'HEAD')) {
        const doc = (await store.draft()) ?? (await store.published());
        if (!doc) return fail(res, 503, 'handbook-empty');
        const name = String(url.searchParams.get('name') ?? 'handbook-template').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 60) || 'handbook-template';
        const payload = Buffer.from(JSON.stringify({
          kind: 'workdsh-handbook-template', version: 1,
          exportedAt: new Date().toISOString(), importedFrom: session.user, doc,
        }, null, 2), 'utf8');
        res.writeHead(200, baseHeaders({
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'attachment; filename="' + name + '.json"',
          'Cache-Control': 'no-store',
          'Content-Length': payload.length,
        }));
        return res.end(payload);
      }
      if (method === 'POST' && action === 'template/import') {
        const body = await readJsonBody(req, MAX_JSON_BYTES);
        const src = body && body.doc ? body.doc : body;
        if (!src || !Array.isArray(src.pages) || src.pages.length === 0) return fail(res, 400, 'bad-template');
        if (src.pages.length > MAX_PAGES) return fail(res, 400, 'too-many-pages');
        const meta = src.meta && typeof src.meta === 'object' ? src.meta : {};
        const doc = {
          rev: (((await store.draft()) ?? (await store.published()))?.rev ?? 0) + 1,
          meta: {
            title: str(meta.title ?? '', 120) || '政企服务手册',
            subtitle: str(meta.subtitle ?? '', 200),
            brand: str(meta.brand ?? '', 120),
            updatedAt: new Date().toISOString(),
            updatedBy: session.user,
          },
          // 保留原页 id：目录里的 data-goto="pg-03" 依赖它，重编 id 会让跳转全部失效。
          pages: src.pages.map((p) => normalizePage(p, p && p.id ? { id: String(p.id) } : undefined)),
        };
        await store.saveDraft(doc);
        log?.('handbook.template.imported', { by: session.user, pages: doc.pages.length });
        return json(res, 200, { ok: true, rev: doc.rev, pages: doc.pages.length });
      }
      // 表单提交记录（含访客填写内容 → 仅管理员可见）
      if (action === 'submissions' && (method === 'GET' || method === 'HEAD')) {
        const limit = Number(url.searchParams.get('limit') ?? 50);
        return json(res, 200, {
          ok: true,
          total: await store.submissionCount(),
          items: await store.submissions(Number.isFinite(limit) ? limit : 50),
        });
      }

      // 发布前差异：草稿 vs 已发布，逐页给出 新增/删除/改动/未变 与改动点
      if (action === 'diff' && (method === 'GET' || method === 'HEAD')) {
        const draft = (await store.draft()) ?? (await store.published());
        const published = await store.published();
        if (!draft) return fail(res, 503, 'handbook-empty');
        const pubById = new Map(((published && published.pages) || []).map((p) => [p.id, p]));
        const draftIds = new Set((draft.pages || []).map((p) => p.id));
        const describe = (a, b) => {
          const out = [];
          if (a.type !== b.type) out.push('类型：' + a.type + ' → ' + b.type);
          if ((a.label || '') !== (b.label || '')) out.push('名称：' + (a.label || '') + ' → ' + (b.label || ''));
          if ((a.title || '') !== (b.title || '')) out.push('标题有改动');
          if ((a.subtitle || '') !== (b.subtitle || '')) out.push('副标题有改动');
          const ae = a.elements || [], be = b.elements || [];
          if (ae.length !== be.length) out.push('元素数：' + be.length + ' → ' + ae.length);
          else {
            const byId = new Map(be.map((e) => [e.id, e]));
            let changed = 0, added = 0;
            for (const e of ae) {
              const old = byId.get(e.id);
              if (!old) { added += 1; continue; }
              if (JSON.stringify(old) !== JSON.stringify(e)) changed += 1;
            }
            if (added) out.push('新增元素 ' + added + ' 个');
            if (changed) out.push('改动元素 ' + changed + ' 个');
            // 兜底：元素集合逐项相同但整体序列化仍不同（例如顺序变了）
            if (!added && !changed && ae.length && JSON.stringify(ae) !== JSON.stringify(be)) out.push('元素顺序或元数据有微调');
          }
          if (!out.length) {
            const lb = Buffer.byteLength(String(a.body ?? ''), 'utf8');
            const ob = Buffer.byteLength(String(b.body ?? ''), 'utf8');
            if (lb !== ob) out.push('正文长度：' + ob + ' → ' + lb + ' 字节');
            else if (JSON.stringify(a) !== JSON.stringify(b)) out.push('元数据有改动');
          }
          return out;
        };
        const pages = [];
        for (const p of draft.pages || []) {
          const old = pubById.get(p.id);
          if (!old) { pages.push({ id: p.id, label: p.label, type: p.type, status: 'added', fields: [] }); continue; }
          const fields = describe(p, old);
          pages.push({ id: p.id, label: p.label, type: p.type, status: fields.length ? 'changed' : 'same', fields });
        }
        for (const p of (published && published.pages) || []) {
          if (!draftIds.has(p.id)) pages.push({ id: p.id, label: p.label, type: p.type, status: 'removed', fields: [] });
        }
        const summary = { added: 0, removed: 0, changed: 0, same: 0 };
        pages.forEach((p) => { summary[p.status] = (summary[p.status] || 0) + 1; });
        return json(res, 200, {
          ok: true,
          draftRev: draft.rev ?? 0,
          publishedRev: (published && published.rev) ?? 0,
          neverPublished: !published,
          summary, pages,
        });
      }

      // 页面模板库：把整页（画布 + 元素）存成可复用模板，在任意位置再落一页
      if (action === 'pagetemplates' && (method === 'GET' || method === 'HEAD')) {
        const list = await store.pageTemplates();
        return json(res, 200, {
          ok: true,
          templates: list.map((t) => ({
            id: t.id, name: t.name, createdAt: t.createdAt, createdBy: t.createdBy,
            type: t.page?.type ?? 'free',
            elements: Array.isArray(t.page?.elements) ? t.page.elements.length : 0,
            label: t.page?.label ?? '',
          })),
        });
      }
      if (method === 'POST' && action === 'pagetemplates') {
        const body = await readJsonBody(req, MAX_JSON_BYTES);
        const name = str(body.name ?? '', 60).trim();
        if (!name) return fail(res, 400, 'name-required');
        const src = body.page && typeof body.page === 'object' ? body.page : null;
        if (!src) return fail(res, 400, 'page-required');
        const page = normalizePage({ ...src, id: undefined }, undefined);
        const list = await store.pageTemplates();
        if (list.length >= MAX_TEMPLATES) return fail(res, 400, 'too-many-templates', { max: MAX_TEMPLATES });
        const item = {
          id: 'tpl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
          name,
          createdAt: new Date().toISOString(),
          createdBy: session.user,
          page,
        };
        list.unshift(item);
        await store.savePageTemplates(list);
        log?.('handbook.pagetemplate.saved', { by: session.user, name, type: page.type });
        return json(res, 200, { ok: true, id: item.id, name: item.name, count: list.length });
      }
      if (method === 'POST' && action === 'pagetemplates/delete') {
        const body = await readJsonBody(req, 64 * 1024);
        const list = await store.pageTemplates();
        const next = list.filter((t) => t.id !== body.id);
        if (next.length === list.length) return fail(res, 404, 'template-not-found');
        await store.savePageTemplates(next);
        return json(res, 200, { ok: true, count: next.length });
      }
      if (method === 'POST' && action === 'pagetemplates/apply') {
        const body = await readJsonBody(req, 64 * 1024);
        const list = await store.pageTemplates();
        const tpl = list.find((t) => t.id === body.id);
        if (!tpl) return fail(res, 404, 'template-not-found');
        const doc = (await store.draft()) ?? (await store.published());
        if (!doc) return fail(res, 503, 'handbook-empty');
        if ((doc.pages || []).length >= MAX_PAGES) return fail(res, 400, 'too-many-pages');
        // 新页取新 id（目录跳转靠 id，模板复用时不能撞车）
        const page = normalizePage({ ...tpl.page, id: undefined }, undefined);
        const at = Number.isInteger(body.at) ? Math.max(0, Math.min(body.at, doc.pages.length)) : doc.pages.length;
        doc.pages.splice(at, 0, page);
        doc.rev = (doc.rev ?? 0) + 1;
        doc.meta = { ...(doc.meta ?? {}), updatedAt: new Date().toISOString(), updatedBy: session.user };
        await store.saveDraft(doc);
        log?.('handbook.pagetemplate.applied', { by: session.user, name: tpl.name, at });
        return json(res, 200, { ok: true, rev: doc.rev, page, index: at, pages: doc.pages.length });
      }

      return fail(res, 404, 'unknown-action', { action });
    } catch (error) {
      const code = String(error?.message ?? error);
      log?.('handbook.error', { action, message: code });
      if (code === 'TOO_LARGE') return fail(res, 413, 'body-too-large');
      return fail(res, 400, code);
    }
  }

  return fail(res, 404, 'not-found');
}

/* 把后台页"绑"到某一本书：只改写入路径，不改任何界面逻辑。
   admin.html 里所有管理请求都走 fetch('/api/portal/handbook/admin/' + path)，
   因此把该前缀改写成 /api/portal/handbook/admin/book/<id>/ 即可整站按书隔离；
   另外暴露 window.__HB_BOOK__ 让页面标题等处可显示书名。 */
function injectBookScope(html, book) {
  const idJson = JSON.stringify(book.id);
  const nameJson = JSON.stringify(book.name);
  const patch = `<script>
(function(){
  window.__HB_BOOK__ = { id: ${idJson}, name: ${nameJson} };
  var PREFIX = '/api/portal/handbook/admin/';
  var SCOPED = PREFIX + 'book/' + encodeURIComponent(${idJson}) + '/';
  var orig = window.fetch;
  window.fetch = function(input, init){
    try {
      if (typeof input === 'string' && input.indexOf(PREFIX) === 0 && input.indexOf(SCOPED) !== 0) {
        input = SCOPED + input.slice(PREFIX.length);
      }
    } catch (e) {}
    return orig.call(this, input, init);
  };
  try {
    document.title = ${nameJson} + ' · 内容管理';
    var t = document.querySelector('.brand .tt') || document.querySelector('header b');
    if (t) t.textContent = ${nameJson};
  } catch (e) {}
})();
<\/script>`;
  return html.includes('</head>') ? html.replace('</head>', patch + '</head>') : patch + html;
}

/* ---------------- store 实例（支持多本书） ----------------

   多书设计（HANDBOOK_MULTIBOOK_V1）：
   · 默认书（id = ''）仍指向 config.handbookDir —— 现有手册及其全部接口地址不变；
   · 其它书由 handbookDir/books.json 注册，目录是 handbookDir 下的子目录；
   · 书标识与目录名都做白名单校验，杜绝用 bookId 做目录穿越；
   · store 按目录缓存，切换书籍不会互相覆盖缓存（原实现是单例，会被 dir 变化顶掉）。 */

const BOOK_ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const BOOKS_FILE = 'books.json';
let booksCache = null;

const DEFAULT_BOOK = Object.freeze({ id: '', name: '政企事业服务手册', dir: '' });

async function readBooksRegistry(baseDir) {
  try {
    const info = await stat(join(baseDir, BOOKS_FILE));
    if (booksCache && booksCache.mtimeMs === info.mtimeMs) return booksCache.list;
    const raw = JSON.parse(await readFile(join(baseDir, BOOKS_FILE), 'utf8'));
    const list = Array.isArray(raw?.books) ? raw.books : [];
    const clean = [];
    for (const b of list) {
      const id = str(b?.id ?? '', 32);
      const dir = str(b?.dir ?? '', 64);
      if (!BOOK_ID_RE.test(id) || !dir || dir.includes('..') || dir.includes('/') || dir.includes(sep)) continue;
      clean.push({ id, name: str(b?.name ?? id, 80), dir, createdAt: b?.createdAt ?? null });
    }
    booksCache = { mtimeMs: info.mtimeMs, list: clean };
    return clean;
  } catch {
    booksCache = null;
    return [];
  }
}

async function resolveBook(ctx, bookId) {
  const baseDir = ctx.config.handbookDir;
  const id = str(bookId ?? '', 32);
  if (id === '') return { ...DEFAULT_BOOK, dir: baseDir };
  if (!BOOK_ID_RE.test(id)) throw new Error('bad-book-id');
  const list = await readBooksRegistry(baseDir);
  const found = list.find((b) => b.id === id);
  if (!found) throw new Error('book-not-found');
  return { id: found.id, name: found.name, dir: join(baseDir, found.dir) };
}

const storeCache = new Map();
function bookStore(dir) {
  let st = storeCache.get(dir);
  if (!st) {
    st = new HandbookStore(dir);
    st.init().catch(() => {});
    storeCache.set(dir, st);
  }
  return st;
}
function getStore(ctx, bookId) {
  const baseDir = ctx.config.handbookDir;
  const id = str(bookId ?? '', 32);
  if (id === '') return bookStore(baseDir);
  // 同步回退路径：resolveBook 是异步的，调用方需自行 await 后再取 store；
  // 这里仅保证默认书与已解析过的书可用。
  const cached = [...storeCache.keys()].find((d) => d.startsWith(baseDir + sep) && d.endsWith(sep + id));
  return cached ? bookStore(cached) : bookStore(baseDir);
}
