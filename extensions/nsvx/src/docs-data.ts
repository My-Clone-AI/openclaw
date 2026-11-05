/**
 * NSVX Documentos and Assinaturas shapes (`web/src/logic/documents.ts`, `web/src/screens/Signatures.tsx`) and the pure
 * helpers both the Docs tab and the server read. No server imports: the browser bundle loads this file.
 */

export type ReviewStatus = "pending" | "auto" | "provisional" | "needs_review" | "confirmed";
export type Tone = "ok" | "warn" | "bad" | "run" | "";

export type Doc = {
  id: string;
  source: "drive" | "upload" | "bank";
  current_name: string;
  original_name: string;
  mime: string;
  byte_size: number | null;
  category: string | null;
  subcategory: string | null;
  document_type: string | null;
  issuer: string | null;
  document_number: string | null;
  document_date: string | null;
  period_start: string | null;
  period_end: string | null;
  account_last4: string | null;
  confidence: number | null;
  review_status: ReviewStatus;
  review_reasons: string[];
  status: string;
  imported_at: string;
  drive_url?: string;
  drive_path?: string | null;
};

export type DocDetail = Doc & {
  filing?: {
    state: string;
    receipt: { verified: boolean; url: string; folder_url: string; path: string } | null;
  } | null;
  explanation: (string | Record<string, unknown>)[];
  versions: { version: number; byte_size: number | null; created_at: string }[];
  names: {
    scope: "app" | "drive";
    old_name: string | null;
    new_name: string;
    result: string;
    detail: string | null;
    created_at: string;
  }[];
  events: { kind: string; actor: string; created_at: string }[];
  account: { label: string; bank: string | null; masked: string | null } | null;
  property: { name: string } | null;
  entity: { label: string } | null;
  text_excerpt: string | null;
};

export type Category = {
  code: string;
  parent: string | null;
  label: string;
  label_en: string;
  template: string;
  active: boolean;
  builtin: boolean;
};

export type DocList = { total: number; items: Doc[] };
export type Notice = { id: number; kind: string; title: string; body: string; url: string };

export type DriveStatus = {
  connected: boolean;
  state: string;
  push: { active: boolean };
  last_delta_at: string | null;
  last_processed_at: string | null;
  rename_available: boolean;
};

export type Overview = {
  counts: {
    total: number;
    review: number;
    provisional: number;
    processing: number;
    failed: number;
    duplicates: number;
    today: number;
  };
  by_category: Record<string, number>;
  categories: Category[];
  notices: Notice[];
  drive: DriveStatus;
};

export type Folder = { id: string; name: string; path: string };

export type DocSettings = {
  auto_classify: boolean;
  auto_import: boolean;
  ai_enabled: boolean;
  rename_drive: boolean;
  threshold_auto: number;
  threshold_review: number;
  confirm_provisional: boolean;
  drive_scope: "all" | "folders";
  drive_folders: Folder[];
  drive_backfill: boolean;
  notify_imported: boolean;
  notify_review: boolean;
  notify_bank: boolean;
  upload_drive_folder: Folder | null;
};

export type Rule = {
  id: string;
  pattern: string;
  subcategory: string | null;
  hits: number;
  active: boolean;
};

export type DriveFolders = DriveStatus & {
  folders: Folder[];
  documents: number;
};

export type DriveFile = {
  file_id: string;
  name: string;
  path: string | null;
  mime_type: string | null;
  modified_time: string | null;
};

export type SignMode = "personal" | "eni" | "company";

export type SignDoc = {
  id: string;
  name: string;
  pages: number;
  reviewed_sha256: string;
  entity: string | null;
  document_type: string | null;
  created_at: string;
  state?: string | null;
  transport?: string | null;
  signature_placement?: { page: number; width: number; height: number; rect: number[] } | null;
};

export type SignRequest = {
  id: string;
  mode: SignMode;
  state: string;
  transport?: string | null;
  company_id: string | null;
  signed_sha256: string | null;
  validation: {
    issues?: string[];
    message?: string;
    signatures?: {
      name: string;
      serial: string;
      issuer: string;
      trusted: boolean;
      qualified: boolean | null;
      trusted_timestamp: boolean;
      certificate_sha256: string;
    }[];
  };
};

