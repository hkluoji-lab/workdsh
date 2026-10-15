#!/usr/bin/env bash
# 在企业服务器（192.168.11.205）上部署「企业 Agent 工作台调研问卷」。
#
#   bash deploy.sh prepare   # 拷贝文件 + 打补丁 + 语法/运行预检，不重启容器
#   bash deploy.sh restart   # 重启 dsh 容器生效，并写验证报告
#
# 幂等：重复执行不会重复插入路由或启动块。
# 安全：派生结果先写到 *.survey.new 并通过 caddy adapt / bash -n 校验，
#       校验通过后才覆盖生产文件；校验失败不会留下坏配置。
# 报告：<app>/data/dsh/survey/deploy-report.txt
set -uo pipefail

MODE="${1:-prepare}"
A=/opt/1panel/apps/deepseek-harness/deepseek-harness
SRC=$A/data/dsh/home/dsh/survey
DST=$A/data/dsh/survey
TMP=$A/data/dsh/tmp
STAMP=$(date +%Y%m%d%H%M%S)
REPORT=$DST/deploy-report.txt
PUBLIC=https://dsh.10ge.cn/survey/
NEW_CADDY=0
NEW_ENTRY=0

mkdir -p "$DST/data"
log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" | tee -a "$REPORT"; }
fail() { printf '[%s][FAIL] %s\n' "$(date +%H:%M:%S)" "$*" | tee -a "$REPORT" >&2; exit 1; }

# ---------------------------------------------------------------- 预检
preflight() {
  log "=== 部署开始 ($MODE) ==="
  for f in index.html admin.html server.mjs deploy/add-survey-caddy.py deploy/add-survey-entrypoint.py; do
    [[ -f "$SRC/$f" ]] || fail "缺少源文件 $SRC/$f"
  done
  docker inspect dsh --format '{{.State.Status}}' >/dev/null 2>&1 || fail "容器 dsh 不存在"
  [[ -f "$TMP/Caddyfile" ]] || fail "缺少 $TMP/Caddyfile"
  [[ -f "$TMP/docker-entrypoint.sh" ]] || fail "缺少 $TMP/docker-entrypoint.sh"
}

# ---------------------------------------------------------------- 拷贝
copy_files() {
  log "拷贝页面与服务到 $DST"
  install -o 1000 -g 1000 -m 0644 "$SRC/index.html" "$DST/index.html"
  install -o 1000 -g 1000 -m 0644 "$SRC/admin.html" "$DST/admin.html"
  install -o 1000 -g 1000 -m 0755 "$SRC/server.mjs" "$DST/server.mjs"
  install -o 1000 -g 1000 -m 0755 "$SRC/deploy/add-survey-caddy.py" "$TMP/add-survey-caddy.py"
  install -o 1000 -g 1000 -m 0755 "$SRC/deploy/add-survey-entrypoint.py" "$TMP/add-survey-entrypoint.py"
  mkdir -p "$DST/data"
  chown -R 1000:1000 "$DST"
  log "已放置：$(ls "$DST" | tr '\n' ' ')"
}

# ------------------------------------------------- 派生（先不覆盖生产文件）
patch_files() {
  if grep -q '127.0.0.1:3082' "$TMP/Caddyfile"; then
    log "Caddyfile 已含 /survey 路由，跳过派生"
  else
    cp -p "$TMP/Caddyfile" "$TMP/Caddyfile.bak.survey.$STAMP"
    python3 "$TMP/add-survey-caddy.py" "$TMP/Caddyfile" "$TMP/Caddyfile.survey.new" || fail "Caddyfile 派生失败"
    NEW_CADDY=1
    log "Caddyfile 派生完成（待校验）：待复制 $(wc -c < "$TMP/Caddyfile.survey.new") 字节"
  fi

  if grep -q 'survey/server.mjs' "$TMP/docker-entrypoint.sh"; then
    log "entrypoint 已含收集服务启动，跳过派生"
  else
    cp -p "$TMP/docker-entrypoint.sh" "$TMP/docker-entrypoint.sh.bak.survey.$STAMP"
    python3 "$TMP/add-survey-entrypoint.py" "$TMP/docker-entrypoint.sh" "$TMP/docker-entrypoint.sh.survey.new" || fail "entrypoint 派生失败"
    NEW_ENTRY=1
    bash -n "$TMP/docker-entrypoint.sh.survey.new" || fail "派生 entrypoint 语法检查失败"
    log "entrypoint 派生完成（待校验），语法检查通过"
  fi
}

