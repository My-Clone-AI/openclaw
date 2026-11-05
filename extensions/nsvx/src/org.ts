/** Agent team tree from Gateway config, the same facts NSVX's Architecture Manager reads. */

export type AgentEntry = {
  name?: string;
  identity?: { name?: string; emoji?: string };
  subagents?: { allowAgents?: string[] };
  tools?: { exec?: { host?: string; node?: string } };
};

export type TeamSession = {
  key?: string;
  agentId?: string;
  hasActiveRun?: boolean;
  status?: string;
  abortedLastRun?: boolean;
};

export type TeamAgentState = "running" | "error" | "idle";

export type TeamAgent = {
  id: string;
  name: string;
  emoji: string | undefined;
  depth: number;
  supervisors: string[];
  node: string | undefined;
  sessions: number;
  running: number;
  /** Keys of sessions with a live run; stopping the agent aborts exactly these. */
  runningKeys: string[];
  state: TeamAgentState;
};

export type TeamChart = {
  /** Depth-first, so indenting by depth draws the tree. */
  agents: TeamAgent[];
  /** Agents nobody delegates to and that are not the default. */
  unlinked: TeamAgent[];
};

export function buildTeamChart(params: {
  entries: Record<string, AgentEntry>;
  roster: readonly { id: string; name?: string }[];
  defaultId: string;
  sessions: readonly TeamSession[];
}): TeamChart {
  const ids = [
    ...new Set([...params.roster.map((agent) => agent.id), ...Object.keys(params.entries)]),
  ];
  const known = new Set(ids);
  const childrenOf = (id: string) =>
    (params.entries[id]?.subagents?.allowAgents ?? []).filter((child) => known.has(child));
  const supervisorsOf = (id: string) => ids.filter((parent) => childrenOf(parent).includes(id));
  const sessionsOf = (id: string) =>
    params.sessions.filter((session) => (session.agentId ?? session.key?.split(":")[1]) === id);
  const describe = (id: string, depth: number): TeamAgent => {
    const entry = params.entries[id];
    const sessions = sessionsOf(id);
    const live = sessions.filter((session) => session.hasActiveRun || session.status === "running");
    const failed = sessions.some(
      (session) => session.abortedLastRun || session.status === "failed",
    );
    return {
      id,
      name:
        entry?.identity?.name ??
        entry?.name ??
        params.roster.find((agent) => agent.id === id)?.name ??
        id,
      emoji: entry?.identity?.emoji,
      depth,
      supervisors: supervisorsOf(id),
      node: entry?.tools?.exec?.node,
      sessions: sessions.length,
      running: live.length,
      runningKeys: live.flatMap((session) => (session.key ? [session.key] : [])),
      state: live.length > 0 ? "running" : failed ? "error" : "idle",
    };
  };
  const agents: TeamAgent[] = [];
  const seen = new Set<string>();
  // Config may hold a cycle or a second supervisor: each agent appears once, first path wins.
  const walk = (id: string, depth: number) => {
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    agents.push(describe(id, depth));
    childrenOf(id).forEach((child) => walk(child, depth + 1));
  };
  if (known.has(params.defaultId)) {
    walk(params.defaultId, 0);
  }
  return {
    agents,
    unlinked: ids.filter((id) => !seen.has(id)).map((id) => describe(id, 0)),
  };
}

export class TeamMoveError extends Error {
  constructor(readonly reason: "unknown" | "self" | "loop") {
    super(reason);
    this.name = "TeamMoveError";
  }
}

/** Gives `agent` exactly one supervisor. Reparenting under a descendant would orphan the branch. */
export function moveAgent(entries: Record<string, AgentEntry>, agent: string, supervisor: string) {
  const target = entries[supervisor];
  if (!target) {
    throw new TeamMoveError("unknown");
  }
  if (agent === supervisor) {
    throw new TeamMoveError("self");
  }
  const reachable = new Set<string>();
  const visit = (id: string) => {
    for (const child of entries[id]?.subagents?.allowAgents ?? []) {
      if (!reachable.has(child)) {
        reachable.add(child);
        visit(child);
      }
    }
  };
  visit(agent);
  if (reachable.has(supervisor)) {
    throw new TeamMoveError("loop");
  }
  for (const [parent, entry] of Object.entries(entries)) {
    const children = entry.subagents?.allowAgents ?? [];
    if (parent !== supervisor && children.includes(agent)) {
      entry.subagents = { ...entry.subagents, allowAgents: children.filter((id) => id !== agent) };
    }
  }
  const children = target.subagents?.allowAgents ?? [];
  if (!children.includes(agent)) {
    target.subagents = { ...target.subagents, allowAgents: [...children, agent] };
  }
}

/** Runs an agent's commands on a paired device, or back on the Gateway host with null. */
export function assignAgent(
  entries: Record<string, AgentEntry>,
  agent: string,
  node: string | null,
) {
  const entry = entries[agent];
  if (!entry) {
    throw new TeamMoveError("unknown");
  }
  const { host: _host, node: _node, ...exec } = entry.tools?.exec ?? {};
  entry.tools = { ...entry.tools, exec: node ? { ...exec, host: "node", node } : exec };
}
