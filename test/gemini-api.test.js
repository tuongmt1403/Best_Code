import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithGeminiKeyFallback, getGeminiApiKeys } from "../gemini-api.js";

test("loads the primary Gemini key and all distinct backup keys", () => {
  const keys = getGeminiApiKeys({
    GEMINI_API_KEY: " primary ",
    GEMINI_API_KEY_2: "backup-2",
    GEMINI_API_KEY_3: "backup-3",
    GEMINI_API_KEY_4: "backup-4",
    GEMINI_API_KEY_5: "backup-5",
    GEMINI_API_KEY_6: "backup-6",
    GEMINI_API_KEY_7: "backup-7",
  });

  assert.deepEqual(keys, ["primary", "backup-2", "backup-3", "backup-4", "backup-5", "backup-6", "backup-7"]);
});

test("uses the next Gemini key after a quota response", async () => {
  const attemptedKeys = [];
  const result = await fetchWithGeminiKeyFallback({
    apiKeys: ["primary", "backup"],
    url: "https://example.test/generate",
    init: { headers: { "Content-Type": "application/json" } },
    fetchImpl: async (_url, init) => {
      attemptedKeys.push(init.headers.get("x-goog-api-key"));
      return attemptedKeys.length === 1
        ? new Response("quota", { status: 429 })
        : new Response("ok", { status: 200 });
    },
  });

  assert.deepEqual(attemptedKeys, ["primary", "backup"]);
  assert.equal(result.response.status, 200);
  assert.equal(result.keyNumber, 2);
  assert.equal(result.attempts, 2);
});

test("does not retry every key for a request error that another key cannot fix", async () => {
  let attempts = 0;
  const result = await fetchWithGeminiKeyFallback({
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

test("tries the next key when Gemini reports an invalid API key with HTTP 400", async () => {
  let attempts = 0;
  const result = await fetchWithGeminiKeyFallback({
    apiKeys: ["primary", "backup"],
    url: "https://example.test/generate",
    fetchImpl: async () => {
      attempts += 1;
      return attempts === 1
        ? Response.json({ error: { message: "API key not valid. Please pass a valid API key." } }, { status: 400 })
        : new Response("ok", { status: 200 });
    },
  });

  assert.equal(attempts, 2);
  assert.equal(result.response.status, 200);
});

test("tries the next Gemini key after a transient connection error", async () => {
  let attempts = 0;
  const result = await fetchWithGeminiKeyFallback({
    apiKeys: ["primary", "backup"],
    url: "https://example.test/generate",
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError("network unavailable");
      return new Response("ok", { status: 200 });
    },
  });

  assert.equal(attempts, 2);
  assert.equal(result.response.status, 200);
});
