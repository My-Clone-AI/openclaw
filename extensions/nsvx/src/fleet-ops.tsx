/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import { money, shortDate } from "./finance-data.js";
import {
  addDays,
  daysTone,
  stateTone,
  weekOf,
  type FleetCard,
  type Flow,
  type Handover,
  type Incident,
  type Service,
  type Shift,
  INCIDENT_STATES,
  SERVICE_STATES,
} from "./fleet-data.js";
import { stateLabel, type FT } from "./fleet-i18n.js";
import {
  ChangeNote,
  Chip,
  createFleetChange,
  Empty,
  fleetView,
  Glyph,
  Seg,
  type Ctx,
  type FleetChange,
  type GlyphName,
} from "./fleet-ui.js";
import { createSource, matches, SourceView } from "./ui-kit.js";

const PARTS = ["week", "service", "flows", "cases", "cardsTab", "handovers"] as const;
type Part = (typeof PARTS)[number];
const PART_ICON: Record<Part, GlyphName> = {
  week: "plan",
  service: "service",
  flows: "flows",
  cases: "cases",
  cardsTab: "card",
  handovers: "hand",
};
const SHIFT_STEPS = ["planned", "confirmed", "started", "done", "cancelled"] as const;

/** A status picker that saves on change; the list it offers is NSVX's own set for that record. */
function StatePick(props: {
  ft: FT;
  value: string;
  options: readonly string[];
  label: string;
  change: FleetChange;
  disabled: boolean;
  onPick: (next: string) => void;
}) {
  return (
    <select
      class={["nsvx-fleet-state", `nsvx-fleet-state--${stateTone(props.value)}`]}
      aria-label={props.label}
      disabled={props.disabled || Boolean(props.change.busy())}
      onChange={(event) => props.onPick(event.currentTarget.value)}
    >
      <For each={props.options} keyed={false}>
        {(option) => (
          <option value={option()} selected={option() === props.value}>
            {stateLabel(props.ft, "st_", option())}
          </option>
        )}
      </For>
    </select>
  );
}

const time = (iso: string, locale: string) =>
  new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

function Week(props: { ctx: Ctx }) {
  const ft = props.ctx.ft;
  const [anchor, setAnchor] = createSignal(weekOf(new Date()).start);
  return (
    <>
      <div class="nsvx-fleet-weekbar">
        <button
          type="button"
          class="nsvx__button nsvx__button--icon"
          aria-label={ft("prev")}
          title={ft("prev")}
          onClick={() => setAnchor(addDays(anchor(), -7))}
        >
          <Glyph name="back" />
        </button>
        <strong>
          {shortDate(anchor(), props.ctx.host.locale)} –{" "}
          {shortDate(addDays(anchor(), 6), props.ctx.host.locale)}
        </strong>
        <button
          type="button"
          class="nsvx__button nsvx__button--icon"
          aria-label={ft("next")}
          title={ft("next")}
          onClick={() => setAnchor(addDays(anchor(), 7))}
        >
          <Glyph name="next" />
        </button>
      </div>
      {/* One view per week, so its read always carries that week's dates. */}
      <For each={[anchor()]} keyed={(key) => key}>
        {(start) => <WeekDays ctx={props.ctx} start={start()} />}
      </For>
    </>
  );
}

