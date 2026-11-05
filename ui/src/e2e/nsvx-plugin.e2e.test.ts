import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { takeControlUiScreenshotFrame } from "../test-helpers/control-ui-e2e-screenshot.ts";
import { installMockGateway } from "../test-helpers/control-ui-e2e.ts";
import { createControlUiE2eSuite } from "./control-ui-e2e-suite.test-support.ts";

const pluginRoot = fileURLToPath(new URL("../../../extensions/nsvx/", import.meta.url));
const suite = createControlUiE2eSuite({ name: "NSVX native plugin" });
const desktop = { width: 1280, height: 900 };

const entries = {
  main: { identity: { name: "Boss", emoji: "B" }, subagents: { allowAgents: ["coder"] } },
  coder: { identity: { name: "Coder" }, subagents: { allowAgents: ["tester"] } },
  tester: { identity: { name: "Tester" } },
};

suite.define(() => {
  it("stops a running agent and sends a task from the team chart", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const gateway = await installMockGateway(page, {
          nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
          operatorScopes: ["operator.admin"],
          methodResponses: {
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
            "sessions.abort": { ok: true },
            agent: { runId: "run-1", status: "accepted" },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx`);
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
});
