/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import { daysTone, type Dashboard, type FleetTask } from "./fleet-data.js";
import { fleetTranslator, stateLabel, type FT } from "./fleet-i18n.js";
import { FleetAsk } from "./fleet-intel.js";
import { FleetMiles } from "./fleet-miles.js";
import { FleetMoney } from "./fleet-money.js";
import { FleetPlan } from "./fleet-ops.js";
import { FleetPortal, FleetTrips } from "./fleet-portal.js";
import { CarDetail, CarList, DriverDetail, DriverList } from "./fleet-roster.js";
import { AlertRow, TaskList } from "./fleet-rows.js";
import {
  Block,
  ChangeNote,
  Chip,
  createFleetChange,
  Empty,
  fleetView,
  Glyph,
  PlatformMark,
  Seg,
  Tile,
  type Ctx,
} from "./fleet-ui.js";
import { age, createSource, matches, SourceView, type T } from "./ui-kit.js";
import "./fleet.css";

const SECTIONS = [
  "home",
  "drivers",
  "cars",
  "plan",
  "money",
  "miles",
  "ask",
  "portal",
  "trips",
] as const;
type Section = (typeof SECTIONS)[number];
export type Open = { kind: "driver" | "car"; id: string } | undefined;
export type Go = (section: Section, open?: Open, filter?: string) => void;

