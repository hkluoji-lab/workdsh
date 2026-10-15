#!/usr/bin/env node
/**
 * workdsh 兼容性巡检：检测「插件要求某个 cordis 服务，但已安装的包无一提供」。
 *
 * 为什么需要它：
 *   2026-10-15 的故障正是这一类——dsh-mcp-connector / dsh-dream-skin 用
 *   inject(['webServer','webRuntime']) 挂载 web 路由，而 DSH 从 0.1.7-rc.2 升到
 *   0.2.1-alpha.2 时移除了 webRuntime 服务。cordis 的 inject 要求列表内全部服务就绪，
 *   于是回调永不触发、路由静默消失，用户只看到一句与真实原因无关的报错。
 *   这类断点在升级后没有任何显式提示，必须靠静态比对发现。
 *
 * 判定方式：
 *   providers = 已安装包中「提供服务」的声明：
 *       super(ctx, "NAME")        cordis Service 子类
 *       ctx.provide("NAME", ...)  显式 provide
 *       ctx.set("NAME", ...)      非服务方式注册
 *   requirers = 已加载插件中「需要服务」的声明：
 *       export const inject = [...]       模块级 inject
 *       ctx.inject([...], ...)            运行时 inject（要求全部就绪）
 *       cordis.patch.yml 行内的 inject: [...]
 *   报告 requirers − providers 的差集。
 *
 * 用法：
 *   node workdsh-compat-scan.mjs [--profile DIR] [--core DIR]... [--json] [--verbose]
 * 退出码：0 = 未发现缺口；1 = 发现缺口；2 = 用法/环境错误
 *
 * 精度说明（重要）：
 *   这是**静态启发式**扫描，不是运行时真值。
 *   - 服务名由字符串字面量构造（变量拼接）时无法识别，可能漏报；
 *   - 部分包会把服务名集中定义在常量里（如 const S = "webRuntime"），
 *     本脚本会额外扫描 `const NAME = "..."` 形式的常量并纳入 providers/requirers；
 *   - 因此 **exit 1 需要人工确认**，exit 0 也不能证明绝对无问题。
 *   权威判据仍应以 DSH 运行时的 inactive entries 为准。
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = { profile: '/data/dsh/profiles/web', cores: [], json: false, verbose: false, strict: false };
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === '--profile') opt.profile = argv[++i];
  else if (a === '--core') opt.cores.push(argv[++i]);
  else if (a === '--json') opt.json = true;
  else if (a === '--verbose') opt.verbose = true;
  else if (a === '--strict') opt.strict = true;
  else if (a === '-h' || a === '--help') {
    console.log('用法: node workdsh-compat-scan.mjs [--profile DIR] [--core DIR]... [--json] [--verbose]');
    process.exit(0);
  } else {
    console.error(`未知参数: ${a}`);
    process.exit(2);
  }
}
if (opt.cores.length === 0) opt.cores.push('/usr/local/lib/node_modules/@deepseek-ai/dsh');

const norm = (p) => path.resolve(p);
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };

/* ───────────── 扫描工具 ───────────── */

// 注意：不要跳过 `types/` —— 部分核心包的 lib/types/*.js 是真实运行时文件
// （例如 @deepseek-ai/dsh-settings/lib/types/{redact,schema,types}.js）。
// 类型声明文件（*.d.ts）由扩展名过滤自然排除。
const SKIP_DIRS = new Set(['node_modules', '.git', '__tests__', 'test', 'tests', 'coverage']);

/** 递归收集 .js / .mjs / .cjs 文件（不含 .d.ts，类型声明不代表运行时提供）。 */
function collectJs(dir, out = [], depth = 0) {
  if (depth > 8 || !exists(dir)) return out;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collectJs(full, out, depth + 1);
    else if (/\.(mjs|cjs|js)$/.test(e.name)) out.push(full);
  }
  return out;
}

