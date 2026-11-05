import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "playwright";
import { expect, it } from "vitest";
import { takeControlUiScreenshotFrame } from "../test-helpers/control-ui-e2e-screenshot.ts";
import { installMockGateway } from "../test-helpers/control-ui-e2e.ts";
import { createControlUiE2eSuite } from "./control-ui-e2e-suite.test-support.ts";

const pluginRoot = fileURLToPath(new URL("../../../extensions/nsvx/", import.meta.url));
const suite = createControlUiE2eSuite({ name: "NSVX calls" });
const desktop = { width: 1280, height: 1000 };
const phone = { width: 390, height: 844 };
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const LIVE = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e01";
const OUT = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e02";
const UNKNOWN = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e03";
const REC = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e04";
const CARD = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e05";
const MISSION = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e06";

// Synthetic payloads shaped like NSVX /api/calls/status, /api/calls, /api/voice/live/{id}, /api/phone-lookup.
const status = {
  enabled: true,
  voice_enabled: true,
  gemini_ready: true,
  outgoing_blocker: null,
  kill_switch: null,
  model: "voice-model",
  public_flight_schedule: false,
  budget: { daily_usd: 5, monthly_usd: 60, max_call_seconds: 900, max_concurrent: 2 },
  spend_today_usd: "1.85",
  spend_month_usd: "12.40",
  owner_pin_set: true,
  carrier_ready: true,
  from_number: "+351 210 000 000",
  allowed_prefixes: ["+351", "+34"],
  phone_routes: [
    {
      carrier: "telnyx",
      provider: "gemini",
      configured: true,
      provider_ready: true,
      direction: "inbound",
    },
    {
      carrier: "twilio",
      provider: "gemini",
      configured: true,
      provider_ready: false,
      direction: "both",
    },
  ],
  active: [
    {
      id: LIVE,
      state: "in_call",
      label: "In call",
      channel: "whatsapp",
      direction: "inbound",
      caller: "Courier desk",
    },
  ],
};
const row = (id: string, extra: Record<string, unknown>) => ({
  id,
  state: "ended",
  label: "Ended",
  channel: "pstn",
  direction: "inbound",
  who: "Courier desk",
  person_id: "p1",
  purpose: null,
  started_at: ago(30),
  ended_at: ago(25),
  cost_usd: "0.42",
  cost_estimated: true,
  outcome: null,
  n_turns: 8,
  ...extra,
});
const calls = [
  row(LIVE, { state: "in_call", label: "In call", channel: "whatsapp", started_at: ago(2) }),
  row(OUT, {
    direction: "outbound",
    who: "Clinic front desk",
    purpose: "Move Friday's appointment",
    started_at: ago(50),
    n_turns: 14,
    cost_estimated: false,
  }),
  row(UNKNOWN, { who: "+351 910 000 001", person_id: null, started_at: ago(60 * 26) }),
  row("1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e07", {
    channel: "browser",
    who: null,
    started_at: ago(60 * 30),
  }),
];
const detail = {
  ...row(OUT, {
    direction: "outbound",
    who: "Clinic front desk",
    purpose: "Move Friday's appointment",
    model: "voice-model",
  }),
  rev: 6,
  media_state: "ready",
  turns: [
    {
      id: 1,
      role: "assistant",
      text: "Hello, I'm calling on behalf of the owner.",
      status: "final",
      at: ago(50),
    },
    { id: 2, role: "user", text: "Sure, how can I help?", status: "final", at: ago(50) },
    {
      id: 3,
      role: "assistant",
      text: "Could we move Friday's appointment to Monday?",
      status: "final",
      at: ago(49),
    },
    { id: 4, role: "user", text: "Monday at 10 works.", status: "final", at: ago(49) },
  ],
  actions: [{ kind: "meeting", status: "created", mission_id: MISSION }],
  tools: [{ name: "calendar", status: "ok", result_summary: { sources: ["Calendar"] } }],
  messages: [],
};
// A 0.1 s silent WAV, so the player has something real to load.
const wav = (() => {
  const samples = 800;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  return buffer.toString("base64");
})();
const card = {
  id: CARD,
  e164: "+351910000001",
  name: "Parcel delivery service",
  kind: "delivery",
  confidence: 0.82,
  origin: "public_web",
  person_id: null,
  expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  last_lookup_at: ago(0),
  error: null,
  number_info: { region: "PT", geo: "Lisboa", number_type: "mobile", carrier: "Carrier A" },
  sources: [
    {
      title: "Business directory",
      url: "https://directory.example.com/parcel",
      type: "directory",
      verified: true,
    },
  ],
  internal_matches: [{ type: "past_call", title: "Yesterday" }],
  owner_override: null,
  provider: { enabled: true, cost_usd: "0.01", cap_usd: "0.05" },
};
const social = {
  enabled: true,
  kill_switch: null,
  policy: {
    auto_answer: false,
    ai_processing: "ask",
    transcription: "ask",
    recording: "ask",
    retention_days: 30,
  },
  accounts: [
    {
      channel: "whatsapp",
      account_id: "a1",
      account_label: "WhatsApp",
      configured: true,
      eligible: true,
      tested: true,
      available: true,
      reason: null,
      reason_pt: null,
      checks: [],
    },
    {
      channel: "telegram",
      account_id: "a2",
      account_label: "Telegram",
      configured: true,
      eligible: true,
      tested: false,
      available: false,
      reason: "Needs one real test call",
      reason_pt: "Falta uma chamada de teste",
      checks: [],
    },
    {
      channel: "instagram",
      account_id: null,
      account_label: null,
      configured: false,
      eligible: false,
      tested: false,
      available: false,
      reason: "Not linked",
      reason_pt: "Sem conta",
      checks: [],
    },
  ],
};

