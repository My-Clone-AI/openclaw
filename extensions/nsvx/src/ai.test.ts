import { describe, expect, it, vi } from "vitest";
import { usage, type AiState } from "./ai-data.js";
import { createNsvxAiTool } from "./ai-tool.js";
import { changeAi } from "./ai.js";
import { createNsvxClient, type NsvxErrorKind } from "./client.js";

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const state: AiState = {
  providers: [
    {
      id: "anthropic-2",
      name: "Anthropic 2",
      subscription: "Max",
      state: "AVAILABLE",
      enabled: true,
      email: "owner@example.com",
      quota: [],
      quota_usage: { checked_at: Date.now() / 1000, windows: { five_hour: { utilization: 0.42 } } },
    },
  ],
  lanes: {
    tasks: {
      enabled: true,
      policy: {},
      chain: [
        {
          provider: "openai",
          model: "gpt-6.1-terra",
          effort: "high",
          label: "GPT 6.1 Terra",
          subscription: "Pro",
          eligible: true,
          reason: "",
          status: "ready",
          trial: false,
          reset_at: null,
          active: false,
        },
        {
          provider: "anthropic-2",
          model: "claude-opus-5-5",
          effort: "medium",
          label: "Claude Opus 5.5",
          subscription: "Max",
          eligible: false,
          reason: "rate_limited",
          status: "limited",
          trial: false,
          reset_at: null,
          active: false,
        },
      ],
      next: { provider: "openai", model: "gpt-6.1-terra" },
      running: [],
    },
  },
  stats: {
    window_hours: 24,
    total: 10,
    ok: 9,
    failed: 1,
    avg_latency_ms: 1200,
    time_to_first_output_ms: null,
    switches: 1,
    exhaustions: 0,
  },
};

/** A fake NSVX: the sign-in state route answers with a CSRF token, every other route with `answer`. */
function nsvx(answer: (url: string, init: RequestInit) => Response = () => json(200, state)) {
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
      .map(([url, init]) => [
        init.method,
        url.replace("https://nsvx.test", ""),
        init.body ? JSON.parse(init.body as string) : undefined,
      ]);
  return { client, fetchImpl, calls };
}

async function kindOf(run: Promise<unknown>): Promise<NsvxErrorKind | undefined> {
  return run.then(
    () => undefined,
    (cause: unknown) => (cause as { kind: NsvxErrorKind }).kind,
  );
}

