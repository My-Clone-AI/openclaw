# NSVX plugin

Brings NSVX into OpenClaw Control: the agent team chart, NSVX action contracts, approvals, and parity progress.

Enable it with `openclaw plugins enable nsvx`. Set the NSVX address in the plugin config (`baseUrl`) and put the
sign-in token in `NSVX_AGENTOS_TOKEN` in the Gateway's environment. The token never reaches the browser.

NSVX stays the only owner of its data: every read and write goes through its AgentOS API, which applies its own
policy, approvals, idempotency, and audit. See [docs/nsvx-parity/README.md](../../docs/nsvx-parity/README.md) for
status and blockers.
