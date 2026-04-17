const express = require("express");
const fs = require("fs");
const path = require("path");
const requireAuth = require("../middleware/auth");

const router = express.Router();

const DATA_DIR = path.join(__dirname, "..", "data");
const NOTES_FILE = path.join(DATA_DIR, "notes.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(NOTES_FILE)) {
    fs.writeFileSync(NOTES_FILE, JSON.stringify({}, null, 2));
  }
}

function readStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(NOTES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_err) {
    return {};
  }
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(NOTES_FILE, JSON.stringify(store, null, 2));
}

router.use(requireAuth);

router.get("/:gamePk", (req, res) => {
  try {
    const store = readStore();
    const { gamePk } = req.params;
    const storeKey = `${req.userId}:${gamePk}`;
    return res.json({ gamePk, note: store[storeKey] ?? "" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to read notes", detail: err.message });
  }
});

router.post("/:gamePk", (req, res) => {
  try {
    const store = readStore();
    const { gamePk } = req.params;
    const storeKey = `${req.userId}:${gamePk}`;
    const note = String(req.body?.note ?? "").trim().slice(0, 500);

    if (note === "") delete store[storeKey];
    else store[storeKey] = note;

    writeStore(store);
    return res.json({ gamePk, note });
  } catch (err) {
    return res.status(500).json({ error: "Failed to save note", detail: err.message });
  }
});

module.exports = router;
