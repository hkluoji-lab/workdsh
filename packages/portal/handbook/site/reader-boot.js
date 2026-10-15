/* 启动：数据源无关 —— 内联数据（静态单文件）或从 /api/portal/handbook/state 取（后台驱动）。 */
function bootReader(pages, cfg){
  PAGES = Array.isArray(pages) ? pages : [];
  N = PAGES.length;
  if(cfg && cfg.mediaBase) MEDIA_BASE = cfg.mediaBase;
  var tot = document.getElementById('totNo');
  if(tot) tot.textContent = N;
  var bootPage = pageFromHash();
  layout();
  var h = document.getElementById('hint');
  if(bootPage > 0) doJump(leafForPage(Math.max(0, Math.min(bootPage - 1, N - 1))));
  if(h){ setTimeout(function(){ h.style.opacity = '0'; }, 6500); }
}

/* 编辑入口：只有登录且在该书编辑名单里时，服务端才会注入 adminUrl。 */
function showEditEntry(cfg){
  var a = document.getElementById('btnEdit');
  if(!a) return;
  if(cfg && cfg.canEdit && cfg.adminUrl){ a.href = cfg.adminUrl; a.style.display = 'inline-flex'; }
  else { a.style.display = 'none'; }
}

onReady();
(function(){
  var cfg = window.__BOOK__ || {};
  showEditEntry(cfg);
  if(typeof window.__PAGES__ !== 'undefined' && window.__PAGES__){
    bootReader(window.__PAGES__, cfg);
    return;
  }
  var url = '/api/portal/handbook/state' + (cfg.bookId ? ('?book=' + encodeURIComponent(cfg.bookId)) : '');
  var hint = document.getElementById('hint');
  if(hint) hint.textContent = '正在载入…';
  fetch(url, { credentials:'same-origin', cache:'no-store' })
    .then(function(r){ return r.json(); })
    .then(function(doc){
      if(!doc || doc.ok === false) throw new Error((doc && doc.error) || 'load-failed');
      var meta = doc.meta || {};
      var b = document.querySelector('.brand .tt');
      if(b && meta.title){ b.innerHTML = esc(meta.title) + (meta.subtitle ? '<small>'+esc(meta.subtitle)+'</small>' : ''); }
      if(meta.title) document.title = meta.title + ' · 在线翻页电子书刊';
      /* 页脚书名由这本书的 meta 驱动（多书共用一份 reader.js）；
         静态单文件（内联 __PAGES__）不设置，沿用模板默认标题。 */
      window.__BOOK_TITLE__ = meta.title || '';
      bootReader(doc.pages, { mediaBase: doc.mediaBase });
      if(hint) hint.textContent = '点击页面右侧翻页 ｜ ← → 键翻页 ｜ 滚轮 / 左右滑动也可以';
    })
    .catch(function(err){
      if(hint) hint.textContent = '内容载入失败：' + (err && err.message ? err.message : '未知错误');
    });
})();