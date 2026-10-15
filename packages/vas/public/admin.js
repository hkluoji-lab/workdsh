/* =========================================================================
   增值业务产品页管理后台 —— 独立模块
   登录复用门户会话 Cookie；所有写操作带同源 + CSRF 校验。
   ========================================================================= */
(function () {
'use strict';
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
var CSRF = (function () {
  var m = document.querySelector('meta[name="csrf"]');
  return m ? m.content : '';
})();
var USER = (function () {
  var m = document.querySelector('meta[name="user"]');
  return m ? m.content : '';
})();

var state = { id: '2026Q3-zengzhi', data: null, dirty: false, products: [] };

function toast(msg, err) {
  var el = $('#toast');
  el.textContent = msg;
  el.className = 'toast' + (err ? ' toast--err' : '');
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { el.hidden = true; }, 3800);
}

function api(path, opts) {
  opts = opts || {};
  var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (opts.csrf !== false) headers['X-CSRF-Token'] = CSRF;
  return fetch(path, {
    method: opts.method || 'GET',
    credentials: 'same-origin',
    headers: headers,
    body: opts.body
  }).then(function (res) {
    return res.json().catch(function () { return null; }).then(function (j) {
      if (res.status === 401) { window.location.href = '/login?next=' + encodeURIComponent(location.pathname); throw new Error('未登录'); }
      if (!res.ok) {
        var e = new Error((j && (j.message || (j.errors && j.errors.join('；')))) || ('HTTP ' + res.status));
        e.payload = j; e.status = res.status; throw e;
      }
      return j;
    });
  });
}

function showIssues(res) {
  var box = $('#issues');
  var errs = (res && res.errors) || [], warns = (res && res.warnings) || [];
  if (!errs.length && !warns.length) {
    box.className = 'issues issues--ok';
    box.innerHTML = '校验通过：数据结构与引用关系均有效。' + (res && res.bytes ? '（渲染产物 ' + res.bytes + ' 字节）' : '');
    box.hidden = false; return;
  }
  // 无错误但有提示时，既要说清「校验已通过」，也要把提示列出来，
  // 否则使用者会误以为校验失败（例如彩铃月租为原文填空项的提示）。
  box.className = 'issues' + (errs.length ? ' issues--err' : (warns.length ? ' issues--warn' : ' issues--ok'));
  box.innerHTML =
    (errs.length
      ? '<b>发现 ' + errs.length + ' 个问题，未保存：</b><ul>' + errs.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>'
      : '<b>校验通过</b>数据结构与引用关系均有效。') +
    (warns.length
      ? '<b style="margin-top:' + (errs.length ? '8px' : '6px') + '">另有 ' + warns.length + ' 条提示（不影响发布）：</b><ul>' + warns.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>'
      : '');
  box.hidden = false;
}
function clearIssues() { $('#issues').hidden = true; }

function markDirty() {
  state.dirty = true;
  $('#dirtyHint').textContent = '有未保存的修改';
  $('#dirtyHint').className = 'ahint ahint--warn';
}
function clearDirty() {
  state.dirty = false;
  $('#dirtyHint').textContent = '已与服务端一致';
  $('#dirtyHint').className = 'ahint';
}

/* ------------------------------------------------------------ 产品编辑 */

var BENEFIT_ICON = {};

function renderProducts() {
  var d = state.data;
  BENEFIT_ICON = {}; d.benefits.forEach(function (b) { BENEFIT_ICON[b.id] = b.icon || '●'; });
  // 分类下拉需按产品标记选中项，因此在产品循环内构建（循环外构建无法引用 p）。
  var bens = d.benefits.map(function (b) {
    return '<label class="ckb"><input type="checkbox" data-ben="' + esc(b.id) + '"> <span>' + esc(b.name) + '</span></label>';
  }).join('');

  $('#productList').innerHTML = d.products.map(function (p, i) {
    var fields = Object.keys(p.fields || {});
    var cats = d.categories.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (c.id === p.category ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');
    return '<details class="item" data-pi="' + i + '">' +
      '<summary><b>' + esc(p.name) + '</b> <span class="ahint">' + esc(p.category) + ' · ' + p.tiers.length + ' 档资费</span></summary>' +
      '<div class="ag">' +
        '<label><span>产品名称 *</span><input data-f="name" value="' + esc(p.name) + '"></label>' +
        '<label><span>简称</span><input data-f="shortName" value="' + esc(p.shortName || '') + '"></label>' +
        '<label><span>分类</span><select data-f="category">' + cats + '</select></label>' +
        '<label><span>一句话定位</span><input data-f="tagline" value="' + esc(p.tagline) + '"></label>' +
        '<label class="ag__full"><span>产品特征</span><textarea data-f="feature" rows="2">' + esc(p.feature) + '</textarea></label>' +
        '<label class="ag__full"><span>对企业的帮助（价值叙述）</span><textarea data-f="benefitNarrative" rows="2">' + esc(p.benefitNarrative || '') + '</textarea></label>' +
        '<label class="ag__full"><span>应用场景（每行一条）</span><textarea data-f="scenarios" rows="3">' + esc((p.scenarios || []).join('\n')) + '</textarea></label>' +
        '<label><span>计费方式说明</span><input data-f="pricingModel" value="' + esc(p.pricingModel || '') + '"></label>' +
        '<label class="ag__full"><span>资费备注（会显示在详情里）</span><textarea data-f="priceNote" rows="2">' + esc(p.priceNote || '') + '</textarea></label>' +
        '<label class="ag__full"><span>续约/计费说明</span><textarea data-f="renewal" rows="2">' + esc(p.renewal || '') + '</textarea></label>' +
        '<label class="ag__full"><span>可选项（每行一条）</span><textarea data-f="options" rows="2">' + esc((p.options || []).join('\n')) + '</textarea></label>' +
        '<label class="ag__full"><span>受理与登记要求（每行一条，格式 字段名 : 内容）</span><textarea data-f="fields" rows="3">' +
          esc(fields.map(function (k) { return k + ' : ' + p.fields[k]; }).join('\n')) + '</textarea></label>' +
        '<label class="ag__full"><span>受理登记表原文依据（每行一条）</span><textarea data-f="quotes" rows="3">' + esc((p.quotes || []).join('\n')) + '</textarea></label>' +
      '</div>' +
      '<fieldset class="fs"><legend>企业价值维度</legend><div class="ckbs">' + bens +
        '</div></fieldset>' +
      '<fieldset class="fs"><legend>资费档位</legend>' +
        '<div class="rows"><div class="row row--h"><span>档位名称</span><span>价格</span><span>单位</span><span>计费方式</span><span>包含内容</span><span>原文依据</span><span></span></div>' +
        '<div class="rows" data-tiers>' + p.tiers.map(tierRow).join('') + '</div></div>' +
        '<div class="acard__act"><button class="ab ab--sm" type="button" data-addtier>添加档位</button>' +
        '<button class="ab ab--d ab--sm" type="button" data-delproduct>删除该产品</button></div>' +
      '</fieldset></details>';
  }).join('');

  // 回填勾选状态
  $$('#productList .item').forEach(function (el, i) {
    var p = d.products[i];
    (p.benefits || []).forEach(function (b) {
      var cb = el.querySelector('[data-ben="' + b + '"]');
      if (cb) cb.checked = true;
    });
  });
}

function tierRow(t) {
  t = t || {};
  return '<div class="row" data-tid="' + esc(t.id || '') + '">' +
    '<input data-t="name" value="' + esc(t.name || '') + '" placeholder="档位名称">' +
    '<input data-t="price" type="number" min="1" step="1" value="' + (t.price == null ? '' : t.price) + '" placeholder="价格">' +
    '<input data-t="unit" value="' + esc(t.unit || '') + '" placeholder="元/线/月">' +
    '<select data-t="type"><option value="monthly"' + (t.type !== 'onetime' ? ' selected' : '') + '>包月</option>' +
      '<option value="onetime"' + (t.type === 'onetime' ? ' selected' : '') + '>一次性</option></select>' +
    '<input data-t="includes" value="' + esc(t.includes || '') + '" placeholder="包含内容">' +
    '<input data-t="quote" value="' + esc(t.quote || '') + '" placeholder="原文依据">' +
    '<button class="ab ab--q ab--sm" type="button" data-delrow>删除</button>' +
    '</div>';
}

/** 从 DOM 收集产品数据（保留未在表单中编辑的字段） */
function collectProducts() {
  return $$('#productList .item').map(function (el, i) {
    var old = state.data.products[i] || {};
    var v = function (f) { var e = el.querySelector('[data-f="' + f + '"]'); return e ? e.value : ''; };
    var lines = function (f) { return v(f).split('\n').map(function (s) { return s.trim(); }).filter(Boolean); };
    var fields = {};
    v('fields').split('\n').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (line) {
      var idx = line.indexOf(':') >= 0 ? line.indexOf(':') : line.indexOf('：');
      if (idx > 0) fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      else fields[line] = '';
    });
    var tiers = $$('[data-tiers] .row', el).map(function (r) {
      var g = function (k) { var e = r.querySelector('[data-t="' + k + '"]'); return e ? e.value : ''; };
      var price = Number(g('price'));
      return {
        // 已有档位沿用 data-tid 里保留的原 id，保证场景引用与订单历史不被破坏
        id: r.getAttribute('data-tid') || undefined,
        name: g('name').trim(),
        price: isFinite(price) ? price : 0,
        unit: g('unit').trim(),
        type: g('type'),
        includes: g('includes').trim(),
        quote: g('quote').trim()
      };
    }).filter(function (t) { return t.name || t.price; });

    var benefits = $$('[data-ben]', el).filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute('data-ben'); });
    var product = {
      id: old.id,
      name: v('name').trim(),
      shortName: v('shortName').trim(),
      category: v('category'),
      tagline: v('tagline').trim(),
      feature: v('feature').trim(),
      benefitNarrative: v('benefitNarrative').trim(),
      scenarios: lines('scenarios'),
      benefits: benefits,
      pricingModel: v('pricingModel').trim(),
      priceNote: v('priceNote').trim(),
      renewal: v('renewal').trim(),
      options: lines('options'),
      fields: fields,
      quotes: lines('quotes'),
      tiers: tiers
    };
    // 仅为「新增且尚无 id」的档位生成稳定 id；已有 id 一律保留
    product.tiers.forEach(function (t, j) {
      if (!t.id) t.id = (product.id || 'vas') + '-t' + (j + 1) + '-' + Math.random().toString(36).slice(2, 6);
    });
    return product;
  });
}

