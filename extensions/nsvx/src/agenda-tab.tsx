/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  addDays,
  addMonths,
  clashes,
  dayKey,
  eventsCsv,
  eventsOn,
  monthGrid,
  todayKey,
  weekStart,
  windowFor,
  type Calendar,
  type CalendarEvent,
  type EventsPage,
  type Reminder,
  type WorkspaceStatus,
} from "./agenda-data.js";
import { Editor } from "./agenda-editor.js";
import { EventView } from "./agenda-event.js";
import { agendaTranslator } from "./agenda-i18n.js";
import { dayLabel, Glyph, Seg, view, whenText, type Ctx } from "./agenda-ui.js";
import { BrandLogo } from "./messages-ui.js";
import { age, createSource, errorMessage, matches, SourceView, type T } from "./ui-kit.js";
import "./agenda.css";

type View = "day" | "week" | "month";
const VIEWS: View[] = ["day", "week", "month"];

function rangeLabel(ctx: Ctx, mode: View, anchor: string) {
  const format = (key: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(ctx.host.locale, { timeZone: "UTC", ...options }).format(
      new Date(`${key}T12:00:00Z`),
    );
  if (mode === "day") {
    return format(anchor, { weekday: "short", day: "numeric", month: "long" });
  }
  if (mode === "month") {
    return format(anchor, { month: "long", year: "numeric" });
  }
  const start = weekStart(anchor);
  return `${format(start, { day: "numeric", month: "short" })} – ${format(addDays(start, 6), { day: "numeric", month: "short" })}`;
}

function download(name: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function AgendaTab(props: {
  host: ControlUiHost;
  t: T;
  locale: string;
  query: string;
  open: string | undefined;
  onOpen: (id: string | undefined) => void;
  onMission: (id: string) => void;
}) {
  const ctx: Ctx = {
    host: props.host,
    t: props.t,
    at: (key) => agendaTranslator(props.locale)(key),
    zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Lisbon",
  };
  const status = createSource(props.host, () =>
    view<WorkspaceStatus>(props.host, "workspaceStatus"),
  );
  const calendars = createSource(props.host, () => view<Calendar[]>(props.host, "calendars"));
  const reminders = createSource(props.host, () =>
    view<{ reminders: Reminder[] }>(props.host, "ownerReminders", { kind: "calendar" }),
  );
  void status.refresh();
  void calendars.refresh();
  void reminders.refresh();
  const due = createMemo(() =>
    (reminders.state().data?.reminders ?? []).filter(
      (reminder) => Date.parse(reminder.due_at) <= Date.now(),
    ),
  );
  const dismiss = async (reminder: Reminder) => {
    try {
      await props.host.request("nsvx.agenda.remind", {
        eventId: reminder.target_id,
        action: "dismiss",
        label: reminder.label,
      });
    } finally {
      await reminders.refresh();
    }
  };
  const connected = createMemo(
    () =>
      status.state().data?.products.find((product) => product.product === "calendar")
        ?.permission_granted === true,
  );
  const [mode, setMode] = createSignal<View>("week");
  const [anchor, setAnchor] = createSignal(todayKey(ctx.zone));
  const [revision, setRevision] = createSignal(0);
  const [editing, setEditing] = createSignal<{ existing?: CalendarEvent; day: string }>();
  const step = (direction: 1 | -1) =>
    setAnchor(
      mode() === "month"
        ? addMonths(anchor(), direction)
        : addDays(anchor(), direction * (mode() === "day" ? 1 : 7)),
    );
  const toggleCalendar = async (calendar: Calendar) => {
    try {
      await props.host.request("nsvx.agenda.select", {
        calendarId: calendar.id,
        selected: !calendar.selected,
      });
    } finally {
      await calendars.refresh();
      setRevision(revision() + 1);
    }
  };
  const closeEditor = (changed: boolean) => {
    setEditing(undefined);
    if (changed) {
      setRevision(revision() + 1);
    }
  };

  return (
    <div class="nsvx-agenda">
      <SourceView source={status} t={props.t}>
        {() => (
          <Show
            when={connected()}
            fallback={
              <div class="nsvx-connect" role="status">
                <BrandLogo channel="googlecalendar" size={40} />
                <strong>{ctx.at("notConnected")}</strong>
                <span>{ctx.at("notConnectedHelp")}</span>
                <button type="button" class="nsvx__button" onClick={() => void status.refresh()}>
                  {props.t("retry")}
                </button>
              </div>
            }
          >
            <Show
              when={editing()}
              fallback={
                <Show
                  when={props.open}
                  fallback={
                    <>
                      <Show when={due().length > 0}>
                        <ul class="nsvx-agenda__due" aria-label={ctx.at("remind")}>
                          <For each={due()} keyed={(reminder) => reminder.target_id}>
                            {(reminder) => (
                              <li>
                                <button
                                  type="button"
                                  class="nsvx-agenda__due-open"
                                  onClick={() => props.onOpen(reminder().target_id)}
                                >
                                  <Glyph name="bell" />
                                  <span>{reminder().label}</span>
                                </button>
                                <button
                                  type="button"
                                  class="nsvx__button nsvx__button--icon"
                                  aria-label={ctx.at("dismiss")}
                                  title={ctx.at("dismiss")}
                                  disabled={!props.host.connection.canWrite}
                                  onClick={() => void dismiss(reminder())}
                                >
                                  <Glyph name="check" />
                                </button>
                              </li>
                            )}
                          </For>
                        </ul>
                      </Show>
                      <div class="nsvx-agenda__bar">
                        <Seg
                          items={VIEWS}
                          value={mode()}
                          name={ctx.at("agenda")}
                          label={(key) => ctx.at(key)}
                          onChange={setMode}
                        />
                        <span class="nsvx-agenda__nav">
                          <button
                            type="button"
                            class="nsvx__button nsvx__button--icon"
                            aria-label={ctx.at("previous")}
                            title={ctx.at("previous")}
                            onClick={() => step(-1)}
                          >
                            <Glyph name="back" />
                          </button>
                          <button
                            type="button"
                            class="nsvx__button"
                            aria-current={anchor() === todayKey(ctx.zone) ? "date" : undefined}
                            onClick={() => setAnchor(todayKey(ctx.zone))}
                          >
                            {ctx.at("today")}
                          </button>
                          <button
                            type="button"
                            class="nsvx__button nsvx__button--icon"
                            aria-label={ctx.at("next")}
                            title={ctx.at("next")}
                            onClick={() => step(1)}
                          >
                            <Glyph name="next" />
                          </button>
                        </span>
                        <strong class="nsvx-agenda__range">
                          {rangeLabel(ctx, mode(), anchor())}
                        </strong>
                        <button
                          type="button"
                          class="nsvx__button nsvx__button--primary"
                          disabled={!props.host.connection.canWrite}
                          onClick={() => setEditing({ day: anchor() })}
                        >
                          <Glyph name="plus" />
                          <span>{ctx.at("new")}</span>
                        </button>
                      </div>
                      <Show when={(calendars.state().data ?? []).length > 0}>
                        <div
                          class="nsvx-agenda__cals"
                          role="group"
                          aria-label={ctx.at("calendars")}
                        >
                          <For
                            each={calendars.state().data ?? []}
                            keyed={(calendar) => calendar.id}
                          >
                            {(calendar) => (
                              <button
                                type="button"
                                class={[
                                  "nsvx-agenda__cal",
                                  { "nsvx-agenda__cal--on": calendar().selected },
                                ]}
                                aria-pressed={calendar().selected ? "true" : "false"}
                                disabled={!props.host.connection.canWrite}
                                title={calendar().last_error ?? calendar().account}
                                onClick={() => void toggleCalendar(calendar())}
                              >
                                <span
                                  class="nsvx-agenda__swatch"
                                  style={{ background: calendar().color ?? "var(--primary)" }}
                                />
                                <span>{calendar().summary ?? calendar().calendar_id}</span>
                                <Show when={calendar().last_error}>
                                  <Glyph name="alert" class="nsvx-agenda__warn" />
                                </Show>
                              </button>
                            )}
                          </For>
                        </div>
                      </Show>
                      <For each={[`${mode()}:${anchor()}:${revision()}`]} keyed={(key) => key}>
                        {() => (
                          <Window
                            ctx={ctx}
                            mode={mode()}
                            anchor={anchor()}
                            query={props.query}
                            onOpen={(id) => props.onOpen(id)}
                            onDay={(key) => {
                              setAnchor(key);
                              setMode("day");
                            }}
                            onNew={(day) => setEditing({ day })}
                          />
                        )}
                      </For>
                    </>
                  }
                >
                  {(id) => (
                    <For each={[`${id()}:${revision()}`]} keyed={(key) => key}>
                      {() => (
                        <EventView
                          ctx={ctx}
                          id={id()}
                          onBack={() => props.onOpen(undefined)}
                          onEdit={(event) =>
                            setEditing({ existing: event, day: dayKey(event, ctx.zone) })
                          }
                          onCancelled={() => {
                            props.onOpen(undefined);
                            setRevision(revision() + 1);
                          }}
                          onMission={props.onMission}
                        />
                      )}
                    </For>
                  )}
                </Show>
              }
            >
              {(edit) => (
                <Editor
                  ctx={ctx}
                  day={edit().day}
                  existing={edit().existing}
                  onClose={closeEditor}
                />
              )}
            </Show>
          </Show>
        )}
      </SourceView>
    </div>
  );
}

function Window(props: {
  ctx: Ctx;
  mode: View;
  anchor: string;
  query: string;
  onOpen: (id: string) => void;
  onDay: (key: string) => void;
  onNew: (day: string) => void;
}) {
  const { ctx } = props;
  const keys =
    props.mode === "day"
      ? [props.anchor]
      : props.mode === "week"
        ? Array.from({ length: 7 }, (_, index) => addDays(weekStart(props.anchor), index))
        : monthGrid(props.anchor);
  const range = windowFor(keys[0] ?? props.anchor, keys.length, ctx.zone);
  const params = { start: range.start, end: range.end, tz: ctx.zone };
  // Stored rows show at once; the live read asks NSVX to check Google, as opening its Agenda does.
  const stored = createSource(ctx.host, () => view<EventsPage>(ctx.host, "calendarEvents", params));
  const live = createSource(ctx.host, () =>
    view<EventsPage>(ctx.host, "calendarEvents", { ...params, live: "1" }),
  );
  void stored.refresh();
  void live.refresh();
  const page = createMemo(() => live.state().data ?? stored.state().data);
  const shown = createMemo(() =>
    (page()?.events ?? []).filter((event) =>
      matches(
        props.query,
        event.summary,
        event.location,
        ...event.attendees.map((attendee) => attendee.email),
      ),
    ),
  );
  const [picked, setPicked] = createSignal<string>();
  const [summary, setSummary] = createSignal<{ text: string | null; busy: boolean }>();
  const [ics, setIcs] = createSignal(false);
  // NSVX's own feed, so a calendar app gets exactly what NSVX would export; failures show in the summary line.
  const exportIcs = async () => {
    setIcs(true);
    try {
      const file = await ctx.host.request<{ fileName: string; ics: string }>("nsvx.agenda.ics", {});
      download(file.fileName, file.ics, "text/calendar");
    } catch (cause) {
      setSummary({ text: errorMessage(ctx.host, cause), busy: false });
    } finally {
      setIcs(false);
    }
  };
  const summarize = async () => {
    setSummary({ text: null, busy: true });
    try {
      const result = await ctx.host.request<{ text: string | null }>(
        "nsvx.agenda.summary",
        windowFor(props.anchor, 1, ctx.zone),
      );
      setSummary({ text: result.text ?? ctx.at("nothing"), busy: false });
    } catch (cause) {
      setSummary({ text: errorMessage(ctx.host, cause), busy: false });
    }
  };
  const dayList = () =>
    keys
      .map((key) => [key, eventsOn(shown(), key, ctx.zone)] as [string, CalendarEvent[]])
      .filter(([, events]) => props.mode === "day" || events.length > 0);

  return (
    <SourceView source={stored} t={ctx.t}>
      {() => (
        <>
          <div class="nsvx-agenda__status">
            <span class="nsvx-agenda__fresh" role="status">
              <Show
                when={!live.state().loading}
                fallback={
                  <>
                    <Glyph name="refresh" class="nsvx__icon nsvx-agenda__spin" />
                    {ctx.at("updating")}
                  </>
                }
              >
                <Show
                  when={live.state().data && !live.state().data?.errors.length}
                  fallback={
                    <>
                      <Glyph name="alert" class="nsvx__icon nsvx-agenda__warn" />
                      {ctx.at("saved")} {age(page()?.fresh_at)}
                    </>
                  }
                >
                  <Glyph name="check" class="nsvx__icon nsvx-agenda__ok" />
                  {ctx.at("live")}
                </Show>
              </Show>
            </span>
            <span class="nsvx-agenda__tools">
              <button
                type="button"
                class="nsvx__button"
                aria-label={ctx.at("summary")}
                title={ctx.at("summary")}
                disabled={summary()?.busy}
                onClick={() => void summarize()}
              >
                <Glyph name="spark" />
                <span>{ctx.at("summary")}</span>
              </button>
              <button
                type="button"
                class="nsvx__button nsvx__button--icon"
                aria-label={ctx.at("csv")}
                title={ctx.at("csv")}
                disabled={shown().length === 0}
                onClick={() =>
                  download(
                    `agenda-${keys[0]}.csv`,
                    eventsCsv(
                      keys.map((key) => [key, eventsOn(shown(), key, ctx.zone)]),
                      ctx.zone,
                    ),
                  )
                }
              >
                <Glyph name="download" />
              </button>
              <button
                type="button"
                class="nsvx__button nsvx__button--icon"
                aria-label={ctx.at("ics")}
                title={ctx.at("ics")}
                disabled={ics()}
                onClick={() => void exportIcs()}
              >
                <Glyph name="calendar" />
              </button>
            </span>
          </div>
          <Show when={summary()}>
            {(current) => (
              <div
                class="nsvx-agenda__summary"
                role="status"
                aria-busy={current().busy ? "true" : "false"}
              >
                <Glyph name="spark" />
                <p>{current().busy ? ctx.t("loading") : current().text}</p>
                <button
                  type="button"
                  class="nsvx__button nsvx__button--icon"
                  aria-label={ctx.t("close")}
                  onClick={() => setSummary(undefined)}
                >
                  <Glyph name="close" />
                </button>
              </div>
            )}
          </Show>
          <Show
            when={props.mode === "month"}
            fallback={
              <Show
                when={dayList().length > 0}
                fallback={
                  <div class="nsvx-agenda__empty">
                    <Glyph name="check" class="nsvx-agenda__empty-icon" />
                    <strong>{ctx.at(props.query.trim() ? "noMatch" : "nothing")}</strong>
                    <button
                      type="button"
                      class="nsvx__button nsvx__button--primary"
                      disabled={!ctx.host.connection.canWrite}
                      onClick={() => props.onNew(props.anchor)}
                    >
                      <Glyph name="plus" />
                      <span>{ctx.at("new")}</span>
                    </button>
                  </div>
                }
              >
                <For each={dayList()} keyed={([key]) => key}>
                  {(entry) => (
                    <DaySection
                      ctx={ctx}
                      day={entry()[0]}
                      events={entry()[1]}
                      onOpen={props.onOpen}
                    />
                  )}
                </For>
              </Show>
            }
          >
            <MonthGrid
              ctx={ctx}
              anchor={props.anchor}
              keys={keys}
              events={shown()}
              picked={picked()}
              onPick={(key) => (picked() === key ? props.onDay(key) : setPicked(key))}
            />
            <Show when={picked()}>
              {(key) => (
                <DaySection
                  ctx={ctx}
                  day={key()}
                  events={eventsOn(shown(), key(), ctx.zone)}
                  onOpen={props.onOpen}
                />
              )}
            </Show>
          </Show>
        </>
      )}
    </SourceView>
  );
}

function MonthGrid(props: {
  ctx: Ctx;
  anchor: string;
  keys: string[];
  events: CalendarEvent[];
  picked: string | undefined;
  onPick: (key: string) => void;
}) {
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(props.ctx.host.locale, { timeZone: "UTC", weekday: "narrow" }).format(
      new Date(Date.UTC(2024, 0, 1 + index, 12)),
    ),
  );
  const today = todayKey(props.ctx.zone);
  return (
    <div class="nsvx-agenda__month" role="grid" aria-label={props.ctx.at("month")}>
      <For each={weekdays} keyed={false}>
        {(name) => (
          <span class="nsvx-agenda__weekday" aria-hidden="true">
            {name()}
          </span>
        )}
      </For>
      <For each={props.keys}>
        {(key) => {
          const count = () => eventsOn(props.events, key, props.ctx.zone).length;
          const clash = () => clashes(eventsOn(props.events, key, props.ctx.zone)).size > 0;
          return (
            <button
              type="button"
              class={[
                "nsvx-agenda__cell",
                {
                  "nsvx-agenda__cell--out": key.slice(0, 7) !== props.anchor.slice(0, 7),
                  "nsvx-agenda__cell--today": key === today,
                  "nsvx-agenda__cell--on": props.picked === key,
                },
              ]}
              aria-pressed={props.picked === key ? "true" : "false"}
              aria-label={`${dayLabel(props.ctx, key)}: ${count()}`}
              onClick={() => props.onPick(key)}
            >
              <span>{Number(key.slice(8))}</span>
              <Show when={count() > 0}>
                <span class={["nsvx-agenda__count", { "nsvx-agenda__count--clash": clash() }]}>
                  {count()}
                </span>
              </Show>
            </button>
          );
        }}
      </For>
    </div>
  );
}

function DaySection(props: {
  ctx: Ctx;
  day: string;
  events: CalendarEvent[];
  onOpen: (id: string) => void;
}) {
  const clashing = createMemo(() => clashes(props.events));
  return (
    <section class="nsvx-agenda__day" aria-label={dayLabel(props.ctx, props.day)}>
      <h3
        class={[
          "nsvx-agenda__day-head",
          { "nsvx-agenda__day-head--today": props.day === todayKey(props.ctx.zone) },
        ]}
      >
        <span>{dayLabel(props.ctx, props.day)}</span>
        <Show when={clashing().size > 0}>
          <span class="nsvx__chip nsvx-agenda__chip--warn">
            <Glyph name="alert" />
            {props.ctx.at("overlap")}
          </span>
        </Show>
      </h3>
      <Show
        when={props.events.length > 0}
        fallback={
          <p class="nsvx-agenda__free">
            <Glyph name="check" />
            {props.ctx.at("free")}
          </p>
        }
      >
        <ul class="nsvx-agenda__events">
          <For each={props.events} keyed={(event) => event.event_id}>
            {(event) => (
              <li>
                <button
                  type="button"
                  class="nsvx-agenda__event"
                  onClick={() => props.onOpen(event().id ?? event().event_id)}
                >
                  <span class="nsvx-agenda__time">{whenText(props.ctx, event())}</span>
                  <span class="nsvx-agenda__main">
                    <span class="nsvx-agenda__title">{event().summary}</span>
                    <span class="nsvx-agenda__meta">
                      <Show when={event().location}>
                        <span class="nsvx-agenda__meta-item">
                          <Glyph name="pin" />
                          {event().location}
                        </span>
                      </Show>
                      <Show when={event().attendees.filter((attendee) => !attendee.self).length}>
                        {(count) => (
                          <span class="nsvx-agenda__meta-item">
                            <Glyph name="people" />
                            {count()}
                          </span>
                        )}
                      </Show>
                    </span>
                  </span>
                  <Show when={clashing().has(event().event_id)}>
                    <Glyph name="alert" class="nsvx__icon nsvx-agenda__warn" />
                  </Show>
                  <Show when={event().meet_url}>
                    <BrandLogo channel="googlemeet" size={18} />
                  </Show>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}

/** Polls one NSVX intent until Google settles it; uncertain stays uncertain and is never resubmitted. */
