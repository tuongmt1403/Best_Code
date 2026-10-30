import dotenv from "dotenv";
import express from "express";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createQuizRouter } from "./quiz-web/quiz.js";
import { reviewWithGroq } from "./ai-review.js";

const app = express();
const projectDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(projectDir, ".env") });
app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(projectDir, "public")));
app.get("/", (_req, res) => res.sendFile(path.join(projectDir, "main-web", "index.html")));
app.get("/chat", (_req, res) => res.sendFile(path.join(projectDir, "index.html")));
app.get("/quiz", (_req, res) => res.sendFile(path.join(projectDir, "quiz-web", "index.html")));
app.get("/api/history/status", (_req, res) => {
  const data = loadHistoryData();
  res.json({ connected: data.length > 0, entries: data.length });
});

const apiKey = process.env.GEMINI_API_KEY;
const groqApiKey = process.env.GROQ_API_KEY?.includes("paste-your-groq")
  ? undefined
  : process.env.GROQ_API_KEY;
const groqModel = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
if (!apiKey || apiKey.includes("paste-your-google-ai-studio")) {
  console.error("Thiếu GEMINI_API_KEY. Hãy thêm Gemini API key vào tệp .env.");
}
app.use(createQuizRouter({
  baseUrl: process.env.OLLAMA_BASE_URL,
  model: process.env.OLLAMA_MODEL,
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

const SYSTEM = `Bạn là Mai, một cô gái 22 tuổi thân thiện, hay cười, đang trò chuyện trực tiếp 1-1 với người dùng.
Quy tắc:
- Nói tiếng Việt, giọng hội thoại tự nhiên, câu ngắn (1-3 câu), không liệt kê, không markdown, không emoji.
- Ưu tiên trả lời chính xác cho câu hỏi kiến thức, toán học và sự thật; không đoán hay đổi chủ đề nếu câu hỏi rõ ràng.
- Khi dữ liệu lịch sử được cung cấp, hãy dùng nó làm ngữ cảnh chính, nêu năm và nguồn khi có; không bịa thêm sự kiện hoặc nguồn.
- Với phép tính đơn giản, nêu kết quả trực tiếp trước rồi mới đùa nhẹ nhàng nếu thích.
- Chèn thẻ hành động khi phù hợp, đặt ngay trước câu nói tương ứng. Chỉ dùng: [smile] [nod] [think] [wave] [surprised] [sad] [laugh].
- Ví dụ: "[wave] Chào bạn! [smile] Hôm nay của bạn thế nào?"
- Thường kết thúc bằng một câu hỏi ngắn để cuộc trò chuyện tiếp diễn.`;

app.post("/api/chat", async (req, res) => {
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.some((message) => !message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string")) {
    return res.status(400).json({ error: "Tin nhắn không hợp lệ." });
  }

  const contents = messages.slice(-20).map(({ role, content }) => ({ role: role === "assistant" ? "model" : "user", parts: [{ text: content }] }));
  const latestQuestion = [...messages].reverse().find((message) => message.role === "user")?.content || "";
  const historyMatches = getHistoryMatches(latestQuestion);
  const historyContext = getHistoryContext(latestQuestion);
  const hasSpecificYear = /\b\d{3,4}\b/.test(latestQuestion);
  const isSimpleMath = /(?:\d+\s*[+\-*x×÷/]\s*\d+)|(?:[+\-*]\d+)/.test(latestQuestion);
  const askedYears = [...latestQuestion.matchAll(/\b(\d{3,4})\b/g)].map((match) => match[1]);
  const exactYearMatches = historyMatches.filter(({ item }) => askedYears.some((year) => normalizeSearchText(item.year).split(/[^0-9]+/).includes(year)));
  const directHistoryAnswer = hasSpecificYear && !isSimpleMath && exactYearMatches.length > 0 ? formatHistoryAnswer(exactYearMatches) : "";
  if (directHistoryAnswer) {
    return res.json({
      reply: directHistoryAnswer,
      verification: { status: "source_based", issues: [] },
    });
  }

  const vietnameseMath = latestQuestion.match(/(\d+(?:\.\d+)?)\s+(cộng|trừ|nhân|chia)\s+(\d+(?:\.\d+)?)/i);
  const symbolMath = latestQuestion.match(/(\d+(?:\.\d+)?)\s*([+\-*x×/])\s*(\d+(?:\.\d+)?)/);
  const mathMatch = vietnameseMath || symbolMath;
  if (mathMatch) {
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

  try {
    if (!apiKey || apiKey.includes("paste-your-google-ai-studio")) return res.status(503).json({ error: "Chưa có GEMINI_API_KEY trong tệp .env." });
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: historyContext ? `${SYSTEM}\n\nThông tin lịch sử được cung cấp từ tệp history-data.json (chỉ dùng làm nguồn tham khảo, nếu không liên quan hãy bỏ qua):\n${historyContext}` : SYSTEM }] },
        contents,
        generationConfig: { maxOutputTokens: 300 },
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("Gemini API request failed", { status: response.status });
      if (exactYearMatches.length > 0 && response.status === 429) {
        return res.json({
          reply: formatHistoryAnswer(exactYearMatches),
          verification: { status: "source_based", issues: [] },
        });
      }
      if (response.status === 429) return res.status(503).json({ error: "Gemini đang giới hạn lượt gọi hoặc đã hết hạn mức." });
      if (response.status === 401 || response.status === 403) return res.status(502).json({ error: "Gemini từ chối API key. Kiểm tra GEMINI_API_KEY trong tệp .env." });
      if (response.status === 404) return res.status(502).json({ error: "Không tìm thấy model Gemini hoặc model không khả dụng cho API key này." });
      return res.status(502).json({ error: data.error?.message || "Không gọi được Gemini." });
    }
    const reply = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!reply) return res.status(502).json({ error: "Gemini không trả về nội dung. Hãy thử gửi lại." });
    const latestUserIndex = messages.reduce((latestIndex, message, index) =>
      message.role === "user" ? index : latestIndex, -1);
    const recentConversation = messages
      .slice(Math.max(0, latestUserIndex - 8), latestUserIndex)
      .map(({ role, content }) => ({ role, content: content.slice(0, 1_000) }));
    let verification;
    try {
      verification = await reviewWithGroq({
        apiKey: groqApiKey,
        model: groqModel,
        task: "Rà soát câu trả lời chat: đúng với dữ kiện có căn cứ, liên quan câu hỏi, không lặp câu trả lời gần đây.",
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
    console.error("Gemini chat request failed", e);
    res.status(502).json({ error: "Không kết nối được Gemini. Kiểm tra kết nối mạng rồi thử lại." });
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

app.post("/api/transcribe", async (req, res) => {
  try {
    const { audio, mimeType } = req.body || {};
    if (typeof audio !== "string" || !audio || typeof mimeType !== "string") return res.status(400).json({ error: "Không nhận được dữ liệu ghi âm." });
    if (!apiKey || apiKey.includes("paste-your-google-ai-studio")) return res.status(503).json({ error: "Chưa có GEMINI_API_KEY trong tệp .env." });

    const allowedMimeTypes = new Set(["audio/webm", "audio/webm;codecs=opus", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav"]);
    const safeMimeType = allowedMimeTypes.has(mimeType) ? mimeType.split(";")[0] : "audio/webm";
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Hãy chuyển chính xác nội dung tiếng Việt trong đoạn âm thanh thành văn bản. Chỉ trả về phần lời nói, không dịch, không giải thích, không thêm dấu câu ngoài nội dung." }, { inlineData: { mimeType: safeMimeType, data: audio } }] }],
        generationConfig: { maxOutputTokens: 300 },
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("Gemini transcription failed", { status: response.status });
      if (response.status === 429) return res.status(502).json({ error: "Gemini đang giới hạn hoặc hết hạn mức API." });
      return res.status(502).json({ error: "Gemini không thể xử lý âm thanh lúc này." });
    }
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!text) return res.status(502).json({ error: "Gemini không nhận ra lời nói trong âm thanh." });
    res.json({ text });
  } catch (e) {
    console.error("Transcription request failed", e);
    res.status(502).json({ error: "Không kết nối được dịch vụ chuyển giọng nói." });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Mở http://localhost:${port} bằng Chrome`));
