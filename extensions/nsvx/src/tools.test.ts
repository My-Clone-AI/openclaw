import { describe, expect, it, vi } from "vitest";
import manifest from "../openclaw.plugin.json" with { type: "json" };
import { createNsvxAccessTool } from "./access-tool.js";
import { createNsvxAiTool } from "./ai-tool.js";
import { createNsvxAviationTool } from "./aviation-tool.js";
import type { NsvxClient } from "./client.js";
import { createNsvxDeviceTool } from "./device.js";
import { createNsvxFleetTool } from "./fleet-tool.js";
import { createNsvxGroupTool } from "./group-tool.js";
import { createNsvxGrowTool } from "./grow.js";
import { createNsvxHomesTool } from "./homes-tool.js";
import { createNsvxLegalTool } from "./legal-tool.js";
import { createNsvxMarketingTool } from "./marketing.js";
import { createNsvxPeopleTool } from "./people-tool.js";
import { createNsvxResearchTool } from "./research.js";
import {
  createNsvxAgentsTool,
  createNsvxAgendaTool,
  createNsvxFinanceTool,
  createNsvxMessagesTool,
  createNsvxSkillsTool,
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
  const settings = {
    get: async () => ({}),
    defaults: async () => ({}),
    setInstructions: async () => ({}),
    setTools: async () => ({}),
    setDefaults: async () => ({}),
    add: async () => ({}),
  };
  const names = [
    ...createNsvxTools({} as NsvxClient).map((tool) => tool.name),
    createNsvxTeamTool(team as never, ctx as never).name,
    createNsvxAgentsTool(settings as never, {} as NsvxClient, ctx as never).name,
    createNsvxSkillsTool({} as NsvxClient, ctx as never).name,
    ...createNsvxOwnerTools({} as NsvxClient, ctx as never).map((tool) => tool.name),
    createNsvxMessagesTool({} as NsvxClient, ctx as never).name,
    createNsvxFinanceTool({} as NsvxClient, ctx as never).name,
    createNsvxAgendaTool({} as NsvxClient, ctx as never).name,
    createNsvxPeopleTool({} as NsvxClient, ctx as never).name,
    createNsvxGroupTool({} as NsvxClient, ctx as never).name,
    createNsvxHomesTool({} as NsvxClient, ctx as never).name,
    createNsvxDeviceTool({} as NsvxClient, ctx as never).name,
    createNsvxGrowTool({} as NsvxClient, ctx as never).name,
    createNsvxAviationTool({} as NsvxClient, ctx as never).name,
    createNsvxFleetTool({} as NsvxClient, ctx as never).name,
    createNsvxAccessTool({} as NsvxClient, ctx as never).name,
    createNsvxLegalTool({} as NsvxClient, ctx as never).name,
    createNsvxResearchTool({} as NsvxClient, ctx as never).name,
    createNsvxMarketingTool({} as NsvxClient, ctx as never).name,
    createNsvxAiTool({} as NsvxClient, ctx as never).name,
  ];
  expect(NSVX_OWNER_TOOL_NAMES.toSorted()).toEqual(
    createNsvxOwnerTools({} as NsvxClient, ctx as never)
      .map((tool) => tool.name)
      .toSorted(),
  );
  expect(manifest.contracts.tools.toSorted()).toEqual([...new Set(names)].toSorted());
  expect(manifest.contracts.tools).toHaveLength(23);
});
