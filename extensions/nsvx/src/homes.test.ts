import { describe, expect, it, vi } from "vitest";
import { createNsvxClient, type NsvxErrorKind } from "./client.js";
import { homesSummary, stepsFor, taskActionsFor, type Reservation } from "./homes-data.js";
import { createNsvxHomesTool } from "./homes-tool.js";
import {
  addExpense,
  associatePayment,
  createMortgageCase,
  registerHomesMethods,
  reportIssue,
  stayTask,
} from "./homes.js";

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** A fake NSVX: the sign-in state route answers with a CSRF token, every other route with `answer`. */
function nsvx(answer: (url: string) => Response = () => json(200, { ok: true })) {
  const fetchImpl = vi.fn(async (url: string, _init: RequestInit) =>
    url.endsWith("/api/auth/state")
      ? json(200, { authenticated: true, csrf: "csrf-1" })
      : answer(url),
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
        key: (init.headers as Record<string, string>)["Idempotency-Key"],
        body: init.body ? JSON.parse(init.body as string) : undefined,
      }));
  return { client, calls };
}

const kindOf = (run: () => Promise<unknown>) =>
  Promise.resolve()
    .then(run)
    .then(
      () => undefined,
      (cause: unknown) => (cause as { kind: NsvxErrorKind }).kind,
    );

describe("homes changes", () => {
  it("sends each change to its fixed NSVX route in the shape NSVX validates", async () => {
    const { client, calls } = nsvx();
    await addExpense(client, {
      propertyId: "p-1",
      category: "imi",
      amount: 312.5,
      spentOn: "2026-11-02",
      idempotencyKey: "cost-key-1",
    });
    await associatePayment(client, {
      paymentId: "pay-1",
      allocations: [
        { expectedId: "e-1", amount: "650.00" },
        { expectedId: "e-2", amount: "650.00" },
      ],
    });
    await createMortgageCase(client, { title: " Casa nova ", idempotencyKey: "case-key-1" });
    await stayTask(client, { taskId: "t-1", action: "complete" });
    await reportIssue(client, { house: "AL1", title: "Torneira", unfit: true });
    expect(calls()).toEqual([
      {
        url: "/api/properties/p-1/expenses",
        method: "POST",
        key: "cost-key-1",
        // NSVX's ExpenseIn keeps description a string, so an empty one is sent, never null.
        body: {
          category: "imi",
          amount: "312.50",
          spent_on: "2026-11-02",
          description: "",
          status: "paid",
        },
      },
      {
        url: "/api/arrendamento/payments/pay-1/associate",
        method: "POST",
        key: undefined,
        body: {
          allocations: [
            { expected_id: "e-1", amount: "650.00" },
            { expected_id: "e-2", amount: "650.00" },
          ],
          learn: false,
        },
      },
      {
        url: "/api/mortgage/cases",
        method: "POST",
        key: "case-key-1",
        body: { title: "Casa nova", purpose: "acquisition", regime: "unknown" },
      },
      {
        url: "/api/al/tasks/t-1/action",
        method: "POST",
        key: undefined,
        body: { action: "complete" },
      },
      {
        url: "/api/al/maintenance",
        method: "POST",
        key: undefined,
        body: { property_id: "AL1", title: "Torneira", priority: "media", unfit: true },
      },
    ]);
  });

  it("refuses incomplete changes before reaching NSVX", async () => {
    const { client, calls } = nsvx();
    expect(await kindOf(() => stayTask(client, { taskId: "t-1", action: "problem" }))).toBe(
      "invalid",
    );
    expect(await kindOf(() => stayTask(client, { taskId: "t-1", action: "assign" }))).toBe(
      "invalid",
    );
    expect(
      await kindOf(() =>
        addExpense(client, {
          propertyId: "p-1",
          category: "imi",
          amount: "12",
          spentOn: "2026-11-02",
        }),
      ),
    ).toBe("invalid");
    expect(
      await kindOf(() => associatePayment(client, { paymentId: "pay-1", allocations: [] })),
    ).toBe("invalid");
    expect(calls()).toEqual([]);
  });

  it("registers changes as writes and stored-data questions as reads", () => {
    const scopes = new Map<string, string>();
    registerHomesMethods((name, scope) => scopes.set(name, scope), {} as never);
    expect(scopes.get("nsvx.homes.ask")).toBe("operator.read");
    expect(scopes.get("nsvx.homes.rates")).toBe("operator.read");
    expect(
      [...scopes].filter(([, scope]) => scope === "operator.write").map(([name]) => name),
    ).toEqual([
      "nsvx.homes.alertRead",
      "nsvx.homes.notice",
      "nsvx.homes.expense",
      "nsvx.rent.reconcile",
      "nsvx.rent.associate",
      "nsvx.rent.reverse",
      "nsvx.mortgage.create",
      "nsvx.mortgage.checklist",
      "nsvx.stay.step",
      "nsvx.stay.task",
      "nsvx.stay.issue",
      "nsvx.stay.noticesRead",
    ]);
  });
});

describe("homes data", () => {
  it("offers only the arrival steps and task moves NSVX accepts from the current state", () => {
    const booking = {
      kind: "reservation",
      status: "confirmed",
      checked_in_at: null,
      checked_out_at: null,
    } as Reservation;
    expect(stepsFor(booking)).toEqual(["checkin"]);
    expect(stepsFor({ ...booking, checked_in_at: "2026-11-05T15:00:00Z" })).toEqual([
      "checkout",
      "undo-checkin",
    ]);
    expect(stepsFor({ ...booking, kind: "block" })).toEqual([]);
    expect(taskActionsFor("em_curso")).toEqual(["complete", "problem"]);
    expect(taskActionsFor("concluida")).toEqual(["inspect", "reopen"]);
  });
});

describe("homes tool", () => {
  const owner = { senderIsOwner: true };

  it("answers the overview from the areas that load and skips the ones not set up", async () => {
    const { client } = nsvx((url) =>
      url.includes("/api/realestate/overview")
        ? json(200, {
            kpis: {
              properties: 2,
              units: 3,
              occupancy: { total: 3, rented: 2, vacant: 1, rented_pct: "66.7" },
              rent_collected_month: "1300.00",
              rent_expected_month: "1950.00",
              market_value: "420000.00",
              debt: "180000.00",
            },
          })
        : url.includes("/api/al/overview")
          ? json(200, {
              kpi: {
                checkins_today: 1,
                checkouts_today: 0,
                occupied: 1,
                houses: 2,
                cleaning_pending: 1,
                maintenance_open: 0,
              },
              alerts: [],
            })
          : json(404, { detail: "not found" }),
    );
    const tool = createNsvxHomesTool(client, owner);
    const result = await tool.execute("call-1", { action: "overview" });
    const details = (result as { details: ReturnType<typeof homesSummary> }).details;
    expect(details.homes).toMatchObject({
      properties: 2,
      rented: 2,
      vacant: 1,
      rentExpectedMonth: "1950.00",
    });
    expect(details.stays).toMatchObject({ checkinsToday: 1, cleaningPending: 1 });
    expect(details.rent).toBeNull();
    expect(details.loans).toBeNull();
  });

  it("refuses anyone but the owner before reaching NSVX", async () => {
    const { client, calls } = nsvx();
    const tool = createNsvxHomesTool(client, { senderIsOwner: false });
    const result = await tool.execute("call-1", { action: "stays" });
    expect(JSON.stringify(result)).toContain("denied");
    expect(calls()).toEqual([]);
  });
});
