# NSVX plugin

Brings NSVX into OpenClaw Control: the agent team chart, NSVX action contracts, approvals, and parity progress.

Enable it with `openclaw plugins enable nsvx`. Set the NSVX address in the plugin config (`baseUrl`). Two sign-ins
live in the Gateway's environment and never reach the browser:

| Variable             | Used by                                            | Access                                      |
| -------------------- | -------------------------------------------------- | ------------------------------------------- |
| `NSVX_OWNER_SESSION` | Today, Tasks, Work, and Agenda tabs; `nsvx_agenda` | Fixed NSVX owner screens and Agenda routes  |
| `NSVX_AGENTOS_TOKEN` | Actions tab and other chat tools                   | AgentOS actions, with NSVX policy and audit |

`NSVX_OWNER_SESSION` is the owner's own `clone_session` cookie value. It reads fixed owner screens with `GET`. Only
the Agenda's fixed `/api/workspace` POST routes (`OWNER_POSTS` in `src/client.ts`) fetch its CSRF token per call: free
times, summary, preview, calendar show/hide, and calendar changes. A change runs only with the terms hash of the NSVX
preview the person confirmed in Control (`operator.write`), under one client key, so a retry replays instead of
inviting twice. The `nsvx_agenda` chat tool reads events and free times, and only on the owner's own turn. Team works
with neither, because it reads this Gateway's own agents.

NSVX stays the only owner of its data: every read and write goes through its AgentOS API, which applies its own
policy, approvals, idempotency, and audit. See [docs/nsvx-parity/README.md](../../docs/nsvx-parity/README.md) for
status and blockers.
