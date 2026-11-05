import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { takeControlUiScreenshotFrame } from "../test-helpers/control-ui-e2e-screenshot.ts";
import { installMockGateway } from "../test-helpers/control-ui-e2e.ts";
import { createControlUiE2eSuite } from "./control-ui-e2e-suite.test-support.ts";

const pluginRoot = fileURLToPath(new URL("../../../extensions/nsvx/", import.meta.url));
const suite = createControlUiE2eSuite({ name: "NSVX AI" });
const desktop = { width: 1280, height: 900 };
const mobile = { width: 390, height: 844 };
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const capture = process.env.OPENCLAW_CAPTURE_UI_PROOF === "1";

// Synthetic NSVX payloads, shaped like /api/ai/state, /api/ai/requests, /api/ai/inference-ops, /api/ai/api-keys,
// the Clone AI panel and bench, local training, the OpenClaw provider list, and /api/voice/gpt/settings.
const node = (over: Record<string, unknown>) => ({
  effort: "high",
  subscription: "Pro",
  eligible: true,
  reason: "",
  status: "ready",
  trial: false,
  reset_at: null,
  active: false,
  ...over,
});

const chat = [
  node({
    provider: "anthropic",
    model: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    subscription: "Max",
    active: true,
  }),
  node({ provider: "openai", model: "gpt-6.1-terra", label: "GPT 6.1 Terra" }),
  node({
    provider: "google",
    model: "gemini-3-pro",
    label: "Gemini 3 Pro",
    subscription: "AI Pro",
    eligible: false,
    reason: "rate_limited",
    reset_at: new Date(Date.now() + 95 * 60_000).toISOString(),
  }),
];
const work = [
  node({ provider: "openai", model: "gpt-6.1-terra", label: "GPT 6.1 Terra", effort: "medium" }),
  node({
    provider: "anthropic-2",
    model: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    subscription: "Max",
  }),
];
const lane = (chain: unknown[], extra: Record<string, unknown> = {}) => ({
  enabled: true,
  policy: { max_retries: 2, timeout_s: 600, background_max_utilization_pct: 80 },
  chain,
  next: null,
  running: [],
  ...extra,
});

const aiState = {
  providers: [
    {
      id: "anthropic",
      name: "Anthropic",
      subscription: "Max",
      state: "ACTIVE",
      enabled: true,
      account: true,
      preferred: true,
      email: "owner@example.com",
      quota: [],
      quota_usage: {
        checked_at: Date.now() / 1000,
        windows: { five_hour: { utilization: 0.34 }, seven_day: { utilization: 0.61 } },
      },
    },
    {
      id: "openai",
      name: "OpenAI",
      subscription: "Pro",
      state: "AVAILABLE",
      enabled: true,
      account: true,
      email: "team@example.com",
      quota: [],
      quota_usage: {
        checked_at: Date.now() / 1000,
        windows: { primary: { utilization: 0.12 }, secondary: { utilization: 0.93 } },
      },
    },
    {
      id: "google",
      name: "Google",
      subscription: "AI Pro",
      state: "RATE_LIMITED",
      enabled: true,
      quota: [],
    },
  ],
  lanes: {
    normal: lane(chat, {
      running: [
        {
          id: "r9",
          task_type: "reply",
          provider: "anthropic",
          model: "claude-opus-5-5",
          started_at: ago(0),
          first_output_at: null,
        },
      ],
    }),
    tasks: lane(work, { next: { provider: "openai", model: "gpt-6.1-terra" } }),
    repair: lane(work, {
      next: { provider: "openai", model: "gpt-6.1-terra" },
      approval_mode: true,
      require_approval: true,
    }),
    legal: lane(chat.slice(0, 2), { source_chain: "normal" }),
    pdf_forms: lane(work.slice(0, 1), { enabled: false }),
  },
  stats: {
    window_hours: 24,
    total: 412,
    ok: 401,
    failed: 11,
    avg_latency_ms: 3400,
    time_to_first_output_ms: 900,
    switches: 6,
    exhaustions: 0,
  },
  health: { at: Date.now() / 1000, alerts: [], tasks_due: 0, drafts_due: 0 },
};

