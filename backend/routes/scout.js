const express = require("express");
const axios = require("axios");
const OpenAI = require("openai");
const mlb = require("../services/mlbApi");
const requireAuth = require("../middleware/auth");
const { query, isConnected } = require("../services/db");

const router = express.Router();

const MAX_GENERATIONS_PER_DAY = 3;
const FINAL_STATUSES = new Set(["Final", "Game Over", "Postponed", "Cancelled", "Suspended"]);
const SEASON = new Date().getFullYear();

const SCOUT_ALLOWLIST = (process.env.AI_PICKS_ALLOWLIST ?? "leadoffkaiba")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

const STADIUMS = {
  "Citizens Bank Park":    { lat: 39.9061, lon: -75.1665, orientation: 60, roof: false },
  "Dodger Stadium":        { lat: 34.0739, lon: -118.24, orientation: 25, roof: false },
  "Globe Life Field":      { lat: 32.7473, lon: -97.0832, orientation: 0, roof: true },
  "American Family Field": { lat: 43.028, lon: -87.9712, orientation: 5, roof: true },
  "Oracle Park":           { lat: 37.7786, lon: -122.3893, orientation: 55, roof: false },
  "Rogers Centre":         { lat: 43.6414, lon: -79.3894, orientation: 10, roof: true },
  "Yankee Stadium":        { lat: 40.8296, lon: -73.9262, orientation: 30, roof: false },
  "Fenway Park":           { lat: 42.3467, lon: -71.0972, orientation: 90, roof: false },
  "Wrigley Field":         { lat: 41.9484, lon: -87.6553, orientation: 30, roof: false },
  "Busch Stadium":         { lat: 38.6226, lon: -90.1928, orientation: 10, roof: false },
  "T-Mobile Park":         { lat: 47.5914, lon: -122.3325, orientation: 5, roof: true },
  "Camden Yards":          { lat: 39.2838, lon: -76.6218, orientation: 5, roof: false },
  "Petco Park":            { lat: 32.7076, lon: -117.157, orientation: 35, roof: false },
  "Truist Park":           { lat: 33.8907, lon: -84.4677, orientation: 20, roof: false },
  "Great American Ball Park": { lat: 39.0979, lon: -84.5082, orientation: 10, roof: false },
  "loanDepot park":        { lat: 25.7781, lon: -80.2197, orientation: 5, roof: true },
  "Minute Maid Park":      { lat: 29.7572, lon: -95.3555, orientation: 30, roof: true },
  "Tropicana Field":       { lat: 27.7683, lon: -82.6534, orientation: 0, roof: true },
  "Chase Field":           { lat: 33.4453, lon: -112.0667, orientation: 25, roof: true },
  "Coors Field":           { lat: 39.7559, lon: -104.9942, orientation: 20, roof: false },
  "PNC Park":              { lat: 40.4469, lon: -80.0057, orientation: 35, roof: false },
  "Target Field":          { lat: 44.9817, lon: -93.2778, orientation: 5, roof: false },
  "Kauffman Stadium":      { lat: 39.0517, lon: -94.4803, orientation: 15, roof: false },
  "Progressive Field":     { lat: 41.4962, lon: -81.6852, orientation: 5, roof: false },
  "Comerica Park":         { lat: 42.339, lon: -83.0485, orientation: 5, roof: false },
  "Guaranteed Rate Field": { lat: 41.8299, lon: -87.6338, orientation: 5, roof: false },
  "Angel Stadium":         { lat: 33.8003, lon: -117.8827, orientation: 25, roof: false },
  "Oakland Coliseum":      { lat: 37.7516, lon: -122.2005, orientation: 10, roof: false },
  "Sutter Health Park":    { lat: 38.5762, lon: -121.5029, orientation: 15, roof: false },
  "Nationals Park":        { lat: 38.873, lon: -77.0074, orientation: 5, roof: false },
  "Citi Field":            { lat: 40.7571, lon: -73.8458, orientation: 5, roof: false },
};

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

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
    return iso ?? "";
  }
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

function ipStringToOuts(ipValue) {
  if (ipValue == null) return 0;
  const [wholeStr, fracStr = "0"] = String(ipValue).split(".");
  const whole = parseInt(wholeStr, 10) || 0;
  const frac = parseInt(fracStr, 10) || 0;
  return (whole * 3) + frac;
}

function ipStringToFloat(ipValue) {
  return ipStringToOuts(ipValue) / 3;
}

