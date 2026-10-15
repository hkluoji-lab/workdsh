/* 产品页管理后台前端 */
(function () {
  'use strict';
  const CSRF = window.__CSRF__ || '';
  const ID = '2026Q3';
  let data = null;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function notice(kind, html) {
    const el = $('#notice');
    el.className = 'notice ' + kind;
    el.innerHTML = html;
    el.hidden = false;
    if (kind === 'ok') setTimeout(() => { el.hidden = true; }, 6000);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* API 基路径：线上经门户代理为 /api/portal/admin/*，本地直连为 /api/admin/*。
     由页面自身路径推导，避免把部署拓扑硬编码进前端。 */
  const API_BASE = (function () {
    // 页面在 /portal/admin 下（经门户代理）时，API 走同前缀的 /api/portal/admin
    if (location.pathname.indexOf('/portal/admin') === 0) return '/api/portal/admin/';
    return '/api/admin/';
  })();

  async function api(method, path, body) {
    const opt = { method, headers: { 'Accept': 'application/json' }, credentials: 'same-origin' };
    if (method !== 'GET') {
      opt.headers['Content-Type'] = 'application/json';
      opt.headers['X-CSRF-Token'] = CSRF;
      opt.body = JSON.stringify(body ?? {});
    }
    const res = await fetch(API_BASE + path, opt);
    let json = null;
    try { json = await res.json(); } catch (e) { /* 非 JSON */ }
    return { status: res.status, json };
  }

  /* ---------------- 表单构建 ---------------- */

  const TIER_FIELDS = [
    ['id', '档位 ID', '唯一标识，发布后不建议修改'],
    ['name', '档位名称', '如「299 机光」'],
    ['group', '所属分组', 'A/B/C/D，对应 groups'],
    ['speed', '宽带速率', '下行 / 上行'],
    ['ip', '公网 IP 标注', '如「公网 IP」「无公网 IP」，留空表示原表未标注'],
    ['ipState', '公网 IP 状态', 'yes / no / 留空'],
    ['gift', '主推 FTTR 礼包', '原表口径，※ 表示原表文字未显示完整'],
    ['huabu', 'FTTR 话补', ''],
    ['flow', '全国流量（G）', ''],
    ['voice', '全国通话（分钟）', ''],
    ['talk', '多固话加装', ''],
    ['gw', '加装 1 台从网关', ''],
    ['test', '调测费', ''],
    ['full2', '全额预存 2 年', '未标注填 —'],
    ['full3', '全额预存 3 年', ''],
    ['z2', '0 预存 2 年', ''],
    ['z3', '0 预存 3 年', ''],
    ['low', '低消包（商企版）', ''],
  ];

  function tierForm(t, idx) {
    const fields = TIER_FIELDS.map(([k, label, desc]) => `
      <div class="f"><label>${esc(label)}<span class="desc">${esc(desc)}</span></label>
        <input type="text" data-k="tiers.${idx}.${k}" value="${esc(t[k] ?? '')}"></div>`).join('');
    const monthly = (t.monthly ?? []).join(',');
    return `<details class="row"><summary>${esc(t.name)} <span class="tag">${esc(t.group)}</span>
        <span class="mono">${t.monthly ? t.monthly.join(' / ') + ' 元' : '月租未标注'}</span></summary>
      <div class="body"><div class="grid">${fields}
        <div class="f"><label>月租（元）<span class="desc">多个价格用英文逗号分隔；留空 = 原表未单列</span></label>
          <input type="text" data-k="tiers.${idx}.monthly" value="${esc(monthly)}"></div>
        <div class="f full"><label>标签<span class="desc">英文逗号分隔</span></label>
          <input type="text" data-k="tiers.${idx}.tags" value="${esc((t.tags ?? []).join(','))}"></div>
      </div></div></details>`;
  }

  function sceneForm(s, idx) {
    return `<details class="row"><summary>${esc(s.icon)} ${esc(s.title)} <span class="tag">${esc(s.key)}</span>
        <span class="mono">主推 ${esc(s.main)}</span></summary>
      <div class="body"><div class="grid">
        <div class="f"><label>场景 key</label><input type="text" data-k="scenes.${idx}.key" value="${esc(s.key)}"></div>
        <div class="f"><label>图标（emoji）</label><input type="text" data-k="scenes.${idx}.icon" value="${esc(s.icon)}"></div>
        <div class="f"><label>场景标题</label><input type="text" data-k="scenes.${idx}.title" value="${esc(s.title)}"></div>
        <div class="f"><label>典型客户</label><input type="text" data-k="scenes.${idx}.who" value="${esc(s.who)}"></div>
        <div class="f full"><label>核心诉求</label><input type="text" data-k="scenes.${idx}.need" value="${esc(s.need)}"></div>
        <div class="f full"><label>痛点要点<span class="desc">每行一条</span></label>
          <textarea data-k="scenes.${idx}.points" data-list="lines">${esc((s.points ?? []).join('\n'))}</textarea></div>
        <div class="f full"><label>推荐档位 ID<span class="desc">英文逗号分隔</span></label>
          <input type="text" data-k="scenes.${idx}.tiers" value="${esc((s.tiers ?? []).join(','))}"></div>
        <div class="f"><label>主推档位 ID</label><input type="text" data-k="scenes.${idx}.main" value="${esc(s.main)}"></div>
        <div class="f"><label>相邻场景 key</label><input type="text" data-k="scenes.${idx}.next.0" value="${esc((s.next ?? [])[0] ?? '')}"></div>
        <div class="f"><label>相邻场景提示语</label><input type="text" data-k="scenes.${idx}.next.1" value="${esc((s.next ?? [])[1] ?? '')}"></div>
        <div class="f full"><label>场景说明</label><input type="text" data-k="scenes.${idx}.foot" value="${esc(s.foot ?? '')}"></div>
      </div></div></details>`;
  }

  function tierSceneForm(id, ts) {
    const t = data.tiers.find(x => x.id === id);
    return `<details class="row"><summary>${esc(t ? t.name : id)} <span class="tag">${esc(ts.key)}</span>
        <span class="mono">${esc(ts.who)}</span></summary>
      <div class="body"><div class="grid">
        <div class="f"><label>归属场景 key</label><input type="text" data-k="tierScene.${id}.key" value="${esc(ts.key)}"></div>
        <div class="f"><label>适用人群</label><input type="text" data-k="tierScene.${id}.who" value="${esc(ts.who)}"></div>
        <div class="f full"><label>场景痛点</label><textarea data-k="tierScene.${id}.pain">${esc(ts.pain)}</textarea></div>
        <div class="f full"><label>本档怎么解决<span class="desc">每行一条</span></label>
          <textarea data-k="tierScene.${id}.solve" data-list="lines">${esc((ts.solve ?? []).join('\n'))}</textarea></div>
        <div class="f full"><label>选型提示<span class="desc">月租未标注的档位须保留「需与客户经理确认」</span></label>
          <textarea data-k="tierScene.${id}.fit">${esc(ts.fit)}</textarea></div>
      </div></div></details>`;
  }

  function faqForm(f, idx) {
    return `<details class="row"><summary>${esc(f.q)}</summary>
      <div class="body"><div class="grid">
        <div class="f full"><label>问题</label><input type="text" data-k="faq.${idx}.q" value="${esc(f.q)}"></div>
        <div class="f full"><label>回答</label><textarea data-k="faq.${idx}.a" data-big>${esc(f.a)}</textarea></div>
      </div></div></details>`;
  }

  function metaForm() {
    const m = data.meta || {};
    const fields = [
      ['title', '页面标题 <title>'], ['description', 'meta description'],
      ['ogTitle', 'og:title'], ['ogDescription', 'og:description'], ['themeColor', 'theme-color'],
    ].map(([k, label]) => `<div class="f full"><label>${esc(label)}</label>
      <input type="text" data-k="meta.${k}" value="${esc(m[k] ?? '')}"></div>`).join('');
    return `<div class="grid">${fields}
      <div class="f full"><label>产品名称</label><input type="text" data-k="name" value="${esc(data.name ?? '')}"></div>
    </div>`;
  }

  /* ---------------- 渲染 ---------------- */

  function renderAll() {
    $('#pane-tiers').innerHTML = data.tiers.map(tierForm).join('');
    $('#pane-scenes').innerHTML = data.scenes.map(sceneForm).join('');
    $('#pane-tierScene').innerHTML = Object.entries(data.tierScene).map(([id, ts]) => tierSceneForm(id, ts)).join('');
    $('#pane-faq').innerHTML = data.faq.map(faqForm).join('');
    $('#pane-meta').innerHTML = metaForm();
    $('#jsonArea').value = JSON.stringify(data, null, 2);
    $('#cntTiers').textContent = data.tiers.length;
    $('#cntScenes').textContent = data.scenes.length;
    $('#cntTs').textContent = Object.keys(data.tierScene).length;
    $('#cntFaq').textContent = data.faq.length;
    const total = data.tiers.length;
    const noRent = data.tiers.filter(t => t.monthly === null).length;
    const ipYes = data.tiers.filter(t => t.ipState === 'yes').length;
    const withSub = data.tiers.filter(t => !(t.full2 === '—' && t.full3 === '—' && t.z2 === '—' && t.z3 === '—')).length;
    $('#stats').innerHTML = `
      <div class="stat"><b>${total}</b><span>套餐档位</span></div>
      <div class="stat"><b>${data.scenes.length}</b><span>办公场景</span></div>
      <div class="stat"><b>${withSub}</b><span>含补贴档位</span></div>
      <div class="stat"><b>${ipYes}</b><span>标注公网 IP</span></div>
      <div class="stat"><b>${noRent}</b><span>月租未标注</span></div>
      <div class="stat"><b>${data.faq.length}</b><span>常见问题</span></div>`;
  }

  /* ---------------- 表单 → 数据 ---------------- */

  function setPath(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      const nextIsIndex = /^\d+$/.test(parts[i + 1]);
      if (cur[k] == null) cur[k] = nextIsIndex ? [] : {};
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function collect() {
    const out = JSON.parse(JSON.stringify(data));
    $$('[data-k]').forEach(el => {
      const path = el.dataset.k;
      let v = el.value;
      if (el.dataset.list === 'lines') v = v.split('\n').map(x => x.trim()).filter(Boolean);
      else if (path.endsWith('.monthly')) v = v.trim() === '' ? null : v.split(',').map(x => Number(x.trim())).filter(n => !Number.isNaN(n));
      else if (path.endsWith('.tags') || path.endsWith('.tiers')) v = v.split(',').map(x => x.trim()).filter(Boolean);
      else if (path.endsWith('.next.0') || path.endsWith('.next.1')) {
        const base = path.slice(0, -2);
        const arr = [getPath(out, base + '.0') || '', getPath(out, base + '.1') || ''];
        arr[Number(path.slice(-1))] = v;
        setPath(out, base, arr);
        return;
      }
      setPath(out, path, v);
    });
    return out;
  }

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  /* ---------------- 动作 ---------------- */

  async function load() {
    const r = await api('GET', 'products/' + ID);
    if (r.status === 401) { notice('err', '会话已过期，请重新登录。'); return; }
    if (r.status !== 200 || !r.json || !r.json.data) {
      notice('err', '载入失败：HTTP ' + r.status + '（请刷新页面重试）');
      return;
    }
    data = r.json.data;
    renderAll();
    notice('ok', '数据已载入。');
    loadHistory();
  }

  async function validate() {
    const payload = collect();
    const r = await api('POST', 'products/' + ID + '/validate', { data: payload });
    const j = r.json || {};
    if (j.ok && (!j.warnings || !j.warnings.length)) {
      notice('ok', '校验通过：结构与业务一致性均无问题。');
    } else if (j.ok) {
      notice('warn', '校验通过，但有提示：<ul>' + j.warnings.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul>');
    } else {
      notice('err', '校验未通过：<ul>' + (j.errors || []).map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>');
    }
    return j;
  }

  async function publish() {
    const payload = collect();
    $('#btnPublish').disabled = true;
    $('#btnPublish').textContent = '发布中…';
    try {
      const r = await api('POST', 'products/' + ID + '/publish', { data: payload });
      const j = r.json || {};
      const box = $('#result');
      if (j.ok) {
        box.className = 'result ok';
        box.innerHTML = `<b>发布成功</b><br>渲染 ${j.bytes} 字节；已写入 <code>data/products/${ID}.json</code> 与 <code>site/products/${ID}.html</code>`
          + (j.archived ? `<br>旧版本已归档：<code>${esc(j.archived)}</code>` : '')
          + (j.warnings && j.warnings.length ? '<ul>' + j.warnings.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul>' : '');
        notice('ok', '已保存并发布。刷新线上页即可看到最新内容。');
        await load();
      } else {
        box.className = 'result err';
        box.innerHTML = `<b>发布失败</b>（${esc(j.error || r.status)}）`
          + (j.errors ? '<ul>' + j.errors.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>' : '')
          + (j.message ? '<br>' + esc(j.message) : '');
        notice('err', '发布失败，未改动线上内容。');
      }
    } finally {
      $('#btnPublish').disabled = false;
      $('#btnPublish').textContent = '保存并发布';
    }
  }

  async function preview() {
    const payload = collect();
    const r = await api('POST', 'products/' + ID + '/render', { data: payload });
    const j = r.json || {};
    const box = $('#result');
    if (j.ok) {
      box.className = 'result ok';
      box.innerHTML = `<b>渲染成功</b>：${j.bytes} 字节（未发布）。<br>如需确认视觉效果，请先发布或本地查看。`;
      notice('ok', '渲染通过（未发布）。');
    } else {
      box.className = 'result err';
      box.innerHTML = `<b>渲染失败</b>` + (j.errors ? '<ul>' + j.errors.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>' : '');
      notice('err', '渲染失败。');
    }
  }

  /* ---------------- 客户需求单 ---------------- */

  const ORDER_STATUS = { new: '待跟进', contacted: '已联系', won: '已成交', lost: '已放弃' };

  async function loadOrders() {
    const r = await api('GET', 'orders?limit=200');
    const j = r.json || {};
    const box = $('#pane-orders');
    if (!j.ok) { box.innerHTML = '<p class="hint">需求单载入失败（HTTP ' + r.status + '）</p>'; return; }
    const n = $('#cntOrders'); if (n) n.textContent = j.counts ? j.counts.new : 0;
    const c = j.counts || {};
    // 2026-10-01 首页改版：官网首页新增「合作与签约」入口后，需求单有两个来源。
    // 这里把首页来的线索单独计数，客户经理一眼能看出有多少条来自官网首页。
    const consultCount = (j.orders || []).filter(o => o.intent === 'consult').length;
    const head = `<div class="stats" style="margin-bottom:14px">
        <div class="stat"><b>${j.total ?? 0}</b><span>全部需求单</span></div>
        <div class="stat"><b>${consultCount}</b><span>首页合作意向</span></div>
        <div class="stat"><b>${c.new ?? 0}</b><span>待跟进</span></div>
        <div class="stat"><b>${c.contacted ?? 0}</b><span>已联系</span></div>
        <div class="stat"><b>${c.won ?? 0}</b><span>已成交</span></div>
        <div class="stat"><b>${c.lost ?? 0}</b><span>已放弃</span></div>
      </div>`;
    if (!j.orders || !j.orders.length) {
      box.innerHTML = head + '<p class="hint">暂无客户在线提交的需求单。客户在 <a href="/portal/products/2026Q3.html" target="_blank" rel="noopener">产品页</a> 点「在线提交需求单」，或在 <a href="/portal" target="_blank" rel="noopener">官网首页</a>「合作与签约」区提交合作意向后，都会出现在这里。</p>';
      return;
    }
    const rows = j.orders.map(o => {
      // 首页合作意向按业务域收集，没有「意向档位」；产品页则相反。
      // 两个来源同表展示时必须一眼可分，否则客户经理会拿错跟进口径。
      const isConsult = o.intent === 'consult';
      const intent = isConsult
        ? ((o.domains || []).join('、') || '—')
        : ((o.tiers || []).join('、') || '—');
      const addons = (o.addons || []).join('、') || '—';
      const source = isConsult ? '首页合作意向' : '产品页选档位';
      // 来源标签不换行：列宽有限时「首页合作意向」会被断成两行，读起来像错字。
      const sourceCell = `<span class="tag" style="white-space:nowrap">${esc(source)}</span>`;
      return `<tr>
        <td class="mono">${esc(String(o.at || '').replace('T', ' ').slice(0, 16))}</td>
        <td><b>${esc(o.org || '')}</b><div class="tsub">${esc(o.contact || '')} · ${esc(o.tel || '')}</div></td>
        <td>${sourceCell}</td>
        <td>${esc(intent)}</td>
        <td class="small">${esc(o.pay || '')} / ${esc(o.term || '')}<div class="tsub">${esc(addons)}</div></td>
        <td class="small">${esc(o.addr || '—')}${o.note ? '<div class="tsub">备注：' + esc(o.note) + '</div>' : ''}</td>
        <td><select data-ostatus="${esc(o.id)}">
            ${Object.entries(ORDER_STATUS).map(([k, v]) => `<option value="${k}"${o.status === k ? ' selected' : ''}>${v}</option>`).join('')}
          </select></td>
      </tr>`;
    }).join('');
    box.innerHTML = head + `<div class="history"><table><thead><tr>
        <th>提交时间</th><th>单位 / 联系人</th><th>来源</th><th>意向（档位 / 业务域）</th><th>预存 / 合约</th><th>装机地址与备注</th><th>跟进状态</th>
      </tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  async function updateOrderStatus(id, status) {
    const r = await api('POST', 'orders/' + id + '/status', { status });
    if (r.json && r.json.ok) notice('ok', '状态已更新为「' + (ORDER_STATUS[status] || status) + '」。');
    else notice('err', '状态更新失败。');
  }

  async function loadHistory() {
    const r = await api('GET', 'products/' + ID + '/history');
    const j = r.json || {};
    const box = $('#history');
    if (!j.ok || !j.history.length) { box.textContent = '暂无历史版本。'; return; }
    box.innerHTML = `<table><thead><tr><th>版本文件</th><th>大小</th><th>时间</th><th>操作</th></tr></thead><tbody>`
      + j.history.map(h => `<tr><td class="mono">${esc(h.name)}</td><td>${h.bytes} B</td>
          <td>${esc((h.at || '').replace('T', ' ').slice(0, 19))}</td>
          <td><button class="btn" data-rollback="${esc(h.name)}">回滚到此版本</button></td></tr>`).join('')
      + '</tbody></table>';
  }

  async function rollback(name) {
    if (!confirm('确定回滚到该历史版本？当前数据会先被归档。')) return;
    const r = await api('POST', 'products/' + ID + '/rollback', { name });
    const j = r.json || {};
    if (j.ok) { notice('ok', '已回滚到 ' + esc(j.restored) + '，并已重新发布。'); await load(); }
    else notice('err', '回滚失败：' + esc(j.error || r.status));
  }

  /* ---------------- 事件绑定 ---------------- */

  $$('#tabs .tab').forEach(b => b.addEventListener('click', () => {
    $$('#tabs .tab').forEach(x => x.classList.toggle('on', x === b));
    $$('.pane').forEach(p => { p.hidden = p.id !== 'pane-' + b.dataset.tab; });
    if (b.dataset.tab === 'orders') loadOrders();
  }));
  $('#btnReload').addEventListener('click', load);
  $('#btnValidate').addEventListener('click', validate);
  $('#btnPublish').addEventListener('click', publish);
  $('#btnPreview').addEventListener('click', preview);
  $('#btnHistory').addEventListener('click', loadHistory);
  // 需求单状态变更（事件委托，避免重渲染后失效）
  document.addEventListener('change', e => {
    const sel = e.target.closest('[data-ostatus]');
    if (sel) updateOrderStatus(sel.dataset.ostatus, sel.value);
  });
  $('#btnApplyJson').addEventListener('click', () => {
    try {
      const parsed = JSON.parse($('#jsonArea').value);
      data = parsed;
      renderAll();
      notice('ok', 'JSON 已应用到表单，请校验后再发布。');
    } catch (e) { notice('err', 'JSON 解析失败：' + esc(e.message)); }
  });
  document.addEventListener('click', e => {
    const rb = e.target.closest('[data-rollback]');
    if (rb) rollback(rb.dataset.rollback);
  });

  load();
})();
