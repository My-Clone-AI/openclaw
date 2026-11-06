import {
  LOGIN_KEYS,
  PROVIDER_OPS,
  PROVIDER_ROUTES,
  PROVIDERS,
  quarterOpen,
  READING_OPS,
  UPLOAD_LIMIT,
  UPLOAD_TYPES,
  UUID,
  validDay,
  WORKFLOW_PROVIDERS,
  type Provider,
  type ProviderOp,
} from "./business-data.js";
import { NsvxError, type NsvxClient } from "./client.js";

/**
 * Business and home services: the owner taps of the NSVX Empresarial, Encomendas, Serviços da casa, Leituras,
 * Garantias, and Autorizações screens, each on a fixed route in business-routes.ts. Reads go through `nsvx.view`.
 * NSVX checks the owner session, CSRF, and each body again, and stays the owner of the data and the background jobs.
 */

const ID = /^[\w.:-]{1,200}$/;

function fail(message: string): never {
  throw new NsvxError("invalid", message);
}

function oneOf<V extends string>(value: unknown, options: readonly V[], name: string): V {
  return options.includes(value as V)
    ? (value as V)
    : fail(`${name} must be one of ${options.join(", ")}.`);
}

function text(value: unknown, name: string, min: number, max: number): string {
  return typeof value === "string" && value.length >= min && value.length <= max
    ? value
    : fail(`${name} must be text of ${min}-${max} characters.`);
}

function int(value: unknown, name: string, min: number, max: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fail(`${name} must be a whole number from ${min} to ${max}.`);
}

function uuid(value: unknown, name: string): string {
  return typeof value === "string" && UUID.test(value) ? value : fail(`${name} is required.`);
}

function idOf(value: unknown, name = "id"): string {
  return typeof value === "string" && ID.test(value) ? value : fail(`${name} is required.`);
}

function revision(params: Record<string, unknown>) {
  return int(params.revision, "revision", 1, Number.MAX_SAFE_INTEGER);
}

/** A past or current quarter; NSVX refuses future ones. */
function quarterBody(params: Record<string, unknown>, from = 2000) {
  const year = int(params.year, "year", from, 2100);
  const quarter = int(params.quarter, "quarter", 1, 4);
  if (!quarterOpen(year, quarter, new Date(), from)) {
    fail("Pick a past or current quarter.");
  }
  return { year, quarter };
}

/** One file from the browser, as base64; only the types NSVX accepts. */
function upload(raw: unknown) {
  const file = (raw ?? {}) as { name?: unknown; type?: unknown; base64?: unknown };
  const type = oneOf(file.type, UPLOAD_TYPES, "file type");
  const data = Buffer.from(text(file.base64, "file", 1, UPLOAD_LIMIT * 2), "base64");
  if (data.byteLength === 0 || data.byteLength > UPLOAD_LIMIT) {
    fail("Files must be up to 8 MB.");
  }
  return new File([data], text(file.name ?? "file", "file name", 1, 200), { type });
}

/** The grants history export or a confirmed warranty packet, as NSVX sends the file. */
export async function readBusinessFile(client: NsvxClient, params: Record<string, unknown>) {
  const name = oneOf(params.name, ["grantsExport", "warrantyExport"] as const, "name");
  if (name === "warrantyExport") {
    return client.readOwnerFile(name, {
      id: uuid(params.id, "id"),
      packet: uuid(params.packetId, "packetId"),
    });
  }
  const query: Record<string, string> = {
    format: oneOf(params.format ?? "csv", ["csv", "json"] as const, "format"),
  };
  if (params.grantId) {
    query.grant_id = uuid(params.grantId, "grantId");
  }
  for (const key of ["from", "to"] as const) {
    if (params[key]) {
      const day = text(params[key], key, 10, 10);
      query[key] = validDay(day) ? day : fail("Dates must be YYYY-MM-DD.");
    }
  }
  if (query.from && query.to && query.from > query.to) {
    fail("The start date is after the end date.");
  }
  return client.readOwnerFile(name, query);
}

