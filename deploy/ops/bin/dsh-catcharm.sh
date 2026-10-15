#!/bin/bash
CORE=/opt/1panel/apps/deepseek-harness/deepseek-harness/data/dsh/tmp/cores
LOG=/var/log/dsh-crashcatch.log
PID=$(docker top dsh -o pid,cmd 2>/dev/null | awk '/bin\.js web/{print $1; exit}')
[ -z "$PID" ] && exit 0
T=$(awk '/^TracerPid/{print $2}' /proc/$PID/status 2>/dev/null)
[ "$T" != "0" ] && exit 0
mkdir -p "$CORE"
setsid nohup /usr/local/bin/dsh-catch.sh catch >> "$LOG" 2>&1 < /dev/null &
ls -t "$CORE"/dsh-segv-*.core 2>/dev/null | tail -n +4 | xargs -r rm -f
