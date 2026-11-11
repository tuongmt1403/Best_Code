import express from "express";
import { generateWithGroq, reviewWithGroq } from "../ai-review.js";
import { createQuizOnQuizApi, QuizApiError } from "../quiz-api.js";
import { fetchWithGeminiKeyFallback, getGeminiApiKeys } from "../gemini-api.js";
import { getGroqApiKeys } from "../groq-api.js";

const DEFAULT_OLLAMA_MODEL = "qwen2.5:3b";
const OLLAMA_TIMEOUT_MS = 180_000;
const quizSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      question: { type: "string" },
      topic: { type: "string" },
      options: { type: "array", items: { type: "string" } },
      answer: { type: "string" },
      explanation: { type: "string" },
    },
    required: ["question", "topic", "options", "answer", "explanation"],
  },
};
const studyAnswerSchema = {
  type: "object",
  properties: {
    correct: { type: "boolean" },
    feedback: { type: "string" },
    whyWrong: { type: "string" },
    focus: { type: "string" },
    hint: { type: "string" },
    explanation: { type: "string" },
    example: { type: "string" },
  },
  required: ["correct", "feedback", "whyWrong", "focus", "hint", "explanation", "example"],
};
const studyWrongAnswerSchema = {
  type: "object",
  properties: {
    feedback: { type: "string" },
    whyWrong: { type: "string" },
    focus: { type: "string" },
    hint: { type: "string" },
  },
  required: ["feedback", "whyWrong", "focus", "hint"],
};
const studySolutionSchema = {
  type: "object",
  properties: {
    answer: { type: "string" },
    explanation: { type: "string" },
    diagram: {
      type: "object",
      properties: {
        title: { type: "string" },
        type: { type: "string", enum: ["map", "flow", "timeline", "concept"] },
        centerIndex: { type: "integer" },
        nodes: { type: "array", items: { type: "string" } },
        edges: {
          type: "array",
          items: {
            type: "object",
            properties: {
              from: { type: "integer" },
              to: { type: "integer" },
              label: { type: "string" },
            },
            required: ["from", "to", "label"],
          },
        },
      },
      required: ["title", "type", "centerIndex", "nodes", "edges"],
    },
  },
  required: ["answer", "explanation", "diagram"],
};

const quizTopics = {
  antiUsWar: {
    id: "antiUsWar",
    title: "Kháng chiến chống Mỹ, 1954–1975",
    period: "1954–1975",
    description: "Ôn các mốc chính từ sau Hiệp định Genève đến khi chiến tranh kết thúc năm 1975.",
    material: `Chủ đề: Kháng chiến chống Mỹ và chiến tranh Việt Nam, giai đoạn 1954–1975.

Sau Hiệp định Genève năm 1954, Việt Nam tạm thời chia thành hai vùng tập kết quân sự ở hai phía vĩ tuyến 17; đây không được quy định là biên giới quốc gia vĩnh viễn. Hiệp định dự kiến tổng tuyển cử để thống nhất Việt Nam, nhưng cuộc tổng tuyển cử đó không diễn ra như dự kiến. Tình hình chính trị và quân sự ở hai miền ngày càng đối đầu.

Trước Hiệp định Genève, Chiến dịch Điện Biên Phủ diễn ra từ ngày 13/3 đến ngày 7/5/1954 trong kháng chiến chống Pháp. Pháp xây dựng tập đoàn cứ điểm ở lòng chảo Điện Biên Phủ để giữ vị trí chiến lược ở Tây Bắc và hy vọng buộc lực lượng Việt Minh giao chiến theo cách có lợi cho họ. Phía Việt Minh mở chiến dịch, tổ chức lực lượng bao vây, vận chuyển lương thực và vũ khí qua địa hình núi rừng, đưa pháo vào trận địa và tiến công từng cụm cứ điểm. Giao tranh thường được khái quát thành ba đợt: mở màn với các cứ điểm phía bắc, chiến đấu kéo dài quanh các cao điểm phía đông, rồi tổng công kích từ ngày 1/5 đến ngày 7/5. Ngày 7/5/1954, sở chỉ huy tập đoàn cứ điểm bị đánh chiếm và quân Pháp tại đây thất bại. Chiến thắng tạo sức ép quyết định trong bối cảnh đàm phán, góp phần dẫn tới Hiệp định Genève tháng 7/1954; không nên hiểu rằng một trận đánh tự nó là toàn bộ nguyên nhân của hiệp định.

Cuối thập niên 1950 và đầu thập niên 1960, phong trào Đồng Khởi bùng lên ở miền Nam, tiêu biểu tại Bến Tre năm 1960. Hoa Kỳ tăng cường vai trò và sự hiện diện quân sự tại miền Nam. Từ năm 1965, quân chiến đấu Hoa Kỳ đổ bộ vào Đà Nẵng; chiến tranh mở rộng với các chiến dịch không quân và lực lượng mặt đất của Hoa Kỳ.

Đầu năm 1968, cuộc Tổng tiến công và nổi dậy Tết Mậu Thân diễn ra tại nhiều đô thị và địa bàn ở miền Nam. Cuộc tiến công không đạt mọi mục tiêu quân sự dự kiến, gây tổn thất lớn cho nhiều bên và tạo tác động chính trị, truyền thông sâu rộng; nó ảnh hưởng đến tranh luận tại Hoa Kỳ và tiến trình đàm phán.

Hiệp định Paris về chấm dứt chiến tranh, lập lại hòa bình ở Việt Nam được ký ngày 27/1/1973. Theo tiến trình hiệp định, quân đội Hoa Kỳ rút khỏi Việt Nam; tuy vậy, xung đột giữa các lực lượng Việt Nam tiếp tục và chiến tranh chưa kết thúc vào năm 1973.

Mùa Xuân năm 1975, các chiến dịch quân sự diễn ra liên tiếp, gồm chiến dịch Tây Nguyên, chiến dịch Huế–Đà Nẵng và chiến dịch Hồ Chí Minh. Ngày 30/4/1975, lực lượng tiến công tiến vào Sài Gòn và chính quyền Việt Nam Cộng hòa tuyên bố đầu hàng. Đây là mốc kết thúc chiến tranh tại miền Nam; việc thống nhất nhà nước được thực hiện năm 1976.

Khi học chủ đề, cần phân biệt Hiệp định Genève (1954) với Hiệp định Paris (1973), phân biệt việc quân đội Hoa Kỳ rút năm 1973 với việc chiến tranh kết thúc năm 1975, và trình bày sự kiện, kết quả quân sự, tác động chính trị như các khía cạnh liên quan nhưng không đồng nhất.`,
  },
  geography: {
    id: "geography",
    title: "Địa lý Việt Nam",
    period: "Tự nhiên và dân cư",
    description: "Tìm hiểu địa lý tự nhiên, khí hậu và đặc điểm dân cư Việt Nam.",
    material: `Chủ đề: Địa lý Việt Nam — địa lý tự nhiên, khí hậu và dân cư.

Việt Nam nằm ở rìa phía đông bán đảo Đông Dương, thuộc khu vực Đông Nam Á. Phần đất liền kéo dài theo chiều Bắc–Nam, phía đông và phía nam giáp Biển Đông, phía bắc giáp Trung Quốc, phía tây giáp Lào và Campuchia. Lãnh thổ gồm vùng đất, vùng biển và vùng trời; đường bờ biển dài tạo điều kiện phát triển giao thông, thủy sản và du lịch.

Địa hình Việt Nam đa dạng, trong đó đồi núi chiếm phần lớn diện tích nhưng chủ yếu là đồi núi thấp. Đồng bằng tập trung ở hai châu thổ lớn là đồng bằng sông Hồng và đồng bằng sông Cửu Long, ngoài ra còn có các đồng bằng ven biển miền Trung. Địa hình ảnh hưởng đến phân bố dân cư, giao thông, sản xuất nông nghiệp và nguy cơ thiên tai.

Khí hậu Việt Nam mang tính chất nhiệt đới ẩm gió mùa, nhưng có sự khác biệt theo vĩ độ, độ cao và ảnh hưởng của biển. Miền Bắc có mùa đông lạnh hơn miền Nam; lượng mưa, nhiệt độ và thời điểm mùa mưa khác nhau giữa các vùng. Bão, lũ, hạn hán và sạt lở là một số thiên tai cần được xem xét theo đặc điểm từng khu vực.

Dân cư Việt Nam phân bố không đồng đều. Các đồng bằng, đô thị và vùng kinh tế phát triển thường tập trung đông dân hơn nhiều khu vực miền núi. Dân số đông tạo nguồn lao động và thị trường lớn, đồng thời đặt ra yêu cầu về việc làm, hạ tầng, giáo dục, y tế và sử dụng tài nguyên bền vững. Việt Nam có nhiều dân tộc với bản sắc văn hóa đa dạng.

Khi phân tích một vấn đề địa lý, cần xác định vị trí và phạm vi, nêu đặc điểm nổi bật, tìm mối liên hệ giữa các yếu tố tự nhiên và con người, rồi giải thích hệ quả theo từng vùng thay vì khái quát mọi nơi giống nhau.`,
  },
  cProgramming: {
    id: "cProgramming",
    title: "Lập trình C cơ bản đến trung cấp",
    period: "C11/C17",
    description: "Ôn nền tảng C, hàm, mảng, con trỏ, struct, bộ nhớ động và thao tác tệp.",
    material: `Chủ đề: Lập trình C cơ bản đến trung cấp (theo các chuẩn C11/C17).

Chương trình C thường bắt đầu từ hàm main. Mỗi câu lệnh thường kết thúc bằng dấu chấm phẩy; khối lệnh được đặt trong cặp ngoặc nhọn. Các thư viện chuẩn được khai báo bằng chỉ thị #include, chẳng hạn stdio.h cho nhập xuất cơ bản và stdlib.h cho một số hàm tiện ích.

Biến lưu dữ liệu có kiểu. Các kiểu cơ bản thường gặp gồm char, int, float và double; sizeof cho biết kích thước tính bằng byte của một kiểu hoặc đối tượng trên môi trường đang chạy, nên không nên giả định mọi kiểu luôn có kích thước cố định trên mọi hệ thống. Hằng có thể được biểu diễn bằng const hoặc macro. Toán tử số học, so sánh, logic, gán và tăng/giảm được dùng để tạo biểu thức; cần chú ý thứ tự ưu tiên toán tử và phép chia số nguyên khi cả hai toán hạng là số nguyên.

printf được dùng để xuất dữ liệu và scanf có thể đọc dữ liệu theo định dạng. Khi dùng scanf, cần kiểm tra giá trị trả về để biết dữ liệu có được đọc thành công hay không. Với chuỗi ký tự, phải dành chỗ cho ký tự kết thúc '\0'; cần giới hạn độ dài đầu vào để tránh ghi vượt kích thước vùng đệm.

Rẽ nhánh dùng if, else if, else hoặc switch. Vòng lặp for phù hợp khi biết trước cấu trúc lặp, while kiểm tra điều kiện trước mỗi vòng, còn do-while thực hiện thân vòng lặp ít nhất một lần. break kết thúc vòng lặp hoặc switch gần nhất; continue chuyển sang lượt lặp tiếp theo.

Hàm giúp chia chương trình thành các phần có nhiệm vụ rõ ràng. Khai báo nguyên mẫu hàm cho trình biên dịch biết tên, kiểu trả về và các tham số trước khi hàm được gọi. C truyền đối số theo giá trị; muốn hàm thay đổi dữ liệu của bên gọi, thường truyền địa chỉ thông qua con trỏ. Biến cục bộ có phạm vi trong khối khai báo, còn biến toàn cục được khai báo ngoài các hàm.

Mảng chứa nhiều phần tử cùng kiểu và chỉ số bắt đầu từ 0. C không tự kiểm tra biên mảng, vì vậy chương trình phải bảo đảm chỉ số luôn nằm trong phạm vi hợp lệ. Chuỗi kiểu C là mảng char kết thúc bằng '\0'; các hàm thao tác chuỗi thường dùng trong string.h, nhưng cần bảo đảm dung lượng đích đủ lớn. Mảng hai chiều thường được dùng để biểu diễn bảng hoặc ma trận.

Con trỏ lưu địa chỉ của một đối tượng. Toán tử & lấy địa chỉ, còn * truy cập giá trị thông qua con trỏ. Con trỏ cần được khởi tạo trước khi sử dụng và chỉ được giải tham chiếu khi trỏ tới vùng nhớ hợp lệ. NULL biểu thị con trỏ không trỏ tới đối tượng hợp lệ. Khi làm việc với mảng, phép toán con trỏ phụ thuộc vào kích thước kiểu mà nó trỏ tới.

struct gom nhiều trường có thể thuộc các kiểu khác nhau thành một kiểu dữ liệu do người dùng định nghĩa. Có thể truy cập trường qua biến cấu trúc bằng dấu chấm hoặc qua con trỏ cấu trúc bằng toán tử mũi tên. typedef có thể tạo tên kiểu thuận tiện hơn.

Cấp phát bộ nhớ động thường dùng malloc hoặc calloc và giải phóng bằng free; cần kiểm tra kết quả cấp phát khác NULL trước khi sử dụng. Mỗi vùng nhớ được cấp phát cần được giải phóng đúng một lần khi không còn dùng. Tránh truy cập sau khi free, giải phóng hai lần hoặc làm mất địa chỉ vùng nhớ chưa được giải phóng.

Thao tác tệp dùng FILE* cùng các hàm trong stdio.h như fopen, fprintf, fscanf, fgets và fclose. Cần kiểm tra fopen có trả về NULL hay không, chọn chế độ mở phù hợp, và đóng tệp sau khi hoàn tất. fgets thường giúp giới hạn số ký tự được đọc vào bộ đệm.

Một quy trình biên dịch cơ bản gồm viết mã nguồn, biên dịch, xử lý lỗi biên dịch, chạy chương trình và kiểm thử với cả dữ liệu thông thường lẫn trường hợp biên. Khi gỡ lỗi, cần kiểm tra giá trị biến, chỉ số mảng, điều kiện dừng vòng lặp, con trỏ và đường đi giải phóng bộ nhớ. Câu hỏi và lời giải cần phân biệt rõ lỗi cú pháp, lỗi khi chạy và lỗi logic.`,
  },
};

