import { describe, expect, it } from "vitest";
import {
  createAgentSettings,
  parseToolAccess,
  providerKind,
  readSection,
  SECTIONS,
  writeSection,
} from "./agent-settings.js";
import type { NsvxClient } from "./client.js";
import { createTeamService, type TeamVersion } from "./team.js";
import { createNsvxAgentsTool, createNsvxSkillsTool } from "./tools.js";

const [START, END] = SECTIONS.managed;

describe("NSVX sections in AGENTS.md", () => {
  it("adds, replaces, and reads only NSVX's section, keeping hand-written text", () => {
    const added = writeSection("# Mine\nKeep me.", "Ship small.", "managed");
    expect(added).toBe(`# Mine\nKeep me.\n\n${START}\nShip small.\n${END}\n`);
    const replaced = writeSection(added, "Ship daily.", "managed");
    expect(replaced).toContain("Keep me.");
    expect(readSection(replaced, "managed")).toBe("Ship daily.");
    expect(readSection(replaced, "policies")).toBe("");
  });

  it("refuses a broken section or reserved markers rather than guess", () => {
    expect(() => writeSection(`${START}\nhalf`, "x", "managed")).toThrow("broken");
    expect(() => writeSection("", `sneak ${END}`, "managed")).toThrow("reserved");
  });
});

describe("tool access", () => {
  it("accepts NSVX's profiles and tool names, and clears with null", () => {
    expect(parseToolAccess({ profile: "coding", deny: ["exec", "exec"], alsoAllow: null })).toEqual(
      {
        profile: "coding",
        deny: ["exec"],
        alsoAllow: null,
      },
    );
    expect(() => parseToolAccess({ profile: "root" })).toThrow("profile");
    expect(() => parseToolAccess({ allow: ["rm -rf"] })).toThrow("tool names");
    expect(() => parseToolAccess({ allow: [] })).toThrow("at least one");
  });

  it("blocks paid providers by their real config, as NSVX does", () => {
    expect(providerKind("claude-cli")).toBe("subscription");
    expect(providerKind("xai")).toBe("paid");
    expect(providerKind("anthropic")).toBe("paid");
    expect(
      providerKind("clone-ai", { baseUrl: "http://127.0.0.1:18795/v1", api: "openai-completions" }),
    ).toBe("local");
    expect(
      providerKind("clone-ai", { baseUrl: "https://example.test/v1", api: "openai-completions" }),
    ).toBe("paid");
  });
});

function setup() {
  const config = {
    agents: {
      entries: {
        boss: { subagents: { allowAgents: ["coder"] } },
        coder: { tools: { exec: { host: "node", node: "mac" }, profile: "coding" } },
      } as Record<string, Record<string, unknown>>,
      defaults: { model: { primary: "claude-cli/opus", fallbacks: ["claude-cli/sonnet"] } },
    } as Record<string, unknown> & { entries: Record<string, Record<string, unknown>> },
    models: { providers: {} },
  };
  const files = new Map<string, { content: string; hash: string }>([
    ["coder", { content: "# Coder\nHand rules.\n", hash: "h1" }],
    ["boss", { content: "# Boss\n", hash: "h2" }],
  ]);
  const calls: { method: string; params?: Record<string, unknown> }[] = [];
  const history: TeamVersion[] = [];
  const runtime = {
    config: {
      current: () => config,
      mutateConfigFile: async ({
        mutate,
      }: {
        mutate: (draft: unknown, c: unknown) => Promise<void>;
      }) => {
        await mutate(config, { previousHash: "rev-0" });
        return { persistedHash: "rev-1" };
      },
    },
    gateway: {
      request: async (method: string, params?: Record<string, unknown>) => {
        calls.push({ method, params });
        switch (method) {
          case "agents.list":
            return { defaultId: "boss" };
          case "agents.files.get":
            return { file: files.get(params?.agentId as string) };
          case "models.list":
            return {
              models: [
                { id: "opus", provider: "claude-cli" },
                { id: "grok", provider: "xai" },
              ],
            };
          default:
            return {};
        }
      },
    },
  };
  const store = {
    entries: async () => [],
    lookup: async () => undefined,
    register: async (_key: string, value: TeamVersion) => void history.push(structuredClone(value)),
    delete: async () => true,
  };
  // SAFETY: the fakes implement exactly the runtime and store members the services call.
  const team = createTeamService(
    runtime as never,
    () => ({ paused: store, history: store }) as never,
  );
  const settings = createAgentSettings(runtime as never, team);
  return { settings, calls, config, history };
}

