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
