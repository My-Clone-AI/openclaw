import { CASE_STATUSES, DEADLINE_KINDS, DOC_STATUSES } from "./cases-data.js";
import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";
import { isAdult } from "./group-data.js";

/**
 * Cases (NSVX Processos), Research (Pesquisas), and Marketing changes. Reads go through `nsvx.view`; each change here
 * is one fixed NSVX route (`OWNER_WRITES`), which checks, audits, and owns the result. NSVX validates every field
 * again; these checks only keep malformed input from leaving the Gateway.
 */

type Params = Record<string, unknown>;
export type DeskRegister = (
  name: `nsvx.${string}`,
  scope: "operator.read" | "operator.write" | "operator.admin",
  run: (params: Params) => Promise<unknown>,
) => void;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A case is addressed by its reference (PROC-2026-0001) or its id, as the NSVX screen does. */
const CASE_KEY = /^PROC-\d{4}-\d{4}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SHORT_ID = /^[\w.:-]{1,120}$/;

export const SUGGESTION_STATUSES = ["new", "reviewing", "confirmed", "rejected"] as const;
export const RESEARCH_ACTIONS = ["cancel", "retry", "send", "resend"] as const;

export function uuid(value: unknown, name: string): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new NsvxError("invalid", `${name} is required.`);
  }
  return value;
}

export function caseKey(value: unknown): string {
  if (typeof value !== "string" || !(CASE_KEY.test(value) || UUID.test(value))) {
    throw new NsvxError("invalid", "case must be a reference like PROC-2026-0001.");
  }
  return CASE_KEY.test(value) ? value.toUpperCase() : value;
}

function text(raw: unknown, name: string, max: number, required = false): string {
  const value = raw ?? "";
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) {
    throw new NsvxError("invalid", `${name} must be text up to ${max} characters.`);
  }
  return value.trim();
}

/** Optional text: absent or blank becomes null, as the NSVX forms send it. */
function maybe(raw: unknown, name: string, max: number): string | null {
  return text(raw, name, max) || null;
}

function oneOf<V extends string>(value: unknown, options: readonly V[], name: string): V {
  if (!options.includes(value as V)) {
    throw new NsvxError("invalid", `${name} must be one of ${options.join(", ")}.`);
  }
  return value as V;
}

function flag(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new NsvxError("invalid", `${name} must be true or false.`);
  }
  return value;
}

function day(value: unknown, name: string): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !DAY.test(value)) {
    throw new NsvxError("invalid", `${name} must be a date like 2026-11-05.`);
  }
  return value;
}

function count(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new NsvxError("invalid", `${name} must be a whole number.`);
  }
  return value;
}

function shortId(value: unknown, name: string): string {
  if (typeof value !== "string" || !SHORT_ID.test(value)) {
    throw new NsvxError("invalid", `${name} is required.`);
  }
  return value;
}

function only<K extends string>(params: Params, keys: readonly K[]): Partial<Record<K, unknown>> {
  return Object.fromEntries(keys.filter((k) => params[k] !== undefined).map((k) => [k, params[k]]));
}

// ---------------------------------------------------------------- cases

const key = (params: Params) => ({ params: { key: caseKey(params.case) } });

/** A new case, plus its counterparty as NSVX's own New case form adds it. */
export async function createCase(client: NsvxClient, params: Params) {
  const categories = params.categories ?? [];
  if (
    !Array.isArray(categories) ||
    categories.length > 20 ||
    categories.some((c) => typeof c !== "string" || !SHORT_ID.test(c))
  ) {
    throw new NsvxError("invalid", "categories must be category ids.");
  }
  const respondent = maybe(params.respondent, "respondent", 200);
  const created = await client.writeOwner<{ ref: string; id: string }>("caseCreate", undefined, {
    title: text(params.title, "title", 200, true),
    categories,
    nature: oneOf(params.nature ?? "potential", ["potential", "formal"] as const, "nature"),
  });
  if (respondent) {
    await client.writeOwner("caseParty", undefined, { role: "respondent", name: respondent }, {
      params: { key: created.ref },
    });
  }
  return created;
}

