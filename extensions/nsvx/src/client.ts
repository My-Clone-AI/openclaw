import { LEGAL_LANGS, LEGAL_PAGES } from "./device-data.js";
import type { NsvxAction, NsvxApproval, NsvxRunResult, NsvxTask } from "./types.js";

export const AGENTOS_PATH = "/api/agentos/v1";
const TIMEOUT_MS = 30_000;

/**
 * - `unconfigured`: this Gateway has no token.
 * - `signed-out`: NSVX rejected the token.
 * - `off`: NSVX hides AgentOS while its `agentos.gateway` flag is off.
 * - `uncertain`: a write may have happened; never repeat it with a new key.
 */
export type NsvxErrorKind =
  | "unconfigured"
  | "signed-out"
  | "off"
  | "offline"
  | "denied"
  | "not-found"
  | "invalid"
  | "conflict"
  | "uncertain"
  | "failed";

export class NsvxError extends Error {
  constructor(
    readonly kind: NsvxErrorKind,
    message: string,
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = "NsvxError";
  }
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

async function guardedFetch(url: string, init: RequestInit): Promise<Response> {
  const [{ fetchWithSsrFGuard }, { responseWithRelease }] = await Promise.all([
    import("openclaw/plugin-sdk/ssrf-runtime"),
    import("openclaw/plugin-sdk/fetch-runtime"),
  ]);
  const { hostname } = new URL(url);
  const guarded = await fetchWithSsrFGuard({
    url,
    init,
    capture: false,
    // parseNsvxConfig already limited the origin, so a dev server on loopback stays reachable.
    policy: { hostnameAllowlist: [hostname], allowPrivateNetwork: true },
    maxRedirects: 0,
  });
  return responseWithRelease(guarded.response, guarded.release);
}

/** AgentOS sends problem+json; other NSVX routes send FastAPI `detail`, sometimes as an object. */
type Problem = { code?: string; title?: string; detail?: unknown; correlation_id?: string };

async function problemFrom(response: Response): Promise<Problem> {
  try {
    return (await response.json()) as Problem;
  } catch {
    return {};
  }
}

function errorFor(status: number, problem: Problem, isWrite: boolean, path: string): NsvxError {
  // Some NSVX routes nest the text: `{"detail": {"detail": "...", "existing_id": "..."}}`;
  // group companies send `{"detail": {"code": "...", "message": "..."}}`.
  const nested = problem.detail as { detail?: unknown; message?: unknown } | null | undefined;
  const message =
    (typeof problem.detail === "string"
      ? problem.detail
      : typeof nested?.detail === "string"
        ? nested.detail
        : typeof nested?.message === "string"
          ? nested.message
          : problem.title) ?? `NSVX answered ${status}.`;
  const correlation = problem.correlation_id;
  if (status === 401) {
    return new NsvxError("signed-out", "NSVX rejected the sign-in token.", correlation);
  }
  if (status === 404) {
    // Only the catalog route proves the whole surface is hidden.
    return path.startsWith("/actions?")
      ? new NsvxError("off", "NSVX actions are switched off.", correlation)
      : new NsvxError("not-found", message, correlation);
  }
  if (status === 403) {
    return new NsvxError("denied", message, correlation);
  }
  if (status === 409) {
    return new NsvxError("conflict", message, correlation);
  }
  if (status === 400 || status === 422) {
    return new NsvxError("invalid", message, correlation);
  }
  return isWrite && status >= 500
    ? new NsvxError(
        "uncertain",
        "NSVX did not confirm the result. Check before repeating.",
        correlation,
      )
    : new NsvxError("failed", message, correlation);
}

export type NsvxRunRequest = {
  actionId: string;
  input: Record<string, unknown>;
  /** Stable across retries of one user intent; NSVX replays instead of repeating the effect. */
  idempotencyKey: string;
  approvalId?: string;
};

/**
 * Owner screens NSVX serves only to its signed-in owner. Read-only GETs on fixed paths, so the held session can never
 * change NSVX data (unsafe methods also need the session's CSRF token, which this Gateway never has).
 */
type OwnerViewSpec = { path: string; query?: readonly string[]; image?: true };
/** Largest page image relayed to the browser (a 1000px JPEG page is far below this). */
const IMAGE_LIMIT = 4 * 1024 * 1024;

const OWNER_VIEWS = {
  today: { path: "/api/today" },
  missions: { path: "/api/missions" },
  missionEvents: { path: "/api/missions/{id}/events", query: ["before"] },
  workSummary: { path: "/api/tarefas-ao-vivo/summary" },
  workTasks: { path: "/api/tarefas-ao-vivo/tasks", query: ["state", "q", "cursor"] },
  activity: { path: "/api/auto/activity", query: ["limit", "before"] },
  activityWorkflows: { path: "/api/auto/activity/workflows" },
  activityCount: { path: "/api/auto/activity/export/count", query: ["start", "end", "ids"] },
  conversations: {
    path: "/api/conversations/page",
    query: ["q", "state", "channel", "after", "limit"],
  },
  conversation: { path: "/api/conversations/{id}", query: ["message_limit", "message_before"] },
  coverage: { path: "/api/reply-coverage/summary", query: ["channel"] },
  channels: { path: "/api/social/status" },
  quickReplyDrafts: { path: "/api/quick-reply/drafts", query: ["q", "before"] },
  quickReplyDraft: { path: "/api/quick-reply/drafts/{id}" },
  quickReplyRules: { path: "/api/quick-reply/rules" },
  // Finance (`/financas`): the same reads the NSVX Finanças, Documentos, and Contabilidade screens make.
  financeToday: { path: "/api/finance/today" },
  financeDashboard: { path: "/api/finance/dashboard", query: ["entity", "scope", "year"] },
  financeAccounts: { path: "/api/finance/accounts", query: ["entity", "scope"] },
  financeConnections: { path: "/api/finance/connections" },
  financeCards: { path: "/api/finance/cards" },
  financeObligations: {
    path: "/api/finance/obligations",
    query: ["entity", "scope", "include_done"],
  },
  financeAlerts: { path: "/api/finance/alerts" },
  financeInvoices: {
    path: "/api/finance/invoices",
    query: ["entity", "scope", "role", "year", "unassigned", "q", "before", "limit"],
  },
  bankTransactions: {
    path: "/api/finance/banking/transactions",
    query: ["entity", "scope", "connection", "counterparty", "status", "cursor", "limit"],
  },
  bankCapabilities: { path: "/api/finance/banking/capabilities", query: ["entity"] },
  bankTasks: { path: "/api/finance/banking/tasks", query: ["entity", "scope"] },
  docsOverview: { path: "/api/finance/docs/overview", query: ["entity", "scope", "year"] },
  docsBrowse: {
    path: "/api/finance/docs/browse",
    query: ["entity", "scope", "path", "month", "kind", "state", "source", "q", "offset", "limit"],
  },
  docsSearch: { path: "/api/finance/docs/search", query: ["q", "entity", "scope"] },
  docPreview: { path: "/api/finance/docs/{id}/preview" },
  docPage: { path: "/api/finance/docs/{id}/page/{page}", query: ["w"], image: true },
  docImage: { path: "/api/finance/docs/{id}/content", image: true },
  ledgerBooks: { path: "/api/ledger/books" },
  ledgerOverview: { path: "/api/ledger/overview", query: ["book", "year"] },
  ledgerReport: { path: "/api/ledger/reports/{kind}", query: ["book", "year"] },
  ledgerJournal: {
    path: "/api/ledger/journal",
    query: ["book", "year", "account", "q", "limit", "offset"],
  },
  ledgerReview: {
    path: "/api/ledger/transactions",
    query: ["book", "year", "status", "limit", "offset"],
  },
  ledgerTax: { path: "/api/ledger/tax", query: ["book", "year"] },
  // Agenda (`/agenda`): Google Calendar as NSVX stores it. `live=1` makes NSVX read Google once, as its screen does.
  workspaceStatus: { path: "/api/workspace/status" },
  calendars: { path: "/api/workspace/calendars" },
  calendarEvents: { path: "/api/workspace/events", query: ["start", "end", "tz", "live"] },
  calendarEvent: { path: "/api/workspace/events/{id}" },
  workspaceIntent: { path: "/api/workspace/intents/{id}" },
  ownerReminders: { path: "/api/workspace/owner-reminders", query: ["kind"] },
  // People (`/pessoas`): the reads the NSVX People, person, and group screens make.
  people: { path: "/api/people" },
  person: { path: "/api/people/{id}" },
  personAvatar: { path: "/api/people/{id}/avatar", image: true },
  personContacts: { path: "/api/people/{id}/contact-details" },
  personInterests: { path: "/api/people/{id}/interests" },
  personInterestHistory: {
    path: "/api/people/{id}/interests/history",
    query: ["kind", "topic_id", "before"],
  },
  personPlaces: { path: "/api/people/{id}/history" },
  personPhoto: { path: "/api/people/{id}/photos/{photo}", image: true },
  unlinkedIdentities: { path: "/api/identities/unlinked" },
  socialGroups: { path: "/api/social-groups", query: ["state", "person_id", "limit", "after"] },
  socialGroup: { path: "/api/social-groups/{id}" },
  conversationContext: { path: "/api/conversations/{id}/context" },
  // Group companies (`/empresas-do-grupo`): the reads the NSVX Grupo screens make.
  groupOverview: { path: "/api/group-companies/overview" },
  groupIncidents: { path: "/api/group-companies/overview/incidents" },
  groupDevActions: { path: "/api/group-companies/actions" },
  groupCompany: { path: "/api/group-companies/{cid}/summary" },
  groupManifest: { path: "/api/group-companies/{cid}/manifest" },
  groupResources: {
    path: "/api/group-companies/{cid}/resources/{kind}",
    query: ["q", "status", "cursor"],
  },
  groupResource: { path: "/api/group-companies/{cid}/resources/{kind}/{rid}" },
  groupAudit: { path: "/api/group-companies/{cid}/audit", query: ["cursor"] },
  groupRun: { path: "/api/group-companies/{cid}/runs/{runId}" },
  groupErrors: { path: "/api/group-companies/errors", query: ["hours"] },
  groupMetrics: { path: "/api/group-companies/metrics", query: ["from", "to"] },
  groupServers: { path: "/api/group-companies/servers" },
  groupServerServices: { path: "/api/group-companies/servers/{sid}/services" },
  groupServerLogs: { path: "/api/group-companies/servers/{sid}/logs", query: ["unit", "n"] },
  groupMail: { path: "/api/group-companies/mail/overview" },
  groupMailThreads: {
    path: "/api/group-companies/mail/threads",
    query: ["q", "unread", "hasAttachment", "from", "to", "cursor"],
  },
  groupMailboxThreads: {
    path: "/api/group-companies/{cid}/mail/threads",
    query: ["box", "mailbox", "q", "unread", "hasAttachment", "from", "to", "cursor"],
  },
  groupMailboxes: { path: "/api/group-companies/{cid}/mail/mailboxes", query: ["box"] },
  groupMailThread: { path: "/api/group-companies/{cid}/mail/threads/{tid}", query: ["box"] },
  // Skills (`/apps` Competências): the owner's list, one skill with its runs, and failed-verification alerts.
  skills: { path: "/api/skills", query: ["review"] },
  skill: { path: "/api/skills/{id}" },
  skillAlerts: { path: "/api/skills/alerts" },
  // Desktop (`/api/desktop/*`): the routes the clone desktop app uses, with the owner session.
  desktopBots: { path: "/api/desktop/bots" },
  desktopTasks: { path: "/api/desktop/tasks", query: ["state", "limit"] },
  memoryProfile: { path: "/api/desktop/memory/{bot}/profile", query: ["limit"] },
  memoryJournal: { path: "/api/desktop/memory/{bot}/journal", query: ["limit"] },
  memoryFacts: { path: "/api/desktop/memory/{bot}/facts", query: ["person_id", "limit"] },
  memoryRecall: { path: "/api/desktop/memory/{bot}/recall", query: ["q", "person_id", "limit"] },
  memoryRevocations: { path: "/api/desktop/memory/{bot}/revocations" },
  desktopSkills: { path: "/api/desktop/skills" },
  skillVersions: { path: "/api/desktop/skills/{slug}/versions" },
  desktopSkill: { path: "/api/desktop/skills/{slug}/versions/{version}" },
  // Offline sync: NSVX's bounded authoritative windows (device.ts trims them before the browser).
  syncChanges: { path: "/api/sync/changes" },
  runtimeExecution: { path: "/api/runtime/execution", query: ["job_id"] },
  // Aviation (`/aviacao`): logbook, previous-day flights, Drive documents, auto check-in, and the airline's
  // roster, mail, and portal (`/api/work`), as the NSVX Aviação screens read them.
  aviationOverview: { path: "/api/aviation/overview" },
  aviationInsights: { path: "/api/aviation/insights" },
  aviationEntries: {
    path: "/api/aviation/logbook/entries",
    query: ["q", "kind", "start", "end", "function", "aircraft", "condition", "limit", "offset"],
  },
  aviationEntry: { path: "/api/aviation/logbook/entries/{id}" },
  aviationSync: { path: "/api/aviation/sync/status" },
  aviationCandidates: { path: "/api/aviation/sync/candidates" },
  aviationRuns: { path: "/api/aviation/sync/runs", query: ["limit"] },
  aviationFlightLog: { path: "/api/aviation/flightlog" },
  aviationSettings: { path: "/api/aviation/settings" },
  aviationCompliance: { path: "/api/aviation/compliance" },
  aviationCertifications: { path: "/api/aviation/logbook/certifications" },
  aviationImport: { path: "/api/aviation/logbook/import/preview" },
  aviationDocs: { path: "/api/aviation/docs" },
  aviationFolder: { path: "/api/aviation/docs/browse", query: ["path"] },
  aviationDoc: { path: "/api/aviation/docs/{id}" },
  aviationDocInfo: { path: "/api/aviation/docs/{id}/info" },
  aviationDocText: { path: "/api/aviation/docs/{id}/text" },
  aviationDocPage: { path: "/api/aviation/docs/{id}/page/{page}", query: ["w"], image: true },
  aviationDocImage: { path: "/api/aviation/docs/{id}/content", image: true },
  aviationCheckins: { path: "/api/aviation/checkins" },
  aviationAirlines: { path: "/api/aviation/checkin/airlines", query: ["q"] },
  workConnections: { path: "/api/work/connections" },
  workItems: { path: "/api/work/items", query: ["kind", "start", "end", "limit"] },
  workItem: { path: "/api/work/items/{id}" },
  // Fleet (`/tvde`, `/transportes`): the reads the NSVX TVDE, Ops, Money, Intel, Mileage, and Transports screens make.
  fleetDashboard: { path: "/api/tvde/dashboard" },
  fleetDrivers: { path: "/api/tvde/drivers", query: ["q", "status", "compliance"] },
  fleetDriver: { path: "/api/tvde/drivers/{id}" },
  fleetVehicles: { path: "/api/tvde/vehicles", query: ["q", "status", "compliance"] },
  fleetVehicle: { path: "/api/tvde/vehicles/{id}" },
  fleetAlerts: { path: "/api/tvde/alerts", query: ["include_resolved"] },
  fleetTasks: { path: "/api/tvde/tasks", query: ["status"] },
  fleetMatrix: { path: "/api/tvde/matrix", query: ["subject", "show"] },
  fleetIntegrations: { path: "/api/tvde/integrations" },
  fleetPlatform: { path: "/api/tvde/platforms/{code}", query: ["limit"] },
  fleetSearch: { path: "/api/tvde/search", query: ["q"] },
  fleetEvents: { path: "/api/tvde/events", query: ["limit", "before"] },
  fleetCards: { path: "/api/tvde/cards", query: ["kind", "status", "q"] },
  fleetWorkflows: { path: "/api/tvde/workflows", query: ["status"] },
  fleetIncidents: { path: "/api/tvde/incidents", query: ["status"] },
  fleetShifts: { path: "/api/tvde/shifts", query: ["start", "end", "driver_id", "vehicle_id"] },
  fleetCalendar: { path: "/api/tvde/calendar", query: ["start", "end"] },
  fleetMaintenance: { path: "/api/tvde/maintenance", query: ["status", "vehicle_id"] },
  fleetHandovers: { path: "/api/tvde/handovers", query: ["vehicle_id", "driver_id"] },
  fleetRequests: { path: "/api/tvde/requests", query: ["status"] },
  fleetAnnouncements: { path: "/api/tvde/announcements" },
  fleetAccess: { path: "/api/tvde/access" },
  fleetLocations: { path: "/api/tvde/locations" },
  fleetFinance: { path: "/api/tvde/finance/summary", query: ["start", "end"] },
  fleetInvoices: {
    path: "/api/tvde/invoices",
    query: ["direction", "status", "q", "start", "end", "driver_id", "vehicle_id"],
  },
  fleetEarnings: { path: "/api/tvde/earnings", query: ["start", "end", "driver_id"] },
  fleetSettlements: { path: "/api/tvde/settlements", query: ["status", "driver_id"] },
  fleetImports: { path: "/api/tvde/imports" },
  fleetAutomation: { path: "/api/tvde/automation" },
  fleetRulePreview: { path: "/api/tvde/automation/{code}/preview" },
  fleetReports: { path: "/api/tvde/reports" },
  fleetReport: { path: "/api/tvde/reports/{name}", query: ["start", "end"] },
  fleetAnalytics: { path: "/api/tvde/analytics" },
  fleetForecasts: { path: "/api/tvde/mileage/forecasts" },
  fleetMileage: { path: "/api/tvde/vehicles/{id}/mileage" },
  uberPersonal: { path: "/api/transports/uber" },
  uberBusiness: { path: "/api/business/uber" },
} as const satisfies Record<string, OwnerViewSpec>;

type OwnerView = keyof typeof OWNER_VIEWS;

export const OWNER_VIEW_NAMES = Object.keys(OWNER_VIEWS) as OwnerView[];

/**
 * Fixed NSVX owner routes. `{name}` path parts and `query` names come from the caller's validated values;
 * `idempotency` names the header NSVX reads the caller's key from.
 */
type OwnerWriteSpec = {
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  query?: readonly string[];
  idempotency?: string;
};

const OWNER_WRITES = {
  reply: { method: "POST", path: "/api/conversations/{id}/reply" },
  takeover: { method: "POST", path: "/api/conversations/{id}/takeover" },
  autoReply: { method: "POST", path: "/api/conversations/{id}/pause" },
  approve: { method: "POST", path: "/api/outbox/{id}/approve" },
  reject: { method: "POST", path: "/api/outbox/{id}/reject" },
  quickReplyCreate: { method: "POST", path: "/api/quick-reply/drafts" },
  quickReplyGenerate: { method: "POST", path: "/api/quick-reply/drafts/{id}/generate" },
  quickReplyDelete: { method: "DELETE", path: "/api/quick-reply/drafts/{id}" },
  // Agenda. Event changes go through NSVX's preview-then-submit path (agenda.ts limits the operations).
  calendarSelect: { method: "POST", path: "/api/workspace/calendars/{id}/select" },
  calendarAction: { method: "POST", path: "/api/workspace/actions" },
  meetingRefresh: { method: "POST", path: "/api/workspace/events/{id}/refresh-meeting" },
  meetingDocument: { method: "POST", path: "/api/workspace/meeting-documents" },
  reminderSet: { method: "POST", path: "/api/workspace/owner-reminders" },
  reminderDismiss: { method: "POST", path: "/api/workspace/owner-reminders/dismiss" },
  // People and groups: the changes the NSVX People screens make, nothing that sends a message.
  personCreate: { method: "POST", path: "/api/people" },
  personUpdate: { method: "PATCH", path: "/api/people/{id}" },
  personFollowUp: { method: "POST", path: "/api/people/{id}/follow-up-draft" },
  personLink: { method: "POST", path: "/api/people/{id}/link" },
  personResume: { method: "DELETE", path: "/api/people/{id}/automation-stop", query: ["confirm"] },
  personAlias: { method: "POST", path: "/api/people/{id}/aliases" },
  personMerge: { method: "POST", path: "/api/people/{id}/merge" },
  personContacts: { method: "PUT", path: "/api/people/{id}/contact-details" },
  fact: { method: "POST", path: "/api/facts/{id}" },
  interests: { method: "POST", path: "/api/people/{id}/interests/control" },
  placesCategory: { method: "POST", path: "/api/people/{id}/categories" },
  placesPropose: {
    method: "POST",
    path: "/api/people/{id}/visits",
    idempotency: "Idempotency-Key",
  },
  placesHide: { method: "POST", path: "/api/people/{id}/visits/{visit}/hide" },
  placesErase: { method: "POST", path: "/api/people/{id}/profile/erase" },
  mentionConfirm: { method: "POST", path: "/api/mentions/{id}/confirm" },
  groupCreate: { method: "POST", path: "/api/social-groups" },
  groupUpdate: { method: "PATCH", path: "/api/social-groups/{id}", query: ["revision"] },
  groupDelete: { method: "DELETE", path: "/api/social-groups/{id}", query: ["revision"] },
  groupMember: {
    method: "PUT",
    path: "/api/social-groups/{id}/members/{person}",
    query: ["revision"],
  },
  groupMemberClear: {
    method: "DELETE",
    path: "/api/social-groups/{id}/members/{person}",
    query: ["revision"],
  },
  groupMerge: { method: "POST", path: "/api/social-groups/{id}/merge", query: ["revision"] },
  groupSplit: { method: "POST", path: "/api/social-groups/{id}/split", query: ["revision"] },
  groupUndo: { method: "POST", path: "/api/social-groups/{id}/undo", query: ["revision"] },
  groupSuggest: {
    method: "POST",
    path: "/api/social-groups/recompute",
    query: ["group_id", "person_id"],
    idempotency: "Idempotency-Key",
  },
  // Group companies: NSVX confirms, audits, and limits each one (dev only for dev actions).
  groupDevAction: {
    method: "POST",
    path: "/api/group-companies/actions/{cid}/{action}",
    idempotency: "Idempotency-Key",
  },
  groupPreview: { method: "POST", path: "/api/group-companies/{cid}/operations/{op}/preview" },
  groupOperation: { method: "POST", path: "/api/group-companies/{cid}/operations/{op}" },
  groupMailAction: {
    method: "POST",
    path: "/api/group-companies/{cid}/mail/actions",
    query: ["box"],
  },
  groupMailDraft: {
    method: "POST",
    path: "/api/group-companies/{cid}/mail/drafts",
    query: ["box"],
  },
  groupMailSend: {
    method: "POST",
    path: "/api/group-companies/{cid}/mail/drafts/{did}/send",
    query: ["box"],
  },
  groupServerAction: { method: "POST", path: "/api/group-companies/servers/{sid}/actions/{verb}" },
  skillState: { method: "POST", path: "/api/skills/{id}/state" },
  skillReview: { method: "POST", path: "/api/skills/{id}/review" },
  desktopBotSave: { method: "PUT", path: "/api/desktop/bots/{id}" },
  desktopTaskStop: { method: "POST", path: "/api/desktop/tasks/{id}/stop" },
  desktopTasksStopAll: { method: "POST", path: "/api/desktop/tasks/stop-all" },
  memoryCorrect: { method: "POST", path: "/api/desktop/memory/{id}/correct" },
  memoryForget: { method: "POST", path: "/api/desktop/memory/{id}/forget" },
  syncSave: { method: "POST", path: "/api/sync/mutations" },
  syncPromote: {
    method: "POST",
    path: "/api/sync/tasks/{id}/promote",
    idempotency: "Idempotency-Key",
  },
  syncDiscard: { method: "DELETE", path: "/api/sync/tasks/{id}" },
  syncConfirm: {
    method: "POST",
    path: "/api/sync/drafts/{id}/confirm",
    idempotency: "Idempotency-Key",
  },
  // Aviation: the owner's own records (logbook, documents metadata, settings) plus check-ins, which later act on
  // the airline's site under NSVX's no-payment policy. Reading the roster only queues an NSVX read of HiFly.
  aviationEntryAdd: { method: "POST", path: "/api/aviation/logbook/entries" },
  aviationEntryCorrect: { method: "POST", path: "/api/aviation/logbook/entries/{id}/correct" },
  aviationEntryVoid: { method: "POST", path: "/api/aviation/logbook/entries/{id}/void" },
  aviationCountersign: { method: "POST", path: "/api/aviation/logbook/entries/{id}/countersign" },
  aviationCertify: { method: "POST", path: "/api/aviation/logbook/certify" },
  aviationImport: { method: "POST", path: "/api/aviation/logbook/import/confirm" },
  aviationSyncDay: { method: "POST", path: "/api/aviation/sync/yesterday" },
  aviationDraft: { method: "POST", path: "/api/aviation/sync/candidates/{id}/draft" },
  aviationConfirm: { method: "POST", path: "/api/aviation/sync/candidates/{id}/confirm" },
  aviationDismiss: { method: "POST", path: "/api/aviation/sync/candidates/{id}/dismiss" },
  aviationCompare: { method: "POST", path: "/api/aviation/flightlog/refresh" },
  aviationSettings: { method: "POST", path: "/api/aviation/settings" },
  aviationDocRoots: { method: "POST", path: "/api/aviation/docs/roots" },
  aviationDocIdentity: { method: "POST", path: "/api/aviation/docs/identity" },
  aviationAlertRead: { method: "POST", path: "/api/aviation/docs/alerts/{id}/read" },
  aviationDocUpdate: { method: "PATCH", path: "/api/aviation/docs/{id}" },
  aviationCheckin: { method: "POST", path: "/api/aviation/checkins" },
  aviationCheckinCancel: { method: "POST", path: "/api/aviation/checkins/{id}/cancel" },
  aviationCheckinRetry: { method: "POST", path: "/api/aviation/checkins/{id}/retry" },
  workSync: { method: "POST", path: "/api/work/connections/{id}/sync" },
  // Fleet: the owner's TVDE and Transports taps. None pays, approves money, or messages anyone.
  fleetAlertAck: { method: "POST", path: "/api/tvde/alerts/{id}/ack" },
  fleetAlertsAck: { method: "POST", path: "/api/tvde/alerts/bulk-ack" },
  fleetTaskCreate: { method: "POST", path: "/api/tvde/tasks", idempotency: "Idempotency-Key" },
  fleetTask: { method: "PATCH", path: "/api/tvde/tasks/{id}" },
  fleetRequest: { method: "POST", path: "/api/tvde/requests/{id}" },
  fleetWorkflowStep: { method: "POST", path: "/api/tvde/workflows/{id}/steps/{key}" },
  fleetIncident: { method: "PATCH", path: "/api/tvde/incidents/{id}" },
  fleetMaintenance: { method: "PATCH", path: "/api/tvde/maintenance/{id}" },
  fleetShift: { method: "PATCH", path: "/api/tvde/shifts/{id}" },
  fleetRule: { method: "PATCH", path: "/api/tvde/automation/{id}" },
  fleetRulesRun: { method: "POST", path: "/api/tvde/automation/run" },
  fleetPlatformSync: { method: "POST", path: "/api/tvde/integrations/{id}/sync" },
  fleetMileageDecision: {
    method: "POST",
    path: "/api/tvde/vehicles/{id}/mileage/{reading}/decision",
  },
  fleetMileageRetry: { method: "POST", path: "/api/tvde/vehicles/{id}/mileage/{reading}/retry" },
  fleetAccessCreate: { method: "POST", path: "/api/tvde/access" },
  fleetAccessRevoke: { method: "POST", path: "/api/tvde/access/{id}/revoke" },
  fleetAnnounce: { method: "POST", path: "/api/tvde/announcements" },
  fleetAnnounceArchive: { method: "POST", path: "/api/tvde/announcements/{id}/archive" },
  uberPersonalCheck: { method: "POST", path: "/api/transports/uber/connect" },
  uberPersonalCollect: { method: "POST", path: "/api/transports/uber/quarter" },
  uberBusinessCheck: { method: "POST", path: "/api/business/uber/connect" },
  uberBusinessCollect: { method: "POST", path: "/api/business/uber/quarter" },
} as const satisfies Record<string, OwnerWriteSpec>;

export type OwnerWrite = keyof typeof OWNER_WRITES;

/**
 * NSVX reads that take their input in a POST body (so search text never reaches URLs or access logs). POST needs the
 * session's CSRF token, which the Gateway fetches per call for these fixed paths only: no other POST is reachable, so
 * the owner session still cannot change NSVX data.
 */
const OWNER_READ_POSTS = {
  find: "/api/find",
  activitySummary: "/api/auto/activity/summary",
  // Proposes a team from a goal; NSVX applies nothing (openclaw_admin Admin.suggest).
  agentSuggest: "/api/ai/openclaw/suggest",
  // Agenda reads: free times, the exact terms of a change before it runs, and clone's written help.
  agendaSummary: "/api/workspace/agenda-summary",
  freeSlots: "/api/workspace/suggestions",
  calendarPreview: "/api/workspace/preview",
  meetingPrep: "/api/workspace/events/{id}/preparation",
  meetingAgenda: "/api/workspace/events/{id}/agenda-draft",
  inviteReply: "/api/workspace/events/{id}/reply-draft",
  // Dates written next to an expiry label in one aviation document; suggestions only.
  aviationExpiry: "/api/aviation/docs/{id}/expiry-suggest",
  // The TVDE assistant answers from fleet records (or says it cannot); NSVX only logs that a question was asked.
  fleetAsk: "/api/tvde/assistant",
} as const;

export type OwnerReadPost = keyof typeof OWNER_READ_POSTS;

/** Owner files Control saves for the owner: logbook exports and one aviation document's bytes. */
const OWNER_FILES = {
  aviationCsv: { path: "/api/aviation/logbook/export.csv" },
  aviationXlsx: { path: "/api/aviation/logbook/export.xlsx" },
  aviationPrint: { path: "/api/aviation/logbook/print", query: ["start", "end"] },
  aviationDocFile: { path: "/api/aviation/docs/{id}/content", query: ["download"] },
} as const satisfies Record<string, OwnerViewSpec>;

export type OwnerFile = keyof typeof OWNER_FILES;
/** Files cross the Gateway socket as base64; a pilot's logbook or licence scan is far below this. */
const FILE_LIMIT = 12 * 1024 * 1024;

/** The CSV export streams; larger ranges than this must be split by the owner. */
const EXPORT_MAX_CHARS = 5_000_000;
/** NSVX caps its calendar feed at 2000 events, well below this. */
const ICS_MAX_CHARS = 5_000_000;

const OWNER_COOKIE = "clone_session";

/**
 * Public NSVX pages: health probes (`/readyz` adds which checks fail when the owner session comes along) and the
 * legal pages. `/readyz` answers 503 with the same body when not ready.
 */
const PUBLIC_READS = {
  live: { path: "/healthz" },
  ready: { path: "/readyz", alsoOk: 503 },
  runtime: { path: "/runtimez" },
} as const;

export type PublicRead = keyof typeof PUBLIC_READS;
/** The rendered legal pages are a few dozen kilobytes. */
const LEGAL_LIMIT = 1024 * 1024;

function ownerViewSpec(view: string): OwnerViewSpec {
  if (!Object.hasOwn(OWNER_VIEWS, view)) {
    throw new NsvxError("invalid", "Unknown NSVX view.");
  }
  return OWNER_VIEWS[view as OwnerView];
}

function ownerViewPath(spec: OwnerViewSpec, params: Record<string, unknown>): string {
  const text = (name: string) => {
    const value = params[name];
    if (value === undefined || value === "") {
      return undefined;
    }
    if (typeof value !== "string" || value.length > 200) {
      throw new NsvxError("invalid", `${name} must be short text.`);
    }
    return value;
  };
  const path = spec.path.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = text(name);
    if (!value) {
      throw new NsvxError("invalid", `${name} is required.`);
    }
    return encodeURIComponent(value);
  });
  const query = new URLSearchParams();
  for (const name of spec.query ?? []) {
    const value = text(name);
    if (value) {
      query.set(name, value);
    }
  }
  return query.size > 0 ? `${path}?${query}` : path;
}

