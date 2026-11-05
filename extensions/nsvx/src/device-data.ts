/** Shapes of NSVX `/api/desktop/*`, `/api/sync/*`, health, and legal answers, shared by Gateway and page. */

/** NSVX's own avatar set for desktop bots (`desktop_sync.Definition.avatar`). */
export const AVATARS = ["✦", "●", "◆", "▲", "■", "★"] as const;
export type Avatar = (typeof AVATARS)[number];

export type BotDefinition = {
  name: string;
  description: string;
  persona: string;
  section: string;
  avatar: Avatar;
};

/** A null definition is a deleted bot's tombstone; restoring it is a save against its version. */
export type DesktopBot = {
  id: string;
  version: number;
  definition: BotDefinition | null;
  updated_at: string;
};

export type JobState = "queued" | "running" | "done" | "failed" | "stopped";
export const JOB_FILTERS = ["running", "queued", "finished"] as const;
export type JobFilter = (typeof JOB_FILTERS)[number];

export type DesktopJob = {
  id: string;
  bot_id: string;
  kind: string;
  label: string;
  state: JobState;
  progress: number;
  stop_requested: boolean;
  created_at: string;
  updated_at: string;
};

export const MEMORY_KINDS = ["recall", "profile", "journal", "facts"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export type MemoryItem = {
  id: string;
  uri: string;
  snippet: string;
  level: "L0" | "L1" | "L2";
  source: string;
  confidence: number;
};

export type Skill = {
  id: string;
  slug: string;
  name: string;
  when_to_use: string | null;
  version: string;
  updated_at: string;
};

export type SkillDetail = Skill & { body: string | null; steps: unknown; content_hash: string };

/** Trimmed `/api/sync/changes` windows: what the page and chat need, never the full message history. */
export type SyncOverview = {
  cursor: string;
  counts: Record<
    "conversations" | "tasks" | "missions" | "contacts" | "captures" | "drafts",
    number
  >;
  held: { id: string; title: string; description: string; updated_at: string }[];
  drafts: {
    id: string;
    conversation_id: string;
    conversation: string | null;
    channel: string | null;
    text: string;
    created_at: string;
  }[];
  tasks: { id: string; title: string; status: string; version: string }[];
  contacts: { id: string; name: string; version: string }[];
  conversations: { id: string; title: string | null; channel: string | null }[];
  missions: { id: string; title: string; status: string; next_step: string | null }[];
  captures: { id: string; status: string; context: string | null; created_at: string }[];
};

/** Each probe stands alone: one that cannot be read is null, never a clean bill of health. */
export type HealthOverview = {
  address: string;
  checkedAt: string;
  live: { ok: boolean; revision: string | null; contracts: Record<string, string | number> } | null;
  ready: {
    ready: boolean;
    failing: string[];
    checks: Record<string, boolean> | null;
    digest: string | null;
    capabilitiesFailed: string[];
  } | null;
  runtime: {
    revision: string | null;
    development: boolean;
    limitations: string[];
    whatsappWarnings: number | null;
    instagram: { binding: string; warnings: string[]; expires: string | null }[] | null;
  } | null;
};

export const LEGAL_PAGES = ["privacy", "terms", "cookies", "data-deletion"] as const;
export type LegalPageId = (typeof LEGAL_PAGES)[number];
export const LEGAL_LANGS = ["pt", "en"] as const;

export type LegalRun = { text: string; href?: string; strong?: true };
export type LegalBlock =
  | { kind: "p"; runs: LegalRun[] }
  | { kind: "list"; items: LegalRun[][] }
  | { kind: "table"; head: string[]; rows: string[][] };
export type LegalPage = {
  title: string;
  updated: string;
  sections: { id: string; title: string; blocks: LegalBlock[] }[];
};

export function jobActive(job: Pick<DesktopJob, "state">) {
  return job.state === "queued" || job.state === "running";
}

export function jobTone(job: Pick<DesktopJob, "state" | "stop_requested">) {
  if (job.state === "failed") {
    return "bad";
  }
  if (job.state === "running") {
    return job.stop_requested ? "warn" : "run";
  }
  return job.state === "done" ? "ok" : "muted";
}
