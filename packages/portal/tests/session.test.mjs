// 会话与门禁契约的最小验证：口令校验、签名 Cookie、回跳白名单与失败限流。
// 只测试纯函数，不启动进程、不接触真实网络。运行：node --test tests/session.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COOKIE_NAME,
  LoginThrottle,
  clearedCookie,
  deriveKey,
  issueSession,
  parseCookies,
  readSession,
  safeNext,
  sessionCookie,
  verifyPassword,
} from '../src/session.mjs';

const key = deriveKey('correct horse battery staple');

test('口令校验接受正确口令并拒绝错误口令', () => {
  assert.equal(verifyPassword('s3cret-pass', 's3cret-pass'), true);
  assert.equal(verifyPassword('s3cret-pass', 's3cret-pas'), false);
  assert.equal(verifyPassword('', 's3cret-pass'), false);
  assert.equal(verifyPassword('s3cret-pass', ''), false);
  assert.equal(verifyPassword('s3cret-pass', undefined), false);
});

test('签发的会话可读回并保留有效期', () => {
  const now = 1_800_000_000_000;
  const { token, expiresAt } = issueSession({ key, user: 'admin', now, ttlMs: 60_000 });
  assert.equal(expiresAt, now + 60_000);
  const session = readSession({ key, token, user: 'admin', now: now + 1_000 });
  assert.equal(session.user, 'admin');
  assert.equal(session.expiresAt, expiresAt);
});

test('被篡改、换密钥、换用户与过期的会话一律拒绝', () => {
  const now = 1_800_000_000_000;
  const { token } = issueSession({ key, user: 'admin', now, ttlMs: 60_000 });
  const [payload, mac] = [token.slice(0, token.lastIndexOf('.')), token.slice(token.lastIndexOf('.') + 1)];

  const forged = `${Buffer.from(JSON.stringify({ u: 'admin', i: now, e: now + 10 ** 9 })).toString('base64url')}.${mac}`;
  assert.equal(readSession({ key, token: forged, user: 'admin', now }), null, '改载荷必须失败');
  assert.equal(readSession({ key: deriveKey('other'), token, user: 'admin', now }), null, '换密钥必须失败');
  assert.equal(readSession({ key, token, user: 'someone-else', now }), null, '换用户必须失败');
  assert.equal(readSession({ key, token, user: 'admin', now: now + 60_001 }), null, '过期必须失败');
  assert.equal(readSession({ key, token: `${payload}.`, user: 'admin', now }), null, '空签名必须失败');
  assert.equal(readSession({ key, token: 'not-a-token', user: 'admin', now }), null, '无分隔符必须失败');
  assert.equal(readSession({ key, token: undefined, user: 'admin', now }), null, '缺失必须失败');
});

test('回跳只接受同源相对路径', () => {
  assert.equal(safeNext('/session/abc?tab=1'), '/session/abc?tab=1');
  assert.equal(safeNext('/'), '/');
  assert.equal(safeNext('https://evil.example/'), '/', '绝对 URL 必须拒绝');
  assert.equal(safeNext('//evil.example/'), '/', '协议相对跳转必须拒绝');
  assert.equal(safeNext('/\\evil.example'), '/', '反斜杠变体必须拒绝');
  assert.equal(safeNext('/login?next=/x'), '/', '登录页自身必须拒绝');
  assert.equal(safeNext('/logout'), '/', '退出路径必须拒绝');
  assert.equal(safeNext('/portal'), '/', '门户路径必须拒绝');
  assert.equal(safeNext('/api/portal/auth'), '/', '门户 API 必须拒绝');
  assert.equal(safeNext('/a\u0000b'), '/', '控制字符必须拒绝');
  assert.equal(safeNext(undefined), '/', '缺失取默认值');
  assert.equal(safeNext(`/${'a'.repeat(600)}`), '/', '超长取默认值');
});

test('Cookie 解析与属性', () => {
  const cookies = parseCookies(`a=1; ${COOKIE_NAME}=abc.def; theme=dark`);
  assert.equal(cookies.get(COOKIE_NAME), 'abc.def');
  assert.equal(parseCookies(undefined).size, 0);

  const set = sessionCookie({ token: 'abc.def', maxAgeMs: 60_000, secure: true });
  assert.match(set, /^dsh_portal_session=abc\.def/);
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Lax/);
  assert.match(set, /Max-Age=60/);
  assert.match(set, /Secure/);
  assert.doesNotMatch(sessionCookie({ token: 'x', maxAgeMs: 1000, secure: false }), /Secure/);
  assert.match(clearedCookie({ secure: false }), /Max-Age=0/);
});

test('失败限流达到阈值后阻断，成功后重置', () => {
  const throttle = new LoginThrottle({ windowMs: 60_000, maxFailures: 3 });
  const now = 1_800_000_000_000;
  assert.equal(throttle.blocked('1.2.3.4', now), false);
  for (let i = 0; i < 3; i += 1) throttle.fail('1.2.3.4', now);
  assert.equal(throttle.blocked('1.2.3.4', now), true);
  assert.equal(throttle.blocked('5.6.7.8', now), false, '按来源独立计数');
  assert.equal(throttle.blocked('1.2.3.4', now + 60_001), false, '窗口过期后恢复');

  throttle.reset('1.2.3.4');
  assert.equal(throttle.blocked('1.2.3.4', now + 60_001), false);
  throttle.fail('9.9.9.9', now);
  assert.equal(throttle.retain(now + 60_001), 1, '过期条目被清理');
});
