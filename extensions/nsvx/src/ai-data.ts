import type { AiMark } from "./ai-logos.js";

/**
 * NSVX inference shapes (`/api/ai/state`, `/api/ai/requests`, Clone AI, local training, GPT voice), limited to the
 * fields Control shows. NSVX owns routing; these helpers only read what it reports and never estimate usage.
 */

export const LANES = ["normal", "tasks", "repair", "legal", "pdf_forms"] as const;
export type Lane = (typeof LANES)[number];

export type ChainNode = {
  provider: string;
  model: string;
  effort: string | null;
  label: string;
  subscription: string;
  eligible: boolean;
  reason: string;
  status: string;
  trial: boolean;
  reset_at: string | null;
  active: boolean;
};

export type RunningRequest = {
  id: string;
  task_type: string;
  provider: string | null;
  model: string | null;
  started_at: string;
  first_output_at: string | null;
};

export type LaneState = {
  enabled: boolean;
  policy: Record<string, number>;
  skips?: Record<string, { reason: string; at: string }>;
  chain: ChainNode[];
  next: { provider: string; model: string } | null;
  running: RunningRequest[];
  require_approval?: boolean;
  approval_mode?: boolean;
  source_chain?: Lane;
};

export type UsageWindow = { utilization?: number | null; resetsAt?: number | null };

export type Provider = {
  id: string;
  name: string;
  subscription: string;
  state: string;
  enabled: boolean;
  account?: boolean;
  preferred?: boolean;
  email?: string | null;
  detected_email?: string | null;
  error_category?: string | null;
  last_ok_at?: string | null;
  quota: {
    scope: string;
    state: string;
    reset_at: string | null;
    windows: Record<string, UsageWindow>;
  }[];
  quota_usage?: { checked_at: number; error?: string; windows: Record<string, UsageWindow> };
};

export type AiStats = {
  window_hours: number;
  total: number;
  ok: number;
  failed: number;
  avg_latency_ms: number | null;
  time_to_first_output_ms: number | null;
  switches: number;
  exhaustions: number;
};

export type AiHealth = { at: number; alerts: string[]; tasks_due: number; drafts_due: number };

export type AiState = {
  providers: Provider[];
  lanes: Partial<Record<Lane, LaneState>>;
  stats: AiStats;
  health?: AiHealth | null;
};

export type AiRequest = {
  id: string;
  lane: Lane;
  task_type: string;
  provider: string | null;
  model: string | null;
  actual_model?: string | null;
  effort: string | null;
  status: "running" | "ok" | "failed" | "unavailable" | "limited" | "cancelled" | "interrupted";
  attempts: number;
  error_category: string | null;
  started_at: string;
  duration_ms: number | null;
};

export type CloneAiPanel = {
  host: string;
  device: {
    available?: boolean;
    device?: {
      registered?: boolean;
      busy?: boolean;
      heartbeat_age_s?: number;
      heartbeat_ttl_s?: number;
      resources?: { memory_free_pct?: number | null; disk_free_bytes?: number | null };
    } | null;
  };
  shim: { ok: boolean; mac_online: boolean | null };
  routing: {
    enabled: boolean;
    lanes: { lane: string; position: number; eligible: boolean; reason: string; active: boolean }[];
  };
  promotion: {
    state: string;
    rollback_available: boolean;
    promoted_at: string | null;
    canary: { passed: number; total: number } | null;
    window: { attempts: number; failed: number; timeouts: number } | null;
  };
  training: {
    items: {
      id: string;
      status: string;
      created_at: string | null;
      chart: { cases: number; reference: number; clone_ai: number } | null;
    }[];
  };
  action?: { state: string; changed: boolean };
};

export const TRAINING_MODELS = ["qwen35-4b", "qwen3-8b"] as const;
export type TrainingModel = (typeof TRAINING_MODELS)[number];

export type TrainingRun = {
  id: string;
  model: TrainingModel;
  status: "queued" | "running" | "prepared" | "failed" | "cancelled" | "revoked" | "unconfirmed";
  created_at: string;
  evaluation: null | {
    state: "rejected" | "review_required";
    scores: { baseline: number; candidate: number };
    cases: number;
  };
};

export type OpenClawProviders = {
  hash: string;
  providers: {
    id: string;
    kind: string;
    blocked: boolean;
    models: { id: string; name?: string }[];
  }[];
  cloneAi: { registered: boolean; healthy: boolean };
};

