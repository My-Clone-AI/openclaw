import {
  businessFiles,
  businessReadPosts,
  businessViews,
  businessWrites,
} from "./business-routes.js";
import { callFiles, callReadPosts, callViews, callWrites } from "./calls-routes.js";
import {
  LEGAL_LANGS,
  LEGAL_PAGES,
  accessRoutes,
  accessWrites,
  marketingWrites,
} from "./device-data.js";
import { AGENTOS_PATH, TIMEOUT_MS, NsvxError } from "./nsvx-client-core.js";
import {
  OWNER_FILE_ACTIONS,
  OWNER_VIEW_ACTIONS,
  actionBytes,
  actionInput,
} from "./owner-actions.js";
import type { NsvxAction, NsvxApproval, NsvxRunResult, NsvxTask } from "./types.js";
export { AGENTOS_PATH, NsvxError, type NsvxErrorKind } from "./nsvx-client-core.js";

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
  // Homes (`/imoveis`, `/arrendamento`, `/empresarial/.../credito-habitacao`, `/al`): the reads those screens make.
  // `homesHub` and `homesHubAlerts` let NSVX refresh its own deadline alerts first, as its Casa screen does.
  homesOverview: { path: "/api/realestate/overview", query: ["preset"] },
  homesPortfolio: { path: "/api/realestate/properties", query: ["q", "archived"] },
  homesUnits: { path: "/api/realestate/units", query: ["status", "q"] },
  homesRent: { path: "/api/realestate/rent", query: ["month"] },
  homesLoans: { path: "/api/realestate/loans" },
  homesLoan: { path: "/api/realestate/loans/{id}" },
  homesHub: { path: "/api/properties", query: ["archived"] },
  homesHubProperty: { path: "/api/properties/{id}" },
  homesHubAlerts: { path: "/api/properties/alerts" },
  rentBoard: { path: "/api/arrendamento", query: ["month"] },
  rentSuggestions: { path: "/api/arrendamento/payments/{id}/suggestions" },
  mortgageCases: { path: "/api/mortgage" },
  mortgageCase: { path: "/api/mortgage/cases/{id}" },
  mortgageLenders: { path: "/api/mortgage/lenders" },
  stayMe: { path: "/api/al/me" },
  stayOverview: { path: "/api/al/overview" },
  stayReservations: { path: "/api/al/reservations", query: ["period", "q", "property", "status"] },
  stayTasks: { path: "/api/al/tasks", query: ["period", "kind", "property"] },
  stayMaintenance: { path: "/api/al/maintenance", query: ["open_only", "property"] },
  stayInventory: { path: "/api/al/inventory", query: ["property"] },
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
  // Grow (`/empresas-do-grupo`, Grow tab): the engine's read models; NSVX answers "not provisioned" without one.
  growStatus: { path: "/api/grow/status" },
  growHistory: { path: "/api/grow/{app}/cycles", query: ["limit"] },
  growCycle: { path: "/api/grow/cycles/{id}" },
  growLog: { path: "/api/grow/{app}/log", query: ["cycle", "tail", "kind"] },
  growTimers: { path: "/api/grow/automations" },
  growChains: { path: "/api/grow/development/chains" },
  growChainHistory: { path: "/api/grow/development/chains/{slot}/history" },
  // Build Me admin: ideas from every app, with their images.
  buildMeConfig: { path: "/api/build-me/config" },
  buildMeRequests: {
    path: "/api/build-me/admin/requests",
    query: ["app", "state", "q", "start", "end", "page"],
  },
  buildMeRequest: { path: "/api/build-me/admin/requests/{id}" },
  buildMeImage: { path: "/api/build-me/admin/requests/{id}/media/{attachment}", image: true },
  buildMeReplicaImage: {
    path: "/api/build-me/admin/replicas/{app}/{id}/media/{attachment}",
    image: true,
  },
  // OpenClaw brain (`/apps`): the status file and worker roles NSVX keeps for the brain.
  brainStatus: { path: "/api/v1/admin/ai/openclaw/status" },
  brainRoles: { path: "/api/v1/admin/ai/openclaw/worker-roles" },
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
  ...accessRoutes,
  ...callViews,
  ...businessViews,
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
  // Legal (`/processos`): cases, evidence, money, documents, the consent-bound legal AI, and procedures.
  casesDashboard: { path: "/api/cases/dashboard" },
  casesVocab: { path: "/api/cases/vocab" },
  cases: { path: "/api/cases", query: ["status"] },
  caseSuggestions: { path: "/api/cases/suggestions" },
  caseSettings: { path: "/api/cases/settings" },
  caseDrive: { path: "/api/cases/drive/search", query: ["q"] },
  case: { path: "/api/cases/{id}" },
  caseHistory: { path: "/api/cases/{id}/history" },
  caseTimeline: { path: "/api/cases/{id}/timeline" },
  caseEvidence: { path: "/api/cases/{id}/evidence", query: ["folder"] },
  casePayments: { path: "/api/cases/{id}/payments" },
  caseBank: { path: "/api/cases/{id}/bank-candidates" },
  caseDeadlines: { path: "/api/cases/{id}/deadlines" },
  caseResearch: { path: "/api/cases/{id}/research" },
  caseDocuments: { path: "/api/cases/{id}/documents" },
  caseAi: { path: "/api/cases/{id}/ai" },
  caseExports: { path: "/api/cases/{id}/exports" },
  caseSheet: { path: "/api/cases/{id}/sheets/{sheet}" },
  caseProof: { path: "/api/cases/evidence/{id}", query: ["case"] },
  caseProofText: { path: "/api/cases/evidence/{id}/text", query: ["q"] },
  caseProofPages: { path: "/api/cases/evidence/{id}/pages" },
  caseProofPage: { path: "/api/cases/evidence/{id}/page/{page}", query: ["w"], image: true },
  caseProofRows: { path: "/api/cases/evidence/{id}/sheet-extract" },
  caseDocument: { path: "/api/cases/documents/{id}" },
  caseRun: { path: "/api/cases/ai/{id}" },
  caseRunMaterial: { path: "/api/cases/ai/{id}/material" },
  legalReview: { path: "/api/legal-reviews/{id}" },
  procedures: { path: "/api/procedures" },
  procedure: { path: "/api/procedures/{id}" },
  procedureVersion: { path: "/api/procedures/{id}/versions/{version}" },
  procedureRun: { path: "/api/procedures/runs/{id}" },
  procedureReconcile: { path: "/api/procedures/runs/{id}/reconcile" },
  // Research (`/pesquisas`): jobs and who gets automatic delivery.
  research: { path: "/api/research", query: ["completed"] },
  researchSettings: { path: "/api/research/settings", query: ["account_id"] },
  researchJob: { path: "/api/research/{id}" },
  // Marketing (the Group's marketing admin): queue, gates, social accounts, counts.
  marketingOverview: { path: "/api/group-companies/marketing/overview" },
  marketingGate: { path: "/api/group-companies/marketing/gate" },
  marketingBrands: { path: "/api/group-companies/marketing/brands" },
  marketingCalendar: { path: "/api/group-companies/marketing/calendar" },
  marketingChannels: { path: "/api/group-companies/marketing/channels" },
  marketingAnalytics: { path: "/api/group-companies/marketing/analytics" },
  marketingJob: { path: "/api/group-companies/marketing/jobs/{id}" },
  // AI (`/apps/ia`, Clone AI, Voz): the reads the NSVX AI, Clone AI admin, and GPT voice screens make.
  aiState: { path: "/api/ai/state" },
  aiRequests: { path: "/api/ai/requests", query: ["lane", "provider", "status", "limit"] },
  aiRequest: { path: "/api/ai/requests/{id}" },
  aiOps: { path: "/api/ai/inference-ops" },
  aiProviders: { path: "/api/ai/openclaw/providers" },
  cloneAi: { path: "/api/group-companies/clone-ai" },
  localTraining: { path: "/api/ai/local/training" },
  gptVoice: { path: "/api/voice/gpt/settings" },
  cloneAiBench: { path: "/api/group-companies/clone-ai/bench/dashboard", query: ["model"] },
  aiKeys: { path: "/api/ai/api-keys" },
} as const satisfies Record<string, OwnerViewSpec>;

