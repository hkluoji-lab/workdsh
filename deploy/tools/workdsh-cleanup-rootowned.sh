#!/usr/bin/env bash
# workdsh 清理：profile/node_modules 下的 .rootowned-* 残留副本
#
# 背景
#   /data/dsh/profiles/web/node_modules 下存在 27 个以 `.rootowned-` 为前缀的目录，
#   属主 root:root、权限 755，共约 225 MB。它们是被「改名隔离」的旧包副本：
#     - 以 `.` 开头 → 不是合法包名，Node/pnpm 解析器永远不会选中它们；
#     - package.json / cordis.yml / cordis.patch.yml / .modules.yaml / .pnpm 存储
#       / global-dsh / runtime 中均无任何引用（脚本会逐个复核）；
#     - 每一个都有同名活跃包存在，因此不含独占内容。
#   风险：若有人执行「把 .rootowned-X 改回 X」之类的恢复操作，会立刻把**旧版本**
#   （例如 dsh-mcp-connector 0.2.66）变成活跃版本，使已修复的缺陷复活。
#
# 本脚本的行为
#   默认        ：dry-run，只列出将处理的对象与总计体积，不改动任何文件
#   --apply     ：移动到隔离目录 <backups>/rootowned-residue-<时间戳>/（可逆），需 root
#   --purge     ：直接删除（不可逆），需 root 且显式确认
#
# 用法
#   bash workdsh-cleanup-rootowned.sh                 # 预演
#   sudo bash workdsh-cleanup-rootowned.sh --apply    # 移入隔离区
#   sudo bash workdsh-cleanup-rootowned.sh --purge --yes   # 彻底删除
set -euo pipefail

PROFILE="${DSH_PROFILE_DIR:-/data/dsh/profiles/web}"
NM="$PROFILE/node_modules"
BACKUP_ROOT="${ROOTOWNED_BACKUP_DIR:-/data/dsh/backups}"
MODE=dry
CONFIRM=no

for a in "$@"; do
  case "$a" in
    --apply) MODE=apply ;;
    --purge) MODE=purge ;;
    --yes) CONFIRM=yes ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "未知参数: $a" >&2; exit 2 ;;
  esac
done

[[ -d "$NM" ]] || { echo "目录不存在: $NM" >&2; exit 2; }
cd "$NM"

mapfile -t DIRS < <(find . -maxdepth 1 -type d -name '.rootowned-*' -printf '%f\n' 2>/dev/null | sort)
[[ ${#DIRS[@]} -gt 0 ]] || { echo "未发现 .rootowned-* 残留，无需处理。"; exit 0; }

echo "profile      : $PROFILE"
echo "残留目录数   : ${#DIRS[@]}"
echo "模式         : $MODE"
echo

# ── 前置安全校验：不满足任一条即整体中止 ──────────────────────────────
fail=0
echo "── 安全校验 ──"
for d in "${DIRS[@]}"; do
  name="${d#.rootowned-}"
  # 1) 必须有同名活跃包（否则可能含独占内容）
  if [[ ! -e "$name" ]]; then
    echo "  ✗ $d：缺少同名活跃包 $name —— 可能含独占内容，中止"; fail=1
  fi
  # 2) 不得被任何清单引用
  if grep -qF "rootowned" "$PROFILE/package.json" 2>/dev/null \
     || grep -qF "rootowned" "$PROFILE/cordis.yml" 2>/dev/null \
     || grep -qF "rootowned" "$PROFILE/cordis.patch.yml" 2>/dev/null \
     || grep -qF "rootowned" "$NM/.modules.yaml" 2>/dev/null; then
    echo "  ✗ $d：在 profile 清单中被引用，中止"; fail=1
  fi
  # 3) 必须确实是 root 属主之外不可写的隔离副本（防止误删活跃包）
  owner=$(stat -c '%U' "$d" 2>/dev/null || echo '?')
  [[ "$owner" == "root" ]] || echo "  ! $d：属主为 $owner（非 root），请人工确认"
done
[[ "$fail" == 0 ]] || { echo; echo "安全校验未通过，未做任何改动。"; exit 1; }
echo "  ✅ 全部通过（均有活跃对应包、无清单引用）"
echo

total=$(du -csh "${DIRS[@]}" 2>/dev/null | tail -1 | cut -f1)
echo "── 待处理对象（合计 $total）──"
for d in "${DIRS[@]}"; do
  printf '  %-46s %s  %s\n' "$d" "$(stat -c '%U:%G %a' "$d")" "$(du -sh "$d" 2>/dev/null | cut -f1)"
done
echo

if [[ "$MODE" == dry ]]; then
  echo "── 预演结束，未改动任何文件 ──"
  echo "执行以下命令可将其移入隔离区（可逆）："
  echo "  sudo bash $0 --apply"
  exit 0
fi

if [[ "$(id -u)" != "0" ]]; then
  echo "✗ --apply/--purge 需要 root（残留属主为 root，当前用户 $(id -un) 无权限）。" >&2
  echo "  请执行： sudo bash $0 ${MODE/apply/--apply}" >&2
  exit 1
fi

if [[ "$MODE" == purge && "$CONFIRM" != yes ]]; then
  echo "✗ --purge 不可逆，需显式加 --yes 确认。" >&2
  exit 1
fi

if [[ "$MODE" == apply ]]; then
  dest="$BACKUP_ROOT/rootowned-residue-$(date +%Y%m%d%H%M%S)"
  mkdir -p "$dest"
  echo "── 移动到隔离区：$dest ──"
  for d in "${DIRS[@]}"; do
    mv "$d" "$dest/" && echo "  → $d"
  done
  echo
  echo "✅ 已移入隔离区。确认服务正常后，可用以下命令彻底删除："
  echo "  sudo rm -rf '$dest'"
  echo "回滚（如需）："
  echo "  sudo mv '$dest'/.rootowned-* '$NM/'"
else
  echo "── 彻底删除 ──"
  for d in "${DIRS[@]}"; do rm -rf "$d" && echo "  ✗ 已删除 $d"; done
  echo "✅ 完成"
fi
