import assert from "node:assert/strict";
import test from "node:test";
import { createQuizOnQuizApi, QuizApiError } from "../quiz-api.js";

const sampleQuiz = [{
  question: "Năm nào Hiệp định Paris được ký?",
  topic: "Kháng chiến chống Mỹ",
  options: ["1973", "1954", "1968", "1975"],
  answer: "1973",
  explanation: "Hiệp định Paris được ký ngày 27/1/1973.",
}];

test("creates a QuizAPI draft and imports normalized questions", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    if (requests.length === 1) return Response.json({ success: true, data: { id: "quiz-123" } }, { status: 201 });
    return Response.json({ success: true, data: { quizId: "quiz-123", questionsCreated: 1, questions: [] } }, { status: 201 });
  };
  try {
    const result = await createQuizOnQuizApi({
      apiKey: "test-secret",
      baseUrl: "https://quizapi.test",
      title: "Lịch sử Việt Nam",
      description: "Bài ôn tập",
      category: "Vietnamese History",
      tags: ["vietnam-history"],
      quiz: sampleQuiz,
    });
    assert.deepEqual(result, { quizId: "quiz-123" });
    assert.equal(requests[0].url, "https://quizapi.test/api/v1/quizzes");
    assert.equal(requests[0].options.headers.Authorization, "Bearer test-secret");
    assert.deepEqual(requests[0].body, {
      title: "Lịch sử Việt Nam",
      description: "Bài ôn tập",
      category: "Vietnamese History",
      difficulty: "MEDIUM",
      tags: ["vietnam-history"],
      published: false,
    });
    assert.equal(requests[1].url, "https://quizapi.test/api/v1/quizzes/quiz-123/questions/batch");
    assert.deepEqual(requests[1].body.questions[0], {
      text: sampleQuiz[0].question,
      type: "MULTIPLE_CHOICE",
      difficulty: "MEDIUM",
      explanation: sampleQuiz[0].explanation,
      answers: [
        { text: "1973", isCorrect: true },
        { text: "1954", isCorrect: false },
        { text: "1968", isCorrect: false },
        { text: "1975", isCorrect: false },
      ],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fails explicitly when the QuizAPI key is missing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called");
  };
  try {
    await assert.rejects(
      createQuizOnQuizApi({
        apiKey: "",
        title: "Lịch sử",
        description: "",
        category: "History",
        tags: [],
        quiz: sampleQuiz,
      }),
      (error) => error instanceof QuizApiError && error.code === "QUIZ_API_NOT_CONFIGURED",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("preserves the created draft ID if question import is rejected", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    if (requestCount === 1) return Response.json({ success: true, data: { id: "quiz-partial" } }, { status: 201 });
    return Response.json({ success: false, error: "Plan limit reached." }, { status: 403 });
  };
  try {
    await assert.rejects(
      createQuizOnQuizApi({
        apiKey: "test-secret",
        baseUrl: "https://quizapi.test",
        title: "Lịch sử",
        description: "",
        category: "History",
        tags: [],
        quiz: sampleQuiz,
      }),
      (error) => error instanceof QuizApiError && error.status === 403 && error.quizId === "quiz-partial",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
