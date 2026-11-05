import type { AnyAgentTool, OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";
import {
  accountTone,
  appsSummary,
  HOOK_CHANNELS,
  hookCounts,
  hookTone,
  liveAccounts,
  permissionsSummary,
  type AppsAnswer,
  type Challenge,
  type Credential,
  type Devices,
  type Hooks,
  type Permissions,
} from "./access-data.js";
import { checkApp, pauseApp } from "./access.js";
import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";
import { outcome } from "./tools.js";

type AccessToolParams = {
  action:
    | "apps"
    | "check"
    | "pause"
    | "resume"
    | "signins"
    | "logins"
    | "checks"
    | "people"
    | "hooks";
  accountId?: string;
};

/**
 * The owner's connected apps, sign-ins, stored logins (names only), visual checks, people's access, and provider
 * hooks. Reads, plus checking, pausing, and resuming an app. Ending sessions, removing passkeys or logins, and
 * granting access stay owner taps in Control: the model never grants or removes access.
 */
export function createNsvxAccessTool(
  client: NsvxClient,
  context: Pick<OpenClawPluginToolContext, "senderIsOwner" | "assertInvocationCurrent">,
): AnyAgentTool {
  const view = <V>(name: string, params: Record<string, string> = {}) =>
    client.readOwnerView<V>(name, params);
  const account = (params: AccessToolParams) => {
    if (!params.accountId) {
      throw new NsvxError("invalid", "accountId is required (from apps).");
    }
    return params.accountId;
  };
  return {
    name: "nsvx_access",
    label: "NSVX access",
    description:
      "The owner's NSVX connections and access. apps: every connected app (WhatsApp, Instagram, Telegram, Gmail, Drive, phone) with its state and core services; check: check one app now (accountId); pause/resume: stop or restart clone reading and replying on one app; signins: NSVX sign-in sessions and passkeys; logins: stored website logins (names and state only, never secrets); checks: visual checks (CAPTCHA) waiting for the owner; people: who has access to which areas; hooks: WhatsApp and Instagram webhook health. Ending sessions, removing logins or passkeys, signing in to an app, solving a check, and changing anyone's access are done by the owner in Control, NSVX, Access.",
    parameters: Type.Object(
      {
        action: Type.Union(
          [
            "apps",
            "check",
            "pause",
            "resume",
            "signins",
            "logins",
            "checks",
            "people",
            "hooks",
          ].map((value) => Type.Literal(value)),
        ),
        accountId: Type.Optional(Type.String({ description: "App account id from apps." })),
      },
      { additionalProperties: false },
    ),
    execute: (_toolCallId, params: AccessToolParams) =>
      outcome(async () => {
        if (context.senderIsOwner !== true) {
          throw new NsvxError("denied", "Only the owner may read NSVX access.");
        }
        switch (params.action) {
          case "apps": {
            const apps = await view<AppsAnswer>("apps");
            return {
              summary: appsSummary(apps.accounts),
              apps: liveAccounts(apps.accounts).map((a) => ({
                id: a.id,
                channel: a.channel,
                name: a.label,
                state: a.state,
                tone: accountTone(a),
                detail: a.state_detail,
                paused: a.paused,
                checkedAt: a.last_verified_at,
              })),
              services: Object.fromEntries(
                Object.entries(apps.services).map(([name, s]) => [name, s.ok ? "ok" : "down"]),
              ),
              googleKeyMissing: apps.google_client_missing,
            };
          }
          case "check":
            context.assertInvocationCurrent?.();
            return checkApp(client, { accountId: account(params) });
          case "pause":
          case "resume":
            context.assertInvocationCurrent?.();
            return pauseApp(client, {
              accountId: account(params),
              paused: params.action === "pause",
            });
          case "signins": {
            const devices = await view<Devices>("authDevices");
            return {
              sessions: devices.sessions.map((s) => ({
                device: s.device_label,
                method: s.method,
                lastSeen: s.last_seen_at,
                control: s.id === devices.current_session,
              })),
              passkeys: devices.passkeys
                .filter((p) => !p.revoked_at)
                .map((p) => ({ device: p.device_name, lastUsed: p.last_used_at })),
            };
          }
          case "logins": {
            const { entries } = await view<{ entries: Credential[] }>("credentials");
            return entries.map((e) => ({
              name: e.label,
              site: e.origins[0] ?? null,
              state: e.state,
              usedBy: e.service,
              updatedAt: e.updated_at,
            }));
          }
          case "checks": {
            const { accounts } = await view<{ accounts: Challenge[] }>("challenges");
            return accounts.map((c) => ({
              channel: c.channel,
              attempts: c.failures,
              waitingForOwner: c.visual_required,
            }));
          }
          case "people": {
            const data = await view<Permissions>("permissions");
            const names = new Map(data.scopes.map((s) => [s.code, s.label]));
            return {
              summary: permissionsSummary(data.people),
              people: data.people.map((p) => ({
                name: p.label,
                state: p.effective_state ?? p.state,
                areas: p.scopes.map((code) => names.get(code) ?? code),
                hasSignIn: Boolean(p.username),
              })),
            };
          }
          case "hooks": {
            const apps = await view<AppsAnswer>("apps");
            const hooked = liveAccounts(apps.accounts).filter((a) =>
              HOOK_CHANNELS.includes(a.channel),
            );
            return Promise.all(
              hooked.map(async (a) => {
                const hooks = await view<Hooks>("providerHooks", { aid: a.id });
                return Object.assign(hookCounts(hooks), {
                  channel: a.channel,
                  name: a.label,
                  tone: hookTone(hooks),
                  lastEvent: hooks.binding?.last_event_at ?? null,
                });
              }),
            );
          }
        }
        throw new NsvxError("invalid", "Unknown action.");
      }),
  } as AnyAgentTool;
}
