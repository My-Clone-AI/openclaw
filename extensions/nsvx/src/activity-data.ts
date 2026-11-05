/** One AUTO task event, as NSVX `GET /api/auto/activity` answers it. */
export type ActivityEvent = {
  id: number;
  at: string;
  kind: string;
  summary: string;
  from_status: string | null;
  to_status: string | null;
  actor: string;
  actor_name: string | null;
  task_id?: string;
  task_title?: string;
  task_status?: string;
};

export type ActivityPage = { items: ActivityEvent[]; next: number | null };

export type WorkflowStep = {
  step_key: string;
  app: string;
  action: string;
  status: string;
  last_error?: string | null;
  updated_at: string;
};

export type Workflow = {
  id: string;
  name: string;
  status: string;
  updated_at: string;
  last_durable_step: string | null;
  steps: WorkflowStep[];
};

export type ActivitySummary = {
  count: number;
  text: string | null;
  unavailable: boolean;
  sources: { id: string; at: string; kind: string; summary: string; status: string | null }[];
  cited: string[];
};

export type FindGroup = "people" | "conversations" | "missions" | "auto" | "documents";
export const FIND_GROUPS: FindGroup[] = [
  "people",
  "conversations",
  "missions",
  "auto",
  "documents",
];

export type FindItem = {
  ref: { kind: string; id: string };
  title: string;
  excerpt: string | null;
  meta: string[];
  updated_at: string | null;
};

export type FindGroupResult = {
  group: FindGroup;
  items: FindItem[];
  total: number | null;
  total_exact?: boolean;
  next: string | null;
  error: string | null;
};

export type FindResult = { groups: FindGroupResult[] };

/** NSVX's shortest search. */
export const FIND_MIN = 2;

export type ActivityFilters = {
  query: string;
  kind: string;
  /** UTC day, `YYYY-MM-DD`, inclusive. */
  start: string;
  end: string;
};

export const NO_FILTERS: ActivityFilters = { query: "", kind: "", start: "", end: "" };

/** Filters loaded entries the way NSVX's Activity list does: text, kind, and UTC day range. */
export function filterActivity(items: ActivityEvent[], filters: ActivityFilters): ActivityEvent[] {
  const needle = filters.query.trim().toLowerCase();
  return items.filter((event) => {
    const day = event.at.slice(0, 10);
    return (
      (!filters.kind || event.kind === filters.kind) &&
      (!filters.start || day >= filters.start) &&
      (!filters.end || day <= filters.end) &&
      (!needle ||
        [event.summary, event.task_title, event.actor_name, event.kind, event.to_status].some(
          (value) => value?.toLowerCase().includes(needle),
        ))
    );
  });
}

export function activityKinds(items: ActivityEvent[]): string[] {
  return [...new Set(items.map((event) => event.kind))].toSorted();
}

/** The UTC days from the oldest to the newest entry, or undefined when there are none. */
export function dayRange(items: ActivityEvent[]): { start: string; end: string } | undefined {
  if (items.length === 0) {
    return undefined;
  }
  const days = items.map((event) => event.at.slice(0, 10)).toSorted();
  return { start: days[0] ?? "", end: days.at(-1) ?? "" };
}

export function exportFileName(start: string, end: string): string {
  return `auto-activity-${start}-${end}.csv`;
}

/** The newest seven UTC days ending today, NSVX's natural review window. */
export function lastWeek(now = new Date()): { start: string; end: string } {
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
  return { start, end };
}
