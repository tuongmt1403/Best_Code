const DEFAULT_MODEL = "qwen2.5:3b";
const DEFAULT_TIMEOUT_MS = 90_000;

const questionSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answer: { type: "integer" },
          explanation: { type: "string" },
        },
        required: ["prompt", "question", "options", "answer", "explanation"],
      },
    },
  },
  required: ["questions"],
};

function getQuestionSetErrors(data, count) {
  if (!Array.isArray(data?.questions)) return ["response is missing the questions array"];
  const errors = [];
  if (data.questions.length !== count) errors.push(`expected ${count} questions, received ${data.questions.length}`);
  data.questions.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      errors.push(`question ${index + 1} is not an object`);
      return;
    }
    if (typeof item.prompt !== "string" || !item.prompt.trim()) errors.push(`question ${index + 1} has no prompt`);
    if (typeof item.question !== "string" || !item.question.trim()) errors.push(`question ${index + 1} has no text`);
    if (!Array.isArray(item.options) || item.options.length !== 4
      || item.options.some((option) => typeof option !== "string" || !option.trim())
      || new Set(item.options.map((option) => normalizeQuestion(option))).size !== 4) {
      errors.push(`question ${index + 1} does not have four distinct options`);
    }
    if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer > 3) {
      errors.push(`question ${index + 1} has an invalid answer index`);
    }
    if (typeof item.explanation !== "string" || !item.explanation.trim()) errors.push(`question ${index + 1} has no explanation`);
  });
  return errors;
}

function normalizeQuestion(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export async function generateMiniGameQuizWithOllama({
  topic,
  count,
  avoidQuestions = [],
  referenceQuestions = [],
  baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  model = process.env.OLLAMA_MODEL || DEFAULT_MODEL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
}) {
  const recentQuestions = avoidQuestions.slice(-10);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "Bạn là AI tạo câu hỏi trắc nghiệm tiếng Việt. Mỗi câu phải kiểm tra một khía cạnh kiến thức khác nhau, không được trùng ý. Chỉ đưa ra câu hỏi rõ ràng, có một đáp án đúng. Mỗi giải thích không quá 12 từ. Tránh dữ liệu hành chính có thể thay đổi. Tuân thủ chính xác JSON schema và số lượng câu được yêu cầu.",
            },
            {
              role: "user",
              content: [
                `Tạo đúng ${count} câu hỏi trắc nghiệm bằng tiếng Việt cho chủ đề "${topic}".`,
                "Mỗi câu phải hỏi về một sự kiện hoặc khía cạnh khác nhau; không hỏi lại cùng một dữ kiện bằng cách diễn đạt khác.",
                "Mỗi câu gồm prompt, question, đúng 4 options khác nhau, answer là chỉ số từ 0 đến 3, explanation tối đa 12 từ.",
                "Dùng kiến thức phổ thông chắc chắn, tránh câu mơ hồ, thông tin khó xác minh và số liệu hành chính có thể thay đổi.",
                `Dữ kiện đã kiểm tra của chủ đề (hãy dùng làm nguồn sự thật, nhưng tạo cách hỏi mới): ${JSON.stringify(referenceQuestions.map((item) => ({ question: item.question, answer: item.options?.[item.answer], explanation: item.explanation })))}`,
                `Mã biến thể: ${Date.now()}-${Math.random().toString(36).slice(2)}.`,
                `Câu gần đây và câu không được lặp: ${JSON.stringify(recentQuestions.slice(-20))}`,
                "Chỉ trả về JSON object đúng schema.",
              ].join("\n"),
            },
          ],
          format: questionSchema,
          stream: false,
          options: { temperature: 0.4, num_predict: Math.min(4_096, 300 + count * 300) },
        }),
      });
    } catch (error) {
      const unavailable = new Error(
        error.name === "TimeoutError" || error.name === "AbortError"
          ? "Ollama đang tạo câu hỏi lâu hơn dự kiến. Hãy thử lại; lần đầu khởi động model có thể chậm."
          : `Không kết nối được Ollama tại ${baseUrl}. Nếu ứng dụng chạy bằng Docker, hãy dùng http://host.docker.internal:11434 rồi khởi động lại container.`,
      );
      unavailable.code = error.name === "TimeoutError" || error.name === "AbortError"
        ? "OLLAMA_TIMEOUT"
        : "OLLAMA_UNAVAILABLE";
      throw unavailable;
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = typeof data?.error === "string" ? data.error : `HTTP ${response.status}`;
      const error = new Error(`Ollama từ chối yêu cầu (${message}).`);
      error.code = response.status === 404 ? "OLLAMA_MODEL_MISSING" : "OLLAMA_REQUEST_FAILED";
      throw error;
    }

    let generated;
    try {
      generated = JSON.parse(data?.message?.content || "");
    } catch {
      throw new Error("Ollama trả về câu hỏi không đúng định dạng. Hãy thử tạo lại.");
    }
    const schemaErrors = getQuestionSetErrors(generated, count);
    if (schemaErrors.length) {
      throw new Error(`Ollama returned invalid questions: ${schemaErrors.join("; ")}`);
    }

    const normalizedRecent = new Set(recentQuestions.map(normalizeQuestion));
    const normalizedGenerated = generated.questions.map((item) => normalizeQuestion(item.question));
    const hasDuplicates = new Set(normalizedGenerated).size !== normalizedGenerated.length
      || normalizedGenerated.some((item) => normalizedRecent.has(item));
    if (!hasDuplicates) return generated.questions;
    if (attempt === 1) {
      throw new Error("Ollama lặp lại câu hỏi gần đây hai lần. Hãy đổi chủ đề hoặc thử lại sau.");
    }
    recentQuestions.push(...generated.questions.map((item) => item.question));
  }
}
