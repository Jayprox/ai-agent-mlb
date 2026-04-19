const express = require("express");
const router  = express.Router();
const mlb     = require("../services/mlbApi");
const cache   = require("../services/cache");

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

  try {
    // Officials are embedded in the boxscore response — the dedicated
    // /officials endpoint is not a valid MLB Stats API path and returns 404.
    const { data } = await mlb.get(`/game/${gamePk}/boxscore`);

    const officials = data.officials ?? [];
    const hp = officials.find((o) => o.officialType === "Home Plate");

    const result = {
      gamePk:    parseInt(gamePk),
      homePlate: hp
        ? { id: hp.official.id, name: hp.official.fullName }
        : null,
      all: officials.map((o) => ({
        id:       o.official.id,
        name:     o.official.fullName,
        position: o.officialType,
      })),
    };

    // Cache for 1 hour — assigned day-of and doesn't change
    cache.set(cacheKey, result, 60 * 60 * 1000);
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
