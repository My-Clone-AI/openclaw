/** NSVX Agenda (`/api/workspace`) shapes and the pure rules the Agenda tab, Gateway, and chat tool share. Browser-safe. */

export type AgendaAttendee = {
  email: string;
  response: string | null;
  organizer: boolean;
  self: boolean;
  optional: boolean;
  name: string | null;
};

export type AgendaEvent = {
  id: string | null;
  calendar_id: string | null;
  event_id: string;
  etag: string | null;
  status: string | null;
  summary: string;
  location: string | null;
  description: string | null;
  start: string | null;
  end: string | null;
  start_date: string | null;
  end_date: string | null;
  all_day: boolean;
  time_zone: string | null;
  organizer: string | null;
  attendees: AgendaAttendee[];
  self_response: string | null;
  meet_url: string | null;
  recurring: boolean;
  can_edit: boolean;
};

export type AgendaEvents = {
  events: AgendaEvent[];
  fresh_at: string | null;
  errors: { code?: string; message: string }[];
};

export type AgendaCalendar = {
  id: string;
  calendar_id: string;
  summary: string | null;
  account: string;
  primary: boolean;
  selected: boolean;
  color: string | null;
  sync_state: string | null;
  last_error: string | null;
};

export type AgendaIntent = {
  id: string;
  operation: string;
  state: string;
  lifecycle_label: string;
  error: string | null;
};

export type AgendaEventDetail = {
  event: AgendaEvent;
  meeting: { status: "scheduled" | "in_progress" | "ended" | "no_record"; participants: string[] };
  intents: (AgendaIntent & { summary?: string | null })[];
};

export type AgendaSlots = {
  slots: { start: string; end: string; unverified_for: string[] }[];
  availability_complete: boolean;
  unverified: string[];
};

export type AgendaPreview = {
  operation: AgendaOperation;
  effect: "private" | "external";
  summary: string;
  account: string;
  terms_hash: string;
  needs_confirmation: boolean;
};

/** Only these NSVX workspace operations are reachable from OpenClaw; mail, Chat, Docs, and Tasks are other families. */
export const AGENDA_OPERATIONS = [
  "calendar.create_event",
  "calendar.update_event",
  "calendar.cancel_event",
] as const;
export type AgendaOperation = (typeof AGENDA_OPERATIONS)[number];

/** NSVX settles an intent in one of these states; anything else is still in flight. */
export const SETTLED_INTENT_STATES = ["accepted", "failed", "blocked", "cancelled"] as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
/** NSVX refuses windows longer than this. */
export const MAX_WINDOW_DAYS = 62;

export function isDay(value: unknown): value is string {
  return typeof value === "string" && DAY.test(value) && !Number.isNaN(Date.parse(value));
}

