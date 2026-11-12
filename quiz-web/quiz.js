import express from "express";
import { generateWithGroq } from "../ai-review.js";
import { createQuizOnQuizApi, QuizApiError } from "../quiz-api.js";
import { fetchWithGeminiKeyFallback, getGeminiApiKeys } from "../gemini-api.js";
import { getGroqApiKeys } from "../groq-api.js";
import { questionBanks } from "../mini-game/game.js";

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
const studyClarificationSchema = {
  type: "object",
  properties: {
    inScope: { type: "boolean" },
    answer: { type: "string" },
  },
  required: ["inScope", "answer"],
};

const quizTopics = {
  antiUsWar: {
    id: "antiUsWar",
    title: "Kháng chiến chống Mỹ, 1954–1975",
    period: "1954–1975",
    description: "Ôn các mốc chính từ sau Hiệp định Genève đến khi chiến tranh kết thúc năm 1975.",
    material: `Chủ đề: Kháng chiến chống Mỹ và chiến tranh Việt Nam, giai đoạn 1954–1975.

Sau Hiệp định Genève năm 1954, Việt Nam tạm thời chia thành hai vùng tập kết quân sự ở hai phía vĩ tuyến 17; đây không được quy định là biên giới quốc gia vĩnh viễn. Hiệp định dự kiến tổng tuyển cử để thống nhất Việt Nam, nhưng cuộc tổng tuyển cử đó không diễn ra như dự kiến. Tình hình chính trị và quân sự ở hai miền ngày càng đối đầu.

Trước Hiệp định Genève, Chiến dịch Điện Biên Phủ diễn ra từ ngày 13/3 đến ngày 7/5/1954 trong kháng chiến chống Pháp. Pháp muốn dùng cứ điểm ở Tây Bắc để gây sức ép lên các tuyến tiếp tế sang Lào và dụ Việt Minh vào một trận đánh quy mô lớn mà Pháp tin rằng ưu thế hỏa lực, không vận sẽ giúp họ thắng. Pháp đưa hơn 15.000 quân vào khu vực, bố trí các cứ điểm quanh sân bay; theo History.com, lực lượng Việt Minh có gần 50.000 quân. Các con số này là ước tính của nguồn được dẫn, không phải số kiểm kê tuyệt đối.

Tại Điện Biên Phủ, phía Việt Minh bao vây lòng chảo, đào chiến hào áp sát các cứ điểm và đưa pháo lên những vị trí trên sườn núi. Việc vận chuyển pháo, đạn và lương thực qua địa hình khó khăn giúp duy trì vòng vây và làm suy yếu khả năng tiếp tế bằng đường không của Pháp. Ngày 13/3, pháo binh mở màn đánh các cứ điểm vòng ngoài phía bắc; ngày hôm sau, sân bay bị vô hiệu hóa và một cứ điểm khác bị chiếm. Từ cuối tháng 3, giao tranh tập trung vào các cứ điểm và cao điểm phía đông. Đến ngày 22/4, phần lớn đường băng đã bị Việt Minh kiểm soát, khiến việc thả tiếp tế ngày càng khó khăn. Đợt tổng công kích cuối bắt đầu ngày 1/5; ngày 7/5/1954, sở chỉ huy tập đoàn cứ điểm bị đánh chiếm.

Tại Điện Biên Phủ, kết quả trực tiếp là tập đoàn cứ điểm Pháp thất thủ và chiến dịch kết thúc. Chiến thắng góp phần tạo sức ép lớn tại Hội nghị Genève, nhưng không phải nguyên nhân duy nhất dẫn tới hiệp định. History.com ghi nhận máy bay Pháp mất 62 chiếc và 167 chiếc khác bị hư hại trong trận đánh; nguồn này không cung cấp một bảng số liệu thương vong con người đầy đủ, thống nhất cho cả hai phía. Vì vậy bài học không tự nêu số người chết/bị thương hoặc giờ chính xác nếu chưa có nguồn kiểm chứng đáng tin cậy.

Nguồn tham khảo cho các số liệu và diễn biến nêu trên: History.com, “Battle of Dien Bien Phu” (https://www.history.com/articles/battle-of-dien-bien-phu).

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
    description: "Ôn cấu trúc chương trình, thư viện chuẩn, kiểu dữ liệu, hàm, mảng, con trỏ, struct, bộ nhớ động và thao tác tệp.",
    material: `Chủ đề: Lập trình C cơ bản đến trung cấp (theo các chuẩn C11/C17).

Chương trình C thường bắt đầu từ hàm main. Mỗi câu lệnh thường kết thúc bằng dấu chấm phẩy; khối lệnh được đặt trong cặp ngoặc nhọn. Các thư viện chuẩn được khai báo bằng chỉ thị #include, chẳng hạn stdio.h cho nhập xuất cơ bản, string.h cho thao tác chuỗi và stdlib.h cho một số hàm tiện ích.

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
  antiUsWar: ["Phong trào Đồng Khởi", "Hiệp định Genève", "Chiến dịch Điện Biên Phủ", "Tết Mậu Thân", "Hiệp định Paris", "Kết thúc chiến tranh"],
  geography: ["Địa lý tự nhiên", "Địa lý dân cư", "Khí hậu"],
  cProgramming: ["Cấu trúc chương trình C", "Thư viện chuẩn", "Biến & Kiểu dữ liệu", "Cấu trúc điều khiển", "Hàm", "Mảng & Chuỗi", "Con trỏ", "Struct", "Bộ nhớ động", "Tệp"],
};

function bankQuestion(topic, question, answer, distractors, explanation) {
  return {
    question,
    topic,
    options: [answer, ...distractors],
    answer,
    explanation,
  };
}

const supplementalQuizQuestions = {
  antiUsWar: [
    bankQuestion("Hiệp định Genève", "Sau Hiệp định Genève năm 1954, hai vùng tập kết quân sự được phân định gần vĩ tuyến nào?", "Vĩ tuyến 17", ["Vĩ tuyến 13", "Vĩ tuyến 20", "Vĩ tuyến 25"], "Giới tuyến quân sự tạm thời nằm gần vĩ tuyến 17."),
    bankQuestion("Hiệp định Genève", "Giới tuyến quân sự sau Hiệp định Genève được xác định là gì?", "Ranh giới tập kết quân sự tạm thời", ["Biên giới quốc gia vĩnh viễn", "Biên giới giữa Việt Nam và Lào", "Đường phân chia khí hậu"], "Giới tuyến không được quy định là biên giới quốc gia vĩnh viễn."),
    bankQuestion("Hiệp định Genève", "Hiệp định Genève dự kiến tổ chức tổng tuyển cử nhằm mục đích gì?", "Thống nhất Việt Nam", ["Thành lập ASEAN", "Chọn thủ đô mới", "Bầu chính quyền cho toàn Đông Dương"], "Tổng tuyển cử được dự kiến để thống nhất Việt Nam."),
    bankQuestion("Hiệp định Genève", "Điều gì đã xảy ra với cuộc tổng tuyển cử thống nhất dự kiến sau Hiệp định Genève?", "Không diễn ra như dự kiến", ["Diễn ra đúng kế hoạch năm 1954", "Diễn ra ngay sau Hiệp định Paris", "Được tổ chức vào năm 1976"], "Cuộc tổng tuyển cử dự kiến đã không diễn ra như kế hoạch."),
    bankQuestion("Chiến dịch Điện Biên Phủ", "Chiến dịch Điện Biên Phủ năm 1954 diễn ra trong cuộc kháng chiến nào?", "Kháng chiến chống Pháp", ["Kháng chiến chống Mỹ", "Khởi nghĩa Lam Sơn", "Phong trào Cần Vương"], "Điện Biên Phủ là chiến dịch trong kháng chiến chống Pháp."),
    bankQuestion("Chiến dịch Điện Biên Phủ", "Chiến dịch Điện Biên Phủ bắt đầu vào ngày nào?", "13/3/1954", ["7/5/1954", "27/1/1973", "30/4/1975"], "Pháo binh mở màn chiến dịch ngày 13/3/1954."),
    bankQuestion("Chiến dịch Điện Biên Phủ", "Đợt tổng công kích cuối tại Điện Biên Phủ bắt đầu ngày nào?", "1/5/1954", ["13/3/1954", "22/4/1954", "7/5/1954"], "Đợt tổng công kích cuối bắt đầu ngày 1/5."),
    bankQuestion("Chiến dịch Điện Biên Phủ", "Sự kiện nào diễn ra tại Điện Biên Phủ ngày 7/5/1954?", "Sở chỉ huy tập đoàn cứ điểm bị đánh chiếm", ["Hiệp định Paris được ký", "Quân đội Hoa Kỳ đổ bộ Đà Nẵng", "Phong trào Đồng Khởi bắt đầu"], "Sở chỉ huy bị đánh chiếm, chiến dịch kết thúc."),
    bankQuestion("Chiến dịch Điện Biên Phủ", "Một mục tiêu của Pháp khi xây dựng tập đoàn cứ điểm Điện Biên Phủ là gì?", "Dụ Việt Minh vào trận đánh lớn theo cách Pháp tin là có lợi", ["Tổ chức tổng tuyển cử thống nhất Việt Nam", "Mở đường biển từ Hà Nội vào Sài Gòn", "Chuẩn bị ký Hiệp định Paris"], "Pháp tin ưu thế hỏa lực và không vận sẽ giúp họ thắng."),
    bankQuestion("Chiến dịch Điện Biên Phủ", "Cách nào giúp Việt Minh duy trì vòng vây tại Điện Biên Phủ?", "Vận chuyển pháo, đạn và lương thực qua địa hình khó khăn", ["Tiếp tế bằng đường biển từ Sài Gòn", "Dùng sân bay của Pháp để đưa quân vào", "Rút khỏi các vị trí trên sườn núi"], "Hậu cần qua địa hình khó khăn giúp duy trì vòng vây."),
    bankQuestion("Chiến dịch Điện Biên Phủ", "Việc kiểm soát phần lớn đường băng ảnh hưởng thế nào đến quân Pháp?", "Làm việc thả tiếp tế bằng đường không khó khăn hơn", ["Giúp Pháp mở thêm sân bay", "Khiến chiến dịch chuyển sang miền Nam", "Làm Hiệp định Paris được ký sớm"], "Đường băng bị kiểm soát khiến việc tiếp tế ngày càng khó."),
    bankQuestion("Phong trào Đồng Khởi", "Phong trào Đồng Khởi tiêu biểu bùng lên ở địa phương nào?", "Bến Tre", ["Điện Biên", "Quảng Ninh", "Cao Bằng"], "Bến Tre là địa phương tiêu biểu của phong trào Đồng Khởi."),
    bankQuestion("Phong trào Đồng Khởi", "Phong trào Đồng Khởi tiêu biểu ở Bến Tre diễn ra vào năm nào?", "1960", ["1954", "1968", "1973"], "Mốc tiêu biểu của Đồng Khởi ở Bến Tre là năm 1960."),
    bankQuestion("Phong trào Đồng Khởi", "Phong trào Đồng Khởi phát triển chủ yếu ở miền nào?", "Miền Nam", ["Miền Bắc", "Tây Bắc", "Chỉ tại Hà Nội"], "Phong trào đấu tranh phát triển ở miền Nam."),
    bankQuestion("Phong trào Đồng Khởi", "Nhận định nào đúng về phạm vi phong trào Đồng Khởi?", "Phong trào lan rộng ở nhiều nơi, không chỉ là một trận đánh đơn lẻ", ["Chỉ diễn ra tại một cứ điểm", "Chỉ là một hội nghị ngoại giao", "Diễn ra sau ngày 30/4/1975"], "Đồng Khởi là phong trào rộng, tiêu biểu ở Bến Tre."),
    bankQuestion("Kháng chiến chống Mỹ", "Quân chiến đấu Hoa Kỳ đổ bộ vào Đà Nẵng từ năm nào theo tài liệu?", "1965", ["1954", "1960", "1973"], "Từ năm 1965, quân chiến đấu Hoa Kỳ đổ bộ vào Đà Nẵng."),
    bankQuestion("Tết Mậu Thân", "Tết Mậu Thân diễn ra vào đầu năm nào?", "1968", ["1960", "1965", "1975"], "Cuộc Tổng tiến công và nổi dậy diễn ra đầu năm 1968."),
    bankQuestion("Tết Mậu Thân", "Cuộc Tổng tiến công Tết Mậu Thân diễn ra tại phạm vi nào?", "Nhiều đô thị và địa bàn ở miền Nam", ["Chỉ tại Điện Biên Phủ", "Chỉ tại Paris", "Chỉ ở vùng núi phía Bắc"], "Cuộc tiến công diễn ra trên nhiều đô thị và địa bàn miền Nam."),
    bankQuestion("Tết Mậu Thân", "Đánh giá nào phân biệt đúng kết quả quân sự và tác động của Tết Mậu Thân?", "Không đạt mọi mục tiêu quân sự dự kiến nhưng tạo tác động chính trị, truyền thông sâu rộng", ["Đạt mọi mục tiêu và kết thúc chiến tranh ngay", "Chỉ là một hiệp định ngừng bắn", "Không ảnh hưởng tới tranh luận hay đàm phán"], "Tác động chính trị rộng không đồng nghĩa đạt mọi mục tiêu quân sự."),
    bankQuestion("Hiệp định Paris", "Hiệp định Paris về Việt Nam được ký vào ngày nào?", "27/1/1973", ["7/5/1954", "1/5/1968", "30/4/1975"], "Hiệp định Paris được ký ngày 27/1/1973."),
    bankQuestion("Hiệp định Paris", "Theo tiến trình Hiệp định Paris, lực lượng nào rút khỏi Việt Nam?", "Quân đội Hoa Kỳ", ["Quân đội Pháp năm 1954", "Quân đội Việt Nam năm 1976", "Lực lượng Đồng Khởi"], "Hiệp định gắn với việc quân đội Hoa Kỳ rút khỏi Việt Nam."),
    bankQuestion("Hiệp định Paris", "Điều gì tiếp tục sau khi quân đội Hoa Kỳ rút theo Hiệp định Paris?", "Xung đột giữa các lực lượng Việt Nam", ["Chiến tranh đã kết thúc ngay năm 1973", "Tổng tuyển cử năm 1956 được tổ chức", "Chiến dịch Điện Biên Phủ bắt đầu"], "Xung đột tiếp tục, nên chiến tranh chưa kết thúc năm 1973."),
    bankQuestion("Kết thúc chiến tranh", "Chiến tranh tại miền Nam kết thúc vào năm nào?", "1975", ["1968", "1973", "1976"], "Chiến tranh tại miền Nam kết thúc năm 1975."),
    bankQuestion("Kết thúc chiến tranh", "Ngày 30/4/1975 gắn với sự kiện nào?", "Lực lượng tiến công tiến vào Sài Gòn", ["Ký Hiệp định Paris", "Mở màn Điện Biên Phủ", "Phong trào Đồng Khởi ở Bến Tre"], "Ngày 30/4/1975, lực lượng tiến công tiến vào Sài Gòn."),
    bankQuestion("Kết thúc chiến tranh", "Việc thống nhất nhà nước Việt Nam được thực hiện vào năm nào?", "1976", ["1968", "1973", "1975"], "Thống nhất nhà nước được thực hiện năm 1976."),
    bankQuestion("Kết thúc chiến tranh", "Thứ tự các chiến dịch mùa Xuân 1975 nào được nêu trong tài liệu?", "Tây Nguyên → Huế–Đà Nẵng → Hồ Chí Minh", ["Hồ Chí Minh → Điện Biên Phủ → Tây Nguyên", "Paris → Đồng Khởi → Huế–Đà Nẵng", "Điện Biên Phủ → Paris → Hồ Chí Minh"], "Ba chiến dịch được nêu theo thứ tự Tây Nguyên, Huế–Đà Nẵng, Hồ Chí Minh."),
  ],
  geography: [
    bankQuestion("Vị trí địa lý", "Việt Nam nằm ở rìa phía đông của bán đảo nào?", "Bán đảo Đông Dương", ["Bán đảo Triều Tiên", "Bán đảo Mã Lai", "Bán đảo Ả Rập"], "Việt Nam nằm ở rìa phía đông bán đảo Đông Dương."),
    bankQuestion("Vị trí địa lý", "Việt Nam thuộc khu vực địa lý nào?", "Đông Nam Á", ["Đông Á", "Nam Á", "Tây Á"], "Việt Nam thuộc khu vực Đông Nam Á."),
    bankQuestion("Vị trí địa lý", "Phần đất liền Việt Nam kéo dài chủ yếu theo hướng nào?", "Bắc–Nam", ["Đông–Tây", "Tây Bắc–Đông Nam", "Vòng cung"], "Phần đất liền kéo dài theo chiều Bắc–Nam."),
    bankQuestion("Vị trí địa lý", "Phía bắc Việt Nam giáp quốc gia nào?", "Trung Quốc", ["Thái Lan", "Malaysia", "Singapore"], "Phía bắc Việt Nam giáp Trung Quốc."),
    bankQuestion("Vị trí địa lý", "Phía tây Việt Nam giáp những quốc gia nào?", "Lào và Campuchia", ["Trung Quốc và Nhật Bản", "Thái Lan và Myanmar", "Malaysia và Singapore"], "Phía tây Việt Nam giáp Lào và Campuchia."),
    bankQuestion("Vị trí địa lý", "Vùng biển nào giáp phía đông và phía nam phần đất liền Việt Nam?", "Biển Đông", ["Biển Đỏ", "Biển Nhật Bản", "Địa Trung Hải"], "Phía đông và phía nam Việt Nam giáp Biển Đông."),
    bankQuestion("Vị trí địa lý", "Lãnh thổ Việt Nam gồm những bộ phận nào?", "Vùng đất, vùng biển và vùng trời", ["Chỉ vùng đất liền", "Vùng đất và vùng núi", "Vùng biển và vùng trời"], "Lãnh thổ gồm vùng đất, vùng biển và vùng trời."),
    bankQuestion("Địa hình", "Đặc điểm nào mô tả đúng địa hình Việt Nam?", "Đồi núi chiếm phần lớn diện tích, chủ yếu là đồi núi thấp", ["Toàn bộ là đồng bằng cao", "Chủ yếu là núi băng", "Phần lớn là hoang mạc"], "Đồi núi chiếm phần lớn diện tích nhưng chủ yếu là núi thấp."),
    bankQuestion("Địa hình", "Hai đồng bằng châu thổ lớn của Việt Nam là gì?", "Đồng bằng sông Hồng và đồng bằng sông Cửu Long", ["Đồng bằng sông Đà và sông Mã", "Đồng bằng Tây Nguyên và Đông Bắc", "Đồng bằng Trường Sơn và Hoàng Liên Sơn"], "Hai châu thổ lớn là sông Hồng và sông Cửu Long."),
    bankQuestion("Địa hình", "Ngoài hai châu thổ lớn, đồng bằng Việt Nam còn phân bố ở đâu?", "Ven biển miền Trung", ["Trên đỉnh núi cao", "Chỉ ở vùng biên giới phía Bắc", "Giữa các đảo xa bờ"], "Tài liệu nêu các đồng bằng ven biển miền Trung."),
    bankQuestion("Địa hình", "Địa hình có thể ảnh hưởng trực tiếp đến yếu tố nào?", "Phân bố dân cư và giao thông", ["Ngày ký hiệp định", "Ngôn ngữ lập trình", "Quỹ đạo Trái Đất"], "Địa hình ảnh hưởng tới dân cư, giao thông và sản xuất."),
    bankQuestion("Địa hình", "Đồi núi chiếm phần lớn diện tích nhưng phần lớn là dạng núi nào?", "Đồi núi thấp", ["Núi băng cao", "Núi lửa đang hoạt động", "Núi cao trên 5.000 mét"], "Đồi núi Việt Nam chủ yếu là đồi núi thấp."),
    bankQuestion("Khí hậu", "Khí hậu chung của Việt Nam mang tính chất nào?", "Nhiệt đới ẩm gió mùa", ["Ôn đới khô quanh năm", "Hoang mạc nhiệt đới", "Hàn đới lục địa"], "Khí hậu Việt Nam mang tính chất nhiệt đới ẩm gió mùa."),
    bankQuestion("Khí hậu", "Những yếu tố nào góp phần tạo khác biệt khí hậu giữa các vùng?", "Vĩ độ, độ cao và ảnh hưởng của biển", ["Chỉ có kinh độ", "Chỉ có mật độ đường sá", "Màu sắc đất"], "Khí hậu khác nhau theo vĩ độ, độ cao và ảnh hưởng của biển."),
    bankQuestion("Khí hậu", "So với miền Nam, miền Bắc có đặc điểm mùa đông nào?", "Lạnh hơn", ["Luôn nóng hơn", "Không có mùa đông", "Khô nóng như hoang mạc"], "Miền Bắc có mùa đông lạnh hơn miền Nam."),
    bankQuestion("Khí hậu", "Đặc điểm nào thay đổi theo vùng ở Việt Nam?", "Lượng mưa, nhiệt độ và thời điểm mùa mưa", ["Độ nghiêng trục Trái Đất", "Vị trí các đại dương", "Độ dài một ngày"], "Lượng mưa, nhiệt độ và mùa mưa khác nhau theo vùng."),
    bankQuestion("Khí hậu", "Thiên tai nào được nêu trong tài liệu địa lý?", "Bão, lũ, hạn hán và sạt lở", ["Động đất núi lửa hằng ngày", "Băng tuyết quanh năm", "Sóng thần thường trực"], "Tài liệu nêu bão, lũ, hạn hán và sạt lở."),
    bankQuestion("Dân cư", "Dân cư Việt Nam phân bố như thế nào?", "Không đồng đều", ["Đồng đều tuyệt đối giữa mọi vùng", "Chỉ tập trung ở miền núi", "Chỉ sống tại đồng bằng"], "Dân cư Việt Nam phân bố không đồng đều."),
    bankQuestion("Dân cư", "Những khu vực nào thường tập trung đông dân hơn?", "Đồng bằng, đô thị và vùng kinh tế phát triển", ["Đỉnh núi cao và rừng sâu", "Khu vực xa mọi tuyến giao thông", "Chỉ các đảo nhỏ"], "Dân cư thường tập trung ở đồng bằng, đô thị, vùng kinh tế phát triển."),
    bankQuestion("Dân cư", "Dân số đông tạo ra lợi thế nào được nêu trong tài liệu?", "Nguồn lao động và thị trường lớn", ["Làm mất nhu cầu hạ tầng", "Xóa bỏ mọi thiên tai", "Đảm bảo tài nguyên vô hạn"], "Dân số đông tạo nguồn lao động và thị trường lớn."),
    bankQuestion("Dân cư", "Dân số đông đồng thời đặt ra yêu cầu nào?", "Việc làm, hạ tầng, giáo dục và y tế", ["Loại bỏ hoàn toàn giao thông", "Ngừng sử dụng tài nguyên", "Chỉ xây dựng ở miền núi"], "Dân số đông đòi hỏi việc làm và dịch vụ thiết yếu."),
    bankQuestion("Dân cư", "Khi xem xét mật độ dân cư, cần tránh cách khái quát nào?", "Cho rằng mọi khu vực đều phân bố dân cư giống nhau", ["So sánh đồng bằng và miền núi", "Xét ảnh hưởng của đô thị", "Tìm mối liên hệ với giao thông"], "Phân bố dân cư khác nhau giữa các khu vực."),
    bankQuestion("Địa lý tự nhiên", "Đường bờ biển dài tạo điều kiện phát triển hoạt động nào?", "Giao thông, thủy sản và du lịch", ["Trồng cây ôn đới trên núi cao", "Khai thác băng tuyết", "Chăn nuôi tuần lộc"], "Bờ biển dài hỗ trợ giao thông, thủy sản và du lịch."),
    bankQuestion("Địa lý tự nhiên", "Lãnh thổ Việt Nam có những vùng nào ngoài vùng đất?", "Vùng biển và vùng trời", ["Chỉ vùng núi", "Vùng sa mạc và vùng băng", "Vùng đồng bằng và vùng đô thị"], "Lãnh thổ gồm vùng đất, vùng biển và vùng trời."),
    bankQuestion("Địa lý tự nhiên", "Địa hình ảnh hưởng đến sản xuất nào được nêu trong tài liệu?", "Nông nghiệp", ["Sản xuất vệ tinh", "Khai thác băng", "Đóng tàu vũ trụ"], "Địa hình ảnh hưởng tới sản xuất nông nghiệp."),
    bankQuestion("Địa lý tự nhiên", "Khi phân tích một vấn đề địa lý, bước nào phù hợp?", "Xác định vị trí và phạm vi trước", ["Kết luận trước khi xem dữ kiện", "Bỏ qua mối liên hệ giữa các yếu tố", "Khái quát mọi vùng giống nhau"], "Cần xác định vị trí, phạm vi và đặc điểm trước khi giải thích."),
    bankQuestion("Địa lý tự nhiên", "Vì sao cần xem xét thiên tai theo từng khu vực?", "Đặc điểm và nguy cơ thiên tai khác nhau theo vùng", ["Mọi vùng có cùng địa hình", "Khí hậu không thay đổi theo vùng", "Dân cư phân bố hoàn toàn đồng đều"], "Thiên tai cần được xem xét theo đặc điểm từng khu vực."),
    bankQuestion("Địa lý tự nhiên", "Địa hình đa dạng có thể làm thay đổi yếu tố nào giữa các khu vực?", "Điều kiện giao thông và sản xuất", ["Độ dài năm dương lịch", "Vị trí của xích đạo", "Số giờ trong một ngày"], "Địa hình tác động tới giao thông và sản xuất."),
    bankQuestion("Khí hậu", "Khi so sánh khí hậu hai vùng, cách nào phù hợp?", "Xét vị trí, độ cao, ảnh hưởng biển và mùa mưa", ["Cho rằng mọi nơi có cùng thời tiết", "Chỉ dựa vào một ngày đo", "Bỏ qua vị trí địa lý"], "Khí hậu khác nhau theo vĩ độ, độ cao và ảnh hưởng biển."),
    bankQuestion("Địa lý dân cư", "Nhiều dân tộc ở Việt Nam tạo nên đặc điểm nào?", "Bản sắc văn hóa đa dạng", ["Một kiểu văn hóa duy nhất", "Không có khác biệt văn hóa", "Dân cư chỉ sống ở đô thị"], "Việt Nam có nhiều dân tộc với bản sắc đa dạng."),
  ],
  cProgramming: [
    bankQuestion("Cấu trúc chương trình C", "Điểm bắt đầu thực thi thông thường của chương trình C là hàm nào?", "main", ["printf", "start", "include"], "Chương trình C thường bắt đầu từ hàm main."),
    bankQuestion("Cấu trúc chương trình C", "Trong C, một câu lệnh thường kết thúc bằng ký tự nào?", "Dấu chấm phẩy", ["Dấu hai chấm", "Dấu phẩy", "Dấu chấm"], "Các câu lệnh C thường kết thúc bằng dấu chấm phẩy."),
    bankQuestion("Thư viện chuẩn", "Header nào khai báo các hàm nhập xuất chuẩn như printf và scanf?", "stdio.h", ["stdlib.h", "string.h", "math.h"], "stdio.h khai báo các hàm nhập xuất chuẩn."),
    bankQuestion("Kiểu dữ liệu", "Phép chia hai giá trị int trong C thường cho kết quả thuộc kiểu nào?", "Số nguyên nếu cả hai toán hạng là int", ["Luôn là số thực", "Luôn là chuỗi", "Kiểu con trỏ"], "Phép chia số nguyên bỏ phần thập phân."),
    bankQuestion("Hàm", "C truyền đối số vào hàm theo cách nào?", "Theo giá trị", ["Luôn theo tham chiếu", "Theo tên biến toàn cục", "Không truyền đối số"], "C truyền đối số theo giá trị."),
    bankQuestion("Mảng và chuỗi", "C có tự động kiểm tra biên khi truy cập phần tử mảng không?", "Không; chương trình phải tự bảo đảm chỉ số hợp lệ", ["Có, luôn tự sửa chỉ số sai", "Có, nhưng chỉ với mảng char", "Chỉ kiểm tra khi dùng printf"], "C không tự kiểm tra biên mảng khi truy cập."),
    bankQuestion("Bộ nhớ động", "Nếu malloc cấp phát thất bại, giá trị trả về cần được kiểm tra là gì?", "NULL", ["EOF", "Một chuỗi rỗng", "Luôn là địa chỉ hợp lệ"], "Cần kiểm tra malloc trả về NULL trước khi dùng."),
    bankQuestion("Tệp", "Sau khi thao tác xong với FILE*, nên gọi hàm nào?", "fclose", ["free", "continue", "sizeof"], "fclose đóng tệp đang mở."),
  ],
};

function getHistoryEventKey(topic) {
  const topicText = topic.toLocaleLowerCase("vi");
  if (/điện biên phủ/.test(topicText)) return "dienBien";
  if (/gen[eèê]ve/.test(topicText)) return "geneva";
  if (/paris/.test(topicText)) return "paris";
  if (/đồng khởi|bến tre/.test(topicText)) return "dongKhoi";
  if (/mậu thân|tết 1968|tổng tiến công.*tết/.test(topicText)) return "tet";
  if (/kết thúc chiến tranh|chiến dịch hồ chí minh|mùa xuân 1975|tây nguyên|huế.{0,10}đà nẵng|30\s*\/?\s*4|30 tháng 4|thống nhất.*1976/.test(topicText)) return "endWar";
  return null;
}

function getHistoryStudySections(topic) {
  const eventKey = getHistoryEventKey(topic);
  if (eventKey === "dienBien") {
    return [
      {
        title: "Mục tiêu của phía Pháp tại Điện Biên Phủ",
        content: "Chiến dịch diễn ra từ 13/3 đến 7/5/1954 trong kháng chiến chống Pháp. Pháp xây dựng tập đoàn cứ điểm ở Tây Bắc, muốn gây sức ép lên các tuyến tiếp tế sang Lào và dụ Việt Minh vào trận đánh lớn mà họ tin ưu thế hỏa lực, không vận sẽ có lợi. Theo nguồn được dẫn trong tài liệu, Pháp đưa hơn 15.000 quân vào khu vực; đây là số ước tính của nguồn, không phải kiểm kê tuyệt đối.",
      },
      {
        title: "Cách đánh và hậu cần của phía Việt Minh",
        content: "Phía Việt Minh bao vây lòng chảo, đào chiến hào áp sát các cứ điểm và đưa pháo lên vị trí trên sườn núi. Vận chuyển pháo, đạn và lương thực qua địa hình khó khăn giúp duy trì vòng vây và làm suy yếu khả năng tiếp tế đường không của Pháp.",
      },
      {
        title: "Diễn biến, kết quả và giới hạn dữ kiện",
        content: "Ngày 13/3, pháo binh mở màn đánh các cứ điểm vòng ngoài phía bắc; sau đó sân bay bị vô hiệu hóa, giao tranh tập trung ở các cứ điểm và cao điểm phía đông. Đợt tổng công kích cuối bắt đầu ngày 1/5; ngày 7/5/1954, sở chỉ huy tập đoàn cứ điểm bị đánh chiếm. Chiến thắng góp phần tạo sức ép lớn tại Hội nghị Genève nhưng không phải nguyên nhân duy nhất dẫn tới hiệp định. Nguồn History.com nêu tổn thất máy bay Pháp, không có bảng thương vong con người đầy đủ, thống nhất cho cả hai phía; bài học không tự bịa con số hoặc giờ chính xác.",
      },
    ];
  }
  if (eventKey === "geneva") {
    return [
      {
        title: "Hiệp định Genève: thỏa thuận đình chiến năm 1954",
        content: "Hiệp định Genève về Đông Dương được ký tháng 7/1954 sau khi chiến tranh chống Pháp kết thúc. Ở Việt Nam, việc tập kết và chuyển quân được tổ chức tạm thời ở hai vùng; giới tuyến quân sự gần vĩ tuyến 17 không phải biên giới quốc gia vĩnh viễn.",
      },
      {
        title: "Điều khoản, dự kiến và điều không diễn ra",
        content: "Hiệp định dự kiến tổng tuyển cử để thống nhất Việt Nam vào năm 1956. Cuộc tổng tuyển cử đó không diễn ra như dự kiến. Cần phân biệt điều khoản được dự kiến với kết quả lịch sử thực tế, đồng thời không đồng nhất Genève năm 1954 với Paris năm 1973.",
      },
      {
        title: "Sơ đồ mốc cần nhớ",
        content: "Trình tự: chiến thắng Điện Biên Phủ tháng 5/1954 tạo bối cảnh đàm phán → Hiệp định Genève tháng 7/1954 → tập kết quân sự tạm thời và dự kiến tổng tuyển cử năm 1956. Hiệp định tạo bước ngoặt chấm dứt chiến tranh với Pháp ở Đông Dương, nhưng chưa thống nhất Việt Nam.",
      },
    ];
  }
  if (eventKey === "dongKhoi") {
    return [
      {
        title: "Đồng Khởi bùng lên ở miền Nam",
        content: "Cuối thập niên 1950 và đầu thập niên 1960, phong trào đấu tranh ở miền Nam phát triển trong bối cảnh chính quyền Ngô Đình Diệm đàn áp các lực lượng cách mạng. Bến Tre là địa phương tiêu biểu, phong trào Đồng Khởi bùng lên mạnh mẽ năm 1960 rồi lan ra nhiều nơi.",
      },
      {
        title: "Diễn biến và ý nghĩa",
        content: "Ở nhiều vùng nông thôn, quần chúng nổi dậy phá thế kìm kẹp, giành quyền làm chủ ở một số địa bàn; đấu tranh chính trị kết hợp với lực lượng vũ trang. Phong trào làm thay đổi tương quan và mở rộng lực lượng cách mạng ở miền Nam. Không nên mô tả Đồng Khởi như một trận đánh đơn lẻ chỉ diễn ra tại một điểm.",
      },
      {
        title: "Mốc ghi nhớ",
        content: "Gắn ba ý với nhau: Bến Tre là nơi tiêu biểu → năm 1960 là mốc phong trào Đồng Khởi → đây là phong trào rộng ở miền Nam, không phải sự kiện Điện Biên Phủ năm 1954 hay cuộc Tổng tiến công Tết Mậu Thân năm 1968.",
      },
    ];
  }
  if (eventKey === "tet") {
    return [
      {
        title: "Tổng tiến công và nổi dậy Tết Mậu Thân 1968",
        content: "Đầu năm 1968, lực lượng cách mạng mở cuộc Tổng tiến công và nổi dậy trên nhiều đô thị, địa bàn ở miền Nam vào dịp Tết. Đây là một đợt hoạt động quân sự quy mô rộng, không phải một trận đánh duy nhất ở một thành phố.",
      },
      {
        title: "Kết quả quân sự và tác động chính trị",
        content: "Cuộc tiến công không đạt mọi mục tiêu quân sự dự kiến và gây tổn thất lớn cho nhiều bên. Tuy vậy, quy mô và diễn biến của sự kiện tạo tác động chính trị, truyền thông sâu rộng, ảnh hưởng đến tranh luận tại Hoa Kỳ và tiến trình đàm phán. Cần tách kết quả quân sự trước mắt khỏi tác động chính trị lâu dài.",
      },
      {
        title: "Phân biệt các mốc trong cuộc chiến",
        content: "Tết Mậu Thân gắn với năm 1968; Hiệp định Paris được ký năm 1973; chiến tranh tại miền Nam kết thúc năm 1975. Ba mốc này liên quan trong tiến trình lịch sử nhưng không thể thay thế cho nhau.",
      },
    ];
  }
  if (eventKey === "paris") {
    return [
      {
        title: "Hiệp định Paris được ký ngày 27/1/1973",
        content: "Hiệp định Paris về chấm dứt chiến tranh, lập lại hòa bình ở Việt Nam được ký ngày 27/1/1973. Thỏa thuận quy định ngừng bắn và việc quân đội Hoa Kỳ cùng lực lượng đồng minh rút khỏi Việt Nam theo tiến trình của hiệp định.",
      },
      {
        title: "Rút quân không đồng nghĩa chiến tranh đã kết thúc",
        content: "Sau khi quân đội Hoa Kỳ rút, xung đột giữa các lực lượng Việt Nam vẫn tiếp diễn. Vì vậy, năm 1973 là mốc ký hiệp định và rút quân Hoa Kỳ, không phải mốc kết thúc chiến tranh tại miền Nam.",
      },
      {
        title: "Đặt Hiệp định Paris đúng trong dòng thời gian",
        content: "Chuỗi mốc: Hiệp định Genève năm 1954 → Hiệp định Paris ngày 27/1/1973 → chiến dịch mùa Xuân năm 1975 và chiến tranh kết thúc tại miền Nam ngày 30/4/1975. Đừng gán sự kiện năm 1975 cho nội dung hiệp định năm 1973.",
      },
    ];
  }
  if (eventKey === "endWar") {
    return [
      {
        title: "Chiến dịch mùa Xuân 1975 diễn ra liên tiếp",
        content: "Mùa Xuân năm 1975, các chiến dịch Tây Nguyên, Huế–Đà Nẵng và Hồ Chí Minh diễn ra nối tiếp, làm thay đổi nhanh cục diện chiến trường. Ngày 10/3/1975, chiến dịch Tây Nguyên mở màn bằng cuộc tiến công Buôn Ma Thuột; sau đó lực lượng Việt Nam Cộng hòa rút lui khỏi Tây Nguyên và tình hình ở miền Trung biến chuyển nhanh.",
      },
      {
        title: "Chiến dịch Hồ Chí Minh và ngày 30/4",
        content: "Chiến dịch Hồ Chí Minh bắt đầu ngày 26/4/1975. Ngày 30/4, lực lượng tiến công tiến vào Sài Gòn; Tổng thống Dương Văn Minh tuyên bố đầu hàng. Đây là mốc kết thúc chiến tranh tại miền Nam Việt Nam, không phải ngày ký Hiệp định Paris.",
      },
      {
        title: "Kết quả và mốc thống nhất nhà nước",
        content: "Chiến tranh kết thúc tại miền Nam năm 1975; việc thống nhất nhà nước được thực hiện năm 1976. Khi kể lại, hãy xếp đúng thứ tự Tây Nguyên → Huế–Đà Nẵng → Hồ Chí Minh, rồi phân biệt mốc chiến tranh kết thúc với mốc thống nhất nhà nước.",
      },
    ];
  }
  return [
    {
      title: "Dòng thời gian chính của giai đoạn 1954–1975",
      content: "Sau Hiệp định Genève năm 1954, phong trào Đồng Khởi phát triển ở miền Nam, tiêu biểu tại Bến Tre năm 1960; cuộc Tổng tiến công và nổi dậy Tết Mậu Thân diễn ra năm 1968; Hiệp định Paris được ký ngày 27/1/1973; chiến tranh tại miền Nam kết thúc ngày 30/4/1975.",
    },
    {
      title: "Phân biệt mốc hiệp định và mốc kết thúc chiến tranh",
      content: "Genève năm 1954 gắn với đình chiến và tập kết quân sự tạm thời; Paris năm 1973 gắn với thỏa thuận ngừng bắn và việc quân đội Hoa Kỳ rút; ngày 30/4/1975 là mốc chiến tranh kết thúc tại miền Nam. Đây là các sự kiện khác nhau, không dùng thay cho nhau.",
    },
    {
      title: "Cách trình bày một sự kiện lịch sử",
      content: "Khi câu hỏi chưa xác định rõ sự kiện, hãy nêu mốc thời gian, bối cảnh, lực lượng liên quan, diễn biến chính, kết quả và tác động; không tự gán một chi tiết của sự kiện này sang sự kiện khác. Việc thống nhất nhà nước được thực hiện năm 1976, sau mốc chiến tranh kết thúc tại miền Nam.",
    },
  ];
}

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
      || new Set(item.options.map(normalizeQuizOption)).size !== 4) {
      errors.push(`question ${index + 1} does not have four distinct options`);
    }
    if (typeof item.answer !== "string" || !Array.isArray(item.options) || !item.options.includes(item.answer)) {
      errors.push(`question ${index + 1} answer does not match an option`);
    }
    if (typeof item.explanation !== "string" || !item.explanation.trim()) errors.push(`question ${index + 1} has no explanation`);
  });
  return errors;
}

