const btn = document.getElementById("toggleBtn");
const statusText = document.getElementById("statusText");

function setUI(isPeeking) {
  if (isPeeking) {
    btn.textContent = "Stop Peeking";
    btn.classList.add("off");
    statusText.textContent = "AI can peek at this tab";
  } else {
    btn.textContent = "Let AI Peek";
    btn.classList.remove("off");
    statusText.textContent = "Not sharing";
  }
}

async function getState() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { activeTabId } = await chrome.storage.session.get("activeTabId");
  return { tab, isPeeking: activeTabId === tab.id };
}

// Show whether this tab is already shared when the popup opens
getState().then(({ isPeeking }) => setUI(isPeeking));

btn.addEventListener("click", async () => {
  const { tab, isPeeking } = await getState();

  btn.disabled = true;
  let response;
  try {
    response = await chrome.runtime.sendMessage({
      action: isPeeking ? "STOP_PEEK" : "START_PEEK",
      tabId: tab.id
    });
  } catch (err) {
    response = { ok: false, error: err.message };
  }
  btn.disabled = false;

  if (!response?.ok) {
    setUI(isPeeking);
    statusText.textContent = response
      ? `Can't share this tab: ${response.error}`
      : "TabPeek didn't respond. Reload the extension in chrome://extensions and try again.";
    return;
  }

  setUI(!isPeeking);
});
