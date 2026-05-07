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
      "SELECT id, game_pk, status, result, prop_type, created_at, snapshot FROM picks WHERE user_id = $1 ORDER BY created_at DESC",
      [req.userId]
    );
    return res.json({
      picks: (result?.rows ?? []).map((row) => ({
        id: row.id,
        gamePk: row.game_pk,
        status: row.status,
        result: row.result,
        propType: row.prop_type,
        createdAt: row.created_at,
        ...(row.snapshot ?? {}),
      })),
    });
  }

  const store = readStore();
  return res.json({ picks: store.picks.filter((pick) => pick.userId === req.userId) });
});

router.post("/", async (req, res) => {
  const body = req.body ?? {};
  const entry = { ...body, userId: req.userId };
  const snapshot = { ...body };
  delete snapshot.userId;

  if (isConnected()) {
    const existing = await query("SELECT id FROM picks WHERE id = $1", [entry.id]);
    if (existing?.rows?.[0]) return res.json(entry);

    await query(
      `INSERT INTO picks (id, user_id, game_pk, status, result, prop_type, snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        entry.id,
        req.userId,
        entry.gamePk ?? null,
        entry.status ?? "pending",
        entry.result ?? null,
        entry.propType ?? null,
        JSON.stringify(snapshot),
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
  const allowed = ["status", "result"];
  const updates = {};
  allowed.forEach((k) => {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  });

  if (isConnected()) {
    const existing = await query("SELECT user_id FROM picks WHERE id = $1", [req.params.id]);
    const row = existing?.rows?.[0];
    if (!row) return res.status(404).json({ error: "Pick not found" });
    if (row.user_id !== req.userId) return res.status(403).json({ error: "Forbidden" });

    const setClauses = [];
    const params = [];
    if (updates.status !== undefined) {
      params.push(updates.status);
      setClauses.push(`status = $${params.length}`);
    }
    if (updates.result !== undefined) {
      params.push(updates.result);
      setClauses.push(`result = $${params.length}`);
    }
    if (!setClauses.length) return res.status(400).json({ error: "Nothing to update" });
    params.push(req.params.id);
    await query(`UPDATE picks SET ${setClauses.join(", ")} WHERE id = $${params.length}`, params);

    return res.json({ ok: true, ...updates });
  }

  const store = readStore();
  const index = store.picks.findIndex((pick) => pick.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Pick not found" });
  if (store.picks[index].userId !== req.userId) return res.status(403).json({ error: "Forbidden" });

  store.picks[index] = {
    ...store.picks[index],
    ...updates,
  };
  writeStore(store);
  return res.json({ ok: true, ...updates });
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
