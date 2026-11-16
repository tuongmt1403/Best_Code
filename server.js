import dotenv from "dotenv";
import express from "express";
import Database from "better-sqlite3";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createAuth } from "./dangKy_dangNhap/auth.js";
import { createAvatarProfile } from "./avatar-profile.js";
import { createMiniGame, questionBanks } from "./mini-game/game.js";
import { generateMiniGameQuizWithOllama } from "./mini-game/ollama.js";
import { createQuizRouter } from "./quiz-web/quiz.js";
import { reviewWithGroq } from "./ai-review.js";
import { fetchWithGeminiKeyFallback, getGeminiApiKeys } from "./gemini-api.js";
import { fetchWithGroqKeyFallback, getGroqApiKeys } from "./groq-api.js";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { createHeyGenRouter } from "./test HeyGen/router.js";

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
if (process.env.TRUST_PROXY === "true" || true) app.set("trust proxy", 1);
app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(projectDir, "public"), {
  setHeaders: (res) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
}));
const auth = createAuth({ projectDir });
const authPagesDir = path.join(projectDir, "dangKy_dangNhap");
app.get(["/dangKy_dangNhap", "/dangKy_dangNhap/"], (_req, res) =>
  res.sendFile(path.join(authPagesDir, "index.html")));
app.get("/dangKy_dangNhap/auth.css", (_req, res) => res.sendFile(path.join(authPagesDir, "auth.css")));
app.get("/dangKy_dangNhap/client.js", (_req, res) => res.sendFile(path.join(authPagesDir, "client.js")));
app.get("/dangKy_dangNhap/session.js", (_req, res) => res.sendFile(path.join(authPagesDir, "session.js")));
app.use(auth.sessionMiddleware);
app.use(auth.router);
app.use("/api", (req, res, next) => {
  const url = req.originalUrl || req.url || "";
  console.log("CHECK AUTH API URL:", url);
  if (url.includes("minigame") || url.includes("heygen") || url.includes("did") || url.includes("avatar")) return next();
  return auth.requireApiAuth(req, res, next);
});
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

function sanitizePersonaName(text) {
  if (typeof text !== "string" || !text) return text;
  return text
    .replace(/\b(chào|hỏi|gặp|với|cùng|cho|nhắn|kể|từ|bảo|gọi|của|đến|tin|yêu|thích|nhớ)\s+(?:Lụa|Lúa|Lua|Luka|Luca)\b/giu, "$1 Luna")
    .replace(/\b(?:Lụa|Lúa|Lua|Luka|Luca)\s+(luôn|sẽ|nghĩ|biết|muốn|có|có thể|rất|cũng|đang|đây|nè|nhé|nha|ơi|ạ|hả|à|chúc|hy vọng|sẵn sàng|cảm ơn|xin lỗi)\b/giu, "Luna $1")
    .replace(/\b((?:mình|tôi|em|bạn)\s+(?:là|tên là)\s+)(?:Mai|Luka|Luca|Lua|Lúa|Lụa)\b/giu, "$1Luna")
    .replace(/\b(Tên (?:của mình|của tôi|của em|của bạn|bạn) là\s+)(?:Mai|Luka|Luca|Lua|Lúa|Lụa)\b/giu, "$1Luna")
    .replace(/\b(chào|hỏi|gặp|với|cùng|cho|nhắn|kể|từ|bảo|gọi|của|đến)\s+Mai\b/giu, "$1 Luna")
    .replace(/\b(?:trợ lý|bot|AI)\s+(?:Mai|Lụa|Lúa|Lua|Luka|Luca)\b/giu, (m) => m.split(/\s+/)[0] + " Luna")
    .replace(/(?<!\b(?:vải|tơ|dệt|áo|kén|sợi|bằng)\s+)\bLụa\b(?!\s+(?:tơ tằm|vạn phúc|hà đông|bạch đằng))/giu, "Luna")
    .replace(/\b(?:Lúa|Lua|Luka|Luca)\b/gu, "Luna");
}

function normalizeChatHistory(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && ["user", "assistant"].includes(message.role) && typeof message.content === "string")
    .map((message) => ({ role: message.role, content: sanitizePersonaName(message.content).slice(0, 20_000) }))
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
app.get(["/mini-game", "/mini-game/"], (_req, res) => res.sendFile(path.join(miniGameDir, "index.html")));
app.get("/mini-game/styles.css", (_req, res) => res.sendFile(path.join(miniGameDir, "styles.css")));
app.get("/mini-game/client.js", (_req, res) => res.sendFile(path.join(miniGameDir, "client.js")));
app.get("/mini-game/profanity.js", (_req, res) => res.sendFile(path.join(miniGameDir, "profanity.js")));
app.get(["/jsqr.min.js", "/mini-game/jsqr.min.js"], (_req, res) => res.sendFile(path.join(miniGameDir, "jsqr.min.js")));
const elevenLabsTestDir = path.join(projectDir, "elevenlabs-test");
app.get("/elevenlabs-test", auth.requirePageAuth, (_req, res) => res.sendFile(path.join(elevenLabsTestDir, "index.html")));
app.get("/elevenlabs-test/styles.css", auth.requirePageAuth, (_req, res) => res.sendFile(path.join(elevenLabsTestDir, "styles.css")));
app.get("/elevenlabs-test/client.js", auth.requirePageAuth, (_req, res) => res.sendFile(path.join(elevenLabsTestDir, "client.js")));
app.use(createHeyGenRouter({ projectDir }));
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
const groqModel_server = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
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

