import { jsonResult } from "openclaw/plugin-sdk/core";
import { activityRange, findRequest, FIND_GROUPS, type FindResult } from "./activity-requests.js";
import { filterActivity, type ActivityPage, type ActivitySummary } from "./activity-data.js";
import type { AnyAgentTool, OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";
import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";
import parity from "./parity-data.json" with { type: "json" };
import type { TeamService } from "./team.js";

function outcome(run: () => Promise<unknown>) {
  return run().then(jsonResult, (cause: unknown) => {
    if (cause instanceof NsvxError) {
      return jsonResult({ ok: false, reason: cause.kind, message: cause.message });
    }
    throw cause;
  });
}

export function createNsvxTools(client: NsvxClient): AnyAgentTool[] {
  return [
    {
      name: "nsvx_actions",
      label: "NSVX actions",
      description:
        "List the NSVX actions this Gateway may run, or read one action's input and output contract. Use this before nsvx_run.",
      parameters: Type.Object(
        {
          actionId: Type.Optional(Type.String({ description: "Action id for its full contract." })),
        },
        { additionalProperties: false },
      ),
      execute: (_toolCallId, params: { actionId?: string }) =>
        outcome(() => (params.actionId ? client.getAction(params.actionId) : client.listActions())),
    },
    {
      name: "nsvx_run",
      label: "Run NSVX action",
      description:
        "Run one NSVX action with input matching its contract. NSVX applies its own policy; status requires_approval means the owner must approve in Control, so report that and stop. Reason uncertain means the outcome is unknown: do not run it again.",
      parameters: Type.Object(
        {
          actionId: Type.String({ description: "Action id from nsvx_actions." }),
          input: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
        },
        { additionalProperties: false },
      ),
      // The call id keeps one tool call to one effect, even if the runtime replays the call.
      execute: (toolCallId, params: { actionId: string; input?: Record<string, unknown> }) =>
        outcome(() =>
          client.runAction({
            actionId: params.actionId,
            input: params.input ?? {},
            idempotencyKey: `openclaw-${toolCallId}`,
          }),
        ),
    },
    {
      name: "nsvx_parity",
      label: "NSVX parity",
      description:
        "Read verified NSVX parity progress by feature family, from the registry committed with this build.",
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: async () => jsonResult(parity),
    },
  ] as AnyAgentTool[];
}

type TeamToolParams = {
  action: "paused" | "pause" | "resume" | "history" | "rollback";
  agentId?: string;
  version?: string;
};

/** Pause and rollback change who may delegate to an agent, so only the owner's own turns may use them. */
export function createNsvxTeamTool(
  team: TeamService,
  context: Pick<OpenClawPluginToolContext, "senderIsOwner" | "assertInvocationCurrent">,
): AnyAgentTool {
  return {
    name: "nsvx_team",
    label: "NSVX team",
    description:
      "List paused agents or recent team changes; pause or resume an agent; or roll the team back to before a change. Pause removes the agent from its leads and stops its runs; resume puts it back under the same leads. Rollback restores the agents config as it was before the given history version. Only the owner may pause, resume, or roll back.",
    parameters: Type.Object(
      {
        action: Type.Union([
          Type.Literal("paused"),
          Type.Literal("pause"),
          Type.Literal("resume"),
          Type.Literal("history"),
          Type.Literal("rollback"),
        ]),
        agentId: Type.Optional(Type.String({ description: "Agent id, for pause and resume." })),
        version: Type.Optional(Type.String({ description: "History version id, for rollback." })),
      },
      { additionalProperties: false },
    ),
    execute: (_toolCallId, params: TeamToolParams) =>
      outcome(async () => {
        if (params.action === "paused") {
          return team.listPaused();
        }
        if (params.action === "history") {
          return team.history();
        }
        if (context.senderIsOwner !== true) {
          throw new NsvxError("denied", "Only the owner may change the team.");
        }
        if (params.action === "rollback") {
          if (!params.version) {
            throw new NsvxError("invalid", "version is required.");
          }
          context.assertInvocationCurrent?.();
          return team.rollback(params.version, "chat");
        }
        if (!params.agentId) {
          throw new NsvxError("invalid", "agentId is required.");
        }
        context.assertInvocationCurrent?.();
        return params.action === "pause"
          ? team.pause(params.agentId, "chat")
          : team.resume(params.agentId, "chat");
      }),
  } as AnyAgentTool;
}

/** NSVX keeps 200 entries per page; the tool reads at most this many while filtering. */
const ACTIVITY_SCAN = 200;

export const NSVX_OWNER_TOOL_NAMES = ["nsvx_search", "nsvx_activity"] as const;

/**
 * Tools over the owner's own NSVX data (people, conversations, tasks, documents, activity). Always offered so the
 * prompt prefix stays stable; each call answers only on the owner's own turn, so a channel guest never reads them.
 */
export function createNsvxOwnerTools(
  client: NsvxClient,
  context: OpenClawPluginToolContext<2>,
): AnyAgentTool[] {
  const owned = (run: () => Promise<unknown>) =>
    outcome(async () => {
      context.assertInvocationCurrent();
      if (context.senderIsOwner !== true) {
        throw new NsvxError("denied", "Only the owner can read NSVX search and activity.");
      }
      return run();
    });
  return [
    {
      name: "nsvx_search",
      label: "NSVX search",
      description:
        "Search the owner's NSVX: people, conversations, tasks (missions), AUTO tasks, and documents, in one call. Read only. Answer from the returned titles, excerpts and meta.",
      parameters: Type.Object(
        {
          query: Type.String({ minLength: 2, maxLength: 200, description: "Words to find." }),
          groups: Type.Optional(
            Type.Array(Type.Union(FIND_GROUPS.map((group) => Type.Literal(group))), {
              description: "Only these groups; all when omitted.",
            }),
          ),
          limit: Type.Optional(
            Type.Integer({ minimum: 1, maximum: 30, description: "Per group." }),
          ),
        },
        { additionalProperties: false },
      ),
      execute: (_toolCallId, params: { query: string; groups?: string[]; limit?: number }) =>
        owned(async () => {
          const result = await client.readOwnerPost<FindResult>(
            "find",
            findRequest({ q: params.query, groups: params.groups, limit: params.limit }),
          );
          return result.groups.map((group) => ({
            group: group.group,
            total: group.total,
            error: group.error,
            items: group.items.map((item) => ({
              kind: item.ref.kind,
              id: item.ref.id,
              title: item.title,
              excerpt: item.excerpt,
              meta: item.meta,
              updatedAt: item.updated_at,
            })),
          }));
        }),
    },
    {
      name: "nsvx_activity",
      label: "NSVX activity",
      description:
        "Read the owner's NSVX AUTO activity log (what tasks did, newest first), filtered by words, kind, or UTC days. With summarize and both days, NSVX writes a short summary of that period instead. Read only.",
      parameters: Type.Object(
        {
          query: Type.Optional(Type.String({ maxLength: 200 })),
          kind: Type.Optional(
            Type.String({ maxLength: 60, description: "Event kind, e.g. status." }),
          ),
          start: Type.Optional(Type.String({ description: "First UTC day, YYYY-MM-DD." })),
          end: Type.Optional(Type.String({ description: "Last UTC day, YYYY-MM-DD." })),
          summarize: Type.Optional(Type.Boolean()),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        },
        { additionalProperties: false },
      ),
      execute: (
        _toolCallId,
        params: {
          query?: string;
          kind?: string;
          start?: string;
          end?: string;
          summarize?: boolean;
          limit?: number;
        },
      ) =>
        owned(async () => {
          if (params.summarize) {
            const range = activityRange({ start: params.start, end: params.end });
            const summary = await client.readOwnerPost<ActivitySummary>("activitySummary", {
              ...range,
              ids: null,
            });
            return {
              count: summary.count,
              summary: summary.text,
              unavailable: summary.unavailable,
            };
          }
          const page = await client.readOwnerView<ActivityPage>("activity", {
            limit: String(ACTIVITY_SCAN),
          });
          const items = filterActivity(page.items, {
            query: params.query ?? "",
            kind: params.kind ?? "",
            start: params.start ?? "",
            end: params.end ?? "",
          });
          return {
            scanned: page.items.length,
            matched: items.length,
            items: items.slice(0, params.limit ?? 30).map((event) => ({
              id: event.id,
              at: event.at,
              kind: event.kind,
              summary: event.summary,
              status: event.to_status,
              actor: event.actor_name ?? event.actor,
              task: event.task_title,
            })),
          };
        }),
    },
  ] as AnyAgentTool[];
}
