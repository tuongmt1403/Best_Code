import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import express from "express";
import { after, before, test } from "node:test";
import { createAvatarProfile } from "../avatar-profile.js";

const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "avatar-profile-"));
const initialTime = 1_800_000_000_000;
let now = initialTime;
fs.mkdirSync(path.join(projectDir, ".data"), { recursive: true });
const legacyDb = new Database(path.join(projectDir, ".data", "avatar-profiles.sqlite"));
legacyDb.exec(`
  CREATE TABLE player_avatars (
    user_id TEXT PRIMARY KEY,
    avatar_id TEXT NOT NULL CHECK (avatar_id IN ('fox', 'knight')),
    updated_at INTEGER NOT NULL,
    cooldown_until INTEGER NOT NULL DEFAULT 0
  );
  INSERT INTO player_avatars (user_id, avatar_id, updated_at, cooldown_until)
  VALUES ('player-1', 'fox', ${initialTime}, ${initialTime + 48 * 60 * 60 * 1000});
`);
legacyDb.close();
const profile = createAvatarProfile({ projectDir, clock: () => now });
const app = express();
let activeRoomAvatar;
app.use(express.json());
app.use((req, _res, next) => {
  req.authUser = { id: "player-1", username: "player" };
  next();
});
app.use("/api/player-avatar", profile.router);
app.use(profile.attachToRequest);
app.get("/avatar-for-game", (req, res) => res.json({ avatarId: req.playerAvatar }));
app.post("/join-avatar-room", (req, res) => {
  activeRoomAvatar = req.getPlayerAvatar;
  res.json({ avatarId: activeRoomAvatar() });
});
app.get("/active-room-avatar", (_req, res) => res.json({ avatarId: activeRoomAvatar() }));

let server;
let baseUrl;

before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  profile.close();
  fs.rmSync(projectDir, { recursive: true, force: true });
});

test("avatar selection is account-persistent, available to games, and rejects unknown choices", async () => {
  const initial = await fetch(`${baseUrl}/api/player-avatar`);
  assert.equal(initial.status, 200);
  assert.deepEqual(await initial.json(), { avatarId: "fox" });

  const saved = await fetch(`${baseUrl}/api/player-avatar`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ avatarId: "knight" }),
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { avatarId: "knight" });

  const gameProfile = await fetch(`${baseUrl}/avatar-for-game`);
  assert.deepEqual(await gameProfile.json(), { avatarId: "knight" });

  const joined = await fetch(`${baseUrl}/join-avatar-room`, { method: "POST" });
  assert.deepEqual(await joined.json(), { avatarId: "knight" });

  const unchanged = await fetch(`${baseUrl}/api/player-avatar`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ avatarId: "knight" }),
  });
  assert.equal(unchanged.status, 200);

  const switchedBack = await fetch(`${baseUrl}/api/player-avatar`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ avatarId: "fox" }),
  });
  assert.equal(switchedBack.status, 200);
  assert.deepEqual(await switchedBack.json(), { avatarId: "fox" });

  const activeRoom = await fetch(`${baseUrl}/active-room-avatar`);
  assert.deepEqual(await activeRoom.json(), { avatarId: "fox" });

  const invalid = await fetch(`${baseUrl}/api/player-avatar`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ avatarId: "unknown" }),
  });
  assert.equal(invalid.status, 400);
});
