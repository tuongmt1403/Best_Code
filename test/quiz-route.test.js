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

test("returns a grounded quiz analysis and learning plan without waiting for external AI", async () => {
  const originalFetch = globalThis.fetch;
  let externalAiCalls = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:")) return originalFetch(url, options);
    externalAiCalls += 1;
    throw new Error("Quiz result analysis must not wait for external AI.");
  };
  const app = express();
  app.use(express.json());
  app.use(createQuizRouter({
    geminiApiKeys: ["test-gemini-key"],
    claudeApiKeys: ["test-claude-key"],
  }));
  const server = app.listen(0);

  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const requestStartedAt = performance.now();
    const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/analyze-quiz-result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topicId: "cProgramming",
        totalQuestions: 5,
        correctAnswers: 2,
        incorrectAnswers: [
          {
            topic: "Con trỏ",
            question: "Con trỏ lưu gì?",
            selectedAnswer: "Giá trị",
            correctAnswer: "Địa chỉ",
            explanation: "Con trỏ lưu địa chỉ của vùng nhớ.",
          },
          {
            topic: "Con trỏ",
            question: "Toán tử lấy địa chỉ là gì?",
            selectedAnswer: "*",
            correctAnswer: "&",
            explanation: "Toán tử & lấy địa chỉ của một biến.",
          },
          {
            topic: "Mảng",
            question: "Chỉ số đầu tiên của mảng là gì?",
            selectedAnswer: "1",
            correctAnswer: "0",
            explanation: "Chỉ số mảng trong C bắt đầu từ 0.",
          },
        ],
      }),
    });
    const elapsedMs = performance.now() - requestStartedAt;
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.ok(elapsedMs < 8_000, `analysis took ${elapsedMs}ms`);
    assert.equal(externalAiCalls, 0);
    assert.equal(data.generator, "Quiz AI tức thì");
    assert.equal(data.verification.status, "instant");
    assert.match(data.analysis.summary, /2\/5/);
    assert.equal(data.analysis.weaknesses[0].topic, "Con trỏ");
    assert.match(data.analysis.weaknesses[0].knowledgeToReview, /địa chỉ của vùng nhớ/);
    assert.equal(data.analysis.studyPlan.length, 3);
    assert.match(data.analysis.studyPlan[0].activity, /địa chỉ của vùng nhớ/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = originalFetch;
  }
});

