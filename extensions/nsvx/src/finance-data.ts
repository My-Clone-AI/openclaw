/** Field names follow the NSVX finance screens (`web/src/logic/finance.ts`, `financeDocs.ts`, `accounting.ts`). */

/** NSVX keeps amounts as decimal strings; null means unknown, never zero. */
export type Amount = string | null;

export type Area = "personal" | "eni" | "company";
export const AREAS: Area[] = ["personal", "eni", "company"];

/** The NSVX area switch: ENI shares the owner's entity, Fortune Comet is its own. */
export function areaQuery(area: Area) {
  return { entity: area === "company" ? "fortune_comet" : "owner", scope: area };
}

/** Accounting books exist for ENI and the company only; the personal area reads the ENI book. */
export function bookOf(area: Area) {
  return area === "company" ? "company" : "eni";
}

export function money(amount: Amount | undefined, currency = "EUR", locale?: string): string {
  if (amount === null || amount === undefined || amount === "") {
    return "—";
  }
  const value = Number(amount);
  if (!Number.isFinite(value)) {
    return "—";
  }
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function isNegative(amount: Amount | undefined) {
  return typeof amount === "string" && amount.trim().startsWith("-");
}

/** Whole days from today (local calendar) to an ISO date; null when unknown. */
export function daysUntil(iso: string | null | undefined, today = new Date()): number | null {
  if (!iso) {
    return null;
  }
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) {
    return null;
  }
  const at = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((at - now) / 86_400_000);
}

export function shortDate(iso: string | null | undefined, locale?: string): string {
  if (!iso) {
    return "—";
  }
  const at = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(at.getTime())
    ? iso
    : at.toLocaleDateString(locale, { day: "2-digit", month: "short" });
}

export type Balance = { kind: "booked" | "available"; amount: string; currency: string };
export type Account = {
  id: string;
  label: string;
  name?: string | null;
  alias_of: string | null;
  masked_id: string | null;
  entity: string | null;
  scope: string | null;
  connection: string | null;
  type: string | null;
  balances: Balance[];
  state: "read" | "unknown";
  placeholder?: boolean;
};
export type Accounts = { accounts: Account[] };

export type Connection = {
  code: string;
  bank: string;
  label: string;
  state: string;
  detail: string | null;
  last_success_at: string | null;
  consent_expires_at?: string | null;
};

export type Card = {
  id: string | null;
  label: string;
  kind: "debit" | "credit";
  network: string;
  last4: string | null;
  account: string | null;
  connection: string | null;
  owner: string | null;
  credit_limit: string | null;
  used?: string | null;
  currency: string | null;
};

export type BankTransaction = {
  id: string;
  account: string;
  connection: string | null;
  scope: string | null;
  status: "booked" | "pending";
  booking_date: string | null;
  value_date: string | null;
  amount: string;
  currency: string;
  description: string | null;
  counterparty: string | null;
};

export type Capability = {
  code: string;
  label: string;
  connection_state: string;
  operations: { operation: string; state: "available" | "blocked"; blocker: string | null }[];
};

export type BankTask = {
  id: string;
  operation: string;
  state: string;
  blocker: string | null;
  created_at: string;
};

export type Obligation = {
  id: string;
  scope: string;
  tax: string;
  kind: "filing" | "payment" | "declaration";
  period: string;
  title: string;
  effective_due: string | null;
  certainty: string;
  status: string;
};

export type Dashboard = {
  summary: { totals: Record<string, Record<string, string>>; months_covered: string[] };
  regimes: Record<string, { regime: string } | null>;
  balances: {
    totals: { kind: string; currency: string; amount: string }[];
    accounts_read: number;
    accounts_total: number;
  };
  efatura_totals?: {
    purchases: string;
    purchases_count: number;
    sales: string;
    sales_count: number;
  } | null;
  obligations: Obligation[];
  overdue: number;
  alerts: { id: string; title: string; effective_due: string | null }[];
};

export type Invoice = {
  id: string;
  counterparty_name: string | null;
  doc_type: string;
  number: string;
  issued_on: string;
  total: string | null;
  vat: string | null;
};

export type Invoices = { invoices: Invoice[]; next: string | null };

export type MonthState = "available" | "pending" | "missing" | "future";

export type DocsOverview = {
  statements: { account: string; label: string; months: number[]; missing: number[] }[];
  saft: { source: string; label: string; months: number[]; missing: number[] }[];
  invoices: { quarter: number; total: number; classified: number; pending: number }[];
  unclassified: number;
  duplicates: number;
  last_sync: null | { at: string };
};

export type FinanceDoc = {
  id: string;
  name: string;
  mime: string | null;
  category_label: string | null;
  kind_label: string | null;
  counterparty: string | null;
  total: string | null;
  issued_on: string | null;
  year: number | null;
  month: number | null;
  source_label: string;
  unclassified: boolean;
  duplicate: boolean;
  location?: { labels: string[] };
};

export type Folder = { key: string; label: string; count: number; ok?: number };

export type Browse = {
  path: string;
  crumbs: { label: string; path: string }[];
  folders: Folder[];
  documents: FinanceDoc[];
  more: boolean;
};

export type DocSearch = { documents: FinanceDoc[]; more: boolean };

export type Preview = {
  kind: "pdf" | "image" | "xml" | "csv" | "xlsx" | "text" | "other";
  mime: string;
  pages?: number;
  rows?: string[][];
  text?: string;
  error?: string;
};

export type LedgerKpi =
  | "revenue"
  | "fse"
  | "ebitda"
  | "net"
  | "cash"
  | "assets"
  | "liabilities"
  | "equity"
  | "tax";