/** Status, priority, wording, and the AI switch, checked against the revision the owner saw. */
export function updateCase(client: NsvxClient, params: Params) {
  const change: Record<string, unknown> = { revision: count(params.revision, "revision") };
  const fields = only(params, ["status", "priority", "title", "description", "notes", "aiAllowed"]);
  if (fields.status !== undefined) {
    change.status = oneOf(fields.status, CASE_STATUSES, "status");
  }
  if (fields.priority !== undefined) {
    change.priority = shortId(fields.priority, "priority");
  }
  if (fields.title !== undefined) {
    change.title = text(fields.title, "title", 200, true);
  }
  for (const name of ["description", "notes"] as const) {
    if (fields[name] !== undefined) {
      change[name] = maybe(fields[name], name, 8000);
    }
  }
  if (fields.aiAllowed !== undefined) {
    change.ai_allowed = flag(fields.aiAllowed, "aiAllowed");
  }
  if (Object.keys(change).length === 1) {
    throw new NsvxError("invalid", "Nothing to change.");
  }
  return client.writeOwner("caseUpdate", undefined, change, key(params));
}

export function addParty(client: NsvxClient, params: Params) {
  return client.writeOwner(
    "caseParty",
    undefined,
    {
      role: shortId(params.role, "role"),
      name: text(params.name, "name", 200, true),
      kind: oneOf(params.kind ?? "person", ["person", "company", "public_body"] as const, "kind"),
      contact: maybe(params.contact, "contact", 500),
    },
    key(params),
  );
}

/** A fact the owner states; a confirmed fact needs linked proof, which stays an NSVX screen task. */
export function addFact(client: NsvxClient, params: Params) {
  return client.writeOwner(
    "caseFact",
    undefined,
    {
      text: text(params.text, "text", 4000, true),
      status: "owner",
      disputed: params.disputed === undefined ? false : flag(params.disputed, "disputed"),
    },
    key(params),
  );
}

export function addEvent(client: NsvxClient, params: Params) {
  return client.writeOwner(
    "caseEvent",
    undefined,
    {
      title: text(params.title, "title", 300, true),
      on_date: day(params.date, "date"),
      status: "owner",
    },
    key(params),
  );
}

export function addDeadline(client: NsvxClient, params: Params) {
  const kind = oneOf(params.kind ?? "task", DEADLINE_KINDS, "kind");
  const due = day(params.due, "due");
  const basis = maybe(params.basis, "basis", 500);
  const verified = params.verified === undefined ? false : flag(params.verified, "verified");
  if (kind === "legal_deadline" && verified && !(due && basis)) {
    throw new NsvxError("invalid", "A confirmed legal deadline needs a date and its basis.");
  }
  return client.writeOwner(
    "caseDeadline",
    undefined,
    { title: text(params.title, "title", 300, true), kind, due_date: due, verified, basis },
    key(params),
  );
}

export function updateDeadline(client: NsvxClient, params: Params) {
  const change: Record<string, unknown> = {};
  if (params.status !== undefined) {
    change.status = oneOf(params.status, ["open", "done", "cancelled"] as const, "status");
  }
  if (params.due !== undefined) {
    change.due_date = day(params.due, "due");
  }
  if (Object.keys(change).length === 0) {
    throw new NsvxError("invalid", "Nothing to change.");
  }
  return client.writeOwner("caseDeadlineUpdate", undefined, change, {
    params: { key: caseKey(params.case), did: uuid(params.deadline, "deadline") },
  });
}

/** A law or source note on a case (NSVX "Pesquisa jurídica"); links must be web addresses. */
export function addNote(client: NsvxClient, params: Params) {
  const url = maybe(params.url, "url", 500);
  if (url && !/^https?:\/\//.test(url)) {
    throw new NsvxError("invalid", "url must start with https://.");
  }
  return client.writeOwner(
    "caseNote",
    undefined,
    {
      title: text(params.title, "title", 300, true),
      url,
      source: maybe(params.source, "source", 120),
      law_ref: maybe(params.law, "law", 200),
      excerpt: maybe(params.excerpt, "excerpt", 4000),
      verified: params.verified === undefined ? false : flag(params.verified, "verified"),
    },
    key(params),
  );
}

