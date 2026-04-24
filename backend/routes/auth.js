const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const requireAuth = require("../middleware/auth");

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

router.post("/login", async (req, res) => {
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "");
  const users = readUsers();
  const user = users.find((entry) => String(entry.username || "").toLowerCase() === username.toLowerCase());

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

// ── Preferences ──────────────────────────────────────────────────────────────

const VALID_BOOKS = ["DK", "FD", "CZR", "MGM", "BOV"];

function writeUsers(users) {
  ensureStore();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// GET /api/auth/preferences — returns current user's preferences
router.get("/preferences", requireAuth, (req, res) => {
  const users = readUsers();
  const user  = users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({ preferences: user.preferences ?? {} });
});

// PUT /api/auth/preferences — update preferences (partial merge)
router.put("/preferences", requireAuth, (req, res) => {
  const { preferredBook } = req.body ?? {};

  // Validate
  if (preferredBook !== null && preferredBook !== undefined && !VALID_BOOKS.includes(preferredBook)) {
    return res.status(400).json({ error: `preferredBook must be one of: ${VALID_BOOKS.join(", ")} or null` });
  }

  const users = readUsers();
  const idx   = users.findIndex(u => u.id === req.userId);
  if (idx === -1) return res.status(404).json({ error: "User not found" });

  users[idx].preferences = {
    ...(users[idx].preferences ?? {}),
    ...(preferredBook !== undefined ? { preferredBook: preferredBook ?? null } : {}),
  };

  writeUsers(users);
  return res.json({ preferences: users[idx].preferences });
});

module.exports = router;
