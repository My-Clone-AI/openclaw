/**
 * NSVX Agenda (`/agenda`, `backend/clone/google_workspace/api.py`): shapes and date math shared by the Control tab,
 * the Gateway methods, and the chat tool. Field names follow NSVX's `/api/workspace` answers.
 */

export type Attendee = {
  email: string;
  response: string | null;
  organizer: boolean;
  self: boolean;
  optional: boolean;
  name: string | null;
};

export type CalendarEvent = {
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
  attendees: Attendee[];
  self_response: string | null;
  html_link: string | null;
  meet_url: string | null;
  recurring: boolean;
  mission_id: string | null;
  can_edit: boolean;
};

export type EventsPage = {
  events: CalendarEvent[];
  fresh_at: string | null;
  errors: { code: string; message: string; calendar_id?: string }[];
};

export type Calendar = {
  id: string;
  calendar_id: string;
  summary: string | null;
  account: string;
  primary: boolean;
  selected: boolean;
  access_role: string | null;
  color: string | null;
  sync_state: string;
  last_error: string | null;
};

export type WorkspaceStatus = {
  products: { product: string; permission_granted: boolean }[];
  counts: { upcoming: number; uncertain: number };
};

export type Intent = {
  id: string;
  operation: string;
  state: string;
  lifecycle: string;
  lifecycle_label: string;
  error: string | null;
  summary?: string | null;
};

export type MeetingStatus = "scheduled" | "in_progress" | "ended" | "no_record";

export type EventDetail = {
  event: CalendarEvent;
  meeting: {
    status: MeetingStatus;
    participants: string[];
    artifacts: Record<string, string[]>;
    live_media: { reason: string };
  };
  documents: {
    id: string;
    kind: string;
    title: string;
    web_link: string | null;
    sources: number;
  }[];
  intents: Intent[];
  mission: { id: string; title: string; status: string } | null;
};

export type Slots = {
  slots: { start: string; end: string }[];
  availability_complete: boolean;
  unverified: string[];
};

export type Preview = {
  operation: string;
  effect: "private" | "external";
  summary: string;
  account: string;
  terms_hash: string;
};

export const CALENDAR_OPERATIONS = [
  "calendar.create_event",
  "calendar.update_event",
  "calendar.cancel_event",
] as const;
export type CalendarOperation = (typeof CALENDAR_OPERATIONS)[number];

/** The only NSVX workspace operations the Agenda reaches: its event changes and the follow-up email; Chat stays out. */
export const AGENDA_OPERATIONS = [...CALENDAR_OPERATIONS, "gmail.draft", "gmail.send"] as const;
export type AgendaOperation = (typeof AGENDA_OPERATIONS)[number];

/** NSVX's own reminder for an event (`owner_reminders`, kind `calendar`); `target_id` is the event's NSVX id. */
export type Reminder = { target_id: string; label: string; due_at: string };

/** The follow-up email the NSVX Agenda sends from an event: to every guest but the owner, linked to the event. */
export function followUpPayload(
  event: CalendarEvent,
  mail: { subject: string; body: string },
  send: boolean,
) {
  return {
    operation: send ? ("gmail.send" as const) : ("gmail.draft" as const),
    payload: {
      to: event.attendees.filter((attendee) => !attendee.self).map((attendee) => attendee.email),
      subject: mail.subject.trim(),
      body: mail.body,
      ...(event.id ? { event_ref: event.id } : {}),
    },
  };
}

/** NSVX keeps an intent here until Google answers; `unknown` and `in_flight` are never shown as done or failed. */
export const SETTLED_STATES = ["accepted", "failed", "blocked", "cancelled"];

export type MeetingAiKind = "prep" | "agenda" | "reply";
export const REPLY_STANCES = ["neutral", "accept", "decline", "tentative"] as const;

