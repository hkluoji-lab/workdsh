import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Theme tokens are declared, not compiled: `var(--dsw-unknown)` keeps the
// declaration but the computed-value stage drops it, and a hardcoded fallback
// would silently paint the wrong colour instead of failing. Eight such names
// shipped unnoticed until 2026-09-24, so this probe guards both halves of the
// contract:
//
//   1. Static: every `var(--dsw-*)` name in `packages/` must belong to the
//      vocabulary of the installed `@deepseek-ai/dsh-client-ui-theme` and be
//      declared by its base rules — that is what allows every reference to stay
//      fallback-free. Palette values are read from that same package: the
//      official release is the single source of truth, not a copy in this repo.
//   2. Live: the Preview runtime is switched light -> dark -> original through
//      the official `ui-theme` settings Remote, and the tokens plus one
//      WorkDSH panel are read back with `getComputedStyle`. This is the only
//      check that proves the vocabulary is actually projected (the official
//      presenter applies `body[data-ds-dark-theme]` and the static stylesheet).
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const previewHome = resolve(process.env.WORKDSH_PREVIEW_HOME ?? join(root, '.test-runtime/preview'));
const profile = resolve(previewHome, 'profiles/preview');
const artifacts = join(root, '.artifacts/theme');
mkdirSync(artifacts, { recursive: true });

// ── static: official vocabulary and palette ─────────────────────────────────
const pinned = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).pnpm?.overrides?.['@deepseek-ai/dsh-client-ui-theme'];
assert.equal(typeof pinned, 'string', 'Missing pinned @deepseek-ai/dsh-client-ui-theme version in package.json pnpm.overrides.');
const themeDir = join(previewHome, 'profiles/preview/node_modules/@deepseek-ai/dsh-client-ui-theme');
const themeVersion = JSON.parse(readFileSync(join(themeDir, 'package.json'), 'utf8')).version;
assert.equal(themeVersion, pinned, 'Installed Preview theme package is not the pinned version. Run corepack pnpm preview:install first.');
const themeClient = readFileSync(join(themeDir, 'lib/client.js'), 'utf8');

const vocabulary = new Set(themeClient.match(/--dsw-[a-zA-Z0-9-]+/g) ?? []);
assert.ok(vocabulary.size >= 300, `Only ${vocabulary.size} official tokens parsed from the theme package.`);

// The palette lives in CSS string literals (`body{…}` light, `body[data-ds-dark-theme]{…}` dark).
const unescape = raw => raw.replace(/\\(.)/g, (_, ch) => (ch === 'n' ? '\n' : ch === 't' ? '\t' : ch));
const lightPalette = new Map();
const darkPalette = new Map();
const sharedPalette = new Map();
for (const match of themeClient.matchAll(/"((?:[^"\\]|\\.)*)"/gs)) {
  if (!/--dsw-/.test(match[1]) || !/\{/.test(match[1])) continue;
  for (const block of unescape(match[1]).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const parts = block[1].split(',');
    const dark = parts.some(part => /data-ds-dark-theme/.test(part));
    const base = parts.some(part => /^\s*(body|:root|html)( \*)?\s*$/.test(part));
    for (const declaration of block[2].split(';')) {
      const at = declaration.indexOf(':');
      if (at < 0) continue;
      const name = declaration.slice(0, at).trim();
      if (!name.startsWith('--dsw-')) continue;
      const value = declaration.slice(at + 1).trim();
      if (dark) darkPalette.set(name, value);
      else if (base) lightPalette.set(name, value);
      else sharedPalette.set(name, value);
    }
  }
}
assert.ok(lightPalette.size >= 300 && darkPalette.size >= 150, `Palette parse failed: light ${lightPalette.size}, dark ${darkPalette.size}.`);
const declared = (name, palette) => palette.get(name) ?? lightPalette.get(name) ?? sharedPalette.get(name) ?? darkPalette.get(name);
const resolveToken = (name, palette) => {
  let value = declared(name, palette);
  if (value === undefined) return undefined;
  for (let step = 0; step < 8; step += 1) {
    const reference = /var\((--dsw-[\w-]+)(?:,[^)]*)?\)/.exec(value);
    if (!reference) break;
    const next = declared(reference[1], palette);
    if (next === undefined) return undefined;
    value = value.replace(reference[0], next);
  }
  return value;
};

// ── static: WorkDSH sources may only reference that vocabulary ───────────────
const sourceRoot = join(root, 'packages');
const extensions = /\.(?:ts|tsx|mts|js|jsx|mjs|cjs|css)$/;
const skip = new Set(['node_modules', 'dist', 'coverage']);
const files = [];
const walk = directory => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skip.has(entry.name)) walk(join(directory, entry.name));
    } else if (extensions.test(entry.name)) files.push(join(directory, entry.name));
  }
};
walk(sourceRoot);

