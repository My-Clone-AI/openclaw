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
const suite = createControlUiE2eSuite({ name: "NSVX legal research marketing" });
const desktop = { width: 1280, height: 1000 };
const phone = { width: 390, height: 844 };
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HASH = "a".repeat(64);
const REF = "PROC-2026-0007";
// A 1x1 page image; layout comes from the CSS.
const PAGE = {
  src: "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
};

const METHODS = [
  "nsvx.view",
  "nsvx.status",
  "nsvx.cases.change",
  "nsvx.cases.upload",
  "nsvx.cases.file",
  "nsvx.procedures.change",
  "nsvx.research.change",
  "nsvx.research.file",
  "nsvx.marketing.change",
  "nsvx.marketing.gate",
  "nsvx.marketing.inventory",
];

// Synthetic payloads shaped like NSVX /api/cases, /api/procedures, /api/research, and the marketing admin.
const caseRow = {
  id: uuid(1),
  ref: REF,
  title: "Rendas em atraso, T2 Coimbra",
  status: "attention",
  nature: "potential",
  priority: "high",
  categories: ["renda"],
  stage: null,
  respondent: "Inquilino Exemplo",
  outstanding: "1950.00",
  verified_principal: "1300.00",
  evidence: 2,
  evidence_attention: 1,
  next_deadline: "2026-12-01",
  deadlines_unconfirmed: 1,
  deadlines_open: 2,
  updated_at: ago(60),
  legal_hold: true,
  ai_allowed: true,
};
const detail = {
  ...caseRow,
  description: "Rendas de setembro e outubro por pagar.",
  issue: "Rendas por pagar",
  jurisdiction: "PT",
  court: null,
  procedure: null,
  governing_law: null,
  external_ref: null,
  legal_rep: null,
  amount_claimed: null,
  amount_disputed: null,
  notes: null,
  outcome: null,
  revision: 4,
  summary: caseRow,
  parties: [
    {
      id: uuid(11),
      role: "respondent",
      name: "Inquilino Exemplo",
      kind: "person",
      identity_state: "unverified",
      contact: null,
    },
    {
      id: uuid(12),
      role: "claimant",
      name: "Titular",
      kind: "person",
      identity_state: "owner_confirmed",
      contact: null,
    },
  ],
  links: [],
  facts: [
    {
      id: uuid(13),
      text: "O contrato prevê 650 € por mês.",
      status: "confirmed",
      disputed: false,
      evidence_ids: [uuid(21)],
      codes: ["P1"],
    },
  ],
};
const vocab = {
  categories: { renda: { group: "Imóveis", label: "Rendas" }, tvde: { group: "TVDE", label: "Aluguer" } },
  priority: { normal: "Normal", high: "Alta", urgent: "Urgente" },
  party_roles: { respondent: "Requerido", claimant: "Requerente" },
  folders: { "01": "Contratos", "03": "Pagamentos" },
  evidence_types: { contract: "Contrato", spreadsheet: "Folha" },
  templates: {
    carta: { label: "Carta de interpelação", folder: "08", consequential: true },
    resumo: { label: "Resumo para advogado", folder: "09", consequential: false },
  },
  disclaimer: "Não substitui um advogado.",
};
const dashboard = {
  counts: { active: 3, attention: 1, waiting_docs: 1, resolved: 2, archived: 0, suggestions: 1 },
  outstanding: "1950.00",
  outstanding_verified: "1300.00",
  deadlines: [
    {
      id: uuid(31),
      ref: REF,
      title: "Enviar carta",
      kind: "task",
      due_date: "2026-12-01",
      verified: false,
    },
  ],
  documents_pending: [],
  discovery: { last_run: ago(600) },
};
const coverage = {
  accounts_total: 3,
  accounts_read: 2,
  note: "Sem movimentos não prova falta de pagamento.",
  windows: [],
};
const suggestion = {
  id: uuid(41),
  key: "renda-coimbra",
  title: "Possível dívida de rendas",
  categories: ["renda"],
  counterparty: "Inquilino Exemplo",
  context: "T2 Coimbra",
  status: "new",
  coverage: "medium",
  case_id: null,
  reasons: [{ kind: "ledger", text: "Sem pagamento depois de agosto." }],
  missing: ["Confirmar transferências"],
  evidence: [{ drive_file_id: "f1", name: "contrato.pdf", read: "read" }],
  metrics: {
    outstanding: { amount: "1300.00", estimate: true },
    oldest_unpaid: { date: "2026-09-08", days: 58 },
  },
};
const evidence = [
  {
    id: uuid(21),
    code: "P1",
    folder: "01",
    tags: [],
    exclude_from_ai: false,
    source: "drive",
    source_path: "/Imoveis/contrato.pdf",
    name: "contrato.pdf",
    mime: "application/pdf",
    size: 240_000,
    sha256: HASH,
    doc_date: "2026-01-10",
    author: null,
    type: "contract",
    description: null,
    location_ref: null,
    extraction_state: "extracted",
    source_state: "current",
    privileged: false,
    derivative_kind: null,
    has_text: true,
    previewable: true,
  },
  {
    id: uuid(22),
    code: "P2",
    folder: "03",
    tags: [],
    exclude_from_ai: false,
    source: "upload",
    source_path: null,
    name: "folha-rendas.xlsx",
    mime: "application/vnd.ms-excel",
    size: 12_000,
    sha256: HASH,
    doc_date: null,
    author: null,
    type: "spreadsheet",
    description: null,
    location_ref: null,
    extraction_state: "needs_ocr",
    source_state: "changed",
    privileged: true,
    derivative_kind: null,
    partition_required: true,
    has_text: false,
    previewable: false,
  },
];
const ledger = {
  obligations: [
    {
      id: uuid(51),
      description: "Renda de setembro",
      due_date: "2026-09-08",
      due_basis: "contract",
      amount: "650.00",
      paid: "0.00",
      outstanding: "650.00",
      status: "open",
      days_overdue: 58,
    },
  ],
  payments: [
    {
      id: uuid(52),
      kind: "payment",
      paid_on: "2026-08-08",
      amount: "650.00",
      method: "Transferência",
      source: "bank_tx",
      verified: true,
    },
  ],
  totals: {
    expected: "1950.00",
    received: "650.00",
    received_verified: "650.00",
    verified_outstanding: "1300.00",
    estimated_outstanding: "0.00",
    disputed: "0.00",
  },
  allocation_rule: "mais antiga primeiro",
  interest: { note: "Juros não calculados." },
  bank_coverage: coverage,
};
const lane = {
  label: "Claude Opus",
  eligible: true,
  reason: "",
  status: "ok",
  reset_at: null,
  billing: "Subscrição",
};
const manifest = {
  label: "Analisar processo",
  destination: "Subscrição Claude",
  web_search: false,
  items: [
    { evidence_id: uuid(21), code: "P1", name: "contrato.pdf", included: true, reason: null, chars: 9000 },
    { evidence_id: uuid(22), code: "P2", name: "folha-rendas.xlsx", included: false, reason: "Confidencial" },
  ],
  facts: 1,
  ledger: true,
  review_document: false,
  truncated: [],
  chars: 9000,
};
const aiRun = {
  id: uuid(61),
  action: "analisar",
  label: "Analisar processo",
  status: "awaiting_consent",
  params: {},
  manifest,
  manifest_sha256: HASH,
  output: null,
  error: null,
  created_at: ago(1),
};
const aiState = {
  ai_allowed: true,
  lane,
  actions: { analisar: "Analisar processo", legislacao: "Pesquisar legislação", responder: "Responder" },
  runs: [
    { ...aiRun, id: uuid(62), status: "done", output: "Falta confirmar a transferência de setembro." },
  ],
};
const document = {
  id: uuid(71),
  doc_type: "carta",
  title: "Carta de interpelação",
  version: 2,
  status: "draft",
  body: "## Carta\nExmo. Senhor,\n[A PREENCHER]",
  origin: "template",
  sha256: HASH,
  facts_used: [],
  created_at: ago(90),
  sections: ["Carta"],
  versions: [
    { id: uuid(71), version: 2, status: "draft", origin: "owner", at: ago(90) },
    { id: uuid(72), version: 1, status: "draft", origin: "template", at: ago(200) },
  ],
};
const procedure = {
  id: uuid(81),
  title: "Pedir recibos ao senhorio",
  version: 2,
  state: "enabled",
  outcome: "Recibos arquivados",
  definition: {
    outcome: "Recibos arquivados",
    inputs: { mes: { type: "text", example: "outubro", required: true } },
    preconditions: [],
    plan: { steps: [{ type: "message", purpose: "Pedir" }, { type: "document_file" }], completion_criteria: ["Recibo na Drive"] },
    trigger: { type: "manual" },
    limits: { max_attempts: 3 },
  },
  runs: [{ id: uuid(82), version: 2, state: "uncertain", reason: "Envio por confirmar", created_at: ago(30) }],
  versions: [{ version: 2, created_at: ago(30) }],
};
const job = {
  id: uuid(91),
  conversation_id: uuid(92),
  status: "pdf_ready",
  request_text: "Podes pesquisar os melhores ginásios em Coimbra?",
  prompt: "Pesquisa…",
  requester: {
    name: "Pessoa Exemplo",
    phone: "+351000000000",
    channel: "whatsapp",
    account: "Pessoal",
    thread_id: "t1",
  },
  runner_data: { model: "gpt-6.1", mode: "deep", account: "acct-a" },
  pdf: { name: "estudo.pdf", pages: 12, bytes: 900_000 },
  delivery_status: "draft",
  cover_message: "Aqui está o estudo.",
  outbox_id: null,
  reason: null,
  events: [
    { status: "detected", detail: null, at: ago(120) },
    { status: "researching", detail: null, at: ago(100) },
    { status: "pdf_ready", detail: "12 páginas", at: ago(5) },
  ],
};
const stuck = {
  ...job,
  id: uuid(93),
  status: "waiting_chatgpt_login",
  pdf: null,
  reason: "Ligar a conta acct-a",
  next_attempt_at: new Date(Date.now() + 3_600_000).toISOString(),
  requester: { ...job.requester, name: "Outra Pessoa", channel: "telegram" },
};
const researchSettings = {
  setting: { enabled: true, mode: "blocklist", contacts: ["identity:1"], revision: 3, account_scope: "owner" },
  requested_scope: "owner",
  environment: "development",
  effective_enabled: false,
  inherited: false,
  accounts: [{ id: uuid(94), label: "Pessoal", channel: "whatsapp" }],
  contacts: [
    { key: "identity:1", name: "Ana" },
    { key: "identity:2", name: "Rui" },
  ],
  history: [
    { id: 1, source: "Pesquisas settings", at: ago(500), value: { enabled: true, mode: "blocklist", contacts: ["identity:1"] } },
  ],
};
const marketing = {
  overview: {
    dry_run: true,
    live_publish: false,
    live_block: "Ensaio global",
    development: true,
    cadence_hours: 6,
    horizon_hours: 48,
    slots: 8,
    active_jobs: 2,
    paused_campaigns: 1,
    worker: { configured: true, health: { ok: true, admission: "ready", models: { image: "FLUX.3", video: "LTX 2.5" } } },
  },
  gate: {
    live_allowed: false,
    killed: false,
    dry_run: true,
    activations: [
      { app: "openfly", armed: true, mode: "dry_run" },
      { app: "openhome", armed: false, mode: "off" },
      { app: "openlove", armed: true, mode: "dry_run" },
    ],
  },
  brands: {
    brands: [
      { app: "openfly", name: "openfly", domain: "openfly.example", logo: "logo.svg" },
      { app: "openlove", name: "openlove", domain: null, logo: null },
    ],
  },
  calendar: {
    items: [
      {
        id: "s1",
        app_id: "openfly",
        slot: new Date(Date.now() + 3_600_000).toISOString(),
        state: "planned",
        content_id: "c1",
        kind: "image",
        caption: "Voos baratos para o Porto",
        job_id: "j1",
        job_state: "done",
      },
      { id: "s2", app_id: "openxxx", slot: ago(0), state: "planned", content_id: null, kind: null, caption: "hidden-adult", job_id: null, job_state: null },
    ],
  },
  channels: {
    matrix: {
      networks: [
        { code: "instagram", label: "Instagram" },
        { code: "x", label: "X" },
        { code: "tumblr", label: "Tumblr" },
      ],
      apps: [
        {
          app: "openfly",
          cells: {
            instagram: { status: "connected", account_handle: "@openfly", publish_mode: "dry_run", last_ok_at: ago(30) },
            x: { status: "pending", setup_steps_done: 2, setup_steps_total: 4 },
            tumblr: { status: "failed", blocked_label: "Token expirado" },
          },
        },
        { app: "openlove", cells: {} },
      ],
    },
  },
  analytics: {
    jobs: { done: 14, failed: 2 },
    posts: { dry_run: 30, published: 0 },
    schedule: {},
  },
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
      path.join(suite.artifactDir, `nsvx-${name}-${viewport.width}.png`),
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
          { match: { view: "casesDashboard" }, response: dashboard },
          { match: { view: "casesVocab" }, response: vocab },
          { match: { view: "cases" }, response: { cases: [caseRow] } },
          {
            match: { view: "caseSuggestions" },
            response: { suggestions: [suggestion], last_run: { at: ago(600) }, bank_coverage: coverage },
          },
          {
            match: { view: "caseSettings" },
            response: { attention_days: 30, discovery_enabled: true, bank_coverage: coverage, ai: lane },
          },
          { match: { view: "case" }, response: detail },
          {
            match: { view: "caseTimeline" },
            response: {
              events: [
                { id: uuid(14), date: "2026-09-08", precision: "day", title: "Renda não paga", status: "owner", evidence_ids: [], codes: ["P1"], auto: false },
                { id: uuid(15), date: null, precision: "unknown", title: "Contrato assinado", status: "extracted", evidence_ids: [], codes: [], auto: true },
              ],
            },
          },
          {
            match: { view: "caseEvidence" },
            response: {
              evidence,
              folders: [
                { code: "01", label: "Contratos", count: 1 },
                { code: "03", label: "Pagamentos", count: 1 },
                { code: "05", label: "Vazia", count: 0 },
              ],
            },
          },
          { match: { view: "caseProofPage" }, response: PAGE },
          { match: { view: "caseProofPages" }, response: { pages: 2, mime: "application/pdf" } },
          { match: { view: "caseProofText" }, response: { pages: [{ ref: "p. 1", text: "Renda mensal de 650 €" }] } },
          {
            match: { view: "caseProof" },
            response: {
              ...evidence[0],
              custody: [{ at: ago(600), actor: "owner", event: "imported" }],
              annotations: [{ id: uuid(16), text: "Cláusula 3", at: ago(100) }],
            },
          },
          { match: { view: "casePayments" }, response: ledger },
          {
            match: { view: "caseBank" },
            response: {
              candidates: [
                { id: 77, date: "2026-10-08", amount: "650.00", counterparty: "Inquilino", description: "TRF", account: "CGD", reasons: ["nome"], used_in: null },
              ],
              coverage,
            },
          },
          { match: { view: "caseDocuments" }, response: { documents: [document] } },
          { match: { view: "caseDocument" }, response: document },
          { match: { view: "caseAi" }, response: aiState },
          { match: { view: "caseRunMaterial" }, response: { text: "Material enviado" } },
          {
            match: { view: "caseResearch" },
            response: {
              research: [
                { id: uuid(17), title: "Código Civil, art. 1041", url: "https://dre.example/cc", law_ref: "art. 1041", version_note: null, verified: false, added_by: "ai" },
                { id: uuid(18), title: "Fonte sem ligação segura", url: "javascript:alert(1)", law_ref: null, version_note: null, verified: true, added_by: "owner" },
              ],
              official_sources: [{ name: "Diário da República", url: "https://dre.example" }],
            },
          },
          {
            match: { view: "caseDeadlines" },
            response: {
              deadlines: [
                { id: uuid(31), title: "Enviar carta", kind: "task", due_date: "2026-12-01", verified: false, basis: null, status: "open" },
                { id: uuid(32), title: "Prazo de oposição", kind: "legal_deadline", due_date: null, verified: false, basis: null, status: "open" },
              ],
            },
          },
          { match: { view: "caseExports" }, response: { exports: [], pending: false, last_error: null } },
          {
            match: { view: "caseHistory" },
            response: { history: [{ at: ago(10), actor: "owner", action: "case.updated" }] },
          },
          { match: { view: "procedures" }, response: { items: [procedure] } },
          { match: { view: "procedure" }, response: procedure },
          { match: { view: "missions" }, response: [] },
          {
            match: { view: "procedureRun" },
            response: { ...procedure.runs[0], steps: [{ id: "s1", type: "message", state: "uncertain" }] },
          },
          {
            match: { view: "procedureReconcile" },
            response: { steps_total: 2, steps_done: 1, partial: true, uncertain: true, can_resume: false, resume_blocker: "Confirmar o envio primeiro" },
          },
          { match: { view: "research" }, response: { jobs: [job, stuck] } },
          { match: { view: "researchJob" }, response: job },
          { match: { view: "researchSettings" }, response: researchSettings },
          { match: { view: "marketingOverview" }, response: marketing.overview },
          { match: { view: "marketingGate" }, response: marketing.gate },
          { match: { view: "marketingBrands" }, response: marketing.brands },
          { match: { view: "marketingCalendar" }, response: marketing.calendar },
          { match: { view: "marketingChannels" }, response: marketing.channels },
          { match: { view: "marketingAnalytics" }, response: marketing.analytics },
        ],
      },
      "nsvx.cases.change": {
        cases: [
          { match: { action: "create" }, response: { ...detail, ref: "PROC-2026-0008" } },
          { match: { action: "aiPrepare" }, response: aiRun },
          { match: { action: "aiAuthorize" }, response: { ...aiRun, status: "queued" } },
          { match: { action: "update" }, response: detail },
          { match: { action: "setDeadline" }, response: {} },
          { match: { action: "suggestionStatus" }, response: suggestion },
          { match: { action: "addPayment" }, response: {} },
          { match: { action: "proofDerive" }, response: { evidence_id: uuid(21), code: "P3" } },
          { match: { action: "docStatus" }, response: {} },
        ],
      },
      "nsvx.cases.upload": { results: [{ name: "novo.pdf", code: "P3" }] },
      "nsvx.procedures.change": { id: uuid(83), version: 2, state: "queued", created_at: ago(0) },
      "nsvx.research.change": job,
      "nsvx.research.file": { fileName: "estudo.pdf", mime: "application/pdf", data: "JVBERi0=" },
      "nsvx.marketing.change": {
        cases: [
          { match: { action: "preview" }, response: { ok: true, body: "Voos baratos #openfly", codes: [] } },
          { match: { action: "generate" }, response: { id: "j9", state: "queued", app_id: "openfly", content_id: "c9" } },
          { match: { action: "publish" }, response: { state: "dry_run" } },
        ],
      },
      "nsvx.marketing.gate": { live_allowed: false, killed: true, dry_run: true },
      "nsvx.marketing.inventory": { fileName: "social-accounts-inventory.md", mime: "text/markdown", data: "IyBB" },
      ...overrides,
    },
  });
  await page.goto(`${suite.server.baseUrl}plugin?plugin=nsvx&id=nsvx&${query}`);
  return gateway;
}