function WeekDays(props: { ctx: Ctx; start: string }) {
  const ft = props.ctx.ft;
  const week = weekOf(new Date(`${props.start}T12:00:00`));
  const shifts = createSource(props.ctx.host, () =>
    fleetView<{ shifts: Shift[] }>(props.ctx.host, "fleetShifts", {
      start: week.start,
      end: week.end,
    }),
  );
  void shifts.refresh();
  const change = createFleetChange(props.ctx, shifts.refresh);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <SourceView source={shifts} t={props.ctx.t}>
        {(data) => (
          <div class="nsvx-fleet-week">
            <For each={week.days} keyed={false}>
              {(day) => {
                const items = () =>
                  data().shifts.filter(
                    (s) =>
                      s.starts_at.slice(0, 10) <= day() &&
                      s.ends_at.slice(0, 10) >= day() &&
                      matches(props.ctx.query, s.driver_name, s.vehicle_label, s.notes),
                  );
                return (
                  <section class={["nsvx-fleet-day", { "nsvx-fleet-day--today": day() === today }]}>
                    <h4>
                      {new Date(`${day()}T12:00:00`).toLocaleDateString(props.ctx.host.locale, {
                        weekday: "short",
                        day: "numeric",
                      })}
                    </h4>
                    <For each={items()} keyed={(s) => s.id}>
                      {(shift) => (
                        <article class={["nsvx-fleet-shift", `nsvx-fleet-shift--${shift().kind}`]}>
                          <span class="nsvx-fleet-shift__time">
                            {time(shift().starts_at, props.ctx.host.locale)}–
                            {time(shift().ends_at, props.ctx.host.locale)}
                          </span>
                          <span class="nsvx-row__title">{shift().driver_name ?? "—"}</span>
                          <Show when={shift().vehicle_label}>
                            <span class="nsvx-fleet-mini-plate">{shift().vehicle_label}</span>
                          </Show>
                          <StatePick
                            ft={ft}
                            value={shift().status}
                            options={
                              SHIFT_STEPS.includes(shift().status as never)
                                ? SHIFT_STEPS
                                : [shift().status, ...SHIFT_STEPS]
                            }
                            label={ft("plan")}
                            change={change}
                            disabled={!props.ctx.host.connection.canWrite}
                            onPick={(status) =>
                              void change.run(`shift:${shift().id}`, {
                                action: "shift",
                                shiftId: shift().id,
                                status,
                              })
                            }
                          />
                        </article>
                      )}
                    </For>
                  </section>
                );
              }}
            </For>
          </div>
        )}
      </SourceView>
      <ChangeNote change={change} />
    </>
  );
}

