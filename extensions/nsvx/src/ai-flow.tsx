/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import { seconds, type AiKeys, type InferenceOps, type Parity } from "./ai-data.js";
import type { AiKey } from "./ai-i18n.js";
import {
  AiLogo,
  ChangeNote,
  Confirm,
  createAiChange,
  effortLabel,
  LANE_ICONS,
  laneTitle,
  poll,
  StateChip,
  type AiBase,
} from "./ai-ui.js";
import { Switch } from "./people-ui.js";
import { age, createSource, Icon, matches, SourceView, type IconName } from "./ui-kit.js";

/** NSVX's own Inference ops card polls every 60 s; its API keys card every 30 s. */
const OPS_REFRESH_MS = 60_000;

const PARITIES: (Parity | null)[] = ["odd", "even", null];

/**
 * Inference flows (NSVX Apps → IA → team inference and API keys): which model serves chat, work, and code, every
 * lane's fallback chain, which subscription accounts each server's agents use, and whether apps may call NSVX AI.
 * Keys are created, rotated, and shown once only in NSVX: Control lists their prefixes and use, never a secret.
 */
export function FlowView(props: AiBase) {
  const ops = createSource(props.host, () =>
    props.host.request<InferenceOps>("nsvx.view", { view: "aiOps" }),
  );
  const keys = createSource(props.host, () =>
    props.host.request<AiKeys>("nsvx.view", { view: "aiKeys" }),
  );
  poll(() => {
    void ops.refresh();
    void keys.refresh();
  }, OPS_REFRESH_MS);
  const change = createAiChange(props.host, props.at, () => {
    void ops.refresh();
    void keys.refresh();
  });
  return (
    <>
      <ChangeNote change={change} />
      <SourceView source={ops} t={props.t}>
        {(data) => (
          <>
            <Models {...props} ops={data()} />
            <Servers {...props} ops={data()} change={change} onSaved={() => void ops.refresh()} />
          </>
        )}
      </SourceView>
      <SourceView source={keys} t={props.t}>
        {(data) => (
          <Apps {...props} keys={data()} change={change} onSaved={() => void keys.refresh()} />
        )}
      </SourceView>
    </>
  );
}

/** A request's path drawn left to right: who asks, then the models in the order NSVX tries them. */
function Models(props: AiBase & { ops: InferenceOps }) {
  const normal = () => props.ops.lanes.find((lane) => lane.id === "normal")?.chain ?? [];
  const rows = (): {
    icon: IconName;
    label: AiKey;
    steps: { provider: string; label: string; effort: string | null }[];
  }[] => [
    { icon: "messages", label: "f_chat", steps: normal() },
    { icon: "tasks", label: "f_work", steps: [props.ops.work] },
    {
      icon: "grow",
      label: "f_grow",
      steps: [{ provider: "openai", label: props.ops.grow.model, effort: props.ops.grow.effort }],
    },
  ];
  const lanes = createMemo(() =>
    props.ops.lanes.filter(
      (lane) =>
        lane.id !== "normal" &&
        matches(props.query, laneTitle(props.at, lane.id), ...lane.chain.map((n) => n.label)),
    ),
  );
  return (
    <section class="nsvx-ai-block" aria-label={props.at("flow")}>
      <ol class="nsvx-ai-flow">
        <For each={rows()}>
          {(row) => (
            <li class="nsvx-ai-flow__row">
              <span class="nsvx-ai-flow__from">
                <Icon name={row.icon} />
                <strong>{props.at(row.label)}</strong>
              </span>
              <Steps at={props.at} steps={row.steps} />
            </li>
          )}
        </For>
      </ol>
      <details class="nsvx-ai-settings">
        <summary>
          <Icon name="flow" />
          {props.at("routes")}
        </summary>
        <ol class="nsvx-ai-flow nsvx-ai-flow--lanes">
          <For each={lanes()}>
            {(lane) => (
              <li class="nsvx-ai-flow__row">
                <span class="nsvx-ai-flow__from">
                  <Icon name={LANE_ICONS[lane.id] ?? "ai"} />
                  <span>{laneTitle(props.at, lane.id)}</span>
                </span>
                <Steps at={props.at} steps={lane.chain} />
              </li>
            )}
          </For>
        </ol>
      </details>
    </section>
  );
}

function Steps(props: {
  at: AiBase["at"];
  steps: { provider: string; label: string; effort: string | null }[];
}) {
  return (
    <Show
      when={props.steps.length > 0}
      fallback={<StateChip tone="off" label={props.at("none")} />}
    >
      <ol class="nsvx-ai-flow__steps">
        <For each={props.steps}>
          {(step, index) => (
            <li class="nsvx-ai-flow__step">
              <Show when={index() > 0}>
                <span class="nsvx-ai-flow__arrow" aria-hidden="true">
                  →
                </span>
              </Show>
              <AiLogo provider={step.provider} />
              <span class="nsvx-ai-flow__model">
                {step.label}
                <Show when={step.effort}>
                  <span class="nsvx-ai-flow__effort">{effortLabel(props.at, step.effort)}</span>
                </Show>
              </span>
            </li>
          )}
        </For>
      </ol>
    </Show>
  );
}

