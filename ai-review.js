const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";
const REVIEW_TIMEOUT_MS = 30_000;

function isStringArray(value) {
  return Array.isArray(value)
    && value.length <= 5
    && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

async function groqChat({ apiKey, model, messages, maxTokens = 500 }) {
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(REVIEW_TIMEOUT_MS),
    body: JSON.stringify({
      model: model || DEFAULT_GROQ_MODEL,
      temperature: 0,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`Groq request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Groq returned no content.");
  }
  return content;
}

export async function generateWithGroq({ apiKey, model, system, prompt, maxTokens = 2_500 }) {
  const content = await groqChat({
    apiKey,
    model,
    maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
  });
  let result;
  try {
    result = JSON.parse(content);
  } catch {
    throw new Error("Groq generation returned invalid JSON.");
  }
  return result;
}

export async function reviewWithGroq({ apiKey, model, task, question, answer, context }) {
  if (!apiKey) {
    return {
      status: "not_configured",
      model: model || DEFAULT_GROQ_MODEL,
      issues: [],
    };
  }

  const content = await groqChat({
    apiKey,
    model,
    messages: [
      {
        role: "system",
        content: [
          "Bạn là bộ rà soát độc lập cho nội dung giáo dục bằng tiếng Việt.",
          "So sánh câu trả lời với câu hỏi, hội thoại trước và tài liệu tham khảo được cung cấp.",
          "Phát hiện lỗi sự kiện/số liệu rõ ràng, nội dung lặp, câu trả lời lạc đề, mâu thuẫn với tài liệu, và lộ trình học không phù hợp với kết quả.",
          "Không coi suy đoán là sự thật; nếu thiếu căn cứ để kết luận đúng sai, dùng verdict uncertain.",
          "Chỉ dùng verdict pass khi không thấy vấn đề đáng kể; dùng concern khi có vấn đề cụ thể.",
          "Trả về JSON duy nhất với đúng các trường: verdict (pass|concern|uncertain), issues (mảng tối đa 5 chuỗi ngắn bằng tiếng Việt).",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          task,
          question: String(question || "").slice(0, 4_000),
          context: String(context || "").slice(0, 16_000),
          answer: String(answer || "").slice(0, 8_000),
        }),
      },
    ],
  });

  let review;
  try {
    review = JSON.parse(content);
  } catch {
    throw new Error("Groq review returned invalid JSON.");
  }
  if (!review || !["pass", "concern", "uncertain"].includes(review.verdict) || !isStringArray(review.issues)) {
    throw new Error("Groq review did not match the required response shape.");
  }

  return {
    status: review.verdict === "pass" ? "verified" : review.verdict,
    model: model || DEFAULT_GROQ_MODEL,
    issues: review.issues.map((issue) => issue.trim().slice(0, 300)),
  };
}
