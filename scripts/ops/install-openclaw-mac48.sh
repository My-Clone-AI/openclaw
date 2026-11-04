#!/bin/bash
set -euo pipefail

usage() {
  printf 'Usage: %s <OpenClaw.zip> <sha256> [applications-directory]\n' "$(basename "$0")"
  printf 'Install a verified local archive on this Mac; an existing OpenClaw.app is not replaced.\n'
}

if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then
  usage
  exit 0
fi
if [[ $# -lt 2 || $# -gt 3 ]]; then
  usage >&2
  exit 1
fi
[[ "$(uname -s)" == Darwin ]] || { echo 'ERROR: Run this script on macOS.' >&2; exit 1; }
archive="$1"
expected="$2"
destination="${3:-/Applications}"
[[ -f "$archive" && "$expected" =~ ^[[:xdigit:]]{64}$ && -d "$destination" ]] || {
  echo 'ERROR: Supply an existing ZIP, its 64-character SHA-256, and an existing applications directory.' >&2
  exit 1
}
[[ ! -e "$destination/OpenClaw.app" ]] || {
  echo 'ERROR: OpenClaw.app already exists; quit it and move it aside before installing.' >&2
  exit 1
}
actual="$(shasum -a 256 "$archive" | awk '{print $1}')"
[[ "$(printf '%s' "$expected" | tr '[:upper:]' '[:lower:]')" == "$actual" ]] || {
  echo 'ERROR: ZIP SHA-256 does not match.' >&2
  exit 1
}
work="$(mktemp -d "${TMPDIR:-/tmp}/openclaw-install.XXXXXX")"
trap 'rm -rf "$work"' EXIT
ditto -x -k "$archive" "$work"
app="$work/OpenClaw.app"
[[ -d "$app" ]] || { echo 'ERROR: ZIP must contain OpenClaw.app at its root.' >&2; exit 1; }
bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Contents/Info.plist")"
[[ "$bundle_id" == ai.openclaw.mac ]] || { echo 'ERROR: Unexpected bundle identifier.' >&2; exit 1; }
codesign --verify --deep --strict --verbose=2 "$app"
spctl --assess --type execute --verbose "$app"
ditto "$app" "$destination/OpenClaw.app"
printf 'Installed %s/OpenClaw.app. Open it and verify the Gateway connection.\n' "$destination"
