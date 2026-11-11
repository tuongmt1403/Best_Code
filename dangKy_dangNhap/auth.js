import Database from "better-sqlite3";
import express from "express";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "lua_session";
const OAUTH_STATE_COOKIE_PREFIX = "lua_oauth_state_";
const REMEMBERED_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const SHORT_SESSION_MS = 24 * 60 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;
const PASSWORD_BYTES = 64;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookies(header = "") {
  const cookies = new Map();
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name) continue;
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      cookies.set(name, "");
    }
  }
  return cookies;
}

function safeUser(row) {
  return row ? { id: row.id, username: row.username, email: row.email || null } : null;
}

function providerConfig(provider) {
  if (provider === "google") {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
  }
  if (provider === "github") {
    return {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    };
  }
  return null;
}

function validEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function makeCookie(value, { maxAge, secure }) {
  const attributes = [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (Number.isInteger(maxAge)) attributes.push(`Max-Age=${maxAge}`);
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

function sameOrigin(req, res, next, _baseUrl) {
  const origin = req.get("origin");
  if (!origin) return next();

  let requestOrigin;
  try {
    const trustProxy = process.env.TRUST_PROXY === "true";
    const forwardedProtocol = trustProxy
      ? String(req.get("x-forwarded-proto") || "").split(",")[0].trim()
      : "";
    const forwardedHost = trustProxy
      ? String(req.get("x-forwarded-host") || "").split(",")[0].trim()
      : "";
    const protocol = forwardedProtocol && /^[a-z]+$/i.test(forwardedProtocol)
      ? forwardedProtocol
      : (req.protocol || "http");
    const host = forwardedHost || req.get("host") || "";
    if (!host) return next();
    requestOrigin = `${protocol}://${host}`;

    if (new URL(origin).origin !== new URL(requestOrigin).origin) {
      return res.status(403).json({ error: "Yêu cầu không cùng nguồn với ứng dụng. Hãy tải lại trang bằng cùng địa chỉ link đã truy cập." });
    }
  } catch {
    return res.status(400).json({ error: "Địa chỉ truy cập không hợp lệ." });
  }
  return next();
}

export function createAuth({ projectDir, baseUrl, secureCookies = process.env.NODE_ENV === "production" } = {}) {
  if (!projectDir) throw new TypeError("projectDir is required to initialize account storage.");
  const callbackBaseUrl = (baseUrl || process.env.AUTH_BASE_URL || `http://localhost:${process.env.PORT || 3000}`)
    .replace(/\/+$/, "");
  const dataDir = path.join(projectDir, ".data");
  fs.mkdirSync(dataDir, { recursive: true });

  const db = new Database(path.join(dataDir, "accounts.sqlite"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      email TEXT COLLATE NOCASE UNIQUE,
      password_salt TEXT,
      password_hash TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS oauth_accounts (
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (provider, provider_user_id)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS oauth_states (
      state_hash TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);

  const router = express.Router();
  const rateLimits = new Map();
  let lastCleanup = 0;

  function rateLimit(maxRequests, windowMs) {
    return (req, res, next) => {
      const now = Date.now();
      const key = `${req.ip || req.socket.remoteAddress || "unknown"}:${req.path}`;
      let bucket = rateLimits.get(key);
      if (!bucket || bucket.expiresAt <= now) {
        bucket = { count: 0, expiresAt: now + windowMs };
        rateLimits.set(key, bucket);
      }
      bucket.count += 1;
      if (now - lastCleanup > windowMs) {
        for (const [entry, value] of rateLimits) {
          if (value.expiresAt <= now) rateLimits.delete(entry);
        }
        lastCleanup = now;
      }
      if (bucket.count > maxRequests) {
        res.set("Retry-After", String(Math.ceil((bucket.expiresAt - now) / 1000)));
        return res.status(429).json({ error: "Bạn thao tác quá nhanh. Vui lòng thử lại sau." });
      }
      return next();
    };
  }

  function requirePageAuth(req, res, next) {
    if (req.authUser) return next();
    return res.redirect(302, "/dangKy_dangNhap/");
  }

  function requireApiAuth(req, res, next) {
    if (req.authUser) return next();
    return res.status(401).json({ error: "Vui lòng đăng nhập để tiếp tục.", loginRequired: true });
  }

  function sessionMiddleware(req, _res, next) {
    const token = parseCookies(req.headers.cookie).get(SESSION_COOKIE);
    if (token && /^[A-Za-z0-9_-]{40,60}$/.test(token)) {
      const now = Date.now();
      const session = db.prepare(`
        SELECT users.id, users.username, users.email, sessions.token_hash
        FROM sessions JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ? AND sessions.expires_at > ?
      `).get(hashToken(token), now);
      if (session) {
        req.authUser = safeUser(session);
      } else {
        db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
      }
    }
    next();
  }

  function issueSession(req, res, userId, remember = true) {
    const token = randomBytes(32).toString("base64url");
    const now = Date.now();
    const ttl = remember ? REMEMBERED_SESSION_MS : SHORT_SESSION_MS;
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .run(hashToken(token), userId, now + ttl, now);
    res.set("Set-Cookie", makeCookie(token, {
      maxAge: remember ? Math.floor(ttl / 1000) : undefined,
      secure: secureCookies,
    }));
  }

  function clearOAuthStateCookie(res, provider) {
    if (provider !== "google" && provider !== "github") return;
    res.append("Set-Cookie", makeCookie(`${OAUTH_STATE_COOKIE_PREFIX}${provider}`, "", {
      maxAge: 0,
      secure: secureCookies,
    }));
  }

  router.use(sessionMiddleware);

  router.get("/api/auth/status", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({
      authenticated: Boolean(req.authUser),
      user: req.authUser || null,
      providers: {
        google: Object.values(providerConfig("google")).every(Boolean),
        github: Object.values(providerConfig("github")).every(Boolean),
      },
    });
  });

  router.post("/api/auth/register", rateLimit(5, 15 * 60 * 1000), (req, res, next) =>
    sameOrigin(req, res, next, callbackBaseUrl), async (req, res) => {
      const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
        return res.status(400).json({ error: "Tên người dùng cần 3–30 ký tự: chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang." });
      }
      if (!validEmail(email)) return res.status(400).json({ error: "Vui lòng nhập địa chỉ email hợp lệ." });
      if (password.length < 8 || password.length > 128) {
        return res.status(400).json({ error: "Mật khẩu cần dài từ 8 đến 128 ký tự." });
      }

      try {
        const salt = randomBytes(16);
        const passwordHash = await scrypt(password, salt, PASSWORD_BYTES, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
        const userId = randomUUID();
        const now = Date.now();
        db.prepare(`
          INSERT INTO users (id, username, email, password_salt, password_hash, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(userId, username, email, salt.toString("hex"), Buffer.from(passwordHash).toString("hex"), now);
        issueSession(req, res, userId, req.body.remember !== false);
        return res.status(201).json({ user: { id: userId, username, email }, redirect: "/" });
      } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
          return res.status(409).json({ error: "Tên người dùng hoặc email này đã được đăng ký. Hãy đăng nhập hoặc chọn thông tin khác." });
        }
        console.error("Không thể tạo tài khoản:", error.message);
        return res.status(500).json({ error: "Không thể tạo tài khoản lúc này. Vui lòng thử lại." });
      }
    });

  router.post("/api/auth/login", rateLimit(10, 15 * 60 * 1000), (req, res, next) =>
    sameOrigin(req, res, next, callbackBaseUrl), async (req, res) => {
      const identity = typeof req.body?.identity === "string" ? req.body.identity.trim().toLowerCase() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!identity || identity.length > 254 || !password || password.length > 128) {
        return res.status(400).json({ error: "Vui lòng nhập tên đăng nhập/email và mật khẩu." });
      }
      const user = db.prepare(`
        SELECT id, username, email, password_salt, password_hash
        FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE
      `).get(identity, identity);
      if (!user?.password_salt || !user.password_hash) {
        const dummySalt = randomBytes(16);
        await scrypt(password, dummySalt, PASSWORD_BYTES, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
        return res.status(401).json({ error: "Tên đăng nhập/email hoặc mật khẩu chưa chính xác." });
      }
      const actualHash = Buffer.from(await scrypt(
        password,
        Buffer.from(user.password_salt, "hex"),
        PASSWORD_BYTES,
        { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
      ));
      const expectedHash = Buffer.from(user.password_hash, "hex");
      if (actualHash.length !== expectedHash.length || !timingSafeEqual(actualHash, expectedHash)) {
        return res.status(401).json({ error: "Tên đăng nhập/email hoặc mật khẩu chưa chính xác." });
      }
      issueSession(req, res, user.id, req.body.remember !== false);
      return res.json({ user: safeUser(user), redirect: "/" });
    });

  router.post("/api/auth/logout", rateLimit(20, 60_000), (req, res, next) =>
    sameOrigin(req, res, next, callbackBaseUrl), (req, res) => {
      const token = parseCookies(req.headers.cookie).get(SESSION_COOKIE);
      if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
      res.set("Set-Cookie", makeCookie("", { maxAge: 0, secure: secureCookies }));
      return res.json({ ok: true, redirect: "/dangKy_dangNhap/" });
    });

  router.get("/api/auth/oauth/:provider", rateLimit(20, 60_000), (req, res) => {
    const { provider } = req.params;
    const config = providerConfig(provider);
    if (!config) return res.redirect("/dangKy_dangNhap/?error=provider");
    if (!config.clientId || !config.clientSecret) {
      return res.redirect(`/dangKy_dangNhap/?error=${encodeURIComponent(`${provider}-not-configured`)}`);
    }
    const state = randomBytes(32).toString("base64url");
    const now = Date.now();
    db.prepare("DELETE FROM oauth_states WHERE expires_at <= ?").run(now);
    db.prepare("INSERT INTO oauth_states (state_hash, provider, expires_at) VALUES (?, ?, ?)")
      .run(hashToken(state), provider, now + STATE_TTL_MS);
    res.append("Set-Cookie", makeCookie(`${OAUTH_STATE_COOKIE_PREFIX}${provider}`, state, {
      maxAge: Math.floor(STATE_TTL_MS / 1000),
      secure: secureCookies,
    }));
    const callbackUrl = `${callbackBaseUrl}/api/auth/oauth/${provider}/callback`;
    const authorizationUrl = new URL(
      provider === "google"
        ? "https://accounts.google.com/o/oauth2/v2/auth"
        : "https://github.com/login/oauth/authorize"
    );
    authorizationUrl.searchParams.set("client_id", config.clientId);
    authorizationUrl.searchParams.set("redirect_uri", callbackUrl);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("scope", provider === "google" ? "openid email profile" : "read:user user:email");
    if (provider === "google") authorizationUrl.searchParams.set("prompt", "select_account");
    return res.redirect(302, authorizationUrl.toString());
  });

  router.get("/api/auth/oauth/:provider/callback", rateLimit(30, 60_000), async (req, res) => {
    const { provider } = req.params;
    const config = providerConfig(provider);
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const stateCookie = parseCookies(req.headers.cookie).get(`${OAUTH_STATE_COOKIE_PREFIX}${provider}`);
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const storedState = state
      ? db.prepare("SELECT provider FROM oauth_states WHERE state_hash = ? AND expires_at > ?")
        .get(hashToken(state), Date.now())
      : null;
    clearOAuthStateCookie(res, provider);
    if (req.query.error || !config?.clientId || !config.clientSecret || !storedState
      || !stateCookie || stateCookie !== state
      || storedState.provider !== provider || !code) {
      if (state) db.prepare("DELETE FROM oauth_states WHERE state_hash = ?").run(hashToken(state));
      return res.redirect("/dangKy_dangNhap/?error=oauth");
    }
    db.prepare("DELETE FROM oauth_states WHERE state_hash = ?").run(hashToken(state));
    try {
      const callbackUrl = `${callbackBaseUrl}/api/auth/oauth/${provider}/callback`;
      const tokenResponse = await fetch(
        provider === "google" ? "https://oauth2.googleapis.com/token" : "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code,
            redirect_uri: callbackUrl,
            grant_type: "authorization_code",
          }),
          signal: AbortSignal.timeout(12_000),
        }
      );
      if (!tokenResponse.ok) throw new Error(`OAuth token exchange failed (${tokenResponse.status}).`);
      const tokenData = await tokenResponse.json();
      if (typeof tokenData.access_token !== "string") throw new Error("OAuth provider returned no access token.");

      let providerUserId;
      let email;
      let username;
      if (provider === "google") {
        const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
          signal: AbortSignal.timeout(12_000),
        });
        if (!profileResponse.ok) throw new Error(`Google profile request failed (${profileResponse.status}).`);
        const profile = await profileResponse.json();
        if (typeof profile.sub !== "string" || profile.email_verified !== true || typeof profile.email !== "string") {
          throw new Error("Google account has no verified email.");
        }
        providerUserId = profile.sub;
        email = profile.email.trim().toLowerCase();
        username = typeof profile.name === "string" ? profile.name : email.split("@")[0];
      } else {
        const profileResponse = await fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/vnd.github+json" },
          signal: AbortSignal.timeout(12_000),
        });
        if (!profileResponse.ok) throw new Error(`GitHub profile request failed (${profileResponse.status}).`);
        const profile = await profileResponse.json();
        if (profile.id === undefined || profile.id === null) throw new Error("GitHub profile has no user ID.");
        providerUserId = String(profile.id);
        username = typeof profile.login === "string" ? profile.login : "github-user";
        const emailResponse = await fetch("https://api.github.com/user/emails", {
          headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/vnd.github+json" },
          signal: AbortSignal.timeout(12_000),
        });
        if (!emailResponse.ok) throw new Error(`GitHub email request failed (${emailResponse.status}).`);
        const emails = await emailResponse.json();
        email = Array.isArray(emails)
          ? emails.find((item) => item.primary && item.verified)?.email?.trim().toLowerCase()
            || emails.find((item) => item.verified)?.email?.trim().toLowerCase()
          : undefined;
      }

      let linked = db.prepare(`
        SELECT users.id FROM oauth_accounts
        JOIN users ON users.id = oauth_accounts.user_id
        WHERE provider = ? AND provider_user_id = ?
      `).get(provider, providerUserId);
      if (!linked && email && validEmail(email)) {
        linked = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(email);
      }
      let userId = linked?.id;
      const now = Date.now();
      const createOrLink = db.transaction(() => {
        if (!userId) {
          const baseUsername = (username || email?.split("@")[0] || `${provider}-user`)
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, "-")
            .replace(/^[._-]+|[._-]+$/g, "")
            .slice(0, 24) || `${provider}-user`;
          let uniqueUsername = baseUsername;
          while (db.prepare("SELECT 1 FROM users WHERE username = ? COLLATE NOCASE").get(uniqueUsername)) {
            uniqueUsername = `${baseUsername.slice(0, 23)}-${randomBytes(3).toString("hex")}`;
          }
          userId = randomUUID();
          db.prepare(`
            INSERT INTO users (id, username, email, created_at) VALUES (?, ?, ?, ?)
          `).run(userId, uniqueUsername, email && validEmail(email) ? email : null, now);
        }
        db.prepare(`
          INSERT OR IGNORE INTO oauth_accounts (provider, provider_user_id, user_id, created_at)
          VALUES (?, ?, ?, ?)
        `).run(provider, providerUserId, userId, now);
      });
      createOrLink();
      issueSession(req, res, userId, true);
      return res.redirect(302, "/");
    } catch (error) {
      console.error(`${provider} OAuth sign-in failed:`, error.message);
      return res.redirect("/dangKy_dangNhap/?error=oauth");
    }
  });

  return {
    router,
    sessionMiddleware,
    requirePageAuth,
    requireApiAuth,
    findUserByUsername: (username) => db.prepare(`
      SELECT id, username FROM users WHERE username = ? COLLATE NOCASE
    `).get(String(username || "").trim()) || null,
    close: () => db.close(),
  };
}
