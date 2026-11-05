import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "playwright";
import QRCode from "qrcode";
import { expect, it } from "vitest";
import { takeControlUiScreenshotFrame } from "../test-helpers/control-ui-e2e-screenshot.ts";
import { installMockGateway } from "../test-helpers/control-ui-e2e.ts";
import { createControlUiE2eSuite } from "./control-ui-e2e-suite.test-support.ts";

const pluginRoot = fileURLToPath(new URL("../../../extensions/nsvx/", import.meta.url));
const suite = createControlUiE2eSuite({ name: "NSVX access" });
const desktop = { width: 1280, height: 1000 };
const phone = { width: 390, height: 844 };
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const WA = "0a3c1d1e-2a3b-4c5d-8e9f-0a1b2c3d4e01";
const TG = "0a3c1d1e-2a3b-4c5d-8e9f-0a1b2c3d4e02";
const IG = "0a3c1d1e-2a3b-4c5d-8e9f-0a1b2c3d4e03";
const PERSON = "7b2c1d1e-2a3b-4c5d-8e9f-0a1b2c3d4e05";
const IDENTITY = "7b2c1d1e-2a3b-4c5d-8e9f-0a1b2c3d4e06";

// Synthetic payloads shaped like NSVX /api/apps, /api/auth, /api/credentials, /api/permissions answers.
const account = (id: string, channel: string, label: string, extra: Record<string, unknown>) => ({
  id,
  channel,
  label,
  mode: "live",
  state: "ready",
  state_detail: null,
  capabilities: null,
  paused: false,
  outbound_enabled: true,
  last_verified_at: ago(12),
  policy_review: "risk_acknowledged:2026-10-12",
  coverage: { full: 40, partial: 2, unknown: 0, none: 0 },
  ...extra,
});
const apps = {
  accounts: [
    account(WA, "whatsapp", "WhatsApp", {}),
    account(TG, "telegram", "Telegram", {
      state: "awaiting_login",
      state_detail: "Sign in again",
      last_verified_at: null,
    }),
    account(IG, "instagram", "Instagram", { paused: true }),
    account("fixture", "fixture", "Test", { mode: "fixture" }),
  ],
  services: {
    tts: { ok: true },
    stt: { ok: true },
    bridge: { ok: true },
    memory: { ok: true },
    browser: { ok: true },
    runtime: { ok: false },
  },
  google_client_missing: false,
  google: {
    gmail: true,
    drive: true,
    drive_write: false,
    gmail_addresses: [{ address: "owner@example.com", granted: true }],
  },
};
const devices = {
  passkeys: [
    {
      id: "pk1",
      device_name: "iPhone",
      created_at: ago(9000),
      last_used_at: ago(30),
      revoked_at: null,
    },
  ],
  sessions: [
    {
      id: "control",
      device_label: "openclaw",
      method: "password",
      created_at: ago(500),
      last_seen_at: ago(1),
    },
    {
      id: "laptop",
      device_label: "MacBook",
      method: "passkey",
      created_at: ago(900),
      last_seen_at: ago(240),
    },
  ],
  current_session: "control",
};
const credentials = {
  entries: [
    {
      id: "c1",
      label: "portal",
      origins: ["https://portal.example.com"],
      state: "stored",
      detail: null,
      version: 2,
      updated_at: ago(3000),
      service: "roster",
      from_document: true,
    },
  ],
};
const permissions = {
  admin: { revision: "1" },
  scopes: [
    { code: "documents", label: "Documents" },
    { code: "properties", label: "Properties" },
    { code: "calendar", label: "Calendar" },
  ],
  people: [
    {
      id: PERSON,
      label: "Ana",
      person_id: null,
      state: "pending",
      revision: 4,
      scopes: ["documents"],
      username: null,
      phone_verified: false,
      changed_at: ago(100),
      changed_by: "owner:s",
    },
  ],
};
const hooks = {
  account: { id: WA, channel: "whatsapp", label: "WhatsApp" },
  binding: {
    state: "authorized",
    health_code: null,
    webhook_challenged_at: ago(9000),
    subscribed_at: ago(8000),
    last_event_at: ago(3),
  },
  events: [
    { kind: "message", state: "processed", n: 128 },
    { kind: "status", state: "held", n: 2 },
  ],
  signature_rejections: 1,
  milestones: { webhook_subscribed: "verified" },
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
      path.join(suite.artifactDir, `nsvx-access-${name}-${viewport.width}.png`),
      frame.png,
    );
  }
  await page.setViewportSize(desktop);
}

