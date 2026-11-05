import { describe, expect, it, vi } from "vitest";
import { createNsvxClient, type NsvxErrorKind } from "./client.js";
import { parseNsvxConfig } from "./config.js";
import { readNsvxStatus } from "./gateway.js";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function clientWith(fetchImpl: (url: string, init: RequestInit) => Promise<Response>) {
  return createNsvxClient({ baseUrl: "https://nsvx.test", token: "secret", fetchImpl });
}

const RUN = { actionId: "clone.tasks.add", input: { a: 1 }, idempotencyKey: "key-1" };

async function kindOf(run: Promise<unknown>): Promise<NsvxErrorKind | undefined> {
  return run.then(
    () => undefined,
    (cause: unknown) => (cause as { kind: NsvxErrorKind }).kind,
  );
}

describe("nsvx client", () => {
  it("sends the bearer token and the idempotency key to the action route", async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, { status: "completed", correlation_id: "c", output: { ok: true } }),
    );
    await clientWith(fetchImpl).runAction(RUN);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://nsvx.test/api/agentos/v1/actions/clone.tasks.add/execute");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer secret",
      "Idempotency-Key": "key-1",
    });
    expect(JSON.parse(init.body as string)).toEqual({ input: { a: 1 } });
  });

  it("never calls NSVX without a token", async () => {
    const fetchImpl = vi.fn();
    const client = createNsvxClient({ baseUrl: "https://nsvx.test", token: undefined, fetchImpl });
    expect(await kindOf(client.listActions())).toBe("unconfigured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports a lost write as uncertain, once, and a lost read as offline", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("socket closed");
    });
    const client = clientWith(fetchImpl);
    expect(await kindOf(client.runAction(RUN))).toBe("uncertain");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await kindOf(client.listTasks())).toBe("offline");
  });

  it("treats a server error on a write as uncertain, but on a read as failed", async () => {
    const client = clientWith(async () => json(502, { code: "provider_error", detail: "bad" }));
    expect(await kindOf(client.runAction(RUN))).toBe("uncertain");
    expect(await kindOf(client.listTasks())).toBe("failed");
  });

  it("maps NSVX refusals to their own states", async () => {
    const answer = (status: number) => clientWith(async () => json(status, { detail: "no" }));
    expect(await kindOf(answer(401).listActions())).toBe("signed-out");
    expect(await kindOf(answer(404).listActions())).toBe("off");
    expect(await kindOf(answer(404).getAction("x"))).toBe("not-found");
    expect(await kindOf(answer(403).runAction(RUN))).toBe("denied");
    expect(await kindOf(answer(409).runAction(RUN))).toBe("conflict");
    expect(await kindOf(answer(422).runAction(RUN))).toBe("invalid");
  });

  it("gives the page a status without throwing or exposing the token", async () => {
    await expect(
      readNsvxStatus(clientWith(async () => json(200, { actions: [{ id: "a" }] }))),
    ).resolves.toEqual({ state: "connected", address: "nsvx.test", actions: 1 });
    const signedOut = await readNsvxStatus(clientWith(async () => json(401, {})));
    expect(signedOut).toEqual({ state: "signed-out", address: "nsvx.test" });
    expect(JSON.stringify(signedOut)).not.toContain("secret");
  });
});

