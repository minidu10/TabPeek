import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanMarkdown, htmlToMarkdown } from "../lib/markdown.js";

test("converts headings and paragraphs", () => {
  const md = htmlToMarkdown("<h1>Title</h1><p>Hello <strong>world</strong></p>");
  assert.equal(md, "# Title\n\nHello **world**");
});

test("drops links with no visible text", () => {
  const md = htmlToMarkdown('<p>Start</p><a href="/icon-only"><span></span></a><p>End</p>');
  assert.ok(!md.includes("/icon-only"), md);
  assert.ok(!md.includes("[]"), md);
});

test("keeps links on one line even when they wrap block elements", () => {
  const md = htmlToMarkdown('<a href="/deals"><div>Flash</div><div>Deals</div></a>');
  assert.equal(md, "[Flash Deals](/deals)");
});

test("compacts list items", () => {
  const md = htmlToMarkdown('<ul><li><a href="/a">  Mens Apparel  </a></li><li>Shoes</li></ul>');
  assert.equal(md, "- [Mens Apparel](/a)\n- Shoes");
});

test("collapses blank lines and trailing spaces", () => {
  assert.equal(cleanMarkdown("a   \n\n\n\n\nb  \n"), "a\n\nb");
});
