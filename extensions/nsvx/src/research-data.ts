/** NSVX research jobs and delivery settings (`web/src/logic/research.ts`). */
export type ResearchJob = {
  id: string;
  conversation_id: string | null;
  status: string;
  request_text: string;
  prompt?: string | null;
  requester: {
    name: string;
    display_name?: string;
    phone?: string;
    email?: string;
    channel: string;
    account: string;
    thread_id: string;
  };
  runner_data: { model?: string; account?: string; mode?: string; url?: string; stub?: boolean };
  pdf: { name: string; pages: number; bytes: number } | null;
  delivery_status: string;
  cover_message: string | null;
  outbox_id: string | null;
  reason: string | null;
  next_attempt_at?: string;
  events?: { status: string; detail: string | null; at: string }[];
  delivery_detail?: { state: string; state_detail: string | null };
};

export type ResearchSettingsValue = {
  enabled: boolean;
  mode: "allowlist" | "blocklist";
  contacts: string[];
};

export type ResearchSettings = {
  setting: ResearchSettingsValue & { revision: number; account_scope: string };
  requested_scope: string;
  environment: string;
  effective_enabled: boolean;
  inherited: boolean;
  accounts: { id: string; label: string; channel: string }[];
  contacts: { key: string; name: string }[];
  history: { id: number; source: string; at: string; value: ResearchSettingsValue }[];
};

const CLOSED = new Set(["done", "cancelled", "failed"]);
const WAITING = new Set(["failed", "stuck", "waiting_chatgpt_login"]);

export function researchActions(job: ResearchJob) {
  return {
    retry: WAITING.has(job.status),
    cancel: !["done", "cancelled"].includes(job.status),
    send: Boolean(job.pdf) && !job.outbox_id && job.status !== "cancelled",
    resend:
      job.status !== "cancelled" &&
      Boolean(job.pdf) &&
      Boolean(job.outbox_id) &&
      ["sent", "delivered"].includes(job.delivery_status),
    rename: !job.outbox_id && !CLOSED.has(job.status),
  };
}

export type ResearchTone = "ok" | "run" | "warn" | "bad" | "off";

export function researchTone(status: string): ResearchTone {
  if (["done", "sent", "delivered", "pdf_ready", "report_ready"].includes(status)) {
    return "ok";
  }
  if (["failed"].includes(status)) {
    return "bad";
  }
  if (["stuck", "waiting_chatgpt_login", "awaiting_approval", "draft"].includes(status)) {
    return "warn";
  }
  return status === "cancelled" ? "off" : "run";
}

/** The eight steps a job moves through, for the progress bar; off-path states keep the last known step. */
const STEPS = [
  "detected",
  "prompt_ready",
  "submitted",
  "researching",
  "report_ready",
  "pdf_ready",
  "delivery_queued",
  "done",
];
export function researchProgress(job: Pick<ResearchJob, "status" | "events">): number {
  const seen = [...(job.events ?? []).map((event) => event.status), job.status];
  const reached = Math.max(-1, ...seen.map((status) => STEPS.indexOf(status)));
  return Math.round(((reached + 1) / STEPS.length) * 100);
}

export function contactChoices(
  choices: ResearchSettings["contacts"],
  query: string,
  selected: string[],
) {
  const needle = query.trim().toLocaleLowerCase();
  return choices.filter(
    (choice) => selected.includes(choice.key) || choice.name.toLocaleLowerCase().includes(needle),
  );
}

/** A saved "on" that this environment suspends must not read as sending. */
export function deliveryState(
  enabled: boolean,
  saved: boolean,
  effective: boolean,
): "on" | "off" | "suspended" {
  return !enabled ? "off" : saved && !effective ? "suspended" : "on";
}
