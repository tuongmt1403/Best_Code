import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { createServer } from "node:http";
import { afterEach, test } from "node:test";
import { createMiniGame } from "../mini-game/game.js";
import { createAuth } from "../dangKy_dangNhap/auth.js";

let temporaryDirectory;
let game;
let auth;
let server;
let baseUrl;
let now = 1_800_000_000_000;

function validObstacleIllustration() {
  return {
    background: "#DCEBFA",
    elements: Array.from({ length: 10 }, (_, index) => ({
      type: "circle",
      cx: 5 + index * 10,
      cy: 50,
      r: 4,
      fill: "#336699",
    })),
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    if (userId) {
      req.authUser = { id: userId, username: userId };
      req.getPlayerAvatar = () => userId === "player-a" ? "knight" : "fox";
    }
    next();
  });

  app.use(game.router);
  server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

async function stopServer() {
  if (server?.listening) {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  server = undefined;
  game?.close();
  game = undefined;
  auth?.close();
  auth = undefined;
}

async function api(pathname, user, method = "GET", body) {
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(user ? { "x-test-user": user } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

afterEach(async () => {
  await stopServer();
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

test("friends can join a room, start together, answer, and persist leaderboard results", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-minigame-"));
  game = createMiniGame({ projectDir: temporaryDirectory, clock: () => now });
  await startServer();

  const anonymous = await api("/api/minigame/topics");
  assert.equal(anonymous.status, 401);

  const topicsResponse = await api("/api/minigame/topics", "player-a");
  assert.equal(topicsResponse.status, 200);
  const topics = await topicsResponse.json();
  assert.deepEqual(topics.map((topic) => topic.id), ["english", "cProgramming", "history", "geography"]);

  const crossOrigin = await fetch(`${baseUrl}/api/minigame/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": "player-a", origin: "https://attacker.example" },
    body: JSON.stringify({ topicId: "english", questionCount: 5 }),
  });
  assert.equal(crossOrigin.status, 403);

  const create = await api("/api/minigame/rooms", "player-a", "POST", {
    topicId: "english",
    questionCount: 5,
  });
  assert.equal(create.status, 201);
  const lobby = await create.json();
  assert.match(lobby.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(lobby.phase, "lobby");
  assert.equal(lobby.players.length, 1);
  assert.equal(lobby.players[0].avatarId, "knight");
  assert.equal(lobby.currentQuestion, null);

  const noEarlyStart = await api(`/api/minigame/rooms/${lobby.code}/start`, "player-a", "POST", {});
  assert.equal(noEarlyStart.status, 409);

  const invalidRoom = await api("/api/minigame/rooms/NOPE00/join", "player-b", "POST", {});
  assert.equal(invalidRoom.status, 404);
  const join = await api(`/api/minigame/rooms/${lobby.code}/join`, "player-b", "POST", {});
  assert.equal(join.status, 200);
  const joinedRoom = await join.json();
  assert.equal(joinedRoom.players.length, 2);
  assert.equal(joinedRoom.players[1].avatarId, "fox");

  const hostAck = await api(`/api/minigame/rooms/${lobby.code}/rules/acknowledge`, "player-a", "POST", {});
  const guestAck = await api(`/api/minigame/rooms/${lobby.code}/rules/acknowledge`, "player-b", "POST", {});
  assert.equal(hostAck.status, 200);
  assert.equal(guestAck.status, 200);

  const start = await api(`/api/minigame/rooms/${lobby.code}/start`, "player-a", "POST", {});
  assert.equal(start.status, 200);
  const firstQuestion = await start.json();
  assert.equal(firstQuestion.phase, "playing");
  assert.equal(firstQuestion.currentQuestion.options.length, 4);
  assert.equal("answer" in firstQuestion.currentQuestion, false);
  assert.equal("correctOptionIndex" in firstQuestion.currentQuestion, false);

  const invalidAnswer = await api(`/api/minigame/rooms/${lobby.code}/answer`, "player-a", "POST", {
    optionIndex: 8,
  });
  assert.equal(invalidAnswer.status, 400);

  for (let questionNumber = 1; questionNumber <= 5; questionNumber += 1) {
    if (questionNumber > 1) {
      now += 2_501;
    }
    const stateResponse = await api(`/api/minigame/rooms/${lobby.code}`, "player-a");
    assert.equal(stateResponse.status, 200);
    const state = await stateResponse.json();
    assert.equal(state.phase, "playing");
    assert.equal(state.currentQuestion.number, questionNumber);

    const answerA = await api(`/api/minigame/rooms/${lobby.code}/answer`, "player-a", "POST", { optionIndex: 0 });
    assert.equal(answerA.status, 200);
    const duplicateAnswer = await api(`/api/minigame/rooms/${lobby.code}/answer`, "player-a", "POST", { optionIndex: 1 });
    assert.equal(duplicateAnswer.status, 409);
    if (questionNumber === 1) {
      now += 15_001;
    } else {
      const answerB = await api(`/api/minigame/rooms/${lobby.code}/answer`, "player-b", "POST", { optionIndex: 0 });
      assert.equal(answerB.status, 200);
    }

    const resultResponse = await api(`/api/minigame/rooms/${lobby.code}`, "player-b");
    assert.equal(resultResponse.status, 200);
    const result = await resultResponse.json();
    assert.equal(result.phase, "roundResult");
    assert.ok(result.roundResult.correctAnswer);
    assert.equal(result.roundResult.players.length, 2);
    if (questionNumber === 1) {
      assert.equal(result.roundResult.players.find((player) => player.username === "player-b").response, "Hết giờ");
    }
    assert.equal(JSON.stringify(result.roundResult).toLowerCase().includes("bôi nhọ"), false);
  }

  now += 2_501;
  const finalResponse = await api(`/api/minigame/rooms/${lobby.code}`, "player-a");
  assert.equal(finalResponse.status, 200);
  const final = await finalResponse.json();
  assert.equal(final.phase, "finished");
  assert.equal(final.finalResult.players.length, 2);
  assert.equal(final.finalResult.players.find((player) => player.username === "player-a").avatarId, "knight");
  assert.equal(final.finalResult.players.find((player) => player.username === "player-b").avatarId, "fox");

  const leaderboardResponse = await api("/api/minigame/leaderboard", "player-b");
  assert.equal(leaderboardResponse.status, 200);
  const leaderboard = await leaderboardResponse.json();
  assert.equal(leaderboard.entries.length, 2);
  assert.ok(leaderboard.entries.every((entry) => entry.gamesPlayed === 1));
  const progress = await (await api("/api/minigame/progress", "player-a")).json();
  assert.equal(progress.totalAnswered, 5);
  assert.equal(progress.questionsToday, 5);
  assert.equal(progress.gamesPlayed, 1);
  assert.equal(progress.streakDays, 1);
  assert.equal(progress.chart.at(-1).questionsAnswered, 5);
});

test("study roadmap assessments update daily activity and knowledge statistics once", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-study-progress-"));
  game = createMiniGame({ projectDir: temporaryDirectory, clock: () => now });
  await startServer();

  const event = {
    eventId: "e02171bc-4f4e-4e31-8e59-c429f08fc7b1",
    topicId: "cProgramming",
    focusTopic: "Struct",
    phase: "foundation",
    questionsAnswered: 3,
    correctAnswers: 2,
  };
  const anonymous = await api("/api/minigame/study-activity", undefined, "POST", event);
  assert.equal(anonymous.status, 401);

  const response = await api("/api/minigame/study-activity", "player-a", "POST", event);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { recorded: true, questionsAnswered: 3, correctAnswers: 2 });
  const progress = await (await api("/api/minigame/progress", "player-a")).json();
  assert.equal(progress.totalAnswered, 3);
  assert.equal(progress.correctAnswers, 2);
  assert.equal(progress.questionsToday, 3);
  assert.equal(progress.correctToday, 2);
  assert.equal(progress.chart.at(-1).questionsAnswered, 3);
  assert.equal(progress.chart.at(-1).correctAnswers, 2);
  assert.equal(progress.streakDays, 1);
  assert.equal(progress.totalPoints, 0, "study activity updates learning metrics without granting rank XP");

  const duplicate = await api("/api/minigame/study-activity", "player-a", "POST", event);
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).recorded, false);
  const afterDuplicate = await (await api("/api/minigame/progress", "player-a")).json();
  assert.equal(afterDuplicate.totalAnswered, 3);
  assert.equal(afterDuplicate.correctToday, 2);

  const invalid = await api("/api/minigame/study-activity", "player-a", "POST", {
    ...event,
    eventId: "not-a-uuid",
  });
  assert.equal(invalid.status, 400);
});

test("players can befriend each other and accept direct game invitations without a room code", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-social-"));
  const users = new Map([
    ["player-a", { id: "player-a", username: "player-a" }],
    ["player-b", { id: "player-b", username: "player-b" }],
  ]);
  game = createMiniGame({
    projectDir: temporaryDirectory,
    clock: () => now,
    findUserByUsername: (username) => users.get(username.toLowerCase()) || null,
  });
  await startServer();

  const sentRequest = await api("/api/minigame/friends/requests", "player-a", "POST", { username: "player-b" });
  assert.equal(sentRequest.status, 201);
  assert.equal((await api("/api/minigame/friends/requests", "player-a", "POST", { username: "player-b" })).status, 409);

  const pending = await (await api("/api/minigame/friends", "player-b")).json();
  assert.equal(pending.incoming.length, 1);
  assert.equal(pending.incoming[0].username, "player-a");
  assert.equal((await api(`/api/minigame/friends/requests/${pending.incoming[0].id}/accept`, "player-a", "POST", {})).status, 404);
  assert.equal((await api(`/api/minigame/friends/requests/${pending.incoming[0].id}/accept`, "player-b", "POST", {})).status, 200);

  const friendsA = await (await api("/api/minigame/friends", "player-a")).json();
  assert.deepEqual(friendsA.friends.map((friend) => friend.username), ["player-b"]);
  const room = await (await api("/api/minigame/rooms", "player-a", "POST", {
    topicId: "english",
    questionCount: 5,
  })).json();
  const invitation = await api(`/api/minigame/friends/player-b/invites`, "player-a", "POST", { roomCode: room.code });
  assert.equal(invitation.status, 201);
  assert.equal((await api(`/api/minigame/friends/player-b/invites`, "player-a", "POST", { roomCode: room.code })).status, 409);

  const inbox = await (await api("/api/minigame/invites", "player-b")).json();
  assert.equal(inbox.invites.length, 1);
  assert.equal(inbox.invites[0].invitedByUsername, "player-a");
  const accepted = await api(`/api/minigame/invites/${inbox.invites[0].id}/accept`, "player-b", "POST", {});
  assert.equal(accepted.status, 200);
  const joined = await accepted.json();
  assert.equal(joined.code, room.code);
  assert.deepEqual(joined.players.map((player) => player.username).sort(), ["player-a", "player-b"]);
  const inboxAfterAccept = await (await api("/api/minigame/invites", "player-b")).json();
  assert.equal(inboxAfterAccept.invites.length, 0);
});

test("cumulative rank tiers use the requested point thresholds", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-ranks-"));
  game = createMiniGame({ projectDir: temporaryDirectory, clock: () => now });
  await startServer();
  const database = new Database(path.join(temporaryDirectory, ".data", "minigame.sqlite"));
  try {
    database.prepare(`
      INSERT INTO leaderboard (user_id, username, total_points, updated_at)
      VALUES ('player-a', 'player-a', 0, ?)
    `).run(now);
    const cases = [
      [0, "Newbie"],
      [4_999, "Newbie"],
      [5_000, "Đồng Bạc"],
      [10_000, "Vàng"],
      [15_000, "Kim Cương"],
      [50_000, "Huyền Thoại"],
      [100_000, "Trạng Nguyên"],
    ];
    for (const [points, expectedRank] of cases) {
      database.prepare("UPDATE leaderboard SET total_points = ? WHERE user_id = 'player-a'").run(points);
      const progress = await (await api("/api/minigame/progress", "player-a")).json();
      assert.equal(progress.rank.name, expectedRank);
    }
  } finally {
    database.close();
  }
});

test("existing leaderboard totals migrate to lifetime question counts without inventing daily history", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-progress-migration-"));
  const dataDirectory = path.join(temporaryDirectory, ".data");
  await mkdir(dataDirectory, { recursive: true });
  const oldDatabase = new Database(path.join(dataDirectory, "minigame.sqlite"));
  oldDatabase.exec(`
    CREATE TABLE leaderboard (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      total_points INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      games_played INTEGER NOT NULL DEFAULT 0,
      correct_answers INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `);
  oldDatabase.prepare(`
    INSERT INTO leaderboard (user_id, username, total_points, games_played, correct_answers, updated_at)
    VALUES ('legacy-user', 'legacy-user', 4000, 12, 37, ?)
  `).run(now);
  oldDatabase.close();

  game = createMiniGame({ projectDir: temporaryDirectory, clock: () => now });
  await startServer();
  const progress = await (await api("/api/minigame/progress", "legacy-user")).json();
  assert.equal(progress.totalPoints, 4_000);
  assert.equal(progress.totalAnswered, 37);
  assert.equal(progress.correctAnswers, 37);
  assert.equal(progress.streakDays, 0);
  assert.equal(progress.chart.every((day) => day.correctAnswers === 0 && day.questionsAnswered === 0), true);
});

test("each new quiz room requests and uses a fresh AI question set", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-ai-questions-"));
  const generationCalls = [];
  game = createMiniGame({
    projectDir: temporaryDirectory,
    generateQuestions: async (request) => {
      generationCalls.push(request);
      const setNumber = generationCalls.length;
      return {
        questions: Array.from({ length: request.count }, (_, index) => ({
          prompt: "Câu hỏi mới",
          question: `Bộ ${setNumber}, câu ${index + 1} nói về ${request.topic}?`,
          options: ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
          answer: 0,
          explanation: "Đây là câu hỏi được tạo riêng cho lượt chơi này.",
        })),
        review: { status: setNumber === 1 ? "concern" : "verified", warning: setNumber === 1 },
      };
    },
  });
  await startServer();

  const firstRoom = await api("/api/minigame/rooms", "player-a", "POST", {
    topicId: "geography",
    questionCount: 15,
  });
  const secondRoom = await api("/api/minigame/rooms", "player-b", "POST", {
    topicId: "geography",
    questionCount: 15,
  });

  assert.equal(firstRoom.status, 201);
  assert.equal(secondRoom.status, 201);
  assert.equal((await firstRoom.json()).questionReview.warning, true);
  assert.equal((await secondRoom.json()).questionReview.warning, false);
  assert.equal(generationCalls.length, 2);
  assert.equal(generationCalls[0].topic, "Địa lý Việt Nam");
  assert.equal(generationCalls[0].count, 15);
  assert.equal(generationCalls[1].avoidQuestions.length, 15);
});

test("AI generation failures do not silently create a static-question room", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-ai-failure-"));
  game = createMiniGame({
    projectDir: temporaryDirectory,
    generateQuestions: async () => { throw new Error("AI is unavailable"); },
  });
  await startServer();

  const response = await api("/api/minigame/rooms", "player-a", "POST", {
    topicId: "geography",
    questionCount: 5,
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /bộ câu hỏi mới bằng AI/);
});

test("picture mode supports 1v1 buzzing, wrong-answer penalty, and correct scoring", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-picture-"));
  game = createMiniGame({ projectDir: temporaryDirectory, clock: () => now });
  await startServer();

  const create = await api("/api/minigame/rooms", "player-a", "POST", { mode: "picture", topicId: "english", questionCount: 5 });
  assert.equal(create.status, 201);
  const room = await create.json();
  assert.equal(room.mode, "picture");
  assert.equal(room.topic, "Đuổi hình bắt chữ · Tiếng Anh");

  assert.equal((await api(`/api/minigame/rooms/${room.code}/join`, "player-b", "POST", {})).status, 200);
  for (const player of ["player-a", "player-b"]) {
    const ack = await api(`/api/minigame/rooms/${room.code}/rules/acknowledge`, player, "POST", {});
    assert.equal(ack.status, 200);
  }
  const start = await api(`/api/minigame/rooms/${room.code}/start`, "player-a", "POST", {});
  assert.equal(start.status, 200);
  const playing = await start.json();
  assert.equal(playing.phase, "playing");
  assert.equal(playing.pictureQuestion.slots, 7);

  const buzz = await api(`/api/minigame/rooms/${room.code}/buzz`, "player-a", "POST", {});
  assert.equal(buzz.status, 200);
  assert.equal((await buzz.json()).pictureQuestion.buzzOwnerName, "player-a");

  const wrong = await api(`/api/minigame/rooms/${room.code}/picture-answer`, "player-a", "POST", { answer: "XXXXX" });
  assert.equal(wrong.status, 200);
  const buzzB = await api(`/api/minigame/rooms/${room.code}/buzz`, "player-b", "POST", {});
  assert.equal(buzzB.status, 200);

  const correct = await api(`/api/minigame/rooms/${room.code}/picture-answer`, "player-b", "POST", { answer: "BICYCLE" });
  assert.equal(correct.status, 200);
  const result = await correct.json();
  assert.equal(result.phase, "roundResult");
  assert.equal(result.roundResult.correctAnswer, "BICYCLE");
});

test("picture mode creates topic-specific banks for C and history", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-picture-topics-"));
  game = createMiniGame({ projectDir: temporaryDirectory });
  await startServer();

  for (const [topicId, expectedTitle] of [
    ["cProgramming", "Đuổi hình bắt chữ · Ngôn ngữ C"],
    ["history", "Đuổi hình bắt chữ · Lịch sử Việt Nam"],
  ]) {
    const create = await api("/api/minigame/rooms", `picture-${topicId}`, "POST", { mode: "picture", topicId, questionCount: 5 });
    assert.equal(create.status, 201);
    const room = await create.json();
    assert.equal(room.topic, expectedTitle);
    assert.equal(room.questionCount, 5);
    await api(`/api/minigame/rooms/${room.code}/leave`, `picture-${topicId}`, "POST", {});
  }
});

test("obstacle mode draws a private AI puzzle and uses untimed buzzer turns", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-obstacle-"));
  const generationCalls = [];
  game = createMiniGame({
    projectDir: temporaryDirectory,
    clock: () => now,
    generateQuestions: async (request) => {
      generationCalls.push(request);
      return {
        obstacle: {
          keyword: "SONGHONG",
          logic: "Các đáp án đều gắn với sông Hồng.",
          illustration: validObstacleIllustration(),
        },
        questions: Array.from({ length: request.count + 1 }, (_, index) => {
          const isCenter = index === request.count;
          return {
          prompt: isCenter ? "Ô TRUNG TÂM" : `HÀNG NGANG ${index + 1}`,
          question: isCenter
            ? "Từ khóa bí ẩn liên kết các hàng ngang là gì?"
            : `${request.topic}: câu hỏi mới số ${index + 1}?`,
          options: isCenter
            ? ["SÔNG ĐÀ", "SONGHONG", "SÔNG MÃ", "SÔNG CHẢY"]
            : ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
          answer: isCenter ? 1 : index === 1 ? 1 : 0,
          explanation: "Đáp án phù hợp với chủ đề.",
          };
        }),
        review: { status: "verified", warning: false },
      };
    },
  });
  await startServer();

  const create = await api("/api/minigame/rooms", "player-a", "POST", {
    mode: "obstacle",
    topicId: "geography",
    questionCount: 5,
  });
  assert.equal(create.status, 201);
  const room = await create.json();
  assert.equal(room.mode, "obstacle");
  assert.equal(room.topic, "Vượt Chướng Ngại Vật · Địa lý Việt Nam");
  assert.equal(room.questionCount, 5);
  assert.equal(room.obstacle.keywordLength, 8);
  assert.equal(room.obstacle.keyword, null);
  assert.equal(JSON.stringify(room).includes("SONGHONG"), false);
  assert.match(room.obstacle.image, new RegExp(`/api/minigame/rooms/${room.code}/obstacle/image`));
  assert.equal(room.obstacle.clueCount, 5);
  assert.deepEqual(room.obstacle.revealedRows, Array(5).fill(false));
  assert.deepEqual(room.obstacle.completedRows, Array(5).fill(false));
  assert.deepEqual(room.obstacle.revealedAnswers, Array(5).fill(null));
  const imageResponse = await api(room.obstacle.image, "player-a");
  assert.equal(imageResponse.status, 200);
  assert.match(imageResponse.headers.get("content-type"), /image\/svg\+xml/);
  assert.match(await imageResponse.text(), /<svg/);
  assert.equal(generationCalls.length, 1);
  assert.equal(generationCalls[0].topic, "Địa lý Việt Nam");
  assert.equal(generationCalls[0].mode, "obstacle");
  assert.equal(generationCalls[0].count, 5);

  assert.equal((await api(`/api/minigame/rooms/${room.code}/join`, "player-b", "POST", {})).status, 200);
  for (const player of ["player-a", "player-b"]) {
    assert.equal((await api(`/api/minigame/rooms/${room.code}/rules/acknowledge`, player, "POST", {})).status, 200);
  }
  const start = await api(`/api/minigame/rooms/${room.code}/start`, "player-a", "POST", {});
  assert.equal(start.status, 200);
  const selectCenterTooSoon = await api(`/api/minigame/rooms/${room.code}/obstacle/select`, "player-a", "POST", { rowNumber: 6 });
  assert.equal(selectCenterTooSoon.status, 409);

  const selectSecondRow = await api(`/api/minigame/rooms/${room.code}/obstacle/select`, "player-a", "POST", { rowNumber: 2 });
  assert.equal(selectSecondRow.status, 200);
  const reading = await selectSecondRow.json();
  assert.equal(reading.phase, "obstacleReading");
  assert.equal(reading.currentQuestion.number, 2);
  assert.equal(reading.obstacle.canBuzz, false);
  assert.equal(JSON.stringify(reading).includes("SONGHONG"), false);
  assert.equal((await api(`/api/minigame/rooms/${room.code}/buzz`, "player-a", "POST", {})).status, 409);
  assert.equal((await api(`/api/minigame/rooms/${room.code}/speech-complete`, "player-a", "POST", {})).status, 200);

  assert.equal((await api(`/api/minigame/rooms/${room.code}/obstacle/answer`, "player-a", "POST", { optionIndex: 1 })).status, 409);
  assert.equal((await api(`/api/minigame/rooms/${room.code}/buzz`, "player-a", "POST", {})).status, 200);
  assert.equal((await api(`/api/minigame/rooms/${room.code}/buzz`, "player-b", "POST", {})).status, 409);
  assert.equal((await api(`/api/minigame/rooms/${room.code}/obstacle/answer`, "player-a", "POST", { optionIndex: 0 })).status, 200);
  let roomState = await (await api(`/api/minigame/rooms/${room.code}`, "player-a")).json();
  assert.equal(roomState.phase, "playing");
  assert.equal(roomState.obstacle.canBuzz, false);
  assert.equal(roomState.obstacle.hasLostTurn, true);
  now += 10 * 60 * 1000;
  roomState = await (await api(`/api/minigame/rooms/${room.code}`, "player-b")).json();
  assert.equal(roomState.phase, "playing");
  assert.equal(roomState.obstacle.canBuzz, true);
  assert.equal((await api(`/api/minigame/rooms/${room.code}/buzz`, "player-b", "POST", {})).status, 200);
  const correctSecondRow = await api(`/api/minigame/rooms/${room.code}/obstacle/answer`, "player-b", "POST", { optionIndex: 1 });
  assert.equal(correctSecondRow.status, 200);
  roomState = await correctSecondRow.json();
  assert.equal(roomState.phase, "obstacleResult");
  assert.equal(roomState.obstacle.revealedRows[1], true);
  assert.equal(roomState.obstacle.revealedAnswers[1], "Đáp án B");
  assert.equal(roomState.players.every((player) => player.score === 0), true);

  assert.equal((await api(`/api/minigame/rooms/${room.code}/obstacle/continue`, "player-a", "POST", {})).status, 200);
  for (const rowNumber of [1, 3, 4, 5]) {
    const select = await api(`/api/minigame/rooms/${room.code}/obstacle/select`, "player-a", "POST", { rowNumber });
    assert.equal(select.status, 200);
    assert.equal((await api(`/api/minigame/rooms/${room.code}/speech-complete`, "player-a", "POST", {})).status, 200);
    assert.equal((await api(`/api/minigame/rooms/${room.code}/buzz`, "player-a", "POST", {})).status, 200);
    const answerIndex = rowNumber === 2 ? 1 : 0;
    const result = await api(`/api/minigame/rooms/${room.code}/obstacle/answer`, "player-a", "POST", { optionIndex: answerIndex });
    assert.equal(result.status, 200);
    roomState = await result.json();
    assert.equal(roomState.phase, "obstacleResult");
    assert.equal(roomState.obstacle.revealedRows[rowNumber - 1], true);
    assert.equal((await api(`/api/minigame/rooms/${room.code}/obstacle/continue`, "player-b", "POST", {})).status, 200);
  }
  roomState = await (await api(`/api/minigame/rooms/${room.code}`, "player-a")).json();
  assert.equal(roomState.obstacle.canSelectCenter, true);
  const centerSelect = await api(`/api/minigame/rooms/${room.code}/obstacle/select`, "player-a", "POST", { rowNumber: 6 });
  assert.equal(centerSelect.status, 200);
  const centerState = await centerSelect.json();
  assert.equal(centerState.currentQuestion.options, undefined);
  assert.equal(JSON.stringify(centerState).includes("SONGHONG"), false);
  assert.equal((await api(`/api/minigame/rooms/${room.code}/speech-complete`, "player-a", "POST", {})).status, 200);
  assert.equal((await api(`/api/minigame/rooms/${room.code}/buzz`, "player-b", "POST", {})).status, 200);
  const centerAnswer = await api(`/api/minigame/rooms/${room.code}/obstacle/answer`, "player-b", "POST", { answer: "song hong" });
  assert.equal(centerAnswer.status, 200);
  const finalState = await centerAnswer.json();
  assert.equal(finalState.phase, "finished");
  assert.equal(finalState.obstacle.keyword, "SONGHONG");
  assert.equal(finalState.obstacle.centerRevealed, true);
  assert.match(finalState.obstacle.logic, /sông Hồng/);
  assert.equal(finalState.finalResult.players.every((player) => player.score === 0), true);
  const leaderboard = await (await api("/api/minigame/leaderboard", "player-a")).json();
  assert.equal(leaderboard.entries.length, 2);
  assert.ok(leaderboard.entries.every((entry) => entry.gamesPlayed === 1 && entry.totalPoints === 0));
  const progress = await (await api("/api/minigame/progress", "player-a")).json();
  assert.equal(progress.totalAnswered, 5);
  assert.equal(progress.correctAnswers, 4);
  assert.equal(progress.questionsToday, 5);
  assert.equal(progress.correctToday, 4);
});

test("obstacle mode supports 10 or 15 clue rows plus a separate center question", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-obstacle-counts-"));
  const generationCalls = [];
  game = createMiniGame({
    projectDir: temporaryDirectory,
    generateQuestions: async (request) => {
      generationCalls.push(request);
      return {
        obstacle: {
          keyword: "SONGHONG",
          logic: "Các đáp án đều gắn với sông Hồng.",
          illustration: validObstacleIllustration(),
        },
        questions: Array.from({ length: request.count + 1 }, (_, index) => {
          const isCenter = index === request.count;
          return {
            prompt: isCenter ? "Ô TRUNG TÂM" : `HÀNG NGANG ${index + 1}`,
            question: isCenter ? `Từ khóa bí ẩn là gì trong bộ ${request.count}?` : `Bộ ${request.count}, câu hỏi số ${index + 1}?`,
            options: isCenter ? ["SONGHONG", "A", "B", "C"] : ["A", "B", "C", "D"],
            answer: 0,
            explanation: "Đáp án phù hợp.",
          };
        }),
        review: { status: "verified", warning: false },
      };
    },
  });
  await startServer();

  for (const clueCount of [10, 15]) {
    const response = await api("/api/minigame/rooms", `obstacle-${clueCount}`, "POST", {
      mode: "obstacle",
      topicId: "geography",
      questionCount: clueCount,
    });
    assert.equal(response.status, 201);
    const room = await response.json();
    assert.equal(room.questionCount, clueCount);
    assert.equal(room.obstacle.clueCount, clueCount);
    assert.equal(room.obstacle.revealedRows.length, clueCount);
    assert.equal(room.obstacle.completedRows.length, clueCount);
    assert.equal(generationCalls[generationCalls.length - 1].count, clueCount);
  }
});

test("obstacle mode rejects an invalid AI question set instead of making a fallback room", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-obstacle-invalid-ai-"));
  game = createMiniGame({
    projectDir: temporaryDirectory,
    generateQuestions: async () => ({
      obstacle: { keyword: "A", logic: "Không hợp lệ." },
      questions: [],
    }),
  });
  await startServer();

  const response = await api("/api/minigame/rooms", "player-a", "POST", {
    mode: "obstacle",
    topicId: "history",
    questionCount: 5,
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /bộ câu hỏi mới bằng AI/);
});

test("obstacle mode closes a clue after every player misses and has no gameplay timer", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-obstacle-no-timer-"));
  game = createMiniGame({
    projectDir: temporaryDirectory,
    clock: () => now,
    generateQuestions: async () => ({
      obstacle: {
        keyword: "SONGHONG",
        logic: "Các đáp án đều gắn với sông Hồng.",
        illustration: validObstacleIllustration(),
      },
      questions: Array.from({ length: 6 }, (_, index) => ({
        prompt: index === 5 ? "Ô TRUNG TÂM" : `HÀNG NGANG ${index + 1}`,
        question: `Câu hỏi số ${index + 1}?`,
        options: index === 5
          ? ["SÔNG ĐÀ", "SONGHONG", "SÔNG MÃ", "SÔNG CHẢY"]
          : ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
        answer: index === 5 ? 1 : 0,
        explanation: "Đáp án phù hợp với chủ đề.",
      })),
    }),
  });
  await startServer();

  const create = await api("/api/minigame/rooms", "player-a", "POST", {
    mode: "obstacle",
    topicId: "geography",
    questionCount: 5,
  });
  const room = await create.json();
  await api(`/api/minigame/rooms/${room.code}/join`, "player-b", "POST", {});
  for (const player of ["player-a", "player-b"]) {
    await api(`/api/minigame/rooms/${room.code}/rules/acknowledge`, player, "POST", {});
  }
  await api(`/api/minigame/rooms/${room.code}/start`, "player-a", "POST", {});
  await api(`/api/minigame/rooms/${room.code}/obstacle/select`, "player-a", "POST", { rowNumber: 1 });
  now += 60_001;
  const speakingTimeout = await (await api(`/api/minigame/rooms/${room.code}`, "player-a")).json();
  assert.equal(speakingTimeout.phase, "playing");
  assert.equal(speakingTimeout.obstacle.canBuzz, true);

  await api(`/api/minigame/rooms/${room.code}/buzz`, "player-a", "POST", {});
  await api(`/api/minigame/rooms/${room.code}/obstacle/answer`, "player-a", "POST", { optionIndex: 1 });
  await api(`/api/minigame/rooms/${room.code}/buzz`, "player-b", "POST", {});
  const closed = await api(`/api/minigame/rooms/${room.code}/obstacle/answer`, "player-b", "POST", { optionIndex: 2 });
  const result = await closed.json();
  assert.equal(result.phase, "obstacleResult");
  assert.equal(result.obstacle.completedRows[0], true);
  assert.equal(result.obstacle.revealedRows[0], false);
  assert.equal(result.obstacle.answerResult.correct, false);
  assert.equal(result.obstacle.answerResult.correctAnswer, "Đáp án A");
  assert.equal((await api(`/api/minigame/rooms/${room.code}/obstacle/continue`, "player-a", "POST", {})).status, 200);
  assert.equal((await api(`/api/minigame/rooms/${room.code}/obstacle/select`, "player-a", "POST", { rowNumber: 1 })).status, 409);
});

test("obstacle mode rejects unsafe AI drawing values instead of embedding raw SVG", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-obstacle-svg-validation-"));
  const illustration = validObstacleIllustration();
  illustration.elements[0].fill = '#ffffff"/><script>alert(1)</script>';
  game = createMiniGame({
    projectDir: temporaryDirectory,
    generateQuestions: async () => ({
      obstacle: { keyword: "SONGHONG", logic: "Liên quan đến sông Hồng.", illustration },
      questions: Array.from({ length: 6 }, (_, index) => ({
        prompt: `Câu ${index + 1}`,
        question: `Câu hỏi số ${index + 1}?`,
        options: index === 5 ? ["SONGHONG", "A", "B", "C"] : ["A", "B", "C", "D"],
        answer: 0,
        explanation: "Đáp án.",
      })),
    }),
  });
  await startServer();

  const response = await api("/api/minigame/rooms", "player-a", "POST", {
    mode: "obstacle",
    topicId: "geography",
    questionCount: 5,
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /bộ câu hỏi mới bằng AI/);
});

test("obstacle mode rejects a central answer that does not match its hidden keyword", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-obstacle-central-answer-"));
  game = createMiniGame({
    projectDir: temporaryDirectory,
    generateQuestions: async () => ({
      obstacle: {
        keyword: "SONGHONG",
        logic: "Các đáp án đều gắn với sông Hồng.",
        illustration: validObstacleIllustration(),
      },
      questions: Array.from({ length: 6 }, (_, index) => ({
        prompt: index === 5 ? "Ô TRUNG TÂM" : `HÀNG NGANG ${index + 1}`,
        question: index === 5 ? "Từ khóa bí ẩn là gì?" : `Câu hỏi số ${index + 1}?`,
        options: ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
        answer: 0,
        explanation: "Đáp án phù hợp với chủ đề.",
      })),
    }),
  });
  await startServer();

  const response = await api("/api/minigame/rooms", "player-a", "POST", {
    mode: "obstacle",
    topicId: "geography",
    questionCount: 5,
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Chưa tạo được bộ câu hỏi mới bằng AI/);
});

test("Olympia mode waits for spoken reading and countdown, then transfers the buzzer after a wrong answer", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-olympia-"));
  const generationCalls = [];
  game = createMiniGame({
    projectDir: temporaryDirectory,
    clock: () => now,
    generateQuestions: async (request) => {
      generationCalls.push(request);
      return {
        introQuestion: "Dòng sông nào bồi đắp nên đồng bằng rộng lớn ở miền Bắc?",
        introExplanation: "Chủ đề về sông ngòi và địa hình.",
        questions: Array.from({ length: request.count }, (_, index) => ({
          prompt: `NHÁNH ${index + 1}`,
          question: `Câu hỏi ngắn số ${index + 1}?`,
          answer: "Sông Hồng",
          acceptedAnswers: ["sông Hồng", "Song Hong"],
          explanation: "Sông Hồng bồi đắp đồng bằng Bắc Bộ.",
        })),
        review: { status: "verified", warning: false },
      };
    },
  });
  await startServer();

  const create = await api("/api/minigame/rooms", "player-a", "POST", {
    mode: "olympia",
    topicId: "geography",
    questionCount: 5,
  });
  assert.equal(create.status, 201);
  const room = await create.json();
  assert.equal(room.mode, "olympia");
  assert.equal(room.phase, "lobby");
  assert.equal(room.questionCount, 5);
  assert.equal(room.olympia.image, "/images/obstacle-mystery.svg");
  assert.match(room.olympia.introQuestion, /Dòng sông nào/);
  assert.equal(generationCalls[0].mode, "olympia");
  assert.equal(generationCalls[0].count, 5);

  assert.equal((await api(`/api/minigame/rooms/${room.code}/join`, "player-b", "POST", {})).status, 200);
  for (const player of ["player-a", "player-b"]) {
    assert.equal((await api(`/api/minigame/rooms/${room.code}/rules/acknowledge`, player, "POST", {})).status, 200);
  }
  const start = await api(`/api/minigame/rooms/${room.code}/start`, "player-a", "POST", {});
  assert.equal((await start.json()).phase, "introReading");
  assert.equal((await api(`/api/minigame/rooms/${room.code}/buzz`, "player-a", "POST", {})).status, 409);
  assert.equal((await api(`/api/minigame/rooms/${room.code}/speech-complete`, "player-b", "POST", {})).status, 403);

  const intro = await api(`/api/minigame/rooms/${room.code}/speech-complete`, "player-a", "POST", {});
  assert.equal((await intro.json()).phase, "intro");
  assert.equal((await api(`/api/minigame/rooms/${room.code}/buzz`, "player-a", "POST", {})).status, 409);
  now += 25_001;
  const reading = await (await api(`/api/minigame/rooms/${room.code}`, "player-a")).json();
  assert.equal(reading.phase, "questionReading");
  assert.equal(reading.currentQuestion.number, 1);
  assert.equal((await api(`/api/minigame/rooms/${room.code}/buzz`, "player-a", "POST", {})).status, 409);

  const countdown = await api(`/api/minigame/rooms/${room.code}/speech-complete`, "player-a", "POST", {});
  assert.equal((await countdown.json()).phase, "countdown");
  assert.equal((await api(`/api/minigame/rooms/${room.code}/buzz`, "player-a", "POST", {})).status, 409);
  now += 3_001;
  const ready = await (await api(`/api/minigame/rooms/${room.code}`, "player-a")).json();
  assert.equal(ready.phase, "playing");
  assert.equal((await api(`/api/minigame/rooms/${room.code}/olympia-answer`, "player-a", "POST", { answer: "Sông Hồng" })).status, 409);

  assert.equal((await api(`/api/minigame/rooms/${room.code}/buzz`, "player-a", "POST", {})).status, 200);
  const wrong = await api(`/api/minigame/rooms/${room.code}/olympia-answer`, "player-a", "POST", { answer: "Sông Mã" });
  assert.equal(wrong.status, 200);
  assert.equal((await wrong.json()).olympia.hasLostTurn, true);
  assert.equal((await api(`/api/minigame/rooms/${room.code}/buzz`, "player-a", "POST", {})).status, 409);
  assert.equal((await api(`/api/minigame/rooms/${room.code}/buzz`, "player-b", "POST", {})).status, 200);

  const correct = await api(`/api/minigame/rooms/${room.code}/olympia-answer`, "player-b", "POST", { answer: "Song Hong" });
  assert.equal(correct.status, 200);
  const result = await correct.json();
  assert.equal(result.phase, "roundResult");
  assert.equal(result.roundResult.correctAnswer, "Sông Hồng");
  assert.equal(result.players.find((player) => player.username === "player-b").score, 100);
});

test("Olympia mode continues if the host voice reader disconnects", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-olympia-voice-timeout-"));
  game = createMiniGame({
    projectDir: temporaryDirectory,
    clock: () => now,
    generateQuestions: async (request) => ({
      introQuestion: "Câu hỏi mở đầu bao quát chủ đề?",
      questions: Array.from({ length: request.count }, (_, index) => ({
        question: `Câu hỏi nhánh ${index + 1}?`,
        answer: "Đáp án",
        explanation: "Giải thích.",
      })),
    }),
  });
  await startServer();

  const create = await api("/api/minigame/rooms", "player-a", "POST", {
    mode: "olympia",
    topicId: "history",
    questionCount: 5,
  });
  const room = await create.json();
  await api(`/api/minigame/rooms/${room.code}/join`, "player-b", "POST", {});
  for (const player of ["player-a", "player-b"]) {
    await api(`/api/minigame/rooms/${room.code}/rules/acknowledge`, player, "POST", {});
  }
  await api(`/api/minigame/rooms/${room.code}/start`, "player-a", "POST", {});

  now += 60_001;
  const intro = await (await api(`/api/minigame/rooms/${room.code}`, "player-a")).json();
  assert.equal(intro.phase, "intro");
  assert.ok(intro.olympia.introTimeLeftMs > 24_000);

  now += 25_001;
  const reading = await (await api(`/api/minigame/rooms/${room.code}`, "player-a")).json();
  assert.equal(reading.phase, "questionReading");
  now += 60_001;
  const countdown = await (await api(`/api/minigame/rooms/${room.code}`, "player-a")).json();
  assert.equal(countdown.phase, "countdown");
  assert.ok(countdown.olympia.countdownTimeLeftMs > 2_000);
});

test("room setup validates topic and question count", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-minigame-invalid-"));
  game = createMiniGame({ projectDir: temporaryDirectory });
  await startServer();

  const invalidTopic = await api("/api/minigame/rooms", "player-a", "POST", {
    topicId: "not-a-topic",
    questionCount: 5,
  });
  assert.equal(invalidTopic.status, 400);
  const invalidCount = await api("/api/minigame/rooms", "player-a", "POST", {
    topicId: "english",
    questionCount: 2,
  });
  assert.equal(invalidCount.status, 400);
});

test("two separately authenticated accounts can join the same room", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-auth-room-"));
  auth = createAuth({ projectDir: temporaryDirectory, baseUrl: "http://localhost:3000" });
  game = createMiniGame({ projectDir: temporaryDirectory });
  const app = express();
  app.use(express.json());
  app.use(auth.router);
  app.use("/api", auth.requireApiAuth);
  app.use(game.router);
  app.get("/", auth.requirePageAuth, (_req, res) => res.send("home page"));
  server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const anonymousHome = await fetch(baseUrl, { redirect: "manual" });
  assert.equal(anonymousHome.status, 302);
  assert.equal(anonymousHome.headers.get("location"), "/dangKy_dangNhap/");

  async function register(username, email) {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, email, password: "A-secure-password-123" }),
    });
    assert.equal(response.status, 201);
    return response.headers.get("set-cookie").split(";", 1)[0];
  }

  const hostCookie = await register("host-player", "host@example.com");
  const friendCookie = await register("friend-player", "friend@example.com");
  const authenticatedHome = await fetch(baseUrl, { headers: { cookie: hostCookie } });
  assert.equal(authenticatedHome.status, 200);
  assert.equal(await authenticatedHome.text(), "home page");
  async function authenticatedApi(pathname, cookie, method = "GET", body) {
    return fetch(`${baseUrl}${pathname}`, {
      method,
      headers: {
        cookie,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  const create = await authenticatedApi("/api/minigame/rooms", hostCookie, "POST", {
    topicId: "english",
    questionCount: 5,
  });
  assert.equal(create.status, 201);
  const room = await create.json();

  const join = await authenticatedApi(`/api/minigame/rooms/${room.code}/join`, friendCookie, "POST", {});
  assert.equal(join.status, 200);
  const joined = await join.json();
  assert.deepEqual(joined.players.map((player) => player.username).sort(), ["friend-player", "host-player"]);

  const hostAck = await authenticatedApi(`/api/minigame/rooms/${room.code}/rules/acknowledge`, hostCookie, "POST", {});
  const friendAck = await authenticatedApi(`/api/minigame/rooms/${room.code}/rules/acknowledge`, friendCookie, "POST", {});
  assert.equal(hostAck.status, 200);
  assert.equal(friendAck.status, 200);

  const start = await authenticatedApi(`/api/minigame/rooms/${room.code}/start`, hostCookie, "POST", {});
  assert.equal(start.status, 200);
  assert.equal((await start.json()).phase, "playing");
});
