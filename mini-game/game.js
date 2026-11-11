import Database from "better-sqlite3";
import express from "express";
import { randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const questionBanks = {
  english: {
    title: "Từ vựng tiếng Anh",
    questions: [
      { prompt: "Định nghĩa", question: "(n) mũ bảo hiểm", options: ["safety helmet (/ˈseɪf.ti ˈhel.mət/)", "city council (/ˌsɪt.i ˈkaʊn.səl/)", "protective (/prəˈtek.tɪv/)", "development (/dɪˈvel.əp.mənt/)"], answer: 0, explanation: "Safety helmet nghĩa là mũ bảo hiểm." },
      { prompt: "Định nghĩa", question: "(v) khám phá", options: ["discover", "borrow", "protect", "prepare"], answer: 0, explanation: "Discover nghĩa là khám phá hoặc phát hiện." },
      { prompt: "Định nghĩa", question: "(adj) tò mò", options: ["curious", "careful", "crowded", "common"], answer: 0, explanation: "Curious nghĩa là tò mò, ham tìm hiểu." },
      { prompt: "Định nghĩa", question: "(n) môi trường", options: ["environment", "equipment", "appointment", "entertainment"], answer: 0, explanation: "Environment nghĩa là môi trường." },
      { prompt: "Định nghĩa", question: "(v) cải thiện", options: ["improve", "include", "imagine", "invite"], answer: 0, explanation: "Improve nghĩa là cải thiện hoặc nâng cao." },
      { prompt: "Định nghĩa", question: "(n) sự lựa chọn", options: ["choice", "change", "chance", "challenge"], answer: 0, explanation: "Choice nghĩa là sự lựa chọn." },
      { prompt: "Định nghĩa", question: "(adj) đáng tin cậy", options: ["reliable", "available", "valuable", "comfortable"], answer: 0, explanation: "Reliable nghĩa là đáng tin cậy." },
      { prompt: "Định nghĩa", question: "(v) bảo vệ", options: ["protect", "produce", "provide", "prevent"], answer: 0, explanation: "Protect nghĩa là bảo vệ." },
      { prompt: "Định nghĩa", question: "(n) lời khuyên", options: ["advice", "advance", "address", "adventure"], answer: 0, explanation: "Advice nghĩa là lời khuyên." },
      { prompt: "Định nghĩa", question: "(adj) có lợi", options: ["beneficial", "beautiful", "believable", "available"], answer: 0, explanation: "Beneficial nghĩa là có lợi." },
      { prompt: "Định nghĩa", question: "(v) đạt được", options: ["achieve", "accept", "avoid", "appear"], answer: 0, explanation: "Achieve nghĩa là đạt được." },
      { prompt: "Định nghĩa", question: "(n) sự phát triển", options: ["development", "department", "direction", "description"], answer: 0, explanation: "Development nghĩa là sự phát triển." },
      { prompt: "Định nghĩa", question: "(adj) kiên nhẫn", options: ["patient", "pleasant", "private", "popular"], answer: 0, explanation: "Patient nghĩa là kiên nhẫn." },
      { prompt: "Định nghĩa", question: "(v) lựa chọn", options: ["choose", "check", "change", "continue"], answer: 0, explanation: "Choose nghĩa là lựa chọn." },
      { prompt: "Định nghĩa", question: "(n) mục tiêu", options: ["goal", "guide", "grade", "guest"], answer: 0, explanation: "Goal nghĩa là mục tiêu." },
    ],
  },
  cProgramming: {
    title: "Lập trình C",
    questions: [
      { prompt: "Kiến thức C", question: "Chỉ số đầu tiên của một mảng trong C là gì?", options: ["0", "1", "-1", "Tùy kích thước mảng"], answer: 0, explanation: "Chỉ số mảng trong C bắt đầu từ 0." },
      { prompt: "Kiến thức C", question: "Hàm nào thường dùng để in dữ liệu ra màn hình?", options: ["printf", "scanf", "malloc", "sizeof"], answer: 0, explanation: "printf được khai báo trong thư viện stdio.h và dùng để xuất dữ liệu." },
      { prompt: "Kiến thức C", question: "Ký tự nào kết thúc một chuỗi kiểu C?", options: ["\\0", "\\n", "\\t", "EOF"], answer: 0, explanation: "Chuỗi kiểu C kết thúc bằng ký tự null '\\0'." },
      { prompt: "Kiến thức C", question: "Toán tử nào dùng để lấy địa chỉ của biến?", options: ["&", "*", "%", "->"], answer: 0, explanation: "Toán tử & lấy địa chỉ của một đối tượng." },
      { prompt: "Kiến thức C", question: "Lệnh nào kết thúc vòng lặp gần nhất ngay lập tức?", options: ["break", "continue", "return", "switch"], answer: 0, explanation: "break thoát khỏi vòng lặp hoặc switch gần nhất." },
      { prompt: "Kiến thức C", question: "Thư viện chuẩn nào khai báo printf và scanf?", options: ["stdio.h", "stdlib.h", "string.h", "math.h"], answer: 0, explanation: "stdio.h khai báo các hàm nhập xuất chuẩn như printf và scanf." },
      { prompt: "Kiến thức C", question: "Từ khóa nào khai báo biến không được gán lại qua tên biến đó?", options: ["const", "static", "extern", "volatile"], answer: 0, explanation: "const đánh dấu đối tượng không thể sửa đổi qua tên đó." },
      { prompt: "Kiến thức C", question: "Hàm main thường trả về kiểu dữ liệu nào?", options: ["int", "char", "float", "void*"], answer: 0, explanation: "Theo chuẩn C, main trả về int." },
      { prompt: "Kiến thức C", question: "Toán tử nào truy cập giá trị thông qua con trỏ?", options: ["*", "&", "&&", "::"], answer: 0, explanation: "Toán tử một ngôi * giải tham chiếu con trỏ." },
      { prompt: "Kiến thức C", question: "Vòng lặp nào luôn chạy phần thân ít nhất một lần?", options: ["do-while", "while", "for", "Không vòng lặp nào"], answer: 0, explanation: "do-while kiểm tra điều kiện sau khi chạy phần thân." },
      { prompt: "Kiến thức C", question: "Hàm cấp phát bộ nhớ động thường dùng nào?", options: ["malloc", "printf", "strlen", "fopen"], answer: 0, explanation: "malloc cấp phát một vùng nhớ động và được khai báo trong stdlib.h." },
      { prompt: "Kiến thức C", question: "Hàm nào giải phóng vùng nhớ cấp phát động?", options: ["free", "delete", "remove", "clear"], answer: 0, explanation: "free trả lại vùng nhớ đã cấp phát động." },
      { prompt: "Kiến thức C", question: "Chỉ thị nào đưa thư viện vào chương trình?", options: ["#include", "#define", "#pragma", "#ifdef"], answer: 0, explanation: "#include yêu cầu xử lý nội dung của tệp tiêu đề." },
      { prompt: "Kiến thức C", question: "Kiểu nào phù hợp để lưu một ký tự đơn?", options: ["char", "int*", "void", "struct"], answer: 0, explanation: "char là kiểu ký tự cơ bản trong C." },
      { prompt: "Kiến thức C", question: "Từ khóa nào chuyển sang lượt lặp tiếp theo?", options: ["continue", "break", "switch", "case"], answer: 0, explanation: "continue bỏ phần còn lại của lượt hiện tại và chuyển sang lượt tiếp theo." },
    ],
  },
  history: {
    title: "Lịch sử Việt Nam",
    questions: [
      { prompt: "Mốc lịch sử", question: "Hiệp định Paris về Việt Nam được ký vào năm nào?", options: ["1973", "1954", "1968", "1976"], answer: 0, explanation: "Hiệp định Paris được ký ngày 27/1/1973." },
      { prompt: "Mốc lịch sử", question: "Phong trào Đồng Khởi tiêu biểu diễn ra tại Bến Tre vào năm nào?", options: ["1960", "1954", "1965", "1975"], answer: 0, explanation: "Bến Tre là địa phương tiêu biểu của phong trào Đồng Khởi năm 1960." },
      { prompt: "Mốc lịch sử", question: "Cuộc Tổng tiến công và nổi dậy Tết Mậu Thân diễn ra vào năm nào?", options: ["1968", "1960", "1973", "1976"], answer: 0, explanation: "Tết Mậu Thân diễn ra vào đầu năm 1968." },
      { prompt: "Mốc lịch sử", question: "Chiến dịch Hồ Chí Minh diễn ra trong năm nào?", options: ["1975", "1973", "1968", "1976"], answer: 0, explanation: "Chiến dịch Hồ Chí Minh diễn ra vào tháng 4/1975." },
      { prompt: "Mốc lịch sử", question: "Ngày 30/4/1975 gắn với sự kiện nào?", options: ["Chiến tranh kết thúc tại miền Nam", "Ký Hiệp định Genève", "Ký Hiệp định Paris", "Tổng tuyển cử năm 1976"], answer: 0, explanation: "Ngày 30/4/1975 là mốc chiến tranh kết thúc tại miền Nam." },
      { prompt: "Mốc lịch sử", question: "Hiệp định Genève về Đông Dương được ký vào năm nào?", options: ["1954", "1960", "1973", "1975"], answer: 0, explanation: "Hiệp định Genève được ký năm 1954." },
      { prompt: "Mốc lịch sử", question: "Việc thống nhất nhà nước Việt Nam được thực hiện vào năm nào?", options: ["1976", "1973", "1975", "1968"], answer: 0, explanation: "Việc thống nhất nhà nước được thực hiện năm 1976." },
      { prompt: "Mốc lịch sử", question: "Quân chiến đấu Hoa Kỳ đổ bộ vào Đà Nẵng vào năm nào?", options: ["1965", "1954", "1960", "1973"], answer: 0, explanation: "Quân chiến đấu Hoa Kỳ đổ bộ vào Đà Nẵng năm 1965." },
      { prompt: "Mốc lịch sử", question: "Chiến dịch nào mở đầu trong chuỗi chiến dịch mùa Xuân năm 1975?", options: ["Tây Nguyên", "Hồ Chí Minh", "Huế–Đà Nẵng", "Điện Biên Phủ"], answer: 0, explanation: "Chiến dịch Tây Nguyên là chiến dịch đầu tiên trong chuỗi chiến dịch mùa Xuân 1975." },
      { prompt: "Mốc lịch sử", question: "Hiệp định Paris được ký vào ngày nào?", options: ["27/1/1973", "30/4/1975", "2/9/1945", "7/5/1954"], answer: 0, explanation: "Hiệp định Paris được ký ngày 27/1/1973." },
      { prompt: "Mốc lịch sử", question: "Sự kiện Đồng Khởi bùng lên ở miền Nam vào khoảng thời gian nào?", options: ["Cuối thập niên 1950 và đầu thập niên 1960", "Đầu thập niên 1970", "Cuối thập niên 1940", "Sau năm 1976"], answer: 0, explanation: "Phong trào Đồng Khởi bùng lên cuối thập niên 1950 và đầu thập niên 1960." },
      { prompt: "Mốc lịch sử", question: "Chiến dịch Huế–Đà Nẵng thuộc giai đoạn nào?", options: ["Mùa Xuân năm 1975", "Năm 1954", "Tết Mậu Thân 1968", "Sau năm 1976"], answer: 0, explanation: "Chiến dịch Huế–Đà Nẵng diễn ra trong mùa Xuân năm 1975." },
      { prompt: "Mốc lịch sử", question: "Hiệp định Paris quy định điều gì về quân đội Hoa Kỳ?", options: ["Rút khỏi Việt Nam", "Đổ bộ vào Đà Nẵng", "Tổ chức tổng tuyển cử năm 1976", "Thành lập phong trào Đồng Khởi"], answer: 0, explanation: "Theo tiến trình Hiệp định Paris, quân đội Hoa Kỳ rút khỏi Việt Nam." },
      { prompt: "Mốc lịch sử", question: "Tết Mậu Thân 1968 diễn ra chủ yếu ở đâu?", options: ["Nhiều đô thị và địa bàn ở miền Nam", "Chỉ tại Hà Nội", "Chỉ tại Bến Tre", "Chỉ tại Đà Nẵng"], answer: 0, explanation: "Cuộc Tổng tiến công diễn ra tại nhiều đô thị và địa bàn ở miền Nam." },
      { prompt: "Mốc lịch sử", question: "Sau Hiệp định Paris năm 1973, điều gì vẫn tiếp diễn?", options: ["Xung đột giữa các lực lượng Việt Nam", "Chiến tranh đã hoàn toàn kết thúc", "Tổng tuyển cử đã diễn ra", "Hiệp định Genève được ký lại"], answer: 0, explanation: "Xung đột giữa các lực lượng Việt Nam tiếp tục; chiến tranh chưa kết thúc vào năm 1973." },
    ],
  },
  geography: {
    title: "Địa lý Việt Nam",
    questions: [
      { prompt: "Bản đồ Việt Nam", question: "Thủ đô của Việt Nam là thành phố nào?", options: ["Hà Nội", "Huế", "Đà Nẵng", "Cần Thơ"], answer: 0, explanation: "Hà Nội là thủ đô của Việt Nam." },
      { prompt: "Sông ngòi", question: "Sông nào là con sông lớn chảy qua miền Tây Nam Bộ?", options: ["Sông Hồng", "Sông Tiền", "Sông Đà", "Sông Mã"], answer: 1, explanation: "Sông Tiền là nhánh chính của sông Cửu Long tại miền Tây Nam Bộ." },
      { prompt: "Vùng biển", question: "Biển Đông giáp phần lớn bờ biển của vùng nào ở Việt Nam?", options: ["Miền Trung và miền Nam", "Chỉ miền Bắc", "Chỉ Tây Nguyên", "Chỉ vùng núi phía Bắc"], answer: 0, explanation: "Biển Đông giáp bờ biển miền Trung, miền Nam và một phần miền Bắc Việt Nam." },
      { prompt: "Địa hình", question: "Dãy núi lớn chạy theo biên giới Việt – Lào là gì?", options: ["Trường Sơn", "Hoàng Liên Sơn", "Bạch Mã", "Côn Đảo"], answer: 0, explanation: "Dãy Trường Sơn chạy dài ở miền Trung Việt Nam và theo biên giới với Lào." },
      { prompt: "Khí hậu", question: "Dải đất Việt Nam nằm chủ yếu trong đới khí hậu nào?", options: ["Nhiệt đới gió mùa", "Ôn đới lục địa", "Cực", "Hoang mạc"], answer: 0, explanation: "Việt Nam thuộc đới khí hậu nhiệt đới gió mùa." },
      { prompt: "Kinh tế biển", question: "Vịnh nào nổi tiếng ở Quảng Ninh với hàng nghìn đảo đá?", options: ["Vịnh Hạ Long", "Vịnh Thái Lan", "Vịnh Bắc Bộ", "Vịnh Nha Trang"], answer: 0, explanation: "Vịnh Hạ Long ở Quảng Ninh là di sản thiên nhiên nổi tiếng thế giới." },
      { prompt: "Đồng bằng", question: "Đồng bằng sông Hồng chủ yếu nằm ở miền nào của Việt Nam?", options: ["Miền Bắc", "Miền Trung", "Tây Nguyên", "Miền Nam"], answer: 0, explanation: "Đồng bằng sông Hồng là vùng đồng bằng lớn ở miền Bắc Việt Nam." },
      { prompt: "Đồng bằng", question: "Đồng bằng sông Cửu Long còn được gọi là vùng nào?", options: ["Vùng Đồng bằng Nam Bộ", "Vùng Tây Bắc", "Vùng Đông Bắc", "Vùng Duyên hải miền Trung"], answer: 0, explanation: "Đồng bằng sông Cửu Long còn gọi là Đồng bằng Nam Bộ hoặc Tây Nam Bộ." },
      { prompt: "Thành phố", question: "Thành phố nào nằm ở cửa sông Hồng ra biển?", options: ["Hải Phòng", "Huế", "Đà Lạt", "Bạc Liêu"], answer: 0, explanation: "Hải Phòng là thành phố cảng lớn nằm gần cửa biển của miền Bắc, trong vùng cửa sông Hồng và hệ sông ven biển." },
      { prompt: "Đảo quần đảo", question: "Quần đảo Hoàng Sa thuộc vùng biển của tỉnh, thành phố nào trước khi sáp nhập hành chính?", options: ["Đà Nẵng", "Khánh Hòa", "Quảng Ninh", "Kiên Giang"], answer: 0, explanation: "Quần đảo Hoàng Sa nằm trên vùng biển thuộc địa giới hành chính thành phố Đà Nẵng theo cấu trúc hành chính trước khi sáp nhập." },
      { prompt: "Địa hình cao nguyên", question: "Tây Nguyên nổi tiếng với loại địa hình chủ yếu nào?", options: ["Các cao nguyên badan", "Đồng bằng phù sa ven biển", "Đầm phá ven sông", "Thung lũng trũng sâu"], answer: 0, explanation: "Tây Nguyên là vùng cao nguyên, nhiều cao nguyên badan như Kon Tum, Đắk Lắk, Lâm Viên." },
      { prompt: "Dân cư", question: "Mật độ dân cư thường cao nhất ở vùng nào của Việt Nam?", options: ["Đồng bằng và ven biển", "Núi cao hiểm trở", "Rừng nguyên sinh", "Đỉnh núi cao"], answer: 0, explanation: "Dân cư tập trung nhiều nhất ở đồng bằng, ven biển và các thành phố lớn." },
      { prompt: "Khoáng sản", question: "Than đá là khoáng sản nổi bật ở tỉnh, thành phố nào?", options: ["Quảng Ninh", "Cà Mau", "Đồng Tháp", "Bắc Giang"], answer: 0, explanation: "Quảng Ninh là vùng có mỏ than đá nổi tiếng của Việt Nam." },
      { prompt: "Tài nguyên", question: "Dầu khí lớn ở thềm lục địa Việt Nam chủ yếu thuộc vùng biển nào?", options: ["Phía Nam Việt Nam", "Miền Bắc ven núi", "Tây Nguyên", "Đông Bắc biên giới"], answer: 0, explanation: "Các mỏ dầu khí trọng điểm của Việt Nam chủ yếu nằm trên thềm lục địa phía Nam." },
      { prompt: "Giao thông", question: "Quốc lộ 1 nối liền chủ yếu khu vực nào của Việt Nam?", options: ["Các vùng từ Bắc vào Nam", "Các huyện ở đảo Phú Quốc", "Các cao nguyên Tây Nguyên", "Chỉ vùng Trung du miền núi"], answer: 0, explanation: "Quốc lộ 1 là trục đường xuyên suốt từ Bắc vào Nam Việt Nam." },
    ],
  },
};

const pictureQuestionBanks = {
  english: {
    title: "Đuổi hình bắt chữ · Tiếng Anh",
    questions: [
      { image: "/images/picture-xedap.svg", answer: "BICYCLE", letters: "B I C Y C L E", hint: "English: a vehicle with two wheels" },
      { image: "/images/picture-bongden.svg", answer: "LAMP", letters: "L A M P", hint: "English: it gives light in a room" },
      { image: "/images/picture-mattrang.svg", answer: "MOON", letters: "M O O N", hint: "English: it shines at night in the sky" },
      { image: "/images/picture-maybay.svg", answer: "AIRPLANE", letters: "A I R P L A N E", hint: "English: it flies passengers through the sky" },
      { image: "/images/picture-congau.svg", answer: "BEAR", letters: "B E A R", hint: "English: a large furry animal that may hibernate" },
    ],
  },
  cProgramming: {
    title: "Đuổi hình bắt chữ · Ngôn ngữ C",
    questions: [
      { image: "/images/picture-c-printf.svg", answer: "PRINTF", letters: "P R I N T F", hint: "Hàm in ra màn hình trong thư viện stdio.h" },
      { image: "/images/picture-c-array.svg", answer: "ARRAY", letters: "A R R A Y", hint: "Cấu trúc lưu nhiều phần tử cùng kiểu, bắt đầu từ chỉ số 0" },
      { image: "/images/picture-c-pointer.svg", answer: "POINTER", letters: "P O I N T E R", hint: "Biến chứa địa chỉ của một vùng nhớ" },
      { image: "/images/picture-c-break.svg", answer: "BREAK", letters: "B R E A K", hint: "Từ khóa thoát vòng lặp hoặc switch ngay lập tức" },
      { image: "/images/picture-c-malloc.svg", answer: "MALLOC", letters: "M A L L O C", hint: "Hàm cấp phát bộ nhớ động trong stdlib.h" },
    ],
  },
  history: {
    title: "Đuổi hình bắt chữ · Lịch sử Việt Nam",
    questions: [
      { image: "/images/picture-history-paris.svg", answer: "PARIS1973", letters: "P A R I S 1 9 7 3", hint: "Hiệp định chấm dứt chiến tranh, ký năm 1973" },
      { image: "/images/picture-history-bentre.svg", answer: "BENTRE1960", letters: "B E N T R E 1 9 6 0", hint: "Địa phương tiêu biểu của phong trào Đồng Khởi" },
      { image: "/images/picture-history-mauthan.svg", answer: "MAUTHAN1968", letters: "M A U T H A N 1 9 6 8", hint: "Tổng tiến công nổi dậy dịp Tết năm 1968" },
      { image: "/images/picture-history-1975.svg", answer: "HCM1975", letters: "H C M 1 9 7 5", hint: "Chiến dịch giải phóng miền Nam năm 1975" },
      { image: "/images/picture-history-dienbien.svg", answer: "DIENBIEN1954", letters: "D I E N B I E N 1 9 5 4", hint: "Chiến thắng quyết định kết thúc chiến tranh Đông Dương" },
    ],
  },
};

function shuffleLetters(answer, suppliedLetters) {
  const letters = suppliedLetters ? suppliedLetters.split(" ").filter(Boolean) : [...answer.replaceAll(" ", "")];
  for (let index = letters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [letters[index], letters[swapIndex]] = [letters[swapIndex], letters[index]];
  }
  return letters;
}

function obstacleNumber(value, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error("Hình minh họa AI tạo có tọa độ không hợp lệ.");
  }
  return Number(value.toFixed(2));
}

