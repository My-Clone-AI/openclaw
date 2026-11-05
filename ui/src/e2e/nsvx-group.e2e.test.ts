import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "playwright";
import { expect, it } from "vitest";
import { takeControlUiScreenshotFrame } from "../test-helpers/control-ui-e2e-screenshot.ts";
import { installMockGateway } from "../test-helpers/control-ui-e2e.ts";
import { createControlUiE2eSuite } from "./control-ui-e2e-suite.test-support.ts";

const pluginRoot = fileURLToPath(new URL("../../../extensions/nsvx/", import.meta.url));
const suite = createControlUiE2eSuite({ name: "NSVX group companies" });
const desktop = { width: 1280, height: 1000 };
const phone = { width: 390, height: 844 };
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
// Lisbon calendar days, as NSVX counts metric days.
const day = (offset: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() - offset * 86_400_000));

// Synthetic payloads shaped like NSVX /api/group-companies/* answers.
const errorsTop = [
  {
    group: "g1",
    level: "fatal",
    count: 7,
    lastSeen: ago(5),
    route: "/api/book",
    message: "TypeError: booking is null",
  },
  {
    group: "g2",
    level: "error",
    count: 3,
    lastSeen: ago(40),
    route: "/login",
    message: "Login timeout",
  },
];
const appRow = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  domain: `${id}.fun`,
  adult: false,
  repo: `org/${id}`,
  developmentUrl: `https://dev.${id}.fun`,
  productionUrl: `https://${id}.fun`,
  status: "ok",
  dev: { status: "ok", revision: "a1b2c3d4e5f6", url: "" },
  prod: { status: "ok", revision: "0f9e8d7c6b5a", url: "" },
  adapter: { status: "ok", version: "v2" },
  metrics: {
    status: "ok",
    days: [12, 18, 15, 22, 30, 26, 34].map((visitors, i) => ({
      date: day(6 - i),
      visitors,
      newUsers: 2,
      totalUsers: 400 + i,
    })),
    visitors: 157,
  },
  github: {
    status: "ok",
    develop: { state: "success" },
    prs: { count: 2, top: [{ ci: "success" }] },
    aheadBy: 0,
  },
  grow: { enabled: true, mode: "on" },
  errors: { status: "ok", count: 0, groups: 0, top: [], truncated: false },
  ...extra,
});
const overview = {
  generatedAt: ago(1),
  github: "ok",
  apps: [
    appRow("openhome", "openhome", {
      status: "degraded",
      github: {
        status: "ok",
        develop: { state: "failure" },
        prs: { count: 3, top: [{ ci: "failure" }] },
        aheadBy: 4,
      },
      errors: { status: "ok", count: 10, groups: 2, top: errorsTop, truncated: false },
    }),
    appRow("openfly", "openfly"),
    appRow("opendrive", "opendrive", { adapter: { status: "none" } }),
    appRow("openlove", "openlove", { adult: true }),
  ],
};
const devActions = {
  environment: "development",
  actions: {
    openhome: {
      ci: { available: true, reason: null },
      redeploy: { available: true, reason: null },
      restart: { available: false, reason: "no_dev_unit" },
      grow_pause: { available: true, reason: null },
    },
    openfly: {
      ci: { available: false, reason: "no_token" },
      redeploy: { available: true, reason: null },
    },
    openlove: { adult: true, ci: { available: true, reason: null } },
  },
};
const company = {
  id: "openhome",
  name: "openhome",
  domain: "openhome.fun",
  configured: true,
  environment: "production",
  status: "degraded",
  release: { revision: "0f9e8d7c6b5a" },
  metrics: [
    { key: "users_total", label: "Users", value: 4210 },
    { key: "listings", label: "Listings", value: 318 },
    { key: "bookings_7d", label: "Bookings 7d", value: 42 },
  ],
  attention: [{ key: "reports", label: "Reports to review", count: 2 }],
  public: { status: "ok", checks: [{ url: "https://openhome.fun/", status: "ok" }] },
  health: {
    status: "degraded",
    checks: [
      { key: "database", status: "ok" },
      { key: "email", status: "degraded", detail: "queue 12" },
    ],
  },
};
const manifest = {
  resources: [{ kind: "listing", label: "Listings" }],
  operations: [
    {
      id: "listing.hide",
      label: "Hide listing",
      risk: "write",
      targetKind: "listing",
      resourceKind: "listing",
      preview: true,
      inputs: [{ key: "note", label: "Note", type: "text" }],
    },
    {
      id: "cache.clear",
      label: "Clear cache",
      risk: "write",
      preview: false,
      inputs: [],
      disabledReason: "Off in production",
    },
  ],
};
const resources = {
  items: [
    { id: "L-17", title: "Sunny flat, Lisboa", subtitle: "Owner: Example Owner", status: "active" },
    {
      id: "L-18",
      title: "River view, Porto",
      subtitle: "Owner: Example Owner 2",
      status: "reported",
    },
  ],
  nextCursor: null,
};
const resource = {
  item: resources.items[1],
  fields: { id: "L-18", status: "reported", reports: 2 },
  timeline: [{ at: ago(60), label: "Reported" }],
  operations: ["listing.hide"],
};
const errorsFeed = {
  generatedAt: ago(1),
  hours: 24,
  apps: [
    { id: "openhome", name: "openhome", adult: false, status: "ok", groups: 2, count: 10 },
    { id: "openfly", name: "openfly", adult: false, status: "ok", groups: 1, count: 1 },
    { id: "openlove", name: "openlove", adult: true, status: "ok", groups: 1, count: 4 },
  ],
  items: [
    ...errorsTop.map((row) => Object.assign({ app: "openhome" }, row)),
    {
      group: "g3",
      level: "warning",
      count: 1,
      lastSeen: ago(90),
      route: null,
      message: "Slow search",
      app: "openfly",
    },
    {
      group: "g4",
      level: "error",
      count: 4,
      lastSeen: ago(9),
      route: null,
      message: "Adult row",
      app: "openlove",
    },
  ],
};
const series = (base: number) =>
  Array.from({ length: 30 }, (_, i) => ({
    date: day(29 - i),
    visitors: base + Math.round(20 * Math.sin(i / 3)) + i,
    newUsers: 3,
    totalUsers: 500 + i,
    final: i < 29,
  }));
