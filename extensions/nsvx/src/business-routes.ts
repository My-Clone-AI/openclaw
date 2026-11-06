/**
 * Business tab NSVX HTTP routes (`business/`, `orders/`, `commerce/amazon*.py`, `utilities/`, `warranties/api.py`,
 * and the grants in `group_companies/api.py`); kept out of client.ts for the line cap. Provider routes share one
 * shape, `/api/{area}/{provider}/...`; business.ts allows only the provider and step pairs NSVX serves.
 */

const READINGS = "/api/utilities/meter-readings";
const GRANTS = "/api/group-companies/business-action-grants";

/** Reads: each provider's status and sign-in page, the quarter workflow, readings, warranty claims, and grants. */
export const businessViews = {
  bizProvider: { path: "/api/{area}/{provider}" },
  // The provider's sign-in page as NSVX's browser sees it (a screenshot in `image`).
  bizProviderView: { path: "/api/{area}/{provider}/view" },
  amazonReturns: { path: "/api/orders/amazon-es/returns" },
  bizWorkflow: { path: "/api/business/workflow/{id}" },
  readings: { path: READINGS },
  reading: { path: `${READINGS}/{id}` },
  readingImage: { path: `${READINGS}/{id}/image`, image: true },
  warranties: { path: "/api/warranties" },
  warranty: { path: "/api/warranties/{id}" },
  purchases: { path: "/api/warranties/purchases", query: ["q"] },
  grants: { path: GRANTS },
  grantNotice: { path: `${GRANTS}/expiry-notice` },
  grantsExpiring: { path: `${GRANTS}/expiring` },
  grantDenials: { path: `${GRANTS}/{id}/denials` },
} as const;

/** Writes: the owner's taps on those screens (business.ts validates each body). */
export const businessWrites = {
  // Sign-in, a sign-in step, refreshing accounts, or a quarter's collection into Drive. Collections reach supplier
  // portals; NSVX refuses a second one while one runs.
  bizStep: { method: "POST", path: "/api/{area}/{provider}/{op}" },
  bizWorkflowStart: { method: "POST", path: "/api/business/workflow/quarter" },
  bizWorkflowResume: { method: "POST", path: "/api/business/workflow/{id}/recover" },
  readingUpload: { method: "POST", path: READINGS, multipart: true },
  readingVoice: { method: "POST", path: `${READINGS}/{id}/voice`, multipart: true },
  readingEdit: { method: "PATCH", path: `${READINGS}/{id}` },
  // `confirm` carries NSVX's binding for the exact values shown; only that sends the reading to the supplier.
  readingStep: { method: "POST", path: `${READINGS}/{id}/{op}` },
  // Warranty claims only ever build a draft packet; NSVX has no send route.
  warrantyCreate: { method: "POST", path: "/api/warranties" },
  warrantyEdit: { method: "PATCH", path: "/api/warranties/{id}" },
  warrantyUpload: { method: "POST", path: "/api/warranties/{id}/upload", multipart: true },
  warrantyStep: { method: "POST", path: "/api/warranties/{id}/{op}" },
  grantNotice: { method: "PUT", path: `${GRANTS}/expiry-notice` },
  grantRevoke: { method: "POST", path: `${GRANTS}/{id}/revoke` },
} as const;

/** POST reads: NSVX explains one grant and its refusals with its own inference; nothing changes. */
export const businessReadPosts = {
  grantExplain: `${GRANTS}/{id}/explanation`,
} as const;

/** Files: the confirmed warranty packet and the grants history. */
export const businessFiles = {
  warrantyExport: { path: "/api/warranties/{id}/export/{packet}" },
  grantsExport: { path: `${GRANTS}/export`, query: ["grant_id", "from", "to", "format"] },
} as const;