export type SignDetail = {
  document: SignDoc;
  requests: SignRequest[];
  history: { id: number; kind: string; at: string }[];
};

export type Company = { id: string; name: string; nipc: string };
export type SignProfile = {
  configured: boolean;
  phone_masked: string | null;
  expected_name: string;
  expected_serial: string;
};
export type SignConfig = { desktop: { available: boolean } };

export const PAGE_SIZE = 40;

/** Accepted upload types, as NSVX `documents/api.py` EXT_MIME lists them. */
export const UPLOAD_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  txt: "text/plain",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
export const ACCEPT = Object.keys(UPLOAD_TYPES)
  .map((ext) => `.${ext}`)
  .join(",");
/** Base64 grows a file by a third; this keeps 20 files inside one Gateway frame. */
export const UPLOAD_MAX_BYTES = 12 * 1024 * 1024;
export const UPLOAD_MAX_TOTAL = 18 * 1024 * 1024;
export const UPLOAD_MAX_FILES = 20;

export function uploadType(name: string): string | undefined {
  return UPLOAD_TYPES[name.split(".").pop()?.toLowerCase() ?? ""];
}

/** Category icon names, as NSVX CATEGORY_ICON picks them. */
export const CATEGORY_ICON: Record<string, string> = {
  banking: "bank",
  accounting: "money",
  taxes: "legal",
  legal: "legal",
  business: "group",
  insurance: "shield",
  real_estate: "group",
  vehicles: "fleet",
  identity: "user",
  other: "doc",
};

/** NSVX `stateOf`: processed documents show their review state; others show the pipeline state. */
export function docState(d: Pick<Doc, "status" | "review_status">): { key: string; tone: Tone } {
  if (d.status === "processed") {
    const tone: Record<ReviewStatus, Tone> = {
      pending: "run",
      auto: "ok",
      provisional: "",
      needs_review: "warn",
      confirmed: "ok",
    };
    return { key: `review_${d.review_status}`, tone: tone[d.review_status] ?? "run" };
  }
  const tone: Record<string, Tone> = {
    queued: "run",
    processing: "run",
    failed: "bad",
    needs_ocr: "warn",
  };
  return { key: `status_${d.status}`, tone: tone[d.status] ?? "" };
}

export const driveLive = (drive: DriveStatus | undefined) =>
  !!drive && drive.connected && drive.state === "ready";

/** The period a user recognises: a whole month, a date range, or the document date. */
export function periodOf(
  d: Pick<Doc, "period_start" | "period_end" | "document_date">,
  locale: string,
): string {
  const day = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
  if (d.period_start && d.period_end) {
    const start = d.period_start;
    const end = d.period_end;
    const last = new Date(Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)), 0)).getUTCDate();
    if (start.slice(0, 7) === end.slice(0, 7) && start.endsWith("-01") && Number(end.slice(8, 10)) === last) {
      return new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${start}T12:00:00Z`));
    }
    return `${day(start)} – ${day(end)}`;
  }
  return d.document_date ? day(d.document_date) : "";
}

export function sizeOf(bytes: number | null): string {
  if (!bytes) {
    return "";
  }
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** NSVX Signatures STATE tones; `awaiting_external` over the desktop app is "in progress". */
export function signTone(state: string | null | undefined): Tone {
  switch (state) {
    case "signed_validated":
      return "ok";
    case "failed":
      return "bad";
    case "signed_inconclusive":
      return "warn";
    case "processing":
    case "awaiting_external":
      return "run";
    default:
      return "";
  }
}

/** A new request is allowed with none yet, or after one that failed or was cancelled before any signed PDF. */
export function canRequest(latest: SignRequest | undefined): boolean {
  return !latest || (["failed", "cancelled"].includes(latest.state) && !latest.signed_sha256);
}

export const DESKTOP_DONE = ["processing", "failed", "cancelled", "signed_inconclusive", "signed_validated"];
