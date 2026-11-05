/** NSVX call shapes (`voice_api.py`, `phone_lookup`) and the pure rules the Calls tab and nsvx_calls share. */

export type CallsStatus = {
  enabled: boolean;
  voice_enabled: boolean;
  gemini_ready?: boolean;
  outgoing_blocker?: string | null;
  kill_switch: string | null;
  model: string;
  public_flight_schedule?: boolean;
  budget: {
    daily_usd: number;
    monthly_usd: number;
    max_call_seconds: number;
    max_concurrent: number;
  };
  spend_today_usd: string;
  spend_month_usd: string;
  owner_pin_set: boolean;
  carrier_ready: boolean;
  from_number: string | null;
  allowed_prefixes: string[];
  phone_routes?: {
    carrier: string;
    provider: string;
    configured: boolean;
    provider_ready: boolean;
    direction: string;
    blocker?: string | null;
  }[];
  active: ActiveCall[];
};

export type ActiveCall = {
  id: string;
  state: string;
  label: string;
  channel: string;
  direction: string;
  caller: string | null;
};

export type CallRow = {
  id: string;
  state: string;
  label: string;
  channel: string;
  direction: string;
  who: string | null;
  person_id?: string | null;
  purpose: string | null;
  started_at: string;
  ended_at: string | null;
  cost_usd: string;
  cost_estimated?: boolean;
  outcome: string | null;
  n_turns: number;
  model?: string | null;
};

export type CallTurn = {
  id: number;
  role: string;
  text: string;
  status: string;
  speaker?: string | null;
  rev_seq?: number | null;
  played_ms?: number | null;
  at: string;
};

export type CallAction = {
  kind: string;
  status: string;
  command_id?: string;
  mission_id?: string | null;
  request_id?: string;
};

export type CallDetail = Omit<CallRow, "n_turns"> & {
  turns: CallTurn[];
  actions?: CallAction[];
  tools: { name: string; status: string; result_summary: { sources?: string[] } | null }[];
  messages: { who: string | null; text: string; at: string }[];
  rev?: number;
  media_state?: string | null;
};

export type CallRecording = {
  id: string;
  state: string;
  duration_ms: number | null;
  retention_until: string | null;
  created_at: string;
};

export type CallPolicyChoice = "ask" | "off";

export type SocialCallsStatus = {
  enabled: boolean;
  kill_switch: string | null;
  policy: {
    auto_answer: boolean;
    ai_processing: CallPolicyChoice;
    transcription: CallPolicyChoice;
    recording: CallPolicyChoice;
    retention_days: number;
  };
  accounts: {
    channel: string;
    account_id: string | null;
    account_label: string | null;
    configured: boolean;
    eligible: boolean;
    tested: boolean;
    available: boolean;
    reason: string | null;
    reason_pt: string | null;
    checks: { name: string; ok: boolean; label: string | null }[];
  }[];
};

export const PHONE_KINDS = [
  "company",
  "delivery",
  "telemarketing_spam",
  "personal",
  "public_service",
  "unknown",
] as const;
export type PhoneKind = (typeof PHONE_KINDS)[number];

export type PhoneCard = {
  id: string;
  e164: string;
  name: string | null;
  kind: PhoneKind;
  confidence: number;
  origin: string | null;
  person_id: string | null;
  expires_at: string | null;
  last_lookup_at: string | null;
  error: string | null;
  number_info: {
    region?: string;
    country_code?: number;
    geo?: string;
    number_type?: string;
    carrier?: string;
  };
  sources: { title: string; url: string; type: string; verified: boolean; snippet?: string }[];
  internal_matches: {
    type: string;
    name?: string;
    title?: string;
    person_id?: string;
    conversation_id?: string;
    snippet?: string;
  }[];
  owner_override?: { note?: string } | null;
  provider: { enabled: boolean; cost_usd: string | null; cap_usd: string | null };
};

/** NSVX's terminal call states (`controller.TERMINAL`); anything else is still live. */
export const TERMINAL = [
  "ended",
  "error",
  "rejected",
  "busy",
  "no_answer",
  "failed",
  "cancelled",
  "transferred",
] as const;
export const SOCIAL_CHANNELS = ["whatsapp", "telegram", "instagram"] as const;
export const TRANSPORTS = ["pstn", "sip", "browser", ...SOCIAL_CHANNELS] as const;
export const RETENTION_DAYS = [7, 30, 90, 365] as const;