function Home(props: { ctx: Ctx; go: Go }) {
  const ft = props.ctx.ft;
  const data = createSource(props.ctx.host, async () => {
    const [dashboard, tasks] = await Promise.all([
      fleetView<Dashboard>(props.ctx.host, "fleetDashboard"),
      fleetView<{ tasks: FleetTask[]; today: string }>(props.ctx.host, "fleetTasks", {
        status: "open",
      }),
    ]);
    return { dashboard, tasks: tasks.tasks };
  });
  void data.refresh();
  const change = createFleetChange(props.ctx, data.refresh);
  const [title, setTitle] = createSignal("");
  // One key per typed task: a lost answer repeats with the same key and NSVX keeps one task.
  let taskKey = crypto.randomUUID();
  const addTask = async () => {
    const value = title().trim();
    if (!value) {
      return;
    }
    const made = await change.run("task:new", { action: "createTask", title: value, key: taskKey });
    if (made) {
      setTitle("");
      taskKey = crypto.randomUUID();
    }
  };
  return (
    <SourceView source={data} t={props.ctx.t}>
      {(loaded) => {
        const d = () => loaded().dashboard;
        const unseen = () => d().alerts.items.filter((a) => !a.acknowledged_at);
        const docsBad = () => d().documents.expired + d().documents.missing;
        const alerts = () => d().alerts.items.filter((a) => matches(props.ctx.query, a.title));
        const tasks = () =>
          loaded().tasks.filter((task) =>
            matches(props.ctx.query, task.title, task.driver_name, task.plate),
          );
        return (
          <div class="nsvx-fleet-home">
            <div class="nsvx-fleet-tiles">
              <Tile
                icon="drivers"
                label={ft("drivers")}
                value={`${d().drivers.active}/${d().drivers.total}`}
                sub={
                  d().drivers.not_ready
                    ? `${d().drivers.not_ready} ${ft("notReady")}`
                    : ft("allGood")
                }
                tone={d().drivers.not_ready ? "bad" : d().drivers.issues ? "warn" : "ok"}
                onClick={() =>
                  props.go("drivers", undefined, d().drivers.issues ? "issues" : "all")
                }
              />
              <Tile
                icon="cars"
                label={ft("cars")}
                value={`${d().vehicles.assigned}/${d().vehicles.total}`}
                sub={`${d().vehicles.available} ${ft("free")}`}
                tone={d().vehicles.not_ready ? "bad" : d().vehicles.unavailable ? "warn" : "ok"}
                onClick={() =>
                  props.go("cars", undefined, d().vehicles.not_ready ? "issues" : "all")
                }
              />
              <Tile
                icon="docs"
                label={ft("docs")}
                value={docsBad() || d().documents.expiring}
                sub={
                  docsBad()
                    ? `${d().documents.expired} ${ft("expired")} · ${d().documents.missing} ${ft("missing")}`
                    : `${d().documents.expiring} ${ft("expiring")}`
                }
                tone={docsBad() ? "bad" : d().documents.expiring ? "warn" : "ok"}
                onClick={() => props.go("drivers", undefined, "issues")}
              />
              <Tile
                icon="tasks"
                label={ft("tasks")}
                value={d().tasks.open}
                sub={d().tasks.overdue ? `${d().tasks.overdue} ${ft("overdue")}` : ft("allGood")}
                tone={d().tasks.overdue ? "bad" : d().tasks.open ? "warn" : "ok"}
              />
            </div>

            <div class="nsvx-fleet-cols">
              <Block
                icon="alert"
                title={ft("alerts")}
                count={d().alerts.total}
                action={
                  <Show when={unseen().length > 1}>
                    <button
                      type="button"
                      class="nsvx__button"
                      disabled={Boolean(change.busy()) || !props.ctx.host.connection.canWrite}
                      onClick={() =>
                        void change.run("alerts", {
                          action: "ackAlerts",
                          alertIds: unseen().map((a) => a.id),
                        })
                      }
                    >
                      <Glyph name="check" />
                      <span>{ft("allSeen")}</span>
                    </button>
                  </Show>
                }
              >
                <ul class="nsvx-list">
                  <For each={alerts()} keyed={(a) => a.id}>
                    {(alert) => (
                      <AlertRow
                        alert={alert()}
                        ctx={props.ctx}
                        busy={change.busy() === `alert:${alert().id}`}
                        onSeen={() =>
                          void change.run(`alert:${alert().id}`, {
                            action: "ackAlert",
                            alertId: alert().id,
                          })
                        }
                        onOpen={() =>
                          alert().driver_id
                            ? props.go("drivers", { kind: "driver", id: alert().driver_id! })
                            : alert().vehicle_id
                              ? props.go("cars", { kind: "car", id: alert().vehicle_id! })
                              : undefined
                        }
                      />
                    )}
                  </For>
                </ul>
                <Show when={alerts().length === 0}>
                  <Empty icon="check" text={ft("allGood")} />
                </Show>
              </Block>

              <Block icon="tasks" title={ft("tasks")} count={loaded().tasks.length}>
                <form
                  class="nsvx-fleet-add"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void addTask();
                  }}
                >
                  <input
                    type="text"
                    maxlength={200}
                    placeholder={ft("newTask")}
                    aria-label={ft("newTask")}
                    value={title()}
                    onInput={(event) => setTitle(event.currentTarget.value)}
                  />
                  <button
                    type="submit"
                    class="nsvx__button nsvx__button--icon"
                    aria-label={ft("add")}
                    title={ft("add")}
                    disabled={
                      !title().trim() ||
                      Boolean(change.busy()) ||
                      !props.ctx.host.connection.canWrite
                    }
                  >
                    <Glyph name="plus" />
                  </button>
                </form>
                <TaskList ctx={props.ctx} tasks={tasks()} change={change} />
              </Block>
            </div>
            <ChangeNote change={change} />

            <div class="nsvx-fleet-cols">
              <Block icon="docs" title={ft("renewals")} count={d().renewals.length}>
                <ul class="nsvx-list">
                  <For
                    each={d().renewals.filter((r) => matches(props.ctx.query, r.entity, r.label))}
                    keyed={(r) => `${r.entity_id}:${r.label}`}
                  >
                    {(renewal) => (
                      <li>
                        <button
                          type="button"
                          class="nsvx-row nsvx-row--link"
                          onClick={() =>
                            renewal().subject === "driver"
                              ? props.go("drivers", { kind: "driver", id: renewal().entity_id })
                              : renewal().subject === "vehicle"
                                ? props.go("cars", { kind: "car", id: renewal().entity_id })
                                : undefined
                          }
                        >
                          <Glyph
                            name={
                              renewal().subject === "vehicle"
                                ? "cars"
                                : renewal().subject === "driver"
                                  ? "drivers"
                                  : "docs"
                            }
                            class="nsvx-row__icon"
                          />
                          <span class="nsvx-row__main">
                            <span class="nsvx-row__title">{renewal().entity}</span>
                            <span class="nsvx-row__detail">{renewal().label}</span>
                          </span>
                          <Chip tone={daysTone(renewal().days_left)}>
                            {renewal().days_left < 0
                              ? `${ft("late")} ${-renewal().days_left}d`
                              : `${renewal().days_left}d`}
                          </Chip>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
                <Show when={d().renewals.length === 0}>
                  <Empty icon="check" text={ft("allGood")} />
                </Show>
              </Block>
              <Platforms ctx={props.ctx} dashboard={d()} reload={data.refresh} />
            </div>

            <details class="nsvx-fleet-more">
              <summary>
                <Glyph name="history" />
                <span>{ft("history")}</span>
              </summary>
              <ul class="nsvx-timeline">
                <For each={d().activity} keyed={(e) => e.seq}>
                  {(event) => (
                    <li class="nsvx-row">
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">{event().summary}</span>
                      </span>
                      <span class="nsvx-row__age">{age(event().at)}</span>
                    </li>
                  )}
                </For>
              </ul>
            </details>
          </div>
        );
      }}
    </SourceView>
  );
}

