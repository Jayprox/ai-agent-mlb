const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const DATA_DIR = path.join(__dirname, "..", "data");
const PICKS_FILE = path.join(DATA_DIR, "picks.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PICKS_FILE)) {
    fs.writeFileSync(PICKS_FILE, JSON.stringify({ picks: [] }, null, 2));
  }
}

function readStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(PICKS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.picks) ? parsed : { picks: [] };
  } catch (_err) {
    return { picks: [] };
  }
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(PICKS_FILE, JSON.stringify(store, null, 2));
}

router.get("/", (_req, res) => {
  const store = readStore();
  res.json({ picks: store.picks });
});

router.post("/", (req, res) => {
  const store = readStore();
  const entry = req.body ?? {};
  const existing = store.picks.find(p => p.id === entry.id);

  if (existing) {
    return res.json(existing);
  }

  store.picks.push(entry);
  writeStore(store);
  res.status(201).json(entry);
});

router.patch("/:id", (req, res) => {
  const store = readStore();
  const index = store.picks.findIndex(p => p.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "Pick not found" });
  }

  store.picks[index] = {
    ...store.picks[index],
    result: req.body?.result ?? null,
  };
  writeStore(store);
  return res.json(store.picks[index]);
});

router.delete("/:id", (req, res) => {
  const store = readStore();
  const index = store.picks.findIndex(p => p.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "Pick not found" });
  }

  store.picks.splice(index, 1);
  writeStore(store);
  return res.json({ ok: true });
});

module.exports = router;
