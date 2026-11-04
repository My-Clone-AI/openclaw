# Check fork synchronization

From the My-Clone-AI/openclaw checkout, fetch the fork's `develop` branch first,
then run `scripts/ops/fork-sync-check.sh`. The script fetches upstream
`openclaw/openclaw`'s `main` into `FETCH_HEAD` and reports how many commits
`origin/develop` is ahead and behind it. A nonzero count is information, not
proof that the fork is up to date or that merging is safe. Review the changes
and resolve conflicts through the normal fork review process.

The script never pushes or force-pushes and does not update a local branch.
For a local test or a different upstream branch, set `OPENCLAW_UPSTREAM_URL`,
`OPENCLAW_UPSTREAM_BRANCH`, or `OPENCLAW_FORK_REF`. Refresh the fork ref before
running: an old remote-tracking ref produces an old comparison.
