const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const axios = require("axios");
const mlb = require("../services/mlbApi");
const { query, isConnected } = require("../services/db");

const SEASON = new Date().getFullYear();
const UMPIRES_DATA_PATH = path.join(__dirname, "..", "data", "umpires.json");

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

function normalizeName(name = "") {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function ensurePhaseOneTables() {
  if (!isConnected()) return;
  await query(`
    CREATE TABLE IF NOT EXISTS schedule_snapshots (
      slate_date  DATE PRIMARY KEY,
      fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      games       JSONB NOT NULL
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS injury_snapshots (
      snapshot_date DATE PRIMARY KEY,
      fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      injuries      JSONB NOT NULL
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS odds_snapshots (
      game_key   TEXT NOT NULL,
      slate_date DATE NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      odds       JSONB NOT NULL,
      PRIMARY KEY (game_key, slate_date)
    )
  `);
  await query(`ALTER TABLE odds_snapshots ADD COLUMN IF NOT EXISTS opening_total NUMERIC`);
  await query(`
    CREATE TABLE IF NOT EXISTS player_props_snapshots (
      game_pk       INTEGER NOT NULL,
      snapshot_date DATE NOT NULL,
      fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      props         JSONB NOT NULL,
      reason        TEXT NOT NULL DEFAULT 'ok',
      PRIMARY KEY (game_pk, snapshot_date)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS scout_picks_snapshots (
      slate_date DATE PRIMARY KEY,
      picks JSONB NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      generations_used INTEGER NOT NULL DEFAULT 1
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS scout_evaluations (
      slate_date DATE PRIMARY KEY,
      evaluations JSONB NOT NULL,
      day_review TEXT NOT NULL,
      improvement_flags JSONB NOT NULL DEFAULT '[]',
      evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS player_gamelog_snapshots (
      player_id   INTEGER      NOT NULL,
      stat_group  TEXT         NOT NULL,
      slate_date  DATE         NOT NULL,
      fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      data        JSONB        NOT NULL,
      PRIMARY KEY (player_id, stat_group, slate_date)
    )
  `);
}

function formatGameTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    }) + " ET";
  } catch {
    return iso;
  }
}

function transformPitcher(p, abbr) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.fullName,
    team: abbr,
    number: p.primaryNumber ?? "?",
    hand: p.pitchHand?.code ?? "?",
  };
}

async function enrichPitchers(games) {
  const pitcherIds = [
    ...new Set(
      games
        .flatMap((g) => [g.probablePitchers.away?.id, g.probablePitchers.home?.id])
        .filter(Boolean)
    ),
  ];

  if (!pitcherIds.length) return games;

  try {
    const { data: peopleData } = await mlb.get("/people", {
      params: { personIds: pitcherIds.join(",") },
    });
    const peopleMap = {};
    (peopleData.people ?? []).forEach((p) => { peopleMap[p.id] = p; });

    games.forEach((g) => {
      ["away", "home"].forEach((side) => {
        const pitcher = g.probablePitchers[side];
        if (pitcher && peopleMap[pitcher.id]) {
          pitcher.number = peopleMap[pitcher.id].primaryNumber ?? "?";
          pitcher.hand = peopleMap[pitcher.id].pitchHand?.code ?? "?";
        }
      });
    });
  } catch (err) {
    console.warn("Pitcher enrichment failed:", err.message);
  }

  return games;
}

async function buildScheduleSnapshot(date) {
  const { data } = await mlb.get("/schedule", {
    params: {
      sportId: 1,
      date,
      hydrate: "probablePitcher,linescore,team,venue",
    },
  });

  const games = data.dates?.[0]?.games ?? [];
  const transformed = games.map((g) => {
    const away = g.teams.away;
    const home = g.teams.home;
    const awayAbbr = TEAM_ABBR[away.team.id] ?? away.team.abbreviation ?? "???";
    const homeAbbr = TEAM_ABBR[home.team.id] ?? home.team.abbreviation ?? "???";

    return {
      gamePk: g.gamePk,
      id: g.gamePk,
      status: g.status.detailedState,
      time: formatGameTime(g.gameDate),
      gameTime: g.gameDate,
      stadium: g.venue.name,
      away: {
        id: away.team.id,
        name: away.team.name,
        abbr: awayAbbr,
      },
      home: {
        id: home.team.id,
        name: home.team.name,
        abbr: homeAbbr,
      },
      probablePitchers: {
        away: transformPitcher(away.probablePitcher, awayAbbr),
        home: transformPitcher(home.probablePitcher, homeAbbr),
      },
    };
  });

  return enrichPitchers(transformed);
}

