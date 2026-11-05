/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  factConversation,
  isPastFact,
  type Fact,
  type InterestHistory,
  type InterestStyle,
  type InterestView,
  type Person,
  type Willingness,
} from "./people-data.js";
import type { PeopleKey } from "./people-i18n.js";
import type { PersonLinks } from "./people-person.js";
import {
  ConfirmBar,
  createChange,
  IconButton,
  Note,
  Section,
  type Change,
  type Base,
} from "./people-ui.js";
import { age, createSource, Icon, SourceView, type IconName } from "./ui-kit.js";

// ---------- interests ----------

const WILLINGNESS: { id: Willingness; key: PeopleKey; icon: IconName }[] = [
  { id: "open", key: "open", icon: "done" },
  { id: "defer", key: "defer", icon: "pause" },
  { id: "avoid", key: "avoid", icon: "stop" },
];
const MODES = [
  { id: "off", key: "off" },
  { id: "observe_only", key: "observe" },
  { id: "bounded_learning", key: "adapt" },
] as const;
const SYNC_KEY: Record<string, PeopleKey> = {
  verified: "synced",
  ok: "synced",
  pending: "syncing",
  queued: "syncing",
  failed: "syncFailed",
};
const REACTION = ["unknown", "positive", "neutral", "negative", "mixed"] as const;

