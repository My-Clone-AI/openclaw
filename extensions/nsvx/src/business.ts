import type { NsvxClient, OwnerFile, OwnerRoute } from "./client.js";
import { NsvxError } from "./client.js";
import {
  LOGIN_KEYS,
  PROVIDER_OPS,
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
import { isAdult } from "./group-data.js";

/**
 * Business and home services: the reads and owner taps of the NSVX Empresarial, Encomendas, Serviços da casa,
 * Leituras, Garantias, and Autorizações screens. Every route is fixed here; NSVX checks the owner session, CSRF,
 * and each body again, and stays the owner of the data and the background jobs.
 */

const get = (path: string, query?: readonly string[]): OwnerRoute => ({
  method: "GET",
  path,
  ...(query ? { query } : {}),
});
const post = (path: string): OwnerRoute => ({ method: "POST", path });

const PROVIDER_PATHS: Record<Provider, string> = {
  viaverde: "/api/business/viaverde",
  prio: "/api/business/prio",
  bolt: "/api/business/bolt",
  fidelidade: "/api/business/fidelidade",
  nos: "/api/utilities/nos",
  endesa: "/api/utilities/endesa",
  glovo: "/api/orders/glovo",
  amazon: "/api/orders/amazon-es",
};
/** NSVX answers these session views with GET; Via Verde, Fidelidade, and Endesa's first step use POST. */
const VIEW_OPS = new Set<ProviderOp>(["view"]);

const READINGS = "/api/utilities/meter-readings";
const GRANTS = "/api/group-companies/business-action-grants";

export const BUSINESS_VIEWS = {
  ...Object.fromEntries(PROVIDERS.map((p) => [p, get(PROVIDER_PATHS[p])])),
  amazonReturns: get("/api/orders/amazon-es/returns"),
  workflow: get("/api/business/workflow/{id}"),
  readings: get(READINGS),
  reading: get(`${READINGS}/{id}`),
  warranties: get("/api/warranties"),
  warranty: get("/api/warranties/{id}"),
  purchases: get("/api/warranties/purchases", ["q"]),
  grants: get(GRANTS),
  grantNotice: get(`${GRANTS}/expiry-notice`),
  grantsExpiring: get(`${GRANTS}/expiring`),
  grantDenials: get(`${GRANTS}/{id}/denials`),
} as Record<string, OwnerRoute>;

/** Files NSVX sends: the meter photo, the confirmed warranty packet, and the grants history export. */
const BUSINESS_FILES = {
  readingImage: get(`${READINGS}/{id}/image`),
  warrantyExport: get("/api/warranties/{id}/export/{packet}"),
  grantsExport: get(`${GRANTS}/export`, ["grant_id", "from", "to", "format"]),
} as Record<string, OwnerRoute>;

const ID = /^[\w.:-]{1,200}$/;

function fail(message: string): never {
  throw new NsvxError("invalid", message);
}

function oneOf<V extends string>(value: unknown, options: readonly V[], name: string): V {
  return options.includes(value as V) ? (value as V) : fail(`${name} must be one of ${options.join(", ")}.`);
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

function routeParams(params: Record<string, unknown>) {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      out[name] = text(value, name, 1, 200);
    }
  }
  return out;
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

export function readBusiness(client: NsvxClient, params: Record<string, unknown>) {
  const name = text(params.name, "name", 1, 40);
  if (!Object.hasOwn(BUSINESS_VIEWS, name)) {
    fail("Unknown business view.");
  }
  return client.routeOwner(BUSINESS_VIEWS[name]!, routeParams((params.params ?? {}) as never));
}

export async function readBusinessFile(client: NsvxClient, params: Record<string, unknown>) {
  const name = text(params.name, "name", 1, 40);
  if (!Object.hasOwn(BUSINESS_FILES, name)) {
    fail("Unknown business file.");
  }
  const query = routeParams((params.params ?? {}) as never);
  if (name === "grantsExport") {
    if (query.grant_id) {
      uuid(query.grant_id, "grant_id");
    }
    for (const day of [query.from, query.to]) {
      if (day && !validDay(day)) {
        fail("Dates must be YYYY-MM-DD.");
      }
    }
    if (query.from && query.to && query.from > query.to) {
      fail("The start date is after the end date.");
    }
    query.format = oneOf(query.format ?? "csv", ["csv", "json"] as const, "format");
  }
  return client.routeOwner<OwnerFile>(BUSINESS_FILES[name]!, query, undefined, { file: true });
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
 * A provider tap: sign in, refresh accounts, a sign-in step, or a quarter's collection. NSVX refuses a second
 * collection while one runs, so an uncertain answer is checked on the card before repeating.
 */
export function providerAction(client: NsvxClient, params: Record<string, unknown>) {
  const provider = oneOf(params.provider, PROVIDERS, "provider");
  const op = oneOf(params.op, PROVIDER_OPS[provider], "op");
  if (op === "credentials") {
    fail("Use nsvx.business.access for sign-in details.");
  }
  // Amazon's history is read through its session route; NSVX keeps the last answer for the screen.
  const slug = op === "history" ? "session" : op;
  return client.routeOwner(
    { method: VIEW_OPS.has(op) ? "GET" : "POST", path: `${PROVIDER_PATHS[provider]}/${slug}` },
    {},
    VIEW_OPS.has(op) ? undefined : providerBody(provider, op, params),
  );
}

/** Saves a provider's sign-in in NSVX's vault (Drive). The details pass through and are never kept or logged here. */
export function saveAccess(client: NsvxClient, params: Record<string, unknown>) {
  const provider = oneOf(params.provider, PROVIDERS, "provider");
  return client.routeOwner(
    post(`${PROVIDER_PATHS[provider]}/credentials`),
    {},
    providerBody(provider, "credentials", params),
  );
}

/** Starts a cross-supplier quarter collection, or resumes its unverified steps. */
export function workflowAction(client: NsvxClient, params: Record<string, unknown>) {
  const op = oneOf(params.op, ["start", "resume"] as const, "op");
  if (op === "resume") {
    return client.routeOwner(post("/api/business/workflow/{id}/recover"), {
      id: idOf(params.id),
    });
  }
  const chosen = Array.isArray(params.providers) ? params.providers : [];
  const providers = [...new Set(chosen.map((p) => oneOf(p, WORKFLOW_PROVIDERS, "providers")))];
  if (providers.length === 0) {
    fail("Pick at least one supplier.");
  }
  return client.routeOwner(
    post("/api/business/workflow/quarter"),
    {},
    { ...quarterBody(params), providers: providers.toSorted() },
  );
}

/**
 * Meter readings. Edits and steps carry the revision the owner saw, so NSVX refuses a stale one; `confirm` also
 * carries NSVX's binding for the exact values shown, and only that sends the reading to the supplier.
 */
export function readingAction(client: NsvxClient, params: Record<string, unknown>) {
  const op = oneOf(
    params.op,
    ["upload", "edit", "confirm", "voice", ...READING_OPS] as const,
    "op",
  );
  if (op === "upload") {
    const form = new FormData();
    form.append("file", upload(params.file));
    return client.routeOwner(post(READINGS), {}, form);
  }
  const id = { id: uuid(params.id, "id") };
  if (op === "voice") {
    const form = new FormData();
    form.append("file", upload(params.file));
    return client.routeOwner(post(`${READINGS}/{id}/voice`), id, form);
  }
  if (op === "edit") {
    const draft = params.draft;
    if (typeof draft !== "object" || draft === null || JSON.stringify(draft).length > 16_384) {
      fail("draft must be a reading draft.");
    }
    return client.routeOwner({ method: "PATCH", path: `${READINGS}/{id}` }, id, {
      revision: revision(params),
      draft,
    });
  }
  if (op === "confirm") {
    const binding = text(params.binding, "binding", 64, 64);
    return client.routeOwner(post(`${READINGS}/{id}/confirm`), id, {
      revision: revision(params),
      binding: /^[a-f0-9]{64}$/.test(binding) ? binding : fail("binding is required."),
    });
  }
  return client.routeOwner(post(`${READINGS}/{id}/${op}`), id, { revision: revision(params) });
}

function documentIds(raw: unknown) {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > 20) {
    fail("Pick up to 20 files.");
  }
  return list.map((value) => uuid(value, "documentIds"));
}

/** Warranty claims. NSVX only prepares a draft packet; there is no send route. */
export function warrantyAction(client: NsvxClient, params: Record<string, unknown>) {
  const op = oneOf(
    params.op,
    ["create", "edit", "resume", "cancel", "confirm", "upload"] as const,
    "op",
  );
  if (op === "create") {
    return client.routeOwner(
      post("/api/warranties"),
      {},
      {
        client_key: uuid(params.clientKey, "clientKey"),
        document_ids: documentIds(params.documentIds),
        fault: text(params.fault ?? "", "fault", 0, 8000),
        transcript_command_id: null,
        language: params.language === "pt" ? "pt" : "en",
      },
    );
  }
  const id = { id: uuid(params.id, "id") };
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
    return client.routeOwner(post("/api/warranties/{id}/upload"), id, form);
  }
  if (op === "edit") {
    return client.routeOwner({ method: "PATCH", path: "/api/warranties/{id}" }, id, {
      revision: revision(params),
      fault: text(params.fault ?? "", "fault", 0, 8000),
      product: text(params.product ?? "", "product", 0, 300),
      document_ids: documentIds(params.documentIds),
      transcript_command_id: null,
    });
  }
  if (op === "confirm") {
    const sha256 = text(params.sha256, "sha256", 64, 64);
    return client.routeOwner(post("/api/warranties/{id}/confirm"), id, {
      revision: revision(params),
      packet_id: uuid(params.packetId, "packetId"),
      sha256: /^[a-f0-9]{64}$/.test(sha256) ? sha256 : fail("sha256 is required."),
    });
  }
  return client.routeOwner(post(`/api/warranties/{id}/${op}`), id, {
    revision: revision(params),
  });
}

