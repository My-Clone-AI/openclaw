import type { NsvxClient, OwnerWrite } from "./client.js";
import { NsvxError } from "./client.js";

/**
 * The owner's changes on the NSVX Apps, Acesso, and Permissões screens. Each maps to one fixed NSVX route with a body
 * NSVX's own contract accepts; NSVX keeps the audit, revisions, and session checks.
 */

type Params = Record<string, unknown>;

// --- NSVX shapes (web/src/types.ts and the routes in api.py, social_api.py, auth.py, permissions_api.py) ---

export type Capability = { status?: string; note?: string | null };

export type Account = {
  id: string;
  channel: string;
  label: string;
  mode: string;
  state: string;
  state_detail: string | null;
  capabilities: Record<string, Capability> | null;
  paused: boolean;
  outbound_enabled: boolean;
  can_send?: boolean;
  send_block_reason?: string | null;
  transport?: "browser" | "cloud";
  connection_label?: string;
  last_verified_at: string | null;
  last_check_at?: string | null;
  policy_review: string;
  freshness?: { status?: string; reason?: string | null; warning?: string | null };
  coverage?: Record<string, number> | null;
};

export type Service = { ok: boolean; detail?: unknown; model?: string; effort?: string };

export type AppsPage = {
  accounts: Account[];
  services: Record<string, Service>;
  google_client_missing?: boolean;
  google?: {
    gmail: boolean;
    drive: boolean;
    drive_write: boolean;
    gmail_addresses?: { address: string; granted: boolean }[];
  };
  drive_stats?: { files: number; indexed: number; people_files: number } | null;
};

export type Schedule = {
  enabled: boolean;
  interval: "daily" | "weekly";
  account_ids: string[] | null;
  history: { date: string; queued: string[] }[];
};

export type LoginState = {
  state: string;
  detail?: string;
  qr_png_base64?: string;
  qr_expires_in_s?: number;
  qr_expired?: boolean;
  login_step?: string;
  view?: boolean;
  cached?: boolean;
};

export type LoginView = { png_base64: string; width: number; height: number };
export type LoginField = { index: number; label: string; kind: string; has_value: boolean };

export type ApiStatus = {
  binding: {
    state: string;
    health_code: string | null;
    webhook_challenged_at: string | null;
    subscribed_at?: string | null;
    receiving_verified_at?: string | null;
    reply_verified_at?: string | null;
    last_event_at: string | null;
    token_expires_at: string | null;
  } | null;
  selected_transport: string;
  milestones: Record<string, string>;
  events: { kind: string; state: string; n: number }[];
  signature_rejections?: number;
};

export type Challenge = { id: string; channel: string; failures: number; visual_required: boolean };
export type ChallengeView = { image: string; width: number; height: number };

export type Devices = {
  passkeys: {
    id: string;
    device_name: string;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
  }[];
  sessions: {
    id: string;
    device_label: string;
    method: string;
    created_at: string;
    last_seen_at: string;
    expires_at: string;
  }[];
  current_session: string;
};

export type AppleIds = {
  status: "configured" | "not_configured";
  identities: {
    id: string;
    email: string | null;
    is_private_email: boolean;
    full_name: string | null;
    created_at: string;
    last_login_at: string | null;
  }[];
};

export type Grant = {
  id: string;
  label: string;
  person_id: string | null;
  state: string;
  effective_state?: string;
  revision: number;
  scopes: string[];
  username: string | null;
  legacy_al?: string | null;
  phone_verified: boolean;
  changed_at: string;
  changed_by: string;
};

export type Grants = { people: Grant[]; scopes: { code: string; label: string }[] };
export type GrantCandidate = { id: string; display_name: string; verified_association: boolean };

export type Credential = {
  id: string;
  label: string;
  origins?: string[];
  origin?: string;
  state: string;
  detail?: string | null;
  service?: string | null;
  updated_at?: string;
  from_document?: boolean;
};

export const LIVE = ["ready", "working", "recovered"];
export const BROWSER_CHANNELS = ["whatsapp", "telegram", "instagram", "standvirtual"];
export const QR_CHANNELS = ["whatsapp", "telegram"];
/** NSVX records the owner's choice to connect a browser account with this disclosure version (BrowserLogin.tsx). */
const RISK_VERSION = "2026-10-12";