export function InterestsSection(props: Base & { personId: string }) {
  const view = createSource(props.host, () =>
    props.host.request<InterestView>("nsvx.view", {
      view: "personInterests",
      params: { id: props.personId },
    }),
  );
  void view.refresh();
  const change = createChange(props.host, props.pt, () => view.refresh());
  const [forgetting, setForgetting] = createSignal<string>();
  const [resetting, setResetting] = createSignal(false);
  const [sources, setSources] = createSignal<{ kind: "topics" | "responses"; topic?: string }>();
  const control = (v: InterestView, name: string, extra: Record<string, unknown> = {}) =>
    void change.run(name, "nsvx.people.change", {
      action: "interests",
      personId: props.personId,
      control: name,
      revision: v.revision,
      ...extra,
    });
  const style = (v: InterestView, patch: InterestStyle) =>
    control(v, "style", {
      learning: v.style.learning ?? true,
      brevity: v.style.brevity ?? "default",
      emoji: v.style.emoji ?? "default",
      language: v.style.language ?? "current",
      ...patch,
    });
  return (
    <Section icon="heart" title={props.pt("interests")} count={view.state().data?.topics.length}>
      <SourceView source={view} t={props.t}>
        {(v) => (
          <>
            <div class="nsvx-ppl-row">
              <div class="nsvx-segment" role="radiogroup" aria-label={props.pt("learning")}>
                <For each={MODES}>
                  {(mode) => (
                    <button
                      type="button"
                      role="radio"
                      aria-pressed={v().mode === mode.id ? "true" : "false"}
                      aria-checked={v().mode === mode.id ? "true" : "false"}
                      disabled={change.busy() !== undefined}
                      onClick={() => control(v(), "mode", { mode: mode.id })}
                    >
                      {props.pt(mode.key)}
                    </button>
                  )}
                </For>
              </div>
              <Show when={v().permitted}>
                <span class="nsvx__chip">{props.pt(SYNC_KEY[v().sync.memory] ?? "syncing")}</span>
                <Show when={v().sync.memory === "failed" || v().sync.drive === "failed"}>
                  <button
                    type="button"
                    class="nsvx__button"
                    onClick={() => control(v(), "retry_sync")}
                  >
                    <Icon name="refresh" />
                    {props.pt("retry")}
                  </button>
                </Show>
              </Show>
            </div>
            <Show
              when={v().permitted}
              fallback={<p class="nsvx__empty">{props.pt("notPermitted")}</p>}
            >
              <div class="nsvx-ppl-row nsvx-ppl-style">
                <label class="nsvx-ppl-select">
                  <span>{props.pt("length")}</span>
                  <select
                    value={v().style.brevity ?? "default"}
                    onChange={(event) =>
                      style(v(), { brevity: event.currentTarget.value as InterestStyle["brevity"] })
                    }
                  >
                    <option value="default">{props.pt("byContext")}</option>
                    <option value="brief">{props.pt("short")}</option>
                    <option value="detailed">{props.pt("long")}</option>
                  </select>
                </label>
                <label class="nsvx-ppl-select">
                  <span>{props.pt("emoji")}</span>
                  <select
                    value={v().style.emoji ?? "default"}
                    onChange={(event) =>
                      style(v(), { emoji: event.currentTarget.value as InterestStyle["emoji"] })
                    }
                  >
                    <option value="default">{props.pt("byContext")}</option>
                    <option value="off">{props.pt("off")}</option>
                    <option value="on">😀</option>
                  </select>
                </label>
                <label class="nsvx-ppl-select">
                  <span>{props.pt("language")}</span>
                  <select
                    value={v().style.language ?? "current"}
                    onChange={(event) =>
                      style(v(), {
                        language: event.currentTarget.value as InterestStyle["language"],
                      })
                    }
                  >
                    <option value="current">{props.pt("sameAsChat")}</option>
                    <option value="pt">PT</option>
                    <option value="en">EN</option>
                  </select>
                </label>
              </div>
              <Show
                when={v().topics.length > 0}
                fallback={<p class="nsvx__empty">{props.pt("nothingYet")}</p>}
              >
                <ul class="nsvx-ppl-topics">
                  <For each={v().topics}>
                    {(topic) => (
                      <li class="nsvx-ppl-topic">
                        <div class="nsvx-ppl-topic__head">
                          <strong>{topic.canonical_label}</strong>
                          <span
                            class="nsvx-ppl-meter"
                            role="meter"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={topic.affinity ?? undefined}
                            aria-label={topic.canonical_label}
                          >
                            <span style={{ width: `${topic.affinity ?? 0}%` }} />
                          </span>
                          <span class="nsvx-row__age">
                            {topic.observation_count}× · {Math.round(topic.confidence * 100)}%
                          </span>
                        </div>
                        <div class="nsvx-ppl-row">
                          <div
                            class="nsvx-segment"
                            role="radiogroup"
                            aria-label={topic.canonical_label}
                          >
                            <For each={WILLINGNESS}>
                              {(w) => (
                                <button
                                  type="button"
                                  role="radio"
                                  aria-pressed={topic.willingness === w.id ? "true" : "false"}
                                  aria-checked={topic.willingness === w.id ? "true" : "false"}
                                  title={props.pt(w.key)}
                                  disabled={change.busy() !== undefined}
                                  onClick={() =>
                                    control(v(), "topic", {
                                      topic_id: topic.topic_id,
                                      label: topic.canonical_label,
                                      willingness: topic.willingness === w.id ? "unknown" : w.id,
                                    })
                                  }
                                >
                                  <Icon name={w.icon} />
                                  <span class="nsvx-ppl-hide-narrow">{props.pt(w.key)}</span>
                                </button>
                              )}
                            </For>
                          </div>
                          <IconButton
                            icon="history"
                            label={props.pt("sources")}
                            pressed={sources()?.topic === topic.topic_id}
                            onClick={() =>
                              setSources(
                                sources()?.topic === topic.topic_id
                                  ? undefined
                                  : { kind: "topics", topic: topic.topic_id },
                              )
                            }
                          />
                          <IconButton
                            icon="trash"
                            label={props.pt("forget")}
                            danger
                            onClick={() => setForgetting(topic.topic_id)}
                          />
                        </div>
                        <Show when={forgetting() === topic.topic_id}>
                          <ConfirmBar
                            pt={props.pt}
                            text={props.pt("sure")}
                            label={props.pt("forget")}
                            busy={change.busy() !== undefined}
                            onCancel={() => setForgetting(undefined)}
                            onConfirm={() => {
                              setForgetting(undefined);
                              control(v(), "forget_topic", { topic_id: topic.topic_id });
                            }}
                          />
                        </Show>
                        <Show when={sources()?.topic === topic.topic_id}>
                          <InterestSources
                            {...props}
                            kind="topics"
                            topic={topic.topic_id}
                            revision={v().revision}
                            change={change}
                          />
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
              <div class="nsvx-ppl-row">
                <button
                  type="button"
                  class="nsvx__button"
                  aria-pressed={sources()?.kind === "responses" ? "true" : "false"}
                  onClick={() =>
                    setSources(sources()?.kind === "responses" ? undefined : { kind: "responses" })
                  }
                >
                  <Icon name="reply" />
                  {props.pt("replies")}
                </button>
                <button
                  type="button"
                  class="nsvx__button nsvx__button--danger"
                  onClick={() => setResetting(true)}
                >
                  <Icon name="undo" />
                  {props.pt("reset")}
                </button>
              </div>
              <Show when={resetting()}>
                <ConfirmBar
                  pt={props.pt}
                  text={props.pt("sure")}
                  label={props.pt("reset")}
                  busy={change.busy() !== undefined}
                  onCancel={() => setResetting(false)}
                  onConfirm={() => {
                    setResetting(false);
                    control(v(), "reset");
                  }}
                />
              </Show>
              <Show when={sources()?.kind === "responses"}>
                <InterestSources
                  {...props}
                  kind="responses"
                  revision={v().revision}
                  change={change}
                />
              </Show>
            </Show>
            <Note change={change} />
          </>
        )}
      </SourceView>
    </Section>
  );
}

/** Observations behind a topic, or how the person received clone's messages; replies can be corrected. */
function InterestSources(
  props: Base & {
    personId: string;
    kind: "topics" | "responses";
    topic?: string;
    revision: number;
    change: Change;
  },
) {
  const history = createSource(props.host, () =>
    props.host.request<InterestHistory>("nsvx.view", {
      view: "personInterestHistory",
      params: {
        id: props.personId,
        kind: props.kind,
        ...(props.topic ? { topic_id: props.topic } : {}),
      },
    }),
  );
  void history.refresh();
  const correct = (item: InterestHistory["items"][number], satisfaction: string) =>
    void props.change.run("feedback", "nsvx.people.change", {
      action: "interests",
      personId: props.personId,
      control: "feedback",
      revision: props.revision,
      response_id: item.id,
      engagement: item.engagement ?? "unknown",
      satisfaction,
      affect: item.affect ?? "unknown",
      feedback_target: "unknown",
      closure: false,
    });
  return (
    <SourceView source={history} t={props.t}>
      {(page) => (
        <Show
          when={page().items.length > 0}
          fallback={<p class="nsvx__empty">{props.pt("nothingYet")}</p>}
        >
          <ul class="nsvx-ppl-sources">
            <For each={page().items}>
              {(item) => (
                <li class={{ "nsvx-ppl--past": Boolean(item.deleted_at || item.superseded_by) }}>
                  <span class="nsvx-row__age">{age(item.observed_at)}</span>
                  <Show
                    when={props.kind === "topics"}
                    fallback={
                      <>
                        <span>{item.emoji ?? (item.owner_corrected ? "✓" : "")}</span>
                        <Show
                          when={["provider_reply", "unattributed"].includes(
                            item.attribution_method ?? "",
                          )}
                          fallback={
                            <span class="nsvx__chip">{item.satisfaction ?? "unknown"}</span>
                          }
                        >
                          <select
                            aria-label={props.pt("replies")}
                            value={item.satisfaction ?? "unknown"}
                            disabled={props.change.busy() !== undefined}
                            onChange={(event) => correct(item, event.currentTarget.value)}
                          >
                            <For each={REACTION}>
                              {(value) => (
                                <option value={value}>
                                  {
                                    {
                                      unknown: "?",
                                      positive: "🙂",
                                      neutral: "😐",
                                      negative: "🙁",
                                      mixed: "🤔",
                                    }[value]
                                  }
                                </option>
                              )}
                            </For>
                          </select>
                        </Show>
                      </>
                    }
                  >
                    <span class="nsvx-ppl-clamp">{item.claim}</span>
                    <span class="nsvx-row__age">{Math.round((item.confidence ?? 0) * 100)}%</span>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      )}
    </SourceView>
  );
}

// ---------- memory ----------

type FactAction = "fix" | "outdated" | "restrict" | "hide" | "erase";
const FACT_ACTIONS: { id: FactAction; nsvx: string; icon: IconName }[] = [
  { id: "fix", nsvx: "correct", icon: "edit" },
  { id: "outdated", nsvx: "obsolete", icon: "history" },
  { id: "restrict", nsvx: "restrict", icon: "lock" },
  { id: "hide", nsvx: "remove", icon: "hide" },
  { id: "erase", nsvx: "erase", icon: "trash" },
];

export function MemorySection(props: PersonLinks & Base & { p: Person; change: Change }) {
  const current = createMemo(() => props.p.facts.filter((f) => !isPastFact(f)));
  const past = createMemo(() => props.p.facts.filter(isPastFact));
  const [showPast, setShowPast] = createSignal(false);
  return (
    <Section icon="star" title={props.pt("memory")} count={current().length}>
      <Show
        when={current().length > 0}
        fallback={<p class="nsvx__empty">{props.pt("nothingYet")}</p>}
      >
        <ul class="nsvx-ppl-facts">
          <For each={current()}>{(fact) => <FactCard {...props} fact={fact} />}</For>
        </ul>
      </Show>
      <Show when={past().length > 0}>
        <button
          type="button"
          class="nsvx__button nsvx-more"
          aria-expanded={showPast() ? "true" : "false"}
          onClick={() => setShowPast(!showPast())}
        >
          <Icon name="history" />
          {props.pt("past")} · {past().length}
        </button>
        <Show when={showPast()}>
          <ul class="nsvx-ppl-facts">
            <For each={past()}>{(fact) => <FactCard {...props} fact={fact} />}</For>
          </ul>
        </Show>
      </Show>
    </Section>
  );
}

function FactCard(props: PersonLinks & Base & { p: Person; fact: Fact; change: Change }) {
  const [action, setAction] = createSignal<FactAction>();
  const [text, setText] = createSignal("");
  const closed = () => props.fact.state === "superseded" || props.fact.state === "removed";
  const conversation = () => factConversation(props.fact, props.p.recent);
  const apply = (id: FactAction) => {
    const nsvx = FACT_ACTIONS.find((a) => a.id === id)?.nsvx;
    void props.change.run(
      `fact-${props.fact.id}`,
      "nsvx.people.change",
      {
        action: "fact",
        factId: props.fact.id,
        factAction: nsvx,
        ...(id === "fix" ? { text: text() } : {}),
      },
      () => setAction(undefined),
    );
  };
  return (
    <li class={["nsvx-ppl-fact", { "nsvx-ppl--past": closed() }]}>
      <p class="nsvx-ppl-fact__text">
        <Show when={props.fact.subject}>
          <span class="nsvx-row__detail">{props.fact.subject}: </span>
        </Show>
        {props.fact.assertion}
      </p>
      <div class="nsvx-ppl-fact__foot">
        <span class="nsvx-row__age">
          {[props.fact.source_kind === "owner" ? "✓" : props.fact.author, age(props.fact.source_at)]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <Show when={props.fact.confidence !== null}>
          <span class="nsvx-row__age">{Math.round((props.fact.confidence ?? 0) * 100)}%</span>
        </Show>
        <Show when={props.fact.sensitivity !== "normal"}>
          <span class="nsvx__chip">
            <Icon name="lock" />
          </span>
        </Show>
        <Show when={props.fact.permitted === false && !closed()}>
          <span class="nsvx__chip">{props.pt("notUsed")}</span>
        </Show>
        <span class="nsvx-ppl-fact__actions">
          <Show when={conversation()}>
            {(id) => (
              <IconButton
                icon="messages"
                label={props.pt("source")}
                onClick={() => props.onConversation(id())}
              />
            )}
          </Show>
          <Show when={!closed()}>
            <For
              each={FACT_ACTIONS.filter(
                (a) => !(a.id === "restrict" && props.fact.sensitivity === "restricted"),
              )}
            >
              {(a) => (
                <IconButton
                  icon={a.icon}
                  label={props.pt(a.id)}
                  danger={a.id === "erase"}
                  pressed={action() === a.id}
                  disabled={props.change.busy() !== undefined}
                  onClick={() => {
                    setText(props.fact.assertion);
                    setAction(action() === a.id ? undefined : a.id);
                  }}
                />
              )}
            </For>
          </Show>
        </span>
      </div>
      <Show when={action()}>
        {(chosen) => (
          <Show
            when={chosen() === "fix"}
            fallback={
              <ConfirmBar
                pt={props.pt}
                text={props.pt(chosen() === "erase" ? "eraseHint" : "sure")}
                label={props.pt(chosen())}
                busy={props.change.busy() !== undefined}
                onCancel={() => setAction(undefined)}
                onConfirm={() => apply(chosen())}
              />
            }
          >
            <form
              class="nsvx-ppl-inline"
              onSubmit={(event) => {
                event.preventDefault();
                apply("fix");
              }}
            >
              <textarea
                class="nsvx-ppl-draft__text"
                rows={2}
                aria-label={props.pt("fix")}
                value={text()}
                onInput={(event) => setText(event.currentTarget.value)}
              />
              <button
                type="submit"
                class="nsvx__button nsvx__button--primary"
                disabled={!text().trim() || text().trim() === props.fact.assertion}
              >
                {props.pt("save")}
              </button>
            </form>
          </Show>
        )}
      </Show>
    </li>
  );
}
