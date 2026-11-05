/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import { CloneView } from "./ai-clone.js";
import {
  currentNode,
  lanesOf,
  movedChain,
  nodeState,
  providerState,
  seconds,
  successRate,
  untilReset,
  usage,
  type AiState,
  type Lane,
  type LaneState,
  type Provider,
} from "./ai-data.js";
import { FlowView } from "./ai-flow.js";
import { aiKey, type AiKey, type AT } from "./ai-i18n.js";
import { LogView } from "./ai-log.js";
import {
  AiLogo,
  ChangeNote,
  Confirm,
  createAiChange,
  effortLabel,
  LANE_ICONS,
  laneTitle,
  Meter,
  poll,
  StateChip,
  type AiBase,
  type AiChange,
} from "./ai-ui.js";
import { VoiceView } from "./ai-voice.js";
import { IconButton, Switch } from "./people-ui.js";
import { createSource, Icon, matches, SourceView, type IconName } from "./ui-kit.js";
import "./ai.css";

export const AI_VIEWS = ["routes", "accounts", "flow", "clone", "voice", "log"] as const;
export type AiView = (typeof AI_VIEWS)[number];

const VIEW_ICONS: Record<AiView, IconName> = {
  routes: "flow",
  accounts: "user",
  flow: "link",
  clone: "laptop",
  voice: "mic",
  log: "activity",
};

/** NSVX polls the routing state every 20 s; its event stream is browser-session only. */
const STATE_REFRESH_MS = 20_000;

export function AiTab(props: AiBase & { view: AiView; onView: (view: AiView) => void }) {
  return (
    <div class="nsvx-ai">
      <div class="nsvx-seg nsvx-ai__views" role="tablist" aria-label={props.at("ai")}>
        <For each={AI_VIEWS}>
          {(id) => (
            <button
              type="button"
              role="tab"
              aria-selected={props.view === id ? "true" : "false"}
              aria-label={props.at(id)}
              title={props.at(id)}
              class={["nsvx-seg__item", { "nsvx-seg__item--on": props.view === id }]}
              onClick={() => props.onView(id)}
            >
              <Icon name={VIEW_ICONS[id]} />
              <span>{props.at(id)}</span>
            </button>
          )}
        </For>
      </div>
      <Show when={props.view === "routes" || props.view === "accounts"}>
        <StateViews
          host={props.host}
          t={props.t}
          at={props.at}
          query={props.query}
          view={props.view === "accounts" ? "accounts" : "routes"}
        />
      </Show>
      <Show when={props.view === "flow"}>
        <FlowView host={props.host} t={props.t} at={props.at} query={props.query} />
      </Show>
      <Show when={props.view === "clone"}>
        <CloneView host={props.host} t={props.t} at={props.at} query={props.query} />
      </Show>
      <Show when={props.view === "voice"}>
        <VoiceView host={props.host} t={props.t} at={props.at} query={props.query} />
      </Show>
      <Show when={props.view === "log"}>
        <LogView host={props.host} t={props.t} at={props.at} query={props.query} />
      </Show>
    </div>
  );
}

/** Routes and Accounts share one `/api/ai/state` read; every change answers with the new state. */
function StateViews(props: AiBase & { view: "routes" | "accounts" }) {
  const state = createSource(props.host, () =>
    props.host.request<AiState>("nsvx.view", { view: "aiState" }),
  );
  poll(() => state.refresh(), STATE_REFRESH_MS);
  const change = createAiChange(props.host, props.at, () => state.refresh());
  const show = (next: AiState) => {
    state.replace(next);
  };
  return (
    <SourceView source={state} t={props.t}>
      {(data) => (
        <>
          <ChangeNote change={change} />
          <Show
            when={props.view === "routes"}
            fallback={
              <Accounts
                host={props.host}
                t={props.t}
                at={props.at}
                query={props.query}
                state={data()}
                change={change}
                onState={show}
              />
            }
          >
            <Routes
              host={props.host}
              t={props.t}
              at={props.at}
              query={props.query}
              state={data()}
              change={change}
              onState={show}
            />
          </Show>
        </>
      )}
    </SourceView>
  );
}

