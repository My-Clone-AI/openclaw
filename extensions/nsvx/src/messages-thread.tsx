/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { LegalReplyButton } from "./legal-reply.js";
import {
  authorOf,
  canLegalReview,
  isPreparing,
  replyBody,
  splitOutbox,
  takeoverActive,
  windowOpen,
  type Conversation,
  type Message,
  type OutboxItem,
  type QuickReplyDraft,
} from "./messages-data.js";
import type { MessagesKey, MT } from "./messages-i18n.js";
import { Avatar, every, ownerChange, Speak, waitForDraft } from "./messages-ui.js";
import { createSource, Icon, SourceView, type T } from "./ui-kit.js";

const THREAD_REFRESH_MS = 15_000;

type Notice = { text: string; bad?: boolean } | undefined;

function Bubble(props: {
  m: Message;
  day: string | undefined;
  mt: MT;
  locale: string;
  drafting: boolean;
  onReplyTo: (m: Message) => void;
  onDraft: (m: Message) => void;
}) {
  const author = () => authorOf(props.m);
  const withdrawn = () => Boolean(props.m.tombstone || props.m.deleted_at);
  const time = () =>
    new Date(props.m.sent_at).toLocaleTimeString(props.locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  const tick = () =>
    props.m.direction === "outbound" && props.m.delivery_status
      ? props.m.delivery_status
      : undefined;
  return (
    <li class={["nsvx-msg", `nsvx-msg--${author()}`]}>
      <Show when={props.day}>
        <p class="nsvx-msg__day">{props.day}</p>
      </Show>
      <div class="nsvx-msg__bubble">
        <Show when={author() !== "them"}>
          <span class="nsvx-msg__author">
            <Icon name={author() === "clone" ? "bot" : "send"} />
            {props.mt(author() === "clone" ? "clone" : author() === "me" ? "you" : "system")}
          </span>
        </Show>
        <Show when={author() === "them" && props.m.sender}>
          <span class="nsvx-msg__author">{props.m.sender}</span>
        </Show>
        <Show
          when={!withdrawn()}
          fallback={<p class="nsvx-msg__body nsvx-msg__body--gone">{props.mt("withdrawn")}</p>}
        >
          <Show when={props.m.body}>
            <p class="nsvx-msg__body">{props.m.body}</p>
          </Show>
          <Show when={(props.m.media?.length ?? 0) > 0}>
            <span class="nsvx__chip">
              {props.mt("attachment")} · {props.m.media?.length}
            </span>
          </Show>
        </Show>
        <span class="nsvx-msg__meta">
          <time datetime={props.m.sent_at}>{time()}</time>
          <Show when={tick()}>
            {(status) => (
              <span class={["nsvx-tick", `nsvx-tick--${status()}`]}>
                {props.mt(TICKS[status()])}
              </span>
            )}
          </Show>
          <Show when={author() === "them" && !withdrawn()}>
            <button
              type="button"
              class="nsvx-msg__action"
              aria-label={props.mt("replyTo")}
              title={props.mt("replyTo")}
              onClick={() => props.onReplyTo(props.m)}
            >
              <Icon name="undo" />
            </button>
            <button
              type="button"
              class="nsvx-msg__action nsvx-msg__action--ai"
              aria-label={props.mt("draft")}
              title={props.mt("draft")}
              disabled={props.drafting}
              onClick={() => props.onDraft(props.m)}
            >
              <Icon name="reply" />
            </button>
          </Show>
        </span>
      </div>
    </li>
  );
}

const TICKS: Record<NonNullable<Message["delivery_status"]>, MessagesKey> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
  indeterminate: "checking",
};

const OUTBOX_LABELS: Record<string, MessagesKey> = {
  approved: "queuedToSend",
  dispatching: "queuedToSend",
  indeterminate: "checking",
  failed: "failed",
  invalidated: "failed",
};