/** A provider sign-in page as NSVX's 1280x900 browser would show it. */
async function providerPage(page: Page) {
  const other = await page.context().newPage();
  await other.setViewportSize({ width: 1280, height: 900 });
  await other.setContent(
    `<body style="margin:0;display:grid;place-items:center;height:900px;font:28px sans-serif;background:#f4f6f8">
      <form style="display:grid;gap:16px;padding:48px;background:#fff;border-radius:16px;width:520px">
        <b style="color:#26A5E4">Telegram</b><span>Enter the code we sent</span>
        <input style="font:28px sans-serif;padding:12px" value="" placeholder="Code"/>
        <button style="font:28px sans-serif;padding:12px;background:#26A5E4;color:#fff;border:0">Next</button>
      </form></body>`,
  );
  const png = (await other.screenshot({ type: "png" })).toString("base64");
  await other.close();
  return png;
}

suite.define(() => {
  it("connects apps with a QR or the provider's page, and manages sign-ins, logins, checks, people, and hooks natively", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const qr = (
          await QRCode.toDataURL("https://example.invalid/link-device", { margin: 0 })
        ).split(",")[1];
        const screen = await providerPage(page);
        const gateway = await installMockGateway(page, {
          nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
          operatorScopes: ["operator.admin"],
          methodResponses: {
            "plugins.list": { plugins: [], diagnostics: [], mutationAllowed: true },
            "nsvx.view": {
              cases: [
                { match: { view: "apps" }, response: apps },
                {
                  match: { view: "appLogin", params: { aid: WA } },
                  response: { state: "awaiting_login", qr_png_base64: qr, qr_expires_in_s: 40 },
                },
                {
                  match: { view: "appLogin", params: { aid: TG } },
                  response: { state: "awaiting_login", view: true, login_step: "code" },
                },
                {
                  match: { view: "appLoginView" },
                  response: {
                    png_base64: screen,
                    width: 1280,
                    height: 900,
                    state: "awaiting_login",
                  },
                },
                {
                  match: { view: "appLoginFields" },
                  response: {
                    fields: [{ index: 0, label: "Code", kind: "code", has_value: false }],
                  },
                },
                { match: { view: "authDevices" }, response: devices },
                { match: { view: "appleIdentities" }, response: { status: {}, identities: [] } },
                { match: { view: "credentials" }, response: credentials },
                { match: { view: "credentialImport" }, response: { id: 7, status: "done" } },
                {
                  match: { view: "challenges" },
                  response: {
                    accounts: [
                      {
                        id: "roster",
                        channel: "uber_personal",
                        failures: 1,
                        visual_required: true,
                      },
                    ],
                  },
                },
                {
                  match: { view: "challengeView" },
                  response: {
                    image: `data:image/png;base64,${screen}`,
                    width: 1280,
                    height: 900,
                  },
                },
                { match: { view: "permissions" }, response: permissions },
                {
                  match: { view: "permissionPeople" },
                  response: {
                    items: [
                      { id: IDENTITY, display_name: "Ana Silva", verified_association: true },
                    ],
                  },
                },
                { match: { view: "providerHooks", params: { aid: WA } }, response: hooks },
                {
                  match: { view: "providerHooks", params: { aid: IG } },
                  response: { ...hooks, binding: null, events: [], milestones: {} },
                },
              ],
            },
            "nsvx.access.login": { ok: true },
            "nsvx.access.loginInput": { ok: true },
            "nsvx.access.loginFill": { ok: true },
            "nsvx.access.pause": { ok: true },
            "nsvx.access.check": { state: "ready", captured: 3 },
            "nsvx.access.revokeSession": { ok: true },
            "nsvx.access.importLogins": { job_id: 7 },
            "nsvx.access.challengeInput": { image: "", width: 1280, height: 900 },
            "nsvx.access.savePerson": { ok: true },
            "nsvx.access.hookCheck": { ok: true },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=access`);
        const surface = page.locator(".nsvx");
        const radio = (name: string) => surface.getByRole("radio", { name, exact: true });

        // Apps: problems first, the test channel stays in NSVX, services and Google grants at a glance.
        const telegram = surface.locator(`[data-account="${TG}"]`);
        await telegram.getByText("Sign in again").waitFor();
        expect(await surface.locator('[data-account="fixture"]').count()).toBe(0);
        expect(await surface.locator(".nsvx-acc__card").first().getAttribute("data-account")).toBe(
          TG,
        );
        await surface.locator('[data-service="runtime"].nsvx-acc__service--bad').waitFor();
        await surface.getByText("owner@example.com").waitFor();
        await capture(page, surface, "apps", [telegram]);

        // WhatsApp: the QR code NSVX's browser shows, scanned from here.
        const whatsapp = surface.locator(`[data-account="${WA}"]`);
        await whatsapp.getByRole("button", { name: "Show" }).click();
        await whatsapp.getByAltText("QR").waitFor();
        await whatsapp.getByText("Scan with your phone").waitFor();
        await capture(page, surface, "qr", [whatsapp.getByAltText("QR")]);
        await whatsapp.getByRole("button", { name: "Close" }).click();

        // Telegram: the provider's page, a tap lands at the same spot, and the code field is filled.
        await telegram.getByRole("button", { name: "Connect" }).click();
        expect((await gateway.waitForRequest("nsvx.access.login")).params).toMatchObject({
          accountId: TG,
        });
        const tap = telegram.getByRole("button", { name: "Tap the screen to use it" });
        await tap.waitFor();
        const box = (await tap.boundingBox())!;
        await tap.click({ position: { x: box.width / 2, y: box.height / 2 } });
        const click = (await gateway.waitForRequest("nsvx.access.loginInput")).params as Record<
          string,
          number
        >;
        expect(Math.abs(click.x - 640)).toBeLessThanOrEqual(2);
        expect(Math.abs(click.y - 450)).toBeLessThanOrEqual(2);
        await telegram.getByLabel("Code").fill("12345");
        await capture(page, surface, "signin-page", [tap]);
        await telegram.getByRole("button", { name: "Fill and sign in" }).click();
        expect((await gateway.waitForRequest("nsvx.access.loginFill")).params).toMatchObject({
          accountId: TG,
          values: { "0": "12345" },
        });

        // Pause takes one tap and sends one change.
        const instagram = surface.locator(`[data-account="${IG}"]`);
        await instagram.getByRole("button", { name: "Resume" }).click();
        expect((await gateway.waitForRequest("nsvx.access.pause")).params).toMatchObject({
          accountId: IG,
          paused: false,
        });

        // Sign-in: the session Control uses cannot be ended; another one asks first.
        await radio("Sign-in").click();
        const control = surface.locator('[data-session="control"]');
        await control.getByText("Control", { exact: true }).waitFor();
        expect(await control.getByRole("button", { name: "End" }).count()).toBe(0);
        const laptop = surface.locator('[data-session="laptop"]');
        await laptop.getByRole("button", { name: "End" }).click();
        await capture(page, surface, "signins", [laptop]);
        await laptop.getByRole("button", { name: "Confirm · End" }).click();
        expect((await gateway.waitForRequest("nsvx.access.revokeSession")).params).toEqual({
          sessionId: "laptop",
        });

        // Logins: names and state only; import follows NSVX's job.
        await radio("Logins").click();
        await surface.getByText("portal.example.com").waitFor();
        await surface.getByRole("button", { name: "Import from documents" }).click();
        await gateway.waitForRequest("nsvx.access.importLogins");
        await surface.getByText("Imported", { exact: true }).waitFor();
        await surface.getByRole("button", { name: "New" }).click();
        await capture(page, surface, "logins", [surface.getByText("portal.example.com")]);

        // Checks: the CAPTCHA page, solved by tapping it here.
        await radio("Checks").click();
        await surface.getByRole("button", { name: "Solve" }).click();
        await surface.getByRole("button", { name: "Tap the screen to use it" }).waitFor();
        await capture(page, surface, "checks", [surface.getByAltText("CAPTCHA")]);
        await surface.getByRole("button", { name: "Tab", exact: true }).click();
        expect((await gateway.waitForRequest("nsvx.access.challengeInput")).params).toEqual({
          account: "roster",
          kind: "key",
          key: "Tab",
        });

        // People: link a verified person, give areas, activate; saved with the revision shown.
        await radio("People").click();
        const ana = surface.locator(`[data-assignment="${PERSON}"]`);
        await ana.getByRole("button", { name: "Find" }).click();
        await ana.getByRole("option", { name: /Ana Silva/ }).click();
        await ana.getByLabel("Calendar").check();
        await ana.getByRole("radio", { name: "Active" }).click();
        await capture(page, surface, "people", [ana]);
        await ana.getByRole("button", { name: "Save" }).first().click();
        expect((await gateway.waitForRequest("nsvx.access.savePerson")).params).toEqual({
          assignmentId: PERSON,
          revision: 4,
          personId: IDENTITY,
          state: "active",
          scopes: ["documents", "calendar"],
        });

        // Hooks: Meta's webhook path for each WhatsApp and Instagram app.
        await radio("Hooks").click();
        const waHooks = surface.locator(`[data-hooks="${WA}"]`);
        await waHooks.getByText("130", { exact: true }).waitFor();
        await surface.locator(`[data-hooks="${IG}"]`).getByText("Not set up").waitFor();
        await capture(page, surface, "hooks", [waHooks]);
        await waHooks.getByRole("button", { name: "Check" }).click();
        expect((await gateway.waitForRequest("nsvx.access.hookCheck")).params).toEqual({
          accountId: WA,
        });
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("opens on a token alone, and says so when a change needs more than a token", async () => {
    await suite.withPage(
      { viewport: phone, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const gateway = await installMockGateway(page, {
          nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
          operatorScopes: ["operator.admin"],
          methodResponses: {
            "plugins.list": { plugins: [], diagnostics: [], mutationAllowed: true },
            "nsvx.view": {
              cases: [
                { match: { view: "apps" }, response: apps },
                { match: { view: "appLogin" }, response: { state: "disconnected" } },
              ],
            },
            "nsvx.access.login": {
              __mockError: {
                code: "token-pending",
                message: "NSVX does not accept this change from a token yet.",
              },
            },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=access`);
        const surface = page.locator(".nsvx");
        const telegram = surface.locator(`[data-account="${TG}"]`);
        await telegram.getByText("Sign in again").waitFor();
        expect(await surface.locator(".nsvx-connect").count()).toBe(0);

        await telegram.getByRole("button", { name: "Connect" }).click();
        await gateway.waitForRequest("nsvx.access.login");
        const refused = telegram.getByRole("alert");
        await refused
          .getByText("NSVX can't open this with a token yet.", { exact: true })
          .waitFor();
        expect(gateway.findRequests("nsvx.view", { view: "appLogin" })).toEqual([]);
        await capture(page, surface, "token-only", [refused]);
      },
    );
  });

  it("shows the access tab in Portuguese and asks for the NSVX sign-in when the Gateway has none", async () => {
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
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=access&acc=people`);
        const surface = page.locator(".nsvx");
        await surface.getByRole("radio", { name: "Pessoas", exact: true }).waitFor();
        await surface.getByRole("tab", { name: "Acesso" }).waitFor();
        const card = surface.locator(".nsvx-connect");
        await card.waitFor();
        if (process.env.OPENCLAW_CAPTURE_UI_PROOF === "1") {
          const frame = await takeControlUiScreenshotFrame(page, surface, [card], {
            animations: "disabled",
            viewport: phone,
          });
          await writeFile(path.join(suite.artifactDir, "nsvx-access-sign-in-390.png"), frame.png);
        }
      },
    );
  });
});
