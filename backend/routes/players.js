const express = require("express");
const router  = express.Router();
const mlb     = require("../services/mlbApi");
const cache   = require("../services/cache");
const db = require("../services/db");

const SEASON = new Date().getFullYear();
const GAMELOG_TTL_MS = 6 * 60 * 60 * 1000;
const H2H_TTL_MS = 24 * 60 * 60 * 1000;
const RBI_CTX_TTL_MS = 6 * 60 * 60 * 1000;

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

function todayHonolulu() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}

const seasonStatsFor = async (playerId, group, season) => {
  const [personRes, statsRes] = await Promise.all([
    mlb.get(`/people/${playerId}`, {
      params: { hydrate: "currentTeam" },
    }),
    mlb.get(`/people/${playerId}/stats`, {
      params: { stats: "season", group, season },
    }),
  ]);

  return {
    person: personRes.data.people?.[0] ?? null,
    seasonSplit: statsRes.data.stats?.[0]?.splits?.[0]?.stat ?? {},
  };
};

const gamelogStatsFor = async (playerId, group, season) => {
  const { data } = await mlb.get(`/people/${playerId}/stats`, {
    params: { stats: "gameLog", group, season },
  });
  return data.stats?.[0]?.splits ?? [];
};

const parseIpToOuts = (ip) => {
  if (!ip) return 0;
  const [whole, frac = "0"] = String(ip).split(".");
  return (parseInt(whole, 10) || 0) * 3 + (parseInt(frac, 10) || 0);
};

const formatEra = (earnedRuns, outs) => {
  if (!outs) return "0.00";
  return ((earnedRuns * 27) / outs).toFixed(2);
};

const emptyRbiContext = () => ({
  rbiPerGame: 0,
  rbiRate: 0,
  slg: ".000",
  extraBaseHits: 0,
});

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