function sanitizeObstacleIllustration(raw) {
  const defaultBg = "#0F172A";
  const isValidColor = (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
  const clamp = (val, min, max, dflt) => {
    const num = Number(val);
    if (!Number.isFinite(num)) return dflt;
    return Number(Math.max(min, Math.min(max, num)).toFixed(2));
  };

  const bg = isValidColor(raw?.background) ? raw.background : defaultBg;
  const elements = [];

  const defaultElements = [
    { type: "polygon", points: [[0, 72], [18, 65], [42, 68], [65, 62], [88, 66], [100, 63], [100, 100], [0, 100]], fill: "#1C2541" },
    { type: "polygon", points: [[0, 80], [25, 75], [52, 78], [78, 73], [100, 77], [100, 100], [0, 100]], fill: "#2D3748" },
    { type: "rect", x: 30, y: 64, width: 40, height: 20, rx: 4, fill: "#334155" },
    { type: "ellipse", cx: 50, cy: 64, rx: 22, ry: 7, fill: "#475569" },
    { type: "rect", x: 42, y: 70, width: 16, height: 14, rx: 2, fill: "#1E293B" },
    { type: "line", x1: 50, y1: 57, x2: 50, y2: 24, stroke: "#E2E8F0", strokeWidth: 2.5 },
    { type: "polygon", points: [[50, 24], [72, 28], [74, 40], [50, 44]], fill: "#DC2626" },
    { type: "polygon", points: [[72, 28], [75, 34], [74, 40], [70, 34]], fill: "#991B1B" },
    { type: "polygon", points: [[61, 30], [62.5, 33.5], [66, 33.5], [63.2, 35.5], [64.2, 39], [61, 37], [57.8, 39], [58.8, 35.5], [56, 33.5], [59.5, 33.5]], fill: "#FACC15" },
    { type: "line", x1: 50, y1: 20, x2: 50, y2: 12, stroke: "#FDE047", strokeWidth: 2 },
    { type: "line", x1: 56, y1: 22, x2: 64, y2: 15, stroke: "#FDE047", strokeWidth: 1.5 },
    { type: "line", x1: 44, y1: 22, x2: 36, y2: 15, stroke: "#FDE047", strokeWidth: 1.5 },
    { type: "rect", x: 12, y: 75, width: 22, height: 11, rx: 3, fill: "#166534" },
    { type: "ellipse", cx: 23, cy: 75, rx: 8, ry: 4, fill: "#14532D" },
    { type: "line", x1: 23, y1: 75, x2: 38, y2: 67, stroke: "#15803D", strokeWidth: 3 },
    { type: "circle", cx: 16, cy: 84, r: 2.5, fill: "#0F172A" },
    { type: "circle", cx: 23, cy: 84, r: 2.5, fill: "#0F172A" },
    { type: "circle", cx: 30, cy: 84, r: 2.5, fill: "#0F172A" },
  ];

  if (Array.isArray(raw?.elements)) {
    for (const shape of raw.elements) {
      if (!shape || typeof shape !== "object") continue;
      const fill = isValidColor(shape.fill) ? shape.fill : "#3B82F6";
      if (shape.type === "circle") {
        elements.push({
          type: "circle",
          cx: clamp(shape.cx, 0, 100, 50),
          cy: clamp(shape.cy, 0, 100, 50),
          r: clamp(shape.r, 0.5, 50, 10),
          fill,
        });
      } else if (shape.type === "ellipse") {
        elements.push({
          type: "ellipse",
          cx: clamp(shape.cx, 0, 100, 50),
          cy: clamp(shape.cy, 0, 100, 50),
          rx: clamp(shape.rx, 0.5, 50, 10),
          ry: clamp(shape.ry, 0.5, 50, 8),
          fill,
        });
      } else if (shape.type === "rect") {
        const x = clamp(shape.x, 0, 95, 10);
        const y = clamp(shape.y, 0, 95, 10);
        const width = clamp(shape.width, 0.5, 100 - x, 20);
        const height = clamp(shape.height, 0.5, 100 - y, 20);
        const maxRx = Math.min(width, height) / 2;
        const rx = clamp(shape.rx ?? 0, 0, maxRx, 0);
        elements.push({ type: "rect", x, y, width, height, rx, fill });
      } else if (shape.type === "line") {
        const stroke = isValidColor(shape.stroke) ? shape.stroke : fill;
        elements.push({
          type: "line",
          x1: clamp(shape.x1, 0, 100, 10),
          y1: clamp(shape.y1, 0, 100, 10),
          x2: clamp(shape.x2, 0, 100, 90),
          y2: clamp(shape.y2, 0, 100, 90),
          stroke,
          strokeWidth: clamp(shape.strokeWidth, 0.5, 8, 2),
        });
      } else if (shape.type === "polygon" && Array.isArray(shape.points) && shape.points.length >= 3 && shape.points.length <= 16) {
        const points = shape.points.map((p) => [clamp(p[0], 0, 100, 50), clamp(p[1], 0, 100, 50)]);
        elements.push({ type: "polygon", points, fill });
      }
      if (elements.length >= 25) break;
    }
  }

  while (elements.length < 10) {
    elements.push(defaultElements[elements.length % defaultElements.length]);
  }

  return { background: bg, elements: elements.slice(0, 25) };
}

async function generateMiniGameQuestions({
  topicId,
  topic,
  count,
  avoidQuestions,
  referenceQuestions = [],
  avoidKeywords = [],
  mode = "quiz",
}) {
  if ((!referenceQuestions || referenceQuestions.length === 0) && topicId && questionBanks[topicId]?.questions) {
    referenceQuestions = questionBanks[topicId].questions;
  }
  const isObstacleMode = mode === "obstacle";
  const isOlympiaMode = mode === "olympia";
  const isStandardQuizMode = mode === "quiz";
  const questionCount = isObstacleMode ? count + 1 : count;
  const generationTimeoutMs = isObstacleMode ? 9_000 : isOlympiaMode ? 6_000 : 3_500;
  const prompt = isObstacleMode
    ? [
      `Tạo một bộ Vượt Chướng Ngại Vật mới bằng tiếng Việt theo đúng chủ đề "${topic}".`,
      "Từ khóa ẩn phải là một danh từ/cụm danh từ cụ thể, hợp lý với chủ đề; viết HOA, không dấu, không khoảng trắng.",
      `Tạo đúng ${count} câu hàng ngang có độ khó tăng dần, sau đó thêm 1 câu hỏi ô trung tâm ở vị trí cuối cùng (câu số ${count + 1}).`,
      "Mỗi câu phải có prompt, question, đúng 4 options, answer (chỉ số 0-3), explanation ngắn. Chỉ có một đáp án đúng.",
      `Mỗi đáp án đúng của ${count} hàng ngang phải liên hệ rõ ràng, thuyết phục với từ khóa ẩn. Nêu mối liên hệ trong logic.`,
      "Câu ô trung tâm PHẢI là câu hỏi gợi mở, giàu bối cảnh lịch sử, công nghệ, địa lý đặc trưng để người chơi xâu chuỗi tư duy (chứa gợi ý ngữ cảnh kích thích suy luận), TUYỆT ĐỐI KHÔNG dùng câu hỏi ngắn ngủn hoặc chung chung kiểu 'Từ khóa ẩn là gì?'. Một option phải chứa chính xác từ khóa ẩn (không dấu, viết hoa, không khoảng trắng) và answer phải trỏ đúng option đó; ba option còn lại là từ khóa nhiễu cùng chủ đề.",
      "Tự thiết kế một tranh minh họa vector vuông, đẹp, gợi ý hình ảnh chủ đề rõ ràng (ví dụ: vẽ cờ đỏ sao vàng trên cứ điểm, xe tăng, sách từ điển, ô nhớ bộ nhớ RAM, bản đồ biển đảo). Trả illustration gồm background mã #RRGGBB và elements là 14-24 hình có bố cục cụ thể, TUYỆT ĐỐI không chỉ vẽ các hình tròn hình vuông trừu tượng vô nghĩa. Mỗi hình là một trong các dạng {type:'circle',cx,cy,r,fill}, {type:'ellipse',cx,cy,rx,ry,fill}, {type:'rect',x,y,width,height,fill,rx?}, {type:'line',x1,y1,x2,y2,stroke,strokeWidth}, {type:'polygon',points:[[x,y],...],fill}. Tọa độ nằm trong khung 0-100; dùng màu #RRGGBB.",
      "Dùng kiến thức phổ thông chắc chắn, tránh câu mơ hồ, dữ kiện hành chính hoặc số liệu khó xác minh.",
      "Không lặp hoặc viết lại gần giống các câu và từ khóa cần tránh.",
      `Mã biến thể: ${Date.now()}-${Math.random().toString(36).slice(2)}.`,
      `Câu gần đây cần tránh:\n${JSON.stringify((avoidQuestions || []).slice(-10))}`,
      `Từ khóa gần đây cần tránh:\n${JSON.stringify(avoidKeywords.slice(-10))}`,
      `Chỉ trả JSON object đúng dạng {"obstacle":{"keyword":"TU_KHOA","logic":"Giải thích liên hệ của từng hàng ngang với từ khóa","illustration":{"background":"#RRGGBB","elements":[{"type":"circle","cx":50,"cy":50,"r":15,"fill":"#RRGGBB"}]}},"questions":[...]} với mảng questions có đúng ${count + 1} phần tử: ${count} câu đầu là HÀNG NGANG 1 đến ${count}, phần tử cuối là Ô TRUNG TÂM. Mỗi câu có prompt, question, options gồm đúng 4 đáp án, answer là chỉ số 0-3, explanation. Câu trung tâm hỏi từ khóa bí ẩn theo bối cảnh; options phải có đúng obstacle.keyword. Trong illustration, trả 14-24 hình vector theo cấu trúc; chỉ dùng type circle, ellipse, rect, line, polygon. Không thêm markdown hay văn bản ngoài JSON.`,
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
  if (geminiApiKeys.length > 0) {
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
      if (response.ok) {
        const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
        if (text) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed?.questions) && parsed.questions.length === questionCount) {
            if (isOlympiaMode) {
              const introQ = parsed.introQuestion || parsed.introSection || parsed.intro || parsed.title || `Khám phá kiến thức: ${topic}`;
              parsed.introQuestion = String(introQ).slice(0, 500);
              const introExp = parsed.introExplanation || parsed.explanation || parsed.description || `Tổng quan về chủ đề ${topic}.`;
              parsed.introExplanation = String(introExp).slice(0, 500);
              parsed.questions.forEach((q, idx) => {
                if (!q.prompt) q.prompt = `NHÁNH ${idx + 1}`;
                if (typeof q.answer !== "string") q.answer = String(q.answer || "").trim();
                if (!q.explanation) q.explanation = `Đáp án chính xác là ${q.answer}.`;
                if (!Array.isArray(q.acceptedAnswers) || q.acceptedAnswers.length === 0) {
                  q.acceptedAnswers = [q.answer];
                }
              });
              generated = parsed;
            } else if (isObstacleMode) {
              if (parsed.obstacle && typeof parsed.obstacle.keyword === "string" && parsed.obstacle.keyword.trim()) {
                parsed.obstacle.keyword = parsed.obstacle.keyword.trim().toUpperCase().replace(/\s+/g, "");

                // Ensure a rich, challenging themeHint (general clue/context to guide player thinking)
                parsed.obstacle.themeHint = typeof parsed.obstacle.themeHint === "string" && parsed.obstacle.themeHint.trim()
                  ? parsed.obstacle.themeHint.trim()
                  : (thematicObstacleTemplates[topicId]?.themeHint || `Ẩn số gồm ${parsed.obstacle.keyword.length} chữ cái gắn liền với sự kiện và tri thức trọng tâm của chủ đề ${topic}.`);

                const centerIdx = questionCount - 1;
                const centerQ = parsed.questions[centerIdx];
                if (centerQ) {
                  // Ensure center question is rich with historical/technical clues, NEVER generic
                  const isGenericQ = !centerQ.question
                    || centerQ.question.toLowerCase().includes("từ khóa ẩn của chủ đề")
                    || centerQ.question.toLowerCase().includes("từ khóa ẩn là gì")
                    || centerQ.question.length < 45;
                  if (isGenericQ) {
                    if (thematicObstacleTemplates[topicId]?.question) {
                      centerQ.question = thematicObstacleTemplates[topicId].question;
                      centerQ.prompt = thematicObstacleTemplates[topicId].prompt;
                    } else {
                      centerQ.prompt = `ẨN SỐ Ô TRUNG TÂM · ${parsed.obstacle.keyword.length} CHỮ CÁI`;
                      centerQ.question = `Khái niệm then chốt gồm ${parsed.obstacle.keyword.length} chữ cái nào được coi là biểu tượng đỉnh cao và là mắt xích kết nối toàn bộ các manh mối trong chủ đề ${topic}?`;
                    }
                  }
                  if (!Array.isArray(centerQ.options) || centerQ.options.length !== 4) {
                    centerQ.options = [parsed.obstacle.keyword, "LỰA CHỌN A", "LỰA CHỌN B", "LỰA CHỌN C"];
                    centerQ.answer = 0;
                  } else {
                    const normKw = parsed.obstacle.keyword;
                    const optIdx = centerQ.options.findIndex((opt) => opt && opt.toUpperCase().replace(/\s+/g, "") === normKw);
                    if (optIdx === -1) {
                      centerQ.options[centerQ.answer ?? 0] = parsed.obstacle.keyword;
                    } else {
                      centerQ.answer = optIdx;
                    }
                  }
                }

                // If topic has a hand-crafted, recognizable thematic vector illustration, ALWAYS use it
                if (thematicObstacleTemplates[topicId]?.illustration) {
                  parsed.obstacle.illustration = thematicObstacleTemplates[topicId].illustration;
                } else {
                  parsed.obstacle.illustration = sanitizeObstacleIllustration(parsed.obstacle.illustration);
                }
                generated = parsed;
              }
            } else {
              generated = parsed;
            }
          }
        }
      }
    } catch (error) {
      console.warn("Fast Gemini generation attempt warning:", error.message);
    }
  }

  // Fast fallback to question bank if AI is unavailable or exceeds timeout
  if (!generated && isStandardQuizMode && Array.isArray(referenceQuestions) && referenceQuestions.length >= questionCount) {
    console.log(`[Fast Fallback] Dùng ngân hàng câu hỏi gốc cho phòng "${topic}" để đảm bảo tạo phòng < 1s.`);
    const shuffled = [...referenceQuestions].sort(() => Math.random() - 0.5);
    generated = { questions: shuffled.slice(0, questionCount) };
  } else if (!generated && isOlympiaMode && Array.isArray(referenceQuestions) && referenceQuestions.length >= questionCount) {
    console.log(`[Fast Fallback] Dùng ngân hàng câu hỏi gốc cho phòng Olympia "${topic}".`);
    const shuffled = [...referenceQuestions].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, questionCount);
    generated = {
      introQuestion: `Chào mừng bạn đến với thử thách Olympia chủ đề ${topic}.`,
      introExplanation: `Bộ câu hỏi gồm ${questionCount} câu hỏi nâng cao về chủ đề ${topic}. Hãy nhấn chuông nhanh để ghi điểm!`,
      questions: selected.map((q, idx) => {
        const ans = String(q.options?.[q.answer] ?? q.answer ?? "").trim();
        return {
          prompt: `NHÁNH ${idx + 1}`,
          question: q.question,
          answer: ans,
          acceptedAnswers: [ans, ans.toLowerCase(), ans.toUpperCase()],
          explanation: q.explanation || `Đáp án chính xác là ${ans}.`,
        };
      }),
    };
  } else if (!generated && isObstacleMode && Array.isArray(referenceQuestions) && referenceQuestions.length >= count) {
    console.log(`[Fast Fallback] Dùng ngân hàng câu hỏi và mẫu chướng ngại vật cho "${topic}".`);
    const shuffled = [...referenceQuestions].sort(() => Math.random() - 0.5);
    const clues = shuffled.slice(0, count).map((q, idx) => ({
      ...q,
      prompt: `HÀNG NGANG ${idx + 1}`,
    }));
    const thematicObstacleTemplates = {
      history: {
        kw: "DIENBIENPHU",
        themeHint: "Ẩn số gồm 11 chữ cái gắn liền với một chiến dịch quân sự vĩ đại thế kỷ 20, đập tan tập đoàn cứ điểm kiên cố của thực dân Pháp tại thung lũng Mường Thanh và làm chấn động địa cầu.",
        logic: "Chiến dịch Điện Biên Phủ 1954 - mốc son lừng lẫy năm châu, chấn động địa cầu.",
        prompt: "CHIẾN DỊCH QUÂN SỰ ĐỈNH CAO NĂM 1954",
        question: "Chiến dịch quân sự lừng lẫy năm 1954 kéo dài 56 ngày đêm 'khoét núi, ngủ hầm, mưa dầm, cơm vắt', đập tan cứ điểm của thực dân Pháp tại thung lũng Mường Thanh, kết thúc bằng lá cờ Quyết chiến Quyết thắng tung bay trên nóc hầm De Castries?",
        options: ["DIENBIENPHU", "VIETBAC", "DUONG9NAMLAO", "TAYNGUYEN"],
        explanation: "Chiến thắng Điện Biên Phủ (07/05/1954) 'lừng lẫy năm châu, chấn động địa cầu' giải phóng hoàn toàn miền Bắc.",
        illustration: {
          background: "#080E21",
          elements: [
            // Sky & Clouds
            { type: "rect", x: 0, y: 0, width: 100, height: 55, fill: "#0B1536" },
            { type: "polygon", points: [[0, 25], [30, 20], [60, 26], [100, 18], [100, 38], [0, 42]], fill: "#15224F" },
            // Distant Northwest Mountains
            { type: "polygon", points: [[0, 52], [22, 38], [45, 46], [68, 36], [88, 44], [100, 40], [100, 75], [0, 75]], fill: "#1E293B" },
            // Near Foothills & Valleys
            { type: "polygon", points: [[0, 64], [28, 56], [55, 60], [82, 54], [100, 58], [100, 100], [0, 100]], fill: "#14532D" },
            // French Command Bunker Dome (Hầm De Castries)
            { type: "rect", x: 28, y: 62, width: 44, height: 26, rx: 6, fill: "#3F3F46" },
            { type: "ellipse", cx: 50, cy: 62, rx: 24, ry: 9, fill: "#52525B" },
            { type: "rect", x: 42, y: 70, width: 16, height: 18, rx: 2, fill: "#09090B" },
            // Sandbag layers
            { type: "rect", x: 22, y: 68, width: 12, height: 6, rx: 2, fill: "#71717A" },
            { type: "rect", x: 24, y: 75, width: 12, height: 6, rx: 2, fill: "#A1A1AA" },
            { type: "rect", x: 66, y: 68, width: 12, height: 6, rx: 2, fill: "#71717A" },
            { type: "rect", x: 64, y: 75, width: 12, height: 6, rx: 2, fill: "#A1A1AA" },
            // Flagpole on bunker roof
            { type: "line", x1: 50, y1: 56, x2: 50, y2: 15, stroke: "#E4E4E7", strokeWidth: 2.5 },
            { type: "circle", cx: 50, cy: 14, r: 2.5, fill: "#FACC15" },
            // Iconic Red Flag Waving (Cờ Quyết Chiến Quyết Thắng)
            { type: "polygon", points: [[50, 16], [80, 20], [82, 38], [50, 42]], fill: "#DC2626" },
            { type: "polygon", points: [[80, 20], [84, 28], [82, 38], [78, 30]], fill: "#991B1B" },
            // Five-pointed Yellow Star in flag
            { type: "polygon", points: [[66, 24], [67.8, 28.5], [72.5, 28.5], [68.8, 31.5], [70.2, 36], [66, 33], [61.8, 36], [63.2, 31.5], [59.5, 28.5], [64.2, 28.5]], fill: "#FACC15" },
            // Artillery / Tank on left flank
            { type: "rect", x: 8, y: 76, width: 20, height: 12, rx: 3, fill: "#166534" },
            { type: "ellipse", cx: 18, cy: 76, rx: 7, ry: 4, fill: "#15803D" },
            { type: "line", x1: 18, y1: 76, x2: 36, y2: 60, stroke: "#14532D", strokeWidth: 3.5 },
            { type: "circle", cx: 12, cy: 88, r: 3, fill: "#0F172A" },
            { type: "circle", cx: 18, cy: 88, r: 3, fill: "#0F172A" },
            { type: "circle", cx: 24, cy: 88, r: 3, fill: "#0F172A" },
            // Trench line
            { type: "line", x1: 0, y1: 94, x2: 100, y2: 94, stroke: "#27272A", strokeWidth: 3 },
          ],
        },
      },
      cProgramming: {
        kw: "POINTER",
        themeHint: "Ẩn số gồm 7 chữ cái chỉ một biến đặc biệt nắm giữ trực tiếp địa chỉ ô nhớ RAM và thao tác bộ nhớ động trong máy tính.",
        logic: "Con trỏ và cơ chế quản lý trực tiếp địa chỉ ô nhớ RAM trong ngôn ngữ C.",
        prompt: "CƠ CHẾ QUẢN LÝ BỘ NHỚ TRỰC TIẾP TRONG C",
        question: "Trong lập trình C, đây là biến đặc biệt không lưu giá trị thông thường mà lưu trực tiếp địa chỉ ô nhớ RAM của một biến khác, sử dụng toán tử * và & để thao tác bộ nhớ động?",
        options: ["POINTER", "VARIABLE", "FUNCTION", "STRUCT"],
        explanation: "Con trỏ (Pointer) là công cụ mạnh mẽ trong C giúp thao tác và cấp phát bộ nhớ RAM trực tiếp.",
        illustration: {
          background: "#0A0F1D",
          elements: [
            { type: "line", x1: 8, y1: 20, x2: 92, y2: 20, stroke: "#1E293B", strokeWidth: 1.5 },
            { type: "line", x1: 8, y1: 50, x2: 92, y2: 50, stroke: "#1E293B", strokeWidth: 1.5 },
            { type: "line", x1: 8, y1: 80, x2: 92, y2: 80, stroke: "#1E293B", strokeWidth: 1.5 },
            { type: "rect", x: 10, y: 32, width: 26, height: 36, rx: 4, fill: "#1E293B" },
            { type: "rect", x: 13, y: 35, width: 20, height: 12, rx: 2, fill: "#0F172A" },
            { type: "rect", x: 13, y: 51, width: 20, height: 13, rx: 2, fill: "#2563EB" },
            { type: "circle", cx: 23, cy: 57.5, r: 3.5, fill: "#93C5FD" },
            { type: "rect", x: 64, y: 32, width: 26, height: 36, rx: 4, fill: "#1E293B" },
            { type: "rect", x: 67, y: 35, width: 20, height: 12, rx: 2, fill: "#0F172A" },
            { type: "rect", x: 67, y: 51, width: 20, height: 13, rx: 2, fill: "#059669" },
            { type: "circle", cx: 77, cy: 57.5, r: 4, fill: "#FACC15" },
            { type: "line", x1: 34, y1: 57.5, x2: 62, y2: 57.5, stroke: "#38BDF8", strokeWidth: 3 },
            { type: "line", x1: 56, y1: 52, x2: 63, y2: 57.5, stroke: "#38BDF8", strokeWidth: 3 },
            { type: "line", x1: 56, y1: 63, x2: 63, y2: 57.5, stroke: "#38BDF8", strokeWidth: 3 },
            { type: "line", x1: 45, y1: 38, x2: 51, y2: 44, stroke: "#F59E0B", strokeWidth: 2 },
            { type: "line", x1: 51, y1: 38, x2: 45, y2: 44, stroke: "#F59E0B", strokeWidth: 2 },
            { type: "line", x1: 48, y1: 37, x2: 48, y2: 45, stroke: "#F59E0B", strokeWidth: 2 },
            { type: "circle", cx: 15, cy: 15, r: 2.5, fill: "#10B981" },
            { type: "circle", cx: 85, cy: 15, r: 2.5, fill: "#3B82F6" },
          ],
        },
      },
      english: {
        kw: "VOCABULARY",
        themeHint: "Ẩn số gồm 10 chữ cái là kho tàng vốn từ nền tảng quyết định khả năng giao tiếp, đọc hiểu và làm chủ tiếng Anh.",
        logic: "Vốn từ vựng là nền tảng cốt lõi của việc học và giao tiếp ngôn ngữ Anh.",
        prompt: "CHÌA KHÓA LÀM CHỦ NGÔN NGỮ TIẾNG ANH",
        question: "Kho từ vựng trong ngôn ngữ học dùng để chỉ tập hợp tất cả các từ ngữ mà một người tiếp thu, ghi nhớ và sử dụng trong giao tiếp, đọc hiểu và viết văn tiếng Anh?",
        options: ["VOCABULARY", "GRAMMAR", "PHONETICS", "ALPHABET"],
        explanation: "Từ vựng (Vocabulary) là kho tàng ngôn ngữ thiết yếu để thành thạo tiếng Anh.",
        illustration: {
          background: "#0A1128",
          elements: [
            { type: "polygon", points: [[12, 68], [48, 73], [48, 86], [10, 80]], fill: "#7C2D12" },
            { type: "polygon", points: [[88, 68], [52, 73], [52, 86], [90, 80]], fill: "#7C2D12" },
            { type: "polygon", points: [[14, 38], [48, 44], [48, 72], [14, 66]], fill: "#F8FAFC" },
            { type: "polygon", points: [[86, 38], [52, 44], [52, 72], [86, 66]], fill: "#F1F5F9" },
            { type: "rect", x: 48, y: 44, width: 4, height: 42, rx: 1, fill: "#9A3412" },
            { type: "polygon", points: [[50, 44], [54, 75], [52, 85], [50, 78]], fill: "#DC2626" },
            { type: "line", x1: 18, y1: 46, x2: 44, y2: 50, stroke: "#475569", strokeWidth: 1.5 },
            { type: "line", x1: 18, y1: 52, x2: 42, y2: 56, stroke: "#64748B", strokeWidth: 1.5 },
            { type: "line", x1: 18, y1: 58, x2: 38, y2: 61, stroke: "#94A3B8", strokeWidth: 1.5 },
            { type: "line", x1: 56, y1: 50, x2: 82, y2: 46, stroke: "#475569", strokeWidth: 1.5 },
            { type: "line", x1: 58, y1: 56, x2: 82, y2: 52, stroke: "#64748B", strokeWidth: 1.5 },
            { type: "line", x1: 62, y1: 61, x2: 82, y2: 58, stroke: "#94A3B8", strokeWidth: 1.5 },
            { type: "circle", cx: 50, cy: 30, r: 8, fill: "#FEF08A" },
            { type: "line", x1: 50, y1: 18, x2: 50, y2: 10, stroke: "#FACC15", strokeWidth: 2 },
            { type: "line", x1: 42, y1: 22, x2: 34, y2: 15, stroke: "#FACC15", strokeWidth: 2 },
            { type: "line", x1: 58, y1: 22, x2: 66, y2: 15, stroke: "#FACC15", strokeWidth: 2 },
            { type: "circle", cx: 50, cy: 30, r: 4, fill: "#FFFFFF" },
          ],
        },
      },
      geography: {
        kw: "VIETNAM",
        themeHint: "Ẩn số gồm 7 chữ cái chỉ quốc gia hình chữ S trải dài bên bờ Biển Đông cùng các quần đảo thiêng liêng Hoàng Sa và Trường Sa.",
        logic: "Lãnh thổ hình chữ S bên bờ Biển Đông và chủ quyền biển đảo thiêng liêng.",
        prompt: "ĐẤT NƯỚC HÌNH CHỮ S BÊN BỜ BIỂN ĐÔNG",
        question: "Quốc gia nằm trên bán đảo Đông Dương với đường bờ biển hình chữ S dài hơn 3.260 km, tiếp giáp vịnh Bắc Bộ, vịnh Thái Lan và Biển Đông cùng hai quần đảo Hoàng Sa và Trường Sa?",
        options: ["VIETNAM", "THAILAND", "PHILIPPINES", "INDONESIA"],
        explanation: "Việt Nam có dải đất hình chữ S trải dài dọc biển Đông cùng các hải đảo thiêng liêng.",
        illustration: {
          background: "#0C2340",
          elements: [
            { type: "polygon", points: [[30, 10], [55, 12], [48, 28], [32, 28]], fill: "#15803D" },
            { type: "polygon", points: [[32, 28], [48, 28], [45, 52], [35, 52]], fill: "#16A34A" },
            { type: "polygon", points: [[35, 52], [45, 52], [55, 68], [45, 68]], fill: "#15803D" },
            { type: "polygon", points: [[45, 68], [55, 68], [52, 85], [38, 85], [32, 75]], fill: "#16A34A" },
            { type: "circle", cx: 72, cy: 42, r: 2.5, fill: "#FBBF24" },
            { type: "circle", cx: 76, cy: 44, r: 2, fill: "#F59E0B" },
            { type: "circle", cx: 74, cy: 47, r: 1.5, fill: "#FBBF24" },
            { type: "circle", cx: 78, cy: 72, r: 2.5, fill: "#FBBF24" },
            { type: "circle", cx: 83, cy: 75, r: 2, fill: "#F59E0B" },
            { type: "circle", cx: 80, cy: 78, r: 2, fill: "#FBBF24" },
            { type: "ellipse", cx: 28, cy: 82, rx: 3, ry: 4, fill: "#22C55E" },
            { type: "line", x1: 52, y1: 50, x2: 52, y2: 44, stroke: "#E2E8F0", strokeWidth: 2 },
            { type: "circle", cx: 52, cy: 43, r: 2, fill: "#FACC15" },
            { type: "polygon", points: [[62, 58], [67, 54], [67, 62]], fill: "#FFFFFF" },
          ],
        },
      },
    };
    const defaultTemplate = thematicObstacleTemplates[topicId] || {
      kw: "TRITHUC",
      themeHint: `Ẩn số gồm 7 chữ cái là khái niệm nền tảng, chìa khóa xuyên suốt toàn bộ chủ đề ${topic}.`,
      logic: `Kiến thức tổng hợp về chủ đề ${topic}.`,
      prompt: `CHÌA KHÓA CHỦ ĐỀ ${String(topic || "").toUpperCase()}`,
      question: `Khái niệm tổng quát nào là chìa khóa tri thức nền tảng trong toàn bộ chủ đề ${topic}?`,
      options: ["TRITHUC", "KHOAHOC", "LICHSU", "THEGIOI"],
      explanation: `Từ khóa bí mật chính là TRITHUC của chủ đề ${topic}.`,
      illustration: {
        background: "#0F172A",
        elements: defaultElements,
      },
    };
    const centralQ = {
      prompt: defaultTemplate.prompt || "Ô TRUNG TÂM",
      question: defaultTemplate.question,
      options: defaultTemplate.options,
      answer: 0,
      explanation: defaultTemplate.explanation,
    };
    generated = {
      obstacle: {
        keyword: defaultTemplate.kw,
        themeHint: defaultTemplate.themeHint,
        logic: defaultTemplate.logic,
        illustration: defaultTemplate.illustration,
      },
      questions: [...clues, centralQ],
    };
  }

  if (!generated) {
    throw Object.assign(new Error("Chưa tạo được câu hỏi trong thời gian quy định."), {
      userMessage: "Hệ thống đang quá tải, vui lòng thử lại.",
    });
  }

  // Non-blocking review in background (does not hold room creation)
  let review = { status: "verified", issues: [] };
  if (groqApiKeys_server.length > 0) {
    reviewWithGroq({
      apiKeys: groqApiKeys_server,
      model: groqModel_server,
      task: "Kiểm tra nhanh tính hợp lệ của câu hỏi.",
      question: `Chủ đề ${topic}`,
      answer: JSON.stringify(generated.questions),
      context: "",
      maxTokens: 200,
      timeoutMs: 5_000,
      signal: AbortSignal.timeout(5_000),
    }).catch(() => {});
  }

  return {
    questions: generated.questions,
    obstacle: isObstacleMode ? generated.obstacle : undefined,
    introQuestion: isOlympiaMode ? generated.introQuestion : undefined,
    introExplanation: isOlympiaMode ? generated.introExplanation : undefined,
    review: { status: review.status, warning: false },
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

const SYSTEM = `Tên của bạn duy nhất là Luna. Bạn là một trợ lý AI thân thiện, trò chuyện tự nhiên bằng tiếng Việt.
Tuyệt đối không bao giờ tự nhận hay tự gọi mình là "Lụa", "Mai", "Lúa" hay bất kỳ tên nào khác. Tên của bạn luôn luôn và duy nhất là Luna. Kể cả khi người dùng hoặc lịch sử hội thoại cũ có nhắc đến "Lụa" hay "Mai", bạn phải tự hiểu đó là tên cũ đã được đổi và bạn chỉ xưng hô với tư cách là Luna.
Quy tắc trả lời:
- Trả lời thẳng trọng tâm trước, sau đó giải thích đủ sâu để người dùng hiểu vấn đề, không chỉ nhắc lại kết luận.
- Trước khi trả lời, kiểm tra tiền đề và thông tin người dùng nêu. Nếu có dữ kiện, phép tính, cách hiểu hoặc giả định sai rõ ràng, hãy nhẹ nhàng chỉ ra và sửa lại trước, rồi mới trả lời câu hỏi dựa trên thông tin đúng; không đồng tình cho vừa lòng người dùng.
- Không bênh vực hoặc chứng minh một khẳng định sai chỉ vì người dùng yêu cầu giải thích vì sao nó đúng. Nói rõ phần sai, nêu sự thật có căn cứ, rồi giải thích câu hỏi theo cách hiểu đúng; nếu có nhiều góc nhìn hợp lệ, phân biệt rõ chúng.
- Chỉ sửa khi có căn cứ đáng tin; phân biệt lỗi thực tế với ý kiến cá nhân hoặc cách diễn đạt khác nhau. Đọc đúng lời người dùng: không bịa ra lỗi gõ, câu nói hay niềm tin mà họ không nêu, và không coi một câu hỏi trung lập là khẳng định sai. Nếu câu hỏi có lỗi gõ hoặc diễn đạt mơ hồ làm thay đổi ý nghĩa, nêu cách hiểu đang dùng hoặc hỏi lại khi cần.
- Trong câu trả lời thông thường, không tự chào hoặc tự giới thiệu tên; chỉ nêu tên khi được hỏi hoặc khi người dùng chào/nhắc tên bạn, và khi đó tên duy nhất là Luna.
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
  return sanitizePersonaName(
    reply
      .replace(/<think>[\s\S]*?(?:<\/think>|$)/giu, "")
      .replace(/<analysis>[\s\S]*?(?:<\/analysis>|$)/giu, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/giu, "")
      .replace(/\r\n?/g, "\n")
      .replace(/`([^`]+)`/g, "$1")
  ).trim();
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
  const rawMessages = req.body?.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0 || rawMessages.some((message) => !message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string")) {
    return res.status(400).json({ error: "Tin nhắn không hợp lệ." });
  }
  const messages = rawMessages.map((message) => ({
    role: message.role,
    content: sanitizePersonaName(message.content),
  }));

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
    voiceId: process.env.ELEVENLABS_VOICE_ID?.trim() || "iP95p4xoKVk53GoZ742B",
    modelId: process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_flash_v2_5",
  });
});

