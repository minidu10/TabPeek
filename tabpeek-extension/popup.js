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

// Check if this tab is already ON when the popup opens
chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
  const badge = await chrome.action.getBadgeText({ tabId: tab.id });
  setUI(badge === "ON");
});

btn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentBadge = await chrome.action.getBadgeText({ tabId: tab.id });
  const isPeeking = currentBadge !== "ON";

  if (isPeeking) {
    chrome.action.setBadgeText({ tabId: tab.id, text: "ON" });
    chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#10b981" });
    setUI(true);

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      files: ["dist/content.js"]
    });

    chrome.runtime.sendMessage({ action: "START_PEEK", tabId: tab.id });
  } else {
    chrome.action.setBadgeText({ tabId: tab.id, text: "" });
    setUI(false);
    chrome.runtime.sendMessage({ action: "STOP_PEEK" });
  }
});
