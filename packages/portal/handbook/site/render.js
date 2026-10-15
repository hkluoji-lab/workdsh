// render.js —— 手册页面渲染器（后台列表 / 后台预览共用）
// 公开页保留自包含实现（不依赖此文件），避免任何一个环节不可用导致公开页白屏。
export function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function mediaUrl(base, name) {
  return name ? base + encodeURIComponent(name) : '';
}

function pad(n) { return String(n).padStart(2, '0'); }

export function typeLabel(t) {
  return ({ cover: '封面', toc: '目录', sec: '文字页', img: '整页图片', imgpair: '双图页', free: '自由画布' }[t] || t || '—');
}

/**
 * 渲染单页。
 * 约定：cover / toc / sec 的正文以 page.body（HTML）为准，原样渲染；
 *      img / imgpair 使用 title / subtitle / image(s) / foot 结构化字段。
 */
export function renderPage(page, mediaBase, pageNo, total, brand) {
  if (!page) return '<div class="page blank"></div>';
  const t = page.type;

  if (t === 'cover') {
    return '<div class="page">' + (page.body || '') + '</div>';
  }

  if (t === 'free') return renderFreePage(page, mediaBase);

  if (t === 'img') {
    return '<div class="page"><div class="imgpage">'
      + '<div class="ibar"><b>' + esc(page.title) + '</b><span>' + esc(page.subtitle) + '</span></div>'
      + '<div class="iimg"><img class="zoomable" src="' + mediaUrl(mediaBase, page.image) + '" alt="' + esc(page.title) + '"></div>'
      + '<div class="ifoot">' + esc(page.foot) + '</div>'
      + '</div></div>';
  }

  if (t === 'imgpair') {
    const imgs = (page.images || []).map((n) =>
      '<img class="zoomable" src="' + mediaUrl(mediaBase, n) + '" alt="' + esc(page.title) + '">').join('');
    return '<div class="page"><div class="imgpage">'
      + '<div class="ibar"><b>' + esc(page.title) + '</b><span>' + esc(page.subtitle) + '</span></div>'
      + '<div class="iimg"><div class="imgpair two">' + imgs + '</div></div>'
      + '<div class="ifoot">' + esc(page.foot) + '</div>'
      + '</div></div>';
  }

  const foot = '<div class="pfoot"><span>' + esc(brand || '') + '</span>'
    + '<span class="no">' + pad(pageNo) + ' / ' + pad(total) + '</span></div>';
  return '<div class="page"><div class="pbody">' + (page.body || '') + '</div>' + foot + '</div>';
}

/** 内容超页时逐级缩小字号（与公开页同一算法） */
export function fitAll(root) {
  root.querySelectorAll('.pbody').forEach((body) => {
    const sizes = [13.5, 12.8, 12.1, 11.4, 10.8, 10.2, 9.6];
    let i = 0;
    body.style.fontSize = sizes[0] + 'px';
    while (body.scrollHeight > body.clientHeight + 2 && i < sizes.length - 1) {
      i += 1;
      body.style.fontSize = sizes[i] + 'px';
    }
  });
}

/* ---------------- 封面：结构化字段 ↔ HTML ---------------- */

/** 把封面 HTML 解析成可编辑字段；解析不到就是空串，不抛错。 */
export function coverFields(body) {
  const b = String(body || '');
  const pick = (re) => { const m = b.match(re); return m ? m[1].trim() : ''; };
  const tagBlock = pick(/<div class="cv-tag">([\s\S]*?)<\/div>/);
  const tags = [...tagBlock.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => m[1].trim()).filter(Boolean);
  const bg = (b.match(/url\(['"]?([^'")]+)['"]?\)/) || [])[1] || '';
  return {
    badge: pick(/<div class="cv-badge">([\s\S]*?)<\/div>/),
    top: pick(/<div class="cv-top">[\s\S]*?<\/span>([\s\S]*?)<\/div>/),
    title: pick(/<h1>([\s\S]*?)<\/h1>/),
    subtitle: pick(/<p class="cv-sub">([\s\S]*?)<\/p>/),
    tags,
    footer: pick(/<div class="cv-bot">([\s\S]*?)<\/div>\s*<\/div>\s*$/),
    bgImage: bg.indexOf('/portal/handbook-media/') === 0 ? decodeURIComponent(bg.split('/').pop()) : '',
  };
}