type OwnerView = keyof typeof OWNER_VIEWS;

export const OWNER_VIEW_NAMES = Object.keys(OWNER_VIEWS) as OwnerView[];

const VIEW_ACTIONS: Partial<Record<OwnerView, string>> = OWNER_VIEW_ACTIONS;

/**
 * Fixed NSVX owner routes. `{name}` path parts and `query` names come from the caller's validated values;
 * `idempotency` names the header NSVX reads the caller's key from.
 */
type OwnerWriteSpec = {
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  query?: readonly string[];
  idempotency?: string;
  /** Sent as a form: NSVX reads this route with `request.form()`. */
  form?: true;
  /** NSVX also checks `Origin` on this route; the Gateway sends NSVX's own, as the NSVX web app does. */
  origin?: true;
  /** File upload: the caller passes a `FormData` body and fetch sets its boundary. */
  multipart?: true;
  /** Routes that wait for a real model answer; NSVX itself allows the test up to 300 s. */
  slow?: true;
};

/** Longer than NSVX's own 300 s test limit, so its answer (not this timeout) decides. */
const SLOW_TIMEOUT_MS = 320_000;

const OWNER_WRITES = {
  ...accessWrites,
  ...businessWrites,
  ...callWrites,
  ...marketingWrites,
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
  // Homes: internal NSVX records only. No receipt goes to the Portal das Finanças, no bank or guest is contacted.
  homesAlertRead: { method: "POST", path: "/api/properties/alerts/{id}/read" },
  homesNotice: { method: "POST", path: "/api/realestate/notifications/{id}/{action}" },
  homesExpense: {
    method: "POST",
    path: "/api/properties/{id}/expenses",
    idempotency: "Idempotency-Key",
  },
  rentReconcile: { method: "POST", path: "/api/arrendamento/reconcile" },
  rentAssociate: { method: "POST", path: "/api/arrendamento/payments/{id}/associate" },
  rentReverse: { method: "POST", path: "/api/arrendamento/matches/{id}/reverse" },
  mortgageCreate: { method: "POST", path: "/api/mortgage/cases", idempotency: "Idempotency-Key" },
  mortgageChecklist: { method: "POST", path: "/api/mortgage/cases/{id}/requirements" },
  stayStep: { method: "POST", path: "/api/al/reservations/{id}/{step}" },
  stayTask: { method: "POST", path: "/api/al/tasks/{id}/action" },
  stayIssue: { method: "POST", path: "/api/al/maintenance" },
  stayNoticesRead: { method: "POST", path: "/api/al/notifications/read" },
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
  // Grow only queues requests; the engine applies them on its next tick.
  growControl: { method: "POST", path: "/api/grow/control", idempotency: "Idempotency-Key" },
  growTimerOn: { method: "POST", path: "/api/grow/automations/{id}/enable" },
  growTimerOff: { method: "POST", path: "/api/grow/automations/{id}/disable" },
  growTimerSchedule: { method: "PUT", path: "/api/grow/automations/{id}/schedule" },
  growChainRollback: { method: "POST", path: "/api/grow/development/chains/{id}/rollback" },
  // Build Me keys idempotency in the body; a submission is the owner's own idea, text only.
  buildMeSubmit: { method: "POST", path: "/api/build-me/submissions", form: true, origin: true },
  buildMeDecide: { method: "POST", path: "/api/build-me/admin/requests/{id}/override" },
  brainTask: { method: "POST", path: "/api/v1/admin/ai/openclaw/tasks" },
  brainRoles: { method: "PUT", path: "/api/v1/admin/ai/openclaw/worker-roles" },
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
  // Legal: the owner's own dossiers. None sends, files, or notifies; legal AI runs only after `caseRunAuthorize`.
  caseCreate: { method: "POST", path: "/api/cases" },
  caseUpdate: { method: "PATCH", path: "/api/cases/{id}" },
  caseSummary: { method: "POST", path: "/api/cases/{id}/summary-draft" },
  caseSuggestionStatus: { method: "POST", path: "/api/cases/suggestions/{id}/status" },
  caseSuggestionConvert: { method: "POST", path: "/api/cases/suggestions/{id}/convert" },
  caseDiscovery: { method: "POST", path: "/api/cases/discovery/run" },
  caseSettings: { method: "PUT", path: "/api/cases/settings" },
  casePartyAdd: { method: "POST", path: "/api/cases/{id}/parties" },
  casePartyUpdate: { method: "PATCH", path: "/api/cases/{id}/parties/{item}" },
  casePartyRemove: { method: "DELETE", path: "/api/cases/{id}/parties/{item}" },
  caseFactAdd: { method: "POST", path: "/api/cases/{id}/facts" },
  caseEventAdd: { method: "POST", path: "/api/cases/{id}/timeline", query: ["supersedes"] },
  caseProofDrive: { method: "POST", path: "/api/cases/{id}/evidence/drive" },
  caseProofUpload: { method: "POST", path: "/api/cases/{id}/evidence/upload", multipart: true },
  caseProofUpdate: { method: "PATCH", path: "/api/cases/{id}/evidence/{item}" },
  caseProofRemove: { method: "DELETE", path: "/api/cases/{id}/evidence/{item}" },
  caseProofVersion: { method: "POST", path: "/api/cases/{id}/evidence/{item}/new-version" },
  caseProofDerive: { method: "POST", path: "/api/cases/{id}/evidence/{item}/derive" },
  caseProofCheck: { method: "POST", path: "/api/cases/evidence/{id}/check" },
  caseNoteAdd: { method: "POST", path: "/api/cases/evidence/{id}/annotations" },
  caseNoteRemove: { method: "DELETE", path: "/api/cases/evidence/{id}/annotations/{item}" },
  caseObligationAdd: { method: "POST", path: "/api/cases/{id}/obligations" },
  caseObligationPlan: { method: "POST", path: "/api/cases/{id}/obligations/schedule" },
  caseObligationRemove: { method: "DELETE", path: "/api/cases/{id}/obligations/{item}" },
  casePaymentAdd: { method: "POST", path: "/api/cases/{id}/payments" },
  casePaymentRemove: { method: "DELETE", path: "/api/cases/{id}/payments/{item}" },
  caseDeadlineAdd: { method: "POST", path: "/api/cases/{id}/deadlines" },
  caseDeadlineUpdate: { method: "PATCH", path: "/api/cases/{id}/deadlines/{item}" },
  caseSourceAdd: { method: "POST", path: "/api/cases/{id}/research" },
  caseSourceUpdate: { method: "PATCH", path: "/api/cases/{id}/research/{item}" },
  caseSourceRemove: { method: "DELETE", path: "/api/cases/{id}/research/{item}" },
  caseDocumentProposal: { method: "POST", path: "/api/cases/{id}/documents/proposal" },
  caseDocumentAdd: { method: "POST", path: "/api/cases/{id}/documents" },
  caseDocumentEdit: { method: "PUT", path: "/api/cases/documents/{id}" },
  caseDocumentStatus: { method: "POST", path: "/api/cases/documents/{id}/status" },
  caseRunPrepare: { method: "POST", path: "/api/cases/{id}/ai/prepare" },
  caseRunAuthorize: { method: "POST", path: "/api/cases/ai/{id}/authorize" },
  caseRunCancel: { method: "POST", path: "/api/cases/ai/{id}/cancel" },
  caseExport: { method: "POST", path: "/api/cases/{id}/export" },
  caseSheetStart: { method: "POST", path: "/api/cases/{id}/sheets" },
  caseSheetConfirm: { method: "POST", path: "/api/cases/{id}/sheets/{item}/confirm" },
  caseSheetCancel: { method: "POST", path: "/api/cases/{id}/sheets/{item}/cancel" },
  legalReviewPrepare: { method: "POST", path: "/api/outbox/{id}/legal-review" },
  legalReviewAuthorize: { method: "POST", path: "/api/legal-reviews/{id}/authorize" },
  legalReviewCancel: { method: "POST", path: "/api/legal-reviews/{id}/cancel" },
  procedurePropose: { method: "POST", path: "/api/procedures/propose" },
  procedureCreate: { method: "POST", path: "/api/procedures" },
  procedureEdit: { method: "PUT", path: "/api/procedures/{id}" },
  procedureState: { method: "POST", path: "/api/procedures/{id}/state" },
  procedureRun: { method: "POST", path: "/api/procedures/{id}/runs" },
  procedureRunResume: { method: "POST", path: "/api/procedures/runs/{id}/resume" },
  procedureRunCancel: { method: "POST", path: "/api/procedures/runs/{id}/cancel" },
  // Research: `researchAct` send and resend queue the report to the person who asked, under NSVX's delivery rules.
  researchCreate: { method: "POST", path: "/api/research" },
  researchSettings: { method: "POST", path: "/api/research/settings" },
  researchName: { method: "POST", path: "/api/research/{id}/name" },
  researchAct: { method: "POST", path: "/api/research/{id}/{item}" },
  // AI routing, subscriptions, Clone AI, training, and voice: the changes the NSVX AI screens make.
  aiLane: { method: "PUT", path: "/api/ai/lanes/{id}" },
  aiLaneSkip: { method: "POST", path: "/api/ai/lanes/{id}/skip" },
  aiLaneRestore: { method: "DELETE", path: "/api/ai/lanes/{id}/skip" },
  aiLaneTest: { method: "POST", path: "/api/ai/lanes/{id}/test", slow: true },
  aiProviderTest: { method: "POST", path: "/api/ai/providers/{id}/test", slow: true },
  aiProviderRefresh: { method: "POST", path: "/api/ai/providers/{id}/refresh" },
  aiProviderEnabled: { method: "POST", path: "/api/ai/providers/{id}/enabled" },
  aiProviderPreferred: { method: "POST", path: "/api/ai/providers/{id}/preferred" },
  aiRepairApproval: { method: "PUT", path: "/api/ai/repair/approval" },
  cloneAiRouting: { method: "POST", path: "/api/group-companies/clone-ai/routing" },
  cloneAiHealth: { method: "POST", path: "/api/group-companies/clone-ai/health" },
  cloneAiRollback: { method: "POST", path: "/api/group-companies/clone-ai/rollback" },
  cloneAiRegister: { method: "POST", path: "/api/ai/openclaw/providers/clone-ai/register" },
  trainingPrepare: { method: "POST", path: "/api/ai/local/training" },
  trainingRevoke: { method: "POST", path: "/api/ai/local/training/{id}/revoke" },
  gptVoice: { method: "POST", path: "/api/voice/gpt/settings" },
  cloneAiBench: { method: "POST", path: "/api/group-companies/clone-ai/bench/commands" },
  aiServerAccounts: { method: "PUT", path: "/api/ai/inference-ops/server-accounts" },
  aiKeysSettings: { method: "PUT", path: "/api/ai/api-keys/settings" },
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
  // Homes reads that NSVX answers from stored data: a question about the homes and loan rate scenarios.
  homesAsk: "/api/properties/ask",
  loanRates: "/api/realestate/simulate/rates",
  ...callReadPosts,
  ...businessReadPosts,
} as const;