const metrics = {
  from: day(29),
  to: day(0),
  apps: {
    openhome: { status: "ok", days: series(60) },
    openfly: { status: "ok", days: series(30) },
    opendrive: { status: "no_adapter", days: [] },
  },
  total: { days: [] },
};
const servers = {
  servers: [
    {
      id: "master",
      label: "ns3041105",
      host: "203.0.113.1",
      apps: ["clone"],
      configured: true,
      status: "ok",
      metrics: {
        cpu: 42,
        memory: { used: 70 * 2 ** 30, total: 128 * 2 ** 30 },
        disks: [{ mount: "/", used: 1, total: 2, percent: 81 }],
        uptime: 12 * 86_400,
        load: [3.2, 2.9, 2.5],
        processes: {
          cpu: [{ pid: 4242, name: "node", user: "clone", cpu: 33, mem: 4, etime: 100 }],
          mem: [],
        },
      },
    },
    {
      id: "openhome",
      label: "ns574691",
      host: "203.0.113.2",
      apps: ["openhome", "openlove"],
      configured: true,
      status: "ok",
      metrics: {
        cpu: 96,
        memory: { used: 10 * 2 ** 30, total: 32 * 2 ** 30 },
        disks: [{ mount: "/", used: 1, total: 2, percent: 40 }],
        uptime: 3 * 86_400,
        load: [7.1, 6.4, 5],
      },
    },
    {
      id: "runners-1",
      label: "runners-1",
      host: "203.0.113.3",
      apps: [],
      configured: false,
      probeOnly: true,
      status: "down",
      error: "No answer",
    },
  ],
};
const mailbox = {
  app: "openhome",
  box: "hi",
  address: "hi@openhome.fun",
  unread: 2,
  actions: ["markRead", "markUnread", "archive", "flag", "unflag"],
  sendEnabled: true,
  status: "ok",
};
const message = {
  id: "m1",
  threadId: "t1",
  app: "openhome",
  box: "hi",
  subject: "Booking question",
  from: [{ email: "guest@example.com" }],
  to: [{ email: "hi@openhome.fun" }],
  cc: [],
  date: ago(30),
  unread: true,
  hasAttachment: true,
};
const thread = {
  messages: [
    {
      ...message,
      html: "<p>Hello,</p><p>Is the <b>Lisboa</b> flat free next week?</p>",
      attachments: [{ blobId: "b1", name: "dates.pdf", size: 24_000 }],
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
      path.join(suite.artifactDir, `nsvx-group-${name}-${viewport.width}.png`),
      frame.png,
    );
  }
  await page.setViewportSize(desktop);
}