function Platforms(props: { ctx: Ctx; dashboard: Dashboard; reload: () => Promise<void> }) {
  const ft = props.ctx.ft;
  const change = createFleetChange(props.ctx, props.reload);
  const integrations = createSource(props.ctx.host, () =>
    fleetView<{ integrations: Dashboard["integrations"]; drive_connected: boolean }>(
      props.ctx.host,
      "fleetIntegrations",
    ),
  );
  void integrations.refresh();
  const rows = createMemo(
    () => integrations.state().data?.integrations ?? props.dashboard.integrations,
  );
  const tone = (state: string) =>
    state === "connected" || state === "ok"
      ? "ok"
      : state === "error" || state === "failed"
        ? "bad"
        : state === "configuring"
          ? "run"
          : "off";
  return (
    <Block
      icon="link"
      title={ft("platforms")}
      action={
        <Show when={props.dashboard.trips.week}>
          <Chip tone="run">{props.dashboard.trips.week} · 7d</Chip>
        </Show>
      }
    >
      <ul class="nsvx-fleet-platforms">
        <For each={rows()} keyed={(i) => i.code}>
          {(integration) => (
            <li class="nsvx-fleet-platform">
              <PlatformMark code={integration().code} large />
              <span class="nsvx-row__main">
                <span class="nsvx-row__title">{integration().label}</span>
                <span class="nsvx-row__detail">
                  {integration().last_success_at
                    ? age(integration().last_success_at)
                    : ft("notConnected")}
                </span>
              </span>
              <Show
                when={integration().keys}
                fallback={
                  <Chip tone={tone(integration().state)}>
                    {integration().state === "not_connected"
                      ? ft("notConnected")
                      : integration().state === "connected"
                        ? ft("connected")
                        : stateLabel(ft, "st_", integration().state)}
                  </Chip>
                }
              >
                <button
                  type="button"
                  class="nsvx__button"
                  disabled={
                    integration().syncing ||
                    Boolean(change.busy()) ||
                    !props.ctx.host.connection.canWrite
                  }
                  onClick={() =>
                    void change
                      .run(`sync:${integration().code}`, {
                        action: "sync",
                        platform: integration().code,
                      })
                      .then(() => integrations.refresh())
                  }
                >
                  <Glyph name="sync" />
                  <span>{integration().syncing ? ft("syncing") : ft("sync")}</span>
                </button>
              </Show>
            </li>
          )}
        </For>
      </ul>
      <ChangeNote change={change} />
    </Block>
  );
}

