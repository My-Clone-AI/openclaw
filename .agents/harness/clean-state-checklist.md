# Clean State Checklist

Run before ending every session.

- [ ] `.agents/harness/init.sh` still passes (standard startup path works).
- [ ] The focused verification for touched files still runs.
- [ ] `PROGRESS.md` records what happened and the exact git sha.
- [ ] `feature_list.json` reflects what is actually passing versus unverified (`node .agents/harness/validate.mjs`).
- [ ] One line appended to `diagnostics/log.jsonl` for the task (ok, or the failing layer).
- [ ] No half-finished step is left undocumented in `session-handoff.md`.
- [ ] Debug logs, temp files, commented-out code and stray TODOs removed.
- [ ] Root `AGENTS.md` is still under 20,000 characters.
- [ ] The next session can continue without manual repair.
