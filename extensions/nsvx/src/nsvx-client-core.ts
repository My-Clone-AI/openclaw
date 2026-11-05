/** Shared AgentOS client constants and errors (kept out of client.ts for the line-cap ratchet). */
export const AGENTOS_PATH = "/api/agentos/v1";
const TIMEOUT_MS = 30_000;
export { TIMEOUT_MS };

/**
 * - `unconfigured`: this Gateway has no token.
 * - `signed-out`: NSVX rejected the token.
 * - `token-pending`: this Gateway has a token, but NSVX has no AgentOS action for this owner screen yet.
 * - `off`: NSVX hides AgentOS while its `agentos.gateway` flag is off.
 * - `uncertain`: a write may have happened; never repeat it with a new key.
 */
export type NsvxErrorKind =
  | "unconfigured"
  | "signed-out"
  | "token-pending"
  | "off"
  | "offline"
  | "denied"
  | "not-found"
  | "invalid"
  | "conflict"
  | "uncertain"
  | "failed";

export class NsvxError extends Error {
  constructor(
    readonly kind: NsvxErrorKind,
    message: string,
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = "NsvxError";
  }
}
