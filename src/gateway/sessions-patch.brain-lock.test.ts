import { describe, expect, test } from "vitest";
import { BRAIN_LOCK_MESSAGE } from "../agents/brain-agent-model-lock.js";
import { expectPatchError, expectPatchOk, runPatch } from "./sessions-patch.test-support.js";

const key = "agent:boss:dashboard:fafcef26-5bb9-47da-82b2-fc48c6e3e9d9";

describe("brain agent session patches", () => {
  test("rejects a model change away from Terra 6.1", async () => {
    const store = { [key]: { sessionId: "sess-boss", updatedAt: 1 } };
    expectPatchError(
      await runPatch({
        store,
        storeKey: key,
        agentId: "boss",
        patch: { key, expectedSessionId: "sess-boss", model: "openai/gpt-5.4" },
      }),
      BRAIN_LOCK_MESSAGE,
    );
    expect(store[key]).toMatchObject({ sessionId: "sess-boss" });
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
