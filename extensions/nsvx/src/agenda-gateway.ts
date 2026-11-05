import {
  addDays,
  AGENDA_OPERATIONS,
  isDay,
  MAX_WINDOW_DAYS,
  type AgendaOperation,
} from "./agenda-data.js";
import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";

const ZONE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$|^UTC$/;

export function zoneOf(value: unknown): string {
  if (typeof value !== "string" || !ZONE.test(value)) {
    throw new NsvxError("invalid", "tz must be a time zone name.");
  }
  return value;
}

function isoOf(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length > 40 || Number.isNaN(Date.parse(value))) {
    throw new NsvxError("invalid", `${name} must be a date and time.`);
  }
  return value;
}

/** Checks a chat or page range before it reaches NSVX; defaults to the next seven days. */
export function agendaRange(params: { start?: unknown; end?: unknown }, today: string) {
  const start = params.start === undefined || params.start === "" ? today : params.start;
  if (!isDay(start)) {
    throw new NsvxError("invalid", "start must be a day, YYYY-MM-DD.");
  }
  const end = params.end === undefined || params.end === "" ? addDays(start, 6) : params.end;
  if (!isDay(end) || end < start) {
    throw new NsvxError("invalid", "end must be a day on or after start.");
  }
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  if (days > MAX_WINDOW_DAYS) {
    throw new NsvxError("invalid", `Pick at most ${MAX_WINDOW_DAYS} days.`);
  }
  return { start, days };
}

/** Validates a page request for the NSVX preview and action routes; only calendar changes pass. */
export function agendaAction(params: Record<string, unknown>) {
  const operation = params.operation;
  if (!AGENDA_OPERATIONS.includes(operation as AgendaOperation)) {
    throw new NsvxError("invalid", "Only calendar changes are allowed here.");
  }
  const payload = params.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new NsvxError("invalid", "payload is required.");
  }
  const text = (name: string) => {
    const value = params[name];
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== "string" || !value || value.length > 200) {
      throw new NsvxError("invalid", `${name} must be short text.`);
    }
    return value;
  };
  return {
    operation: operation as AgendaOperation,
    payload: payload as Record<string, unknown>,
    terms_hash: text("termsHash"),
    client_key: text("clientKey"),
  };
}

/**
 * Agenda requests the page sends with POST. Reads (`events`, one `event`, calendars, intents) go through `nsvx.view`
 * like every owner screen; these add the NSVX routes that take a body.
 */
export const agendaRequests = {
  slots(client: NsvxClient, params: Record<string, unknown>) {
    const duration = Number(params.durationMin ?? 60);
    if (!Number.isInteger(duration) || duration < 15 || duration > 480) {
      throw new NsvxError("invalid", "durationMin must be 15 to 480.");
    }
    const attendees = params.attendees ?? [];
    if (
      !Array.isArray(attendees) ||
      attendees.length > 50 ||
      attendees.some((email) => typeof email !== "string" || email.length > 200)
    ) {
      throw new NsvxError("invalid", "attendees must be a short list of emails.");
    }
    return client.postOwner("agendaSlots", {
      start: isoOf(params.start, "start"),
      end: isoOf(params.end, "end"),
      duration_min: duration,
      attendees,
      time_zone: zoneOf(params.tz),
    });
  },
  summary(client: NsvxClient, params: Record<string, unknown>) {
    return client.postOwner("agendaSummary", {
      start: isoOf(params.start, "start"),
      end: isoOf(params.end, "end"),
    });
  },
  select(client: NsvxClient, params: Record<string, unknown>) {
    if (typeof params.selected !== "boolean" || typeof params.calendarId !== "string") {
      throw new NsvxError("invalid", "calendarId and selected are required.");
    }
    return client.postOwner("agendaSelect", { selected: params.selected }, params.calendarId);
  },
  preview(client: NsvxClient, params: Record<string, unknown>) {
    const { operation, payload } = agendaAction(params);
    return client.postOwner("agendaPreview", { operation, payload });
  },
  act(client: NsvxClient, params: Record<string, unknown>) {
    const action = agendaAction(params);
    // NSVX runs an external change only with the hash of the terms the owner saw; the key makes a retry a replay.
    if (!action.terms_hash || !action.client_key) {
      throw new NsvxError("invalid", "Review the change first.");
    }
    return client.postOwner("agendaAct", action);
  },
};
