// Profanity filter for display names (Vietnamese & English)
// Normalizes leetspeak, punctuation obfuscation, accents, and casing.

const VULGAR_TOKENS = new Set([
  // Vietnamese acronyms & core profanities
  "dm", "đm", "dcm", "đcm", "clm", "vcl", "vkl", "vcc", "dkm", "đkm",
  "dmm", "đmm", "đbrr", "dbrr", "clgt", "vl",
  "dit", "địt", "du", "đụ", "lon", "lồn", "cac", "cặc", "kac", "kặc",
  "buoi", "buồi", "dai", "dái",
  "pho", "phò", "cave", "di", "đĩ",
  "nung", "nứng",

  // English swear words
  "fuck", "fck", "fuk", "fak", "shit", "bitch", "cunt", "dick", "cock",
  "pussy", "asshole", "bastard", "nigger", "nigga", "faggot", "slut",
  "whore", "retard", "porn"
]);

const VULGAR_PHRASES = [
  "oc cho", "óc chó", "cho de", "chó đẻ", "do cho", "đồ chó",
  "cho chet", "chó chết", "suc vat", "súc vật", "mat day", "mất dạy",
  "bo may", "bố mày", "me may", "mẹ mày", "ba may", "bà mày",
  "thu dam", "thủ dâm", "soc lo", "sóc lọ", "tham du", "thẩm du",
  "xao lon", "xạo lồn", "ham lon", "hãm lồn", "gai goi", "gái gọi",
  "chet tiet", "chết tiệt", "khon nan", "khốn nạn", "ngu lol", "ngu lon",
  "ngu cac", "ngu cặc", "motherfucker", "son of a bitch"
];

function normalizeText(text) {
  if (typeof text !== "string") return "";
  let s = text.toLowerCase().trim();

  // Map leetspeak numbers & symbols to ascii
  s = s.replace(/[@]/g, "a")
       .replace(/[0]/g, "o")
       .replace(/[1!|]/g, "i")
       .replace(/[3]/g, "e")
       .replace(/[4]/g, "a")
       .replace(/[5$]/g, "s")
       .replace(/[7]/g, "t")
       .replace(/[8]/g, "b")
       .replace(/[9]/g, "g");

  // NFD accent stripping
  const noAccents = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  return { original: s, noAccents };
}

export function validateDisplayName(name) {
  if (!name || typeof name !== "string") {
    return { valid: false, error: "Vui lòng nhập tên hiển thị." };
  }
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return { valid: false, error: "Tên hiển thị phải có ít nhất 2 ký tự." };
  }
  if (trimmed.length > 20) {
    return { valid: false, error: "Tên hiển thị tối đa 20 ký tự." };
  }

  const { original, noAccents } = normalizeText(trimmed);

  // Check multi-word vulgar phrases in both original and noAccents
  for (const phrase of VULGAR_PHRASES) {
    const normPhrase = phrase.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();
    if (noAccents.includes(normPhrase) || original.includes(phrase.toLowerCase())) {
      return {
        valid: false,
        error: "Tên chứa từ ngữ không phù hợp thuần phong mỹ tục. Vui lòng chọn tên lịch sự để cùng chơi vui vẻ với bạn bè!"
      };
    }
  }

  // Check with punctuation removed inside words (e.g. "d.m may" -> "dm may")
  const strippedPunct = noAccents.replace(/[\._\-*#~^%&]+/g, "");
  const strippedTokens = strippedPunct.split(/\s+/).filter(Boolean);
  for (const token of strippedTokens) {
    if (VULGAR_TOKENS.has(token)) {
      return {
        valid: false,
        error: "Tên chứa từ ngữ không phù hợp thuần phong mỹ tục. Vui lòng chọn tên lịch sự để cùng chơi vui vẻ với bạn bè!"
      };
    }
  }

  // Check compacted version (stripping all spaces, dots, hyphens, underscores)
  const compacted = noAccents.replace(/[^a-z0-9]/g, "");
  for (const token of VULGAR_TOKENS) {
    const normToken = token.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();
    if (compacted === normToken) {
      return {
        valid: false,
        error: "Tên chứa từ ngữ không phù hợp thuần phong mỹ tục. Vui lòng chọn tên lịch sự để cùng chơi vui vẻ với bạn bè!"
      };
    }
  }

  // Tokenize by non-alphanumeric chars
  const tokens = noAccents.split(/[^a-z0-9]+/).filter(Boolean);
  for (const token of tokens) {
    if (VULGAR_TOKENS.has(token)) {
      return {
        valid: false,
        error: "Tên chứa từ ngữ không phù hợp thuần phong mỹ tục. Vui lòng chọn tên lịch sự để cùng chơi vui vẻ với bạn bè!"
      };
    }
  }

  // Also check original words (for accented swear words)
  const origTokens = original.split(/[^a-z0-9\u00C0-\u024F\u1EA0-\u1EF9]+/).filter(Boolean);
  for (const token of origTokens) {
    if (VULGAR_TOKENS.has(token)) {
      return {
        valid: false,
        error: "Tên chứa từ ngữ không phù hợp thuần phong mỹ tục. Vui lòng chọn tên lịch sự để cùng chơi vui vẻ với bạn bè!"
      };
    }
  }

  // Additional leetspeak substring checks for core slurs if compacted contains them
  const severeSlurs = ["vcl", "vkl", "dcm", "dkm", "clm", "dbrr", "fck", "fuck", "cunt", "nigger", "nigga"];
  for (const slur of severeSlurs) {
    if (compacted.includes(slur)) {
      return {
        valid: false,
        error: "Tên chứa từ ngữ không phù hợp thuần phong mỹ tục. Vui lòng chọn tên lịch sự để cùng chơi vui vẻ với bạn bè!"
      };
    }
  }

  return { valid: true, cleanName: trimmed };
}
