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

/** AgentOS sends problem+json; other NSVX routes send FastAPI `detail`, sometimes as an object. */
type Problem = { code?: string; title?: string; detail?: unknown; correlation_id?: string };

async function problemFrom(response: Response): Promise<Problem> {
  try {
    return (await response.json()) as Problem;
  } catch {
    return {};
  }
}

function errorFor(status: number, problem: Problem, isWrite: boolean, path: string): NsvxError {
  const message =
    (typeof problem.detail === "string" ? problem.detail : problem.title) ??
    `NSVX answered ${status}.`;
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

/**
 * Owner screens NSVX serves only to its signed-in owner. Read-only GETs on fixed paths, so the held session can never
 * change NSVX data (unsafe methods also need the session's CSRF token, which this Gateway never has).
 */
type OwnerViewSpec = { path: string; query?: readonly string[]; image?: true };
/** Largest page image relayed to the browser (a 1000px JPEG page is far below this). */
const IMAGE_LIMIT = 4 * 1024 * 1024;

const OWNER_VIEWS = {
  today: { path: "/api/today" },
  missions: { path: "/api/missions" },
  missionEvents: { path: "/api/missions/{id}/events", query: ["before"] },
  workSummary: { path: "/api/tarefas-ao-vivo/summary" },
  workTasks: { path: "/api/tarefas-ao-vivo/tasks", query: ["state", "q", "cursor"] },
  activity: { path: "/api/auto/activity", query: ["limit", "before"] },
  activityWorkflows: { path: "/api/auto/activity/workflows" },
  activityCount: { path: "/api/auto/activity/export/count", query: ["start", "end", "ids"] },
  conversations: {
    path: "/api/conversations/page",
    query: ["q", "state", "channel", "after", "limit"],
  },
  conversation: { path: "/api/conversations/{id}", query: ["message_limit", "message_before"] },
  coverage: { path: "/api/reply-coverage/summary", query: ["channel"] },
  channels: { path: "/api/social/status" },
  quickReplyDrafts: { path: "/api/quick-reply/drafts", query: ["q", "before"] },
  quickReplyDraft: { path: "/api/quick-reply/drafts/{id}" },
  quickReplyRules: { path: "/api/quick-reply/rules" },
  // Finance (`/financas`): the same reads the NSVX Finanças, Documentos, and Contabilidade screens make.
  financeToday: { path: "/api/finance/today" },
  financeDashboard: { path: "/api/finance/dashboard", query: ["entity", "scope", "year"] },
  financeAccounts: { path: "/api/finance/accounts", query: ["entity", "scope"] },
  financeConnections: { path: "/api/finance/connections" },
  financeCards: { path: "/api/finance/cards" },
  financeObligations: {
    path: "/api/finance/obligations",
    query: ["entity", "scope", "include_done"],
  },
  financeAlerts: { path: "/api/finance/alerts" },
  financeInvoices: {
    path: "/api/finance/invoices",
    query: ["entity", "scope", "role", "year", "unassigned", "q", "before", "limit"],
  },
  bankTransactions: {
    path: "/api/finance/banking/transactions",
    query: ["entity", "scope", "connection", "counterparty", "status", "cursor", "limit"],
  },
  bankCapabilities: { path: "/api/finance/banking/capabilities", query: ["entity"] },
  bankTasks: { path: "/api/finance/banking/tasks", query: ["entity", "scope"] },
  docsOverview: { path: "/api/finance/docs/overview", query: ["entity", "scope", "year"] },
  docsBrowse: {
    path: "/api/finance/docs/browse",
    query: ["entity", "scope", "path", "month", "kind", "state", "source", "q", "offset", "limit"],
  },
  docsSearch: { path: "/api/finance/docs/search", query: ["q", "entity", "scope"] },
  docPreview: { path: "/api/finance/docs/{id}/preview" },
  docPage: { path: "/api/finance/docs/{id}/page/{page}", query: ["w"], image: true },
  docImage: { path: "/api/finance/docs/{id}/content", image: true },
  ledgerBooks: { path: "/api/ledger/books" },
  ledgerOverview: { path: "/api/ledger/overview", query: ["book", "year"] },
  ledgerReport: { path: "/api/ledger/reports/{kind}", query: ["book", "year"] },
  ledgerJournal: {
    path: "/api/ledger/journal",
    query: ["book", "year", "account", "q", "limit", "offset"],
  },
  ledgerReview: {
    path: "/api/ledger/transactions",
    query: ["book", "year", "status", "limit", "offset"],
  },
  ledgerTax: { path: "/api/ledger/tax", query: ["book", "year"] },
} as const satisfies Record<string, OwnerViewSpec>;

type OwnerView = keyof typeof OWNER_VIEWS;

export const OWNER_VIEW_NAMES = Object.keys(OWNER_VIEWS) as OwnerView[];

const OWNER_WRITES = {
  reply: { method: "POST", path: "/api/conversations/{id}/reply" },
  takeover: { method: "POST", path: "/api/conversations/{id}/takeover" },
  autoReply: { method: "POST", path: "/api/conversations/{id}/pause" },
  approve: { method: "POST", path: "/api/outbox/{id}/approve" },
  reject: { method: "POST", path: "/api/outbox/{id}/reject" },
  quickReplyCreate: { method: "POST", path: "/api/quick-reply/drafts" },
  quickReplyGenerate: { method: "POST", path: "/api/quick-reply/drafts/{id}/generate" },
  quickReplyDelete: { method: "DELETE", path: "/api/quick-reply/drafts/{id}" },
} as const satisfies Record<string, { method: "POST" | "DELETE"; path: string }>;

export type OwnerWrite = keyof typeof OWNER_WRITES;


/**
 * NSVX reads that take their input in a POST body (so search text never reaches URLs or access logs). POST needs the
 * session's CSRF token, which the Gateway fetches per call for these fixed paths only: no other POST is reachable, so
 * the owner session still cannot change NSVX data.
 */
const OWNER_READ_POSTS = {
  find: "/api/find",
  activitySummary: "/api/auto/activity/summary",
} as const;

export type OwnerReadPost = keyof typeof OWNER_READ_POSTS;

/** The CSV export streams; larger ranges than this must be split by the owner. */
const EXPORT_MAX_CHARS = 5_000_000;

const OWNER_COOKIE = "clone_session";

function ownerViewSpec(view: string): OwnerViewSpec {
  if (!Object.hasOwn(OWNER_VIEWS, view)) {
    throw new NsvxError("invalid", "Unknown NSVX view.");
  }
  return OWNER_VIEWS[view as OwnerView];
}

function ownerViewPath(view: string, params: Record<string, unknown>): string {
  const spec = ownerViewSpec(view);
  const text = (name: string) => {
    const value = params[name];
    if (value === undefined || value === "") {
      return undefined;
    }
    if (typeof value !== "string" || value.length > 200) {
      throw new NsvxError("invalid", `${name} must be short text.`);
    }
    return value;
  };
  const path = spec.path.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = text(name);
    if (!value) {
      throw new NsvxError("invalid", `${name} is required.`);
    }
    return encodeURIComponent(value);
  });
  const query = new URLSearchParams();
  for (const name of spec.query ?? []) {
    const value = text(name);
    if (value) {
      query.set(name, value);
    }
  }
  return query.size > 0 ? `${path}?${query}` : path;
}

