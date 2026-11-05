import {
  BENCH_COMMANDS,
  LANES,
  TRAINING_MODELS,
  withParity,
  type AiState,
  type InferenceOps,
} from "./ai-data.js";
import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";

/**
 * The owner's AI changes: routing per lane, subscriptions, Clone AI, local training, and GPT voice. Each maps to
 * one fixed NSVX route with a body NSVX's own contract accepts. NSVX validates again, audits, and answers with the
 * new state, so nothing here keeps a copy. Tests make one real model call through the owner's subscriptions.
 */

type Params = Record<string, unknown>;

const PROVIDER = /^[a-z][a-z-]{1,30}(-\d)?$/;
const ID = /^[\w-]{1,100}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function oneOf<V extends string>(params: Params, name: string, values: readonly V[]): V {
  const value = params[name];
  if (typeof value !== "string" || !values.includes(value as V)) {
    throw new NsvxError("invalid", `${name} must be one of ${values.join(", ")}.`);
  }
  return value as V;
}

function flag(params: Params, name = "on"): boolean {
  if (typeof params[name] !== "boolean") {
    throw new NsvxError("invalid", `${name} must be true or false.`);
  }
  return params[name];
}

function match(params: Params, name: string, pattern: RegExp): string {
  const value = params[name];
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new NsvxError("invalid", `${name} is required.`);
  }
  return value;
}

function short(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || !value || value.length > max) {
    throw new NsvxError("invalid", `${name} must be text up to ${max} characters.`);
  }
  return value;
}

const MAX_ROUTES = 30;

/** A lane's model order as NSVX's update_lane takes it: provider, model, and effort per route. */
function chain(params: Params) {
  const rows = params.chain;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_ROUTES) {
    throw new NsvxError("invalid", `chain must list 1 to ${MAX_ROUTES} routes.`);
  }
  return rows.map((raw: unknown) => {
    const row = (raw ?? {}) as Params;
    return {
      provider: match(row, "provider", PROVIDER),
      model: short(row.model, "model", 120),
      effort:
        row.effort === null || row.effort === undefined ? null : short(row.effort, "effort", 20),
    };
  });
}

/** The three limits NSVX's Settings card edits, with its input bounds. */
const POLICY = {
  max_retries: [0, 5],
  timeout_s: [30, 3600],
  background_max_utilization_pct: [0, 100],
} as const;

function policy(params: Params): Record<string, number> {
  const raw = (params.policy ?? {}) as Params;
  const out: Record<string, number> = {};
  for (const [name, [min, max]] of Object.entries(POLICY)) {
    const value = raw[name];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
      throw new NsvxError("invalid", `${name} must be a whole number from ${min} to ${max}.`);
    }
    out[name] = value;
  }
  if (Object.keys(out).length === 0) {
    throw new NsvxError("invalid", "policy needs at least one limit.");
  }
  return out;
}

/** GPT voice fields NSVX's clean_settings accepts; values outside its option lists come back `invalid` from NSVX. */
const VOICE_TEXT = {
  model: 60,
  voice: 30,
  style: 30,
  language: 10,
  length: 20,
  instructions: 1000,
} as const;
const VOICE_FLAGS = ["autoplay", "mic_input"] as const;
const VOICE_NUMBERS = {
  max_seconds: [5, 180],
  connect_timeout_s: [3, 30],
  daily_usd: [0, 50],
  max_per_hour: [1, 120],
} as const;

function voice(params: Params): Record<string, unknown> {
  const raw = (params.settings ?? {}) as Params;
  const out: Record<string, unknown> = {};
  for (const [name, max] of Object.entries(VOICE_TEXT)) {
    if (raw[name] !== undefined) {
      // Instructions may be cleared.
      out[name] = name === "instructions" && raw[name] === "" ? "" : short(raw[name], name, max);
    }
  }
  for (const name of VOICE_FLAGS) {
    if (raw[name] !== undefined) {
      out[name] = flag(raw, name);
    }
  }
  for (const [name, [min, max]] of Object.entries(VOICE_NUMBERS)) {
    const value = raw[name];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      throw new NsvxError("invalid", `${name} must be from ${min} to ${max}.`);
    }
    out[name] = value;
  }
  if (Object.keys(out).length === 0) {
    throw new NsvxError("invalid", "settings needs at least one field.");
  }
  return out;
}

