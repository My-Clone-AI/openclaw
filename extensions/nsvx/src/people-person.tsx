/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import { BrandLogo } from "./messages-ui.js";
import { AccountsSection, ContactsSection } from "./people-contacts.js";
import { ContextSection } from "./people-context.js";
import {
  HANDLINGS,
  isActiveMission,
  verifiedChannels,
  type GroupPage,
  type Handling,
  type Person,
} from "./people-data.js";
import type { PeopleKey, PT } from "./people-i18n.js";
import { InterestsSection, MemorySection } from "./people-memory.js";
import { PlacesSection } from "./people-places.js";
import {
  ConfirmBar,
  createChange,
  IconButton,
  Note,
  PersonAvatar,
  Section,
  Switch,
  type Change,
} from "./people-ui.js";
import { age, createSource, Icon, SourceView, type IconName, type T } from "./ui-kit.js";

const MODE_ICON: Record<Handling, IconName> = {
  auto: "resume",
  review: "decide",
  paused: "pause",
  excluded: "stop",
};
const MODE_HINT: Record<Handling, PeopleKey> = {
  auto: "autoHint",
  review: "reviewHint",
  paused: "pausedHint",
  excluded: "excludedHint",
};

export type PersonLinks = {
  onGroup: (id: string) => void;
  onConversation: (id: string) => void;
  onMission: (id: string) => void;
};

/** One NSVX person: everything NSVX's person page shows and changes, read and written through NSVX. */
export function PersonPage(
  props: PersonLinks & {
    host: ControlUiHost;
    t: T;
    pt: PT;
    locale: string;
    id: string;
    onBack: () => void;
  },
) {
  const person = createSource(props.host, () =>
    props.host.request<Person>("nsvx.view", { view: "person", params: { id: props.id } }),
  );
  void person.refresh();
  const change = createChange(props.host, props.pt, () => person.refresh());
  return (
    <article class="nsvx-ppl-page">
      <button type="button" class="nsvx__button nsvx-ppl-page__back" onClick={() => props.onBack()}>
        <Icon name="back" />
        {props.pt("people")}
      </button>
      <SourceView source={person} t={props.t}>
        {(p) => (
          <>
            <Header host={props.host} pt={props.pt} p={p()} change={change} />
            <Show when={p().automation_stop}>
              {(stop) => <StopBanner pt={props.pt} p={p()} kind={stop().kind} change={change} />}
            </Show>
            <ModeSection pt={props.pt} p={p()} change={change} />
            <Note change={change} />
            <GroupsSection {...props} p={p()} change={change} />
            <MessagesSection {...props} p={p()} />
            <TasksSection {...props} p={p()} />
            <InterestsSection host={props.host} t={props.t} pt={props.pt} personId={p().id} />
            <MemorySection {...props} p={p()} change={change} />
            <PlacesSection
              host={props.host}
              t={props.t}
              pt={props.pt}
              locale={props.locale}
              personId={p().id}
            />
            <ContactsSection host={props.host} t={props.t} pt={props.pt} personId={p().id} />
            <AccountsSection host={props.host} t={props.t} pt={props.pt} p={p()} change={change} />
            <ContextSection {...props} p={p()} change={change} />
            <Show when={p().rules.length > 0}>
              <Section icon="lock" title={props.pt("rules")} count={p().rules.length}>
                <ul class="nsvx-ppl-plain">
                  <For each={p().rules}>{(rule) => <li>{rule.meaning}</li>}</For>
                </ul>
              </Section>
            </Show>
          </>
        )}
      </SourceView>
    </article>
  );
}

