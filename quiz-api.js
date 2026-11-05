const DEFAULT_QUIZ_API_BASE_URL = "https://quizapi.io";
const QUIZ_API_TIMEOUT_MS = 30_000;

export class QuizApiError extends Error {
  constructor(message, { status, code, quizId } = {}) {
    super(message);
    this.name = "QuizApiError";
    this.status = status;
    this.code = code;
    this.quizId = quizId;
  }
}

async function requestQuizApi({ apiKey, baseUrl, path, method, body }) {
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(QUIZ_API_TIMEOUT_MS),
    });
  } catch (error) {
    throw new QuizApiError(
      error.name === "TimeoutError"
        ? "QuizAPI.io không phản hồi kịp thời."
        : "Không kết nối được với QuizAPI.io.",
      { code: error.name === "TimeoutError" ? "QUIZ_API_TIMEOUT" : "QUIZ_API_UNAVAILABLE" },
    );
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new QuizApiError(
      typeof data?.error === "string" ? data.error.slice(0, 300) : `QuizAPI.io trả HTTP ${response.status}.`,
      { status: response.status },
    );
  }
  return data;
}

export async function createQuizOnQuizApi({
  apiKey,
  baseUrl = DEFAULT_QUIZ_API_BASE_URL,
  title,
  description,
  category,
  tags,
  difficulty = "MEDIUM",
  quiz,
}) {
  if (!apiKey) {
    throw new QuizApiError("QUIZAPI_IO_KEY chưa được cấu hình.", { code: "QUIZ_API_NOT_CONFIGURED" });
  }
  if (!Array.isArray(quiz) || quiz.length < 1 || quiz.length > 50) {
    throw new QuizApiError("QuizAPI.io chỉ nhận từ 1 đến 50 câu hỏi mỗi lần nhập.", { code: "INVALID_QUIZ" });
  }

  const created = await requestQuizApi({
    apiKey,
    baseUrl,
    path: "/api/v1/quizzes",
    method: "POST",
    body: {
      title: title.slice(0, 200),
      description: description.slice(0, 2_000),
      category: category.slice(0, 100),
      difficulty,
      tags: tags.slice(0, 20).map((tag) => tag.slice(0, 50)),
      published: false,
    },
  });
  const quizId = created?.data?.id;
  if (created?.success !== true || typeof quizId !== "string" || !quizId) {
    throw new QuizApiError("QuizAPI.io không trả về mã Quiz hợp lệ sau khi tạo.", { code: "INVALID_CREATE_RESPONSE" });
  }

  try {
    const imported = await requestQuizApi({
      apiKey,
      baseUrl,
      path: `/api/v1/quizzes/${encodeURIComponent(quizId)}/questions/batch`,
      method: "POST",
      body: {
        questions: quiz.map((item) => ({
          text: item.question,
          type: "MULTIPLE_CHOICE",
          difficulty,
          explanation: item.explanation,
          answers: item.options.map((text) => ({
            text,
            isCorrect: text === item.answer,
          })),
        })),
      },
    });
    if (imported?.success !== true || imported?.data?.questionsCreated !== quiz.length) {
      throw new QuizApiError("QuizAPI.io không xác nhận đã lưu đủ câu hỏi.", {
        code: "INCOMPLETE_IMPORT",
        quizId,
      });
    }
  } catch (error) {
    if (error instanceof QuizApiError) {
      error.quizId = quizId;
      throw error;
    }
    throw new QuizApiError("Không nhập được câu hỏi vào QuizAPI.io.", { quizId });
  }

  return { quizId };
}
