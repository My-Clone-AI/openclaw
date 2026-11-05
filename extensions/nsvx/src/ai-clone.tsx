/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import {
  TRAINING_MODELS,
  trainingRun,
  type BenchCommand,
  type CloneAiBench,
  type CloneAiPanel,
  type OpenClawProviders,
  type TrainingModel,
  type TrainingRun,
} from "./ai-data.js";
import {
  AiLogo,
  ChangeNote,
  codeLabel,
  Confirm,
  createAiChange,
  LANE_ICONS,
  laneTitle,
  Meter,
  poll,
  StateChip,
  type AiBase,
} from "./ai-ui.js";
import { Switch } from "./people-ui.js";
import { createSource, Icon, SourceView } from "./ui-kit.js";

const MODEL_LABEL: Record<TrainingModel, string> = {
  "qwen35-4b": "Qwen3.5 · 4B",
  "qwen3-8b": "Qwen3 · 8B",
};

/** NSVX's Clone AI panel polls every 10 s; the Mac heartbeat lasts about 15 s. */
const PANEL_REFRESH_MS = 15_000;

function online(panel: CloneAiPanel): boolean {
  const device = panel.device.device;
  return (
    panel.device.available === true &&
    device?.registered === true &&
    (device.heartbeat_age_s ?? Number.POSITIVE_INFINITY) <= (device.heartbeat_ttl_s ?? 15)
  );
}

/** Bars scaled to the largest value in the group; a group of zeros draws empty tracks. */
function Bars(props: { rows: { label: string; value: number; tone?: "bad" }[]; title: string }) {
  const max = () => Math.max(1, ...props.rows.map((row) => row.value));
  return (
    <div class="nsvx-ai-bars" role="img" aria-label={props.title}>
      <For each={props.rows}>
        {(row) => (
          <div class="nsvx-ai-bars__row">
            <span>{row.label}</span>
            <span class="nsvx-ai-meter__track">
              <span
                class={["nsvx-ai-meter__fill", { "nsvx-ai-meter__fill--hot": row.tone === "bad" }]}
                style={{ width: `${Math.round((row.value / max()) * 100)}%` }}
              />
            </span>
            <strong>{row.value}</strong>
          </div>
        )}
      </For>
    </div>
  );
}

/**
 * Clone AI on the Mac (NSVX Clone AI admin): device, relay, routing, promotion, training, local experiments, and its
 * OpenClaw provider entry. Routing admits or removes Clone AI from saved routes; it never starts or stops the Mac.
 */
