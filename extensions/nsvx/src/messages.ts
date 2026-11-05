import { setTimeout as delay } from "node:timers/promises";
import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";
import type {
  Conversation,
  ConversationPage,
  QuickReplyDraft,
  QuickReplyGeneration,
} from "./messages-data.js";
import { isPreparing, quickReplyChannel } from "./messages-data.js";

/** NSVX's own takeover choices (minutes; null = until released, 0 = hand back). */
const TAKEOVER_MINUTES = [0, 30, 120, 1440, 10080, null] as const;

const ID = /^[\w-]{1,100}$/;

function id(value: unknown, name: string): string {
  if (typeof value !== "string" || !ID.test(value)) {
    throw new NsvxError("invalid", `${name} is required.`);
  }
  return value;
}

function text(raw: unknown, name: string, max: number, required = false): string {
  const value = raw ?? "";
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) {
    throw new NsvxError("invalid", `${name} must be text up to ${max} characters.`);
  }
  return value;
}

export function listConversations(
  client: NsvxClient,
  params: { q?: string; unanswered?: boolean; channel?: string; after?: string },
): Promise<ConversationPage> {
  return client.readOwnerView("conversations", {
    limit: "60",
    q: params.q,
    channel: params.channel,
    after: params.after,
    ...(params.unanswered ? { state: "outstanding" } : {}),
  });
}

export function readConversation(client: NsvxClient, conversationId: string, before?: string) {
  return client.readOwnerView<Conversation>("conversation", {
    id: conversationId,
    message_limit: "60",
    ...(before ? { message_before: before } : {}),
  });
}

/**
 * The owner's own message, sent as written. NSVX dedupes on `idempotencyKey`, so a caller that saw an uncertain
 * result repeats with the same key and never sends twice.
 */
export async function sendReply(client: NsvxClient, params: Record<string, unknown>) {
  return client.writeOwner<{ ok: boolean; outbox_id: string; state: string }>(
    "reply",
    id(params.conversationId, "conversationId"),
    {
      text: text(params.text, "text", 8000, true),
      attachment_ids: [],
      idempotency_key: text(params.idempotencyKey, "idempotencyKey", 100, true),
      reply_to_message_id:
        params.replyTo === undefined || params.replyTo === null
          ? null
          : id(params.replyTo, "replyTo"),
    },
  );
}

export async function setTakeover(client: NsvxClient, params: Record<string, unknown>) {
  const minutes = params.minutes ?? null;
  if (!TAKEOVER_MINUTES.includes(minutes as never)) {
    throw new NsvxError("invalid", "minutes must be 0, 30, 120, 1440, 10080, or null.");
  }
  return client.writeOwner("takeover", id(params.conversationId, "conversationId"), { minutes });
}

/** `expected_paused` makes NSVX refuse a toggle another device already made. */
export async function setAutoReply(client: NsvxClient, params: Record<string, unknown>) {
  if (typeof params.on !== "boolean") {
    throw new NsvxError("invalid", "on must be true or false.");
  }
  return client.writeOwner("autoReply", id(params.conversationId, "conversationId"), {
    paused: !params.on,
    expected_paused: params.on,
  });
}

/** Approves a clone draft as reviewed; NSVX rejects it (409) when the draft changed since `revision`. */
export async function approveDraft(client: NsvxClient, params: Record<string, unknown>) {
  return client.writeOwner<{ ok: boolean; state: string }>(
    "approve",
    id(params.outboxId, "outboxId"),
    {
      ...(params.text === undefined ? {} : { text: text(params.text, "text", 8000, true) }),
      ...(typeof params.revision === "string"
        ? { revision: text(params.revision, "revision", 200) }
        : {}),
    },
  );
}

export async function rejectDraft(client: NsvxClient, params: Record<string, unknown>) {
  return client.writeOwner("reject", id(params.outboxId, "outboxId"), {});
}

/** Queues one reply generation for the draft's current version under NSVX's current rules. */
async function generate(
  client: NsvxClient,
  draft: Pick<QuickReplyDraft, "id" | "revision">,
  key: string,
  refinement: string,
) {
  const rules = await client.readOwnerView<{ revision: number }>("quickReplyRules");
  return client.writeOwner<QuickReplyGeneration>("quickReplyGenerate", draft.id, {
    revision: draft.revision,
    rule_revision: rules.revision,
    key,
    ...(refinement ? { refinement } : {}),
  });
}

/**
 * Creates a Quick Reply draft and asks NSVX to write the reply. Nothing is sent: the reply is text to copy or to
 * put in the composer. Either pasted text or a conversation message is the source.
 */
export async function startQuickReply(client: NsvxClient, params: Record<string, unknown>) {
  const key = text(params.key, "key", 100, true);
  if (key.length < 8) {
    throw new NsvxError("invalid", "key must have at least 8 characters.");
  }
  const messageId = params.messageId === undefined ? undefined : id(params.messageId, "messageId");
  const inbound = text(params.inbound, "inbound", 24000, messageId === undefined);
  const channel =
    typeof params.channel === "string" && ["email", "message", "telegram"].includes(params.channel)
      ? params.channel
      : quickReplyChannel(typeof params.sourceChannel === "string" ? params.sourceChannel : "");
  const draft = await client.writeOwner<QuickReplyDraft>("quickReplyCreate", undefined, {
    channel,
    inbound,
    subject: text(params.subject, "subject", 300),
    sender_name: text(params.sender, "sender", 300),
    reply_guidance: text(params.guidance, "guidance", 2000),
    ...(messageId ? { source: { kind: "message", id: messageId } } : {}),
  });
  return { draft, generation: await generate(client, draft, key, "") };
}

/** Writes the reply again for the draft as it is now, optionally with a change ("shorter", "in English"). */
export async function regenerateQuickReply(client: NsvxClient, params: Record<string, unknown>) {
  const key = text(params.key, "key", 100, true);
  const draft = await client.readOwnerView<QuickReplyDraft>("quickReplyDraft", {
    id: id(params.draftId, "draftId"),
  });
  return {
    draft,
    generation: await generate(client, draft, key, text(params.refinement, "refinement", 2000)),
  };
}

export async function deleteQuickReply(client: NsvxClient, params: Record<string, unknown>) {
  return client.writeOwner("quickReplyDelete", id(params.draftId, "draftId"), {});
}

/** Reads the draft until its reply is written or the generation stops, within `timeoutMs`. */
export async function waitForQuickReply(
  client: NsvxClient,
  draftId: string,
  options: { timeoutMs: number; intervalMs: number; sleep?: (ms: number) => Promise<void> },
): Promise<QuickReplyDraft> {
  const sleep = options.sleep ?? delay;
  const deadline = Date.now() + options.timeoutMs;
  for (;;) {
    const draft = await client.readOwnerView<QuickReplyDraft>("quickReplyDraft", { id: draftId });
    if (!isPreparing(draft) || Date.now() >= deadline) {
      return draft;
    }
    await sleep(options.intervalMs);
  }
}
