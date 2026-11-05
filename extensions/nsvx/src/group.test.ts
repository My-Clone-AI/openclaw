import { describe, expect, it, vi } from "vitest";
import { createNsvxClient, type NsvxClient } from "./client.js";
import {
  appCards,
  devActionsFor,
  mailActionsFor,
  metricRange,
  type GroupApp,
} from "./group-data.js";
import { createNsvxGroupTool } from "./group-tool.js";
import { mailAction, runDevAction, sendMail, serverAction } from "./group.js";

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
  const writes = () =>
    (fetchImpl.mock.calls as unknown as [string, RequestInit][]).filter(
      ([, init]) => init.method === "POST",
    );
  return { client, fetchImpl, writes };
}

const app = (id: string, extra: Partial<GroupApp> = {}): GroupApp => ({
  id,
  name: id,
  domain: `${id}.fun`,
  repo: `org/${id}`,
  developmentUrl: "",
  productionUrl: "",
  status: "ok",
  dev: { status: "ok", revision: "abcdef0123", url: "" },
  prod: { status: "ok", revision: "1234567890", url: "" },
  adapter: { status: "ok" },
  metrics: { status: "ok", days: [], visitors: 10 },
  github: { status: "ok", develop: { state: "success" }, prs: { count: 0, top: [] } },
  errors: { status: "ok", count: 0, groups: 0, top: [], truncated: false },
  ...extra,
});

describe("group data", () => {
  it("never shows adult apps and puts apps needing attention first", () => {
    const cards = appCards({
      generatedAt: "",
      github: "ok",
      apps: [
        app("openhome"),
        app("openlove", { adult: true }),
        app("openxxx"),
        app("openfly", { prod: { status: "down", revision: null, url: "" } }),
      ],
    });
    expect(cards.map((card) => [card.id, card.health])).toEqual([
      ["openfly", "bad"],
      ["openhome", "ok"],
    ]);
  });

  it("offers dev actions NSVX lists, hiding Grow ones while Grow is off and every adult app", () => {
    const actions = {
      environment: "development",
      actions: {
        openhome: {
          ci: { available: true, reason: null },
          grow_run: { available: true, reason: null },
        },
        openlove: { adult: true, ci: { available: true, reason: null } },
      },
    };
    expect(devActionsFor(actions, { id: "openhome", grow: false }).map((a) => a.id)).toEqual([
      "ci",
    ]);
    expect(devActionsFor(actions, { id: "openlove" })).toEqual([]);
  });

  it("shows only mail actions that change the message", () => {
    const box = {
      app: "a",
      box: "hi",
      address: "hi@a.fun",
      unread: 0,
      actions: ["markRead", "markUnread", "archive"],
      sendEnabled: false,
      status: "ok",
    };
    const message = {
      id: "m",
      threadId: "t",
      app: "a",
      box: "hi",
      subject: "",
      from: [],
      to: [],
      cc: [],
      date: "",
      unread: false,
    };
    expect(mailActionsFor(box, message)).toEqual(["markUnread", "archive"]);
  });

  it("counts metric days in Lisbon time", () => {
    expect(metricRange(7, new Date("2026-11-05T23:30:00Z"))).toEqual({
      from: "2026-10-30",
      to: "2026-11-05",
    });
  });
});

describe("group changes", () => {
  it("sends a dev action to its fixed route with confirm, development, CSRF, and the idempotency key", async () => {
    const { client, writes } = ownerClient(() => json(200, { status: "dispatched" }));
    await runDevAction(client, { cid: "openhome", action: "ci", idempotencyKey: "oc-key-123" });
    const [url, init] = writes()[0]!;
    expect(url).toBe("https://nsvx.test/api/group-companies/actions/openhome/ci");
    expect(init.headers).toMatchObject({
      "X-CSRF-Token": "csrf-1",
      "Idempotency-Key": "oc-key-123",
    });
    expect(JSON.parse(init.body as string)).toEqual({ confirm: true, environment: "development" });
  });

  it("refuses unknown actions and adult apps before reaching NSVX", async () => {
    const { client, fetchImpl } = ownerClient();
    await expect(
      runDevAction(client, {
        cid: "openhome",
        action: "deploy_prod",
        idempotencyKey: "oc-key-123",
      }),
    ).rejects.toMatchObject({ kind: "invalid" });
    await expect(
      mailAction(client, { cid: "openlove", box: "hi", messageIds: ["m"], action: "archive" }),
    ).rejects.toMatchObject({ kind: "denied" });
    await expect(serverAction(client, { sid: "master", verb: "rm" })).rejects.toMatchObject({
      kind: "invalid",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends a saved mail draft once with the box query, and reports a lost answer as uncertain", async () => {
    const { client, writes } = ownerClient(() => {
      throw new Error("socket closed");
    });
    await expect(
      sendMail(client, { cid: "openhome", box: "hi", draftId: "d1", idempotencyKey: "oc-key-123" }),
    ).rejects.toMatchObject({ kind: "uncertain" });
    expect(writes()).toHaveLength(1);
    const [url, init] = writes()[0]!;
    expect(url).toBe("https://nsvx.test/api/group-companies/openhome/mail/drafts/d1/send?box=hi");
    expect(JSON.parse(init.body as string)).toEqual({
      confirm: true,
      idempotencyKey: "oc-key-123",
    });
  });
});

describe("nsvx_group", () => {
  const context = (senderIsOwner: boolean) => ({ senderIsOwner, assertInvocationCurrent: vi.fn() });

  it("answers only the owner", async () => {
    const readOwnerView = vi.fn();
    const result = await createNsvxGroupTool(
      { readOwnerView } as unknown as NsvxClient,
      context(false),
    ).execute("call-1", { action: "overview" });
    expect(JSON.stringify(result)).toContain("denied");
    expect(readOwnerView).not.toHaveBeenCalled();
  });

  it("summarizes the visible apps and runs a dev action with a key tied to the tool call", async () => {
    const { client, writes } = ownerClient((url) =>
      url.endsWith("/api/group-companies/overview")
        ? json(200, {
            generatedAt: "",
            github: "ok",
            apps: [app("openhome"), app("openlove", { adult: true })],
          })
        : json(200, { status: "queued" }),
    );
    const ctx = context(true);
    const tool = createNsvxGroupTool(client, ctx);
    const overview = JSON.stringify(await tool.execute("call-1", { action: "overview" }));
    expect(overview).toContain("openhome");
    expect(overview).not.toContain("openlove");
    await tool.execute("call:2", { action: "devAction", app: "openhome", devAction: "redeploy" });
    expect(ctx.assertInvocationCurrent).toHaveBeenCalled();
    const [url, init] = writes()[0]!;
    expect(url).toBe("https://nsvx.test/api/group-companies/actions/openhome/redeploy");
    expect(init.headers).toMatchObject({ "Idempotency-Key": "openclaw-call-2" });
  });
});
