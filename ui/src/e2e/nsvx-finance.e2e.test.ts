import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "playwright";
import { expect, it } from "vitest";
import { takeControlUiScreenshotFrame } from "../test-helpers/control-ui-e2e-screenshot.ts";
import {
  defaultControlUiFeatureMethods,
  installMockGateway,
} from "../test-helpers/control-ui-e2e.ts";
import { createControlUiE2eSuite } from "./control-ui-e2e-suite.test-support.ts";

const pluginRoot = fileURLToPath(new URL("../../../extensions/nsvx/", import.meta.url));
const suite = createControlUiE2eSuite({ name: "NSVX finance" });
const desktop = { width: 1280, height: 1000 };
const phone = { width: 390, height: 844 };
const year = new Date().getFullYear();
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const now = new Date().toISOString();

// Synthetic payloads shaped like NSVX /api/finance/* and /api/ledger/* answers.
const dashboard = {
  entity: "owner",
  year,
  summary: { totals: { revenue: { EUR: "18250.00" } }, months_covered: ["01", "02", "03"] },
  regimes: { iva: { regime: "quarterly" } },
  balances: {
    totals: [{ kind: "booked", currency: "EUR", amount: "4210.35" }],
    accounts_read: 2,
    accounts_total: 3,
  },
  efatura_totals: { purchases: "3120.40", purchases_count: 42, sales: "9800.00", sales_count: 12 },
  obligations: [
    {
      id: "o1",
      scope: "eni",
      tax: "iva",
      kind: "payment",
      period: "T3",
      title: "IVA T3",
      effective_due: iso(-2),
      certainty: "official",
      status: "por_preparar",
    },
    {
      id: "o2",
      scope: "personal",
      tax: "irs",
      kind: "filing",
      period: String(year),
      title: "IRS Modelo 3",
      effective_due: iso(9),
      certainty: "statutory",
      status: "por_preparar",
    },
    {
      id: "o3",
      scope: "eni",
      tax: "ss",
      kind: "declaration",
      period: "Q4",
      title: "Segurança Social trimestral",
      effective_due: iso(40),
      certainty: "official",
      status: "preparado",
    },
  ],
  overdue: 1,
  alerts: [],
};
const connections = [
  { code: "cgd", bank: "cgd", label: "CGD", state: "fresh", detail: null, last_success_at: now },
  { code: "bpi", bank: "bpi", label: "BPI", state: "stale", detail: null, last_success_at: now },
  {
    code: "novobanco",
    bank: "novobanco",
    label: "novobanco",
    state: "failed",
    detail: null,
    last_success_at: null,
  },
];
const balance = (amount: string) => [{ kind: "booked", amount, currency: "EUR", observed_at: now }];
const accounts = {
  accounts: [
    {
      id: "a1",
      label: "cgd_main",
      name: "CGD Conta",
      alias_of: null,
      masked_id: "PT50 •••• 1234",
      entity: "owner",
      scope: "personal",
      connection: "cgd",
      type: "CACC",
      balances: balance("3105.10"),
      state: "read",
    },
    {
      id: "a2",
      label: "bpi_main",
      name: "BPI Conta",
      alias_of: null,
      masked_id: "PT50 •••• 9876",
      entity: "owner",
      scope: "personal",
      connection: "bpi",
      type: "CACC",
      balances: balance("1105.25"),
      state: "read",
    },
    {
      id: "a3",
      label: "nb_main",
      name: "novobanco Conta",
      alias_of: null,
      masked_id: "PT50 •••• 5555",
      entity: "owner",
      scope: "personal",
      connection: "novobanco",
      type: "CACC",
      balances: [],
      state: "unknown",
    },
  ],
  totals: [],
};
const cards = {
  cards: [
    {
      id: "c1",
      label: "CGD Visa",
      kind: "credit",
      network: "visa",
      last4: "4242",
      account: "a1",
      connection: "cgd",
      owner: "personal",
      credit_limit: "2000",
      used: "-640.00",
      currency: "EUR",
    },
    {
      id: "c2",
      label: "BPI Débito",
      kind: "debit",
      network: "mastercard",
      last4: "1881",
      account: "a2",
      connection: "bpi",
      owner: "personal",
      credit_limit: null,
      currency: "EUR",
    },
  ],
};
const transactions = {
  transactions: [
    {
      id: "t1",
      account: "CGD Conta",
      connection: "cgd",
      scope: "personal",
      status: "booked",
      booking_date: iso(-1),
      value_date: iso(-1),
      amount: "-42.90",
      currency: "EUR",
      description: "Compra",
      counterparty: "Example Supermarket",
    },
    {
      id: "t2",
      account: "BPI Conta",
      connection: "bpi",
      scope: "personal",
      status: "booked",
      booking_date: iso(-3),
      value_date: iso(-3),
      amount: "1500.00",
      currency: "EUR",
      description: "Transferência",
      counterparty: "Example Client Lda",
    },
    {
      id: "t3",
      account: "CGD Conta",
      connection: "cgd",
      scope: "personal",
      status: "pending",
      booking_date: null,
      value_date: null,
      amount: "-9.99",
      currency: "EUR",
      description: "Subscrição",
      counterparty: "Example Music",
    },
  ],
  next: null,
};
const op = (operation: string, state: "available" | "blocked") => ({
  operation,
  state,
  blocker: state === "blocked" ? "not_certified" : null,
});
const capabilities = {
  connections: [
    {
      code: "cgd",
      label: "CGD",
      connection_state: "fresh",
      operations: [
        op("accounts", "available"),
        op("balances", "available"),
        op("transactions", "available"),
        op("vault", "blocked"),
        op("statements", "blocked"),
        op("transfer_preparation", "blocked"),
        op("transfer_authorisation", "blocked"),
      ],
    },
    {
      code: "bpi",
      label: "BPI",
      connection_state: "stale",
      operations: [
        op("accounts", "available"),
        op("balances", "available"),
        op("transactions", "blocked"),
        op("transfer_authorisation", "blocked"),
      ],
    },
  ],
};
const docsOverview = {
  statements: [
    { account: "a1", label: "CGD Conta", files: 8, months: [1, 2, 3, 4, 5, 6, 7, 8], missing: [9] },
    { account: "a2", label: "BPI Conta", files: 5, months: [1, 2, 4, 5, 6], missing: [3, 7] },
  ],
  saft: [
    { source: "facturama", label: "Faturação", months: [1, 2, 3, 4, 5, 6, 7, 8, 9], missing: [] },
  ],
  invoices: [
    { quarter: 1, total: 40, classified: 40, pending: 0 },
    { quarter: 2, total: 36, classified: 30, pending: 6 },
    { quarter: 3, total: 22, classified: 11, pending: 11 },
  ],
  unclassified: 17,
  duplicates: 2,
  last_sync: { at: now },
};
const doc = (id: string, counterparty: string, total: string, kind: string) => ({
  id,
  name: `${counterparty}.pdf`,
  mime: "application/pdf",
  category_label: "Faturas",
  kind_label: kind,
  counterparty,
  total,
  issued_on: iso(-20),
  year,
  month: 9,
  source_label: "Drive",
  unclassified: false,
  duplicate: false,
});
const browse = {
  path: "",
  crumbs: [],
  folders: [
    { key: String(year), label: String(year), count: 128 },
    { key: String(year - 1), label: String(year - 1), count: 310 },
    { key: "por-classificar", label: "Por classificar", count: 17 },
  ],
  documents: [doc("d1", "Example Energy", "84.20", "Fatura")],
  more: false,
};
// A synthetic invoice page, standing in for the JPEG NSVX renders from the PDF.
const pageSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#fff"/><text x="40" y="70" font-family="sans-serif" font-size="32" fill="#111">Example Energy</text><text x="40" y="120" font-family="sans-serif" font-size="20" fill="#555">Fatura FT 2026/118</text><rect x="40" y="160" width="520" height="2" fill="#ccc"/><text x="40" y="220" font-family="sans-serif" font-size="20" fill="#111">Eletricidade setembro</text><text x="440" y="220" font-family="sans-serif" font-size="20" fill="#111">84,20 €</text></svg>`;
const pageImage = { src: `data:image/svg+xml;base64,${Buffer.from(pageSvg).toString("base64")}` };
const months = (values: number[]) => values.map((value) => value.toFixed(2));
const ledgerOverview = {
  built: true,
  status: "provisional",
  projection: true,
  calculated_at: now,
  balanced: true,
  kpis: {
    revenue: "18250.00",
    fse: "-6120.00",
    ebitda: "12130.00",
    net: "9020.00",
    cash: "4210.35",
    tax: "1840.00",
  },
  coverage: { pct_confirmed: 82, needs_review: 3, documents: 210 },
  monthly: {
    receitas: { months: months([1200, 1500, 1800, 1650, 2100, 1900, 2300, 2050, 1900, 0, 0, 0]) },
  },
};

