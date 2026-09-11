import { chromium, expect } from '@playwright/test';

/** Real Chromium + official Web boot. No injected Context or simulated Remote. */
export async function probeBrowser(address, sessionCookie, screenshotPath, { installed = true } = {}) {
  const browser = await chromium.launch({ headless: true });
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const sockets = [];
    await page.routeWebSocket('**/*', socket => {
      const upstream = socket.connectToServer();
      const connection = { socket, upstream, received: 0, sent: 0 };
      sockets.push(connection);
      socket.onMessage(message => { connection.sent++; upstream.send(message); });
      upstream.onMessage(message => { connection.received++; socket.send(message); });
    });
    await page.context().addCookies(sessionCookie.split('; ').filter(Boolean).map(pair => {
      const at = pair.indexOf('=');
      return { name: pair.slice(0, at), value: pair.slice(at + 1), url: address, httpOnly: true, sameSite: 'Strict' };
    }));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') console.error(message.text().replace(/token=[^\s]+/g, 'token=[redacted]')); });

    await page.goto(`${address}/?diagnostics=1`, { waitUntil: 'domcontentloaded' });
    const notice = page.getByRole('button', { name: 'Continue', exact: true });
    await notice.waitFor({ state: 'visible', timeout: 10000 }).then(() => notice.click()).catch(() => {});
    const later = page.getByRole('button', { name: 'Configure later', exact: true });
    await later.waitFor({ state: 'visible', timeout: 5000 }).then(() => later.click()).catch(() => {});
    const graphRows = await page.evaluate(() => window.__DSH_BOOT__?.entries?.filter(row => row.id === 'workdsh-bundle'));
    const nav = page.getByRole('button', { name: 'WorkDSH 接入验证', exact: true });
    expect(graphRows).toHaveLength(installed ? 1 : 0);
    if (!installed) {
      await expect(page.getByText(/新会话|New Session/, { exact: true }).first()).toBeVisible({ timeout: 30000 });
      await expect(nav).toHaveCount(0);
      await expect(page.getByTestId('workdsh-brand')).toHaveCount(0);
      await expect(page.getByTestId('workdsh-probe')).toHaveCount(0);
      if (errors.length) throw new Error(`Browser reported ${errors.length} uncaught errors after removal`);
      console.log('PASS: removed bundle absent from Client boot graph, sidebar, and panel after Host restart');
      return;
    }

    // Harness stays the sole Sidebar owner; WorkDSH contributes only public slots.
    await expect(page.getByTestId('workdsh-brand')).toHaveText('WorkDSH', { timeout: 30000 });
    await expect(page.getByTestId('workdsh-sidebar')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '专家 · 技能 · 连接器', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '返回 WorkDSH', exact: true })).toHaveCount(0);
    const newSession = page.getByText(/新会话|New Session/, { exact: true }).first();
    await expect(newSession).toBeVisible();
    for (const label of ['助理', '项目', '专家 · 技能 · 连接器', '定时任务', '资料库', '更多']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    await expect(nav).toBeVisible();

    // The probe profile may be empty, so check native menus when rows exist.
    const workspaceActions = page.getByRole('button', { name: /工作区“.+”的操作|Workspace actions for/ }).first();
    if (await workspaceActions.isVisible().catch(() => false)) {
      await workspaceActions.click();
      await expect(page.getByText(/重命名|Rename/, { exact: true })).toBeVisible();
      await expect(page.getByText(/删除工作区|Delete workspace/, { exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
    }
    const sessionActions = page.getByRole('button', { name: /会话“.+”的操作|Session actions for/ }).first();
    if (await sessionActions.isVisible().catch(() => false)) {
      await sessionActions.click();
      await expect(page.getByText(/重命名|Rename/, { exact: true })).toBeVisible();
      await expect(page.getByText(/分叉会话|Fork session/, { exact: true })).toBeVisible();
      await expect(page.getByText(/归档会话|Archive session/, { exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
    }

    await newSession.click();
    await expect.poll(() => new URL(page.url()).searchParams.get('workdsh-view')).toBe('conversation');
    await expect(page.getByText(/探索未至之境|Into the Unknown/, { exact: true }).first()).toBeVisible();

    await page.goto(`${address}/?diagnostics=1&workdsh-view=skills`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('workdsh-skills')).toBeVisible();
    await expect(page.getByRole('heading', { name: '技能库', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: '选择任务' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '专家 · 技能 · 连接器', exact: true })).toBeVisible();
    await expect(page.getByText('SkillHub', { exact: true })).toHaveCount(0);
    await expect(page.getByText('套件', { exact: true })).toHaveCount(0);
    await later.waitFor({ state: 'visible', timeout: 3000 }).then(() => later.click()).catch(() => {});
    const addSkill = page.getByRole('button', { name: '＋ 添加技能', exact: true });
    await expect(addSkill).toBeEnabled();
    await expect(page.getByRole('status', { name: /已安装 \d+ 个技能/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /我安装的/ })).toHaveCount(0);
    for (const label of ['办公协同', '开发工具', '数据分析', '内容创作', '知识学习']) await expect(page.getByRole('button', { name: label, exact: true })).toBeDisabled();
    await expect(page.locator('body')).toHaveAttribute('data-ds-dark-theme');
    for (const width of [1440, 1920, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: screenshotPath.replace('.png', `-skills-${width}.png`), fullPage: true });
      if (width >= 900) expect(await page.getByTestId('workdsh-skills').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: '查看技能 workdsh-browser-fixture', exact: true }).click();
    await expect(page.getByTestId('skill-detail')).toBeVisible();
    await expect.poll(() => page.getByTestId('workdsh-skills').evaluate(element => element.scrollTop)).toBe(0);
    await expect(page.getByRole('heading', { name: 'workdsh-browser-fixture', exact: true })).toBeVisible();
    await expect(page.getByText('/workdsh-browser-fixture', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'SKILL.md', exact: true });
    await expect(editor).toHaveValue(/浏览器验收技能/);
    await editor.fill('---\nname: workdsh-browser-fixture\ndescription: 浏览器验收技能，已通过直接编辑保存。\n---\nDIRECT MANAGEMENT SAVED\n');
    await page.getByRole('button', { name: '保存并重新发现', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByText('DIRECT MANAGEMENT SAVED', { exact: false })).toBeVisible();
    await page.getByRole('textbox', { name: '新资源路径', exact: true }).fill('references/browser-check.md');
    await page.getByRole('button', { name: '新建资源', exact: true }).click();
    const resourceEditor = page.getByRole('textbox', { name: '资源文件', exact: true });
    await resourceEditor.fill('# Browser resource\n\nSaved through the SkillManager.\n');
    await page.getByRole('button', { name: '保存资源', exact: true }).click();
    await page.getByRole('button', { name: '返回概述', exact: true }).click();
    await expect(page.getByRole('button', { name: 'references/browser-check.md', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.getByRole('heading', { name: '技能库', exact: true })).toBeVisible();
    await page.getByRole('switch', { name: '停用技能 workdsh-browser-fixture', exact: true }).click();
    await expect(page.getByRole('switch', { name: '启用技能 workdsh-browser-fixture', exact: true })).toBeVisible();
    await page.getByRole('switch', { name: '启用技能 workdsh-browser-fixture', exact: true }).click();
    await expect(page.getByRole('switch', { name: '停用技能 workdsh-browser-fixture', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '查看技能 workdsh-browser-fixture', exact: true }).click();
    await page.getByRole('button', { name: '去试试', exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('workdsh-view')).toBe('conversation');
    await expect(page.getByText('/workdsh-browser-fixture', { exact: false }).first()).toBeVisible();
    await page.getByRole('button', { name: '专家 · 技能 · 连接器', exact: true }).click();
    await expect(page.getByRole('heading', { name: '技能库', exact: true })).toBeVisible();
    await addSkill.click();
    for (const label of ['查找技能', '上传技能', '创建技能']) await expect(page.getByRole('menuitem', { name: label, exact: true })).toBeVisible();
    await page.getByRole('menuitem', { name: '查找技能', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '搜索技能' })).toBeFocused();
    await addSkill.click();
    await page.getByRole('menuitem', { name: '上传技能', exact: true }).click();
    await expect(page.getByRole('heading', { name: '导入技能', exact: true })).toBeVisible();
    await page.locator('.import-skill-dialog input[accept]').setInputFiles({
      name: 'SKILL.md', mimeType: 'text/markdown',
      buffer: Buffer.from('---\nname: workdsh-import-fixture\ndescription: 浏览器导入闭环验收技能。\n---\nImported files stay inert until invoked.\n'),
    });
    await expect(page.getByTestId('skill-import-review')).toBeVisible();
    await expect(page.getByText('workdsh-import-fixture', { exact: true })).toBeVisible();
    await expect(page.getByRole('definition').filter({ hasText: 'SKILL.md' })).toBeVisible();
    await page.getByRole('button', { name: '确认安装', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'workdsh-import-fixture', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.getByRole('button', { name: '查看技能 workdsh-import-fixture', exact: true })).toBeVisible();
    await addSkill.click();
    await page.getByRole('menuitem', { name: '创建技能', exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('workdsh-view')).toBe('conversation');
    await expect(page.getByText('/skill-creator', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('请帮我创建一个可以实现「……」的 skill', { exact: false }).first()).toBeVisible();
    await page.getByRole('button', { name: '专家 · 技能 · 连接器', exact: true }).click();
    await expect(page.getByTestId('workdsh-skills')).toBeVisible();
    await expect(page.getByText('skill-creator', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: '管理技能 workdsh-browser-fixture', exact: true }).click();
    await page.getByRole('menuitem', { name: '卸载', exact: true }).click();
    await expect(page.getByRole('heading', { name: '卸载 workdsh-browser-fixture？', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '确认卸载', exact: true }).click();
    await expect(page.getByRole('button', { name: '查看技能 workdsh-browser-fixture', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '最近卸载', exact: true }).click();
    await expect(page.getByRole('heading', { name: '最近卸载', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '恢复', exact: true }).click();
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.getByRole('button', { name: '查看技能 workdsh-browser-fixture', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '管理技能 workdsh-browser-fixture', exact: true }).click();
    await page.getByRole('menuitem', { name: '卸载', exact: true }).click();
    await page.getByRole('button', { name: '确认卸载', exact: true }).click();
    await expect(page.getByRole('button', { name: '查看技能 workdsh-browser-fixture', exact: true })).toHaveCount(0);
    await nav.click();
    await expect(page.getByRole('heading', { name: '接入验证', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '读取 Host 状态', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Remote 已返回' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('workdsh-bundle · active', { exact: true })).toBeVisible();
    await page.screenshot({ path: screenshotPath, fullPage: true });

    expect(sockets.length).toBeGreaterThan(0);
    const previousConnections = sockets.length;
    for (const { socket, upstream } of [...sockets]) {
      await socket.close({ code: 1012, reason: 'WorkDSH reconnect probe' });
      await upstream.close({ code: 1012, reason: 'WorkDSH reconnect probe' });
    }
    await expect.poll(() => sockets.length, { timeout: 20000 }).toBeGreaterThan(previousConnections);
    await expect.poll(() => sockets.slice(previousConnections).some(socket => socket.received > 0), { timeout: 15000 }).toBe(true);
    await page.getByRole('button', { name: '返回 Harness 会话', exact: true }).click();
    await nav.click();
    await page.getByRole('button', { name: '读取 Host 状态', exact: true }).click();
    await expect(page.getByText('workdsh-bundle · active', { exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: '返回 Harness 会话', exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('workdsh-view')).toBe('conversation');

    const invalid = new URL(page.url());
    invalid.searchParams.set('workdsh-view', 'missing');
    await page.goto(invalid.href);
    await expect.poll(() => new URL(page.url()).searchParams.get('workdsh-view')).toBe('conversation');
    if (errors.length) throw new Error(`Browser reported ${errors.length} uncaught errors: ${errors.join('; ')}`);
    console.log('PASS: official Sidebar owns native workspace/session actions; WorkDSH contributes brand and additive panels');
    console.log('PASS: global skill library, real Remote inventory, reconnect, and route normalization');
  } catch (error) {
    if (page) {
      await page.screenshot({ path: screenshotPath.replace('.png', '-failure.png'), fullPage: true }).catch(() => {});
      console.error((await page.locator('body').innerText()).slice(0, 4000));
    }
    throw error;
  } finally {
    await browser.close();
  }
}
