/** Boss, engineering, growops, and prompt-gen stay on one model with no fallbacks. */

export const BRAIN_AGENT_IDS = ["boss", "engineering", "growops", "prompt-gen"] as const;

export const BRAIN_MODEL_PROVIDER = "openai";
export const BRAIN_MODEL_ID = "gpt-6.1-terra";
export const BRAIN_MODEL_REF = `${BRAIN_MODEL_PROVIDER}/${BRAIN_MODEL_ID}`;
export const BRAIN_THINKING_LEVEL = "medium";

export const BRAIN_LOCK_MESSAGE =
  "This agent stays on Terra 6.1 with medium thinking and no fallbacks.";

export function isBrainAgentId(agentId: string | undefined | null): boolean {
  const id = agentId?.trim().toLowerCase();
  return id !== undefined && id.length > 0 && (BRAIN_AGENT_IDS as readonly string[]).includes(id);
}

export function agentIdFromSessionKey(sessionKey: string | undefined): string | undefined {
  const parts = sessionKey?.split(":") ?? [];
  return parts[0] === "agent" && parts[1] ? parts[1] : undefined;
}

export function isBrainLockedModel(model: string): boolean {
  const value = model.trim().toLowerCase();
  return value === BRAIN_MODEL_REF || value === BRAIN_MODEL_ID;
}

export function brainAgentPatchError(params: {
  agentId?: string;
  sessionKey?: string;
  patch: {
    model?: string | null;
    thinkingLevel?: string | null;
  };
}): string | undefined {
  const fromKey = agentIdFromSessionKey(params.sessionKey);
  if (!isBrainAgentId(params.agentId) && !isBrainAgentId(fromKey)) {
    return undefined;
  }
  if ("model" in params.patch && params.patch.model !== undefined) {
    if (params.patch.model === null || !isBrainLockedModel(params.patch.model)) {
      return BRAIN_LOCK_MESSAGE;
    }
  }
  if ("thinkingLevel" in params.patch && params.patch.thinkingLevel !== undefined) {
    const level = params.patch.thinkingLevel;
    if (level === null || level.trim().toLowerCase() !== BRAIN_THINKING_LEVEL) {
      return BRAIN_LOCK_MESSAGE;
    }
  }
  return undefined;
}

/** Native Control UI shows its locked model picker when this is true. */
export function sessionModelSelectionLocked(
  agentId: string | undefined,
  entryLocked: boolean | undefined,
): boolean | undefined {
  if (entryLocked === true || isBrainAgentId(agentId)) {
    return true;
  }
  return entryLocked;
}

export function brainAgentOnlyCandidate(): {
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