export const isLive = (state: string) => !(TERMINAL as readonly string[]).includes(state);
export const isSocial = (channel: string) =>
  (SOCIAL_CHANNELS as readonly string[]).includes(channel);
/** Mute and take over exist only on app calls; telephone calls may share private context instead. */
export const isPhoneLine = (channel: string) => channel === "pstn" || channel === "sip";

export type CallTone = "ok" | "run" | "warn" | "bad" | "off";

export function callTone(state: string): CallTone {
  if (isLive(state)) {
    return "run";
  }
  if (state === "ended") {
    return "ok";
  }
  return state === "rejected" || state === "cancelled" ? "off" : "bad";
}

export const usd = (value: string | number) => `$${Number(value).toFixed(2)}`;

export function duration(ms: number | null | undefined): string {
  const seconds = Math.round((ms ?? 0) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Today's spend as a 0-100 share of the daily cap; 0 when no cap is set. */
export function spendShare(status: CallsStatus): number {
  const cap = status.budget.daily_usd;
  return cap > 0 ? Math.min(100, (Number(status.spend_today_usd) / cap) * 100) : 0;
}

/**
 * Why a new phone call cannot start, in NSVX's own order (`Calls.tsx` disables Ligar on each): no voice engine, no
 * carrier, phone off, or no budget. Null when a call can start.
 */
export function dialBlocker(
  status: CallsStatus,
): "voice" | "carrier" | "off" | "budget" | "stopped" | null {
  if (status.outgoing_blocker) {
    return "voice";
  }
  if (!status.carrier_ready) {
    return "carrier";
  }
  if (!status.enabled) {
    return "off";
  }
  if (!(status.budget.daily_usd > 0)) {
    return "budget";
  }
  return status.kill_switch ? "stopped" : null;
}

/** Inbound calls from a bare number with no person: the rows where NSVX offers "Who called?". */
export function unknownNumber(row: Pick<CallRow, "direction" | "person_id" | "who">) {
  const who = row.who ?? "";
  return (
    row.direction === "inbound" &&
    !row.person_id &&
    /^\+?[\d ().-]+$/.test(who) &&
    who.replace(/\D/g, "").length >= 7
  );
}

/** Calls grouped by local day, newest first, as NSVX's history lists them. */
export function byDay<R extends { started_at: string }>(rows: readonly R[], locale: string) {
  const groups = new Map<string, { key: string; label: string; rows: R[] }>();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  for (const row of rows) {
    const at = new Date(row.started_at);
    const key = at.toDateString();
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label:
          key === today
            ? "today"
            : key === yesterday
              ? "yesterday"
              : at.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" }),
        rows: [],
      };
      groups.set(key, group);
    }
    group.rows.push(row);
  }
  return [...groups.values()];
}

/** Merges a timeline read after `rev` into the turns already shown: a re-sent turn replaces its older copy. */
export function mergeTurns(previous: readonly CallTurn[], next: readonly CallTurn[]): CallTurn[] {
  const byId = new Map(previous.map((turn) => [turn.id, turn]));
  for (const turn of next) {
    byId.set(turn.id, turn);
  }
  return [...byId.values()].toSorted((a, b) => a.id - b.id);
}

/** A call's result status as one of the tab's tones (`ACTION_LABELS` in NSVX). */
export function actionTone(status: string): CallTone {
  if (["created", "attendees_notified", "completed", "concluído"].includes(status)) {
    return "ok";
  }
  if (["failed", "falhou"].includes(status)) {
    return "bad";
  }
  if (["a ser tratado", "planned"].includes(status)) {
    return "run";
  }
  return ["registado", "answered", "cancelado", "superseded"].includes(status) ? "off" : "warn";
}

/** NSVX's result kinds (`ACTION_NAMES` in `Calls.tsx`), as catalog words. */
type ActionKind =
  | "meeting"
  | "change_meeting"
  | "document"
  | "reply"
  | "followup"
  | "task"
  | "contact"
  | "message";

export const ACTION_KIND: Partial<Record<string, ActionKind>> = {
  meeting: "meeting",
  change_meeting: "change_meeting",
  document: "document",
  reply: "reply",
  followup: "followup",
  tarefa: "task",
  "pedido ao dono": "contact",
  recado: "message",
};

/** The carrier lookup's price, or null when NSVX offers none. */
export function paidCost(card: PhoneCard): string | null {
  return card.provider.enabled ? (card.provider.cost_usd ?? card.provider.cap_usd) : null;
}
