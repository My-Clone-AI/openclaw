# NSVX plugin

Brings NSVX into OpenClaw Control: Today, Find, Tasks, Work, Activity, Messages, Quick reply, People, Agenda, Money,
Fleet (TVDE drivers, cars, plan, money, km, ask, driver portal, Uber trips), Device (desktop jobs, bots, memory, skills,
sync), Health (status and legal pages), the agent team chart (move, assign, task, stop, pause), NSVX action contracts,
approvals, and parity progress.

Enable it with `openclaw plugins enable nsvx`. Set the NSVX address in the plugin config (`baseUrl`). Two sign-ins
live in the Gateway's environment and never reach the browser:

| Variable             | Used by                         | Access                                      |
| -------------------- | ------------------------------- | ------------------------------------------- |
| `NSVX_OWNER_SESSION` | Owner tabs and owner chat tools | Fixed owner screens and fixed owner changes |
| `NSVX_AGENTOS_TOKEN` | Actions tab and chat tools      | AgentOS actions, with NSVX policy and audit |

`NSVX_OWNER_SESSION` is the owner's own `clone_session` cookie value. It reads fixed owner screens with `GET` (and a
few search reads as `POST` so query text stays out of URLs). The only changes it makes are the fixed routes in
`OWNER_WRITES` (`src/client.ts`):

- Messages: reply, approve or discard a clone draft, take over, auto replies, Quick Reply drafts.
- People: person mode, memory, interests, places, contacts, account links, mentions, merges, and private groups.
- Agenda: Google Calendar creates, changes, and cancels, only through NSVX's own preview then
  `/api/workspace/actions`, with the preview's terms hash and one client key per intent, so NSVX refuses changed terms
  and never repeats an invite.
- Fleet: TVDE alerts seen, tasks, shift, service, workflow step and incident states, automation rules, platform syncs,
  mileage decisions, driver portal links, request answers and news, and Uber receipt collection. Driver links are
  shown once for the owner to send; NSVX never sends them. Fleet money is read only.
- Device: desktop bot saves, job stops, memory fix and forget, and the offline sync changes (save, create, discard, and
  send a reviewed draft).

None of them sends a message, and Finance / Money is read only. Health and legal pages are public NSVX pages and need
no sign-in. For each write, the Gateway reads the session's CSRF token from NSVX's `/api/auth/state`, as the NSVX web
app does, so NSVX applies its own checks, idempotency, and audit.

Chat tools that use the owner session (`nsvx_messages`, `nsvx_people`, `nsvx_search`, `nsvx_activity`, `nsvx_agenda`,
`nsvx_device`, `nsvx_fleet`, optional `nsvx_finance`) run on the owner's own turns only. `nsvx_messages`,
`nsvx_people`, and `nsvx_device` never send; `nsvx_agenda` never runs a change Google would announce to guests (it
returns the terms for the owner to confirm in Control); `nsvx_fleet` never pays, approves payouts, makes driver links,
or writes to drivers. Team works with neither sign-in, because it reads this Gateway's own agents.

NSVX stays the only owner of its data: every read and write goes through its own API (AgentOS or the owner routes
above), which applies its own policy, approvals, idempotency, and audit. See [docs/nsvx-parity/README.md](../../docs/nsvx-parity/README.md) for
status and blockers.
