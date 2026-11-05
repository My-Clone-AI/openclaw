/** Shapes of NSVX `/api/group-companies/*` answers and the pure mapping the Group tab and nsvx_group share. */

export type Tone = "ok" | "warn" | "bad" | "off";

type Env = { status: string; revision: string | null; url: string };
export type ErrorLevel = "fatal" | "error" | "warning";
export type ErrorGroup = {
  group: string;
  level: ErrorLevel;
  count: number;
  lastSeen: string;
  route: string | null;
  message: string;
};
type ErrorsSummary = {
  status: string;
  count: number;
  groups: number;
  top: ErrorGroup[];
  truncated: boolean;
};
type MetricDay = {
  date: string;
  visitors: number | null;
  newUsers: number | null;
  totalUsers: number | null;
  final?: boolean;
};

export type GroupApp = {
  id: string;
  name: string;
  domain: string;
  adult?: boolean;
  repo: string;
  developmentUrl: string;
  productionUrl: string;
  status: string;
  dev: Env;
  prod: Env;
  adapter: { status: string; version?: string; envMismatch?: boolean; error?: string };
  metrics: { status: string; days: MetricDay[]; visitors?: number | null };
  github: {
    status: string;
    develop?: { state: string; url?: string } | null;
    prs?: { count: number; top: { ci: string }[] };
    aheadBy?: number | null;
  };
  grow?: { enabled: boolean; mode: string };
  errors?: ErrorsSummary;
};
export type Overview = { generatedAt: string; github: string; apps: GroupApp[] };
export type Incidents = {
  items: Record<string, { action?: string; status?: string; at?: string }>;
};

export const DEV_ACTIONS = [
  "ci",
  "redeploy",
  "restart",
  "grow_run",
  "grow_pause",
  "grow_resume",
] as const;
export type DevAction = (typeof DEV_ACTIONS)[number];
type DevActionState = { available: boolean; reason: string | null };
export type DevActions = {
  environment: string;
  actions: Record<string, { adult?: boolean } & Partial<Record<DevAction, DevActionState>>>;
};

export type CompanyMetric = { key: string; label: string; value: unknown; unit?: string | null };
export type Company = {
  id: string;
  name: string;
  domain: string;
  adult?: boolean;
  configured: boolean;
  environment?: string | null;
  status: string;
  error?: string;
  release?: { revision?: string; builtAt?: string };
  metrics: CompanyMetric[];
  attention: { key: string; label: string; count: number }[];
  public: { status: string; checks: { url: string; status: string }[] };
  health?: { status?: string; checks: { key: string; status: string; detail?: string }[] };
};
export type OperationInput = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
};
export type Operation = {
  id: string;
  label: string;
  risk: string;
  targetKind?: string;
  resourceKind?: string;
  disabledReason?: string;
  preview: boolean;
  inputs: OperationInput[];
};
export type Manifest = { resources: { kind: string; label: string }[]; operations: Operation[] };
export type ResourceItem = { id: string; title?: string; subtitle?: string; status?: string };
export type ResourcePage = {
  items?: ResourceItem[];
  entries?: Record<string, unknown>[];
  nextCursor?: string;
};
export type ResourceDetail = {
  item: ResourceItem;
  fields: Record<string, unknown>;
  timeline?: { at: string; label?: string; title?: string; detail?: string }[];
  operations?: string[];
};
export type OperationResult = {
  ok?: boolean;
  status?: string;
  message?: string;
  auditId?: string;
  run?: {
    runId: string;
    state: string;
    progressPercent?: number;
    verification?: { verified: boolean };
    error?: { message: string };
  };
};
export type Preview = {
  available?: boolean;
  previewToken?: string;
  unavailableReason?: string;
  preconditions?: { id: string; label: string; satisfied: boolean; detail?: string }[];
  effects?: string[];
  warnings?: string[];
};

