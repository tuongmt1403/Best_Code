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
};

const ROUND_DURATION_MS = 15_000;
const RESULT_DURATION_MS = 2_500;
const ROOM_IDLE_MS = 30 * 60 * 1000;
const ROOM_CODE_LENGTH = 6;

function publicPlayer(player) {
  return {
    username: player.username,
    score: player.score,
    correctAnswers: player.correctAnswers,
    hasAnswered: Boolean(player.answer),
    isHost: player.isHost,
  };
}

function getRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: ROOM_CODE_LENGTH }, () => alphabet[randomInt(alphabet.length)]).join("");
}

function makeRoomQuestions(topicId, questionCount) {
  const questions = questionBanks[topicId].questions.map((question) => {
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

function roomSnapshot(room, userId, now) {
  const ownPlayer = room.players.get(userId);
  const currentQuestion = room.phase === "playing" ? room.questions[room.questionIndex] : null;
  const response = {
    code: room.code,
    phase: room.phase,
    you: { username: ownPlayer?.username || "" },
    topic: questionBanks[room.topicId].title,
    questionCount: room.questionCount,
    players: [...room.players.values()].map(publicPlayer),
    isHost: room.hostId === userId,
    currentQuestion: currentQuestion
      ? {
        number: room.questionIndex + 1,
        total: room.questionCount,
        prompt: currentQuestion.prompt,
        question: currentQuestion.question,
        options: currentQuestion.options,
        deadline: room.roundDeadline,
        timeLeftMs: Math.max(0, room.roundDeadline - now),
      }
      : null,
    hasAnswered: Boolean(ownPlayer?.answer),
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

function advanceRoom(room, db, now) {
  let transitions = 0;
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
  const router = express.Router();

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

  router.post("/api/minigame/rooms", (req, res) => {
    const { topicId, questionCount } = req.body || {};
    if (!questionBanks[topicId]) return res.status(400).json({ error: "Chọn một chủ đề hợp lệ." });
    if (![5, 10, 15].includes(questionCount)) {
      return res.status(400).json({ error: "Số câu hỏi phải là 5, 10 hoặc 15." });
    }
    if (playerRooms.has(req.authUser.id)) {
      return res.status(409).json({ error: "Bạn đang ở trong một phòng khác. Hãy rời phòng đó trước." });
    }
    let code = getRoomCode();
    while (rooms.has(code)) code = getRoomCode();
    const room = {
      code,
      topicId,
      questionCount,
      questions: makeRoomQuestions(topicId, questionCount),
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
    };
    const player = { id: req.authUser.id, username: req.authUser.username, isHost: true, score: 0, correctAnswers: 0, answer: null };
    room.players.set(player.id, player);
    rooms.set(code, room);
    playerRooms.set(player.id, code);
    return res.status(201).json(roomSnapshot(room, req.authUser.id, clock()));
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
    const player = { id: req.authUser.id, username: req.authUser.username, isHost: false, score: 0, correctAnswers: 0, answer: null };
    room.players.set(player.id, player);
    playerRooms.set(player.id, room.code);
    room.lastActivityAt = clock();
    return res.status(200).json(roomSnapshot(room, req.authUser.id, clock()));
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

  router.post("/api/minigame/rooms/:code/start", (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: "Không tìm thấy phòng." });
    if (room.hostId !== req.authUser.id) return res.status(403).json({ error: "Chỉ người tạo phòng mới có thể bắt đầu." });
    if (room.phase !== "lobby") return res.status(409).json({ error: "Ván chơi đã bắt đầu." });
    if (room.players.size < 2) return res.status(409).json({ error: "Cần ít nhất 2 người trong phòng mới bắt đầu được." });
    const now = clock();
    room.phase = "playing";
    room.questionIndex = 0;
    room.roundStartedAt = now;
    room.roundDeadline = now + ROUND_DURATION_MS;
    room.lastActivityAt = now;
    return res.json(roomSnapshot(room, req.authUser.id, now));
  });

  router.post("/api/minigame/rooms/:code/answer", (req, res) => {
    const room = getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: "Không tìm thấy phòng." });
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
    if (room.phase === "playing" || room.phase === "roundResult") {
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
