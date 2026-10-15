#!/bin/bash
MODE="${1:-catch}"
COREDIR=/opt/1panel/apps/deepseek-harness/deepseek-harness/data/dsh/tmp/cores
PID=$(docker top dsh -o pid,cmd 2>/dev/null | awk '/bin[.]js web/{print $1; exit}')
if [ -z "$PID" ]; then echo "no dsh pid found"; exit 1; fi
echo "dsh host pid=$PID started=$(date -Is)"
if [ "$MODE" = "test" ]; then
  gdb -p "$PID" -batch -ex "set sysroot /proc/$PID/root" -ex "set pagination off" \
    -ex "info threads" -ex "bt 8" -ex "detach"
  exit $?
fi
mkdir -p "$COREDIR"
STAMP=$(date +%Y%m%d-%H%M%S)
timeout -k 5 900 gdb -p "$PID" -batch \
  -ex "set sysroot /proc/$PID/root" \
  -ex "set pagination off" \
  -ex "set width 0" \
  -ex "set confirm off" \
  -ex "handle SIGPIPE nostop noprint pass" \
    -ex "handle SIGSEGV stop print nopass" \
    -ex "handle SIGABRT stop print nopass" \
    -ex "handle SIGBUS stop print nopass" \
  -ex "continue" \
  -ex "echo \n===== SIGSEGV CAUGHT =====\n" \
  -ex "bt 40" \
  -ex "thread apply all bt 12" \
  -ex "info registers rip rsp rbp" \
  -ex "generate-core-file $COREDIR/dsh-segv-$STAMP.core" \
  -ex "detach"