describe("agent settings", () => {
  it("writes instructions into NSVX's section with the file's hash and returns the old text", async () => {
    const { settings, calls } = setup();
    await expect(settings.setInstructions("coder", "Run tests first.")).resolves.toEqual({
      agentId: "coder",
      previous: "",
    });
    const write = calls.find((call) => call.method === "agents.files.set");
    expect(write?.params).toMatchObject({
      agentId: "coder",
      name: "AGENTS.md",
      expectedHash: "h1",
    });
    expect(write?.params?.content).toContain("Hand rules.");
    expect(readSection(write?.params?.content as string, "managed")).toBe("Run tests first.");
  });

  it("changes tool access without touching exec, and logs it for Undo", async () => {
    const { settings, config, history } = setup();
    await settings.setTools("coder", { profile: null, deny: ["browser"] });
    expect(config.agents.entries.coder?.tools).toEqual({
      exec: { host: "node", node: "mac" },
      deny: ["browser"],
    });
    expect(history.at(-1)).toMatchObject({ change: "tools", agent: "coder", afterHash: "rev-1" });
  });

  it("refuses paid models and sets the team model as one primary", async () => {
    const { settings, config } = setup();
    await expect(settings.setDefaults({ model: "xai/grok" })).rejects.toThrow("Paid");
    await settings.setDefaults({ model: "claude-cli/opus", maxConcurrent: 3 });
    expect(config.agents.defaults).toMatchObject({
      model: { primary: "claude-cli/opus", fallbacks: [] },
      maxConcurrent: 3,
    });
  });

  it("puts team rules in the main agent's policies section", async () => {
    const { settings, calls } = setup();
    await settings.setDefaults({ rules: "Never deploy production." });
    const write = calls.find((call) => call.method === "agents.files.set");
    expect(write?.params?.agentId).toBe("boss");
    expect(readSection(write?.params?.content as string, "policies")).toBe(
      "Never deploy production.",
    );
  });
});

describe("chat tools", () => {
  it("lets only the owner's own turn change agents or ask NSVX for ideas", async () => {
    const { settings, calls } = setup();
    const client = { readOwnerPost: async () => ({ agents: [] }) } as unknown as NsvxClient;
    const guest = createNsvxAgentsTool(settings, client, { senderIsOwner: false });
    expect(
      JSON.stringify(
        await guest.execute("c1", { action: "instructions", agentId: "coder", text: "x" }),
      ),
    ).toContain("denied");
    expect(JSON.stringify(await guest.execute("c2", { action: "suggest", goal: "x" }))).toContain(
      "denied",
    );
    expect(calls.some((call) => call.method === "agents.files.set")).toBe(false);
    const read = await guest.execute("c3", { action: "defaults" });
    // Paid models are never offered to the model.
    expect(JSON.stringify(read)).toContain("claude-cli/opus");
    expect(JSON.stringify(read)).not.toContain("xai/grok");
  });

  it("never reads or changes NSVX skills for another sender", async () => {
    let reads = 0;
    const client = {
      readOwnerView: async () => {
        reads += 1;
        return { items: [] };
      },
    } as unknown as NsvxClient;
    const tool = createNsvxSkillsTool(client, { senderIsOwner: false });
    expect(JSON.stringify(await tool.execute("c1", { action: "list" }))).toContain("denied");
    expect(reads).toBe(0);
  });
});