const unknown = [];
const undeclared = [];
let references = 0;
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/var\((--dsw-[a-zA-Z0-9-]+)/g)) {
      references += 1;
      const where = { file: relative(root, file), line: index + 1, name: match[1] };
      if (!vocabulary.has(match[1])) unknown.push(where);
      // The dark block only overrides what a base selector declares, so a bare
      // `var()` needs a base declaration to survive in both schemes. A fallback
      // would otherwise hide the miss behind a stale prototype colour.
      else if (!lightPalette.has(match[1])) undeclared.push(where);
    }
  });
}
const format = rows => rows.map(row => `  ${row.file}:${row.line} ${row.name}`).join('\n');
assert.equal(unknown.length, 0, `Tokens outside the official ${themeVersion} vocabulary:\n${format(unknown)}`);
assert.equal(undeclared.length, 0, `Tokens with no base declaration in ${themeVersion} (bare var() would be dropped):\n${format(undeclared)}`);

// ── live: boot the installed Preview Profile like scripts/start-preview.mjs ──
const expected = JSON.parse(readFileSync(join(root, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8')).version;
const installed = JSON.parse(readFileSync(join(profile, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8'));
assert.equal(installed.version, expected, 'Preview runtime is out of date. Run corepack pnpm preview:install first.');
const profileRequire = createRequire(join(profile, 'package.json'));
const bootFor = consumer => createRequire(profileRequire.resolve(`${consumer}/package.json`)).resolve('@deepseek-ai/dsh-app-boot');
assert.equal(bootFor('@deepseek-ai/dsh'), bootFor('@deepseek-ai/dsh-config-editor'), 'Preview runtime has split settings dependencies. Run corepack pnpm preview:install first.');

// Automated probes run on a throwaway Agents home so user skills cannot decide the outcome.
const agentsHome = mkdtempSync(join(root, '.test-runtime/theme-agents-'));
let log = '';
const child = spawn(process.execPath, [`--max-old-space-size=${process.env.WORKDSH_PREVIEW_HEAP_MB ?? '8192'}`, join(profile, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', 'preview', '--host', '127.0.0.1', '--port', '0', '--no-open'], {
  cwd: root,
  env: { ...process.env, DSH_HOME: previewHome, DSH_AGENTS_HOME: agentsHome },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', chunk => { log += chunk; });
child.stderr.on('data', chunk => { log += chunk; });
const until = async (predicate, label) => {
  const deadline = Date.now() + 180_000;
  while (!predicate()) {
    if (child.exitCode !== null) throw new Error(`Preview exited before ${label}: ${log}`);
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}: ${log}`);
    await new Promise(wait => setTimeout(wait, 250));
  }
};
const stop = async () => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise(done => child.once('close', done));
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
  await closed;
  clearTimeout(timer);
};

// Palette values are declared as hex, computed styles come back as rgb(a).
const toRgba = text => {
  const value = String(text ?? '').trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(value);
  if (hex) {
    const digits = hex[1].length <= 4
      ? [...hex[1]].map(digit => digit + digit).join('')
      : hex[1];
    if (digits.length !== 6 && digits.length !== 8) return null;
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
      a: digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1,
    };
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(value);
  if (fn) {
    const parts = fn[1].split(/[,\s/]+/).filter(Boolean).map(Number.parseFloat);
    if (parts.length < 3) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }
  return null;
};
const sameColor = (left, right) => {
  const a = toRgba(left);
  const b = toRgba(right);
  if (!a || !b) return false;
  return a.r === b.r && a.g === b.g && a.b === b.b && Math.abs(a.a - b.a) <= 0.002;
};

// One representative per surface family our components actually consume.
const sampled = [
  '--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-layer-3',
  '--dsw-alias-bg-module-platform', '--dsw-specific-sidebar-fill',
  '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-label-tertiary', '--dsw-alias-label-caption',
  '--dsw-alias-border-l1', '--dsw-alias-border-l2',
  '--dsw-alias-interactive-bg-hover', '--dsw-alias-interactive-bg-active',
  '--dsw-alias-state-error-primary', '--dsw-alias-state-warn-tertiary', '--dsw-alias-state-business-primary', '--dsw-alias-state-business-tertiary',
  '--dsw-alias-bg-mask-1',
];

let browser;
try {
  await until(() => /http:\/\/127\.0\.0\.1:\d+\/\?token=/.test(log), 'the local bootstrap URL');
  const loginUrl = log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)[0];
  const address = new URL(loginUrl).origin;
  const login = await fetch(loginUrl, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.ok(cookie, 'bootstrap sets an authenticated session cookie');

  const call = async (method, args) => {
    const response = await fetch(`${address}/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args } }),
      signal: AbortSignal.timeout(30_000),
    });
    assert.equal(response.status, 200, `${method} answered ${response.status}`);
    const payload = await response.json();
    assert.equal(payload.result?.ok, true, `${method} failed: ${JSON.stringify(payload)}`);
    return payload.result.value;
  };
  const describe = await call('settings/describe', {});
  const namespace = describe.namespaces.find(entry => entry.ns === 'ui-theme');
  assert.ok(namespace, `ui-theme namespace missing: ${JSON.stringify(describe.namespaces.map(entry => entry.ns))}`);
  const original = namespace.user?.preference ?? 'system';
  const setPreference = async value => {
    const receipt = await call('settings/mutate', { ns: 'ui-theme', ops: [{ op: 'set', path: ['preference'], value }], expectedRevision: undefined });
    assert.equal(receipt.value.preference, value, `the receipt did not carry the written preference: ${JSON.stringify(receipt)}`);
    assert.match(receipt.applies, /^live$/, 'the receipt must report a live apply');
  };

  browser = await chromium.launch({ headless: true });
  // `system` must resolve to a fixed scheme, or a light measurement could pass by accident.
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.context().addCookies(cookie.split('; ').map(pair => {
    const at = pair.indexOf('=');
    return { name: pair.slice(0, at), value: pair.slice(at + 1), url: address };
  }));
  await page.addInitScript(names => { window.__THEME_TOKENS = names; }, sampled);

  await setPreference('light');
  await page.goto(`${address}/?workdsh-view=projects`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.wd-projects', { state: 'visible', timeout: 90_000 });

  const read = async () => {
    await page.waitForTimeout(400);
    return page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const panel = document.querySelector('.wd-projects');
      const panelStyle = panel ? getComputedStyle(panel) : null;
      return {
        darkAttribute: document.body.hasAttribute('data-ds-dark-theme'),
        themeSource: document.documentElement.getAttribute('data-ds-theme-source'),
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
        tokens: Object.fromEntries(window.__THEME_TOKENS.map(name => [name, body.getPropertyValue(name).trim()])),
        panel: panelStyle ? { background: panelStyle.backgroundColor, color: panelStyle.color } : null,
      };
    });
  };
  const check = async (scheme, preference) => {
    const facts = await read();
    assert.equal(facts.darkAttribute, scheme === 'dark', `${scheme}: body[data-ds-dark-theme] is ${facts.darkAttribute}`);
    assert.equal(facts.colorScheme, scheme, `${scheme}: html color-scheme is ${facts.colorScheme}`);
    assert.equal(facts.themeSource, preference === 'system' ? 'system' : scheme, `${scheme}: data-ds-theme-source is ${facts.themeSource}`);
    const palette = scheme === 'dark' ? darkPalette : lightPalette;
    for (const name of sampled) {
      const expected = resolveToken(name, palette);
      assert.ok(expected !== undefined, `${name} is not declared by the official ${scheme} palette`);
      assert.ok(sameColor(facts.tokens[name], expected), `${scheme}: ${name} computed "${facts.tokens[name]}", palette declares "${expected}"`);
    }
    assert.ok(facts.panel, `${scheme}: the projects panel did not render`);
    assert.ok(sameColor(facts.panel.background, resolveToken('--dsw-alias-bg-base', palette)), `${scheme}: projects panel background "${facts.panel.background}" is not --dsw-alias-bg-base`);
    assert.ok(sameColor(facts.panel.color, resolveToken('--dsw-alias-label-secondary', palette)), `${scheme}: projects panel colour "${facts.panel.color}" is not --dsw-alias-label-secondary`);
    return facts;
  };

  const light = await check('light', 'light');
  await setPreference('dark');
  await page.waitForFunction(() => document.body.hasAttribute('data-ds-dark-theme'), null, { timeout: 30_000 });
  const dark = await check('dark', 'dark');
  assert.notEqual(light.panel.background, dark.panel.background, 'the projects panel did not repaint between themes');

  await setPreference(original);
  const resolved = original === 'light' ? 'light' : 'dark';
  await page.waitForFunction(scheme => document.body.hasAttribute('data-ds-dark-theme') === (scheme === 'dark'), resolved, { timeout: 30_000 });
  const restored = await check(resolved, original);
  assert.equal(restored.panel.background, (resolved === 'dark' ? dark : light).panel.background, 'the restored theme did not return the original panel colour');
  assert.deepEqual(pageErrors, [], `page errors during the round trip: ${pageErrors.join(' | ')}`);

  writeFileSync(join(artifacts, 'result.json'), `${JSON.stringify({
    themeVersion, vocabulary: vocabulary.size, scannedFiles: files.length, references, unknown: unknown.length, undeclared: undeclared.length,
    original, light, dark, restored,
  }, null, 2)}\n`);
  console.log(`Static: ${references} fallback-free var(--dsw-*) references across ${files.length} files, all declared by the ${themeVersion} palette (${vocabulary.size} names, ${lightPalette.size} base declarations).`);
  console.log(`Live: ui-theme.preference light -> dark -> ${original}; body[data-ds-dark-theme], html color-scheme and ${sampled.length} token values match the official palette in both schemes.`);
  console.log(`Receipt written to .artifacts/theme/result.json.`);
} finally {
  await browser?.close();
  await stop();
}
