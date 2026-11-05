/** NSVX legal shapes (`web/src/logic/legal.ts`) and pure helpers. Money arrives as decimal strings; unknown is null. */
export type CaseStatus = "open" | "waiting_docs" | "attention" | "resolved" | "archived";
export type Nature = "potential" | "formal";
export type FactStatus = "confirmed" | "extracted" | "owner" | "ai_inference" | "disputed";
export type SuggestionStatus = "new" | "reviewing" | "confirmed" | "rejected" | "converted";
export type Coverage = "high" | "medium" | "low";
export type DocStatus = "draft" | "reviewed" | "approved" | "signed" | "sent";
export type RunStatus =
  | "awaiting_consent"
  | "queued"
  | "waiting_quota"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export type CaseRow = {
  id: string;
  ref: string;
  title: string;
  status: CaseStatus;
  nature: Nature;
  priority: string;
  categories: string[];
  stage: string | null;
  respondent: string | null;
  outstanding: string;
  verified_principal: string;
  evidence: number;
  evidence_attention: number;
  next_deadline: string | null;
  deadlines_unconfirmed: number;
  deadlines_open: number;
  updated_at: string;
  legal_hold: boolean;
  ai_allowed: boolean;
};

export type Party = {
  id: string;
  role: string;
  name: string;
  kind: string;
  identity_state: "unverified" | "owner_confirmed" | "document_verified";
  contact: string | null;
};

export type Fact = {
  id: string;
  text: string;
  status: FactStatus;
  disputed: boolean;
  evidence_ids: string[];
  codes: string[];
};

export type CaseDetail = CaseRow & {
  description: string | null;
  issue: string | null;
  jurisdiction: string;
  court: string | null;
  procedure: string | null;
  governing_law: string | null;
  external_ref: string | null;
  legal_rep: string | null;
  amount_claimed: string | null;
  amount_disputed: string | null;
  notes: string | null;
  outcome: string | null;
  revision: number;
  summary: CaseRow;
  parties: Party[];
  links: { id: string; label: string }[];
  facts: Fact[];
};

export type Suggestion = {
  id: string;
  key: string;
  title: string;
  categories: string[];
  counterparty: string | null;
  context: string | null;
  status: SuggestionStatus;
  coverage: Coverage;
  case_id: string | null;
  reasons: { kind: string; text: string }[];
  missing: string[];
  evidence: { drive_file_id: string; name: string; read: string }[];
  metrics: {
    outstanding?: { amount: string; estimate: boolean };
    last_payment?: { date: string };
    oldest_unpaid?: { date: string; days: number };
    months_unpaid?: number | null;
    formal_signals?: string[];
    identity?: { note?: string };
  };
};

export type BankCoverage = {
  accounts_total: number;
  accounts_read: number;
  note: string;
  windows: { account: string; from: string | null; to: string | null; n: number }[];
};

export type Lane = {
  label: string;
  eligible: boolean;
  reason: string;
  status: string;
  reset_at: string | null;
  billing: string;
};

export type Dashboard = {
  counts: {
    active: number;
    attention: number;
    waiting_docs: number;
    resolved: number;
    archived: number;
    suggestions: number;
  };
  outstanding: string;
  outstanding_verified: string;
  deadlines: {
    id: string;
    ref: string;
    title: string;
    kind: string;
    due_date: string | null;
    verified: boolean;
  }[];
  documents_pending: { id: string; title: string; version: number; ref: string }[];
  discovery: { last_run: string | null };
};

export type Vocab = {
  categories: Record<string, { group: string; label: string }>;
  priority: Record<string, string>;
  party_roles: Record<string, string>;
  folders: Record<string, string>;
  evidence_types: Record<string, string>;
  templates: Record<string, { label: string; folder: string; consequential: boolean }>;
  disclaimer: string;
};

export type Evidence = {
  id: string;
  code: string | null;
  folder: string | null;
  tags: string[];
  exclude_from_ai: boolean;
  source: string;
  source_path: string | null;
  name: string;
  mime: string | null;
  size: number | null;
  sha256: string | null;
  doc_date: string | null;
  author: string | null;
  type: string;
  description: string | null;
  location_ref: string | null;
  extraction_state: string;
  source_state: string;
  privileged: boolean;
  derivative_kind: string | null;
  partition_required?: boolean;
  has_text: boolean;
  previewable: boolean;
};

export type EvidenceDetail = Evidence & {
  custody: { at: string; actor: string; event: string }[];
  annotations: { id: string; text: string; at: string }[];
};

export type Obligation = {
  id: string;
  description: string;
  due_date: string | null;
  due_basis: string;
  amount: string;
  paid: string;
  outstanding: string;
  status: "paid" | "partial" | "open" | "future" | "disputed";
  days_overdue: number | null;
};