export function updateNote(client: NsvxClient, params: Params) {
  const target = { params: { key: caseKey(params.case), rid: uuid(params.note, "note") } };
  return params.remove === true
    ? client.writeOwner("caseNoteRemove", undefined, {}, target)
    : client.writeOwner(
        "caseNoteUpdate",
        undefined,
        { verified: flag(params.verified, "verified") },
        target,
      );
}

/** Marks a document version reviewed, approved, signed, or sent. Recording "sent" sends nothing. */
export function documentStatus(client: NsvxClient, params: Params) {
  return client.writeOwner(
    "caseDocumentStatus",
    undefined,
    { status: oneOf(params.status, DOC_STATUSES, "status") },
    { params: { did: uuid(params.document, "document") } },
  );
}

export function decideSuggestion(client: NsvxClient, params: Params) {
  const sid = { params: { sid: uuid(params.suggestion, "suggestion") } };
  if (params.convert === true) {
    return client.writeOwner<{ case_id: string; ref: string; imported: number }>(
      "caseConvert",
      undefined,
      {},
      sid,
    );
  }
  return client.writeOwner(
    "caseSuggestion",
    undefined,
    {
      status: oneOf(params.status, SUGGESTION_STATUSES, "status"),
      reason: maybe(params.reason, "reason", 500),
    },
    sid,
  );
}

export function caseSettings(client: NsvxClient, params: Params) {
  const change: Record<string, unknown> = {};
  if (params.attentionDays !== undefined) {
    const days = count(params.attentionDays, "attentionDays");
    if (days < 7 || days > 3650) {
      throw new NsvxError("invalid", "attentionDays must be 7 to 3650.");
    }
    change.attention_days = days;
  }
  if (params.discovery !== undefined) {
    change.discovery_enabled = flag(params.discovery, "discovery");
  }
  if (Object.keys(change).length === 0) {
    throw new NsvxError("invalid", "Nothing to change.");
  }
  return client.writeOwner("caseSettings", undefined, change);
}

/** Lists what an AI action would read (NSVX's manifest). Nothing runs until `authorizeAi` with that manifest. */
export function prepareAi(client: NsvxClient, params: Params) {
  return client.writeOwner(
    "caseAiPrepare",
    undefined,
    { action: shortId(params.action, "action"), params: {} },
    key(params),
  );
}

export function authorizeAi(client: NsvxClient, params: Params) {
  const manifest = params.manifest;
  if (typeof manifest !== "string" || !/^[0-9a-f]{64}$/.test(manifest)) {
    throw new NsvxError("invalid", "manifest must be the run's manifest hash.");
  }
  return client.writeOwner(
    "caseAiAuthorize",
    undefined,
    { manifest_sha256: manifest },
    { params: { rid: uuid(params.run, "run") } },
  );
}

export function cancelAi(client: NsvxClient, params: Params) {
  return client.writeOwner("caseAiCancel", undefined, {}, {
    params: { rid: uuid(params.run, "run") },
  });
}

export function procedureState(client: NsvxClient, params: Params) {
  return client.writeOwner(
    "procedureState",
    undefined,
    { version: count(params.version, "version"), enabled: flag(params.enabled, "enabled") },
    { params: { pid: uuid(params.procedure, "procedure") } },
  );
}

