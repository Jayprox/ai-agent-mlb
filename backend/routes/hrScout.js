const express = require("express");
const OpenAI = require("openai");
const mlb = require("../services/mlbApi");
const requireAuth = require("../middleware/auth");
const { query, isConnected } = require("../services/db");
const { buildArsenalPayloadForJob } = require("./arsenal");
const { fetchBatterPowerProfile } = require("./batterPower");
const { fetchBatterRecentForm } = require("./batterGamelog");
const { getParkHrFactor } = require("../data/parkFactors");
const { computeWindBoost } = require("../data/parkWindMap");

const router = express.Router();

const MAX_GENERATIONS_PER_DAY = 3;
const SEASON = new Date().getFullYear();

const HR_SCOUT_ALLOWLIST = (process.env.AI_PICKS_ALLOWLIST ?? "leadoffkaiba")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

// ── Auth helpers ──────────────────────────────────────────────
function requireHRScoutAccess(req, res, next) {
  const identities = [req.user?.email, req.user?.username, req.email, req.username]
    .filter(Boolean).map(s => String(s).trim().toLowerCase());
  if (!identities.some(id => HR_SCOUT_ALLOWLIST.includes(id))) {
    return res.status(403).json({ error: "Access restricted" });
  }
  return next();
}

router.use(requireAuth, (req, _res, next) => {
  req.user = { email: req.email ?? null, username: req.username ?? null, userId: req.userId ?? null };
  next();
}, requireHRScoutAccess);

// ── Utilities ─────────────────────────────────────────────────
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

function safeJsonParse(text) {
  const t = String(text ?? "").trim();
  if (!t) return {};
  return JSON.parse(t.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, ""));
}

function fmt(val, suffix = "") {
  return val == null ? "n/a" : `${val}${suffix}`;
}

// ── DB setup ──────────────────────────────────────────────────
async function ensureHRScoutTables() {
  if (!isConnected()) return;
  await query(`
    CREATE TABLE IF NOT EXISTS hr_scout_snapshots (
      slate_date DATE PRIMARY KEY,
      picks JSONB NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      generations_used INTEGER NOT NULL DEFAULT 1
    )
  `);
}

// ── Weather fetch (same pattern as scout.js) ──────────────────
const STADIUMS = {
  "Citizens Bank Park":        { lat: 39.9061, lon: -75.1665, roof: false },
  "Dodger Stadium":            { lat: 34.0739, lon: -118.2400, roof: false },
  "Globe Life Field":          { lat: 32.7473, lon: -97.0832, roof: true },
  "American Family Field":     { lat: 43.0280, lon: -87.9712, roof: false },
  "Oracle Park":               { lat: 37.7786, lon: -122.3893, roof: false },
  "Rogers Centre":             { lat: 43.6414, lon: -79.3894, roof: true },
  "Yankee Stadium":            { lat: 40.8296, lon: -73.9262, roof: false },
  "Fenway Park":               { lat: 42.3467, lon: -71.0972, roof: false },
  "Wrigley Field":             { lat: 41.9484, lon: -87.6553, roof: false },
  "Busch Stadium":             { lat: 38.6226, lon: -90.1928, roof: false },
  "T-Mobile Park":             { lat: 47.5914, lon: -122.3325, roof: false },
  "Camden Yards":              { lat: 39.2838, lon: -76.6218, roof: false },
  "Petco Park":                { lat: 32.7076, lon: -117.1570, roof: false },
  "Truist Park":               { lat: 33.8907, lon: -84.4677, roof: false },
  "Great American Ball Park":  { lat: 39.0979, lon: -84.5082, roof: false },
  "loanDepot park":            { lat: 25.7781, lon: -80.2197, roof: true },
  "Minute Maid Park":          { lat: 29.7572, lon: -95.3555, roof: true },
  "Tropicana Field":           { lat: 27.7683, lon: -82.6534, roof: true },
  "Chase Field":               { lat: 33.4453, lon: -112.0667, roof: true },
  "Coors Field":               { lat: 39.7559, lon: -104.9942, roof: false },
  "PNC Park":                  { lat: 40.4469, lon: -80.0057, roof: false },
  "Target Field":              { lat: 44.9817, lon: -93.2778, roof: false },
  "Kauffman Stadium":          { lat: 39.0517, lon: -94.4803, roof: false },
  "Progressive Field":         { lat: 41.4962, lon: -81.6852, roof: false },
  "Comerica Park":             { lat: 42.3390, lon: -83.0485, roof: false },
  "Guaranteed Rate Field":     { lat: 41.8299, lon: -87.6338, roof: false },
  "Angel Stadium":             { lat: 33.8003, lon: -117.8827, roof: false },
  "Sutter Health Park":        { lat: 38.5762, lon: -121.5029, roof: false },
  "Nationals Park":            { lat: 38.8730, lon: -77.0074, roof: false },
  "Citi Field":                { lat: 40.7571, lon: -73.8458, roof: false },
};

