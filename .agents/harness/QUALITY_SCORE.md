# QUALITY_SCORE — OpenClaw Controller / NSVX

Quality snapshot per area. Updated by the Master Grow cleanup job (canary/dry-run first) and after significant sessions.

Grades: **A** verification passing, clean, agent-legible, stable tests · **B** passing, minor gaps · **C** partially working, known gaps · **D** not working or major structural issues.

## Areas

| Area | Grade | Verification | Agent legibility | Test stability | Key gaps | Last updated |
|---|---|---|---|---|---|---|
| Control nsvx hub (desktop) | - | - | - | - | old-theme tabs and exits to the old site still present | 2026-11-06 |
| extensions/nsvx (plugin logic) | - | - | - | - | old theme CSS per tab | 2026-11-06 |
| Grow (apps/ideas/brain/timers) | - | - | - | - | Rules section missing | 2026-11-06 |
| Session harness | - | - | - | - | new | 2026-11-06 |

## Golden rules checked by cleanup
1. Prefer the shared utility package over hand-rolled helpers.
2. Do not YOLO-guess data structures; validate boundaries or use typed SDKs.
3. Root `AGENTS.md` invariants (20,000-character cap, scoped guides).
4. No false `passing` rows in `feature_list.json`; no leftover debug logs, temp files, commented-out code, stray TODOs.

## Change History

### 2026-11-06
- Initial snapshot (harness initializer). No grades yet.
