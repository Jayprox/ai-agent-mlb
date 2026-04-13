const express = require("express");
const router  = express.Router();
const mlb     = require("../services/mlbApi");
const cache   = require("../services/cache");

const SEASON = new Date().getFullYear();

// currentTeam from the MLB API does not include an `abbreviation` field —
// resolve it via team ID instead.
const TEAM_ABBR = {
  108: "LAA", 109: "ARI", 110: "BAL", 111: "BOS", 112: "CHC",
  113: "CIN", 114: "CLE", 115: "COL", 116: "DET", 117: "HOU",
  118: "KC",  119: "LAD", 120: "WSH", 121: "NYM", 133: "OAK",
  134: "PIT", 135: "SD",  136: "SEA", 137: "SF",  138: "STL",
  139: "TB",  140: "TEX", 141: "TOR", 142: "MIN", 143: "PHI",
  144: "ATL", 145: "CWS", 146: "MIA", 147: "NYY", 158: "MIL",
};

// ── GET /api/players/:playerId/stats?group=hitting|pitching ──
// Returns season stats + player info for a given MLB player ID.
// `group` defaults to "hitting". Pass "pitching" for pitchers.
//
// Known IDs (from handoff doc):
//   Zack Wheeler  554430
//   Aaron Judge   592450
router.get("/:playerId/stats", async (req, res) => {
  const { playerId } = req.params;
  const group        = req.query.group ?? "hitting";
  const cacheKey     = `player:${playerId}:${group}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    // Fetch person info + season stats in parallel
    const [personRes, statsRes] = await Promise.all([
      mlb.get(`/people/${playerId}`, {
        params: { hydrate: "currentTeam" },
      }),
      mlb.get(`/people/${playerId}/stats`, {
        params: { stats: "season", group, season: SEASON },
      }),
    ]);

    const person = personRes.data.people?.[0];
    if (!person) return res.status(404).json({ error: "Player not found" });

    const seasonSplit = statsRes.data.stats?.[0]?.splits?.[0]?.stat ?? {};

    // Shape the response to mirror our mock data structure
    const result = {
      id:       parseInt(playerId),
      name:     person.fullName,
      number:   person.primaryNumber ?? "?",
      team:     TEAM_ABBR[person.currentTeam?.id] ?? person.currentTeam?.abbreviation ?? "?",
      position: person.primaryPosition?.abbreviation ?? "?",
      hand:     group === "hitting"
        ? person.batSide?.code ?? "?"
        : person.pitchHand?.code ?? "?",
      season: seasonSplit,
      // Hitting-specific computed fields for the app
      ...(group === "hitting" && {
        avg: seasonSplit.avg ?? ".000",
        ops: seasonSplit.ops ?? ".000",
        hr:  seasonSplit.homeRuns ?? 0,
        rbi: seasonSplit.rbi ?? 0,
      }),
      // Pitching-specific computed fields
      ...(group === "pitching" && {
        era:    seasonSplit.era ?? "0.00",
        whip:   seasonSplit.whip ?? "0.00",
        kPer9:  seasonSplit.strikeoutsPer9Inn ?? "0.0",
        bbPer9: seasonSplit.walksPer9Inn ?? "0.0",
        wins:   seasonSplit.wins ?? 0,
        losses: seasonSplit.losses ?? 0,
        ip:     seasonSplit.inningsPitched ?? "0.0",
        k:      seasonSplit.strikeOuts ?? 0,
        bb:     seasonSplit.baseOnBalls ?? 0,
      }),
    };

    // Stats update nightly — cache for 6 hours
    cache.set(cacheKey, result, 6 * 60 * 60 * 1000);
    res.setHeader("X-Cache", "MISS");
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: "MLB API unavailable", detail: err.message });
  }
});

module.exports = router;
