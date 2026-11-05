import {
  errorFor,
  guardedFetch,
  NsvxError,
  OWNER_COOKIE,
  problemFrom,
  TIMEOUT_MS,
  type Fetch,
} from "./client.js";

/**
 * NSVX AI settings (Apps → IA, clone-ai, voice) through the owner's own session. NSVX stays the owner: it validates,
 * audits, and answers each change with its fresh state, which the page shows as the readback.
 *
 * Reads are fixed GET paths. Changes are this fixed list of AI routing and voice settings only: no messages, money,
 * sign-ins, or account removal. Each change fetches the session's CSRF token right before the write, as the NSVX page
 * does. Raising the paid voice budget or switching its model stays in NSVX.
 */
const AI_READS = {
  state: "/api/ai/state",
  requests: "/api/ai/requests?limit=50",
  cloneAi: "/api/group-companies/clone-ai",
  voice: "/api/voice/gpt/settings",
  voiceEngine: "/api/voice/engine",
  evals: "/api/ai/evals",
  openclaw: "/api/ai/openclaw/providers",
} as const;

type AiRead = keyof typeof AI_READS;

const VOICE_FIELDS = {
  voice: "text",
  style: "text",
  length: "text",
  language: "text",
  instructions: "text",
  autoplay: "boolean",
  mic_input: "boolean",
} as const;

type VoicePatch = Partial<{
  voice: string;
  style: string;
  length: string;
  language: string;
  instructions: string;
  autoplay: boolean;
  mic_input: boolean;
}>;

export type ChainRoute = { provider: string; model: string; effort: string | null };

export type AiChange =
  | { op: "lane.enabled"; lane: string; enabled: boolean }
  | { op: "lane.order"; lane: string; chain: ChainRoute[] }
  | { op: "lane.skip"; lane: string; provider: string; reason: string }
  | { op: "lane.restore"; lane: string }
  | { op: "lane.test"; lane: string }
  | { op: "provider.enabled"; provider: string; enabled: boolean }
  | { op: "provider.preferred"; provider: string; preferred: boolean }
  | { op: "provider.refresh"; provider: string }
  | { op: "provider.test"; provider: string }
  | { op: "cloneAi.routing"; enabled: boolean }
  | { op: "cloneAi.check" }
  | { op: "cloneAi.rollback" }
  | { op: "voice.engine"; engine: "classic" | "gpt_realtime" }
  | { op: "voice.settings"; patch: VoicePatch }
  | { op: "openclaw.registerCloneAi"; hash?: string };

export type AiOp = AiChange["op"];

export const AI_OPS: readonly AiOp[] = [
  "lane.enabled",
  "lane.order",
  "lane.skip",
  "lane.restore",
  "lane.test",
  "provider.enabled",
  "provider.preferred",
  "provider.refresh",
  "provider.test",
  "cloneAi.routing",
  "cloneAi.check",
  "cloneAi.rollback",
  "voice.engine",
  "voice.settings",
  "openclaw.registerCloneAi",
];

const SLUG = /^[a-z0-9][a-z0-9_-]{0,47}$/;

function invalid(message: string): never {
  throw new NsvxError("invalid", message);
}

function slug(raw: Record<string, unknown>, name: string): string {
  const value = raw[name];
  return typeof value === "string" && SLUG.test(value) ? value : invalid(`${name} is not valid.`);
}

function flag(raw: Record<string, unknown>, name: string): boolean {
  const value = raw[name];
  return typeof value === "boolean" ? value : invalid(`${name} must be true or false.`);
}

function shortText(value: unknown, name: string, max: number): string {
  return typeof value === "string" && value.length <= max ? value : invalid(`${name} is too long.`);
}

function route(value: unknown): ChainRoute {
  const item = (value ?? {}) as Record<string, unknown>;
  const effort = item.effort ?? null;
  return {
    provider: slug(item, "provider"),
    model: shortText(item.model, "model", 120) || invalid("model is required."),
    effort: effort === null ? null : shortText(effort, "effort", 40),
  };
}