/** 由字段生成封面 HTML。title / footer 允许保留 <br><b> 这类行内标签，其余字段做转义。 */
export function buildCover(f) {
  const tags = (f.tags || []).map((t) => String(t).trim()).filter(Boolean);
  let style = '';
  if (f.bgImage) {
    style = ' style="background-image:'
      + 'radial-gradient(420px 300px at 86% 8%,rgba(232,114,44,.34),transparent 62%),'
      + 'radial-gradient(520px 380px at 6% 92%,rgba(23,128,208,.42),transparent 66%),'
      + 'linear-gradient(155deg,rgba(10,78,163,.80),rgba(6,47,102,.88)),'
      + "url('" + mediaUrl('/portal/handbook-media/', f.bgImage) + "')" + '"';
  }
  return '<div class="cover"' + style + '>'
    + (f.badge ? '<div class="cv-badge">' + esc(f.badge) + '</div>' : '')
    + '<div class="cv-top"><span class="dot"></span>' + esc(f.top || '') + '</div>'
    + '<h1>' + (f.title || '') + '</h1>'
    + '<p class="cv-sub">' + esc(f.subtitle || '') + '</p>'
    + (tags.length ? '<div class="cv-tag">' + tags.map((t) => '<span>' + esc(t) + '</span>').join('') + '</div>' : '')
    + '<div class="cv-line"></div>'
    + '<div class="cv-bot">' + (f.footer || '') + '</div>'
    + '</div>';
}

/* ==== FREE-RENDER-START（由 work/build-free.mjs 生成，勿手改）==== */
/* 自由画布页渲染器（单页设计尺寸 750 × 1061；坐标以百分比输出，缩放与设备无关）
   同一份逻辑同时用于：公开翻页页（内联）、后台实时预览、后台列表。
   字体/圆角等尺寸用 calc(Npx * var(--k))，--k = 当前页宽 / 750，由外层在布局时写入。
   本块由 work/build-free.mjs 组装生成，请勿直接手改 —— 改 work/free-parts/*。 */
var FC_W = 750, FC_H = 1061;
function fcEsc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function fcPct(v, total) { return (v / total * 100).toFixed(3) + '%'; }
function fcSize(px) { return 'calc(' + px + 'px * var(--k, 0.5))'; }

/* ---------------- 图标库（内联 SVG，零外部请求，公网页 CSP 无需放宽 img-src）
   统一线稿风格：stroke 取元素颜色，1.8 宽，圆角端点。几何都是基本图形，
   不依赖任何字体或图标字体（部分容器/访客设备没有符号字体，用字体图标会变豆腐块）。 */
var FC_ICON_STROKE = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

/** 五角星用公式算，避免手写路径出错 */
function fcStarPath(cx, cy, r) {
  var pts = [];
  for (var i = 0; i < 10; i += 1) {
    var rad = (i % 2 === 0) ? r : r * 0.42;
    var a = -Math.PI / 2 + i * Math.PI / 5;
    pts.push((cx + rad * Math.cos(a)).toFixed(2) + ',' + (cy + rad * Math.sin(a)).toFixed(2));
  }
  return 'M' + pts.join(' L') + ' Z';
}

