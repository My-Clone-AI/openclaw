import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createAgentSettings } from "./src/agent-settings.js";
import { createNsvxClient } from "./src/client.js";
import { parseNsvxConfig } from "./src/config.js";
import { createNsvxDeviceTool } from "./src/device.js";
import { createNsvxFleetTool } from "./src/fleet-tool.js";
import { registerNsvxGatewayMethods } from "./src/gateway.js";
import { createNsvxGroupTool } from "./src/group-tool.js";
import { createNsvxPeopleTool } from "./src/people-tool.js";
import { createTeamService, openHistoryStore, openPausedStore } from "./src/team.js";
import {
  createNsvxAgentsTool,
  createNsvxAgendaTool,
  createNsvxFinanceTool,
  createNsvxMessagesTool,
  createNsvxSkillsTool,
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
    const settings = createAgentSettings(api.runtime, team);
    registerNsvxGatewayMethods(api, client, team, settings);
    for (const tool of createNsvxTools(client)) {
      api.registerTool(tool);
    }
    api.registerTool((context) => createNsvxTeamTool(team, context), { name: "nsvx_team" });
    api.registerTool((context) => createNsvxAgentsTool(settings, client, context), {
      name: "nsvx_agents",
    });
    api.registerTool((context) => createNsvxSkillsTool(client, context), { name: "nsvx_skills" });
    api.registerTool((context) => createNsvxMessagesTool(client, context), {
      name: "nsvx_messages",
    });
    api.registerTool((context) => createNsvxAgendaTool(client, context), { name: "nsvx_agenda" });
    api.registerTool((context) => createNsvxPeopleTool(client, context), { name: "nsvx_people" });
    api.registerTool((context) => createNsvxDeviceTool(client, context), {
      name: "nsvx_device",
    });
    api.registerTool((context) => createNsvxFleetTool(client, context), { name: "nsvx_fleet" });
    api.registerTool((context) => createNsvxFinanceTool(client, context), {
      name: "nsvx_finance",
      optional: true,
    });
    api.registerTool((context) => createNsvxGroupTool(client, context), {
      name: "nsvx_group",
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
