import type { PluginStateKeyedStore } from "openclaw/plugin-sdk/plugin-state-runtime";
import type { PluginRuntime } from "openclaw/plugin-sdk/runtime-store";
import { NsvxError } from "./client.js";
import type { AgentEntry, TeamSession } from "./org.js";

/** Who led the agent before the pause, so resume restores the same tree (NSVX openclaw_admin_paused). */
export type PausedAgent = { supervisors: string[]; pausedAt: number };

type TeamRuntime = {
  config: Pick<PluginRuntime["config"], "current" | "mutateConfigFile">;
  gateway: Pick<PluginRuntime["gateway"], "request">;
};

type PausedStore = Pick<
  PluginStateKeyedStore<PausedAgent, 2>,
  "lookup" | "register" | "delete" | "entries"
>;

export function openPausedStore(runtime: Pick<PluginRuntime, "state">): PausedStore {
  return runtime.state.openKeyedStoreV2<PausedAgent>({
    namespace: "nsvx-paused",
    retention: "retained",
  });
}

type Entries = Record<string, AgentEntry>;

function entriesOf(config: { agents?: { entries?: unknown } }): Entries {
  return (config.agents?.entries ?? {}) as Entries;
}

/**
 * Pause and resume, as NSVX's Architecture Manager does them: a paused agent leaves every
 * supervisor's delegation list and its live runs stop; resume puts it back under the same leads.
 * The Gateway config stays the only owner of the tree; this store only remembers the old leads.
 */
export function createTeamService(runtime: TeamRuntime, openStore: () => PausedStore) {
  // Opened on first use, so loading the plugin for metadata never touches the state database.
  let opened: PausedStore | undefined;
  const store = () => (opened ??= openStore());
  const writeTree = (mutate: (entries: Entries) => void) =>
    runtime.config.mutateConfigFile({
      afterWrite: { mode: "auto" },
      mutate: (draft) => {
        mutate(entriesOf(draft));
      },
    });

  const knownAgent = async (agent: string) => {
    if (!entriesOf(runtime.config.current())[agent]) {
      throw new NsvxError("not-found", `Agent ${agent} is not in the Gateway config.`);
    }
    const roster = await runtime.gateway.request<{ defaultId: string }>("agents.list", undefined, {
      scopes: ["operator.read"],
    });
    return roster.defaultId;
  };

  /** Mirrors the Team tab's Stop: end live runs and drop what is queued behind them. */
  const stopRuns = async (agent: string) => {
    const { sessions } = await runtime.gateway.request<{ sessions: TeamSession[] }>(
      "sessions.list",
      { limit: 200 },
      { scopes: ["operator.read"] },
    );
    const live = sessions.filter(
      (session) =>
        session.key &&
        (session.agentId ?? session.key.split(":")[1]) === agent &&
        (session.hasActiveRun || session.status === "running"),
    );
    const results = await Promise.allSettled(
      live.map((session) =>
        runtime.gateway.request(
          "sessions.abort",
          { key: session.key, agentId: agent, clearQueued: true },
          { scopes: ["operator.write"] },
        ),
      ),
    );
    return {
      stopped: results.filter((result) => result.status === "fulfilled").length,
      failed: results.filter((result) => result.status === "rejected").length,
    };
  };

  return {
    async listPaused(): Promise<{ paused: ({ id: string } & PausedAgent)[] }> {
      const entries = await store().entries();
      return {
        paused: entries.map((entry) => ({
          id: entry.key,
          supervisors: entry.value.supervisors,
          pausedAt: entry.value.pausedAt,
        })),
      };
    },

    async pause(agent: string) {
      const defaultId = await knownAgent(agent);
      if (agent === defaultId) {
        throw new NsvxError("invalid", "The main agent cannot be paused.");
      }
      if (await store().lookup(agent)) {
        throw new NsvxError("conflict", `Agent ${agent} is already paused.`);
      }
      const supervisors = Object.entries(entriesOf(runtime.config.current()))
        .filter(([, entry]) => entry.subagents?.allowAgents?.includes(agent))
        .map(([id]) => id);
      // Record the leads before the tree changes: a lost record would strand the agent unlinked.
      await store().register(agent, { supervisors, pausedAt: Date.now() });
      try {
        await writeTree((entries) => {
          for (const entry of Object.values(entries)) {
            const children = entry.subagents?.allowAgents;
            if (children?.includes(agent)) {
              entry.subagents = {
                ...entry.subagents,
                allowAgents: children.filter((id) => id !== agent),
              };
            }
          }
        });
      } catch (cause) {
        await store().delete(agent);
        throw cause;
      }
      return { id: agent, supervisors, ...(await stopRuns(agent)) };
    },

    async resume(agent: string) {
      const defaultId = await knownAgent(agent);
      const paused = await store().lookup(agent);
      if (!paused) {
        throw new NsvxError("conflict", `Agent ${agent} is not paused.`);
      }
      const leads = new Set<string>();
      await writeTree((entries) => {
        // A lead deleted while the agent was paused falls back to the main agent.
        const alive = paused.supervisors.filter((id) => entries[id] && id !== agent);
        for (const id of alive.length > 0 ? alive : [defaultId]) {
          const entry = entries[id];
          if (!entry) {
            continue;
          }
          const children = entry.subagents?.allowAgents ?? [];
          if (!children.includes(agent)) {
            entry.subagents = { ...entry.subagents, allowAgents: [...children, agent] };
          }
          leads.add(id);
        }
      });
      await store().delete(agent);
      return { id: agent, supervisors: [...leads] };
    },
  };
}

export type TeamService = ReturnType<typeof createTeamService>;