/** 匹配 `... ( ctx , "NAME"` 之类的首个字符串实参，用在 super/provide/set 之外的地方。 */
function collectStringLiterals(src, regex, groupMaps = (m) => m[1]) {
  const set = new Set();
  let m;
  regex.lastIndex = 0;
  while ((m = regex.exec(src)) !== null) {
    const v = groupMaps(m);
    if (typeof v === 'string' && v.length > 0) set.add(v);
  }
  return set;
}

/** 从 `[ ... ]` 文本里取出字符串字面量（兼容单/双引号与跨行）。 */
function literalsInArray(text) {
  const out = [];
  const re = /["']([^"'\n]+)["']/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

/** 从 `keyword` 后第一个 `[` 起，做括号匹配，返回数组文本。 */
function arrayAfter(src, startIdx) {
  const open = src.indexOf('[', startIdx);
  if (open < 0) return undefined;
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const c = src[i];
    if (c === '[') depth += 1;
    else if (c === ']') {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    } else if (c === '"' || c === "'") {
      // 跳过字符串，避免其中的 [ ] 干扰
      const quote = c;
      i += 1;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i += 1;
        i += 1;
      }
    }
  }
  return undefined;
}

/** 找出 `const NAME = "value"` / `const NAME = 'value'` 形式的常量映射。 */
function constStringMap(src) {
  const map = new Map();
  const re = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*["']([^"'\n]+)["']\s*;/g;
  let m;
  while ((m = re.exec(src)) !== null) if (!map.has(m[1])) map.set(m[1], m[2]);
  return map;
}

/** 把数组文本解析为「字面量 + 已知常量」的服务名列表。 */
function servicesFromArrayText(text, consts) {
  const out = [];
  const re = /["']([^"'\n]+)["']|\b([A-Za-z_$][\w$]*)\b/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1] !== undefined) { out.push(m[1]); continue; }
    const name = m[2];
    if (name && consts.has(name)) out.push(consts.get(name));
  }
  return out;
}

function lineOf(src, idx) {
  return src.slice(0, idx).split('\n').length;
}

/* ───────────── providers ───────────── */

const providers = new Map(); // service -> [{file, line, kind}]

function addProvider(name, file, line, kind) {
  if (!name || name.length > 64) return;
  if (!providers.has(name)) providers.set(name, []);
  providers.get(name).push({ file, line, kind });
}

