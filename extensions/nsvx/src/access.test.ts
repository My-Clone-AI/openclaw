import { describe, expect, it, vi } from "vitest";
import { accountTone, hookTone, liveAccounts, screenPoint, type Account } from "./access-data.js";
import { createNsvxAccessTool } from "./access-tool.js";
import { loginInput, revokeSession, savePermission } from "./access.js";
import { createNsvxClient, type NsvxClient } from "./client.js";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** An owner client whose sign-in state route hands out a CSRF token, recording every call. */
function ownerClient(answer: (url: string, init: RequestInit) => Response) {
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) =>
    url.endsWith("/api/auth/state")
      ? json(200, { authenticated: true, csrf: "csrf-1" })
      : answer(url, init),
  );
  const client = createNsvxClient({
    baseUrl: "https://nsvx.test",
    token: undefined,
    ownerSession: "s",
    fetchImpl,
  });
  const writes = () =>
    (fetchImpl.mock.calls as unknown as [string, RequestInit][]).filter(
      ([, init]) => init.method !== "GET",
    );
  return { client, writes };
}

const account = (id: string, channel: string, state: string, extra: Partial<Account> = {}) =>
  ({
    id,
    channel,
    label: id,
    mode: "live",
    state,
    state_detail: null,
    paused: false,
    outbound_enabled: true,
    last_verified_at: null,
    ...extra,
  }) satisfies Account;

describe("access data", () => {
  it("lists live apps with problems first and leaves the test channel out", () => {
    const list = liveAccounts([
      account("wa", "whatsapp", "ready"),
      account("ig", "instagram", "interrupted"),
      account("fx", "fixture", "ready", { mode: "fixture" }),
      account("tg", "telegram", "ready", { paused: true }),
    ]);
    expect(list.map((a) => [a.id, accountTone(a)])).toEqual([
      ["ig", "bad"],
      ["tg", "off"],
      ["wa", "ok"],
    ]);
  });

  it("maps a tap on the shown screen to NSVX browser pixels", () => {
    const point = screenPoint(
      { width: 1280, height: 900 },
      { left: 10, top: 20, width: 640, height: 450 },
      { x: 330, y: 245 },
    );
    expect(point).toEqual({ x: 640, y: 450 });
  });

  it("calls hooks healthy only when Meta confirmed them and nothing waits", () => {
    const hooks = {
      account: { id: "a", channel: "whatsapp", label: "a" },
      binding: {
        state: "authorized",
        health_code: null,
        webhook_challenged_at: "2026-11-01T00:00:00Z",
        last_event_at: "2026-11-04T00:00:00Z",
      },
      events: [{ kind: "message", state: "processed", n: 4 }],
      signature_rejections: 0,
      milestones: { webhook_subscribed: "verified" },
    };
    expect(hookTone(hooks)).toBe("ok");
    expect(hookTone({ ...hooks, events: [{ kind: "message", state: "held", n: 1 }] })).toBe("warn");
    expect(hookTone({ ...hooks, binding: { ...hooks.binding, state: "reconnect" } })).toBe("bad");
    expect(hookTone({ ...hooks, binding: null })).toBe("off");
  });
});

describe("access changes", () => {
  it("refuses to end the session Control signs in with", async () => {
    const { client, writes } = ownerClient((url) =>
      url.endsWith("/api/auth/devices")
        ? json(200, { passkeys: [], sessions: [], current_session: "control" })
        : json(200, { ok: true }),
    );
    await expect(revokeSession(client, { sessionId: "control" })).rejects.toMatchObject({
      kind: "denied",
    });
    expect(writes()).toHaveLength(0);
    await revokeSession(client, { sessionId: "phone" });
    expect(writes()[0]?.[0]).toBe("https://nsvx.test/api/auth/sessions/phone/revoke");
  });

  it("sends typed text and screen taps to NSVX's browser, and nothing else", async () => {
    const { client, writes } = ownerClient(() => json(200, { ok: true }));
    const accountId = "6f1c1d1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f";
    await loginInput(client, { accountId, kind: "type", text: "123456" });
    await loginInput(client, { accountId, kind: "click", x: 640, y: 450 });
    expect(writes().map(([url, init]) => [url, JSON.parse(String(init.body))])).toEqual([
      [`https://nsvx.test/api/apps/${accountId}/login/input`, { kind: "type", text: "123456" }],
      [`https://nsvx.test/api/apps/${accountId}/login/input`, { kind: "click", x: 640, y: 450 }],
    ]);
    await expect(loginInput(client, { accountId, kind: "key", key: "F12" })).rejects.toMatchObject({
      kind: "invalid",
    });
    await expect(
      loginInput(client, { accountId, kind: "click", x: 5000, y: 0 }),
    ).rejects.toMatchObject({ kind: "invalid" });
  });

  it("saves access with the revision shown and reports NSVX's stale answer as a conflict", async () => {
    const { client, writes } = ownerClient((url, init) =>
      init.method === "PUT"
        ? json(409, { detail: "A atribuição mudou. Atualiza antes de guardar." })
        : json(200, {}),
    );
    const pid = "6f1c1d1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f";
    await expect(
      savePermission(client, {
        assignmentId: pid,
        revision: 3,
        personId: null,
        state: "pending",
        scopes: ["documents"],
      }),
    ).rejects.toMatchObject({ kind: "conflict" });
    const [url, init] = writes()[0]!;
    expect(url).toBe(`https://nsvx.test/api/permissions/people/${pid}`);
    expect(JSON.parse(String(init.body))).toEqual({
      revision: 3,
      person_id: null,
      state: "pending",
      scopes: ["documents"],
    });
    await expect(
      savePermission(client, { assignmentId: pid, revision: 3, state: "owner", scopes: [] }),
    ).rejects.toMatchObject({ kind: "invalid" });
  });
});

describe("nsvx_access tool", () => {
  const context = (owner: boolean) => ({
    senderIsOwner: owner,
    assertInvocationCurrent: vi.fn(),
  });

  it("answers only the owner", async () => {
    const readOwnerView = vi.fn();
    const result = await createNsvxAccessTool(
      { readOwnerView } as unknown as NsvxClient,
      context(false),
    ).execute("call-1", { action: "apps" });
    expect(JSON.stringify(result)).toContain("denied");
    expect(readOwnerView).not.toHaveBeenCalled();
  });

  it("lists logins without secrets and pauses an app on the owner's turn", async () => {
    const { client, writes } = ownerClient((url) =>
      url.endsWith("/api/credentials")
        ? json(200, {
            entries: [
              {
                id: "c1",
                label: "portal",
                origins: ["https://portal.example"],
                state: "stored",
                detail: null,
                updated_at: "2026-11-01T00:00:00Z",
                service: null,
                from_document: false,
                secret: "never-shown",
              },
            ],
          })
        : json(200, { ok: true }),
    );
    const ctx = context(true);
    const tool = createNsvxAccessTool(client, ctx);
    const logins = JSON.stringify(await tool.execute("call-1", { action: "logins" }));
    expect(logins).toContain("portal.example");
    expect(logins).not.toContain("never-shown");
    await tool.execute("call-2", {
      action: "pause",
      accountId: "6f1c1d1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f",
    });
    expect(ctx.assertInvocationCurrent).toHaveBeenCalled();
    const [url, init] = writes()[0]!;
    expect(url).toBe("https://nsvx.test/api/apps/6f1c1d1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f");
    expect(JSON.parse(String(init.body))).toEqual({ paused: true });
  });
});
