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

The `nsvx` plugin ([extensions/nsvx](../../extensions/nsvx/README.md)) adds one NSVX page with six tabs.

| Tab      | What it does                                                 | Data owner                       |
| -------- | ------------------------------------------------------------ | -------------------------------- |
| Today    | Decisions, questions, running and done tasks, alerts         | NSVX owner screens (read only)   |
| Tasks    | Task list with filters and each task's history               | NSVX owner screens (read only)   |
| Work     | Coding work totals, servers, and running jobs                | NSVX owner screens (read only)   |
| Team     | Agent tree; Reports to, Runs on, Task, Stop, Pause, Resume   | Gateway config and sessions      |
| Actions  | Run NSVX AgentOS actions, decide approvals, see recent tasks | NSVX AgentOS (see Blockers)      |
| Progress | This registry by family                                      | `registry.json`, copied at build |

Pause keeps the agent's old leads in plugin state (`nsvx-paused`), so Resume restores the same tree. Chat gets the
same through `nsvx_team`, which pauses or resumes only on the owner's own turns.

`ui/src/e2e/nsvx-plugin.e2e.test.ts` builds the plugin, mounts it in Control UI against a mock Gateway, and checks
Today, Tasks, Work, and the Stop, Task, Pause, and Resume requests. Set `OPENCLAW_CAPTURE_UI_PROOF=1` to write desktop and mobile screenshots. A mock run
counts toward `ui`, `desktop`, and `mobile`; `data` and `chat` stay open until a live Gateway run is recorded.

## Brief copy

`MASTER-PROMPT.md` matches the owner's chat text except for one word: line 2 drops the owner's surname, because this
repository is public and the owner is anonymous on Git. The original is
`002b21df9ff516bd82bd89f3e5190692b2380e32e44f37eff91f72d1c24de8c7`, kept on the Grow host at
`apps/openclaw/missions/nsvx-parity/MASTER-PROMPT.md`.

## Blockers

- **Owner screens need the owner's session.** Today, Tasks, and Work read NSVX owner routes (`OWNER_VIEWS` in
  `extensions/nsvx/src/client.ts`) with `NSVX_OWNER_SESSION`, GET only. Until it is set, those tabs show a sign-in
  card. They were proven against a mock Gateway with synthetic NSVX payloads, not against a live NSVX.
- **No NSVX machine sign-in.** AgentOS at `/api/agentos/v1` is the safe path: typed action contracts with policy,
  approvals, idempotency, and audit. Its `get_principal` rejects every `Authorization` header and accepts only the
  owner's browser session. The bearer token work (`AD-8` in the NSVX AgentOS architecture doc) must land in NSVX first.
  A stored owner session is not a substitute: it would give chat tools the owner-only views that AgentOS withholds from agents.
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
