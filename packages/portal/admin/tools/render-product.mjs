/**
 * 产品页渲染器：模板 + 数据 JSON → 单文件自包含 HTML。
 * 设计要点：数据层以字面量形式内联进 <script>，保持零外部请求，
 * 因此产品页 CSP 无需放宽 connect-src（沿用既有 PRODUCT_CSP）。
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** 把 JS 值序列化为可读的 JS 字面量（保持原文件的排版风格） */
function jsLit(value, indent = 0) {
  const pad = '  '.repeat(indent);
  const pad1 = '  '.repeat(indent + 1);
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const allSimple = value.every(v => typeof v !== 'object' || v === null);
    if (allSimple) return '[' + value.map(v => jsLit(v)).join(',') + ']';
    return '[\n' + value.map(v => pad1 + jsLit(v, indent + 1)).join(',\n') + '\n' + pad + ']';
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return '{}';
  return '{\n' + keys.map(k => {
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
    return pad1 + key + ': ' + jsLit(value[k], indent + 1);
  }).join(',\n') + '\n' + pad + '}';
}

/** 单行紧凑序列化（用于 TIERS 这类每档一行的排版） */
function jsCompact(value, indent = 0) {
  const pad = '  '.repeat(indent);
  const pad1 = '  '.repeat(indent + 1);
  if (value === null || typeof value !== 'object') return jsLit(value);
  if (Array.isArray(value)) {
    return '[' + value.map(v => jsCompact(v, indent)).join(',') + ']';
  }
  const keys = Object.keys(value);
  const parts = keys.map(k => {
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
    return key + ':' + jsCompact(value[k], indent);
  });
  // 短对象保持一行；长对象换行缩进，便于人工核对
  const oneLine = '{ ' + parts.join(', ') + ' }';
  if (oneLine.length <= 118) return oneLine;
  return '{\n' + keys.map((k, i) => {
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
    return pad1 + key + ':' + jsCompact(value[k], indent + 1) + (i < keys.length - 1 ? ',' : '');
  }).join('\n') + '\n' + pad + '}';
}

/** 生成数据层 JS 代码块 */
export function buildDataBlock(data) {
  const lines = [];
  lines.push('/* ============ 数据层：由管理后台数据源渲染，请勿手工编辑此段 ============ */');
  lines.push('/* 数据源：data/products/' + data.id + '.json；渲染器：tools/render-product.mjs */');
  lines.push('const GROUPS = ' + jsCompact(data.groups) + ';');
  lines.push('const UNIVERSAL = ' + jsCompact(data.universal) + ';');
  lines.push('/* monthly: 数组表示原表给出的价格档；null 表示原表未单列月租数字 */');
  lines.push('const TIERS = [');
  lines.push(data.tiers.map(t => '  ' + jsCompact(t, 1)).join(',\n'));
  lines.push('];');
  lines.push('/* ============ 企业办公场景层（选型建议，不改变任何资费口径） ============ */');
  lines.push('const SCENES = [');
  lines.push(data.scenes.map(s => '  ' + jsCompact(s, 1)).join(',\n'));
  lines.push('];');
  lines.push('const SCENE_MAP = SCENES.reduce((m, s) => (m[s.key] = s, m), {});');
  lines.push('/* 逐档场景定义：与 TIERS 的 id 一一对应 */');
  lines.push('const TIER_SCENE = {');
  lines.push(Object.entries(data.tierScene).map(([id, v]) => '  ' + id + ': ' + jsCompact(v, 1)).join(',\n'));
  lines.push('};');
  lines.push('const FAQ = [');
  lines.push(data.faq.map(f => '  ' + jsCompact(f, 1)).join(',\n'));
  lines.push('];');
  return lines.join('\n') + '\n';
}

/** 应用 head 元信息 */
function applyMeta(html, meta) {
  let out = html;
  if (meta.title) out = out.replace(/<title>[^<]*<\/title>/, `<title>${meta.title}</title>`);
  if (meta.description) out = out.replace(/(<meta name="description" content=")[^"]*(")/, `$1${meta.description}$2`);
  if (meta.ogTitle) out = out.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${meta.ogTitle}$2`);
  if (meta.ogDescription) out = out.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${meta.ogDescription}$2`);
  if (meta.themeColor) out = out.replace(/(<meta name="theme-color" content=")[^"]*(")/, `$1${meta.themeColor}$2`);
  return out;
}

/** 主渲染函数 */
export function renderProduct(data, { templatePath } = {}) {
  const tpl = fs.readFileSync(templatePath ?? resolve(here, 'product.template.html'), 'utf8');
  if (!tpl.includes('/*__DATA__*/')) throw new Error('模板缺少 /*__DATA__*/ 占位符');
  let html = tpl.replace('/*__DATA__*/', buildDataBlock(data));
  html = applyMeta(html, data.meta || {});
  return html;
}

// CLI：node render-product.mjs <data.json> <out.html> [template]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [dataPath, outPath, tplPath] = process.argv.slice(2);
  if (!dataPath || !outPath) {
    console.error('用法: node render-product.mjs <data.json> <out.html> [template.html]');
    process.exit(2);
  }
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  fs.writeFileSync(outPath, renderProduct(data, { templatePath: tplPath }));
  console.log('已渲染:', outPath, Buffer.byteLength(fs.readFileSync(outPath)), '字节');
}
