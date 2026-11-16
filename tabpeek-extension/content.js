import { hideSecrets } from "./lib/secrets.js";
import { htmlToMarkdown, MAX_MARKDOWN_LENGTH } from "./lib/markdown.js";
import { installErrorHooks } from "./lib/errors.js";

// Elements that are noise for the AI, or must never be shared
const JUNK_SELECTORS =
  "script, style, noscript, svg, img, header, nav, footer, iframe, input[type='password']";

function grabCleanPageMarkdown() {
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll(JUNK_SELECTORS).forEach((el) => el.remove());

  // Hide secrets before truncating, so a cut can never split a secret
  // into a piece the patterns no longer recognize.
  const markdown = hideSecrets(htmlToMarkdown(clone.innerHTML)).slice(0, MAX_MARKDOWN_LENGTH);

  return {
    title: hideSecrets(document.title),
    url: hideSecrets(window.location.href),
    markdown
  };
}

installErrorHooks(window);

window.__getTabPeekPayload = () => ({
  ...grabCleanPageMarkdown(),
  errors: [...window.__tabPeekErrors]
});
