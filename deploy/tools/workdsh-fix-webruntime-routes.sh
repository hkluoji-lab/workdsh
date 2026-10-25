#!/usr/bin/env bash
# workdsh 修复：webRuntime 服务缺失 → 插件 web 路由整体不挂载
#
# 症状：
#   1) 「MCP 连接器」面板提示「暂时无法确认 npm 最新版本，请重试」；
#   2) dream-skin 的 /dream-skin/api 404，主题持久化失效。
#
# 根因（2026-10-15 实测）：
#   dsh-mcp-connector@0.2.72 与 dsh-dream-skin 都按较新 DSH（rc.7 时代）编写，
#   使用 `inject = ["webServer", "webRuntime"]` 并在 fence 里直接读
#   `ctx.webRuntime.trustedHosts`。但本机 DSH 0.2.1-alpha.2 全量包检索
#   **没有任何包提供 webRuntime 服务**（核心只有 dsh-host-webserver 的 webServer）。
#   cordis 的 inject 要求列表内全部服务就绪 → 回调永不触发 → 路由从未注册
#   → 前端拿到核心服务器的 404/405（后者无 `allow` 头）→ 显示上述文案。
#   另：--trusted-host 的真实落点是 dsh-client-connection 的 `connection` 服务。
#
# 修法：两处就地补丁（补丁库见 $STORE）
#   mcp-connector: inject 去掉 webRuntime；mountWebRoutes 增加 trustedHosts 入参，
#                  fence 按「显式入参 → webRuntime → connection → []」延迟回退。
#   dream-skin:    inject 去掉 webRuntime；fence 改为同样顺序解析可信域。
#   非 loopback 域名（dsh.10ge.cn）因此放行，非可信域仍 403，安全边界不变。
#
# 为什么需要本脚本：以上改动落在 node_modules，pnpm install / 插件自更新会被还原。
#   本部署入口脚本 /usr/local/bin/docker-entrypoint.sh 只读，无法新增钩子；它通过
#   reapply_profile_reload_fix() 在**每次启动与运行期重启**调用
#   /data/dsh/tools/workdsh-fix-profile-reload.sh。本脚本挂在那个脚本里，
#   因此能跨重装自动重打。
#
# 用法：
#   ./workdsh-fix-webruntime-routes.sh            # 幂等应用（默认）
#   ./workdsh-fix-webruntime-routes.sh --check    # 只报告，不改文件
#   ./workdsh-fix-webruntime-routes.sh --revert   # 反向应用（还原）
# 退出码：0 = 全部已就绪或成功应用；1 = 有插件锚点不匹配（版本可能已变），需人工介入
# 注意：应用前自动备份为 <file>.bak.workdsh-webruntime.<时间戳>，补丁后跑 node --check，
#       语法失败自动反向回滚，绝不把坏文件留在磁盘上。
set -euo pipefail

PROFILE="${DSH_PROFILE_DIR:-/data/dsh/profiles/web}"
STORE="${WORKDSH_WEBRUNTIME_PATCH_DIR:-/data/dsh/tools/workdsh-webruntime-patches}"
MODE="${1:-apply}"

# 目标：<package 相对路径>|<补丁文件名>
TARGETS=(
  # dsh-mcp-connector 已于 2026-10-15 退役：上游 0.2.73 自行修复了本问题
  # （lib/web.js 新增 injectWebRoutes()，用两次独立 inject 实现 webStartup/webRuntime 的逻辑或）。
  # 本机已升级到 0.2.73，不再需要本地补丁。补丁文件与基线备份保留在
  # /data/dsh/home/dsh/mcp-connector-fix/ 与 lib/*.bak.* 中，仅作存档。
  # 如需回退到 0.2.72，把下面这行注释放开即可。
  # "node_modules/dsh-mcp-connector|mcp-connector.patch"
  "node_modules/dsh-dream-skin|dream-skin.patch"
)

rc=0

for row in "${TARGETS[@]}"; do
  rel="${row%%|*}"
  pfile="${row##*|}"
  pkg="$PROFILE/$rel"
  patch="$STORE/$pfile"
  name="$(basename "$rel")"

  if [[ ! -d "$pkg" ]]; then
    printf 'SKIP  %s: 未安装（%s）\n' "$name" "$pkg"
    continue
  fi
  if [[ ! -f "$patch" ]]; then
    printf 'WARN  %s: 补丁库缺少 %s\n' "$name" "$patch" >&2
    rc=1
    continue
  fi

  applied=0
  if git -C "$pkg" apply -p1 --check --reverse "$patch" >/dev/null 2>&1; then
    applied=1
  fi

  if [[ "$MODE" == "--revert" ]]; then
    if [[ "$applied" == 1 ]]; then
      if git -C "$pkg" apply -p1 --reverse "$patch" >/dev/null 2>&1; then
        printf 'REVERT %s: 已还原\n' "$name"
      else
        printf 'WARN  %s: 反向应用失败\n' "$name" >&2
        rc=1
      fi
    else
      printf 'SKIP  %s: 未处于补丁状态，无需还原\n' "$name"
    fi
    continue
  fi

  if [[ "$applied" == 1 ]]; then
    printf 'OK    %s: 已是补丁状态\n' "$name"
    continue
  fi

  if ! git -C "$pkg" apply -p1 --check "$patch" >/dev/null 2>&1; then
    printf 'WARN  %s: 补丁无法应用（锚点不匹配，版本可能已变），保持原样\n' "$name" >&2
    rc=1
    continue
  fi

  if [[ "$MODE" == "--check" ]]; then
    printf 'TODO  %s: 需要打补丁\n' "$name"
    continue
  fi

  stamp="$(date +%Y%m%d%H%M%S)"
  files="$(git -C "$pkg" apply -p1 --numstat "$patch" | awk '{print $3}')" || true
  if [[ -z "$files" ]]; then
    printf 'WARN  %s: 补丁未列出任何文件\n' "$name" >&2
    rc=1
    continue
  fi

  # 备份（沿用仓库既有约定：<file>.bak.<marker>.<时间戳>）
  for f in $files; do
    cp -p "$pkg/$f" "$pkg/$f.bak.workdsh-webruntime.$stamp"
  done

  if ! git -C "$pkg" apply -p1 "$patch" >/dev/null 2>&1; then
    printf 'ERROR %s: 应用失败\n' "$name" >&2
    rc=1
    continue
  fi

  bad=0
  for f in $files; do
    node --check "$pkg/$f" >/dev/null 2>&1 || { bad=1; printf 'ERROR %s: %s 语法检查失败\n' "$name" "$f" >&2; }
  done
  if [[ "$bad" == 1 ]]; then
    git -C "$pkg" apply -p1 --reverse "$patch" >/dev/null 2>&1 || true
    printf 'ERROR %s: 已自动回滚\n' "$name" >&2
    rc=1
    continue
  fi

  printf 'PATCH %s: 已应用并备份（%s）\n' "$name" "$(printf '%s' "$files" | tr '\n' ' ')"
done

exit "$rc"
