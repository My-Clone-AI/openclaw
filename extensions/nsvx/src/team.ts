import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { PluginStateKeyedStore } from "openclaw/plugin-sdk/plugin-state-runtime";
import type { PluginRuntime } from "openclaw/plugin-sdk/runtime-store";
import { NsvxError } from "./client.js";
import { assignAgent, moveAgent, TeamMoveError, type AgentEntry, type TeamSession } from "./org.js";

/** Who led the agent before the pause, so resume restores the same tree (NSVX openclaw_admin_paused). */
export type PausedAgent = { supervisors: string[]; pausedAt: number };

type TeamRuntime = {
  config: Pick<PluginRuntime["config"], "current" | "mutateConfigFile">;
  gateway: Pick<PluginRuntime["gateway"], "request">;
};

export type TeamChange =
  | "move"
  | "assign"
  | "pause"
  | "resume"
  | "rollback"
  | "tools"
  | "defaults"
  | "add";

/** One tree change, as NSVX's openclaw_admin_history row: who, what, and the section before it. */
export type TeamVersion = {
  at: number;
  change: TeamChange;
  agent: string;
  /** New lead for move, device for assign, restored version for rollback. */
  target?: string | null;
  by: "control" | "chat";
  beforeHash: string | null;
  /** Null when the write was never confirmed; such a version is shown, never retried. */
  afterHash: string | null;
  /** The authored `agents` config section before the change. */
  before: unknown;
};

type Store<V> = Pick<PluginStateKeyedStore<V, 2>, "lookup" | "register" | "delete" | "entries">;
type PausedStore = Store<PausedAgent>;
type HistoryStore = Store<TeamVersion>;

export function openPausedStore(runtime: Pick<PluginRuntime, "state">): PausedStore {
  return runtime.state.openKeyedStoreV2<PausedAgent>({
    namespace: "nsvx-paused",
    retention: "retained",
  });
}

export function openHistoryStore(runtime: Pick<PluginRuntime, "state">): HistoryStore {
  return runtime.state.openKeyedStoreV2<TeamVersion>({
    namespace: "nsvx-team-history",
    maxEntries: 100,
    overflowPolicy: "evict-oldest",
  });
}

type Entries = Record<string, AgentEntry>;
type Draft = { agents?: { entries?: unknown } & Record<string, unknown> };

function entriesOf(config: Draft): Entries {
  return (config.agents?.entries ?? {}) as Entries;
}

/** Keys sort by time, so the newest version is last in key order. */
function versionId(at: number) {
  return `${at.toString(36).padStart(10, "0")}-${randomUUID().slice(0, 8)}`;
}

/**
 * Tree changes as NSVX's Architecture Manager makes them: move, assign, pause, resume, and rollback.
 * A paused agent leaves every supervisor's delegation list and its live runs stop; resume puts it
 * back under the same leads. The Gateway config stays the only owner of the tree; these stores only
 * remember old leads and before-images.
 */
