import {
  CALENDAR_OPERATIONS,
  REPLY_STANCES,
  type CalendarOperation,
  type Intent,
  type MeetingAiKind,
  type Preview,
  type Slots,
} from "./agenda-data.js";
import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";

const ID = /^[\w@.:-]{1,200}$/;
const ZONE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$/;

function id(value: unknown, name: string): string {
  if (typeof value !== "string" || !ID.test(value)) {
    throw new NsvxError("invalid", `${name} is required.`);
  }
  return value;
}

function instant(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length > 40 || Number.isNaN(Date.parse(value))) {
    throw new NsvxError("invalid", `${name} must be a date and time.`);
  }
  return value;
}

function zone(value: unknown): string {
  if (value === undefined) {
    return "Europe/Lisbon";
  }
  if (typeof value !== "string" || !ZONE.test(value)) {
    throw new NsvxError("invalid", "timeZone must be a zone such as Europe/Lisbon.");
  }
  return value;
}

function operation(value: unknown): CalendarOperation {
  if (!CALENDAR_OPERATIONS.includes(value as CalendarOperation)) {
    throw new NsvxError("invalid", `operation must be one of ${CALENDAR_OPERATIONS.join(", ")}.`);
  }
  return value as CalendarOperation;
}

/** NSVX validates the payload itself; this only bounds what crosses the socket. */
function payload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NsvxError("invalid", "payload is required.");
  }
  if (JSON.stringify(value).length > 20_000) {
    throw new NsvxError("invalid", "payload is too large.");
  }
  return value as Record<string, unknown>;
}

/** The day's AI highlight over the same events NSVX shows; `text` is null when nothing is ahead. */
export async function agendaSummary(client: NsvxClient, params: Record<string, unknown>) {
  return client.readOwnerPost<{ text: string | null }>("agendaSummary", {
    start: instant(params.start, "start"),
    end: instant(params.end, "end"),
  });
}

/** Free times for the owner and any guests NSVX can see; `unverified` lists who it could not check. */
export async function freeSlots(client: NsvxClient, params: Record<string, unknown>) {
  const minutes = Number(params.minutes ?? 60);
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 480) {
    throw new NsvxError("invalid", "minutes must be 15 to 480.");
  }
  const attendees = params.attendees ?? [];
  if (
    !Array.isArray(attendees) ||
    attendees.length > 50 ||
    attendees.some((email) => typeof email !== "string" || email.length > 320)
  ) {
    throw new NsvxError("invalid", "attendees must be email addresses.");
  }
  return client.readOwnerPost<Slots>("freeSlots", {
    start: instant(params.start, "start"),
    end: instant(params.end, "end"),
    duration_min: minutes,
    attendees,
    time_zone: zone(params.timeZone),
  });
}

/** The exact terms NSVX will run; an `external` effect means Google tells the guests. Changes nothing. */
export async function previewChange(client: NsvxClient, params: Record<string, unknown>) {
  return client.readOwnerPost<Preview>("calendarPreview", {
    operation: operation(params.operation),
    payload: payload(params.payload),
  });
}

/**
 * Runs a previewed change. NSVX refuses an external effect whose terms changed since the preview, and dedupes on
 * `clientKey`: a caller that saw an uncertain result repeats with the same key and never invites twice.
 */
export async function submitChange(client: NsvxClient, params: Record<string, unknown>) {
  const termsHash = params.termsHash;
  if (
    termsHash !== undefined &&
    (typeof termsHash !== "string" || !/^[0-9a-f]{64}$/.test(termsHash))
  ) {
    throw new NsvxError("invalid", "termsHash must come from a preview.");
  }
  return client.writeOwner<Intent>("calendarAction", undefined, {
    operation: operation(params.operation),
    payload: payload(params.payload),
    terms_hash: termsHash ?? null,
    client_key: id(params.clientKey, "clientKey"),
  });
}

/** Shows or hides one calendar; NSVX syncs it again when shown. */
export async function selectCalendar(client: NsvxClient, params: Record<string, unknown>) {
  if (typeof params.selected !== "boolean") {
    throw new NsvxError("invalid", "selected must be true or false.");
  }
  return client.writeOwner<{ ok: boolean }>("calendarSelect", id(params.calendarId, "calendarId"), {
    selected: params.selected,
  });
}

const AI_VIEWS = { prep: "meetingPrep", agenda: "meetingAgenda", reply: "inviteReply" } as const;

/** clone's written help for one event: meeting prep, an agenda draft, or an invitation reply. Nothing is sent. */
export async function meetingHelp(client: NsvxClient, params: Record<string, unknown>) {
  const kind = params.kind as MeetingAiKind;
  if (!Object.hasOwn(AI_VIEWS, kind)) {
    throw new NsvxError("invalid", "kind must be prep, agenda, or reply.");
  }
  const stance = params.stance ?? "neutral";
  if (kind === "reply" && !REPLY_STANCES.includes(stance as never)) {
    throw new NsvxError("invalid", `stance must be one of ${REPLY_STANCES.join(", ")}.`);
  }
  return client.readOwnerPost<{ text: string | null }>(
    AI_VIEWS[kind],
    kind === "reply" ? { stance } : {},
    id(params.eventId, "eventId"),
  );
}

/** Asks NSVX to check Meet again, or to write the event's agenda or minutes into the owner's Google Docs. */
export async function meetingFollowUp(client: NsvxClient, params: Record<string, unknown>) {
  const eventId = id(params.eventId, "eventId");
  switch (params.action) {
    case "refresh":
      return client.writeOwner<{ queued: boolean }>("meetingRefresh", eventId, {});
    case "agenda":
    case "minutes":
      return client.writeOwner<{ queued: boolean }>("meetingDocument", undefined, {
        event_id: eventId,
        kind: params.action,
      });
    default:
      throw new NsvxError("invalid", "action must be refresh, agenda, or minutes.");
  }
}