describe("nsvx owner views", () => {
  const ownerClient = (fetchImpl: (url: string, init: RequestInit) => Promise<Response>) =>
    createNsvxClient({
      baseUrl: "https://nsvx.test",
      token: undefined,
      ownerSession: "owner-cookie",
      fetchImpl,
    });

  it("reads a fixed path with the owner session and nothing else", async () => {
    const fetchImpl = vi.fn(async () => json(200, { items: [] }));
    await ownerClient(fetchImpl).readOwnerView("missionEvents", { id: "m/1", before: "t", x: "y" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://nsvx.test/api/missions/m%2F1/events?before=t");
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({
      Accept: "application/json",
      Cookie: "clone_session=owner-cookie",
    });
  });

  it("refuses unknown views and missing sign-in before calling NSVX", async () => {
    const fetchImpl = vi.fn();
    expect(await kindOf(ownerClient(fetchImpl).readOwnerView("toString"))).toBe("invalid");
    expect(await kindOf(ownerClient(fetchImpl).readOwnerView("missionEvents"))).toBe("invalid");
    expect(await kindOf(clientWith(fetchImpl).readOwnerView("today"))).toBe("unconfigured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps an expired owner session and object details", async () => {
    const answer = (status: number) =>
      ownerClient(async () => json(status, { detail: { code: "not_provisioned" } }));
    expect(await kindOf(answer(401).readOwnerView("today"))).toBe("signed-out");
    await expect(answer(503).readOwnerView("workSummary")).rejects.toThrow("NSVX answered 503.");
  });

  it("fills every path slot of a finance view and keeps only its own query names", async () => {
    const fetchImpl = vi.fn(async () => json(200, { report: null }));
    await ownerClient(fetchImpl).readOwnerView("ledgerReport", {
      kind: "income_statement",
      book: "eni",
      year: "2026",
      account: "62",
    });
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://nsvx.test/api/ledger/reports/income_statement?book=eni&year=2026");
    expect(await kindOf(ownerClient(fetchImpl).readOwnerView("docPage", { id: "d" }))).toBe(
      "invalid",
    );
  });

  it("relays a document page as an image data URL and refuses anything else", async () => {
    const image = (type: string) =>
      ownerClient(
        async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": type } }),
      ).readOwnerView<{ src: string }>("docPage", { id: "d1", page: "2" });
    await expect(image("image/jpeg")).resolves.toEqual({ src: "data:image/jpeg;base64,AQID" });
    expect(await kindOf(image("text/html"))).toBe("invalid");
  });
});

describe("nsvx owner read posts", () => {
  const owner = (fetchImpl: (url: string, init: RequestInit) => Promise<Response>) =>
    createNsvxClient({
      baseUrl: "https://nsvx.test",
      token: undefined,
      ownerSession: "c",
      fetchImpl,
    });

  it("sends search with this session's CSRF token, only to the fixed path", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith("/api/auth/state")
        ? json(200, { authenticated: true, csrf: "csrf-1" })
        : json(200, { groups: [] }),
    );
    await owner(fetchImpl).readOwnerPost("find", { q: "ana", limit: 5 });
    const [url, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("https://nsvx.test/api/find");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "X-CSRF-Token": "csrf-1", Cookie: "clone_session=c" });
    expect(JSON.parse(init.body as string)).toEqual({ q: "ana", limit: 5 });
    expect(await kindOf(owner(fetchImpl).readOwnerPost("send" as "find", {}))).toBe("invalid");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("stops when NSVX no longer accepts the session", async () => {
    const fetchImpl = vi.fn(async () => json(200, { authenticated: false, csrf: null }));
    expect(await kindOf(owner(fetchImpl).readOwnerPost("activitySummary", {}))).toBe("signed-out");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("runs AgentOS for Control on the same Bearer token as chat; never the owner session", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return json(200, { id: "a1", status: "approved" });
    };
    const client = createNsvxClient({
      baseUrl: "https://nsvx.test",
      token: "secret",
      ownerSession: "c",
      fetchImpl,
    });
    await client.control.decideApproval("a1", "approve");
    const { url, init } = calls[0]!;
    expect(url).toBe("https://nsvx.test/api/agentos/v1/approvals/a1/approve");
    expect(init.headers).toMatchObject({ Authorization: "Bearer secret" });
    expect((init.headers as Record<string, string>).Cookie).toBeUndefined();
    const blocked = createNsvxClient({
      baseUrl: "https://nsvx.test",
      token: undefined,
      ownerSession: "c",
      fetchImpl,
    });
    await expect(blocked.control.listActions()).rejects.toMatchObject({ kind: "unconfigured" });
  });

  it("downloads the activity CSV as NSVX builds it", async () => {
    const fetchImpl = vi.fn(async () => new Response("at_utc,kind\n", { status: 200 }));
    const csv = await owner(fetchImpl).exportActivity({
      start: "2026-11-01",
      end: "2026-11-05",
      ids: "1,2",
    });
    expect(csv).toBe("at_utc,kind\n");
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://nsvx.test/api/auto/activity/export?start=2026-11-01&end=2026-11-05&ids=1%2C2",
    );
  });
});

describe("parseNsvxConfig", () => {
  it("defaults to NSVX and accepts only an origin", () => {
    expect(parseNsvxConfig(undefined).baseUrl).toBe("https://nsvx.com");
    expect(parseNsvxConfig({ baseUrl: "http://127.0.0.1:9000" }).baseUrl).toBe(
      "http://127.0.0.1:9000",
    );
    for (const baseUrl of [
      "http://nsvx.com",
      "https://nsvx.com/app",
      "https://a:b@nsvx.com",
      "x",
    ]) {
      expect(() => parseNsvxConfig({ baseUrl })).toThrow("nsvx baseUrl");
    }
  });
});
