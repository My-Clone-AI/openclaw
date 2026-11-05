import { describe, expect, it } from "vitest";
import { createNsvxClient } from "./client.js";
import { keyFor } from "./device.js";
import { brainLayers, ideaActions, type Idea } from "./grow-data.js";
import { brainRoles, createNsvxGrowTool, growControl, ideaSubmit } from "./grow.js";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Call = { url: string; init: RequestInit };

/** NSVX double: `/api/auth/state` hands out a CSRF token; every other path answers from `routes`. */
function nsvx(routes: Record<string, (init: RequestInit) => Response>) {
  const calls: Call[] = [];
  const client = createNsvxClient({
    baseUrl: "https://nsvx.test",
    token: undefined,
    ownerSession: "s",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      const path = url.slice("https://nsvx.test".length);
      if (path === "/api/auth/state") {
        return json(200, { authenticated: true, csrf: "csrf-1" });
      }
      const route = routes[`${init.method} ${path}`];
      if (!route) {
        throw new Error(`unexpected ${init.method} ${path}`);
      }
      return route(init);
    },
  });
  const writes = () => calls.filter((call) => call.init.method !== "GET");
  const headers = (call: Call | undefined) => call?.init.headers as Record<string, string>;
  return { client, writes, headers };
}

const KEY = "0b7f2c8e-2f43-4d6c-9c2a-6a3c1f0d9e11";
const IDEA = "9d4f5c1e-8a2b-4c3d-9e8f-1a2b3c4d5e6f";

describe("grow control", () => {
  it("queues one NSVX request with the caller's key and refuses bad input before NSVX", async () => {
    const { client, writes, headers } = nsvx({
      "POST /api/grow/control": () => json(202, { id: "r1", status: "pending", replayed: false }),
    });
    await growControl(client, {
      action: "mode",
      app: "openhome",
      mode: "canary",
      idempotencyKey: KEY,
    });
    await growControl(client, { action: "kill", on: true, idempotencyKey: KEY });
    const [mode, kill] = writes();
    expect(headers(mode)).toMatchObject({ "X-CSRF-Token": "csrf-1", "Idempotency-Key": KEY });
    expect(JSON.parse(mode?.init.body as string)).toEqual({
      action: "mode",
      app: "openhome",
      mode: "canary",
    });
    expect(JSON.parse(kill?.init.body as string)).toEqual({ action: "kill", on: true });
    await expect(
      growControl(client, { action: "mode", app: "openhome", mode: "fast", idempotencyKey: KEY }),
    ).rejects.toMatchObject({ kind: "invalid" });
    await expect(growControl(client, { action: "run", app: "x" })).rejects.toMatchObject({
      kind: "invalid",
    });
    expect(writes()).toHaveLength(2);
  });

  it("reports a refused run with NSVX's own words, not as a change made elsewhere", async () => {
    const { client } = nsvx({
      "POST /api/grow/control": () =>
        json(409, { detail: { code: "killed", message: "Grow parado." } }),
    });
    await expect(
      growControl(client, { action: "run", app: "clone", idempotencyKey: KEY }),
    ).rejects.toMatchObject({ kind: "denied", message: "Grow parado." });
  });
});

