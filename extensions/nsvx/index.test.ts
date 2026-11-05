import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { createTestPluginApi } from "openclaw/plugin-sdk/plugin-test-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import plugin from "./index.js";

type Handler = Parameters<OpenClawPluginApi["registerGatewayMethod"]>[1];

/** The plugin entry against a local AgentOS, so the env wiring, Gateway method, and real HTTP are all on the path. */
describe("nsvx plugin entry", () => {
  let dir: string;
  let server: Server;
  const seen: { url: string; headers: IncomingHttpHeaders }[] = [];
  const methods = new Map<string, Handler>();
  let answer: (url: string) => { status: number; body: unknown };

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "nsvx-entry-"));
    seen.length = 0;
    answer = () => ({ status: 200, body: { actions: [{ id: "clone.missions.list" }] } });
    server = createServer((request, response) => {
      const url = request.url ?? "";
      seen.push({ url, headers: request.headers });
      const { status, body } = answer(url);
      response.statusCode = status;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(body));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    vi.stubEnv("NSVX_AGENTOS_TOKEN", "");
    vi.stubEnv("NSVX_AGENTOS_TOKEN_FILE", "");
    vi.stubEnv("NSVX_OWNER_SESSION", "");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });

  function register() {
    methods.clear();
    const warn = vi.fn();
    plugin.register(
      createTestPluginApi({
        id: "nsvx",
        pluginConfig: { baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` },
        logger: { info: vi.fn(), warn, error: vi.fn() },
        registerGatewayMethod: (name, handler) => methods.set(name, handler),
      }),
    );
    const status = async () => {
      const respond = vi.fn();
      await methods.get("nsvx.status")?.({ params: {}, respond } as never);
      return respond.mock.calls[0]?.[1] as { state: string };
    };
    return { status, warn };
  }

  it("signs in to AgentOS with the token file alone", async () => {
    const file = path.join(dir, "token");
    writeFileSync(file, "file-token\n", { mode: 0o600 });
    vi.stubEnv("NSVX_AGENTOS_TOKEN_FILE", file);
    const { status, warn } = register();

    expect((await status()).state).toBe("connected");
    expect(seen[0]?.url).toBe("/api/agentos/v1/actions?limit=500");
    expect(seen[0]?.headers.authorization).toBe("Bearer file-token");
    expect(seen[0]?.headers.cookie).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it("is not connected when the file is missing, and warns about a cookie without printing it", async () => {
    vi.stubEnv("NSVX_AGENTOS_TOKEN_FILE", path.join(dir, "missing"));
    vi.stubEnv("NSVX_OWNER_SESSION", "cookie-value");
    const { status, warn } = register();

    expect((await status()).state).toBe("unconfigured");
    expect(seen).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("NSVX_OWNER_SESSION is deprecated");
    expect(warn.mock.calls[0]?.[0]).not.toContain("cookie-value");
  });

  it("opens the Access, Legal, Research, and Marketing reads with the token file alone", async () => {
    const file = path.join(dir, "token");
    writeFileSync(file, "file-token\n", { mode: 0o600 });
    vi.stubEnv("NSVX_AGENTOS_TOKEN_FILE", file);
    register();
    const missing = "/api/agentos/v1/actions/clone.marketing.gate/execute";
    answer = (url) =>
      url === missing
        ? { status: 404, body: { code: "not_found", detail: "No such action." } }
        : { status: 200, body: { status: "completed", correlation_id: "c", output: { url } } };
    const call = async (name: string, params: Record<string, unknown>) => {
      const respond = vi.fn();
      await methods.get(name)?.({ params, respond } as never);
      return respond.mock.calls[0] as [boolean, unknown, { code: string } | undefined];
    };

    for (const view of ["apps", "casesDashboard", "research", "marketingOverview"]) {
      const [ok, body] = await call("nsvx.view", { view });
      expect(ok).toBe(true);
      expect(body).toEqual({ url: expect.stringContaining("/api/agentos/v1/actions/clone.") });
    }
    const [ok, , error] = await call("nsvx.view", { view: "marketingGate" });
    expect(ok).toBe(false);
    expect(error?.code).toBe("token-pending");

    const before = seen.length;
    const [writeOk, , writeError] = await call("nsvx.marketing.change", {
      action: "publish",
      contentId: "c1",
    });
    expect(writeOk).toBe(false);
    expect(writeError?.code).toBe("token-pending");
    expect(seen.length).toBe(before);
    expect(seen.every(({ url }) => url.startsWith("/api/agentos/v1/"))).toBe(true);
    expect(seen.every(({ headers }) => headers.authorization === "Bearer file-token")).toBe(true);
    expect(seen.every(({ headers }) => headers.cookie === undefined)).toBe(true);
  });
});
