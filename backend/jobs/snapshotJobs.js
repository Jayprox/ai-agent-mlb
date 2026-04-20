const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const axios = require("axios");
const mlb = require("../services/mlbApi");
const { query } = require("../services/db");

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
      `INSERT INTO slate_snapshots (slate_date, fetched_at, games)
       VALUES ($1, NOW(), $2)
       ON CONFLICT (slate_date) DO UPDATE SET fetched_at = NOW(), games = $2`,
      [date, JSON.stringify(games)]
    );
    console.log(`  ✓ snapshotSlate  date=${date}  games=${games.length}`);
  } catch (err) {
    console.error(`  ✗ snapshotSlate failed: ${err.message}`);
  }
}

async function snapshotOdds(date = todayHonolulu()) {
  const key = process.env.ODDS_API_KEY;
  if (!key) { console.warn("  ⚠ snapshotOdds: ODDS_API_KEY not set"); return; }
  console.log(`  → Job: snapshotOdds  date=${date}`);
  try {
    const res = await axios.get("https://api.the-odds-api.com/v4/sports/baseball_mlb/odds", {
      params: { apiKey: key, regions: "us", markets: "h2h,totals,spreads", oddsFormat: "american" },
      timeout: 12000,
    });
    const games = res.data ?? [];
    for (const g of games) {
      const gameKey = `${g.away_team}|${g.home_team}`;
      await query(
        `INSERT INTO odds_snapshots (game_key, slate_date, fetched_at, odds)
         VALUES ($1, $2, NOW(), $3)
         ON CONFLICT (game_key, slate_date) DO UPDATE SET fetched_at = NOW(), odds = $3`,
        [gameKey, date, JSON.stringify(g)]
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

module.exports = { snapshotSlate, snapshotOdds, snapshotBullpen, snapshotLinescore, snapshotUmpires, todayHonolulu };
