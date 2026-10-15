#!/bin/bash
# dsh 崩溃趋势报告（Node24 vs Node22 A/B，2026-10-02）
#
# 数据源：/var/lib/dsh-crash-watch/log.txt（每 10 分钟一行，含 seg= / post_ready_crash=）
#   —— 这是跨容器重建仍保留的唯一长期序列（docker logs 会随容器重建丢失）。
set -u
LOG=/var/lib/dsh-crash-watch/log.txt
SWITCH="${SWITCH_AT:-2026-10-02T02:42:43}"   # Node22 生效时刻（UTC）

echo "================ dsh 崩溃趋势（Node 版本 A/B）================"
echo "切换点（Node24 -> Node22）: $SWITCH UTC"
echo
python3 - "$LOG" "$SWITCH" <<'PY'
import sys, re, datetime
path, switch_s = sys.argv[1], sys.argv[2]
switch = datetime.datetime.fromisoformat(switch_s.replace('Z','')).replace(tzinfo=datetime.timezone.utc)
def bucket(ts):
    ts = ts.replace(minute=(ts.minute//10)*10, second=0, microsecond=0)
    return ts
n24 = {}; n22 = {}
try:
    lines = open(path, encoding='utf-8', errors='replace').read().splitlines()
except FileNotFoundError:
    print("  (无数据)"); sys.exit(0)
for l in lines:
    m = re.match(r'^(\S+?)\s', l)
    if not m: continue
    try: ts = datetime.datetime.fromisoformat(m.group(1).replace('Z','')).replace(tzinfo=datetime.timezone.utc)
    except Exception: continue
    seg = re.search(r'seg=(\d+)', l); prc = re.search(r'post_ready_crash=(\d+)', l)
    s = int(seg.group(1)) if seg else 0
    p = int(prc.group(1)) if prc else 0
    tgt = n22 if ts >= switch else n24
    b = bucket(ts)
    tgt[b] = (tgt[b][0] + s, tgt[b][1] + p) if b in tgt else (s, p)

def show(name, d):
    if not d:
        print(f"  {name}: 暂无数据"); return
    total_s = sum(v[0] for v in d.values()); total_p = sum(v[1] for v in d.values())
    t0, t1 = min(d), max(d)
    span_h = max((t1 - t0).total_seconds()/3600, 1/60)
    print(f"  {name}: 观测 {(t1-t0).total_seconds()/60:.0f} 分钟 | seg 合计 {total_s} | post_ready_crash 合计 {total_p}")
    print(f"      崩溃密度 ≈ {total_s/span_h:.1f} 次/小时")
    # 最近 6 个桶
    tail = sorted(d)[-6:]
    for b in tail:
        print(f"      {b.strftime('%m-%d %H:%M')}Z  seg={d[b][0]:<3} post_ready={d[b][1]}")

show("Node24 阶段", n24)
print()
show("Node22 阶段", n22)
PY
echo
echo "---- 当前容器 ----"
docker inspect dsh --format '  镜像={{.Config.Image}}  状态={{.State.Status}}/{{.State.Health.Status}}  Node={{range .Config.Env}}{{if eq (slice . 0 5) "NODE_"}}{{.}} {{end}}{{end}}' 2>/dev/null
echo "  容器内 node: $(docker exec dsh node -v 2>/dev/null)"
echo "  dsh 进程存活: $(docker exec dsh node -e 'const fs=require("fs");
for (const p of fs.readdirSync("/proc")) {
  if(!/^[0-9]+$/.test(p)) continue;
  try{
    const argv=fs.readFileSync("/proc/"+p+"/cmdline","utf8").split("\0").filter(Boolean);
    if(argv.length<3) continue;
    if(!/node$/.test(argv[0])) continue;
    if(!argv.some(a=>/dsh\/lib\/bin\.js$/.test(a))) continue;
    if(argv.includes("-e")||argv.includes("--eval")||argv.includes("-p")||argv.includes("--print")) continue;
    const st=fs.statSync("/proc/"+p);
    const rss=Math.round(((fs.readFileSync("/proc/"+p+"/status","utf8").match(/VmRSS:\s+(\d+)/)||[0,0])[1])/1024);
    console.log("pid="+p+" 存活="+Math.round((Date.now()-st.mtimeMs)/1000)+"s rss="+rss+"MB");
    break;
  }catch(e){}
}' 2>/dev/null)"
echo "  本容器启动后崩溃数: $(docker logs dsh 2>&1 | grep -c 'Segmentation fault')"
echo
echo "---- 切换器 ----"
echo "  /usr/local/bin/dsh-node-switch.sh status"
/usr/local/bin/dsh-node-switch.sh status
