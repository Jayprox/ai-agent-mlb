const express = require("express");
const router  = express.Router();
const mlb     = require("../services/mlbApi");
const cache   = require("../services/cache");
const { query, isConnected } = require("../services/db");

const SEASON      = new Date().getFullYear();
const BULLPEN_TTL = 30 * 60 * 1000; // 30 min — refresh before game
const GAME_BULLPEN_TTL = 15 * 60 * 1000;
const PITCHER_TTL_MS  = 6 * 60 * 60 * 1000; // 6 hours — season stats update nightly

// ── Helpers ──────────────────────────────────────────────────
const gradeFromEra = (era) => {
  const e = parseFloat(era) || 5.00;
  if (e < 3.00) return { grade: "A",  gradeColor: "#22c55e" };
  if (e < 3.50) return { grade: "B+", gradeColor: "#22c55e" };
  if (e < 4.00) return { grade: "B",  gradeColor: "#f59e0b" };
  if (e < 4.50) return { grade: "B-", gradeColor: "#f59e0b" };
  if (e < 5.00) return { grade: "C+", gradeColor: "#ef4444" };
  return           { grade: "C",  gradeColor: "#ef4444" };
};

const daysSince = (dateStr) => {
  if (!dateStr) return 99;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const lastAppLabel = (days) => {
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
};

const roleFromStats = (saves, holds) => {
  if (saves >= 3)  return "CL";
  if (holds >= 3)  return "SU";
  return "MR";
};

const isLikelyReliever = (r) => (
  r._gamesStarted === 0 ||
  r._gamesFinished > 0 ||
  r._saves > 0 ||
  r._holds > 0 ||
  r._inherited > 0
);

// Fetches and caches all three per-pitcher data sources in one shot.
// Cache key `pitcher:${personId}` is bullpen-specific so it doesn't
// collide with the `player:${personId}:pitching` key used by players.js
// (which stores a different shape).
async function getPitcherData(personId) {
  const cacheKey = `pitcher:${personId}`;
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  const [combinedRes, personRes] = await Promise.all([
    mlb.get(`/people/${personId}/stats`, {
      params: { stats: "season,gameLog", group: "pitching", season: SEASON },
    }),
    mlb.get(`/people/${personId}`, {}),
  ]);

  const statsArr = combinedRes.data.stats ?? [];
  const seasonEntry = statsArr.find((s) =>
    /season|regular/i.test(s.type?.displayName ?? "")
  );
  const gameLogEntry = statsArr.find((s) =>
    /log/i.test(s.type?.displayName ?? "")
  );

  const result = {
    stat:   seasonEntry?.splits?.[0]?.stat ?? {},
    games:  gameLogEntry?.splits ?? [],
    person: personRes.data.people?.[0] ?? {},
  };

  cache.set(cacheKey, result, PITCHER_TTL_MS);
  return result;
}

async function buildTeamBullpen(teamId) {
  const cacheKey   = `bullpen:team:${teamId}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // 1. Active roster → collect all active pitchers.
  // MLB's current roster feed often labels bullpen arms as generic "P",
  // not "RP"/"CL", so reliever detection happens after season stats load.
  const rosterRes = await mlb.get(`/teams/${teamId}/roster`, {
    params: { rosterType: "active", season: SEASON },
  });
  const allRoster = rosterRes.data.roster ?? [];
  const pitchers = allRoster.filter(p => p.position?.abbreviation === "P");

  if (!pitchers.length) {
    throw new Error(`No pitchers found for teamId=${teamId}`);
  }

  console.log(`  → Bullpen  teamId=${teamId}  pitchers=${pitchers.length}`);

  // 2. Fetch season stats + game log for each pitcher in parallel, then
  // classify likely relievers from the returned usage profile.
  const cutoff3d = Date.now() - 3 * 24 * 60 * 60 * 1000;

  const pitcherData = await Promise.all(pitchers.map(async (p) => {
    const personId = p.person.id;
    try {
      const { stat, games, person } = await getPitcherData(personId);

      // Most recent appearance
      const lastGame    = games[games.length - 1];
      const lastDate    = lastGame?.date ?? null;
      const days        = daysSince(lastDate);
      const lastPitches = parseInt(lastGame?.stat?.numberOfPitches ?? 0);

      // Pitches thrown in last 3 calendar days
      const pitches3d = games
        .filter(g => new Date(g.date).getTime() >= cutoff3d)
        .reduce((sum, g) => sum + parseInt(g.stat?.numberOfPitches ?? 0), 0);

      // Fatigue status for this individual arm
      const status = (days <= 1 && lastPitches > 20) ? "TIRED"
                   : (days === 2 && lastPitches > 35) ? "MODERATE"
                   : "FRESH";

      const saves = parseInt(stat.saves ?? 0);
      const holds = parseInt(stat.holds ?? 0);
      const gamesStarted = parseInt(stat.gamesStarted ?? 0);
      const gamesPlayed  = parseInt(stat.gamesPlayed ?? stat.gamesPitched ?? 0);
      const gamesFinished = parseInt(stat.gamesFinished ?? 0);
      const inherited = parseInt(stat.inheritedRunners ?? 0);

      return {
        name:    person.fullName ?? p.person.fullName,
        role:    roleFromStats(saves, holds),
        hand:    person.pitchHand?.code ?? "R",
        era:  stat.era  ?? "—",
        whip: stat.whip ?? "—",
        k9:   stat.strikeoutsPer9Inn ?? "—",
        bb9:  stat.walksPer9Inn      ?? "—",
        lastApp: lastDate ? lastAppLabel(days) : "—",
        pitches: lastPitches,
        status,
        // internal — stripped before response
        _days:       days,
        _pitches3d:  pitches3d,
        _era:        parseFloat(stat.era) || 5.00,
        _hand:       person.pitchHand?.code ?? "R",
        _gamesStarted: gamesStarted,
        _gamesPlayed:  gamesPlayed,
        _gamesFinished: gamesFinished,
        _saves:        saves,
        _holds:        holds,
        _inherited:    inherited,
      };
    } catch (err) {
      console.error(`    ✗ Reliever ${personId}: ${err.message}`);
      return null;
    }
  }));

  const validPitchers = pitcherData.filter(Boolean);
  if (!validPitchers.length) {
    throw new Error(`Could not fetch pitcher stats for teamId=${teamId}`);
  }

  let valid = validPitchers.filter(isLikelyReliever);

  // Fallback: if reliever heuristics are too strict for a team, keep arms
  // that have appeared without being pure starters.
  if (!valid.length) {
    valid = validPitchers.filter(r => r._gamesStarted < r._gamesPlayed);
  }
  if (!valid.length) {
    throw new Error(`No relievers found for teamId=${teamId}`);
  }

  // Prioritize the most relevant bullpen arms before computing team metrics.
  valid = valid
    .sort((a, b) =>
      (b._saves + b._holds) - (a._saves + a._holds) ||
      b._gamesFinished - a._gamesFinished ||
      a._era - b._era
    )
    .slice(0, 8);

  // 3. Team-level derived metrics
  const totalPitches3d = valid.reduce((s, r) => s + r._pitches3d, 0);
  const avgDaysRest    = valid.reduce((s, r) => s + Math.min(r._days, 10), 0) / valid.length;
  const teamEra        = valid.reduce((s, r) => s + r._era, 0) / valid.length;
  const lhCount        = valid.filter(r => r._hand === "L").length;
  const rhCount        = valid.filter(r => r._hand === "R").length;
  const qualityArms    = valid.filter(r => r._era < 4.00).length;

  const fatigueLevel = totalPitches3d > 150 || avgDaysRest < 1.5 ? "HIGH"
                     : totalPitches3d > 80  || avgDaysRest < 2.5 ? "MODERATE"
                     : "FRESH";

  const { grade, gradeColor } = gradeFromEra(teamEra.toFixed(2));

  const setupDepth = qualityArms >= 4 ? "DEEP"
                   : qualityArms >= 2 ? "MODERATE"
                   : "THIN";

  const lrBalance = Math.abs(lhCount - rhCount) <= 1 ? "BALANCED"
                  : lhCount > rhCount ? "LH HEAVY"
                  : "RH HEAVY";

  // Narrative note + lean
  const closer   = valid.find(r => r.role === "CL");
  const tiredArm = valid.find(r => r.status === "TIRED");
  const note = tiredArm
    ? `${tiredArm.name} threw ${tiredArm.pitches}p recently — fatigue factor.`
    : closer
    ? `${closer.name} available (${closer.era} ERA).`
    : `${setupDepth} depth, ${lrBalance.toLowerCase()} pen.`;

  const lean = fatigueLevel === "HIGH"
    ? `Fatigued pen — may struggle in high-leverage situations`
    : setupDepth === "DEEP"
    ? `Deep pen — late leads well protected`
    : `${setupDepth} depth, monitor high-leverage at-bats`;

  // Strip internal fields
  const cleanedRelievers = valid.map(({
    _days, _pitches3d, _era, _hand, _gamesStarted, _gamesPlayed,
    _gamesFinished, _saves, _holds, _inherited, ...r
  }) => r);

  const result = {
    teamId:       parseInt(teamId),
    fatigueLevel,
    restDays:     Math.round(avgDaysRest),
    pitchesLast3: totalPitches3d,
    grade,
    gradeColor,
    setupDepth,
    lrBalance,
    note,
    lean,
    relievers:    cleanedRelievers,
    live:         true,
  };

  cache.set(cacheKey, result, BULLPEN_TTL);
  console.log(`  ✓ Bullpen cached  teamId=${teamId}  arms=${cleanedRelievers.length}  era=${teamEra.toFixed(2)}  fatigue=${fatigueLevel}`);
  return result;
}

async function buildGameBullpen(gamePk) {
  const cacheKey = `bullpen:game:${gamePk}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const GAME_META_TTL_MS = 4 * 60 * 60 * 1000;
  const metaCacheKey = `gameMeta:${gamePk}`;
  const numericPk = parseInt(gamePk, 10);

  let gameMeta = cache.get(metaCacheKey);

  if (!gameMeta && isConnected()) {
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
      const snap = await query(
        "SELECT games FROM schedule_snapshots WHERE slate_date = $1",
        [today]
      );
      const games = snap?.rows?.[0]?.games ?? [];
      const game = games.find(g => g.gamePk === numericPk || g.id === numericPk);
      if (game?.away?.id && game?.home?.id) {
        gameMeta = {
          gameDate: (game.gameTime ?? game.time ?? today).slice(0, 10),
          away: { id: game.away.id, name: game.away.name ?? "" },
          home: { id: game.home.id, name: game.home.name ?? "" },
        };
        cache.set(metaCacheKey, gameMeta, GAME_META_TTL_MS);
      }
    } catch (err) {
      console.warn(`  ⚠ bullpen buildGameBullpen DB read failed for ${gamePk}: ${err.message}`);
    }
  }

  if (!gameMeta) {
    const { data } = await mlb.get("/schedule", {
      params: { sportId: 1, gamePks: gamePk, hydrate: "team" },
    });
    const game = data.dates?.[0]?.games?.[0];
    if (!game) throw new Error(`Game not found for gamePk=${gamePk}`);
    gameMeta = {
      gameDate: game.gameDate?.slice(0, 10),
      away: { id: game.teams?.away?.team?.id, name: game.teams?.away?.team?.name ?? "" },
      home: { id: game.teams?.home?.team?.id, name: game.teams?.home?.team?.name ?? "" },
    };
    cache.set(metaCacheKey, gameMeta, GAME_META_TTL_MS);
  }

  const awayTeamId = gameMeta.away?.id;
  const homeTeamId = gameMeta.home?.id;
  if (!awayTeamId || !homeTeamId) throw new Error(`Missing team ids for gamePk=${gamePk}`);

  const [awayTeam, homeTeam] = await Promise.all([
    buildTeamBullpen(awayTeamId),
    buildTeamBullpen(homeTeamId),
  ]);

  const mapTeam = (t) => ({
    fatigueLevel: t.fatigueLevel,
    restDays:     t.restDays,
    pitchesLast3: t.pitchesLast3,
    grade:        t.grade,
    gradeColor:   t.gradeColor,    // needed for grade badge + lean border colour
    setupDepth:   t.setupDepth.toLowerCase(),
    lrBalance:    t.lrBalance.toLowerCase(),
    note:         t.note,
    lean:         t.lean,
    relievers: t.relievers.map((r) => ({
      name:    r.name,
      hand:    r.hand,
      era:  r.era,
      whip: r.whip,
      k9:   r.k9,
      bb9:  r.bb9,
      role: r.role,    // short codes: CL / SU / MR
      lastApp: r.lastApp,
      pitches: r.pitches,
      status:  r.status,
    })),
  });

  const result = {
    away: mapTeam(awayTeam),
    home: mapTeam(homeTeam),
  };

  cache.set(cacheKey, result, GAME_BULLPEN_TTL);
  return result;
}