function ServiceList(props: { ctx: Ctx }) {
  const ft = props.ctx.ft;
  const list = createSource(props.ctx.host, () =>
    fleetView<{ maintenance: Service[] }>(props.ctx.host, "fleetMaintenance", { status: "open" }),
  );
  void list.refresh();
  const change = createFleetChange(props.ctx, list.refresh);
  return (
    <SourceView source={list} t={props.ctx.t}>
      {(data) => {
        const rows = () =>
          data().maintenance.filter((m) =>
            matches(props.ctx.query, m.title, m.vehicle_label, m.workshop),
          );
        return (
          <>
            <ul class="nsvx-list">
              <For each={rows()} keyed={(m) => m.id}>
                {(m) => (
                  <li class="nsvx-row nsvx-fleet-row">
                    <Glyph name="service" class="nsvx-row__icon" />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{m().title}</span>
                      <span class="nsvx-row__detail">
                        {[
                          m().vehicle_label,
                          shortDate(m().scheduled_on ?? m().reported_on, props.ctx.host.locale),
                          m().workshop,
                          m().cost ? money(m().cost, "EUR", props.ctx.host.locale) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <StatePick
                      ft={ft}
                      value={m().status}
                      options={SERVICE_STATES}
                      label={ft("service")}
                      change={change}
                      disabled={!props.ctx.host.connection.canWrite}
                      onPick={(status) =>
                        void change.run(`service:${m().id}`, {
                          action: "maintenance",
                          maintenanceId: m().id,
                          status,
                        })
                      }
                    />
                  </li>
                )}
              </For>
            </ul>
            <Show when={rows().length === 0}>
              <Empty icon="service" text={ft("allGood")} />
            </Show>
            <ChangeNote change={change} />
          </>
        );
      }}
    </SourceView>
  );
}

function Flows(props: { ctx: Ctx }) {
  const ft = props.ctx.ft;
  const list = createSource(props.ctx.host, () =>
    fleetView<{ workflows: Flow[] }>(props.ctx.host, "fleetWorkflows", { status: "open" }),
  );
  void list.refresh();
  const change = createFleetChange(props.ctx, list.refresh);
  return (
    <SourceView source={list} t={props.ctx.t}>
      {(data) => {
        const rows = () =>
          data().workflows.filter((w) => matches(props.ctx.query, w.title, w.entity, w.template));
        return (
          <>
            <ul class="nsvx-fleet-flows">
              <For each={rows()} keyed={(w) => w.id}>
                {(flow) => (
                  <li class="nsvx-fleet-flow">
                    <header class="nsvx-fleet-flow__head">
                      <Glyph name="flows" />
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">{flow().title}</span>
                        <span class="nsvx-row__detail">{flow().entity}</span>
                      </span>
                      <Show when={flow().stalled}>
                        <Chip tone="bad">{ft("late")}</Chip>
                      </Show>
                      <strong class="nsvx-fleet-flow__pct">{flow().progress}%</strong>
                    </header>
                    <div class="nsvx-fleet-meter" aria-hidden="true">
                      <span
                        class="nsvx-fleet-meter__fill"
                        style={{ width: `${flow().progress}%` }}
                      />
                    </div>
                    <ol class="nsvx-fleet-stages">
                      <For each={flow().stages} keyed={(s) => s.key}>
                        {(stage) => {
                          const done = () => stage().status !== "pending";
                          return (
                            <li>
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={done() ? "true" : "false"}
                                class={["nsvx-fleet-stage", { "nsvx-fleet-stage--done": done() }]}
                                disabled={
                                  stage().auto ||
                                  Boolean(change.busy()) ||
                                  !props.ctx.host.connection.canWrite
                                }
                                onClick={() =>
                                  void change.run(`step:${flow().id}:${stage().key}`, {
                                    action: "step",
                                    workflowId: flow().id,
                                    stepKey: stage().key,
                                    status: done() ? "pending" : "done",
                                  })
                                }
                              >
                                <span class="nsvx-fleet-check" aria-hidden="true">
                                  <Show when={done()}>
                                    <Glyph name="check" />
                                  </Show>
                                </span>
                                <span>{stage().label}</span>
                              </button>
                            </li>
                          );
                        }}
                      </For>
                    </ol>
                    <Show when={flow().blocking?.reasons.length}>
                      <p class="nsvx-row__detail nsvx-row__detail--bad">
                        {flow().blocking!.reasons.join(" · ")}
                      </p>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
            <Show when={rows().length === 0}>
              <Empty icon="flows" text={ft("allGood")} />
            </Show>
            <ChangeNote change={change} />
          </>
        );
      }}
    </SourceView>
  );
}

function Cases(props: { ctx: Ctx }) {
  const ft = props.ctx.ft;
  const list = createSource(props.ctx.host, () =>
    fleetView<{ incidents: Incident[] }>(props.ctx.host, "fleetIncidents", { status: "open" }),
  );
  void list.refresh();
  const change = createFleetChange(props.ctx, list.refresh);
  return (
    <SourceView source={list} t={props.ctx.t}>
      {(data) => {
        const rows = () =>
          data().incidents.filter((i) => matches(props.ctx.query, i.title, i.driver_name, i.plate));
        return (
          <>
            <ul class="nsvx-list">
              <For each={rows()} keyed={(i) => i.id}>
                {(item) => (
                  <li class="nsvx-row nsvx-fleet-row">
                    <Glyph name="cases" class="nsvx-row__icon" />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{item().title}</span>
                      <span class="nsvx-row__detail">
                        {[
                          item().driver_name,
                          item().plate,
                          shortDate(item().occurred_at, props.ctx.host.locale),
                          item().cost ? money(item().cost, "EUR", props.ctx.host.locale) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <StatePick
                      ft={ft}
                      value={item().status}
                      options={INCIDENT_STATES}
                      label={ft("cases")}
                      change={change}
                      disabled={!props.ctx.host.connection.canWrite}
                      onPick={(status) =>
                        void change.run(`case:${item().id}`, {
                          action: "incident",
                          incidentId: item().id,
                          status,
                        })
                      }
                    />
                  </li>
                )}
              </For>
            </ul>
            <Show when={rows().length === 0}>
              <Empty icon="cases" text={ft("allGood")} />
            </Show>
            <ChangeNote change={change} />
          </>
        );
      }}
    </SourceView>
  );
}

function Cards(props: { ctx: Ctx }) {
  const ft = props.ctx.ft;
  const list = createSource(props.ctx.host, () =>
    fleetView<{ cards: FleetCard[]; summary: Record<string, number> }>(
      props.ctx.host,
      "fleetCards",
    ),
  );
  void list.refresh();
  return (
    <SourceView source={list} t={props.ctx.t}>
      {(data) => {
        const rows = () =>
          data().cards.filter((c) => matches(props.ctx.query, c.label, c.kind, c.issuer, c.holder));
        return (
          <>
            <div class="nsvx-fleet-chips">
              <For each={Object.entries(data().summary)} keyed={([key]) => key}>
                {(entry) => (
                  <Chip tone={stateTone(entry()[0])}>
                    {stateLabel(ft, "st_", entry()[0])} {entry()[1]}
                  </Chip>
                )}
              </For>
            </div>
            <ul class="nsvx-list">
              <For each={rows()} keyed={(c) => c.id}>
                {(card) => (
                  <li class="nsvx-row">
                    <Glyph name="card" class="nsvx-row__icon" />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{card().label ?? card().kind}</span>
                      <span class="nsvx-row__detail">
                        {[card().holder, card().issuer, card().reference]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <Show
                      when={card().expires_on}
                      fallback={
                        <Chip tone={stateTone(card().display_status)}>
                          {stateLabel(ft, "st_", card().display_status)}
                        </Chip>
                      }
                    >
                      <Chip tone={daysTone(card().days_left)}>
                        {shortDate(card().expires_on, props.ctx.host.locale)}
                      </Chip>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
            <Show when={rows().length === 0}>
              <Empty icon="card" text={ft("noneYet")} />
            </Show>
          </>
        );
      }}
    </SourceView>
  );
}

function Handovers(props: { ctx: Ctx }) {
  const ft = props.ctx.ft;
  const list = createSource(props.ctx.host, () =>
    fleetView<{ handovers: Handover[] }>(props.ctx.host, "fleetHandovers"),
  );
  void list.refresh();
  return (
    <SourceView source={list} t={props.ctx.t}>
      {(data) => {
        const rows = () =>
          data().handovers.filter((h) => matches(props.ctx.query, h.vehicle_label, h.driver_name));
        return (
          <>
            <ul class="nsvx-list">
              <For each={rows()} keyed={(h) => h.id}>
                {(h) => (
                  <li class="nsvx-row">
                    <span
                      class={["nsvx-fleet-dir", `nsvx-fleet-dir--${h().kind}`]}
                      aria-hidden="true"
                    >
                      <Glyph name={h().kind === "delivery" ? "next" : "back"} />
                    </span>
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">
                        {h().vehicle_label} · {h().driver_name ?? "—"}
                      </span>
                      <span class="nsvx-row__detail">
                        {[
                          shortDate(h().at, props.ctx.host.locale),
                          h().mileage_km !== null
                            ? `${h().mileage_km!.toLocaleString(props.ctx.host.locale)} km`
                            : null,
                          h().energy_pct !== null ? `${h().energy_pct}%` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <Show when={h().damage}>
                      <Chip tone="bad">{h().damage}</Chip>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
            <Show when={rows().length === 0}>
              <Empty icon="hand" text={ft("noneYet")} />
            </Show>
          </>
        );
      }}
    </SourceView>
  );
}

export function FleetPlan(props: { ctx: Ctx }) {
  const ft = props.ctx.ft;
  const [part, setPart] = createSignal<Part>("week");
  return (
    <div class="nsvx-fleet-roster">
      <Seg
        compact
        name={ft("plan")}
        items={PARTS}
        value={part()}
        label={(key) => ft(key)}
        icon={(key) => PART_ICON[key]}
        onChange={setPart}
      />
      <For each={[part()]} keyed={(key) => key}>
        {() => (
          <>
            <Show when={part() === "week"}>
              <Week ctx={props.ctx} />
            </Show>
            <Show when={part() === "service"}>
              <ServiceList ctx={props.ctx} />
            </Show>
            <Show when={part() === "flows"}>
              <Flows ctx={props.ctx} />
            </Show>
            <Show when={part() === "cases"}>
              <Cases ctx={props.ctx} />
            </Show>
            <Show when={part() === "cardsTab"}>
              <Cards ctx={props.ctx} />
            </Show>
            <Show when={part() === "handovers"}>
              <Handovers ctx={props.ctx} />
            </Show>
          </>
        )}
      </For>
    </div>
  );
}
