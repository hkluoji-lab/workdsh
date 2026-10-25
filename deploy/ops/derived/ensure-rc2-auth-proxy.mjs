#!/usr/bin/env node
/**
 * rc2-auth-proxy 自愈补丁（幂等）
 *
 * 背景：dsh 0.2.0-rc.2 起，`dsh web` 对 `http://127.0.0.1:3080/` 要求应用自己下发的
 * launch token，未携带时返回 401（"reopen the URL printed by dsh web"）。1Panel 的封装
 * 走的是 `ONEPANEL_DSH_AUTH_PROXY=1`：由容器内的 Caddy/门户做鉴权，后端信任反代。
 * 该判定只存在于 1Panel 打过补丁的产物里；web profile 的 `pnpm install` 会把
 * @deepseek-ai/dsh-client-connection 重新从 npm 源还原成上游原件，补丁行被静默抹掉：
 *
 *   401 on `/` → entrypoint 就绪探针（curl -fsS http://127.0.0.1:3080/）失败
 *   → 240s 后 "did not become ready" → 容器重启循环 → Cloudflare 502
 *
 * 本脚本在每次容器启动、拉起 dsh 之前跑一次，缺补丁就补上；已打过则不动文件。
 * 锚点不唯一/找不到时**不改文件**并以非零码退出（宁可不补，也不写出坏文件）。
 * 写入用「临时文件 + rename」，避免破坏 pnpm store 的硬链接（store 原件保持上游原样）。
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, renameSync, chmodSync } from 'node:fs';

const MARK = 'ONEPANEL_DSH_AUTH_PROXY';
const INSERT = '\n\t\tif (process.env.ONEPANEL_DSH_AUTH_PROXY === "1") return true;';

// 按版本新旧依次尝试；每个锚点都必须在文件里恰好出现 1 次才动手。
// 0.2.1-rc.2 / rc.3 实测形态（rc.3 已核对：rc2 锚点命中 1 次，legacy 命中 0 次）。
const ANCHORS = [
  '\tisAuthenticated(request, secure = false) {',
  // 0.1.x 早期形态，保留以兼容历史树
  '\tisAuthenticated(request) {',
];

const targets = [
  // web profile 实际加载的副本（pnpm install 会覆盖的就是这一份）
  '/data/dsh/profiles/web/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js',
  // 官方安装树（compose 里由 global-dsh/standalone 挂进来）
  '/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js',
];

let failures = 0;
for (const file of targets) {
  if (!existsSync(file)) {
    console.log(`rc2-auth-proxy: skip (missing) ${file}`);
    continue;
  }
  const source = readFileSync(file, 'utf8');
  if (source.includes(MARK)) {
    console.log(`rc2-auth-proxy: ok (already patched) ${file}`);
    continue;
  }
  const anchor = ANCHORS.find((candidate) => source.split(candidate).length - 1 === 1);
  if (!anchor) {
    const counts = ANCHORS.map((candidate) => `${JSON.stringify(candidate)}=${source.split(candidate).length - 1}`).join(', ');
    console.error(`rc2-auth-proxy: FAIL no unique anchor in ${file} (${counts}); file left untouched`);
    failures += 1;
    continue;
  }
  if (!existsSync(`${file}.orig`)) {
    copyFileSync(file, `${file}.orig`);
    console.log(`rc2-auth-proxy: backup written ${file}.orig`);
  }
  const temporary = `${file}.tmp.rc2auth`;
  writeFileSync(temporary, source.replace(anchor, anchor + INSERT));
  chmodSync(temporary, 0o644);
  renameSync(temporary, file);
  console.log(`rc2-auth-proxy: patched ${file}`);
}

process.exit(failures > 0 ? 1 : 0);
