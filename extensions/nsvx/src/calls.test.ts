import { describe, expect, it, vi } from "vitest";
import { dialBlocker, mergeTurns, unknownNumber, type CallsStatus } from "./calls-data.js";
import { changeCalls, createNsvxCallsTool, dial, lookup } from "./calls.js";
import { createNsvxClient } from "./client.js";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const CALL = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

/** An owner client whose sign-in state route hands out a CSRF token, recording every call. */
function ownerClient(answer: (url: string, init: RequestInit) => Response = () => json(200, {})) {
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) =>
    url.endsWith("/api/auth/state")
      ? json(200, { authenticated: true, csrf: "csrf-1" })
      : answer(url, init),
  );
  const client = createNsvxClient({
    baseUrl: "https://nsvx.test",
    token: undefined,
    ownerSession: "s",
    fetchImpl,
  });
  const writes = () =>
    (fetchImpl.mock.calls as unknown as [string, RequestInit][])
      .filter(([, init]) => init.method !== "GET")
      .map(([url, init]) => ({
        url: url.replace("https://nsvx.test", ""),
        method: init.method,
        body: JSON.parse(init.body as string) as unknown,
      }));
  return { client, writes, fetchImpl };
}

const status = (extra: Partial<CallsStatus> = {}): CallsStatus => ({
  enabled: true,
  voice_enabled: true,
  outgoing_blocker: null,
  kill_switch: null,
  model: "m",
  budget: { daily_usd: 5, monthly_usd: 50, max_call_seconds: 600, max_concurrent: 1 },
  spend_today_usd: "1.00",
  spend_month_usd: "3.00",
  owner_pin_set: false,
  carrier_ready: true,
  from_number: "+351210000000",
  allowed_prefixes: ["+351"],
  active: [],
  ...extra,
});

describe("calls changes", () => {
  it("dials once per owner key, on NSVX's own route with its CSRF token", async () => {
    const { client, writes, fetchImpl } = ownerClient();
    await dial(client, {
      to: " +351 912 345 678 ",
      purpose: "Confirm delivery",
      key: "k-12345678",
    });
    expect(writes()).toEqual([
      {
        url: "/api/calls/outgoing",
        method: "POST",
        body: { to: "+351 912 345 678", purpose: "Confirm delivery", key: "k-12345678" },
      },
    ]);
    const [, init] = fetchImpl.mock.calls.at(-1) as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ "X-CSRF-Token": "csrf-1" });
    await expect(dial(client, { to: "call me", purpose: "x", key: "k" })).rejects.toMatchObject({
      kind: "invalid",
    });
    expect(writes()).toHaveLength(1);
  });

  it("sends each live-call tap and setting to its fixed NSVX route", async () => {
    const { client, writes } = ownerClient();
    await changeCalls(client, { action: "mute", id: CALL });
    await changeCalls(client, { action: "unmute", id: CALL });
    await changeCalls(client, { action: "context", id: CALL });
    await changeCalls(client, { action: "deleteRecording", recordingId: CALL });
    await changeCalls(client, { action: "settings", dailyUsd: 3, voiceEnabled: false });
    await changeCalls(client, { action: "social", recording: "off", retentionDays: 30 });
    expect(writes()).toEqual([
      { url: `/api/calls/${CALL}/mute`, method: "POST", body: { muted: true } },
      { url: `/api/calls/${CALL}/mute`, method: "POST", body: { muted: false } },
      { url: `/api/calls/${CALL}/context-access`, method: "POST", body: { confirmed: true } },
      { url: `/api/calls/recordings/${CALL}`, method: "DELETE", body: {} },
      { url: "/api/calls/settings", method: "POST", body: { voice_enabled: false, daily_usd: 3 } },
      {
        url: "/api/calls/social/settings",
        method: "POST",
        body: { recording: "off", retention_days: 30 },
      },
    ]);
    await expect(changeCalls(client, { action: "settings", dailyUsd: 500 })).rejects.toMatchObject({
      kind: "invalid",
    });
  });

  it("asks the carrier only on an explicit paid lookup", async () => {
    const { client, writes } = ownerClient();
    await lookup(client, { number: "+351 912 345 678" });
    await lookup(client, { number: "+351 912 345 678", paid: "yes" });
    await lookup(client, { number: "+351 912 345 678", paid: true });
    expect(writes().map((write) => (write.body as { paid: boolean }).paid)).toEqual([
      false,
      false,
      true,
    ]);
  });
});

describe("nsvx_calls", () => {
  const card = {
    id: CALL,
    e164: "+351912345678",
    name: "Courier",
    kind: "delivery",
    confidence: 0.8,
    origin: "public_web",
    person_id: null,
    number_info: {},
    sources: [],
    internal_matches: [],
    provider: { enabled: true, cost_usd: "0.01", cap_usd: null },
  };

  it("refuses other senders and never dials from chat", async () => {
    const { client, writes } = ownerClient(() => json(200, card));
    const stranger = createNsvxCallsTool(client, { senderIsOwner: false });
    expect(JSON.stringify(await stranger.execute("1", { action: "list" }))).toContain("denied");
    const owner = createNsvxCallsTool(client, { senderIsOwner: true });
    const answer = JSON.stringify(
      await owner.execute("2", { action: "dial", number: "+351912345678", purpose: "hi" }),
    );
    expect(answer).toContain("needsOwner");
    expect(writes()).toEqual([]);
  });

  it("identifies a number without the paid carrier lookup", async () => {
    const { client, writes } = ownerClient(() => json(200, card));
    const owner = createNsvxCallsTool(client, { senderIsOwner: true });
    const answer = JSON.stringify(
      await owner.execute("3", { action: "whoCalled", number: "+351912345678" }),
    );
    expect(answer).toContain("Courier");
    expect(writes()).toEqual([
      {
        url: "/api/phone-lookup",
        method: "POST",
        body: { number: "+351912345678", paid: false },
      },
    ]);
  });
});

describe("calls data", () => {
  it("names why a call cannot start, in NSVX's order", () => {
    expect(dialBlocker(status())).toBeNull();
    expect(dialBlocker(status({ outgoing_blocker: "gemini_live_key_missing" }))).toBe("voice");
    expect(dialBlocker(status({ carrier_ready: false, enabled: false }))).toBe("carrier");
    expect(dialBlocker(status({ enabled: false }))).toBe("off");
    expect(
      dialBlocker(
        status({
          budget: { daily_usd: 0, monthly_usd: 0, max_call_seconds: 600, max_concurrent: 1 },
        }),
      ),
    ).toBe("budget");
  });

  it("offers Who called only for unknown inbound numbers", () => {
    expect(unknownNumber({ direction: "inbound", person_id: null, who: "+351 912 345 678" })).toBe(
      true,
    );
    expect(unknownNumber({ direction: "inbound", person_id: "p", who: "+351912345678" })).toBe(
      false,
    );
    expect(unknownNumber({ direction: "outbound", person_id: null, who: "+351912345678" })).toBe(
      false,
    );
    expect(unknownNumber({ direction: "inbound", person_id: null, who: "Ana" })).toBe(false);
  });

  it("replaces a re-sent turn with its newer copy", () => {
    const turn = (id: number, text: string) => ({
      id,
      role: "user",
      text,
      status: "final",
      at: "",
    });
    expect(
      mergeTurns([turn(1, "hel"), turn(2, "b")], [turn(1, "hello"), turn(3, "c")]).map(
        (t) => t.text,
      ),
    ).toEqual(["hello", "b", "c"]);
  });
});