async function fetchWeather(gameTime, stadiumName) {
  const s = STADIUMS[stadiumName];
  if (!s) return null;
  if (s.roof) return { roof: true, temp: null, speed: null, degrees: null };
  try {
    const axios = require("axios");
    const { data } = await axios.get("https://api.open-meteo.com/v1/forecast", {
      params: {
        latitude: s.lat, longitude: s.lon,
        hourly: "temperature_2m,wind_speed_10m,wind_direction_10m",
        temperature_unit: "fahrenheit",
        wind_speed_unit: "mph",
        forecast_days: 1,
      },
      timeout: 10000,
    });
    const times = data?.hourly?.time ?? [];
    const tgt = Date.parse(gameTime);
    let bestIdx = 0, bestDiff = Infinity;
    times.forEach((t, i) => { const d = Math.abs(Date.parse(t) - tgt); if (d < bestDiff) { bestDiff = d; bestIdx = i; } });
    return {
      roof: false,
      temp: data.hourly.temperature_2m[bestIdx] ?? null,
      speed: data.hourly.wind_speed_10m[bestIdx] ?? null,
      degrees: data.hourly.wind_direction_10m[bestIdx] ?? null,
    };
  } catch { return null; }
}

// ── Algorithm: HR Score ───────────────────────────────────────
// Returns { score, tier, signals[] }
// batter: lineup batter object with .hand, .order, .powerProfile, .recentForm
// pitcherStats: arsenal pitcherStats object (.flyBallPctInclPopup, .barrelPct, .xwOBAAllowed)
// parkFactor: result of getParkHrFactor(homeTeamAbbr, batterHand)
// windBoost: +1 / -1 / 0
function computeHRScore(batter, pitcherStats, parkFactor, windBoost, pitcherArsenal = []) {
  let score = 0;
  const signals = [];
  const pp = batter.powerProfile ?? {};
  const rf = batter.recentForm ?? {};
  const handSplit = batter.hand === "L" ? (pitcherStats?.vsLeft ?? null)
    : batter.hand === "R" ? (pitcherStats?.vsRight ?? null)
      : null;

  // ── Pitcher signals ──────────────────────────────────────────
  const fbPct = handSplit?.flyBallPct ?? pitcherStats?.flyBallPctInclPopup ?? null;
  const pBarrel = handSplit?.barrelPct ?? pitcherStats?.barrelPct ?? null;
  const xwOBA = pitcherStats?.xwOBAAllowed ?? null;

  if (fbPct != null) {
    if (fbPct >= 40) { score += 3; signals.push(`Pitcher FB% ${fbPct}% (high fly-ball risk)`); }
    else if (fbPct >= 35) { score += 2; signals.push(`Pitcher FB% ${fbPct}%`); }
  }
  if (pBarrel != null) {
    if (pBarrel >= 10) { score += 3; signals.push(`Pitcher Barrel% ${pBarrel}% (elite contact allowed)`); }
    else if (pBarrel >= 7) { score += 2; signals.push(`Pitcher Barrel% ${pBarrel}%`); }
  }
  if (xwOBA != null) {
    if (xwOBA >= 0.380) { score += 2; signals.push(`Pitcher xwOBA ${xwOBA} (vulnerable)`); }
  }
  const hrAllowed = handSplit?.hrAllowed ?? null;
  if (hrAllowed != null) {
    if (hrAllowed >= 15) { score += 2; signals.push(`${hrAllowed} HR allowed vs ${batter.hand}HB`); }
    else if (hrAllowed <= 3)  { score -= 1; signals.push(`Only ${hrAllowed} HR allowed vs ${batter.hand}HB`); }
  }

  // ── Batter power signals ─────────────────────────────────────
  const bBarrel = pp.barrelPct ?? null;
  const ev = pp.avgExitVelo ?? null;
  const hrFb = pp.hrFbRate ?? null;

  if (bBarrel != null) {
    if (bBarrel >= 10) { score += 4; signals.push(`Barrel% ${bBarrel}% (elite power)`); }
    else if (bBarrel >= 7) { score += 2; signals.push(`Barrel% ${bBarrel}%`); }
  }
  if (ev != null) {
    if (ev >= 93) { score += 2; signals.push(`Avg EV ${ev} mph`); }
  }
  if (hrFb != null) {
    if (hrFb >= 20) { score += 3; signals.push(`HR/FB ${hrFb}% (power hitter)`); }
    else if (hrFb >= 15) { score += 2; signals.push(`HR/FB ${hrFb}%`); }
  }
  // ── L7 EV trend ──────────────────────────────────────────────
  const evDelta = pp.recentEv?.evDelta ?? null;
  const bbL7    = pp.recentEv?.bbL7    ?? 0;
  if (evDelta != null && bbL7 >= 5) {
    if (evDelta >= 4)       { score += 2; signals.push(`EV spiking +${evDelta} mph vs season avg (L7)`); }
    else if (evDelta >= 2)  { score += 1; signals.push(`EV trending up +${evDelta} mph vs season (L7)`); }
    else if (evDelta <= -3) { score -= 1; signals.push(`EV down ${evDelta} mph vs season avg (L7)`); }
  }

  // ── Park factor (handedness-adjusted) ────────────────────────
  const pf = parkFactor?.factor ?? 1.0;
  // factor is a multiplier (e.g. 1.18 = 18% above avg). Convert to 0-based for scoring.
  const pfPct = Math.round(pf * 100); // e.g. 118, 92
  if (pfPct >= 115) { score += 3; signals.push(`Park HR factor ${pfPct} (hitter haven)`); }
  else if (pfPct >= 108) { score += 2; signals.push(`Park HR factor ${pfPct} (hitter-friendly)`); }
  else if (pfPct <= 80) { score -= 4; signals.push(`Park HR factor ${pfPct} (suppresses HRs)`); }

  // ── Wind ─────────────────────────────────────────────────────
  if (windBoost === 1) { score += 2; signals.push("Wind blowing out — favorable"); }
  else if (windBoost === -1) { score -= 2; signals.push("Wind blowing in — suppresses HRs"); }

  // ── Recent form ───────────────────────────────────────────────
  if (rf.hotStreak === true) { score += 3; signals.push(`Hot streak — ${rf.hrLast15} HR last 15 games`); }
  if (rf.coldStreak === true) { score -= 2; signals.push("Cold — 0 HR last 15 games"); }
  else if (rf.hrLast15 != null && rf.hrLast15 === 0 && rf.coldStreak === false) {
    // Not cold-streaking but also 0 HR — mild negative, don't double-penalize
    score -= 1;
  }

  // ── Batting order ─────────────────────────────────────────────
  const order = batter.order ?? 9;
  if (order <= 5) { score += 1; signals.push(`Batting ${order} (more PA)`); }

  // ── Pitch-type power matchup ──────────────────────────────────
  const pts = batter.powerProfile?.pitchTypeSplits ?? null;
  if (pts && pitcherArsenal.length > 0) {
    const topPitch = pitcherArsenal.reduce(
      (best, p) => (!best || (p.pct ?? 0) > (best.pct ?? 0)) ? p : best, null
    );
    if (topPitch?.abbr) {
      const split = pts[topPitch.abbr] ?? null;
      if (split && split.battedBalls >= 15) {
        if (split.barrelPct >= 12) {
          score += 2;
          signals.push(`Barrels ${topPitch.abbr} at ${split.barrelPct}% (${split.battedBalls} BB)`);
        } else if (split.barrelPct <= 2) {
          score -= 1;
          signals.push(`Low barrel vs ${topPitch.abbr} (${split.barrelPct}%)`);
        }
      }
    }
  }

  // ── Tier ────────────────────────────────────────────────────
  const tier = score >= 12 ? 1 : score >= 8 ? 2 : score >= 5 ? 3 : null;

  return { score, tier, signals };
}

