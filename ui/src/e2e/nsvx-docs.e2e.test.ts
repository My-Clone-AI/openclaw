import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "playwright";
import { expect, it } from "vitest";
import { takeControlUiScreenshotFrame } from "../test-helpers/control-ui-e2e-screenshot.ts";
import { installMockGateway } from "../test-helpers/control-ui-e2e.ts";
import { createControlUiE2eSuite } from "./control-ui-e2e-suite.test-support.ts";

const pluginRoot = fileURLToPath(new URL("../../../extensions/nsvx/", import.meta.url));
const suite = createControlUiE2eSuite({ name: "NSVX docs" });
const desktop = { width: 1280, height: 1000 };
const phone = { width: 390, height: 844 };
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const BILL = "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c01";
const LEASE = "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c02";
const SCAN = "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c03";
const SIG = "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c04";
const SIGNED = "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c05";
const RULE = "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c06";

// A synthetic page image, shaped like what NSVX renders for a PDF page.
const pageSvg = (title: string) =>
  `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="595" height="842" viewBox="0 0 595 842"><rect width="595" height="842" fill="#fff"/><rect x="48" y="48" width="180" height="28" fill="#1a73e8"/><text x="48" y="130" font-family="sans-serif" font-size="22" fill="#222">${title}</text>${Array.from({ length: 14 }, (_, row) => `<rect x="48" y="${170 + row * 34}" width="${row % 3 === 0 ? 380 : 480}" height="10" fill="#ddd"/>`).join("")}<rect x="360" y="700" width="190" height="60" fill="none" stroke="#bbb"/></svg>`,
  ).toString("base64")}`;

const categories = [
  {
    code: "banking",
    parent: null,
    label: "Bancos",
    label_en: "Banking",
    template: "",
    active: true,
  },
  {
    code: "banking.statement",
    parent: "banking",
    label: "Extratos",
    label_en: "Statements",
    template: "{month}__{bank}__{account}__Extrato",
    active: true,
  },
  {
    code: "real_estate",
    parent: null,
    label: "Imóveis",
    label_en: "Homes",
    template: "",
    active: true,
  },
  {
    code: "real_estate.lease",
    parent: "real_estate",
    label: "Arrendamento",
    label_en: "Leases",
    template: "{date}__{issuer}__{type}",
    active: true,
  },
  {
    code: "accounting",
    parent: null,
    label: "Contabilidade",
    label_en: "Accounting",
    template: "",
    active: true,
  },
  {
    code: "accounting.invoice",
    parent: "accounting",
    label: "Faturas",
    label_en: "Invoices",
    template: "{date}__{issuer}__{number}",
    active: true,
  },
];
const drive = {
  connected: true,
  state: "ready",
  push: { active: true, expires_at: null, last_message_at: ago(3), error: null },
  last_delta_at: ago(4),
  last_processed_at: ago(30),
  rename_available: true,
};
const overview = {
  counts: {
    total: 128,
    review: 2,
    provisional: 1,
    processing: 1,
    failed: 0,
    duplicates: 3,
    today: 4,
  },
  by_category: { banking: 64, real_estate: 22, accounting: 42 },
  categories,
  notices: [
    {
      id: 7,
      kind: "review",
      title: "2 documents to check",
      body: "One lease and one scan",
      url: "/documentos/rever",
      created_at: ago(20),
    },
  ],
  drive,
  settings: { rename_drive: true, ai_enabled: true, drive_scope: "all" },
};
const doc = (id: string, extra: Record<string, unknown>) => ({
  id,
  source: "drive",
  current_name: "Document.pdf",
  original_name: "scan0001.pdf",
  mime: "application/pdf",
  byte_size: 120_000,
  category: "banking",
  subcategory: "banking.statement",
  document_type: "Statement",
  issuer: "Example Bank",
  document_number: null,
  document_date: null,
  period_start: "2026-09-01",
  period_end: "2026-09-30",
  account_last4: "1234",
  confidence: 0.97,
  review_status: "auto",
  review_reasons: [],
  status: "processed",
  imported_at: ago(60),
  ...extra,
});
const list = {
  total: 3,
  items: [
    doc(BILL, { current_name: "2026-09__Example-Bank__Conta-1234__Extrato.pdf" }),
    doc(LEASE, {
      source: "upload",
      current_name: "2026-10-01__Landlord__Lease.pdf",
      category: "real_estate",
      subcategory: "real_estate.lease",
      document_type: "Lease",
      issuer: "Landlord",
      period_start: null,
      period_end: null,
      document_date: "2026-10-01",
      account_last4: null,
      confidence: 0.61,
      review_status: "needs_review",
      review_reasons: ["missing_number"],
      imported_at: ago(200),
    }),
    doc(SCAN, {
      source: "upload",
      current_name: "receipt.jpg",
      mime: "image/jpeg",
      category: "accounting",
      subcategory: null,
      document_type: null,
      issuer: null,
      period_start: null,
      period_end: null,
      account_last4: null,
      status: "processing",
      review_status: "pending",
      imported_at: ago(2),
    }),
  ],
};
const leaseDetail = {
  ...list.items[1],
  explanation: ["Matched landlord name"],
  versions: [
    { version: 1, byte_size: 120_000, created_at: ago(200), original_name: "scan0001.pdf" },
  ],
  names: [
    {
      scope: "app",
      old_name: "scan0001.pdf",
      new_name: "2026-10-01__Landlord__Lease.pdf",
      actor: "clone",
      result: "done",
      detail: null,
      created_at: ago(199),
    },
  ],
  events: [
    { kind: "detected", actor: "clone", detail: {}, created_at: ago(200) },
    { kind: "classified", actor: "clone", detail: {}, created_at: ago(199) },
  ],
  account: null,
  property: { name: "Lisbon flat" },
  entity: { label: "Owner" },
  text_excerpt: "Lease agreement for the Lisbon flat",
  text_chars: 4000,
  name_locked: false,
  filing: null,
};
const settings = {
  settings: {
    auto_classify: true,
    auto_import: true,
    ai_enabled: true,
    rename_drive: true,
    threshold_auto: 0.9,
    threshold_review: 0.6,
    confirm_provisional: false,
    drive_scope: "folders",
    drive_folders: [{ id: "f1", name: "Bills", path: "/Bills" }],
    drive_backfill: false,
    notify_imported: false,
    notify_review: true,
    notify_bank: true,
    upload_drive_folder: { id: "f2", name: "Inbox", path: "/Inbox" },
  },
  rename_available: true,
};
const driveDetail = {
  ...drive,
  folders: [
    { id: "f1", name: "Bills", path: "/Bills" },
    { id: "f2", name: "Inbox", path: "/Inbox" },
    { id: "f3", name: "Homes", path: "/Homes" },
  ],
  scope: "folders",
  selected: [{ id: "f1", name: "Bills", path: "/Bills" }],
  documents: 96,
};
const sigDoc = {
  id: SIG,
  name: "2026-10-01__Landlord__Lease.pdf",
  pages: 2,
  original_sha256: "b".repeat(64),
  reviewed_sha256: "c".repeat(64),
  entity: "Owner",
  document_type: "Lease",
  created_at: ago(1),
  reviewed_pages: [],
  signature_placement: { page: 2, width: 595, height: 842, rect: [360, 82, 550, 142] },
};
const sigDetail = {
  document: sigDoc,
  requests: [],
  history: [{ id: 1, kind: "snapshot_created", at: ago(1) }],
};
const signedDoc = {
  ...sigDoc,
  id: SIGNED,
  name: "Supplier contract.pdf",
  pages: 4,
  state: "signed_validated",
  transport: "external",
  created_at: ago(60 * 30),
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
      path.join(suite.artifactDir, `nsvx-docs-${name}-${viewport.width}.png`),
      frame.png,
    );
  }
  await page.setViewportSize(desktop);
}

/** Nothing in the Docs tab may be wider than a phone screen. */
async function fitsPhone(page: Page) {
  await page.setViewportSize(phone);
  const wide = await page
    .locator(".nsvx-docs *")
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => node.getBoundingClientRect().right > window.innerWidth + 1)
        .map((node) => `${node.tagName}.${node.getAttribute("class") ?? ""}`),
    );
  await page.setViewportSize(desktop);
  return wide;
}

const paramsOf = async (gateway: Awaited<ReturnType<typeof installMockGateway>>, method: string) =>
  (await gateway.getRequests(method)).map((request) => request.params);

suite.define(() => {
  it("files, checks, signs, syncs Drive, and changes settings natively", async () => {
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
                { match: { view: "archiveOverview" }, response: overview },
                { match: { view: "archive" }, response: list },
                { match: { view: "archiveDoc" }, response: leaseDetail },
                { match: { view: "archiveTaxonomy" }, response: { categories } },
                { match: { view: "archivePage" }, response: { src: pageSvg("Lease agreement") } },
                { match: { view: "archiveSettings" }, response: settings },
                { match: { view: "archiveDrive" }, response: driveDetail },
                {
                  match: { view: "archiveRules" },
                  response: {
                    rules: [
                      {
                        id: RULE,
                        match_kind: "issuer",
                        pattern: "Example Bank",
                        subcategory: "banking.statement",
                        hits: 14,
                        active: true,
                      },
                    ],
                  },
                },
                {
                  match: { view: "driveFiles" },
                  response: [
                    {
                      file_id: "d1",
                      name: "Lease 2026.pdf",
                      path: "/Homes/Lisbon/Lease 2026.pdf",
                      mime_type: "application/pdf",
                      modified_time: ago(600),
                    },
                  ],
                },
                {
                  match: { view: "signatureSource" },
                  response: { document_id: null, state: "ready_review" },
                },
                {
                  match: { view: "signatures" },
                  response: { documents: [{ ...sigDoc, state: "ready_review" }, signedDoc] },
                },
                { match: { view: "signature" }, response: sigDetail },
                { match: { view: "signaturePage" }, response: { src: pageSvg("Lease agreement") } },
                {
                  match: { view: "signatureCompanies" },
                  response: { companies: [{ id: "c1", name: "Example Lda", nipc: "500000000" }] },
                },
                { match: { view: "signatureConfig" }, response: { desktop: { available: false } } },
                {
                  match: { view: "signatureProfile" },
                  response: {
                    configured: true,
                    phone_masked: "9•• ••• 678",
                    expected_name: "Owner Name",
                    expected_serial: "BI12345678",
                  },
                },
                { match: { view: "today" }, response: { items: [] } },
              ],
            },
            "nsvx.docs.upload": { results: [{ name: "receipt.pdf", status: "queued", id: SCAN }] },
            // Settings changes answer with NSVX's new settings; other taps with a plain result.
            "nsvx.docs.change": {
              cases: [
                { match: { action: "settings" }, response: settings },
                { match: {}, response: { ok: true } },
              ],
            },
            "nsvx.docs.ask": {
              category: "real_estate.lease",
              explanation: "A rental agreement signed by the landlord.",
              unavailable: false,
            },
            "nsvx.sign.change": { id: SIG, state: "awaiting_external" },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=docs`);
        const surface = page.locator(".nsvx");
        const tab = surface.getByRole("tab", { name: "Docs" });
        await expect.poll(() => tab.getAttribute("aria-selected")).toBe("true");

        // Archive: Drive state, counts, a notice, category chips, and rows with their state.
        const docs = surface.locator(".nsvx-docs");
        await docs.getByText("Google Drive on").waitFor();
        const lease = docs.locator(`[data-doc="${LEASE}"]`);
        await lease.getByText("Check").waitFor();
        await docs.getByText("2 documents to check").waitFor();
        await docs
          .getByRole("button", { name: /Statements|Banking/ })
          .first()
          .waitFor();
        await capture(page, surface, "files", [lease]);
        expect(await fitsPhone(page)).toEqual([]);

        // Add: the picked file goes to NSVX as one upload.
        await docs.locator('label:has-text("Add") input[type=file]').setInputFiles({
          name: "receipt.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4 synthetic"),
        });
        const upload = (await gateway.waitForRequest("nsvx.docs.upload")).params as {
          files: { name: string; data: string }[];
        };
        expect(upload.files[0]?.name).toBe("receipt.pdf");
        expect(Buffer.from(upload.files[0]?.data ?? "", "base64").toString()).toBe(
          "%PDF-1.4 synthetic",
        );

        // One document: the page, NSVX's suggestion accepted in one tap, and a fixed issuer.
        await lease.getByRole("button").click();
        const viewer = docs.locator(".nsvx-docs__viewer");
        await viewer.getByRole("img", { name: "Page 1" }).waitFor();
        await viewer.getByRole("button", { name: "Suggest category" }).click();
        expect((await gateway.waitForRequest("nsvx.docs.ask")).params).toEqual({
          kind: "triage",
          id: LEASE,
        });
        await viewer.getByText("A rental agreement signed by the landlord.").waitFor();
        await capture(page, surface, "doc", [
          viewer.getByText("A rental agreement signed by the landlord."),
        ]);
        expect(await fitsPhone(page)).toEqual([]);
        await viewer.getByRole("button", { name: "Accept" }).click();
        await expect
          .poll(() => paramsOf(gateway, "nsvx.docs.change"))
          .toContainEqual({ action: "correct", id: LEASE, subcategory: "real_estate.lease" });
        await viewer.getByLabel("Number").fill("L-2026-01");
        await viewer.getByRole("button", { name: "Save" }).click();
        await expect
          .poll(() => paramsOf(gateway, "nsvx.docs.change"))
          .toContainEqual({ action: "correct", id: LEASE, number: "L-2026-01" });

        // Sign: the PDF becomes a signature document, every page is seen, then one confirmed request.
        await viewer.getByRole("button", { name: "Sign", exact: true }).click();
        await expect
          .poll(() => paramsOf(gateway, "nsvx.sign.change"))
          .toContainEqual({ action: "fromDoc", id: LEASE });
        const desk = docs.locator(".nsvx-docs__viewer");
        await desk.getByRole("img", { name: "Page 1" }).waitFor();
        const signButton = desk.getByRole("button", { name: "Sign", exact: true });
        expect(await signButton.isDisabled()).toBe(true);
        await desk.getByRole("button", { name: "Next" }).click();
        await desk.getByLabel("Signature here").waitFor();
        await expect.poll(() => signButton.isDisabled()).toBe(false);
        await signButton.click();
        const confirm = desk.locator(".nsvx-docs__confirm");
        await confirm.getByRole("radio", { name: "Me" }).click();
        expect(await confirm.getByLabel("Full name on the certificate").inputValue()).toBe(
          "Owner Name",
        );
        await confirm.getByLabel("I read the document and confirm how and who signs.").check();
        await capture(page, surface, "sign", [confirm]);
        expect(await fitsPhone(page)).toEqual([]);
        await confirm.getByRole("button", { name: "Confirm and sign with CMD" }).click();
        await expect
          .poll(async () =>
            (await paramsOf(gateway, "nsvx.sign.change")).find(
              (params) => (params as { action: string }).action === "request",
            ),
          )
          .toMatchObject({
            action: "request",
            id: SIG,
            mode: "personal",
            name: "Owner Name",
            serial: "BI12345678",
            reviewedSha256: "c".repeat(64),
            confirmed: true,
            key: expect.stringMatching(/^[0-9a-f-]{36}$/),
          });
        await desk.getByRole("button", { name: "Back" }).click();
        const signed = docs.locator(`[data-sig="${SIGNED}"]`);
        await signed.getByText("Signed and verified").waitFor();
        await capture(page, surface, "desk", [signed]);
        expect(await fitsPhone(page)).toEqual([]);

        // Drive: state, find a file, and one setting.
        await docs.getByRole("radio", { name: "Drive", exact: true }).click();
        await docs.getByText("96 documents", { exact: false }).waitFor();
        await docs.getByRole("searchbox", { name: "Find in Drive" }).fill("lease");
        const found = docs.locator('[data-file="d1"]');
        await found.getByText("Homes › Lisbon", { exact: false }).waitFor();
        await capture(page, surface, "drive", [found]);
        expect(await fitsPhone(page)).toEqual([]);
        await docs.getByRole("switch", { name: "Include files already there" }).click();
        await expect
          .poll(() => paramsOf(gateway, "nsvx.docs.change"))
          .toContainEqual({ action: "settings", driveBackfill: true });

        // Settings: automation, learned rules, categories.
        await docs.getByRole("radio", { name: "Settings", exact: true }).click();
        const rule = docs.locator(`[data-rule="${RULE}"]`);
        await rule.getByText("Example Bank").waitFor();
        await capture(page, surface, "settings", [rule]);
        expect(await fitsPhone(page)).toEqual([]);
        await docs.getByRole("switch", { name: "Every filed document" }).click();
        await expect
          .poll(() => paramsOf(gateway, "nsvx.docs.change"))
          .toContainEqual({ action: "settings", notifyImported: true });
        await rule.getByRole("button", { name: "Remove Example Bank" }).click();
        await expect
          .poll(() => paramsOf(gateway, "nsvx.docs.change"))
          .toContainEqual({ action: "ruleOff", id: RULE });
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("opens Sign in Portuguese from the sidebar and asks for the NSVX sign-in when the Gateway has none", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "pt-PT", serviceWorkers: "block" },
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
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=today`);
        const surface = page.locator(".nsvx");
        await surface.getByRole("tab", { name: "Documentos" }).waitFor();
        // NSVX's Assinaturas shortcut opens the signature desk on the open NSVX page.
        await page
          .locator("openclaw-app-sidebar")
          .getByRole("button", { name: /^(Pages|Páginas)$/ })
          .click();
        const pages = page.locator(".sidebar-pages");
        await pages.getByRole("link", { name: "Documentos", exact: true }).waitFor();
        await pages.getByRole("link", { name: "Assinar", exact: true }).click();
        const sign = surface.getByRole("radio", { name: "Assinar", exact: true });
        await expect.poll(() => sign.getAttribute("aria-checked")).toBe("true");
        expect(new URL(page.url()).searchParams.get("docs")).toBe("sign");
        await page.setViewportSize(phone);
        const connect = surface.locator(".nsvx-connect").first();
        await connect.waitFor();
        if (process.env.OPENCLAW_CAPTURE_UI_PROOF === "1") {
          const frame = await takeControlUiScreenshotFrame(page, surface, [connect], {
            animations: "disabled",
            viewport: phone,
          });
          await writeFile(path.join(suite.artifactDir, "nsvx-docs-sign-in-390.png"), frame.png);
        }
      },
    );
  });
});
