# PROGRESS — OpenClaw Controller / NSVX session harness

Course note: this file has the role of `claude-progress.md` in Learn Harness Engineering.

## Current Verified State

- Repository root: `My-Clone-AI/openclaw` (product contract: root `AGENTS.md`, under 20,000 characters)
- Standard startup path: `.agents/harness/AGENTS.md` → `.agents/harness/init.sh`
- Standard verification path: `.agents/harness/init.sh` (harness state, `pnpm check:agents-md-size`, nsvx entry test); focused suites per `docs/help/testing/suites.md`
- Product surface: OpenClaw Control desktop app → `nsvx` hub only (Miguel 2026-11-06 t45u–t48u). The old NSVX-themed icon-rail UI is retired.
- Highest-priority unfinished feature: see `feature_list.json`
- Current blocker: see `feature_list.json` notes
- Git checkpoint: initializer commit recorded below after merge

## Session Log

### Session 001 — 2026-11-06 (harness initializer)

- Goal: land the session kit under `.agents/harness/` and a one-line pointer in root `AGENTS.md`.
- Completed: kit files added; root `AGENTS.md` body unchanged except the pointer.
- Verification run: see `verification/NOTES.md`.
- Commits: initializer PR (merge sha recorded by the next session).
- Next best step: top non-passing feature in `feature_list.json`.
