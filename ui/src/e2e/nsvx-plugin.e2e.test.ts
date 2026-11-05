import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { takeControlUiScreenshotFrame } from "../test-helpers/control-ui-e2e-screenshot.ts";
import {
  defaultControlUiFeatureMethods,
  installMockGateway,
} from "../test-helpers/control-ui-e2e.ts";
import { createControlUiE2eSuite } from "./control-ui-e2e-suite.test-support.ts";

const pluginRoot = fileURLToPath(new URL("../../../extensions/nsvx/", import.meta.url));
const suite = createControlUiE2eSuite({ name: "NSVX native plugin" });
const desktop = { width: 1280, height: 1000 };
const now = new Date().toISOString();

// Synthetic NSVX owner-screen payloads, shaped like /api/today, /api/missions, and /api/tarefas-ao-vivo.
const today = {
  paused: false,
  decisions: [
    {
      id: "d1",
      mission_id: "m1",
      mission_title: "Pay the garage",
      payee: "Example Garage",
      amount_minor: 18000,
      currency: "EUR",
      created_at: now,
    },
  ],
  approvals: [],
  owner_requests: [
    { id: "r1", question: "Which day works?", message_from: "Ana", created_at: now },
  ],
  needs_owner: [],
  handling: [{ id: "m2", title: "Book the flight", status: "working", updated_at: now }],
  done: [{ id: "m3", title: "Renew the card", status: "completed", updated_at: now }],
  delivery_alerts: [],
  subscription_limited_jobs: 0,
};
const missions = [
  {
    id: "m1",
    title: "Pay the garage",
    status: "needs_owner",
    pending_decisions: 1,
    updated_at: now,
  },
  {
    id: "m2",
    title: "Book the flight",
    status: "working",
    next_step: "Compare fares",
    progress: { stalled_steps: 1 },
    updated_at: now,
  },
  { id: "m3", title: "Renew the card", status: "completed", updated_at: now },
];

