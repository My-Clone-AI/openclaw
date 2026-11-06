#!/usr/bin/env bash
# OpenClaw Controller session init (.agents/harness). Run at the start of every session.
# Fails closed: a broken baseline stops feature work.
set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$HARNESS_DIR/../.." && pwd)"
cd "$REPO_DIR"

INSTALL_CMD=(pnpm install --frozen-lockfile)
# Cheap documented baseline (docs/help/testing/suites.md): harness state, root AGENTS.md cap, nsvx plugin entry test.
VERIFY_STEPS=(
  "node .agents/harness/validate.mjs"
  "pnpm check:agents-md-size"
  "node scripts/test-projects.mts extensions/nsvx/index.test.ts"
)
START_CMD=(pnpm gateway:dev)

echo "==> Working directory: $PWD"
echo "==> HEAD (git checkpoint): $(git rev-parse HEAD)"
git log --oneline -5

if [ "${SKIP_INSTALL:-0}" != "1" ]; then
  echo "==> Syncing dependencies: ${INSTALL_CMD[*]}"
  "${INSTALL_CMD[@]}"
fi

for step in "${VERIFY_STEPS[@]}"; do
  echo "==> Baseline verification: $step"
  if ! bash -c "$step"; then
    echo "BASELINE BROKEN at: $step" >&2
    echo "Fix the baseline before any new feature work, and log it in .agents/harness/diagnostics/log.jsonl." >&2
    exit 1
  fi
done

echo "==> Dev start command (never production; never Master :18789):"
printf '    %q' "${START_CMD[@]}"; printf '\n'
if [ "${RUN_START_COMMAND:-0}" = "1" ]; then
  exec "${START_CMD[@]}"
fi
echo "Set RUN_START_COMMAND=1 to launch the dev gateway from init.sh."
