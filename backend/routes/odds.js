const express = require("express");
const router  = express.Router();
const axios   = require("axios");
const cache   = require("../services/cache");
const { query, isConnected } = require("../services/db");

const TTL_MS = 20 * 60 * 1000; // 20-minute shared server cache

const TARGET_BOOKS = [
  { key: "draftkings",     label: "DK"  },
  { key: "fanduel",        label: "FD"  },
  { key: "williamhill_us", label: "CZR" },
  { key: "betmgm",         label: "MGM" },
];

const fmtPrice = (p) => (p == null ? null : p > 0 ? `+${p}` : String(p));
const todayHonolulu = () => new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
const PRIMARY_MARKETS = "h2h,totals,spreads,totals_h1,h2h_h1,spreads_h1";
const FALLBACK_MARKETS = "h2h,totals,spreads";

const extractBook = (bk, awayTeam) => {
  let awayML = null, homeML = null, total = null, overOdds = null, underOdds = null,
      f5Total = null, f5AwayML = null, f5HomeML = null,
      awaySpread = null, awaySpreadOdds = null, homeSpread = null, homeSpreadOdds = null,
      f5AwaySpread = null, f5AwaySpreadOdds = null, f5HomeSpread = null, f5HomeSpreadOdds = null;

  const h2h = bk.markets.find(m => m.key === "h2h");
  if (h2h) {
    const awayOut = h2h.outcomes.find(o => o.name === awayTeam);
    const homeOut = h2h.outcomes.find(o => o.name !== awayTeam);
    if (awayOut) awayML = fmtPrice(awayOut.price);
    if (homeOut) homeML = fmtPrice(homeOut.price);
  }

  const totals = bk.markets.find(m => m.key === "totals");
  if (totals) {
    const over  = totals.outcomes.find(o => o.name === "Over");
    const under = totals.outcomes.find(o => o.name === "Under");
    if (over)  { total = String(over.point); overOdds  = fmtPrice(over.price);  }
    if (under) {                              underOdds = fmtPrice(under.price); }
  }

  const totalsH1 = bk.markets.find(m => m.key === "totals_h1");
  if (totalsH1) {
    const f5Over = totalsH1.outcomes.find(o => o.name === "Over");
    if (f5Over) f5Total = String(f5Over.point);
  }

  const h2hH1 = bk.markets.find(m => m.key === "h2h_h1");
  if (h2hH1) {
    const awayOut = h2hH1.outcomes.find(o => o.name === awayTeam);
    const homeOut = h2hH1.outcomes.find(o => o.name !== awayTeam);
    if (awayOut) f5AwayML = fmtPrice(awayOut.price);
    if (homeOut) f5HomeML = fmtPrice(homeOut.price);
  }

  const spreads = bk.markets.find(m => m.key === "spreads");
  if (spreads) {
    const awayOut = spreads.outcomes.find(o => o.name === awayTeam);
    const homeOut = spreads.outcomes.find(o => o.name !== awayTeam);
    if (awayOut) { awaySpread = awayOut.point >= 0 ? `+${awayOut.point}` : `${awayOut.point}`; awaySpreadOdds = fmtPrice(awayOut.price); }
    if (homeOut) { homeSpread = homeOut.point >= 0 ? `+${homeOut.point}` : `${homeOut.point}`; homeSpreadOdds = fmtPrice(homeOut.price); }
  }

  const spreadsH1 = bk.markets.find(m => m.key === "spreads_h1");
  if (spreadsH1) {
    const awayOut = spreadsH1.outcomes.find(o => o.name === awayTeam);
    const homeOut = spreadsH1.outcomes.find(o => o.name !== awayTeam);
    if (awayOut) { f5AwaySpread = awayOut.point >= 0 ? `+${awayOut.point}` : `${awayOut.point}`; f5AwaySpreadOdds = fmtPrice(awayOut.price); }
    if (homeOut) { f5HomeSpread = homeOut.point >= 0 ? `+${homeOut.point}` : `${homeOut.point}`; f5HomeSpreadOdds = fmtPrice(homeOut.price); }
  }

  return {
    awayML, homeML, total, overOdds, underOdds, f5Total, f5AwayML, f5HomeML,
    awaySpread, awaySpreadOdds, homeSpread, homeSpreadOdds,
    f5AwaySpread, f5AwaySpreadOdds, f5HomeSpread, f5HomeSpreadOdds,
  };
};

const buildOddsPayload = (games, meta = {}) => {
  const map        = {};
  const eventIdMap = {};
  const openingTotalsMap = meta.openingTotalsMap ?? {};

  games.forEach(g => {
    const key = `${g.away_team}|${g.home_team}`;
    eventIdMap[key] = g.id;

    const books = {};
    TARGET_BOOKS.forEach(({ key: bKey, label }) => {
      const bk = g.bookmakers?.find(b => b.key === bKey);
      if (bk) books[label] = extractBook(bk, g.away_team);
    });

    const primaryBk = TARGET_BOOKS.map(t => g.bookmakers?.find(b => b.key === t.key)).find(Boolean)
                      ?? g.bookmakers?.[0];
    if (!primaryBk) return;

    const primary      = extractBook(primaryBk, g.away_team);
    const primaryLabel = TARGET_BOOKS.find(t => t.key === primaryBk.key)?.label ?? primaryBk.title;
    const currentTotalNum = parseFloat(primary.total);
    const openTotal = openingTotalsMap[key] ?? null;
    const totalDelta = openTotal != null && !isNaN(currentTotalNum)
      ? Math.round((currentTotalNum - openTotal) * 10) / 10 : null;
    const totalMoveDir = totalDelta == null ? null : totalDelta > 0 ? "up" : totalDelta < 0 ? "down" : "flat";
    const movementText = totalDelta == null ? "No opening line data yet."
      : totalDelta === 0 ? `Total steady at ${currentTotalNum}. No significant movement.`
      : `Total opened ${openTotal} — moved ${totalDelta > 0 ? "UP" : "DOWN"} ${Math.abs(totalDelta)}.`;
    map[key] = { ...primary, book: primaryLabel, books, openTotal, totalDelta, totalMoveDir, movementText };
  });

  return {
    map,
    eventIdMap,
    remaining: meta.remaining ?? null,
    used: meta.used ?? null,
    fetchedAt: meta.fetchedAt ?? null,
  };
};

