/** Field names follow NSVX `/api/conversations*` and `/api/quick-reply*` (backend/clone/api.py, social_api.py). */

/** Channels NSVX lists in Messages, in its own order. */
export const MESSAGE_CHANNELS = ["whatsapp", "instagram", "telegram", "gmail"] as const;

export type ConversationSummary = {
  id: string;
  title?: string | null;
  /** `direct`, `group`, or `thread`. */
  kind: string;
  channel: string;
  account_label?: string | null;
  mode?: string | null;
  last_at?: string | null;
  last_body?: string | null;
  person?: string | null;
  person_id?: string | null;
  contact?: string | null;
  pending?: number | null;
  outstanding?: number | null;
  paused?: boolean;
};

export type ConversationPage = { items: ConversationSummary[]; next: string | null; total: number };

export type Message = {
  id: string;
  direction: "inbound" | "outbound";
  /** `agent`, `human`, or `system` for outbound messages. */
  origin?: string | null;
  sent_at: string;
  body?: string | null;
  sender?: string | null;
  media?: unknown[] | null;
  tombstone?: boolean;
  deleted_at?: string | null;
  delivery_status?: "sent" | "delivered" | "read" | "failed" | "indeterminate" | null;
  reply_status?: string | null;
};

export type OutboxItem = {
  id: string;
  state: string;
  payload?: { text?: string | null; manual?: boolean } | null;
  revision?: string | null;
  state_detail?: string | null;
  created_at?: string;
  updated_at?: string | null;
};

export type Conversation = {
  id: string;
  title?: string | null;
  kind: string;
  channel: string;
  account_label?: string | null;
  account_state?: string | null;
  paused?: boolean;
  owner_takeover_until?: string | null;
  window_applies?: boolean;
  window_expires_at?: string | null;
  messages: Message[];
  outbox: OutboxItem[];
  message_page?: { has_older: boolean; before: string | null };
};

export type QuickReplyGeneration = {
  id: string;
  state: string;
  error_code?: string | null;
  trace?: { error_message?: string } | null;
};

export type QuickReplyDraft = {
  id: string;
  revision: number;
  state: string;
  updated_at?: string;
  channel: "email" | "message" | "telegram";
  inbound: string;
  subject?: string;
  sender_name?: string;
  reply?: { language: string; subject: string | null; body: string; signature: string } | null;
  copy_text?: string;
  generations?: QuickReplyGeneration[];
};

/** Quick Reply's three styles, chosen the way NSVX maps a message source. */
export function quickReplyChannel(channel: string): QuickReplyDraft["channel"] {
  return channel === "gmail" ? "email" : channel === "telegram" ? "telegram" : "message";
}

export function conversationName(c: Pick<ConversationSummary, "person" | "title" | "contact">) {
  return c.person || c.title || c.contact || "?";
}

/** Waiting replies, as NSVX counts them: the larger of pending messages and open obligations. */
export function waiting(c: Pick<ConversationSummary, "pending" | "outstanding">) {
  return Math.max(Number(c.pending) || 0, Number(c.outstanding) || 0);
}

/** NSVX's list sections: known people, groups, then senders not yet linked to a person. */
export function groupConversations(items: ConversationSummary[]) {
  return {
    people: items.filter((c) => c.kind !== "group" && c.person_id),
    groups: items.filter((c) => c.kind === "group"),
    unknown: items.filter((c) => c.kind !== "group" && !c.person_id),
  };
}

export type Author = "them" | "clone" | "me" | "system";

export function authorOf(m: Pick<Message, "direction" | "origin">): Author {
  if (m.direction === "inbound") {
    return "them";
  }
  return m.origin === "agent" ? "clone" : m.origin === "human" ? "me" : "system";
}

/** Clone drafts waiting for the owner, and sends not yet confirmed, as NSVX splits the outbox. */
export function splitOutbox(outbox: OutboxItem[]) {
  return {
    review: outbox.filter((o) => o.state === "awaiting_approval"),
    sending: outbox.filter((o) => o.state !== "awaiting_approval"),
  };
}

