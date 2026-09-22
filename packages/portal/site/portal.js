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

const form = document.querySelector('.auth-form');
if (form) {
  form.addEventListener('submit', () => {
    const submit = form.querySelector('button[type="submit"]');
    if (submit) {
      submit.disabled = true;
      submit.textContent = '登录中…';
    }
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
