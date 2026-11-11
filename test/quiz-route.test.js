import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { adaptPerfectScoreAnalysis, createQuizRouter } from "../quiz-web/quiz.js";

test("turns a perfect score into a reinforcement plan without inventing weaknesses", () => {
  const result = adaptPerfectScoreAnalysis({
    summary: "Two weaknesses found.",
    weaknesses: [{ topic: "Dates", reason: "Wrong date", knowledgeToReview: "Review dates." }],
    studyPlan: [{ step: 1, title: "Fix errors", activity: "Redo missed questions." }],
    practiceTips: ["Study more."],
  }, 5, 5, "Lịch sử Việt Nam");

  assert.match(result.summary, /chưa xác định điểm yếu cụ thể/);
  assert.deepEqual(result.weaknesses, []);
  assert.equal(result.studyPlan.length, 3);
  assert.equal(result.studyPlan[0].step, 1);
  assert.match(result.studyPlan[0].activity, /Lịch sử Việt Nam/);
});

test("leaves an imperfect-score analysis unchanged", () => {
  const analysis = {
    summary: "One answer needs review.",
    weaknesses: [{ topic: "Dates", reason: "Wrong date", knowledgeToReview: "Review dates." }],
    studyPlan: [{ step: 1, title: "Review dates", activity: "Check source." }],
    practiceTips: ["Study more."],
  };
  assert.equal(adaptPerfectScoreAnalysis(analysis, 4, 5, "History"), analysis);
});