export const isBrowserAccount = (account: Account) =>
  account.mode === "live" && BROWSER_CHANNELS.includes(account.channel);

/** Sending, kept apart from the connection: a live connection never implies permission to send. */
export function sendState(account: Account): "paused" | "blocked" | "on" | "off" {
  if (account.paused) {
    return "paused";
  }
  if (account.outbound_enabled && account.can_send === false) {
    return "blocked";
  }
  return account.outbound_enabled ? "on" : "off";
}

/** The account's tone for its status dot. */
export function tone(state: string): "ok" | "warn" | "bad" | "run" | "off" {
  if (LIVE.includes(state) || state === "api_ready") {
    return state === "working" ? "run" : "ok";
  }
  if (["failed", "interrupted", "blocked_external"].includes(state)) {
    return "bad";
  }
  if (["connecting", "importing_history", "reconnecting"].includes(state)) {
    return "run";
  }
  return ["disconnected", "disabled"].includes(state) ? "off" : "warn";
}

// --- validation ---

const ID = /^[\w:.-]{1,100}$/;

function id(params: Params, name = "id"): string {
  const value = params[name];
  if (typeof value !== "string" || !ID.test(value)) {
    throw new NsvxError("invalid", `${name} is required.`);
  }
  return value;
}

function text(params: Params, name: string, max: number, min = 1): string {
  const value = params[name];
  if (typeof value !== "string" || value.length < min || value.length > max) {
    throw new NsvxError("invalid", `${name} must be text of ${min} to ${max} characters.`);
  }
  return value;
}

function flag(params: Params, name: string): boolean {
  if (typeof params[name] !== "boolean") {
    throw new NsvxError("invalid", `${name} must be true or false.`);
  }
  return params[name];
}

function number(params: Params, name: string, min: number, max: number): number {
  const value = params[name] ?? 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new NsvxError("invalid", `${name} must be a number from ${min} to ${max}.`);
  }
  return value;
}

function oneOf<V extends string>(params: Params, name: string, values: readonly V[]): V {
  const value = params[name];
  if (typeof value !== "string" || !values.includes(value as V)) {
    throw new NsvxError("invalid", `${name} must be one of ${values.join(", ")}.`);
  }
  return value as V;
}

function ids(params: Params, name: string): string[] {
  const value = params[name];
  if (!Array.isArray(value) || value.length > 200 || value.some((v) => !ID.test(String(v)))) {
    throw new NsvxError("invalid", `${name} must be a list of ids.`);
  }
  return value.map(String);
}

const KEYS = [
  "Enter",
  "Tab",
  "Shift+Tab",
  "Escape",
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
] as const;

/** A tap, key, or scroll on a remote browser picture; coordinates are in the 1280x900 page NSVX shows. */
function pointer(params: Params): Record<string, unknown> {
  const kind = oneOf(params, "kind", ["click", "key", "scroll"] as const);
  if (kind === "click") {
    return { kind, x: number(params, "x", 0, 1280), y: number(params, "y", 0, 900) };
  }
  if (kind === "key") {
    return { kind, key: oneOf(params, "key", KEYS) };
  }
  return { kind, dy: number(params, "dy", -900, 900) };
}

function write<V = unknown>(
  client: NsvxClient,
  action: OwnerWrite,
  target: string | undefined,
  body: unknown = {},
): Promise<V> {
  return client.writeOwner<V>(action, target, body);
}

export const APP_OPS = [
  "pause",
  "check",
  "schedule",
  "connect",
  "fill",
  "input",
  "screen",
  "apiCheck",
  "challengeInput",
  "challengeResume",
] as const;

