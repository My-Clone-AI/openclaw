import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "playwright";
import { expect, it } from "vitest";
import { takeControlUiScreenshotFrame } from "../test-helpers/control-ui-e2e-screenshot.ts";
import { installMockGateway } from "../test-helpers/control-ui-e2e.ts";
import { createControlUiE2eSuite } from "./control-ui-e2e-suite.test-support.ts";

const pluginRoot = fileURLToPath(new URL("../../../extensions/nsvx/", import.meta.url));
const suite = createControlUiE2eSuite({ name: "NSVX business" });
const desktop = { width: 1280, height: 1000 };
const mobile = { width: 390, height: 844 };
const capture = process.env.OPENCLAW_CAPTURE_UI_PROOF === "1";
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const lastYear = new Date().getFullYear() - 1;
// A 1x1 PNG stands in for the meter photo and the sign-in page.
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";

// Synthetic payloads shaped like NSVX /api/business, /api/orders, /api/utilities, /api/warranties, and grants.
const run = (
  state: string,
  items: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) => ({
  id: `run-${state}`,
  state,
  year: lastYear,
  quarter: 4,
  updated_at: ago(30),
  items,
  ...extra,
});
const provider = (area: string, name: string) => ({
  view: "bizProvider",
  params: { area, provider: name },
});
const readingId = "0b0c3f6e-6a1d-4c56-9c62-1f1f7f0e1a2b";
const claimId = "6a3e1c9b-2f44-4f0e-9c1a-3b8d2e7f9a10";
const packetId = "9d2f4b6a-1c3e-4a5b-8c7d-0e1f2a3b4c5d";
const grantId = "4f1c2d3e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const meterReading = {
  id: readingId,
  revision: 3,
  state: "awaiting_confirmation",
  sha256: "a".repeat(64),
  created_at: ago(20),
  archived_at: null,
  flags: [],
  draft: {
    provider: "endesa",
    serial: "ZIV0034123",
    serial_certain: true,
    installation_id: "ES0031",
    supply_id: null,
    reading_date: new Date().toISOString().slice(0, 10),
    date_certain: true,
    registers: [
      {
        code: "1.8.1",
        display: "04521",
        decimal: "integer",
        unit: "kWh",
        certain: true,
        code_certain: true,
        unit_certain: true,
        decimal_certain: true,
      },
    ],
    issues: [],
    identity_confirmed: true,
    date_confirmed: true,
    values_confirmed: true,
  },
  confirmation: {
    binding: "b".repeat(64),
    expires: inDays(1),
    summary: {
      provider: "Endesa",
      installation_id: "ES0031",
      date: new Date().toISOString().slice(0, 10),
      registers: [{ code: "1.8.1", value: "4521", unit: "kWh" }],
    },
  },
  receipt: null,
};
const claim = {
  id: claimId,
  revision: 2,
  state: "ready",
  stage: "review",
  fault: "Não aquece a água",
  product: "Máquina de café Krups",
  document_ids: ["d1"],
  error: null,
  preview: null,
  packet: {
    id: packetId,
    sha256: "c".repeat(64),
    revision: 2,
    letter: "Exmos. Senhores, a máquina comprada em 2025 deixou de aquecer.",
    fields: {
      product: { value: "Máquina de café Krups", sources: [], conflict: false },
      seller: { value: "Worten", sources: [], conflict: false },
      purchase_date: { value: "2025-03-14", sources: [], conflict: false },
      amount: { value: "129,99", sources: [], conflict: false },
    },
    terms: [],
    products: ["Máquina de café Krups"],
    product: "Máquina de café Krups",
    unresolved: ["missing_order"],
    evidence: [{ id: "d1", name: "fatura-worten.pdf", mime: "application/pdf", sha256: "d" }],
  },
};
// NSVX answers a confirm with the reading on its way to the supplier.
const sending = { ...meterReading, revision: 4, state: "submission", confirmation: null };
const viewCases = [
  {
    match: provider("business", "viaverde"),
    response: {
      configured: true,
      run: run("completed", {
        "VV-2026-0101": { number: "FT 2026/0101", issued_on: `${lastYear}-10-05` },
        "VV-2026-0144": { number: "FT 2026/0144", issued_on: `${lastYear}-11-05` },
        "VV-2026-0190": { number: "FT 2026/0190", issued_on: `${lastYear}-12-05` },
      }),
    },
  },
  {
    match: provider("business", "prio"),
    response: {
      configured: true,
      run: run(
        "running",
        { a: { state: "completed", number: "PRIO 7781" } },
        { expected_items: 3 },
      ),
    },
  },
  {
    match: provider("business", "bolt"),
    response: { configured: true, login_state: "needs_otp", run: null },
  },
  {
    match: provider("business", "fidelidade"),
    response: { configured: false, run: null },
  },
  {
    match: provider("utilities", "nos"),
    response: {
      configured: true,
      accounts: [{ association: "1.234567", label: "Casa Lapa" }],
      runs: [run("partial", { m10: { state: "completed", month: 10, account: "1.234567" } })],
    },
  },
  {
    match: provider("utilities", "endesa"),
    response: {
      configured: true,
      installations: [{ id: "ES0031", label: "Lapa luz" }],
      run: null,
    },
  },
  {
    match: provider("orders", "glovo"),
    response: { configured: true, recipient: "Fortune Comet Lda", login_state: "ready", run: null },
  },
  {
    match: provider("orders", "amazon-es"),
    response: {
      configured: true,
      history: {
        orders: [
          { id: "405-1234567-1234567", text: "Auriculares Bluetooth · 39,99 €" },
          { id: "405-7654321-7654321", text: "Cabo USB-C 2 m · 9,49 €" },
        ],
        year: new Date().getFullYear(),
        start: 0,
        next: false,
        observed_at: Math.floor(Date.now() / 1000) - 3600,
      },
    },
  },
  {
    match: { view: "bizWorkflow", params: { id: "w1" } },
    response: {
      id: "w1",
      year: lastYear,
      quarter: 4,
      providers: ["bolt", "prio", "viaverde"],
      state: "running",
      detail: "",
      steps: {
        bolt: { state: "completed", items: 6, verified_at: ago(5) },
        prio: { state: "running", items: 1, verified_at: null },
        viaverde: { state: "queued", items: 0, verified_at: null },
      },
      updated_at: ago(1),
    },
  },
  {
    match: { view: "amazonReturns" },
    response: {
      drafts: [
        {
          id: "rt1",
          order_id: "405-7654321-7654321",
          state: "draft",
          confirmation: "",
          refund: "9,49 €",
          updated_at: Math.floor(Date.now() / 1000) - 7200,
        },
      ],
    },
  },
  {
    match: { view: "readings" },
    response: {
      readings: [meterReading],
      installations: [{ id: "ES0031", label: "Lapa luz", provider: "endesa" }],
      providers: [{ id: "endesa", label: "Endesa", supported: false, reason: "Envio por validar" }],
    },
  },
  { match: { view: "readingImage", params: { id: readingId } }, response: { src: png } },
  {
    match: { view: "warranties" },
    response: {
      items: [
        { id: claimId, state: "ready", revision: 2, product: "Máquina de café Krups" },
        { id: "c2", state: "processing", revision: 1, product: "Aspirador" },
      ],
    },
  },
  {
    match: { view: "warranty", params: { id: claimId } },
    response: claim,
  },
  { match: { view: "purchases" }, response: { items: [] } },
  {
    match: { view: "grants" },
    response: {
      grants: [
        {
          id: grantId,
          app: "openhome",
          action: "listing.hide",
          state: "active",
          expires_at: inDays(3),
          user_ref: "ana@openhome.pt",
          tenant: "openhome",
        },
        {
          id: "g2",
          app: "openfly",
          action: "booking.cancel",
          state: "revoked",
          expires_at: null,
          user_ref: "ops",
          tenant: "openfly",
        },
        {
          id: "g3",
          app: "openlove",
          action: "profile.hide",
          state: "active",
          expires_at: null,
          user_ref: "x",
          tenant: "openlove",
        },
      ],
    },
  },
  { match: { view: "grantNotice" }, response: { enabled: true, days: 7 } },
  {
    match: { view: "grantsExpiring" },
    response: {
      enabled: true,
      days: 7,
      grants: [
        {
          id: grantId,
          app: "openhome",
          action: "listing.hide",
          state: "active",
          expires_at: inDays(3),
        },
      ],
    },
  },
  {
    match: { view: "grantDenials", params: { id: grantId } },
    response: {
      denials: [{ at: ago(600), reason: "expired", explanation: "A autorização expirou." }],
    },
  },
];

