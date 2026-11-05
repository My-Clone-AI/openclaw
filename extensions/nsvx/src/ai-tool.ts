import type { AnyAgentTool, OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";
import {
  LANES,
  currentNode,
  lanesOf,
  nodeState,
  providerState,
  usage,
  trainingRun,
  type AiKeys,
  type AiRequest,
  type AiState,
  type CloneAiBench,
  type InferenceOps,
  type CloneAiPanel,
  type GptVoice,
  type OpenClawProviders,
  type TrainingRun,
} from "./ai-data.js";
import { changeAi } from "./ai.js";
import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";
import { outcome } from "./tools.js";

const ACTIONS = [
  "status",
  "requests",
  "cloneAi",
  "voice",
  "laneOn",
  "laneOff",
  "laneFirst",
  "skip",
  "restore",
  "testLane",
  "testAccount",
  "accountOn",
  "accountOff",
  "cloneAiOn",
  "cloneAiOff",
  "setVoice",
  "flows",
  "train",
  "pauseTraining",
  "setServer",
  "appsOn",
  "appsOff",
] as const;
type Action = (typeof ACTIONS)[number];

type AiToolParams = {
  action: Action;
  lane?: (typeof LANES)[number];
  providerId?: string;
  model?: string;
  reason?: string;
  status?: string;
  limit?: number;
  settings?: Record<string, unknown>;
  serverId?: string;
  parity?: "odd" | "even" | "none";
};

const READS = new Set<Action>(["status", "requests", "cloneAi", "voice", "flows"]);

/**
 * The owner's NSVX inference: which model answers each kind of work, the order it falls back in, subscription
 * usage, recent requests, Clone AI on the Mac, and voice-note settings. Changes run only on the owner's own,
 * still-current turn; promotion rollback, provider registration, and training stay on the Control screen,
 * which asks first.
 */
export function createNsvxAiTool(
  client: NsvxClient,
  context: Pick<OpenClawPluginToolContext, "senderIsOwner" | "assertInvocationCurrent">,
): AnyAgentTool {
  return {
    name: "nsvx_ai",
    label: "NSVX AI",
    description:
      "The owner's NSVX AI routing. status shows each lane (normal chat, tasks, repair/coding, legal, PDF forms) with the model answering now, its fallback order and state, and every subscription account with usage; requests lists recent model calls (filter by lane or status: ok, failed, limited); cloneAi shows the local Clone AI model on the Mac, its routing, promotion, and training; voice shows GPT voice-note settings. laneOn/laneOff switch a lane; laneFirst moves a provider (and optional model) to the top of a lane; skip (with a reason) and restore skip or restore a provider in a lane; testLane and testAccount make one real test call; accountOn/accountOff switch a subscription account; cloneAiOn/cloneAiOff admit or remove Clone AI from routes; setVoice changes voice settings (voice, style, language, length, autoplay, mic_input); flows shows which model serves chat, work, and code, every lane's fallback chain, which subscription accounts each server uses, and which apps call NSVX AI with their keys (prefixes only); train and pauseTraining start or pause Clone AI training on the Mac; setServer moves a server to the odd or even account group (or none); appsOn/appsOff let apps use NSVX AI or stop them all. Usage numbers are what providers report, never estimates.",
    parameters: Type.Object(
      {
        action: Type.Union(ACTIONS.map((action) => Type.Literal(action))),
        lane: Type.Optional(Type.Union(LANES.map((lane) => Type.Literal(lane)))),
        providerId: Type.Optional(
          Type.String({ description: "Provider or account id from status, e.g. anthropic-2." }),
        ),
        model: Type.Optional(Type.String({ description: "Model id from status, for laneFirst." })),
        reason: Type.Optional(Type.String({ maxLength: 200, description: "Why, for skip." })),
        status: Type.Optional(
          Type.Union(["ok", "failed", "limited", "running"].map((s) => Type.Literal(s))),
        ),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
        serverId: Type.Optional(
          Type.String({ description: "Server id from flows, for setServer." }),
        ),
        parity: Type.Optional(
          Type.Union(
            ["odd", "even", "none"].map((p) => Type.Literal(p)),
            {
              description: "Account group, for setServer.",
            },
          ),
        ),
        settings: Type.Optional(
          Type.Record(Type.String(), Type.Unknown(), {
            description: "Voice fields to change, for setVoice.",
          }),
        ),
      },
      { additionalProperties: false },
    ),
    execute: (_toolCallId: string, params: AiToolParams) =>
      outcome(async () => {
        if (context.senderIsOwner !== true) {
          throw new NsvxError("denied", "Only the owner may use NSVX AI.");
        }
        if (!READS.has(params.action)) {
          context.assertInvocationCurrent?.();
        }
        return act(client, params);
      }),
  } as AnyAgentTool;
}

function summary(state: AiState) {
  return {
    lanes: lanesOf(state.lanes).map((id) => {
      const lane = state.lanes[id]!;
      const now = currentNode(lane);
      return {
        lane: id,
        on: lane.enabled,
        now: now ? { provider: now.provider, model: now.model, label: now.label } : null,
        running: lane.running.length,
        order: lane.chain.map((n) => ({
          provider: n.provider,
          model: n.model,
          effort: n.effort,
          state: nodeState(n).key.slice(2),
          ...(n.reset_at && !n.eligible ? { resetsAt: n.reset_at } : {}),
        })),
        skipped: Object.keys(lane.skips ?? {}),
      };
    }),
    accounts: state.providers.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email ?? p.detected_email ?? null,
      subscription: p.subscription,
      state: providerState(p).key.slice(2),
      on: p.enabled,
      usage: Object.fromEntries(
        usage(p).map((w) => [w.key, w.used === null ? "unknown" : `${Math.round(w.used * 100)}%`]),
      ),
    })),
    last24h: {
      requests: state.stats.total,
      ok: state.stats.ok,
      failed: state.stats.failed,
      avgMs: state.stats.avg_latency_ms,
      switches: state.stats.switches,
    },
    alerts: state.health?.alerts ?? [],
  };
}

