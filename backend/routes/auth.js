const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const requireAuth = require("../middleware/auth");
const { query, isConnected } = require("../services/db");

const router = express.Router();

const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
  }
}

function readUsers() {
  ensureStore();
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

function writeUsers(users) {
  ensureStore();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    preferences: row.preferences ?? {},
  };
}

router.post("/login", async (req, res) => {
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "");

  let user = null;

  if (isConnected()) {
    const result = await query(
      "SELECT * FROM users WHERE LOWER(username) = LOWER($1)",
      [username]
    );
    user = rowToUser(result?.rows?.[0] ?? null);
  } else {
    const users = readUsers();
    user = users.find((entry) => String(entry.username || "").toLowerCase() === username.toLowerCase()) ?? null;
  }

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (!user.passwordHash) {
    return res.status(401).json({ error: "Account not configured" });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok || !process.env.JWT_SECRET) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );

  return res.json({ token, userId: user.id, username: user.username });
});

router.get("/me", requireAuth, (req, res) => {
  return res.json({ userId: req.userId, username: req.username });
});

const VALID_BOOKS = ["DK", "FD", "CZR", "MGM", "BOV"];

router.get("/preferences", requireAuth, async (req, res) => {
  if (isConnected()) {
    const result = await query("SELECT preferences FROM users WHERE id = $1", [req.userId]);
    if (!result?.rows?.[0]) return res.status(404).json({ error: "User not found" });
    return res.json({ preferences: result.rows[0].preferences ?? {} });
  }

  const users = readUsers();
  const user = users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({ preferences: user.preferences ?? {} });
});

router.put("/preferences", requireAuth, async (req, res) => {
  const { preferredBook } = req.body ?? {};

  if (preferredBook !== null && preferredBook !== undefined && !VALID_BOOKS.includes(preferredBook)) {
    return res.status(400).json({ error: `preferredBook must be one of: ${VALID_BOOKS.join(", ")} or null` });
  }

  if (isConnected()) {
    const existing = await query("SELECT preferences FROM users WHERE id = $1", [req.userId]);
    if (!existing?.rows?.[0]) return res.status(404).json({ error: "User not found" });

    const nextPreferences = {
      ...(existing.rows[0].preferences ?? {}),
      ...(preferredBook !== undefined ? { preferredBook: preferredBook ?? null } : {}),
    };

    await query(
      "UPDATE users SET preferences = $1::jsonb WHERE id = $2",
      [JSON.stringify(nextPreferences), req.userId]
    );

    return res.json({ preferences: nextPreferences });
  }

  const users = readUsers();
  const idx = users.findIndex((u) => u.id === req.userId);
  if (idx === -1) return res.status(404).json({ error: "User not found" });

  users[idx].preferences = {
    ...(users[idx].preferences ?? {}),
    ...(preferredBook !== undefined ? { preferredBook: preferredBook ?? null } : {}),
  };

  writeUsers(users);
  return res.json({ preferences: users[idx].preferences });
});

module.exports = router;
