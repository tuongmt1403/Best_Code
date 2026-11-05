import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { createServer } from "node:http";
import Database from "better-sqlite3";
import { after, test } from "node:test";
import { createAuth } from "../dangKy_dangNhap/auth.js";

let temporaryDirectory;
let auth;
let server;
let baseUrl;

async function startAuthServer() {
  const app = express();
  app.use(express.json());
  app.use(auth.sessionMiddleware);
  app.use(auth.router);
  app.get("/private", auth.requirePageAuth, (_req, res) => res.send("private page"));
  app.get("/api/private", auth.requireApiAuth, (_req, res) => res.json({ private: true }));
  server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

async function stopAuthServer() {
  if (server?.listening) {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  server = undefined;
  auth?.close();
  auth = undefined;
}

function sessionCookie(response) {
  const value = response.headers.get("set-cookie");
  assert.ok(value, "expected the response to set a session cookie");
  return value.split(";", 1)[0];
}

after(async () => {
  await stopAuthServer();
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
});

test("registration, login, logout, and SQLite sessions work end to end", async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hoc-ma-choi-auth-"));
  auth = createAuth({ projectDir: temporaryDirectory, baseUrl: "http://localhost:3000" });
  await startAuthServer();

  const anonymousApi = await fetch(`${baseUrl}/api/private`);
  assert.equal(anonymousApi.status, 401);
  const anonymousPage = await fetch(`${baseUrl}/private`, { redirect: "manual" });
  assert.equal(anonymousPage.status, 302);
  assert.equal(anonymousPage.headers.get("location"), "/dangKy_dangNhap/");

  const registration = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "Learner_One",
      email: "learner@example.com",
      password: "A-secure-password-123",
    }),
  });
  assert.equal(registration.status, 201);
  const registrationData = await registration.json();
  assert.equal(registrationData.user.username, "learner_one");
  const registrationCookie = sessionCookie(registration);

  const database = new Database(path.join(temporaryDirectory, ".data", "accounts.sqlite"));
  const storedPasswordHash = database.prepare("SELECT password_hash FROM users WHERE email = ?")
    .get("learner@example.com").password_hash;
  assert.notEqual(storedPasswordHash, "A-secure-password-123");
  database.close();

  const authorizedApi = await fetch(`${baseUrl}/api/private`, {
    headers: { cookie: registrationCookie },
  });
  assert.equal(authorizedApi.status, 200);
  assert.deepEqual(await authorizedApi.json(), { private: true });
  const authorizedPage = await fetch(`${baseUrl}/private`, {
    headers: { cookie: registrationCookie },
  });
  assert.equal(authorizedPage.status, 200);
  assert.equal(await authorizedPage.text(), "private page");

  const duplicate = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "learner_one",
      email: "another@example.com",
      password: "A-secure-password-123",
    }),
  });
  assert.equal(duplicate.status, 409);

  const logout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { cookie: registrationCookie, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(logout.status, 200);
  const loggedOut = await fetch(`${baseUrl}/api/private`, {
    headers: { cookie: registrationCookie },
  });
  assert.equal(loggedOut.status, 401);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identity: "LEARNER@EXAMPLE.COM",
      password: "A-secure-password-123",
    }),
  });
  assert.equal(login.status, 200);
  const loginCookie = sessionCookie(login);

  await stopAuthServer();
  auth = createAuth({ projectDir: temporaryDirectory, baseUrl: "http://localhost:3000" });
  await startAuthServer();
  const persistedSession = await fetch(`${baseUrl}/api/private`, {
    headers: { cookie: loginCookie },
  });
  assert.equal(persistedSession.status, 200);
});
