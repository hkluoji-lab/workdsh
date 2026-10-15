// 门户页的最小交互：密码显示切换与提交期防重复提交。
// 无 JavaScript 时表单仍可正常提交，服务端渲染错误与回跳。
const reveal = document.querySelector('[data-portal-reveal]');
const password = document.querySelector('#password');

if (reveal && password) {
  reveal.addEventListener('click', () => {
    const hidden = password.type === 'password';
    password.type = hidden ? 'text' : 'password';
    reveal.setAttribute('aria-pressed', String(hidden));
    reveal.setAttribute('aria-label', hidden ? '隐藏密码' : '显示密码');
    reveal.textContent = hidden ? '隐藏' : '显示';
    password.focus();
  });
}

// 提交期防重复提交 + 失败自愈。只禁用不复位会留下死路：这一次提交若没能跳转（网络中断、
// 边缘 502、或页面被 bfcache 恢复），按钮会永久停在禁用态，之后怎么点都不发请求、不跳转、
// 也不报错——现场表现就是「输入账号密码点了完全没反应」。
const form = document.querySelector('.auth-form');
if (form) {
  const submit = form.querySelector('button[type="submit"]');
  const label = submit ? submit.textContent : '';
  let watchdog;

  const resetSubmit = (note) => {
    clearTimeout(watchdog);
    if (!submit) return;
    submit.disabled = false;
    submit.textContent = label;
    if (!note) return;
    // 服务端注入的 .form-error 是 form 的兄弟节点（login.html 的 {{ERROR}} 在 form 之前），
    // 所以按父级范围查找，避免同页出现两条错误提示。
    const scope = form.parentElement ?? form;
    let alert = scope.querySelector('.form-error');
    if (!alert) {
      alert = document.createElement('p');
      alert.className = 'form-error';
      alert.setAttribute('role', 'alert');
      form.insertAdjacentElement('beforebegin', alert);
    }
    alert.textContent = note;
  };

  form.addEventListener('submit', () => {
    if (!submit) return;
    submit.disabled = true;
    submit.textContent = '登录中…';
    // 12 秒仍未跳转即视为本次提交已失败，复位并给出可见提示，让用户能直接重试。
    clearTimeout(watchdog);
    watchdog = setTimeout(() => resetSubmit('网络无响应，请重试。'), 12000);
  });

  // 从 bfcache 恢复旧页面时按钮会带着「登录中…」的禁用态回来，同样复位。
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) resetSubmit();
  });
}

// 首页顶部导航的当前分区标注。只加一个类，不改锚点本身；无 JavaScript 时导航照常可用。
const navSections = new Map();
for (const link of document.querySelectorAll('.site-nav a[href^="#"]')) {
  const section = document.querySelector(link.hash);
  if (section) navSections.set(section, link);
}

if (navSections.size > 0) {
  const visible = new Set();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    }
    const active = [...navSections.keys()].find((section) => visible.has(section));
    for (const [section, link] of navSections) link.classList.toggle('is-active', section === active);
    // 判定带取视口中线（上下各让 45%），这样页面底部的最后一屏也能正确高亮。
  }, { rootMargin: '-45% 0px -45% 0px' });

  for (const section of navSections.keys()) observer.observe(section);
}

/* ---------------------------------------------------------------------------
 * 窄屏导航（2026-10-01 改版新增）
 * 改版前 900px 以下 .site-nav 直接 display:none，手机端没有任何导航入口。
 * 这里只切换一个类与 aria-expanded，锚点本身不变；无 JavaScript 时按钮无效但不报错。
 * ------------------------------------------------------------------------- */

const navToggle = document.querySelector('#navToggle');
const siteNav = document.querySelector('#site-nav');

