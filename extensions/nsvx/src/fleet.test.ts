import { describe, expect, it, vi } from "vitest";
import { createNsvxClient, type NsvxErrorKind } from "./client.js";
import { weekOf } from "./fleet-data.js";
import { createNsvxFleetTool } from "./fleet-tool.js";
import { askFleet, changeFleet } from "./fleet.js";

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** A fake NSVX: the sign-in state route answers with a CSRF token, every other route with `answer`. */
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
        url,
        method: init.method,
        headers: init.headers as Record<string, string>,
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

describe("fleet changes", () => {
  it("sends each change to its fixed NSVX route with the session's CSRF token", async () => {
    const { client, calls } = nsvx((url) =>
      url.endsWith("/api/tvde/access")
        ? json(200, { id: "a-1", path: "/motorista#secret-token", expires_at: "2026-12-01" })
        : json(200, { ok: true }),
    );
    await changeFleet(client, { action: "ackAlert", alertId: "al-1" });
    await changeFleet(client, { action: "task", taskId: "t-1", status: "done" });
    await changeFleet(client, { action: "createTask", title: " Inspeção ", key: "task-key-1" });
    await changeFleet(client, {
      action: "step",
      workflowId: "w-1",
      stepKey: "contract",
      status: "done",
    });
    await changeFleet(client, { action: "rule", code: "A_expiry", enabled: false });
    await changeFleet(client, {
      action: "mileage",
      decision: "confirm",
      vehicleId: "v-1",
      readingId: "r-1",
      revision: 2,
      value: "120400",
      unit: "km",
      observedOn: "2026-10-30",
      vehicleConfirmed: true,
    });
    await changeFleet(client, {
      action: "uberCollect",
      account: "business",
      year: 2026,
      quarter: 3,
    });
    const link = await changeFleet(client, {
      action: "accessCreate",
      role: "driver",
      driverId: "d-1",
      days: 30,
    });
    expect(link).toEqual({
      id: "a-1",
      url: "https://nsvx.test/motorista#secret-token",
      expiresAt: "2026-12-01",
    });
    expect(calls().map((c) => [c.method, c.url, c.body])).toEqual([
      ["POST", "https://nsvx.test/api/tvde/alerts/al-1/ack", {}],
      ["PATCH", "https://nsvx.test/api/tvde/tasks/t-1", { status: "done" }],
      [
        "POST",
        "https://nsvx.test/api/tvde/tasks",
        { title: "Inspeção", priority: "normal", due_on: null, driver_id: null, vehicle_id: null },
      ],
      [
        "POST",
        "https://nsvx.test/api/tvde/workflows/w-1/steps/contract",
        { status: "done", note: null },
      ],
      ["PATCH", "https://nsvx.test/api/tvde/automation/A_expiry", { enabled: false }],
      [
        "POST",
        "https://nsvx.test/api/tvde/vehicles/v-1/mileage/r-1/decision",
        {
          action: "confirm",
          revision: 2,
          reason: "",
          value: "120400",
          unit: "km",
          observed_on: "2026-10-30",
          vehicle_confirmed: true,
          issues_resolved: false,
        },
      ],
      ["POST", "https://nsvx.test/api/business/uber/quarter", { year: 2026, quarter: 3 }],
      [
        "POST",
        "https://nsvx.test/api/tvde/access",
        { role: "driver", driver_id: "d-1", label: null, days: 30 },
      ],
    ]);
    expect(calls()[0]!.headers).toEqual(
      expect.objectContaining({ "X-CSRF-Token": "csrf-1", Cookie: "clone_session=owner" }),
    );
    expect(calls()[2]!.headers).toEqual(
      expect.objectContaining({ "Idempotency-Key": "task-key-1" }),
    );
  });

  it("reports a changed reading as a conflict and a lost answer as uncertain", async () => {
    const { client } = nsvx((url) =>
      url.includes("/decision") ? json(409, { detail: "A leitura mudou. Atualiza." }) : json(502),
    );
    expect(
      await kindOf(
        changeFleet(client, {
          action: "mileage",
          decision: "reject",
          vehicleId: "v-1",
          readingId: "r-1",
          revision: 1,
        }),
      ),
    ).toBe("conflict");
    expect(await kindOf(changeFleet(client, { action: "runRules" }))).toBe("uncertain");
  });

  it("rejects what NSVX would refuse, and anything that pays, before calling NSVX", async () => {
    const { client, fetchImpl } = nsvx();
    for (const params of [
      { action: "task", taskId: "t-1", status: "archived" },
      { action: "shift", shiftId: "s/../1", status: "done" },
      { action: "rule", code: "A_expiry" },
      {
        action: "mileage",
        decision: "confirm",
        vehicleId: "v",
        readingId: "r",
        revision: 0,
        value: "1",
        unit: "km",
      },
      { action: "accessCreate", role: "driver" },
      { action: "uberCollect", account: "personal", year: 2026, quarter: 5 },
      { action: "settlement", settlementId: "s-1", status: "paid" },
      { action: "payInvoice", invoiceId: "i-1" },
    ]) {
      expect(await kindOf(changeFleet(client, params))).toBe("invalid");
    }
    expect(await kindOf(askFleet(client, { question: " " }))).toBe("invalid");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("nsvx_fleet", () => {
  it("answers only the owner and changes only on the owner's current turn", async () => {
    const { client, calls } = nsvx((url) =>
      url.includes("/api/tvde/dashboard")
        ? json(200, { drivers: { total: 3 } })
        : json(200, { ok: true }),
    );
    const assertInvocationCurrent = vi.fn();
    const guest = createNsvxFleetTool(client, { senderIsOwner: false, assertInvocationCurrent });
    expect(
      JSON.stringify(await guest.execute("c-1", { action: "read", view: "fleetDashboard" })),
    ).toContain("denied");
    expect(calls()).toEqual([]);

    const owner = createNsvxFleetTool(client, { senderIsOwner: true, assertInvocationCurrent });
    expect(await owner.execute("c-2", { action: "read", view: "fleetDashboard" })).toEqual(
      expect.objectContaining({ details: { drivers: { total: 3 } } }),
    );
    expect(assertInvocationCurrent).not.toHaveBeenCalled();
    await owner.execute("c-3", { action: "createTask", title: "Pneus" });
    expect(assertInvocationCurrent).toHaveBeenCalledTimes(1);
    expect(calls().at(-1)).toEqual(
      expect.objectContaining({
        method: "POST",
        url: "https://nsvx.test/api/tvde/tasks",
        headers: expect.objectContaining({ "Idempotency-Key": "openclaw-c-3" }),
      }),
    );
    // Links, driver news, and request answers stay in the tab.
    for (const action of ["accessCreate", "announce", "request", "mileage"]) {
      expect(JSON.stringify(await owner.execute("c-4", { action } as never))).toContain("invalid");
    }
  });
});

it("plans Monday to Sunday around any day", () => {
  expect(weekOf(new Date(2026, 10, 5))).toEqual({
    start: "2026-11-02",
    end: "2026-11-08",
    days: [
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ],
  });
});
