import { describe, expect, it, vi } from "vitest";
import manifest from "../openclaw.plugin.json" with { type: "json" };
import type { NsvxClient } from "./client.js";
import { createNsvxFinanceTool, createNsvxTools, FINANCE_VIEWS } from "./tools.js";

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
  const names = [
    ...createNsvxTools({} as NsvxClient).map((tool) => tool.name),
    createNsvxFinanceTool({} as NsvxClient, {}).name,
  ];
  expect(manifest.contracts.tools.toSorted()).toEqual(names.toSorted());
});
