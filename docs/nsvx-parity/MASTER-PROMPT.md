# MASTER IMPLEMENTATION PROMPT — NSVX → OpenClaw Control — Complete Feature Parity
(Miguel, 4 Nov 2026 19:58 New York time. PRIORITY. Verbatim from chat.)

<goal>
Integrate 100% of NSVX functionality into OpenClaw Control

You are OpenClaw, the autonomous central intelligence, architect, engineering lead, and implementation coordinator of our infrastructure.

Your mission is absolute functional parity between NSVX and OpenClaw Control.

Everything I can see, configure, manage, create, edit, execute, automate, monitor, search, or control at https://nsvx.com must also be available directly inside OpenClaw Control.

This includes all visible and hidden functionality, administrative features, settings, integrations, workflows, background jobs, operational tools, and supported actions.

Every NSVX capability must be accessible through:
1. OpenClaw Control UI — complete graphical functionality.
2. OpenClaw Chat — natural-language execution of the same authorized actions.
3. OpenClaw Autonomous Agents — proactive execution and supervision of supported workflows, within their permissions.

Do not merely reproduce screenshots. Implement the actual working functionality end to end.
Do not stop after creating an implementation plan. Discover, implement, test, merge, verify, and continue autonomously until complete parity has been achieved.
</goal>

<context>
Authoritative repositories

NSVX source
- Repository: My-Clone-AI/clone
- Branch: develop
- Website: https://nsvx.com
- Development: https://nsvx.com/dev
- Frontend: web/src/
- Screens: web/src/screens/
- Components: web/src/components/
- Routing: web/src/App.tsx
- Navigation: web/src/logic/navigation.ts
- Backend: backend/clone/
- Documentation: docs/
- Operating rules: AGENTS.md

OpenClaw target
- Repository: My-Clone-AI/openclaw
- Branch: develop
- Control UI: ui/src/
- Routes: ui/src/app-route-paths.ts
- Navigation: ui/src/app-navigation.ts
- Pages: ui/src/pages/
- Gateway: src/gateway/
- Extensions: extensions/
- UI rules: ui/AGENTS.md

Master server
- NSVX working repository: /home/ubuntu/clone/clone
- OpenClaw working repository: /home/ubuntu/openclaw/openclaw
- OpenClaw operational documentation: /home/ubuntu/apps/openclaw/
- Existing OpenClaw gateway is configured for loopback access; discover and verify its currently effective address and authentication without exposing secrets.

Existing integration — reuse it
NSVX already includes an OpenClaw Architecture Manager:
- web/src/components/OpenClawManager.tsx
- web/src/screens/Ai.tsx
- backend/clone/openclaw_admin/
- backend/clone/openclaw_admin/gateway.py
- backend/clone/openclaw_admin/api.py
- backend/clone/openclaw_admin/service.py
This currently provides NSVX-side management of OpenClaw agents, tasks, devices, models, configuration, and activity.
Do not build a redundant second agent engine.
Extend the existing architecture into a complete, secure, bidirectional integration:
NSVX ↔ OpenClaw Gateway ↔ OpenClaw Control
NSVX remains authoritative for its existing business data and transactions. OpenClaw remains the central AI brain, orchestration layer, and unified control interface.
Reuse existing working code, APIs, authentication, permissions, data, and services wherever possible.
</context>

<constraints>
Fundamental requirements
- 100% feature parity: no feature intentionally omitted.
- 100% action parity: every supported NSVX action must work from OpenClaw Control.
- 100% data consistency: both applications operate on the same authoritative records.
- No duplicate business engines, databases, inference gateways, or disconnected state.
- No cosmetic-only implementations, mock data presented as live data, dead buttons, or fabricated success messages.
- No iframe-only solution, external-link collection, or superficial dashboard presented as full integration.
- A properly integrated, reusable NSVX frontend module or React island is permitted when it provides genuine native navigation, authentication, functionality, and visual consistency with OpenClaw.
- Preserve existing OpenClaw functionality.
- Preserve existing NSVX functionality.
- Never break existing operational workflows to achieve parity.
- Never weaken authentication, permissions, auditability, privacy, or safeguards.