function Header(props: { host: ControlUiHost; pt: PT; p: Person; change: Change }) {
  const [renaming, setRenaming] = createSignal(false);
  const [name, setName] = createSignal("");
  const [draft, setDraft] = createSignal<string | null>();
  const [copied, setCopied] = createSignal(false);
  const active = createMemo(() => props.p.missions.filter((m) => isActiveMission(m.status)).length);
  const last = () => props.p.recent[0]?.sent_at;
  const followUp = () =>
    void props.change.run<{ text: string | null }>(
      "followUp",
      "nsvx.people.change",
      { action: "followUp", personId: props.p.id },
      (value) => setDraft(value.text ?? null),
    );
  return (
    <header class="nsvx-ppl-head">
      <PersonAvatar
        host={props.host}
        personId={props.p.id}
        name={props.p.display_name}
        large
        photo
      />
      <div class="nsvx-ppl-head__main">
        <Show
          when={renaming()}
          fallback={
            <h2 class="nsvx-ppl-head__name">
              {props.p.display_name}
              <IconButton
                icon="edit"
                label={props.pt("rename")}
                onClick={() => {
                  setName(props.p.display_name);
                  setRenaming(true);
                }}
              />
            </h2>
          }
        >
          <form
            class="nsvx-ppl-inline"
            onSubmit={(event) => {
              event.preventDefault();
              void props.change.run(
                "rename",
                "nsvx.people.change",
                { action: "rename", personId: props.p.id, name: name() },
                () => setRenaming(false),
              );
            }}
          >
            <input
              class="nsvx__search"
              aria-label={props.pt("name")}
              maxlength={120}
              value={name()}
              onInput={(event) => setName(event.currentTarget.value)}
            />
            <button
              type="submit"
              class="nsvx__button nsvx__button--primary"
              disabled={!name().trim()}
            >
              {props.pt("save")}
            </button>
            <button type="button" class="nsvx__button" onClick={() => setRenaming(false)}>
              {props.pt("cancel")}
            </button>
          </form>
        </Show>
        <div class="nsvx-ppl-head__meta">
          <For each={verifiedChannels(props.p)}>
            {(channel) => <BrandLogo channel={channel} size={20} />}
          </For>
          <Show when={last()}>
            <span class="nsvx-row__age">{age(last())}</span>
          </Show>
          <Show when={active() > 0}>
            <span class="nsvx__chip">
              <Icon name="tasks" />
              {active()}
            </span>
          </Show>
        </div>
      </div>
      <button
        type="button"
        class="nsvx__button"
        disabled={props.change.busy() === "followUp"}
        onClick={followUp}
      >
        <Icon name="spark" />
        {props.pt("followUp")}
      </button>
      <Show when={draft() !== undefined}>
        <div class="nsvx-ppl-draft">
          <Show when={draft()} fallback={<p class="nsvx__empty">{props.pt("noDraft")}</p>}>
            {(text) => (
              <>
                <textarea
                  class="nsvx-ppl-draft__text"
                  rows={3}
                  aria-label={props.pt("followUp")}
                  value={text()}
                  onInput={(event) => setDraft(event.currentTarget.value)}
                />
                <button
                  type="button"
                  class="nsvx__button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(draft() ?? "");
                    setCopied(true);
                  }}
                >
                  <Icon name="done" />
                  {props.pt(copied() ? "copied" : "copy")}
                </button>
              </>
            )}
          </Show>
        </div>
      </Show>
    </header>
  );
}

function StopBanner(props: { pt: PT; p: Person; kind: "stop" | "human_only"; change: Change }) {
  const [asking, setAsking] = createSignal(false);
  return (
    <div class="nsvx-ppl-stop" role="status">
      <Icon name={props.kind === "human_only" ? "user" : "stop"} />
      <span>{props.pt(props.kind === "human_only" ? "humanOnly" : "stopped")}</span>
      <Show
        when={asking()}
        fallback={
          <button type="button" class="nsvx__button" onClick={() => setAsking(true)}>
            {props.pt("resume")}
          </button>
        }
      >
        <ConfirmBar
          pt={props.pt}
          text={props.pt("resumeHint")}
          label={props.pt("resume")}
          busy={props.change.busy() !== undefined}
          onCancel={() => setAsking(false)}
          onConfirm={() =>
            void props.change.run("resume", "nsvx.people.change", {
              action: "resume",
              personId: props.p.id,
            })
          }
        />
      </Show>
    </div>
  );
}