export type NsvxClient = ReturnType<typeof createNsvxClient>;

export function createNsvxClient(options: {
  baseUrl: string;
  token: string | undefined;
  /** The owner's own NSVX session, for owner screens only; never reaches chat tools. */
  ownerSession?: string | undefined;
  fetchImpl?: Fetch;
}) {
  const fetchImpl = options.fetchImpl ?? guardedFetch;

  async function ownerFetch(
    path: string,
    init: { body?: unknown; csrf?: string; accept?: string } = {},
  ): Promise<Response> {
    if (!options.ownerSession) {
      throw new NsvxError("unconfigured", "NSVX owner sign-in is not set up on this Gateway.");
    }
    let response: Response;
    try {
      response = await fetchImpl(`${options.baseUrl}${path}`, {
        method: init.csrf ? "POST" : "GET",
        headers: {
          Accept: init.accept ?? "application/json",
          Cookie: `${OWNER_COOKIE}=${options.ownerSession}`,
          ...(init.csrf ? { "Content-Type": "application/json", "X-CSRF-Token": init.csrf } : {}),
        },
        ...(init.csrf ? { body: JSON.stringify(init.body ?? {}) } : {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // Only reads reach here, so a lost connection never leaves an uncertain effect.
      throw new NsvxError("offline", "NSVX cannot be reached.");
    }
    if (!response.ok) {
      throw errorFor(response.status, await problemFrom(response), false, path);
    }
    return response;
  }

  async function readOwner<T>(path: string): Promise<T> {
    return (await (await ownerFetch(path)).json()) as T;
  }

  async function postOwnerRead<T>(path: string, body: unknown): Promise<T> {
    const state = await readOwner<{ authenticated?: boolean; csrf?: string | null }>(
      "/api/auth/state",
    );
    if (!state.authenticated || !state.csrf) {
      throw new NsvxError("signed-out", "NSVX rejected the owner sign-in.");
    }
    return (await (await ownerFetch(path, { body, csrf: state.csrf })).json()) as T;
  }

  /**
   * Fetches the session's CSRF token from NSVX's own sign-in state route for each change, so a rotated or revoked
   * session fails here instead of being cached. Changes are rare owner taps; the extra read is cheap.
   */
  async function writeOwner<T>(
    action: OwnerWrite,
    id: string | undefined,
    body: unknown,
  ): Promise<T> {
    const spec = OWNER_WRITES[action];
    let path: string = spec.path;
    if (path.includes("{id}")) {
      if (!id || id.length > 200) {
        throw new NsvxError("invalid", "id is required.");
      }
      path = path.replace("{id}", encodeURIComponent(id));
    }
    const state = await readOwner<{ authenticated?: boolean; csrf?: string | null }>(
      "/api/auth/state",
    );
    if (!state.authenticated || !state.csrf) {
      throw new NsvxError("signed-out", "NSVX ended the owner session.");
    }
    let response: Response;
    try {
      response = await fetchImpl(`${options.baseUrl}${path}`, {
        method: spec.method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Cookie: `${OWNER_COOKIE}=${options.ownerSession}`,
          "X-CSRF-Token": state.csrf,
        },
        body: JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new NsvxError("uncertain", "NSVX did not confirm the result. Check before repeating.");
    }
    if (!response.ok) {
      throw errorFor(response.status, await problemFrom(response), true, path);
    }
    return (await response.json()) as T;
  }

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
    async readOwnerView<T = unknown>(
      view: string,
      params: Record<string, unknown> = {},
    ): Promise<T> {
      const spec = ownerViewSpec(view);
      const path = ownerViewPath(view, params);
      if (!spec.image) {
        return readOwner(path);
      }
      // Page images cross the Gateway socket as data URLs, so the browser never needs the NSVX session.
      const response = await ownerFetch(path, { accept: "image/*" });
      const mime = response.headers.get("content-type")?.split(";")[0] ?? "";
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!mime.startsWith("image/") || bytes.byteLength > IMAGE_LIMIT) {
        throw new NsvxError("invalid", "NSVX did not send a page image.");
      }
      return { src: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` } as T;
    },
    /** Owner reads sent as POST: `find` (unified search) and `activitySummary`. */
    async readOwnerPost<T = unknown>(
      name: OwnerReadPost,
      body: Record<string, unknown>,
    ): Promise<T> {
      if (!Object.hasOwn(OWNER_READ_POSTS, name)) {
        throw new NsvxError("invalid", "Unknown NSVX view.");
      }
      return postOwnerRead(OWNER_READ_POSTS[name], body);
    },
    /** The AUTO activity CSV for UTC days `start`..`end`, optionally only some entry ids, as NSVX builds it. */
    async exportActivity(range: { start: string; end: string; ids?: string }): Promise<string> {
      const query = new URLSearchParams({ start: range.start, end: range.end });
      if (range.ids) {
        query.set("ids", range.ids);
      }
      const csv = await (
        await ownerFetch(`/api/auto/activity/export?${query}`, { accept: "text/csv" })
      ).text();
      if (csv.length > EXPORT_MAX_CHARS) {
        throw new NsvxError("invalid", "Too much activity for one file. Pick fewer days.");
      }
      return csv;
    },
    /** One owner change on a fixed NSVX route; `body` must already be validated by the caller. */
    writeOwner<T = unknown>(action: OwnerWrite, id: string | undefined, body: unknown): Promise<T> {
      return writeOwner(action, id, body);
    },
    decideApproval(approvalId: string, decision: "approve" | "deny"): Promise<NsvxApproval> {
      return call(`/approvals/${encodeURIComponent(approvalId)}/${decision}`, { method: "POST" });
    },
  };
}
