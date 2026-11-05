import type { NsvxClient, OwnerWrite } from "./client.js";
import { NsvxError } from "./client.js";
import {
  amount,
  day,
  flag,
  object,
  oneOf,
  optional,
  strings,
  text,
  uuid,
  whole,
  type Params,
} from "./params.js";

/** `PROC-2026-0001` or the case's id: the two forms NSVX accepts as a case key (`cases/api.py`). */
const CASE_KEY = /^(?:PROC-\d{4}-\d{4}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const CASE_STATUSES = ["open", "waiting_docs", "attention", "resolved", "archived"] as const;
const NATURES = ["potential", "formal"] as const;
const FACT_STATUSES = ["owner", "confirmed", "extracted", "disputed"] as const;
const SUGGESTION_STATUSES = ["new", "reviewing", "confirmed", "rejected"] as const;
const DEADLINE_KINDS = ["task", "legal_deadline", "reminder"] as const;
const DEADLINE_STATES = ["open", "done", "cancelled"] as const;
const DOC_STATUSES = ["draft", "reviewed", "approved", "signed", "sent"] as const;
const DUE_BASES = ["contract", "document", "owner", "estimate"] as const;
const PAYMENT_KINDS = ["payment", "credit", "deduction", "offset"] as const;
const DERIVE_KINDS = ["redaction", "crop"] as const;
const IDENTITY_STATES = ["unverified", "owner_confirmed", "document_verified"] as const;
const SHORT_KEY = /^[a-z_]{1,40}$/;

/** The text and choice fields the case form may change; NSVX checks the values it knows. */
const CASE_TEXT: Record<string, number> = {
  title: 200,
  description: 8000,
  issue: 4000,
  stage: 120,
  jurisdiction: 60,
  court: 200,
  procedure: 200,
  governing_law: 200,
  external_ref: 120,
  legal_rep: 200,
  priority: 20,
  amount_claimed: 20,
  amount_disputed: 20,
  notes: 8000,
  outcome: 4000,
};

export function caseKey(params: Params, name = "key"): string {
  const value = params[name];
  if (typeof value !== "string" || !CASE_KEY.test(value)) {
    throw new NsvxError("invalid", `${name} must be a case reference.`);
  }
  return value;
}

function casePatch(params: Params) {
  const body: Record<string, unknown> = { revision: whole(params, "revision", 0, 1_000_000_000) };
  for (const [name, max] of Object.entries(CASE_TEXT)) {
    if (params[name] !== undefined) {
      // The form clears a field by sending it empty.
      body[name] = params[name] === "" ? "" : text(params, name, max);
    }
  }
  if (params.status !== undefined) {
    body.status = oneOf(params, "status", CASE_STATUSES);
  }
  if (params.nature !== undefined) {
    body.nature = oneOf(params, "nature", NATURES);
  }
  if (params.categories !== undefined) {
    body.categories = strings(params, "categories", 40, 60);
  }
  for (const name of ["ai_allowed", "legal_hold"]) {
    if (params[name] !== undefined) {
      body[name] = flag(params, name);
    }
  }
  return body;
}

function rects(params: Params) {
  const value = params.rects;
  const unit = (n: unknown) => typeof n === "number" && n >= 0 && n <= 1;
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 50 ||
    !value.every(
      (rect: { x?: unknown; y?: unknown; w?: unknown; h?: unknown }) =>
        unit(rect.x) && unit(rect.y) && unit(rect.w) && unit(rect.h),
    )
  ) {
    throw new NsvxError("invalid", "rects must be 1 to 50 areas on the page.");
  }
  return value as { x: number; y: number; w: number; h: number }[];
}

function sheetRows(params: Params) {
  const value = params.rows;
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 5000 ||
    !value.every(
      (row: { sheet?: unknown; row?: unknown; cells?: unknown }) =>
        typeof row.sheet === "string" &&
        typeof row.row === "number" &&
        Array.isArray(row.cells) &&
        row.cells.every((cell) => typeof cell === "string"),
    )
  ) {
    throw new NsvxError("invalid", "rows must list the chosen cells.");
  }
  return value;
}

