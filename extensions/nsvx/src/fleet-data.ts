/**
 * Shapes of the NSVX TVDE and Transports answers this tab reads (`backend/clone/tvde/api*.py`,
 * `backend/clone/transports/*api.py`), plus small pure helpers. Money is text, unknown is null, as NSVX sends it.
 */

export type Tone = "ok" | "warn" | "bad" | "run" | "off";
export type Overall = "compliant" | "attention" | "not_ready";
export type Compliance = {
  overall: Overall;
  score: number;
  required: number;
  ok: number;
  issues: { label: string; status: string }[];
  next_expiry: string | null;
};
export type Cell = {
  type: string;
  label: string;
  status: string;
  required: boolean;
  expires_on: string | null;
  days_left: number | null;
  document_id: string | null;
};
export type Alert = {
  id: string;
  kind: string;
  severity: "critical" | "warning" | "info";
  title: string;
  driver_id: string | null;
  vehicle_id: string | null;
  due_on: string | null;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
};
export type FleetTask = {
  id: string;
  title: string;
  kind: string;
  priority: "high" | "normal" | "low";
  status: "open" | "done" | "cancelled";
  due_on: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
  driver_name?: string | null;
  plate?: string | null;
  fleet_no?: string | null;
};
export type FleetEvent = {
  seq: number;
  at: string;
  actor: string;
  action: string;
  summary: string;
};
export type Integration = {
  code: string;
  label: string;
  category: string;
  state: string;
  last_success_at: string | null;
  last_error?: string | null;
  keys?: boolean;
  syncing?: boolean;
};
export type Renewal = {
  date: string;
  days_left: number;
  label: string;
  status: string;
  subject: "driver" | "vehicle" | "company";
  entity_id: string;
  entity: string;
};
export type Dashboard = {
  today: string;
  has_company: boolean;
  drivers: {
    total: number;
    active: number;
    onboarding: number;
    pending: number;
    issues: number;
    not_ready: number;
  };
  vehicles: {
    total: number;
    available: number;
    assigned: number;
    unavailable: number;
    not_ready: number;
  };
  documents: { expiring: number; expired: number; missing: number; review: number };
  tasks: { open: number; overdue: number };
  alerts: { total: number; critical: number; items: Alert[] };
  renewals: Renewal[];
  activity: FleetEvent[];
  integrations: Integration[];
  trips: { week: number; net: string | null };
};
export type Driver = {
  id: string;
  code: string;
  full_name: string;
  status: string;
  phone: string | null;
  email: string | null;
  uber_ref: string | null;
  bolt_ref: string | null;
  payment_model: string | null;
  compliance: Compliance;
  vehicles: { id: string; label: string; shift: string | null }[];
};
export type DriverDetail = Driver & {
  company_name: string | null;
  cells: Cell[];
  tasks: FleetTask[];
  alerts: Alert[];
  events: FleetEvent[];
  platforms: {
    platform: string;
    status: string | null;
    trips_30d: number;
    net_30d: string | null;
    synced_at: string | null;
  }[];
};
export type Vehicle = {
  id: string;
  label: string;
  plate: string | null;
  fleet_no: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  energy: string | null;
  mileage_km: number | null;
  status: string;
  uber_status: string;
  bolt_status: string;
  compliance: Compliance;
  drivers: { id: string; name: string; shift: string | null }[];
};
export type VehicleDetail = Vehicle & {
  cells: Cell[];
  tasks: FleetTask[];
  alerts: Alert[];
  events: FleetEvent[];
};

