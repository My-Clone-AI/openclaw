# OpenClaw Mac — org→repo multi-select picker (exact-21)

## Goal
Replace folder-first Coding PROJECTS picker with multi-select **remote GitHub org→repo** selection.
Miguel is not a coder; OpenClaw is the gateway only. Hermes designs; Master enqueues Grow planner-queue exact-21; runners execute.

## Default orgs
1. **My-Clone-AI** (primary)
2. **bitcoinuniverseio** (BU / production Universe context)
3. **Project-Boden** (secondary)
4. **Echelon-RSVP** (secondary)

## Default branch
`develop` for all selected remotes.

## Constraints
- Never Cursor cloud/coding agents
- Never Mac/laptop as git/CI runner
- Master connects/schedules/monitors only; runners execute
- Concluídas only after merge to `develop` + DEV deploy verified on mac48 OpenClaw.app
- Deployment policy 3.1.1: minimal tests on changed scope; ≤5 min to live

## Key UI
`ui/src/pages/new-session/project-picker-content.tsx`
- Add org segmented control / tabs for the four orgs
- Multi-select remote repos (searchRemote ≥2 chars scoped to selected org)
- Demote local "Browse folders" behind Advanced
- Persist last org + selected repos in OpenClaw state
- Paste URL still works as fallback

## Gateway
- Ensure Master OpenClaw gateway GitHub token/App can list/search the four orgs
- `projects.searchRemote` (or equivalent) filtered by org
- Thin client `ai.openclaw.mac` remains pointed at Master (51.255.87.117)

## Exact-21 jobs
See GitHub issues labeled `exact-21` + `openclaw-picker` on this repo (#1–#21 batch titles).

## Pipeline
Codex Terra 6.1 Medium → Muse Spark 1.3 XHIGH Contributor → Claude Opus 5.5 Medium debug on runners.
