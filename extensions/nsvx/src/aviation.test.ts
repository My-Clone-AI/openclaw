import { describe, expect, it, vi } from "vitest";
import { emptyFlight, flightFields } from "./aviation-data.js";
import { createNsvxAviationTool } from "./aviation-tool.js";
import { aviationFile, changeAviation } from "./aviation.js";
import { createNsvxClient, type NsvxErrorKind } from "./client.js";

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** A fake NSVX: sign-in state answers with a CSRF token, every other route with `answer`. */
function nsvx(
  answer: (url: string, init: RequestInit) => Response = () => json(200, { ok: true }),
) {
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) =>
    url.endsWith("/api/auth/state")
      ? json(200, { authenticated: true, csrf: "csrf-1" })
      : answer(url, init),
  );
  const client = createNsvxClient({
    baseUrl: "https://nsvx.test",
    token: undefined,
    ownerSession: "owner",
    fetchImpl,
  });
  const calls = () =>
    fetchImpl.mock.calls
      .filter(([url]) => !url.endsWith("/api/auth/state"))
      .map(([url, init]) => ({
        url: url.replace("https://nsvx.test", ""),
        method: init.method,
        body: init.body ? JSON.parse(init.body as string) : undefined,
      }));
  return { client, fetchImpl, calls };
}

async function kindOf(run: Promise<unknown>): Promise<NsvxErrorKind | undefined> {
  return run.then(
    () => undefined,
    (cause: unknown) => (cause as { kind: NsvxErrorKind }).kind,
  );
}

const checkin = (pnr: string, status: string) => ({
  id: `c-${pnr}`,
  pnr,
  airline_code: "TP",
  status,
  scheduled_for: null,
  mission_id: "m-1",
  flight_legs: [],
  seat_chosen: null,
  boarding_passes: [],
});