const requests = [
  {
    id: "q1",
    lane: "normal",
    task_type: "reply",
    provider: "anthropic",
    model: "claude-opus-5-5",
    actual_model: "claude-opus-5-5",
    effort: "high",
    status: "ok",
    attempts: 1,
    error_category: null,
    started_at: ago(2),
    duration_ms: 2800,
  },
  {
    id: "q2",
    lane: "tasks",
    task_type: "plan",
    provider: "openai",
    model: "gpt-6.1-terra",
    actual_model: "gpt-6.1-terra",
    effort: "medium",
    status: "ok",
    attempts: 1,
    error_category: null,
    started_at: ago(6),
    duration_ms: 9100,
  },
  {
    id: "q3",
    lane: "normal",
    task_type: "reply",
    provider: "google",
    model: "gemini-3-pro",
    actual_model: null,
    effort: "high",
    status: "limited",
    attempts: 2,
    error_category: "rate_limited",
    started_at: ago(14),
    duration_ms: 400,
  },
  {
    id: "q4",
    lane: "repair",
    task_type: "fix",
    provider: "openai",
    model: "gpt-6.1-terra",
    actual_model: null,
    effort: "high",
    status: "failed",
    attempts: 3,
    error_category: "timeout",
    started_at: ago(50),
    duration_ms: 600000,
  },
];

const ops = {
  work: { provider: "openai", model: "gpt-6.1-terra", effort: "medium", label: "GPT 6.1 Terra" },
  lanes: [
    { id: "normal", work: false, chain: chat },
    { id: "tasks", work: true, chain: work },
    { id: "repair", work: true, chain: work },
    { id: "legal", work: true, chain: chat.slice(0, 2) },
    { id: "pdf_forms", work: true, chain: work.slice(0, 1) },
  ],
  grow: { model: "gpt-6.1-terra", effort: "high" },
  serverAccounts: {
    document: {
      categories: {
        odd: { codex: ["codex-1"], claude: ["claude-1"] },
        even: { codex: ["codex-2"], claude: ["claude-2"] },
      },
      servers: [
        { id: "runners-4", production: false, parity: "odd" },
        { id: "master", production: false, parity: "even" },
        { id: "box", production: true, parity: null },
      ],
      overrides: {},
    },
    resolved: [
      {
        id: "runners-4",
        production: false,
        parity: "odd",
        accounts: { codex: ["codex-1"], claude: ["claude-1"] },
      },
      {
        id: "master",
        production: false,
        parity: "even",
        accounts: { codex: ["codex-2"], claude: ["claude-2"] },
      },
      { id: "box", production: true, parity: null, accounts: null },
    ],
  },
  gateway: {
    hosts: ["dev.nsvx.com"],
    available_here: true,
    workModel: "nsvx-work",
    chatModel: "nsvx-auto",
  },
};

const keys = {
  available_here: true,
  settings: { enabled: true, default_rpm: 30, default_tokens_per_day: 200000 },
  users: [
    { id: "u1", name: "openhome", active: true },
    { id: "u2", name: "opendrive", active: true },
  ],
  keys: [
    {
      id: "k1",
      user_id: "u1",
      label: "web",
      prefix: "nsvx_4f2a",
      state: "active",
      last_used_at: ago(3),
    },
    {
      id: "k2",
      user_id: "u2",
      label: "sync",
      prefix: "nsvx_9c1d",
      state: "active",
      last_used_at: ago(80),
    },
    {
      id: "k3",
      user_id: "u2",
      label: "old",
      prefix: "nsvx_0b7e",
      state: "revoked",
      last_used_at: ago(9000),
    },
  ],
  usage: {
    keys: [
      { key_id: "k1", requests: 128, ok: 126, tokens_today: 4100, p50_ms: 2100 },
      { key_id: "k2", requests: 40, ok: 40, tokens_today: 900, p50_ms: 1700 },
    ],
  },
};