export type ErrorItem = ErrorGroup & { app: string };
export type ErrorSource = {
  id: string;
  name: string;
  adult?: boolean;
  status: string;
  groups: number;
  count: number;
};
export type ErrorsFeed = {
  generatedAt: string;
  hours: number;
  apps: ErrorSource[];
  items: ErrorItem[];
};

export type Metrics = {
  from: string;
  to: string;
  apps: Record<string, { status: string; days: MetricDay[] }>;
  total: { days: (MetricDay & { coverage?: { visitors: number; users: number; apps: number } })[] };
};
export const METRICS = ["visitors", "newUsers", "totalUsers"] as const;
export type Metric = (typeof METRICS)[number];

type Process = { pid: number; name: string; user: string; cpu: number; mem: number };
export type ServerMetrics = {
  cpu: number;
  scheduledRebootAt?: string | null;
  memory: { used: number; total: number };
  disks: { mount: string; used: number; total: number; percent: number }[];
  uptime: number;
  load: number[];
  processes?: { cpu: Process[]; mem: Process[] };
};
export type Server = {
  id: string;
  label: string;
  host: string;
  apps: string[];
  configured: boolean;
  probeOnly?: boolean;
  status: string;
  metrics?: ServerMetrics;
  error?: string;
};
export type Service = {
  unit: string;
  ActiveState: string;
  SubState: string;
  MemoryCurrent?: string;
};
export const SERVER_VERBS = ["restart", "clean", "kill", "reboot", "cancel-reboot"] as const;
export type ServerVerb = (typeof SERVER_VERBS)[number];

export type Mailbox = {
  app: string;
  box: string;
  address: string;
  unread: number | null;
  actions: string[];
  sendEnabled: boolean;
  status: string;
};
type Address = { name?: string; email: string };
export type MailMessage = {
  id: string;
  threadId: string;
  app: string;
  box: string;
  subject: string;
  from: Address[];
  to: Address[];
  cc: Address[];
  date: string;
  unread?: boolean;
  flagged?: boolean;
  hasAttachment?: boolean;
  html?: string;
  attachments?: { blobId: string; name: string; size: number }[];
};
export type MailPage = {
  items: MailMessage[];
  nextCursor?: string | null;
  errors: { app: string }[];
};
export const MAIL_ACTIONS = [
  "markRead",
  "markUnread",
  "archive",
  "unarchive",
  "flag",
  "unflag",
  "trash",
  "spam",
  "notSpam",
] as const;
export type MailAction = (typeof MAIL_ACTIONS)[number];
const MAIL_ACTION_SET = new Set<string>(MAIL_ACTIONS);

/**
 * Adult apps never appear here: OpenClaw Control is a non-adult surface, and NSVX itself filters them on its
 * owner screens. The flag covers registry rows; the names cover sources that carry no flag.
 */
const ADULT_IDS = new Set(["openlove", "openxxx"]);
export const isAdult = (row: { id?: string; app?: string; adult?: boolean | null }) =>
  row.adult === true || ADULT_IDS.has(row.id ?? "") || ADULT_IDS.has(row.app ?? "");

export const shortSha = (sha: string | null | undefined) =>
  sha && /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : null;

const envTone = (status: string): Tone =>
  status === "ok" ? "ok" : status === "down" ? "bad" : status === "degraded" ? "warn" : "off";

export function errorsTone(errors: ErrorsSummary | undefined): Tone {
  if (!errors || errors.status !== "ok") {
    return "off";
  }
  return errors.top.some((row) => row.level === "fatal") ? "bad" : errors.count > 0 ? "warn" : "ok";
}

export const levelTone = (level: string): Tone =>
  level === "fatal" ? "bad" : level === "error" ? "warn" : "off";

