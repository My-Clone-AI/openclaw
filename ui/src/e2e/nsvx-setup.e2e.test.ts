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
const suite = createControlUiE2eSuite({ name: "NSVX setup and skills" });
const desktop = { width: 1280, height: 1000 };
const phone = { width: 390, height: 844 };
const now = new Date().toISOString();

const entries = {
  main: { identity: { name: "Boss", emoji: "🧭" }, subagents: { allowAgents: ["coder"] } },
  coder: { identity: { name: "Coder", emoji: "🛠️" } },
};

const plugin = {
  nativePlugins: [{ pluginId: "nsvx", rootDir: pluginRoot, source: "src/control-ui.tsx" }],
  operatorScopes: ["operator.admin"],
  featureMethods: [...defaultControlUiFeatureMethods, "nsvx.view", "nsvx.status"],
};

// Synthetic tool catalog and NSVX payloads, shaped like tools.catalog, /api/ai/openclaw/suggest, and /api/skills.
const catalog = {
  agentId: "coder",
  profiles: [],
  groups: [
    {
      id: "runtime",
      label: "Runtime",
      source: "core",
      tools: [
        {
          id: "exec",
          label: "Run commands",
          description: "",
          source: "core",
          defaultProfiles: ["coding", "full"],
        },
        {
          id: "read",
          label: "Read files",
          description: "",
          source: "core",
          defaultProfiles: ["coding", "full"],
        },
      ],
    },
    {
      id: "web",
      label: "Web",
      source: "core",
      tools: [
        {
          id: "browser",
          label: "Browser",
          description: "",
          source: "core",
          defaultProfiles: ["full"],
        },
        {
          id: "web_search",
          label: "Web search",
          description: "",
          source: "core",
          defaultProfiles: ["coding", "full"],
        },
        {
          id: "message",
          label: "Send message",
          description: "",
          source: "core",
          defaultProfiles: ["messaging", "full"],
        },
      ],
    },
  ],
};

const skills = [
  {
    id: "s1",
    slug: "invoice-filing",
    name: "File invoices",
    when_to_use: "A new invoice arrives",
    source: "managed",
    enabled: true,
    steps_count: 3,
    last_run_ts: now,
    review_state: null,
    review_version: "a".repeat(64),
    latest_verification: { verified: "confirmed", outcome: "succeeded", ts: now },
  },
  {
    id: "s2",
    slug: "flight-checkin",
    name: "Flight check-in",
    when_to_use: "24h before a flight",
    source: "managed",
    enabled: false,
    steps_count: 4,
    last_run_ts: now,
    review_state: null,
    review_version: "b".repeat(64),
    latest_verification: { verified: "failed", outcome: "failed", ts: now },
  },
  {
    id: "s3",
    slug: "pr-review",
    name: "Review pull requests",
    when_to_use: "A Grow cycle merged",
    source: "learned",
    enabled: false,
    steps_count: 2,
    last_run_ts: null,
    review_state: "pending",
    review_version: "c".repeat(64),
    learned_from: { app: "openclaw", cycle_id: 12, merge_sha: "abcdef12" },
    latest_verification: null,
  },
];

async function capture(page: Page, surface: Locator, name: string, ready: Locator[]) {
  if (process.env.OPENCLAW_CAPTURE_UI_PROOF !== "1") {
    return;
  }
  for (const viewport of [desktop, phone]) {
    const frame = await takeControlUiScreenshotFrame(page, surface, ready, {
      animations: "disabled",
      viewport,
    });
    await writeFile(path.join(suite.artifactDir, `nsvx-${name}-${viewport.width}.png`), frame.png);
  }
  await page.setViewportSize(desktop);
}