var FC_ICON_BODY = {
  phone: '<path d="M6.8 10.6c1.3 2.6 3.5 4.8 6.1 6.1l2-2c.3-.3.7-.4 1-.2 1 .3 2.2.5 3.4.5.6 0 1 .4 1 1v3c0 .6-.4 1-1 1C10.9 20.1 3.9 13 3.9 4.4c0-.6.4-1 1-1h3c.6 0 1 .4 1 1 0 1.2.2 2.3.5 3.4.1.3 0 .7-.2 1l-2.4 1.8z" fill="currentColor" stroke="none"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M4 7.5l8 5.5 8-5.5"/>',
  chat: '<path d="M4.5 5.5h15v10.5H9.5L4.5 20z"/>',
  star: '<path d="' + fcStarPath(12, 12.4, 8.6) + '"/>',
  check: '<path d="M5 12.8l4.6 4.6L19 7.6"/>',
  location: '<path d="M12 21c0 0 6.8-6.1 6.8-10.8A6.8 6.8 0 0 0 5.2 10.2C5.2 14.9 12 21 12 21z"/><circle cx="12" cy="10.2" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3.4 2.1"/>',
  gift: '<rect x="3.5" y="7.5" width="17" height="3.5"/><rect x="5" y="11" width="14" height="9"/><path d="M12 7.5V20"/><circle cx="9.2" cy="5.2" r="1.7"/><circle cx="14.8" cy="5.2" r="1.7"/>',
  shield: '<path d="M12 3.2l7 2.8v5.6c0 4.9-3.1 7.9-7 9.2-3.9-1.3-7-4.3-7-9.2V6z"/><path d="M9 12l2.2 2.2L15.4 10"/>',
  cloud: '<path d="M7.2 18.2h9.6a3.9 3.9 0 0 0 .4-7.8 5.9 5.9 0 0 0-11.4 1.6 3.6 3.6 0 0 0 1.4 6.2z"/>',
  wifi: '<path d="M4 9.4a12 12 0 0 1 16 0"/><path d="M7.2 12.9a8 8 0 0 1 9.6 0"/><path d="M10.1 16.3a4 4 0 0 1 3.8 0"/><circle cx="12" cy="19.4" r="1.1" fill="currentColor" stroke="none"/>',
  chart: '<path d="M4 20h16"/><rect x="5.5" y="12" width="3.4" height="5.5"/><rect x="10.3" y="8" width="3.4" height="9.5"/><rect x="15.1" y="4.5" width="3.4" height="13"/>',
  doc: '<path d="M7 3.2h7l4 4V20.8H7z"/><path d="M14 3.2V7.4h4"/><path d="M9.4 12h5.6M9.4 15.4h5.6"/>',
  user: '<circle cx="12" cy="8.4" r="3.6"/><path d="M5.2 20c0-3.6 3-5.9 6.8-5.9s6.8 2.3 6.8 5.9"/>',
  arrow: '<path d="M4 12h15.2"/><path d="M13.6 6.4L19.2 12l-5.6 5.6"/>',
  cart: '<path d="M3.2 4.4h2.2L8 14.6h10.6L21 7.2H6"/><circle cx="9" cy="19" r="1.6"/><circle cx="17.4" cy="19" r="1.6"/>',
  link: '<path d="M9.8 14.2l4.4-4.4"/><path d="M7.6 12.4l-2 2a3.4 3.4 0 0 0 4.8 4.8l2-2"/><path d="M12.4 7.6l2-2a3.4 3.4 0 0 1 4.8 4.8l-2 2"/>',
  heart: '<path d="M12 20.4C12 20.4 3.6 15.3 3.6 9.9A4.3 4.3 0 0 1 12 7.9a4.3 4.3 0 0 1 8.4 2c0 5.4-8.4 10.5-8.4 10.5z"/>',
};

/** 生成一个图标的 SVG 内容；未知名字回落到 check（服务端也有白名单，双保险）。 */
function fcIconInner(name, color) {
  var body = FC_ICON_BODY[name] || FC_ICON_BODY.check;
  return '<svg viewBox="0 0 24 24" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" '
    + 'style="color:' + fcEsc(color || '#0a4ea3') + '" ' + FC_ICON_STROKE + ' aria-hidden="true">' + body + '</svg>';
}

/* ---------------- 入场动效 ----------------
   渲染时只写 data-anim 属性；是否播放由 freeCanvasRuntime 在可见时决定。
   这样同一份 HTML 既能用于公网（播放），也能用于后台编辑（不播放，避免干扰操作）。 */
var FC_ANIM_NAMES = ['fade', 'up', 'down', 'left', 'right', 'zoom'];
function fcAnimAttrs(el) {
  var p = el.props || {};
  if (!p.anim || FC_ANIM_NAMES.indexOf(p.anim) < 0) return '';
  var delay = Number(p.animDelay) || 0;
  return ' data-anim="' + fcEsc(p.anim) + '"' + (delay > 0 ? ' data-anim-delay="' + delay + '"' : '');
}

/* ---------------- 元素渲染 ---------------- */

/** 二维码：交给本站服务端用成熟库生成（/api/portal/handbook/qr），前端只放同源 <img>。
    为什么不在前端内联编码器：QR 的 RS 纠错/掩码选择/版本信息位极易写错，
    而且错了也看起来像二维码（实测过一版：76 组里 36 组与参考库不一致）。
    服务端生成后，后台预览与公网页走的是同一条路径，行为完全一致。 */
