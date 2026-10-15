#!/bin/bash
# Node22 A/B 后台采样器（每 30s 一行，共 40 分钟）
# 判据：argv[0] 以 node 结尾；argv 中有一项以 dsh/lib/bin.js 结尾；且不含 -e/-p。
# 刻意不用 /proc/<pid>/exe —— Docker 默认丢弃 CAP_SYS_PTRACE，
# root 读不到其它 UID 进程的 exe 链接，会静默漏检。
OUT=/var/lib/dsh-crash-alert/ab-node22-sample.log
for i in $(seq 1 80); do
  P=$(docker exec dsh node -e 'const fs=require("fs");
for (const p of fs.readdirSync("/proc")) {
  if(!/^[0-9]+$/.test(p)) continue;
  try{
    const argv=fs.readFileSync("/proc/"+p+"/cmdline","utf8").split("\0").filter(Boolean);
    if(argv.length<3) continue;
    if(!/node$/.test(argv[0])) continue;
    if(!argv.some(a=>/dsh\/lib\/bin\.js$/.test(a))) continue;
    if(argv.includes("-e")||argv.includes("--eval")||argv.includes("-p")||argv.includes("--print")) continue;
    const st=fs.statSync("/proc/"+p);
    console.log(p+" "+Math.round((Date.now()-st.mtimeMs)/1000));
    break;
  }catch(e){}
}' 2>/dev/null)
  SEG=$(docker logs dsh 2>&1 | grep -c "Segmentation fault")
  EXITED=$(docker logs dsh 2>&1 | grep -c "exited after startup")
  NV=$(docker exec dsh node -v 2>/dev/null)
  printf '%s node=%s dsh="%s" seg=%s exited=%s\n' "$(date -Is)" "${NV:-?}" "${P:-none}" "${SEG:-0}" "${EXITED:-0}"
  sleep 30
done >> "$OUT" 2>&1