function obstacleColor(value) {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error("Hình minh họa AI tạo có màu không hợp lệ.");
  }
  return value;
}

function createObstacleIllustration(illustration) {
  const background = obstacleColor(illustration?.background);
  if (!Array.isArray(illustration.elements) || illustration.elements.length < 10 || illustration.elements.length > 30) {
    throw new Error("AI phải tự vẽ hình minh họa bằng ít nhất 10 chi tiết vector.");
  }
  const shapes = illustration.elements.map((shape) => {
    if (!shape || typeof shape !== "object") throw new Error("Hình minh họa AI tạo không đúng định dạng.");
    if (shape.type === "circle") {
      const cx = obstacleNumber(shape.cx, 0, 100);
      const cy = obstacleNumber(shape.cy, 0, 100);
      const r = obstacleNumber(shape.r, 0.5, 50);
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${obstacleColor(shape.fill)}"/>`;
    }
    if (shape.type === "ellipse") {
      const cx = obstacleNumber(shape.cx, 0, 100);
      const cy = obstacleNumber(shape.cy, 0, 100);
      const rx = obstacleNumber(shape.rx, 0.5, 50);
      const ry = obstacleNumber(shape.ry, 0.5, 50);
      return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${obstacleColor(shape.fill)}"/>`;
    }
    if (shape.type === "rect") {
      const x = obstacleNumber(shape.x, 0, 100);
      const y = obstacleNumber(shape.y, 0, 100);
      const width = obstacleNumber(shape.width, 0.5, 100);
      const height = obstacleNumber(shape.height, 0.5, 100);
      if (x + width > 100 || y + height > 100) throw new Error("Hình chữ nhật trong tranh AI nằm ngoài khung vẽ.");
      const rx = obstacleNumber(shape.rx ?? 0, 0, Math.min(width, height) / 2);
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${obstacleColor(shape.fill)}"/>`;
    }
    if (shape.type === "line") {
      const x1 = obstacleNumber(shape.x1, 0, 100);
      const y1 = obstacleNumber(shape.y1, 0, 100);
      const x2 = obstacleNumber(shape.x2, 0, 100);
      const y2 = obstacleNumber(shape.y2, 0, 100);
      const strokeWidth = obstacleNumber(shape.strokeWidth, 0.5, 8);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${obstacleColor(shape.stroke)}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`;
    }
    if (shape.type === "polygon") {
      if (!Array.isArray(shape.points) || shape.points.length < 3 || shape.points.length > 16) {
        throw new Error("Đa giác trong tranh AI không hợp lệ.");
      }
      const points = shape.points.map((point) => {
        if (!Array.isArray(point) || point.length !== 2) throw new Error("Điểm vẽ trong tranh AI không hợp lệ.");
        return `${obstacleNumber(point[0], 0, 100)},${obstacleNumber(point[1], 0, 100)}`;
      }).join(" ");
      return `<polygon points="${points}" fill="${obstacleColor(shape.fill)}"/>`;
    }
    throw new Error("Hình minh họa AI dùng một loại hình chưa được hỗ trợ.");
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${background}"/>${shapes.join("")}</svg>`;
  return svg;
}

async function createObstacleQuestionSet(topicId, clueCount, generateQuestions, recentGeneratedQuestions) {
  if (typeof generateQuestions !== "function") {
    throw new Error("Chế độ này cần AI để tạo bộ chướng ngại vật theo chủ đề.");
  }
  const bank = questionBanks[topicId];
  const historyKey = `obstacle:${topicId}`;
  const previousQuestions = recentGeneratedQuestions.get(historyKey) || [];
  const result = await generateQuestions({
    topicId,
    topic: bank.title,
    count: clueCount,
    avoidQuestions: previousQuestions,
    avoidKeywords: recentGeneratedQuestions.get(`${historyKey}:keywords`) || [],
    mode: "obstacle",
  });
  const generated = result?.questions;
  const obstacle = result?.obstacle;
  validateGeneratedQuestions(generated, clueCount + 1);
  if (!obstacle || typeof obstacle.keyword !== "string" || !obstacle.keyword.trim()
    || typeof obstacle.logic !== "string" || !obstacle.logic.trim()) {
    throw new Error("AI không trả đúng từ khóa và giải thích logic của chướng ngại vật.");
  }
  const illustration = createObstacleIllustration(obstacle.illustration);
  const keyword = normalizeQuestionText(obstacle.keyword).replaceAll(" ", "");
  if (!/^[\p{L}\p{N}]{2,32}$/u.test(keyword)) {
    throw new Error("Từ khóa AI tạo không hợp lệ.");
  }
  const centralQuestion = generated[clueCount];
  if (normalizeQuestionText(centralQuestion.options[centralQuestion.answer]).replaceAll(" ", "") !== keyword) {
    throw new Error("Đáp án đúng của ô trung tâm phải khớp chính xác với từ khóa chướng ngại vật.");
  }
  const previousSet = new Set(previousQuestions.map(normalizeQuestionText));
  if (generated.some((question) => previousSet.has(normalizeQuestionText(question.question)))) {
    throw new Error("AI lặp lại câu hỏi của ván gần đây.");
  }
  recentGeneratedQuestions.set(
    historyKey,
    [...previousQuestions, ...generated.map((question) => question.question)].slice(-40),
  );
  recentGeneratedQuestions.set(
    `${historyKey}:keywords`,
    [...(recentGeneratedQuestions.get(`${historyKey}:keywords`) || []), obstacle.keyword].slice(-20),
  );
  return {
    questions: generated,
    obstacleKeywordLength: [...keyword].length,
    obstacleClueCount: clueCount,
    obstacleKeyword: keyword.toLocaleUpperCase("vi"),
    obstacleLogic: obstacle.logic.trim(),
    obstacleImage: illustration,
    questionReview: result.review || null,
  };
}

const olympiaImages = {
  english: "/images/picture-maybay.svg",
  cProgramming: "/images/picture-c-pointer.svg",
  history: "/images/picture-history-dienbien.svg",
  geography: "/images/obstacle-mystery.svg",
};

function validateOlympiaQuestions(result, questionCount) {
  if (!result || typeof result.introQuestion !== "string" || !result.introQuestion.trim()
    || result.introQuestion.length > 500) {
    throw new Error("AI chưa tạo câu hỏi mở đầu cho Đường lên đỉnh Olympia.");
  }
  if (!Array.isArray(result.questions) || result.questions.length !== questionCount) {
    throw new Error(`AI phải tạo đúng ${questionCount} câu hỏi Olympia.`);
  }
  for (const [index, question] of result.questions.entries()) {
    if (!question || typeof question.question !== "string" || !question.question.trim()
      || question.question.length > 500
      || (question.prompt !== undefined && typeof question.prompt !== "string")
      || typeof question.answer !== "string" || !question.answer.trim()
      || typeof question.explanation !== "string" || !question.explanation.trim()
      || (question.acceptedAnswers !== undefined
        && (!Array.isArray(question.acceptedAnswers)
          || question.acceptedAnswers.some((answer) => typeof answer !== "string" || !answer.trim())))) {
      throw new Error(`Câu hỏi Olympia số ${index + 1} không đúng định dạng.`);
    }
  }
}

async function createOlympiaQuestionSet(topicId, questionCount, generateQuestions, recentGeneratedQuestions) {
  if (typeof generateQuestions !== "function") {
    throw new Error("Chế độ Olympia cần AI để tạo câu hỏi theo chủ đề.");
  }
  const historyKey = `olympia:${topicId}`;
  const previousQuestions = recentGeneratedQuestions.get(historyKey) || [];
  const result = await generateQuestions({
    topicId,
    topic: questionBanks[topicId].title,
    count: questionCount,
    avoidQuestions: previousQuestions,
    mode: "olympia",
  });
  validateOlympiaQuestions(result, questionCount);
  const previousSet = new Set(previousQuestions.map(normalizeQuestionText));
  if (result.questions.some((question) => previousSet.has(normalizeQuestionText(question.question)))) {
    throw new Error("AI lặp lại câu hỏi Olympia của ván gần đây.");
  }
  recentGeneratedQuestions.set(
    historyKey,
    [...previousQuestions, ...result.questions.map((question) => question.question)].slice(-60),
  );
  const image = olympiaImages[topicId];
  return {
    introQuestion: result.introQuestion.trim(),
    introExplanation: typeof result.introExplanation === "string" ? result.introExplanation.trim() : "",
    image,
    questions: result.questions.map((question) => ({
      prompt: question.prompt?.trim() || "CÂU HỎI GIÀNH QUYỀN",
      question: question.question.trim(),
      answer: question.answer.trim(),
      acceptedAnswers: [...new Set([question.answer, ...(question.acceptedAnswers || [])].map((answer) => answer.trim()))],
      explanation: question.explanation.trim(),
      image,
    })),
    questionReview: result.review || null,
  };
}

const ROUND_DURATION_MS = 15_000;
const PICTURE_BUZZ_DURATION_MS = 10_000;
const OLYMPIA_INTRO_DURATION_MS = 25_000;
const OLYMPIA_BUZZ_COUNTDOWN_MS = 3_000;
const OLYMPIA_ANSWER_DURATION_MS = 10_000;
const OLYMPIA_QUESTION_DURATION_MS = 30_000;
const OLYMPIA_SPEECH_TIMEOUT_MS = 60_000;
const RESULT_DURATION_MS = 2_500;
const ROOM_IDLE_MS = 30 * 60 * 1000;
const ROOM_CODE_LENGTH = 6;

function publicPlayer(player) {
  return {
    username: player.username,
    score: player.score,
    correctAnswers: player.correctAnswers,
    hasAnswered: Boolean(player.answer),
    rulesAcknowledged: Boolean(player.rulesAcknowledged),
    isHost: player.isHost,
  };
}

function getRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: ROOM_CODE_LENGTH }, () => alphabet[randomInt(alphabet.length)]).join("");
}