function fmtSignedOdds(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n > 0 ? `+${n}` : String(n);
}

function windDescription(windDeg, windSpd, stadiumOrientation) {
  if (windSpd == null) return "n/a";
  if (windSpd < 3) return `${Math.round(windSpd)} mph Calm`;
  const rel = ((windDeg - stadiumOrientation) + 360) % 360;
  let dir;
  if (rel >= 315 || rel < 45) dir = "OUT to CF";
  else if (rel >= 45 && rel < 135) dir = "OUT to RF";
  else if (rel >= 135 && rel < 225) dir = "IN from CF";
  else dir = "OUT to LF";
  return `${Math.round(windSpd)} mph ${dir}`;
}

function requireScoutAccess(req, res, next) {
  const identities = [
    req.user?.email,
    req.user?.username,
    req.email,
    req.username,
  ]
    .filter(Boolean)
    .map((entry) => String(entry).trim().toLowerCase());

  if (!identities.some((entry) => SCOUT_ALLOWLIST.includes(entry))) {
    return res.status(403).json({ error: "Access restricted" });
  }
  return next();
}

router.use(requireAuth, (req, _res, next) => {
  req.user = {
    email: req.email ?? null,
    username: req.username ?? null,
    userId: req.userId ?? null,
  };
  next();
}, requireScoutAccess);

async function fetchWeatherForGame(gameTime, stadiumName) {
  const stadium = STADIUMS[stadiumName];
  if (!stadium) return null;
  if (stadium.roof) return { roof: true, temp: null, speed: null, direction: null };

  const { data } = await axios.get("https://api.open-meteo.com/v1/forecast", {
    params: {
      latitude: stadium.lat,
      longitude: stadium.lon,
      hourly: "temperature_2m,wind_speed_10m,wind_direction_10m",
      forecast_days: 1,
    },
    timeout: 10000,
  });

  const times = data?.hourly?.time ?? [];
  const temps = data?.hourly?.temperature_2m ?? [];
  const speeds = data?.hourly?.wind_speed_10m ?? [];
  const directions = data?.hourly?.wind_direction_10m ?? [];
  if (!times.length) return null;

  const targetMs = Date.parse(gameTime);
  let bestIdx = 0;
  let bestDiff = Infinity;
  times.forEach((time, idx) => {
    const diff = Math.abs(Date.parse(time) - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = idx;
    }
  });

  return {
    roof: false,
    temp: temps[bestIdx] ?? null,
    speed: speeds[bestIdx] ?? null,
    degrees: directions[bestIdx] ?? null,
    direction: windDescription(directions[bestIdx] ?? 0, speeds[bestIdx] ?? 0, stadium.orientation),
  };
}

async function fetchPitcherProfile(pitcherId) {
  const seasonRes = await mlb.get(`/people/${pitcherId}/stats`, {
    params: {
      stats: "season",
      group: "pitching",
      season: SEASON,
    },
  });
  const seasonStat = seasonRes.data?.stats?.[0]?.splits?.[0]?.stat ?? {};
  const inningsPitched = ipStringToFloat(seasonStat.inningsPitched ?? 0);
  const strikeouts = Number(seasonStat.strikeOuts ?? 0);
  const walks = Number(seasonStat.baseOnBalls ?? 0);
  const gamesStarted = Number(seasonStat.gamesStarted ?? seasonStat.gamesPitched ?? 0);
  const avgIP = gamesStarted > 0 ? inningsPitched / gamesStarted : 0;
  const avgK = gamesStarted > 0 ? strikeouts / gamesStarted : 0;
  const k9 = inningsPitched > 0 ? (strikeouts / inningsPitched) * 9 : 0;
  const bb9 = inningsPitched > 0 ? (walks / inningsPitched) * 9 : 0;

  const gamelogRes = await mlb.get(`/people/${pitcherId}/stats`, {
    params: {
      stats: "gameLog",
      group: "pitching",
      season: SEASON,
      limit: 3,
    },
  });
  const recentGames = (gamelogRes.data?.stats?.[0]?.splits ?? []).slice(0, 3);
  const l3Count = recentGames.length || 1;
  const l3AvgK = recentGames.reduce((sum, g) => sum + Number(g.stat?.strikeOuts ?? 0), 0) / l3Count;
  const l3AvgIP = recentGames.reduce((sum, g) => sum + ipStringToFloat(g.stat?.inningsPitched ?? 0), 0) / l3Count;
  const l3AvgER = recentGames.reduce((sum, g) => sum + Number(g.stat?.earnedRuns ?? 0), 0) / l3Count;

  return {
    era: Number.parseFloat(seasonStat.era ?? 0) || 0,
    whip: Number.parseFloat(seasonStat.whip ?? 0) || 0,
    k9,
    bb9,
    avgIP,
    avgK,
    l3AvgK,
    l3AvgIP,
    l3AvgER,
    hand: seasonStat.pitchHand?.code ?? null,
  };
}

