# NSVX plugin

Brings NSVX into OpenClaw Control: the agent team chart, NSVX action contracts, approvals, and parity progress.

Enable it with `openclaw plugins enable nsvx`. Set the NSVX address in the plugin config (`baseUrl`). Two sign-ins
live in the Gateway's environment and never reach the browser:

| Variable             | Used by                     | Access                                      |
| -------------------- | --------------------------- | ------------------------------------------- |
| `NSVX_OWNER_SESSION` | Today, Tasks, Work, AI tabs | Fixed owner screens; fixed AI settings      |
| `NSVX_AGENTOS_TOKEN` | Actions tab and chat tools  | AgentOS actions, with NSVX policy and audit |

`NSVX_OWNER_SESSION` is the owner's own `clone_session` cookie value. Today, Tasks, and Work only read fixed owner
screens with it. Team works with neither sign-in, because it reads this Gateway's own agents.

The AI tab also changes a fixed list of NSVX AI settings with that session: lane order, on/off, skip and test; account
on/off, preference, check and test; clone-ai routing, check and rollback; voice engine and voice options. Each change
fetches the session's CSRF token first, as the NSVX page does. Messages, money, sign-ins, account removal, and the paid
voice budget stay in NSVX. The `nsvx_ai` and `nsvx_ai_change` chat tools answer only on the owner's own turn.

NSVX stays the only owner of its data: every read and write goes through its AgentOS API, which applies its own
policy, approvals, idempotency, and audit. See [docs/nsvx-parity/README.md](../../docs/nsvx-parity/README.md) for
status and blockers.
