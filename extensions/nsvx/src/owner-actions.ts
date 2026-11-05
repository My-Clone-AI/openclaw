import { NsvxError } from "./nsvx-client-core.js";

/**
 * The AgentOS read action behind each Access, Legal, Research, Marketing, AI, and Homes read, so a Gateway with only the bearer
 * token can open those tabs (NSVX's map: `docs/agentos/OPENCLAW_OWNER_TABS.md`). A view with no entry, or whose action
 * NSVX does not serve yet, stays `token-pending` by itself. Owner writes never go through here.
 */
export const OWNER_VIEW_ACTIONS = {
  apps: "clone.access.apps",
  appLogin: "clone.access.login",
  appLoginView: "clone.access.login.view",
  appLoginFields: "clone.access.login.fields",
  authDevices: "clone.access.devices",
  authProviders: "clone.access.providers",
  appleIdentities: "clone.access.apple",
  credentials: "clone.access.credentials",
  credentialImportJob: "clone.access.credentials.import",
  challenges: "clone.access.challenges",
  challengeView: "clone.access.challenge.view",
  permissions: "clone.access.permissions",
  permissionPeople: "clone.access.permissions.people",
  providerHooks: "clone.access.hooks",
  casesDashboard: "clone.legal.dashboard",
  casesVocab: "clone.legal.vocab",
  cases: "clone.legal.list",
  caseSuggestions: "clone.legal.suggestions",
  caseSettings: "clone.legal.settings",
  caseDrive: "clone.legal.drive",
  case: "clone.legal.case",
  caseHistory: "clone.legal.history",
  caseTimeline: "clone.legal.timeline",
  caseEvidence: "clone.legal.evidence",
  casePayments: "clone.legal.payments",
  caseBank: "clone.legal.bank",
  caseDeadlines: "clone.legal.deadlines",
  caseResearch: "clone.legal.research",
  caseDocuments: "clone.legal.documents",
  caseAi: "clone.legal.ai",
  caseExports: "clone.legal.exports",
  caseSheet: "clone.legal.sheet",
  caseProof: "clone.legal.proof",
  caseProofText: "clone.legal.proof.text",
  caseProofPages: "clone.legal.proof.pages",
  caseProofPage: "clone.legal.proof.page",
  caseProofRows: "clone.legal.proof.rows",
  caseDocument: "clone.legal.document",
  caseRun: "clone.legal.run",
  caseRunMaterial: "clone.legal.run.material",
  legalReview: "clone.legal.review",
  procedures: "clone.procedures.list",
  procedure: "clone.procedures.get",
  procedureVersion: "clone.procedures.version",
  procedureRun: "clone.procedures.run",
  procedureReconcile: "clone.procedures.reconcile",
  research: "clone.research.list",
  researchSettings: "clone.research.settings",
  researchJob: "clone.research.get",
  marketingOverview: "clone.marketing.overview",
  marketingGate: "clone.marketing.gate",
  marketingBrands: "clone.marketing.brands",
  marketingCalendar: "clone.marketing.calendar",
  marketingChannels: "clone.marketing.channels",
  marketingAnalytics: "clone.marketing.analytics",
  marketingJob: "clone.marketing.job",
  aiState: "clone.ai.state",
  aiRequests: "clone.ai.requests",
  aiRequest: "clone.ai.request",
  aiOps: "clone.ai.ops",
  aiProviders: "clone.ai.providers",
  cloneAi: "clone.ai.clone",
  localTraining: "clone.ai.local.training",
  gptVoice: "clone.voice.gpt.settings",
  cloneAiBench: "clone.ai.clone.bench",
  aiKeys: "clone.ai.keys",
  homesOverview: "clone.homes.overview",
  homesPortfolio: "clone.homes.portfolio",
  homesUnits: "clone.homes.units",
  homesRent: "clone.homes.rent",
  homesLoans: "clone.homes.loans",
  homesLoan: "clone.homes.loan",
  homesHub: "clone.homes.hub",
  homesHubProperty: "clone.homes.hub.property",
  homesHubAlerts: "clone.homes.hub.alerts",
  rentBoard: "clone.homes.rent.board",
  rentSuggestions: "clone.homes.rent.suggestions",
  mortgageCases: "clone.homes.mortgage.cases",
  mortgageCase: "clone.homes.mortgage.case",
  mortgageLenders: "clone.homes.mortgage.lenders",
  stayMe: "clone.homes.stay.me",
  stayOverview: "clone.homes.stay.overview",
  stayReservations: "clone.homes.stay.reservations",
  stayTasks: "clone.homes.stay.tasks",
  stayMaintenance: "clone.homes.stay.maintenance",
  stayInventory: "clone.homes.stay.inventory",
} as const;

export const OWNER_FILE_ACTIONS = {
  researchPdf: "clone.research.pdf",
  marketingInventory: "clone.marketing.inventory",
} as const;

/**
 * The route's own names and values, already checked by `ownerViewPath`, so a contract that refuses extra properties
 * accepts them. `refresh` asks NSVX's screen to reload its browser; the read action never does.
 */
export function actionInput(
  spec: { path: string; query?: readonly string[] },
  params: Record<string, unknown>,
): Record<string, unknown> {
  const slots = Array.from(spec.path.matchAll(/\{(\w+)\}/g), (match) => match[1] as string);
  const input: Record<string, unknown> = {};
  for (const name of [...slots, ...(spec.query ?? [])]) {
    if (name !== "refresh" && params[name] !== undefined && params[name] !== "") {
      input[name] = params[name];
    }
  }
  return input;
}

/** NSVX's answer for binary reads: its bytes as base64, under the plugin's limit for that kind of read. */
export function actionBytes(
  output: unknown,
  limit: number,
): { fileName: string; mime: string; data: string } {
  const {
    mime,
    data_base64: data,
    file_name: fileName,
  } = (output ?? {}) as { mime?: unknown; data_base64?: unknown; file_name?: unknown };
  if (typeof mime !== "string" || typeof data !== "string") {
    throw new NsvxError("failed", "NSVX did not send the file.");
  }
  if (Buffer.byteLength(data, "base64") > limit) {
    throw new NsvxError("invalid", "The file is too large to send here.");
  }
  return { fileName: typeof fileName === "string" ? fileName : "", mime, data };
}
