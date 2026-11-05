import path from "node:path";
import { fileURLToPath } from "node:url";
import { createControlPanelProxy, resolveGatewayTarget } from "./proxy.mjs";

const port = Number(process.env.OPENCLAW_CONTROL_PORT || 18890);
const { gatewayHost, gatewayPort } = resolveGatewayTarget();

const server = createControlPanelProxy({ gatewayHost, gatewayPort });

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(port, "127.0.0.1", () => {
    console.log(
      `OpenClaw Control proxy listening on http://127.0.0.1:${port}/app/ -> ${gatewayHost}:${gatewayPort}`,
    );
  });
}

export { server };
