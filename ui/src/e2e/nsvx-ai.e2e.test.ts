import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { expect, it } from "vitest";
import { takeControlUiScreenshotFrame } from "../test-helpers/control-ui-e2e-screenshot.ts";
import {
  defaultControlUiFeatureMethods,
  installMockGateway,
} from "../test-helpers/control-ui-e2e.ts";
import { createControlUiE2eSuite } from "./control-ui-e2e-suite.test-support.ts";

const pluginRoot = fileURLToPath(new URL("../../../extensions/nsvx/", import.meta.url));
const suite = createControlUiE2eSuite({ name: "NSVX AI tab" });
const desktop = { width: 1280, height: 1000 };
const mobile = { width: 390, height: 844 };
const now = new Date().toISOString();
const nowS = Date.now() / 1000;

// Synthetic payloads shaped like NSVX /api/ai/state, /api/group-companies/clone-ai, and /api/voice/*.
const node = (provider: string, model: string, label: string, patch: object = {}) => ({
  priority: 1,
  provider,
  model,
  effort: null,
  label,
  subscription: "",
  eligible: true,
  reason: "ok",
  status: "ready",
  trial: false,
  wait: false,
  reset_at: null,
  active: false,
  ...patch,
});
const lane = (chain: object[], patch: object = {}) => ({
  enabled: true,
  policy: {},
  skips: {},
  disabled_providers: [],
  chain,
  next: { provider: "anthropic", model: "claude-opus-4" },
  running: [],
  ...patch,
});
const provider = (id: string, name: string, patch: object = {}) => ({
  id,
  name,
  subscription: "Max",
  auth_method: "cli",
  usage_url: "",
  install_hint: "",
  login_hint: "",
  state: "CONNECTED",
  stored_state: "CONNECTED",
  enabled: true,
  billing: "subscription",
  error: null,
  last_ok_at: now,
  account: true,
  quota: [],
  ...patch,
});
const aiState = (normalEnabled = true) => ({
  providers: [
    provider("anthropic", "Claude", {
      email: "owner@example.test",
      preferred: true,
      quota_usage: {
        checked_at: nowS,
        windows: { five_hour: { utilization: 0.42 }, seven_day: { utilization: 0.81 } },
      },
    }),
    provider("openai", "Codex", {
      quota_usage: { checked_at: nowS, windows: { primary: { utilization: 0.12 } } },
    }),
    provider("google", "Gemini", {
      quota: [{ scope: "account", state: "exhausted", reset_at: now, windows: {} }],
    }),
    provider("mac-local", "clone-ai", { account: false, subscription: "Local" }),
  ],
  lanes: {
    normal: lane(
      [
        node("anthropic", "claude-opus-4", "Claude Opus", { effort: "high" }),
        node("openai", "gpt-5", "GPT-5"),
        node("google", "gemini-pro", "Gemini Pro", { eligible: false, reason: "exhausted" }),
      ],
      { enabled: normalEnabled },
    ),
    tasks: lane([node("openai", "gpt-5", "GPT-5", { active: true })], {
      running: [{ id: "r1" }],
      next: null,
    }),
    repair: lane([node("anthropic", "claude-opus-4", "Claude Opus")]),
  },
  stats: {
    window_hours: 24,
    total: 128,
    ok: 120,
    failed: 8,
    active: 1,
    avg_latency_ms: 4200,
    time_to_first_output_ms: 900,
    switches: 3,
    exhaustions: 1,
    by_model: [],
    repairs_done: 0,
    repairs_awaiting: 0,
  },
  last_event_id: 1,
  event_version: 2,
  health: { alerts: [], ai_waiting: false },
});
const cloneAi = {
  model: "clone-ai",
  host: "mac128",
  orchestrator: "master",
  weights_loaded: null,
  device: {
    available: true,
    device: {
      registered: true,
      online: true,
      busy: false,
      heartbeat_age_s: 3,
      heartbeat_ttl_s: 3600,
      resources: { memory_free_pct: 64, disk_free_bytes: 412 * 1024 ** 3 },
      resources_age_s: 3,
    },
  },
  shim: { ok: true, mac_online: true },
  routing: {
    enabled: true,
    lanes: [
      {
        lane: "normal",
        position: 4,
        model: "clone-ai",
        eligible: true,
        reason: "ok",
        active: false,
      },
    ],
  },
  promotion: {
    state: "promoted",
    rollback_available: true,
    promoted_at: now,
    canary: { passed: 9, total: 10 },
    window: { attempts: 40, failed: 3, timeouts: 1 },
  },
  training: {
    items: [
      {
        id: "7",
        model: "clone-ai",
        status: "prepared",
        created_at: now,
        chart: { cases: 50, reference: 41, clone_ai: 37 },
      },
    ],
  },
};
const voice = {
  settings: {
    model: "gpt-realtime-2.1-mini",
    voice: "marin",
    style: "natural",
    language: "pt-PT",
    length: "normal",
    instructions: "",
    autoplay: true,
    mic_input: true,
    max_seconds: 60,
    connect_timeout_s: 10,
    daily_usd: 1,
    max_per_hour: 30,
  },
  status: {
    key_present: true,
    spend_today_usd: "0.32",
    daily_usd: 1,
    routing: [{ label: "WhatsApp", channel: "whatsapp", ready: true }],
  },
  options: {
    models: ["gpt-realtime-2.1-mini"],
    voices: ["marin", "cedar", "alloy"],
    styles: ["natural", "friendly", "professional", "casual"],
    languages: ["auto", "pt-PT", "en", "es"],
    lengths: ["short", "normal", "detailed"],
  },
};
const requests = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    lane: "normal",
    provider: "anthropic",
    model: "claude-opus-4",
    status: "ok",
    task_type: "reply_draft",
    started_at: new Date(Date.now() - 6000).toISOString(),
    finished_at: now,
    error_category: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    lane: "tasks",
    provider: "google",
    model: "gemini-pro",
    status: "failed",
    task_type: "plan",
    started_at: now,
    finished_at: now,
    error_category: "quota_exhausted",
  },
];
const evals = [{ suite: "replies", run_at: now, passed: 18, total: 18 }];
const openclaw = {
  hash: "h1",
  providers: [
    { id: "anthropic", kind: "subscription", blocked: false, models: [{ id: "claude-opus-4" }] },
    { id: "openrouter", kind: "paid", blocked: true, models: [{ id: "x" }] },
  ],
  cloneAi: { registered: false, healthy: true },
};

