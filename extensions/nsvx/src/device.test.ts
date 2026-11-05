import { describe, expect, it } from "vitest";
import { createNsvxClient } from "./client.js";
import {
  createNsvxDeviceTool,
  keyFor,
  parseLegal,
  projectSync,
  readHealth,
  saveOffline,
} from "./device.js";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Call = { url: string; init: RequestInit };

/** NSVX double: `/api/auth/state` hands out a CSRF token; every other path answers from `routes`. */
function nsvx(routes: Record<string, () => Response>, ownerSession: string | undefined = "s") {
  const calls: Call[] = [];
  const client = createNsvxClient({
    baseUrl: "https://nsvx.test",
    token: undefined,
    ownerSession,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      const path = url.slice("https://nsvx.test".length);
      if (path === "/api/auth/state") {
        return json(200, { authenticated: true, csrf: "csrf-1" });
      }
      const route = routes[`${init.method} ${path}`];
      if (!route) {
        throw new Error(`unexpected ${init.method} ${path}`);
      }
      return route();
    },
  });
  const writes = () => calls.filter((call) => call.init.method !== "GET");
  return { client, calls, writes };
}

const KEY = "0b7f2c8e-2f43-4d6c-9c2a-6a3c1f0d9e11";
const CONVERSATION = "9d4f5c1e-8a2b-4c3d-9e8f-1a2b3c4d5e6f";

describe("offline sync", () => {
  it("sends each change as NSVX's own replay record with the caller's key and time", async () => {
    const { client, writes } = nsvx({ "POST /api/sync/mutations": () => json(200, { ok: 1 }) });
    await saveOffline(client, {
      kind: "draft",
      conversationId: CONVERSATION,
      text: "Chego às 5",
      idempotencyKey: KEY,
      createdAt: "2026-11-05T10:00:00.000Z",
    });
    const [call] = writes();
    expect(call?.init.headers).toMatchObject({ "X-CSRF-Token": "csrf-1" });
    expect(JSON.parse(call?.init.body as string)).toEqual({
      idempotency_key: KEY,
      created_at: "2026-11-05T10:00:00.000Z",
      entity: "replies",
      op: "draft",
      payload: { conversation_id: CONVERSATION, text: "Chego às 5" },
    });
    // Commands, sends, and captures are not replayable changes here.
    await expect(saveOffline(client, { kind: "send", idempotencyKey: KEY })).rejects.toMatchObject({
      kind: "invalid",
    });
    expect(writes()).toHaveLength(1);
  });

  it("keeps held tasks apart and names each draft's chat without shipping message history", () => {
    const sync = projectSync({
      cursor: "v1:abc",
      collections: {
        conversations: [
          { id: CONVERSATION, title: "Ana", channel: "whatsapp", messages: [{ body: "olá" }] },
        ],
        tasks: [
          { id: "t1", title: "Pagar IMI", status: "held", description: "", updated_at: "x" },
          { id: "t2", title: "Ligar ao banco", status: "open", version: 3, updated_at: "y" },
        ],
        drafts: [{ id: "d1", conversation_id: CONVERSATION, text: "Já vou", created_at: "z" }],
      },
    });
    expect(sync.held.map((task) => task.id)).toEqual(["t1"]);
    expect(sync.tasks).toEqual([
      { id: "t2", title: "Ligar ao banco", status: "open", version: "3" },
    ]);
    expect(sync.drafts[0]).toMatchObject({ conversation: "Ana", channel: "whatsapp" });
    expect(JSON.stringify(sync)).not.toContain("olá");
    expect(sync.counts).toMatchObject({ conversations: 1, tasks: 2, drafts: 1, missions: 0 });
  });
});