function getPitcherLine(propsPayload, pitcherName, market) {
  const props = Array.isArray(propsPayload?.props) ? propsPayload.props : [];
  const lastName = normalizeName(pitcherName).split(" ").pop();
  const match = props.find((prop) =>
    prop.market === market &&
    normalizeName(prop.player ?? "").includes(lastName)
  );
  if (!match) return null;
  const dk = match.books?.DK ?? null;
  if (!dk?.line) return null;
  return {
    line: Number(dk.line),
    overOdds: dk.overOdds ?? null,
    underOdds: dk.underOdds ?? null,
  };
}

function getGameTotalLine(rawOdds) {
  const bookmakers = rawOdds?.bookmakers ?? [];
  const dk = bookmakers.find((book) => book.key === "draftkings") ?? bookmakers[0] ?? null;
  if (!dk) return null;
  const totals = dk.markets?.find((m) => m.key === "totals");
  if (!totals) return null;
  const over = totals.outcomes?.find((o) => o.name === "Over");
  const under = totals.outcomes?.find((o) => o.name === "Under");
  if (!over?.point) return null;
  return {
    line: Number(over.point),
    overOdds: fmtSignedOdds(over.price),
    underOdds: fmtSignedOdds(under?.price),
    openLine: Number(over.point),
    moveDir: "flat",
  };
}

function buildMatchupSummary(lineups, pitcherHand) {
  const hitters = Array.isArray(lineups) ? lineups : [];
  const rhb = hitters.filter((b) => (b.hand ?? "").toUpperCase() === "R").length;
  const lhb = hitters.filter((b) => (b.hand ?? "").toUpperCase() === "L").length;
  const sameHandCount = hitters.filter((b) => (b.hand ?? "").toUpperCase() === String(pitcherHand ?? "R").toUpperCase()).length;
  const matchupScore = Math.max(0, Math.min(100, 50 + ((sameHandCount - (hitters.length / 2)) * 8)));
  const edge = matchupScore >= 60 ? "pitcher edge" : matchupScore <= 40 ? "batter edge" : "neutral";
  return { rhb, lhb, matchupScore, edge };
}

function getIlFlags(injuries, teamAbbr) {
  return (injuries ?? [])
    .filter((entry) => String(entry.team ?? "").includes(teamAbbr))
    .slice(0, 3)
    .map((entry) => entry.playerName ?? entry.player ?? "")
    .filter(Boolean);
}

function safeJsonParse(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, ""));
}

