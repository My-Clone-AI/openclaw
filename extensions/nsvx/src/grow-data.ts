/**
 * NSVX Grow, Build Me, and OpenClaw brain payloads (`/api/grow`, `/api/build-me/admin`, `/api/v1/admin/ai/openclaw`),
 * with the pure mappings the Grow tab and the `nsvx_grow` tool share. Shapes follow NSVX `grow/views.py`,
 * `build_me/api.py` (`projection`), and `inference/openclaw_api.py`.
 */

export const GROW_MODES = ["off", "dry-run", "canary", "on"] as const;
export type GrowMode = (typeof GROW_MODES)[number];

export type GrowCycle = {
  id: number;
  app: string;
  status: string;
  reason: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationS: number | null;
  prNumber: number | null;
  prUrl: string | null;
  mergeSha: string | null;
  summary: string | null;
};

export type GrowApp = {
  id: string;
  mode: GrowMode;
  effectiveMode: GrowMode;
  modeOverride: GrowMode | null;
  paused: boolean;
  nextSlot: string | null;
  running: GrowCycle | null;
  cycles: GrowCycle[];
  last: GrowCycle | null;
};

export type GrowStatus = {
  provisioned: boolean;
  have?: { config: boolean; state: boolean; inbox: boolean };
  kill: boolean;
  pendingKill?: boolean | null;
  pendingRequests: number;
  apps: Record<string, GrowApp>;
  awaitingLogin?: string[];
};

export type GrowLog = {
  app: string;
  cycle: number | null;
  file: string | null;
  lines: string[];
  running: boolean;
};

export type GrowTimer = {
  app: string;
  name: string;
  timer: string;
  enabled: boolean;
  schedule: string;
  next_run: string | null;
  last_run: string | null;
  status: "ok" | "failed" | "paused" | "never-run";
  read_only: boolean;
};

export type GrowTimers = { apps: Record<string, GrowTimer[]>; helper: string };

export type GrowRoute = { provider: string; model: string; effort: string | null };
export type GrowChains = {
  slots: Record<
    string,
    { slot: string; chain: GrowRoute[]; version: number; effective: GrowRoute[] }
  >;
};

export type Tone = "ok" | "run" | "bad" | "off";
export type CycleWord =
  | "merged"
  | "dry"
  | "none"
  | "running"
  | "queued"
  | "skipped"
  | "review"
  | "stopped"
  | "failed";

/** NSVX `cycleState`: every engine status maps to one word and one tone. */
export function cycleState(status: string | undefined): { tone: Tone; word: CycleWord } {
  switch (status) {
    case "merged":
      return { tone: "ok", word: "merged" };
    case "dry-run-done":
      return { tone: "ok", word: "dry" };
    case "no-changes":
      return { tone: "ok", word: "none" };
    case "running":
      return { tone: "run", word: "running" };
    case "queued":
      return { tone: "run", word: "queued" };
    case "skipped":
      return { tone: "off", word: "skipped" };
    case "needs-attention":
      return { tone: "bad", word: "review" };
    case "killed":
    case "aborted":
      return { tone: "bad", word: "stopped" };
    default:
      return { tone: "bad", word: "failed" };
  }
}

/** Clone first, then by name, as NSVX lists them. */
export function growRows(status: GrowStatus | undefined): GrowApp[] {
  return Object.values(status?.apps ?? {}).toSorted((a, b) =>
    a.id === "clone" ? -1 : b.id === "clone" ? 1 : a.id.localeCompare(b.id),
  );
}

/** A pending stop or start counts before the engine applies it. */
export const growStopped = (status: GrowStatus) => Boolean(status.pendingKill ?? status.kill);

/** Run now is offered only while the engine runs and the app is not off (NSVX refuses it otherwise). */
export const canRunNow = (status: GrowStatus, app: GrowApp) =>
  !status.kill && !status.pendingKill && app.effectiveMode !== "off";

