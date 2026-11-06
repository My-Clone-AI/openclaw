# DECISIONS — OpenClaw Controller / NSVX

Durable decisions. Newest last.

- 2026-11-06 — Session harness lives in `.agents/harness/`. Root `AGENTS.md` stays the upstream product contract (hard cap 20,000 characters) with one pointer here. No root `init.sh` / `PROGRESS.md` / `feature_list.json`.
- 2026-11-06 — Definition of done: unit → integration → end-to-end, in order, with evidence in `feature_list.json`. `passing` needs evidence. WIP=1. The implementer does not grade itself (Grow reviewer / independent verifier).
- 2026-11-06 — Every task appends one line to `diagnostics/log.jsonl`; failed rows name one of task_specification, context_provision, execution_environment, verification_feedback, state_management.
- 2026-11-06 — `/goal` = Grow Ideas/Jobs (one big task until a checker confirms). `/loop` = Grow Timers (one small action on an interval). Periodic cleanup runs as Master Grow jobs, not Grok Bot watchers.
- 2026-11-06 — `validate.mjs` always prints one deterministic `diagnostic layers:` histogram line (ok + per-layer fails + malformed, zeros on empty log); a `passing` feature needs every evidence entry to be a non-empty string. Histogram is informational; WIP/evidence/log-shape problems still exit 1.
- 2026-11-06 (Miguel t45u–t48u) — The only product surface is the OpenClaw Control desktop app's `nsvx` hub, in Control's own look ("Native here", like Live tasks / Servers / Grow · Apps / Skills). Everything built on the old NSVX-themed icon-rail UI moves there; only after everything is native, the old theme, icon rail and "opens the real page" exits are deleted. NSVX backend/API stays. Rules (AGENTS.md editor) is a native Grow section there.
- 2026-11-06 — No `clone_session` / `NSVX_OWNER_SESSION` lift, no AgentOS remint, DEV gateway is `:18790`, never touch `:18789`.
