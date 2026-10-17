// 身份桥（P1）：门户签发、DSH 侧 Host 插件验签。
//
// 为什么需要签名而不是只发一个 `X-Portal-User` 头：
// 容器内 `127.0.0.1:3080` 是可达的，任何本机进程都能直接对着 DSH 发一个头。
// 头本身只能证明"有人这么写"，不能证明"门户认过这个账号"。签名把信任锚放回门户。
//
// 签名算法只有一份，在 `workdsh-contracts/portal-identity`（ADR-0035 第 4 条：门户与
// identity 模块引用同一实现，不再各写一份）。本目录的 `portal-identity.mjs` 是它的
// **逐字节副本**，不是另写一份实现——门户在部署态是 `/data/dsh/portal/src` 的原样拷贝，
// 容器里没有 node_modules，裸导入 workspace 包会直接解析失败（与 ADR-0019 同一条约束）。
// 刷新方式：`cp packages/contracts/dist/portal-identity.js packages/portal/src/portal-identity.mjs`；
// `tests/portal-identity-sync.test.mjs` 在两者不一致时失败，避免算法静默漂移。
//
// 本文件只保留门户独有、契约里没有的两件事：签发身份头、创建/读取共享密钥。
import { computePortalSignature } from './portal-identity.mjs';
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * 为某个会话生成**已签名**的身份头。
 *
 * 这是信任锚的行使方式：门户是唯一持有密钥的一方，因此只有它能声明"这个请求是谁"。
 * 两处用到：① Caddy forward_auth 的上游透传（浏览器请求）；
 * ② 门户替用户转发到 DSH 的服务端调用（资源授权管理），见 server.mjs 的 /api/portal/grants*。
 */
export function signedIdentityHeaders(secret, { user, role, jobRole, expires }) {
  if (typeof secret !== 'string' || secret === '') return null;
  const fields = { username: user, role, jobRole, expires: String(expires) };
  return {
    'X-Portal-User': String(user),
    'X-Portal-Role': String(role ?? ''),
    'X-Portal-Job-Role': String(jobRole ?? ''),
    'X-Portal-Expires': String(expires ?? ''),
    'X-Portal-Sig': `v1=${computePortalSignature(secret, fields)}`,
  };
}

/**
 * 读取共享密钥；不存在则以 0600 原子创建（32 字节随机）。
 * 读失败不抛给调用方——身份桥不可用时门户照常工作，只是 DSH 侧退回兜底主体。
 */
export function loadOrCreateBridgeSecret(file, log) {
  try {
    const existing = readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return existing;
    if (existing !== '') {
      log?.('warning', { scope: 'identity-bridge', message: '密钥文件过短，已重新生成' });
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      log?.('warning', { scope: 'identity-bridge', message: `密钥读取失败：${error?.code ?? error?.message}` });
    }
  }
  try {
    mkdirSync(dirname(file), { recursive: true });
    const secret = randomBytes(32).toString('hex');
    const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync(tmp, `${secret}\n`, { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, file);
    log?.('identity-bridge.secret-created', { file });
    return secret;
  } catch (error) {
    log?.('warning', { scope: 'identity-bridge', message: `密钥创建失败：${error?.message}` });
    return null;
  }
}
