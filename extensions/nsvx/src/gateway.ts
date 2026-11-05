import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";
import parity from "./parity-data.json" with { type: "json" };
import type { NsvxStatus } from "./types.js";

function requiredText(params: Record<string, unknown>, name: string): string {
  const value = params[name];
  if (typeof value !== "string" || !value || value.length > 200) {
    throw new NsvxError("invalid", `${name} is required.`);
  }
  return value;
}

export async function readNsvxStatus(client: NsvxClient): Promise<NsvxStatus> {
  const address = new URL(client.baseUrl).host;
  try {
    return { state: "connected", address, actions: (await client.listActions()).length };
  } catch (cause) {
    const kind = cause instanceof NsvxError ? cause.kind : "failed";
    switch (kind) {
      case "unconfigured":
      case "signed-out":
      case "off":
      case "offline":
        return { state: kind, address };
      default:
        return { state: "failed", address };
    }
  }
}

/** Answers with the result, or with the NSVX error kind as the code the page branches on. */
function handler(
  run: (params: Record<string, unknown>) => Promise<unknown>,
): Parameters<OpenClawPluginApi["registerGatewayMethod"]>[1] {
  return async ({ params, respond }) => {
    try {
      respond(true, await run(params));
    } catch (cause) {
      const known = cause instanceof NsvxError;
      respond(false, undefined, {
        code: known ? cause.kind : "failed",
        message: known ? cause.message : "NSVX request failed.",
        ...(known && cause.correlationId
          ? { details: { correlationId: cause.correlationId } }
          : {}),
      });
    }
  };
}

export { handler as gatewayHandler };

// Literal method names keep scripts/nsvx-parity-inventory.mts able to list them.
export function registerNsvxGatewayMethods(api: OpenClawPluginApi, client: NsvxClient) {
  const read = { scope: "operator.read" } as const;
  api.registerGatewayMethod(
    "nsvx.status",
    handler(() => readNsvxStatus(client)),
    read,
  );
  api.registerGatewayMethod(
    "nsvx.parity",
    handler(async () => parity),
    read,
  );
  // Owner screens (Today, tasks, work). Deliberately not a chat tool: the model gets NSVX data only through AgentOS
  // contracts, which withhold owner-only views from agents.
  api.registerGatewayMethod(
    "nsvx.view",
    handler((params) =>
      client.readOwnerView(
        requiredText(params, "view"),
        (params.params ?? {}) as Record<string, unknown>,
      ),
    ),
    read,
  );
  api.registerGatewayMethod(
    "nsvx.actions.list",
    handler(async () => ({ actions: await client.listActions() })),
    read,
  );
  api.registerGatewayMethod(
    "nsvx.actions.get",
    handler((params) => client.getAction(requiredText(params, "actionId"))),
    read,
  );
  api.registerGatewayMethod(
    "nsvx.tasks.list",
    handler(async () => ({ tasks: await client.listTasks() })),
    read,
  );
  api.registerGatewayMethod(
    "nsvx.approvals.list",
    handler(async () => ({ approvals: await client.listApprovals() })),
    read,
  );
  api.registerGatewayMethod(
    "nsvx.actions.run",
    handler((params) =>
      client.runAction({
        actionId: requiredText(params, "actionId"),
        idempotencyKey: requiredText(params, "idempotencyKey"),
        input: (params.input ?? {}) as Record<string, unknown>,
        ...(typeof params.approvalId === "string" ? { approvalId: params.approvalId } : {}),
      }),
    ),
    { scope: "operator.write" },
  );
  // People decide approvals here; no chat tool can, because the model never grants permission.
  api.registerGatewayMethod(
    "nsvx.approvals.decide",
    handler((params) => {
      const decision = requiredText(params, "decision");
      if (decision !== "approve" && decision !== "deny") {
        throw new NsvxError("invalid", "decision must be approve or deny.");
      }
      return client.decideApproval(requiredText(params, "approvalId"), decision);
    }),
    { scope: "operator.approvals" },
  );
}
