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
| `MASTER-PROMPT.md`      | Missing   | Owner brief; see [Blockers](#blockers)            |

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
| `My-Clone-AI/clone`    | `origin/develop` | `228296050da9da6fe364a88d5f5901bd9ce8b9b2` |
| `My-Clone-AI/openclaw` | `origin/develop` | `dfc33ec231d4afd31ae7eeb8b9b218575b39a596` |

The clone commit is the newest in the runner's local copy. The runner has no credential to
fetch that private repository, so newer commits may exist.

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
| OpenClaw plugins and plugin views | `openclaw.plugin.json` (`controlUi`)                               |

Portals are covered by the `portals` route and the `portal.*` methods in the inventory.

## Registry entries

| Field                                                             | Meaning                                           |
| ----------------------------------------------------------------- | ------------------------------------------------- |
| `id`, `title`, `category`, `priority`                             | Identity; `P0` builds first                       |
| `status`                                                          | `native`, `partial`, `missing`, or `blocked`      |
| `nsvx.webRoutes`, `backendPackages`, `jobPackages`, `apiPrefixes` | Checked against the NSVX source                   |
| `openclaw.uiRoutes`, `gatewayMethods`, `extensions`               | Checked against the working tree                  |
| `adapter`                                                         | How the feature reaches its NSVX or Gateway owner |
| `evidence.level`, `evidence.source`, `evidence.runtime`           | `runtime` needs a recorded run                    |
| `blockers`, `unknowns`                                            | What stops the work; what was not determined      |

`source` evidence means the code was read. It does not mean the feature was seen working.

## Blockers

- **`MASTER-PROMPT.md` is absent.** The job pointed at `missions/nsvx-parity/MASTER-PROMPT.md` and
  `docs/nsvx-parity/MASTER-PROMPT.md`. Neither exists in the worktree, any remote ref of this
  repository, or the runner's Grow files. A reconstructed copy would not be verbatim, so none was
  written. The registry fields above were chosen for this audit and may need new fields from the brief.
- **No NSVX service credential.** NSVX routes need the owner session and CSRF token, so domain
  features have no safe way to reach NSVX from a Gateway plugin yet.

## Limits

- **No runtime check of NSVX.** Nothing here came from a running NSVX or from a signed-in browser.
- **Private detail stays out.** This repository is public and clone is private, so route-level NSVX
  lists are not tracked. `source-inventory.json` holds counts and a digest; `--full-out <path>` writes
  the complete lists locally. Registry entries name only the routes and packages they need.
- **Static parsing.** The generator misses `add_api_route` routes (3 at the pin) and job kinds passed
  as variables (`unresolvedEnqueueCalls`). Routes in a module that rebinds `router` use the first
  binding's prefix, so routes added after the rebinding may show a wrong prefix.
- **Unmatched clients.** 6 of 551 API client paths match no parsed backend route. Each may be a parser
  gap or a dead client; they were not checked one by one.
- **Domain status is coarse.** `missing` on a business domain means no native page exists in the source.
  It does not say that the domain should be built here.