export const AI_ACTIONS = [
  "laneEnabled",
  "laneOrder",
  "laneReset",
  "lanePolicy",
  "laneSkip",
  "laneRestore",
  "laneTest",
  "providerTest",
  "providerRefresh",
  "providerEnabled",
  "providerPreferred",
  "repairApproval",
  "cloneAiRouting",
  "cloneAiHealth",
  "cloneAiRollback",
  "cloneAiRegister",
  "trainingPrepare",
  "trainingRevoke",
  "voice",
  "training",
  "serverParity",
  "appsGateway",
] as const;
export type AiAction = (typeof AI_ACTIONS)[number];

export async function changeAi(client: NsvxClient, params: Params): Promise<unknown> {
  const action = oneOf(params, "action", AI_ACTIONS);
  const lane = () => oneOf(params, "lane", LANES);
  const provider = () => match(params, "providerId", PROVIDER);
  switch (action) {
    case "laneEnabled":
      return client.writeOwner("aiLane", lane(), { enabled: flag(params) });
    case "laneOrder":
      return client.writeOwner("aiLane", lane(), { chain: chain(params) });
    case "laneReset":
      return client.writeOwner("aiLane", lane(), { reset_chain: true });
    case "lanePolicy": {
      // NSVX's Settings card saves the same limits on both lanes that read them.
      const body = { policy: policy(params) };
      await client.writeOwner("aiLane", "normal", body);
      return client.writeOwner<AiState>("aiLane", "repair", body);
    }
    case "laneSkip": {
      const reason = typeof params.reason === "string" ? params.reason.trim() : "";
      if (reason.length < 3 || reason.length > 200) {
        throw new NsvxError("invalid", "reason must be 3 to 200 characters.");
      }
      return client.writeOwner("aiLaneSkip", lane(), { provider: provider(), reason });
    }
    case "laneRestore":
      return client.writeOwner("aiLaneRestore", lane(), {});
    case "laneTest":
      return client.writeOwner("aiLaneTest", lane(), {});
    case "providerTest":
      return client.writeOwner("aiProviderTest", provider(), {});
    case "providerRefresh":
      return client.writeOwner("aiProviderRefresh", provider(), {});
    case "providerEnabled":
      return client.writeOwner("aiProviderEnabled", provider(), { enabled: flag(params) });
    case "providerPreferred":
      return client.writeOwner("aiProviderPreferred", provider(), { preferred: flag(params) });
    case "repairApproval":
      return client.writeOwner("aiRepairApproval", undefined, { required: flag(params) });
    case "cloneAiRouting":
      return client.writeOwner("cloneAiRouting", undefined, { enabled: flag(params) });
    case "cloneAiHealth":
      return client.writeOwner("cloneAiHealth", undefined, {});
    case "cloneAiRollback":
      return client.writeOwner("cloneAiRollback", undefined, {});
    case "cloneAiRegister":
      // The config hash the owner saw; openclaw_admin answers a changed config with `conflict`.
      return client.writeOwner("cloneAiRegister", undefined, {
        hash: short(params.hash, "hash", 200),
      });
    case "trainingPrepare":
      return client.writeOwner("trainingPrepare", undefined, {
        model: oneOf(params, "model", TRAINING_MODELS),
      });
    case "trainingRevoke":
      return client.writeOwner("trainingRevoke", match(params, "runId", ID), {});
    case "voice":
      return client.writeOwner("gptVoice", undefined, voice(params));
    case "training": {
      // NSVX dedupes on command_id, so a repeated tap or retry with the same id never queues a second run.
      const command = oneOf(params, "command", BENCH_COMMANDS);
      return client.writeOwner("cloneAiBench", undefined, {
        command_id: match(params, "commandId", UUID),
        model: "clone-ai",
        action: command,
        ...(command === "start" ? { profile: "standard" } : {}),
      });
    }
    case "serverParity": {
      // NSVX saves the whole document; read it at the point of change so only this server moves.
      const serverId = match(params, "serverId", ID);
      const parity =
        params.parity === null ? null : oneOf(params, "parity", ["odd", "even"] as const);
      const ops = await client.readOwnerView<InferenceOps>("aiOps");
      const document = withParity(ops.serverAccounts.document, serverId, parity);
      if (!document) {
        throw new NsvxError("not-found", "NSVX does not list that server.");
      }
      return client.writeOwner("aiServerAccounts", undefined, document);
    }
    case "appsGateway":
      return client.writeOwner("aiKeysSettings", undefined, { enabled: flag(params) });
  }
  throw new NsvxError("invalid", "Unknown action.");
}