export type NsvxClient = ReturnType<typeof createNsvxClient>;

export function createNsvxClient(options: {
  baseUrl: string;
  token: string | undefined;
  /** The owner's own NSVX session, for owner screens only; never reaches chat tools. */
  ownerSession?: string | undefined;
  fetchImpl?: Fetch;
}) {
  const fetchImpl = options.fetchImpl ?? guardedFetch;

  async function ownerFetch(
    path: string,
    init: { body?: unknown; csrf?: string; accept?: string } = {},
  ): Promise<Response> {
    if (!options.ownerSession) {
      throw new NsvxError("unconfigured", "NSVX owner sign-in is not set up on this Gateway.");
    }
    let response: Response;
    try {
      response = await fetchImpl(`${options.baseUrl}${path}`, {
        method: init.csrf ? "POST" : "GET",
        headers: {
          Accept: init.accept ?? "application/json",
          Cookie: `${OWNER_COOKIE}=${options.ownerSession}`,
          ...(init.csrf ? { "Content-Type": "application/json", "X-CSRF-Token": init.csrf } : {}),
        },
        ...(init.csrf ? { body: JSON.stringify(init.body ?? {}) } : {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // Only reads reach here, so a lost connection never leaves an uncertain effect.
      throw new NsvxError("offline", "NSVX cannot be reached.");
    }
    if (!response.ok) {
      throw errorFor(response.status, await problemFrom(response), false, path);
    }
    return response;
  }

  function withId(path: string, id: string | undefined): string {
    if (!path.includes("{id}")) {
      return path;
    }
    if (!id || id.length > 200) {
      throw new NsvxError("invalid", "id is required.");
    }
    return path.replace("{id}", encodeURIComponent(id));
  }

  async function readOwner<T>(path: string): Promise<T> {
    return (await (await ownerFetch(path)).json()) as T;
  }

  async function postOwnerRead<T>(path: string, body: unknown): Promise<T> {
    const state = await readOwner<{ authenticated?: boolean; csrf?: string | null }>(
      "/api/auth/state",
    );
    if (!state.authenticated || !state.csrf) {
      throw new NsvxError("signed-out", "NSVX rejected the owner sign-in.");
    }
    return (await (await ownerFetch(path, { body, csrf: state.csrf })).json()) as T;
  }

  /**
   * Fetches the session's CSRF token from NSVX's own sign-in state route for each change, so a rotated or revoked
   * session fails here instead of being cached. Changes are rare owner taps; the extra read is cheap.
   */
  async function writeOwner<T>(
    action: OwnerWrite,
    id: string | undefined,
    body: unknown,
    more: { params?: Record<string, string>; idempotencyKey?: string } = {},
  ): Promise<T> {
    const spec: OwnerWriteSpec = OWNER_WRITES[action];
    const value = (name: string) => (name === "id" ? id : more.params?.[name]);
    const path = spec.path.replace(/\{(\w+)\}/g, (_match, name: string) => {
      const part = value(name);
      if (!part || part.length > 200) {
        throw new NsvxError("invalid", `${name} is required.`);
      }
      return encodeURIComponent(part);
    });
    const query = new URLSearchParams();
    for (const name of spec.query ?? []) {
      const part = value(name);
      if (part) {
        query.set(name, part);
      }
    }
    const state = await readOwner<{ authenticated?: boolean; csrf?: string | null }>(
      "/api/auth/state",
    );
    if (!state.authenticated || !state.csrf) {
      throw new NsvxError("signed-out", "NSVX ended the owner session.");
    }
    let response: Response;
    try {
      response = await fetchImpl(`${options.baseUrl}${path}${query.size > 0 ? `?${query}` : ""}`, {
        method: spec.method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Cookie: `${OWNER_COOKIE}=${options.ownerSession}`,
          "X-CSRF-Token": state.csrf,
          ...(spec.idempotency && more.idempotencyKey
            ? { [spec.idempotency]: more.idempotencyKey }
            : {}),
        },
        body: JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new NsvxError("uncertain", "NSVX did not confirm the result. Check before repeating.");
    }
    if (!response.ok) {
      throw errorFor(response.status, await problemFrom(response), true, path);
    }
    // Deletes answer 204 with no body.
    return (response.status === 204 ? { ok: true } : await response.json()) as T;
  }

  /**
   * AgentOS as the agent (bearer token) or, for the owner's own taps in Control, as the owner. NSVX accepts only the
   * owner's browser session today (`get_principal`), so Control uses that session when it is set; chat tools never do.
   */
  async function publicFetch(path: string, accept: string, alsoOk?: number): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(`${options.baseUrl}${path}`, {
        method: "GET",
        headers: {
          Accept: accept,
          ...(options.ownerSession ? { Cookie: `${OWNER_COOKIE}=${options.ownerSession}` } : {}),
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new NsvxError("offline", "NSVX cannot be reached.");
    }
    if (!response.ok && response.status !== alsoOk) {
      throw errorFor(response.status, await problemFrom(response), false, path);
    }
    return response;
  }

  async function call<T>(
    path: string,
    init: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string } = {},
    _principal: "agent" | "owner" = "agent",
  ): Promise<T> {
    // AgentOS is Bearer-only (NSVX_AGENTOS_TOKEN / TOKEN_FILE). Never lift clone_session here.
    if (!options.token) {
      throw new NsvxError("unconfigured", "NSVX sign-in is not set up on this Gateway.");
    }
    const isWrite = init.method === "POST";
    const auth: Record<string, string> = { Authorization: `Bearer ${options.token}` };
    let response: Response;
    try {
      response = await fetchImpl(`${options.baseUrl}${AGENTOS_PATH}${path}`, {
        method: init.method ?? "GET",
        headers: {
          Accept: "application/json",
          ...auth,
          ...(isWrite ? { "Content-Type": "application/json" } : {}),
          ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
        },
        ...(isWrite ? { body: JSON.stringify(init.body ?? {}) } : {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // A write that lost its connection may still have reached NSVX.
      throw isWrite
        ? new NsvxError("uncertain", "NSVX did not confirm the result. Check before repeating.")
        : new NsvxError("offline", "NSVX cannot be reached.");
    }
    if (!response.ok) {
      throw errorFor(response.status, await problemFrom(response), isWrite, path);
    }
    return (await response.json()) as T;
  }

  const agentOs = (principal: "agent" | "owner") => ({
    async listActions(): Promise<NsvxAction[]> {
      return (await call<{ actions: NsvxAction[] }>("/actions?limit=500", {}, principal)).actions;
    },
    getAction(actionId: string): Promise<NsvxAction & { contract: Record<string, unknown> }> {
      return call(`/actions/${encodeURIComponent(actionId)}`, {}, principal);
    },
    runAction(request: NsvxRunRequest): Promise<NsvxRunResult> {
      return call(
        `/actions/${encodeURIComponent(request.actionId)}/execute`,
        {
          method: "POST",
          idempotencyKey: request.idempotencyKey,
          body: {
            input: request.input,
            ...(request.approvalId ? { approval_id: request.approvalId } : {}),
          },
        },
        principal,
      );
    },
    async listTasks(): Promise<NsvxTask[]> {
      return (await call<{ tasks: NsvxTask[] }>("/tasks?limit=100", {}, principal)).tasks;
    },
    async listApprovals(): Promise<NsvxApproval[]> {
      return (await call<{ approvals: NsvxApproval[] }>("/approvals", {}, principal)).approvals;
    },
    decideApproval(approvalId: string, decision: "approve" | "deny"): Promise<NsvxApproval> {
      return call(
        `/approvals/${encodeURIComponent(approvalId)}/${decision}`,
        { method: "POST" },
        principal,
      );
    },
  });

  return {
    baseUrl: options.baseUrl,
    /** AgentOS as the agent: chat tools. */
    ...agentOs("agent"),
    /** AgentOS for Control taps: same Bearer token as chat; never the owner session. */
    control: agentOs("agent"),
    async readOwnerView<T = unknown>(
      view: string,
      params: Record<string, unknown> = {},
    ): Promise<T> {
      const spec = ownerViewSpec(view);
      const path = ownerViewPath(spec, params);
      if (!spec.image) {
        return readOwner(path);
      }
      // Page images cross the Gateway socket as data URLs, so the browser never needs the NSVX session.
      const response = await ownerFetch(path, { accept: "image/*" });
      const mime = response.headers.get("content-type")?.split(";")[0] ?? "";
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!mime.startsWith("image/") || bytes.byteLength > IMAGE_LIMIT) {
        throw new NsvxError("invalid", "NSVX did not send a page image.");
      }
      return { src: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` } as T;
    },
    /** Owner reads sent as POST (unified search, activity summary, Agenda help); `id` fills a `{id}` path slot. */
    async readOwnerPost<T = unknown>(
      name: OwnerReadPost,
      body: Record<string, unknown>,
      id?: string,
    ): Promise<T> {
      if (!Object.hasOwn(OWNER_READ_POSTS, name)) {
        throw new NsvxError("invalid", "Unknown NSVX view.");
      }
      return postOwnerRead(withId(OWNER_READ_POSTS[name], id), body);
    },
    /** One owner file as NSVX serves it, with the name from its `Content-Disposition`. */
    async readOwnerFile(
      name: OwnerFile,
      params: Record<string, unknown> = {},
    ): Promise<{ fileName: string; mime: string; data: string }> {
      const response = await ownerFetch(ownerViewPath(OWNER_FILES[name], params), {
        accept: "*/*",
      });
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > FILE_LIMIT) {
        throw new NsvxError("invalid", "The file is too large to send here.");
      }
      const disposition = response.headers.get("content-disposition") ?? "";
      return {
        fileName: /filename="([^"]+)"/.exec(disposition)?.[1] ?? "",
        mime: response.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream",
        data: Buffer.from(bytes).toString("base64"),
      };
    },
    /** The AUTO activity CSV for UTC days `start`..`end`, optionally only some entry ids, as NSVX builds it. */
    async exportActivity(range: { start: string; end: string; ids?: string }): Promise<string> {
      const query = new URLSearchParams({ start: range.start, end: range.end });
      if (range.ids) {
        query.set("ids", range.ids);
      }
      const csv = await (
        await ownerFetch(`/api/auto/activity/export?${query}`, { accept: "text/csv" })
      ).text();
      if (csv.length > EXPORT_MAX_CHARS) {
        throw new NsvxError("invalid", "Too much activity for one file. Pick fewer days.");
      }
      return csv;
    },
    /** NSVX's Agenda feed (`calendar.ics`): selected calendars, 30 days back to a year ahead, without guests. */
    async exportCalendar(): Promise<string> {
      const ics = await (
        await ownerFetch("/api/workspace/calendar.ics", { accept: "text/calendar" })
      ).text();
      if (ics.length > ICS_MAX_CHARS || !ics.startsWith("BEGIN:VCALENDAR")) {
        throw new NsvxError("failed", "NSVX did not send a calendar file.");
      }
      return ics;
    },
    /** One owner change on a fixed NSVX route; `body` must already be validated by the caller. */
    writeOwner<T = unknown>(
      action: OwnerWrite,
      id: string | undefined,
      body: unknown,
      more?: { params?: Record<string, string>; idempotencyKey?: string },
    ): Promise<T> {
      return writeOwner(action, id, body, more);
    },
    /** A public health probe; the owner session, when set, only adds detail NSVX shows its owner. */
    async readPublic(name: PublicRead): Promise<{ status: number; body: Record<string, unknown> }> {
      const spec: { path: string; alsoOk?: number } = PUBLIC_READS[name];
      const response = await publicFetch(spec.path, "application/json", spec.alsoOk);
      return {
        status: response.status,
        body: (await response.json()) as Record<string, unknown>,
      };
    },
    /** One public legal page as NSVX renders it (HTML). */
    async readLegalPage(page: string, lang: string): Promise<string> {
      if (!LEGAL_PAGES.includes(page as never) || !LEGAL_LANGS.includes(lang as never)) {
        throw new NsvxError("invalid", "Unknown legal page.");
      }
      const html = await (await publicFetch(`/${page}?lang=${lang}`, "text/html")).text();
      if (html.length > LEGAL_LIMIT) {
        throw new NsvxError("invalid", "NSVX sent too large a page.");
      }
      return html;
    },
    decideApproval(approvalId: string, decision: "approve" | "deny"): Promise<NsvxApproval> {
      return call(`/approvals/${encodeURIComponent(approvalId)}/${decision}`, { method: "POST" });
    },
  };
}
