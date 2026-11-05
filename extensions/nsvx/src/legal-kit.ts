import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";

export function changeProcedureRequest<V = unknown>(
  ctx: { host: ControlUiHost },
  params: Record<string, unknown>,
) {
  return ctx.host.request<V>("nsvx.procedures.change", params);
}