// ── POST /api/players/gamelogs/batch ──────────────────────────────────────────
// Accepts { playerIds: number[], group: "hitting"|"pitching" }
// Returns { results: { [playerId]: data }, misses: number[] }
// Resolves via the same 3-layer cache as the individual gamelog route:
//   L1 in-memory → L2 DB snapshot → L3 MLB API (parallel, capped at 8 concurrent)
router.post("/gamelogs/batch", async (req, res) => {
  const playerIds = Array.isArray(req.body?.playerIds) ? req.body.playerIds : [];
  const group = req.body?.group === "pitching" ? "pitching" : "hitting";
  const today = todayHonolulu();

  if (!playerIds.length) return res.json({ results: {}, misses: [] });

  const uniqueIds = [...new Set(playerIds.map(Number))].filter(Boolean);
  const results = {};
  const needDb = [];

  // L1 — in-memory cache
  for (const id of uniqueIds) {
    const cacheKey = `gamelog:${id}:${group}`;
    const hit = cache.get(cacheKey);
    if (hit) results[id] = hit;
    else needDb.push(id);
  }

  // L2 — single DB query for all remaining IDs
  if (needDb.length && db.isConnected()) {
    try {
      const dbResult = await db.query(
        `SELECT player_id, data FROM player_gamelog_snapshots
         WHERE player_id = ANY($1) AND stat_group = $2 AND slate_date = $3`,
        [needDb, group, today]
      );
      for (const row of dbResult?.rows ?? []) {
        const id = row.player_id;
        results[id] = row.data;
        cache.set(`gamelog:${id}:${group}`, row.data, GAMELOG_TTL_MS);
      }
    } catch (dbErr) {
      console.warn("batch gamelog DB read failed:", dbErr.message);
    }
  }

  // L3 — MLB API for remaining misses (parallel, max 8 concurrent)
  const needApi = uniqueIds.filter(id => !results[id]);
  const misses = [];

  if (needApi.length) {
    const CONCURRENCY = 8;
    for (let i = 0; i < needApi.length; i += CONCURRENCY) {
      const chunk = needApi.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(async (id) => {
        try {
          let season = SEASON;
          let splits = await gamelogStatsFor(id, group, season);
          if (!splits.length) {
            season -= 1;
            splits = await gamelogStatsFor(id, group, season);
          }
          const { person, seasonSplit } = await seasonStatsFor(id, group, season);
          if (!person) { misses.push(id); return; }

          const sorted = [...splits].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

          const payload = group === "pitching"
            ? (() => {
                const starts = sorted.filter(g => (g.stat?.gamesStarted ?? 0) > 0).slice(0, 5);
                const games = starts.map(g => ({
                  date: g.date,
                  opponent: TEAM_ABBR[g.opponent?.id] ?? g.opponent?.name ?? "?",
                  ip: g.stat?.inningsPitched ?? "0.0",
                  k: g.stat?.strikeOuts ?? 0,
                  er: g.stat?.earnedRuns ?? 0,
                  pc: g.stat?.numberOfPitches ?? null,
                  era: g.stat?.era ?? "0.00",
                  result: (g.stat?.wins ?? 0) > 0 ? "W" : (g.stat?.losses ?? 0) > 0 ? "L" : "ND",
                }));
                const totalOuts = games.reduce((sum, g) => sum + parseIpToOuts(g.ip), 0);
                const avgIPOuts = games.length > 0 ? totalOuts / games.length : 0;
                const avgIPWhole = Math.floor(avgIPOuts / 3);
                const avgIPThirds = Math.round(avgIPOuts % 3);
                const avgIP = games.length > 0 ? `${avgIPWhole}.${avgIPThirds}` : "—";
                return { group: "pitching", games, avgIP, seasonEra: seasonSplit?.era ?? "0.00" };
              })()
            : (() => {
                const games = sorted.slice(0, 10).map(g => ({
                  date: g.date,
                  opponent: TEAM_ABBR[g.opponent?.id] ?? g.opponent?.name ?? "?",
                  ab: g.stat?.atBats ?? 0,
                  h: g.stat?.hits ?? 0,
                  hr: g.stat?.homeRuns ?? 0,
                  rbi: g.stat?.rbi ?? 0,
                  avg: g.stat?.avg ?? ".000",
                }));
                const last7 = sorted.filter(g => (g.stat?.atBats ?? 0) > 0).slice(0, 7);
                const last7Hits = last7.reduce((sum, g) => sum + (g.stat?.hits ?? 0), 0);
                const last7Abs = last7.reduce((sum, g) => sum + (g.stat?.atBats ?? 0), 0);
                const gp = Number(seasonSplit?.gamesPlayed) || 0;
                const tbTot = Number(seasonSplit?.totalBases) || 0;
                return {
                  group: "hitting", games,
                  seasonAvg: seasonSplit?.avg ?? ".000",
                  last7Avg: last7Abs > 0 ? `${(last7Hits / last7Abs).toFixed(3).replace(/^0/, "")}` : ".000",
                  avg: seasonSplit?.avg ?? ".000",
                  ops: seasonSplit?.ops ?? ".000",
                  slg: seasonSplit?.sluggingPercentage ?? ".000",
                  hr: seasonSplit?.homeRuns ?? 0,
                  avgTB: gp > 0 ? (tbTot / gp).toFixed(1) : "—",
                  hand: person?.batSide?.code ?? null,
                  hitRate: games.slice(0, 5).map(g => g.h > 0 ? 1 : 0),
                };
              })();

          results[id] = payload;
          cache.set(`gamelog:${id}:${group}`, payload, GAMELOG_TTL_MS);

          // Write-through to DB (best-effort)
          if (db.isConnected()) {
            db.query(
              `INSERT INTO player_gamelog_snapshots (player_id, stat_group, slate_date, fetched_at, data)
               VALUES ($1, $2, $3, NOW(), $4)
               ON CONFLICT (player_id, stat_group, slate_date) DO UPDATE
                 SET fetched_at = NOW(), data = $4`,
              [id, group, today, JSON.stringify(payload)]
            ).catch(err => console.warn(`batch gamelog DB write failed for ${id}:`, err.message));
          }
        } catch (err) {
          console.warn(`batch gamelog MLB API failed for ${id}:`, err.message);
          misses.push(id);
        }
      }));
    }
  }

  return res.json({ results, misses });
});

