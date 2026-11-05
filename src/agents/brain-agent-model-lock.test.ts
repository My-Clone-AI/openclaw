import { describe, expect, it } from "vitest";
import {
  BRAIN_LOCK_MESSAGE,
  BRAIN_MODEL_ID,
  BRAIN_MODEL_PROVIDER,
  brainAgentPatchError,
  isBrainAgentId,
  sessionModelSelectionLocked,
} from "./brain-agent-model-lock.js";
import { resolveModelCandidateChain } from "./model-fallback-candidates.js";

describe("brain agent model lock", () => {
  it("recognizes the four brain agents", () => {
    expect(isBrainAgentId("boss")).toBe(true);
    expect(isBrainAgentId("Engineering")).toBe(true);
    expect(isBrainAgentId("growops")).toBe(true);
    expect(isBrainAgentId("prompt-gen")).toBe(true);
    expect(isBrainAgentId("worker")).toBe(false);
  });

  it("refuses a different model or thinking level and keeps Terra medium", () => {
    const sessionKey = "agent:boss:dashboard:fafcef26-5bb9-47da-82b2-fc48c6e3e9d9";
    expect(brainAgentPatchError({ sessionKey, patch: { model: "xai/grok-4" } })).toBe(
      BRAIN_LOCK_MESSAGE,
    );
    expect(brainAgentPatchError({ agentId: "boss", patch: { model: null } })).toBe(
      BRAIN_LOCK_MESSAGE,
    );
    expect(brainAgentPatchError({ agentId: "prompt-gen", patch: { thinkingLevel: "high" } })).toBe(
      BRAIN_LOCK_MESSAGE,
    );
    expect(
      brainAgentPatchError({
        agentId: "engineering",
        patch: { model: "openai/gpt-6.1-terra", thinkingLevel: "medium" },
      }),
    ).toBeUndefined();
    expect(brainAgentPatchError({ agentId: "worker", patch: { model: "openai/other" } })).toBe(
      undefined,
    );
    expect(sessionModelSelectionLocked("boss", undefined)).toBe(true);
    expect(sessionModelSelectionLocked("worker", undefined)).toBeUndefined();
  });

  it("runs a brain agent on Terra only, with no fallbacks", () => {
    expect(
      resolveModelCandidateChain({
        cfg: {
          agents: {
            defaults: {
              model: {
                primary: "openai/gpt-6.1-terra",
                fallbacks: ["openai/backup", "xai/grok-4"],
              },
            },
          },
        },
        agentId: "boss",
        provider: "xai",
        model: "grok-4",
        fallbacksOverride: ["openai/backup"],
        manifestPlugins: [],
      }),
    ).toEqual([
      {
        provider: BRAIN_MODEL_PROVIDER,
        model: BRAIN_MODEL_ID,
        routeOrigin: "requested",
        routeResolution: "resolved",
      },
    ]);
  });
});
