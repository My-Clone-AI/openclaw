/** Shapes and pure helpers shared by the Setup tab and agent-settings.ts; the Gateway methods own every write. */

export type ToolProfile = "minimal" | "coding" | "messaging" | "full";
export const PROFILES: ToolProfile[] = ["minimal", "coding", "messaging", "full"];
/** NSVX's thinking levels; the Gateway accepts more, but these are the ones both apps offer. */
export const THINKING = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

export type ToolAccess = {
  profile?: ToolProfile;
  allow?: string[];
  deny?: string[];
  alsoAllow?: string[];
};

export type AgentSettingsView = {
  agentId: string;
  instructions: string;
  tools: ToolAccess;
  inheritedProfile: ToolProfile | null;
  model: string | null;
  thinking: string | null;
};

export type CatalogTool = { id: string; label: string; defaultProfiles: ToolProfile[] };
export type ToolCatalog = { groups: { id: string; label: string; tools: CatalogTool[] }[] };

export type DefaultsView = {
  mainAgent: string;
  model: string | null;
  thinkingDefault: string | null;
  maxConcurrent: number | null;
  subagentsMaxConcurrent: number | null;
  rules: string;
  models: {
    ref: string;
    name: string;
    provider: string;
    kind: "subscription" | "local" | "paid";
  }[];
};

export type Idea = {
  id: string;
  name?: string;
  emoji?: string;
  supervisor?: string;
  theme?: string;
  model?: string;
  exists?: boolean;
};

/**
 * Whether the agent's config lets it use a tool: an only-these list wins, then deny, then the profile
 * (the agent's own or the inherited one; none means every tool) plus extras.
 */
export function toolOn(tool: CatalogTool, access: ToolAccess, inherited: ToolProfile | null) {
  if (access.deny?.includes(tool.id)) {
    return false;
  }
  if (access.allow) {
    return access.allow.includes(tool.id);
  }
  const profile = access.profile ?? inherited;
  return (
    !profile ||
    tool.defaultProfiles.includes(profile) ||
    Boolean(access.alsoAllow?.includes(tool.id))
  );
}

const without = (list: string[] | undefined, id: string) => {
  const next = (list ?? []).filter((entry) => entry !== id);
  return next.length > 0 ? next : undefined;
};

/** Flips one tool with the smallest config change: drop a deny or an extra before adding one. */
export function toggleTool(
  tool: CatalogTool,
  access: ToolAccess,
  inherited: ToolProfile | null,
): ToolAccess {
  const next: ToolAccess = { ...access };
  if (toolOn(tool, access, inherited)) {
    if (access.allow) {
      next.allow = (access.allow ?? []).filter((entry) => entry !== tool.id);
    } else if (access.alsoAllow?.includes(tool.id)) {
      next.alsoAllow = without(access.alsoAllow, tool.id);
    } else {
      next.deny = [...(access.deny ?? []), tool.id];
    }
    return next;
  }
  next.deny = without(access.deny, tool.id);
  if (!toolOn(tool, next, inherited)) {
    if (next.allow) {
      next.allow = [...next.allow, tool.id];
    } else {
      next.alsoAllow = [...(next.alsoAllow ?? []), tool.id];
    }
  }
  return next;
}

/** Only-these on: keep exactly the tools on now. Off: back to profile plus extras. */
export function setOnlyPicked(
  on: boolean,
  catalog: CatalogTool[],
  access: ToolAccess,
  inherited: ToolProfile | null,
): ToolAccess {
  if (on) {
    return {
      ...access,
      allow: catalog.filter((tool) => toolOn(tool, access, inherited)).map((tool) => tool.id),
      alsoAllow: undefined,
      deny: undefined,
    };
  }
  const { allow: _allow, ...rest } = access;
  return rest;
}

/** The change to send: every list field, `null` where it is now empty, so the Gateway clears it. */
export function accessChange(access: ToolAccess) {
  return {
    profile: access.profile ?? null,
    allow: access.allow ?? null,
    deny: access.deny?.length ? access.deny : null,
    alsoAllow: access.alsoAllow?.length ? access.alsoAllow : null,
  };
}
