/**
 * Daily AI Snapshot Job
 *
 * Runs once per day (10 AM HST) and again at pregame (~95 min before first pitch).
 * Builds the full board enrichment server-side, scores candidates with Haiku,
 * pre-generates card summaries, and persists everything to Postgres.
 *
 * After this runs:
 *   • GET  /api/ai-board/edges     → returns today's pre-scored candidates (no Anthropic call)
 *   • POST /api/card-summary       → hits DB cache on every card (no Anthropic call)
 *
 * All clients (web + iOS) see the same summaries for the entire day.
 */

const axios      = require("axios");
const Anthropic  = require("@anthropic-ai/sdk");
const cache      = require("../services/cache");
const db         = require("../services/db");
const { buildSchedulePayloadForJob } = require("../routes/schedule");
const { getNrfiForGame }             = require("../routes/nrfi");
const { getOddsMap }                 = require("../routes/odds");
const { dbCardKey, todayHonolulu: todayHonoluluKey } = require("../lib/cardSummaryKeys");

// ── Helpers ────────────────────────────────────────────────────────────────

function todayHonolulu() {
  return todayHonoluluKey();
}

let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

function safeJsonParse(text) {
  const raw = String(text ?? "").trim()
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(raw); } catch { return null; }
}

const BASE_URL = () => `http://localhost:${process.env.PORT ?? 3001}`;

async function internalGet(path) {
  try {
    const res = await axios.get(`${BASE_URL()}${path}`, { timeout: 12000 });
    return res.data;
  } catch {
    return null;
  }
}

async function internalPost(path, body) {
  try {
    const res = await axios.post(`${BASE_URL()}${path}`, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 20000,
    });
    return res.data;
  } catch {
    return null;
  }
}

// ── Weather (inlined from slateBundle) ────────────────────────────────────

const WEATHER_TTL_MS = 60 * 60 * 1000;
const STADIUMS_GEO = {
  "Citizens Bank Park":        { lat: 39.9061,  lon: -75.1665,  tz: "America/New_York",   roof: false },
  "Dodger Stadium":            { lat: 34.0739,  lon: -118.2400, tz: "America/Los_Angeles", roof: false },
  "Globe Life Field":          { lat: 32.7473,  lon: -97.0832,  tz: "America/Chicago",     roof: true  },
  "American Family Field":     { lat: 43.0280,  lon: -87.9712,  tz: "America/Chicago",     roof: false },
  "Oracle Park":               { lat: 37.7786,  lon: -122.3893, tz: "America/Los_Angeles", roof: false },
  "Rogers Centre":             { lat: 43.6414,  lon: -79.3894,  tz: "America/Toronto",     roof: true  },
  "Yankee Stadium":            { lat: 40.8296,  lon: -73.9262,  tz: "America/New_York",    roof: false },
  "Fenway Park":               { lat: 42.3467,  lon: -71.0972,  tz: "America/New_York",    roof: false },
  "Wrigley Field":             { lat: 41.9484,  lon: -87.6553,  tz: "America/Chicago",     roof: false },
  "Busch Stadium":             { lat: 38.6226,  lon: -90.1928,  tz: "America/Chicago",     roof: false },
  "T-Mobile Park":             { lat: 47.5914,  lon: -122.3325, tz: "America/Los_Angeles", roof: false },
  "Camden Yards":              { lat: 39.2838,  lon: -76.6218,  tz: "America/New_York",    roof: false },
  "Petco Park":                { lat: 32.7076,  lon: -117.1570, tz: "America/Los_Angeles", roof: false },
  "Truist Park":               { lat: 33.8907,  lon: -84.4677,  tz: "America/New_York",    roof: false },
  "Great American Ball Park":  { lat: 39.0979,  lon: -84.5082,  tz: "America/New_York",    roof: false },
  "loanDepot park":            { lat: 25.7781,  lon: -80.2197,  tz: "America/New_York",    roof: true  },
  "Minute Maid Park":          { lat: 29.7572,  lon: -95.3555,  tz: "America/Chicago",     roof: true  },
  "Tropicana Field":           { lat: 27.7683,  lon: -82.6534,  tz: "America/New_York",    roof: true  },
  "Chase Field":               { lat: 33.4453,  lon: -112.0667, tz: "America/Phoenix",     roof: true  },
  "Coors Field":               { lat: 39.7559,  lon: -104.9942, tz: "America/Denver",      roof: false },
  "PNC Park":                  { lat: 40.4469,  lon: -80.0057,  tz: "America/New_York",    roof: false },
  "Target Field":              { lat: 44.9817,  lon: -93.2778,  tz: "America/Chicago",     roof: false },
  "Kauffman Stadium":          { lat: 39.0517,  lon: -94.4803,  tz: "America/Chicago",     roof: false },
  "Progressive Field":         { lat: 41.4962,  lon: -81.6852,  tz: "America/New_York",    roof: false },
  "Comerica Park":             { lat: 42.3390,  lon: -83.0485,  tz: "America/New_York",    roof: false },
  "Guaranteed Rate Field":     { lat: 41.8299,  lon: -87.6338,  tz: "America/Chicago",     roof: false },
  "Angel Stadium":             { lat: 33.8003,  lon: -117.8827, tz: "America/Los_Angeles", roof: false },
  "Nationals Park":            { lat: 38.8730,  lon: -77.0074,  tz: "America/New_York",    roof: false },
  "Citi Field":                { lat: 40.7571,  lon: -73.8458,  tz: "America/New_York",    roof: false },
};

