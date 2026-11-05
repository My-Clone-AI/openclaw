/** @jsxImportSource @solidjs/web */
import { createSignal, For, onSettled, Show } from "solid-js";
import { paidCost, PHONE_KINDS, type PhoneCard, type PhoneKind } from "./calls-data.js";
import type { CallsKey } from "./calls-i18n.js";
import { stamp, type CallsCtx } from "./calls-ui.js";
import { ConfirmButton, createAction, Note, view } from "./device-kit.js";
import { Choice, Field, Pill, Reveal } from "./office-kit.js";
import { createSource, Icon, matches } from "./ui-kit.js";

const MATCH_WORD: Record<string, CallsKey> = {
  past_call: "pastCall",
  message_mention: "conversation",
  owner_override: "correction",
};

const isLink = (url: string) => /^https?:\/\//i.test(url);

function Card(props: { ctx: CallsCtx; card: PhoneCard; onCard: (card: PhoneCard | null) => void }) {
  const ctx = () => props.ctx;
  const action = createAction(ctx);
  const [name, setName] = createSignal(props.card.name ?? "");
  const [kind, setKind] = createSignal<PhoneKind>(props.card.kind);
  const [note, setNote] = createSignal(props.card.owner_override?.note ?? "");
  const change = (body: Record<string, unknown>, done: string) =>
    action.run(async () => {
      const next = await ctx().host.request<PhoneCard | { deleted: true }>("nsvx.phone.change", {
        id: props.card.id,
        ...body,
      });
      props.onCard("e164" in next ? next : null);
    }, done);
  const canWrite = () => ctx().host.connection.canWrite && !action.busy();
  const info = () =>
    [
      props.card.number_info.region ?? props.card.number_info.country_code,
      props.card.number_info.geo,
      props.card.number_info.carrier,
    ]
      .filter(Boolean)
      .join(" · ");
  const cost = () => paidCost(props.card);
  const confidence = () => Math.round(props.card.confidence * 100);
  return (
    <article class="nsvx-calls__card" data-card={props.card.id}>
      <header class="nsvx-calls__card-head">
        <span class="nsvx-calls__avatar" aria-hidden="true">
          <Icon name={props.card.kind === "personal" ? "user" : "phone"} />
        </span>
        <span class="nsvx-of__main">
          <strong class="nsvx-calls__card-name">{props.card.name || ctx().ct("unknown")}</strong>
          <span class="nsvx-calls__e164">{props.card.e164}</span>
        </span>
        <Pill tone={props.card.kind === "telemarketing_spam" ? "bad" : "off"}>
          {ctx().ct(`kind_${props.card.kind}`)}
        </Pill>
      </header>
      <span
        class="nsvx-calls__meter"
        role="meter"
        aria-label={ctx().ct("confidence")}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={String(confidence())}
      >
        <span style={{ width: `${confidence()}%` }} />
      </span>
      <span class="nsvx-of__muted">
        {ctx().ct("confidence")} {confidence()}%
        <Show when={props.card.origin}>
          {(origin) => <> · {ctx().ct(`origin_${origin()}` as CallsKey) ?? origin()}</>}
        </Show>
      </span>
      <Show when={info()}>
        <span class="nsvx-of__sub" title={ctx().ct("ported")}>
          <Icon name="pin" /> {info()}
        </span>
      </Show>
      <Show when={props.card.error}>
        <p class="nsvx-of__warn" role="alert">
          {props.card.error}
        </p>
      </Show>
      <Show
        when={props.card.name || props.card.sources.length || props.card.internal_matches.length}
        fallback={<p class="nsvx__empty">{ctx().ct("noResult")}</p>}
      >
        <ul class="nsvx-calls__matches">
          <For each={props.card.internal_matches} keyed={false}>
            {(match) => (
              <li>
                <Icon name={match().type === "past_call" ? "phone" : "messages"} />
                <span>
                  {ctx().ct(MATCH_WORD[match().type] ?? "contact")}
                  {match().name || match().title ? ` · ${match().name || match().title}` : ""}
                </span>
                <Show when={match().snippet}>
                  <small class="nsvx-of__sub">{match().snippet}</small>
                </Show>
              </li>
            )}
          </For>
          <For each={props.card.sources} keyed={false}>
            {(source) => (
              <li>
                <Icon name={source().verified ? "done" : "doc"} />
                <Show when={isLink(source().url)} fallback={<span>{source().title}</span>}>
                  <a href={source().url} target="_blank" rel="noopener noreferrer">
                    {source().title || source().url}
                  </a>
                </Show>
                <Show when={source().snippet}>
                  <small class="nsvx-of__sub">{source().snippet}</small>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={props.card.expires_at}>
        <span class="nsvx-of__muted">
          {ctx().ct("autoDelete")} {stamp(props.card.expires_at, ctx().locale)}
        </span>
      </Show>
      <div class="nsvx-of__bar">
        <Reveal label={ctx().ct("correct")} icon="edit" disabled={!canWrite()}>
          {(close) => (
            <form
              class="nsvx-of__form"
              onSubmit={(event) => {
                event.preventDefault();
                void change(
                  { action: "correct", name: name(), kind: kind(), note: note() },
                  ctx().ct("saved"),
                ).then((ok) => ok && close());
              }}
            >
              <Field label={ctx().ct("name")} value={name()} max={200} onInput={setName} />
              <Choice
                label={ctx().ct("kind")}
                value={kind()}
                options={PHONE_KINDS.map((key) => [key, ctx().ct(`kind_${key}`)] as const)}
                onChange={setKind}
              />
              <Field
                label={ctx().ct("note")}
                value={note()}
                max={1000}
                rows={2}
                onInput={setNote}
              />
              <button type="submit" class="nsvx__button nsvx__button--primary">
                {ctx().ct("save")}
              </button>
            </form>
          )}
        </Reveal>
        <ConfirmButton
          label={ctx().ct(props.card.person_id ? "linkContact" : "createContact")}
          confirm={ctx().ct("confirm")}
          cancel={ctx().ct("keep")}
          icon="user"
          disabled={!canWrite() || (!props.card.person_id && !name().trim())}
          onConfirm={() =>
            void change(
              props.card.person_id
                ? { action: "contact", personId: props.card.person_id }
                : { action: "contact", name: name().trim() },
              ctx().ct("saved"),
            )
          }
        />
        <Show when={cost()}>
          {(price) => (
            <ConfirmButton
              label={`${ctx().ct("paid")} · $${price()}`}
              confirm={`${ctx().ct("paidAsk")} $${price()}`}
              cancel={ctx().ct("keep")}
              icon="euro"
              disabled={!canWrite()}
              onConfirm={() =>
                void action.run(async () => {
                  props.onCard(
                    await ctx().host.request<PhoneCard>("nsvx.phone.lookup", {
                      number: props.card.e164,
                      paid: true,
                    }),
                  );
                })
              }
            />
          )}
        </Show>
        <ConfirmButton
          label={ctx().ct("erase")}
          confirm={ctx().ct("eraseAsk")}
          cancel={ctx().ct("keep")}
          icon="trash"
          danger
          disabled={!canWrite()}
          onConfirm={() => void change({ action: "erase" }, ctx().ct("deleted"))}
        />
      </div>
      <Note note={action.note()} />
    </article>
  );
}

/** NSVX Quem ligou: identify a number from history, contacts, and the web; correct it or save it as a contact. */
export function WhoCalled(props: { ctx: CallsCtx; number: string; callId?: string | undefined }) {
  const ctx = () => props.ctx;
  const [number, setNumber] = createSignal(props.number);
  const [card, setCard] = createSignal<PhoneCard | null>(null);
  const action = createAction(ctx);
  const recent = createSource(ctx().host, () =>
    view<PhoneCard[]>(ctx().host, "phoneCards", { limit: "20" }),
  );
  void recent.refresh();
  const search = () =>
    action.run(async () => {
      const found = await ctx().host.request<PhoneCard>("nsvx.phone.lookup", {
        number: number().trim(),
        ...(props.callId ? { callId: props.callId } : {}),
      });
      setCard(found);
      setNumber(found.e164);
      void recent.refresh();
    });
  // Opened from an unknown caller in the history: look the number up at once, as NSVX does.
  onSettled(() => {
    if (props.number.trim()) {
      void search();
    }
  });
  const shown = () =>
    (recent.state().data ?? []).filter((row) =>
      matches(ctx().query, row.e164, row.name, row.owner_override?.note),
    );
  return (
    <div class="nsvx-calls__who-page">
      <form
        class="nsvx-calls__lookup"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setCard(null);
          void search();
        }}
      >
        <input
          type="tel"
          autocomplete="tel"
          aria-label={ctx().ct("numberHint")}
          placeholder={ctx().ct("numberHint")}
          maxlength={80}
          value={number()}
          disabled={action.busy()}
          onInput={(event) => setNumber(event.currentTarget.value)}
        />
        <button
          type="submit"
          class="nsvx__button nsvx__button--primary"
          disabled={action.busy() || !number().trim() || !ctx().host.connection.canWrite}
          aria-busy={action.busy() ? "true" : "false"}
        >
          <Icon name="find" />
          <span>{ctx().ct(action.busy() ? "searching" : "search")}</span>
        </button>
      </form>
      <Note note={action.note()} />
      <Show when={card()}>
        {(shownCard) => (
          <For each={[shownCard()]} keyed={(item) => `${item.id}:${item.last_lookup_at}`}>
            {(item) => (
              <Card
                ctx={ctx()}
                card={item()}
                onCard={(next) => {
                  setCard(next);
                  void recent.refresh();
                }}
              />
            )}
          </For>
        )}
      </Show>
      <h3 class="nsvx-calls__subhead">
        <Icon name="history" /> {ctx().ct("recent")}
      </h3>
      <ul class="nsvx-of__list">
        <For
          each={shown()}
          keyed={(row) => row.id}
          fallback={<p class="nsvx__empty">{ctx().ct("noNumbers")}</p>}
        >
          {(row) => (
            <li>
              <button
                type="button"
                class="nsvx-of__row"
                data-number={row().e164}
                onClick={() => {
                  setNumber(row().e164);
                  setCard(row());
                }}
              >
                <span class="nsvx-calls__avatar" aria-hidden="true">
                  <Icon name={row().kind === "personal" ? "user" : "phone"} />
                </span>
                <span class="nsvx-of__main">
                  <strong>{row().name || ctx().ct("unknown")}</strong>
                  <span class="nsvx-of__sub">
                    {row().e164} · {stamp(row().last_lookup_at, ctx().locale)}
                  </span>
                </span>
                <Pill tone={row().kind === "telemarketing_spam" ? "bad" : "off"}>
                  {ctx().ct(`kind_${row().kind}`)}
                </Pill>
              </button>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
