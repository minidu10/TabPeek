import TurndownService from "turndown";

// Scrub API keys, JWT tokens, and cloud secrets from text
function hideSecrets(text) {
  if (!text) return "";

  return text
    // 1. Hide JWT and Supabase tokens (start with eyJ...)
    .replace(/eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g, "[HIDDEN_JWT_TOKEN]")
    // 2. Hide AWS Access Keys (start with AKIA...)
    .replace(/AKIA[0-9A-Z]{16}/g, "[HIDDEN_AWS_KEY]")
    // 3. Hide GitHub, OpenAI, and Stripe secret keys
    .replace(/\b(ghp_|sk-|rk_live_|pk_live_)[A-Za-z0-9_\-]{16,}\b/g, "[HIDDEN_API_KEY]")
    // 4. Hide generic bearer tokens or password strings
    .replace(/(bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, "$1[HIDDEN_TOKEN]");
}

function grabCleanPageMarkdown() {
  const clone = document.body.cloneNode(true);

  const junkSelectors =
    "script, style, noscript, svg, img, header, nav, footer, iframe, input[type='password']";
  clone.querySelectorAll(junkSelectors).forEach((el) => el.remove());

  const turndownService = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced"
  });

  const rawMarkdown = turndownService.turndown(clone.innerHTML);

  return {
    title: document.title,
    url: window.location.href,
    markdown: hideSecrets(rawMarkdown.slice(0, 15000))
  };
}

// Keep the last 20 errors on the window
window.__tabPeekErrors = window.__tabPeekErrors || [];

function saveError(type, message) {
  window.__tabPeekErrors.push({
    type,
    message: hideSecrets(message),
    time: new Date().toISOString()
  });
  if (window.__tabPeekErrors.length > 20) {
    window.__tabPeekErrors.shift();
  }
}

if (!window.__tabPeekHooked) {
  window.__tabPeekHooked = true;

  const originalConsoleError = console.error;
  console.error = (...args) => {
    saveError("CONSOLE_ERROR", args.map(String).join(" "));
    originalConsoleError.apply(console, args);
  };

  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (!response.ok) {
      saveError("NETWORK_ERROR", `${response.status} ${response.statusText} at ${response.url}`);
    }
    return response;
  };
}

window.__getTabPeekPayload = () => ({
  ...grabCleanPageMarkdown(),
  errors: window.__tabPeekErrors
});