function ReviewCard(props: {
  host: ControlUiHost;
  mt: MT;
  locale: string;
  item: OutboxItem;
  onDone: (notice: Notice) => void;
}) {
  const [text, setText] = createSignal(props.item.payload?.text ?? "");
  const [busy, setBusy] = createSignal(false);
  const act = async (method: "nsvx.messages.approve" | "nsvx.messages.reject") => {
    setBusy(true);
    const original = props.item.payload?.text ?? "";
    const result = await ownerChange(props.host, props.mt, () =>
      props.host.request(method, {
        outboxId: props.item.id,
        ...(method === "nsvx.messages.approve" && text() !== original ? { text: text() } : {}),
        ...(props.item.revision ? { revision: props.item.revision } : {}),
      }),
    );
    setBusy(false);
    props.onDone(
      result.ok
        ? { text: props.mt(method === "nsvx.messages.approve" ? "queuedToSend" : "discarded") }
        : { text: result.message, bad: true },
    );
  };
  return (
    <li class="nsvx-review">
      <span class="nsvx-msg__author">
        <Icon name="bot" />
        {props.mt("clone")}
      </span>
      <textarea
        aria-label={props.mt("toApprove")}
        rows={3}
        value={text()}
        onInput={(event) => setText(event.currentTarget.value)}
      />
      <span class="nsvx-action__buttons">
        <Show when={canLegalReview(props.item)}>
          <LegalReplyButton
            host={props.host}
            locale={props.locale}
            outboxId={props.item.id}
            revision={props.item.revision}
            savedReview={props.item.payload?.legal_review_id}
            text={text()}
            disabled={
              busy() ||
              !props.host.connection.canWrite ||
              Boolean(props.item.payload?.revision_pending)
            }
            onChange={() => props.onDone({ text: props.mt("draftUpdated") })}
          />
        </Show>
        <button
          type="button"
          class="nsvx__button"
          disabled={busy() || !props.host.connection.canWrite}
          onClick={() => void act("nsvx.messages.reject")}
        >
          <Icon name="trash" />
          {props.mt("discard")}
        </button>
        <button
          type="button"
          class="nsvx__button nsvx__button--primary"
          disabled={busy() || !text().trim() || !props.host.connection.canWrite}
          onClick={() => void act("nsvx.messages.approve")}
        >
          <Icon name="send" />
          {props.mt("send")}
        </button>
      </span>
    </li>
  );
}

const TAKEOVER: { minutes: number | null; key: MessagesKey }[] = [
  { minutes: 30, key: "min30" },
  { minutes: 120, key: "h2" },
  { minutes: 1440, key: "d1" },
  { minutes: 10080, key: "d7" },
  { minutes: null, key: "untilBack" },
];

