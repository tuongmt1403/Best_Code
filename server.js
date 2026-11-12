import dotenv from "dotenv";
import express from "express";
import Database from "better-sqlite3";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createAuth } from "./dangKy_dangNhap/auth.js";
import { createAvatarProfile } from "./avatar-profile.js";
import { createMiniGame } from "./mini-game/game.js";
import { generateMiniGameQuizWithOllama } from "./mini-game/ollama.js";
import { createQuizRouter } from "./quiz-web/quiz.js";
import { reviewWithGroq } from "./ai-review.js";
import { fetchWithGeminiKeyFallback, getGeminiApiKeys } from "./gemini-api.js";
import { fetchWithGroqKeyFallback, getGroqApiKeys } from "./groq-api.js";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

const app = express();
const projectDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(projectDir, ".env") });

const elevenLabsApiKeys = Array.from(new Set([
  process.env.ELEVENLABS_API_KEY,
  process.env.ELEVENLABS_API_KEY_2,
  process.env.ELEVENLABS_API_KEY_3,
  process.env.ELEVENLABS_API_KEY_4,
  process.env.ELEVENLABS_API_KEY_5,
  process.env.ELEVENLABS_API_KEY_6,
  process.env.ELEVENLABS_API_KEY_7,
  process.env.ELEVENLABS_API_KEY_8,
].map((key) => String(key || "").trim()).filter((key) => key && !/paste-your-.*elevenlabs|your[-_ ]?api[-_ ]?key|replace[-_ ]?me/i.test(key))));
let elevenLabsKeyCursor = 0;
const elevenLabsAudioCache = new Map();
const elevenLabsAudioPending = new Map();

function getElevenLabsApiKeys() {
  if (!elevenLabsApiKeys.length) return [];
  return Array.from({ length: elevenLabsApiKeys.length }, (_, offset) => {
    return elevenLabsApiKeys[(elevenLabsKeyCursor + offset) % elevenLabsApiKeys.length];
  });
}

function advanceElevenLabsKey() {
  if (elevenLabsApiKeys.length > 1) {
    elevenLabsKeyCursor = (elevenLabsKeyCursor + 1) % elevenLabsApiKeys.length;
  }
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function extractAttachments(rawAttachments) {
  if (!Array.isArray(rawAttachments) || rawAttachments.length === 0) {
    return { attachments: [], textContext: "", inlineFiles: [], error: null };
  }
  if (rawAttachments.length > 5) {
    return { attachments: [], textContext: "", inlineFiles: [], error: "Chỉ được gửi tối đa 5 tệp cùng lúc." };
  }

  const accepted = [];
  const textParts = [];
  const inlineFiles = [];
  const totalLimit = 12_000_000;
  let totalSize = 0;

  for (const item of rawAttachments) {
    if (!item || typeof item.name !== "string" || typeof item.mimeType !== "string" || typeof item.data !== "string") {
      return { attachments: [], textContext: "", inlineFiles: [], error: "Dữ liệu tệp không hợp lệ." };
    }
    const name = item.name.slice(0, 200);
    const mimeType = item.mimeType.split(";")[0].trim().toLowerCase();
    const data = item.data;
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) {
      return { attachments: [], textContext: "", inlineFiles: [], error: `Tệp "${name}" không đúng định dạng dữ liệu.` };
    }
    const buffer = Buffer.from(data, "base64");
    totalSize += buffer.length;
    if (buffer.length === 0 || buffer.length > 8_000_000 || totalSize > totalLimit) {
      return { attachments: [], textContext: "", inlineFiles: [], error: `Tệp "${name}" quá lớn. Mỗi tệp tối đa 8 MB và tổng tối đa 12 MB.` };
    }

    accepted.push({ name, mimeType, size: buffer.length });
    if (/^image\/(png|jpeg|webp|gif|heic|heif)$/.test(mimeType) || mimeType === "application/pdf") {
      inlineFiles.push({ name, mimeType, data });
    }

    const lowerName = name.toLowerCase();
    try {
      if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
        const parser = new PDFParse({ data: buffer });
        try {
          const result = await parser.getText();
          textParts.push(`Nội dung tệp PDF "${name}":\n${String(result.text || "").slice(0, 30_000)}`);
        } finally {
          await parser.destroy();
        }
      } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || lowerName.endsWith(".docx")) {
        const result = await mammoth.extractRawText({ buffer });
        textParts.push(`Nội dung tệp DOCX "${name}":\n${String(result.value || "").slice(0, 30_000)}`);
      } else if (/^(?:text\/|application\/json|application\/xml)/.test(mimeType) || /\.(txt|md|csv|json|xml|js|jsx|ts|tsx|py|java|c|cpp|html|css|log)$/i.test(lowerName)) {
        const text = buffer.toString("utf8").replace(/\0/g, "").slice(0, 30_000);
        textParts.push(`Nội dung tệp văn bản "${name}":\n${text}`);
      } else if (!/^image\//.test(mimeType)) {
        return { attachments: [], textContext: "", inlineFiles: [], error: `Không hỗ trợ định dạng tệp "${name}". Hãy gửi ảnh, PDF, DOCX hoặc tệp văn bản.` };
      }
    } catch (error) {
      return { attachments: [], textContext: "", inlineFiles: [], error: `Không thể đọc tệp "${name}": ${error.message}` };
    }
  }

  return {
    attachments: accepted,
    textContext: textParts.join("\n\n"),
    inlineFiles,
    error: null,
  };
}