# ------------------------------------------------- 校验后才是落盘
validate_and_apply() {
  local target="$TMP/Caddyfile"
  [[ "$NEW_CADDY" == 1 ]] && target="$TMP/Caddyfile.survey.new"

  # 容器内看到的是宿主 $TMP 挂载出来的 /data/dsh/tmp（rootfs 只读，docker cp 不可用）
  local in_container_path="/data/dsh/tmp/$(basename "$target")"
  if ! docker exec -e CADDY_ACCESS_HOST=dsh.10ge.cn dsh \
      caddy adapt --config "$in_container_path" --adapter caddyfile > /tmp/caddy-adapt.json 2>/tmp/caddy-adapt.err; then
    tail -5 /tmp/caddy-adapt.err | tee -a "$REPORT"
    fail "Caddyfile 语法验证不通过，生产文件未被修改"
  fi
  grep -q '3082' /tmp/caddy-adapt.json || fail "适配结果缺少 3082 上游，生产文件未被修改"
  log "Caddyfile 语法验证通过（caddy adapt，上游含 3082）"

  if [[ "$NEW_CADDY" == 1 ]]; then
    cat "$TMP/Caddyfile.survey.new" > "$TMP/Caddyfile"
    log "Caddyfile 已生效（备份 Caddyfile.bak.survey.$STAMP）"
  fi
  if [[ "$NEW_ENTRY" == 1 ]]; then
    cat "$TMP/docker-entrypoint.sh.survey.new" > "$TMP/docker-entrypoint.sh"
    chmod 0755 "$TMP/docker-entrypoint.sh"
    log "entrypoint 已生效（备份 docker-entrypoint.sh.bak.survey.$STAMP）"
  fi
}

# ---------------------------------------------------------------- 运行预检
precheck_runtime() {
  log "在容器内试跑收集服务（预检，不重启容器）"
  stop_probe   # 先清掉可能的残留实例，否则端口冲突
  docker exec -d dsh gosu node env HOME=/data/dsh/home node /data/dsh/survey/server.mjs
  local ok=""
  for _ in $(seq 1 20); do
    if docker exec dsh curl -fsS --max-time 2 http://127.0.0.1:3082/survey/healthz >/tmp/hz.json 2>/dev/null; then ok=1; break; fi
    sleep 0.5
  done
  if [[ -z "$ok" ]]; then
    stop_probe || true
    fail "收集服务试跑失败，容器未重启；请查看 docker logs dsh"
  fi
  log "收集服务预检通过：$(cat /tmp/hz.json)"
  docker exec dsh curl -s --max-time 3 -o /dev/null -w '表单页=%{http_code} 大小=%{size_download}\n' http://127.0.0.1:3082/survey/ | tee -a "$REPORT"
  docker exec dsh curl -s --max-time 3 -o /dev/null -w '管理台无令牌=%{http_code}（期望 404）\n' http://127.0.0.1:3082/survey/admin | tee -a "$REPORT"
  docker exec dsh curl -s --max-time 3 -o /dev/null -w '健康探针=%{http_code}（期望 200）\n' http://127.0.0.1:3082/survey/healthz | tee -a "$REPORT"
  stop_probe
}

# 预检进程必须收掉，否则重启后端口冲突（容器精简，无 pkill）。
# 注意：匹配必须按「参数精确等于启动路径」，否则本脚本自身的 cmdline
# 也含该字符串，node 会先把自己杀掉（踩过一次）。
stop_probe() {
  docker exec dsh node -e '
    const fs = require("fs");
    const T = "/data/dsh/survey/server.mjs";
    let n = 0;
    for (const d of fs.readdirSync("/proc")) {
      if (!/^[0-9]+$/.test(d)) continue;
      const pid = Number(d);
      if (pid === process.pid) continue;
      try {
        const args = fs.readFileSync("/proc/" + d + "/cmdline", "utf8").split("\0");
        if (args.includes(T)) { process.kill(pid, "SIGKILL"); n += 1; }
      } catch (e) { /* 进程已退出或不可读 */ }
    }
    console.log("stopped " + n);
  ' 2>&1 | tee -a "$REPORT"
  sleep 1
  if docker exec dsh curl -fsS --max-time 2 http://127.0.0.1:3082/survey/healthz >/dev/null 2>&1; then
    fail "预检进程未能停止，重启后会端口冲突"
  fi
  log "预检进程已停止，端口 3082 释放"
}

# ---------------------------------------------------------------- 自动回滚
rollback() {
  local c e
  c=$(ls -t "$TMP"/Caddyfile.bak.survey.* 2>/dev/null | head -1)
  e=$(ls -t "$TMP"/docker-entrypoint.sh.bak.survey.* 2>/dev/null | head -1)
  if [[ -n "$c" ]]; then cat "$c" > "$TMP/Caddyfile"; log "已回滚 Caddyfile <- $(basename "$c")"; fi
  if [[ -n "$e" ]]; then
    cat "$e" > "$TMP/docker-entrypoint.sh"
    chmod 0755 "$TMP/docker-entrypoint.sh"
    log "已回滚 entrypoint <- $(basename "$e")"
  fi
  (cd "$A" && docker compose up -d --force-recreate) 2>&1 | tee -a "$REPORT"
}

