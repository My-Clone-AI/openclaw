/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import { BrandLogo } from "./messages-ui.js";
import type { ConversationContext, Person, PersonSummary } from "./people-data.js";
import type { PersonLinks } from "./people-person.js";
import { ConfirmBar, IconButton, Section, type Change, type Base } from "./people-ui.js";
import { age, createSource, Icon, matches, SourceView } from "./ui-kit.js";

// ---------- social context: aliases, mentions, duplicates ----------

export function ContextSection(props: PersonLinks & Base & { p: Person; change: Change }) {
  const [alias, setAlias] = createSignal("");
  const [mention, setMention] = createSignal<string>();
  const [merging, setMerging] = createSignal(false);
  const [drop, setDrop] = createSignal<PersonSummary>();
  const [search, setSearch] = createSignal("");
  const people = createSource(props.host, () =>
    props.host.request<PersonSummary[]>("nsvx.view", { view: "people" }),
  );
  const candidates = createMemo(
    () =>
      people
        .state()
        .data?.filter((p) => p.id !== props.p.id && matches(search(), p.display_name))
        .slice(0, 30) ?? [],
  );
  const mentions = () => props.p.mentioned_in ?? [];
  return (
    <Section icon="find" title={props.pt("context")}>
      <h4 class="nsvx-ppl-year">{props.pt("alsoCalled")}</h4>
      <ul class="nsvx-ppl-chips">
        <For each={props.p.aliases ?? []}>
          {(a) => (
            <li>
              <span class="nsvx-ppl-chip">
                <Icon name={a.origin === "owner" ? "user" : "bot"} />
                {a.alias}
              </span>
            </li>
          )}
        </For>
        <li>
          <form
            class="nsvx-ppl-inline"
            onSubmit={(event) => {
              event.preventDefault();
              void props.change.run(
                "alias",
                "nsvx.people.change",
                { action: "alias", personId: props.p.id, alias: alias() },
                () => setAlias(""),
              );
            }}
          >
            <input
              class="nsvx__search nsvx-ppl-alias"
              placeholder={props.pt("name")}
              aria-label={props.pt("alsoCalled")}
              maxlength={80}
              value={alias()}
              onInput={(event) => setAlias(event.currentTarget.value)}
            />
            <button
              type="submit"
              class="nsvx__button nsvx__button--icon"
              aria-label={props.pt("add")}
              title={props.pt("add")}
              disabled={!alias().trim() || props.change.busy() !== undefined}
            >
              <Icon name="plus" />
            </button>
          </form>
        </li>
      </ul>
      <Show when={mentions().length > 0}>
        <h4 class="nsvx-ppl-year">{props.pt("mentioned")}</h4>
        <ul class="nsvx-list">
          <For each={mentions()}>
            {(m) => (
              <li>
                <button
                  type="button"
                  class="nsvx-row nsvx-row--link"
                  aria-expanded={mention() === m.conversation_id ? "true" : "false"}
                  onClick={() =>
                    setMention(mention() === m.conversation_id ? undefined : m.conversation_id)
                  }
                >
                  <BrandLogo channel={m.channel} size={22} />
                  <span class="nsvx-row__main">
                    <span class="nsvx-row__title">{m.author_is_owner ? "→" : "←"}</span>
                  </span>
                  <span class="nsvx__chip">
                    {props.pt(m.status === "resolved" ? "verified" : "suggested")}
                  </span>
                  <span class="nsvx-row__age">{age(m.sent_at)}</span>
                </button>
                <Show when={mention() === m.conversation_id}>
                  <MentionContext {...props} conversationId={m.conversation_id} />
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <button
        type="button"
        class="nsvx__button nsvx-more"
        aria-expanded={merging() ? "true" : "false"}
        onClick={() => {
          setMerging(!merging());
          setDrop(undefined);
          void people.refresh();
        }}
      >
        <Icon name="merge" />
        {props.pt("samePerson")}
      </button>
      <Show when={merging()}>
        <div class="nsvx-ppl-picker">
          <Show
            when={drop()}
            fallback={
              <>
                <input
                  class="nsvx__search"
                  type="search"
                  placeholder={props.t("search")}
                  aria-label={props.t("search")}
                  value={search()}
                  onInput={(event) => setSearch(event.currentTarget.value)}
                />
                <ul class="nsvx-list">
                  <For each={candidates()}>
                    {(p) => (
                      <li>
                        <button
                          type="button"
                          class="nsvx-row nsvx-row--link"
                          onClick={() => setDrop(p)}
                        >
                          <span class="nsvx-row__main">
                            <span class="nsvx-row__title">{p.display_name}</span>
                          </span>
                          <For each={p.channels}>{(c) => <BrandLogo channel={c} size={18} />}</For>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </>
            }
          >
            {(other) => (
              <ConfirmBar
                pt={props.pt}
                text={`${other().display_name} → ${props.p.display_name}. ${props.pt("mergeHint")}`}
                label={props.pt("merge")}
                busy={props.change.busy() !== undefined}
                onCancel={() => setDrop(undefined)}
                onConfirm={() =>
                  void props.change.run(
                    "merge",
                    "nsvx.people.change",
                    { action: "merge", personId: props.p.id, dropPersonId: other().id },
                    () => setMerging(false),
                  )
                }
              />
            )}
          </Show>
        </div>
      </Show>
    </Section>
  );
}

/** Who a conversation mentions; the owner confirms or rejects each guess, never automatic. */
function MentionContext(
  props: PersonLinks & Base & { p: Person; change: Change; conversationId: string },
) {
  const context = createSource(props.host, () =>
    props.host.request<ConversationContext>("nsvx.view", {
      view: "conversationContext",
      params: { id: props.conversationId },
    }),
  );
  void context.refresh();
  const confirm = (mentionId: string, isThem: boolean) =>
    void props.change.run(
      `mention-${mentionId}`,
      "nsvx.people.change",
      { action: "mention", mentionId, personId: isThem ? props.p.id : null, rememberAlias: isThem },
      () => context.refresh(),
    );
  return (
    <div class="nsvx-ppl-picker">
      <SourceView source={context} t={props.t}>
        {(c) => (
          <ul class="nsvx-list">
            <For each={c().mentions}>
              {(m) => (
                <li class="nsvx-row">
                  <span class="nsvx-row__main">
                    <span class="nsvx-row__title">“{m.span}”</span>
                    <span class="nsvx-row__detail">{m.subject ?? "?"}</span>
                  </span>
                  <Show when={m.status === "candidate"}>
                    <IconButton
                      icon="done"
                      label={props.pt("isThem")}
                      onClick={() => confirm(m.id, true)}
                    />
                    <IconButton
                      icon="close"
                      label={props.pt("notThem")}
                      onClick={() => confirm(m.id, false)}
                    />
                  </Show>
                </li>
              )}
            </For>
          </ul>
        )}
      </SourceView>
      <button
        type="button"
        class="nsvx__button"
        onClick={() => props.onConversation(props.conversationId)}
      >
        <Icon name="messages" />
        {props.pt("messages")}
      </button>
    </div>
  );
}