/** One overview card: what the NSVX Visão geral card shows, without links out. */
export type AppCard = {
  id: string;
  name: string;
  domain: string;
  health: Tone;
  attention: boolean;
  dev: { tone: Tone; sha: string | null };
  prod: { tone: Tone; sha: string | null };
  ahead: number | null;
  ci: Tone | null;
  prs: { count: number; failing: number } | null;
  errors: { tone: Tone; count: number | null; top: ErrorGroup[] };
  visitors: number | null;
  spark: number[];
  noAdmin: boolean;
  grow: boolean;
};

export function appCard(app: GroupApp): AppCard {
  const gh = app.github;
  const ok = gh.status === "ok";
  const errors = errorsTone(app.errors);
  const ci = ok
    ? (({ success: "ok", failure: "bad", pending: "warn" } as Record<string, Tone | undefined>)[
        gh.develop?.state ?? ""
      ] ?? "off")
    : gh.status === "error"
      ? "warn"
      : null;
  const failing = ok ? (gh.prs?.top.filter((pr) => pr.ci === "failure").length ?? 0) : 0;
  const tones = new Set([envTone(app.prod.status), envTone(app.dev.status), errors, ci ?? "off"]);
  const bad = tones.has("bad") || failing > 0 || app.adapter.envMismatch === true;
  const health: Tone = bad
    ? "bad"
    : tones.has("warn")
      ? "warn"
      : app.status === "ok"
        ? "ok"
        : envTone(app.status);
  const days = app.metrics.status === "ok" ? app.metrics.days : [];
  return {
    id: app.id,
    name: app.name,
    domain: app.domain,
    health,
    attention: health === "bad" || health === "warn",
    dev: { tone: envTone(app.dev.status), sha: shortSha(app.dev.revision) },
    prod: { tone: envTone(app.prod.status), sha: shortSha(app.prod.revision) },
    ahead: ok && typeof gh.aheadBy === "number" && gh.aheadBy > 0 ? gh.aheadBy : null,
    ci,
    prs: ok && gh.prs ? { count: gh.prs.count, failing } : null,
    errors: {
      tone: errors,
      count: app.errors?.status === "ok" ? app.errors.count : null,
      top: app.errors?.top.slice(0, 3) ?? [],
    },
    visitors:
      app.metrics.status === "ok" && typeof app.metrics.visitors === "number"
        ? app.metrics.visitors
        : null,
    spark: days.flatMap((day) => (typeof day.visitors === "number" ? [day.visitors] : [])),
    noAdmin: app.adapter.status === "none",
    grow: app.grow?.enabled === true,
  };
}

const RANK: Record<Tone, number> = { bad: 0, warn: 1, ok: 2, off: 3 };

/** Visible cards, worst first, then by name; adult apps are dropped. */
export function appCards(overview: Overview): AppCard[] {
  return overview.apps
    .filter((app) => !isAdult(app))
    .map(appCard)
    .toSorted((a, b) => RANK[a.health] - RANK[b.health] || a.name.localeCompare(b.name));
}

export function groupSummary(cards: AppCard[]) {
  return {
    total: cards.length,
    online: cards.filter((card) => card.prod.tone === "ok").length,
    attention: cards.filter((card) => card.attention).length,
    errors: cards.reduce((sum, card) => sum + (card.errors.count ?? 0), 0),
    pending: cards.filter((card) => card.ahead !== null).length,
  };
}

