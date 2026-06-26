const express = require("express");
const router  = express.Router();
const mlb     = require("../services/mlbApi");
const cache   = require("../services/cache");
const { fetchBatterPowerProfile } = require("./batterPower");
const { fetchBatterRecentForm } = require("./batterGamelog");
const SEASON = new Date().getFullYear();
const CONFIRMED_CACHE_KEY = (gamePk) => `lineups:last-confirmed:${gamePk}`;

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

const transformRoster = (rosterData) => {
  return (rosterData?.roster ?? [])
    .filter(p => p.position?.type !== "Pitcher" && p.status?.code === "A")
    .sort((a, b) => parseInt(a.jerseyNumber ?? 99, 10) - parseInt(b.jerseyNumber ?? 99, 10))
    .map(p => ({
      order:      null,
      id:         p.person.id,
      name:       p.person.fullName,
      pos:        p.position.abbreviation,
      primaryPos: p.person.primaryPosition?.abbreviation ?? null,
      hand:       p.batSide?.code ?? p.person?.batSide?.code ?? "?",
    }));
};

const diffScratches = (previous = [], current = []) => {
  const currentIds = new Set((current ?? []).map(p => String(p.id)));
  return (previous ?? [])
    .filter(p => p?.id != null && !currentIds.has(String(p.id)))
    .map(p => ({
      id: p.id,
      name: p.name,
      pos: p.pos ?? p.primaryPos ?? null,
      order: p.order ?? null,
    }));
};

async function fetchLineupsForGame(gamePk) {
  const cacheKey   = `lineups:${gamePk}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const { data } = await mlb.get(`/game/${gamePk}/boxscore?hydrate=person`);
  const awayTeamId = data?.teams?.away?.team?.id;
  const homeTeamId = data?.teams?.home?.team?.id;

  const awayLineup = transformTeam(data.teams.away);
  const homeLineup = transformTeam(data.teams.home);
  const confirmed  = awayLineup.length > 0 && homeLineup.length > 0;
  const previousConfirmed = cache.get(CONFIRMED_CACHE_KEY(gamePk));
  let scratches = { away: [], home: [] };
  let awayRoster = [];
  let homeRoster = [];

  // Enrich batters with power profiles when lineups are confirmed.
  // Fetch in parallel, max 3 at a time to avoid Savant throttling.
  if (confirmed) {
    if (previousConfirmed?.away?.length || previousConfirmed?.home?.length) {
      scratches = {
        away: diffScratches(previousConfirmed.away, awayLineup),
        home: diffScratches(previousConfirmed.home, homeLineup),
      };
    }

    const allBatters = [...awayLineup, ...homeLineup];
    const chunkSize = 3;

    for (let i = 0; i < allBatters.length; i += chunkSize) {
      const chunk = allBatters.slice(i, i + chunkSize);

      const [profiles, forms] = await Promise.all([
        Promise.all(chunk.map(b => fetchBatterPowerProfile(b.id))),
        Promise.all(chunk.map(b => fetchBatterRecentForm(b.id))),
      ]);

      chunk.forEach((b, idx) => {
        b.powerProfile = profiles[idx] ?? null;
        b.recentForm = forms[idx] ?? null;
      });
    }

    cache.set(CONFIRMED_CACHE_KEY(gamePk), { away: awayLineup, home: homeLineup }, 12 * 60 * 60 * 1000);
  } else if (awayTeamId && homeTeamId) {
    try {
      const [awayRosterRes, homeRosterRes] = await Promise.all([
        mlb.get(`/teams/${awayTeamId}/roster`, {
          params: { rosterType: "active", season: SEASON, hydrate: "person" },
        }),
        mlb.get(`/teams/${homeTeamId}/roster`, {
          params: { rosterType: "active", season: SEASON, hydrate: "person" },
        }),
      ]);
      awayRoster = transformRoster(awayRosterRes.data);
      homeRoster = transformRoster(homeRosterRes.data);
    } catch (rosterErr) {
      console.warn(`Roster fallback failed for game ${gamePk}: ${rosterErr.message}`);
    }
  }

  const result = {
    gamePk: parseInt(gamePk, 10),
    confirmed,
    source: confirmed ? "lineup" : "roster",
    scratches,
    away: confirmed ? awayLineup : awayRoster,
    home: confirmed ? homeLineup : homeRoster,
  };

  // If lineups are posted: cache 5 min (they can still change).
  // If not yet posted: cache 1 min so we keep checking.
  const ttl = confirmed ? 5 * 60 * 1000 : 60 * 1000;
  cache.set(cacheKey, result, ttl);
  return result;
}

// ── GET /api/lineups/:gamePk ─────────────────────────────────
// Returns confirmed batting orders for both teams.
// `confirmed: false` means the lineup hasn't been posted yet — frontend
// should fall back to mock / show a "pending" state.
router.get("/:gamePk", async (req, res) => {
  const { gamePk } = req.params;
  try {
    const cacheKey = `lineups:${gamePk}`;
    const cacheHit = !!cache.get(cacheKey);
    const result = await fetchLineupsForGame(gamePk);
    res.setHeader("X-Cache", cacheHit ? "HIT" : "MISS");
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: "MLB API unavailable", detail: err.message });
  }
});

module.exports = router;
module.exports.fetchLineupsForGame = fetchLineupsForGame;
