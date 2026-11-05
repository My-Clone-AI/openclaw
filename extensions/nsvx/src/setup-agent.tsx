/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import type { MessageKey } from "./i18n.js";
import type { MT } from "./messages-i18n.js";
import { Speak } from "./messages-ui.js";
import {
  accessChange,
  PROFILES,
  setOnlyPicked,
  toggleTool,
  toolOn,
  type AgentSettingsView,
  type ToolAccess,
  type ToolCatalog,
  type ToolProfile,
} from "./setup-data.js";
import {
  createSource,
  errorMessage,
  Icon,
  matches,
  SourceView,
  type IconName,
  type T,
} from "./ui-kit.js";

const PROFILE_ICON: Record<ToolProfile, IconName> = {
  minimal: "lock",
  coding: "work",
  messaging: "messages",
  full: "wrench",
};

type Roster = { defaultId: string; agents: { id: string; name: string; emoji?: string }[] };
export type Note = { message: string; failed: boolean };

async function loadRoster(host: ControlUiHost): Promise<Roster> {
  const [config, roster] = await Promise.all([
    host.request<{
      parsed?: {
        agents?: {
          entries?: Record<string, { name?: string; identity?: { name?: string; emoji?: string } }>;
        };
      };
    }>("config.get"),
    host.request<{ defaultId: string; agents: { id: string; name?: string }[] }>("agents.list"),
  ]);
  const entries = config.parsed?.agents?.entries ?? {};
  return {
    defaultId: roster.defaultId,
    agents: roster.agents.map((agent) => ({
      id: agent.id,
      name: entries[agent.id]?.identity?.name ?? entries[agent.id]?.name ?? agent.name ?? agent.id,
      emoji: entries[agent.id]?.identity?.emoji,
    })),
  };
}

/** Runs one save, reporting the outcome on screen; nothing is retried by itself. */
export async function save(host: ControlUiHost, t: T, run: () => Promise<unknown>): Promise<Note> {
  try {
    await run();
    return { message: t("saved"), failed: false };
  } catch (cause) {
    return { message: errorMessage(host, cause), failed: true };
  }
}

export function Status(props: { note: Note | undefined }) {
  return (
    <Show when={props.note}>
      {(note) => (
        <p role="status" class={note().failed ? "nsvx__notice nsvx__notice--bad" : "nsvx__notice"}>
          {note().message}
        </p>
      )}
    </Show>
  );
}