export type Shift = {
  id: string;
  kind: string;
  status: string;
  starts_at: string;
  ends_at: string;
  driver_id: string | null;
  driver_name: string | null;
  vehicle_label: string | null;
  notes: string | null;
};
export type Service = {
  id: string;
  vehicle_id: string;
  vehicle_label: string;
  kind: string;
  title: string;
  status: string;
  scheduled_on: string | null;
  done_on: string | null;
  reported_on: string | null;
  workshop: string | null;
  cost: string | null;
  next_due_on: string | null;
  next_due_km: number | null;
};
export type Flow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  template: string | null;
  entity: string;
  due_on: string | null;
  progress: number;
  stalled: boolean;
  stages: { key: string; label: string; status: string; auto: boolean; checkable: boolean }[];
  blocking: { key: string; label: string; reasons: string[] } | null;
};
export type Incident = {
  id: string;
  kind: string;
  title: string;
  status: string;
  driver_name: string | null;
  plate: string | null;
  occurred_at: string | null;
  due_on: string | null;
  cost: string | null;
};
export type FleetCard = {
  id: string;
  kind: string;
  label: string | null;
  issuer: string | null;
  reference: string | null;
  holder: string | null;
  status: string;
  display_status: string;
  expires_on: string | null;
  days_left: number | null;
};
export type Handover = {
  id: string;
  kind: "delivery" | "return";
  at: string;
  vehicle_label: string;
  driver_name: string | null;
  mileage_km: number | null;
  energy_pct: number | null;
  damage: string | null;
};
export type DriverRequest = {
  id: string;
  kind: string;
  driver_name: string;
  status: string;
  message: string;
  answer: string | null;
  created_at: string;
};
export type Access = {
  id: string;
  role: "driver" | "accountant" | "auditor";
  driver_name: string | null;
  label: string | null;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  sessions: number;
};
export type Announcement = {
  id: string;
  title: string;
  body: string | null;
  published_at: string;
};

export type FinanceSummary = {
  period: { start: string; end: string };
  revenue: {
    gross: string;
    fees: string;
    tips: string;
    net: string;
    cash: string;
    other_invoiced: string;
  };
  expenses: { total: string; vat_in: string; by_category: Record<string, string> };
  settlements: { company_share: string; driver_payouts: string; count: number };
  operating_result: string;
  by_month: {
    month: string;
    revenue: string;
    expenses: string;
    cash_in: string;
    cash_out: string;
  }[];
  by_platform: Record<string, string>;
  by_driver: Record<string, string>;
  receivables: string;
  payables: string;
  owed_to_drivers: string;
  owed_by_drivers: string;
};
export type FleetInvoice = {
  id: string;
  direction: "in" | "out";
  kind: string;
  reference: string | null;
  counterparty: string | null;
  issued_on: string | null;
  due_on: string | null;
  gross: string | null;
  outstanding: string | null;
  display_status: string;
  category: string | null;
  holder: string | null;
};
export type Settlement = {
  id: string;
  driver_name: string;
  period_start: string;
  period_end: string;
  status: string;
  earnings_net: string | null;
  owed_to_driver: string | null;
  owed_to_company: string | null;
  changed_since_approval?: boolean;
};
export type Earning = {
  id: string;
  platform: string;
  driver_name: string | null;
  period_start: string;
  period_end: string;
  gross: string | null;
  net: string | null;
};

export type Rule = {
  code: string;
  name: string;
  description: string;
  enabled: boolean;
  schedule_paused: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
};
export type RuleRun = {
  id: number;
  rule_code: string;
  dry_run: boolean;
  actions: number;
  at: string;
  error: string | null;
};
export type Report = { name: string; group: string; title: string };
export type ReportTable = Report & {
  start: string;
  end: string;
  columns: string[];
  rows: (string | number | null)[][];
};
export type Analytics = {
  weekly_net: { week: string; net: string }[];
  next_week_forecast: string | null;
  onboarding_days: number | null;
  utilization: { vehicle: string; days: number; pct: number }[];
};
export type Forecast = {
  maintenance_id: string;
  vehicle_id: string;
  vehicle_label: string | null;
  title: string;
  state: string;
  actual_km: number | null;
  threshold_km: number | null;
  remaining_km: number | null;
  estimated_on: string | null;
  documented_due_on: string | null;
  sample_count: number;
  as_of: string;
};
export type Reading = {
  id: string;
  state: "pending" | "accepted" | "rejected";
  revision: number;
  original_value: string | null;
  original_unit: string | null;
  observed_on: string | null;
  km: string | null;
  filename: string;
  extraction_state: string;
  result: {
    odometer: string | null;
    unit: string | null;
    observed_on: string | null;
    plate: string | null;
    issues: string[];
  } | null;
};
export type Mileage = { readings: Reading[]; forecasts: Forecast[] };

