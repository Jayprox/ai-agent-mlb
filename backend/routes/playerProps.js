const express = require("express");
const router  = express.Router();
const axios   = require("axios");
const cache   = require("../services/cache");
const mlb     = require("../services/mlbApi");

const TTL          = 10 * 60 * 1000; // 10 minutes
const TARGET_BOOKS = [
  { key: "draftkings",     label: "DK"  },
  { key: "fanduel",        label: "FD"  },
  { key: "williamhill_us", label: "CZR" },
  { key: "betmgm",         label: "MGM" },
  { key: "bovada",         label: "BOV" },
];

const MARKET_LABELS = {
  pitcher_strikeouts: "K",
  batter_total_bases: "TB",
  batter_hits:        "H",
  batter_home_runs:   "HR",
};

// Match by last word of team name ("Red Sox" → "Sox") as fuzzy fallback
const lastWord = (str) => str.trim().split(/\s+/).pop();

// Format American odds integer → "+150" or "-110"
const fmtOdds = (n) => (n == null ? null : n > 0 ? `+${n}` : String(n));

// ── GET /api/player-props/:gamePk?eventId=xxx ────────────────────────────
// Returns player prop lines from DK, FD, CZR, MGM, BOV for a given game.
// Each prop includes a `books` object with per-book line + odds.
// Optional ?eventId= skips the events-list fetch when the caller already
// has the Odds API event ID (e.g. from /api/odds eventIdMap).
// Shared server-side cache (10 min).
router.get("/:gamePk", async (req, res) => {
  const { gamePk }  = req.params;
  const eventIdHint = req.query.eventId ?? null;
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "ODDS_API_KEY not configured" });

  const cacheKey = `player-props:${gamePk}`;
  const cached   = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    // ── Step 1: resolve team names from MLB schedule ──────────────────────
    const schedRes = await mlb.get(`/schedule?gamePks=${gamePk}&hydrate=team`);
    const mlbGame  = schedRes.data.dates?.[0]?.games?.[0];
    if (!mlbGame) return res.status(404).json({ error: "Game not found" });

    const awayName = mlbGame.teams.away.team.name;
    const homeName = mlbGame.teams.home.team.name;
    const awayLast = lastWord(awayName);
    const homeLast = lastWord(homeName);

    // ── Step 2: resolve Odds API event ID ────────────────────────────────
    let eventId = eventIdHint;
    if (!eventId) {
      const eventsRes = await axios.get(
        `https://api.the-odds-api.com/v4/sports/baseball_mlb/events?apiKey=${apiKey}&dateFormat=iso`,
        { timeout: 10000 }
      );
      const event = eventsRes.data.find(e =>
        (e.away_team === awayName   && e.home_team === homeName) ||
        (lastWord(e.away_team) === awayLast && lastWord(e.home_team) === homeLast)
      );
      eventId = event?.id ?? null;
    }

    if (!eventId) {
      console.log(`  · Player props: no Odds API event for ${awayName} @ ${homeName}`);
      const empty = { gamePk: parseInt(gamePk), props: [], reason: "no_event" };
      // Cache briefly (2 min) so rapid refreshes don't hammer the API, but a manual
      // retry after a few minutes will pick up the event once books post it
      cache.set(cacheKey, empty, 2 * 60 * 1000);
      return res.json(empty);
    }

    console.log(`  → Player props  eventId=${eventId}  ${awayName} @ ${homeName}`);

    // ── Step 3: fetch player prop markets for all 4 books ─────────────────
    const bookKeys = TARGET_BOOKS.map(b => b.key).join(",");
    const propsRes = await axios.get(
      `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/${eventId}/odds` +
      `?apiKey=${apiKey}` +
      `&markets=pitcher_strikeouts,batter_total_bases,batter_hits,batter_home_runs` +
      `&regions=us&oddsFormat=american` +
      `&bookmakers=${bookKeys}`,
      { timeout: 12000 }
    );

    // ── Step 4: collect per-book odds for every player+market ─────────────
    // Structure: propMap[player][market] = { books: { DK: {line,over,under}, ... } }
    const propMap = {};

    for (const book of (propsRes.data.bookmakers ?? [])) {
      const bookLabel = TARGET_BOOKS.find(b => b.key === book.key)?.label ?? book.title;

      for (const market of (book.markets ?? [])) {
        const marketLabel = MARKET_LABELS[market.key];
        if (!marketLabel) continue;

        // Group Over/Under by player name
        const byPlayer = {};
        for (const outcome of (market.outcomes ?? [])) {
          const player = outcome.description || outcome.name;
          const side   = outcome.name.toLowerCase(); // "over" | "under"
          if (!byPlayer[player]) byPlayer[player] = {};
          byPlayer[player][side] = { price: outcome.price, point: outcome.point };
        }

        for (const [player, sides] of Object.entries(byPlayer)) {
          const over  = sides["over"];
          const under = sides["under"];
          if (!over?.point) continue;

          if (!propMap[player])              propMap[player] = {};
          if (!propMap[player][market.key])  propMap[player][market.key] = { books: {} };

          propMap[player][market.key].books[bookLabel] = {
            line:      over.point,
            overOdds:  fmtOdds(over.price),
            underOdds: fmtOdds(under?.price ?? null),
          };
        }
      }
    }

    // ── Step 5: flatten into sorted prop list ─────────────────────────────
    // Each entry: { player, market, marketLabel, books: { DK, FD, CZR, MGM },
    //               bestLine, bestOverOdds, bestUnderOdds, book (best book label)
    //               books: { DK, FD, CZR, MGM, BOV } }
    const props = [];
    for (const [player, markets] of Object.entries(propMap)) {
      for (const [marketKey, data] of Object.entries(markets)) {
        const bookEntries = Object.entries(data.books);
        if (bookEntries.length === 0) continue;

        // Best line = lowest line available (most favorable for over bettors)
        // Best odds = best over odds among books at that lowest line
        const lines = bookEntries.map(([, b]) => b.line);
        const bestLine = Math.min(...lines);

        // Among books at the best line, pick best over odds
        const bestBookEntry = bookEntries
          .filter(([, b]) => b.line === bestLine)
          .sort((a, b) => (parseInt(b[1].overOdds) || -200) - (parseInt(a[1].overOdds) || -200))[0];

        props.push({
          player,
          market:       marketKey,
          marketLabel:  MARKET_LABELS[marketKey],
          books:        data.books,
          // Convenience fields for backward-compat with existing UI
          line:         bestLine,
          overOdds:     bestBookEntry?.[1]?.overOdds  ?? null,
          underOdds:    bestBookEntry?.[1]?.underOdds ?? null,
          book:         bestBookEntry?.[0] ?? null,
        });
      }
    }

    // Sort: K first, then HR, then TB, then H; within group alphabetical
    const ORDER = {
      pitcher_strikeouts: 0,
      batter_home_runs:   1,
      batter_total_bases: 2,
      batter_hits:        3,
    };
    props.sort((a, b) =>
      (ORDER[a.market] ?? 9) - (ORDER[b.market] ?? 9) ||
      a.player.localeCompare(b.player)
    );

    const reason  = props.length > 0 ? "ok" : "no_props";
    // Cache empty results for only 2 min so a Refresh actually retries
    const cacheTTL = props.length > 0 ? TTL : 2 * 60 * 1000;
    const result = { gamePk: parseInt(gamePk), props, reason };
    cache.set(cacheKey, result, cacheTTL);
    res.setHeader("X-Cache", "MISS");
    console.log(`  ✓ Player props cached  gamePk=${gamePk}  count=${props.length}  reason=${reason}  books=${TARGET_BOOKS.map(b=>b.label).join("/")}`);
    res.json(result);

  } catch (err) {
    console.error(`  ✗ Player props failed  gamePk=${gamePk}: ${err.message}`);
    res.status(502).json({ error: "Player props unavailable", detail: err.message });
  }
});

module.exports = router;
