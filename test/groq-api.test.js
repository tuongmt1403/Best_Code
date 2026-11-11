import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithClaudeKeyFallback, getClaudeApiKeys } from "../claude-api.js";

test("loads the primary Claude key and all distinct backup keys", () => {
  assert.deepEqual(getClaudeApiKeys({
    CLAUDE_API_KEY: " primary ",
    CLAUDE_API_KEY_2: "backup-2",
    CLAUDE_API_KEY_3: "backup-3",
    CLAUDE_API_KEY_4: "backup-4",
    CLAUDE_API_KEY_5: "backup-5",
    CLAUDE_API_KEY_6: "backup-6",
    CLAUDE_API_KEY_7: "backup-7",
  }), ["primary", "backup-2", "backup-3", "backup-4", "backup-5", "backup-6", "backup-7"]);
});

test("uses the second Claude key after a quota response", async () => {
  const attemptedKeys = [];
  const result = await fetchWithClaudeKeyFallback({
    apiKeys: ["primary", "backup"],
    url: "https://api.anthropic.com/v1/messages",
    fetchImpl: async (_url, init) => {
      attemptedKeys.push(init.headers.get("x-api-key"));
      return attemptedKeys.length === 1
        ? new Response("rate limit", { status: 429 })
        : new Response("ok", { status: 200 });
    },
  });

  assert.deepEqual(attemptedKeys, ["primary", "backup"]);
  assert.equal(result.response.status, 200);
  assert.equal(result.keyNumber, 2);
});

test("does not retry the Claude backup for a non-key client error", async () => {
  let attempts = 0;
  const result = await fetchWithClaudeKeyFallback({
    apiKeys: ["primary", "backup"],
    url: "https://api.anthropic.com/v1/messages",
    fetchImpl: async () => {
      attempts += 1;
      return new Response("invalid request", { status: 400 });
    },
  });

  assert.equal(attempts, 1);
  assert.equal(result.response.status, 400);
});