function voicePatch(value: unknown): VoicePatch {
  const raw = (value ?? {}) as Record<string, unknown>;
  const patch: Record<string, string | boolean> = {};
  for (const [key, entry] of Object.entries(raw)) {
    const kind = VOICE_FIELDS[key as keyof typeof VOICE_FIELDS];
    if (!kind) {
      invalid(`${key} can only be changed in NSVX.`);
    }
    if (kind === "boolean") {
      patch[key] = flag(raw, key);
    } else {
      patch[key] = shortText(entry, key, key === "instructions" ? 1000 : 40);
    }
  }
  return Object.keys(patch).length > 0 ? (patch as VoicePatch) : invalid("Nothing to change.");
}

/** Validates an AI change once, where it enters from the page or a chat tool. */
export function parseAiChange(value: unknown): AiChange {
  const raw = (value ?? {}) as Record<string, unknown>;
  switch (raw.op) {
    case "lane.enabled":
      return { op: raw.op, lane: slug(raw, "lane"), enabled: flag(raw, "enabled") };
    case "lane.order": {
      const chain = Array.isArray(raw.chain) ? raw.chain.map(route) : [];
      return chain.length > 0 && chain.length <= 30
        ? { op: raw.op, lane: slug(raw, "lane"), chain }
        : invalid("chain needs 1 to 30 routes.");
    }
    case "lane.skip": {
      const reason = shortText(raw.reason, "reason", 200).trim();
      return reason.length >= 3
        ? { op: raw.op, lane: slug(raw, "lane"), provider: slug(raw, "provider"), reason }
        : invalid("reason needs at least 3 characters.");
    }
    case "lane.restore":
    case "lane.test":
      return { op: raw.op, lane: slug(raw, "lane") };
    case "provider.enabled":
      return { op: raw.op, provider: slug(raw, "provider"), enabled: flag(raw, "enabled") };
    case "provider.preferred":
      return { op: raw.op, provider: slug(raw, "provider"), preferred: flag(raw, "preferred") };
    case "provider.refresh":
    case "provider.test":
      return { op: raw.op, provider: slug(raw, "provider") };
    case "cloneAi.routing":
      return { op: raw.op, enabled: flag(raw, "enabled") };
    case "cloneAi.check":
    case "cloneAi.rollback":
      return { op: raw.op };
    case "voice.engine":
      return raw.engine === "classic" || raw.engine === "gpt_realtime"
        ? { op: raw.op, engine: raw.engine }
        : invalid("engine must be classic or gpt_realtime.");
    case "voice.settings":
      return { op: raw.op, patch: voicePatch(raw.patch) };
    case "openclaw.registerCloneAi":
      return typeof raw.hash === "string"
        ? { op: raw.op, hash: shortText(raw.hash, "hash", 200) }
        : { op: raw.op };
    default:
      return invalid("Unknown AI change.");
  }
}

type Write = { method: "POST" | "PUT" | "DELETE"; path: string; body?: unknown };

