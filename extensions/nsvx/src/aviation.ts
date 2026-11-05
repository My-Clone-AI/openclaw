import { ROLES, type Checkin } from "./aviation-data.js";
import type { NsvxClient, OwnerFile, OwnerWrite } from "./client.js";
import { NsvxError } from "./client.js";

/**
 * The owner's Aviation changes. Each maps to one fixed NSVX route (`OWNER_WRITES`) with a body NSVX's own pydantic
 * models accept; NSVX validates the flight itself (`logbook.normalise`), keeps revisions, and audits every change.
 */

type Params = Record<string, unknown>;

const ID = /^[\w-]{1,100}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DIGEST = /^[0-9a-f]{64}$/i;
const PNR = /^[A-Za-z0-9]{5,8}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const WORK_SERVICES = ["cwp", "mail", "portal"] as const;
const COUNTERSIGN = ["not_required", "required", "recorded"] as const;
const EXPIRY = ["none", "confirmed", "no_expiry"] as const;
/** The fields `logbook.normalise` reads; anything else would be ignored or refused by NSVX. */
export const ENTRY_FIELDS = new Set<string>([
  "kind",
  "log_date",
  "flight_no",
  "dep_place",
  "arr_place",
  "off_block_at",
  "on_block_at",
  "aircraft_model",
  "registration",
  "pic_name",
  "total_min",
  "se_min",
  "me_min",
  "mp_min",
  "night_min",
  "ifr_min",
  "to_day",
  "to_night",
  "ldg_day",
  "ldg_night",
  "remarks",
  "countersign_required",
  "fstd_type",
  "fstd_qualification",
  "fstd_min",
  ...ROLES,
]);

function id(params: Params, name = "id"): string {
  const value = params[name];
  if (typeof value !== "string" || !ID.test(value)) {
    throw new NsvxError("invalid", `${name} is required.`);
  }
  return value;
}

function text(params: Params, name: string, max: number, min = 1): string {
  const value = params[name];
  if (typeof value !== "string" || value.trim().length < min || value.length > max) {
    throw new NsvxError("invalid", `${name} must be text of ${min} to ${max} characters.`);
  }
  return value.trim();
}

function optional(params: Params, name: string, max: number): string | null {
  return params[name] === undefined || params[name] === null || params[name] === ""
    ? null
    : text(params, name, max);
}

function day(params: Params, name: string): string {
  const value = params[name];
  if (typeof value !== "string" || !DAY.test(value)) {
    throw new NsvxError("invalid", `${name} must be a date (YYYY-MM-DD).`);
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

/** A logbook entry or draft: only NSVX's field names, each a short scalar. */
export function entryFields(params: Params): Record<string, unknown> {
  const raw = params.fields;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new NsvxError("invalid", "fields is required.");
  }
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(raw)) {
    const scalar =
      value === null ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value)) ||
      (typeof value === "string" && value.length <= 300);
    if (!ENTRY_FIELDS.has(name) || !scalar) {
      throw new NsvxError("invalid", `fields.${name} is not a logbook field.`);
    }
    out[name] = value;
  }
  return out;
}

function docPatch(params: Params): Record<string, unknown> {
  const raw = (params.patch ?? {}) as Params;
  const out: Record<string, unknown> = {};
  if (raw.display_name !== undefined) {
    out.display_name = optional(raw, "display_name", 120);
  }
  if (raw.category !== undefined) {
    out.category = optional(raw, "category", 60);
  }
  if (raw.tags !== undefined) {
    if (
      !Array.isArray(raw.tags) ||
      raw.tags.length > 20 ||
      raw.tags.some((tag) => typeof tag !== "string" || tag.length > 40)
    ) {
      throw new NsvxError("invalid", "tags must be up to 20 short words.");
    }
    out.tags = raw.tags;
  }
  for (const name of ["favorite", "pinned"] as const) {
    if (raw[name] !== undefined) {
      if (typeof raw[name] !== "boolean") {
        throw new NsvxError("invalid", `${name} must be true or false.`);
      }
      out[name] = raw[name];
    }
  }
  if (raw.expiry !== undefined) {
    const expiry = (raw.expiry ?? {}) as Params;
    const state = oneOf(expiry, "state", EXPIRY);
    const reminders = expiry.reminders ?? [];
    if (
      !Array.isArray(reminders) ||
      reminders.some((n) => typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 365)
    ) {
      throw new NsvxError("invalid", "reminders must be days before the date.");
    }
    out.expiry = {
      state,
      expires_on: state === "confirmed" ? day(expiry, "expires_on") : null,
      issued_on: expiry.issued_on ? day(expiry, "issued_on") : null,
      reminders,
    };
  }
  if (Object.keys(out).length === 0) {
    throw new NsvxError("invalid", "Nothing to change.");
  }
  return out;
}

function settings(params: Params): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (params.time !== undefined) {
    if (typeof params.time !== "string" || !TIME.test(params.time)) {
      throw new NsvxError("invalid", "time must be HH:MM.");
    }
    out.time = params.time;
  }
  if (params.tz !== undefined) {
    out.tz = text(params, "tz", 60);
  }
  if (params.enabled !== undefined) {
    if (typeof params.enabled !== "boolean") {
      throw new NsvxError("invalid", "enabled must be true or false.");
    }
    out.enabled = params.enabled;
  }
  if (params.holderName !== undefined) {
    out.holder_name = text(params, "holderName", 120, 0);
  }
  if (params.holderLicence !== undefined) {
    out.holder_licence = text(params, "holderLicence", 60, 0);
  }
  return out;
}

const ACTIVE = (row: Checkin) => row.status !== "done" && row.status !== "cancelled";