function getQuizTopic(topicId) {
  return typeof topicId === "string" ? quizTopics[topicId] : undefined;
}

const studyFocusTopics = {
  antiUsWar: ["Phong trào Đồng Khởi", "Hiệp định Paris", "Hiệp định Genève", "Chiến dịch Điện Biên Phủ"],
  geography: ["Địa lý tự nhiên", "Địa lý dân cư", "Khí hậu"],
  cProgramming: ["Biến & Kiểu dữ liệu", "Cấu trúc điều khiển", "Hàm", "Con trỏ"],
};

const analysisSchema = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Nhận xét chung về kết quả làm bài." },
    weaknesses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          reason: { type: "string" },
          knowledgeToReview: { type: "string" },
        },
        required: ["topic", "reason", "knowledgeToReview"],
      },
    },
    studyPlan: {
      type: "array",
      items: {
        type: "object",
        properties: {
          step: { type: "integer" },
          title: { type: "string" },
          activity: { type: "string" },
        },
        required: ["step", "title", "activity"],
      },
    },
    practiceTips: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["summary", "weaknesses", "studyPlan", "practiceTips"],
};

function getQuizValidationErrors(quiz, expectedCount) {
  if (!Array.isArray(quiz)) return ["response is not an array"];
  const errors = [];
  if (quiz.length !== expectedCount) errors.push(`expected ${expectedCount} questions, received ${quiz.length}`);
  quiz.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      errors.push(`question ${index + 1} is not an object`);
      return;
    }
    if (typeof item.question !== "string" || !item.question.trim()) errors.push(`question ${index + 1} has no question text`);
    if (typeof item.topic !== "string" || !item.topic.trim()) errors.push(`question ${index + 1} has no topic`);
    if (!Array.isArray(item.options) || item.options.length !== 4
      || item.options.some((option) => typeof option !== "string" || !option.trim())
      || new Set(item.options).size !== 4) errors.push(`question ${index + 1} does not have four distinct options`);
    if (typeof item.answer !== "string" || !Array.isArray(item.options) || !item.options.includes(item.answer)) {
      errors.push(`question ${index + 1} answer does not match an option`);
    }
    if (typeof item.explanation !== "string" || !item.explanation.trim()) errors.push(`question ${index + 1} has no explanation`);
  });
  return errors;
}

function getQuizPrompt(count, sourceText, selectedTopic, validationErrors = []) {
  const correction = validationErrors.length
    ? `\n\nSỬA CÁC LỖI SAU TRONG LẦN TẠO TRƯỚC: ${validationErrors.join("; ")}. Mỗi câu cần đúng 4 phương án riêng biệt và chỉ một đáp án đúng.`
    : "";
  return `Tạo CHÍNH XÁC ${count} câu hỏi trắc nghiệm tiếng Việt chỉ dựa trên tài liệu bên dưới. Trả về JSON dạng [{"question":"...","topic":"...","options":["A","B","C","D"],"answer":"A","explanation":"..."}]. Mỗi câu có đúng 4 phương án khác nhau, chỉ một đáp án đúng, đáp án phải trùng chính xác một phương án; lời giải thích căn cứ tài liệu. Không thêm dữ kiện ngoài tài liệu, không lặp câu hỏi.${correction}\n\n<TAI_LIEU ${selectedTopic ? `CHU_DE="${selectedTopic.title}"` : ""}>\n${sourceText.trim()}\n</TAI_LIEU>`;
}

async function generateQuizWithOllama(ollama, count, sourceText, selectedTopic) {
  let validationErrors = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const content = await ollama.chat(
      "Bạn là trợ lý giáo dục chuyên tạo câu hỏi trắc nghiệm. Chỉ kiểm tra dữ kiện được nêu rõ trong tài liệu, không bịa kiến thức. Tạo câu hỏi chính xác bằng tiếng Việt, mỗi câu có đúng 4 lựa chọn khác nhau và chỉ một đáp án đúng. Chỉ trả JSON theo schema.",
      getQuizPrompt(count, sourceText, selectedTopic, validationErrors),
      quizSchema,
      Math.min(4_096, 400 + count * 350),
    );
    try {
      const quiz = JSON.parse(content);
      validationErrors = getQuizValidationErrors(quiz, count);
      if (!validationErrors.length) return quiz;
    } catch {
      validationErrors = ["phản hồi không phải JSON hợp lệ"];
    }
  }
  throw new Error(`Ollama không tạo được bộ câu hỏi hợp lệ: ${validationErrors.join("; ")}`);
}

function isValidAnalysis(analysis) {
  return analysis
    && typeof analysis.summary === "string"
    && Array.isArray(analysis.weaknesses)
    && analysis.weaknesses.every((item) =>
      item
      && typeof item.topic === "string"
      && typeof item.reason === "string"
      && typeof item.knowledgeToReview === "string"
    )
    && Array.isArray(analysis.studyPlan)
    && analysis.studyPlan.every((item) =>
      item
      && Number.isInteger(item.step)
      && typeof item.title === "string"
      && typeof item.activity === "string"
    )
    && Array.isArray(analysis.practiceTips)
    && analysis.practiceTips.every((item) => typeof item === "string");
}

