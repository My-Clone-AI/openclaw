import { describe, expect, it } from "vitest";
import type { AgentEntry } from "./org.js";
import { createTeamService, type PausedAgent, type TeamVersion } from "./team.js";
import { createNsvxTeamTool } from "./tools.js";

function fakeStore<V>() {
  const saved = new Map<string, V>();
  return {
    saved,
    entries: async () => [...saved].map(([key, value]) => ({ key, value, createdAt: 0 })),
    lookup: async (key: string) => saved.get(key),
    register: async (key: string, value: V) => void saved.set(key, structuredClone(value)),
    delete: async (key: string) => saved.delete(key),
  };
}

function setup(entries: Record<string, AgentEntry>) {
  const config: { agents: { entries: Record<string, AgentEntry> } & Record<string, unknown> } = {
    agents: { entries: structuredClone(entries) },
  };
  let revision = 0;
  const calls: { method: string; params?: Record<string, unknown> }[] = [];
  const runtime = {
    config: {
      current: () => config,
      mutateConfigFile: async ({
        mutate,
      }: {
        mutate: (draft: typeof config, context: { previousHash: string }) => Promise<void>;
      }) => {
        await mutate(config, { previousHash: `rev-${revision}` });
        revision += 1;
        return { persistedHash: `rev-${revision}` };
      },
    },
    gateway: {
      request: async (method: string, params?: Record<string, unknown>) => {
        calls.push({ method, params });
        if (method === "agents.list") {
          return { defaultId: "boss" };
        }
        if (method === "sessions.list") {
          return {
            sessions: [
              { key: "agent:worker:main", hasActiveRun: true },
              { key: "agent:worker:idle" },
              { key: "agent:head:main", hasActiveRun: true },
            ],
          };
        }
        return {};
      },
    },
  };
  const paused = fakeStore<PausedAgent>();
  const history = fakeStore<TeamVersion>();
  // SAFETY: the fakes implement exactly the runtime and store members the service calls.
  const team = createTeamService(runtime as never, () => ({ paused, history }) as never);
  const children = (id: string) => config.agents.entries[id]?.subagents?.allowAgents;
  return { team, children, calls, config, history: history.saved };
}

describe("team pause and resume", () => {
  it("unlinks the agent, stops only its live runs, and resume restores the same leads", async () => {
    const { team, children, calls } = setup({
      boss: { subagents: { allowAgents: ["head", "worker"] } },
      head: { subagents: { allowAgents: ["worker"] } },
      worker: {},
    });

    await expect(team.pause("worker")).resolves.toMatchObject({
      supervisors: ["boss", "head"],
      stopped: 1,
      failed: 0,
    });
    expect([children("boss"), children("head")]).toEqual([["head"], []]);
    expect(calls.filter((call) => call.method === "sessions.abort")).toEqual([
      {
        method: "sessions.abort",
        params: { key: "agent:worker:main", agentId: "worker", clearQueued: true },
      },
    ]);
    await expect(team.listPaused()).resolves.toMatchObject({
      paused: [{ id: "worker", supervisors: ["boss", "head"] }],
    });

    await expect(team.resume("worker")).resolves.toEqual({
      id: "worker",
      supervisors: ["boss", "head"],
    });
    expect([children("boss"), children("head")]).toEqual([["head", "worker"], ["worker"]]);
    await expect(team.listPaused()).resolves.toEqual({ paused: [] });
  });

  it("refuses the main agent and repeats, and falls back to the main agent when leads are gone", async () => {
    const { team, children, config } = setup({
      boss: { subagents: { allowAgents: ["head"] } },
      head: { subagents: { allowAgents: ["worker"] } },
      worker: {},
    });
    await expect(team.pause("boss")).rejects.toMatchObject({ kind: "invalid" });
    await expect(team.resume("worker")).rejects.toMatchObject({ kind: "conflict" });
    await expect(team.pause("ghost")).rejects.toMatchObject({ kind: "not-found" });

    await team.pause("worker");
    await expect(team.pause("worker")).rejects.toMatchObject({ kind: "conflict" });
    delete config.agents.entries.head;
    await expect(team.resume("worker")).resolves.toEqual({ id: "worker", supervisors: ["boss"] });
    expect(children("boss")).toEqual(["head", "worker"]);
  });

  it("lets chat pause only on the owner's own turns", async () => {
    const { team, children } = setup({
      boss: { subagents: { allowAgents: ["worker"] } },
      worker: {},
    });
    const run = (senderIsOwner: boolean) =>
      createNsvxTeamTool(team, { senderIsOwner }).execute("call-1", {
        action: "pause",
        agentId: "worker",
      });
    await expect(run(false)).resolves.toMatchObject({ details: { ok: false, reason: "denied" } });
    expect(children("boss")).toEqual(["worker"]);
    await expect(run(true)).resolves.toMatchObject({ details: { id: "worker", stopped: 1 } });
    expect(children("boss")).toEqual([]);
  });
});

describe("team history and rollback", () => {
  it("logs each change with its before-image and rolls back to before it", async () => {
    const { team, children, config, history } = setup({
      boss: { subagents: { allowAgents: ["head"] } },
      head: { subagents: { allowAgents: ["worker"] } },
      worker: {},
    });
    const moved = await team.move("worker", "boss");
    await team.assign("worker", "mac");
    await team.pause("head");
    expect(children("boss")).toEqual(["worker"]);
    expect(config.agents.entries.worker?.tools?.exec).toEqual({ host: "node", node: "mac" });
    await expect(team.move("worker", "worker")).rejects.toMatchObject({ kind: "invalid" });
    await expect(team.move("head", "boss")).rejects.toMatchObject({ kind: "conflict" });

    const { versions } = await team.history();
    expect(versions.map((version) => [version.change, version.afterHash !== null])).toEqual([
      ["pause", true],
      ["assign", true],
      ["move", true],
    ]);
    expect(versions[0]).not.toHaveProperty("before");
    expect(history.get(moved.version ?? "")?.before).toEqual({
      entries: {
        boss: { subagents: { allowAgents: ["head"] } },
        head: { subagents: { allowAgents: ["worker"] } },
        worker: {},
      },
    });

    await expect(team.rollback(moved.version ?? "")).resolves.toMatchObject({ skipped: [] });
    expect([children("boss"), children("head")]).toEqual([["head"], ["worker"]]);
    expect(config.agents.entries.worker?.tools).toBeUndefined();
    // Head has a lead again, so it is no longer paused; the rollback itself is a new version.
    await expect(team.listPaused()).resolves.toEqual({ paused: [] });
    expect((await team.history()).versions[0]).toMatchObject({
      change: "rollback",
      target: moved.version,
    });
  });

  it("keeps agents added since and drops links to agents deleted since", async () => {
    const { team, children, config } = setup({
      boss: { subagents: { allowAgents: ["old"] } },
      old: {},
      worker: {},
    });
    const moved = await team.move("worker", "old");
    delete config.agents.entries.old;
    config.agents.entries.fresh = {};
    await expect(team.rollback(moved.version ?? "")).resolves.toMatchObject({ skipped: ["old"] });
    expect(Object.keys(config.agents.entries)).toEqual(["boss", "worker", "fresh"]);
    expect(children("boss")).toEqual([]);
    await expect(team.rollback("nope")).rejects.toMatchObject({ kind: "not-found" });
  });
});
