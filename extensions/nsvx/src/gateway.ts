import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { exportFileName } from "./activity-data.js";
import { activityRange, findRequest } from "./activity-requests.js";
import {
  agendaSummary,
  freeSlots,
  meetingFollowUp,
  meetingHelp,
  previewChange,
  selectCalendar,
  submitChange,
} from "./agenda.js";
import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";
import {
  approveDraft,
  deleteQuickReply,
  regenerateQuickReply,
  rejectDraft,
  sendReply,
  setAutoReply,
  setTakeover,
  startQuickReply,
} from "./messages.js";
import parity from "./parity-data.json" with { type: "json" };
import { changeGroup, changePerson } from "./people.js";
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
  // Owner screens (Today, tasks, work, messages). Not a chat tool: the model gets NSVX data through AgentOS contracts,
  // which withhold owner-only views from agents, or through nsvx_messages on the owner's own turns.
  method("nsvx.view", "operator.read", (params) =>
    client.readOwnerView(
      requiredText(params, "view"),
      (params.params ?? {}) as Record<string, unknown>,
    ),
  );
  // Unified search and the AUTO activity log: owner reads, also behind the owner-only chat tools in tools.ts.
  method("nsvx.search", "operator.read", (params) =>
    client.readOwnerPost("find", findRequest(params)),
  );
  method("nsvx.activity.summary", "operator.read", (params) => {
    const range = activityRange(params);
    return client.readOwnerPost("activitySummary", { ...range, ids: range.ids ?? null });
  });
  method("nsvx.activity.export", "operator.read", async (params) => {
    const range = activityRange(params);
    return {
      fileName: exportFileName(range.start, range.end),
      csv: await client.exportActivity({
        start: range.start,
        end: range.end,
        ...(range.ids ? { ids: range.ids.join(",") } : {}),
      }),
    };
  });
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
  // Messages and Quick Reply read through nsvx.view; these are the owner's taps, each on one fixed NSVX route.
  // Sending and approving reach real people, so they need write scope like chat.send.
  method("nsvx.messages.reply", "operator.write", (params) => sendReply(client, params));
  method("nsvx.messages.approve", "operator.write", (params) => approveDraft(client, params));
  method("nsvx.messages.reject", "operator.write", (params) => rejectDraft(client, params));
  method("nsvx.messages.takeover", "operator.write", (params) => setTakeover(client, params));
  method("nsvx.messages.autoReply", "operator.write", (params) => setAutoReply(client, params));
  method("nsvx.quickReply.start", "operator.write", (params) => startQuickReply(client, params));
  method("nsvx.quickReply.regenerate", "operator.write", (params) =>
    regenerateQuickReply(client, params),
  );
  method("nsvx.quickReply.delete", "operator.write", (params) => deleteQuickReply(client, params));
  // Agenda reads through nsvx.view (calendars, events, one event, an intent); these are its POST reads and taps.
  method("nsvx.agenda.summary", "operator.read", (params) => agendaSummary(client, params));
  method("nsvx.agenda.slots", "operator.read", (params) => freeSlots(client, params));
  method("nsvx.agenda.preview", "operator.read", (params) => previewChange(client, params));
  method("nsvx.agenda.help", "operator.read", (params) => meetingHelp(client, params));
  // Booking, moving, and cancelling can invite or notify real people, so they need write scope like chat.send.
  method("nsvx.agenda.submit", "operator.write", (params) => submitChange(client, params));
  method("nsvx.agenda.select", "operator.write", (params) => selectCalendar(client, params));
  method("nsvx.agenda.meeting", "operator.write", (params) => meetingFollowUp(client, params));
  // People and groups read through nsvx.view; these are the owner's changes, each on one fixed NSVX route.
  // None sends a message, but they change who clone answers and what it remembers, so they need write scope.
  method("nsvx.people.change", "operator.write", (params) => changePerson(client, params));
  method("nsvx.groups.change", "operator.write", (params) => changeGroup(client, params));
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
