import { fetchWithGroqKeyFallback } from "./groq-api.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";

function isStringArray(value) {
  return Array.isArray(value)
    && value.length <= 5
    && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

async function groqChat({ apiKey, apiKeys, model, messages, maxTokens = 500, timeoutMs = 12_000, signal }) {
  const keys = apiKeys?.length ? apiKeys : apiKey ? [apiKey] : [];
  if (!keys.length) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const { response } = await fetchWithGroqKeyFallback({
    apiKeys: keys,
    timeoutMs,
    url: GROQ_URL,
    init: {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || DEFAULT_GROQ_MODEL,
      temperature: 0,
      max_tokens: maxTokens,
      reasoning_effort: "none",
      response_format: { type: "json_object" },
      messages,
    }),
    },
    signal,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof data?.error?.message === "string" ? `: ${data.error.message.slice(0, 300)}` : "";
    const error = new Error(`Groq request failed with status ${response.status}${detail}`);
    error.status = response.status;
    throw error;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Groq returned no content.");
  }
  return content;
}

export async function generateWithGroq({ apiKey, apiKeys, model, system, prompt, maxTokens = 2_500 }) {
  const content = await groqChat({
    apiKey,
    apiKeys,
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

export async function reviewWithGroq({
  apiKey,
  apiKeys,
  model,
  task,
  question,
  answer,
  context,
  maxTokens = 500,
  timeoutMs = 12_000,
  signal,
}) {
  if (!apiKey && !apiKeys?.length) {
    return {
      status: "not_configured",
      model: model || DEFAULT_GROQ_MODEL,
      issues: [],
    };
  }

  const content = await groqChat({
    apiKey,
    apiKeys,
    model,
    maxTokens,
    timeoutMs,
    signal,
    messages: [
      {
        role: "system",
        content: [
          "Bạn là bộ rà soát độc lập cho nội dung giáo dục bằng tiếng Việt.",
          "So sánh câu trả lời với câu hỏi, hội thoại trước và tài liệu tham khảo được cung cấp.",
          "Phát hiện lỗi sự kiện/số liệu rõ ràng, nội dung lặp, câu trả lời lạc đề, mâu thuẫn với tài liệu, và lộ trình học không phù hợp với kết quả.",
          "Kiểm tra cả tiền đề và dữ kiện người dùng nêu; nếu chúng sai rõ ràng mà câu trả lời không lịch sự đính chính trước khi trả lời, hãy nêu đó là vấn đề cụ thể.",
          "Không được bịa ra lời nói/lỗi của người dùng hoặc gán cho họ một khẳng định không có trong câu hỏi; nếu câu trả lời làm vậy, hãy nêu đó là vấn đề.",
          "Không coi suy đoán là sự thật; nếu thiếu căn cứ để kết luận đúng sai, dùng verdict uncertain.",
          "Chỉ dùng verdict pass khi không thấy vấn đề đáng kể; dùng concern khi có vấn đề cụ thể.",
          "Trả về một đối tượng json duy nhất với đúng các trường: verdict (pass|concern|uncertain), issues (mảng tối đa 5 chuỗi ngắn bằng tiếng Việt).",
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