const WMO_CODES = {
  0: "Clear", 1: "Mainly Clear", 2: "Partly Cloudy", 3: "Overcast",
  45: "Foggy", 48: "Icy Fog", 51: "Light Drizzle", 53: "Drizzle",
  55: "Heavy Drizzle", 61: "Light Rain", 63: "Rain", 65: "Heavy Rain",
  71: "Light Snow", 73: "Snow", 75: "Heavy Snow", 80: "Rain Showers",
  81: "Rain Showers", 82: "Violent Rain", 95: "Thunderstorm", 99: "Thunderstorm",
};

function stadiumHour(gameTimeIso, tz) {
  try {
    return parseInt(
      new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz })
        .format(new Date(gameTimeIso)), 10
    );
  } catch { return 19; }
}

function isHrFavorable(direction, speed, orientation) {
  if (speed < 8) return false;
  const relative = ((direction - (orientation ?? 180)) + 360) % 360;
  return relative >= 225 && relative <= 315; // blowing out toward CF/RF/LF arc
}

async function buildWeatherMap(schedule) {
  const weatherMap = {};
  const fetches = [];
  for (const game of schedule) {
    const sd = STADIUMS_GEO[game.stadium];
    if (!sd) continue;
    if (sd.roof) { weatherMap[game.gamePk] = { condition: "Dome", hrFavorable: false, roof: true }; continue; }
    const cacheKey = `weather:${game.stadium}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      weatherMap[game.gamePk] = {
        ...cached,
        condition: WMO_CODES[cached.weathercode] ?? "Unknown",
        hrFavorable: isHrFavorable(cached.winddirection, cached.windspeed, sd.orientation ?? 180),
      };
      continue;
    }
    const hour = game.gameTime ? stadiumHour(game.gameTime, sd.tz) : 19;
    const url = [
      `https://api.open-meteo.com/v1/forecast`,
      `?latitude=${sd.lat}&longitude=${sd.lon}`,
      `&hourly=temperature_2m,windspeed_10m,winddirection_10m,weathercode,precipitation_probability,relativehumidity_2m`,
      `&wind_speed_unit=mph&temperature_unit=fahrenheit`,
      `&timezone=${encodeURIComponent(sd.tz)}&forecast_days=1`,
    ].join("");
    fetches.push(
      axios.get(url, { timeout: 8000 }).then(({ data }) => {
        const h = data.hourly;
        const idx = h.time.findIndex(t => new Date(t).getHours() === hour);
        const i = idx >= 0 ? idx : Math.min(hour, h.time.length - 1);
        const raw = {
          temp: Math.round(h.temperature_2m[i]),
          windspeed: h.windspeed_10m[i],
          winddirection: h.winddirection_10m[i],
          weathercode: h.weathercode[i],
          precipitation_probability: h.precipitation_probability[i],
          relativehumidity: h.relativehumidity_2m[i],
        };
        cache.set(cacheKey, raw, WEATHER_TTL_MS);
        weatherMap[game.gamePk] = {
          ...raw,
          condition: WMO_CODES[raw.weathercode] ?? "Unknown",
          hrFavorable: isHrFavorable(raw.winddirection, raw.windspeed, sd.orientation ?? 180),
        };
      }).catch(() => {})
    );
  }
  await Promise.allSettled(fetches);
  return weatherMap;
}