Infrastructure and development rules
- OpenClaw is the central brain. Do not use Hermes as the runtime orchestrator or create new Hermes dependencies.
- Identify and migrate relevant legacy Hermes functionality into OpenClaw without interrupting active services.
- Follow the latest effective AGENTS.md, repository policies, and production safeguards.
- Use the central NSVX inference infrastructure instead of adding independent AI providers or inference engines to individual business apps.
- Preserve subscription-based inference routing, account limits, fallback policies, and existing model configuration.
- Do not introduce unauthorized paid API usage.
- Use dedicated runners for development workloads. Do not install GitHub runners on personal Macs.
- Work on isolated branches/worktrees.
- Merge verified changes into develop.
- NSVX's existing automatic /dev publication may run as part of normal development merges.
- Never deploy to production without an explicit production deployment instruction.
- Because development may use real connected data, never generate uncontrolled real messages, payments, financial changes, or other external effects while testing.
- Never expose access tokens, passwords, private keys, sensitive documents, or personally identifying information in logs.
- Preserve channel-specific privacy rules, including Telegram restrictions.

User experience
Design everything to be minimal, fast, visual, mobile-friendly, and intuitive.
Use short labels, clear icons, recognizable logos, autocomplete, smart defaults, unified search, contextual actions, and natural-language commands.
Support Portuguese (Portugal), English, and Spanish appropriately.
Every screen must have real loading, empty, error, offline, success, and recovery states.
No unnecessary menus, duplicate controls, excessive explanatory text, horizontal mobile overflow, invisible text, or unusable controls.
Use Chrome for browser-based verification.
</constraints>

<tools>
Use all authorized tools and connected infrastructure needed to complete the job:
- GitHub repositories, code, branches, commits, pull requests, and checks.
- Remote Desktop Commander for Master and authorized servers.
- OpenClaw Gateway, Control UI, CLI, agents, nodes, skills, plugins, and RPCs.
- Existing NSVX authenticated APIs and backend services.
- Existing browser automation and Chrome sessions where authorized.
- Database schema inspection, migrations, and read-only analysis.
- Existing task queues, Grow development infrastructure, and runner fleet.
- Existing source documentation, OpenAPI specifications, integration contracts, runtime logs, and audit receipts.
Do not guess endpoint names, credentials, feature status, or infrastructure topology when they can be discovered from the actual environment.
</tools>

<workflow>
PHASE 1 — Exhaustively extract NSVX functionality
Perform an exhaustive audit of the CURRENT NSVX application. Do not treat the navigation menu as the complete feature list.
Inspect:
1. Every route, screen, tab, modal, drawer, form, control, menu, button, shortcut, wizard, and contextual action.
2. Every frontend component, custom hook, API client method, and user-triggered mutation.
3. Every backend route, tool, job, service, worker, scheduler, and event handler.
4. Every integration, supported third-party operation, and authentication workflow.
5. Every existing permission, approval, and business rule.
6. Every backend-only feature that may not have a graphical screen.
7. Every available owner/admin setting and monitoring function.
8. Every enabled feature flag and conditional state.
9. All documentation, relevant merged PRs, current development changes, and version-specific behavior.
10. The authenticated live NSVX UI in desktop and mobile layouts, using existing authorized sessions.
Distinguish carefully between: Available and verified in production; Available and verified in development; Implemented but broken; Partially implemented; Planned or documented only; Unmerged work; Disabled or unavailable integrations.
Do not assume that a file, screen, comment, or PR proves a working feature.

