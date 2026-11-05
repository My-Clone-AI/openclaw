import http from "node:http";
import net from "node:net";

/**
 * The Mac panel is a window onto the native Control UI served by the gateway.
 * Session menus, shortcuts, pin, rename, archive, search, and attachments stay
 * in that UI. This process only forwards HTTP and WebSocket bytes.
 */
export function resolveGatewayTarget(env = process.env) {
  if (!env.OPENCLAW_GATEWAY_HOST && env.OPENCLAW_GATEWAY_URL) {
    const parsed = new URL(env.OPENCLAW_GATEWAY_URL);
    return {
      gatewayHost: parsed.hostname,
      gatewayPort: Number(parsed.port || 18789),
    };
  }
  return {
    gatewayHost: env.OPENCLAW_GATEWAY_HOST || "127.0.0.1",
    gatewayPort: Number(env.OPENCLAW_GATEWAY_PORT || 18789),
  };
}

export function rewritePanelPath(rawUrl = "/") {
  const url = new URL(rawUrl, "http://127.0.0.1");
  let pathname = url.pathname;
  if (pathname === "/app" || pathname.startsWith("/app/")) {
    pathname = pathname.slice("/app".length) || "/";
  }
  if (!pathname.startsWith("/")) {
    pathname = `/${pathname}`;
  }
  return `${pathname}${url.search}`;
}

export function createControlPanelProxy({ gatewayHost = "127.0.0.1", gatewayPort }) {
  const server = http.createServer((request, response) => {
    const upstream = http.request(
      {
        hostname: gatewayHost,
        port: gatewayPort,
        method: request.method,
        path: rewritePanelPath(request.url),
        headers: { ...request.headers, host: `${gatewayHost}:${gatewayPort}` },
      },
      (incoming) => {
        response.writeHead(incoming.statusCode ?? 502, incoming.headers);
        incoming.pipe(response);
      },
    );
    upstream.on("error", () => {
      if (!response.headersSent) {
        response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      }
      response.end("OpenClaw gateway is not reachable.");
    });
    request.pipe(upstream);
    request.on("end", () => {
      if (!upstream.writableEnded) {
        upstream.end();
      }
    });
  });

  server.on("upgrade", (request, socket, head) => {
    const path = rewritePanelPath(request.url);
    const upstream = net.connect(gatewayPort, gatewayHost, () => {
      const lines = [`GET ${path} HTTP/1.1`];
      for (const [key, value] of Object.entries(request.headers)) {
        if (value === undefined) {
          continue;
        }
        const rendered = Array.isArray(value) ? value.join(", ") : value;
        lines.push(
          key.toLowerCase() === "host" ? `Host: ${gatewayHost}:${gatewayPort}` : `${key}: ${rendered}`,
        );
      }
      socket.pipe(upstream);
      upstream.pipe(socket);
      upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (head?.length) {
        upstream.write(head);
      }
    });
    const fail = () => {
      socket.destroy();
      upstream.destroy();
    };
    upstream.on("error", fail);
    socket.on("error", fail);
  });

  return server;
}
