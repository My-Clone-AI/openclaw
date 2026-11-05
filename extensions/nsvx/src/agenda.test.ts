import { describe, expect, it, vi } from "vitest";
import {
  clashes,
  eventPayload,
  eventsOn,
  monthGrid,
  zonedIso,
  type CalendarEvent,
} from "./agenda-data.js";
import { meetingHelp, selectCalendar, submitChange } from "./agenda.js";
import { createNsvxClient, type NsvxErrorKind } from "./client.js";
import { createNsvxAgendaTool } from "./tools.js";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Call = { method: string; path: string; body?: Record<string, unknown> };

/** A fake NSVX: answers by method and path, records every call. */
function fakeNsvx(routes: Record<string, (call: Call) => Response>) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    const parsed = new URL(url);
    const call: Call = {
      method: init.method ?? "GET",
      path: parsed.pathname + parsed.search,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    };
    calls.push(call);
    const route = routes[`${call.method} ${parsed.pathname}`];
    return route ? route(call) : json(404, { detail: "missing" });
  });
  const client = createNsvxClient({
    baseUrl: "https://nsvx.test",
    token: undefined,
    ownerSession: "session-1",
    fetchImpl,
  });
  return { client, calls };
}

const signedIn = () => json(200, { authenticated: true, csrf: "csrf-1" });

async function kindOf(run: Promise<unknown>): Promise<NsvxErrorKind | undefined> {
  return run.then(
    () => undefined,
    (cause: unknown) => (cause as { kind: NsvxErrorKind }).kind,
  );
}

const event = (overrides: Partial<CalendarEvent>): CalendarEvent => ({
  id: "e1",
  calendar_id: "primary",
  event_id: "g1",
  etag: '"1"',
  status: "confirmed",
  summary: "Event",
  location: null,
  description: null,
  start: null,
  end: null,
  start_date: null,
  end_date: null,
  all_day: false,
  time_zone: "Europe/Lisbon",
  organizer: "me@example.com",
  attendees: [],
  self_response: null,
  html_link: null,
  meet_url: null,
  recurring: false,
  mission_id: null,
  can_edit: true,
  ...overrides,
});

describe("agenda data", () => {
  it("builds zone offsets across daylight-saving changes", () => {
    expect(zonedIso("2026-07-01T10:00", "Europe/Lisbon")).toBe("2026-07-01T10:00:00+01:00");
    expect(zonedIso("2026-12-01T10:00", "Europe/Lisbon")).toBe("2026-12-01T10:00:00+00:00");
    expect(zonedIso("2026-12-01T10:00", "America/New_York")).toBe("2026-12-01T10:00:00-05:00");
  });

  it("puts multi-day all-day events on each day and flags clashing timed events", () => {
    const trip = event({
      event_id: "trip",
      all_day: true,
      start_date: "2026-11-02",
      end_date: "2026-11-04",
    });
    const a = event({ event_id: "a", start: "2026-11-03T09:00:00Z", end: "2026-11-03T10:00:00Z" });
    const b = event({ event_id: "b", start: "2026-11-03T09:30:00Z", end: "2026-11-03T11:00:00Z" });
    const c = event({ event_id: "c", start: "2026-11-03T11:00:00Z", end: "2026-11-03T12:00:00Z" });
    const day = eventsOn([c, b, a, trip], "2026-11-03", "UTC");
    expect(day.map((item) => item.event_id)).toEqual(["trip", "a", "b", "c"]);
    expect(eventsOn([trip], "2026-11-04", "UTC")).toEqual([]);
    expect([...clashes(day)].toSorted()).toEqual(["a", "b"]);
  });

  it("starts the month grid on a Monday and spans six weeks", () => {
    const grid = monthGrid("2026-11-15");
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-10-26");
    expect(grid).toContain("2026-11-30");
  });

  it("builds the NSVX create and update payloads", () => {
    const draft = {
      title: " Review ",
      day: "2026-11-10",
      time: "09:30",
      minutes: 45,
      allDay: false,
      zone: "Europe/Lisbon",
      guests: ["ana@example.com"],
      meet: true,
      notify: false,
      location: "",
    };
    expect(eventPayload(draft)).toEqual({
      operation: "calendar.create_event",
      payload: {
        summary: "Review",
        start: "2026-11-10T09:30:00+00:00",
        time_zone: "Europe/Lisbon",
        all_day: false,
        duration_min: 45,
        attendees: ["ana@example.com"],
        create_meet: true,
        send_updates: "none",
        location: undefined,
      },
    });
    const changed = eventPayload({ ...draft, notify: true }, event({}));
    expect(changed.operation).toBe("calendar.update_event");
    expect(changed.payload).toMatchObject({
      event_id: "g1",
      etag: '"1"',
      send_updates: "all",
      has_guests: true,
      scope: "this",
    });
  });
});

