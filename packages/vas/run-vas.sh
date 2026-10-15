#!/usr/bin/env bash
# 增值业务产品页后台 —— 看护启动器
# 与门户/问卷服务同构：进程退出后 3 秒自动重启，容器重启后由 entrypoint 重新拉起。
# 用法：run-vas.sh    （在容器内前台运行；entrypoint 会把它放到后台）
set -u

PORTAL_DIR=/data/dsh/portal
MODULE_DIR=/data/dsh/vas

# 与门户共用同一组口令，用于校验门户签发的会话 Cookie（不新建账号体系）
: "${DSH_AUTH_USERNAME:=}"
: "${DSH_AUTH_PASSWORD:=}"

while true; do
  env HOME=/data/dsh/home \
    DSH_AUTH_USERNAME="$DSH_AUTH_USERNAME" \
    DSH_AUTH_PASSWORD="$DSH_AUTH_PASSWORD" \
    PORTAL_MODULE_DIR="$PORTAL_DIR" \
    VAS_BIND=127.0.0.1 \
    VAS_PORT=3085 \
    VAS_DATA_DIR="$MODULE_DIR/data" \
    VAS_PUBLIC_DIR="$MODULE_DIR/public" \
    VAS_PUBLISH_DIR="$PORTAL_DIR/site/products" \
    VAS_BACKUP_DIR="$MODULE_DIR/backups" \
    VAS_ORDERS_DIR="$MODULE_DIR/data/orders" \
    node "$MODULE_DIR/src/server.mjs"
  printf 'vas admin exited (%s); restarting in 3s.\n' "$(date -Is)" >&2
  sleep 3
done