export function addDays(day: string, count: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

/** Monday of the week holding `day`. */
export function weekStart(day: string): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

/** The calendar day of `at` in `zone`, as YYYY-MM-DD. */
export function dayIn(at: Date, zone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

function offsetMinutes(at: Date, zone: string): number {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  return match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : 0;
}

/** Wall-clock `day` `time` in `zone` as an ISO instant with its offset (as NSVX's own editor sends it). */
export function zonedIso(day: string, time: string, zone: string): string {
  const guess = new Date(`${day}T${time}:00Z`);
  let offset = offsetMinutes(guess, zone);
  offset = offsetMinutes(new Date(guess.getTime() - offset * 60_000), zone);
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const minutes = String(abs % 60).padStart(2, "0");
  return `${day}T${time}:00${sign}${hours}:${minutes}`;
}

/** The NSVX events query for `days` days from `first`, in `zone`. */
export function eventsWindow(first: string, days: number, zone: string) {
  return {
    start: zonedIso(first, "00:00", zone),
    end: zonedIso(addDays(first, days), "00:00", zone),
    tz: zone,
  };
}

/** The day an event starts on in `zone`; all-day events keep their own date. */
export function eventDay(event: AgendaEvent, zone: string): string {
  if (event.start) {
    return dayIn(new Date(event.start), zone);
  }
  return event.start_date ?? "";
}

/** Events per day for `days` days from `first`; an event spanning days shows on each one. */
export function groupByDay(events: AgendaEvent[], first: string, days: number, zone: string) {
  const keys = Array.from({ length: days }, (_, index) => addDays(first, index));
  const byDay = new Map(keys.map((key) => [key, [] as AgendaEvent[]]));
  for (const event of events) {
    const startDay = eventDay(event, zone);
    const lastDay = event.end
      ? dayIn(new Date(Date.parse(event.end) - 1), zone)
      : event.end_date
        ? addDays(event.end_date, -1)
        : startDay;
    for (const key of keys) {
      if (key >= startDay && key <= lastDay) {
        byDay.get(key)?.push(event);
      }
    }
  }
  return keys.map((day) => ({ day, events: byDay.get(day) ?? [] }));
}

/** Timed events that overlap `start`..`end`, ignoring the event being edited. */
export function overlapping(
  events: AgendaEvent[],
  start: string,
  end: string,
  except?: string | null,
): AgendaEvent[] {
  const from = Date.parse(start);
  const to = Date.parse(end);
  return events.filter(
    (event) =>
      event.event_id !== except &&
      !event.all_day &&
      event.start !== null &&
      event.end !== null &&
      Date.parse(event.start) < to &&
      Date.parse(event.end) > from,
  );
}

export function splitEmails(text: string): { valid: string[]; invalid: string[] } {
  const parts = text
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const unique = [...new Set(parts.map((part) => part.toLowerCase()))];
  return {
    valid: unique.filter((part) => EMAIL.test(part)),
    invalid: unique.filter((part) => !EMAIL.test(part)),
  };
}

export type AgendaDraft = {
  title: string;
  day: string;
  time: string;
  durationMin: number;
  allDay: boolean;
  zone: string;
  guests: string[];
  meet: boolean;
  notify: boolean;
  location: string;
};

/** The NSVX create or update request for a draft, built exactly like NSVX's own editor builds it. */
export function draftOperation(
  draft: AgendaDraft,
  existing?: Pick<AgendaEvent, "event_id" | "calendar_id" | "etag">,
): { operation: AgendaOperation; payload: Record<string, unknown> } {
  if (!draft.title.trim()) {
    throw new Error("A title is required.");
  }
  if (!isDay(draft.day) || (!draft.allDay && !TIME.test(draft.time))) {
    throw new Error("Pick a day and time.");
  }
  const start = draft.allDay ? draft.day : zonedIso(draft.day, draft.time, draft.zone);
  const location = draft.location.trim() || undefined;
  if (existing) {
    return {
      operation: "calendar.update_event",
      payload: {
        event_id: existing.event_id,
        calendar_id: existing.calendar_id,
        etag: existing.etag,
        changes: {
          summary: draft.title.trim(),
          location,
          start,
          time_zone: draft.zone,
          all_day: draft.allDay,
          ...(draft.allDay ? {} : { duration_min: draft.durationMin }),
          attendees: draft.guests,
        },
        send_updates: draft.notify ? "all" : "none",
        has_guests: draft.guests.length > 0,
        scope: "this",
      },
    };
  }
  return {
    operation: "calendar.create_event",
    payload: {
      summary: draft.title.trim(),
      start,
      time_zone: draft.zone,
      all_day: draft.allDay,
      duration_min: draft.allDay ? undefined : draft.durationMin,
      attendees: draft.guests,
      create_meet: draft.meet,
      send_updates: draft.guests.length > 0 && draft.notify ? "all" : "none",
      location,
    },
  };
}

export function cancelOperation(
  event: Pick<AgendaEvent, "event_id" | "calendar_id" | "etag">,
  guests: number,
  notify: boolean,
): { operation: AgendaOperation; payload: Record<string, unknown> } {
  return {
    operation: "calendar.cancel_event",
    payload: {
      event_id: event.event_id,
      calendar_id: event.calendar_id,
      etag: event.etag,
      send_updates: guests > 0 && notify ? "all" : "none",
      has_guests: guests > 0,
    },
  };
}

/** Compact event for chat answers: no descriptions, guest addresses only by count and own reply. */
export function chatEvent(event: AgendaEvent) {
  return {
    ref: event.id ?? event.event_id,
    title: event.summary,
    start: event.start ?? event.start_date,
    end: event.end ?? event.end_date,
    allDay: event.all_day,
    location: event.location,
    meet: event.meet_url !== null,
    guests: event.attendees.filter((attendee) => !attendee.self).length,
    myReply: event.self_response,
    recurring: event.recurring,
  };
}
