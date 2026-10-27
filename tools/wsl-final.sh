#!/usr/bin/env bash
# Final Linux/macOS pass inside WSL: sync, rebuild Linux + macOS packages, run the Linux tests, inspect the macOS bundles.
set -u
SRC="${1:?usage: wsl-final.sh /mnt/c/path/to/project}"
cd ~/bp
rsync -a --exclude node_modules --exclude build --exclude installer --exclude .claude --exclude 'engine/' --exclude android --exclude ios --exclude site "$SRC"/ ~/bp/
sed -i 's/\r$//' tools/*.sh
npm install --no-audit --no-fund 2>&1 | tail -1
rm -rf ~/out && node tools/build.js linux-x64 --out ~/out 2>&1 | tail -1
export BP_LLM_DIR=~/models
echo "=== LINUX tests"
bash tools/linux-test.sh ~/out/Blockpad-linux-x64 smoke10 smoke12 smoke13 smoke27
echo "=== LINUX sharing: 3 people"
bash tools/run-share-test.sh ~/out/Blockpad-linux-x64/Blockpad smoke20 smoke21 smoke22 | tail -5
echo "=== LINUX sharing: simultaneous edits, cursor, offline"
bash tools/run-share-test.sh ~/out/Blockpad-linux-x64/Blockpad smoke23 smoke24 | tail -4
echo "=== MACOS packages (structure only: cannot be run here)"
bash tools/inspect-mac.sh ~/out
echo "=== sizes"; du -sh ~/out/Blockpad-*
echo ALL-DONE
