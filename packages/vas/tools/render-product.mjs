/**
 * 增值业务产品页 —— 多页站点渲染器
 *
 * 站点结构（全部挂在门户免鉴权的 /portal/products/ 前缀下）：
 *   <id>.html                   产品总览页（业务表数字化：产品 × 月租 × 套餐内容）
 *   <id>-<product>.html         每个产品一个独立详情页
 *   <id>-pricing.html           资费总表页（全部档位平铺，含原文依据）
 *   <id>-order.html             需求登记页
 *
 * CSP 约束（门户对产品页下发 default-src 'none'）：每一页都是单文件自包含，
 * 样式与脚本内联、零外部请求；页间跳转只用相对链接。
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export const PRODUCT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/* ------------------------------------------------------------------ 校验 */

const TIER_TYPES = new Set(['monthly', 'onetime']);

export function validateProduct(data) {
  const errors = [];
  const warnings = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };

  need(data && typeof data === 'object' && !Array.isArray(data), '数据不是对象');
  if (errors.length) return { ok: false, errors, warnings };

  need(typeof data.id === 'string' && PRODUCT_ID_RE.test(data.id), 'id 缺失或含非法字符');
  need(data.meta && typeof data.meta === 'object', 'meta 缺失');
  need(data.catalog && typeof data.catalog === 'object', 'catalog 缺失');
  need(Array.isArray(data.benefits) && data.benefits.length > 0, 'benefits 必须是非空数组');
  need(Array.isArray(data.categories) && data.categories.length > 0, 'categories 必须是非空数组');
  need(Array.isArray(data.products) && data.products.length > 0, 'products 必须是非空数组');
  need(Array.isArray(data.scenes) && data.scenes.length > 0, 'scenes 必须是非空数组');
  need(Array.isArray(data.faq), 'faq 必须是数组');
  need(Array.isArray(data.terms), 'terms 必须是数组');
  if (errors.length) return { ok: false, errors, warnings };

  for (const [i, b] of data.benefits.entries()) {
    for (const f of ['id', 'name', 'desc']) {
      if (typeof b?.[f] !== 'string' || !b[f]) errors.push(`benefits[${i}] 缺少 ${f}`);
    }
  }
  const benefitIds = new Set(data.benefits.map((b) => b.id));
  const categoryIds = new Set(data.categories.map((c) => c.id));

  const tierIds = new Set();
  const productIds = new Set();
  for (const [i, p] of data.products.entries()) {
    const tag = `products[${i}](${p?.id ?? '?'})`;
    for (const f of ['id', 'name', 'tagline', 'feature']) {
      if (typeof p?.[f] !== 'string' || !p[f]) errors.push(`${tag} 缺少 ${f}`);
    }
    if (p?.id && productIds.has(p.id)) errors.push(`${tag} id 重复`);
    if (p?.id) productIds.add(p.id);
    if (p?.category && !categoryIds.has(p.category)) errors.push(`${tag} 的 category「${p.category}」不在 categories 中`);
    if (!Array.isArray(p?.tiers) || p.tiers.length === 0) {
      errors.push(`${tag} 必须至少有一个资费档位`);
    } else {
      for (const [j, t] of p.tiers.entries()) {
        const ttag = `${tag}.tiers[${j}](${t?.id ?? '?'})`;
        for (const f of ['id', 'name', 'unit']) {
          if (typeof t?.[f] !== 'string' || !t[f]) errors.push(`${ttag} 缺少 ${f}`);
        }
        if (typeof t?.price !== 'number' || !Number.isFinite(t.price) || t.price <= 0) {
          errors.push(`${ttag} price 必须是正数`);
        }
        if (!TIER_TYPES.has(t?.type)) errors.push(`${ttag} type 必须是 monthly 或 onetime`);
        if (t?.id && tierIds.has(t.id)) errors.push(`${ttag} id 与其他档位重复`);
        if (t?.id) tierIds.add(t.id);
      }
    }
    for (const b of (p?.benefits ?? [])) {
      if (!benefitIds.has(b)) errors.push(`${tag} 引用了不存在的价值维度 ${b}`);
    }
    if (!Array.isArray(p?.scenarios)) errors.push(`${tag} scenarios 必须是数组`);
  }

  const sceneKeys = new Set();
  for (const [i, s] of data.scenes.entries()) {
    const tag = `scenes[${i}](${s?.key ?? '?'})`;
    for (const f of ['key', 'title', 'who', 'need']) {
      if (typeof s?.[f] !== 'string' || !s[f]) errors.push(`${tag} 缺少 ${f}`);
    }
    if (s?.key && sceneKeys.has(s.key)) errors.push(`${tag} key 重复`);
    if (s?.key) sceneKeys.add(s.key);
    if (!Array.isArray(s?.products) || s.products.length === 0) {
      errors.push(`${tag} products 必须是非空数组`);
      continue;
    }
    for (const id of s.products) {
      if (!productIds.has(id)) errors.push(`${tag} 引用了不存在的产品 ${id}`);
    }
    if (s.main && !s.products.includes(s.main)) {
      errors.push(`${tag} 的 main「${s.main}」不在本场景 products 内`);
    }
  }

  for (const p of data.products) {
    if (!p.quotes || !p.quotes.length) warnings.push(`产品「${p.name}」缺少原文依据（quotes）`);
    if (!p.tiers.some((t) => t.type === 'monthly')) {
      warnings.push(`产品「${p.name}」没有月租档位（原文是否为填空项？）`);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

/* ------------------------------------------------------------------ 工具 */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
const money = (n) => Number(n).toLocaleString('zh-CN');

/** 产品详情页文件名：<站点id>-<产品短名>.html */
export function pageName(siteId, productId) {
  return `${siteId}-${String(productId).replace(/^vas-/, '')}.html`;
}

const monthlyOf = (p) => (p.tiers || []).filter((t) => t.type === 'monthly');
const onetimeOf = (p) => (p.tiers || []).filter((t) => t.type === 'onetime');

/** 月租概览：没有月租档位时明确说明是原文填空项，绝不臆造金额 */
export function rentSummary(p) {
  const m = monthlyOf(p);
  if (!m.length) return { text: '受理时填写', note: '受理登记表原文为填空项，未给定标准月租', empty: true };
  const prices = m.map((t) => t.price);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const unit = m[0].unit.replace(/^元\//, '');
  return { text: lo === hi ? `${lo} 元/${unit}` : `${lo}–${hi} 元/${unit}`, note: `${m.length} 档可选`, empty: false };
}

/* ------------------------------------------------------------------ 样式 */

/**
 * 总览页「一行一产品」的行色相：同一套深蓝底，用不同色相的辉光区分产品，
 * 色相同时用于该行的悬浮描边与快速定位胶囊的圆点。同一个数组既生成 CSS
 * 变量、也生成页面上的圆点颜色，避免两处漂移。
 */
const ROW_ACCENTS = [
  { key: 'c0', c: '#7c3aed', deep: '#2c1a6d', glow: 'rgba(124,58,237,.50)' },
  { key: 'c1', c: '#0a4ea3', deep: '#062f66', glow: 'rgba(47,140,240,.50)' },
  { key: 'c2', c: '#0e7490', deep: '#083c4a', glow: 'rgba(18,168,196,.46)' },
  { key: 'c3', c: '#b45309', deep: '#5f3208', glow: 'rgba(232,140,44,.44)' },
  { key: 'c4', c: '#be123c', deep: '#5c0c20', glow: 'rgba(232,60,100,.44)' },
];
const accentOf = (i) => ROW_ACCENTS[i % ROW_ACCENTS.length];
const ACCENT_CSS = ROW_ACCENTS
  .map((a) => `.pc--${a.key}{--pc:${a.c};--pc-deep:${a.deep};--pc-glow:${a.glow}}`)
  .join('\n');

const CSS = `
:root{
  --brand:#0a4ea3;--brand-deep:#062f66;--brand-soft:#eaf1fb;--brand-line:#c3d5ec;
  --accent:#e8722c;--accent-soft:#fdf1e7;--accent-line:#f3d6bf;
  --ink:#15243a;--ink2:#40536e;--ink3:#7386a0;
  --line:#dde5ef;--line-soft:#eef3f9;--bg:#fff;--bg-tint:#f5f8fc;
  --ok:#1c7a4a;--err:#c0392b;--warn:#8a6100;
  --font:"PingFang SC","Microsoft YaHei","Hiragino Sans GB","Noto Sans CJK SC","Source Han Sans SC","WenQuanYi Micro Hei",system-ui,-apple-system,"Segoe UI",sans-serif;
  --mono:"SF Mono","JetBrains Mono","DejaVu Sans Mono",Consolas,monospace;
  --display:"Impact","Arial Black","Helvetica Neue",Arial,"PingFang SC",sans-serif;
  --shell:1180px;--r:10px;--r-lg:16px;
  --sh1:0 1px 2px rgba(16,38,68,.06),0 1px 3px rgba(16,38,68,.05);
  --sh2:0 6px 20px rgba(16,38,68,.09);
}
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;font:16px/1.65 var(--font);color:var(--ink);background:var(--bg);-webkit-font-smoothing:antialiased}
h1,h2,h3,h4{margin:0 0 .6rem;line-height:1.28;font-weight:700;letter-spacing:-.01em}
p{margin:0 0 .75rem}
a{color:var(--brand);text-underline-offset:3px}
a:hover{color:var(--brand-deep)}
b,strong{font-weight:700}
[hidden]{display:none!important}
:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(10,78,163,.3);border-radius:6px}
.shell{width:100%;max-width:var(--shell);margin-inline:auto;padding-inline:24px}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.skip{position:absolute;left:-9999px;top:0;z-index:99;background:var(--brand);color:#fff;padding:10px 16px}
.skip:focus{left:16px;top:12px;color:#fff}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font:inherit;font-weight:600;line-height:1.2;
  padding:11px 19px;border-radius:8px;border:1px solid transparent;cursor:pointer;text-decoration:none;
  transition:background .16s,border-color .16s,color .16s}
.btn--primary{background:var(--brand);color:#fff}
.btn--primary:hover{background:var(--brand-deep);color:#fff}
.btn--ghost{background:transparent;color:var(--brand);border-color:var(--brand-line)}
.btn--ghost:hover{background:var(--brand-soft)}
.btn--quiet{background:#fff;color:var(--ink2);border-color:var(--line)}
.btn--quiet:hover{border-color:var(--brand-line);color:var(--brand)}
.btn--sm{padding:7px 13px;font-size:14px}
.btn[disabled]{opacity:.55;cursor:not-allowed}

.hdr{position:sticky;top:0;z-index:40;background:rgba(255,255,255,.95);backdrop-filter:saturate(180%) blur(10px);border-bottom:1px solid var(--line)}
.hdr__in{display:flex;align-items:center;gap:14px;min-height:64px;flex-wrap:wrap}
.hdr__brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink);flex:0 0 auto}
.hdr__mark{width:30px;height:30px;border-radius:8px;background:var(--brand);display:grid;place-items:center;color:#fff;font-weight:700;font-size:15px;flex:0 0 auto}
.hdr__txt{display:flex;flex-direction:column;line-height:1.2}
.hdr__txt b{font-size:15px;letter-spacing:.02em}
.hdr__txt span{font-size:12px;color:var(--ink3)}
.nav{display:flex;align-items:center;gap:2px;margin-left:auto;flex-wrap:wrap}
.nav a{white-space:nowrap;text-decoration:none;color:var(--ink2);font-size:14px;font-weight:600;padding:7px 11px;border-radius:7px}
.nav a:hover{background:var(--brand-soft);color:var(--brand)}
.nav a.on{background:var(--brand-soft);color:var(--brand)}
.nav__toggle{display:none;margin-left:auto;font:inherit;font-weight:600;background:#fff;border:1px solid var(--line);border-radius:8px;padding:7px 13px;cursor:pointer;color:var(--ink2)}
.crumbs{font-size:13px;color:var(--ink3);padding:14px 0 0}
.crumbs a{color:var(--ink3)}
.crumbs a:hover{color:var(--brand)}
.crumbs span{margin:0 6px}

.phead{background:radial-gradient(1000px 380px at 86% -20%,#dbe8fa 0,rgba(219,232,250,0) 62%),linear-gradient(180deg,#f7fafd,#fff);border-bottom:1px solid var(--line-soft);padding:32px 0 28px}
.phead h1{font-size:clamp(23px,17px+1.6vw,34px);margin:0 0 8px}
.phead__cat{display:inline-block;font-size:12px;font-weight:700;color:var(--brand);background:var(--brand-soft);padding:4px 10px;border-radius:999px;margin-bottom:12px}
.phead__tag{color:var(--accent);font-weight:600;font-size:16px;margin:0 0 10px}
.phead__lead{color:var(--ink2);font-size:15px;max-width:66ch;margin:0}
.phead__acts{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}

.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:22px}
.kpi{background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:13px 15px;box-shadow:var(--sh1);min-width:0}
.kpi dt{font-size:12px;color:var(--ink3);margin-bottom:3px}
.kpi dd{margin:0;font-size:21px;font-weight:700;color:var(--brand-deep);font-family:var(--mono);letter-spacing:-.02em}
.kpi dd small{font-size:12px;font-family:var(--font);color:var(--ink3);font-weight:600;margin-left:2px}
.kpi--empty dd{font-size:16px;font-family:var(--font);color:var(--ink3)}
.kpi--empty dd small{display:block;margin:2px 0 0;font-weight:500}

.sec{padding:42px 0;scroll-margin-top:78px}
.sec--tint{background:var(--bg-tint);border-block:1px solid var(--line-soft)}
.sec__hd{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:22px}
.sec__hd h2{font-size:clamp(20px,16px+1vw,27px);margin:0 0 6px}
.sec__hd p{color:var(--ink2);margin:0;max-width:66ch;font-size:15px}
.note{font-size:13.5px;color:var(--ink3);margin-top:12px}
.foot-note{font-size:13px;color:var(--ink3);background:#fff;border:1px dashed var(--line);border-radius:var(--r);padding:12px 15px;margin-top:14px}

.tw{overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--sh1)}
table{border-collapse:collapse;width:100%}
th,td{padding:12px 14px;text-align:left;vertical-align:top;font-size:14px;border-bottom:1px solid var(--line-soft)}
thead th{background:var(--bg-tint);font-size:12.5px;font-weight:700;color:var(--ink2);white-space:nowrap;position:sticky;top:0;z-index:1;border-bottom:1px solid var(--line)}
tbody tr:hover{background:#fafcff}
tbody tr:last-child td{border-bottom:0}
.bizt{min-width:940px}
.bizt th[scope=row]{font-weight:600;background:#fcfdff;white-space:nowrap}
.bizt .pname{font-weight:700;font-size:15px}
.bizt .pname a{text-decoration:none}
.bizt .pname a:hover{text-decoration:underline}
.rent{font-family:var(--mono);font-size:17px;font-weight:700;color:var(--brand-deep);white-space:nowrap;line-height:1.4}
.rent small{display:block;font-family:var(--font);font-size:12px;font-weight:600;color:var(--ink3);white-space:normal}
.rent--empty{font-family:var(--font);font-size:14px;color:var(--ink3);font-weight:600}
.rent--empty small{color:var(--warn);font-weight:500}
.tiers{list-style:none;margin:0;padding:0;display:grid;gap:7px}
.tiers li{display:grid;grid-template-columns:auto minmax(0,1fr);gap:9px;align-items:baseline}
.tiers .amt{font-family:var(--mono);font-weight:700;font-size:14px;color:var(--brand-deep);white-space:nowrap}
.tiers .inc{color:var(--ink2);font-size:13.5px}
.q{color:var(--ink3);font-size:12px;font-family:var(--mono);word-break:break-word}
.bdg{display:inline-block;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;white-space:nowrap}
.bdg--m{background:var(--brand-soft);color:var(--brand)}
.bdg--o{background:var(--accent-soft);color:var(--accent)}
.bdg--na{background:#f0f2f5;color:var(--ink3)}
.tags{display:flex;flex-wrap:wrap;gap:4px}
.tag{font-size:12px;color:var(--ink2);background:#fff;border:1px solid var(--line);border-radius:999px;padding:2px 8px}

.blocks{display:grid;gap:18px}
.blk{background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);padding:20px;box-shadow:var(--sh1)}
.blk h2{font-size:17px;margin:0 0 12px;padding-bottom:9px;border-bottom:1px solid var(--line-soft);color:var(--brand)}
.plan{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:center;
  border:1px solid var(--line);border-radius:var(--r);padding:13px 15px;margin-bottom:9px;background:#fff}
.plan:hover{border-color:var(--brand-line);background:#fcfdff}
.plan__amt{font-family:var(--mono);font-size:21px;font-weight:700;color:var(--brand-deep);white-space:nowrap}
.plan__amt small{font-family:var(--font);font-size:12px;color:var(--ink3);font-weight:600;margin-left:3px}
.plan__inc{font-size:13.5px;color:var(--ink2);min-width:0}
.plan__inc b{display:block;color:var(--ink);font-size:14px;margin-bottom:1px}
.plan__q{grid-column:1/-1;font-size:12px;color:var(--ink3);font-family:var(--mono);border-top:1px dashed var(--line);padding-top:7px;margin-top:2px}
.plan--empty{border-style:dashed;background:var(--bg-tint)}
.plan--empty .plan__amt{font-family:var(--font);font-size:14px;color:var(--ink3)}
.dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px 16px;margin:0;font-size:14px}
.dl dt{color:var(--ink3);white-space:nowrap}
.dl dd{margin:0;color:var(--ink2)}
.plist{list-style:none;margin:0;padding:0;display:grid;gap:7px}
.plist li{font-size:14px;color:var(--ink2);padding-left:17px;position:relative}
.plist li::before{content:"";position:absolute;left:3px;top:.6em;width:5px;height:5px;border-radius:50%;background:var(--brand-line)}
.quotes{list-style:none;margin:0;padding:0;display:grid;gap:7px}
.quotes li{font-size:12.5px;color:var(--ink2);background:var(--bg-tint);border-left:3px solid var(--brand-line);padding:8px 12px;border-radius:0 6px 6px 0}

.filters{background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);padding:16px 20px;margin-bottom:18px;box-shadow:var(--sh1)}
.frow{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end}
.frow+.frow{margin-top:13px;padding-top:13px;border-top:1px dashed var(--line);align-items:center}
.f{display:flex;flex-direction:column;gap:4px;min-width:0;flex:0 1 184px}
.f--grow{flex:1 1 260px}
.f label{font-size:12px;font-weight:600;color:var(--ink2)}
.f label b{color:var(--brand);font-family:var(--mono)}
.f input,.f select{font:inherit;font-size:14px;color:var(--ink);padding:9px 11px;border:1px solid var(--line);border-radius:8px;background:#fff;width:100%;min-width:0}
.f input:focus,.f select:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(10,78,163,.18);outline:none}
.empty{text-align:center;color:var(--ink3);padding:42px 20px;border:1px dashed var(--line);border-radius:var(--r-lg);background:#fff}

.form{background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);padding:22px;box-shadow:var(--sh1)}
.form fieldset{border:0;margin:0 0 18px;padding:0}
.form legend{font-size:14px;font-weight:700;padding:0;margin-bottom:11px}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{display:inline-flex;align-items:center;gap:6px;font-size:14px;color:var(--ink2);border:1px solid var(--line);
  border-radius:999px;padding:6px 13px;cursor:pointer;background:#fff;transition:border-color .15s,background .15s,color .15s}
.chip:hover{border-color:var(--brand-line)}
.chip input{accent-color:var(--brand)}
.chip.on{border-color:var(--brand);background:var(--brand-soft);color:var(--brand);font-weight:600}
.fgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}
.fd{display:flex;flex-direction:column;gap:4px;min-width:0}
.fd--full{grid-column:1/-1}
.fd label{font-size:13px;font-weight:600;color:var(--ink2)}
.fd label b{color:var(--err)}
.fd input,.fd select,.fd textarea{font:inherit;font-size:14px;padding:9px 11px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);width:100%;min-width:0}
.fd textarea{resize:vertical}
.fd input:focus,.fd select:focus,.fd textarea:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(10,78,163,.18);outline:none}
.fd input[aria-invalid=true],.fd textarea[aria-invalid=true]{border-color:var(--err)}
.err{color:var(--err);font-size:12.5px;margin:2px 0 0}
.chk{display:flex;gap:8px;align-items:flex-start;font-size:14px;color:var(--ink2);margin-top:13px}
.chk input{margin-top:4px;accent-color:var(--brand);flex:0 0 auto}
.act{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:18px}
.hint{font-size:12.5px;color:var(--ink3)}
.alert{margin-top:15px;border-radius:var(--r);padding:14px;font-size:14px;border:1px solid}
.alert--ok{background:#eefaf3;border-color:#bde5cf;color:var(--ok)}
.alert--err{background:#fdf0ee;border-color:#f2c9c3;color:var(--err)}
.alert b{display:block;margin-bottom:2px}
.alert code{font-family:var(--mono);background:rgba(255,255,255,.75);padding:1px 6px;border-radius:4px}
.reg{display:grid;grid-template-columns:minmax(0,.82fr) minmax(0,1.18fr);gap:34px;align-items:start}
.steps{list-style:none;margin:16px 0;padding:0;display:grid;gap:11px}
.steps li{border-left:2px solid var(--line);padding-left:15px;display:grid;gap:1px}
.steps b{font-size:14px;color:var(--brand)}
.steps span{font-size:14px;color:var(--ink2)}
.contact{background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:15px;font-size:14px}
.contact p{margin:0 0 8px}
.contact p:last-child{margin:0}
.contact a{font-family:var(--mono);font-weight:700;font-size:17px}

.faq{display:grid;gap:8px}
.faq details{background:#fff;border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
.faq summary{cursor:pointer;padding:14px 19px;font-weight:600;font-size:15px;list-style:none;display:flex;align-items:center;gap:11px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::before{content:"?";flex:0 0 auto;width:22px;height:22px;border-radius:6px;display:grid;place-items:center;
  background:var(--brand-soft);color:var(--brand);font-family:var(--mono);font-size:12px}
.faq details[open] summary{border-bottom:1px solid var(--line-soft)}
.faq p{padding:13px 19px;margin:0;color:var(--ink2);font-size:14px}
.ftr{background:var(--brand-deep);color:#c7d7ec;padding:42px 0 26px;font-size:14px;margin-top:8px}
.ftr__in{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:30px}
.ftr__b{color:#fff;font-weight:700;margin-bottom:8px}
.ftr__n{color:#9fb8d8;max-width:48ch;font-size:12.5px}
.ftr h3{color:#fff;font-size:14px;margin-bottom:11px}
.ftr ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.ftr a{color:#c7d7ec}
.ftr a:hover{color:#fff}
.ftr__src{max-width:var(--shell);margin:26px auto 0;padding:15px 24px 0;border-top:1px solid rgba(255,255,255,.14);color:#8ba6c8;font-size:12px}

.modal{position:fixed;inset:0;z-index:70;display:grid;place-items:center;padding:16px}
.modal__sc{position:absolute;inset:0;background:rgba(10,26,48,.5)}
.modal__pn{position:relative;background:#fff;border-radius:var(--r-lg);box-shadow:0 18px 48px rgba(10,40,80,.28);
  width:min(760px,100%);max-height:86vh;overflow:auto;padding:22px 24px 24px}
.modal__hd{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px}
.modal__hd h2{margin:0;font-size:19px}
.x{width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:#fff;font-size:20px;line-height:1;cursor:pointer;color:var(--ink2);flex:0 0 auto}
.x:hover{background:var(--bg-tint)}
pre.doc{margin:0;font-family:var(--mono);font-size:12.5px;line-height:1.7;white-space:pre-wrap;word-break:break-word;
  background:var(--bg-tint);border:1px solid var(--line);border-radius:var(--r);padding:15px}
.toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:80;background:#12304f;color:#fff;
  border-radius:10px;padding:12px 20px;font-size:14px;box-shadow:0 10px 30px rgba(10,40,80,.3);max-width:min(560px,92vw)}
.toast--err{background:#7d2419}

@media (max-width:1040px){
  .reg{grid-template-columns:minmax(0,1fr);gap:24px}
  .ftr__in{grid-template-columns:minmax(0,1fr)}
}
@media (max-width:860px){
  .nav__toggle{display:block}
  .nav{display:none;width:100%;margin-left:0;padding-bottom:12px;flex-direction:column;align-items:stretch;gap:2px}
  .nav.open{display:flex}
  .nav a{padding:10px 12px}
  .cards{grid-template-columns:minmax(0,1fr)}
  .sec{padding:32px 0}
}
@media (max-width:560px){
  .shell{padding-inline:16px}
  .f,.f--grow{flex:1 1 100%}
  .form{padding:17px}
  .plan{grid-template-columns:minmax(0,1fr);gap:8px}
  .toast{left:16px;right:16px;transform:none;max-width:none}
}
@media print{
  .hdr,.ftr,.toast,.modal,.act,.filters,.phead__acts{display:none!important}
  body{background:#fff}
  .sec{padding:14px 0;break-inside:avoid}
  .tw{box-shadow:none}
}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  *,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}
}
`;

/* 总览页专属样式：只有产品总览页用到，单独注入，避免其余 7 页背负无用字节。 */
const OVERVIEW_CSS = `
/* ---------------- 总览页：一行一产品（产品矩阵行） ----------------
   每项产品占满一整行：左侧是深色「产品身份板」（呼应单产品页的产品信息卡：
   分类胶囊 + 产品名 + 金色大字月租 + 半透明指标格 + 价值标签 + 行动按钮），
   右侧是「资费档位卡 + 适用场景」。整行共用一套深蓝底，用 --pc 色相区分产品。 */
.cards{display:grid;gap:20px}

.pc{--pc:var(--brand);--pc-deep:var(--brand-deep);--pc-glow:rgba(47,140,240,.5);
  display:grid;grid-template-columns:minmax(0,332px) minmax(0,1fr);background:#fff;
  border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:var(--sh1);
  transition:opacity .55s ease,transform .35s ease,box-shadow .28s ease,border-color .28s ease}
.pc:hover{transform:translateY(-3px);box-shadow:0 16px 38px rgba(11,58,132,.14);border-color:var(--pc)}
.pc:target{border-color:var(--pc);box-shadow:0 0 0 3px rgba(10,78,163,.16),0 16px 38px rgba(11,58,132,.14)}

/* 左侧身份板 */
.pc__id{position:relative;display:flex;flex-direction:column;padding:20px;color:#fff;
  background:
    radial-gradient(430px 240px at 86% -12%,var(--pc-glow),transparent 66%),
    radial-gradient(360px 260px at -10% 108%,rgba(18,168,196,.20),transparent 72%),
    linear-gradient(155deg,#04203f 0%,#08336e 52%,var(--pc-deep) 100%)}
.pc__idtop{display:flex;align-items:flex-start;gap:10px;margin-bottom:12px}
.pc__cat{font-size:11.5px;font-weight:600;color:rgba(255,255,255,.94);background:rgba(255,255,255,.13);
  border:1px solid rgba(255,255,255,.26);border-radius:999px;padding:3px 10px;white-space:nowrap}
.pc__no{margin-left:auto;font:800 28px/1 var(--display);letter-spacing:-.02em;color:rgba(255,255,255,.22)}
.pc__name{font-size:20px;line-height:1.32;margin:0 0 5px;color:#fff;letter-spacing:-.01em}
.pc__name a{color:#fff;text-decoration:none}
.pc__name a:hover{text-decoration:underline;text-underline-offset:3px}
.pc__tag{font-size:13px;line-height:1.6;color:rgba(255,255,255,.88);margin:0 0 15px}

.pc__rent{padding-top:13px;border-top:1px solid rgba(255,255,255,.16)}
.pc__rentlab{display:block;font-size:11.5px;font-weight:600;color:rgba(255,255,255,.72);letter-spacing:.04em}
.pc__price{display:flex;align-items:baseline;gap:6px;margin-top:3px;flex-wrap:wrap}
.pc__price b{font:800 38px/1.06 var(--display);letter-spacing:-.02em;color:#ffd9a8;
  background:linear-gradient(100deg,#ffe6b8,#ffc46b 62%,#ffb347);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.pc__price span{font-size:14px;font-weight:700;color:#ffd9a8}
.pc__price--empty b{font:700 20px/1.3 var(--font);letter-spacing:0;background:none;
  -webkit-text-fill-color:currentColor;color:#fff;border:1px dashed rgba(255,255,255,.45);
  border-radius:9px;padding:6px 12px}
.pc__rentnote{display:block;margin-top:7px;font-size:11.5px;line-height:1.5;color:rgba(255,255,255,.74)}
.pc__rent--empty .pc__rentnote{color:#ffd9a8}

.pc__mets{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:13px}
.pc__met{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.18);border-radius:11px;
  padding:8px 11px;min-width:0}
.pc__met b{display:block;font-size:15.5px;font-weight:700;color:#fff;letter-spacing:-.01em}
.pc__met span{display:block;margin-top:1px;font-size:11px;line-height:1.45;color:rgba(255,255,255,.80)}

.pc__pills{list-style:none;display:flex;flex-wrap:wrap;gap:5px;margin:12px 0 0;padding:0}
.pc__pills li{font-size:11.5px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);
  border-radius:999px;padding:2px 9px;color:rgba(255,255,255,.94)}

.pc__act{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;padding-top:16px}
.btn--onDark{background:#fff;color:var(--brand-deep);border-color:transparent;font-weight:700}
.btn--onDark:hover{background:#eaf2ff;color:var(--brand-deep)}
.btn--darkGhost{background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.32)}
.btn--darkGhost:hover{background:rgba(255,255,255,.2);color:#fff}

/* 右侧：产品特征 / 资费档位 / 适用场景 */
.pc__body{display:flex;flex-direction:column;gap:14px;padding:20px 22px;min-width:0}
.pc__feat{margin:0;font-size:13.5px;line-height:1.75;color:var(--ink2)}
.pc__blk{min-width:0}
.pc__h4{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:12.5px;font-weight:700;
  color:var(--ink3);letter-spacing:.04em}
.pc__h4::before{content:"";width:3px;height:13px;border-radius:2px;
  background:linear-gradient(var(--brand),#2f8cf0);flex:0 0 3px}
.pc__h4 em{font-style:normal;font-weight:600;color:var(--ink3);letter-spacing:0}

.pc__tiers{list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(192px,1fr));
  gap:11px;margin:0;padding:0}
.pc__tiers li{display:block;background:linear-gradient(180deg,#f6f9fe,#fff);
  border:1px solid #e2ecfb;border-radius:12px;padding:12px 13px;min-width:0}
.pc__tiers li:hover{border-color:var(--brand-line)}
.pc__tiers li.is-empty{background:none;border-style:dashed;border-color:var(--line);display:flex;
  align-items:center;font-size:12.5px;color:var(--ink3);padding:14px 13px}
.pc__tiers .amt{display:block;font-family:var(--mono);font-size:21px;font-weight:700;
  color:var(--brand-deep);letter-spacing:-.02em;line-height:1.2}
.pc__tiers .amt small{font-family:var(--font);font-size:11.5px;font-weight:600;color:var(--ink3);
  margin-left:2px;letter-spacing:0}
.pc__tiers .tname{display:block;margin-top:3px;font-size:12.5px;font-weight:700;color:var(--ink)}
.pc__tiers .tname .bdg{margin-left:6px;font-size:10.5px;padding:1px 6px;vertical-align:1px}
.pc__tiers .inc{display:block;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line);
  font-size:12.5px;line-height:1.6;color:var(--ink2)}

/* 一次性费用只有一档时用整行横条，避免在网格里落单留白；两档以上仍走网格 */
.pc__tiers--full{grid-template-columns:minmax(0,1fr)}
.pc__tiers--full li{display:flex;flex-wrap:wrap;align-items:baseline;gap:3px 14px;
  background:linear-gradient(90deg,var(--accent-soft),#fff 58%);border-color:var(--accent-line)}
.pc__tiers--full .amt{font-size:20px;color:var(--accent)}
.pc__tiers--full .tname{margin-top:0}
.pc__tiers--full .inc{margin-top:0;padding-top:0;border-top:0;flex:1 1 auto}

/* 行尾受理口径：贴着行底，与左侧按钮同一条基线 */
.pc__meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:6px 20px;
  margin-top:auto;padding-top:13px;border-top:1px solid var(--line-soft)}
.pc__meta span{font-size:12.5px;line-height:1.6;color:var(--ink2);min-width:0}
.pc__meta b{color:var(--ink3);font-weight:600;margin-right:7px}

.pc__scenes .plist{grid-template-columns:repeat(auto-fit,minmax(232px,1fr));gap:5px 18px}

/* ---------------- 总览页：首屏数据带 ---------------- */
.kpibar{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;margin-top:22px;
  background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:var(--sh2);overflow:hidden}
.kpibar .kpi{border:0;border-radius:0;box-shadow:none;padding:15px 18px 16px;position:relative}
.kpibar .kpi+.kpi{border-left:1px solid var(--line-soft)}
.kpibar .kpi::before{content:"";position:absolute;left:18px;top:0;width:28px;height:3px;
  border-radius:0 0 3px 3px;background:var(--k,var(--brand))}
.kpibar .kpi dd{font-size:24px}
.kpibar .kpi--k0{--k:#7c3aed}
.kpibar .kpi--k1{--k:#0a4ea3}
.kpibar .kpi--k2{--k:#0e7490}
.kpibar .kpi--k3{--k:#b45309}

/* ---------------- 总览页：快速定位条（粘性） ---------------- */
.qnav{position:sticky;top:64px;z-index:35;background:rgba(255,255,255,.94);
  backdrop-filter:saturate(180%) blur(10px);border-bottom:1px solid var(--line)}
.qnav__in{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-block:9px}
.qnav__lab{font-size:12px;font-weight:600;color:var(--ink3);padding-right:4px}
.qnav__chip{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--ink2);
  background:#fff;border:1px solid var(--line);border-radius:999px;padding:5px 12px;text-decoration:none;
  white-space:nowrap;transition:background .16s,color .16s,border-color .16s}
.qnav__chip:hover{border-color:var(--brand-line);color:var(--brand)}
.qnav__chip.on{background:var(--brand);border-color:var(--brand);color:#fff}
.qnav__chip i{width:6px;height:6px;border-radius:50%;background:#0a4ea3;flex:0 0 6px}

/* 站内锚点必须避开「粘性页头 65px + 快速定位条」共约 117px，否则跳过去标题被压住。
   落点只由滚动容器的 scroll-padding-top 控制——它与目标自身的 scroll-margin 是相加的，
   所以把共用样式里 .sec 的 scroll-margin 在本页归零，整页落点才统一为 170px。 */
html{scroll-padding-top:170px}
.sec,.pc{scroll-margin-top:0}

/* ---------------- 总览页：受理登记表核对视图（可折叠） ---------------- */
.audit{background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--sh1);overflow:hidden}
.audit>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:12px;
  padding:16px 18px;font-size:15px;font-weight:700;flex-wrap:wrap}
.audit>summary::-webkit-details-marker{display:none}
.audit>summary::before{content:"＋";width:22px;height:22px;flex:0 0 22px;border-radius:6px;
  display:grid;place-items:center;background:var(--brand-soft);color:var(--brand);font-size:13px;font-weight:700}
.audit[open]>summary::before{content:"－"}
.audit[open]>summary{border-bottom:1px solid var(--line-soft)}
.audit__hint{margin-left:auto;font-size:12.5px;font-weight:500;color:var(--ink3)}
.audit__in{padding:0 18px 18px}
.audit__in .tw{margin-top:14px}

/* ---------------- 总览页：按场景选型 ---------------- */
.sec--prod{background:linear-gradient(180deg,#f7faff,#fff 340px)}
.scenes{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
.scene{background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);padding:17px 18px;
  box-shadow:var(--sh1);transition:box-shadow .18s,border-color .18s}
.scene:hover{box-shadow:var(--sh2);border-color:var(--brand-line)}
.scene h3{font-size:15.5px;margin:0 0 6px}
.scene__who{font-size:13px;color:var(--ink2);margin:0 0 8px}
.scene__need{font-size:12.5px;color:var(--ink3);margin:0 0 12px;line-height:1.65}
.scene__p{display:flex;flex-wrap:wrap;gap:6px;padding-top:11px;border-top:1px dashed var(--line)}
.scene__chip{font-size:12.5px;font-weight:600;text-decoration:none;color:var(--brand);
  background:var(--brand-soft);border:1px solid var(--brand-line);border-radius:999px;padding:3px 10px}
.scene__chip:hover{background:var(--brand);color:#fff;border-color:var(--brand)}

${ACCENT_CSS}

@media (max-width:900px){
  .qnav__lab{font-size:11.5px}
  .qnav__chip{font-size:12.5px;padding:5px 10px}
}
@media (max-width:860px){
  .pc{grid-template-columns:minmax(0,1fr)}
  .pc__price b{font-size:34px}
  .pc__body{padding:17px}
  .pc__scenes .plist{grid-template-columns:minmax(0,1fr)}
  .pc__tiers--full li{display:block}
  .pc__tiers--full .inc{margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)}
  .kpibar{grid-template-columns:repeat(2,minmax(0,1fr))}
  .kpibar .kpi:nth-child(3){border-left:0}
  .kpibar .kpi:nth-child(n+3){border-top:1px solid var(--line-soft)}
  .kpibar .kpi dd{font-size:21px}
}
@media (max-width:560px){
  .qnav{position:static}
  .qnav__lab{display:none}
  .qnav__chip{font-size:12px;padding:4px 10px}
  .scenes{grid-template-columns:minmax(0,1fr)}
  html{scroll-padding-top:86px}
  .sec,.pc{scroll-margin-top:0}
}

@media print{
  .qnav{display:none!important}
  .pc{grid-template-columns:minmax(0,300px) minmax(0,1fr);box-shadow:none;border-color:#ccc;break-inside:avoid}
  .pc__id,.pc__id *{color:#000!important}
  .pc__id{background:#f2f5fa!important;border-right:1px solid #ccc}
  .pc__price b{background:none!important;-webkit-text-fill-color:#000!important;color:#000!important}
  .pc__price--empty b{border-color:#999}
  .pc__met,.pc__pills li{background:#fff!important;border-color:#ccc!important}
  .pc__no{color:#c8d2e0!important}
  .pc__name a{text-decoration:none}
  .pc__tiers li{background:#fff!important;border-color:#ccc!important}
  .pc__tiers .amt{color:#000!important}
  .scene,.audit{box-shadow:none}
  .audit{break-inside:avoid}
}
`;

/* ------------------------------------------------------------------ 页面骨架 */

function page(data, { title, desc, active, body, scripts = '', extraCss = '' }) {
  const S = data.id;
  const navItems = [
    { key: 'overview', href: `${S}.html`, label: '产品总览' },
    ...data.products.map((p) => ({ key: p.id, href: pageName(S, p.id), label: p.shortName || p.name })),
    { key: 'pricing', href: `${S}-pricing.html`, label: '资费总表' },
    { key: 'order', href: `${S}-order.html`, label: '需求登记' },
  ];
  const nav = navItems.map((n) =>
    `<a href="${esc(n.href)}"${n.key === active ? ' class="on" aria-current="page"' : ''}>${esc(n.label)}</a>`).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta name="theme-color" content="${esc(data.meta.themeColor || '#0a4ea3')}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230a4ea3'/%3E%3Cpath d='M16 5.6 22.6 14h-4.2v4.6h-4.8V14H9.4L16 5.6Z' fill='%23fff'/%3E%3C/svg%3E">
<style>${CSS}${extraCss}</style>
</head>
<body>
<a class="skip" href="#main">跳到主要内容</a>
<header class="hdr">
  <div class="shell hdr__in">
    <a class="hdr__brand" href="${esc(`${S}.html`)}">
      <span class="hdr__mark" aria-hidden="true">增</span>
      <span class="hdr__txt"><b>中国电信</b><span>增值业务产品页</span></span>
    </a>
    <button class="nav__toggle" id="navToggle" type="button" aria-expanded="false" aria-controls="nav">目录</button>
    <nav class="nav" id="nav" aria-label="站内导航">${nav}</nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="ftr">
  <div class="shell ftr__in">
    <div>
      <p class="ftr__b">${esc(data.catalog.operator)} · 增值业务产品页</p>
      <p class="ftr__n">${esc(data.catalog.dataPolicy)}</p>
    </div>
    <div>
      <h3>服务条款摘要</h3>
      <ul>${(data.terms || []).slice(0, 4).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </div>
  </div>
  <p class="ftr__src">数据来源：${esc(data.catalog.sourceForm)} · 更新：${esc(String(data.updatedAt || '').slice(0, 10))} · 客服热线 ${esc(data.catalog.hotline)}</p>
</footer>
<script>
(function(){
'use strict';
var t=document.getElementById('navToggle'),n=document.getElementById('nav');
if(t&&n){t.addEventListener('click',function(){var o=n.classList.toggle('open');t.setAttribute('aria-expanded',String(o));});}
${scripts}
})();
</script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ 总览页 */

export function renderOverview(data) {
  const S = data.id;
  const catName = (id) => data.categories.find((c) => c.id === id)?.name || '未分类';
  const benefitName = (id) => data.benefits.find((b) => b.id === id)?.name || id;
  const allTiers = data.products.flatMap((p) => p.tiers);
  const monthly = allTiers.filter((t) => t.type === 'monthly').map((t) => t.price);
  const onetime = allTiers.filter((t) => t.type === 'onetime').map((t) => t.price);

  const kpis = [
    { lab: '收录产品', val: data.products.length, unit: '项' },
    { lab: '资费档位', val: allTiers.length, unit: '档' },
    {
      lab: '月租区间',
      val: monthly.length ? `${money(Math.min(...monthly))}–${money(Math.max(...monthly))}` : '受理时填写',
      unit: monthly.length ? '元/月起' : '原文填空项',
      empty: !monthly.length,
    },
    {
      lab: '一次性费用',
      val: onetime.length ? `${money(Math.min(...onetime))} 起` : '—',
      unit: onetime.length ? '元' : '',
      empty: !onetime.length,
    },
  ];

  const rows = data.products.map((p) => {
    const m = monthlyOf(p);
    const o = onetimeOf(p);
    const rentCell = m.length
      ? `<div class="rent">${m.map((t) => money(t.price)).join(' / ')}<small>元 · ${esc(m[0].unit.replace(/^元\//, ''))}</small></div>
         <ul class="tiers" style="margin-top:7px">${m.map((t) => `<li><span class="amt">${money(t.price)} 元</span><span class="inc">${esc(t.includes || '—')}</span></li>`).join('')}</ul>`
      : `<div class="rent rent--empty">受理时填写<small>受理登记表原文为填空项，未给定标准月租</small></div>`;
    const onceCell = o.length
      ? `<ul class="tiers">${o.map((t) => `<li><span class="amt">${money(t.price)} 元</span><span class="inc">${esc(t.name)}：${esc(t.includes || '—')}</span></li>`).join('')}</ul>`
      : '<span class="bdg bdg--na">无</span>';
    return `<tr>
      <th scope="row">
        <div class="pname"><a href="${esc(pageName(S, p.id))}">${esc(p.name)}</a></div>
        <div style="font-size:12.5px;color:var(--ink3);margin-top:3px;font-weight:400">${esc(catName(p.category))}</div>
      </th>
      <td>${rentCell}</td>
      <td>${m.length ? '<span class="bdg bdg--m">包月</span>' : '<span class="bdg bdg--na">待定</span>'}</td>
      <td>${onceCell}</td>
      <td><ul class="plist" style="font-size:13.5px">${(p.scenarios || []).slice(0, 3).map((s) => `<li>${esc(s)}</li>`).join('')}</ul></td>
      <td><div class="tags">${(p.benefits || []).map((b) => `<span class="tag">${esc(data.benefits.find((x) => x.id === b)?.name || b)}</span>`).join('')}</div></td>
      <td><a class="btn btn--ghost btn--sm" href="${esc(pageName(S, p.id))}">套餐详情</a></td>
    </tr>`;
  }).join('');

  /* 产品矩阵行：一行一项产品（左深色身份板 + 右资费档位卡与场景） */
  const productRows = data.products.map((p, i) => {
    const a = accentOf(i);
    const m = monthlyOf(p);
    const o = onetimeOf(p);
    const r = rentSummary(p);
    const unit = m.length ? m[0].unit.replace(/^元\//, '') : '';
    const priceHtml = r.empty
      ? '<div class="pc__price pc__price--empty"><b>受理时填写</b></div>'
      : `<div class="pc__price"><b>${esc(r.text.replace(/\s*元\/.*$/, ''))}</b><span>元/${esc(unit)}</span></div>`;
    /* 月租档位：网格卡片；一次性费用：整行横条（不与月租混排，避免落单留白） */
    const tierCards = m.map((t) => `<li>
          <span class="amt">${money(t.price)} 元<small>/${esc(t.unit.replace(/^元\//, ''))}</small></span>
          <span class="tname">${esc(t.name)}<span class="bdg bdg--m">包月</span></span>
          <span class="inc">${esc(t.includes || '—')}</span>
        </li>`).join('')
      || `<li class="is-empty">月租资费为受理登记表填空项（主号/子号分别登记），原文未给定标准金额。</li>`;
    const onceCards = o.map((t) => `<li>
          <span class="amt">${money(t.price)} 元<small>/${esc(t.unit.replace(/^元\//, ''))}</small></span>
          <span class="tname">${esc(t.name)}<span class="bdg bdg--o">一次性</span></span>
          <span class="inc">${esc(t.includes || '—')}</span>
        </li>`).join('');
    /* 受理口径：计费方式与受理类型在全部产品上都有，逐字来自受理登记表 */
    const metaItems = [
      p.pricingModel ? `<span><b>计费方式</b>${esc(p.pricingModel)}</span>` : '',
      p.fields?.['受理类型'] ? `<span><b>受理类型</b>${esc(p.fields['受理类型'])}</span>` : '',
    ].filter(Boolean).join('');
    return `<article class="pc pc--${a.key}" id="row-${esc(p.id)}" aria-labelledby="rowt-${esc(p.id)}">
      <div class="pc__id">
        <div class="pc__idtop">
          <span class="pc__cat">${esc(catName(p.category))}</span>
          <span class="pc__no" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
        </div>
        <h3 class="pc__name" id="rowt-${esc(p.id)}"><a href="${esc(pageName(S, p.id))}">${esc(p.name)}</a></h3>
        <p class="pc__tag">${esc(p.tagline)}</p>
        <div class="pc__rent${r.empty ? ' pc__rent--empty' : ''}">
          <span class="pc__rentlab">月租${m.length ? '' : '（原文填空项）'}</span>
          ${priceHtml}
          <span class="pc__rentnote">${esc(r.note)}${o.length ? ` · 另有 ${o.length} 项一次性费用` : ''}</span>
        </div>
        <div class="pc__mets">
          <div class="pc__met"><b>${m.length || '—'}</b><span>月租档位${m.length ? '' : ' · 原文填空项'}</span></div>
          <div class="pc__met"><b>${o.length || '无'}</b><span>一次性费用档位</span></div>
        </div>
        <ul class="pc__pills">${(p.benefits || []).map((b) => `<li>${esc(benefitName(b))}</li>`).join('')}</ul>
        <div class="pc__act">
          <a class="btn btn--onDark btn--sm" href="${esc(pageName(S, p.id))}">查看套餐详情</a>
          <a class="btn btn--darkGhost btn--sm" href="${esc(`${S}-order.html`)}?p=${esc(p.id)}">登记需求</a>
        </div>
      </div>
      <div class="pc__body">
        <p class="pc__feat">${esc(p.feature)}</p>
        <div class="pc__blk">
          <h4 class="pc__h4">月租档位与套餐内容 <em>${m.length ? `${m.length} 档包月` : '原文填空项'}</em></h4>
          <ul class="pc__tiers">${tierCards}</ul>
        </div>
        ${o.length ? `<div class="pc__blk">
          <h4 class="pc__h4">一次性费用 <em>${o.length} 项</em></h4>
          <ul class="pc__tiers${o.length === 1 ? ' pc__tiers--full' : ''}">${onceCards}</ul>
        </div>` : ''}
        <div class="pc__blk pc__scenes">
          <h4 class="pc__h4">适用场景</h4>
          <ul class="plist">${(p.scenarios || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
        </div>
        ${metaItems ? `<div class="pc__meta">${metaItems}</div>` : ''}
      </div>
    </article>`;
  }).join('');

  /* 快速定位条：站内锚点，滚动时高亮当前产品 */
  const qnav = `<div class="qnav" id="qnav"><div class="shell qnav__in">
    <span class="qnav__lab">快速定位</span>
    ${data.products.map((p, i) => `<a class="qnav__chip" href="#row-${esc(p.id)}" data-row="row-${esc(p.id)}"><i style="background:${accentOf(i).c}"></i>${esc(p.shortName || p.name)}</a>`).join('')}
    <a class="qnav__chip" href="#biztable" data-row="biztable">核对总表</a>
    <a class="qnav__chip" href="#faq" data-row="faq">常见问题</a>
  </div></div>`;

  /* 按场景选型：从业务动作反查产品组合 */
  const sceneCards = (data.scenes || []).map((s) => `<article class="scene">
      <h3>${esc(s.title)}</h3>
      <p class="scene__who">${esc(s.who)}</p>
      <p class="scene__need">${esc(s.need)}</p>
      <div class="scene__p">${(s.products || []).map((id) => {
        const p = data.products.find((x) => x.id === id);
        if (!p) return '';
        const main = s.main === id;
        return `<a class="scene__chip" href="#row-${esc(id)}"${main ? ' title="受理登记表口径下的主推产品"' : ''}>${main ? '主推 · ' : ''}${esc(p.shortName || p.name)}</a>`;
      }).join('')}</div>
    </article>`).join('');

  const body = `
<div class="crumbs"><div class="shell">产品总览</div></div>
<div class="phead">
  <div class="shell">
    <span class="phead__cat">政企增值业务 · 受理登记表数字化</span>
    <h1>增值业务产品与资费总览</h1>
    <p class="phead__lead">按受理登记表逐项数字化：<b>一行一项产品</b>，左侧是产品身份与月租口径，右侧是全部资费档位、套餐内容与适用场景，可逐条核对。月租为原文填空项的，如实标注「受理时填写」，不做推算。</p>
    <dl class="kpis kpibar">${kpis.map((k, i) => `<div class="kpi kpi--k${i}${k.empty ? ' kpi--empty' : ''}"><dt>${esc(k.lab)}</dt><dd>${esc(k.val)}<small>${esc(k.unit)}</small></dd></div>`).join('')}</dl>
    <div class="phead__acts">
      <a class="btn btn--primary" href="#products">按产品逐项查看</a>
      <a class="btn btn--ghost" href="#scenes">按场景选型</a>
      <a class="btn btn--ghost" href="${esc(`${S}-pricing.html`)}">资费总表（含原文依据）</a>
    </div>
  </div>
</div>

${qnav}

<section class="sec sec--prod" id="products">
  <div class="shell">
    <div class="sec__hd">
      <div>
        <h2>产品套餐一览</h2>
        <p>一行一项产品：左侧为月租口径与产品身份，右侧为该产品的全部资费档位、套餐内容与适用场景。点击「查看套餐详情」进入独立详情页，可查看受理登记表原文依据与登记要求。</p>
      </div>
      <a class="btn btn--ghost btn--sm" href="${esc(`${S}-order.html`)}">提交需求单</a>
    </div>
    <div class="cards">${productRows}</div>
  </div>
</section>

<section class="sec" id="scenes">
  <div class="shell">
    <div class="sec__hd">
      <div>
        <h2>按场景选型</h2>
        <p>从业务动作出发反查产品组合：不确定该选哪项时，先看你的通话发生在哪个环节。标签可跳转到对应产品行。</p>
      </div>
    </div>
    <div class="scenes">${sceneCards}</div>
  </div>
</section>

<section class="sec sec--tint" id="biztable">
  <div class="shell">
    <details class="audit" id="auditDetails">
      <summary>受理登记表核对视图
        <span class="audit__hint">产品类型 / 月租与套餐内容 / 计费方式 / 一次性费用 / 适用场景 / 企业价值 · ${data.products.length} 行</span>
      </summary>
      <div class="audit__in">
        <div class="tw">
          <table class="bizt">
            <caption class="sr">产品、月租与套餐内容总表</caption>
            <thead><tr>
              <th scope="col">产品类型</th>
              <th scope="col">月租与套餐内容</th>
              <th scope="col">计费方式</th>
              <th scope="col">一次性费用</th>
              <th scope="col">适用场景</th>
              <th scope="col">企业价值</th>
              <th scope="col">详情</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p class="foot-note">说明：受理登记表原文「优惠内容、资费」列中，商务音频/音视频彩铃的主号与子号月租为填空项（主号＿＿元/线/月），原文未给定标准金额，因此该行月租列为「受理时填写」；其制作费为固定档位，列于一次性费用一列。</p>
      </div>
    </details>
  </div>
</section>

<section class="sec" id="faq">
  <div class="shell" style="max-width:880px">
    <div class="sec__hd"><div><h2>常见问题</h2></div></div>
    <div class="faq">${data.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>
  </div>
</section>`;

  const scripts = `
/* 快速定位条：滚动时高亮当前所在的产品行 */
(function(){
  var chips=[].slice.call(document.querySelectorAll('.qnav__chip'));
  if(!chips.length) return;
  var targets=chips.map(function(c){return document.getElementById(c.getAttribute('data-row'));});
  var raf=0;
  function sync(){
    raf=0;
    var y=window.scrollY+180,best=-1;
    for(var i=0;i<targets.length;i++){
      var el=targets[i]; if(!el) continue;
      if(el.getBoundingClientRect().top+window.scrollY<=y) best=i;
    }
    var on=window.scrollY>80;
    chips.forEach(function(c,i){
      var act=on&&i===best;
      c.classList.toggle('on',act);
      if(act) c.setAttribute('aria-current','location'); else c.removeAttribute('aria-current');
    });
  }
  window.addEventListener('scroll',function(){ if(!raf) raf=requestAnimationFrame(sync); },{passive:true});
  window.addEventListener('resize',function(){ if(!raf) raf=requestAnimationFrame(sync); },{passive:true});
  sync();
})();

/* 核对视图：点「核对总表」或打印前自动展开 */
(function(){
  var d=document.getElementById('auditDetails');
  if(!d) return;
  function open(){ if(d.tagName==='DETAILS') d.open=true; }
  [].slice.call(document.querySelectorAll('a[href="#biztable"]')).forEach(function(a){ a.addEventListener('click',open); });
  if(location.hash==='#biztable') open();
  window.addEventListener('beforeprint',open);
})();`;

  return page(data, { title: data.meta.title, desc: data.meta.description, active: 'overview', body, scripts, extraCss: OVERVIEW_CSS });
}

/* ------------------------------------------------------------------ 产品详情页 */

export function renderProductPage(data, productId) {
  const S = data.id;
  const p = data.products.find((x) => x.id === productId);
  if (!p) throw new Error(`产品不存在：${productId}`);
  const catName = data.categories.find((c) => c.id === p.category)?.name || '未分类';
  const m = monthlyOf(p);
  const o = onetimeOf(p);
  const r = rentSummary(p);

  const planRow = (t) => `<div class="plan">
    <div class="plan__amt">${money(t.price)} 元<small>/${esc(t.unit.replace(/^元\//, ''))}</small></div>
    <div class="plan__inc"><b>${esc(t.name)}</b>${esc(t.includes || '—')}</div>
    <span class="bdg ${t.type === 'onetime' ? 'bdg--o' : 'bdg--m'}">${t.type === 'onetime' ? '一次性' : '包月'}</span>
    ${t.quote ? `<div class="plan__q">原文：${esc(t.quote)}</div>` : ''}
  </div>`;

  const rentBlock = m.length
    ? m.map(planRow).join('')
    : `<div class="plan plan--empty">
         <div class="plan__amt">受理时填写</div>
         <div class="plan__inc"><b>月租资费</b>受理登记表原文为填空项（主号＿＿元/线/月，子号＿＿元/线/月），未给定标准金额</div>
         <span class="bdg bdg--na">待定</span>
       </div>`;

  const kpis = [
    { lab: '月租', val: r.text, unit: r.note, empty: r.empty },
    { lab: '月租档位', val: m.length || '—', unit: m.length ? '档' : '原文填空项', empty: !m.length },
    { lab: '一次性费用', val: o.length || '—', unit: o.length ? '项' : '无', empty: !o.length },
    { lab: '计价单位', val: m.length ? m[0].unit : (o[0]?.unit || '—'), unit: '', empty: false },
  ];

  const body = `
<div class="crumbs"><div class="shell"><a href="${esc(`${S}.html`)}">产品总览</a><span>/</span>${esc(p.name)}</div></div>
<div class="phead">
  <div class="shell">
    <span class="phead__cat">${esc(catName)}</span>
    <h1>${esc(p.name)}</h1>
    <p class="phead__tag">${esc(p.tagline)}</p>
    <p class="phead__lead">${esc(p.feature)}</p>
    <dl class="kpis">${kpis.map((k) => `<div class="kpi${k.empty ? ' kpi--empty' : ''}"><dt>${esc(k.lab)}</dt><dd>${esc(k.val)}<small>${esc(k.unit)}</small></dd></div>`).join('')}</dl>
    <div class="phead__acts">
      <a class="btn btn--primary" href="${esc(`${S}-order.html`)}?p=${esc(p.id)}">登记该产品需求</a>
      <a class="btn btn--ghost" href="${esc(`${S}-pricing.html`)}">查看全部资费</a>
    </div>
  </div>
</div>

<section class="sec">
  <div class="shell">
    <div class="blocks">
      <div class="blk">
        <h2>月租与套餐内容</h2>
        ${rentBlock}
        ${p.priceNote ? `<p class="note">${esc(p.priceNote)}</p>` : ''}
        ${p.renewal ? `<p class="note">续约与计费：${esc(p.renewal)}</p>` : ''}
        ${m.length ? '' : '<p class="foot-note">本页不推算月租金额；实际资费以受理登记表填写并由双方盖章确认的内容为准。</p>'}
      </div>

      ${o.length ? `<div class="blk">
        <h2>一次性费用</h2>
        ${o.map(planRow).join('')}
      </div>` : ''}

      ${(p.options || []).length ? `<div class="blk">
        <h2>可选项</h2>
        <ul class="plist">${p.options.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </div>` : ''}

      <div class="blk">
        <h2>适用场景</h2>
        <ul class="plist">${(p.scenarios || []).map((s) => `<li>${esc(s)}</li>`).join('') || '<li>待补充</li>'}</ul>
      </div>

      <div class="blk">
        <h2>对企业的帮助</h2>
        <p style="color:var(--ink2);font-size:14px">${esc(p.benefitNarrative || '')}</p>
        <p class="note">价值维度：${(p.benefits || []).map((b) => esc(data.benefits.find((x) => x.id === b)?.name || b)).join(' · ') || '待补充'}</p>
      </div>

      <div class="blk">
        <h2>受理与登记要求</h2>
        ${Object.keys(p.fields || {}).length
          ? `<dl class="dl">${Object.entries(p.fields).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`
          : '<p class="note">以受理登记表为准。</p>'}
      </div>

      <div class="blk">
        <h2>受理登记表原文依据</h2>
        <ul class="quotes">${(p.quotes || []).map((x) => `<li>${esc(x)}</li>`).join('') || '<li>—</li>'}</ul>
      </div>
    </div>
  </div>
</section>`;

  return page(data, {
    title: `${p.name} · ${data.name}`,
    desc: `${p.name}：${p.tagline} 月租 ${r.text}。${String(p.feature).slice(0, 80)}`,
    active: p.id,
    body,
  });
}

/* ------------------------------------------------------------------ 资费总表页 */

export function renderPricingPage(data) {
  const S = data.id;
  const rows = data.products.flatMap((p) => p.tiers.map((t) => ({ p, t })));
  rows.sort((a, b) => (a.t.type === b.t.type ? a.t.price - b.t.price : a.t.type === 'monthly' ? -1 : 1));

  const body = `
<div class="crumbs"><div class="shell"><a href="${esc(`${S}.html`)}">产品总览</a><span>/</span>资费总表</div></div>
<div class="phead">
  <div class="shell">
    <span class="phead__cat">资费明细</span>
    <h1>资费总表</h1>
    <p class="phead__lead">全部 ${rows.length} 个资费档位平铺，区分包月与一次性计费，每一条都附受理登记表原文依据，可逐条核对。此页适合打印后与客户当面确认。</p>
  </div>
</div>
<section class="sec">
  <div class="shell">
    <div class="tw">
      <table>
        <caption class="sr">全部资费档位明细表</caption>
        <thead><tr>
          <th scope="col">产品</th><th scope="col">档位</th><th scope="col">价格</th>
          <th scope="col">计费方式</th><th scope="col">包含内容</th><th scope="col">原文依据</th>
        </tr></thead>
        <tbody>${rows.map(({ p, t }) => `<tr>
          <th scope="row"><a href="${esc(pageName(S, p.id))}">${esc(p.name)}</a></th>
          <td>${esc(t.name)}</td>
          <td style="font-family:var(--mono);font-weight:700;color:var(--brand-deep);white-space:nowrap">${money(t.price)} 元</td>
          <td><span class="bdg ${t.type === 'onetime' ? 'bdg--o' : 'bdg--m'}">${t.type === 'onetime' ? '一次性' : '包月'}</span> <span class="q">${esc(t.unit)}</span></td>
          <td>${esc(t.includes || '—')}</td>
          <td class="q">${esc(t.quote || '—')}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
    <p class="foot-note">超出套餐条数后的计费规则、各地市差异资费在受理登记表原文中未约定，以受理时约定为准。商务音频/音视频彩铃的月租在原文中为填空项，故不在本表列出金额。</p>
  </div>
</section>`;

  return page(data, {
    title: `资费总表 · ${data.name}`,
    desc: `${data.name} 全部 ${rows.length} 个资费档位明细，含包月与一次性计费及受理登记表原文依据。`,
    active: 'pricing',
    body,
  });
}

/* ------------------------------------------------------------------ 需求登记页 */

export function renderOrderPage(data) {
  const S = data.id;
  const chips = data.products.map((p) =>
    `<label class="chip" data-chip="${esc(p.id)}"><input type="checkbox" value="${esc(p.id)}">${esc(p.shortName || p.name)}</label>`).join('');

  const body = `
<div class="crumbs"><div class="shell"><a href="${esc(`${S}.html`)}">产品总览</a><span>/</span>需求登记</div></div>
<div class="phead">
  <div class="shell">
    <span class="phead__cat">受理前预沟通</span>
    <h1>需求登记</h1>
    <p class="phead__lead">选择意向产品并留下联系方式，提交后由客户经理联系确认受理细节。线上登记仅用于预沟通，<strong>正式受理仍需填写《信息服务业务受理登记表》并加盖单位印章</strong>。</p>
  </div>
</div>
<section class="sec">
  <div class="shell">
    <div class="reg">
      <div>
        <ol class="steps">
          <li><b>1 · 线上登记</b><span>提交单位、联系人与意向产品。</span></li>
          <li><b>2 · 需求确认</b><span>客户经理核对号码数量、场景与内容要求。</span></li>
          <li><b>3 · 纸面受理</b><span>填写受理登记表，双方加盖公章，明确服务期限。</span></li>
          <li><b>4 · 内容制作与开通</b><span>彩铃/卡片内容制作，按约定期限生效并计费。</span></li>
        </ol>
        <div class="contact">
          <p><b>客服热线：</b><a href="tel:${esc(data.catalog.hotline)}">${esc(data.catalog.hotline)}</a></p>
          <p><b>受理渠道：</b>${esc(data.catalog.channel)}</p>
        </div>
      </div>
      <form class="form" id="orderForm" novalidate>
        <fieldset>
          <legend>意向产品（可多选）</legend>
          <div class="chips" id="orderChips">${chips}</div>
          <p class="err" id="errProducts" hidden></p>
        </fieldset>
        <div class="fgrid">
          <div class="fd"><label for="o-org">单位名称 <b>*</b></label>
            <input id="o-org" autocomplete="organization" placeholder="例如：某某科技有限公司">
            <span class="err" data-err="org" hidden></span></div>
          <div class="fd"><label for="o-contact">联系人 <b>*</b></label>
            <input id="o-contact" autocomplete="name" placeholder="姓名">
            <span class="err" data-err="contact" hidden></span></div>
          <div class="fd"><label for="o-tel">联系电话 <b>*</b></label>
            <input id="o-tel" type="tel" autocomplete="tel" placeholder="手机或固话">
            <span class="err" data-err="tel" hidden></span></div>
          <div class="fd"><label for="o-scale">预估号码数量</label>
            <select id="o-scale">
              <option value="">请选择（选填）</option>
              <option value="1-10 线">1–10 线</option>
              <option value="11-50 线">11–50 线</option>
              <option value="51-200 线">51–200 线</option>
              <option value="200 线以上">200 线以上</option>
            </select></div>
          <div class="fd fd--full"><label for="o-addr">所在单位地址 / 行业</label>
            <input id="o-addr" placeholder="选填，例如：深圳市南山区 · 制造业"></div>
          <div class="fd fd--full"><label for="o-note">补充说明</label>
            <textarea id="o-note" rows="3" placeholder="选填，例如：希望覆盖的品牌范围、内容语种、期望上线时间"></textarea></div>
        </div>
        <label class="chk"><input type="checkbox" id="o-consent">
          <span>我已阅读并同意：所填写信息仅用于本次业务咨询与受理跟进。</span></label>
        <p class="err" id="errConsent" hidden></p>
        <div class="act">
          <button class="btn btn--primary" type="submit" id="submitBtn">在线提交需求单</button>
          <button class="btn btn--quiet btn--sm" type="button" id="previewBtn">预览需求单</button>
          <span class="hint" id="submitHint">提交后由客户经理联系确认；也可先预览再线下提交。</span>
        </div>
        <div class="alert" id="orderAlert" role="alert" hidden></div>
      </form>
    </div>
  </div>
</section>

<div class="modal" id="docPreview" hidden>
  <div class="modal__sc" data-close></div>
  <div class="modal__pn" role="dialog" aria-modal="true" aria-labelledby="docTitle">
    <div class="modal__hd">
      <h2 id="docTitle">需求单预览</h2>
      <button class="x" type="button" data-close aria-label="关闭">×</button>
    </div>
    <pre class="doc" id="docBody"></pre>
    <div class="act">
      <button class="btn btn--primary btn--sm" type="button" id="copyDoc">复制文本</button>
      <button class="btn btn--quiet btn--sm" type="button" id="printDoc">打印 / 存为 PDF</button>
    </div>
  </div>
</div>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>`;

  const P = data.products.map((p) => ({
    id: p.id,
    name: p.name,
    shortName: p.shortName || p.name,
    tiers: p.tiers.map((t) => ({ name: t.name, price: t.price, unit: t.unit, type: t.type, includes: t.includes })),
    priceNote: p.priceNote || '',
  }));

  const scripts = `
var PRODUCTS=${JSON.stringify(P)};
var SOURCE=${JSON.stringify({ form: data.catalog.sourceForm })};
var TERMS=${JSON.stringify(data.terms || [])};
var HOTLINE=${JSON.stringify(data.catalog.hotline)};
var $=function(s,r){return (r||document).querySelector(s)};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function money(n){return Number(n).toLocaleString('zh-CN')}
var PMAP={};PRODUCTS.forEach(function(p){PMAP[p.id]=p});
var picked={},toastT=null;
function toast(m,err){var el=$('#toast');el.textContent=m;el.className='toast'+(err?' toast--err':'');el.hidden=false;
  if(toastT)clearTimeout(toastT);toastT=setTimeout(function(){el.hidden=true},3600)}
function pickedIds(){return Object.keys(picked).filter(function(k){return picked[k]})}
function syncChips(){$$('.chip').forEach(function(c){c.classList.toggle('on',!!picked[c.getAttribute('data-chip')]);})}
function buildDoc(){
  var ids=pickedIds(),L=[];
  L.push('中国电信增值业务需求单');
  L.push('数据来源：'+SOURCE.form);
  L.push('生成时间：'+new Date().toLocaleString('zh-CN'));
  L.push('');
  L.push('【单位信息】');
  L.push('单位名称：'+($('#o-org').value.trim()||'（未填写）'));
  L.push('联系人：'+($('#o-contact').value.trim()||'（未填写）'));
  L.push('联系电话：'+($('#o-tel').value.trim()||'（未填写）'));
  var sc=$('#o-scale').value;if(sc)L.push('预估号码数量：'+sc);
  var ad=$('#o-addr').value.trim();if(ad)L.push('地址 / 行业：'+ad);
  L.push('');
  L.push('【意向产品与资费】');
  if(!ids.length)L.push('（尚未选择产品）');
  ids.forEach(function(id,i){var p=PMAP[id];if(!p)return;
    L.push((i+1)+'. '+p.name);
    p.tiers.forEach(function(t){L.push('   · '+t.name+'：'+money(t.price)+' '+t.unit+(t.includes?'（'+t.includes+'）':''));});
    if(p.priceNote)L.push('   说明：'+p.priceNote);});
  var nt=$('#o-note').value.trim();if(nt){L.push('');L.push('【补充说明】');L.push(nt);}
  L.push('');
  L.push('【受理须知】');
  TERMS.forEach(function(t){L.push('· '+t)});
  L.push('');
  L.push('提示：本单由线上生成，仅用于需求登记与预沟通；正式受理需填写《信息服务业务受理登记表》并加盖单位印章。');
  return L.join('\\n');
}
function openDoc(){
  if(!pickedIds().length){toast('请先选择至少一个意向产品');return}
  $('#docBody').textContent=buildDoc();
  $('#docPreview').hidden=false;document.body.style.overflow='hidden';
}
function closeDoc(){$('#docPreview').hidden=true;document.body.style.overflow='';}
function validate(){
  $$('.err').forEach(function(e){e.hidden=true;e.textContent=''});
  $$('[aria-invalid]').forEach(function(e){e.removeAttribute('aria-invalid')});
  var errs=[];
  var org=$('#o-org').value.trim(),contact=$('#o-contact').value.trim(),tel=$('#o-tel').value.trim();
  function fail(id,key,msg){errs.push(msg);var s=$('[data-err="'+key+'"]');if(s){s.hidden=false;s.textContent=msg}
    var el=document.getElementById(id);if(el)el.setAttribute('aria-invalid','true')}
  if(org.length<2)fail('o-org','org','请填写单位名称（至少 2 个字符）');
  if(contact.length<2)fail('o-contact','contact','请填写联系人姓名');
  if(!/^[0-9+\\-()\\s]{7,20}$/.test(tel))fail('o-tel','tel','请填写有效的联系电话（7–20 位数字）');
  if(!pickedIds().length){var e=$('#errProducts');e.hidden=false;e.textContent='请至少选择一个意向产品';errs.push('请至少选择一个意向产品')}
  if(!$('#o-consent').checked){var c=$('#errConsent');c.hidden=false;c.textContent='请确认同意信息使用说明';errs.push('请确认同意信息使用说明')}
  return errs;
}
$('#orderChips').addEventListener('change',function(e){
  var c=e.target.closest('.chip');if(!c)return;
  picked[c.getAttribute('data-chip')]=e.target.checked;syncChips();
});
$('#orderForm').addEventListener('submit',function(ev){
  ev.preventDefault();
  var box=$('#orderAlert');box.hidden=true;
  var errs=validate();
  if(errs.length){box.className='alert alert--err';box.innerHTML='<b>还有 '+errs.length+' 项需要修正</b>'+errs.map(esc).join('；');box.hidden=false;
    var b=$('[aria-invalid="true"]');if(b)b.focus();return}
  var btn=$('#submitBtn'),txt=btn.textContent;btn.disabled=true;btn.textContent='提交中…';
  fetch('/api/portal/zengzhi/orders',{method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({org:$('#o-org').value.trim(),contact:$('#o-contact').value.trim(),tel:$('#o-tel').value.trim(),
      addr:$('#o-addr').value.trim(),scale:$('#o-scale').value,products:pickedIds(),note:$('#o-note').value.trim()})
  }).then(function(res){return res.json().catch(function(){return null}).then(function(j){return {res:res,j:j}})})
  .then(function(o){
    if(o.res.ok&&o.j&&o.j.ok){
      box.className='alert alert--ok';
      box.innerHTML='<b>需求单已提交，受理编号 <code>'+esc(String(o.j.id).slice(0,8))+'</code></b>客户经理将按您留下的联系方式跟进受理细节。线上登记仅为预沟通，正式受理需填写《信息服务业务受理登记表》并加盖单位印章。';
      box.hidden=false;$('#orderForm').reset();picked={};syncChips();
      box.scrollIntoView({behavior:'smooth',block:'center'});
    }else if(o.res.status===429){
      box.className='alert alert--err';box.innerHTML='<b>提交过于频繁</b>请稍后再试，或直接拨打 '+esc(HOTLINE)+' 联系客户经理。';box.hidden=false;
    }else{
      var msg=(o.j&&o.j.errors&&o.j.errors.length)?o.j.errors.join('；'):('提交失败（HTTP '+o.res.status+'）');
      box.className='alert alert--err';box.innerHTML='<b>提交未成功</b>'+esc(msg)+'<br>您可以稍后重试，或使用「预览需求单」复制文本后线下提交。';box.hidden=false;
    }
  }).catch(function(){
    box.className='alert alert--err';
    box.innerHTML='<b>网络异常，提交失败</b>可点击「预览需求单」复制文本后线下提交，或直接拨打 '+esc(HOTLINE)+'。';box.hidden=false;
  }).then(function(){btn.disabled=false;btn.textContent=txt});
});
$('#previewBtn').addEventListener('click',openDoc);
$('#docPreview').addEventListener('click',function(e){if(e.target.closest('[data-close]'))closeDoc()});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!$('#docPreview').hidden)closeDoc()});
$('#copyDoc').addEventListener('click',function(){
  var t=$('#docBody').textContent;
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){toast('需求单文本已复制')},function(){toast('复制失败，请手动选择文本',true)})}
  else toast('当前浏览器不支持自动复制，请手动选择文本',true);
});
$('#printDoc').addEventListener('click',function(){window.print()});
(function(){
  var m=/[?&]p=([A-Za-z0-9._-]+)/.exec(location.search);
  if(!m||!PMAP[m[1]])return;
  picked[m[1]]=true;
  var chip=$('.chip[data-chip="'+m[1]+'"]');
  if(chip){var cb=chip.querySelector('input');if(cb)cb.checked=true}
  syncChips();
})();`;

  return page(data, {
    title: `需求登记 · ${data.name}`,
    desc: `登记中国电信增值业务需求：${data.products.map((p) => p.shortName || p.name).join('、')}。线上登记仅供预沟通，正式受理需填写受理登记表并加盖公章。`,
    active: 'order',
    body,
    scripts,
  });
}

/* ------------------------------------------------------------------ 站点渲染 */

/** 渲染全部页面：返回 [{ name, html }]，name 即发布后的文件名 */
export function renderSite(data) {
  const S = data.id;
  const pages = [
    { name: `${S}.html`, html: renderOverview(data) },
    { name: `${S}-pricing.html`, html: renderPricingPage(data) },
    { name: `${S}-order.html`, html: renderOrderPage(data) },
  ];
  for (const p of data.products) {
    pages.push({ name: pageName(S, p.id), html: renderProductPage(data, p.id) });
  }
  return pages;
}

/* ------------------------------------------------------------------ CLI */

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const id = process.argv[2] ?? '2026Q3-zengzhi';
  const outDir = process.argv[3] ?? resolve(here, '..', 'site');
  const jsonPath = process.argv[4] ?? resolve(here, '..', 'data', 'products', `${id}.json`);
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const result = validateProduct(data);
  if (!result.ok) {
    console.error('数据校验失败：');
    result.errors.forEach((e) => console.error('  - ' + e));
    process.exit(1);
  }
  for (const w of result.warnings) console.warn('  提示：' + w);
  fs.mkdirSync(outDir, { recursive: true });
  const pages = renderSite(data);
  let total = 0;
  for (const pg of pages) {
    fs.writeFileSync(resolve(outDir, pg.name), pg.html);
    total += Buffer.byteLength(pg.html);
    console.log(`  ${pg.name}  (${Buffer.byteLength(pg.html)} 字节)`);
  }
  console.log(`已渲染 ${pages.length} 页，共 ${total} 字节 → ${outDir}`);
}
