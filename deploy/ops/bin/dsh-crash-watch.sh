#!/usr/bin/env bash
#
# dsh node SIGSEGV crash watch (2026-11-14)
#
# 本文件合并了两版同名脚本，替代 2026-10 的未部署草稿：
#   - 草稿（deploy/ops/bin/dsh-crash-watch.sh，从未上线）：10 分钟窗口分类计数
#   - 本版：累积计量 + 逐条留档 + 连崩告警 + 3080 探针自愈
# 旧草稿依赖的 "exited after startup" / "host preparation failed" / "cred-lock"
# 三个日志串在现网已消失（实测均为 0），窗口口径已按实测存在的事件重写（见下）。
#
# 职责（与 dsh-module-guard-watch.sh 严格分离，互不改写对方状态）：
#   1) 计量 DeepSeek Harness node 主进程的 SIGSEGV 崩溃频次（V8 GC 缺陷，见
#      workdsh docs/evidence/v8-gc-sigsegv-repro.md）
#   2) 记录每次崩溃时间戳与「崩溃时的运行时配置」（是否已加 GC 缓解旗标），
#      使 A/B 对照可分离 —— 这是判断缓解是否有效、是否值得保留的唯一量表
#   3) 1 小时窗口内崩溃 >= CLUSTER_THRESHOLD 次时写 ALERT（连崩簇特征）
#   4) 容器内 3080 探针连续失败 >= PROBE_GRACE 秒时，主动 docker compose restart
#      （比 docker restart:always 更快收敛；仅在探针确实不可用时动作）
#
# 部署：/usr/local/bin/dsh-crash-watch.sh（0755 root:root）
#       /etc/cron.d/dsh-crash-watch（*/5 * * * * root）
# 状态：/var/lib/dsh-crash-watch/{state,crash.log,watch.log,log.txt}
# 回退：rm /etc/cron.d/dsh-crash-watch 即停；本脚本除第 4 项外不改动线上状态。
#
set -uo pipefail

# cron 的 PATH 与交互 shell 不同，显式声明（脚本依赖 docker / curl）
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

CONTAINER=${DSH_CONTAINER:-dsh}
APP_DIR=${DSH_APP_DIR:-/opt/1panel/apps/deepseek-harness/deepseek-harness}
ENTRYPOINT=${DSH_ENTRYPOINT:-$APP_DIR/data/dsh/tmp/docker-entrypoint.sh}

STATE_DIR=/var/lib/dsh-crash-watch
STATE=$STATE_DIR/state                 # key=value：上次容器 ID / 计数 / 时间戳
CRASH_LOG=$STATE_DIR/crash.log         # NDJSON：每次新崩溃一行
WATCH_LOG=$STATE_DIR/watch.log         # 人类可读运行记录
WINDOW_LOG=$STATE_DIR/log.txt          # 每轮一行窗口分类计数（趋势；含旗标臂）
                                       # 文件名沿用 2026-10 草稿，dsh-crash-report.sh 依赖该路径
PROBE_FAIL_SINCE=$STATE_DIR/probe_fail_since

CLUSTER_WINDOW=3600      # 连崩簇统计窗口（秒）
CLUSTER_THRESHOLD=3      # 窗口内 >= 此次数即告警
PROBE_GRACE=90           # 探针连续失败多少秒后主动重启
RESTART_COOLDOWN=600     # 主动重启最小间隔（秒），防抖
WINDOW_MIN=10            # 窗口分类计数回看分钟数（沿用旧草稿口径）

mkdir -p "$STATE_DIR"

log() { printf '%s %s\n' "$(date -Iseconds)" "$*" >>"$WATCH_LOG"; }

# watch.log 自滚动，避免无限增长
if [ -f "$WATCH_LOG" ] && [ "$(wc -l <"$WATCH_LOG")" -gt 2000 ]; then
  tail -1000 "$WATCH_LOG" >"$WATCH_LOG.tmp" && mv "$WATCH_LOG.tmp" "$WATCH_LOG"
