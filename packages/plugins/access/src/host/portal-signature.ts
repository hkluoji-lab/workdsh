/**
 * 门户身份签名协议——可安装 Host 的本地内建副本。
 *
 * 唯一真源是 `workdsh-contracts/portal-identity`。本文件按
 * [ADR-0019](../../../../docs/adr/0019-installable-host-self-containment-and-governance-assembly.md)
 * 决策 1/2 在模块自有源码内**内建**同一实现：已安装 Host 的 `dist` 不得在运行时裸导入
 * `workdsh-contracts`（private 包，安装态不可解析），但协议本身必须处处逐字节一致——
 * 任何写法差异都会让验签**静默恒失败**。
 *
 * 因此本副本由 `tests/portal-signature.test.mjs` 与唯一真源逐用例交叉校验：
 * 载荷、签名、验签、头解析四项都必须对同一输入给出同一结果。修改任一侧都要跑该测试。
 * @module workdsh-plugin-access/host/portal-signature
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** 门户身份头的头名（可由部署配置覆盖）。 */
export interface PortalIdentityHeaderNames {
  readonly user: string;
  readonly role: string;
  readonly jobRole: string;
  readonly expires: string;
  readonly signature: string;
}

/** 线上的默认头名，与门户 `identity-bridge.mjs` 写出的头一一对应。 */
export const PORTAL_IDENTITY_HEADERS: PortalIdentityHeaderNames = Object.freeze({
  user: 'x-portal-user',
  role: 'x-portal-role',
  jobRole: 'x-portal-job-role',
  expires: 'x-portal-expires',
  signature: 'x-portal-sig',
});

/** 允许管理资源授权的岗位角色（与门户 `roles.mjs` 口径一致）。 */
export const GRANT_ADMIN_JOB_ROLES: readonly string[] = Object.freeze(['management', 'operations']);

/** 明文用户名约束：门户账号名，避免把任意字符串当作主体 id 使用。 */
const USERNAME_RE = /^[A-Za-z0-9._-]{3,64}$/;

/** 参与签名的四个字段。 */
export interface PortalIdentityFields {
  readonly username: string;
  readonly role: string;
  readonly jobRole: string;
  readonly expires: string;
}

/** 验签通过后的门户身份；`principalId` 是 DSH 内部主体 id。 */
export interface PortalIdentity extends PortalIdentityFields {
  readonly principalId: string;
}

/** 请求头集合的宽松形态（`IncomingMessage['headers']` 可直接传入）。 */
export type PortalIdentityHeaders = Readonly<Record<string, unknown>>;

/**
 * 签名载荷：四个字段的 JSON 数组。
 * @param fields - 参与签名的账号、平台角色、岗位角色与会话过期时间。
 * @returns 逐字节确定的载荷字符串。
 */
export function portalSignaturePayload(fields: PortalIdentityFields): string {
  return JSON.stringify([
    String(fields.username ?? ''),
    String(fields.role ?? ''),
    String(fields.jobRole ?? ''),
    String(fields.expires ?? ''),
  ]);
}

/**
 * 计算签名。
 * @param secret - 共享密钥原文。
 * @param fields - 参与签名的四个字段。
 * @returns 十六进制 HMAC-SHA256。
 */
export function computePortalSignature(secret: string, fields: PortalIdentityFields): string {
  return createHmac('sha256', secret).update(portalSignaturePayload(fields)).digest('hex');
}

/**
 * 常量时间比对签名，并容忍 `v1=` 前缀。
 * @param secret - 共享密钥原文。
 * @param fields - 参与签名的四个字段。
 * @param supplied - 请求里带来的签名（可含 `v1=` 前缀）。
 * @returns 是否等价。
 */
export function verifyPortalSignature(
  secret: string,
  fields: PortalIdentityFields,
  supplied: string | undefined,
): boolean {
  const expected = Buffer.from(computePortalSignature(secret, fields), 'utf8');
  const actual = Buffer.from(String(supplied ?? '').replace(/^v1=/, ''), 'utf8');
  // 长度不同直接判否：timingSafeEqual 对不等长输入会抛错，不能让它成为异常路径。
  if (expected.length !== actual.length) return false;
  try {
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/**
 * 读取共享密钥。密钥缺失或为空都不抛错，由调用方决定退回行为。
 * @param file - 密钥文件路径。
 * @returns 去空白后的密钥；不可用时为 `null`。
 */
export function readPortalSecret(file: string): string | null {
  try {
    const raw = readFileSync(file, 'utf8').trim();
    return raw === '' ? null : raw;
  } catch {
    return null;
  }
}

/**
 * 从请求头提取并验签门户身份。
 * @param headers - 请求头。
 * @param secret - 共享密钥原文。
 * @param names - 头名映射，默认 {@link PORTAL_IDENTITY_HEADERS}。
 * @returns 验签通过的身份；任何一步不成立都返回 `null`。
 */
export function portalIdentityFromHeaders(
  headers: PortalIdentityHeaders,
  secret: string,
  names: PortalIdentityHeaderNames = PORTAL_IDENTITY_HEADERS,
): PortalIdentity | null {
  const username = String(headers[names.user] ?? '').trim();
  if (!USERNAME_RE.test(username)) return null;
  const role = String(headers[names.role] ?? '').trim();
  const jobRole = String(headers[names.jobRole] ?? '').trim();
  const expires = String(headers[names.expires] ?? '').trim();
  const supplied = String(headers[names.signature] ?? '').trim();
  if (!verifyPortalSignature(secret, { username, role, jobRole, expires }, supplied)) return null;
  return Object.freeze({ username, role, jobRole, expires, principalId: `portal:${username}` });
}
