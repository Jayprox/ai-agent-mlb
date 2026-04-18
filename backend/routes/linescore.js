const express = require("express");
const router  = express.Router({ mergeParams: true });
const mlb     = require("../services/mlbApi");
const cache   = require("../services/cache");

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

  try {
    const { data } = await mlb.get(`/game/${gamePk}/linescore`);

    const result = {
      gamePk:     Number(gamePk),
      inning:     data.currentInning      ?? null,
      halfInning: data.inningHalf?.toLowerCase() ?? null, // "top" | "bottom"
      awayScore:  data.teams?.away?.runs  ?? 0,
      homeScore:  data.teams?.home?.runs  ?? 0,
      outs:       data.outs               ?? 0,
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