function Handling(props: {
  host: ControlUiHost;
  mt: MT;
  locale: string;
  c: Conversation;
  onDone: (notice: Notice) => void;
}) {
  const [choosing, setChoosing] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const mine = () => takeoverActive(props.c);
  const until = () => {
    const at = props.c.owner_takeover_until;
    return at && !at.startsWith("9999-")
      ? new Date(at).toLocaleString(props.locale, {
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
  };
  const change = async (method: string, params: Record<string, unknown>) => {
    setBusy(true);
    setChoosing(false);
    const result = await ownerChange(props.host, props.mt, () =>
      props.host.request(method, { conversationId: props.c.id, ...params }),
    );
    setBusy(false);
    props.onDone(result.ok ? undefined : { text: result.message, bad: true });
  };
  return (
    <div class="nsvx-handling">
      <span class={["nsvx-handling__who", { "nsvx-handling__who--me": mine() }]}>
        <Icon name={mine() ? "hand" : "bot"} />
        {mine()
          ? `${props.mt("youHandle")}${until() ? ` · ${until()}` : ""}`
          : props.mt("cloneHandles")}
      </span>
      <Show
        when={mine()}
        fallback={
          <button
            type="button"
            class="nsvx__button"
            aria-expanded={choosing() ? "true" : "false"}
            disabled={busy() || !props.host.connection.canWrite}
            onClick={() => setChoosing(!choosing())}
          >
            <Icon name="hand" />
            {props.mt("takeOver")}
          </button>
        }
      >
        <button
          type="button"
          class="nsvx__button"
          disabled={busy() || !props.host.connection.canWrite}
          onClick={() => void change("nsvx.messages.takeover", { minutes: 0 })}
        >
          <Icon name="bot" />
          {props.mt("handBack")}
        </button>
      </Show>
      <button
        type="button"
        role="switch"
        class={["nsvx-switch", { "nsvx-switch--on": !props.c.paused }]}
        aria-checked={props.c.paused ? "false" : "true"}
        disabled={busy() || !props.host.connection.canWrite}
        onClick={() => void change("nsvx.messages.autoReply", { on: Boolean(props.c.paused) })}
      >
        <span class="nsvx-switch__track" aria-hidden="true" />
        {props.mt("auto")}
      </button>
      <Show when={choosing()}>
        <div class="nsvx-takeover" role="group" aria-label={props.mt("takeOver")}>
          <For each={TAKEOVER}>
            {(option) => (
              <button
                type="button"
                class="nsvx__button"
                onClick={() => void change("nsvx.messages.takeover", { minutes: option.minutes })}
              >
                {props.mt(option.key)}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function Composer(props: {
  host: ControlUiHost;
  mt: MT;
  locale: string;
  c: Conversation;
  replyTo: Message | undefined;
  draft: { text: string; at: number } | undefined;
  drafting: boolean;
  onClearReply: () => void;
  onDraft: () => void;
  onSent: (notice: Notice) => void;
}) {
  const [text, setText] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  // One key per message: an uncertain send repeated with it is deduped by NSVX instead of sent twice.
  let key = crypto.randomUUID();
  createEffect(
    () => props.draft,
    (draft) => {
      if (draft) {
        setText(draft.text);
        key = crypto.randomUUID();
      }
    },
  );
  const open = () => windowOpen(props.c);
  const send = async () => {
    const value = text();
    if (!value.trim() || busy() || !open()) {
      return;
    }
    setBusy(true);
    const result = await ownerChange(props.host, props.mt, () =>
      props.host.request("nsvx.messages.reply", {
        conversationId: props.c.id,
        text: value,
        idempotencyKey: key,
        ...(props.replyTo ? { replyTo: props.replyTo.id } : {}),
      }),
    );
    setBusy(false);
    if (result.ok) {
      setText("");
      key = crypto.randomUUID();
      props.onClearReply();
      props.onSent({ text: props.mt("queuedToSend") });
    } else {
      props.onSent({ text: result.message, bad: true });
    }
  };
  return (
    <form
      class="nsvx-composer"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <Show when={props.replyTo}>
        {(target) => (
          <p class="nsvx-composer__quote">
            <Icon name="undo" />
            <span>{target().body || "…"}</span>
            <button
              type="button"
              class="nsvx-msg__action"
              aria-label={props.mt("cancelReply")}
              onClick={() => props.onClearReply()}
            >
              ×
            </button>
          </p>
        )}
      </Show>
      <Show when={!open()}>
        <p class="nsvx__notice nsvx__notice--bad" role="status">
          {props.mt("windowClosed")}
        </p>
      </Show>
      <div class="nsvx-composer__row">
        <button
          type="button"
          class="nsvx__button nsvx__button--icon nsvx-composer__ai"
          aria-label={props.mt("draft")}
          title={props.mt("draft")}
          disabled={props.drafting || !props.host.connection.canWrite}
          onClick={() => props.onDraft()}
        >
          <Icon name="reply" />
        </button>
        <Speak
          locale={props.locale}
          mt={props.mt}
          onText={(said) => {
            setText(text() ? `${text()} ${said}` : said);
            key = crypto.randomUUID();
          }}
        />
        <textarea
          aria-label={props.mt("placeholder")}
          placeholder={props.drafting ? props.mt("drafting") : props.mt("placeholder")}
          rows={2}
          value={text()}
          disabled={busy() || !open()}
          onInput={(event) => {
            setText(event.currentTarget.value);
            key = crypto.randomUUID();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="submit"
          class="nsvx__button nsvx__button--primary nsvx__button--icon"
          aria-label={props.mt("send")}
          title={props.mt("send")}
          disabled={busy() || !text().trim() || !open() || !props.host.connection.canWrite}
        >
          <Icon name="send" />
        </button>
      </div>
    </form>
  );
}
/** One conversation: messages, clone drafts to approve, handling, and the owner's composer. */
export function Thread(props: {
  host: ControlUiHost;
  t: T;
  mt: MT;
  locale: string;
  id: string;
  name: string | undefined;
  onBack: () => void;
}) {
  let before: string | null = null;
  const thread = createSource(props.host, () =>
    props.host.request<Conversation>("nsvx.view", {
      view: "conversation",
      params: { id: props.id, message_limit: "60", ...(before ? { message_before: before } : {}) },
    }),
  );
  const [notice, setNotice] = createSignal<Notice>();
  const [replyTo, setReplyTo] = createSignal<Message>();
  const [drafting, setDrafting] = createSignal(false);
  const [draft, setDraft] = createSignal<{ text: string; at: number }>();
  const [paged, setPaged] = createSignal(false);
  void thread.refresh();
  every(THREAD_REFRESH_MS, () => !paged() && void thread.refresh());
  const page = (next: string | null) => {
    before = next;
    setPaged(next !== null);
    void thread.refresh();
  };
  const settled = (next: Notice) => {
    setNotice(next);
    void thread.refresh();
  };
  const name = () =>
    props.name ??
    thread.state().data?.title ??
    thread.state().data?.messages.find((m) => m.direction === "inbound" && m.sender)?.sender ??
    "";
  const latestInbound = () =>
    thread
      .state()
      .data?.messages.findLast((m) => m.direction === "inbound" && !m.tombstone && !m.deleted_at);
  /** Quick Reply writes a reply to one inbound message; it lands in the composer, never sent by itself. */
  const draftFor = async (target: Message | undefined) => {
    const c = thread.state().data;
    if (!c || drafting()) {
      return;
    }
    setDrafting(true);
    setNotice(undefined);
    const result = await ownerChange(props.host, props.mt, async () => {
      const started = await props.host.request<{ draft: QuickReplyDraft }>(
        "nsvx.quickReply.start",
        {
          key: crypto.randomUUID(),
          sourceChannel: c.channel,
          inbound: target?.body ?? "",
          ...(target ? { messageId: target.id } : {}),
        },
      );
      return waitForDraft<QuickReplyDraft>(props.host, started.draft.id, isPreparing);
    });
    setDrafting(false);
    if (result.ok && result.value.reply) {
      if (target) {
        setReplyTo(target);
      }
      setDraft({ text: replyBody(result.value), at: Date.now() });
    } else {
      setNotice({ text: result.ok ? props.mt("draftFailed") : result.message, bad: true });
    }
  };
  return (
    <div class="nsvx-thread">
      <header class="nsvx-thread__head">
        <button
          type="button"
          class="nsvx__button nsvx__button--icon nsvx-thread__back"
          aria-label={props.mt("back")}
          title={props.mt("back")}
          onClick={() => props.onBack()}
        >
          <Icon name="back" />
        </button>
        <Avatar name={name()} channel={thread.state().data?.channel ?? ""} />
        <span class="nsvx-row__main">
          <span class="nsvx-row__title">{name()}</span>
          <Show when={thread.state().data?.account_label}>
            <span class="nsvx-row__detail">{thread.state().data?.account_label}</span>
          </Show>
        </span>
      </header>
      <SourceView source={thread} t={props.t}>
        {(c) => {
          const outbox = createMemo(() => splitOutbox(c().outbox));
          const rows = createMemo(() => {
            let last = "";
            return c().messages.map((m) => {
              const day = new Date(m.sent_at).toLocaleDateString(props.locale, {
                weekday: "short",
                day: "numeric",
                month: "short",
              });
              const shown = day !== last ? day : undefined;
              last = day;
              return { m, day: shown };
            });
          });
          return (
            <>
              <Handling
                host={props.host}
                mt={props.mt}
                locale={props.locale}
                c={c()}
                onDone={settled}
              />
              <div class="nsvx-thread__pages">
                <Show when={c().message_page?.has_older}>
                  <button
                    type="button"
                    class="nsvx__button"
                    disabled={thread.state().loading}
                    onClick={() => page(c().message_page?.before ?? null)}
                  >
                    {props.mt("older")}
                  </button>
                </Show>
                <Show when={paged()}>
                  <button type="button" class="nsvx__button" onClick={() => page(null)}>
                    {props.t("refresh")}
                  </button>
                </Show>
              </div>
              <ol class="nsvx-msgs" aria-label={props.mt("messages")}>
                <For each={rows()} keyed={(row) => row.m.id}>
                  {(row) => (
                    <Bubble
                      m={row().m}
                      day={row().day}
                      mt={props.mt}
                      locale={props.locale}
                      drafting={drafting()}
                      onReplyTo={setReplyTo}
                      onDraft={(m) => void draftFor(m)}
                    />
                  )}
                </For>
                <For each={outbox().sending} keyed={(o) => o.id}>
                  {(o) => (
                    <li class="nsvx-msg nsvx-msg--me nsvx-msg--pending">
                      <div class="nsvx-msg__bubble">
                        <p class="nsvx-msg__body">{o().payload?.text ?? "…"}</p>
                        <span class="nsvx-msg__meta">
                          <span class="nsvx-tick nsvx-tick--indeterminate">
                            {props.mt(OUTBOX_LABELS[o().state] ?? "checking")}
                          </span>
                        </span>
                        <Show when={o().state_detail}>
                          <span class="nsvx-row__detail nsvx-row__detail--bad">
                            {o().state_detail}
                          </span>
                        </Show>
                      </div>
                    </li>
                  )}
                </For>
              </ol>
              <Show when={c().messages.length === 0 && outbox().sending.length === 0}>
                <p class="nsvx__empty">{props.mt("noConversations")}</p>
              </Show>
              <Show when={outbox().review.length > 0}>
                <h2 class="nsvx__heading">
                  {props.mt("toApprove")} · {outbox().review.length}
                </h2>
                <ul class="nsvx-list">
                  <For each={outbox().review} keyed={(o) => o.id}>
                    {(o) => (
                      <ReviewCard
                        host={props.host}
                        mt={props.mt}
                        locale={props.locale}
                        item={o()}
                        onDone={settled}
                      />
                    )}
                  </For>
                </ul>
              </Show>
              <p class={["nsvx__notice", { "nsvx__notice--bad": notice()?.bad }]} role="status">
                {drafting() ? props.mt("drafting") : (notice()?.text ?? "")}
              </p>
              <Composer
                host={props.host}
                mt={props.mt}
                locale={props.locale}
                c={c()}
                replyTo={replyTo()}
                draft={draft()}
                drafting={drafting()}
                onClearReply={() => setReplyTo(undefined)}
                onDraft={() => void draftFor(replyTo() ?? latestInbound())}
                onSent={settled}
              />
            </>
          );
        }}
      </SourceView>
    </div>
  );
}
