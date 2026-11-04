#!/usr/bin/env bash
set -euo pipefail

# Fetch only into FETCH_HEAD; do not modify a branch or push either repository.
upstream_url=${OPENCLAW_UPSTREAM_URL:-https://github.com/openclaw/openclaw.git}
upstream_branch=${OPENCLAW_UPSTREAM_BRANCH:-main}
fork_ref=${OPENCLAW_FORK_REF:-origin/develop}

git rev-parse --verify "${fork_ref}^{commit}" >/dev/null
git fetch --no-tags "$upstream_url" "$upstream_branch"
read -r behind ahead < <(git rev-list --left-right --count "FETCH_HEAD...$fork_ref")
printf '%s is %s commit(s) ahead and %s commit(s) behind upstream %s\n' "$fork_ref" "$ahead" "$behind" "$upstream_branch"
