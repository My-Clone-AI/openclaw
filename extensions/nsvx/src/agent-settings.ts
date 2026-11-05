import type { PluginRuntime } from "openclaw/plugin-sdk/runtime-store";
import { NsvxError } from "./client.js";
import {
  PROFILES as TOOL_PROFILES,
  THINKING,
  type Idea,
  type ToolAccess,
  type ToolProfile,
} from "./setup-data.js";
import type { TeamService, TeamVersion } from "./team.js";

/**
 * Agent instructions, tool access, and team defaults, as NSVX's Architecture Manager edits them
 * (openclaw_admin/service.py and mutations.py). The Gateway config and each agent's AGENTS.md stay the
 * only owners; NSVX writes the same marked sections, so both apps read and change the same text.
 */

/** Sections NSVX owns inside an agent's AGENTS.md; text outside them is hand-written and never touched. */
export const SECTIONS = {
  managed: ["<!-- nsvx-openclaw:managed:start -->", "<!-- nsvx-openclaw:managed:end -->"],
  policies: ["<!-- nsvx-openclaw:policies:start -->", "<!-- nsvx-openclaw:policies:end -->"],
} as const;
export type Section = keyof typeof SECTIONS;
const MARKERS: string[] = Object.values(SECTIONS).flat();
const MAX_SECTION = 32_000;
const MAX_RULES = 8_000;

const count = (text: string, part: string) => text.split(part).length - 1;

export function readSection(content: string, section: Section): string {
  const [start, end] = SECTIONS[section];
  if (count(content, start) !== 1 || count(content, end) !== 1) {
    return "";
  }
  return content.slice(content.indexOf(start) + start.length, content.indexOf(end)).trim();
}

/** Replaces one section; a missing or broken pair is refused rather than risk hand-written text. */
export function writeSection(content: string, text: string, section: Section): string {
  const [start, end] = SECTIONS[section];
  if (text.length > MAX_SECTION) {
    throw new NsvxError("invalid", "Text is too long.");
  }
  if (MARKERS.some((marker) => text.includes(marker))) {
    throw new NsvxError("invalid", "Text contains a reserved marker.");
  }
  const starts = count(content, start);
  const ends = count(content, end);
  const block = `${start}\n${text.trim()}\n${end}`;
  if (starts === 0 && ends === 0) {
    if (!text.trim()) {
      return content;
    }
    return `${content}${!content || content.endsWith("\n") ? "" : "\n"}\n${block}\n`;
  }
  const from = content.indexOf(start);
  const to = content.indexOf(end);
  if (starts !== 1 || ends !== 1 || from > to) {
    throw new NsvxError("conflict", "AGENTS.md has a broken NSVX section. Fix it by hand first.");
  }
  return content.slice(0, from) + block + content.slice(to + end.length);
}

const TOOL_NAME = /^[A-Za-z0-9_.:*/-]{1,96}$/;
const TOOL_LISTS = ["allow", "deny", "alsoAllow"] as const;
type ToolList = (typeof TOOL_LISTS)[number];

/** `null` clears a field so the agent inherits it again; an omitted field stays as it is. */
export type ToolAccessChange = { profile?: ToolProfile | null } & Partial<
  Record<ToolList, string[] | null>
>;

export function parseToolAccess(params: Record<string, unknown>): ToolAccessChange {
  const change: ToolAccessChange = {};
  if ("profile" in params) {
    const profile = params.profile;
    if (profile !== null && !TOOL_PROFILES.includes(profile as ToolProfile)) {
      throw new NsvxError("invalid", "Unknown tool profile.");
    }
    change.profile = profile as ToolProfile | null;
  }
  for (const key of TOOL_LISTS) {
    if (!(key in params)) {
      continue;
    }
    const value = params[key];
    if (value === null) {
      change[key] = null;
      continue;
    }
    if (
      !Array.isArray(value) ||
      value.length > 200 ||
      !value.every((name) => typeof name === "string" && TOOL_NAME.test(name))
    ) {
      throw new NsvxError("invalid", `${key} must be a list of tool names.`);
    }
    // An empty only-these list would read as "no limit", the opposite of what was picked.
    if (key === "allow" && value.length === 0) {
      throw new NsvxError("invalid", "Pick at least one tool, or turn off only-these.");
    }
    change[key] = [...new Set(value as string[])];
  }
  if (Object.keys(change).length === 0) {
    throw new NsvxError("invalid", "Nothing to change.");
  }
  return change;
}