export type LedgerOverview = {
  built: boolean;
  status?: string;
  projection?: boolean;
  calculated_at?: string;
  kpis?: Partial<Record<LedgerKpi, Amount>>;
  balanced?: boolean;
  coverage?: { pct_confirmed: number | string | null; needs_review: number; documents: number };
  open_discrepancies?: number;
  monthly?: { receitas?: { months: Amount[] } };
};

export type LedgerEntry = {
  id: string;
  entry_date: string;
  description: string | null;
  origin: string;
  lines: {
    line_no: number;
    account_code: string;
    account_name: string | null;
    debit: Amount;
    credit: Amount;
  }[];
};

export type Journal = { total: number; entries: LedgerEntry[] };

export type ReviewTx = {
  id: string;
  occurred_on: string | null;
  description: string | null;
  counterparty: string | null;
  gross: Amount;
  classification: { issues?: string[] } | null;
};

export type Review = { total: number; transactions: ReviewTx[] };

export type IncomeStatement = {
  report: { lines: { code: string; label: string; value: Amount; total?: boolean }[] } | null;
};

/** Twelve month cells: which months have a file, which are missing, which have not happened yet. */
export function monthGrid(
  row: { months: number[]; missing: number[] },
  year: number,
  today = new Date(),
): MonthState[] {
  const have = new Set(row.months);
  const missing = new Set(row.missing);
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    if (have.has(month)) {
      return "available";
    }
    if (
      year > today.getFullYear() ||
      (year === today.getFullYear() && month > today.getMonth() + 1)
    ) {
      return "future";
    }
    return missing.has(month) ? "missing" : "pending";
  });
}

/** Booked balance per account, the bank's own number; unknown stays unknown. */
export function bookedBalance(account: Account): Balance | undefined {
  return (
    account.balances.find((balance) => balance.kind === "booked") ??
    account.balances.find((balance) => balance.kind === "available")
  );
}

/** Real accounts first: aliases and seeded placeholders without data are NSVX bookkeeping, not money. */
export function visibleAccounts(accounts: Account[]) {
  return accounts.filter((account) => !account.alias_of && !account.placeholder);
}

/** Sum of booked EUR balances; null when no account has been read. */
export function totalBooked(accounts: Account[]): string | null {
  let total = 0;
  let read = false;
  for (const account of visibleAccounts(accounts)) {
    const balance = bookedBalance(account);
    if (balance && balance.currency === "EUR" && (account.type ?? "").toUpperCase() !== "CARD") {
      total += Number(balance.amount);
      read = true;
    }
  }
  return read ? total.toFixed(2) : null;
}

/** Share of the credit limit in use, 0..100; null when NSVX has no limit or no use. */
export function cardUsedPercent(card: Pick<Card, "used" | "credit_limit">): number | null {
  const used = Number(card.used);
  const limit = Number(card.credit_limit);
  if (!card.used || !card.credit_limit || !Number.isFinite(used) || !(limit > 0)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round((Math.abs(used) / limit) * 100)));
}

/** Connection state as one of four tones, mirroring CONN_STATE in NSVX. */
export function connectionTone(state: string): "ok" | "warn" | "bad" | "run" | "off" {
  switch (state) {
    case "fresh":
      return "ok";
    case "partial":
    case "stale":
    case "awaiting_user":
    case "expired":
      return "warn";
    case "failed":
    case "blocked":
      return "bad";
    case "authorizing":
    case "confirming":
    case "queued":
    case "reading":
      return "run";
    default:
      return "off";
  }
}

/** Obligation tone: overdue or unconfirmed first, then due soon, then done. */
export function obligationTone(obligation: Obligation, today = new Date()) {
  if (["entregue", "pago", "cancelled", "not_applicable"].includes(obligation.status)) {
    return "ok";
  }
  const days = daysUntil(obligation.effective_due, today);
  if (obligation.status === "overdue" || obligation.status === "sem_comprovativo") {
    return "bad";
  }
  if (days !== null && days < 0) {
    return "bad";
  }
  return days !== null && days <= 14 ? "warn" : "run";
}

/** Brand colors for Portuguese banks, from NSVX `BANK_MARK`, with WCAG AA text on each. */
export const BANK_MARK: Record<string, { text: string; bg: string; fg: string }> = {
  santander: { text: "S", bg: "#EC0000", fg: "#fff" },
  novobanco: { text: "nb", bg: "#00A19A", fg: "#062e2b" },
  cgd: { text: "CGD", bg: "#0071BC", fg: "#fff" },
  millennium: { text: "M", bg: "#C8005A", fg: "#fff" },
  bpi: { text: "BPI", bg: "#F26522", fg: "#1a1a1a" },
  activobank: { text: "A", bg: "#7AB800", fg: "#10240a" },
  montepio: { text: "M", bg: "#00205B", fg: "#fff" },
  creditoagricola: { text: "CA", bg: "#006B3F", fg: "#fff" },
  bancoctt: { text: "CTT", bg: "#D6001C", fg: "#fff" },
  abanca: { text: "A", bg: "#009FE3", fg: "#05263a" },
  bankinter: { text: "BK", bg: "#FF6600", fg: "#1a1a1a" },
};

export function bankMark(code: string | null | undefined, label = "") {
  const bank = (code ?? "").split("_")[0] ?? "";
  return (
    BANK_MARK[bank] ?? {
      text: (label || bank || "?").slice(0, 2).toUpperCase(),
      bg: "var(--surface-selected)",
      fg: "var(--text-strong)",
    }
  );
}
