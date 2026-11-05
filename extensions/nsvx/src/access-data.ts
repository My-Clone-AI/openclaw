/** NSVX Access (`/apps`, `/acesso`, `/permissoes`): answer shapes and pure helpers shared by the tab and chat. */

export type Tone = "ok" | "warn" | "bad" | "busy" | "off";

export type Account = {
  id: string;
  channel: string;
  label: string;
  mode: string;
  state: string;
  state_detail: string | null;
  paused: boolean;
  outbound_enabled: boolean;
  last_verified_at: string | null;
  capabilities?: Record<string, { status?: string; note?: string }> | null;
  coverage?: Record<string, number> | null;
};
export type ServiceHealth = { ok: boolean; model?: string; effort?: string };
export type AppsAnswer = {
  accounts: Account[];
  services: Record<string, ServiceHealth>;
  google_client_missing: boolean;
  google?: {
    gmail: boolean;
    drive: boolean;
    drive_write: boolean;
    gmail_addresses?: { address: string; granted: boolean }[];
  };
};
export type LoginState = {
  state: string;
  detail?: string;
  view?: boolean;
  qr_png_base64?: string;
  qr_expired?: boolean;
  login_step?: string;
  cached?: boolean;
};
/** `/login/view` sends `png_base64`; `/browser-challenges/{a}/view` sends `image` (already a data URL). */
export type Screen = { png_base64?: string; image?: string; width: number; height: number };
export type LoginField = { index: number; label: string; kind: "text" | "password" | "code" };

export type Devices = {
  passkeys: {
    id: string;
    device_name: string;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
  }[];
  sessions: {
    id: string;
    device_label: string | null;
    method: string;
    created_at: string;
    last_seen_at: string | null;
  }[];
  /** The session this Gateway signs in with. */
  current_session: string;
};
export type AppleIdentities = {
  status: unknown;
  identities: {
    id: string;
    email: string | null;
    full_name: string | null;
    last_login_at: string | null;
  }[];
};
export type Credential = {
  id: string;
  label: string;
  origins: string[];
  state: string;
  detail: string | null;
  updated_at: string;
  service: string | null;
  from_document: boolean;
};
export type Challenge = { id: string; channel: string; failures: number; visual_required: boolean };

export type Scope = { code: string; label: string };
export type Assignment = {
  id: string;
  label: string;
  person_id: string | null;
  state: "active" | "pending" | "disabled";
  effective_state?: string;
  revision: number;
  scopes: string[];
  username: string | null;
  legacy_al?: string | null;
  phone_verified: boolean;
  changed_at: string;
};
export type Permissions = { people: Assignment[]; scopes: Scope[] };
export type Candidate = { id: string; display_name: string; verified_association: boolean };

export type Hooks = {
  account: { id: string; channel: string; label: string };
  binding: {
    state: string;
    health_code: string | null;
    webhook_challenged_at: string | null;
    subscribed_at?: string | null;
    last_event_at: string | null;
  } | null;
  events: { kind: string; state: string; n: number }[];
  signature_rejections: number;
  milestones: Record<string, string>;
};

/** Channels NSVX signs in through its own browser (QR or the provider's page). */
export const BROWSER_CHANNELS = ["whatsapp", "telegram", "instagram", "standvirtual"];
/** Channels whose provider pushes signed events to NSVX (Meta webhooks). */
export const HOOK_CHANNELS = ["whatsapp", "instagram"];
const CONNECTED = new Set(["ready", "working", "recovered", "api_ready"]);
const BUSY = new Set(["connecting", "importing_history", "reconnecting", "working"]);
const BAD = new Set(["interrupted", "failed", "blocked_external"]);
const ORDER = ["whatsapp", "instagram", "telegram", "gmail", "drive", "standvirtual", "phone"];

export function accountTone(account: Pick<Account, "state" | "paused">): Tone {
  if (account.paused || account.state === "disabled" || account.state === "disconnected") {
    return "off";
  }
  if (BAD.has(account.state)) {
    return "bad";
  }
  if (CONNECTED.has(account.state)) {
    return "ok";
  }
  return BUSY.has(account.state) ? "busy" : "warn";
}

export const isConnected = (account: Pick<Account, "state">) => CONNECTED.has(account.state);
export const isBrowserAccount = (account: Pick<Account, "mode" | "channel">) =>
  account.mode === "live" && BROWSER_CHANNELS.includes(account.channel);

/** Live accounts only (NSVX's test channel stays in NSVX), problems first, then NSVX's channel order. */
export function liveAccounts(accounts: Account[]): Account[] {
  const rank: Record<Tone, number> = { bad: 0, warn: 1, busy: 2, off: 3, ok: 4 };
  const channel = (c: string) => (ORDER.indexOf(c) + 1 || ORDER.length + 1) as number;
  return accounts
    .filter((a) => a.mode === "live")
    .toSorted(
      (a, b) =>
        rank[accountTone(a)] - rank[accountTone(b)] ||
        channel(a.channel) - channel(b.channel) ||
        a.label.localeCompare(b.label),
    );
}

export function appsSummary(accounts: Account[]) {
  const live = liveAccounts(accounts);
  return {
    total: live.length,
    connected: live.filter((a) => accountTone(a) === "ok").length,
    attention: live.filter((a) => ["bad", "warn"].includes(accountTone(a))).length,
    paused: live.filter((a) => a.paused).length,
  };
}

/** The image source of a remote browser screen, whichever NSVX route sent it. */
export function screenSrc(screen: Screen): string | undefined {
  if (screen.image?.startsWith("data:image/")) {
    return screen.image;
  }
  return screen.png_base64 ? `data:image/png;base64,${screen.png_base64}` : undefined;
}

/** A tap on the shown screen, in the remote page's own pixels (NSVX's browser is 1280x900). */
export function screenPoint(
  screen: Pick<Screen, "width" | "height">,
  box: { left: number; top: number; width: number; height: number },
  client: { x: number; y: number },
) {
  const clamp = (value: number, max: number) => Math.round(Math.max(0, Math.min(max, value)));
  return {
    x: clamp(((client.x - box.left) * screen.width) / box.width, screen.width),
    y: clamp(((client.y - box.top) * screen.height) / box.height, screen.height),
  };
}

export function permissionsSummary(people: Assignment[]) {
  const state = (p: Assignment) => p.effective_state ?? p.state;
  return {
    active: people.filter((p) => state(p) === "active").length,
    pending: people.filter((p) => state(p) === "pending").length,
    disabled: people.filter((p) => state(p) === "disabled").length,
  };
}

/** Webhook health from NSVX's own binding record: verified, waiting (held events or no subscription), or failing. */
export function hookTone(hooks: Hooks): Tone {
  const binding = hooks.binding;
  if (!binding || binding.state === "disconnected") {
    return "off";
  }
  if (binding.state === "reconnect" || BAD_HOOK_CODES.has(binding.health_code ?? "")) {
    return "bad";
  }
  const verified =
    hooks.milestones.webhook_subscribed === "verified" || Boolean(binding.last_event_at);
  return verified && hookCounts(hooks).held === 0 ? "ok" : "warn";
}

const BAD_HOOK_CODES = new Set([
  "token_expired",
  "reconnect_required",
  "credentials_unavailable",
  "wrong_account",
]);

export function hookCounts(hooks: Hooks) {
  const sum = (state: string) =>
    hooks.events.filter((e) => e.state === state).reduce((n, e) => n + e.n, 0);
  return {
    received: hooks.events.reduce((n, e) => n + e.n, 0),
    held: sum("held"),
    rejected: hooks.signature_rejections,
  };
}