export function createTeamService(
  runtime: TeamRuntime,
  openStores: () => { paused: PausedStore; history: HistoryStore },
) {
  // Opened on first use, so loading the plugin for metadata never touches the state database.
  let opened: ReturnType<typeof openStores> | undefined;
  const store = () => (opened ??= openStores()).paused;
  const history = () => (opened ??= openStores()).history;
  let lastAt = 0;

  /** Every tree write goes through here, so each one leaves a version that rollback can restore. */
  const writeTree = async (
    change: Omit<TeamVersion, "at" | "beforeHash" | "afterHash" | "before">,
    mutate: (draft: Draft) => void,
  ) => {
    // Strictly increasing, so two changes in one millisecond keep their order.
    const at = (lastAt = Math.max(Date.now(), lastAt + 1));
    const id = versionId(at);
    let logged: TeamVersion | undefined;
    const written = await runtime.config.mutateConfigFile({
      afterWrite: { mode: "auto" },
      mutate: async (draft: Draft, context) => {
        const before = structuredClone(draft.agents ?? {});
        mutate(draft);
        if (isDeepStrictEqual(before, draft.agents ?? {})) {
          return;
        }
        logged = { ...change, at, beforeHash: context.previousHash, afterHash: null, before };
        // Logged before the file changes, so even a lost write leaves a before-image behind.
        await history().register(id, logged);
      },
    });
    if (logged) {
      await history().register(id, { ...logged, afterHash: written.persistedHash ?? null });
    }
    return logged ? id : undefined;
  };

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

    async pause(agent: string, by: TeamVersion["by"] = "control") {
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
        await writeTree({ change: "pause", agent, by }, (draft) => {
          for (const entry of Object.values(entriesOf(draft))) {
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

    async resume(agent: string, by: TeamVersion["by"] = "control") {
      const defaultId = await knownAgent(agent);
      const paused = await store().lookup(agent);
      if (!paused) {
        throw new NsvxError("conflict", `Agent ${agent} is not paused.`);
      }
      const leads = new Set<string>();
      await writeTree({ change: "resume", agent, by }, (draft) => {
        const entries = entriesOf(draft);
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

    async move(agent: string, supervisor: string, by: TeamVersion["by"] = "control") {
      await knownAgent(agent);
      // As in NSVX: a paused agent has no leads to move; resume it first.
      if (await store().lookup(agent)) {
        throw new NsvxError("conflict", `Agent ${agent} is paused.`);
      }
      const version = await writeTree(
        { change: "move", agent, target: supervisor, by },
        (draft) => {
          try {
            moveAgent(entriesOf(draft), agent, supervisor);
          } catch (cause) {
            throw cause instanceof TeamMoveError
              ? new NsvxError(
                  "invalid",
                  `Cannot move ${agent} under ${supervisor}: ${cause.reason}.`,
                )
              : cause;
          }
        },
      );
      return { id: agent, supervisor, version };
    },

    async assign(agent: string, node: string | null, by: TeamVersion["by"] = "control") {
      await knownAgent(agent);
      const version = await writeTree({ change: "assign", agent, target: node, by }, (draft) =>
        assignAgent(entriesOf(draft), agent, node),
      );
      return { id: agent, node, version };
    },

    /**
     * Agent settings (tool access, team defaults, a new agent's role) share the tree's history, so
     * Undo restores them as well. `mutate` gets the config draft; no change logs nothing.
     */
    async edit(
      change: "tools" | "defaults" | "add",
      agent: string,
      by: TeamVersion["by"],
      mutate: (draft: Draft) => void,
    ) {
      return writeTree({ change, agent, by }, mutate);
    },

    /** Newest first, without the before-images. */
    async history(limit = 50) {
      const entries = await history().entries();
      return {
        versions: entries
          .toSorted((a, b) => b.key.localeCompare(a.key))
          .slice(0, Math.min(Math.max(limit, 1), 100))
          .map(({ key, value: { before: _before, ...version } }) =>
            Object.assign(version, { id: key }),
          ),
      };
    },

    /**
     * Restores the `agents` section to how it was before `version`, as NSVX rollback does. A config
     * write cannot create or delete agents, so agents added since keep their entry and agents
     * deleted since stay deleted (`skipped`).
     */
    async rollback(version: string, by: TeamVersion["by"] = "control") {
      const target = await history().lookup(version);
      if (!target) {
        throw new NsvxError("not-found", `Version ${version} is not in the history.`);
      }
      let skipped: string[] = [];
      let tree: Entries = {};
      const id = await writeTree(
        { change: "rollback", agent: "", target: version, by },
        (draft) => {
          const current = entriesOf(draft);
          const before = structuredClone(target.before) as Draft["agents"] & object;
          const wanted = (before.entries ?? {}) as Entries;
          skipped = Object.keys(wanted).filter((agent) => !current[agent]);
          const entries: Entries = {};
          for (const [agent, entry] of Object.entries(current)) {
            const restored = wanted[agent] ?? entry;
            const children = restored.subagents?.allowAgents;
            entries[agent] = children
              ? {
                  ...restored,
                  subagents: {
                    ...restored.subagents,
                    allowAgents: children.filter((child) => !skipped.includes(child)),
                  },
                }
              : restored;
          }
          draft.agents = { ...before, entries };
          tree = entries;
        },
      );
      // Pause records follow the restored tree: an agent with a lead again is no longer paused.
      for (const { key } of await store().entries()) {
        const linked = Object.values(tree).some((entry) =>
          entry.subagents?.allowAgents?.includes(key),
        );
        if (!tree[key] || linked) {
          await store().delete(key);
        }
      }
      return { version: id, restored: version, skipped };
    },
  };
}

export type TeamService = ReturnType<typeof createTeamService>;