suite.define(() => {
  it("edits an agent's instructions and tools, the team defaults, and adds a suggested agent", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const gateway = await installMockGateway(page, {
          ...plugin,
          methodResponses: {
            "config.get": { hash: "rev-1", parsed: { agents: { entries } } },
            "agents.list": { defaultId: "main", agents: [{ id: "main" }, { id: "coder" }] },
            "nsvx.agents.get": {
              cases: [
                {
                  match: { agentId: "coder" },
                  response: {
                    agentId: "coder",
                    instructions: "Run focused tests.",
                    tools: { profile: "coding" },
                    inheritedProfile: null,
                    model: null,
                    thinking: null,
                  },
                },
                {
                  match: { agentId: "main" },
                  response: {
                    agentId: "main",
                    instructions: "",
                    tools: {},
                    inheritedProfile: null,
                    model: null,
                    thinking: null,
                  },
                },
              ],
            },
            "tools.catalog": catalog,
            "nsvx.agents.instructions": { agentId: "coder", previous: "Run focused tests." },
            "nsvx.agents.tools": { agentId: "coder", version: "v1" },
            "nsvx.agents.defaults": {
              mainAgent: "main",
              model: "claude-cli/opus",
              thinkingDefault: "medium",
              maxConcurrent: 4,
              subagentsMaxConcurrent: 8,
              rules: "Small PRs.",
              models: [
                {
                  ref: "claude-cli/opus",
                  name: "Opus",
                  provider: "claude-cli",
                  kind: "subscription",
                },
                { ref: "clone-ai/clone-ai", name: "clone-ai", provider: "clone-ai", kind: "local" },
                { ref: "xai/grok", name: "Grok", provider: "xai", kind: "paid" },
              ],
            },
            "nsvx.agents.setDefaults": { version: "v2" },
            "nsvx.agents.suggest": {
              source: "template",
              agents: [
                {
                  id: "engineering",
                  name: "Engineering",
                  emoji: "🛠️",
                  supervisor: "main",
                  theme: "builds the product",
                  exists: false,
                },
                {
                  id: "coder",
                  name: "Coder",
                  emoji: "🛠️",
                  supervisor: "engineering",
                  theme: "writes code",
                  exists: true,
                },
              ],
            },
            "nsvx.agents.adopt": { agentId: "engineering", supervisor: "main" },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=setup&agent=coder`);
        const surface = page.locator(".nsvx");
        const instructions = surface.getByRole("textbox", { name: "Instructions" });
        await expect.poll(() => instructions.inputValue()).toBe("Run focused tests.");
        await surface.getByRole("button", { name: /Run commands/ }).waitFor();
        await capture(page, surface, "setup-agents", [instructions]);

        // Instructions: save writes NSVX's section, then Undo offers the old text back.
        await instructions.fill("Run focused tests. Open a PR.");
        await surface.getByRole("button", { name: "Save" }).first().click();
        expect((await gateway.waitForRequest("nsvx.agents.instructions")).params).toEqual({
          agentId: "coder",
          text: "Run focused tests. Open a PR.",
        });
        await surface.getByRole("button", { name: "Undo" }).waitFor();

        // Tools: a profile tool turns off with deny; one outside the profile turns on as an extra.
        await surface.getByRole("button", { name: /Run commands/ }).click();
        await surface.getByRole("button", { name: /Browser/ }).click();
        expect(
          await surface.getByRole("button", { name: /Browser/ }).getAttribute("aria-pressed"),
        ).toBe("true");
        await surface.getByRole("button", { name: "Save" }).nth(1).click();
        expect((await gateway.waitForRequest("nsvx.agents.tools")).params).toEqual({
          agentId: "coder",
          profile: "coding",
          allow: null,
          deny: ["exec"],
          alsoAllow: ["browser"],
        });

        // Defaults: paid models cannot be picked; thinking and counts save together.
        await surface.getByRole("tab", { name: /Defaults/ }).click();
        const model = surface.getByRole("combobox", { name: "Model" });
        await expect.poll(() => model.inputValue()).toBe("claude-cli/opus");
        expect(await model.locator('option[value="xai/grok"]').isDisabled()).toBe(true);
        await surface.getByRole("button", { name: "High", exact: true }).click();
        await surface.getByRole("button", { name: "Agents at once +" }).click();
        await capture(page, surface, "setup-defaults", [model]);
        await surface.getByRole("button", { name: "Save" }).click();
        expect((await gateway.waitForRequest("nsvx.agents.setDefaults")).params).toEqual({
          thinkingDefault: "high",
          maxConcurrent: 5,
        });

        // Ideas: NSVX proposes agents for a goal; Add creates one, existing ones say so.
        await surface.getByRole("tab", { name: /Ideas/ }).click();
        await surface.getByRole("textbox", { name: "Goal" }).fill("launch the new app");
        await surface.getByRole("button", { name: "Suggest" }).click();
        expect((await gateway.waitForRequest("nsvx.agents.suggest")).params).toEqual({
          goal: "launch the new app",
        });
        await surface.getByText("In team", { exact: true }).waitFor();
        await capture(page, surface, "setup-ideas", [surface.getByRole("button", { name: "Add" })]);
        await surface.getByRole("button", { name: "Add" }).click();
        expect((await gateway.waitForRequest("nsvx.agents.adopt")).params).toEqual({
          id: "engineering",
          name: "Engineering",
          emoji: "🛠️",
          supervisor: "main",
          theme: "builds the product",
        });
        await surface.getByText("Added", { exact: true }).waitFor();
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("lists NSVX skills, turns one on, approves a learned one, and opens its runs", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const gateway = await installMockGateway(page, {
          ...plugin,
          methodResponses: {
            "nsvx.view": {
              cases: [
                { match: { view: "skills" }, response: { items: skills } },
                {
                  match: { view: "skillAlerts" },
                  response: {
                    alerts: [
                      {
                        id: "a1",
                        skill_id: "s2",
                        slug: "flight-checkin",
                        name: "Flight check-in",
                        consecutive_failures: 2,
                      },
                    ],
                  },
                },
                {
                  match: { view: "skill" },
                  response: {
                    ...skills[0],
                    steps: [
                      { n: 1, text: "Read the invoice" },
                      { n: 2, text: "File it in Drive" },
                    ],
                    runs: [
                      {
                        id: "r1",
                        app: "nsvx",
                        outcome: "succeeded",
                        detail: "Filed",
                        ts: now,
                        verified: "confirmed",
                      },
                    ],
                  },
                },
              ],
            },
            "nsvx.skills.state": { ...skills[1], enabled: true },
            "nsvx.skills.review": { ...skills[2], enabled: true, review_state: "approved" },
          },
        });
        await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&tab=skills`);
        const surface = page.locator(".nsvx");
        const tile = (name: string) => surface.getByRole("tab", { name: new RegExp(`^${name}: `) });
        await surface.getByText("File invoices", { exact: true }).waitFor();
        expect(await tile("Failing").getAttribute("aria-label")).toBe("Failing: 1");
        expect(await tile("To review").getAttribute("aria-label")).toBe("To review: 1");
        // A learned skill cannot be switched on before review.
        expect(
          await surface.getByRole("switch", { name: "Review pull requests" }).isDisabled(),
        ).toBe(true);
        await capture(page, surface, "skills", [surface.getByRole("button", { name: "Approve" })]);

        await surface.getByRole("switch", { name: "Flight check-in" }).click();
        expect((await gateway.waitForRequest("nsvx.skills.state")).params).toEqual({
          skillId: "s2",
          enabled: true,
        });
        await surface.getByRole("button", { name: "Approve" }).click();
        expect((await gateway.waitForRequest("nsvx.skills.review")).params).toEqual({
          skillId: "s3",
          decision: "approve",
          reviewVersion: "c".repeat(64),
        });

        await surface.getByRole("button", { name: /File invoices/ }).click();
        await surface.getByText("File it in Drive", { exact: true }).waitFor();
        expect(new URL(page.url()).searchParams.get("skill")).toBe("invoice-filing");
        await capture(page, surface, "skills-detail", [
          surface.getByText("File it in Drive", { exact: true }),
        ]);
        expect(pageErrors).toEqual([]);
      },
    );
  });
});
