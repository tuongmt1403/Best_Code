import { fetchWithClaudeKeyFallback, getClaudeApiKeys } from "./claude-api.js";

const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_CLAUDE_MODEL = process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";

function isStringArray(value) {
  return Array.isArray(value)
    && value.length <= 5
    && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

async function claudeChat({ apiKey, apiKeys, model, system, messages, maxTokens = 500, timeoutMs = 12_000, signal }) {
  const keys = apiKeys?.length ? apiKeys : apiKey ? [apiKey] : getClaudeApiKeys();
  if (!keys.length) {
    throw new Error("CLAUDE_API_KEY is not configured.");
  }

  const { response } = await fetchWithClaudeKeyFallback({
    apiKeys: keys,
    timeoutMs,
    url: CLAUDE_URL,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || DEFAULT_CLAUDE_MODEL,
        system: system || "",
        max_tokens: maxTokens,
        temperature: 0,
        messages,
      }),
    },
    signal,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof data?.error?.message === "string" ? `: ${data.error.message.slice(0, 300)}` : "";
    const error = new Error(`Claude request failed with status ${response.status}${detail}`);
    error.status = response.status;
    throw error;
  }

  const content = data?.content
    ?.map((part) => (part?.type === "text" ? String(part.text || "") : ""))
    .join("")
    .trim();

  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Claude returned no content.");
  }
  return content;
}

export async function generateWithClaude({ apiKey, apiKeys, model, system, prompt, maxTokens = 2_500 }) {
  const content = await claudeChat({
    apiKey,
    apiKeys,
    model,
    maxTokens,
    messages: [
      { role: "user", content: prompt },
    ],
    system,
  });

  let result;
  try {
    result = JSON.parse(content);
  } catch {
    throw new Error("Claude generation returned invalid JSON.");
  }
  return result;
}

export async function reviewWithClaude({
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
  const keys = apiKeys?.length ? apiKeys : apiKey ? [apiKey] : [];
  if (!keys.length) {
    return {
      status: "not_configured",
      model: model || DEFAULT_CLAUDE_MODEL,
      issues: [],
    };
  }

  const content = await claudeChat({
    apiKey,
    apiKeys: keys,
    model,
    maxTokens,
    timeoutMs,
    signal,
    system: [
      "Bạn là bộ rà soát độc lập cho nội dung giáo dục bằng tiếng Việt.",
      "So sánh câu trả lời với câu hỏi, hội thoại trước và tài liệu tham khảo được cung cấp.",
      "Phát hiện lỗi sự kiện/số liệu rõ ràng, nội dung lặp, câu trả lời lạc đề, mâu thuẫn với tài liệu, và lộ trình học không phù hợp với kết quả.",
      "Kiểm tra cả tiền đề và dữ kiện người dùng nêu; nếu chúng sai rõ ràng mà câu trả lời không lịch sự đính chính trước khi trả lời, hãy nêu đó là vấn đề cụ thể.",
      "Không được bịa ra lời nói/lỗi của người dùng hoặc gán cho họ một khẳng định không có trong câu hỏi; nếu câu trả lời làm vậy, hãy nêu đó là vấn đề.",
      "Không coi suy đoán là sự thật; nếu thiếu căn cứ để kết luận đúng sai, dùng verdict uncertain.",
      "Chỉ dùng verdict pass khi không thấy vấn đề đáng kể; dùng concern khi có vấn đề cụ thể.",
      "Trả về một đối tượng json duy nhất với đúng các trường: verdict (pass|concern|uncertain), issues (mảng tối đa 5 chuỗi ngắn bằng tiếng Việt).",
    ].join(" "),
    messages: [
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
    throw new Error("Claude review returned invalid JSON.");
  }

  if (!review || !["pass", "concern", "uncertain"].includes(review.verdict) || !isStringArray(review.issues)) {
    throw new Error("Claude review did not match the required response shape.");
  }

  return {
    status: review.verdict === "pass" ? "verified" : review.verdict,
    model: model || DEFAULT_CLAUDE_MODEL,
    issues: review.issues.map((issue) => issue.trim().slice(0, 300)),
  };
}

export const generateWithGroq = generateWithClaude;
export const reviewWithGroq = reviewWithClaude;