// ── Lineup fetch (simple, no enrichment — we call enrichment functions directly) ──
async function fetchRawLineup(gamePk) {
  try {
    const { data } = await mlb.get(`/game/${gamePk}/boxscore?hydrate=person`);
    const toArr = (teamData) => (teamData.battingOrder ?? []).map((pid, idx) => {
      const p = teamData.players?.[`ID${pid}`];
      if (!p) return null;
      return { id: pid, name: p.person?.fullName ?? "", hand: p.batSide?.code ?? "?", order: idx + 1 };
    }).filter(Boolean);
    return { confirmed: true, away: toArr(data.teams.away), home: toArr(data.teams.home) };
  } catch { return { confirmed: false, away: [], home: [] }; }
}

// ── Main generator ────────────────────────────────────────────
async function generateHRScoutPicks(date, generationsUsed) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
  if (isConnected()) await ensureHRScoutTables();

  // Load schedule — DB first, MLB API fallback (same pattern as scout.js)
  let allGames = [];
  if (isConnected()) {
    const r = await query("SELECT games FROM schedule_snapshots WHERE slate_date = $1", [date]);
    allGames = r?.rows?.[0]?.games ?? [];
  }
  if (!allGames.length) {
    try {
      const { data } = await mlb.get("/schedule", {
        params: { sportId: 1, date, hydrate: "probablePitcher,team,venue" },
      });
      allGames = (data?.dates?.[0]?.games ?? []).map(g => ({
        gamePk: g.gamePk,
        gameTime: g.gameDate,
        stadium: g.venue?.name ?? "",
        status: g.status?.detailedState ?? "",
        away: { id: g.teams.away.team.id, name: g.teams.away.team.name, abbr: g.teams.away.team.abbreviation },
        home: { id: g.teams.home.team.id, name: g.teams.home.team.name, abbr: g.teams.home.team.abbreviation },
        probablePitchers: {
          away: g.teams.away.probablePitcher ? { id: g.teams.away.probablePitcher.id, name: g.teams.away.probablePitcher.fullName, hand: null } : null,
          home: g.teams.home.probablePitcher ? { id: g.teams.home.probablePitcher.id, name: g.teams.home.probablePitcher.fullName, hand: null } : null,
        },
      }));
    } catch (e) { console.warn("  ⚠ hr-scout: schedule fallback failed:", e.message); }
  }

  const games = allGames
    .filter(g => g?.probablePitchers?.away?.id && g?.probablePitchers?.home?.id)
    .slice(0, 8);

  if (!games.length) {
    return { picks: [], generatedAt: new Date().toISOString(), slateDate: date, generationsUsedToday: generationsUsed, maxGenerationsPerDay: MAX_GENERATIONS_PER_DAY };
  }

  // Fetch arsenal for all pitchers in parallel
  const pitcherIds = [...new Set(games.flatMap(g => [g.probablePitchers.home.id, g.probablePitchers.away.id]).filter(Boolean))];
  const arsenalMap = new Map();
  await Promise.all(pitcherIds.map(async id => {
    try {
      const data = await buildArsenalPayloadForJob(id, SEASON);
      arsenalMap.set(id, {
        stats: data?.pitcherStats ?? null,
        arsenal: data?.arsenal ?? [],
      });
    } catch {
      arsenalMap.set(id, { stats: null, arsenal: [] });
    }
  }));

  // Assemble per-batter candidate list across all games
  const candidates = [];

  for (const game of games) {
    const weather = await fetchWeather(game.gameTime, game.stadium).catch(() => null);
    const lineups = await fetchRawLineup(game.gamePk);
    if (!lineups.confirmed) continue;

    const allBatters = [
      ...lineups.away.map(b => ({ ...b, teamAbbr: game.away.abbr, facingPitcherAbbr: game.home.abbr, facingPitcherId: game.probablePitchers.home.id, facingPitcherName: game.probablePitchers.home.name })),
      ...lineups.home.map(b => ({ ...b, teamAbbr: game.home.abbr, facingPitcherAbbr: game.away.abbr, facingPitcherId: game.probablePitchers.away.id, facingPitcherName: game.probablePitchers.away.name })),
    ];

    // Enrich each batter with power profile + recent form in parallel chunks of 3
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

    const temp = weather?.temp ?? 72;
    const windDeg = weather?.degrees ?? 0;
    const windSpd = weather?.speed ?? 0;
    const { windBoost, windContext } = computeWindBoost(windDeg, windSpd, game.stadium, temp);

    for (const batter of allBatters) {
      const pitcherStats = arsenalMap.get(batter.facingPitcherId)?.stats ?? null;
      const pitcherArsenal = arsenalMap.get(batter.facingPitcherId)?.arsenal ?? [];
      const parkFactor = getParkHrFactor(game.home.abbr, batter.hand);
      const { score, tier, signals } = computeHRScore(batter, pitcherStats, parkFactor, windBoost, pitcherArsenal);

      if (tier === null) continue; // score < 5, skip

      candidates.push({
        batter,
        game,
        pitcherStats,
        parkFactor,
        windBoost,
        windContext,
        weather,
        score,
        tier,
        signals,
      });
    }
  }

  // Sort by score descending, cap at 30 for context window
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 30);

  if (!top.length) {
    return { picks: [], generatedAt: new Date().toISOString(), slateDate: date, generationsUsedToday: generationsUsed, maxGenerationsPerDay: MAX_GENERATIONS_PER_DAY };
  }

  // Build context block for AI
  const contextLines = top.map(c => {
    const { batter, game, pitcherStats, parkFactor, windContext, weather, score, tier } = c;
    const pp = batter.powerProfile ?? {};
    const rf = batter.recentForm ?? {};
    const weatherStr = weather?.roof
      ? "Dome"
      : weather
        ? `${Math.round(weather.temp ?? 0)}°F, ${Math.round(weather.speed ?? 0)} mph`
        : "n/a";

    return [
      `BATTER: ${batter.name} (${batter.hand}HB) — ${batter.teamAbbr} — Order #${batter.order}`,
      `VS PITCHER: ${batter.facingPitcherName} (${batter.facingPitcherAbbr}) — FB%: ${fmt(pitcherStats?.flyBallPctInclPopup, "%")} | Barrel% allowed: ${fmt(pitcherStats?.barrelPct, "%")} | xwOBA: ${fmt(pitcherStats?.xwOBAAllowed)}`,
      `POWER: Barrel% ${fmt(pp.barrelPct, "%")} | Avg EV ${fmt(pp.avgExitVelo, " mph")} | HR/FB ${fmt(pp.hrFbRate, "%")} | HH% ${fmt(pp.hardHitPct, "%")}`,
      ...(pp.recentEv ? [`EV L7: ${pp.recentEv.evL7} mph (${pp.recentEv.evDelta >= 0 ? "+" : ""}${pp.recentEv.evDelta} vs szn) | HH% ${pp.recentEv.hardHitPctL7}% | Brl% ${pp.recentEv.barrelPctL7}% | ${pp.recentEv.bbL7} BB`] : []),
      ...(() => {
        const ptsMap = pp.pitchTypeSplits ?? {};
        const pitcherArsenalCtx = arsenalMap.get(batter.facingPitcherId)?.arsenal ?? [];
        const pitchMatchups = pitcherArsenalCtx.slice(0, 3)
          .map(p => {
            const s = ptsMap[p.abbr];
            if (!s || s.battedBalls < 15) return null;
            return `vs ${p.abbr} Brl${s.barrelPct}% HH${s.hardHitPct}% (${s.battedBalls}BB)`;
          }).filter(Boolean);
        return pitchMatchups.length ? [`PITCH SPLITS: ${pitchMatchups.join(" | ")}`] : [];
      })(),
      `FORM: ${rf.hrLast15 ?? "?"} HR in last ${rf.last15Games ?? 15} games${rf.hotStreak ? " 🔥 HOT STREAK" : rf.coldStreak ? " 🥶 COLD" : ""}`,
      `PARK: ${game.home.abbr} — HR factor ${Math.round(parkFactor.factor * 100)} for ${batter.hand}HB (${parkFactor.label})`,
      `WIND: ${windContext} | Weather: ${weatherStr}`,
      `HR SCORE: ${score} (Tier ${tier})`,
      `SIGNALS: ${c.signals.join(" | ")}`,
    ].join("\n");
  }).join("\n\n");

  const systemPrompt = `You are an HR prop research specialist. You analyze home run prop opportunities using batter power profiles, pitcher fly ball and barrel tendencies, park factors, wind, and recent form. You only recommend a batter when at least three independent signals support it. You cite specific numbers. Be selective — if the data doesn't support a play, say so.`;

  const userPrompt = `Today's HR prop candidates are below, ranked by algorithm score. Review each and select the best 4–8 plays.
For each pick: explain the key edge in 2–4 sentences, note any caution flags.
Return valid JSON only.

${contextLines}

Return format:
{
  "picks": [
    {
      "batter": "Aaron Judge",
      "team": "NYY",
      "pitcher": "Chris Sale",
      "pitcherTeam": "BOS",
      "game": "NYY @ BOS",
      "lean": "HR",
      "confidence": "HIGH",
      "hrScore": 15,
      "tier": 1,
      "keySignals": ["Barrel% 12.4%", "Pitcher FB% 42%", "Park factor 118", "Wind out to RF"],
      "reasoning": "...",
      "caution": null
    }
  ]
}`;

  const completion = await getClient().chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    temperature: 0.4,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const payload = safeJsonParse(completion.choices?.[0]?.message?.content);
  const picks = Array.isArray(payload.picks) ? payload.picks : [];

  // Persist to DB if available
  if (isConnected()) {
    await query(
      `INSERT INTO hr_scout_snapshots (slate_date, picks, generations_used)
       VALUES ($1, $2, $3)
       ON CONFLICT (slate_date) DO UPDATE
         SET picks = EXCLUDED.picks,
             generated_at = NOW(),
             generations_used = EXCLUDED.generations_used`,
      [date, JSON.stringify(picks), generationsUsed]
    );
  }

  return {
    picks,
    generatedAt: new Date().toISOString(),
    slateDate: date,
    generationsUsedToday: generationsUsed,
    maxGenerationsPerDay: MAX_GENERATIONS_PER_DAY,
  };
}

