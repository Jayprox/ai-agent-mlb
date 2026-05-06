const express = require("express");
const fs = require("fs");
const path = require("path");
const requireAuth = require("../middleware/auth");
const { query, isConnected } = require("../services/db");

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

router.use(requireAuth);

router.get("/", async (req, res) => {
  if (isConnected()) {
    const result = await query(
      "SELECT data FROM picks WHERE user_id = $1 ORDER BY created_at DESC",
      [req.userId]
    );
    return res.json({ picks: (result?.rows ?? []).map((row) => row.data) });
  }

  const store = readStore();
  return res.json({ picks: store.picks.filter((pick) => pick.userId === req.userId) });
});

router.post("/", async (req, res) => {
  const entry = { ...(req.body ?? {}), userId: req.userId };

  if (isConnected()) {
    const existing = await query("SELECT data FROM picks WHERE id = $1", [entry.id]);
    if (existing?.rows?.[0]?.data) {
      if (existing.rows[0].data.userId !== req.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.json(existing.rows[0].data);
    }

    await query(
      `INSERT INTO picks (id, user_id, game_pk, result, data)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        entry.id,
        req.userId,
        entry.gamePk ?? null,
        entry.result ?? null,
        JSON.stringify(entry),
      ]
    );

    return res.status(201).json(entry);
  }

  const store = readStore();
  const existing = store.picks.find((pick) => pick.id === entry.id);

  if (existing) {
    if (existing.userId !== req.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return res.json(existing);
  }

  store.picks.push(entry);
  writeStore(store);
  return res.status(201).json(entry);
});

router.patch("/:id", async (req, res) => {
  if (isConnected()) {
    const existing = await query("SELECT user_id, data FROM picks WHERE id = $1", [req.params.id]);
    const row = existing?.rows?.[0];

    if (!row) {
      return res.status(404).json({ error: "Pick not found" });
    }
    if (row.user_id !== req.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const updated = {
      ...(row.data ?? {}),
      result: req.body?.result ?? null,
    };

    await query(
      "UPDATE picks SET result = $1, data = $2::jsonb WHERE id = $3",
      [updated.result, JSON.stringify(updated), req.params.id]
    );

    return res.json(updated);
  }

  const store = readStore();
  const index = store.picks.findIndex((pick) => pick.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "Pick not found" });
  }
  if (store.picks[index].userId !== req.userId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  store.picks[index] = {
    ...store.picks[index],
    result: req.body?.result ?? null,
  };
  writeStore(store);
  return res.json(store.picks[index]);
});

router.delete("/:id", async (req, res) => {
  if (isConnected()) {
    const existing = await query("SELECT user_id FROM picks WHERE id = $1", [req.params.id]);
    const row = existing?.rows?.[0];

    if (!row) {
      return res.status(404).json({ error: "Pick not found" });
    }
    if (row.user_id !== req.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await query("DELETE FROM picks WHERE id = $1", [req.params.id]);
    return res.json({ ok: true });
  }

  const store = readStore();
  const index = store.picks.findIndex((pick) => pick.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "Pick not found" });
  }
  if (store.picks[index].userId !== req.userId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  store.picks.splice(index, 1);
  writeStore(store);
  return res.json({ ok: true });
});

module.exports = router;
