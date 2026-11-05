import type { NsvxClient, OwnerWrite, UploadFile } from "./client.js";
import { NsvxError } from "./client.js";
import {
  UPLOAD_MAX_BYTES,
  UPLOAD_MAX_FILES,
  UPLOAD_MAX_TOTAL,
  uploadType,
  type SignMode,
} from "./docs-data.js";

/**
 * The owner's Documents, Drive, and Signatures changes. Each maps to one fixed NSVX route (`OWNER_WRITES`) with a
 * body NSVX's own pydantic models accept; NSVX re-validates, audits, and owns every record and job.
 */

type Params = Record<string, unknown>;

const ID = /^[\w-]{1,100}$/;
const CODE = /^[\w.-]{1,80}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODES: readonly SignMode[] = ["personal", "eni", "company"];
const TEMPLATE_PARTS = new Set([
  "date",
  "month",
  "year",
  "issuer",
  "bank",
  "account",
  "type",
  "number",
  "entity",
  "description",
  "tax",
]);
const BOOLEAN_SETTINGS = [
  "auto_classify",
  "auto_import",
  "ai_enabled",
  "rename_drive",
  "confirm_provisional",
  "drive_backfill",
  "notify_imported",
  "notify_review",
  "notify_bank",
] as const;

function id(params: Params, name = "id", pattern = ID): string {
  const value = params[name];
  if (typeof value !== "string" || !pattern.test(value)) {
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

/** `null` clears a field, as the NSVX editor sends an emptied input. */
function nullable(params: Params, name: string, max: number): string | null {
  const value = params[name];
  return value === null || value === "" ? null : text(params, name, max);
}

function nullableDay(params: Params, name: string): string | null {
  const value = params[name];
  if (value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !DAY.test(value)) {
    throw new NsvxError("invalid", `${name} must be a date (YYYY-MM-DD).`);
  }
  return value;
}

function flag(params: Params, name: string): boolean {
  if (typeof params[name] !== "boolean") {
    throw new NsvxError("invalid", `${name} must be true or false.`);
  }
  return params[name];
}

/** The fields the NSVX `Correction` model reads; only the ones the owner changed are sent. */
function correction(params: Params): Record<string, unknown> {
  const raw = (params.patch ?? {}) as Params;
  const out: Record<string, unknown> = {};
  if (raw.subcategory !== undefined) {
    out.subcategory = id(raw, "subcategory", CODE);
  }
  for (const [name, max] of [
    ["document_type", 80],
    ["issuer", 120],
    ["document_number", 60],
  ] as const) {
    if (raw[name] !== undefined) {
      out[name] = nullable(raw, name, max);
    }
  }
  for (const name of ["document_date", "period_start", "period_end"] as const) {
    if (raw[name] !== undefined) {
      out[name] = nullableDay(raw, name);
    }
  }
  if (raw.remember !== undefined) {
    if (raw.remember !== "issuer") {
      throw new NsvxError("invalid", "remember must be issuer.");
    }
    out.remember = "issuer";
  }
  if (Object.keys(out).filter((key) => key !== "remember").length === 0) {
    throw new NsvxError("invalid", "Nothing to change.");
  }
  return out;
}

function folder(raw: unknown): { id: string; name: string; path: string } {
  const value = (raw ?? {}) as Params;
  return { id: id(value, "id"), name: text(value, "name", 300), path: text(value, "path", 600) };
}

/** The settings the NSVX Ajustes screen changes; NSVX `config.update` checks ranges again. */
export function docSettings(params: Params): Record<string, unknown> {
  const raw = (params.patch ?? {}) as Params;
  const out: Record<string, unknown> = {};
  for (const name of BOOLEAN_SETTINGS) {
    if (raw[name] !== undefined) {
      out[name] = flag(raw, name);
    }
  }
  for (const [name, min, max] of [
    ["threshold_auto", 0.5, 1],
    ["threshold_review", 0, 0.99],
  ] as const) {
    if (raw[name] !== undefined) {
      const value = raw[name];
      if (typeof value !== "number" || !(value >= min && value <= max)) {
        throw new NsvxError("invalid", `${name} must be between ${min} and ${max}.`);
      }
      out[name] = value;
    }
  }
  if (raw.drive_scope !== undefined) {
    if (raw.drive_scope !== "all" && raw.drive_scope !== "folders") {
      throw new NsvxError("invalid", "drive_scope must be all or folders.");
    }
    out.drive_scope = raw.drive_scope;
  }
  if (raw.drive_folders !== undefined) {
    if (!Array.isArray(raw.drive_folders) || raw.drive_folders.length > 200) {
      throw new NsvxError("invalid", "drive_folders must be up to 200 folders.");
    }
    out.drive_folders = raw.drive_folders.map(folder);
  }
  if (raw.upload_drive_folder !== undefined) {
    out.upload_drive_folder = raw.upload_drive_folder === null ? null : folder(raw.upload_drive_folder);
  }
  if (Object.keys(out).length === 0) {
    throw new NsvxError("invalid", "Nothing to change.");
  }
  return out;
}

/** NSVX `_template_ok`: only its placeholders, no path characters. */
function template(params: Params): string {
  const value = text(params, "template", 160, 0);
  const names = [...value.matchAll(/\{([a-z_]+)\}/g)].map((match) => match[1]);
  if (names.some((name) => !TEMPLATE_PARTS.has(name!)) || /[/\\:*?"<>|]/.test(value)) {
    throw new NsvxError("invalid", "template has an unknown part.");
  }
  return value;
}

/** One owner change to a document, a category, a rule, the settings, or the Drive sync; `action` picks the route. */
export async function changeDocs(client: NsvxClient, params: Params): Promise<unknown> {
  const write = (route: OwnerWrite, target: string | undefined, body: unknown, query = {}) =>
    client.writeOwner(route, target, body, { params: query });
  switch (params.action) {
    case "update":
      return write("documentUpdate", id(params), correction(params));
    case "approve":
      return write("documentApprove", id(params), {});
    case "rename":
      return write("documentRename", id(params), { name: text(params, "name", 160, 2) });
    case "reprocess":
      return write("documentReprocess", id(params), {});
    case "forget":
      // NSVX refuses without confirm=true; the Control tap asks twice before sending it.
      if (params.confirm !== true) {
        throw new NsvxError("invalid", "confirm must be true.");
      }
      return write("documentForget", id(params), {}, { confirm: "true" });
    case "noticesRead": {
      if (params.all === true) {
        return write("documentNotices", undefined, { all: true });
      }
      const ids = params.ids;
      if (
        !Array.isArray(ids) ||
        ids.length < 1 ||
        ids.length > 200 ||
        ids.some((n) => typeof n !== "number" || !Number.isSafeInteger(n) || n < 1)
      ) {
        throw new NsvxError("invalid", "ids must be notice numbers.");
      }
      return write("documentNotices", undefined, { ids });
    }
    case "settings":
      return write("documentSettings", undefined, docSettings(params));
    case "categoryAdd":
      return write("documentCategoryAdd", undefined, {
        parent: params.parent ? id(params, "parent", CODE) : null,
        label: text(params, "label", 60, 2),
        template: template(params),
      });
    case "categoryEdit": {
      const body: Record<string, unknown> = {};
      if (params.label !== undefined) {
        body.label = text(params, "label", 60, 2);
      }
      if (params.template !== undefined) {
        body.template = template(params);
      }
      if (params.active !== undefined) {
        body.active = flag(params, "active");
      }
      if (Object.keys(body).length === 0) {
        throw new NsvxError("invalid", "Nothing to change.");
      }
      return write("documentCategoryEdit", id(params, "code", CODE), body);
    }
    case "ruleOff":
      return write("documentRuleOff", id(params), {});
    case "driveSync":
      return write("driveResync", undefined, {});
    default:
      throw new NsvxError("invalid", "Unknown document change.");
  }
}

/**
 * Signature steps. A request carries the reviewed PDF's hash and one key per intent, so NSVX refuses a changed PDF and
 * replays a retried request instead of opening a second one. Signing itself happens in the official app.
 */
export async function changeSignatures(client: NsvxClient, params: Params): Promise<unknown> {
  switch (params.action) {
    case "fromDocument":
      return client.writeOwner("signatureFromDocument", id(params), {});
    case "request": {
      const mode = params.mode;
      if (typeof mode !== "string" || !MODES.includes(mode as SignMode)) {
        throw new NsvxError("invalid", "mode must be personal, eni, or company.");
      }
      const digest = params.digest;
      if (typeof digest !== "string" || !DIGEST.test(digest)) {
        throw new NsvxError("invalid", "digest is required.");
      }
      if (params.confirmed !== true) {
        throw new NsvxError("invalid", "The owner must confirm the review.");
      }
      return client.writeOwner("signatureRequest", id(params), {
        mode,
        company_id: mode === "company" ? id(params, "companyId", UUID) : null,
        expected_name: text(params, "name", 200, 3),
        expected_serial: text(params, "serial", 100, 3),
        reviewed_sha256: digest,
        idempotency_key: id(params, "key", UUID),
        confirmed: true,
      });
    }
    case "cancel":
      return client.writeOwner("signatureCancel", id(params), {});
    case "company": {
      const nipc = params.nipc;
      if (typeof nipc !== "string" || !/^\d{9}$/.test(nipc)) {
        throw new NsvxError("invalid", "nipc must be 9 digits.");
      }
      return client.writeOwner("signatureCompany", undefined, {
        name: text(params, "name", 200, 2),
        nipc,
      });
    }
    case "desktop":
      return client.writeOwner("signatureDesktop", id(params), {});
    case "otp": {
      // The one-time code passes through once; NSVX clears it and never stores it.
      const otp = params.otp;
      if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
        throw new NsvxError("invalid", "otp must be 6 digits.");
      }
      return client.writeOwner("signatureOtp", id(params), { otp });
    }
    default:
      throw new NsvxError("invalid", "Unknown signature change.");
  }
}

/** Files the browser read as base64, checked against NSVX's own type and size limits before anything is sent. */
export function uploadFiles(params: Params, pdfOnly = false): UploadFile[] {
  const raw = params.files;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > (pdfOnly ? 1 : UPLOAD_MAX_FILES)) {
    throw new NsvxError("invalid", `files must be 1 to ${pdfOnly ? 1 : UPLOAD_MAX_FILES} files.`);
  }
  let total = 0;
  return raw.map((entry) => {
    const file = (entry ?? {}) as Params;
    const name = text(file, "name", 200).replace(/[/\\]/g, "_");
    const mime = uploadType(name);
    if (!mime || (pdfOnly && mime !== "application/pdf")) {
      throw new NsvxError("invalid", `${name}: this file type is not supported.`);
    }
    if (typeof file.data !== "string") {
      throw new NsvxError("invalid", "data is required.");
    }
    const bytes = new Uint8Array(Buffer.from(file.data, "base64"));
    total += bytes.byteLength;
    if (bytes.byteLength === 0 || bytes.byteLength > UPLOAD_MAX_BYTES || total > UPLOAD_MAX_TOTAL) {
      throw new NsvxError("invalid", `${name}: the file is empty or too large.`);
    }
    return { name, mime, bytes };
  });
}

export function uploadDocs(client: NsvxClient, params: Params) {
  switch (params.target) {
    case "documents":
      return client.uploadOwner(
        "documentsUpload",
        undefined,
        uploadFiles(params),
        params.category ? { category: id(params, "category", CODE) } : {},
      );
    case "signature":
      return client.uploadOwner("signatureUpload", undefined, uploadFiles(params, true));
    case "signed":
      return client.uploadOwner("signatureImport", id(params), uploadFiles(params, true));
    default:
      throw new NsvxError("invalid", "target must be documents, signature, or signed.");
  }
}

/** One document's bytes, the metadata export, or a signature PDF, for the browser to save. */
export function docsFile(client: NsvxClient, params: Params) {
  switch (params.kind) {
    case "document":
      return client.readOwnerFile("documentFile", { id: id(params), download: "true" });
    case "export":
      return client.readOwnerFile("documentsExport");
    case "original":
      return client.readOwnerFile("signatureOriginal", { id: id(params) });
    case "reviewed":
      return client.readOwnerFile("signatureReviewed", { id: id(params) });
    case "signed":
      return client.readOwnerFile("signatureSigned", { id: id(params) });
    default:
      throw new NsvxError("invalid", "Unknown file.");
  }
}

/** NSVX inference on one document (explain, propose a category, why) or 2 to 5 proposals compared; saves nothing. */
export function askDocs(client: NsvxClient, params: Params) {
  switch (params.kind) {
    case "explain":
      return client.readOwnerPost("documentExplain", {}, id(params));
    case "triage":
      return client.readOwnerPost("documentTriage", {}, id(params));
    case "why":
      return client.readOwnerPost("documentWhy", {}, id(params));
    case "compare": {
      const ids = params.ids;
      if (
        !Array.isArray(ids) ||
        ids.length < 2 ||
        ids.length > 5 ||
        new Set(ids).size !== ids.length ||
        ids.some((value) => typeof value !== "string" || !UUID.test(value))
      ) {
        throw new NsvxError("invalid", "ids must be 2 to 5 different documents.");
      }
      return client.readOwnerPost("documentCompare", { document_ids: ids });
    }
    default:
      throw new NsvxError("invalid", "Unknown question.");
  }
}

type Register = (
  name: `nsvx.${string}`,
  scope: "operator.read" | "operator.write",
  run: (params: Params) => Promise<unknown>,
) => void;

/** Reads go through `nsvx.view`; these are the POST reads, the files, the uploads, and the owner's changes. */
export function registerDocsMethods(method: Register, client: NsvxClient) {
  method("nsvx.docs.ask", "operator.read", (params) => askDocs(client, params));
  method("nsvx.docs.file", "operator.read", async (params) => docsFile(client, params));
  method("nsvx.docs.upload", "operator.write", (params) => uploadDocs(client, params));
  method("nsvx.docs.change", "operator.write", (params) => changeDocs(client, params));
  // Signature requests lead to a qualified signature in the official app, so they need write scope.
  method("nsvx.signatures.change", "operator.write", (params) => changeSignatures(client, params));
}