// ── Routes ────────────────────────────────────────────────────

// GET /api/hr-scout/picks — read today's picks from DB (or return empty)
router.get("/picks", async (req, res) => {
  const date = todayHonolulu();
  try {
    if (isConnected()) {
      await ensureHRScoutTables();
      const row = await query(
        "SELECT picks, generated_at, generations_used FROM hr_scout_snapshots WHERE slate_date = $1",
        [date]
      );
      if (row?.rows?.[0]) {
        const r = row.rows[0];
        return res.json({
          picks: r.picks ?? [],
          generatedAt: r.generated_at,
          slateDate: date,
          generationsUsedToday: r.generations_used ?? 1,
          maxGenerationsPerDay: MAX_GENERATIONS_PER_DAY,
        });
      }
    }
    // No picks yet today
    return res.json({ picks: [], slateDate: date, generationsUsedToday: 0, maxGenerationsPerDay: MAX_GENERATIONS_PER_DAY });
  } catch (err) {
    res.status(500).json({ error: "Failed to load HR Scout picks", detail: err.message });
  }
});

// POST /api/hr-scout/regenerate — generate new picks (rate-limited)
router.post("/regenerate", async (req, res) => {
  const date = todayHonolulu();
  try {
    if (isConnected()) await ensureHRScoutTables();

    let generationsUsed = 1;
    if (isConnected()) {
      const existing = await query(
        "SELECT generations_used FROM hr_scout_snapshots WHERE slate_date = $1",
        [date]
      );
      if (existing?.rows?.[0]) {
        generationsUsed = (existing.rows[0].generations_used ?? 0) + 1;
        if (generationsUsed > MAX_GENERATIONS_PER_DAY) {
          return res.status(429).json({ error: `Max ${MAX_GENERATIONS_PER_DAY} generations per day reached` });
        }
      }
    }

    const result = await generateHRScoutPicks(date, generationsUsed);
    res.json(result);
  } catch (err) {
    console.error("HR Scout error:", err.message);
    res.status(500).json({ error: "HR Scout generation failed", detail: err.message });
  }
});

module.exports = router;