export function Avatar(props: { emoji: string | undefined; name: string }) {
  return (
    <span class="nsvx-agent__avatar" aria-hidden="true">
      {props.emoji ?? props.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function InstructionsCard(props: {
  host: ControlUiHost;
  t: T;
  mt: MT;
  locale: string;
  agentId: string;
  initial: string;
}) {
  const [text, setText] = createSignal(props.initial);
  const [saved, setSaved] = createSignal(props.initial);
  const [previous, setPrevious] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const [note, setNote] = createSignal<Note>();
  const write = async (value: string, undo: boolean) => {
    setBusy(true);
    let before: string | undefined;
    const outcome = await save(props.host, props.t, async () => {
      before = (
        await props.host.request<{ previous: string }>("nsvx.agents.instructions", {
          agentId: props.agentId,
          text: value,
        })
      ).previous;
    });
    setBusy(false);
    setNote(outcome);
    if (!outcome.failed) {
      setSaved(value);
      setText(value);
      setPrevious(undo ? undefined : before);
    }
  };
  return (
    <section class="nsvx-panel" aria-label={props.t("instructions")}>
      <h3 class="nsvx-panel__title">
        <Icon name="doc" />
        {props.t("instructions")}
      </h3>
      <div class="nsvx-compose">
        <textarea
          rows="7"
          maxlength={32000}
          aria-label={props.t("instructions")}
          placeholder={props.t("instructionsHint")}
          value={text()}
          onInput={(event) => setText(event.currentTarget.value)}
        />
        <Speak
          locale={props.locale}
          mt={props.mt}
          onText={(said) => setText(text() ? `${text()} ${said}` : said)}
        />
      </div>
      <div class="nsvx-panel__actions">
        <Show when={previous() !== undefined}>
          <button
            type="button"
            class="nsvx__button"
            disabled={busy() || !props.host.connection.canWrite}
            onClick={() => void write(previous() ?? "", true)}
          >
            <Icon name="undo" />
            {props.t("undo")}
          </button>
        </Show>
        <button
          type="button"
          class="nsvx__button nsvx__button--primary"
          disabled={busy() || text() === saved() || !props.host.connection.canWrite}
          onClick={() => void write(text(), false)}
        >
          <Icon name="done" />
          {props.t("save")}
        </button>
      </div>
      <Status note={note()} />
    </section>
  );
}

function ToolsCard(props: {
  host: ControlUiHost;
  t: T;
  agentId: string;
  initial: ToolAccess;
  inherited: ToolProfile | null;
  query: string;
}) {
  const catalog = createSource(props.host, () =>
    props.host.request<ToolCatalog>("tools.catalog", {
      agentId: props.agentId,
      includePlugins: true,
    }),
  );
  void catalog.refresh();
  const [access, setAccess] = createSignal<ToolAccess>(props.initial);
  const [saved, setSaved] = createSignal(JSON.stringify(accessChange(props.initial)));
  const [busy, setBusy] = createSignal(false);
  const [note, setNote] = createSignal<Note>();
  const dirty = createMemo(() => JSON.stringify(accessChange(access())) !== saved());
  const tools = createMemo(
    () => catalog.state().data?.groups.flatMap((group) => group.tools) ?? [],
  );
  const onCount = createMemo(
    () => tools().filter((tool) => toolOn(tool, access(), props.inherited)).length,
  );
  const submit = async () => {
    setBusy(true);
    const change = accessChange(access());
    const outcome = await save(props.host, props.t, () =>
      props.host.request("nsvx.agents.tools", { agentId: props.agentId, ...change }),
    );
    setBusy(false);
    setNote(outcome);
    if (!outcome.failed) {
      setSaved(JSON.stringify(change));
    }
  };
  return (
    <section class="nsvx-panel" aria-label={props.t("tools")}>
      <h3 class="nsvx-panel__title">
        <Icon name="wrench" />
        {props.t("tools")}
        <Show when={tools().length > 0}>
          <span class="nsvx__chip">
            {onCount()}/{tools().length}
          </span>
        </Show>
      </h3>
      <div class="nsvx-profiles" role="radiogroup" aria-label={props.t("tools")}>
        <button
          type="button"
          role="radio"
          aria-checked={access().profile === undefined ? "true" : "false"}
          class={["nsvx-profile", { "nsvx-profile--on": access().profile === undefined }]}
          onClick={() => setAccess({ ...access(), profile: undefined })}
        >
          <Icon name="setup" />
          <span>{props.t("p_inherit")}</span>
        </button>
        <For each={PROFILES}>
          {(profile) => (
            <button
              type="button"
              role="radio"
              aria-checked={access().profile === profile ? "true" : "false"}
              class={["nsvx-profile", { "nsvx-profile--on": access().profile === profile }]}
              onClick={() => setAccess({ ...access(), profile })}
            >
              <Icon name={PROFILE_ICON[profile]} />
              <span>{props.t(`p_${profile}` as MessageKey)}</span>
            </button>
          )}
        </For>
      </div>
      <button
        type="button"
        role="switch"
        class={["nsvx-switch", { "nsvx-switch--on": Boolean(access().allow) }]}
        aria-checked={access().allow ? "true" : "false"}
        onClick={() =>
          setAccess(setOnlyPicked(!access().allow, tools(), access(), props.inherited))
        }
      >
        <span class="nsvx-switch__track" aria-hidden="true" />
        {props.t("onlyPicked")}
      </button>
      <SourceView source={catalog} t={props.t}>
        {(loaded) => (
          <For each={loaded().groups} keyed={(group) => group.id}>
            {(group) => (
              <Show when={group().tools.some((tool) => matches(props.query, tool.label, tool.id))}>
                <div class="nsvx-toolgroup">
                  <h4 class="nsvx-toolgroup__title">{group().label}</h4>
                  <div class="nsvx-toolchips">
                    <For
                      each={group().tools.filter((tool) =>
                        matches(props.query, tool.label, tool.id),
                      )}
                      keyed={(tool) => tool.id}
                    >
                      {(tool) => (
                        <button
                          type="button"
                          class={[
                            "nsvx-toolchip",
                            { "nsvx-toolchip--on": toolOn(tool(), access(), props.inherited) },
                          ]}
                          aria-pressed={
                            toolOn(tool(), access(), props.inherited) ? "true" : "false"
                          }
                          title={tool().id}
                          onClick={() => setAccess(toggleTool(tool(), access(), props.inherited))}
                        >
                          <Icon
                            name={toolOn(tool(), access(), props.inherited) ? "done" : "close"}
                          />
                          {tool().label}
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            )}
          </For>
        )}
      </SourceView>
      <div class="nsvx-panel__actions">
        <button
          type="button"
          class="nsvx__button"
          disabled={busy() || !dirty()}
          onClick={() => setAccess(props.initial)}
        >
          {props.t("cancel")}
        </button>
        <button
          type="button"
          class="nsvx__button nsvx__button--primary"
          disabled={
            busy() || !dirty() || access().allow?.length === 0 || !props.host.connection.canWrite
          }
          onClick={() => void submit()}
        >
          <Icon name="done" />
          {props.t("save")}
        </button>
      </div>
      <Status note={note()} />
    </section>
  );
}

export function AgentsPane(props: {
  host: ControlUiHost;
  t: T;
  mt: MT;
  locale: string;
  query: string;
  open: string | undefined;
  onOpen: (id: string) => void;
}) {
  const roster = createSource(props.host, () => loadRoster(props.host));
  void roster.refresh();
  // Held outside signals: a pick must load that agent even before the parent's write is visible.
  let wanted = props.open;
  const [shown, setShown] = createSignal(props.open);
  const settings = createSource(props.host, async () => {
    const agentId =
      wanted ?? (await props.host.request<{ defaultId: string }>("agents.list")).defaultId;
    return props.host.request<AgentSettingsView>("nsvx.agents.get", { agentId });
  });
  void settings.refresh();
  const selected = createMemo(() => shown() ?? settings.state().data?.agentId);
  const pick = (id: string) => {
    wanted = id;
    setShown(id);
    props.onOpen(id);
    void settings.refresh();
  };
  return (
    <SourceView source={roster} t={props.t}>
      {(loaded) => (
        <>
          <div class="nsvx-agentbar" role="tablist" aria-label={props.t("s_agents")}>
            <For each={loaded().agents} keyed={(agent) => agent.id}>
              {(agent) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected() === agent().id ? "true" : "false"}
                  class={["nsvx-agentpick", { "nsvx-agentpick--on": selected() === agent().id }]}
                  onClick={() => pick(agent().id)}
                >
                  <Avatar emoji={agent().emoji} name={agent().name} />
                  <span class="nsvx-agentpick__name">{agent().name}</span>
                </button>
              )}
            </For>
          </div>
          <SourceView source={settings} t={props.t}>
            {(current) => (
              <Show
                when={current().agentId === selected()}
                fallback={
                  <p class="nsvx__empty" aria-busy="true">
                    {props.t("loading")}
                  </p>
                }
              >
                <For each={[current()]} keyed={(entry) => entry.agentId}>
                  {(entry) => (
                    <div class="nsvx-panels">
                      <InstructionsCard
                        host={props.host}
                        t={props.t}
                        mt={props.mt}
                        locale={props.locale}
                        agentId={entry().agentId}
                        initial={entry().instructions}
                      />
                      <ToolsCard
                        host={props.host}
                        t={props.t}
                        agentId={entry().agentId}
                        initial={entry().tools}
                        inherited={entry().inheritedProfile}
                        query={props.query}
                      />
                    </div>
                  )}
                </For>
              </Show>
            )}
          </SourceView>
        </>
      )}
    </SourceView>
  );
}
