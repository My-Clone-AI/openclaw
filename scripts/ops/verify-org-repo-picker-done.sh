#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s <feature-commit-sha> <mac48-evidence-file>\n' "$(basename "$0")"
  printf 'Checks fork develop ancestry and commit-bound manual Mac verification; see docs/ops/openclaw-org-repo-picker-verify.md.\n'
}
if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then usage; exit 0; fi
if [[ $# -ne 2 ]]; then usage >&2; exit 1; fi
fail() { printf 'NOT DONE: %s\n' "$1" >&2; exit 1; }
sha=$1
evidence=$2
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail 'Provide the full lowercase feature commit SHA.'
git cat-file -e "$sha^{commit}" 2>/dev/null || fail 'Feature commit is not available locally.'
git log -1 --format=%B "$sha" | grep -Fq '[20261104T155432-t980u-oc-21]' || fail 'Commit does not identify OC-21.'
[[ -f "$evidence" ]] || fail 'Mac verification evidence is missing.'

# Parse data as text, never as shell. Duplicate or unknown keys fail closed.
commit= artifact_sha256= evidence_reference= install= gateway= organizations= multiselect= branches= paste_url= browse_folders=
while IFS='=' read -r key value || [[ -n "$key" ]]; do
  case "$key" in
    commit|artifact_sha256|evidence_reference|install|gateway|organizations|multiselect|branches|paste_url|browse_folders)
      [[ -n "$value" && "$value" != *$'\r'* ]] || fail "Empty or invalid evidence field: $key"
      [[ -z "${!key}" ]] || fail "Duplicate evidence field: $key"
      printf -v "$key" '%s' "$value"
      ;;
    *) fail 'Unknown or malformed evidence field.' ;;
  esac
done < "$evidence"
[[ "$commit" == "$sha" ]] || fail 'Mac evidence does not match the feature commit.'
[[ "$artifact_sha256" =~ ^[0-9a-f]{64}$ ]] || fail 'Mac evidence needs the verified artifact SHA-256.'
[[ -n "$evidence_reference" && "$evidence_reference" != *[[:space:]]* ]] || fail 'Supply a nonempty evidence reference without whitespace.'
for key in install gateway organizations multiselect branches paste_url browse_folders; do
  [[ "${!key}" == pass ]] || fail "Mac check not passed: $key"
done
command -v gh >/dev/null || fail 'GitHub CLI is required to verify fork develop.'
status=$(gh api "repos/My-Clone-AI/openclaw/compare/${sha}...develop" --jq .status) || fail 'Could not verify fork develop on GitHub.'
[[ "$status" == ahead || "$status" == identical ]] || fail 'Feature commit is not an ancestor of fork develop.'
printf 'DONE: fork develop contains %s; commit-bound mac48 operator evidence: %s\n' "$sha" "$evidence_reference"