fi

# ── 前置：容器不在就什么都不做（别把停机当崩溃）
if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  log "SKIP container '$CONTAINER' not found"
  exit 0
fi
CID=$(docker inspect -f '{{.Id}}' "$CONTAINER" 2>/dev/null || true)
if [ -z "$CID" ]; then
  log "SKIP cannot read container id"
  exit 0
fi
RUNNING=$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || echo false)

# ── 读旧状态
prev_cid=""; prev_count=0; last_crash_ts=""; last_restart=0
if [ -f "$STATE" ]; then
  # shellcheck disable=SC1090
  . "$STATE" 2>/dev/null || true
  prev_cid=${prev_cid:-}; prev_count=${prev_count:-0}
  last_crash_ts=${last_crash_ts:-}; last_restart=${last_restart:-0}
fi

# ── 统计崩溃（docker logs 累计到当前容器实例；容器被重建时计数会归零）
if [ "$RUNNING" = "true" ]; then
  count=$(docker logs "$CONTAINER" 2>&1 | grep -c 'Segmentation fault' || true)
  all_ts=$(docker logs -t "$CONTAINER" 2>&1 | grep 'Segmentation fault' | awk '{print $1}')
else
  count=0; all_ts=""
fi
count=${count:-0}

recreated=0
if [ -n "$prev_cid" ] && [ "$prev_cid" != "$CID" ]; then
  recreated=1
  log "NOTE container recreated (cid changed), crash counter reset prev=$prev_count"
  rm -f "$PROBE_FAIL_SINCE"
fi

# ── 当前生效的运行时配置（用于 A/B 对照归因）
runtime_version="unknown"
if [ "$RUNNING" = "true" ]; then
  runtime_version=$(docker exec "$CONTAINER" node -v 2>/dev/null | tr -d '\r' || true)
fi
runtime_version=${runtime_version:-unknown}
gc_flags=$(grep -m1 'bin.js' "$ENTRYPOINT" 2>/dev/null \
             | grep -oE '\-\-no-[a-z-]+' | sort -u | tr '\n' ' ' | sed 's/ $//')
gc_flags=${gc_flags:-none}

# ── 逐个登记新崩溃（按时间戳增量，避免漏记/重记）
new=0
if [ -n "$all_ts" ]; then
  while IFS= read -r ts; do
    [ -n "$ts" ] || continue
    if [ -n "$last_crash_ts" ] && [ ! "$ts" \> "$last_crash_ts" ]; then
      continue
    fi
    new=$((new + 1))
    printf '{"ts":"%s","detectedAt":"%s","node":"%s","gcFlags":"%s","cluster":%s}\n' \
      "$ts" "$(date -Iseconds)" "$runtime_version" "$gc_flags" "$(date +%s)" \
      >>"$CRASH_LOG"
    last_crash_ts=$ts
  done <<<"$all_ts"
fi

# ── 近 1 小时崩溃数（连崩簇判定）
now=$(date +%s)
hour_count=0
if [ -n "$all_ts" ]; then
  while IFS= read -r ts; do
    [ -n "$ts" ] || continue
    e=$(date -d "$ts" +%s 2>/dev/null) || continue
    if [ $((now - e)) -le "$CLUSTER_WINDOW" ]; then
      hour_count=$((hour_count + 1))
    fi
  done <<<"$all_ts"
fi

