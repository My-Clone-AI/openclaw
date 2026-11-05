import { jsonResult } from "openclaw/plugin-sdk/core";
import type { AnyAgentTool, OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";
import { AI_OPS, parseAiChange, type AiOp, type NsvxAiClient } from "./ai-client.js";
import { summarizeAi, type AiState } from "./ai-data.js";
import { NsvxError } from "./client.js";

export const NSVX_AI_TOOL_NAMES = ["nsvx_ai", "nsvx_ai_change"] as const;

/** Changes people make only on the page, after a confirmation: they undo a release or edit Gateway config. */
const PAGE_ONLY_OPS: ReadonlySet<AiOp> = new Set(["cloneAi.rollback", "openclaw.registerCloneAi"]);
const CHAT_OPS = AI_OPS.filter((op) => !PAGE_ONLY_OPS.has(op));

const VIEWS = ["routes", "requests", "request", "cloneAi", "voice", "openclaw", "evals"] as const;
type View = (typeof VIEWS)[number];

function outcome(run: () => Promise<unknown>) {
  return run().then(jsonResult, (cause: unknown) => {
    if (cause instanceof NsvxError) {
      return jsonResult({ ok: false, reason: cause.kind, message: cause.message });
    }
    throw cause;
  });
}

/**
 * The owner's NSVX AI routing, subscriptions, clone-ai, and voice settings. Always offered so the prompt prefix stays
 * stable; each call answers only on the owner's own turn, so a channel guest can neither read nor change them.
 */
export function createNsvxAiTools(
  ai: NsvxAiClient,
  context: OpenClawPluginToolContext<2>,
): AnyAgentTool[] {
  const owned = (run: () => Promise<unknown>) =>
    outcome(async () => {
      context.assertInvocationCurrent();
      if (context.senderIsOwner !== true) {
        throw new NsvxError("denied", "Only the owner can use NSVX AI settings.");
      }
      return run();
    });
  return [
    {
      name: "nsvx_ai",
      label: "NSVX AI",
      description:
        "Read the owner's NSVX AI setup. routes: each lane's model order, who answers next, subscription usage, 24 h stats and alerts. requests: the latest 50 AI requests with status and errors (request with requestId for one). cloneAi: clone-ai health on the Mac, its routes and training. voice: voice note engine and settings. openclaw: models this Gateway offers and whether clone-ai is connected. evals: latest test suite results.",
      parameters: Type.Object(
        {
          view: Type.Union(VIEWS.map((view) => Type.Literal(view))),
          requestId: Type.Optional(Type.String({ maxLength: 36 })),
        },
        { additionalProperties: false },
      ),
      execute: (_toolCallId, params: { view: View; requestId?: string }) =>
        owned(async () => {
          switch (params.view) {
            case "routes":
              return summarizeAi((await ai.read("state")) as AiState);
            case "request":
              return ai.read("request", { id: params.requestId });
            case "cloneAi":
              return ai.read("cloneAi");
            case "voice": {
              const [settings, engine] = await Promise.all([
                ai.read("voice"),
                ai.read("voiceEngine") as Promise<{ engine: string }>,
              ]);
              return { engine: engine.engine, ...(settings as object) };
            }
            default:
              return ai.read(params.view);
          }
        }),
    },
    {
      name: "nsvx_ai_change",
      label: "Change NSVX AI",
      description:
        "Change one NSVX AI setting; NSVX validates, audits and returns its new state. lane.enabled {lane, enabled}; lane.order {lane, chain:[{provider, model, effort}]} (read routes first and send the full chain); lane.skip {lane, provider, reason}; lane.restore {lane}; lane.test {lane} (one small real request); provider.enabled/provider.preferred {provider, enabled|preferred}; provider.refresh/provider.test {provider}; cloneAi.routing {enabled}; cloneAi.check; voice.engine {engine: classic|gpt_realtime}; voice.settings {patch:{voice, style, length, language, instructions, autoplay, mic_input}}. Reason uncertain means the outcome is unknown: read before repeating.",
      parameters: Type.Object(
        {
          op: Type.Union(CHAT_OPS.map((op) => Type.Literal(op))),
          lane: Type.Optional(Type.String({ maxLength: 48 })),
          provider: Type.Optional(Type.String({ maxLength: 48 })),
          enabled: Type.Optional(Type.Boolean()),
          preferred: Type.Optional(Type.Boolean()),
          reason: Type.Optional(Type.String({ maxLength: 200 })),
          engine: Type.Optional(Type.String({ maxLength: 20 })),
          chain: Type.Optional(
            Type.Array(
              Type.Object({
                provider: Type.String(),
                model: Type.String(),
                effort: Type.Union([Type.String(), Type.Null()]),
              }),
              { maxItems: 30 },
            ),
          ),
          patch: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
        },
        { additionalProperties: false },
      ),
      execute: (_toolCallId, params: Record<string, unknown>) =>
        owned(async () => {
          const change = parseAiChange(params);
          if (PAGE_ONLY_OPS.has(change.op)) {
            throw new NsvxError("denied", "Only the owner can do this, in Control.");
          }
          const result = (await ai.change(change)) as { lanes?: unknown };
          // Lane and account changes answer with the whole state; keep chat to the summary.
          return result && typeof result === "object" && "lanes" in result
            ? summarizeAi(result as AiState)
            : result;
        }),
    },
  ] as AnyAgentTool[];
}
