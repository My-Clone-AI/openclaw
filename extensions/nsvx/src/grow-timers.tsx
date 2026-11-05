/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import { ConfirmButton, createAction, Note, view } from "./device-kit.js";
import { engineBrand, type GrowChains, type GrowRoute, type GrowTimers } from "./grow-data.js";
import type { GrowKey } from "./grow-i18n.js";
import type { GrowCtx } from "./grow-tab.js";
import { BrandLogo } from "./messages-ui.js";
import { IconButton } from "./people-ui.js";
import { age, createSource, Icon, matches, SourceView, type IconName } from "./ui-kit.js";

const STATUS: Record<string, { icon: IconName; tone: string; key: GrowKey }> = {
  ok: { icon: "done", tone: "ok", key: "ok" },
  failed: { icon: "alert", tone: "bad", key: "failed" },
  paused: { icon: "pause", tone: "off", key: "paused" },
  "never-run": { icon: "history", tone: "off", key: "neverRun" },
};

function Route(props: { route: GrowRoute }) {
  const brand = () =>
    engineBrand(props.route.provider === "anthropic" ? "claude" : props.route.provider) ??
    engineBrand(props.route.model);
  return (
    <span class="nsvx__chip">
      <Show when={brand()}>{(b) => <BrandLogo channel={b()} size={14} />}</Show>
      {props.route.model}
      {props.route.effort ? ` · ${props.route.effort}` : ""}
    </span>
  );
}

function ChainHistory(props: {
  ctx: GrowCtx;
  slot: string;
  version: number;
  onRestored: () => void;
}) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () =>
    view<{ items: { version: number; chain: GrowRoute[]; created_at: string }[] }>(
      ctx().host,
      "growChainHistory",
      { slot: props.slot },
    ),
  );
  void source.refresh();
  const action = createAction(ctx);
  return (
    <SourceView source={source} t={ctx().t}>
      {(data) => (
        <>
          <ol class="nsvx-list" aria-label={ctx().gt("history")}>
            <For each={data().items} keyed={(item) => String(item.version)}>
              {(item) => (
                <li class="nsvx-row">
                  <span class="nsvx__chip">v{item().version}</span>
                  <span class="nsvx-row__main nsvx-grow__chain">
                    <For each={item().chain} keyed={false}>
                      {(route) => <Route route={route()} />}
                    </For>
                    <Show when={item().chain.length === 0}>
                      <span class="nsvx-row__detail">{ctx().gt("standard")}</span>
                    </Show>
                  </span>
                  <span class="nsvx-row__age">{age(item().created_at)}</span>
                  <Show when={item().version !== props.version}>
                    <ConfirmButton
                      label={ctx().gt("restore")}
                      confirm={ctx().gt("restore")}
                      cancel={ctx().gt("cancel")}
                      icon="undo"
                      disabled={action.busy() || !ctx().host.connection.canWrite}
                      onConfirm={() =>
                        void action
                          .run(
                            () =>
                              ctx().host.request("nsvx.grow.rollback", {
                                slot: props.slot,
                                version: item().version,
                                expectedVersion: props.version,
                              }),
                            ctx().gt("sent"),
                          )
                          .then((ok) => {
                            if (ok) {
                              // NSVX saves the restored chain as a new version.
                              void source.refresh();
                              props.onRestored();
                            }
                          })
                      }
                    />
                  </Show>
                </li>
              )}
            </For>
          </ol>
          <Note note={action.note()} />
        </>
      )}
    </SourceView>
  );
}