/* ------------------------------------------------------------ 场景/价值/FAQ */

function renderScenes() {
  var prods = state.data.products;
  $('#sceneList').innerHTML = state.data.scenes.map(function (s, i) {
    return '<details class="item" data-si="' + i + '"><summary><b>' + esc(s.title) + '</b> <span class="ahint">' + esc(s.key) + '</span></summary>' +
      '<div class="ag">' +
        '<label><span>场景编号 key</span><input data-s="key" value="' + esc(s.key) + '"></label>' +
        '<label><span>图标 emoji</span><input data-s="icon" value="' + esc(s.icon || '') + '"></label>' +
        '<label><span>场景标题</span><input data-s="title" value="' + esc(s.title) + '"></label>' +
        '<label class="ag__full"><span>典型客户</span><input data-s="who" value="' + esc(s.who) + '"></label>' +
        '<label class="ag__full"><span>核心诉求</span><input data-s="need" value="' + esc(s.need) + '"></label>' +
        '<label class="ag__full"><span>要点（每行一条）</span><textarea data-s="points" rows="3">' + esc((s.points || []).join('\n')) + '</textarea></label>' +
        '<label class="ag__full"><span>关联产品（按住 Ctrl / Cmd 多选；第一个即主推）</span><select data-s="products" multiple size="5" class="multi">' +
          prods.map(function (p) {
            return '<option value="' + esc(p.id) + '"' + ((s.products || []).indexOf(p.id) >= 0 ? ' selected' : '') + '>' + esc(p.name) + '</option>';
          }).join('') + '</select></label>' +
        '<label class="ag__full"><span>场景说明 foot</span><textarea data-s="foot" rows="2">' + esc(s.foot || '') + '</textarea></label>' +
        '<label class="ag__full"><span>相邻场景提示 next（两行：key、提示语）</span><textarea data-s="next" rows="2">' + esc((s.next || []).join('\n')) + '</textarea></label>' +
        '<div class="ag__full"><button class="ab ab--d ab--sm" type="button" data-delscene>删除该场景</button></div>' +
      '</div></details>';
  }).join('');
}