/** One owner change to a case; `action` picks the fixed NSVX route. */
export function changeCase(client: NsvxClient, params: Params): Promise<unknown> {
  const onCase = (route: OwnerWrite, body: unknown) =>
    client.writeOwner(route, caseKey(params), body);
  const onItem = (route: OwnerWrite, name: string, body: unknown = {}) =>
    client.writeOwner(route, caseKey(params), body, { params: { item: uuid(params, name) } });
  switch (params.action) {
    case "create":
      return client.writeOwner("caseCreate", undefined, {
        title: text(params, "title", 200),
        categories: strings(params, "categories", 40, 60),
        nature: oneOf(params, "nature", NATURES),
      });
    case "update":
      return onCase("caseUpdate", casePatch(params));
    case "summary":
      return onCase("caseSummary", {});
    case "suggestionStatus":
      return client.writeOwner("caseSuggestionStatus", uuid(params, "id"), {
        status: oneOf(params, "status", SUGGESTION_STATUSES),
        reason: optional(params, "reason", 500),
      });
    case "suggestionConvert":
      return client.writeOwner("caseSuggestionConvert", uuid(params, "id"), {});
    case "discovery":
      return client.writeOwner("caseDiscovery", undefined, {});
    case "settings":
      return client.writeOwner("caseSettings", undefined, {
        ...(params.attention_days === undefined
          ? {}
          : { attention_days: whole(params, "attention_days", 7, 3650) }),
        ...(params.discovery_enabled === undefined
          ? {}
          : { discovery_enabled: flag(params, "discovery_enabled") }),
      });
    case "addParty":
      return onCase("casePartyAdd", {
        name: text(params, "name", 200),
        role: oneOf(params, "role", ["respondent", "claimant", "witness", "lawyer", "other"]),
        kind: oneOf(params, "kind", ["person", "company", "public_body"]),
        contact: optional(params, "contact", 500),
      });
    case "confirmParty":
      return onItem("casePartyUpdate", "partyId", {
        role: text(params, "role", 40),
        name: text(params, "name", 200),
        identity_state: oneOf(params, "identity_state", IDENTITY_STATES),
        identity_source: optional(params, "identity_source", 300) ?? "owner",
      });
    case "removeParty":
      return onItem("casePartyRemove", "partyId");
    case "addFact":
      return onCase("caseFactAdd", {
        text: text(params, "text", 4000),
        status: oneOf(params, "status", FACT_STATUSES),
        disputed: params.disputed === true,
        evidence_ids: strings(params, "evidence_ids", 100, 40),
      });
    case "addEvent":
      return client.writeOwner(
        "caseEventAdd",
        caseKey(params),
        {
          title: text(params, "title", 300),
          on_date: day(params, "on_date"),
          date_precision: day(params, "on_date") ? "day" : "unknown",
          status: oneOf(params, "status", FACT_STATUSES),
          evidence_ids: strings(params, "evidence_ids", 100, 40),
        },
        params.supersedes ? { params: { supersedes: uuid(params, "supersedes") } } : {},
      );
    case "proofDrive":
      return onCase("caseProofDrive", {
        file_ids: strings(params, "file_ids", 50),
        folder: optional(params, "folder", 8),
      });
    case "proofUpdate":
      return onItem("caseProofUpdate", "evidenceId", proofPatch(params));
    case "proofRemove":
      return onItem("caseProofRemove", "evidenceId");
    case "proofVersion":
      return onItem("caseProofVersion", "evidenceId");
    case "proofDerive":
      return onItem("caseProofDerive", "evidenceId", {
        kind: oneOf(params, "kind", DERIVE_KINDS),
        page: whole(params, "page", 1, 10_000),
        rects: rects(params),
      });
    case "proofCheck":
      return client.writeOwner("caseProofCheck", uuid(params, "evidenceId"), {});
    case "noteAdd":
      return client.writeOwner("caseNoteAdd", uuid(params, "evidenceId"), {
        text: text(params, "text", 2000),
        kind: "note",
        case_id: uuid(params, "caseId"),
      });
    case "noteRemove":
      return client.writeOwner("caseNoteRemove", uuid(params, "evidenceId"), {}, {
        params: { item: uuid(params, "noteId") },
      });
    case "addObligation":
      return onCase("caseObligationAdd", {
        kind: text(params, "kind", 40),
        description: text(params, "description", 300),
        amount: amount(params, "amount"),
        due_date: day(params, "due_date"),
        due_basis: oneOf(params, "due_basis", DUE_BASES),
        disputed: params.disputed === true,
      });
    case "planObligations":
      return onCase("caseObligationPlan", {
        kind: text(params, "kind", 40),
        label: text(params, "label", 80),
        start: day(params, "start"),
        months: whole(params, "months", 1, 120),
        amount: amount(params, "amount"),
        due_day: whole(params, "due_day", 1, 31),
        due_basis: oneOf(params, "due_basis", DUE_BASES),
      });
    case "removeObligation":
      return onItem("caseObligationRemove", "obligationId");
    case "addPayment":
      return onCase("casePaymentAdd", {
        amount: amount(params, "amount"),
        kind: oneOf(params, "kind", PAYMENT_KINDS),
        paid_on: day(params, "paid_on"),
        method: optional(params, "method", 60),
        verified: params.verified === true,
        obligation_id: params.obligation_id ? uuid(params, "obligation_id") : null,
        ...(params.finance_tx_id === undefined
          ? {}
          : { finance_tx_id: whole(params, "finance_tx_id", 1, Number.MAX_SAFE_INTEGER) }),
      });
    case "removePayment":
      return onItem("casePaymentRemove", "paymentId");
    case "addDeadline":
      return onCase("caseDeadlineAdd", {
        title: text(params, "title", 300),
        kind: oneOf(params, "kind", DEADLINE_KINDS),
        due_date: day(params, "due_date"),
        verified: params.verified === true,
        basis: optional(params, "basis", 500),
      });
    case "setDeadline":
      return onItem("caseDeadlineUpdate", "deadlineId", {
        status: oneOf(params, "status", DEADLINE_STATES),
      });
    case "addSource": {
      const url = optional(params, "url", 500);
      if (url && !/^https?:\/\//i.test(url)) {
        throw new NsvxError("invalid", "url must start with https://.");
      }
      return onCase("caseSourceAdd", {
        title: text(params, "title", 300),
        url,
        law_ref: optional(params, "law_ref", 200),
        version_note: optional(params, "version_note", 300),
        verified: true,
      });
    }
    case "verifySource":
      return onItem("caseSourceUpdate", "sourceId", { verified: flag(params, "verified") });
    case "removeSource":
      return onItem("caseSourceRemove", "sourceId");
    case "docProposal":
      return onCase("caseDocumentProposal", { template: text(params, "template", 60) });
    case "docAdd":
      return onCase("caseDocumentAdd", {
        template: text(params, "template", 60),
        fact_ids: strings(params, "fact_ids", 200, 40),
        evidence_ids: strings(params, "evidence_ids", 200, 40),
      });
    case "docEdit":
      return client.writeOwner("caseDocumentEdit", uuid(params, "documentId"), {
        body: text(params, "body", 200_000),
      });
    case "docStatus":
      return client.writeOwner("caseDocumentStatus", uuid(params, "documentId"), {
        status: oneOf(params, "status", DOC_STATUSES),
      });
    case "aiPrepare": {
      const action = params.ai;
      if (typeof action !== "string" || !SHORT_KEY.test(action)) {
        throw new NsvxError("invalid", "ai is required.");
      }
      return onCase("caseRunPrepare", { action, params: object(params, "aiParams", 8000) });
    }
    case "aiAuthorize":
      // The hash binds the owner's consent to the exact material NSVX listed.
      return client.writeOwner("caseRunAuthorize", uuid(params, "runId"), {
        manifest_sha256: text(params, "manifest_sha256", 64, 64),
      });
    case "aiCancel":
      return client.writeOwner("caseRunCancel", uuid(params, "runId"), {});
    case "export":
      return onCase("caseExport", {
        formats: ["zip", "pdf"],
        include_originals: flag(params, "include_originals"),
        include_privileged: flag(params, "include_privileged"),
        prefer_redacted: flag(params, "prefer_redacted"),
      });
    case "sheetStart":
      return onCase("caseSheetStart", {
        evidence_id: uuid(params, "evidenceId"),
        party_id: uuid(params, "partyId"),
        new_revision: params.new_revision === true,
      });
    case "sheetConfirm":
      return client.writeOwner(
        "caseSheetConfirm",
        caseKey(params),
        {
          revision: whole(params, "revision", 0, 1_000_000_000),
          rows: sheetRows(params),
          shared: params.shared === true,
          identity_confirmed: flag(params, "identity_confirmed"),
        },
        { params: { item: uuid(params, "sheetId") } },
      );
    case "sheetCancel":
      return onItem("caseSheetCancel", "sheetId");
    default:
      throw new NsvxError("invalid", "Unknown case change.");
  }
}