function makeRoomQuestions(topicId, questionCount) {
  return shuffleRoomQuestions(questionBanks[topicId].questions, questionCount);
}

function shuffleRoomQuestions(sourceQuestions, questionCount) {
  const questions = sourceQuestions.map((question) => {
    const optionOrder = question.options.map((_, index) => index);
    for (let index = optionOrder.length - 1; index > 0; index -= 1) {
      const swapIndex = randomInt(index + 1);
      [optionOrder[index], optionOrder[swapIndex]] = [optionOrder[swapIndex], optionOrder[index]];
    }
    return {
      ...question,
      options: optionOrder.map((index) => question.options[index]),
      answer: optionOrder.indexOf(question.answer),
    };
  });
  for (let index = questions.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [questions[index], questions[swapIndex]] = [questions[swapIndex], questions[index]];
  }
  return questions.slice(0, questionCount);
}

function normalizeQuestionText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function validateGeneratedQuestions(questions, questionCount) {
  if (!Array.isArray(questions) || questions.length !== questionCount) {
    throw new Error(`AI phải tạo đúng ${questionCount} câu hỏi.`);
  }
  const seenQuestions = new Set();
  for (const [index, question] of questions.entries()) {
    if (!question || typeof question !== "object"
      || typeof question.prompt !== "string" || !question.prompt.trim()
      || typeof question.question !== "string" || !question.question.trim()
      || !Array.isArray(question.options) || question.options.length !== 4
      || question.options.some((option) => typeof option !== "string" || !option.trim())
      || new Set(question.options.map(normalizeQuestionText)).size !== 4
      || !Number.isInteger(question.answer) || question.answer < 0 || question.answer > 3
      || typeof question.explanation !== "string" || !question.explanation.trim()) {
      throw new Error(`Câu hỏi AI số ${index + 1} không đúng định dạng.`);
    }
    const normalized = normalizeQuestionText(question.question);
    if (seenQuestions.has(normalized)) throw new Error("AI tạo câu hỏi trùng lặp trong cùng một ván.");
    seenQuestions.add(normalized);
  }
}