describe("aviation changes", () => {
  it("sends each owner change to its fixed NSVX route with the CSRF token", async () => {
    const { client, calls, fetchImpl } = nsvx();
    const fields = { kind: "fstd", log_date: "2026-11-01", fstd_type: "A330 FFS", fstd_min: 240 };
    await changeAviation(client, { action: "add", fields });
    await changeAviation(client, { action: "void", id: "e-1", reason: "duplicado" });
    await changeAviation(client, { action: "confirm", id: "k-1", fields });
    await changeAviation(client, { action: "doc", id: "file_1", patch: { pinned: true } });
    await changeAviation(client, { action: "alertRead", id: 7 });
    await changeAviation(client, { action: "workSync", service: "cwp" });
    expect(calls()).toEqual([
      { url: "/api/aviation/logbook/entries", method: "POST", body: { fields, reason: null } },
      {
        url: "/api/aviation/logbook/entries/e-1/void",
        method: "POST",
        body: { reason: "duplicado" },
      },
      { url: "/api/aviation/sync/candidates/k-1/confirm", method: "POST", body: { fields } },
      { url: "/api/aviation/docs/file_1", method: "PATCH", body: { pinned: true } },
      { url: "/api/aviation/docs/alerts/7/read", method: "POST", body: {} },
      { url: "/api/work/connections/cwp/sync", method: "POST", body: {} },
    ]);
    const headers = fetchImpl.mock.calls.at(-1)?.[1].headers as Record<string, string>;
    expect(headers).toMatchObject({ "X-CSRF-Token": "csrf-1", Cookie: "clone_session=owner" });
  });

  it("refuses what NSVX's contract would refuse before calling NSVX", async () => {
    const { client, fetchImpl } = nsvx();
    for (const params of [
      { action: "add", fields: { kind: "flight", password: "x" } },
      { action: "add", fields: { remarks: { nested: true } } },
      { action: "void", id: "e-1", reason: "no" },
      { action: "countersign", id: "e-1", state: "maybe" },
      { action: "import", digest: "short" },
      { action: "roots", roots: ["relative/path"] },
      { action: "workSync", service: "bank" },
      { action: "checkin", pnr: "AB", airline: "TAP" },
      { action: "send" },
    ]) {
      expect(await kindOf(changeAviation(client, params))).toBe("invalid");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("schedules a check-in once: an active one for the same booking is a conflict", async () => {
    const { client, calls } = nsvx((url, init) =>
      url.endsWith("/api/aviation/checkins") && init.method === "GET"
        ? json(200, { checkins: [checkin("ABC123", "scheduled"), checkin("OLD999", "done")] })
        : json(201, checkin("OLD999", "scheduled")),
    );
    expect(
      await kindOf(changeAviation(client, { action: "checkin", pnr: "abc123", airline: "TAP" })),
    ).toBe("conflict");
    await changeAviation(client, {
      action: "checkin",
      pnr: "old999",
      airline: "TAP",
      surname: "Silva",
    });
    expect(calls().filter((call) => call.method === "POST")).toEqual([
      {
        url: "/api/aviation/checkins",
        method: "POST",
        body: { pnr: "OLD999", airline: "TAP", surname: "Silva", first_name: null },
      },
    ]);
  });

  it("relays an export with NSVX's file name and bytes", async () => {
    const { client, calls } = nsvx(
      () =>
        new Response("date,dep\n", {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": 'attachment; filename="caderneta-2026-11-05.csv"',
          },
        }),
    );
    expect(await aviationFile(client, { kind: "csv" })).toEqual({
      fileName: "caderneta-2026-11-05.csv",
      mime: "text/csv",
      data: Buffer.from("date,dep\n").toString("base64"),
    });
    await aviationFile(client, { kind: "doc", id: "file_1" });
    expect(calls().map((call) => call.url)).toEqual([
      "/api/aviation/logbook/export.csv",
      "/api/aviation/docs/file_1/content?download=1",
    ]);
  });
});

describe("flight form", () => {
  it("needs the pilot's crew, role, night, and IFR, and works out block time across midnight", () => {
    const form = {
      ...emptyFlight("2026-11-03"),
      dep_place: "lis",
      arr_place: "jfk",
      off: "2155",
      on: "06:10",
      aircraft_model: "A332",
      registration: "9h-abc",
      pic_name: "R. Costa",
    };
    expect(flightFields(form).problems).toEqual(["night", "ifr", "crew", "role"]);
    const { fields } = flightFields({
      ...form,
      crew: "mp",
      role: "copilot_min",
      night: "3:00",
      ifr: "8:15",
    });
    expect(fields).toMatchObject({
      dep_place: "LIS",
      registration: "9H-ABC",
      off_block_at: "2026-11-03T21:55:00.000Z",
      on_block_at: "2026-11-04T06:10:00.000Z",
      total_min: 495,
      mp_min: 495,
      copilot_min: 495,
      night_min: 180,
      ifr_min: 495,
    });
  });
});

describe("nsvx_aviation", () => {
  it("answers only the owner and confirms a pending flight only on the current turn", async () => {
    const { client, calls } = nsvx((url) =>
      url.endsWith("/sync/candidates")
        ? json(200, {
            candidates: [
              {
                id: "k-1",
                log_date: "2026-11-04",
                activity: "flight",
                state: "awaiting",
                planned: { title: "LIS-TLV", actual: true },
                draft: { dep_place: "LIS", arr_place: "TLV", night_estimated: true },
                problems: [],
              },
            ],
            recent: [],
          })
        : json(200, { id: "e-9", kind: "flight", log_date: "2026-11-04", total_min: 300 }),
    );
    const assertInvocationCurrent = vi.fn();
    const guest = createNsvxAviationTool(client, { senderIsOwner: false, assertInvocationCurrent });
    expect(JSON.stringify(await guest.execute("t-1", { action: "overview" }))).toContain("denied");

    const owner = createNsvxAviationTool(client, { senderIsOwner: true, assertInvocationCurrent });
    await owner.execute("t-2", { action: "confirm", id: "k-1" });
    expect(assertInvocationCurrent).toHaveBeenCalledTimes(1);
    // Only logbook fields reach NSVX; NSVX's own bookkeeping keys in the draft stay behind.
    expect(calls().at(-1)).toEqual({
      url: "/api/aviation/sync/candidates/k-1/confirm",
      method: "POST",
      body: {
        fields: { kind: "flight", log_date: "2026-11-04", dep_place: "LIS", arr_place: "TLV" },
      },
    });
  });
});
