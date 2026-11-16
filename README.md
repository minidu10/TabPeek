# 👀 TabPeek

**Let your AI coding assistant see the browser tab you're looking at.**

TabPeek is a Chrome extension plus a local [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server. Click **Let AI Peek** on any tab, and Claude Code, VS Code, Cursor, or any MCP client can read that page as clean Markdown, along with its live console errors and failed network requests.

It works inside your real, logged-in browser, so there are no API keys, no headless bots, and no copy-pasting.

[![Tests](https://github.com/minidu10/TabPeek/actions/workflows/test.yml/badge.svg)](https://github.com/minidu10/TabPeek/actions/workflows/test.yml)

---

## Why

AI coding tools can read your files but are blind to your browser: the localhost app you're debugging, an internal dashboard, a Supabase table, docs behind a login. TabPeek gives them a read-only window into **one tab you choose**.

- **Works behind logins.** It reads the tab you already have open, so 2FA and SSO are not a problem.
- **Saves tokens.** Pages are converted to compact Markdown. Scripts, styles, images, navigation, and icon-only links are stripped.
- **Catches real errors.** Console errors, uncaught exceptions, unhandled promise rejections, and failed `fetch`/`XMLHttpRequest` calls, with stack traces.
- **Hides secrets in the browser.** API keys and tokens are masked before anything leaves the page.
- **Stays local.** Data goes from Chrome to a server on `127.0.0.1` and on to your editor. Nothing is sent to a third party.

---

## How it works

```text
┌──────────────────────────┐
│  Chrome tab you shared   │  page → Markdown, secrets masked, errors recorded
└────────────┬─────────────┘
             │ snapshot every 5 s
             ▼
┌──────────────────────────┐
│  TabPeek extension (MV3) │  WebSocket client, reconnects automatically
└────────────┬─────────────┘
             │ ws://127.0.0.1:54321 (extension origins only)
             ▼
┌──────────────────────────┐
│  TabPeek MCP server      │  validates messages, holds the latest snapshot
└────────────┬─────────────┘
             │ MCP over stdio
             ▼
┌──────────────────────────┐
│  Claude Code / VS Code / │
│  Cursor / any MCP client │
└──────────────────────────┘
```

Your editor starts the MCP server. The extension connects to it and sends a fresh snapshot of the shared tab every 5 seconds. When you stop sharing, close the tab, or the extension disconnects, the server forgets the snapshot immediately.

---

## Quick start

Requires **Node.js 22+** and **Google Chrome** (or another Chromium browser).

### 1. Get the code and install the server

```bash
git clone https://github.com/minidu10/TabPeek.git
cd TabPeek/tabpeek-server
npm install
```

### 2. Load the extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `tabpeek-extension` folder.

The extension ships with a prebuilt `dist/content.js`, so no build step is needed.

### 3. Connect your editor

Use the full path to `tabpeek-server/server.js` on your machine.

**Claude Code**

```bash
claude mcp add tabpeek -- node /path/to/TabPeek/tabpeek-server/server.js
```

**VS Code** — `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "tabpeek": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/TabPeek/tabpeek-server/server.js"]
    }
  }
}
```

Click **Start** above `"tabpeek"`, then switch Copilot Chat to **Agent** mode.

**Cursor** — `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "tabpeek": {
      "command": "node",
      "args": ["/path/to/TabPeek/tabpeek-server/server.js"]
    }
  }
}
```

### 4. Share a tab and ask

Open the page, click the TabPeek icon, and press **Let AI Peek**. The icon shows a green **ON** badge. Then ask your assistant:

> *"Use TabPeek to read my browser tab and check it for errors."*

Press **Stop Peeking** at any time to stop sharing.

---

## MCP tools

| Tool | Returns |
| :--- | :--- |
| `peek_active_tab` | Title, URL, and Markdown content of the shared tab (up to 15,000 characters). |
| `peek_tab_errors` | The latest 20 errors from the shared tab, as JSON. |

### Captured errors

| Type | Source |
| :--- | :--- |
| `CONSOLE_ERROR` | `console.error(...)` calls, including `Error` stack traces |
| `UNCAUGHT_ERROR` | Exceptions nobody caught |
| `UNHANDLED_REJECTION` | Rejected promises with no handler |
| `NETWORK_ERROR` | `fetch` and `XMLHttpRequest` calls that returned 4xx/5xx or failed to connect |

Each entry has `type`, `message`, and an ISO `time`.

---

## Privacy and security

- **Opt-in, one tab at a time.** The AI only sees the tab where you pressed **Let AI Peek**. Sharing a new tab stops sharing the previous one.
- **Read-only.** TabPeek never clicks, types, or navigates.
- **Nothing left behind.** The server drops the snapshot as soon as you stop sharing, close the tab, or the extension disconnects.
- **Websites can't connect.** The server listens only on `127.0.0.1` and rejects any WebSocket connection that doesn't come from a Chrome extension, so a page you visit can't feed fake content to your AI.
- **Secrets are masked in the browser**, in page text, the title, the URL, and error messages:

| Masked | Replaced with |
| :--- | :--- |
| JWTs (incl. Supabase tokens) | `[HIDDEN_JWT_TOKEN]` |
| AWS access keys (`AKIA…`, `ASIA…`) | `[HIDDEN_AWS_KEY]` |
| GitHub, OpenAI, Stripe, Slack, and Google API keys | `[HIDDEN_API_KEY]` |
| `Bearer …` tokens | `Bearer [HIDDEN_TOKEN]` |
| `token=`, `api_key=`, `secret=`, `password=`… in URLs | `[HIDDEN]` |

Password inputs are removed before the page is converted.

Masking is pattern-based. It catches common key formats, not every possible secret, so only share tabs you're comfortable showing your AI.

### Lock the server to your extension

By default the server accepts any Chrome extension. To accept only yours, copy its ID from `chrome://extensions` and set `TABPEEK_EXTENSION_ID`:

```bash
claude mcp add tabpeek -e TABPEEK_EXTENSION_ID=your_extension_id -- node /path/to/TabPeek/tabpeek-server/server.js
```

In VS Code or Cursor, add `"env": { "TABPEEK_EXTENSION_ID": "your_extension_id" }` to the server entry.

---

## Troubleshooting

| Problem | Fix |
| :--- | :--- |
| AI says *"No tab is shared right now"* | Press **Let AI Peek** on the tab and make sure your editor has started the MCP server. The extension retries every 5 seconds, so the first snapshot can take a moment. |
| Popup says *"TabPeek didn't respond"* | Reload the extension in `chrome://extensions`. |
| Popup says *"Can't share this tab"* | Chrome blocks extensions on `chrome://` pages, the Chrome Web Store, and some other built-in pages. |
| Server log says *"Port 54321 is already in use"* | Another TabPeek server is running. Close the other editor session or stop that process. |
| Errors seem to be missing | Errors are recorded from the moment you press **Let AI Peek**, and again from the start of each reload. Reload the page after sharing to capture load-time errors. |

To see the extension's own logs, click **service worker** on the TabPeek card in `chrome://extensions`.

---

## Development

```text
TabPeek/
├── tabpeek-extension/          Chrome Manifest V3 extension
│   ├── background.js           WebSocket client, sync loop, tab lifecycle
│   ├── popup.html / popup.js   Share / stop button
│   ├── content.js              Page script entry (bundled into dist/)
│   ├── lib/
│   │   ├── secrets.js          Secret masking
│   │   ├── markdown.js         HTML → compact Markdown (Turndown)
│   │   └── errors.js           console / fetch / XHR / uncaught error hooks
│   ├── dist/content.js         Bundled page script (committed)
│   ├── test/                   Unit tests
│   └── manifest.json
├── tabpeek-server/
│   ├── server.js               WebSocket bridge + MCP stdio server
│   └── test/                   Integration tests against the real server
└── .github/workflows/test.yml  CI on Node 22 and 24
```

### Build the page script

Rebuild `dist/content.js` after changing `content.js` or anything in `lib/`, then reload the extension:

```bash
cd tabpeek-extension
npm install
npm run build
```

### Run the tests

```bash
cd tabpeek-extension && npm install && npm test
cd ../tabpeek-server && npm install && npm test
```

The server tests start `server.js` on spare ports through `TABPEEK_PORT`, so they can run while your normal TabPeek server is active. The extension always connects to port `54321`.

---

## Tech stack

- **Extension:** Chrome Manifest V3, Turndown, esbuild
- **Server:** Node.js, `ws`, `@modelcontextprotocol/sdk`, Zod
- **Tests:** `node:test`, GitHub Actions