function roomSnapshot(room, userId, now) {
  const ownPlayer = room.players.get(userId);
  const isOlympiaQuestionPhase = room.mode === "olympia"
    && ["questionReading", "countdown", "playing"].includes(room.phase);
  const isObstacleQuestionPhase = room.mode === "obstacle"
    && ["obstacleReading", "playing", "obstacleResult"].includes(room.phase);
  const currentQuestion = (room.phase === "playing" || isOlympiaQuestionPhase || isObstacleQuestionPhase)
    && room.questionIndex >= 0
    ? room.questions[room.questionIndex]
    : null;
  const response = {
    code: room.code,
    phase: room.phase,
    you: { username: ownPlayer?.username || "", rulesAcknowledged: Boolean(ownPlayer?.rulesAcknowledged) },
    mode: room.mode || "quiz",
    topic: room.mode === "picture"
      ? pictureQuestionBanks[room.topicId]?.title || pictureQuestionBanks.english.title
      : room.mode === "obstacle" ? `Vượt Chướng Ngại Vật · ${questionBanks[room.topicId].title}`
        : room.mode === "olympia" ? `Đường lên đỉnh Olympia · ${questionBanks[room.topicId].title}` : questionBanks[room.topicId].title,
    questionCount: room.questionCount,
    questionReview: room.questionReview || null,
    players: [...room.players.values()].map(publicPlayer),
    isHost: room.hostId === userId,
    currentQuestion: currentQuestion
      ? {
        number: room.questionIndex + 1,
        total: room.mode === "obstacle" ? room.obstacleClueCount + 1 : room.questionCount,
        prompt: currentQuestion.prompt,
        question: currentQuestion.question,
        ...(room.mode === "olympia"
          ? { image: currentQuestion.image }
          : room.mode === "obstacle" && room.questionIndex === room.obstacleClueCount
            ? {}
            : { options: currentQuestion.options }),
        deadline: room.roundDeadline,
        timeLeftMs: Math.max(0, room.roundDeadline - now),
      }
      : null,
    hasAnswered: Boolean(ownPlayer?.answer),
    pictureQuestion: room.mode === "picture" && room.phase === "playing"
      ? (() => {
        const q = room.questions[room.questionIndex];
        return {
          number: room.questionIndex + 1,
          total: room.questionCount,
          image: q.image,
          hint: q.hint,
          slots: q.slots,
          letters: q.letters,
          buzzOwnerId: room.buzzOwnerId,
          buzzOwnerName: room.buzzOwnerId ? room.players.get(room.buzzOwnerId)?.username || "" : "",
          buzzTimeLeftMs: room.buzzOwnerId ? Math.max(0, room.buzzDeadline - now) : Math.max(0, room.roundDeadline - now),
          canBuzz: !room.buzzOwnerId && !room.buzzBlockedIds.has(userId),
        };
      })()
      : null,
    obstacle: room.mode === "obstacle"
      ? {
        image: `/api/minigame/rooms/${encodeURIComponent(room.code)}/obstacle/image`,
        clueCount: room.obstacleClueCount,
        keywordLength: room.obstacleKeywordLength,
        revealedRows: room.obstacleRevealedRows.map((revealed) => revealed),
        completedRows: room.obstacleCompletedRows.map((completed) => completed),
        centerRevealed: room.obstacleCenterRevealed,
        centerResolved: room.obstacleCenterResolved,
        canSelectCenter: room.obstacleCompletedRows.every(Boolean) && !room.obstacleCenterResolved,
        selectedRow: room.phase === "obstacleReading" || room.phase === "playing" || room.phase === "obstacleResult"
          ? room.questionIndex + 1
          : null,
        revealedAnswers: room.obstacleRevealedRows.map((revealed, index) =>
          revealed ? room.questions[index].options[room.questions[index].answer] : null),
        centralQuestion: room.questionIndex === room.obstacleClueCount && isObstacleQuestionPhase,
        keyword: room.phase === "finished" ? room.obstacleKeyword : null,
        logic: room.phase === "finished" ? room.obstacleLogic : null,
        canBuzz: room.phase === "playing" && !room.buzzOwnerId && !room.buzzBlockedIds.has(userId),
        canAnswer: room.phase === "playing" && room.buzzOwnerId === userId,
        buzzOwnerName: room.buzzOwnerId ? room.players.get(room.buzzOwnerId)?.username || "" : "",
        hasLostTurn: room.buzzBlockedIds.has(userId),
        answerResult: room.obstacleAnswerResult,
        finalOutcome: room.obstacleFinalOutcome || null,
      }
      : null,
    olympia: room.mode === "olympia"
      ? {
        image: room.olympiaImage,
        introQuestion: room.olympiaIntroQuestion,
        introExplanation: room.phase === "finished" ? room.olympiaIntroExplanation : null,
        introTimeLeftMs: room.phase === "intro" ? Math.max(0, room.introDeadline - now) : 0,
        countdownTimeLeftMs: room.phase === "countdown" ? Math.max(0, room.buzzAvailableAt - now) : 0,
        answerTimeLeftMs: room.buzzOwnerId ? Math.max(0, room.buzzDeadline - now) : 0,
        buzzOwnerName: room.buzzOwnerId ? room.players.get(room.buzzOwnerId)?.username || "" : "",
        canBuzz: room.phase === "playing" && !room.buzzOwnerId && !room.buzzBlockedIds.has(userId),
        canAnswer: room.phase === "playing" && room.buzzOwnerId === userId,
        hasLostTurn: room.buzzBlockedIds.has(userId),
      }
      : null,
    roundResult: room.phase === "roundResult" ? room.roundResult : null,
    finalResult: room.phase === "finished" ? room.finalResult : null,
  };
  if (room.phase === "lobby") response.startedBy = room.hostName;
  return response;
}

