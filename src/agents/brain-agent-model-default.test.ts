import { describe, expect, it } from "vitest";
import {
  BRAIN_MODEL_ID,
  BRAIN_MODEL_PROVIDER,
  BRAIN_THINKING_LEVEL,
  isBrainAgentId,
} from "./brain-agent-model-default.js";
import { resolveModelCandidateChain } from "./model-fallback-candidates.js";
import { resolveDefaultModelForAgent } from "./model-selection-config.js";
import { resolveConfiguredThinkingDefaultCore } from "./model-thinking-default-core.js";

const cfg = {
  agents: {
    defaults: {
      model: {
        primary: "openai/gpt-5.4",
        fallbacks: ["openai/backup", "xai/grok-4"],
      },
      thinkingDefault: "high" as const,
    },
  },
};

describe("brain agent model default", () => {
  it("recognizes the four brain agents", () => {
    expect(isBrainAgentId("boss")).toBe(true);
    expect(isBrainAgentId("Engineering")).toBe(true);
    expect(isBrainAgentId("growops")).toBe(true);
    expect(isBrainAgentId("prompt-gen")).toBe(true);
    expect(isBrainAgentId("worker")).toBe(false);
  });

  it("preselects Terra Medium and does not lock another picked model", () => {
    expect(resolveDefaultModelForAgent({ cfg, agentId: "boss" })).toEqual({
      provider: BRAIN_MODEL_PROVIDER,
      model: BRAIN_MODEL_ID,
    });
    expect(
      resolveConfiguredThinkingDefaultCore({
        cfg,
        agentId: "boss",
        provider: BRAIN_MODEL_PROVIDER,
        model: BRAIN_MODEL_ID,
      }),
    ).toBe(BRAIN_THINKING_LEVEL);
    expect(
      resolveModelCandidateChain({
        cfg,
        agentId: "boss",
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
    expect(
      resolveModelCandidateChain({
        cfg,
        agentId: "boss",
        provider: "openai",
        model: "gpt-5.4",
        fallbacksOverride: ["openai/backup", "xai/grok-4"],
        manifestPlugins: [],
      }),
    ).toEqual([
      {
        provider: "openai",
        model: "gpt-5.4",
        routeOrigin: "requested",
        routeResolution: "resolved",
      },
    ]);
    expect(resolveDefaultModelForAgent({ cfg, agentId: "worker" }).model).toBe("gpt-5.4");
  });
});
