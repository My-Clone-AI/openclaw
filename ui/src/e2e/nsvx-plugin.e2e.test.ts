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