function collectScenes() {
  return $$('#sceneList .item').map(function (el) {
    var v = function (k) { var e = el.querySelector('[data-s="' + k + '"]'); return e ? e.value : ''; };
    var lines = function (k) { return v(k).split('\n').map(function (x) { return x.trim(); }).filter(Boolean); };
    var sel = el.querySelector('[data-s="products"]');
    var prods = sel ? Array.prototype.slice.call(sel.selectedOptions).map(function (o) { return o.value; }) : [];
    return {
      key: v('key').trim(), icon: v('icon').trim(), title: v('title').trim(),
      who: v('who').trim(), need: v('need').trim(),
      points: lines('points'), products: prods, main: prods[0] || '',
      foot: v('foot').trim(), next: lines('next')
    };
  });
}

function renderBenefits() {
  $('#benefitList').innerHTML = state.data.benefits.map(function (b, i) {
    return '<details class="item" data-bi="' + i + '"><summary><b>' + esc(b.name) + '</b> <span class="ahint">' + esc(b.id) + '</span></summary>' +
      '<div class="ag">' +
        '<label><span>维度 id（英文）</span><input data-b="id" value="' + esc(b.id) + '"></label>' +
        '<label><span>名称</span><input data-b="name" value="' + esc(b.name) + '"></label>' +
        '<label><span>图标 emoji</span><input data-b="icon" value="' + esc(b.icon || '') + '"></label>' +
        '<label class="ag__full"><span>说明</span><textarea data-b="desc" rows="2">' + esc(b.desc) + '</textarea></label>' +
        '<div class="ag__full"><button class="ab ab--d ab--sm" type="button" data-delben>删除该维度</button></div>' +
      '</div></details>';
  }).join('');
}
function collectBenefits() {
  return $$('#benefitList .item').map(function (el) {
    var v = function (k) { var e = el.querySelector('[data-b="' + k + '"]'); return e ? e.value : ''; };
    return { id: v('id').trim(), name: v('name').trim(), icon: v('icon').trim(), desc: v('desc').trim() };
  });
}