describe("build me", () => {
  it("sends the owner's idea as NSVX's form with its own origin and keeps the tracking link in NSVX", async () => {
    const { client, writes, headers } = nsvx({
      "POST /api/build-me/submissions": () =>
        json(201, { tracking_path: "/build-me/t/secret-capability", revision: 1 }),
    });
    const result = await ideaSubmit(client, { text: "Dark mode", idempotencyKey: KEY });
    expect(result).toEqual({ received: true, revision: 1 });
    expect(JSON.stringify(result)).not.toContain("secret-capability");
    const [call] = writes();
    expect(headers(call)).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://nsvx.test",
      "X-CSRF-Token": "csrf-1",
    });
    expect(Object.fromEntries(new URLSearchParams(call?.init.body as string))).toEqual({
      text: "Dark mode",
      idempotency_key: KEY,
    });
  });

  it("reads NSVX's already-received answer to a retried idea as received", async () => {
    const { client } = nsvx({
      "POST /api/build-me/submissions": () =>
        json(409, { detail: "Pedido já recebido. Usa o link guardado." }),
    });
    expect(await ideaSubmit(client, { text: "Dark mode", idempotencyKey: KEY })).toEqual({
      received: true,
      replayed: true,
    });
  });

  it("offers only the decisions NSVX accepts in each state", () => {
    const idea = (state: string, more: Partial<Idea> = {}) =>
      ({ source: "local", held: false, state, ...more }) as Idea;
    expect(ideaActions(idea("in_review"))).toEqual(["reject", "merge-to-develop", "priority"]);
    expect(ideaActions(idea("failed"))).toEqual(["approve", "reject", "retry", "priority"]);
    expect(ideaActions(idea("live"))).toEqual(["priority"]);
    expect(ideaActions(idea("evaluating", { source: "replica" }))).toEqual([]);
  });
});

describe("nsvx_grow", () => {
  it("is owner-only and decides on the revision it read, with one key per tool call", async () => {
    const { client, writes } = nsvx({
      [`GET /api/build-me/admin/requests/${IDEA}`]: () =>
        json(200, { id: IDEA, app_id: "clone", state: "in_review", revision: 3, version: 7 }),
      [`POST /api/build-me/admin/requests/${IDEA}/override`]: () =>
        json(200, { id: IDEA, app_id: "clone", state: "in_review", held: false, revision: 3 }),
    });
    const params = { action: "decide", ideaId: IDEA, decision: "merge-to-develop", reason: "ok" };
    const stranger = createNsvxGrowTool(client, { senderIsOwner: false });
    expect(JSON.stringify(await stranger.execute("call-1", params))).toContain("denied");
    expect(writes()).toHaveLength(0);
    const owner = createNsvxGrowTool(client, { senderIsOwner: true });
    await owner.execute("call-1", params);
    await owner.execute("call-1", params);
    const bodies = writes().map((call) => JSON.parse(call.init.body as string));
    expect(bodies[0]).toEqual({
      action: "merge-to-develop",
      reason: "ok",
      revision: 3,
      version: 7,
      idempotency_key: keyFor("openclaw-grow-call-1"),
    });
    expect(bodies[1]).toEqual(bodies[0]);
  });

  it("changes one worker role by sending all four, as NSVX requires", async () => {
    const roles = {
      code: "codex-terra-medium",
      alt: "muse-spark-1.3-xhigh",
      debug: "claude-opus-5.5-medium",
      review: "claude-opus-5.5-review",
    };
    const { client, writes } = nsvx({
      "GET /api/v1/admin/ai/openclaw/worker-roles": () => json(200, { roles }),
      "PUT /api/v1/admin/ai/openclaw/worker-roles": (init) =>
        json(200, JSON.parse(init.body as string)),
    });
    const owner = createNsvxGrowTool(client, { senderIsOwner: true });
    await owner.execute("call-2", {
      action: "setRole",
      role: "alt",
      engine: "claude-opus-5.5-medium",
    });
    expect(JSON.parse(writes()[0]?.init.body as string)).toEqual({
      roles: { ...roles, alt: "claude-opus-5.5-medium" },
    });
    await expect(brainRoles(client, { roles: { ...roles, code: "gpt-x" } })).rejects.toMatchObject({
      kind: "invalid",
    });
    expect(writes()).toHaveLength(1);
  });
});

it("lays the brain map out from the first node by edge distance", () => {
  expect(
    brainLayers({
      nodes: ["OpenClaw (brain)", "Master", "Codex", "Claude", "Orphan"],
      edges: [
        ["OpenClaw", "Master"],
        ["Master", "Codex"],
        ["Master", "Claude"],
      ],
    }),
  ).toEqual([["OpenClaw"], ["Master"], ["Codex", "Claude"], ["Orphan"]]);
});