// ── DB helpers ─────────────────────────────────────────────────────────────

async function ensureEdgesTable() {
  if (!db.isConnected()) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS ai_board_edges (
      id           SERIAL PRIMARY KEY,
      slate_date   DATE        NOT NULL,
      edges        JSONB       NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_board_edges_date
      ON ai_board_edges(slate_date)
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS board_daily_snapshots (
      slate_date   DATE         NOT NULL,
      market       TEXT         NOT NULL,
      candidates   JSONB        NOT NULL,
      generated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      PRIMARY KEY  (slate_date, market)
    )
  `);
}

async function saveEdges(slateDate, edges) {
  if (!db.isConnected()) return false;
  try {
    await ensureEdgesTable();
    await db.query(
      `INSERT INTO ai_board_edges (slate_date, edges, generated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (slate_date) DO UPDATE SET edges = $2, generated_at = NOW()`,
      [slateDate, JSON.stringify(edges)]
    );
    return true;
  } catch (err) {
    console.warn("  ⚠ dailyAiSnapshot: saveEdges failed:", err.message);
    return false;
  }
}

async function saveBoardSnapshot(slateDate, market, candidatesWithSummaries) {
  if (!db.isConnected() || !candidatesWithSummaries.length) return false;
  try {
    await ensureEdgesTable();
    await db.query(
      `INSERT INTO board_daily_snapshots (slate_date, market, candidates, generated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (slate_date, market) DO UPDATE
         SET candidates = $3, generated_at = NOW()`,
      [slateDate, market, JSON.stringify(candidatesWithSummaries)]
    );
    return true;
  } catch (err) {
    console.warn(`  ⚠ dailyAiSnapshot: saveBoardSnapshot failed for ${market}: ${err.message}`);
    return false;
  }
}

// ── Card summary DB write (mirrors cardSummary.js logic) ──────────────────

async function saveCardSummaries(entries, slateDate) {
  // entries: [{ cardKey: string, summary: string }]
  if (!db.isConnected() || !entries.length) return;
  try {
    const values = entries.map((_, i) => {
      const b = i * 4;
      return `($${b+1}, $${b+2}, $${b+3}, $${b+4})`;
    }).join(", ");
    const params = entries.flatMap(({ cardKey, summary }) => [slateDate, cardKey, summary, false]);
    await db.query(
      `INSERT INTO card_summaries (slate_date, card_key, summary, is_premium)
       VALUES ${values}
       ON CONFLICT (slate_date, card_key, is_premium)
       DO UPDATE SET summary = EXCLUDED.summary, created_at = NOW()`,
      params
    );
    console.log(`  ✓ dailyAiSnapshot: saved ${entries.length} card summaries to DB`);
  } catch (err) {
    console.warn("  ⚠ dailyAiSnapshot: saveCardSummaries failed:", err.message);
  }
}

// ── AI scoring helpers ─────────────────────────────────────────────────────

const SCORE_MODEL = "claude-haiku-4-5-20251001";

const SUMMARY_SYSTEM =
  "You write one factual sentence per MLB betting card. " +
  "You MUST return one summary object for EVERY card — same count, same ids, no omissions. " +
  "Tone: high (≥75) → confident edge; mid (55–74) → balanced with main headwind; low (<55) → honest risk. " +
  "Cite at least two concrete numbers from the payload for high/mid tiers. " +
  "Always lead with the player name. Use signals[] and negatives[] for low tiers. " +
  "k = K/9 or avgK3 + oppKPct; outs = avgIP + whip; hits = split + ERA; hr = SLG + park/wind. " +
  "12–22 words each. No hype, no emojis. " +
  "Return strict JSON only: {\"summaries\":[{\"id\":\"...\",\"text\":\"...\"}]}";

const EDGE_SYSTEM =
  "You score MLB prop betting candidates 0–100. " +
  "75–100 = strong edge, 55–74 = moderate, 40–54 = neutral, <40 = weak. " +
  "Weight: algorithmic score 35%, simulation confidence 35%, stat quality 30%. " +
  "One factual reason per candidate, 12–22 words, lead with player name. " +
  "k = K/9 + oppK% + umpire/park; outs = avgIP + WHIP; " +
  "hits = split + pitcher ERA; hr = SLG + park/wind; f5ml = SP ERA + park/weather. " +
  "Return strict JSON only: {\"scores\":[{\"id\":\"...\",\"aiScore\":75,\"aiReason\":\"...\"}]}";

async function scoreWithAI(candidates) {
  if (!candidates.length) return {};
  const client = getAnthropic();
  const scored = {};
  const CHUNK = 12;
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const slice = candidates.slice(i, i + CHUNK);
    try {
      const msg = await client.messages.create({
        model: SCORE_MODEL,
        max_tokens: 2000,
        temperature: 0.15,
        system: EDGE_SYSTEM,
        messages: [{ role: "user", content: JSON.stringify({
          candidates: slice.map(c => ({
            id: c.id, market: c.market, playerName: c.name ?? c.playerName,
            team: c.team, gameLabel: c.gameLabel,
            score: c.score, simConfidence: c.simConfidence,
            bookLine: c.propLine?.books?.DK?.line ?? c.suggestedLine ?? null,
            stats: { era: c.era, k9: c.k9, whip: c.whip, avgIP: c.avgIP, avgK3: c.avgK3 },
          })),
        }) }],
      });
      const text = msg.content?.find(p => p.type === "text")?.text ?? "";
      const parsed = safeJsonParse(text);
      (parsed?.scores ?? []).forEach(s => {
        if (s?.id != null) scored[s.id] = { aiScore: Math.round(Number(s.aiScore ?? 50)), aiReason: String(s.aiReason ?? "").trim() };
      });
    } catch (err) {
      console.warn(`  ⚠ dailyAiSnapshot: scoreWithAI chunk failed: ${err.message}`);
    }
  }
  return scored;
}

async function generateCardSummaries(cards) {
  if (!cards.length) return {};
  const client = getAnthropic();
  const summaries = {};
  const CHUNK = 10;
  for (let i = 0; i < cards.length; i += CHUNK) {
    const slice = cards.slice(i, i + CHUNK);
    try {
      const msg = await client.messages.create({
        model: SCORE_MODEL,
        max_tokens: Math.min(4096, 100 + slice.length * 80),
        temperature: 0.2,
        system: SUMMARY_SYSTEM,
        messages: [{ role: "user", content: JSON.stringify({ cards: slice }) }],
      });
      const text = msg.content?.find(p => p.type === "text")?.text ?? "";
      const parsed = safeJsonParse(text);
      (parsed?.summaries ?? []).forEach(s => {
        if (s?.id != null) summaries[s.id] = String(s.text ?? "").trim();
      });
    } catch (err) {
      console.warn(`  ⚠ dailyAiSnapshot: generateCardSummaries chunk failed: ${err.message}`);
    }
  }
  return summaries;
}

// ── Main job ───────────────────────────────────────────────────────────────

async function generateDailyAiSnapshot(label = "scheduled") {
  const slateDate = todayHonolulu();
  console.log(`\n  → dailyAiSnapshot [${label}]  date=${slateDate}`);

  if (!db.isConnected()) {
    throw new Error("DATABASE_URL not set or PostgreSQL unavailable");
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  // ── 1. Schedule ──────────────────────────────────────────────────────────
  let schedule;
  try {
    schedule = await buildSchedulePayloadForJob(slateDate);
  } catch (err) {
    console.warn("  ⚠ dailyAiSnapshot: schedule fetch failed:", err.message);
    return;
  }
  const activeSlate = schedule.filter(g =>
    ["Scheduled", "Pre-Game", "Warmup", "In Progress"].includes(g.status)
  );
  if (!activeSlate.length) {
    console.log("  · dailyAiSnapshot: no active games, skipping");
    return;
  }
  console.log(`  · games=${activeSlate.length}`);

  // ── 2. Shared maps: odds, NRFI, weather ──────────────────────────────────
  const [oddsMap, ...nrfiArr] = await Promise.all([
    getOddsMap().catch(() => null),
    ...activeSlate.map(g => getNrfiForGame(g.gamePk).catch(() => null)),
  ]);
  const liveNrfiData = Object.fromEntries(activeSlate.map((g, i) => [g.gamePk, nrfiArr[i]]));
  const liveWeather  = await buildWeatherMap(activeSlate).catch(() => ({}));

  // ── 3. Per-game fan-out: lineups, umpires, player-props ──────────────────
  const liveLineups      = {};
  const liveUmpires      = {};
  const livePlayerProps  = {};
  await Promise.allSettled(activeSlate.map(async game => {
    const [lineups, umpires, props] = await Promise.all([
      internalGet(`/api/lineups/${game.gamePk}`),
      internalGet(`/api/umpires/${game.gamePk}`),
      internalGet(`/api/player-props/${game.gamePk}`),
    ]);
    if (lineups)  liveLineups[game.gamePk]     = lineups;
    if (umpires)  liveUmpires[game.gamePk]     = umpires;
    if (props)    livePlayerProps[String(game.gamePk)] = props;
  }));

  // ── 4. Team stats (keyed by abbr) ────────────────────────────────────────
  const liveTeamStats = {};
  const seenTeams = new Set();
  await Promise.allSettled(activeSlate.flatMap(game =>
    [{ id: game.home?.id, abbr: game.home?.abbr }, { id: game.away?.id, abbr: game.away?.abbr }]
      .filter(t => t.id && t.abbr && !seenTeams.has(t.abbr))
      .map(async t => {
        seenTeams.add(t.abbr);
        const data = await internalGet(`/api/team-stats/${t.id}`);
        if (data?.kPct != null) liveTeamStats[t.abbr] = data;
      })
  ));

  // ── 5. Per-pitcher: stats, gamelog, arsenal, stat-splits ─────────────────
  const livePitcherStats = {};
  const liveGameLog      = {};
  const pitcherArsenal   = {};
  const liveStatSplits   = {};

  const pitcherIds = [...new Set(
    activeSlate.flatMap(g => [g.probablePitchers?.home?.id, g.probablePitchers?.away?.id])
      .filter(Boolean)
  )];

  await Promise.allSettled(pitcherIds.map(async pid => {
    const [stats, gamelog, arsenal, splits] = await Promise.all([
      internalGet(`/api/players/${pid}/stats?group=pitching`),
      internalGet(`/api/players/${pid}/gamelog?group=pitching`),
      internalGet(`/api/arsenal/${pid}`),
      internalGet(`/api/stat-splits/${pid}?group=pitching`),
    ]);
    if (stats)   livePitcherStats[pid] = stats;
    if (gamelog) liveGameLog[pid]      = gamelog;
    if (arsenal?.pitcherStats) pitcherArsenal[pid] = { pitcherStats: arsenal.pitcherStats };
    if (splits)  liveStatSplits[`${pid}:pitching`] = splits;
  }));

  // ── 6. Batter gamelogs + stat-splits ────────────────────────────────────
  const liveHittingLog = {};
  const batterIds = [...new Set(
    Object.values(liveLineups)
      .flatMap(lu => [...(lu.home ?? []), ...(lu.away ?? [])])
      .slice(0, 120) // cap at ~8 games × 15 batters
      .map(b => b?.id).filter(Boolean)
  )];

  if (batterIds.length) {
    const batchData = await internalPost("/api/players/gamelogs/batch", {
      playerIds: batterIds,
      group: "hitting",
    });
    if (batchData && typeof batchData === "object") {
      Object.assign(liveHittingLog, batchData);
    }

    // Stat splits for top batters
    const topBatterIds = batterIds.slice(0, 60);
    await Promise.allSettled(topBatterIds.map(async bid => {
      const splits = await internalGet(`/api/stat-splits/${bid}?group=hitting`);
      if (splits) liveStatSplits[`${bid}:hitting`] = splits;
    }));
  }

  console.log(`  · pitchers=${pitcherIds.length}  batters=${batterIds.length}  teamStats=${Object.keys(liveTeamStats).length}`);

  // ── 7. Run board scoring ─────────────────────────────────────────────────
  let buildAiBoardPayload, computeGameBoard, computePitcherBoard, computeBatterBoard;
  try {
    const board = await import("../../src/board/index.js");
    buildAiBoardPayload = board.buildAiBoardPayload;
    computeGameBoard = board.computeGameBoard;
    computePitcherBoard = board.computePitcherBoard;
    computeBatterBoard = board.computeBatterBoard;
  } catch (err) {
    console.warn("  ⚠ dailyAiSnapshot: board import failed:", err.message);
    return;
  }

  const candidates = buildAiBoardPayload(
    activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats,
    liveLineups, liveWeather, liveHittingLog, liveStatSplits,
    liveNrfiData, oddsMap ?? {}, pitcherArsenal
  );

  // Also include game board candidates (totals, ML, spread, NRFI)
  const gameCandidates = [
    ...computeGameBoard("total",  activeSlate, liveNrfiData, liveWeather, oddsMap ?? {}, livePitcherStats, liveUmpires, liveLineups),
    ...computeGameBoard("nrfi",   activeSlate, liveNrfiData, liveWeather, oddsMap ?? {}, livePitcherStats, liveUmpires, liveLineups),
    ...computeGameBoard("ml",     activeSlate, liveNrfiData, liveWeather, oddsMap ?? {}, livePitcherStats, liveUmpires, liveLineups),
  ].slice(0, 12);
  const spreadCandidates = computeGameBoard("spread", activeSlate, liveNrfiData, liveWeather, oddsMap ?? {}, livePitcherStats, liveUmpires, liveLineups);
  const f5spreadCandidates = computeGameBoard("f5spread", activeSlate, liveNrfiData, liveWeather, oddsMap ?? {}, livePitcherStats, liveUmpires, liveLineups);
  const f5mlCandidates = computeGameBoard("f5ml", activeSlate, liveNrfiData, liveWeather, oddsMap ?? {}, livePitcherStats, liveUmpires, liveLineups);
  const kCandidates = computePitcherBoard("k", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal);
  const outsCandidates = computePitcherBoard("outs", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal);
  const hitsCandidates = computeBatterBoard("hits", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits);
  const hrCandidates = computeBatterBoard("hr", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits);

  const allCandidates = [...candidates, ...gameCandidates];
  if (!allCandidates.length) {
    console.log("  · dailyAiSnapshot: no candidates, skipping AI calls");
    return;
  }
  console.log(`  · candidates=${allCandidates.length}`);

  // ── 8. Score with Haiku ───────────────────────────────────────────────────
  const aiScores = await scoreWithAI(allCandidates);

  // Build merged edge list
  const edges = allCandidates.map(c => ({
    ...c,
    aiScore:  aiScores[c.id]?.aiScore  ?? Math.round((c.score ?? 50) * 0.6 + (c.simConfidence ?? 50) * 0.4),
    aiReason: aiScores[c.id]?.aiReason ?? null,
    bookLine: c.propLine?.books?.DK?.line ?? c.propLine?.books?.FD?.line ?? c.suggestedLine ?? null,
    bookOdds: c.propLine?.books?.DK?.overOdds ?? null,
  })).filter(c => (c.aiScore ?? 0) >= 55) // only meaningful edges
    .sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0));

  const edgesSaved = await saveEdges(slateDate, edges);
  if (edgesSaved) console.log(`  ✓ dailyAiSnapshot: saved ${edges.length} edges`);
  else console.warn(`  ⚠ dailyAiSnapshot: edges NOT persisted (${edges.length} computed in memory only)`);

  // ── 9. Pre-generate card summaries ───────────────────────────────────────
  // Cards above score threshold get AI summaries stored in card_summaries table.
  // When frontend calls POST /api/card-summary, it hits DB cache and skips AI.
  const summaryCards = allCandidates
    .filter(c => (c.score ?? 0) >= 70)
    .slice(0, 40)
    .map(c => ({
      id:        c.id,
      market:    c.market,
      lean:      c.lean ?? (c.score >= 70 ? "OVER" : "UNDER"),
      score:     c.score,
      scoreTier: (c.score ?? 0) >= 75 ? "high" : (c.score ?? 0) >= 55 ? "mid" : "low",
      name:      c.name ?? c.playerName ?? null,
      hand:      c.hand ?? null,
      facingTeam: c.facingTeam ?? null,
      avgK3:     c.avgK3 ?? null,
      avgIP:     c.avgIP ?? null,
      era:       c.era ?? null,
      whip:      c.whip ?? null,
      oppKPct:   c.oppKPct ?? null,
      umpire:    c.umpire ?? null,
      umpireRating: c.umpireRating ?? null,
      bookLine:  c.propLine?.books?.DK?.line ?? c.suggestedLine ?? null,
      windFav:   c.windFav ?? false,
      order:     c.order ?? null,
      signals:   c.signals ?? [],
      positives: [],
      negatives: [],
      caution:   null,
      matchup:   c.matchup ?? null,
    }));

  if (summaryCards.length) {
    const summaryMap = await generateCardSummaries(summaryCards);
    const toSave = summaryCards
      .filter(c => summaryMap[c.id])
      .map(c => ({ cardKey: dbCardKey(c), summary: summaryMap[c.id] }));
    await saveCardSummaries(toSave, slateDate);
  }

  // ── 10. Pre-snapshot all board markets ───────────────────────────────────
  // These snapshots make Board cards deterministic for every client that opens today.
  const boardMarkets = [
    { market: "k", candidates: kCandidates },
    { market: "outs", candidates: outsCandidates },
    { market: "hits", candidates: hitsCandidates },
    { market: "hr", candidates: hrCandidates },
    { market: "nrfi", candidates: computeGameBoard("nrfi", activeSlate, liveNrfiData, liveWeather, oddsMap ?? {}, livePitcherStats, liveUmpires, liveLineups) },
    { market: "total", candidates: computeGameBoard("total", activeSlate, liveNrfiData, liveWeather, oddsMap ?? {}, livePitcherStats, liveUmpires, liveLineups) },
    { market: "spread", candidates: spreadCandidates },
    { market: "ml", candidates: computeGameBoard("ml", activeSlate, liveNrfiData, liveWeather, oddsMap ?? {}, livePitcherStats, liveUmpires, liveLineups) },
    { market: "f5ml", candidates: f5mlCandidates },
    { market: "f5spread", candidates: f5spreadCandidates },
  ];

  let boardSnapshotsSaved = 0;
  for (const { market, candidates: marketCandidates } of boardMarkets) {
    if (!marketCandidates?.length) continue;

    const summaryInput = marketCandidates.slice(0, 30).map((c, idx) => ({
      id: String(c.id ?? c.gamePk ?? `${market}-${idx}`),
      market,
      lean: c.leanAbbr ?? c.lean ?? "",
      score: c.score ?? 50,
      scoreTier: (c.score ?? 0) >= 75 ? "high" : (c.score ?? 0) >= 55 ? "mid" : "low",
      positives: [],
      negatives: [],
      caution: null,
      signals: Array.isArray(c.signals) ? c.signals.slice(0, 4) : [],
      name: c.name ?? null,
      hand: c.hand ?? null,
      facingTeam: c.facingTeam ?? null,
      avgK3: c.avgK3 ?? null,
      avgIP: c.avgIP ?? null,
      era: c.era ?? null,
      whip: c.whip ?? null,
      oppKPct: c.oppKPct ?? null,
      umpire: c.umpire ?? null,
      umpireRating: c.umpireRating ?? null,
      bookLine: c.bookLine ?? c.propLine?.books?.DK?.line ?? c.propLine?.books?.FD?.line ?? c.suggestedLine ?? null,
      windFav: c.windFav ?? false,
      matchup: c.away && c.home ? `${c.away.abbr ?? ""} (away) @ ${c.home.abbr ?? ""} (home)` : (c.matchup ?? null),
      order: c.order ?? null,
    }));

    let summaryMap = {};
    try {
      summaryMap = await generateCardSummaries(summaryInput);
    } catch (err) {
      console.warn(`  ⚠ dailyAiSnapshot: board summary gen failed for ${market}: ${err.message}`);
    }

    const withSummaries = marketCandidates.map((c, idx) => {
      const sid = summaryInput[idx]?.id;
      return {
        ...c,
        _boardSummary: sid && summaryMap[sid] ? summaryMap[sid] : null,
      };
    });

    if (await saveBoardSnapshot(slateDate, market, withSummaries)) boardSnapshotsSaved++;
  }
  if (boardSnapshotsSaved > 0) {
    console.log(`  ✓ dailyAiSnapshot: board snapshots saved for ${boardSnapshotsSaved}/${boardMarkets.length} markets`);
  } else {
    throw new Error("board snapshots failed to persist (check DATABASE_URL — use DATABASE_PUBLIC_URL when running locally)");
  }

  console.log(`  ✓ dailyAiSnapshot [${label}] complete  date=${slateDate}  edges=${edges.length}  summaries=${summaryCards.length}`);
}

module.exports = { generateDailyAiSnapshot };