describe("nsvx_device", () => {
  it("is owner-only, and a replayed promote reuses one NSVX receipt key", async () => {
    const { client, writes } = nsvx({
      "POST /api/sync/tasks/0b7f2c8e-2f43-4d6c-9c2a-6a3c1f0d9e11/promote": () =>
        json(200, { id: "cmd-1" }),
    });
    const params = { action: "promote", taskId: KEY };
    const stranger = createNsvxDeviceTool(client, { senderIsOwner: false });
    expect(JSON.stringify(await stranger.execute("call-1", params))).toContain("denied");
    expect(writes()).toHaveLength(0);
    const owner = createNsvxDeviceTool(client, { senderIsOwner: true });
    await owner.execute("call-1", params);
    await owner.execute("call-1", params);
    const keys = writes().map(
      (call) => (call.init.headers as Record<string, string>)["Idempotency-Key"],
    );
    expect(keys).toEqual([keyFor("openclaw-call-1"), keyFor("openclaw-call-1")]);
    expect(keys[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("health", () => {
  it("reads a not-ready answer as data and keeps a failed probe unknown", async () => {
    const { client, calls } = nsvx({
      "GET /healthz": () =>
        json(200, { ok: true, revision: "abc1234def", contracts: { commands: 3 } }),
      "GET /readyz": () =>
        json(503, {
          ready: false,
          failing: ["migrations"],
          checks: { database: true, migrations: false },
          capabilities: { failed: [] },
          release: { digest: "d1" },
        }),
      "GET /runtimez": () => json(500, {}),
    });
    const health = await readHealth(client);
    expect(health.live).toMatchObject({ ok: true, revision: "abc1234def" });
    expect(health.ready).toMatchObject({ ready: false, failing: ["migrations"], digest: "d1" });
    expect(health.runtime).toBeNull();
    // The owner session only adds detail to the public probes.
    expect(calls[0]?.init.headers).toMatchObject({ Cookie: "clone_session=s" });
  });

  it("says NSVX is offline when no probe answers", async () => {
    const { client } = nsvx({});
    await expect(readHealth(client)).rejects.toMatchObject({ kind: "offline" });
  });
});

it("reads NSVX's legal HTML into blocks, keeping mail links and dropping site links", () => {
  const page = parseLegal(`<!doctype html><main id="main"><h1>Pol&iacute;tica de Privacidade</h1>
<p class="muted">Última atualização: <time datetime="2026-10-20">20 de outubro de 2026</time> · Versão 3</p>
<section aria-labelledby="who"><h2 id="who">Quem somos</h2><p>Escreve para <a href="mailto:hi@nsvx.com">hi@nsvx.com</a> ou usa o <a href="/contacto">formulário</a>.</p>
<ul><li><strong>Dados</strong> &amp; contas</li><li>Só cookies essenciais</li></ul></section>
<section aria-labelledby="keep"><h2 id="keep">Prazos</h2><table><thead><tr><th>Dados</th><th>Prazo</th></tr></thead><tbody><tr><td data-label="Dados">Mensagens</td><td data-label="Prazo">2 anos</td></tr></tbody></table></section>
</main>`);
  expect(page.updated).toBe("Última atualização: 20 de outubro de 2026 · Versão 3");
  expect(page.sections.map((s) => s.id)).toEqual(["who", "keep"]);
  expect(page.sections[0]?.blocks).toEqual([
    {
      kind: "p",
      runs: [
        { text: "Escreve para " },
        { text: "hi@nsvx.com", href: "mailto:hi@nsvx.com" },
        { text: " ou usa o " },
        { text: "formulário" },
        { text: "." },
      ],
    },
    {
      kind: "list",
      items: [
        [{ text: "Dados", strong: true }, { text: " & contas" }],
        [{ text: "Só cookies essenciais" }],
      ],
    },
  ]);
  expect(page.sections[1]?.blocks).toEqual([
    { kind: "table", head: ["Dados", "Prazo"], rows: [["Mensagens", "2 anos"]] },
  ]);
  expect(() => parseLegal("<html><body>maintenance</body></html>")).toThrow(/layout/);
});
