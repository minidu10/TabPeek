import { hideSecrets } from "./secrets.js";

export const MAX_ERRORS = 20;
const MAX_MESSAGE_LENGTH = 2000;

export function formatArg(arg) {
  if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`;
  if (arg && typeof arg === "object") {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

function requestUrl(input) {
  if (typeof input === "string") return input;
  return input?.url ?? String(input);
}

// Hooks console.error, fetch, XMLHttpRequest, uncaught errors, and unhandled
// promise rejections on `win`. Safe to call more than once per page.
export function installErrorHooks(win) {
  win.__tabPeekErrors = win.__tabPeekErrors || [];
  if (win.__tabPeekHooked) return win.__tabPeekErrors;
  win.__tabPeekHooked = true;

  const errors = win.__tabPeekErrors;

  function save(type, message) {
    errors.push({
      type,
      message: hideSecrets(String(message)).slice(0, MAX_MESSAGE_LENGTH),
      time: new Date().toISOString()
    });
    if (errors.length > MAX_ERRORS) errors.shift();
  }

  // console.error(...)
  const originalConsoleError = win.console.error;
  win.console.error = function (...args) {
    save("CONSOLE_ERROR", args.map(formatArg).join(" "));
    return originalConsoleError.apply(this, args);
  };

  // fetch: HTTP errors (4xx/5xx) and network failures
  if (typeof win.fetch === "function") {
    const originalFetch = win.fetch;
    win.fetch = async function (...args) {
      let response;
      try {
        response = await originalFetch.apply(this, args);
      } catch (err) {
        save("NETWORK_ERROR", `fetch failed: ${requestUrl(args[0])} (${err?.message ?? err})`);
        throw err;
      }
      if (!response.ok) {
        save(
          "NETWORK_ERROR",
          `${response.status} ${response.statusText} at ${response.url || requestUrl(args[0])}`
        );
      }
      return response;
    };
  }

  // XMLHttpRequest: HTTP errors (4xx/5xx) and network failures
  const XHR = win.XMLHttpRequest;
  if (XHR?.prototype) {
    const originalOpen = XHR.prototype.open;
    const originalSend = XHR.prototype.send;

    XHR.prototype.open = function (method, url, ...rest) {
      this.__tabPeekRequest = { method: String(method).toUpperCase(), url: String(url) };
      return originalOpen.call(this, method, url, ...rest);
    };

    XHR.prototype.send = function (...args) {
      const { method, url } = this.__tabPeekRequest || { method: "GET", url: "(unknown)" };
      this.addEventListener("load", () => {
        if (this.status >= 400) {
          save(
            "NETWORK_ERROR",
            `${this.status} ${this.statusText} at ${this.responseURL || url} (XHR ${method})`
          );
        }
      });
      this.addEventListener("error", () => {
        save("NETWORK_ERROR", `XHR ${method} ${url} failed (network error)`);
      });
      return originalSend.apply(this, args);
    };
  }

  // Uncaught exceptions
  win.addEventListener("error", (event) => {
    save(
      "UNCAUGHT_ERROR",
      event.error?.stack || `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`
    );
  });

  // Rejected promises nobody handled
  win.addEventListener("unhandledrejection", (event) => {
    save("UNHANDLED_REJECTION", formatArg(event.reason));
  });

  return errors;
}
