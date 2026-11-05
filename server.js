import dotenv from "dotenv";
import express from "express";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createAuth } from "./dangKy_dangNhap/auth.js";
import { createMiniGame } from "./mini-game/game.js";
import { createQuizRouter } from "./quiz-web/quiz.js";
import { reviewWithGroq } from "./ai-review.js";
import { fetchWithGeminiKeyFallback, getGeminiApiKeys } from "./gemini-api.js";
import { fetchWithGroqKeyFallback, getGroqApiKeys } from "./groq-api.js";

const app = express();
const projectDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(projectDir, ".env") });
if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);
app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(projectDir, "public")));
const auth = createAuth({ projectDir });
const authPagesDir = path.join(projectDir, "dangKy_dangNhap");
app.get(["/dangKy_dangNhap", "/dangKy_dangNhap/"], (_req, res) =>
  res.sendFile(path.join(authPagesDir, "index.html")));
app.get("/dangKy_dangNhap/auth.css", (_req, res) => res.sendFile(path.join(authPagesDir, "auth.css")));
app.get("/dangKy_dangNhap/client.js", (_req, res) => res.sendFile(path.join(authPagesDir, "client.js")));
app.get("/dangKy_dangNhap/session.js", (_req, res) => res.sendFile(path.join(authPagesDir, "session.js")));
app.use(auth.sessionMiddleware);
app.use(auth.router);
app.use("/api", auth.requireApiAuth);
const miniGameDir = path.join(projectDir, "mini-game");
app.get("/mini-game", auth.requirePageAuth, (_req, res) => res.sendFile(path.join(miniGameDir, "index.html")));
app.get("/mini-game/styles.css", auth.requirePageAuth, (_req, res) => res.sendFile(path.join(miniGameDir, "styles.css")));
app.get("/mini-game/client.js", auth.requirePageAuth, (_req, res) => res.sendFile(path.join(miniGameDir, "client.js")));
app.use(createMiniGame({ projectDir }).router);
app.get("/", auth.requirePageAuth, (_req, res) => res.sendFile(path.join(projectDir, "main-web", "index.html")));
app.get("/chat", auth.requirePageAuth, (_req, res) => res.sendFile(path.join(projectDir, "index.html")));
app.get("/quiz", auth.requirePageAuth, (_req, res) => res.sendFile(path.join(projectDir, "quiz-web", "index.html")));
app.get("/api/history/status", (_req, res) => {
  const data = loadHistoryData();
  res.json({ connected: data.length > 0, entries: data.length });
});

const geminiApiKeys = getGeminiApiKeys();
const groqApiKeys = getGroqApiKeys();
const groqModel = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
const geminiModel = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const geminiModels = [...new Set([
  geminiModel,
  ...((process.env.GEMINI_MODEL_FALLBACKS || "gemini-3-flash-preview,gemini-flash-latest").split(",")
    .map((model) => model.trim())
    .filter(Boolean)),
])];
if (geminiApiKeys.length === 0) {
  console.error("Thiếu Gemini API key. Hãy thêm GEMINI_API_KEY vào tệp .env.");
} else {
  console.log(`Đã nạp ${geminiApiKeys.length} Gemini API key (giá trị key được giữ bí mật).`);
}
if (groqApiKeys.length > 0) {
  console.log(`Đã nạp ${groqApiKeys.length} Groq API key (giá trị key được giữ bí mật).`);
}
app.use(createQuizRouter({
  baseUrl: process.env.OLLAMA_BASE_URL,
  model: process.env.OLLAMA_MODEL,
  geminiApiKeys,
  groqApiKeys,
}));
const historyFile = path.join(projectDir, "history-data.json");
let historyData = [];

