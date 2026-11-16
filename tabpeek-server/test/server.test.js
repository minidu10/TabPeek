import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER_PATH = fileURLToPath(new URL("../server.js", import.meta.url));
const NO_TAB = "No tab is shared right now. Click 'Let AI Peek' in Chrome first.";
const EXTENSION_ORIGIN = "chrome-extension://abcdefghijklmnop";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Start server.js as a real MCP server, exactly like an editor would
async function startServer(port, extraEnv = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_PATH],
    env: { ...process.env, TABPEEK_PORT: String(port), ...extraEnv },
    stderr: "pipe"
  });
  const client = new Client({ name: "tabpeek-test", version: "1.0.0" });
  await client.connect(transport);
  return { client, port };
}

// Resolves with an open socket, or with null if the server refused it
function openSocket(port, origin) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, origin ? { origin } : {});
    ws.on("open", () => resolve(ws));
    ws.on("error", () => resolve(null));
  });
}

async function openSocketWithRetry(port, origin) {
  for (let i = 0; i < 20; i++) {
    const ws = await openSocket(port, origin);
    if (ws) return ws;
    await wait(100);
  }
  return null;
}

async function callText(client, name) {
  const result = await client.callTool({ name, arguments: {} });
  return result.content[0].text;
}

async function send(ws, message) {
  ws.send(typeof message === "string" ? message : JSON.stringify(message));
  await wait(100);
}

const samplePayload = {
  title: "Checkout",
  url: "http://localhost:3000/checkout",
  markdown: "# Checkout\n\nTotal: $42",
  errors: [{ type: "CONSOLE_ERROR", message: "Cart is undefined", time: "2026-11-16T00:00:00.000Z" }]
};

let server;

before(async () => {
  server = await startServer(54391);
  // Wait until the WebSocket side is listening
  const ws = await openSocketWithRetry(server.port, EXTENSION_ORIGIN);
  assert.ok(ws, "server did not start listening");
  ws.close();
  await wait(100);
});

after(async () => {
  await server.client.close();
});

test("lists both MCP tools", async () => {
  const { tools } = await server.client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["peek_active_tab", "peek_tab_errors"]);
});

test("reports that no tab is shared before the extension sends anything", async () => {
  assert.equal(await callText(server.client, "peek_active_tab"), NO_TAB);
  assert.equal(await callText(server.client, "peek_tab_errors"), NO_TAB);
});

test("rejects connections from websites", async () => {
  assert.equal(await openSocket(server.port, "https://evil.example"), null);
});

test("rejects connections without an origin", async () => {
  assert.equal(await openSocket(server.port), null);
});

test("serves the page and errors the extension sends", async () => {
  const ws = await openSocket(server.port, EXTENSION_ORIGIN);
  assert.ok(ws, "extension origin should be accepted");

  await send(ws, { type: "TAB_UPDATE", payload: samplePayload });

  assert.equal(
    await callText(server.client, "peek_active_tab"),
    "# Checkout\nURL: http://localhost:3000/checkout\n\n# Checkout\n\nTotal: $42"
  );
  assert.deepEqual(
    JSON.parse(await callText(server.client, "peek_tab_errors")),
    samplePayload.errors
  );

  ws.close();
  await wait(100);
});

test("ignores invalid messages without crashing or losing data", async () => {
  const ws = await openSocket(server.port, EXTENSION_ORIGIN);
  await send(ws, { type: "TAB_UPDATE", payload: samplePayload });

  await send(ws, "this is not json");
  await send(ws, { type: "TAB_UPDATE", payload: { title: 123 } });
  await send(ws, { type: "SOMETHING_ELSE" });

  assert.match(await callText(server.client, "peek_active_tab"), /^# Checkout/);

  ws.close();
  await wait(100);
});

test("forgets the page when sharing stops", async () => {
  const ws = await openSocket(server.port, EXTENSION_ORIGIN);
  await send(ws, { type: "TAB_UPDATE", payload: samplePayload });
  await send(ws, { type: "TAB_STOP" });

  assert.equal(await callText(server.client, "peek_active_tab"), NO_TAB);

  ws.close();
  await wait(100);
});

test("forgets the page when the extension disconnects", async () => {
  const ws = await openSocket(server.port, EXTENSION_ORIGIN);
  await send(ws, { type: "TAB_UPDATE", payload: samplePayload });
  ws.close();
  await wait(200);

  assert.equal(await callText(server.client, "peek_active_tab"), NO_TAB);
});

test("TABPEEK_EXTENSION_ID allows only that extension", async () => {
  const pinned = await startServer(54392, { TABPEEK_EXTENSION_ID: "myextensionid" });
  try {
    const mine = await openSocketWithRetry(pinned.port, "chrome-extension://myextensionid");
    assert.ok(mine, "the pinned extension should be accepted");
    mine.close();

    assert.equal(await openSocket(pinned.port, EXTENSION_ORIGIN), null);
  } finally {
    await pinned.client.close();
  }
});
