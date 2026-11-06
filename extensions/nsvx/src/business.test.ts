import { describe, expect, it, vi } from "vitest";
import {
  filterGrants,
  grantExpiry,
  providerTone,
  providerView,
  quarterOpen,
  type Grant,
} from "./business-data.js";
import { createNsvxBusinessTool } from "./business-tool.js";
import {
  providerAction,
  readBusinessFile,
  readingAction,
  saveAccess,
  workflowAction,
} from "./business.js";
import { createNsvxClient } from "./client.js";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** An owner client whose sign-in state route hands out a CSRF token, recording every call. */
function ownerClient(
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
    ownerSession: "s",
    fetchImpl,
  });
  const calls = () =>
    (fetchImpl.mock.calls as unknown as [string, RequestInit][]).filter(
      ([url]) => !url.endsWith("/api/auth/state"),
    );
  return { client, calls };
}

const lastYear = new Date().getFullYear() - 1;

describe("business routes", () => {
  it("sends a quarter collection to the provider's own NSVX route with the session's CSRF token", async () => {
    const { client, calls } = ownerClient(() => json(200, { state: "queued" }));
    await providerAction(client, {
      provider: "nos",
      op: "quarter",
      year: lastYear,
      quarter: 4,
      association: "123",
    });
    const [url, init] = calls()[0]!;
    expect(url).toBe("https://nsvx.test/api/utilities/nos/quarter");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-CSRF-Token"]).toBe("csrf-1");
    expect(JSON.parse(String(init.body))).toEqual({
      year: lastYear,
      quarter: 4,
      association: "123",
    });
  });

  it("refuses future quarters, other providers' steps, and sign-in details outside the admin method", async () => {
    const { client, calls } = ownerClient();
    const next = new Date().getFullYear() + 1;
    await expect(
      providerAction(client, { provider: "prio", op: "quarter", year: next, quarter: 1 }),
    ).rejects.toMatchObject({ kind: "invalid" });
    await expect(
      providerAction(client, { provider: "viaverde", op: "code", code: "1234" }),
    ).rejects.toMatchObject({
      kind: "invalid",
    });
    await expect(
      providerAction(client, { provider: "nos", op: "credentials", username: "u", password: "p" }),
    ).rejects.toMatchObject({ kind: "invalid" });
    expect(calls()).toEqual([]);
    await saveAccess(client, {
      provider: "glovo",
      username: "me@x.pt",
      password: "pw",
      phone: "+351 91 000 0000",
    });
    expect(calls()[0]![0]).toBe("https://nsvx.test/api/orders/glovo/credentials");
    expect(JSON.parse(String(calls()[0]![1].body))).toEqual({
      username: "me@x.pt",
      password: "pw",
      phone: "+351910000000",
    });
  });

  it("reads sign-in pages as views and never as a change", async () => {
    const { client, calls } = ownerClient(() => json(200, { image: "data:image/png;base64,AA" }));
    const page = providerView("amazon", "view");
    await client.readOwnerView(page.view, page.params);
    expect(calls()[0]![0]).toBe("https://nsvx.test/api/orders/amazon-es/view");
    expect(calls()[0]![1].method).toBe("GET");
    await expect(providerAction(client, { provider: "bolt", op: "view" })).rejects.toMatchObject({
      kind: "invalid",
    });
    expect(calls()).toHaveLength(1);
  });

  it("uploads a meter photo as multipart and confirms only with NSVX's 64-hex binding", async () => {
    const { client, calls } = ownerClient(() => json(202, { id: "r1" }));
    await readingAction(client, {
      op: "upload",
      file: {
        name: "meter.jpg",
        type: "image/jpeg",
        base64: Buffer.from("jpeg").toString("base64"),
      },
    });
    const [url, init] = calls()[0]!;
    expect(url).toBe("https://nsvx.test/api/utilities/meter-readings");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    const sent = (init.body as FormData).get("file") as File;
    expect([sent.name, sent.type, await sent.text()]).toEqual(["meter.jpg", "image/jpeg", "jpeg"]);
    const id = "0b0c3f6e-6a1d-4c56-9c62-1f1f7f0e1a2b";
    await expect(
      readingAction(client, { op: "confirm", id, revision: 3, binding: "x" }),
    ).rejects.toMatchObject({
      kind: "invalid",
    });
    await expect(
      readingAction(client, {
        op: "upload",
        file: { name: "a.exe", type: "application/x-msdownload", base64: "AA" },
      }),
    ).rejects.toMatchObject({ kind: "invalid" });
    await readingAction(client, { op: "confirm", id, revision: 3, binding: "a".repeat(64) });
    expect(calls()[1]![0]).toBe(`https://nsvx.test/api/utilities/meter-readings/${id}/confirm`);
    expect(JSON.parse(String(calls()[1]![1].body))).toEqual({
      revision: 3,
      binding: "a".repeat(64),
    });
  });

  it("starts a quarter workflow with sorted known suppliers only", async () => {
    const { client, calls } = ownerClient(() => json(202, { id: "w1" }));
    await workflowAction(client, {
      op: "start",
      year: lastYear,
      quarter: 2,
      providers: ["viaverde", "bolt", "bolt"],
    });
    expect(JSON.parse(String(calls()[0]![1].body))).toEqual({
      year: lastYear,
      quarter: 2,
      providers: ["bolt", "viaverde"],
    });
    await expect(
      workflowAction(client, { op: "start", year: lastYear, quarter: 2, providers: ["uber"] }),
    ).rejects.toMatchObject({ kind: "invalid" });
  });

  it("relays NSVX files as base64 with their name and checks export filters first", async () => {
    const { client, calls } = ownerClient(
      () =>
        new Response("id,app\n", {
          status: 200,
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": 'attachment; filename="business-grant-history.csv"',
          },
        }),
    );
    const file = await readBusinessFile(client, { name: "grantsExport", from: "2026-01-01" });
    expect(file).toEqual({
      mime: "text/csv",
      data: Buffer.from("id,app\n").toString("base64"),
      fileName: "business-grant-history.csv",
    });
    expect(calls()[0]![0]).toBe(
      "https://nsvx.test/api/group-companies/business-action-grants/export?from=2026-01-01&format=csv",
    );
    await expect(
      readBusinessFile(client, { name: "grantsExport", from: "2026-02-01", to: "2026-01-01" }),
    ).rejects.toMatchObject({ kind: "invalid" });
  });
});