# ---------------------------------------------------------------- 重启与验证
do_restart() {
  log "=== 重启 dsh 容器使路由与启动块生效 ==="
  cd "$A" || fail "无法进入 $A"
  docker compose up -d --force-recreate 2>&1 | tee -a "$REPORT"

  local st=""
  for _ in $(seq 1 60); do
    st=$(docker inspect dsh --format '{{.State.Status}}/{{.State.Health.Status}}' 2>/dev/null)
    [[ "$st" == "running/healthy" ]] && break
    sleep 5
  done
  log "容器状态：$st"
  if [[ "$st" != "running/healthy" ]]; then
    log "!! 容器未在 300s 内 healthy，执行自动回滚"
    rollback
    st=$(docker inspect dsh --format '{{.State.Status}}/{{.State.Health.Status}}' 2>/dev/null)
    log "回滚后容器状态：$st"
    if [[ "$st" != "running/healthy" ]]; then
      log "!! 回滚后仍不健康，需人工介入：docker logs dsh --tail 50"
      exit 1
    fi
    log "已回滚到改动前配置（问卷地址暂时不可用，工作台已恢复）"
    exit 1
  fi

  log "--- 容器内自检 ---"
  docker exec dsh curl -fsS --max-time 5 http://127.0.0.1:3082/survey/healthz 2>&1 | tee -a "$REPORT"; echo | tee -a "$REPORT"
  docker exec dsh sh -c 'curl -sk --max-time 8 --resolve dsh.10ge.cn:8443:127.0.0.1 -o /dev/null -w "经Caddy /survey/ = %{http_code}\n" https://dsh.10ge.cn:8443/survey/' 2>&1 | tee -a "$REPORT"
  docker exec dsh sh -c 'curl -sk --max-time 8 --resolve dsh.10ge.cn:8443:127.0.0.1 -o /dev/null -w "经Caddy /survey/healthz = %{http_code}\n" https://dsh.10ge.cn:8443/survey/healthz' 2>&1 | tee -a "$REPORT"
  docker exec dsh sh -c 'curl -sk --max-time 8 --resolve dsh.10ge.cn:8443:127.0.0.1 -o /dev/null -w "工作台根路径 = %{http_code}\n" https://dsh.10ge.cn:8443/' 2>&1 | tee -a "$REPORT"
  docker exec dsh sh -c 'curl -sk --max-time 8 --resolve dsh.10ge.cn:8443:127.0.0.1 -o /dev/null -w "工作台 SSE = %{http_code}\n" https://dsh.10ge.cn:8443/dsh-deployment.js' 2>&1 | tee -a "$REPORT"

  log "--- 端到端提交自检（写入一条 test 记录后删除） ---"
  local before after
  before=$(wc -l < "$DST/data/submissions.ndjson" 2>/dev/null || echo 0)
  docker exec dsh sh -c 'curl -s --max-time 8 -X POST http://127.0.0.1:3082/survey/api/submit -H "Content-Type: application/json" -d "{\"meta\":{\"dept\":\"__deploy_selftest__\"},\"q1\":\"deploy self test\"}"' 2>&1 | tee -a "$REPORT"; echo | tee -a "$REPORT"
  after=$(wc -l < "$DST/data/submissions.ndjson" 2>/dev/null || echo 0)
  log "落盘行数：$before -> $after"
  if [[ "$after" -gt "$before" ]]; then
    python3 - "$DST/data/submissions.ndjson" <<'PY' | tee -a "$REPORT"
import sys
p = sys.argv[1]
lines = [l for l in open(p, encoding='utf-8') if l.strip()]
keep = [l for l in lines if '__deploy_selftest__' not in l]
open(p, 'w', encoding='utf-8').writelines(keep)
print(f"selftest record removed: {len(lines)} -> {len(keep)}")
PY
  fi

  log "--- 公网自查 ---"
  curl -s -o /dev/null -m 20 -w "公网表单页=%{http_code}\n" "$PUBLIC" 2>&1 | tee -a "$REPORT"
  printf '公网健康探针=' | tee -a "$REPORT"
  curl -s -m 20 "${PUBLIC%/}/healthz" 2>&1 | tee -a "$REPORT"; echo | tee -a "$REPORT"

  local token=""
  [[ -f "$DST/data/admin-token.txt" ]] && token=$(cat "$DST/data/admin-token.txt")
  log "=== 部署完成 ==="
  log "问卷地址：$PUBLIC"
  if [[ -n "$token" ]]; then log "管理台：  ${PUBLIC}admin?t=$token"; else log "管理台令牌文件尚未生成：$DST/data/admin-token.txt"; fi
  log "答卷落盘：$DST/data/submissions.ndjson"
}

case "$MODE" in
  prepare) preflight; copy_files; patch_files; validate_and_apply; precheck_runtime;
           log "=== prepare 完成，尚未重启容器 ==="
           log "注意：prepare 的预检会停掉正在运行的收集服务。若线上已在回收答卷，"
           log "      改动生效请紧接着执行 restart（重建容器会重新拉起服务）。" ;;
  restart) preflight; do_restart ;;
  *) fail "用法：deploy.sh [prepare|restart]" ;;
esac
