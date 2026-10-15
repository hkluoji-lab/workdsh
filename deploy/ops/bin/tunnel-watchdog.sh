#!/bin/bash
# Cloudflare Tunnel auto-recovery watchdog v5
# v4 -> v5 (2026-10-02): 修复三类误判，避免"应用故障被放大成隧道故障"
#   1) 探测目标从 dsh.10ge.cn（最脆弱应用）改为稳态域名（100/zq/189）：
#      这些域名平时返回 200/302，能真实反映"隧道+主机"状态，与应用是否故障解耦。
#   2) 502/503/504（源站应用层故障）从"隧道故障"集合里剔除：
#      应用 502 只说明源站应用挂了，重启 cloudflared 毫无帮助，反而让所有域名短暂 530。
#      只有 000（连接失败）与 520-527/530（CF 边缘错误）才算隧道/源站真故障。
#   3) 增加主机健康前置：主机内存严重不足或负载畸高时跳过重启
#      （主机停滞时探活全 5xx，但重启 cloudflared 无意义，徒增抖动）。
#   保留 v4 的：失败连续计数阈值 + 冷却期 + 服务死亡即拉起 + 按 region 固定协议。
LOG_TAG="tunnel-watchdog"
# 稳态探测域名（主机+隧道健康时恒为 2xx/3xx；避免把单一应用故障当隧道故障）
PROBES=(https://100.10ge.cn/ https://zq.10ge.cn/ https://10000.10ge.cn/)
STATE=/run/tunnel-watchdog.fails
STAMP=/run/tunnel-watchdog.lastrestart
# 连续失败达到该次数才判定为真故障
FAIL_THRESHOLD=3
# 冷却期（秒）：上次重启后多久内不再重启
COOLDOWN=900
# 内存前置：可用内存低于该比例时认为主机压力大，不重启隧道
MEM_WARN_PCT=8

# TUNNEL_ALERT_HOOK_V1：站外告警（未配置 webhook 时只写本地日志，绝不阻塞本脚本）
ALERT=/usr/local/bin/dsh-alert.sh
alert() { [ -x "$ALERT" ] && "$ALERT" "$1" "$2" "$3" >/dev/null 2>&1 || true; }

# 1. 服务挂了直接拉起（最可靠的自愈路径）
if ! systemctl is-active --quiet cloudflared; then
    logger -t "$LOG_TAG" "cloudflared is not running; restarting"
    alert critical "Cloudflare 隧道进程不在运行，看护已拉起" "systemctl is-active cloudflared 判定为未运行，已执行 systemctl restart cloudflared。所有 10ge.cn 域名会短暂 530。"
    systemctl restart cloudflared
    date +%s > "$STAMP"
    echo 0 > "$STATE"
    exit 0
fi

# 2. 主机内存前置（v5 新增）：内存不足时什么都不做，等主机自愈
MEM_AVAIL_PCT=$(awk '/MemAvailable/{a=$2} /MemTotal/{t=$2} END{printf "%d", a*100/t}' /proc/meminfo)
if [ -n "$MEM_AVAIL_PCT" ] && [ "$MEM_AVAIL_PCT" -lt "$MEM_WARN_PCT" ]; then
    logger -t "$LOG_TAG" "host memory low (available=${MEM_AVAIL_PCT}% < ${MEM_WARN_PCT}%); skip tunnel action"
    exit 0
fi

# 3. 端到端健康检查（v5 判据）：
#    多数探测域名可达 => 隧道+主机健康，清零计数退出。
#    全部不可达才继续向下判断；其中 502/503/504（源站应用层）只记日志不重启。
TUNNEL_FAIL=0
ORIGIN_FAIL=0
CODES=""
for u in "${PROBES[@]}"; do
    C=$(curl -s -o /dev/null -m 8 -w "%{http_code}" "$u" 2>/dev/null)
    CODES="$CODES ${u#https://}:\"$C\""
    case "$C" in
        000|520|521|522|523|524|525|526|527|530) TUNNEL_FAIL=$((TUNNEL_FAIL+1)) ;;
        502|503|504) ORIGIN_FAIL=$((ORIGIN_FAIL+1)) ;;
    esac
done

if [ "$TUNNEL_FAIL" -eq 0 ] || [ "$TUNNEL_FAIL" -lt "${#PROBES[@]}" ]; then
    # 至少一个探测域名经隧道可达 => 隧道与主机基本健康：清零（单个域名故障不触发全局动作）
    echo 0 > "$STATE"
    if [ "$ORIGIN_FAIL" -gt 0 ] || [ "$TUNNEL_FAIL" -gt 0 ]; then
        logger -t "$LOG_TAG" "partial reachability (tunnel_fail=$TUNNEL_FAIL/${#PROBES[@]} origin_fail=$ORIGIN_FAIL codes:$CODES); tunnel OK, no action"
    fi
    exit 0
fi

# 全部探测域名均无法经隧道到达 => 记为一次失败
FAILS=0
[ -f "$STATE" ] && FAILS=$(cat "$STATE" 2>/dev/null)
case "$FAILS" in ''|*[!0-9]*) FAILS=0 ;; esac
FAILS=$((FAILS + 1))
echo "$FAILS" > "$STATE"

if [ "$FAILS" -lt "$FAIL_THRESHOLD" ]; then
    logger -t "$LOG_TAG" "probe-fail(consecutive=$FAILS/$FAIL_THRESHOLD codes:$CODES); within threshold, no action"
    exit 0
fi

# 4. 达到阈值：检查冷却期
NOW=$(date +%s)
LAST=0
[ -f "$STAMP" ] && LAST=$(cat "$STAMP" 2>/dev/null)
case "$LAST" in ''|*[!0-9]*) LAST=0 ;; esac

if [ $((NOW - LAST)) -lt "$COOLDOWN" ]; then
    logger -t "$LOG_TAG" "probe-fail(consecutive=$FAILS codes:$CODES); in cooldown ($((NOW - LAST))s < ${COOLDOWN}s), skip restart"
    exit 0
fi

# 5. 真故障且已过冷却期：按 region 校正传输协议（不来回切换）后重启
UNIT=/etc/systemd/system/cloudflared.service
if grep -q -- "--region us" "$UNIT"; then
    if ! grep -q -- "--protocol http2" "$UNIT"; then
        sed -i "s/--protocol quic/--protocol http2/" "$UNIT"
        systemctl daemon-reload
        logger -t "$LOG_TAG" "probe-fail(codes:$CODES); us-region: forced quic -> http2 and restarting"
    else
        logger -t "$LOG_TAG" "probe-fail(codes:$CODES); us-region: restarting cloudflared (http2 kept)"
    fi
elif grep -q -- "--protocol http2" "$UNIT"; then
    sed -i "s/--protocol http2/--protocol quic/" "$UNIT"
    systemctl daemon-reload
    logger -t "$LOG_TAG" "probe-fail(codes:$CODES); global-region: forced http2 -> quic and restarting"
else
    logger -t "$LOG_TAG" "probe-fail(codes:$CODES); restarting cloudflared"
fi
alert critical "Cloudflare 隧道故障，看护已重启 cloudflared" "连续 $FAILS 次探测均不可达（codes:$CODES），已过冷却期。重启期间所有 10ge.cn 域名会短暂 530。"
systemctl restart cloudflared
date +%s > "$STAMP"
echo 0 > "$STATE"