if (navToggle && siteNav) {
  const setNavOpen = (open) => {
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
    siteNav.classList.toggle('is-open', open);
  };

  navToggle.addEventListener('click', () => {
    setNavOpen(navToggle.getAttribute('aria-expanded') !== 'true');
  });

  // 点任一链接后收起面板，否则锚点跳转到新分区时面板仍挡在内容上方。
  siteNav.addEventListener('click', (event) => {
    if (event.target.closest('a')) setNavOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setNavOpen(false);
  });

  // 拉宽回桌面档位时收起面板：否则 .is-open 会在 .site-nav 恢复常显后残留。
  const wideQuery = window.matchMedia('(min-width: 901px)');
  const onWideChange = (event) => { if (event.matches) setNavOpen(false); };
  if (typeof wideQuery.addEventListener === 'function') wideQuery.addEventListener('change', onWideChange);
  else if (typeof wideQuery.addListener === 'function') wideQuery.addListener(onWideChange);
}

/* ---------------------------------------------------------------------------
 * 合作意向表单（2026-10-01 改版新增）
 * 复用门户已有的需求单接口 /api/portal/orders：与产品页共用同一套服务端校验、
 * 10 分钟内重复提交去重与按 IP 限流（429）。这里只做客户端预校验与三态呈现，
 * 不用 innerHTML 写入任何服务端返回内容——受理编号一律走 textContent。
 * 无 JavaScript 时表单不会提交，页面已同时给出电话入口（见 .coop-direct）。
 * ------------------------------------------------------------------------- */

const coopForm = document.querySelector('#coopForm');

if (coopForm) {
  const errorBox = document.querySelector('#coopError');
  const noticeBox = document.querySelector('#coopNotice');
  const hint = document.querySelector('#coopHint');
  const submitButton = document.querySelector('#coopSubmit');
  const submitLabel = submitButton ? submitButton.textContent : '';
  // 与服务端 validateOrder 的 TEL_RE 保持一致，避免前后端判定不同导致"看起来能填却提交失败"。
  const TEL_RE = /^[0-9+\-()\s]{6,40}$/;

  const clearError = () => {
    if (!errorBox) return;
    errorBox.textContent = '';
    errorBox.hidden = true;
  };
  const showError = (message) => {
    if (noticeBox) noticeBox.hidden = true;
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.hidden = false;
  };
  const showNotice = (message) => {
    clearError();
    if (!noticeBox) return;
    noticeBox.textContent = message;
    noticeBox.hidden = false;
  };

  coopForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const elements = coopForm.elements;
    const org = elements.org.value.trim();
    const contact = elements.contact.value.trim();
    const tel = elements.tel.value.trim();
    const note = elements.note.value.trim();
    const domains = Array.from(coopForm.querySelectorAll('input[name="domains"]:checked'))
      .map((input) => input.value);

    const missing = [];
    if (!org) missing.push('单位名称');
    if (!contact) missing.push('联系人');
    if (!tel) missing.push('联系电话');
    if (domains.length === 0) missing.push('想优先解决的场景');
    if (missing.length > 0) {
      showError(`请先填写：${missing.join('、')}`);
      return;
    }
    if (!TEL_RE.test(tel)) {
      showError('联系电话格式不正确：请填 6–40 位数字，可含 + - ( ) 与空格。');
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = '提交中…';
    }

    try {
      const response = await fetch('/api/portal/orders', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ org, contact, tel, note, domains, intent: 'consult' }),
      });

      let payload = null;
      try { payload = await response.json(); } catch { payload = null; }

      if (response.ok && payload && payload.ok) {
        coopForm.reset();
        showNotice(`✓ 已收到您的合作意向（受理编号 ${String(payload.id).slice(0, 8)}）。客户经理会尽快与您联系。`);
        if (hint) hint.textContent = '如需补充信息，可直接致电 199 2529 9929。';
      } else if (response.status === 429) {
        showError('提交过于频繁，请稍后再试，或直接致电 199 2529 9929。');
      } else {
        const detail = payload && Array.isArray(payload.errors) && payload.errors.length > 0
          ? payload.errors.join('；')
          : `提交失败（HTTP ${response.status}），请稍后重试或致电 199 2529 9929。`;
        showError(detail);
      }
    } catch {
      showError('网络异常，提交失败。可致电 199 2529 9929，或稍后重试。');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = submitLabel;
      }
    }
  });
}