async function shoot(page: Page, surface: Locator, name: string, ready: Locator[]) {
  if (!capture) {
    return;
  }
  for (const viewport of [desktop, mobile]) {
    const frame = await takeControlUiScreenshotFrame(page, surface, ready, {
      animations: "disabled",
      viewport,
      scrollTo: ready[0],
    });
    await writeFile(
      path.join(suite.artifactDir, `nsvx-business-${name}-${viewport.width}.png`),
      frame.png,
    );
    // Nothing may stick out past the phone: clipped buttons cannot be tapped.
    const wide = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".nsvx-biz *")]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .map((el) => `${el.tagName}.${el.className}`),
    );
    expect(wide, `${name} at ${viewport.width}`).toEqual([]);
  }
  await page.setViewportSize(desktop);
}

suite.define(() => {
  it("runs business natively: invoices, quarter, orders, home, meters, warranty, and grants", async () => {
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
            "nsvx.business.provider": run("queued", {}),
            "nsvx.business.workflow": {
              id: "w1",
              year: lastYear,
              quarter: 4,
              providers: ["bolt", "prio", "viaverde"],
              state: "queued",
              steps: {},
            },
            "nsvx.business.reading": sending,
            "nsvx.business.warranty": { ...claim, state: "reviewed" },
            "nsvx.business.grant": { ok: true },
            "nsvx.business.explain": {
              explanation: "Ana pode esconder anúncios no openhome até daqui a 3 dias.",
              unavailable: false,
            },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=business`);
        const surface = page.locator(".nsvx");
        const radio = (name: string) => surface.getByRole("radio", { name, exact: true });
        const card = (id: string) => surface.locator(`[data-provider="${id}"]`);
        const params = async (method: string) =>
          (await gateway.getRequests(method)).map((r) => r.params as Record<string, unknown>);

        // Invoices: one card per supplier with its light, last run, and a quarter's collection.
        await card("viaverde").getByText("FT 2026/0144").waitFor();
        await card("prio").getByRole("progressbar").waitFor();
        await card("bolt").getByLabel("Code").waitFor();
        await shoot(page, surface, "invoices", [card("viaverde")]);
        await card("viaverde").getByRole("button", { name: "Collect" }).click();
        await expect
          .poll(() => params("nsvx.business.provider"))
          .toEqual([expect.objectContaining({ provider: "viaverde", op: "quarter" })]);

        // Quarter: every supplier at once; NSVX repeats only steps Drive has not confirmed.
        await radio("Quarter").click();
        await surface.getByRole("button", { name: /Fidelidade/ }).click();
        await surface.getByRole("button", { name: "Collect all" }).click();
        await expect
          .poll(async () => (await params("nsvx.business.workflow"))[0])
          .toEqual(
            expect.objectContaining({ op: "start", providers: ["bolt", "prio", "viaverde"] }),
          );
        await surface.locator(".nsvx-biz__card", { hasText: "Prio" }).last().waitFor();
        await shoot(page, surface, "quarter", [
          surface.getByRole("button", { name: "Collect all" }),
        ]);

        // Orders: Glovo with its official mark and Amazon's last orders and return drafts.
        await radio("Orders").click();
        await surface.getByText("Auriculares Bluetooth · 39,99 €").waitFor();
        await shoot(page, surface, "orders", [card("glovo")]);

        // Home: NOS accounts and Endesa places.
        await radio("Home").click();
        await card("endesa").getByText("No invoices yet").waitFor();
        await shoot(page, surface, "home", [card("nos")]);

        // Meters: the photo, NSVX's read, and one confirmed send with the binding NSVX gave.
        await radio("Meters").click();
        await surface.getByRole("img", { name: "Meter photo" }).waitFor();
        await shoot(page, surface, "meters", [surface.getByRole("img", { name: "Meter photo" })]);
        await surface.getByRole("button", { name: "Confirm and send" }).click();
        await expect
          .poll(() => params("nsvx.business.reading"))
          .toEqual([{ op: "confirm", id: readingId, revision: 3, binding: "b".repeat(64) }]);
        await surface.getByText("Sending").first().waitFor();

        // Warranty: the claim's draft with what is still missing; confirming never sends it.
        await radio("Warranty").click();
        await surface.getByText("Máquina de café Krups").first().click();
        await surface.getByText("Worten", { exact: true }).waitFor();
        expect(new URL(page.url()).searchParams.get("claim")).toBe(claimId);
        await shoot(page, surface, "warranty", [surface.getByText("Worten", { exact: true })]);
        await surface.getByRole("button", { name: "Confirm draft" }).click();
        await expect
          .poll(() => params("nsvx.business.warranty"))
          .toEqual([{ op: "confirm", id: claimId, revision: 2, packetId, sha256: "c".repeat(64) }]);

        // Grants: adult apps hidden, expiry warning, plain-words explanation, refusals, and revoke.
        await radio("Grants").click();
        const grant = surface.locator("li", { hasText: "listing.hide" });
        await grant.waitFor();
        expect(await surface.getByText("openlove").count()).toBe(0);
        await grant.getByRole("button", { name: "Explain" }).click();
        await surface.getByText("Ana pode esconder anúncios").waitFor();
        await grant.getByRole("button", { name: "Refusals" }).click();
        await surface.getByText("A autorização expirou.").waitFor();
        await shoot(page, surface, "grants", [grant]);
        await grant.getByRole("button", { name: "Revoke" }).click();
        await grant.getByRole("button", { name: "Confirm · Revoke" }).click();
        await expect
          .poll(() => params("nsvx.business.grant"))
          .toEqual([{ op: "revoke", id: grantId }]);
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("shows business in Portuguese and asks for the NSVX sign-in when the Gateway has none", async () => {
    await suite.withPage(
      { viewport: mobile, locale: "pt-PT", serviceWorkers: "block" },
      async ({ page }) => {
        await installMockGateway(page, {
          nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
          operatorScopes: ["operator.admin"],
          methodResponses: {
            "nsvx.view": {
              __mockError: {
                code: "unconfigured",
                message: "NSVX sign-in is not set up on this Gateway.",
              },
            },
          },
        });
        await page.goto(
          `${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=business&biz=readings`,
        );
        const surface = page.locator(".nsvx");
        await surface.getByRole("radio", { name: "Leituras", exact: true }).waitFor();
        const connect = surface.locator(".nsvx-connect").first();
        await connect.waitFor();
        if (capture) {
          const frame = await takeControlUiScreenshotFrame(page, surface, [connect], {
            animations: "disabled",
            viewport: mobile,
          });
          await writeFile(path.join(suite.artifactDir, "nsvx-business-sign-in-390.png"), frame.png);
        }
      },
    );
  });
});
