#!/usr/bin/env bash
# One-time Linux build/test environment inside WSL (Ubuntu): Node 22, Electron's runtime libraries, a virtual display, and a Linux copy of the project.
set -euo pipefail
SRC="${1:?usage: wsl-setup.sh /mnt/c/path/to/project}"
export DEBIAN_FRONTEND=noninteractive
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  echo "== node 22"; curl -fsSL https://nodejs.org/dist/v22.22.3/node-v22.22.3-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1
fi
node -v
if ! command -v xvfb-run >/dev/null 2>&1; then
  echo "== apt libraries"; apt-get update -qq
  apt-get install -y -qq xvfb libgtk-3-0t64 libnss3 libasound2t64 libgbm1 libxss1 libxtst6 libatk-bridge2.0-0t64 libcups2t64 libdrm2 libxkbcommon0 libxdamage1 libxrandr2 libxcomposite1 libpango-1.0-0 libcairo2 rsync zip unzip file >/dev/null
fi
mkdir -p ~/bp
rsync -a --delete --exclude node_modules --exclude build --exclude installer --exclude .claude --exclude 'engine/win32-x64' --exclude 'engine/darwin-*' --exclude 'engine/linux-*' --exclude android --exclude ios "$SRC"/ ~/bp/
cd ~/bp
echo "== npm install (linux)"; npm install --no-audit --no-fund 2>&1 | tail -2
echo "== engines"; bash tools/fetch-engines.sh linux-x64 darwin-arm64 darwin-x64
echo "ready: $(pwd)"
