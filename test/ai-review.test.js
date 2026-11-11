import assert from "node:assert/strict";
import test from "node:test";
import { generateWithGroq, reviewWithGroq } from "../ai-review.js";

test("reports that Groq is not configured without making a request", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called");
  };
  try {
    assert.deepEqual(await reviewWithGroq({
      apiKey: undefined,
      model: "llama-test",
      task: "check",
      question: "question",
      answer: "answer",
      context: "",
    }), {
      status: "not_configured",
      model: "llama-test",
      issues: [],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("maps a passing Groq review and sends the configured model", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  let requestOptions;
  globalThis.fetch = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return Response.json({
      choices: [{ message: { content: JSON.stringify({ verdict: "pass", issues: [] }) } }],
    });
  };
  try {
    const result = await reviewWithGroq({
      apiKey: "test-key",
      model: "llama-test",
      task: "check",
      question: "question",
      answer: "answer",
      context: "source",
    });
    assert.equal(requestUrl, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(requestOptions.headers.get("Authorization"), "Bearer test-key");
    const requestBody = JSON.parse(requestOptions.body);
    assert.equal(requestBody.model, "llama-test");
    assert.equal(requestBody.reasoning_effort, "none");
    assert.match(requestBody.messages[0].content, /json/);
    assert.match(requestBody.messages[0].content, /tiền đề và dữ kiện người dùng nêu/);
    assert.match(requestBody.messages[0].content, /Không được bịa ra lời nói\/lỗi của người dùng/);
    assert.deepEqual(result, { status: "verified", model: "llama-test", issues: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("preserves concerns and limits the issue text", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    choices: [{
      message: {
        content: JSON.stringify({ verdict: "concern", issues: ["  Thiếu căn cứ.  "] }),
      },
    }],
  });
  try {
    assert.deepEqual(await reviewWithGroq({
      apiKey: "test-key",
      model: "llama-test",
      task: "check",
      question: "question",
      answer: "answer",
      context: "source",
    }), {
      status: "concern",
      model: "llama-test",
      issues: ["Thiếu căn cứ."],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects malformed reviewer output", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    choices: [{ message: { content: JSON.stringify({ verdict: "pass", issues: [""] }) } }],
  });
  try {
    await assert.rejects(reviewWithGroq({
      apiKey: "test-key",
      model: "llama-test",
      task: "check",
      question: "question",
      answer: "answer",
      context: "source",
    }), /required response shape/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generates structured content through the configured Groq model", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, "qwen-test");
    assert.equal(body.response_format.type, "json_object");
    return Response.json({
      choices: [{ message: { content: JSON.stringify({ quiz: [{ question: "Q?" }] }) } }],
    });
  };
  try {
    assert.deepEqual(await generateWithGroq({
      apiKey: "test-key",
      model: "qwen-test",
      system: "Generate JSON",
      prompt: "Create a quiz",
    }), {
      quiz: [{ question: "Q?" }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
