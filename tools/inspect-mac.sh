#!/usr/bin/env bash
# Builds the macOS packages (from Linux/WSL) and checks their structure, since they cannot be run here.
#   usage: tools/inspect-mac.sh <out dir>
set -u
OUT="${1:-$HOME/out}"
cd "$(dirname "$0")/.."
for t in darwin-arm64 darwin-x64; do node tools/build.js "$t" --out "$OUT" 2>&1 | tail -1; done
cd "$OUT"
for arch in arm64 x64; do
  A="Blockpad-darwin-$arch/Blockpad.app"
  echo "=============== $A"
  echo "bundle:        $(ls "$A/Contents" | tr '\n' ' ')"
  echo "bundle id:     $(grep -A1 CFBundleIdentifier "$A/Contents/Info.plist" | tail -1 | tr -d '\t')"
  echo "url scheme:    $(grep -A8 CFBundleURLSchemes "$A/Contents/Info.plist" | grep '<string>' | tr -d '\t' | tr '\n' ' ')"
  echo "category:      $(grep -A1 LSApplicationCategoryType "$A/Contents/Info.plist" | tail -1 | tr -d '\t')"
  echo "main binary:   $(file -b "$A/Contents/MacOS/Blockpad" | cut -c1-70)"
  echo "AI engine:     $(file -b "$A/Contents/Resources/app/engine/darwin-$arch/llama-server" | cut -c1-70)"
  echo "engine libs:   $(ls "$A/Contents/Resources/app/engine/darwin-$arch" | wc -l) files; other engines present: $(ls "$A/Contents/Resources/app/engine" | grep -vc "darwin-$arch")"
  echo "native addons: $(find "$A/Contents/Resources/app/node_modules" -name '*.node' | sed 's|.*/prebuilds/||' | tr '\n' ' ')"
  for n in $(find "$A/Contents/Resources/app/node_modules" -name '*.node'); do echo "                $(file -b "$n" | cut -c1-60)"; done
  echo "symlinks:      $(find "$A" -type l | wc -l) kept (the Electron framework needs these)"
  echo "exec bits:     $(ls -l "$A/Contents/MacOS/Blockpad" "$A/Contents/Resources/app/engine/darwin-$arch/llama-server" | awk '{print $1}' | tr '\n' ' ')"
  echo "icon:          $(ls "$A/Contents/Resources" | grep -i icns | tr '\n' ' ')"
  echo "size:          $(du -sh "Blockpad-darwin-$arch" | cut -f1)"
done
