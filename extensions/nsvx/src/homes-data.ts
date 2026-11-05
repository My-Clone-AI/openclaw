/**
 * Homes: the NSVX real-estate (`/imoveis`), rentals (`/arrendamento`), mortgage (`credito-habitacao`), and short-stay
 * (`/al`) answers, as their screens read them. NSVX sends money as decimal strings and unknown values as null.
 * Shared by the Gateway handlers, the chat tool, and the Control views (no server imports here).
 */

export type Money = string | null;
export type Tone = "ok" | "warn" | "bad" | "off" | "accent";

// Real estate (`/api/realestate`).
export type Kpis = {
  properties: number;
  units: number;
  occupancy: { total: number; rented: number; vacant: number; rented_pct: Money };
  rent_collected_month: Money;
  rent_expected_month: Money;
  cash_flow_month: Money;
  market_value: Money;
  debt: Money;
  equity: Money;
  ltv: Money;
};
export type SeriesMonth = {
  month: string;
  future: boolean;
  income: Money;
  expected: Money;
  cash_flow: Money;
};
export type Notice = {
  id: string;
  kind: string;
  severity: "info" | "warn" | "bad";
  title: string;
  body?: string | null;
  created_at: string;
  read_at?: string | null;
};
export type Overview = {
  kpis: Kpis;
  series: SeriesMonth[];
  alerts: Notice[];
  publishing: { live: number; failed: number; manual: number; unsynced: number };
  warnings: string[];
  empty: boolean;
};
export type PortfolioItem = {
  id: string;
  ref: string | null;
  name: string;
  kind: string;
  city: string | null;
  units: number;
  status: Record<string, number>;
  value: Money;
  debt: Money;
  equity: Money;
  rent_monthly: Money;
  cash_flow_12m: Money;
  gross_yield: Money;
  archived: boolean;
};
export type Unit = {
  id: string;
  name: string;
  property: string;
  city: string | null;
  status: UnitStatus;
  rent: Money;
  asking_rent: Money;
  tenant: string | null;
  lease_end: string | null;
  ads: number;
  ads_attention: number;
};
export const UNIT_STATUSES = [
  "rented",
  "vacant",
  "reserved",
  "renovation",
  "maintenance",
  "unavailable",
] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];
export type Charge = {
  id: string;
  period: string;
  due_date: string;
  amount: Money;
  paid: Money;
  outstanding: Money;
  status: "paid" | "partial" | "overdue" | "pending" | "waived";
  unit: string;
  tenant: string | null;
  property: string;
};
export type RentMonth = {
  month: string;
  items: Charge[];
  overdue: Charge[];
  summary: {
    expected: Money;
    collected: Money;
    outstanding: Money;
    overdue_total: Money;
    overdue_count: number;
  };
};

// Home hub (`/api/properties`).
export type HubCard = {
  id: string;
  name: string;
  kind: "apartment" | "house" | "other";
  address: string;
  city: string | null;
  usage: string;
  active_services: number;
  documents: number;
  unpaid: number;
  overdue: number;
  missing_essentials: number;
  monthly_estimate: Money;
  next_deadline: { kind: string; date: string; days: number; supplier: string | null } | null;
};
export type Hub = {
  properties: HubCard[];
  summary: {
    properties: number;
    active_services: number;
    monthly_estimate: Money;
    unpaid_invoices: number;
    unpaid_amount: Money;
    overdue_invoices: number;
    deadlines_90d: number;
    missing_documents: number;
  };
};
export type HubAlert = {
  id: string;
  kind: string;
  severity: "critical" | "warning" | "info";
  title: string;
  due_on: string | null;
  read_at: string | null;
  property_id: string | null;
  property_name: string | null;
};
/** `/api/properties/{id}`: the stored home row plus its services, bills, papers, contacts, and costs. */
export type HubProperty = {
  property: {
    id: string;
    name: string;
    kind: HubCard["kind"];
    address: string | null;
    postal_code: string | null;
    city: string | null;
    usage: string;
  };
  services: {
    id: string;
    category: string;
    supplier: string | null;
    status: string;
    monthly_cost: Money;
    contract: {
      state: "within" | "ending" | "ended" | "none" | "unconfirmed";
      days_left: number | null;
    };
  }[];
  invoices: {
    id: string;
    supplier: string | null;
    amount: Money;
    issued_on: string | null;
    due_on: string | null;
    state: "paid" | "unpaid" | "overdue" | "unconfirmed";
  }[];
  documents: {
    checklist: {
      category: string;
      label: string;
      essential: boolean;
      state: "missing" | "available" | "expiring" | "expired";
    }[];
  };
  official_contacts: { code: string; name: string; phone: string | null; emergency: boolean }[];
  contacts: {
    id: string;
    name: string;
    phone: string | null;
    category: string;
    emergency: boolean;
  }[];
  expenses: {
    id: string;
    category: (typeof EXPENSE_CATEGORIES)[number];
    description: string;
    amount: Money;
    spent_on: string;
    status: "paid" | "unpaid";
  }[];
  expense_summary: { estimated_monthly: Money; paid: Money; unpaid: Money } | null;
  alerts: HubAlert[];
};
export const EXPENSE_CATEGORIES = [
  "imi",
  "maintenance",
  "repairs",
  "condominium",
  "insurance",
  "other",
] as const;
export type AskAnswer = {
  intent: string;
  answer: string;
  items: { kind: string; label: string; detail?: string | null; tel?: string | null }[];
};