/** Grant changes: the expiry warning setting, and revoking one grant (NSVX audits both). */
export function grantAction(client: NsvxClient, params: Record<string, unknown>) {
  const op = oneOf(params.op, ["notice", "revoke"] as const, "op");
  if (op === "notice") {
    return client.routeOwner({ method: "PUT", path: `${GRANTS}/expiry-notice` }, {}, {
      enabled: params.enabled === true,
      days: int(params.days ?? 7, "days", 1, 90),
    });
  }
  return client.routeOwner(post(`${GRANTS}/{id}/revoke`), { id: uuid(params.id, "id") });
}

/** NSVX explains a grant and its denials in plain words; nothing changes. */
export function explainGrant(client: NsvxClient, params: Record<string, unknown>) {
  return client.routeOwner(post(`${GRANTS}/{id}/explanation`), { id: uuid(params.id, "id") });
}

/** Adult apps never show in this tab; NSVX's own screen filters them the same way. */
export function visibleGrants<G extends { app: string }>(grants: G[]) {
  return grants.filter((grant) => !isAdult({ id: grant.app }));
}

type Register = (
  name: `nsvx.${string}`,
  scope: "operator.read" | "operator.write" | "operator.approvals" | "operator.admin",
  run: (params: Record<string, unknown>) => Promise<unknown>,
) => void;

export function registerBusinessMethods(method: Register, client: NsvxClient) {
  method("nsvx.business.view", "operator.read", async (params) => {
    const data = await readBusiness(client, params);
    return params.name === "grants" || params.name === "grantsExpiring"
      ? { ...(data as object), grants: visibleGrants((data as { grants: [] }).grants ?? []) }
      : data;
  });
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
