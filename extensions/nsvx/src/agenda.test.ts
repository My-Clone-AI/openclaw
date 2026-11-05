import { describe, expect, it, vi } from "vitest";
import {
  cancelOperation,
  draftOperation,
  groupByDay,
  overlapping,
  splitEmails,
  weekStart,
  zonedIso,
  type AgendaEvent,
} from "./agenda-data.js";
import { agendaRange, agendaRequests } from "./agenda-gateway.js";
import { createNsvxAgendaTool } from "./agenda-tools.js";
import { createNsvxClient, type NsvxErrorKind } from "./client.js";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function ownerClient(fetchImpl: (url: string, init: RequestInit) => Promise<Response>) {
  return createNsvxClient({
    baseUrl: "https://nsvx.test",
    token: undefined,
    ownerSession: "owner-cookie",
    fetchImpl,
  });
}

async function kindOf(run: Promise<unknown> | (() => unknown)): Promise<NsvxErrorKind | undefined> {
  try {
    await (typeof run === "function" ? run() : run);
    return undefined;
  } catch (cause) {
    return (cause as { kind: NsvxErrorKind }).kind;
  }
}

function event(overrides: Partial<AgendaEvent>): AgendaEvent {
  return {
    id: "1",
    calendar_id: "primary",
    event_id: "e1",
    etag: '"1"',
    status: "confirmed",
    summary: "Standup",
    location: null,
    description: null,
    start: null,
    end: null,
    start_date: null,
    end_date: null,
    all_day: false,
    time_zone: "Europe/Lisbon",
    organizer: null,
    attendees: [],
    self_response: null,
    meet_url: null,
    recurring: false,
    can_edit: true,
    ...overrides,
  };
}

const draft = {
  title: " Review ",
  day: "2026-07-01",
  time: "10:30",
  durationMin: 45,
  allDay: false,
  zone: "Europe/Lisbon",
  guests: ["ana@example.com"],
  meet: true,
  notify: false,
  location: "",
};

describe("nsvx agenda rules", () => {
  it("builds wall-clock times with the zone's own offset, across daylight time", () => {
    expect(zonedIso("2026-07-01", "10:30", "Europe/Lisbon")).toBe("2026-07-01T10:30:00+01:00");
    expect(zonedIso("2026-01-15", "09:00", "Europe/Lisbon")).toBe("2026-01-15T09:00:00+00:00");
    expect(weekStart("2026-11-05")).toBe("2026-11-02");
  });

  it("builds the same create, update, and cancel requests as the NSVX editor", () => {
    expect(draftOperation(draft)).toEqual({
      operation: "calendar.create_event",
      payload: {
        summary: "Review",
        start: "2026-07-01T10:30:00+01:00",
        time_zone: "Europe/Lisbon",
        all_day: false,
        duration_min: 45,
        attendees: ["ana@example.com"],
        create_meet: true,
        send_updates: "none",
        location: undefined,
      },
    });
    const update = draftOperation({ ...draft, notify: true }, event({}));
    expect(update.operation).toBe("calendar.update_event");
    expect(update.payload).toMatchObject({
      event_id: "e1",
      etag: '"1"',
      send_updates: "all",
      has_guests: true,
      scope: "this",
    });
    expect(cancelOperation(event({}), 0, true).payload).toMatchObject({
      send_updates: "none",
      has_guests: false,
    });
    expect(() => draftOperation({ ...draft, title: " " })).toThrow();
  });

  it("splits guest emails and keeps the bad ones visible", () => {
    expect(splitEmails("Ana@example.com, ana@example.com; bad, rui@example.pt")).toEqual({
      valid: ["ana@example.com", "rui@example.pt"],
      invalid: ["bad"],
    });
  });

  it("places multi-day and all-day events on each day they cover, and finds clashes", () => {
    const days = groupByDay(
      [
        event({ event_id: "a", start: "2026-07-01T22:00:00Z", end: "2026-07-02T09:00:00Z" }),
        event({ event_id: "b", all_day: true, start_date: "2026-07-03", end_date: "2026-07-04" }),
      ],
      "2026-07-01",
      3,
      "Europe/Lisbon",
    );
    expect(days.map((day) => day.events.map((row) => row.event_id))).toEqual([["a"], ["a"], ["b"]]);
    const busy = [
      event({ event_id: "a", start: "2026-07-01T09:00:00Z", end: "2026-07-01T10:00:00Z" }),
    ];
    expect(overlapping(busy, "2026-07-01T09:30:00Z", "2026-07-01T10:30:00Z")).toHaveLength(1);
    expect(overlapping(busy, "2026-07-01T09:30:00Z", "2026-07-01T10:30:00Z", "a")).toHaveLength(0);
  });

  it("bounds chat ranges like NSVX does", () => {
    expect(agendaRange({}, "2026-07-01")).toEqual({ start: "2026-07-01", days: 7 });
    expect(agendaRange({ start: "2026-07-01", end: "2026-07-01" }, "x")).toEqual({
      start: "2026-07-01",
      days: 1,
    });
    expect(() => agendaRange({ start: "2026-07-01", end: "2026-10-01" }, "x")).toThrow(/62/);
    expect(() => agendaRange({ start: "tomorrow" }, "x")).toThrow();
  });
});

