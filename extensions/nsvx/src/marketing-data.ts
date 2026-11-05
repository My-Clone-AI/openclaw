/** NSVX marketing admin (`/api/group-companies/marketing`) shapes, shared by the Group Marketing view and the tool. */

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
  worker: {
    configured: boolean;
    health: {
      ok?: boolean;
      admission?: string;
      code?: string;
      models?: { image?: string; video?: string };
    } | null;
  };
};

export type MarketingGate = {
  live_allowed: boolean;
  killed: boolean;
  dry_run: boolean;
  activations: { app: string; armed: boolean; mode: string }[];
};

export type Brand = { app: string; name: string; domain: string | null; logo: string | null };

export type Slot = {
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
  publish_mode?: string | null;
};
export type Channels = {
  matrix: { networks: { code: string; label: string }[]; apps: { app: string; cells: Record<string, SocialCell> }[] };
};

export type Counts = Record<string, number>;
export type Analytics = { jobs: Counts; posts: Counts; schedule: Counts };

export type Generated = {
  id: string;
  state: string;
  app_id: string;
  content_id: string;
  lineage?: { campaign_id: string; content_id: string; job_id: string };
};

export const SOCIAL_STATUSES: SocialStatus[] = ["connected", "pending", "failed", "unavailable"];

/** The 11 networks of the owner's marketing brief, shown first; the rest stay one tap away. */
export const MAIN_NETWORKS = new Set(
  "facebook instagram youtube tiktok whatsapp telegram x linkedin snapchat pinterest reddit".split(" "),
);

export function socialCounts(cells: Record<string, SocialCell>, networks: string[]) {
  const counts: Record<SocialStatus, number> = { connected: 0, pending: 0, failed: 0, unavailable: 0 };
  for (const code of networks) {
    counts[cells[code]?.status ?? "unavailable"] += 1;
  }
  return counts;
}

export const total = (counts: Counts | undefined) =>
  Object.values(counts ?? {}).reduce((sum, n) => sum + n, 0);
