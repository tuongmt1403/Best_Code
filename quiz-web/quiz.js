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
  pythonProgramming: {
    id: "pythonProgramming",
    title: "Lập trình Python cơ bản đến ứng dụng",
    period: "Python 3.x",
    description: "Làm chủ cú pháp thụt lề, biến kiểu động, chuỗi f-string, if/for/while, List/Tuple, Dictionary/Set, hàm, xử lý ngoại lệ và lập trình hướng đối tượng.",
    material: `Chủ đề: Lập trình Python cơ bản đến ứng dụng (theo chuẩn Python 3.x).

Python là ngôn ngữ thông dịch có cú pháp sáng sủa, dùng dấu hai chấm (:) và khoảng trắng thụt đầu dòng (indentation, chuẩn PEP 8 là 4 khoảng trắng) để phân định khối lệnh thay vì cặp ngoặc nhọn. Hàm print() dùng để xuất dữ liệu ra màn hình, còn input() đọc một dòng văn bản từ bàn phím và luôn trả về kiểu chuỗi (str).

Biến trong Python không cần khai báo kiểu trước mà hoạt động như những chiếc thẻ tên (nhãn dán) gắn vào đối tượng trong bộ nhớ (kiểu dữ liệu động - dynamic typing). Các kiểu cơ bản gồm số nguyên (int), số thực (float), chuỗi ký tự (str), giá trị đúng/sai (bool: True, False) và giá trị rỗng đặc biệt None. Hàm type() cho biết kiểu của đối tượng. Cần lưu ý phép chia / luôn trả về float, phép chia lấy phần nguyên dùng //, chia lấy dư dùng %, lũy thừa dùng **. Khi nhận số từ input(), cần ép kiểu bằng int() hoặc float() trước khi tính toán.

Chuỗi (str) là kiểu dữ liệu bất biến (immutable): không thể sửa trực tiếp một ký tự tại một vị trí bằng phép gán mà phải tạo chuỗi mới. f-string (ví dụ f"Xin chào {name}") giúp chèn giá trị biến hoặc biểu thức trực tiếp vào chuỗi. Các phương thức phổ biến gồm strip(), lower(), upper(), split() và join().

Cấu trúc điều khiển dùng if, elif, else kết hợp các toán tử so sánh (==, !=, <, >, <=, >=) và logic (and, or, not). Vòng lặp for thường duyệt qua một dãy hoặc kết hợp với range(start, stop, step), trong đó giá trị stop không được bao gồm (range(1, 5) tạo ra 1, 2, 3, 4). Vòng lặp while lặp khi điều kiện còn đúng. break dừng vòng lặp, continue bỏ qua lượt hiện tại.

List (danh sách, viết trong ngoặc vuông []) lưu các phần tử có thứ tự, đánh chỉ số từ 0 (chỉ số âm -1 là phần tử cuối) và có thể thay đổi nội dung (mutable). Phép cắt lát (slicing) a[start:stop] lấy từ start đến sát stop. Cần phân biệt gán b = a (hai nhãn cùng chỉ vào một danh sách, sửa b làm a đổi theo) với tạo bản sao b = a.copy() hoặc a[:]. Tuple (ngoặc tròn ()) tương tự List nhưng bất biến (immutable), giúp bảo vệ dữ liệu cố định.

Dictionary (từ điển, viết trong ngoặc nhọn {key: value}) lưu các cặp khóa – giá trị giúp tra cứu cực nhanh theo khóa; khóa phải là kiểu bất biến và không trùng lặp. Truy cập trực tiếp bằng d[key] sẽ gây lỗi KeyError nếu khóa không tồn tại; dùng d.get(key, default) giúp lấy giá trị an toàn. Set (tập hợp) chỉ chứa các phần tử duy nhất không trùng lặp và không có thứ tự chỉ số.

Hàm trong Python được định nghĩa bằng từ khóa def, nhận tham số và trả kết quả bằng return; nếu hàm không có lệnh return (hoặc chỉ viết return trống), hàm tự động trả về None. Cần tránh dùng kiểu khả biến như danh sách rỗng làm tham số mặc định (def add(x, items=[])) vì danh sách mặc định đó được dùng chung qua nhiều lần gọi hàm; thay vào đó nên dùng None làm mặc định.

Xử lý ngoại lệ dùng khối try / except (kèm else, finally) để bắt và xử lý các lỗi khi chạy như ValueError hay ZeroDivisionError mà không làm sập chương trình. Khi làm việc với tệp tin, câu lệnh with open("data.txt", "r", encoding="utf-8") as f: (context manager) đảm bảo tệp luôn được đóng tự động ngay cả khi xảy ra lỗi.

Lập trình hướng đối tượng (OOP) dùng class để định nghĩa bản thiết kế (khuôn mẫu), phương thức khởi tạo __init__(self, ...) để thiết lập thuộc tính cho từng đối tượng (object / instance), và tham số đầu tiên self đại diện cho chính đối tượng đang gọi phương thức.`,
  },
};

function getQuizTopic(topicId) {
  return typeof topicId === "string" ? quizTopics[topicId] : undefined;
}

const studyFocusTopics = {
  antiUsWar: ["Phong trào Đồng Khởi", "Hiệp định Genève", "Chiến dịch Điện Biên Phủ", "Tết Mậu Thân", "Hiệp định Paris", "Kết thúc chiến tranh"],
  geography: ["Địa lý tự nhiên", "Địa lý dân cư", "Khí hậu"],
  cProgramming: ["Cấu trúc chương trình C", "Thư viện chuẩn", "Biến & Kiểu dữ liệu", "Cấu trúc điều khiển", "Hàm", "Mảng & Chuỗi", "Con trỏ", "Con trỏ và Hàm", "Struct", "Bộ nhớ động", "Tệp"],
  pythonProgramming: ["Cú pháp & Thụt lề Python", "Biến & Kiểu dữ liệu", "Chuỗi & f-string", "Cấu trúc điều khiển", "List & Tuple", "Dictionary & Set", "Hàm trong Python", "Xử lý ngoại lệ & Tệp", "Lập trình hướng đối tượng (OOP)"],
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
  pythonProgramming: [
    bankQuestion("Cú pháp & Thụt lề Python", "Trong Python, điều gì được dùng để phân định một khối lệnh (như bên trong if, for, def)?", "Khoảng trắng thụt đầu dòng (indentation) sau dấu hai chấm (:)", ["Cặp dấu ngoặc nhọn { }", "Từ khóa begin và end", "Dấu chấm phẩy (;) ở cuối dòng"], "Python dùng dấu hai chấm và khoảng trắng thụt lề để xác định khối lệnh."),
    bankQuestion("Cú pháp & Thụt lề Python", "Theo chuẩn phong cách PEP 8 của Python, mỗi mức thụt đầu dòng nên dùng bao nhiêu khoảng trắng?", "4 khoảng trắng", ["1 khoảng trắng", "3 khoảng trắng", "8 dấu chấm phẩy"], "Chuẩn PEP 8 khuyến nghị dùng 4 khoảng trắng cho mỗi mức thụt lề."),
    bankQuestion("Cú pháp & Thụt lề Python", "Hàm input() trong Python 3 luôn trả về dữ liệu thuộc kiểu nào?", "str (chuỗi ký tự)", ["int (số nguyên)", "float (số thực)", "bool (True/False)"], "Hàm input() luôn trả về một chuỗi ký tự (str), dù người dùng gõ chữ số."),
    bankQuestion("Cú pháp & Thụt lề Python", "Ký hiệu nào dùng để viết chú thích (comment) trên một dòng trong Python?", "Dấu thăng (#)", ["Hai dấu gạch chéo (//)", "Cặp /* ... */", "Dấu phần trăm (%)"], "Python dùng dấu # để bắt đầu chú thích trên một dòng."),
    bankQuestion("Biến & Kiểu dữ liệu", "Trong Python, phép chia một gạch chéo `7 / 2` trả về kết quả nào?", "3.5 (kiểu float)", ["3 (kiểu int)", "1 (phần dư)", "Báo lỗi TypeError"], "Toán tử `/` trong Python 3 luôn thực hiện phép chia thực và trả về float (3.5)."),
    bankQuestion("Biến & Kiểu dữ liệu", "Toán tử nào trong Python dùng để chia lấy phần nguyên (làm tròn xuống)?", "//", ["/", "%", "**"], "Toán tử `//` là phép chia lấy phần nguyên, ví dụ `7 // 2` bằng `3`."),
    bankQuestion("Biến & Kiểu dữ liệu", "Biểu thức `2 ** 3` trong Python có ý nghĩa và kết quả là gì?", "2 lũy thừa 3, kết quả bằng 8", ["2 nhân 3, kết quả bằng 6", "Khai báo con trỏ cấp 2", "Chia 2 cho 3"], "Toán tử `**` dùng để tính lũy thừa trong Python (`2 ** 3 = 8`)."),
    bankQuestion("Biến & Kiểu dữ liệu", "Hàm tích hợp nào dùng để kiểm tra kiểu dữ liệu hiện tại của một biến trong Python?", "type()", ["sizeof()", "typeof()", "strlen()"], "Hàm `type(x)` cho biết kiểu dữ liệu của đối tượng mà `x` đang gắn nhãn."),
    bankQuestion("Biến & Kiểu dữ liệu", "Hai giá trị kiểu logic (bool) chuẩn trong Python được viết đúng chính tả như thế nào?", "True và False (viết hoa chữ cái đầu)", ["true và false", "TRUE và FALSE", "1b và 0b"], "Trong Python, hai giá trị boolean phải viết hoa chữ cái đầu là `True` và `False`."),
    bankQuestion("Chuỗi & f-string", "Cú pháp f-string nào sau đây chèn đúng giá trị biến `name = \"An\"` vào chuỗi?", "f\"Xin chào {name}\"", ["\"Xin chào $name\"", "f\"Xin chào (name)\"", "str(\"Xin chào %name\")"], "f-string có chữ `f` đứng trước dấu nháy và đặt tên biến/biểu thức trong cặp ngoặc nhọn `{}`."),
    bankQuestion("Chuỗi & f-string", "Phương thức nào giúp xóa khoảng trắng thừa ở hai đầu của một chuỗi trong Python?", ".strip()", [".split()", ".join()", ".append()"], "Phương thức `.strip()` loại bỏ khoảng trắng và ký tự xuống dòng ở đầu và cuối chuỗi."),
    bankQuestion("Chuỗi & f-string", "Kết quả của `\"a,b,c\".split(\",\")` trong Python là gì?", "Danh sách ['a', 'b', 'c']", ["Chuỗi 'abc'", "Số nguyên 3", "Từ điển {'a': 'b'}"], "Phương thức `.split(\",\")` tách chuỗi theo dấu phẩy và trả về một danh sách (list) các chuỗi con."),
    bankQuestion("Cấu trúc điều khiển", "Trong Python, từ khóa nào dùng cho nhánh 'ngược lại nếu' (nằm giữa `if` và `else`)?", "elif", ["else if", "elseif", "switch"], "Python viết tắt 'else if' thành từ khóa `elif`."),
    bankQuestion("Cấu trúc điều khiển", "Các toán tử kết hợp điều kiện logic trong Python được viết bằng những từ khóa nào?", "and, or, not", ["&&, ||, !", "&, |, ~", "AND(), OR(), NOT()"], "Python dùng từ tiếng Anh tự nhiên `and`, `or`, `not` cho các phép toán logic."),
    bankQuestion("Cấu trúc điều khiển", "Hàm `list(range(2, 6))` tạo ra danh sách các số nào?", "[2, 3, 4, 5]", ["[2, 3, 4, 5, 6]", "[1, 2, 3, 4, 5, 6]", "[2, 6]"], "`range(start, stop)` bắt đầu từ `start` (2) và dừng trước khi chạm tới `stop` (6)."),
    bankQuestion("List & Tuple", "Với danh sách `nums = [10, 20, 30, 40]`, biểu thức `nums[-1]` trả về giá trị nào?", "40 (phần tử cuối cùng)", ["10 (phần tử đầu tiên)", "-1", "Báo lỗi IndexError"], "Trong Python, chỉ số âm `-1` dùng để lấy phần tử cuối cùng của danh sách."),
    bankQuestion("List & Tuple", "Với `nums = [10, 20, 30, 40, 50]`, phép cắt lát `nums[1:4]` trả về kết quả nào?", "[20, 30, 40]", ["[10, 20, 30, 40]", "[20, 30, 40, 50]", "[10, 40]"], "Cắt lát `nums[1:4]` lấy từ chỉ số 1 đến sát chỉ số 4 (tức là các chỉ số 1, 2, 3)."),
    bankQuestion("List & Tuple", "Phương thức nào thêm một phần tử mới vào cuối danh sách (`list`) trong Python?", ".append()", [".push()", ".add()", ".insert_last()"], "Phương thức `.append(x)` nối thêm phần tử `x` vào vị trí cuối cùng của list."),
    bankQuestion("List & Tuple", "Điểm khác biệt cốt lõi giữa `Tuple` `(1, 2, 3)` và `List` `[1, 2, 3]` là gì?", "Tuple là bất biến (không thể sửa/xóa phần tử sau khi tạo), còn List có thể thay đổi", ["Tuple chỉ chứa được số nguyên, còn List chứa được mọi kiểu", "Tuple không thể truy cập phần tử bằng chỉ số `[0]`", "List không thể dùng trong vòng lặp `for`"], "Tuple có tính bất biến (immutable), giúp bảo vệ dữ liệu cố định khỏi bị vô tình sửa đổi."),
    bankQuestion("Dictionary & Set", "Cấu trúc `Set` (tập hợp, ví dụ `{1, 2, 2, 3}`) trong Python có đặc điểm nổi bật nào?", "Tự động loại bỏ các phần tử trùng lặp (chỉ giữ lại `{1, 2, 3}`)", ["Lưu các phần tử theo cặp khóa - giá trị", "Cho phép chứa nhiều phần tử giống hệt nhau và giữ nguyên thứ tự chèn", "Chỉ lưu được chuỗi ký tự"], "Set là tập hợp các phần tử duy nhất không trùng lặp."),
    bankQuestion("Dictionary & Set", "Làm thế nào để khởi tạo một tập hợp (`set`) rỗng trong Python?", "set()", ["{}", "[]", "empty_set()"], "Cặp `{}` rỗng trong Python tạo ra một từ điển (`dict`) rỗng; muốn tạo `set` rỗng phải viết `set()`."),
    bankQuestion("Dictionary & Set", "Khi duyệt một từ điển `d` qua cả khóa và giá trị trong vòng lặp `for k, v in ...:`, ta gọi phương thức nào?", "d.items()", ["d.keys()", "d.values()", "d.pairs()"], "`d.items()` trả về các cặp `(key, value)` để duyệt đồng thời khóa và giá trị."),
    bankQuestion("Hàm trong Python", "Từ khóa nào dùng để định nghĩa một hàm trong Python?", "def", ["function", "func", "void"], "Python dùng từ khóa `def` kèm tên hàm, danh sách tham số và dấu hai chấm `:`."),
    bankQuestion("Hàm trong Python", "Nếu một hàm trong Python thực thi hết thân hàm mà không gặp lệnh `return`, hàm đó trả về giá trị gì?", "None", ["0", "False", "Chuỗi rỗng \"\""], "Mọi hàm trong Python nếu không `return` giá trị cụ thể sẽ tự động trả về `None`."),
    bankQuestion("Xử lý ngoại lệ & Tệp", "Cấu trúc nào trong Python dùng để bắt và xử lý lỗi khi chạy (exception) mà không làm dừng đột ngột chương trình?", "try ... except", ["do ... catch", "if ... error", "check ... rescue"], "Python dùng khối `try:` để thử chạy lệnh và `except:` để bắt lỗi phát sinh."),
    bankQuestion("Xử lý ngoại lệ & Tệp", "Vì sao nên mở tệp bằng cú pháp `with open(\"data.txt\", \"r\", encoding=\"utf-8\") as f:` thay vì chỉ gọi `open()` rời rạc?", "Vì khối `with` đảm bảo tệp luôn được đóng tự động (`close`) ngay cả khi có lỗi xảy ra bên trong", ["Vì không dùng `with` thì Python không đọc được tiếng Việt", "Vì `with` giúp xóa tệp ngay sau khi đọc xong", "Vì `open()` không thể dùng nếu không có `with`"], "Context manager `with open(...)` tự động đóng tệp an toàn khi thoát khỏi khối lệnh."),
    bankQuestion("Lập trình hướng đối tượng (OOP)", "Phương thức đặc biệt nào trong một `class` Python được tự động gọi ngay khi tạo một đối tượng mới?", "__init__", ["__main__", "__start__", "constructor"], "`__init__(self, ...)` là phương thức khởi tạo thiết lập dữ liệu ban đầu cho đối tượng vừa tạo."),
    bankQuestion("Lập trình hướng đối tượng (OOP)", "Tham số đầu tiên `self` trong các phương thức của lớp (`class`) Python đại diện cho điều gì?", "Chính đối tượng (instance) cụ thể đang gọi phương thức đó", ["Toàn bộ tệp mã nguồn Python", "Lớp cha của mọi lớp", "Một biến toàn cục dùng chung cho mọi chương trình"], "`self` tham chiếu tới chính bản thân đối tượng đang thực hiện hành động."),
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
        title: "1. Bối cảnh & Mục tiêu của thực dân Pháp tại lòng chảo Điện Biên Phủ",
        content: "Chiến dịch diễn ra từ 13/3 đến 7/5/1954 trong kháng chiến chống Pháp. Pháp xây dựng tập đoàn cứ điểm khổng lồ ở Tây Bắc với 49 cứ điểm chia làm 3 phân khu (Bắc, Trung tâm, Nam), muốn gây sức ép lên các tuyến tiếp tế sang Lào và dụ Việt Minh vào trận đánh lớn mà họ tin ưu thế hỏa lực, xe tăng, pháo binh và cầu hàng không sẽ nghiền nát đối phương. Theo nguồn được dẫn trong tài liệu, Pháp đưa hơn 15.000 quân tinh nhuệ vào khu vực; đây là số ước tính của nguồn, không phải kiểm kê tuyệt đối.",
      },
      {
        title: "2. Ông cha ta đã anh dũng chiến đấu và dùng chiến thuật nào?",
        content: "Từ phương án 'Đánh nhanh, thắng nhanh' ban đầu, Đại tướng Võ Nguyên Giáp đã đưa ra quyết định lịch sử chuyển sang phương châm 'Đánh chắc, tiến chắc'. Phía Việt Minh bao vây lòng chảo, đào hàng trăm km chiến hào (giao thông hào trục và hào tiếp cận) tạo thành 'thòng lọng' siết chặt từng cứ điểm và đưa pháo 105mm lên vị trí hầm pháo đào sâu trong sườn núi. Chiến thuật 'vây, lấn, tấn, phá, triệt, diệt' kết hợp bắn tỉa và cắt đứt đường băng sân bay Mường Thanh đã vô hiệu hóa hoàn toàn ưu thế pháo binh – không quân của Pháp. Vận chuyển pháo, đạn và lương thực qua địa hình khó khăn giúp duy trì vòng vây và làm suy yếu khả năng tiếp tế đường không của Pháp.",
      },
      {
        title: "3. Chuyện bên lề chiến trường & Hậu cần nhân dân huyền thoại",
        content: "Đằng sau tiền tuyến là kỳ tích hậu cần chưa từng có: hơn 260.000 dân công hỏa tuyến cùng hơn 20.000 chiếc xe đạp thồ cải tiến (mỗi xe thồ từ 200–300 kg gạo, đạn) vượt qua mưa bom bão đạn trên đèo Pha Đin, Lũng Lô. Bộ đội ta sáng tạo 'bếp Hoàng Cầm' dẫn khói tan vào lòng đất để nấu cơm nóng ngay sát đồn địch mà máy bay trinh sát không phát hiện được. Trong lửa đạn xuất hiện những tấm gương hy sinh bất tử: anh hùng Tô Vĩnh Diện lấy thân mình chèn bánh pháo 105mm không cho lao xuống vực, Phan Đình Giót lấy thân mình lấp lỗ châu mai ở đồi Him Lam, Bế Văn Đàn lấy vai làm giá súng.",
      },
      {
        title: "4. Thiệt hại của quân địch & Chiến thắng lịch sử của dân tộc",
        content: "Ngày 13/3, pháo binh mở màn đánh các cứ điểm vòng ngoài phía bắc (Him Lam, Độc Lập); sau đó sân bay bị vô hiệu hóa, giao tranh tập trung ở các cứ điểm và cao điểm phía đông (đặc biệt là cuộc chiến giằng co từng tấc đất tại đồi A1). Đợt tổng công kích cuối bắt đầu ngày 1/5; ngày 7/5/1954, sở chỉ huy tập đoàn cứ điểm bị đánh chiếm, tướng De Castries cùng toàn bộ Bộ tham mưu Pháp đầu hàng. Chiến thắng góp phần tạo sức ép lớn tại Hội nghị Genève nhưng không phải nguyên nhân duy nhất dẫn tới hiệp định. Nguồn History.com nêu tổn thất máy bay Pháp (62 chiếc bị bắn rơi/phá hủy và 167 chiếc khác bị hư hại), không có bảng thương vong con người đầy đủ, thống nhất cho cả hai phía; bài học không tự bịa con số hoặc giờ chính xác.",
      },
    ];
  }
  if (eventKey === "geneva") {
    return [
      {
        title: "1. Hiệp định Genève: Đấu tranh ngoại giao & Thỏa thuận đình chiến năm 1954",
        content: "Hiệp định Genève về Đông Dương được ký tháng 7/1954 sau khi chiến tranh chống Pháp kết thúc và ngay sau tiếng súng chiến thắng vang dội từ chiến trường Điện Biên Phủ. Các nhà ngoại giao Việt Nam đã kiên cường đấu tranh trên bàn hội nghị quốc tế để buộc các cường quốc công nhận độc lập, chủ quyền, thống nhất và toàn vẹn lãnh thổ của Việt Nam, Lào, Campuchia. Ở Việt Nam, việc tập kết và chuyển quân được tổ chức tạm thời ở hai vùng; giới tuyến quân sự gần vĩ tuyến 17 (sông Bến Hải – cầu Hiền Lương) không phải biên giới quốc gia vĩnh viễn.",
      },
      {
        title: "2. Điều khoản, dự kiến tổng tuyển cử và âm mưu phá hoại của đối phương",
        content: "Hiệp định dự kiến tổng tuyển cử để thống nhất Việt Nam vào năm 1956. Cuộc tổng tuyển cử đó không diễn ra như dự kiến do sự can thiệp của Hoa Kỳ và chính quyền Ngô Đình Diệm ở miền Nam từ chối hiệp thương. Cần phân biệt điều khoản được dự kiến với kết quả lịch sử thực tế, đồng thời không đồng nhất Genève với văn kiện ngoại giao năm 1973.",
      },
      {
        title: "3. Chuyện bên lề lịch sử & Ý nghĩa chiến thắng",
        content: "Trong những ngày tập kết 300 ngày sau Hiệp định, hàng vạn cán bộ, chiến sĩ miền Nam khi bước lên tàu ra Bắc tại Cà Mau, Quy Nhơn đã giơ hai ngón tay hẹn '2 năm nữa sẽ về' với niềm tin sắt đá vào ngày thống nhất, trong khi nhiều cán bộ kiên trung được phân công ở lại bám đất, bám dân trong lòng địch. Trình tự cần nhớ: chiến thắng Điện Biên Phủ tháng 5/1954 tạo bối cảnh đàm phán → Hiệp định Genève tháng 7/1954 → tập kết quân sự tạm thời và dự kiến tổng tuyển cử năm 1956. Quân viễn chinh Pháp buộc phải cuốn cờ rút khỏi miền Bắc, giải phóng hoàn toàn miền Bắc làm hậu phương lớn cho cả nước.",
      },
    ];
  }
  if (eventKey === "dongKhoi") {
    return [
      {
        title: "1. Bối cảnh đen tối & Ngọn lửa Đồng Khởi bùng lên ở miền Nam",
        content: "Cuối thập niên 1950 và đầu thập niên 1960, phong trào đấu tranh ở miền Nam phát triển trong bối cảnh chính quyền Ngô Đình Diệm thực hiện chính sách 'Tố cộng, diệt cộng' và Luật 10/59 lê máy chém khắp miền Nam đàn áp đẫm máu các lực lượng cách mạng. Trước tình thế 'tức nước vỡ bờ', Nghị quyết 15 của Đảng đã thổi bùng ngọn lửa nổi dậy. Bến Tre là địa phương tiêu biểu, phong trào Đồng Khởi bùng lên mạnh mẽ năm 1960 (mở đầu ngày 17/1/1960 tại ba xã Định Thủy, Phước Hiệp, Bình Khánh thuộc huyện Mỏ Cày) rồi lan ra nhiều nơi khắp Nam Bộ, Tây Nguyên và Trung Trung Bộ.",
      },
      {
        title: "2. Chiến thuật 'Ba mũi giáp công' & Đội quân tóc dài huyền thoại",
        content: "Ở nhiều vùng nông thôn, quần chúng nổi dậy phá thế kìm kẹp, giành quyền làm chủ ở một số địa bàn; đấu tranh chính trị kết hợp với lực lượng vũ trang theo phương thức sáng tạo 'Hai chân' (Chính trị + Quân sự) và 'Ba mũi giáp công' (Chính trị – Quân sự – Binh vận). Đặc biệt, hình ảnh 'Đội quân tóc dài' do nữ tướng Nguyễn Thị Định lãnh đạo — hàng vạn phụ nữ, các mẹ, các chị tay không kéo vào thị xã, dùng lý lẽ và lòng quả cảm chặn đầu xe tăng, đấu tranh trực diện buộc địch phải nhượng bộ — đã trở thành biểu tượng độc đáo của chiến tranh nhân dân Việt Nam. Phong trào làm thay đổi tương quan và mở rộng lực lượng cách mạng ở miền Nam. Không nên mô tả Đồng Khởi như một trận đánh đơn lẻ chỉ diễn ra tại một điểm.",
      },
      {
        title: "3. Vũ khí tự tạo độc đáo & Thiệt hại của bộ máy kìm kẹp địch",
        content: "Bắt đầu cuộc nổi dậy khi trong tay hầu như không có súng đạn hiện đại, nhân dân Bến Tre đã dùng mỏ lết, gậy tầm vông, giáo mác, súng kíp, 'súng ngựa trời' tự chế từ ống sắt và thậm chí nuôi hàng trăm tổ ong vò vẽ làm 'vũ khí sinh học' khiến lính địch đi càn khiếp đảm; dùng tiếng mõ dừa, trống, ống tre tạo thanh thế áp đảo làm đồn bốt địch hoang mang đầu hàng để thu súng giặc đánh giặc. Kết quả: hàng loạt 'ấp chiến lược', đồn bốt và bộ máy cai trị cơ sở của địch ở nông thôn bị đập tan, Mặt trận Dân tộc Giải phóng miền Nam Việt Nam ra đời (20/12/1960), chuyển cách mạng miền Nam từ thế giữ gìn lực lượng sang thế tiến công chiến lược.",
      },
    ];
  }
  if (eventKey === "tet") {
    return [
      {
        title: "1. Tổng tiến công và nổi dậy Tết Mậu Thân 1968: Đòn sấm sét giữa đô thị",
        content: "Đầu năm 1968, giữa lúc Mỹ đưa hơn nửa triệu quân viễn chinh vào miền Nam và tuyên bố 'đã nhìn thấy ánh sáng cuối đường hầm', lực lượng cách mạng mở cuộc Tổng tiến công và nổi dậy trên nhiều đô thị, địa bàn ở miền Nam vào đúng đêm giao thừa Tết Mậu Thân (gồm 4/6 thành phố lớn, 37/44 thị xã và hàng trăm quận lỵ). Đây là một đợt hoạt động quân sự quy mô rộng, không phải một trận đánh duy nhất ở một thành phố.",
      },
      {
        title: "2. Chiến thuật Biệt động thành, Chuyện bên lề & Tác động làm rung chuyển nước Mỹ",
        content: "Để tạo yếu tố bất ngờ tuyệt đối ngay tại sào huyệt địch, các chiến sĩ Biệt động Sài Gòn đã sử dụng chiến thuật hóa trang, ém quân và vận chuyển hàng tấn thuốc nổ, súng AK vào giấu trong các căn hầm bí mật đào ngay dưới nền nhà dân giữa lòng Sài Gòn suốt nhiều năm mà mật vụ Mỹ - Việt Nam Cộng hòa không hề hay biết. Đêm Mậu Thân, các đội cảm tử đánh thẳng vào Tòa Đại sứ Mỹ, Dinh Độc Lập, Bộ Tổng tham mưu, Đài Phát thanh Sài Gòn và làm chủ cố đô Huế suốt 25 ngày đêm. Cuộc tiến công không đạt mọi mục tiêu quân sự dự kiến và gây tổn thất lớn cho nhiều bên. Tuy vậy, quy mô và diễn biến của sự kiện tạo tác động chính trị, truyền thông sâu rộng, ảnh hưởng đến tranh luận tại Hoa Kỳ và tiến trình đàm phán. Cần tách kết quả quân sự trước mắt khỏi tác động chính trị lâu dài.",
      },
      {
        title: "3. Thiệt hại chiến lược của địch & Bước ngoặt buộc Mỹ ngồi vào bàn đàm phán",
        content: "Đòn tiến công Tết Mậu Thân làm phá sản chiến lược 'Chiến tranh cục bộ' của Mỹ, làm lung lay tận gốc ý chí xâm lược của Nhà Trắng: Tổng thống Lyndon B. Johnson phải tuyên bố ngừng ném bom miền Bắc từ vĩ tuyến 20 trở ra, từ bỏ ý định tranh cử nhiệm kỳ hai và chấp nhận ngồi vào bàn đàm phán tại Paris. Hãy nhớ rõ dòng thời gian: Tết Mậu Thân gắn với năm 1968; Hiệp định Paris được ký năm 1973; chiến tranh tại miền Nam kết thúc năm 1975.",
      },
    ];
  }
  if (eventKey === "paris") {
    return [
      {
        title: "1. Cuộc đấu trí dài nhất lịch sử ngoại giao & Hiệp định Paris ngày 27/1/1973",
        content: "Hiệp định Paris về chấm dứt chiến tranh, lập lại hòa bình ở Việt Nam được ký ngày 27/1/1973 sau gần 5 năm đàm phán căng thẳng với hơn 200 phiên họp công khai và 45 cuộc gặp riêng giữa Cố vấn đặc biệt Lê Đức Thọ, Bộ trưởng Xuân Thủy, Bộ trưởng Nguyễn Thị Bình với phía Hoa Kỳ (Henry Kissinger). Thỏa thuận quy định ngừng bắn, Hoa Kỳ cam kết tôn trọng độc lập, chủ quyền, thống nhất và toàn vẹn lãnh thổ của Việt Nam, đồng thời việc quân đội Hoa Kỳ cùng lực lượng đồng minh rút khỏi Việt Nam theo tiến trình của hiệp định.",
      },
      {
        title: "2. Chiến thuật 'Vừa đánh vừa đàm' & Chiến thắng Điện Biên Phủ trên không",
        content: "Để ép ta ký theo điều kiện của Mỹ, cuối tháng 12/1972 Tổng thống Nixon mở cuộc tập kích đường không chiến lược Linebacker II bằng pháo đài bay B-52 rải thảm Hà Nội, Hải Phòng suốt 12 ngày đêm. Quân và dân miền Bắc đã anh dũng lập nên trận 'Điện Biên Phủ trên không', kết hợp lưới lửa tên lửa SAM-2, pháo cao xạ và tiêm kích MiG-21 vạch nhiễu tìm thù, bắn rơi hàng chục máy bay (trong đó có 34 siêu pháo đài bay B-52), đập tan uy thế không lực Hoa Kỳ và buộc Mỹ phải ký Hiệp định Paris ngày 27/1/1973. Sau khi quân đội Hoa Kỳ rút, xung đột giữa các lực lượng Việt Nam vẫn tiếp diễn. Vì vậy, năm 1973 là mốc ký hiệp định và rút quân Hoa Kỳ, không phải mốc kết thúc chiến tranh tại miền Nam.",
      },
      {
        title: "3. Ý nghĩa chiến lược: 'Đánh cho Mỹ cút' tạo đà 'Đánh cho Ngụy nhào'",
        content: "Việc cuốn cờ rút hết quân viễn chinh Mỹ chấm dứt hơn một thế kỷ có bóng dáng quân đội nước ngoài đóng trên đất Việt Nam, làm thay đổi hẳn so sánh lực lượng trên chiến trường có lợi cho cách mạng. Chuỗi mốc: Hiệp định Genève năm 1954 → Hiệp định Paris ngày 27/1/1973 → chiến dịch mùa Xuân năm 1975 và chiến tranh kết thúc tại miền Nam ngày 30/4/1975.",
      },
    ];
  }
  if (eventKey === "endWar") {
    return [
      {
        title: "1. Đại thắng mùa Xuân 1975: Nghệ thuật nghi binh & 3 đòn tiến công chiến lược",
        content: "Mùa Xuân năm 1975, các chiến dịch Tây Nguyên, Huế–Đà Nẵng và Hồ Chí Minh diễn ra nối tiếp, làm thay đổi nhanh cục diện chiến trường. Bằng nghệ thuật nghi binh chiến lược tài tình (tạo giả định ta sẽ đánh Pleiku – Kon Tum để kéo chủ lực địch lên phía Bắc Tây Nguyên), ngày 10/3/1975, chiến dịch Tây Nguyên mở màn bằng cuộc tiến công bất ngờ giải phóng thị xã Buôn Ma Thuột; sau đó lực lượng Việt Nam Cộng hòa rút lui hỗn loạn khỏi Tây Nguyên trên Đường 7 và tình hình ở miền Trung biến chuyển nhanh với việc giải phóng hoàn toàn Huế (25/3) và Đà Nẵng (29/3).",
      },
      {
        title: "2. Chiến thuật 'Thần tốc, táo bạo' & Chiến dịch Hồ Chí Minh lịch sử (26/4 – 30/4/1975)",
        content: "Với mệnh lệnh lịch sử của Đại tướng Võ Nguyên Giáp: 'Thần tốc, thần tốc hơn nữa; táo bạo, táo bạo hơn nữa; tranh thủ từng giờ, từng phút, xốc tới mặt trận, giải phóng miền Nam!', 5 quân đoàn chủ lực hợp đồng binh chủng quy mô lớn hình thành 5 cánh quân tiến thẳng vào Sài Gòn. Chiến dịch Hồ Chí Minh bắt đầu ngày 26/4/1975. Ngày 30/4, lực lượng tiến công tiến vào Sài Gòn, xe tăng 390 và 843 húc đổ cổng Dinh Độc Lập, cắm lá cờ chiến thắng trên nóc dinh; Tổng thống Dương Văn Minh tuyên bố đầu hàng không điều kiện. Đây là mốc kết thúc chiến tranh tại miền Nam Việt Nam.",
      },
      {
        title: "3. Thiệt hại sụp đổ của đối phương & Mốc thống nhất nhà nước năm 1976",
        content: "Chỉ trong 55 ngày đêm thần tốc mùa Xuân 1975, toàn bộ quân lực Việt Nam Cộng hòa với hơn 1 triệu quân được Mỹ trang bị hiện đại đã tan rã hoàn toàn; non sông thu về một mối sau 21 năm chia cắt đầy hy sinh xương máu. Chiến tranh kết thúc tại miền Nam năm 1975; việc thống nhất nhà nước được thực hiện năm 1976 thông qua cuộc Tổng tuyển cử bầu Quốc hội chung của cả nước (25/4/1976). Khi kể lại, hãy xếp đúng thứ tự Tây Nguyên → Huế–Đà Nẵng → Hồ Chí Minh, rồi phân biệt mốc chiến tranh kết thúc với mốc thống nhất nhà nước.",
      },
    ];
  }
  return [
    {
      title: "1. Dòng thời gian hào hùng của giai đoạn 1954–1975",
      content: "Sau Hiệp định Genève năm 1954, phong trào Đồng Khởi phát triển ở miền Nam, tiêu biểu tại Bến Tre năm 1960; cuộc Tổng tiến công và nổi dậy Tết Mậu Thân diễn ra năm 1968; Hiệp định Paris được ký ngày 27/1/1973; chiến tranh tại miền Nam kết thúc ngày 30/4/1975.",
    },
    {
      title: "2. Nghệ thuật quân sự Việt Nam & Phân biệt các mốc lịch sử",
      content: "Ông cha ta đã kết hợp nhuần nhuyễn đấu tranh chính trị, quân sự và ngoại giao: từ 'Đánh chắc, tiến chắc' ở Điện Biên Phủ, 'Ba mũi giáp công' ở Đồng Khởi, Biệt động thành ở Mậu Thân 1968 đến hợp đồng binh chủng thần tốc mùa Xuân 1975. Genève năm 1954 gắn với đình chiến và tập kết quân sự tạm thời; Paris năm 1973 gắn với thỏa thuận ngừng bắn và việc quân đội Hoa Kỳ rút; ngày 30/4/1975 là mốc chiến tranh kết thúc tại miền Nam.",
    },
    {
      title: "3. Cách trình bày một sự kiện lịch sử trọn vẹn",
      content: "Khi phân tích lịch sử, hãy nêu rõ: bối cảnh, chiến thuật tác chiến của quân dân ta, tinh thần hy sinh và hậu cần nhân dân, thiệt hại của địch cùng ý nghĩa chiến thắng. Việc thống nhất nhà nước được thực hiện năm 1976, sau mốc chiến tranh kết thúc tại miền Nam.",
    },
  ];
}