/** Runs a saved procedure now. NSVX keys the run by `clientKey`, so a repeat with the same key is not a second run. */
export function startProcedure(client: NsvxClient, params: Params) {
  const inputs = params.inputs ?? {};
  if (typeof inputs !== "object" || inputs === null || Array.isArray(inputs)) {
    throw new NsvxError("invalid", "inputs must be an object.");
  }
  if (JSON.stringify(inputs).length > 8192) {
    throw new NsvxError("invalid", "inputs is too large.");
  }
  return client.writeOwner(
    "procedureStart",
    undefined,
    {
      version: count(params.version, "version"),
      inputs,
      client_key: uuid(params.clientKey, "clientKey"),
    },
    { params: { pid: uuid(params.procedure, "procedure") } },
  );
}

export function cancelProcedureRun(client: NsvxClient, params: Params) {
  return client.writeOwner("procedureCancel", undefined, {}, {
    params: { rid: uuid(params.run, "run") },
  });
}

// ---------------------------------------------------------------- research

export function renameResearch(client: NsvxClient, params: Params) {
  const name = text(params.name, "name", 120);
  if ([...name].some((c) => (c.codePointAt(0) ?? 0) < 32 || c === "\u007f")) {
    throw new NsvxError("invalid", "name must be one line.");
  }
  return client.writeOwner("researchName", uuid(params.id, "id"), { display_name: name });
}

/** Cancel, retry, or send the report. Sending prepares NSVX's normal outbox delivery, with its own approval rules. */
export function researchAction(client: NsvxClient, params: Params) {
  return client.writeOwner(
    "researchAction",
    uuid(params.id, "id"),
    {},
    { params: { action: oneOf(params.action, RESEARCH_ACTIONS, "action") } },
  );
}

export function saveResearchSettings(client: NsvxClient, params: Params) {
  const contacts = params.contacts ?? [];
  if (
    !Array.isArray(contacts) ||
    contacts.length > 2000 ||
    contacts.some((c) => typeof c !== "string" || c.length > 200)
  ) {
    throw new NsvxError("invalid", "contacts must be contact keys.");
  }
  return client.writeOwner("researchSettingsSave", undefined, {
    account_id: params.account ? uuid(params.account, "account") : null,
    enabled: flag(params.enabled, "enabled"),
    mode: oneOf(params.mode, ["allowlist", "blocklist"] as const, "mode"),
    contacts,
  });
}

// ---------------------------------------------------------------- marketing

function app(value: unknown): string {
  const id = shortId(value, "app");
  if (isAdult({ id })) {
    throw new NsvxError("denied", "This app is not shown here.");
  }
  return id;
}

const reason = (params: Params) => {
  const value = text(params.reason, "reason", 500);
  if (value.length < 3) {
    throw new NsvxError("invalid", "reason needs at least 3 characters.");
  }
  return value;
};

/** The global live-publishing switch and kill switch. NSVX audits each with the owner's reason. */
export function marketingGate(client: NsvxClient, params: Params) {
  const change: Record<string, unknown> = { reason: reason(params) };
  if (params.live !== undefined) {
    change.live_allowed = flag(params.live, "live");
  }
  if (params.killed !== undefined) {
    change.killed = flag(params.killed, "killed");
  }
  if (Object.keys(change).length === 1) {
    throw new NsvxError("invalid", "Nothing to change.");
  }
  return client.writeOwner("marketingGateSave", undefined, change);
}

export function marketingActivation(client: NsvxClient, params: Params) {
  return client.writeOwner(
    "marketingActivation",
    undefined,
    { activate: flag(params.activate, "activate"), reason: reason(params) },
    { params: { app: app(params.app) } },
  );
}

export function marketingGenerate(client: NsvxClient, params: Params) {
  return client.writeOwner("marketingGenerate", undefined, {
    app: app(params.app),
    kind: oneOf(params.kind, ["image", "video"] as const, "kind"),
    brief: text(params.brief, "brief", 1000),
    network: params.network ? shortId(params.network, "network") : null,
  });
}

export function marketingPreview(client: NsvxClient, params: Params) {
  const tags = params.hashtags ?? [];
  if (!Array.isArray(tags) || tags.length > 30 || tags.some((t) => typeof t !== "string")) {
    throw new NsvxError("invalid", "hashtags must be words.");
  }
  return client.writeOwner("marketingPreview", undefined, {
    app: app(params.app),
    network: shortId(params.network, "network"),
    text: text(params.text, "text", 4000),
    hashtags: tags,
  });
}

