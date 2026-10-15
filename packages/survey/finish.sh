#!/usr/bin/env bash
A=/opt/1panel/apps/deepseek-harness/deepseek-harness
D=$A/data/dsh/survey
R=$D/finish-report.txt
: > "$R"
log(){ printf "[%s] %s\n" "$(date +%H:%M:%S)" "$*" >> "$R"; }

log "=== finish 开始：重启容器并验证 ==="
bash $A/data/dsh/home/dsh/survey/deploy/deploy.sh restart >> "$R" 2>&1
log "deploy restart 退出码=$?"

log "--- 等待公网问卷页可达 ---"
code=000
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -m 10 -w "%{http_code}" https://dsh.10ge.cn/survey/ || echo 000)
  [ "$code" = "200" ] && { log "公网表单页 200（第 ${i} 次探测）"; break; }
  sleep 5
done
log "公网表单页最终状态码=$code"

log "--- 公网端到端提交（经 Cloudflare 打到收集服务）---"
SUB=$(curl -s -m 25 -X POST https://dsh.10ge.cn/survey/api/submit -H "Content-Type: application/json" \
  -d "{\"meta\":{\"dept\":\"__finish_selftest__\"},\"q1\":\"finish self test\"}")
log "公网提交响应: $SUB"

TOKEN=$(cat $D/data/admin-token.txt 2>/dev/null)
log "管理令牌: ${TOKEN:-（未生成）}"
log "管理台地址: https://dsh.10ge.cn/survey/admin?t=$TOKEN"
log "list 接口(公网): $(curl -s -m 20 "https://dsh.10ge.cn/survey/api/list?t=$TOKEN" | head -c 160)"
log "CSV matrix 状态码: $(curl -s -m 20 -o /dev/null -w "%{http_code}" "https://dsh.10ge.cn/survey/api/export.csv?type=matrix&t=$TOKEN")"
log "管理台无令牌状态码: $(curl -s -m 20 -o /dev/null -w "%{http_code}" https://dsh.10ge.cn/survey/admin)"

python3 - "$D/data/submissions.ndjson" >> "$R" 2>&1 <<'PY'
import sys
p = sys.argv[1]
try:
    lines = [l for l in open(p, encoding="utf-8") if l.strip()]
except FileNotFoundError:
    print("store 尚未创建"); raise SystemExit
keep = [l for l in lines if "__finish_selftest__" not in l]
open(p, "w", encoding="utf-8").writelines(keep)
print(f"自检记录已清除: {len(lines)} -> {len(keep)}")
PY

log "工作台根路径: $(curl -s -o /dev/null -m 15 -w "%{http_code}" https://dsh.10ge.cn/)"
log "答卷文件: $(wc -l < $D/data/submissions.ndjson 2>/dev/null || echo 0) 行"
log "容器: $(docker inspect dsh --format "{{.State.Status}}/{{.State.Health.Status}} restarts={{.RestartCount}}")"
log "=== finish 完成 ==="