Required feature families (minimum starting scope, not exhaustive):
01 Today, Search and Command Center: Today dashboard, pending items, priorities, alerts, unified search, contextual search, command bar, activity, history, evidence, progress, recommendations, quick actions, and execution receipts.
02 Messages and Communication: WhatsApp, WhatsApp Business, Instagram, Telegram, Gmail, Google Chat, SMS, and every other supported channel. Reading, composing, replying, forwarding where supported, attachments, voice messages, images, PDFs, account linking, QR login, groups, thread history, synchronization, unread state, conversation controls, sending status, error recovery, channel-specific policies.
03 People and Contacts: contacts, identities, contact details, social groups, conversation history, interests, relationships, person preferences, contextual search, contact resolution, recall, profile updates, associated records.
04 Calls and Voice: Telnyx, supported voice engines, inbound and outbound calls, call history, caller identification, voice settings, language detection, call flow, transcripts, recording controls, consent, phone lookup, contact context, call-triggered tasks.
05 Tasks, Missions and Automation: tasks, missions, AUTO, plans, subtasks, deadlines, priorities, dependencies, status, grouping, approvals, delegated actions, execution history, recurring tasks, corrective actions, recovery, task creation from conversations, autonomous follow-up.
06 Calendar and Google Workspace: calendar, events, invitations, meetings, Google Meet, Tasks, Contacts, Docs, Gmail, Chat, scheduling, synchronization, connected accounts, permissions, associated workflows.
07 AI and Inference: model configuration, inference routes, fallback chains, subscription accounts, account connection, quota/usage, priorities, execution categories, reasoning settings, logs, latency, errors, provider availability, operational controls. Include clone-ai model management, local model availability, training status, training controls, datasets, evaluation, relevant Mac nodes.
08 OpenClaw Agents and Autonomous CEO: agent creation, delegation, instructions, skills, permissions, supervision, model assignment, devices, sessions, scheduling, execution, pause/resume/restart, progress, history, errors, recovery, organizational hierarchy.
09 Grow and Software Development: repositories, feature planning, coding sessions, the sequential 21-job workflow, runners, pull requests, merge state, builds, blockers, job queues, task completion, code reviews, server utilization, development monitoring.
10 Grupo Open and Bitcoin Universe: all companies, applications, administrative capabilities, project statuses, app health, workflows, marketing, infrastructure, metrics, alerts, connected services, operational dashboards.
11 Documents and Google Drive: upload, scanning, classification, document understanding, search, extraction, filing, renaming, organization, duplicate detection, previews, sharing, permissions, audit history, Drive operations, PDFs, document generation, signatures, invoices, warranties.
12 Finance and Accounting: banks, accounts, cards, transactions, balances, statements, reconciliation, invoice processing, expense categorization, accounting, fiscal workflows, Portal das Finanças, e-Fatura, company/ENI separation, fiscal documents, connected financial services.
13 Properties and Real Estate: properties, rental management, mortgage workflows, tenancy contracts, property documents, inspections, real-estate portals, listing publication, lead handling, utility accounts, meter readings, reporting, automation.
14 Alojamento Local: properties, reservations where supported, guest workflows, staff, inspections, supplies, restocking, documents, compliance, property operations, automation.
15 Aviation: airlines, roster and flight information, flight logbook, EASA/FAA record handling where implemented, documents, auto check-in, flight history, exports, synchronization, aviation-specific workflows.
16 TVDE and Transportation: TVDE, Uber, Bolt, drivers, vehicles, journeys, mileage, operational records, business accounts, compliance, documents, expenses, reporting.
17 Legal and Procedures: legal cases, procedures, deadlines, documents, contextual research, correspondence, responses, reviews, case history.
18 Research and Web Operations: research projects, saved searches, source collection, browser-backed operations, research history, verifiable citations, commercial outreach, follow-ups, execution controls.
19 Marketing and Social Administration: marketing dashboard, brands, accounts, campaigns, scheduling, publishing, content generation, image/video pipelines, social media connections, performance reporting, background marketing workflows.
20 Business and Personal Operations: business accounts, company expenses, grants, invoices, supplier workflows, subscriptions, online orders, Amazon-related workflows, returns, utilities, insurance, personal/business administrative tasks.
21 Permissions and Integrations: account connections, authentication, access grants, permissions, credential management, integration health, connection recovery, device management, API configuration, service-specific settings.
22 All Remaining Features: discover everything not included above, including nested tabs, optional settings, special workflows, hidden administration, application-specific tools, future extensions. No category limit and no artificial quota.

Persist the complete inventory: create a durable, machine-readable feature registry in the OpenClaw repository under docs/nsvx-parity/. Every feature/action must have: stable feature ID; name and functional category; source repository and commit; exact source file(s); NSVX route/screen; API endpoint or execution interface; required permissions; read/write/external-effect classification; required integration or credentials; runtime availability/status; matching OpenClaw location; matching OpenClaw chat tool/action; implementation status; focused verification requirements; verification evidence; known blockers. Generate the source inventory automatically wherever possible. Cross-check frontend routes, UI controls, backend APIs, background jobs, documentation, and live behavior to detect omissions.

PHASE 2 — Audit existing OpenClaw Control: analyze the OpenClaw repository, Control UI, Gateway, plugins, routes, agents, permissions, deployment. Identify which NSVX capabilities already exist. For each feature decide: reuse existing OpenClaw functionality; integrate existing NSVX backend functionality; reuse existing NSVX frontend components; extend OpenClaw's native Control UI; implement an authenticated NSVX gateway adapter; build the missing capability where necessary. Avoid unnecessary rewrites and duplicated implementations. Investigate the existing OpenClaw plugin UI and portal architecture first. Choose the approach with actual parity, lowest maintenance burden and strongest reliability.

