import { describe, expect, it } from "vitest";
import { assignAgentPatch, buildTeamChart, moveAgentPatch, type AgentEntry } from "./org.js";

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

describe("moveAgentPatch", () => {
  it("replaces the old link and pins the base revision", () => {
    const patch = moveAgentPatch(ENTRIES, "worker", "boss", "rev");
    expect(patch.baseHash).toBe("rev");
    expect(patch.replacePaths.toSorted()).toEqual([
      "agents.entries.boss.subagents.allowAgents",
      "agents.entries.head.subagents.allowAgents",
    ]);
    expect(JSON.parse(patch.raw).agents.entries).toEqual({
      boss: { subagents: { allowAgents: ["head", "ghost", "worker"] } },
      head: { subagents: { allowAgents: [] } },
    });
  });

  it("refuses a loop, a self link, and an unknown supervisor", () => {
    expect(() => moveAgentPatch(ENTRIES, "head", "worker", "rev")).toThrow("loop");
    expect(() => moveAgentPatch(ENTRIES, "head", "head", "rev")).toThrow("self");
    expect(() => moveAgentPatch(ENTRIES, "head", "nope", "rev")).toThrow("unknown");
  });
});

describe("assignAgentPatch", () => {
  it("clears the device when none is chosen", () => {
    expect(JSON.parse(assignAgentPatch("a", null, "rev").raw).agents.entries.a.tools.exec).toEqual({
      host: null,
      node: null,
    });
    expect(JSON.parse(assignAgentPatch("a", "mac", "rev").raw).agents.entries.a.tools.exec).toEqual(
      {
        host: "node",
        node: "mac",
      },
    );
  });
});