function finishRoom(room, db, now) {
  const players = [...room.players.values()];
  const bestScore = Math.max(...players.map((player) => player.score));
  const winners = players.filter((player) => player.score === bestScore);
  const winnerIds = new Set(winners.map((player) => player.id));
  const saveResults = db.transaction(() => {
    for (const player of players) {
      db.prepare(`
        INSERT INTO leaderboard (user_id, username, total_points, wins, games_played, correct_answers, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          username = excluded.username,
          total_points = leaderboard.total_points + excluded.total_points,
          wins = leaderboard.wins + excluded.wins,
          games_played = leaderboard.games_played + 1,
          correct_answers = leaderboard.correct_answers + excluded.correct_answers,
          updated_at = excluded.updated_at
      `).run(player.id, player.username, player.score, winnerIds.has(player.id) && winners.length === 1 ? 1 : 0, player.correctAnswers, now);
    }
  });
  saveResults();
  room.phase = "finished";
  room.finalResult = {
    winnerIds: [...winnerIds],
    players: players
      .sort((a, b) => b.score - a.score || b.correctAnswers - a.correctAnswers || a.username.localeCompare(b.username))
      .map((player) => ({
        username: player.username,
        score: player.score,
        correctAnswers: player.correctAnswers,
        outcome: winners.length > 1 ? "draw" : winnerIds.has(player.id) ? "win" : "loss",
      })),
  };
  room.finishedAt = now;
}

function finishObstacleRoom(room, now, outcome) {
  room.phase = "finished";
  room.finishedAt = now;
  room.obstacleFinalOutcome = outcome;
  room.finalResult = {
    winnerIds: [],
    players: [...room.players.values()].map((player) => ({
      username: player.username,
      score: 0,
      correctAnswers: 0,
      outcome: "draw",
    })),
  };
}

function settleObstacleQuestion(room, now, correct) {
  const index = room.questionIndex;
  const question = room.questions[index];
  const answer = question.options[question.answer];
  room.obstacleAnswerResult = {
    rowNumber: index + 1,
    correct,
    correctAnswer: answer,
    explanation: question.explanation,
  };
  room.buzzOwnerId = null;
  room.buzzDeadline = 0;
  room.speechDeadline = 0;
  if (index === room.obstacleClueCount) {
    room.obstacleCenterResolved = true;
    room.obstacleCenterRevealed = correct;
    finishObstacleRoom(room, now, correct ? "solved" : "not-solved");
  } else {
    room.obstacleCompletedRows[index] = true;
    room.obstacleRevealedRows[index] = correct;
    room.phase = "obstacleResult";
  }
  room.lastActivityAt = now;
}