export type UberDoc = {
  kind: string;
  issued_on: string | null;
  entity: string | null;
  drive_file_id: string;
};
export type UberStatus = {
  configured: boolean;
  drive_saved: boolean;
  run: {
    state: string;
    year: number;
    quarter: number;
    detail?: string;
    items: Record<string, { documents?: UberDoc[] }>;
  } | null;
};
export type Trip = {
  ext_id: string;
  at: string | null;
  driver_name: string | null;
  full_name: string | null;
  plate: string | null;
  status: string | null;
  net: string | null;
  currency: string | null;
  distance_km: string | number | null;
};

export const COMPLIANCE_TONE: Record<Overall, Tone> = {
  compliant: "ok",
  attention: "warn",
  not_ready: "bad",
};

/** A document cell's tone: what the owner must act on first. */
export function cellTone(status: string): Tone {
  switch (status) {
    case "valid":
      return "ok";
    case "missing":
    case "expired":
    case "rejected":
      return "bad";
    case "not_applicable":
    case "none":
      return "off";
    default:
      return "warn";
  }
}

export function severityTone(severity: Alert["severity"]): Tone {
  return severity === "critical" ? "bad" : severity === "warning" ? "warn" : "run";
}

export function daysTone(days: number | null): Tone {
  if (days === null) {
    return "off";
  }
  return days < 0 ? "bad" : days <= 30 ? "warn" : "ok";
}

const DONE = new Set(["done", "resolved", "cancelled", "paid", "completed"]);
export function stateTone(state: string): Tone {
  if (DONE.has(state)) {
    return "ok";
  }
  if (
    ["overdue", "blocked", "failed", "expired", "disputed", "conflict", "reached"].includes(state)
  ) {
    return "bad";
  }
  if (["running", "queued", "started", "in_progress", "syncing", "forecast"].includes(state)) {
    return "run";
  }
  return "warn";
}

/** Uber documents from the newest collection run, once each. */
export function uberDocuments(status: UberStatus | undefined): UberDoc[] {
  const docs = Object.values(status?.run?.items ?? {}).flatMap((item) => item.documents ?? []);
  return [...new Map(docs.map((doc) => [doc.drive_file_id, doc])).values()];
}

/** Monday..Sunday (local) that contains `day`, as ISO dates. */
export function weekOf(day: Date): { start: string; end: string; days: string[] } {
  const monday = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, index) => {
    const next = new Date(monday);
    next.setDate(monday.getDate() + index);
    return isoDay(next);
  });
  return { start: days[0]!, end: days[6]!, days };
}

export function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return isoDay(new Date(y!, m! - 1, d! + days));
}

/** The calendar quarter (1..4) of a date, and the one before it, the usual receipt collection target. */
export function lastQuarter(today: Date): { year: number; quarter: number } {
  const current = Math.floor(today.getMonth() / 3) + 1;
  return current === 1
    ? { year: today.getFullYear() - 1, quarter: 4 }
    : { year: today.getFullYear(), quarter: current - 1 };
}

/** Largest absolute value across rows, never zero, for bar widths. */
export function maxOf(values: (string | number | null | undefined)[]): number {
  return Math.max(1, ...values.map((value) => Math.abs(Number(value ?? 0)) || 0));
}

export function percent(part: number | null, whole: number | null): number | null {
  return part === null || whole === null || whole <= 0
    ? null
    : Math.min(100, Math.max(0, (part / whole) * 100));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? "?") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

/** The states and choices NSVX accepts for each owner change; fleet.ts validates against them. */
export const TASK_STATES = ["open", "done", "cancelled"] as const;
export const REQUEST_STATES = ["done", "declined", "open"] as const;
export const STEP_STATES = ["pending", "done", "skipped"] as const;
export const INCIDENT_STATES = ["open", "in_progress", "waiting", "resolved", "cancelled"] as const;
export const SERVICE_STATES = [
  "reported",
  "scheduled",
  "in_progress",
  "done",
  "cancelled",
] as const;
export const SHIFT_STATES = [
  "planned",
  "confirmed",
  "requested",
  "started",
  "done",
  "cancelled",
] as const;
export const ACCESS_ROLES = ["driver", "accountant", "auditor"] as const;
export const PLATFORMS = ["uber", "bolt"] as const;
export const UBER_ACCOUNTS = ["personal", "business"] as const;