function getPrewrittenQuizPool(topicId) {
  const bankId = topicId === "antiUsWar" ? "history" : topicId;
  const candidates = (questionBanks[bankId]?.questions || [])
    .filter((item) => !/quần đảo hoàng sa thuộc vùng biển/i.test(item.question))
    .map((item) => ({
      question: item.question,
      topic: item.prompt,
      options: item.options,
      answer: item.options[item.answer],
      explanation: item.explanation,
    }));
  for (const focusTopic of studyFocusTopics[topicId] || []) {
    for (const phase of ["foundation", "practice", "advanced"]) {
      const item = getStudyQuiz(topicId, focusTopic, phase);
      candidates.push({
        question: item.question,
        topic: focusTopic,
        options: item.options,
        answer: item.options[item.answerIndex],
        explanation: item.explanation,
      });
    }
  }
  candidates.push(...(supplementalQuizQuestions[topicId] || []));

  const uniqueQuestions = new Map();
  for (const item of candidates) {
    const key = normalizeQuizOption(item.question);
    if (!key || uniqueQuestions.has(key) || getQuizValidationErrors([item], 1).length) continue;
    uniqueQuestions.set(key, item);
  }
  return [...uniqueQuestions.values()];
}

function shuffleQuizQuestions(questions) {
  const shuffled = questions.map((question) => {
    const options = question.options.map((option) => ({ option, correct: option === question.answer }));
    for (let index = options.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [options[index], options[swapIndex]] = [options[swapIndex], options[index]];
    }
    return {
      ...question,
      options: options.map(({ option }) => option),
      answer: options.find(({ correct }) => correct).option,
    };
  });
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function normalizeQuizOption(value) {
  return value
    .replace(/^\s*[A-D]\s*[.)、:]\s*/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGeneratedQuiz(quiz) {
  if (!Array.isArray(quiz)) return quiz;
  return quiz.map((item) => {
    if (!item || typeof item !== "object" || !Array.isArray(item.options)) return item;
    const rawOptions = item.options;
    const options = rawOptions.map((option) => typeof option === "string"
      ? option.replace(/^\s*[A-D]\s*[.)、:]\s*/i, "").trim()
      : option);
    let answer = item.answer;
    if (typeof answer === "string") {
      let answerIndex = rawOptions.indexOf(answer);
      if (answerIndex < 0) answerIndex = options.indexOf(answer.trim());
      if (answerIndex < 0) {
        const answerLabel = answer.trim().match(/^([A-D])(?:[.)])?$/i);
        if (answerLabel) answerIndex = answerLabel[1].toUpperCase().charCodeAt(0) - 65;
      }
      answer = answerIndex >= 0 && answerIndex < options.length
        ? options[answerIndex]
        : answer.replace(/^\s*[A-D]\s*[.)、:]\s*/i, "").trim();
    }
    return { ...item, options, answer };
  });
}

