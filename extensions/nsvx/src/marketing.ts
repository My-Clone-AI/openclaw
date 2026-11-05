import { jsonResult } from "openclaw/plugin-sdk/core";
import type { AnyAgentTool, OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";
import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";
import {
  gateMode,
  isAdultApp,
  safeActivations,
  safeInventory,
  safeSlots,
  safeSocialApps,
  socialCounts,
  type GenerateResult,
  type MarketingAnalytics,
  type MarketingChannels,
  type MarketingGate,
  type MarketingOverview,
  type MarketingSlot,
} from "./marketing-data.js";
import { flag, oneOf, optional, strings, text, type Params } from "./params.js";

const APP = /^[a-z0-9-]{1,64}$/;
const ITEM = /^[\w:.-]{1,120}$/;
const NETWORK = /^[a-z_]{1,40}$/;

function app(params: Params): string {
  const value = params.app;
  if (typeof value !== "string" || !APP.test(value) || isAdultApp(value)) {
    throw new NsvxError("invalid", "app is required.");
  }
  return value;
}

function item(params: Params, name: string): string {
  const value = params[name];
  if (typeof value !== "string" || !ITEM.test(value)) {
    throw new NsvxError("invalid", `${name} is required.`);
  }
  return value;
}

/** Content work. NSVX answers 404 outside development and never publishes past its global dry run. */
export function changeMarketing(client: NsvxClient, params: Params): Promise<unknown> {
  switch (params.action) {
    case "generate":
      return client.writeOwner("marketingGenerate", undefined, {
        app: app(params),
        kind: oneOf(params, "kind", ["image", "video"]),
        brief: optional(params, "brief", 1000) ?? "",
      });
    case "preview": {
      const network = params.network ?? "bluesky";
      if (typeof network !== "string" || !NETWORK.test(network)) {
        throw new NsvxError("invalid", "network is required.");
      }
      return client.writeOwner("marketingPreview", undefined, {
        app: app(params),
        network,
        text: text(params, "text", 4000),
        hashtags: strings(params, "hashtags", 30, 80),
      });
    }
    case "schedule":
      return client.writeOwner("marketingSchedule", undefined, {
        content_id: item(params, "contentId"),
      });
    case "publish":
      return client.writeOwner("marketingPublish", undefined, {
        content_id: item(params, "contentId"),
      });
    case "retry":
      return client.writeOwner("marketingRetry", undefined, { job_id: item(params, "jobId") });
    case "pause":
      return client.writeOwner("marketingPause", undefined, { app: app(params) });
    case "cancel":
      return client.writeOwner("marketingCancel", item(params, "jobId"), {});
    default:
      throw new NsvxError("invalid", "Unknown marketing change.");
  }
}

/** The global publish switches and one app's arming; each needs a written reason, which NSVX audits. */
export function changeMarketingGate(client: NsvxClient, params: Params): Promise<unknown> {
  const reason = text(params, "reason", 500, 3);
  if (params.action === "activation") {
    return client.writeOwner("marketingActivation", app(params), {
      activate: flag(params, "activate"),
      reason,
    });
  }
  return client.writeOwner("marketingGate", undefined, {
    ...(params.live_allowed === undefined ? {} : { live_allowed: flag(params, "live_allowed") }),
    ...(params.killed === undefined ? {} : { killed: flag(params, "killed") }),
    reason,
  });
}

/** Read from NSVX as JSON so every format leaves out adult apps; the Markdown layout matches NSVX's `render_inventory`. */
export async function marketingInventory(client: NsvxClient, params: Params) {
  const format = oneOf(params, "format", ["md", "json"]);
  const file = await client.readOwnerFile("marketingInventory", { format: "json" });
  const { accounts } = JSON.parse(Buffer.from(file.data, "base64").toString("utf8")) as {
    accounts: { app: string; network: string; state: string; mode: string; publish_mode: string }[];
  };
  const safe = safeInventory(accounts);
  const body =
    format === "json"
      ? `${JSON.stringify({ accounts: safe }, null, 2)}\n`
      : [
          "# Social accounts inventory",
          "",
          "| App | Network | State | Mode | Publishing |",
          "| --- | --- | --- | --- | --- |",
          ...safe.map(
            (row) =>
              `| ${row.app} | ${row.network} | ${row.state} | ${row.mode} | ${row.publish_mode} |`,
          ),
          "",
        ].join("\n");
  return {
    fileName: `social-accounts-inventory.${format}`,
    mime: format === "json" ? "application/json" : "text/markdown",
    data: Buffer.from(body).toString("base64"),
  };
}

type Register = (
  name: `nsvx.${string}`,
  scope: "operator.read" | "operator.write" | "operator.admin",
  run: (params: Params) => Promise<unknown>,
) => void;

/** Marketing reads go through `nsvx.view`; these are the inventory file and the owner's changes. */
export function registerMarketingMethods(method: Register, client: NsvxClient) {
  method("nsvx.marketing.change", "operator.write", (params) => changeMarketing(client, params));
  method("nsvx.marketing.gate", "operator.admin", (params) => changeMarketingGate(client, params));
  method("nsvx.marketing.inventory", "operator.read", (params) =>
    marketingInventory(client, params),
  );
}

const ACTIONS = [
  "overview",
  "calendar",
  "accounts",
  "report",
  "generate",
  "preview",
  "retry",
  "pause",
  "stopAll",
  "publish",
  "goLive",
] as const;

type MarketingToolParams = {
  action: (typeof ACTIONS)[number];
  app?: string;
  kind?: string;
  brief?: string;
  text?: string;
  network?: string;
  jobId?: string;
  reason?: string;
};

/**
 * Owner-only chat path to NSVX marketing. It reads, makes content, and can stop publishing; anything that reaches the
 * public (publish, schedule, going live, arming an app) returns `needsOwner`, the owner's tap in Control.
 */
export function createNsvxMarketingTool(
  client: NsvxClient,
  context: Pick<OpenClawPluginToolContext, "senderIsOwner" | "assertInvocationCurrent">,
): AnyAgentTool {
  return {
    name: "nsvx_marketing",
    label: "NSVX marketing",
    description:
      "The group's NSVX marketing. overview gives the publishing mode, queue, and the content worker; calendar lists the next slots; accounts shows social accounts per app; report gives job, post, and schedule counts. generate makes an image or video draft (app, kind, brief); preview checks a text against a network's rules (app, text, network); retry repeats a job (jobId); pause holds one app (app); stopAll halts all publishing (reason). The content actions work only on NSVX's development server. publish and goLive never run from chat: they return needsOwner, because they reach the public.",
    parameters: Type.Object(
      {
        action: Type.Union(ACTIONS.map((action) => Type.Literal(action))),
        app: Type.Optional(Type.String()),
        kind: Type.Optional(Type.String({ description: "image or video" })),
        brief: Type.Optional(Type.String()),
        text: Type.Optional(Type.String()),
        network: Type.Optional(Type.String()),
        jobId: Type.Optional(Type.String()),
        reason: Type.Optional(Type.String()),
      },
      { additionalProperties: false },
    ),
    execute: async (_toolCallId: string, params: MarketingToolParams) => {
      try {
        if (context.senderIsOwner !== true) {
          throw new NsvxError("denied", "Only the owner may use the NSVX marketing tool.");
        }
        return jsonResult(await runMarketing(client, context, params));
      } catch (cause) {
        if (cause instanceof NsvxError) {
          return jsonResult({ ok: false, reason: cause.kind, message: cause.message });
        }
        throw cause;
      }
    },
  } as AnyAgentTool;
}

async function runMarketing(
  client: NsvxClient,
  context: Pick<OpenClawPluginToolContext, "assertInvocationCurrent">,
  params: MarketingToolParams,
): Promise<unknown> {
  switch (params.action) {
    case "overview": {
      const [overview, gate] = await Promise.all([
        client.readOwnerView<MarketingOverview>("marketingOverview"),
        client.readOwnerView<MarketingGate>("marketingGate"),
      ]);
      return {
        mode: gateMode(gate),
        block: overview.live_block,
        slots: overview.slots,
        activeJobs: overview.active_jobs,
        pausedCampaigns: overview.paused_campaigns,
        cadenceHours: overview.cadence_hours,
        worker: overview.worker.configured ? (overview.worker.health?.ok ?? false) : "not set up",
        apps: safeActivations(gate.activations),
      };
    }
    case "calendar": {
      const { items } = await client.readOwnerView<{ items: MarketingSlot[] }>("marketingCalendar");
      return {
        slots: safeSlots(items)
          .slice(0, 50)
          .map(({ app_id, slot, state, kind, caption, job_state }) => ({
            app: app_id,
            at: slot,
            state,
            kind,
            caption,
            job: job_state,
          })),
      };
    }
    case "accounts": {
      const { matrix } = await client.readOwnerView<MarketingChannels>("marketingChannels");
      return {
        apps: safeSocialApps(matrix.apps).map((row) => ({
          app: row.app,
          ...socialCounts(row, matrix.networks),
          connected: matrix.networks
            .filter((network) => row.cells[network.code]?.status === "connected")
            .map((network) => network.label),
        })),
      };
    }
    case "report":
      return client.readOwnerView<MarketingAnalytics>("marketingAnalytics");
    case "generate": {
      context.assertInvocationCurrent?.();
      const made = (await changeMarketing(client, {
        action: "generate",
        app: params.app,
        kind: params.kind,
        brief: params.brief,
      })) as GenerateResult;
      return { id: made.id, state: made.state, contentId: made.content_id };
    }
    case "preview":
      context.assertInvocationCurrent?.();
      return changeMarketing(client, {
        action: "preview",
        app: params.app,
        network: params.network,
        text: params.text,
        hashtags: [],
      });
    case "retry":
      context.assertInvocationCurrent?.();
      return changeMarketing(client, { action: "retry", jobId: params.jobId });
    case "pause":
      context.assertInvocationCurrent?.();
      return changeMarketing(client, { action: "pause", app: params.app });
    case "stopAll":
      context.assertInvocationCurrent?.();
      return changeMarketingGate(client, { killed: true, reason: params.reason });
    case "publish":
    case "goLive":
      return {
        needsOwner: true,
        message: "This reaches the public: the owner does it in Control, on the Marketing tab.",
      };
  }
  throw new NsvxError("invalid", "Unknown action.");
}
