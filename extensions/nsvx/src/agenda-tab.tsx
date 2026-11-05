/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  addDays,
  cancelOperation,
  dayIn,
  eventDay,
  eventsWindow,
  groupByDay,
  weekStart,
  type AgendaCalendar,
  type AgendaEvent,
  type AgendaEventDetail,
  type AgendaEvents,
} from "./agenda-data.js";
import { Editor } from "./agenda-editor.js";
import { ChangeReview, dayText, Glyph, rangeText, ReplyMark, timeText, ZONE } from "./agenda-ui.js";
import { age, createSource, matches, SourceView, type T } from "./ui-kit.js";
import "./agenda.css";

function EventCard(props: {
  event: AgendaEvent;
  color: string | undefined;
  /** Week columns show the start only. */
  compact: boolean;
  locale: string;
  t: T;
  onOpen: () => void;
}) {
  const guests = () => props.event.attendees.filter((attendee) => !attendee.self).length;
  return (
    <button
      type="button"
      class={["nsvx-event", { "nsvx-event--declined": props.event.self_response === "declined" }]}
      style={{ "--nsvx-event-color": props.color ?? "var(--primary)" }}
      onClick={() => props.onOpen()}
    >
      <span class="nsvx-event__time">
        {props.compact && props.event.start && !props.event.all_day
          ? timeText(props.locale, props.event.start)
          : rangeText(props.locale, props.event, props.t)}
      </span>
      <span class="nsvx-event__title">{props.event.summary}</span>
      <span class="nsvx-event__meta">
        <Show when={props.event.meet_url}>
          <span title={props.t("meet")}>
            <Glyph name="video" />
          </span>
        </Show>
        <Show when={guests() > 0}>
          <span title={props.t("guests")}>
            <Glyph name="people" />
            {guests()}
          </span>
        </Show>
        <Show when={props.event.self_response}>
          <ReplyMark response={props.event.self_response} />
        </Show>
      </span>
    </button>
  );
}