/** Schedule, publish, retry, pause, or cancel. Publishing stays a dry run unless NSVX's gate and the app allow it. */
export function marketingStep(client: NsvxClient, params: Params) {
  const step = oneOf(
    params.step,
    ["schedule", "publish", "retry", "pause", "cancel"] as const,
    "step",
  );
  switch (step) {
    case "schedule":
    case "publish":
      return client.writeOwner(step === "schedule" ? "marketingSchedule" : "marketingPublish", undefined, {
        content_id: shortId(params.content, "content"),
      });
    case "retry":
      return client.writeOwner("marketingRetry", undefined, { job_id: shortId(params.job, "job") });
    case "pause":
      return client.writeOwner("marketingPause", undefined, { app: app(params.app) });
    case "cancel":
      return client.writeOwner("marketingCancel", undefined, {}, {
        params: { job: shortId(params.job, "job") },
      });
  }
  throw new NsvxError("invalid", "Unknown step.");
}

/**
 * Case, research, and marketing taps from Control. Changes that can reach other people (research delivery,
 * publishing, procedure runs) need write scope like chat.send; the live-publishing switches need admin.
 */
export function registerDeskMethods(method: DeskRegister, client: NsvxClient) {
  method("nsvx.cases.create", "operator.write", (params) => createCase(client, params));
  method("nsvx.cases.update", "operator.write", (params) => updateCase(client, params));
  method("nsvx.cases.party", "operator.write", (params) => addParty(client, params));
  method("nsvx.cases.fact", "operator.write", (params) => addFact(client, params));
  method("nsvx.cases.event", "operator.write", (params) => addEvent(client, params));
  method("nsvx.cases.deadline", "operator.write", (params) => addDeadline(client, params));
  method("nsvx.cases.deadlineUpdate", "operator.write", (params) =>
    updateDeadline(client, params),
  );
  method("nsvx.cases.note", "operator.write", (params) => addNote(client, params));
  method("nsvx.cases.noteUpdate", "operator.write", (params) => updateNote(client, params));
  method("nsvx.cases.document", "operator.write", (params) => documentStatus(client, params));
  method("nsvx.cases.suggestion", "operator.write", (params) => decideSuggestion(client, params));
  method("nsvx.cases.discover", "operator.write", () =>
    client.writeOwner("caseDiscover", undefined, {}),
  );
  method("nsvx.cases.settings", "operator.write", (params) => caseSettings(client, params));
  method("nsvx.cases.aiPrepare", "operator.write", (params) => prepareAi(client, params));
  method("nsvx.cases.aiAuthorize", "operator.write", (params) => authorizeAi(client, params));
  method("nsvx.cases.aiCancel", "operator.write", (params) => cancelAi(client, params));
  method("nsvx.procedures.state", "operator.write", (params) => procedureState(client, params));
  method("nsvx.procedures.run", "operator.write", (params) => startProcedure(client, params));
  method("nsvx.procedures.cancel", "operator.write", (params) =>
    cancelProcedureRun(client, params),
  );
  method("nsvx.research.name", "operator.write", (params) => renameResearch(client, params));
  method("nsvx.research.action", "operator.write", (params) => researchAction(client, params));
  method("nsvx.research.settings", "operator.write", (params) =>
    saveResearchSettings(client, params),
  );
  method("nsvx.marketing.gate", "operator.admin", (params) => marketingGate(client, params));
  method("nsvx.marketing.activation", "operator.admin", (params) =>
    marketingActivation(client, params),
  );
  method("nsvx.marketing.generate", "operator.write", (params) =>
    marketingGenerate(client, params),
  );
  method("nsvx.marketing.preview", "operator.write", (params) => marketingPreview(client, params));
  method("nsvx.marketing.step", "operator.write", (params) => marketingStep(client, params));
}
