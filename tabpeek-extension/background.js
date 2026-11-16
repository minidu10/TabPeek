let socket = null;
let activeTabId = null;
let syncTimer = null;

function connectWebSocket() {
  socket = new WebSocket("ws://localhost:54321");

  socket.onopen = () => {
    console.log("Connected to local TabPeek Server!");
    sendSnapshot();
  };

  socket.onclose = () => {
    socket = null;
  };
}

async function sendSnapshot() {
  if (!activeTabId || !socket || socket.readyState !== WebSocket.OPEN) return;

  try {
    // Grab the latest Markdown and errors from the webpage
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      world: "MAIN",
      func: () => (window.__getTabPeekPayload ? window.__getTabPeekPayload() : null)
    });

    const payload = results[0]?.result;
    if (payload) {
      socket.send(JSON.stringify({ type: "TAB_UPDATE", payload }));
    }
  } catch (err) {
    console.error("TabPeek sync error:", err);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "START_PEEK") {
    activeTabId = message.tabId;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      connectWebSocket();
    } else {
      sendSnapshot();
    }

    // Send fresh data every 5 seconds and keep Chrome worker awake
    clearInterval(syncTimer);
    syncTimer = setInterval(sendSnapshot, 5000);
  }

  if (message.action === "STOP_PEEK") {
    activeTabId = null;
    clearInterval(syncTimer);
    if (socket) socket.close();
  }
});
