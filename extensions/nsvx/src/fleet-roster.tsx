/** @jsxImportSource @solidjs/web */
import { For, Show } from "solid-js";
import { money, shortDate } from "./finance-data.js";
import {
  cellTone,
  COMPLIANCE_TONE,
  initials,
  stateTone,
  type Cell,
  type Driver,
  type DriverDetail as DriverRecord,
  type FleetEvent,
  type Service,
  type Vehicle,
  type VehicleDetail,
} from "./fleet-data.js";
import { stateLabel } from "./fleet-i18n.js";
import { VehicleMileage } from "./fleet-miles.js";
import { AlertRow, TaskList } from "./fleet-rows.js";
import type { Go } from "./fleet-tab.js";
import {
  Block,
  ChangeNote,
  Chip,
  createFleetChange,
  Dot,
  Empty,
  fleetView,
  Glyph,
  Plate,
  PlatformMark,
  Ring,
  Seg,
  type Ctx,
} from "./fleet-ui.js";
import { age, createSource, matches, SourceView } from "./ui-kit.js";

const FILTERS = ["all", "issues", "not_ready", "onboarding"] as const;
type Filter = (typeof FILTERS)[number];
const CAR_FILTERS = ["all", "issues", "not_ready", "maintenance"] as const;
type CarFilter = (typeof CAR_FILTERS)[number];

function pick<K extends string>(value: string, allowed: readonly K[]): K {
  return allowed.includes(value as K) ? (value as K) : allowed[0]!;
}

function filterParams(filter: string): Record<string, string> {
  if (filter === "issues" || filter === "not_ready") {
    return { compliance: filter };
  }
  return filter === "all" ? {} : { status: filter };
}

function Back(props: { ctx: Ctx; onBack: () => void }) {
  return (
    <button type="button" class="nsvx__button nsvx-fleet-back" onClick={() => props.onBack()}>
      <Glyph name="back" />
      <span>{props.ctx.ft("back")}</span>
    </button>
  );
}

export function DriverList(props: {
  ctx: Ctx;
  go: Go;
  filter: string;
  onFilter: (f: string) => void;
}) {
  const ft = props.ctx.ft;
  const filter = () => pick(props.filter, FILTERS);
  const list = createSource(props.ctx.host, () =>
    fleetView<{ drivers: Driver[] }>(props.ctx.host, "fleetDrivers", filterParams(filter())),
  );
  void list.refresh();
  const label = (key: Filter) =>
    key === "not_ready" ? ft("notReady") : key === "onboarding" ? ft("onboarding") : ft(key);
  return (
    <div class="nsvx-fleet-roster">
      <Seg
        compact
        name={ft("drivers")}
        items={FILTERS}
        value={filter()}
        label={label}
        onChange={(next) => {
          props.onFilter(next);
          props.go("drivers", undefined, next);
        }}
      />
      <SourceView source={list} t={props.ctx.t}>
        {(data) => {
          const rows = () =>
            data().drivers.filter((d) =>
              matches(
                props.ctx.query,
                d.full_name,
                d.code,
                d.phone,
                d.email,
                d.uber_ref,
                d.bolt_ref,
              ),
            );
          return (
            <>
              <ul class="nsvx-fleet-cards">
                <For each={rows()} keyed={(d) => d.id}>
                  {(driver) => (
                    <li>
                      <button
                        type="button"
                        class="nsvx-fleet-card"
                        onClick={() => props.go("drivers", { kind: "driver", id: driver().id })}
                      >
                        <span class="nsvx-avatar" aria-hidden="true">
                          <span class="nsvx-avatar__initial">{initials(driver().full_name)}</span>
                        </span>
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">{driver().full_name}</span>
                          <span class="nsvx-fleet-card__meta">
                            <span>{driver().code}</span>
                            <For each={driver().vehicles} keyed={(v) => v.id}>
                              {(v) => <span class="nsvx-fleet-mini-plate">{v().label}</span>}
                            </For>
                          </span>
                        </span>
                        <span class="nsvx-fleet-card__marks">
                          <span class={{ "nsvx-fleet-dim": !driver().uber_ref }}>
                            <PlatformMark code="uber" />
                          </span>
                          <span class={{ "nsvx-fleet-dim": !driver().bolt_ref }}>
                            <PlatformMark code="bolt" />
                          </span>
                        </span>
                        <Chip tone={driver().status === "active" ? "ok" : "warn"}>
                          {stateLabel(ft, "status_", driver().status)}
                        </Chip>
                        <Ring
                          score={driver().compliance.score}
                          tone={COMPLIANCE_TONE[driver().compliance.overall]}
                          label={`${ft("docs")} ${driver().compliance.ok}/${driver().compliance.required}`}
                        />
                      </button>
                    </li>
                  )}
                </For>
              </ul>
              <Show when={rows().length === 0}>
                <Empty icon="drivers" text={props.ctx.query ? ft("noResults") : ft("noneYet")} />
              </Show>
            </>
          );
        }}
      </SourceView>
    </div>
  );
}

