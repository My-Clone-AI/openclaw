# NSVX plugin

Brings NSVX into OpenClaw Control: Today, Find, Tasks, Work, Activity, Messages, Quick reply, People, Agenda, Money,
Group, Aviation (logbook, documents, auto check-in, roster), Fleet (TVDE drivers, cars, plan, money, km, ask, driver
portal, Uber trips), Device (desktop jobs, bots, memory, skills, sync), Health (status and legal pages), Grow (coding
apps, Build Me ideas, the OpenClaw brain, timers), the agent team chart (move, assign, task, stop, pause), NSVX action
contracts, approvals, and parity progress.

## Connect

Enable it with `openclaw plugins enable nsvx`, then set two things on the Gateway. The token never reaches the browser.

| Setting                   | Where         | Value                                                      |
| ------------------------- | ------------- | ---------------------------------------------------------- |
| `baseUrl`                 | Plugin config | NSVX address, such as `https://dev.nsvx.com`               |
| `NSVX_AGENTOS_TOKEN_FILE` | Environment   | Path to a file holding the AgentOS token, with mode `0600` |

Each AgentOS call sends the file's contents as `Authorization: Bearer`, read fresh, so replacing the file rotates the
token without a restart. `NSVX_AGENTOS_TOKEN` holds the token inline for local development and is used only when
`NSVX_AGENTOS_TOKEN_FILE` is unset. Never use a browser cookie as a Gateway credential.

| Tab                    | Sign-in           | Without it                                  |
| ---------------------- | ----------------- | ------------------------------------------- |
| Actions and chat tools | AgentOS token     | Not connected                               |
| Team                   | None              | Works: it reads this Gateway's own agents   |
| Health and legal pages | None              | Works: public NSVX pages, except Job lookup |
| Every other owner tab  | Not available yet | Not connected, or Coming soon with a token  |

### Parked: owner tabs

Owner tabs and owner chat tools move to AgentOS read actions once NSVX ships them. NSVX must first accept bearer tokens
on `/api/agentos/v1` and add actions for Today, Find, Work, Activity, Messages, Quick reply, and Money. Until then they
do not read data with a token: calling NSVX's human `/api` routes with a bearer token is not supported.

`NSVX_OWNER_SESSION` is deprecated and logs a warning at startup. Do not set it on a new Gateway. It stays readable only
so an existing Gateway keeps its owner tabs until this cutover, which removes it.

## Owner changes and limits

The fixed routes in `OWNER_WRITES` (`src/client.ts`) are the only owner changes:

- Messages: reply, approve or discard a clone draft, take over, auto replies, Quick Reply drafts.
- People: person mode, memory, interests, places, contacts, account links, mentions, merges, and private groups.
- Agenda: Google Calendar creates, changes, and cancels, follow-up email, and event reminders, only through NSVX's own
  preview then `/api/workspace/actions`, with the preview's terms hash and one client key per intent, so NSVX refuses
  changed terms and never repeats an invite or an email.
- Group: dev actions, app operations, app mail, server actions.
- Fleet: TVDE alerts seen, tasks, shift, service, workflow step and incident states, automation rules, platform syncs,
  mileage decisions, driver portal links, request answers and news, and Uber receipt collection. Driver links are
  shown once for the owner to send; NSVX never sends them. Fleet money is read only.
- Device: desktop bot saves, job stops, memory fix and forget, and the offline sync changes (save, create, discard, and
  send a reviewed draft).
- Aviation: logbook entries, previous-day flights, document details, settings, and check-ins.
- Grow: the fixed `/api/grow`, Build Me admin, and brain routes.
- Skills: skill state and review.

Finance / Money is read only.

Owner chat tools (`nsvx_messages`, `nsvx_people`, `nsvx_search`, `nsvx_activity`, `nsvx_agenda`, `nsvx_device`,
`nsvx_grow`, `nsvx_aviation`, `nsvx_fleet`, `nsvx_skills`, `nsvx_agents` (suggest), optional `nsvx_finance` and `nsvx_group`) run on the owner's own turns only:

- `nsvx_messages`, `nsvx_people`, and `nsvx_device` never send.
- `nsvx_agenda` never runs a change Google would announce to guests or sends an email; it returns the terms for the
  owner to confirm in Control.
- `nsvx_group` reads and runs dev-only actions.
- `nsvx_aviation` confirms a pending flight as NSVX prepared it, asks NSVX to check yesterday or re-read the Flight
  Log, and schedules or stops a free check-in; corrections, voids, and document edits stay on the page.
- `nsvx_fleet` never pays, approves payouts, makes driver links, or writes to drivers.

Aviation files (Excel, CSV, the printable EASA layout, and document downloads) cross the Gateway socket through
`nsvx.aviation.file` and are saved by the browser; document pages arrive as images NSVX renders, so the browser
never holds an NSVX credential. NSVX has no idempotency on check-in intake, so the Gateway refuses a second schedule for
a booking that still has an active check-in.

NSVX stays the only owner of its data: every read and write goes through its own API (AgentOS or the owner routes
above), which applies its own policy, approvals, idempotency, and audit. See [docs/nsvx-parity/README.md](../../docs/nsvx-parity/README.md) for
status and blockers.
