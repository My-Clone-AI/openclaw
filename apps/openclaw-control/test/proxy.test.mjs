import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import net from "node:net";
import test from "node:test";
import { createControlPanelProxy, resolveGatewayTarget, rewritePanelPath } from "../src/proxy.mjs";

test("the install env URL selects the gateway host and port", () => {
  assert.deepEqual(
    resolveGatewayTarget({ OPENCLAW_GATEWAY_URL: "ws://127.0.0.1:18789" }),
    { gatewayHost: "127.0.0.1", gatewayPort: 18789 },
  );
  assert.deepEqual(
    resolveGatewayTarget({
      OPENCLAW_GATEWAY_URL: "ws://127.0.0.1:18789",
      OPENCLAW_GATEWAY_HOST: "gateway.internal",
      OPENCLAW_GATEWAY_PORT: "19000",
    }),
    { gatewayHost: "gateway.internal", gatewayPort: 19000 },
  );
});

test("the Mac /app prefix is the native Control UI root and other paths stay intact", () => {
  assert.equal(rewritePanelPath("/app/"), "/");
  assert.equal(rewritePanelPath("/app"), "/");
  assert.equal(rewritePanelPath("/app/chat?session=1"), "/chat?session=1");
  assert.equal(rewritePanelPath("/assets/index.js"), "/assets/index.js");
});

test("HTTP and WebSocket bytes pass through to the gateway unchanged", async () => {
  const seen = [];
  const upstream = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      seen.push({
        url: request.url,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end("<title>OpenClaw Control</title>");
    });
  });
  upstream.on("upgrade", (request, socket) => {
    seen.push({ url: request.url, upgrade: true });
    socket.end("HTTP/1.1 101 Switching Protocols\r\nConnection: close\r\n\r\n");
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const gatewayPort = upstream.address().port;
  const proxy = createControlPanelProxy({ gatewayPort });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const panelPort = proxy.address().port;
  try {
    const page = await fetch(`http://127.0.0.1:${panelPort}/app/`);
    assert.equal(await page.text(), "<title>OpenClaw Control</title>");
    const patch = JSON.stringify({
      key: "agent:boss:dashboard:fafcef26-5bb9-47da-82b2-fc48c6e3e9d9",
      expectedSessionId: "sess-boss-1",
      archived: true,
    });
    await fetch(`http://127.0.0.1:${panelPort}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: patch,
    });
    const echoed = await new Promise((resolve, reject) => {
      const socket = net.connect(panelPort, "127.0.0.1");
      const key = crypto.randomBytes(16).toString("base64");
      const timer = setTimeout(() => reject(new Error("upgrade timed out")), 2000);
      socket.on("data", (chunk) => {
        clearTimeout(timer);
        socket.destroy();
        resolve(chunk.toString("utf8"));
      });
      socket.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.on("connect", () => {
        socket.write(
          "GET / HTTP/1.1\r\n" +
            `Host: 127.0.0.1:${panelPort}\r\n` +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            `Sec-WebSocket-Key: ${key}\r\n` +
            "Sec-WebSocket-Version: 13\r\n\r\n",
        );
      });
    });
    assert.match(echoed, /101/);
    assert.deepEqual(
      seen.map((entry) => entry.url),
      ["/", "/rpc", "/"],
    );
    assert.equal(seen[1].body, patch);
  } finally {
    await new Promise((resolve) => proxy.close(resolve));
    await new Promise((resolve) => upstream.close(resolve));
  }
});
