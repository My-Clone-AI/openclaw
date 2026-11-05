/**
 * Business and home services (NSVX Empresarial, Encomendas, Serviços da casa, Garantias): shapes NSVX sends and
 * the pure helpers the tab, the Gateway methods, and the chat tool share. No server imports: the browser bundle
 * loads this file.
 */

/** Fortune Comet suppliers whose invoices NSVX collects each quarter. */
export const SUPPLIERS = ["viaverde", "prio", "bolt", "fidelidade"] as const;
export const HOME_SERVICES = ["nos", "endesa"] as const;
export const SHOPS = ["glovo", "amazon"] as const;
export type Supplier = (typeof SUPPLIERS)[number];
export type Provider = Supplier | (typeof HOME_SERVICES)[number] | (typeof SHOPS)[number];
export const PROVIDERS: readonly Provider[] = [...SUPPLIERS, ...HOME_SERVICES, ...SHOPS];

export const PROVIDER_NAMES: Record<Provider, string> = {
  viaverde: "Via Verde",
  prio: "Prio",
  bolt: "Bolt",
  fidelidade: "Fidelidade",
  nos: "NOS",
  endesa: "Endesa",
  glovo: "Glovo",
  amazon: "Amazon ES",
};

/** Brand colors for the provider marks (initial on the brand color). */
export const PROVIDER_COLORS: Record<Provider, string> = {
  viaverde: "#00a651",
  prio: "#f39200",
  bolt: "#34d186",
  fidelidade: "#e30613",
  nos: "#1d1d1b",
  endesa: "#00a0e1",
  glovo: "#ffc244",
  amazon: "#ff9900",
};

/**
 * What the owner can do for each provider, matching its NSVX screen: `connect` checks or opens the saved sign-in,
 * `session` shows the provider's sign-in page (clickable when `input`), `code` takes a phone code.
 */
export const PROVIDER_OPS: Record<Provider, readonly ProviderOp[]> = {
  viaverde: ["credentials", "session", "input", "quarter"],
  prio: ["credentials", "connect", "login", "view", "quarter"],
  bolt: ["credentials", "connect", "code", "view", "quarter"],
  fidelidade: ["credentials", "connect", "session", "input", "quarter"],
  nos: ["credentials", "accounts", "view", "quarter"],
  endesa: ["credentials", "installations", "prepare-login", "view", "input", "quarter"],
  glovo: ["credentials", "login", "code", "recipient", "view", "quarter"],
  amazon: ["credentials", "login", "history"],
};
export type ProviderOp =
  | "credentials"
  | "connect"
  | "login"
  | "session"
  | "view"
  | "input"
  | "code"
  | "accounts"
  | "installations"
  | "prepare-login"
  | "recipient"
  | "history"
  | "quarter";

export const LOGIN_KEYS = [
  "Enter",
  "Tab",
  "Shift+Tab",
  "Escape",
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
] as const;

export type RunItem = {
  state?: string;
  number?: string;
  filename?: string;
  account?: string;
  association?: string;
  month?: number;
  issued_on?: string;
  drive_file_id?: string;
  detail?: string;
};
export type Run = {
  id?: string;
  state: string;
  year?: number;
  quarter?: number;
  detail?: string;
  confirmation?: string;
  installation?: string;
  expected_items?: number;
  updated_at?: string;
  items?: Record<string, RunItem>;
};
/** The union of the eight NSVX status answers; each provider fills its own fields. */
export type ProviderStatus = {
  configured?: boolean;
  drive_saved?: boolean;
  document_shared?: boolean;
  document_verified?: boolean;
  run?: Run | null;
  runs?: Run[];
  accounts?: ({ association: string; label: string } | string)[];
  installations?: { id: string; label: string }[];
  gmail?: { required: boolean; ready: boolean };
  recipient?: string;
  login_state?: string | null;
  login_detail?: string | null;
  challenge?: { failed_attempts: number; needs_owner: boolean } | null;
  history?: AmazonHistory | null;
};
export type AmazonOrder = { id: string; text: string; images?: { title: string; url: string }[] };
export type AmazonHistory = {
  orders: AmazonOrder[];
  year: number;
  start: number;
  next: boolean;
  observed_at: number;
};
export type ReturnDraft = {
  id: string;
  order_id: string;
  state: string;
  confirmation: string;
  refund: string;
  updated_at: number;
};
export type SessionView = { image?: string; ready?: boolean; state?: string; detail?: string };

