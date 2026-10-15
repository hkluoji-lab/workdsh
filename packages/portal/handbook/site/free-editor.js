// free-editor.js —— 自由画布页的可视化编辑器
// v2（F3 第一批）：撤销/重做、多选与成组、复制粘贴、快捷键；顺带修掉"打字丢焦点"。
// 坐标以设计尺寸 750×1061 保存，编辑器内按显示宽度等比缩放，因此任意屏幕下操作手感一致。
// 与渲染层解耦：编辑完成的对象结构直接就是后端 normalizeElement 接收的结构。
// 元素上的 group 字段（grp-xxx）由后端 normalizeElement 白名单保留，用于成组。
import { renderFreeEl } from './render.js';

const CW = 750, CH = 1061;
const SNAP = 5;
const MAX_HISTORY = 100;      // 历史步数上限
const COALESCE_MS = 1200;     // 同一处的连续编辑合并成一步
const GROUP_RE = /^grp-[A-Za-z0-9-]{2,40}$/;
const CLIP_KIND = 'workdsh-handbook-elements';
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

const KIND_LABEL = {
  text: '文本', image: '图片', button: '按钮', rect: '矩形', ellipse: '圆/椭圆', divider: '分割线', html: '自定义 HTML',
  icon: '图标', qrcode: '二维码', video: '视频', gallery: '图集', form: '表单', countdown: '倒计时',
};
// 这些组件的属性面板是专用的，不再走"字号/文字颜色/背景色"的通用分支
const SPECIAL_KINDS = ['icon', 'qrcode', 'video', 'gallery', 'form', 'countdown'];
const ICON_CHOICES = [
  ['phone', '电话'], ['mail', '邮件'], ['chat', '消息'], ['star', '星标'], ['check', '勾选'],
  ['location', '定位'], ['clock', '时间'], ['gift', '礼包'], ['shield', '安全'], ['cloud', '云'],
  ['wifi', '网络'], ['chart', '图表'], ['doc', '文档'], ['user', '用户'], ['arrow', '箭头'],
  ['cart', '采购'], ['link', '链接'], ['heart', '关注'],
];
const FORM_TYPES = [['text', '单行文本'], ['tel', '电话'], ['email', '邮箱'], ['textarea', '多行文本'], ['select', '下拉选择']];