export type OwnerReadPost = keyof typeof OWNER_READ_POSTS;

/** Owner files Control saves for the owner: logbook exports, aviation documents, case files, and research PDFs. */
const OWNER_FILES = {
  aviationCsv: { path: "/api/aviation/logbook/export.csv" },
  aviationXlsx: { path: "/api/aviation/logbook/export.xlsx" },
  aviationPrint: { path: "/api/aviation/logbook/print", query: ["start", "end"] },
  aviationDocFile: { path: "/api/aviation/docs/{id}/content", query: ["download"] },
  caseProofFile: { path: "/api/cases/evidence/{id}/original", query: ["case"] },
  caseDocumentFile: { path: "/api/cases/documents/{id}/export", query: ["format"] },
  caseExportFile: { path: "/api/cases/{id}/exports/{file}" },
  researchPdf: { path: "/api/research/{id}/pdf" },
  marketingInventory: { path: "/api/marketing/social-accounts-inventory", query: ["format"] },
  ...callFiles,
  ...businessFiles,
} as const satisfies Record<string, OwnerViewSpec>;

export type OwnerFile = keyof typeof OWNER_FILES;

const FILE_ACTIONS: Partial<Record<OwnerFile, string>> = OWNER_FILE_ACTIONS;
/**
 * Files cross the Gateway socket as base64; a logbook or licence scan is far below this. A case dossier ZIP with
 * originals can pass it: the owner then gets a clear refusal and can export without originals.
 */
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
  /** A function is asked on every AgentOS call, so a rotated token file applies without a restart. */
  token: string | undefined | (() => string | undefined);
  /**
   * @deprecated Lifted browser cookie, kept only until NSVX serves owner screens through AgentOS actions; then this
   * option and the human `/api` routes it reaches go away. Never reaches AgentOS.
   */
  ownerSession?: string | undefined;
  fetchImpl?: Fetch;
}) {
  const fetchImpl = options.fetchImpl ?? guardedFetch;
  const readToken = () => (typeof options.token === "function" ? options.token() : options.token);

  async function ownerFetch(
    path: string,
    init: { body?: unknown; csrf?: string; accept?: string } = {},
  ): Promise<Response> {
    if (!options.ownerSession) {
      throw readToken()
        ? new NsvxError("token-pending", "NSVX does not offer this screen to a token yet.")
        : new NsvxError("unconfigured", "NSVX sign-in is not set up on this Gateway.");
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
    if (!options.ownerSession && readToken()) {
      throw new NsvxError("token-pending", "NSVX does not accept this change from a token yet.");
    }
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
          ...(spec.multipart
            ? {}
            : {
                "Content-Type": spec.form
                  ? "application/x-www-form-urlencoded"
                  : "application/json",
              }),
          Cookie: `${OWNER_COOKIE}=${options.ownerSession}`,
          "X-CSRF-Token": state.csrf,
          ...(spec.origin ? { Origin: new URL(options.baseUrl).origin } : {}),
          ...(spec.idempotency && more.idempotencyKey
            ? { [spec.idempotency]: more.idempotencyKey }
            : {}),
        },
        body: spec.multipart
          ? (body as FormData)
          : spec.form
            ? new URLSearchParams(body as Record<string, string>).toString()
            : JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(spec.slow ? SLOW_TIMEOUT_MS : TIMEOUT_MS),
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
    init: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string; read?: true } = {},
    _principal: "agent" | "owner" = "agent",
  ): Promise<T> {
    // AgentOS is Bearer-only (NSVX_AGENTOS_TOKEN_FILE). Never lift clone_session here.
    const token = readToken();
    if (!token) {
      throw new NsvxError("unconfigured", "NSVX sign-in is not set up on this Gateway.");
    }
    const isPost = init.method === "POST";
    const isWrite = isPost && !init.read;
    const auth: Record<string, string> = { Authorization: `Bearer ${token}` };
    let response: Response;
    try {
      response = await fetchImpl(`${options.baseUrl}${AGENTOS_PATH}${path}`, {
        method: init.method ?? "GET",
        headers: {
          Accept: "application/json",
          ...auth,
          ...(isPost ? { "Content-Type": "application/json" } : {}),
          ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
        },
        ...(isPost ? { body: JSON.stringify(init.body ?? {}) } : {}),
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

  /**
   * One read action on the bearer token. No Idempotency-Key, so NSVX never stores this private output for replay. NSVX
   * answers `No such action.` when the id is not served and a bare `not found` when AgentOS is off (`rest_api.py`);
   * other 404s mean the record is gone.
   */
  async function readAction(action: string, input: Record<string, unknown>): Promise<unknown> {
    const run = await call<NsvxRunResult>(`/actions/${encodeURIComponent(action)}/execute`, {
      method: "POST",
      read: true,
      body: { input },
    }).catch((cause: unknown) => {
      throw cause instanceof NsvxError && /^(no such action\.|not found)$/i.test(cause.message)
        ? new NsvxError("token-pending", "NSVX does not offer this screen to a token yet.")
        : cause;
    });
    if (run.status !== "completed" || !run.output) {
      throw new NsvxError("failed", "NSVX did not finish this read.", run.correlation_id);
    }
    return run.output;
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
      const action = options.ownerSession ? undefined : VIEW_ACTIONS[view as OwnerView];
      if (action) {
        const output = await readAction(action, actionInput(spec, params));
        if (!spec.image) {
          return output as T;
        }
        const { mime, data } = actionBytes(output, IMAGE_LIMIT);
        if (!mime.startsWith("image/")) {
          throw new NsvxError("invalid", "NSVX did not send a page image.");
        }
        return { src: `data:${mime};base64,${data}` } as T;
      }
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
      const path = ownerViewPath(OWNER_FILES[name], params);
      const action = options.ownerSession ? undefined : FILE_ACTIONS[name];
      if (action) {
        const output = await readAction(action, actionInput(OWNER_FILES[name], params));
        return actionBytes(output, FILE_LIMIT);
      }
      const response = await ownerFetch(path, {
        accept: "*/*",
      });
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > FILE_LIMIT) {
        throw new NsvxError("invalid", "The file is too large to send here.");
      }
      const disposition = response.headers.get("content-disposition") ?? "";
      const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
      return {
        fileName: encoded
          ? decodeURIComponent(encoded)
          : (/filename="([^"]+)"/.exec(disposition)?.[1] ?? ""),
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