function Detail(props: {
  host: ControlUiHost;
  t: T;
  locale: string;
  refId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const detail = createSource(props.host, () =>
    props.host.request<AgendaEventDetail>("nsvx.view", {
      view: "agendaEvent",
      params: { id: props.refId },
    }),
  );
  const [editing, setEditing] = createSignal(false);
  const [cancelling, setCancelling] = createSignal(false);
  const [notify, setNotify] = createSignal(true);
  void detail.refresh();
  return (
    <SourceView source={detail} t={props.t}>
      {(data) => {
        const event = () => data().event;
        const guests = () => event().attendees.filter((attendee) => !attendee.self);
        return (
          <Show
            when={!editing()}
            fallback={
              <Editor
                host={props.host}
                t={props.t}
                locale={props.locale}
                day={eventDay(event(), ZONE)}
                existing={event()}
                onClose={() => setEditing(false)}
                onDone={() => {
                  setEditing(false);
                  void detail.refresh();
                  props.onChanged();
                }}
              />
            }
          >
            <section class="nsvx-sheet" aria-label={event().summary}>
              <header class="nsvx-sheet__head">
                <button
                  type="button"
                  class="nsvx__button nsvx__button--icon"
                  aria-label={props.t("back")}
                  title={props.t("back")}
                  onClick={() => props.onClose()}
                >
                  <Glyph name="back" />
                </button>
                <strong class="nsvx-sheet__title">{event().summary}</strong>
                <Show when={event().can_edit && props.host.connection.canWrite}>
                  <button
                    type="button"
                    class="nsvx__button nsvx__button--icon"
                    aria-label={props.t("editEvent")}
                    title={props.t("editEvent")}
                    onClick={() => setEditing(true)}
                  >
                    <Glyph name="edit" />
                  </button>
                  <button
                    type="button"
                    class="nsvx__button nsvx__button--icon"
                    aria-label={props.t("cancelEvent")}
                    title={props.t("cancelEvent")}
                    aria-pressed={cancelling() ? "true" : "false"}
                    onClick={() => setCancelling(!cancelling())}
                  >
                    <Glyph name="trash" />
                  </button>
                </Show>
              </header>
              <ul class="nsvx-facts">
                <li>
                  <Glyph name="clock" />
                  <span>
                    {dayText(props.locale, eventDay(event(), ZONE), {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                    {" · "}
                    {rangeText(props.locale, event(), props.t)}
                  </span>
                </li>
                <Show when={event().location}>
                  <li>
                    <Glyph name="pin" />
                    <span>{event().location}</span>
                  </li>
                </Show>
                <Show when={event().meet_url}>
                  {(url) => (
                    <li>
                      <Glyph name="video" />
                      <a
                        class="nsvx__button nsvx__button--primary"
                        href={url()}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {props.t("join")}
                      </a>
                      <Show
                        when={
                          data().meeting.status !== "scheduled" &&
                          data().meeting.status !== "no_record"
                        }
                      >
                        <span class="nsvx__chip">
                          {props.t(data().meeting.status === "ended" ? "meetEnded" : "meetLive")}
                        </span>
                      </Show>
                    </li>
                  )}
                </Show>
              </ul>
              <Show when={guests().length > 0}>
                <h3 class="nsvx__heading">
                  <Glyph name="people" /> {guests().length}
                </h3>
                <ul class="nsvx-guests">
                  <For each={guests()} keyed={(guest) => guest.email}>
                    {(guest) => (
                      <li>
                        <ReplyMark response={guest().response} />
                        <span class="nsvx-guests__name">{guest().name ?? guest().email}</span>
                        <Show when={guest().organizer}>
                          <span class="nsvx__chip">{props.t("organizer")}</span>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
              <Show when={event().description}>
                <p class="nsvx-sheet__text">{event().description}</p>
              </Show>
              <Show when={cancelling()}>
                <div class="nsvx-sheet__danger">
                  <Show when={guests().length > 0}>
                    <button
                      type="button"
                      class={["nsvx-chip", { "nsvx-chip--on": notify() }]}
                      aria-pressed={notify() ? "true" : "false"}
                      onClick={() => setNotify(!notify())}
                    >
                      {props.t("notify")}
                    </button>
                  </Show>
                  <For each={[notify()]} keyed={(key) => String(key)}>
                    {() => (
                      <ChangeReview
                        host={props.host}
                        t={props.t}
                        danger
                        label={props.t("cancelEvent")}
                        change={() => cancelOperation(event(), guests().length, notify())}
                        onSettled={(intent) => {
                          if (intent.state === "accepted") {
                            props.onChanged();
                            props.onClose();
                          }
                        }}
                      />
                    )}
                  </For>
                </div>
              </Show>
              <Show when={data().intents.length > 0}>
                <ul class="nsvx-list">
                  <For each={data().intents.slice(0, 5)} keyed={(intent) => intent.id}>
                    {(intent) => (
                      <li class="nsvx-task">
                        <span>{intent().summary ?? intent().operation}</span>
                        <span class="nsvx__chip">{intent().lifecycle_label}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </section>
          </Show>
        );
      }}
    </SourceView>
  );
}

type Mode = "day" | "week";

export function AgendaTab(props: {
  host: ControlUiHost;
  t: T;
  locale: string;
  query: string;
  open: string | undefined;
  onOpen: (ref: string | undefined) => void;
}) {
  const today = dayIn(new Date(), ZONE);
  const narrow = typeof matchMedia === "function" && matchMedia("(max-width: 640px)").matches;
  const [mode, setMode] = createSignal<Mode>(narrow ? "day" : "week");
  const [anchor, setAnchor] = createSignal(today);
  const [creating, setCreating] = createSignal(false);
  const [summary, setSummary] = createSignal<{ text: string | null } | undefined>();
  const [live, setLive] = createSignal<"idle" | "busy" | "error">("idle");
  // Plain copy of the shown range: a load right after a change must read the new range, not the pre-flush signal.
  let range = { first: narrow ? today : weekStart(today), days: narrow ? 1 : 7 };
  const events = createSource(props.host, () =>
    props.host.request<AgendaEvents>("nsvx.view", {
      view: "agendaEvents",
      params: eventsWindow(range.first, range.days, ZONE),
    }),
  );
  const calendars = createSource(props.host, () =>
    props.host.request<AgendaCalendar[]>("nsvx.view", { view: "agendaCalendars" }),
  );
  void events.refresh();
  void calendars.refresh();
  const show = (nextMode: Mode, day: string) => {
    range = nextMode === "week" ? { first: weekStart(day), days: 7 } : { first: day, days: 1 };
    setMode(nextMode);
    setAnchor(day);
    setSummary(undefined);
    void events.refresh();
  };
  const step = (direction: number) => show(mode(), addDays(anchor(), direction * range.days));
  const readLive = async () => {
    setLive("busy");
    try {
      const answer = await props.host.request<AgendaEvents>("nsvx.view", {
        view: "agendaEvents",
        params: { ...eventsWindow(range.first, range.days, ZONE), live: "1" },
      });
      setLive(answer.errors.length > 0 ? "error" : "idle");
    } catch {
      setLive("error");
    }
    await events.refresh();
  };
  const summarize = async () => {
    try {
      const window = eventsWindow(range.first, range.days, ZONE);
      setSummary(
        await props.host.request<{ text: string | null }>("nsvx.agenda.summary", {
          start: window.start,
          end: window.end,
        }),
      );
    } catch {
      setSummary({ text: null });
    }
  };
  const toggleCalendar = async (calendar: AgendaCalendar) => {
    await props.host
      .request("nsvx.agenda.select", { calendarId: calendar.id, selected: !calendar.selected })
      .catch(() => undefined);
    await Promise.all([calendars.refresh(), events.refresh()]);
  };
  const colors = createMemo(
    () =>
      new Map(
        (calendars.state().data ?? []).map((calendar) => [calendar.calendar_id, calendar.color]),
      ),
  );
  const label = () =>
    mode() === "day"
      ? dayText(props.locale, anchor(), { weekday: "long", day: "numeric", month: "long" })
      : `${dayText(props.locale, range.first, { day: "numeric", month: "short" })} – ${dayText(
          props.locale,
          addDays(range.first, 6),
          { day: "numeric", month: "short", year: "numeric" },
        )}`;
  const changed = () => void events.refresh();
  return (
    <Show
      when={!props.open && !creating()}
      fallback={
        <Show
          when={props.open}
          fallback={
            <Editor
              host={props.host}
              t={props.t}
              locale={props.locale}
              day={anchor()}
              onClose={() => setCreating(false)}
              onDone={() => {
                setCreating(false);
                changed();
              }}
            />
          }
        >
          {(refId) => (
            <For each={[refId()]} keyed={(key) => key}>
              {(key) => (
                <Detail
                  host={props.host}
                  t={props.t}
                  locale={props.locale}
                  refId={key()}
                  onClose={() => props.onOpen(undefined)}
                  onChanged={changed}
                />
              )}
            </For>
          )}
        </Show>
      }
    >
      <div class="nsvx-agenda">
        <div class="nsvx-agenda__bar">
          <span class="nsvx-agenda__nav">
            <button
              type="button"
              class="nsvx__button nsvx__button--icon"
              aria-label={props.t("previous")}
              title={props.t("previous")}
              onClick={() => step(-1)}
            >
              <Glyph name="prev" />
            </button>
            <button type="button" class="nsvx__button" onClick={() => show(mode(), today)}>
              {props.t("todayShort")}
            </button>
            <button
              type="button"
              class="nsvx__button nsvx__button--icon"
              aria-label={props.t("next")}
              title={props.t("next")}
              onClick={() => step(1)}
            >
              <Glyph name="next" />
            </button>
          </span>
          <strong class="nsvx-agenda__label">{label()}</strong>
          <span class="nsvx-segmented" role="group" aria-label={props.t("view")}>
            <For each={["day", "week"] as Mode[]}>
              {(id) => (
                <button
                  type="button"
                  class={["nsvx-segmented__item", { "nsvx-segmented__item--on": mode() === id }]}
                  aria-pressed={mode() === id ? "true" : "false"}
                  onClick={() => show(id, anchor())}
                >
                  {props.t(id === "day" ? "dayView" : "weekView")}
                </button>
              )}
            </For>
          </span>
          <span class="nsvx-agenda__tools">
            <button
              type="button"
              class="nsvx__button nsvx__button--icon"
              aria-label={props.t("summary")}
              title={props.t("summary")}
              onClick={() => void summarize()}
            >
              <Glyph name="spark" />
            </button>
            <button
              type="button"
              class={["nsvx__button nsvx__button--icon", { "nsvx-spin": live() === "busy" }]}
              aria-label={props.t("syncNow")}
              title={props.t("syncNow")}
              disabled={live() === "busy"}
              onClick={() => void readLive()}
            >
              <Glyph name="live" />
            </button>
            <button
              type="button"
              class="nsvx__button nsvx__button--primary"
              disabled={!props.host.connection.canWrite}
              onClick={() => setCreating(true)}
            >
              <Glyph name="plus" />
              <span class="nsvx__tab-label">{props.t("newEvent")}</span>
            </button>
          </span>
        </div>
        <Show when={(calendars.state().data ?? []).length > 0}>
          <div class="nsvx-chips" role="group" aria-label={props.t("calendars")}>
            <For each={calendars.state().data ?? []} keyed={(calendar) => calendar.id}>
              {(calendar) => (
                <button
                  type="button"
                  class={["nsvx-chip", { "nsvx-chip--on": calendar().selected }]}
                  aria-pressed={calendar().selected ? "true" : "false"}
                  title={calendar().account}
                  disabled={!props.host.connection.canWrite}
                  style={{ "--nsvx-event-color": calendar().color ?? "var(--primary)" }}
                  onClick={() => void toggleCalendar(calendar())}
                >
                  <span class="nsvx-chip__swatch" aria-hidden="true" />
                  {calendar().summary ?? calendar().account}
                  <Show when={calendar().last_error}>
                    <span class="nsvx-reply nsvx-reply--bad" aria-label={props.t("error")}>
                      !
                    </span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </Show>
        <Show when={summary()}>
          {(shown) => (
            <p class="nsvx-agenda__summary" role="status">
              <Glyph name="spark" />
              <span>{shown().text ?? props.t("noSummary")}</span>
            </p>
          )}
        </Show>
        <SourceView source={events} t={props.t}>
          {(data) => {
            const days = createMemo(() =>
              groupByDay(
                data().events.filter((event) =>
                  matches(props.query, event.summary, event.location),
                ),
                range.first,
                range.days,
                ZONE,
              ),
            );
            return (
              <>
                <p class="nsvx-agenda__fresh">
                  <Show when={live() === "error" || data().errors.length > 0}>
                    <span class="nsvx-reply nsvx-reply--bad" aria-hidden="true">
                      !
                    </span>
                    {props.t("syncFailed")}
                    {" · "}
                  </Show>
                  <Show when={data().fresh_at}>
                    {(fresh) => (
                      <span>
                        {props.t("synced")} {age(fresh())}
                      </span>
                    )}
                  </Show>
                </p>
                <div class={["nsvx-days", `nsvx-days--${mode()}`]}>
                  <For each={days()} keyed={(entry) => entry.day}>
                    {(entry) => (
                      <section
                        class={["nsvx-day", { "nsvx-day--today": entry().day === today }]}
                        aria-label={dayText(props.locale, entry().day, {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}
                      >
                        <Show when={mode() === "week"}>
                          <header class="nsvx-day__head">
                            <span>{dayText(props.locale, entry().day, { weekday: "short" })}</span>
                            <strong>
                              {dayText(props.locale, entry().day, { day: "numeric" })}
                            </strong>
                          </header>
                        </Show>
                        <div class="nsvx-day__events">
                          <For each={entry().events} keyed={(event) => event.event_id}>
                            {(event) => (
                              <EventCard
                                event={event()}
                                color={colors().get(event().calendar_id ?? "") ?? undefined}
                                compact={mode() === "week"}
                                locale={props.locale}
                                t={props.t}
                                onOpen={() => props.onOpen(event().id ?? event().event_id)}
                              />
                            )}
                          </For>
                          <Show when={entry().events.length === 0}>
                            <span class="nsvx-day__empty" aria-label={props.t("free")}>
                              —
                            </span>
                          </Show>
                        </div>
                      </section>
                    )}
                  </For>
                </div>
              </>
            );
          }}
        </SourceView>
      </div>
    </Show>
  );
}