function proofPatch(params: Params) {
  const body: Record<string, unknown> = {};
  for (const [name, max] of [
    ["folder", 8],
    ["description", 2000],
    ["evidence_type", 40],
    ["author", 200],
    ["location_ref", 200],
  ] as const) {
    if (params[name] !== undefined) {
      body[name] = params[name] === "" ? null : text(params, name, max);
    }
  }
  if (params.doc_date !== undefined) {
    body.doc_date = day(params, "doc_date");
  }
  if (params.tags !== undefined) {
    body.tags = strings(params, "tags", 40, 60);
  }
  for (const name of ["privileged", "exclude_from_ai"]) {
    if (params[name] !== undefined) {
      body[name] = flag(params, name);
    }
  }
  return body;
}

/** Below the Gateway socket's 25 MB limit once base64 is counted. */
const UPLOAD_LIMIT = 16 * 1024 * 1024;

/** The owner's files as NSVX's multipart upload; NSVX reports a re-upload as a duplicate of the same bytes. */
export function uploadProof(client: NsvxClient, params: Params) {
  const files = params.files;
  if (!Array.isArray(files) || files.length < 1 || files.length > 20) {
    throw new NsvxError("invalid", "files must be 1 to 20 files.");
  }
  const form = new FormData();
  let total = 0;
  for (const file of files as { name?: unknown; mime?: unknown; data?: unknown }[]) {
    if (typeof file.name !== "string" || typeof file.data !== "string" || !file.name) {
      throw new NsvxError("invalid", "Each file needs a name and data.");
    }
    const bytes = Buffer.from(file.data, "base64");
    total += bytes.byteLength;
    if (total > UPLOAD_LIMIT) {
      throw new NsvxError("invalid", "Files are too large to send here. Send fewer at once.");
    }
    form.append(
      "files",
      new Blob([bytes], { type: typeof file.mime === "string" ? file.mime : "" }),
      file.name.slice(0, 200),
    );
  }
  const folder = optional(params, "folder", 8);
  if (folder) {
    form.append("folder", folder);
  }
  return client.writeOwner<{ results: { name: string; code?: string; error?: string }[] }>(
    "caseProofUpload",
    caseKey(params),
    form,
  );
}

