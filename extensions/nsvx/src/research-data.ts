/** NSVX Pesquisas (`/api/research`) shapes and the same action rules the NSVX screen applies. */

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
  runner_data: { model?: string; account?: string; mode?: string; stub?: boolean };
  pdf: { name: string; pages: number; bytes: number } | null;
  delivery_status: string;
  cover_message: string | null;
  outbox_id: string | null;
  reason: string | null;
  next_attempt_at?: string;
  created_at?: string;
  events?: { status: string; detail: string | null; at: string }[];
  delivery_detail?: { state: string; state_detail: string | null };
};

export type ResearchSettingValue = {
  enabled: boolean;
  mode: "allowlist" | "blocklist";
  contacts: string[];
};

export type ResearchSettings = {
  setting: ResearchSettingValue & { revision: number; account_scope: string };
  requested_scope: string;
  environment: string;
  effective_enabled: boolean;
  inherited: boolean;
  accounts: { id: string; label: string; channel: string }[];
  contacts: { key: string; name: string }[];
  history: { id: number; source: string; at: string; value: ResearchSettingValue }[];
};

export type ResearchTone = "ok" | "warn" | "bad" | "busy" | "off";

const TONES: Record<string, ResearchTone> = {
  done: "ok",
  delivered: "ok",
  sent: "ok",
  report_ready: "ok",
  pdf_ready: "ok",
  failed: "bad",
  stuck: "bad",
  cancelled: "off",
  draft: "off",
  waiting_chatgpt_login: "warn",
  awaiting_approval: "warn",
};

export const researchTone = (state: string): ResearchTone => TONES[state] ?? "busy";

/** The four steps a report goes through, for the progress strip. */
export const RESEARCH_STAGES = ["asked", "researching", "report", "delivered"] as const;

export function researchStage(job: Pick<ResearchJob, "status" | "pdf" | "delivery_status">) {
  if (["sent", "delivered", "done"].includes(job.delivery_status) || job.status === "done") {
    return 3;
  }
  if (job.pdf || ["report_ready", "pdf_ready", "awaiting_approval", "delivery_queued"].includes(job.status)) {
    return 2;
  }
  if (["submitting", "submitted", "researching", "waiting_chatgpt_login"].includes(job.status)) {
    return 1;
  }
  return 0;
}

/** Which actions NSVX accepts now (mirrors `researchActions` in NSVX's research logic). */
export function researchActions(job: ResearchJob) {
  return {
    retry: ["failed", "stuck", "waiting_chatgpt_login"].includes(job.status),
    cancel: !["done", "cancelled"].includes(job.status),
    send: !!job.pdf && !job.outbox_id && job.status !== "cancelled",
    resend:
      job.status !== "cancelled" &&
      !!job.pdf &&
      !!job.outbox_id &&
      ["sent", "delivered"].includes(job.delivery_status),
  };
}

/** NSVX locks the name once a delivery exists or the job ended. */
export const nameLocked = (job: ResearchJob) =>
  !!job.outbox_id || ["done", "cancelled", "failed"].includes(job.status);

/** Contacts matching the search, keeping the selected ones visible. */
export function contactChoices(
  choices: ResearchSettings["contacts"],
  query: string,
  selected: string[],
) {
  const needle = query.trim().toLocaleLowerCase();
  return choices.filter(
    (c) => selected.includes(c.key) || c.name.toLocaleLowerCase().includes(needle),
  );
}
