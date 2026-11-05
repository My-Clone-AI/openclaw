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
const suite = createControlUiE2eSuite({ name: "NSVX grow" });
const desktop = { width: 1280, height: 1000 };
const phone = { width: 390, height: 844 };
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const soon = new Date(Date.now() + 90 * 60_000).toISOString();

const METHODS = [
  "nsvx.view",
  "nsvx.status",
  "nsvx.grow.control",
  "nsvx.grow.timer",
  "nsvx.grow.rollback",
  "nsvx.ideas.submit",
  "nsvx.ideas.decide",
  "nsvx.brain.task",
  "nsvx.brain.roles",
];

// Synthetic payloads shaped like NSVX /api/grow/*, /api/build-me/admin/*, and /api/v1/admin/ai/openclaw/*.
const cycle = (id: number, app: string, status: string, minutes: number, pr?: number) => ({
  id,
  app,
  slot: "2026-11-05T10",
  mode: "on",
  status,
  reason: status === "failed" ? "tests failed" : null,
  createdAt: ago(minutes + 30),
  startedAt: ago(minutes + 29),
  finishedAt: status === "running" ? null : ago(minutes),
  durationS: status === "running" ? null : 1740,
  prNumber: pr ?? null,
  prUrl: pr ? `https://github.com/My-Clone-AI/${app}/pull/${pr}` : null,
  mergeSha: status === "merged" ? "4bb077870476f9289a95108e9d3a90d13311158c" : null,
  summary: null,
});
const app = (
  id: string,
  cycles: ReturnType<typeof cycle>[],
  more: Record<string, unknown> = {},
) => ({
  id,
  repo: `My-Clone-AI/${id}`,
  slots: ["02:00", "14:00"],
  mode: "on",
  adult: false,
  effectiveMode: "on",
  modeOverride: null,
  paused: false,
  enabled: true,
  nextSlot: soon,
  running: cycles.find((c) => c.status === "running") ?? null,
  cycles,
  last: cycles[0] ?? null,
  ...more,
});
const growStatus = {
  provisioned: true,
  have: { config: true, state: true, inbox: true },
  kill: false,
  pendingKill: null,
  pendingRequests: 1,
  apps: {
    clone: app("clone", [cycle(42, "clone", "running", 0), cycle(41, "clone", "merged", 120, 931)]),
    openhome: app("openhome", [cycle(39, "openhome", "failed", 60, 212)]),
    opendrive: app("opendrive", [cycle(37, "opendrive", "merged", 300, 88)], {
      paused: true,
      effectiveMode: "off",
      modeOverride: "dry-run",
    }),
  },
  chatgptAccounts: { "acct-a": { state: "awaiting_login", since: ago(20) } },
  awaitingLogin: ["acct-a"],
};
const growLog = {
  app: "clone",
  cycle: 42,
  kind: "codex",
  file: "codex-20261105T1000.log",
  lines: ["$ pnpm test web/src/screens", "✓ 18 tests passed", "→ opening pull request"],
  running: true,
};
const idea = (id: string, title: string, state: string, minutes: number, more = {}) => ({
  id,
  app_id: "clone",
  origin_app: "clone",
  source: "local",
  title,
  description: `${title}. Seria ótimo poder fazer isto com um toque.`,
  state,
  progress: undefined,
  held: false,
  priority: 50,
  revision: 2,
  version: 9,
  created_at: ago(minutes + 600),
  updated_at: ago(minutes),
  reasons: state === "rejected" ? ["Precisa de mais detalhe."] : [],
  specification: null,
  events: [],
  history: [],
  attachments: [],
  rephrase: null,
  pr_url: null,
  pr_status: "unconfigured",
  submitter_kind: "user",
  ...more,
});
const IDEA_ID = "a1111111-1111-4111-8111-111111111111";
const ideas = {
  items: [
    idea(IDEA_ID, "Modo escuro na agenda", "in_review", 5, {
      pr_url: "https://github.com/My-Clone-AI/clone/pull/944",
      specification: {
        title: "Modo escuro na agenda",
        problem: "A agenda é clara demais à noite.",
        user_story: "Como dono quero ver a agenda escura.",
        acceptance_criteria: ["Segue o tema do sistema", "Contraste AA em todos os eventos"],
      },
      audit: [{ action: "approve", reason: "Útil", actor: "s", created_at: ago(90) }],
    }),
    idea("b2222222-2222-4222-8222-222222222222", "Exportar faturas em ZIP", "building", 30),
    idea("c3333333-3333-4333-8333-333333333333", "Ligar ao Spotify", "rejected", 200),
    idea("d4444444-4444-4444-8444-444444444444", "Atalho para nova tarefa", "live", 900),
  ],
  apps: ["clone", "openhome"],
  more: false,
  page: 0,
  kpis: [
    { app_id: "clone", state: "in_review", n: 1, today: 0, week: 1 },
    { app_id: "clone", state: "building", n: 1, today: 0, week: 1 },
    { app_id: "clone", state: "rejected", n: 1, today: 0, week: 1 },
    { app_id: "clone", state: "live", n: 1, today: 0, week: 0 },
  ],
};
const roles = {
  code: "codex-terra-medium",
  alt: "muse-spark-1.3-xhigh",
  debug: "claude-opus-5.5-medium",
  review: "claude-opus-5.5-review",
};
const brain = {
  generated: new Date().toISOString(),
  stale: false,
  openclaw: { online: true },
  clone_ai: { health: { upstream: { mac_online: false } } },
  agents: {
    pipeline: ["plan", "build", "review", "fix", "verify"],
    agents: [
      {
        id: "brain",
        title: "OpenClaw",
        icon: "brain",
        engine: "terra-6.1-medium",
        locked: true,
        owns: ["plan", "verify"],
      },
      { id: "code", title: "Código", icon: "code", engine: "codex-terra-medium", owns: ["build"] },
      {
        id: "review",
        title: "Revisão",
        icon: "check",
        engine: "claude-opus-5.5-review",
        owns: ["review", "fix"],
      },
    ],
  },
  architecture: {
    nodes: [
      "Mac48 (owner)",
      "OpenClaw (brain)",
      "Master",
      "Grow",
      "Codex",
      "Muse",
      "Claude",
      "clone-ai",
    ],
    edges: [
      ["Mac48", "OpenClaw"],
      ["OpenClaw", "Master"],
      ["Master", "Grow"],
      ["Master", "Codex"],
      ["Master", "Muse"],
      ["Master", "Claude"],
      ["Master", "clone-ai"],
    ],
  },
  flows: { recent: [{ id: "f1", title: "Corrigir login", status: "running", stage: "review" }] },
  workers: {
    codex_slot_running: 1,
    codex_slot_waiting: 2,
    jobs: {
      by_status: { running: 1, done: 14, failed: 1 },
      recent: [
        { id: "j1", role: "code", status: "running", model: "codex-terra-medium", attempts: 1 },
        {
          id: "j2",
          role: "review",
          status: "failed",
          model: "claude-opus-5.5-review",
          attempts: 2,
        },
      ],
    },
  },
  automations: { brain_tick: true, brain_lock_timer: true, paused: false },
  blocked_actions: [{ id: "b1", action: "Reiniciar gateway", needs_scope: "owner" }],
  recovery_actions: [],
};
const timers = {
  helper: "ok",
  apps: {
    clone: [
      {
        app: "clone",
        name: "Pipeline watch",
        timer: "grow-auto-clone-pipeline-watch.timer",
        service: "grow-auto-clone-pipeline-watch.service",
        enabled: true,
        active: true,
        schedule: "*:0/15",
        next_run: soon,
        last_run: ago(10),
        last_exit_code: 0,
        status: "ok",
        managed: true,
        read_only: false,
      },
      {
        app: "clone",
        name: "Nightly deps",
        timer: "grow-auto-clone-deps.timer",
        service: "grow-auto-clone-deps.service",
        enabled: false,
        active: false,
        schedule: "*-*-* 03:00",
        next_run: null,
        last_run: ago(3000),
        last_exit_code: 1,
        status: "paused",
        managed: true,
        read_only: false,
      },
    ],
  },
};
const route = (provider: string, model: string, effort: string | null) => ({
  provider,
  model,
  effort,
});
const chains = {
  slots: {
    planning: {
      slot: "planning",
      chain: [route("openai", "gpt-6.1-terra", "medium")],
      version: 3,
      effective: [route("openai", "gpt-6.1-terra", "medium")],
    },
    implementation: {
      slot: "implementation",
      chain: [
        route("anthropic", "claude-opus-5-5", "medium"),
        route("openai", "gpt-6.1-terra", "high"),
      ],
      version: 5,
      effective: [
        route("anthropic", "claude-opus-5-5", "medium"),
        route("openai", "gpt-6.1-terra", "high"),
      ],
    },
  },
};
const chainHistory = {
  items: [
    {
      slot: "implementation",
      version: 5,
      chain: chains.slots.implementation.chain,
      created_at: ago(60),
    },
    {
      slot: "implementation",
      version: 4,
      chain: [route("openai", "gpt-6.1-terra", "high")],
      created_at: ago(3000),
    },
  ],
};

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
      path.join(suite.artifactDir, `nsvx-grow-${name}-${viewport.width}.png`),
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
          { match: { view: "growStatus" }, response: growStatus },
          { match: { view: "growLog" }, response: growLog },
          { match: { view: "growTimers" }, response: timers },
          { match: { view: "growChains" }, response: chains },
          { match: { view: "growChainHistory" }, response: chainHistory },
          { match: { view: "buildMeRequests" }, response: ideas },
          { match: { view: "buildMeRequest" }, response: ideas.items[0] },
          { match: { view: "brainStatus" }, response: brain },
          { match: { view: "brainRoles" }, response: { roles } },
        ],
      },
      "nsvx.grow.control": { id: "r2", status: "pending", replayed: false },
      "nsvx.grow.timer": { timer: "grow-auto-clone-deps.timer", enabled: true },
      "nsvx.grow.rollback": { slot: "implementation", version: 6 },
      "nsvx.ideas.submit": { received: true, revision: 1 },
      "nsvx.ideas.decide": { ...ideas.items[0], state: "merged_develop" },
      "nsvx.brain.task": { queued: true, id: "20261105T120000Z-abcd1234" },
      "nsvx.brain.roles": { roles: { ...roles, alt: "claude-opus-5.5-medium" } },
      ...overrides,
    },
  });
  await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&${query}`);
  return gateway;
}

suite.define(() => {
  it("runs Grow natively: apps, modes, run now, stop all, history, and the live log", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const gateway = await mount(page, "tab=grow");
        const surface = page.locator(".nsvx");
        const card = (id: string) => surface.locator(`[data-grow-app="${id}"]`);
        await card("clone").waitFor();
        await surface.getByRole("tab", { name: "Check: 1" }).waitFor();
        await surface.getByText("ChatGPT acct-a · Sign in").waitFor();
        await capture(page, surface, "apps", [card("clone"), card("opendrive")]);

        await card("openhome").getByRole("radio", { name: "Canary" }).click();
        const mode = await gateway.waitForRequest("nsvx.grow.control", {
          match: { action: "mode" },
        });
        expect(mode.params).toMatchObject({ action: "mode", app: "openhome", mode: "canary" });
        expect((mode.params as { idempotencyKey: string }).idempotencyKey).toMatch(
          /^[0-9a-f-]{36}$/,
        );

        await card("clone").getByRole("button", { name: "Run now" }).click();
        await card("clone").getByRole("button", { name: "Run now" }).click();
        expect(
          (await gateway.waitForRequest("nsvx.grow.control", { match: { action: "run" } })).params,
        ).toMatchObject({ app: "clone" });
        // An app that is off cannot run now, as NSVX refuses it.
        expect(await card("opendrive").getByRole("button", { name: "Run now" }).isDisabled()).toBe(
          true,
        );

        await card("clone").getByRole("button", { name: "Log · clone" }).click();
        const line = card("clone").getByText("✓ 18 tests passed", { exact: false });
        await line.waitFor();
        await gateway.waitForRequest("nsvx.view", {
          match: { view: "growLog", params: { app: "clone", tail: "200" } },
        });
        await capture(page, surface, "app-log", [line], line);
        // History takes the log's place in the card.
        await card("clone").getByRole("button", { name: "History · clone" }).click();
        await card("clone").getByRole("link", { name: "#931" }).waitFor();

        await surface.getByRole("button", { name: "Stop all" }).click();
        await surface.getByRole("button", { name: "Stop all" }).click();
        expect(
          (await gateway.waitForRequest("nsvx.grow.control", { match: { action: "kill" } })).params,
        ).toMatchObject({ on: true });
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("reviews Build Me ideas natively: counts, new idea, detail, and merge to dev", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const gateway = await mount(page, "tab=grow&grow=ideas");
        const surface = page.locator(".nsvx");
        await surface.getByRole("tab", { name: "Needs you: 1" }).waitFor();
        const row = surface.getByRole("button", { name: "Modo escuro na agenda" });
        await row.waitFor();
        await capture(page, surface, "ideas", [row]);

        await surface.getByLabel("New idea").fill("Lembrete antes de cada voo");
        await surface.getByRole("button", { name: "Send", exact: true }).click();
        const submit = await gateway.waitForRequest("nsvx.ideas.submit");
        expect(submit.params).toMatchObject({ text: "Lembrete antes de cada voo" });
        await surface.getByText("Idea received").waitFor();

        await row.click();
        const criterion = surface.getByText("Contraste AA em todos os eventos");
        await criterion.waitFor();
        expect(new URL(page.url()).searchParams.get("idea")).toBe(IDEA_ID);
        await surface.getByRole("button", { name: "Merge to dev" }).click();
        await surface.getByLabel("Why").fill("Testado em dev");
        await capture(page, surface, "idea", [criterion]);
        const ideaRead = { view: "buildMeRequest", params: { id: IDEA_ID } };
        const reads = (await gateway.getRequests("nsvx.view", ideaRead)).length;
        await surface.locator("form").getByRole("button", { name: "Merge to dev" }).click();
        const decide = await gateway.waitForRequest("nsvx.ideas.decide");
        expect(decide.params).toMatchObject({
          ideaId: IDEA_ID,
          decision: "merge-to-develop",
          reason: "Testado em dev",
          revision: 2,
          version: 9,
        });
        // The idea is read again from NSVX after the decision.
        await gateway.waitForRequest("nsvx.view", { match: ideaRead, after: reads });
      },
    );
  });

  it("shows the OpenClaw brain natively: status, map, new task, and worker roles", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const gateway = await mount(page, "tab=grow&grow=brain");
        const surface = page.locator(".nsvx");
        const map = surface.getByRole("img", { name: /Mac48, OpenClaw, Master/ });
        await map.waitFor();
        await surface.getByLabel("OpenClaw: Online").waitFor();
        await surface.getByLabel("clone-ai: Offline").waitFor();
        await surface.getByText("Needs approval: Reiniciar gateway · owner").waitFor();
        await capture(page, surface, "brain", [map], map);

        await surface.getByLabel("Alternative").selectOption("claude-opus-5.5-medium");
        expect((await gateway.waitForRequest("nsvx.brain.roles")).params).toEqual({
          roles: { ...roles, alt: "claude-opus-5.5-medium" },
        });
        await surface.getByLabel("New task").fill("Rever erros do login no openhome");
        await surface.locator(".nsvx-grow__composer").getByRole("button", { name: "Send" }).click();
        expect((await gateway.waitForRequest("nsvx.brain.task")).params).toMatchObject({
          goal: "Rever erros do login no openhome",
        });
        await surface.getByText("In queue").waitFor();
      },
    );
  });

  it("controls Grow timers and restores a model chain", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const gateway = await mount(page, "tab=grow&grow=timers");
        const surface = page.locator(".nsvx");
        const toggle = surface.getByRole("switch", { name: "Nightly deps" });
        await toggle.waitFor();
        await surface.getByText("claude-opus-5-5 · medium").waitFor();
        await capture(page, surface, "timers", [toggle]);
        await toggle.click();
        expect((await gateway.waitForRequest("nsvx.grow.timer")).params).toEqual({
          timer: "grow-auto-clone-deps.timer",
          on: true,
        });
        await surface.getByRole("button", { name: "History · Building" }).click();
        await surface.getByRole("button", { name: "Restore" }).click();
        await surface.getByRole("button", { name: "Restore" }).click();
        expect((await gateway.waitForRequest("nsvx.grow.rollback")).params).toEqual({
          slot: "implementation",
          version: 4,
          expectedVersion: 5,
        });
      },
    );
  });

  it("asks for the NSVX sign-in in Portuguese on a phone when the Gateway has none", async () => {
    await suite.withPage(
      { viewport: phone, locale: "pt-PT", serviceWorkers: "block" },
      async ({ page }) => {
        await mount(page, "tab=grow", {
          "nsvx.view": {
            __mockError: {
              code: "unconfigured",
              message: "NSVX owner sign-in is not set up on this Gateway.",
            },
          },
        });
        const surface = page.locator(".nsvx");
        await surface.getByRole("radio", { name: "Ideias", exact: true }).waitFor();
        const card = surface.locator(".nsvx-connect");
        await card.waitFor();
        if (process.env.OPENCLAW_CAPTURE_UI_PROOF === "1") {
          const frame = await takeControlUiScreenshotFrame(page, surface, [card], {
            animations: "disabled",
            viewport: phone,
          });
          await writeFile(path.join(suite.artifactDir, "nsvx-grow-sign-in-390.png"), frame.png);
        }
      },
    );
  });
});
