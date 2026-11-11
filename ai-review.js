import { fetchWithGroqKeyFallback } from "./groq-api.js";
import { fetchWithClaudeKeyFallback, getClaudeApiKeys } from "./claude-api.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";
const DEFAULT_CLAUDE_MODEL = process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";

function isStringArray(value) {
  return Array.isArray(value)
    && value.length <= 5
    && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

function shouldUseClaudeFallback(error) {
  if (!error) return false;
  const status = Number(error.status || 0);
  return status === 401 || status === 403 || status === 429 || status >= 500 || error.name === "TimeoutError";
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
        Authorization: `Bearer ${keys[0]}`,
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

async function claudeChat({ apiKey, apiKeys, model, system, messages, maxTokens = 500, timeoutMs = 12_000, signal }) {
  const keys = apiKeys?.length ? apiKeys : apiKey ? [apiKey] : [];
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

export async function generateWithGroq({ apiKey, apiKeys, model, system, prompt, maxTokens = 2_500 }) {
  const configuredGroqKeys = apiKeys?.length ? apiKeys : apiKey ? [apiKey] : [];
  const configuredClaudeKeys = getClaudeApiKeys();

  if (!configuredGroqKeys.length && !configuredClaudeKeys.length) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  if (!configuredGroqKeys.length) {
    return generateWithClaude({
      apiKeys: configuredClaudeKeys,
      model: model || DEFAULT_CLAUDE_MODEL,
      system,
      prompt,
      maxTokens,
    });
  }

  try {
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
  } catch (error) {
    if (!configuredClaudeKeys.length || !shouldUseClaudeFallback(error)) {
      throw error;
    }
    return generateWithClaude({
      apiKeys: configuredClaudeKeys,
      model: model || DEFAULT_CLAUDE_MODEL,
      system,
      prompt,
      maxTokens,
    });
  }
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
  const configuredGroqKeys = apiKeys?.length ? apiKeys : apiKey ? [apiKey] : [];
  const configuredClaudeKeys = getClaudeApiKeys();

  if (!configuredGroqKeys.length && !configuredClaudeKeys.length) {
    return {
      status: "not_configured",
      model: model || DEFAULT_GROQ_MODEL,
      issues: [],
    };
  }

  if (!configuredGroqKeys.length) {
    return reviewWithClaude({
      apiKeys: configuredClaudeKeys,
      model: model || DEFAULT_CLAUDE_MODEL,
      task,
      question,
      answer,
      context,
      maxTokens,
      timeoutMs,
      signal,
    });
  }

  try {
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
  } catch (error) {
    if (!configuredClaudeKeys.length || !shouldUseClaudeFallback(error)) {
      throw error;
    }
    return reviewWithClaude({
      apiKeys: configuredClaudeKeys,
      model: model || DEFAULT_CLAUDE_MODEL,
      task,
      question,
      answer,
      context,
      maxTokens,
      timeoutMs,
      signal,
    });
  }
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
  if (!apiKey && !apiKeys?.length) {
    return {
      status: "not_configured",
      model: model || DEFAULT_CLAUDE_MODEL,
      issues: [],
    };
  }

  const content = await claudeChat({
    apiKey,
    apiKeys,
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
