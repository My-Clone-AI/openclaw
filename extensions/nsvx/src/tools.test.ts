import { describe, expect, it, vi } from "vitest";
import manifest from "../openclaw.plugin.json" with { type: "json" };
import type { NsvxClient } from "./client.js";
import { createNsvxPeopleTool } from "./people-tool.js";
import {
  createNsvxAgendaTool,
  createNsvxFinanceTool,
  createNsvxMessagesTool,
  createNsvxOwnerTools,
  createNsvxTeamTool,
  createNsvxTools,
  FINANCE_VIEWS,
  NSVX_OWNER_TOOL_NAMES,
} from "./tools.js";

describe("nsvx_finance", () => {
  const client = { readOwnerView: vi.fn(async () => ({ obligations: [] })) };
  const run = (senderIsOwner: boolean) =>
    createNsvxFinanceTool(client as unknown as NsvxClient, { senderIsOwner }).execute("call-1", {
      view: "financeObligations",
      params: { entity: "owner" },
    });

  it("reads finance views for the owner and refuses every other sender", async () => {
    expect(JSON.stringify(await run(false))).toContain("denied");
    expect(client.readOwnerView).not.toHaveBeenCalled();
    await run(true);
    expect(client.readOwnerView).toHaveBeenCalledWith("financeObligations", { entity: "owner" });
  });

  it("offers finance reads only, never page images or other owner screens", () => {
    expect(FINANCE_VIEWS).toContain("ledgerJournal");
    expect(FINANCE_VIEWS).not.toContain("docPage");
    expect(FINANCE_VIEWS).not.toContain("today");
  });
});

it("declares every registered tool, because the loader drops undeclared tools", () => {
  const team = {
    snapshot: async () => ({ agents: [] }),
    move: async () => ({}),
    assign: async () => ({}),
    task: async () => ({}),
    stop: async () => ({}),
    pause: async () => ({}),
    resume: async () => ({}),
    history: async () => [],
    undo: async () => ({}),
  };
  const ctx = { senderIsOwner: true };
  const names = [
    ...createNsvxTools({} as NsvxClient).map((tool) => tool.name),
    createNsvxTeamTool(team as never, ctx as never).name,
    ...createNsvxOwnerTools({} as NsvxClient, ctx as never).map((tool) => tool.name),
    createNsvxMessagesTool({} as NsvxClient, ctx as never).name,
    createNsvxFinanceTool({} as NsvxClient, ctx as never).name,
    createNsvxAgendaTool({} as NsvxClient, ctx as never).name,
    createNsvxPeopleTool({} as NsvxClient, ctx as never).name,
  ];
  expect(NSVX_OWNER_TOOL_NAMES.toSorted()).toEqual(
    createNsvxOwnerTools({} as NsvxClient, ctx as never)
      .map((tool) => tool.name)
      .toSorted(),
  );
  expect(manifest.contracts.tools.toSorted()).toEqual([...new Set(names)].toSorted());
  expect(manifest.contracts.tools).toHaveLength(10);
});