async function generateScoutPicks(date, generationsUsed) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  if (!isConnected()) throw new Error("DATABASE_URL not configured");

  const scheduleRes = await query(
    "SELECT games FROM schedule_snapshots WHERE slate_date = $1",
    [date]
  );
  const allGames = scheduleRes?.rows?.[0]?.games ?? [];
  const games = allGames
    .filter((game) => game?.probablePitchers?.away?.id && game?.probablePitchers?.home?.id)
    .slice(0, 8);

  if (!games.length) {
    return {
      picks: [],
      generatedAt: new Date().toISOString(),
      generationsUsedToday: generationsUsed,
      maxGenerationsPerDay: MAX_GENERATIONS_PER_DAY,
      slateDate: date,
    };
  }

  const gamePks = games.map((game) => Number(game.gamePk));
  const gameKeys = games.map((game) => `${game.away?.name}|${game.home?.name}`);

  const [propsRows, oddsRows, umpRows, injuriesRow] = await Promise.all([
    query(
      "SELECT game_pk, props, reason FROM player_props_snapshots WHERE snapshot_date = $1 AND game_pk = ANY($2)",
      [date, gamePks]
    ),
    query(
      "SELECT game_key, odds FROM odds_snapshots WHERE slate_date = $1 AND game_key = ANY($2)",
      [date, gameKeys]
    ),
    query(
      "SELECT game_pk, data FROM umpire_snapshots WHERE game_pk = ANY($1)",
      [gamePks]
    ),
    query(
      "SELECT injuries FROM injury_snapshots WHERE snapshot_date = $1",
      [date]
    ),
  ]);

  const propsByGamePk = new Map((propsRows?.rows ?? []).map((row) => [Number(row.game_pk), { props: row.props ?? [], reason: row.reason ?? "ok" }]));
  const oddsByGameKey = new Map((oddsRows?.rows ?? []).map((row) => [row.game_key, row.odds]));
  const umpByGamePk = new Map((umpRows?.rows ?? []).map((row) => [Number(row.game_pk), row.data]));
  const injuries = injuriesRow?.rows?.[0]?.injuries ?? [];

  const profileCache = new Map();
  const lineupCache = new Map();

  async function getPitcherProfileCached(pitcherId) {
    if (!profileCache.has(pitcherId)) {
      profileCache.set(pitcherId, fetchPitcherProfile(pitcherId));
    }
    return profileCache.get(pitcherId);
  }

  async function getLineups(gamePk) {
    if (!lineupCache.has(gamePk)) {
      lineupCache.set(
        gamePk,
        axios.get(`http://localhost:${process.env.PORT ?? 3001}/api/lineups/${gamePk}`, { timeout: 10000 })
          .then((res) => res.data)
          .catch(() => ({ confirmed: false, away: [], home: [] }))
      );
    }
    return lineupCache.get(gamePk);
  }

  const serializedGames = [];

  for (const game of games) {
    const propsPayload = propsByGamePk.get(Number(game.gamePk)) ?? { props: [], reason: "no_props" };
    const oddsPayload = oddsByGameKey.get(`${game.away?.name}|${game.home?.name}`) ?? null;
    const umpPayload = umpByGamePk.get(Number(game.gamePk)) ?? null;
    const weather = await fetchWeatherForGame(game.gameTime, game.stadium).catch(() => null);
    const lineups = await getLineups(game.gamePk);

    const homePitcher = game.probablePitchers.home;
    const awayPitcher = game.probablePitchers.away;
    const [homeProfile, awayProfile] = await Promise.all([
      getPitcherProfileCached(homePitcher.id),
      getPitcherProfileCached(awayPitcher.id),
    ]);

    const homeKLine = getPitcherLine(propsPayload, homePitcher.name, "pitcher_strikeouts");
    const homeOutsLine = getPitcherLine(propsPayload, homePitcher.name, "pitcher_outs");
    const awayKLine = getPitcherLine(propsPayload, awayPitcher.name, "pitcher_strikeouts");
    const awayOutsLine = getPitcherLine(propsPayload, awayPitcher.name, "pitcher_outs");
    const totalLine = getGameTotalLine(oddsPayload);
    const hpStats = umpPayload?.homePlate?.stats ?? {};
    const umpName = umpPayload?.homePlate?.name ?? "TBD";
    const umpDelta = hpStats.k_rate_delta ?? hpStats.kRateDelta ?? hpStats.weightedScore ?? null;

    const homeMatchup = buildMatchupSummary(lineups.away, homePitcher.hand);
    const awayMatchup = buildMatchupSummary(lineups.home, awayPitcher.hand);
    const homeIlFlags = getIlFlags(injuries, game.away?.abbr);
    const awayIlFlags = getIlFlags(injuries, game.home?.abbr);
    const weatherLine = weather?.roof
      ? "Roof closed"
      : weather
        ? `${Math.round(weather.temp ?? 0)}°F, wind ${Math.round(weather.speed ?? 0)}mph ${weather.direction ?? "n/a"}`
        : "Weather unavailable";

    serializedGames.push(
      [
        `PITCHER: ${homePitcher.name} (${game.home?.abbr}) vs ${game.away?.abbr}  ${formatGameTime(game.gameTime)}`,
        `ERA: ${homeProfile.era.toFixed(2)} | K/9: ${homeProfile.k9.toFixed(1)} | WHIP: ${homeProfile.whip.toFixed(2)} | BB/9: ${homeProfile.bb9.toFixed(1)} | avgIP: ${homeProfile.avgIP.toFixed(1)}`,
        `L3 avg K: ${homeProfile.l3AvgK.toFixed(1)} | L3 avg IP: ${homeProfile.l3AvgIP.toFixed(1)} | L3 avg ER: ${homeProfile.l3AvgER.toFixed(1)}`,
        homeKLine || homeOutsLine
          ? `DK K line: ${homeKLine ? `${homeKLine.line} (${homeKLine.overOdds ?? "—"} over)` : "none"} | DK Outs line: ${homeOutsLine ? `${homeOutsLine.line} (${homeOutsLine.overOdds ?? "—"} over)` : "none"}`
          : "DK lines: none posted",
        `Umpire: ${umpName} | K/9 delta: ${umpDelta ?? "n/a"} (${umpDelta > 0 ? "favors Ks" : umpDelta < 0 ? "suppresses Ks" : "neutral"})`,
        `Weather: ${weatherLine} | Stadium: ${game.stadium}`,
        `Matchup score: ${homeMatchup.matchupScore} (${homeMatchup.edge}) | RHB: ${homeMatchup.rhb} LHB: ${homeMatchup.lhb} vs ${homePitcher.hand ?? "?"}HP`,
        `IL flags: ${homeIlFlags.length ? homeIlFlags.join(", ") : "none"}`,
        "",
        `PITCHER: ${awayPitcher.name} (${game.away?.abbr}) vs ${game.home?.abbr}  ${formatGameTime(game.gameTime)}`,
        `ERA: ${awayProfile.era.toFixed(2)} | K/9: ${awayProfile.k9.toFixed(1)} | WHIP: ${awayProfile.whip.toFixed(2)} | BB/9: ${awayProfile.bb9.toFixed(1)} | avgIP: ${awayProfile.avgIP.toFixed(1)}`,
        `L3 avg K: ${awayProfile.l3AvgK.toFixed(1)} | L3 avg IP: ${awayProfile.l3AvgIP.toFixed(1)} | L3 avg ER: ${awayProfile.l3AvgER.toFixed(1)}`,
        awayKLine || awayOutsLine
          ? `DK K line: ${awayKLine ? `${awayKLine.line} (${awayKLine.overOdds ?? "—"} over)` : "none"} | DK Outs line: ${awayOutsLine ? `${awayOutsLine.line} (${awayOutsLine.overOdds ?? "—"} over)` : "none"}`
          : "DK lines: none posted",
        `Umpire: ${umpName} | K/9 delta: ${umpDelta ?? "n/a"} (${umpDelta > 0 ? "favors Ks" : umpDelta < 0 ? "suppresses Ks" : "neutral"})`,
        `Weather: ${weatherLine} | Stadium: ${game.stadium}`,
        `Matchup score: ${awayMatchup.matchupScore} (${awayMatchup.edge}) | RHB: ${awayMatchup.rhb} LHB: ${awayMatchup.lhb} vs ${awayPitcher.hand ?? "?"}HP`,
        `IL flags: ${awayIlFlags.length ? awayIlFlags.join(", ") : "none"}`,
        "",
        totalLine
          ? `GAME TOTAL: ${game.away?.abbr} @ ${game.home?.abbr}  ${formatGameTime(game.gameTime)}\nAway SP: ${awayPitcher.name} ERA ${awayProfile.era.toFixed(2)} | WHIP ${awayProfile.whip.toFixed(2)} | L3 avg ER ${awayProfile.l3AvgER.toFixed(1)}\nHome SP: ${homePitcher.name} ERA ${homeProfile.era.toFixed(2)} | WHIP ${homeProfile.whip.toFixed(2)} | L3 avg ER ${homeProfile.l3AvgER.toFixed(1)}\nDK Total: ${totalLine.line} (${totalLine.overOdds ?? "—"} over / ${totalLine.underOdds ?? "—"} under) | Opened: ${totalLine.openLine} (${totalLine.moveDir})\nWeather: ${weatherLine} | Park runs factor: neutral`
          : null,
      ].filter(Boolean).join("\n")
    );
  }

  const systemPrompt = `You are The Scout — a sharp professional sports bettor with 15 years of experience beating closing lines. You are data-obsessed, value-focused, and direct. You only recommend a prop when at least two independent signals point the same direction. You always cite specific numbers. You speak in first person, present tense. Each reasoning is 2–4 sentences max. Be selective — quality over quantity. Only make picks you genuinely believe in.`;

  const userPrompt = `Today's slate data is below. Make your best picks for K props, Outs props, and Game Totals.
Only pick markets where DK has posted a line (skip any with no line data).
Aim for 4–8 picks total. Confidence HIGH = multiple strong signals; MEDIUM = solid but one open question.
Return valid JSON only — no other text.

${serializedGames.join("\n\n")}

Return format:
{
  "picks": [
    {
      "player": "Gerrit Cole",
      "team": "NYY",
      "opponent": "BOS",
      "gameTime": "7:10 PM ET",
      "market": "pitcher_strikeouts",
      "marketLabel": "K",
      "line": 7.5,
      "lean": "OVER",
      "odds": "-115",
      "book": "DK",
      "confidence": "HIGH",
      "reasoning": "...",
      "signals": ["K/9 11.2", "L3 avg K 8.3", "Ump K/9 +2.1", "Pitcher edge matchup"]
    }
  ]
}

For game totals: player = null, team = away team abbr, marketLabel = "Total", signals include both SPs' stats and weather.`;

  const completion = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.4,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const payload = safeJsonParse(completion.choices?.[0]?.message?.content);
  const picks = Array.isArray(payload.picks) ? payload.picks : [];
  const enriched = picks.map((pick) => {
    const matchedGame = games.find((game) =>
      [game.away?.abbr, game.home?.abbr].includes(pick.team) &&
      [game.away?.abbr, game.home?.abbr].includes(pick.opponent)
    );
    return {
      ...pick,
      gamePk: matchedGame?.gamePk ?? null,
    };
  });

  await query(
    `INSERT INTO scout_picks_snapshots (slate_date, picks, generated_at, generations_used)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (slate_date) DO UPDATE
     SET picks = $2, generated_at = NOW(), generations_used = $3`,
    [date, JSON.stringify(enriched), generationsUsed]
  );

  console.log(`  ✓ scout picks generated  date=${date}  picks=${enriched.length}  gen=${generationsUsed}/${MAX_GENERATIONS_PER_DAY}`);

  return {
    picks: enriched,
    generatedAt: new Date().toISOString(),
    generationsUsedToday: generationsUsed,
    maxGenerationsPerDay: MAX_GENERATIONS_PER_DAY,
    slateDate: date,
  };
}

