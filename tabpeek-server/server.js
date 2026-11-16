import { WebSocketServer } from "ws";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

let latestTabData = null;

// 1. Start the WebSocket pipe for your Chrome Extension
const wss = new WebSocketServer({ port: 54321 });
console.error("TabPeek waiting for Chrome on ws://localhost:54321 ...");

wss.on("connection", (ws) => {
  console.error("Chrome Extension connected to TabPeek!");

  ws.on("message", (rawMessage) => {
    const data = JSON.parse(rawMessage.toString());
    if (data.type === "TAB_UPDATE") {
      latestTabData = data.payload;
      console.error(
        `Live Update: ${latestTabData.title} | Errors: ${latestTabData.errors.length}`
      );
    }
  });
});

wss.on("error", (err) => {
  console.error("Port warning:", err.message);
});

// 2. Create the MCP Server for AI coding tools
const mcpServer = new McpServer({
  name: "TabPeek",
  version: "1.0.0"
});

// AI Tool 1: Read the clean page text
mcpServer.tool(
  "peek_active_tab",
  "Read the title, URL, and clean Markdown text of the browser tab shared with TabPeek.",
  {},
  async () => {
    if (!latestTabData) {
      return {
        content: [
          {
            type: "text",
            text: "No tab is shared right now. Click 'Let AI Peek' in Chrome first."
          }
        ]
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `# ${latestTabData.title}\nURL: ${latestTabData.url}\n\n${latestTabData.markdown}`
        }
      ]
    };
  }
);

// AI Tool 2: Read the live console and network errors
mcpServer.tool(
  "peek_tab_errors",
  "Get the latest console errors and failed network requests from the shared browser tab.",
  {},
  async () => {
    if (!latestTabData) {
      return {
        content: [
          {
            type: "text",
            text: "No tab is shared right now. Click 'Let AI Peek' in Chrome first."
          }
        ]
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(latestTabData.errors, null, 2)
        }
      ]
    };
  }
);

// 3. Connect the server to your AI coding editor
const transport = new StdioServerTransport();
await mcpServer.connect(transport);