test("opens direct lessons for menu topics without claiming quiz results", async () => {
  const app = express();
  app.use(express.json());
  app.use(createQuizRouter({ claudeApiKeys: [] }));
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
      ["antiUsWar", "Phong trào Đồng Khởi", "Lịch sử: Phong trào Đồng Khởi"],
      ["antiUsWar", "Hiệp định Genève", "Lịch sử: Hiệp định Genève"],
      ["antiUsWar", "Chiến dịch Điện Biên Phủ", "Lịch sử: Chiến dịch Điện Biên Phủ"],
      ["antiUsWar", "Tết Mậu Thân", "Lịch sử: Tết Mậu Thân"],
      ["antiUsWar", "Hiệp định Paris", "Lịch sử: Hiệp định Paris"],
      ["antiUsWar", "Kết thúc chiến tranh", "Lịch sử: Kết thúc chiến tranh"],
      ["geography", "Khí hậu", "Địa lý: Khí hậu"],
      ["cProgramming", "Cấu trúc chương trình C", "Lập trình C: Tìm hiểu về Cấu trúc chương trình C"],
      ["cProgramming", "Thư viện chuẩn", "Lập trình C: Tìm hiểu về Thư viện chuẩn"],
      ["cProgramming", "Biến & Kiểu dữ liệu", "Lập trình C: Tìm hiểu về Biến & Kiểu dữ liệu"],
      ["cProgramming", "Cấu trúc điều khiển", "Lập trình C: Tìm hiểu về Cấu trúc điều khiển"],
      ["cProgramming", "Hàm", "Lập trình C: Tìm hiểu về Hàm"],
      ["cProgramming", "Mảng & Chuỗi", "Lập trình C: Tìm hiểu về Mảng & Chuỗi"],
      ["cProgramming", "Con trỏ", "Lập trình C: Tìm hiểu về Con trỏ"],
      ["cProgramming", "Struct", "Lập trình C: Tìm hiểu về Struct"],
      ["cProgramming", "Bộ nhớ động", "Lập trình C: Tìm hiểu về Bộ nhớ động"],
      ["cProgramming", "Tệp", "Lập trình C: Tìm hiểu về Tệp"],
    ];
    for (const [topicId, focusTopic, expectedTitle] of menuLessons) {
      const response = await requestLesson(topicId, focusTopic);
      const lesson = await response.json();
      assert.equal(response.status, 200);
      assert.equal(lesson.title, expectedTitle);
      assert.equal(lesson.focusTopic, focusTopic);
      assert.equal(lesson.totalSteps, 3);
      assert.match(lesson.practiceQuestion, new RegExp(focusTopic));
      assert.equal(lesson.assessmentQuestions.length, 3);
      assert.equal(new Set(lesson.assessmentQuestions.map(({ question }) => question)).size, 3);
      for (const assessmentQuestion of lesson.assessmentQuestions) {
        assert.ok(Array.isArray(assessmentQuestion.options));
        assert.equal(Object.hasOwn(assessmentQuestion, "answerIndex"), false);
      }
      assert.equal(Object.hasOwn(lesson, "quizQuestion"), false);
      assert.equal(Object.hasOwn(lesson, "quizOptions"), false);
      assert.equal(Object.hasOwn(lesson, "correctIndex"), false);
      assert.equal(Object.hasOwn(lesson, "answerIndex"), false);
      assert.doesNotMatch(lesson.theory, /Bạn đã làm tốt câu|bạn đã chọn/);
      if (topicId === "cProgramming") {
        const codeSection = lesson.sections.find(({ code }) => code);
        assert.ok(codeSection, `${focusTopic} should provide a runnable C example`);
        assert.notEqual(lesson.sections[0].title, "Nội dung trọng tâm", `${focusTopic} should use topic-specific lesson content`);
        assert.match(codeSection.code, /int main\(void\)/);
        assert.ok(codeSection.codeNotes.length > 0);
        assert.ok(codeSection.codeOutput);
        assert.equal(lesson.assessmentQuestions.length, 3);
      }
      if (focusTopic === "Hiệp định Genève") {
        assert.doesNotMatch(`${lesson.title} ${lesson.theory} ${lesson.practiceQuestion}`, /Hiệp định Paris.{0,40}(?:ký|1954)|(?:ký|1954).{0,40}Hiệp định Paris/);
        assert.match(lesson.sections[0].content, /tháng 7\/1954/);
        assert.match(lesson.sections[1].content, /tổng tuyển cử.*1956/);
      }
      if (focusTopic === "Phong trào Đồng Khởi") {
        assert.match(lesson.sections[0].content, /Bến Tre.*1960/);
        assert.match(lesson.sections[1].content, /không nên mô tả Đồng Khởi như một trận đánh đơn lẻ/i);
        assert.match(lesson.assessmentQuestions[0].question, /Đồng Khởi/);
      }
      if (focusTopic === "Tết Mậu Thân") {
        assert.match(lesson.sections[0].content, /năm 1968/);
        assert.match(lesson.sections[1].content, /không đạt mọi mục tiêu quân sự/);
        assert.match(lesson.assessmentQuestions[0].question, /Tết Mậu Thân/);
      }
      if (focusTopic === "Hiệp định Paris") {
        assert.match(lesson.sections[0].content, /27\/1\/1973/);
        assert.match(lesson.sections[1].content, /không phải mốc kết thúc chiến tranh/);
        assert.doesNotMatch(lesson.sections[0].content, /chiến tranh kết thúc tại miền Nam/);
      }
      if (focusTopic === "Kết thúc chiến tranh") {
        assert.match(lesson.sections[0].content, /Tây Nguyên.*Huế–Đà Nẵng.*Hồ Chí Minh/);
        assert.match(lesson.sections[1].content, /26\/4\/1975/);
        assert.match(lesson.sections[1].content, /30\/4.*tuyên bố đầu hàng/);
        assert.match(lesson.sections[2].content, /thống nhất nhà nước.*1976/);
        assert.doesNotMatch(lesson.sections[0].content, /Hiệp định Paris.*được ký/);
        const answerResponse = await fetch(`${baseUrl}/api/study-roadmap/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topicId,
            focusTopic,
            phase: "foundation",
            question: lesson.assessmentQuestions[0].question,
            selectedOptionIndex: 1,
            hintLevel: 0,
            attemptNumber: 1,
          }),
        });
        const answer = await answerResponse.json();
        assert.equal(answerResponse.status, 200);
        assert.equal(answer.correct, true);
        assert.match(answer.explanation, /Chiến dịch Hồ Chí Minh bắt đầu ngày 26\/4\/1975/);
        assert.match(answer.example, /Tây Nguyên → Huế–Đà Nẵng → Hồ Chí Minh/);
      }
      if (focusTopic === "Struct") {
        const codeSection = lesson.sections.find(({ code }) => code);
        assert.match(codeSection.code, /typedef struct/);
        assert.match(codeSection.code, /student\.name/);
        assert.match(codeSection.code, /record->score/);
        assert.equal(codeSection.codeNotes.length, 4);
        assert.equal(codeSection.codeOutput, "An, 18 tuoi\nDiem: 8.5");
        assert.match(lesson.sections[0].content, /bản ghi/);
        assert.match(lesson.sections[2].content, /Student students\[30\]/);
      }
      if (focusTopic === "Cấu trúc chương trình C") {
        assert.match(lesson.sections[0].content, /bắt đầu từ hàm main/);
        assert.match(lesson.sections[1].code, /#include <stdio\.h>/);
        assert.match(lesson.sections[1].code, /int main\(void\)/);
        assert.match(lesson.sections[1].codeOutput, /Tong = 11/);
      }
      if (focusTopic === "Thư viện chuẩn") {
        const codeSection = lesson.sections.find(({ code }) => code);
        assert.match(lesson.sections[0].content, /header.*khai báo giao diện/i);
        assert.match(codeSection.code, /#include <string\.h>/);
        assert.match(codeSection.code, /#include <stdlib\.h>/);
        assert.match(codeSection.code, /strlen\(course\)/);
        assert.match(codeSection.code, /abs\(7 - 10\)/);
        assert.match(lesson.sections[2].content, /phần cài đặt/);
        assert.equal(codeSection.codeOutput, "Mon C co 1 ky tu; |7-10| = 3");
        const answerResponse = await fetch(`${baseUrl}/api/study-roadmap/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topicId,
            focusTopic,
            phase: "foundation",
            question: lesson.assessmentQuestions[0].question,
            selectedOptionIndex: 3,
            hintLevel: 0,
            attemptNumber: 1,
          }),
        });
        const answer = await answerResponse.json();
        assert.equal(answerResponse.status, 200);
        assert.equal(answer.correct, true);
        assert.match(answer.explanation, /header chuẩn/);
        assert.match(answer.example, /strlen/);
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

