/** @jsxImportSource @solidjs/web */
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  dayIn,
  draftOperation,
  eventDay,
  eventsWindow,
  isDay,
  overlapping,
  splitEmails,
  zonedIso,
  type AgendaDraft,
  type AgendaEvent,
  type AgendaEvents,
  type AgendaSlots,
} from "./agenda-data.js";
import { ChangeReview, dayText, Glyph, timeText, ZONE } from "./agenda-ui.js";
import type { T } from "./ui-kit.js";

const DURATIONS = [30, 60, 90, 120];

export function Editor(props: {
  host: ControlUiHost;
  t: T;
  locale: string;
  day: string;
  existing?: AgendaEvent | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const existing = props.existing;
  const startTime =
    existing?.start && !existing.all_day
      ? new Intl.DateTimeFormat("en-GB", {
          timeZone: ZONE,
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(new Date(existing.start))
      : "10:00";
  const [title, setTitle] = createSignal(existing?.summary ?? "");
  const [day, setDay] = createSignal(existing ? eventDay(existing, ZONE) || props.day : props.day);
  const [time, setTime] = createSignal(startTime);
  const [duration, setDuration] = createSignal(
    existing?.start && existing.end
      ? Math.max(15, Math.round((Date.parse(existing.end) - Date.parse(existing.start)) / 60_000))
      : 60,
  );
  const [allDay, setAllDay] = createSignal(existing?.all_day ?? false);
  const [guests, setGuests] = createSignal(
    existing?.attendees
      .filter((attendee) => !attendee.self)
      .map((attendee) => attendee.email)
      .join(", ") ?? "",
  );
  const [meet, setMeet] = createSignal(!existing);
  const [notify, setNotify] = createSignal(true);
  const [place, setPlace] = createSignal(existing?.location ?? "");
  const [slots, setSlots] = createSignal<AgendaSlots>();
  const [slotsBusy, setSlotsBusy] = createSignal(false);
  const [version, setVersion] = createSignal(0);
  const [dayEvents, setDayEvents] = createSignal<AgendaEvent[]>([]);
  const emails = createMemo(() => splitEmails(guests()));
  // Stored events on the draft day, so a clash shows before any preview.
  const loadDay = async (shown: string) => {
    const answer = await props.host
      .request<AgendaEvents>("nsvx.view", {
        view: "agendaEvents",
        params: eventsWindow(shown, 1, ZONE),
      })
      .catch(() => undefined);
    setDayEvents(answer?.events ?? []);
  };
  void loadDay(day());
  const clashes = createMemo(() => {
    if (allDay() || !isDay(day())) {
      return [];
    }
    const start = Date.parse(zonedIso(day(), time(), ZONE));
    return Number.isNaN(start)
      ? []
      : overlapping(
          dayEvents(),
          new Date(start).toISOString(),
          new Date(start + duration() * 60_000).toISOString(),
          existing?.event_id,
        );
  });
  const touch =
    <V,>(set: (value: V) => void) =>
    (value: V) => {
      set(value);
      setVersion(version() + 1);
    };
  const pickDay = (value: string) => {
    touch(setDay)(value);
    void loadDay(value);
  };
  const draft = (): AgendaDraft => ({
    title: title(),
    day: day(),
    time: time(),
    durationMin: duration(),
    allDay: allDay(),
    zone: ZONE,
    guests: emails().valid,
    meet: meet(),
    notify: notify(),
    location: place(),
  });
  const ready = () => title().trim() !== "" && isDay(day()) && emails().invalid.length === 0;
  const findSlots = async () => {
    setSlotsBusy(true);
    try {
      const window = eventsWindow(day(), 3, ZONE);
      setSlots(
        await props.host.request<AgendaSlots>("nsvx.agenda.slots", {
          start: window.start,
          end: window.end,
          tz: ZONE,
          durationMin: duration(),
          attendees: emails().valid,
        }),
      );
    } catch {
      setSlots({ slots: [], availability_complete: false, unverified: [] });
    } finally {
      setSlotsBusy(false);
    }
  };
  const pickSlot = (iso: string) => {
    const at = new Date(iso);
    const picked = dayIn(at, ZONE);
    setDay(picked);
    void loadDay(picked);
    setTime(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: ZONE,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(at),
    );
    setAllDay(false);
    setVersion(version() + 1);
  };
  return (
    <section class="nsvx-sheet" aria-label={props.t(existing ? "editEvent" : "newEvent")}>
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
        <strong>{props.t(existing ? "editEvent" : "newEvent")}</strong>
      </header>
      <div class="nsvx-form">
        <label class="nsvx-form__wide">
          <span>{props.t("eventTitle")}</span>
          <input
            type="text"
            value={title()}
            maxlength={200}
            autocomplete="off"
            onInput={(event) => touch(setTitle)(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>{props.t("day")}</span>
          <input
            type="date"
            value={day()}
            onInput={(event) => event.currentTarget.value && pickDay(event.currentTarget.value)}
          />
        </label>
        <Show when={!allDay()}>
          <label>
            <span>{props.t("time")}</span>
            <input
              type="time"
              value={time()}
              step={300}
              onInput={(event) =>
                event.currentTarget.value && touch(setTime)(event.currentTarget.value)
              }
            />
          </label>
        </Show>
        <div class="nsvx-form__wide nsvx-chips" role="group" aria-label={props.t("length")}>
          <Show when={!allDay()}>
            <For each={DURATIONS}>
              {(minutes) => (
                <button
                  type="button"
                  class={["nsvx-chip", { "nsvx-chip--on": duration() === minutes }]}
                  aria-pressed={duration() === minutes ? "true" : "false"}
                  onClick={() => touch(setDuration)(minutes)}
                >
                  {minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}
                </button>
              )}
            </For>
          </Show>
          <button
            type="button"
            class={["nsvx-chip", { "nsvx-chip--on": allDay() }]}
            aria-pressed={allDay() ? "true" : "false"}
            onClick={() => touch(setAllDay)(!allDay())}
          >
            {props.t("allDay")}
          </button>
        </div>
        <label class="nsvx-form__wide">
          <span>
            <Glyph name="people" /> {props.t("guests")}
          </span>
          <input
            type="email"
            multiple
            inputmode="email"
            autocomplete="email"
            placeholder="ana@example.com, rui@example.com"
            value={guests()}
            onInput={(event) => touch(setGuests)(event.currentTarget.value)}
          />
        </label>
        <Show when={emails().invalid.length > 0}>
          <p class="nsvx__notice nsvx__notice--bad nsvx-form__wide" role="alert">
            {props.t("badEmail")}: {emails().invalid.join(", ")}
          </p>
        </Show>
        <label class="nsvx-form__wide">
          <span>
            <Glyph name="pin" /> {props.t("place")}
          </span>
          <input
            type="text"
            value={place()}
            maxlength={200}
            onInput={(event) => touch(setPlace)(event.currentTarget.value)}
          />
        </label>
        <div class="nsvx-form__wide nsvx-chips">
          <Show when={!existing}>
            <button
              type="button"
              class={["nsvx-chip", { "nsvx-chip--on": meet() }]}
              aria-pressed={meet() ? "true" : "false"}
              onClick={() => touch(setMeet)(!meet())}
            >
              <Glyph name="video" /> {props.t("meet")}
            </button>
          </Show>
          <Show when={emails().valid.length > 0}>
            <button
              type="button"
              class={["nsvx-chip", { "nsvx-chip--on": notify() }]}
              aria-pressed={notify() ? "true" : "false"}
              onClick={() => touch(setNotify)(!notify())}
            >
              {props.t("notify")}
            </button>
          </Show>
          <button
            type="button"
            class="nsvx-chip"
            disabled={slotsBusy() || allDay()}
            onClick={() => void findSlots()}
          >
            <Glyph name="clock" /> {props.t("freeTimes")}
          </button>
        </div>
        <Show when={slots()}>
          {(found) => (
            <div class="nsvx-form__wide nsvx-chips" role="group" aria-label={props.t("freeTimes")}>
              <For each={found().slots}>
                {(slot) => (
                  <button
                    type="button"
                    class="nsvx-chip nsvx-chip--slot"
                    onClick={() => pickSlot(slot.start)}
                  >
                    {dayText(props.locale, dayIn(new Date(slot.start), ZONE), {
                      weekday: "short",
                      day: "numeric",
                    })}{" "}
                    {timeText(props.locale, slot.start)}
                  </button>
                )}
              </For>
              <Show when={found().slots.length === 0}>
                <span class="nsvx__notice">{props.t("noFreeTimes")}</span>
              </Show>
              <Show when={!found().availability_complete && found().slots.length > 0}>
                <span class="nsvx__notice">{props.t("someUnknown")}</span>
              </Show>
            </div>
          )}
        </Show>
        <Show when={clashes().length > 0}>
          <p class="nsvx__notice nsvx-form__wide" role="status">
            {props.t("clash")}:{" "}
            {clashes()
              .map((event) => event.summary)
              .join(", ")}
          </p>
        </Show>
      </div>
      <Show
        when={ready()}
        fallback={
          <button type="button" class="nsvx__button nsvx__button--primary" disabled>
            {props.t("review")}
          </button>
        }
      >
        {/* A new review per edit: changed terms need a new preview. */}
        <For each={[version()]} keyed={(key) => key}>
          {() => (
            <ChangeReview
              host={props.host}
              t={props.t}
              label={props.t("review")}
              change={() => draftOperation(draft(), existing)}
              onSettled={(intent) => {
                if (intent.state === "accepted") {
                  props.onDone();
                }
              }}
            />
          )}
        </For>
      </Show>
    </section>
  );
}
