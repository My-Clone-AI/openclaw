/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import { BrandLogo, every } from "./messages-ui.js";
import { frequent, type PersonSummary } from "./people-data.js";
import { GroupList, GroupPageView } from "./people-groups.js";
import type { PT } from "./people-i18n.js";
import { PersonPage, type PersonLinks } from "./people-person.js";
import { createChange, Note, PersonAvatar } from "./people-ui.js";
import { age, createSource, Icon, matches, SourceView, type T } from "./ui-kit.js";
import "./people.css";

const LIST_REFRESH_MS = 30_000;

export type PeopleOpen = { kind: "person" | "group"; id: string } | undefined;

/** NSVX People (`/pessoas`): people, private groups, each person's page, and each group's page. */
export function PeopleTab(props: {
  host: ControlUiHost;
  t: T;
  pt: PT;
  locale: string;
  query: string;
  open: PeopleOpen;
  onOpen: (open: PeopleOpen) => void;
  onConversation: (id: string) => void;
  onMission: (id: string) => void;
}) {
  const [view, setView] = createSignal<"people" | "groups">(
    props.open?.kind === "group" ? "groups" : "people",
  );
  const links: PersonLinks = {
    onGroup: (id) => props.onOpen({ kind: "group", id }),
    onConversation: (id) => props.onConversation(id),
    onMission: (id) => props.onMission(id),
  };
  return (
    <div class={["nsvx-inbox", "nsvx-ppl", { "nsvx-inbox--open": Boolean(props.open) }]}>
      <div class="nsvx-inbox__list">
        <div class="nsvx-inbox__filters">
          <div class="nsvx-segment" role="group">
            <button
              type="button"
              aria-pressed={view() === "people" ? "true" : "false"}
              onClick={() => setView("people")}
            >
              <Icon name="user" />
              {props.pt("people")}
            </button>
            <button
              type="button"
              aria-pressed={view() === "groups" ? "true" : "false"}
              onClick={() => setView("groups")}
            >
              <Icon name="people" />
              {props.pt("groups")}
            </button>
          </div>
        </div>
        <Show
          when={view() === "people"}
          fallback={
            <GroupList
              host={props.host}
              t={props.t}
              pt={props.pt}
              query={props.query}
              open={props.open?.kind === "group" ? props.open.id : undefined}
              onOpen={(id) => props.onOpen({ kind: "group", id })}
            />
          }
        >
          <PeopleList
            host={props.host}
            t={props.t}
            pt={props.pt}
            query={props.query}
            open={props.open?.kind === "person" ? props.open.id : undefined}
            onOpen={(id) => props.onOpen({ kind: "person", id })}
          />
        </Show>
      </div>
      <Show
        when={props.open}
        keyed
        fallback={
          <div class="nsvx-inbox__pick">
            <Icon name="people" class="nsvx-connect__icon" />
            <span>{props.pt("pickOne")}</span>
          </div>
        }
      >
        {(open) =>
          open.kind === "person" ? (
            <PersonPage
              {...links}
              host={props.host}
              t={props.t}
              pt={props.pt}
              locale={props.locale}
              id={open.id}
              onBack={() => props.onOpen(undefined)}
            />
          ) : (
            <GroupPageView
              host={props.host}
              t={props.t}
              pt={props.pt}
              id={open.id}
              onPerson={(id) => props.onOpen({ kind: "person", id })}
              onGroup={(id) => props.onOpen({ kind: "group", id })}
              onBack={() => props.onOpen(undefined)}
            />
          )
        }
      </Show>
    </div>
  );
}