// Rentals (`/api/arrendamento`, `/api/rental-contracts`).
export type RentStatus = "waived" | "received" | "partial" | "overdue" | "expected";
export type RentBoard = {
  properties: { id: string; code: string; name: string }[];
  tenants: { id: string; name: string }[];
  contracts: {
    id: string;
    property_id: string;
    tenant_ids: string[];
    state: "draft" | "active" | "ended";
    terms: { rent?: string; due_day?: number; start?: string; end?: string | null };
  }[];
  payments: {
    id: string;
    amount: string;
    received_on: string;
    payer: string | null;
    reference: string | null;
  }[];
  receipts: { id: string; period: string; amount: string; state: string }[];
  matches: {
    id: string;
    payment_id: string;
    expected_id: string;
    amount: string;
    reversed_at: string | null;
  }[];
  expected: {
    id: string;
    contract_id: string;
    period: string;
    amount: string;
    due_on: string;
    outstanding: string;
    status: RentStatus;
  }[];
  summary: { month: string; received: string; outstanding: string; overdue: string };
  pending: { kind: string; target: string; amount?: string }[];
  issuance_enabled: boolean;
};
/** One ranked way a payment may pay rents (`arrendamento/matching.py` Candidate): `allocations[i]` pays `expected_ids[i]`. */
export type Suggestion = {
  expected_ids: string[];
  score: number;
  reasons: (
    | "exact"
    | "partial"
    | "tolerance"
    | "iban"
    | "payer"
    | "contract_reference"
    | "reference"
  )[];
  allocations: string[];
  exact: boolean;
};

// Loans and mortgage (`/api/realestate/loans`, `/api/mortgage`).
export type LoanSummary = {
  balance: Money;
  remaining_payments: number;
  payoff_date: string | null;
  next_due: string | null;
  installment: Money;
  rate: Money;
  interest_year_estimated: Money;
  warnings: string[];
};
export type Loan = {
  id: string;
  bank: string;
  name: string;
  kind: "mortgage" | "personal" | "other";
  principal: Money;
  rate_type: "fixed" | "variable" | "mixed";
  term_months: number;
  closed_at: string | null;
  summary: LoanSummary | null;
  ltv: Money;
  assets: { property_id: string; name: string; share: string }[];
  error: string | null;
};
export type LoanDetail = Loan & {
  schedule?: {
    n: number;
    due: string;
    payment: Money;
    interest: Money;
    principal: Money;
    balance: Money;
    actual: boolean;
  }[];
  payments?: { id: string; paid_on: string; total: Money; confirmed: boolean }[];
};
export type Loans = {
  items: Loan[];
  financing: {
    by_bank: { bank: string; balance: Money }[];
    resets: { loan_id: string; name: string; bank: string; date: string; days: number }[];
    interest_ytd: Money;
    variable_share: Money;
  };
};
export type RateScenarios = {
  loans: {
    loan_id: string;
    name: string;
    bank: string;
    rate: Money;
    payment: Money;
    scenarios: {
      delta: string;
      rate: Money;
      custom: boolean;
      payment: Money;
      change_monthly: Money;
    }[];
  }[];
};
export const MORTGAGE_PURPOSES = [
  "acquisition",
  "transfer",
  "construction",
  "renovation",
  "existing",
] as const;
export const MORTGAGE_REGIMES = ["unknown", "consumer", "professional"] as const;
export type MortgageCase = {
  id: string;
  title: string;
  purpose: (typeof MORTGAGE_PURPOSES)[number];
  regime: string;
  state: string;
  revision: number;
  updated_at?: string;
};
export type MortgageRecord = {
  id: string;
  kind: string;
  logical_key: string;
  data: Record<string, unknown>;
  stale?: boolean;
};
export type MortgageDetail = {
  case: MortgageCase;
  records: MortgageRecord[];
  history: { revision: number; kind: string }[];
};
export type Lender = { code: string; brand: string; stale: boolean; verified_on: string | null };