describe("nsvx agenda requests", () => {
  it("sends calendar changes with the session CSRF token, terms hash, and key", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith("/api/auth/state")
        ? json(200, { authenticated: true, csrf: "csrf-1" })
        : json(200, { id: "i1", state: "in_flight" }),
    );
    const change = draftOperation(draft);
    await agendaRequests.act(ownerClient(fetchImpl), {
      ...change,
      termsHash: "hash-1",
      clientKey: "oc-1",
    });
    const [url, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("https://nsvx.test/api/workspace/actions");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Cookie: "clone_session=owner-cookie",
      "X-CSRF-Token": "csrf-1",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      operation: "calendar.create_event",
      payload: change.payload,
      terms_hash: "hash-1",
      client_key: "oc-1",
    });
  });

  it("refuses other operations and unreviewed changes before calling NSVX", async () => {
    const fetchImpl = vi.fn();
    const client = ownerClient(fetchImpl);
    expect(
      await kindOf(() =>
        agendaRequests.preview(client, { operation: "gmail.send", payload: { to: "a@b.c" } }),
      ),
    ).toBe("invalid");
    expect(
      await kindOf(() => agendaRequests.act(client, { ...draftOperation(draft), clientKey: "k" })),
    ).toBe("invalid");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports a lost calendar change as uncertain and a changed one as a conflict", async () => {
    const lost = ownerClient(async (url) => {
      if (url.endsWith("/api/auth/state")) {
        return json(200, { authenticated: true, csrf: "c" });
      }
      throw new Error("socket closed");
    });
    const action = { ...draftOperation(draft), termsHash: "h", clientKey: "k" };
    expect(await kindOf(agendaRequests.act(lost, action))).toBe("uncertain");
    const changed = ownerClient(async (url) =>
      url.endsWith("/api/auth/state")
        ? json(200, { authenticated: true, csrf: "c" })
        : json(409, { detail: { code: "terms_changed", message: "changed" } }),
    );
    expect(await kindOf(agendaRequests.act(changed, action))).toBe("conflict");
  });
});

describe("nsvx_agenda chat tool", () => {
  const events = {
    events: [
      event({ summary: "Dentist", start: "2026-07-01T09:00:00Z", end: "2026-07-01T10:00:00Z" }),
      event({ event_id: "e2", summary: "Lunch", meet_url: "https://meet.google.com/x" }),
    ],
    fresh_at: "2026-07-01T08:00:00Z",
    errors: [],
  };
  const context = (senderIsOwner: boolean) =>
    ({ senderIsOwner, assertInvocationCurrent: () => undefined }) as never;
  const result = async (owner: boolean, params: Record<string, unknown>) => {
    const fetchImpl = vi.fn(async () => json(200, events));
    const tool = createNsvxAgendaTool(ownerClient(fetchImpl), context(owner));
    const answer = (await tool.execute("call-1", params as never)) as {
      details: Record<string, unknown>;
    };
    return { answer: answer.details, fetchImpl };
  };

  it("answers only the owner, with titles and times but no guest addresses", async () => {
    const guest = await result(false, {});
    expect(guest.answer).toMatchObject({ ok: false, reason: "denied" });
    expect(guest.fetchImpl).not.toHaveBeenCalled();

    const owner = await result(true, { start: "2026-07-01", end: "2026-07-01", query: "dent" });
    expect(owner.answer).toMatchObject({ from: "2026-07-01", to: "2026-07-01", count: 1 });
    expect((owner.answer.events as { title: string }[])[0]).toMatchObject({
      title: "Dentist",
      guests: 0,
      meet: false,
    });
    const [url] = owner.fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe(
      "https://nsvx.test/api/workspace/events?start=2026-07-01T00%3A00%3A00%2B01%3A00&end=2026-07-02T00%3A00%3A00%2B01%3A00&tz=Europe%2FLisbon",
    );
  });
});
