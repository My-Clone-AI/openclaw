/** @jsxImportSource @solidjs/web */
import { createSignal, For, Show } from "solid-js";
import {
  euro,
  houseTone,
  ISSUE_PRIORITIES,
  severityTone,
  stepsFor,
  taskActionsFor,
  type InventoryItem,
  type Issue,
  type Reservation,
  type StayEvent,
  type StayOverview,
  type StayTask,
  type TaskAction,
} from "./homes-data.js";
import type { HK } from "./homes-i18n.js";
import {
  Act,
  Chip,
  day,
  Empty,
  Glyph,
  Section,
  Segments,
  StayMark,
  Tile,
  Tiles,
  view,
  type Ctx,
  type GlyphName,
} from "./homes-ui.js";
import { createSource, matches, SourceView } from "./ui-kit.js";

const PARTS = ["today", "bookings", "cleaning", "fixes", "stock"] as const;
type Part = (typeof PARTS)[number];
const PART_ICON: Record<Part, GlyphName> = {
  today: "calendar",
  bookings: "door",
  cleaning: "broom",
  fixes: "wrench",
  stock: "box",
};
const EVENT_ICON: Record<StayEvent["kind"], GlyphName> = {
  arrival: "door",
  departure: "out",
  cleaning: "broom",
  maintenance: "wrench",
  deadline: "flag",
};
const ACTION_ICON: Record<TaskAction, GlyphName> = {
  confirm: "check",
  start: "play",
  complete: "check",
  problem: "flag",
  inspect: "eye",
  reopen: "undo",
};

/** Alojamento Local: houses today, bookings, cleaning, fixes, and stock. Every change stays inside NSVX's AL app. */
export function Stays(props: { ctx: Ctx }) {
  const h = () => props.ctx.h;
  const [part, setPart] = createSignal<Part>("today");
  return (
    <div class="nsvx-homes__stack">
      <Segments
        name={h()("stays")}
        items={PARTS}
        value={part()}
        label={(key) => h()(key)}
        icon={(key) => PART_ICON[key]}
        onChange={setPart}
      />
      <For each={[part()]} keyed={(key) => key}>
        {(current) => (
          <>
            <Show when={current() === "today"}>
              <Today ctx={props.ctx} />
            </Show>
            <Show when={current() === "bookings"}>
              <Bookings ctx={props.ctx} />
            </Show>
            <Show when={current() === "cleaning"}>
              <Cleaning ctx={props.ctx} />
            </Show>
            <Show when={current() === "fixes"}>
              <Fixes ctx={props.ctx} />
            </Show>
            <Show when={current() === "stock"}>
              <Stock ctx={props.ctx} />
            </Show>
          </>
        )}
      </For>
    </div>
  );
}