function providerBody(provider: Provider, op: ProviderOp, params: Record<string, unknown>) {
  switch (op) {
    case "credentials":
      return {
        username: text(params.username, "username", 1, 300),
        password: text(params.password, "password", 1, 1000),
        ...(provider === "glovo" && params.phone
          ? { phone: text(params.phone, "phone", 6, 20).replace(/\s/g, "") }
          : {}),
      };
    case "quarter":
      return {
        ...quarterBody(params, provider === "viaverde" ? 2014 : 2000),
        ...(provider === "nos"
          ? { association: text(params.association ?? "all", "association", 1, 200) }
          : {}),
        ...(provider === "endesa"
          ? { installation: text(params.installation, "installation", 1, 200) }
          : {}),
      };
    case "input": {
      const kind = oneOf(params.kind, ["click", "key"] as const, "kind");
      return kind === "click"
        ? {
            kind,
            x: Math.min(1280, Math.max(0, Number(params.x) || 0)),
            y: Math.min(900, Math.max(0, Number(params.y) || 0)),
          }
        : { kind, key: oneOf(params.key ?? "Enter", LOGIN_KEYS, "key") };
    }
    case "code":
      return {
        code: text(params.code, "code", 4, 8).match(provider === "glovo" ? /^\d{4}$/ : /^\d{4,8}$/)
          ? (params.code as string)
          : fail("The code is the digits you received."),
      };
    case "recipient":
      return { name: text(String(params.name ?? "").trim(), "name", 3, 200) };
    case "history": {
      // Amazon pages its order history ten at a time.
      const start = int(params.start ?? 0, "start", 0, 100_000);
      return {
        operation: "history",
        year: int(params.year ?? new Date().getFullYear(), "year", 1995, 2100),
        start: start % 10 === 0 ? start : fail("start must be a multiple of 10."),
      };
    }
    default:
      return {};
  }
}

/**
 * A provider tap: refresh accounts, a sign-in step, or a quarter's collection. NSVX refuses a second collection
 * while one runs, so an uncertain answer is checked on the card before repeating. The sign-in page itself is a read.
 */
export async function providerAction(client: NsvxClient, params: Record<string, unknown>) {
  const provider = oneOf(params.provider, PROVIDERS, "provider");
  const op = oneOf(params.op, PROVIDER_OPS[provider], "op");
  if (op === "credentials") {
    fail("Use nsvx.business.access for sign-in details.");
  }
  if (op === "view") {
    fail("Read the sign-in page with nsvx.view.");
  }
  // Amazon's history is read through its session route; NSVX keeps the last answer for the screen.
  return client.writeOwner("bizStep", undefined, providerBody(provider, op, params), {
    params: { ...PROVIDER_ROUTES[provider], op: op === "history" ? "session" : op },
  });
}

/** Saves a provider's sign-in in NSVX's vault (Drive). The details pass through and are never kept or logged here. */
export async function saveAccess(client: NsvxClient, params: Record<string, unknown>) {
  const provider = oneOf(params.provider, PROVIDERS, "provider");
  return client.writeOwner("bizStep", undefined, providerBody(provider, "credentials", params), {
    params: { ...PROVIDER_ROUTES[provider], op: "credentials" },
  });
}

/** Starts a cross-supplier quarter collection, or resumes its unverified steps. */
export async function workflowAction(client: NsvxClient, params: Record<string, unknown>) {
  const op = oneOf(params.op, ["start", "resume"] as const, "op");
  if (op === "resume") {
    return client.writeOwner("bizWorkflowResume", idOf(params.id), {});
  }
  const chosen = Array.isArray(params.providers) ? params.providers : [];
  const providers = [...new Set(chosen.map((p) => oneOf(p, WORKFLOW_PROVIDERS, "providers")))];
  if (providers.length === 0) {
    fail("Pick at least one supplier.");
  }
  return client.writeOwner("bizWorkflowStart", undefined, {
    ...quarterBody(params),
    providers: providers.toSorted(),
  });
}

/**
 * Meter readings. Edits and steps carry the revision the owner saw, so NSVX refuses a stale one; `confirm` also
 * carries NSVX's binding for the exact values shown, and only that sends the reading to the supplier.
 */
export async function readingAction(client: NsvxClient, params: Record<string, unknown>) {
  const op = oneOf(
    params.op,
    ["upload", "edit", "confirm", "voice", ...READING_OPS] as const,
    "op",
  );
  if (op === "upload") {
    const form = new FormData();
    form.append("file", upload(params.file));
    return client.writeOwner("readingUpload", undefined, form);
  }
  const id = uuid(params.id, "id");
  if (op === "voice") {
    const form = new FormData();
    form.append("file", upload(params.file));
    return client.writeOwner("readingVoice", id, form);
  }
  if (op === "edit") {
    const draft = params.draft;
    if (typeof draft !== "object" || draft === null || JSON.stringify(draft).length > 16_384) {
      fail("draft must be a reading draft.");
    }
    return client.writeOwner("readingEdit", id, {
      revision: revision(params),
      draft,
    });
  }
  if (op === "confirm") {
    const binding = text(params.binding, "binding", 64, 64);
    return client.writeOwner(
      "readingStep",
      id,
      {
        revision: revision(params),
        binding: /^[a-f0-9]{64}$/.test(binding) ? binding : fail("binding is required."),
      },
      { params: { op } },
    );
  }
  return client.writeOwner("readingStep", id, { revision: revision(params) }, { params: { op } });
}

