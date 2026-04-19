const express = require("express");
const router  = express.Router();
const fs      = require("fs");
const path    = require("path");
const mlb     = require("../services/mlbApi");
const cache   = require("../services/cache");
const { query, isConnected } = require("../services/db");

const UMPIRES_TTL = 60 * 60 * 1000;

const UMPIRES_DATA_PATH = path.join(__dirname, "..", "data", "umpires.json");

function normalizeName(name = "") {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function loadUmpireStats() {
  try {
    const raw = fs.readFileSync(UMPIRES_DATA_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const byName = parsed?.umpiresByName ?? {};
    const normalized = Object.fromEntries(
      Object.entries(byName).map(([name, stats]) => [normalizeName(name), stats])
    );
    return { byName, normalized };
  } catch {
    return { byName: {}, normalized: {} };
  }
}

function getUmpireStatsByName(name) {
  const store = loadUmpireStats();
  return store.byName[name] ?? store.normalized[normalizeName(name)] ?? null;
}

// ── GET /api/umpires/:gamePk ─────────────────────────────────
// Returns the umpire crew for a given game.
// The `homePlate` object is the one the app cares about most —
// it drives the umpire card in the Intel tab.
//
// Note: umpire assignments aren't always available until day-of.
// Returns { homePlate: null, all: [] } rather than erroring when pending.
router.get("/:gamePk", async (req, res) => {
  const { gamePk } = req.params;
  const cacheKey   = `umpires:${gamePk}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  if (isConnected()) {
    const row = await query(
      "SELECT data, fetched_at FROM umpire_snapshots WHERE game_pk = $1",
      [Number(gamePk)]
    );
    const entry = row?.rows?.[0];
    if (entry && (Date.now() - new Date(entry.fetched_at).getTime()) < UMPIRES_TTL) {
      cache.set(cacheKey, entry.data, UMPIRES_TTL);
      res.setHeader("X-Cache", "DB-HIT");
      return res.json(entry.data);
    }
  }

  try {
    // Officials are embedded in the boxscore response — the dedicated
    // /officials endpoint is not a valid MLB Stats API path and returns 404.
    const { data } = await mlb.get(`/game/${gamePk}/boxscore`);

    const officials = data.officials ?? [];
    const hp = officials.find((o) => o.officialType === "Home Plate");

    const result = {
      gamePk:    parseInt(gamePk),
      homePlate: hp
        ? {
            id: hp.official.id,
            name: hp.official.fullName,
            stats: getUmpireStatsByName(hp.official.fullName),
          }
        : null,
      all: officials.map((o) => ({
        id:       o.official.id,
        name:     o.official.fullName,
        position: o.officialType,
      })),
    };

    // Cache for 1 hour — assigned day-of and doesn't change
    cache.set(cacheKey, result, UMPIRES_TTL);
    res.setHeader("X-Cache", "MISS");
    res.json(result);
  } catch (err) {
    // Boxscore can be unavailable before game loads — short TTL so we retry
    const empty = { gamePk: parseInt(gamePk), homePlate: null, all: [] };
    cache.set(cacheKey, empty, 3 * 60 * 1000); // retry in 3 min
    res.setHeader("X-Cache", "MISS");
    res.json(empty);
  }
});

module.exports = router;