router.get("/picks", async (_req, res) => {
  const date = todayHonolulu();

  try {
    if (isConnected()) {
      const existing = await query(
        `SELECT picks, generated_at, generations_used
         FROM scout_picks_snapshots
         WHERE slate_date = $1`,
        [date]
      );
      const row = existing?.rows?.[0];
      if (row) {
        return res.json({
          picks: row.picks ?? [],
          generatedAt: row.generated_at,
          generationsUsedToday: row.generations_used ?? 1,
          maxGenerationsPerDay: MAX_GENERATIONS_PER_DAY,
          slateDate: date,
        });
      }
    }

    const result = await generateScoutPicks(date, 1);
    return res.json(result);
  } catch (err) {
    console.error(`  ✗ scout picks failed: ${err.message}`);
    return res.status(502).json({ error: "Scout unavailable", detail: err.message });
  }
});

router.post("/regenerate", async (_req, res) => {
  const date = todayHonolulu();

  try {
    let generationsUsed = 0;
    if (isConnected()) {
      const existing = await query(
        `SELECT generations_used
         FROM scout_picks_snapshots
         WHERE slate_date = $1`,
        [date]
      );
      generationsUsed = Number(existing?.rows?.[0]?.generations_used ?? 0);
    }

    if (generationsUsed >= MAX_GENERATIONS_PER_DAY) {
      return res.status(429).json({ error: "Daily limit reached", generationsUsedToday: generationsUsed });
    }

    const result = await generateScoutPicks(date, generationsUsed + 1);
    return res.json(result);
  } catch (err) {
    console.error(`  ✗ scout regenerate failed: ${err.message}`);
    return res.status(502).json({ error: "Scout unavailable", detail: err.message });
  }
});

router.get("/evaluation/:date", async (req, res) => {
  const { date } = req.params;

  try {
    if (!isConnected()) return res.json({ evaluated: false });

    const result = await query(
      `SELECT evaluations, day_review, improvement_flags, evaluated_at
       FROM scout_evaluations
       WHERE slate_date = $1`,
      [date]
    );
    const row = result?.rows?.[0];
    if (!row) return res.json({ evaluated: false });

    return res.json({
      evaluated: true,
      evaluations: row.evaluations ?? [],
      dayReview: row.day_review ?? "",
      improvementFlags: row.improvement_flags ?? [],
      evaluatedAt: row.evaluated_at,
    });
  } catch (err) {
    console.error(`  ✗ scout evaluation read failed: ${err.message}`);
    return res.status(502).json({ error: "Scout evaluation unavailable", detail: err.message });
  }
});

module.exports = router;
