/**
 * Docs tab NSVX HTTP routes (`documents/api.py`, `signatures/api.py`, `api.py` Drive search); kept out of client.ts
 * for the line cap. NSVX's screens: Documentos (`/documentos`) and Assinaturas (`/documentos/assinaturas`).
 */

/** Reads: the archive, one document, its page images, settings, Drive, and the signature desk. */
export const docViews = {
  archiveOverview: { path: "/api/documents/overview" },
  archive: {
    path: "/api/documents",
    query: ["q", "category", "source", "review", "date_from", "date_to", "sort", "limit"],
  },
  archiveDoc: { path: "/api/documents/{id}" },
  archiveTaxonomy: { path: "/api/documents/taxonomy" },
  // NSVX renders PDF pages and images as JPEG, so the browser never opens the original.
  archivePage: { path: "/api/documents/{id}/page/{n}", query: ["width"], image: true },
  archiveSettings: { path: "/api/documents/settings/current" },
  archiveDrive: { path: "/api/documents/drive/status" },
  archiveRules: { path: "/api/documents/rules/all" },
  // Names and folders NSVX already indexed from Google Drive; never asks Google.
  driveFiles: { path: "/api/drive/files", query: ["q"] },
  signatures: {
    path: "/api/signatures",
    query: ["q", "state", "mode", "company_id", "date_from", "date_to", "offset"],
  },
  signature: { path: "/api/signatures/documents/{id}" },
  // NSVX records each page it serves here as reviewed: a request needs every page seen first.
  signaturePage: { path: "/api/signatures/documents/{id}/pages/{page}", image: true },
  signatureSource: { path: "/api/signatures/sources/{id}" },
  signatureCompanies: { path: "/api/signatures/companies" },
  signatureConfig: { path: "/api/signatures/configuration" },
  signatureProfile: { path: "/api/signatures/desktop/profile" },
  signatureDesktop: { path: "/api/signatures/requests/{id}/desktop" },
} as const;

/** Writes: the owner's taps on the two NSVX screens (docs.ts validates each body). */
export const docWrites = {
  docUpload: { method: "POST", path: "/api/documents/upload", multipart: true },
  docChange: { method: "PATCH", path: "/api/documents/{id}" },
  docApprove: { method: "POST", path: "/api/documents/{id}/approve" },
  docRename: { method: "POST", path: "/api/documents/{id}/rename" },
  docReprocess: { method: "POST", path: "/api/documents/{id}/reprocess" },
  // Deletes clone's copy only; a Drive original stays in Drive.
  docForget: { method: "DELETE", path: "/api/documents/{id}", query: ["confirm"] },
  docsSettings: { method: "PUT", path: "/api/documents/settings/current" },
  docsCategoryAdd: { method: "POST", path: "/api/documents/categories" },
  docsCategoryEdit: { method: "PATCH", path: "/api/documents/categories/{code}" },
  docsRuleOff: { method: "DELETE", path: "/api/documents/rules/{id}" },
  docsNoticesRead: { method: "POST", path: "/api/documents/notices/read" },
  driveResync: { method: "POST", path: "/api/documents/drive/resync" },
  signUpload: { method: "POST", path: "/api/signatures/documents", multipart: true },
  signCapture: { method: "POST", path: "/api/signatures/batches/capture", multipart: true },
  signFromDoc: { method: "POST", path: "/api/signatures/documents/from-catalogue/{id}" },
  // NSVX keys a request by the body's `idempotency_key`, so a repeated tap returns the same request.
  signRequest: { method: "POST", path: "/api/signatures/documents/{id}/requests" },
  signImport: { method: "POST", path: "/api/signatures/requests/{id}/signed", multipart: true },
  signCancel: { method: "POST", path: "/api/signatures/requests/{id}/cancel" },
  signCompany: { method: "POST", path: "/api/signatures/companies" },
  signDesktop: { method: "POST", path: "/api/signatures/requests/{id}/desktop" },
  signOtp: { method: "POST", path: "/api/signatures/requests/{id}/desktop/otp" },
  signProfile: { method: "POST", path: "/api/signatures/desktop/profile" },
  signProfileForget: { method: "DELETE", path: "/api/signatures/desktop/profile" },
} as const;

/** POST reads: NSVX answers with its own inference from stored text; nothing is saved. */
export const docReadPosts = {
  docTriage: "/api/documents/{id}/triage-suggestion",
  docExplain: "/api/documents/{id}/explanation",
  docWhy: "/api/documents/{id}/classification-explanation",
} as const;

/** Files Control saves for the owner; NSVX logs each download on the document. */
export const docFiles = {
  docContent: { path: "/api/documents/{id}/content", query: ["download"] },
  docsExport: { path: "/api/documents/export/metadata" },
  signOriginal: { path: "/api/signatures/documents/{id}/original" },
  signReviewed: { path: "/api/signatures/documents/{id}/reviewed" },
  signSigned: { path: "/api/signatures/requests/{id}/signed" },
} as const;
