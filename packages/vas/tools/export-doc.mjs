/**
 * 从产品数据导出 Markdown 清单（供资料库 / 线下报价使用）。
 *
 * 为什么要脚本化：后台可以随时改数据，手写文档必然与线上页漂移。
 * 本脚本保证文档与 `data/products/<id>.json` 同源，任何改动都能一键重新生成。
 *
 * 用法：node tools/export-doc.mjs [产品id] [输出路径]
 *   默认：2026Q3-zengzhi → ../docs/产品与资费清单.md
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const id = process.argv[2] ?? '2026Q3-zengzhi';
const outPath = process.argv[3] ?? resolve(root, 'docs', '产品与资费清单.md');
const data = JSON.parse(fs.readFileSync(resolve(root, 'data', 'products', `${id}.json`), 'utf8'));

const money = (n) => Number(n).toLocaleString('zh-CN');
const catName = (cid) => data.categories.find((c) => c.id === cid)?.name || '未分类';
const monthlyOf = (p) => p.tiers.filter((t) => t.type === 'monthly');
const onetimeOf = (p) => p.tiers.filter((t) => t.type === 'onetime');

const L = [];
L.push('# 中国电信增值业务 · 产品与资费清单');
L.push('');
L.push('> 数据来源：' + data.catalog.sourceForm);
L.push('> 运营主体：' + data.catalog.operator + '　客服热线：' + data.catalog.hotline);
L.push('> 数据版本：' + String(data.updatedAt).slice(0, 10) + '　·　数据文件：`data/products/' + id + '.json`');
L.push('');
L.push('本清单是受理登记表的数字化版本，供选型、报价与受理核对使用。**原文未给出的金额一律保留为「受理时填写」，不做推算。**');
L.push('');
L.push('> 本文档由 `node tools/export-doc.mjs` 自动生成；改数据后请重新生成，不要手工编辑本文件。');
L.push('');
L.push('---');
L.push('');
L.push('## 一、产品与月租总表');
L.push('');
L.push('| 产品 | 分类 | 月租 | 套餐内容（各档） | 一次性费用 |');
L.push('|---|---|---|---|---|');
for (const p of data.products) {
  const m = monthlyOf(p);
  const o = onetimeOf(p);
  const rent = m.length
    ? m.map((t) => money(t.price)).join(' / ') + ' 元 · ' + m[0].unit.replace(/^元\//, '')
    : '**受理时填写**';
  const inc = m.length
    ? m.map((t) => `${money(t.price)} 元 → ${t.includes}`).join('<br>')
    : '受理登记表原文为填空项';
  const once = o.length
    ? o.map((t) => `${money(t.price)} ${t.unit}（${t.name}）`).join('<br>')
    : '无';
  L.push(`| **${p.name}** | ${catName(p.category)} | ${rent} | ${inc} | ${once} |`);
}
L.push('');
L.push('---');
L.push('');
L.push('## 二、分产品明细');
for (const p of data.products) {
  const m = monthlyOf(p);
  const o = onetimeOf(p);
  L.push('');
  L.push('### ' + p.name);
  L.push('');
  L.push('> ' + p.tagline);
  L.push('');
  L.push(p.feature);
  L.push('');
  if (m.length) {
    L.push('**月租与套餐内容**');
    L.push('');
    L.push('| 档位 | 价格 | 计价单位 | 包含内容 |');
    L.push('|---|---|---|---|');
    for (const t of m) L.push(`| ${t.name} | ${money(t.price)} 元 | ${t.unit} | ${t.includes} |`);
  } else {
    L.push('**月租**：受理时填写 —— 受理登记表原文为填空项。' + (p.priceNote || ''));
  }
  L.push('');
  if (o.length) {
    L.push('**一次性费用**');
    L.push('');
    L.push('| 项目 | 价格 | 包含内容 |');
    L.push('|---|---|---|');
    for (const t of o) L.push(`| ${t.name} | ${money(t.price)} ${t.unit} | ${t.includes} |`);
    L.push('');
  }
  L.push('**适用场景**：' + (p.scenarios || []).join('；'));
  L.push('');
  L.push('**对企业的帮助**：' + (p.benefitNarrative || ''));
  L.push('');
  if ((p.options || []).length) {
    L.push('**可选项**：' + p.options.join('；'));
    L.push('');
  }
  if (Object.keys(p.fields || {}).length) {
    L.push('**受理与登记要求**');
    L.push('');
    for (const [k, v] of Object.entries(p.fields)) L.push(`- ${k}：${v}`);
    L.push('');
  }
  if (p.renewal) {
    L.push('**续约与计费**：' + p.renewal);
    L.push('');
  }
  if ((p.quotes || []).length) {
    L.push('**受理登记表原文依据**');
    L.push('');
    for (const q of p.quotes) L.push('- `' + q + '`');
    L.push('');
  }
  L.push('---');
}
L.push('');
L.push('## 三、服务条款摘要');
L.push('');
for (const t of data.terms || []) L.push('- ' + t);
L.push('');
L.push('---');
L.push('');
L.push('## 四、常见问题');
L.push('');
for (const f of data.faq || []) {
  L.push('**' + f.q + '**');
  L.push('');
  L.push(f.a);
  L.push('');
}

const text = L.join('\n');
fs.mkdirSync(dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, text);
console.log(`已生成 ${outPath}（${Buffer.byteLength(text)} 字节）`);
console.log(`产品 ${data.products.length} 项，档位 ${data.products.reduce((n, p) => n + p.tiers.length, 0)} 档`);
