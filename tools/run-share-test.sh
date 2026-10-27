#!/usr/bin/env bash
# Linux/macOS version of run-share-test.ps1: several real Blockpad processes sharing a page over a private local peer network.
#   usage: tools/run-share-test.sh <Blockpad executable> <smokeA> <smokeB> [smokeC]      e.g.  .../Blockpad smoke20 smoke21 smoke22
set -u
EXE="$1"; shift
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
node "$ROOT/tools/testnet.js" "$WORK/boot.json" > "$WORK/testnet.log" 2>&1 &
TN=$!
for i in $(seq 1 60); do [ -f "$WORK/boot.json" ] && break; sleep 0.5; done
[ -f "$WORK/boot.json" ] || { echo "test network did not start"; kill $TN; exit 1; }
export BP_DHT_BOOTSTRAP="$(node -p "require('$WORK/boot.json').bootstrap.join(',')")"
export BP_SYNC_DIR="$WORK/sync"
names=(A B C D); pids=(); i=0
for script in "$@"; do
  n=${names[$i]}
  export BP_SMOKE_DIR="$WORK/data-$n" BP_SMOKE_OUT="$WORK/out-$n"
  if [ "$(uname)" = Linux ]; then
    xvfb-run -a -s "-screen 0 1280x900x24" "$EXE" --no-sandbox --disable-gpu "--smoke=$ROOT/tools/$script.js" > "$WORK/$n.log" 2>&1 &
  else
    "$EXE" "--smoke=$ROOT/tools/$script.js" > "$WORK/$n.log" 2>&1 &
  fi
  pids+=($!); i=$((i+1))
done
bad=0
for pid in "${pids[@]}"; do
  ( sleep 170; kill -9 "$pid" 2>/dev/null ) & killer=$!
  wait "$pid" 2>/dev/null; kill "$killer" 2>/dev/null
done
i=0
for script in "$@"; do
  n=${names[$i]}; i=$((i+1))
  pass=$(grep -c '^PASS' "$WORK/$n.log"); fail=$(grep -c '^FAIL' "$WORK/$n.log")
  ok=no; grep -q 'ALL CHECKS PASSED' "$WORK/$n.log" && [ "$fail" = 0 ] && ok=yes
  echo "process $n ($script): pass=$pass fail=$fail ok=$ok"
  [ "$ok" = yes ] || { bad=1; grep -E '^(FAIL|SMOKE FAILED)|TIMED' "$WORK/$n.log" | head -6; }
done
kill $TN 2>/dev/null
if [ $bad = 0 ]; then echo "SHARE TEST: ALL PROCESSES PASSED"; else echo "SHARE TEST: FAILED"; fi
exit $bad