export type GptVoiceSettings = {
  model: string;
  voice: string;
  style: string;
  language: string;
  length: string;
  instructions: string;
  autoplay: boolean;
  mic_input: boolean;
  max_seconds: number;
  connect_timeout_s: number;
  daily_usd: number;
  max_per_hour: number;
};

export type GptVoice = {
  settings: GptVoiceSettings;
  status: {
    key_present: boolean;
    spend_today_usd: string;
    daily_usd: number;
    routing: { label: string; channel: string; ready: boolean }[];
  };
  options: {
    models: string[];
    voices: string[];
    styles: string[];
    languages: string[];
    lengths: string[];
  };
};

/** Clone AI bench (`/bench/dashboard`): the Mac's live training state and its latest runs. */
export type CloneAiBench = {
  status: { status: string; live: boolean; stale: boolean };
  mac_online: boolean;
  runs: {
    source_id: string;
    kind: string;
    state: string;
    progress: number;
    measured_at: string | null;
  }[];
};

export const BENCH_COMMANDS = ["start", "pause", "resume"] as const;
export type BenchCommand = (typeof BENCH_COMMANDS)[number];

/** The run NSVX's Clone AI admin shows progress for: the newest training or auto run. */
export function trainingRun(bench: CloneAiBench) {
  return bench.runs.find((run) => run.kind === "training" || run.kind === "auto");
}

export type Parity = "odd" | "even";
export type AccountLists = { codex: string[]; claude: string[] };

/** NSVX `openclaw_admin/server_accounts.py` document: which subscription accounts each server's agents use. */
export type ServerDocument = {
  categories: Record<Parity, AccountLists>;
  servers: { id: string; production: boolean; parity: Parity | null }[];
  overrides: Record<string, Partial<AccountLists>>;
};

/** `/api/ai/inference-ops`: the work, chat, and Grow models, every lane's chain, and the server accounts. */
export type InferenceOps = {
  work: { provider: string; model: string; effort: string; label: string };
  lanes: {
    id: Lane;
    work: boolean;
    chain: { provider: string; model: string; effort: string | null; label: string }[];
  }[];
  grow: { model: string; effort: string };
  serverAccounts: {
    document: ServerDocument;
    resolved: {
      id: string;
      production: boolean;
      parity: Parity | null;
      accounts: AccountLists | null;
    }[];
  };
  gateway: { hosts: string[]; available_here: boolean; workModel: string; chatModel: string };
};

/** `/api/ai/api-keys`: apps and guests calling NSVX inference with their own `nsvx_` keys; prefixes only. */
export type AiKeys = {
  available_here: boolean;
  settings: { enabled: boolean; default_rpm: number; default_tokens_per_day: number };
  users: { id: string; name: string; active: boolean }[];
  keys: {
    id: string;
    user_id: string;
    label: string | null;
    prefix: string;
    state: "active" | "expired" | "revoked";
    last_used_at: string | null;
  }[];
  usage: {
    keys: {
      key_id: string;
      requests: number;
      ok: number;
      tokens_today: number;
      p50_ms: number | null;
    }[];
  };
};

/** The document NSVX's PUT server-accounts takes after moving one server to `parity`, or `undefined` if unknown. */
export function withParity(doc: ServerDocument, serverId: string, parity: Parity | null) {
  if (!doc.servers.some((server) => server.id === serverId)) {
    return undefined;
  }
  return {
    ...doc,
    servers: doc.servers.map((server) => (server.id === serverId ? { ...server, parity } : server)),
  };
}

export type Tone = "ok" | "run" | "info" | "warn" | "bad" | "off";

export function lanesOf(lanes: AiState["lanes"]): Lane[] {
  return LANES.filter((lane) => lanes[lane]);
}

/** The node answering now, or the one NSVX picks for the next request. */
export function currentNode(lane: LaneState): ChainNode | undefined {
  return (
    lane.chain.find((n) => n.active) ??
    lane.chain.find((n) => n.provider === lane.next?.provider && n.model === lane.next?.model)
  );
}