function Cells(props: { ctx: Ctx; cells: Cell[] }) {
  return (
    <ul class="nsvx-fleet-cells">
      <For each={props.cells.filter((c) => c.status !== "none")} keyed={(c) => c.type}>
        {(cell) => (
          <li class={["nsvx-fleet-cell", `nsvx-fleet-cell--${cellTone(cell().status)}`]}>
            <span class="nsvx-fleet-cell__label">
              {cell().label}
              {cell().required ? "" : " ·"}
            </span>
            <span class="nsvx-fleet-cell__state">
              <Dot tone={cellTone(cell().status)} />
              <span>
                {cell().expires_on
                  ? shortDate(cell().expires_on, props.ctx.host.locale)
                  : stateLabel(props.ctx.ft, "st_", cell().status)}
              </span>
            </span>
          </li>
        )}
      </For>
    </ul>
  );
}

function Events(props: { events: FleetEvent[]; ctx: Ctx }) {
  return (
    <details class="nsvx-fleet-more">
      <summary>
        <Glyph name="history" />
        <span>{props.ctx.ft("history")}</span>
      </summary>
      <ul class="nsvx-timeline">
        <For each={props.events} keyed={(e) => e.seq}>
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
  );
}

export function DriverDetail(props: { ctx: Ctx; id: string; go: Go }) {
  const ft = props.ctx.ft;
  const record = createSource(props.ctx.host, () =>
    fleetView<DriverRecord>(props.ctx.host, "fleetDriver", { id: props.id }),
  );
  void record.refresh();
  const change = createFleetChange(props.ctx, record.refresh);
  return (
    <div class="nsvx-fleet-detail">
      <Back ctx={props.ctx} onBack={() => props.go("drivers")} />
      <SourceView source={record} t={props.ctx.t}>
        {(d) => (
          <>
            <header class="nsvx-fleet-hero">
              <span class="nsvx-avatar nsvx-fleet-hero__avatar" aria-hidden="true">
                <span class="nsvx-avatar__initial">{initials(d().full_name)}</span>
              </span>
              <span class="nsvx-row__main">
                <h2 class="nsvx-fleet-hero__title">{d().full_name}</h2>
                <span class="nsvx-fleet-card__meta">
                  <span>{d().code}</span>
                  <Show when={d().company_name}>
                    <span>{d().company_name}</span>
                  </Show>
                  <Chip tone={d().status === "active" ? "ok" : "warn"}>
                    {stateLabel(ft, "status_", d().status)}
                  </Chip>
                </span>
              </span>
              <Show when={d().compliance}>
                <Ring
                  score={d().compliance.score}
                  tone={COMPLIANCE_TONE[d().compliance.overall]}
                  label={`${ft("docs")} ${d().compliance.ok}/${d().compliance.required}`}
                />
              </Show>
            </header>
            <div class="nsvx-fleet-cols">
              <Block icon="docs" title={ft("docs")}>
                <Cells ctx={props.ctx} cells={d().cells} />
              </Block>
              <div class="nsvx-fleet-stack">
                <Block icon="cars" title={ft("cars")} count={d().vehicles.length}>
                  <ul class="nsvx-list">
                    <For each={d().vehicles} keyed={(v) => v.id}>
                      {(v) => (
                        <li>
                          <button
                            type="button"
                            class="nsvx-row nsvx-row--link"
                            onClick={() => props.go("cars", { kind: "car", id: v().id })}
                          >
                            <Glyph name="cars" class="nsvx-row__icon" />
                            <span class="nsvx-row__main">
                              <span class="nsvx-row__title">{v().label}</span>
                              <Show when={v().shift}>
                                <span class="nsvx-row__detail">{v().shift}</span>
                              </Show>
                            </span>
                            <Glyph name="next" />
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                  <Show when={d().vehicles.length === 0}>
                    <Empty icon="cars" text={ft("noneYet")} />
                  </Show>
                </Block>
                <Block icon="link" title={ft("platforms")}>
                  <ul class="nsvx-fleet-platforms">
                    <For each={d().platforms} keyed={(p) => p.platform}>
                      {(p) => (
                        <li class="nsvx-fleet-platform">
                          <PlatformMark code={p().platform} large />
                          <span class="nsvx-row__main">
                            <span class="nsvx-row__title">{p().trips_30d} · 30d</span>
                            <span class="nsvx-row__detail">
                              {money(p().net_30d, "EUR", props.ctx.host.locale)}
                            </span>
                          </span>
                          <Show when={p().status}>
                            <Chip tone={stateTone(p().status!)}>{p().status}</Chip>
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                  <Show when={d().platforms.length === 0}>
                    <Empty icon="link" text={ft("notConnected")} />
                  </Show>
                </Block>
              </div>
            </div>
            <div class="nsvx-fleet-cols">
              <Block icon="alert" title={ft("alerts")} count={d().alerts.length}>
                <ul class="nsvx-list">
                  <For each={d().alerts} keyed={(a) => a.id}>
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
                      />
                    )}
                  </For>
                </ul>
                <Show when={d().alerts.length === 0}>
                  <Empty icon="check" text={ft("allGood")} />
                </Show>
              </Block>
              <Block
                icon="tasks"
                title={ft("tasks")}
                count={d().tasks.filter((x) => x.status === "open").length}
              >
                <TaskList ctx={props.ctx} tasks={d().tasks.slice(0, 20)} change={change} />
              </Block>
            </div>
            <ChangeNote change={change} />
            <Events events={d().events} ctx={props.ctx} />
          </>
        )}
      </SourceView>
    </div>
  );
}

export function CarList(props: {
  ctx: Ctx;
  go: Go;
  filter: string;
  onFilter: (f: string) => void;
}) {
  const ft = props.ctx.ft;
  const filter = () => pick(props.filter, CAR_FILTERS);
  const list = createSource(props.ctx.host, () =>
    fleetView<{ vehicles: Vehicle[] }>(props.ctx.host, "fleetVehicles", filterParams(filter())),
  );
  void list.refresh();
  const label = (key: CarFilter) =>
    key === "not_ready" ? ft("notReady") : key === "maintenance" ? ft("service") : ft(key);
  return (
    <div class="nsvx-fleet-roster">
      <Seg
        compact
        name={ft("cars")}
        items={CAR_FILTERS}
        value={filter()}
        label={label}
        onChange={(next) => {
          props.onFilter(next);
          props.go("cars", undefined, next);
        }}
      />
      <SourceView source={list} t={props.ctx.t}>
        {(data) => {
          const rows = () =>
            data().vehicles.filter((v) =>
              matches(props.ctx.query, v.label, v.plate, v.brand, v.model, v.fleet_no),
            );
          return (
            <>
              <ul class="nsvx-fleet-cards">
                <For each={rows()} keyed={(v) => v.id}>
                  {(car) => (
                    <li>
                      <button
                        type="button"
                        class="nsvx-fleet-card"
                        onClick={() => props.go("cars", { kind: "car", id: car().id })}
                      >
                        <Plate plate={car().plate} fleetNo={car().fleet_no} />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">
                            {[car().brand, car().model].filter(Boolean).join(" ") || car().label}
                          </span>
                          <span class="nsvx-fleet-card__meta">
                            <Show when={car().mileage_km !== null}>
                              <span>
                                {car().mileage_km!.toLocaleString(props.ctx.host.locale)} km
                              </span>
                            </Show>
                            <For each={car().drivers} keyed={(d) => d.id}>
                              {(d) => <span>{d().name}</span>}
                            </For>
                          </span>
                        </span>
                        <Chip
                          tone={
                            car().status === "available" || car().status === "assigned"
                              ? "ok"
                              : "warn"
                          }
                        >
                          {stateLabel(ft, "status_", car().status)}
                        </Chip>
                        <Ring
                          score={car().compliance.score}
                          tone={COMPLIANCE_TONE[car().compliance.overall]}
                          label={`${ft("docs")} ${car().compliance.ok}/${car().compliance.required}`}
                        />
                      </button>
                    </li>
                  )}
                </For>
              </ul>
              <Show when={rows().length === 0}>
                <Empty icon="cars" text={props.ctx.query ? ft("noResults") : ft("noneYet")} />
              </Show>
            </>
          );
        }}
      </SourceView>
    </div>
  );
}

export function CarDetail(props: { ctx: Ctx; id: string; go: Go }) {
  const ft = props.ctx.ft;
  const record = createSource(props.ctx.host, async () => {
    const [car, service] = await Promise.all([
      fleetView<VehicleDetail>(props.ctx.host, "fleetVehicle", { id: props.id }),
      fleetView<{ maintenance: Service[] }>(props.ctx.host, "fleetMaintenance", {
        status: "all",
        vehicle_id: props.id,
      }),
    ]);
    return { car, service: service.maintenance };
  });
  void record.refresh();
  const change = createFleetChange(props.ctx, record.refresh);
  return (
    <div class="nsvx-fleet-detail">
      <Back ctx={props.ctx} onBack={() => props.go("cars")} />
      <SourceView source={record} t={props.ctx.t}>
        {(data) => {
          const v = () => data().car;
          return (
            <>
              <header class="nsvx-fleet-hero">
                <Plate plate={v().plate} fleetNo={v().fleet_no} />
                <span class="nsvx-row__main">
                  <h2 class="nsvx-fleet-hero__title">
                    {[v().brand, v().model, v().year].filter(Boolean).join(" ") || v().label}
                  </h2>
                  <span class="nsvx-fleet-card__meta">
                    <Show when={v().mileage_km !== null}>
                      <span>{v().mileage_km!.toLocaleString(props.ctx.host.locale)} km</span>
                    </Show>
                    <Chip
                      tone={v().status === "available" || v().status === "assigned" ? "ok" : "warn"}
                    >
                      {stateLabel(ft, "status_", v().status)}
                    </Chip>
                    <span
                      class={{ "nsvx-fleet-dim": v().uber_status !== "active" }}
                      title={`Uber: ${v().uber_status}`}
                    >
                      <PlatformMark code="uber" />
                    </span>
                    <span
                      class={{ "nsvx-fleet-dim": v().bolt_status !== "active" }}
                      title={`Bolt: ${v().bolt_status}`}
                    >
                      <PlatformMark code="bolt" />
                    </span>
                  </span>
                </span>
                <Show when={v().compliance}>
                  <Ring
                    score={v().compliance.score}
                    tone={COMPLIANCE_TONE[v().compliance.overall]}
                    label={`${ft("docs")} ${v().compliance.ok}/${v().compliance.required}`}
                  />
                </Show>
              </header>
              <div class="nsvx-fleet-cols">
                <Block icon="docs" title={ft("docs")}>
                  <Cells ctx={props.ctx} cells={v().cells} />
                </Block>
                <div class="nsvx-fleet-stack">
                  <Block icon="drivers" title={ft("drivers")} count={v().drivers.length}>
                    <ul class="nsvx-list">
                      <For each={v().drivers} keyed={(d) => d.id}>
                        {(d) => (
                          <li>
                            <button
                              type="button"
                              class="nsvx-row nsvx-row--link"
                              onClick={() => props.go("drivers", { kind: "driver", id: d().id })}
                            >
                              <span class="nsvx-avatar" aria-hidden="true">
                                <span class="nsvx-avatar__initial">{initials(d().name)}</span>
                              </span>
                              <span class="nsvx-row__main">
                                <span class="nsvx-row__title">{d().name}</span>
                                <Show when={d().shift}>
                                  <span class="nsvx-row__detail">{d().shift}</span>
                                </Show>
                              </span>
                              <Glyph name="next" />
                            </button>
                          </li>
                        )}
                      </For>
                    </ul>
                    <Show when={v().drivers.length === 0}>
                      <Empty icon="drivers" text={ft("free")} />
                    </Show>
                  </Block>
                  <Block icon="service" title={ft("service")} count={data().service.length}>
                    <ul class="nsvx-list">
                      <For each={data().service.slice(0, 8)} keyed={(m) => m.id}>
                        {(m) => (
                          <li class="nsvx-row">
                            <Glyph name="service" class="nsvx-row__icon" />
                            <span class="nsvx-row__main">
                              <span class="nsvx-row__title">{m().title}</span>
                              <span class="nsvx-row__detail">
                                {[
                                  shortDate(
                                    m().done_on ?? m().scheduled_on ?? m().reported_on,
                                    props.ctx.host.locale,
                                  ),
                                  m().workshop,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </span>
                            <Chip tone={stateTone(m().status)}>
                              {stateLabel(ft, "st_", m().status)}
                            </Chip>
                          </li>
                        )}
                      </For>
                    </ul>
                    <Show when={data().service.length === 0}>
                      <Empty icon="service" text={ft("noneYet")} />
                    </Show>
                  </Block>
                </div>
              </div>
              <VehicleMileage ctx={props.ctx} vehicleId={props.id} />
              <div class="nsvx-fleet-cols">
                <Block icon="alert" title={ft("alerts")} count={v().alerts.length}>
                  <ul class="nsvx-list">
                    <For each={v().alerts} keyed={(a) => a.id}>
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
                        />
                      )}
                    </For>
                  </ul>
                  <Show when={v().alerts.length === 0}>
                    <Empty icon="check" text={ft("allGood")} />
                  </Show>
                </Block>
                <Block
                  icon="tasks"
                  title={ft("tasks")}
                  count={v().tasks.filter((x) => x.status === "open").length}
                >
                  <TaskList ctx={props.ctx} tasks={v().tasks.slice(0, 20)} change={change} />
                </Block>
              </div>
              <ChangeNote change={change} />
              <Events events={v().events} ctx={props.ctx} />
            </>
          );
        }}
      </SourceView>
    </div>
  );
}
