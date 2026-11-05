import { describe, expect, it, vi } from "vitest";
import { createNsvxClient, type NsvxErrorKind } from "./client.js";
import { detectPasted, isPreparing } from "./messages-data.js";
import { sendReply, setTakeover, startQuickReply, waitForQuickReply } from "./messages.js";
import { createNsvxMessagesTool } from "./tools.js";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Call = { url: string; method: string; headers: Record<string, string>; body?: unknown };

/** A fake NSVX: answers by method and path, records every call. */
function fakeNsvx(routes: Record<string, (call: Call) => Response>) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    const call: Call = {
      url,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    };
    calls.push(call);
    const route = routes[`${call.method} ${new URL(url).pathname}`];
    return route ? route(call) : json(404, { detail: "missing" });
  });
  const client = createNsvxClient({
    baseUrl: "https://nsvx.test",
    token: undefined,
    ownerSession: "session-1",
    fetchImpl,
  });
  return { client, calls };
}

const signedIn = () => json(200, { authenticated: true, csrf: "csrf-1" });

async function kindOf(run: Promise<unknown>): Promise<NsvxErrorKind | undefined> {
  return run.then(
    () => undefined,
    (cause: unknown) => (cause as { kind: NsvxErrorKind }).kind,
  );
}

describe("nsvx messages", () => {
  it("sends the owner's reply with the session's CSRF token and the caller's key", async () => {
    const { client, calls } = fakeNsvx({
      "GET /api/auth/state": signedIn,
      "POST /api/conversations/c1/reply": () =>
        json(200, { ok: true, outbox_id: "o1", state: "approved" }),
    });
    await sendReply(client, {
      conversationId: "c1",
      text: "On my way",
      idempotencyKey: "key-12345",
    });
    const post = calls[1];
    expect(post?.headers).toMatchObject({
      Cookie: "clone_session=session-1",
      "X-CSRF-Token": "csrf-1",
    });
    expect(post?.body).toEqual({
      text: "On my way",
      attachment_ids: [],
      idempotency_key: "key-12345",
      reply_to_message_id: null,
    });
  });

  it("refuses before NSVX on bad input and when NSVX ended the session", async () => {
    const { client, calls } = fakeNsvx({
      "GET /api/auth/state": () => json(200, { authenticated: false, csrf: null }),
    });
    expect(
      await kindOf(sendReply(client, { conversationId: "c1", text: " ", idempotencyKey: "k" })),
    ).toBe("invalid");
    expect(await kindOf(setTakeover(client, { conversationId: "c1", minutes: 45 }))).toBe(
      "invalid",
    );
    expect(calls).toHaveLength(0);
    expect(
      await kindOf(
        sendReply(client, { conversationId: "c1", text: "hi", idempotencyKey: "key-12345" }),
      ),
    ).toBe("signed-out");
    expect(calls.map((call) => call.method)).toEqual(["GET"]);
  });

  it("reports a reply lost in transit as uncertain, never as failed", async () => {
    const { client } = fakeNsvx({
      "GET /api/auth/state": signedIn,
      "POST /api/conversations/c1/reply": () => json(502, { detail: "gateway" }),
    });
    expect(
      await kindOf(
        sendReply(client, { conversationId: "c1", text: "hi", idempotencyKey: "key-12345" }),
      ),
    ).toBe("uncertain");
  });

  it("creates a Quick Reply draft from a message and generates under the current rules", async () => {
    const { client, calls } = fakeNsvx({
      "GET /api/auth/state": signedIn,
      "POST /api/quick-reply/drafts": () =>
        json(201, { id: "d1", revision: 1, state: "draft", channel: "email", inbound: "Hi" }),
      "GET /api/quick-reply/rules": () => json(200, { revision: 4, rules: [] }),
      "POST /api/quick-reply/drafts/d1/generate": () =>
        json(202, { id: "g1", draft_id: "d1", state: "queued" }),
    });
    const started = await startQuickReply(client, {
      key: "key-12345",
      messageId: "m1",
      sourceChannel: "gmail",
      inbound: "Hi",
    });
    expect(started.generation.state).toBe("queued");
    const create = calls.find((call) => call.url.endsWith("/api/quick-reply/drafts"));
    expect(create?.body).toMatchObject({
      channel: "email",
      inbound: "Hi",
      source: { kind: "message", id: "m1" },
    });
    expect(calls.at(-1)?.body).toEqual({ revision: 1, rule_revision: 4, key: "key-12345" });
  });

  it("stops waiting when the generation failed even if the draft still says generating", async () => {
    const { client } = fakeNsvx({
      "GET /api/quick-reply/drafts/d1": () =>
        json(200, {
          id: "d1",
          state: "generating",
          generations: [{ id: "g1", state: "blocked", error_code: "GENERATION_FAILED" }],
        }),
    });
    const sleep = vi.fn(async () => {});
    const draft = await waitForQuickReply(client, "d1", {
      timeoutMs: 60_000,
      intervalMs: 1,
      sleep,
    });
    expect(isPreparing(draft)).toBe(false);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("serves the chat tool only on the owner's own turns", async () => {
    const { client, calls } = fakeNsvx({
      "GET /api/conversations/page": () => json(200, { items: [], next: null, total: 0 }),
    });
    const run = (senderIsOwner: boolean) =>
      createNsvxMessagesTool(client, { senderIsOwner }).execute("call-1", {
        action: "unanswered",
      } as never) as Promise<{ details: { ok?: boolean; reason?: string } }>;
    expect((await run(false)).details).toMatchObject({ ok: false, reason: "denied" });
    expect(calls).toHaveLength(0);
    await run(true);
    expect(new URL(calls[0]?.url ?? "").searchParams.get("state")).toBe("outstanding");
  });
});

describe("pasted message hints", () => {
  it("reads sender and subject from an email and the sender from a WhatsApp copy", () => {
    expect(detectPasted("From: Ana Silva <ana@example.com>\nSubject: Invoice\n\nHello")).toEqual({
      channel: "email",
      sender: "Ana Silva",
      subject: "Invoice",
    });
    expect(detectPasted("[04/11/2026, 10:15] Rui: Are you free?")).toEqual({
      channel: "message",
      sender: "Rui",
      subject: "",
    });
  });
});
