/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import type { MessageKey } from "./i18n.js";
import type { MT } from "./messages-i18n.js";
import { Speak } from "./messages-ui.js";
import { AgentsPane, Avatar, save, Status, type Note } from "./setup-agent.js";
import { THINKING, type DefaultsView, type Idea } from "./setup-data.js";
import { createSource, Icon, matches, SourceView, type IconName, type T } from "./ui-kit.js";

type Pane = "agents" | "defaults" | "ideas";
const PANES: { id: Pane; icon: IconName; label: MessageKey }[] = [
  { id: "agents", icon: "bot", label: "s_agents" },
  { id: "defaults", icon: "setup", label: "s_defaults" },
  { id: "ideas", icon: "spark", label: "s_ideas" },
];
function Stepper(props: {
  label: string;
  icon: IconName;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div class="nsvx-stepper">
      <Icon name={props.icon} />
      <span class="nsvx-stepper__label">{props.label}</span>
      <button
        type="button"
        class="nsvx__button nsvx__button--icon"
        aria-label={`${props.label} −`}
        disabled={props.value <= props.min}
        onClick={() => props.onChange(props.value - 1)}
      >
        −
      </button>
      <output class="nsvx-stepper__value" aria-label={props.label}>
        {props.value}
      </output>
      <button
        type="button"
        class="nsvx__button nsvx__button--icon"
        aria-label={`${props.label} +`}
        disabled={props.value >= props.max}
        onClick={() => props.onChange(props.value + 1)}
      >
        +
      </button>
    </div>
  );
}

function DefaultsForm(props: {
  host: ControlUiHost;
  t: T;
  mt: MT;
  locale: string;
  data: DefaultsView;
}) {
  const [model, setModel] = createSignal(props.data.model ?? "");
  const [thinking, setThinking] = createSignal(props.data.thinkingDefault ?? "");
  const [agents, setAgents] = createSignal(props.data.maxConcurrent ?? 4);
  const [helpers, setHelpers] = createSignal(props.data.subagentsMaxConcurrent ?? 8);
  const [rules, setRules] = createSignal(props.data.rules);
  const [busy, setBusy] = createSignal(false);
  const [note, setNote] = createSignal<Note>();
  const [base, setBase] = createSignal({
    model: props.data.model ?? "",
    thinking: props.data.thinkingDefault ?? "",
    agents: props.data.maxConcurrent ?? 4,
    helpers: props.data.subagentsMaxConcurrent ?? 8,
    rules: props.data.rules,
  });
  const change = createMemo(() => {
    const was = base();
    return {
      ...(model() && model() !== was.model ? { model: model() } : {}),
      ...(thinking() && thinking() !== was.thinking ? { thinkingDefault: thinking() } : {}),
      ...(agents() !== was.agents ? { maxConcurrent: agents() } : {}),
      ...(helpers() !== was.helpers ? { subagentsMaxConcurrent: helpers() } : {}),
      ...(rules() !== was.rules ? { rules: rules() } : {}),
    };
  });
  const kinds = ["subscription", "local", "paid"] as const;
  const submit = async () => {
    setBusy(true);
    const outcome = await save(props.host, props.t, () =>
      props.host.request("nsvx.agents.setDefaults", change()),
    );
    setBusy(false);
    setNote(outcome);
    if (!outcome.failed) {
      setBase({
        model: model(),
        thinking: thinking(),
        agents: agents(),
        helpers: helpers(),
        rules: rules(),
      });
    }
  };
  return (
    <div class="nsvx-panels">
      <section class="nsvx-panel" aria-label={props.t("model")}>
        <h3 class="nsvx-panel__title">
          <Icon name="bot" />
          {props.t("model")}
        </h3>
        <select
          class="nsvx-select"
          aria-label={props.t("model")}
          value={model()}
          onChange={(event) => setModel(event.currentTarget.value)}
        >
          <option value="" disabled>
            {props.t("model")}
          </option>
          <For each={kinds}>
            {(kind) => (
              <optgroup
                label={props.t(
                  kind === "subscription" ? "plan" : kind === "local" ? "local" : "paidBlocked",
                )}
              >
                <For
                  each={props.data.models.filter((entry) => entry.kind === kind)}
                  keyed={(entry) => entry.ref}
                >
                  {(entry) => (
                    <option value={entry().ref} disabled={entry().kind === "paid"}>
                      {entry().name} · {entry().provider}
                    </option>
                  )}
                </For>
              </optgroup>
            )}
          </For>
        </select>
        <h3 class="nsvx-panel__title">
          <Icon name="brain" />
          {props.t("thinking")}
        </h3>
        <div class="nsvx-segment nsvx-segment--wide" role="group" aria-label={props.t("thinking")}>
          <For each={THINKING}>
            {(level) => (
              <button
                type="button"
                aria-pressed={thinking() === level ? "true" : "false"}
                onClick={() => setThinking(level)}
              >
                {props.t(`th_${level}` as MessageKey)}
              </button>
            )}
          </For>
        </div>
        <Stepper
          label={props.t("atOnce")}
          icon="bot"
          value={agents()}
          min={1}
          max={32}
          onChange={setAgents}
        />
        <Stepper
          label={props.t("helpersAtOnce")}
          icon="team"
          value={helpers()}
          min={1}
          max={64}
          onChange={setHelpers}
        />
      </section>
      <section class="nsvx-panel" aria-label={props.t("teamRules")}>
        <h3 class="nsvx-panel__title">
          <Icon name="doc" />
          {props.t("teamRules")}
        </h3>
        <div class="nsvx-compose">
          <textarea
            rows="7"
            maxlength={8000}
            aria-label={props.t("teamRules")}
            placeholder={props.t("rulesHint")}
            value={rules()}
            onInput={(event) => setRules(event.currentTarget.value)}
          />
          <Speak
            locale={props.locale}
            mt={props.mt}
            onText={(said) => setRules(rules() ? `${rules()} ${said}` : said)}
          />
        </div>
      </section>
      <div class="nsvx-panel__actions">
        <button
          type="button"
          class="nsvx__button nsvx__button--primary"
          disabled={busy() || Object.keys(change()).length === 0 || !props.host.connection.canWrite}
          onClick={() => void submit()}
        >
          <Icon name="done" />
          {props.t("save")}
        </button>
      </div>
      <Status note={note()} />
    </div>
  );
}