async function capture(
  page: Page,
  name: string,
  content: Parameters<typeof takeControlUiScreenshotFrame>[2],
) {
  if (process.env.OPENCLAW_CAPTURE_UI_PROOF !== "1") {
    return;
  }
  for (const viewport of [desktop, mobile]) {
    const frame = await takeControlUiScreenshotFrame(page, page.locator(".nsvx"), content, {
      animations: "disabled",
      viewport,
    });
    await writeFile(
      path.join(suite.artifactDir, `nsvx-ai-${name}-${viewport.width}.png`),
      frame.png,
    );
  }
  await page.setViewportSize(desktop);
}

suite.define(() => {
  it("runs NSVX AI routes, accounts, clone-ai, voice, log, and OpenClaw natively", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const gateway = await installMockGateway(page, {
          nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
          operatorScopes: ["operator.admin"],
          featureMethods: [...defaultControlUiFeatureMethods, "nsvx.ai.read", "nsvx.ai.change"],
          methodResponses: {
            "plugins.list": { plugins: [], diagnostics: [], mutationAllowed: true },
            "nsvx.ai.read": {
              cases: [
                { match: { view: "state" }, response: aiState() },
                { match: { view: "cloneAi" }, response: cloneAi },
                { match: { view: "voice" }, response: voice },
                { match: { view: "voiceEngine" }, response: { engine: "gpt_realtime" } },
                { match: { view: "requests" }, response: requests },
                { match: { view: "evals" }, response: evals },
                { match: { view: "openclaw" }, response: openclaw },
              ],
            },
            "nsvx.ai.change": {
              cases: [
                { match: { op: "lane.enabled" }, response: aiState(false) },
                { match: { op: "lane.order" }, response: aiState() },
                {
                  match: { op: "voice.settings" },
                  response: { settings: { ...voice.settings, style: "friendly" } },
                },
              ],
            },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=ai`);
        const surface = page.locator(".nsvx");
        const view = (name: string) => surface.getByRole("tab", { name, exact: true });

        // Routes: each lane's order with live state, 24 h stats, and the next route marked.
        await surface.getByText("Claude Opus", { exact: true }).first().waitFor();
        expect(await view("Routes").getAttribute("aria-selected")).toBe("true");
        await surface.getByText("128", { exact: true }).waitFor();
        await surface.getByText("Used up", { exact: true }).waitFor();
        await capture(page, "routes", [surface.getByText("GPT-5", { exact: true }).first()]);

        // Turning a lane off sends that change, and NSVX's answer is what the page shows.
        const chat = surface.locator(".nsvx-ai-lane").first();
        await chat.getByRole("switch").click();
        expect(
          (await gateway.waitForRequest("nsvx.ai.change", { match: { op: "lane.enabled" } }))
            .params,
        ).toEqual({
          op: "lane.enabled",
          lane: "normal",
          enabled: false,
        });
        await expect
          .poll(() => chat.getByRole("switch").getAttribute("aria-checked"))
          .toBe("false");

        // Moving a route sends the whole new order.
        await chat.getByRole("button", { name: "Down" }).first().click();
        const order = await gateway.waitForRequest("nsvx.ai.change", {
          match: { op: "lane.order" },
        });
        expect(
          (order.params as { chain: { provider: string }[] }).chain.map((route) => route.provider),
        ).toEqual(["openai", "anthropic", "google"]);

        // Accounts: subscription usage bars and state.
        await view("Accounts").click();
        await surface.getByText("owner@example.test", { exact: true }).waitFor();
        await capture(page, "accounts", [surface.getByText("Gemini", { exact: true })]);

        // clone-ai: Mac health, routing, and training.
        await view("clone-ai").click();
        await surface.getByText("mac128", { exact: true }).waitFor();
        await surface.getByText("412 GiB", { exact: true }).waitFor();
        await surface.getByRole("button", { name: "Roll back" }).click();
        await surface.getByText("Go back to the previous clone-ai?", { exact: true }).waitFor();
        await surface.getByRole("button", { name: "Cancel" }).click();
        await capture(page, "clone-ai", [surface.getByText("Tries 40", { exact: true })]);

        // Voice: engine and settings; a change saves through NSVX.
        await view("Voice").click();
        await surface.getByText("0.32 / 1.00 USD", { exact: true }).waitFor();
        await surface.getByLabel("Style").selectOption("friendly");
        expect(
          (await gateway.waitForRequest("nsvx.ai.change", { match: { op: "voice.settings" } }))
            .params,
        ).toEqual({
          op: "voice.settings",
          patch: { style: "friendly" },
        });
        await capture(page, "voice", [surface.getByText("WhatsApp", { exact: true })]);

        // Log: latest requests with errors, and test suites.
        await view("Log").click();
        await surface.getByText("quota_exhausted", { exact: false }).waitFor();
        await surface.getByText("replies 18/18", { exact: true }).waitFor();
        await capture(page, "log", [surface.getByText("replies 18/18", { exact: true })]);

        // OpenClaw: models this Gateway offers; paid ones are marked.
        await view("OpenClaw").click();
        await surface.getByRole("button", { name: "Connect clone-ai" }).waitFor();
        await surface.getByText("Paid", { exact: true }).waitFor();
        await capture(page, "openclaw", [surface.getByText("openrouter", { exact: true })]);

        // The sub view survives a reload.
        expect(new URL(page.url()).searchParams.get("ai")).toBe("openclaw");
        expect(pageErrors).toEqual([]);
      },
    );
  });
});