async function capture(page: Page, surface: Locator, name: string, ready: Locator[]) {
  if (process.env.OPENCLAW_CAPTURE_UI_PROOF !== "1") {
    return;
  }
  for (const viewport of [desktop, phone]) {
    const frame = await takeControlUiScreenshotFrame(page, surface, ready, {
      animations: "disabled",
      viewport,
    });
    await writeFile(
      path.join(suite.artifactDir, `nsvx-finance-${name}-${viewport.width}.png`),
      frame.png,
    );
  }
  await page.setViewportSize(desktop);
}

suite.define(() => {
  it("shows NSVX money, banks, documents, and books natively, read from NSVX views", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const gateway = await installMockGateway(page, {
          nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
          operatorScopes: ["operator.admin"],
          featureMethods: [...defaultControlUiFeatureMethods, "nsvx.view", "nsvx.status"],
          methodResponses: {
            "plugins.list": { plugins: [], diagnostics: [], mutationAllowed: true },
            "nsvx.view": {
              cases: [
                { match: { view: "financeDashboard" }, response: dashboard },
                { match: { view: "financeConnections" }, response: { connections } },
                { match: { view: "financeAccounts" }, response: accounts },
                { match: { view: "financeCards" }, response: cards },
                { match: { view: "bankTransactions" }, response: transactions },
                { match: { view: "bankCapabilities" }, response: capabilities },
                { match: { view: "bankTasks" }, response: { tasks: [] } },
                { match: { view: "docsOverview" }, response: docsOverview },
                { match: { view: "docsBrowse" }, response: browse },
                {
                  match: { view: "docsSearch" },
                  response: {
                    documents: [doc("d1", "Example Energy", "84.20", "Fatura")],
                    more: false,
                  },
                },
                {
                  match: { view: "docPreview" },
                  response: { kind: "pdf", mime: "application/pdf", size: 1, pages: 2 },
                },
                { match: { view: "docPage" }, response: pageImage },
                { match: { view: "ledgerOverview" }, response: ledgerOverview },
                {
                  match: { view: "ledgerReview" },
                  response: {
                    total: 1,
                    transactions: [
                      {
                        id: "x1",
                        occurred_on: iso(-5),
                        description: "Gasóleo",
                        counterparty: "Example Fuel",
                        gross: "-61.30",
                        classification: { issues: ["Sem fatura"] },
                      },
                    ],
                  },
                },
              ],
            },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=money`);
        const surface = page.locator(".nsvx");
        const radio = (name: string) => surface.getByRole("radio", { name, exact: true });

        // Summary: totals, the overdue VAT payment first, and the area in the address.
        const firstDue = surface.getByRole("listitem").filter({ hasText: "IVA T3" });
        await firstDue.waitFor();
        await surface.getByText("1 overdue").waitFor();
        expect(
          (await gateway.waitForRequest("nsvx.view", { match: { view: "financeDashboard" } }))
            .params,
        ).toEqual({
          view: "financeDashboard",
          params: { entity: "owner", scope: "personal", year: String(year) },
        });
        await capture(page, surface, "summary", [firstDue]);

        // Fortune Comet reads the company entity.
        await radio("Fortune Comet").first().click();
        await gateway.waitForRequest("nsvx.view", {
          match: {
            view: "financeDashboard",
            params: { entity: "fortune_comet", scope: "company", year: String(year) },
          },
        });
        expect(new URL(page.url()).searchParams.get("area")).toBe("company");
        await radio("Personal").click();

        // Banks: accounts with their own balance, unknown stays unknown, and cards.
        await radio("Banks").click();
        await surface.getByText("CGD Conta", { exact: true }).waitFor();
        await surface.getByText("Unknown", { exact: true }).waitFor();
        await surface.getByText("CGD Visa", { exact: true }).waitFor();
        await capture(page, surface, "banks", [surface.getByText("CGD Visa", { exact: true })]);
        await radio("Moves").click();
        await surface.getByText("Example Client Lda", { exact: true }).waitFor();
        await surface.getByText("Pending", { exact: false }).first().waitFor();
        await radio("Access").click();
        await surface.getByText("Send transfer", { exact: true }).first().waitFor();
        await capture(page, surface, "access", [surface.getByText("Send transfer").first()]);

        // Docs: month coverage, then a folder file opens in the native viewer.
        await radio("Docs").click();
        await surface.getByText("BPI Conta", { exact: true }).waitFor();
        await capture(page, surface, "docs", [surface.getByText("BPI Conta", { exact: true })]);
        await radio("Folders").click();
        await surface.getByRole("button", { name: /Example Energy/ }).click();
        await surface.getByRole("img", { name: "Example Energy.pdf" }).waitFor();
        await surface.getByText("1 / 2", { exact: true }).waitFor();
        await capture(page, surface, "viewer", [
          surface.getByRole("img", { name: "Example Energy.pdf" }),
        ]);
        await surface.getByRole("button", { name: "More", exact: true }).click();
        await gateway.waitForRequest("nsvx.view", {
          match: { view: "docPage", params: { id: "d1", page: "2", w: "1000" } },
        });
        await surface.getByRole("button", { name: "Close", exact: true }).click();

        // The header search reaches every NSVX document.
        await surface.getByRole("searchbox").fill("energy");
        await surface.getByRole("button", { name: /Search docs/ }).click();
        await gateway.waitForRequest("nsvx.view", {
          match: {
            view: "docsSearch",
            params: { q: "energy", entity: "owner", scope: "personal" },
          },
        });
        await surface.getByRole("searchbox").fill("");

        // Books: KPIs, coverage, and what still needs a decision.
        await radio("Books").click();
        await surface.getByText("EBITDA", { exact: true }).waitFor();
        await capture(page, surface, "books", [surface.getByText("EBITDA", { exact: true })]);
        await radio("Review").click();
        await surface.getByText("Example Fuel", { exact: true }).waitFor();
        expect(
          (await gateway.waitForRequest("nsvx.view", { match: { view: "ledgerReview" } })).params,
        ).toEqual({
          view: "ledgerReview",
          params: { book: "eni", year: String(year), status: "needs_review", limit: "100" },
        });
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("shows the finance tab in Portuguese and asks for the NSVX sign-in when the Gateway has none", async () => {
    await suite.withPage(
      { viewport: phone, locale: "pt-PT", serviceWorkers: "block" },
      async ({ page }) => {
        await installMockGateway(page, {
          nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
          operatorScopes: ["operator.admin"],
          featureMethods: [...defaultControlUiFeatureMethods, "nsvx.view"],
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
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=money&fin=banks`);
        const surface = page.locator(".nsvx");
        await surface.getByRole("radio", { name: "Bancos", exact: true }).waitFor();
        const card = surface.locator(".nsvx-connect");
        await card.waitFor();
        expect(await surface.getByRole("button", { name: "Repetir" }).count()).toBe(1);
        if (process.env.OPENCLAW_CAPTURE_UI_PROOF === "1") {
          const frame = await takeControlUiScreenshotFrame(page, surface, [card], {
            animations: "disabled",
            viewport: phone,
          });
          await writeFile(path.join(suite.artifactDir, "nsvx-finance-sign-in-390.png"), frame.png);
        }
      },
    );
  });
});
