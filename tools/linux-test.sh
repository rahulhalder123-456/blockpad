#!/usr/bin/env bash
# Runs smoke tests against a packaged Linux build under a virtual display.
#   usage: tools/linux-test.sh <path-to-Blockpad-linux-x64> <tests...>     e.g.  smoke12 smoke13
# env: BP_LLM_DIR (folder with the model for the AI tests), TOOLS (folder holding the smoke scripts; default: next to this file)
set -u
APP="$1"; shift
TOOLS="${TOOLS:-$(cd "$(dirname "$0")" && pwd)}"
ARGS="--no-sandbox --disable-gpu"
fail=0
for name in "$@"; do
  export BP_SMOKE_DIR="/tmp/bpl-$name" BP_SMOKE_OUT="/tmp/bpl-$name-out"
  rm -rf "$BP_SMOKE_DIR" "$BP_SMOKE_OUT"
  xvfb-run -a -s "-screen 0 1280x900x24" "$APP/Blockpad" $ARGS "--smoke=$TOOLS/$name.js" > "/tmp/bpl-$name.log" 2>&1
  p=$(grep -c '^PASS' "/tmp/bpl-$name.log"); f=$(grep -c '^FAIL' "/tmp/bpl-$name.log")
  ok=no; grep -qE 'ALL CHECKS PASSED|passed, 0 failed' "/tmp/bpl-$name.log" && [ "$f" = 0 ] && ok=yes
  printf '%-9s pass=%-3s fail=%-2s ok=%s  %s\n' "$name" "$p" "$f" "$ok" "$(grep -E 'CONSOLE ISSUES' "/tmp/bpl-$name.log" | head -1)"
  [ "$ok" = yes ] || { fail=1; grep -E '^(FAIL|SMOKE FAILED)' "/tmp/bpl-$name.log" | head -8; }
done
exit $fail
