import assert from "node:assert/strict";
import test from "node:test";
import { generateMiniGameQuizWithOllama } from "../mini-game/ollama.js";

const question = {
  prompt: "ĐỊA LÝ",
  question: "Thủ đô của Việt Nam là thành phố nào?",
  options: ["Hà Nội", "Huế", "Đà Nẵng", "Cần Thơ"],
  answer: 0,
  explanation: "Hà Nội là thủ đô Việt Nam.",
};

test("generates valid mini-game questions with the configured local Ollama model", async () => {
  let requestUrl;
  let requestBody;
  const questions = await generateMiniGameQuizWithOllama({
    topic: "Địa lý Việt Nam",
    count: 1,
    avoidQuestions: ["Câu hỏi cũ"],
    referenceQuestions: [{ question: "Câu đã kiểm chứng?", options: ["Đúng", "Sai"], answer: 0, explanation: "Dữ kiện đúng." }],
    baseUrl: "http://ollama.test/",
    model: "qwen2.5:3b",
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestBody = JSON.parse(options.body);
      return Response.json({ message: { content: JSON.stringify({ questions: [question] }) } });
    },
  });

  assert.equal(requestUrl, "http://ollama.test/api/chat");
  assert.equal(requestBody.model, "qwen2.5:3b");
  assert.equal(requestBody.stream, false);
  assert.equal(requestBody.format.type, "object");
  assert.match(requestBody.messages[1].content, /Địa lý Việt Nam/);
  assert.match(requestBody.messages[1].content, /Câu hỏi cũ/);
  assert.match(requestBody.messages[1].content, /Câu đã kiểm chứng/);
  assert.deepEqual(questions, [question]);
});

test("rejects malformed or duplicate choices from Ollama", async () => {
  await assert.rejects(
    generateMiniGameQuizWithOllama({
      topic: "Địa lý Việt Nam",
      count: 1,
      fetchImpl: async () => Response.json({
        message: { content: JSON.stringify({ questions: [{ ...question, options: ["Hà Nội", "Hà Nội", "Huế", "Cần Thơ"] }] }) },
      }),
    }),
    /does not have four distinct options/,
  );
});

test("regenerates a quiz set when Ollama repeats a previous question", async () => {
  let requestCount = 0;
  const distinctQuestion = { ...question, question: "Câu hỏi khác hẳn về vị trí địa lý của Hà Nội?" };
  const questions = await generateMiniGameQuizWithOllama({
    topic: "Địa lý Việt Nam",
    count: 1,
    avoidQuestions: ["Thủ đô của Việt Nam là thành phố nào?"],
    fetchImpl: async (_url, options) => {
      requestCount += 1;
      const request = JSON.parse(options.body);
      if (requestCount === 2) {
        assert.match(request.messages[1].content, /Thủ đô của Việt Nam/);
        return Response.json({ message: { content: JSON.stringify({ questions: [distinctQuestion] }) } });
      }
      return Response.json({ message: { content: JSON.stringify({ questions: [question] }) } });
    },
  });

  assert.equal(requestCount, 2);
  assert.deepEqual(questions, [distinctQuestion]);
});

test("returns a useful error when Ollama is unavailable", async () => {
  await assert.rejects(
    generateMiniGameQuizWithOllama({
      topic: "Địa lý Việt Nam",
      count: 1,
      fetchImpl: async () => { throw new Error("connection refused"); },
    }),
    (error) => error.code === "OLLAMA_UNAVAILABLE"
      && /http:\/\/localhost:11434/.test(error.message)
      && /host\.docker\.internal/.test(error.message),
  );
});