PHASE 3 — Build the unified NSVX workspace inside OpenClaw Control: accessible from main navigation; unified search across authorized NSVX resources; navigation grouped by activity; persistent contextual actions; working deep links for every feature and record; full desktop/mobile responsiveness; shared owner identity and correct role/permission enforcement; same authoritative data as NSVX; real-time updates or bounded refresh; consistent errors, loading, recovery, completion indicators; browser history, back navigation, file previews, downloads, uploads, attachments. Preserve OpenClaw's design system. Use small native components for dashboards and controls; reuse complex existing NSVX feature implementations when materially safer and faster. No second independent NSVX database or cloned business logic.

PHASE 4 — Expose every action to OpenClaw Chat through authorized tools/actions/skills. Examples: "Show my unread WhatsApp messages." "Find the last conversation with this person." "Create a task from this message." "Show my calendar." "Find this invoice in Google Drive." "Show the status of all our applications." "Show the failed coding sessions." "Fix the blocked development jobs." "Show the latest training loss for clone-ai." "Show pending invoices for Fortune Comet." "Find flights missing from my logbook." "Show the open property maintenance tasks." (examples, not the limit). Typed, discoverable tool contracts reusing NSVX's authoritative operations; same permissions, privacy, validation, business rules. For mutations use idempotency, version checks, audit logs, readback verification. Never repeat a send, purchase, transfer or other external effect solely because its outcome is uncertain. Where an action is frontend-only, implement a supported backend/tool adapter rather than browser clicking when a stable API is feasible.

PHASE 5 — Proactive autonomous management: detect failures and degraded services; diagnose blockers with logs, traces and source; propose and execute permitted internal repairs; delegate development work to agents and runners; resume interrupted workflows from durable checkpoints; replan unsuccessful tasks without repeating completed work; detect new NSVX features; detect missing parity automatically; queue new gaps; track completion and verified outcomes; alert the owner only for meaningful exceptions. Bounded retries, resource budgets, circuit breakers, escalation after repeated failure. Autonomy never bypasses authorization, safety controls, provider restrictions, or uncertain external outcomes.

PHASE 6 — Full NSVX feature migration, per feature: 1 identify behavior, dependencies, success conditions; 2 identify reusable components; 3 implement OpenClaw UI; 4 implement/reuse chat action; 5 integrate with authoritative data/execution path; 6 preserve permissions, validation, audit semantics; 7 focused tests and recovery handling; 8 verify the actual action works; 9 record evidence in registry; 10 merge into develop; 11 continue. Don't stop after the obvious features.
Development sessions: use the 21-job session approach as maximum capacity, not mandatory distribution. Select highest-value ready work dynamically; one independently testable job at a time; commit, push and merge after focused verification; confirm the actual merge before incrementing completed counts; continue in the same session; close after jobs finish or capacity is reached. No 21 implementations in one giant prompt. If blocked: record true reason, preserve work, continue other work, OpenClaw diagnoses, improves the plan and requeues; no duplicate jobs or infinite repair loops. Never count an unmerged, unverified or externally blocked job as completed.

PHASE 7 — Continuous parity synchronization: lightweight automated parity monitor that detects changes to NSVX routes, components, API contracts, features and permissions; compares against the registry; identifies additions, removals, changes, regressions; creates/updates dev tasks for missing parity; prioritizes regressions; prevents duplicate jobs; reports actual verified coverage; avoids unnecessary scanning/polling/resource use.

PHASE 8 — Reliability, security, performance: never expose gateway credentials to client JS; never bypass NSVX session authorization via an all-powerful browser proxy; preserve CSRF, scope restrictions, resource-level permissions; prevent privilege escalation through NL tool execution; enforce channel privacy at the final send boundary; one authoritative source for mutable records; idempotency keys and durable receipts for external effects; secrets outside Git; bounded pagination, efficient subscriptions, targeted updates; no duplicated background polling; no memory leaks, unbounded queues, browser session accumulation or CPU saturation; preserve workflows during rollout; recovery and rollback paths. Must stay responsive with large histories, many apps, hundreds of active sessions.
</workflow>

