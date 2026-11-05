/**
 * NSVX Aviation shapes (`backend/clone/aviation`, `web/src/logic/aviation.ts`) and the pure helpers both the tab and
 * the chat tool use. Times are whole minutes; instants are UTC ISO strings, as NSVX stores them.
 */

export type EntryKind = "flight" | "fstd";
export const ROLES = [
  "copilot_min",
  "pic_min",
  "picus_min",
  "dual_min",
  "instructor_min",
  "spic_min",
  "relief_min",
] as const;
export type Role = (typeof ROLES)[number];
export const CREWS = ["mp", "se", "me"] as const;
export type Crew = (typeof CREWS)[number];

export type Entry = {
  id: string;
  kind: EntryKind;
  status: "recorded" | "voided";
  revision: number;
  log_date: string;
  flight_no: string | null;
  dep_place: string | null;
  arr_place: string | null;
  off_block_at: string | null;
  on_block_at: string | null;
  aircraft_model: string | null;
  registration: string | null;
  pic_name: string | null;
  fstd_type: string | null;
  fstd_qualification: string | null;
  remarks: string | null;
  source: "master" | "confirmed" | "manual";
  sheet_state: "in_master" | "pending_write";
  countersign: "not_required" | "required" | "recorded";
  countersign_note: string | null;
  se_min: number;
  me_min: number;
  mp_min: number;
  total_min: number;
  night_min: number;
  ifr_min: number;
  fstd_min: number;
  to_day: number;
  to_night: number;
  ldg_day: number;
  ldg_night: number;
} & Record<Role, number>;

export type EntryFull = Entry & {
  history: { revision: number; reason: string; changed_at: string }[];
};

export type Totals = {
  total_min: number;
  pic_min: number;
  copilot_min: number;
  night_min: number;
  ifr_min: number;
  mp_min: number;
  fstd_min: number;
  ldg_day: number;
  ldg_night: number;
  to_day: number;
  to_night: number;
  flights: number;
  sessions: number;
  balance_included?: boolean;
};

export type Candidate = {
  id: string;
  log_date: string;
  source: string;
  activity: "flight" | "positioning" | "standby" | "ground" | "cancelled" | "other";
  state:
    | "awaiting"
    | "missing_info"
    | "not_finished"
    | "confirmed"
    | "dismissed"
    | "not_loggable"
    | "duplicate";
  planned: {
    title?: string;
    actual?: boolean;
    start?: string;
    end?: string;
    registration?: string | null;
    aircraft?: string | null;
    function?: string | null;
    departure_local?: string | null;
    arrival_local?: string | null;
    tz?: string | null;
  };
  draft: Record<string, unknown>;
  problems: string[];
};

export type RecentAircraft = {
  aircraft_model: string;
  registration: string;
  pic_name: string;
  mp: boolean;
  me: boolean;
  se: boolean;
};

export type SyncRun = {
  id: number;
  target_date: string;
  trigger: "schedule" | "manual";
  state: "running" | "ok" | "no_source" | "error";
  added: number;
  awaiting: number;
  duplicates: number;
  not_loggable: number;
  warnings: string[];
  error: string | null;
  finished_at: string | null;
};

export type DayState =
  | "recorded"
  | "awaiting"
  | "missing_info"
  | "none"
  | "no_source"
  | "error"
  | "pending";

export type Yesterday = {
  date: string;
  state: DayState;
  recorded: Entry[];
  candidates: Candidate[];
  open_total: number;
  last_ok: SyncRun | null;
  actual_source?: boolean;
  config: { time: string; tz: string; enabled: boolean };
};

export type Validity = "valid" | "soon" | "expiring" | "expired" | "unknown" | "no_expiry";
export type DocKind = "pdf" | "image" | "sheet" | "slides" | "doc" | "file" | "folder";
export type Doc = {
  id: string;
  name: string;
  title: string;
  title_manual: boolean;
  mime: string;
  kind: DocKind;
  folder: string;
  modified: string | null;
  category: string;
  category_label: string;
  group: string;
  category_manual: boolean;
  tags: string[];
  favorite: boolean;
  pinned: boolean;
  issued_on: string | null;
  expires_on: string | null;
  expiry_state: "none" | "confirmed" | "no_expiry";
  validity: Validity;
  days_left: number | null;
  reminders: number[];
};