type StateProps = AiBase & { state: AiState; change: AiChange; onState: (state: AiState) => void };

function Routes(props: StateProps) {
  const alerts = createMemo(() =>
    (props.state.health?.alerts ?? [])
      .map((code) => aiKey("h_", code))
      .filter((key): key is AiKey => key !== undefined),
  );
  const lanes = createMemo(() =>
    lanesOf(props.state.lanes).filter((lane) =>
      matches(
        props.query,
        laneTitle(props.at, lane),
        ...props.state.lanes[lane]!.chain.flatMap((n) => [n.label, n.model, n.subscription]),
      ),
    ),
  );
  const rate = () => successRate(props.state.stats);
  return (
    <>
      <Show when={alerts().length > 0}>
        <ul class="nsvx-ai-alerts" aria-label={props.at("a_alerts")}>
          <For each={alerts()}>
            {(key) => (
              <li>
                <Icon name="alert" />
                {props.at(key)}
              </li>
            )}
          </For>
        </ul>
      </Show>
      <div class="nsvx-ai-stats" role="group" aria-label={props.at("last24h")}>
        <Stat
          icon="activity"
          label={props.at("requests")}
          value={String(props.state.stats.total)}
        />
        <Stat
          icon="done"
          label={props.at("okRate")}
          value={rate() === null ? "—" : `${Math.round(rate()! * 100)}%`}
          tone={rate() !== null && rate()! < 0.9 ? "bad" : undefined}
        />
        <Stat
          icon="history"
          label={props.at("avgTime")}
          value={seconds(props.state.stats.avg_latency_ms)}
        />
        <Stat icon="flow" label={props.at("switches")} value={String(props.state.stats.switches)} />
      </div>
      <div class="nsvx-ai-lanes">
        <For each={lanes()}>
          {(lane) => (
            <LaneCard
              host={props.host}
              t={props.t}
              at={props.at}
              query={props.query}
              lane={lane}
              data={props.state.lanes[lane]!}
              change={props.change}
              onState={props.onState}
            />
          )}
        </For>
      </div>
      <Settings at={props.at} state={props.state} change={props.change} onState={props.onState} />
    </>
  );
}

function Stat(props: { icon: IconName; label: string; value: string; tone?: "bad" }) {
  return (
    <div class={["nsvx-ai-stat", { "nsvx-ai-stat--bad": props.tone === "bad" }]}>
      <Icon name={props.icon} />
      <strong>{props.value}</strong>
      <span>{props.label}</span>
    </div>
  );
}

