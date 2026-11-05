import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { parseAiChange, type NsvxAiClient } from "./ai-client.js";
import { gatewayHandler } from "./gateway.js";

// Literal method names keep scripts/nsvx-parity-inventory.mts able to list them.
export function registerNsvxAiGatewayMethods(api: OpenClawPluginApi, ai: NsvxAiClient) {
  api.registerGatewayMethod(
    "nsvx.ai.read",
    gatewayHandler((params) =>
      ai.read(typeof params.view === "string" ? params.view : "", { id: params.id }),
    ),
    { scope: "operator.read" },
  );
  // NSVX answers each change with its fresh state, so the page never re-reads its own write.
  api.registerGatewayMethod(
    "nsvx.ai.change",
    gatewayHandler((params) => ai.change(parseAiChange(params))),
    { scope: "operator.write" },
  );
}