function aiWrite(change: AiChange): Write {
  const lane = (name: string, tail = "") => `/api/ai/lanes/${encodeURIComponent(name)}${tail}`;
  const provider = (id: string, tail: string) =>
    `/api/ai/providers/${encodeURIComponent(id)}/${tail}`;
  switch (change.op) {
    case "lane.enabled":
      return { method: "PUT", path: lane(change.lane), body: { enabled: change.enabled } };
    case "lane.order":
      return { method: "PUT", path: lane(change.lane), body: { chain: change.chain } };
    case "lane.skip":
      return {
        method: "POST",
        path: lane(change.lane, "/skip"),
        body: { provider: change.provider, reason: change.reason },
      };
    case "lane.restore":
      return { method: "DELETE", path: lane(change.lane, "/skip") };
    case "lane.test":
      return { method: "POST", path: lane(change.lane, "/test") };
    case "provider.enabled":
      return {
        method: "POST",
        path: provider(change.provider, "enabled"),
        body: { enabled: change.enabled },
      };
    case "provider.preferred":
      return {
        method: "POST",
        path: provider(change.provider, "preferred"),
        body: { preferred: change.preferred },
      };
    case "provider.refresh":
      return { method: "POST", path: provider(change.provider, "refresh") };
    case "provider.test":
      return { method: "POST", path: provider(change.provider, "test") };
    case "cloneAi.routing":
      return {
        method: "POST",
        path: "/api/group-companies/clone-ai/routing",
        body: { enabled: change.enabled },
      };
    case "cloneAi.check":
      return { method: "POST", path: "/api/group-companies/clone-ai/health" };
    case "cloneAi.rollback":
      return { method: "POST", path: "/api/group-companies/clone-ai/rollback" };
    case "voice.engine":
      return { method: "POST", path: "/api/voice/engine", body: { engine: change.engine } };
    case "voice.settings":
      return { method: "POST", path: "/api/voice/gpt/settings", body: change.patch };
    case "openclaw.registerCloneAi":
      return {
        method: "POST",
        path: "/api/ai/openclaw/providers/clone-ai/register",
        body: change.hash ? { hash: change.hash } : {},
      };
  }
  return invalid("Unknown AI change.");
}

export type NsvxAiClient = ReturnType<typeof createNsvxAiClient>;

export function createNsvxAiClient(options: {
  baseUrl: string;
  ownerSession: string | undefined;
  fetchImpl?: Fetch;
}) {
  const fetchImpl = options.fetchImpl ?? guardedFetch;

  async function send(
    method: Write["method"] | "GET",
    path: string,
    init: { body?: unknown; csrf?: string } = {},
  ): Promise<unknown> {
    if (!options.ownerSession) {
      throw new NsvxError("unconfigured", "NSVX owner sign-in is not set up on this Gateway.");
    }
    const isWrite = method !== "GET";
    let response: Response;
    try {
      response = await fetchImpl(`${options.baseUrl}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          Cookie: `${OWNER_COOKIE}=${options.ownerSession}`,
          ...(init.csrf ? { "X-CSRF-Token": init.csrf } : {}),
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        signal: AbortSignal.timeout(isWrite ? TIMEOUT_MS * 10 : TIMEOUT_MS),
      });
    } catch {
      // A change that lost its connection may still have reached NSVX.
      throw isWrite
        ? new NsvxError("uncertain", "NSVX did not confirm the result. Check before repeating.")
        : new NsvxError("offline", "NSVX cannot be reached.");
    }
    if (!response.ok) {
      throw errorFor(response.status, await problemFrom(response), isWrite, path);
    }
    return response.json();
  }

  return {
    async read(view: string, params: { id?: unknown } = {}): Promise<unknown> {
      if (view === "request") {
        const id = params.id;
        if (typeof id !== "string" || !/^[0-9a-f-]{32,36}$/i.test(id)) {
          invalid("id is not a request id.");
        }
        return send("GET", `/api/ai/requests/${id}`);
      }
      if (!Object.hasOwn(AI_READS, view)) {
        invalid("Unknown AI view.");
      }
      return send("GET", AI_READS[view as AiRead]);
    },
    async change(change: AiChange): Promise<unknown> {
      const write = aiWrite(change);
      const auth = (await send("GET", "/api/auth/state")) as {
        authenticated?: boolean;
        csrf?: string | null;
      };
      if (!auth.authenticated || !auth.csrf) {
        throw new NsvxError("signed-out", "NSVX rejected the owner sign-in.");
      }
      return send(write.method, write.path, {
        csrf: auth.csrf,
        ...(write.body !== undefined ? { body: write.body } : {}),
      });
    },
  };
}
