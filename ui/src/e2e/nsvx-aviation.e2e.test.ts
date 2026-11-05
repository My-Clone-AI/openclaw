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
const suite = createControlUiE2eSuite({ name: "NSVX aviation" });
const desktop = { width: 1280, height: 1000 };
const phone = { width: 390, height: 844 };
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const month = (offset: number) => {
  const d = new Date();
  d.setUTCDate(15);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 7);
};

const METHODS = [
  "nsvx.view",
  "nsvx.status",
  "nsvx.aviation.change",
  "nsvx.aviation.file",
  "nsvx.aviation.suggest",
];

// Synthetic payloads shaped like NSVX /api/aviation and /api/work answers (no real pilot data).
const totals = (minutes: number, flights: number) => ({
  total_min: minutes,
  pic_min: 0,
  copilot_min: minutes - 600,
  night_min: Math.round(minutes / 4),
  ifr_min: minutes - 300,
  mp_min: minutes,
  fstd_min: 600,
  ldg_day: Math.round(flights / 2),
  ldg_night: 3,
  to_day: Math.round(flights / 2),
  to_night: 2,
  flights,
  sessions: 4,
});
const roles = {
  copilot_min: 0,
  pic_min: 0,
  picus_min: 0,
  dual_min: 0,
  instructor_min: 0,
  spic_min: 0,
  relief_min: 0,
};
const flight = (
  id: string,
  offset: number,
  dep: string,
  arr: string,
  minutes: number,
  off: string,
) => ({
  id,
  kind: "flight",
  status: "recorded",
  revision: 1,
  log_date: day(offset),
  flight_no: `AIZ${100 + Number(id.slice(1))}`,
  dep_place: dep,
  arr_place: arr,
  off_block_at: `${day(offset)}T${off}:00Z`,
  on_block_at: new Date(Date.parse(`${day(offset)}T${off}:00Z`) + minutes * 60_000).toISOString(),
  aircraft_model: "A332",
  registration: "9H-HFA",
  pic_name: "Capt. Example",
  fstd_type: null,
  fstd_qualification: null,
  remarks: null,
  source: "confirmed",
  sheet_state: id === "e1" ? "pending_write" : "in_master",
  countersign: "not_required",
  countersign_note: null,
  se_min: 0,
  me_min: 0,
  mp_min: minutes,
  total_min: minutes,
  night_min: 120,
  ifr_min: minutes,
  fstd_min: 0,
  to_day: 1,
  to_night: 0,
  ldg_day: 1,
  ldg_night: 0,
  ...roles,
  copilot_min: minutes,
});
const entries = [
  flight("e1", -1, "LIS", "TLV", 330, "08:05"),
  flight("e2", -3, "TLV", "LIS", 345, "14:20"),
  flight("e3", -9, "LIS", "JFK", 470, "10:00"),
  {
    ...flight("e4", -40, "", "", 0, "09:00"),
    kind: "fstd",
    flight_no: null,
    dep_place: null,
    arr_place: null,
    off_block_at: null,
    on_block_at: null,
    fstd_type: "A330 FFS",
    fstd_min: 240,
    total_min: 0,
    copilot_min: 0,
    remarks: "OPC",
  },
];
const doc = (
  id: string,
  title: string,
  category: string,
  label: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  name: `${title}.pdf`,
  title,
  title_manual: false,
  mime: "application/pdf",
  kind: "pdf",
  folder: "/03 - Aviação/Licenças",
  path: `/03 - Aviação/Licenças/${title}.pdf`,
  modified: `${day(-20)}T10:00:00Z`,
  category,
  category_label: label,
  group: "Pessoal e licenças",
  category_manual: false,
  tags: [],
  favorite: false,
  pinned: false,
  issued_on: null,
  expires_on: null,
  expiry_state: "none",
  validity: "unknown",
  days_left: null,
  reminders: [90, 30, 7, 0],
  ...extra,
});
const docs = [
  doc("d-licence", "Licença ATPL", "licence", "Licença", {
    pinned: true,
    expires_on: day(400),
    expiry_state: "confirmed",
    validity: "valid",
    days_left: 400,
  }),
  doc("d-medical", "Certificado médico Classe 1", "medical", "Médico", {
    pinned: true,
    expires_on: day(25),
    expiry_state: "confirmed",
    validity: "expiring",
    days_left: 25,
  }),
  doc("d-lpc", "LPC/OPC A330", "type_rating", "Qualificação de tipo", {
    expires_on: day(70),
    expiry_state: "confirmed",
    validity: "soon",
    days_left: 70,
  }),
  doc("d-english", "Inglês ICAO nível 6", "language", "Língua", {
    validity: "no_expiry",
    expiry_state: "no_expiry",
  }),
  doc("d-ticket", "Bilhete LIS → PRG", "travel", "Viagens"),
];
const trend = Array.from({ length: 12 }, (_, i) => ({
  m: month(i - 11),
  flight: [2400, 3100, 2800, 4200, 3900, 4500, 4800, 3600, 3300, 4100, 2700, 1400][i] ?? 0,
  fstd: i === 4 ? 240 : 0,
  n: 8,
}));
const overview = {
  today: day(0),
  holder: { name: "Pilot Example", licence: "PT.FCL.0000" },
  stats: {
    totals: totals(212_400, 1180),
    month: totals(1400, 4),
    year: totals(38_000, 92),
    last_entry: null,
  },
  yesterday: {
    date: day(-1),
    state: "awaiting",
    recorded: [entries[0]],
    candidates: [
      { id: "k-1", state: "awaiting", activity: "flight", planned: {}, draft: {}, problems: [] },
    ],
    open_total: 1,
    last_ok: { finished_at: `${day(0)}T06:00:00Z` },
    actual_source: true,
    config: { time: "06:00", tz: "Europe/Lisbon", enabled: true },
  },
  recent: entries.slice(0, 3),
  trend,
  aircraft: [
    { model: "A332", minutes: 150_000, flights: 800, regs: ["9H-HFA"] },
    { model: "A339", minutes: 42_000, flights: 210, regs: ["CS-TUA"] },
    { model: "A321", minutes: 20_400, flights: 170, regs: [] },
  ],
  validity: [docs[1], docs[2], docs[0]],
  validity_unknown: 0,
  essential: [docs[0], docs[1]],
  added: [],
  alerts: [
    {
      id: 7,
      file_id: "d-medical",
      name: "Certificado médico Classe 1",
      expires_on: day(25),
      days_left: 25,
    },
  ],
  sheet: { pending_write: 1, write_blocker: "" },
  imported: true,
};
const candidate = {
  id: "k-1",
  log_date: day(-1),
  source: "cwp_flightlog",
  activity: "flight",
  state: "missing_info",
  planned: {
    title: "TLV → LIS",
    actual: true,
    start: `${day(-1)}T15:10`,
    end: `${day(-1)}T20:45`,
    registration: "9H-HFA",
  },
  draft: {
    flight_no: "AIZ991",
    dep_place: "TLV",
    arr_place: "LIS",
    off_block_at: `${day(-1)}T15:10:00Z`,
    on_block_at: `${day(-1)}T20:45:00Z`,
    aircraft_model: "A332",
    registration: "9H-HFA",
    pic_name: "Capt. Example",
    mp_min: 335,
    copilot_min: 335,
    ifr_min: 335,
  },
  problems: [],
};
const checkins = [
  {
    id: "c-1",
    pnr: "QX7RTZ",
    airline_code: "TP",
    status: "scheduled",
    scheduled_for: `${day(1)}T09:00:00Z`,
    mission_id: "m-1",
    flight_legs: [{ origin: "LIS", destination: "PRG", flight_no: "TP1290" }],
    seat_chosen: null,
    boarding_passes: [],
  },
  {
    id: "c-2",
    pnr: "B4KL2M",
    airline_code: "FR",
    status: "done",
    scheduled_for: null,
    mission_id: "m-2",
    flight_legs: [{ origin: "PRG", destination: "TLV", flight_no: "FR1934" }],
    seat_chosen: [{ action: "select", seat: "3A" }],
    boarding_passes: [{ leg_index: 0, drive_file_id: "d-ticket", name: "261023PRGTLV.pdf" }],
  },
];
const duty = (id: string, offset: number, from: string, to: string, flightNo: string) => ({
  id,
  kind: "duty",
  title: `${flightNo} ${from}-${to}`,
  status: "active",
  departure_at: `${day(offset)}T09:30:00Z`,
  arrival_at: `${day(offset)}T14:30:00Z`,
  starts_at: null,
  ends_at: null,
  report_at: `${day(offset)}T08:30:00Z`,
  observed_at: `${day(0)}T05:00:00Z`,
  meta: { flight: flightNo, from, to, aircraft: "A332", registration: "9H-HFA" },
  excerpt: null,
});
// A drawn licence card stands in for NSVX's JPEG page render.
const licencePage = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#f4f1ea"/><rect x="24" y="24" width="752" height="452" rx="24" fill="#fff" stroke="#1d3b6a" stroke-width="4"/><text x="60" y="110" font-family="sans-serif" font-size="40" fill="#1d3b6a">EASA · FLIGHT CREW LICENCE</text><text x="60" y="190" font-family="sans-serif" font-size="28" fill="#333">ATPL(A) · A330/350</text><text x="60" y="260" font-family="sans-serif" font-size="24" fill="#555">Valid until ${day(400)}</text></svg>`,
).toString("base64")}`;

async function capture(
  page: Page,
  surface: Locator,
  name: string,
  ready: Locator[],
  scrollTo?: Locator,
) {
  if (process.env.OPENCLAW_CAPTURE_UI_PROOF !== "1") {
    return;
  }
  for (const viewport of [desktop, phone]) {
    const frame = await takeControlUiScreenshotFrame(page, surface, ready, {
      animations: "disabled",
      viewport,
      ...(scrollTo ? { scrollTo } : {}),
    });
    await writeFile(
      path.join(suite.artifactDir, `nsvx-aviation-${name}-${viewport.width}.png`),
      frame.png,
    );
  }
  await page.setViewportSize(desktop);
}

async function mount(page: Page, query: string, overrides: Record<string, unknown> = {}) {
  const gateway = await installMockGateway(page, {
    nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
    operatorScopes: ["operator.admin"],
    featureMethods: [...defaultControlUiFeatureMethods, ...METHODS],
    methodResponses: {
      "plugins.list": { plugins: [], diagnostics: [], mutationAllowed: true },
      "nsvx.view": {
        cases: [
          { match: { view: "aviationOverview" }, response: overview },
          {
            match: { view: "aviationEntries" },
            response: {
              entries,
              filters: { models: ["A332", "A339"], devices: ["A330 FFS"], n: 4 },
              period_totals: null,
            },
          },
          {
            match: { view: "aviationEntry" },
            response: {
              ...entries[0],
              history: [
                { revision: 1, reason: "typo in registration", changed_at: `${day(-1)}T21:00:00Z` },
              ],
              candidate: null,
            },
          },
          { match: { view: "aviationSync" }, response: { open: [candidate] } },
          {
            match: { view: "aviationCandidates" },
            response: {
              candidates: [candidate],
              recent: [
                {
                  aircraft_model: "A332",
                  registration: "9H-HFA",
                  pic_name: "Capt. Example",
                  mp: true,
                  me: false,
                  se: false,
                },
              ],
            },
          },
          {
            match: { view: "aviationDocs" },
            response: {
              roots: ["/03 - Aviação"],
              docs,
              categories: [
                { id: "licence", label: "Licença", group: "Pessoal e licenças", count: 1 },
                { id: "medical", label: "Médico", group: "Pessoal e licenças", count: 1 },
                { id: "type_rating", label: "Qualificação de tipo", group: "Formação", count: 1 },
                { id: "language", label: "Língua", group: "Formação", count: 1 },
                { id: "travel", label: "Viagens", group: "Operações", count: 1 },
              ],
              pinned: [docs[0], docs[1]],
              recent: [],
              added: [],
              expiry: [docs[1], docs[2], docs[0]],
              hidden_identity: 0,
              show_identity: true,
              sync: {
                account_state: "ready",
                last_change_check: `${day(0)}T05:00:00Z`,
                read_only: true,
              },
            },
          },
          { match: { view: "aviationDoc" }, response: docs[0] },
          {
            match: { view: "aviationDocInfo" },
            response: { mime: "application/pdf", kind: "pdf", size: 120_000, pages: 2 },
          },
          { match: { view: "aviationDocPage" }, response: { src: licencePage } },
          {
            match: { view: "aviationCheckins" },
            response: { checkins, passenger_profile: { surname: "EXAMPLE", first_name: "PILOT" } },
          },
          {
            match: { view: "aviationAirlines" },
            response: {
              airlines: [
                { code: "TP", name: "TAP Air Portugal" },
                { code: "FR", name: "Ryanair" },
              ],
            },
          },
          {
            match: { view: "workConnections" },
            response: {
              connections: [
                {
                  service: "cwp",
                  label: "HiFly",
                  state: "fresh",
                  configured: true,
                  last_complete_at: `${day(0)}T05:00:00Z`,
                },
                {
                  service: "mail",
                  label: "HiFly",
                  state: "stale",
                  configured: true,
                  last_complete_at: `${day(-2)}T05:00:00Z`,
                },
              ],
            },
          },
          {
            match: { view: "workItems" },
            response: {
              items: [
                duty("w1", 1, "LIS", "TLV", "AIZ990"),
                duty("w2", 2, "TLV", "LIS", "AIZ991"),
                duty("w3", 5, "LIS", "JFK", "AIZ211"),
              ],
              coverage: null,
            },
          },
          {
            match: { view: "aviationSettings" },
            response: {
              sync: { time: "06:00", tz: "Europe/Lisbon", enabled: true },
              holder: { name: "Pilot Example", licence: "PT.FCL.0000" },
              roots: ["/03 - Aviação"],
              folders: [
                { path: "/03 - Aviação", selected: true },
                { path: "/01 - Documentação pessoal/Identificação", selected: false },
              ],
              show_identity: true,
              sheet: {
                file_id: "f",
                pending_write: 1,
                write_blocker: "",
                imported: { at: `${day(-30)}T10:00:00Z`, added: 94 },
              },
              drive: { account_state: "ready", last_change_check: null },
            },
          },
          {
            match: { view: "aviationRuns" },
            response: {
              runs: [
                {
                  id: 3,
                  target_date: day(-1),
                  trigger: "schedule",
                  state: "ok",
                  added: 1,
                  awaiting: 1,
                  duplicates: 0,
                  not_loggable: 0,
                  warnings: [],
                  error: null,
                  started_at: `${day(0)}T06:00:00Z`,
                  finished_at: `${day(0)}T06:01:00Z`,
                },
              ],
            },
          },
          {
            match: { view: "aviationFlightLog" },
            response: {
              matched: 93,
              rows: 94,
              missing: [
                {
                  kind: "flight",
                  start: `${day(-1)}T15:10`,
                  end: `${day(-1)}T20:45`,
                  dep: "TLV",
                  arr: "LIS",
                  registration: "9H-HFA",
                  aircraft: "A332",
                  minutes: 335,
                  function: "FO",
                },
              ],
              different: [],
              logbook_only: [],
              months: ["2026-10", "2026-11"],
              last_read: `${day(0)}T05:00:00Z`,
              job: null,
              reads: [],
            },
          },
          {
            match: { view: "aviationCompliance" },
            response: {
              items: [
                {
                  id: "columns",
                  ok: true,
                  text: "Todas as colunas da AMC1 FCL.050 são registadas.",
                },
                { id: "anac", ok: null, text: "Aceitação pela ANAC: não verificada." },
              ],
              entries: 94,
            },
          },
          { match: { view: "aviationCertifications" }, response: { certifications: [] } },
          {
            match: { view: "aviationInsights" },
            response: {
              last_90: totals(9000, 26),
              recency_90d: { landings: 13, takeoffs: 13 },
              routes: [
                { r: "LIS–TLV", n: 40, minutes: 13_200 },
                { r: "TLV–LIS", n: 39, minutes: 13_500 },
              ],
              yearly: [
                {
                  y: 2026,
                  flights: 92,
                  total: 38_000,
                  night: 9000,
                  ifr: 36_000,
                  pic: 0,
                  copilot: 37_400,
                  landings: 46,
                  fstd: 600,
                },
              ],
            },
          },
        ],
      },
      "nsvx.aviation.change": {
        cases: [
          { match: { action: "checkin" }, response: { ...checkins[0], id: "c-3", pnr: "ZZ9ABC" } },
          { match: { action: "add" }, response: entries[0] },
          { match: { action: "confirm" }, response: entries[0] },
          { match: { action: "syncDay" }, response: { state: "ok" } },
          { match: { action: "cancelCheckin" }, response: { ...checkins[0], status: "cancelled" } },
          { match: { action: "doc" }, response: docs[0] },
          { match: { action: "compare" }, response: { job_id: 9 } },
        ],
      },
      "nsvx.aviation.file": {
        fileName: "LOGBOOK_EASA.xlsx",
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        data: Buffer.from("xlsx").toString("base64"),
      },
      ...overrides,
    },
  });
  await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&${query}`);
  return gateway;
}

