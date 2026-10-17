// 门户身份签名：本模块内建副本（dist/host/portal-signature.js，ADR-0019 自包含要求）
// 与唯一真源 workdsh-contracts/portal-identity 的**逐用例同值**交叉校验。
//
// 存在的理由（ADR-0035 第 4 条 / 风险表「签名静默恒失败」）：同一算法两份实现，只要
// 载荷写法或前缀处理有一处不同，验签就会**静默恒失败**——表现为「谁都登录不了、日志里
// 却没有任何报错」。这个用例把两份实现钉在同一个向量上。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as canonical from 'workdsh-contracts/portal-identity';
import * as local from '../dist/host/portal-signature.js';

const SECRET = 'identity-bridge-secret-for-tests';
const VECTORS = [
  { username: 'alice', role: 'user', jobRole: 'sales', expires: '1770000000000' },
  { username: 'bob', role: 'admin', jobRole: 'management', expires: '1770000000001' },
  { username: 'a.b-c_1', role: 'user', jobRole: '', expires: '0' },
  { username: 'carol', role: 'admin', jobRole: 'operations', expires: '1770000000002' },
];

test('内建副本与唯一真源：头名、岗位常量、载荷、签名逐项同值', () => {
  assert.deepEqual(local.PORTAL_IDENTITY_HEADERS, canonical.PORTAL_IDENTITY_HEADERS);
  assert.deepEqual([...local.GRANT_ADMIN_JOB_ROLES], [...canonical.GRANT_ADMIN_JOB_ROLES]);
  for (const fields of VECTORS) {
    assert.equal(local.portalSignaturePayload(fields), canonical.portalSignaturePayload(fields));
    assert.equal(local.computePortalSignature(SECRET, fields), canonical.computePortalSignature(SECRET, fields));
  }
  // 载荷必须是字段数组 JSON：换行拼接会产生歧义（不同字段组合得到同一载荷）。
  assert.equal(
    canonical.portalSignaturePayload({ username: 'a', role: 'b', jobRole: 'c', expires: 'd' }),
    JSON.stringify(['a', 'b', 'c', 'd']),
  );
  assert.notEqual(
    canonical.portalSignaturePayload({ username: 'a\nb', role: '', jobRole: '', expires: '' }),
    canonical.portalSignaturePayload({ username: 'a', role: 'b', jobRole: '', expires: '' }),
  );
  // 空值不撞车：role 与 jobRole 位置不同就是不同载荷。
  assert.notEqual(
    canonical.portalSignaturePayload({ username: 'u1', role: 'user', jobRole: '', expires: '1' }),
    canonical.portalSignaturePayload({ username: 'u1', role: '', jobRole: 'user', expires: '1' }),
  );
});

test('验签：正确签名（含 v1= 前缀）通过，篡改与长度不符一律拒绝', () => {
  const fields = VECTORS[0];
  const good = canonical.computePortalSignature(SECRET, fields);
  for (const module of [local, canonical]) {
    assert.equal(module.verifyPortalSignature(SECRET, fields, good), true);
    assert.equal(module.verifyPortalSignature(SECRET, fields, `v1=${good}`), true);
    assert.equal(module.verifyPortalSignature(SECRET, fields, `${good}0`), false);
    assert.equal(module.verifyPortalSignature(SECRET, fields, good.slice(0, -1)), false);
    assert.equal(module.verifyPortalSignature(SECRET, fields, undefined), false);
    assert.equal(module.verifyPortalSignature(SECRET, fields, ''), false);
    assert.equal(module.verifyPortalSignature('another-secret', fields, good), false);
    // 换一个字段就是另一个身份，绝不能沿用旧签名
    assert.equal(module.verifyPortalSignature(SECRET, { ...fields, username: 'mallory' }, good), false);
    assert.equal(module.verifyPortalSignature(SECRET, { ...fields, role: 'admin' }, good), false);
  }
});

test('头解析：两端对同一请求得到同一主体；非法用户名一律 null', () => {
  const fields = VECTORS[1];
  const headers = {
    [local.PORTAL_IDENTITY_HEADERS.user]: fields.username,
    [local.PORTAL_IDENTITY_HEADERS.role]: fields.role,
    [local.PORTAL_IDENTITY_HEADERS.jobRole]: fields.jobRole,
    [local.PORTAL_IDENTITY_HEADERS.expires]: fields.expires,
    [local.PORTAL_IDENTITY_HEADERS.signature]: `v1=${canonical.computePortalSignature(SECRET, fields)}`,
  };
  const mine = local.portalIdentityFromHeaders(headers, SECRET);
  const theirs = canonical.portalIdentityFromHeaders(headers, SECRET);
  assert.equal(mine?.principalId, 'portal:bob');
  assert.equal(theirs?.principalId, mine?.principalId);
  assert.equal(mine?.jobRole, 'management');
  assert.ok(Object.isFrozen(mine));

  const tampered = { ...headers, [local.PORTAL_IDENTITY_HEADERS.role]: 'user' };
  assert.equal(local.portalIdentityFromHeaders(tampered, SECRET), null);
  assert.equal(canonical.portalIdentityFromHeaders(tampered, SECRET), null);

  for (const username of ['', 'ab', 'has space', 'portal:alice', 'a'.repeat(65)]) {
    const bad = { ...headers, [local.PORTAL_IDENTITY_HEADERS.user]: username };
    assert.equal(local.portalIdentityFromHeaders(bad, SECRET), null, `local 应拒绝用户名「${username}」`);
    assert.equal(canonical.portalIdentityFromHeaders(bad, SECRET), null, `canonical 应拒绝用户名「${username}」`);
  }
});

test('密钥读取：缺失/空 → null，正常去空白，父目录不存在也不抛错', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-identity-signature-'));
  try {
    const missing = join(root, 'nope.key');
    assert.equal(local.readPortalSecret(missing), null);
    assert.equal(canonical.readPortalSecret(missing), null);

    const nested = join(root, 'a', 'b', 'c.key');
    assert.equal(local.readPortalSecret(nested), null);

    const file = join(root, 'bridge.key');
    await writeFile(file, `  ${SECRET}\n`, { mode: 0o600 });
    assert.equal(local.readPortalSecret(file), SECRET);
    assert.equal(canonical.readPortalSecret(file), SECRET);

    const empty = join(root, 'empty.key');
    await writeFile(empty, '\n  \n');
    assert.equal(local.readPortalSecret(empty), null);
    assert.equal(canonical.readPortalSecret(empty), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
