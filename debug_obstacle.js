import dotenv from "dotenv";
dotenv.config();
import { fetchWithGeminiKeyFallback, getGeminiApiKeys } from "./gemini-api.js";

async function debugObstacle() {
  const geminiApiKeys = getGeminiApiKeys();
  const geminiModel = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
  const topic = "Tiếng Anh";
  const count = 5;

  const prompt = [
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
    `Câu gần đây cần tránh:\n[]`,
    `Từ khóa gần đây cần tránh:\n[]`,
    `Chỉ trả JSON object đúng dạng {"obstacle":{"keyword":"TU_KHOA","logic":"Giải thích liên hệ của từng hàng ngang với từ khóa","illustration":{"background":"#RRGGBB","elements":[{"type":"circle","cx":50,"cy":50,"r":15,"fill":"#RRGGBB"}]}},"questions":[...]} với mảng questions có đúng ${count + 1} phần tử: ${count} câu đầu là HÀNG NGANG 1 đến ${count}, phần tử cuối là Ô TRUNG TÂM. Mỗi câu có prompt, question, options gồm đúng 4 đáp án, answer là chỉ số 0-3, explanation. Câu trung tâm hỏi từ khóa bí ẩn là gì; options phải có đúng obstacle.keyword. Trong illustration, trả 10-24 hình hợp lệ theo cấu trúc; chỉ dùng type circle, ellipse, rect, line, polygon. Không thêm markdown hay văn bản ngoài JSON.`,
  ].join("\n");

  const { response } = await fetchWithGeminiKeyFallback({
    apiKeys: geminiApiKeys,
    timeoutMs: 15000,
    url: `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 6000,
          responseMimeType: "application/json",
        },
      }),
    },
  });
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsed = JSON.parse(text);
  console.log("Obstacle:", parsed.obstacle ? "OK" : "MISSING");
  console.log("Questions length:", parsed.questions?.length);
  console.log("Central question:", parsed.questions?.[5]);
}
debugObstacle().catch(console.error);