export type Payment = {
  id: string;
  kind: string;
  paid_on: string | null;
  amount: string;
  method: string | null;
  source: string;
  verified: boolean;
};

export type Ledger = {
  obligations: Obligation[];
  payments: Payment[];
  totals: {
    expected: string;
    received: string;
    received_verified: string;
    verified_outstanding: string;
    estimated_outstanding: string;
    disputed: string;
  };
  allocation_rule: string;
  interest: { note: string };
  bank_coverage: BankCoverage;
};

export type BankMatch = {
  id: number;
  date: string;
  amount: string;
  counterparty: string | null;
  description: string;
  account: string;
  reasons: string[];
  used_in: string | null;
};

export type TimelineEvent = {
  id: string;
  date: string | null;
  precision: string;
  title: string;
  status: FactStatus;
  evidence_ids: string[];
  codes: string[];
  auto: boolean;
};

export type Deadline = {
  id: string;
  title: string;
  kind: "legal_deadline" | "task" | "reminder";
  due_date: string | null;
  verified: boolean;
  basis: string | null;
  status: "open" | "done" | "cancelled";
};

export type DocVersion = {
  id: string;
  doc_type: string;
  title: string;
  version: number;
  status: DocStatus;
  body: string;
  origin: "owner" | "ai" | "template";
  sha256: string;
  facts_used: string[];
  created_at: string;
  sections: string[];
  versions?: { id: string; version: number; status: DocStatus; origin: string; at: string }[];
};

export type DocProposal = {
  template: string;
  label: string;
  consequential: boolean;
  missing: string[];
  facts: { id: string; text: string; default: boolean }[];
  evidence: { id: string; code: string; name: string; default: boolean }[];
};

export type Manifest = {
  label: string;
  destination: string;
  web_search: boolean;
  items: {
    evidence_id: string;
    code: string;
    name: string;
    included: boolean;
    reason: string | null;
    chars?: number;
  }[];
  facts: number;
  ledger: boolean;
  review_document: boolean;
  truncated: string[];
  chars: number;
};

export type AiRun = {
  id: string;
  action: string;
  label: string;
  status: RunStatus;
  params: Record<string, unknown>;
  manifest: Manifest;
  manifest_sha256: string;
  output: string | null;
  error: string | null;
  created_at: string;
};

export type AiState = {
  ai_allowed: boolean;
  lane: Lane;
  runs: AiRun[];
  actions: Record<string, string>;
};

export type LawSource = {
  id: string;
  title: string;
  url: string | null;
  law_ref: string | null;
  version_note: string | null;
  verified: boolean;
  added_by: "owner" | "ai";
};

export type CaseExport = {
  at: string;
  format: string;
  sha256: string;
  bytes: number;
  file: string;
  name: string;
};

export type SheetRow = {
  sheet: string;
  row: number;
  cells: Record<string, string>;
  matching_cells: string[];
  reasons: string[];
  blocked: boolean;
};

export type SheetReview = {
  id: string;
  state: string;
  revision: number;
  error: string | null;
  derived_id: string | null;
  progress_cells: number;
  proposal: { rows: SheetRow[]; excluded: number } | null;
};

export type LegalReview = {
  id: string;
  status: string;
  manifest_sha256: string;
  error: string | null;
  manifest: {
    messages: number;
    omitted_messages: number;
    sources: number;
    routing_chain: { model: string; effort: string }[];
    cases: { ref: string }[];
    warnings: string[];
  };
  output: { analysis: string; reply: string; gaps: string[] } | null;
};

export type ProcedureDefinition = {
  outcome: string;
  inputs: Record<string, { type: string; example: string | number; required: boolean }>;
  preconditions?: string[];
  plan: { steps: ({ type: string; purpose?: string } & Record<string, unknown>)[]; completion_criteria: string[] };
  trigger: {
    type: string;
    timezone?: string;
    time?: string;
    weekdays?: number[];
    inputs?: Record<string, unknown>;
    bindings?: Record<string, string>;
    document_type?: string | null;
  };
  limits: { deadline_seconds?: number; max_attempts?: number };
};

export type ProcedureRun = {
  id: string;
  version: number;
  state: string;
  reason?: string;
  created_at: string;
  progress?: { reason?: string };
  steps?: { id: string; type: string; state: string; blocked_reason?: string }[];
};

export type Procedure = {
  id: string;
  title: string;
  version: number;
  state: string;
  next_at?: string;
  outcome?: string;
  definition: ProcedureDefinition;
  runs: ProcedureRun[];
  versions: { version: number; created_at: string }[];
  readiness_reason?: string;
  trigger_error?: string;
};

export type RunReconcile = {
  steps_total: number;
  steps_done: number;
  partial: boolean;
  uncertain: boolean;
  can_resume: boolean;
  resume_blocker?: string;
};

export type Tone = "ok" | "run" | "warn" | "bad" | "off";

