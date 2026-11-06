# Session harness

This repository’s root `AGENTS.md` is the product contract (keep it under 20,000 characters). This file is the session harness for long-running coding-agent work on OpenClaw Controller / NSVX.

The goal is not to maximize raw code output. The goal is to leave the repo in a state where the next session can continue without guessing.

## Startup workflow

Before writing code:

1. Confirm the working directory with `pwd`.
2. Read `.agents/harness/PROGRESS.md` for the latest verified state and next step.
3. Read `.agents/harness/DECISIONS.md`.
4. Read `.agents/harness/feature_list.json` and choose the highest-priority unfinished feature (only one `in_progress` at a time).
5. Review recent commits with `git log --oneline -5` and record the exact HEAD sha in the progress file (git checkpoint).
6. Run `.agents/harness/init.sh`.
7. If baseline verification is already failing, fix that first. Do not stack new feature work on a broken starting state.

## Working rules

- Work on one feature at a time.
- Do not mark a feature complete just because code was added.
- Keep changes inside the selected feature unless a blocker forces a narrow supporting fix.
- Do not silently change verification rules during implementation.
- Prefer durable repo artifacts over chat summaries.
- Prefer shared utilities over new helpers. Do not YOLO-guess data structures — validate or use typed SDKs.
- Follow the root `AGENTS.md` and the nearest scoped `AGENTS.md`.
- Failures are harness defects. Log them (see Diagnostic loop) and fix the layer.

## Definition of done

A feature is done only when all of the following are true:

- the target behavior is implemented
- verification ran in order: (1) unit (2) integration (3) end-to-end — never skip ahead
- evidence is recorded in `feature_list.json` and `PROGRESS.md`
- the repository remains restartable from the standard startup path

`passing` in `feature_list.json` requires a non-empty `evidence` list. The implementer does not grade itself.

## Diagnostic loop

For each task, append one line to `.agents/harness/diagnostics/log.jsonl`:

```json
{"ts":"","task":"","ok":true,"layer":null,"detail":"","fix":""}
```

If it failed, set `ok` to false and `layer` to one of: `task_specification`, `context_provision`, `execution_environment`, `verification_feedback`, `state_management`. Then fix that layer so the same failure cannot repeat.

## Required artifacts

- `feature_list.json` — source of truth for feature state
- `PROGRESS.md` — session log and current verified status
- `DECISIONS.md` — durable decisions
- `init.sh` — standard startup and verification path
- `session-handoff.md` — compact handoff
- `verification/NOTES.md` — what was run and what it proved
- `diagnostics/log.jsonl` — succeed/fail + layer

## Loops

`/goal` is one big task that runs until an independent checker says it is done. `/loop` is one small action that repeats on an interval. Grow Ideas/Jobs map to `/goal`. Grow Timers map to `/loop`.

## End of session

1. Update `PROGRESS.md` (including the exact git sha).
2. Update `feature_list.json` honestly (no false `passing`).
3. Update `session-handoff.md`, `DECISIONS.md`, and verification notes.
4. Run the clean-state checklist. Delete debug logs, temp files, commented-out leftovers, and stray TODOs.
5. Commit with a descriptive message once the work is in a safe state.
6. Leave the repo clean enough for the next session to run `init.sh` immediately.
