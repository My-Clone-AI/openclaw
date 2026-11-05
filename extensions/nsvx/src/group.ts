import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";
import {
  DEV_ACTIONS,
  isAdult,
  MAIL_ACTIONS,
  SERVER_VERBS,
  type OperationResult,
  type Preview,
} from "./group-data.js";

/** Group companies changes. Each goes to one fixed NSVX route, which confirms, audits, and rate-limits it. */

const ID = /^[\w.:-]{1,200}$/;
/** NSVX's own key pattern for operations, dev actions, and mail sends. */
const KEY = /^[A-Za-z0-9._-]{8,128}$/;

function id(value: unknown, name: string): string {
  if (typeof value !== "string" || !ID.test(value)) {
    throw new NsvxError("invalid", `${name} is required.`);
  }
  return value;
}

function app(value: unknown): string {
  const cid = id(value, "cid");
  if (isAdult({ id: cid })) {
    throw new NsvxError("denied", "This app is not shown here.");
  }
  return cid;
}

function key(value: unknown): string {
  if (typeof value !== "string" || !KEY.test(value)) {
    throw new NsvxError("invalid", "idempotencyKey must be 8-128 letters, digits, dot, dash.");
  }
  return value;
}

function text(raw: unknown, name: string, max: number): string {
  const value = raw ?? "";
  if (typeof value !== "string" || value.length > max) {
    throw new NsvxError("invalid", `${name} must be text up to ${max} characters.`);
  }
  return value;
}

function oneOf<V extends string>(value: unknown, options: readonly V[], name: string): V {
  if (!options.includes(value as V)) {
    throw new NsvxError("invalid", `${name} must be one of ${options.join(", ")}.`);
  }
  return value as V;
}

function addresses(raw: unknown, name: string, required: boolean): string[] {
  const list = raw ?? [];
  if (
    !Array.isArray(list) ||
    list.length > 50 ||
    (required && list.length === 0) ||
    list.some((a) => typeof a !== "string" || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(a))
  ) {
    throw new NsvxError("invalid", `${name} must be email addresses.`);
  }
  return list as string[];
}

/** A dev-only quick action (CI run, dev redeploy or restart, Grow run/pause/resume). NSVX refuses production. */
export async function runDevAction(client: NsvxClient, params: Record<string, unknown>) {
  return client.writeOwner<{ status: string; replayed?: boolean }>(
    "groupDevAction",
    undefined,
    { confirm: true, environment: "development" },
    {
      params: { cid: app(params.cid), action: oneOf(params.action, DEV_ACTIONS, "action") },
      idempotencyKey: key(params.idempotencyKey),
    },
  );
}

function operationBody(params: Record<string, unknown>) {
  const input = params.input ?? {};
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new NsvxError("invalid", "input must be an object.");
  }
  if (JSON.stringify(input).length > 32_768) {
    throw new NsvxError("invalid", "input is too large.");
  }
  return {
    targetId: params.targetId ? id(params.targetId, "targetId") : null,
    input,
    reason: text(params.reason, "reason", 500),
    idempotencyKey: key(params.idempotencyKey),
  };
}

/** Reads what an app operation would do. No effect: NSVX only asks the app to check it. */
export async function previewOperation(client: NsvxClient, params: Record<string, unknown>) {
  return client.writeOwner<Preview>(
    "groupPreview",
    undefined,
    { ...operationBody(params), confirm: false, previewToken: null },
    { params: { cid: app(params.cid), op: id(params.op, "op") } },
  );
}

/** Runs one app operation the owner confirmed. A repeat with the same key is replayed by the app, not repeated. */
export async function runOperation(client: NsvxClient, params: Record<string, unknown>) {
  return client.writeOwner<OperationResult>(
    "groupOperation",
    undefined,
    {
      ...operationBody(params),
      confirm: true,
      previewToken:
        params.previewToken === undefined || params.previewToken === null
          ? null
          : text(params.previewToken, "previewToken", 2048),
    },
    { params: { cid: app(params.cid), op: id(params.op, "op") } },
  );
}

export async function mailAction(client: NsvxClient, params: Record<string, unknown>) {
  const ids = params.messageIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) {
    throw new NsvxError("invalid", "messageIds is required.");
  }
  return client.writeOwner<{ ok: boolean }>(
    "groupMailAction",
    undefined,
    {
      messageIds: ids.map((value) => text(value, "messageIds", 512)),
      action: oneOf(params.action, MAIL_ACTIONS, "action"),
    },
    { params: { cid: app(params.cid), box: id(params.box, "box") } },
  );
}

/** Saves a draft in the app's mailbox. Nothing is sent until `sendMail` with the owner's confirmation. */
export async function saveMailDraft(client: NsvxClient, params: Record<string, unknown>) {
  const mode = oneOf(params.mode, ["reply", "replyAll", "forward", "new"] as const, "mode");
  return client.writeOwner<{ draftId: string }>(
    "groupMailDraft",
    undefined,
    {
      mode,
      inReplyTo: mode === "new" ? null : text(params.inReplyTo, "inReplyTo", 512),
      to: addresses(params.to, "to", true),
      cc: addresses(params.cc, "cc", false),
      subject: text(params.subject, "subject", 998),
      text: text(params.text, "text", 200_000),
    },
    { params: { cid: app(params.cid), box: id(params.box, "box") } },
  );
}

/** Sends a saved draft. NSVX records the key before sending, so a repeat returns the first receipt. */
export async function sendMail(client: NsvxClient, params: Record<string, unknown>) {
  return client.writeOwner<{ status: string }>(
    "groupMailSend",
    undefined,
    { confirm: true, idempotencyKey: key(params.idempotencyKey) },
    {
      params: {
        cid: app(params.cid),
        did: id(params.draftId, "draftId"),
        box: id(params.box, "box"),
      },
    },
  );
}

/**
 * Server actions (restart a service, clean, stop a process, reboot). NSVX checks the target and needs the server's
 * name for a reboot; it has no idempotency key, so an uncertain answer is checked on the server card, never repeated.
 */
export async function serverAction(client: NsvxClient, params: Record<string, unknown>) {
  const verb = oneOf(params.verb, SERVER_VERBS, "verb");
  const pid = params.pid ?? 0;
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid < 0) {
    throw new NsvxError("invalid", "pid must be a process number.");
  }
  return client.writeOwner<Record<string, unknown>>(
    "groupServerAction",
    undefined,
    {
      unit: text(params.unit, "unit", 200),
      target: text(params.target, "target", 20),
      pid,
      signal: oneOf(params.signal ?? "TERM", ["TERM", "KILL"] as const, "signal"),
      confirm: true,
      serverName: text(params.serverName, "serverName", 100),
    },
    { params: { sid: id(params.sid, "sid"), verb } },
  );
}