function fcQrSrc(text, ec, fg, bg) {
  return '/api/portal/handbook/qr?t=' + encodeURIComponent(String(text))
    + '&ec=' + encodeURIComponent(ec || 'M')
    + '&fg=' + encodeURIComponent(fg || '#15243a')
    + '&bg=' + encodeURIComponent(bg || '#ffffff');
}
function fcQrSvg(text, ec, fg, bg) {
  var t = String(text == null ? '' : text);
  if (t === '') return '<div class="fe-qr-empty">未填写二维码内容</div>';
  if (t.length > 600) return '<div class="fe-qr-empty">内容过长（超过 600 字符）</div>';
  return '<img class="fe-qr-img" src="' + fcEsc(fcQrSrc(t, ec, fg, bg)) + '" alt="二维码" loading="lazy">';
}

/** 倒计时：静态文本先算一次（无 JS 也能看到正确剩余时间），运行期再由 runtime 每秒刷新。 */
function fcCountdownParts(until, nowMs) {
  var t = Date.parse(String(until || ''));
  if (!isFinite(t)) return null;
  var left = t - (nowMs || Date.now());
  if (left <= 0) return null;
  var s = Math.floor(left / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
function fcCountdownText(until, nowMs) {
  var p = fcCountdownParts(until, nowMs);
  if (!p) return '';
  return p.d + ' 天 ' + p.h + ' 时 ' + p.m + ' 分 ' + p.s + ' 秒';
}

/**
 * 渲染一个自由画布元素。
 * 注意：新增组件时这里与 free-editor.js 的属性面板必须成对改，且经 build-free.mjs
 * 重新组装（公网页用的是同一份内联副本）。
 */
function renderFreeEl(el) {
  var p = el.props || {};
  var st = 'left:' + fcPct(el.x, FC_W) + ';top:' + fcPct(el.y, FC_H)
    + ';width:' + fcPct(el.w, FC_W) + ';height:' + fcPct(el.h, FC_H) + ';z-index:' + (el.z || 1);
  var anim = fcAnimAttrs(el);

  if (el.kind === 'image') {
    return '<div class="fe fe-image" style="' + st + (p.radius ? ';border-radius:' + fcSize(p.radius) : '') + '"' + anim + '>'
      + '<img loading="lazy" src="' + fcEsc(p.image ? '/portal/handbook-media/' + encodeURIComponent(p.image) : '') + '" alt="" style="object-fit:' + (p.fit || 'cover') + '"></div>';
  }
  if (el.kind === 'divider') {
    return '<div class="fe fe-divider" style="' + st + ';background:' + (p.color || '#dde5ef') + '"' + anim + '></div>';
  }
  if (el.kind === 'rect' || el.kind === 'ellipse') {
    return '<div class="fe ' + (el.kind === 'ellipse' ? 'fe-ellipse' : 'fe-rect') + '" style="' + st + ';background:' + (p.bg || '#eaf1fb')
      + (p.radius ? ';border-radius:' + fcSize(p.radius) : (el.kind === 'ellipse' ? ';border-radius:50%' : '')) + '"' + anim + '></div>';
  }
  if (el.kind === 'html') {
    return '<div class="fe fe-html" style="' + st + '"' + anim + '>' + (p.html || '') + '</div>';
  }
  if (el.kind === 'button') {
    var bs = st + ';background:' + (p.bg || '#0a4ea3') + ';color:' + (p.color || '#fff')
      + ';font-size:' + fcSize(p.fontSize) + ';border-radius:' + fcSize(p.radius || 8)
      + ';display:flex;align-items:center;justify-content:center;font-weight:' + (p.weight || 600);
    return p.href
      ? '<a class="fe fe-button" href="' + fcEsc(p.href) + '" target="_blank" rel="noopener" style="' + bs + '"' + anim + '>' + fcEsc(p.text || '按钮') + '</a>'
      : '<div class="fe fe-button" style="' + bs + '"' + anim + '>' + fcEsc(p.text || '按钮') + '</div>';
  }
  if (el.kind === 'icon') {
    var istyle = st + ';background:' + (p.bg || 'transparent')
      + (p.radius ? ';border-radius:' + fcSize(p.radius) : '')
      + ';display:flex;align-items:center;justify-content:center;padding:' + fcSize(2);
    return '<div class="fe fe-icon" style="' + istyle + '"' + anim + '>' + fcIconInner(p.icon, p.color) + '</div>';
  }
  if (el.kind === 'qrcode') {
    return '<div class="fe fe-qrcode" style="' + st + '"' + anim + '>'
      + fcQrSvg(p.qrText, p.qrEc, p.qrFg, p.qrBg) + '</div>';
  }
  if (el.kind === 'video') {
    if (!p.video) return '<div class="fe fe-video fe-empty" style="' + st + '"' + anim + '><span>未选择视频（点右侧「选择视频」）</span></div>';
    return '<div class="fe fe-video" style="' + st + (p.radius ? ';border-radius:' + fcSize(p.radius) : '') + '"' + anim + '>'
      + '<video controls playsinline preload="metadata"'
      + (p.poster ? ' poster="/portal/handbook-media/' + encodeURIComponent(p.poster) + '"' : '')
      + (p.autoplay ? ' autoplay' : '') + (p.loop ? ' loop' : '')
      + (p.muted || p.autoplay ? ' muted' : '')
      + ' src="/portal/handbook-media/' + encodeURIComponent(p.video) + '"></video></div>';
  }
  if (el.kind === 'gallery') {
    var imgs = p.images || [];
    var cols = Math.max(1, Math.min(4, p.cols || 2));
    var caps = p.captions || [];
    var cells = imgs.map(function (n, i) {
      var cap = caps[i] ? '<figcaption>' + fcEsc(caps[i]) + '</figcaption>' : '';
      return '<figure><img class="zoomable" loading="lazy" src="/portal/handbook-media/' + encodeURIComponent(n)
        + '" alt="' + fcEsc(caps[i] || '') + '">' + cap + '</figure>';
    }).join('');
    if (!imgs.length) cells = '<div class="fe-empty"><span>未选择图片</span></div>';
    return '<div class="fe fe-gallery" style="' + st + ';--cols:' + cols + ';--gap:' + fcSize(p.gap || 8)
      + (p.radius ? ';--radius:' + fcSize(p.radius) : '') + '"' + anim + '>' + cells + '</div>';
  }
  if (el.kind === 'form') {
    var rows = (p.fields || []).map(function (f, i) {
      var req = f.required ? ' required' : '';
      var star = f.required ? ' <i class="fe-req">*</i>' : '';
      var head = '<span>' + fcEsc(f.label) + star + '</span>';
      var attrs = ' name="f' + i + '" data-label="' + fcEsc(f.label) + '"' + req;
      if (f.type === 'textarea') return '<label class="fe-field">' + head + '<textarea rows="3"' + attrs + '></textarea></label>';
      if (f.type === 'select') {
        var opts = (f.options || []).map(function (o) { return '<option>' + fcEsc(o) + '</option>'; }).join('');
        return '<label class="fe-field">' + head + '<select' + attrs + '>' + opts + '</select></label>';
      }
      var itype = f.type === 'tel' ? 'tel' : (f.type === 'email' ? 'email' : 'text');
      return '<label class="fe-field">' + head + '<input type="' + itype + '"' + attrs + '></label>';
    }).join('');
    if (!rows) rows = '<div class="fe-empty"><span>未配置表单字段</span></div>';
    return '<form class="fe fe-form" style="' + st + '" data-success="' + fcEsc(p.successText || '已提交') + '" novalidate' + anim + '>'
      + rows
      + (p.note ? '<div class="fe-note">' + fcEsc(p.note) + '</div>' : '')
      + '<button type="submit" class="fe-submit">' + fcEsc(p.submitText || '提交') + '</button>'
      + '<input type="text" name="_hp" class="fe-hp" tabindex="-1" autocomplete="off" aria-hidden="true">'
      + '<div class="fe-formmsg" hidden></div></form>';
  }
  if (el.kind === 'countdown') {
    var txt = fcCountdownText(p.until);
    var done = txt === '';
    return '<div class="fe fe-countdown" style="' + st + ';color:' + fcEsc(p.color || '#0a4ea3') + '"'
      + ' data-until="' + fcEsc(p.until || '') + '" data-done="' + fcEsc(p.doneText || '活动已结束') + '"' + anim + '>'
      + (p.label ? '<div class="fe-cd-label">' + fcEsc(p.label) + '</div>' : '')
      + '<div class="fe-cd-time">' + fcEsc(done ? (p.doneText || '活动已结束') : txt) + '</div></div>';
  }
  return '<div class="fe fe-text" style="' + st + ';color:' + (p.color || '#15243a') + ';font-size:' + fcSize(p.fontSize)
    + ';font-weight:' + (p.weight || 400) + ';text-align:' + (p.align || 'left') + ';line-height:' + (p.lineHeight || 1.5)
    + ';white-space:pre-wrap"' + anim + '>' + fcEsc(p.text || '') + '</div>';
}

function renderFreePage(page) {
  var c = page.canvas || { bg: '#ffffff' };
  var els = (page.elements || []).slice().sort(function (a, b) { return (a.z || 1) - (b.z || 1); }).map(renderFreeEl).join('');
  // data-page-id 供表单提交回传所属页面（服务端据此核对必填字段）
  return '<div class="page" data-page-id="' + fcEsc(page.id || '') + '"><div class="freecanvas" style="background:' + fcEsc(c.bg || '#ffffff') + '">' + els + '</div></div>';
}
function renderFreeCanvasInner(page) {
  var c = (page && page.canvas) || { bg: '#ffffff' };
  var els = ((page && page.elements) || []).slice().sort(function (a, b) { return (a.z || 1) - (b.z || 1); }).map(renderFreeEl).join('');
  return '<div class="freecanvas" style="background:' + fcEsc(c.bg || '#ffffff') + '">' + els + '</div>';
}

/* ---------------- 运行期行为（公网页用；后台编辑不调用）
   三件事：倒计时每秒走、表单同源提交、入场动效在可见时播放。
   幂等：重复调用不会重复绑定（靠 data 标记）。 */
function fcFormMsg(node, text, isErr) {
  if (!node) return;
  node.hidden = false;
  node.textContent = text;
  node.className = 'fe-formmsg' + (isErr ? ' is-err' : ' is-ok');
}

function freeCanvasRuntime(root) {
  var scope = root || document;
  if (!scope.querySelectorAll) return;

  /* 1) 倒计时 */
  Array.prototype.forEach.call(scope.querySelectorAll('.fe-countdown[data-until]'), function (node) {
    if (node.getAttribute('data-cd') === '1') return;
    node.setAttribute('data-cd', '1');
    var time = node.querySelector('.fe-cd-time');
    var tick = function () {
      var txt = fcCountdownText(node.getAttribute('data-until'));
      if (time) time.textContent = txt === '' ? (node.getAttribute('data-done') || '活动已结束') : txt;
      if (txt === '' && node.__cdTimer) { clearInterval(node.__cdTimer); node.__cdTimer = null; }
    };
    tick();
    if (!node.__cdTimer) node.__cdTimer = setInterval(tick, 1000);
  });

  /* 2) 表单提交 */
  Array.prototype.forEach.call(scope.querySelectorAll('form.fe-form'), function (form) {
    if (form.getAttribute('data-bound') === '1') return;
    form.setAttribute('data-bound', '1');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var msg = form.querySelector('.fe-formmsg');
      var items = [], missing = [];
      Array.prototype.forEach.call(form.querySelectorAll('[data-label]'), function (input) {
        var v = String(input.value == null ? '' : input.value).trim();
        if (input.hasAttribute('required') && v === '') missing.push(input.getAttribute('data-label'));
        if (v !== '') items.push({ label: input.getAttribute('data-label'), value: v });
      });
      if (missing.length) { fcFormMsg(msg, '请填写：' + missing.join('、'), true); return; }
      if (!items.length) { fcFormMsg(msg, '请至少填写一项', true); return; }
      var pageEl = form.closest ? form.closest('[data-page-id]') : null;
      var hp = form.querySelector('.fe-hp');
      var btn = form.querySelector('.fe-submit');
      if (btn) btn.disabled = true;
      fetch('/api/portal/handbook/form', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: pageEl ? pageEl.getAttribute('data-page-id') : '',
          items: items,
          _hp: hp ? hp.value : '',
        }),
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; });
      }).then(function (res) {
        if (res.ok && res.j && res.j.ok) {
          form.reset();
          fcFormMsg(msg, form.getAttribute('data-success') || '已提交', false);
          if (btn) { btn.textContent = '已提交'; btn.disabled = true; }
          return;
        }
        var err = (res.j && (res.j.error || (res.j.fields && ('请填写：' + res.j.fields.join('、'))))) || '提交失败';
        if (err === 'too-many-submissions') err = '提交过于频繁，请稍后再试';
        else if (err === 'required-missing') err = '请填写必填项';
        else if (res.j && res.j.fields) err = '请填写：' + res.j.fields.join('、');
        else err = '提交失败，请稍后再试';
        fcFormMsg(msg, err, true);
        if (btn) btn.disabled = false;
      }).catch(function () {
        fcFormMsg(msg, '网络异常，请稍后再试', true);
        if (btn) btn.disabled = false;
      });
    });
  });

  /* 3) 入场动效 */
  var nodes = Array.prototype.slice.call(scope.querySelectorAll('[data-anim]'));
  if (!nodes.length) return;
  var show = function (n) {
    if (n.getAttribute('data-anim-done') === '1') return;
    n.setAttribute('data-anim-done', '1');
    var delay = Number(n.getAttribute('data-anim-delay') || 0);
    if (delay > 0) setTimeout(function () { n.className += ' fe-in'; }, delay);
    else n.className += ' fe-in';
  };
  var inView = function (n) {
    var r = n.getBoundingClientRect();
    var vh = window.innerHeight || 800, vw = window.innerWidth || 1200;
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
  };
  nodes.forEach(function (n) { if (inView(n)) show(n); });
  if (typeof IntersectionObserver === 'function') {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { show(en.target); io.unobserve(en.target); } });
    }, { threshold: 0.05 });
    nodes.forEach(function (n) { if (n.getAttribute('data-anim-done') !== '1') io.observe(n); });
  } else {
    nodes.forEach(show);
  }
}
/* ==== FREE-RENDER-END ==== */

