const express = require("express");
const axios = require("axios");
const cache = require("../services/cache");

const router = express.Router();
const CACHE_TTL = 15 * 60 * 1000;
const BASE = "https://gamma-api.polymarket.com";

const TEAM_NAME_TO_ABBR = {
  "arizona diamondbacks": "ARI", "atlanta braves": "ATL", "baltimore orioles": "BAL",
  "boston red sox": "BOS", "chicago white sox": "CWS", "chicago cubs": "CHC",
  "cincinnati reds": "CIN", "cleveland guardians": "CLE", "colorado rockies": "COL",
  "detroit tigers": "DET", "houston astros": "HOU", "kansas city royals": "KC",
  "los angeles angels": "LAA", "los angeles dodgers": "LAD", "miami marlins": "MIA",
  "milwaukee brewers": "MIL", "minnesota twins": "MIN", "new york mets": "NYM",
  "new york yankees": "NYY", "oakland athletics": "OAK", "philadelphia phillies": "PHI",
  "pittsburgh pirates": "PIT", "san diego padres": "SD", "san francisco giants": "SF",
  "seattle mariners": "SEA", "st louis cardinals": "STL", "st. louis cardinals": "STL",
  "tampa bay rays": "TB", "texas rangers": "TEX", "toronto blue jays": "TOR",
  "washington nationals": "WSH",
  "diamondbacks": "ARI", "braves": "ATL", "orioles": "BAL", "red sox": "BOS",
  "white sox": "CWS", "cubs": "CHC", "reds": "CIN", "guardians": "CLE",
  "rockies": "COL", "tigers": "DET", "astros": "HOU", "royals": "KC",
  "angels": "LAA", "dodgers": "LAD", "marlins": "MIA", "brewers": "MIL",
  "twins": "MIN", "mets": "NYM", "yankees": "NYY", "athletics": "OAK",
  "phillies": "PHI", "pirates": "PIT", "padres": "SD", "giants": "SF",
  "mariners": "SEA", "cardinals": "STL", "rays": "TB", "rangers": "TEX",
  "blue jays": "TOR", "nationals": "WSH",
};

function normalizeName(str) {
  return String(str ?? "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
}

function extractAbbr(text) {
  const n = normalizeName(text);
  const sorted = Object.keys(TEAM_NAME_TO_ABBR).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (n.includes(key)) return TEAM_NAME_TO_ABBR[key];
  }
  return null;
}

function parseGameMarket(question) {
  const q = normalizeName(question);
  const beatMatch = q.match(/will (?:the )?(.+?) beat (?:the )?(.+?)(?:\?|$)/);
  if (beatMatch) {
    const winnerAbbr = extractAbbr(beatMatch[1]);
    const loserAbbr = extractAbbr(beatMatch[2]);
    if (winnerAbbr && loserAbbr) return { winnerAbbr, loserAbbr };
  }
  const toWinMatch = q.match(/^(.+?) to win(?: vs (?:the )?(.+?))?(?:\?|$)/);
  if (toWinMatch) {
    const winnerAbbr = extractAbbr(toWinMatch[1]);
    const loserAbbr = toWinMatch[2] ? extractAbbr(toWinMatch[2]) : null;
    if (winnerAbbr) return { winnerAbbr, loserAbbr };
  }
  return null;
}

function parseStringifiedArray(val) {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

function todayHonolulu() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}

function tomorrowHonolulu() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}

router.get("/mlb-game-odds", async (_req, res) => {
  const cacheKey = `polymarket:mlb:${todayHonolulu()}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const { data } = await axios.get(`${BASE}/markets`, {
      params: {
        active: true,
        limit: 200,
        start_date_min: todayHonolulu(),
        end_date_max: tomorrowHonolulu(),
      },
      timeout: 12000,
      headers: { "User-Agent": "PropScout/1.0" },
    });

    const markets = Array.isArray(data) ? data : [];
    const byTeamPair = {};

    markets.forEach((m) => {
      if (!m.question || m.closed) return;
      const outcomes = parseStringifiedArray(m.outcomes);
      const prices = parseStringifiedArray(m.outcomePrices);
      const isYesNo = outcomes.length === 2 &&
        normalizeName(outcomes[0]).includes("yes") &&
        normalizeName(outcomes[1]).includes("no");
      if (!isYesNo || !prices.length) return;

      const parsed = parseGameMarket(m.question);
      if (!parsed?.winnerAbbr) return;

      const winnerProb = Math.round(parseFloat(prices[0]) * 100);
      const loserProb = 100 - winnerProb;
      if (isNaN(winnerProb)) return;

      const key1 = `${parsed.winnerAbbr}|${parsed.loserAbbr ?? "?"}`;
      const key2 = `${parsed.loserAbbr ?? "?"}|${parsed.winnerAbbr}`;
      const entry = {
        winnerAbbr: parsed.winnerAbbr,
        loserAbbr: parsed.loserAbbr,
        winnerProb,
        loserProb,
        question: m.question,
        source: "polymarket",
        fetchedAt: new Date().toISOString(),
      };
      byTeamPair[key1] = entry;
      if (parsed.loserAbbr) byTeamPair[key2] = entry;
    });

    const result = { date: todayHonolulu(), markets: byTeamPair, count: Object.keys(byTeamPair).length };
    cache.set(cacheKey, result, CACHE_TTL);
    return res.json(result);
  } catch (err) {
    return res.status(502).json({ error: "Polymarket fetch failed", detail: err.message });
  }
});

module.exports = router;