function required<V>(value: V | undefined, name: string): V {
  if (value === undefined || value === "") {
    throw new NsvxError("invalid", `${name} is required.`);
  }
  return value;
}

async function act(client: NsvxClient, params: AiToolParams): Promise<unknown> {
  const change = async (body: Record<string, unknown>) =>
    summary((await changeAi(client, body)) as AiState);
  switch (params.action) {
    case "status":
      return summary(await client.readOwnerView<AiState>("aiState"));
    case "requests": {
      const rows = await client.readOwnerView<AiRequest[]>("aiRequests", {
        limit: String(params.limit ?? 20),
        ...(params.lane ? { lane: params.lane } : {}),
        ...(params.status ? { status: params.status } : {}),
      });
      // Error text can quote message content; the category says what went wrong.
      return rows.map((r) => ({
        id: r.id,
        lane: r.lane,
        task: r.task_type,
        provider: r.provider,
        model: r.actual_model ?? r.model,
        status: r.status,
        ms: r.duration_ms,
        error: r.error_category,
        at: r.started_at,
      }));
    }
    case "cloneAi": {
      const [panel, runs] = await Promise.all([
        client.readOwnerView<CloneAiPanel>("cloneAi"),
        client.readOwnerView<{ items: TrainingRun[] }>("localTraining"),
      ]);
      const providers = await client
        .readOwnerView<OpenClawProviders>("aiProviders")
        .then((p) => p.cloneAi)
        .catch(() => "unknown" as const);
      return {
        host: panel.host,
        online: panel.device.available === true,
        busy: panel.device.device?.busy ?? null,
        relay: panel.shim.ok,
        inRoutes: panel.routing.enabled,
        lanes: panel.routing.lanes,
        promotion: panel.promotion,
        training: panel.training.items,
        experiments: runs.items.map((r) => ({
          id: r.id,
          model: r.model,
          status: r.status,
          at: r.created_at,
          evaluation: r.evaluation,
        })),
        openclawProvider: providers,
      };
    }
    case "voice": {
      const v = await client.readOwnerView<GptVoice>("gptVoice");
      return {
        settings: { ...v.settings, instructions: v.settings.instructions ? "set" : "" },
        openaiConnected: v.status.key_present,
        spentToday: `${v.status.spend_today_usd} / ${v.settings.daily_usd} USD`,
        channels: v.status.routing,
        options: v.options,
      };
    }
    case "laneOn":
    case "laneOff":
      return change({ action: "laneEnabled", lane: params.lane, on: params.action === "laneOn" });
    case "laneFirst": {
      const lane = required(params.lane, "lane");
      const providerId = required(params.providerId, "providerId");
      const state = await client.readOwnerView<AiState>("aiState");
      const chain = state.lanes[lane]?.chain ?? [];
      const index = chain.findIndex(
        (n) => n.provider === providerId && (!params.model || n.model === params.model),
      );
      if (index < 0) {
        throw new NsvxError("not-found", "That route is not in this lane; read status first.");
      }
      const rows = chain.map(({ provider, model, effort }) => ({ provider, model, effort }));
      rows.unshift(...rows.splice(index, 1));
      return change({ action: "laneOrder", lane, chain: rows });
    }
    case "skip":
      return change({
        action: "laneSkip",
        lane: params.lane,
        providerId: params.providerId,
        reason: params.reason,
      });
    case "restore":
      return change({ action: "laneRestore", lane: params.lane });
    case "testLane":
    case "testAccount": {
      const result = (await changeAi(
        client,
        params.action === "testLane"
          ? { action: "laneTest", lane: params.lane }
          : { action: "providerTest", providerId: params.providerId },
      )) as {
        ok?: boolean;
        results?: { ok: boolean; category: string | null }[];
        request?: { actual_model?: string | null } | null;
      };
      return {
        ok: result.ok ?? result.results?.every((r) => r.ok) ?? false,
        model: result.request?.actual_model ?? null,
        problems: (result.results ?? []).filter((r) => !r.ok).map((r) => r.category),
      };
    }
    case "accountOn":
    case "accountOff":
      return change({
        action: "providerEnabled",
        providerId: params.providerId,
        on: params.action === "accountOn",
      });
    case "cloneAiOn":
    case "cloneAiOff": {
      const panel = (await changeAi(client, {
        action: "cloneAiRouting",
        on: params.action === "cloneAiOn",
      })) as CloneAiPanel;
      return { inRoutes: panel.routing.enabled, lanes: panel.routing.lanes };
    }
    case "flows": {
      const [ops, keys] = await Promise.all([
        client.readOwnerView<InferenceOps>("aiOps"),
        client.readOwnerView<AiKeys>("aiKeys"),
      ]);
      const used = new Map(keys.usage.keys.map((u) => [u.key_id, u]));
      return {
        chat: (ops.lanes.find((l) => l.id === "normal")?.chain ?? []).map((n) => n.label),
        work: `${ops.work.label} · ${ops.work.effort}`,
        code: `${ops.grow.model} · ${ops.grow.effort}`,
        lanes: Object.fromEntries(ops.lanes.map((l) => [l.id, l.chain.map((n) => n.label)])),
        servers: ops.serverAccounts.resolved.map((s) => ({
          id: s.id,
          production: s.production,
          group: s.parity ?? "none",
          accounts: s.accounts,
        })),
        apps: {
          on: keys.settings.enabled,
          here: keys.available_here,
          users: keys.users.map((u) => ({
            name: u.name,
            active: u.active,
            keys: keys.keys
              .filter((k) => k.user_id === u.id)
              .map((k) => ({
                prefix: k.prefix,
                state: k.state,
                requests7d: used.get(k.id)?.requests ?? 0,
                tokensToday: used.get(k.id)?.tokens_today ?? 0,
              })),
          })),
        },
      };
    }
    case "train":
    case "pauseTraining": {
      const bench = await client.readOwnerView<CloneAiBench>("cloneAiBench", { model: "clone-ai" });
      const command =
        params.action === "pauseTraining"
          ? "pause"
          : bench.status.live && bench.status.status === "paused"
            ? "resume"
            : "start";
      // A fresh id per tool call: NSVX dedupes repeats of one call, and a new owner request is a new command.
      const result = (await changeAi(client, {
        action: "training",
        command,
        commandId: crypto.randomUUID(),
      })) as { executed: boolean; dispatched: boolean; mac_online: boolean };
      return {
        command,
        state: result.executed ? "done" : result.dispatched ? "accepted" : "queued",
        macOnline: result.mac_online,
        progress: trainingRun(bench)?.progress ?? null,
      };
    }
    case "setServer": {
      const saved = (await changeAi(client, {
        action: "serverParity",
        serverId: params.serverId,
        parity: params.parity === "none" ? null : params.parity,
      })) as { mirror: string; resolved: InferenceOps["serverAccounts"]["resolved"] };
      const server = saved.resolved.find((s) => s.id === params.serverId);
      return { mirror: saved.mirror, server };
    }
    case "appsOn":
    case "appsOff": {
      const saved = (await changeAi(client, {
        action: "appsGateway",
        on: params.action === "appsOn",
      })) as { enabled: boolean };
      return { appsOn: saved.enabled };
    }
    case "setVoice": {
      const saved = (await changeAi(client, { action: "voice", settings: params.settings })) as {
        settings: GptVoice["settings"];
      };
      return {
        settings: { ...saved.settings, instructions: saved.settings.instructions ? "set" : "" },
      };
    }
  }
  throw new NsvxError("invalid", "Unknown action.");
}