function renderFaq() {
  $('#faqList').innerHTML = state.data.faq.map(function (f, i) {
    return '<div class="item item--flat" data-fi="' + i + '">' +
      '<label class="ag__full"><span>问题</span><input data-q="q" value="' + esc(f.q) + '"></label>' +
      '<label class="ag__full"><span>回答</span><textarea data-q="a" rows="2">' + esc(f.a) + '</textarea></label>' +
      '<div><button class="ab ab--d ab--sm" type="button" data-delfaq>删除</button></div></div>';
  }).join('');
}
function collectFaq() {
  return $$('#faqList .item').map(function (el) {
    var v = function (k) { var e = el.querySelector('[data-q="' + k + '"]'); return e ? e.value : ''; };
    return { q: v('q').trim(), a: v('a').trim() };
  }).filter(function (f) { return f.q; });
}

function renderMeta() {
  var m = state.data.meta, c = state.data.catalog;
  $('#m-title').value = m.title || ''; $('#m-ogTitle').value = m.ogTitle || '';
  $('#m-description').value = m.description || ''; $('#m-ogDescription').value = m.ogDescription || '';
  $('#m-themeColor').value = m.themeColor || '#0a4ea3';
  $('#c-operator').value = c.operator || ''; $('#c-hotline').value = c.hotline || '';
  $('#c-channel').value = c.channel || ''; $('#c-sourceForm').value = c.sourceForm || '';
  $('#c-dataPolicy').value = c.dataPolicy || '';
  $('#p-name').value = state.data.name || '';
  $('#publishedUrl').textContent = '/portal/products/' + state.data.id + '.html';
  $('#viewPage').href = '/portal/products/' + state.data.id + '.html';
  renderPageList();
}