function documentIds(raw: unknown) {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > 20) {
    fail("Pick up to 20 files.");
  }
  return list.map((value) => uuid(value, "documentIds"));
}

/** Warranty claims. NSVX only prepares a draft packet; there is no send route. */
export async function warrantyAction(client: NsvxClient, params: Record<string, unknown>) {
  const op = oneOf(
    params.op,
    ["create", "edit", "resume", "cancel", "confirm", "upload"] as const,
    "op",
  );
  if (op === "create") {
    return client.writeOwner("warrantyCreate", undefined, {
      client_key: uuid(params.clientKey, "clientKey"),
      document_ids: documentIds(params.documentIds),
      fault: text(params.fault ?? "", "fault", 0, 8000),
      transcript_command_id: null,
      language: params.language === "pt" ? "pt" : "en",
    });
  }
  const id = uuid(params.id, "id");
  if (op === "upload") {
    const files = Array.isArray(params.files) ? params.files : [];
    if (files.length === 0 || files.length > 20) {
      fail("Add 1-20 files.");
    }
    const form = new FormData();
    form.append("revision", String(revision(params)));
    for (const file of files) {
      form.append("files", upload(file));
    }
    return client.writeOwner("warrantyUpload", id, form);
  }
  if (op === "edit") {
    return client.writeOwner("warrantyEdit", id, {
      revision: revision(params),
      fault: text(params.fault ?? "", "fault", 0, 8000),
      product: text(params.product ?? "", "product", 0, 300),
      document_ids: documentIds(params.documentIds),
      transcript_command_id: null,
    });
  }
  if (op === "confirm") {
    const sha256 = text(params.sha256, "sha256", 64, 64);
    return client.writeOwner(
      "warrantyStep",
      id,
      {
        revision: revision(params),
        packet_id: uuid(params.packetId, "packetId"),
        sha256: /^[a-f0-9]{64}$/.test(sha256) ? sha256 : fail("sha256 is required."),
      },
      { params: { op } },
    );
  }
  return client.writeOwner("warrantyStep", id, { revision: revision(params) }, { params: { op } });
}

/** Grant changes: the expiry warning setting, and revoking one grant (NSVX audits both). */
export async function grantAction(client: NsvxClient, params: Record<string, unknown>) {
  const op = oneOf(params.op, ["notice", "revoke"] as const, "op");
  if (op === "notice") {
    return client.writeOwner("grantNotice", undefined, {
      enabled: params.enabled === true,
      days: int(params.days ?? 7, "days", 1, 90),
    });
  }
  return client.writeOwner("grantRevoke", uuid(params.id, "id"), {});
}

/** NSVX explains a grant and its denials in plain words; nothing changes. */
export async function explainGrant(client: NsvxClient, params: Record<string, unknown>) {
  return client.readOwnerPost("grantExplain", {}, uuid(params.id, "id"));
}

type Register = (
  name: `nsvx.${string}`,
  scope: "operator.read" | "operator.write" | "operator.approvals" | "operator.admin",
  run: (params: Record<string, unknown>) => Promise<unknown>,
) => void;

export function registerBusinessMethods(method: Register, client: NsvxClient) {
  method("nsvx.business.file", "operator.read", (params) => readBusinessFile(client, params));
  method("nsvx.business.explain", "operator.read", (params) => explainGrant(client, params));
  // Collections reach supplier portals and file documents in Drive; a reading confirm sends to the supplier.
  method("nsvx.business.provider", "operator.write", (params) => providerAction(client, params));
  method("nsvx.business.workflow", "operator.write", (params) => workflowAction(client, params));
  method("nsvx.business.reading", "operator.write", (params) => readingAction(client, params));
  method("nsvx.business.warranty", "operator.write", (params) => warrantyAction(client, params));
  // Sign-in details and permission grants: admin, like credential and config changes.
  method("nsvx.business.access", "operator.admin", (params) => saveAccess(client, params));
  method("nsvx.business.grant", "operator.admin", (params) => grantAction(client, params));
}