function Today(props: { ctx: Ctx }) {
  const h = () => props.ctx.h;
  const data = createSource(props.ctx.host, () =>
    view<StayOverview>(props.ctx.host, "stayOverview"),
  );
  void data.refresh();
  return (
    <SourceView source={data} t={props.ctx.t}>
      {(loaded) => {
        const k = () => loaded().kpi;
        const unread = () => loaded().notifications.filter((n) => !n.read);
        return (
          <>
            <Tiles label={h()("today")}>
              <Tile
                icon="door"
                label={h()("arrivals")}
                value={`${k().checkins_today}`}
                tone={k().checkins_today ? "accent" : "off"}
              />
              <Tile
                icon="out"
                label={h()("departures")}
                value={`${k().checkouts_today}`}
                tone={k().checkouts_today ? "warn" : "off"}
              />
              <Tile icon="homes" label={h()("occupied")} value={`${k().occupied}/${k().houses}`} />
              <Tile
                icon="broom"
                label={h()("cleaning")}
                value={`${k().cleaning_pending}`}
                tone={k().cleaning_pending ? "warn" : "ok"}
              />
              <Tile
                icon="wrench"
                label={h()("fixes")}
                value={`${k().maintenance_open}`}
                tone={k().maintenance_open ? "bad" : "ok"}
              />
              <Show when={k().revenue_month !== undefined}>
                <Tile
                  icon="chart"
                  label={h()("revenueMonth")}
                  value={euro(props.ctx.locale, k().revenue_month)}
                  tone="ok"
                />
              </Show>
            </Tiles>

            <div class="nsvx-homes__houses">
              <For
                each={loaded().status.filter((s) => matches(props.ctx.query, s.name, s.code))}
                keyed={(s) => s.id}
              >
                {(house) => (
                  <div
                    class={[
                      "nsvx-homes__house",
                      `nsvx-homes__house--${houseTone(house().state.code)}`,
                    ]}
                  >
                    <span class="nsvx-homes__house-code">{house().code}</span>
                    <strong>{house().name}</strong>
                    <Chip tone={houseTone(house().state.code)}>
                      {h()(`house_${house().state.code}` as HK)}
                    </Chip>
                    <Show when={house().state.next_arrival}>
                      {(next) => (
                        <span class="nsvx-row__detail">
                          <Glyph name="door" />
                          {day(props.ctx.locale, next().arrival)}
                          <Show
                            when={next().ready}
                            fallback={<Chip tone="warn">{h()("notReady")}</Chip>}
                          >
                            <Chip tone="ok">{h()("ready")}</Chip>
                          </Show>
                        </span>
                      )}
                    </Show>
                  </div>
                )}
              </For>
            </div>

            <div class="nsvx-homes__cols">
              <Section title={h()("next")} icon="calendar" count={loaded().timeline.length}>
                <ul class="nsvx-list">
                  <For
                    each={loaded()
                      .timeline.filter((e) => matches(props.ctx.query, e.title, e.property))
                      .slice(0, 20)}
                  >
                    {(event) => (
                      <li class="nsvx-row">
                        <Glyph
                          name={EVENT_ICON[event.kind] ?? "calendar"}
                          class={`nsvx-row__icon${event.urgent ? " nsvx-row__icon--bad" : ""}`}
                        />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">{event.title}</span>
                          <span class="nsvx-row__detail">{event.property}</span>
                        </span>
                        <span class="nsvx-row__age">{day(props.ctx.locale, event.date)}</span>
                      </li>
                    )}
                  </For>
                </ul>
                <Show when={loaded().timeline.length === 0}>
                  <Empty text={h()("allGood")} />
                </Show>
              </Section>
              <Section
                title={h()("alerts")}
                icon="bell"
                count={loaded().alerts.length + unread().length}
              >
                <Show when={unread().length}>
                  <Act
                    ctx={props.ctx}
                    label={h()("allSeen")}
                    icon="check"
                    disabled={!props.ctx.host.connection.canWrite}
                    run={() =>
                      props.ctx.host.request("nsvx.stay.noticesRead", {
                        ids: unread().map((n) => n.id),
                      })
                    }
                    onDone={() => void data.refresh()}
                  />
                </Show>
                <ul class="nsvx-list">
                  <For each={loaded().alerts}>
                    {(alert) => (
                      <li class="nsvx-row">
                        <Glyph
                          name="flag"
                          class={`nsvx-row__icon nsvx-row__icon--${severityTone(alert.severity)}`}
                        />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">{alert.title}</span>
                          <span class="nsvx-row__detail">
                            {[alert.property, alert.detail].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </li>
                    )}
                  </For>
                  <For each={unread()} keyed={(n) => n.id}>
                    {(note) => (
                      <li class="nsvx-row">
                        <Glyph
                          name="bell"
                          class={`nsvx-row__icon nsvx-row__icon--${severityTone(note().severity)}`}
                        />
                        <span class="nsvx-row__main">
                          <span class="nsvx-row__title">{note().title}</span>
                          <Show when={note().body}>
                            <span class="nsvx-row__detail">{note().body}</span>
                          </Show>
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
                <Show when={loaded().alerts.length + unread().length === 0}>
                  <Empty text={h()("allGood")} />
                </Show>
              </Section>
            </div>
          </>
        );
      }}
    </SourceView>
  );
}

function Bookings(props: { ctx: Ctx }) {
  const h = () => props.ctx.h;
  const [period, setPeriod] = createSignal<"upcoming" | "past">("upcoming");
  const data = createSource(props.ctx.host, () =>
    view<{ items: Reservation[] }>(props.ctx.host, "stayReservations", { period: period() }),
  );
  void data.refresh();
  return (
    <>
      <Segments
        name={h()("bookings")}
        items={["upcoming", "past"] as const}
        value={period()}
        label={(key) => h()(key)}
        onChange={(next) => {
          setPeriod(next);
          void data.refresh();
        }}
      />
      <SourceView source={data} t={props.ctx.t}>
        {(loaded) => {
          const rows = () =>
            loaded().items.filter((r) =>
              matches(props.ctx.query, r.guest_name, r.property, r.source_label),
            );
          return (
            <>
              <ul class="nsvx-list">
                <For each={rows()} keyed={(r) => r.id}>
                  {(booking) => (
                    <li class="nsvx-row nsvx-homes__booking">
                      <StayMark source={booking().source} label={booking().source_label} />
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">
                          {booking().kind === "block"
                            ? h()("blocked")
                            : (booking().guest_name ?? "—")}
                        </span>
                        <span class="nsvx-row__detail">
                          {booking().property} · {day(props.ctx.locale, booking().arrival)} →{" "}
                          {day(props.ctx.locale, booking().departure)} · {booking().nights}
                          {h()("nightsShort")}
                        </span>
                      </span>
                      <Show when={booking().conflict}>
                        <Chip tone="bad">{h()("clash")}</Chip>
                      </Show>
                      <Show when={booking().checked_out_at || booking().checked_in_at}>
                        <Chip tone={booking().checked_out_at ? "off" : "ok"}>
                          {h()(booking().checked_out_at ? "checkedOut" : "checkedIn")}
                        </Chip>
                      </Show>
                      <For each={stepsFor(booking())}>
                        {(step) => (
                          <Act
                            ctx={props.ctx}
                            label={h()(`step_${step}` as HK)}
                            icon={
                              step.startsWith("undo") ? "undo" : step === "checkin" ? "door" : "out"
                            }
                            primary={!step.startsWith("undo")}
                            iconOnly={step.startsWith("undo")}
                            confirm={step.startsWith("undo")}
                            disabled={!props.ctx.host.connection.canWrite}
                            run={() =>
                              props.ctx.host.request("nsvx.stay.step", {
                                reservationId: booking().id,
                                step,
                              })
                            }
                            onDone={() => void data.refresh()}
                          />
                        )}
                      </For>
                    </li>
                  )}
                </For>
              </ul>
              <Show when={rows().length === 0}>
                <Empty text={h()("noneYet")} />
              </Show>
            </>
          );
        }}
      </SourceView>
    </>
  );
}

function Cleaning(props: { ctx: Ctx }) {
  const h = () => props.ctx.h;
  const data = createSource(props.ctx.host, () =>
    view<{ items: StayTask[] }>(props.ctx.host, "stayTasks", { period: "open" }),
  );
  void data.refresh();
  const [problem, setProblem] = createSignal<{ id: string; note: string }>();
  return (
    <SourceView source={data} t={props.ctx.t}>
      {(loaded) => {
        const rows = () =>
          loaded().items.filter((t) => matches(props.ctx.query, t.title, t.property, t.assignee));
        return (
          <>
            <ul class="nsvx-list">
              <For each={rows()} keyed={(t) => t.id}>
                {(task) => (
                  <li class="nsvx-homes__task">
                    <div class="nsvx-row">
                      <Glyph
                        name={task().kind === "cleaning" ? "broom" : "check"}
                        class={`nsvx-row__icon${task().urgent ? " nsvx-row__icon--bad" : ""}`}
                      />
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">{task().title}</span>
                        <span class="nsvx-row__detail">
                          {[
                            task().property,
                            task().assignee,
                            task().due_at ? day(props.ctx.locale, task().due_at) : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <Show when={task().checklist_total}>
                        <Chip
                          tone={task().checklist_done === task().checklist_total ? "ok" : "off"}
                        >
                          {task().checklist_done}/{task().checklist_total}
                        </Chip>
                      </Show>
                      <Chip
                        tone={
                          task().status === "problema"
                            ? "bad"
                            : task().status === "em_curso"
                              ? "accent"
                              : "off"
                        }
                      >
                        {task().status_label}
                      </Chip>
                    </div>
                    <div class="nsvx-homes__acts">
                      <For each={taskActionsFor(task().status)}>
                        {(action) => (
                          <Show
                            when={action !== "problem"}
                            fallback={
                              <button
                                type="button"
                                class="nsvx__button"
                                onClick={() =>
                                  setProblem(
                                    problem()?.id === task().id
                                      ? undefined
                                      : { id: task().id, note: "" },
                                  )
                                }
                              >
                                <Glyph name="flag" />
                                <span>{h()("task_problem")}</span>
                              </button>
                            }
                          >
                            <Act
                              ctx={props.ctx}
                              label={h()(`task_${action}` as HK)}
                              icon={ACTION_ICON[action]}
                              primary={action === "complete" || action === "start"}
                              confirm={action === "reopen"}
                              disabled={!props.ctx.host.connection.canWrite}
                              run={() =>
                                props.ctx.host.request("nsvx.stay.task", {
                                  taskId: task().id,
                                  action,
                                })
                              }
                              onDone={() => void data.refresh()}
                            />
                          </Show>
                        )}
                      </For>
                    </div>
                    <Show when={problem()?.id === task().id}>
                      <div class="nsvx-homes__form nsvx-homes__form--row">
                        <input
                          type="text"
                          maxlength={2000}
                          placeholder={h()("whatHappened")}
                          aria-label={h()("whatHappened")}
                          value={problem()?.note ?? ""}
                          onInput={(e) =>
                            setProblem({ id: task().id, note: e.currentTarget.value })
                          }
                        />
                        <Act
                          ctx={props.ctx}
                          label={h()("send")}
                          icon="flag"
                          primary
                          disabled={!problem()?.note.trim() || !props.ctx.host.connection.canWrite}
                          run={() =>
                            props.ctx.host.request("nsvx.stay.task", {
                              taskId: task().id,
                              action: "problem",
                              note: problem()?.note.trim(),
                            })
                          }
                          onDone={() => {
                            setProblem(undefined);
                            void data.refresh();
                          }}
                        />
                      </div>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
            <Show when={rows().length === 0}>
              <Empty text={h()("allGood")} />
            </Show>
          </>
        );
      }}
    </SourceView>
  );
}

function Fixes(props: { ctx: Ctx }) {
  const h = () => props.ctx.h;
  const data = createSource(props.ctx.host, async () => {
    const [issues, houses] = await Promise.all([
      view<{ items: Issue[] }>(props.ctx.host, "stayMaintenance", { open_only: "true" }),
      view<{ properties: { id: string; code: string; name: string }[] }>(props.ctx.host, "stayMe"),
    ]);
    return { issues: issues.items, houses: houses.properties };
  });
  void data.refresh();
  const [house, setHouse] = createSignal("");
  const [title, setTitle] = createSignal("");
  const [priority, setPriority] = createSignal<(typeof ISSUE_PRIORITIES)[number]>("media");
  const [unfit, setUnfit] = createSignal(false);
  return (
    <SourceView source={data} t={props.ctx.t}>
      {(loaded) => {
        const rows = () =>
          loaded().issues.filter((i) => matches(props.ctx.query, i.title, i.property));
        return (
          <>
            <Section title={h()("report")} icon="wrench">
              <div class="nsvx-homes__form">
                <select
                  aria-label={h()("house")}
                  value={house()}
                  onChange={(e) => setHouse(e.currentTarget.value)}
                >
                  <option value="">{h()("house")}</option>
                  <For each={loaded().houses}>
                    {(item) => <option value={item.id}>{item.name}</option>}
                  </For>
                </select>
                <input
                  type="text"
                  maxlength={160}
                  placeholder={h()("whatHappened")}
                  aria-label={h()("whatHappened")}
                  value={title()}
                  onInput={(e) => setTitle(e.currentTarget.value)}
                />
                <select
                  aria-label={h()("priority")}
                  value={priority()}
                  onChange={(e) => setPriority(e.currentTarget.value as never)}
                >
                  <For each={ISSUE_PRIORITIES}>
                    {(code) => <option value={code}>{h()(`prio_${code}` as HK)}</option>}
                  </For>
                </select>
                <label class="nsvx-homes__toggle">
                  <input
                    type="checkbox"
                    checked={unfit()}
                    onChange={(e) => setUnfit(e.currentTarget.checked)}
                  />
                  <span>{h()("unfit")}</span>
                </label>
                <Act
                  ctx={props.ctx}
                  label={h()("report")}
                  icon="plus"
                  primary
                  disabled={
                    !house() || title().trim().length < 2 || !props.ctx.host.connection.canWrite
                  }
                  run={() =>
                    props.ctx.host.request("nsvx.stay.issue", {
                      house: house(),
                      title: title().trim(),
                      priority: priority(),
                      unfit: unfit(),
                    })
                  }
                  onDone={() => {
                    setTitle("");
                    setUnfit(false);
                    void data.refresh();
                  }}
                />
              </div>
            </Section>
            <ul class="nsvx-list">
              <For each={rows()} keyed={(i) => i.id}>
                {(issue) => (
                  <li class="nsvx-row">
                    <Glyph
                      name="wrench"
                      class={`nsvx-row__icon nsvx-row__icon--${issue().priority === "urgente" || issue().unfit ? "bad" : issue().priority === "alta" ? "warn" : "off"}`}
                    />
                    <span class="nsvx-row__main">
                      <span class="nsvx-row__title">{issue().title}</span>
                      <span class="nsvx-row__detail">
                        {issue().property} · {day(props.ctx.locale, issue().created_at)}
                      </span>
                    </span>
                    <Show when={issue().unfit}>
                      <Chip tone="bad">{h()("unfit")}</Chip>
                    </Show>
                    <Chip tone="off">{issue().status_label}</Chip>
                  </li>
                )}
              </For>
            </ul>
            <Show when={rows().length === 0}>
              <Empty text={h()("allGood")} />
            </Show>
          </>
        );
      }}
    </SourceView>
  );
}

function Stock(props: { ctx: Ctx }) {
  const h = () => props.ctx.h;
  const data = createSource(props.ctx.host, () =>
    view<{ items: InventoryItem[] }>(props.ctx.host, "stayInventory"),
  );
  void data.refresh();
  return (
    <SourceView source={data} t={props.ctx.t}>
      {(loaded) => {
        const rows = () =>
          loaded()
            .items.filter((i) => matches(props.ctx.query, i.name, i.property))
            .toSorted((a, b) => Number(b.low) - Number(a.low));
        return (
          <>
            <ul class="nsvx-homes__stock">
              <For each={rows()} keyed={(i) => i.id}>
                {(item) => {
                  const level = () => {
                    const min = Number(item().min_quantity) || 0;
                    return min > 0 ? Math.min(1, Number(item().quantity) / (min * 2)) : 1;
                  };
                  return (
                    <li
                      class={[
                        "nsvx-homes__stock-item",
                        { "nsvx-homes__stock-item--low": item().low },
                      ]}
                    >
                      <span class="nsvx-row__main">
                        <span class="nsvx-row__title">{item().name}</span>
                        <span class="nsvx-row__detail">{item().property}</span>
                      </span>
                      <span
                        class="nsvx-homes__progress"
                        role="img"
                        aria-label={`${item().quantity}/${item().min_quantity}`}
                      >
                        <span style={{ width: `${level() * 100}%` }} />
                      </span>
                      <strong>
                        {Number(item().quantity)} {item().unit ?? ""}
                      </strong>
                    </li>
                  );
                }}
              </For>
            </ul>
            <Show when={rows().length === 0}>
              <Empty text={h()("noneYet")} />
            </Show>
          </>
        );
      }}
    </SourceView>
  );
}