async function loadOddsPayloadFromDb() {
  if (!isConnected()) return null;
  try {
    const today = todayHonolulu();
    const row = await query(
      `SELECT game_key, fetched_at, odds, opening_total
       FROM odds_snapshots
       WHERE slate_date = $1
       ORDER BY fetched_at DESC`,
      [today]
    );
    const rows = row?.rows ?? [];
    if (!rows.length) return null;

    const freshestMs = Math.max(...rows.map(r => new Date(r.fetched_at).getTime()));
    const ageMs = Date.now() - freshestMs;
    if (ageMs >= TTL_MS) return null;

    const games = rows.map(r => r.odds).filter(Boolean);
    const openingTotalsMap = {};
    rows.forEach(r => {
      if (r.opening_total != null) openingTotalsMap[r.game_key] = Number(r.opening_total);
    });

    return buildOddsPayload(games, {
      fetchedAt: new Date(freshestMs).toISOString(),
      openingTotalsMap,
    });
  } catch (dbErr) {
    console.warn(`Odds DB lookup skipped: ${dbErr.message}`);
    return null;
  }
}

// ── GET /api/odds ─────────────────────────────────────────────────────────
// Returns h2h + totals + spreads for all today's MLB games.
// Shared server-side cache (20 min) — all users share one fetch.
// Response: { map: { "Away|Home": { ...lines, book, books } }, eventIdMap: { "Away|Home": eventId }, remaining, used, fetchedAt }
router.get("/", async (req, res) => {
  const cacheKey = "odds:mlb:today";
  const cached   = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  const dbPayload = await loadOddsPayloadFromDb();
  if (dbPayload) {
    cache.set(cacheKey, dbPayload, TTL_MS);
    res.setHeader("X-Cache", "DB-HIT");
    console.log(`  ✓ odds DB-HIT  games=${Object.keys(dbPayload.map ?? {}).length}`);
    return res.json(dbPayload);
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "ODDS_API_KEY not configured" });

  try {
    const fetchOdds = async (markets) => axios.get(
      `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds`,
      {
        params: { apiKey, regions: "us", markets, oddsFormat: "american", dateFormat: "iso" },
        timeout: 12000,
      }
    );

    let response;
    let partialMarkets = false;
    try {
      response = await fetchOdds(PRIMARY_MARKETS);
    } catch (err) {
      const detail = err.response?.data?.message ?? err.message;
      const unsupportedH1 = /not supported by this endpoint/i.test(detail) && /h2h_h1|spreads_h1|totals_h1/i.test(detail);
      if (!unsupportedH1) throw err;
      console.warn(`  ⚠ Odds API fallback: ${detail}`);
      response = await fetchOdds(FALLBACK_MARKETS);
      partialMarkets = true;
    }

    const remaining = response.headers["x-requests-remaining"] ?? null;
    const used      = response.headers["x-requests-used"]      ?? null;
    const games     = response.data;

    const result = buildOddsPayload(games, {
      remaining,
      used,
      fetchedAt: new Date().toISOString(),
    });

    if (partialMarkets) result.partialMarkets = true;

    cache.set(cacheKey, result, TTL_MS);
    res.setHeader("X-Cache", "MISS");
    console.log(`  ✓ Odds cached  games=${games.length}  remaining=${remaining}`);
    return res.json(result);

  } catch (err) {
    const detail = err.response?.data?.message ?? err.message;
    console.error(`  ✗ Odds fetch failed: ${detail}`);
    return res.status(502).json({ error: "Odds API unavailable", detail });
  }
});

module.exports = router;

// Exported for slate-bundle aggregation.
// Returns the "Away|Home"-keyed odds map, fetching from Odds API if cache is cold.
// Non-fatal: returns null if ODDS_API_KEY is missing or the fetch fails.
module.exports.getOddsMap = async function getOddsMap() {
  const cacheKey = "odds:mlb:today";
  const hit = cache.get(cacheKey);
  if (hit) return hit.map ?? null;

  const dbPayload = await loadOddsPayloadFromDb();
  if (dbPayload) {
    cache.set(cacheKey, dbPayload, TTL_MS);
    return dbPayload.map ?? null;
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await axios.get(
      "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds",
      {
        params: { apiKey, regions: "us", markets: FALLBACK_MARKETS, oddsFormat: "american", dateFormat: "iso" },
        timeout: 12000,
      }
    );
    const result = buildOddsPayload(response.data, {
      remaining: response.headers["x-requests-remaining"] ?? null,
      used:      response.headers["x-requests-used"]      ?? null,
      fetchedAt: new Date().toISOString(),
    });
    cache.set(cacheKey, result, TTL_MS);
    return result.map ?? null;
  } catch {
    return null;
  }
};
