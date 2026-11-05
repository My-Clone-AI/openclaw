import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "playwright";
import { expect, it } from "vitest";
import { takeControlUiScreenshotFrame } from "../test-helpers/control-ui-e2e-screenshot.ts";
import { installMockGateway } from "../test-helpers/control-ui-e2e.ts";
import { createControlUiE2eSuite } from "./control-ui-e2e-suite.test-support.ts";

const pluginRoot = fileURLToPath(new URL("../../../extensions/nsvx/", import.meta.url));
const suite = createControlUiE2eSuite({ name: "NSVX homes" });
const desktop = { width: 1280, height: 1000 };
const mobile = { width: 390, height: 844 };
const capture = process.env.OPENCLAW_CAPTURE_UI_PROOF === "1";
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const month = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Lisbon",
  year: "numeric",
  month: "2-digit",
}).format(new Date());

// Synthetic payloads shaped like NSVX /api/realestate, /api/properties, /api/arrendamento, /api/mortgage, /api/al.
const overview = {
  kpis: {
    properties: 2,
    units: 3,
    occupancy: { total: 3, rented: 2, vacant: 1, rented_pct: "66.7" },
    rent_collected_month: "1300.00",
    rent_expected_month: "1950.00",
    cash_flow_month: "820.00",
    market_value: "520000.00",
    debt: "210000.00",
    equity: "310000.00",
    ltv: "40.4",
  },
  series: Array.from({ length: 12 }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, "0")}`,
    future: i > 10,
    income: "1950.00",
    expected: "1950.00",
    cash_flow: i === 3 ? "-400.00" : String(600 + i * 30),
  })),
  alerts: [
    {
      id: "n1",
      kind: "lease_ending",
      severity: "warn",
      title: "Contrato T2 Lapa termina em 45 dias",
      body: null,
      created_at: ago(90),
      read_at: null,
    },
  ],
  publishing: { live: 1, failed: 0, manual: 0, unsynced: 0 },
  warnings: [],
  empty: false,
};
const homeCard = (id: string, name: string, extra: Record<string, unknown>) => ({
  id,
  name,
  kind: "apartment",
  address: "Rua Exemplo 12",
  city: "Lisboa",
  usage: "rented",
  active_services: 4,
  documents: 5,
  unpaid: 0,
  overdue: 0,
  missing_essentials: 0,
  monthly_estimate: "142.30",
  next_deadline: null,
  ...extra,
});
const hub = {
  properties: [
    homeCard("h1", "T2 Lapa", {
      unpaid: 1,
      overdue: 1,
      next_deadline: { kind: "contract", date: iso(20), days: 20, supplier: "EDP" },
    }),
    homeCard("h2", "Moradia Sintra", {
      kind: "house",
      missing_essentials: 1,
      monthly_estimate: "210.00",
    }),
  ],
  summary: {
    properties: 2,
    active_services: 8,
    monthly_estimate: "352.30",
    unpaid_invoices: 1,
    unpaid_amount: "61.20",
    overdue_invoices: 1,
    deadlines_90d: 1,
    missing_documents: 1,
  },
};
const property = {
  property: {
    id: "h1",
    name: "T2 Lapa",
    kind: "apartment",
    address: "Rua Exemplo 12",
    postal_code: "1200-000",
    city: "Lisboa",
    usage: "rented",
  },
  services: [
    {
      id: "s1",
      category: "electricity",
      supplier: "EDP",
      status: "active",
      monthly_cost: "48.10",
      contract: { state: "ending", days_left: 20 },
    },
    {
      id: "s2",
      category: "water",
      supplier: "EPAL",
      status: "active",
      monthly_cost: "21.40",
      contract: { state: "none", days_left: null },
    },
    {
      id: "s3",
      category: "internet",
      supplier: "MEO",
      status: "active",
      monthly_cost: "39.99",
      contract: { state: "within", days_left: 210 },
    },
  ],
  invoices: [
    {
      id: "i1",
      supplier: "EDP",
      amount: "61.20",
      issued_on: iso(-40),
      due_on: iso(-5),
      state: "overdue",
    },
    {
      id: "i2",
      supplier: "EPAL",
      amount: "19.80",
      issued_on: iso(-30),
      due_on: iso(-15),
      state: "paid",
    },
  ],
  documents: {
    checklist: [
      { category: "caderneta", label: "Caderneta predial", essential: true, state: "available" },
      {
        category: "energetico",
        label: "Certificado energético",
        essential: true,
        state: "expiring",
      },
      { category: "seguro", label: "Seguro multirriscos", essential: true, state: "missing" },
    ],
  },
  official_contacts: [{ code: "112", name: "Emergência", phone: "112", emergency: true }],
  contacts: [],
  expenses: [
    {
      id: "x1",
      category: "condominium",
      description: "",
      amount: "45.00",
      spent_on: iso(-10),
      status: "paid",
    },
  ],
  expense_summary: { estimated_monthly: "142.30", paid: "564.80", unpaid: "61.20" },
  alerts: [],
};
const units = {
  items: [
    {
      id: "u1",
      name: "T2 Lapa",
      property: "Lapa",
      city: "Lisboa",
      status: "rented",
      rent: "950.00",
      asking_rent: null,
      tenant: "Inquilino A",
      lease_end: iso(45),
      ads: 0,
      ads_attention: 0,
    },
    {
      id: "u2",
      name: "Estúdio Graça",
      property: "Graça",
      city: "Lisboa",
      status: "vacant",
      rent: null,
      asking_rent: "700.00",
      tenant: null,
      lease_end: null,
      ads: 1,
      ads_attention: 0,
    },
  ],
};
const rentBoard = {
  properties: [{ id: "rp1", code: "LAPA", name: "T2 Lapa" }],
  tenants: [{ id: "t1", name: "Inquilino A" }],
  contracts: [
    {
      id: "c1",
      property_id: "rp1",
      tenant_ids: ["t1"],
      state: "active",
      terms: { rent: "950.00", due_day: 8 },
    },
  ],
  payments: [
    {
      id: "pay1",
      amount: "950.00",
      received_on: iso(-2),
      payer: "INQUILINO A",
      reference: "RENDA",
    },
  ],
  receipts: [],
  matches: [],
  expected: [
    {
      id: "e1",
      contract_id: "c1",
      period: month,
      amount: "950.00",
      due_on: iso(-3),
      outstanding: "950.00",
      status: "overdue",
    },
  ],
  summary: { month, received: "350.00", outstanding: "950.00", overdue: "950.00" },
  pending: [{ kind: "unmatched_payment", target: "pay1", amount: "950.00" }],
  issuance_enabled: false,
};
const loans = {
  items: [
    {
      id: "l1",
      bank: "Banco Exemplo",
      name: "Habitação Lapa",
      kind: "mortgage",
      principal: "250000.00",
      rate_type: "variable",
      term_months: 360,
      closed_at: null,
      summary: {
        balance: "210000.00",
        remaining_payments: 300,
        payoff_date: "2051-10-08",
        next_due: iso(4),
        installment: "1012.44",
        rate: "3.1",
        interest_year_estimated: "6100.00",
        warnings: [],
      },
      ltv: "40.4",
      assets: [],
      error: null,
    },
  ],
  financing: {
    by_bank: [{ bank: "Banco Exemplo", balance: "210000.00" }],
    resets: [
      { loan_id: "l1", name: "Habitação Lapa", bank: "Banco Exemplo", date: iso(40), days: 40 },
    ],
    interest_ytd: "5420.10",
    variable_share: "100",
  },
};
const loan = {
  ...loans.items[0],
  schedule: [0, 1, 2].map((n) => ({
    n,
    due: iso(4 + n * 30),
    payment: "1012.44",
    interest: "542.50",
    principal: "469.94",
    balance: String(210000 - (n + 1) * 470),
    actual: false,
  })),
};
const rates = {
  loans: [
    {
      loan_id: "l1",
      name: "Habitação Lapa",
      bank: "Banco Exemplo",
      rate: "3.1",
      payment: "1012.44",
      scenarios: [
        { delta: "-0.5", rate: "2.6", custom: false, payment: "955.00", change_monthly: "-57.44" },
        { delta: "0.5", rate: "3.6", custom: false, payment: "1071.00", change_monthly: "58.56" },
        { delta: "1", rate: "4.1", custom: false, payment: "1131.00", change_monthly: "118.56" },
      ],
    },
  ],
};
const stays = {
  today: iso(0),
  kpi: {
    checkins_today: 1,
    checkouts_today: 1,
    occupied: 1,
    houses: 2,
    upcoming: 4,
    cleaning_pending: 1,
    ready: 1,
    with_arrival: 2,
    maintenance_open: 1,
    revenue_month: "2140.00",
  },
  status: [
    {
      id: "a1",
      code: "AL1",
      name: "Alfama Loft",
      state: {
        code: "check_out_hoje",
        label: "Check-out hoje",
        next_arrival: { id: "r2", arrival: iso(0), guest_name: "Guest B", ready: false },
        current: null,
      },
    },
    {
      id: "a2",
      code: "AL2",
      name: "Ericeira Surf",
      state: {
        code: "pronta",
        label: "Pronta",
        next_arrival: { id: "r3", arrival: iso(3), guest_name: "Guest C", ready: true },
        current: null,
      },
    },
  ],
  timeline: [
    { kind: "departure", date: iso(0), property: "Alfama Loft", title: "Guest A" },
    { kind: "cleaning", date: iso(0), property: "Alfama Loft", title: "Limpeza", urgent: true },
    { kind: "arrival", date: iso(0), property: "Alfama Loft", title: "Guest B" },
  ],
  alerts: [
    {
      kind: "cleaning_late",
      severity: "warn",
      title: "Limpeza por confirmar",
      property: "Alfama Loft",
      detail: null,
    },
  ],
  notifications: [
    {
      id: 7,
      title: "Nova reserva Airbnb",
      body: null,
      severity: "info",
      created_at: ago(30),
      read: false,
    },
  ],
};
const booking = (
  id: string,
  source: string,
  label: string,
  guest: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  property: "Alfama Loft",
  kind: "reservation",
  status: "confirmed",
  source,
  source_label: label,
  guest_name: guest,
  adults: 2,
  children: 0,
  arrival: iso(0),
  departure: iso(3),
  nights: 3,
  arrival_time: "15:00",
  conflict: false,
  checked_in_at: null,
  checked_out_at: null,
  ...extra,
});
const bookings = {
  items: [
    booking("r2", "airbnb", "Airbnb", "Guest B"),
    booking("r4", "booking", "Booking.com", "Guest D", { arrival: iso(5), departure: iso(8) }),
    booking("r5", "manual", "Direta", "Guest E", { checked_in_at: ago(600), conflict: true }),
  ],
};
const tasks = {
  items: [
    {
      id: "k1",
      property: "Alfama Loft",
      kind: "cleaning",
      title: "Limpeza após saída",
      status: "em_curso",
      status_label: "Em curso",
      assignee: "Equipa 1",
      due_at: ago(-120),
      urgent: true,
      checklist_done: 6,
      checklist_total: 9,
    },
    {
      id: "k2",
      property: "Ericeira Surf",
      kind: "cleaning",
      title: "Limpeza",
      status: "por_confirmar",
      status_label: "Por confirmar",
      assignee: null,
      due_at: ago(-2880),
      urgent: false,
      checklist_done: 0,
      checklist_total: 9,
    },
  ],
};
const viewCases = [
  { match: { view: "homesOverview" }, response: overview },
  { match: { view: "homesHub" }, response: hub },
  {
    match: { view: "homesHubAlerts" },
    response: {
      alerts: [
        {
          id: "ha1",
          kind: "invoice_overdue",
          severity: "critical",
          title: "Fatura EDP vencida",
          due_on: iso(-5),
          read_at: null,
          property_id: "h1",
          property_name: "T2 Lapa",
        },
      ],
    },
  },
  { match: { view: "homesHubProperty" }, response: property },
  { match: { view: "homesUnits" }, response: units },
  { match: { view: "rentBoard" }, response: rentBoard },
  {
    match: { view: "homesRent" },
    response: {
      month,
      items: [],
      overdue: [],
      summary: {
        expected: "950.00",
        collected: "0",
        outstanding: "950.00",
        overdue_total: "950.00",
        overdue_count: 1,
      },
    },
  },
  {
    match: { view: "rentSuggestions" },
    response: {
      items: [
        {
          expected_ids: ["e1"],
          score: 90,
          reasons: ["exact", "payer"],
          allocations: ["950.00"],
          exact: true,
        },
      ],
    },
  },
  { match: { view: "homesLoans" }, response: loans },
  { match: { view: "homesLoan" }, response: loan },
  {
    match: { view: "mortgageCases" },
    response: {
      cases: [
        {
          id: "m1",
          title: "Compra Graça",
          purpose: "acquisition",
          regime: "consumer",
          state: "documents_pending",
          revision: 4,
        },
      ],
      notices: [],
    },
  },
  {
    match: { view: "mortgageCase" },
    response: {
      case: {
        id: "m1",
        title: "Compra Graça",
        purpose: "acquisition",
        regime: "consumer",
        state: "documents_pending",
        revision: 4,
      },
      records: [
        {
          id: "r1",
          kind: "assessment",
          logical_key: "assessment",
          data: { projected_ratio: "31.5", remaining: "1240.00" },
        },
        {
          id: "r2",
          kind: "requirement",
          logical_key: "irs",
          data: { label: "Declaração de IRS", status: "missing" },
        },
        {
          id: "r3",
          kind: "requirement",
          logical_key: "id",
          data: { label: "Cartão de cidadão", status: "accepted" },
        },
      ],
      history: [],
    },
  },
  {
    match: { view: "mortgageLenders" },
    response: {
      lenders: [{ code: "cgd", brand: "Caixa Geral", stale: false, verified_on: iso(-10) }],
    },
  },
  { match: { view: "stayOverview" }, response: stays },
  { match: { view: "stayReservations" }, response: bookings },
  { match: { view: "stayTasks" }, response: tasks },
  {
    match: { view: "stayMaintenance" },
    response: {
      items: [
        {
          id: "f1",
          property: "Ericeira Surf",
          title: "Esquentador sem pressão",
          priority: "alta",
          unfit: false,
          status: "aberto",
          status_label: "Aberto",
          created_at: ago(1440),
        },
      ],
    },
  },
  {
    match: { view: "stayMe" },
    response: {
      me: { name: "Owner", kind: "owner", perms: [] },
      properties: [
        { id: "a1", code: "AL1", name: "Alfama Loft" },
        { id: "a2", code: "AL2", name: "Ericeira Surf" },
      ],
      unread: 1,
      unread_messages: 0,
    },
  },
  {
    match: { view: "stayInventory" },
    response: {
      items: [
        {
          id: "v1",
          property: "Alfama Loft",
          name: "Papel higiénico",
          unit: "rolos",
          quantity: "4",
          min_quantity: "8",
          low: true,
        },
        {
          id: "v2",
          property: "Alfama Loft",
          name: "Cápsulas café",
          unit: "un",
          quantity: "60",
          min_quantity: "20",
          low: false,
        },
      ],
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
      path.join(suite.artifactDir, `nsvx-homes-${name}-${viewport.width}.png`),
      frame.png,
    );
    // Nothing may stick out past the phone: clipped buttons cannot be tapped.
    const wide = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".nsvx-homes *")]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .map((el) => `${el.tagName}.${el.className}`),
    );
    expect(wide, `${name} at ${viewport.width}`).toEqual([]);
  }
  await page.setViewportSize(desktop);
}

suite.define(() => {
  it("runs homes natively: summary, homes, rent, loans, mortgage, and short stays", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const ok = { ok: true };
        const gateway = await installMockGateway(page, {
          nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
          operatorScopes: ["operator.admin"],
          methodResponses: {
            "nsvx.view": { cases: viewCases },
            "nsvx.homes.ask": {
              intent: "invoices_open",
              answer: "1 fatura(s) vencidas: EDP · T2 Lapa (61,20 € · vence 31/10).",
              items: [{ kind: "invoice", label: "EDP · T2 Lapa", detail: "61,20 €" }],
            },
            "nsvx.homes.rates": rates,
            "nsvx.homes.notice": ok,
            "nsvx.homes.alertRead": ok,
            "nsvx.homes.expense": { id: "x2" },
            "nsvx.rent.associate": ok,
            "nsvx.mortgage.checklist": { revision: 5 },
            "nsvx.stay.step": ok,
            "nsvx.stay.task": ok,
            "nsvx.stay.issue": { id: "f2" },
            "nsvx.stay.noticesRead": ok,
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=homes`);
        const surface = page.locator(".nsvx");
        const radio = (name: string) => surface.getByRole("radio", { name, exact: true });
        const params = async (method: string) =>
          (await gateway.getRequests(method)).map((r) => r.params as Record<string, unknown>);

        // Summary: tiles, cash-flow bars, alerts first, and a question answered from records.
        const notice = surface.getByText("Contrato T2 Lapa termina em 45 dias");
        await notice.waitFor();
        await surface.getByText("Fatura EDP vencida").waitFor();
        await surface.getByRole("button", { name: "Late bills" }).click();
        expect((await gateway.waitForRequest("nsvx.homes.ask")).params).toEqual({
          q: "Faturas em atraso",
        });
        await surface.getByText("From records").waitFor();
        await shoot(page, surface, "summary", [notice]);
        await surface
          .locator(".nsvx-row", { hasText: "Contrato T2 Lapa" })
          .getByRole("button", { name: "Seen" })
          .click();
        await expect
          .poll(() => params("nsvx.homes.notice"))
          .toEqual([{ noticeId: "n1", action: "read" }]);

        // Homes: cards with bills and papers; one home opens with services, papers, contacts, and a new cost.
        await radio("Homes").click();
        const lapa = surface.locator(".nsvx-homes__card", { hasText: "T2 Lapa" });
        await lapa.waitFor();
        await surface.getByText("Estúdio Graça").waitFor();
        await shoot(page, surface, "homes", [lapa]);
        await lapa.click();
        await surface.getByText("Caderneta predial").waitFor();
        expect(new URL(page.url()).searchParams.get("home")).toBe("h1");
        await surface.getByLabel("Amount").fill("45,90");
        await surface.getByRole("button", { name: "Add" }).click();
        await expect
          .poll(async () => (await params("nsvx.homes.expense"))[0])
          .toEqual({
            propertyId: "h1",
            category: "maintenance",
            amount: "45.90",
            spentOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            status: "paid",
            idempotencyKey: expect.stringMatching(/^oc-/),
          });
        await shoot(page, surface, "home", [surface.getByText("Caderneta predial")]);

        // Rent: the month's rents and a bank payment matched to the rent NSVX ranks first.
        await radio("Rent").click();
        const pay = surface.locator(".nsvx-homes__payment", { hasText: "INQUILINO A" });
        await pay.waitFor();
        await pay.getByRole("button", { name: "Match" }).click();
        await pay.getByText("90%").waitFor();
        await shoot(page, surface, "rent", [pay.getByText("90%")]);
        await pay.getByRole("button", { name: "Link" }).click();
        await expect
          .poll(() => params("nsvx.rent.associate"))
          .toEqual([{ paymentId: "pay1", allocations: [{ expectedId: "e1", amount: "950.00" }] }]);

        // Loans: balance, next payment, rate moves, and a mortgage case with what is missing.
        await radio("Loans").click();
        await surface.getByText("Habitação Lapa").first().waitFor();
        await surface.getByText("+€119").waitFor();
        await surface.locator(".nsvx-homes__loan").click();
        await surface.locator(".nsvx-homes__table").waitFor();
        await surface.getByRole("button", { name: /Compra Graça/ }).click();
        await surface.getByText("Declaração de IRS").waitFor();
        await surface.getByLabel("Bank list").selectOption("cgd");
        await surface.locator(".nsvx-homes__case").getByRole("button", { name: "Add" }).click();
        await expect
          .poll(() => params("nsvx.mortgage.checklist"))
          .toEqual([{ caseId: "m1", revision: 4, lender: "cgd" }]);
        await shoot(page, surface, "loans", [surface.getByText("Declaração de IRS")]);

        // Stays: houses by state, then bookings with channel marks, cleaning moves, fixes, and stock.
        await radio("Stays").click();
        const house = surface.locator(".nsvx-homes__house", { hasText: "Alfama Loft" });
        await house.waitFor();
        await shoot(page, surface, "stays", [house]);
        await surface.getByRole("button", { name: "All seen" }).click();
        await expect.poll(() => params("nsvx.stay.noticesRead")).toEqual([{ ids: [7] }]);

        await radio("Bookings").click();
        await surface.getByRole("img", { name: "Airbnb" }).first().waitFor();
        await surface.getByRole("img", { name: "Booking.com" }).first().waitFor();
        await surface
          .locator(".nsvx-row", { hasText: "Guest B" })
          .getByRole("button", { name: "Check in" })
          .click();
        await expect
          .poll(() => params("nsvx.stay.step"))
          .toEqual([{ reservationId: "r2", step: "checkin" }]);
        await shoot(page, surface, "bookings", [
          surface.getByRole("img", { name: "Airbnb" }).first(),
        ]);

        await radio("Cleaning").click();
        const task = surface.locator(".nsvx-homes__task", { hasText: "Limpeza após saída" });
        await task.getByRole("button", { name: "Done" }).click();
        await expect
          .poll(() => params("nsvx.stay.task"))
          .toEqual([{ taskId: "k1", action: "complete" }]);
        await shoot(page, surface, "cleaning", [task]);

        await radio("Fixes").click();
        await surface.getByText("Esquentador sem pressão").waitFor();
        await surface.getByLabel("House").selectOption("a1");
        await surface.getByLabel("What happened?").fill("Fechadura presa");
        await surface.locator(".nsvx-homes__form").getByRole("button", { name: "Report" }).click();
        await expect
          .poll(() => params("nsvx.stay.issue"))
          .toEqual([{ house: "a1", title: "Fechadura presa", priority: "media", unfit: false }]);
        await shoot(page, surface, "fixes", [surface.getByText("Esquentador sem pressão")]);

        await radio("Stock").click();
        await surface.getByText("Papel higiénico").waitFor();
        await shoot(page, surface, "stock", [surface.getByText("Papel higiénico")]);
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("shows homes in Portuguese and asks for the NSVX sign-in when the Gateway has none", async () => {
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
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=homes&homes=stays`);
        const surface = page.locator(".nsvx");
        await surface.getByRole("radio", { name: "Reservas", exact: true }).waitFor();
        const card = surface.locator(".nsvx-connect");
        await card.waitFor();
        if (capture) {
          const frame = await takeControlUiScreenshotFrame(page, surface, [card], {
            animations: "disabled",
            viewport: mobile,
          });
          await writeFile(path.join(suite.artifactDir, "nsvx-homes-sign-in-390.png"), frame.png);
        }
      },
    );
  });
});