function getGeographyStudySections(topic) {
  const topicText = topic.toLocaleLowerCase("vi");
  if (/khí hậu/.test(topicText)) {
    return [
      {
        title: "1. Hiểu thuật ngữ & Khái niệm cốt lõi (Nắm chắc 70% nội dung bài học)",
        content: "Khí hậu Việt Nam mang tính chất nhiệt đới ẩm gió mùa. Để hiểu bản chất thay vì học thuộc lòng, bạn cần nắm 4 từ khóa: (1) Tính nhiệt đới: tổng bức xạ nắng lớn, nhiệt độ trung bình năm trên 20°C (trừ vùng núi cao); (2) Tính ẩm: lượng mưa lớn (1.500–2.000 mm/năm) và độ ẩm không khí trên 80%; (3) Gió mùa: một năm có 2 mùa gió chính là gió mùa mùa đông (gió mùa Đông Bắc lạnh khô đầu đông, lạnh ẩm mưa phùn cuối đông ở miền Bắc) và gió mùa mùa hạ (gió mùa Tây Nam nóng ẩm gây mưa lớn); (4) Biên độ nhiệt năm: mức chênh lệch giữa tháng nóng nhất và tháng lạnh nhất (miền Bắc biên độ nhiệt lớn 10–12°C, miền Nam biên độ nhiệt nhỏ chỉ 2–3°C).",
      },
      {
        title: "2. Tư duy Nhân – Quả (Tránh học vẹt: Tại sao khí hậu các vùng lại khác nhau?)",
        content: "Đừng chỉ nhớ kết quả, hãy đặt câu hỏi 'Tại sao?':\n• Tại sao miền Bắc có mùa đông lạnh còn miền Nam nóng quanh năm? → Nguyên nhân: Miền Bắc nằm ở vĩ độ cao hơn (gần chí tuyến Bắc) nên đón trực tiếp các đợt không khí lạnh từ phương Bắc tràn xuống; khi gió mùa Đông Bắc đi xuống phía Nam thì suy yếu và bị dãy núi Bạch Mã (vĩ tuyến 16°B) chặn lại, khiến miền Nam mang khí hậu cận xích đạo nóng quanh năm (2 mùa mưa – khô rõ rệt).\n• Tại sao miền Trung lại khô nóng (gió Lào) vào đầu mùa hạ và mưa lũ dồn dập vào thu – đông? → Nguyên nhân: Gió Tây Nam vượt dãy Trường Sơn bị biến tính gây hiệu ứng phơn khô nóng ở sườn Đông; còn vào thu – đông, dải hội tụ nhiệt đới kết hợp gió Đông Bắc thổi qua biển gặp bức chắn địa hình Trường Sơn gây mưa lớn và bão lũ.",
      },
      {
        title: "3. Đọc Bản đồ / Atlat & Vận dụng vào kinh tế – đời sống",
        content: "Quan sát bản đồ Atlat bên dưới (các vùng khoanh tròn đỏ): Khí hậu nhiệt đới ẩm gió mùa giúp cây cối xanh tốt quanh năm, thâm canh tăng vụ lúa nước, đồng thời mùa đông lạnh ở miền Bắc và độ cao địa hình (Sa Pa, Đà Lạt) cho phép trồng rau quả cận nhiệt và ôn đới. Tuy nhiên, cần chủ động phòng chống thiên tai theo vùng: bão và lũ quét ở miền Bắc – miền Trung, hạn hán ở Nam Trung Bộ – Tây Nguyên, và xâm nhập mặn mùa khô ở Đồng bằng sông Cửu Long.",
      },
    ];
  }
  if (/dân cư/.test(topicText)) {
    return [
      {
        title: "1. Hiểu thuật ngữ & Khái niệm cốt lõi (Nắm chắc 70% nội dung bài học)",
        content: "Trước khi vào số liệu, hãy nắm rõ 4 khái niệm nền tảng của Địa lý dân cư: (1) Mật độ dân số (người/km²): số dân trung bình sống trên 1 km² diện tích đất tự nhiên, phản ánh mức độ tập trung dân cư; (2) Gia tăng dân số tự nhiên: chênh lệch giữa tỷ suất sinh thô và tỷ suất tử thô; (3) Gia tăng dân số cơ học (di cư): chênh lệch giữa người nhập cư và xuất cư (quyết định sự dịch chuyển lao động về các khu công nghiệp, đô thị); (4) Cơ cấu dân số vàng & Đô thị hóa: giai đoạn tỷ lệ dân số trong độ tuổi lao động cao gấp đôi dân số phụ thuộc, đi kèm quá trình mở rộng quy mô và lối sống thành thị.",
      },
      {
        title: "2. Tư duy Nhân – Quả (Tránh học vẹt: Tại sao dân cư phân bố không đều?)",
        content: "Dân cư Việt Nam phân bố không đồng đều giữa đồng bằng và miền núi. Hãy giải thích theo tư duy Nhân – Quả:\n• Tại sao Đồng bằng sông Hồng và Đông Nam Bộ có mật độ dân số cao nhất cả nước (trên 1.000 người/km²), trong khi Tây Bắc và Tây Nguyên rất thưa dân? → Nguyên nhân tự nhiên: Đồng bằng có địa hình bằng phẳng, đất phù sa màu mỡ, nguồn nước dồi dào thuận lợi cho cư trú và canh tác lúa nước lâu đời. Nguyên nhân kinh tế – xã hội: Các đô thị lớn (Hà Nội, TP.HCM), cảng biển, khu công nghiệp và dịch vụ tập trung ở đồng bằng tạo ra nhiều việc làm và thu nhập cao, hút dòng di cư cơ học mạnh mẽ.\n• Tại sao dân số đông vừa là động lực vừa là sức ép? → Hệ quả kép: Tạo nguồn nhân lực dồi dào và thị trường tiêu thụ lớn, nhưng gây áp lực trực tiếp lên giải quyết việc làm, nhà ở, giao thông, y tế, giáo dục và môi trường đô thị.",
      },
      {
        title: "3. Đọc Bản đồ / Atlat & Phân tích vùng trọng điểm khoanh tròn",
        content: "Trên bản đồ Atlat Việt Nam bên dưới, hai vùng được khoanh tròn đỏ đậm ở hai đầu đất nước (Đồng bằng sông Hồng gắn với tam giác tăng trưởng Hà Nội – Hải Phòng – Quảng Ninh, và Đông Nam Bộ – Đồng bằng sông Cửu Long gắn với TP.HCM) chính là hai cực tập trung dân cư và lao động lớn nhất. Việt Nam có 54 dân tộc anh em cùng sinh sống đoàn kết, tạo nên bản sắc văn hóa phong phú từ miền ngược đến miền xuôi.",
      },
    ];
  }
  return [
    {
      title: "1. Hiểu thuật ngữ & Khái niệm cốt lõi (Nắm chắc 70% nội dung bài học)",
      content: "Để làm chủ Địa lý tự nhiên Việt Nam mà không cần học vẹt, hãy nắm chắc 4 khái niệm gốc: (1) Hướng nghiêng địa hình (Tây Bắc – Đông Nam): chiều thấp dần của địa hình từ vùng núi cao phía Tây Bắc xuống vùng đồng bằng và thềm lục địa phía Đông Nam (nhìn hướng chảy của sông Hồng, sông Đà, sông Tiền – sông Hậu đều đổ ra Biển Đông là thấy ngay!); (2) Đồi núi thấp: vùng đồi núi có độ cao dưới 1.000m (chiếm tới 85% diện tích lãnh thổ Việt Nam, còn núi cao trên 2.000m chỉ chiếm 1%); (3) Đồng bằng châu thổ: đồng bằng rộng lớn do phù sa các hệ thống sông lớn bồi đắp trên vịnh biển nông (Đồng bằng sông Hồng và Đồng bằng sông Cửu Long); (4) Đồng bằng ven biển (chân núi – ven biển): dải đồng bằng nhỏ hẹp miền Trung do biển đóng vai trò chính khi hình thành nên đất thường nhiều cát, ít phù sa sông.",
    },
    {
      title: "2. Tư duy Nhân – Quả (Tránh học vẹt: Tại sao ngành kinh tế lại gắn với từng vùng?)",
      content: "Địa lý là mối liên hệ Nhân – Quả giữa Tự nhiên và Kinh tế:\n• Tại sao Đồng bằng sông Cửu Long và Đồng bằng sông Hồng lại là hai vựa lúa và vùng nông nghiệp trọng điểm của cả nước? → Do địa hình châu thổ bằng phẳng, đất phù sa ngọt màu mỡ được bồi tụ hằng năm kết hợp mạng lưới sông ngòi dày đặc.\n• Tại sao dải miền Trung ít trồng lúa diện rộng mà phát triển mạnh kinh tế biển (cảng nước sâu, thủy sản, du lịch biển)? → Do dãy Trường Sơn đâm sát ra biển làm đồng bằng hẹp và đất cát nghèo dinh dưỡng, nhưng bù lại bờ biển khúc khuỷu, thềm lục địa sâu, nhiều vũng vịnh kín gió (Vân Phong, Cam Ranh, Đà Nẵng) và bãi biển đẹp.\n• Tại sao vùng núi phía Bắc và Tây Nguyên lại phát triển thủy điện và cây công nghiệp lâu năm? → Do địa hình dốc, sông nhiều thác ghềnh tạo trữ năng thủy điện lớn, cùng đất đỏ bazan / feralit và khí hậu phân hóa theo đai cao.",
    },
    {
      title: "3. Đọc Bản đồ / Atlat Việt Nam (Quan sát các vùng khoanh tròn đỏ)",
      content: "Lãnh thổ Việt Nam gồm vùng đất, vùng biển (với hai quần đảo Hoàng Sa và Trường Sa) và vùng trời. Khi nhìn vào bản đồ Atlat bên dưới, hãy chú ý 3 khu vực được khoanh tròn đỏ: (1) Vùng núi Tây Bắc – Đông Bắc (nóc nhà Đông Dương Fansipan 3.143m và địa hình vòng cung); (2) Châu thổ sông Hồng & Dải ven biển miền Trung; (3) Châu thổ sông Cửu Long rộng khoảng 40.000 km² ở cực Nam.",
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
  if (material === quizTopics.geography.material) {
    const geoSections = getGeographyStudySections(topic);
    if (geoSections) {
      return geoSections.map(({ title, content }) => `${title}\n${content}`).join("\n\n");
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
  if (material === quizTopics.pythonProgramming.material) {
    const pySections = getPythonStudySections(topic);
    if (pySections) {
      return pySections.map((section) => [
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
        title: "1. Ẩn dụ đời thường & Khái niệm: 'Hộp dụng cụ có sẵn và Danh mục tra cứu'",
        content: "Hãy tưởng tượng bạn đang lắp ráp một chiếc xe đạp: thay vì phải tự rèn từng chiếc cờ-lê hay tua-vít từ cục sắt, bạn chỉ cần mở 'Hộp dụng cụ tiêu chuẩn' đã chế tạo sẵn ra dùng! Trong C, Thư viện chuẩn cung cấp các hàm đã được định nghĩa cho những việc phổ biến như nhập/xuất màn hình, đếm độ dài chuỗi và tính toán. Mỗi header như stdio.h, string.h hoặc stdlib.h khai báo giao diện cần dùng (giống như tờ danh mục ghi tên dụng cụ và cách cầm); dòng #include ở đầu bài giúp trình biên dịch biết cách gọi hàm đó.",
        checkPrompt: "Bạn đã hiểu hình ảnh 'Tờ danh mục (#include header)' và 'Hộp dụng cụ có sẵn (thư viện chuẩn)' chưa?",
        nextButtonLabel: "Đã hiểu ẩn dụ — Xem tiếp Code C minh họa →",
      },
      {
        title: "2. Áp dụng như thế nào & Code C minh họa chạy được",
        content: "Khi cần dùng công cụ nào, ta mở đúng tờ danh mục (#include) của hộp dụng cụ đó ở đầu file rồi gọi hàm. Ví dụ dùng strlen (đếm chữ) từ string.h, abs (lấy số dương) từ stdlib.h và printf (in ra màn hình) từ stdio.h:",
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
          "strlen đếm số ký tự của chữ \"C\" (trước vạch đích '\\0') và trả về kết quả bằng 1.",
          "abs(7 - 10) đổi số âm -3 thành số dương 3 (trị tuyệt đối).",
          "Header cung cấp khai báo để trình biên dịch kiểm tra cách gọi; phần cài đặt thực sự của hàm được nối vào khi tạo chương trình.",
        ],
        codeOutput: "Mon C co 1 ky tu; |7-10| = 3",
        checkPrompt: "Bạn đã thấy cách khai báo `#include` ở đầu bài để gọi `printf`, `strlen`, `abs` trong `main` chưa?",
        nextButtonLabel: "Đã hiểu Code C — Xem tiếp phần Bắt bệnh (Debug) →",
      },
      {
        title: "3. Quy tắc nhớ nhanh: Tờ danh mục khác với Chiếc máy thật",
        content: "Hãy tìm hàm cần dùng, tra header chuẩn khai báo hàm đó và thêm #include tương ứng. Nhớ rằng tờ danh mục (.h) chỉ giới thiệu tên hàm, còn phần cài đặt hàm được cung cấp bởi thư viện khi ghép nối chương trình, không phải do #include tự chạy.",
      },
      {
        title: "4. Góc Debug bắt bệnh: Lỗi kinh điển nhất khi dùng hàm nhập xuất chuẩn",
        content: "Khi mới học thư viện `<stdio.h>`, 90% người mới đều từng vấp lỗi quên dấu `&` (số phòng) khi dùng `scanf`:\n\n❌ Code bị lỗi:\nint age = 0;\nscanf(\"%d\", age); // LỖI! Chỉ đưa giá trị 0 mà không đưa số phòng của tủ age\n\n• Tại sao lỗi? Hàm `scanf` giống như nhân viên giao hàng cần biết SỐ PHÒNG (`&age`) để mang con số người dùng vừa gõ cất vào đúng chiếc tủ `age`. Nếu thiếu dấu `&`, nhân viên giao hàng đi nhầm địa chỉ làm chương trình bị sập ngay!\n• Cách sửa đúng: Luôn thêm dấu `&` trước tên biến số trong `scanf`:\nscanf(\"%d\", &age); // Đưa đúng số phòng &age để scanf cất dữ liệu vào tủ",
        checkPrompt: "Bạn đã nắm rõ vì sao `scanf(\"%d\", &age)` bắt buộc phải có dấu `&` chưa? Sẵn sàng làm 3 câu kiểm tra ngắn nhé!",
      },
    ];
  }
  if (/cấu trúc chương trình/.test(topicText)) {
    return [
      {
        title: "1. Ẩn dụ đời thường & Khái niệm: 'Công thức nấu ăn và Cửa chính vào nhà'",
        content: "Hãy hình dung một chương trình C giống như một ngôi nhà có nhiều phòng, nhưng máy tính khi bước vào nhà luôn luôn tìm đúng chiếc cửa chính có treo biển `main` để bắt đầu đi vào! Khi chạy, chương trình bắt đầu từ hàm main; các lệnh bên trong cặp ngoặc nhọn `{ ... }` giống như từng bước trong công thức nấu ăn, được làm lần lượt từ dòng trên xuống dòng dưới. Cuối mỗi bước (câu lệnh), bạn đặt dấu chấm phẩy `;` giống như dấu chấm hết câu trong tiếng Việt.",
        checkPrompt: "Bạn đã hình dung được 'Cửa chính main()' và cách máy tính đọc từng dòng lệnh từ trên xuống dưới chưa?",
        nextButtonLabel: "Đã hiểu khái niệm — Xem tiếp Code C minh họa →",
      },
      {
        title: "2. Áp dụng như thế nào & Code C minh họa chạy được",
        content: "Đây là một chương trình C hoàn chỉnh, ngắn gọn nhất. Bạn hãy đọc từ dòng 1 xuống dòng cuối như đọc một công thức 4 bước:",
        code: `#include <stdio.h>

int main(void) {
    int first = 4;
    int second = 7;
    int sum = first + second;

    printf("Tong = %d\\n", sum);
    return 0;
}`,
        codeNotes: [
          "#include <stdio.h> lấy hộp công cụ nhập xuất chuẩn để dùng được lệnh in màn hình printf.",
          "int main(void) là cửa chính bắt đầu chương trình; cặp ngoặc nhọn { ... } ôm trọn các việc cần làm.",
          "Máy tính lần lượt lấy số 4, số 7, cộng lại thành 11 rồi cất vào biến sum; mỗi dòng đều kết thúc bằng dấu chấm phẩy `;`.",
          "printf in dòng chữ Tong = 11 ra màn hình; return 0 ở cuối giống như lời báo cáo: 'Đã hoàn thành nhiệm vụ suôn sẻ!'.",
        ],
        codeOutput: "Tong = 11",
        checkPrompt: "Bạn đã nắm được thứ tự chạy từ `#include` → `main` → tính tổng → `printf` → `return 0` chưa?",
        nextButtonLabel: "Đã hiểu Code C — Xem tiếp phần Bắt bệnh (Debug) →",
      },
      {
        title: "3. Mẹo phân biệt nhanh: Lỗi viết sai chính tả vs. Lỗi làm sai công thức",
        content: "Nếu bạn quên dấu chấm phẩy `;` hoặc quên đóng ngoặc nhọn `}`, máy tính sẽ báo lỗi ngay lập tức và không chịu chạy (gọi là lỗi cú pháp). Còn nếu bạn muốn tính tổng mà viết nhầm dấu `+` thành dấu `-`, máy tính vẫn chạy trơn tru nhưng ra kết quả sai (gọi là lỗi suy luận / lỗi logic). Lưu ý nhỏ: dòng `#include` ở đầu bài là bước chuẩn bị dụng cụ trước khi vào `main`.",
      },
      {
        title: "4. Góc Debug bắt bệnh: Bẫy đặt dư dấu chấm phẩy `;` ngay sau cửa chính `main`",
        content: "Ở ngay bài đầu tiên này, bạn chỉ cần nhớ bắt đúng 1 lỗi cú pháp kinh điển nhất khi mới viết hàm `main`:\n\n❌ Code bị lỗi (Đặt dư dấu `;` ngay sau `main(void)`):\n#include <stdio.h>\nint main(void); // LỖI! Dấu ; ở đây làm đóng sập cửa chính ngay lập tức\n{\n    printf(\"Tong = 11\\n\");\n    return 0;\n}\n\n• Tại sao lỗi? Dấu chấm phẩy `;` dùng để kết thúc một câu lệnh đơn. Nếu bạn đặt `;` ngay sau `int main(void);`, máy tính tưởng rằng bạn chỉ giới thiệu tên hàm rồi thôi, khiến phần thân `{ ... }` bên dưới bị tách rời bơ vơ!\n\n✅ Code sửa đúng (Mở ngoặc nhọn `{` ngay sau `main(void)`, tuyệt đối không có dấu `;`):\nint main(void) {\n    printf(\"Tong = 11\\n\");\n    return 0;\n}",
        checkPrompt: "Bạn đã thấy vì sao tuyệt đối không được viết dấu `;` ngay sau `int main(void)` chưa? Cùng làm 3 câu kiểm tra ngắn nhé!",
      },
    ];
  }
  if (/struct|cấu trúc dữ liệu/.test(topicText)) {
    return [
      {
        title: "1. Ẩn dụ đời thường & Khái niệm: 'Tờ phiếu hồ sơ học sinh đóng thành một tập'",
        content: "Một biến `int` thông thường giống như một mảnh giấy nhỏ chỉ ghi được đúng 1 con số. Nhưng một hồ sơ học sinh ngoài đời thực gồm cả Tên (chữ), Tuổi (số nguyên) và Điểm (số lẻ). Nếu bạn để Tên một nơi, Tuổi một nơi, Điểm một nơi thì rất dễ ghép nhầm điểm của bạn An sang cho bạn Bình! Vì vậy, C cung cấp `struct` — giúp gom các trường có liên quan thành một bản ghi (giống như một tờ phiếu thông tin in sẵn 3 mục Tên - Tuổi - Điểm trên cùng một tờ giấy); bản thân định nghĩa `struct` là cái khuôn mẫu phiếu trắng, còn biến `struct` là một tờ hồ sơ cụ thể đã điền thông tin.",
        checkPrompt: "Bạn đã hình dung được `struct` giống như 'tờ phiếu hồ sơ gom chung Tên, Tuổi, Điểm vào một chỗ' chưa?",
        nextButtonLabel: "Đã hiểu ẩn dụ — Xem tiếp Code C minh họa →",
      },
      {
        title: "2. Áp dụng như thế nào & Code C minh họa chạy được",
        content: "Chương trình dưới đây tạo khuôn mẫu phiếu `Student`, điền hồ sơ của bạn An, rồi lấy thông tin bằng dấu chấm (`.`) khi cầm trực tiếp tờ phiếu, hoặc dùng dấu mũi tên (`->`) khi tìm qua tờ giấy ghi số tủ (con trỏ):",
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
          "typedef struct { ... } Student; thiết kế khuôn mẫu phiếu Student gồm 3 mục: name, age và score.",
          "Student student = { ... }; in ra một tờ phiếu thật tên là student và điền sẵn thông tin của An.",
          "student.name dùng dấu chấm (.) vì ta đang cầm trực tiếp tờ phiếu student trên tay.",
          "record->score dùng dấu mũi tên (->) vì record là con trỏ (tờ giấy ghi địa chỉ tủ chứa phiếu student).",
        ],
        codeOutput: "An, 18 tuoi\nDiem: 8.5",
        checkPrompt: "Bạn đã phân biệt được khi nào dùng dấu chấm `.` (`student.name`) và khi nào dùng dấu mũi tên `->` (`record->score`) chưa?",
        nextButtonLabel: "Đã hiểu Code C — Xem tiếp phần Bắt bệnh (Debug) →",
      },
      {
        title: "3. Ý nghĩa thực tế: Quản lý cả lớp học chỉ với một danh sách phiếu",
        content: "Khi cần quản lý 30 học sinh trong lớp, bạn chỉ cần tạo một danh sách gồm 30 tờ phiếu: `Student students[30];` — mỗi phần tử là một hồ sơ riêng gọn gàng, không sợ nhầm điểm người này sang người kia.",
      },
      {
        title: "4. Góc Debug bắt bệnh: Lỗi nhầm dấu chấm (`.`) và dấu mũi tên (`->`)",
        content: "Lỗi phổ biến nhất khi mới học `struct` là dùng nhầm dấu chấm `.` cho con trỏ:\n\n❌ Code bị lỗi:\nStudent s = { \"An\", 18, 8.5f };\nStudent *p = &s;     // p là tờ giấy ghi địa chỉ của hồ sơ s\nprintf(\"%.1f\", p.score); // LỖI BIÊN DỊCH! p là con trỏ nên không dùng dấu chấm trực tiếp được\n\n• Cách nhớ cực dễ:\n  - Cầm **hồ sơ thật** (`s`) → dùng **dấu chấm**: `s.score`\n  - Cầm **tờ giấy chỉ đường / con trỏ** (`p`) → dùng **mũi tên chỉ đường**: `p->score`!",
        checkPrompt: "Bạn đã nhớ mẹo 'Hồ sơ thật dùng dấu chấm (.), Con trỏ chỉ đường dùng mũi tên (->)' chưa?",
      },
    ];
  }
  if (/con trỏ và hàm|pointer.*function|swap/.test(topicText)) {
    return [
      {
        title: "1. Ẩn dụ đời thường: 'Đưa ảnh chụp món đồ hay Đưa chìa khóa kèm số tủ?'",
        content: "Ở bài trước, bạn đã biết: Biến là chiếc tủ đồ, `&` là số phòng dán trên cửa tủ, còn Con trỏ là tờ giấy ghi số phòng. Vậy tại sao khi viết hàm (ví dụ hàm `swap` để tráo đổi điểm giữa 2 chiếc tủ `x` và `y`), ta lại bắt buộc phải dùng Con trỏ?\n• Nếu truyền biến bình thường (`swap(x, y)`): Giống như bạn chỉ CHỤP ẢNH món đồ trong tủ gửi cho người bạn (`hàm swap`). Người bạn cắt ghép bức ảnh thế nào thì 2 chiếc tủ thật ở nhà vẫn y nguyên không đổi!\n• Nếu truyền địa chỉ cho con trỏ (`swap(&x, &y)`): Bạn đưa cho người bạn 2 TỜ GIẤY GHI SỐ PHÒNG (`&x` và `&y`). Người bạn cầm giấy đi tới tận nơi, dùng dấu `*` mở cửa cả 2 chiếc tủ thật và tráo đổi món đồ bên trong!",
        checkPrompt: "Bạn đã hiểu vì sao muốn hàm sửa được biến gốc ở ngoài thì phải đưa 'số phòng (&)' thay vì đưa 'bản chụp ảnh' chưa?",
        nextButtonLabel: "Đã hiểu 'Ảnh chụp vs. Số tủ' — Xem tiếp Code C hàm swap →",
      },
      {
        title: "2. Code C minh họa trọn vẹn: Hàm `swap` đổi chỗ 2 số bằng Con trỏ",
        content: "Dưới đây là toàn bộ chương trình có hàm `swap(int *a, int *b)` hoàn chỉnh để bạn thấy tận mắt cách 2 tờ giấy `a` và `b` mở tủ và đổi giá trị cho nhau:",
        code: `#include <stdio.h>

void swap(int *a, int *b) {
    int temp = *a;  // 1. Mở tủ a lấy số 5 cất tạm vào hộp phụ temp
    *a = *b;        // 2. Mở tủ b lấy số 9 bỏ sang tủ a
    *b = temp;      // 3. Lấy số 5 từ hộp phụ temp bỏ vào tủ b
}

int main(void) {
    int x = 5;
    int y = 9;
    swap(&x, &y);   // Đưa số phòng của tủ x (&x) và tủ y (&y) cho hàm swap
    printf("x = %d, y = %d\\n", x, y);
    return 0;
}`,
        codeNotes: [
          "Trong main, lệnh swap(&x, &y); gửi số phòng của tủ x cho tờ giấy a, và số phòng của tủ y cho tờ giấy b.",
          "int temp = *a; mở tủ a (đang chứa 5) cất vào hộp tạm temp để không bị mất số 5.",
          "*a = *b; lấy số 9 trong tủ b đem cất đè vào tủ a.",
          "*b = temp; lấy số 5 từ hộp tạm cất vào tủ b. Khi hàm kết thúc, hai tủ x và y ở main đã đổi ruột cho nhau thành 9 và 5!",
        ],
        codeOutput: "x = 9, y = 5",
        checkPrompt: "Bạn đã hình dung rõ 3 bước dùng hộp phụ `temp` và dấu `*a`, `*b` để tráo đồ giữa 2 chiếc tủ trong hàm `swap` chưa?",
        nextButtonLabel: "Đã hiểu Code hàm swap — Xem tiếp phần Bắt bệnh (Debug) →",
      },
      {
        title: "3. Quy tắc sống còn khi dùng Con trỏ với Hàm",
        content: "Khi truyền con trỏ vào hàm, hãy luôn nhớ: (1) Muốn đổi đồ bên trong tủ thì phải có dấu `*` (`*a = *b`), nếu không có dấu `*` (`a = b`) thì bạn chỉ đang chép đè số phòng trên tờ giấy nháp! (2) Các biến tạo ra bên trong một hàm giống như 'chiếc tủ dựng tạm' chỉ dùng trong lúc hàm đang chạy; khi hàm kết thúc, chiếc tủ tạm đó sẽ bị dỡ bỏ ngay.",
      },
      {
        title: "4. Góc Debug bắt bệnh: 2 lỗi kinh điển khi kết hợp Con trỏ và Hàm",
        content: "Bây giờ đã có đầy đủ code ở trên, bạn hãy soi 2 lỗi mà người mới hay mắc nhất khi viết hàm dùng con trỏ:\n\n• Lỗi 1 (Sửa số ghi trên tờ giấy thay vì mở tủ đổi đồ):\nTrong hàm `void swap(int *a, int *b)`, nếu bạn viết:\n❌ Sai: `a = &y;` hoặc `int *temp = a; a = b; b = temp;` → Bạn chỉ đang tráo đổi 2 tờ giấy nháp trong tay hàm `swap`, còn 2 chiếc tủ thật `x` và `y` ở `main` chưa hề được mở cửa nên giá trị vẫn giữ nguyên!\n✅ Đúng: Phải dùng dấu `*` để mở tủ: `int temp = *a; *a = *b; *b = temp;`.\n\n• Lỗi 2 (Trả về số phòng của một 'chiếc tủ tạm' đã bị dỡ bỏ):\n❌ Sai:\nint* taoDiem(void) {\n    int s = 10;   // Tủ tạm s chỉ tồn tại bên trong hàm taoDiem\n    return &s;    // NGUY HIỂM! Đưa số phòng của tủ tạm ra ngoài\n}\n→ Ngay khi hàm `taoDiem` chạy xong dòng `return`, chiếc tủ tạm `s` bị hệ thống dỡ bỏ hoàn toàn! Tờ giấy nhận về lúc này chỉ vào một căn phòng đã bị phá hủy (tài liệu chuyên ngành gọi tờ giấy chỉ vào vùng nhớ đã bị hủy này là Con trỏ treo - Dangling Pointer).",
        checkPrompt: "Bạn đã phân biệt được lỗi `a = b` (chỉ đổi tờ giấy) với `*a = *b` (mở tủ đổi đồ) và hiểu vì sao không được `return &s` của biến tạm trong hàm chưa?",
      },
    ];
  }
  if (/con trỏ|pointer/.test(topicText)) {
    return [
      {
        title: "1. Ẩn dụ đời thường: 'Dãy tủ đồ Locker và Tờ giấy ghi số phòng'",
        content: "Nếu bạn mới học C, đừng lo lắng về các thuật ngữ phức tạp! Hãy tưởng tượng bộ nhớ máy tính (RAM) giống hệt như một dãy tủ gửi đồ (locker) hoặc các phòng trong một khách sạn, mỗi chiếc tủ đều có dán một con số thứ tự trên cửa:\n• Biến thông thường (`int score = 8;`): Bạn cất con số `8` vào trong một chiếc tủ đồ tên là `score`.\n• Địa chỉ (`&score`): Chính là SỐ PHÒNG / SỐ TỦ dán trên cửa tủ đó (ví dụ: phòng số `104`). Dấu `&` hiểu nôm na là hỏi máy tính: 'Cho tôi hỏi tủ `score` mang số phòng mấy?'.\n• Con trỏ (`int *pointer;`): Không trực tiếp chứa số 8, mà là MỘT TỜ GIẤY NHỚ dùng để ghi lại số phòng của chiếc tủ kia (trên tờ giấy ghi: `Phòng 104`).\n• Toán tử mở tủ (`*pointer`): Hành động cầm tờ giấy trên tay, đi tìm đúng phòng số `104`, mở cửa tủ ra để xem bên trong có số mấy hoặc thay số `8` bằng số `9`!",
        checkPrompt: "Bạn đã hiểu hình ảnh ẩn dụ 'Tủ đồ (biến score) — Số dán trên cửa tủ (&score) — Tờ giấy ghi số phòng (pointer) — Cầm giấy đi mở tủ (*pointer)' chưa?",
        nextButtonLabel: "Đã hiểu 'Tủ đồ & Chìa khóa' — Đẩy tiếp phần Code C →",
      },
      {
        title: "2. Từ Ẩn dụ sang Code C: Mở phòng 104 và đổi điểm từ 8 thành 9",
        content: "Khi đã hiểu 'tủ đồ và tờ giấy ghi số phòng', bạn sẽ thấy 4 dòng code C dưới đây cực kỳ dễ đọc:",
        code: `#include <stdio.h>

int main(void) {
    int score = 8;          // 1. Cất số 8 vào chiếc tủ tên là score
    int *pointer = &score;  // 2. Lấy số phòng của tủ (&score) ghi vào tờ giấy pointer
    *pointer = 9;           // 3. Cầm tờ giấy tìm đúng phòng đó, mở cửa tủ thay bằng số 9
    printf("score = %d\\n", score);
    return 0;
}`,
        codeNotes: [
          "&score lấy số phòng (địa chỉ) của chiếc tủ score.",
          "int *pointer = &score; tạo tờ giấy tên là pointer và ghi số phòng đó vào. (Mẹo nhỏ: dấu * lúc mới khai báo int *pointer chỉ là cái nhãn đánh dấu 'đây là tờ giấy ghi số phòng', chưa phải hành động mở tủ).",
          "*pointer = 9; lúc này viết *pointer nghĩa là cầm tờ giấy đi mở đúng chiếc tủ score và đổi giá trị bên trong từ 8 thành 9 (trong tài liệu kỹ thuật, hành động dùng * để mở tủ gọi là 'giải tham chiếu').",
        ],
        codeOutput: "score = 9",
        checkPrompt: "Bạn đã thấy cách dòng lệnh `*pointer = 9;` đi theo số phòng trên tờ giấy để đổi trực tiếp số trong tủ `score` từ 8 thành 9 chưa?",
        nextButtonLabel: "Đã hiểu Code C — Đẩy tiếp phần Bắt bệnh (Debug) →",
      },
      {
        title: "3. Quy tắc vàng bằng ngôn ngữ bình dân",
        content: "Với người mới bắt đầu, bạn chỉ cần thuộc lòng đúng 1 quy tắc đơn giản: Tuyệt đối không dùng dấu `*` để mở một vùng nhớ không có thật hoặc khi tờ giấy chưa ghi số phòng! Nếu bạn mới lấy tờ giấy ra mà chưa biết ghi số phòng nào, hãy gán cho nó chữ `NULL` (`int *pointer = NULL;`) để đánh dấu rõ rằng 'tờ giấy đang để trắng, chưa chỉ vào chiếc tủ nào cả'.",
      },
      {
        title: "4. Góc Debug bắt bệnh (Dành riêng cho bài mở đầu): Lỗi cầm tờ giấy trắng đi mở tủ!",
        content: "Ở bài đầu tiên này, chúng ta chỉ tập trung bắt đúng 1 lỗi kinh điển nhất mà ai mới học Con trỏ cũng từng gặp — đó là lỗi Con trỏ `NULL` (hoặc chưa khởi tạo số phòng):\n\n❌ Code bị lỗi (Cầm giấy trắng đi mở tủ):\nint *pointer = NULL;  // Tờ giấy đang để trắng, chưa ghi số phòng của tủ nào\n*pointer = 100;       // LỖI! Cầm giấy trắng mà đòi mở cửa tủ để cất số 100\n\n• Tại sao lỗi? Vì trên tờ giấy `pointer` đang ghi `NULL` (không có phòng nào cả), nên khi dùng `*pointer = 100`, máy tính không tìm thấy tủ để mở và buộc phải dừng chương trình ngay lập tức để bảo vệ bộ nhớ!\n\n✅ Code sửa đúng (Ghi số phòng của một chiếc tủ có thật trước khi mở):\nint score = 0;          // Bước 1: Phải có chiếc tủ thật\nint *pointer = &score;  // Bước 2: Ghi số phòng &score vào tờ giấy\n*pointer = 100;         // Bước 3: Mở tủ cất số 100 an toàn tuyệt đối!\n\n(💡 Gợi ý lộ trình: Sau khi làm xong 3 câu kiểm tra nhẹ nhàng bên dưới, bạn hãy chọn học tiếp bài 'Con trỏ và Hàm' ở menu môn C để khám phá cách dùng con trỏ trong hàm hoán đổi `swap` nhé!)",
        checkPrompt: "Bạn đã nắm chắc toàn bộ 3 bước: Ẩn dụ tủ đồ → Code C cơ bản → Bắt lỗi tờ giấy trắng `NULL` chưa? Cùng làm 3 câu kiểm tra ngắn nhé!",
      },
    ];
  }
  if (/hàm/.test(topicText)) {
    return [
      {
        title: "1. Ẩn dụ đời thường & Khái niệm: 'Chiếc máy ép trái cây làm thuê theo yêu cầu'",
        content: "Hãy tưởng tượng Hàm (Function) trong C giống như một chiếc máy ép trái cây đặt trong bếp: bạn bỏ nguyên liệu đầu vào (ví dụ: 4 quả cam và 7 quả táo — gọi là tham số), chiếc máy tự chạy quy trình bên trong thân máy, rồi rót ra một ly nước ép thành phẩm (kết quả trả về qua lệnh `return`) để bạn mang đi dùng! Nhờ chia chương trình thành các hàm có tên rõ ràng, bạn không phải viết đi viết lại cùng một đoạn code nhiều lần.",
        checkPrompt: "Bạn đã hình dung được Hàm giống như 'chiếc máy nhận nguyên liệu đầu vào → xử lý → trả ra kết quả' chưa?",
        nextButtonLabel: "Đã hiểu ẩn dụ — Xem tiếp Code C minh họa →",
      },
      {
        title: "2. Áp dụng như thế nào & Code C minh họa chạy được",
        content: "Dưới đây là chiếc máy `add` nhận vào hai con số `left` và `right`, cộng chúng lại rồi trả kết quả về cho hàm `main`:",
        code: `#include <stdio.h>

int add(int left, int right) {
    return left + right;
}

int main(void) {
    int total = add(4, 7);
    printf("Tong = %d\\n", total);
    return 0;
}`,
        codeNotes: [
          "int add(int left, int right) tạo chiếc máy tên là add, nhận 2 số nguyên và hứa sẽ trả ra 1 số nguyên (int).",
          "return left + right; tính tổng 4 + 7 = 11 rồi trả kết quả 11 ra khỏi máy.",
          "Trong main, dòng int total = add(4, 7); hứng lấy kết quả 11 cất vào biến total rồi in ra màn hình.",
        ],
        codeOutput: "Tong = 11",
        checkPrompt: "Bạn đã thấy cách `main` gửi hai số `4, 7` vào hàm `add` và nhận về tổng `11` qua lệnh `return` chưa?",
        nextButtonLabel: "Đã hiểu Code C — Xem tiếp phần Bắt bệnh (Debug) →",
      },
      {
        title: "3. Bản chất cần nhớ: Mặc định C chỉ gửi 'bản photo' vào hàm!",
        content: "Trong C, khi bạn truyền một biến thông thường vào hàm (ví dụ `tangDiem(diem)`), máy tính chỉ chụp một BẢN SAO (bản photo) của con số đó đưa cho hàm xử lý (gọi là truyền theo giá trị - pass-by-value). Mọi chỉnh sửa bên trong hàm chỉ diễn ra trên tờ giấy photo, biến gốc ở bên ngoài vẫn giữ nguyên không đổi.",
      },
      {
        title: "4. Góc Debug bắt bệnh: Tại sao gọi hàm cộng thêm 10 mà điểm gốc vẫn bằng 5?",
        content: "Hãy xem đoạn code khiến rất nhiều người mới học C bối rối:\n\n❌ Code bị lỗi logic (Sửa trên bản photo):\nvoid tangDiem(int x) {\n    x = x + 10; // Chỉ cộng 10 vào tờ giấy photo x rồi vứt đi!\n}\nint main(void) {\n    int diem = 5;\n    tangDiem(diem);\n    printf(\"%d\", diem); // Vẫn in ra 5 chứ KHÔNG PHẢI 15!\n}\n\n• Cách sửa 1 (Dùng `return` trả kết quả mới về rồi hứng lấy):\n`int tangDiem(int x) { return x + 10; }` và trong `main` viết: `diem = tangDiem(diem);`\n• Cách sửa 2 (Đưa số phòng qua Con trỏ — bạn sẽ học kỹ ở bài 'Con trỏ và Hàm'):\n`void tangDiem(int *x) { *x = *x + 10; }` và gọi `tangDiem(&diem);`.",
        checkPrompt: "Bạn đã hiểu vì sao `void tangDiem(int x)` chỉ sửa bản sao chứ không làm thay đổi biến `diem` trong `main` chưa?",
      },
    ];
  }
  if (/mảng|chuỗi/.test(topicText)) {
    return [
      {
        title: "1. Ẩn dụ đời thường & Khái niệm: 'Toa tàu đánh số từ toa số 0'",
        content: "Mảng giữ nhiều giá trị cùng kiểu dưới một tên trong một vùng nhớ liên tiếp nhau trên RAM — hãy tưởng tượng nó như một đoàn tàu gồm nhiều toa nối liền nhau! Điều thú vị nhất trong lập trình C là: người soát vé đếm toa đầu tiên là **Toa số 0** chứ không phải toa số 1! Vì vậy, nếu đoàn tàu `scores` có 3 toa, thì số hiệu của 3 toa lần lượt là **0, 1 và 2** (tuyệt đối không có toa số 3). Ngôn ngữ C không tự đặt rào chắn ở cuối tàu, nên bạn phải luôn giữ chỉ số nằm trong phạm vi từ `0` đến `số toa - 1`.",
        checkPrompt: "Bạn đã nhớ quy tắc 'Đoàn tàu 3 toa trong C được đánh số là 0, 1, 2 (không có toa số 3)' chưa?",
        nextButtonLabel: "Đã hiểu ẩn dụ — Xem tiếp Code C minh họa →",
      },
      {
        title: "2. Áp dụng như thế nào & Code C minh họa chạy được",
        content: "Chương trình dưới đây tạo đoàn tàu `scores` gồm 3 toa chứa điểm `{7, 8, 10}`, rồi cho vòng lặp đi qua từng toa từ `0` đến `2` để cộng tổng điểm:",
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
        codeNotes: [
          "scores[0] là toa đầu tiên chứa 7; scores[1] chứa 8; scores[2] là toa cuối cùng chứa 10.",
          "sizeof scores / sizeof scores[0] lấy tổng chiều dài đoàn tàu chia cho độ dài 1 toa để tính ra đúng số toa (count = 3).",
          "Điều kiện i < count (tức là i < 3) giúp người soát vé chỉ bước vào toa 0, 1, 2 rồi dừng lại an toàn.",
        ],
        codeOutput: "Tong = 25",
        checkPrompt: "Bạn đã thấy vì sao vòng lặp dùng điều kiện `i < count` (chạy 0, 1, 2) thay vì `i <= count` chưa?",
        nextButtonLabel: "Đã hiểu Code C — Xem tiếp phần Chuỗi & Bắt bệnh (Debug) →",
      },
      {
        title: "3. Bản chất Chuỗi chữ cái (String): Luôn cần thêm 1 toa cuối cắm cờ dừng `'\\0'`",
        content: "Trong C, một chuỗi chữ cái (như chữ `\"An!\"`) thực chất là một đoàn tàu chở từng chữ cái trên các toa `char`, nhưng bắt buộc phải dành thêm **1 toa cuối cùng** để cắm lá cờ báo hiệu hết chữ mang ký hiệu `'\\0'` (gọi là ký tự kết thúc chuỗi). Vì vậy, muốn chở từ `\"An!\"` (dài 3 ký tự), bạn phải khai báo đoàn tàu có ít nhất **4 toa**: `char name[4] = \"An!\";`.",
      },
      {
        title: "4. Góc Debug bắt bệnh: Bẫy bước hụt chân sang 'Toa số 3' không tồn tại (`i <= 3`)",
        content: "Ở bài Mảng và Chuỗi này, chúng ta chỉ tập trung bắt đúng 1 lỗi kinh điển nhất mà ai mới học mảng cũng từng mắc — đó là dùng nhầm dấu `<=` làm bước hụt chân ra ngoài đoàn tàu:\n\n❌ Code bị lỗi (Đoàn tàu chỉ có 3 toa 0, 1, 2 nhưng lại bước sang toa 3):\nint scores[3] = {7, 8, 10};\nint total = 0;\nfor (int i = 0; i <= 3; i++) {  // LỖI ở dấu <= 3!\n    total += scores[i];         // Khi i = 3, đọc nhầm vào scores[3] ngoài đoàn tàu!\n}\n\n• Tại sao lỗi? Đoàn tàu `scores[3]` có 3 toa, đánh số từ `0` đến `2` (`scores[0]`, `scores[1]`, `scores[2]`). Không hề có `scores[3]`! Khi viết `i <= 3`, ở vòng cuối `i` bằng `3` làm chương trình bước hụt chân ra khỏi đoàn tàu và lấy nhầm một con số rác bên ngoài cộng vào tổng (tài liệu kỹ thuật gọi đây là lỗi tràn biên một đơn vị — Off-by-one).\n\n✅ Code sửa đúng (Luôn dùng dấu nhỏ hơn `< số lượng toa`):\nfor (int i = 0; i < 3; i++) {   // Chỉ chạy i = 0, 1, 2 rồi dừng lại an toàn!\n    total += scores[i];\n}",
        checkPrompt: "Bạn đã thấy vì sao mảng có 3 phần tử thì vòng lặp bắt buộc phải viết `i < 3` (chạy 0, 1, 2) chứ không được viết `i <= 3` chưa?",
      },
    ];
  }
  if (/cấu trúc điều khiển|vòng lặp|rẽ nhánh/.test(topicText)) {
    return [
      {
        title: "1. Ẩn dụ đời thường & Khái niệm: 'Biển báo ngã rẽ và Đường chạy vòng quanh sân'",
        content: "Nếu không có cấu trúc điều khiển, chương trình chỉ biết đi thẳng một mạch từ trên xuống dưới. Cấu trúc điều khiển cho chương trình 2 khả năng thông minh:\n• Rẽ nhánh (`if / else`, `switch`): Giống như biển báo ở ngã ba đường — 'Nếu điểm từ 5 trở lên thì rẽ sang nhánh Đạt, ngược lại thì rẽ sang nhánh Cần học thêm'.\n• Vòng lặp (`for`, `while`, `do-while`): Giống như chạy bộ quanh sân vận động — mỗi vòng làm một việc giống nhau và luôn phải có vạch dừng rõ ràng (ví dụ: chạy đủ 4 vòng thì nghỉ) để không bị chạy mãi không dừng!",
        checkPrompt: "Bạn đã hình dung được sự khác nhau giữa 'Ngã rẽ điều kiện (if/else)' và 'Chạy lặp lại có vạch dừng (for/while)' chưa?",
        nextButtonLabel: "Đã hiểu ẩn dụ — Xem tiếp Code C minh họa →",
      },
      {
        title: "2. Áp dụng như thế nào & Code C minh họa chạy được",
        content: "Chương trình dưới đây dùng `if / else` để xét điểm Đạt, sau đó dùng vòng lặp `for` chạy 4 vòng để cộng các số `1 + 2 + 3 + 4`:",
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
        codeNotes: [
          "Vì score = 8 lớn hơn hoặc bằng 5 (điều kiện đúng), chương trình chọn nhánh đầu tiên và in chữ Dat.",
          "Vòng lặp for bắt đầu từ vòng i = 1, mỗi vòng cộng thêm i vào sum rồi tăng i lên 1 đơn vị (i++).",
          "Khi i tăng lên 5, điều kiện i <= 4 không còn đúng nữa nên vòng lặp dừng lại ngay.",
        ],
        codeOutput: "Dat\nTong = 10",
        checkPrompt: "Bạn đã nắm được 3 thành phần trong ngoặc của `for (khởi tạo; điều kiện tiếp tục; bước tăng)` chưa?",
        nextButtonLabel: "Đã hiểu Code C — Xem tiếp phần Bắt bệnh (Debug) →",
      },
      {
        title: "3. Khi nào chọn `for`, `while` hay `do-while`?",
        content: "Mẹo chọn nhanh: Dùng `for` khi đã biết trước cần lặp bao nhiêu lần (ví dụ lặp từ 1 đến 4); dùng `while` khi chưa biết trước số lần mà chỉ lặp chừng nào điều kiện còn đúng; dùng `do-while` khi muốn làm công việc ít nhất 1 lần rồi mới kiểm tra điều kiện (như hiện menu hỏi người dùng).",
      },
      {
        title: "4. Góc Debug bắt bệnh: Cú lừa thị giác `=` và `==` bên trong câu lệnh `if`",
        content: "Ở bài Cấu trúc điều khiển này, bạn chỉ cần cảnh giác cao độ với 1 cái bẫy làm đau đầu hầu hết người mới học C — đó là viết nhầm 1 dấu bằng (`=`) thay vì 2 dấu bằng (`==`) khi so sánh trong `if`:\n\n❌ Code bị lỗi (Điểm chỉ có 3 nhưng vẫn được khen Điểm tuyệt đối!):\nint score = 3;\nif (score = 10) {   // LỖI! Viết 1 dấu = là cất đè số 10 vào hộp score\n    puts(\"Diem tuyet doi!\");\n}\n\n• Tại sao lỗi? Trong C, **1 dấu bằng (`=`)** là hành động **cất số vào hộp**, còn **2 dấu bằng (`==`)** mới là câu hỏi **so sánh xem hai bên có bằng nhau không**. Khi viết `if (score = 10)`, máy tính lấy số 10 nhét đè vào hộp `score`, rồi thấy số 10 khác 0 nên coi như điều kiện luôn luôn đúng!\n\n✅ Code sửa đúng (Luôn dùng 2 dấu bằng `==` khi kiểm tra bằng nhau):\nint score = 3;\nif (score == 10) {  // Hỏi: score có bằng 10 không? (3 == 10 là Sai nên không in)\n    puts(\"Diem tuyet doi!\");\n}",
        checkPrompt: "Bạn đã nhớ kỹ quy tắc: '1 dấu bằng (`=`) là cất vào hộp, 2 dấu bằng (`==`) mới là so sánh bằng nhau trong `if`' chưa?",
      },
    ];
  }
  if (/biến|kiểu dữ liệu/.test(topicText)) {
    return [
      {
        title: "1. Ẩn dụ đời thường & Khái niệm: 'Chiếc hộp đựng đồ có dán nhãn kích cỡ'",
        content: "Hãy hình dung Biến (Variable) giống như những chiếc hộp đựng đồ trong nhà kho, có dán tên bên ngoài để bạn dễ gọi. Còn Kiểu dữ liệu (Data Type) chính là loại khay bên trong hộp:\n• Hộp `int`: Chỉ đựng được các con số nguyên vẹn (như `7`, `-3`, `42`), nếu bạn cố bỏ số lẻ `3.5` vào hộp `int` thì phần lẻ `.5` sẽ bị gọt mất ngay!\n• Hộp `float` và `double`: Hộp chuyên dụng để đựng số thực có phần thập phân (như `3.5`, `8.75`).\n• Hộp `char`: Hộp nhỏ xíu chỉ đựng vừa 1 ký tự đơn lẻ (như `'A'`, `'9'`).",
        checkPrompt: "Bạn đã phân biệt được 3 chiếc hộp cơ bản: `int` (số nguyên), `double/float` (số có phần lẻ thập phân) và `char` (1 ký tự) chưa?",
        nextButtonLabel: "Đã hiểu ẩn dụ — Xem tiếp Code C minh họa →",
      },
      {
        title: "2. Áp dụng như thế nào & Code C minh họa chạy được",
        content: "Trong C có một quy tắc rất thú vị: khi bạn lấy một số nguyên `int` chia cho một số nguyên `int` (như `7 / 2`), máy tính sẽ tự động cắt bỏ phần lẻ thập phân và chỉ trả ra `3`! Muốn giữ lại kết quả `3.50`, ta gắn nhãn `(double)` trước khi chia:",
        code: `#include <stdio.h>

int main(void) {
    int completed = 7;
    int total = 2;
    double average = (double)completed / total;
    printf("Trung binh = %.2f\\n", average);
    return 0;
}`,
        codeNotes: [
          "completed giữ số nguyên 7 và total giữ số nguyên 2.",
          "(double)completed biến số 7 thành số thực 7.0 trước khi đem chia cho 2, nhờ đó 7.0 / 2 ra đúng 3.5.",
          "%.2f trong printf dặn màn hình in số thực với đúng 2 chữ số sau dấu chấm thập phân (3.50).",
        ],
        codeOutput: "Trung binh = 3.50",
        checkPrompt: "Bạn đã hiểu vì sao phải đặt `(double)` ngay trước `completed` để phép chia không bị mất phần lẻ `.5` chưa?",
        nextButtonLabel: "Đã hiểu Code C — Xem tiếp phần Bắt bệnh (Debug) →",
      },
      {
        title: "3. Công cụ đo kích thước hộp: Toán tử `sizeof`",
        content: "Trên các dòng máy tính khác nhau, kích thước thật (số byte) của một chiếc hộp `int` hay `long` có thể thay đổi. Vì vậy, thay vì đoán mò kích thước kiểu dữ liệu, người lập trình C luôn dùng công cụ đo tự động `sizeof` (ví dụ `sizeof(int)`) khi cần biết chính xác chiếc hộp chiếm bao nhiêu byte.",
      },
      {
        title: "4. Góc Debug bắt bệnh: Bẫy 'ép kiểu quá muộn' làm mất sạch phần thập phân",
        content: "Hãy so sánh 2 dòng code chỉ khác nhau đúng một cặp dấu ngoặc đơn dưới đây:\n\n❌ Code bị lỗi (Đặt ngoặc bao quanh phép chia `7 / 2`):\ndouble avg = (double)(7 / 2); // Kết quả in ra 3.00 (SAI!)\n• Tại sao sai? Vì `(7 / 2)` nằm trong ngoặc nên được tính trước. Mà `7` và `2` đều là số nguyên `int` nên `7 / 2` đã bị gọt mất `.5` thành `3` rồi! Sau đó `(double)` mới biến số `3` thành `3.00` — lúc này phần `.5` đã mất không cứu lại được nữa!\n\n✅ Code sửa đúng (Biến số đầu tiên thành số thực TRƯỚC khi chia):\ndouble avg = (double)7 / 2;   // Hoặc viết 7.0 / 2 → Ra đúng 3.50!",
        checkPrompt: "Bạn đã thấy sự khác biệt giữa `(double)(7 / 2)` (chia nguyên xong mới đổi kiểu → ra 3.0) và `(double)7 / 2` (đổi kiểu trước khi chia → ra 3.5) chưa?",
      },
    ];
  }
  if (/bộ nhớ động|malloc|calloc/.test(topicText)) {
    return [
      {
        title: "1. Ẩn dụ đời thường & Khái niệm: 'Thuê thêm phòng khách sạn theo nhu cầu và Trả phòng'",
        content: "Khi khai báo mảng thông thường (như `int a[10]`), bạn phải chốt cứng số lượng từ lúc viết code. Nhưng ngoài thực tế, nhiều khi chương trình chạy rồi mới biết hôm nay có 5 khách hay 500 khách! Bộ nhớ động giúp bạn **thuê thêm vùng nhớ ngay trong lúc chương trình đang chạy**:\n• Hàm `malloc`: Giống như bạn đến quầy lễ tân xin thuê một dãy phòng; lễ tân sẽ đưa cho bạn tờ giấy ghi số phòng đầu tiên (hoặc trả về `NULL` nếu khách sạn đã hết sạch phòng).\n• Hàm `free`: Khi dùng xong, bạn bắt buộc phải gọi `free` để **trả phòng cho lễ tân**, giúp máy tính không bị cạn kiệt bộ nhớ!",
        checkPrompt: "Bạn đã hình dung được `malloc` (xin thuê phòng lúc đang chạy) và `free` (trả phòng sau khi dùng xong) chưa?",
        nextButtonLabel: "Đã hiểu ẩn dụ — Xem tiếp Code C minh họa →",
      },
      {
        title: "2. Áp dụng như thế nào & Code C minh họa chạy được",
        content: "Quy trình chuẩn gồm 4 bước không bao giờ tách rời: **Xin thuê (`malloc`) → Kiểm tra xem còn phòng không (`!= NULL`) → Sử dụng → Trả phòng (`free`)**:",
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
        codeNotes: [
          "malloc(3 * sizeof *values) xin thuê đủ chỗ cho 3 số nguyên int (lấy số lượng 3 nhân với kích thước của 1 số).",
          "if (values == NULL) kiểm tra xem có thuê được bộ nhớ không; nếu hết RAM thì dừng an toàn.",
          "free(values); trả lại vùng nhớ ngay khi đã tính tổng và in xong.",
        ],
        codeOutput: "Tong = 15",
        checkPrompt: "Bạn đã nắm được quy trình 4 bước `malloc` → kiểm tra `NULL` → dùng → `free` chưa?",
        nextButtonLabel: "Đã hiểu Code C — Xem tiếp phần Bắt bệnh (Debug) →",
      },
      {
        title: "3. Quy tắc vàng khi thuê bộ nhớ động",
        content: "Mỗi vùng nhớ xin bằng `malloc` hoặc `calloc` phải được trả lại đúng 1 lần bằng `free`. Tuyệt đối không dùng lại phòng sau khi đã trả (`free`), và không quên gọi `free` trước khi kết thúc công việc.",
      },
      {
        title: "4. Góc Debug bắt bệnh: Lỗi trả phòng xong vẫn quay lại lấy đồ (Và quên nhân `sizeof`)",
        content: "Hãy xem đoạn code thuê phòng cho 5 số nguyên ở dưới — đây là lỗi kinh điển nhất khi mới dùng `malloc` và `free`:\n\n❌ Code bị lỗi:\nint *arr = malloc(5);       // LỖI 1: Chỉ xin 5 byte lẻ tẻ, thiếu nhân kích thước sizeof!\narr[0] = 10;\nfree(arr);                  // Đã trả phòng cho lễ tân xong...\nprintf(\"%d\\n\", arr[0]);     // LỖI 2: Trả phòng rồi mà vẫn mở cửa vào lấy đồ!\n\n• Tại sao lỗi?\n  1. Mỗi số nguyên `int` thường cần tới 4 byte, nên viết `malloc(5)` chỉ đủ cho hơn 1 số! Phải viết `malloc(5 * sizeof *arr)` để xin đủ chỗ cho 5 số nguyên.\n  2. Khi đã gọi `free(arr);`, căn phòng đã được thu hồi. Việc cố tình đọc `arr[0]` sau khi `free` giống như trả phòng khách sạn rồi vẫn tự ý xông vào (tài liệu kỹ thuật gọi là lỗi Use-after-free).\n\n✅ Code sửa đúng (Xin đủ diện tích, in kết quả xong xuôi rồi mới trả phòng `free` ở cuối):\nint *arr = malloc(5 * sizeof *arr);\nif (arr != NULL) {\n    arr[0] = 10;\n    printf(\"%d\\n\", arr[0]);\n    free(arr); // Dùng xong hoàn toàn mới trả phòng!\n}",
        checkPrompt: "Bạn đã thấy rõ vì sao phải viết `malloc(5 * sizeof *arr)` và tuyệt đối không đọc `arr[0]` sau khi đã gọi `free(arr)` chưa?",
      },
    ];
  }
  if (/tệp|file/.test(topicText)) {
    return [
      {
        title: "1. Ẩn dụ đời thường & Khái niệm: 'Ghi chép vào cuốn sổ tay trên ổ cứng'",
        content: "Mọi biến thông thường trong RAM giống như chữ viết trên tấm bảng phấn: hễ tắt chương trình (hoặc mất điện) là bảng bị xóa sạch! Muốn lưu điểm số hay lịch sử học tập để ngày mai mở máy lên vẫn còn, ta phải ghi vào **Tệp (File)** trên ổ cứng — giống như mở một cuốn sổ tay bằng giấy:\n• `fopen`: Mở cuốn sổ tay ra (chọn chế độ đọc `\"r\"`, viết mới từ đầu `\"w\"`, hoặc viết nối thêm vào trang cuối `\"a\"`).\n• `fprintf` / `fscanf` / `fgets`: Viết chữ vào sổ hoặc đọc chữ từ sổ ra.\n• `fclose`: Gấp cuốn sổ lại và cất lên kệ an toàn sau khi viết xong!",
        checkPrompt: "Bạn đã hình dung được quy trình làm việc với Tệp giống như 'Mở sổ (fopen) → Ghi/Đọc → Đóng sổ (fclose)' chưa?",
        nextButtonLabel: "Đã hiểu ẩn dụ — Xem tiếp Code C minh họa →",
      },
      {
        title: "2. Áp dụng như thế nào & Code C minh họa chạy được",
        content: "Ví dụ mở cuốn sổ `result.txt` ở chế độ ghi (`\"w\"`), kiểm tra xem mở sổ có thành công không (`!= NULL`), ghi điểm 9 vào sổ rồi đóng sổ bằng `fclose`:",
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
        codeNotes: [
          "fopen(\"result.txt\", \"w\") mở tệp để ghi; nếu ổ cứng bị khóa hoặc sai đường dẫn, nó sẽ trả về NULL.",
          "fprintf(file, ...) viết dòng chữ 'Diem: 9' vào trong tệp file thay vì in ra màn hình.",
          "fclose(file) đẩy toàn bộ mực còn đọng lại xuống giấy (ổ cứng) và đóng tệp an toàn.",
        ],
        codeOutput: "Tạo result.txt với nội dung: Diem: 9",
        checkPrompt: "Bạn đã thấy bước kiểm tra `if (file == NULL)` ngay sau `fopen` và bước đóng tệp `fclose(file)` ở cuối chưa?",
        nextButtonLabel: "Đã hiểu Code C — Xem tiếp phần Bắt bệnh (Debug) →",
      },
      {
        title: "3. Phân biệt nhanh 3 chế độ mở sổ: `\"r\"`, `\"w\"` và `\"a\"`",
        content: "• `\"r\"` (read): Chỉ mở ra để đọc; nếu tệp chưa có sẵn thì `fopen` trả về `NULL`.\n• `\"w\"` (write): Mở để viết mới hoàn toàn — **cảnh báo**: nếu tệp đã có nội dung cũ, chế độ `\"w\"` sẽ xóa trắng toàn bộ nội dung cũ ngay khi mở!\n• `\"a\"` (append): Mở để viết nối thêm vào cuối trang mà vẫn giữ nguyên nội dung cũ.",
      },
      {
        title: "4. Góc Debug bắt bệnh: Lỗi đọc sổ ngay mà quên kiểm tra xem sổ có mở được không (`file == NULL`)",
        content: "Khi mới học thao tác Tệp, lỗi phổ biến nhất làm chương trình bị sập ngay lập tức là quên kiểm tra `file == NULL` sau khi gọi `fopen`:\n\n❌ Code bị lỗi (Mở tệp chưa có thật rồi đọc luôn):\nFILE *f = fopen(\"data.txt\", \"r\"); // Nếu chưa có file data.txt, f sẽ bằng NULL!\nint x = 0;\nfscanf(f, \"%d\", &x);              // LỖI SẬP CHƯƠNG TRÌNH! Đòi đọc chữ từ cuốn sổ không tồn tại\nfclose(f);\n\n• Tại sao lỗi? Khi mở tệp ở chế độ đọc `\"r\"`, nếu người dùng chưa tạo tệp `data.txt` (hoặc gõ sai tên tệp), `fopen` không tìm thấy sổ nên trả về `NULL`. Lúc đó truyền `f` vào `fscanf` giống như bắt máy tính đọc chữ từ khoảng không!\n\n✅ Code sửa đúng (Luôn kiểm tra `if (f == NULL)` trước khi đọc/ghi):\nFILE *f = fopen(\"data.txt\", \"r\");\nif (f == NULL) {\n    puts(\"Chua co tep data.txt!\");\n    return 1;\n}\nint x = 0;\nfscanf(f, \"%d\", &x);\nfclose(f);",
        checkPrompt: "Bạn đã nhớ quy tắc luôn kiểm tra `if (f == NULL)` ngay sau `fopen` và phân biệt chế độ `\"w\"` (xóa viết mới) với `\"a\"` (ghi nối thêm) chưa?",
      },
    ];
  }
  return null;
}

function getPythonStudySections(topic) {
  const topicText = topic.toLocaleLowerCase("vi");
  if (/cú pháp|thụt lề|indentation/.test(topicText)) {
    return [
      {
        title: "1. Ẩn dụ đời thường & Khái niệm: 'Gạch đầu dòng lùi vào trong vở ghi bài'",
        content: "Nếu ngôn ngữ C phải xây những bức tường ngoặc nhọn `{ ... }` và đặt dấu chấm phẩy `;` ở cuối mỗi câu, thì Python đọc giống như một trang vở ghi chép sạch đẹp của học sinh:\n• **Dấu hai chấm (`:`)**: Báo hiệu 'Sau đây là các bước con bên trong!'.\n• **Khoảng trắng thụt đầu dòng (Indentation — chuẩn 4 dấu cách)**: Giống như khi bạn viết mục lớn sát lề trái, còn các ý nhỏ bên trong thì lùi vào 1 ô vở. Tất cả những dòng cùng lùi vào thẳng hàng với nhau sẽ nằm chung trong một nhóm lệnh!\n• **`print()` và `input()`**: `print()` in kết quả ra màn hình, còn `input()` nhận chữ người dùng gõ từ bàn phím.",
        checkPrompt: "Bạn đã hình dung được cách Python dùng 'Dấu hai chấm (:) và Lùi đầu dòng thẳng hàng' để gom nhóm các câu lệnh thay cho ngoặc nhọn `{ }` chưa?",
        nextButtonLabel: "Đã hiểu 'Lùi đầu dòng' — Đẩy tiếp phần Code Python →",
      },
      {
        title: "2. Từ Ẩn dụ sang Code Python: Sáng sủa, không cần `;` và `{ }`",
        content: "Hãy xem một chương trình Python hoàn chỉnh dưới đây — bạn có thể đọc hiểu ngay từ dòng đầu tiên:",
        code: `score = 8
if score >= 5:
    print("Chuc mung ban da Dat!")
    print("Diem cua ban:", score)
print("Hoan thanh kiem tra.")`,
        codeNotes: [
          "score = 8 gán số 8 cho biến score mà không cần viết int hay dấu chấm phẩy ; ở cuối dòng.",
          "if score >= 5: kết thúc bằng dấu hai chấm (:), mở ra khối lệnh con bên dưới.",
          "Hai dòng print(...) thụt vào 4 khoảng trắng đều nằm trong nhánh if (chỉ chạy khi score >= 5).",
          "Dòng print(\"Hoan thanh...\") quay lại sát lề trái nên nằm ngoài if, lúc nào cũng được chạy.",
        ],
        codeOutput: "Chuc mung ban da Dat!\nDiem cua ban: 8\nHoan thanh kiem tra.",
        checkPrompt: "Bạn đã thấy vì sao 2 dòng `print` thụt lề thuộc về `if`, còn dòng `print` cuối cùng sát lề trái nằm ngoài `if` chưa?",
        nextButtonLabel: "Đã hiểu Code Python — Đẩy tiếp phần Bắt bệnh (Debug) →",
      },
      {
        title: "3. Quy tắc vàng bằng ngôn ngữ bình dân",
        content: "Trong Python, khoảng trắng ở đầu dòng không phải để trang trí cho đẹp mà là **luật bắt buộc**! Đã mở dấu hai chấm `:` ở cuối dòng `if`, `for`, `while`, `def` thì dòng ngay bên dưới bắt buộc phải lùi vào (thống nhất 4 dấu cách).",
      },
      {
        title: "4. Góc Debug bắt bệnh: Lỗi quên lùi đầu dòng (`IndentationError`) ngay sau dấu `:`",
        content: "Ở bài mở đầu Python này, chúng ta chỉ tập trung bắt đúng 1 lỗi kinh điển nhất mà ai mới chuyển sang Python cũng gặp ngay lần đầu gõ code:\n\n❌ Code bị lỗi (Quên lùi đầu dòng sau dấu hai chấm `:`):\nscore = 8\nif score >= 5:\nprint(\"Dat!\")  # LỖI IndentationError! Viết sát lề trái làm Python không biết lệnh nào nằm trong if\n\n• Tại sao lỗi? Sau dấu `:` của câu lệnh `if score >= 5:`, Python chờ đợi ít nhất 1 dòng lệnh được lùi vào bên trong. Vì chữ `print` vẫn đứng ngang hàng với `if`, máy tính báo lỗi `IndentationError: expected an indented block` ngay lập tức!\n\n✅ Code sửa đúng (Lùi vào 4 khoảng trắng ngay dưới dòng có dấu `:`):\nscore = 8\nif score >= 5:\n    print(\"Dat!\")  # Thụt lề 4 dấu cách chuẩn xác!",
        checkPrompt: "Bạn đã nắm chắc quy tắc 'Sau dấu hai chấm (:) bắt buộc phải lùi đầu dòng 4 khoảng trắng' chưa? Cùng làm 3 câu kiểm tra ngắn nhé!",
      },
    ];
  }
  if (/biến|kiểu dữ liệu/.test(topicText)) {
    return [
      {
        title: "1. Ẩn dụ đời thường & Khái niệm: 'Chiếc thẻ tên treo lên món đồ'",
        content: "Trong C, biến là một chiếc hộp cố định kích cỡ (hộp `int` chỉ đựng được số nguyên). Nhưng trong Python, biến giống như **một chiếc thẻ tên có dây treo (nhãn dán)**:\n• Khi viết `x = 10`, bạn buộc thẻ tên `x` vào con số nguyên `10` (`int`).\n• Ngay dòng sau viết `x = \"Xin chào\"`, bạn chỉ việc tháo thẻ tên `x` ra và buộc sang dòng chữ `\"Xin chào\"` (`str`) — cực kỳ linh hoạt (tài liệu gọi là kiểu dữ liệu động)!\n• Đặc biệt, trong Python phép chia 1 gạch `/` luôn giữ lại phần lẻ thập phân (`7 / 2` ra `3.5`), còn muốn chia lấy phần nguyên thì dùng 2 gạch `//` (`7 // 2` ra `3`).",
        checkPrompt: "Bạn đã hiểu hình ảnh biến Python như 'chiếc thẻ tên có thể tháo ra gắn sang món đồ khác' và sự khác nhau giữa `/` với `//` chưa?",
        nextButtonLabel: "Đã hiểu ẩn dụ — Đẩy tiếp phần Code Python →",
      },
      {
        title: "2. Từ Ẩn dụ sang Code Python: Các kiểu dữ liệu và phép chia `/` vs. `//`",
        content: "Đoạn code dưới đây minh họa cách Python tự nhận diện kiểu dữ liệu và phân biệt phép chia thực `/` với chia nguyên `//`:",
        code: `completed = 7
total = 2
exact_avg = completed / total
floor_div = completed // total
power = 2 ** 3

print("Chia thuc (/):", exact_avg)
print("Chia nguyen (//):", floor_div)
print("2 mũ 3 (**):", power)`,
        codeNotes: [
          "completed / total dùng 1 dấu gạch chéo / nên trả về số thực float là 3.5 (không bị mất .5 như trong C).",
          "completed // total dùng 2 dấu gạch chéo // để lấy phần nguyên là 3.",
          "2 ** 3 là phép tính lũy thừa 2 mũ 3 = 8.",
        ],
        codeOutput: "Chia thuc (/): 3.5\nChia nguyen (//): 3\n2 mũ 3 (**): 8",
        checkPrompt: "Bạn đã phân biệt rõ 3 toán tử đặc trưng của Python: `/` (chia ra số thực), `//` (chia lấy phần nguyên) và `**` (lũy thừa) chưa?",
        nextButtonLabel: "Đã hiểu Code Python — Đẩy tiếp phần Bắt bệnh (Debug) →",
      },
      {
        title: "3. Quy tắc vàng bằng ngôn ngữ bình dân: Chữ `'5'` khác với Số `5`!",
        content: "Dù Python rất thoải mái, nhưng nó **không bao giờ tự động lấy một dòng chữ đem cộng với một con số**! Đặc biệt, mọi thứ người dùng gõ vào qua lệnh `input()` đều được Python coi là **chữ viết (`str`)** (ví dụ gõ số 18 thì Python nhận được chữ `\"18\"`). Muốn đem đi cộng trừ, bạn phải đổi chữ đó thành số bằng `int(...)`.",
      },
      {
        title: "4. Góc Debug bắt bệnh: Bẫy đem 'Chữ số' từ `input()` cộng trực tiếp với Số (`TypeError`)",
        content: "Ở bài Biến & Kiểu dữ liệu này, hãy bắt ngay lỗi mà 95% người mới học Python đều vấp khi viết chương trình tính tuổi:\n\n❌ Code bị lỗi (Cộng trực tiếp kết quả `input()` với số `1`):\nage_text = \"18\"           # Giả sử người dùng gõ 18 vào input(), Python thu được chuỗi \"18\"\nnext_year = age_text + 1  # LỖI TypeError! Không thể lấy chữ \"18\" cộng với số 1!\n\n• Tại sao lỗi? Trong mắt Python, `\"18\"` nằm trong dấu nháy kép là một chuỗi văn bản (giống như chữ `\"AB\"`), còn `1` là con số toán học. Python không biết bạn muốn ghép chữ thành `\"181\"` hay cộng toán học thành `19`, nên nó dừng lại báo lỗi `TypeError`!\n\n✅ Code sửa đúng (Dùng `int()` đổi chữ thành số nguyên trước khi cộng):\nage = int(\"18\")       # Đổi chuỗi \"18\" thành con số 18\nnext_year = age + 1   # 18 + 1 = 19 (Chạy êm ru!)",
        checkPrompt: "Bạn đã hiểu vì sao phải bọc `int(...)` quanh dữ liệu chuỗi số trước khi đem cộng trừ toán học chưa?",
      },
    ];
  }
  if (/chuỗi|f-string|string/.test(topicText)) {
    return [
      {
        title: "1. Ẩn dụ đời thường & Khái niệm: 'Dòng chữ khắc trên tấm gỗ và Khuôn điền chỗ trống f-string'",
        content: "Trong Python, Chuỗi ký tự (`str`) có 2 đặc điểm cực kỳ thú vị mà bạn có thể nhớ ngay qua hình ảnh đời thường:\n• **f-string (`f\"Xin chào {name}\"`)**: Giống như một tờ giấy mời có chừa sẵn ô trống `{name}` — Python sẽ tự động lấy giá trị trong biến `name` điền thẳng vào ô trống đó mà không cần cộng nối chuỗi lằng nhằng!\n• **Tính bất biến (Immutable)**: Chuỗi trong Python giống như dòng chữ đã khắc lên tấm gỗ — bạn có thể đọc từng chữ cái (`word[0]`), nhưng không thể lấy tẩy xóa sửa riêng 1 chữ cái trên tấm gỗ đó, mà phải tạo ra một chuỗi mới!",
        checkPrompt: "Bạn đã hình dung được 'Ô trống điền tự động f-string `{...}`' và tính chất 'Dòng chữ khắc trên gỗ (không sửa lẻ 1 ký tự trực tiếp)' chưa?",
        nextButtonLabel: "Đã hiểu ẩn dụ — Đẩy tiếp phần Code Python →",
      },
      {
        title: "2. Từ Ẩn dụ sang Code Python: Dùng f-string và các công cụ làm sạch chuỗi",
        content: "Đoạn code dưới đây dùng `.strip()` để cắt bỏ khoảng trắng thừa ở 2 đầu và dùng `f-string` để tạo câu thông báo gọn đẹp:",
        code: `raw_name = "   an nguyen   "
clean_name = raw_name.strip().title()
score = 9.5

message = f"Hoc sinh {clean_name} dat {score} diem."
print(message)`,
        codeNotes: [
          "raw_name.strip() cắt sạch các dấu cách thừa ở đầu và cuối chuỗi.",
          ".title() viết hoa chữ cái đầu mỗi từ, biến \"an nguyen\" thành \"An Nguyen\".",
          "f\"Hoc sinh {clean_name} dat {score} diem.\" tự động điền cả chữ lẫn số thực 9.5 vào trong dấu ngoặc nhọn {}.",
        ],
        codeOutput: "Hoc sinh An Nguyen dat 9.5 diem.",
        checkPrompt: "Bạn đã thấy chữ `f` đứng ngay trước dấu nháy kép `f\"...\"` giúp chèn biến `{clean_name}` và `{score}` dễ dàng như thế nào chưa?",
        nextButtonLabel: "Đã hiểu Code Python — Đẩy tiếp phần Bắt bệnh (Debug) →",
      },
      {
        title: "3. Quy tắc vàng bằng ngôn ngữ bình dân",
        content: "Khi dùng `f-string`, đừng bao giờ quên chữ `f` ở ngay trước dấu nháy mở đầu! Và khi muốn đổi chữ cái trong chuỗi, hãy gán lại bằng chuỗi mới chứ không gán trực tiếp vào `s[0]`.",
      },
      {
        title: "4. Góc Debug bắt bệnh: Lỗi cố tình sửa trực tiếp 1 ký tự trong chuỗi (`TypeError`)",
        content: "Hãy xem lỗi mà những bạn học C chuyển sang Python hay mắc nhất khi thao tác với chuỗi:\n\n❌ Code bị lỗi (Cố sửa chữ cái đầu tiên bằng chỉ số `word[0]`):\nword = \"python\"\nword[0] = \"P\"   # LỖI TypeError: 'str' object does not support item assignment!\n\n• Tại sao lỗi? Như ẩn dụ ở Bước 1, chuỗi `str` trong Python là 'dòng chữ khắc trên gỗ' (bất biến — immutable). Bạn có thể đọc `word[0]` (ra `\"p\"`), nhưng không được phép gán đè `word[0] = \"P\"`!\n\n✅ Code sửa đúng (Tạo chuỗi mới từ chữ `\"P\"` ghép với phần đuôi `word[1:]` hoặc dùng `.capitalize()`):\nword = \"python\"\nword = \"P\" + word[1:]  # Tạo chuỗi mới \"Python\" rồi gắn lại thẻ tên word!",
        checkPrompt: "Bạn đã hiểu vì sao trong Python `word[0] = \"P\"` bị báo lỗi và cách tạo chuỗi mới để thay thế chưa?",
      },
    ];
  }
  if (/cấu trúc điều khiển|vòng lặp|rẽ nhánh|range/.test(topicText)) {
    return [
      {
        title: "1. Ẩn dụ đời thường & Khái niệm: 'Ngã rẽ if/elif/else và Vé tàu range(start, stop)'",
        content: "Cách rẽ nhánh và lặp trong Python gần gũi như lời nói hằng ngày:\n• **Rẽ nhiều nhánh (`if` / `elif` / `else`)**: Từ khóa `elif` là viết tắt gọn gàng của `else if` ('ngược lại, nếu...'). Kết hợp điều kiện dùng chữ tiếng Anh rõ ràng: `and` (và), `or` (hoặc), `not` (không).\n• **Vòng lặp `for` và `range(start, stop)`**: Hãy tưởng tượng `range(1, 5)` giống như tấm vé tàu ghi **'Đi từ ga số 1 và dừng lại TRƯỚC cửa ga số 5'** — tức là tàu chỉ ghé qua các ga **1, 2, 3, 4** (không bao giờ bước vào số `stop` là 5)!",
        checkPrompt: "Bạn đã nhớ quy tắc đặc biệt nhất của `range(1, 5)`: 'Bắt đầu từ 1 và dừng lại SÁT TRƯỚC 5 (chỉ lấy 1, 2, 3, 4)' chưa?",
        nextButtonLabel: "Đã hiểu 'range dừng trước vạch đích' — Đẩy tiếp phần Code Python →",
      },
      {
        title: "2. Từ Ẩn dụ sang Code Python: Xếp loại bằng `elif` và tính tổng với `range`",
        content: "Đoạn code dưới đây kiểm tra điểm bằng `if / elif / else` và dùng `range(1, 5)` để cộng `1 + 2 + 3 + 4`:",
        code: `score = 8
if score >= 8:
    rank = "Gioi"
elif score >= 5:
    rank = "Dat"
else:
    rank = "Can co gang"

total = 0
for i in range(1, 5):
    total += i

print(f"Xep loai: {rank} | Tong = {total}")`,
        codeNotes: [
          "Vì score = 8 thỏa mãn ngay nhánh đầu tiên score >= 8, biến rank nhận giá trị \"Gioi\".",
          "for i in range(1, 5): lần lượt cho i nhận các giá trị 1, 2, 3, 4 (dừng trước 5).",
          "Sau 4 vòng lặp, total = 1 + 2 + 3 + 4 = 10.",
        ],
        codeOutput: "Xep loai: Gioi | Tong = 10",
        checkPrompt: "Bạn đã thấy cách `for i in range(1, 5):` tự động tăng `i` qua `1, 2, 3, 4` rồi dừng lại ở tổng bằng `10` chưa?",
        nextButtonLabel: "Đã hiểu Code Python — Đẩy tiếp phần Bắt bệnh (Debug) →",
      },
      {
        title: "3. Quy tắc vàng bằng ngôn ngữ bình dân",
        content: "Muốn lặp từ `1` đến hết số `n` trong Python, bạn luôn phải viết số kết thúc trong `range` lớn hơn 1 đơn vị: **`range(1, n + 1)`**!",
      },
      {
        title: "4. Góc Debug bắt bệnh: Bẫy thiếu mất số cuối cùng khi dùng `range(1, n)`",
        content: "Đây là lỗi logic phổ biến số 1 khi viết vòng lặp `for` trong Python:\n\n❌ Code bị lỗi (Muốn tính tổng từ 1 đến 5 nhưng lại viết `range(1, 5)`):\ntotal = 0\nfor i in range(1, 5):  # LỖI LOGIC! Chỉ chạy 1, 2, 3, 4 — bị thiếu mất số 5!\n    total += i\nprint(total)           # In ra 10 thay vì 15!\n\n• Tại sao lỗi? Vì `range(start, stop)` luôn dừng lại **sát trước `stop`**. Khi viết `range(1, 5)`, vòng lặp dừng ngay khi chạm tới 5 nên số 5 bị bỏ quên!\n\n✅ Code sửa đúng (Viết `range(1, 6)` hoặc `range(1, n + 1)` để lấy đủ cả số 5):\ntotal = 0\nfor i in range(1, 6):  # Chạy đủ 1, 2, 3, 4, 5\n    total += i\nprint(total)           # In ra đúng 15!",
        checkPrompt: "Bạn đã nắm vững mẹo 'Muốn chạy từ 1 đến 5 thì phải viết `range(1, 6)`' chưa?",
      },
    ];
  }
  if (/list|tuple|danh sách/.test(topicText)) {
    return [
      {
        title: "1. Ẩn dụ đời thường & Khái niệm: 'Khay đồ tháo lắp được (List) và Hộp kính niêm phong (Tuple)'",
        content: "Trong Python, khi cần lưu một dãy nhiều món đồ theo thứ tự (đánh số từ toa `0`, và đặc biệt có thể đếm ngược từ toa cuối bằng số âm `-1`), bạn có 2 lựa chọn:\n• **List (`[7, 8, 10]` — ngoặc vuông)**: Giống như một khay đựng đồ mở nắp — bạn có thể thoải mái thêm đồ vào cuối (`.append()`), lấy bớt ra hoặc đổi món đồ ở bất kỳ ngăn nào.\n• **Tuple (`(7, 8, 10)` — ngoặc tròn)**: Giống như hộp kính đã niêm phong — một khi đã tạo ra thì không ai có thể sửa hay xóa phần tử bên trong, giúp bảo vệ dữ liệu cố định (như tọa độ điểm, ngày sinh).",
        checkPrompt: "Bạn đã phân biệt được `List [...]` (thêm/sửa/xóa thoải mái) với `Tuple (...)` (niêm phong cố định) và cách đếm ngược phần tử cuối bằng `[-1]` chưa?",
        nextButtonLabel: "Đã hiểu ẩn dụ — Đẩy tiếp phần Code Python →",
      },
      {
        title: "2. Từ Ẩn dụ sang Code Python: Thêm phần tử, lấy chỉ số âm `[-1]` và Cắt lát (Slicing)",
        content: "Đoạn code dưới đây thêm điểm `10` vào cuối danh sách `scores`, lấy phần tử cuối bằng `scores[-1]` và cắt lát 2 phần tử đầu bằng `scores[0:2]`:",
        code: `scores = [7, 8, 9]
scores.append(10)

first_two = scores[0:2]
last_item = scores[-1]

print("Danh sach:", scores)
print("2 diem dau:", first_two, "| Diem cuoi:", last_item)`,
        codeNotes: [
          "scores.append(10) nối thêm số 10 vào cuối danh sách scores thành [7, 8, 9, 10].",
          "scores[0:2] cắt lát từ chỉ số 0 đến sát chỉ số 2 (lấy scores[0] và scores[1], tức là [7, 8]).",
          "scores[-1] lấy thẳng phần tử cuối cùng trong danh sách là 10 mà không cần đếm tổng độ dài.",
        ],
        codeOutput: "Danh sach: [7, 8, 9, 10]\n2 diem dau: [7, 8] | Diem cuoi: 10",
        checkPrompt: "Bạn đã thấy sự tiện lợi của `.append()`, chỉ số âm `[-1]` và cắt lát `[0:2]` trong Python chưa?",
        nextButtonLabel: "Đã hiểu Code Python — Đẩy tiếp phần Bắt bệnh (Debug) →",
      },
      {
        title: "3. Quy tắc vàng bằng ngôn ngữ bình dân: 'Hai thẻ tên cùng buộc vào một cái giỏ'",
        content: "Khi bạn viết `b = a` với một danh sách `a`, Python **không hề tạo ra chiếc giỏ thứ hai**, mà chỉ buộc thêm thẻ tên `b` vào chung chiếc giỏ `a`! Muốn tạo một chiếc giỏ bản sao độc lập hoàn toàn, bạn phải viết `b = a.copy()` (hoặc `b = a[:]`).",
      },
      {
        title: "4. Góc Debug bắt bệnh: Bẫy gán `b = a` làm sửa danh sách `b` thì danh sách gốc `a` cũng bị đổi theo!",
        content: "Hãy xem căn bệnh ngầm nổi tiếng nhất khi làm việc với `List` trong Python:\n\n❌ Code bị lỗi (Tưởng `b = a` là tạo bản sao riêng):\na = [1, 2, 3]\nb = a          # CẢNH BÁO! Cả a và b đang cùng chỉ vào ĐÚNG 1 danh sách duy nhất!\nb.append(99)   # Bạn chỉ định thêm 99 vào b...\nprint(a)       # NHƯNG in a ra lại thấy [1, 2, 3, 99]! Danh sách gốc a đã bị làm hỏng!\n\n• Tại sao lỗi? Vì `b = a` chỉ dán thêm một chiếc nhãn tên `b` lên cùng danh sách mà `a` đang giữ. Mọi thay đổi qua `b` chính là thay đổi trực tiếp vào chiếc giỏ chung đó!\n\n✅ Code sửa đúng (Dùng `.copy()` để nhân bản ra một danh sách mới độc lập):\na = [1, 2, 3]\nb = a.copy()   # Tạo một chiếc giỏ mới có nội dung giống hệt a\nb.append(99)   # Chỉ thêm 99 vào giỏ b\nprint(a)       # Giỏ gốc a vẫn nguyên vẹn là [1, 2, 3]!",
        checkPrompt: "Bạn đã hiểu vì sao `b = a` làm cả hai biến cùng trỏ vào một danh sách và vì sao phải dùng `b = a.copy()` khi muốn tạo bản sao độc lập chưa?",
      },
    ];
  }
  if (/dictionary|set|từ điển|tập hợp/.test(topicText)) {
    return [
      {
        title: "1. Ẩn dụ đời thường & Khái niệm: 'Danh bạ điện thoại tra theo Tên (Dict) và Rổ lọc trùng lặp (Set)'",
        content: "Khi dữ liệu không chỉ là một hàng dọc mà cần tra cứu theo tên gọi, Python cung cấp 2 công cụ cực mạnh:\n• **Dictionary (`{\"An\": 9, \"Binh\": 8}` — Từ điển)**: Giống hệt danh bạ điện thoại trên máy bạn — thay vì phải nhớ bạn An nằm ở dòng thứ mấy, bạn chỉ cần gõ đúng **Tên khóa (`\"An\"` - Key)** là lấy ra ngay **Điểm số (`9` - Value)** trong tích tắc!\n• **Set (`{1, 2, 3}` — Tập hợp)**: Giống như một chiếc rổ thần kỳ tự động loại bỏ mọi món đồ bị trùng — nếu bạn bỏ `{1, 2, 2, 3}` vào `Set`, nó chỉ giữ lại đúng `{1, 2, 3}`!",
        checkPrompt: "Bạn đã hình dung được `Dictionary` (tra cứu theo cặp Khóa : Giá trị) và `Set` (tự động lọc bỏ các phần tử trùng nhau) chưa?",
        nextButtonLabel: "Đã hiểu ẩn dụ — Đẩy tiếp phần Code Python →",
      },
      {
        title: "2. Từ Ẩn dụ sang Code Python: Tra cứu từ điển an toàn và lọc trùng bằng Set",
        content: "Chương trình dưới đây lưu điểm bằng `dict`, tra cứu an toàn bằng `.get()` và dùng `set` để đếm xem có bao nhiêu mức điểm khác nhau:",
        code: `scores = {"An": 9, "Binh": 8}
scores["Chi"] = 9

an_score = scores.get("An", 0)
dung_score = scores.get("Dung", 0)
unique_scores = set(scores.values())

print(f"An: {an_score}, Dung: {dung_score}")
print("Cac muc diem duy nhat:", sorted(unique_scores))`,
        codeNotes: [
          "scores[\"Chi\"] = 9 thêm cặp khóa \"Chi\" : 9 vào từ điển.",
          "scores.get(\"Dung\", 0) tìm khóa \"Dung\"; vì chưa có bạn Dũng trong danh bạ nên nó trả về số mặc định là 0 một cách êm thấm.",
          "set(scores.values()) gom các điểm [9, 8, 9] lại và tự động lọc bỏ số 9 bị trùng, chỉ còn {8, 9}.",
        ],
        codeOutput: "An: 9, Dung: 0\nCac muc diem duy nhat: [8, 9]",
        checkPrompt: "Bạn đã thấy cách `.get(\"Dung\", 0)` giúp tra cứu một khóa chưa tồn tại mà vẫn trả về `0` an toàn chưa?",
        nextButtonLabel: "Đã hiểu Code Python — Đẩy tiếp phần Bắt bệnh (Debug) →",
      },
      {
        title: "3. Quy tắc vàng bằng ngôn ngữ bình dân",
        content: "Khi không chắc một cái tên (khóa) đã có trong Dictionary hay chưa, hãy ưu tiên dùng **`d.get(key, giá_trị_mặc_định)`** hoặc kiểm tra `if key in d:` trước khi mở ngoặc vuông `d[key]`.",
      },
      {
        title: "4. Góc Debug bắt bệnh: Lỗi sập chương trình (`KeyError`) vì đòi mở khóa không tồn tại trong Từ điển",
        content: "Hãy so sánh cách truy cập trực tiếp bằng ngoặc vuông `scores[\"Dung\"]` với `.get()`:\n\n❌ Code bị lỗi (Đòi lấy trực tiếp một khóa chưa có trong từ điển):\nscores = {\"An\": 9, \"Binh\": 8}\nprint(scores[\"Dung\"])  # LỖI SẬP CHƯƠNG TRÌNH (KeyError: 'Dung')!\n\n• Tại sao lỗi? Khi bạn viết `scores[\"Dung\"]`, Python tìm khắp từ điển không thấy khóa `\"Dung\"` đâu cả nên lập tức ném ra lỗi `KeyError` và dừng chương trình ngay tại dòng đó!\n\n✅ Code sửa đúng (Dùng `.get()` để nhận giá trị mặc định nếu không tìm thấy khóa):\nscores = {\"An\": 9, \"Binh\": 8}\nprint(scores.get(\"Dung\", \"Chua co diem\"))  # In ra \"Chua co diem\" an toàn tuyệt đối!",
        checkPrompt: "Bạn đã phân biệt được khi nào `d[\"khóa\"]` gây lỗi `KeyError` và cách dùng `d.get(\"khóa\", mặc_định)` để phòng tránh chưa?",
      },
    ];
  }
  if (/hàm|def|return/.test(topicText)) {
    return [
      {
        title: "1. Ẩn dụ đời thường & Khái niệm: 'Chiếc máy làm việc theo từ khóa def và Cửa trả hàng return'",
        content: "Hàm trong Python cũng giống như một chiếc máy chế biến có gắn tên, được tạo ra bằng từ khóa **`def`** (define):\n• Bạn đưa nguyên liệu vào qua các tham số trong ngoặc tròn `def tinh_tong(a, b):`.\n• Quan trọng nhất: Chiếc máy phải có câu lệnh **`return`** để **đẩy sản phẩm hoàn thiện ra cửa nhận hàng**! Nếu trong thân hàm bạn chỉ dùng `print()` (chỉ chiếu hình ảnh sản phẩm lên màn hình tivi) mà quên lệnh `return`, thì tay người gọi hàm ở bên ngoài chỉ nhận về một chiếc khay trống rỗng mang giá trị **`None`**!",
        checkPrompt: "Bạn đã phân biệt được `print()` (chỉ hiện chữ lên màn hình) với `return` (trả kết quả thật sự ra ngoài cho biến khác hứng lấy) chưa?",
        nextButtonLabel: "Đã hiểu 'print vs. return' — Đẩy tiếp phần Code Python →",
      },
      {
        title: "2. Từ Ẩn dụ sang Code Python: Viết hàm với `def`, tham số mặc định và `return`",
        content: "Hàm `calc_total` dưới đây nhận giá tiền và thuế (mặc định là `10%` nếu không truyền vào), tính tổng rồi dùng `return` trả kết quả về:",
        code: `def calc_total(price, tax_rate=0.1):
    return price + (price * tax_rate)

bill_1 = calc_total(100)
bill_2 = calc_total(100, 0.2)

print(f"Hoa don 1: {bill_1} | Hoa don 2: {bill_2}")`,
        codeNotes: [
          "def calc_total(price, tax_rate=0.1): định nghĩa hàm với tham số tax_rate có sẵn giá trị mặc định là 0.1.",
          "Khi gọi calc_total(100), Python tự dùng tax_rate = 0.1 và return trả về 110.0 cho biến bill_1.",
          "Khi gọi calc_total(100, 0.2), giá trị 0.2 ghi đè lên mặc định và trả về 120.0 cho biến bill_2.",
        ],
        codeOutput: "Hoa don 1: 110.0 | Hoa don 2: 120.0",
        checkPrompt: "Bạn đã hiểu cách hoạt động của tham số mặc định `tax_rate=0.1` và lệnh `return` trong hàm Python chưa?",
        nextButtonLabel: "Đã hiểu Code Python — Đẩy tiếp phần Bắt bệnh (Debug) →",
      },
      {
        title: "3. Quy tắc vàng bằng ngôn ngữ bình dân",
        content: "Nếu muốn lấy kết quả của hàm đem đi cộng trừ hay lưu vào biến khác, trong hàm **bắt buộc phải có `return kết_quả`**. Nếu quên `return`, hàm sẽ trả về `None` (rỗng).",
      },
      {
        title: "4. Góc Debug bắt bệnh: Lỗi dùng `print()` thay cho `return` làm biến nhận kết quả bị biến thành `None`!",
        content: "Đây là lỗi kinh điển nhất của người mới học hàm trong Python:\n\n❌ Code bị lỗi (Trong hàm chỉ `print` mà quên `return`):\ndef gap_doi(x):\n    print(x * 2)      # Chỉ in số 10 lên màn hình chứ KHÔNG trả hàng ra ngoài!\n\nket_qua = gap_doi(5)  # ket_qua nhận về giá trị rỗng None!\nprint(ket_qua + 1)    # LỖI TypeError! Không thể lấy None cộng với 1!\n\n• Tại sao lỗi? Vì hàm `gap_doi(5)` không có dòng `return`, nên sau khi in số 10 lên màn hình, nó tự động trả về `None` cho biến `ket_qua`. Đến dòng dưới, `None + 1` lập tức gây sập chương trình!\n\n✅ Code sửa đúng (Dùng `return` để trả giá trị về cho biến `ket_qua`):\ndef gap_doi(x):\n    return x * 2      # Trả kết quả 10 ra ngoài hàm\n\nket_qua = gap_doi(5)  # ket_qua hứng được số 10\nprint(ket_qua + 1)    # In ra 11 chuẩn xác!",
        checkPrompt: "Bạn đã thấy rõ vì sao quên `return` trong hàm sẽ khiến biến hứng kết quả nhận giá trị `None` và gây lỗi khi tính toán tiếp chưa?",
      },
    ];
  }
  if (/ngoại lệ|try|except|tệp|file/.test(topicText)) {
    return [
      {
        title: "1. Ẩn dụ đời thường & Khái niệm: 'Lưới bảo hiểm try/except và Cửa tự động đóng with open'",
        content: "Khi chương trình chạy thực tế, người dùng có thể nhập chữ `\"abc\"` vào ô tuổi hoặc mở một tệp chưa tồn tại:\n• **Khối `try / except`**: Giống như tấm lưới bảo hiểm của diễn viên nhào lộn — bạn đặt đoạn code có nguy cơ gặp sự cố vào trong `try:` (thử làm); nếu chẳng may trượt chân gặp lỗi (như `ValueError`, chia cho 0), chương trình sẽ rơi êm ái xuống tấm lưới `except:` để xử lý lịch sự chứ không bị sập màn hình đỏ!\n• **Cú pháp `with open(...) as f:`**: Giống như chiếc cửa có bản lề tự động đóng — ngay khi đọc/ghi tệp xong (kể cả khi gặp lỗi), Python tự động đóng tệp `f` an toàn mà bạn không bao giờ sợ quên `close()`!",
        checkPrompt: "Bạn đã hình dung được 'Tấm lưới bảo hiểm `try / except`' và 'Cửa tự động đóng tệp `with open(...) as f:`' chưa?",
        nextButtonLabel: "Đã hiểu ẩn dụ — Đẩy tiếp phần Code Python →",
      },
      {
        title: "2. Từ Ẩn dụ sang Code Python: Bắt lỗi nhập liệu bằng `try / except`",
        content: "Đoạn code dưới đây thử đổi chuỗi người dùng nhập sang số nguyên trong `try:`; nếu gặp chữ không hợp lệ, `except ValueError:` sẽ bắt lấy và gán giá trị an toàn:",
        code: `raw_input = "ba_muoi"

try:
    age = int(raw_input)
    print(f"Tuoi hop le: {age}")
except ValueError:
    age = 0
    print("Du lieu khong phai so! Gan mac dinh age = 0")`,
        codeNotes: [
          "Trong khối try:, lệnh int(\"ba_muoi\") không đổi thành số được nên phát sinh lỗi ValueError.",
          "Thay vì sập chương trình, Python nhảy ngay xuống nhánh except ValueError:.",
          "Chương trình gán age = 0 và in thông báo thân thiện cho người dùng.",
        ],
        codeOutput: "Du lieu khong phai so! Gan mac dinh age = 0",
        checkPrompt: "Bạn đã thấy cách `try / except ValueError` giữ cho chương trình tiếp tục chạy êm ái khi dữ liệu đầu vào bị sai định dạng chưa?",
        nextButtonLabel: "Đã hiểu Code Python — Đẩy tiếp phần Bắt bệnh (Debug) →",
      },
      {
        title: "3. Quy tắc vàng bằng ngôn ngữ bình dân",
        content: "Khi bắt lỗi bằng `except`, hãy nêu rõ tên lỗi cần bắt (như `except ValueError:` hoặc `except ZeroDivisionError:`), và khi làm việc với tệp tin thì luôn luôn dùng `with open(..., encoding=\"utf-8\") as f:`.",
      },
      {
        title: "4. Góc Debug bắt bệnh: Lỗi mở tệp không dùng `with` và quên đóng tệp khi xảy ra sự cố",
        content: "Hãy so sánh cách mở tệp thủ công dễ rò rỉ tài nguyên với cách dùng `with open` chuẩn của Python:\n\n❌ Code dễ gặp lỗi (Mở tệp rời rạc, nếu dòng giữa bị lỗi thì `f.close()` không bao giờ được chạy):\nf = open(\"diem.txt\", \"w\", encoding=\"utf-8\")\nf.write(123)  # LỖI TypeError (write chỉ nhận chuỗi str)! Chương trình dừng ngay, tệp f bị treo chưa đóng!\nf.close()\n\n• Tại sao nguy hiểm? Thứ nhất, `f.write()` chỉ nhận chuỗi ký tự (`\"123\"`), truyền số `123` sẽ gây lỗi `TypeError`. Thứ hai, vì lỗi xảy ra trước dòng `f.close()`, tệp tin bị bỏ lửng không được đóng!\n\n✅ Code sửa đúng (Dùng `with open` tự động đóng tệp trong mọi tình huống và truyền chuỗi vào `write`):\nwith open(\"diem.txt\", \"w\", encoding=\"utf-8\") as f:\n    f.write(\"Diem: 9\\n\")  # Khi ra khỏi khối with, tệp f tự động được đóng an toàn!",
        checkPrompt: "Bạn đã nắm vững vì sao trong Python luôn nên dùng `with open(...) as f:` và truyền chuỗi `str` vào `f.write()` chưa?",
      },
    ];
  }
  if (/hướng đối tượng|oop|class|object/.test(topicText)) {
    return [
      {
        title: "1. Ẩn dụ đời thường & Khái niệm: 'Khuôn bánh Trung Thu (Class) và Chiếc bánh thật (Object)'",
        content: "Lập trình hướng đối tượng (OOP) nghe có vẻ to tát nhưng thực chất giống hệt việc làm bánh:\n• **`class Student:` (Lớp)**: Chính là **chiếc khuôn bánh bằng gỗ** hoặc bản vẽ thiết kế — nó quy định mọi học sinh đều có Tên (`name`), Điểm (`score`) và biết tự giới thiệu.\n• **`Object / Instance` (Đối tượng)**: Là **từng chiếc bánh thật** được đóng ra từ khuôn đó (như bạn `sv1 = Student(\"An\", 9.0)`, bạn `sv2 = Student(\"Binh\", 8.5)`).\n• **Hàm `__init__` và từ khóa `self`**: `__init__` là khâu nhào nhân bánh ngay lúc mới đóng khuôn; còn chữ **`self`** đơn giản nghĩa là **'chính bản thân tôi'** (giúp phân biệt điểm của tôi `self.score` với thông tin truyền từ ngoài vào).",
        checkPrompt: "Bạn đã hiểu hình ảnh 'Khuôn bánh (`class`) — Chiếc bánh thật (`object`) — Tự gắn thông tin vào chính mình (`self.name = name`)' chưa?",
        nextButtonLabel: "Đã hiểu 'Khuôn bánh & self' — Đẩy tiếp phần Code Python →",
      },
      {
        title: "2. Từ Ẩn dụ sang Code Python: Tạo khuôn `class Student` và khởi tạo đối tượng",
        content: "Đoạn code dưới đây thiết kế khuôn `Student`, tạo ra đối tượng `student_a` và gọi phương thức `.introduce()`:",
        code: `class Student:
    def __init__(self, name, score):
        self.name = name
        self.score = score

    def introduce(self):
        return f"SV {self.name} dat {self.score} diem"

student_a = Student("An", 9.0)
print(student_a.introduce())`,
        codeNotes: [
          "def __init__(self, name, score): tự động chạy ngay khi ta gọi Student(\"An\", 9.0).",
          "self.name = name gắn tên \"An\" vào chính đối tượng student_a đang được tạo.",
          "Khi gọi student_a.introduce(), Python tự động truyền student_a vào vị trí của tham số self!",
        ],
        codeOutput: "SV An dat 9.0 diem",
        checkPrompt: "Bạn đã thấy cách Python tự động truyền `student_a` vào tham số đầu tiên `self` khi gọi `student_a.introduce()` chưa?",
        nextButtonLabel: "Đã hiểu Code Python — Đẩy tiếp phần Bắt bệnh (Debug) →",
      },
      {
        title: "3. Quy tắc vàng bằng ngôn ngữ bình dân",
        content: "Mọi hàm (phương thức) viết bên trong `class` để đối tượng sử dụng đều phải có **`self` đứng ở vị trí tham số đầu tiên** (`def ten_ham(self, ...):`), và khi lưu thuộc tính phải viết `self.ten_thuoc_tinh`.",
      },
      {
        title: "4. Góc Debug bắt bệnh: Lỗi quên tham số `self` ở đầu phương thức trong `class` (`TypeError`)",
        content: "Khi mới viết `class` trong Python, lỗi phổ biến nhất là quên viết `self` trong ngoặc tròn của phương thức:\n\n❌ Code bị lỗi (Quên chữ `self` trong `def say_hi():`):\nclass Student:\n    def say_hi():          # LỖI! Thiếu tham số đầu tiên self\n        print(\"Xin chao!\")\n\ns = Student()\ns.say_hi()                 # LỖI TypeError: Student.say_hi() takes 0 positional arguments but 1 was given!\n\n• Tại sao lỗi? Khi bạn gọi `s.say_hi()`, Python luôn tự động gửi chính đối tượng `s` vào làm đối số đầu tiên cho hàm `say_hi`. Vì bạn khai báo `def say_hi():` (không nhận tham số nào), Python báo lỗi 'Hàm nhận 0 tham số nhưng lại được truyền vào 1 đối tượng'!\n\n✅ Code sửa đúng (Luôn đặt `self` làm tham số đầu tiên của phương thức):\nclass Student:\n    def say_hi(self):\n        print(\"Xin chao!\")",
        checkPrompt: "Bạn đã hiểu vì sao mọi phương thức của đối tượng trong `class` đều phải có `self` ở vị trí đầu tiên chưa? Cùng làm 3 câu kiểm tra ngắn nhé!",
      },
    ];
  }
  return null;
}

function getStudyAnalogy(topic) {
  const normalizedTopic = topic.toLocaleLowerCase("vi");
  if (/cú pháp|thụt lề/.test(normalizedTopic)) {
    return "Hãy hình dung trang vở ghi bài: sau dấu hai chấm (:), các dòng lệnh con được viết lùi vào thẳng hàng (4 khoảng trắng) để tạo thành một nhóm thay vì dùng cặp ngoặc nhọn { }.";
  }
  if (/list|tuple/.test(normalizedTopic)) {
    return "Hãy tưởng tượng List như một khay đựng đồ mở nắp có thể thêm/bớt phần tử thoải mái, còn Tuple như chiếc hộp kính đã niêm phong không thể sửa đổi sau khi tạo.";
  }
  if (/dictionary|set|từ điển/.test(normalizedTopic)) {
    return "Hãy hình dung Dictionary như danh bạ điện thoại tra cứu cực nhanh theo Tên (Key) để lấy Số (Value), còn Set như chiếc rổ tự động lọc bỏ mọi phần tử bị trùng lặp.";
  }
  if (/hướng đối tượng|oop|class/.test(normalizedTopic)) {
    return "Hãy hình dung Class như chiếc khuôn làm bánh quy định hình dáng, còn mỗi Object là một chiếc bánh thật được đóng ra từ khuôn đó với dữ liệu riêng gắn qua từ khóa self.";
  }
  if (/ngoại lệ|try|except/.test(normalizedTopic)) {
    return "Hãy xem khối try/except như tấm lưới bảo hiểm giúp bắt lỗi an toàn mà không làm sập chương trình, còn with open(...) như chiếc cửa có bản lề tự động đóng tệp sau khi dùng xong.";
  }
  if (/mảng|chuỗi/.test(normalizedTopic)) {
    return "Hãy tưởng tượng một đoàn tàu hoặc dãy ngăn kéo được đánh số bắt đầu từ 0 (toa 0, toa 1, toa 2). Muốn lấy đúng món đồ, ta cần gọi đúng số hiệu toa từ 0 thay vì đếm từ 1 như thói quen hằng ngày.";
  }
  if (/con trỏ và hàm|swap/.test(normalizedTopic)) {
    return "Hãy hình dung việc nhờ một người bạn (hàm swap) đổi đồ giữa hai chiếc tủ khóa kín: nếu chỉ đưa ảnh chụp món đồ (truyền giá trị thường), tủ thật ở nhà không đổi; bạn phải đưa tờ giấy ghi số phòng kèm chìa khóa (&x, &y) để bạn mình mở tận tủ (*a, *b) và tráo đồ bên trong.";
  }
  if (/con trỏ|pointer/.test(normalizedTopic)) {
    return "Hãy hình dung bộ nhớ RAM như một dãy tủ gửi đồ (locker): biến score = 8 là cất số 8 vào tủ; địa chỉ &score là số phòng dán trên cửa tủ (VD: phòng 104); con trỏ pointer là tờ giấy ghi lại số phòng 104 đó; còn *pointer là cầm tờ giấy đi tìm đúng phòng 104 và mở cửa tủ ra để xem hoặc thay bằng số 9.";
  }
  if (/hàm/.test(normalizedTopic)) {
    return "Hãy xem hàm như một chiếc máy ép trái cây: đưa nguyên liệu đầu vào, máy tự chạy theo quy trình bên trong, rồi trả ra kết quả qua lệnh return để phần khác của chương trình sử dụng.";
  }
  if (/vòng lặp|cấu trúc điều khiển/.test(normalizedTopic)) {
    return "Hãy hình dung rẽ nhánh như biển báo ở ngã ba đường, còn vòng lặp như chạy bộ quanh sân vận động: mỗi vòng làm một việc và luôn phải có vạch dừng rõ ràng để không chạy mãi.";
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
  } else if (material === quizTopics.pythonProgramming.material && !remediationContent) {
    sections = getPythonStudySections(topic) || sections;
  } else if (material === quizTopics.antiUsWar.material && !remediationContent) {
    sections = getHistoryStudySections(topic) || sections;
  } else if (material === quizTopics.geography.material && !remediationContent) {
    sections = getGeographyStudySections(topic) || sections;
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
        question: "Chiến thuật tác chiến nào đã được quân và dân ta sử dụng tại Điện Biên Phủ để vô hiệu hóa ưu thế hỏa lực của Pháp?",
        options: [
          "Chuyển sang phương châm 'Đánh chắc, tiến chắc', đào hệ thống giao thông hào bao vây lấn dũi và đưa pháo vào hầm trên sườn núi",
          "Tập trung toàn bộ lực lượng đánh tổng lực trong một đêm duy nhất",
          "Dùng hải quân phong tỏa đường biển vào lòng chảo Điện Biên",
          "Rút toàn bộ lực lượng khỏi Tây Bắc để chuyển sang đấu tranh nghị trường",
        ],
        answerIndex: 0,
      },
      {
        question: "Điều gì diễn ra vào ngày 7/5/1954 tại Điện Biên Phủ và thiệt hại máy bay Pháp được History.com ghi nhận như thế nào?",
        options: [
          "Sở chỉ huy tập đoàn cứ điểm bị đánh chiếm, Pháp thất thủ (mất 62 máy bay và 167 chiếc bị hư hại)",
          "Hiệp định Genève được ký kết ngay tại hầm chỉ huy Điện Biên Phủ",
          "Quân đội Hoa Kỳ đổ bộ vào Đà Nẵng mở đầu chiến tranh cục bộ",
          "Tổng tuyển cử thống nhất Việt Nam được tổ chức trên cả hai miền",
        ],
        answerIndex: 0,
      },
    ];
  } else if (topicId === "antiUsWar" && /đồng khởi/.test(topicText)) {
    questions = [
      { question: "Phong trào Đồng Khởi bùng lên tiêu biểu ở đâu và vào năm nào?", options: ["Bến Tre, năm 1960", "Điện Biên, năm 1954", "Hà Nội, năm 1946", "Sài Gòn, năm 1975"], answerIndex: 0 },
      { question: "Trong phong trào Đồng Khởi ở miền Nam, nhân dân ta đã sáng tạo phương thức đấu tranh nào làm tan rã hàng loạt đồn bốt địch?", options: ["Kết hợp đấu tranh chính trị với vũ trang ('Ba mũi giáp công': Chính trị, Quân sự, Binh vận) và 'Đội quân tóc dài'", "Chỉ dùng pháo hạng nặng và máy bay ném bom chiến lược", "Chỉ đàm phán ngoại giao tại Paris mà không nổi dậy", "Tập kết toàn bộ lực lượng ra miền Bắc"], answerIndex: 0 },
      { question: "Khi học về Đồng Khởi (Bến Tre năm 1960), nhận định nào phản ánh đúng bản chất và thắng lợi của phong trào?", options: ["Là phong trào nổi dậy rộng khắp ở miền Nam làm tan rã bộ máy kìm kẹp cơ sở của địch và dẫn tới sự ra đời Mặt trận Dân tộc Giải phóng miền Nam Việt Nam", "Chỉ là một trận đánh đơn lẻ diễn ra trong một ngày tại một cứ điểm", "Là sự kiện kết thúc hoàn toàn chiến tranh tại miền Nam năm 1960", "Là hội nghị ký kết hiệp định đình chiến ở Đông Dương"], answerIndex: 0 },
    ];
  } else if (topicId === "antiUsWar" && /gen[eèê]ve/.test(topicText)) {
    questions = [
      { question: "Hiệp định Genève về Đông Dương được ký vào năm nào?", options: ["1954", "1960", "1968", "1973"], answerIndex: 0 },
      { question: "Giới tuyến quân sự gần vĩ tuyến 17 theo Hiệp định Genève có ý nghĩa pháp lý gì?", options: ["Phân chia vùng tập kết quân sự tạm thời, không phải biên giới quốc gia vĩnh viễn", "Biên giới quốc gia vĩnh viễn chia cắt hai nhà nước", "Ranh giới giữa Việt Nam và Lào", "Tuyến đường rút quân Hoa Kỳ năm 1973"], answerIndex: 0 },
      { question: "Hiệp định Genève dự kiến điều gì để thống nhất Việt Nam và vì sao điều đó không diễn ra?", options: ["Dự kiến tổng tuyển cử năm 1956 nhưng không diễn ra do sự can thiệp của Mỹ và chính quyền Ngô Đình Diệm từ chối hiệp thương", "Dự kiến tổng tuyển cử năm 1976 và diễn ra đúng kế hoạch", "Ký Hiệp định Paris ngay trong năm 1954", "Tổ chức Chiến dịch Hồ Chí Minh năm 1956"], answerIndex: 0 },
    ];
  } else if (topicId === "antiUsWar" && /tết 1968|mậu thân|tổng tiến công.*tết/.test(topicText)) {
    questions = [
      { question: "Tổng tiến công và nổi dậy Tết Mậu Thân diễn ra vào năm nào?", options: ["1968", "1954", "1973", "1975"], answerIndex: 0 },
      { question: "Nét độc đáo về nghệ thuật quân sự của cuộc Tổng tiến công và nổi dậy Tết Mậu Thân 1968 là gì?", options: ["Bất ngờ tiến công đồng loạt vào hầu hết các đô thị, sào huyệt đầu não của địch ở miền Nam kết hợp lực lượng Biệt động thành", "Chỉ diễn ra tại một cứ điểm rừng núi ở Điện Biên Phủ", "Chỉ là một cuộc đàm phán ngoại giao ở Paris", "Diễn ra sau ngày chiến tranh đã kết thúc"], answerIndex: 0 },
      { question: "Nhận định nào phân biệt đúng kết quả quân sự và tác động chiến lược của Tết Mậu Thân 1968?", options: ["Không đạt mọi mục tiêu quân sự dự kiến nhưng tạo tác động chính trị, truyền thông sâu rộng, làm lung lay ý chí xâm lược của Mỹ và buộc Mỹ ngồi vào bàn đàm phán", "Đạt mọi mục tiêu quân sự và kết thúc chiến tranh ngay năm 1968", "Chỉ có tác động ở một địa phương nhỏ, không ảnh hưởng tới nước Mỹ", "Là hiệp định quy định quân đội Hoa Kỳ rút năm 1973"], answerIndex: 0 },
    ];
  } else if (topicId === "antiUsWar" && /hiệp định paris|paris/.test(topicText)) {
    questions = [
      { question: "Hiệp định Paris về Việt Nam được ký vào ngày nào?", options: ["27/1/1973", "7/5/1954", "30/4/1975", "2/9/1945"], answerIndex: 0 },
      { question: "Thắng lợi quân sự vang dội nào cuối tháng 12/1972 đã đập tan cuộc tập kích B-52 của Mỹ và buộc Hoa Kỳ phải ký Hiệp định Paris?", options: ["Chiến thắng 'Điện Biên Phủ trên không' 12 ngày đêm tại Hà Nội, Hải Phòng", "Chiến dịch Biên giới thu đông năm 1950", "Phong trào Đồng Khởi Bến Tre năm 1960", "Chiến dịch Tây Nguyên tháng 3/1975"], answerIndex: 0 },
      { question: "Điều gì đúng về hệ quả của Hiệp định Paris ngày 27/1/1973?", options: ["Quân đội Hoa Kỳ rút khỏi Việt Nam ('đánh cho Mỹ cút'), nhưng xung đột giữa các lực lượng Việt Nam còn tiếp diễn tới năm 1975", "Chiến tranh tại miền Nam kết thúc ngay trong ngày ký 27/1/1973", "Việt Nam thống nhất nhà nước ngay năm 1973", "Hiệp định được ký sau ngày 30/4/1975"], answerIndex: 0 },
    ];
  } else if (topicId === "antiUsWar" && getHistoryEventKey(topic) === "endWar") {
    questions = [
      { question: "Chiến dịch Hồ Chí Minh bắt đầu vào ngày nào?", options: ["26/4/1975", "27/1/1973", "7/5/1954", "10/3/1968"], answerIndex: 0 },
      { question: "Thứ tự 3 chiến dịch lớn trong cuộc Tổng tiến công và nổi dậy mùa Xuân 1975 và sự kiện ngày 30/4/1975 là gì?", options: ["Tây Nguyên → Huế–Đà Nẵng → Hồ Chí Minh; ngày 30/4/1975 lực lượng tiến công tiến vào Sài Gòn và Tổng thống Dương Văn Minh tuyên bố đầu hàng", "Hồ Chí Minh → Tây Nguyên → Điện Biên Phủ; ký Hiệp định Paris ngày 30/4", "Đồng Khởi → Mậu Thân → Genève", "Huế–Đà Nẵng → Điện Biên Phủ → Tây Nguyên"], answerIndex: 0 },
      { question: "Sau khi chiến tranh tại miền Nam kết thúc ngày 30/4/1975, việc thống nhất đất nước về mặt nhà nước được hoàn thành vào năm nào?", options: ["1976", "1973", "1968", "1954"], answerIndex: 0 },
    ];
  } else if (topicId === "antiUsWar") {
    questions = [
      { question: "Mốc nào gắn với việc Hiệp định Genève được ký?", options: ["Năm 1954", "Năm 1960", "Năm 1968", "Năm 1975"], answerIndex: 0 },
      { question: "Mốc nào đánh dấu chiến tranh kết thúc tại miền Nam Việt Nam?", options: ["30/4/1975", "27/1/1973", "7/5/1954", "Năm 1960"], answerIndex: 0 },
      { question: "Nhận định nào phân biệt đúng Hiệp định Paris và mốc kết thúc chiến tranh?", options: ["Paris ký năm 1973, chiến tranh tại miền Nam kết thúc năm 1975", "Paris ký ngày 30/4/1975 và kết thúc chiến tranh", "Paris ký năm 1954, trước Hiệp định Genève", "Hai mốc cùng diễn ra vào năm 1968"], answerIndex: 0 },
    ];
  } else if (topicId === "geography" && /khí hậu/.test(topicText)) {
    questions = [
      { question: "[Khái niệm] Đặc điểm khí hậu chung của Việt Nam là gì và thuật ngữ 'biên độ nhiệt năm' có nghĩa là gì?", options: ["Nhiệt đới ẩm gió mùa; biên độ nhiệt năm là mức chênh lệch giữa nhiệt độ trung bình tháng nóng nhất và tháng lạnh nhất", "Ôn đới lục địa quanh năm; biên độ nhiệt là lượng mưa trung bình", "Hoang mạc khô nóng; biên độ nhiệt là độ cao của núi", "Hàn đới băng tuyết quanh năm"], answerIndex: 0 },
      { question: "[Tư duy Nhân – Quả] Tại sao miền Bắc Việt Nam có mùa đông lạnh và biên độ nhiệt năm lớn, trong khi miền Nam nóng quanh năm?", options: ["Vì miền Bắc ở vĩ độ cao hơn nên đón trực tiếp gió mùa Đông Bắc lạnh, còn gió này khi xuống phía Nam bị suy yếu và bị dãy Bạch Mã chặn lại", "Vì miền Bắc nằm ngay trên đường xích đạo còn miền Nam ở gần Bắc Cực", "Chỉ do hoạt động giao thông ở các đô thị tạo ra", "Vì miền Bắc không giáp biển còn miền Nam giáp biển"], answerIndex: 0 },
      { question: "[Vận dụng & Bản đồ] Tại sao sườn Đông dãy Trường Sơn (miền Trung) lại chịu hiện tượng gió Tây khô nóng (gió Lào) vào đầu mùa hạ?", options: ["Do khối khí Tây Nam từ vịnh Bắc Bộ / Ấn Độ Dương vượt dãy Trường Sơn bị trút mưa ở sườn Tây rồi biến tính trở nên khô nóng khi tràn xuống sườn Đông (hiệu ứng phơn)", "Do gió mùa Đông Bắc thổi trực tiếp từ biển vào giữa mùa hè", "Do miền Trung chỉ có đồng bằng châu thổ rộng lớn không có núi", "Do ảnh hưởng của băng tan từ vùng cực"], answerIndex: 0 },
    ];
  } else if (topicId === "geography" && /dân cư/.test(topicText)) {
    questions = [
      { question: "[Khái niệm] Sự khác biệt cốt lõi giữa 'gia tăng dân số tự nhiên' và 'gia tăng dân số cơ học' là gì?", options: ["Gia tăng tự nhiên là chênh lệch giữa tỷ suất sinh và tử; còn gia tăng cơ học là chênh lệch giữa nhập cư và xuất cư (di cư)", "Hai khái niệm hoàn toàn giống nhau, chỉ tính số trẻ em sinh ra", "Gia tăng tự nhiên chỉ tính ở đô thị, gia tăng cơ học chỉ tính ở miền núi", "Gia tăng cơ học là diện tích đất nông nghiệp chia cho dân số"], answerIndex: 0 },
      { question: "[Tư duy Nhân – Quả] Tại sao Đồng bằng sông Hồng, Đông Nam Bộ và Đồng bằng sông Cửu Long lại tập trung đông dân cư nhất cả nước?", options: ["Do hội tụ điều kiện tự nhiên thuận lợi (địa hình phẳng, đất phù sa, nguồn nước) và kinh tế phát triển (đô thị, công nghiệp, dịch vụ tạo nhiều việc làm hút lao động)", "Vì các vùng này toàn bộ là núi đá vôi cao trên 2.000m", "Vì ở miền núi bị cấm làm nông nghiệp", "Do dân số được chia đều tuyệt đối theo diện tích từng tỉnh"], answerIndex: 0 },
      { question: "[Vận dụng thực tế] Dân số đông và mật độ dân số quá cao ở các đô thị lớn đặt ra bài toán Nhân – Quả nào cần giải quyết?", options: ["Vừa tạo nguồn nhân lực và thị trường tiêu thụ lớn, vừa gây sức ép lên việc làm, hạ tầng giao thông, nhà ở, y tế, giáo dục và môi trường", "Làm giảm hoàn toàn nhu cầu sử dụng điện, nước và bệnh viện", "Khiến các đô thị không cần quy hoạch giao thông", "Xóa bỏ hoàn toàn sự đa dạng văn hóa giữa các dân tộc"], answerIndex: 0 },
    ];
  } else if (topicId === "geography") {
    questions = [
      { question: "[Khái niệm] Đặc điểm nổi bật của địa hình Việt Nam và hướng nghiêng chính của địa hình nước ta là gì?", options: ["Đồi núi chiếm phần lớn diện tích (chủ yếu là đồi núi thấp dưới 1.000m); địa hình nghiêng theo hướng Tây Bắc – Đông Nam", "Toàn bộ lãnh thổ là đồng bằng phẳng tuyệt đối; nghiêng từ Đông sang Tây", "Chủ yếu là núi cao phủ băng trên 4.000m", "Không có đồng bằng châu thổ và không giáp biển"], answerIndex: 0 },
      { question: "[Tư duy Nhân – Quả] Tại sao Đồng bằng sông Hồng và Đồng bằng sông Cửu Long trở thành hai vựa lúa lớn nhất, còn miền Trung lại mạnh về kinh tế biển (cảng nước sâu, thủy sản)?", options: ["Hai đồng bằng châu thổ có diện tích rộng và đất phù sa sông màu mỡ; còn miền Trung đồng bằng hẹp nhiều cát do núi sát biển nhưng bờ biển sâu, nhiều vũng vịnh kín gió", "Vì miền Trung không có biển còn hai đồng bằng châu thổ toàn là núi cao", "Vì Đồng bằng sông Cửu Long có mùa đông băng tuyết lạnh giá", "Chỉ do thói quen ngẫu nhiên, không liên quan đến địa hình hay đất đai"], answerIndex: 0 },
      { question: "[Đọc Bản đồ / Atlat] Khi phân tích một vùng địa lý được khoanh tròn trên bản đồ Atlat, quy trình tư duy nào giúp tránh học vẹt?", options: ["Xác định vị trí & giới hạn lãnh thổ → phân tích điều kiện tự nhiên & tài nguyên → giải thích mối quan hệ Nhân – Quả với dân cư và ngành kinh tế đặc trưng", "Học thuộc lòng số liệu rời rạc mà không cần nhìn vị trí trên bản đồ", "Khái quát mọi vùng trên cả nước đều có địa hình và kinh tế giống hệt nhau", "Chỉ đọc tên tỉnh thành mà bỏ qua địa hình, khí hậu và sông ngòi"], answerIndex: 0 },
    ];
  } else if (topicId === "cProgramming" && /cấu trúc chương trình/.test(topicText)) {
    questions = [
      { question: "Hàm nào là điểm bắt đầu thực thi của một chương trình C thông thường?", options: ["main", "printf", "include", "sizeof"], answerIndex: 0 },
      { question: "[Debug C] Đoạn code sau có lỗi gì khiến kết quả in ra bị sai không đoán trước được?\nint main(void) {\n    int a;\n    int b = 7;\n    printf(\"%d\", a + b);\n    return 0;\n}", options: ["Biến cục bộ a chưa được khởi tạo giá trị nên chứa giá trị rác (garbage value) trong RAM", "Hàm main không được phép khai báo hai biến int", "printf không thể in tổng của hai biến", "return 0 làm xóa giá trị của biến b trước khi in"], answerIndex: 0 },
      { question: "[Debug C] Tại sao đoạn code `int main(void); { printf(\"Hi\"); return 0; }` lại bị trình biên dịch báo lỗi cú pháp?", options: ["Dấu chấm phẩy `;` đặt ngay sau `int main(void)` làm kết thúc khai báo hàm sớm, khiến khối `{ ... }` phía sau bị tách rời", "Vì thiếu thư viện `<string.h>`", "Vì hàm `main` bắt buộc phải trả về kiểu `float`", "Vì `return 0` không được có dấu chấm phẩy"], answerIndex: 0 },
    ];
  } else if (topicId === "cProgramming" && /thư viện chuẩn|standard librar/.test(topicText)) {
    questions = [
      { question: "Header nào khai báo printf trong C?", options: ["stdio.h", "string.h", "stdlib.h", "ctype.h"], answerIndex: 0 },
      { question: "[Debug C] Đoạn code nhập số nguyên sau đây bị sập (crash) khi chạy. Lỗi nằm ở đâu và sửa thế nào?\n#include <stdio.h>\nint main(void) {\n    int age = 0;\n    scanf(\"%d\", age);\n    return 0;\n}", options: ["Thiếu toán tử lấy địa chỉ `&` trong `scanf`: phải sửa thành `scanf(\"%d\", &age);` để truyền địa chỉ biến `age`", "Phải đổi `#include <stdio.h>` thành `#include <math.h>`", "Biến `age` không được khởi tạo bằng 0 trước khi gọi `scanf`", "Phải đổi `%d` thành `%s` cho kiểu `int`"], answerIndex: 0 },
      { question: "[Debug C] Với `const char s[] = \"C\";`, sự khác biệt giữa `strlen(s)` (trong `string.h`) và `sizeof(s)` là gì?", options: ["`strlen(s)` trả về 1 (số ký tự trước `'\\0'`), còn `sizeof(s)` trả về 2 (tính cả byte kết thúc chuỗi `'\\0'`)", "`strlen(s)` trả về 2, còn `sizeof(s)` trả về 1", "Cả hai luôn trả về 0", "`strlen` tự động cấp phát thêm bộ nhớ cho mảng `s`"], answerIndex: 0 },
    ];
  } else if (topicId === "cProgramming" && /biến|kiểu dữ liệu/.test(topicText)) {
    questions = [
      { question: "Kiểu int thường dùng để biểu diễn loại giá trị nào?", options: ["Số nguyên", "Chuỗi ký tự C", "Địa chỉ web", "Tệp đang mở"], answerIndex: 0 },
      { question: "[Debug C] Lập trình viên viết `double avg = (double)(7 / 2);` và mong đợi `avg` bằng `3.5`, nhưng kết quả lại ra `3.0`. Vì sao và sửa thế nào?", options: ["Do `7 / 2` là phép chia hai số `int` nên bị cắt phần thập phân thành `3` trước khi ép kiểu; cần sửa thành `(double)7 / 2` hoặc `7.0 / 2`", "Do kiểu `double` trong C chỉ lưu được số nguyên", "Do thiếu toán tử `&` trước số 7", "Do phép chia trong C luôn làm tròn xuống 0"], answerIndex: 0 },
      { question: "[Debug C] Khi cần biết kích thước thực tế (số byte) của một kiểu hoặc biến trên hệ thống đang chạy để tránh lỗi tràn bộ nhớ, ta dùng toán tử nào?", options: ["sizeof (ví dụ `sizeof(int)` hoặc `sizeof *ptr`)", "strlen", "malloc", "return"], answerIndex: 0 },
    ];
  } else if (topicId === "cProgramming" && /con trỏ và hàm|swap/.test(topicText)) {
    questions = [
      { question: "[Ẩn dụ & Bản chất] Tại sao muốn hàm `swap` đổi được giá trị của hai biến `x, y` trong `main`, ta phải truyền địa chỉ `swap(&x, &y)` cho hai con trỏ `int *a, int *b`?", options: ["Vì cần đưa 'số phòng' (`&x, &y`) để hàm dùng `*a, *b` mở đúng hai chiếc tủ gốc và tráo đổi giá trị bên trong; truyền bình thường chỉ gửi bản sao", "Vì hàm trong C không nhận được số nguyên `int`", "Vì dấu `&` giúp tự động cộng hai số `x` và `y`", "Vì `main` không thể tự khai báo biến"], answerIndex: 0 },
      { question: "[Debug C] Trong hàm `void swap(int *a, int *b)`, nếu lập trình viên viết `int *temp = a; a = b; b = temp;` thì chuyện gì xảy ra với hai biến `x, y` ở hàm `main`?", options: ["Hai biến `x, y` ở `main` KHÔNG HỀ ĐỔI CHỖ, vì code đó chỉ đổi số phòng ghi trên 2 tờ giấy nháp `a, b` chứ chưa dùng `*a, *b` để mở tủ đổi đồ bên trong", "Hai biến `x, y` đổi chỗ thành công như bình thường", "Chương trình bị xóa sạch mã nguồn", "Hai biến `x, y` tự động biến thành 0"], answerIndex: 0 },
      { question: "[Debug C] Tại sao hàm `int* taoDiem(void) { int s = 10; return &s; }` lại là một lỗi nghiêm trọng (trả về số phòng của chiếc tủ tạm)?", options: ["Vì biến `s` chỉ là 'chiếc tủ dựng tạm' bên trong hàm, ngay khi hàm kết thúc thì tủ `s` bị dỡ bỏ, khiến tờ giấy địa chỉ trả về chỉ vào nơi không còn tồn tại (Con trỏ treo)", "Vì không được dùng dấu `&` cho biến `s`", "Vì số 10 là số chẵn nên không trả về được", "Vì hàm không được phép có lệnh `return`"], answerIndex: 0 },
    ];
  } else if (topicId === "cProgramming" && /con trỏ|pointer/.test(topicText)) {
    questions = [
      { question: "[Ẩn dụ Tủ đồ Locker] Trong hình ảnh ví von bộ nhớ RAM như dãy tủ đồ, biến con trỏ `int *pointer = &score;` đóng vai trò là gì?", options: ["Là tờ giấy ghi lại 'số phòng / địa chỉ' (`&score`) của chiếc tủ `score`", "Là tên của một hàm thư viện chuẩn", "Là một chuỗi văn bản dài cố định", "Là dung lượng ổ cứng máy tính"], answerIndex: 0 },
      { question: "[Đọc hiểu Code C] Cho `int score = 8; int *pointer = &score; *pointer = 9;`. Sau khi chạy xong 3 lệnh này, giá trị trong tủ `score` bằng bao nhiêu và vì sao?", options: ["`score` bằng `9`, vì `*pointer = 9` đã cầm tờ giấy tìm đúng phòng của `score` và mở tủ thay số 8 bằng số 9", "`score` vẫn bằng `8`, vì `*pointer` chỉ sửa trên tờ giấy nháp", "`score` bằng `17` (cộng 8 với 9)", "Chương trình báo lỗi không biên dịch được"], answerIndex: 0 },
      { question: "[Debug C] Đoạn code ngắn của người mới học dưới đây mắc lỗi gì khiến chương trình bị sập ngay khi chạy?\nint *pointer = NULL;\n*pointer = 100;", options: ["Cầm 'tờ giấy trắng' (`pointer = NULL`, chưa ghi số phòng của chiếc tủ có thật nào) mà đã dùng `*pointer = 100` để đòi mở tủ cất đồ", "Không được phép cất số `100` vào biến kiểu `int`", "Dấu `*` chỉ dùng được cho phép nhân hai số", "Bắt buộc phải đặt tên biến là `score` mới chạy được"], answerIndex: 0 },
    ];
  } else if (topicId === "cProgramming" && /hàm/.test(topicText)) {
    questions = [
      { question: "Hàm trong C giúp ích chính yếu điều gì?", options: ["Chia chương trình thành các phần có nhiệm vụ rõ ràng", "Tự động kiểm tra mọi lỗi logic", "Thay thế hoàn toàn kiểu dữ liệu", "Cấp phát bộ nhớ mà không cần khai báo"], answerIndex: 0 },
      { question: "[Debug C] Tại sao sau khi chạy đoạn code sau, biến `x` trong `main` vẫn bằng 5 mà không tăng lên 15?\nvoid addTen(int a) { a = a + 10; }\nint main(void) { int x = 5; addTen(x); }", options: ["Vì C truyền đối số theo giá trị (pass-by-value), hàm `addTen` chỉ sửa bản sao `a`; muốn sửa `x` phải truyền địa chỉ `addTen(&x)` với tham số `int *a`", "Vì tên tham số `a` khác tên biến `x`", "Vì hàm `void` không được phép thực hiện phép cộng", "Vì biến `x` chưa được khai báo là toàn cục"], answerIndex: 0 },
      { question: "[Debug C] Để sửa hàm hoán đổi hai số `void swap(int *a, int *b)` hoạt động đúng, thân hàm phải viết như thế nào?", options: ["`int temp = *a; *a = *b; *b = temp;` (hoán đổi giá trị tại địa chỉ mà `a` và `b` trỏ tới)", "`int *temp = a; a = b; b = temp;` (chỉ đổi chỗ hai con trỏ cục bộ)", "`*a = *b; *b = *a;` (làm mất giá trị ban đầu của `*a`)", "`return a + b;`"], answerIndex: 0 },
    ];
  } else if (topicId === "cProgramming" && /cấu trúc điều khiển|vòng lặp|rẽ nhánh/.test(topicText)) {
    questions = [
      { question: "Cấu trúc nào dùng để lựa chọn nhánh theo điều kiện?", options: ["if / else", "include", "sizeof", "typedef"], answerIndex: 0 },
      { question: "[Debug C] Đoạn code kiểm tra điểm dưới đây luôn in ra `\"Diem tuyet doi!\"` ngay cả khi `score = 3`. Lỗi nằm ở đâu?\nint score = 3;\nif (score = 10) {\n    puts(\"Diem tuyet doi!\");\n}", options: ["Dùng nhầm toán tử gán `=` thay vì toán tử so sánh bằng `==` trong `if (score = 10)`, làm `score` bị gán thành 10 (khác 0 nên luôn đúng)", "Hàm `puts` luôn chạy bất kể điều kiện `if` đúng hay sai", "Kiểu `int` không so sánh được với số 10", "Thiếu từ khóa `else` nên `if` luôn đúng"], answerIndex: 0 },
      { question: "[Debug C] Đoạn code vòng lặp sau đây mắc lỗi gì?\nint i = 0;\nwhile (i < 5);\n{\n    printf(\"%d \", i);\n    i++;\n}", options: ["Dấu chấm phẩy `;` đặt ngay sau `while (i < 5);` tạo thân vòng lặp rỗng làm `i` không bao giờ tăng, gây treo máy (vòng lặp vô hạn)", "Biến `i` không được bắt đầu từ 0", "Trong `while` không được dùng `printf`", "Điều kiện `i < 5` bị sai cú pháp"], answerIndex: 0 },
    ];
  } else if (topicId === "cProgramming" && /mảng|chuỗi/.test(topicText)) {
    questions = [
      { question: "Chỉ số của phần tử đầu tiên trong mảng C là bao nhiêu?", options: ["0", "1", "-1", "Tùy giá trị phần tử"], answerIndex: 0 },
      { question: "[Debug C] Tìm lỗi tràn biên mảng (Off-by-one) trong đoạn code tính tổng sau:\nint a[3] = {7, 8, 10};\nint sum = 0;\nfor (int i = 0; i <= 3; i++) {\n    sum += a[i];\n}", options: ["Điều kiện `i <= 3` làm vòng lặp truy cập `a[3]` vượt ngoài biên mảng (chỉ số hợp lệ của `a[3]` chỉ là 0, 1, 2); phải sửa thành `i < 3`", "Mảng `a[3]` bắt buộc phải đánh chỉ số từ `i = 1`", "Toán tử `+=` không dùng được với phần tử mảng", "Biến `sum` phải khởi tạo bằng 3"], answerIndex: 0 },
      { question: "[Debug C] Tại sao khai báo chuỗi `char name[3] = \"An!\";` rồi gọi `printf(\"%s\", name);` lại gây lỗi đọc tràn bộ nhớ?", options: ["Vì chuỗi `\"An!\"` gồm 3 ký tự nên cần mảng tối thiểu 4 phần tử (`char name[4]`) để chứa thêm ký tự kết thúc chuỗi `'\\0'`", "Vì mảng `char` không lưu được dấu chấm than `!`", "Vì `printf` không hỗ trợ in mảng `char`", "Vì kích thước mảng trong C luôn phải là số chẵn"], answerIndex: 0 },
    ];
  } else if (topicId === "cProgramming" && /struct|cấu trúc dữ liệu/.test(topicText)) {
    questions = [
      { question: "struct hữu ích nhất khi nào?", options: ["Khi cần gom các trường có liên quan, có thể khác kiểu, thành một bản ghi", "Khi cần tự động kiểm tra biên mảng", "Khi muốn mọi biến có cùng một giá trị", "Khi cần thay thế mọi hàm"], answerIndex: 0 },
      { question: "[Debug C] Cho `Student s = {\"An\", 18, 8.5f}; Student *p = &s;`. Dòng code `printf(\"%.1f\", p.score);` báo lỗi biên dịch vì sao?", options: ["Vì `p` là con trỏ tới struct nên phải dùng toán tử mũi tên `p->score` (hoặc `(*p).score`) chứ không dùng dấu chấm `p.score`", "Vì con trỏ không thể trỏ tới biến `struct`", "Vì trường `score` kiểu `float` không thể in bằng `printf`", "Vì phải viết `p&score`"], answerIndex: 0 },
      { question: "[Debug C] Muốn viết hàm `void capNhatDiem(Student *sv, float diemMoi)` để sửa trực tiếp điểm của hồ sơ gốc, câu lệnh nào trong hàm là đúng?", options: ["`sv->score = diemMoi;`", "`sv.score = diemMoi;`", "`*sv = diemMoi;`", "`&sv->score = diemMoi;`"], answerIndex: 0 },
    ];
  } else if (topicId === "cProgramming" && /bộ nhớ động|malloc|calloc/.test(topicText)) {
    questions = [
      { question: "malloc có thể trả về giá trị nào khi cấp phát thất bại?", options: ["NULL", "Luôn trả về địa chỉ hợp lệ", "Số byte đã cấp phát", "Ký tự '\\0'"], answerIndex: 0 },
      { question: "[Debug C] Đoạn code cấp phát mảng 5 số nguyên sau đây có 2 lỗi nguy hiểm nào?\nint *arr = malloc(5);\narr[0] = 10;\nfree(arr);\nprintf(\"%d\\n\", arr[0]);", options: ["(1) Cấp phát thiếu nhân kích thước kiểu (`malloc(5 * sizeof *arr)` thay vì `malloc(5)`), và (2) Truy cập `arr[0]` sau khi đã `free(arr)` (Use-after-free)", "Gọi `free(arr)` quá ít lần (phải gọi `free` 5 lần cho 5 phần tử)", "Hàm `malloc` không được gán cho con trỏ `int *`", "Không được gán `arr[0] = 10` trước khi gọi `free`"], answerIndex: 0 },
      { question: "[Debug C] Điều gì xảy ra nếu hàm cấp phát `int *p = malloc(100 * sizeof *p);` nhưng kết thúc hàm mà quên gọi `free(p)`?", options: ["Gây rò rỉ bộ nhớ (Memory Leak) vì vùng nhớ trên Heap không được trả lại cho hệ thống", "Trình biên dịch tự động báo lỗi cú pháp và từ chối biên dịch", "Vùng nhớ đó tự động chuyển thành biến toàn cục", "Chương trình chạy nhanh gấp đôi"], answerIndex: 0 },
    ];
  } else if (topicId === "cProgramming" && /tệp|file/.test(topicText)) {
    questions = [
      { question: "Nếu fopen thất bại, giá trị trả về cần kiểm tra là gì?", options: ["NULL", "EOF luôn luôn", "0 ký tự trong tệp", "Một chuỗi rỗng"], answerIndex: 0 },
      { question: "[Debug C] Đoạn code đọc tệp dưới đây có nguy cơ bị crash ngay tại `fscanf` vì sao?\nFILE *f = fopen(\"data.txt\", \"r\");\nint x;\nfscanf(f, \"%d\", &x);\nfclose(f);", options: ["Thiếu bước kiểm tra `if (f == NULL)` ngay sau `fopen`; nếu tệp `data.txt` không tồn tại thì `f` là `NULL` và `fscanf` sẽ gây lỗi", "Chế độ `\"r\"` sẽ xóa sạch tệp `data.txt`", "Hàm `fscanf` không được dùng dấu `&` trước biến `x`", "Phải gọi `fclose(f)` trước khi gọi `fscanf`"], answerIndex: 0 },
      { question: "[Debug C] Một bạn muốn ghi nối thêm điểm mới vào cuối tệp `lichsu.txt` mà không làm mất dữ liệu cũ, nhưng lại viết `fopen(\"lichsu.txt\", \"w\")`. Hậu quả là gì và sửa thế nào?", options: ["Chế độ `\"w\"` sẽ xóa trắng toàn bộ nội dung cũ của tệp; phải sửa thành chế độ `\"a\"` (append) để nối thêm vào cuối tệp", "Chế độ `\"w\"` chỉ cho phép đọc chứ không cho phép ghi", "Tệp sẽ tự động bị đổi tên", "Phải dùng `free(f)` thay cho `fclose(f)`"], answerIndex: 0 },
    ];
  } else if (topicId === "pythonProgramming" && /cú pháp|thụt lề/.test(topicText)) {
    questions = [
      { question: "[Ẩn dụ Vở ghi bài] Trong Python, thay vì dùng cặp ngoặc nhọn `{ }` như C, điều gì bắt buộc phải có để gom các câu lệnh con vào bên trong câu lệnh `if score >= 5:`?", options: ["Lùi đầu dòng (thụt lề / indentation, chuẩn 4 khoảng trắng) cho các dòng lệnh con ngay bên dưới dấu hai chấm `:`", "Đặt dấu chấm phẩy `;` ở cuối mỗi dòng lệnh", "Viết toàn bộ chương trình trên một dòng duy nhất", "Khai báo `#include <stdio.h>` ở đầu bài"], answerIndex: 0 },
      { question: "[Đọc hiểu Code Python] Trong đoạn code:\nscore = 8\nif score >= 5:\n    print(\"Dat\")\nprint(\"Xong\")\nTại sao dòng `print(\"Xong\")` lúc nào cũng được in ra ngay cả khi `score = 3`?", options: ["Vì `print(\"Xong\")` viết sát lề trái (không thụt lề), nên nó nằm ngoài khối `if` và luôn được chạy tiếp theo", "Vì Python luôn chạy mọi lệnh từ dưới lên trên", "Vì `score = 3` lớn hơn `5`", "Vì hàm `print` bỏ qua mọi điều kiện"], answerIndex: 0 },
      { question: "[Debug Python] Đoạn code sau báo lỗi `IndentationError: expected an indented block` ngay khi chạy:\nif score >= 5:\nprint(\"Chuc mung!\")\nNguyên nhân và cách sửa đúng là gì?", options: ["Dòng `print(\"Chuc mung!\")` nằm ngay sau dấu `:` của `if` nhưng quên lùi đầu dòng; cần thụt vào 4 khoảng trắng trước `print`", "Thiếu dấu chấm phẩy `;` sau chữ `print(\"Chuc mung!\")`", "Trong Python không được phép dùng dấu `>=`", "Phải đổi `print` thành `printf`"], answerIndex: 0 },
    ];
  } else if (topicId === "pythonProgramming" && /biến|kiểu dữ liệu/.test(topicText)) {
    questions = [
      { question: "[Ẩn dụ Thẻ tên] Khác với ngôn ngữ C, sự khác biệt giữa phép chia `7 / 2` và `7 // 2` trong Python 3 là gì?", options: ["`7 / 2` trả về số thực `3.5` (giữ phần lẻ), còn `7 // 2` trả về phần nguyên `3`", "Cả hai đều trả về `3` như trong C", "`7 / 2` trả về `3`, còn `7 // 2` là viết chú thích", "`7 // 2` dùng để tính lũy thừa 7 mũ 2"], answerIndex: 0 },
      { question: "[Debug Python] Người học viết đoạn code sau và gặp lỗi `TypeError: can only concatenate str (not \"int\") to str`:\nage = \"18\"\nprint(age + 1)\nTại sao bị lỗi và sửa thế nào?", options: ["Vì `\"18\"` đang là chuỗi chữ (`str`) nên không cộng trực tiếp với số `1` được; phải đổi thành số bằng `int(age) + 1`", "Vì Python không có phép cộng `+`", "Vì số `18` quá lớn đối với kiểu `int`", "Vì tên biến không được đặt là `age`"], answerIndex: 0 },
      { question: "[Bản chất Kiểu động] Trong Python, điều gì xảy ra khi ta viết `x = 10` ở dòng 1 rồi viết `x = \"Xin chao\"` ở dòng 2?", options: ["Hợp lệ hoàn toàn: chiếc 'thẻ tên' `x` được tháo khỏi số nguyên `10` (`int`) và gắn sang chuỗi `\"Xin chao\"` (`str`)", "Báo lỗi biên dịch vì `x` đã cố định là kiểu `int`", "Chương trình tự động xóa biến `x`", "Giá trị của `x` trở thành `None`"], answerIndex: 0 },
    ];
  } else if (topicId === "pythonProgramming" && /chuỗi|f-string|string/.test(topicText)) {
    questions = [
      { question: "[Ẩn dụ Khuôn điền chỗ trống] Với `name = \"An\"` và `score = 9.5`, cách viết `f-string` nào dưới đây tạo ra chuỗi `\"An dat 9.5 diem\"` gọn và chuẩn nhất?", options: ["`f\"{name} dat {score} diem\"`", "`\"{name} dat {score} diem\"` (thiếu chữ `f` ở đầu)", "`f\"(name) dat (score) diem\"`", "`\"%d dat %s diem\"`"], answerIndex: 0 },
      { question: "[Debug Python] Tại sao đoạn code sửa chữ cái đầu tiên dưới đây lại làm sập chương trình với lỗi `TypeError: 'str' object does not support item assignment`?\nword = \"python\"\nword[0] = \"P\"", options: ["Vì chuỗi (`str`) trong Python là bất biến ('dòng chữ khắc trên gỗ' - immutable), không cho phép sửa trực tiếp 1 ký tự tại `word[0]`; phải tạo chuỗi mới `word = \"P\" + word[1:]`", "Vì chỉ số đầu tiên của chuỗi trong Python phải là `word[1]`", "Vì chữ `\"P\"` viết hoa không nằm trong bảng chữ cái Python", "Vì biến `word` chưa được khai báo kiểu `char`"], answerIndex: 0 },
      { question: "[Vận dụng Chuỗi] Khi người dùng nhập tên có dính khoảng trắng thừa ở hai đầu như `\"   an nguyen   \"`, kết hợp phương thức nào giúp làm sạch thành `\"An Nguyen\"`?", options: ["`raw_name.strip().title()`", "`raw_name.split().lower()`", "`raw_name.append()`", "`sizeof(raw_name)`"], answerIndex: 0 },
    ];
  } else if (topicId === "pythonProgramming" && /cấu trúc điều khiển|vòng lặp|rẽ nhánh|range/.test(topicText)) {
    questions = [
      { question: "[Ẩn dụ Vé tàu range] Trong Python, vòng lặp `for i in range(1, 5):` sẽ lần lượt cho biến `i` nhận những giá trị nào?", options: ["`1, 2, 3, 4` (bắt đầu từ `1` và dừng lại SÁT TRƯỚC `5`, không lấy số `5`)", "`1, 2, 3, 4, 5`", "`0, 1, 2, 3, 4, 5`", "`1, 5`"], answerIndex: 0 },
      { question: "[Debug Python] Một bạn muốn tính tổng các số từ `1` đến `5` (`1+2+3+4+5 = 15`) nhưng đoạn code sau chỉ ra kết quả bằng `10`:\ntotal = 0\nfor i in range(1, 5):\n    total += i\nLỗi logic nằm ở đâu và sửa thế nào?", options: ["`range(1, 5)` dừng trước số 5 nên bị thiếu mất số 5; phải sửa thành `range(1, 6)` để chạy đủ từ 1 đến 5", "Phải đổi `total += i` thành `total = i`", "Biến `total` ban đầu phải gán bằng `5`", "Vòng lặp `for` trong Python không cộng được số nguyên"], answerIndex: 0 },
      { question: "[Cú pháp Rẽ nhánh] Khi cần kiểm tra nhiều nhánh điều kiện liên tiếp trong Python ('ngược lại, nếu...'), ta dùng từ khóa nào và kết hợp điều kiện bằng chữ gì?", options: ["Dùng từ khóa `elif` và các từ khóa logic `and`, `or`, `not`", "Dùng `else if` và ký hiệu `&&`, `||` như trong C", "Dùng `elseif` và dấu chấm phẩy `;`", "Dùng `#ifdef`"], answerIndex: 0 },
    ];
  } else if (topicId === "pythonProgramming" && /list|tuple|danh sách/.test(topicText)) {
    questions = [
      { question: "[Ẩn dụ Khay đồ & Hộp kính] Cho danh sách `scores = [7, 8, 9, 10]`. Biểu thức `scores[-1]` và phép cắt lát `scores[0:2]` trả về kết quả gì?", options: ["`scores[-1]` trả về phần tử cuối là `10`; `scores[0:2]` trả về `[7, 8]` (từ chỉ số 0 đến sát chỉ số 2)", "`scores[-1]` báo lỗi; `scores[0:2]` trả về `[7, 8, 9]`", "`scores[-1]` trả về `7`; `scores[0:2]` trả về `10`", "Cả hai đều trả về `None`"], answerIndex: 0 },
      { question: "[Debug Python] Hãy tìm nguyên nhân căn bệnh ngầm trong đoạn code sau:\na = [1, 2, 3]\nb = a\nb.append(99)\nprint(a)  # In ra [1, 2, 3, 99]!", options: ["Phép gán `b = a` không tạo bản sao mới mà chỉ buộc thêm thẻ tên `b` vào cùng chiếc giỏ danh sách `a`; muốn tạo bản sao độc lập phải viết `b = a.copy()` (hoặc `b = a[:]`) ", "Hàm `print(a)` bị lỗi in nhầm sang biến `b`", "Phương thức `.append(99)` luôn thêm số 99 vào mọi biến trong chương trình", "Danh sách `a` trong Python không cho phép chứa 3 số"], answerIndex: 0 },
      { question: "[So sánh List & Tuple] Khi nào bạn nên dùng `Tuple` `(10, 20)` thay vì `List` `[10, 20]`?", options: ["Khi dữ liệu là cố định (như tọa độ điểm, cấu hình hằng số) và bạn muốn niêm phong để tránh bị sửa đổi nhầm trong lúc chương trình chạy", "Khi cần dùng `.append()` để thêm hàng trăm phần tử mới liên tục", "Khi cần sắp xếp lại các phần tử tại chỗ bằng `.sort()`", "Khi muốn xóa bớt phần tử đầu tiên"], answerIndex: 0 },
    ];
  } else if (topicId === "pythonProgramming" && /dictionary|set|từ điển|tập hợp/.test(topicText)) {
    questions = [
      { question: "[Ẩn dụ Danh bạ & Rổ lọc trùng] Kết quả của tập hợp `set([9, 8, 9, 10, 8])` là gì và `Dictionary` dùng để làm gì?", options: ["`set` tự động lọc bỏ các số trùng nhau chỉ giữ lại `{8, 9, 10}`; còn `Dictionary` lưu các cặp `khóa: giá_trị` để tra cứu nhanh theo khóa", "`set` giữ nguyên cả 5 số `[9, 8, 9, 10, 8]`; còn `Dictionary` chỉ lưu số nguyên", "`set` cộng tổng các số lại; `Dictionary` là tên gọi khác của vòng lặp", "Cả hai đều báo lỗi cú pháp"], answerIndex: 0 },
      { question: "[Debug Python] Đoạn code tra cứu điểm dưới đây bị sập ngay lập tức với lỗi `KeyError: 'Dung'`:\nscores = {\"An\": 9, \"Binh\": 8}\nprint(scores[\"Dung\"])\nCách sửa nào giúp tra cứu an toàn mà không bị sập?", options: ["Dùng phương thức `.get()` với giá trị mặc định: `scores.get(\"Dung\", 0)` (hoặc kiểm tra `if \"Dung\" in scores:` trước)", "Đổi ngoặc vuông `scores[\"Dung\"]` thành ngoặc tròn `scores(\"Dung\")`", "Dùng toán tử mũi tên `scores->Dung`", "Gọi `free(scores)` trước khi `print`"], answerIndex: 0 },
      { question: "[Bẫy cú pháp Python] Nếu bạn viết `x = {}` trong Python thì `x` là kiểu dữ liệu gì, và làm sao để tạo một tập hợp (`set`) rỗng?", options: ["`{}` tạo ra một Từ điển (`dict`) rỗng; muốn tạo tập hợp (`set`) rỗng bắt buộc phải viết `set()`", "`{}` tạo ra `set` rỗng; còn `dict()` tạo ra danh sách", "`{}` báo lỗi cú pháp vì không có phần tử bên trong", "`{}` tạo ra một Tuple rỗng"], answerIndex: 0 },
    ];
  } else if (topicId === "pythonProgramming" && /hàm|def|return/.test(topicText)) {
    questions = [
      { question: "[Ẩn dụ Cửa trả hàng return] Trong Python, từ khóa nào dùng để định nghĩa hàm và chuyện gì xảy ra nếu hàm không có câu lệnh `return`?", options: ["Dùng từ khóa `def`; nếu không có `return`, hàm tự động trả về giá trị rỗng `None`", "Dùng từ khóa `void`; nếu không có `return`, hàm trả về số `0`", "Dùng từ khóa `function`; nếu thiếu `return` sẽ báo lỗi cú pháp không chạy được", "Dùng từ khóa `main`"], answerIndex: 0 },
      { question: "[Debug Python] Tại sao đoạn code dưới đây lại bị lỗi `TypeError: unsupported operand type(s) for +: 'NoneType' and 'int'` ở dòng cuối?\ndef gap_doi(x):\n    print(x * 2)\nket_qua = gap_doi(5)\nprint(ket_qua + 1)", options: ["Vì hàm `gap_doi` chỉ dùng `print(x * 2)` để hiện lên màn hình mà quên `return x * 2`, khiến `ket_qua` nhận giá trị `None`", "Vì Python không cho phép nhân `x * 2` bên trong hàm", "Vì không được truyền số `5` vào hàm", "Vì tên biến không được có dấu gạch dưới `_`"], answerIndex: 0 },
      { question: "[Tham số mặc định] Với hàm `def calc_total(price, tax_rate=0.1): return price + price * tax_rate`, lời gọi `calc_total(100)` và `calc_total(100, 0.2)` lần lượt trả về bao nhiêu?", options: ["`110.0` (dùng mức thuế mặc định `0.1`) và `120.0` (dùng mức thuế mới `0.2` truyền vào)", "Cả hai đều trả về `110.0`", "Báo lỗi thiếu tham số ở lời gọi đầu tiên `calc_total(100)`", "Trả về `100` và `200`"], answerIndex: 0 },
    ];
  } else if (topicId === "pythonProgramming" && /ngoại lệ|try|except|tệp|file/.test(topicText)) {
    questions = [
      { question: "[Ẩn dụ Lưới bảo hiểm] Khi người dùng nhập chuỗi `\"ba_muoi\"` vào hàm `int(\"ba_muoi\")`, làm thế nào để chương trình bắt được lỗi `ValueError` và xử lý êm ái mà không bị sập?", options: ["Đặt lệnh chuyển đổi trong khối `try:` và bắt lỗi bằng `except ValueError:`", "Dùng câu lệnh `#include <stdlib.h>`", "Kiểm tra `if int == NULL:`", "Dùng vòng lặp `while True:` không điều kiện dừng"], answerIndex: 0 },
      { question: "[Debug Python] Tại sao đoạn code ghi tệp dưới đây vừa bị lỗi `TypeError`, vừa làm tệp `diem.txt` không được đóng lại?\nf = open(\"diem.txt\", \"w\", encoding=\"utf-8\")\nf.write(123)\nf.close()", options: ["Vì `f.write()` chỉ nhận chuỗi `str` (`\"123\"`) nên truyền số `123` gây lỗi ngay dòng 2 làm dòng `f.close()` bị bỏ qua; cần dùng `with open(...) as f:` và truyền chuỗi", "Vì chế độ `\"w\"` không cho phép ghi vào tệp", "Vì Python không hỗ trợ bảng mã `utf-8`", "Vì phải gọi `f.close()` trước khi gọi `f.write()`"], answerIndex: 0 },
      { question: "[Thực hành tốt nhất] Ưu điểm lớn nhất của việc mở tệp bằng `with open(\"data.txt\", \"r\", encoding=\"utf-8\") as f:` là gì?", options: ["Python tự động đóng tệp `f` an toàn ngay khi ra khỏi khối `with`, kể cả khi có lỗi bất ngờ xảy ra bên trong", "Tệp được tự động xóa khỏi ổ cứng sau khi đọc", "Giúp bỏ qua mọi lỗi cú pháp trong toàn bộ chương trình", "Không cần truyền tên tệp vào hàm `open`"], answerIndex: 0 },
    ];
  } else if (topicId === "pythonProgramming" && /hướng đối tượng|oop|class|object/.test(topicText)) {
    questions = [
      { question: "[Ẩn dụ Khuôn bánh & Chiếc bánh] Trong lập trình hướng đối tượng Python, `class`, `object` và phương thức `__init__` đóng vai trò gì?", options: ["`class` là khuôn mẫu thiết kế, `object` là đối tượng cụ thể tạo ra từ khuôn, còn `__init__` tự động khởi tạo các thuộc tính ban đầu cho đối tượng", "`class` là một vòng lặp, `object` là một tệp văn bản, còn `__init__` dùng để xóa bộ nhớ", "`__init__` chỉ chạy khi chương trình kết thúc", "`class` chỉ chứa được một biến duy nhất"], answerIndex: 0 },
      { question: "[Debug Python] Đoạn code dưới đây báo lỗi `TypeError: Student.say_hi() takes 0 positional arguments but 1 was given` khi gọi `s.say_hi()`. Vì sao và sửa thế nào?\nclass Student:\n    def say_hi():\n        print(\"Xin chao!\")\ns = Student()\ns.say_hi()", options: ["Phương thức `say_hi` trong `class` bị thiếu tham số đầu tiên `self` (Python luôn tự truyền đối tượng `s` vào vị trí đầu tiên); phải sửa thành `def say_hi(self):`", "Khi gọi hàm không được viết dấu ngoặc tròn `s.say_hi()`", "Không được đặt tên lớp viết hoa chữ cái đầu `Student`", "Phải dùng mũi tên `s->say_hi()`"], answerIndex: 0 },
      { question: "[Đọc hiểu Code OOP] Trong phương thức `def __init__(self, name, score): self.name = name`, dòng lệnh `self.name = name` có tác dụng gì?", options: ["Gắn giá trị tham số `name` vừa truyền vào thành thuộc tính `.name` của chính đối tượng (`self`) đang được tạo", "Xóa biến `name` khỏi bộ nhớ", "So sánh xem `self.name` có bằng `name` hay không", "Tạo một biến toàn cục cho mọi tệp Python"], answerIndex: 0 },
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
        pythonProgramming: "Lập trình Python",
      }[topicId];
      lesson.title = topicId === "cProgramming" || topicId === "pythonProgramming"
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
      generator: "Luna AI · mở bài tức thì",
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
        system: "Bạn là gia sư đang giải đáp thắc mắc chỉ trong phạm vi một chặng học. Chỉ dùng nội dung bài học được cung cấp. Nếu câu hỏi cần kiến thức ngoài nội dung đó, không suy đoán và đặt inScope=false; answer khi đó phải hướng người học sang Chat với Luna để tìm hiểu sâu hơn. Trả JSON tiếng Việt với inScope (boolean) và answer (tối đa 1600 ký tự).",
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
      return res.status(502).json({ error: "Chưa giải đáp được câu hỏi lúc này. Bạn có thể thử lại hoặc mở Chat với Luna." });
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
            generator: "Luna AI · giải thích theo tài liệu",
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
            generator: "Luna AI · lời giải theo tài liệu",
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
        system: "Bạn là gia sư Luna, trò chuyện tự nhiên và đánh giá câu trả lời dựa trên tài liệu. Đánh giá nội dung, không đòi hỏi cách diễn đạt y hệt. Khi câu trả lời sai hoặc thiếu, chỉ rõ cụ thể ý nào sai/thiếu, giải thích vì sao dựa trên tài liệu, nêu kiến thức cần tập trung và gợi ý để học sinh tự suy luận tiếp; tuyệt đối chưa tiết lộ đáp án mẫu. Khi đúng, xác nhận và đưa giải thích chi tiết cùng ví dụ cụ thể. Trả đúng JSON tiếng Việt gồm correct, feedback, whyWrong, focus, hint, explanation, example.",
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
