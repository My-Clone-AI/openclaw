import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createNsvxClient } from "./src/client.js";
import { parseNsvxConfig } from "./src/config.js";
import { createNsvxDeviceTool } from "./src/device.js";
import { registerNsvxGatewayMethods } from "./src/gateway.js";
import { createTeamService, openHistoryStore, openPausedStore } from "./src/team.js";
import {
  createNsvxFinanceTool,
  createNsvxMessagesTool,
  createNsvxOwnerTools,
  createNsvxTeamTool,
  createNsvxTools,
  NSVX_OWNER_TOOL_NAMES,
} from "./src/tools.js";

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
    const team = createTeamService(api.runtime, () => ({
      paused: openPausedStore(api.runtime),
      history: openHistoryStore(api.runtime),
    }));
    registerNsvxGatewayMethods(api, client, team);
    for (const tool of createNsvxTools(client)) {
      api.registerTool(tool);
    }
    api.registerTool((context) => createNsvxTeamTool(team, context), { name: "nsvx_team" });
    api.registerTool((context) => createNsvxMessagesTool(client, context), {
      name: "nsvx_messages",
    });
    api.registerTool((context) => createNsvxDeviceTool(client, context), {
      name: "nsvx_device",
    });
    api.registerTool((context) => createNsvxFinanceTool(client, context), {
      name: "nsvx_finance",
      optional: true,
    });
    for (const name of NSVX_OWNER_TOOL_NAMES) {
      api.registerTool(
        {
          contextVersion: 2,
          create: (context) =>
            createNsvxOwnerTools(client, context).find((tool) => tool.name === name),
        },
        { name },
      );
    }
  },
});
