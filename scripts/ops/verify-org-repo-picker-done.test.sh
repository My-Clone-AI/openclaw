#!/usr/bin/env bash
set -euo pipefail
script="$(cd "$(dirname "$0")" && pwd)/verify-org-repo-picker-done.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/repo" "$tmp/bin"
git -C "$tmp/repo" init -q
git -C "$tmp/repo" -c user.name=Test -c user.email=test@example.invalid commit --allow-empty -qm 'picker' -m '[20261104T155432-t980u-oc-21] fixture'
sha=$(git -C "$tmp/repo" rev-parse HEAD)
printf '#!/usr/bin/env bash\nprintf "%%s\\n" "${TEST_GH_STATUS:-ahead}"\n' > "$tmp/bin/gh"
chmod +x "$tmp/bin/gh"
export PATH="$tmp/bin:$PATH"
cd "$tmp/repo"
printf 'commit=%s\nartifact_sha256=%064d\nevidence_reference=record-1\ninstall=pass\ngateway=pass\norganizations=pass\nmultiselect=pass\nbranches=pass\npaste_url=pass\nbrowse_folders=pass\n' "$sha" 0 > "$tmp/evidence"
"$script" "$sha" "$tmp/evidence" >/dev/null
if TEST_GH_STATUS=behind "$script" "$sha" "$tmp/evidence" >/dev/null 2>&1; then
  echo 'Expected unmerged commit to fail' >&2; exit 1
fi
sed 's/multiselect=pass/multiselect=fail/' "$tmp/evidence" > "$tmp/failed"
if "$script" "$sha" "$tmp/failed" >/dev/null 2>&1; then
  echo 'Expected failed Mac check to fail' >&2; exit 1
fi
printf 'install=pass\n' >> "$tmp/evidence"
if "$script" "$sha" "$tmp/evidence" >/dev/null 2>&1; then
  echo 'Expected duplicate evidence to fail' >&2; exit 1
fi
printf 'Picker completion verification tests passed.\n'
