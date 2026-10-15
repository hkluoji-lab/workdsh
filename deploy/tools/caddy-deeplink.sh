#!/usr/bin/env bash
# caddy-deeplink.sh —— 登录门禁「深链丢参」修复（2026-09-28）
#
# 背景（实测定位）：
#   ① (portal_gate)      未登录回跳用 `{http.request.uri.path}` —— 查询串被丢弃；
#   ② (portal_gate_root) 根路径未登录时无条件 `redir * /portal` —— 深链在更前面就被丢掉。
#   表现：`/?expert-draft=<id>` 未登录落到门户首页，登录后也回不到草稿视图。
#
# ⚠️ 架构事实（2026-09-28 实测）：**容器内改不了这个文件**。
#   /proc/mounts: `/dev/nvme0n1p2 /etc/caddy/Caddyfile ext4 ro` —— 它是宿主机的
#   **单文件只读绑定**；容器根文件系统本身也是 `ro,overlay`。只有 /data/dsh 与 /workspace 可写。
#   所以「安装」这一步必须在**宿主机**做（脚本会打印命令），容器内只负责校验、留档与旁路验证。
#
# 用法（容器内）：
#   caddy-deeplink.sh status     线上现状 + staged 差异 + 可写性判定（只读）
#   caddy-deeplink.sh verify     旁路端口 A/B 实测（不碰线上、不需重启）
#   caddy-deeplink.sh apply      先校验，再判定可写性：可写则安装；只读则打印宿主侧步骤
#   caddy-deeplink.sh host       直接打印宿主侧替换 + 重启命令
#   caddy-deeplink.sh rollback   可写时还原最近备份；只读时提示走宿主
set -u

LIVE=/etc/caddy/Caddyfile
BACKUP_DIR=/data/dsh/tmp
CADDY=${CADDY:-/usr/bin/caddy}
VALIDATE_HOST=${CADDY_ACCESS_HOST:-dsh.10ge.cn}
STAGED=${STAGED:-$(ls -t "$BACKUP_DIR"/Caddyfile.next.* 2>/dev/null | head -1 || true)}

die() { printf '%s\n' "$*" >&2; exit 1; }

validate() {
  [ -f "$1" ] || die "找不到配置文件：$1"
  CADDY_ACCESS_HOST="$VALIDATE_HOST" timeout 60 "$CADDY" validate --config "$1" --adapter caddyfile >/dev/null 2>&1 \
    || die "语法校验失败：$1（未做任何改动）"
  echo "✓ 语法校验通过：$1"
}

writable() {
  [ -w "$LIVE" ] && ! grep -q " $LIVE ext4 ro" /proc/mounts 2>/dev/null
}

host_steps() {
  cat <<EOF

—— 宿主侧执行（容器内无法写入：/etc/caddy/Caddyfile 是只读单文件绑定）——

# 0) 在宿主机上找绑定源（同时会打印 /data/dsh 的宿主路径）
docker inspect dsh --format '{{range .Mounts}}{{.Source}} => {{.Destination}}{{"\n"}}{{end}}'

# 1) 记下 Caddyfile 的 Source 为 \$SRC；按 /data/dsh 的 Source 换算出 staged 文件的宿主路径：
#    容器 $(basename "${STAGED:-Caddyfile.next}") 位于 /data/dsh/tmp/，
#    宿主路径 = <DATA_SRC>/tmp/$(basename "${STAGED:-Caddyfile.next}")

# 2) 备份 + 替换
SRC=<Caddyfile 的 Source>
STAGED=<DATA_SRC>/tmp/$(basename "${STAGED:-Caddyfile.next}")
cp -p "\$SRC" "\$SRC.bak.deepnext.\$(date +%Y%m%d%H%M%S)"
cp -p "\$STAGED" "\$SRC"
grep -n "next={http.request.uri}" "\$SRC"     # 应命中 2 行

# 3) 重启容器使其生效（约 1 分钟中断）
docker restart dsh

# 4) 重启后回容器内验收
/data/dsh/tools/caddy-deeplink.sh status
EOF
}

