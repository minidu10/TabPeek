// Scrub API keys, tokens, and cloud secrets from text before it leaves the browser.
const SECRET_PATTERNS = [
  // JWTs and Supabase tokens (eyJ... header.payload.signature)
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[HIDDEN_JWT_TOKEN]"],
  // AWS access keys (long-term AKIA, temporary ASIA)
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, "[HIDDEN_AWS_KEY]"],
  // GitHub, OpenAI, Anthropic, Stripe, and Slack keys
  [
    /\b(?:ghp_|gho_|ghs_|ghu_|github_pat_|sk-|sk_live_|sk_test_|rk_live_|rk_test_|pk_live_|xox[abprs]-)[A-Za-z0-9_-]{16,}/g,
    "[HIDDEN_API_KEY]"
  ],
  // Google API keys
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, "[HIDDEN_API_KEY]"],
  // Bearer tokens
  [/(bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, "$1[HIDDEN_TOKEN]"],
  // Secrets in URL query strings (?token=..., &api_key=...)
  [
    /([?&](?:access_token|refresh_token|id_token|token|api_key|apikey|key|secret|client_secret|password|signature|sig)=)[^&#\s)"']+/gi,
    "$1[HIDDEN]"
  ]
];

export function hideSecrets(text) {
  if (!text) return "";

  let result = String(text);
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