/** 多页站点：列出本次发布产生的全部页面地址，方便逐页核对 */
function renderPageList() {
  var box = $('#pageList');
  if (!box) return;
  var id = state.data.id;
  var pages = [{ f: id + '.html', t: '产品总览' }]
    .concat(state.data.products.map(function (p) {
      return { f: id + '-' + p.id.replace(/^vas-/, '') + '.html', t: p.name };
    }))
    .concat([
      { f: id + '-pricing.html', t: '资费总表' },
      { f: id + '-order.html', t: '需求登记' }
    ]);
  box.innerHTML = pages.map(function (p) {
    var url = '/portal/products/' + p.f;
    return '<li><a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(p.t) + '</a>' +
      ' <code>' + esc(url) + '</code></li>';
  }).join('');
}

function renderAll() {
  renderProducts(); renderScenes(); renderBenefits(); renderFaq(); renderMeta();
  $('#termsBox').value = (state.data.terms || []).join('\n');
  $('#jsonBox').value = JSON.stringify(state.data, null, 2);
  clearDirty();
}

/** 把表单内容写回 state.data */
function applyForms() {
  var d = state.data;
  d.products = collectProducts();
  d.scenes = collectScenes();
  d.benefits = collectBenefits();
  d.faq = collectFaq();
  d.terms = $('#termsBox').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  d.meta.title = $('#m-title').value; d.meta.ogTitle = $('#m-ogTitle').value;
  d.meta.description = $('#m-description').value; d.meta.ogDescription = $('#m-ogDescription').value;
  d.meta.themeColor = $('#m-themeColor').value;
  d.catalog.operator = $('#c-operator').value; d.catalog.hotline = $('#c-hotline').value;
  d.catalog.channel = $('#c-channel').value; d.catalog.sourceForm = $('#c-sourceForm').value;
  d.catalog.dataPolicy = $('#c-dataPolicy').value;
  d.name = $('#p-name').value;
  return d;
}

/* ------------------------------------------------------------ 动作 */

function doValidate() {
  var data = applyForms();
  return api('/api/portal/zengzhi/products/' + encodeURIComponent(state.id) + '/validate', {
    method: 'POST', body: JSON.stringify({ data: data })
  }).then(function (res) {
    showIssues({ errors: res.errors, warnings: res.warnings });
    return res;
  }).catch(function (e) {
    showIssues({ errors: [e.message] });
    throw e;
  });
}

function doSave(publish) {
  var data = applyForms();
  return api('/api/portal/zengzhi/products/' + encodeURIComponent(state.id) + '/' + (publish ? 'publish' : 'save'), {
    method: 'POST', body: JSON.stringify({ data: data })
  }).then(function (res) {
    showIssues({ warnings: res.warnings, bytes: res.bytes });
    clearDirty();
    $('#jsonBox').value = JSON.stringify(state.data, null, 2);
    toast(publish ? ('已保存并发布（' + res.bytes + ' 字节），线上页已更新') : '已保存（未发布，线上页未变）');
    if (publish) loadOrders();
    return res;
  }).catch(function (e) {
    if (e.payload && e.payload.errors) showIssues({ errors: e.payload.errors, warnings: e.payload.warnings });
    else showIssues({ errors: [e.message] });
    toast('保存失败：' + e.message, true);
  });
}

