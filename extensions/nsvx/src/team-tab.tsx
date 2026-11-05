/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createSignal, For, Show } from "solid-js";
import {
  assignAgentPatch,
  buildTeamChart,
  moveAgentPatch,
  TeamMoveError,
  type AgentEntry,
  type TeamAgent,
  type TeamChart,
  type TeamSession,
} from "./org.js";
import { createSource, errorMessage, Icon, matches, SourceView, type T } from "./view-kit.js";

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

export function TeamTab(props: { host: ControlUiHost; t: T; query: string }) {
  const team = createSource(props.host, () => loadTeam(props.host));
  const [notice, setNotice] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  void team.refresh();

  /** Always patches against a fresh read, so a stale page cannot overwrite a newer edit. */
  const save = async (buildPatch: (snapshot: ConfigSnapshot) => unknown) => {
    setSaving(true);
    setNotice("");
    try {
      const snapshot = await props.host.request<ConfigSnapshot>("config.get");
      await props.host.request("config.patch", buildPatch(snapshot) as Record<string, unknown>);
      setNotice(props.t("saved"));
    } catch (cause) {
      const conflict = /hash|changed|conflict|stale/i.test(errorMessage(props.host, cause));
      setNotice(
        cause instanceof TeamMoveError
          ? props.t("moveLoop")
          : conflict
            ? props.t("changedElsewhere")
            : errorMessage(props.host, cause),
      );
    } finally {
      setSaving(false);
      await team.refresh();
    }
  };
  const move = (agent: string, supervisor: string) =>
    save((snapshot) =>
      moveAgentPatch(snapshot.parsed?.agents?.entries ?? {}, agent, supervisor, snapshot.hash),
    );
  const assign = (agent: string, node: string) =>
    save((snapshot) => assignAgentPatch(agent, node || null, snapshot.hash));
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
    setSaving(true);
    setNotice("");
    try {
      await props.host.request(paused ? "nsvx.team.resume" : "nsvx.team.pause", {
        agentId: agent.id,
      });
      setNotice(props.t(paused ? "resumed" : "paused"));
    } catch (cause) {
      setNotice(errorMessage(props.host, cause));
    } finally {
      setSaving(false);
      await team.refresh();
    }
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
          <p class="nsvx__notice" role="status">
            {notice()}
          </p>
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
