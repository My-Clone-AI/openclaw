import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";
import parity from "./parity-data.json" with { type: "json" };
import type { TeamService } from "./team.js";
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

export function registerNsvxGatewayMethods(
  api: OpenClawPluginApi,
  client: NsvxClient,
  team: TeamService,
) {
  // Full names, so the parity generator can find each method in source.
  const method = (
    name: `nsvx.${string}`,
    scope: "operator.read" | "operator.write" | "operator.approvals" | "operator.admin",
    run: (params: Record<string, unknown>) => Promise<unknown>,
  ) => {
    api.registerGatewayMethod(
      name,
      async ({ params, respond }) => {
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
      },
      { scope },
    );
  };
  method("nsvx.status", "operator.read", () => readNsvxStatus(client));
  method("nsvx.parity", "operator.read", async () => parity);
  // Owner screens (Today, tasks, work). Deliberately not a chat tool: the model gets NSVX data only through AgentOS
  // contracts, which withhold owner-only views from agents.
  method("nsvx.view", "operator.read", (params) =>
    client.readOwnerView(
      requiredText(params, "view"),
      (params.params ?? {}) as Record<string, unknown>,
    ),
  );
  method("nsvx.actions.list", "operator.read", async () => ({
    actions: await client.listActions(),
  }));
  method("nsvx.actions.get", "operator.read", (params) =>
    client.getAction(requiredText(params, "actionId")),
  );
  method("nsvx.tasks.list", "operator.read", async () => ({ tasks: await client.listTasks() }));
  method("nsvx.approvals.list", "operator.read", async () => ({
    approvals: await client.listApprovals(),
  }));
  method("nsvx.actions.run", "operator.write", (params) =>
    client.runAction({
      actionId: requiredText(params, "actionId"),
      idempotencyKey: requiredText(params, "idempotencyKey"),
      input: (params.input ?? {}) as Record<string, unknown>,
      ...(typeof params.approvalId === "string" ? { approvalId: params.approvalId } : {}),
    }),
  );
  // People decide approvals here; no chat tool can, because the model never grants permission.
  method("nsvx.approvals.decide", "operator.approvals", (params) => {
    const decision = requiredText(params, "decision");
    if (decision !== "approve" && decision !== "deny") {
      throw new NsvxError("invalid", "decision must be approve or deny.");
    }
    return client.decideApproval(requiredText(params, "approvalId"), decision);
  });
  method("nsvx.team.paused", "operator.read", () => team.listPaused());
  method("nsvx.team.history", "operator.read", () => team.history());
  // Tree changes rewrite agent config, so they need the same scope as config.patch.
  method("nsvx.team.move", "operator.admin", (params) =>
    team.move(requiredText(params, "agentId"), requiredText(params, "supervisorId")),
  );
  method("nsvx.team.assign", "operator.admin", (params) =>
    team.assign(
      requiredText(params, "agentId"),
      typeof params.nodeId === "string" && params.nodeId ? requiredText(params, "nodeId") : null,
    ),
  );
  method("nsvx.team.pause", "operator.admin", (params) =>
    team.pause(requiredText(params, "agentId")),
  );
  method("nsvx.team.resume", "operator.admin", (params) =>
    team.resume(requiredText(params, "agentId")),
  );
  method("nsvx.team.rollback", "operator.admin", (params) =>
    team.rollback(requiredText(params, "version")),
  );
}