/** Points for a 100×24 sparkline; a flat line when every value is equal. */
export function sparkPoints(values: number[], w = 100, h = 24): string {
  if (values.length === 0) {
    return "";
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  return values
    .map(
      (value, i) =>
        `${values.length === 1 ? w / 2 : (i * w) / (values.length - 1)},${(h - 2 - ((value - min) / span) * (h - 4)).toFixed(1)}`,
    )
    .join(" ");
}

/** Dev actions NSVX offers for one app (grow actions only while Grow is on), adult apps none. */
export function devActionsFor(
  actions: DevActions | undefined,
  app: { id: string; grow?: boolean },
) {
  const row = actions?.actions[app.id];
  if (!row || isAdult({ id: app.id, adult: row.adult })) {
    return [];
  }
  return DEV_ACTIONS.flatMap((id) => {
    const state = row[id];
    if (!state || (id.startsWith("grow_") && app.grow === false)) {
      return [];
    }
    return [{ id, available: state.available, reason: state.reason }];
  });
}

/** Lisbon calendar day, as NSVX metrics count days. */
export function lisbonDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function metricRange(days: number, now = new Date()): { from: string; to: string } {
  const to = lisbonDay(now);
  const start = new Date(`${to}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { from: start.toISOString().slice(0, 10), to };
}

/** Per-app daily series of the visible apps, in NSVX order. */
export function metricSeries(metrics: Metrics): [string, MetricDay[]][] {
  return Object.entries(metrics.apps)
    .filter(([id, app]) => !isAdult({ id }) && app.status === "ok")
    .map(([id, app]) => [id, app.days]);
}

export function metricsCsv(series: [string, MetricDay[]][]): string {
  const rows: (string | number)[][] = [["day", "app", "visitors", "new_users", "total_users"]];
  for (const [id, days] of series) {
    for (const day of days) {
      rows.push([day.date, id, day.visitors ?? "", day.newUsers ?? "", day.totalUsers ?? ""]);
    }
  }
  return rows
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
}

/** Gridline steps for a chart whose largest value is `max`. */
export function ticks(max: number): number[] {
  if (!(max > 0)) {
    return [0, 1];
  }
  const raw = max / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((n) => n * power).find((n) => n >= raw) ?? raw;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

export function bytes(value: number): string {
  const index = Math.min(3, Math.max(0, Math.floor(Math.log(Math.max(1, value)) / Math.log(1024))));
  return `${(value / 1024 ** index).toFixed(index === 3 ? 1 : 0)} ${["B", "KB", "MB", "GB"][index]}`;
}

export function serverUsage(metrics: ServerMetrics | undefined) {
  if (!metrics) {
    return undefined;
  }
  const disk =
    metrics.disks.find((d) => d.mount === "/") ??
    metrics.disks.reduce<ServerMetrics["disks"][number] | undefined>(
      (a, b) => (!a || b.total > a.total ? b : a),
      undefined,
    );
  return {
    cpu: Math.round(metrics.cpu),
    ram: metrics.memory.total ? Math.round((metrics.memory.used / metrics.memory.total) * 100) : 0,
    disk: disk ? Math.round(disk.percent) : null,
    uptimeDays: Math.floor(metrics.uptime / 86_400),
  };
}

export const usageTone = (percent: number | null): Tone =>
  percent === null ? "off" : percent >= 90 ? "bad" : percent >= 75 ? "warn" : "ok";

export function serverTone(server: Server): Tone {
  if (server.status === "down") {
    return "bad";
  }
  const usage = serverUsage(server.metrics);
  if (!usage) {
    return server.status === "ok" ? "ok" : "off";
  }
  return [usage.cpu, usage.ram, usage.disk].reduce<Tone>((worst, value) => {
    const tone = usageTone(value);
    return RANK[tone] < RANK[worst] ? tone : worst;
  }, "ok");
}

export const emails = (list: { email: string }[]) => list.map((a) => a.email).join(", ");

/** Mail actions that change something visible for this message (mark read only when unread, and so on). */
export function mailActionsFor(box: Mailbox | undefined, message: MailMessage): MailAction[] {
  return (box?.actions ?? []).filter((action): action is MailAction => {
    if (!MAIL_ACTION_SET.has(action)) {
      return false;
    }
    return !(
      (action === "markRead" && message.unread === false) ||
      (action === "markUnread" && message.unread !== false) ||
      (action === "flag" && message.flagged === true) ||
      (action === "unflag" && message.flagged !== true)
    );
  });
}

/** Plain text of a server-cleaned HTML body, for the native reader (no iframe, no remote images). */
export function mailText(html: string | undefined): string {
  if (!html) {
    return "";
  }
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
