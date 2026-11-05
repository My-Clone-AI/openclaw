/** Marketing owner write routes (kept out of client.ts for the line-cap ratchet). */
export const marketingWrites = {
  // Marketing: NSVX refuses all but the gates outside development; publishing stays behind its global dry run.
  marketingGate: { method: "POST", path: "/api/group-companies/marketing/gate" },
  marketingActivation: { method: "POST", path: "/api/group-companies/marketing/activations/{id}" },
  marketingGenerate: { method: "POST", path: "/api/group-companies/marketing/generate" },
  marketingPreview: { method: "POST", path: "/api/group-companies/marketing/preview" },
  marketingSchedule: { method: "POST", path: "/api/group-companies/marketing/schedule" },
  marketingPublish: { method: "POST", path: "/api/group-companies/marketing/publish" },
  marketingRetry: { method: "POST", path: "/api/group-companies/marketing/retry" },
  marketingPause: { method: "POST", path: "/api/group-companies/marketing/pause" },
  marketingCancel: { method: "POST", path: "/api/group-companies/marketing/jobs/{id}/cancel" },
} as const;
