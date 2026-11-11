import assert from "node:assert/strict";
import test from "node:test";
import { generateWithClaude, reviewWithClaude } from "../ai-review.js";

test("reports that Claude is not configured without making a request", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called");
  };
  try {
    assert.deepEqual(await reviewWithClaude({
      apiKey: undefined,
      model: "claude-test",
      task: "check",
      question: "question",
      answer: "answer",
      context: "",
    }), {
      status: "not_configured",
      model: "claude-test",
      issues: [],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("maps a passing Claude review and sends the configured model", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  let requestOptions;
  globalThis.fetch = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return Response.json({
      content: [{ type: "text", text: JSON.stringify({ verdict: "pass", issues: [] }) }],
    });
  };
  try {
    const result = await reviewWithClaude({
      apiKey: "test-key",
      model: "claude-test",
      task: "check",
      question: "question",
      answer: "answer",
      context: "source",
    });
    assert.equal(requestUrl, "https://api.anthropic.com/v1/messages");
    assert.equal(requestOptions.headers.get("x-api-key"), "test-key");
    const requestBody = JSON.parse(requestOptions.body);
    assert.equal(requestBody.model, "claude-test");
    assert.match(requestBody.system, /json/);
    assert.match(requestBody.system, /tiền đề và dữ kiện người dùng nêu/);
    assert.match(requestBody.system, /Không được bịa ra lời nói\/lỗi của người dùng/);
    assert.deepEqual(result, { status: "verified", model: "claude-test", issues: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("preserves concerns and limits the issue text", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    content: [{
      type: "text",
      text: JSON.stringify({ verdict: "concern", issues: ["  Thiếu căn cứ.  "] }),
    }],
  });
  try {
    assert.deepEqual(await reviewWithClaude({
      apiKey: "test-key",
      model: "claude-test",
      task: "check",
      question: "question",
      answer: "answer",
      context: "source",
    }), {
      status: "concern",
      model: "claude-test",
      issues: ["Thiếu căn cứ."],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects malformed reviewer output", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    content: [{ type: "text", text: JSON.stringify({ verdict: "pass", issues: [""] }) }],
  });
  try {
    await assert.rejects(reviewWithClaude({
      apiKey: "test-key",
      model: "claude-test",
      task: "check",
      question: "question",
      answer: "answer",
      context: "source",
    }), /required response shape/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generates structured content through the configured Claude model", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, "claude-test");
    return Response.json({
      content: [{ type: "text", text: JSON.stringify({ quiz: [{ question: "Q?" }] }) }],
    });
  };
  try {
    assert.deepEqual(await generateWithClaude({
      apiKey: "test-key",
      model: "claude-test",
      system: "Generate JSON",
      prompt: "Create a quiz",
    }), {
      quiz: [{ question: "Q?" }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