app.get("/api/elevenlabs/voices", async (_req, res) => {
  const apiKeys = getElevenLabsApiKeys();
  if (!apiKeys.length) return res.status(503).json({ error: "Chưa cấu hình ELEVENLABS_API_KEY trong .env." });
  // Chỉ hiển thị các giọng đa ngôn ngữ có phát âm rõ và phù hợp đọc tiếng Việt.
  // Đặt Chris lên đầu làm giọng mặc định
  const preferredVoiceOrder = [
    "iP95p4xoKVk53GoZ742B", // Chris - Charming
    "Xb7hH8MSUJpSbSDYk0k2", // Alice
    "EXAVITQu4vr4xnSDxMaL", // Sarah
    "XrExE9yKIg1WjnnlVkGX", // Matilda
    "nPczCjzI2devNBz1zQrb", // Brian
  ];
  const vietnameseCompatibleVoiceIds = new Set(preferredVoiceOrder);
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
      .map(({ voice_id, name, category, labels }) => ({ voice_id, name, category, labels, vietnameseCompatible: true }))
      .sort((a, b) => {
        const orderA = preferredVoiceOrder.indexOf(a.voice_id);
        const orderB = preferredVoiceOrder.indexOf(b.voice_id);
        return (orderA === -1 ? 999 : orderA) - (orderB === -1 ? 999 : orderB);
      });
    res.json({ voices });
  } catch (error) {
    res.status(502).json({ error: `Không kết nối được ElevenLabs: ${error.message}` });
  }
});