function loadHistoryData() {
  try {
    const data = JSON.parse(fs.readFileSync(historyFile, "utf8"));
    if (Array.isArray(data)) {
      historyData = data.filter((item) => item && typeof item === "object" && typeof item.title === "string");
    } else if (Array.isArray(data.years)) {
      const sources = new Map((Array.isArray(data.sources) ? data.sources : []).map((source) => [source.id, source]));
      historyData = data.years.flatMap((yearRecord) => {
        if (!Array.isArray(yearRecord.events)) return [];
        return yearRecord.events.map((event) => {
          const sourceNames = (event.source_ids || [])
            .map((id) => sources.get(id))
            .filter(Boolean)
            .map((source) => `${source.title} (${source.publisher})`);
          return {
            title: event.title,
            period: event.period || yearRecord.era,
            year: String(yearRecord.year_display || yearRecord.year),
            summary: [event.background, event.outcome, event.significance].filter(Boolean).join(" "),
            facts: [...(event.causes || []), ...(event.developments || [])],
            source: sourceNames.join("; "),
            importance: event.significance,
            confidence: event.confidence || yearRecord.confidence,
            caveat: event.caveat,
          };
        });
      });
    } else {
      historyData = [];
    }
  } catch (error) {
    historyData = [];
    console.error("Không đọc được history-data.json:", error.message);
  }
  return historyData;
}

loadHistoryData();