// ── ROUTE: GET /api/bullpen/:id ─────────────────────────────
// Backward compatible:
// - teamId (< 1000)  -> single-team bullpen summary
// - gamePk  (> 1000) -> away/home bullpen payload for a game
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const numericId = parseInt(id, 10);

  try {
    if (numericId > 1000) {
      const cacheKey = `bullpen:game:${id}`;
      const cached = cache.get(cacheKey);
      if (cached) {
        res.setHeader("X-Cache", "HIT");
        return res.json(cached);
      }

      if (isConnected()) {
        try {
          const row = await query(
            "SELECT data, fetched_at FROM bullpen_snapshots WHERE game_pk = $1",
            [numericId]
          );
          const entry = row?.rows?.[0];
          if (entry && (Date.now() - new Date(entry.fetched_at).getTime()) < BULLPEN_TTL) {
            cache.set(cacheKey, entry.data, BULLPEN_TTL);
            res.setHeader("X-Cache", "DB-HIT");
            return res.json(entry.data);
          }
        } catch (dbErr) {
          console.warn(`Bullpen DB lookup skipped: ${dbErr.message}`);
        }
      }

      const result = await buildGameBullpen(id);
      res.setHeader("X-Cache", "MISS");
      return res.json(result);
    }

    const cacheKey = `bullpen:team:${id}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const result = await buildTeamBullpen(id);
    res.setHeader("X-Cache", "MISS");
    return res.json(result);
  } catch (err) {
    console.error(`  ✗ Bullpen failed  id=${id}: ${err.message}`);
    return res.status(502).json({ error: "MLB API unavailable", detail: err.message });
  }
});

module.exports = router;
module.exports.buildGameBullpenForJob = buildGameBullpen;