export function duration(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) {
    return "—";
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.round(seconds / 60);
  return minutes < 60
    ? `${minutes}m`
    : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

/** Next slot in Lisbon wall time, as NSVX shows it: "14:00" today, otherwise "Fri 02:00". */
export function slotLabel(
  iso: string | null | undefined,
  locale: string,
  now = new Date(),
): string {
  const at = iso ? new Date(iso) : undefined;
  if (!at || Number.isNaN(at.getTime())) {
    return "—";
  }
  const timeZone = "Europe/Lisbon";
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
  return day(at) === day(now)
    ? time
    : `${new Intl.DateTimeFormat(locale, { timeZone, weekday: "short" }).format(at)} ${time}`;
}

/** Pull request links only to github.com over https (NSVX `safePR`). */
export function safePr(url: string | null | undefined): string | null {
  try {
    const u = new URL(url ?? "");
    return u.protocol === "https:" &&
      u.hostname === "github.com" &&
      !u.username &&
      !u.password &&
      /^\/[\w.-]+\/[\w.-]+\/pull\/[1-9]\d*$/.test(u.pathname)
      ? u.href
      : null;
  } catch {
    return null;
  }
}

export const shortSha = (sha: string | null | undefined) =>
  sha && /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : null;

// ---------------------------------------------------------------- Build Me

export const IDEA_STEPS = [
  "submitted",
  "screening",
  "evaluating",
  "accepted",
  "building",
  "testing",
  "in_review",
  "merged_develop",
  "live",
] as const;
export type IdeaState =
  | (typeof IDEA_STEPS)[number]
  | "rejected"
  | "needs_info"
  | "failed"
  | "held"
  | "blocked"
  | "shipped";

export type Idea = {
  id: string;
  app_id: string;
  source: "local" | "replica";
  title: string;
  description: string;
  state: IdeaState;
  progress?: number;
  held: boolean;
  priority?: number;
  revision: number;
  version: number;
  created_at: string;
  updated_at: string;
  reasons: string[];
  specification: {
    title: string;
    problem: string;
    user_story: string;
    acceptance_criteria: string[];
  } | null;
  attachments: { id: string; revision: number }[];
  pr_url: string | null;
  submitter_kind?: "user" | "guest" | null;
  audit?: { action: string; reason: string; actor: string; created_at: string }[];
  build_log?: string[];
};

export type IdeaList = {
  items: Idea[];
  apps: string[];
  more: boolean;
  page: number;
  kpis?: { app_id: string; state: string; n: number; today: number; week: number }[];
};

export const IDEA_ACTIONS = [
  "approve",
  "reject",
  "retry",
  "priority",
  "merge-to-develop",
  "block-submitter",
] as const;
export type IdeaAction = (typeof IDEA_ACTIONS)[number];

/** NSVX `PROGRESS` per state. */
const IDEA_PROGRESS: Record<IdeaState, number> = {
  submitted: 5,
  screening: 10,
  evaluating: 20,
  accepted: 35,
  building: 55,
  testing: 75,
  in_review: 85,
  merged_develop: 95,
  live: 100,
  shipped: 100,
  held: 10,
  rejected: 20,
  needs_info: 20,
  failed: 20,
  blocked: 0,
};

export const ideaProgress = (idea: Pick<Idea, "state" | "progress">) =>
  idea.progress ?? IDEA_PROGRESS[idea.state] ?? 0;

export function ideaTone(idea: Pick<Idea, "state" | "held">): Tone {
  if (idea.held) {
    return "off";
  }
  switch (idea.state) {
    case "live":
    case "shipped":
    case "merged_develop":
      return "ok";
    case "rejected":
    case "needs_info":
    case "failed":
    case "blocked":
      return "bad";
    default:
      return "run";
  }
}

/** Which owner decisions NSVX accepts in this state (`override` in build_me/api.py). */
export function ideaActions(idea: Idea): IdeaAction[] {
  if (idea.source === "replica") {
    return [];
  }
  const out: IdeaAction[] = [];
  if (["rejected", "evaluating", "failed"].includes(idea.state)) {
    out.push("approve");
  }
  if (!["rejected", "live", "shipped", "merged_develop", "blocked"].includes(idea.state)) {
    out.push("reject");
  }
  if (idea.held || idea.state === "failed" || idea.state === "held") {
    out.push("retry");
  }
  if (idea.state === "in_review") {
    out.push("merge-to-develop");
  }
  out.push("priority");
  if (idea.submitter_kind === "guest") {
    out.push("block-submitter");
  }
  return out;
}

/** Ideas per state across apps, from NSVX's own counts (never from one page). */
export function ideaCounts(
  list: IdeaList | undefined,
): Record<"all" | "open" | "done" | "bad", number> {
  const counts = { all: 0, open: 0, done: 0, bad: 0 };
  for (const row of list?.kpis ?? []) {
    counts.all += row.n;
    const tone = ideaTone({ state: row.state as IdeaState, held: row.state === "held" });
    counts[tone === "ok" ? "done" : tone === "bad" ? "bad" : "open"] += row.n;
  }
  return counts;
}

// ---------------------------------------------------------------- OpenClaw brain

export const BRAIN_ROLES = ["code", "alt", "debug", "review"] as const;
export type BrainRole = (typeof BRAIN_ROLES)[number];
/** NSVX `ENGINES`; NSVX validates every change against the same set. */
export const BRAIN_ENGINES = [
  "codex-terra-medium",
  "muse-spark-1.3-xhigh",
  "claude-opus-5.5-medium",
  "claude-opus-5.5-review",
] as const;
export type BrainEngine = (typeof BRAIN_ENGINES)[number];

/** The brand mark that names an engine; Codex has none in the shared set. */
export function engineBrand(engine: string): "claude" | "meta" | undefined {
  return engine.startsWith("claude") ? "claude" : engine.startsWith("muse") ? "meta" : undefined;
}

type Row = Record<string, unknown>;
export type BrainStatus = {
  generated?: string;
  stale?: boolean;
  openclaw?: { online?: boolean } & Row;
  clone_ai?: { health?: { upstream?: { mac_online?: boolean } } };
  agents?: {
    pipeline?: string[];
    agents?: {
      id: string;
      title?: string;
      icon?: string;
      engine?: string;
      role?: string;
      locked?: boolean;
      owns?: string[];
    }[];
  };
  architecture?: { pipeline?: string[]; nodes?: string[]; edges?: string[][] };
  flows?: { recent?: { id: string; title?: string; status?: string; stage?: string }[] };
  workers?: {
    codex_slot_running?: number;
    codex_slot_waiting?: number;
    jobs?: {
      by_status?: Record<string, number>;
      recent?: { id: string; role?: string; status?: string; model?: string; attempts?: number }[];
    };
  };
  automations?: { brain_tick?: boolean; brain_lock_timer?: boolean; paused?: boolean };
  blocked_actions?: { id?: string; action?: string; needs_scope?: string }[];
  recovery_actions?: { component?: string; msg?: string; event?: string }[];
};

/** Architecture nodes in layers by distance from the first node, for a diagram without fixed coordinates. */
export function brainLayers(arch: BrainStatus["architecture"]): string[][] {
  const name = (node: string) => node.replace(/\s*\(.*/, "");
  const nodes = (arch?.nodes ?? []).filter((node) => typeof node === "string");
  if (nodes.length === 0) {
    return [];
  }
  const names = nodes.map(name);
  const depth = new Map<string, number>([[names[0] ?? "", 0]]);
  // Each pass reaches one more step; as many passes as nodes reach every connected one.
  for (const _ of names) {
    for (const [from, to] of arch?.edges ?? []) {
      const d = from === undefined ? undefined : depth.get(from);
      if (d !== undefined && to !== undefined && !depth.has(to)) {
        depth.set(to, d + 1);
      }
    }
  }
  const layers: string[][] = [];
  const last = Math.max(0, ...depth.values());
  names.forEach((node) => {
    const layer = depth.get(node) ?? last + 1;
    (layers[layer] ??= []).push(node);
  });
  return layers.filter(Boolean);
}
