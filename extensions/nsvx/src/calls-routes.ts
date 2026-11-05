/** Calls tab NSVX HTTP routes (`voice_api.py`, `phone_lookup/api.py`); kept out of client.ts for the line cap. */

/** Reads: switches and spend, history, one call's timeline, recordings, app calls, and phone cards. */
export const callViews = {
  // Calls (`/apps/voz`): telephone and app voice status, live calls, and the call history NSVX keeps.
  callsStatus: { path: "/api/calls/status" },
  calls: { path: "/api/calls", query: ["channel", "transport", "q", "person_id", "limit"] },
  // `rev` is NSVX's revision cursor: 0 reads every turn, later reads only turns changed since.
  call: { path: "/api/voice/live/{id}", query: ["rev"] },
  callContext: { path: "/api/calls/{id}/context-access" },
  callRecordings: { path: "/api/calls/{id}/recordings" },
  callsSocial: { path: "/api/calls/social" },
  // Who called (`/pessoas/quem-ligou`): saved phone cards, newest first.
  phoneCards: { path: "/api/phone-lookup", query: ["limit"] },
} as const;

/** Writes: the owner's taps on the NSVX Voz and Quem ligou screens (calls.ts validates each body). */
export const callWrites = {
  callsSettings: { method: "POST", path: "/api/calls/settings" },
  callsPin: { method: "POST", path: "/api/calls/pin" },
  // Places a real phone call; NSVX keys it by `key`, so a repeated tap returns the same call.
  callOut: { method: "POST", path: "/api/calls/outgoing" },
  callHangup: { method: "POST", path: "/api/calls/{id}/hangup" },
  callMute: { method: "POST", path: "/api/calls/{id}/mute" },
  callTakeover: { method: "POST", path: "/api/calls/{id}/takeover" },
  callContextGrant: { method: "POST", path: "/api/calls/{id}/context-access" },
  callForget: { method: "POST", path: "/api/calls/{id}/forget" },
  callRecordingDelete: { method: "DELETE", path: "/api/calls/recordings/{id}" },
  callsSocialSettings: { method: "POST", path: "/api/calls/social/settings" },
  // A lookup saves a card; `paid` asks the carrier, at the cost NSVX shows first.
  phoneLookup: { method: "POST", path: "/api/phone-lookup" },
  phoneOverride: { method: "POST", path: "/api/phone-lookup/{id}/override" },
  phoneContact: { method: "POST", path: "/api/phone-lookup/{id}/contact" },
  phoneErase: { method: "DELETE", path: "/api/phone-lookup/{id}" },
} as const;

/** POST reads: NSVX summarizes with its own inference and starts nothing. */
export const callReadPosts = {
  callBriefing: "/api/calls/briefing-preview",
  callSummary: "/api/calls/{id}/summary",
} as const;

/** One recording's audio; NSVX audits each play. */
export const callFiles = {
  callRecording: { path: "/api/calls/recordings/{id}" },
} as const;
