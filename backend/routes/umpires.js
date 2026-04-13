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
    const { data } = await mlb.get(`/game/${gamePk}/officials`);

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

    // Cache for 1 hour — assigned day-of and doesn't change after that
    cache.set(cacheKey, result, 60 * 60 * 1000);
    res.setHeader("X-Cache", "MISS");
    res.json(result);
  } catch (err) {
    // Umpire endpoint can 404 if the game hasn't loaded officials yet —
    // return empty rather than propagating the error
    if (err.response?.status === 404) {
      const empty = { gamePk: parseInt(gamePk), homePlate: null, all: [] };
      cache.set(cacheKey, empty, 5 * 60 * 1000); // retry in 5 min
      return res.json(empty);
    }
    res.status(502).json({ error: "MLB API unavailable", detail: err.message });
  }
});

module.exports = router;
