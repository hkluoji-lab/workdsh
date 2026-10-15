#!/bin/bash
# dsh.10ge.cn 站外告警出口 v1（2026-10-02 建立）
#
# 用法：dsh-alert.sh <info|warn|critical> "<标题>" "<正文>"
#
# 设计要点：
#   * 未配置 WEBHOOK_URL 时**只写本地日志**并返回 0 —— 绝不让"没配告警"变成新的故障点。
#   * 同标题在 DEDUPE_WINDOW 内只推一次，避免故障抖动时刷屏（人一旦被刷屏就会屏蔽告警）。
#   * 无论站外推送成功与否，/var/log/dsh-alerts.log 一定有记录，便于事后取证。
#   * 发送失败不重试超过 1 次，且永不阻塞调用方超过 TIMEOUT。
set -u

CONF=/usr/local/etc/dsh-alerts.conf
LOG=/var/log/dsh-alerts.log
STATE_DIR=/var/lib/dsh-alerts
LOG_MAX_LINES=3000

CHANNEL=none; WEBHOOK_URL=""; DEDUPE_WINDOW=1800; ENABLED=1; TIMEOUT=10; DINGTALK_KEYWORD=""
# shellcheck disable=SC1090
[ -r "$CONF" ] && . "$CONF"

SEV="${1:-info}"
TITLE="${2:-未命名告警}"
BODY="${3:-}"
HOST="$(hostname 2>/dev/null || echo host)"

mkdir -p "$STATE_DIR" 2>/dev/null || true

trim_log() {
  [ -f "$LOG" ] || return 0
  [ "$(wc -l < "$LOG" 2>/dev/null || echo 0)" -gt "$LOG_MAX_LINES" ] || return 0
  tail -n "$LOG_MAX_LINES" "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
}

write_log() {
  printf '%s [%s] %s | %s\n' "$(date -Is)" "$SEV" "$TITLE" "$(printf '%s' "$BODY" | tr '\n' ' ')" >> "$LOG" 2>/dev/null
  logger -t dsh-alert "[$SEV] $TITLE" 2>/dev/null || true
  trim_log
}

# ---- 去重 ----
KEY=$(printf '%s|%s' "$SEV" "$TITLE" | sha256sum | cut -d' ' -f1)
STAMP="$STATE_DIR/$KEY.last"
NOW=$(date +%s)
if [ -f "$STAMP" ]; then
  LAST=$(cat "$STAMP" 2>/dev/null || echo 0)
  case "$LAST" in ''|*[!0-9]*) LAST=0;; esac
  if [ $(( NOW - LAST )) -lt "${DEDUPE_WINDOW:-1800}" ]; then
    write_log
    echo "suppressed (dedupe ${DEDUPE_WINDOW}s)"
    exit 0
  fi
fi

if [ "${ENABLED:-1}" != "1" ] || [ -z "${WEBHOOK_URL}" ] || [ "${CHANNEL:-none}" = "none" ]; then
  write_log
  echo "logged only (channel=${CHANNEL:-none} configured=$([ -n "${WEBHOOK_URL}" ] && echo yes || echo no))"
  exit 0
fi

PAYLOAD=$(TITLE="$TITLE" BODY="$BODY" SEV="$SEV" CH="$CHANNEL" HOST="$HOST" KW="$DINGTALK_KEYWORD" python3 - <<'PY'
import json, os
ch=os.environ["CH"]; title=os.environ["TITLE"]; body=os.environ["BODY"]
sev=os.environ["SEV"]; host=os.environ["HOST"]; kw=os.environ.get("KW","")
if kw: title = f"{kw} {title}"
icon={"info":"ℹ️","warn":"⚠️","critical":"🔴"}.get(sev,"•")
head=f"{icon} [{sev.upper()}] {title}"
text=f"{head}\n主机：{host}\n时间：{__import__('datetime').datetime.now().astimezone().strftime('%Y-%m-%d %H:%M:%S %Z')}\n\n{body}"
if ch=="wecom":
    print(json.dumps({"msgtype":"markdown","markdown":{"content":text}}, ensure_ascii=False))
elif ch=="dingtalk":
    print(json.dumps({"msgtype":"markdown","markdown":{"title":f"{icon} {title}","text":"### "+text}}, ensure_ascii=False))
elif ch=="feishu":
    print(json.dumps({"msg_type":"text","content":{"text":text}}, ensure_ascii=False))
else:
    print(json.dumps({"severity":sev,"title":title,"body":body,"host":host}, ensure_ascii=False))
PY
)

send() {
  curl -sS -m "${TIMEOUT:-10}" -X POST "$WEBHOOK_URL" \
       -H 'Content-Type: application/json' \
       --data-binary "$PAYLOAD" 2>&1
}

RESP=$(send || true)
OK=0
case "$RESP" in
  *'"errcode":0'*|*'"code":0'*|*'"StatusCode":0'*|*'"ok":true'*|*'"success":true'*) OK=1 ;;
  '') OK=0 ;;
  *) [ "$CHANNEL" = "generic" ] && OK=1 || OK=0 ;;
esac

if [ "$OK" = "1" ]; then
  echo "$NOW" > "$STAMP"
  write_log
  printf '%s [%s] %s | 推送成功\n' "$(date -Is)" "$SEV" "$TITLE" >> "$LOG"
  echo "sent ok"
else
  write_log
  printf '%s [%s] %s | 推送失败: %s\n' "$(date -Is)" "$SEV" "$TITLE" "$(printf '%s' "$RESP" | head -c 300)" >> "$LOG"
  echo "send FAILED: $(printf '%s' "$RESP" | head -c 200)"
  exit 1
fi