function LaneCard(
  props: AiBase & {
    lane: Lane;
    data: LaneState;
    change: AiChange;
    onState: (state: AiState) => void;
  },
) {
  const [skipping, setSkipping] = createSignal<string>();
  const [reason, setReason] = createSignal("");
  const [resetting, setResetting] = createSignal(false);
  const [tested, setTested] = createSignal<{ ok: boolean; model?: string | null }>();
  const now = createMemo(() => currentNode(props.data));
  const title = () => laneTitle(props.at, props.lane);
  const busy = () => props.change.busy() !== undefined;
  const skipped = () => Object.keys(props.data.skips ?? {});
  const save = (params: Record<string, unknown>) =>
    props.change.run<AiState>(
      `${props.lane}:${String(params.action)}`,
      { lane: props.lane, ...params },
      (next) => props.onState(next),
    );
  const move = (from: number, by: -1 | 1) => {
    const chain = movedChain(props.data.chain, from, by);
    if (chain) {
      void save({ action: "laneOrder", chain });
    }
  };
  const test = () =>
    void props.change.run<{
      ok: boolean;
      request: { actual_model?: string | null } | null;
      state: AiState;
    }>(`${props.lane}:test`, { action: "laneTest", lane: props.lane }, (result) => {
      props.onState(result.state);
      setTested({ ok: result.ok, model: result.request?.actual_model });
      return props.at(result.ok ? "tested" : "testFailed");
    });
  return (
    <article
      class={["nsvx-ai-lane", { "nsvx-ai-lane--off": !props.data.enabled }]}
      aria-label={title()}
    >
      <header class="nsvx-ai-lane__head">
        <span class="nsvx-ai-lane__icon">
          <Icon name={LANE_ICONS[props.lane]} />
        </span>
        <h3>{title()}</h3>
        <Show when={props.data.running.length > 0}>
          <StateChip tone="run" label={`${props.data.running.length} ${props.at("running")}`} />
        </Show>
        <span class="nsvx-ai-lane__tools">
          <IconButton
            icon="flask"
            label={`${props.at("test")} ${title()}`}
            disabled={busy() || !props.data.enabled}
            onClick={test}
          />
          <Switch
            label={props.at(props.data.enabled ? "on" : "off")}
            on={props.data.enabled}
            disabled={busy()}
            onChange={(on) => void save({ action: "laneEnabled", on })}
          />
        </span>
      </header>
      <div class="nsvx-ai-now">
        <Show
          when={now()}
          fallback={
            <p class="nsvx-ai-now__none">
              <Icon name="pause" />
              {props.at("none")}
            </p>
          }
        >
          {(node) => (
            <>
              <AiLogo provider={node().provider} size="l" />
              <span class="nsvx-ai-now__text">
                <span class="nsvx-ai-now__kicker">{props.at(node().active ? "now" : "next")}</span>
                <strong>{node().label}</strong>
                <span class="nsvx-ai-now__sub">
                  {[effortLabel(props.at, node().effort), node().subscription]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </>
          )}
        </Show>
        <Show when={tested()}>
          {(result) => (
            <StateChip
              tone={result().ok ? "ok" : "bad"}
              label={
                result().ok
                  ? [props.at("tested"), result().model].filter(Boolean).join(" · ")
                  : props.at("testFailed")
              }
            />
          )}
        </Show>
      </div>
      <Show when={props.data.source_chain === "normal" && props.lane !== "normal"}>
        <p class="nsvx-ai-lane__hint">{props.at("usesNormal")}</p>
      </Show>
      <ol class="nsvx-ai-chain" aria-label={title()}>
        <For each={props.data.chain}>
          {(node, index) => (
            <li
              class={[
                "nsvx-ai-step",
                {
                  "nsvx-ai-step--current":
                    node.provider === now()?.provider && node.model === now()?.model,
                },
              ]}
            >
              <span class="nsvx-ai-step__num">{index() + 1}</span>
              <AiLogo provider={node.provider} />
              <span class="nsvx-ai-step__main">
                <span class="nsvx-ai-step__name">{node.label}</span>
                <span class="nsvx-ai-step__sub">
                  {[effortLabel(props.at, node.effort), node.subscription]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <StateChip
                tone={nodeState(node).tone}
                label={[
                  props.at(nodeState(node).key as AiKey),
                  node.eligible ? "" : untilReset(node.reset_at),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
              <span class="nsvx-ai-step__tools">
                <IconButton
                  icon="up"
                  label={`${props.at("up")} ${node.label}`}
                  disabled={busy() || index() === 0}
                  onClick={() => move(index(), -1)}
                />
                <IconButton
                  icon="down"
                  label={`${props.at("down")} ${node.label}`}
                  disabled={busy() || index() === props.data.chain.length - 1}
                  onClick={() => move(index(), 1)}
                />
                <IconButton
                  icon="skip"
                  label={`${props.at("skip")} ${node.subscription || node.label}`}
                  disabled={busy() || Boolean(props.data.skips?.[node.provider])}
                  onClick={() => {
                    setSkipping(node.provider);
                    setReason("");
                  }}
                />
              </span>
            </li>
          )}
        </For>
      </ol>
      <Show when={skipping()}>
        {(provider) => (
          <form
            class="nsvx-ai-skip"
            onSubmit={(event) => {
              event.preventDefault();
              void save({ action: "laneSkip", providerId: provider(), reason: reason() }).then(
                (next) => next && setSkipping(undefined),
              );
            }}
          >
            <input
              class="nsvx-ai-skip__input"
              aria-label={props.at("skipWhy")}
              placeholder={props.at("skipWhy")}
              maxlength={200}
              value={reason()}
              onInput={(event) => setReason(event.currentTarget.value)}
            />
            <button type="button" class="nsvx__button" onClick={() => setSkipping(undefined)}>
              {props.at("cancel")}
            </button>
            <button
              type="submit"
              class="nsvx__button nsvx__button--primary"
              disabled={busy() || reason().trim().length < 3}
            >
              <Icon name="skip" />
              {props.at("skip")}
            </button>
          </form>
        )}
      </Show>
      <footer class="nsvx-ai-lane__foot">
        <Show when={skipped().length > 0}>
          <button
            type="button"
            class="nsvx__button"
            disabled={busy()}
            onClick={() => void save({ action: "laneRestore" })}
          >
            <Icon name="undo" />
            {props.at("restore")}
          </button>
        </Show>
        <Show
          when={resetting()}
          fallback={
            <button
              type="button"
              class="nsvx__button nsvx-ai__quiet"
              disabled={busy()}
              onClick={() => setResetting(true)}
            >
              <Icon name="refresh" />
              {props.at("reset")}
            </button>
          }
        >
          <Confirm
            at={props.at}
            text={props.at("resetSure")}
            label={props.at("reset")}
            busy={busy()}
            onCancel={() => setResetting(false)}
            onConfirm={() => void save({ action: "laneReset" }).then(() => setResetting(false))}
          />
        </Show>
      </footer>
    </article>
  );
}

/** NSVX Settings card: retry and time limits (shared by Chat and Coding) and the repair approval switch. */
function Settings(props: {
  at: AT;
  state: AiState;
  change: AiChange;
  onState: (state: AiState) => void;
}) {
  const base = () => props.state.lanes.normal?.policy ?? {};
  // Writable derivations: an edit holds until NSVX sends a new policy.
  const [retries, setRetries] = createSignal(() => base().max_retries);
  const [timeout, setTimeoutValue] = createSignal(() => base().timeout_s);
  const [background, setBackground] = createSignal(() => base().background_max_utilization_pct);
  const dirty = () =>
    retries() !== base().max_retries ||
    timeout() !== base().timeout_s ||
    background() !== base().background_max_utilization_pct;
  const repair = () => props.state.lanes.repair;
  const busy = () => props.change.busy() !== undefined;
  const field = (
    label: AiKey,
    value: () => number | undefined,
    set: (value: number) => void,
    min: number,
    max: number,
  ) => (
    <label class="nsvx-ai-field">
      <span>{props.at(label)}</span>
      <input
        type="number"
        inputmode="numeric"
        min={min}
        max={max}
        value={value() ?? ""}
        onInput={(event) => set(Number(event.currentTarget.value))}
      />
    </label>
  );
  return (
    <details class="nsvx-ai-settings">
      <summary>
        <Icon name="edit" />
        {props.at("settings")}
      </summary>
      <div class="nsvx-ai-settings__body">
        {field("retries", retries, setRetries, 0, 5)}
        {field("timeout", timeout, setTimeoutValue, 30, 3600)}
        {field("background", background, setBackground, 0, 100)}
        <button
          type="button"
          class="nsvx__button nsvx__button--primary"
          disabled={busy() || !dirty()}
          onClick={() =>
            void props.change.run<AiState>(
              "policy",
              {
                action: "lanePolicy",
                policy: {
                  max_retries: retries(),
                  timeout_s: timeout(),
                  background_max_utilization_pct: background(),
                },
              },
              (next) => props.onState(next),
            )
          }
        >
          {props.at("save")}
        </button>
        <Show when={repair()?.approval_mode}>
          <Switch
            icon="decide"
            label={props.at("approveFixes")}
            on={repair()?.require_approval !== false}
            disabled={busy()}
            onChange={(on) =>
              void props.change.run<AiState>("approval", { action: "repairApproval", on }, (next) =>
                props.onState(next),
              )
            }
          />
        </Show>
      </div>
    </details>
  );
}

function Accounts(props: StateProps) {
  const rows = createMemo(() =>
    props.state.providers.filter((p) =>
      matches(props.query, p.name, p.email, p.detected_email, p.subscription, p.id),
    ),
  );
  return (
    <Show when={rows().length > 0} fallback={<p class="nsvx__empty">{props.at("noAccounts")}</p>}>
      <ul class="nsvx-ai-accounts">
        <For each={rows()}>
          {(p) => <AccountRow at={props.at} p={p} change={props.change} onState={props.onState} />}
        </For>
      </ul>
    </Show>
  );
}

function AccountRow(props: {
  at: AT;
  p: Provider;
  change: AiChange;
  onState: (state: AiState) => void;
}) {
  const state = () => providerState(props.p);
  const who = () => props.p.email ?? props.p.detected_email ?? undefined;
  const busy = () => props.change.busy() !== undefined;
  const save = (action: string, more: Record<string, unknown> = {}) =>
    void props.change.run<AiState>(
      `${props.p.id}:${action}`,
      { action, providerId: props.p.id, ...more },
      (next) => props.onState(next),
    );
  return (
    <li class={["nsvx-ai-account", { "nsvx-ai-account--off": !props.p.enabled }]}>
      <AiLogo provider={props.p.id} size="l" />
      <span class="nsvx-ai-account__main">
        <span class="nsvx-ai-account__name">
          {who() ?? props.p.name}
          <Show when={props.p.preferred}>
            <Icon name="star" class={["nsvx__icon", "nsvx-ai-account__star"]} />
          </Show>
        </span>
        <span class="nsvx-ai-account__sub">
          {[who() ? props.p.name : "", props.p.subscription].filter(Boolean).join(" · ")}
        </span>
        <span class="nsvx-ai-account__bars">
          <For each={usage(props.p)}>
            {(w) => (
              <Meter
                at={props.at}
                label={(() => {
                  const key = aiKey("w_", w.key);
                  return key ? props.at(key) : w.key;
                })()}
                value={w.used}
                hint={w.resetsAt ? `${props.at("resets")} ${untilReset(w.resetsAt)}` : undefined}
              />
            )}
          </For>
        </span>
      </span>
      <span class="nsvx-ai-account__side">
        <StateChip tone={state().tone} label={props.at(state().key as AiKey)} />
        <span class="nsvx-ai-account__tools">
          <Show when={props.p.account}>
            <IconButton
              icon="star"
              label={props.at("preferred")}
              pressed={props.p.preferred === true}
              disabled={busy()}
              onClick={() => save("providerPreferred", { on: props.p.preferred !== true })}
            />
          </Show>
          <IconButton
            icon="refresh"
            label={`${props.at("refresh")} ${props.p.name}`}
            disabled={busy()}
            onClick={() => save("providerRefresh")}
          />
          <IconButton
            icon="flask"
            label={`${props.at("test")} ${props.p.name}`}
            disabled={busy() || !props.p.enabled}
            onClick={() =>
              void props.change.run<{ results: { ok: boolean }[]; state: AiState }>(
                `${props.p.id}:test`,
                { action: "providerTest", providerId: props.p.id },
                (result) => {
                  props.onState(result.state);
                  return props.at(result.results.every((r) => r.ok) ? "tested" : "testFailed");
                },
              )
            }
          />
          <Switch
            label={props.at(props.p.enabled ? "on" : "off")}
            on={props.p.enabled}
            disabled={busy()}
            onChange={(on) => save("providerEnabled", { on })}
          />
        </span>
      </span>
    </li>
  );
}