function Servers(
  props: AiBase & {
    ops: InferenceOps;
    change: ReturnType<typeof createAiChange>;
    onSaved: () => void;
  },
) {
  const busy = () => props.change.busy() !== undefined;
  const rows = createMemo(() =>
    props.ops.serverAccounts.resolved.filter((server) =>
      matches(
        props.query,
        server.id,
        ...(server.accounts?.codex ?? []),
        ...(server.accounts?.claude ?? []),
      ),
    ),
  );
  const move = (serverId: string, parity: Parity | null) =>
    void props.change
      .run(`server:${serverId}`, { action: "serverParity", serverId, parity })
      .then((saved) => saved && props.onSaved());
  return (
    <section class="nsvx-ai-block" aria-label={props.at("servers")}>
      <header class="nsvx-ai-block__head">
        <Icon name="device" />
        <h3>{props.at("servers")}</h3>
      </header>
      <ul class="nsvx-ai-servers">
        <For each={rows()}>
          {(server) => (
            <li class="nsvx-ai-server">
              <span class="nsvx-ai-server__head">
                <strong>{server.id}</strong>
                <Show when={server.production}>
                  <StateChip tone="info" label={props.at("live")} />
                </Show>
              </span>
              <div class="nsvx-segment" role="group" aria-label={server.id}>
                <For each={PARITIES}>
                  {(parity) => (
                    <button
                      type="button"
                      aria-pressed={server.parity === parity ? "true" : "false"}
                      disabled={busy()}
                      onClick={() => server.parity !== parity && move(server.id, parity)}
                    >
                      {props.at(parity ?? "unassigned")}
                    </button>
                  )}
                </For>
              </div>
              <span class="nsvx-ai-server__accounts">
                <Show
                  when={server.accounts}
                  fallback={<StateChip tone="off" label={props.at("unassigned")} />}
                >
                  {(accounts) => (
                    <>
                      <For each={accounts().codex}>
                        {(name) => (
                          <span class="nsvx-ai-tag">
                            <AiLogo provider="openai" />
                            {name}
                          </span>
                        )}
                      </For>
                      <For each={accounts().claude}>
                        {(name) => (
                          <span class="nsvx-ai-tag">
                            <AiLogo provider="anthropic" />
                            {name}
                          </span>
                        )}
                      </For>
                    </>
                  )}
                </Show>
              </span>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}

function Apps(
  props: AiBase & { keys: AiKeys; change: ReturnType<typeof createAiChange>; onSaved: () => void },
) {
  const [stopping, setStopping] = createSignal(false);
  const busy = () => props.change.busy() !== undefined;
  const usage = createMemo(() => new Map(props.keys.usage.keys.map((u) => [u.key_id, u])));
  const users = createMemo(() =>
    props.keys.users.filter((user) =>
      matches(
        props.query,
        user.name,
        ...props.keys.keys.filter((k) => k.user_id === user.id).map((k) => k.label),
      ),
    ),
  );
  const set = (on: boolean) =>
    void props.change.run("apps", { action: "appsGateway", on }).then((saved) => {
      setStopping(false);
      if (saved) {
        props.onSaved();
      }
    });
  return (
    <section class="nsvx-ai-block" aria-label={props.at("apps")}>
      <header class="nsvx-ai-block__head">
        <Icon name="plug" />
        <h3>{props.at("apps")}</h3>
        <Show when={!props.keys.available_here}>
          <StateChip tone="off" label={props.at("notHere")} />
        </Show>
      </header>
      <Show
        when={stopping()}
        fallback={
          <Switch
            icon="ai"
            label={props.at("appsOn")}
            on={props.keys.settings.enabled}
            disabled={busy()}
            onChange={(on) => (on ? set(true) : setStopping(true))}
          />
        }
      >
        <Confirm
          at={props.at}
          text={props.at("appsOffSure")}
          label={props.at("stop")}
          busy={busy()}
          onCancel={() => setStopping(false)}
          onConfirm={() => set(false)}
        />
      </Show>
      <Show when={users().length > 0} fallback={<p class="nsvx__empty">{props.at("noApps")}</p>}>
        <ul class="nsvx-ai-apps">
          <For each={users()}>
            {(user) => (
              <li class={["nsvx-ai-app", { "nsvx-ai-app--off": !user.active }]}>
                <span class="nsvx-ai-app__name">
                  <Icon name="user" />
                  <strong>{user.name}</strong>
                </span>
                <ul class="nsvx-ai-app__keys" aria-label={props.at("keys")}>
                  <For each={props.keys.keys.filter((k) => k.user_id === user.id)}>
                    {(key) => (
                      <li class="nsvx-ai-key">
                        <code>{key.prefix}…</code>
                        <span class="nsvx-ai-key__label">{key.label ?? ""}</span>
                        <StateChip
                          tone={key.state === "active" ? "ok" : "off"}
                          label={props.at(key.state === "active" ? "on" : "off")}
                        />
                        <span class="nsvx-ai-key__use">
                          {[
                            `${usage().get(key.id)?.requests ?? 0} ${props.at("requests").toLowerCase()}`,
                            seconds(usage().get(key.id)?.p50_ms),
                            key.last_used_at ? age(key.last_used_at) : "",
                          ]
                            .filter((part) => part && part !== "—")
                            .join(" · ")}
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}
