/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import {
  conversationName,
  groupConversations,
  MESSAGE_CHANNELS,
  waiting,
  type ConversationPage,
  type ConversationSummary,
} from "./messages-data.js";
import type { MessagesKey, MT } from "./messages-i18n.js";
import { Thread } from "./messages-thread.js";
import { Avatar, BrandLogo, every } from "./messages-ui.js";
import { age, createSource, Icon, matches, SourceView, type T } from "./ui-kit.js";
import "./messages.css";

const LIST_REFRESH_MS = 30_000;

function ConversationRow(props: {
  c: ConversationSummary;
  current: boolean;
  onOpen: (c: ConversationSummary) => void;
}) {
  const count = () => waiting(props.c);
  return (
    <li>
      <button
        type="button"
        class={[
          "nsvx-conv",
          { "nsvx-conv--current": props.current, "nsvx-conv--unread": count() > 0 },
        ]}
        aria-current={props.current ? "page" : undefined}
        onClick={() => props.onOpen(props.c)}
      >
        <Avatar name={conversationName(props.c)} channel={props.c.channel} />
        <span class="nsvx-row__main">
          <span class="nsvx-row__title">{conversationName(props.c)}</span>
          <Show when={props.c.last_body}>
            <span class="nsvx-row__detail">{props.c.last_body}</span>
          </Show>
        </span>
        <span class="nsvx-conv__end">
          <span class="nsvx-row__age">{age(props.c.last_at)}</span>
          <Show when={count() > 0}>
            <span class="nsvx-count" aria-label={String(count())}>
              {count()}
            </span>
          </Show>
          <Show when={props.c.paused}>
            <Icon name="pause" class="nsvx-conv__paused" />
          </Show>
        </span>
      </button>
    </li>
  );
}

