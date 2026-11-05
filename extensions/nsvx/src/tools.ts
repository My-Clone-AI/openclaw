import { jsonResult } from "openclaw/plugin-sdk/core";
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
