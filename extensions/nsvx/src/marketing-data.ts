import { isAdult } from "./group-data.js";

/** NSVX marketing admin shapes (`web/src/screens/MarketingAdmin.tsx`). */
export type MarketingHealth = {
  ok?: boolean;
  admission?: string;
  code?: string;
  models?: { image?: string; video?: string };
};

export type MarketingOverview = {
  dry_run: boolean;
  live_publish: boolean;
  live_block: string;
  development: boolean;
  cadence_hours: number | null;
  horizon_hours: number;
  slots: number;
  active_jobs: number;
  paused_campaigns: number;
  worker: { configured: boolean; health: MarketingHealth | null };
};

export type MarketingGate = {
  live_allowed: boolean;
  killed: boolean;
  dry_run: boolean;
  activations: { app: string; armed: boolean; mode: string }[];
};

export type MarketingBrand = {
  app: string;
  name: string;
  domain: string | null;
  logo: string | null;
  adult?: boolean;
};

export type MarketingSlot = {
  id: string;
  app_id: string;
  slot: string;
  state: string;
  content_id: string | null;
  kind: string | null;
  caption: string | null;
  job_id: string | null;
  job_state: string | null;
};

export type SocialStatus = "connected" | "pending" | "unavailable" | "failed";

export type SocialCell = {
  status: SocialStatus;
  state?: string;
  blocked_label?: string | null;
  account_url?: string | null;
  account_handle?: string | null;
  last_ok_at?: string | null;
  token_expires_at?: string | null;
  publish_mode?: string | null;
  setup_steps_done?: number;
  setup_steps_total?: number;
};

export type SocialNetwork = { code: string; label: string };
export type SocialApp = { app: string; cells: Record<string, SocialCell> };
export type MarketingChannels = {
  matrix: { networks: SocialNetwork[]; apps: SocialApp[] };
};

export type Counts = Record<string, number>;
export type MarketingAnalytics = { jobs: Counts; posts: Counts; schedule: Counts };

export type GenerateResult = {
  id: string;
  state: string;
  app_id: string;
  content_id: string;
};

export type PreviewResult = { ok: boolean; body: string | null; codes: string[] };

/** NSVX's own short list of main networks, as its "Brief 11" filter. */
export const MAIN_NETWORKS = new Set(
  "facebook instagram youtube tiktok whatsapp telegram x linkedin snapchat pinterest reddit".split(
    " ",
  ),
);

/**
 * OpenClaw Control is a non-adult surface. NSVX filters its own adult list, and openlove (which it treats as SFW) is
 * still an adult brand under the group's separation rule, so each list drops them here too.
 */
const notAdultApp = (app: string) => !isAdult({ app });
export const safeBrands = (rows: MarketingBrand[]) =>
  rows.filter((row) => !isAdult({ app: row.app, adult: row.adult }));
export const safeSlots = (rows: MarketingSlot[]) => rows.filter((row) => notAdultApp(row.app_id));
export const safeSocialApps = (rows: SocialApp[]) => rows.filter((row) => notAdultApp(row.app));
export const safeActivations = (rows: MarketingGate["activations"]) =>
  rows.filter((row) => notAdultApp(row.app));
export const safeInventory = <R extends { app: string }>(rows: R[]) =>
  rows.filter((row) => notAdultApp(row.app));

export function isAdultApp(app: string): boolean {
  return isAdult({ app });
}

export function socialCounts(app: SocialApp, networks: SocialNetwork[]) {
  const counts: Record<SocialStatus, number> = {
    connected: 0,
    pending: 0,
    unavailable: 0,
    failed: 0,
  };
  for (const network of networks) {
    counts[app.cells[network.code]?.status ?? "unavailable"] += 1;
  }
  return counts;
}

/** Publishing is live only with the global switch up and no stop: the words Control shows match NSVX's rule. */
export function gateMode(
  gate: Pick<MarketingGate, "live_allowed" | "killed">,
): "stopped" | "live" | "test" {
  return gate.killed ? "stopped" : gate.live_allowed ? "live" : "test";
}

export function countRows(counts: Counts | undefined): { key: string; value: number }[] {
  return Object.entries(counts ?? {})
    .map(([key, value]) => ({ key, value }))
    .toSorted((a, b) => b.value - a.value);
}
