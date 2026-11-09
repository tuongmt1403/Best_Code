import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    if (userId) req.authUser = { id: userId, username: userId };
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
  assert.equal(lobby.currentQuestion, null);

  const noEarlyStart = await api(`/api/minigame/rooms/${lobby.code}/start`, "player-a", "POST", {});
  assert.equal(noEarlyStart.status, 409);

  const invalidRoom = await api("/api/minigame/rooms/NOPE00/join", "player-b", "POST", {});
  assert.equal(invalidRoom.status, 404);
  const join = await api(`/api/minigame/rooms/${lobby.code}/join`, "player-b", "POST", {});
  assert.equal(join.status, 200);
  assert.equal((await join.json()).players.length, 2);

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

  const leaderboardResponse = await api("/api/minigame/leaderboard", "player-b");
  assert.equal(leaderboardResponse.status, 200);
  const leaderboard = await leaderboardResponse.json();
  assert.equal(leaderboard.entries.length, 2);
  assert.ok(leaderboard.entries.every((entry) => entry.gamesPlayed === 1));
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

test("obstacle mode reveals solved clues, then asks the central question", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-obstacle-"));
  const generationCalls = [];
  game = createMiniGame({
    projectDir: temporaryDirectory,
    clock: () => now,
    generateQuestions: async (request) => {
      generationCalls.push(request);
      return {
        obstacle: { keyword: "SONGHONG", logic: "Các đáp án đều gắn với sông Hồng." },
        questions: [0, 1, 2, 3, 4].map((index) => ({
          prompt: index === 4 ? "Ô TRUNG TÂM" : `HÀNG NGANG ${index + 1}`,
          question: index === 4
            ? "Từ khóa bí ẩn liên kết các hàng ngang là gì?"
            : `${request.topic}: câu hỏi mới số ${index + 1}?`,
          options: index === 4
            ? ["SÔNG ĐÀ", "SONGHONG", "SÔNG MÃ", "SÔNG CHẢY"]
            : ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
          answer: [0, 1, 0, 0, 1][index],
          explanation: "Đáp án phù hợp với chủ đề.",
        })),
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
  assert.deepEqual(room.obstacle.revealedRows, [false, false, false, false]);
  assert.deepEqual(room.obstacle.revealedAnswers, [null, null, null, null]);
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

  const answers = [0, 1, 0, 0, 1];
  for (let index = 0; index < answers.length; index += 1) {
    if (index > 0) {
      now += 2_501;
      const next = await api(`/api/minigame/rooms/${room.code}`, "player-a");
      assert.equal(next.status, 200);
      const nextState = await next.json();
      assert.equal(nextState.currentQuestion.number, index + 1);
      if (index === 4) {
        assert.equal(nextState.obstacle.centralQuestion, true);
        assert.equal(nextState.obstacle.keyword, null);
      }
    }

    assert.equal((await api(`/api/minigame/rooms/${room.code}/answer`, "player-a", "POST", {
      optionIndex: answers[index],
    })).status, 200);
    const resolve = await api(`/api/minigame/rooms/${room.code}/answer`, "player-b", "POST", {
      optionIndex: (answers[index] + 1) % 4,
    });
    assert.equal(resolve.status, 200);
    const result = await (await api(`/api/minigame/rooms/${room.code}`, "player-a")).json();
    assert.equal(result.phase, "roundResult");
    if (index < 4) {
      assert.equal(result.obstacle.revealedRows[index], true);
      assert.equal(result.obstacle.revealedAnswers[index], ["Đáp án A", "Đáp án B", "Đáp án A", "Đáp án A"][index]);
      assert.ok(result.obstacle.revealedAnswers.slice(index + 1).every((answer) => answer === null));
    }
    else {
      assert.equal(result.obstacle.keyword, "SONGHONG");
      assert.match(result.obstacle.logic, /sông Hồng/);
    }
  }

  now += 2_501;
  const finished = await api(`/api/minigame/rooms/${room.code}`, "player-a");
  assert.equal(finished.status, 200);
  const finalState = await finished.json();
  assert.equal(finalState.phase, "finished");
  assert.equal(finalState.finalResult.players.find((player) => player.username === "player-a").correctAnswers, 5);
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

test("obstacle mode rejects a central answer that does not match its hidden keyword", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-obstacle-central-answer-"));
  game = createMiniGame({
    projectDir: temporaryDirectory,
    generateQuestions: async () => ({
      obstacle: { keyword: "SONGHONG", logic: "Các đáp án đều gắn với sông Hồng." },
      questions: [0, 1, 2, 3, 4].map((index) => ({
        prompt: index === 4 ? "Ô TRUNG TÂM" : `HÀNG NGANG ${index + 1}`,
        question: index === 4 ? "Từ khóa bí ẩn là gì?" : `Câu hỏi số ${index + 1}?`,
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