async function createElevenLabsAudio(text, voiceId, modelId, apiKeys, speed = null) {
  let lastResponse = null;
  let lastDetail = "";
  const audioSpeed = typeof speed === "number" && speed > 0
    ? speed
    : (parseFloat(process.env.ELEVENLABS_SPEED || "1.10") || 1.10);
  for (let index = 0; index < apiKeys.length; index += 1) {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?optimize_streaming_latency=3&output_format=mp3_22050_32`, {
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
          speed: audioSpeed,
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
  text = sanitizePersonaName(text);
  text = text.replace(/[*#_`~]+/g, "").replace(/\s+/g, " ").trim();
  const voiceId = typeof req.body?.voiceId === "string" && req.body.voiceId.trim()
    ? req.body.voiceId.trim()
    : (process.env.ELEVENLABS_VOICE_ID?.trim() || "iP95p4xoKVk53GoZ742B");
  const modelId = typeof req.body?.modelId === "string" && req.body.modelId.trim()
    ? req.body.modelId.trim()
    : (process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_flash_v2_5");
  const speed = typeof req.body?.speed === "number" && req.body.speed > 0
    ? req.body.speed
    : (parseFloat(process.env.ELEVENLABS_SPEED || "1.10") || 1.10);
  if (!apiKeys.length) return res.status(503).json({ error: "Chưa cấu hình ELEVENLABS_API_KEY trong .env." });
  if (!text) return res.status(400).json({ error: "Hãy nhập nội dung cần ElevenLabs đọc." });
  if (text.length > 3500) {
    const shortText = text.slice(0, 3500);
    const lastSentence = Math.max(shortText.lastIndexOf("."), shortText.lastIndexOf("!"), shortText.lastIndexOf("?"), shortText.lastIndexOf("\n"));
    text = lastSentence >= 2000 ? shortText.slice(0, lastSentence + 1) : shortText.trimEnd() + "…";
  }
  try {
    const cacheKey = `${voiceId}\0${modelId}\0${speed}\0${text}`;
    let audio = elevenLabsAudioCache.get(cacheKey);
    if (!audio) {
      let pending = elevenLabsAudioPending.get(cacheKey);
      if (!pending) {
        pending = createElevenLabsAudio(text, voiceId, modelId, apiKeys, speed);
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
  let text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  text = sanitizePersonaName(text);
  if (!text) {
    return res.status(400).json({ error: "Không có nội dung để đọc." });
  }
  if (text.length > 3500) {
    return res.status(413).json({ error: "Đoạn văn bản quá dài để đọc cùng lúc." });
  }

  // Ưu tiên sử dụng ElevenLabs nếu có API key khả dụng
  const apiKeys = getElevenLabsApiKeys();
  if (apiKeys.length > 0) {
    const cleanText = text.replace(/[*#_`~]+/g, "").replace(/\s+/g, " ").trim();
    const voiceId = typeof req.body?.voiceId === "string" && req.body.voiceId.trim()
      ? req.body.voiceId.trim()
      : (process.env.ELEVENLABS_VOICE_ID?.trim() || "iP95p4xoKVk53GoZ742B");
    const modelId = typeof req.body?.modelId === "string" && req.body.modelId.trim()
      ? req.body.modelId.trim()
      : (process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_flash_v2_5");
    const speed = typeof req.body?.speed === "number" && req.body.speed > 0
      ? req.body.speed
      : (parseFloat(process.env.ELEVENLABS_SPEED || "1.10") || 1.10);

    try {
      const shortText = cleanText.length > 3500
        ? (() => {
            const cut = cleanText.slice(0, 3500);
            const last = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
            return last >= 2000 ? cut.slice(0, last + 1) : cut.trimEnd() + "…";
          })()
        : cleanText;
      const cacheKey = `${voiceId}\0${modelId}\0${speed}\0${shortText}`;
      let audio = elevenLabsAudioCache.get(cacheKey);
      if (!audio) {
        let pending = elevenLabsAudioPending.get(cacheKey);
        if (!pending) {
          pending = createElevenLabsAudio(shortText, voiceId, modelId, apiKeys, speed);
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
    } catch (elevenError) {
      console.warn("[TTS] ElevenLabs gặp lỗi, chuyển sang gTTS dự phòng:", elevenError.message);
    }
  }

  // Dự phòng sang gTTS nếu ElevenLabs không khả dụng hoặc hết hạn mức
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

function generateGttsAudioBuffer(text) {
  return new Promise((resolve, reject) => {
    const pythonExe = fs.existsSync(path.join(projectDir, "ai_avatar_env", "Scripts", "python.exe"))
      ? path.join(projectDir, "ai_avatar_env", "Scripts", "python.exe")
      : (process.env.PYTHON_EXECUTABLE || (process.platform === "win32" ? "py" : "python3"));
    const scriptPath = path.join(projectDir, "gtts_tts.py");
    const proc = spawn(pythonExe, [scriptPath], { stdio: ["pipe", "pipe", "pipe"] });
    const chunks = [];
    let err = "";
    proc.stdout.on("data", (c) => chunks.push(c));
    proc.stderr.on("data", (c) => { err += c.toString(); });
    proc.on("close", (code) => {
      if (code === 0 && chunks.length > 0) resolve(Buffer.concat(chunks));
      else reject(new Error(err || `gTTS exited with code ${code}`));
    });
    proc.on("error", reject);
    proc.stdin.write(JSON.stringify({ text }));
    proc.stdin.end();
  });
}

app.post("/api/avatar/generate-video", async (req, res) => {
  let text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  text = sanitizePersonaName(text);
  if (!text) {
    return res.status(400).json({ ok: false, error: "Không có nội dung để sinh video." });
  }

  const cleanText = text.replace(/[*#_`~]+/g, "").replace(/\s+/g, " ").trim();
  const voiceId = typeof req.body?.voiceId === "string" && req.body.voiceId.trim()
    ? req.body.voiceId.trim()
    : (process.env.ELEVENLABS_VOICE_ID?.trim() || "iP95p4xoKVk53GoZ742B");
  const modelId = typeof req.body?.modelId === "string" && req.body.modelId.trim()
    ? req.body.modelId.trim()
    : (process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_flash_v2_5");
  const speed = typeof req.body?.speed === "number" && req.body.speed > 0
    ? req.body.speed
    : (parseFloat(process.env.ELEVENLABS_SPEED || "1.10") || 1.10);

  // Instant Disk/Memory Cache by text & voice & speed: 0ms response for repeated/prefetched requests!
  const textKey = crypto.createHash("md5").update(`${cleanText}__${voiceId}__${speed}`).digest("hex");
  const cachedVideoName = `luna_txt_${textKey.slice(0, 16)}.mp4`;
  const cachedVideoPath = path.join(projectDir, "public", "videos", "generated", cachedVideoName);

  if (fs.existsSync(cachedVideoPath) && fs.statSync(cachedVideoPath).size > 1000) {
    return res.json({
      ok: true,
      videoUrl: `/videos/generated/${cachedVideoName}`,
      duration: 3.0,
      cached: true,
    });
  }

  try {
    let audioBuffer = null;
    const apiKeys = getElevenLabsApiKeys();
    if (apiKeys.length > 0) {
      try {
        const shortText = cleanText.length > 3500
          ? (() => {
              const cut = cleanText.slice(0, 3500);
              const last = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
              return last >= 2000 ? cut.slice(0, last + 1) : cut.trimEnd() + "…";
            })()
          : cleanText;
        audioBuffer = await createElevenLabsAudio(shortText, voiceId, modelId, apiKeys, speed);
      } catch (elevenErr) {
        console.warn("[AvatarVideo] ElevenLabs lỗi, chuyển sang gTTS:", elevenErr.message);
      }
    }

    if (!audioBuffer) {
      audioBuffer = await generateGttsAudioBuffer(cleanText);
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(500).json({ ok: false, error: "Không thể tạo giọng đọc cho video." });
    }

    const audioHash = crypto.createHash("md5").update(audioBuffer).digest("hex");
    const tempAudioPath = path.join(projectDir, "temp", `speech_${audioHash}.mp3`);
    fs.mkdirSync(path.join(projectDir, "temp"), { recursive: true });
    fs.writeFileSync(tempAudioPath, audioBuffer);

    // Gửi request tới microservice Wav2Lip RTX 3050 (port 5005)
    const genRes = await fetch("http://127.0.0.1:5005/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio_path: tempAudioPath.replace(/\\/g, "/"), text: cleanText }),
    });

    if (!genRes.ok) {
      const errData = await genRes.json().catch(() => ({}));
      throw new Error(errData.error || `Wav2Lip HTTP ${genRes.status}`);
    }

    const genData = await genRes.json();
    const rawVideoRel = genData.video_url ? genData.video_url.replace(/^\//, "") : "";
    const rawVideoPath = path.join(projectDir, "public", rawVideoRel);
    if (fs.existsSync(rawVideoPath)) {
      try { fs.copyFileSync(rawVideoPath, cachedVideoPath); } catch {}
    }
    return res.json({
      ok: true,
      videoUrl: `/videos/generated/${cachedVideoName}`,
      duration: genData.duration,
      cached: genData.cached,
    });
  } catch (err) {
    console.error("[AvatarVideo] Lỗi tạo video nhép miệng:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
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