function ModeSection(props: { pt: PT; p: Person; change: Change }) {
  const [pending, setPending] = createSignal<Handling>();
  const [start, setStart] = createSignal<string>();
  const [end, setEnd] = createSignal<string>();
  const busy = () => props.change.busy() !== undefined;
  const set = (handling: Handling) =>
    void props.change.run(
      "mode",
      "nsvx.people.change",
      { action: "mode", personId: props.p.id, handling },
      () => setPending(undefined),
    );
  const toggle = (action: "space" | "textOnly" | "voiceReplies", on: boolean) =>
    void props.change.run(action, "nsvx.people.change", { action, personId: props.p.id, on });
  const quietStart = () => start() ?? props.p.quiet_hours?.start ?? "22:00";
  const quietEnd = () => end() ?? props.p.quiet_hours?.end ?? "08:30";
  return (
    <Section icon="decide" title={props.pt("mode")}>
      <div class="nsvx-ppl-modes" role="radiogroup" aria-label={props.pt("mode")}>
        <For each={HANDLINGS}>
          {(handling) => (
            <button
              type="button"
              role="radio"
              class={["nsvx-ppl-mode", `nsvx-ppl-mode--${handling}`]}
              aria-checked={props.p.handling === handling ? "true" : "false"}
              disabled={busy()}
              onClick={() =>
                handling === "paused" || handling === "excluded"
                  ? setPending(handling)
                  : set(handling)
              }
            >
              <Icon name={MODE_ICON[handling]} />
              <span>{props.pt(handling)}</span>
            </button>
          )}
        </For>
      </div>
      <p class="nsvx-ppl__hint">{props.pt(MODE_HINT[props.p.handling])}</p>
      <Show when={pending()}>
        {(handling) => (
          <ConfirmBar
            pt={props.pt}
            text={props.pt("dropsDrafts")}
            label={props.pt(handling())}
            busy={busy()}
            onCancel={() => setPending(undefined)}
            onConfirm={() => set(handling())}
          />
        )}
      </Show>
      <div class="nsvx-ppl-switches">
        <Switch
          icon="stop"
          label={props.pt("space")}
          on={!props.p.social_followup_allowed}
          disabled={busy()}
          onChange={(on) => toggle("space", on)}
        />
        <Switch
          icon="messages"
          label={props.pt("textOnly")}
          on={props.p.voice_pref === "text_only"}
          disabled={busy()}
          onChange={(on) => toggle("textOnly", on)}
        />
        <Switch
          icon="mic"
          label={props.pt("voiceReplies")}
          on={props.p.reply_as_voice === true}
          disabled={busy() || props.p.voice_pref === "text_only"}
          onChange={(on) => toggle("voiceReplies", on)}
        />
      </div>
      <div class="nsvx-ppl-quiet">
        <Icon name="moon" />
        <span>{props.pt("quiet")}</span>
        <input
          type="time"
          aria-label={`${props.pt("quiet")} 1`}
          value={quietStart()}
          onInput={(event) => setStart(event.currentTarget.value)}
        />
        <span aria-hidden="true">–</span>
        <input
          type="time"
          aria-label={`${props.pt("quiet")} 2`}
          value={quietEnd()}
          onInput={(event) => setEnd(event.currentTarget.value)}
        />
        <button
          type="button"
          class="nsvx__button"
          disabled={
            busy() ||
            (quietStart() === props.p.quiet_hours?.start && quietEnd() === props.p.quiet_hours?.end)
          }
          onClick={() =>
            void props.change.run("quiet", "nsvx.people.change", {
              action: "quietHours",
              personId: props.p.id,
              start: quietStart(),
              end: quietEnd(),
            })
          }
        >
          {props.pt("save")}
        </button>
        <Show when={props.p.quiet_hours?.start}>
          <button
            type="button"
            class="nsvx__button"
            disabled={busy()}
            onClick={() =>
              void props.change.run("quiet", "nsvx.people.change", {
                action: "quietHours",
                personId: props.p.id,
                clear: true,
              })
            }
          >
            {props.pt("clear")}
          </button>
        </Show>
      </div>
    </Section>
  );
}