let uid = 0;
function newId() { uid += 1; return 'el-' + Date.now().toString(36) + '-' + uid.toString(36) + Math.random().toString(36).slice(2, 5); }
function newGroupId() { return 'grp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
/** datetime-local 需要"本地时间"字符串（toISOString 给的是 UTC，直接填会差一个时区） */
function localDatetimeValue(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function byZ(a, b) { return (a.z || 1) - (b.z || 1); }
function grouped(e) { return Boolean(e && GROUP_RE.test(String(e.group || ''))); }

export function defaultElement(kind, brand) {
  const base = { id: newId(), kind, x: 60, y: 120, w: 300, h: 60, z: 1, props: {} };
  const p = base.props;
  if (kind === 'text') Object.assign(base, { w: 500, h: 66 }, { props: { text: '在此输入文字', fontSize: 26, color: '#15243a', weight: 400, align: 'left', lineHeight: 1.5 } });
  else if (kind === 'image') Object.assign(base, { w: 320, h: 220 }, { props: { image: '', fit: 'cover', radius: 10 } });
  else if (kind === 'button') Object.assign(base, { w: 260, h: 72 }, { props: { text: '立即咨询', href: '', bg: brand || '#0a4ea3', color: '#ffffff', fontSize: 26, weight: 600, radius: 36 } });
  else if (kind === 'rect') Object.assign(base, { w: 630, h: 180 }, { props: { bg: '#eaf1fb', radius: 14 } });
  else if (kind === 'ellipse') Object.assign(base, { w: 200, h: 200 }, { props: { bg: '#0a4ea3' } });
  else if (kind === 'divider') Object.assign(base, { w: 630, h: 2 }, { props: { color: '#dde5ef' } });
  else if (kind === 'html') Object.assign(base, { w: 630, h: 180 }, { props: { html: '<p>在此写任意 HTML / CSS。</p>' } });
  else if (kind === 'icon') Object.assign(base, { w: 96, h: 96 }, { props: { icon: 'phone', color: '#0a4ea3', bg: '', radius: 0 } });
  else if (kind === 'qrcode') Object.assign(base, { w: 200, h: 200 }, { props: { qrText: 'https://dsh.10ge.cn/', qrEc: 'M', qrFg: '#15243a', qrBg: '#ffffff' } });
  else if (kind === 'video') Object.assign(base, { w: 560, h: 315 }, { props: { video: '', poster: '', controls: true, autoplay: false, loop: false, muted: false, radius: 10 } });
  else if (kind === 'gallery') Object.assign(base, { w: 630, h: 320 }, { props: { images: [], captions: [], cols: 2, gap: 8, radius: 8 } });
  else if (kind === 'form') Object.assign(base, { w: 600, h: 420 }, { props: {
    fields: [
      { label: '姓名', type: 'text', required: true, options: [] },
      { label: '手机号', type: 'tel', required: true, options: [] },
      { label: '需求说明', type: 'textarea', required: false, options: [] },
    ],
    submitText: '提交', successText: '已收到，我们会尽快联系你。', note: '',
  } });
  else if (kind === 'countdown') Object.assign(base, { w: 420, h: 110 }, { props: {
    until: localDatetimeValue(Date.now() + 7 * 86400000),
    label: '距活动结束', doneText: '活动已结束', color: '#0a4ea3',
  } });
  return base;
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/**
 * 挂载编辑器。
 * @param {HTMLElement} host 容器
 * @param {object} opts { page, brand, onPickMedia(cb), onChange(page), onToast(msg, isErr) }
 * @returns {{ getPage():object, addElement(kind:string):void, select(id:string|null):void,
 *             undo():void, redo():void, group():void, ungroup():void, destroy():void }}
 */
export function mountFreeEditor(host, opts) {
  let page = clone(opts.page || { type: 'free', canvas: { w: CW, h: CH, bg: '#ffffff' }, elements: [] });
  page.canvas = page.canvas || { w: CW, h: CH, bg: '#ffffff' };
  page.elements = Array.isArray(page.elements) ? page.elements : [];

  let selIds = [];               // 选中集合（多选/成组）
  let drag = null;               // 拖拽状态
  let marquee = null;            // 框选状态
  const past = [];               // 历史栈
  const future = [];
  let clipboard = [];            // 内部剪贴板
  let lastKey = '', lastAt = 0, pendingIdx = -1;

  host.innerHTML = '';
  const bar = el('div', 'febar');
  const canvasWrap = el('div', 'fewrap');
  const canvas = el('div', 'fecanvas');
  const props = el('div', 'feprops');
  canvasWrap.appendChild(canvas);
  host.append(bar, canvasWrap, props);

  function toast(msg, isErr) { if (opts.onToast) { try { opts.onToast(msg, isErr); } catch { /* 忽略 */ } } }

  // ---------------- 基础工具 ----------------
  function byId(id) { return page.elements.find((e) => e.id === id) || null; }
  function touch() { if (opts.onChange) opts.onChange(page); }
  function pct(v) { return (v * 100).toFixed(3) + '%'; }
  function node(id) { return canvas.querySelector('[data-eid="' + id + '"]'); }
  function selElements() { return selIds.map(byId).filter(Boolean); }
  function isSel(id) { return selIds.indexOf(id) >= 0; }
  function scale() { return Math.max(80, canvas.clientWidth) / CW; }

  function syncScale() {
    const w = canvas.clientWidth || 320;
    canvas.style.setProperty('--k', (w / CW).toFixed(4));
  }

  // ---------------- 历史（撤销/重做） ----------------
  function snap() { return { canvas: clone(page.canvas), elements: clone(page.elements), sel: selIds.slice(), primary: selIds[0] || null }; }
  function sameSnap(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  function pushHistory(pre) {
    const cur = pre || snap();
    if (past.length && sameSnap(past[past.length - 1], cur)) { syncUndoButtons(); return false; }
    past.push(cur);
    if (past.length > MAX_HISTORY) past.shift();
    future.length = 0;
    syncUndoButtons();
    return true;
  }

  /** 变更前打点。key 相同且间隔小于 COALESCE_MS 时合并为一步（连续打字/连续微调）。 */
  function beginChange(key) {
    const now = Date.now();
    if (key && key === lastKey && now - lastAt < COALESCE_MS) { lastAt = now; return; }
    lastKey = key || ''; lastAt = now;
    const added = pushHistory(snap());
    pendingIdx = added ? past.length - 1 : -1;
  }

  /** 输入框失焦时收尾：若这一步其实什么都没改，就把占位的空历史项撤掉。 */
  function settleChange() {
    if (pendingIdx < 0 || pendingIdx >= past.length) { pendingIdx = -1; return; }
    if (sameSnap(past[pendingIdx], snap())) past.splice(pendingIdx, 1);
    pendingIdx = -1;
    syncUndoButtons();
  }

  function restore(s) {
    page.canvas = clone(s.canvas);
    page.elements = clone(s.elements);
    selIds = (s.sel || []).filter((id) => byId(id));
    renderCanvas();
    touch();
  }

  function undo() {
    if (!past.length) return;
    future.push(snap());
    restore(past.pop());
    syncUndoButtons();
  }
  function redo() {
    if (!future.length) return;
    past.push(snap());
    restore(future.pop());
    syncUndoButtons();
  }

  // ---------------- 选择与成组 ----------------
  function groupMembers(id) {
    const e = byId(id);
    if (!grouped(e)) return [id];
    return page.elements.filter((x) => x.group === e.group).map((x) => x.id);
  }
  function expand(ids) {
    const out = [];
    ids.forEach((id) => groupMembers(id).forEach((m) => { if (out.indexOf(m) < 0) out.push(m); }));
    return out;
  }
  function setSel(ids, primary) {
    selIds = expand(ids).filter((id) => byId(id));
    if (primary && selIds.indexOf(primary) < 0) selIds.unshift(primary);
    renderCanvas();
  }
  function select(id) { setSel(id ? [id] : [], id || null); }
  function toggleSel(id) {
    const ids = groupMembers(id);
    const allIn = ids.every(isSel);
    selIds = allIn ? selIds.filter((x) => ids.indexOf(x) < 0) : selIds.concat(ids.filter((x) => !isSel(x)));
    renderCanvas();
  }
  function groupSel() {
    if (selIds.length < 2) { toast('至少选中 2 个元素才能成组', true); return; }
    beginChange();
    const gid = newGroupId();
    selElements().forEach((e) => { e.group = gid; });
    renderCanvas(); touch();
    toast('已编组 ' + selIds.length + ' 个元素');
  }
  function ungroupSel() {
    const list = selElements().filter(grouped);
    if (!list.length) { toast('所选元素没有编组', true); return; }
    beginChange();
    list.forEach((e) => { delete e.group; });
    renderCanvas(); touch();
    toast('已解组 ' + list.length + ' 个元素');
  }

  // ---------------- 复制 / 粘贴 ----------------
  function copySel(silent) {
    const list = selElements();
    if (!list.length) return false;
    clipboard = list.map(clone);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        const p = navigator.clipboard.writeText(JSON.stringify({ kind: CLIP_KIND, elements: clipboard }));
        if (p && p.catch) p.catch(() => {});   // 写系统剪贴板被拒（非 HTTPS/无权限）不影响内部粘贴
      }
    } catch { /* 忽略 */ }
    if (!silent) toast('已复制 ' + list.length + ' 个元素');
    return true;
  }
  function cutSel() { if (copySel(true)) { toast('已剪切 ' + selIds.length + ' 个元素'); delSel(true); } }

  function pasteElements(list) {
    if (!Array.isArray(list) || !list.length) return;
    beginChange();
    let baseZ = page.elements.reduce((m, x) => Math.max(m, x.z || 1), 0);
    const gmap = {};
    const created = [];
    list.forEach((src, i) => {
      if (!src || typeof src !== 'object') return;
      const c = clone(src);
      c.id = newId();
      c.x = Math.round((Number(c.x) || 0) / SNAP) * SNAP + 20;
      c.y = Math.round((Number(c.y) || 0) / SNAP) * SNAP + 20;
      c.z = baseZ + i + 1;
      if (grouped(c)) { gmap[c.group] = gmap[c.group] || newGroupId(); c.group = gmap[c.group]; } else { delete c.group; }
      page.elements.push(c);
      created.push(c);
    });
    if (!created.length) return;
    selIds = created.map((c) => c.id);
    renderCanvas(); touch();
    toast('已粘贴 ' + created.length + ' 个元素');
  }

  function paste() {
    if (clipboard.length) { pasteElements(clipboard); return; }
    // 内部剪贴板为空时，尝试读系统剪贴板（需权限，失败静默）
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then((txt) => {
          let j = null;
          try { j = JSON.parse(txt); } catch { return; }
          if (j && j.kind === CLIP_KIND && Array.isArray(j.elements)) pasteElements(j.elements);
        }).catch(() => {});
      }
    } catch { /* 忽略 */ }
  }

  function duplicateSel() {
    if (!selIds.length) return;
    pasteElements(selElements().map(clone));
  }

  function delSel(silent) {
    if (!selIds.length) return;
    beginChange();
    const n = selIds.length;
    page.elements = page.elements.filter((e) => !isSel(e.id));
    selIds = [];
    renderCanvas(); touch();
    if (!silent) toast('已删除 ' + n + ' 个元素');
  }

  function nudge(dx, dy) {
    if (!selIds.length) return;
    beginChange('nudge');
    selElements().forEach((e) => { e.x += dx; e.y += dy; });
    paint(); touch();
  }

  // ---------------- 画布与绘制 ----------------
  function boxRect() {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    selElements().forEach((e) => {
      x1 = Math.min(x1, e.x); y1 = Math.min(y1, e.y);
      x2 = Math.max(x2, e.x + e.w); y2 = Math.max(y2, e.y + e.h);
    });
    if (!Number.isFinite(x1)) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) };
  }

  function placeBox(b) {
    const r = boxRect();
    b.style.left = pct(r.x / CW); b.style.top = pct(r.y / CH);
    b.style.width = pct(r.w / CW); b.style.height = pct(r.h / CH);
  }

  function decorate(n, id) {
    const owner = byId(id);
    n.classList.add('sel');
    if (grouped(owner)) n.classList.add('grouped');
    if (selIds.length === 1) n.appendChild(el('i', 'fe-h'));
  }

  function renderCanvas() {
    syncScale();
    canvas.style.background = page.canvas.bg || '#ffffff';
    canvas.innerHTML = page.elements.slice().sort(byZ)
      .map((e) => renderFreeEl(e).replace('class="fe', 'data-eid="' + esc(e.id) + '" class="fe')).join('');
    const multi = selIds.length > 1;
    selIds.forEach((id) => {
      const n = node(id);
      if (!n) return;
      n.classList.add('sel');
      if (grouped(byId(id))) n.classList.add('grouped');
      if (!multi) n.appendChild(el('i', 'fe-h'));
    });
    if (multi) { const b = el('div', 'febox'); placeBox(b); b.appendChild(el('i', 'fe-h')); canvas.appendChild(b); }
    canvas.appendChild(el('div', 'fegrid'));
    if (marquee) canvas.appendChild(marqueeNode());
    renderProps();
  }

  /** 拖拽过程中只改样式，不重建 DOM（避免丢指针捕获与丢焦点）。 */
  function paint() {
    page.elements.forEach((e) => {
      const n = node(e.id);
      if (!n) return;
      n.style.left = pct(e.x / CW); n.style.top = pct(e.y / CH);
      n.style.width = pct(e.w / CW); n.style.height = pct(e.h / CH);
    });
    const b = canvas.querySelector('.febox');
    if (b) placeBox(b);
  }

  /** 单元素属性改动：只替换该元素节点 + 刷新外框，属性面板保持聚焦。 */
  function repaintEl(e) {
    const n = node(e.id);
    if (!n) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = renderFreeEl(e).replace('class="fe', 'data-eid="' + esc(e.id) + '" class="fe');
    const fresh = wrap.firstElementChild;
    if (!fresh) return;
    if (isSel(e.id)) decorate(fresh, e.id);
    else if (grouped(e)) fresh.classList.add('grouped');
    n.replaceWith(fresh);
    const b = canvas.querySelector('.febox');
    if (b && selIds.length > 1) placeBox(b);
  }

  /** 按 z 重排已有节点（不重建 DOM，避免属性面板丢焦点） */
  function reorderLayers() {
    page.elements.slice().sort(byZ).forEach((e) => { const n = node(e.id); if (n) canvas.appendChild(n); });
    ['.febox', '.fegrid', '.femarquee'].forEach((s) => { const n = canvas.querySelector(s); if (n) canvas.appendChild(n); });
  }

  function marqueeNode() {
    const b = el('div', 'femarquee');
    const x1 = Math.min(marquee.x0, marquee.x1), y1 = Math.min(marquee.y0, marquee.y1);
    b.style.left = x1 + 'px'; b.style.top = y1 + 'px';
    b.style.width = Math.abs(marquee.x1 - marquee.x0) + 'px';
    b.style.height = Math.abs(marquee.y1 - marquee.y0) + 'px';
    return b;
  }

  // ---------------- 工具条 ----------------
  const tools = el('div', 'fetools');
  Object.keys(KIND_LABEL).forEach((k) => {
    const b = el('button', 'febtn', '＋ ' + KIND_LABEL[k]);
    b.type = 'button';
    b.addEventListener('click', () => addElement(k));
    tools.appendChild(b);
  });
  const layerBar = el('div', 'felayers');
  let btnUndo = null, btnRedo = null;
  const op = (label, fn, title) => {
    const b = el('button', 'febtn ghost', label);
    b.type = 'button';
    if (title) b.title = title;
    b.addEventListener('click', fn);
    layerBar.appendChild(b);
    return b;
  };
  btnUndo = op('撤销', undo, 'Ctrl+Z');
  btnRedo = op('重做', redo, 'Ctrl+Shift+Z');
  op('复制', () => copySel(), 'Ctrl+C');
  op('粘贴', paste, 'Ctrl+V');
  op('再制', duplicateSel, 'Ctrl+D');
  op('成组', groupSel, 'Ctrl+G');
  op('解组', ungroupSel, 'Ctrl+Shift+G');
  op('置顶', () => layerOp('top'));
  op('上移', () => layerOp('up'));
  op('下移', () => layerOp('down'));
  op('置底', () => layerOp('bottom'));
  op('删除', () => delSel(), 'Delete');
  bar.append(tools, layerBar);

  function syncUndoButtons() {
    if (btnUndo) btnUndo.disabled = past.length === 0;
    if (btnRedo) btnRedo.disabled = future.length === 0;
  }

  function addElement(kind) {
    beginChange();
    const e = defaultElement(kind, opts.brand);
    e.z = page.elements.reduce((m, x) => Math.max(m, x.z || 1), 0) + 1;
    e.y = Math.min(CH - e.h - 20, 120 + page.elements.length * 24);
    page.elements.push(e);
    selIds = [e.id];
    renderCanvas(); touch();
  }

  function layerOp(which) {
    if (!selIds.length) return;
    if (which === 'dup') { duplicateSel(); return; }
    if (which === 'del') { delSel(); return; }
    beginChange();
    const list = selElements();
    const zs = page.elements.map((x) => x.z || 1);
    let maxZ = Math.max(...zs), minZ = Math.min(...zs);
    if (which === 'top') list.forEach((e, i) => { e.z = maxZ + 1 + i; });
    else if (which === 'bottom') list.forEach((e, i) => { e.z = Math.max(0, minZ - list.length + i); });
    else if (which === 'up') list.forEach((e) => { e.z = Math.min(maxZ + 1, (e.z || 1) + 1); });
    else if (which === 'down') list.forEach((e) => { e.z = Math.max(0, (e.z || 1) - 1); });
    renderCanvas(); touch();
  }

  // ---------------- 对齐 / 分布（多选） ----------------
  function alignSel(mode) {
    if (selIds.length < 2) return;
    beginChange('align');
    const list = selElements();
    const r = boxRect();
    list.forEach((e) => {
      if (mode === 'left') e.x = r.x;
      else if (mode === 'hcenter') e.x = Math.round(r.x + (r.w - e.w) / 2);
      else if (mode === 'right') e.x = Math.round(r.x + r.w - e.w);
      else if (mode === 'top') e.y = r.y;
      else if (mode === 'vcenter') e.y = Math.round(r.y + (r.h - e.h) / 2);
      else if (mode === 'bottom') e.y = Math.round(r.y + r.h - e.h);
    });
    renderCanvas(); touch();
  }
  function distributeSel(axis) {
    const list = selElements();
    if (list.length < 3) { toast('至少 3 个元素才能等距分布', true); return; }
    beginChange('dist');
    const key = axis === 'h' ? 'x' : 'y';
    const size = axis === 'h' ? 'w' : 'h';
    const sorted = list.slice().sort((a, b) => a[key] - b[key]);
    const first = sorted[0], last = sorted[sorted.length - 1];
    const span = (last[key] + last[size]) - first[key];
    const used = sorted.reduce((s, e) => s + e[size], 0);
    const gap = (span - used) / (sorted.length - 1);
    let cur = first[key];
    sorted.forEach((e) => { e[key] = Math.round(cur); cur += e[size] + gap; });
    renderCanvas(); touch();
  }

  // ---------------- 指针：拖拽 / 缩放 / 框选 ----------------
  canvas.addEventListener('pointerdown', (ev) => {
    const handle = ev.target.closest('.fe-h');
    const boxHandle = Boolean(handle && handle.closest('.febox'));
    const n = ev.target.closest('[data-eid]');
    // 多选/成组外框的把手：整组缩放（外框自身 pointer-events:none，只有把手可点）
    if (boxHandle && selIds.length > 1) {
      drag = {
        mode: 'gresize', k: scale(), pre: snap(), sx: ev.clientX, sy: ev.clientY, r: boxRect(),
        els: selElements().map((x) => ({ id: x.id, x: x.x, y: x.y, w: x.w, h: x.h })),
      };
      ev.preventDefault();
      return;
    }
    if (!n) { startMarquee(ev); return; }
    const id = n.getAttribute('data-eid');
    const e = byId(id);
    if (!e) return;
    if (ev.shiftKey) toggleSel(id);
    else if (!isSel(id)) setSel([id], id);
    if (!selIds.length) { renderCanvas(); ev.preventDefault(); return; }

    const k = scale();
    const pre = snap();
    if (handle) drag = { mode: 'resize', k, pre, sx: ev.clientX, sy: ev.clientY, e, w0: e.w, h0: e.h };
    else drag = { mode: 'move', k, pre, sx: ev.clientX, sy: ev.clientY, els: selElements().map((x) => ({ id: x.id, x: x.x, y: x.y })), click: { id, shift: ev.shiftKey, wasMulti: selIds.length > 1 } };
    // 指针捕获：选中态变化会重绘节点，旧节点已脱离文档，捕获旧节点会抛 InvalidStateError。
    // 移动/缩放监听挂在 window 上，捕获失败不影响手感，因此按「活节点 + 容错」处理。
    const live = node(id);
    if (live && live.setPointerCapture) { try { live.setPointerCapture(ev.pointerId); } catch { /* 忽略 */ } }
    ev.preventDefault();
  });

  function startMarquee(ev) {
    const rect = canvas.getBoundingClientRect();
    marquee = {
      x0: ev.clientX - rect.left, y0: ev.clientY - rect.top,
      x1: ev.clientX - rect.left, y1: ev.clientY - rect.top,
      rect, additive: ev.shiftKey, moved: false,
    };
    const old = canvas.querySelector('.femarquee');
    if (old) old.remove();
    canvas.appendChild(marqueeNode());
    ev.preventDefault();
  }

  function endMarquee() {
    const m = marquee;
    marquee = null;
    if (!m) return;
    if (!m.moved) {
      if (!m.additive) { selIds = []; renderCanvas(); }
      return;
    }
    const x1 = Math.min(m.x0, m.x1), y1 = Math.min(m.y0, m.y1);
    const x2 = Math.max(m.x0, m.x1), y2 = Math.max(m.y0, m.y1);
    const hits = [];
    page.elements.forEach((e) => {
      const n = node(e.id);
      if (!n) return;
      const r = n.getBoundingClientRect();
      const a = { x: r.left - m.rect.left, y: r.top - m.rect.top, x2: r.right - m.rect.left, y2: r.bottom - m.rect.top };
      if (a.x < x2 && a.x2 > x1 && a.y < y2 && a.y2 > y1) hits.push(e.id);
    });
    const next = m.additive ? selIds.concat(hits.filter((id) => !isSel(id))) : hits;
    selIds = expand(next);
    renderCanvas();
  }

  const onPointerMove = (ev) => {
    if (marquee) {
      const rect = marquee.rect;
      marquee.x1 = ev.clientX - rect.left;
      marquee.y1 = ev.clientY - rect.top;
      if (Math.abs(marquee.x1 - marquee.x0) > 3 || Math.abs(marquee.y1 - marquee.y0) > 3) marquee.moved = true;
      const b = canvas.querySelector('.femarquee');
      if (b) { const nb = marqueeNode(); b.style.cssText = nb.style.cssText; }
      return;
    }
    if (!drag) return;
    const dx = (ev.clientX - drag.sx) / drag.k;
    const dy = (ev.clientY - drag.sy) / drag.k;
    if (!drag.committed) {
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      drag.committed = true;
      pushHistory(drag.pre);   // 只在实际发生移动时记一步
    }
    if (drag.mode === 'move') {
      const sdx = Math.round(dx / SNAP) * SNAP, sdy = Math.round(dy / SNAP) * SNAP;
      drag.els.forEach((s) => { const e = byId(s.id); if (e) { e.x = s.x + sdx; e.y = s.y + sdy; } });
    } else if (drag.mode === 'resize') {
      const e = drag.e;
      e.w = Math.max(8, Math.round((drag.w0 + dx) / SNAP) * SNAP);
      e.h = Math.max(4, Math.round((drag.h0 + dy) / SNAP) * SNAP);
    } else if (drag.mode === 'gresize') {
      const r = drag.r;
      const w = Math.max(20, Math.round((r.w + dx) / SNAP) * SNAP);
      const h = Math.max(20, Math.round((r.h + dy) / SNAP) * SNAP);
      const kx = w / r.w, ky = h / r.h;
      drag.els.forEach((s) => {
        const e = byId(s.id); if (!e) return;
        e.x = Math.round(r.x + (s.x - r.x) * kx);
        e.y = Math.round(r.y + (s.y - r.y) * ky);
        e.w = Math.max(4, Math.round(s.w * kx));
        e.h = Math.max(2, Math.round(s.h * ky));
      });
    }
    paint();
  };

  const onPointerUp = () => {
    if (marquee) { endMarquee(); return; }
    if (!drag) return;
    const d = drag;
    drag = null;
    // 在多选里单击某个已选元素、且没有拖动：收敛为只选中它（与常见设计工具一致）。
    // 不这样做的话，用户点一下组内成员永远无法把选择收窄到单个元素。
    if (d.mode === 'move' && !d.committed && d.click && d.click.wasMulti && !d.click.shift) {
      setSel([d.click.id], d.click.id);
      return;
    }
    renderCanvas();
    if (d.committed) touch();
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  // ---------------- 属性面板 ----------------
  function field(label, input) {
    const row = el('div', 'feFrow');
    row.appendChild(el('label', null, label));
    row.appendChild(input);
    return row;
  }
  function inputFor(type, value, onInput, attrs, key) {
    const i = el(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') i.type = type;
    i.value = value == null ? '' : value;
    Object.entries(attrs || {}).forEach(([k, v]) => i.setAttribute(k, v));
    i.addEventListener('focus', () => beginChange(key));
    i.addEventListener('pointerdown', () => beginChange(key));
    i.addEventListener('input', () => onInput(i.value, i));
    i.addEventListener('blur', () => settleChange());
    return i;
  }
  function selectFor(value, options, onInput, key) {
    const s = el('select');
    options.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; s.appendChild(o); });
    s.value = value;
    s.addEventListener('focus', () => beginChange(key));
    s.addEventListener('pointerdown', () => beginChange(key));
    s.addEventListener('change', () => { onInput(s.value); settleChange(); });
    return s;
  }

  function opBtn(label, fn, disabled) {
    const b = el('button', 'febtn', label);
    b.type = 'button';
    if (disabled) b.disabled = true;
    b.addEventListener('click', fn);
    return b;
  }

  function renderMultiProps(list) {
    const groups = {};
    list.forEach((e) => { if (grouped(e)) groups[e.group] = 1; });
    const gN = Object.keys(groups).length;
    props.appendChild(el('div', 'fehead', '<b>已选 ' + list.length + ' 个元素</b>' + (gN ? ' · ' + gN + ' 组' : '')));
    const r1 = el('div', 'fetools');
    r1.append(
      opBtn('成组', groupSel, list.length < 2),
      opBtn('解组', ungroupSel, !gN),
      opBtn('复制', () => copySel()),
      opBtn('再制', duplicateSel),
      opBtn('删除', () => delSel()),
      opBtn('置顶', () => layerOp('top')),
      opBtn('置底', () => layerOp('bottom')),
    );
    const r2 = el('div', 'fetools');
    [['左对齐', 'left'], ['水平居中', 'hcenter'], ['右对齐', 'right'], ['顶对齐', 'top'], ['垂直居中', 'vcenter'], ['底对齐', 'bottom']]
      .forEach(([t, m]) => r2.appendChild(opBtn(t, () => alignSel(m))));
    r2.appendChild(opBtn('水平等距', () => distributeSel('h'), list.length < 3));
    r2.appendChild(opBtn('垂直等距', () => distributeSel('v'), list.length < 3));
    props.append(r1, r2);
    props.appendChild(el('div', 'fehint', '拖动任一选中元素可整体移动；拖动蓝色外框右下角方块可整体缩放。成组后点击任一成员即整组选中。'));
  }

  function renderProps() {
    props.innerHTML = '';
    const list = selElements();
    if (!list.length) {
      props.appendChild(el('div', 'fehint', '在画布上点选元素即可编辑；拖动空白处框选多个，按住 Shift 点选可加选。'));
      props.appendChild(el('div', 'fehint', '快捷键：Ctrl+Z 撤销 · Ctrl+Shift+Z 重做 · Ctrl+C/V 复制粘贴 · Ctrl+D 再制 · Ctrl+A 全选 · Ctrl+G 成组 · Delete 删除 · 方向键微调（Shift 步进 10）'));
      props.appendChild(field('画布底色', inputFor('color', page.canvas.bg || '#ffffff', (v) => { page.canvas.bg = v; canvas.style.background = v; touch(); }, {}, 'canvas-bg')));
      return;
    }
    if (list.length > 1) { renderMultiProps(list); return; }

    const e = list[0];
    const head = el('div', 'fehead', '<b>' + KIND_LABEL[e.kind] + '</b> <code>' + esc(e.id) + '</code>');
    props.appendChild(head);
    if (grouped(e)) {
      const n = page.elements.filter((x) => x.group === e.group).length;
      const row = el('div', 'fehint');
      row.innerHTML = '已编组（同组 ' + n + ' 个元素，点击任一成员整组选中）';
      row.appendChild(opBtn('解组', ungroupSel));
      props.appendChild(row);
    }
    // 关键修复：属性改动只重绘该元素，不重建属性面板 —— 否则每敲一个字输入框就丢焦点
    const apply = (fn) => { fn(); repaintEl(e); touch(); };
    // 离散操作（选图/选视频/增删字段/切动效）会改变面板自身结构，必须整块重建；
    // 打字类编辑只能用 apply（只重绘元素），否则每敲一个字都会丢焦点。
    const applyFull = (fn) => { fn(); renderCanvas(); touch(); };

    if (e.kind === 'text' || e.kind === 'button') {
      props.appendChild(field('文字', inputFor('textarea', e.props.text, (v) => apply(() => { e.props.text = v; }), {}, e.id + ':text')));
    }
    if (e.kind === 'image') {
      const btn = el('button', 'febtn', e.props.image ? '更换图片' : '选择图片');
      btn.type = 'button';
      btn.addEventListener('click', () => opts.onPickMedia && opts.onPickMedia((name) => applyFull(() => { e.props.image = Array.isArray(name) ? (name[0] || '') : name; })));
      props.appendChild(field('图片', btn));
      if (e.props.image) props.appendChild(el('div', 'fehint', '当前：<code>' + esc(e.props.image) + '</code>'));
      props.appendChild(field('填充方式', selectFor(e.props.fit || 'cover', [['cover', '裁切铺满'], ['contain', '完整显示'], ['fill', '拉伸']], (v) => apply(() => { e.props.fit = v; }), e.id + ':fit')));
    }
    if (e.kind === 'html') {
      props.appendChild(field('HTML', inputFor('textarea', e.props.html, (v) => apply(() => { e.props.html = v; }), { rows: '6' }, e.id + ':html')));
    }
    if (e.kind === 'button') {
      props.appendChild(field('链接（https:// / tel: / mailto: / 站内路径）', inputFor('text', e.props.href, (v) => apply(() => { e.props.href = v; }), {}, e.id + ':href')));
    }
    if (e.kind !== 'image' && e.kind !== 'divider' && e.kind !== 'html' && SPECIAL_KINDS.indexOf(e.kind) < 0) {
      props.appendChild(field('字号（设计值 px）', inputFor('number', e.props.fontSize, (v) => apply(() => { e.props.fontSize = Number(v) || 20; }), {}, e.id + ':fontSize')));
    }
    if (e.kind !== 'image' && e.kind !== 'html' && SPECIAL_KINDS.indexOf(e.kind) < 0) {
      props.appendChild(field(e.kind === 'divider' ? '颜色' : '文字颜色', inputFor('color', e.props.color || (e.kind === 'divider' ? '#dde5ef' : '#15243a'), (v) => apply(() => { e.props.color = v; }), {}, e.id + ':color')));
    }
    if (e.kind !== 'image' && e.kind !== 'divider' && e.kind !== 'html' && e.kind !== 'text' && SPECIAL_KINDS.indexOf(e.kind) < 0) {
      props.appendChild(field('背景色', inputFor('color', e.props.bg || '#0a4ea3', (v) => apply(() => { e.props.bg = v; }), {}, e.id + ':bg')));
    }
    if (e.kind === 'rect' || e.kind === 'ellipse' || e.kind === 'image' || e.kind === 'button') {
      props.appendChild(field('圆角（设计值 px）', inputFor('number', e.props.radius || 0, (v) => apply(() => { e.props.radius = Number(v) || 0; }), {}, e.id + ':radius')));
    }
    if (e.kind === 'text') {
      props.appendChild(field('对齐', selectFor(e.props.align || 'left', [['left', '左'], ['center', '中'], ['right', '右']], (v) => apply(() => { e.props.align = v; }), e.id + ':align')));
      props.appendChild(field('行高', inputFor('number', e.props.lineHeight || 1.5, (v) => apply(() => { e.props.lineHeight = Number(v) || 1.5; }), { step: '0.1', min: '1', max: '3' }, e.id + ':lineHeight')));
      props.appendChild(field('字重', selectFor(String(e.props.weight || 400), [['400', '常规'], ['600', '半粗'], ['700', '粗'], ['800', '特粗']], (v) => apply(() => { e.props.weight = Number(v); }), e.id + ':weight')));
    }
    // ---- 新组件专用面板 ----
    // 说明：这些输入框只改模型 + 通知外层预览，不重建属性面板（否则打字就丢焦点）；
    //       失焦时才重绘画布上的该元素，让改动立刻可见。
    let softEditTimer = null;
    const softEdit = (fn, inp) => {
      fn();
      touch();
      // 画布重绘（只换该元素节点，不重建属性面板 → 不丢焦点）。
      // 防抖 150ms：二维码这类元素每敲一个字都会换图片地址，不必每个键都请求一次。
      if (softEditTimer) clearTimeout(softEditTimer);
      softEditTimer = setTimeout(() => repaintEl(e), 150);
      if (inp) inp.addEventListener('blur', () => {
        if (softEditTimer) clearTimeout(softEditTimer);
        repaintEl(e);
      });
    };

    if (e.kind === 'icon') {
      props.appendChild(field('图标', selectFor(e.props.icon || 'check', ICON_CHOICES, (v) => apply(() => { e.props.icon = v; }), e.id + ':icon')));
      props.appendChild(field('图标颜色', inputFor('color', e.props.color || '#0a4ea3', (v) => softEdit(() => { e.props.color = v; }, null), {}, e.id + ':color')));
      const bgInp = inputFor('color', e.props.bg || '#ffffff', (v) => softEdit(() => { e.props.bg = v; }, bgInp), {}, e.id + ':bg');
      props.appendChild(field('底色（白色＝实心底）', bgInp));
      props.appendChild(field('圆角', inputFor('number', e.props.radius || 0, (v) => softEdit(() => { e.props.radius = Number(v) || 0; }, null), {}, e.id + ':radius')));
    }

    if (e.kind === 'qrcode') {
      const qrInp = inputFor('textarea', e.props.qrText, (v) => softEdit(() => { e.props.qrText = v; }, qrInp), { rows: '3', placeholder: '网址 / 文本 / tel: / mailto:' }, e.id + ':qrText');
      props.appendChild(field('二维码内容', qrInp));
      props.appendChild(field('容错等级（越高越抗污损，容量越小）', selectFor(e.props.qrEc || 'M', [['L', 'L 低'], ['M', 'M 中'], ['Q', 'Q 较高'], ['H', 'H 高']], (v) => apply(() => { e.props.qrEc = v; }), e.id + ':qrEc')));
      props.appendChild(field('前景色', inputFor('color', e.props.qrFg || '#15243a', (v) => softEdit(() => { e.props.qrFg = v; }, null), {}, e.id + ':qrFg')));
      props.appendChild(field('背景色', inputFor('color', e.props.qrBg || '#ffffff', (v) => softEdit(() => { e.props.qrBg = v; }, null), {}, e.id + ':qrBg')));
      props.appendChild(el('div', 'fehint', '内容建议不超过 300 字符；二维码在本地生成，不请求任何第三方接口。'));
    }

    if (e.kind === 'video') {
      const vbtn = el('button', 'febtn', e.props.video ? '更换视频' : '选择视频');
      vbtn.type = 'button';
      vbtn.addEventListener('click', () => opts.onPickMedia && opts.onPickMedia((name) => applyFull(() => { e.props.video = Array.isArray(name) ? (name[0] || '') : name; }), { kind: 'video' }));
      props.appendChild(field('视频文件', vbtn));
      if (e.props.video) props.appendChild(el('div', 'fehint', '当前：<code>' + esc(e.props.video) + '</code>'));
      const pbtn = el('button', 'febtn', e.props.poster ? '更换封面图' : '选择封面图（可选）');
      pbtn.type = 'button';
      pbtn.addEventListener('click', () => opts.onPickMedia && opts.onPickMedia((name) => applyFull(() => { e.props.poster = Array.isArray(name) ? (name[0] || '') : name; }), { kind: 'image' }));
      props.appendChild(field('封面图', pbtn));
      [['controls', '显示播放控件'], ['autoplay', '自动播放（浏览器一般要求同时静音）'], ['muted', '静音'], ['loop', '循环播放']]
        .forEach(([k, label]) => {
          const cb = el('input');
          cb.type = 'checkbox';
          cb.checked = k === 'controls' ? e.props[k] !== false : e.props[k] === true;
          cb.addEventListener('change', () => apply(() => { e.props[k] = cb.checked; }));
          const lab = el('label', null, label);
          lab.style.fontWeight = '400';
          lab.insertBefore(cb, lab.firstChild);
          const row = el('div', 'feFrow');
          row.appendChild(lab);
          props.appendChild(row);
        });
      props.appendChild(field('圆角', inputFor('number', e.props.radius || 0, (v) => softEdit(() => { e.props.radius = Number(v) || 0; }, null), {}, e.id + ':radius')));
      props.appendChild(el('div', 'fehint', '只支持站内图库的视频（mp4 / webm，单个 ≤ 8MB）。公网页 CSP 不允许第三方播放器，外链视频播不出来。'));
    }

    if (e.kind === 'gallery') {
      const gbtn = el('button', 'febtn', (e.props.images || []).length ? '重新选择图片' : '选择图片（可多选）');
      gbtn.type = 'button';
      gbtn.addEventListener('click', () => opts.onPickMedia && opts.onPickMedia((names) => applyFull(() => {
        e.props.images = (Array.isArray(names) ? names : [names]).filter(Boolean).slice(0, 12);
      }), { kind: 'image', multi: true }));
      props.appendChild(field('图片', gbtn));
      const n = (e.props.images || []).length;
      if (n) {
        props.appendChild(el('div', 'fehint', '已选 ' + n + ' 张：<code>' + esc((e.props.images || []).join(', ')) + '</code>'));
        const capInp = inputFor('textarea', (e.props.captions || []).join('\n'), (v) => softEdit(() => { e.props.captions = v.split('\n'); }, capInp), { rows: '3', placeholder: '每行一个说明，按图片顺序对应；留空则不显示' }, e.id + ':captions');
        props.appendChild(field('图片说明（每行一个）', capInp));
      }
      props.appendChild(field('每行张数', selectFor(String(e.props.cols || 2), [['1', '1 张'], ['2', '2 张'], ['3', '3 张'], ['4', '4 张']], (v) => apply(() => { e.props.cols = Number(v) || 2; }), e.id + ':cols')));
      props.appendChild(field('间距', inputFor('number', e.props.gap || 8, (v) => softEdit(() => { e.props.gap = Number(v) || 0; }, null), {}, e.id + ':gap')));
      props.appendChild(field('圆角', inputFor('number', e.props.radius || 0, (v) => softEdit(() => { e.props.radius = Number(v) || 0; }, null), {}, e.id + ':radius')));
    }

    if (e.kind === 'form') {
      const fbox = el('div', 'fefields');
      const list = () => (e.props.fields = e.props.fields || []);
      list().forEach((f, i) => {
        const row = el('div', 'fefieldrow');
        const lab = inputFor('text', f.label, (v) => softEdit(() => { list()[i].label = v; }, lab), { placeholder: '字段名' }, e.id + ':fl' + i);
        const typ = selectFor(f.type || 'text', FORM_TYPES, (v) => softEdit(() => { list()[i].type = v; }, null), e.id + ':ft' + i);
        const cb = el('input');
        cb.type = 'checkbox';
        cb.checked = f.required === true;
        cb.title = '必填';
        cb.addEventListener('change', () => softEdit(() => { list()[i].required = cb.checked; }, null));
        const del = el('button', 'febtn ghost', '✕');
        del.type = 'button';
        del.title = '删除该字段';
        del.addEventListener('click', () => applyFull(() => { list().splice(i, 1); }));
        row.append(lab, typ, cb, del);
        fbox.appendChild(row);
      });
      if (!list().length) fbox.appendChild(el('div', 'fehint', '还没有字段，点下面「添加字段」。'));
      props.appendChild(field('表单字段（勾选＝必填）', fbox));
      const add = el('button', 'febtn', '＋ 添加字段');
      add.type = 'button';
      add.addEventListener('click', () => applyFull(() => { list().push({ label: '新字段', type: 'text', required: false, options: [] }); }));
      props.appendChild(add);
      const subInp = inputFor('text', e.props.submitText || '提交', (v) => softEdit(() => { e.props.submitText = v; }, null), {}, e.id + ':submitText');
      props.appendChild(field('按钮文字', subInp));
      const okInp = inputFor('text', e.props.successText || '', (v) => softEdit(() => { e.props.successText = v; }, null), {}, e.id + ':successText');
      props.appendChild(field('提交成功提示', okInp));
      const noteInp = inputFor('text', e.props.note || '', (v) => softEdit(() => { e.props.note = v; }, null), {}, e.id + ':note');
      props.appendChild(field('按钮下方小字', noteInp));
      props.appendChild(el('div', 'fehint', '提交会落到本站（同源），在工具栏「表单提交」里查看；必填校验前后端各做一遍。'));
    }

    if (e.kind === 'countdown') {
      const untilInp = inputFor('datetime-local', String(e.props.until || '').slice(0, 16), (v) => softEdit(() => { e.props.until = v; }, untilInp), {}, e.id + ':until');
      props.appendChild(field('截止时间（本地时间）', untilInp));
      const labInp = inputFor('text', e.props.label || '', (v) => softEdit(() => { e.props.label = v; }, labInp), {}, e.id + ':label');
      props.appendChild(field('上方小字', labInp));
      const doneInp = inputFor('text', e.props.doneText || '', (v) => softEdit(() => { e.props.doneText = v; }, doneInp), {}, e.id + ':doneText');
      props.appendChild(field('结束后显示', doneInp));
      props.appendChild(field('颜色', inputFor('color', e.props.color || '#0a4ea3', (v) => softEdit(() => { e.props.color = v; }, null), {}, e.id + ':color')));
      props.appendChild(el('div', 'fehint', '公网页会每秒走时；后台画布里显示的是静态值（编辑时不跳动，避免干扰）。'));
    }

    // ---- 入场动效（所有组件通用）----
    props.appendChild(field('入场动效', selectFor(e.props.anim || 'none', [['none', '无'], ['fade', '淡入'], ['up', '上浮'], ['down', '下沉'], ['left', '左滑'], ['right', '右滑'], ['zoom', '缩放']], (v) => applyFull(() => {
      if (v === 'none') { delete e.props.anim; delete e.props.animDelay; } else { e.props.anim = v; }
    }), e.id + ':anim')));
    if (e.props.anim && e.props.anim !== 'none') {
      props.appendChild(field('延迟（毫秒）', inputFor('number', e.props.animDelay || 0, (v) => softEdit(() => { e.props.animDelay = Math.max(0, Math.min(3000, Number(v) || 0)); }, null), { step: '100', min: '0', max: '3000' }, e.id + ':animDelay')));
    }

    const geo = el('div', 'fegeo');
    [['x', e.x, CW], ['y', e.y, CH], ['w', e.w, CW], ['h', e.h, CH]].forEach(([k, v]) => {
      geo.appendChild(field(k.toUpperCase(), inputFor('number', v, (val) => apply(() => { e[k] = Math.round(Number(val) || 0); }), {}, e.id + ':' + k)));
    });
    props.appendChild(geo);
    props.appendChild(field('图层 z', inputFor('number', e.z || 1, (val) => { e.z = Math.max(0, Math.round(Number(val) || 1)); repaintEl(e); reorderLayers(); touch(); }, {}, e.id + ':z')));
    props.appendChild(field('画布底色', inputFor('color', page.canvas.bg || '#ffffff', (v) => { page.canvas.bg = v; canvas.style.background = v; touch(); }, {}, 'canvas-bg')));
  }

  // ---------------- 快捷键 ----------------
  function onKey(ev) {
    const t = ev.target;
    const typing = Boolean(t) && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    const mod = ev.ctrlKey || ev.metaKey;
    const key = (ev.key || '').toLowerCase();
    if (ev.key === 'Escape') {
      if (selIds.length) { ev.preventDefault(); ev.stopPropagation(); selIds = []; renderCanvas(); }
      return;
    }
    if (typing) return;
    if (mod && key === 'z') { ev.preventDefault(); if (ev.shiftKey) redo(); else undo(); return; }
    if (mod && key === 'y') { ev.preventDefault(); redo(); return; }
    if (mod && key === 'c') { ev.preventDefault(); copySel(); return; }
    if (mod && key === 'x') { ev.preventDefault(); cutSel(); return; }
    if (mod && key === 'v') { ev.preventDefault(); paste(); return; }
    if (mod && key === 'd') { ev.preventDefault(); duplicateSel(); return; }
    if (mod && key === 'a') { ev.preventDefault(); setSel(page.elements.map((e) => e.id), null); return; }
    if (mod && key === 'g') { ev.preventDefault(); if (ev.shiftKey) ungroupSel(); else groupSel(); return; }
    if (ev.key === 'Delete' || ev.key === 'Backspace') { if (selIds.length) { ev.preventDefault(); delSel(); } return; }
    if (ARROWS[ev.key] && selIds.length) {
      ev.preventDefault();
      const step = ev.shiftKey ? 10 : 1;
      nudge(ARROWS[ev.key][0] * step, ARROWS[ev.key][1] * step);
    }
  }

  const onResize = () => renderCanvas();
  window.addEventListener('resize', onResize);
  document.addEventListener('keydown', onKey, true);

  renderCanvas();
  syncUndoButtons();

  return {
    getPage: () => clone(page),
    getSelection: () => selIds.slice(),
    addElement,
    select,
    undo,
    redo,
    group: groupSel,
    ungroup: ungroupSel,
    destroy: () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('keydown', onKey, true);
      host.innerHTML = '';
    },
  };
}