// ── GET /api/players/:playerId/gamelog?group=hitting|pitching ──
// Returns recent game-log slices for lineup heat checks and SP recent form.
router.get("/:playerId/gamelog", async (req, res) => {
  const { playerId } = req.params;
  const group = req.query.group === "pitching" ? "pitching" : "hitting";
  const cacheKey = `gamelog:${playerId}:${group}`;
  const today = todayHonolulu();

  // 1. In-memory cache (fastest — same-request dedup within one process lifetime)
  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  // 2. DB snapshot for today (survives dyno restarts)
  if (db.isConnected()) {
    try {
      const dbResult = await db.query(
        `SELECT data FROM player_gamelog_snapshots
         WHERE player_id = $1 AND stat_group = $2 AND slate_date = $3`,
        [parseInt(playerId, 10), group, today]
      );
      if (dbResult?.rows?.length) {
        const result = dbResult.rows[0].data;
        cache.set(cacheKey, result, GAMELOG_TTL_MS);
        res.setHeader("X-Cache", "DB_HIT");
        return res.json(result);
      }
    } catch (dbErr) {
      console.warn(`gamelog DB read failed for ${playerId}:`, dbErr.message);
      // fall through to MLB API
    }
  }

  // 3. MLB API fetch — write through to DB and in-memory cache
  try {
    let season = SEASON;
    let splits = await gamelogStatsFor(playerId, group, season);

    if (!splits.length) {
      season -= 1;
      splits = await gamelogStatsFor(playerId, group, season);
    }

    const { person, seasonSplit } = await seasonStatsFor(playerId, group, season);
    if (!person) return res.status(404).json({ error: "Player not found" });

    const sorted = [...splits].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

    const result = group === "pitching"
      ? (() => {
          const starts = sorted
            .filter(g => (g.stat?.gamesStarted ?? 0) > 0)
            .slice(0, 5);
          const games = starts.map(g => ({
            date:     g.date,
            opponent: TEAM_ABBR[g.opponent?.id] ?? g.opponent?.name ?? "?",
            ip:       g.stat?.inningsPitched ?? "0.0",
            k:        g.stat?.strikeOuts ?? 0,
            er:       g.stat?.earnedRuns ?? 0,
            pc:       g.stat?.numberOfPitches ?? null,
            era:      g.stat?.era ?? "0.00",
            result:   (g.stat?.wins ?? 0) > 0 ? "W" : (g.stat?.losses ?? 0) > 0 ? "L" : "ND",
          }));
          // avgIP from actual recent starts — avoids relying on gamesStarted in season stats
          const totalOuts = games.reduce((sum, g) => sum + parseIpToOuts(g.ip), 0);
          const avgIPOuts  = games.length > 0 ? totalOuts / games.length : 0;
          const avgIPWhole  = Math.floor(avgIPOuts / 3);
          const avgIPThirds = Math.round(avgIPOuts % 3);
          const avgIP = games.length > 0 ? `${avgIPWhole}.${avgIPThirds}` : "—";
          return { group: "pitching", games, avgIP, seasonEra: seasonSplit?.era ?? "0.00" };
        })()
      : (() => {
          const games = sorted
            .slice(0, 10)
            .map(g => ({
              date:     g.date,
              opponent: TEAM_ABBR[g.opponent?.id] ?? g.opponent?.name ?? "?",
              ab:       g.stat?.atBats ?? 0,
              h:        g.stat?.hits ?? 0,
              hr:       g.stat?.homeRuns ?? 0,
              rbi:      g.stat?.rbi ?? 0,
              avg:      g.stat?.avg ?? ".000",
            }));

          const last7Games = sorted
            .filter(g => (g.stat?.atBats ?? 0) > 0)
            .slice(0, 7);
          const last7Hits = last7Games.reduce((sum, g) => sum + (g.stat?.hits ?? 0), 0);
          const last7Abs = last7Games.reduce((sum, g) => sum + (g.stat?.atBats ?? 0), 0);

          const gp    = Number(seasonSplit?.gamesPlayed) || 0;
          const tbTot = Number(seasonSplit?.totalBases) || 0;
          return {
            group:     "hitting",
            games,
            seasonAvg: seasonSplit?.avg    ?? ".000",
            last7Avg:  last7Abs > 0 ? `${(last7Hits / last7Abs).toFixed(3).replace(/^0/, "")}` : ".000",
            // Season-level stats used by batter stat boxes in the Lineup tab
            avg:    seasonSplit?.avg      ?? ".000",
            ops:    seasonSplit?.ops      ?? ".000",
            slg:    seasonSplit?.sluggingPercentage ?? ".000",
            hr:     seasonSplit?.homeRuns ?? 0,
            avgTB:  gp > 0 ? (tbTot / gp).toFixed(1) : "—",
            // Batting hand from person data — lineup API sometimes misses batSide
            hand:   person?.batSide?.code ?? null,
            // Last-5 hit indicator (1 = got a hit, 0 = hitless) for the dot row
            hitRate: games.slice(0, 5).map(g => g.h > 0 ? 1 : 0),
          };
        })();

    // Write through to DB (best-effort — never block the response)
    if (db.isConnected()) {
      db.query(
        `INSERT INTO player_gamelog_snapshots (player_id, stat_group, slate_date, fetched_at, data)
         VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (player_id, stat_group, slate_date) DO UPDATE
           SET fetched_at = NOW(), data = $4`,
        [parseInt(playerId, 10), group, today, JSON.stringify(result)]
      ).catch(err => console.warn(`gamelog DB write failed for ${playerId}:`, err.message));
    }

    cache.set(cacheKey, result, GAMELOG_TTL_MS);
    res.setHeader("X-Cache", "MISS");
    return res.json(result);
  } catch (err) {
    return res.status(502).json({ error: "MLB API unavailable", detail: err.message });
  }
});

