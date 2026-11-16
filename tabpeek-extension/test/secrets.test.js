import { test } from "node:test";
import assert from "node:assert/strict";
import { hideSecrets } from "../lib/secrets.js";

// Fake keys are joined at runtime so secret scanners (like GitHub push
// protection) don't mistake this test file for leaked credentials.
const fake = (...parts) => parts.join("");

const cases = [
  ["JWT", fake("token eyJhbGciOiJIUzI1NiJ9", ".eyJzdWIiOiIxMjM0In0", ".abc_DEF-123"), "[HIDDEN_JWT_TOKEN]"],
  ["AWS long-term key", fake("key AKIA", "IOSFODNN7EXAMPLE here"), "[HIDDEN_AWS_KEY]"],
  ["AWS temporary key", fake("key ASIA", "IOSFODNN7EXAMPLE here"), "[HIDDEN_AWS_KEY]"],
  ["GitHub token", fake("ghp_", "abcdefghijklmnopqrstuvwxyz0123456789"), "[HIDDEN_API_KEY]"],
  ["GitHub fine-grained token", fake("github_pat_", "11ABCDEFG0123456789_abcdefghij"), "[HIDDEN_API_KEY]"],
  ["OpenAI key", fake("sk-", "proj-abcdefghijklmnopqrstuvwx"), "[HIDDEN_API_KEY]"],
  ["Stripe secret key", fake("sk_", "live_", "abcdefghijklmnopqrstuvwx"), "[HIDDEN_API_KEY]"],
  ["Stripe test key", fake("sk_", "test_", "abcdefghijklmnopqrstuvwx"), "[HIDDEN_API_KEY]"],
  ["Slack token", fake("xox", "b-1234567890-abcdefghijklmnop"), "[HIDDEN_API_KEY]"],
  ["Google API key", fake("AI", "zaSyA1234567890abcdefghijklmnopqrstuv"), "[HIDDEN_API_KEY]"],
  ["Bearer token", "Authorization: Bearer abc.def-ghi_jkl", "Bearer [HIDDEN_TOKEN]"],
  ["URL token param", "https://x.com/cb?access_token=s3cr3t&page=2", "?access_token=[HIDDEN]&page=2"],
  ["URL api_key param", "https://x.com/api?q=1&api_key=s3cr3t", "&api_key=[HIDDEN]"]
];

for (const [name, input, expected] of cases) {
  test(`hides ${name}`, () => {
    const output = hideSecrets(input);
    assert.ok(output.includes(expected), `expected "${expected}" in "${output}"`);
  });
}

test("leaves normal text alone", () => {
  const text = "Order #1234 shipped. Ask a question at https://example.com/help?page=2";
  assert.equal(hideSecrets(text), text);
});

test("does not hide short look-alikes", () => {
  assert.equal(hideSecrets("sk-short and AKIA123"), "sk-short and AKIA123");
});

test("handles empty input", () => {
  assert.equal(hideSecrets(""), "");
  assert.equal(hideSecrets(null), "");
  assert.equal(hideSecrets(undefined), "");
});