export function CloneView(props: AiBase) {
  const panel = createSource(props.host, () =>
    props.host.request<CloneAiPanel>("nsvx.view", { view: "cloneAi" }),
  );
  const runs = createSource(props.host, () =>
    props.host.request<{ items: TrainingRun[] }>("nsvx.view", { view: "localTraining" }),
  );
  const openclaw = createSource(props.host, () =>
    props.host.request<OpenClawProviders>("nsvx.view", { view: "aiProviders" }),
  );
  const bench = createSource(props.host, () =>
    props.host.request<CloneAiBench>("nsvx.view", {
      view: "cloneAiBench",
      params: { model: "clone-ai" },
    }),
  );
  const reload = () => {
    void panel.refresh();
    void bench.refresh();
    void runs.refresh();
    void openclaw.refresh();
  };
  poll(() => {
    void panel.refresh();
    void bench.refresh();
  }, PANEL_REFRESH_MS);
  poll(() => {
    void runs.refresh();
    void openclaw.refresh();
  }, 60_000);
  const change = createAiChange(props.host, props.at, reload);
  const [model, setModel] = createSignal<TrainingModel>("qwen35-4b");
  const [confirm, setConfirm] = createSignal<string>();
  const busy = () => change.busy() !== undefined;
  // One command id per intent, kept until NSVX confirms, so a retry after an unknown result is deduped by NSVX.
  let pending: { command: BenchCommand; id: string } | undefined;
  const train = (command: BenchCommand) => {
    if (pending?.command !== command) {
      pending = { command, id: crypto.randomUUID() };
    }
    void change
      .run<{ executed: boolean; dispatched: boolean; mac_online: boolean }>(
        "train",
        { action: "training", command, commandId: pending.id },
        (result) => {
          pending = undefined;
          return props.at(result.executed ? "done" : result.dispatched ? "accepted" : "queued");
        },
      )
      .then(() => bench.refresh());
  };
  const panelChange = (action: string, more: Record<string, unknown> = {}) =>
    change.run<CloneAiPanel>(action, { action, ...more }, (next) => {
      panel.replace(next);
      return next.action && !next.action.changed ? props.at("noChange") : undefined;
    });
  return (
    <SourceView source={panel} t={props.t}>
      {(data) => {
        const device = () => data().device.device;
        const memory = () => device()?.resources?.memory_free_pct;
        const disk = () => device()?.resources?.disk_free_bytes;
        return (
          <>
            <ChangeNote change={change} />
            <section class="nsvx-ai-hero">
              <AiLogo provider="mac-local" size="l" />
              <span class="nsvx-ai-hero__text">
                <strong>{props.at("clone")}</strong>
                <span>
                  {props.at("mac")} · {data().host}
                </span>
              </span>
              <StateChip
                tone={online(data()) ? (device()?.busy ? "run" : "ok") : "off"}
                label={props.at(
                  online(data())
                    ? device()?.busy
                      ? "busy"
                      : "online"
                    : device()?.registered
                      ? "offline"
                      : "notLinked",
                )}
              />
            </section>
            <div class="nsvx-ai-cards">
              <div class="nsvx-ai-card">
                <span class="nsvx-ai-card__label">
                  <Icon name="link" />
                  {props.at("relay")}
                </span>
                <StateChip
                  tone={data().shim.ok ? "ok" : "bad"}
                  label={props.at(data().shim.ok ? "relayOk" : "relayDown")}
                />
              </div>
              <div class="nsvx-ai-card">
                <Meter
                  at={props.at}
                  label={props.at("memory")}
                  value={typeof memory() === "number" ? memory()! / 100 : null}
                />
              </div>
              <div class="nsvx-ai-card">
                <span class="nsvx-ai-card__label">
                  <Icon name="archive" />
                  {props.at("disk")}
                </span>
                <strong>
                  {typeof disk() === "number"
                    ? `${Math.floor(disk()! / 1024 ** 3)} GiB`
                    : props.at("notMeasured")}
                </strong>
              </div>
            </div>
            <Switch
              icon="flow"
              label={props.at("useInRoutes")}
              on={data().routing.enabled}
              disabled={busy()}
              onChange={(on) => void panelChange("cloneAiRouting", { on })}
            />
            <Show
              when={data().routing.lanes.length > 0}
              fallback={<p class="nsvx__empty">{props.at("noRoutes")}</p>}
            >
              <ul class="nsvx-ai-positions">
                <For each={data().routing.lanes}>
                  {(lane) => (
                    <li>
                      <Icon name={LANE_ICONS[lane.lane as keyof typeof LANE_ICONS] ?? "ai"} />
                      <span>{laneTitle(props.at, lane.lane)}</span>
                      <span class="nsvx-ai-positions__num" aria-label={props.at("position")}>
                        #{lane.position}
                      </span>
                      <StateChip
                        tone={lane.active ? "run" : lane.eligible ? "ok" : "off"}
                        label={props.at(
                          lane.active ? "s_active" : lane.eligible ? "eligible" : "waiting",
                        )}
                      />
                    </li>
                  )}
                </For>
              </ul>
            </Show>

            <section class="nsvx-ai-block" aria-label={props.at("promotion")}>
              <header class="nsvx-ai-block__head">
                <Icon name="star" />
                <h3>{props.at("promotion")}</h3>
                <StateChip
                  tone={data().promotion.state === "promoted" ? "ok" : "off"}
                  label={codeLabel(props.at, "p_", data().promotion.state, "p_none")}
                />
                <Show when={data().promotion.canary}>
                  {(canary) => (
                    <span class="nsvx-ai-block__meta">
                      {props.at("canary")} {canary().passed}/{canary().total}
                    </span>
                  )}
                </Show>
              </header>
              <Show when={data().promotion.window}>
                {(window) => (
                  <Bars
                    title={props.at("last24h")}
                    rows={[
                      { label: props.at("attempts"), value: window().attempts },
                      { label: props.at("failures"), value: window().failed, tone: "bad" },
                      { label: props.at("timeouts"), value: window().timeouts, tone: "bad" },
                    ]}
                  />
                )}
              </Show>
              <div class="nsvx-ai-block__actions">
                <button
                  type="button"
                  class="nsvx__button"
                  disabled={busy()}
                  onClick={() => void panelChange("cloneAiHealth")}
                >
                  <Icon name="decide" />
                  {props.at("evaluate")}
                </button>
                <Show
                  when={confirm() === "rollback"}
                  fallback={
                    <button
                      type="button"
                      class="nsvx__button"
                      disabled={busy() || !data().promotion.rollback_available}
                      onClick={() => setConfirm("rollback")}
                    >
                      <Icon name="undo" />
                      {props.at("rollback")}
                    </button>
                  }
                >
                  <Confirm
                    at={props.at}
                    text={props.at("rollbackSure")}
                    label={props.at("rollback")}
                    busy={busy()}
                    onCancel={() => setConfirm(undefined)}
                    onConfirm={() =>
                      void panelChange("cloneAiRollback").then(() => setConfirm(undefined))
                    }
                  />
                </Show>
              </div>
            </section>

            <section class="nsvx-ai-block" aria-label={props.at("training")}>
              <header class="nsvx-ai-block__head">
                <Icon name="progress" />
                <h3>{props.at("training")}</h3>
              </header>
              <Show when={bench.state().data}>
                {(live) => {
                  const run = () => trainingRun(live());
                  const status = () => (live().status.live ? live().status.status : undefined);
                  return (
                    <div class="nsvx-ai-train">
                      <StateChip
                        tone={
                          status() === "training" ? "run" : status() === "paused" ? "warn" : "off"
                        }
                        label={props.at(
                          status() === "training"
                            ? "training"
                            : status() === "paused"
                              ? "pause"
                              : live().mac_online
                                ? "online"
                                : "offline",
                        )}
                      />
                      <Show when={run()}>
                        {(shown) => (
                          <>
                            <progress
                              max="100"
                              value={shown().progress}
                              aria-label={props.at("progress")}
                            />
                            <strong>{shown().progress}%</strong>
                          </>
                        )}
                      </Show>
                      <button
                        type="button"
                        class="nsvx__button nsvx__button--primary"
                        disabled={busy() || status() === "training"}
                        onClick={() => train(status() === "paused" ? "resume" : "start")}
                      >
                        <Icon name="resume" />
                        {props.at(status() === "paused" ? "resume" : "train")}
                      </button>
                      <button
                        type="button"
                        class="nsvx__button"
                        disabled={busy() || status() !== "training"}
                        onClick={() => train("pause")}
                      >
                        <Icon name="pause" />
                        {props.at("pause")}
                      </button>
                    </div>
                  );
                }}
              </Show>
              <Show
                when={data().training.items.length > 0}
                fallback={<p class="nsvx__empty">{props.at("noTraining")}</p>}
              >
                <ul class="nsvx-ai-runs">
                  <For each={data().training.items}>
                    {(item) => (
                      <li class="nsvx-ai-run">
                        <span class="nsvx-ai-run__head">
                          <StateChip
                            tone={item.status === "failed" ? "bad" : "info"}
                            label={codeLabel(props.at, "t_", item.status, "t_unconfirmed")}
                          />
                          <span class="nsvx-ai-run__date">
                            {item.created_at ? new Date(item.created_at).toLocaleString() : ""}
                          </span>
                        </span>
                        <Show when={item.chart}>
                          {(chart) => (
                            <Bars
                              title={`${chart().cases}`}
                              rows={[
                                { label: props.at("reference"), value: chart().reference },
                                { label: props.at("clone"), value: chart().clone_ai },
                              ]}
                            />
                          )}
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </section>

            <section class="nsvx-ai-block" aria-label={props.at("experiments")}>
              <header class="nsvx-ai-block__head">
                <Icon name="flask" />
                <h3>{props.at("experiments")}</h3>
                <span class="nsvx-ai-block__meta">{props.at("syntheticOnly")}</span>
              </header>
              <div class="nsvx-ai-block__actions">
                <select
                  class="nsvx-ai-select"
                  aria-label={props.at("model")}
                  value={model()}
                  disabled={busy()}
                  onChange={(event) => setModel(event.currentTarget.value as TrainingModel)}
                >
                  <For each={TRAINING_MODELS}>
                    {(id) => <option value={id}>{MODEL_LABEL[id]}</option>}
                  </For>
                </select>
                <button
                  type="button"
                  class="nsvx__button nsvx__button--primary"
                  disabled={busy() || !runs.state().data}
                  onClick={() =>
                    void change
                      .run("prepare", { action: "trainingPrepare", model: model() })
                      .then(() => runs.refresh())
                  }
                >
                  <Icon name="flask" />
                  {props.at("prepare")}
                </button>
              </div>
              <SourceView source={runs} t={props.t}>
                {(history) => (
                  <ul class="nsvx-ai-runs">
                    <For each={history().items}>
                      {(row) => (
                        <li class="nsvx-ai-run">
                          <span class="nsvx-ai-run__head">
                            <strong>{MODEL_LABEL[row.model] ?? row.model}</strong>
                            <StateChip
                              tone={
                                row.status === "failed"
                                  ? "bad"
                                  : row.status === "prepared"
                                    ? "ok"
                                    : "info"
                              }
                              label={codeLabel(props.at, "t_", row.status, "t_unconfirmed")}
                            />
                            <span class="nsvx-ai-run__date">
                              {new Date(row.created_at).toLocaleString()}
                            </span>
                          </span>
                          <Show when={row.evaluation}>
                            {(evaluation) => (
                              <Bars
                                title={`${evaluation().cases}`}
                                rows={[
                                  {
                                    label: props.at("baseline"),
                                    value: evaluation().scores.baseline,
                                  },
                                  {
                                    label: props.at("candidate"),
                                    value: evaluation().scores.candidate,
                                  },
                                ]}
                              />
                            )}
                          </Show>
                          <Show when={row.status === "prepared"}>
                            <Show
                              when={confirm() === row.id}
                              fallback={
                                <button
                                  type="button"
                                  class="nsvx__button"
                                  disabled={busy()}
                                  onClick={() => setConfirm(row.id)}
                                >
                                  <Icon name="trash" />
                                  {props.at("withdraw")}
                                </button>
                              }
                            >
                              <Confirm
                                at={props.at}
                                text={props.at("withdrawSure")}
                                label={props.at("withdraw")}
                                busy={busy()}
                                onCancel={() => setConfirm(undefined)}
                                onConfirm={() =>
                                  void change
                                    .run("revoke", { action: "trainingRevoke", runId: row.id })
                                    .then(() => {
                                      setConfirm(undefined);
                                      return runs.refresh();
                                    })
                                }
                              />
                            </Show>
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                )}
              </SourceView>
            </section>

            <section class="nsvx-ai-block" aria-label={props.at("openclaw")}>
              <header class="nsvx-ai-block__head">
                <Icon name="plug" />
                <h3>{props.at("openclaw")}</h3>
              </header>
              <SourceView source={openclaw} t={props.t}>
                {(providers) => (
                  <div class="nsvx-ai-block__actions">
                    <StateChip
                      tone={providers().cloneAi.registered ? "ok" : "off"}
                      label={props.at(providers().cloneAi.registered ? "registered" : "notLinked")}
                    />
                    <StateChip
                      tone={providers().cloneAi.healthy ? "ok" : "bad"}
                      label={props.at(providers().cloneAi.healthy ? "healthy" : "unhealthy")}
                    />
                    <Show when={!providers().cloneAi.registered}>
                      <button
                        type="button"
                        class="nsvx__button nsvx__button--primary"
                        disabled={busy()}
                        onClick={() =>
                          void change.run<OpenClawProviders>(
                            "register",
                            { action: "cloneAiRegister", hash: providers().hash },
                            (next) => openclaw.replace(next),
                          )
                        }
                      >
                        <Icon name="link" />
                        {props.at("register")}
                      </button>
                    </Show>
                  </div>
                )}
              </SourceView>
            </section>
          </>
        );
      }}
    </SourceView>
  );
}
