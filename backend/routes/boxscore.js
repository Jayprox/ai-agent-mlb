const express = require("express");
const router  = express.Router();
const mlb     = require("../services/mlbApi");
const cache   = require("../services/cache");

const LIVE_TTL  =      60 * 1000; // 60 seconds for in-progress games
const FINAL_TTL = 24 * 60 * 60 * 1000; // 24 hours for completed games

// Parse batting stats for all batters on a team, in lineup order
const parseBatters = (teamData) => {
  const batters = teamData.batters ?? [];
  const players = teamData.players ?? {};
  return batters.map(id => {
    const p = players[`ID${id}`];
    if (!p) return null;
    const s = p.stats?.batting ?? {};
    // Skip if no batting stats recorded yet
    if (s.atBats === undefined) return null;
    return {
      id,
      name: p.person?.fullName ?? "Unknown",
      pos:  p.position?.abbreviation ?? "—",
      ab:   s.atBats       ?? 0,
      r:    s.runs         ?? 0,
      h:    s.hits         ?? 0,
      rbi:  s.rbi          ?? 0,
      hr:   s.homeRuns     ?? 0,
      bb:   s.baseOnBalls  ?? 0,
      k:    s.strikeOuts   ?? 0,
      avg:  s.avg          ?? "—",
    };
  }).filter(Boolean);
};

// Parse pitching stats for all pitchers who appeared, in order used
const parsePitchers = (teamData) => {
  const pitchers = teamData.pitchers ?? [];
  const players  = teamData.players  ?? {};
  return pitchers.map(id => {
    const p = players[`ID${id}`];
    if (!p) return null;
    const s = p.stats?.pitching ?? {};
    return {
      id,
      name: p.person?.fullName ?? "Unknown",
      ip:   s.inningsPitched  ?? "0.0",
      h:    s.hits            ?? 0,
      r:    s.runs            ?? 0,
      er:   s.earnedRuns      ?? 0,
      bb:   s.baseOnBalls     ?? 0,
      k:    s.strikeOuts      ?? 0,
      pc:   s.numberOfPitches ?? 0,
      era:  s.era             ?? "—",
    };
  }).filter(Boolean);
};

// ── GET /api/boxscore/:gamePk ──────────────────────────────────────────────
router.get("/:gamePk", async (req, res) => {
  const { gamePk } = req.params;
  const cacheKey   = `boxscore:${gamePk}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    // Fetch boxscore and linescore in parallel — both free MLB Stats API
    const [bsRes, lsRes] = await Promise.all([
      mlb.get(`/game/${gamePk}/boxscore`),
      mlb.get(`/game/${gamePk}/linescore`),
    ]);

    const bs = bsRes.data;
    const ls = lsRes.data;

    // Game is final when innings have been played and there's no current inning
    const inningsPlayed = (ls.innings ?? []).length;
    const isFinal = inningsPlayed > 0 && !ls.currentInning;

    // Linescore grid — inning-by-inning
    const innings = (ls.innings ?? []).map(inn => ({
      num:  inn.num,
      away: inn.away?.runs ?? null,
      home: inn.home?.runs ?? null,
    }));

    const result = {
      gamePk:  parseInt(gamePk),
      isFinal,
      linescore: {
        innings,
        away: {
          runs:   ls.teams?.away?.runs   ?? 0,
          hits:   ls.teams?.away?.hits   ?? 0,
          errors: ls.teams?.away?.errors ?? 0,
        },
        home: {
          runs:   ls.teams?.home?.runs   ?? 0,
          hits:   ls.teams?.home?.hits   ?? 0,
          errors: ls.teams?.home?.errors ?? 0,
        },
      },
      batting: {
        away: parseBatters(bs.teams?.away ?? {}),
        home: parseBatters(bs.teams?.home ?? {}),
      },
      pitching: {
        away: parsePitchers(bs.teams?.away ?? {}),
        home: parsePitchers(bs.teams?.home ?? {}),
      },
    };

    const ttl = isFinal ? FINAL_TTL : LIVE_TTL;
    cache.set(cacheKey, result, ttl);
    res.setHeader("X-Cache", "MISS");
    console.log(`  ✓ Boxscore  gamePk=${gamePk}  final=${isFinal}  innings=${inningsPlayed}`);
    return res.json(result);

  } catch (err) {
    console.error(`  ✗ Boxscore failed  gamePk=${gamePk}: ${err.message}`);
    return res.status(502).json({ error: "Boxscore unavailable", detail: err.message });
  }
});

module.exports = router;
