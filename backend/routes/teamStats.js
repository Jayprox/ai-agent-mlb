const express = require("express");
const router = express.Router();
const mlb = require("../services/mlbApi");
const cache = require("../services/cache");

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const currentSeason = () => new Date().getFullYear();

async function fetchTeamStats(teamId) {
  const season = currentSeason();
  const cacheKey = `team-stats:${teamId}:${season}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const { data } = await mlb.get(`/teams/${teamId}/stats`, {
    params: { stats: "season", group: "hitting", season },
  });
  const split = data?.stats?.[0]?.splits?.[0]?.stat ?? {};
  const strikeOuts = parseFloat(split.strikeOuts ?? split.strikeouts ?? 0) || 0;
  const plateAppearances = parseFloat(split.plateAppearances ?? split.pa ?? 0) || 0;
  const runs = parseFloat(split.runs ?? 0) || 0;
  const gamesPlayed = parseFloat(split.gamesPlayed ?? 1) || 1;
  const kPct = plateAppearances > 0
    ? Math.round((strikeOuts / plateAppearances) * 1000) / 10
    : null;
  const runsPerGame = Math.round((runs / gamesPlayed) * 100) / 100;

  const result = {
    teamId: Number(teamId),
    season,
    kPct,
    runsPerGame,
  };

  cache.set(cacheKey, result, CACHE_TTL_MS);
  return result;
}

router.get("/:teamId", async (req, res) => {
  const { teamId } = req.params;
  try {
    const cacheKey = `team-stats:${teamId}:${currentSeason()}`;
    const cacheHit = !!cache.get(cacheKey);
    const result = await fetchTeamStats(teamId);
    res.setHeader("X-Cache", cacheHit ? "HIT" : "MISS");
    return res.json(result);
  } catch (err) {
    console.error(`  ✗ team-stats ${teamId}: ${err.message}`);
    return res.status(502).json({ error: "MLB API unavailable", detail: err.message });
  }
});

module.exports = router;
module.exports.fetchTeamStats = fetchTeamStats;