function DefaultsPane(props: { host: ControlUiHost; t: T; mt: MT; locale: string }) {
  const defaults = createSource(props.host, () =>
    props.host.request<DefaultsView>("nsvx.agents.defaults"),
  );
  void defaults.refresh();
  return (
    <SourceView source={defaults} t={props.t}>
      {(data) => (
        <DefaultsForm
          host={props.host}
          t={props.t}
          mt={props.mt}
          locale={props.locale}
          data={data()}
        />
      )}
    </SourceView>
  );
}

function IdeasPane(props: { host: ControlUiHost; t: T; mt: MT; locale: string; query: string }) {
  const [goal, setGoal] = createSignal("");
  const [asked, setAsked] = createSignal(false);
  const [added, setAdded] = createSignal<Record<string, Note>>({});
  const [adding, setAdding] = createSignal<string>();
  const ideas = createSource(props.host, () =>
    props.host.request<{ source: "clone-ai" | "template"; agents: Idea[] }>("nsvx.agents.suggest", {
      goal: goal().trim(),
    }),
  );
  const ask = () => {
    setAsked(true);
    setAdded({});
    void ideas.refresh();
  };
  const adopt = async (idea: Idea) => {
    setAdding(idea.id);
    const outcome = await save(props.host, props.t, () =>
      props.host.request("nsvx.agents.adopt", {
        id: idea.id,
        name: idea.name,
        emoji: idea.emoji,
        supervisor: idea.supervisor,
        theme: idea.theme,
      }),
    );
    setAdding(undefined);
    setAdded({
      ...added(),
      [idea.id]: outcome.failed ? outcome : { message: props.t("added"), failed: false },
    });
  };
  return (
    <div class="nsvx-panels">
      <form
        class="nsvx-panel"
        aria-label={props.t("goal")}
        onSubmit={(event) => {
          event.preventDefault();
          ask();
        }}
      >
        <h3 class="nsvx-panel__title">
          <Icon name="spark" />
          {props.t("goal")}
        </h3>
        <div class="nsvx-compose">
          <input
            type="text"
            maxlength={600}
            aria-label={props.t("goal")}
            placeholder={props.t("goalHint")}
            value={goal()}
            onInput={(event) => setGoal(event.currentTarget.value)}
          />
          <Speak locale={props.locale} mt={props.mt} onText={(said) => setGoal(said)} />
          <button type="submit" class="nsvx__button nsvx__button--primary">
            <Icon name="spark" />
            {props.t("suggest")}
          </button>
        </div>
      </form>
      <Show when={asked()}>
        <SourceView source={ideas} t={props.t}>
          {(loaded) => (
            <>
              <p class="nsvx-ideas__source">
                <span class="nsvx__chip">
                  {props.t(loaded().source === "clone-ai" ? "ai" : "template")}
                </span>
              </p>
              <ul class="nsvx-ideas">
                <For
                  each={loaded().agents.filter((idea) =>
                    matches(props.query, idea.name, idea.id, idea.theme),
                  )}
                  keyed={(idea) => idea.id}
                >
                  {(idea) => (
                    <li class="nsvx-idea">
                      <Avatar emoji={idea().emoji} name={idea().name ?? idea().id} />
                      <div class="nsvx-idea__main">
                        <strong>{idea().name ?? idea().id}</strong>
                        <span class="nsvx-idea__theme">{idea().theme}</span>
                        <span class="nsvx-idea__lead">
                          <Icon name="team" />
                          {idea().supervisor ?? "—"}
                        </span>
                      </div>
                      <Show
                        when={idea().exists || added()[idea().id]?.failed === false}
                        fallback={
                          <span class="nsvx-idea__add">
                            <button
                              type="button"
                              class="nsvx__button"
                              disabled={adding() !== undefined || !props.host.connection.canWrite}
                              onClick={() => void adopt(idea())}
                            >
                              <Icon name="plus" />
                              {props.t("add")}
                            </button>
                            <Status note={added()[idea().id]} />
                          </span>
                        }
                      >
                        <span class="nsvx__chip nsvx-idea__in" role="status">
                          <Icon name="done" />
                          {added()[idea().id]?.message ?? props.t("exists")}
                        </span>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </>
          )}
        </SourceView>
      </Show>
    </div>
  );
}

/** NSVX Architecture Manager settings: per-agent instructions and tools, team defaults, and team ideas. */
export function SetupTab(props: {
  host: ControlUiHost;
  t: T;
  mt: MT;
  locale: string;
  query: string;
  agent: string | undefined;
  onAgent: (id: string) => void;
}) {
  const [pane, setPane] = createSignal<Pane>("agents");
  return (
    <div class="nsvx-setup">
      <div class="nsvx-segment nsvx-segment--wide" role="tablist" aria-label={props.t("setup")}>
        <For each={PANES}>
          {(entry) => (
            <button
              type="button"
              role="tab"
              aria-pressed={pane() === entry.id ? "true" : "false"}
              aria-selected={pane() === entry.id ? "true" : "false"}
              onClick={() => setPane(entry.id)}
            >
              <Icon name={entry.icon} />
              <span>{props.t(entry.label)}</span>
            </button>
          )}
        </For>
      </div>
      <Show when={pane() === "agents"}>
        <AgentsPane
          host={props.host}
          t={props.t}
          mt={props.mt}
          locale={props.locale}
          query={props.query}
          open={props.agent}
          onOpen={props.onAgent}
        />
      </Show>
      <Show when={pane() === "defaults"}>
        <DefaultsPane host={props.host} t={props.t} mt={props.mt} locale={props.locale} />
      </Show>
      <Show when={pane() === "ideas"}>
        <IdeasPane
          host={props.host}
          t={props.t}
          mt={props.mt}
          locale={props.locale}
          query={props.query}
        />
      </Show>
    </div>
  );
}
