/** @jsxImportSource @solidjs/web */
import { For, Show } from "solid-js";
import type { AiChange } from "./ai-client.js";
import {
  laneIds,
  moveRoute,
  nodeTone,
  providerTone,
  usageWindows,
  type AiState,
  type ChainNode,
  type LaneState,
  type Provider,
} from "./ai-data.js";
import type { AiT } from "./ai-i18n.js";
import {
  AiIcon,
  Bar,
  createChanger,
  Dot,
  IconButton,
  Mark,
  NoticeLine,
  Toggle,
  type ViewProps,
} from "./ai-kit.js";
import { createSource, matches, SourceView } from "./ui-kit.js";

// ---------------- routes ----------------

function Stats(props: { state: AiState; at: AiT }) {
  const stats = () => props.state.stats;
  const okRate = () =>
    stats().total > 0 ? `${Math.round((stats().ok / stats().total) * 100)}%` : "—";
  const avg = () =>
    stats().avg_latency_ms === null ? "—" : `${(stats().avg_latency_ms! / 1000).toFixed(1)} s`;
  const tiles = () => [
    { id: "requests", value: String(stats().total) },
    { id: "okRate", value: okRate() },
    { id: "failed", value: String(stats().failed), bad: stats().failed > 0 },
    { id: "avgTime", value: avg() },
    { id: "switches", value: String(stats().switches) },
  ];
  return (
    <div class="nsvx-ai-stats" aria-label={props.at("last24h")}>
      <For each={tiles()} keyed={(tile) => tile.id}>
        {(tile) => (
          <div class={["nsvx-ai-stat", { "nsvx-ai-stat--bad": tile().bad }]}>
            <strong>{tile().value}</strong>
            <span>{props.at(tile().id)}</span>
          </div>
        )}
      </For>
    </div>
  );
}

function LaneCard(props: {
  id: string;
  lane: LaneState;
  at: AiT;
  busy: string;
  canWrite: boolean;
  onChange: (key: string, change: AiChange, test?: boolean) => void;
}) {
  const locked = () => !props.canWrite || props.busy !== "";
  const isNext = (node: ChainNode) =>
    props.lane.next?.provider === node.provider && props.lane.next?.model === node.model;
  const skipped = () => Object.keys(props.lane.skips ?? {}).length > 0;
  return (
    <article class={["nsvx-ai-lane", { "nsvx-ai-lane--off": !props.lane.enabled }]}>
      <header class="nsvx-ai-lane__head">
        <AiIcon name={props.id} class="nsvx-ai-lane__icon" />
        <strong class="nsvx-ai-lane__name">{props.at(props.id)}</strong>
        <Show when={props.lane.running.length > 0}>
          <span class="nsvx__chip">
            {props.lane.running.length} {props.at("running")}
          </span>
        </Show>
        <span class="nsvx-ai-lane__tools">
          <Show when={skipped()}>
            <IconButton
              icon="restore"
              label={props.at("restore")}
              disabled={locked()}
              onClick={() =>
                props.onChange(`restore:${props.id}`, { op: "lane.restore", lane: props.id })
              }
            />
          </Show>
          <IconButton
            icon="play"
            label={props.at("test")}
            disabled={locked() || !props.lane.enabled}
            onClick={() =>
              props.onChange(`test:${props.id}`, { op: "lane.test", lane: props.id }, true)
            }
          />
          <Toggle
            checked={props.lane.enabled}
            label={props.at(props.lane.enabled ? "on" : "off")}
            disabled={locked()}
            onChange={(enabled) =>
              props.onChange(`enabled:${props.id}`, { op: "lane.enabled", lane: props.id, enabled })
            }
          />
        </span>
      </header>
      <ol
        class="nsvx-ai-chain"
        aria-label={props.at(props.id)}
        aria-busy={props.busy.endsWith(`:${props.id}`) ? "true" : "false"}
      >
        <For
          each={props.lane.chain}
          keyed={(node) => `${node.provider}/${node.model}/${node.effort ?? ""}`}
        >
          {(node, index) => {
            const state = () => nodeTone(node());
            const move = (to: number) => {
              const chain = moveRoute(props.lane.chain, index(), to);
              if (chain) {
                props.onChange(`order:${props.id}`, { op: "lane.order", lane: props.id, chain });
              }
            };
            return (
              <li
                class={["nsvx-ai-node", { "nsvx-ai-node--next": isNext(node()) || node().active }]}
              >
                <span class="nsvx-ai-node__pos">{index() + 1}</span>
                <Mark id={node().provider} />
                <span class="nsvx-ai-node__main">
                  <span class="nsvx-ai-node__title">{node().label || node().model}</span>
                  <span class="nsvx-ai-node__meta">
                    <Dot tone={state().tone} label={props.at(state().key)} />
                    <Show when={isNext(node()) && !node().active}>
                      <span class="nsvx__chip">{props.at("next")}</span>
                    </Show>
                    <span class="nsvx-ai-node__detail">
                      {[/-\d+$/.test(node().provider) ? node().provider : "", node().effort ?? ""]
                        .filter((part) => part)
                        .join(" · ")}
                    </span>
                  </span>
                </span>
                <span class="nsvx-ai-node__tools">
                  <IconButton
                    icon="up"
                    label={props.at("up")}
                    disabled={locked() || index() === 0}
                    onClick={() => move(index() - 1)}
                  />
                  <IconButton
                    icon="down"
                    label={props.at("down")}
                    disabled={locked() || index() === props.lane.chain.length - 1}
                    onClick={() => move(index() + 1)}
                  />
                  <IconButton
                    icon="skip"
                    label={props.at("skip")}
                    disabled={locked() || node().reason === "skipped"}
                    onClick={() =>
                      props.onChange(`skip:${props.id}`, {
                        op: "lane.skip",
                        lane: props.id,
                        provider: node().provider,
                        reason: props.at("skipReason"),
                      })
                    }
                  />
                </span>
              </li>
            );
          }}
        </For>
      </ol>
    </article>
  );
}

