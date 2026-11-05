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
  assert.deepEqual(topics.map((topic) => topic.id), ["english", "cProgramming", "history"]);

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

  const start = await authenticatedApi(`/api/minigame/rooms/${room.code}/start`, hostCookie, "POST", {});
  assert.equal(start.status, 200);
  assert.equal((await start.json()).phase, "playing");
});
