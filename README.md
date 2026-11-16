# 👀 TabPeek — 1-Click Browser Context Bridge for AI Coding Tools

**TabPeek** lets your local AI coding assistant (VS Code, Cursor, Claude Code, Windsurf) safely read your active browser tab and live console errors using the **Model Context Protocol (MCP)**.

No API keys, no headless browser bots getting blocked by 2FA, and no messy copy-pasting.

---

## 🚀 The Problem It Solves

AI coding tools are great at reading local code files, but they are completely blind to private pages open in your browser (such as AWS dashboards, Supabase tables, internal docs, or localhost web apps).

**TabPeek fixes this in one click:**

* **Bypasses Login Walls:** Works right inside your logged-in Chrome tab with zero extra logins or API keys needed.
* **Strips HTML Junk:** Converts noisy DOM pages into clean Markdown using `Turndown` to save AI tokens.
* **Catches Live Errors:** Automatically captures `console.error` logs and failed `fetch` network requests (`4xx` and `5xx`).
* **Built-In Secret Masking:** Scrubs AWS keys (`AKIA...`), JWTs, and API tokens inside the browser before they ever reach the AI.

---

## 🏗️ System Architecture

```text
[Logged-In Chrome Tab] 
       │  (1. Cleans HTML to Markdown & Masks Secrets)
       ▼
[TabPeek MV3 Extension] 
       │  (2. Streams via Local WebSocket ws://localhost:54321)
       ▼
[Node.js MCP Bridge Server] 
       │  (3. Exposes MCP Tools over stdio)
       ▼
[VS Code / Cursor / Claude Code]
```

---

## 📂 Project Folder Structure

```text
tabpeek/
├── tabpeek-extension/       # Chrome Manifest V3 Extension
│   ├── dist/
│   │   └── content.js       # Bundled page cleaner & error catcher
│   ├── background.js        # WebSocket client & keepalive worker
│   ├── content.js           # Turndown HTML cleaner & secret masker
│   ├── manifest.json        # Extension permissions & config
│   ├── popup.html           # 1-click toggle UI
│   └── popup.js             # Tab badge & script injection logic
├── tabpeek-server/          # Local Node.js MCP Server
│   ├── server.js            # WebSocket listener + MCP stdio tools
│   └── package.json         # Server dependencies (ws, @modelcontextprotocol/sdk)
├── .gitignore
└── README.md
```

---

## 🛠️ Tech Stack

* **Browser Extension:** Chrome Manifest V3, JavaScript, Turndown, esbuild
* **Local Data Pipe:** Node.js, WebSockets (`ws`)
* **AI Protocol:** `@modelcontextprotocol/sdk` (MCP `stdio` transport), Zod

---

## ⚡ Quick Start Guide

### Step 1: Set Up the Chrome Extension

Open your terminal and bundle the extension script:

```bash
cd tabpeek-extension
npm install
npx esbuild content.js --bundle --outfile=dist/content.js
```

Load the extension into Chrome:

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** in the top right corner.
3. Click **Load unpacked** and select the `tabpeek-extension` folder.

### Step 2: Set Up the MCP Server

Install the required packages inside the server folder:

```bash
cd ../tabpeek-server
npm install
```

### Step 3: Connect to VS Code (or Cursor)

Create a `.vscode/mcp.json` file in your project and point it to your `server.js` file:

```json
{
  "servers": {
    "tabpeek": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/Users/ASUS/Desktop/tabpeek-server/server.js"]
    }
  }
}
```

Click **Start** right above `"tabpeek"` in `.vscode/mcp.json`, switch VS Code Chat to **Agent** mode, and ask:

> *"Use TabPeek to read my active browser tab and check for any console errors."*

---

## 🧰 Available MCP Tools

| Tool Name | Description |
| :--- | :--- |
| `peek_active_tab` | Returns the page title, URL, and clean Markdown text of the shared browser tab. |
| `peek_tab_errors` | Returns the latest 20 console errors and failed network calls from the tab. |

---

## 🔒 Privacy & Security

* **Opt-In Per Tab:** Your AI can only see the single tab where you click **"Let AI Peek"**.
* **100% Local Pipe:** All data stays on your machine over `ws://localhost:54321` with zero third-party cloud servers.
* **Automatic Redaction:** Password inputs (`<input type="password">`), JWTs, AWS keys, and secret tokens are automatically replaced with `[HIDDEN_...]`.