describe("agenda gateway operations", () => {
  it("submits only calendar operations, with the preview's hash and the caller's key", async () => {
    const { client, calls } = fakeNsvx({
      "GET /api/auth/state": signedIn,
      "POST /api/workspace/actions": () => json(200, { id: "i1", state: "pending" }),
    });
    const hash = "a".repeat(64);
    await submitChange(client, {
      operation: "calendar.cancel_event",
      payload: { event_id: "g1" },
      termsHash: hash,
      clientKey: "key-1",
    });
    expect(calls.at(-1)).toEqual({
      method: "POST",
      path: "/api/workspace/actions",
      body: {
        operation: "calendar.cancel_event",
        payload: { event_id: "g1" },
        terms_hash: hash,
        client_key: "key-1",
      },
    });
    const before = calls.length;
    expect(
      await kindOf(
        submitChange(client, { operation: "gmail.send", payload: {}, clientKey: "key-2" }),
      ),
    ).toBe("invalid");
    expect(
      await kindOf(
        submitChange(client, {
          operation: "calendar.create_event",
          payload: {},
          termsHash: "nope",
          clientKey: "key-3",
        }),
      ),
    ).toBe("invalid");
    expect(calls).toHaveLength(before);
  });

  it("reaches the event's own help and calendar routes", async () => {
    const { client, calls } = fakeNsvx({
      "GET /api/auth/state": signedIn,
      "POST /api/workspace/events/e1/reply-draft": () => json(200, { text: "Yes, see you." }),
      "POST /api/workspace/calendars/c1/select": () => json(200, { ok: true }),
    });
    expect(await meetingHelp(client, { eventId: "e1", kind: "reply", stance: "accept" })).toEqual({
      text: "Yes, see you.",
    });
    expect(calls.at(-1)?.body).toEqual({ stance: "accept" });
    await selectCalendar(client, { calendarId: "c1", selected: false });
    expect(calls.at(-1)).toMatchObject({
      path: "/api/workspace/calendars/c1/select",
      body: { selected: false },
    });
    expect(await kindOf(meetingHelp(client, { eventId: "e1", kind: "send" }))).toBe("invalid");
  });
});

describe("nsvx_agenda", () => {
  const preview = (effect: "private" | "external") => () =>
    json(200, {
      operation: "calendar.create_event",
      effect,
      summary: "Criar «Dentist»",
      account: "me@example.com",
      terms_hash: "b".repeat(64),
    });

  it("books a private event once, keyed by the tool call", async () => {
    const { client, calls } = fakeNsvx({
      "GET /api/auth/state": signedIn,
      "POST /api/workspace/preview": preview("private"),
      "POST /api/workspace/actions": () =>
        json(200, { id: "i1", state: "pending", lifecycle_label: "Na fila" }),
    });
    const tool = createNsvxAgendaTool(client, { senderIsOwner: true });
    const result = await tool.execute("call-7", {
      action: "book",
      title: "Dentist",
      from: "2026-11-10",
      time: "15:00",
      minutes: 30,
    });
    expect(result.details).toMatchObject({ ok: true, state: "pending" });
    const submitted = calls.find((call) => call.path === "/api/workspace/actions");
    expect(submitted?.body).toMatchObject({
      operation: "calendar.create_event",
      client_key: "openclaw-call-7",
      terms_hash: "b".repeat(64),
    });
  });

  it("never invites guests from chat and refuses other senders", async () => {
    const { client, calls } = fakeNsvx({
      "GET /api/auth/state": signedIn,
      "POST /api/workspace/preview": preview("external"),
    });
    const tool = createNsvxAgendaTool(client, { senderIsOwner: true });
    const result = await tool.execute("call-8", {
      action: "book",
      title: "Dentist",
      from: "2026-11-10",
      time: "15:00",
      attendees: ["ana@example.com"],
    });
    expect(result.details).toMatchObject({ ok: false, needsOwner: true });
    expect(calls.some((call) => call.path === "/api/workspace/actions")).toBe(false);

    const stranger = createNsvxAgendaTool(client, { senderIsOwner: false });
    const before = calls.length;
    expect(JSON.stringify(await stranger.execute("call-9", { action: "events" }))).toContain(
      "denied",
    );
    expect(calls).toHaveLength(before);
  });
});
