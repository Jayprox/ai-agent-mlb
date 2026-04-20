const express = require("express");
const router  = express.Router();
const mlb     = require("../services/mlbApi");
const cache   = require("../services/cache");

// Transform a team's boxscore data into a batting-order array.
// Returns [] if the lineup hasn't been posted yet.
const transformTeam = (teamData) => {
  const battingOrder = teamData.battingOrder ?? [];
  return battingOrder.map((playerId, idx) => {
    const player = teamData.players[`ID${playerId}`];
    if (!player) return null;
    return {
      order:      idx + 1,
      id:         playerId,
      name:       player.person.fullName,
      pos:        player.position.abbreviation,
      primaryPos: player.person.primaryPosition?.abbreviation ?? null,
      hand:       player.batSide?.code ?? "?",
    };
  }).filter(Boolean);
};

// ── GET /api/lineups/:gamePk ─────────────────────────────────
// Returns confirmed batting orders for both teams.
// `confirmed: false` means the lineup hasn't been posted yet — frontend
// should fall back to mock / show a "pending" state.
router.get("/:gamePk", async (req, res) => {
  const { gamePk } = req.params;
  const cacheKey   = `lineups:${gamePk}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    const { data } = await mlb.get(`/game/${gamePk}/boxscore?hydrate=person`);

    const awayLineup = transformTeam(data.teams.away);
    const homeLineup = transformTeam(data.teams.home);
    const confirmed  = awayLineup.length > 0 && homeLineup.length > 0;

    const result = {
      gamePk:    parseInt(gamePk),
      confirmed,
      away:      awayLineup,
      home:      homeLineup,
    };

    // If lineups are posted: cache 5 min (they can still change).
    // If not yet posted: cache 1 min so we keep checking.
    const ttl = confirmed ? 5 * 60 * 1000 : 60 * 1000;
    cache.set(cacheKey, result, ttl);
    res.setHeader("X-Cache", "MISS");
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: "MLB API unavailable", detail: err.message });
  }
});

module.exports = router;