test("opens direct lessons for menu topics without claiming quiz results", async () => {
  const app = express();
  app.use(express.json());
  app.use(createQuizRouter({ groqApiKeys: [] }));
  const server = app.listen(0);

  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const requestLesson = (topicId, focusTopic, stepIndex = 0) => fetch(`${baseUrl}/api/study-roadmap/lesson`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId, quizResults: [], stepIndex, focusTopic }),
    });

    const menuLessons = [
      ["antiUsWar", "Hiệp định Genève", "Lịch sử: Hiệp định Genève"],
      ["antiUsWar", "Hiệp định Paris", "Lịch sử: Hiệp định Paris"],
      ["geography", "Khí hậu", "Địa lý: Khí hậu"],
      ["cProgramming", "Con trỏ", "Lập trình C: Tìm hiểu về Con trỏ"],
    ];
    for (const [topicId, focusTopic, expectedTitle] of menuLessons) {
      const response = await requestLesson(topicId, focusTopic);
      const lesson = await response.json();
      assert.equal(response.status, 200);
      assert.equal(lesson.title, expectedTitle);
      assert.equal(lesson.focusTopic, focusTopic);
      assert.equal(lesson.totalSteps, 3);
      assert.match(lesson.practiceQuestion, new RegExp(focusTopic));
      assert.equal(Object.hasOwn(lesson, "quizQuestion"), false);
      assert.equal(Object.hasOwn(lesson, "quizOptions"), false);
      assert.equal(Object.hasOwn(lesson, "correctIndex"), false);
      assert.equal(Object.hasOwn(lesson, "answerIndex"), false);
      assert.doesNotMatch(lesson.theory, /Bạn đã làm tốt câu|bạn đã chọn/);
      if (focusTopic === "Hiệp định Genève") {
        assert.doesNotMatch(`${lesson.title} ${lesson.theory} ${lesson.practiceQuestion}`, /Hiệp định Paris/);
      }
    }

    const advancedResponse = await requestLesson("cProgramming", "Con trỏ", 2);
    const advanced = await advancedResponse.json();
    assert.equal(advanced.phase, "advanced");
    assert.match(advanced.practiceQuestion, /trường hợp đặc biệt/);

    const invalidTopic = await requestLesson("geography", "Hiệp định Paris");
    assert.equal(invalidTopic.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("reviews open-ended chat answers with specific feedback and a detailed explanation", async () => {
  const originalFetch = globalThis.fetch;
  let aiRequests = 0;
  const prompts = [];
  globalThis.fetch = async (url, options = {}) => {
    if (typeof url === "string" && url.startsWith("http://127.0.0.1:")) {
      return originalFetch(url, options);
    }
    if (String(url).startsWith("http://localhost:11434/api/chat")) {
      aiRequests += 1;
      prompts.push(JSON.parse(options.body).messages[1].content);
      const correct = aiRequests === 2;
      return Response.json({
        message: {
          content: JSON.stringify({
            correct,
            feedback: correct ? "Em đã nêu đúng trọng tâm." : "Em đang nhầm hai hiệp định khác nhau.",
            whyWrong: correct ? "" : "Câu trả lời đang gắn nội dung Paris với câu hỏi về Genève.",
            focus: "Phân biệt mục tiêu và nội dung của từng hiệp định.",
            hint: "Xác định hội nghị và thời điểm gắn với hiệp định đang được hỏi.",
            explanation: correct ? "Hiệp định Genève được ký tháng 7 năm 1954 sau chiến thắng Điện Biên Phủ." : "",
            example: correct ? "Có thể nêu mối liên hệ giữa chiến thắng Điện Biên Phủ và đàm phán tại Genève." : "",
          }),
        },
      });
    }
    throw new Error(`Unexpected external request: ${url}`);
  };

  const app = express();
  app.use(express.json());
  app.use(createQuizRouter({ groqApiKeys: [] }));
  const server = app.listen(0);

  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const request = (path, body) => originalFetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const lessonResponse = await request("/api/study-roadmap/lesson", {
      topicId: "antiUsWar",
      quizResults: [],
      stepIndex: 0,
      focusTopic: "Hiệp định Genève",
    });
    const lesson = await lessonResponse.json();
    assert.equal(lessonResponse.status, 200);
    assert.match(lesson.practiceQuestion, /Hiệp định Genève/);
    assert.doesNotMatch(lesson.practiceQuestion, /Hiệp định Paris/);
    assert.equal(Object.hasOwn(lesson, "quizQuestion"), false);
    assert.equal(Object.hasOwn(lesson, "quizOptions"), false);

    const answerBody = {
      topicId: "antiUsWar",
      focusTopic: lesson.focusTopic,
      phase: lesson.phase,
      question: lesson.practiceQuestion,
      answer: "Hiệp định Paris kết thúc chiến tranh ở Việt Nam.",
      hintLevel: 0,
      attemptNumber: 1,
    };
    const wrongResponse = await request("/api/study-roadmap/answer", answerBody);
    const wrong = await wrongResponse.json();
    assert.equal(wrongResponse.status, 200);
    assert.equal(wrong.correct, false);
    assert.match(wrong.whyWrong, /Paris.*Genève/);
    assert.match(wrong.focus, /hiệp định/);
    assert.match(wrong.hint, /hiệp định/);
    assert.equal(Object.hasOwn(wrong, "solution"), false);
    assert.match(prompts[0], /Câu trả lời của học sinh: Hiệp định Paris kết thúc chiến tranh ở Việt Nam/);
    assert.match(prompts[0], /Câu hỏi:.*Hiệp định Genève/);

    const correctResponse = await request("/api/study-roadmap/answer", {
      ...answerBody,
      answer: "Hiệp định Genève được ký tháng 7 năm 1954 sau chiến thắng Điện Biên Phủ.",
      attemptNumber: 2,
    });
    const correct = await correctResponse.json();
    assert.equal(correctResponse.status, 200);
    assert.equal(correct.correct, true);
    assert.match(correct.explanation, /tháng 7 năm 1954/);
    assert.match(correct.example, /chiến thắng Điện Biên Phủ/);
    assert.equal(aiRequests, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = originalFetch;
  }
});

test("builds foundation, practice, and advanced roadmap steps from quiz performance", async () => {
  const originalFetch = globalThis.fetch;
  let aiRequests = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (typeof url === "string" && url.startsWith("http://127.0.0.1:")) {
      return originalFetch(url, options);
    }
    if (String(url).startsWith("http://localhost:11434/api/chat")) {
      aiRequests += 1;
      const prompt = JSON.parse(options.body).messages[1].content;
      if (prompt.includes("Đưa lời giải mẫu")) {
        return Response.json({
          message: {
            content: JSON.stringify({
              answer: "Chỉ số đầu tiên là 0.",
              explanation: "Mảng C đánh số phần tử từ 0.",
              diagram: {
                title: "Luồng truy cập phần tử mảng",
                type: "flow",
                centerIndex: 1,
                nodes: ["Chọn chỉ số", "Truy cập phần tử"],
                edges: [{ from: 0, to: 1, label: "dùng vị trí" }],
              },
            }),
          },
        });
      }
      return Response.json({
        message: {
          content: JSON.stringify({
            correct: false,
            feedback: "Đáp án là 0.",
            whyWrong: "Bạn đang tính phần tử đầu tiên từ một thay vì từ vị trí đầu của mảng.",
            focus: "Quy tắc đánh chỉ số trong mảng C.",
            hint: "Hãy xem lại chỉ số của phần tử đầu tiên.",
            explanation: "",
            example: "",
          }),
        },
      });
    }
    throw new Error(`Unexpected external request: ${url}`);
  };

  const app = express();
  app.use(express.json());
  app.use(createQuizRouter({ groqApiKeys: [] }));
  const server = app.listen(0);
  const quizResults = [
    {
      topic: "Mảng",
      question: "Chỉ số mảng bắt đầu từ đâu?",
      selectedAnswer: "1",
      correctAnswer: "0",
      explanation: "Mảng C bắt đầu từ chỉ số 0.",
      correct: false,
    },
    {
      topic: "Mảng",
      question: "Chỉ số của phần tử thứ hai là bao nhiêu?",
      selectedAnswer: "1",
      correctAnswer: "1",
      explanation: "Chỉ số mảng bắt đầu từ 0.",
      correct: true,
    },
  ];

  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const requestLesson = (stepIndex) => originalFetch(`${baseUrl}/api/study-roadmap/lesson`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId: "cProgramming", quizResults, stepIndex }),
    });

    const foundation = await (await requestLesson(0)).json();
    const practice = await (await requestLesson(1)).json();
    const advanced = await (await requestLesson(2)).json();
    assert.equal(foundation.phase, "foundation");
    assert.equal(practice.phase, "practice");
    assert.equal(advanced.phase, "advanced");
    assert.equal(foundation.totalSteps, 3);
    assert.equal(foundation.focusTopic, "Mảng");
    assert.equal(advanced.focusTopic, "Mảng");
    assert.match(foundation.theory, /Mảng chứa nhiều phần tử cùng kiểu/);
    assert.match(foundation.practiceQuestion, /giải thích nguyên tắc/);
    assert.match(practice.practiceQuestion, /tình huống hoặc ví dụ mới/);
    assert.match(advanced.theory, /bỏ qua phần nhập môn/);
    assert.equal(aiRequests, 0, "Opening a roadmap lesson should not wait for an AI generation request.");

    const checked = await originalFetch(`${baseUrl}/api/study-roadmap/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topicId: "cProgramming",
        phase: "foundation",
        question: foundation.practiceQuestion,
        answer: "Tôi nghĩ chỉ số đầu tiên là một.",
        referenceAnswer: "0",
        hintLevel: 0,
        attemptNumber: 1,
      }),
    });
    const feedback = await checked.json();
    assert.equal(checked.status, 200);
    assert.equal(feedback.correct, false);
    assert.match(feedback.feedback, /không bật mí đáp án/);
    assert.match(feedback.hint, /Quay lại phần lý thuyết/);
    assert.doesNotMatch(`${feedback.feedback} ${feedback.hint}`, /(^|\D)0(\D|$)/);
    assert.equal(aiRequests, 1, "AI should still be used to review the learner's answer.");

    const finalAttempt = await originalFetch(`${baseUrl}/api/study-roadmap/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topicId: "cProgramming",
        phase: "foundation",
        question: foundation.practiceQuestion,
        answer: "Tôi vẫn nghĩ chỉ số đầu tiên là một.",
        referenceAnswer: "0",
        hintLevel: 2,
        attemptNumber: 3,
      }),
    });
    const finalFeedback = await finalAttempt.json();
    assert.equal(finalAttempt.status, 200);
    assert.equal(finalFeedback.correct, false);
    assert.equal(finalFeedback.solution.answer, "Chỉ số đầu tiên là 0.");
    assert.match(finalFeedback.solution.explanation, /đánh số phần tử từ 0/);
    assert.equal(finalFeedback.solution.diagram.type, "flow");
    assert.deepEqual(finalFeedback.solution.diagram.nodes, ["Chọn chỉ số", "Truy cập phần tử"]);
    assert.equal(aiRequests, 3, "The third incorrect attempt should request a grounded model solution.");

    const invalidStep = await originalFetch(`${baseUrl}/api/study-roadmap/lesson`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId: "cProgramming", quizResults, stepIndex: 3 }),
    });
    assert.equal(invalidStep.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = originalFetch;
  }
});

