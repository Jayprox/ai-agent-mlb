const express = require("express");
const router = express.Router();
const mlb = require("../services/mlbApi");
const cache = require("../services/cache");

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const currentSeason = () => new Date().getFullYear();

router.get("/:teamId", async (req, res) => {
  const { teamId } = req.params;
  const season = currentSeason();
  const cacheKey = `team-stats:${teamId}:${season}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    const { data } = await mlb.get(`/teams/${teamId}/stats`, {
      params: { stats: "season", group: "hitting", season },
    });
    const split = data?.stats?.[0]?.splits?.[0]?.stat ?? {};
    const strikeOuts = parseFloat(split.strikeOuts ?? split.strikeouts ?? 0) || 0;
    const plateAppearances = parseFloat(split.plateAppearances ?? split.pa ?? 0) || 0;
    const kPct = plateAppearances > 0
      ? Math.round((strikeOuts / plateAppearances) * 1000) / 10
      : null;

    const result = {
      teamId: Number(teamId),
      season,
      kPct,
    };

    cache.set(cacheKey, result, CACHE_TTL_MS);
    res.setHeader("X-Cache", "MISS");
    return res.json(result);
  } catch (err) {
    console.error(`  ✗ team-stats ${teamId}: ${err.message}`);
    return res.status(502).json({ error: "MLB API unavailable", detail: err.message });
  }
});

module.exports = router;