export const STATUS_TONE: Record<CaseStatus, Tone> = {
  open: "run",
  waiting_docs: "warn",
  attention: "bad",
  resolved: "ok",
  archived: "off",
};
export const COVERAGE_TONE: Record<Coverage, Tone> = { high: "ok", medium: "warn", low: "off" };
export const RUN_TONE: Record<RunStatus, Tone> = {
  awaiting_consent: "warn",
  queued: "run",
  waiting_quota: "off",
  running: "run",
  done: "ok",
  failed: "bad",
  cancelled: "off",
};
export const OBLIGATION_TONE: Record<Obligation["status"], Tone> = {
  paid: "ok",
  partial: "warn",
  open: "bad",
  future: "off",
  disputed: "warn",
};
export const FACT_TONE: Record<FactStatus, Tone> = {
  confirmed: "ok",
  extracted: "warn",
  owner: "run",
  ai_inference: "off",
  disputed: "bad",
};

/** List filters, as NSVX's tabs map them to its `status` query. */
export const CASE_VIEWS = ["all", "suggestions", "active", "resolved", "archived"] as const;
export type CaseView = (typeof CASE_VIEWS)[number];
export const CASE_SECTIONS = [
  "summary",
  "timeline",
  "evidence",
  "money",
  "documents",
  "ai",
  "deadlines",
  "history",
] as const;
export type CaseSection = (typeof CASE_SECTIONS)[number];

export function isZero(value: string | null | undefined): boolean {
  return !value || Number(value) === 0;
}

export function eur(value: string | number | null | undefined, locale: string): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(number)
    : "—";
}

/** A calendar date stays on its own day; timestamps show the Lisbon day, as NSVX does. */
export function shortDay(iso: string | null | undefined, locale: string): string {
  if (!iso) {
    return "—";
  }
  const plain = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const at = new Date(plain ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(at.getTime())
    ? "—"
    : at.toLocaleDateString(locale, {
        timeZone: plain ? "UTC" : "Europe/Lisbon",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
}

export function shortStamp(iso: string | null | undefined, locale: string): string {
  const at = iso ? new Date(iso) : undefined;
  return !at || Number.isNaN(at.getTime())
    ? "—"
    : at.toLocaleString(locale, {
        timeZone: "Europe/Lisbon",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

/** Whole days from today (Lisbon) to a date: negative is past. */
export function daysUntil(iso: string, now = new Date()): number {
  const today = now.toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" });
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function dueTone(deadline: { due_date: string | null; status?: string }, now = new Date()): Tone {
  if (deadline.status && deadline.status !== "open") {
    return "off";
  }
  if (!deadline.due_date) {
    return "warn";
  }
  const days = daysUntil(deadline.due_date, now);
  return days < 0 ? "bad" : days <= 7 ? "warn" : "ok";
}

export function foldText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function filterCases(
  rows: CaseRow[],
  filter: { query: string; category: string; attention: boolean },
): CaseRow[] {
  const needle = foldText(filter.query);
  return rows.filter(
    (row) =>
      (!needle || foldText(`${row.ref} ${row.title} ${row.respondent ?? ""}`).includes(needle)) &&
      (!filter.category || row.categories.includes(filter.category)) &&
      (!filter.attention ||
        row.status === "attention" ||
        row.status === "waiting_docs" ||
        row.evidence_attention > 0),
  );
}

export function splitSuggestions(rows: Suggestion[]) {
  const isOpen = (row: Suggestion) => ["new", "reviewing", "confirmed"].includes(row.status);
  return { open: rows.filter(isOpen), closed: rows.filter((row) => !isOpen(row)) };
}

export function proofNeedsLook(row: Evidence): boolean {
  return (
    ["ocr_low", "needs_ocr", "inaccessible", "screened_out"].includes(row.extraction_state) ||
    ["changed", "removed", "inaccessible"].includes(row.source_state)
  );
}

/** A page image is worth asking for only if NSVX can still read the source. */
export function proofHasPages(row: Evidence): boolean {
  return (
    row.previewable &&
    row.source_state !== "removed" &&
    row.source_state !== "inaccessible" &&
    row.extraction_state !== "inaccessible"
  );
}

/** Links from case data open only on the web; never a script or local address. */
export function safeUrl(url: string | null | undefined): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

/** Sheet rows NSVX offers as safe to pick all at once (`SheetSplitter.tsx`). */
const SAFE_REASONS = new Set([
  "name_only",
  "confirmed_identifier",
  "formula_excluded",
  "shared_vehicle",
  "identifier_only",
]);
export function sheetPickable(rows: SheetRow[]): SheetRow[] {
  return rows.filter((row) => !row.blocked && row.reasons.every((why) => SAFE_REASONS.has(why)));
}

export function fileToBase64(file: File): Promise<string> {
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let at = 0; at < bytes.length; at += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
    }
    return btoa(binary);
  });
}