/* 模块导出：内联副本（公网页）不需要 export，因此在标记区之外单独声明 */
export { renderFreeEl, renderFreePage, renderFreeCanvasInner, freeCanvasRuntime };



/** 正文内插图标签（与公开页渲染一致，class=zoomable 便于点击放大） */
export function inlineImageTag(name, alt) {
  return '<img class="zoomable" src="' + mediaUrl('/portal/handbook-media/', name) + '" alt="' + esc(alt || '') + '">';
}

/* ---------------- 正文标题：从 HTML 里解析 / 写回 ----------------
   背景：可见标题原本只能改「正文 HTML」文本域，用户找不到。现在拆成两个输入框，
   保存时自动写回正文，既不改用户手写的其余 HTML，也不引入额外存储字段。 */

export function titleFields(body) {
  const b = String(body || '');
  const t = (b.match(/<h2 class="pt">(?:<span class="bar"><\/span>)?([\s\S]*?)<\/h2>/) || [])[1] || '';
  const s2 = (b.match(/<p class="psub">([\s\S]*?)<\/p>/) || [])[1] || '';
  return { title: t.trim(), sub: s2.trim() };
}

export function applyTitleFields(body, title, sub) {
  let b = String(body || '');
  const hasH2 = /<h2 class="pt">[\s\S]*?<\/h2>/.test(b);
  const hasPs = /<p class="psub">[\s\S]*?<\/p>/.test(b);
  const t = String(title == null ? '' : title).trim();
  const p2 = String(sub == null ? '' : sub).trim();
  if (t !== '') {
    const h2 = '<h2 class="pt"><span class="bar"></span>' + t + '</h2>';
    b = hasH2 ? b.replace(/<h2 class="pt">[\s\S]*?<\/h2>/, h2) : h2 + '\n' + b;
  } else if (hasH2) {
    b = b.replace(/<h2 class="pt">[\s\S]*?<\/h2>\s*/, '');
  }
  if (p2 !== '') {
    const ps = '<p class="psub">' + p2 + '</p>';
    if (/<p class="psub">[\s\S]*?<\/p>/.test(b)) b = b.replace(/<p class="psub">[\s\S]*?<\/p>/, ps);
    else if (/<h2 class="pt">[\s\S]*?<\/h2>/.test(b)) b = b.replace(/(<h2 class="pt">[\s\S]*?<\/h2>)/, '$1\n' + ps);
    else b = ps + '\n' + b;
  } else if (hasPs) {
    b = b.replace(/<p class="psub">[\s\S]*?<\/p>\s*/, '');
  }
  return b;
}
