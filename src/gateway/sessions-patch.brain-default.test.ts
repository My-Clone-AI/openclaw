import { describe, expect, test } from "vitest";
import type { ModelCatalogEntry } from "../agents/model-catalog.types.js";
import { expectPatchOk, runPatch } from "./sessions-patch.test-support.js";

const key = "agent:boss:dashboard:fafcef26-5bb9-47da-82b2-fc48c6e3e9d9";

const catalog: ModelCatalogEntry[] = [
  { provider: "openai", id: "gpt-6.1-terra", name: "Terra 6.1" },
  { provider: "openai", id: "gpt-5.4", name: "GPT 5.4" },
];

describe("brain agent session patches", () => {
  test("stores a picked model and thinking level instead of locking Terra", async () => {
    const store = { [key]: { sessionId: "sess-boss", updatedAt: 1 } };
    const entry = expectPatchOk(
      await runPatch({
        store,
        storeKey: key,
        agentId: "boss",
        patch: {
          key,
          expectedSessionId: "sess-boss",
          model: "openai/gpt-5.4",
          thinkingLevel: "high",
        },
        loadGatewayModelCatalog: async () => catalog,
      }),
    );
    expect(entry.modelOverride).toBe("gpt-5.4");
    expect(entry.providerOverride).toBe("openai");
    expect(entry.thinkingLevel).toBe("high");
    expect(entry.modelSelectionLocked).not.toBe(true);
  });

  test("allows archive and rename when the current session id is sent", async () => {
    const store = {
      [key]: { sessionId: "sess-boss", updatedAt: 1, label: "old name" },
    };
    expectPatchOk(
      await runPatch({
        store,
        storeKey: key,
        agentId: "boss",
        patch: { key, expectedSessionId: "sess-boss", label: "renamed chat" },
      }),
    );
    expect(store[key]?.label).toBe("renamed chat");
    expectPatchOk(
      await runPatch({
        store,
        storeKey: key,
        agentId: "boss",
        patch: { key, expectedSessionId: "sess-boss", archived: true },
      }),
    );
    expect(store[key]?.archivedAt).toEqual(expect.any(Number));
  });
});