<verification>
For every feature verify: Discovery (registered and traced to source); UI (usable inside OpenClaw Control); Actions (real read/write works as authorized); Chat (NL tool gives equivalent function); Data (same authoritative NSVX data); Permissions (equivalent authorization and privacy); Feedback (real progress, success, failure, recovery states); Desktop (Chrome validation); Mobile (responsive Chrome viewport validation); Evidence (persistent result with source, test, execution receipts).
Use test data or safe read-only verification for financial services, messaging providers, portals and other consequential features. Do not send test messages to real recipients or trigger real financial effects.
Minimum test policy: never run the entire repo test suite in the deployment workflow; only the smallest focused tests and type/build checks; validate affected components, API contracts, authorization, e2e paths; verify the app builds, starts, connects and serves updated assets; real browser evidence for changed UI; on failure diagnose, repair, rerun only affected checks.
Coverage reporting: real-time parity dashboard with total discovered, working, verified, in-progress, broken/regressed, blocked, source changes awaiting integration, last verified revisions. Percentages from an explicit stable registry. Never inflate completion.
</verification>

<definition_of_done>
1 all current NSVX features/actions inventoried; 2 every owner-facing capability accessible from OpenClaw Control; 3 every actionable capability available to OpenClaw Chat via authorized tools; 4 OpenClaw agents can orchestrate them within permissions/autonomy policy; 5 same authoritative data and execution systems; 6 all features verified or a truthful documented external limitation; 7 desktop and mobile functional and consistent; 8 existing NSVX and OpenClaw capabilities still operational; 9 focused tests and dev runtime validation pass; 10 continuous parity monitor working; 11 registry has source evidence, implementation refs, verification receipts; 12 changes committed and merged into develop; 13 no unauthorized production deployment; 14 no feature falsely marked complete. Target is 100% verified parity. Document externally impossible capabilities separately as unresolved.
</definition_of_done>

<stop_conditions>
Don't stop for routine architecture choices, implementation details, refactoring, dependencies, recoverable errors, or a single blocked job. Decide autonomously; use alternatives; continue independent work.
Genuine stop conditions: required credentials/access unavailable through authorized means; provider requires user-controlled auth; action exceeds permissions; external effect with uncertain outcome where retry could duplicate; operation would compromise production, sensitive data or service safety; remaining work can't be executed with available resources. Then preserve work, record the exact issue, continue eligible work, report accurately. Never bypass safety controls to satisfy a metric.
</stop_conditions>

<final_response>
Report outcomes, not promises. Concise dashboard: Parity (Verified / Discovered / %); Completed; Merged (actual commits and PRs); Verified (focused tests, real UI/API evidence); Remaining (missing, broken, blocked, unverified); Autonomy (parity monitor and repair queue state); Deployment (dev revision and environment; production unchanged unless separately authorized). Keep operational details in project docs; concise owner-facing summary.
START NOW. AUDIT THE FULL NSVX APPLICATION, BUILD THE COMPLETE PARITY REGISTRY, IMPLEMENT THE INTEGRATION IN OPENCLAW CONTROL, AND CONTINUE AUTONOMOUSLY UNTIL THE VERIFIED FEATURE GAP IS ZERO.
</final_response>

---
## ADDENDUM (Miguel, 4 Nov 2026 20:09 New York time)
Model: use Claude Opus 5.5 at medium effort for this whole job. Opus does all of the UI, the design and the proper implementation of every feature ("it's a heavy task and only he can do it").

UI rules (mandatory, apply to every screen):
- UI should be minimal, minimalistic, intuitive and super easy to use. Avoid text; when unavoidable keep it very brief and clear, using minimal common wording like "buy", "sell", "list", "delist", "show", "hide", "mint", "progress", "token", "index", "protocol", "trade", "wallet", "connect", etc. Avoid technical terms.
- Make features easy to find, actions easy to understand, and results easy to verify. Use clearly labeled controls, familiar icons, relevant visuals and accurate status indicators. Remove unnecessary text, clutter, confusing elements and redundant information without sacrificing clarity or usability.
- All affected screens and states must be responsive, consistent, functional and production-ready on desktop and mobile.
- Preserve the established design system where sound. Correct invisible text, low contrast, broken QR rendering, overflow, clipping, confusing states and unusable mobile controls without introducing unrelated redesign.
- Always prioritize visuals over text. Use images, especially official logos, icons, branding and other authoritative visual assets, and diagrams wherever they communicate more clearly than text.
- Use wizards, autocomplete as much as possible, auto-generated content, and AI features to help the user as much as possible. Above all, make the user's life EASY: smooth, FAST, pleasant and SOLID.
