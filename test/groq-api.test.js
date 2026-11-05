import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithGroqKeyFallback, getGroqApiKeys } from "../groq-api.js";

test("loads the primary Groq key and three distinct backup keys", () => {
  assert.deepEqual(getGroqApiKeys({
    GROQ_API_KEY: " primary ",
    GROQ_API_KEY_2: "backup-2",
    GROQ_API_KEY_3: "backup-3",
    GROQ_API_KEY_4: "backup-4",
    GROQ_API_KEY_5: "ignored",
  }), ["primary", "backup-2", "backup-3", "backup-4"]);
});

test("uses the second Groq key after a quota response", async () => {
  const attemptedKeys = [];
  const result = await fetchWithGroqKeyFallback({
    apiKeys: ["primary", "backup"],
    url: "https://example.test/generate",
    fetchImpl: async (_url, init) => {
      attemptedKeys.push(init.headers.get("Authorization"));
      return attemptedKeys.length === 1
        ? new Response("rate limit", { status: 429 })
        : new Response("ok", { status: 200 });
    },
  });

  assert.deepEqual(attemptedKeys, ["Bearer primary", "Bearer backup"]);
  assert.equal(result.response.status, 200);
  assert.equal(result.keyNumber, 2);
});

test("does not retry the Groq backup for a non-key client error", async () => {
  let attempts = 0;
  const result = await fetchWithGroqKeyFallback({
    apiKeys: ["primary", "backup"],
    url: "https://example.test/generate",
    fetchImpl: async () => {
      attempts += 1;
      return new Response("invalid request", { status: 400 });
    },
  });

  assert.equal(attempts, 1);
  assert.equal(result.response.status, 400);
});
