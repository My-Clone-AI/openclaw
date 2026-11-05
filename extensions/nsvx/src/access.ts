import type { Devices } from "./access-data.js";
import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";

/**
 * Access changes: each goes to one fixed NSVX route with the owner session and its CSRF token, so NSVX applies its own
 * checks and audit. Typed passwords and stored-login secrets pass through to NSVX once and are never kept or logged.
 */

const ID = /^[\w.:-]{1,200}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** NSVX's remote browser keys (`LoginInput`/`Action` in NSVX). */
const KEYS = [
  "Enter",
  "Tab",
  "Shift+Tab",
  "Escape",
  "Space",
  "Backspace",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
] as const;
const CHALLENGE_KEYS = KEYS.filter((key) => key !== "Backspace");

function id(value: unknown, name: string, pattern = ID): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new NsvxError("invalid", `${name} is required.`);
  }
  return value;
}

function text(value: unknown, name: string, min: number, max: number): string {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    throw new NsvxError("invalid", `${name} must be ${min}-${max} characters.`);
  }
  return value;
}

function bool(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new NsvxError("invalid", `${name} must be true or false.`);
  }
  return value;
}

function coordinate(value: unknown, max: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) {
    throw new NsvxError("invalid", `${name} must be 0-${max}.`);
  }
  return value;
}

/** One tap, key, or scroll on NSVX's remote browser screen (1280x900). */
function screenInput(params: Record<string, unknown>, keys: readonly string[]) {
  switch (params.kind) {
    case "click":
      return {
        kind: "click",
        x: coordinate(params.x, 1280, "x"),
        y: coordinate(params.y, 900, "y"),
      };
    case "key":
      if (!keys.includes(params.key as string)) {
        throw new NsvxError("invalid", "Unknown key.");
      }
      return { kind: "key", key: params.key as string };
    case "scroll": {
      const dy = params.dy ?? 300;
      if (typeof dy !== "number" || Math.abs(dy) > 900) {
        throw new NsvxError("invalid", "dy must be -900 to 900.");
      }
      return { kind: "scroll", dy };
    }
    default:
      throw new NsvxError("invalid", "kind must be click, key, or scroll.");
  }
}

const aid = (params: Record<string, unknown>) => ({ aid: id(params.accountId, "accountId", UUID) });

/** Pauses or resumes one connected app (NSVX stops reading and replying while paused). */
export async function pauseApp(client: NsvxClient, params: Record<string, unknown>) {
  return client.writeOwner(
    "appPause",
    undefined,
    { paused: bool(params.paused, "paused") },
    { params: aid(params) },
  );
}

/** Asks NSVX to check one app now (a sync with a freshness proof); it reads, never sends. */
export async function checkApp(client: NsvxClient, params: Record<string, unknown>) {
  return client.writeOwner("appCheck", undefined, {}, { params: aid(params) });
}

/**
 * Starts a browser sign-in. NSVX records the owner's risk acknowledgement once per account (the owner chose, on
 * 2026-10-12, to connect without a warning step), then the tab reads `appLogin` with `refresh` for the QR or page.
 */
export async function startLogin(client: NsvxClient, params: Record<string, unknown>) {
  return client.writeOwner(
    "appRiskAck",
    undefined,
    { disclosure_version: "2026-10-12" },
    { params: aid(params) },
  );
}

export async function loginInput(client: NsvxClient, params: Record<string, unknown>) {
  // `type` sends text the owner typed (it may be a password); NSVX never logs or stores it.
  const input =
    params.kind === "type"
      ? { kind: "type", text: text(params.text, "text", 1, 500) }
      : screenInput(params, KEYS);
  return client.writeOwner("appLoginInput", undefined, input, { params: aid(params) });
}

/** Fills the provider's own sign-in fields by their index, then submits. Values are never stored or echoed. */
export async function loginFill(client: NsvxClient, params: Record<string, unknown>) {
  const values = params.values;
  if (typeof values !== "object" || values === null || Array.isArray(values)) {
    throw new NsvxError("invalid", "values is required.");
  }
  const entries = Object.entries(values);
  if (
    entries.length === 0 ||
    entries.length > 6 ||
    entries.some(
      ([key, value]) =>
        !/^\d{1,2}$/.test(key) || typeof value !== "string" || !value || value.length > 300,
    )
  ) {
    throw new NsvxError("invalid", "values must map field numbers to text.");
  }
  return client.writeOwner(
    "appLoginFill",
    undefined,
    { values, submit: true },
    { params: aid(params) },
  );
}

/**
 * Ends one NSVX sign-in session. The Gateway's own session is refused: ending it would cut Control off from NSVX
 * until the owner sets a new one.
 */
