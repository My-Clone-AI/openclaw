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

export function registerNsvxGatewayMethods(api: OpenClawPluginApi, client: NsvxClient) {
  const method = (
    name: string,
    scope: "operator.read" | "operator.write" | "operator.approvals",
    run: (params: Record<string, unknown>) => Promise<unknown>,
  ) => {
    api.registerGatewayMethod(
      `nsvx.${name}`,
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
  method("status", "operator.read", () => readNsvxStatus(client));
  method("parity", "operator.read", async () => parity);
  method("actions.list", "operator.read", async () => ({ actions: await client.listActions() }));
  method("actions.get", "operator.read", (params) =>
    client.getAction(requiredText(params, "actionId")),
  );
  method("tasks.list", "operator.read", async () => ({ tasks: await client.listTasks() }));
  method("approvals.list", "operator.read", async () => ({
    approvals: await client.listApprovals(),
  }));
  method("actions.run", "operator.write", (params) =>
    client.runAction({
      actionId: requiredText(params, "actionId"),
      idempotencyKey: requiredText(params, "idempotencyKey"),
      input: (params.input ?? {}) as Record<string, unknown>,
      ...(typeof params.approvalId === "string" ? { approvalId: params.approvalId } : {}),
    }),
  );
  // People decide approvals here; no chat tool can, because the model never grants permission.
  method("approvals.decide", "operator.approvals", (params) => {
    const decision = requiredText(params, "decision");
    if (decision !== "approve" && decision !== "deny") {
      throw new NsvxError("invalid", "decision must be approve or deny.");
    }
    return client.decideApproval(requiredText(params, "approvalId"), decision);
  });
}