function normalizeObstacleAnswer(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function resolveRound(room, now) {
  const question = room.questions[room.questionIndex];
  const players = [...room.players.values()];
  const results = players.map((player) => {
    const answer = player.answer;
    const correct = Boolean(answer && answer.optionIndex === question.answer);
    const elapsedMs = answer ? Math.max(0, answer.at - room.roundStartedAt) : null;
    const points = correct
      ? 100 + Math.max(0, Math.floor((ROUND_DURATION_MS - Math.min(elapsedMs, ROUND_DURATION_MS)) / ROUND_DURATION_MS * 50))
      : 0;
    player.score += points;
    if (correct) player.correctAnswers += 1;
    player.answer = null;
    return {
      userId: player.id,
      username: player.username,
      correct,
      points,
      elapsedMs,
      response: answer ? (correct ? "Chính xác!" : "Chưa chính xác") : "Hết giờ",
    };
  });
  const bestPoints = Math.max(...results.map((result) => result.points));
  if (room.mode === "obstacle" && results.some((result) => result.correct) && room.questionIndex < room.obstacleClueCount) {
    room.obstacleRevealedRows[room.questionIndex] = true;
  }
  const winners = results.filter((result) => result.points === bestPoints && result.points > 0);
  const winningUserIds = new Set(winners.map((winner) => winner.userId));
  room.roundResult = {
    number: room.questionIndex + 1,
    correctOptionIndex: question.answer,
    correctAnswer: question.options[question.answer],
    explanation: question.explanation,
    players: results.map(({ userId, ...result }) => ({
      ...result,
      isRoundWinner: winningUserIds.has(userId),
    })),
    reactions: results.map((result) => {
      const otherWinner = winners.find((winner) => winner.userId !== result.userId);
      if (!otherWinner) return null;
      if (!result.correct || result.points < otherWinner.points) {
        return {
          target: result.username,
          by: otherWinner.username,
          text: "Nhanh hơn một nhịp thôi 😄 Ván sau mình gỡ nhé!",
          tone: "playful",
        };
      }
      return null;
    }).filter(Boolean),
  };
  room.phase = "roundResult";
  room.nextRoundAt = now + RESULT_DURATION_MS;
}

function resolvePictureRound(room, db, now, winnerId, timedOut) {
  const question = room.questions[room.questionIndex];
  const players = [...room.players.values()].map((player) => {
    const isWinner = player.id === winnerId;
    return {
      username: player.username,
      correct: isWinner,
      points: isWinner ? 100 : 0,
      response: isWinner ? "Giành quyền và trả lời đúng!" : timedOut ? "Hết giờ" : "Chưa giành quyền",
      isRoundWinner: isWinner,
    };
  });
  room.phase = "roundResult";
  room.roundResult = {
    number: room.questionIndex + 1,
    correctAnswer: question.answer,
    explanation: question.hint,
    players,
  };
  room.nextRoundAt = now + RESULT_DURATION_MS;
  room.buzzOwnerId = null;
  room.buzzDeadline = 0;
  room.lastActivityAt = now;
}

function resolveOlympiaRound(room, now, winnerId, answerTimedOut = false) {
  const question = room.questions[room.questionIndex];
  const winner = winnerId ? room.players.get(winnerId) : null;
  const players = [...room.players.values()].map((player) => {
    const correct = player.id === winnerId;
    return {
      username: player.username,
      correct,
      points: correct ? 100 : 0,
      response: correct
        ? "Giành quyền và trả lời đúng!"
        : player.id === room.buzzOwnerId && answerTimedOut
          ? "Hết thời gian trả lời"
          : room.buzzBlockedIds.has(player.id)
            ? "Đã mất lượt câu này"
            : "Chưa giành quyền",
      isRoundWinner: correct,
    };
  });
  if (winner) {
    winner.score += 100;
    winner.correctAnswers += 1;
  }
  room.phase = "roundResult";
  room.roundResult = {
    number: room.questionIndex + 1,
    correctAnswer: question.answer,
    explanation: question.explanation,
    players,
  };
  room.nextRoundAt = now + RESULT_DURATION_MS;
  room.buzzOwnerId = null;
  room.buzzDeadline = 0;
  room.lastActivityAt = now;
}

function advanceRoom(room, db, now) {
  let transitions = 0;
  if (room.mode === "obstacle") {
    if (room.phase === "obstacleReading" && now >= room.speechDeadline) {
      room.phase = "playing";
      room.speechDeadline = 0;
      room.lastActivityAt = now;
    }
    return;
  }
  if (room.mode === "olympia") {
    while (transitions <= room.questionCount * 3 + 4) {
      if (room.phase === "introReading" && now >= room.speechDeadline) {
        room.phase = "intro";
        room.introDeadline = now + OLYMPIA_INTRO_DURATION_MS;
        room.lastActivityAt = now;
        transitions += 1;
        continue;
      }
      if (room.phase === "questionReading" && now >= room.speechDeadline) {
        room.phase = "countdown";
        room.buzzAvailableAt = now + OLYMPIA_BUZZ_COUNTDOWN_MS;
        room.lastActivityAt = now;
        transitions += 1;
        continue;
      }
      if (room.phase === "intro" && now >= room.introDeadline) {
        room.questionIndex = 0;
        room.phase = "questionReading";
        room.speechDeadline = now + OLYMPIA_SPEECH_TIMEOUT_MS;
        room.buzzBlockedIds = new Set();
        room.lastActivityAt = now;
        transitions += 1;
        continue;
      }
      if (room.phase === "countdown" && now >= room.buzzAvailableAt) {
        room.phase = "playing";
        room.roundStartedAt = now;
        room.roundDeadline = now + OLYMPIA_QUESTION_DURATION_MS;
        room.lastActivityAt = now;
        transitions += 1;
        continue;
      }
      if (room.phase === "playing" && room.buzzOwnerId && now >= room.buzzDeadline) {
        room.buzzBlockedIds.add(room.buzzOwnerId);
        room.buzzOwnerId = null;
        room.buzzDeadline = 0;
        if ([...room.players.keys()].every((id) => room.buzzBlockedIds.has(id))) {
          resolveOlympiaRound(room, now, null, true);
        }
        room.lastActivityAt = now;
        transitions += 1;
        continue;
      }
      if (room.phase === "playing" && now >= room.roundDeadline) {
        resolveOlympiaRound(room, now, null);
        transitions += 1;
        continue;
      }
      if (room.phase === "roundResult" && now >= room.nextRoundAt) {
        if (room.questionIndex + 1 >= room.questionCount) {
          finishRoom(room, db, now);
        } else {
          room.questionIndex += 1;
          room.phase = "questionReading";
          room.speechDeadline = now + OLYMPIA_SPEECH_TIMEOUT_MS;
          room.buzzOwnerId = null;
          room.buzzDeadline = 0;
          room.buzzBlockedIds = new Set();
          room.roundResult = null;
          room.lastActivityAt = now;
        }
        transitions += 1;
        continue;
      }
      break;
    }
    return;
  }
  if (room.mode === "picture") {
    while (transitions <= room.questionCount * 2 + 2) {
      if (room.phase === "playing" && room.buzzOwnerId && now >= room.buzzDeadline) {
        room.buzzOwnerId = null;
        room.buzzDeadline = 0;
        room.lastActivityAt = now;
        transitions += 1;
        continue;
      }
      if (room.phase === "playing" && !room.buzzOwnerId && now >= room.roundDeadline) {
        resolvePictureRound(room, db, now, null, false);
        transitions += 1;
        continue;
      }
      if (room.phase === "roundResult" && now >= room.nextRoundAt) {
        if (room.questionIndex + 1 >= room.questionCount) {
          finishRoom(room, db, now);
        } else {
          room.questionIndex += 1;
          room.phase = "playing";
          room.roundStartedAt = now;
          room.roundDeadline = now + ROUND_DURATION_MS;
          room.buzzOwnerId = null;
          room.buzzDeadline = 0;
          room.buzzBlockedIds = new Set();
          room.roundResult = null;
          room.lastActivityAt = now;
        }
        transitions += 1;
        continue;
      }
      break;
    }
    return;
  }
  while (transitions <= room.questionCount * 2 + 2) {
    if (room.phase === "playing"
      && (now >= room.roundDeadline || [...room.players.values()].every((player) => player.answer))) {
      resolveRound(room, now);
      transitions += 1;
      continue;
    }
    if (room.phase === "roundResult" && now >= room.nextRoundAt) {
      if (room.questionIndex + 1 >= room.questionCount) {
        finishRoom(room, db, now);
        transitions += 1;
        continue;
      }
      room.questionIndex += 1;
      room.roundStartedAt = room.nextRoundAt;
      room.roundDeadline = room.roundStartedAt + ROUND_DURATION_MS;
      room.phase = "playing";
      room.roundResult = null;
      room.lastActivityAt = now;
      transitions += 1;
      continue;
    }
    break;
  }
}

export function createMiniGame({
  projectDir,
  clock = Date.now,
  generateQuestions,
} = {}) {
  if (!projectDir) throw new TypeError("projectDir is required to initialize mini-game storage.");

  const dataDir = path.join(projectDir, ".data");
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "minigame.sqlite"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      total_points INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      games_played INTEGER NOT NULL DEFAULT 0,
      correct_answers INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS leaderboard_rank_idx
      ON leaderboard(total_points DESC, wins DESC, correct_answers DESC);
  `);

  const rooms = new Map();
  const playerRooms = new Map();
  const recentGeneratedQuestions = new Map();
  const pendingRoomCreations = new Set();
  const router = express.Router();

  async function createQuestionSet(topicId, questionCount) {
    if (typeof generateQuestions !== "function") {
      return { questions: makeRoomQuestions(topicId, questionCount), questionReview: null };
    }
    const bank = questionBanks[topicId];
    const previousQuestions = recentGeneratedQuestions.get(topicId) || [];
    const result = await generateQuestions({
      topicId,
      topic: bank.title,
      count: questionCount,
      avoidQuestions: previousQuestions,
    });
    const generated = Array.isArray(result) ? result : result?.questions;
    const questionReview = Array.isArray(result) ? null : result?.review || null;
    validateGeneratedQuestions(generated, questionCount);
    const previousSet = new Set(previousQuestions.map(normalizeQuestionText));
    if (generated.some((question) => previousSet.has(normalizeQuestionText(question.question)))) {
      throw new Error("AI lặp lại câu hỏi của ván gần đây.");
    }
    recentGeneratedQuestions.set(
      topicId,
      [...previousQuestions, ...generated.map((question) => question.question)].slice(-60),
    );
    return {
      questions: shuffleRoomQuestions(generated, questionCount),
      questionReview,
    };
  }

  function cleanupRooms(now) {
    for (const [code, room] of rooms) {
      const expiredLobby = room.phase === "lobby" && now - room.lastActivityAt > ROOM_IDLE_MS;
      const expiredFinished = room.phase === "finished" && now - room.finishedAt > ROOM_IDLE_MS;
      if (!expiredLobby && !expiredFinished) continue;
      for (const player of room.players.values()) playerRooms.delete(player.id);
      rooms.delete(code);
    }
  }

  function getRoom(code) {
    return rooms.get(String(code || "").toUpperCase());
  }

  function removePlayer(room, userId) {
    room.players.delete(userId);
    playerRooms.delete(userId);
    if (room.hostId === userId) {
      const nextHost = room.players.values().next().value;
      if (nextHost) {
        nextHost.isHost = true;
        room.hostId = nextHost.id;
        room.hostName = nextHost.username;
      }
    }
    if (room.players.size === 0) rooms.delete(room.code);
  }

  router.use((req, res, next) => {
    if (!req.path.startsWith("/api/minigame/")) return next();
    if (!req.authUser) return res.status(401).json({ error: "Vui lòng đăng nhập để chơi mini game." });
    const origin = req.get("origin");
    const expectedOrigin = `${req.protocol}://${req.get("host")}`;
    if (origin && origin !== expectedOrigin) {
      return res.status(403).json({ error: "Yêu cầu không cùng nguồn với trò chơi." });
    }
    cleanupRooms(clock());
    return next();
  });

  router.get("/api/minigame/topics", (_req, res) => {
    res.json(Object.entries(questionBanks).map(([id, bank]) => ({
      id,
      title: bank.title,
      availableQuestions: bank.questions.length,
    })));
  });

  router.get("/api/minigame/leaderboard", (_req, res) => {
    const entries = db.prepare(`
      SELECT username, total_points AS totalPoints, wins, games_played AS gamesPlayed,
        correct_answers AS correctAnswers
      FROM leaderboard
      ORDER BY total_points DESC, wins DESC, correct_answers DESC, username COLLATE NOCASE ASC
      LIMIT 25
    `).all();
    res.set("Cache-Control", "no-store");
    res.json({ entries });
  });

  router.post("/api/minigame/rooms", async (req, res) => {
    const { topicId, questionCount, mode } = req.body || {};
    const isPictureMode = mode === "picture";
    const isObstacleMode = mode === "obstacle";
    const isOlympiaMode = mode === "olympia";
    if (!isPictureMode && !questionBanks[topicId]) return res.status(400).json({ error: "Chọn một chủ đề hợp lệ." });
    if (isPictureMode && !pictureQuestionBanks[topicId] && topicId !== "picture") {
      return res.status(400).json({ error: "Chọn một chủ đề hợp lệ cho Đuổi hình bắt chữ." });
    }
    if (!isPictureMode && ![5, 10, 15].includes(questionCount)) {
      return res.status(400).json({ error: "Số câu hỏi phải là 5, 10 hoặc 15." });
    }
    if (playerRooms.has(req.authUser.id)) {
      return res.status(409).json({ error: "Bạn đang ở trong một phòng khác. Hãy rời phòng đó trước." });
    }
    if (pendingRoomCreations.has(req.authUser.id)) {
      return res.status(409).json({ error: "Đang tạo bộ câu hỏi cho bạn. Vui lòng đợi một chút." });
    }
    pendingRoomCreations.add(req.authUser.id);
    try {
      const questionSet = isPictureMode
        ? {
          questions: pictureQuestionBanks[pictureQuestionBanks[topicId] ? topicId : "english"].questions.map((question) => ({
          ...question,
          letters: shuffleLetters(question.answer, question.letters),
          slots: question.answer.replaceAll(" ", "").length,
          })),
          questionReview: null,
        }
        : isObstacleMode
          ? await createObstacleQuestionSet(topicId, questionCount, generateQuestions, recentGeneratedQuestions)
          : isOlympiaMode
            ? await createOlympiaQuestionSet(topicId, questionCount, generateQuestions, recentGeneratedQuestions)
        : await createQuestionSet(topicId, questionCount);
      let code = getRoomCode();
      while (rooms.has(code)) code = getRoomCode();
      const room = {
        code,
        mode: isPictureMode ? "picture" : isObstacleMode ? "obstacle" : isOlympiaMode ? "olympia" : "quiz",
        topicId: isPictureMode ? (pictureQuestionBanks[topicId] ? topicId : "english") : topicId,
        questionCount: isPictureMode ? 5 : questionCount,
        questions: questionSet.questions,
        olympiaIntroQuestion: isOlympiaMode ? questionSet.introQuestion : null,
        olympiaIntroExplanation: isOlympiaMode ? questionSet.introExplanation : null,
        olympiaImage: isOlympiaMode ? questionSet.image : null,
        introDeadline: 0,
        speechDeadline: 0,
        buzzAvailableAt: 0,
        obstacleClueCount: isObstacleMode ? questionSet.obstacleClueCount : null,
        obstacleRevealedRows: isObstacleMode ? Array(questionSet.obstacleClueCount).fill(false) : null,
        obstacleCompletedRows: isObstacleMode ? Array(questionSet.obstacleClueCount).fill(false) : null,
        obstacleCenterRevealed: false,
        obstacleCenterResolved: false,
        obstacleKeywordLength: isObstacleMode ? questionSet.obstacleKeywordLength : null,
        obstacleKeyword: isObstacleMode ? questionSet.obstacleKeyword : null,
        obstacleLogic: isObstacleMode ? questionSet.obstacleLogic : null,
        obstacleImage: isObstacleMode ? questionSet.obstacleImage : null,
        obstacleAnswerResult: null,
        obstacleFinalOutcome: null,
        questionReview: questionSet.questionReview,
        phase: "lobby",
        players: new Map(),
        hostId: req.authUser.id,
        hostName: req.authUser.username,
        createdAt: clock(),
        lastActivityAt: clock(),
        questionIndex: -1,
        roundStartedAt: 0,
        roundDeadline: 0,
        nextRoundAt: 0,
        roundResult: null,
        finalResult: null,
        buzzOwnerId: null,
        buzzDeadline: 0,
        buzzBlockedIds: new Set(),
      };
      const player = { id: req.authUser.id, username: req.authUser.username, isHost: true, score: 0, correctAnswers: 0, answer: null, rulesAcknowledged: false };
      room.players.set(player.id, player);
      rooms.set(code, room);
      playerRooms.set(player.id, code);
      return res.status(201).json(roomSnapshot(room, req.authUser.id, clock()));
    } catch (error) {
      console.error("Mini-game question generation failed:", error.message);
      return res.status(503).json({
        error: error.userMessage || "Chưa tạo được bộ câu hỏi mới bằng AI. Hãy thử tạo phòng lại sau.",
      });
    } finally {
      pendingRoomCreations.delete(req.authUser.id);
    }
  });

  router.post("/api/minigame/rooms/:code/join", (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: "Không tìm thấy phòng. Hãy kiểm tra mã phòng." });
    advanceRoom(room, db, clock());
    if (room.phase !== "lobby") return res.status(409).json({ error: "Ván chơi đã bắt đầu; không thể tham gia giữa chừng." });
    const existingPlayer = room.players.get(req.authUser.id);
    if (existingPlayer) return res.json(roomSnapshot(room, req.authUser.id, clock()));
    if (playerRooms.has(req.authUser.id)) {
      return res.status(409).json({ error: "Bạn đang ở trong một phòng khác. Hãy rời phòng đó trước." });
    }
    if (room.players.size >= 6) return res.status(409).json({ error: "Phòng đã đủ 6 người chơi." });
    const player = { id: req.authUser.id, username: req.authUser.username, isHost: false, score: 0, correctAnswers: 0, answer: null, rulesAcknowledged: false };
    room.players.set(player.id, player);
    playerRooms.set(player.id, room.code);
    room.lastActivityAt = clock();
    return res.status(200).json(roomSnapshot(room, req.authUser.id, clock()));
  });

  router.get("/api/minigame/rooms/:code/obstacle/image", (req, res) => {
    const room = getRoom(req.params.code);
    if (!room || room.mode !== "obstacle") return res.status(404).json({ error: "Không tìm thấy tranh chướng ngại vật." });
    if (!room.players.has(req.authUser.id)) return res.status(403).json({ error: "Bạn chưa tham gia phòng này." });
    res.set({
      "Cache-Control": "private, max-age=3600",
      "Content-Security-Policy": "default-src 'none'; style-src 'none'; script-src 'none'",
      "X-Content-Type-Options": "nosniff",
    });
    return res.type("image/svg+xml").send(room.obstacleImage);
  });

  router.get("/api/minigame/rooms/:code", (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: "Phòng không còn hoạt động." });
    if (!room.players.has(req.authUser.id)) return res.status(403).json({ error: "Bạn chưa tham gia phòng này." });
    const now = clock();
    if (now - room.lastActivityAt > ROOM_IDLE_MS && room.phase === "lobby") {
      for (const player of room.players.values()) playerRooms.delete(player.id);
      rooms.delete(room.code);
      return res.status(404).json({ error: "Phòng đã hết hạn do không hoạt động." });
    }
    advanceRoom(room, db, now);
    room.lastActivityAt = now;
    res.set("Cache-Control", "no-store");
    return res.json(roomSnapshot(room, req.authUser.id, now));
  });

  router.post("/api/minigame/rooms/:code/rules/acknowledge", (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: "Không tìm thấy phòng." });
    if (room.phase !== "lobby") return res.status(409).json({ error: "Luật chơi chỉ cần xác nhận trong phòng chờ." });
    const player = room.players.get(req.authUser.id);
    if (!player) return res.status(403).json({ error: "Bạn chưa tham gia phòng này." });
    player.rulesAcknowledged = true;
    room.lastActivityAt = clock();
    return res.json(roomSnapshot(room, req.authUser.id, clock()));
  });

  router.post("/api/minigame/rooms/:code/start", (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: "Không tìm thấy phòng." });
    if (room.hostId !== req.authUser.id) return res.status(403).json({ error: "Chỉ người tạo phòng mới có thể bắt đầu." });
    if (room.phase !== "lobby") return res.status(409).json({ error: "Ván chơi đã bắt đầu." });
    if (room.players.size < 2) return res.status(409).json({ error: "Cần ít nhất 2 người trong phòng mới bắt đầu được." });
    const unacknowledged = [...room.players.values()].filter((player) => !player.rulesAcknowledged);
    if (unacknowledged.length > 0) {
      return res.status(409).json({ error: `Chờ ${unacknowledged.map((player) => player.username).join(", ")} xác nhận đã hiểu luật chơi.` });
    }
    const now = clock();
    room.phase = room.mode === "olympia" ? "introReading" : room.mode === "obstacle" ? "obstacleSelect" : "playing";
    room.questionIndex = room.mode === "olympia" || room.mode === "obstacle" ? -1 : 0;
    room.roundStartedAt = room.mode === "olympia" || room.mode === "obstacle" ? 0 : now;
    room.roundDeadline = room.mode === "olympia" || room.mode === "obstacle" ? 0 : now + ROUND_DURATION_MS;
    room.introDeadline = 0;
    room.speechDeadline = room.mode === "olympia" ? now + OLYMPIA_SPEECH_TIMEOUT_MS : 0;
    room.buzzAvailableAt = 0;
    room.buzzOwnerId = null;
    room.buzzDeadline = 0;
    room.buzzBlockedIds = new Set();
    room.lastActivityAt = now;
    return res.json(roomSnapshot(room, req.authUser.id, now));
  });

  router.post("/api/minigame/rooms/:code/obstacle/select", (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: "Không tìm thấy phòng." });
    if (room.mode !== "obstacle") return res.status(409).json({ error: "Phòng này không dùng bảng chướng ngại vật." });
    if (!room.players.has(req.authUser.id)) return res.status(403).json({ error: "Bạn chưa tham gia phòng này." });
    advanceRoom(room, db, clock());
    if (!["obstacleSelect", "obstacleResult"].includes(room.phase)) {
      return res.status(409).json({ error: "Hãy hoàn thành câu đang mở trước." });
    }
    const rowNumber = req.body?.rowNumber;
    const centerNumber = room.obstacleClueCount + 1;
    if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > centerNumber) {
      return res.status(400).json({ error: `Chọn một ô từ 1 đến ${centerNumber}.` });
    }
    const index = rowNumber - 1;
    if (index === room.obstacleClueCount && !room.obstacleCompletedRows.every(Boolean)) {
      return res.status(409).json({ error: "Hãy hoàn thành tất cả hàng ngang trước khi mở ô trung tâm." });
    }
    if (index < room.obstacleClueCount && room.obstacleCompletedRows[index]) {
      return res.status(409).json({ error: "Hàng ngang này đã được mở hoặc đã khép lại." });
    }
    if (index === room.obstacleClueCount && room.obstacleCenterResolved) {
      return res.status(409).json({ error: "Ô trung tâm đã được trả lời." });
    }
    const now = clock();
    room.questionIndex = index;
    room.phase = "obstacleReading";
    room.speechDeadline = now + OLYMPIA_SPEECH_TIMEOUT_MS;
    room.buzzOwnerId = null;
    room.buzzDeadline = 0;
    room.buzzBlockedIds = new Set();
    room.obstacleAnswerResult = null;
    room.lastActivityAt = now;
    return res.json(roomSnapshot(room, req.authUser.id, now));
  });

  router.post("/api/minigame/rooms/:code/speech-complete", (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: "Không tìm thấy phòng." });
    if (room.mode !== "olympia" && room.mode !== "obstacle") return res.status(409).json({ error: "Phòng này không dùng phần đọc câu hỏi." });
    if (room.hostId !== req.authUser.id) return res.status(403).json({ error: "Chỉ người tạo phòng mới có thể xác nhận AI đã đọc xong." });
    const now = clock();
    advanceRoom(room, db, now);
    if (room.mode === "obstacle" && room.phase === "obstacleReading") {
      room.phase = "playing";
      room.speechDeadline = 0;
    } else if (room.phase === "introReading") {
      room.phase = "intro";
      room.introDeadline = now + OLYMPIA_INTRO_DURATION_MS;
      room.speechDeadline = 0;
    } else if (room.phase === "questionReading") {
      room.phase = "countdown";
      room.buzzAvailableAt = now + OLYMPIA_BUZZ_COUNTDOWN_MS;
      room.speechDeadline = 0;
    } else {
      return res.status(409).json({ error: "Hiện không có câu hỏi Olympia nào đang chờ đọc xong." });
    }
    room.lastActivityAt = now;
    return res.json(roomSnapshot(room, req.authUser.id, now));
  });

  router.post("/api/minigame/rooms/:code/buzz", (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: "Không tìm thấy phòng." });
    if (room.mode !== "picture" && room.mode !== "olympia" && room.mode !== "obstacle") return res.status(409).json({ error: "Chế độ hiện tại không dùng chuông giành quyền." });
    const player = room.players.get(req.authUser.id);
    if (!player) return res.status(403).json({ error: "Bạn chưa tham gia phòng này." });
    const now = clock();
    advanceRoom(room, db, now);
    if (room.phase !== "playing") return res.status(409).json({ error: "Câu hỏi đã kết thúc." });
    if (room.buzzBlockedIds.has(player.id)) return res.status(409).json({ error: "Bạn đã mất lượt ở câu này; hãy nhường cơ hội cho người khác." });
    if (room.buzzOwnerId) return res.status(409).json({ error: "Đã có người giành quyền trả lời." });
    if (room.mode !== "obstacle" && now >= room.roundDeadline) return res.status(409).json({ error: "Hết thời gian giành quyền." });
    room.buzzOwnerId = player.id;
    room.buzzDeadline = room.mode === "obstacle"
      ? 0
      : now + (room.mode === "olympia" ? OLYMPIA_ANSWER_DURATION_MS : PICTURE_BUZZ_DURATION_MS);
    room.lastActivityAt = now;
    return res.json(roomSnapshot(room, req.authUser.id, now));
  });

  router.post("/api/minigame/rooms/:code/obstacle/answer", (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: "Không tìm thấy phòng." });
    if (room.mode !== "obstacle") return res.status(409).json({ error: "Phòng này không dùng câu hỏi chướng ngại vật." });
    const player = room.players.get(req.authUser.id);
    if (!player) return res.status(403).json({ error: "Bạn chưa tham gia phòng này." });
    advanceRoom(room, db, clock());
    if (room.phase !== "playing") return res.status(409).json({ error: "Câu hỏi chưa mở hoặc đã kết thúc." });
    if (room.buzzOwnerId !== player.id) return res.status(409).json({ error: "Hãy bấm chuông để nhận lượt trả lời trước." });
    const question = room.questions[room.questionIndex];
    const hasOption = Number.isInteger(req.body?.optionIndex);
    const answerText = typeof req.body?.answer === "string" ? req.body.answer.trim() : "";
    if (room.questionIndex === room.obstacleClueCount && hasOption) {
      return res.status(400).json({ error: "Ô trung tâm cần nhập từ khóa bằng chữ." });
    }
    if ((!hasOption && !answerText)
      || (hasOption && (req.body.optionIndex < 0 || req.body.optionIndex >= question.options.length))
      || (answerText && answerText.length > 300)) {
      return res.status(400).json({ error: "Hãy chọn một đáp án hợp lệ hoặc nhập câu trả lời ngắn." });
    }
    const expected = question.options[question.answer];
    const correct = hasOption
      ? req.body.optionIndex === question.answer
      : normalizeObstacleAnswer(answerText) === normalizeObstacleAnswer(expected);
    const now = clock();
    if (correct) {
      settleObstacleQuestion(room, now, true);
    } else {
      room.buzzBlockedIds.add(player.id);
      room.buzzOwnerId = null;
      room.buzzDeadline = 0;
      if ([...room.players.keys()].every((id) => room.buzzBlockedIds.has(id))) {
        settleObstacleQuestion(room, now, false);
      } else {
        room.lastActivityAt = now;
      }
    }
    return res.json(roomSnapshot(room, req.authUser.id, now));
  });

  router.post("/api/minigame/rooms/:code/obstacle/continue", (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: "Không tìm thấy phòng." });
    if (room.mode !== "obstacle") return res.status(409).json({ error: "Phòng này không dùng bảng chướng ngại vật." });
    if (!room.players.has(req.authUser.id)) return res.status(403).json({ error: "Bạn chưa tham gia phòng này." });
    if (room.phase !== "obstacleResult") return res.status(409).json({ error: "Chưa có kết quả hàng ngang để tiếp tục." });
    const now = clock();
    room.phase = "obstacleSelect";
    room.questionIndex = -1;
    room.obstacleAnswerResult = null;
    room.buzzBlockedIds = new Set();
    room.lastActivityAt = now;
    return res.json(roomSnapshot(room, req.authUser.id, now));
  });

  router.post("/api/minigame/rooms/:code/picture-answer", (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: "Không tìm thấy phòng." });
    if (room.mode !== "picture") return res.status(409).json({ error: "API này chỉ dùng cho Đuổi hình bắt chữ." });
    if (room.phase !== "playing") return res.status(409).json({ error: "Câu hỏi đã kết thúc." });
    const player = room.players.get(req.authUser.id);
    if (!player) return res.status(403).json({ error: "Bạn chưa tham gia phòng này." });
    const now = clock();
    advanceRoom(room, db, now);
    if (room.phase !== "playing") return res.status(409).json({ error: "Câu hỏi đã kết thúc." });
    if (room.buzzOwnerId !== player.id) return res.status(409).json({ error: "Bạn chưa giành được quyền trả lời." });
    if (now >= room.buzzDeadline) return res.status(409).json({ error: "Hết thời gian trả lời." });
    const normalized = String(req.body?.answer || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toUpperCase().replace(/[^A-Z]/g, "");
    const question = room.questions[room.questionIndex];
    const expected = question.answer.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
    if (normalized === expected) {
      player.score += 100;
      player.correctAnswers += 1;
      resolvePictureRound(room, db, now, player.id, false);
    } else {
      player.score = Math.max(0, player.score - 20);
      room.buzzOwnerId = null;
      room.buzzDeadline = 0;
      room.buzzBlockedIds.add(player.id);
    }
    room.lastActivityAt = now;
    return res.json(roomSnapshot(room, req.authUser.id, now));
  });

  router.post("/api/minigame/rooms/:code/olympia-answer", (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: "Không tìm thấy phòng." });
    if (room.mode !== "olympia") return res.status(409).json({ error: "API trả lời này chỉ dùng cho Đường lên đỉnh Olympia." });
    const player = room.players.get(req.authUser.id);
    if (!player) return res.status(403).json({ error: "Bạn chưa tham gia phòng này." });
    const answer = typeof req.body?.answer === "string" ? req.body.answer.trim() : "";
    if (!answer || answer.length > 300) return res.status(400).json({ error: "Hãy nhập câu trả lời từ 1 đến 300 ký tự." });
    const now = clock();
    advanceRoom(room, db, now);
    if (room.phase !== "playing") return res.status(409).json({ error: "Câu hỏi này đã khép lại." });
    if (room.buzzOwnerId !== player.id) return res.status(409).json({ error: "Chỉ người bấm chuông giành quyền mới được trả lời." });
    if (now >= room.buzzDeadline) return res.status(409).json({ error: "Hết thời gian trả lời; lượt đã chuyển cho người khác." });
    const question = room.questions[room.questionIndex];
    const normalizeAnswer = (value) => normalizeQuestionText(value).replaceAll(" ", "");
    const acceptedAnswers = question.acceptedAnswers || [question.answer];
    const correct = acceptedAnswers.some((candidate) => normalizeAnswer(candidate) === normalizeAnswer(answer));
    if (correct) {
      resolveOlympiaRound(room, now, player.id);
    } else {
      room.buzzBlockedIds.add(player.id);
      room.buzzOwnerId = null;
      room.buzzDeadline = 0;
      if ([...room.players.keys()].every((id) => room.buzzBlockedIds.has(id))) {
        resolveOlympiaRound(room, now, null);
      }
      room.lastActivityAt = now;
    }
    return res.json(roomSnapshot(room, req.authUser.id, now));
  });

  router.post("/api/minigame/rooms/:code/answer", (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: "Không tìm thấy phòng." });
    if (room.mode === "obstacle") return res.status(409).json({ error: "Hãy dùng chuông và câu trả lời của bảng chướng ngại vật." });
    const player = room.players.get(req.authUser.id);
    if (!player) return res.status(403).json({ error: "Bạn chưa tham gia phòng này." });
    const now = clock();
    advanceRoom(room, db, now);
    if (room.phase !== "playing") return res.status(409).json({ error: "Câu hỏi này đã khép lại." });
    if (!Number.isInteger(req.body?.optionIndex)
      || req.body.optionIndex < 0
      || req.body.optionIndex >= room.questions[room.questionIndex].options.length) {
      return res.status(400).json({ error: "Đáp án lựa chọn không hợp lệ." });
    }
    if (player.answer) return res.status(409).json({ error: "Bạn đã gửi đáp án cho câu này rồi." });
    player.answer = { optionIndex: req.body.optionIndex, at: now };
    room.lastActivityAt = now;
    advanceRoom(room, db, now);
    return res.json({
      accepted: true,
      phase: room.phase,
      message: room.phase === "roundResult" ? "Cả phòng đã trả lời. Cùng xem kết quả nhé!" : "Đã nhận đáp án. Chờ các bạn còn lại nào!",
    });
  });

  router.post("/api/minigame/rooms/:code/leave", (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.json({ ok: true });
    if (!room.players.has(req.authUser.id)) return res.json({ ok: true });
    if (room.phase !== "lobby" && room.phase !== "finished") {
      return res.status(409).json({ error: "Hãy hoàn thành ván chơi trước khi rời phòng." });
    }
    removePlayer(room, req.authUser.id);
    return res.json({ ok: true, redirect: "/" });
  });

  return {
    router,
    close: () => db.close(),
  };
}
