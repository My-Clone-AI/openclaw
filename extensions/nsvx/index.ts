import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createNsvxAgendaTool, NSVX_AGENDA_TOOL } from "./src/agenda-tools.js";
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
    const client = createNsvxClient({
      baseUrl: parseNsvxConfig(api.pluginConfig).baseUrl,
      token: process.env.NSVX_AGENTOS_TOKEN,
      ownerSession: process.env.NSVX_OWNER_SESSION,
    });
    registerNsvxGatewayMethods(api, client);
    for (const tool of createNsvxTools(client)) {
      api.registerTool(tool);
    }
    api.registerTool(
      { contextVersion: 2, create: (context) => createNsvxAgendaTool(client, context) },
      { name: NSVX_AGENDA_TOOL },
    );
  },
});