export function takeoverActive(c: Pick<Conversation, "owner_takeover_until">, now = Date.now()) {
  const until = c.owner_takeover_until ? Date.parse(c.owner_takeover_until) : Number.NaN;
  return !Number.isNaN(until) && until > now;
}

/** WhatsApp's 24-hour window: closed means NSVX refuses a free-form reply. */
export function windowOpen(
  c: Pick<Conversation, "window_applies" | "window_expires_at">,
  now = Date.now(),
) {
  if (!c.window_applies) {
    return true;
  }
  const until = c.window_expires_at ? Date.parse(c.window_expires_at) : Number.NaN;
  return !Number.isNaN(until) && until > now;
}

/** A reply is still being written; a failed job stops it even if the draft was not reset. */
export function isPreparing(draft: Pick<QuickReplyDraft, "state" | "generations">) {
  const latest = draft.generations?.[0];
  return draft.state === "generating" && (!latest || ["queued", "running"].includes(latest.state));
}

export function failedGeneration(draft: Pick<QuickReplyDraft, "state" | "reply" | "generations">) {
  const latest = draft.generations?.[0];
  return !draft.reply && latest && ["blocked", "failed"].includes(latest.state)
    ? latest.trace?.error_message?.trim() || latest.error_code || "failed"
    : undefined;
}

/** Reply body and signature, for a conversation composer (the subject line stays out). */
export function replyBody(draft: Pick<QuickReplyDraft, "reply">) {
  const reply = draft.reply;
  return reply ? [reply.body.trim(), reply.signature.trim()].filter(Boolean).join("\n\n") : "";
}

/** Ready to paste anywhere, with the email subject on top as NSVX formats it. */
export function replyText(draft: Pick<QuickReplyDraft, "reply" | "copy_text">) {
  return draft.copy_text || replyBody(draft);
}

/**
 * Fills sender, subject, and style from a pasted email, WhatsApp, or Telegram copy, like NSVX's detectPastedMessage.
 * Local hints only: the pasted body is never treated as an instruction.
 */
export function detectPasted(raw: string): {
  channel: QuickReplyDraft["channel"];
  sender: string;
  subject: string;
} {
  const lines = raw.replace(/\r\n?/g, "\n").trim().split("\n").slice(0, 40);
  const end = lines.findIndex((line) => !line.trim());
  const header = lines.slice(0, end < 0 ? lines.length : end).map((line) => line.trim());
  const clean = (value: string) =>
    value
      .replace(/\s*<[^>]*>\s*$/, "")
      .replace(/^"|"$/g, "")
      .trim()
      .slice(0, 300);
  let sender = "";
  let subject = "";
  for (const line of header) {
    const from = line.match(/^(?:from|de|remetente|sender)\s*:\s*(.+)$/i);
    const title = line.match(/^(?:subject|assunto|asunto|objet)\s*:\s*(.*)$/i);
    if (from && !sender) {
      sender = clean(from[1] ?? "");
    }
    if (title && !subject) {
      subject = (title[1] ?? "").slice(0, 300);
    }
  }
  const whatsapp = lines[0]?.match(
    /^\[?\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\]?\s*(?:-\s*)?([^:\n]{1,100}):/,
  );
  if (whatsapp) {
    return { channel: "message", sender: (whatsapp[1] ?? "").trim(), subject: "" };
  }
  const telegram = lines[0]?.match(/^([^,\n]{1,100}),\s*\[\d{1,2}[/.]\d{1,2}[/.]\d{2,4}[^\]]*\]/);
  if (telegram) {
    return { channel: "telegram", sender: (telegram[1] ?? "").trim(), subject: "" };
  }
  const mail = header.some((line) =>
    /^(?:from|de|remetente|sender|subject|assunto|asunto|objet)\s*:/i.test(line),
  );
  return { channel: mail ? "email" : "message", sender, subject };
}