export function FleetTab(props: { host: ControlUiHost; t: T; locale: string; query: string }) {
  const search = new URLSearchParams(location.search);
  const initial = search.get("fleet") as Section;
  const [section, setSection] = createSignal<Section>(
    SECTIONS.includes(initial) ? initial : "home",
  );
  const [open, setOpen] = createSignal<Open>(
    search.get("driver")
      ? { kind: "driver", id: search.get("driver")! }
      : search.get("car")
        ? { kind: "car", id: search.get("car")! }
        : undefined,
  );
  const [filter, setFilter] = createSignal(search.get("show") ?? "all");
  const ft = createMemo<FT>(() => fleetTranslator(props.locale));
  // Deep links: the address keeps the section and the open driver or car (values passed in, not read back).
  const remember = (next: Section, item: Open) => {
    const url = new URL(location.href);
    url.searchParams.set("fleet", next);
    url.searchParams.delete("driver");
    url.searchParams.delete("car");
    if (item) {
      url.searchParams.set(item.kind, item.id);
    }
    history.replaceState(history.state, "", url);
  };
  const go: Go = (next, item, show) => {
    setSection(next);
    setOpen(item);
    if (show) {
      setFilter(show);
    }
    remember(next, item);
  };
  const ctx = createMemo<Ctx>(() => ({
    host: props.host,
    t: props.t,
    ft: ft(),
    query: props.query,
  }));
  const ICON: Record<Section, Parameters<typeof Glyph>[0]["name"]> = {
    home: "home",
    drivers: "drivers",
    cars: "cars",
    plan: "plan",
    money: "money",
    miles: "miles",
    ask: "ask",
    portal: "portal",
    trips: "trips",
  };
  return (
    <div class="nsvx-fleet">
      <Seg
        name={ft()("fleet")}
        items={SECTIONS}
        value={section()}
        label={(key) => ft()(key)}
        icon={(key) => ICON[key]}
        onChange={(next) => go(next, undefined, "all")}
      />
      <For
        each={[`${section()}:${open()?.kind ?? ""}:${open()?.id ?? ""}:${filter()}`]}
        keyed={(key) => key}
      >
        {() => (
          <>
            <Show when={section() === "home"}>
              <Home ctx={ctx()} go={go} />
            </Show>
            <Show when={section() === "drivers"}>
              <Show
                when={open()?.kind === "driver" ? open()!.id : undefined}
                fallback={<DriverList ctx={ctx()} go={go} filter={filter()} onFilter={setFilter} />}
              >
                {(id) => <DriverDetail ctx={ctx()} id={id()} go={go} />}
              </Show>
            </Show>
            <Show when={section() === "cars"}>
              <Show
                when={open()?.kind === "car" ? open()!.id : undefined}
                fallback={<CarList ctx={ctx()} go={go} filter={filter()} onFilter={setFilter} />}
              >
                {(id) => <CarDetail ctx={ctx()} id={id()} go={go} />}
              </Show>
            </Show>
            <Show when={section() === "plan"}>
              <FleetPlan ctx={ctx()} />
            </Show>
            <Show when={section() === "money"}>
              <FleetMoney ctx={ctx()} />
            </Show>
            <Show when={section() === "miles"}>
              <FleetMiles ctx={ctx()} go={go} />
            </Show>
            <Show when={section() === "ask"}>
              <FleetAsk ctx={ctx()} go={go} />
            </Show>
            <Show when={section() === "portal"}>
              <FleetPortal ctx={ctx()} />
            </Show>
            <Show when={section() === "trips"}>
              <FleetTrips ctx={ctx()} />
            </Show>
          </>
        )}
      </For>
    </div>
  );
}