export function RoutesView(props: ViewProps) {
  const state = createSource(props.host, () =>
    props.host.request<AiState>("nsvx.ai.read", { view: "state" }),
  );
  void state.refresh();
  const changer = createChanger<AiState>(props.host, props.at, state);
  const change = (key: string, request: AiChange, test?: boolean) =>
    void changer.run(
      key,
      request,
      (result) => (test ? (result as { state: AiState }).state : (result as AiState)),
      test
        ? (result) => {
            const outcome = result as { ok: boolean; error: string | null };
            return outcome.ok
              ? {
                  text: `${props.at(request.op === "lane.test" ? request.lane : "")} · ${props.at("passed")}`,
                }
              : {
                  text: `${props.at("testFailed")}: ${props.host.redact(outcome.error ?? "")}`,
                  bad: true,
                };
          }
        : undefined,
    );
  return (
    <SourceView source={state} t={props.t}>
      {(data) => (
        <>
          <Stats state={data()} at={props.at} />
          <Show when={(data().health?.alerts ?? []).length > 0}>
            <ul class="nsvx-ai-alerts" role="status">
              <For each={data().health?.alerts ?? []}>{(alert) => <li>{alert}</li>}</For>
            </ul>
          </Show>
          <NoticeLine notice={changer.notice()} />
          <div class="nsvx-ai-lanes">
            <For
              each={laneIds(data().lanes).filter((id) =>
                matches(
                  props.query,
                  props.at(id),
                  id,
                  ...data().lanes[id]!.chain.map((node) => `${node.label} ${node.model}`),
                ),
              )}
            >
              {(id) => (
                <LaneCard
                  id={id}
                  lane={data().lanes[id]!}
                  at={props.at}
                  busy={changer.busy()}
                  canWrite={props.host.connection.canWrite}
                  onChange={change}
                />
              )}
            </For>
          </div>
        </>
      )}
    </SourceView>
  );
}

// ---------------- accounts ----------------

const WINDOW_LABEL: Record<string, string> = {
  five_hour: "5 h",
  seven_day: "7 d",
  seven_day_opus: "7 d Opus",
  seven_day_sonnet: "7 d Sonnet",
  primary: "5 h",
  secondary: "7 d",
};

