---
summary: "NSVX to OpenClaw Control parity: registry, source inventory, method, and limits"
read_when:
  - Updating the NSVX parity registry or its generator
  - Choosing the next NSVX feature to build in OpenClaw Control
title: "NSVX parity"
---

# NSVX parity

Tracks which NSVX (`My-Clone-AI/clone`) features exist natively in OpenClaw Control.

| File                    | Owner     | Purpose                                           |
| ----------------------- | --------- | ------------------------------------------------- |
| `registry.json`         | Hand kept | One entry per feature, with pinned source commits |
| `source-inventory.json` | Generated | Source counts, OpenClaw lists, registry coverage  |
| `MASTER-PROMPT.md`      | Owner     | Owner brief; see [Brief copy](#brief-copy)        |

## Regenerate

```bash
node scripts/nsvx-parity-inventory.mts --clone-repo <clone checkout>          # write
node scripts/nsvx-parity-inventory.mts --clone-repo <clone checkout> --check  # verify
pnpm test test/scripts/nsvx-parity-inventory.test.ts
```

Sources are read from Git objects at the commits in `registry.json`, so a dirty or
moved checkout gives the same bytes. To move a pin, edit the commit and regenerate.
The test needs no clone access and also runs in CI. `--check` needs both pinned commits locally.

## Audited revisions

| Repo                   | Branch           | Commit                                     |
| ---------------------- | ---------------- | ------------------------------------------ |
| `My-Clone-AI/clone`    | `origin/develop` | `68978f9f91620832707fe0a0a5d6db1deb7868ed` |
| `My-Clone-AI/openclaw` | `origin/develop` | `dfc33ec231d4afd31ae7eeb8b9b218575b39a596` |

The clone commit is the newest `origin/develop` in the runner's copy (4 Nov 2026, 20:25 New York time). The runner
cannot fetch that private repository, so newer commits may exist. Moving the pin from `2282960` added NSVX #903
(Hermes retired, OpenClaw brain inbox) and three `openclaw_admin` routes: sessions, task, and connection.

## What the generator reads

| Source                            | Method                                                             |
| --------------------------------- | ------------------------------------------------------------------ |
| NSVX web routes                   | `seg[n] === 'x'` branches and pre-Shell paths in `web/src/App.tsx` |
| NSVX navigation, tabs, screens    | `navigation.ts`, `{ id, label }` rows, `web/src/screens`           |
| NSVX API clients                  | `/api/...` strings in `web/src`, without tests                     |
| NSVX backend routes               | FastAPI decorators plus `include_router` mounts                    |
| NSVX jobs                         | `enqueue(conn, "kind")`, `HANDLERS` keys, systemd units            |
| `openclaw_admin`                  | Module files and the RPC allowlists in `gateway.py`                |
| OpenClaw routes and pages         | `app-route-paths.ts`, `ui/src/pages/*/route.ts`                    |
| OpenClaw Gateway methods          | `core-descriptors.ts`, `registerGatewayMethod`                     |
| OpenClaw plugins and plugin views | `openclaw.plugin.json` (`controlUi`, `contracts.tools`)            |

Portals are covered by the `portals` route and the `portal.*` methods in the inventory.

## Registry entries

Top-level `sources` holds the repository and commit for every entry; `families` holds the brief's 22 groups.

| Field                                                             | Meaning                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `id`, `title`, `family`, `priority`                               | Identity and functional group; `P0` builds first                |
| `status`                                                          | `native`, `partial`, `missing`, or `blocked` in OpenClaw        |
| `nsvx.webRoutes`, `backendPackages`, `jobPackages`, `apiPrefixes` | Checked against the NSVX source                                 |
| `nsvx.sourceFiles`                                                | Exact owning files; each must exist at the pin                  |
| `nsvx.permissions`, `effect`, `integrations`                      | Who may call it; `read`, `write`, or `external`; needs          |
| `nsvx.runtime`                                                    | NSVX availability; `not-checked` means nothing was run          |
| `openclaw.uiRoutes`, `gatewayMethods`, `extensions`, `chatTools`  | Matching OpenClaw surface, checked against the tree             |
| `adapter`                                                         | How the feature reaches its NSVX or Gateway owner               |
| `verification.requires`, `verification.passed`                    | The brief's ten checks; `passed` beyond `discovery` needs a run |
| `evidence.level`, `evidence.source`, `evidence.runtime`           | `runtime` needs a recorded run                                  |
| `blockers`, `unknowns`                                            | What stops the work; what was not determined                    |

`source` evidence means the code was read. It does not mean the feature was seen working. An entry counts as
verified only when every required check passed, so `coverage.parity` can only rise with recorded runs.

## Coverage

`source-inventory.json` assigns every parsed backend route to the entry with the longest matching prefix.
`coverage.byEntry` gives read and write counts plus a digest per entry, so moving the NSVX pin shows exactly which
entries changed in the diff. `coverage.unassignedRouteAreas` lists what no entry owns; those routes are parser gaps
or internal service endpoints that still need a decision.

## Built in Control

The `nsvx` plugin ([extensions/nsvx](../../extensions/nsvx/README.md)) adds one NSVX page; these are its main tabs.

| Tab         | What it does                                                                 | Data owner                       |
| ----------- | ---------------------------------------------------------------------------- | -------------------------------- |
| Today       | Decisions, questions, running and done tasks, alerts                         | NSVX owner screens (read only)   |
| Messages    | Inbox by channel, thread, approve drafts, reply, take over                   | NSVX owner screens and changes   |
| Quick reply | Paste, write with AI, change, copy, history                                  | NSVX Quick Reply drafts          |
| People      | People, person page, interests, places, memory, groups                       | NSVX owner screens and changes   |
| Agenda      | Day, week, month; book, move, cancel; Meet, guests, help                     | NSVX Google Calendar (workspace) |
| Tasks       | Task list with filters and each task's history                               | NSVX owner screens (read only)   |
| Work        | Coding work totals, servers, and running jobs                                | NSVX owner screens (read only)   |
| Group       | Apps, app page, Errors, Visits, Servers, Mail                                | NSVX owner screens and changes   |
| Team        | Agent tree; Reports to, Runs on, Task, Stop, Pause, History                  | Gateway config and sessions      |
| Setup       | Agent instructions and tools, team defaults, team ideas                      | Gateway config and AGENTS.md     |
| Skills      | NSVX skills: on/off, review learned ones, steps and runs                     | NSVX owner screens and changes   |
| Device      | Desktop jobs (stop), bots (edit), memory (fix, forget), skills, offline sync | NSVX `/api/desktop`, `/api/sync` |
| Health      | Up, ready, checks, warnings, one job's attempts; legal pages                 | NSVX public probes and pages     |
| Grow        | Coding apps (mode, run, stop all, log), ideas, brain, timers, model chains   | NSVX Grow, Build Me, and brain   |
| Actions     | Run NSVX AgentOS actions, decide approvals, see recent tasks                 | NSVX AgentOS (see Blockers)      |
| Progress    | This registry by family                                                      | `registry.json`, copied at build |

Every Team tree change (move, device, pause, resume, undo) goes through the plugin's `nsvx.team.*` methods, which log
the `agents` config section before the change in plugin state (`nsvx-team-history`, last 100). History lists them and
Undo restores the team as it was before one, as NSVX rollback does; agents deleted since stay deleted. Pause keeps the
agent's old leads (`nsvx-paused`), so Resume restores the same tree. Chat gets the same through `nsvx_team`, which
changes the team only on the owner's own turns.

Setup edits the same text NSVX's Architecture Manager edits: the `nsvx-openclaw:managed` section of an agent's
`AGENTS.md` (instructions) and the main agent's `nsvx-openclaw:policies` section (team rules), each written with the
file hash so a hand edit is never overwritten. Tool access and team defaults go to Gateway config through the team
history, so Team Undo restores them; paid API models are refused with NSVX's `provider_kind` rule. Ideas asks NSVX's
own suggest route (owner session) and Add creates the agent and links it under its lead. Chat gets `nsvx_agents` and
`nsvx_skills`; changes run only on the owner's own turns, and approving a learned skill stays a person's tap.
`ui/src/e2e/nsvx-setup.e2e.test.ts` covers both tabs at 1280 and 390 wide (`ui/e2e-shots/nsvx-setup/`).

Messages and Quick reply read NSVX through `nsvx.view` and change it only through `nsvx.messages.*` and
`nsvx.quickReply.*`, one fixed NSVX route each (`OWNER_WRITES`), sent with the owner session and the CSRF token NSVX
gives that session. A reply keeps its idempotency key until NSVX confirms it, so an uncertain send is repeated with
the same key and NSVX dedupes it. The AI draft button and the Quick reply tab use NSVX Quick Reply under its current
rules; the draft lands in the composer or on screen and is never sent by itself. Chat gets `nsvx_messages` on the
owner's own turns: unanswered, find, read, draft, take over, and auto replies. It never sends, because message text
from other people reaches the model and could carry instructions. `ui/src/e2e/nsvx-messages.e2e.test.ts` covers the
list, filters, thread, AI draft, send, approve, take over, and Quick reply at 1280 and 390 wide.

People reads NSVX `/api/people`, each person, their interests, places, contact details, and private groups through
`nsvx.view`, and changes them only through `nsvx.people.change` and `nsvx.groups.change`, one fixed NSVX route
each. Group changes carry the revision the owner saw, so NSVX answers a stale one with `conflict` and the tab
reloads; proposing a place carries an idempotency key. Nothing there sends a message: the participant invite and
the participant's own page stay in NSVX. Chat gets `nsvx_people` on the owner's own turns: find, read, places,
groups, mode, topic, and group members. `ui/src/e2e/nsvx-people.e2e.test.ts` covers the list, person page, mode,
interests, memory, and group confirm at 1280 and 390 wide.

Agenda reads NSVX `/api/workspace` (status, calendars, events, one event, an intent) through `nsvx.view`, with one
live Google read on open as the NSVX screen does. Booking, moving, and cancelling go through `nsvx.agenda.preview`,
then `nsvx.agenda.submit` with the preview's terms hash and one client key per intent, so NSVX refuses changed terms
and an uncertain result is followed, never resubmitted. Chat gets `nsvx_agenda` on the owner's own turns: events,
event, free, summary, book, move, and cancel; a change Google would announce to guests returns `needsOwner` with the
terms instead of running. `ui/src/e2e/nsvx-agenda.e2e.test.ts` covers week, month, event, booking, and review at
1280 and 390 wide.
Device and Health read NSVX through `nsvx.view`, `nsvx.sync.overview`, `nsvx.health`, and `nsvx.legal`, and change it
only through `nsvx.desktop.*` and `nsvx.sync.*`, each one fixed `OWNER_WRITES` route. Sync sends NSVX's own four
replayable changes (task, draft, rename task, rename person) with the caller's key and time, so a retry after an
uncertain answer keeps one copy; a saved draft is sent only after Review, then Send. Legal pages come from NSVX as HTML;
`parseLegal` in `extensions/nsvx/src/device.ts` turns them into plain blocks that Control draws itself. Chat gets
`nsvx_device` on the owner's own turns: bots, jobs, stop, skills, memory recall, sync, create a held task, health, and
legal; it never sends. `ui/src/e2e/nsvx-device.e2e.test.ts` covers both tabs at 1280 and 390 wide
(`ui/e2e-shots/nsvx-device`).

Group (Grupo Open, NSVX `/empresas-do-grupo`) reads `/api/group-companies/*` through `nsvx.view` and changes it only
through `nsvx.group.*`, one fixed route each. Dev actions (CI, dev redeploy or restart, Grow) and server actions need
`operator.admin`; app operations and app mail need `operator.write`. App operations are checked first when the app
offers a preview, confirmed, typed for high risk, and sent with one idempotency key per intent. Mail is saved as a
draft and sent only after a second confirm; bodies show as plain text. Adult apps never appear. Chat gets the optional
owner-only `nsvx_group`: reads, plus dev actions, which NSVX limits to development; it never sends mail, runs app
operations, or touches servers. `ui/src/e2e/nsvx-group.e2e.test.ts` covers every section at 1280 and 390 wide.

Grow reads NSVX `/api/grow` (status, per-app cycles, the live log, timers, model chains), the Build Me admin list and
ideas with their images, and the OpenClaw brain status and worker roles through `nsvx.view`. Changes go through
`nsvx.grow.control` (run, pause, resume, mode, stop all, one `Idempotency-Key` per tap; NSVX only queues them for its
engine), `nsvx.grow.timer`, `nsvx.grow.rollback`, `nsvx.ideas.submit`, `nsvx.ideas.decide` (fenced by the idea's
revision and version), `nsvx.brain.task`, and `nsvx.brain.roles`, each one fixed `OWNER_WRITES` route. A new idea is
text only and its tracking link stays in NSVX; a brain task has no NSVX idempotency key, so an uncertain answer is
reported, never repeated. Chat gets `nsvx_grow` on the owner's own turns. `ui/src/e2e/nsvx-grow.e2e.test.ts` covers
all four sections at 1280 and 390 wide (`ui/e2e-shots/nsvx-grow`).

`ui/src/e2e/nsvx-plugin.e2e.test.ts` builds the plugin, mounts it in Control UI against a mock Gateway, and checks
Today, Tasks, Work, and the Stop, Task, Pause, Resume, move, and Undo requests. Set `OPENCLAW_CAPTURE_UI_PROOF=1` to write desktop and mobile screenshots. A mock run
counts toward `ui`, `desktop`, and `mobile`; `data` and `chat` stay open until a live Gateway run is recorded.

## Brief copy

`MASTER-PROMPT.md` matches the owner's chat text except for one word: line 2 drops the owner's surname, because this
repository is public and the owner is anonymous on Git. The original is
`002b21df9ff516bd82bd89f3e5190692b2380e32e44f37eff91f72d1c24de8c7`, kept on the Grow host at
`apps/openclaw/missions/nsvx-parity/MASTER-PROMPT.md`.

## Blockers

- **Owner screens need the owner's session.** Today, Find, Tasks, Work, Activity, Messages, Quick reply, Money, and
  Group read NSVX owner routes (`OWNER_VIEWS` and `OWNER_READ_POSTS` in `extensions/nsvx/src/client.ts`) with
  `NSVX_OWNER_SESSION`; Messages, Quick reply, and Group also make the fixed `OWNER_WRITES` changes. Until it is set, those
  Device read NSVX owner routes (`OWNER_VIEWS` and `OWNER_READ_POSTS` in `extensions/nsvx/src/client.ts`) with
  `NSVX_OWNER_SESSION`; Messages and Quick reply also make the fixed `OWNER_WRITES` changes. Until it is set, those
  tabs show a sign-in card. They were proven against a mock Gateway with synthetic NSVX payloads, not against a live
  NSVX.
- **No NSVX machine sign-in.** AgentOS at `/api/agentos/v1` is the safe path: typed action contracts with policy,
  approvals, idempotency, and audit. Its `get_principal` rejects every `Authorization` header and accepts only the
  owner's browser session. The bearer token work (`AD-8` in the NSVX AgentOS architecture doc) must land in NSVX first.
  The owner session reaches chat only through the owner-only `nsvx_search`, `nsvx_activity`, `nsvx_messages`,
  `nsvx_people`, and optional `nsvx_finance` and `nsvx_group` tools (`nsvx_messages` and `nsvx_people` never send;
  finance is read-only; group reads and runs dev-only actions).
  The Actions tab therefore uses the owner session for the owner's own taps (cookie, plus CSRF on POST); the
  `nsvx_actions` and `nsvx_run` chat tools use only the bearer token and stay blocked until it exists. The owner
  session reaches chat only through the owner-only `nsvx_search`, `nsvx_activity`, `nsvx_messages`, `nsvx_people`,
  `nsvx_skills`, `nsvx_agents` (suggest), and optional `nsvx_finance` tools (`nsvx_messages` and `nsvx_people` never
  send; finance is read-only).
- **Few actions exist.** Five read actions are pinned: three group reads, the mission list, and task lookup.
  Everything else needs a contract in NSVX.
- **AgentOS is off by default.** The `agentos.gateway` flag defaults to off, and its live value was not checked.

## Limits

- **No runtime check of NSVX.** Nothing here came from a running NSVX or from a signed-in browser.
- **Family-level entries.** An entry covers a group of actions. The action-level list is the `--full-out` output, not
  the registry, so the brief's "every action" is met through route counts and digests rather than one row per action.
- **Private detail stays out.** This repository is public and clone is private, so route-level NSVX lists are not
  tracked. Registry entries name only their owning files and route prefixes; `--full-out <path>` writes the complete
  lists locally.
- **Static parsing.** The generator misses `add_api_route` routes (3 at the pin), plugin Gateway methods registered
  through a helper other than `method("plugin.name", ...)`, and job kinds passed as variables
  (`unresolvedEnqueueCalls`). Sub-applications appear without their mount path, and a module that rebinds `router`
  uses the first binding's prefix.
- **Unmatched clients.** 6 of 555 API client paths match no parsed backend route. Each may be a parser gap or a dead
  client; they were not checked one by one.
- **Domain status is coarse.** `missing` on a business domain means no native page exists in the source. It does not
  say that the domain should be built here.
