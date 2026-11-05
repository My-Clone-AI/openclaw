import type { AnyAgentTool, OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";
import { providerAction, readBusiness, visibleGrants, workflowAction } from "./business.js";
import {
  accountRows,
  filterGrants,
  grantExpiry,
  PROVIDER_NAMES,
  PROVIDER_OPS,
  PROVIDERS,
  providerTone,
  runDone,
  WORKFLOW_PROVIDERS,
  type Claim,
  type ClaimRow,
  type Grant,
  type Provider,
  type ProviderStatus,
  type Readings,
  type Run,
  type Workflow,
} from "./business-data.js";
import type { NsvxClient } from "./client.js";
import { NsvxError } from "./client.js";
import { outcome } from "./tools.js";

const ACTIONS = [
  "overview",
  "provider",
  "collect",
  "workflow",
  "startWorkflow",
  "resumeWorkflow",
  "readings",
  "warranties",
  "warranty",
  "purchases",
  "grants",
  "denials",
] as const;

type BusinessToolParams = {
  action: (typeof ACTIONS)[number];
  provider?: Provider;
  year?: number;
  quarter?: number;
  providers?: string[];
  account?: string;
  installation?: string;
  id?: string;
  query?: string;
};

function runSummary(run: Run | null | undefined) {
  return run
    ? {
        year: run.year,
        quarter: run.quarter,
        state: run.state,
        documents: runDone(run),
        detail: run.confirmation ?? run.detail ?? null,
      }
    : null;
}

function providerSummary(provider: Provider, status: ProviderStatus) {
  return {
    provider,
    name: PROVIDER_NAMES[provider],
    light: providerTone(provider, status),
    signedIn: status.configured ?? false,
    lastRun: runSummary(status.run ?? status.runs?.[0]),
    ...(status.accounts ? { accounts: accountRows(status) } : {}),
    ...(status.installations ? { installations: status.installations } : {}),
    ...(provider === "glovo" ? { recipient: status.recipient ?? "", login: status.login_state ?? null } : {}),
    ...(provider === "amazon"
      ? { orders: status.history?.orders.length ?? 0, ordersYear: status.history?.year ?? null }
      : {}),
  };
}

/**
 * The owner's business and home services (NSVX Empresarial, Encomendas, Serviços da casa, Leituras, Garantias,
 * Autorizações). Reads, plus starting or resuming invoice collections; sign-in details, sending a meter reading,
 * warranty packets, and revoking grants stay owner taps in Control.
 */
export function createNsvxBusinessTool(
  client: NsvxClient,
  context: Pick<OpenClawPluginToolContext, "senderIsOwner" | "assertInvocationCurrent">,
): AnyAgentTool {
  const view = <V>(name: string, params: Record<string, string> = {}) =>
    readBusiness(client, { name, params }) as Promise<V>;
  const need = <V>(value: V | undefined, name: string): V => {
    if (value === undefined || value === "") {
      throw new NsvxError("invalid", `${name} is required.`);
    }
    return value;
  };
  return {
    name: "nsvx_business",
    label: "NSVX business",
    description:
      "The owner's business and home admin in NSVX. overview: every supplier, home service, and shop with its sign-in light and last invoice collection (Via Verde, Prio, Bolt, Fidelidade, NOS, Endesa, Glovo, Amazon ES); provider: one of them in full; collect: start collecting one provider's invoices for a past or current quarter into Drive (NOS takes account, Endesa installation); workflow/startWorkflow/resumeWorkflow: the cross-supplier quarter collection (bolt, fidelidade, prio, viaverde) and its verified steps; readings: meter readings and their state; warranties/warranty: warranty claim drafts and what they still need; purchases: find bills by words; grants/denials: business action grants (who may run which app action, expiry) and their refusals. It never enters sign-in details, sends a meter reading, exports a warranty packet, or revokes a grant: send the owner to Control, NSVX, Business for those.",
    parameters: Type.Object(
      {
        action: Type.Union(ACTIONS.map((value) => Type.Literal(value))),
        provider: Type.Optional(Type.Union(PROVIDERS.map((value) => Type.Literal(value)))),
        year: Type.Optional(Type.Number()),
        quarter: Type.Optional(Type.Number({ description: "1 to 4." })),
        providers: Type.Optional(
          Type.Array(Type.Union(WORKFLOW_PROVIDERS.map((value) => Type.Literal(value)))),
        ),
        account: Type.Optional(Type.String({ description: "NOS account from provider, or all." })),
        installation: Type.Optional(Type.String({ description: "Endesa installation id, or all." })),
        id: Type.Optional(Type.String({ description: "Workflow, claim, or grant id." })),
        query: Type.Optional(Type.String({ description: "Words to find." })),
      },
      { additionalProperties: false },
    ),
    execute: (_toolCallId, params: BusinessToolParams) =>
      outcome(async () => {
        if (context.senderIsOwner !== true) {
          throw new NsvxError("denied", "Only the owner may read business services.");
        }
        switch (params.action) {
          case "overview": {
            const rows = await Promise.allSettled(
              PROVIDERS.map((p) => view<ProviderStatus>(p).then((s) => providerSummary(p, s))),
            );
            return rows.map((row, i) =>
              row.status === "fulfilled"
                ? row.value
                : {
                    provider: PROVIDERS[i],
                    error: row.reason instanceof NsvxError ? row.reason.kind : "failed",
                  },
            );
          }
          case "provider": {
            const provider = need(params.provider, "provider");
            return providerSummary(provider, await view<ProviderStatus>(provider));
          }
          case "collect": {
            const provider = need(params.provider, "provider");
            if (!PROVIDER_OPS[provider].includes("quarter")) {
              throw new NsvxError("invalid", `${PROVIDER_NAMES[provider]} has no quarter collection.`);
            }
            context.assertInvocationCurrent?.();
            return providerAction(client, {
              provider,
              op: "quarter",
              year: params.year,
              quarter: params.quarter,
              ...(provider === "nos" ? { association: params.account ?? "all" } : {}),
              ...(provider === "endesa" ? { installation: params.installation ?? "all" } : {}),
            }).then((run) => runSummary(run as Run));
          }
          case "workflow":
            return view<Workflow>("workflow", { id: need(params.id, "id") });
          case "startWorkflow":
            context.assertInvocationCurrent?.();
            return workflowAction(client, {
              op: "start",
              year: params.year,
              quarter: params.quarter,
              providers: params.providers ?? [...WORKFLOW_PROVIDERS],
            });
          case "resumeWorkflow":
            context.assertInvocationCurrent?.();
            return workflowAction(client, { op: "resume", id: need(params.id, "id") });
          case "readings": {
            const data = await view<Readings>("readings");
            return {
              installations: data.installations,
              sending: data.providers,
              readings: data.readings.slice(0, 20).map((r) => ({
                id: r.id,
                state: r.state,
                date: r.draft.reading_date ?? null,
                installation: r.draft.installation_id ?? null,
                registers: (r.draft.registers ?? []).map((x) => `${x.code} ${x.display} ${x.unit}`),
                flags: r.flags.map((f) => f.text),
                reference: r.receipt?.reference ?? null,
              })),
            };
          }
          case "warranties":
            return (await view<{ items: ClaimRow[] }>("warranties")).items;
          case "warranty": {
            const claim = await view<Claim>("warranty", { id: need(params.id, "id") });
            const packet = claim.packet ?? claim.preview;
            return {
              id: claim.id,
              state: claim.state,
              stage: claim.stage,
              product: packet?.fields.product?.value ?? claim.product,
              fault: claim.fault,
              stillNeeds: packet?.unresolved ?? [],
              facts: Object.fromEntries(
                Object.entries(packet?.fields ?? {})
                  .filter(([, field]) => field.value)
                  .map(([key, field]) => [key, field.value]),
              ),
              evidence: packet?.evidence.map((e) => e.name) ?? [],
              error: claim.error,
            };
          }
          case "purchases":
            return (
              await view<{ items: { id: string; original_name: string }[] }>(
                "purchases",
                params.query ? { q: params.query.slice(0, 200) } : {},
              )
            ).items;
          case "grants": {
            const { grants } = await view<{ grants: Grant[] }>("grants");
            return filterGrants(visibleGrants(grants), params.query ?? "").map((g) => ({
              id: g.id,
              app: g.app,
              action: g.action,
              state: g.state,
              holder: g.user_ref ?? null,
              tenant: g.tenant ?? null,
              expires: g.expires_at,
              daysLeft: grantExpiry(g.expires_at)?.days ?? null,
            }));
          }
          case "denials":
            return view("grantDenials", { id: need(params.id, "id") });
        }
        throw new NsvxError("invalid", "Unknown action.");
      }),
  } as AnyAgentTool;
}
