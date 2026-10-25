#!/usr/bin/env bash
# workdsh 修复：profile 热重载取不到根 Include 条目
#   症状（设置→模型→创建提供商、插件启停、HMR 热加载）：
#     dsh: profile reload requires the root Include entry
#
# 根因（2026-09-25 实测）：
#   本部署把 DSH 核心同时装在两处 —— 全局安装
#     /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-app-boot
#   与 profile
#     /data/dsh/profiles/web/node_modules/@deepseek-ai/dsh-app-boot
#   两份文件字节相同（md5 4fd237ae…）但是**两个模块实例**。启动时 boot() 在
#   “CLI 那一份”里把根 Include 条目登记进模块级 WeakMap `bootstrapIncludes`；
#   而 profile 侧插件（dsh-config-editor / dsh-plugin-manager / dsh-hmr）
#   import 的是“profile 那一份”，WeakMap 里没有该条目 →
#   reconcileProfilePatches() 直接抛错，任何需要写 profile 补丁层的设置都失败。
#
# 修法：在 profile 那一份里加一条**回退**——WeakMap 未命中时，从 Loader 实际
#   登记的条目里找到根 Include（id=include, name=cordis:include）。只改 profile
#   副本（可写卷），不动只读 rootfs 里的全局副本。
#
#   应用:  ./workdsh-fix-profile-reload.sh
#   回滚:  ./workdsh-fix-profile-reload.sh --revert
#
# 注意：node_modules 里的就地补丁会在 pnpm install / 插件升级后被还原，重跑本脚本即可。
set -euo pipefail

# ── 同族补丁挂接（2026-10-15，workdsh-webruntime-fix）─────────────────────────
# 入口脚本 /usr/local/bin/docker-entrypoint.sh 以只读方式挂载，无法新增钩子；它只通过
# reapply_profile_reload_fix() 在**每次启动与运行期重启**调用本脚本（162 行与 374 行）。
# 因此把「插件依赖不存在的 webRuntime 服务 → web 路由整体不挂载」的修复挂在这里，
# 保证 pnpm install / 插件自更新覆盖 node_modules 后仍能自动重打。
# 必须放在下面各早退分支（如“已经是补丁状态” exit 0）之前，否则常被跳过。
# 失败只告警，绝不影响本脚本自身逻辑与 DSH 启动流程。
if [[ -x /data/dsh/tools/workdsh-fix-webruntime-routes.sh ]]; then
  _wr_log=/data/dsh/tmp/webruntime-fix.log
  _wr_dir="${DSH_PROFILE_DIR:-/data/dsh/profiles/web}"
  _wr_out="$(/data/dsh/tools/workdsh-fix-webruntime-routes.sh 2>&1)" && _wr_rc=0 || _wr_rc=$?
  printf '%s | %s | rc=%s | %s\n' "$(date -Is)" "$_wr_dir" "$_wr_rc" \
    "$(printf '%s' "$_wr_out" | tr '\n' ' ')" >> "$_wr_log" 2>/dev/null || true
  if [[ "$_wr_rc" != 0 ]]; then
    printf 'warning: workdsh-fix-webruntime-routes failed for %s (rc=%s): %s\n' \
      "$_wr_dir" "$_wr_rc" "$_wr_out" >&2
  fi
  unset _wr_out _wr_rc _wr_dir || true
fi
# ─────────────────────────────────────────────────────────────────────────────

PROFILE="${DSH_PROFILE_DIR:-/data/dsh/profiles/web}"
FILE="$PROFILE/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js"
MARK='workdsh-root-include-fallback'
ANCHOR='const bootstrapIncludes = /* @__PURE__ */ new WeakMap();'
# 0.2.1-rc.2 起该块缩进由 1 个 tab 变为 2 个 tab（recompose 内多包了一层 try）；
# 用「同缩进多行块」正则匹配，兼容两代布局，且只命中 reconcileProfilePatches 那处。
TARGET_RE='^([ \t]*)const entry = bootstrapIncludes\.get\(ctx\);\n\1if \(entry === void 0\) throw new Error\(`\$\{binName\}: profile reload requires the root Include entry`\);'
HELPER='/**
* workdsh 修复（'"$MARK"'）：profile 与全局安装各有一份本包，bootstrapIncludes 的
* 模块级 WeakMap 不跨副本共享；回退到 Loader 里实际登记的根 Include 条目。
*/
function workdshRootIncludeEntry(ctx) {
	try {
		for (const entry of ctx.loader.entries()) {
			const options = entry?.options;
			if (options !== void 0 && options.id === "include" && options.name === "cordis:include") return entry;
		}
	} catch {}
	return void 0;
}'

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ -f "$FILE" ]] || die "找不到 $FILE（profile 目录不对？可用 DSH_PROFILE_DIR 覆盖）"

if [[ "${1:-}" == "--revert" ]]; then
  backup=$(ls -1t "$FILE".bak.* 2>/dev/null | head -1 || true)
  [[ -n "$backup" ]] || die "没有可用备份（$FILE.bak.*）"
  cp -p "$backup" "$FILE"
  node --check "$FILE" || die "还原后的文件语法检查失败"
  printf '已回滚: %s <- %s\n' "$FILE" "$backup"
  exit 0
fi

if grep -q "$MARK" "$FILE"; then
  printf '已经是补丁状态：\n'; grep -n "$MARK" "$FILE" | head -3; exit 0
fi

[[ "$(grep -c -F "$ANCHOR" "$FILE")" == "1" ]] || die "WeakMap 声明行出现次数不为 1，版本可能已变"
# 多行块必须用 node 计数/替换：grep -F 会把多行 pattern 拆成多个 pattern 分别计数
TARGET_RE="$TARGET_RE" node -e '
const fs = require("node:fs");
const src = fs.readFileSync(process.argv[1], "utf8");
const re = new RegExp(process.env.TARGET_RE, "m");
const n = (src.match(new RegExp(process.env.TARGET_RE, "gm")) || []).length;
if (n !== 1) { console.error(`目标块出现 ${n} 次（期望 1）`); process.exit(2); }
' "$FILE" || die "reconcileProfilePatches 目标块校验失败，版本可能已变"

backup="$FILE.bak.$MARK.$(date +%Y%m%d%H%M%S)"
cp -p "$FILE" "$backup"

ANCHOR="$ANCHOR" HELPER="$HELPER" TARGET_RE="$TARGET_RE" node -e '
const fs = require("node:fs");
const file = process.argv[1];
let src = fs.readFileSync(file, "utf8");
src = src.replace(process.env.ANCHOR, process.env.ANCHOR + "\n" + process.env.HELPER);
src = src.replace(new RegExp(process.env.TARGET_RE, "m"), (m, indent) =>
  `${indent}const entry = bootstrapIncludes.get(ctx) ?? workdshRootIncludeEntry(ctx);\n` +
  `${indent}if (entry === void 0) throw new Error(\`\${binName}: profile reload requires the root Include entry\`);`);
fs.writeFileSync(file, src);
' "$FILE"

node --check "$FILE" || { cp -p "$backup" "$FILE"; die "补丁后语法检查失败，已自动还原"; }

printf '已应用补丁\n  文件: %s\n  备份: %s\n' "$FILE" "$backup"