export type Library = {
  roots: string[];
  docs: Doc[];
  categories: { id: string; label: string; group: string; count: number }[];
  pinned: Doc[];
  expiry: Doc[];
  hidden_identity: number;
  sync: { account_state: string | null; last_change_check: string | null };
};

export type Overview = {
  today: string;
  holder: { name: string; licence: string };
  stats: { totals: Totals; month: Totals; year: Totals };
  yesterday: Yesterday;
  recent: Entry[];
  trend: { m: string; flight: number; fstd: number }[];
  aircraft: { model: string; minutes: number; flights: number }[];
  validity: Doc[];
  essential: Doc[];
  alerts: { id: number; file_id: string; name: string; expires_on: string; days_left: number }[];
  sheet: { pending_write: number };
  imported: boolean;
};

export type FlightLogRow = {
  kind: "flight" | "ground";
  start: string;
  dep: string;
  arr: string;
  registration: string | null;
  minutes: number;
  problems?: string[];
};

export type FlightLog = {
  matched: number;
  rows: number;
  missing: FlightLogRow[];
  different: FlightLogRow[];
  logbook_only: { id: string; log_date: string; label: string }[];
  months: string[];
  last_read: string | null;
  job: { status: string; last_error: string | null } | null;
};

export const CHECKIN_STATES = [
  "scheduled",
  "waiting_window",
  "running",
  "needs_owner",
  "needs_approval",
  "done",
  "failed",
  "cancelled",
] as const;
export type CheckinState = (typeof CHECKIN_STATES)[number];
export type Checkin = {
  id: string;
  pnr: string;
  airline_code: string;
  status: CheckinState;
  scheduled_for: string | null;
  mission_id: string;
  pending_owner_item?: boolean;
  flight_legs: { origin: string; destination: string; flight_no?: string }[];
  seat_chosen: { action: string; seat?: string }[] | null;
  boarding_passes: { leg_index: number; drive_file_id: string; name: string }[];
};

export type WorkItem = {
  id: string;
  kind: string;
  title: string | null;
  status: string;
  departure_at: string | null;
  arrival_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  report_at: string | null;
  observed_at: string;
  meta: {
    flight?: string;
    registration?: string;
    aircraft?: string;
    from?: string;
    to?: string;
    duty?: string;
    from_name?: string;
    unread?: boolean;
  };
  excerpt: string | null;
};

export type WorkConnection = {
  service: "cwp" | "mail" | "portal" | "sms";
  label: string;
  state: string;
  configured: boolean;
  last_complete_at: string | null;
};

export type Tone = "ok" | "warn" | "bad" | "run" | "";

export const DAY_TONE: Record<DayState, Tone> = {
  recorded: "ok",
  awaiting: "warn",
  missing_info: "warn",
  none: "",
  no_source: "",
  error: "bad",
  pending: "run",
};

export const VALIDITY_TONE: Record<Validity, Tone> = {
  valid: "ok",
  soon: "run",
  expiring: "warn",
  expired: "bad",
  unknown: "",
  no_expiry: "",
};

export const CHECKIN_TONE: Record<CheckinState, Tone> = {
  scheduled: "run",
  waiting_window: "run",
  running: "run",
  needs_owner: "warn",
  needs_approval: "warn",
  done: "ok",
  failed: "bad",
  cancelled: "",
};

/** Which check-in controls NSVX accepts in each state (`checkin.service.control`). */
export function checkinActions(status: CheckinState) {
  return {
    cancel: status !== "done" && status !== "cancelled",
    retry: status === "needs_owner" || status === "needs_approval" || status === "failed",
  };
}

