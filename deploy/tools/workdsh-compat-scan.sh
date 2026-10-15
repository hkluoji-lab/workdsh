#!/usr/bin/env bash
# workdsh 兼容性巡检包装脚本（按需运行，不建议放进启动流程——全量扫描约 50 秒）。
#
# 用途：DSH 升级 / 插件升级后，检测「插件 inject 了某个 cordis 服务，但已安装包无一提供」
#       这类会**静默失效**的兼容性断点。
#
# 用法：
#   bash workdsh-compat-scan.sh                # 扫描活跃 profile
#   bash workdsh-compat-scan.sh --strict       # 任何未提供项都算失败
#   bash workdsh-compat-scan.sh --json         # 输出 JSON（便于接入监控）
#   PROFILE_DIR=/path bash workdsh-compat-scan.sh
#
# 退出码：0 = 无服务端缺口；1 = 有服务端缺口（--strict 下为任意缺口）；2 = 参数/环境错误
set -euo pipefail

SCAN=/data/dsh/tools/workdsh-compat-scan.mjs
PROFILE="${PROFILE_DIR:-/data/dsh/profiles/web}"
LOG="${COMPAT_SCAN_LOG:-/data/dsh/tmp/compat-scan.log}"

[[ -f "$SCAN" ]] || { echo "缺少扫描器：$SCAN" >&2; exit 2; }
[[ -d "$PROFILE" ]] || { echo "profile 目录不存在：$PROFILE" >&2; exit 2; }

mkdir -p "$(dirname "$LOG")" 2>/dev/null || true

set +e
OUT="$(node "$SCAN" --profile "$PROFILE" "$@" 2>&1)"
RC=$?
set -e

printf '%s\n' "$OUT"
{
  printf '===== %s | profile=%s | rc=%s =====\n' "$(date -Is)" "$PROFILE" "$RC"
  printf '%s\n' "$OUT"
} >> "$LOG" 2>/dev/null || true

exit "$RC"
