import { describe, expect, it } from "vitest";
import { assignAgent, buildTeamChart, moveAgent, type AgentEntry } from "./org.js";

const ENTRIES: Record<string, AgentEntry> = {
  boss: { identity: { name: "Boss", emoji: "B" }, subagents: { allowAgents: ["head", "ghost"] } },
  head: { subagents: { allowAgents: ["worker"] }, tools: { exec: { node: "mac" } } },
  worker: {},
  loner: {},
};

describe("buildTeamChart", () => {
  it("orders the tree depth first, keeps agents nobody leads apart, and ignores unknown agents", () => {
    const chart = buildTeamChart({
      entries: ENTRIES,
      roster: [{ id: "boss" }, { id: "head", name: "Head" }],
      defaultId: "boss",
      sessions: [
        { key: "agent:head:a", hasActiveRun: true },
        { agentId: "worker", abortedLastRun: true },
        { agentId: "worker" },
      ],
    });
    expect(chart.agents.map((agent) => [agent.id, agent.depth, agent.state])).toEqual([
      ["boss", 0, "idle"],
      ["head", 1, "running"],
      ["worker", 2, "error"],
    ]);
    expect(chart.agents[1]).toMatchObject({
      name: "Head",
      node: "mac",
      supervisors: ["boss"],
      runningKeys: ["agent:head:a"],
    });
    expect(chart.agents[2]?.sessions).toBe(2);
    expect(chart.unlinked.map((agent) => agent.id)).toEqual(["loner"]);
  });

  it("shows each agent once when config holds a loop", () => {
    const chart = buildTeamChart({
      entries: {
        a: { subagents: { allowAgents: ["b"] } },
        b: { subagents: { allowAgents: ["a"] } },
      },
      roster: [],
      defaultId: "a",
      sessions: [],
    });
    expect(chart.agents.map((agent) => agent.id)).toEqual(["a", "b"]);
  });
});

describe("moveAgent", () => {
  it("replaces the old link", () => {
    const entries = structuredClone(ENTRIES);
    moveAgent(entries, "worker", "boss");
    expect(entries.boss?.subagents?.allowAgents).toEqual(["head", "ghost", "worker"]);
    expect(entries.head?.subagents?.allowAgents).toEqual([]);
  });

  it("refuses a loop, a self link, and an unknown supervisor", () => {
    expect(() => moveAgent(structuredClone(ENTRIES), "head", "worker")).toThrow("loop");
    expect(() => moveAgent(structuredClone(ENTRIES), "head", "head")).toThrow("self");
    expect(() => moveAgent(structuredClone(ENTRIES), "head", "nope")).toThrow("unknown");
  });
});

describe("assignAgent", () => {
  it("sets the device and clears it when none is chosen", () => {
    const entries: Record<string, AgentEntry> = { a: { tools: { exec: { node: "old" } } } };
    assignAgent(entries, "a", "mac");
    expect(entries.a?.tools?.exec).toEqual({ host: "node", node: "mac" });
    assignAgent(entries, "a", null);
    expect(entries.a?.tools?.exec).toEqual({});
  });
});