export function adaptPerfectScoreAnalysis(analysis, correctAnswers, totalQuestions, topicTitle) {
  if (!totalQuestions || correctAnswers !== totalQuestions) return analysis;
  const topic = topicTitle || "chủ đề vừa học";
  return {
    ...analysis,
    summary: `Bạn trả lời đúng tất cả ${totalQuestions} câu. Bài kiểm tra này chưa xác định điểm yếu cụ thể; lộ trình dưới đây tập trung củng cố và vận dụng sâu hơn kiến thức về ${topic}.`,
    weaknesses: [],
    studyPlan: [
      {
        step: 1,
        title: "Tóm tắt kiến thức trọng tâm",
        activity: `Tự tóm tắt các sự kiện, khái niệm và mốc chính trong tài liệu về ${topic} bằng lời của bạn.`,
      },
      {
        step: 2,
        title: "Ôn quan hệ và trình tự",
        activity: "Vẽ dòng thời gian hoặc sơ đồ nguyên nhân – diễn biến – kết quả; kiểm tra lại các mốc bằng tài liệu.",
      },
      {
        step: 3,
        title: "Thử thách nâng cao",
        activity: "Làm bộ câu hỏi khó hơn, giải thích vì sao từng đáp án đúng hoặc sai và ghi lại điều cần tìm hiểu thêm.",
      },
    ],
    practiceTips: [
      "Ôn lại kiến thức sau một ngày và một tuần để kiểm tra khả năng ghi nhớ.",
      "Tự giải thích nội dung như đang dạy lại cho người khác.",
    ],
  };
}

