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
    (cause: { kind: NsvxErrorKind }) => cause.kind,
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
    expect(JSON.parse(String(init.body))).toEqual({ input: { a: 1 } });
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