case "${1:-status}" in
  status)
    echo "线上：$LIVE  ($(stat -c '%y' "$LIVE" 2>/dev/null | cut -d. -f1))"
    grep -n "uri.path}\|next={http.request.uri}\|@deeplink\|redir \* /portal" "$LIVE" || true
    echo "sha256: $(sha256sum "$LIVE" | awk '{print $1}')"
    echo
    if [ -n "${STAGED:-}" ]; then
      echo "staged：$STAGED"
      echo "sha256: $(sha256sum "$STAGED" | awk '{print $1}')"
      diff -u "$LIVE" "$STAGED" | sed -n '1,40p' || true
    else
      echo "（没有 staged 文件）"
    fi
    echo
    writable && echo "可写性：容器内可写" || echo "可写性：**只读**（单文件绑定，必须走宿主机）"
    ;;

  host) host_steps ;;

  apply)
    [ -n "${STAGED:-}" ] || die "没有 staged 文件"
    validate "$STAGED"
    if ! writable; then
      echo "✗ 容器内不可写：$LIVE 是只读单文件绑定，未做任何改动。"
      host_steps
      exit 2
    fi
    ts=$(date +%Y%m%d%H%M%S)
    bk="$BACKUP_DIR/Caddyfile.bak.beforeapply.$ts"
    cp -p "$LIVE" "$bk" && cp "$STAGED" "$LIVE" || die "写入失败；线上备份在 $bk"
    echo "✓ 已安装（未重启）：$LIVE"
    echo "  线上备份：$bk"
    echo "  下一步：宿主侧重启容器（docker restart dsh / 1Panel 重启 dsh）"
    ;;

  rollback)
    bk=$(ls -t "$BACKUP_DIR"/Caddyfile.bak.* 2>/dev/null | head -1 || true)
    [ -n "$bk" ] || die "找不到任何备份"
    validate "$bk"
    if ! writable; then
      echo "✗ 容器内不可写，未做任何改动。请把 $bk 复制到宿主侧覆盖 Caddyfile 的 Source 后重启。"
      exit 2
    fi
    cp -p "$bk" "$LIVE" && echo "✓ 已还原（未重启）：$LIVE ← $bk"
    ;;

  verify)
    T=$(mktemp -d /data/dsh/tmp/caddy-verify.XXXXXX)
    mkdir -p "$T/a" "$T/b"
    sed 's/:8443/:18443/' "$LIVE"   > "$T/A.caddyfile"
    sed 's/:8443/:18444/' "$STAGED" > "$T/B.caddyfile"
    run_one() {
      XDG_DATA_HOME="$2/data" XDG_CONFIG_HOME="$2/config" CADDY_ACCESS_HOST=127.0.0.1 \
        "$CADDY" run --config "$1" --adapter caddyfile >"$2/log" 2>&1 &
      local pid=$!
      for _ in $(seq 1 60); do curl -sk -o /dev/null "https://127.0.0.1:$3/" && break; sleep 0.5; done
      printf '%s\n' "----- $4 (:$3) -----"
      for u in "/?expert-draft=expert-6006dd2d7ba3" "/" "/index.html?expert-draft=expert-6006dd2d7ba3"; do
        L=$(curl -sk -D - -o /dev/null "https://127.0.0.1:$3$u" | grep -i '^location:' | tr -d '\r' | sed 's/^location: //I')
        printf '  %-46s → %s\n' "$u" "$L"
      done
      kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
    }
    run_one "$T/A.caddyfile" "$T/a" 18443 "线上配置（对照）"
    run_one "$T/B.caddyfile" "$T/b" 18444 "修复后配置"
    echo "临时目录（可删）：$T"
    ;;

  *) die "用法：$0 status|verify|apply|host|rollback" ;;
esac