/** The case's PDF, DOCX, dossier, or one proof's original bytes, for the browser to save. */
export function caseFile(client: NsvxClient, params: Params) {
  switch (params.kind) {
    case "proof":
      return client.readOwnerFile("caseProofFile", {
        id: uuid(params, "evidenceId"),
        case: caseKey(params),
      });
    case "document":
      return client.readOwnerFile("caseDocumentFile", {
        id: uuid(params, "documentId"),
        format: oneOf(params, "format", ["pdf", "docx"]),
      });
    case "export":
      return client.readOwnerFile("caseExportFile", {
        id: caseKey(params),
        file: text(params, "file", 200),
      });
    default:
      throw new NsvxError("invalid", "Unknown case file.");
  }
}

/** Private legal analysis of one clone draft. It never sends: the reply returns to the draft for the owner's approval. */
export function changeLegalReview(client: NsvxClient, params: Params): Promise<unknown> {
  switch (params.action) {
    case "prepare":
      return client.writeOwner("legalReviewPrepare", uuid(params, "outboxId"), {
        revision: text(params, "revision", 64, 64),
        draft_text: text(params, "text", 20_000),
      });
    case "authorize":
      return client.writeOwner("legalReviewAuthorize", uuid(params, "reviewId"), {
        manifest_sha256: text(params, "manifest_sha256", 64, 64),
      });
    case "cancel":
      return client.writeOwner("legalReviewCancel", uuid(params, "reviewId"), {});
    default:
      throw new NsvxError("invalid", "Unknown review change.");
  }
}

/** Saved procedures: every change carries the version the owner saw, and a run carries one key per intent. */
export function changeProcedure(client: NsvxClient, params: Params): Promise<unknown> {
  const saved = () => ({
    title: text(params, "title", 120),
    definition: object(params, "definition", 200_000),
  });
  switch (params.action) {
    case "propose":
      return client.writeOwner(
        "procedurePropose",
        undefined,
        params.missionId
          ? { mission_id: uuid(params, "missionId") }
          : { text: text(params, "text", 4000, 3) },
      );
    case "create":
      return client.writeOwner("procedureCreate", undefined, saved());
    case "edit":
      return client.writeOwner("procedureEdit", uuid(params, "id"), {
        ...saved(),
        version: whole(params, "version", 1, 1_000_000),
      });
    case "state":
      return client.writeOwner("procedureState", uuid(params, "id"), {
        version: whole(params, "version", 1, 1_000_000),
        enabled: flag(params, "enabled"),
      });
    case "run":
      return client.writeOwner("procedureRun", uuid(params, "id"), {
        version: whole(params, "version", 1, 1_000_000),
        inputs: object(params, "inputs", 20_000),
        client_key: uuid(params, "clientKey"),
      });
    case "resume":
      return client.writeOwner("procedureRunResume", uuid(params, "runId"), {});
    case "cancel":
      return client.writeOwner("procedureRunCancel", uuid(params, "runId"), {});
    default:
      throw new NsvxError("invalid", "Unknown procedure change.");
  }
}

type Register = (
  name: `nsvx.${string}`,
  scope: "operator.read" | "operator.write",
  run: (params: Params) => Promise<unknown>,
) => void;

/** Legal reads go through `nsvx.view`; these are the files and the owner's changes. */
export function registerLegalMethods(method: Register, client: NsvxClient) {
  method("nsvx.cases.change", "operator.write", (params) => changeCase(client, params));
  method("nsvx.cases.upload", "operator.write", async (params) => uploadProof(client, params));
  method("nsvx.cases.file", "operator.read", async (params) => caseFile(client, params));
  method("nsvx.legalReview.change", "operator.write", (params) => changeLegalReview(client, params));
  method("nsvx.procedures.change", "operator.write", (params) => changeProcedure(client, params));
}