# ── 窗口分类计数（并入 2026-10 草稿 dsh-crash-watch.sh 的原始口径）
# 旧草稿断言的 "exited after startup" / "host preparation failed" / "cred-lock"
# 在当前派生 entrypoint 与现网日志中均已不存在（实测计数为 0），故只保留实测
# 存在的分类维度，避免留下永远为 0 的假指标。
# 字段名 post_ready_crash 沿用旧草稿（dsh-crash-report.sh 按此名解析）：
# 现网无「就绪后独立崩溃」事件行，运行期崩溃即 SIGSEGV，故该值 = 窗口内 seg 数。
win_seg=0; win_startup=0
if [ -n "$all_ts" ] && [ "$RUNNING" = "true" ]; then
  A=$(date -u -d "$WINDOW_MIN minutes ago" +%Y-%m-%dT%H:%M:%S 2>/dev/null || true)
  B=$(date -u +%Y-%m-%dT%H:%M:%S)
  if [ -n "$A" ]; then
    T=$(docker logs -t "$CONTAINER" --since "$A" --until "$B" 2>&1 || true)
    win_seg=$(printf '%s\n' "$T" | grep -c 'Segmentation fault' || true)
    win_startup=$(printf '%s\n' "$T" | grep -c 'exited during startup' || true)
  fi
fi
win_seg=${win_seg:-0}; win_startup=${win_startup:-0}
printf '%s health=%s flags=[%s] seg=%s post_ready_crash=%s startup_retry=%s\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%S)" "$(docker inspect "$CONTAINER" -f '{{.State.Health.Status}}' 2>/dev/null || echo unknown)" \
  "$gc_flags" "$win_seg" "$win_seg" "$win_startup" >>"$WINDOW_LOG"
if [ -f "$WINDOW_LOG" ] && [ "$(wc -l <"$WINDOW_LOG")" -gt 5000 ]; then
  tail -2500 "$WINDOW_LOG" >"$WINDOW_LOG.tmp" && mv "$WINDOW_LOG.tmp" "$WINDOW_LOG"
fi

# ── 探针：容器内 3080（与 docker healthcheck 同一判据）
probe="skip"
if [ "$RUNNING" = "true" ]; then
  probe=$(docker exec "$CONTAINER" curl -s -o /dev/null -w '%{http_code}' \
            --max-time 5 http://127.0.0.1:3080/ 2>/dev/null || echo 000)
fi
probe=${probe:-000}

restarted=0
if [ "$RUNNING" = "true" ]; then
  if [ "$probe" = "200" ]; then
    rm -f "$PROBE_FAIL_SINCE"
  else
    if [ ! -f "$PROBE_FAIL_SINCE" ]; then
      date +%s >"$PROBE_FAIL_SINCE"
    fi
    since=$(cat "$PROBE_FAIL_SINCE" 2>/dev/null || echo "$now")
    since=${since:-$now}
    elapsed=$((now - since))
    if [ "$elapsed" -ge "$PROBE_GRACE" ] && [ $((now - last_restart)) -ge "$RESTART_COOLDOWN" ]; then
      log "ALERT probe_3080=$probe unavailable for ${elapsed}s -> docker compose restart"
      if (cd "$APP_DIR" && docker compose restart >>"$WATCH_LOG" 2>&1); then
        log "RECOVER restart issued"
        restarted=1
        last_restart=$now
        rm -f "$PROBE_FAIL_SINCE"
      else
        log "FAIL docker compose restart failed"
      fi
    fi
  fi
fi

# ── 写回状态
{
  printf 'prev_cid=%q\n' "$CID"
  printf 'prev_count=%q\n' "$count"
  printf 'last_crash_ts=%q\n' "$last_crash_ts"
  printf 'last_restart=%q\n' "$last_restart"
} >"$STATE"

# ── 记录与告警
if [ "$hour_count" -ge "$CLUSTER_THRESHOLD" ]; then
  log "ALERT crash_cluster last1h=$hour_count (>=${CLUSTER_THRESHOLD}) total=$count new=$new node=$runtime_version flags=[$gc_flags]"
elif [ "$new" -gt 0 ]; then
  log "WARN new_crash=$new last1h=$hour_count total=$count node=$runtime_version flags=[$gc_flags]"
else
  log "OK crashes_total=$count new=0 last1h=$hour_count probe=$probe node=$runtime_version flags=[$gc_flags] recreated=$recreated restarted=$restarted"
fi

exit 0
