#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

case "${1:---bundle}" in
  --bundle)
    [[ $# -le 1 ]] || { echo "ERROR: --bundle takes no arguments" >&2; exit 1; }
    exec "$ROOT_DIR/scripts/package-mac-app.sh"
    ;;
  --run)
    [[ $# -eq 1 ]] || { echo "ERROR: --run takes no arguments" >&2; exit 1; }
    exec "$ROOT_DIR/scripts/build-and-run-mac.sh"
    ;;
  --help|-h)
    printf 'Usage: %s [--bundle|--run]\n' "$(basename "$0")"
    printf 'Build dist/OpenClaw.app (default), or build and run the local debug binary.\n'
    ;;
  *)
    echo "ERROR: Expected --bundle or --run; use --help for usage." >&2
    exit 1
    ;;
esac