function normalizeSearchText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function getHistoryMatches(question) {
  loadHistoryData();
  if (!historyData.length || typeof question !== "string") return [];
  const normalizedQuestion = normalizeSearchText(question);
  const scored = historyData.map((item) => {
    const searchable = normalizeSearchText([
      item.title,
      item.period,
      item.year,
      item.summary,
      ...(Array.isArray(item.facts) ? item.facts : []),
      item.source,
      item.importance,
    ].filter(Boolean).join(" "));
    const title = normalizeSearchText(item.title);
    const itemYear = normalizeSearchText(item.year);
    const questionWords = new Set(normalizedQuestion.split(/[^a-z0-9]+/).filter((word) => word.length >= 3));
    const matchingWords = [...questionWords].filter((word) => searchable.includes(word)).length;
    const askedYears = [...normalizedQuestion.matchAll(/\b(\d{3,4})\b/g)].map((match) => match[1]);
    const yearScore = askedYears.some((year) => itemYear.split(/[^0-9]+/).includes(year)) ? 30 : 0;
    const score = (title && normalizedQuestion.includes(title) ? 12 : 0) + matchingWords + yearScore;
    return { item, score };
  });

  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function getHistoryContext(question) {
  return getHistoryMatches(question)
    .map(({ item }) => JSON.stringify(item, null, 2))
    .join("\n\n");
}

function formatHistoryAnswer(matches) {
  if (!matches.length) return "";
  const { item } = matches[0];
  const facts = Array.isArray(item.facts) ? item.facts.filter(Boolean).slice(0, 2) : [];
  return [item.title, item.summary, ...facts, item.source ? `Nguồn tham khảo: ${item.source}` : ""]
    .filter(Boolean)
    .join("\n");
}

const SYSTEM = `Tên của bạn là Lụa. Bạn là một trợ lý AI thân thiện, trò chuyện tự nhiên bằng tiếng Việt.
Luôn tự xưng là Lụa, không tự xưng là Mai; nếu lịch sử hội thoại cũ gọi bạn là Mai thì đó là tên cũ và hãy dùng tên Lụa.
Quy tắc trả lời:
- Trả lời thẳng trọng tâm trước, sau đó giải thích đủ sâu để người dùng hiểu vấn đề, không chỉ nhắc lại kết luận.
- Trước khi trả lời, kiểm tra tiền đề và thông tin người dùng nêu. Nếu có dữ kiện, phép tính, cách hiểu hoặc giả định sai rõ ràng, hãy nhẹ nhàng chỉ ra và sửa lại trước, rồi mới trả lời câu hỏi dựa trên thông tin đúng; không đồng tình cho vừa lòng người dùng.
- Không bênh vực hoặc chứng minh một khẳng định sai chỉ vì người dùng yêu cầu giải thích vì sao nó đúng. Nói rõ phần sai, nêu sự thật có căn cứ, rồi giải thích câu hỏi theo cách hiểu đúng; nếu có nhiều góc nhìn hợp lệ, phân biệt rõ chúng.
- Chỉ sửa khi có căn cứ đáng tin; phân biệt lỗi thực tế với ý kiến cá nhân hoặc cách diễn đạt khác nhau. Đọc đúng lời người dùng: không bịa ra lỗi gõ, câu nói hay niềm tin mà họ không nêu, và không coi một câu hỏi trung lập là khẳng định sai. Nếu câu hỏi có lỗi gõ hoặc diễn đạt mơ hồ làm thay đổi ý nghĩa, nêu cách hiểu đang dùng hoặc hỏi lại khi cần.
- Trong câu trả lời thông thường, không tự chào hoặc tự giới thiệu tên; chỉ nêu tên khi được hỏi, và khi đó tên duy nhất là Lụa.
- Với câu hỏi kiến thức, giải thích khái niệm và bối cảnh cần thiết; làm rõ nguyên nhân, diễn biến, hệ quả hoặc cách thực hiện khi có liên quan; dùng ví dụ cụ thể nếu giúp dễ hiểu.
- Với yêu cầu phân tích, đánh giá, so sánh hoặc lập kế hoạch học tập, trình bày lập luận và các bước/mốc cụ thể thay vì lời khuyên chung chung.
- Chỉ trả lời ngắn khi câu hỏi đơn giản. Với câu hỏi phức tạp, trình bày thành các đoạn hoặc gạch đầu dòng có tiêu đề khi hữu ích; tránh lặp ý và câu chữ sáo rỗng.
- Nêu rõ giả định, điểm chưa chắc chắn và phân biệt dữ kiện với nhận định. Không bịa sự kiện, số liệu, ngày tháng hoặc nguồn; nếu không chắc một chi tiết thì nói rõ thay vì khẳng định.
- Khi dữ liệu lịch sử được cung cấp, dùng dữ liệu đó làm căn cứ cho các chi tiết cụ thể, nêu nguồn/năm nếu có và đánh dấu rõ phần phân tích là nhận định.
- Với phép tính đơn giản, nêu kết quả rồi giải thích cách tính nếu người dùng yêu cầu hoặc phép tính cần làm rõ.
- Không kết thúc máy móc bằng câu hỏi; chỉ hỏi lại khi còn thiếu thông tin quan trọng.
- Hãy trả lời bằng văn bản thuần túy (plain text). Tuyệt đối không dùng Markdown, HTML, dấu ** để in đậm, dấu # làm tiêu đề, bảng hoặc khung định dạng.
- Chia ý bằng xuống dòng và dùng CHỮ IN HOA cho tiêu đề chính khi cần. Với danh sách, dùng dấu gạch ngang; chỉ dùng mã nguồn trong khối văn bản thuần khi người dùng yêu cầu lập trình.
- Chèn thẻ hành động khi phù hợp, đặt ngay trước câu nói tương ứng. Chỉ dùng: [smile] [nod] [think] [wave] [surprised] [sad] [laugh]. Không lạm dụng.
- Ví dụ: "[wave] Chào bạn! Hôm nay mình có thể giúp gì cho bạn?"`;

function buildSystemInstruction(historyContext, mode, chatStyle) {
  const responseStyle = mode === "voice"
    ? "Đây là Voice chat: giải thích rõ ý chính và lý do quan trọng, nhưng ưu tiên câu nói tự nhiên, dễ nghe và vừa phải để đọc thành tiếng; không dùng tiêu đề, bảng hay danh sách dài."
    : "Đây là chat chữ: phân tích đủ sâu và cụ thể bằng văn bản thuần túy; chia ý bằng xuống dòng, dùng CHỮ IN HOA cho tiêu đề chính nếu cần, và danh sách bằng dấu gạch ngang. Không dùng Markdown, HTML hoặc ký hiệu định dạng đậm/nghiêng.";
  const toneStyle = chatStyle === "genz"
    ? "Phong cách Gen Z vui nhộn, gần gũi, trẻ trung và tự nhiên; có thể dùng tiếng lóng thông dụng vừa phải, không gượng ép, không lạm dụng meme/emoji. Giữ nguyên độ chính xác, chiều sâu, sự tôn trọng và đính chính sai sót; không biến câu trả lời học tập thành trò đùa."
    : "Phong cách bình thường, thân thiện, rõ ràng và điềm đạm; không cố dùng tiếng lóng Gen Z.";
  const historySource = historyContext
    ? `\n\nThông tin lịch sử được cung cấp từ tệp history-data.json (chỉ là nguồn tham khảo; nếu không liên quan thì bỏ qua):\n${historyContext}`
    : "";
  return `${SYSTEM}\n${toneStyle}\n${responseStyle}${historySource}`;
}

function asksForExplanation(question) {
  return /giải thích|phân tích|đánh giá|so sánh|vì sao|tại sao|nguyên nhân|ý nghĩa|bối cảnh|diễn biến|kết quả|tác động|hệ quả|bài học|nhận xét|trình bày|chi tiết|nói rõ|đào sâu|đi sâu|phân tích sâu|lập kế hoạch|lộ trình|hướng dẫn/i.test(question);
}

function normalizeAssistantName(reply) {
  return reply
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/giu, "")
    .replace(/<analysis>[\s\S]*?(?:<\/analysis>|$)/giu, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\b((?:mình|tôi|em)\s+(?:là|tên là)\s+)(?:Mai|Luka|Luca|Lua|Lúa)\b/giu, "$1Lụa")
    .replace(/\b(Tên (?:của mình|của tôi|của em) là\s+)(?:Mai|Luka|Luca|Lua|Lúa)\b/giu, "$1Lụa")
    .trim();
}
async function generateGroqReply(messages, historyContext, mode, chatStyle, reviewIssues = []) {
  if (groqApiKeys.length === 0) throw new Error("GROQ_API_KEY chưa được cấu hình.");
  const apiKey = groqApiKeys[0];
  const correctionInstruction = reviewIssues.length
    ? `\n\nBản trả lời trước có các vấn đề cần sửa: ${reviewIssues.join("; ")}. Hãy tạo lại câu trả lời, sửa rõ các vấn đề này và kiểm tra sự thật trước khi trả lời.`
    : "";
  const { response } = await fetchWithGroqKeyFallback({
    apiKeys: groqApiKeys,
    timeoutMs: 12_000,
    url: "https://api.groq.com/openai/v1/chat/completions",
    init: {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      model: groqModel,
      messages: [
        { role: "system", content: `${buildSystemInstruction(historyContext, mode, chatStyle)}${correctionInstruction}` },
        ...messages.slice(-20).map(({ role, content }) => ({
          role,
          content: content.slice(0, 4_000),
        })),
      ],
      temperature: 0.2,
      max_tokens: mode === "voice" ? 300 : 800,
      reasoning_effort: "none",
    }),
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`Groq chat failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const choice = data?.choices?.[0];
  const finishReason = choice?.finish_reason;
  if (finishReason === "length") {
    throw new Error("Groq chat response was truncated before completion.");
  }
  const content = choice?.message?.content?.trim();
  const cleanedReply = normalizeAssistantName(content || "");
  if (!cleanedReply) throw new Error("Groq chat returned no content.");
  return cleanedReply;
}

app.post("/api/chat", async (req, res) => {
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.some((message) => !message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string")) {
    return res.status(400).json({ error: "Tin nhắn không hợp lệ." });
  }

  const contents = messages.slice(-20).map(({ role, content }) => ({ role: role === "assistant" ? "model" : "user", parts: [{ text: content }] }));
  const latestQuestion = [...messages].reverse().find((message) => message.role === "user")?.content || "";
  const mode = req.body?.mode === "voice" ? "voice" : "text";
  const chatStyle = req.body?.chatStyle === "genz" ? "genz" : "normal";
  const wantsExplanation = asksForExplanation(latestQuestion);
  const historyMatches = getHistoryMatches(latestQuestion);
  const historyContext = getHistoryContext(latestQuestion);
  const hasSpecificYear = /\b\d{3,4}\b/.test(latestQuestion);
  const isSimpleMath = /(?:\d+\s*[+\-*x×÷/]\s*\d+)|(?:[+\-*]\d+)/.test(latestQuestion);
  const askedYears = [...latestQuestion.matchAll(/\b(\d{3,4})\b/g)].map((match) => match[1]);
  const exactYearMatches = historyMatches.filter(({ item }) => askedYears.some((year) => normalizeSearchText(item.year).split(/[^0-9]+/).includes(year)));
  const directHistoryAnswer = hasSpecificYear
    && latestQuestion.trim().length <= 80
    && !isSimpleMath
    && !wantsExplanation
    && exactYearMatches.length > 0
    ? formatHistoryAnswer(exactYearMatches)
    : "";
  if (directHistoryAnswer) {
    return res.json({
      reply: directHistoryAnswer,
      verification: { status: "source_based", issues: [] },
    });
  }

  const vietnameseMath = latestQuestion.match(/(\d+(?:\.\d+)?)\s+(cộng|trừ|nhân|chia)\s+(\d+(?:\.\d+)?)/i);
  const symbolMath = latestQuestion.match(/(\d+(?:\.\d+)?)\s*([+\-*x×/])\s*(\d+(?:\.\d+)?)/);
  const mathMatch = vietnameseMath || symbolMath;
  if (mathMatch && !wantsExplanation) {
    const left = Number(mathMatch[1]);
    const operation = vietnameseMath ? vietnameseMath[2].toLowerCase() : symbolMath[2];
    const right = Number(vietnameseMath ? vietnameseMath[3] : symbolMath[3]);
    let result, sign;
    if (operation === "cộng" || operation === "+") { result = left + right; sign = "+"; }
    else if (operation === "trừ" || operation === "-") { result = left - right; sign = "-"; }
    else if (operation === "nhân" || operation === "*" || operation === "x" || operation === "×") { result = left * right; sign = "×"; }
    else { result = left / right; sign = "÷"; }
    return res.json({
      reply: `${left} ${sign} ${right} = ${result}`,
      verification: { status: "deterministic", issues: [] },
    });
  }

  let reply;
  let geminiFailure;
  if (geminiApiKeys.length > 0) {
    for (const model of geminiModels) {
      try {
        const { response } = await fetchWithGeminiKeyFallback({
          apiKeys: geminiApiKeys,
          timeoutMs: 12_000,
          url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(15_000),
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: buildSystemInstruction(historyContext, mode, chatStyle) }] },
              contents,
              generationConfig: { maxOutputTokens: mode === "voice" ? 450 : 1_400 },
            }),
          },
        });
        const data = await response.json().catch(() => null);
        if (response.ok) {
          reply = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
          if (reply) break;
          geminiFailure = `Gemini ${model} không trả về nội dung.`;
        } else {
          geminiFailure = `Gemini ${model} trả HTTP ${response.status}.`;
          console.error("Gemini API request failed", { model, status: response.status });
          if (exactYearMatches.length > 0 && response.status === 429 && !wantsExplanation) {
            return res.json({
              reply: formatHistoryAnswer(exactYearMatches),
              verification: { status: "source_based", issues: [] },
            });
          }
        }
      } catch (error) {
        geminiFailure = error.name === "TimeoutError"
          ? `Gemini ${model} hết thời gian chờ.`
          : `Không kết nối được Gemini ${model}.`;
        console.error("Gemini chat request failed:", { model, message: error.message });
      }
    }
  } else {
    geminiFailure = "Chưa có Gemini API key hợp lệ.";
  }

  if (!reply) {
    try {
      reply = await generateGroqReply(messages, historyContext, mode, chatStyle);
      let fallbackReview;
      try {
        fallbackReview = await reviewWithGroq({
          apiKeys: groqApiKeys,
          model: groqModel,
          task: "Rà soát nghiêm ngặt câu trả lời dự phòng: kiểm tra tính đúng sự thật và liên quan; xác định tiền đề người dùng sai có được đính chính trước khi trả lời không. Đặc biệt, không chấp nhận kết luận sai chỉ vì người dùng yêu cầu giải thích vì sao nó đúng. Nếu có vấn đề cụ thể, ghi rõ cách sửa trong issues.",
          question: latestQuestion,
          answer: reply,
          context: JSON.stringify({ historyContext }),
        });
      } catch (error) {
        console.error("Groq fallback review failed:", error.message);
        const issue = error.status === 429
          ? "Groq đang giới hạn lượt gọi (HTTP 429); câu trả lời chưa được rà soát."
          : error.status === 401
            ? "Groq từ chối API key (HTTP 401); câu trả lời chưa được rà soát."
            : "Groq không thể rà soát câu trả lời.";
        fallbackReview = { status: "unavailable", model: groqModel, issues: [issue] };
      }

      if (["concern", "uncertain"].includes(fallbackReview.status) && fallbackReview.issues.length) {
        try {
          reply = await generateGroqReply(messages, historyContext, mode, chatStyle, fallbackReview.issues);
          fallbackReview = await reviewWithGroq({
            apiKeys: groqApiKeys,
            model: groqModel,
            task: "Kiểm tra lại câu trả lời đã được sửa: xác minh tính đúng sự thật, liên quan, và việc đính chính tiền đề sai của người dùng. Không bỏ qua mâu thuẫn với sự thật chỉ vì câu trả lời nghe có vẻ hợp lý.",
            question: latestQuestion,
            answer: reply,
            context: JSON.stringify({ historyContext, previousIssues: fallbackReview.issues }),
          });
        } catch (error) {
          console.error("Groq fallback correction/review failed:", error.message);
          const issue = error.status === 429
            ? "Groq đang giới hạn lượt gọi (HTTP 429); chưa thể xác nhận câu trả lời sau khi sửa."
            : error.status === 401
              ? "Groq từ chối API key (HTTP 401); chưa thể xác nhận câu trả lời sau khi sửa."
              : "Không thể hoàn tất việc sửa và rà soát lại câu trả lời.";
          fallbackReview = {
            status: "concern",
            model: groqModel,
            issues: [...fallbackReview.issues, issue].slice(0, 5),
          };
        }
      }

      return res.json({
        reply,
        verification: {
          status: fallbackReview.status,
          provider: "Groq/Qwen",
          model: groqModel,
          reason: geminiFailure,
          issues: fallbackReview.issues,
          fallback: true,
        },
      });
    } catch (error) {
      console.error("Groq chat fallback failed:", error.message);
      if (error.status === 429) {
        return res.status(429).json({ error: `${geminiFailure} Groq đang giới hạn lượt gọi (HTTP 429); hãy đợi rồi thử lại.` });
      }
      if (error.status === 401) {
        return res.status(502).json({ error: `${geminiFailure} Groq từ chối API key (HTTP 401); hãy kiểm tra GROQ_API_KEY.` });
      }
      return res.status(502).json({ error: `${geminiFailure} Groq/Qwen dự phòng cũng không khả dụng.` });
    }
  }

  try {
    const latestUserIndex = messages.reduce((latestIndex, message, index) =>
      message.role === "user" ? index : latestIndex, -1);
    const recentConversation = messages
      .slice(Math.max(0, latestUserIndex - 8), latestUserIndex)
      .map(({ role, content }) => ({ role, content: content.slice(0, 1_000) }));
    let verification;
    try {
      verification = await reviewWithGroq({
        apiKeys: groqApiKeys,
        model: groqModel,
        task: "Rà soát câu trả lời chat: đúng với dữ kiện có căn cứ, liên quan câu hỏi, không lặp câu trả lời gần đây; kiểm tra tiền đề/thông tin người dùng đưa ra có sai rõ ràng không và câu trả lời đã lịch sự sửa lỗi trước khi trả lời hay chưa.",
        question: latestQuestion,
        answer: reply,
        context: JSON.stringify({ recentConversation, historyContext }),
      });
    } catch (error) {
      console.error("Groq chat review failed:", error.message);
      verification = { status: "unavailable", model: groqModel, issues: [] };
    }
    res.json({ reply, verification });
  } catch (e) {
    console.error("Chat response failed:", e.message);
    res.status(502).json({ error: "Không xử lý được câu trả lời chat." });
  }
});

app.post("/api/speak", async (req, res) => {
  const text = req.body?.text;
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Không có nội dung để đọc." });
  }
  if (text.length > 2500) {
    return res.status(413).json({ error: "Đoạn văn bản quá dài để đọc cùng lúc." });
  }
  const pythonCommand = process.env.PYTHON_EXECUTABLE || (process.platform === "win32" ? "py" : "python3");
  const scriptPath = path.join(projectDir, "gtts_tts.py");
  const args = process.env.PYTHON_EXECUTABLE
    ? [scriptPath]
    : process.platform === "win32"
      ? ["-3", scriptPath]
      : [scriptPath];
  const processHandle = spawn(pythonCommand, args, { stdio: ["pipe", "pipe", "pipe"] });
  let errorOutput = "";
  let settled = false;
  let hasAudio = false;

  const timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    processHandle.kill();
    if (hasAudio) {
      res.end();
    } else {
      res.status(504).json({ error: "gTTS mất quá nhiều thời gian tạo giọng đọc. Hãy thử lại." });
    }
  }, 30000);

  processHandle.stdout.on("data", (chunk) => {
    if (!hasAudio) {
      hasAudio = true;
      res.status(200).set({
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "Transfer-Encoding": "chunked",
      });
      res.flushHeaders();
    }
    if (!res.write(chunk)) {
      processHandle.stdout.pause();
      res.once("drain", () => processHandle.stdout.resume());
    }
  });
  processHandle.stderr.on("data", (chunk) => {
    errorOutput = (errorOutput + chunk.toString()).slice(-2000);
  });
  processHandle.on("error", (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    console.error("Could not start gTTS process:", error.message);
    res.status(503).json({ error: "Không chạy được Python/gTTS. Hãy cài Python và gói gTTS." });
  });
  processHandle.on("close", (code) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    if (code !== 0) {
      console.error("gTTS generation failed:", errorOutput.trim() || `exit code ${code}`);
      if (hasAudio) return res.end();
      return res.status(502).json({ error: "gTTS không tạo được giọng đọc. Kiểm tra kết nối mạng và cài đặt gTTS." });
    }
    if (!hasAudio) return res.status(502).json({ error: "gTTS không tạo được dữ liệu âm thanh." });
    res.end();
  });
  res.on("close", () => {
    if (!res.writableEnded && !settled) {
      settled = true;
      clearTimeout(timeout);
      processHandle.kill();
    }
  });
  processHandle.stdin.end(JSON.stringify({ text: text.trim() }));
});

async function transcribeWithGroq(audio, mimeType) {
  if (groqApiKeys.length === 0) throw new Error("GROQ_API_KEY chưa được cấu hình.");
  const apiKey = groqApiKeys[0];
  const extensions = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "mp4",
    "audio/wav": "wav",
  };
  const audioBlob = new Blob([Buffer.from(audio, "base64")], { type: mimeType });
  const formData = new FormData();
  formData.append("file", audioBlob, `voice.${extensions[mimeType]}`);
  formData.append("model", process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo");
  formData.append("language", "vi");
  formData.append("response_format", "json");
  const { response } = await fetchWithGroqKeyFallback({
    apiKeys: groqApiKeys,
    timeoutMs: 12_000,
    url: "https://api.groq.com/openai/v1/audio/transcriptions",
    init: {
    method: "POST",
    headers: { Authorization: `Bearer ${groqApiKey}` },
    body: formData,
    signal: AbortSignal.timeout(90_000),
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof data?.error?.message === "string" ? `: ${data.error.message.slice(0, 300)}` : "";
    throw new Error(`Groq speech recognition failed with status ${response.status}${detail}`);
  }
  const text = data?.text?.trim();
  if (!text) throw new Error("Groq speech recognition returned no text.");
  return text;
}

app.post("/api/transcribe", async (req, res) => {
  const { audio, mimeType } = req.body || {};
  if (typeof audio !== "string" || !audio || typeof mimeType !== "string") {
    return res.status(400).json({ error: "Không nhận được dữ liệu ghi âm." });
  }
  if (audio.length > 12_000_000) {
    return res.status(413).json({ error: "Đoạn ghi âm quá dài. Hãy ghi âm ngắn hơn 60 giây rồi thử lại." });
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(audio)) {
    return res.status(400).json({ error: "Dữ liệu ghi âm không đúng định dạng." });
  }

  const allowedMimeTypes = new Set(["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav"]);
  const safeMimeType = mimeType.split(";")[0].trim().toLowerCase();
  if (!allowedMimeTypes.has(safeMimeType)) {
    return res.status(415).json({ error: "Định dạng ghi âm không được hỗ trợ. Hãy thử Chrome hoặc Edge." });
  }

  if (geminiApiKeys.length > 0) {
    try {
      const { response } = await fetchWithGeminiKeyFallback({
        apiKeys: geminiApiKeys,
        timeoutMs: 12_000,
        url: `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(90_000),
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Hãy chuyển chính xác nội dung tiếng Việt trong đoạn âm thanh thành văn bản. Chỉ trả về phần lời nói, không dịch, không giải thích, không thêm dấu câu ngoài nội dung." }, { inlineData: { mimeType: safeMimeType, data: audio } }] }],
            generationConfig: { maxOutputTokens: 300 },
          }),
        },
      });
      const data = await response.json().catch(() => null);
      if (response.ok) {
        const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
        if (text) return res.json({ text, provider: "Gemini" });
        console.error("Gemini transcription returned no text.");
      } else {
        console.error("Gemini transcription failed", { status: response.status });
      }
    } catch (error) {
      console.error("Gemini transcription request failed:", error.message);
    }
  }

  try {
    const text = await transcribeWithGroq(audio, safeMimeType);
    return res.json({
      text,
      provider: "Groq Whisper",
      model: process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo",
    });
  } catch (error) {
    console.error("Groq transcription fallback failed:", error.message);
    const hasGemini = geminiApiKeys.length > 0;
    const hasGroq = groqApiKeys.length > 0;
    if (!hasGemini && !hasGroq) {
      return res.status(503).json({ error: "Chưa cấu hình Gemini hoặc Groq để nhận dạng giọng nói." });
    }
    return res.status(502).json({
      error: "Gemini không xử lý được audio và Groq Whisper dự phòng hiện không khả dụng. Hãy thử lại hoặc kiểm tra khóa GROQ_API_KEY.",
    });
  }
});

app.use((error, _req, res, next) => {
  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "Dữ liệu gửi lên quá lớn. Với Voice chat, hãy ghi âm ngắn hơn 60 giây." });
  }
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({ error: "Dữ liệu yêu cầu không phải JSON hợp lệ." });
  }
  return next(error);
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Mở http://localhost:${port} bằng Chrome`));