/**
 * NSVX has no idempotency on check-in intake, so one booking is checked here, right before the effect: a second
 * schedule for a booking that is still active comes back as `conflict` instead of a duplicate airline run.
 */
export async function scheduleCheckin(client: NsvxClient, params: Params) {
  const pnr = params.pnr;
  if (typeof pnr !== "string" || !PNR.test(pnr.trim())) {
    throw new NsvxError("invalid", "pnr must be 5 to 8 letters or digits.");
  }
  const body = {
    pnr: pnr.trim().toUpperCase(),
    airline: text(params, "airline", 100),
    surname: optional(params, "surname", 100),
    first_name: optional(params, "firstName", 100),
  };
  const { checkins } = await client.readOwnerView<{ checkins: Checkin[] }>("aviationCheckins");
  if (checkins.some((row) => ACTIVE(row) && row.pnr === body.pnr)) {
    throw new NsvxError("conflict", "This booking already has a check-in.");
  }
  return client.writeOwner<Checkin>("aviationCheckin", undefined, body);
}

/** One owner change; `action` picks the NSVX route. */
export async function changeAviation(client: NsvxClient, params: Params): Promise<unknown> {
  const write = (route: OwnerWrite, target: string | undefined, body: unknown) =>
    client.writeOwner(route, target, body);
  switch (params.action) {
    case "add":
      return write("aviationEntryAdd", undefined, {
        fields: entryFields(params),
        reason: optional(params, "reason", 500),
      });
    case "correct":
      return write("aviationEntryCorrect", id(params), {
        fields: entryFields(params),
        reason: text(params, "reason", 500, 3),
      });
    case "void":
      return write("aviationEntryVoid", id(params), { reason: text(params, "reason", 500, 3) });
    case "countersign":
      return write("aviationCountersign", id(params), {
        state: oneOf(params, "state", COUNTERSIGN),
        note: optional(params, "note", 300),
      });
    case "certify":
      return write("aviationCertify", undefined, {
        period_from: day(params, "from"),
        period_to: day(params, "to"),
      });
    case "import": {
      const digest = params.digest;
      if (typeof digest !== "string" || !DIGEST.test(digest)) {
        throw new NsvxError("invalid", "digest is required.");
      }
      return write("aviationImport", undefined, { digest });
    }
    case "syncDay":
      return write("aviationSyncDay", undefined, {});
    case "draft":
      return write("aviationDraft", id(params), { fields: entryFields(params) });
    case "confirm":
      return write("aviationConfirm", id(params), { fields: entryFields(params) });
    case "dismiss":
      return write("aviationDismiss", id(params), { reason: text(params, "reason", 500, 3) });
    case "compare":
      return write("aviationCompare", undefined, {});
    case "settings":
      return write("aviationSettings", undefined, settings(params));
    case "roots": {
      const roots = params.roots;
      if (
        !Array.isArray(roots) ||
        roots.length < 1 ||
        roots.length > 20 ||
        roots.some((root) => typeof root !== "string" || !root.startsWith("/") || root.length > 500)
      ) {
        throw new NsvxError("invalid", "roots must be 1 to 20 Drive folders.");
      }
      return write("aviationDocRoots", undefined, { roots });
    }
    case "identity":
      if (typeof params.show !== "boolean") {
        throw new NsvxError("invalid", "show must be true or false.");
      }
      return write("aviationDocIdentity", undefined, { show: params.show });
    case "alertRead": {
      const alert = params.id;
      if (typeof alert !== "number" || !Number.isSafeInteger(alert) || alert < 1) {
        throw new NsvxError("invalid", "id is required.");
      }
      return write("aviationAlertRead", String(alert), {});
    }
    case "doc":
      return write("aviationDocUpdate", id(params), docPatch(params));
    case "checkin":
      return scheduleCheckin(client, params);
    case "cancelCheckin":
      return write("aviationCheckinCancel", id(params), {});
    case "retryCheckin":
      return write("aviationCheckinRetry", id(params), {});
    case "workSync":
      return write("workSync", oneOf(params, "service", WORK_SERVICES), {});
    default:
      throw new NsvxError("invalid", "Unknown aviation change.");
  }
}

const FILES: Record<string, OwnerFile> = {
  csv: "aviationCsv",
  xlsx: "aviationXlsx",
  print: "aviationPrint",
  doc: "aviationDocFile",
};

/** A logbook export or one document's bytes, for the browser to save. */
export function aviationFile(client: NsvxClient, params: Params) {
  const kind = oneOf(params, "kind", ["csv", "xlsx", "print", "doc"] as const);
  if (kind === "doc") {
    return client.readOwnerFile("aviationDocFile", { id: id(params), download: "1" });
  }
  return client.readOwnerFile(FILES[kind]!, {
    ...(params.start ? { start: day(params, "start") } : {}),
    ...(params.end ? { end: day(params, "end") } : {}),
  });
}

type Register = (
  name: `nsvx.${string}`,
  scope: "operator.read" | "operator.write",
  run: (params: Params) => Promise<unknown>,
) => void;

/** Reads go through `nsvx.view`; these are the POST read, the files, and the owner's changes. */
export function registerAviationMethods(method: Register, client: NsvxClient) {
  method("nsvx.aviation.suggest", "operator.read", (params) =>
    client.readOwnerPost("aviationExpiry", {}, id(params)),
  );
  method("nsvx.aviation.file", "operator.read", async (params) => aviationFile(client, params));
  // Check-ins later act on an airline's site (never paying); the rest change the owner's own records.
  method("nsvx.aviation.change", "operator.write", (params) => changeAviation(client, params));
}