/** 554 -> "9:14"; hours are unbounded ("3677:36"). */
export function hm(min: number | null | undefined): string {
  if (min == null) {
    return "";
  }
  const sign = min < 0 ? "-" : "";
  const m = Math.abs(Math.trunc(min));
  return `${sign}${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** "9:14" | "914" | "9h14" -> minutes; empty is 0; anything else (decimal hours too) is null. */
export function parseHm(value: string): number | null {
  const t = value.trim();
  if (!t) {
    return 0;
  }
  const m = /^(\d{1,5})\s*[:h]\s*(\d{2})$/.exec(t) ?? /^(\d{1,2})(\d{2})$/.exec(t);
  if (!m || Number(m[2]) > 59) {
    return null;
  }
  return Number(m[1]) * 60 + Number(m[2]);
}

/** "0841" | "08:41" | "8.41" -> "08:41", or null. */
export function parseClock(value: string): string | null {
  const m = /^(\d{1,2})[:h.]?(\d{2})$/.exec(value.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
    return null;
  }
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

/** UTC instants for a block on `day` (the off-block date); an on-block at or before off-block is the next day. */
export function blockTimes(day: string, off: string, on: string) {
  const a = parseClock(off);
  const b = parseClock(on);
  if (!a || !b || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return null;
  }
  const start = Date.parse(`${day}T${a}:00Z`);
  let end = Date.parse(`${day}T${b}:00Z`);
  if (end <= start) {
    end += 86_400_000;
  }
  return {
    off: new Date(start).toISOString(),
    on: new Date(end).toISOString(),
    minutes: Math.round((end - start) / 60_000),
  };
}

export const utcClock = (iso: string | null | undefined) => (iso ? iso.slice(11, 16) : "");

/** First pilot function with time on an entry. */
export function roleOf(entry: Entry): Role | undefined {
  return ROLES.find((role) => entry[role] > 0);
}

export type FlightForm = {
  log_date: string;
  flight_no: string;
  dep_place: string;
  arr_place: string;
  off: string;
  on: string;
  aircraft_model: string;
  registration: string;
  pic_name: string;
  crew: Crew | "";
  role: Role | "";
  night: string;
  ifr: string;
  to_day: number;
  to_night: number;
  ldg_day: number;
  ldg_night: number;
  remarks: string;
  countersign_required: boolean;
};

export const emptyFlight = (day: string): FlightForm => ({
  log_date: day,
  flight_no: "",
  dep_place: "",
  arr_place: "",
  off: "",
  on: "",
  aircraft_model: "",
  registration: "",
  pic_name: "",
  crew: "",
  role: "",
  night: "",
  ifr: "",
  to_day: 0,
  to_night: 0,
  ldg_day: 0,
  ldg_night: 0,
  remarks: "",
  countersign_required: false,
});

const text = (record: Record<string, unknown>, key: string) =>
  typeof record[key] === "string" ? (record[key] as string) : "";
const count = (record: Record<string, unknown>, key: string) =>
  typeof record[key] === "number" ? (record[key] as number) : 0;

/** An entry or a candidate's draft -> the form; only what the source says, nothing invented. */
export function formFrom(day: string, source: Record<string, unknown>): FlightForm {
  const minutes = (key: string) => (typeof source[key] === "number" ? (source[key] as number) : 0);
  const clock = (key: string) => text(source, key).slice(11, 16);
  const night = source.night_min;
  const ifr = source.ifr_min;
  return {
    ...emptyFlight(day),
    flight_no: text(source, "flight_no"),
    dep_place: text(source, "dep_place"),
    arr_place: text(source, "arr_place"),
    off: clock("off_block_at"),
    on: clock("on_block_at"),
    aircraft_model: text(source, "aircraft_model"),
    registration: text(source, "registration"),
    pic_name: text(source, "pic_name"),
    remarks: text(source, "remarks"),
    crew: minutes("mp_min") ? "mp" : minutes("me_min") ? "me" : minutes("se_min") ? "se" : "",
    role: ROLES.find((role) => minutes(role) > 0) ?? "",
    night: typeof night === "number" ? hm(night) : "",
    ifr: typeof ifr === "number" ? hm(ifr) : "",
    to_day: count(source, "to_day"),
    to_night: count(source, "to_night"),
    ldg_day: count(source, "ldg_day"),
    ldg_night: count(source, "ldg_night"),
    countersign_required: source.countersign === "required",
  };
}

export type FormProblem =
  | "block"
  | "night"
  | "ifr"
  | "dep_place"
  | "arr_place"
  | "aircraft_model"
  | "registration"
  | "pic_name"
  | "crew"
  | "role";

/** Form -> NSVX entry fields, or what is missing. Crew, function, night, and IFR are the pilot's, never defaults. */
export function flightFields(form: FlightForm): {
  fields?: Record<string, unknown>;
  problems: FormProblem[];
} {
  const problems: FormProblem[] = [];
  const block = blockTimes(form.log_date, form.off, form.on);
  if (!block) {
    problems.push("block");
  }
  const night = form.night.trim() === "" ? null : parseHm(form.night);
  const ifr = form.ifr.trim() === "" ? null : parseHm(form.ifr);
  if (night == null) {
    problems.push("night");
  }
  if (ifr == null) {
    problems.push("ifr");
  }
  for (const key of [
    "dep_place",
    "arr_place",
    "aircraft_model",
    "registration",
    "pic_name",
  ] as const) {
    if (!form[key].trim()) {
      problems.push(key);
    }
  }
  if (!form.crew) {
    problems.push("crew");
  }
  if (!form.role) {
    problems.push("role");
  }
  if (problems.length > 0 || !block) {
    return { problems };
  }
  const total = block.minutes;
  const fields: Record<string, unknown> = {
    kind: "flight",
    log_date: form.log_date,
    flight_no: form.flight_no.trim() || null,
    dep_place: form.dep_place.trim().toUpperCase(),
    arr_place: form.arr_place.trim().toUpperCase(),
    off_block_at: block.off,
    on_block_at: block.on,
    aircraft_model: form.aircraft_model.trim(),
    registration: form.registration.trim().toUpperCase(),
    pic_name: form.pic_name.trim(),
    total_min: total,
    se_min: form.crew === "se" ? total : 0,
    me_min: form.crew === "me" ? total : 0,
    mp_min: form.crew === "mp" ? total : 0,
    night_min: night,
    ifr_min: ifr,
    to_day: form.to_day,
    to_night: form.to_night,
    ldg_day: form.ldg_day,
    ldg_night: form.ldg_night,
    remarks: form.remarks.trim() || null,
    countersign_required: form.countersign_required,
  };
  fields[form.role] = total;
  return { fields, problems: [] };
}

/** The last `n` months ending at `end` (YYYY-MM), zero-filled, with bar heights in percent. */
export function trendSeries(
  rows: { m: string; flight: number; fstd: number }[],
  end: string,
  n = 12,
) {
  const months = new Map(rows.map((row) => [row.m, row]));
  const out: { m: string; flight: number; fstd: number; pct: number; flightPct: number }[] = [];
  let [year, month] = end.split("-").map(Number) as [number, number];
  for (let i = 0; i < n; i++) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    out.unshift({
      m: key,
      flight: months.get(key)?.flight ?? 0,
      fstd: months.get(key)?.fstd ?? 0,
      pct: 0,
      flightPct: 0,
    });
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  const max = Math.max(1, ...out.map((row) => row.flight + row.fstd));
  for (const row of out) {
    row.pct = Math.round(((row.flight + row.fstd) / max) * 100);
    row.flightPct = Math.round((row.flight / max) * 100);
  }
  return out;
}

/** Entries grouped by month, newest first as NSVX lists them, with each month's block and simulator time. */
export function byMonth(entries: Entry[]) {
  const groups: { m: string; items: Entry[]; total: number; fstd: number }[] = [];
  for (const entry of entries) {
    const m = entry.log_date.slice(0, 7);
    let last = groups.at(-1);
    if (!last || last.m !== m) {
      last = { m, items: [], total: 0, fstd: 0 };
      groups.push(last);
    }
    last.items.push(entry);
    last.total += entry.total_min;
    last.fstd += entry.fstd_min;
  }
  return groups;
}

/** Yesterday as a date in the viewer's calendar (NSVX re-checks it against its own zone). */
export function yesterday(now = Date.now()): string {
  return new Date(now - 86_400_000).toISOString().slice(0, 10);
}

export const fold = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Free text over a document's title, file name, folder, category, and tags, ignoring accents. */
export function docMatches(doc: Doc, query: string): boolean {
  const needle = fold(query);
  return (
    !needle ||
    fold(
      `${doc.title} ${doc.name} ${doc.folder} ${doc.category_label} ${doc.tags.join(" ")}`,
    ).includes(needle)
  );
}
