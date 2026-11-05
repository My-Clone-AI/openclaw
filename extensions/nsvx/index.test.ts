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

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "nsvx-entry-"));
    seen.length = 0;
    server = createServer((request, response) => {
      seen.push({ url: request.url ?? "", headers: request.headers });
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ actions: [{ id: "clone.missions.list" }] }));
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
    const methods = new Map<string, Handler>();
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
});