function Chains(props: { ctx: GrowCtx }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () => view<GrowChains>(ctx().host, "growChains"));
  void source.refresh();
  const [open, setOpen] = createSignal<string>();
  return (
    <section class="nsvx-dev__card" aria-label={ctx().gt("models")}>
      <strong class="nsvx-dev__card-title">{ctx().gt("models")}</strong>
      <SourceView source={source} t={ctx().t}>
        {(data) => (
          <ul class="nsvx-list">
            <For each={Object.values(data().slots)} keyed={(slot) => slot.slot}>
              {(slot) => (
                <li class="nsvx-grow__slot">
                  <div class="nsvx-row">
                    <Icon name={slot().slot === "planning" ? "flow" : "work"} />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">
                        {ctx().gt(slot().slot === "planning" ? "planning" : "implementation")}
                      </span>
                      <span class="nsvx-grow__chain">
                        <For each={slot().effective} keyed={false}>
                          {(route) => <Route route={route()} />}
                        </For>
                      </span>
                    </span>
                    <span class="nsvx__chip">v{slot().version}</span>
                    <IconButton
                      icon="history"
                      label={`${ctx().gt("history")} · ${ctx().gt(slot().slot === "planning" ? "planning" : "implementation")}`}
                      pressed={open() === slot().slot}
                      onClick={() => setOpen(open() === slot().slot ? undefined : slot().slot)}
                    />
                  </div>
                  <Show when={open() === slot().slot}>
                    <ChainHistory
                      ctx={ctx()}
                      slot={slot().slot}
                      version={slot().version}
                      onRestored={() => void source.refresh()}
                    />
                  </Show>
                </li>
              )}
            </For>
          </ul>
        )}
      </SourceView>
    </section>
  );
}

export function GrowTimersView(props: { ctx: GrowCtx }) {
  const ctx = () => props.ctx;
  const source = createSource(ctx().host, () => view<GrowTimers>(ctx().host, "growTimers"));
  void source.refresh();
  const action = createAction(ctx);
  return (
    <div class="nsvx-dev__stack">
      <Chains ctx={ctx()} />
      <SourceView source={source} t={ctx().t}>
        {(data) => {
          const apps = createMemo(() =>
            Object.entries(data().apps)
              .map(([app, timers]) => ({
                app,
                timers: timers.filter((timer) =>
                  matches(ctx().query, app, timer.name, timer.timer),
                ),
              }))
              .filter((group) => group.timers.length > 0)
              .toSorted((a, b) => a.app.localeCompare(b.app)),
          );
          return (
            <>
              <Show when={data().helper !== "ok"}>
                <p class="nsvx__notice" role="status">
                  {ctx().gt("liveOff")}
                </p>
              </Show>
              <Note note={action.note()} />
              <For each={apps()} keyed={(group) => group.app}>
                {(group) => (
                  <section class="nsvx-dev__card" aria-label={group().app}>
                    <strong class="nsvx-dev__card-title">{group().app}</strong>
                    <ul class="nsvx-list">
                      <For each={group().timers} keyed={(timer) => timer.timer}>
                        {(timer) => {
                          const state = () => STATUS[timer().status] ?? STATUS["never-run"]!;
                          return (
                            <li class="nsvx-row nsvx-grow__timer">
                              <Icon
                                name={state().icon}
                                class={["nsvx-row__icon", `nsvx-grow__tone--${state().tone}`]}
                              />
                              <span class="nsvx-row__main">
                                <span class="nsvx-row__title">{timer().name}</span>
                                <span class="nsvx-row__detail">
                                  <code>{timer().schedule}</code>
                                  {timer().next_run
                                    ? ` · ${ctx().gt("next")} ${new Date(timer().next_run!).toLocaleString(ctx().locale)}`
                                    : ""}
                                </span>
                              </span>
                              <span class="nsvx-row__age">{age(timer().last_run)}</span>
                              <button
                                type="button"
                                role="switch"
                                class="nsvx-ppl-switch"
                                aria-label={timer().name}
                                aria-checked={timer().enabled ? "true" : "false"}
                                disabled={
                                  timer().read_only ||
                                  action.busy() ||
                                  !ctx().host.connection.canWrite
                                }
                                onClick={() =>
                                  void action
                                    .run(
                                      () =>
                                        ctx().host.request("nsvx.grow.timer", {
                                          timer: timer().timer,
                                          on: !timer().enabled,
                                        }),
                                      ctx().gt("sent"),
                                    )
                                    .then((ok) => {
                                      if (ok) {
                                        void source.refresh();
                                      }
                                    })
                                }
                              >
                                <span>
                                  {timer().read_only ? ctx().gt("fixed") : ctx().gt(state().key)}
                                </span>
                                <span class="nsvx-ppl-switch__track" aria-hidden="true" />
                              </button>
                            </li>
                          );
                        }}
                      </For>
                    </ul>
                  </section>
                )}
              </For>
              <Show when={apps().length === 0}>
                <p class="nsvx__empty">{ctx().gt("noTimers")}</p>
              </Show>
            </>
          );
        }}
      </SourceView>
    </div>
  );
}
