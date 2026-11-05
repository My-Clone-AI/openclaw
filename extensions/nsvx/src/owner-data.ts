import type { IconName, T } from "./ui-kit.js";

/** Field names follow the NSVX owner screens (`/api/today`, `/api/missions`, `/api/tarefas-ao-vivo`). */
export type Mission = {
  id: string;
  title: string;
  status: string;
  next_step?: string | null;
  waiting_on?: string | null;
  updated_at?: string;
  progress?: { stalled_steps?: number } | null;
  pending_approvals?: number;
  pending_decisions?: number;
  pending_requests?: number;
};

export type TodayData = {
  paused?: boolean;
  subscription_limited_jobs?: number;
  owner_requests?: {
    id: string;
    question: string;
    mission_id?: string | null;
    message_from?: string | null;
    message_channel?: string | null;
    created_at?: string;
  }[];
  approvals?: {
    id: string;
    kind?: string;
    mission_id?: string | null;
    payload?: { text?: string } | null;
    created_at?: string;
  }[];
  decisions?: {
    id: string;
    mission_id?: string;
    mission_title?: string;
    purpose?: string | null;
    payee?: string | null;
    amount_minor?: number | null;
    currency?: string | null;
    created_at?: string;
  }[];
  needs_owner?: Mission[];
  handling?: Mission[];
  done?: Mission[];
  delivery_alerts?: { id: string; channel?: string; reason?: string; waiting?: number }[];
};

export type Row = {
  id: string;
  icon: IconName;
  title: string;
  detail?: string | null;
  at?: string;
  mission?: string | null;
  tone?: "bad" | "warn" | "ok";
};

export type Section = "decide" | "ask" | "working" | "done" | "alert";

function money(minor: number | null | undefined, currency: string | null | undefined) {
  if (typeof minor !== "number" || !currency) {
    return undefined;
  }
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${minor / 100} ${currency}`;
  }
}

export function todaySections(data: TodayData, t: T): Record<Section, Row[]> {
  const mission = (m: Mission, icon: IconName, tone?: Row["tone"]): Row => ({
    id: m.id,
    icon,
    title: m.title,
    detail: m.next_step ?? m.waiting_on,
    at: m.updated_at,
    mission: m.id,
    ...(tone ? { tone } : {}),
  });
  const limited = data.subscription_limited_jobs ?? 0;
  return {
    decide: [
      ...(data.decisions ?? []).map((d) => ({
        id: d.id,
        icon: "decide" as const,
        title: d.mission_title ?? t("decision"),
        detail: [d.purpose ?? d.payee, money(d.amount_minor, d.currency)]
          .filter(Boolean)
          .join(" · "),
        at: d.created_at,
        mission: d.mission_id,
      })),
      ...(data.approvals ?? []).map((a) => ({
        id: a.id,
        icon: "ask" as const,
        title: a.payload?.text ?? t("draft"),
        detail: t("draft"),
        at: a.created_at,
        mission: a.mission_id,
      })),
    ],
    ask: [
      ...(data.owner_requests ?? []).map((r) => ({
        id: r.id,
        icon: "ask" as const,
        title: r.question,
        detail: [r.message_from, r.message_channel].filter(Boolean).join(" · "),
        at: r.created_at,
        mission: r.mission_id,
      })),
      ...(data.needs_owner ?? []).map((m) => mission(m, "decide", "warn")),
    ],
    working: (data.handling ?? []).map((m) =>
      mission(m, "work", (m.progress?.stalled_steps ?? 0) > 0 ? "warn" : undefined),
    ),
    done: (data.done ?? []).map((m) => mission(m, "done", "ok")),
    alert: [
      ...(data.delivery_alerts ?? []).map((a) => ({
        id: a.id,
        icon: "alert" as const,
        title: a.channel ?? t("alert"),
        detail: a.reason,
        tone: "bad" as const,
      })),
      ...(limited > 0
        ? [{ id: "limited", icon: "pause" as const, title: t("limited"), detail: String(limited) }]
        : []),
    ],
  };
}

export type MissionFilter = "active" | "needs" | "done" | "all";
const CLOSED = new Set(["completed", "cancelled", "failed"]);

export function missionFilter(filter: MissionFilter, mission: Mission) {
  switch (filter) {
    case "active":
      return !CLOSED.has(mission.status);
    case "needs":
      return (
        mission.status === "needs_owner" ||
        (mission.pending_approvals ?? 0) +
          (mission.pending_decisions ?? 0) +
          (mission.pending_requests ?? 0) >
          0
      );
    case "done":
      return CLOSED.has(mission.status);
    default:
      return true;
  }
}