function PeopleList(props: {
  host: ControlUiHost;
  t: T;
  pt: PT;
  query: string;
  open: string | undefined;
  onOpen: (id: string) => void;
}) {
  const people = createSource(props.host, () =>
    props.host.request<PersonSummary[]>("nsvx.view", { view: "people" }),
  );
  void people.refresh();
  every(LIST_REFRESH_MS, () => void people.refresh());
  const [creating, setCreating] = createSignal(false);
  const [name, setName] = createSignal("");
  const change = createChange(props.host, props.pt, () => people.refresh());
  const shown = createMemo(
    () =>
      people.state().data?.filter((p) => matches(props.query, p.display_name, ...p.channels)) ?? [],
  );
  const hot = createMemo(() => (props.query.trim() ? [] : frequent(shown())));
  return (
    <>
      <div class="nsvx-ppl-row">
        <button
          type="button"
          class="nsvx__button nsvx__button--primary"
          aria-expanded={creating() ? "true" : "false"}
          onClick={() => setCreating(!creating())}
        >
          <Icon name="plus" />
          {props.pt("person")}
        </button>
      </div>
      <Show when={creating()}>
        <form
          class="nsvx-ppl-inline"
          onSubmit={(event) => {
            event.preventDefault();
            void change.run<{ id: string }>(
              "create",
              "nsvx.people.change",
              { action: "create", name: name() },
              (created) => {
                setCreating(false);
                setName("");
                props.onOpen(created.id);
              },
            );
          }}
        >
          <input
            class="nsvx__search"
            placeholder={props.pt("name")}
            aria-label={props.pt("name")}
            maxlength={120}
            autocomplete="off"
            value={name()}
            onInput={(event) => setName(event.currentTarget.value)}
          />
          <button
            type="submit"
            class="nsvx__button nsvx__button--primary"
            disabled={!name().trim() || change.busy() !== undefined}
          >
            {props.pt("create")}
          </button>
        </form>
        <Note change={change} />
      </Show>
      <SourceView source={people} t={props.t}>
        {(list) => (
          <>
            <Show when={hot().length > 0}>
              <h2 class="nsvx__heading">{props.pt("frequent")}</h2>
              <ul class="nsvx-ppl-hot">
                <For each={hot()}>
                  {(p) => (
                    <li>
                      <button
                        type="button"
                        class={[
                          "nsvx-ppl-hot__item",
                          { "nsvx-ppl-hot__item--on": p.id === props.open },
                        ]}
                        onClick={() => props.onOpen(p.id)}
                      >
                        <PersonAvatar host={props.host} personId={p.id} name={p.display_name} />
                        <span class="nsvx-ppl-hot__name">{p.display_name}</span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <h2 class="nsvx__heading">
              {props.pt("all")} · {shown().length}
            </h2>
            <Show
              when={shown().length > 0}
              fallback={
                <p class="nsvx__empty">
                  {list().length === 0 ? props.pt("noPeople") : props.t("noResults")}
                </p>
              }
            >
              <ul class="nsvx-list">
                <For each={shown()} keyed={(p) => p.id}>
                  {(p) => (
                    <li>
                      <button
                        type="button"
                        class={["nsvx-conv", { "nsvx-conv--current": p().id === props.open }]}
                        aria-current={p().id === props.open ? "page" : undefined}
                        onClick={() => props.onOpen(p().id)}
                      >
                        <PersonAvatar host={props.host} personId={p().id} name={p().display_name} />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">{p().display_name}</span>
                          <span class="nsvx-ppl-logos">
                            <For each={p().channels}>
                              {(channel) => <BrandLogo channel={channel} size={16} />}
                            </For>
                          </span>
                        </span>
                        <span class="nsvx-conv__end">
                          <span class="nsvx-row__age">{age(p().last_message_at)}</span>
                          <Show when={p().handling !== "auto"}>
                            <span class={["nsvx__chip", `nsvx-ppl-mode--${p().handling}`]}>
                              {props.pt(p().handling)}
                            </span>
                          </Show>
                          <Show when={p().active_missions > 0}>
                            <span class="nsvx__chip">
                              <Icon name="tasks" />
                              {p().active_missions}
                            </span>
                          </Show>
                        </span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </>
        )}
      </SourceView>
    </>
  );
}
