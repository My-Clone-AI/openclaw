import type { ChainRoute } from "./ai-client.js";

/** Field names follow NSVX `/api/ai/state` (web/src/logic/ai.ts); only the fields Control shows. */
export type ChainNode = {
  priority: number;
  provider: string;
  model: string;
  effort: string | null;
  label: string;
  eligible: boolean;
  reason: string;
  status: string;
  trial?: boolean;
  reset_at: string | null;
  active: boolean;
};

export type LaneState = {
  enabled: boolean;
  skips: Record<string, { reason: string; at: string }>;
  chain: ChainNode[];
  next: { provider: string; model: string } | null;
  running: { id: string }[];
};

type UsageWindow = { utilization?: number | null; resetsAt?: number | null };

export type Provider = {
  id: string;
  name: string;
  subscription: string;
  state: string;
  enabled: boolean;
  billing: string;
  email?: string | null;
  preferred?: boolean;
  account?: boolean;
  error: string | null;
  last_ok_at: string | null;
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
  switches: number;
  exhaustions: number;
};

export type AiState = {
  providers: Provider[];
  lanes: Record<string, LaneState>;
  stats: AiStats;
  health?: { alerts: string[]; ai_waiting: boolean } | null;
};

export type AiRequestRow = {
  id: string;
  lane: string;
  provider: string | null;
  model: string | null;
  status: string;
  task_type?: string | null;
  started_at: string;
  finished_at?: string | null;
  error_category?: string | null;
};

export type Tone = "ok" | "busy" | "warn" | "bad" | "off";

/** NSVX's own lane order on Apps → IA; lanes NSVX adds later follow in its order. */
const LANE_ORDER = ["normal", "tasks", "repair", "legal", "pdf_forms"];

export function laneIds(lanes: Record<string, unknown>): string[] {
  const known = LANE_ORDER.filter((lane) => lane in lanes);
  return [...known, ...Object.keys(lanes).filter((lane) => !LANE_ORDER.includes(lane))];
}

/** Mirrors nodeState in NSVX web/src/logic/ai.ts, reduced to one tone and one reason key. */
export function nodeTone(node: ChainNode): { tone: Tone; key: string } {
  if (node.active) {
    return { tone: "busy", key: "answering" };
  }
  if (node.eligible) {
    return node.status === "ready" && !node.trial
      ? { tone: "ok", key: "ready" }
      : { tone: "warn", key: "checking" };
  }
  switch (node.reason) {
    case "exhausted":
    case "uninstalled":
    case "model_unavailable":
    case "billing_refused":
    case "provider_unsupported":
      return { tone: "bad", key: node.reason };
    case "rate_limited":
    case "auth_required":
      return { tone: "warn", key: node.reason };
    case "skipped":
      return { tone: "off", key: "skipped" };
    default:
      return { tone: "off", key: "waiting" };
  }
}

export function moveRoute(chain: ChainNode[], from: number, to: number): ChainRoute[] | undefined {
  if (from === to || to < 0 || to >= chain.length || from < 0 || from >= chain.length) {
    return undefined;
  }
  const next = chain.map(({ provider, model, effort }) => ({ provider, model, effort }));
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

const FRESH_USAGE_S = 300;

/** Used share (0..1) of each subscription window; null when NSVX has no fresh measurement. */
export function usageWindows(
  provider: Provider,
  nowMs = Date.now(),
): { key: string; used: number | null; resetsAt: string | null }[] {
  const usage = provider.quota_usage;
  const fresh =
    usage && !usage.error && nowMs / 1000 - usage.checked_at >= 0
      ? nowMs / 1000 - usage.checked_at < FRESH_USAGE_S
      : false;
  const windows = usage
    ? fresh
      ? usage.windows
      : Object.fromEntries(Object.keys(usage.windows ?? {}).map((key) => [key, {}]))
    : (provider.quota.find((row) => row.scope === "account")?.windows ?? {});
  return Object.entries(windows).map(([key, window]) => {
    const value = (window as UsageWindow).utilization;
    const resetsAt = (window as UsageWindow).resetsAt;
    return {
      key,
      used:
        typeof value === "number" && Number.isFinite(value)
          ? Math.max(0, Math.min(1, value))
          : null,
      resetsAt: typeof resetsAt === "number" ? new Date(resetsAt * 1000).toISOString() : null,
    };
  });
}

export function providerTone(provider: Provider): Tone {
  if (!provider.enabled) {
    return "off";
  }
  if (provider.quota.some((row) => row.state === "exhausted")) {
    return "bad";
  }
  if (provider.state === "CONNECTED" || provider.state === "AVAILABLE") {
    return provider.quota.some((row) => row.state === "rate_limited") ? "warn" : "ok";
  }
  return provider.state === "AUTH_REQUIRED" ? "warn" : "bad";
}

/** Brand initial and hue for a provider family; NSVX ids look like `anthropic-2` or `mac-local`. */
export function providerMark(id: string): { letter: string; family: string } {
  const base = id.replace(/-\d+$/, "");
  switch (base) {
    case "anthropic":
      return { letter: "A", family: "anthropic" };
    case "openai":
      return { letter: "O", family: "openai" };
    case "google":
      return { letter: "G", family: "google" };
    case "muse":
      return { letter: "M", family: "muse" };
    case "mac-local":
    case "clone-ai":
      return { letter: "C", family: "clone" };
    default:
      return { letter: base.slice(0, 1).toUpperCase() || "?", family: "other" };
  }
}

/** A compact, content-free view for chat: who answers each lane, in which order, and why others wait. */
export function summarizeAi(state: AiState) {
  return {
    lanes: laneIds(state.lanes).map((id) => {
      const lane = state.lanes[id]!;
      return {
        lane: id,
        enabled: lane.enabled,
        running: lane.running.length,
        next: lane.next,
        skipped: Object.keys(lane.skips ?? {}),
        chain: lane.chain.map((node, index) => ({
          position: index + 1,
          provider: node.provider,
          model: node.model,
          effort: node.effort,
          state: nodeTone(node).key,
          resetAt: node.reset_at,
        })),
      };
    }),
    accounts: state.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      enabled: provider.enabled,
      state: provider.state,
      preferred: provider.preferred === true,
      usage: usageWindows(provider),
    })),
    stats: state.stats,
    alerts: state.health?.alerts ?? [],
  };
}