suite.define(() => {
  it("shows NSVX Today, tasks, and work natively and opens a task from Today", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const gateway = await installMockGateway(page, {
          nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
          operatorScopes: ["operator.admin"],
          featureMethods: [
            ...defaultControlUiFeatureMethods,
            "nsvx.view",
            "nsvx.status",
            "node.list",
          ],
          methodResponses: {
            "plugins.list": { plugins: [], diagnostics: [], mutationAllowed: true },
            "node.list": { nodes: [] },
            "nsvx.view": {
              cases: [
                { match: { view: "today" }, response: today },
                { match: { view: "missions" }, response: missions },
                {
                  match: { view: "missionEvents" },
                  response: {
                    items: [{ kind: "step", summary: "Asked the garage for the invoice", at: now }],
                    next: null,
                  },
                },
                {
                  match: { view: "workSummary" },
                  response: {
                    totals: { running: 2, inbox: 5, landing: 1, failed: 1, done: 40 },
                    hosts: { master: { totals: { running: 2, failed: 1 } } },
                    stale: false,
                  },
                },
                {
                  match: { view: "workTasks" },
                  response: {
                    items: [
                      {
                        id: "w1",
                        app: "openclaw",
                        state: "running",
                        title: "Today tab",
                        modelLabel: "Opus",
                        displayHost: "master",
                        startedAt: now,
                      },
                    ],
                    nextCursor: null,
                  },
                },
              ],
            },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx`);
        const surface = page.locator(".nsvx");
        // Tiles are named "label: count"; page tabs by label alone.
        const tab = (name: string) =>
          surface.getByRole("tab", { name: new RegExp(`^${name}(:|$)`) });

        // Today: tiles count each group; the first non-empty group opens.
        await surface.getByText("Pay the garage", { exact: true }).waitFor();
        expect(await tab("Today").getAttribute("aria-selected")).toBe("true");
        await surface.getByText(/Example Garage/).waitFor();
        await tab("For you").click();
        await surface.getByText("Which day works?", { exact: true }).waitFor();

        if (process.env.OPENCLAW_CAPTURE_UI_PROOF === "1") {
          await tab("Decide").click();
          for (const viewport of [desktop, { width: 390, height: 844 }]) {
            const frame = await takeControlUiScreenshotFrame(page, surface, [tab("Decide")], {
              animations: "disabled",
              viewport,
            });
            await writeFile(
              path.join(suite.artifactDir, `nsvx-today-${viewport.width}.png`),
              frame.png,
            );
          }
          await page.setViewportSize(desktop);
        }

        // A Today row opens its task, with its history, and the address keeps it.
        await tab("Decide").click();
        await surface.getByRole("button", { name: /Pay the garage/ }).click();
        await surface.getByText("Asked the garage for the invoice", { exact: true }).waitFor();
        expect(new URL(page.url()).searchParams.get("mission")).toBe("m1");
        expect(new URL(page.url()).searchParams.get("tab")).toBe("tasks");
        expect(
          (await gateway.waitForRequest("nsvx.view", { match: { view: "missionEvents" } })).params,
        ).toEqual({ view: "missionEvents", params: { id: "m1" } });

        // Tasks: filters count from the same list; a stuck task is marked.
        await tab("Active").click();
        await surface.getByText("Book the flight", { exact: true }).waitFor();
        await surface.getByText("Stuck", { exact: true }).waitFor();
        expect(await surface.getByText("Renew the card", { exact: true }).count()).toBe(0);

        if (process.env.OPENCLAW_CAPTURE_UI_PROOF === "1") {
          for (const viewport of [desktop, { width: 390, height: 844 }]) {
            const frame = await takeControlUiScreenshotFrame(page, surface, [tab("Active")], {
              animations: "disabled",
              viewport,
            });
            await writeFile(
              path.join(suite.artifactDir, `nsvx-tasks-${viewport.width}.png`),
              frame.png,
            );
          }
          await page.setViewportSize(desktop);
        }

        // Work: totals, servers, and the running list; a state tile reloads that state.
        await tab("Work").click();
        await surface.getByText("Today tab", { exact: true }).waitFor();
        await surface.getByText("master", { exact: true }).waitFor();
        await tab("Failed").click();
        await gateway.waitForRequest("nsvx.view", {
          match: { view: "workTasks", params: { state: "failed" } },
        });

        if (process.env.OPENCLAW_CAPTURE_UI_PROOF === "1") {
          await tab("Running").click();
          await surface.getByText("Today tab", { exact: true }).waitFor();
          for (const viewport of [desktop, { width: 390, height: 844 }]) {
            const frame = await takeControlUiScreenshotFrame(page, surface, [tab("Running")], {
              animations: "disabled",
              viewport,
            });
            await writeFile(
              path.join(suite.artifactDir, `nsvx-work-${viewport.width}.png`),
              frame.png,
            );
          }
        }
        // Team: the org chart reads this Gateway's own agents, no NSVX sign-in needed.
        await tab("Team").click();
        await surface.locator(".nsvx-agent").first().waitFor();
        await gateway.waitForRequest("agents.list");
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("shows the NSVX agenda natively and makes an event through NSVX's preview and confirm", async () => {
    // Synthetic /api/workspace payloads; times are set inside the current Lisbon week.
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
    const at = (time: string) => new Date(`${day}T${time}:00Z`).toISOString();
    const base = {
      calendar_id: "primary",
      etag: '"1"',
      status: "confirmed",
      description: null,
      start_date: null,
      end_date: null,
      all_day: false,
      time_zone: "Europe/Lisbon",
      organizer: "owner@example.com",
      recurring: false,
      can_edit: true,
    };
    const review = {
      ...base,
      id: "ev1",
      event_id: "g-ev1",
      summary: "Design review",
      location: "Studio 2",
      start: at("09:00"),
      end: at("10:00"),
      attendees: [
        {
          email: "owner@example.com",
          response: "accepted",
          organizer: true,
          self: true,
          optional: false,
          name: null,
        },
        {
          email: "ana@example.com",
          response: "accepted",
          organizer: false,
          self: false,
          optional: false,
          name: "Ana",
        },
        {
          email: "rui@example.com",
          response: "tentative",
          organizer: false,
          self: false,
          optional: false,
          name: "Rui",
        },
      ],
      self_response: "accepted",
      meet_url: "https://meet.google.com/abc-defg-hij",
    };
    const lunch = {
      ...base,
      id: "ev2",
      event_id: "g-ev2",
      calendar_id: "family",
      summary: "Lunch with Rui",
      location: null,
      start: at("12:30"),
      end: at("13:30"),
      attendees: [],
      self_response: null,
      meet_url: null,
    };
    await suite.withPage(
      { viewport: desktop, locale: "en-US", timezoneId: "Europe/Lisbon", serviceWorkers: "block" },
      async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const gateway = await installMockGateway(page, {
          nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
          operatorScopes: ["operator.admin"],
          featureMethods: [
            ...defaultControlUiFeatureMethods,
            "nsvx.view",
            "nsvx.agenda.preview",
            "nsvx.agenda.act",
            "nsvx.agenda.slots",
            "nsvx.agenda.summary",
            "nsvx.agenda.select",
          ],
          methodResponses: {
            "plugins.list": { plugins: [], diagnostics: [], mutationAllowed: true },
            "nsvx.view": {
              cases: [
                {
                  match: { view: "agendaEvents" },
                  response: { events: [review, lunch], fresh_at: now, errors: [] },
                },
                {
                  match: { view: "agendaCalendars" },
                  response: [
                    {
                      id: "c1",
                      calendar_id: "primary",
                      summary: "Work",
                      account: "owner@example.com",
                      primary: true,
                      selected: true,
                      color: "#1a73e8",
                      sync_state: "current",
                      last_error: null,
                    },
                    {
                      id: "c2",
                      calendar_id: "family",
                      summary: "Family",
                      account: "owner@example.com",
                      primary: false,
                      selected: true,
                      color: "#0b8043",
                      sync_state: "current",
                      last_error: null,
                    },
                  ],
                },
                {
                  match: { view: "agendaEvent" },
                  response: {
                    event: review,
                    meeting: { status: "scheduled", participants: [] },
                    intents: [],
                  },
                },
                {
                  match: { view: "agendaIntent" },
                  response: {
                    id: "i1",
                    operation: "calendar.create_event",
                    state: "accepted",
                    lifecycle_label: "Done",
                    error: null,
                  },
                },
              ],
            },
            "nsvx.agenda.summary": { text: "Two meetings today; lunch at 12:30.", events: [] },
            "nsvx.agenda.preview": {
              operation: "calendar.create_event",
              effect: "external",
              summary: "Planning, tomorrow 10:00–11:00, invites ana@example.com",
              account: "owner@example.com",
              terms_hash: "terms-1",
              needs_confirmation: true,
            },
            "nsvx.agenda.act": {
              id: "i1",
              operation: "calendar.create_event",
              state: "in_flight",
              lifecycle_label: "Sending",
              error: null,
            },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=agenda`);
        const surface = page.locator(".nsvx");
        await surface.getByRole("button", { name: /Design review/ }).waitFor();
        await surface.getByRole("button", { name: /Lunch with Rui/ }).waitFor();
        await surface.getByRole("button", { name: "Summary" }).click();
        await surface.getByText("Two meetings today; lunch at 12:30.", { exact: true }).waitFor();

        const shoot = async (
          name: string,
          ready: Parameters<typeof takeControlUiScreenshotFrame>[2],
        ) => {
          if (process.env.OPENCLAW_CAPTURE_UI_PROOF !== "1") {
            return;
          }
          for (const viewport of [desktop, { width: 390, height: 844 }]) {
            const frame = await takeControlUiScreenshotFrame(page, surface, ready, {
              animations: "disabled",
              viewport,
            });
            await writeFile(
              path.join(suite.artifactDir, `nsvx-agenda-${name}-${viewport.width}.png`),
              frame.png,
            );
          }
          await page.setViewportSize(desktop);
        };
        await shoot("week", [surface.getByRole("button", { name: /Design review/ })]);

        // An event opens natively, with its guests and replies, and the address keeps it.
        await surface.getByRole("button", { name: /Design review/ }).click();
        await surface.getByText("Studio 2", { exact: true }).waitFor();
        await surface.getByText("Ana", { exact: true }).waitFor();
        expect(new URL(page.url()).searchParams.get("event")).toBe("ev1");
        await shoot("event", [surface.getByText("Studio 2", { exact: true })]);
        await surface.getByRole("button", { name: "Back" }).first().click();

        // New event: NSVX previews the exact terms, and only the confirm runs it, with that hash and one key.
        await surface.getByRole("button", { name: /New/ }).click();
        await surface.getByLabel("Title").fill("Planning");
        await surface.getByLabel(/Guests/).fill("ana@example.com");
        await surface.getByRole("button", { name: "Review" }).click();
        await surface.getByText(/Planning, tomorrow/).waitFor();
        expect(await gateway.getRequests("nsvx.agenda.act")).toHaveLength(0);
        const preview = (await gateway.waitForRequest("nsvx.agenda.preview")).params as {
          operation: string;
          payload: Record<string, unknown>;
        };
        expect(preview.operation).toBe("calendar.create_event");
        expect(preview.payload).toMatchObject({
          summary: "Planning",
          attendees: ["ana@example.com"],
          send_updates: "all",
        });
        await shoot("review", [surface.getByText(/Planning, tomorrow/)]);
        await surface.getByRole("button", { name: "Confirm" }).click();
        const act = (await gateway.waitForRequest("nsvx.agenda.act")).params as Record<
          string,
          unknown
        >;
        expect(act).toMatchObject({ operation: "calendar.create_event", termsHash: "terms-1" });
        expect(String(act.clientKey)).toMatch(/^oc-/);
        await gateway.waitForRequest("nsvx.view", { match: { view: "agendaIntent" } });
        // Accepted: back on the agenda.
        await surface.getByRole("button", { name: /Lunch with Rui/ }).waitFor();

        // Day view and a hidden calendar go through NSVX.
        await surface.getByRole("button", { name: "Day", exact: true }).click();
        await surface.getByRole("button", { name: /Family/ }).click();
        expect((await gateway.waitForRequest("nsvx.agenda.select")).params).toEqual({
          calendarId: "c2",
          selected: false,
        });
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("asks for the NSVX sign-in instead of showing an error when the Gateway has none", async () => {
    await suite.withPage(
      { viewport: { width: 390, height: 844 }, locale: "pt-PT", serviceWorkers: "block" },
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
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx`);
        const surface = page.locator(".nsvx");
        await surface.getByText("Adicione a sessão NSVX neste Gateway.", { exact: true }).waitFor();
        expect(await surface.getByRole("button", { name: "Repetir" }).count()).toBe(1);
        if (process.env.OPENCLAW_CAPTURE_UI_PROOF === "1") {
          const frame = await takeControlUiScreenshotFrame(page, surface, [], {
            animations: "disabled",
            viewport: { width: 390, height: 844 },
          });
          await writeFile(path.join(suite.artifactDir, "nsvx-sign-in-390.png"), frame.png);
        }
      },
    );
  });
});
