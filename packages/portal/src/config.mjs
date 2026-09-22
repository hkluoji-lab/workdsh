// 配置装载：只读环境变量，不读取或写入任何业务数据。
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const moduleDir = resolve(here, '..');
export const repoRoot = resolve(moduleDir, '..', '..');

export function loadConfig(env = process.env) {
  return {
    bind: env.PORTAL_BIND ?? '127.0.0.1',
    port: Number(env.PORTAL_PORT ?? 3083),
    // 与官方 dsh Web 共用同一组口令；门户不注册、不修改、不落库。
    username: (env.DSH_AUTH_USERNAME ?? '').trim(),
    password: env.DSH_AUTH_PASSWORD ?? '',
    sessionTtlMs: Number(env.PORTAL_SESSION_TTL_HOURS ?? 12) * 3600 * 1000,
    // 浏览器侧是 HTTPS（Cloudflare 边缘）；本机 http 预览时用 PORTAL_COOKIE_SECURE=0 关闭。
    cookieSecure: env.PORTAL_COOKIE_SECURE !== '0',
    siteDir: resolve(moduleDir, 'site'),
    // 只引用仓库内已发布的真实应用截图，不复制第二份二进制素材。
    assetsDir: env.PORTAL_ASSETS_DIR ? resolve(env.PORTAL_ASSETS_DIR) : resolve(repoRoot, 'website', 'assets'),
    throttle: { windowMs: 15 * 60 * 1000, maxFailures: 10 },
  };
}
