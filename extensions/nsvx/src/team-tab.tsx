/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createSignal, For, Show } from "solid-js";
import type { MessageKey } from "./i18n.js";
import {
  buildTeamChart,
  type AgentEntry,
  type TeamAgent,
  type TeamChart,
  type TeamSession,
} from "./org.js";
import type { TeamVersion } from "./team.js";
import {
  age,
  createSource,
  errorMessage,
  Icon,
  matches,
  SourceView,
  type IconName,
  type T,
} from "./ui-kit.js";

type TeamData = {
  chart: TeamChart;
  entries: Record<string, AgentEntry>;
  nodes: { nodeId: string; displayName?: string }[];
  defaultId: string;
  /** Agents paused in this plugin; their old leads come back on resume. */
  paused: Set<string>;
};

type ConfigSnapshot = {
  hash: string;
  parsed?: { agents?: { entries?: Record<string, AgentEntry> } };
};

async function loadTeam(host: ControlUiHost): Promise<TeamData> {
  const [config, roster, sessions, nodes, paused] = await Promise.all([
    host.request<ConfigSnapshot>("config.get"),
    host.request<{ defaultId: string; agents: { id: string; name?: string }[] }>("agents.list"),
    host.request<{ sessions: TeamSession[] }>("sessions.list", { limit: 200 }),
    host.request<{ nodes: { nodeId: string; displayName?: string }[] }>("node.list"),
    host.request<{ paused: { id: string }[] }>("nsvx.team.paused"),
  ]);
  const entries = config.parsed?.agents?.entries ?? {};
  return {
    entries,
    nodes: nodes.nodes,
    defaultId: roster.defaultId,
    paused: new Set(paused.paused.map((agent) => agent.id)),
    chart: buildTeamChart({
      entries,
      roster: roster.agents,
      defaultId: roster.defaultId,
      sessions: sessions.sessions,
    }),
  };
}

function StateBadge(props: { state: TeamAgent["state"] | "paused"; t: T }) {
  return (
    <span class={["nsvx__state", `nsvx__state--${props.state}`]}>
      <span class="nsvx__dot" aria-hidden="true" />
      {props.t(props.state)}
    </span>
  );
}

