/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  dayKey,
  draftFrom,
  eventPayload,
  overlapping,
  parseEmails,
  windowFor,
  zonedIso,
  type CalendarEvent,
  type EventDraft,
  type EventsPage,
  type Slots,
} from "./agenda-data.js";
import { ChangeFlow, Glyph, Seg, view, whenText, type Ctx } from "./agenda-ui.js";
import { BrandLogo } from "./messages-ui.js";
import { errorMessage } from "./ui-kit.js";

const LENGTHS = [30, 45, 60, 90];

export function Editor(props: {
  ctx: Ctx;
  day: string;
  existing: CalendarEvent | undefined;
  onClose: (changed: boolean) => void;
}) {
  const { ctx } = props;
  const first: EventDraft = props.existing
    ? draftFrom(props.existing, ctx.zone)
    : {
        title: "",
        day: props.day,
        time: "10:00",
        minutes: 60,
        allDay: false,
        zone: ctx.zone,
        guests: [],
        meet: true,
        notify: true,
        location: "",
      };
  const [draft, setDraft] = createSignal<EventDraft>(first);
  const [guestText, setGuestText] = createSignal(first.guests.join(", "));
  const [slots, setSlots] = createSignal<Slots>();
  const [error, setError] = createSignal<string>();
  const [built, setBuilt] = createSignal<{ operation: string; payload: Record<string, unknown> }>();
  const [dayEvents, setDayEvents] = createSignal<CalendarEvent[]>();
  // One key per editor: a retry after an uncertain answer replays in NSVX instead of booking twice.
  const clientKey = crypto.randomUUID();
  const emails = createMemo(() => parseEmails(guestText()));
  const zones = [
    ...new Set([
      ctx.zone,
      "Europe/Lisbon",
      "Atlantic/Azores",
      "Europe/London",
      "Europe/Madrid",
      "America/New_York",
      "America/Sao_Paulo",
      "UTC",
    ]),
  ];
  let dayLoad = 0;
  const loadDay = async (day: string, zone: string) => {
    const id = ++dayLoad;
    setDayEvents(undefined);
    try {
      const page = await view<EventsPage>(ctx.host, "calendarEvents", {
        ...windowFor(day, 1, zone),
        tz: zone,
      });
      if (id === dayLoad) {
        setDayEvents(page.events);
      }
    } catch {
      if (id === dayLoad) {
        setDayEvents([]);
      }
    }
  };
  void loadDay(first.day, first.zone);
  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => {
    const next = { ...draft(), [key]: value };
    setDraft(next);
    if (key === "day" || key === "zone") {
      void loadDay(next.day, next.zone);
    }
  };
  const conflicts = createMemo(() => {
    const current = draft();
    const events = dayEvents();
    if (current.allDay || !events || !current.day || !current.time) {
      return undefined;
    }
    const startIso = zonedIso(`${current.day}T${current.time}`, current.zone);
    const endIso = new Date(Date.parse(startIso) + current.minutes * 60_000).toISOString();
    return overlapping(events, startIso, endIso, props.existing?.event_id);
  });
  const findSlots = async () => {
    setError(undefined);
    try {
      setSlots(
        await ctx.host.request<Slots>("nsvx.agenda.slots", {
          ...windowFor(draft().day, 3, draft().zone),
          minutes: draft().minutes,
          attendees: emails().valid,
          timeZone: draft().zone,
        }),
      );
    } catch (cause) {
      setError(errorMessage(ctx.host, cause));
    }
  };
  const pickSlot = (iso: string) => {
    const zone = draft().zone;
    const day = dayKey({ start: iso, start_date: null, all_day: false }, zone);
    const time = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
    setDraft({ ...draft(), day, time });
    void loadDay(day, zone);
  };
  const review = () => {
    if (!draft().title.trim()) {
      setError(ctx.at("addTitle"));
      return;
    }
    if (emails().invalid.length > 0) {
      setError(`${ctx.at("badEmails")}: ${emails().invalid.join(", ")}`);
      return;
    }
    setError(undefined);
    setBuilt(eventPayload({ ...draft(), guests: emails().valid }, props.existing));
  };

  return (
    <section class="nsvx-agenda__sheet" aria-label={ctx.at(props.existing ? "change" : "new")}>
      <header class="nsvx-agenda__sheet-head">
        <button
          type="button"
          class="nsvx__button nsvx__button--icon"
          aria-label={ctx.at("back")}
          title={ctx.at("back")}
          onClick={() => (built() ? setBuilt(undefined) : props.onClose(false))}
        >
          <Glyph name="back" />
        </button>
        <BrandLogo channel="googlecalendar" size={24} />
        <h2>{ctx.at(props.existing ? "change" : "new")}</h2>
      </header>
      <Show
        when={built()}
        fallback={
          <div class="nsvx-agenda__form">
            <label class="nsvx-field nsvx-agenda__wide">
              <span>{ctx.at("title")}</span>
              <input
                value={draft().title}
                maxlength={200}
                autofocus
                onInput={(event) => set("title", event.currentTarget.value)}
              />
            </label>
            <label class="nsvx-field">
              <span>{ctx.at("dayField")}</span>
              <input
                type="date"
                value={draft().day}
                onInput={(event) =>
                  event.currentTarget.value && set("day", event.currentTarget.value)
                }
              />
            </label>
            <Show when={!draft().allDay}>
              <label class="nsvx-field">
                <span>{ctx.at("time")}</span>
                <input
                  type="time"
                  step={300}
                  value={draft().time}
                  onInput={(event) =>
                    event.currentTarget.value && set("time", event.currentTarget.value)
                  }
                />
              </label>
            </Show>
            <label class="nsvx-agenda__switch">
              <input
                type="checkbox"
                checked={draft().allDay}
                onChange={(event) => set("allDay", event.currentTarget.checked)}
              />
              <span>{ctx.at("allDay")}</span>
            </label>
            <Show when={!draft().allDay}>
              <div class="nsvx-agenda__wide">
                <Seg
                  items={LENGTHS.map(String)}
                  value={String(draft().minutes)}
                  name={ctx.at("length")}
                  label={(value) => (Number(value) < 60 ? `${value}m` : `${Number(value) / 60}h`)}
                  onChange={(value) => set("minutes", Number(value))}
                />
              </div>
              <p
                class={[
                  "nsvx-agenda__clash nsvx-agenda__wide",
                  { "nsvx-agenda__clash--bad": (conflicts()?.length ?? 0) > 0 },
                ]}
                role="status"
              >
                <Show when={conflicts()}>
                  {(found) => (
                    <>
                      <Glyph name={found().length ? "alert" : "check"} />
                      {found().length
                        ? `${ctx.at("clash")}: ${found()
                            .map((event) => `${event.summary} ${whenText(ctx, event)}`)
                            .join(" · ")}`
                        : ctx.at("noClash")}
                    </>
                  )}
                </Show>
              </p>
            </Show>
            <label class="nsvx-field nsvx-agenda__wide">
              <span>{ctx.at("guests")}</span>
              <input
                inputmode="email"
                autocapitalize="off"
                placeholder={ctx.at("guestsHint")}
                value={guestText()}
                onInput={(event) => setGuestText(event.currentTarget.value)}
              />
            </label>
            <Show when={emails().valid.length > 0}>
              <label class="nsvx-agenda__switch">
                <input
                  type="checkbox"
                  checked={draft().notify}
                  onChange={(event) => set("notify", event.currentTarget.checked)}
                />
                <span>{ctx.at("notify")}</span>
              </label>
            </Show>
            <Show when={!props.existing}>
              <label class="nsvx-agenda__switch">
                <input
                  type="checkbox"
                  checked={draft().meet}
                  onChange={(event) => set("meet", event.currentTarget.checked)}
                />
                <BrandLogo channel="googlemeet" size={18} />
                <span>{ctx.at("meet")}</span>
              </label>
            </Show>
            <label class="nsvx-field">
              <span>{ctx.at("place")}</span>
              <input
                value={draft().location}
                maxlength={300}
                onInput={(event) => set("location", event.currentTarget.value)}
              />
            </label>
            <label class="nsvx-field">
              <span>{ctx.at("zone")}</span>
              <select onChange={(event) => set("zone", event.currentTarget.value)}>
                <For each={zones}>
                  {(zone) => (
                    <option value={zone} selected={zone === draft().zone}>
                      {zone.replace(/_/g, " ")}
                    </option>
                  )}
                </For>
              </select>
            </label>
            <Show when={!draft().allDay}>
              <div class="nsvx-agenda__slots nsvx-agenda__wide">
                <button type="button" class="nsvx__button" onClick={() => void findSlots()}>
                  <Glyph name="clock" />
                  <span>{ctx.at("freeTimes")}</span>
                </button>
                <Show when={slots()}>
                  {(found) => (
                    <>
                      <Show when={!found().availability_complete}>
                        <span class="nsvx-agenda__warn-text">
                          <Glyph name="alert" />
                          {ctx.at("notChecked")}: {found().unverified.join(", ")}
                        </span>
                      </Show>
                      <Show
                        when={found().slots.length > 0}
                        fallback={<span class="nsvx__notice">{ctx.at("noFreeTimes")}</span>}
                      >
                        <For each={found().slots} keyed={(slot) => slot.start}>
                          {(slot) => (
                            <button
                              type="button"
                              class="nsvx-agenda__slot"
                              onClick={() => pickSlot(slot().start)}
                            >
                              {new Intl.DateTimeFormat(ctx.host.locale, {
                                timeZone: draft().zone,
                                weekday: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              }).format(new Date(slot().start))}
                            </button>
                          )}
                        </For>
                      </Show>
                    </>
                  )}
                </Show>
              </div>
            </Show>
            <Show when={error()}>
              <p class="nsvx__notice nsvx__notice--bad nsvx-agenda__wide" role="alert">
                {error()}
              </p>
            </Show>
            <div class="nsvx-agenda__actions nsvx-agenda__wide">
              <button
                type="button"
                class="nsvx__button nsvx__button--primary"
                disabled={!ctx.host.connection.canWrite}
                onClick={review}
              >
                <Glyph name="check" />
                <span>{ctx.at("review")}</span>
              </button>
            </div>
          </div>
        }
      >
        {(change) => (
          <ChangeFlow
            ctx={ctx}
            built={change()}
            clientKey={clientKey}
            onBack={() => setBuilt(undefined)}
            onDone={() => props.onClose(true)}
          />
        )}
      </Show>
    </section>
  );
}