function scanProviderFile(file) {
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch { return; }
  // 快速跳过明显无关的文件
  if (!/\bsuper\(/.test(src) && !/\.provide\(/.test(src) && !/\.set\(/.test(src)) return;
  const consts = constStringMap(src);

  // super(<ident>, "NAME") —— 首参是任意标识符（ctx / ownerContext / …），不能写死成 ctx。
  // 例：@deepseek-ai/dsh-settings 用的是 super(ownerContext, "settings")。
  const superRe = /\bsuper\(\s*[A-Za-z_$][\w$]*\s*,\s*(?:(["'])([^"'\n]+)\1|([A-Za-z_$][\w$]*))/g;
  {
    let m;
    while ((m = superRe.exec(src)) !== null) {
      const name = m[2] ?? consts.get(m[3]);
      if (name) addProvider(name, file, lineOf(src, m.index), 'Service super(<ctx>, …)');
    }
  }

  // 只接受「上下文对象」上的 provide/set，避免把 Map/Set 的 .set("key", …) 误当服务。
  // provide 额外允许一层属性跳转：ctx.reflect.provide("sidebarRight", …) 是真实写法。
  const CTX = String.raw`(?:\bctx\b|\bwctx\b|ownerContext|[A-Za-z_$][\w$]*(?:Context|Ctx)|this\.ctx)`;
  for (const [re, kind] of [
    [
      new RegExp(
        `${CTX}(?:\\s*\\.\\s*[A-Za-z_$][\\w$]*)?\\s*\\.\\s*provide\\(\\s*(?:(["'])([^"'\\n]+)\\1|([A-Za-z_$][\\w$]*))`,
        'g',
      ),
      'ctx[.reflect].provide(…)',
    ],
    [
      new RegExp(`${CTX}\\s*\\.\\s*set\\(\\s*(?:(["'])([^"'\\n]+)\\1|([A-Za-z_$][\\w$]*))`, 'g'),
      'ctx.set(…)',
    ],
  ]) {
    let m;
    while ((m = re.exec(src)) !== null) {
      const name = m[2] ?? consts.get(m[3]);
      if (name) addProvider(name, file, lineOf(src, m.index), kind);
    }
  }
}

/* ───────────── requirers ───────────── */

const requirers = new Map(); // service -> [{plugin, file, line, kind}]

function addRequirer(name, plugin, file, line, kind) {
  if (!name) return;
  if (!requirers.has(name)) requirers.set(name, []);
  requirers.get(name).push({ plugin, file, line, kind });
}

function scanRequirerFile(file, plugin) {
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch { return; }
  const consts = constStringMap(src);

  // 赋值式 inject：export const inject = [...] / static inject = [...] / 类字段 inject = [...]
  const fieldRe = /\binject\s*=\s*\[/g;
  let m;
  while ((m = fieldRe.exec(src)) !== null) {
    const before = src.slice(Math.max(0, m.index - 32), m.index);
    if (/\.\s*$/.test(before)) continue; // 排除 `x.inject = [` 这类属性写法
    const arrText = arrayAfter(src, m.index + m[0].length - 1);
    if (arrText === undefined) continue;
    const kind = /export\s+const\s+$/.test(before)
      ? 'export const inject'
      : /static\s+$/.test(before) ? 'static inject' : 'inject 字段';
    for (const s of servicesFromArrayText(arrText, consts)) {
      addRequirer(s, plugin, file, lineOf(src, m.index), kind);
    }
  }

  // 运行时 inject：接收者必须是「上下文对象」，且实参必须以 `[` 开头。
  // 这样可排除 ctx.slots.inject("name", …) 与 captain.inject(createUserMessage(…))
  // 这类同一方法名但语义无关的调用（它们曾造成严重误报）。
  const CTX_RECV = String.raw`(?:\bctx\b|\bwctx\b|[A-Za-z_$][\w$]*(?:Context|Ctx)|this\.ctx)`;
  const injRe = new RegExp(`${CTX_RECV}\\s*\\.\\s*inject\\s*\\(\\s*\\[`, 'g');
  while ((m = injRe.exec(src)) !== null) {
    const arrText = arrayAfter(src, m.index + m[0].length - 1);
    if (arrText === undefined) continue;
    for (const s of servicesFromArrayText(arrText, consts)) {
      addRequirer(s, plugin, file, lineOf(src, m.index), 'ctx.inject');
    }
  }
}

/** cordis.patch.yml 行内 `inject: [a, b]` */
function scanPatchYml(file, plugin) {
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch { return; }
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    const m = /^\s*inject:\s*\[(.*)\]\s*$/.exec(line);
    if (!m) return;
    for (const s of literalsInArray(m[1])) {
      addRequirer(s, plugin, file, i + 1, 'cordis.patch.yml inject');
    }
  });
}

/* ───────────── 解析 profile 的已加载插件 ───────────── */

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return undefined; }
}

function entryFilesOf(pkgDir) {
  const pj = readJson(path.join(pkgDir, 'package.json'));
  const out = new Set();
  if (!pj) return [];
  const add = (rel) => { if (typeof rel === 'string' && rel) out.add(path.join(pkgDir, rel)); };
  add(pj.main);
  const exp = pj.exports;
  if (typeof exp === 'string') add(exp);
  else if (exp && typeof exp === 'object') {
    const dot = exp['.'] ?? exp;
    if (typeof dot === 'string') add(dot);
    else if (dot && typeof dot === 'object') {
      add(dot.import); add(dot.require); add(dot.default);
    }
  }
  if (out.size === 0 && exists(path.join(pkgDir, 'lib/index.js'))) out.add(path.join(pkgDir, 'lib/index.js'));
  return [...out];
}

function pluginDirsOf(profileDir) {
  const pj = readJson(path.join(profileDir, 'package.json'));
  const names = new Set();
  for (const n of Object.keys(pj?.dependencies ?? {})) names.add(n);
  for (const n of (pj?.dsh?.profile?.bundles ?? [])) names.add(n);
  const dirs = [];
  for (const n of names) {
    const d = path.join(profileDir, 'node_modules', n);
    if (exists(d)) dirs.push({ name: n, dir: d });
  }
  return dirs;
}

/* ───────────── 主流程 ───────────── */

const profileDir = norm(opt.profile);
if (!exists(profileDir)) {
  console.error(`profile 目录不存在: ${profileDir}`);
  process.exit(2);
}

// 1) providers：来自所有 @deepseek-ai 核心包（profile 内 + 全局根）
const coreRoots = [
  path.join(profileDir, 'node_modules/@deepseek-ai'),
  ...opt.cores.map((c) => (c.endsWith('@deepseek-ai') ? c : path.join(c, 'node_modules/@deepseek-ai'))),
].filter(exists);

let coreFiles = 0;
for (const root of coreRoots) {
  let pkgs;
  try { pkgs = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
  for (const p of pkgs) {
    if (!p.isDirectory()) continue;
    // 必须扫描整个包目录，不能只看 lib/ —— 部分包的服务提供点在 dist/
    // （例：workdsh-plugin-access 的 super(ctx, 'workdshAccess') 在 dist/index.js）。
    for (const f of collectJs(path.join(root, p.name))) {
      scanProviderFile(f);
      coreFiles += 1;
    }
  }
}
// 也把非 @deepseek-ai 的已安装包视为潜在 provider（有些插件互相提供服务）
const nm = path.join(profileDir, 'node_modules');
for (const d of pluginDirsOf(profileDir)) {
  for (const f of collectJs(d.dir)) scanProviderFile(f);
}

// 2) requirers：来自 profile 声明的已加载插件
const plugins = pluginDirsOf(profileDir);
for (const { name, dir } of plugins) {
  for (const f of entryFilesOf(dir)) scanRequirerFile(f, name);
  // 插件目录内其它模块也可能 ctx.inject（含 dist/ 等非 lib/ 目录）
  for (const f of collectJs(dir)) scanRequirerFile(f, name);
  const patch = path.join(dir, 'cordis.patch.yml');
  if (exists(patch)) scanPatchYml(patch, name);
}
// profile 自己的补丁层
const profilePatch = path.join(profileDir, 'cordis.patch.yml');
if (exists(profilePatch)) scanPatchYml(profilePatch, '<profile>');

// 3) 差集 + 分类
//    server    : 服务端文件要求但无人提供 —— 最可能就是「上游移除服务导致插件静默失效」
//    client    : 仅客户端 bundle 要求 —— 服务由浏览器侧运行时提供，服务端静态扫描不可判定
//    namespace : 形如 remote.session 的 RPC 通道命名空间，不是 cordis 服务
//    framework : cordis 框架原生服务（loader 等），不由任何包 provide
//    desktop   : 仅在 hostCtx/桌面专用上下文里 inject（如 desktopPnpm），web 部署缺失属设计如此
const FRAMEWORK_SERVICES = new Set(['loader', 'ctx', 'root', 'fiber', 'registry', 'reflect', 'logger']);
const DESKTOP_SERVICES = /^(desktop|electron)/;
const isClientFile = (f) => /[\\/]client[\\/]|[\\/]client\.[cm]?js$/.test(f);

const missing = [];
for (const [service, reqs] of requirers) {
  if (providers.has(service)) continue;
  const dedup = new Map();
  for (const r of reqs) dedup.set(`${r.plugin}|${r.file}|${r.line}`, r);
  const list = [...dedup.values()];
  let kind;
  if (FRAMEWORK_SERVICES.has(service)) kind = 'framework';
  else if (service.includes('.')) kind = 'namespace';
  else if (DESKTOP_SERVICES.test(service)) kind = 'desktop';
  else if (list.every((r) => isClientFile(r.file))) kind = 'client';
  else kind = 'server';
  missing.push({ service, kind, requirers: list });
}

const ORDER = { server: 0, desktop: 1, client: 2, namespace: 3, framework: 4 };
const LABEL = {
  server: '服务端缺口（需人工确认，最可能是上游移除服务）',
  desktop: '桌面专用服务（web 部署下缺失属设计如此）',
  client: '客户端服务（浏览器侧提供，服务端静态扫描不可判定）',
  namespace: 'RPC 通道命名空间（非 cordis 服务）',
  framework: 'cordis 框架原生服务',
};
missing.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.service.localeCompare(b.service));
const serverGaps = missing.filter((m) => m.kind === 'server');

const result = {
  profile: profileDir,
  coreRoots,
  stats: {
    coreFilesScanned: coreFiles,
    pluginsScanned: plugins.length,
    servicesProvided: providers.size,
    servicesRequired: requirers.size,
  },
  serverGaps: serverGaps.map((m) => m.service),
  missing,
};

function printGap(m, indent = '  ') {
  console.log(`${indent}● ${m.service}`);
  for (const r of m.requirers) {
    console.log(`${indent}    ${r.plugin}  [${r.kind}]  ${path.relative(profileDir, r.file)}:${r.line}`);
  }
}

if (opt.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('workdsh 兼容性巡检（cordis 服务 provider/requirer 静态比对）');
  console.log(`  profile      : ${profileDir}`);
  console.log(`  coreRoots    : ${coreRoots.join(', ')}`);
  console.log(`  核心文件扫描 : ${coreFiles} 个`);
  console.log(`  已加载插件   : ${plugins.length} 个`);
  console.log(`  服务提供者   : ${providers.size} 个`);
  console.log(`  服务需求者   : ${requirers.size} 个`);
  console.log('');

  if (serverGaps.length === 0) {
    console.log('✅ 未发现**服务端**服务缺口。');
  } else {
    console.log(`⚠️  发现 ${serverGaps.length} 个服务端服务缺口（插件可能因此静默失效）：`);
    console.log('');
    for (const m of serverGaps) printGap(m);
    console.log('');
    console.log('  处置建议：');
    console.log('   1) 对照上游 CHANGELOG 确认该服务是否已被移除或改名；');
    console.log('   2) 若已迁移（如 webRuntime → connection），把 inject 收敛为确实存在的服务，');
    console.log('      并让取值逻辑按可用性回退；');
    console.log('   3) 参照 /data/dsh/tools/workdsh-fix-webruntime-routes.sh 的受管补丁模式落地。');
  }

  const others = ['desktop', 'client', 'namespace', 'framework'];
  const rest = others.map((k) => ({ k, list: missing.filter((m) => m.kind === k) })).filter((x) => x.list.length > 0);
  if (rest.length > 0) {
    console.log('');
    console.log('  —— 以下分类不计入失败（仅信息，静态扫描对其不可判定）——');
    for (const { k, list } of rest) {
      console.log(`  ${LABEL[k]}：${list.map((m) => m.service).join(', ')}`);
      if (opt.verbose) for (const m of list) printGap(m, '    ');
    }
  }

  if (opt.verbose) {
    console.log('');
    console.log('--- 已识别的服务提供者 ---');
    for (const [name, list] of [...providers].sort()) {
      console.log(`  ${name}  ←  ${list.length} 处，例: ${path.relative(profileDir, list[0].file)}:${list[0].line}`);
    }
  }
}

// 默认只对「服务端缺口」失败；--strict 下任何未提供项都算失败
process.exit((opt.strict ? missing.length > 0 : serverGaps.length > 0) ? 1 : 0);
