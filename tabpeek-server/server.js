import { WebSocketServer } from "ws";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// The extension always connects to 54321; TABPEEK_PORT exists for tests.
const PORT = Number(process.env.TABPEEK_PORT) || 54321;
// Optional: pin the server to your own extension ID (see chrome://extensions).
// When unset, any Chrome extension origin is accepted, but web pages are not.
const ALLOWED_EXTENSION_ID = process.env.TABPEEK_EXTENSION_ID;

const NO_TAB_MESSAGE = "No tab is shared right now. Click 'Let AI Peek' in Chrome first.";

// Shape of the messages the extension is allowed to send
const TabPayload = z.object({
  title: z.string(),
  url: z.string(),
  markdown: z.string(),
  errors: z
    .array(z.object({ type: z.string(), message: z.string(), time: z.string() }))
    .max(50)
});

const ExtensionMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("TAB_UPDATE"), payload: TabPayload }),
  z.object({ type: z.literal("TAB_STOP") })
]);

let latestTabData = null;
let dataSource = null; // the socket that sent latestTabData

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_EXTENSION_ID) return origin === `chrome-extension://${ALLOWED_EXTENSION_ID}`;
  return origin.startsWith("chrome-extension://");
}

function clearTabData() {
  latestTabData = null;
  dataSource = null;
}

// 1. Start the WebSocket pipe for your Chrome Extension (local machine only)
const wss = new WebSocketServer({
  host: "127.0.0.1",
  port: PORT,
  maxPayload: 5 * 1024 * 1024,
  // Browsers always send an Origin header, so this stops normal websites
  // from connecting and feeding fake page content to your AI.
  verifyClient: ({ origin }) => {
    const allowed = isAllowedOrigin(origin);
    if (!allowed) console.error(`Rejected connection from origin: ${origin || "(none)"}`);
    return allowed;
  }
});

wss.on("listening", () => {
  console.error(`TabPeek waiting for Chrome on ws://127.0.0.1:${PORT} ...`);
});

wss.on("connection", (ws) => {
  console.error("Chrome Extension connected to TabPeek!");

  ws.on("message", (rawMessage) => {
    let parsed;
    try {
      parsed = ExtensionMessage.safeParse(JSON.parse(rawMessage.toString()));
    } catch {
      console.error("Ignored a message that is not valid JSON.");
      return;
    }

    if (!parsed.success) {
      console.error("Ignored a message with an unexpected shape.");
      return;
    }

    const message = parsed.data;
    if (message.type === "TAB_UPDATE") {
      latestTabData = message.payload;
      dataSource = ws;
      console.error(
        `Live Update: ${latestTabData.title} | Errors: ${latestTabData.errors.length}`
      );
    } else if (message.type === "TAB_STOP") {
      clearTabData();
      console.error("Tab sharing stopped.");
    }
  });

  // When the extension disconnects, stop serving its last snapshot
  ws.on("close", () => {
    if (dataSource === ws) clearTabData();
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
});

wss.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Is another TabPeek server running?`);
  } else {
    console.error("WebSocket server error:", err.message);
  }
});

// 2. Create the MCP Server for AI coding tools
const mcpServer = new McpServer({
  name: "TabPeek",
  version: "1.0.0"
});

function textResult(text) {
  return { content: [{ type: "text", text }] };
}

// AI Tool 1: Read the clean page text
mcpServer.tool(
  "peek_active_tab",
  "Read the title, URL, and clean Markdown text of the browser tab shared with TabPeek.",
  {},
  async () => {
    if (!latestTabData) return textResult(NO_TAB_MESSAGE);

    return textResult(
      `# ${latestTabData.title}\nURL: ${latestTabData.url}\n\n${latestTabData.markdown}`
    );
  }
);

// AI Tool 2: Read the live console and network errors
mcpServer.tool(
  "peek_tab_errors",
  "Get the latest console errors and failed network requests from the shared browser tab.",
  {},
  async () => {
    if (!latestTabData) return textResult(NO_TAB_MESSAGE);

    return textResult(JSON.stringify(latestTabData.errors, null, 2));
  }
);

// 3. Connect the server to your AI coding editor
const transport = new StdioServerTransport();
await mcpServer.connect(transport);