export async function revokeSession(client: NsvxClient, params: Record<string, unknown>) {
  const sid = id(params.sessionId, "sessionId");
  const devices = await client.readOwnerView<Devices>("authDevices");
  if (devices.current_session === sid) {
    throw new NsvxError("denied", "This is the session Control uses. Sign out in NSVX instead.");
  }
  return client.writeOwner("sessionRevoke", undefined, {}, { params: { sid } });
}

/** Removes a passkey; NSVX also ends every session signed in with it. */
export async function revokePasskey(client: NsvxClient, params: Record<string, unknown>) {
  return client.writeOwner(
    "passkeyRevoke",
    undefined,
    {},
    { params: { cid: id(params.passkeyId, "passkeyId") } },
  );
}

export async function revokeApple(client: NsvxClient, params: Record<string, unknown>) {
  return client.writeOwner(
    "appleRevoke",
    undefined,
    {},
    { params: { iid: id(params.identityId, "identityId") } },
  );
}

/** Queues NSVX's import of logins from the owner's documents; the tab follows the job. */
export async function importCredentials(client: NsvxClient) {
  return client.writeOwner<{ job_id: number }>("credentialImport", undefined, {});
}

export async function saveCredential(client: NsvxClient, params: Record<string, unknown>) {
  const login = {
    username: text(params.username, "username", 1, 300),
    secret: text(params.secret, "secret", 1, 1000),
  };
  if (params.credentialId === undefined) {
    return client.writeOwner<{ id: string; origin: string }>("credentialCreate", undefined, {
      label: text(params.label, "label", 1, 80),
      origin: text(params.origin, "origin", 1, 200),
      ...login,
    });
  }
  return client.writeOwner<{ ok: boolean; version: number }>(
    "credentialReplace",
    undefined,
    login,
    {
      params: { cid: id(params.credentialId, "credentialId") },
    },
  );
}

/** Deletes the stored secret; NSVX closes the browser sessions of services that used it. */
export async function revokeCredential(client: NsvxClient, params: Record<string, unknown>) {
  return client.writeOwner<{ ok: boolean; services: string[] }>(
    "credentialRevoke",
    undefined,
    {},
    { params: { cid: id(params.credentialId, "credentialId") } },
  );
}

export async function challengeInput(client: NsvxClient, params: Record<string, unknown>) {
  return client.writeOwner("challengeInput", undefined, screenInput(params, CHALLENGE_KEYS), {
    params: { account: id(params.account, "account") },
  });
}

export async function challengeResume(client: NsvxClient, params: Record<string, unknown>) {
  return client.writeOwner(
    "challengeResume",
    undefined,
    {},
    { params: { account: id(params.account, "account") } },
  );
}

export async function addPermission(client: NsvxClient, params: Record<string, unknown>) {
  return client.writeOwner<{ id: string }>("permissionAdd", undefined, {
    label: text(params.label?.toString().trim(), "label", 1, 160),
  });
}

/** Saves areas, state, and identity with the revision the owner saw; NSVX answers a stale one with `conflict`. */
export async function savePermission(client: NsvxClient, params: Record<string, unknown>) {
  const scopes = params.scopes;
  if (
    !Array.isArray(scopes) ||
    scopes.length > 50 ||
    scopes.some((s) => typeof s !== "string" || !ID.test(s))
  ) {
    throw new NsvxError("invalid", "scopes must be area codes.");
  }
  const revision = params.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1) {
    throw new NsvxError("invalid", "revision is required.");
  }
  const state = params.state;
  if (state !== "active" && state !== "pending" && state !== "disabled") {
    throw new NsvxError("invalid", "state must be active, pending, or disabled.");
  }
  const person =
    params.personId === null || params.personId === undefined || params.personId === ""
      ? null
      : id(params.personId, "personId", UUID);
  return client.writeOwner(
    "permissionSave",
    undefined,
    { revision, person_id: person, state, scopes },
    { params: { pid: id(params.assignmentId, "assignmentId", UUID) } },
  );
}

/** Sets the person's own sign-in for `/acesso`; NSVX ends their open sessions. It sends no invite. */
export async function setPermissionAccount(client: NsvxClient, params: Record<string, unknown>) {
  const username = params.username;
  if (typeof username !== "string" || !/^[a-z0-9][a-z0-9._-]{2,79}$/.test(username)) {
    throw new NsvxError("invalid", "username must be 3-80 lowercase letters, digits, dot, dash.");
  }
  return client.writeOwner(
    "permissionAccount",
    undefined,
    { username, password: text(params.password, "password", 12, 1024) },
    { params: { pid: id(params.assignmentId, "assignmentId", UUID) } },
  );
}

/** Asks Meta for the binding's health once (identity and token); it sends nothing. */
export async function checkHooks(client: NsvxClient, params: Record<string, unknown>) {
  return client.writeOwner("hookCheck", undefined, {}, { params: aid(params) });
}