// ── GET /api/players/:batterId/rbi-context ──
// Returns career RBI context for batter props.
router.get("/:batterId/rbi-context", async (req, res) => {
  const { batterId } = req.params;
  const cacheKey = `rbiCtx:${batterId}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    const { data } = await mlb.get(`/people/${batterId}/stats`, {
      params: {
        stats: "career",
        group: "hitting",
      },
    });

    const stat = data?.stats?.[0]?.splits?.[0]?.stat;
    if (!stat) {
      const empty = emptyRbiContext();
      cache.set(cacheKey, empty, RBI_CTX_TTL_MS);
      res.setHeader("X-Cache", "MISS");
      return res.json(empty);
    }

    const careerRbi = Number(stat.rbi) || 0;
    const careerGames = Number(stat.gamesPlayed) || 0;
    const careerPa = Number(stat.plateAppearances) || 0;
    const doubles = Number(stat.doubles) || 0;
    const triples = Number(stat.triples) || 0;
    const homeRuns = Number(stat.homeRuns) || 0;

    const result = {
      rbiPerGame: careerGames > 0 ? Number((careerRbi / careerGames).toFixed(3)) : 0,
      rbiRate: careerPa > 0 ? Number((careerRbi / careerPa).toFixed(3)) : 0,
      slg: stat.slg ?? ".000",
      extraBaseHits: doubles + triples + homeRuns,
    };

    cache.set(cacheKey, result, RBI_CTX_TTL_MS);
    res.setHeader("X-Cache", "MISS");
    return res.json(result);
  } catch (err) {
    console.warn("RBI context route failed; returning empty fallback:", err.message);
    const empty = emptyRbiContext();
    cache.set(cacheKey, empty, RBI_CTX_TTL_MS);
    res.setHeader("X-Cache", "MISS");
    return res.json(empty);
  }
});

// ── GET /api/players/:batterId/vs/:pitcherId ──
// Returns normalized career batter-vs-pitcher head-to-head data.
router.get("/:batterId/vs/:pitcherId", async (req, res) => {
  const { batterId, pitcherId } = req.params;
  const cacheKey = `h2h:${batterId}:${pitcherId}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    const { data } = await mlb.get(`/people/${batterId}/stats`, {
      params: {
        stats: "vsPlayer",
        opposingPlayerId: pitcherId,
        group: "hitting",
      },
    });

    const splits = data?.stats?.[0]?.splits;
    if (!splits || splits.length === 0) {
      const empty = { atBats: 0 };
      cache.set(cacheKey, empty, H2H_TTL_MS);
      res.setHeader("X-Cache", "MISS");
      return res.json(empty);
    }

    const s = splits[0]?.stat ?? {};
    if ((s.atBats ?? 0) === 0) {
      const empty = { atBats: 0 };
      cache.set(cacheKey, empty, H2H_TTL_MS);
      res.setHeader("X-Cache", "MISS");
      return res.json(empty);
    }

    const result = {
      batterId,
      pitcherId,
      atBats: s.atBats ?? 0,
      hits: s.hits ?? 0,
      avg: s.avg ?? ".000",
      homeRuns: s.homeRuns ?? 0,
      strikeOuts: s.strikeOuts ?? 0,
      obp: s.obp ?? ".000",
      slg: s.slg ?? ".000",
      season: "career",
    };

    cache.set(cacheKey, result, H2H_TTL_MS);
    res.setHeader("X-Cache", "MISS");
    return res.json(result);
  } catch (err) {
    console.warn("Career H2H route failed; returning empty fallback:", err.message);
    return res.json({ atBats: 0 });
  }
});

module.exports = router;