/** `YYYY-MM-DD` of an instant in a zone; all-day events keep their own date. */
export function dayKey(
  event: Pick<CalendarEvent, "start" | "start_date" | "all_day">,
  zone: string,
): string {
  if (event.all_day && event.start_date) {
    return event.start_date;
  }
  if (!event.start) {
    return "";
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(event.start));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function todayKey(zone: string, now = new Date()): string {
  return dayKey({ start: now.toISOString(), start_date: null, all_day: false }, zone);
}

export function addDays(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function addMonths(key: string, months: number): string {
  const date = new Date(`${key.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

/** Monday of the week holding `key`. */
export function weekStart(key: string): string {
  const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
  return addDays(key, -((weekday + 6) % 7));
}

/** The 42 days (six Monday-first weeks) of the month grid around `key`. */
export function monthGrid(key: string): string[] {
  const first = weekStart(`${key.slice(0, 7)}-01`);
  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
}

/** Local wall-clock `YYYY-MM-DDTHH:mm` in a zone, as ISO with that zone's offset at that moment (DST-safe). */
export function zonedIso(local: string, zone: string): string {
  const [day, time = "00:00"] = local.split("T");
  const guess = new Date(`${day}T${time}:00Z`);
  const offsetMinutes = (at: Date) => {
    const name =
      new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
        .formatToParts(at)
        .find((part) => part.type === "timeZoneName")?.value ?? "GMT";
    const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
    return match
      ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0))
      : 0;
  };
  let offset = offsetMinutes(guess);
  offset = offsetMinutes(new Date(guess.getTime() - offset * 60_000));
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${day}T${time}:00${offset < 0 ? "-" : "+"}${hh}:${mm}`;
}

/** The `/api/workspace/events` window: local midnight of `from` through `days` later. */
export function windowFor(from: string, days: number, zone: string) {
  return {
    start: zonedIso(`${from}T00:00`, zone),
    end: zonedIso(`${addDays(from, days)}T00:00`, zone),
  };
}

/** Events on one local day, all-day first; multi-day all-day events show on every day they cover. */
export function eventsOn(events: CalendarEvent[], key: string, zone: string): CalendarEvent[] {
  return events
    .filter((event) => {
      if (event.status === "cancelled") {
        return false;
      }
      if (event.all_day && event.start_date) {
        const end = event.end_date ?? addDays(event.start_date, 1);
        return event.start_date <= key && key < end;
      }
      return dayKey(event, zone) === key;
    })
    .toSorted((a, b) =>
      (a.all_day ? "0" : `1${a.start ?? ""}`).localeCompare(b.all_day ? "0" : `1${b.start ?? ""}`),
    );
}

/** Timed events overlapping [start, end), skipping `excludeId` (the event being changed). */
export function overlapping(
  events: CalendarEvent[],
  start: string,
  end: string,
  excludeId?: string | null,
): CalendarEvent[] {
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) {
    return [];
  }
  return events.filter((event) => {
    if (event.event_id === excludeId || event.all_day || !event.start || !event.end) {
      return false;
    }
    return Date.parse(event.start) < to && Date.parse(event.end) > from;
  });
}

/** Timed events on a day that clash with another one. */
export function clashes(events: CalendarEvent[]): Set<string> {
  const timed = events.filter((event) => !event.all_day && event.start && event.end);
  const out = new Set<string>();
  for (const event of timed) {
    if (overlapping(timed, event.start ?? "", event.end ?? "", event.event_id).length > 0) {
      out.add(event.event_id);
    }
  }
  return out;
}

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export function parseEmails(text: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/).filter(Boolean)) {
    const email = raw.toLowerCase();
    if (!EMAIL.test(email)) {
      invalid.push(raw);
    } else if (!valid.includes(email)) {
      valid.push(email);
    }
  }
  return { valid, invalid };
}

export type EventDraft = {
  title: string;
  day: string;
  time: string;
  minutes: number;
  allDay: boolean;
  zone: string;
  guests: string[];
  meet: boolean;
  notify: boolean;
  location: string;
};

/** The NSVX operation and payload for a new or changed event, as the NSVX Agenda builds them. */
export function eventPayload(
  draft: EventDraft,
  existing?: CalendarEvent,
): { operation: CalendarOperation; payload: Record<string, unknown> } {
  const start = draft.allDay ? draft.day : zonedIso(`${draft.day}T${draft.time}`, draft.zone);
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
          ...(draft.allDay ? {} : { duration_min: draft.minutes }),
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
      ...(draft.allDay ? {} : { duration_min: draft.minutes }),
      attendees: draft.guests,
      create_meet: draft.meet,
      send_updates: draft.guests.length > 0 && draft.notify ? "all" : "none",
      location,
    },
  };
}

export function cancelPayload(event: CalendarEvent, notify: boolean) {
  const guests = event.attendees.some((attendee) => !attendee.self);
  return {
    operation: "calendar.cancel_event" as const,
    payload: {
      event_id: event.event_id,
      calendar_id: event.calendar_id,
      etag: event.etag,
      send_updates: guests && notify ? "all" : "none",
      has_guests: guests,
    },
  };
}

/** A draft that edits `event`, with its own time, zone, and guests. */
export function draftFrom(event: CalendarEvent, zone: string): EventDraft {
  const ownZone = event.time_zone ?? zone;
  const time = event.start
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: ownZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(event.start))
    : "10:00";
  const minutes =
    event.start && event.end
      ? Math.round((Date.parse(event.end) - Date.parse(event.start)) / 60_000)
      : 60;
  return {
    title: event.summary,
    day: dayKey(event, ownZone),
    time,
    minutes,
    allDay: event.all_day,
    zone: ownZone,
    guests: event.attendees.filter((attendee) => !attendee.self).map((attendee) => attendee.email),
    meet: Boolean(event.meet_url),
    notify: true,
    location: event.location ?? "",
  };
}

/** CSV of the shown events, one row per event and day. */
export function eventsCsv(days: [string, CalendarEvent[]][], zone: string): string {
  const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const time = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("en-GB", {
          timeZone: zone,
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(iso))
      : "";
  const rows = [["day", "start", "end", "title", "location", "guests"]];
  for (const [day, events] of days) {
    for (const event of events) {
      rows.push([
        day,
        event.all_day ? "" : time(event.start),
        event.all_day ? "" : time(event.end),
        event.summary,
        event.location ?? "",
        event.attendees
          .filter((attendee) => !attendee.self)
          .map((attendee) => attendee.email)
          .join(" "),
      ]);
    }
  }
  return `${rows.map((row) => row.map(cell).join(",")).join("\n")}\n`;
}