/** What the NSVX mortgage summary puts first: effort, monthly room, missing papers, banks waiting. */
export function mortgageFacts(detail: MortgageDetail) {
  const of = (kind: string) => detail.records.filter((record) => record.kind === kind);
  const assessment = of("assessment").at(-1)?.data ?? {};
  const missing = of("requirement").filter(
    (r) => !["accepted", "not_applicable"].includes(String(r.data.status)),
  );
  const waiting = of("application").filter((r) =>
    ["submitted", "under_analysis", "conditional"].includes(String(r.data.status)),
  );
  const offers = of("offer");
  return {
    ratio: (assessment.projected_ratio as Money | undefined) ?? null,
    remaining: (assessment.remaining as Money | undefined) ?? null,
    missing: missing.map((r) => String(r.data.label ?? r.logical_key)),
    waiting: waiting.map((r) => String(r.data.lender ?? r.data.label ?? "")),
    offers: offers.map((r) => ({
      lender: String(r.data.lender ?? ""),
      payment: (r.data.payment as Money | undefined) ?? null,
      selected: r.data.selected === true,
    })),
    applicants: of("applicant").length,
  };
}

// Short stay (`/api/al`).
export const HOUSE_STATES = [
  "ocupada",
  "disponivel",
  "check_out_hoje",
  "limpeza_pendente",
  "em_limpeza",
  "pronta",
  "manutencao",
  "bloqueada",
] as const;
export type HouseState = (typeof HOUSE_STATES)[number];
export type LiveStatus = {
  code: HouseState;
  label: string;
  next_arrival: { id: string; arrival: string; guest_name: string | null; ready: boolean } | null;
  current: { id: string; guest_name: string | null; departure: string } | null;
};
export type StayEvent = {
  kind: "arrival" | "departure" | "cleaning" | "maintenance" | "deadline";
  date: string;
  property: string | null;
  title: string;
  at?: string | null;
  urgent?: boolean;
};
export type StayNote = {
  id: number;
  title: string;
  body: string | null;
  severity: string;
  created_at: string;
  read: boolean;
};
export type StayOverview = {
  today: string;
  kpi: {
    checkins_today: number;
    checkouts_today: number;
    occupied: number;
    houses: number;
    upcoming: number;
    cleaning_pending: number;
    ready: number;
    with_arrival: number;
    maintenance_open: number;
    revenue_month?: Money;
    occupancy_month?: Money;
  };
  status: { id: string; code: string; name: string; state: LiveStatus }[];
  timeline: StayEvent[];
  alerts: {
    kind: string;
    severity: string;
    title: string;
    property: string | null;
    detail: string | null;
  }[];
  notifications: StayNote[];
};
export type Reservation = {
  id: string;
  property: string;
  kind: "reservation" | "block";
  status: "tentative" | "confirmed" | "cancelled";
  source: string;
  source_label: string;
  guest_name: string | null;
  adults: number | null;
  children: number | null;
  arrival: string;
  departure: string;
  nights: number;
  arrival_time: string | null;
  conflict: boolean;
  checked_in_at: string | null;
  checked_out_at: string | null;
  payout_amount?: Money;
  special_requests?: string | null;
};
export const TASK_STATUSES = [
  "por_confirmar",
  "agendada",
  "em_curso",
  "concluida",
  "problema",
  "reagendar",
  "cancelada",
] as const;
export type StayTask = {
  id: string;
  property: string;
  kind: string;
  title: string;
  status: (typeof TASK_STATUSES)[number];
  status_label: string;
  assignee: string | null;
  due_at: string | null;
  urgent: boolean;
  checklist_done: number;
  checklist_total: number;
};
/** The task actions Control offers, with the statuses NSVX accepts each from (`al/api.py` task action). */
export const TASK_ACTIONS = {
  confirm: ["por_confirmar", "reagendar"],
  start: ["por_confirmar", "agendada", "reagendar", "problema"],
  complete: ["em_curso", "agendada", "problema"],
  problem: ["por_confirmar", "agendada", "em_curso", "reagendar"],
  inspect: ["concluida"],
  reopen: ["concluida", "problema", "reagendar", "cancelada"],
} as const satisfies Record<string, readonly StayTask["status"][]>;
export type TaskAction = keyof typeof TASK_ACTIONS;
export const taskActionsFor = (status: StayTask["status"]) =>
  (Object.keys(TASK_ACTIONS) as TaskAction[]).filter((action) =>
    (TASK_ACTIONS[action] as readonly string[]).includes(status),
  );
