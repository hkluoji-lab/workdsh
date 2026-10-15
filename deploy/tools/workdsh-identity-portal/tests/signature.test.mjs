// 跨端签名一致性测试 —— P1 身份桥最容易"静默失效"的地方。
//
// 门户签发、DSH 插件验签，两边各写了一份载荷与 HMAC。任何一处改动（字段顺序、分隔符、
// 角色取值、时间格式）都会让验签恒失败，而**失败是静默的**：请求照常放行，只是退回
// 兜底主体。线上表现会是"权限好像没生效"，极难定位。所以这里把两端拉在一起对着测。
//
// 运行：node tests/signature.test.mjs
import { computeSignature as pluginSign } from '../dist/index.js';
import {
  computeSignature as portalSign,
  loadOrCreateBridgeSecret,
  signaturePayload as portalPayload,
} from '/data/dsh/portal/src/identity-bridge.mjs';

let pass = 0;
let fail = 0;
const ok = (name, condition, extra = '') => {
  if (condition) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}  ${extra}`); }
};

const SECRET = 'a'.repeat(64);
const SAMPLE = { username: 'sales1', role: 'user', jobRole: 'sales', expires: '1790599999999' };

console.log('[1] 载荷格式');
const expected = JSON.stringify(['sales1', 'user', 'sales', '1790599999999']);
ok('载荷为字段数组的 JSON（边界无歧义）', portalPayload(SAMPLE) === expected, JSON.stringify(portalPayload(SAMPLE)));

console.log('\n[2] 两端签名一致');
const portal = portalSign(SECRET, SAMPLE);
const plugin = pluginSign(SECRET, SAMPLE);
ok('两个实现的签名逐字节相同', portal === plugin, `portal=${portal.slice(0, 16)} plugin=${plugin.slice(0, 16)}`);
ok('签名是 64 位十六进制', /^[0-9a-f]{64}$/.test(portal), portal);

console.log('\n[3] 敏感字段都进签名');
const variants = [
  { ...SAMPLE, username: 'sales2' },
  { ...SAMPLE, role: 'admin' },
  { ...SAMPLE, jobRole: 'management' },
  { ...SAMPLE, expires: '1790599999998' },
];
for (const variant of variants) {
  const changed = Object.keys(SAMPLE).find((key) => SAMPLE[key] !== variant[key]);
  ok(`改动 ${changed} 会改变签名`, portalSign(SECRET, variant) !== portal, changed);
}
ok('换密钥会改变签名', portalSign('b'.repeat(64), SAMPLE) !== portal);

console.log('\n[4] 空值不会造成歧义');
// 岗位角色为空（unassigned 之外的异常输入）时也必须稳定，不能与"角色为空"的其他组合撞车。
ok('空 jobRole 与空 role 载荷不同',
  portalPayload({ username: 'u1', role: 'user', jobRole: '', expires: '1' })
  !== portalPayload({ username: 'u1', role: '', jobRole: 'user', expires: '1' }));
ok('字段内含换行会被分隔符区分开（不产生碰撞）',
  portalPayload({ username: 'a\nb', role: 'c', jobRole: 'd', expires: 'e' })
  !== portalPayload({ username: 'a', role: 'b', jobRole: 'c', expires: 'd\ne' }));

console.log('\n[5] 密钥文件');
const file = `/data/dsh/tmp/identity-bridge-test-${process.pid}.key`;
const created = loadOrCreateBridgeSecret(file);
ok('不存在时自动创建密钥', typeof created === 'string' && created.length === 64, String(created).slice(0, 12));
ok('重复调用读到同一密钥（不轮换）', loadOrCreateBridgeSecret(file) === created);
const { readFileSync, statSync, rmSync } = await import('node:fs');
ok('密钥文件权限为 0600', (statSync(file).mode & 0o777) === 0o600, (statSync(file).mode & 0o777).toString(8));
ok('密钥落盘内容与返回值一致', readFileSync(file, 'utf8').trim() === created);
rmSync(file, { force: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
