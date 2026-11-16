import TurndownService from "turndown";

export const MAX_MARKDOWN_LENGTH = 15000;

function createTurndown() {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-"
  });

  // Links: keep them on one line and drop links with no visible text
  // (icon-only links waste tokens and tell the AI nothing).
  turndown.addRule("compactLinks", {
    filter: (node) => node.nodeName === "A" && node.getAttribute("href"),
    replacement: (content, node) => {
      const text = content.replace(/\s+/g, " ").trim();
      if (!text) return "";
      return `[${text}](${node.getAttribute("href")})`;
    }
  });

  return turndown;
}

// Remove blank-line runs and trailing spaces left over from the HTML layout
export function cleanMarkdown(markdown) {
  return markdown
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/^([-*]|\d+\.)\s{2,}/gm, "$1 ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function htmlToMarkdown(html) {
  return cleanMarkdown(createTurndown().turndown(html));
}