async function findRelatedResources(question) {
  const query = String(question || "").trim().slice(0, 180);
  if (!query) return { direction: "Tiếp tục đặt câu hỏi cụ thể để nhận lời giải thích sâu hơn.", links: [] };

  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(`${query} bài viết tham khảo tiếng Việt`)}&format=rss`;
    const response = await fetch(url, { signal: AbortSignal.timeout(4_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();
    const links = [];
    for (const item of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
      const block = item[1];
      const title = decodeHtmlEntities(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1]);
      const link = decodeHtmlEntities(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]);
      if (!title || !/^https?:\/\//i.test(link) || /(?:bing\.com|microsoft\.com)/i.test(link)) continue;
      if (!links.some((entry) => entry.url === link)) links.push({ title, url: link });
      if (links.length >= 3) break;
    }
    return {
      direction: "Tìm hiểu tiếp các nguồn bên dưới, đối chiếu dữ kiện và áp dụng bằng một ví dụ thực tế.",
      links,
    };
  } catch (error) {
    console.error("Related-resource search failed:", error.message);
    return {
      direction: "Tìm hiểu thêm bằng tài liệu chính thống, sách giáo khoa hoặc bài giảng có nguồn rõ ràng.",
      links: [],
    };
  }
}
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
const avatarProfile = createAvatarProfile({ projectDir });
app.use("/api/player-avatar", avatarProfile.router);
app.use(avatarProfile.attachToRequest);

const chatHistoryDb = new Database(path.join(projectDir, ".data", "chat-history.sqlite"));
chatHistoryDb.pragma("journal_mode = WAL");
chatHistoryDb.exec(`
  CREATE TABLE IF NOT EXISTS chat_history (
    user_id TEXT PRIMARY KEY,
    messages TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

function normalizeChatHistory(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && ["user", "assistant"].includes(message.role) && typeof message.content === "string")
    .map((message) => ({ role: message.role, content: message.content.slice(0, 20_000) }))
    .slice(-100);
}

app.get("/api/chat/history", (req, res) => {
  const row = chatHistoryDb.prepare("SELECT messages FROM chat_history WHERE user_id = ?").get(req.authUser.id);
  let messages = [];
  try { messages = normalizeChatHistory(row ? JSON.parse(row.messages) : []); } catch { messages = []; }
  res.set("Cache-Control", "no-store");
  res.json({ messages });
});

app.put("/api/chat/history", (req, res) => {
  const messages = normalizeChatHistory(req.body?.messages);
  chatHistoryDb.prepare(`
    INSERT INTO chat_history (user_id, messages, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at
  `).run(req.authUser.id, JSON.stringify(messages), Date.now());
  res.json({ saved: true, count: messages.length });
});

app.delete("/api/chat/history", (req, res) => {
  chatHistoryDb.prepare("DELETE FROM chat_history WHERE user_id = ?").run(req.authUser.id);
  res.json({ cleared: true });
});
const miniGameDir = path.join(projectDir, "mini-game");
app.get("/mini-game", auth.requirePageAuth, (_req, res) => res.sendFile(path.join(miniGameDir, "index.html")));
app.get("/mini-game/styles.css", auth.requirePageAuth, (_req, res) => res.sendFile(path.join(miniGameDir, "styles.css")));
app.get("/mini-game/client.js", auth.requirePageAuth, (_req, res) => res.sendFile(path.join(miniGameDir, "client.js")));
const elevenLabsTestDir = path.join(projectDir, "elevenlabs-test");
app.get("/elevenlabs-test", auth.requirePageAuth, (_req, res) => res.sendFile(path.join(elevenLabsTestDir, "index.html")));
app.get("/elevenlabs-test/styles.css", auth.requirePageAuth, (_req, res) => res.sendFile(path.join(elevenLabsTestDir, "styles.css")));
app.get("/elevenlabs-test/client.js", auth.requirePageAuth, (_req, res) => res.sendFile(path.join(elevenLabsTestDir, "client.js")));
app.use(createMiniGame({
  projectDir,
  generateQuestions: generateMiniGameQuestions,
  findUserByUsername: auth.findUserByUsername,
}).router);
app.get("/", auth.requirePageAuth, (_req, res) => res.sendFile(path.join(projectDir, "main-web", "index.html")));
app.get("/chat", auth.requirePageAuth, (_req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.sendFile(path.join(projectDir, "index.html"));
});
app.get("/quiz", auth.requirePageAuth, (_req, res) => res.sendFile(path.join(projectDir, "quiz-web", "index.html")));
app.get("/api/history/status", (_req, res) => {
  const data = loadHistoryData();
  res.json({ connected: data.length > 0, entries: data.length });
});

