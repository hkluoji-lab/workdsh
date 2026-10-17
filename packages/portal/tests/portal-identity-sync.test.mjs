// 门户侧签名实现是 `workdsh-contracts/portal-identity` 的**逐字节副本**。
//
// 为什么必须是副本：门户在部署态是 `/data/dsh/portal/src` 的原样拷贝，容器里没有
// node_modules，裸导入 workspace 包会直接解析失败（与 ADR-0019 同一条约束）。
// 为什么这条测试必须在：签名载荷字段顺序或分隔方式一旦漂移，验签会**静默恒失败**
// （不报错、只是所有身份都不被承认），靠人工对照发现不了。
//
// 刷新方式：`cp packages/contracts/dist/portal-identity.js packages/portal/src/portal-identity.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORTAL_COPY = resolve(HERE, '../src/portal-identity.mjs');
const CONTRACTS_DIST = resolve(HERE, '../../contracts/dist/portal-identity.js');

function digest(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

test('门户副本与 contracts 产物逐字节一致，算法不会静默漂移', (t) => {
  if (!existsSync(CONTRACTS_DIST)) {
    // 独立运行门户测试时 contracts 可能未构建；整批门禁会先 build 再跑，此处不误报失败。
    t.skip('workdsh-contracts 未构建（dist/portal-identity.js 缺失），跳过同步校验');
    return;
  }
  assert.equal(
    digest(PORTAL_COPY),
    digest(CONTRACTS_DIST),
    '门户 portal-identity.mjs 与 contracts 产物不一致：请执行 cp packages/contracts/dist/portal-identity.js packages/portal/src/portal-identity.mjs',
  );
});

test('门户副本导出的签名函数与合同产物同名同签名', async () => {
  const portal = await import(PORTAL_COPY);
  for (const name of [
    'computePortalSignature',
    'verifyPortalSignature',
    'portalSignaturePayload',
    'readPortalSecret',
    'portalIdentityFromHeaders',
  ]) {
    assert.equal(typeof portal[name], 'function', `门户副本缺少导出：${name}`);
  }
  // 同一密钥 + 同一字段，门户副本自身往返自洽（真源等价性由上面的逐字节断言保证）。
  const secret = 'sync-test-secret';
  const fields = { username: 'alice', role: 'member', jobRole: 'operations', expires: '1700000000' };
  const signature = portal.computePortalSignature(secret, fields);
  assert.equal(portal.computePortalSignature(secret, fields), signature);
  assert.equal(portal.verifyPortalSignature(secret, fields, `v1=${signature}`), true);
  // 末位换成一个不同的十六进制字符：固定写 '0' 会在原签名恰好以 '0' 结尾时变成同值。
  const tampered = signature.slice(0, -1) + (signature.endsWith('0') ? '1' : '0');
  assert.equal(portal.verifyPortalSignature(secret, fields, tampered), false);
});