const cloneAi = {
  host: "mac128",
  device: {
    available: true,
    device: {
      registered: true,
      busy: false,
      heartbeat_age_s: 3,
      heartbeat_ttl_s: 15,
      resources: { memory_free_pct: 58, disk_free_bytes: 412 * 1024 ** 3 },
    },
  },
  shim: { ok: true, mac_online: true },
  routing: {
    enabled: true,
    lanes: [
      { lane: "normal", position: 4, eligible: true, reason: "", active: false },
      { lane: "tasks", position: 3, eligible: true, reason: "", active: false },
    ],
  },
  promotion: {
    state: "promoted",
    rollback_available: true,
    promoted_at: ago(3000),
    canary: { passed: 19, total: 20 },
    window: { attempts: 84, failed: 3, timeouts: 1 },
  },
  training: {
    items: [
      {
        id: "tr1",
        status: "prepared",
        created_at: ago(1400),
        chart: { cases: 40, reference: 31, clone_ai: 28 },
      },
    ],
  },
};

const bench = {
  status: { status: "idle", live: true, stale: false },
  mac_online: true,
  runs: [
    { source_id: "b1", kind: "training", state: "done", progress: 100, measured_at: ago(1400) },
  ],
};

const training = {
  items: [
    {
      id: "run-1",
      model: "qwen35-4b",
      status: "prepared",
      created_at: ago(700),
      evaluation: { state: "review_required", scores: { baseline: 61, candidate: 67 }, cases: 50 },
    },
  ],
};

const providers = {
  hash: "cfg-1",
  providers: [],
  cloneAi: { registered: true, healthy: true },
};

const voice = {
  settings: {
    model: "gpt-realtime",
    voice: "marin",
    style: "natural",
    language: "pt-PT",
    length: "normal",
    instructions: "",
    autoplay: true,
    mic_input: true,
    max_seconds: 60,
    connect_timeout_s: 10,
    daily_usd: 5,
    max_per_hour: 30,
  },
  status: {
    key_present: true,
    spend_today_usd: "1.20",
    daily_usd: 5,
    routing: [
      { label: "WhatsApp", channel: "whatsapp", ready: true },
      { label: "Telegram", channel: "telegram", ready: false },
    ],
  },
  options: {
    models: ["gpt-realtime"],
    voices: ["marin", "cedar", "alloy"],
    styles: ["natural", "friendly", "professional", "casual"],
    languages: ["auto", "pt-PT", "en", "es"],
    lengths: ["short", "normal", "detailed"],
  },
};

const viewCases = [
  { match: { view: "aiState" }, response: aiState },
  { match: { view: "aiRequests" }, response: requests },
  { match: { view: "aiOps" }, response: ops },
  { match: { view: "aiKeys" }, response: keys },
  { match: { view: "cloneAi" }, response: cloneAi },
  { match: { view: "cloneAiBench" }, response: bench },
  { match: { view: "localTraining" }, response: training },
  { match: { view: "aiProviders" }, response: providers },
  { match: { view: "gptVoice" }, response: voice },
];

type Page = Parameters<Parameters<typeof suite.withPage>[1]>[0]["page"];

async function shoot(page: Page, name: string, viewports = [desktop, mobile], focus?: string) {
  for (const viewport of viewports) {
    if (focus) {
      await page.setViewportSize(viewport);
      await page.locator(focus).first().scrollIntoViewIfNeeded();
    }
    const frame = await takeControlUiScreenshotFrame(page, page.locator(".nsvx"), [], {
      animations: "disabled",
      viewport,
    });
    await writeFile(path.join(suite.artifactDir, `${name}-${viewport.width}.png`), frame.png);
  }
  await page.setViewportSize(desktop);
}