describe("business data", () => {
  it("finds grants by every word, accent-blind", () => {
    const grants: Grant[] = [
      {
        id: "g1",
        app: "openhome",
        action: "listing.hide",
        state: "active",
        expires_at: null,
        user_ref: "José",
      },
      { id: "g2", app: "openfly", action: "booking.cancel", state: "revoked", expires_at: null },
    ];
    expect(filterGrants(grants, "jose openhome").map((g) => g.id)).toEqual(["g1"]);
    expect(filterGrants(grants, "  ").map((g) => g.id)).toEqual(["g1", "g2"]);
  });

  it("warns a week before a grant expires and accepts only past or current quarters", () => {
    const now = Date.parse("2026-11-05T12:00:00Z");
    expect(grantExpiry("2026-11-08T12:00:00Z", now)).toEqual({
      expired: false,
      days: 3,
      warning: true,
    });
    expect(grantExpiry("2026-11-01T00:00:00Z", now)?.expired).toBe(true);
    const at = new Date("2026-11-05T12:00:00Z");
    expect([
      quarterOpen(2026, 4, at),
      quarterOpen(2027, 1, at),
      quarterOpen(2013, 1, at, 2014),
    ]).toEqual([true, false, false]);
    expect(providerTone("glovo", { configured: true, login_state: "needs_otp" })).toBe("warn");
    expect(providerTone("nos", { configured: true, run: { state: "running" } })).toBe("busy");
  });
});

describe("nsvx_business", () => {
  it("reads only on the owner's turns, hides adult apps' grants, and collects with a current invocation", async () => {
    const { client, calls } = ownerClient((url) =>
      url.endsWith("/business-action-grants")
        ? json(200, {
            grants: [
              { id: "g1", app: "openhome", action: "a", state: "active", expires_at: null },
              { id: "g2", app: "openlove", action: "a", state: "active", expires_at: null },
            ],
          })
        : json(202, { state: "queued", year: lastYear, quarter: 1, items: {} }),
    );
    const stranger = createNsvxBusinessTool(client, { senderIsOwner: false });
    expect((await stranger.execute("t0", { action: "grants" })).details).toMatchObject({
      ok: false,
      reason: "denied",
    });
    const assertInvocationCurrent = vi.fn();
    const tool = createNsvxBusinessTool(client, { senderIsOwner: true, assertInvocationCurrent });
    const grants = (await tool.execute("t1", { action: "grants" })).details as { app: string }[];
    expect(grants.map((g) => g.app)).toEqual(["openhome"]);
    await tool.execute("t2", {
      action: "collect",
      provider: "fidelidade",
      year: lastYear,
      quarter: 1,
    });
    expect(assertInvocationCurrent).toHaveBeenCalledTimes(1);
    expect(calls().at(-1)![0]).toBe("https://nsvx.test/api/business/fidelidade/quarter");
    expect(
      (await tool.execute("t3", { action: "collect", provider: "amazon" })).details,
    ).toMatchObject({
      ok: false,
      reason: "invalid",
    });
  });
});
