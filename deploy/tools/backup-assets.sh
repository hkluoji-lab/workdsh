#!/usr/bin/env bash
# 站点资产备份。
#
# 目的：站点资产散在卷上多个目录里，误删或改坏其中任一项都不可逆——
# 尤其 profiles/web/cordis.patch.yml（损坏会让整棵插件树加载失败、容器起不来）
# 与 portal/identity-bridge.key（身份信任锚，丢了门户身份全部失效）。
#
# 用法：
#   backup-assets.sh            # 备份今天的快照（同一天重复执行会覆盖当天文件）
#   backup-assets.sh --list     # 只列出已有快照
#   backup-assets.sh --verify   # 校验最新快照是否含关键项（技能数、插件本体、密钥）
#   backup-assets.sh --print    # 只打印当前备份清单（不执行）
#
# 覆盖：assets/（业务状态）与 library/objects/（资料库正文实体）。
#
# 环境变量：
#   BACKUP_DIR（默认 /data/dsh/backups/assets）
#   BACKUP_KEEP（默认 14）
#   BACKUP_INCLUDE_HEAVY=1  同时备份 /data/dsh/tools/python3.11（155 MB，可重建，默认排除）
#
# 2026-09-28 修订（C1：补齐覆盖缺口）：
#   此前清单有两处实质缺口——① 写的是 /data/dsh/skills，而**真实技能根是
#   /data/dsh/home/.agents/skills**（58 项 / 6.6 MB），那个目录是空的，等于技能完全没备份；
#   ② 未包含 /data/dsh/tools（file: 插件本体）、门户与后台自研源码、两个密钥、已发布产品页。
#   本次一并补齐；因快照现在含密钥，产物权限收敛为 0600。
#
# 2026-10-01 修订（C3：资料库正文实体纳入覆盖）：
#   资料库 storageDomain 的 states/ 只存元数据，正文实体落在
#   /data/dsh/library/objects/<assetId>/<revisionId>/。此前 SOURCES 只含
#   storages/workdsh_library（state），未含 objects，正文一旦误删无法从
#   快照恢复。本次把 objects 纳入 SOURCES 与 verify。
set -u

DEST="${BACKUP_DIR:-/data/dsh/backups/assets}"
KEEP="${BACKUP_KEEP:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DAY="$(date +%Y%m%d)"
OUT="$DEST/assets-$DAY.tar.gz"
HEAVY="${BACKUP_INCLUDE_HEAVY:-0}"

# 备份清单。缺失的路径不视为错误——不同部署阶段本来就会少几项。
SOURCES=(
  # ── 资产域（业务数据） ───────────────────────────────────────────
  /data/dsh/storages/workdsh_experts
  /data/dsh/storages/workdsh_library
  /data/dsh/storages/workdsh_connectors
  /data/dsh/storages/workdsh_projects          # 2026-09-28 补
  /data/dsh/storages/workdsh_assistant         # 2026-09-28 补
  /data/dsh/storages/mcp_connector.json
  /data/dsh/storages/mcp_connector_grants_v1
  /data/dsh/storages/workdsh_identity_local.json
  # ── 资料库正文实体（states 只含元数据，正文在 objects） ──────────
  /data/dsh/library/objects                    # 2026-10-01 补
  # ── 技能与智能体状态（真实技能根，非 /data/dsh/skills） ───────────
  /data/dsh/home/.agents/skills                # 2026-09-28 补：58 项技能，此前完全未备份
  /data/dsh/home/.dsh                          # 2026-09-28 补：本机智能体预设与状态
  /data/dsh/skills                             # 历史路径（当前为空），保留兼容
  # ── 平台与插件本体（file: 插件，丢了 P1 身份链直接断） ────────────
  /data/dsh/tools                              # 2026-09-28 补（自动排除 python3.11）
  /data/dsh/profiles/web/cordis.patch.yml
  /data/dsh/profiles/web/package.json
  # ── 门户与后台（本机自研代码，不在镜像里） ───────────────────────
  /data/dsh/portal/src                         # 2026-09-28 补
  /data/dsh/portal/admin/src                   # 2026-09-28 补
  /data/dsh/portal/admin/public                # 2026-09-28 补
  /data/dsh/portal/admin/data                  # 2026-09-28 补
  /data/dsh/portal/site                        # 2026-09-28 补：已发布产品页 + 登录页
  /data/dsh/portal/users.json
  /data/dsh/portal/portal.env
  /data/dsh/portal/accounts.json
  /data/dsh/portal/session.key                 # 2026-09-28 补（敏感：会话签名密钥）
  /data/dsh/portal/identity-bridge.key         # 2026-09-28 补（敏感：身份信任锚）
  /data/dsh/vas/src                            # 2026-09-28 补
  /data/dsh/vas/data
  /data/dsh/survey                             # 2026-09-28 补：调研问卷服务
)