suite.define(() => {
  it("shows routes, accounts, flows, Clone AI, voice, and log, and sends each change to NSVX", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const gateway = await installMockGateway(page, {
          nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
          operatorScopes: ["operator.admin"],
          methodResponses: {
            "nsvx.view": { cases: viewCases },
            // Each change answers as its NSVX route does; lane and account changes return the new state.
            "nsvx.ai.change": {
              cases: [
                {
                  match: { action: "voice" },
                  response: { settings: { ...voice.settings, length: "short" } },
                },
                {
                  match: { action: "training" },
                  response: { executed: false, dispatched: true, mac_online: true },
                },
                {
                  match: { action: "appsGateway" },
                  response: { ...keys.settings, enabled: false },
                },
                {
                  match: { action: "serverParity" },
                  response: { mirror: "patched", resolved: ops.serverAccounts.resolved },
                },
                { response: aiState },
              ],
            },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=ai`);
        const surface = page.locator(".nsvx");
        const change = async (action: string) =>
          (await gateway.getRequests("nsvx.ai.change"))
            .map((r) => r.params as Record<string, unknown>)
            .find((p) => p.action === action);

        // Routes: every lane with the model answering now, its fallback order, and provider logos.
        const tasks = surface.getByRole("article", { name: "Tasks" });
        await tasks.waitFor();
        await surface
          .getByRole("article", { name: "Chat" })
          .getByText("Answering")
          .first()
          .waitFor();
        expect(await surface.getByRole("img", { name: "Claude" }).count()).toBeGreaterThan(0);
        if (capture) {
          await shoot(page, "nsvx-ai-routes");
        }
        await tasks.getByRole("switch").click();
        await expect
          .poll(() => change("laneEnabled"))
          .toEqual({
            action: "laneEnabled",
            lane: "tasks",
            on: false,
          });
        await tasks.getByRole("button", { name: "Down GPT 6.1 Terra" }).click();
        await expect
          .poll(() => change("laneOrder"))
          .toEqual({
            action: "laneOrder",
            lane: "tasks",
            chain: [
              { provider: "anthropic-2", model: "claude-sonnet-5-5", effort: "high" },
              { provider: "openai", model: "gpt-6.1-terra", effort: "medium" },
            ],
          });

        // Accounts: subscription usage as the provider reports it, with switches.
        await surface.getByRole("tab", { name: "Accounts" }).click();
        await surface.getByText("team@example.com").waitFor();
        expect(new URL(page.url()).searchParams.get("ai")).toBe("accounts");
        if (capture) {
          await shoot(page, "nsvx-ai-accounts");
        }

        // Flow: who is served by which model, server account groups, and the apps calling NSVX AI.
        await surface.getByRole("tab", { name: "Flow" }).click();
        await surface.getByText("nsvx_4f2a…").waitFor();
        await surface
          .getByRole("group", { name: "box" })
          .getByRole("button", { name: "Even" })
          .click();
        await expect
          .poll(() => change("serverParity"))
          .toEqual({
            action: "serverParity",
            serverId: "box",
            parity: "even",
          });
        await surface.getByRole("switch", { name: "Apps use AI" }).click();
        await surface.getByText("Stop AI for every app?").waitFor();
        expect(await change("appsGateway")).toBeUndefined();
        await surface.locator(".nsvx-confirm").getByRole("button", { name: "Stop" }).click();
        await expect
          .poll(() => change("appsGateway"))
          .toEqual({
            action: "appsGateway",
            on: false,
          });
        if (capture) {
          await shoot(page, "nsvx-ai-flow");
          await shoot(page, "nsvx-ai-flow-servers", [mobile], ".nsvx-ai-servers");
          await shoot(page, "nsvx-ai-flow-apps", [mobile], ".nsvx-ai-apps");
        }

        // Clone AI: the Mac, routing, promotion, training progress, and a train command NSVX can dedupe.
        await surface.getByRole("tab", { name: "Clone AI" }).click();
        await surface.getByText("mac128", { exact: false }).waitFor();
        await surface.getByRole("button", { name: "Train" }).click();
        await expect.poll(async () => (await change("training"))?.command).toBe("start");
        expect(String((await change("training"))?.commandId)).toMatch(/^[0-9a-f-]{36}$/);
        if (capture) {
          await shoot(page, "nsvx-ai-clone");
          await shoot(page, "nsvx-ai-clone-training", [mobile], ".nsvx-ai-train");
        }

        // Voice: GPT voice-note settings save on change.
        await surface.getByRole("tab", { name: "Voice" }).click();
        await surface.getByText("GPT Realtime").waitFor();
        await surface.getByRole("radio", { name: "Short" }).click();
        await expect
          .poll(() => change("voice"))
          .toEqual({
            action: "voice",
            settings: { length: "short" },
          });
        if (capture) {
          await shoot(page, "nsvx-ai-voice");
        }

        // Log: recent model calls with their state.
        await surface.getByRole("tab", { name: "Log" }).click();
        await surface.getByText("gemini-3-pro").waitFor();
        if (capture) {
          await shoot(page, "nsvx-ai-log", [mobile]);
        }
        expect(pageErrors).toEqual([]);
      },
    );
  });
});