/** NSVX's reason codes (state.evaluate) reduced to a tone and one short word key. */
export function nodeState(n: ChainNode): { tone: Tone; key: string } {
  if (n.active) {
    return { tone: "run", key: "s_active" };
  }
  if (n.eligible) {
    return n.status === "ready" && !n.trial
      ? { tone: "ok", key: "s_ready" }
      : { tone: "info", key: "s_check" };
  }
  switch (n.reason) {
    case "exhausted":
    case "uninstalled":
    case "model_unavailable":
    case "billing_refused":
    case "provider_unsupported":
      return { tone: "bad", key: n.reason === "exhausted" ? "s_exhausted" : "s_broken" };
    case "rate_limited":
      return { tone: "warn", key: "s_limited" };
    case "auth_required":
      return { tone: "warn", key: "s_signIn" };
    case "skipped":
      return { tone: "off", key: "s_skipped" };
    default:
      return { tone: "off", key: "s_off" };
  }
}

/** Provider states NSVX reports (PROVIDER_STATE in web/src/logic/ai.ts). */
export function providerState(p: Provider): { tone: Tone; key: string } {
  if (!p.enabled) {
    return { tone: "off", key: "s_off" };
  }
  switch (p.state) {
    case "AVAILABLE":
      return { tone: "ok", key: "s_ready" };
    case "ACTIVE":
      return { tone: "run", key: "s_active" };
    case "CONNECTED":
    case "RESET_PENDING":
      return { tone: "info", key: "s_check" };
    case "AUTH_REQUIRED":
    case "DISCONNECTED":
      return { tone: "warn", key: "s_signIn" };
    case "RATE_LIMITED":
      return { tone: "warn", key: "s_limited" };
    case "EXHAUSTED":
      return { tone: "bad", key: "s_exhausted" };
    default:
      return { tone: "bad", key: "s_broken" };
  }
}

const READING_MAX_AGE_S = 300;

/**
 * Provider-reported usage, 0..1 per window; a stale or failed reading is `null`, never a guess. Live readings
 * (`quota_usage`) win over the stored account quota, as in NSVX's usageWindows.
 */
export function usage(
  p: Provider,
  now = Date.now(),
): { key: string; used: number | null; resetsAt: string | null }[] {
  const live = p.quota_usage;
  const windows =
    live?.windows ??
    p.quota.find((q) => q.scope === "account")?.windows ??
    ({} as Record<string, UsageWindow>);
  const fresh =
    !live ||
    (!live.error &&
      now / 1000 - live.checked_at >= 0 &&
      now / 1000 - live.checked_at < READING_MAX_AGE_S);
  return Object.entries(windows).map(([key, w]) => ({
    key,
    used:
      fresh && typeof w.utilization === "number" && Number.isFinite(w.utilization)
        ? Math.max(0, Math.min(1, w.utilization))
        : null,
    resetsAt: w.resetsAt ? new Date(w.resetsAt * 1000).toISOString() : null,
  }));
}

/** The brand mark for a provider id; extra accounts ("openai-2") share their provider's mark. */
export function markOf(provider: string | null | undefined): AiMark | "clone" | "muse" {
  const base = (provider ?? "").replace(/-\d+$/, "");
  switch (base) {
    case "openai":
      return "openai";
    case "anthropic":
      return "claude";
    case "google":
      return "gemini";
    case "mac-local":
      return "apple";
    case "muse":
      return "muse";
    default:
      return "clone";
  }
}

/** The body NSVX's PUT /api/ai/lanes/{lane} takes after moving node `from` by `by` places. */
export function movedChain(chain: ChainNode[], from: number, by: -1 | 1) {
  const to = from + by;
  const next = chain.map(({ provider, model, effort }) => ({ provider, model, effort }));
  if (to < 0 || to >= next.length) {
    return undefined;
  }
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

export function successRate(stats: AiStats): number | null {
  const settled = stats.ok + stats.failed;
  return settled > 0 ? stats.ok / settled : null;
}

export function seconds(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) {
    return "—";
  }
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
}

/** Time left until a provider-stated reset ("2h 05", "40m"); empty when NSVX gave no time. */
export function untilReset(iso: string | null | undefined, now = Date.now()): string {
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(at) || at <= now) {
    return "";
  }
  const minutes = Math.round((at - now) / 60_000);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 48
    ? `${hours}h ${String(minutes % 60).padStart(2, "0")}`
    : `${Math.round(hours / 24)}d`;
}