function getQuizPrompt(count, sourceText, selectedTopic, validationErrors = []) {
  const correction = validationErrors.length
    ? `\n\nSỬA CÁC LỖI SAU TRONG LẦN TẠO TRƯỚC: ${validationErrors.join("; ")}. Mỗi câu cần đúng 4 phương án riêng biệt, không gắn nhãn A/B/C/D vào nội dung lựa chọn, và chỉ một đáp án đúng.`
    : "";
  return `Tạo CHÍNH XÁC ${count} câu hỏi trắc nghiệm tiếng Việt chỉ dựa trên tài liệu bên dưới. Trả về JSON dạng [{"question":"...","topic":"...","options":["Nội dung lựa chọn đúng","Nội dung lựa chọn sai 1","Nội dung lựa chọn sai 2","Nội dung lựa chọn sai 3"],"answer":"Nội dung lựa chọn đúng","explanation":"..."}]. Mỗi câu có đúng 4 phương án khác nhau, chỉ chứa nội dung phương án, không thêm nhãn A/B/C/D vì giao diện tự gắn nhãn; chỉ một đáp án đúng và answer phải trùng chính xác toàn bộ chuỗi trong một options; lời giải thích căn cứ tài liệu. Không thêm dữ kiện ngoài tài liệu, không lặp câu hỏi.${correction}\n\n<TAI_LIEU ${selectedTopic ? `CHU_DE="${selectedTopic.title}"` : ""}>\n${sourceText.trim()}\n</TAI_LIEU>`;
}