export function AccountsView(props: ViewProps) {
  const state = createSource(props.host, () =>
    props.host.request<AiState>("nsvx.ai.read", { view: "state" }),
  );
  void state.refresh();
  const changer = createChanger<AiState>(props.host, props.at, state);
  const locked = () => !props.host.connection.canWrite || changer.busy() !== "";
  const stateLabel = (provider: Provider) => {
    const tone = providerTone(provider);
    if (tone === "off") {
      return props.at("off");
    }
    for (const limit of ["exhausted", "rate_limited"]) {
      if (provider.quota.some((row) => row.state === limit)) {
        return props.at(limit);
      }
    }
    return props.at(
      tone === "ok"
        ? "connected"
        : provider.state === "AUTH_REQUIRED"
          ? "auth_required"
          : "uninstalled",
    );
  };
  return (
    <SourceView source={state} t={props.t}>
      {(data) => (
        <>
          <NoticeLine notice={changer.notice()} />
          <ul class="nsvx-list nsvx-ai-accounts">
            <For
              each={data().providers.filter((provider) =>
                matches(
                  props.query,
                  provider.name,
                  provider.id,
                  provider.email,
                  provider.subscription,
                ),
              )}
              keyed={(provider) => provider.id}
            >
              {(provider) => (
                <li class={["nsvx-ai-account", { "nsvx-ai-account--off": !provider().enabled }]}>
                  <Mark id={provider().id} />
                  <span class="nsvx-ai-account__main">
                    <span class="nsvx-ai-node__title">
                      {provider().name}
                      <Show when={provider().preferred}>
                        <AiIcon name="star" class="nsvx-ai-star" />
                      </Show>
                    </span>
                    <span class="nsvx-ai-node__detail">
                      {provider().email || provider().subscription}
                    </span>
                    <span class="nsvx-ai-account__bars">
                      <For each={usageWindows(provider())} keyed={(window) => window.key}>
                        {(window) => (
                          <Bar
                            value={window().used}
                            label={WINDOW_LABEL[window().key] ?? window().key}
                            tone={
                              (window().used ?? 0) >= 0.95
                                ? "bad"
                                : (window().used ?? 0) >= 0.8
                                  ? "warn"
                                  : "ok"
                            }
                          />
                        )}
                      </For>
                    </span>
                  </span>
                  <Dot tone={providerTone(provider())} label={stateLabel(provider())} />
                  <span class="nsvx-ai-node__tools">
                    <Show when={provider().account}>
                      <IconButton
                        icon="star"
                        label={props.at("preferred")}
                        pressed={provider().preferred === true}
                        disabled={locked()}
                        onClick={() =>
                          void changer.run(`preferred:${provider().id}`, {
                            op: "provider.preferred",
                            provider: provider().id,
                            preferred: !provider().preferred,
                          })
                        }
                      />
                    </Show>
                    <IconButton
                      icon="restore"
                      label={props.at("refresh")}
                      disabled={locked()}
                      onClick={() =>
                        void changer.run(`refresh:${provider().id}`, {
                          op: "provider.refresh",
                          provider: provider().id,
                        })
                      }
                    />
                    <IconButton
                      icon="play"
                      label={props.at("test")}
                      disabled={locked() || !provider().enabled}
                      onClick={() =>
                        void changer.run(
                          `test:${provider().id}`,
                          { op: "provider.test", provider: provider().id },
                          () => undefined,
                          (result) => {
                            const reply = result as { ok?: boolean; error?: string | null };
                            return reply.ok
                              ? { text: `${provider().name} · ${props.at("passed")}` }
                              : {
                                  text: `${props.at("testFailed")}: ${props.host.redact(reply.error ?? "")}`,
                                  bad: true,
                                };
                          },
                        )
                      }
                    />
                    <Toggle
                      checked={provider().enabled}
                      label={props.at(provider().enabled ? "on" : "off")}
                      disabled={locked()}
                      onChange={(enabled) =>
                        void changer.run(`enabled:${provider().id}`, {
                          op: "provider.enabled",
                          provider: provider().id,
                          enabled,
                        })
                      }
                    />
                  </span>
                </li>
              )}
            </For>
          </ul>
        </>
      )}
    </SourceView>
  );
}
