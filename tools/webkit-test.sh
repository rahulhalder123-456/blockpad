#!/usr/bin/env bash
# Runs webkit-test.js against the built web app (site/app) in Linux/WSL/CI. One-time setup installs Playwright + the WebKit browser.
#   usage: tools/webkit-test.sh [screenshot dir]
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHOTS="${1:-/tmp/webkit-shots}"
PW="${PW_DIR:-$HOME/pw}"
if [ ! -d "$PW/node_modules/playwright" ]; then
  mkdir -p "$PW" && cd "$PW" && npm init -y >/dev/null && npm i playwright --no-audit --no-fund 2>&1 | tail -1
  npx playwright install --with-deps webkit 2>&1 | tail -2
fi
cp "$ROOT/tools/webkit-test.js" "$PW/webkit-test.js"
node "$ROOT/tools/serve-site.js" 4790 > /tmp/serve.log 2>&1 &
SRV=$!; sleep 1
cd "$PW" && node webkit-test.js http://127.0.0.1:4790/app/ "$SHOTS"; code=$?
kill $SRV 2>/dev/null
exit $code