async function capture(page: Page, surface: Locator, name: string, ready: Locator[]) {
  if (process.env.OPENCLAW_CAPTURE_UI_PROOF !== "1") {
    return;
  }
  for (const viewport of [desktop, phone]) {
    const frame = await takeControlUiScreenshotFrame(page, surface, ready, {
      animations: "disabled",
      viewport,
      ...(ready[0] ? { scrollTo: ready[0] } : {}),
    });
    await writeFile(
      path.join(suite.artifactDir, `nsvx-calls-${name}-${viewport.width}.png`),
      frame.png,
    );
  }
  await page.setViewportSize(desktop);
}

/** Nothing in the Calls tab may be wider than a phone screen. */
async function fitsPhone(page: Page) {
  await page.setViewportSize(phone);
  const wide = await page
    .locator(".nsvx-calls *")
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => node.getBoundingClientRect().right > window.innerWidth + 1)
        .map((node) => `${node.tagName}.${node.getAttribute("class") ?? ""}`),
    );
  await page.setViewportSize(desktop);
  return wide;
}

suite.define(() => {
  it("calls, follows live calls, reads history, identifies a caller, and changes settings natively", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const gateway = await installMockGateway(page, {
          nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
          operatorScopes: ["operator.admin"],
          methodResponses: {
            "plugins.list": { plugins: [], diagnostics: [], mutationAllowed: true },
            "nsvx.view": {
              cases: [
                { match: { view: "callsStatus" }, response: status },
                { match: { view: "calls" }, response: calls },
                { match: { view: "call" }, response: detail },
                { match: { view: "callContext" }, response: { authorized: false } },
                {
                  match: { view: "callRecordings" },
                  response: [
                    {
                      id: REC,
                      state: "complete",
                      duration_ms: 95_000,
                      retention_until: new Date(Date.now() + 29 * 86_400_000).toISOString(),
                      created_at: ago(50),
                    },
                  ],
                },
                { match: { view: "callsSocial" }, response: social },
                { match: { view: "phoneCards" }, response: [card] },
                { match: { view: "today" }, response: { items: [] } },
              ],
            },
            "nsvx.calls.briefing": {
              briefing: "Last call two weeks ago confirmed a Friday slot.",
              recent_calls: [{ at: ago(20_000), direction: "outbound", purpose: "Book" }],
              unavailable: false,
            },
            "nsvx.calls.dial": row(OUT, { state: "dialing", label: "Calling" }),
            "nsvx.calls.change": { ok: true },
            "nsvx.calls.summary": {
              summary: "Appointment moved to Monday at 10.",
              citations: [{ turn_id: 4, speaker: "user", quote: "Monday at 10 works." }],
            },
            "nsvx.calls.recording": { fileName: "call.wav", mime: "audio/wav", data: wav },
            "nsvx.phone.lookup": card,
            "nsvx.phone.change": { ...card, name: "Parcel depot", origin: "owner" },
          },
        });
        // The sidebar shortcut opens Calls on an NSVX page that is already open.
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=today`);
        const surface = page.locator(".nsvx");
        await surface.getByRole("tab", { name: "Today" }).waitFor();
        await page
          .locator("openclaw-app-sidebar")
          .getByRole("button", { name: "Pages", exact: true })
          .click();
        const pages = page.locator(".sidebar-pages");
        await pages.getByRole("link", { name: "NSVX", exact: true }).waitFor();
        await pages.getByRole("link", { name: "Calls", exact: true }).click();
        const tab = surface.getByRole("tab", { name: "Calls" });
        await expect.poll(() => tab.getAttribute("aria-selected")).toBe("true");
        expect(new URL(page.url()).searchParams.get("tab")).toBe("calls");

        // Phone hero, spend meter, and the live WhatsApp call with its controls.
        const hero = surface.locator(".nsvx-calls__hero");
        await hero.getByText("+351 210 000 000").waitFor();
        expect(await hero.getByRole("meter").getAttribute("aria-valuenow")).toBe("37");
        const live = surface.locator(`.nsvx-calls__live-row[data-call="${LIVE}"]`);
        await live.getByRole("button", { name: "Take over" }).waitFor();
        const unknown = surface.locator(`[data-call="${UNKNOWN}"]`);
        await unknown.getByRole("button", { name: "Who called?" }).waitFor();
        expect(await surface.locator(".nsvx-calls__day h3").first().textContent()).toContain(
          "Today",
        );
        await capture(page, surface, "history", [live]);
        expect(await fitsPhone(page)).toEqual([]);

        // Filter by app: one tap, NSVX filters the history.
        await surface.getByRole("radio", { name: "WhatsApp", exact: true }).click();
        await expect
          .poll(async () =>
            (await gateway.getRequests("nsvx.view", { view: "calls" })).some(
              (request) =>
                (request.params as { params: { transport?: string } }).params.transport ===
                "whatsapp",
            ),
          )
          .toBe(true);
        await surface.getByRole("radio", { name: "All", exact: true }).click();

        // End the live call.
        await live.getByRole("button", { name: "End" }).click();
        expect((await gateway.waitForRequest("nsvx.calls.change")).params).toEqual({
          action: "hangup",
          id: LIVE,
        });

        // Call: number and goal, NSVX's summary first, then one confirmed tap carrying one key.
        await hero.getByRole("button", { name: "Call" }).click();
        const dial = surface.locator(".nsvx-calls__dial");
        await dial.getByLabel("Number").fill("+351 910 000 002");
        await dial.getByLabel("Goal").fill("Confirm tomorrow's delivery");
        await dial.getByRole("button", { name: "Review" }).click();
        expect((await gateway.waitForRequest("nsvx.calls.briefing")).params).toEqual({
          to: "+351 910 000 002",
          purpose: "Confirm tomorrow's delivery",
        });
        await dial.getByText("Last call two weeks ago confirmed a Friday slot.").waitFor();
        await capture(page, surface, "dial", [dial]);
        await dial.getByRole("button", { name: "Call now" }).click();
        const placed = (await gateway.waitForRequest("nsvx.calls.dial")).params as Record<
          string,
          string
        >;
        expect(placed).toMatchObject({
          to: "+351 910 000 002",
          purpose: "Confirm tomorrow's delivery",
        });
        expect(placed.key).toMatch(/^[0-9a-f-]{36}$/);

        // One call: transcript bubbles, results, summary, recording, forget.
        await surface.locator(`[data-call="${OUT}"] button.nsvx-of__row`).click();
        const call = surface.locator(".nsvx-calls__detail");
        const lastTurn = call.locator(".nsvx-calls__turns").getByText("Monday at 10 works.");
        await lastTurn.waitFor();
        await call.getByRole("button", { name: "Summarize" }).click();
        await call.getByText("Appointment moved to Monday at 10.").waitFor();
        await call.getByRole("button", { name: "Play" }).click();
        expect((await gateway.waitForRequest("nsvx.calls.recording")).params).toEqual({ id: REC });
        await call.locator("audio").waitFor();
        await capture(page, surface, "call", [lastTurn]);
        expect(await fitsPhone(page)).toEqual([]);
        await call.getByRole("button", { name: "Forget" }).click();
        await call.getByRole("button", { name: "Delete recording, transcript, memories" }).click();
        await expect
          .poll(async () =>
            (await gateway.getRequests("nsvx.calls.change")).map((request) => request.params),
          )
          .toContainEqual({ action: "forget", id: OUT });
        await call.getByRole("button", { name: "Back" }).click();

        // Who called: from an unknown caller in the history, looked up at once.
        await unknown.getByRole("button", { name: "Who called?" }).click();
        expect((await gateway.waitForRequest("nsvx.phone.lookup")).params).toEqual({
          number: "+351 910 000 001",
          callId: UNKNOWN,
        });
        const found = surface.locator(`.nsvx-calls__card[data-card="${CARD}"]`);
        await found.getByText("Parcel delivery service").waitFor();
        await found.getByRole("link", { name: "Business directory" }).waitFor();
        await capture(page, surface, "who", [found]);
        expect(await fitsPhone(page)).toEqual([]);
        await found.getByRole("button", { name: "Correct" }).click();
        await found.getByLabel("Name").fill("Parcel depot");
        await found.getByRole("button", { name: "Save" }).click();
        expect((await gateway.waitForRequest("nsvx.phone.change")).params).toEqual({
          id: CARD,
          action: "correct",
          name: "Parcel depot",
          kind: "delivery",
          note: "",
        });

        // Settings: switches, lines, budget, and the app-call policy.
        await surface.getByRole("radio", { name: "Settings", exact: true }).click();
        const telnyx = surface.locator('[data-route="telnyx"]');
        await telnyx.getByText("Ready").waitFor();
        await surface.locator('[data-channel="telegram"]').getByText("Needs a test call").waitFor();
        await capture(page, surface, "settings", [telnyx]);
        expect(await fitsPhone(page)).toEqual([]);
        await surface.getByRole("switch", { name: "Voice in the app" }).click();
        await expect
          .poll(async () =>
            (await gateway.getRequests("nsvx.calls.change")).map((request) => request.params),
          )
          .toContainEqual({ action: "settings", voiceEnabled: false });
        await surface
          .getByRole("radiogroup", { name: "Recording" })
          .getByRole("radio", { name: "No" })
          .click();
        await expect
          .poll(async () =>
            (await gateway.getRequests("nsvx.calls.change")).map((request) => request.params),
          )
          .toContainEqual({ action: "social", recording: "off" });
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("shows Calls in Portuguese and asks for the NSVX sign-in when the Gateway has none", async () => {
    await suite.withPage(
      { viewport: phone, locale: "pt-PT", serviceWorkers: "block" },
      async ({ page }) => {
        await installMockGateway(page, {
          nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
          operatorScopes: ["operator.admin"],
          methodResponses: {
            "plugins.list": { plugins: [], diagnostics: [], mutationAllowed: true },
            "nsvx.view": {
              __mockError: {
                code: "unconfigured",
                message: "NSVX owner sign-in is not set up on this Gateway.",
              },
            },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=calls`);
        const surface = page.locator(".nsvx");
        await surface.getByRole("tab", { name: "Chamadas" }).waitFor();
        await surface.getByRole("radio", { name: "Quem ligou?" }).waitFor();
        const connect = surface.locator(".nsvx-connect").first();
        await connect.waitFor();
        if (process.env.OPENCLAW_CAPTURE_UI_PROOF === "1") {
          const frame = await takeControlUiScreenshotFrame(page, surface, [connect], {
            animations: "disabled",
            viewport: phone,
          });
          await writeFile(path.join(suite.artifactDir, "nsvx-calls-sign-in-390.png"), frame.png);
        }
      },
    );
  });
});
