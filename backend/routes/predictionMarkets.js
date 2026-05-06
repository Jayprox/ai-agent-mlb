const express = require("express");
const axios = require("axios");
const cache = require("../services/cache");

const router = express.Router();
const CACHE_TTL = 15 * 60 * 1000;

const MLB_ABBRS = new Set([
  "ARI","ATL","BAL","BOS","CWS","CHC","CIN","CLE","COL",
  "DET","HOU","KC","LAA","LAD","MIA","MIL","MIN","NYM",
  "NYY","OAK","PHI","PIT","SD","SF","SEA","STL","TB","TEX","TOR","WSH",
]);

const NAME_TO_ABBR = {
  "arizona diamondbacks":"ARI","atlanta braves":"ATL","baltimore orioles":"BAL",
  "boston red sox":"BOS","chicago white sox":"CWS","chicago cubs":"CHC",
  "cincinnati reds":"CIN","cleveland guardians":"CLE","colorado rockies":"COL",
  "detroit tigers":"DET","houston astros":"HOU","kansas city royals":"KC",
  "los angeles angels":"LAA","los angeles dodgers":"LAD","miami marlins":"MIA",
  "milwaukee brewers":"MIL","minnesota twins":"MIN","new york mets":"NYM",
  "new york yankees":"NYY","oakland athletics":"OAK","philadelphia phillies":"PHI",
  "pittsburgh pirates":"PIT","san diego padres":"SD","san francisco giants":"SF",
  "seattle mariners":"SEA","st. louis cardinals":"STL","tampa bay rays":"TB",
  "texas rangers":"TEX","toronto blue jays":"TOR","washington nationals":"WSH",
  "diamondbacks":"ARI","braves":"ATL","orioles":"BAL","red sox":"BOS",
  "white sox":"CWS","cubs":"CHC","reds":"CIN","guardians":"CLE",
  "rockies":"COL","tigers":"DET","astros":"HOU","royals":"KC",
  "angels":"LAA","dodgers":"LAD","marlins":"MIA","brewers":"MIL",
  "twins":"MIN","mets":"NYM","yankees":"NYY","athletics":"OAK",
  "phillies":"PHI","pirates":"PIT","padres":"SD","giants":"SF",
  "mariners":"SEA","cardinals":"STL","rays":"TB","rangers":"TEX",
  "blue jays":"TOR","nationals":"WSH",
};

function todayHonolulu() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}

function tomorrowHonolulu() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}

function splitKalshiTeams(tail) {
  for (let i = 2; i <= tail.length - 2; i++) {
    const away = tail.slice(0, i);
    const home = tail.slice(i);
    if (MLB_ABBRS.has(away) && MLB_ABBRS.has(home)) return { away, home };
  }
  return null;
}

async function fetchKalshi() {
  const { data } = await axios.get(
    "https://api.elections.kalshi.com/trade-api/v2/markets",
    {
      params: { series_ticker: "KXMLBGAME", status: "open", limit: 200 },
      timeout: 12000,
      headers: { "User-Agent": "PropScout/1.0" },
    }
  );
  const markets = Array.isArray(data?.markets) ? data.markets : [];
  const byTeamPair = {};

  markets.forEach((m) => {
    const ticker = String(m.ticker ?? "");
    const suffix = ticker.replace(/^KXMLBGAME-/i, "");
    if (suffix.length < 13) return;
    const teamTail = suffix.slice(11);
    const teams = splitKalshiTeams(teamTail);
    if (!teams) return;

    let yesMid = null;
    if (m.yes_bid != null && m.yes_ask != null) {
      yesMid = (Number(m.yes_bid) + Number(m.yes_ask)) / 2;
    } else if (m.yes_bid_dollars != null && m.yes_ask_dollars != null) {
      yesMid = ((Number(m.yes_bid_dollars) + Number(m.yes_ask_dollars)) / 2) * 100;
    } else if (m.last_price != null) {
      yesMid = Number(m.last_price);
    } else if (m.last_price_dollars != null) {
      yesMid = Number(m.last_price_dollars) * 100;
    }
    if (yesMid == null || isNaN(yesMid)) return;

    const awayProb = Math.round(yesMid);
    const homeProb = 100 - awayProb;
    const entry = { awayAbbr: teams.away, homeAbbr: teams.home, awayProb, homeProb, source: "kalshi" };
    byTeamPair[`${teams.away}|${teams.home}`] = entry;
    byTeamPair[`${teams.home}|${teams.away}`] = entry;
  });

  return byTeamPair;
}

function normalizeName(str) {
  return String(str ?? "").toLowerCase().replace(/[^a-z ]/g, "").trim();
}

function extractAbbr(text) {
  const n = normalizeName(text);
  const sorted = Object.keys(NAME_TO_ABBR).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (n.includes(key)) return NAME_TO_ABBR[key];
  }
  return null;
}

function parsePolyQuestion(question) {
  const q = normalizeName(question);
  const beatMatch = q.match(/will (?:the )?(.+?) beat (?:the )?(.+?)(?:\?|$)/);
  if (beatMatch) {
    const a = extractAbbr(beatMatch[1]);
    const b = extractAbbr(beatMatch[2]);
    if (a && b) return { winnerAbbr: a, loserAbbr: b };
  }
  const toWinMatch = q.match(/^(.+?) to win(?: vs (?:the )?(.+?))?(?:\?|$)/);
  if (toWinMatch) {
    const a = extractAbbr(toWinMatch[1]);
    const b = toWinMatch[2] ? extractAbbr(toWinMatch[2]) : null;
    if (a) return { winnerAbbr: a, loserAbbr: b };
  }
  return null;
}

function parseStringifiedArray(val) {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

async function fetchPolymarket() {
  const { data } = await axios.get("https://gamma-api.polymarket.com/markets", {
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
    if (outcomes.length !== 2 || prices.length !== 2) return;
    const isYesNo = normalizeName(outcomes[0]).includes("yes") &&
                    normalizeName(outcomes[1]).includes("no");
    if (!isYesNo) return;
    const parsed = parsePolyQuestion(m.question);
    if (!parsed?.winnerAbbr || !parsed?.loserAbbr) return;
    const winnerProb = Math.round(parseFloat(prices[0]) * 100);
    if (isNaN(winnerProb)) return;
    const entry = {
      winnerAbbr: parsed.winnerAbbr,
      loserAbbr: parsed.loserAbbr,
      winnerProb,
      loserProb: 100 - winnerProb,
      source: "polymarket",
    };
    byTeamPair[`${parsed.winnerAbbr}|${parsed.loserAbbr}`] = entry;
    byTeamPair[`${parsed.loserAbbr}|${parsed.winnerAbbr}`] = entry;
  });

  return byTeamPair;
}

router.get("/mlb-game-odds", async (_req, res) => {
  const cacheKey = `predmkt:mlb:${todayHonolulu()}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const [kalshiResult, polyResult] = await Promise.allSettled([
    fetchKalshi(),
    fetchPolymarket(),
  ]);

  const result = {
    date: todayHonolulu(),
    kalshi: kalshiResult.status === "fulfilled" ? kalshiResult.value : {},
    polymarket: polyResult.status === "fulfilled" ? polyResult.value : {},
    fetchedAt: new Date().toISOString(),
  };

  cache.set(cacheKey, result, CACHE_TTL);
  return res.json(result);
});

module.exports = router;