async function generateQuizWithOllama(ollama, count, sourceText, selectedTopic) {
  let validationErrors = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const content = await ollama.chat(
      "Bạn là trợ lý giáo dục chuyên tạo câu hỏi trắc nghiệm. Chỉ kiểm tra dữ kiện được nêu rõ trong tài liệu, không bịa kiến thức. Mỗi lựa chọn chỉ chứa nội dung, không thêm tiền tố A/B/C/D; answer phải là nguyên văn một lựa chọn, không phải chữ cái. Bốn lựa chọn phải khác nhau về nội dung. Chỉ trả JSON theo schema.",
      getQuizPrompt(count, sourceText, selectedTopic, validationErrors),
      quizSchema,
      Math.min(4_096, 400 + count * 350),
    );
    try {
      const quiz = normalizeGeneratedQuiz(JSON.parse(content));
      validationErrors = getQuizValidationErrors(quiz, count);
      if (!validationErrors.length) return quiz;
    } catch {
      validationErrors = ["phản hồi không phải JSON hợp lệ"];
    }
  }
  throw new Error(`Ollama không tạo được bộ câu hỏi hợp lệ: ${validationErrors.join("; ")}`);
}

function createImmediateQuizAnalysis({ correctAnswers, totalQuestions, incorrectAnswers, topicTitle }) {
  const groupedErrors = new Map();
  for (const item of incorrectAnswers) {
    const topic = item.topic.trim() || topicTitle || "Kiến thức trong bài";
    const errors = groupedErrors.get(topic) || [];
    errors.push(item);
    groupedErrors.set(topic, errors);
  }
  const weaknesses = [...groupedErrors.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([topic, errors]) => ({
      topic,
      reason: `Bạn trả lời sai ${errors.length} câu ở phần này; cần xem lại các câu: ${errors
        .slice(0, 3)
        .map((item) => `“${item.question}”`)
        .join(", ")}.`,
      knowledgeToReview: [...new Set(errors.map((item) => item.explanation.trim()).filter(Boolean))]
        .slice(0, 3)
        .join(" "),
    }));
  const missedQuestions = incorrectAnswers.slice(0, 5).map((item) => item.question);
  const focusTopics = weaknesses.slice(0, 3).map((item) => item.topic);
  const topic = topicTitle || "chủ đề vừa học";
  const summary = incorrectAnswers.length
    ? `Bạn trả lời đúng ${correctAnswers}/${totalQuestions} câu. Hãy ưu tiên ôn ${focusTopics.join(", ") || topic}, là phần có câu trả lời sai trong bài.`
    : `Bạn trả lời đúng ${correctAnswers}/${totalQuestions} câu trong chủ đề ${topic}.`;
  const analysis = {
    summary,
    weaknesses,
    studyPlan: incorrectAnswers.length
      ? [
        {
          step: 1,
          title: `Ôn lại ${focusTopics[0] || topic}`,
          activity: weaknesses[0]?.knowledgeToReview || "Đọc lại lời giải của các câu trả lời sai trong bài.",
        },
        {
          step: 2,
          title: "Làm lại câu đã sai",
          activity: `Tự trả lời lại các câu: ${missedQuestions.slice(0, 3).map((question) => `“${question}”`).join(", ")}. Sau mỗi câu, giải thích vì sao đáp án đúng phù hợp.`,
        },
        {
          step: 3,
          title: "Tự kiểm tra mức độ nắm bài",
          activity: `Ôn ${focusTopics.join(", ") || topic}, rồi tự đặt một câu hỏi ngắn cho mỗi phần và trả lời mà không nhìn tài liệu.`,
        },
      ]
      : [
        {
          step: 1,
          title: "Tóm tắt kiến thức trọng tâm",
          activity: `Tự tóm tắt các ý chính của ${topic} bằng lời của bạn.`,
        },
        {
          step: 2,
          title: "Giải thích và vận dụng",
          activity: `Chọn một nội dung trong ${topic}, giải thích lại và đưa ra một ví dụ.`,
        },
        {
          step: 3,
          title: "Tự kiểm tra và mở rộng",
          activity: `Tạo ba câu hỏi mới về ${topic} và tự trả lời để củng cố kiến thức.`,
        },
      ],
    practiceTips: incorrectAnswers.length
      ? [
        "Đọc lời giải của từng câu sai và tự nói lại ý chính trước khi xem đáp án.",
        "Ôn phần có nhiều câu sai trước, sau đó làm lại các câu đó.",
      ]
      : [
        "Tiếp tục luyện câu hỏi vận dụng để kiểm tra khả năng áp dụng kiến thức.",
        "Tự giải thích đáp án bằng lời của bạn để ghi nhớ sâu hơn.",
      ],
  };
  return adaptPerfectScoreAnalysis(analysis, correctAnswers, totalQuestions, topicTitle);
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
      error: "Không kết nối được Ollama. Nếu ứng dụng chạy bằng Docker, hãy dùng OLLAMA_BASE_URL=http://host.docker.internal:11434; nếu chạy trực tiếp trên Windows, dùng http://localhost:11434. Sau khi đổi cấu hình, hãy khởi động lại ứng dụng.",
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
  const contentParagraphs = paragraphs.filter((paragraph) => !paragraph.startsWith("Chủ đề:"));
  const ranked = contentParagraphs
    .map((paragraph, index) => ({
      paragraph,
      index,
      score: topicWords.reduce((score, word) =>
        score + Math.min(3, paragraph.toLocaleLowerCase("vi").split(word).length - 1), 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 1)
    .sort((a, b) => a.index - b.index);
  if (/điện biên phủ/i.test(topic)) {
    const eventEvidence = paragraphs.filter((paragraph) => /điện biên phủ/i.test(paragraph)).join("\n\n");
    const evidence = eventEvidence || ranked.map((item) => item.paragraph).join("\n\n");
    return `${evidence}\n\nNguồn tham khảo: History.com, “Battle of Dien Bien Phu” (https://www.history.com/articles/battle-of-dien-bien-phu).`;
  }
  if (material === quizTopics.antiUsWar.material) {
    const historySections = getHistoryStudySections(topic);
    if (historySections) {
      return historySections.map(({ title, content }) => `${title}\n${content}`).join("\n\n");
    }
  }
  if (material === quizTopics.cProgramming.material) {
    const cSections = getCStudySections(topic);
    if (cSections) {
      return cSections.map((section) => [
        section.title,
        section.content,
        section.code,
        ...(section.codeNotes || []),
        section.codeOutput ? `Kết quả mong đợi:\n${section.codeOutput}` : "",
      ].filter(Boolean).join("\n")).join("\n\n");
    }
  }
  const evidence = ranked.map((item) => item.paragraph).join("\n\n") || paragraphs.slice(1, 3).join("\n\n");
  return evidence;
}

function getCStudySections(topic) {
  const topicText = topic.toLocaleLowerCase("vi");
  if (/thư viện chuẩn|standard librar/.test(topicText)) {
    return [
      {
        title: "Thư viện chuẩn cung cấp gì?",
        content: "Thư viện chuẩn C cung cấp các hàm đã được định nghĩa cho những việc phổ biến như nhập/xuất, xử lý chuỗi và cấp phát bộ nhớ. Mỗi header như stdio.h, string.h hoặc stdlib.h khai báo giao diện cần dùng; chỉ thị #include giúp trình biên dịch biết cách gọi hàm. Phần cài đặt hàm được cung cấp bởi thư viện khi liên kết chương trình, không phải do #include tự chạy.",
      },
      {
        title: "Ví dụ chạy được: chọn đúng header và gọi hàm",
        content: "Ví dụ dùng strlen từ string.h, abs từ stdlib.h và printf từ stdio.h. Mỗi hàm được khai báo bởi header tương ứng; kết quả được in ra sau khi các hàm trả về.",
        code: `#include <stdio.h>
#include <string.h>
#include <stdlib.h>

int main(void) {
    const char course[] = "C";
    size_t length = strlen(course);
    int difference = abs(7 - 10);

    printf("Mon %s co %zu ky tu; |7-10| = %d\\n",
           course, length, difference);
    return 0;
}`,
        codeNotes: [
          "#include <stdio.h> khai báo printf; string.h khai báo strlen; stdlib.h khai báo abs.",
          "strlen đếm ký tự trước '\\0' và trả về size_t; biến length dùng đúng kiểu cho độ dài.",
          "abs(7 - 10) tính trị tuyệt đối của hiệu số nguyên, cho kết quả 3.",
          "Header cung cấp khai báo để biên dịch kiểm tra cách gọi; linker kết nối phần cài đặt thư viện khi tạo chương trình.",
        ],
        codeOutput: "Mon C co 1 ky tu; |7-10| = 3",
      },
      {
        title: "Cách chọn thư viện và lỗi thường gặp",
        content: "Hãy tìm hàm cần dùng, tra header chuẩn khai báo hàm đó, thêm header tương ứng rồi kiểm tra kiểu tham số và giá trị trả về. Thiếu header có thể khiến lời gọi hàm không được khai báo đúng; dùng sai định dạng printf hoặc bỏ qua giá trị trả về có thể gây lỗi. Không nhầm header với toàn bộ phần cài đặt của thư viện.",
      },
    ];
  }
  if (/cấu trúc chương trình/.test(topicText)) {
    return [
      {
        title: "Một chương trình C bắt đầu và kết thúc ra sao?",
        content: "Mã nguồn C được biên dịch thành chương trình thực thi. Khi chạy, chương trình bắt đầu từ hàm main; các lệnh trong main chạy theo thứ tự từ trên xuống, trừ khi rẽ nhánh hoặc gọi hàm khác. Dấu ngoặc nhọn tạo khối lệnh, còn dấu chấm phẩy kết thúc phần lớn câu lệnh.",
      },
      {
        title: "Ví dụ C hoàn chỉnh: từ thư viện đến kết quả",
        content: "Đây là chương trình tối thiểu có thể biên dịch. Hãy lần theo thứ tự: khai báo thư viện, vào main, tạo dữ liệu, gọi printf, rồi trả mã kết thúc.",
        code: `#include <stdio.h>

int main(void) {
    int first = 4;
    int second = 7;
    int sum = first + second;

    printf("Tong = %d\\n", sum);
    return 0;
}`,
        codeNotes: [
          "#include <stdio.h> cho phép dùng printf để xuất ra màn hình.",
          "int main(void) là điểm bắt đầu của chương trình; int là kiểu giá trị kết thúc mà main trả về.",
          "Các lệnh tạo biến và tính tổng chạy theo thứ tự; mỗi lệnh kết thúc bằng dấu chấm phẩy.",
          "printf hiển thị kết quả; return 0 báo chương trình kết thúc bình thường.",
        ],
        codeOutput: "Tong = 11",
      },
      {
        title: "Sơ đồ đọc mã và lỗi người mới hay gặp",
        content: "Hãy nhìn chương trình như một luồng: nạp khai báo cần thiết → bắt đầu tại main → thực hiện câu lệnh → trả kết quả/kết thúc. Thiếu dấu chấm phẩy hoặc ngoặc nhọn cân bằng thường là lỗi cú pháp; đặt phép tính sai nhưng chương trình vẫn biên dịch là lỗi logic. #include không phải lệnh chạy trong main mà là chỉ thị xử lý trước khi biên dịch.",
      },
    ];
  }
  if (/struct|cấu trúc dữ liệu/.test(topicText)) {
    return [
      {
        title: "Struct là gì, và vì sao cần dùng?",
        content: "Một biến int chỉ giữ một giá trị, nhưng một hồ sơ học sinh gồm tên, tuổi và điểm. Nếu tách thành nhiều mảng song song, rất dễ ghép nhầm tên của người này với điểm của người khác. struct định nghĩa một kiểu mới gom các trường có liên quan thành một bản ghi; bản thân định nghĩa là khuôn mẫu, còn biến struct là một hồ sơ cụ thể.",
      },
      {
        title: "Ví dụ C hoàn chỉnh: tạo và đọc một hồ sơ",
        content: "Chương trình tạo một học sinh, in các trường trực tiếp bằng dấu chấm, rồi đọc trường qua con trỏ bằng mũi tên. Đây là ví dụ C11/C17, không cần nhập dữ liệu từ bàn phím.",
        code: `#include <stdio.h>

typedef struct {
    char name[32];
    int age;
    float score;
} Student;

int main(void) {
    Student student = { .name = "An", .age = 18, .score = 8.5f };
    const Student *record = &student;

    printf("%s, %d tuoi\\n", student.name, student.age);
    printf("Diem: %.1f\\n", record->score);
    return 0;
}`,
        codeNotes: [
          "typedef struct { ... } Student; định nghĩa một kiểu Student gồm ba trường; typedef cho phép viết Student thay vì struct Student.",
          "Student student = { ... }; tạo một đối tượng cụ thể và khởi tạo các trường ngay từ đầu.",
          "student.name dùng dấu chấm vì student là biến struct; record->score dùng mũi tên vì record là con trỏ tới struct.",
          "const Student *record chỉ cho phép đọc hồ sơ qua con trỏ; record trỏ tới cùng đối tượng student, không tạo bản sao.",
        ],
        codeOutput: "An, 18 tuoi\nDiem: 8.5",
      },
      {
        title: "Ý nghĩa thực tế và điều cần nhớ",
        content: "Trong chương trình thật, struct hữu ích để biểu diễn một thực thể có nhiều thuộc tính: sản phẩm (mã, tên, giá), điểm số (môn, điểm), hoặc một điểm tọa độ (x, y). Khi cần quản lý nhiều bản ghi cùng dạng, có thể tạo mảng Student students[30]; mỗi phần tử là một hồ sơ riêng. struct giúp dữ liệu đi cùng nhau và dễ truyền cho hàm, nhưng không tự kiểm tra dữ liệu hợp lệ; chương trình vẫn phải kiểm tra điểm, tuổi và giới hạn mảng.",
      },
    ];
  }
  if (/con trỏ|pointer/.test(topicText)) {
    return [
      { title: "Con trỏ giữ địa chỉ, không phải giá trị thay thế", content: "Một biến int score giữ điểm số. Con trỏ int *pointer giữ địa chỉ của biến đó. Toán tử & lấy địa chỉ; toán tử * truy cập giá trị ở địa chỉ ấy. Chỉ giải tham chiếu con trỏ đã được gán tới một đối tượng còn tồn tại." },
      {
        title: "Ví dụ chạy được: đọc và sửa qua con trỏ",
        content: "Ví dụ cho thấy biến gốc đổi giá trị khi ta ghi vào *pointer.",
        code: `#include <stdio.h>

int main(void) {
    int score = 8;
    int *pointer = &score;
    *pointer = 9;
    printf("score = %d\\n", score);
    return 0;
}`,
        codeNotes: ["&score lấy địa chỉ của score.", "pointer nhận địa chỉ đó; *pointer là chính giá trị score tại địa chỉ ấy.", "Gán *pointer = 9 thay đổi score, nên kết quả in ra là 9."],
        codeOutput: "score = 9",
      },
      { title: "Dùng khi nào?", content: "Con trỏ thường được dùng để cho hàm sửa dữ liệu của nơi gọi, duyệt mảng và quản lý bộ nhớ động. Không dùng con trỏ chưa khởi tạo, đã free, hoặc trỏ tới biến cục bộ đã hết vòng đời." },
    ];
  }
  if (/hàm/.test(topicText)) {
    return [
      { title: "Hàm giải quyết vấn đề gì?", content: "Hàm đóng gói một nhiệm vụ có tên và ranh giới rõ ràng. Thay vì chép phép tính ở nhiều nơi, ta viết một lần, gọi lại khi cần và kiểm thử riêng." },
      {
        title: "Ví dụ chạy được: nhận đầu vào và trả kết quả",
        content: "Hàm add nhận hai số nguyên, tính tổng và trả kết quả cho main.",
        code: `#include <stdio.h>

int add(int left, int right) {
    return left + right;
}

int main(void) {
    int total = add(4, 7);
    printf("Tong = %d\\n", total);
    return 0;
}`,
        codeNotes: ["int add(int left, int right) khai báo kiểu trả về và kiểu của từng tham số.", "return left + right trả kết quả về nơi gọi; C truyền đối số theo giá trị.", "main lưu giá trị trả về vào total rồi mới in."],
        codeOutput: "Tong = 11",
      },
      { title: "Ý nghĩa khi tổ chức chương trình", content: "Tách hàm theo nhiệm vụ giúp chương trình dễ đọc, kiểm thử và sửa đổi. Hàm chỉ thay đổi biến của bên gọi khi ta truyền địa chỉ qua con trỏ; truyền một int thông thường chỉ tạo bản sao cho tham số." },
    ];
  }
  if (/mảng|chuỗi/.test(topicText)) {
    return [
      { title: "Mảng là dãy phần tử cùng kiểu", content: "Mảng giữ nhiều giá trị cùng kiểu dưới một tên. Chỉ số bắt đầu từ 0, nên mảng có 3 phần tử có chỉ số hợp lệ 0, 1, 2; C không tự kiểm tra biên khi truy cập." },
      {
        title: "Ví dụ chạy được: tính tổng bằng vòng lặp",
        content: "Biến count cho biết số phần tử; vòng lặp chỉ đọc chỉ số nhỏ hơn count.",
        code: `#include <stdio.h>

int main(void) {
    int scores[] = {7, 8, 10};
    int count = (int)(sizeof scores / sizeof scores[0]);
    int total = 0;

    for (int i = 0; i < count; i++) {
        total += scores[i];
    }
    printf("Tong = %d\\n", total);
    return 0;
}`,
        codeNotes: ["scores[0] là 7; phần tử đầu tiên có chỉ số 0.", "sizeof scores / sizeof scores[0] tính số phần tử khi scores vẫn là mảng trong phạm vi này.", "Điều kiện i < count giữ chỉ số trong khoảng hợp lệ."],
        codeOutput: "Tong = 25",
      },
      { title: "Chuỗi trong C", content: "Chuỗi C là mảng char kết thúc bằng ký tự '\\0'. Bộ đệm phải có chỗ cho ký tự kết thúc; luôn giới hạn số ký tự được ghi/đọc và không truy cập vượt kích thước mảng." },
    ];
  }
  if (/cấu trúc điều khiển|vòng lặp|rẽ nhánh/.test(topicText)) {
    return [
      { title: "Điều khiển đường đi của chương trình", content: "if/else chọn nhánh theo điều kiện; vòng lặp thực hiện lại một khối lệnh. Trước khi chạy, xác định điều kiện đúng/sai và biến nào thay đổi để vòng lặp có thể dừng." },
      {
        title: "Ví dụ chạy được: phân loại và lặp qua các số",
        content: "Chương trình quyết định kết quả theo điểm, sau đó dùng for để cộng các số từ 1 đến 4.",
        code: `#include <stdio.h>

int main(void) {
    int score = 8;
    if (score >= 5) {
        puts("Dat");
    } else {
        puts("Can hoc them");
    }

    int sum = 0;
    for (int i = 1; i <= 4; i++) {
        sum += i;
    }
    printf("Tong = %d\\n", sum);
    return 0;
}`,
        codeNotes: ["if chọn đúng một nhánh; với score = 8, điều kiện score >= 5 đúng.", "for khởi tạo i một lần, kiểm tra điều kiện trước mỗi lượt, rồi tăng i.", "Khi i thành 5, điều kiện i <= 4 sai nên vòng lặp dừng."],
        codeOutput: "Dat\nTong = 10",
      },
      { title: "Lỗi thường gặp", content: "Quên cập nhật biến điều khiển có thể tạo vòng lặp vô hạn. Dùng = thay cho == trong điều kiện cũng làm đổi giá trị ngoài ý muốn; hãy kiểm tra điều kiện, cập nhật và điểm dừng cùng nhau." },
    ];
  }
  if (/biến|kiểu dữ liệu/.test(topicText)) {
    return [
      { title: "Kiểu dữ liệu quyết định cách hiểu giá trị", content: "Biến có tên, kiểu và giá trị. int phù hợp với số nguyên; float/double biểu diễn số thực; char lưu ký tự. Chọn kiểu theo dữ liệu cần biểu diễn và kiểm tra giới hạn trước khi tính toán." },
      {
        title: "Ví dụ chạy được: khai báo và tính toán",
        content: "Phép chia hai số nguyên cho kết quả nguyên; đổi một toán hạng sang double nếu cần phần thập phân.",
        code: `#include <stdio.h>

int main(void) {
    int completed = 7;
    int total = 2;
    double average = (double)completed / total;
    printf("Trung binh = %.2f\\n", average);
    return 0;
}`,
        codeNotes: ["completed và total là int nên lưu số nguyên.", "(double)completed chuyển phép tính sang số thực trước khi chia.", "%.2f in hai chữ số sau dấu thập phân."],
        codeOutput: "Trung binh = 3.50",
      },
      { title: "Ý nghĩa thực tế", content: "Chọn sai kiểu có thể làm mất phần thập phân hoặc vượt giới hạn biểu diễn. Không giả định kích thước mọi kiểu giống nhau trên mọi môi trường; dùng sizeof khi chương trình cần biết kích thước thực tế." },
    ];
  }
  if (/bộ nhớ động|malloc|calloc/.test(topicText)) {
    return [
      { title: "Khi nào cần bộ nhớ động?", content: "Dùng bộ nhớ động khi kích thước dữ liệu chỉ biết lúc chạy hoặc cần sống ngoài phạm vi khai báo cục bộ. malloc trả về địa chỉ vùng nhớ hoặc NULL nếu cấp phát thất bại." },
      {
        title: "Ví dụ chạy được: cấp phát, dùng rồi giải phóng",
        content: "Ví dụ kiểm tra malloc trước khi ghi và gọi free đúng một lần khi dùng xong.",
        code: `#include <stdio.h>
#include <stdlib.h>

int main(void) {
    int *values = malloc(3 * sizeof *values);
    if (values == NULL) {
        return 1;
    }

    values[0] = 4;
    values[1] = 5;
    values[2] = 6;
    printf("Tong = %d\\n", values[0] + values[1] + values[2]);
    free(values);
    return 0;
}`,
        codeNotes: ["malloc cấp phát đủ chỗ cho ba int; sizeof *values bám theo kiểu con trỏ.", "Phải kiểm tra NULL trước khi sử dụng vùng nhớ.", "Sau free(values), không được đọc/ghi values; giải phóng hai lần cũng là lỗi."],
        codeOutput: "Tong = 15",
      },
      { title: "Quy tắc an toàn", content: "Mỗi vùng nhớ cấp phát cần có một đường giải phóng rõ ràng. Tránh rò rỉ bộ nhớ, dùng sau khi giải phóng và mất con trỏ duy nhất tới vùng nhớ." },
    ];
  }
  if (/tệp|file/.test(topicText)) {
    return [
      { title: "Tệp giúp dữ liệu tồn tại sau khi chương trình kết thúc", content: "FILE* đại diện cho luồng tệp. fopen mở tệp theo chế độ; luôn kiểm tra kết quả khác NULL, xử lý lỗi và đóng tệp bằng fclose." },
      {
        title: "Ví dụ chạy được: ghi một dòng vào tệp",
        content: "Chế độ w tạo tệp mới hoặc ghi đè nội dung cũ, vì vậy chỉ dùng khi hành vi đó đúng mong muốn.",
        code: `#include <stdio.h>

int main(void) {
    FILE *file = fopen("result.txt", "w");
    if (file == NULL) {
        perror("Khong mo duoc tep");
        return 1;
    }

    fprintf(file, "Diem: %d\\n", 9);
    if (fclose(file) != 0) {
        perror("Khong dong duoc tep");
        return 1;
    }
    return 0;
}`,
        codeNotes: ["fopen trả NULL nếu mở tệp thất bại; không gọi fprintf khi file là NULL.", "fprintf ghi nội dung theo định dạng vào tệp, không phải ra màn hình.", "fclose hoàn tất ghi và giải phóng tài nguyên hệ điều hành."],
        codeOutput: "Tạo result.txt với nội dung: Diem: 9",
      },
      { title: "Lưu ý khi chọn chế độ", content: "w ghi đè, a nối thêm và r đọc tệp đã có. Chọn sai chế độ có thể làm mất dữ liệu; kiểm tra lỗi khi mở, đọc/ghi và đóng tệp." },
    ];
  }
  return null;
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

function createStudyLesson({
  topic,
  material,
  results,
  stage,
  remediationIndex = 0,
  remediationContent = "",
}) {
  const relatedResults = results.filter((item) => item.topic === topic);
  const incorrectResult = relatedResults.find((item) => !item.correct);
  const correctResult = relatedResults.find((item) => item.correct);
  const evidence = remediationContent || getStudyEvidence(material, topic);
  let sections = evidence
    .split(/(?<=[.!?])\s+/u)
    .filter(Boolean)
    .reduce((groups, sentence) => {
      const lastGroup = groups.at(-1);
      if (!lastGroup || lastGroup.sentences.length >= 3) {
        groups.push({ sentences: [sentence] });
      } else {
        lastGroup.sentences.push(sentence);
      }
      return groups;
    }, [])
    .map((group, index) => ({
      title: index === 0 ? "Nội dung trọng tâm" : `Chi tiết cần nhớ ${index}`,
      content: group.sentences.join(" "),
    }));
  if (material === quizTopics.cProgramming.material && !remediationContent) {
    sections = getCStudySections(topic) || sections;
  } else if (material === quizTopics.antiUsWar.material && !remediationContent) {
    sections = getHistoryStudySections(topic) || sections;
  }
  const retryPrompt = remediationIndex === 0
    ? ""
    : remediationIndex % 2 === 1
      ? ` Hãy thử lại bằng một câu hỏi tình huống mới về "${topic}", yêu cầu người học giải thích mối liên hệ giữa các dữ kiện thay vì lặp lại câu hỏi trước.`
      : ` Hãy đổi cách kiểm tra: yêu cầu người học so sánh hai ý quan trọng của "${topic}" và nêu bằng chứng trong phần học để bảo vệ lựa chọn.`;

  if (stage.phase === "foundation") {
    return {
      title: `Củng cố nền tảng: ${topic}`,
      theory: `Mình cùng học từng phần theo đúng thứ tự nhé. Trước hết hãy nắm nội dung trọng tâm, sau đó nối dữ kiện với kết quả. Nếu có chỗ chưa rõ, bạn có thể hỏi riêng trong phạm vi bài này.\n\n${evidence}\n\n${getStudyAnalogy(topic)}`,
      sections,
      practiceQuestion: remediationIndex > 0
        ? `Câu hỏi ôn lại ${remediationIndex}: ${topic} — ${getStudyAnalogy(topic)} Hãy giải thích bằng lời của bạn một nguyên tắc quan trọng và nêu dữ kiện trong bài làm căn cứ.${retryPrompt}`
        : incorrectResult
        ? `Không nhìn lại câu trả lời cũ: hãy giải thích nguyên tắc cần dùng cho câu “${incorrectResult.question}” bằng lời của bạn, rồi tự nêu một ví dụ khác để minh họa.`
        : `Hãy trình bày ${topic} bằng lời của bạn, nêu một đặc điểm hoặc quy tắc quan trọng và tự đưa ra một ví dụ để minh họa.`,
    };
  }

  if (stage.phase === "practice") {
    return {
      title: `Luyện tập vận dụng: ${topic}`,
      theory: `Mình sẽ cùng bạn vận dụng kiến thức vào tình huống mới. Hãy giải thích cách suy nghĩ của bạn từng bước; mình sẽ phản hồi cụ thể vào lập luận đó.\n\nÝ cần vận dụng: ${evidence}\n\nTình huống để hình dung: ${getStudyAnalogy(topic)}`,
      sections,
      practiceQuestion: remediationIndex > 0
        ? `Câu hỏi ôn lại ${remediationIndex}: hãy tự tạo một tình huống mới về "${topic}", giải quyết theo từng bước và chỉ rõ dữ kiện nào trong phần học hỗ trợ kết luận.${retryPrompt}`
        : incorrectResult
        ? `Hãy tự tạo một tình huống hoặc ví dụ mới về “${topic}” có liên quan đến câu “${incorrectResult.question}”, giải quyết tình huống đó theo từng bước và giải thích vì sao cách làm của bạn đúng.`
        : `Hãy áp dụng kiến thức về “${topic}” vào một tình huống hoặc ví dụ mới. Trình bày từng bước và giải thích vì sao cách làm của bạn hợp lý.`,
    };
  }

  return {
    title: `Thử thách nâng cao: ${topic}`,
    theory: `${correctResult ? `Bạn đã làm tốt câu “${correctResult.question}”, vì vậy mình sẽ bỏ qua phần nhập môn và tăng độ thử thách nhé.` : "Mình sẽ cùng bạn kết nối kiến thức và xử lý một tình huống mới."} Hãy xem nguyên tắc bạn đã nắm như công cụ để suy luận:\n\n${evidence}\n\nMục tiêu là giải thích được vì sao cách áp dụng hiệu quả.`,
    sections,
    practiceQuestion: remediationIndex > 0
      ? `Câu hỏi ôn lại ${remediationIndex}: liên hệ "${topic}" với một ý khác trong bài. Nêu một trường hợp có thể làm thay đổi kết luận và dùng dữ kiện đã học để giải thích.${retryPrompt}`
      : correctResult
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
  } else if (topicId === "antiUsWar" && /gen[eèê]ve/.test(topicText)) {
    questions = [
      { question: "Hiệp định Genève về Đông Dương được ký vào năm nào?", options: ["1954", "1960", "1968", "1973"], answerIndex: 0 },
      { question: "Giới tuyến quân sự gần vĩ tuyến 17 theo Hiệp định Genève có ý nghĩa gì?", options: ["Phân chia vùng tập kết quân sự tạm thời, không phải biên giới quốc gia vĩnh viễn", "Biên giới quốc gia vĩnh viễn của Việt Nam", "Ranh giới giữa Việt Nam và Lào", "Tuyến đường rút quân Hoa Kỳ năm 1973"], answerIndex: 0 },
      { question: "Hiệp định Genève dự kiến điều gì để thống nhất Việt Nam?", options: ["Tổng tuyển cử năm 1956", "Tổng tuyển cử năm 1976", "Ký Hiệp định Paris năm 1954", "Chiến dịch Hồ Chí Minh năm 1956"], answerIndex: 0 },
    ];
  } else if (topicId === "antiUsWar" && /tết 1968|mậu thân|tổng tiến công.*tết/.test(topicText)) {
    questions = [
      { question: "Tổng tiến công và nổi dậy Tết Mậu Thân diễn ra vào năm nào?", options: ["1968", "1954", "1973", "1975"], answerIndex: 0 },
      { question: "Đặc điểm nổi bật về phạm vi của cuộc Tổng tiến công Tết Mậu Thân là gì?", options: ["Diễn ra ở nhiều đô thị và địa bàn tại miền Nam", "Chỉ diễn ra tại Điện Biên Phủ", "Chỉ là một cuộc đàm phán ở Paris", "Diễn ra sau ngày chiến tranh kết thúc"], answerIndex: 0 },
      { question: "Nhận định nào phân biệt đúng kết quả và tác động của Tết Mậu Thân?", options: ["Không đạt mọi mục tiêu quân sự dự kiến nhưng tạo tác động chính trị, truyền thông sâu rộng", "Đạt mọi mục tiêu quân sự và kết thúc chiến tranh ngay năm 1968", "Chỉ có tác động ở một địa phương, không ảnh hưởng tranh luận", "Là hiệp định quy định quân đội Hoa Kỳ rút năm 1973"], answerIndex: 0 },
    ];
  } else if (topicId === "antiUsWar" && /hiệp định paris|paris/.test(topicText)) {
    questions = [
      { question: "Hiệp định Paris về Việt Nam được ký vào ngày nào?", options: ["27/1/1973", "7/5/1954", "30/4/1975", "2/9/1945"], answerIndex: 0 },
      { question: "Điều gì đúng về hệ quả của Hiệp định Paris?", options: ["Quân đội Hoa Kỳ rút khỏi Việt Nam, nhưng xung đột giữa các lực lượng Việt Nam còn tiếp diễn", "Chiến tranh tại miền Nam kết thúc ngay trong ngày ký", "Việt Nam thống nhất nhà nước ngay năm 1973", "Hiệp định được ký sau ngày 30/4/1975"], answerIndex: 0 },
      { question: "Sau khi quân đội Hoa Kỳ rút theo Hiệp định Paris, điều gì tiếp tục diễn ra?", options: ["Xung đột giữa các lực lượng Việt Nam", "Chiến tranh tại miền Nam kết thúc ngay", "Tổng tuyển cử năm 1956 được tổ chức", "Chiến dịch Điện Biên Phủ bắt đầu"], answerIndex: 0 },
    ];
  } else if (topicId === "antiUsWar" && getHistoryEventKey(topic) === "endWar") {
    questions = [
      { question: "Chiến dịch Hồ Chí Minh bắt đầu vào ngày nào?", options: ["26/4/1975", "27/1/1973", "7/5/1954", "10/3/1968"], answerIndex: 0 },
      { question: "Sự kiện nào gắn với ngày 30/4/1975?", options: ["Lực lượng tiến công tiến vào Sài Gòn và Tổng thống Dương Văn Minh tuyên bố đầu hàng", "Hiệp định Paris được ký", "Phong trào Đồng Khởi bùng lên ở Bến Tre", "Hiệp định Genève được ký"], answerIndex: 0 },
      { question: "Việc thống nhất nhà nước Việt Nam được thực hiện vào năm nào?", options: ["1976", "1973", "1968", "1954"], answerIndex: 0 },
    ];
  } else if (topicId === "antiUsWar") {
    questions = [
      { question: "Mốc nào gắn với việc Hiệp định Genève được ký?", options: ["Năm 1954", "Năm 1960", "Năm 1968", "Năm 1975"], answerIndex: 0 },
      { question: "Mốc nào đánh dấu chiến tranh kết thúc tại miền Nam Việt Nam?", options: ["30/4/1975", "27/1/1973", "7/5/1954", "Năm 1960"], answerIndex: 0 },
      { question: "Nhận định nào phân biệt đúng Hiệp định Paris và mốc kết thúc chiến tranh?", options: ["Paris ký năm 1973, chiến tranh tại miền Nam kết thúc năm 1975", "Paris ký ngày 30/4/1975 và kết thúc chiến tranh", "Paris ký năm 1954, trước Hiệp định Genève", "Hai mốc cùng diễn ra vào năm 1968"], answerIndex: 0 },
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
  } else if (topicId === "cProgramming" && /cấu trúc chương trình/.test(topicText)) {
    questions = [
      { question: "Hàm nào là điểm bắt đầu thực thi của một chương trình C thông thường?", options: ["main", "printf", "include", "sizeof"], answerIndex: 0 },
      { question: "Vai trò của #include <stdio.h> trong ví dụ dùng printf là gì?", options: ["Khai báo giao diện thư viện nhập/xuất chuẩn", "Bắt đầu vòng lặp", "Cấp phát bộ nhớ cho sum", "Kết thúc hàm main"], answerIndex: 0 },
      { question: "Trong chương trình mẫu, return 0 thường biểu thị điều gì?", options: ["Chương trình kết thúc bình thường", "Phép cộng cho kết quả bằng 0", "Bắt đầu đọc đầu vào", "Khai báo biến kiểu int"], answerIndex: 0 },
    ];
  } else if (topicId === "cProgramming" && /thư viện chuẩn|standard librar/.test(topicText)) {
    questions = [
      { question: "Header nào khai báo printf trong C?", options: ["stdio.h", "string.h", "stdlib.h", "ctype.h"], answerIndex: 0 },
      { question: "Header string.h thường khai báo hàm nào trong ví dụ bài học?", options: ["strlen", "malloc", "printf", "fopen"], answerIndex: 0 },
      { question: "Vai trò chính của header khi gọi hàm thư viện là gì?", options: ["Cung cấp khai báo để trình biên dịch kiểm tra cách gọi hàm", "Tự chạy hàm ngay khi chương trình bắt đầu", "Thay thế hoàn toàn bước liên kết", "Tạo giá trị trả về mà không cần gọi hàm"], answerIndex: 0 },
    ];
  } else if (topicId === "cProgramming" && /biến|kiểu dữ liệu/.test(topicText)) {
    questions = [
      { question: "Kiểu int thường dùng để biểu diễn loại giá trị nào?", options: ["Số nguyên", "Chuỗi ký tự C", "Địa chỉ web", "Tệp đang mở"], answerIndex: 0 },
      { question: "Nếu chia hai int và cần kết quả có phần thập phân, cần làm gì?", options: ["Chuyển ít nhất một toán hạng sang kiểu số thực trước khi chia", "Dùng thêm dấu chấm phẩy", "Đổi tên biến", "Dùng toán tử địa chỉ &"], answerIndex: 0 },
      { question: "sizeof cho biết điều gì?", options: ["Kích thước tính bằng byte trên môi trường đang chạy", "Giá trị lớn nhất mọi kiểu trên mọi hệ thống", "Số dòng của chương trình", "Địa chỉ tệp thực thi"], answerIndex: 0 },
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
  } else if (topicId === "cProgramming" && /struct|cấu trúc dữ liệu/.test(topicText)) {
    questions = [
      { question: "struct hữu ích nhất khi nào?", options: ["Khi cần gom các trường có liên quan, có thể khác kiểu, thành một bản ghi", "Khi cần tự động kiểm tra biên mảng", "Khi muốn mọi biến có cùng một giá trị", "Khi cần thay thế mọi hàm"], answerIndex: 0 },
      { question: "Với biến Student student, cách nào truy cập trường age?", options: ["student.age", "student->age", "student&age", "student*age"], answerIndex: 0 },
      { question: "Nếu Student *record là con trỏ hợp lệ tới struct, cách nào truy cập score?", options: ["record->score", "record.score", "record&score", "record*score"], answerIndex: 0 },
    ];
  } else if (topicId === "cProgramming" && /bộ nhớ động|malloc|calloc/.test(topicText)) {
    questions = [
      { question: "malloc có thể trả về giá trị nào khi cấp phát thất bại?", options: ["NULL", "Luôn trả về địa chỉ hợp lệ", "Số byte đã cấp phát", "Ký tự '\\0'"], answerIndex: 0 },
      { question: "Cần làm gì trước khi dùng vùng nhớ trả về từ malloc?", options: ["Kiểm tra con trỏ khác NULL", "Gọi free hai lần", "Ép địa chỉ thành int", "Đóng stdin"], answerIndex: 0 },
      { question: "Sau khi gọi free(pointer), điều nào đúng?", options: ["Không được tiếp tục truy cập vùng nhớ đó", "Có thể đọc mãi không giới hạn", "Vùng nhớ tự biến thành mảng", "Phải gọi free lần hai"], answerIndex: 0 },
    ];
  } else if (topicId === "cProgramming" && /tệp|file/.test(topicText)) {
    questions = [
      { question: "Nếu fopen thất bại, giá trị trả về cần kiểm tra là gì?", options: ["NULL", "EOF luôn luôn", "0 ký tự trong tệp", "Một chuỗi rỗng"], answerIndex: 0 },
      { question: "Chế độ fopen \"a\" thường có nghĩa gì?", options: ["Nối thêm dữ liệu vào cuối tệp", "Ghi đè nội dung cũ", "Xóa tệp và chỉ đọc", "Đóng tệp ngay lập tức"], answerIndex: 0 },
      { question: "Sau khi thao tác xong với FILE*, nên gọi hàm nào?", options: ["fclose", "free", "sizeof", "continue"], answerIndex: 0 },
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
    explanation: topicId === "cProgramming" && /thư viện chuẩn|standard librar/.test(topicText)
      ? "Mỗi header chuẩn khai báo giao diện các hàm liên quan: stdio.h khai báo printf, string.h khai báo strlen và stdlib.h khai báo abs. #include giúp biên dịch biết cách gọi; phần cài đặt được thư viện cung cấp khi liên kết."
      : topicId === "cProgramming" && /cấu trúc chương trình/.test(topicText)
      ? "Chương trình bắt đầu thực thi từ main. #include <stdio.h> khai báo giao diện printf; câu lệnh trong main chạy theo thứ tự, dấu chấm phẩy kết thúc câu lệnh và return 0 báo kết thúc bình thường."
      : topicId === "cProgramming" && /struct|cấu trúc dữ liệu/.test(topicText)
      ? "struct định nghĩa một kiểu bản ghi gồm các trường có liên quan. Biến struct truy cập trường bằng dấu chấm; con trỏ struct dùng mũi tên, tương đương (*record).field. Kiểu này giúp dữ liệu cùng một thực thể được quản lý và truyền đi cùng nhau."
      : topicId === "antiUsWar" && /gen[eèê]ve/.test(topicText)
      ? "Hiệp định Genève được ký năm 1954; giới tuyến gần vĩ tuyến 17 là ranh giới tập kết quân sự tạm thời, không phải biên giới quốc gia vĩnh viễn. Hiệp định dự kiến tổng tuyển cử năm 1956 nhưng cuộc bầu cử không diễn ra như dự kiến."
      : topicId === "antiUsWar" && /đồng khởi|bến tre/.test(topicText)
      ? "Đồng Khởi tiêu biểu ở Bến Tre năm 1960, là phong trào đấu tranh rộng ở miền Nam với sự kết hợp đấu tranh chính trị và lực lượng vũ trang, không phải một trận đánh riêng lẻ."
      : topicId === "antiUsWar" && /tết 1968|mậu thân|tổng tiến công.*tết/.test(topicText)
      ? "Tết Mậu Thân diễn ra đầu năm 1968 trên nhiều đô thị và địa bàn ở miền Nam. Cuộc tiến công không đạt mọi mục tiêu quân sự dự kiến nhưng tạo tác động chính trị và truyền thông sâu rộng."
      : topicId === "antiUsWar" && /hiệp định paris|paris/.test(topicText)
      ? "Hiệp định Paris được ký ngày 27/1/1973 và quy định việc quân đội Hoa Kỳ rút khỏi Việt Nam. Xung đột giữa các lực lượng Việt Nam vẫn tiếp diễn, nên không thể coi đây là mốc kết thúc chiến tranh."
      : topicId === "antiUsWar" && getHistoryEventKey(topic) === "endWar"
      ? "Chiến dịch Hồ Chí Minh bắt đầu ngày 26/4/1975; ngày 30/4, lực lượng tiến công tiến vào Sài Gòn và Tổng thống Dương Văn Minh tuyên bố đầu hàng. Chiến tranh kết thúc tại miền Nam năm 1975; thống nhất nhà nước thực hiện năm 1976."
      : topicId === "antiUsWar" && /điện biên phủ/.test(topicText)
      ? `Điện Biên Phủ là chiến dịch lớn trong kháng chiến chống Pháp, diễn ra từ 13/3 đến 7/5/1954. Pháp xây dựng tập đoàn cứ điểm ở lòng chảo để giữ Tây Bắc và buộc Việt Minh giao chiến theo cách họ kỳ vọng có lợi. Phía Việt Minh tổ chức bao vây, bảo đảm vận chuyển hậu cần qua địa hình núi rừng, đưa pháo vào trận địa và tiến công theo từng đợt. Giao tranh mở màn ở các cứ điểm phía bắc, tiếp diễn quanh các cao điểm phía đông, rồi bước vào tổng công kích từ 1/5 đến 7/5. Ngày 7/5, sở chỉ huy tập đoàn cứ điểm bị đánh chiếm. Thất bại của Pháp tại đây góp phần quyết định vào bối cảnh dẫn tới đàm phán và Hiệp định Genève tháng 7/1954.`
      : topicId === "antiUsWar"
      ? "Gắn từng sự kiện với mốc riêng: Genève năm 1954, Đồng Khởi năm 1960, Tết Mậu Thân năm 1968, Paris năm 1973 và chiến tranh kết thúc tại miền Nam năm 1975. Không chuyển kết quả hay ngày tháng của sự kiện này sang sự kiện khác."
      : `Đáp án được xác định bằng cách đối chiếu câu hỏi với tài liệu về ${topic}. Hãy chú ý dữ kiện then chốt, điều kiện và mối liên hệ giữa các ý; đó là cơ sở để chọn phương án thay vì đoán.`,
    example: topicId === "cProgramming" && /thư viện chuẩn|standard librar/.test(topicText)
      ? "Trong ví dụ, strlen(course) trả về độ dài chuỗi, abs(7 - 10) trả về 3, rồi printf in kết quả. Mỗi hàm được khai báo bởi header chuẩn tương ứng."
      : topicId === "cProgramming" && /cấu trúc chương trình/.test(topicText)
      ? "Trong ví dụ cộng hai số, CPU bắt đầu tại main, lần lượt tạo first và second, tính sum, gọi printf để in 11 rồi trả 0. Nếu thiếu #include <stdio.h>, trình biên dịch không có khai báo chuẩn cho printf."
      : topicId === "cProgramming" && /struct|cấu trúc dữ liệu/.test(topicText)
      ? "Ví dụ hồ sơ Student có thể chứa name, age và score. Với một biến student, viết student.score; nếu record là Student * trỏ tới hồ sơ đó, viết record->score. Có thể đặt nhiều hồ sơ trong Student students[30] để quản lý cả lớp."
      : topicId === "antiUsWar" && /gen[eèê]ve/.test(topicText)
      ? "Kể đúng trình tự: chiến tranh chống Pháp kết thúc năm 1954 → Hiệp định Genève được ký tháng 7/1954 → dự kiến tổng tuyển cử năm 1956 không diễn ra như dự kiến. Giới tuyến quân sự lúc đó chỉ mang tính tạm thời."
      : topicId === "antiUsWar" && /đồng khởi|bến tre/.test(topicText)
      ? "Khi trình bày Đồng Khởi, nêu Bến Tre năm 1960 là nơi tiêu biểu, sau đó giải thích phong trào lan rộng ở miền Nam và kết hợp đấu tranh chính trị với lực lượng vũ trang."
      : topicId === "antiUsWar" && /tết 1968|mậu thân|tổng tiến công.*tết/.test(topicText)
      ? "Khi đánh giá Tết Mậu Thân, tách hai ý: kết quả quân sự không đạt mọi mục tiêu dự kiến; tác động chính trị và truyền thông lại rất rộng, ảnh hưởng tới tranh luận và tiến trình đàm phán."
      : topicId === "antiUsWar" && /hiệp định paris|paris/.test(topicText)
      ? "Lập dòng thời gian: ký Hiệp định Paris 27/1/1973 → quân đội Hoa Kỳ rút theo tiến trình hiệp định → xung đột ở Việt Nam tiếp tục → chiến tranh tại miền Nam kết thúc năm 1975."
      : topicId === "antiUsWar" && getHistoryEventKey(topic) === "endWar"
      ? "Tóm tắt theo thứ tự chiến dịch Tây Nguyên → Huế–Đà Nẵng → Hồ Chí Minh (bắt đầu 26/4/1975) → ngày 30/4 tiến vào Sài Gòn và tuyên bố đầu hàng → thống nhất nhà nước năm 1976."
      : topicId === "antiUsWar" && /điện biên phủ/.test(topicText)
      ? "Ví dụ khi kể lại chiến dịch, hãy phân biệt ba lớp thông tin: mục tiêu phía Pháp (giữ tập đoàn cứ điểm và chủ động chọn nơi giao chiến), cách đánh của phía Việt Minh (bao vây, bảo đảm hậu cần, tiến công từng đợt), và kết quả ngày 7/5/1954 (sở chỉ huy bị đánh chiếm). Sau đó mới liên hệ kết quả này với sức ép đàm phán dẫn tới Hiệp định Genève tháng 7/1954."
      : topicId === "antiUsWar"
      ? "Lập một dòng thời gian gồm Genève 1954 → Đồng Khởi 1960 → Tết Mậu Thân 1968 → Paris 1973 → chiến tranh kết thúc tại miền Nam năm 1975; nêu điểm khác nhau giữa mỗi mốc."
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
  groqApiKeys,
  claudeApiKeys,
} = {}) {
  const router = express.Router();
  const ollama = createOllamaClient(baseUrl, model);
  const resolvedGroqKeys = groqApiKeys ?? claudeApiKeys ?? getGroqApiKeys();
  const groqModel = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const geminiModel = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
  const quizApiKey = process.env.QUIZAPI_IO_KEY?.includes("paste-your-quizapi")
    ? undefined
    : process.env.QUIZAPI_IO_KEY;
  let quizApiCreationForbidden = false;

  async function generateWithGemini({ system, prompt, maxTokens = 1_500 }) {
    const { response } = await fetchWithGeminiKeyFallback({
      apiKeys: geminiApiKeys,
      timeoutMs: 15_000,
      url: `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: system ? { parts: [{ text: system }] } : undefined,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: maxTokens,
            responseMimeType: "application/json",
          },
        }),
      },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(`Gemini request failed with status ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!text) throw new Error("Gemini returned no content.");
    return JSON.parse(text);
  }

  async function generateStudyJson({ system, prompt, schema, isValid, numPredict }) {
    if (resolvedGroqKeys.length) {
      try {
        const generated = await generateWithGroq({
          apiKeys: resolvedGroqKeys,
          model: groqModel,
          system,
          prompt,
          maxTokens: numPredict,
        });
        if (isValid(generated)) return { content: generated, generator: `Groq (${groqModel})` };
        throw new Error("Groq returned study content that did not match the required schema.");
      } catch (error) {
        console.error("Groq interactive study request failed:", error.message);
      }
    }

    if (geminiApiKeys.length) {
      try {
        const generated = await generateWithGemini({
          system,
          prompt,
          maxTokens: numPredict,
        });
        if (isValid(generated)) return { content: generated, generator: `Gemini (${geminiModel})` };
        throw new Error("Gemini returned study content that did not match the required schema.");
      } catch (error) {
        console.error("Gemini interactive study request failed:", error.message);
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
      generator: "Ngân hàng câu hỏi đã biên soạn",
      fallbackGenerator: "Groq, Gemini và Ollama",
      storage: "QuizAPI.io",
      prewrittenTopics: Object.keys(quizTopics),
      geminiConfigured: geminiApiKeys.length > 0,
      geminiKeyCount: geminiApiKeys.length,
      groqConfigured: resolvedGroqKeys.length > 0,
      groqKeyCount: resolvedGroqKeys.length,
      quizApiConfigured: Boolean(quizApiKey),
      ollamaAvailable: ollamaStatus.available && ollamaStatus.modelInstalled,
      ollamaModel: ollama.model,
      cloudCreationForbidden: quizApiCreationForbidden,
      ready: true,
    });
  });

  router.get("/api/quiz-ai/status", async (_req, res) => {
    res.json(await ollama.status());
  });

  router.post("/api/study-roadmap/lesson", async (req, res) => {
    const {
      topicId,
      quizResults,
      stepIndex,
      focusTopic,
      remediationIndex = 0,
      missedQuestionPhases = [],
    } = req.body || {};
    const selectedTopic = getQuizTopic(topicId);
    if (!selectedTopic) return res.status(400).json({ error: "Chủ đề lộ trình không hợp lệ." });
    const isDirectLesson = typeof focusTopic === "string"
      && studyFocusTopics[topicId]?.includes(focusTopic);
    if (focusTopic !== undefined && !isDirectLesson) {
      return res.status(400).json({ error: "Bài học đã chọn không hợp lệ." });
    }
    if (!Number.isInteger(remediationIndex) || remediationIndex < 0 || remediationIndex > 20
      || !Array.isArray(missedQuestionPhases) || missedQuestionPhases.length > 3
      || missedQuestionPhases.some((phase) => !["foundation", "practice", "advanced"].includes(phase))
      || !Array.isArray(quizResults) || (!isDirectLesson && quizResults.length < 1) || quizResults.length > 20
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
    const remediationTopic = isDirectLesson ? focusTopic : stage.topic;
    const canCreateFocusedRemediation = typeof remediationTopic === "string"
      && studyFocusTopics[topicId]?.includes(remediationTopic);
    const remediationContent = missedQuestionPhases.length && canCreateFocusedRemediation
      ? [...new Set(missedQuestionPhases)].map((phase) => {
        const missedQuestion = getStudyQuiz(topicId, remediationTopic, phase);
        return `Câu cần ôn: ${missedQuestion.question}\nÝ đúng: ${missedQuestion.options[missedQuestion.answerIndex]}\nGiải thích: ${missedQuestion.explanation}`;
      }).join("\n\n")
      : "";
    const lesson = createStudyLesson({
      topic: stage.topic,
      material: selectedTopic.material,
      results: quizResults,
      stage,
      remediationIndex,
      remediationContent,
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
    lesson.assessmentQuestions = ["foundation", "practice", "advanced"].map((phase) => {
      const question = getStudyQuiz(topicId, stage.topic, phase);
      return {
        phase,
        question: question.question,
        options: question.options,
      };
    });
    return res.json({
      ...lesson,
      stepIndex,
      totalSteps: stages.length,
      phase: stage.phase,
      focusTopic: stage.topic,
      remediationIndex,
      missedQuestionPhases: [...new Set(missedQuestionPhases)],
      generator: "Lụa AI · mở bài tức thì",
    });
  });

  router.post("/api/study-roadmap/clarify", async (req, res) => {
    const { topicId, focusTopic, question } = req.body || {};
    const selectedTopic = getQuizTopic(topicId);
    if (!selectedTopic) return res.status(400).json({ error: "Chủ đề lộ trình không hợp lệ." });
    if (typeof focusTopic !== "string" || !studyFocusTopics[topicId]?.includes(focusTopic)
      || typeof question !== "string" || !question.trim() || question.length > 2_000) {
      return res.status(400).json({ error: "Câu hỏi hoặc nội dung bài học không hợp lệ." });
    }

    try {
      const lessonText = getStudyEvidence(selectedTopic.material, focusTopic);
      const generated = await generateStudyJson({
        system: "Bạn là gia sư đang giải đáp thắc mắc chỉ trong phạm vi một chặng học. Chỉ dùng nội dung bài học được cung cấp. Nếu câu hỏi cần kiến thức ngoài nội dung đó, không suy đoán và đặt inScope=false; answer khi đó phải hướng người học sang Chat với Lụa để tìm hiểu sâu hơn. Trả JSON tiếng Việt với inScope (boolean) và answer (tối đa 1600 ký tự).",
        prompt: `<NOI_DUNG_CHANG_HOC>\n${lessonText}\n</NOI_DUNG_CHANG_HOC>\n\nCâu hỏi của người học: ${question.trim()}\n\nChỉ đánh dấu inScope=true khi có thể trả lời trực tiếp bằng thông tin trong nội dung chặng học. Không tự bổ sung sự kiện, con số, thời điểm hoặc giả định không có trong nội dung. Nếu ngoài phạm vi hoặc thiếu căn cứ, đặt inScope=false.`,
        schema: studyClarificationSchema,
        isValid: (value) => value
          && typeof value.inScope === "boolean"
          && typeof value.answer === "string" && value.answer.trim() && value.answer.length <= 1_600,
        numPredict: 800,
      });
      return res.json({
        ...generated.content,
        generator: generated.generator,
        chatUrl: generated.content.inScope ? undefined : "/chat",
      });
    } catch (error) {
      console.error("Interactive study clarification failed:", error.message);
      return res.status(502).json({ error: "Chưa giải đáp được câu hỏi lúc này. Bạn có thể thử lại hoặc mở Chat với Lụa." });
    }
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
    const studyMaterial = isValidFocusTopic
      ? getStudyEvidence(selectedTopic.material, focusTopic)
      : selectedTopic.material;
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
          prompt: `Lần thử ${attemptNumber}/3 trong chặng "${phase}". Hãy đối chiếu tài liệu và đáp án tham chiếu để xác định chính xác lỗi trong lựa chọn sai. Không tiết lộ đáp án tham chiếu trong bất kỳ trường nào.\n\n          <TAI_LIEU>\n${studyMaterial}\n</TAI_LIEU>\n\nCâu hỏi: ${studyQuiz.question}\nLựa chọn sai của người học: ${selectedAnswer}\nĐáp án tham chiếu chỉ để bạn chẩn đoán lỗi, KHÔNG ĐƯỢC NÊU LẠI: ${correctAnswer}\nCách suy luận người học tự ghi/nói (nếu có): ${reasoning.trim() || "(không có)"}\n\nwhyWrong phải nêu cụ thể lựa chọn sai đang nhầm điều gì và vì sao không khớp câu hỏi, dựa trên tài liệu. Không đưa ra đáp án đúng dưới dạng diễn đạt lại.`,
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
${studyMaterial}
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
${studyMaterial}
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
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      return res.status(400).json({ error: "Số câu hỏi phải là số nguyên từ 1 đến 50." });
    }

    let quiz;
    let generator;
    let generationWarning;
    let questionBankSize;
    if (selectedTopic) {
      const questionPool = getPrewrittenQuizPool(topicId);
      questionBankSize = questionPool.length;
      if (count > questionPool.length) {
        return res.status(422).json({
          error: `Chủ đề này hiện có ${questionPool.length} câu đã biên soạn; chưa thể tạo bài ${count} câu mà không lặp câu hỏi.`,
        });
      }
      quiz = shuffleQuizQuestions(questionPool).slice(0, count);
      generator = "Ngân hàng câu hỏi đã biên soạn";
    } else if (resolvedGroqKeys.length > 0) {
      let validationErrors = [];
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const generated = await generateWithGroq({
            apiKeys: resolvedGroqKeys,
            model: groqModel,
            system: "Bạn là Quiz AI, chuyên tạo câu hỏi trắc nghiệm giáo dục bằng tiếng Việt. Chỉ kiểm tra dữ kiện được nêu rõ trong tài liệu; không bịa kiến thức. Mỗi câu có đúng 4 phương án khác nhau và chỉ một đáp án đúng; đáp án khớp chính xác một phương án, lời giải thích căn cứ tài liệu. Chỉ trả JSON object, không markdown.",
            prompt: `Tạo CHÍNH XÁC ${count} câu hỏi trắc nghiệm tiếng Việt chỉ dựa trên tài liệu. Trả về JSON dạng {"quiz":[{"question":"...","topic":"...","options":["A","B","C","D"],"answer":"A","explanation":"..."}]}. Không lặp câu hỏi.${validationErrors.length ? ` Sửa các lỗi trước: ${validationErrors.join("; ")}.` : ""}\n\n<TAI_LIEU ${selectedTopic ? `CHU_DE="${selectedTopic.title}"` : ""}>\n${sourceText.trim()}\n</TAI_LIEU>`,
            maxTokens: Math.min(4_096, 400 + count * 350),
          });
          quiz = normalizeGeneratedQuiz(generated?.quiz);
          validationErrors = getQuizValidationErrors(quiz, count);
          if (!validationErrors.length) {
            generator = `Groq (${groqModel})`;
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

    if (!quiz && !selectedTopic && geminiApiKeys.length > 0) {
      try {
        const generated = await generateWithGemini({
          system: "Bạn là Quiz AI, chuyên tạo câu hỏi trắc nghiệm giáo dục bằng tiếng Việt. Chỉ kiểm tra dữ kiện được nêu rõ trong tài liệu; không bịa kiến thức. Mỗi câu có đúng 4 phương án khác nhau và chỉ một đáp án đúng; đáp án khớp chính xác một phương án, lời giải thích căn cứ tài liệu. Chỉ trả JSON object, không markdown.",
          prompt: `Tạo CHÍNH XÁC ${count} câu hỏi trắc nghiệm tiếng Việt chỉ dựa trên tài liệu. Trả về JSON dạng {"quiz":[{"question":"...","topic":"...","options":["A","B","C","D"],"answer":"A","explanation":"..."}]}. Không lặp câu hỏi.\n\n<TAI_LIEU ${selectedTopic ? `CHU_DE="${selectedTopic.title}"` : ""}>\n${sourceText.trim()}\n</TAI_LIEU>`,
          maxTokens: Math.min(4_096, 400 + count * 350),
        });
        const candidateQuiz = normalizeGeneratedQuiz(Array.isArray(generated) ? generated : generated?.quiz);
        const validationErrors = getQuizValidationErrors(candidateQuiz, count);
        if (!validationErrors.length) {
          quiz = candidateQuiz;
          generator = `Gemini (${geminiModel})`;
          generationWarning = undefined;
        }
      } catch (error) {
        console.error("Gemini quiz generation failed:", error.message);
      }
    }

    if (!quiz && !selectedTopic) {
      try {
        quiz = await generateQuizWithOllama(ollama, count, sourceText, selectedTopic);
        generator = `Ollama (${ollama.model})`;
      } catch (error) {
        console.error("Ollama quiz fallback failed:", error.message);
        if (error.code || error.status) {
          return ollamaErrorResponse(res, error, ollama.model);
        }
        return res.status(502).json({
          error: generationWarning
            ? `${generationWarning} Ollama dự phòng thất bại: ${error.message}`
            : `Ollama không tạo được bộ câu hỏi hợp lệ: ${error.message}`,
        });
      }
    }

    let storage = "local";
    let storageWarning = selectedTopic
      ? "Bộ câu hỏi dùng ngân hàng nội bộ; chưa được lưu lên QuizAPI.io."
      : !quizApiKey
        ? "Quiz chỉ được lưu trong phiên làm bài hiện tại; chưa cấu hình QuizAPI.io để lưu lên cloud."
      : quizApiCreationForbidden
        ? "QuizAPI.io từ chối quyền tạo Quiz trên gói hiện tại; đề vẫn dùng được nhưng chưa lưu lên cloud."
        : "";
    let quizId;
    if (!selectedTopic && quizApiKey && !quizApiCreationForbidden) {
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
        ...(questionBankSize === undefined ? {} : { question_bank_size: questionBankSize }),
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

    const analysis = createImmediateQuizAnalysis({
      correctAnswers,
      totalQuestions,
      incorrectAnswers,
      topicTitle: selectedTopic?.title,
    });
    return res.json({
      success: true,
      analysis,
      verification: { status: "instant", model: "Kết quả bài làm", issues: [] },
      generator: "Quiz AI tức thì",
    });
  });

  return router;
}
