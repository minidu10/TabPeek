const SERVER_URL = "ws://127.0.0.1:54321";
const SYNC_INTERVAL_MS = 5000;

let socket = null;
let activeTabId = null;
let syncTimer = null;

// Chrome can shut this worker down at any time, so the shared tab is kept in
// session storage and restored when the worker starts again.
const ready = chrome.storage.session.get("activeTabId").then(({ activeTabId: stored }) => {
  if (stored != null) {
    activeTabId = stored;
    startSync();
  }
});

// ---------- Badge ----------

async function setBadge(tabId) {
  await chrome.action.setBadgeText({ tabId, text: "ON" });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#10b981" });
}

async function clearBadge(tabId) {
  try {
    await chrome.action.setBadgeText({ tabId, text: "" });
  } catch {
    // The tab is already closed
  }
}

// ---------- Page script ----------

function injectTabPeek(tabId) {
  return chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    files: ["dist/content.js"]
  });
}

async function readPayload(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => (window.__getTabPeekPayload ? window.__getTabPeekPayload() : null)
  });
  return results[0]?.result ?? null;
}

// ---------- WebSocket ----------

function isConnected() {
  return socket && socket.readyState === WebSocket.OPEN;
}

function connectWebSocket() {
  if (socket && socket.readyState === WebSocket.CONNECTING) return;

  const ws = new WebSocket(SERVER_URL);
  socket = ws;

  ws.onopen = () => {
    console.log("Connected to local TabPeek Server!");
    sendSnapshot();
  };

  ws.onclose = () => {
    if (socket === ws) socket = null;
  };

  // A failed connection also fires onclose; the sync timer retries it.
  ws.onerror = () => {};
}

async function sendSnapshot() {
  if (activeTabId === null) return;

  // Retries the connection every tick until the server is running
  if (!isConnected()) {
    connectWebSocket();
    return;
  }

  const tabId = activeTabId;
  try {
    let payload = await readPayload(tabId);

    // The page reloaded or navigated and lost the script, so add it again
    if (!payload) {
      await injectTabPeek(tabId);
      payload = await readPayload(tabId);
    }

    if (payload && tabId === activeTabId && isConnected()) {
      socket.send(JSON.stringify({ type: "TAB_UPDATE", payload }));
    }
  } catch (err) {
    console.warn("TabPeek sync error:", err.message);
  }
}

// ---------- Start / stop ----------

function startSync() {
  clearInterval(syncTimer);
  syncTimer = setInterval(sendSnapshot, SYNC_INTERVAL_MS);
  sendSnapshot();
}

async function startPeek(tabId) {
  await ready;

  // Throws on pages Chrome does not allow scripts on (chrome://, Web Store, ...)
  await injectTabPeek(tabId);

  // Only one tab is shared at a time
  if (activeTabId !== null && activeTabId !== tabId) await clearBadge(activeTabId);

  activeTabId = tabId;
  await chrome.storage.session.set({ activeTabId: tabId });
  await setBadge(tabId);
  startSync();
}

async function stopPeek() {
  await ready;

  const tabId = activeTabId;
  activeTabId = null;
  clearInterval(syncTimer);
  await chrome.storage.session.remove("activeTabId");
  if (tabId !== null) await clearBadge(tabId);

  if (socket) {
    // Tell the server to forget the last snapshot
    if (isConnected()) socket.send(JSON.stringify({ type: "TAB_STOP" }));
    socket.close();
    socket = null;
  }
}

// ---------- Events ----------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  let task = null;
  if (message.action === "START_PEEK") task = startPeek(message.tabId);
  if (message.action === "STOP_PEEK") task = stopPeek();
  if (!task) return false;

  task.then(
    () => sendResponse({ ok: true }),
    (err) => sendResponse({ ok: false, error: err.message })
  );
  return true; // keep the channel open for the async response
});

// Re-inject the page script and badge after the shared tab reloads or navigates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  await ready;
  if (tabId !== activeTabId || changeInfo.status !== "complete") return;

  await setBadge(tabId);
  try {
    await injectTabPeek(tabId);
    sendSnapshot();
  } catch (err) {
    console.warn("TabPeek can't run on this page:", err.message);
  }
});

// Stop sharing when the shared tab is closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await ready;
  if (tabId === activeTabId) await stopPeek();
});