/** Applies a change onto an agent's `tools` block, keeping exec, fs, and every other tool setting. */
export function applyToolAccess(
  tools: Record<string, unknown> | undefined,
  change: ToolAccessChange,
): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = { ...tools };
  for (const [key, value] of Object.entries(change)) {
    if (value === null || (Array.isArray(value) && value.length === 0)) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  const allow = next.allow as string[] | undefined;
  const alsoAllow = next.alsoAllow as string[] | undefined;
  // The config schema rejects both in one scope; refuse here so the write never fails half-way.
  if (allow?.length && alsoAllow?.length) {
    throw new NsvxError("invalid", "Use either only-these tools or extra tools, not both.");
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * NSVX blocks paid API providers (openclaw_admin/graph.py provider_kind): only subscription CLIs and
 * loopback clone-ai may be picked. The kind comes from the provider's real config, never its name alone.
 */
const SUBSCRIPTION = new Set(["openai", "claude-cli", "openai-codex", "codex", "claude-code"]);
const BLOCKED = new Set(["xai"]);
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export type ProviderKind = "subscription" | "local" | "paid";

export function providerKind(
  name: string,
  config?: { baseUrl?: unknown; api?: unknown },
): ProviderKind {
  if (BLOCKED.has(name)) {
    return "paid";
  }
  if (SUBSCRIPTION.has(name)) {
    return "subscription";
  }
  let host: string;
  try {
    host = typeof config?.baseUrl === "string" ? new URL(config.baseUrl).hostname : "";
  } catch {
    host = "";
  }
  return LOOPBACK.has(host) && config?.api === "openai-completions" ? "local" : "paid";
}

type ModelRef = string | { primary?: string; fallbacks?: string[] };

function primaryOf(model: unknown): string | undefined {
  if (typeof model === "string") {
    return model;
  }
  return typeof (model as { primary?: unknown } | undefined)?.primary === "string"
    ? (model as { primary: string }).primary
    : undefined;
}

type AgentConfig = {
  name?: string;
  identity?: { name?: string; emoji?: string; theme?: string };
  model?: ModelRef;
  thinkingDefault?: string;
  tools?: Record<string, unknown>;
  subagents?: { allowAgents?: string[] };
};

type Defaults = {
  model?: ModelRef;
  thinkingDefault?: string;
  maxConcurrent?: number;
  subagents?: { maxConcurrent?: number } & Record<string, unknown>;
} & Record<string, unknown>;

type Config = {
  agents?: { entries?: Record<string, AgentConfig>; defaults?: Defaults };
  models?: { providers?: Record<string, { baseUrl?: unknown; api?: unknown }> };
  tools?: { profile?: string };
};

type AgentFile = { content?: string; hash?: string; missing?: boolean };

type SettingsRuntime = {
  config: Pick<PluginRuntime["config"], "current">;
  gateway: Pick<PluginRuntime["gateway"], "request">;
};

export type DefaultsChange = {
  model?: string;
  thinkingDefault?: string;
  maxConcurrent?: number;
  subagentsMaxConcurrent?: number;
  rules?: string;
};

function intIn(value: unknown, name: string, low: number, high: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < low || value > high) {
    throw new NsvxError("invalid", `${name} must be ${low}-${high}.`);
  }
  return value;
}

export function parseDefaults(params: Record<string, unknown>): DefaultsChange {
  const change: DefaultsChange = {};
  if (params.model !== undefined) {
    if (typeof params.model !== "string" || !params.model.includes("/")) {
      throw new NsvxError("invalid", "Pick a model.");
    }
    change.model = params.model;
  }
  if (params.thinkingDefault !== undefined) {
    if (!THINKING.includes(params.thinkingDefault as (typeof THINKING)[number])) {
      throw new NsvxError("invalid", "Unknown thinking level.");
    }
    change.thinkingDefault = params.thinkingDefault as string;
  }
  if (params.maxConcurrent !== undefined) {
    change.maxConcurrent = intIn(params.maxConcurrent, "Agents at once", 1, 32);
  }
  if (params.subagentsMaxConcurrent !== undefined) {
    change.subagentsMaxConcurrent = intIn(params.subagentsMaxConcurrent, "Helpers at once", 1, 64);
  }
  if (params.rules !== undefined) {
    if (typeof params.rules !== "string" || params.rules.length > MAX_RULES) {
      throw new NsvxError("invalid", "Rules are too long.");
    }
    change.rules = params.rules;
  }
  if (Object.keys(change).length === 0) {
    throw new NsvxError("invalid", "Nothing to change.");
  }
  return change;
}

/** One suggested agent to create; `exists` is NSVX's read-only flag. */
type AgentIdea = Omit<Idea, "exists" | "model">;

const AGENT_ID = /^[a-z][a-z0-9-]{0,47}$/;

export function parseIdea(params: Record<string, unknown>): AgentIdea {
  const text = (key: string, max: number) =>
    typeof params[key] === "string" && params[key]
      ? (params[key] as string).slice(0, max)
      : undefined;
  const id = text("id", 48);
  if (!id || !AGENT_ID.test(id)) {
    throw new NsvxError("invalid", "Agent id must be short lowercase words.");
  }
  return {
    id,
    name: text("name", 64),
    emoji: text("emoji", 8),
    supervisor: text("supervisor", 48),
    theme: text("theme", 400),
  };
}

export function createAgentSettings(runtime: SettingsRuntime, team: TeamService) {
  const config = () => runtime.config.current() as Config;
  const entries = () => config().agents?.entries ?? {};

  const known = (agent: string) => {
    if (!entries()[agent]) {
      throw new NsvxError("not-found", `Agent ${agent} is not in the Gateway config.`);
    }
  };

  const readFile = async (agent: string) =>
    (
      await runtime.gateway.request<{ file?: AgentFile }>(
        "agents.files.get",
        { agentId: agent, name: "AGENTS.md" },
        { scopes: ["operator.read"] },
      )
    ).file ?? {};

  /** Writes one section with the file's hash, so a hand edit made meanwhile fails instead of being lost. */
  const writeFile = async (agent: string, section: Section, text: string) => {
    const file = await readFile(agent);
    const before = readSection(file.content ?? "", section);
    const params: Record<string, unknown> = {
      agentId: agent,
      name: "AGENTS.md",
      content: writeSection(file.content ?? "", text, section),
    };
    if (file.missing) {
      params.expectedMissing = true;
    } else if (file.hash) {
      params.expectedHash = file.hash;
    } else {
      throw new NsvxError("conflict", "AGENTS.md has no revision. Reload and try again.");
    }
    if (params.content !== (file.content ?? "")) {
      await runtime.gateway.request("agents.files.set", params, { scopes: ["operator.admin"] });
    }
    return before;
  };

  const mainAgent = async () =>
    (
      await runtime.gateway.request<{ defaultId: string }>("agents.list", undefined, {
        scopes: ["operator.read"],
      })
    ).defaultId;

  /** Models the team may use: in the Gateway catalog and not a paid provider. */
  const models = async () => {
    const providers = config().models?.providers ?? {};
    const listed = await runtime.gateway.request<{
      models: { id: string; name?: string; provider: string }[];
    }>("models.list", {}, { scopes: ["operator.read"] });
    return listed.models.map((model) => ({
      ref: `${model.provider}/${model.id}`,
      name: model.name ?? model.id,
      provider: model.provider,
      kind: providerKind(model.provider, providers[model.provider]),
    }));
  };

  return {
    /** One agent's NSVX instructions section and its tool access. */
    async agent(agent: string) {
      known(agent);
      const entry = entries()[agent] ?? {};
      const file = await readFile(agent);
      const tools = entry.tools ?? {};
      const access: ToolAccess = {};
      if (typeof tools.profile === "string") {
        access.profile = tools.profile as ToolProfile;
      }
      for (const key of TOOL_LISTS) {
        if (Array.isArray(tools[key])) {
          access[key] = tools[key] as string[];
        }
      }
      return {
        agentId: agent,
        instructions: readSection(file.content ?? "", "managed"),
        tools: access,
        /** The Gateway-wide profile an agent without its own uses; none means every tool. */
        inheritedProfile: config().tools?.profile ?? null,
        model: primaryOf(entry.model) ?? null,
        thinking: entry.thinkingDefault ?? null,
      };
    },

    /** Returns the old text, so Control can offer Undo. */
    async setInstructions(agent: string, text: string) {
      known(agent);
      const previous = await writeFile(agent, "managed", text);
      return { agentId: agent, previous };
    },

    async setTools(agent: string, change: ToolAccessChange, by: TeamVersion["by"] = "control") {
      known(agent);
      const version = await team.edit("tools", agent, by, (draft) => {
        const entry = (draft.agents?.entries as Record<string, AgentConfig> | undefined)?.[agent];
        if (!entry) {
          throw new NsvxError("not-found", `Agent ${agent} is not in the Gateway config.`);
        }
        const tools = applyToolAccess(entry.tools, change);
        if (tools) {
          entry.tools = tools;
        } else {
          delete entry.tools;
        }
      });
      return { agentId: agent, version };
    },

    /** Team-wide defaults and the main agent's rules section (NSVX "policies"). */
    async defaults() {
      const defaults = config().agents?.defaults ?? {};
      const main = await mainAgent();
      const [file, list] = await Promise.all([readFile(main), models()]);
      const rules = readSection(file.content ?? "", "policies");
      return {
        mainAgent: main,
        model: primaryOf(defaults.model) ?? null,
        thinkingDefault: defaults.thinkingDefault ?? null,
        maxConcurrent: defaults.maxConcurrent ?? null,
        subagentsMaxConcurrent: defaults.subagents?.maxConcurrent ?? null,
        rules,
        models: list,
      };
    },

    async setDefaults(change: DefaultsChange, by: TeamVersion["by"] = "control") {
      if (change.model) {
        const model = (await models()).find((entry) => entry.ref === change.model);
        if (!model) {
          throw new NsvxError("invalid", "That model is not on this Gateway.");
        }
        if (model.kind === "paid") {
          throw new NsvxError("denied", "Paid API models are blocked. Pick a plan or local model.");
        }
      }
      let version: string | undefined;
      const { rules, ...fields } = change;
      if (Object.keys(fields).length > 0) {
        version = await team.edit("defaults", "", by, (draft) => {
          const agents = (draft.agents ??= {}) as NonNullable<Config["agents"]>;
          const defaults = (agents.defaults ??= {});
          if (fields.model) {
            // NSVX replaces the chain: one primary, no fallbacks left from an older pick.
            defaults.model = { primary: fields.model, fallbacks: [] };
          }
          if (fields.thinkingDefault) {
            defaults.thinkingDefault = fields.thinkingDefault;
          }
          if (fields.maxConcurrent) {
            defaults.maxConcurrent = fields.maxConcurrent;
          }
          if (fields.subagentsMaxConcurrent) {
            defaults.subagents = {
              ...defaults.subagents,
              maxConcurrent: fields.subagentsMaxConcurrent,
            };
          }
        });
      }
      let previousRules: string | undefined;
      if (rules !== undefined) {
        previousRules = await writeFile(await mainAgent(), "policies", rules);
      }
      return { version, ...(previousRules !== undefined ? { previousRules } : {}) };
    },

    /**
     * Adds one suggested agent: create it, give it its name, emoji, and role, then put it under its
     * lead. Each step is a normal Gateway write, so a failure leaves a real, visible agent to fix.
     */
    async adopt(idea: AgentIdea, by: TeamVersion["by"] = "control") {
      if (!AGENT_ID.test(idea.id)) {
        throw new NsvxError("invalid", "Agent id must be short lowercase words.");
      }
      if (entries()[idea.id]) {
        throw new NsvxError("conflict", `Agent ${idea.id} already exists.`);
      }
      const lead =
        idea.supervisor && entries()[idea.supervisor] ? idea.supervisor : await mainAgent();
      const created = await runtime.gateway.request<{ agentId: string }>(
        "agents.create",
        {
          name: (idea.name ?? idea.id).slice(0, 64),
          agentId: idea.id,
          ...(idea.emoji ? { emoji: idea.emoji.slice(0, 8) } : {}),
        },
        { scopes: ["operator.admin"] },
      );
      if (idea.theme) {
        await team.edit("add", created.agentId, by, (draft) => {
          const entry = (draft.agents?.entries as Record<string, AgentConfig> | undefined)?.[
            created.agentId
          ];
          if (entry) {
            entry.identity = { ...entry.identity, theme: idea.theme?.slice(0, 400) };
          }
        });
      }
      await team.move(created.agentId, lead, by);
      return { agentId: created.agentId, supervisor: lead };
    },
  };
}

export type AgentSettings = ReturnType<typeof createAgentSettings>;
