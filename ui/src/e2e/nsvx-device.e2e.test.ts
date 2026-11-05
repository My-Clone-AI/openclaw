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
const suite = createControlUiE2eSuite({ name: "NSVX device and health" });
const desktop = { width: 1280, height: 1000 };
const phone = { width: 390, height: 844 };
const now = new Date().toISOString();
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const METHODS = [
  "nsvx.view",
  "nsvx.status",
  "nsvx.desktop.bots.save",
  "nsvx.desktop.jobs.stop",
  "nsvx.desktop.jobs.stopAll",
  "nsvx.desktop.memory.correct",
  "nsvx.desktop.memory.forget",
  "nsvx.sync.overview",
  "nsvx.sync.save",
  "nsvx.sync.promote",
  "nsvx.sync.discard",
  "nsvx.sync.confirm",
  "nsvx.health",
  "nsvx.legal",
];

// Synthetic payloads shaped like NSVX /api/desktop/*, /api/sync/changes (as device.ts trims it), and the probes.
const job = (id: string, label: string, state: string, progress: number, minutes: number) => ({
  id,
  bot_id: "clone",
  kind: id.startsWith("b") ? "backup" : "summary",
  label,
  state,
  progress,
  stop_requested: false,
  created_at: ago(minutes + 5),
  updated_at: ago(minutes),
});
const tasks = [
  job("a1111111-1111-4111-8111-111111111111", "Resumo da semana", "running", 62, 1),
  job("b2222222-2222-4222-8222-222222222222", "Cópia das fotos", "queued", 0, 3),
  job("c3333333-3333-4333-8333-333333333333", "Ler faturas de outubro", "done", 100, 60),
  job("d4444444-4444-4444-8444-444444444444", "Sincronizar agenda", "failed", 40, 120),
];
const definition = (name: string, section: string, avatar: string, description: string) => ({
  name,
  section,
  avatar,
  description,
  persona: "",
});
const bots = [
  {
    id: "clone",
    version: 4,
    definition: definition("clone", "Pessoal", "✦", "O teu assistente"),
    updated_at: now,
  },
  {
    id: "finance",
    version: 2,
    definition: definition("Finanças", "Trabalho", "◆", "Faturas e bancos"),
    updated_at: now,
  },
  { id: "old-helper", version: 3, definition: null, updated_at: now },
];
const memories = [
  {
    id: "m1",
    uri: "viking://owner/desktop-bots/clone/profile/l1/likes",
    snippet: "Prefere reuniões de manhã e respostas curtas.",
    level: "L1",
    source: "viking://owner/desktop-bots/clone/profile/l1/likes",
    confidence: 0.86,
  },
  {
    id: "m2",
    uri: "viking://owner/desktop-bots/clone/fact/l0/car",
    snippet: "O carro vai à revisão em dezembro.",
    level: "L0",
    source: "viking://owner/desktop-bots/clone/fact/l0/car",
    confidence: 0.52,
  },
];
const skills = [
  {
    id: "s1",
    slug: "invoice-filing",
    name: "Arquivar faturas",
    when_to_use: "Quando chega uma fatura por email",
    version: "r7",
    updated_at: now,
  },
  {
    id: "s2",
    slug: "trip-planning",
    name: "Planear viagem",
    when_to_use: "Voos, hotel e check-in",
    version: "r2",
    updated_at: now,
  },
];
const sync = {
  cursor: "v1:abc",
  counts: { conversations: 2, tasks: 3, missions: 1, contacts: 2, captures: 1, drafts: 1 },
  held: [
    {
      id: "e5555555-5555-4555-8555-555555555555",
      title: "Pedir orçamento ao canalizador",
      description: "",
      updated_at: now,
    },
  ],
  drafts: [
    {
      id: "f6666666-6666-4666-8666-666666666666",
      conversation_id: "a7777777-7777-4777-8777-777777777777",
      conversation: "Ana Silva",
      channel: "whatsapp",
      text: "Chego às 18h, até já!",
      created_at: ago(30),
    },
  ],
  tasks: [
    {
      id: "a8888888-8888-4888-8888-888888888888",
      title: "Renovar seguro",
      status: "open",
      version: "3",
    },
    {
      id: "a9999999-9999-4999-8999-999999999999",
      title: "Marcar dentista",
      status: "done",
      version: "1",
    },
  ],
  contacts: [
    { id: "b1111111-1111-4111-8111-111111111111", name: "Ana Silva", version: now },
    { id: "b2222222-1111-4111-8111-111111111111", name: "Rui Costa", version: now },
  ],
  conversations: [
    { id: "a7777777-7777-4777-8777-777777777777", title: "Ana Silva", channel: "whatsapp" },
    { id: "a7777777-1111-4777-8777-777777777777", title: "Rui Costa", channel: "telegram" },
  ],
  missions: [{ id: "m1", title: "Mudar de casa", status: "working", next_step: "Ver contratos" }],
  captures: [{ id: "c1", status: "ready", context: "personal", created_at: ago(90) }],
};
const health = {
  address: "nsvx.test",
  checkedAt: now,
  live: { ok: true, revision: "4bb077870476f9289a", contracts: { commands: 3, verification: 2 } },
  ready: {
    ready: true,
    failing: [],
    checks: { database: true, migrations: true, capabilities: true, web: true, manifest: true },
    digest: "sha256-9f3c2a7d10",
    capabilitiesFailed: [],
  },
  runtime: {
    revision: "4bb077870476f9289a",
    development: true,
    limitations: [],
    whatsappWarnings: 0,
    instagram: [
      {
        binding: "ig-1",
        warnings: ["token_expiring"],
        expires: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      },
    ],
  },
};
const legal = {
  title: "Privacy Policy",
  updated: "Last updated: 20 October 2026 · Version 3",
  sections: [
    {
      id: "who",
      title: "Who we are",
      blocks: [
        {
          kind: "p",
          runs: [
            { text: "Write to " },
            { text: "hi@nsvx.com", href: "mailto:hi@nsvx.com" },
            { text: " with any question." },
          ],
        },
      ],
    },
    {
      id: "keep",
      title: "How long we keep data",
      blocks: [
        {
          kind: "list",
          items: [[{ text: "Messages", strong: true }, { text: ": while the account is open" }]],
        },
        {
          kind: "table",
          head: ["Data", "Kept for"],
          rows: [
            ["Call recordings", "90 days"],
            ["Invoices", "10 years"],
          ],
        },
      ],
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
      path.join(suite.artifactDir, `nsvx-device-${name}-${viewport.width}.png`),
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
          { match: { view: "desktopTasks" }, response: { tasks } },
          { match: { view: "desktopBots" }, response: { bots } },
          { match: { view: "memoryRecall" }, response: { bot_id: "clone", items: memories } },
          {
            match: { view: "memoryProfile" },
            response: { bot_id: "clone", items: memories.slice(0, 1) },
          },
          { match: { view: "skills" }, response: { items: skills } },
          {
            match: { view: "skillVersions" },
            response: { items: [{ version: "r7", updated_at: now }] },
          },
          {
            match: { view: "skill" },
            response: {
              ...skills[0],
              body: "Guarda a fatura na pasta do mês e avisa se faltar o NIF.",
              steps: ["Ler o PDF", "Escolher a pasta", "Confirmar o NIF"],
              content_hash: "h",
            },
          },
          {
            match: { view: "runtimeExecution" },
            response: {
              job_id: 42,
              attempts: [
                {
                  lease_epoch: 2,
                  kind: "send_message",
                  outcome: "done",
                  started_at: ago(5),
                  finished_at: ago(4),
                  executor_revision: "4bb0778",
                },
                {
                  lease_epoch: 1,
                  kind: "send_message",
                  outcome: "lease_lost",
                  started_at: ago(9),
                  finished_at: ago(8),
                  executor_revision: "68978f9",
                },
              ],
            },
          },
        ],
      },
      "nsvx.sync.overview": sync,
      "nsvx.health": health,
      "nsvx.legal": legal,
      "nsvx.desktop.jobs.stop": { ...tasks[0], stop_requested: true },
      "nsvx.desktop.jobs.stopAll": { stopped: 2 },
      "nsvx.desktop.bots.save": {
        id: "travel",
        version: 1,
        definition: bots[0]?.definition,
        updated_at: now,
      },
      "nsvx.desktop.memory.forget": { ok: true },
      "nsvx.desktop.memory.correct": { ok: true },
      "nsvx.sync.save": { entity: "tasks", staged: true },
      "nsvx.sync.promote": { id: "cmd-1" },
      "nsvx.sync.discard": { deleted: true },
      "nsvx.sync.confirm": { outbox_id: "o1" },
      ...overrides,
    },
  });
  await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&${query}`);
  return gateway;
}

suite.define(() => {
  it("runs the NSVX desktop natively: jobs, bots, memory, skills, and device sync", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const gateway = await mount(page, "tab=device");
        const surface = page.locator(".nsvx");
        const radio = (name: string) => surface.getByRole("radio", { name, exact: true });

        // Jobs: counts, live progress, one stop, then stop all after a second tap.
        const running = surface.getByRole("progressbar", { name: "Resumo da semana" });
        await running.waitFor();
        expect(await running.getAttribute("aria-valuenow")).toBe("62");
        await surface.getByRole("tab", { name: "Running: 1" }).waitFor();
        await capture(page, surface, "jobs", [running]);
        await surface.getByRole("button", { name: "Stop: Resumo da semana" }).click();
        expect((await gateway.waitForRequest("nsvx.desktop.jobs.stop")).params).toEqual({
          taskId: tasks[0]?.id,
        });
        await surface.getByRole("button", { name: "Stop all" }).click();
        await surface.getByRole("button", { name: "Stop all" }).click();
        await gateway.waitForRequest("nsvx.desktop.jobs.stopAll");

        // Bots: cards with NSVX avatars; a new bot gets an id from its name and version 0.
        await radio("Bots").click();
        await surface.getByRole("button", { name: "Edit: Finanças" }).waitFor();
        await surface.getByRole("button", { name: "New", exact: true }).click();
        const editor = surface.locator(".nsvx-dev__editor");
        await editor.getByLabel("Name").fill("Travel Helper");
        await editor.getByLabel("Group").fill("Pessoal");
        await editor.getByRole("radio", { name: "★" }).click();
        await capture(page, surface, "bots", [editor]);
        await editor.getByRole("button", { name: "Save" }).click();
        expect((await gateway.waitForRequest("nsvx.desktop.bots.save")).params).toEqual({
          botId: "travel-helper",
          baseVersion: 0,
          definition: {
            name: "Travel Helper",
            section: "Pessoal",
            description: "",
            persona: "",
            avatar: "★",
          },
        });

        // Memory: the first bot's recall, with level and match; forget asks once more.
        await radio("Memory").click();
        const snippet = surface.getByText("Prefere reuniões de manhã e respostas curtas.");
        await snippet.waitFor();
        await gateway.waitForRequest("nsvx.view", {
          match: { view: "memoryRecall", params: { bot: "clone" } },
        });
        await capture(page, surface, "memory", [snippet]);
        const first = surface.locator(".nsvx-dev__memory").first();
        await first.getByRole("button", { name: "Forget" }).click();
        await first.getByRole("button", { name: "Forget" }).click();
        expect((await gateway.waitForRequest("nsvx.desktop.memory.forget")).params).toEqual({
          botId: "clone",
          recordId: "m1",
        });
        await radio("Profile").click();
        await gateway.waitForRequest("nsvx.view", {
          match: { view: "memoryProfile", params: { bot: "clone" } },
        });

        // Skills: open one to read its current version and steps.
        await radio("Skills").click();
        await surface.getByRole("button", { name: /Arquivar faturas/ }).click();
        const step = surface.getByText("Confirmar o NIF", { exact: true });
        await step.waitFor();
        await capture(page, surface, "skills", [step]);

        // Sync: held tasks, drafts that send only after review, and new offline saves.
        await radio("Sync").click();
        const held = surface.getByText("Pedir orçamento ao canalizador");
        await held.waitFor();
        await capture(page, surface, "sync", [held]);
        await surface.getByRole("button", { name: "Create task" }).click();
        const promote = await gateway.waitForRequest("nsvx.sync.promote");
        expect(promote.params).toMatchObject({ taskId: sync.held[0]?.id });
        expect((promote.params as { idempotencyKey: string }).idempotencyKey).toMatch(
          /^[0-9a-f-]{36}$/,
        );
        await surface.getByRole("button", { name: "Review" }).click();
        await surface
          .getByRole("group", { name: "Review" })
          .getByRole("button", { name: "Send" })
          .click();
        expect((await gateway.waitForRequest("nsvx.sync.confirm")).params).toEqual({
          draftId: sync.drafts[0]?.id,
        });
        await surface.getByLabel("New task").fill("Comprar lâmpadas");
        await surface
          .locator(".nsvx-dev__card")
          .first()
          .getByRole("button", { name: "Save" })
          .click();
        expect((await gateway.waitForRequest("nsvx.sync.save")).params).toMatchObject({
          kind: "task",
          title: "Comprar lâmpadas",
        });
        await surface.getByRole("tab", { name: "People: 2" }).click();
        await surface.getByRole("button", { name: "Rename: Rui Costa" }).waitFor();
        expect(new URL(page.url()).searchParams.get("dev")).toBe("sync");
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("shows NSVX health, a job's attempts, and the legal pages natively", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const gateway = await mount(page, "tab=health");
        const surface = page.locator(".nsvx");
        await surface.getByText("Up · Ready").waitFor();
        await surface.getByText("Sign-in expires soon").waitFor();
        await surface.getByLabel("Job number").fill("42");
        await surface.getByRole("button", { name: "Show", exact: true }).click();
        await gateway.waitForRequest("nsvx.view", {
          match: { view: "runtimeExecution", params: { job_id: "42" } },
        });
        const attempt = surface.getByText("#2 · send_message");
        await attempt.waitFor();
        await capture(page, surface, "health", [attempt], attempt);

        await surface.getByRole("radio", { name: "Legal", exact: true }).click();
        expect((await gateway.waitForRequest("nsvx.legal")).params).toEqual({
          page: "privacy",
          lang: "en",
        });
        await surface.getByText("How long we keep data").click();
        const cell = surface.getByRole("cell", { name: "90 days" });
        await cell.waitFor();
        expect(await surface.getByRole("link", { name: "hi@nsvx.com" }).getAttribute("href")).toBe(
          "mailto:hi@nsvx.com",
        );
        await capture(page, surface, "legal", [cell], cell);
        await surface.getByRole("radio", { name: "Terms", exact: true }).click();
        await gateway.waitForRequest("nsvx.legal", { match: { page: "terms" } });
      },
    );
  });

  it("asks for the NSVX sign-in in Portuguese when the Gateway has none", async () => {
    await suite.withPage(
      { viewport: phone, locale: "pt-PT", serviceWorkers: "block" },
      async ({ page }) => {
        await mount(page, "tab=device&dev=bots", {
          "nsvx.view": {
            __mockError: {
              code: "unconfigured",
              message: "NSVX sign-in is not set up on this Gateway.",
            },
          },
        });
        const surface = page.locator(".nsvx");
        await surface.getByRole("radio", { name: "Bots", exact: true }).waitFor();
        await surface.getByRole("tab", { name: "Dispositivo" }).waitFor();
        const card = surface.locator(".nsvx-connect");
        await card.waitFor();
        expect(await surface.getByRole("button", { name: "Repetir" }).count()).toBe(1);
        if (process.env.OPENCLAW_CAPTURE_UI_PROOF === "1") {
          const frame = await takeControlUiScreenshotFrame(page, surface, [card], {
            animations: "disabled",
            viewport: phone,
          });
          await writeFile(path.join(suite.artifactDir, "nsvx-device-sign-in-390.png"), frame.png);
        }
      },
    );
  });
});
