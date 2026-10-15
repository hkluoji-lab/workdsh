/* ============================================================
   企业工作台定制解决方案 · 在线翻页电子书刊
   承载结构复用自 /portal/products/2026Q4-zhengqi-fuwu-shouce.html
   （#p=N 页码深链、双页对开 / 单页、翻开动画、目录与缩略图）
   本页为纯静态：全部页面内容内联，无后端接口依赖。
   ============================================================ */
var PAGES = [];
var N = 0;
var mode = 'spread';
var total = 0, L = 0, sheets = [], busy = false;
var book = null, stage = null, reader = null;

function esc(v){
  return String(v==null?'':v).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function pad2(n){ return String(n).padStart(2,'0'); }
function indexOfId(id){ for(var i=0;i<PAGES.length;i++){ if(PAGES[i].id===id) return i; } return -1; }

/* 界面截图使用同源既有的小尺寸 WebP 变体：原图是 ~3000px 宽的 PNG（0.4–0.8MB），
   而书页里最大只显示到 ~600px 宽，整张解码进 GPU 纹理是纯粹的浪费，
   反复 resize 时还会触发合成器重栅格化。变体在各资产之间命名并不统一
   （skills 只有 -680/-1360，其余是 -360/-720），因此逐项登记，避免静默 404。 */
/* 与 layout() 同一套尺寸公式，只为让 <img sizes> 贴近真实显示宽度：
   sizes 不准会选到分辨率不足的变体（曾出现 378px 原图撑 489px 槽位）。 */
function sizesForBook(){
  var vw = window.innerWidth, vh = window.innerHeight;
  var availH = vh - 56 - 46 - 44;
  var availW = vw - 32;
  var force = document.documentElement.dataset.forceMode;
  var spread = force ? (force === 'spread') : (vw >= 900);
  var pw;
  if(spread){
    var ph = Math.min(availH, 860);
    pw = Math.round(ph/1.414);
    if(pw*2 > availW) pw = Math.floor(availW/2);
  } else {
    pw = Math.min(availW, 560);
    var ph2 = Math.round(pw*1.414);
    if(ph2 > availH){ ph2 = availH; pw = Math.round(ph2/1.414); }
  }
  /* 按 2x 设备像素比上报：截图页最宽也就 ~600px，若只报 1x，
    高分屏（DPR 2）会选到分辨率不足的变体而发虚。 */
  var layout = (vw < 640) ? (pw - 36) : (pw - 44);
  return Math.round(layout * 2) + 'px';
}

/* 站点既有资产的多分辨率登记表。
   后台只保存基名（skills / ppt / library / team），由这里解析成真实的
   srcset 与尺寸 —— 变体命名在各资产之间并不统一（skills 只有 -680/-1360），
   所以逐项登记，避免静默 404 造成空图。 */
var ASSETS = {
  skills:  { variants:[['/portal/assets/skills-680.webp',680],['/portal/assets/skills-1360.webp',1360]], w:1360, h:739 },
  ppt:     { variants:[['/portal/assets/ppt-360.webp',360],['/portal/assets/ppt-720.webp',720]],          w:720,  h:393 },
  library: { variants:[['/portal/assets/library-360.webp',360],['/portal/assets/library-720.webp',720]],  w:720,  h:395 },
  team:    { variants:[['/portal/assets/team-360.webp',360],['/portal/assets/team-720.webp',720]],        w:720,  h:393 },
  dashboard:{ variants:[['/portal/assets/dashboard-1120.webp',1120]], w:1120, h:612 },
};

/* 把页面的 asset 描述解析成 { src, variants, w, h }：
   · 数据里给了完整对象（静态单文件）→ 直接用；
   · 数据里只有基名（后台驱动）→ 查登记表；
   · 都没有但给了 image 文件名 → 走媒体目录。 */
function resolveAsset(p){
  var a = p.asset;
  if(a && typeof a === 'object' && (a.src || (a.variants && a.variants.length))) return a;
  var key = typeof a === 'string' ? a : '';
  if(key && ASSETS[key]) return ASSETS[key];
  if(p.image){
    var url = (p.image.indexOf('/') === 0) ? p.image : (MEDIA_BASE + encodeURIComponent(p.image));
    return { src:url, variants:[[url,0]], w:p.imageW||720, h:p.imageH||393 };
  }
  return { src:'', variants:[], w:720, h:393 };
}

/* 眉标（kicker）由数据字段 theme 渲染，不再写进 body：
   后台编辑正文时不会误删眉标，眉标本身也可在后台单独改。 */
function kickerHTML(p){
  if(!p.theme) return '';
  var isCover = /^\s*<div class="cover"/.test(String(p.body||''));
  if(isCover) return '';
  return '<span class="kicker">'+esc(p.theme)+'</span>';
}
/* 页边章：取 theme 里的章节号；没有编号的页留空 */
function chapterMark(p){
  /* 优先取页面数据里的显式章号 chNo；没有该字段才退回"theme 前两位数字"的旧口径。
     既有书（zhengqi / aiie）都不带 chNo，因此行为与本次改动前完全一致。 */
  if(p.chNo) return String(p.chNo);
  var m = String(p.theme||'').match(/^\s*(\d\d)/);
  return m ? m[1] : '';
}

function pageHTML(i){
  if(i>=PAGES.length) return '<div class="page blank"></div>';
  var p = PAGES[i];
  if(p.type==='img' || p.image){
    /* 整页配图：asset 可能是完整对象，也可能只是基名，统一由此解析 */
    var a = resolveAsset(p);
    var list = (a.variants && a.variants.length) ? a.variants : (a.src ? [[a.src, 0]] : []);
    var srcset = list.map(function(v){ return v[0] + (v[1] ? ' ' + v[1] + 'w' : ''); }).join(', ');
    var src = a.src || p.image || '';
    var figs = '<figure class="shot">'
      + '<img class="zoomable" loading="lazy" decoding="async" src="' + esc(src) + '"'
      + (srcset ? ' srcset="' + esc(srcset) + '"' : '')
      + ' sizes="' + sizesForBook() + '"'
      + ' width="' + (a.w||720) + '" height="' + (a.h||393) + '" alt="' + esc(p.alt||p.title) + '">'
      + (p.caption ? '<figcaption>'+esc(p.caption)+'</figcaption>' : '') + '</figure>';
    return '<div class="page"><div class="imgpage">'
      + '<div class="ibar"><b>'+esc(p.title)+'</b><span>'+esc(p.subtitle)+'</span></div>'
      + '<div class="iimg">'+figs+'</div>'
      + '<div class="ifoot">'+esc(p.foot||'')+'</div></div></div>';
  }
  var body = String(p.body||'');
  /* 封面/章节页整页自带背景，不套 pbody 与页脚 */
  if(p.type==='cover' || p.type==='sec' && /^\s*<div class="(cover|sec)"/.test(body)){
    return '<div class="page">'+body+'</div>';
  }
  var foot = '<div class="pfoot">'
    + '<span class="t">' + esc(window.__BOOK_TITLE__ || '企业工作台定制解决方案') + '</span>'
    + '<span class="no">'+pad2(i+1)+' / '+pad2(N)+'</span>'
    + '<span class="mk">'+(chapterMark(p) ? esc(chapterMark(p)) : '')+'</span></div>';
  /* 运行小节（可选字段 running）：本页不是以标题开篇时，补一行弱化的"当前小节"，
     让跨页也读得懂自己在哪一节，同时不与页首大标题重复。
     既有书没有 running 字段，head 就等于原来的 kickerHTML(p)，渲染结果不变。 */
  var head = kickerHTML(p);
  if(p.running && !/^\s*<h3/.test(body)) head += '<div class="running">'+esc(p.running)+'</div>';
  return '<div class="page"><div class="pbody" data-pg="'+i+'">'
    + head + body + '</div>'
    + '<div class="scrollhint">↓ 本页内容较多，可继续向下滚动</div>'+foot+'</div>';
}

function build(){
  var prevPage = 0;
  if(total) prevPage = focusPage();
  book.innerHTML = '<div class="spine"></div>';
  book.classList.toggle('single', mode==='single');
  total = (mode==='single') ? N : Math.ceil(N/2);
  sheets = [];
  for(var k=0;k<total;k++){
    var el = document.createElement('div');
    el.className='sheet'; el.dataset.k=k;
    var front, back;
    if(mode==='single'){ front = pageHTML(k); back = '<div class="page blank"></div>'; }
    else { front = pageHTML(2*k); back = pageHTML(2*k+1); }
    el.innerHTML = '<div class="face front"><span class="edge"></span>'+front+'<span class="corner"></span></div>'
                 + '<div class="face back"><span class="edge"></span>'+back+'<span class="corner"></span></div>';
    book.appendChild(el);
    sheets.push(el);
  }
  L = leafForPage(prevPage);
  if(total) L = Math.max(0, Math.min(L, maxLeaf()));
  apply();
  initOrderForm();
  requestAnimationFrame(fitAll);
}

function focusPage(){ return (mode==='single') ? L : 2*L; }
function maxLeaf(){ return (mode==='single') ? total-1 : (N % 2 === 0 ? total : total-1); }
function leafForPage(i){
  if(mode==='single') return i;
  return (i % 2 === 0) ? i/2 : (i+1)/2;
}

function apply(){
  sheets.forEach(function(el){
    var k = +el.dataset.k;
    var flipped = k < L;
    el.classList.toggle('flipped', flipped);
    el.style.zIndex = flipped ? (k+1) : (total - k);
    el.style.transition = '';
    /* 只有当前可见的两张面保留投影，其余面去掉投影，避免叠影 */
    var front = el.querySelector('.face.front'), back = el.querySelector('.face.back');
    var topFlipped = flipped && (k === L-1);
    var topUnflipped = !flipped && (k === L);
    if(front) front.classList.toggle('flat', !topUnflipped);
    if(back) back.classList.toggle('flat', !topFlipped);
  });
  book.classList.toggle('closed', L===0);
  book.classList.toggle('open', L>0);
  markTurnable();
  updateChrome();
}

/* 标出"当前可翻的那张纸"（折角提示只出现在它上面），以及是否还有可翻空间 */
function markTurnable(){
  sheets.forEach(function(el, k){
    el.classList.toggle('now', k === L);
  });
  book.classList.toggle('can-turn', L < maxLeaf());
}

/* 深链：#p=N 表示第 N 页。用 replaceState 写地址栏（不产生历史记录），
   刷新、收藏、转发都能回到同一页；只认 #p=N，忽略无关 hash。 */
function pageFromHash(){
  var m = /(?:^|[#&])p=(\d+)/.exec(location.hash);
  if(!m) return 0;
  var n = parseInt(m[1], 10);
  return (isFinite(n) && n > 0) ? n : 0;
}
/* pageFromHash 返回 1-based 页码，此处不按 N 裁剪：启动早期 N 还是 0。 */
function pageIndexFromHash(){
  var n = pageFromHash();
  return n > 0 ? Math.max(0, Math.min(n-1, N-1)) : -1;
}
function syncHash(n){
  if(!history.replaceState) return;
  var want = '#p=' + n;
  if(location.hash !== want) history.replaceState(null, '', location.pathname + location.search + want);
}

function updateChrome(){
  var cur = Math.min(focusPage(), N-1);
  document.getElementById('curNo').textContent = cur+1;
  document.getElementById('totNo').textContent = N;
  var pct = N>1 ? (cur/(N-1))*100 : 100;
  document.getElementById('progressBar').style.width = pct.toFixed(1)+'%';
  document.getElementById('btnPrev').disabled = (L<=0);
  document.getElementById('btnNext').disabled = (L>=maxLeaf());
  document.getElementById('btnFirst').disabled = (L<=0);
  syncHash(cur+1);
}

function next(){
  if(busy || L>=maxLeaf()) return;
  var el = sheets[L];
  busy = true;
  el.style.zIndex = 999;
  el.classList.add('turning');
  requestAnimationFrame(function(){ el.classList.add('flipped'); });
  setTimeout(function(){
    L++;
    el.classList.remove('turning');
    busy = false;
    apply();
  }, 840);
}
function prev(){
  if(busy || L<=0) return;
  var el = sheets[L-1];
  busy = true;
  L--;
  el.style.zIndex = 999;
  el.classList.add('turning');
  apply();
  sheets.forEach(function(e){ if(+e.dataset.k===L) e.style.zIndex = 999; });
  setTimeout(function(){ el.classList.remove('turning'); busy=false; apply(); }, 840);
}
function goto(page){
  page = Math.max(0, Math.min(page, N-1));
  var target = Math.min(leafForPage(page), maxLeaf());
  closeDrawer();
  if(target===L) return;
  var steps = Math.abs(target-L);
  if(steps>3){ doJump(target); return; }
  (function step(){
    if(L===target) return;
    if(L<target){ next(); } else { prev(); }
    setTimeout(step, 900);
  })();
}
/* 直接跳页：淡出 → 立刻把每张纸翻到位 → 淡入。
   用 jumpToken 作废前一次尚未生效的跳转，否则连续跳页时两个 230ms 回调互相覆盖，
   L 会停在中途（例如点第 6 页却停在第 9 页）。 */
var jumpToken = 0, jumpTimer = null;
function doJump(target){
  var token = ++jumpToken;
  busy = true;
  book.style.transition = 'opacity .22s';
  book.style.opacity = '0.06';
  clearTimeout(jumpTimer);
  jumpTimer = setTimeout(function(){
    if(token !== jumpToken) return;
    L = Math.max(0, Math.min(target, maxLeaf()));
    sheets.forEach(function(el){
      var k = +el.dataset.k;
      el.style.transition = 'none';
      var flipped = k<L;
      el.classList.toggle('flipped', flipped);
      el.style.zIndex = flipped ? (k+1) : (total-k);
      var front = el.querySelector('.face.front'), back = el.querySelector('.face.back');
      if(front) front.classList.toggle('flat', !(!flipped && k===L));
      if(back) back.classList.toggle('flat', !(flipped && k===L-1));
      void el.offsetWidth;
      el.style.transition = '';
    });
    book.classList.toggle('closed', L===0);
    book.classList.toggle('open', L>0);
    book.style.opacity = '1';
    book.style.transition = '';
    busy = false;
    markTurnable();
    updateChrome();
  }, 200);
}

/* 自动缩排：内容超页时逐级缩小字号；缩到下限仍放不下才改为页内可滚动（兜底）。
   单页模式同样先缩字号：窄屏若只靠滚动兜底，固定页脚会压住被截断的正文，观感像坏页。
   字号下限两边都是 9.6px；对开（桌面）先用较大的中间档，单页（手机）依次下探以保证整页放得下（仍超页才页内滚动）。 */
function fitAll(){
  var narrow = document.documentElement.classList.contains('narrow');
  var sizes = narrow ? [13.5,13,12.5,12,11.4,10.8,10.2,9.6] : [13.5,12.8,12.1,11.4,10.8,10.2,9.6];
  document.querySelectorAll('.pbody').forEach(function(body){
    body.style.fontSize = sizes[0]+'px';
    body.classList.remove('scrollable');
    var i = 0;
    while(body.scrollHeight > body.clientHeight + 2 && i < sizes.length-1){
      i++;
      body.style.fontSize = sizes[i]+'px';
    }
    var scroll = body.scrollHeight > body.clientHeight + 2;
    body.classList.toggle('scrollable', scroll);
    var pg = body.closest('.page');
    if(pg) pg.classList.toggle('has-scroll', scroll);
  });
}

/* 单页模式：不加 .narrow 的滚动兜底（改为逐级缩小字号），但标记 narrow 供样式区分 */
function layout(){
  var vw = window.innerWidth, vh = window.innerHeight;
  var availH = vh - 56 - 46 - 44;
  var availW = vw - 32;
  var pw, ph, want = (vw >= 900) ? 'spread' : 'single';
  if(document.documentElement.dataset.forceMode) want = document.documentElement.dataset.forceMode;
  if(want==='spread'){
    ph = Math.min(availH, 860);
    pw = Math.round(ph/1.414);
    if(pw*2 > availW){ pw = Math.floor(availW/2); ph = Math.round(pw*1.414); }
  } else {
    pw = Math.min(availW, 560);
    ph = Math.round(pw*1.414);
    if(ph > availH){ ph = availH; pw = Math.round(ph/1.414); }
  }
  pw = Math.max(pw, 200); ph = Math.max(ph, 280);
  var changed = (want !== mode);
  /* 切换单页/双页时，L 的含义会从「对开索引」变成「页码索引」（或相反）。
     先按旧模式换算出「当前正在看的页」，build() 再用新模式换算回 L，
     否则跨断点重排会把读者丢到别的页（实测第 21 页→第 11 页），地址栏页码也被改写。 */
  var curPageNow = total ? Math.min(focusPage(), N-1) : 0;
  mode = want;
  document.documentElement.classList.toggle('narrow', mode==='single');
  document.documentElement.style.setProperty('--pw', pw+'px');
  document.documentElement.style.setProperty('--ph', ph+'px');
  var lbl = document.getElementById('btnMode').querySelector('.lbl');
  if(lbl) lbl.textContent = (mode==='spread' ? '双页' : '单页');
  if(changed || !sheets.length){
    total = (mode==='single') ? N : Math.ceil(N/2);
    L = Math.max(0, Math.min(leafForPage(curPageNow), maxLeaf()));
    build();
  } else {
    requestAnimationFrame(fitAll);
  }
}

/* ---------- 抽屉 / 灯箱 ---------- */
var mask, drawer, drawerBody, drawerTitle;
function pageName(p){ return esc(p.title || p.label || ''); }
function openDrawer(kind){
  if(kind==='toc'){
    /* 全书逐页目录：内容页取标题，图片页取界面名称，均可直接跳转 */
    drawerTitle.textContent = '目录（共 '+N+' 页）';
    drawerBody.innerHTML = '<ul class="toc-l">'+PAGES.map(function(p,i){
      var isSec = (p.type==='cover');
      var cls = isSec ? ' toc-sec' : '';
      return '<li><button class="toc-a'+cls+'" data-goto="'+esc(p.id)+'">'
        + '<span class="n">'+pad2(i+1)+'</span><span class="t">'+pageName(p)+'</span>'
        + '<span class="p">P'+(i+1)+'</span></button></li>';
    }).join('')+'</ul>';
  } else {
    drawerTitle.textContent = '缩略图（共 '+N+' 页）';
    /* 真缩略图：把整页按比例缩小渲染（use transform:scale 而不是缩放字体，
       这样缩略图与正文永远同源，改版式不会两边不一致）。 */
    var thumbW = 176;
    var thumbH = Math.round(thumbW * 1.414);
    var scale = thumbW / (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pw')) || 400);
    drawerBody.innerHTML = '<div class="thumbs">'+PAGES.map(function(p,i){
      var cur = (Math.min(focusPage(),N-1)===i) ? ' cur' : '';
      return '<button class="th'+cur+'" data-jump="'+i+'" title="'+esc(p.title||p.label||'')+'">'
        + '<span class="thbox"><span class="thpage" style="width:'+(thumbW/scale)+'px;height:'+(thumbH/scale)+'px;'
        + 'transform:scale('+scale+')">'+pageHTML(i)+'</span></span>'
        + '<span class="tn">第 '+(i+1)+' 页</span>'
        + '<span class="tt2">'+esc(p.title || p.label || '')+'</span></button>';
    }).join('')+'</div>';
  }
  drawer.classList.add('on'); mask.classList.add('on');
}
function closeDrawer(){ if(drawer) drawer.classList.remove('on'); if(mask) mask.classList.remove('on'); }

function onReady(){
  book = document.getElementById('book');
  stage = document.getElementById('stage');
  reader = document.getElementById('reader');
  mask = document.getElementById('mask');
  drawer = document.getElementById('drawer');
  drawerBody = document.getElementById('drawerBody');
  drawerTitle = document.getElementById('drawerTitle');

  document.addEventListener('click', function(e){
    var chip = e.target.closest('.f-chips input[type=checkbox]');
    if(chip){ var lab = chip.closest('label'); if(lab) lab.classList.toggle('on', chip.checked); return; }
    var g = e.target.closest('[data-goto]');
    if(g){ var gi = indexOfId(g.dataset.goto); if(gi>=0) goto(gi); return; }
    var j = e.target.closest('[data-jump]');
    if(j){ goto(+j.dataset.jump); return; }
    var z = e.target.closest('.zoomable');
    if(z){ document.getElementById('lightboxImg').src = z.src; document.getElementById('lightbox').classList.add('on'); }
  });
  mask.addEventListener('click', closeDrawer);
  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  document.getElementById('lightbox').addEventListener('click', function(){ this.classList.remove('on'); });

  document.getElementById('btnToc').addEventListener('click', function(){ openDrawer('toc'); });
  document.getElementById('btnThumb').addEventListener('click', function(){ openDrawer('thumb'); });
  document.getElementById('btnPrev').addEventListener('click', prev);
  document.getElementById('btnNext').addEventListener('click', next);
  document.getElementById('btnFirst').addEventListener('click', function(){ doJump(0); });
  document.getElementById('btnMode').addEventListener('click', function(){
    document.documentElement.dataset.forceMode = (mode==='spread') ? 'single' : 'spread';
    layout();
  });
  document.getElementById('btnFull').addEventListener('click', function(){
    if(document.fullscreenElement){ document.exitFullscreen(); }
    else if(document.documentElement.requestFullscreen){ document.documentElement.requestFullscreen(); }
  });
  document.getElementById('btnShare').addEventListener('click', share);
  document.getElementById('progress').addEventListener('click', function(e){
    var r = this.getBoundingClientRect();
    var r2 = Math.max(0, Math.min(1, (e.clientX - r.left)/r.width));
    goto(Math.round(r2*(N-1)));
  });

  document.addEventListener('keydown', function(e){
    /* 焦点在表单控件里时，方向键/空格属于控件本身，不翻页 */
    var t = e.target;
    if(t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable)) return;
    if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' '){ next(); e.preventDefault(); }
    else if(e.key==='ArrowLeft'||e.key==='PageUp'){ prev(); e.preventDefault(); }
    else if(e.key==='Home'){ doJump(0); }
    else if(e.key==='End'){ doJump(N-1); }
    else if(e.key==='Escape'){ closeDrawer(); document.getElementById('lightbox').classList.remove('on'); }
  });
  /* 表单里的滚轮/触摸交给控件本身，避免页内滚动或翻页把表单抢走 */
  reader.addEventListener('wheel', function(e){
    var t = e.target;
    if(t && t.closest && t.closest('.f-form')){ e.stopPropagation(); }
  }, {passive:true, capture:true});
  initDrag();
  function userScrollableBody(el){
    if(!el || !el.classList || !el.classList.contains('pbody')) return null;
    var oy = getComputedStyle(el).overflowY;
    if(oy !== 'auto' && oy !== 'scroll') return null;
    return (el.scrollHeight > el.clientHeight + 2) ? el : null;
  }
  var wheelLock = 0;
  reader.addEventListener('wheel', function(e){
    var sb = userScrollableBody(e.target && e.target.closest ? e.target.closest('.pbody') : null);
    if(sb){
      var atTop = sb.scrollTop <= 0;
      var atBottom = sb.scrollTop + sb.clientHeight >= sb.scrollHeight - 2;
      if((e.deltaY > 0 && !atBottom) || (e.deltaY < 0 && !atTop)) return;
    }
    if(Math.abs(e.deltaY) < 22) return;
    var now = Date.now();
    if(now - wheelLock < 850) return;
    wheelLock = now;
    e.deltaY > 0 ? next() : prev();
  }, {passive:true});
  reader.addEventListener('click', function(e){
    if(e.target.closest('button')||e.target.closest('a')||e.target.closest('.zoomable')||e.target.closest('.toc-a')||e.target.closest('.f-form')||e.target.closest('.f-chips')) return;
    if(userScrollableBody(e.target.closest ? e.target.closest('.pbody') : null)) return;
    var r = book.getBoundingClientRect();
    var mid = r.left + r.width/2;
    (e.clientX > mid) ? next() : prev();
  });

  var rt;
  window.addEventListener('resize', function(){ clearTimeout(rt); rt = setTimeout(layout, 200); });
  window.addEventListener('hashchange', function(){
    var i = pageIndexFromHash();
    if(i < 0) return;
    if(i !== Math.min(focusPage(), N-1)) doJump(leafForPage(i));
  });
}

/* 合作意向表单：复用门户同源接口 /api/portal/orders，与门户首页共用同一套服务端校验、
   10 分钟去重与按 IP 限流。客户端只做预校验与三态呈现，服务端返回内容一律走 textContent。 */
var TEL_RE = /^[0-9+\-()\s]{6,40}$/;
function initOrderForm(){
  var form = document.getElementById('orderForm');
  if(!form || form.dataset.bound) return;
  form.dataset.bound = '1';
  var msg = document.getElementById('orderMsg');
  var btn = document.getElementById('orderSubmit');
  var label = btn ? btn.textContent : '';
  var say = function(text, kind){
    if(!msg) return;
    msg.className = 'f-msg' + (kind ? ' ' + kind : '');
    msg.textContent = text;
  };
  form.addEventListener('submit', async function(e){
    e.preventDefault();
    var el = form.elements;
    var org = (el.org.value||'').trim();
    var contact = (el.contact.value||'').trim();
    var tel = (el.tel.value||'').trim();
    var note = (el.note.value||'').trim();
    var domains = Array.prototype.slice.call(form.querySelectorAll('input[name=domains]:checked')).map(function(i){ return i.value; });
    var missing = [];
    if(!org) missing.push('单位名称');
    if(!contact) missing.push('联系人');
    if(!tel) missing.push('联系电话');
    if(!domains.length) missing.push('想优先解决的场景');
    if(missing.length){ say('请先填写：' + missing.join('、'), 'err'); return; }
    if(!TEL_RE.test(tel)){ say('联系电话格式不正确：请填 6–40 位数字，可含 + - ( ) 与空格。', 'err'); return; }
    if(btn){ btn.disabled = true; btn.textContent = '提交中…'; }
    try{
      var res = await fetch('/api/portal/orders', {
        method:'POST', credentials:'same-origin',
        headers:{ 'Content-Type':'application/json', 'Accept':'application/json' },
        body: JSON.stringify({ org:org, contact:contact, tel:tel, note:note, domains:domains, intent:'consult' })
      });
      var payload = null;
      try{ payload = await res.json(); }catch(e2){ payload = null; }
      if(res.ok && payload && payload.ok){
        form.reset();
        form.querySelectorAll('.f-chips label.on').forEach(function(l){ l.classList.remove('on'); });
        say('✓ 已收到您的合作意向（受理编号 ' + String(payload.id).slice(0,8) + '）。客户经理会尽快与您联系。', 'ok');
      } else if(res.status === 422 && payload && Array.isArray(payload.errors) && payload.errors.length){
        /* 服务端校验未通过：原文照显，仅把服务端口径的「意向档位」换成页面上实际的字段名 */
        say(payload.errors.map(function(t){ return String(t).replace('意向档位', '想优先解决的场景'); }).join('；'), 'err');
      } else if(res.status === 429){
        say('提交过于频繁，请稍后再试，或直接致电 199 2529 9929。', 'err');
      } else {
        say('提交失败（HTTP ' + res.status + '），请稍后重试或致电 199 2529 9929。', 'err');
      }
    }catch(e3){
      say('网络异常，提交失败。可致电 199 2529 9929，或稍后重试。', 'err');
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = label; }
    }
  });
}

/* ============================================================
   拖拽翻页：指针按住右半页向左拖 → 跟手旋转，松手按位移/速度决定「完成」或「回弹」。
   左侧向右拖则把刚翻过去的那张纸拉回来。触摸与鼠标共用 Pointer 事件。
   ============================================================ */
var drag = null;
function initDrag(){
  var DRAG_MIN = 6;          /* 超过这个位移才算拖拽，避免与点击冲突 */
  var COMMIT_RATIO = 0.28;   /* 拖过 28% 页宽即完成翻页 */

  function pctToDeg(p){ return -180 * Math.max(0, Math.min(1, p)); }

  function begin(e){
    if(busy || !book) return;
    var r = book.getBoundingClientRect();
    if(e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    var half = r.width / 2;
    var side = (e.clientX < r.left + half) ? 'left' : 'right';
    var usable = (side === 'right') ? (L < maxLeaf()) : (L > 0);
    if(!usable) return;
    drag = { id:e.pointerId, x0:e.clientX, y0:e.clientY, side:side, active:false, t0:Date.now(), lastX:e.clientX, lastT:Date.now(), v:0 };
  }

  function move(e){
    if(!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if(!drag.active){
      if(Math.abs(dx) < DRAG_MIN && Math.abs(dy) < DRAG_MIN) return;
      /* 纵向意图优先：交给页面滚动/翻页手势，不抢 */
      if(Math.abs(dy) > Math.abs(dx)){ drag = null; return; }
      drag.active = true;
      book.classList.add('dragging');
      if(drag.side === 'left') L = L - 1;      /* 把上一张纸拉回来 */
    }
    var now = Date.now();
    if(now - drag.lastT > 0){
      drag.v = (e.clientX - drag.lastX) / (now - drag.lastT);
      drag.lastX = e.clientX; drag.lastT = now;
    }
    var pw = book.getBoundingClientRect().width / (mode === 'single' ? 1 : 2);
    var p = (drag.side === 'right') ? (-dx / pw) : (1 - dx / pw);
    drag.p = Math.max(0, Math.min(1, p));
    var el = sheets[drag.side === 'right' ? L : L];
    if(el){
      el.style.zIndex = 999;
      el.style.transform = 'rotateY(' + pctToDeg(drag.p) + 'deg)';
      el.classList.toggle('turning', drag.p > 0.02);
    }
  }

  function finish(e){
    if(!drag || (e && e.pointerId !== drag.id)) return;
    var d = drag; drag = null;
    book.classList.remove('dragging');
    if(!d.active) return;
    lastDragEndAt = Date.now();   /* 让随后的 click 不再触发一次翻页 */
    var pw = book.getBoundingClientRect().width / (mode === 'single' ? 1 : 2);
    var flung = (d.side === 'right') ? (d.v < -0.6) : (d.v > 0.6);
    var go = (d.p >= COMMIT_RATIO) || flung;
    var el = sheets[L];
    if(d.side === 'left') L = L + 1;          /* 先复位，再决定是否真的翻 */
    if(el){ el.style.transform = ''; el.classList.remove('turning'); }
    if(go){
      if(d.side === 'right'){
        L = Math.min(L, maxLeaf());
        var cur = sheets[L];
        if(cur){ cur.classList.add('turning'); cur.classList.add('flipped'); }
        apply();
        setTimeout(function(){ if(cur) cur.classList.remove('turning'); }, 820);
      } else {
        prev();
      }
    } else {
      apply();
    }
  }

  var stageEl = document.getElementById('stage') || reader;
  stageEl.addEventListener('pointerdown', begin);
  window.addEventListener('pointermove', move, {passive:true});
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
  /* 拖拽刚结束时抑制一次点击翻页，避免「拖完又跳一页」 */
  stageEl.addEventListener('click', function(e){
    if(Date.now() - lastDragEndAt < 320){ e.stopPropagation(); e.preventDefault(); }
  }, true);
}
var lastDragEndAt = 0;

function share(){
  var url = location.origin + location.pathname + '#p=' + (Math.min(focusPage(), N-1) + 1);
  var done = function(){ toast('本页链接已复制，对方打开即到第 ' + (Math.min(focusPage(), N-1) + 1) + ' 页'); };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(done, function(){ legacyCopy(url, done); });
  } else { legacyCopy(url, done); }
}
function legacyCopy(t, cb){
  var ta = document.createElement('textarea');
  ta.value = t; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); cb(); }catch(e){ toast('请手动复制：'+t); }
  document.body.removeChild(ta);
}
var toastT;
function toast(msg){
  var el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(function(){ el.classList.remove('on'); }, 2200);
}