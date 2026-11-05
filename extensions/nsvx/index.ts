import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createNsvxAiClient } from "./src/ai-client.js";
import { registerNsvxAiGatewayMethods } from "./src/ai-gateway.js";
import { createNsvxAiTools, NSVX_AI_TOOL_NAMES } from "./src/ai-tools.js";
import { createNsvxClient } from "./src/client.js";
import { parseNsvxConfig } from "./src/config.js";
import { registerNsvxGatewayMethods } from "./src/gateway.js";
import { createNsvxTools } from "./src/tools.js";

export default definePluginEntry({
  id: "nsvx",
  name: "NSVX",
  description: "Run NSVX actions, manage the agent team, and track parity from Control",
  register(api) {
    // The token stays in this process: the browser only ever talks to these methods.
    const { baseUrl } = parseNsvxConfig(api.pluginConfig);
    const client = createNsvxClient({
      baseUrl,
      token: process.env.NSVX_AGENTOS_TOKEN,
      ownerSession: process.env.NSVX_OWNER_SESSION,
    });
    const ai = createNsvxAiClient({ baseUrl, ownerSession: process.env.NSVX_OWNER_SESSION });
    registerNsvxGatewayMethods(api, client);
    registerNsvxAiGatewayMethods(api, ai);
    for (const tool of createNsvxTools(client)) {
      api.registerTool(tool);
    }
    for (const name of NSVX_AI_TOOL_NAMES) {
      api.registerTool(
        {
          contextVersion: 2,
          create: (context) => createNsvxAiTools(ai, context).find((tool) => tool.name === name),
        },
        { name },
      );
    }
  },
});
