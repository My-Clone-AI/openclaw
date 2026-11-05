import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import type { Ctx } from "./device-kit.js";
import type { CaseDetail, Vocab } from "./legal-data.js";
import type { LT } from "./legal-i18n.js";

export type LegalCtx = Ctx & { lt: LT; locale: string; vocab: () => Vocab | undefined };

export function changeCaseRequest<V = unknown>(ctx: LegalCtx, params: Record<string, unknown>) {
  return ctx.host.request<V>("nsvx.cases.change", params);
}

export function changeProcedureRequest<V = unknown>(
  ctx: { host: ControlUiHost },
  params: Record<string, unknown>,
) {
  return ctx.host.request<V>("nsvx.procedures.change", params);
}

export type CaseProps = { ctx: LegalCtx; row: CaseDetail; reload: () => Promise<void> };