export type Tone = "ok" | "warn" | "bad" | "busy" | "off";

export const BUSY_RUN = new Set(["queued", "running"]);

/** One status light per provider: signed in and last run, as the NSVX chips show them. */
export function providerTone(provider: Provider, status: ProviderStatus | undefined): Tone {
  if (!status) {
    return "off";
  }
  const run = status.run ?? null;
  if (run && BUSY_RUN.has(run.state)) {
    return "busy";
  }
  if (provider === "glovo" && status.login_state) {
    return status.login_state === "ready"
      ? "ok"
      : status.login_state === "blocked_external"
        ? "bad"
        : "warn";
  }
  if (!status.configured || (status.gmail?.required && !status.gmail.ready)) {
    return "warn";
  }
  if (run && (run.state === "blocked" || run.state === "partial")) {
    return "warn";
  }
  return "ok";
}

export function runItems(run: Run | null | undefined): [string, RunItem][] {
  return Object.entries(run?.items ?? {});
}

/** Collected documents: items without a state are filed ones (Via Verde, Prio, Endesa list only those). */
export function runDone(run: Run | null | undefined): number {
  return runItems(run).filter(([, item]) => !item.state || item.state === "completed").length;
}

export function currentQuarter(now = new Date()) {
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

/** A past or current quarter, as NSVX accepts it (Via Verde keeps invoices from 2014). */
export function quarterOpen(year: number, quarter: number, now = new Date(), from = 2000) {
  const at = currentQuarter(now);
  return (
    Number.isInteger(year) &&
    year >= from &&
    (year < at.year || (year === at.year && quarter <= at.quarter))
  );
}

export function accountRows(status: ProviderStatus) {
  return (status.accounts ?? []).map((a) =>
    typeof a === "string" ? { association: a, label: a } : a,
  );
}

/** Cross-supplier quarter collection (NSVX Recolha trimestral). */
export const WORKFLOW_PROVIDERS = ["bolt", "fidelidade", "prio", "viaverde"] as const;
export type WorkflowStep = {
  state: string;
  detail?: string;
  items: number;
  verified_at?: string | null;
};
export type Workflow = {
  id: string;
  year: number;
  quarter: number;
  providers: string[];
  state: string;
  detail?: string;
  steps: Record<string, WorkflowStep>;
  updated_at?: string;
};
/** Only stopped work can resume; NSVX repeats only unverified steps. */
export const canResume = (state: string) => ["partial", "uncertain", "blocked"].includes(state);

/** Meter readings (NSVX Leituras): photo, check, then one confirmed send. */
export type Register = {
  code: string;
  display: string;
  decimal: "comma" | "dot" | "integer" | "unknown";
  unit: "kWh" | "m3" | "unknown";
  certain: boolean;
  code_certain: boolean;
  unit_certain: boolean;
  decimal_certain: boolean;
};
export type MeterDraft = {
  provider: string;
  serial: string | null;
  serial_certain: boolean;
  installation_id: string | null;
  supply_id: string | null;
  reading_date: string | null;
  date_certain: boolean;
  registers: Register[];
  issues: string[];
  identity_confirmed: boolean;
  date_confirmed: boolean;
  values_confirmed: boolean;
};
export type Reading = {
  id: string;
  revision: number;
  state: string;
  draft: Partial<MeterDraft>;
  sha256: string;
  flags: { code: string; text: string; blocking: boolean }[];
  created_at: string;
  archived_at: string | null;
  confirmation: null | {
    binding: string;
    expires: string;
    summary: {
      provider: string;
      installation_id: string;
      date: string;
      registers: { code: string; value: string; unit: string }[];
    };
  };
  receipt: null | { reference?: string; observed_at: string };
};
export type Readings = {
  readings: Reading[];
  installations: { id: string; label: string; provider: string }[];
  providers: { id: string; label: string; supported: boolean; reason: string }[];
};
export const READING_BUSY = new Set(["extraction", "preparation", "submission", "verification"]);
export const READING_LOCKED = new Set([
  ...READING_BUSY,
  "uncertain",
  "accepted",
  "rejected",
  "cancelled",
]);
export const READING_OPS = ["prepare", "reconcile", "cancel", "retry"] as const;
export const blankDraft = (): MeterDraft => ({
  provider: "endesa",
  serial: null,
  serial_certain: false,
  installation_id: null,
  supply_id: null,
  reading_date: null,
  date_certain: false,
  registers: [],
  issues: [],
  identity_confirmed: false,
  date_confirmed: false,
  values_confirmed: false,
});
export const blankRegister = (): Register => ({
  code: "",
  display: "",
  unit: "unknown",
  decimal: "unknown",
  certain: false,
  code_certain: false,
  unit_certain: false,
  decimal_certain: false,
});
export const readingReady = (draft: MeterDraft) =>
  Boolean(draft.installation_id && draft.reading_date && draft.registers.length > 0);

/** Warranty claims (NSVX Garantias): bill and fault in, a draft packet out; never sent. */
export type Fact = { field: string; value: string; source: string; quote: string; page: number | null };
export type Packet = {
  id?: string;
  sha256?: string;
  revision: number;
  letter: string;
  fields: Record<string, { value: string | null; sources: Fact[]; conflict: boolean }>;
  terms: Fact[];
  products: string[];
  product: string;
  unresolved: string[];
  evidence: { id: string; name: string; mime: string; sha256: string }[];
  choices?: { id: string; name: string; reason: string }[];
};
export type Claim = {
  id: string;
  revision: number;
  state: string;
  stage: string;
  fault: string;
  product: string;
  document_ids: string[];
  preview: Packet | null;
  packet: Packet | null;
  error: string | null;
};
export type ClaimRow = { id: string; state: string; revision: number; product: string };
export type Purchase = { id: string; original_name: string; mime: string };
export const CLAIM_STAGES = [
  "intake",
  "extract",
  "find evidence",
  "match",
  "extract terms",
  "assemble",
  "review",
] as const;
export const CLAIM_FIELDS = [
  "product",
  "brand",
  "model",
  "serial",
  "seller",
  "order",
  "invoice",
  "purchase_date",
  "delivery_date",
  "amount",
  "currency",
  "purchaser",
  "contact",
] as const;
export const claimActive = (state: string) => state === "queued" || state === "processing";
export const claimReviewable = (claim: Claim) =>
  ["ready", "reviewed"].includes(claim.state) &&
  Boolean(claim.packet?.id) &&
  claim.packet?.revision === claim.revision;
export const UPLOAD_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
/** NSVX meter photos stop at 8 MB; warranty files fit the same Gateway frame. */
export const UPLOAD_LIMIT = 8 * 1024 * 1024;

/** Business action grants (NSVX Empresas do grupo, Autorizações). */
export type Grant = {
  id: string;
  app: string;
  action: string;
  state: string;
  expires_at: string | null;
  user_ref?: string | null;
  tenant?: string | null;
  single_use?: boolean;
};
export type Denial = { at: string; reason: string | null; explanation: string };

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Every word must appear in the grant's id, app, action, holder, tenant, or state. */
export function filterGrants<G extends Grant>(grants: readonly G[], query: string): G[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return grants.filter((grant) => {
    const text = fold(
      [grant.id, grant.app, grant.action, grant.user_ref ?? "", grant.tenant ?? "", grant.state].join(
        " ",
      ),
    );
    return words.every((word) => text.includes(word));
  });
}

/** Whole days left, rounded up; under a week is a warning. */
export function grantExpiry(expiresAt: string | null, now = Date.now()) {
  const at = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (!Number.isFinite(at)) {
    return null;
  }
  return {
    expired: at <= now,
    days: Math.max(0, Math.ceil((at - now) / 86_400_000)),
    warning: at - now <= 7 * 86_400_000,
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validDay = (value: string) =>
  DAY.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