const geminiApiKeys = getGeminiApiKeys();
const groqApiKeys_server = getGroqApiKeys();
const groqModel_server = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
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
  console.log(`Đã nạp ${geminiApiKeys.length} Gemini API key.`);
}
if (groqApiKeys_server.length > 0) {
  console.log(`Đã nạp ${groqApiKeys_server.length} Groq API key.`);
}

if (elevenLabsApiKeys.length > 0) {
  console.log(`Đã nạp ${elevenLabsApiKeys.length} ElevenLabs API key (tự chuyển khi key hết quota hoặc bị từ chối).`);
}

async function generateMiniGameQuestions({
  topic,
  count,
  avoidQuestions,
  referenceQuestions = [],
  avoidKeywords = [],
  mode = "quiz",
}) {
  const isObstacleMode = mode === "obstacle";
  const isOlympiaMode = mode === "olympia";
  const isStandardQuizMode = mode === "quiz";
  const questionCount = isObstacleMode ? count + 1 : count;
  const generationTimeoutMs = isObstacleMode ? 30_000 : 10_000;
  const prompt = isObstacleMode
    ? [
      `Tạo một bộ Vượt Chướng Ngại Vật mới bằng tiếng Việt theo đúng chủ đề "${topic}".`,
      "Từ khóa ẩn phải là một danh từ/cụm danh từ cụ thể, hợp lý với chủ đề; viết HOA, không dấu, không khoảng trắng.",
      `Tạo đúng ${count} câu hàng ngang có độ khó tăng dần, sau đó thêm 1 câu hỏi ô trung tâm ở vị trí cuối cùng (câu số ${count + 1}).`,
      "Mỗi câu phải có prompt, question, đúng 4 options, answer (chỉ số 0-3), explanation ngắn. Chỉ có một đáp án đúng.",
      `Mỗi đáp án đúng của ${count} hàng ngang phải liên hệ rõ ràng, thuyết phục với từ khóa ẩn. Nêu mối liên hệ trong logic.`,
      "Câu ô trung tâm phải hỏi trực tiếp từ khóa ẩn là gì. Một option phải chứa chính xác từ khóa ẩn (không dấu, viết hoa, không khoảng trắng) và answer phải trỏ đúng option đó; ba option còn lại là từ khóa nhiễu cùng chủ đề. Không dùng câu hỏi trung tâm chung chung.",
      "Tự thiết kế một tranh minh họa vector vuông, đẹp, dễ nhận ra, gợi ý cho từ khóa nhưng không viết chữ và không để lộ đáp án trực tiếp. Trả illustration gồm background là mã màu #RRGGBB và elements là 10-24 hình theo thứ tự từ sau ra trước. Mỗi hình là một trong các dạng {type:'circle',cx,cy,r,fill}, {type:'ellipse',cx,cy,rx,ry,fill}, {type:'rect',x,y,width,height,fill,rx?}, {type:'line',x1,y1,x2,y2,stroke,strokeWidth}, {type:'polygon',points:[[x,y],...],fill}. Tọa độ nằm trong khung 0-100; dùng màu #RRGGBB. Hãy vẽ thành bố cục có chủ thể, nền và chi tiết, không chỉ vài hình cơ bản.",
      "Dùng kiến thức phổ thông chắc chắn, tránh câu mơ hồ, dữ kiện hành chính hoặc số liệu khó xác minh.",
      "Không lặp hoặc viết lại gần giống các câu và từ khóa cần tránh.",
      `Mã biến thể: ${Date.now()}-${Math.random().toString(36).slice(2)}.`,
      `Câu gần đây cần tránh:\n${JSON.stringify((avoidQuestions || []).slice(-10))}`,
      `Từ khóa gần đây cần tránh:\n${JSON.stringify(avoidKeywords.slice(-10))}`,
      `Chỉ trả JSON object đúng dạng {"obstacle":{"keyword":"TU_KHOA","logic":"Giải thích liên hệ của từng hàng ngang với từ khóa","illustration":{"background":"#RRGGBB","elements":[{"type":"circle","cx":50,"cy":50,"r":15,"fill":"#RRGGBB"}]}},"questions":[...]} với mảng questions có đúng ${count + 1} phần tử: ${count} câu đầu là HÀNG NGANG 1 đến ${count}, phần tử cuối là Ô TRUNG TÂM. Mỗi câu có prompt, question, options gồm đúng 4 đáp án, answer là chỉ số 0-3, explanation. Câu trung tâm hỏi từ khóa bí ẩn là gì; options phải có đúng obstacle.keyword. Trong illustration, trả 10-24 hình hợp lệ theo cấu trúc; chỉ dùng type circle, ellipse, rect, line, polygon. Không thêm markdown hay văn bản ngoài JSON.`,
    ].join("\n")
    : isOlympiaMode
      ? [
        `Tạo một ván Đường lên đỉnh Olympia bằng tiếng Việt theo đúng chủ đề "${topic}".`,
        "Tạo một câu hỏi mở bao quát để giới thiệu chủ đề; người chơi nhìn hình và nghe câu này trong 25 giây trước khi vào các câu nhánh.",
        `Tạo đúng ${count} câu hỏi nhánh ngắn, rõ, tăng dần độ khó; câu hỏi phải trả lời được bằng cụm từ ngắn.`,
        "Mỗi câu nhánh gồm prompt, question, answer, acceptedAnswers (mảng cách viết tương đương), explanation. Không tạo lựa chọn trắc nghiệm.",
        "Đảm bảo đáp án chính xác, phổ thông; không tạo câu mơ hồ hoặc đòi hỏi ý kiến chủ quan.",
        "Câu hỏi mở đầu và các câu nhánh cần liên kết thành một chủ đề lớn thống nhất.",
        `Mã biến thể: ${Date.now()}-${Math.random().toString(36).slice(2)}.`,
        `Câu gần đây cần tránh:\n${JSON.stringify((avoidQuestions || []).slice(-10))}`,
        'Chỉ trả JSON theo dạng {"introQuestion":"Câu hỏi mở bao quát","introExplanation":"Tóm tắt chủ đề","questions":[{"prompt":"NHÁNH 1","question":"...","answer":"...","acceptedAnswers":["..."],"explanation":"..."}]}. Không thêm markdown hay văn bản ngoài JSON.',
      ].join("\n")
      : [
      `Tạo đúng ${count} câu hỏi trắc nghiệm bằng tiếng Việt cho chủ đề "${topic}".`,
      "Mỗi câu gồm prompt, question, đúng 4 options, answer (chỉ số 0-3), explanation tối đa 12 từ. Chỉ có một đáp án đúng.",
      "Đa dạng câu hỏi nhận biết, hiểu, đọc dữ kiện, suy luận hoặc vận dụng; dùng kiến thức phổ thông phổ biến, chắc chắn và không mơ hồ.",
      "Tránh số liệu chính xác, thời điểm/mùa vụ hoặc dữ kiện hành chính dễ nhầm nếu không chắc chắn.",
      "Không lặp hoặc viết lại gần giống các câu cần tránh; tự kiểm tra độ chính xác của từng câu và đáp án.",
      `Mã biến thể: ${Date.now()}-${Math.random().toString(36).slice(2)}.`,
      `Câu gần đây cần tránh:\n${JSON.stringify((avoidQuestions || []).slice(-10))}`,
      'Chỉ trả JSON object đúng dạng {"questions":[{"prompt":"...","question":"...","options":["...","...","...","..."],"answer":0,"explanation":"..."}]}. Không thêm markdown hay văn bản ngoài JSON.',
    ].join("\n");
  let generated;
  if (isStandardQuizMode) {
    try {
      generated = {
        questions: await generateMiniGameQuizWithOllama({
          topic,
          count: questionCount,
          avoidQuestions,
          referenceQuestions,
        }),
      };
    } catch (error) {
      console.error("Mini-game Ollama generation failed:", error.message);
      if (geminiApiKeys.length === 0) {
        throw Object.assign(error, { userMessage: error.message });
      }
    }
  }
  if (!generated) {
    if (geminiApiKeys.length === 0) throw new Error("Chưa cấu hình Gemini API key cho chế độ này.");
    try {
      const { response } = await fetchWithGeminiKeyFallback({
        apiKeys: geminiApiKeys,
        timeoutMs: generationTimeoutMs,
        signal: AbortSignal.timeout(generationTimeoutMs),
        url: `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.6,
              maxOutputTokens: isObstacleMode ? 6_000 : 2_500,
              responseMimeType: "application/json",
            },
          }),
        },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(`Gemini trả HTTP ${response.status}.`);
      const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
      if (!text) throw new Error("Gemini không trả về bộ câu hỏi.");
      generated = JSON.parse(text);
      if (!Array.isArray(generated?.questions) || generated.questions.length !== questionCount) {
        throw new Error(`Gemini không trả đúng ${questionCount} câu hỏi.`);
      }
      if (isObstacleMode && (!generated.obstacle || typeof generated.obstacle.keyword !== "string"
        || typeof generated.obstacle.logic !== "string")) {
        throw new Error("Gemini không trả đúng từ khóa và logic của chướng ngại vật.");
      }
      if (isOlympiaMode && (typeof generated.introQuestion !== "string"
        || !generated.introQuestion.trim()
        || generated.questions.some((question) => typeof question.answer !== "string"
          || !question.answer.trim()
          || (question.acceptedAnswers !== undefined && !Array.isArray(question.acceptedAnswers))))) {
        throw new Error("Gemini không trả đúng câu hỏi mở và đáp án nhánh của Olympia.");
      }
    } catch (error) {
      console.error("Mini-game Gemini generation failed:", error.message);
      if (error.name === "TimeoutError" || error.name === "AbortError") {
        throw Object.assign(new Error("Gemini mất quá 10 giây để tạo câu hỏi."), {
          userMessage: "Gemini đang phản hồi chậm nên chưa tạo xong câu hỏi trong 10 giây. Hãy thử lại.",
        });
      }
      throw Object.assign(error, { userMessage: "Gemini chưa tạo được câu hỏi. Hãy thử lại sau." });
    }
  }

    let review = { status: "unavailable", issues: [] };
  if (groqApiKeys_server.length > 0) {
    try {
      review = await reviewWithGroq({
        apiKeys: groqApiKeys_server,
        model: groqModel_server,
        task: isObstacleMode
          ? "Kiểm tra câu hỏi có chính xác, rõ ràng không; kiểm tra từng hàng ngang có liên hệ hợp lý với từ khóa ẩn và câu trung tâm có phù hợp không. Chỉ nêu lỗi cụ thể, không suy đoán."
          : isOlympiaMode
            ? "Kiểm tra câu hỏi mở bao quát và các câu nhánh có liên kết, chính xác, rõ ràng; kiểm tra câu trả lời ngắn và các cách viết tương đương. Chỉ nêu lỗi cụ thể, không suy đoán."
            : "Kiểm tra lỗi kiến thức rõ ràng, câu mơ hồ, nhiều đáp án đúng hoặc giải thích sai; chỉ nêu vấn đề cụ thể, không suy đoán.",
        question: isObstacleMode
          ? `Chủ đề ${topic}; cần ${count} hàng ngang tăng dần và 1 câu trung tâm.`
          : isOlympiaMode
            ? `Chủ đề ${topic}; cần một câu hỏi mở và đúng ${count} câu nhánh trả lời ngắn.`
            : `Chủ đề ${topic}; cần đúng ${count} câu, mỗi câu 4 lựa chọn.`,
        answer: JSON.stringify(isObstacleMode || isOlympiaMode ? generated : generated.questions),
        context: "",
        maxTokens: 400,
        timeoutMs: 8_000,
        signal: AbortSignal.timeout(8_000),
      });
    } catch (error) {
      console.error("Mini-game Groq review failed:", error.message);
    }
  } else {
    console.error("Mini-game Groq review skipped: no API key is configured.");
  }

  if (review.status !== "verified") {
    console.warn("Mini-game Groq review returned a warning:", review.issues);
  }
  return {
    questions: generated.questions,
    obstacle: isObstacleMode ? generated.obstacle : undefined,
    introQuestion: isOlympiaMode ? generated.introQuestion : undefined,
    introExplanation: isOlympiaMode ? generated.introExplanation : undefined,
    review: { status: review.status, warning: review.status !== "verified" },
  };
}

app.use(createQuizRouter({
  baseUrl: process.env.OLLAMA_BASE_URL,
  model: process.env.OLLAMA_MODEL,
  geminiApiKeys,
  groqApiKeys: groqApiKeys_server,
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
- Hãy trình bày rõ ràng theo cấu trúc có tiêu đề và danh sách khi câu trả lời có nhiều phần. Dùng Markdown đơn giản để phân cấp nội dung: tiêu đề bằng dấu #, cụm từ khóa quan trọng bằng **in đậm**, mỗi tiêu chí bằng bullet "-".
- Nếu nội dung có hai phần như PHẦN 1 và PHẦN 2, đặt mỗi phần thành tiêu đề riêng trên một dòng mới; tránh để tiêu đề hoặc bullet nối liền nhau.
- Trong danh sách, in đậm cụm từ khóa chính ở đầu mỗi bullet rồi mới giải thích lý do hoặc nội dung. Mỗi bullet chỉ nên trình bày một ý chính và xuống dòng riêng.
- Không tự thêm phần “Định hướng”, “Đề xuất” hoặc danh sách nguồn web vào cuối câu trả lời vì ứng dụng sẽ hiển thị một phần riêng dưới câu trả lời.
- Tuyệt đối không dùng HTML, bảng phức tạp hoặc ký hiệu định dạng không cần thiết. Khi ở chế độ voice thì ưu tiên văn bản ngắn, dễ đọc thành tiếng nhưng vẫn giữ cấu trúc rõ nếu cần.
- Chèn thẻ hành động khi phù hợp, đặt ngay trước câu nói tương ứng. Chỉ dùng: [smile] [nod] [think] [wave] [surprised] [sad] [laugh]. Không lạm dụng.
- Ví dụ: "[wave] Chào bạn! Hôm nay mình có thể giúp gì cho bạn?"`;

function buildSystemInstruction(historyContext, mode, chatStyle) {
  const responseStyle = mode === "voice"
    ? "Đây là Voice chat: giải thích rõ ý chính và lý do quan trọng, nhưng ưu tiên câu nói tự nhiên, dễ nghe và vừa phải để đọc thành tiếng; không dùng tiêu đề, bảng hay danh sách dài."
    : "Đây là chat chữ: phân tích đủ sâu và cụ thể, tách tiêu đề và danh sách thành từng dòng rõ ràng. Dùng tiêu đề Markdown đơn giản và **in đậm** cụm từ khóa ở đầu mỗi bullet; không dùng HTML.";
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
    .replace(/<script[^>]*>[\s\S]*?<\/script>/giu, "")
        .replace(/\r\n?/g, "\n")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\b((?:mình|tôi|em)\s+(?:là|tên là)\s+)(?:Mai|Luka|Luca|Lua|Lúa)\b/giu, "$1Lụa")
    .replace(/\b(Tên (?:của mình|của tôi|của em) là\s+)(?:Mai|Luka|Luca|Lua|Lúa)\b/giu, "$1Lụa")
    .trim();
}
async function generateGroqReply(messages, historyContext, mode, chatStyle, reviewIssues = []) {
  if (groqApiKeys_server.length === 0) throw new Error("GROQ_API_KEY chưa được cấu hình.");
  const correctionInstruction = reviewIssues.length
    ? `\n\nBản trả lời trước có các vấn đề cần sửa: ${reviewIssues.join("; ")}. Hãy tạo lại câu trả lời, sửa rõ các vấn đề này và kiểm tra sự thật trước khi trả lời.`
    : "";
  const { response } = await fetchWithGroqKeyFallback({
    apiKeys: groqApiKeys_server,
    timeoutMs: 15_000,
    url: "https://api.groq.com/openai/v1/chat/completions",
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        model: groqModel_server,
        messages: [
          {
            role: "system",
            content: `${buildSystemInstruction(historyContext, mode, chatStyle)}${correctionInstruction}`,
          },
          ...messages.slice(-20).map(({ role, content }) => ({
            role,
            content: content.slice(0, 8_000),
          })),
        ],
        temperature: 0.2,
        max_completion_tokens: mode === "voice" ? 300 : 1000,
      }),
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`Groq chat failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const cleanedReply = normalizeAssistantName(data?.choices?.[0]?.message?.content || "");
  if (!cleanedReply) throw new Error("Groq chat returned no content.");
  return cleanedReply;
}


app.post("/api/chat", async (req, res) => {
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.some((message) => !message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string")) {
    return res.status(400).json({ error: "Tin nhắn không hợp lệ." });
  }

  const attachmentResult = await extractAttachments(req.body?.attachments);
  if (attachmentResult.error) return res.status(400).json({ error: attachmentResult.error });
  const latestQuestion = [...messages].reverse().find((message) => message.role === "user")?.content || "";
  const attachmentQuestion = attachmentResult.textContext
    ? `${latestQuestion}\n\n${attachmentResult.textContext}`.slice(0, 40_000)
    : latestQuestion;
  const contents = messages.slice(-20).map(({ role, content }, index, sliced) => {
    const isLatestUser = role === "user" && index === sliced.length - 1;
    const parts = [{ text: isLatestUser ? attachmentQuestion : content }];
    if (isLatestUser) {
      for (const file of attachmentResult.inlineFiles) {
        parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
      }
    }
    return { role: role === "assistant" ? "model" : "user", parts };
  });
    const mode = req.body?.mode === "voice" ? "voice" : "text";
  const chatStyle = req.body?.chatStyle === "genz" ? "genz" : "normal";
  const claudeMessages = messages.map((message, index) => index === messages.length - 1 && message.role === "user"
    ? { ...message, content: attachmentQuestion }
    : message);
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
          reply = normalizeAssistantName(data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim());
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
      reply = await generateGroqReply(claudeMessages, historyContext, mode, chatStyle);
      let fallbackReview;
      try {
        fallbackReview = await reviewWithGroq({
          apiKeys: groqApiKeys_server,
          model: groqModel_server,
          task: "Rà soát nghiêm ngặt câu trả lời dự phòng: kiểm tra tính đúng sự thật và liên quan; xác định tiền đề người dùng sai có được đính chính trước khi trả lời không. Đặc biệt, không chấp nhận kết luận sai chỉ vì người dùng yêu cầu giải thích vì sao nó đúng. Nếu có vấn đề cụ thể, ghi rõ cách sửa trong issues.",
          question: attachmentQuestion,
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
        fallbackReview = { status: "unavailable", model: groqModel_server, issues: [issue] };
      }

      if (["concern", "uncertain"].includes(fallbackReview.status) && fallbackReview.issues.length) {
        try {
          reply = await generateGroqReply(claudeMessages, historyContext, mode, chatStyle, fallbackReview.issues);
          fallbackReview = await reviewWithGroq({
            apiKeys: groqApiKeys_server,
            model: groqModel_server,
            task: "Kiểm tra lại câu trả lời đã được sửa: xác minh tính đúng sự thật, liên quan, và việc đính chính tiền đề sai của người dùng. Không bỏ qua mâu thuẫn với sự thật chỉ vì câu trả lời nghe có vẻ hợp lý.",
            question: attachmentQuestion,
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
            model: groqModel_server,
            issues: [...fallbackReview.issues, issue].slice(0, 5),
          };
        }
      }

      const suggestions = await findRelatedResources(latestQuestion);
      return res.json({
        reply,
        suggestions,
        verification: {
          status: fallbackReview.status,
          provider: "Groq",
          model: groqModel_server,
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
      return res.status(502).json({ error: `${geminiFailure} Groq dự phòng cũng không khả dụng.` });
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
        apiKeys: groqApiKeys_server,
        model: groqModel_server,
        task: "Rà soát câu trả lời chat: đúng với dữ kiện có căn cứ, liên quan câu hỏi, không lặp câu trả lời gần đây; kiểm tra tiền đề/thông tin người dùng đưa ra có sai rõ ràng không và câu trả lời đã lịch sự sửa lỗi trước khi trả lời hay chưa.",
        question: attachmentQuestion,
        answer: reply,
        context: JSON.stringify({ recentConversation, historyContext }),
      });
    } catch (error) {
      console.error("Groq chat review failed:", error.message);
      verification = { status: "unavailable", model: groqModel_server, issues: [] };
    }

    const suggestions = await findRelatedResources(latestQuestion);
    res.json({ reply, suggestions, verification });
  } catch (e) {
    console.error("Chat response failed:", e.message);
    res.status(502).json({ error: "Không xử lý được câu trả lời chat." });
  }
});

app.get("/api/elevenlabs/status", (_req, res) => {
  res.json({
    configured: elevenLabsApiKeys.length > 0,
    keyCount: elevenLabsApiKeys.length,
    activeKey: Math.min(elevenLabsKeyCursor + 1, elevenLabsApiKeys.length) || 0,
    voiceId: process.env.ELEVENLABS_VOICE_ID?.trim() || "",
    modelId: process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_flash_v2_5",
  });
});

app.get("/api/elevenlabs/voices", async (_req, res) => {
  const apiKeys = getElevenLabsApiKeys();
  if (!apiKeys.length) return res.status(503).json({ error: "Chưa cấu hình ELEVENLABS_API_KEY trong .env." });
  // Chỉ hiển thị các giọng đa ngôn ngữ có phát âm rõ và phù hợp đọc tiếng Việt.
  // Danh sách được giới hạn cố định để tránh lộ các giọng không phù hợp trong giao diện.
  const vietnameseCompatibleVoiceIds = new Set([
    "Xb7hH8MSUJpSbSDYk0k2", // Alice
    "EXAVITQu4vr4xnSDxMaL", // Sarah
    "XrExE9yKIg1WjnnlVkGX", // Matilda
    "iP95p4xoKVk53GoZ742B", // Chris
    "nPczCjzI2devNBz1zQrb", // Brian
  ]);
  try {
    let detail = "";
    let response = null;
    for (let index = 0; index < apiKeys.length; index += 1) {
      response = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": apiKeys[index] },
      });
      detail = await response.text();
      if (response.ok) break;
      advanceElevenLabsKey();
      if (index === apiKeys.length - 1) {
        return res.status(response.status).json({ error: `ElevenLabs voices failed: ${detail.slice(0, 500)}` });
      }
    }
    const data = JSON.parse(detail);
    const voices = (data.voices || [])
      .filter((voice) => vietnameseCompatibleVoiceIds.has(voice.voice_id))
      .map(({ voice_id, name, category, labels }) => ({ voice_id, name, category, labels, vietnameseCompatible: true }));
    res.json({ voices });
  } catch (error) {
    res.status(502).json({ error: `Không kết nối được ElevenLabs: ${error.message}` });
  }
});

async function createElevenLabsAudio(text, voiceId, modelId, apiKeys) {
  let lastResponse = null;
  let lastDetail = "";
  for (let index = 0; index < apiKeys.length; index += 1) {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKeys[index],
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
    });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    lastResponse = response;
    lastDetail = await response.text();
    if ([401, 402, 429].includes(response.status)) {
      advanceElevenLabsKey();
      continue;
    }
    break;
  }
  if (lastResponse) {
    let message = lastDetail;
    try { message = JSON.parse(lastDetail)?.detail?.message || JSON.parse(lastDetail)?.detail || lastDetail; } catch {}
    throw Object.assign(new Error(`ElevenLabs lỗi HTTP ${lastResponse.status}: ${String(message).slice(0, 800)}`), {
      status: lastResponse.status,
    });
  }
  throw Object.assign(new Error("Không thể tạo giọng ElevenLabs."), { status: 502 });
}

app.post("/api/elevenlabs/speak", async (req, res) => {
  const apiKeys = getElevenLabsApiKeys();
  let text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  text = text.replace(/[*#_`~]+/g, "").replace(/\s+/g, " ").trim();
  const voiceId = typeof req.body?.voiceId === "string" && req.body.voiceId.trim()
    ? req.body.voiceId.trim()
    : (process.env.ELEVENLABS_VOICE_ID?.trim() || "Xb7hH8MSUJpSbSDYk0k2");
  const modelId = typeof req.body?.modelId === "string" && req.body.modelId.trim()
    ? req.body.modelId.trim()
    : (process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_flash_v2_5");
  if (!apiKeys.length) return res.status(503).json({ error: "Chưa cấu hình ELEVENLABS_API_KEY trong .env." });
  if (!text) return res.status(400).json({ error: "Hãy nhập nội dung cần ElevenLabs đọc." });
  if (text.length > 800) {
    const shortText = text.slice(0, 800);
    const lastSentence = Math.max(shortText.lastIndexOf("."), shortText.lastIndexOf("!"), shortText.lastIndexOf("?"));
    text = lastSentence >= 400 ? shortText.slice(0, lastSentence + 1) : shortText.trimEnd() + "…";
  }
  try {
    const cacheKey = `${voiceId}\0${modelId}\0${text}`;
    let audio = elevenLabsAudioCache.get(cacheKey);
    if (!audio) {
      let pending = elevenLabsAudioPending.get(cacheKey);
      if (!pending) {
        pending = createElevenLabsAudio(text, voiceId, modelId, apiKeys);
        elevenLabsAudioPending.set(cacheKey, pending);
      }
      try {
        audio = await pending;
        elevenLabsAudioCache.set(cacheKey, audio);
        while (elevenLabsAudioCache.size > 24) {
          elevenLabsAudioCache.delete(elevenLabsAudioCache.keys().next().value);
        }
      } finally {
        if (elevenLabsAudioPending.get(cacheKey) === pending) elevenLabsAudioPending.delete(cacheKey);
      }
    }
    res.set({ "Content-Type": "audio/mpeg", "Content-Length": audio.length, "Cache-Control": "no-store" });
    return res.send(audio);
  } catch (error) {
    res.status(error.status || 502).json({ error: `Không thể tạo giọng ElevenLabs: ${error.message}` });
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
    for (const model of geminiModels) {
      try {
        const { response } = await fetchWithGeminiKeyFallback({
          apiKeys: geminiApiKeys,
          timeoutMs: 12_000,
          url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
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
          if (text) return res.json({ text, provider: "Gemini", model });
          console.error("Gemini transcription returned no text.");
        } else {
          console.error("Gemini transcription failed", { model, status: response.status });
        }
      } catch (error) {
        console.error("Gemini transcription request failed:", { model, message: error.message });
      }
    }
  }

  if (geminiApiKeys.length === 0) {
    return res.status(503).json({ error: "Chưa cấu hình Gemini API key để nhận dạng giọng nói." });
  }
  return res.status(502).json({
    error: "Gemini hiện không xử lý được audio. Hãy thử lại hoặc kiểm tra khóa GEMINI_API_KEY.",
  });
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