describe("AI changes", () => {
  it("sends each change to its NSVX route with the session's CSRF token", async () => {
    const { client, fetchImpl, calls } = nsvx();
    await changeAi(client, { action: "laneEnabled", lane: "tasks", on: false });
    await changeAi(client, {
      action: "laneOrder",
      lane: "tasks",
      chain: [
        { provider: "anthropic-2", model: "claude-opus-5-5", effort: "medium" },
        { provider: "openai", model: "gpt-6.1-terra", effort: "high" },
      ],
    });
    await changeAi(client, {
      action: "laneSkip",
      lane: "tasks",
      providerId: "openai",
      reason: " maintenance ",
    });
    await changeAi(client, { action: "laneRestore", lane: "tasks" });
    await changeAi(client, { action: "providerEnabled", providerId: "anthropic-2", on: true });
    await changeAi(client, { action: "lanePolicy", policy: { max_retries: 2 } });
    await changeAi(client, { action: "cloneAiRouting", on: true });
    await changeAi(client, { action: "cloneAiRegister", hash: "cfg-hash" });
    await changeAi(client, { action: "trainingPrepare", model: "qwen3-8b" });
    await changeAi(client, { action: "trainingRevoke", runId: "run-1" });
    await changeAi(client, { action: "voice", settings: { voice: "marin", autoplay: false } });
    expect(calls()).toEqual([
      ["PUT", "/api/ai/lanes/tasks", { enabled: false }],
      [
        "PUT",
        "/api/ai/lanes/tasks",
        {
          chain: [
            { provider: "anthropic-2", model: "claude-opus-5-5", effort: "medium" },
            { provider: "openai", model: "gpt-6.1-terra", effort: "high" },
          ],
        },
      ],
      ["POST", "/api/ai/lanes/tasks/skip", { provider: "openai", reason: "maintenance" }],
      ["DELETE", "/api/ai/lanes/tasks/skip", {}],
      ["POST", "/api/ai/providers/anthropic-2/enabled", { enabled: true }],
      ["PUT", "/api/ai/lanes/normal", { policy: { max_retries: 2 } }],
      ["PUT", "/api/ai/lanes/repair", { policy: { max_retries: 2 } }],
      ["POST", "/api/group-companies/clone-ai/routing", { enabled: true }],
      ["POST", "/api/ai/openclaw/providers/clone-ai/register", { hash: "cfg-hash" }],
      ["POST", "/api/ai/local/training", { model: "qwen3-8b" }],
      ["POST", "/api/ai/local/training/run-1/revoke", {}],
      ["POST", "/api/voice/gpt/settings", { voice: "marin", autoplay: false }],
    ]);
    expect(fetchImpl.mock.calls[1]?.[1].headers).toEqual(
      expect.objectContaining({ "X-CSRF-Token": "csrf-1", Cookie: "clone_session=owner" }),
    );
  });

  it("rejects values NSVX's contract would refuse before calling NSVX", async () => {
    const { client, fetchImpl } = nsvx();
    for (const params of [
      { action: "laneEnabled", lane: "everything", on: true },
      { action: "laneSkip", lane: "tasks", providerId: "openai", reason: "x" },
      { action: "laneOrder", lane: "tasks", chain: [] },
      { action: "lanePolicy", policy: { timeout_s: 5 } },
      { action: "providerEnabled", providerId: "../admin", on: true },
      { action: "trainingPrepare", model: "llama-70b" },
      { action: "voice", settings: { daily_usd: 500 } },
      { action: "connect", providerId: "openai" },
    ]) {
      expect(await kindOf(changeAi(client, params))).toBe("invalid");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("moves one server's account group on the document NSVX holds now", async () => {
    const document = {
      categories: { odd: { codex: ["c1"], claude: ["a1"] }, even: { codex: ["c2"], claude: [] } },
      servers: [
        { id: "runners-4", production: false, parity: "odd" },
        { id: "box", production: true, parity: null },
      ],
      overrides: { box: { claude: ["a3"] } },
    };
    const { client, calls } = nsvx((url) =>
      url.endsWith("/api/ai/inference-ops")
        ? json(200, { serverAccounts: { document, resolved: [] } })
        : json(200, { mirror: "patched", resolved: [] }),
    );
    await changeAi(client, { action: "serverParity", serverId: "box", parity: "even" });
    expect(calls()).toEqual([
      ["GET", "/api/ai/inference-ops", undefined],
      [
        "PUT",
        "/api/ai/inference-ops/server-accounts",
        {
          ...document,
          servers: [document.servers[0], { id: "box", production: true, parity: "even" }],
        },
      ],
    ]);
    expect(
      await kindOf(changeAi(client, { action: "serverParity", serverId: "nope", parity: null })),
    ).toBe("not-found");
  });

  it("sends training commands with the caller's id, so NSVX dedupes a repeat", async () => {
    const { client, calls } = nsvx(() => json(200, { executed: false, dispatched: true }));
    const commandId = "6f1c2a7e-1b2c-4d5e-8f90-123456789abc";
    await changeAi(client, { action: "training", command: "start", commandId });
    await changeAi(client, { action: "training", command: "pause", commandId });
    await changeAi(client, { action: "appsGateway", on: false });
    expect(calls()).toEqual([
      [
        "POST",
        "/api/group-companies/clone-ai/bench/commands",
        { command_id: commandId, model: "clone-ai", action: "start", profile: "standard" },
      ],
      [
        "POST",
        "/api/group-companies/clone-ai/bench/commands",
        { command_id: commandId, model: "clone-ai", action: "pause" },
      ],
      ["PUT", "/api/ai/api-keys/settings", { enabled: false }],
    ]);
    expect(
      await kindOf(changeAi(client, { action: "training", command: "start", commandId: "1" })),
    ).toBe("invalid");
    expect(
      await kindOf(changeAi(client, { action: "training", command: "benchmark", commandId })),
    ).toBe("invalid");
  });

  it("reports a lost answer from a test or change as uncertain", async () => {
    const { client } = nsvx(() => {
      throw new Error("socket closed");
    });
    expect(await kindOf(changeAi(client, { action: "laneTest", lane: "tasks" }))).toBe("uncertain");
  });

  it("treats a stale or failed usage reading as unknown, never as zero", () => {
    const p = state.providers[0]!;
    expect(usage(p)).toEqual([{ key: "five_hour", used: 0.42, resetsAt: null }]);
    expect(usage({ ...p, quota_usage: { ...p.quota_usage!, checked_at: 0 } })[0]?.used).toBeNull();
    expect(
      usage({ ...p, quota_usage: { ...p.quota_usage!, error: "timeout" } })[0]?.used,
    ).toBeNull();
  });
});

describe("nsvx_ai", () => {
  it("answers only the owner and changes only on the current turn", async () => {
    const { client, calls } = nsvx();
    const stale = vi.fn(() => {
      throw new Error("stale turn");
    });
    const other = createNsvxAiTool(client, { senderIsOwner: false });
    expect(JSON.stringify(await other.execute("c1", { action: "status" }))).toContain("denied");
    const owner = createNsvxAiTool(client, { senderIsOwner: true, assertInvocationCurrent: stale });
    expect(JSON.stringify(await owner.execute("c2", { action: "status" }))).toContain(
      "gpt-6.1-terra",
    );
    await expect(owner.execute("c3", { action: "laneOff", lane: "tasks" })).rejects.toThrow(
      "stale turn",
    );
    expect(calls()).toEqual([["GET", "/api/ai/state", undefined]]);
  });

  it("moves a route to the top of its lane from the order NSVX reports", async () => {
    const { client, calls } = nsvx();
    const tool = createNsvxAiTool(client, { senderIsOwner: true });
    await tool.execute("c1", { action: "laneFirst", lane: "tasks", providerId: "anthropic-2" });
    expect(calls().at(-1)).toEqual([
      "PUT",
      "/api/ai/lanes/tasks",
      {
        chain: [
          { provider: "anthropic-2", model: "claude-opus-5-5", effort: "medium" },
          { provider: "openai", model: "gpt-6.1-terra", effort: "high" },
        ],
      },
    ]);
  });
});
