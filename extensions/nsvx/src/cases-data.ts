/**
 * NSVX Processos (`/api/cases`) shapes and pure helpers, shared by the Cases tab and the `nsvx_cases` tool.
 * Amounts arrive as decimal strings ("1234.50"); an unknown amount or date is null, never 0.
 */

export type CaseStatus = "open" | "waiting_docs" | "attention" | "resolved" | "archived";
export type Tone = "ok" | "warn" | "bad" | "busy" | "off";

export type CaseRow = {
  id: string;
  ref: string;
  title: string;
  status: CaseStatus;
  nature: "potential" | "formal";
  priority: string;
  categories: string[];
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

export type Party = { id: string; role: string; name: string; kind: string; contact: string | null };
export type Fact = {
  id: string;
  text: string;
  status: string;
  disputed: boolean;
  codes: string[];
  created_at: string;
};

export type CaseDetail = CaseRow & {
  description: string | null;
  issue: string | null;
  notes: string | null;
  court: string | null;
  external_ref: string | null;
  revision: number;
  created_at: string;
  parties: Party[];
  facts: Fact[];
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
    case_title: string;
    title: string;
    kind: string;
    due_date: string | null;
    verified: boolean;
  }[];
  documents_pending: { id: string; title: string; version: number; status: string; ref: string }[];
  cases: CaseRow[];
  discovery: { last_run: string | null; status: string | null };
};

export type Vocab = {
  categories: Record<string, { group: string; label: string }>;
  priority: Record<string, string>;
  party_roles: Record<string, string>;
  ai_actions: Record<string, string>;
  official_sources: { name: string; url: string }[];
  disclaimer: string;
};

export type Suggestion = {
  id: string;
  title: string;
  categories: string[];
  counterparty: string | null;
  context: string | null;
  status: "new" | "reviewing" | "confirmed" | "rejected" | "converted";
  coverage: "high" | "medium" | "low";
  case_id: string | null;
  reasons: { kind: string; text: string }[];
  missing: string[];
  evidence: { drive_file_id: string; name: string; read: string }[];
  metrics: {
    outstanding?: { amount: string; estimate: boolean };
    last_payment?: { date: string };
    oldest_unpaid?: { date: string; days: number };
    months_unpaid?: number | null;
  };
};

