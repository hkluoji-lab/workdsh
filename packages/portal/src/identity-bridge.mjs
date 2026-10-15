// 身份桥共享密钥（P1）：门户签发、DSH 侧 Host 插件验签。
//
// 为什么需要签名而不是只发一个 `X-Portal-User` 头：
// 容器内 `127.0.0.1:3080` 是可达的，任何本机进程都能直接对着 DSH 发一个头。
// 头本身只能证明"有人这么写"，不能证明"门户认过这个账号"。签名把信任锚放回门户。
//
// 载荷与验签实现必须与 `/data/dsh/tools/workdsh-identity-portal/dist/index.js`
// 的 `signaturePayload` / `computeSignature` **逐字节一致**，否则会静默退回兜底身份。
import { createHmac, randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * 载荷：账号、平台角色、岗位角色、会话过期时间。
 *
 * 用 JSON 数组而不是 `\n` 拼接：换行拼接在"字段本身能含分隔符"时会产生歧义
 * （`{user:'a\nb'}` 与 `{user:'a', role:'b'}` 会拼出同一串），从而让签名可被搬移字段伪造。
 * JSON 会转义控制字符，字段边界无歧义。当前门户已把用户名限制在 `[A-Za-z0-9._-]`，
 * 这里是**第二道**防线：载荷编码本身就不该依赖上游的输入校验。
 */
export function signaturePayload(fields) {
  return JSON.stringify([
    String(fields?.username ?? ''),
    String(fields?.role ?? ''),
    String(fields?.jobRole ?? ''),
    String(fields?.expires ?? ''),
  ]);
}

export function computeSignature(secret, fields) {
  return createHmac('sha256', secret).update(signaturePayload(fields)).digest('hex');
}

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
    'X-Portal-Sig': `v1=${computeSignature(secret, fields)}`,
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