test("generates a C programming quiz with Ollama when Groq is rate-limited and QuizAPI denies creation", async () => {
  const originalFetch = globalThis.fetch;
  const previousGroqKey = process.env.GROQ_API_KEY;
  const previousQuizApiKey = process.env.QUIZAPI_IO_KEY;
  const previousGroqModel = process.env.GROQ_MODEL;
  process.env.GROQ_API_KEY = "test-groq-key";
  process.env.QUIZAPI_IO_KEY = "test-quizapi-key";
  process.env.GROQ_MODEL = "qwen-test";

  const generatedQuiz = [{
    question: "Chỉ số đầu tiên của một mảng trong C là bao nhiêu?",
    topic: "Mảng trong C",
    options: ["0", "1", "-1", "Phụ thuộc kích thước mảng"],
    answer: "0",
    explanation: "Chỉ số mảng trong C bắt đầu từ 0.",
  }];
  const externalRequests = [];
  let ollamaPrompt = "";
  globalThis.fetch = async (url, options = {}) => {
    if (typeof url === "string" && url.startsWith("http://127.0.0.1:")) {
      return originalFetch(url, options);
    }
    externalRequests.push({ url: String(url), method: options.method });
    if (String(url).startsWith("https://api.groq.com/")) {
      return Response.json({ error: { message: "rate limited" } }, { status: 429 });
    }
    if (String(url).startsWith("http://localhost:11434/api/tags")) {
      return Response.json({ models: [{ name: "qwen2.5:3b" }] });
    }
    if (String(url).startsWith("http://localhost:11434/api/chat")) {
      ollamaPrompt = JSON.parse(options.body).messages[1].content;
      return Response.json({ message: { content: JSON.stringify(generatedQuiz) } });
    }
    if (String(url).startsWith("https://quizapi.io/api/v1/quizzes")) {
      return Response.json({
        success: false,
        error: "Quiz creation via API requires a paid plan.",
      }, { status: 403 });
    }
    throw new Error(`Unexpected external request: ${url}`);
  };

  const app = express();
  app.use(express.json());
  app.use(createQuizRouter());
  const server = app.listen(0);

  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    const topicsResponse = await originalFetch(`http://127.0.0.1:${address.port}/api/quiz-topics`);
    const topicsData = await topicsResponse.json();
    const cTopic = topicsData.topics.find(({ id }) => id === "cProgramming");
    assert.ok(cTopic);
    assert.match(cTopic.title, /Lập trình C/);
    assert.match(cTopic.description, /con trỏ/);

    const response = await originalFetch(`http://127.0.0.1:${address.port}/api/generate-quiz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId: "cProgramming", numQuestions: 1 }),
    });
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.storage, "local");
    assert.match(data.generator, /^Ollama/);
    assert.match(data.generationWarning, /429/);
    assert.match(data.storageWarning, /chỉ trong phiên làm bài/);
    assert.deepEqual(data.quiz, generatedQuiz);
    assert.match(ollamaPrompt, /Lập trình C cơ bản đến trung cấp/);
    assert.match(ollamaPrompt, /Con trỏ lưu địa chỉ/);
    assert.deepEqual(externalRequests.map(({ method }) => method), ["POST", "POST", "POST"]);

    const status = await originalFetch(`http://127.0.0.1:${address.port}/api/quiz-provider/status`);
    const providerStatus = await status.json();
    assert.equal(providerStatus.cloudCreationForbidden, true);
    assert.equal(providerStatus.ready, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = originalFetch;
    if (previousGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousGroqKey;
    if (previousQuizApiKey === undefined) delete process.env.QUIZAPI_IO_KEY;
    else process.env.QUIZAPI_IO_KEY = previousQuizApiKey;
    if (previousGroqModel === undefined) delete process.env.GROQ_MODEL;
    else process.env.GROQ_MODEL = previousGroqModel;
  }
});
