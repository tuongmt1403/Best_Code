import Database from "better-sqlite3";
import express from "express";
import fs from "node:fs";
import path from "node:path";

const avatarIds = new Set(["fox", "knight"]);
const defaultAvatarId = "fox";

export function createAvatarProfile({ projectDir, clock = Date.now }) {
  const dataDir = path.join(projectDir, ".data");
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "avatar-profiles.sqlite"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_avatars (
      user_id TEXT PRIMARY KEY,
      avatar_id TEXT NOT NULL CHECK (avatar_id IN ('fox', 'knight')),
      updated_at INTEGER NOT NULL
    )
  `);
  const columns = new Set(db.pragma("table_info(player_avatars)").map((column) => column.name));
  if (columns.has("cooldown_until")) {
    db.exec("ALTER TABLE player_avatars DROP COLUMN cooldown_until");
  }
  const findAvatar = db.prepare("SELECT avatar_id FROM player_avatars WHERE user_id = ?");
  const saveAvatar = db.prepare(`
    INSERT INTO player_avatars (user_id, avatar_id, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      avatar_id = excluded.avatar_id,
      updated_at = excluded.updated_at
  `);
  const updateAvatar = db.transaction((userId, avatarId, now) => {
    saveAvatar.run(userId, avatarId, now);
    return { avatarId };
  });
  const router = express.Router();

  router.get("/", (req, res) => {
    const current = findAvatar.get(req.authUser.id);
    res.json({ avatarId: current?.avatar_id || defaultAvatarId });
  });

  router.put("/", (req, res) => {
    const avatarId = req.body?.avatarId;
    if (!avatarIds.has(avatarId)) {
      return res.status(400).json({ error: "Avatar không hợp lệ." });
    }
    const result = updateAvatar.immediate(req.authUser.id, avatarId, clock());
    res.json({ avatarId: result.avatarId });
  });

  function attachToRequest(req, _res, next) {
    if (req.authUser?.id) {
      const userId = req.authUser.id;
      req.getPlayerAvatar = () => findAvatar.get(userId)?.avatar_id || defaultAvatarId;
      req.playerAvatar = req.getPlayerAvatar();
    }
    next();
  }

  return { router, attachToRequest, close: () => db.close() };
}
