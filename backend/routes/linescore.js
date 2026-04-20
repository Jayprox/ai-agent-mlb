const express = require("express");
const router  = express.Router({ mergeParams: true });
const mlb     = require("../services/mlbApi");
const cache   = require("../services/cache");
const { query, isConnected } = require("../services/db");

const LINESCORE_DB_TTL = 60 * 1000;

// ── GET /api/linescore/:gamePk ────────────────────────────────
// Returns live score + inning for an in-progress game.
// Cached for 45 seconds — short enough to stay current, long
// enough to avoid hammering the API with multiple clients.
//
// Response shape:
// {
//   gamePk:    719234,
//   status:    "In Progress",
//   inning:    6,
//   halfInning: "bottom",   // "top" | "bottom"
//   awayScore: 3,
//   homeScore: 1,
//   outs:      2,
// }
router.get("/:gamePk", async (req, res) => {
  const { gamePk } = req.params;
  const cacheKey   = `linescore:${gamePk}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  if (isConnected()) {
    const row = await query(
      "SELECT data, fetched_at FROM linescore_snapshots WHERE game_pk = $1",
      [Number(gamePk)]
    );
    const entry = row?.rows?.[0];
    if (entry && (Date.now() - new Date(entry.fetched_at).getTime()) < LINESCORE_DB_TTL) {
      cache.set(cacheKey, entry.data, 45 * 1000);
      res.setHeader("X-Cache", "DB-HIT");
      return res.json(entry.data);
    }
  }

  try {
    const { data } = await mlb.get(`/game/${gamePk}/linescore`);

    // 1st inning runs — used for NRFI/YRFI result on finished games.
    // innings[0] is the 1st inning; runs are null if the inning never played.
    const innings = data.innings ?? [];
    const inning1 = innings[0] ?? null;

    const result = {
      gamePk:     Number(gamePk),
      inning:     data.currentInning      ?? null,
      halfInning: data.inningHalf?.toLowerCase() ?? null, // "top" | "bottom"
      awayScore:  data.teams?.away?.runs  ?? 0,
      homeScore:  data.teams?.home?.runs  ?? 0,
      outs:       data.outs               ?? 0,
      // Per-inning breakdown — 1st inning is what matters for NRFI
      firstInning: inning1 ? {
        away: inning1.away?.runs ?? null,
        home: inning1.home?.runs ?? null,
      } : null,
    };

    // 45-second cache — short so scores stay reasonably live
    cache.set(cacheKey, result, 45 * 1000);
    res.setHeader("X-Cache", "MISS");
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: "MLB linescore unavailable", detail: err.message });
  }
});

module.exports = router;