suite.define(() => {
  it("shows the case list, opens suggestions, and makes a case", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const gateway = await mount(page, "tab=legal");
        const surface = page.locator(".nsvx");
        const row = surface.getByRole("button", { name: /Rendas em atraso/ });
        await row.waitFor();
        await surface.getByText(/1,300/).first().waitFor();
        await capture(page, surface, "legal-cases", [row]);

        await surface.getByRole("radio", { name: "Suggestions" }).click();
        const card = surface.getByText("Possível dívida de rendas");
        await card.waitFor();
        await capture(page, surface, "legal-suggestions", [card]);
        await surface.getByRole("button", { name: "Look", exact: true }).click();
        await surface.getByText("Sem pagamento depois de agosto.").waitFor();
        expect(
          (await gateway.waitForRequest("nsvx.cases.change", { match: { action: "suggestionStatus" } }))
            .params,
        ).toMatchObject({ id: uuid(41), status: "reviewing" });

        await surface.getByRole("button", { name: "New", exact: true }).click();
        await surface.getByLabel("Title").fill("Caução por devolver");
        await surface.getByRole("button", { name: "Rendas" }).click();
        await surface.getByRole("button", { name: "Create", exact: true }).click();
        expect(
          (await gateway.waitForRequest("nsvx.cases.change", { match: { action: "create" } })).params,
        ).toMatchObject({ title: "Caução por devolver", categories: ["renda"], nature: "potential" });
        await surface.getByRole("radio", { name: "Timeline" }).waitFor();
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("works one case: summary, timeline, evidence, money, documents, deadlines", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const gateway = await mount(page, `tab=legal&case=${REF}`);
        const surface = page.locator(".nsvx");
        const section = (name: string) => surface.getByRole("radio", { name, exact: true }).click();
        const fact = surface.getByText("O contrato prevê 650 € por mês.");
        await fact.waitFor();
        await capture(page, surface, "legal-summary", [fact]);
        await surface.getByRole("switch", { name: "Legal hold (keep evidence)" }).click();
        expect(
          (await gateway.waitForRequest("nsvx.cases.change", { match: { action: "update" } })).params,
        ).toMatchObject({ key: REF, revision: 4, legal_hold: false });

        await section("Timeline");
        const event = surface.getByText("Renda não paga");
        await event.waitFor();
        await capture(page, surface, "legal-timeline", [event]);

        await section("Evidence");
        const proof = surface.getByRole("button", { name: /contrato\.pdf/ });
        await proof.waitFor();
        await surface.getByText("Private").waitFor();
        await capture(page, surface, "legal-evidence", [proof]);
        await surface.getByLabel("Upload").setInputFiles({
          name: "novo.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("pdf"),
        });
        const upload = await gateway.waitForRequest("nsvx.cases.upload");
        expect(upload.params).toMatchObject({
          key: REF,
          files: [{ name: "novo.pdf", mime: "application/pdf", data: "cGRm" }],
        });
        await surface.getByText("Added").waitFor();
        await proof.click();
        await surface.getByRole("radio", { name: "See", exact: true }).waitFor();
        const pageImage = surface.locator(".nsvx-of__page img");
        await pageImage.waitFor();
        await surface.getByRole("button", { name: "Redact" }).click();
        await pageImage.evaluate((image) => {
          image.style.height = "400px";
        });
        await surface.locator(".nsvx-of__page").scrollIntoViewIfNeeded();
        const box = await surface.locator(".nsvx-of__page").boundingBox();
        await page.mouse.move((box?.x ?? 0) + 20, (box?.y ?? 0) + 20);
        await page.mouse.down();
        await page.mouse.move((box?.x ?? 0) + 200, (box?.y ?? 0) + 120);
        await page.mouse.up();
        await surface.getByRole("button", { name: "Save as new proof" }).click();
        const derive = await gateway.waitForRequest("nsvx.cases.change", {
          match: { action: "proofDerive" },
        });
        expect(derive.params).toMatchObject({ evidenceId: uuid(21), kind: "redaction", page: 1 });
        await capture(page, surface, "legal-viewer", [pageImage]);
        await surface.getByRole("radio", { name: "Text", exact: true }).click();
        await surface.getByText("Renda mensal de 650 €").waitFor();
        await surface.getByRole("radio", { name: "Details", exact: true }).click();
        await surface.getByText("Cláusula 3").waitFor();
        await surface.getByRole("button", { name: "Back", exact: true }).last().click();

        await section("Payments");
        const obligation = surface.getByText("Renda de setembro");
        await obligation.waitFor();
        await capture(page, surface, "legal-money", [obligation]);
        await surface.getByRole("button", { name: "From bank" }).click();
        await surface.getByRole("button", { name: "Link", exact: true }).click();
        expect(
          (await gateway.waitForRequest("nsvx.cases.change", { match: { action: "addPayment" } })).params,
        ).toMatchObject({ amount: "650.00", finance_tx_id: 77, verified: true });

        await section("Documents");
        await surface.getByRole("button", { name: /Carta de interpelação/ }).click();
        const editor = surface.getByLabel("Text", { exact: true });
        await editor.waitFor();
        await capture(page, surface, "legal-document", [editor]);
        await surface.getByRole("button", { name: "Sent", exact: true }).click();
        await surface.getByText("Keep").waitFor();
        await surface.getByRole("button", { name: /Only records it/ }).click();
        expect(
          (await gateway.waitForRequest("nsvx.cases.change", { match: { action: "docStatus" } })).params,
        ).toMatchObject({ documentId: uuid(71), status: "sent" });
        await surface.getByRole("button", { name: "Back", exact: true }).last().click();

        await section("Deadlines");
        const deadline = surface.getByText("Prazo de oposição");
        await deadline.waitFor();
        await capture(page, surface, "legal-deadlines", [deadline]);
        await surface.getByRole("checkbox", { name: "Enviar carta" }).click();
        expect(
          (await gateway.waitForRequest("nsvx.cases.change", { match: { action: "setDeadline" } })).params,
        ).toMatchObject({ deadlineId: uuid(31), status: "done" });

        await section("History");
        await surface.getByText("case.updated").waitFor();
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("sends nothing to the legal AI until the listed material is authorized", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const gateway = await mount(page, `tab=legal&case=${REF}&caseTab=ai`);
        const surface = page.locator(".nsvx");
        const action = surface.getByRole("button", { name: "Analisar processo", exact: true });
        await action.waitFor();
        await surface.getByText("Falta confirmar a transferência de setembro.").waitFor();
        // The answer takes real height, or it reads as blank.
        expect(
          await surface.locator(".nsvx-of__mono").first().evaluate((node) => node.clientHeight),
        ).toBeGreaterThan(30);
        await capture(page, surface, "legal-ai", [action]);
        // A law source with an unsafe address stays plain text.
        await surface.getByRole("link", { name: "Código Civil, art. 1041" }).waitFor();
        await surface.getByText("Fonte sem ligação segura").waitFor();
        expect(await surface.getByRole("link", { name: "Fonte sem ligação segura" }).count()).toBe(0);

        await action.click();
        const authorize = surface.getByRole("button", { name: "Authorize" });
        await authorize.waitFor();
        await surface.getByText("Confidencial").waitFor();
        await capture(page, surface, "legal-ai-consent", [authorize]);
        expect(
          (await gateway.waitForRequest("nsvx.cases.change", { match: { action: "aiPrepare" } })).params,
        ).toMatchObject({ key: REF, ai: "analisar" });
        await authorize.click();
        expect(
          (await gateway.waitForRequest("nsvx.cases.change", { match: { action: "aiAuthorize" } })).params,
        ).toEqual({ action: "aiAuthorize", runId: uuid(61), manifest_sha256: HASH });
      },
    );
  });

  it("runs a routine with one key per request and refuses to resume an uncertain step", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const gateway = await mount(page, "tab=legal&legal=procedures");
        const surface = page.locator(".nsvx");
        const row = surface.getByRole("button", { name: /Pedir recibos ao senhorio/ });
        await row.waitFor();
        await capture(page, surface, "legal-procedures", [row]);
        await row.click();
        await surface.getByRole("button", { name: "Run", exact: true }).click();
        const run = await gateway.waitForRequest("nsvx.procedures.change", { match: { action: "run" } });
        expect(run.params).toMatchObject({ id: uuid(81), version: 2, inputs: { mes: "outubro" } });
        expect((run.params as { clientKey: string }).clientKey).toMatch(/^[0-9a-f-]{36}$/);
        await surface.getByRole("button", { name: /To confirm/ }).click();
        await surface.getByText("Confirmar o envio primeiro").waitFor();
        expect(await surface.getByRole("button", { name: "Resume" }).count()).toBe(0);
        await capture(page, surface, "legal-procedure", [surface.getByText("Confirmar o envio primeiro")]);
      },
    );
  });

  it("lists research, shows one job, and asks before it sends", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const gateway = await mount(page, "tab=research");
        const surface = page.locator(".nsvx");
        const row = surface.getByRole("button", { name: /Pessoa Exemplo/ });
        await row.waitFor();
        await surface.getByText("Ligar a conta acct-a").waitFor();
        await capture(page, surface, "research-list", [row]);

        await surface.getByRole("button", { name: "Settings" }).click();
        await surface.getByRole("switch", { name: /Automatic delivery/ }).waitFor();
        await surface.getByText(/Nothing sends here/).waitFor();
        await capture(page, surface, "research-settings", [surface.getByText(/Nothing sends here/)]);
        await surface.getByRole("switch", { name: "Rui" }).click();
        await surface.getByRole("button", { name: "Save", exact: true }).click();
        expect(
          (await gateway.waitForRequest("nsvx.research.change", { match: { action: "settings" } })).params,
        ).toMatchObject({ enabled: true, mode: "blocklist", contacts: ["identity:1", "identity:2"], accountId: null });
        await surface.getByRole("button", { name: "Settings" }).click();

        await row.click();
        const send = surface.getByRole("button", { name: "Send", exact: true });
        await send.waitFor();
        await surface.getByText("Podes pesquisar os melhores ginásios em Coimbra?").waitFor();
        await capture(page, surface, "research-job", [send]);
        await send.click();
        await surface.getByRole("button", { name: "Send to this person?" }).click();
        expect(
          (await gateway.waitForRequest("nsvx.research.change", { match: { action: "send" } })).params,
        ).toEqual({ action: "send", id: uuid(91) });
        await surface.getByRole("button", { name: /PDF · 12 pages/ }).click();
        expect((await gateway.waitForRequest("nsvx.research.file")).params).toEqual({ id: uuid(91) });
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("runs marketing: switches with a reason, create, calendar, accounts, report, no adult apps", async () => {
    await suite.withPage(
      { viewport: desktop, locale: "en-US", serviceWorkers: "block" },
      async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const gateway = await mount(page, "tab=marketing");
        const surface = page.locator(".nsvx");
        const section = (name: string) => surface.getByRole("radio", { name, exact: true }).click();
        const mode = surface.getByText("Test only, nothing goes out");
        await mode.waitFor();
        await surface.getByText("openfly", { exact: true }).waitFor();
        await capture(page, surface, "marketing-overview", [mode]);
        expect(await surface.getByText("openlove").count()).toBe(0);
        // A switch stays shut until there is a reason.
        const stop = surface.getByRole("button", { name: "Stop all" });
        expect(await stop.isDisabled()).toBe(true);
        await surface.getByLabel("Why").fill("too many errors");
        await stop.click();
        await surface.getByRole("button", { name: "Stop all" }).click();
        expect((await gateway.waitForRequest("nsvx.marketing.gate")).params).toEqual({
          killed: true,
          reason: "too many errors",
        });

        await section("Create");
        const create = surface.getByRole("button", { name: "Create", exact: true });
        await create.waitFor();
        await surface.getByLabel("What should it show?").fill("Voos baratos");
        await surface.getByRole("button", { name: "Preview" }).click();
        await surface.getByText("Voos baratos #openfly").waitFor();
        await create.click();
        expect(
          (await gateway.waitForRequest("nsvx.marketing.change", { match: { action: "generate" } })).params,
        ).toMatchObject({ app: "openfly", kind: "image", brief: "Voos baratos" });
        const publish = surface.getByRole("button", { name: "Publish", exact: true });
        await publish.waitFor();
        await capture(page, surface, "marketing-create", [publish]);
        await publish.click();
        await surface.getByRole("button", { name: "Publish now?" }).click();
        expect(
          (await gateway.waitForRequest("nsvx.marketing.change", { match: { action: "publish" } })).params,
        ).toEqual({ action: "publish", contentId: "c9" });

        await section("Calendar");
        const slot = surface.getByText("Voos baratos para o Porto");
        await slot.waitFor();
        expect(await surface.getByText("hidden-adult").count()).toBe(0);
        await capture(page, surface, "marketing-calendar", [slot]);

        await section("Accounts");
        const cell = surface.getByRole("button", { name: /Instagram: Connected/ });
        await cell.waitFor();
        expect(await surface.getByText("openlove").count()).toBe(0);
        await capture(page, surface, "marketing-accounts", [cell]);
        await cell.click();
        await surface.getByText("@openfly").waitFor();
        await surface.getByRole("button", { name: "MD", exact: true }).click();
        expect((await gateway.waitForRequest("nsvx.marketing.inventory")).params).toEqual({ format: "md" });

        await section("Report");
        const report = surface.getByText("Attempts");
        await report.waitFor();
        await capture(page, surface, "marketing-report", [report]);
        expect(pageErrors).toEqual([]);
      },
    );
  });

  it("speaks Portuguese on a phone and asks for the NSVX sign-in when the Gateway has none", async () => {
    await suite.withPage(
      { viewport: phone, locale: "pt-PT", serviceWorkers: "block" },
      async ({ page }) => {
        await mount(page, "tab=legal", {
          "nsvx.view": {
            __mockError: { code: "unconfigured", message: "NSVX owner sign-in is not set up on this Gateway." },
          },
        });
        const surface = page.locator(".nsvx");
        const card = surface.locator(".nsvx-connect").first();
        await card.waitFor();
        await surface.getByRole("radio", { name: "Procedimentos", exact: true }).waitFor();
        if (process.env.OPENCLAW_CAPTURE_UI_PROOF === "1") {
          const frame = await takeControlUiScreenshotFrame(page, surface, [card], {
            animations: "disabled",
            viewport: phone,
          });
          await writeFile(path.join(suite.artifactDir, "nsvx-legal-sign-in-390.png"), frame.png);
        }
      },
    );
  });

  it("keeps the phone layout inside the screen on every tab", async () => {
    await suite.withPage(
      { viewport: phone, locale: "pt-PT", serviceWorkers: "block" },
      async ({ page }) => {
        for (const [query, ready] of [
          ["tab=legal", /Rendas em atraso/],
          [`tab=legal&case=${REF}&caseTab=money`, /Renda de setembro/],
          ["tab=research", /Pessoa Exemplo/],
          ["tab=marketing&marketing=accounts", /Instagram/],
        ] as const) {
          await mount(page, query);
          await page.locator(".nsvx").getByText(ready).first().waitFor();
          const overflow = await page.evaluate(
            () => document.querySelector(".nsvx")!.scrollWidth - document.querySelector(".nsvx")!.clientWidth,
          );
          expect(overflow, query).toBeLessThanOrEqual(1);
        }
      },
    );
  });
});
