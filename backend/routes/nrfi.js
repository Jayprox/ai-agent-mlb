const express = require("express");
const router = express.Router();
const mlb = require("../services/mlbApi");
const cache = require("../services/cache");

const _linescoreInFlight = new Map(); // gamePk → Promise
const _recentGamesInFlight = new Map(); // `${teamId}:${endDate}` → Promise

const NRFI_TTL_MS = 60 * 60 * 1000;
const LOOKBACK_GAMES = 20;

function shiftDate(date, days) {
  const dt = new Date(`${date}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function tendencyFromPct(pct) {
  if (pct >= 0.45) return "Strong first inning team";
  if (pct >= 0.30) return "Average 1st inning output";
  if (pct >= 0.18) return "Slow starters";
  return "Very slow starters";
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function emptyTeamFirst() {
  return { scoredPct: "0%", avgRuns: 0, tendency: "No recent data" };
}

const GAME_META_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours — team assignments never change mid-day

async function fetchGameMeta(gamePk) {
  const cacheKey = `gameMeta:${gamePk}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const { data } = await mlb.get("/schedule", {
    params: {
      sportId: 1,
      gamePks: gamePk,
      hydrate: "team",
    },
  });

  const game = data.dates?.[0]?.games?.[0] ?? null;
  if (!game) return null;

  const result = {
    gameDate: game.gameDate?.slice(0, 10),
    away: {
      id: game.teams?.away?.team?.id,
      name: game.teams?.away?.team?.name ?? "",
    },
    home: {
      id: game.teams?.home?.team?.id,
      name: game.teams?.home?.team?.name ?? "",
    },
  };

  cache.set(cacheKey, result, GAME_META_TTL_MS);
  return result;
}

const TEAM_RECENT_GAMES_TTL_MS = 60 * 60 * 1000; // 1 hour

const LINESCORE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — completed games are immutable

async function getLinescore(gamePk) {
  const cacheKey = `linescore:prior:${gamePk}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  if (_linescoreInFlight.has(gamePk)) return _linescoreInFlight.get(gamePk);

  const promise = mlb.get(`/game/${gamePk}/linescore`)
    .then(({ data }) => {
      cache.set(cacheKey, data, LINESCORE_TTL_MS);
      _linescoreInFlight.delete(gamePk);
      return data;
    })
    .catch((err) => {
      _linescoreInFlight.delete(gamePk);
      throw err;
    });

  _linescoreInFlight.set(gamePk, promise);
  return promise;
}

async function fetchRecentTeamGames(teamId, endDate, excludeGamePk) {
  // Cache the raw completed-games list keyed by team+date (before excludeGamePk filter,
  // since the same list is reused for both away and home team lookups on a given day).
  const cacheKey = `teamRecentGames:${teamId}:${endDate}`;
  const inflightKey = `${teamId}:${endDate}`;
  let allGames = cache.get(cacheKey);

  if (!allGames) {
    if (_recentGamesInFlight.has(inflightKey)) {
      allGames = await _recentGamesInFlight.get(inflightKey);
    } else {
      const promise = mlb.get("/schedule", {
        params: {
          sportId: 1,
          teamId,
          startDate: shiftDate(endDate, -120),
          endDate,
          gameType: "R",
        },
      })
        .then(({ data }) => {
          const games = (data.dates || [])
            .flatMap((date) => date.games || [])
            .filter((game) => game.status?.codedGameState === "F" || game.status?.abstractGameState === "Final")
            .sort((a, b) => Date.parse(b.gameDate) - Date.parse(a.gameDate))
            .slice(0, LOOKBACK_GAMES)
            .map((game) => ({
              gamePk: game.gamePk,
              side: game.teams?.away?.team?.id === teamId ? "away" : "home",
            }));
          cache.set(cacheKey, games, TEAM_RECENT_GAMES_TTL_MS);
          _recentGamesInFlight.delete(inflightKey);
          return games;
        })
        .catch((err) => {
          _recentGamesInFlight.delete(inflightKey);
          throw err;
        });

      _recentGamesInFlight.set(inflightKey, promise);
      allGames = await promise;
    }
  }

  // Apply excludeGamePk after cache retrieval so the cached list stays reusable
  return allGames.filter((game) => game.gamePk !== excludeGamePk);
}

async function computeTeamFirstInning(teamId, endDate, excludeGamePk) {
  const recentGames = await fetchRecentTeamGames(teamId, endDate, excludeGamePk);
  if (!recentGames.length) return emptyTeamFirst();

  const lineScores = await Promise.allSettled(
    recentGames.map((game) => getLinescore(game.gamePk))
  );

  const runs = lineScores.flatMap((result, index) => {
    if (result.status !== "fulfilled") return [];
    const side = recentGames[index].side;
    const inning = result.value?.innings?.[0];
    const firstRuns = Number(inning?.[side]?.runs);
    return Number.isNaN(firstRuns) ? [] : [firstRuns];
  });

  if (!runs.length) return emptyTeamFirst();

  const scoredGames = runs.filter((value) => value > 0).length;
  const pct = scoredGames / runs.length;
  const avgRuns = runs.reduce((sum, value) => sum + value, 0) / runs.length;

  return {
    scoredPct: `${Math.round(pct * 100)}%`,
    avgRuns: round2(avgRuns),
    tendency: tendencyFromPct(pct),
  };
}

function deriveLeanAndConfidence(awayFirst, homeFirst) {
  const awayPct = parseInt(awayFirst.scoredPct, 10) / 100 || 0;
  const homePct = parseInt(homeFirst.scoredPct, 10) / 100 || 0;
  const combinedPct = (awayPct + homePct) / 2;
  const combinedRuns = awayFirst.avgRuns + homeFirst.avgRuns;

  let score = 0;
  if      (combinedPct <= 0.20) score += 15;
  else if (combinedPct <= 0.28) score += 9;
  else if (combinedPct <= 0.34) score += 4;
  else if (combinedPct >= 0.46) score -= 15;
  else if (combinedPct >= 0.40) score -= 9;
  else if (combinedPct >= 0.34) score -= 4;

  if      (combinedRuns <= 0.45) score += 8;
  else if (combinedRuns <= 0.65) score += 3;
  else if (combinedRuns >= 1.10) score -= 8;
  else if (combinedRuns >= 0.85) score -= 4;

  return {
    lean: score >= 0 ? "NRFI" : "YRFI",
    confidence: Math.min(75, Math.max(38, 50 + Math.abs(score))),
  };
}

router.get("/:gamePk", async (req, res) => {
  const { gamePk } = req.params;
  const cacheKey = `nrfi:${gamePk}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    const meta = await fetchGameMeta(gamePk);
    if (!meta?.away?.id || !meta?.home?.id || !meta?.gameDate) {
      return res.status(404).json({ error: "Game not found" });
    }

    const endDate = shiftDate(meta.gameDate, -1);
    const [awayFirst, homeFirst] = await Promise.all([
      computeTeamFirstInning(meta.away.id, endDate, Number(gamePk)),
      computeTeamFirstInning(meta.home.id, endDate, Number(gamePk)),
    ]);

    const { lean, confidence } = deriveLeanAndConfidence(awayFirst, homeFirst);
    const result = { awayFirst, homeFirst, lean, confidence };

    cache.set(cacheKey, result, NRFI_TTL_MS);
    res.setHeader("X-Cache", "MISS");
    return res.json(result);
  } catch (err) {
    return res.status(502).json({ error: "MLB API unavailable", detail: err.message });
  }
});

module.exports = router;