function normalizeName(name = "") {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getUmpireStatsByName(name) {
  try {
    const raw = fs.readFileSync(UMPIRES_DATA_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const byName = parsed?.umpiresByName ?? {};
    return byName[name] ?? byName[Object.keys(byName).find((key) => normalizeName(key) === normalizeName(name))] ?? null;
  } catch {
    return null;
  }
}

async function snapshotSlate(date = todayHonolulu()) {
  console.log(`  → Job: snapshotSlate  date=${date}`);
  try {
    const games = await buildScheduleSnapshot(date);
    await query(
      `INSERT INTO schedule_snapshots (slate_date, fetched_at, games)
       VALUES ($1, NOW(), $2)
       ON CONFLICT (slate_date) DO UPDATE SET fetched_at = NOW(), games = $2`,
      [date, JSON.stringify(games)]
    );
    console.log(`  ✓ snapshotSlate  date=${date}  games=${games.length}`);
  } catch (err) {
    console.error(`  ✗ snapshotSlate failed: ${err.message}`);
  }
}

async function pollSchedule(date = todayHonolulu()) {
  if (!isConnected()) return;
  console.log(`  → Job: pollSchedule  date=${date}`);
  try {
    await ensurePhaseOneTables();
    const { buildSchedulePayloadForJob } = require("../routes/schedule");
    const games = await buildSchedulePayloadForJob(date);
    await query(
      `INSERT INTO schedule_snapshots (slate_date, fetched_at, games)
       VALUES ($1, NOW(), $2)
       ON CONFLICT (slate_date) DO UPDATE SET fetched_at = NOW(), games = $2`,
      [date, JSON.stringify(games)]
    );
    console.log(`  ✓ pollSchedule  date=${date}  games=${games.length}`);
  } catch (err) {
    console.error(`  ✗ pollSchedule failed: ${err.message}`);
  }
}

async function pollInjuries(date = todayHonolulu()) {
  if (!isConnected()) return;
  console.log(`  → Job: pollInjuries  date=${date}`);
  try {
    await ensurePhaseOneTables();
    const { buildInjuriesPayloadForJob } = require("../routes/injuries");
    const result = await buildInjuriesPayloadForJob();
    await query(
      `INSERT INTO injury_snapshots (snapshot_date, fetched_at, injuries)
       VALUES ($1, NOW(), $2)
       ON CONFLICT (snapshot_date) DO UPDATE SET fetched_at = NOW(), injuries = $2`,
      [date, JSON.stringify(result)]
    );
    console.log(`  ✓ pollInjuries  date=${date}  injuries=${result.injuries?.length ?? 0}`);
  } catch (err) {
    console.error(`  ✗ pollInjuries failed: ${err.message}`);
  }
}

async function snapshotOdds(date = todayHonolulu()) {
  const key = process.env.ODDS_API_KEY;
  if (!key) { console.warn("  ⚠ snapshotOdds: ODDS_API_KEY not set"); return; }
  console.log(`  → Job: snapshotOdds  date=${date}`);
  try {
    await ensurePhaseOneTables();
    const res = await axios.get("https://api.the-odds-api.com/v4/sports/baseball_mlb/odds", {
      params: { apiKey: key, regions: "us", markets: "h2h,totals,spreads", oddsFormat: "american" },
      timeout: 12000,
    });
    const games = res.data ?? [];
    for (const g of games) {
      const gameKey = `${g.away_team}|${g.home_team}`;
      const dkBk = g.bookmakers?.find(b => b.key === "draftkings") ?? g.bookmakers?.[0];
      const currentTotal = dkBk?.markets?.find(m => m.key === "totals")
        ?.outcomes?.find(o => o.name === "Over")?.point ?? null;
      const currentTotalNum = currentTotal != null ? Number(currentTotal) : null;
      await query(
        `INSERT INTO odds_snapshots (game_key, slate_date, fetched_at, odds, opening_total)
         VALUES ($1, $2, NOW(), $3, $4)
         ON CONFLICT (game_key, slate_date) DO UPDATE
           SET fetched_at = NOW(),
               odds = EXCLUDED.odds,
               opening_total = COALESCE(odds_snapshots.opening_total, EXCLUDED.opening_total)`,
        [gameKey, date, JSON.stringify(g), currentTotalNum]
      );
    }
    console.log(`  ✓ snapshotOdds  date=${date}  games=${games.length}  remaining=${res.headers["x-requests-remaining"] ?? "?"}`);
  } catch (err) {
    console.error(`  ✗ snapshotOdds failed: ${err.message}`);
  }
}

async function snapshotBullpen(gamePk) {
  console.log(`  → Job: snapshotBullpen  gamePk=${gamePk}`);
  try {
    const { buildGameBullpenForJob } = require("../routes/bullpen");
    const data = await buildGameBullpenForJob(gamePk);
    await query(
      `INSERT INTO bullpen_snapshots (game_pk, fetched_at, data)
       VALUES ($1, NOW(), $2)
       ON CONFLICT (game_pk) DO UPDATE SET fetched_at = NOW(), data = $2`,
      [gamePk, JSON.stringify(data)]
    );
    console.log(`  ✓ snapshotBullpen  gamePk=${gamePk}`);
  } catch (err) {
    console.error(`  ✗ snapshotBullpen ${gamePk} failed: ${err.message}`);
  }
}

async function snapshotLinescore(gamePk) {
  try {
    const { data } = await mlb.get(`/game/${gamePk}/linescore`);
    const innings = data.innings ?? [];
    const inning1 = innings[0] ?? null;
    const payload = {
      gamePk: Number(gamePk),
      inning: data.currentInning ?? null,
      halfInning: data.inningHalf?.toLowerCase() ?? null,
      awayScore: data.teams?.away?.runs ?? 0,
      homeScore: data.teams?.home?.runs ?? 0,
      outs: data.outs ?? 0,
      firstInning: inning1 ? { away: inning1.away?.runs ?? null, home: inning1.home?.runs ?? null } : null,
    };
    await query(
      `INSERT INTO linescore_snapshots (game_pk, fetched_at, data)
       VALUES ($1, NOW(), $2)
       ON CONFLICT (game_pk) DO UPDATE SET fetched_at = NOW(), data = $2`,
      [gamePk, JSON.stringify(payload)]
    );
  } catch (err) {
    // Linescore unavailable pre-game — silent, not an error
  }
}

async function snapshotUmpires(gamePk) {
  console.log(`  → Job: snapshotUmpires  gamePk=${gamePk}`);
  try {
    const { data } = await mlb.get(`/game/${gamePk}/boxscore`);
    const officials = data.officials ?? [];
    const hp = officials.find((o) => o.officialType === "Home Plate");
    const payload = {
      gamePk: Number(gamePk),
      homePlate: hp ? {
        id: hp.official.id,
        name: hp.official.fullName,
        stats: getUmpireStatsByName(hp.official.fullName),
      } : null,
      all: officials.map((o) => ({ id: o.official.id, name: o.official.fullName, position: o.officialType })),
    };
    await query(
      `INSERT INTO umpire_snapshots (game_pk, fetched_at, data)
       VALUES ($1, NOW(), $2)
       ON CONFLICT (game_pk) DO UPDATE SET fetched_at = NOW(), data = $2`,
      [gamePk, JSON.stringify(payload)]
    );
    console.log(`  ✓ snapshotUmpires  gamePk=${gamePk}  hp=${hp?.official?.fullName ?? "TBD"}`);
  } catch (err) {
    console.error(`  ✗ snapshotUmpires ${gamePk} failed: ${err.message}`);
  }
}

async function pollPlayerProps(date = todayHonolulu()) {
  if (!isConnected()) return;
  console.log(`  → Job: pollPlayerProps  date=${date}`);
  await ensurePhaseOneTables();
  const result = await query(
    "SELECT games FROM schedule_snapshots WHERE slate_date = $1",
    [date]
  );
  const games = result?.rows?.[0]?.games ?? [];
  const active = games.filter(g => {
    const s = g.status ?? "";
    const msToFirstPitch = Date.parse(g.gameTime) - Date.now();
    const tooEarly = Number.isFinite(msToFirstPitch) && msToFirstPitch > 30 * 60 * 1000;
    return !["Final", "Game Over", "Postponed", "Cancelled", "Suspended"].includes(s) && !tooEarly;
  });
  console.log(`  · pollPlayerProps  active=${active.length}/${games.length}`);
  for (const game of active) {
    try {
      const { buildPlayerPropsPayloadForJob } = require("../routes/playerProps");
      const { props, reason } = await buildPlayerPropsPayloadForJob(game.gamePk);
      await query(
        `INSERT INTO player_props_snapshots (game_pk, snapshot_date, fetched_at, props, reason)
         VALUES ($1, $2, NOW(), $3, $4)
         ON CONFLICT (game_pk, snapshot_date) DO UPDATE SET fetched_at = NOW(), props = $3, reason = $4`,
        [game.gamePk, date, JSON.stringify(props), reason]
      );
      console.log(`  ✓ pollPlayerProps  gamePk=${game.gamePk}  count=${props.length}  reason=${reason}`);
    } catch (err) {
      console.error(`  ✗ pollPlayerProps ${game.gamePk} failed: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 800));
  }
}

async function snapshotPitcherGamelogs(date = todayHonolulu()) {
  if (!isConnected()) return;
  console.log(`  → Job: snapshotPitcherGamelogs  date=${date}`);
  await ensurePhaseOneTables();

  // Get today's probable pitchers from the schedule snapshot
  const result = await query(
    "SELECT games FROM schedule_snapshots WHERE slate_date = $1",
    [date]
  );
  const games = result?.rows?.[0]?.games ?? [];

  const pitcherIds = [
    ...new Set(
      games
        .flatMap(g => [
          g.probablePitchers?.away?.id,
          g.probablePitchers?.home?.id,
        ])
        .filter(Boolean)
    ),
  ];

  if (!pitcherIds.length) {
    console.log(`  · snapshotPitcherGamelogs: no pitchers found for ${date}`);
    return;
  }

  console.log(`  · snapshotPitcherGamelogs: fetching ${pitcherIds.length} pitchers`);

  const TEAM_ABBR_LOCAL = {
    108: "LAA", 109: "ARI", 110: "BAL", 111: "BOS", 112: "CHC",
    113: "CIN", 114: "CLE", 115: "COL", 116: "DET", 117: "HOU",
    118: "KC",  119: "LAD", 120: "WSH", 121: "NYM", 133: "OAK",
    134: "PIT", 135: "SD",  136: "SEA", 137: "SF",  138: "STL",
    139: "TB",  140: "TEX", 141: "TOR", 142: "MIN", 143: "PHI",
    144: "ATL", 145: "CWS", 146: "MIA", 147: "NYY", 158: "MIL",
  };

  let fetched = 0;
  let skipped = 0;

  for (const pitcherId of pitcherIds) {
    // Skip if already snapshotted today
    try {
      const existing = await query(
        `SELECT 1 FROM player_gamelog_snapshots
         WHERE player_id = $1 AND stat_group = 'pitching' AND slate_date = $2`,
        [pitcherId, date]
      );
      if (existing?.rows?.length) {
        skipped++;
        continue;
      }
    } catch (err) {
      console.warn(`  ⚠ snapshotPitcherGamelogs: DB check failed for ${pitcherId}:`, err.message);
    }

    try {
      const season = SEASON;
      const { data: statsData } = await mlb.get(`/people/${pitcherId}/stats`, {
        params: { stats: "gameLog", group: "pitching", season },
      });
      let splits = statsData.stats?.[0]?.splits ?? [];

      if (!splits.length) {
        const { data: prevData } = await mlb.get(`/people/${pitcherId}/stats`, {
          params: { stats: "gameLog", group: "pitching", season: season - 1 },
        });
        splits = prevData.stats?.[0]?.splits ?? [];
      }

      const { data: personData } = await mlb.get(`/people/${pitcherId}/stats`, {
        params: { stats: "season", group: "pitching", season },
      });
      const seasonSplit = personData.stats?.[0]?.splits?.[0]?.stat ?? {};

      const sorted = [...splits].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
      const starts = sorted
        .filter(g => (g.stat?.gamesStarted ?? 0) > 0)
        .slice(0, 5);
      const gameRows = starts.map(g => ({
        date:     g.date,
        opponent: TEAM_ABBR_LOCAL[g.opponent?.id] ?? g.opponent?.name ?? "?",
        ip:       g.stat?.inningsPitched ?? "0.0",
        k:        g.stat?.strikeOuts ?? 0,
        er:       g.stat?.earnedRuns ?? 0,
        pc:       g.stat?.numberOfPitches ?? null,
        era:      g.stat?.era ?? "0.00",
        result:   (g.stat?.wins ?? 0) > 0 ? "W" : (g.stat?.losses ?? 0) > 0 ? "L" : "ND",
      }));

      const totalOuts = gameRows.reduce((sum, g) => sum + ipStringToOuts(g.ip), 0);
      const avgIPOuts  = gameRows.length > 0 ? totalOuts / gameRows.length : 0;
      const avgIPWhole  = Math.floor(avgIPOuts / 3);
      const avgIPThirds = Math.round(avgIPOuts % 3);
      const avgIP = gameRows.length > 0 ? `${avgIPWhole}.${avgIPThirds}` : "—";

      const payload = {
        group: "pitching",
        games: gameRows,
        avgIP,
        seasonEra: seasonSplit?.era ?? "0.00",
      };

      await query(
        `INSERT INTO player_gamelog_snapshots (player_id, stat_group, slate_date, fetched_at, data)
         VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (player_id, stat_group, slate_date) DO UPDATE
           SET fetched_at = NOW(), data = $4`,
        [pitcherId, "pitching", date, JSON.stringify(payload)]
      );

      fetched++;
    } catch (err) {
      console.warn(`  ⚠ snapshotPitcherGamelogs: fetch failed for ${pitcherId}:`, err.message);
    }

    // 600ms spacing — respectful of MLB API rate limits
    await new Promise(r => setTimeout(r, 600));
  }

  console.log(`  ✓ snapshotPitcherGamelogs  date=${date}  fetched=${fetched}  skipped=${skipped}`);
}

async function snapshotBatterGamelogs(date = todayHonolulu()) {
  if (!isConnected()) return;
  console.log(`  → Job: snapshotBatterGamelogs  date=${date}`);
  await ensurePhaseOneTables();

  const TEAM_ABBR_LOCAL = {
    108: "LAA", 109: "ARI", 110: "BAL", 111: "BOS", 112: "CHC",
    113: "CIN", 114: "CLE", 115: "COL", 116: "DET", 117: "HOU",
    118: "KC",  119: "LAD", 120: "WSH", 121: "NYM", 133: "OAK",
    134: "PIT", 135: "SD",  136: "SEA", 137: "SF",  138: "STL",
    139: "TB",  140: "TEX", 141: "TOR", 142: "MIN", 143: "PHI",
    144: "ATL", 145: "CWS", 146: "MIA", 147: "NYY", 158: "MIL",
  };

  // Get today's games from schedule snapshot
  const result = await query(
    "SELECT games FROM schedule_snapshots WHERE slate_date = $1",
    [date]
  );
  const games = result?.rows?.[0]?.games ?? [];

  if (!games.length) {
    console.log(`  · snapshotBatterGamelogs: no games found for ${date}`);
    return;
  }

  // Collect unique batter IDs from confirmed lineups or active rosters
  const batterIds = [];
  const seen = new Set();

  for (const game of games) {
    try {
      const { data } = await mlb.get(`/game/${game.gamePk}/boxscore`, {
        params: { hydrate: "person" },
      });

      const awayBatters = data?.teams?.away?.battingOrder ?? [];
      const homeBatters = data?.teams?.home?.battingOrder ?? [];
      const confirmed = awayBatters.length > 0 && homeBatters.length > 0;

      let ids = [];
      if (confirmed) {
        ids = [...awayBatters, ...homeBatters];
      } else {
        const awayTeamId = data?.teams?.away?.team?.id;
        const homeTeamId = data?.teams?.home?.team?.id;
        if (awayTeamId && homeTeamId) {
          try {
            const [awayRes, homeRes] = await Promise.all([
              mlb.get(`/teams/${awayTeamId}/roster`, {
                params: { rosterType: "active", season: SEASON, hydrate: "person" },
              }),
              mlb.get(`/teams/${homeTeamId}/roster`, {
                params: { rosterType: "active", season: SEASON, hydrate: "person" },
              }),
            ]);
            const nonPitcher = (roster) =>
              (roster.data.roster ?? [])
                .filter(p => p.position?.type !== "Pitcher" && p.status?.code === "A")
                .map(p => p.person.id);
            ids = [...nonPitcher(awayRes), ...nonPitcher(homeRes)];
          } catch (rosterErr) {
            console.warn(`  ⚠ snapshotBatterGamelogs: roster fallback failed for ${game.gamePk}:`, rosterErr.message);
          }
        }
      }

      for (const id of ids) {
        if (!seen.has(id)) {
          seen.add(id);
          batterIds.push(id);
        }
      }
    } catch (boxErr) {
      console.warn(`  ⚠ snapshotBatterGamelogs: boxscore failed for ${game.gamePk}:`, boxErr.message);
    }
  }

  if (!batterIds.length) {
    console.log(`  · snapshotBatterGamelogs: no batters found for ${date}`);
    return;
  }

  console.log(`  · snapshotBatterGamelogs: fetching ${batterIds.length} batters`);

  let fetched = 0;
  let skipped = 0;

  for (const batterId of batterIds) {
    // Idempotent — skip if already snapshotted today
    try {
      const existing = await query(
        `SELECT 1 FROM player_gamelog_snapshots
         WHERE player_id = $1 AND stat_group = 'hitting' AND slate_date = $2`,
        [batterId, date]
      );
      if (existing?.rows?.length) {
        skipped++;
        continue;
      }
    } catch (err) {
      console.warn(`  ⚠ snapshotBatterGamelogs: DB check failed for ${batterId}:`, err.message);
    }

    try {
      let season = SEASON;

      // Gamelog — fall back to prior season if empty
      const { data: glData } = await mlb.get(`/people/${batterId}/stats`, {
        params: { stats: "gameLog", group: "hitting", season },
      });
      let splits = glData.stats?.[0]?.splits ?? [];

      if (!splits.length) {
        const { data: prevGl } = await mlb.get(`/people/${batterId}/stats`, {
          params: { stats: "gameLog", group: "hitting", season: season - 1 },
        });
        splits = prevGl.stats?.[0]?.splits ?? [];
        season -= 1;
      }

      // Person info + season stats in parallel
      const [personRes, seasonRes] = await Promise.all([
        mlb.get(`/people/${batterId}`, { params: { hydrate: "currentTeam" } }),
        mlb.get(`/people/${batterId}/stats`, {
          params: { stats: "season", group: "hitting", season: SEASON },
        }),
      ]);
      const person = personRes.data.people?.[0] ?? null;
      const seasonSplit = seasonRes.data.stats?.[0]?.splits?.[0]?.stat ?? {};

      // Build payload — must match the hitting path in backend/routes/players.js exactly
      const sorted = [...splits].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
      const gameRows = sorted.slice(0, 10).map(g => ({
        date:     g.date,
        opponent: TEAM_ABBR_LOCAL[g.opponent?.id] ?? g.opponent?.name ?? "?",
        ab:       g.stat?.atBats   ?? 0,
        h:        g.stat?.hits     ?? 0,
        hr:       g.stat?.homeRuns ?? 0,
        rbi:      g.stat?.rbi      ?? 0,
        avg:      g.stat?.avg      ?? ".000",
      }));

      const last7 = sorted.filter(g => (g.stat?.atBats ?? 0) > 0).slice(0, 7);
      const last7Hits = last7.reduce((sum, g) => sum + (g.stat?.hits ?? 0), 0);
      const last7Abs  = last7.reduce((sum, g) => sum + (g.stat?.atBats ?? 0), 0);
      const gp    = Number(seasonSplit?.gamesPlayed) || 0;
      const tbTot = Number(seasonSplit?.totalBases)  || 0;

      const payload = {
        group:     "hitting",
        games:     gameRows,
        seasonAvg: seasonSplit?.avg ?? ".000",
        last7Avg:  last7Abs > 0
          ? `${(last7Hits / last7Abs).toFixed(3).replace(/^0/, "")}`
          : ".000",
        avg:    seasonSplit?.avg                ?? ".000",
        ops:    seasonSplit?.ops                ?? ".000",
        slg:    seasonSplit?.sluggingPercentage  ?? ".000",
        hr:     seasonSplit?.homeRuns            ?? 0,
        avgTB:  gp > 0 ? (tbTot / gp).toFixed(1) : "—",
        hand:   person?.batSide?.code            ?? null,
        hitRate: gameRows.slice(0, 5).map(g => g.h > 0 ? 1 : 0),
      };

      await query(
        `INSERT INTO player_gamelog_snapshots (player_id, stat_group, slate_date, fetched_at, data)
         VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (player_id, stat_group, slate_date) DO UPDATE
           SET fetched_at = NOW(), data = $4`,
        [batterId, "hitting", date, JSON.stringify(payload)]
      );

      fetched++;
    } catch (err) {
      console.warn(`  ⚠ snapshotBatterGamelogs: fetch failed for ${batterId}:`, err.message);
    }

    // 600ms pacing — respectful of MLB API rate limits
    await new Promise(r => setTimeout(r, 600));
  }

  console.log(`  ✓ snapshotBatterGamelogs  date=${date}  fetched=${fetched}  skipped=${skipped}`);
}

function ipStringToOuts(ipValue) {
  if (ipValue == null) return 0;
  const [wholeStr, fracStr = "0"] = String(ipValue).split(".");
  const whole = parseInt(wholeStr, 10) || 0;
  const frac = parseInt(fracStr, 10) || 0;
  return (whole * 3) + frac;
}

async function runScoutEvaluation(date = todayHonolulu()) {
  if (!isConnected()) return;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { console.warn("  ⚠ runScoutEvaluation: OPENAI_API_KEY not set"); return; }

  const existing = await query(
    "SELECT slate_date FROM scout_evaluations WHERE slate_date = $1",
    [date]
  );
  if (existing?.rows?.length) {
    console.log(`  · runScoutEvaluation: already evaluated for ${date}`);
    return;
  }

  const picksRow = await query(
    "SELECT picks FROM scout_picks_snapshots WHERE slate_date = $1",
    [date]
  );
  const picks = picksRow?.rows?.[0]?.picks;
  if (!picks?.length) {
    console.log(`  · runScoutEvaluation: no picks for ${date}`);
    return;
  }

  const schedRow = await query(
    "SELECT games FROM schedule_snapshots WHERE slate_date = $1",
    [date]
  );
  const games = schedRow?.rows?.[0]?.games ?? [];
  const allFinal = games.length > 0 && games.every((game) => {
    const status = game.status ?? "";
    return ["Final", "Game Over", "Postponed", "Cancelled", "Suspended"].includes(status);
  });
  if (!allFinal) {
    console.log(`  · runScoutEvaluation: games not all final yet for ${date}`);
    return;
  }

  const resultsByGamePk = {};
  for (const game of games) {
    try {
      const { data } = await mlb.get(`/game/${game.gamePk}/boxscore`);
      const awayPitchers = data.teams?.away?.pitchers ?? [];
      const homePitchers = data.teams?.home?.pitchers ?? [];
      const allPitcherIds = [...awayPitchers, ...homePitchers];
      const pitcherStats = {};

      for (const pitcherId of allPitcherIds) {
        const player = data.teams?.away?.players?.[`ID${pitcherId}`] ?? data.teams?.home?.players?.[`ID${pitcherId}`];
        if (!player) continue;
        const stats = player.stats?.pitching ?? {};
        const name = player.person?.fullName ?? "";
        pitcherStats[name.toLowerCase()] = {
          name,
          strikeouts: Number(stats.strikeOuts ?? 0),
          outs: ipStringToOuts(stats.inningsPitched ?? 0),
          ip: Number(stats.inningsPitched ?? 0),
          earnedRuns: Number(stats.earnedRuns ?? 0),
        };
      }

      const awayScore = Number(data.teams?.away?.teamStats?.batting?.runs ?? data.teams?.away?.teamStats?.pitching?.runs ?? 0);
      const homeScore = Number(data.teams?.home?.teamStats?.batting?.runs ?? data.teams?.home?.teamStats?.pitching?.runs ?? 0);

      resultsByGamePk[game.gamePk] = {
        awayScore,
        homeScore,
        totalRuns: awayScore + homeScore,
        pitchers: pitcherStats,
      };
    } catch (err) {
      console.warn(`  ⚠ runScoutEvaluation: boxscore failed for ${game.gamePk}: ${err.message}`);
    }
  }

  const picksWithResults = picks.map((pick) => {
    const game = games.find((g) =>
      Number(g.gamePk) === Number(pick.gamePk) ||
      (
        [g.away?.abbr, g.home?.abbr].includes(pick.team) &&
        [g.away?.abbr, g.home?.abbr].includes(pick.opponent)
      )
    );
    const result = game ? resultsByGamePk[game.gamePk] : null;
    let actualValue = null;
    let hit = null;

    if (result) {
      if (pick.market === "pitcher_strikeouts") {
        const pitcherStats = Object.values(result.pitchers).find((entry) =>
          normalizeName(entry.name).includes(normalizeName(pick.player ?? ""))
        );
        actualValue = pitcherStats?.strikeouts ?? null;
      } else if (pick.market === "pitcher_outs") {
        const pitcherStats = Object.values(result.pitchers).find((entry) =>
          normalizeName(entry.name).includes(normalizeName(pick.player ?? ""))
        );
        actualValue = pitcherStats?.outs ?? null;
      } else if (pick.market === "game_total") {
        actualValue = result.totalRuns;
      }

      if (actualValue != null) {
        hit = pick.lean === "OVER" ? actualValue > pick.line : actualValue < pick.line;
      }
    }

    return { ...pick, actualValue, hit };
  });

  const picksText = picksWithResults.map((pick, idx) => {
    const resultStr = pick.hit == null
      ? "RESULT UNKNOWN"
      : pick.hit
        ? `HIT (actual: ${pick.actualValue})`
        : `MISS (actual: ${pick.actualValue}, line was ${pick.line})`;
    return `Pick ${idx + 1}: ${pick.marketLabel} ${pick.lean} ${pick.line} — ${pick.player ?? `${pick.team} vs ${pick.opponent}`}
Original reasoning: "${pick.reasoning}"
Signals: ${pick.signals?.join(", ")}
Result: ${resultStr}`;
  }).join("\n\n");

  const evalMessages = [
    {
      role: "system",
      content: `You are The Scout reviewing your own picks. For each pick you have the original reasoning and actual result. Evaluate decision quality honestly — not just outcome. Classify each as: SOUND_HIT (data-backed, result followed logically), LUCKY_HIT (correct result, weak or coincidental reasoning), VARIANCE_MISS (sound reasoning, bad day / acceptable variance), or ADDRESSABLE_MISS (data gap, wrong signal, app limitation — be specific). For ADDRESSABLE_MISS, identify exactly what information was missing or what the app should improve. Return valid JSON only.`,
    },
    {
      role: "user",
      content: `Today's picks and results:\n\n${picksText}\n\nReturn format:\n{\n  "evaluations": [\n    {\n      "pickIndex": 0,\n      "result": "HIT",\n      "actualValue": 8,\n      "category": "SOUND_HIT",\n      "scoutReview": "My read was right...",\n      "improvementFlag": null\n    }\n  ],\n  "dayReview": "Overall...",\n  "improvementFlags": ["flag 1"]\n}`,
    },
  ];

  const OpenAI = require("openai");
  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: evalMessages,
    response_format: { type: "json_object" },
    temperature: 0.4,
  });

  const evalData = JSON.parse(response.choices?.[0]?.message?.content ?? "{}");

  await query(
    `INSERT INTO scout_evaluations (slate_date, evaluations, day_review, improvement_flags, evaluated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (slate_date) DO UPDATE
     SET evaluations = $2, day_review = $3, improvement_flags = $4, evaluated_at = NOW()`,
    [
      date,
      JSON.stringify(evalData.evaluations ?? []),
      evalData.dayReview ?? "",
      JSON.stringify(evalData.improvementFlags ?? []),
    ]
  );

  console.log(`  ✓ runScoutEvaluation  date=${date}  picks=${picks.length}  flags=${(evalData.improvementFlags ?? []).length}`);
}

module.exports = {
  snapshotSlate,
  snapshotOdds,
  snapshotBullpen,
  snapshotLinescore,
  snapshotUmpires,
  pollSchedule,
  pollInjuries,
  pollPlayerProps,
  snapshotPitcherGamelogs,
  snapshotBatterGamelogs,
  runScoutEvaluation,
  todayHonolulu,
};