export type Suggestions = {
  suggestions: Suggestion[];
  last_run: { at: string; status: string } | null;
  bank_coverage: { accounts_total: number; accounts_read: number; note: string };
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

export type TimelineEvent = {
  id: string;
  date: string | null;
  title: string;
  kind: string;
  status: string;
  codes: string[];
  auto: boolean;
};

export type Proof = {
  id: string;
  code: string | null;
  name: string;
  type: string;
  mime: string | null;
  size: number | null;
  doc_date: string | null;
  pages: number | null;
  extraction_state: string;
  source_state: string;
  previewable: boolean;
  privileged: boolean;
};

export type Ledger = {
  obligations: {
    id: string;
    description: string;
    due_date: string | null;
    amount: string;
    paid: string;
    outstanding: string;
    status: "paid" | "partial" | "open" | "future" | "disputed";
  }[];
  totals: {
    expected: string;
    received_verified: string;
    verified_outstanding: string;
    estimated_outstanding: string;
  };
  oldest_overdue_days: number | null;
};

export type Note = {
  id: string;
  title: string;
  url: string | null;
  source: string | null;
  law_ref: string | null;
  excerpt: string | null;
  verified: boolean;
  added_by: "owner" | "ai";
};

export type CaseDocument = {
  id: string;
  title: string;
  version: number;
  status: "draft" | "reviewed" | "approved" | "signed" | "sent";
  origin: string;
  body?: string;
};

export type AiRun = {
  id: string;
  action: string;
  label: string;
  status: string;
  manifest: {
    model: string;
    destination?: string;
    items: { code?: string; name: string; included: boolean }[];
    chars: number;
  };
  manifest_sha256: string;
  output: string | null;
  error: string | null;
  created_at: string;
};

export type AiLane = { label: string; eligible: boolean; status: string; billing: string };

export type Procedure = {
  id: string;
  title: string;
  version: number;
  state: string;
  outcome?: string;
  next_at?: string | null;
  readiness_reason?: string | null;
  definition?: {
    outcome: string;
    inputs: Record<string, { type: string; example: string | number; required: boolean }>;
    plan: { steps: { type?: string; purpose?: string }[] };
    trigger: { type: string };
  };
  runs?: { id: string; state: string; version: number; reason?: string | null; created_at: string }[];
};

export const CASE_STATUSES = ["open", "waiting_docs", "attention", "resolved", "archived"] as const;
export const DEADLINE_KINDS = ["legal_deadline", "task", "reminder"] as const;
export const DOC_STATUSES = ["draft", "reviewed", "approved", "signed", "sent"] as const;

export const CASE_FILTERS = ["all", "active", "resolved", "archived"] as const;
export type CaseFilter = (typeof CASE_FILTERS)[number];

export const ACTIVE = new Set<CaseStatus>(["open", "waiting_docs", "attention"]);

export const STATUS_TONE: Record<CaseStatus, Tone> = {
  open: "busy",
  waiting_docs: "warn",
  attention: "bad",
  resolved: "ok",
  archived: "off",
};

/** NSVX's own AI action ids, each with the glyph its screen shows. */
export const AI_ICON: Record<string, string> = {
  analisar: "find",
  resumir_provas: "doc",
  cronologia: "history",
  em_falta: "alert",
  divida: "money",
  legislacao: "legal",
  criar_documento: "edit",
  rever_minuta: "done",
  advogado: "user",
  responder: "mail",
};

export function filterCases(rows: CaseRow[], filter: CaseFilter, query: string): CaseRow[] {
  const needle = fold(query);
  return rows.filter(
    (row) =>
      (filter === "all" ||
        (filter === "active" ? ACTIVE.has(row.status) : row.status === filter)) &&
      (!needle || fold(`${row.ref} ${row.title} ${row.respondent ?? ""}`).includes(needle)),
  );
}

export function fold(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Open first (new, reviewing, confirmed), then the closed ones. */
export function splitSuggestions(rows: Suggestion[]) {
  const open = rows.filter((s) => ["new", "reviewing", "confirmed"].includes(s.status));
  return { open, closed: rows.filter((s) => !open.includes(s)) };
}

export function isZero(value: string | null | undefined): boolean {
  return !value || Number(value) === 0;
}

export function money(locale: string, value: string | null | undefined): string {
  const n = value === null || value === undefined || value === "" ? Number.NaN : Number(value);
  return Number.isFinite(n)
    ? new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(n)
    : "—";
}

/** Whole days from today (Lisbon, as NSVX counts) to a YYYY-MM-DD date; negative is past. */
export function daysUntil(date: string, now = new Date()): number {
  const today = now.toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" });
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function deadlineTone(deadline: Pick<Deadline, "due_date" | "status">, now = new Date()): Tone {
  if (deadline.status !== "open") {
    return "off";
  }
  if (!deadline.due_date) {
    return "warn";
  }
  const days = daysUntil(deadline.due_date, now);
  return days < 0 ? "bad" : days <= 7 ? "warn" : "ok";
}

/** "05/11/2026" for a day, in the viewer's locale; never invents a date. */
export function dayLabel(locale: string, value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const at = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  return Number.isNaN(at.getTime())
    ? "—"
    : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Europe/Lisbon" }).format(at);
}

/** A case summary for chat: what the owner would see on the card. */
export function caseCard(row: CaseRow) {
  return {
    ref: row.ref,
    title: row.title,
    status: row.status,
    priority: row.priority,
    counterparty: row.respondent,
    owedDocumented: row.verified_principal,
    owedWithEstimates: row.outstanding,
    proofs: row.evidence,
    proofsNeedingCare: row.evidence_attention,
    nextDeadline: row.next_deadline,
    deadlinesToConfirm: row.deadlines_unconfirmed,
  };
}
