#!/usr/bin/env bash
# Downloads the llama.cpp AI engine for the given targets into engine/<target>/  (run on Linux/macOS/WSL/CI, not on Windows:
# the macOS and Linux archives contain symlinks).   usage: tools/fetch-engines.sh linux-x64 darwin-arm64 darwin-x64
set -euo pipefail
TAG="${LLAMA_TAG:-b11935}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for target in "$@"; do
  case "$target" in
    linux-x64)    asset="ubuntu-x64" ;;
    linux-arm64)  asset="ubuntu-arm64" ;;
    darwin-arm64) asset="macos-arm64" ;;
    darwin-x64)   asset="macos-x64" ;;
    *) echo "unknown target $target"; exit 2 ;;
  esac
  dest="$ROOT/engine/$target"
  tmp="$(mktemp -d)"
  echo "== $target ($asset, $TAG)"
  curl -fsSL -o "$tmp/e.tar.gz" "https://github.com/ggml-org/llama.cpp/releases/download/$TAG/llama-$TAG-bin-$asset.tar.gz"
  mkdir -p "$tmp/x" && tar -xzf "$tmp/e.tar.gz" -C "$tmp/x" --strip-components=1
  rm -rf "$dest" && mkdir -p "$dest"
  # keep only what the server needs: the server itself and every shared library (symlinks preserved)
  ( cd "$tmp/x" && cp -a llama-server *.so *.so.* *.dylib "$dest/" 2>/dev/null || true )
  chmod +x "$dest/llama-server"
  rm -rf "$tmp"
  echo "   $(ls "$dest" | wc -l) files, $(du -sh "$dest" | cut -f1)"
done
