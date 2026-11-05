/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import { every } from "./messages-ui.js";
import {
  validGroupName,
  type Group,
  type GroupMember,
  type GroupPage,
  type GroupSummary,
} from "./people-data.js";
import { GroupPanel } from "./people-group-tools.js";
import { eventKey, type PT } from "./people-i18n.js";
import { createChange, IconButton, Note, PersonAvatar, Section, Switch } from "./people-ui.js";
import { age, createSource, Icon, matches, SourceView, type T } from "./ui-kit.js";

const LIST_REFRESH_MS = 30_000;

export function GroupList(props: {
  host: ControlUiHost;
  t: T;
  pt: PT;
  query: string;
  open: string | undefined;
  onOpen: (id: string) => void;
}) {
  const [archived, setArchived] = createSignal(false);
  const [creating, setCreating] = createSignal(false);
  const [name, setName] = createSignal("");
  const [ownerOnly, setOwnerOnly] = createSignal(false);
  // Plain view state: the load reads it at once, while the signal renders the same choice after the flush.
  const state = { archived: false };
  const groups = createSource(props.host, async () => {
    const [main, proposed] = await Promise.all([
      props.host.request<GroupPage>("nsvx.view", {
        view: "socialGroups",
        params: { limit: "200", ...(state.archived ? { state: "archived" } : {}) },
      }),
      state.archived
        ? Promise.resolve({ items: [], next: null })
        : props.host.request<GroupPage>("nsvx.view", {
            view: "socialGroups",
            params: { limit: "200", state: "proposed" },
          }),
    ]);
    return [...main.items, ...proposed.items.filter((g) => !main.items.some((x) => x.id === g.id))];
  });
  void groups.refresh();
  every(LIST_REFRESH_MS, () => void groups.refresh());
  const change = createChange(props.host, props.pt, () => groups.refresh());
  const shown = createMemo(
    () => groups.state().data?.filter((g) => matches(props.query, g.display_name)) ?? [],
  );
  const show = (next: boolean) => {
    state.archived = next;
    setArchived(next);
    void groups.refresh();
  };
  return (
    <>
      <div class="nsvx-ppl-row">
        <div class="nsvx-segment" role="group">
          <button
            type="button"
            aria-pressed={archived() ? "false" : "true"}
            onClick={() => show(false)}
          >
            {props.pt("active")}
          </button>
          <button
            type="button"
            aria-pressed={archived() ? "true" : "false"}
            onClick={() => show(true)}
          >
            <Icon name="archive" />
            {props.pt("archived")}
          </button>
        </div>
        <button
          type="button"
          class="nsvx__button nsvx__button--primary"
          aria-expanded={creating() ? "true" : "false"}
          onClick={() => setCreating(!creating())}
        >
          <Icon name="plus" />
          {props.pt("group")}
        </button>
      </div>
      <p class="nsvx-ppl__hint">
        <Icon name="lock" />
        {props.pt("onlyYou")}
      </p>
      <Show when={creating()}>
        <form
          class="nsvx-ppl-form"
          onSubmit={(event) => {
            event.preventDefault();
            void change.run<{ id: string }>(
              "create",
              "nsvx.groups.change",
              { action: "create", name: name(), ownerOnly: ownerOnly() },
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
            maxlength={60}
            autocomplete="off"
            value={name()}
            onInput={(event) => setName(event.currentTarget.value)}
          />
          <Switch label={props.pt("onlyMe")} icon="lock" on={ownerOnly()} onChange={setOwnerOnly} />
          <button
            type="submit"
            class="nsvx__button nsvx__button--primary"
            disabled={!validGroupName(name()) || change.busy() !== undefined}
          >
            {props.pt("create")}
          </button>
        </form>
        <Note change={change} />
      </Show>
      <SourceView source={groups} t={props.t}>
        {(all) => (
          <Show
            when={shown().length > 0}
            fallback={
              <p class="nsvx__empty">
                {all().length === 0 ? props.pt("noGroups") : props.t("noResults")}
              </p>
            }
          >
            <ul class="nsvx-list">
              <For each={shown()} keyed={(g) => g.id}>
                {(g) => (
                  <GroupRow
                    pt={props.pt}
                    g={g()}
                    current={g().id === props.open}
                    onOpen={props.onOpen}
                  />
                )}
              </For>
            </ul>
          </Show>
        )}
      </SourceView>
    </>
  );
}

function GroupRow(props: {
  pt: PT;
  g: GroupSummary;
  current: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        class={["nsvx-conv", { "nsvx-conv--current": props.current }]}
        aria-current={props.current ? "page" : undefined}
        onClick={() => props.onOpen(props.g.id)}
      >
        <span class="nsvx-avatar" aria-hidden="true">
          <Icon name={props.g.origin === "automatic" ? "bot" : "people"} />
        </span>
        <span class="nsvx-row__main">
          <span class="nsvx-row__title">
            {props.g.display_name}
            <Show when={props.g.owner_locked}>
              {" "}
              <Icon name="lock" />
            </Show>
          </span>
          <span class="nsvx-row__detail">
            <Icon name="user" /> {props.g.members}
          </span>
        </span>
        <span class="nsvx-conv__end">
          <Show when={props.g.state === "proposed"}>
            <span class="nsvx__chip">{props.pt("suggested")}</span>
          </Show>
          <Show when={props.g.proposed > 0}>
            <span class="nsvx-count" aria-label={`${props.g.proposed} ${props.pt("suggested")}`}>
              {props.g.proposed}
            </span>
          </Show>
        </span>
      </button>
    </li>
  );
}

export type Panel = "add" | "rename" | "merge" | "split" | "delete";

/** One private group: members, suggestions to confirm, switches, and every NSVX lifecycle change with undo. */
export function GroupPageView(props: {
  host: ControlUiHost;
  t: T;
  pt: PT;
  id: string;
  onPerson: (id: string) => void;
  onGroup: (id: string) => void;
  onBack: () => void;
}) {
  const group = createSource(props.host, () =>
    props.host.request<Group>("nsvx.view", { view: "socialGroup", params: { id: props.id } }),
  );
  void group.refresh();
  const change = createChange(props.host, props.pt, () => group.refresh());
  const [panel, setPanel] = createSignal<Panel>();
  const [history, setHistory] = createSignal(false);
  const toggle = (next: Panel) => setPanel(panel() === next ? undefined : next);
  const member = (g: Group, personId: string, state: "active" | "excluded") =>
    void change.run(`member-${personId}`, "nsvx.groups.change", {
      action: "member",
      groupId: g.id,
      revision: g.revision,
      personId,
      state,
    });
  return (
    <article class="nsvx-ppl-page">
      <button type="button" class="nsvx__button nsvx-ppl-page__back" onClick={() => props.onBack()}>
        <Icon name="back" />
        {props.pt("groups")}
      </button>
      <SourceView source={group} t={props.t}>
        {(g) => {
          const archived = () => g().state === "archived";
          const active = () => g().members.filter((m) => m.state === "active");
          const proposed = () => g().members.filter((m) => m.state === "proposed");
          const out = () =>
            g().members.filter((m) => m.state !== "active" && m.state !== "proposed");
          return (
            <>
              <header class="nsvx-ppl-head">
                <span class="nsvx-avatar nsvx-ppl-avatar--large" aria-hidden="true">
                  <Icon name={g().origin === "automatic" ? "bot" : "people"} />
                </span>
                <div class="nsvx-ppl-head__main">
                  <h2 class="nsvx-ppl-head__name">{g().display_name}</h2>
                  <div class="nsvx-ppl-head__meta">
                    <span class="nsvx-row__detail">
                      {props.pt(g().origin === "automatic" ? "automatic" : "byYou")}
                    </span>
                    <Show when={archived()}>
                      <span class="nsvx__chip">{props.pt("archived")}</span>
                    </Show>
                  </div>
                </div>
                <Show when={!archived()}>
                  <button
                    type="button"
                    class="nsvx__button nsvx__button--primary"
                    aria-expanded={panel() === "add" ? "true" : "false"}
                    onClick={() => toggle("add")}
                  >
                    <Icon name="plus" />
                    {props.pt("person")}
                  </button>
                </Show>
              </header>
              <Show when={g().description}>
                <p class="nsvx-ppl__hint">{g().description}</p>
              </Show>
              <div class="nsvx-ppl-tools" role="toolbar" aria-label={props.pt("more")}>
                <Show when={!archived()}>
                  <IconButton
                    icon="edit"
                    label={props.pt("rename")}
                    pressed={panel() === "rename"}
                    onClick={() => toggle("rename")}
                  />
                  <IconButton
                    icon="merge"
                    label={props.pt("merge")}
                    pressed={panel() === "merge"}
                    onClick={() => toggle("merge")}
                  />
                  <IconButton
                    icon="split"
                    label={props.pt("split")}
                    pressed={panel() === "split"}
                    disabled={g().members.length === 0}
                    onClick={() => toggle("split")}
                  />
                  <IconButton
                    icon="spark"
                    label={props.pt("suggest")}
                    disabled={change.busy() !== undefined}
                    onClick={() =>
                      void change.run("suggest", "nsvx.groups.change", {
                        action: "suggest",
                        groupId: g().id,
                        key: crypto.randomUUID(),
                      })
                    }
                  />
                </Show>
                <IconButton
                  icon={archived() ? "refresh" : "archive"}
                  label={props.pt(archived() ? "reactivate" : "archive")}
                  disabled={change.busy() !== undefined}
                  onClick={() =>
                    void change.run("archive", "nsvx.groups.change", {
                      action: "archive",
                      groupId: g().id,
                      revision: g().revision,
                      on: !archived(),
                    })
                  }
                />
                <Show when={g().can_undo}>
                  <IconButton
                    icon="undo"
                    label={props.pt("undo")}
                    disabled={change.busy() !== undefined}
                    onClick={() =>
                      void change.run("undo", "nsvx.groups.change", {
                        action: "undo",
                        groupId: g().id,
                        revision: g().revision,
                      })
                    }
                  />
                </Show>
                <IconButton
                  icon="trash"
                  label={props.pt("erase")}
                  danger
                  pressed={panel() === "delete"}
                  onClick={() => toggle("delete")}
                />
              </div>
              <div class="nsvx-ppl-switches">
                <Switch
                  icon="lock"
                  label={props.pt("lock")}
                  on={g().owner_locked}
                  disabled={change.busy() !== undefined}
                  onChange={(on) =>
                    void change.run("lock", "nsvx.groups.change", {
                      action: "lock",
                      groupId: g().id,
                      on,
                    })
                  }
                />
                <Switch
                  icon="user"
                  label={props.pt("onlyMe")}
                  on={g().owner_criteria_only}
                  disabled={change.busy() !== undefined}
                  onChange={(on) =>
                    void change.run("ownerOnly", "nsvx.groups.change", {
                      action: "ownerOnly",
                      groupId: g().id,
                      on,
                    })
                  }
                />
              </div>
              <GroupPanel
                {...props}
                g={g()}
                panel={panel()}
                change={change}
                onDone={() => setPanel(undefined)}
              />
              <Note change={change} />
              <Show when={proposed().length > 0}>
                <Section icon="bot" title={props.pt("suggested")} count={proposed().length}>
                  <ul class="nsvx-list">
                    <For each={proposed()}>
                      {(m) => (
                        <MemberRow {...props} m={m}>
                          <IconButton
                            icon="done"
                            label={`${props.pt("add")} ${m.display_name}`}
                            onClick={() => member(g(), m.person_id, "active")}
                          />
                          <IconButton
                            icon="close"
                            label={`${props.pt("remove")} ${m.display_name}`}
                            onClick={() => member(g(), m.person_id, "excluded")}
                          />
                        </MemberRow>
                      )}
                    </For>
                  </ul>
                </Section>
              </Show>
              <Section icon="people" title={props.pt("members")} count={active().length}>
                <Show
                  when={active().length > 0}
                  fallback={<p class="nsvx__empty">{props.pt("nothingYet")}</p>}
                >
                  <ul class="nsvx-list">
                    <For each={active()}>
                      {(m) => (
                        <MemberRow {...props} m={m}>
                          <IconButton
                            icon="close"
                            label={`${props.pt("remove")} ${m.display_name}`}
                            onClick={() => member(g(), m.person_id, "excluded")}
                          />
                        </MemberRow>
                      )}
                    </For>
                  </ul>
                </Show>
              </Section>
              <Show when={out().length > 0}>
                <Section icon="close" title={props.pt("outOfGroup")} count={out().length}>
                  <ul class="nsvx-list">
                    <For each={out()}>
                      {(m) => (
                        <MemberRow {...props} m={m}>
                          <Show when={m.origin === "owner"}>
                            <IconButton
                              icon="refresh"
                              label={props.pt("clear")}
                              onClick={() =>
                                void change.run(`clear-${m.person_id}`, "nsvx.groups.change", {
                                  action: "clearMember",
                                  groupId: g().id,
                                  revision: g().revision,
                                  personId: m.person_id,
                                })
                              }
                            />
                          </Show>
                        </MemberRow>
                      )}
                    </For>
                  </ul>
                </Section>
              </Show>
              <button
                type="button"
                class="nsvx__button nsvx-more"
                aria-expanded={history() ? "true" : "false"}
                onClick={() => setHistory(!history())}
              >
                <Icon name="history" />
                {props.pt("history")}
              </button>
              <Show when={history()}>
                <ul class="nsvx-ppl-plain">
                  <For each={g().events}>
                    {(e) => {
                      const key = eventKey(e.action);
                      return (
                        <li class={{ "nsvx-ppl--past": Boolean(e.undone_at) }}>
                          <span class="nsvx-row__age">{age(e.at)}</span> ·{" "}
                          {key ? props.pt(key) : e.action} ·{" "}
                          <Icon name={e.actor === "owner" ? "user" : "bot"} />
                          <Show when={e.undone_at}> · {props.pt("undone")}</Show>
                        </li>
                      );
                    }}
                  </For>
                </ul>
              </Show>
            </>
          );
        }}
      </SourceView>
    </article>
  );
}

function MemberRow(props: {
  host: ControlUiHost;
  pt: PT;
  m: GroupMember;
  onPerson: (id: string) => void;
  children?: unknown;
}) {
  return (
    <li class="nsvx-row nsvx-ppl-member">
      <button
        type="button"
        class="nsvx-ppl-member__link"
        onClick={() => props.onPerson(props.m.person_id)}
      >
        <PersonAvatar host={props.host} personId={props.m.person_id} name={props.m.display_name} />
        <span class="nsvx-row__main">
          <span class="nsvx-row__title">{props.m.display_name}</span>
          <span class="nsvx-row__detail" title={props.m.rationale ?? undefined}>
            <Icon name={props.m.origin === "automatic" ? "bot" : "user"} />{" "}
            {props.pt(props.m.origin === "automatic" ? "automatic" : "byYou")}
          </span>
        </span>
      </button>
      <span class="nsvx-ppl-member__actions">{props.children as never}</span>
    </li>
  );
}