/** Private groups this person is in; owner-only context, never a send list. */
function GroupsSection(
  props: PersonLinks & { host: ControlUiHost; pt: PT; p: Person; change: Change },
) {
  const [adding, setAdding] = createSignal(false);
  const groups = createSource(props.host, () =>
    props.host.request<GroupPage>("nsvx.view", {
      view: "socialGroups",
      params: { limit: "200" },
    }),
  );
  const mine = () => props.p.groups ?? [];
  const others = createMemo(
    () => groups.state().data?.items.filter((g) => !mine().some((m) => m.id === g.id)) ?? [],
  );
  return (
    <Section
      icon="people"
      title={props.pt("groups")}
      count={mine().length}
      action={
        <IconButton
          icon="plus"
          label={props.pt("group")}
          pressed={adding()}
          onClick={() => {
            setAdding(!adding());
            void groups.refresh();
          }}
        />
      }
    >
      <ul class="nsvx-ppl-chips">
        <For each={mine()}>
          {(g) => (
            <li>
              <button
                type="button"
                class={["nsvx-ppl-chip", { "nsvx-ppl-chip--proposed": g.state === "proposed" }]}
                title={g.rationale ?? undefined}
                onClick={() => props.onGroup(g.id)}
              >
                <Icon name={g.member_origin === "automatic" ? "bot" : "user"} />
                {g.display_name}
              </button>
            </li>
          )}
        </For>
      </ul>
      <Show when={adding()}>
        <ul class="nsvx-ppl-chips" aria-label={props.pt("pickGroup")}>
          <For each={others()}>
            {(g) => (
              <li>
                <button
                  type="button"
                  class="nsvx-ppl-chip nsvx-ppl-chip--add"
                  disabled={props.change.busy() !== undefined}
                  onClick={() =>
                    void props.change.run(
                      "group",
                      "nsvx.groups.change",
                      {
                        action: "member",
                        groupId: g.id,
                        revision: g.revision,
                        personId: props.p.id,
                        state: "active",
                      },
                      () => setAdding(false),
                    )
                  }
                >
                  <Icon name="plus" />
                  {g.display_name}
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </Section>
  );
}

function MessagesSection(props: PersonLinks & { pt: PT; p: Person }) {
  const [all, setAll] = createSignal(false);
  const shown = () => (all() ? props.p.recent : props.p.recent.slice(0, 5));
  return (
    <Section icon="messages" title={props.pt("messages")} count={props.p.recent.length}>
      <Show
        when={props.p.recent.length > 0}
        fallback={<p class="nsvx__empty">{props.pt("noMessages")}</p>}
      >
        <ul class="nsvx-list">
          <For each={shown()}>
            {(m) => (
              <li>
                <button
                  type="button"
                  class="nsvx-row nsvx-row--link"
                  onClick={() => props.onConversation(m.conversation_id)}
                >
                  <BrandLogo channel={m.channel} size={22} />
                  <span class="nsvx-row__main">
                    <span class="nsvx-row__detail">
                      {m.direction === "inbound"
                        ? props.p.display_name
                        : m.origin === "agent"
                          ? "clone"
                          : "→"}
                    </span>
                    <span class="nsvx-row__title nsvx-ppl-clamp">{m.body ?? "…"}</span>
                  </span>
                  <span class="nsvx-row__age">{age(m.sent_at)}</span>
                </button>
              </li>
            )}
          </For>
        </ul>
        <Show when={!all() && props.p.recent.length > 5}>
          <button type="button" class="nsvx__button nsvx-more" onClick={() => setAll(true)}>
            {props.pt("more")} · {props.p.recent.length - 5}
          </button>
        </Show>
      </Show>
    </Section>
  );
}

function TasksSection(props: PersonLinks & { pt: PT; p: Person }) {
  const ordered = createMemo(() =>
    props.p.missions.toSorted(
      (a, b) => Number(isActiveMission(b.status)) - Number(isActiveMission(a.status)),
    ),
  );
  return (
    <Show when={props.p.missions.length > 0}>
      <Section
        icon="tasks"
        title={props.pt("tasks")}
        count={props.p.missions.filter((m) => isActiveMission(m.status)).length}
      >
        <ul class="nsvx-list">
          <For each={ordered()}>
            {(m) => (
              <li>
                <button
                  type="button"
                  class={[
                    "nsvx-row",
                    "nsvx-row--link",
                    { "nsvx-ppl--past": !isActiveMission(m.status) },
                  ]}
                  onClick={() => props.onMission(m.id)}
                >
                  <span class="nsvx-row__main">
                    <span class="nsvx-row__title">{m.title}</span>
                  </span>
                  <span class="nsvx__chip">{m.status}</span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Section>
    </Show>
  );
}