test("provides a detailed, source-qualified Dien Bien Phu lesson and fresh remediation prompts", async () => {
  const app = express();
  app.use(express.json());
  app.use(createQuizRouter({ claudeApiKeys: [] }));
  const server = app.listen(0);

  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const requestLesson = (remediationIndex = 0, missedQuestionPhases = []) => fetch(`${baseUrl}/api/study-roadmap/lesson`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topicId: "antiUsWar",
        quizResults: [],
        stepIndex: 0,
        focusTopic: "Chiến dịch Điện Biên Phủ",
        remediationIndex,
        missedQuestionPhases,
      }),
    });

    const lesson = await (await requestLesson()).json();
    const remediation = await (await requestLesson(1)).json();
    const focusedRemediation = await (await requestLesson(1, ["foundation"])).json();
    assert.equal(lesson.phase, "foundation");
    assert.ok(lesson.sections.length >= 2);
    assert.match(lesson.theory, /gần 50\.000 quân/);
    assert.match(lesson.theory, /62 chiếc.*167 chiếc khác bị hư hại/);
    assert.match(lesson.theory, /không cung cấp một bảng số liệu thương vong con người đầy đủ/);
    assert.match(lesson.theory, /history\.com\/articles\/battle-of-dien-bien-phu/);
    assert.notEqual(remediation.practiceQuestion, lesson.practiceQuestion);
    assert.equal(remediation.remediationIndex, 1);
    assert.match(focusedRemediation.theory, /Câu cần ôn: Chiến dịch Điện Biên Phủ năm 1954 thuộc cuộc kháng chiến nào/);
    assert.doesNotMatch(focusedRemediation.theory, /62 chiếc/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("answers clarification from the current lesson and routes out-of-scope questions to Chat", async () => {
  const originalFetch = globalThis.fetch;
  const prompts = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith("http://127.0.0.1:")) return originalFetch(url, options);
    if (String(url).startsWith("https://api.anthropic.com/")) {
      const requestBody = JSON.parse(options.body);
      prompts.push(requestBody.messages[0].content);
      const clarification = prompts.length === 1
        ? { inScope: true, answer: "Khí hậu Việt Nam mang tính nhiệt đới ẩm gió mùa." }
        : { inScope: false, answer: "Câu hỏi này vượt ra ngoài nội dung khí hậu đang học." };
      return Response.json({
        content: [{ type: "text", text: JSON.stringify(clarification) }],
      });
    }
    throw new Error(`Unexpected external request: ${String(url)}`);
  };
  const app = express();
  app.use(express.json());
  app.use(createQuizRouter({ claudeApiKeys: ["test-claude-key"] }));
  const server = app.listen(0);

  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const clarify = (question) => originalFetch(`${baseUrl}/api/study-roadmap/clarify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId: "geography", focusTopic: "Khí hậu", question }),
    });
    const inScope = await (await clarify("Khí hậu Việt Nam có đặc điểm gì?")).json();
    const outOfScope = await (await clarify("Kể thêm một chủ đề không có trong bài")).json();

    assert.equal(inScope.inScope, true);
    assert.equal(inScope.chatUrl, undefined);
    assert.equal(outOfScope.inScope, false);
    assert.equal(outOfScope.chatUrl, "/chat");
    assert.match(prompts[0], /Khí hậu Việt Nam mang tính chất nhiệt đới ẩm gió mùa/);
    assert.doesNotMatch(prompts[0], /Hiệp định Paris/);
    assert.equal(prompts.length, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = originalFetch;
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
  app.use(createQuizRouter({ claudeApiKeys: [] }));
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
  app.use(createQuizRouter({ claudeApiKeys: [] }));
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
    assert.match(foundation.theory, /Mảng giữ nhiều giá trị cùng kiểu/);
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

test("generates a C programming quiz with Ollama when Claude is rate-limited and QuizAPI denies creation", async () => {
  const originalFetch = globalThis.fetch;
  const previousClaudeKey = process.env.CLAUDE_API_KEY;
  const previousQuizApiKey = process.env.QUIZAPI_IO_KEY;
  const previousClaudeModel = process.env.CLAUDE_MODEL;
  process.env.CLAUDE_API_KEY = "test-claude-key";
  process.env.QUIZAPI_IO_KEY = "test-quizapi-key";
  process.env.CLAUDE_MODEL = "claude-test";

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
    if (String(url).startsWith("https://api.anthropic.com/")) {
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
      body: JSON.stringify({
        documentText: "Lập trình C cơ bản đến trung cấp.\nCon trỏ lưu địa chỉ của một vùng nhớ.\nChỉ số mảng bắt đầu từ 0.",
        numQuestions: 1,
      }),
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
    if (previousClaudeKey === undefined) delete process.env.CLAUDE_API_KEY;
    else process.env.CLAUDE_API_KEY = previousClaudeKey;
    if (previousQuizApiKey === undefined) delete process.env.QUIZAPI_IO_KEY;
    else process.env.QUIZAPI_IO_KEY = previousQuizApiKey;
    if (previousClaudeModel === undefined) delete process.env.CLAUDE_MODEL;
    else process.env.CLAUDE_MODEL = previousClaudeModel;
  }
});

test("retries duplicate Ollama options and removes generated letter labels before showing the quiz", async () => {
  const originalFetch = globalThis.fetch;
  const previousQuizApiKey = process.env.QUIZAPI_IO_KEY;
  process.env.QUIZAPI_IO_KEY = "";
  let ollamaAttempts = 0;
  const invalidQuiz = [{
    question: "Hiệp định Paris được ký năm nào?",
    topic: "Lịch sử",
    options: ["A. 1973", "B. 1973", "C. 1954", "D. 1975"],
    answer: "A",
    explanation: "Tài liệu nêu rõ mốc ký kết.",
  }];
  const validQuiz = [{
    question: "Hiệp định Paris được ký năm nào?",
    topic: "Lịch sử",
    options: ["A. 1973", "B. 1954", "C. 1968", "D. 1975"],
    answer: "A",
    explanation: "Tài liệu nêu rõ mốc ký kết.",
  }];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith("http://127.0.0.1:")) return originalFetch(url, options);
    if (String(url) === "http://ollama.test/api/chat") {
      ollamaAttempts += 1;
      const request = JSON.parse(options.body);
      assert.match(request.messages[0].content, /không thêm tiền tố A\/B\/C\/D/);
      assert.match(request.messages[1].content, /không thêm nhãn A\/B\/C\/D/);
      return Response.json({
        message: { content: JSON.stringify(ollamaAttempts === 1 ? invalidQuiz : validQuiz) },
      });
    }
    throw new Error(`Unexpected external request: ${url}`);
  };

  const app = express();
  app.use(express.json());
  app.use(createQuizRouter({ baseUrl: "http://ollama.test", claudeApiKeys: [], geminiApiKeys: [] }));
  const server = app.listen(0);

  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/generate-quiz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentText: "Hiệp định Paris về Việt Nam được ký ngày 27/1/1973.",
        numQuestions: 1,
      }),
    });
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(ollamaAttempts, 2);
    assert.deepEqual(data.quiz[0].options, ["1973", "1954", "1968", "1975"]);
    assert.equal(data.quiz[0].answer, "1973");
    assert.ok(data.quiz[0].options.includes(data.quiz[0].answer));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = originalFetch;
    if (previousQuizApiKey === undefined) delete process.env.QUIZAPI_IO_KEY;
    else process.env.QUIZAPI_IO_KEY = previousQuizApiKey;
  }
});

test("serves shuffled prewritten quizzes for 5, 10, or 50 questions without waiting for AI or cloud storage", async () => {
  const originalFetch = globalThis.fetch;
  const previousQuizApiKey = process.env.QUIZAPI_IO_KEY;
  process.env.QUIZAPI_IO_KEY = "test-quizapi-key";
  const externalRequests = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith("http://127.0.0.1:")) return originalFetch(url, options);
    externalRequests.push(String(url));
    throw new Error(`Prewritten quiz should not call an external service: ${url}`);
  };

  const app = express();
  app.use(express.json());
  app.use(createQuizRouter({ claudeApiKeys: [], geminiApiKeys: [] }));
  const server = app.listen(0);

  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    for (const topicId of ["antiUsWar", "geography", "cProgramming"]) {
      for (const numQuestions of [5, 10, 50]) {
        const startedAt = performance.now();
        const response = await originalFetch(`${baseUrl}/api/generate-quiz`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topicId, numQuestions }),
        });
        const elapsedMs = performance.now() - startedAt;
        const data = await response.json();

        assert.equal(response.status, 200, `${topicId} ${numQuestions}: ${data.error}`);
        assert.equal(data.total_questions, numQuestions);
        assert.equal(data.question_bank_size >= numQuestions, true);
        assert.match(data.generator, /Ngân hàng câu hỏi đã biên soạn/);
        assert.ok(elapsedMs < 15_000, `${topicId} ${numQuestions} took ${elapsedMs}ms`);
        assert.equal(new Set(data.quiz.map(({ question }) => question)).size, numQuestions);
        assert.ok(data.quiz.every(({ options, answer }) =>
          options.length === 4 && new Set(options).size === 4 && options.includes(answer)
        ));
      }
    }

    assert.deepEqual(externalRequests, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = originalFetch;
    if (previousQuizApiKey === undefined) delete process.env.QUIZAPI_IO_KEY;
    else process.env.QUIZAPI_IO_KEY = previousQuizApiKey;
  }
});
