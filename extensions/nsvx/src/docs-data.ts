/** NSVX Documentos and Assinaturas shapes (`web/src/logic/documents.ts`, `Signatures.tsx`) and pure helpers. */
import type { OfficeTone } from "./office-kit.js";

type ReviewStatus = "pending" | "auto" | "provisional" | "needs_review" | "confirmed";

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
  drive_path?: string | null;
};

export type DocDetail = Doc & {
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
  filing?: { state: string; receipt: { verified: boolean; path: string } | null } | null;
};

export type Category = {
  code: string;
  parent: string | null;
  label: string;
  label_en: string;
  template: string;
  active: boolean;
};

export type DocList = { total: number; items: Doc[] };
export type Notice = { id: number; kind: string; title: string; body: string; url: string };

type DriveStatus = {
  connected: boolean;
  state: string;
  push: { active: boolean };
  last_delta_at: string | null;
  last_processed_at: string | null;
  rename_available?: boolean;
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

export type DriveDetail = DriveStatus & { folders: Folder[]; documents: number };
export type Rule = {
  id: string;
  pattern: string;
  subcategory: string | null;
  hits: number;
  active: boolean;
};
export type DriveFile = {
  file_id: string;
  name: string;
  path: string | null;
  mime_type: string | null;
  modified_time: string | null;
};

type SignState =
  | "ready_review"
  | "awaiting_external"
  | "processing"
  | "signed_validated"
  | "signed_inconclusive"
  | "failed"
  | "cancelled";

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
  reviewed_pages: number[];
  signature_placement?: { page: number; width: number; height: number; rect: number[] } | null;
};

export type SignRequest = {
  id: string;
  mode: string;
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
      trusted_signed_at: string | null;
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

export const SIGN_STATES: readonly SignState[] = [
  "ready_review",
  "awaiting_external",
  "processing",
  "signed_validated",
  "signed_inconclusive",
  "failed",
  "cancelled",
];
export const SIGN_MODES = ["personal", "eni", "company"] as const;
export type SignMode = (typeof SIGN_MODES)[number];

/** Desktop signing steps NSVX reports while the official app runs. */
export const DESKTOP_STEPS = [
  "starting",
  "preparing",
  "credentials",
  "requesting_otp",
  "awaiting_otp",
  "signing",
  "processing",
] as const;

export const SORTS = ["recent", "date", "name", "confidence"] as const;
export const SOURCES = ["drive", "upload", "bank"] as const;

/** NSVX's own document state rule (`stateOf`): processing states first, then the review state. */
export function docState(doc: Pick<Doc, "status" | "review_status">): {
  key: string;
  tone: OfficeTone;
} {
  if (doc.status === "processed") {
    const tone: Record<ReviewStatus, OfficeTone> = {
      pending: "run",
      auto: "ok",
      provisional: "warn",
      needs_review: "warn",
      confirmed: "ok",
    };
    return { key: doc.review_status, tone: tone[doc.review_status] ?? "run" };
  }
  const tone: Record<string, OfficeTone> = {
    queued: "run",
    processing: "run",
    failed: "bad",
    needs_ocr: "warn",
  };
  return { key: doc.status, tone: tone[doc.status] ?? "off" };
}

export function signTone(state: string): OfficeTone {
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
      return "off";
  }
}

/** A new request is possible with none yet, or after a failed or cancelled one that never received a signed PDF. */
export function canRequest(latest: SignRequest | undefined): boolean {
  return !latest || (["failed", "cancelled"].includes(latest.state) && !latest.signed_sha256);
}

const CATEGORY_ICON = {
  banking: "bank",
  accounting: "euro",
  taxes: "group",
  legal: "legal",
  business: "progress",
  insurance: "shield",
  real_estate: "homes",
  vehicles: "fleet",
  identity: "user",
} as const;

export function categoryIcon(category: string | null | undefined) {
  return CATEGORY_ICON[(category ?? "") as keyof typeof CATEGORY_ICON] ?? "doc";
}

/** A whole month reads as the month; other ranges as two dates; else the document date. */
export function periodWord(
  doc: Pick<Doc, "period_start" | "period_end" | "document_date">,
  locale: string,
): string {
  const at = (day: string) => new Date(`${day}T12:00:00`);
  const start = doc.period_start;
  const end = doc.period_end;
  if (start && end) {
    const last = at(end);
    const lastDay = new Date(last.getFullYear(), last.getMonth() + 1, 0).getDate();
    if (
      start.slice(0, 7) === end.slice(0, 7) &&
      start.endsWith("-01") &&
      last.getDate() === lastDay
    ) {
      return at(start).toLocaleDateString(locale, { month: "long", year: "numeric" });
    }
    return `${at(start).toLocaleDateString(locale)} – ${last.toLocaleDateString(locale)}`;
  }
  return doc.document_date ? at(doc.document_date).toLocaleDateString(locale) : "";
}

export const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : `${Math.round(value * 100)}%`;

/** Upload types NSVX accepts on `/api/documents/upload` (`ACCEPT` in `logic/documents.ts`). */
export const DOC_ACCEPT = ".pdf,.jpg,.jpeg,.png,.txt,.csv,.docx,.xlsx";

/** Categories in their groups, active only, for the category picker. */
export function categoryGroups(categories: readonly Category[]) {
  return categories
    .filter((category) => !category.parent && category.active)
    .map((top) => ({
      top,
      subs: categories.filter((category) => category.parent === top.code && category.active),
    }));
}

/** A category's label in the viewer's language, from NSVX's Portuguese and English labels. */
export function categoryLabel(category: Category, locale: string) {
  return locale.toLowerCase().startsWith("pt")
    ? category.label
    : category.label_en || category.label;
}

/** Placement of NSVX's visible signature box on its page, as percentages of the page image. */
export function placementBox(placement: {
  width: number;
  height: number;
  rect: number[];
}): { left: number; top: number; width: number; height: number } | undefined {
  const [x0, y0, x1, y1] = placement.rect;
  if (
    x0 === undefined ||
    y0 === undefined ||
    x1 === undefined ||
    y1 === undefined ||
    !placement.width ||
    !placement.height
  ) {
    return undefined;
  }
  return {
    left: (x0 / placement.width) * 100,
    top: ((placement.height - y1) / placement.height) * 100,
    width: ((x1 - x0) / placement.width) * 100,
    height: ((y1 - y0) / placement.height) * 100,
  };
}
