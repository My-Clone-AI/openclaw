import { describe, expect, it, vi } from "vitest";
import { createNsvxAiClient, parseAiChange } from "./ai-client.js";
import { createNsvxAiTools } from "./ai-tools.js";
import type { NsvxErrorKind } from "./client.js";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Call = [string, RequestInit];

/** NSVX double: the auth state hands out the session's CSRF token; every other path answers `reply`. */
function nsvx(reply: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) =>
    url.endsWith("/api/auth/state")
      ? json(200, { authenticated: true, csrf: "csrf-1" })
      : reply(url, init),
  );
  const ai = createNsvxAiClient({ baseUrl: "https://nsvx.test", ownerSession: "s", fetchImpl });
  return { ai, calls: () => fetchImpl.mock.calls as unknown as Call[] };
}

async function kindOf(run: Promise<unknown>): Promise<NsvxErrorKind | undefined> {
  return run.then(
    () => undefined,
    (cause: unknown) => (cause as { kind: NsvxErrorKind }).kind,
  );
}

describe("nsvx AI client", () => {
  it("writes a lane order with the session CSRF token and returns NSVX's new state", async () => {
    const { ai, calls } = nsvx(() => json(200, { lanes: { normal: { enabled: true } } }));
    const chain = [{ provider: "anthropic", model: "claude-opus", effort: "high" }];
    const result = await ai.change(parseAiChange({ op: "lane.order", lane: "normal", chain }));
    expect(result).toEqual({ lanes: { normal: { enabled: true } } });
    const [url, init] = calls()[1]!;
    expect(url).toBe("https://nsvx.test/api/ai/lanes/normal");
    expect(init.method).toBe("PUT");
    expect(init.headers).toMatchObject({ Cookie: "clone_session=s", "X-CSRF-Token": "csrf-1" });
    expect(JSON.parse(init.body as string)).toEqual({ chain });
  });

  it("maps each change to its fixed NSVX route", async () => {
    const { ai, calls } = nsvx(() => json(200, {}));
    const cases: [unknown, string, string][] = [
      [{ op: "lane.restore", lane: "tasks" }, "DELETE", "/api/ai/lanes/tasks/skip"],
      [
        { op: "provider.enabled", provider: "openai-2", enabled: false },
        "POST",
        "/api/ai/providers/openai-2/enabled",
      ],
      [{ op: "cloneAi.routing", enabled: true }, "POST", "/api/group-companies/clone-ai/routing"],
      [{ op: "voice.engine", engine: "gpt_realtime" }, "POST", "/api/voice/engine"],
      [
        { op: "openclaw.registerCloneAi", hash: "h" },
        "POST",
        "/api/ai/openclaw/providers/clone-ai/register",
      ],
    ];
    for (const [change] of cases) {
      await ai.change(parseAiChange(change));
    }
    const writes = calls().filter(([url]) => !url.endsWith("/api/auth/state"));
    expect(
      writes.map(([url, init]) => [init.method, url.replace("https://nsvx.test", "")]),
    ).toEqual(cases.map(([, method, path]) => [method, path]));
  });

  it("refuses changes outside the fixed list before calling NSVX", () => {
    expect(() => parseAiChange({ op: "provider.remove", provider: "openai" })).toThrow();
    expect(() => parseAiChange({ op: "lane.enabled", lane: "../auth", enabled: true })).toThrow();
    // The paid voice budget and model stay NSVX-only.
    expect(() => parseAiChange({ op: "voice.settings", patch: { daily_usd: 50 } })).toThrow();
    expect(() =>
      parseAiChange({ op: "lane.skip", lane: "normal", provider: "openai", reason: "x" }),
    ).toThrow();
  });

  it("reports a lost change as uncertain, once, and a lost read as offline", async () => {
    const { ai, calls } = nsvx(() => {
      throw new Error("socket closed");
    });
    expect(await kindOf(ai.change(parseAiChange({ op: "cloneAi.check" })))).toBe("uncertain");
    expect(calls().filter(([url]) => url.endsWith("/health"))).toHaveLength(1);
    expect(await kindOf(ai.read("state"))).toBe("offline");
  });

  it("never writes without a live owner session", async () => {
    const fetchImpl = vi.fn(async () => json(200, { authenticated: false, csrf: null }));
    const ai = createNsvxAiClient({ baseUrl: "https://nsvx.test", ownerSession: "s", fetchImpl });
    expect(await kindOf(ai.change(parseAiChange({ op: "cloneAi.check" })))).toBe("signed-out");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const unset = createNsvxAiClient({
      baseUrl: "https://nsvx.test",
      ownerSession: undefined,
      fetchImpl,
    });
    expect(await kindOf(unset.read("state"))).toBe("unconfigured");
  });

  it("reads only fixed views", async () => {
    const { ai, calls } = nsvx(() => json(200, { ok: true }));
    await ai.read("voice");
    expect(calls()[0]![0]).toBe("https://nsvx.test/api/voice/gpt/settings");
    expect(await kindOf(ai.read("../auth/state"))).toBe("invalid");
    expect(await kindOf(ai.read("request", { id: "1 or 1" }))).toBe("invalid");
  });
});

describe("nsvx AI chat tools", () => {
  const tools = (senderIsOwner: boolean, ai = nsvx(() => json(200, {})).ai) =>
    createNsvxAiTools(ai, { senderIsOwner, assertInvocationCurrent: () => undefined });
  const run = (tool: unknown, params: unknown) =>
    (tool as { execute: (id: string, params: unknown) => Promise<{ details?: unknown }> }).execute(
      "call-1",
      params,
    );

  it("answers only the owner", async () => {
    const { ai, calls } = nsvx(() => json(200, {}));
    const [read] = tools(false, ai);
    const result = await run(read, { view: "routes" });
    expect(JSON.stringify(result)).toContain("denied");
    expect(calls()).toHaveLength(0);
  });

  it("keeps page-only changes out of chat", async () => {
    const { ai, calls } = nsvx(() => json(200, {}));
    const [, change] = tools(true, ai);
    const result = await run(change, { op: "cloneAi.rollback" });
    expect(JSON.stringify(result)).toContain("denied");
    expect(calls()).toHaveLength(0);
  });
});