/* ------------------------------------------------------------ 需求单 */

function fmt(iso) {
  if (!iso) return '—';
  var d = new Date(iso), p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
var STATUS_LABEL = { new: '待跟进', contacted: '已联系', won: '已受理', lost: '已关闭' };

function loadOrders() {
  var st = $('#orderStatus').value;
  return api('/api/portal/zengzhi/orders' + (st ? '?status=' + st : '')).then(function (res) {
    $('#orderStats').textContent = '共 ' + res.total + ' 条；待跟进 ' + res.counts.new + ' / 已联系 ' + res.counts.contacted + ' / 已受理 ' + res.counts.won + ' / 已关闭 ' + res.counts.lost;
    var names = {};
    (state.data ? state.data.products : []).forEach(function (p) { names[p.id] = p.shortName || p.name; });
    $('#orderEmpty').hidden = res.orders.length > 0;
    $('#orderBody').innerHTML = res.orders.map(function (o) {
      return '<tr>' +
        '<td class="mono">' + esc(fmt(o.at)) + '</td>' +
        '<td><b>' + esc(o.org) + '</b><br><span class="ahint">' + esc(o.contact) + '</span></td>' +
        '<td class="mono">' + esc(o.tel) + (o.addr ? '<br><span class="ahint">' + esc(o.addr) + '</span>' : '') + '</td>' +
        '<td>' + esc((o.products || []).map(function (id) { return names[id] || id; }).join('、')) + '</td>' +
        '<td>' + esc(o.scale || '—') + '</td>' +
        '<td>' + esc(o.note || '—') + '</td>' +
        '<td><select data-oid="' + esc(o.id) + '">' +
          Object.keys(STATUS_LABEL).map(function (k) {
            return '<option value="' + k + '"' + (o.status === k ? ' selected' : '') + '>' + STATUS_LABEL[k] + '</option>';
          }).join('') + '</select></td></tr>';
    }).join('');
  }).catch(function (e) { toast('需求单加载失败：' + e.message, true); });
}

/* ------------------------------------------------------------ 事件 */

function bind() {
  $$('.ah__tab').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('.ah__tab').forEach(function (x) { x.classList.remove('on'); x.setAttribute('aria-selected', 'false'); });
      b.classList.add('on'); b.setAttribute('aria-selected', 'true');
      var t = b.getAttribute('data-tab');
      $$('.ap').forEach(function (p) { p.hidden = p.id !== 'p-' + t; p.classList.toggle('on', !p.hidden); });
      if (t === 'orders') loadOrders();
    });
  });

  $('#btnValidate').addEventListener('click', function () { doValidate().then(function () { toast('校验完成'); }).catch(function () {}); });
  $('#btnValidate2').addEventListener('click', function () { doValidate().then(function () { toast('校验完成'); }).catch(function () {}); });
  $('#btnSave').addEventListener('click', function () { doSave(false); });
  $('#btnPublish').addEventListener('click', function () { doSave(true); });
  $('#btnPublish2').addEventListener('click', function () { doSave(true); });

  $('#addProduct').addEventListener('click', function () {
    applyForms();
    state.data.products.push({
      id: 'vas-' + Math.random().toString(36).slice(2, 8), name: '新产品', shortName: '', category: state.data.categories[0].id,
      tagline: '', feature: '', benefitNarrative: '', scenarios: [], benefits: [], pricingModel: '', priceNote: '', renewal: '',
      options: [], fields: {}, quotes: [], tiers: [{ name: '基础档', price: 1, unit: '元/线/月', type: 'monthly', includes: '', quote: '' }]
    });
    renderProducts(); markDirty();
  });
  $('#addScene').addEventListener('click', function () {
    applyForms();
    state.data.scenes.push({ key: 'S' + (state.data.scenes.length + 1), icon: '●', title: '新场景', who: '', need: '', points: [], products: [], main: '', foot: '', next: [] });
    renderScenes(); markDirty();
  });
  $('#addBenefit').addEventListener('click', function () {
    applyForms();
    state.data.benefits.push({ id: 'b' + Math.random().toString(36).slice(2, 6), name: '新维度', icon: '●', desc: '' });
    renderBenefits(); markDirty();
  });
  $('#addFaq').addEventListener('click', function () {
    applyForms();
    state.data.faq.push({ q: '新问题', a: '' });
    renderFaq(); markDirty();
  });

  $('#applyJson').addEventListener('click', function () {
    try {
      var parsed = JSON.parse($('#jsonBox').value);
      state.data = parsed;
      state.data.id = state.id;
      renderAll(); markDirty(); toast('已应用 JSON（尚未保存）');
    } catch (e) { toast('JSON 格式错误：' + e.message, true); }
  });
  $('#reloadJson').addEventListener('click', function () { $('#jsonBox').value = JSON.stringify(state.data, null, 2); });

  document.addEventListener('click', function (e) {
    var addT = e.target.closest('[data-addtier]');
    if (addT) {
      var el = addT.closest('.item');
      el.querySelector('[data-tiers]').insertAdjacentHTML('beforeend', tierRow({ type: 'monthly' }));
      markDirty(); return;
    }
    if (e.target.closest('[data-delrow]')) { e.target.closest('.row').remove(); markDirty(); return; }
    if (e.target.closest('[data-delproduct]')) {
      if (!confirm('确认删除该产品？其资费与场景引用会一并移除。')) return;
      var item = e.target.closest('.item');
      var idx = Number(item.getAttribute('data-pi'));
      applyForms(); state.data.products.splice(idx, 1);
      renderProducts(); markDirty(); return;
    }
    if (e.target.closest('[data-delscene]')) {
      var si = Number(e.target.closest('.item').getAttribute('data-si'));
      applyForms(); state.data.scenes.splice(si, 1); renderScenes(); markDirty(); return;
    }
    if (e.target.closest('[data-delben]')) {
      var bi = Number(e.target.closest('.item').getAttribute('data-bi'));
      applyForms(); state.data.benefits.splice(bi, 1); renderBenefits(); markDirty(); return;
    }
    if (e.target.closest('[data-delfaq]')) {
      var fi = Number(e.target.closest('.item').getAttribute('data-fi'));
      applyForms(); state.data.faq.splice(fi, 1); renderFaq(); markDirty(); return;
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target.closest('#p-editor')) markDirty();
  });

  $('#orderStatus').addEventListener('change', loadOrders);
  $('#reloadOrders').addEventListener('click', loadOrders);
  $('#orderBody').addEventListener('change', function (e) {
    var sel = e.target.closest('[data-oid]');
    if (!sel) return;
    api('/api/portal/zengzhi/orders/' + encodeURIComponent(sel.getAttribute('data-oid')) + '/status', {
      method: 'POST', body: JSON.stringify({ status: sel.value })
    }).then(function () { toast('状态已更新'); loadOrders(); })
      .catch(function (err) { toast('更新失败：' + err.message, true); });
  });

  window.addEventListener('beforeunload', function (e) {
    if (!state.dirty) return;
    e.preventDefault(); e.returnValue = '';
  });
}

/* ------------------------------------------------------------ 启动 */

function boot() {
  $('#userLabel').textContent = USER;
  api('/api/portal/zengzhi/products').then(function (res) {
    state.products = res.products;
    state.id = state.products[0] || state.id;
    $('#prodSelect').innerHTML = res.products.map(function (id) {
      return '<option value="' + esc(id) + '">' + esc(id) + '</option>';
    }).join('');
    return api('/api/portal/zengzhi/products/' + encodeURIComponent(state.id));
  }).then(function (res) {
    state.data = res.data;
    renderAll(); bind();
    toast('已加载 ' + state.id);
  }).catch(function (e) {
    if (e.message !== '未登录') toast('加载失败：' + e.message, true);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