suite.define(() => {
  it("runs the NSVX pilot logbook natively: home, logbook, confirm, and add", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const gateway = await mount(page, "tab=aviation");
        const surface = page.locator(".nsvx");
        // Home: yesterday's flight, totals, trend, expiry, essentials.
        const total = surface.locator(".nsvx-av__kpi").first();
        await total.getByText("3540:00").waitFor();
        await surface.getByText("Certificado médico Classe 1").first().waitFor();
        await capture(page, surface, "home", [total]);
        await surface.getByRole("button", { name: "Check" }).click();
        expect((await gateway.waitForRequest("nsvx.aviation.change")).params).toEqual({
          action: "syncDay",
        });
        await surface.getByRole("button", { name: "OK: Certificado médico Classe 1" }).click();
        await gateway.waitForRequest("nsvx.aviation.change", { match: { action: "alertRead" } });
        // Confirm yesterday: the Flight Log draft fills the form; the pilot adds night and confirms.
        await surface.getByRole("button", { name: /Confirm 1/ }).click();
        expect(new URL(page.url()).searchParams.get("av")).toBe("logbook");
        const panel = surface.locator(".nsvx-av__panel").first();
        await panel.getByText("TLV → LIS").waitFor();
        await panel.getByRole("button", { name: "Confirm", exact: true }).click();
        await panel.getByText("Night (H:MM, 0:00 if none)").waitFor();
        await panel.getByLabel("Night", { exact: true }).fill("0:40");
        await capture(page, surface, "confirm", [panel]);
        await panel.getByRole("button", { name: "Confirm", exact: true }).click();
        const confirm = await gateway.waitForRequest("nsvx.aviation.change", {
          match: { action: "confirm" },
        });
        expect(confirm.params).toMatchObject({
          id: "k-1",
          fields: {
            dep_place: "TLV",
            arr_place: "LIS",
            total_min: 335,
            mp_min: 335,
            copilot_min: 335,
            night_min: 40,
            ifr_min: 335,
          },
        });
        await panel.getByRole("button", { name: "Close" }).click();
        // Logbook: months, one entry's detail and history, then a new simulator session.
        const row = surface.getByRole("button", { name: /LIS → TLV · AIZ101/ });
        await row.click();
        await surface.getByText("typo in registration").waitFor({ state: "attached" });
        await capture(page, surface, "logbook", [row]);
        await surface.getByRole("button", { name: "Add", exact: true }).click();
        const form = surface.getByRole("form", { name: "Add" });
        await form.getByRole("button", { name: "Sim", exact: true }).click();
        await form.getByLabel("Device").fill("A330 FFS");
        await form.getByLabel("Time (H:MM)").fill("4:00");
        await form.getByRole("button", { name: "Save" }).click();
        const add = await gateway.waitForRequest("nsvx.aviation.change", {
          match: { action: "add" },
        });
        expect(add.params).toMatchObject({
          fields: { kind: "fstd", fstd_type: "A330 FFS", fstd_min: 240 },
        });
        await surface.getByRole("button", { name: "Excel" }).click();
        expect((await gateway.waitForRequest("nsvx.aviation.file")).params).toEqual({
          kind: "xlsx",
        });
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("shows aviation documents, check-ins, the roster, and settings natively", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const gateway = await mount(page, "tab=aviation&av=docs");
        const surface = page.locator(".nsvx");
        const radio = (name: string) => surface.getByRole("radio", { name, exact: true });
        // Docs: library with expiry, then the licence opens with its rendered page.
        const card = surface.locator(".nsvx-av__doc").first();
        await card.waitFor();
        await capture(page, surface, "docs", [card]);
        await surface.getByRole("button", { name: "Licença ATPL" }).first().click();
        const img = surface.locator("img.nsvx-av__page");
        await img.waitFor();
        await gateway.waitForRequest("nsvx.view", { match: { view: "aviationDocPage" } });
        await capture(page, surface, "viewer", [img]);
        await surface
          .locator(".nsvx-av__viewer")
          .getByRole("button", { name: "Favorites" })
          .click();
        expect(
          (await gateway.waitForRequest("nsvx.aviation.change", { match: { action: "doc" } }))
            .params,
        ).toEqual({
          action: "doc",
          id: "d-licence",
          patch: { favorite: true },
        });
        // Check-in: schedule with airline autocomplete; open a boarding pass in Docs; stop asks twice.
        await radio("Check-in").click();
        await surface.getByText("QX7RTZ", { exact: false }).waitFor();
        await surface.getByLabel("Booking").fill("zz9abc");
        await surface.getByLabel("Airline").fill("TAP Air Portugal");
        await capture(page, surface, "checkin", [surface.locator(".nsvx-av__checkin").first()]);
        await surface.getByRole("button", { name: "Schedule" }).click();
        expect(
          (await gateway.waitForRequest("nsvx.aviation.change", { match: { action: "checkin" } }))
            .params,
        ).toEqual({
          action: "checkin",
          pnr: "ZZ9ABC",
          airline: "TAP Air Portugal",
        });
        const first = surface.locator(".nsvx-av__checkin").first();
        await first.getByRole("button", { name: "Stop" }).click();
        await first.getByRole("button", { name: "Stop" }).click();
        expect(
          (
            await gateway.waitForRequest("nsvx.aviation.change", {
              match: { action: "cancelCheckin" },
            })
          ).params,
        ).toEqual({
          action: "cancelCheckin",
          id: "c-1",
        });
        // Roster: the airline's planned duties and the read state.
        await radio("Roster").click();
        const nextDuty = surface.getByText("LIS → TLV · AIZ990");
        await nextDuty.waitFor();
        await capture(page, surface, "roster", [nextDuty]);
        // More: daily check, Flight Log comparison, file, compliance, and stats.
        await radio("More").click();
        const compare = surface.getByRole("button", { name: "Compare" });
        await compare.waitFor();
        await surface.getByText("93 / 94 match · 1 missing").waitFor();
        await capture(page, surface, "more", [compare]);
        await compare.click();
        await gateway.waitForRequest("nsvx.aviation.change", { match: { action: "compare" } });
        expect(new URL(page.url()).searchParams.get("av")).toBe("more");
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("asks for the NSVX sign-in in Portuguese when the Gateway has none", async () => {
    await suite.withPage(
      { viewport: phone, locale: "pt-PT", serviceWorkers: "block" },
      async ({ page }) => {
        await mount(page, "tab=aviation", {
          "nsvx.view": {
            __mockError: {
              code: "unconfigured",
              message: "NSVX owner sign-in is not set up on this Gateway.",
            },
          },
        });
        const surface = page.locator(".nsvx");
        await surface.getByRole("radio", { name: "Caderneta", exact: true }).waitFor();
        await surface.getByRole("tab", { name: "Aviação" }).waitFor();
        const card = surface.locator(".nsvx-connect");
        await card.waitFor();
        if (process.env.OPENCLAW_CAPTURE_UI_PROOF === "1") {
          const frame = await takeControlUiScreenshotFrame(page, surface, [card], {
            animations: "disabled",
            viewport: phone,
          });
          await writeFile(path.join(suite.artifactDir, "nsvx-aviation-sign-in-390.png"), frame.png);
        }
      },
    );
  });
});
