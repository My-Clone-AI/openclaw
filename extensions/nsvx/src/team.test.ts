import { describe, expect, it } from "vitest";
import type { AgentEntry } from "./org.js";
import { createTeamService, type PausedAgent } from "./team.js";
import { createNsvxTeamTool } from "./tools.js";

function setup(entries: Record<string, AgentEntry>) {
  const config = { agents: { entries: structuredClone(entries) } };
  const saved = new Map<string, PausedAgent>();
  const calls: { method: string; params?: Record<string, unknown> }[] = [];
  const runtime = {
    config: {
      current: () => config,
      mutateConfigFile: async ({ mutate }: { mutate: (draft: typeof config) => void }) => {
        mutate(config);
        return {};
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
  const store = {
    entries: async () => [...saved].map(([key, value]) => ({ key, value, createdAt: 0 })),
    lookup: async (key: string) => saved.get(key),
    register: async (key: string, value: PausedAgent) => void saved.set(key, value),
    delete: async (key: string) => saved.delete(key),
  };
  // SAFETY: the fakes implement exactly the runtime and store members the service calls.
  const team = createTeamService(runtime as never, () => store as never);
  const children = (id: string) => config.agents.entries[id]?.subagents?.allowAgents;
  return { team, children, calls, config };
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
