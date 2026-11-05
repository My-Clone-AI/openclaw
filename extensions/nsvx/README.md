# NSVX plugin

Brings NSVX into OpenClaw Control: the agent team chart, NSVX action contracts, approvals, and parity progress.

Enable it with `openclaw plugins enable nsvx`. Set the NSVX address in the plugin config (`baseUrl`). Two sign-ins
live in the Gateway's environment and never reach the browser:

| Variable             | Used by                     | Access                                      |
| -------------------- | --------------------------- | ------------------------------------------- |
| `NSVX_OWNER_SESSION` | Today, Tasks, and Work tabs | Fixed NSVX owner screens, `GET` only        |
| `NSVX_AGENTOS_TOKEN` | Actions tab and chat tools  | AgentOS actions, with NSVX policy and audit |

`NSVX_OWNER_SESSION` is the owner's own `clone_session` cookie value. It reads owner screens only: chat tools never
use it, and without its CSRF token NSVX refuses any change made with it. Team works with neither, because it reads
this Gateway's own agents.

NSVX stays the only owner of its data: every read and write goes through its AgentOS API, which applies its own
policy, approvals, idempotency, and audit. See [docs/nsvx-parity/README.md](../../docs/nsvx-parity/README.md) for
status and blockers.
