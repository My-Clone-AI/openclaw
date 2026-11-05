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

const entries = {
  main: { identity: { name: "Boss", emoji: "B" }, subagents: { allowAgents: ["coder"] } },
  coder: { identity: { name: "Coder" }, subagents: { allowAgents: ["tester"] } },
  tester: { identity: { name: "Tester" } },
};

const teamResponses = (paused: string[]) => ({
  "config.get": { hash: "rev-1", parsed: { agents: { entries } } },
  "agents.list": {
    defaultId: "main",
    agents: [{ id: "main" }, { id: "coder" }, { id: "tester" }],
  },
  "node.list": { nodes: [{ nodeId: "mac", displayName: "Mac" }] },
  "sessions.list": {
    sessions: [
      { key: "agent:coder:main", agentId: "coder", hasActiveRun: true },
      { key: "agent:tester:main", agentId: "tester" },
    ],
  },
  "nsvx.team.paused": { paused: paused.map((id) => ({ id, supervisors: ["coder"] })) },
});

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
            "nsvx.team.paused": { paused: [] },
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

  it("stops a running agent and sends a task from the team chart", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const gateway = await installMockGateway(page, {
          nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
          operatorScopes: ["operator.admin"],
          methodResponses: {
            ...teamResponses([]),
            "sessions.abort": { ok: true },
            agent: { runId: "run-1", status: "accepted" },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=team`);
        const surface = page.locator(".nsvx");
        const coder = surface
          .locator(".nsvx-agent")
          .filter({ has: page.locator(".nsvx-agent__name", { hasText: /^Coder$/ }) });
        await coder.getByText("Running", { exact: true }).waitFor();
        // Only agents with a live run offer Stop.
        expect(await surface.getByRole("button", { name: "Stop" }).count()).toBe(1);

        if (process.env.OPENCLAW_CAPTURE_UI_PROOF === "1") {
          await coder.getByRole("button", { name: "Task" }).click();
          for (const viewport of [desktop, { width: 390, height: 844 }]) {
            const frame = await takeControlUiScreenshotFrame(
              page,
              surface,
              [coder.getByRole("button", { name: "Stop" }), coder.getByRole("textbox")],
              { animations: "disabled", viewport },
            );
            await writeFile(
              path.join(suite.artifactDir, `nsvx-team-${viewport.width}.png`),
              frame.png,
            );
          }
          await page.setViewportSize(desktop);
          await coder.getByRole("button", { name: "Task" }).click();
        }

        // Stop asks once, then aborts exactly the live run and its queue.
        await coder.getByRole("button", { name: "Stop" }).click();
        await coder.getByRole("button", { name: "Confirm" }).click();
        expect((await gateway.waitForRequest("sessions.abort")).params).toEqual({
          key: "agent:coder:main",
          agentId: "coder",
          clearQueued: true,
        });
        await surface.getByText("Stopped", { exact: true }).waitFor();

        await coder.getByRole("button", { name: "Task" }).click();
        await coder.getByRole("textbox", { name: "Task" }).fill("Run the focused tests");
        await coder.getByRole("button", { name: "Send" }).click();
        const sent = (await gateway.waitForRequest("agent")).params as Record<string, unknown>;
        expect(sent).toMatchObject({ agentId: "coder", message: "Run the focused tests" });
        expect(typeof sent.idempotencyKey).toBe("string");
        await coder.getByText("Sent", { exact: true }).waitFor();
        await expect.poll(() => coder.getByRole("textbox", { name: "Task" }).inputValue()).toBe("");
      },
    );
  });

  it("pauses an agent after a confirm and resumes a paused one", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const gateway = await installMockGateway(page, {
          nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
          operatorScopes: ["operator.admin"],
          methodResponses: {
            ...teamResponses(["tester"]),
            "nsvx.team.pause": { id: "coder", supervisors: ["main"], stopped: 1, failed: 0 },
            "nsvx.team.resume": { id: "tester", supervisors: ["coder"] },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=team`);
        const surface = page.locator(".nsvx");
        const row = (name: string) =>
          surface.locator(".nsvx-agent").filter({
            has: page.locator(".nsvx-agent__name", { hasText: new RegExp(`^${name}$`) }),
          });
        await row("Tester").getByText("Paused", { exact: true }).waitFor();
        // The main agent cannot pause, and a paused agent cannot be moved until it resumes.
        expect(await row("Boss").getByRole("button", { name: "Pause" }).count()).toBe(0);
        expect(await row("Tester").getByRole("combobox", { name: "Reports to" }).count()).toBe(0);

        if (process.env.OPENCLAW_CAPTURE_UI_PROOF === "1") {
          for (const viewport of [desktop, { width: 390, height: 844 }]) {
            const frame = await takeControlUiScreenshotFrame(
              page,
              surface,
              [row("Coder").getByRole("button", { name: "Pause" })],
              { animations: "disabled", viewport },
            );
            await writeFile(
              path.join(suite.artifactDir, `nsvx-pause-${viewport.width}.png`),
              frame.png,
            );
          }
          await page.setViewportSize(desktop);
        }

        await row("Coder").getByRole("button", { name: "Pause" }).click();
        await row("Coder").getByRole("button", { name: "Confirm" }).click();
        expect((await gateway.waitForRequest("nsvx.team.pause")).params).toEqual({
          agentId: "coder",
        });
        await surface.locator(".nsvx__notice", { hasText: "Paused" }).first().waitFor();

        await row("Tester").getByRole("button", { name: "Resume" }).click();
        expect((await gateway.waitForRequest("nsvx.team.resume")).params).toEqual({
          agentId: "tester",
        });
        await surface.getByText("Resumed", { exact: true }).waitFor();
      },
    );
  });

  it("moves an agent through the plugin and undoes a change from history", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const at = Date.now();
        const gateway = await installMockGateway(page, {
          nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
          operatorScopes: ["operator.admin"],
          methodResponses: {
            ...teamResponses([]),
            "nsvx.team.move": { id: "tester", supervisor: "main", version: "v3" },
            "nsvx.team.history": {
              versions: [
                {
                  id: "v2",
                  at: at - 60_000,
                  change: "assign",
                  agent: "coder",
                  target: "mac",
                  by: "control",
                  beforeHash: "a",
                  afterHash: "b",
                },
                {
                  id: "v1",
                  at: at - 7_200_000,
                  change: "move",
                  agent: "tester",
                  target: "coder",
                  by: "chat",
                  beforeHash: null,
                  afterHash: null,
                },
              ],
            },
            "nsvx.team.rollback": { version: "v4", restored: "v1", skipped: [] },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=team`);
        const surface = page.locator(".nsvx");
        const tester = surface
          .locator(".nsvx-agent")
          .filter({ has: page.locator(".nsvx-agent__name", { hasText: /^Tester$/ }) });
        await tester.getByRole("combobox", { name: "Reports to" }).selectOption("main");
        expect((await gateway.waitForRequest("nsvx.team.move")).params).toEqual({
          agentId: "tester",
          supervisorId: "main",
        });
        await surface.locator(".nsvx__notice", { hasText: "Saved" }).waitFor();

        await surface.getByRole("button", { name: "History" }).click();
        const rows = surface.locator(".nsvx-history .nsvx-row");
        await rows.first().getByText("Coder → Mac", { exact: true }).waitFor();
        await rows.nth(1).getByText("Move · Chat · Not confirmed", { exact: true }).waitFor();

        if (process.env.OPENCLAW_CAPTURE_UI_PROOF === "1") {
          await rows.nth(1).getByRole("button", { name: "Undo" }).click();
          for (const viewport of [desktop, { width: 390, height: 844 }]) {
            const frame = await takeControlUiScreenshotFrame(
              page,
              surface,
              [surface.getByRole("button", { name: "History" }), rows.nth(1)],
              { animations: "disabled", viewport },
            );
            await writeFile(
              path.join(suite.artifactDir, `nsvx-history-${viewport.width}.png`),
              frame.png,
            );
          }
          await page.setViewportSize(desktop);
        } else {
          await rows.nth(1).getByRole("button", { name: "Undo" }).click();
        }

        // Undo asks once, then restores exactly that version.
        await rows.nth(1).getByRole("button", { name: "Confirm" }).click();
        expect((await gateway.waitForRequest("nsvx.team.rollback")).params).toEqual({
          version: "v1",
        });
        await surface.locator(".nsvx__notice", { hasText: "Restored" }).waitFor();
      },
    );
  });

  it("shows NSVX activity and unified search natively, with filters, summary, and export", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block", acceptDownloads: true },
      async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
        // Synthetic payloads shaped like /api/auto/activity, /api/auto/activity/workflows, and /api/find.
        const activity = {
          items: [
            {
              id: 41,
              at: at(1),
              kind: "status",
              summary: "Invoice filed in Drive",
              from_status: "in_progress",
              to_status: "completed",
              actor: "auto",
              actor_name: "AUTO",
              task_id: "t1",
              task_title: "File the garage invoice",
            },
            {
              id: 40,
              at: at(3),
              kind: "delegated",
              summary: "The clone took this task",
              from_status: null,
              to_status: null,
              actor: "owner",
              actor_name: "Me",
              task_id: "t2",
              task_title: "Renew the car insurance",
            },
            {
              id: 39,
              at: at(30),
              kind: "status",
              summary: "Waiting for the landlord",
              from_status: "in_progress",
              to_status: "waiting",
              actor: "auto",
              actor_name: "AUTO",
              task_id: "t3",
              task_title: "Fix the boiler",
            },
          ],
          next: null,
        };
        const workflows = {
          items: [
            {
              id: "w1",
              name: "Invoice to accounting",
              status: "running",
              updated_at: at(2),
              last_durable_step: "upload",
              steps: [
                {
                  step_key: "scan",
                  app: "drive",
                  action: "scan",
                  status: "verified",
                  updated_at: at(2),
                },
                {
                  step_key: "upload",
                  app: "toconline",
                  action: "upload",
                  status: "pending",
                  updated_at: at(2),
                },
              ],
            },
          ],
        };
        const found = {
          version: 2,
          groups: [
            {
              group: "people",
              total: 1,
              total_exact: true,
              capped: false,
              next: null,
              error: null,
              items: [
                {
                  ref: { kind: "person", id: "p1" },
                  title: "Ana Garage",
                  excerpt: "Mechanic",
                  meta: ["WhatsApp"],
                  updated_at: at(5),
                  href: "/pessoas/p1",
                },
              ],
            },
            {
              group: "missions",
              total: 1,
              total_exact: true,
              capped: false,
              next: null,
              error: null,
              items: [
                {
                  ref: { kind: "mission", id: "m1" },
                  title: "Pay the garage",
                  excerpt: null,
                  meta: ["needs_owner"],
                  updated_at: at(1),
                  href: "/tarefas/m1",
                },
              ],
            },
            { group: "documents", total: 0, next: null, error: null, items: [], capped: false },
          ],
        };
        const gateway = await installMockGateway(page, {
          nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
          operatorScopes: ["operator.admin"],
          featureMethods: [
            ...defaultControlUiFeatureMethods,
            "nsvx.view",
            "nsvx.search",
            "nsvx.activity.summary",
            "nsvx.activity.export",
          ],
          methodResponses: {
            "plugins.list": { plugins: [], diagnostics: [], mutationAllowed: true },
            "nsvx.view": {
              cases: [
                { match: { view: "activity" }, response: activity },
                { match: { view: "activityWorkflows" }, response: workflows },
                { match: { view: "activityCount" }, response: { count: 2 } },
                { match: { view: "missions" }, response: missions },
                { match: { view: "missionEvents" }, response: { items: [], next: null } },
              ],
            },
            "nsvx.activity.summary": {
              count: 2,
              text: "Two tasks moved: the garage invoice is filed and insurance is with the clone.",
              unavailable: false,
              sources: [],
              cited: [],
            },
            "nsvx.activity.export": {
              fileName: "auto-activity-2026-11-04-2026-11-05.csv",
              csv: "at_utc,kind,summary\n",
            },
            "nsvx.search": found,
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=activity`);
        const surface = page.locator(".nsvx");
        const tab = (name: string) =>
          surface.getByRole("tab", { name: new RegExp(`^${name}(:|$)`) });

        // The log, newest first, with the cross-app flow and its steps.
        await surface.getByText("Invoice filed in Drive", { exact: true }).waitFor();
        await surface.getByText("Invoice to accounting", { exact: true }).waitFor();
        expect(await tab("Activity").getAttribute("aria-selected")).toBe("true");

        // Kind filter narrows the loaded rows; the header box searches inside them.
        await surface.getByRole("combobox", { name: "Kind" }).selectOption("delegated");
        await surface.getByText("The clone took this task", { exact: true }).waitFor();
        expect(await surface.getByText("Invoice filed in Drive", { exact: true }).count()).toBe(0);
        await surface.getByRole("button", { name: "Clear" }).click();
        await surface.getByRole("searchbox").fill("boiler");
        await surface.getByText("Waiting for the landlord", { exact: true }).waitFor();
        expect(await surface.getByText("Invoice filed in Drive", { exact: true }).count()).toBe(0);
        await surface.getByRole("searchbox").fill("");

        // Picked rows drive the summary and the CSV export, with a count before the download.
        await surface.getByRole("checkbox", { name: /Invoice filed in Drive/ }).check();
        await surface.getByRole("checkbox", { name: /The clone took this task/ }).check();
        await surface.getByRole("button", { name: "Summary" }).click();
        await surface.getByText(/garage invoice is filed/).waitFor();
        const summary = await gateway.waitForRequest("nsvx.activity.summary");
        expect((summary.params as { ids: number[] }).ids.toSorted()).toEqual([40, 41]);
        await surface.getByRole("button", { name: "CSV" }).click();
        await surface.getByText("2 entries", { exact: true }).waitFor();

        if (process.env.OPENCLAW_CAPTURE_UI_PROOF === "1") {
          for (const viewport of [desktop, { width: 390, height: 844 }]) {
            const frame = await takeControlUiScreenshotFrame(page, surface, [tab("Activity")], {
              animations: "disabled",
              viewport,
            });
            await writeFile(
              path.join(suite.artifactDir, `nsvx-activity-${viewport.width}.png`),
              frame.png,
            );
          }
          await page.setViewportSize(desktop);
        }

        const download = page.waitForEvent("download");
        await surface.getByRole("button", { name: "Download" }).click();
        expect((await download).suggestedFilename()).toBe(
          "auto-activity-2026-11-04-2026-11-05.csv",
        );
        expect(
          ((await gateway.waitForRequest("nsvx.activity.export")).params as { ids: number[] }).ids,
        ).toHaveLength(2);

        // Find: the header box searches people, chats, tasks, AUTO, and docs at once.
        await tab("Find").click();
        await surface.getByText("Type to find", { exact: true }).waitFor();
        await surface.getByRole("searchbox").fill("garage");
        await surface.getByText("Ana Garage", { exact: true }).waitFor();
        expect((await gateway.waitForRequest("nsvx.search")).params).toEqual({
          q: "garage",
          limit: 10,
        });

        if (process.env.OPENCLAW_CAPTURE_UI_PROOF === "1") {
          for (const viewport of [desktop, { width: 390, height: 844 }]) {
            const frame = await takeControlUiScreenshotFrame(page, surface, [tab("Find")], {
              animations: "disabled",
              viewport,
            });
            await writeFile(
              path.join(suite.artifactDir, `nsvx-find-${viewport.width}.png`),
              frame.png,
            );
          }
          await page.setViewportSize(desktop);
        }

        // A task result opens natively in Tasks.
        await surface.getByRole("tab", { name: /^Tasks: 1$/ }).click();
        await surface.getByRole("button", { name: /Pay the garage/ }).click();
        await surface.getByRole("button", { name: /Pay the garage/, expanded: true }).waitFor();
        expect(new URL(page.url()).searchParams.get("tab")).toBe("tasks");
        expect(new URL(page.url()).searchParams.get("mission")).toBe("m1");
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