function ConversationList(props: {
  host: ControlUiHost;
  t: T;
  mt: MT;
  query: string;
  open: string | undefined;
  onOpen: (c: ConversationSummary) => void;
}) {
  // Plain view state: loads read it at once, while signals render the same choice after the next flush.
  const view = { unanswered: false, channel: "", q: "" };
  const [unanswered, setUnanswered] = createSignal(false);
  const [channel, setChannel] = createSignal("");
  const [pages, setPages] = createSignal(1);
  let cursor: string | null = null;
  let appending = false;
  // Reads `appending` before its first await, so one source serves both a fresh list and the next page.
  const load = async (): Promise<ConversationPage> => {
    const more = appending;
    const answer = await props.host.request<ConversationPage>("nsvx.view", {
      view: "conversations",
      params: {
        limit: "60",
        ...(view.q ? { q: view.q } : {}),
        ...(view.unanswered ? { state: "outstanding" } : {}),
        ...(view.channel ? { channel: view.channel } : {}),
        ...(more && cursor ? { after: cursor } : {}),
      },
    });
    cursor = answer.next;
    const previous: ConversationSummary[] = more ? (list.state().data?.items ?? []) : [];
    return { items: [...previous, ...answer.items], next: answer.next, total: answer.total };
  };
  const list = createSource(props.host, load);
  const loadMore = () => {
    appending = true;
    void list.refresh();
    appending = false;
    setPages(pages() + 1);
  };
  const reload = () => {
    setPages(1);
    void list.refresh();
  };
  void list.refresh();
  // A loaded extra page stays put: a background refresh would drop it.
  every(LIST_REFRESH_MS, () => pages() === 1 && void list.refresh());
  createEffect(
    () => props.query.trim(),
    (q) => {
      // Debounced: typing reloads once, 250 ms after the last key.
      const timer = setTimeout(() => {
        if (q !== view.q) {
          view.q = q;
          reload();
        }
      }, 250);
      return () => clearTimeout(timer);
    },
  );
  const items = createMemo(
    () =>
      list
        .state()
        .data?.items.filter((c) =>
          matches(props.query, conversationName(c), c.last_body, c.account_label),
        ) ?? [],
  );
  const sections = createMemo(() => groupConversations(items()));
  const SECTIONS: { id: "people" | "groups" | "unknown"; key: MessagesKey }[] = [
    { id: "people", key: "people" },
    { id: "groups", key: "groups" },
    { id: "unknown", key: "unknown" },
  ];
  return (
    <div class="nsvx-inbox__list">
      <div class="nsvx-inbox__filters">
        <div class="nsvx-segment" role="group">
          <button
            type="button"
            aria-pressed={unanswered() ? "false" : "true"}
            onClick={() => {
              view.unanswered = false;
              setUnanswered(false);
              reload();
            }}
          >
            {props.mt("all")}
          </button>
          <button
            type="button"
            aria-pressed={unanswered() ? "true" : "false"}
            onClick={() => {
              view.unanswered = true;
              setUnanswered(true);
              reload();
            }}
          >
            <Icon name="ask" />
            {props.mt("toAnswer")}
          </button>
        </div>
        <div class="nsvx-channels" role="group">
          <For each={MESSAGE_CHANNELS}>
            {(id) => (
              <button
                type="button"
                class="nsvx-channel"
                aria-pressed={channel() === id ? "true" : "false"}
                onClick={() => {
                  const next = channel() === id ? "" : id;
                  view.channel = next;
                  setChannel(next);
                  reload();
                }}
              >
                <BrandLogo channel={id} size={20} />
              </button>
            )}
          </For>
        </div>
      </div>
      <SourceView source={list} t={props.t}>
        {(data) => (
          <>
            <For each={SECTIONS}>
              {(section) => (
                <Show when={sections()[section.id].length > 0}>
                  <h2 class="nsvx__heading">
                    {props.mt(section.key)} · {sections()[section.id].length}
                  </h2>
                  <ul class="nsvx-list">
                    <For each={sections()[section.id]} keyed={(c) => c.id}>
                      {(c) => (
                        <ConversationRow
                          c={c()}
                          current={c().id === props.open}
                          onOpen={props.onOpen}
                        />
                      )}
                    </For>
                  </ul>
                </Show>
              )}
            </For>
            <Show when={items().length === 0}>
              <p class="nsvx__empty">
                {props.query
                  ? props.t("noResults")
                  : props.mt(unanswered() ? "allAnswered" : "noConversations")}
              </p>
            </Show>
            <Show when={data().next}>
              <button
                type="button"
                class="nsvx__button nsvx-more"
                disabled={list.state().loading}
                onClick={loadMore}
              >
                {props.t("more")} · {items().length}/{data().total}
              </button>
            </Show>
          </>
        )}
      </SourceView>
    </div>
  );
}

/** NSVX Messages: every channel's conversations, the thread, clone's drafts, and the owner's replies. */
export function MessagesTab(props: {
  host: ControlUiHost;
  t: T;
  mt: MT;
  locale: string;
  query: string;
  open: string | undefined;
  onOpen: (id: string | undefined) => void;
}) {
  const [names, setNames] = createSignal<Record<string, string>>({});
  return (
    <div class={["nsvx-inbox", { "nsvx-inbox--open": Boolean(props.open) }]}>
      <ConversationList
        host={props.host}
        t={props.t}
        mt={props.mt}
        query={props.query}
        open={props.open}
        onOpen={(c) => {
          setNames({ ...names(), [c.id]: conversationName(c) });
          props.onOpen(c.id);
        }}
      />
      <Show
        when={props.open}
        keyed
        fallback={
          <div class="nsvx-inbox__pick">
            <Icon name="messages" class="nsvx-connect__icon" />
            <span>{props.mt("pickOne")}</span>
          </div>
        }
      >
        {(id) => (
          <Thread
            host={props.host}
            t={props.t}
            mt={props.mt}
            locale={props.locale}
            id={id}
            name={names()[id]}
            onBack={() => props.onOpen(undefined)}
          />
        )}
      </Show>
    </div>
  );
}
