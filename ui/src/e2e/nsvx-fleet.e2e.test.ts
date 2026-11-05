import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "playwright";
import { expect, it } from "vitest";
import { takeControlUiScreenshotFrame } from "../test-helpers/control-ui-e2e-screenshot.ts";
import { installMockGateway } from "../test-helpers/control-ui-e2e.ts";
import { createControlUiE2eSuite } from "./control-ui-e2e-suite.test-support.ts";

const pluginRoot = fileURLToPath(new URL("../../../extensions/nsvx/", import.meta.url));
const suite = createControlUiE2eSuite({ name: "NSVX fleet" });
const desktop = { width: 1280, height: 1000 };
const mobile = { width: 390, height: 844 };
const capture = process.env.OPENCLAW_CAPTURE_UI_PROOF === "1";
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const at = (hour: number) => {
  const day = new Date();
  day.setHours(hour, 0, 0, 0);
  return day.toISOString();
};

// Synthetic payloads shaped like NSVX /api/tvde/*, /api/transports/uber and /api/business/uber answers.
const compliance = (overall: string, score: number) => ({
  overall,
  score,
  required: 6,
  ok: Math.round((score / 100) * 6),
  issues: [],
  next_expiry: iso(20),
});
const alerts = [
  {
    id: "al1",
    kind: "doc_expiring",
    severity: "critical",
    title: "Seguro AA-00-AA expira em 5 dias",
    driver_id: null,
    vehicle_id: "v1",
    due_on: iso(5),
    created_at: ago(60),
    acknowledged_at: null,
    resolved_at: null,
  },
  {
    id: "al2",
    kind: "doc_missing",
    severity: "warning",
    title: "Ana Costa: registo criminal em falta",
    driver_id: "d1",
    vehicle_id: null,
    due_on: null,
    created_at: ago(120),
    acknowledged_at: null,
    resolved_at: null,
  },
];
const dashboard = {
  today: iso(0),
  has_company: true,
  drivers: { total: 3, active: 2, onboarding: 1, pending: 0, issues: 1, not_ready: 1 },
  vehicles: { total: 2, available: 0, assigned: 2, unavailable: 0, not_ready: 0 },
  documents: { expiring: 2, expired: 0, missing: 1, review: 1 },
  tasks: { open: 2, overdue: 1 },
  alerts: { total: 2, critical: 1, items: alerts },
  renewals: [
    {
      date: iso(5),
      days_left: 5,
      type: "insurance",
      label: "Seguro",
      status: "expiring",
      document_id: "doc1",
      subject: "vehicle",
      entity_id: "v1",
      entity: "AA-00-AA",
    },
    {
      date: iso(40),
      days_left: 40,
      type: "cmtvde",
      label: "Certificado TVDE",
      status: "valid",
      document_id: "doc2",
      subject: "driver",
      entity_id: "d2",
      entity: "Rui Lopes",
    },
  ],
  companies: [],
  activity: [
    {
      seq: 9,
      at: ago(30),
      actor: "owner",
      action: "task_done",
      summary: "Tarefa concluída: Lavagem",
    },
  ],
  integrations: [
    {
      code: "uber",
      label: "Uber Fleet",
      category: "platform",
      state: "connected",
      last_success_at: ago(45),
      counts: {},
    },
    {
      code: "bolt",
      label: "Bolt Fleet",
      category: "platform",
      state: "not_connected",
      last_success_at: null,
      counts: {},
    },
  ],
  trips: { week: 184, net: "2210.40" },
  finance: null,
};
const tasks = [
  {
    id: "t1",
    title: "Marcar inspeção AA-00-AA",
    kind: "manual",
    priority: "high",
    status: "open",
    due_on: iso(-1),
    driver_id: null,
    vehicle_id: "v1",
    driver_name: null,
    plate: "AA-00-AA",
  },
  {
    id: "t2",
    title: "Pedir registo criminal",
    kind: "missing_document",
    priority: "normal",
    status: "open",
    due_on: iso(6),
    driver_id: "d1",
    vehicle_id: null,
    driver_name: "Ana Costa",
    plate: null,
  },
];
const driver = {
  id: "d1",
  code: "M-0001",
  full_name: "Ana Costa",
  status: "active",
  phone: "+351 900 000 001",
  email: "ana@example.com",
  uber_ref: "u-1",
  bolt_ref: null,
  payment_model: "commission",
  compliance: compliance("attention", 83),
  vehicles: [{ id: "v1", label: "AA-00-AA", shift: "manhã" }],
};
const drivers = [
  driver,
  {
    ...driver,
    id: "d2",
    code: "M-0002",
    full_name: "Rui Lopes",
    uber_ref: "u-2",
    bolt_ref: "b-2",
    compliance: compliance("compliant", 100),
    vehicles: [{ id: "v2", label: "BB-11-BB", shift: null }],
  },
  {
    ...driver,
    id: "d3",
    code: "M-0003",
    full_name: "Marta Silva",
    status: "onboarding",
    uber_ref: null,
    compliance: compliance("not_ready", 33),
    vehicles: [],
  },
];
const cell = (type: string, label: string, status: string, days: number | null) => ({
  type,
  label,
  status,
  required: true,
  expires_on: days === null ? null : iso(days),
  days_left: days,
  document_id: status === "missing" ? null : `doc-${type}`,
});
const driverDetail = {
  ...driver,
  company_name: "Example Transportes Lda",
  cells: [
    cell("cc", "Cartão de cidadão", "valid", 900),
    cell("license", "Carta de condução", "valid", 400),
    cell("cmtvde", "Certificado TVDE", "expiring", 20),
    cell("criminal", "Registo criminal", "missing", null),
  ],
  tasks: [tasks[1]],
  alerts: [alerts[1]],
  events: [
    {
      seq: 4,
      at: ago(600),
      actor: "owner",
      action: "driver_updated",
      summary: "Motorista atualizado",
    },
  ],
  platforms: [
    {
      platform: "uber",
      ext_id: "u-1",
      status: "active",
      trips_30d: 212,
      net_30d: "2480.10",
      synced_at: ago(45),
    },
  ],
};
const vehicle = {
  id: "v1",
  label: "AA-00-AA",
  plate: "AA-00-AA",
  fleet_no: "3",
  brand: "Toyota",
  model: "Corolla",
  year: 2022,
  energy: "hybrid",
  mileage_km: 118250,
  status: "assigned",
  uber_status: "active",
  bolt_status: "pending",
  compliance: compliance("attention", 83),
  drivers: [{ id: "d1", name: "Ana Costa", shift: "manhã" }],
};
const vehicles = [
  vehicle,
  {
    ...vehicle,
    id: "v2",
    label: "BB-11-BB",
    plate: "BB-11-BB",
    fleet_no: "4",
    brand: "Kia",
    model: "e-Niro",
    energy: "electric",
    mileage_km: 64010,
    compliance: compliance("compliant", 100),
    drivers: [{ id: "d2", name: "Rui Lopes", shift: null }],
  },
];
const vehicleDetail = {
  ...vehicle,
  cells: [cell("dua", "DUA", "valid", null), cell("insurance", "Seguro", "expiring", 5)],
  tasks: [tasks[0]],
  alerts: [alerts[0]],
  events: [],
};
const forecast = {
  maintenance_id: "m1",
  vehicle_id: "v1",
  vehicle_label: "AA-00-AA",
  title: "Revisão 120 000 km",
  state: "forecast",
  actual_km: 118250,
  threshold_km: 120000,
  remaining_km: 1750,
  estimated_on: iso(12),
  documented_due_on: null,
  sample_count: 4,
  as_of: iso(0),
};
const mileage = {
  readings: [
    {
      id: "r1",
      state: "pending",
      revision: 3,
      original_value: null,
      original_unit: null,
      observed_on: null,
      km: null,
      filename: "painel.jpg",
      extraction_state: "ready",
      result: { odometer: "118250", unit: "km", observed_on: iso(-1), plate: null, issues: [] },
    },
  ],
  forecasts: [forecast],
};
const maintenance = [
  {
    id: "m1",
    vehicle_id: "v1",
    vehicle_label: "AA-00-AA",
    kind: "service",
    title: "Revisão 120 000 km",
    status: "scheduled",
    scheduled_on: iso(10),
    done_on: null,
    reported_on: iso(-3),
    workshop: "Oficina Exemplo",
    cost: null,
    next_due_on: null,
    next_due_km: 120000,
  },
];
const shifts = [
  {
    id: "s1",
    kind: "shift",
    status: "planned",
    starts_at: at(7),
    ends_at: at(15),
    driver_id: "d1",
    driver_name: "Ana Costa",
    vehicle_label: "AA-00-AA",
    notes: null,
  },
];
const finance = {
  period: { start: iso(-150), end: iso(0) },
  revenue: {
    gross: "14200.00",
    fees: "3100.00",
    tips: "120.00",
    net: "11100.00",
    cash: "400.00",
    other_invoiced: "0.00",
  },
  expenses: { total: "4300.00", vat_in: "620.00", by_category: { Combustível: "1800.00" } },
  settlements: { company_share: "3900.00", driver_payouts: "5100.00", count: 8 },
  operating_result: "1700.00",
  by_month: [
    { month: "2026-08", revenue: "3400.00", expenses: "1200.00", cash_in: "0", cash_out: "0" },
    { month: "2026-09", revenue: "3900.00", expenses: "1500.00", cash_in: "0", cash_out: "0" },
    { month: "2026-10", revenue: "3800.00", expenses: "1600.00", cash_in: "0", cash_out: "0" },
  ],
  by_platform: { uber: "7400.00", bolt: "3700.00" },
  by_driver: { "Ana Costa": "6100.00" },
  receivables: "0.00",
  payables: "620.00",
  owed_to_drivers: "1240.00",
  owed_by_drivers: "0.00",
};
const answer = {
  answer: "Documentos em falta:",
  items: [{ label: "Ana Costa", detail: "Registo criminal", link: "/tvde/motoristas/d1" }],
  source: "registos",
  as_of: iso(0),
};
const access = {
  access: [
    {
      id: "ac1",
      role: "driver",
      driver_id: "d2",
      driver_name: "Rui Lopes",
      label: null,
      expires_at: iso(20),
      revoked_at: null,
      last_used_at: ago(300),
      sessions: 1,
      created_at: ago(9000),
    },
  ],
  location_sharing: false,
  retention_days: 30,
};
const uber = {
  configured: true,
  drive_saved: true,
  profiles: {},
  route: null,
  run: {
    state: "completed",
    year: 2026,
    quarter: 3,
    items: {
      a: {
        documents: [
          {
            kind: "invoice",
            classification: "x",
            issued_on: "2026-08-14",
            entity: "fortune_comet",
            drive_file_id: "f1",
          },
        ],
      },
      b: {
        documents: [
          {
            kind: "receipt",
            classification: "x",
            issued_on: "2026-09-02",
            entity: null,
            drive_file_id: "f2",
          },
        ],
      },
    },
  },
};
const viewCases = [
  { match: { view: "fleetDashboard" }, response: dashboard },
  { match: { view: "fleetTasks" }, response: { tasks, today: iso(0) } },
  {
    match: { view: "fleetIntegrations" },
    response: { integrations: dashboard.integrations, drive_connected: true },
  },
  { match: { view: "fleetDrivers" }, response: { drivers, total: drivers.length } },
  { match: { view: "fleetDriver" }, response: driverDetail },
  { match: { view: "fleetVehicles" }, response: { vehicles, total: vehicles.length } },
  { match: { view: "fleetVehicle" }, response: vehicleDetail },
  { match: { view: "fleetMaintenance" }, response: { maintenance } },
  { match: { view: "fleetMileage" }, response: mileage },
  {
    match: { view: "fleetForecasts" },
    response: {
      forecasts: [
        forecast,
        {
          ...forecast,
          maintenance_id: "m2",
          vehicle_id: "v2",
          vehicle_label: "BB-11-BB",
          title: "Pneus",
          state: "missing_threshold",
          threshold_km: null,
          remaining_km: null,
          estimated_on: null,
        },
      ],
    },
  },
  { match: { view: "fleetShifts" }, response: { shifts } },
  { match: { view: "fleetFinance" }, response: finance },
  { match: { view: "fleetAccess" }, response: access },
  {
    match: { view: "fleetRequests" },
    response: {
      requests: [
        {
          id: "q1",
          kind: "time_off",
          driver_name: "Rui Lopes",
          status: "open",
          message: "Folga sábado?",
          answer: null,
          created_at: ago(90),
        },
      ],
    },
  },
  { match: { view: "fleetAnnouncements" }, response: { announcements: [] } },
  { match: { view: "uberPersonal" }, response: uber },
  {
    match: { view: "uberBusiness" },
    response: { configured: false, drive_saved: false, route: null, run: null },
  },
  {
    match: { view: "fleetPlatform" },
    response: {
      drivers: [],
      vehicles: [],
      trips: [
        {
          ext_id: "x1",
          at: ago(50),
          driver_name: "Ana C.",
          full_name: "Ana Costa",
          plate: "AA-00-AA",
          status: "completed",
          net: "12.40",
          currency: "EUR",
          distance_km: "8.2",
        },
      ],
    },
  },
];

