const express = require("express");
const router  = express.Router();
const axios   = require("axios");
const cache   = require("../services/cache");

const TTL_MS = 20 * 60 * 1000; // 20-minute shared server cache

const TARGET_BOOKS = [
  { key: "draftkings",     label: "DK"  },
  { key: "fanduel",        label: "FD"  },
  { key: "williamhill_us", label: "CZR" },
  { key: "betmgm",         label: "MGM" },
];

const fmtPrice = (p) => (p == null ? null : p > 0 ? `+${p}` : String(p));

const extractBook = (bk, awayTeam) => {
  let awayML = null, homeML = null, total = null, overOdds = null, underOdds = null,
      f5Total = null, awaySpread = null, awaySpreadOdds = null, homeSpread = null, homeSpreadOdds = null;

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

  const spreads = bk.markets.find(m => m.key === "spreads");
  if (spreads) {
    const awayOut = spreads.outcomes.find(o => o.name === awayTeam);
    const homeOut = spreads.outcomes.find(o => o.name !== awayTeam);
    if (awayOut) { awaySpread = awayOut.point >= 0 ? `+${awayOut.point}` : `${awayOut.point}`; awaySpreadOdds = fmtPrice(awayOut.price); }
    if (homeOut) { homeSpread = homeOut.point >= 0 ? `+${homeOut.point}` : `${homeOut.point}`; homeSpreadOdds = fmtPrice(homeOut.price); }
  }

  return { awayML, homeML, total, overOdds, underOdds, f5Total, awaySpread, awaySpreadOdds, homeSpread, homeSpreadOdds };
};

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

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "ODDS_API_KEY not configured" });

  try {
    const response = await axios.get(
      `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds`,
      {
        params: { apiKey, regions: "us", markets: "h2h,totals,spreads", oddsFormat: "american", dateFormat: "iso" },
        timeout: 12000,
      }
    );

    const remaining = response.headers["x-requests-remaining"] ?? null;
    const used      = response.headers["x-requests-used"]      ?? null;
    const games     = response.data;

    const map        = {};
    const eventIdMap = {};

    games.forEach(g => {
      const key = `${g.away_team}|${g.home_team}`;
      eventIdMap[key] = g.id;

      const books = {};
      TARGET_BOOKS.forEach(({ key: bKey, label }) => {
        const bk = g.bookmakers.find(b => b.key === bKey);
        if (bk) books[label] = extractBook(bk, g.away_team);
      });

      const primaryBk = TARGET_BOOKS.map(t => g.bookmakers.find(b => b.key === t.key)).find(Boolean)
                        ?? g.bookmakers[0];
      if (!primaryBk) return;

      const primary      = extractBook(primaryBk, g.away_team);
      const primaryLabel = TARGET_BOOKS.find(t => t.key === primaryBk.key)?.label ?? primaryBk.title;
      map[key] = { ...primary, book: primaryLabel, books };
    });

    const result = {
      map,
      eventIdMap,
      remaining,
      used,
      fetchedAt: new Date().toLocaleTimeString(),
    };

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
