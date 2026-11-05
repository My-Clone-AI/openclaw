/** Boss, engineering, growops, and prompt-gen start on Terra Medium. A picked model is used. */

export const BRAIN_AGENT_IDS = ["boss", "engineering", "growops", "prompt-gen"] as const;

export const BRAIN_MODEL_PROVIDER = "openai";
export const BRAIN_MODEL_ID = "gpt-6.1-terra";
export const BRAIN_MODEL_REF = `${BRAIN_MODEL_PROVIDER}/${BRAIN_MODEL_ID}`;
export const BRAIN_THINKING_LEVEL = "medium" as const;

export function isBrainAgentId(agentId: string | undefined | null): boolean {
  const id = agentId?.trim().toLowerCase();
  return id !== undefined && id.length > 0 && (BRAIN_AGENT_IDS as readonly string[]).includes(id);
}

export function brainAgentDefaultCandidate(): {
  provider: typeof BRAIN_MODEL_PROVIDER;
  model: typeof BRAIN_MODEL_ID;
  routeOrigin: "requested";
  routeResolution: "resolved";
} {
  return {
    provider: BRAIN_MODEL_PROVIDER,
    model: BRAIN_MODEL_ID,
    routeOrigin: "requested",
    routeResolution: "resolved",
  };
}