async function shoot(
  page: Page,
  surface: Locator,
  name: string,
  ready: Locator[],
  viewports = [desktop, mobile],
) {
  if (!capture) {
    return;
  }
  for (const viewport of viewports) {
    const frame = await takeControlUiScreenshotFrame(page, surface, ready, {
      animations: "disabled",
      viewport,
    });
    await writeFile(
      path.join(suite.artifactDir, `nsvx-fleet-${name}-${viewport.width}.png`),
      frame.png,
    );
    // Nothing in the fleet may stick out past the phone: clipped buttons cannot be tapped.
    const wide = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".nsvx-fleet *")]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .map((el) => `${el.tagName}.${el.className}`),
    );
    expect(wide, `${name} at ${viewport.width}`).toEqual([]);
  }
  await page.setViewportSize(desktop);
}

suite.define(() => {
  it("runs the TVDE fleet natively: home, drivers, cars, km, plan, money, ask, portal, and trips", async () => {
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
            "nsvx.fleet.change": {
              cases: [
                {
                  match: { action: "accessCreate" },
                  response: {
                    id: "ac2",
                    url: "https://nsvx.example/motorista#one-time",
                    expiresAt: iso(30),
                  },
                },
                { match: {}, response: { ok: true } },
              ],
            },
            "nsvx.fleet.ask": answer,
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=fleet`);
        const surface = page.locator(".nsvx");
        const radio = (name: string) => surface.getByRole("radio", { name, exact: true });
        const changes = async (action: string) =>
          (await gateway.getRequests("nsvx.fleet.change"))
            .map((r) => r.params as Record<string, unknown>)
            .filter((p) => p.action === action);

        // Home: counts, alerts first, renewals, platforms with their marks.
        const firstAlert = surface.getByText("Seguro AA-00-AA expira em 5 dias");
        await firstAlert.waitFor();
        await surface.getByText("1 Not ready", { exact: true }).waitFor();
        await surface.getByText("Uber Fleet", { exact: true }).waitFor();
        await shoot(page, surface, "home", [firstAlert]);

        await surface
          .locator(".nsvx-row", { hasText: "Seguro AA-00-AA" })
          .getByRole("button", { name: "Seen" })
          .click();
        await expect
          .poll(() => changes("ackAlert"))
          .toEqual([{ action: "ackAlert", alertId: "al1" }]);
        await surface.getByRole("checkbox", { name: "Done" }).first().click();
        await expect
          .poll(() => changes("task"))
          .toEqual([{ action: "task", taskId: "t1", status: "done" }]);
        await surface.getByPlaceholder("New task").fill("Trocar pneus");
        await surface.getByPlaceholder("New task").press("Enter");
        await expect
          .poll(async () => (await changes("createTask"))[0])
          .toEqual({ action: "createTask", title: "Trocar pneus", key: expect.any(String) });

        // Drivers: compliance rings and platform marks; a driver opens with the address kept.
        await radio("Drivers").click();
        await surface.getByText("Marta Silva", { exact: true }).waitFor();
        await surface.locator(".nsvx-fleet-card", { hasText: "Ana Costa" }).click();
        await surface.getByText("Registo criminal", { exact: true }).first().waitFor();
        expect(new URL(page.url()).searchParams.get("driver")).toBe("d1");
        await shoot(page, surface, "driver", [surface.getByText("Example Transportes Lda")]);

        // Cars: plate, service forecast, and a reading the owner confirms after checking the car.
        await radio("Cars").click();
        await surface.locator(".nsvx-fleet-card", { hasText: "Corolla" }).click();
        await surface.getByText("Revisão 120 000 km").first().waitFor();
        const confirm = surface.getByRole("button", { name: "Confirm", exact: true });
        expect(await confirm.isDisabled()).toBe(true);
        await surface.getByText("Right car").click();
        await confirm.click();
        await expect
          .poll(async () => (await changes("mileage"))[0])
          .toEqual({
            action: "mileage",
            decision: "confirm",
            vehicleId: "v1",
            readingId: "r1",
            revision: 3,
            value: "118250",
            unit: "km",
            observedOn: iso(-1),
            vehicleConfirmed: true,
            issuesResolved: false,
          });
        await shoot(page, surface, "car", [surface.locator(".nsvx-fleet-forecast").first()]);

        await radio("Km").click();
        await surface.getByText("Pneus", { exact: true }).waitFor();
        await shoot(page, surface, "km", [surface.getByText("Pneus", { exact: true })]);

        // Plan: this week's shift changes status on NSVX.
        await radio("Plan").click();
        const shift = surface.locator(".nsvx-fleet-shift", { hasText: "Ana Costa" });
        await shift.waitFor();
        await shift.locator("select").selectOption("confirmed");
        await expect
          .poll(() => changes("shift"))
          .toEqual([{ action: "shift", shiftId: "s1", status: "confirmed" }]);
        await shoot(page, surface, "plan", [shift]);

        // Money: read only, with platform split.
        await radio("Money").click();
        await surface.getByText("Read only").waitFor();
        await surface.getByText("Owed to drivers").waitFor();
        await shoot(page, surface, "money", [surface.getByText("Owed to drivers")]);

        // Ask: a quick question goes to the NSVX assistant in its own words; the answer opens the driver.
        await radio("Ask").click();
        await surface.getByRole("button", { name: "Missing documents" }).click();
        expect((await gateway.waitForRequest("nsvx.fleet.ask")).params).toEqual({
          question: "Documentos em falta",
        });
        await surface.getByText("From records").waitFor();
        await shoot(page, surface, "ask", [surface.getByText("From records")]);

        // Portal: a new driver link is shown once to copy; Trips: collecting receipts asks first.
        await radio("Portal").click();
        await surface.getByText("Folga sábado?").waitFor();
        const newLink = surface.locator(".nsvx-fleet-block", { hasText: "New link" });
        await newLink.locator("select").selectOption("d1");
        await newLink.getByRole("button", { name: "Create" }).click();
        await surface.getByText("https://nsvx.example/motorista#one-time").waitFor();
        expect((await changes("accessCreate"))[0]).toEqual({
          action: "accessCreate",
          role: "driver",
          driverId: "d1",
          days: 30,
        });
        await shoot(page, surface, "portal", [
          surface.getByText("https://nsvx.example/motorista#one-time"),
        ]);

        await radio("Trips").click();
        const personal = surface.locator(".nsvx-fleet-uber", { hasText: "Uber Personal" });
        await personal.getByText("Fortune Comet").waitFor();
        await personal.getByRole("button", { name: "Collect" }).click();
        await personal.locator(".nsvx-confirm").getByRole("button", { name: "Collect" }).click();
        await expect
          .poll(async () => (await changes("uberCollect"))[0])
          .toMatchObject({ action: "uberCollect", account: "personal" });
        await surface.getByText("Ana Costa", { exact: true }).waitFor();
        await shoot(page, surface, "trips", [personal]);
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("shows the fleet in Portuguese and asks for the NSVX sign-in when the Gateway has none", async () => {
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
                message: "NSVX owner sign-in is not set up on this Gateway.",
              },
            },
          },
        });
        await page.goto(
          `${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=fleet&fleet=drivers`,
        );
        const surface = page.locator(".nsvx");
        await surface.getByRole("radio", { name: "Motoristas", exact: true }).waitFor();
        const card = surface.locator(".nsvx-connect");
        await card.waitFor();
        if (capture) {
          const frame = await takeControlUiScreenshotFrame(page, surface, [card], {
            animations: "disabled",
            viewport: mobile,
          });
          await writeFile(path.join(suite.artifactDir, "nsvx-fleet-sign-in-390.png"), frame.png);
        }
      },
    );
  });
});