function createOllamaClient(baseUrl, model) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  async function chat(system, prompt, format, numPredict = 1_600) {
    let response;
    try {
      response = await fetch(`${normalizedBaseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          format,
          stream: false,
          options: { temperature: 0.2, num_predict: numPredict },
        }),
      });
    } catch (error) {
      if (error.name === "TimeoutError" || error.name === "AbortError") {
        const timeoutError = new Error("Ollama mất quá nhiều thời gian để phản hồi.");
        timeoutError.code = "OLLAMA_TIMEOUT";
        throw timeoutError;
      }
      const connectionError = new Error("Không kết nối được với Ollama.");
      connectionError.code = "OLLAMA_UNAVAILABLE";
      throw connectionError;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(typeof data.error === "string" ? data.error : "Ollama không tạo được phản hồi.");
      error.status = response.status;
      throw error;
    }
    if (typeof data.message?.content !== "string" || !data.message.content.trim()) {
      throw new Error("Ollama trả về nội dung trống.");
    }
    return data.message.content;
  }

  async function status() {
    try {
      const response = await fetch(`${normalizedBaseUrl}/api/tags`, { signal: AbortSignal.timeout(2_000) });
      if (!response.ok) return { available: false, model, modelInstalled: false };
      const data = await response.json();
      const models = Array.isArray(data.models) ? data.models : [];
      return {
        available: true,
        model,
        modelInstalled: models.some((item) => item.name === model || item.name?.startsWith(`${model}:`)),
      };
    } catch {
      return { available: false, model, modelInstalled: false };
    }
  }

  return { chat, status, model };
}

function ollamaErrorResponse(res, error, model) {
  console.error("Ollama quiz request failed:", error.message);
  if (error.code === "OLLAMA_UNAVAILABLE") {
    return res.status(503).json({
      error: "Chưa kết nối được Ollama. Hãy cài và mở Ollama, sau đó tải model bằng lệnh: ollama pull qwen2.5:3b.",
    });
  }
  if (error.code === "OLLAMA_TIMEOUT") {
    return res.status(504).json({ error: "Ollama phản hồi quá lâu. Model có thể đang khởi động lần đầu; hãy thử lại sau." });
  }
  if (error.status === 404) {
    return res.status(503).json({ error: `Chưa có model Quiz AI. Mở terminal và chạy: ollama pull ${model}.` });
  }
  return res.status(502).json({ error: "Ollama gặp lỗi khi tạo nội dung Quiz. Hãy kiểm tra Ollama và model đã tải." });
}

function getStudyStages(results) {
  const topicResults = new Map();
  for (const result of results) {
    const topic = topicResults.get(result.topic) || { mistakes: 0, correct: 0 };
    topic[result.correct ? "correct" : "mistakes"] += 1;
    topicResults.set(result.topic, topic);
  }

  const topics = [...topicResults.entries()];
  const weakTopics = topics
    .filter(([, result]) => result.mistakes > 0)
    .sort((a, b) => b[1].mistakes - a[1].mistakes);
  const strongTopics = topics
    .filter(([, result]) => result.correct > 0)
    .sort((a, b) => b[1].correct - a[1].correct);

  return [
    ...weakTopics.flatMap(([topic]) => [
      { topic, phase: "foundation" },
      { topic, phase: "practice" },
    ]),
    ...strongTopics.map(([topic]) => ({ topic, phase: "advanced" })),
  ];
}

function getStudyEvidence(material, topic) {
  const topicWords = topic
    .toLocaleLowerCase("vi")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2);
  const paragraphs = material.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const ranked = paragraphs
    .map((paragraph, index) => ({
      paragraph,
      index,
      score: topicWords.reduce((score, word) =>
        score + (paragraph.toLocaleLowerCase("vi").includes(word) ? 1 : 0), 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 1)
    .sort((a, b) => a.index - b.index);
  return ranked.map((item) => item.paragraph).join("\n\n") || paragraphs.slice(1, 3).join("\n\n");
}

function getStudyAnalogy(topic) {
  const normalizedTopic = topic.toLocaleLowerCase("vi");
  if (/mảng|chuỗi/.test(normalizedTopic)) {
    return "Hãy tưởng tượng một dãy ngăn kéo được đánh số từ 0. Mỗi ngăn giữ một giá trị; muốn lấy đúng giá trị, ta cần dùng nhãn của ngăn thay vì đếm theo cách nói hằng ngày.";
  }
  if (/con trỏ|pointer/.test(normalizedTopic)) {
    return "Hãy hình dung một tấm thẻ ghi địa chỉ của căn nhà. Tấm thẻ không phải căn nhà hay đồ vật bên trong; nó giúp ta tìm đúng nơi đang cất giá trị.";
  }
  if (/hàm/.test(normalizedTopic)) {
    return "Hãy xem hàm như một chiếc máy: đưa nguyên liệu vào, máy làm theo một quy trình, rồi trả kết quả để phần khác của chương trình sử dụng.";
  }
  if (/vòng lặp/.test(normalizedTopic)) {
    return "Hãy hình dung việc kiểm tra từng món trong một danh sách: mỗi lượt làm một việc, rồi phải có điều kiện dừng rõ ràng để không lặp mãi.";
  }
  return "Hãy tưởng tượng mình đang giải một tình huống thật: xác định dữ kiện, chọn quy tắc phù hợp, làm từng bước rồi tự kiểm tra kết quả.";
}

function createStudyLesson({ topic, material, results, stage }) {
  const relatedResults = results.filter((item) => item.topic === topic);
  const incorrectResult = relatedResults.find((item) => !item.correct);
  const correctResult = relatedResults.find((item) => item.correct);
  const evidence = getStudyEvidence(material, topic);

  if (stage.phase === "foundation") {
    return {
      title: `Củng cố nền tảng: ${topic}`,
      theory: `Mình cùng trò chuyện và ôn từng ý nhé. Bạn hãy trả lời câu hỏi bằng lời của mình; nếu còn nhầm, mình sẽ giải thích chỗ cần xem lại và gợi ý để bạn tự suy luận tiếp.\n\nÝ chính cần nhớ:\n\n${evidence}\n\n${getStudyAnalogy(topic)}`,
      practiceQuestion: incorrectResult
        ? `Không nhìn lại câu trả lời cũ: hãy giải thích nguyên tắc cần dùng cho câu “${incorrectResult.question}” bằng lời của bạn, rồi tự nêu một ví dụ khác để minh họa.`
        : `Hãy trình bày ${topic} bằng lời của bạn, nêu một đặc điểm hoặc quy tắc quan trọng và tự đưa ra một ví dụ để minh họa.`,
    };
  }

  if (stage.phase === "practice") {
    return {
      title: `Luyện tập vận dụng: ${topic}`,
      theory: `Mình sẽ cùng bạn vận dụng kiến thức vào tình huống mới. Hãy giải thích cách suy nghĩ của bạn từng bước; mình sẽ phản hồi cụ thể vào lập luận đó.\n\nÝ cần vận dụng: ${evidence}\n\nTình huống để hình dung: ${getStudyAnalogy(topic)}`,
      practiceQuestion: incorrectResult
        ? `Hãy tự tạo một tình huống hoặc ví dụ mới về “${topic}” có liên quan đến câu “${incorrectResult.question}”, giải quyết tình huống đó theo từng bước và giải thích vì sao cách làm của bạn đúng.`
        : `Hãy áp dụng kiến thức về “${topic}” vào một tình huống hoặc ví dụ mới. Trình bày từng bước và giải thích vì sao cách làm của bạn hợp lý.`,
    };
  }

  return {
    title: `Thử thách nâng cao: ${topic}`,
    theory: `${correctResult ? `Bạn đã làm tốt câu “${correctResult.question}”, vì vậy mình sẽ bỏ qua phần nhập môn và tăng độ thử thách nhé.` : "Mình sẽ cùng bạn kết nối kiến thức và xử lý một tình huống mới."} Hãy xem nguyên tắc bạn đã nắm như công cụ để suy luận:\n\n${evidence}\n\nMục tiêu là giải thích được vì sao cách áp dụng hiệu quả.`,
    practiceQuestion: correctResult
      ? `Ở mức nâng cao, hãy giải thích câu “${correctResult.question}” bằng cách liên hệ với một khái niệm khác trong chủ đề “${topic}”. Nêu một trường hợp biên hoặc điều kiện có thể làm thay đổi cách áp dụng, rồi dùng tài liệu để bảo vệ lập luận của bạn.`
      : `Ở mức nâng cao, hãy liên hệ “${topic}” với một khái niệm liên quan. Nêu một trường hợp đặc biệt có thể làm thay đổi cách giải thích và bảo vệ lập luận bằng các dữ kiện đã học.`,
  };
}

function getStudyQuiz(topicId, topic, phase) {
  const topicText = topic.toLocaleLowerCase("vi");
  let questions;
  if (topicId === "antiUsWar" && /điện biên phủ/.test(topicText)) {
    questions = [
      {
        question: "Chiến dịch Điện Biên Phủ năm 1954 thuộc cuộc kháng chiến nào?",
        options: ["Kháng chiến chống Pháp", "Kháng chiến chống Mỹ", "Phong trào Cần Vương", "Khởi nghĩa Lam Sơn"],
        answerIndex: 0,
      },
      {
        question: "Mục tiêu quân sự chính của phía Pháp khi xây dựng tập đoàn cứ điểm Điện Biên Phủ là gì?",
        options: [
          "Giữ vị trí chiến lược ở Tây Bắc và buộc đối phương giao chiến theo cách có lợi cho Pháp",
          "Mở đường biển từ Hà Nội vào Sài Gòn",
          "Bảo vệ cuộc tổng tuyển cử thống nhất Việt Nam",
          "Rút toàn bộ lực lượng khỏi Đông Dương ngay trong năm 1953",
        ],
        answerIndex: 0,
      },
      {
        question: "Điều gì diễn ra vào ngày 7/5/1954 tại Điện Biên Phủ?",
        options: [
          "Sở chỉ huy tập đoàn cứ điểm bị đánh chiếm, chiến dịch kết thúc với thất bại của quân Pháp",
          "Hiệp định Genève được ký kết",
          "Quân đội Hoa Kỳ đổ bộ vào Đà Nẵng",
          "Tổng tuyển cử thống nhất Việt Nam được tổ chức",
        ],
        answerIndex: 0,
      },
    ];
  } else if (topicId === "antiUsWar" && /đồng khởi/.test(topicText)) {
    questions = [
      { question: "Phong trào Đồng Khởi bùng lên tiêu biểu ở đâu và vào năm nào?", options: ["Bến Tre, năm 1960", "Điện Biên, năm 1954", "Hà Nội, năm 1946", "Sài Gòn, năm 1975"], answerIndex: 0 },
      { question: "Phong trào Đồng Khởi diễn ra chủ yếu ở miền nào?", options: ["Miền Nam", "Miền Bắc", "Tây Bắc", "Toàn Đông Dương cùng lúc"], answerIndex: 0 },
      { question: "Khi học về Đồng Khởi, mốc nào cần gắn với sự kiện tiêu biểu ở Bến Tre?", options: ["Năm 1960", "Năm 1954", "Năm 1968", "Năm 1973"], answerIndex: 0 },
    ];
  } else if (topicId === "antiUsWar") {
    questions = [
      { question: "Hiệp định Paris về Việt Nam được ký vào ngày nào?", options: ["27/1/1973", "7/5/1954", "30/4/1975", "2/9/1945"], answerIndex: 0 },
      { question: "Điều gì đúng về hệ quả của Hiệp định Paris?", options: ["Quân đội Hoa Kỳ rút khỏi Việt Nam, nhưng xung đột chưa chấm dứt ngay", "Chiến tranh kết thúc ngay trong ngày ký", "Việt Nam thống nhất nhà nước ngay năm 1973", "Hiệp định được ký sau ngày 30/4/1975"], answerIndex: 0 },
      { question: "Mốc nào đánh dấu chiến tranh kết thúc tại miền Nam Việt Nam?", options: ["30/4/1975", "27/1/1973", "7/5/1954", "1960"], answerIndex: 0 },
    ];
  } else if (topicId === "geography" && /khí hậu/.test(topicText)) {
    questions = [
      { question: "Đặc điểm khí hậu chung của Việt Nam là gì?", options: ["Nhiệt đới ẩm gió mùa", "Ôn đới lục địa quanh năm", "Hoang mạc khô nóng", "Hàn đới băng tuyết"], answerIndex: 0 },
      { question: "Yếu tố nào góp phần làm khí hậu Việt Nam khác nhau giữa các vùng?", options: ["Vĩ độ, độ cao và ảnh hưởng của biển", "Chỉ có kinh độ", "Chỉ có hoạt động đô thị", "Khoảng cách tới xích đạo là như nhau"], answerIndex: 0 },
      { question: "Cách nào phù hợp khi so sánh khí hậu Bắc và Nam Việt Nam?", options: ["Xét khác biệt mùa và ảnh hưởng vị trí địa lý", "Cho rằng mọi nơi có mùa đông giống nhau", "Chỉ dựa vào một ngày thời tiết", "Bỏ qua độ cao địa hình"], answerIndex: 0 },
    ];
  } else if (topicId === "geography" && /dân cư/.test(topicText)) {
    questions = [
      { question: "Dân cư Việt Nam phân bố như thế nào?", options: ["Không đồng đều giữa các vùng", "Chia đều tuyệt đối trên lãnh thổ", "Chỉ sống ở miền núi", "Chỉ tập trung dọc biên giới"], answerIndex: 0 },
      { question: "Khu vực nào thường tập trung đông dân hơn?", options: ["Đồng bằng và đô thị", "Đỉnh núi cao", "Rừng sâu ít đường giao thông", "Mọi khu vực đều như nhau"], answerIndex: 0 },
      { question: "Dân số đông vừa tạo nguồn lao động, vừa đặt ra yêu cầu gì?", options: ["Phát triển việc làm và hạ tầng phù hợp", "Ngừng cung cấp dịch vụ y tế", "Không cần quy hoạch đô thị", "Giảm nhu cầu giáo dục về không"], answerIndex: 0 },
    ];
  } else if (topicId === "geography") {
    questions = [
      { question: "Địa hình Việt Nam có đặc điểm nổi bật nào?", options: ["Đồi núi chiếm phần lớn diện tích, chủ yếu là đồi núi thấp", "Toàn bộ lãnh thổ là đồng bằng", "Không có đồng bằng ven biển", "Chỉ có núi cao phủ băng"], answerIndex: 0 },
      { question: "Hai đồng bằng châu thổ lớn của Việt Nam là gì?", options: ["Đồng bằng sông Hồng và đồng bằng sông Cửu Long", "Đồng bằng Tây Nguyên và Đông Bắc", "Đồng bằng Hoàng Liên Sơn và Trường Sơn", "Đồng bằng sông Đà và sông Mã"], answerIndex: 0 },
      { question: "Khi phân tích một vấn đề địa lý, cách làm nào phù hợp?", options: ["Xác định vị trí, đặc điểm và mối liên hệ giữa các yếu tố", "Nêu kết luận mà không xem xét vị trí", "Khái quát mọi vùng giống hệt nhau", "Chỉ kể tên địa danh"], answerIndex: 0 },
    ];
  } else if (topicId === "cProgramming" && /con trỏ|pointer/.test(topicText)) {
    questions = [
      { question: "Con trỏ trong C lưu trữ điều gì?", options: ["Địa chỉ của một đối tượng", "Tên của một hàm bất kỳ", "Luôn là một chuỗi ký tự", "Kích thước của ổ cứng"], answerIndex: 0 },
      { question: "Toán tử nào dùng để truy cập giá trị thông qua con trỏ?", options: ["*", "&", "%", "#"], answerIndex: 0 },
      { question: "Khi nào được phép giải tham chiếu một con trỏ?", options: ["Khi nó trỏ tới vùng nhớ hợp lệ", "Ngay cả khi chưa khởi tạo", "Sau khi vùng nhớ đã được giải phóng", "Khi giá trị con trỏ là bất kỳ"], answerIndex: 0 },
    ];
  } else if (topicId === "cProgramming" && /hàm/.test(topicText)) {
    questions = [
      { question: "Hàm trong C giúp ích chính yếu điều gì?", options: ["Chia chương trình thành các phần có nhiệm vụ rõ ràng", "Tự động kiểm tra mọi lỗi logic", "Thay thế hoàn toàn kiểu dữ liệu", "Cấp phát bộ nhớ mà không cần khai báo"], answerIndex: 0 },
      { question: "C truyền đối số vào hàm theo cách nào?", options: ["Theo giá trị", "Luôn theo tham chiếu", "Theo tên biến toàn cục", "Không truyền được đối số"], answerIndex: 0 },
      { question: "Muốn hàm thay đổi dữ liệu của bên gọi, thường làm gì?", options: ["Truyền địa chỉ thông qua con trỏ", "Chỉ đổi tên tham số", "Dùng printf", "Bỏ kiểu trả về"], answerIndex: 0 },
    ];
  } else if (topicId === "cProgramming" && /cấu trúc điều khiển|vòng lặp|rẽ nhánh/.test(topicText)) {
    questions = [
      { question: "Cấu trúc nào dùng để lựa chọn nhánh theo điều kiện?", options: ["if / else", "include", "sizeof", "typedef"], answerIndex: 0 },
      { question: "Vòng lặp do-while có đặc điểm nào?", options: ["Thân vòng lặp chạy ít nhất một lần", "Không bao giờ kiểm tra điều kiện", "Luôn chạy đúng hai lần", "Chỉ dùng được với mảng"], answerIndex: 0 },
      { question: "Cần làm gì để vòng lặp while không chạy vô hạn ngoài ý muốn?", options: ["Đảm bảo điều kiện dừng có thể đạt được", "Xóa mọi cập nhật biến", "Đặt điều kiện luôn đúng", "Thay while bằng #include"], answerIndex: 0 },
    ];
  } else if (topicId === "cProgramming" && /mảng|chuỗi/.test(topicText)) {
    questions = [
      { question: "Chỉ số của phần tử đầu tiên trong mảng C là bao nhiêu?", options: ["0", "1", "-1", "Tùy giá trị phần tử"], answerIndex: 0 },
      { question: "C có tự kiểm tra biên mảng khi truy cập không?", options: ["Không, chương trình phải tự bảo đảm chỉ số hợp lệ", "Có, luôn tự sửa mọi chỉ số sai", "Có, nhưng chỉ với mảng char", "Chỉ kiểm tra khi dùng printf"], answerIndex: 0 },
      { question: "Chuỗi kiểu C kết thúc bằng ký tự nào?", options: ["Ký tự null '\\0'", "Dấu cách", "Dấu phẩy", "Ký tự xuống dòng bắt buộc"], answerIndex: 0 },
    ];
  } else {
    questions = [
      { question: `Ý nào mô tả đúng nhất về ${topic}?`, options: ["Dựa vào khái niệm và dữ kiện trong tài liệu để giải thích", "Đoán theo từ ngữ nghe quen", "Bỏ qua điều kiện của câu hỏi", "Chọn kết luận không liên quan"], answerIndex: 0 },
      { question: `Khi vận dụng kiến thức về ${topic}, nên làm gì trước?`, options: ["Xác định dữ kiện và yêu cầu cần giải quyết", "Kết luận trước khi đọc đề", "Bỏ qua tài liệu", "Chỉ chọn đáp án dài nhất"], answerIndex: 0 },
      { question: `Cách nào giúp kiểm tra lập luận về ${topic}?`, options: ["Đối chiếu từng bước với dữ kiện và nguyên tắc", "Chỉ dựa vào cảm giác", "Bỏ qua trường hợp đặc biệt", "Lặp lại kết luận mà không giải thích"], answerIndex: 0 },
    ];
  }
  const phaseIndex = Math.max(0, ["foundation", "practice", "advanced"].indexOf(phase));
  const selected = questions[phaseIndex] || questions[0];
  const correctOption = selected.options[selected.answerIndex];
  const otherOptions = selected.options.filter((_option, index) => index !== selected.answerIndex);
  const correctIndex = (phaseIndex + (topicId === "antiUsWar" ? 1 : topicId === "geography" ? 2 : 3)) % selected.options.length;
  const options = [...otherOptions];
  options.splice(correctIndex, 0, correctOption);
  return {
    ...selected,
    options,
    answerIndex: correctIndex,
    explanation: topicId === "antiUsWar" && /điện biên phủ/.test(topicText)
      ? `Điện Biên Phủ là chiến dịch lớn trong kháng chiến chống Pháp, diễn ra từ 13/3 đến 7/5/1954. Pháp xây dựng tập đoàn cứ điểm ở lòng chảo để giữ Tây Bắc và buộc Việt Minh giao chiến theo cách họ kỳ vọng có lợi. Phía Việt Minh tổ chức bao vây, bảo đảm vận chuyển hậu cần qua địa hình núi rừng, đưa pháo vào trận địa và tiến công theo từng đợt. Giao tranh mở màn ở các cứ điểm phía bắc, tiếp diễn quanh các cao điểm phía đông, rồi bước vào tổng công kích từ 1/5 đến 7/5. Ngày 7/5, sở chỉ huy tập đoàn cứ điểm bị đánh chiếm. Thất bại của Pháp tại đây góp phần quyết định vào bối cảnh dẫn tới đàm phán và Hiệp định Genève tháng 7/1954.`
      : `Đáp án được xác định bằng cách đối chiếu câu hỏi với tài liệu về ${topic}. Hãy chú ý dữ kiện then chốt, điều kiện và mối liên hệ giữa các ý; đó là cơ sở để chọn phương án thay vì đoán.`,
    example: topicId === "antiUsWar" && /điện biên phủ/.test(topicText)
      ? "Ví dụ khi kể lại chiến dịch, hãy phân biệt ba lớp thông tin: mục tiêu phía Pháp (giữ tập đoàn cứ điểm và chủ động chọn nơi giao chiến), cách đánh của phía Việt Minh (bao vây, bảo đảm hậu cần, tiến công từng đợt), và kết quả ngày 7/5/1954 (sở chỉ huy bị đánh chiếm). Sau đó mới liên hệ kết quả này với sức ép đàm phán dẫn tới Hiệp định Genève tháng 7/1954."
      : `Ví dụ: khi gặp một câu hỏi mới về ${topic}, gạch dưới từ khóa, tìm dữ kiện liên quan trong tài liệu, loại phương án trái với dữ kiện rồi giải thích vì sao lựa chọn còn lại phù hợp.`,
  };
}

function isValidStudyAnswer(answer) {
  return answer
    && typeof answer.correct === "boolean"
    && typeof answer.feedback === "string" && answer.feedback.trim() && answer.feedback.length <= 1_000
    && typeof answer.whyWrong === "string" && answer.whyWrong.length <= 1_000
    && typeof answer.focus === "string" && answer.focus.length <= 500
    && typeof answer.hint === "string" && answer.hint.trim() && answer.hint.length <= 1_000
    && typeof answer.explanation === "string" && answer.explanation.length <= 2_000
    && typeof answer.example === "string" && answer.example.length <= 1_000;
}

function isValidStudySolution(solution) {
  const diagram = solution?.diagram;
  return solution
    && typeof solution.answer === "string" && solution.answer.trim() && solution.answer.length <= 2_000
    && typeof solution.explanation === "string" && solution.explanation.trim() && solution.explanation.length <= 2_000
    && diagram
    && typeof diagram.title === "string" && diagram.title.trim() && diagram.title.length <= 120
    && ["map", "flow", "timeline", "concept"].includes(diagram.type)
    && Array.isArray(diagram.nodes) && diagram.nodes.length >= 2 && diagram.nodes.length <= 6
    && diagram.nodes.every((node) => typeof node === "string" && node.trim() && node.length <= 100)
    && Number.isInteger(diagram.centerIndex)
    && diagram.centerIndex >= 0 && diagram.centerIndex < diagram.nodes.length
    && Array.isArray(diagram.edges) && diagram.edges.length >= 1 && diagram.edges.length <= 8
    && diagram.edges.every((edge) =>
      Number.isInteger(edge.from) && edge.from >= 0 && edge.from < diagram.nodes.length
      && Number.isInteger(edge.to) && edge.to >= 0 && edge.to < diagram.nodes.length
      && edge.from !== edge.to
      && typeof edge.label === "string" && edge.label.length <= 60
    );
}

function containsExpectedAnswer(text, expectedAnswer) {
  const expected = expectedAnswer.trim().toLocaleLowerCase("vi");
  if (!expected) return false;
  const normalizedText = text.toLocaleLowerCase("vi");
  if (expected.length >= 3) return normalizedText.includes(expected);
  const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, "u").test(normalizedText);
}

export function createQuizRouter({
  baseUrl = "http://localhost:11434",
  model = DEFAULT_OLLAMA_MODEL,
  geminiApiKeys = getGeminiApiKeys(),
  groqApiKeys = getGroqApiKeys(),
} = {}) {
  const router = express.Router();
  const ollama = createOllamaClient(baseUrl, model);
  const groqModel = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
  const quizApiKey = process.env.QUIZAPI_IO_KEY?.includes("paste-your-quizapi")
    ? undefined
    : process.env.QUIZAPI_IO_KEY;
  let quizApiCreationForbidden = false;

  async function generateStudyJson({ system, prompt, schema, isValid, numPredict }) {
    if (groqApiKeys.length) {
      try {
        const generated = await generateWithGroq({
          apiKeys: groqApiKeys,
          model: groqModel,
          system,
          prompt,
          maxTokens: numPredict,
        });
        if (isValid(generated)) return { content: generated, generator: `Groq/Qwen (${groqModel})` };
        throw new Error("Groq returned study content that did not match the required schema.");
      } catch (error) {
        console.error("Groq interactive study request failed:", error.message);
      }
    }

    const content = await ollama.chat(system, prompt, schema, numPredict);
    let generated;
    try {
      generated = JSON.parse(content);
    } catch {
      throw new Error("Ollama returned invalid interactive study JSON.");
    }
    if (!isValid(generated)) {
      throw new Error("Ollama returned interactive study content that did not match the required schema.");
    }
    return { content: generated, generator: `Ollama (${ollama.model})` };
  }

  router.get("/api/quiz-provider/status", async (_req, res) => {
    const ollamaStatus = await ollama.status();
    res.json({
      generator: "Groq/Qwen",
      fallbackGenerator: "Ollama",
      storage: "QuizAPI.io",
      geminiConfigured: geminiApiKeys.length > 0,
      geminiKeyCount: geminiApiKeys.length,
      groqConfigured: groqApiKeys.length > 0,
      groqKeyCount: groqApiKeys.length,
      quizApiConfigured: Boolean(quizApiKey),
      ollamaAvailable: ollamaStatus.available && ollamaStatus.modelInstalled,
      ollamaModel: ollama.model,
      cloudCreationForbidden: quizApiCreationForbidden,
      ready: Boolean(groqApiKeys.length > 0 || (ollamaStatus.available && ollamaStatus.modelInstalled)),
    });
  });

  router.get("/api/quiz-ai/status", async (_req, res) => {
    res.json(await ollama.status());
  });

  router.post("/api/study-roadmap/lesson", async (req, res) => {
    const { topicId, quizResults, stepIndex, focusTopic } = req.body || {};
    const selectedTopic = getQuizTopic(topicId);
    if (!selectedTopic) return res.status(400).json({ error: "Chủ đề lộ trình không hợp lệ." });
    const isDirectLesson = typeof focusTopic === "string"
      && studyFocusTopics[topicId]?.includes(focusTopic);
    if (focusTopic !== undefined && !isDirectLesson) {
      return res.status(400).json({ error: "Bài học đã chọn không hợp lệ." });
    }
    if (!Array.isArray(quizResults) || (!isDirectLesson && quizResults.length < 1) || quizResults.length > 20
      || quizResults.some((item) =>
        !item
        || typeof item.correct !== "boolean"
        || ["topic", "question", "selectedAnswer", "correctAnswer", "explanation"]
          .some((key) => typeof item[key] !== "string" || !item[key].trim() || item[key].length > 2_000)
      )) {
      return res.status(400).json({ error: "Dữ liệu kết quả bài Quiz không hợp lệ để tạo lộ trình." });
    }

    const stages = isDirectLesson
      ? ["foundation", "practice", "advanced"].map((phase) => ({ topic: focusTopic, phase }))
      : getStudyStages(quizResults);
    if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= stages.length) {
      return res.status(400).json({ error: "Bước lộ trình không hợp lệ hoặc đã hoàn thành." });
    }
    const stage = stages[stepIndex];
    const lesson = createStudyLesson({
      topic: stage.topic,
      material: selectedTopic.material,
      results: quizResults,
      stage,
    });
    if (isDirectLesson) {
      const subjectTitle = {
        antiUsWar: "Lịch sử",
        geography: "Địa lý",
        cProgramming: "Lập trình C",
      }[topicId];
      lesson.title = topicId === "cProgramming"
        ? `${subjectTitle}: Tìm hiểu về ${focusTopic}`
        : `${subjectTitle}: ${focusTopic}`;
    }
    return res.json({
      ...lesson,
      stepIndex,
      totalSteps: stages.length,
      phase: stage.phase,
      focusTopic: stage.topic,
      generator: "Lụa AI · mở bài tức thì",
    });
  });

  router.post("/api/study-roadmap/answer", async (req, res) => {
    const {
      topicId,
      focusTopic,
      phase,
      question,
      answer,
      reasoning = "",
      selectedOptionIndex,
      referenceAnswer = "",
      hintLevel,
      attemptNumber,
    } = req.body || {};
    const selectedTopic = getQuizTopic(topicId);
    if (!selectedTopic) return res.status(400).json({ error: "Chủ đề lộ trình không hợp lệ." });
    const isMultipleChoice = Number.isInteger(selectedOptionIndex);
    const isValidFocusTopic = typeof focusTopic === "string" && studyFocusTopics[topicId]?.includes(focusTopic);
    const studyQuiz = isMultipleChoice && isValidFocusTopic
      ? getStudyQuiz(topicId, focusTopic, phase)
      : undefined;
    if (!["foundation", "practice", "advanced"].includes(phase)
      || (isMultipleChoice
        ? !studyQuiz || question !== studyQuiz.question || selectedOptionIndex < 0 || selectedOptionIndex >= studyQuiz.options.length
        : typeof question !== "string" || !question.trim() || question.length > 4_000
          || typeof answer !== "string" || !answer.trim() || answer.length > 4_000)
      || typeof reasoning !== "string" || reasoning.length > 4_000
      || typeof referenceAnswer !== "string" || referenceAnswer.length > 2_000
      || !Number.isInteger(hintLevel) || hintLevel < 0 || hintLevel > 3
      || !Number.isInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > 3) {
      return res.status(400).json({ error: "Câu trả lời hoặc thông tin bài luyện tập không hợp lệ." });
    }

    try {
      if (isMultipleChoice && studyQuiz) {
        if (selectedOptionIndex === studyQuiz.answerIndex) {
          return res.json({
            correct: true,
            feedback: "Chính xác! Bạn đã xác định đúng ý trọng tâm.",
            focus: "Hãy nối mục tiêu, diễn biến và kết quả để nhớ chắc kiến thức.",
            explanation: studyQuiz.explanation,
            example: studyQuiz.example,
            generator: "Lụa AI · giải thích theo tài liệu",
          });
        }

        if (attemptNumber === 3) {
          return res.json({
            correct: false,
            feedback: "Bạn đã thử ba lần. Mình đưa lời giải mẫu để bạn đối chiếu cách suy luận nhé.",
            hint: "Sau khi xem lời giải, hãy tự nói lại vì sao phương án đúng phù hợp với dữ kiện.",
            solution: {
              answer: studyQuiz.options[studyQuiz.answerIndex],
              explanation: studyQuiz.explanation,
              example: studyQuiz.example,
            },
            generator: "Lụa AI · lời giải theo tài liệu",
          });
        }

        const selectedAnswer = studyQuiz.options[selectedOptionIndex];
        const correctAnswer = studyQuiz.options[studyQuiz.answerIndex];
        const generated = await generateStudyJson({
          system: "Bạn là gia sư kiên nhẫn. Người học vừa chọn SAI. Bắt buộc chỉ rõ vì sao chính lựa chọn của người học sai: họ đang nhầm sự kiện, mốc thời gian, khái niệm hay quy tắc nào; không được trả lời chung chung kiểu 'hãy đọc kỹ đề'. Dùng tài liệu và đáp án tham chiếu để chẩn đoán chính xác, nhưng tuyệt đối không nêu hoặc chép đáp án đúng, không nói chữ cái đáp án đúng và không tiết lộ kết luận để người học còn cơ hội tự sửa. Trả JSON tiếng Việt gồm feedback (động viên ngắn), whyWrong (chẩn đoán cụ thể dựa trên lựa chọn sai), focus (kiến thức cần ôn), hint (một gợi ý giúp tự sửa, chưa lộ đáp án).",
          prompt: `Lần thử ${attemptNumber}/3 trong chặng "${phase}". Hãy đối chiếu tài liệu và đáp án tham chiếu để xác định chính xác lỗi trong lựa chọn sai. Không tiết lộ đáp án tham chiếu trong bất kỳ trường nào.\n\n<TAI_LIEU>\n${selectedTopic.material}\n</TAI_LIEU>\n\nCâu hỏi: ${studyQuiz.question}\nLựa chọn sai của người học: ${selectedAnswer}\nĐáp án tham chiếu chỉ để bạn chẩn đoán lỗi, KHÔNG ĐƯỢC NÊU LẠI: ${correctAnswer}\nCách suy luận người học tự ghi/nói (nếu có): ${reasoning.trim() || "(không có)"}\n\nwhyWrong phải nêu cụ thể lựa chọn sai đang nhầm điều gì và vì sao không khớp câu hỏi, dựa trên tài liệu. Không đưa ra đáp án đúng dưới dạng diễn đạt lại.`,
          schema: studyWrongAnswerSchema,
          isValid: (value) => value
            && typeof value.feedback === "string" && value.feedback.trim() && value.feedback.length <= 1_000
            && typeof value.whyWrong === "string" && value.whyWrong.trim() && value.whyWrong.length <= 1_000
            && typeof value.focus === "string" && value.focus.trim() && value.focus.length <= 300
            && typeof value.hint === "string" && value.hint.trim() && value.hint.length <= 1_000,
          numPredict: 900,
        });
        const leaksCorrectOption = [generated.content.feedback, generated.content.whyWrong, generated.content.focus, generated.content.hint]
          .some((text) => containsExpectedAnswer(text, studyQuiz.options[studyQuiz.answerIndex]));
        if (leaksCorrectOption) {
          console.error("Interactive study quiz feedback included the correct option; replacing it with a non-revealing hint.");
        }
        return res.json({
          correct: false,
          feedback: leaksCorrectOption
            ? "Mình thấy bạn đang nhầm dữ kiện của câu hỏi với một ý khác trong bài."
            : generated.content.feedback,
          whyWrong: leaksCorrectOption
            ? `Lựa chọn "${selectedAnswer}" không khớp với yêu cầu của câu hỏi; hãy xác định câu đang hỏi về mốc thời gian, nguyên nhân hay kết quả.`
            : generated.content.whyWrong,
          focus: leaksCorrectOption
            ? "Phân biệt mốc thời gian, diễn biến và kết quả của sự kiện."
            : generated.content.focus,
          hint: leaksCorrectOption
            ? "Gạch chân từ khóa trong câu hỏi, tìm dữ kiện tương ứng trong phần lý thuyết rồi thử lại."
            : generated.content.hint,
          generator: generated.generator,
        });
      }

      const generated = await generateStudyJson({
        system: "Bạn là gia sư Lụa, trò chuyện tự nhiên và đánh giá câu trả lời dựa trên tài liệu. Đánh giá nội dung, không đòi hỏi cách diễn đạt y hệt. Khi câu trả lời sai hoặc thiếu, chỉ rõ cụ thể ý nào sai/thiếu, giải thích vì sao dựa trên tài liệu, nêu kiến thức cần tập trung và gợi ý để học sinh tự suy luận tiếp; tuyệt đối chưa tiết lộ đáp án mẫu. Khi đúng, xác nhận và đưa giải thích chi tiết cùng ví dụ cụ thể. Trả đúng JSON tiếng Việt gồm correct, feedback, whyWrong, focus, hint, explanation, example.",
        prompt: `Đánh giá câu trả lời tự luận của học sinh trong chặng "${phase}". Mức gợi ý hiện tại là ${hintLevel} trên 3. Nếu chưa đúng, không lặp lại/diễn đạt lại đáp án tham chiếu và không tiết lộ kết luận. whyWrong phải chỉ rõ chính xác phần sai hoặc còn thiếu trong câu trả lời, không nhận xét chung chung. focus nêu kiến thức cần ôn. hint hướng dẫn cách suy luận tiếp. Nếu đúng, explanation trình bày đầy đủ kiến thức cần học và example đưa ví dụ cụ thể gắn với câu hỏi.

<TAI_LIEU>
${selectedTopic.material}
</TAI_LIEU>

Câu hỏi: ${question.trim()}
Đáp án tham chiếu (chỉ dùng để chấm, tuyệt đối không tiết lộ khi sai): ${referenceAnswer || "(không có)"}
Câu trả lời của học sinh: ${answer.trim()}

Chỉ trả JSON đúng schema: {"correct":true,"feedback":"...","whyWrong":"...","focus":"...","hint":"...","explanation":"...","example":"..."}.`,
        schema: studyAnswerSchema,
        isValid: isValidStudyAnswer,
        numPredict: 700,
      });
      let result = generated.content;
      if (!result.correct && referenceAnswer
        && (containsExpectedAnswer(result.feedback, referenceAnswer)
          || containsExpectedAnswer(result.whyWrong, referenceAnswer)
          || containsExpectedAnswer(result.focus, referenceAnswer)
          || containsExpectedAnswer(result.hint, referenceAnswer))) {
        console.error("Interactive study tutor output included the reference answer; replacing it with non-revealing feedback.");
        result = {
          correct: false,
          feedback: "Chưa đúng hoàn toàn, nhưng mình thấy bạn đang cố gắng suy luận. Mình sẽ không bật mí đáp án.",
          whyWrong: "Câu trả lời còn nhầm hoặc thiếu một ý quan trọng; hãy đối chiếu lại từng ý trong câu hỏi với phần lý thuyết.",
          focus: focusTopic || "Xác định lại khái niệm trọng tâm trong câu hỏi.",
          hint: "Quay lại phần lý thuyết phía trên, tìm quy tắc liên quan rồi áp dụng từng bước bằng lời của bạn.",
          explanation: "",
          example: "",
        };
      }
      if (!result.correct && attemptNumber === 3) {
        const solution = await generateStudyJson({
          system: "Bạn là gia sư cần đưa lời giải mẫu sau khi người học đã thử sai nhiều lần. Dựa sát tài liệu, trả lời trực tiếp câu hỏi và giải thích ngắn gọn từng ý để người học hiểu bản chất. Đồng thời tạo một sơ đồ SVG-friendly với 2-6 nút và các mũi tên có nhãn, chọn cấu trúc đúng với câu hỏi: bản đồ các hướng/địa điểm khi tài liệu nêu rõ địa điểm; timeline cho diễn biến lịch sử; flow cho luồng hoạt động của chương trình/thuật toán; concept cho quan hệ khái niệm. Không tự bịa hướng tấn công, địa điểm, mốc thời gian hoặc quan hệ nhân quả không có trong tài liệu. Nếu thiếu dữ kiện để vẽ bản đồ, chọn timeline hoặc sơ đồ quan hệ có căn cứ. Các chỉ số from/to và centerIndex bắt đầu từ 0. Trả đúng JSON có dạng {\"answer\":\"...\",\"explanation\":\"...\",\"diagram\":{\"title\":\"...\",\"type\":\"map|flow|timeline|concept\",\"centerIndex\":0,\"nodes\":[\"...\"],\"edges\":[{\"from\":0,\"to\":1,\"label\":\"...\"}]}}.",
          prompt: `Đưa lời giải mẫu cho câu hỏi sau sau khi người học đã thử sai ${attemptNumber} lần. Câu trả lời cần trực tiếp giải quyết đúng yêu cầu, kèm giải thích dễ hiểu. Sơ đồ phải minh họa trực tiếp câu hỏi và lời giải, không dùng sơ đồ chung kiểu Dữ kiện → Suy luận → Kết quả.

<TAI_LIEU>
${selectedTopic.material}
</TAI_LIEU>

Câu hỏi: ${question.trim()}
Câu trả lời đúng tham khảo từ bài Quiz (nếu liên quan): ${referenceAnswer || "(không có)"}
Câu trả lời gần nhất của người học: ${answer.trim()}

Chọn loại sơ đồ phù hợp nhất với chính câu hỏi. Ví dụ: nếu hỏi phong trào/chiến dịch, thể hiện các địa điểm và hướng liên hệ/tiến công chỉ khi tài liệu xác nhận rõ; nếu hỏi chương trình C, thể hiện luồng điều khiển hoặc dữ liệu giữa các bước cụ thể; nếu hỏi diễn biến thì thể hiện đúng thứ tự thời gian. Nhãn nút ngắn, mũi tên có nhãn giải thích quan hệ. Mọi chi tiết phải có căn cứ trong tài liệu và câu hỏi.`,
          schema: studySolutionSchema,
          isValid: isValidStudySolution,
          numPredict: 900,
        });
        return res.json({
          ...result,
          solution: solution.content,
          generator: `${generated.generator}; lời giải từ ${solution.generator}`,
        });
      }
      return res.json({
        ...result,
        focus: result.focus || focusTopic || "Nắm chắc ý chính và liên hệ với câu hỏi.",
        generator: generated.generator,
      });
    } catch (error) {
      if (error.code || error.status) return ollamaErrorResponse(res, error, ollama.model);
      console.error("Interactive study answer review failed:", error.message);
      return res.status(502).json({ error: "AI chưa thể kiểm tra câu trả lời. Hãy thử lại." });
    }
  });

  router.get("/api/quiz-topics", (_req, res) => {
    res.json({
      topics: Object.values(quizTopics).map(({ id, title, period, description }) => ({
        id,
        title,
        period,
        description,
      })),
    });
  });

  router.post("/api/generate-quiz", async (req, res) => {
    const { documentText, topicId, numQuestions } = req.body || {};
    const selectedTopic = getQuizTopic(topicId);
    const sourceText = selectedTopic?.material ?? documentText;
    if (topicId !== undefined && !selectedTopic) {
      return res.status(400).json({ error: "Chủ đề quiz không hợp lệ." });
    }
    if (typeof sourceText !== "string" || !sourceText.trim()) {
      return res.status(400).json({ error: "Nội dung tài liệu đầu vào không được để trống." });
    }
    if (sourceText.length > 100_000) {
      return res.status(413).json({ error: "Tài liệu quá dài. Hãy rút gọn nội dung còn tối đa 100.000 ký tự." });
    }

    const count = numQuestions === undefined ? 5 : Number(numQuestions);
    if (!Number.isInteger(count) || count < 1 || count > 20) {
      return res.status(400).json({ error: "Số câu hỏi phải là số nguyên từ 1 đến 20." });
    }

    let quiz;
    let generator;
    let generationWarning;
    if (groqApiKeys.length > 0) {
      let validationErrors = [];
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const generated = await generateWithGroq({
            apiKeys: groqApiKeys,
            model: groqModel,
            system: "Bạn là Quiz AI, chuyên tạo câu hỏi trắc nghiệm giáo dục bằng tiếng Việt. Chỉ kiểm tra dữ kiện được nêu rõ trong tài liệu; không bịa kiến thức. Mỗi câu có đúng 4 phương án khác nhau và chỉ một đáp án đúng; đáp án khớp chính xác một phương án, lời giải thích căn cứ tài liệu. Chỉ trả JSON object, không markdown.",
            prompt: `Tạo CHÍNH XÁC ${count} câu hỏi trắc nghiệm tiếng Việt chỉ dựa trên tài liệu. Trả về JSON dạng {"quiz":[{"question":"...","topic":"...","options":["A","B","C","D"],"answer":"A","explanation":"..."}]}. Không lặp câu hỏi.${validationErrors.length ? ` Sửa các lỗi trước: ${validationErrors.join("; ")}.` : ""}\n\n<TAI_LIEU ${selectedTopic ? `CHU_DE="${selectedTopic.title}"` : ""}>\n${sourceText.trim()}\n</TAI_LIEU>`,
            maxTokens: Math.min(4_096, 400 + count * 350),
          });
          quiz = generated?.quiz;
          validationErrors = getQuizValidationErrors(quiz, count);
          if (!validationErrors.length) {
            generator = `Groq/Qwen (${groqModel})`;
            break;
          }
        } catch (error) {
          console.error("Groq quiz generation failed:", error.message);
          generationWarning = error.status === 401
            ? "Groq từ chối API key (HTTP 401)."
            : error.status === 429
              ? "Groq đang giới hạn lượt gọi (HTTP 429)."
              : "Groq tạm thời không tạo được câu hỏi.";
          break;
        }
      }
      if (!quiz || validationErrors.length) {
        generationWarning ||= `Groq trả câu hỏi không hợp lệ: ${validationErrors.join("; ")}.`;
        quiz = undefined;
      }
    } else {
      generationWarning = "GROQ_API_KEY chưa được cấu hình.";
    }

    if (!quiz) {
      try {
        quiz = await generateQuizWithOllama(ollama, count, sourceText, selectedTopic);
        generator = `Ollama (${ollama.model})`;
      } catch (error) {
        console.error("Ollama quiz fallback failed:", error.message);
        if (error.code || error.status) {
          return ollamaErrorResponse(res, error, ollama.model);
        }
        return res.status(502).json({
          error: `${generationWarning || "Groq không tạo được câu hỏi."} Ollama dự phòng cũng không tạo được bộ câu hỏi hợp lệ.`,
        });
      }
    }

    let storage = "local";
    let storageWarning = !quizApiKey
      ? "Quiz chỉ được lưu trong phiên làm bài hiện tại; chưa cấu hình QuizAPI.io để lưu lên cloud."
      : quizApiCreationForbidden
        ? "QuizAPI.io từ chối quyền tạo Quiz trên gói hiện tại; đề vẫn dùng được nhưng chưa lưu lên cloud."
        : "";
    let quizId;
    if (quizApiKey && !quizApiCreationForbidden) {
      try {
        const quizApiResult = await createQuizOnQuizApi({
          apiKey: quizApiKey,
          title: selectedTopic?.title || "Quiz tạo từ tài liệu",
          description: `Bộ ${count} câu hỏi trắc nghiệm được tạo từ tài liệu học tập.`,
          category: "Vietnamese History",
          tags: ["vietnam-history", ...(selectedTopic ? [selectedTopic.id] : [])],
          quiz,
        });
        storage = "QuizAPI.io";
        quizId = quizApiResult.quizId;
      } catch (error) {
        if (!(error instanceof QuizApiError)) {
          console.error("QuizAPI.io request failed:", error.message);
          storageWarning = "QuizAPI.io gặp lỗi khi lưu; đề vẫn dùng được trong phiên làm bài hiện tại nhưng chưa lưu lên cloud.";
        } else {
          console.error("QuizAPI.io request failed:", { status: error.status, code: error.code });
          if (error.status === 403 && !error.quizId) quizApiCreationForbidden = true;
          storageWarning = error.status === 403
            ? "QuizAPI.io không cho phép tạo Quiz với gói hiện tại; đề vẫn dùng được nhưng chỉ trong phiên làm bài này."
            : error.status === 401
              ? "QuizAPI.io từ chối API key; đề vẫn dùng được nhưng chưa lưu lên cloud."
              : error.status === 429
                ? "QuizAPI.io đang giới hạn lượt gọi; đề vẫn dùng được nhưng chưa lưu lên cloud."
                : error.code === "QUIZ_API_TIMEOUT" || error.code === "QUIZ_API_UNAVAILABLE"
                  ? "QuizAPI.io tạm thời không kết nối được; đề vẫn dùng được nhưng chưa lưu lên cloud."
                  : "QuizAPI.io không lưu đủ câu hỏi; đề vẫn dùng được trong phiên hiện tại nhưng chưa lưu hoàn chỉnh lên cloud.";
          if (error.quizId) storageWarning += ` Quiz nháp ${error.quizId} đã được tạo nhưng chưa nhập đủ câu hỏi.`;
        }
      }
    }

    return res.json({
        success: true,
        generator,
        storage,
        ...(quizId ? { quizId } : {}),
        ...(generationWarning ? { generationWarning } : {}),
        ...(storageWarning ? { storageWarning } : {}),
        total_questions: quiz.length,
        topic: selectedTopic ? { id: selectedTopic.id, title: selectedTopic.title, period: selectedTopic.period } : null,
        studyMaterial: selectedTopic?.material,
        quiz,
      });
  });

  router.post("/api/analyze-quiz-result", async (req, res) => {
    const { documentText, topicId, totalQuestions, correctAnswers, incorrectAnswers } = req.body || {};
    const selectedTopic = getQuizTopic(topicId);
    const sourceText = selectedTopic?.material ?? documentText;
    if (topicId !== undefined && !selectedTopic) {
      return res.status(400).json({ error: "Chủ đề quiz không hợp lệ." });
    }
    if (typeof sourceText !== "string" || !sourceText.trim() || sourceText.length > 100_000) {
      return res.status(400).json({ error: "Tài liệu phân tích không hợp lệ hoặc vượt quá 100.000 ký tự." });
    }
    if (!Number.isInteger(totalQuestions) || totalQuestions < 1 || totalQuestions > 20
      || !Number.isInteger(correctAnswers) || correctAnswers < 0 || correctAnswers > totalQuestions
      || !Array.isArray(incorrectAnswers) || incorrectAnswers.length !== totalQuestions - correctAnswers) {
      return res.status(400).json({ error: "Kết quả bài làm không hợp lệ." });
    }
    if (incorrectAnswers.some((item) =>
      !item
      || ["question", "topic", "selectedAnswer", "correctAnswer", "explanation"]
        .some((key) => typeof item[key] !== "string" || item[key].length > 2_000)
    )) {
      return res.status(400).json({ error: "Thông tin câu trả lời sai không hợp lệ." });
    }

    let geminiAnalysisFailure;
    if (geminiApiKeys.length > 0) {
      const prompt = `Phân tích bài kiểm tra${selectedTopic ? ` về chủ đề "${selectedTopic.title}"` : ""} dựa trên tài liệu và câu trả lời sai. Người học trả lời đúng ${correctAnswers}/${totalQuestions} câu. Không suy diễn kiến thức ngoài tài liệu. Với mỗi điểm yếu, nêu chủ đề, lý do dựa trên câu sai và phần kiến thức cụ thể cần ôn. Tạo lộ trình học tuần tự, ngắn gọn, có hoạt động thực hành. Nếu người học không sai câu nào, ghi nhận điểm mạnh, để weaknesses rỗng và đưa ra lộ trình củng cố/nâng cao phù hợp. Chỉ trả JSON đúng cấu trúc: {"summary":"...","weaknesses":[{"topic":"...","reason":"...","knowledgeToReview":"..."}],"studyPlan":[{"step":1,"title":"...","activity":"..."}],"practiceTips":["..."]}.\n\n<TAI_LIEU>\n${sourceText.trim()}\n</TAI_LIEU>\n\n<CAU_TRA_LOI_SAI>\n${JSON.stringify(incorrectAnswers)}\n</CAU_TRA_LOI_SAI>`;
      try {
        const { response } = await fetchWithGeminiKeyFallback({
          apiKeys: geminiApiKeys,
          url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{
                  text: "Bạn là trợ lý giáo dục, đánh giá thân thiện và khích lệ, không phán xét. Chỉ căn cứ tài liệu, chủ đề, kết quả bài làm; không bịa kiến thức. Tạo lộ trình thực tế phù hợp với lỗi sai.",
                }],
              },
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: "application/json", maxOutputTokens: 2_500 },
            }),
          },
        });
        const data = await response.json();
        if (!response.ok) {
          console.error("Gemini quiz analysis failed", { status: response.status });
          geminiAnalysisFailure = response.status === 401 || response.status === 403
            ? `Gemini từ chối API key (HTTP ${response.status}).`
            : response.status === 429
              ? "Gemini đang giới hạn lượt gọi (HTTP 429)."
              : `Gemini không gọi được (HTTP ${response.status}).`;
        } else {
          const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
          let analysis;
          try {
            analysis = JSON.parse(content);
          } catch {
            const finishReason = data.candidates?.[0]?.finishReason || "không rõ nguyên nhân";
            console.error("Gemini returned invalid quiz analysis JSON:", finishReason);
            geminiAnalysisFailure = `Gemini không tạo được phần đánh giá hợp lệ (${finishReason}).`;
          }
          if (analysis && !isValidAnalysis(analysis)) {
            console.error("Gemini returned quiz analysis that did not match the required schema.");
            geminiAnalysisFailure = "Gemini trả phần đánh giá không đúng cấu trúc.";
          }
          if (analysis && isValidAnalysis(analysis)) {
            analysis = adaptPerfectScoreAnalysis(analysis, correctAnswers, totalQuestions, selectedTopic?.title);
            let verification;
            try {
              verification = await reviewWithGroq({
                apiKeys: groqApiKeys,
                model: groqModel,
                task: "Rà soát phần đánh giá bài làm và lộ trình học: kiểm tra tính nhất quán với số câu đúng/sai, tài liệu, độ phù hợp và tính khả thi của lộ trình.",
                question: `Kết quả: ${correctAnswers}/${totalQuestions}. Câu trả lời sai: ${JSON.stringify(incorrectAnswers)}`,
                answer: JSON.stringify(analysis),
                context: sourceText,
              });
            } catch (error) {
              console.error("Groq quiz-analysis review failed:", error.message);
              verification = { status: "unavailable", model: groqModel, issues: [] };
            }
            return res.json({ success: true, analysis, verification, generator: "Gemini" });
          }
        }
      } catch (error) {
        console.error("Gemini quiz analysis request failed:", error.message);
        geminiAnalysisFailure = error.name === "TimeoutError"
          ? "Gemini hết thời gian chờ."
          : "Không kết nối được Gemini.";
      }
    }

    try {
      let analysis;
      try {
        const content = await ollama.chat(
          "Bạn là Quiz AI, chuyên gia đánh giá kết quả học tập. Đánh giá thân thiện, cụ thể và khích lệ; không phán xét người học. Chỉ dựa trên tài liệu, chủ đề và câu trả lời được cung cấp. Lộ trình phải thực tế, theo thứ tự từ củng cố nền tảng đến luyện tập. Trả về đúng JSON theo schema yêu cầu, không dùng markdown.",
          `Phân tích bài kiểm tra${selectedTopic ? ` về chủ đề "${selectedTopic.title}"` : ""} dựa trên tài liệu và các câu trả lời sai sau đây. Người học trả lời đúng ${correctAnswers}/${totalQuestions} câu. Không suy diễn kiến thức ngoài tài liệu. Với mỗi điểm yếu, nêu chủ đề, lý do dựa trên câu sai và phần kiến thức cụ thể cần ôn. Tạo lộ trình học tuần tự, ngắn gọn, có hoạt động thực hành. Nếu người học không sai câu nào, ghi nhận điểm mạnh, để weaknesses rỗng và đưa ra lộ trình củng cố/nâng cao phù hợp.\n\n<TAI_LIEU>\n${sourceText.trim()}\n</TAI_LIEU>\n\n<CAU_TRA_LOI_SAI>\n${JSON.stringify(incorrectAnswers)}\n</CAU_TRA_LOI_SAI>`,
          analysisSchema,
        );
        analysis = JSON.parse(content);
      } catch (error) {
        if (error.code || error.status) return ollamaErrorResponse(res, error, ollama.model);
        console.error("Ollama returned invalid quiz analysis JSON.");
        return res.status(502).json({ error: "AI trả về phần đánh giá không đúng định dạng. Hãy thử lại." });
      }

      if (!isValidAnalysis(analysis)) {
        console.error("Ollama returned quiz analysis that did not match the required schema.");
        return res.status(502).json({ error: "Phần đánh giá chưa đúng cấu trúc yêu cầu. Hãy thử lại." });
      }
      analysis = adaptPerfectScoreAnalysis(analysis, correctAnswers, totalQuestions, selectedTopic?.title);

      let verification;
      try {
        verification = await reviewWithGroq({
          apiKeys: groqApiKeys,
          model: groqModel,
          task: "Rà soát phần đánh giá bài làm và lộ trình học: kiểm tra tính nhất quán với số câu đúng/sai, tài liệu, độ phù hợp và tính khả thi của lộ trình.",
          question: `Kết quả: ${correctAnswers}/${totalQuestions}. Câu trả lời sai: ${JSON.stringify(incorrectAnswers)}`,
          answer: JSON.stringify(analysis),
          context: sourceText,
        });
      } catch (error) {
        console.error("Groq quiz-analysis review failed:", error.message);
        verification = { status: "unavailable", model: groqModel, issues: [] };
      }
      return res.json({
        success: true,
        analysis,
        verification,
        generator: "Ollama",
        ...(geminiAnalysisFailure ? { fallbackReason: geminiAnalysisFailure } : {}),
      });
    } catch (error) {
      return ollamaErrorResponse(res, error, ollama.model);
    }
  });

  return router;
}