/** Arrival steps that only record what happened in NSVX; overrides stay in NSVX with their written reason. */
export const STAY_STEPS = ["checkin", "checkout", "undo-checkin", "undo-checkout"] as const;
export type StayStep = (typeof STAY_STEPS)[number];
export function stepsFor(reservation: Reservation): StayStep[] {
  if (reservation.kind !== "reservation" || reservation.status === "cancelled") {
    return [];
  }
  if (reservation.checked_out_at) {
    return ["undo-checkout"];
  }
  return reservation.checked_in_at ? ["checkout", "undo-checkin"] : ["checkin"];
}
export const ISSUE_PRIORITIES = ["baixa", "media", "alta", "urgente"] as const;
export type Issue = {
  id: string;
  property: string;
  title: string;
  priority: (typeof ISSUE_PRIORITIES)[number];
  unfit: boolean;
  status: string;
  status_label: string;
  created_at: string;
};
export type InventoryItem = {
  id: string;
  property: string;
  name: string;
  unit: string | null;
  quantity: string;
  min_quantity: string;
  low: boolean;
};

export function houseTone(code: HouseState | string): Tone {
  switch (code) {
    case "pronta":
    case "disponivel":
      return "ok";
    case "ocupada":
      return "accent";
    case "check_out_hoje":
    case "limpeza_pendente":
    case "em_limpeza":
      return "warn";
    case "manutencao":
    case "bloqueada":
      return "bad";
    default:
      return "off";
  }
}

export function unitTone(status: UnitStatus | string): Tone {
  return status === "rented"
    ? "ok"
    : status === "vacant"
      ? "warn"
      : status === "reserved"
        ? "accent"
        : "off";
}

export function rentTone(status: RentStatus | Charge["status"]): Tone {
  return status === "received" || status === "paid"
    ? "ok"
    : status === "overdue"
      ? "bad"
      : status === "partial"
        ? "warn"
        : "off";
}

export function severityTone(severity: string): Tone {
  return severity === "bad" || severity === "critical"
    ? "bad"
    : severity === "warn" || severity === "warning"
      ? "warn"
      : severity === "ok"
        ? "ok"
        : "off";
}

/** `YYYY-MM` in Lisbon time, the month NSVX rent screens default to. */
export function lisbonMonth(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
  }).format(now);
}

/** `YYYY-MM-DD` in Lisbon time, today's date on NSVX forms. */
export function lisbonDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(now);
}

export const num = (value: Money | number | undefined) =>
  value === null || value === undefined || value === "" ? null : Number(value);

/** Whole euros for tiles; exact cents stay in NSVX. */
export function euro(locale: string, value: Money | number | undefined, cents = false) {
  const n = num(value);
  return n === null || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: cents ? 2 : 0,
      }).format(n);
}

/** One line per area for the chat tool and the tab header. */
export function homesSummary(parts: {
  overview?: Overview;
  hub?: Hub;
  rent?: RentBoard;
  loans?: Loans;
  stays?: StayOverview;
}) {
  return {
    homes: parts.overview
      ? {
          properties: parts.overview.kpis.properties,
          units: parts.overview.kpis.units,
          rented: parts.overview.kpis.occupancy.rented,
          vacant: parts.overview.kpis.occupancy.vacant,
          value: parts.overview.kpis.market_value,
          debt: parts.overview.kpis.debt,
          rentCollectedMonth: parts.overview.kpis.rent_collected_month,
          rentExpectedMonth: parts.overview.kpis.rent_expected_month,
        }
      : null,
    house: parts.hub
      ? {
          homes: parts.hub.summary.properties,
          monthly: parts.hub.summary.monthly_estimate,
          unpaidInvoices: parts.hub.summary.unpaid_invoices,
          overdueInvoices: parts.hub.summary.overdue_invoices,
          deadlines90d: parts.hub.summary.deadlines_90d,
          missingDocuments: parts.hub.summary.missing_documents,
        }
      : null,
    rent: parts.rent
      ? {
          month: parts.rent.summary.month,
          received: parts.rent.summary.received,
          outstanding: parts.rent.summary.outstanding,
          overdue: parts.rent.summary.overdue,
          toMatch: parts.rent.pending.filter((p) => p.kind === "unmatched_payment").length,
        }
      : null,
    loans: parts.loans
      ? {
          open: parts.loans.items.filter((loan) => !loan.closed_at).length,
          balance: parts.loans.items
            .filter((loan) => !loan.closed_at)
            .reduce((sum, loan) => sum + (num(loan.summary?.balance) ?? 0), 0)
            .toFixed(2),
          nextResets: parts.loans.financing.resets.slice(0, 3),
        }
      : null,
    stays: parts.stays
      ? {
          checkinsToday: parts.stays.kpi.checkins_today,
          checkoutsToday: parts.stays.kpi.checkouts_today,
          occupied: parts.stays.kpi.occupied,
          houses: parts.stays.kpi.houses,
          cleaningPending: parts.stays.kpi.cleaning_pending,
          maintenanceOpen: parts.stays.kpi.maintenance_open,
          alerts: parts.stays.alerts.length,
        }
      : null,
  };
}