/** Apps taps: pause, check, the schedule, browser sign-in, and visual checks. None sends a message. */
export async function changeApp(client: NsvxClient, params: Params): Promise<unknown> {
  const op = oneOf(params, "op", APP_OPS);
  switch (op) {
    case "pause":
      return write(client, "appPause", id(params), { paused: flag(params, "paused") });
    case "check":
      return write(client, "appCheck", id(params));
    case "schedule":
      return write(client, "appsSchedule", undefined, {
        enabled: flag(params, "enabled"),
        interval: oneOf(params, "interval", ["daily", "weekly"] as const),
        account_ids: params.accountIds === null ? null : ids(params, "accountIds"),
      });
    case "connect":
      // NSVX's screen records the owner's choice before the first sign-in; nothing else changes.
      return write(client, "appRiskAck", id(params), { disclosure_version: RISK_VERSION });
    case "fill": {
      const values = params.values;
      if (!values || typeof values !== "object" || Array.isArray(values)) {
        throw new NsvxError("invalid", "values are required.");
      }
      const entries = Object.entries(values as Record<string, unknown>);
      if (
        entries.length === 0 ||
        entries.length > 10 ||
        entries.some(([k, v]) => !/^\d{1,2}$/.test(k) || typeof v !== "string" || v.length > 300)
      ) {
        throw new NsvxError("invalid", "values must be short text by field number.");
      }
      // Typed by the owner for the provider's own page; never logged or kept here.
      return write(client, "appLoginFill", id(params), { values, submit: true });
    }
    case "input":
      return write(client, "appLoginInput", id(params), pointer(params));
    case "screen":
      return write(client, "appScreen", id(params), {});
    case "apiCheck":
      return write(client, "appApiCheck", id(params));
    case "challengeInput":
      return write(client, "challengeInput", id(params), pointer(params));
    case "challengeResume":
      return write(client, "challengeResume", id(params));
  }
  throw new NsvxError("invalid", "Unknown change.");
}

export const ACCESS_OPS = [
  "endSession",
  "revokePasskey",
  "unlinkApple",
  "grantAdd",
  "grantSave",
  "grantLogin",
  "credentialAdd",
  "credentialReplace",
  "credentialRevoke",
  "credentialImport",
] as const;

/** Sign-in and grant changes: who can enter NSVX and what they may see. */
export async function changeAccess(client: NsvxClient, params: Params): Promise<unknown> {
  const op = oneOf(params, "op", ACCESS_OPS);
  switch (op) {
    case "endSession": {
      const session = id(params);
      // This Gateway reads NSVX with one of these sessions; ending it would cut every NSVX tab here.
      const { current_session } = await client.readOwnerView<Devices>("devices");
      if (session === current_session) {
        throw new NsvxError("denied", "This is the Gateway's own sign-in. End it in NSVX.");
      }
      return write(client, "sessionEnd", session);
    }
    case "revokePasskey":
      return write(client, "passkeyRevoke", id(params));
    case "unlinkApple":
      return write(client, "appleUnlink", id(params));
    case "grantAdd":
      return write(client, "grantAdd", undefined, { label: text(params, "label", 160).trim() });
    case "grantSave": {
      const revision = params.revision;
      if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1) {
        throw new NsvxError("invalid", "revision must be a whole number.");
      }
      return write(client, "grantSave", id(params), {
        revision,
        person_id: params.personId ? id(params, "personId") : null,
        state: oneOf(params, "state", ["active", "pending", "disabled"] as const),
        scopes: ids(params, "scopes").slice(0, 50),
      });
    }
    case "grantLogin": {
      const username = text(params, "username", 80, 3);
      if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(username)) {
        throw new NsvxError("invalid", "Use lowercase letters, numbers, dots, or dashes.");
      }
      return write(client, "grantLogin", id(params), {
        username,
        password: text(params, "password", 1024, 12),
      });
    }
    case "credentialAdd":
      return write(client, "credentialAdd", undefined, {
        label: text(params, "label", 80).trim(),
        origin: text(params, "origin", 200),
        username: text(params, "username", 300),
        secret: text(params, "secret", 1000),
      });
    case "credentialReplace":
      return write(client, "credentialReplace", id(params), {
        username: text(params, "username", 300),
        secret: text(params, "secret", 1000),
      });
    case "credentialRevoke":
      return write(client, "credentialRevoke", id(params));
    case "credentialImport":
      return write(client, "credentialImport", undefined);
  }
  throw new NsvxError("invalid", "Unknown change.");
}