suite.define(() => {
  it("shows group apps, an app's records and operations, errors, visits, servers, and mail natively", async () => {
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
                { match: { view: "groupOverview" }, response: overview },
                { match: { view: "groupDevActions" }, response: devActions },
                {
                  match: { view: "groupIncidents" },
                  response: { items: { "openhome:errors": { action: "Watching errors" } } },
                },
                { match: { view: "groupCompany" }, response: company },
                { match: { view: "groupManifest" }, response: manifest },
                { match: { view: "groupResources" }, response: resources },
                { match: { view: "groupResource" }, response: resource },
                { match: { view: "groupErrors" }, response: errorsFeed },
                { match: { view: "groupMetrics" }, response: metrics },
                { match: { view: "groupServers" }, response: servers },
                {
                  match: { view: "groupServerServices" },
                  response: {
                    services: [
                      {
                        unit: "clone-web.service",
                        ActiveState: "active",
                        SubState: "running",
                        MemoryCurrent: "524288000",
                      },
                    ],
                  },
                },
                {
                  match: { view: "groupServerLogs" },
                  response: { lines: ["Started clone-web.service", "Listening on :8080"] },
                },
                {
                  match: { view: "groupMail" },
                  response: { configured: true, mailboxes: [mailbox] },
                },
                {
                  match: { view: "groupMailThreads" },
                  response: { items: [message], nextCursor: null, errors: [] },
                },
                { match: { view: "groupMailThread" }, response: thread },
              ],
            },
            "nsvx.group.devAction": { status: "dispatched" },
            "nsvx.group.preview": {
              available: true,
              previewToken: "pt-1",
              preconditions: [{ id: "owner", label: "Owner notified", satisfied: true }],
              effects: ["Listing L-18 is hidden from search"],
            },
            "nsvx.group.operation": {
              ok: true,
              status: "done",
              auditId: "audit-9",
              message: "Hidden",
            },
            "nsvx.group.mailDraft": { draftId: "d1" },
            "nsvx.group.mailSend": { status: "sent" },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=group`);
        const surface = page.locator(".nsvx");
        const radio = (name: string) => surface.getByRole("radio", { name, exact: true });

        // Apps: worst first, adult apps never shown, health, versions, CI, errors, and visitors on each card.
        const home = surface.locator('[data-app="openhome"]');
        await home.getByText("TypeError: booking is null").waitFor();
        expect(await surface.locator('[data-app="openlove"]').count()).toBe(0);
        expect(await surface.locator(".nsvx-grp__card").first().getAttribute("data-app")).toBe(
          "openhome",
        );
        await home.getByText("+4").waitFor();
        await surface.getByText("No admin").waitFor();
        await capture(page, surface, "apps", [home]);

        // A dev action asks first, then sends one request with its key.
        await home.getByRole("button", { name: /Run CI · openhome/ }).click();
        await home.getByRole("button", { name: "Confirm", exact: true }).click();
        const ci = (await gateway.waitForRequest("nsvx.group.devAction")).params as Record<
          string,
          unknown
        >;
        expect(ci).toMatchObject({ cid: "openhome", action: "ci" });
        expect(String(ci.idempotencyKey)).toMatch(/^oc-/);
        await home.getByText("Done", { exact: true }).waitFor();
        expect(
          await surface
            .locator('[data-app="openfly"]')
            .getByRole("button", { name: /Run CI.*No GitHub access/ })
            .isDisabled(),
        ).toBe(true);

        // Company: KPIs, checks, records with their detail, then a checked and confirmed operation.
        await home.getByRole("button", { name: /openhome openhome\.fun/ }).click();
        await surface.getByText("Reports to review").waitFor();
        await surface.getByText("4,210").waitFor();
        expect(new URL(page.url()).searchParams.get("app")).toBe("openhome");
        await capture(page, surface, "company", [surface.getByText("Reports to review")]);
        await radio("Listings").click();
        await surface.getByRole("button", { name: /River view, Porto/ }).click();
        await surface.getByRole("button", { name: "Hide listing", exact: true }).click();
        const form = surface.getByRole("region", { name: "Hide listing" });
        await form.getByRole("button", { name: "Check", exact: true }).click();
        await form.getByText("Listing L-18 is hidden from search").waitFor();
        const run = form.getByRole("button", { name: "Run", exact: true });
        expect(await run.isDisabled()).toBe(true);
        await form.getByRole("checkbox", { name: /Confirm/ }).check();
        await run.click();
        await form.getByText("Hidden", { exact: true }).waitFor();
        expect((await gateway.waitForRequest("nsvx.group.operation")).params).toMatchObject({
          cid: "openhome",
          op: "listing.hide",
          targetId: "L-18",
          previewToken: "pt-1",
        });
        await capture(page, surface, "operation", [form.getByText("Hidden", { exact: true })]);
        await surface.getByRole("button", { name: "Back", exact: true }).click();

        // Errors: grouped by app and level, adult apps left out.
        await radio("Errors").click();
        await surface.getByText("Login timeout").waitFor();
        expect(await surface.getByText("Adult row").count()).toBe(0);
        await capture(page, surface, "errors", [surface.getByText("Login timeout")]);
        await surface.getByRole("button", { name: /^Warning/ }).click();
        await surface.getByText("Slow search").waitFor();
        expect(await surface.getByText("Login timeout").count()).toBe(0);

        // Visits: one line per app, the range in the request.
        await radio("Visits").click();
        await surface.locator('[data-metric-app="openhome"]').waitFor();
        expect(
          (
            (await gateway.waitForRequest("nsvx.view", { match: { view: "groupMetrics" } }))
              .params as { params: Record<string, string> }
          ).params,
        ).toEqual({ from: day(29), to: day(0) });
        await capture(page, surface, "metrics", [surface.locator('[data-metric-app="openhome"]')]);

        // Servers: load at a glance, then services and a service log.
        await radio("Servers").click();
        const master = surface.locator('[data-server="master"]');
        await master.getByText("42%").waitFor();
        await surface.getByText("No answer").waitFor();
        await master.getByRole("button", { name: /ns3041105/ }).click();
        await master.getByText("clone-web.service").waitFor();
        await master.getByRole("button", { name: "Log", exact: true }).click();
        await master.getByText(/Listening on :8080/).waitFor();
        await capture(page, surface, "servers", [master.getByText(/Listening on :8080/)]);

        // Mail: the app mailbox, a message read natively, and a reply sent only after confirming.
        await radio("Mail").click();
        await surface.getByRole("button", { name: /Booking question/ }).click();
        await surface.getByText(/Lisboa flat free next week/).waitFor();
        await surface.getByText(/dates\.pdf/).waitFor();
        await capture(page, surface, "mail", [surface.getByText(/Lisboa flat free next week/)]);
        await surface.getByRole("button", { name: "Read", exact: true }).click();
        expect((await gateway.waitForRequest("nsvx.group.mailAction")).params).toEqual({
          cid: "openhome",
          box: "hi",
          messageIds: ["m1"],
          action: "markRead",
        });
        await surface.getByRole("button", { name: "Reply", exact: true }).click();
        const composer = surface.getByRole("region", { name: "Reply" });
        await composer.getByRole("textbox", { name: "Message" }).fill("Yes, it is free.");
        await composer.getByRole("button", { name: "Send", exact: true }).click();
        expect((await gateway.waitForRequest("nsvx.group.mailDraft")).params).toMatchObject({
          cid: "openhome",
          box: "hi",
          mode: "reply",
          inReplyTo: "m1",
          to: ["guest@example.com"],
          text: "Yes, it is free.",
        });
        expect(await gateway.getRequests("nsvx.group.mailSend")).toHaveLength(0);
        await composer.getByRole("button", { name: "Send now", exact: true }).click();
        await composer.getByText("Sent", { exact: true }).waitFor();
        expect((await gateway.waitForRequest("nsvx.group.mailSend")).params).toMatchObject({
          cid: "openhome",
          box: "hi",
          draftId: "d1",
        });
        await capture(page, surface, "compose", [composer.getByText("Sent", { exact: true })]);
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("shows the group tab in Portuguese and asks for the NSVX sign-in when the Gateway has none", async () => {
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
                message: "NSVX sign-in is not set up on this Gateway.",
              },
            },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=group&grp=servers`);
        const surface = page.locator(".nsvx");
        await surface.getByRole("radio", { name: "Servidores", exact: true }).waitFor();
        await surface.getByRole("tab", { name: "Grupo" }).waitFor();
        const card = surface.locator(".nsvx-connect");
        await card.waitFor();
        if (process.env.OPENCLAW_CAPTURE_UI_PROOF === "1") {
          const frame = await takeControlUiScreenshotFrame(page, surface, [card], {
            animations: "disabled",
            viewport: phone,
          });
          await writeFile(path.join(suite.artifactDir, "nsvx-group-sign-in-390.png"), frame.png);
        }
      },
    );
  });
});
