import type { NsvxAction, NsvxApproval, NsvxRunResult, NsvxTask } from "./types.js";

export const AGENTOS_PATH = "/api/agentos/v1";
const TIMEOUT_MS = 30_000;

/**
 * - `unconfigured`: this Gateway has no token.
 * - `signed-out`: NSVX rejected the token.
 * - `off`: NSVX hides AgentOS while its `agentos.gateway` flag is off.
 * - `uncertain`: a write may have happened; never repeat it with a new key.
 */
export type NsvxErrorKind =
  | "unconfigured"
  | "signed-out"
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

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

async function guardedFetch(url: string, init: RequestInit): Promise<Response> {
  const [{ fetchWithSsrFGuard }, { responseWithRelease }] = await Promise.all([
    import("openclaw/plugin-sdk/ssrf-runtime"),
    import("openclaw/plugin-sdk/fetch-runtime"),
  ]);
  const { hostname } = new URL(url);
  const guarded = await fetchWithSsrFGuard({
    url,
    init,
    capture: false,
    // parseNsvxConfig already limited the origin, so a dev server on loopback stays reachable.
    policy: { hostnameAllowlist: [hostname], allowPrivateNetwork: true },
    maxRedirects: 0,
  });
  return responseWithRelease(guarded.response, guarded.release);
}

type Problem = { code?: string; title?: string; detail?: string; correlation_id?: string };

async function problemFrom(response: Response): Promise<Problem> {
  try {
    return (await response.json()) as Problem;
  } catch {
    return {};
  }
}

function errorFor(status: number, problem: Problem, isWrite: boolean, path: string): NsvxError {
  const message = problem.detail ?? problem.title ?? `NSVX answered ${status}.`;
  const correlation = problem.correlation_id;
  if (status === 401) {
    return new NsvxError("signed-out", "NSVX rejected the sign-in token.", correlation);
  }
  if (status === 404) {
    // Only the catalog route proves the whole surface is hidden.
    return path.startsWith("/actions?")
      ? new NsvxError("off", "NSVX actions are switched off.", correlation)
      : new NsvxError("not-found", message, correlation);
  }
  if (status === 403) {
    return new NsvxError("denied", message, correlation);
  }
  if (status === 409) {
    return new NsvxError("conflict", message, correlation);
  }
  if (status === 400 || status === 422) {
    return new NsvxError("invalid", message, correlation);
  }
  return isWrite && status >= 500
    ? new NsvxError(
        "uncertain",
        "NSVX did not confirm the result. Check before repeating.",
        correlation,
      )
    : new NsvxError("failed", message, correlation);
}

export type NsvxRunRequest = {
  actionId: string;
  input: Record<string, unknown>;
  /** Stable across retries of one user intent; NSVX replays instead of repeating the effect. */
  idempotencyKey: string;
  approvalId?: string;
};

export type NsvxClient = ReturnType<typeof createNsvxClient>;

export function createNsvxClient(options: {
  baseUrl: string;
  token: string | undefined;
  fetchImpl?: Fetch;
}) {
  const fetchImpl = options.fetchImpl ?? guardedFetch;

  async function call<T>(
    path: string,
    init: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string } = {},
  ): Promise<T> {
    if (!options.token) {
      throw new NsvxError("unconfigured", "NSVX sign-in is not set up on this Gateway.");
    }
    const isWrite = init.method === "POST";
    let response: Response;
    try {
      response = await fetchImpl(`${options.baseUrl}${AGENTOS_PATH}${path}`, {
        method: init.method ?? "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${options.token}`,
          ...(isWrite ? { "Content-Type": "application/json" } : {}),
          ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
        },
        ...(isWrite ? { body: JSON.stringify(init.body ?? {}) } : {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // A write that lost its connection may still have reached NSVX.
      throw isWrite
        ? new NsvxError("uncertain", "NSVX did not confirm the result. Check before repeating.")
        : new NsvxError("offline", "NSVX cannot be reached.");
    }
    if (!response.ok) {
      throw errorFor(response.status, await problemFrom(response), isWrite, path);
    }
    return (await response.json()) as T;
  }

  return {
    baseUrl: options.baseUrl,
    async listActions(): Promise<NsvxAction[]> {
      return (await call<{ actions: NsvxAction[] }>("/actions?limit=500")).actions;
    },
    getAction(actionId: string): Promise<NsvxAction & { contract: Record<string, unknown> }> {
      return call(`/actions/${encodeURIComponent(actionId)}`);
    },
    runAction(request: NsvxRunRequest): Promise<NsvxRunResult> {
      return call(`/actions/${encodeURIComponent(request.actionId)}/execute`, {
        method: "POST",
        idempotencyKey: request.idempotencyKey,
        body: {
          input: request.input,
          ...(request.approvalId ? { approval_id: request.approvalId } : {}),
        },
      });
    },
    async listTasks(): Promise<NsvxTask[]> {
      return (await call<{ tasks: NsvxTask[] }>("/tasks?limit=100")).tasks;
    },
    async listApprovals(): Promise<NsvxApproval[]> {
      return (await call<{ approvals: NsvxApproval[] }>("/approvals")).approvals;
    },
    decideApproval(approvalId: string, decision: "approve" | "deny"): Promise<NsvxApproval> {
      return call(`/approvals/${encodeURIComponent(approvalId)}/${decision}`, { method: "POST" });
    },
  };
}
