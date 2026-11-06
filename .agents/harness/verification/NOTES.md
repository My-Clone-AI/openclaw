# Verification notes

What was run, on which sha, and what it proved. Newest last. No claim without a command and its exit code.

The diagnostic log (`../diagnostics/log.jsonl`) starts empty on purpose: no fake success lines.

| Date | HEAD | Level | Command | Exit | Proved |
|---|---|---|---|---|---|
| 2026-11-06 | 541fa1b | unit | `node --test .agents/harness/validate.test.mjs` | 0 | 8 pass: WIP=2, empty/blank/junk evidence guards; histogram counts + format + empty log |
| 2026-11-06 | 541fa1b | unit-negative | pre-fix `HEAD:validate.mjs` in /tmp: new tests fail (no `summarizeLayers` export); junk-evidence `["real proof",""]` passes old guard | 0 | Confirms fixtures target the gap, not existing behavior |
| 2026-11-06 | 541fa1b | integration | `bash .agents/harness/init.sh` (validate, agents-md-size, nsvx entry test) | 0 | Full init green after change; earlier fail-closed exit 1 on missing node_modules |
| 2026-11-06 | 541fa1b | e2e | appended 2 real lines to `diagnostics/log.jsonl`, ran `node .agents/harness/validate.mjs` | 0 | `diagnostic layers: total=2 ok=1 ... execution_environment=1 ...` printed, state ok |