/** NSVX "task": one message starts a run in the agent's main session. */
function TaskBox(props: { host: ControlUiHost; t: T; agent: string; onSent: () => void }) {
  const [text, setText] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [result, setResult] = createSignal<{ message: string; failed: boolean }>();
  // One key per intent, so a resend after a lost reply joins the first run instead of a second.
  let idempotencyKey = crypto.randomUUID();
  const send = async () => {
    setBusy(true);
    setResult(undefined);
    try {
      await props.host.request("agent", {
        agentId: props.agent,
        message: text().trim(),
        idempotencyKey,
      });
      idempotencyKey = crypto.randomUUID();
      setText("");
      setResult({ message: props.t("sent"), failed: false });
      props.onSent();
    } catch (cause) {
      setResult({ message: errorMessage(props.host, cause), failed: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      class="nsvx-task-box"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <textarea
        rows="2"
        maxlength={10000}
        aria-label={props.t("task")}
        placeholder={props.t("task")}
        value={text()}
        onInput={(event) => {
          setText(event.currentTarget.value);
          idempotencyKey = crypto.randomUUID();
        }}
      />
      <button
        type="submit"
        class="nsvx__button nsvx__button--primary"
        disabled={busy() || !text().trim() || !props.host.connection.canWrite}
      >
        <Icon name="task" />
        {props.t("send")}
      </button>
      <Show when={result()}>
        {(shown) => (
          <p
            role="status"
            class={shown().failed ? "nsvx__notice nsvx__notice--bad" : "nsvx__notice"}
          >
            {shown().message}
          </p>
        )}
      </Show>
    </form>
  );
}

type Version = Omit<TeamVersion, "before"> & { id: string };

const CHANGE: Record<TeamVersion["change"], { icon: IconName; label: MessageKey }> = {
  move: { icon: "team", label: "c_move" },
  assign: { icon: "plug", label: "c_assign" },
  pause: { icon: "pause", label: "pause" },
  resume: { icon: "resume", label: "resume" },
  rollback: { icon: "undo", label: "undo" },
};

/** Recent team changes, newest first; Undo restores the team as it was before one. */
function HistoryList(props: {
  source: ReturnType<typeof createSource<{ versions: Version[] }>>;
  t: T;
  data: TeamData;
  canUndo: boolean;
  undoing: string | undefined;
  onUndo: (version: string) => void;
}) {
  const agentName = (id: string) =>
    [...props.data.chart.agents, ...props.data.chart.unlinked].find((agent) => agent.id === id)
      ?.name ?? id;
  const title = (version: Version) => {
    switch (version.change) {
      case "move":
        return `${agentName(version.agent)} → ${agentName(version.target ?? "")}`;
      case "assign":
        return `${agentName(version.agent)} → ${
          props.data.nodes.find((node) => node.nodeId === version.target)?.displayName ??
          version.target ??
          props.t("gatewayHost")
        }`;
      case "rollback":
        return props.t("restored");
      default:
        return agentName(version.agent);
    }
  };
  return (
    <SourceView source={props.source} t={props.t}>
      {(loaded) => (
        <Show
          when={loaded().versions.length > 0}
          fallback={<p class="nsvx__empty">{props.t("nothing")}</p>}
        >
          <ul class="nsvx-list nsvx-history">
            <For each={loaded().versions} keyed={(version) => version.id}>
              {(version) => (
                <li class="nsvx-row">
                  <Icon name={CHANGE[version().change].icon} class="nsvx-row__icon" />
                  <span class="nsvx-row__main">
                    <span class="nsvx-row__title">{title(version())}</span>
                    <span
                      class={[
                        "nsvx-row__detail",
                        { "nsvx-row__detail--bad": version().afterHash === null },
                      ]}
                    >
                      {[
                        props.t(CHANGE[version().change].label),
                        version().by === "chat" ? props.t("chat") : "",
                        version().afterHash === null ? props.t("unconfirmed") : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span class="nsvx-row__age">{age(new Date(version().at).toISOString())}</span>
                  <button
                    type="button"
                    class={[
                      "nsvx__button",
                      { "nsvx__button--danger": props.undoing === version().id },
                    ]}
                    disabled={!props.canUndo}
                    onClick={() => props.onUndo(version().id)}
                  >
                    <Icon name="undo" />
                    {props.t(props.undoing === version().id ? "confirm" : "undo")}
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      )}
    </SourceView>
  );
}

export function TeamTab(props: { host: ControlUiHost; t: T; query: string }) {
  const team = createSource(props.host, () => loadTeam(props.host));
  const [notice, setNotice] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  void team.refresh();

  const [showHistory, setShowHistory] = createSignal(false);
  const history = createSource(props.host, () =>
    props.host.request<{ versions: Version[] }>("nsvx.team.history"),
  );

  /** Tree changes go through the plugin, which logs each one so Undo can restore it. */
  const change = async (method: string, params: Record<string, unknown>, done: MessageKey) => {
    setSaving(true);
    setNotice("");
    try {
      await props.host.request(method, params);
      setNotice(props.t(done));
    } catch (cause) {
      const code = (cause as { gatewayCode?: string }).gatewayCode;
      setNotice(
        method === "nsvx.team.move" && code === "invalid"
          ? props.t("moveLoop")
          : errorMessage(props.host, cause),
      );
    } finally {
      setSaving(false);
      await Promise.all([team.refresh(), showHistory() ? history.refresh() : undefined]);
    }
  };
  const move = (agentId: string, supervisorId: string) =>
    change("nsvx.team.move", { agentId, supervisorId }, "saved");
  const assign = (agentId: string, nodeId: string) =>
    change("nsvx.team.assign", { agentId, nodeId }, "saved");
  const toggleHistory = () => {
    // Solid 2 does not read a written signal back until the next flush, so use the new value.
    const open = !showHistory();
    setShowHistory(open);
    if (open) {
      void history.refresh();
    }
  };
  const [stopping, setStopping] = createSignal<string>();
  const [tasking, setTasking] = createSignal<string>();
  /** NSVX "restart": end the agent's live runs and drop what is queued behind them. */
  const stop = async (agent: TeamAgent) => {
    if (stopping() !== agent.id) {
      setStopping(agent.id);
      return;
    }
    setStopping(undefined);
    setSaving(true);
    setNotice("");
    try {
      const results = await Promise.allSettled(
        agent.runningKeys.map((key) =>
          props.host.request("sessions.abort", { key, agentId: agent.id, clearQueued: true }),
        ),
      );
      const failure = results.find((result) => result.status === "rejected");
      setNotice(failure ? errorMessage(props.host, failure.reason) : props.t("stopped"));
    } finally {
      setSaving(false);
      await team.refresh();
    }
  };

  const [pausing, setPausing] = createSignal<string>();
  /** NSVX pause: unlink from every lead and stop runs; resume restores the same leads. */
  const togglePause = async (agent: TeamAgent, paused: boolean) => {
    if (!paused && pausing() !== agent.id) {
      setPausing(agent.id);
      return;
    }
    setPausing(undefined);
    await change(
      paused ? "nsvx.team.resume" : "nsvx.team.pause",
      { agentId: agent.id },
      paused ? "resumed" : "paused",
    );
  };
  const [undoing, setUndoing] = createSignal<string>();
  const undo = async (version: string) => {
    if (undoing() !== version) {
      setUndoing(version);
      return;
    }
    setUndoing(undefined);
    await change("nsvx.team.rollback", { version }, "restored");
  };

  const canEdit = () => props.host.connection.canAdmin && !saving();
  const AgentRow = (row: { agent: TeamAgent; data: TeamData }) => {
    const supervisors = () => Object.keys(row.data.entries).filter((id) => id !== row.agent.id);
    const isRoot = () => row.agent.id === row.data.defaultId;
    const paused = () => row.data.paused.has(row.agent.id);
    return (
      <li class="nsvx-agent" style={{ "--nsvx-depth": String(Math.min(row.agent.depth, 6)) }}>
        <span class="nsvx-agent__avatar" aria-hidden="true">
          {row.agent.emoji ?? row.agent.name.slice(0, 1).toUpperCase()}
        </span>
        <span class="nsvx-agent__main">
          <span class="nsvx-agent__name">{row.agent.name}</span>
          <StateBadge
            state={paused() && row.agent.state === "idle" ? "paused" : row.agent.state}
            t={props.t}
          />
        </span>
        <span class="nsvx-agent__controls">
          <button
            type="button"
            class="nsvx__button"
            aria-expanded={tasking() === row.agent.id ? "true" : "false"}
            onClick={() => setTasking(tasking() === row.agent.id ? undefined : row.agent.id)}
          >
            <Icon name="task" />
            {props.t("task")}
          </button>
          <Show when={row.agent.runningKeys.length > 0}>
            <button
              type="button"
              class={["nsvx__button", { "nsvx__button--danger": stopping() === row.agent.id }]}
              disabled={!props.host.connection.canWrite || saving()}
              onClick={() => void stop(row.agent)}
            >
              <Icon name="stop" />
              {props.t(stopping() === row.agent.id ? "confirm" : "stop")}
            </button>
          </Show>
          <Show when={!isRoot() && row.data.entries[row.agent.id]}>
            <button
              type="button"
              class={["nsvx__button", { "nsvx__button--danger": pausing() === row.agent.id }]}
              disabled={!canEdit()}
              onClick={() => void togglePause(row.agent, paused())}
            >
              <Icon name={paused() ? "resume" : "pause"} />
              {props.t(paused() ? "resume" : pausing() === row.agent.id ? "confirm" : "pause")}
            </button>
          </Show>
          <Show when={!isRoot() && !paused() && row.data.entries[row.agent.id]}>
            <label class="nsvx-field">
              <span>{props.t("reportsTo")}</span>
              <select
                disabled={!canEdit()}
                onChange={(event) => void move(row.agent.id, event.currentTarget.value)}
              >
                <Show when={row.agent.supervisors.length === 0}>
                  <option value="" selected>
                    —
                  </option>
                </Show>
                <For each={supervisors()}>
                  {(id) => (
                    <option value={id} selected={row.agent.supervisors[0] === id}>
                      {row.data.chart.agents.find((agent) => agent.id === id)?.name ??
                        row.data.chart.unlinked.find((agent) => agent.id === id)?.name ??
                        id}
                    </option>
                  )}
                </For>
              </select>
            </label>
          </Show>
          <Show when={row.data.nodes.length > 0 && row.data.entries[row.agent.id]}>
            <label class="nsvx-field">
              <span>{props.t("runsOn")}</span>
              <select
                disabled={!canEdit()}
                onChange={(event) => void assign(row.agent.id, event.currentTarget.value)}
              >
                <option value="" selected={!row.agent.node}>
                  {props.t("gatewayHost")}
                </option>
                <For each={row.data.nodes}>
                  {(node) => (
                    <option value={node.nodeId} selected={row.agent.node === node.nodeId}>
                      {node.displayName ?? node.nodeId}
                    </option>
                  )}
                </For>
              </select>
            </label>
          </Show>
        </span>
        <Show when={tasking() === row.agent.id}>
          <TaskBox
            host={props.host}
            t={props.t}
            agent={row.agent.id}
            onSent={() => void team.refresh()}
          />
        </Show>
      </li>
    );
  };
  const visible = (agents: TeamAgent[]) =>
    agents.filter((agent) => matches(props.query, agent.name, agent.id));
  return (
    <SourceView source={team} t={props.t}>
      {(data) => (
        <>
          <div class="nsvx-team__bar">
            <p class="nsvx__notice" role="status">
              {notice()}
            </p>
            <button
              type="button"
              class={["nsvx__button", { "nsvx__tab--active": showHistory() }]}
              aria-expanded={showHistory() ? "true" : "false"}
              onClick={toggleHistory}
            >
              <Icon name="history" />
              {props.t("history")}
            </button>
          </div>
          <Show when={showHistory()}>
            <HistoryList
              source={history}
              t={props.t}
              data={data()}
              canUndo={canEdit()}
              undoing={undoing()}
              onUndo={(version) => void undo(version)}
            />
          </Show>
          <ul class="nsvx-team">
            <For each={visible(data().chart.agents)} keyed={(agent) => agent.id}>
              {(agent) => <AgentRow agent={agent()} data={data()} />}
            </For>
          </ul>
          <Show when={visible(data().chart.unlinked).length > 0}>
            <h2 class="nsvx__heading">{props.t("unlinked")}</h2>
            <ul class="nsvx-team">
              <For each={visible(data().chart.unlinked)} keyed={(agent) => agent.id}>
                {(agent) => <AgentRow agent={agent()} data={data()} />}
              </For>
            </ul>
          </Show>
          <Show when={visible([...data().chart.agents, ...data().chart.unlinked]).length === 0}>
            <p class="nsvx__empty">{props.t("noResults")}</p>
          </Show>
        </>
      )}
    </SourceView>
  );
}