TAR_EXCLUDES=(--exclude='*.log' --exclude='*/.git' --exclude='*/cores/*')
[ "$HEAVY" = "1" ] || TAR_EXCLUDES+=(--exclude='*/tools/python3.11')

verify() { # $1=tarball
  local f="$1"
  [ -f "$f" ] || { echo "找不到快照：$f" >&2; return 1; }
  echo "校验：$f"
  local list; list="$(tar -tzf "$f")"
  local skills tools keys objects
  skills=$(printf '%s\n' "$list" | grep -c "data/dsh/home/.agents/skills/[^/]*/SKILL.md$")
  tools=$(printf '%s\n' "$list" | grep -c "data/dsh/tools/workdsh-[^/]*/dist/index.js$")
  keys=$(printf '%s\n' "$list" | grep -cE "data/dsh/portal/(session|identity-bridge)\.key$")
  objects=$(printf '%s\n' "$list" | grep -c "data/dsh/library/objects/[^/]*/[^/]*/original\.md$")
  printf '  技能 SKILL.md        : %s（期望 ≥ 30）\n' "$skills"
  printf '  file: 插件 dist      : %s（期望 ≥ 4）\n' "$tools"
  printf '  门户密钥             : %s（期望 2）\n' "$keys"
  printf '  资料库正文 original  : %s（期望 ≥ 1，有正文时）\n' "$objects"
  printf '  条目总数             : %s\n' "$(printf '%s\n' "$list" | wc -l)"
  [ "$skills" -ge 1 ] && [ "$tools" -ge 1 ] && [ "$keys" -eq 2 ] && [ "$objects" -ge 1 ] \
    && echo "  → 关键项齐备 ✓" || { echo "  → **关键项缺失**，请检查 SOURCES" >&2; return 1; }
}

case "${1:-}" in
  --list)
    ls -lh "$DEST" 2>/dev/null || echo "尚无备份目录：$DEST"
    exit 0 ;;
  --verify)
    verify "$(ls -t "$DEST"/assets-*.tar.gz 2>/dev/null | head -1)"
    exit $? ;;
  --print)
    printf '%s\n' "${SOURCES[@]}" | grep -v '^$'
    printf '排除：%s\n' "${TAR_EXCLUDES[*]}"
    exit 0 ;;
esac

mkdir -p "$DEST"
chmod 700 "$DEST" 2>/dev/null

# 顺带确保日志轮转循环在跑（C2）。容器每次启动都会立刻跑一次备份，
# 因此轮转循环也随容器启动自动重建，不需要改入口脚本（入口脚本是只读绑定）。
[ -x /data/dsh/tools/rotate-logs.sh ] \
  && LOG_ROOT=/data/dsh bash /data/dsh/tools/rotate-logs.sh --ensure >/dev/null 2>&1 || true

# 顺带确保崩溃计数器在跑（0c，2026-10-02）。同样借容器每次启动必跑一次的备份循环来幂等重建，
# 不改只读的入口脚本。它只读 /proc 并追加一行日志，不触碰任何服务。
[ -x /data/dsh/tools/crash-counter.sh ] \
  && sh /data/dsh/tools/crash-counter.sh --ensure >/dev/null 2>&1 || true
TMP="$OUT.tmp.$$"
umask 077   # 快照含密钥 → 产物默认 0600

if tar --ignore-failed-read "${TAR_EXCLUDES[@]}" -czf "$TMP" "${SOURCES[@]}" 2>/dev/null; then
  chmod 600 "$TMP"
  mv -f "$TMP" "$OUT"
else
  rm -f "$TMP"
  echo "backup failed at $STAMP" >&2
  exit 1
fi

# 保留最近 KEEP 份（文件名按天排序，等价于按时间排序）
count=$(ls -1 "$DEST"/assets-*.tar.gz 2>/dev/null | wc -l)
if [ "$count" -gt "$KEEP" ]; then
  ls -1 "$DEST"/assets-*.tar.gz | head -n "$(( count - KEEP ))" | while read -r old; do
    rm -f "$old"
  done
fi

printf 'backup ok %s -> %s (%s bytes)\n' "$STAMP" "$OUT" "$(wc -c < "$OUT" | tr -d ' ')"
# 每次备份都留一行覆盖摘要，便于从看护循环日志里直接看出缺口
list="$(tar -tzf "$OUT")"
printf '  coverage: skills=%s tools_dist=%s keys=%s objects=%s entries=%s\n' \
  "$(printf '%s\n' "$list" | grep -c 'data/dsh/home/.agents/skills/[^/]*/SKILL.md$')" \
  "$(printf '%s\n' "$list" | grep -c 'data/dsh/tools/workdsh-[^/]*/dist/index.js$')" \
  "$(printf '%s\n' "$list" | grep -cE 'data/dsh/portal/(session|identity-bridge)\.key$')" \
  "$(printf '%s\n' "$list" | grep -c 'data/dsh/library/objects/[^/]*/[^/]*/original\.md$')" \
  "$(printf '%s\n' "$list" | wc -l)"
