const express = require("express");
const router  = express.Router();
const axios   = require("axios");
const cache   = require("../services/cache");
const mlb     = require("../services/mlbApi");

const TTL          = 10 * 60 * 1000; // 10 minutes
const TARGET_BOOKS = ["draftkings", "fanduel"];

const MARKET_LABELS = {
  pitcher_strikeouts: "K",
  batter_total_bases: "TB",
  batter_hits:        "H",
};

// Match by last word of team name ("Red Sox" → "Sox") as fuzzy fallback
const lastWord = (str) => str.trim().split(/\s+/).pop();

// Format American odds integer → "+150" or "-110"
const fmtOdds = (n) => (n == null ? null : n > 0 ? `+${n}` : String(n));

// ── GET /api/player-props/:gamePk ──────────────────────────────────────────
router.get("/:gamePk", async (req, res) => {
  const { gamePk } = req.params;
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

    const awayName = mlbGame.teams.away.team.name; // e.g. "Atlanta Braves"
    const homeName = mlbGame.teams.home.team.name; // e.g. "Philadelphia Phillies"
    const awayLast = lastWord(awayName);
    const homeLast = lastWord(homeName);

    // ── Step 2: find matching Odds API event ─────────────────────────────
    const eventsRes = await axios.get(
      `https://api.the-odds-api.com/v4/sports/baseball_mlb/events?apiKey=${apiKey}&dateFormat=iso`,
      { timeout: 10000 }
    );

    const event = eventsRes.data.find(e =>
      (e.away_team === awayName   && e.home_team === homeName) ||
      (lastWord(e.away_team) === awayLast && lastWord(e.home_team) === homeLast)
    );

    if (!event) {
      console.log(`  · Player props: no Odds API event for ${awayName} @ ${homeName}`);
      const empty = { gamePk: parseInt(gamePk), props: [] };
      cache.set(cacheKey, empty, TTL);
      return res.json(empty);
    }

    console.log(`  → Player props  eventId=${event.id}  ${awayName} @ ${homeName}`);

    // ── Step 3: fetch player prop markets for this event ──────────────────
    const propsRes = await axios.get(
      `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/${event.id}/odds` +
      `?apiKey=${apiKey}` +
      `&markets=pitcher_strikeouts,batter_total_bases,batter_hits` +
      `&regions=us&oddsFormat=american` +
      `&bookmakers=${TARGET_BOOKS.join(",")}`,
      { timeout: 12000 }
    );

    // ── Step 4: parse outcomes into flat prop list ────────────────────────
    const props = [];
    const seen  = new Set(); // one line per player+market — prefer DK (first book)

    for (const book of (propsRes.data.bookmakers ?? [])) {
      for (const market of (book.markets ?? [])) {
        const marketLabel = MARKET_LABELS[market.key];
        if (!marketLabel) continue;

        // Group Over/Under by player name (outcome.description)
        const byPlayer = {};
        for (const outcome of (market.outcomes ?? [])) {
          const player = outcome.description || outcome.name;
          const side   = outcome.name.toLowerCase(); // "over" | "under"
          if (!byPlayer[player]) byPlayer[player] = {};
          byPlayer[player][side] = { price: outcome.price, point: outcome.point };
        }

        for (const [player, sides] of Object.entries(byPlayer)) {
          const dedupeKey = `${player}:${market.key}`;
          if (seen.has(dedupeKey)) continue; // first book wins
          seen.add(dedupeKey);

          const over  = sides["over"];
          const under = sides["under"];
          if (!over?.point) continue; // need at minimum the line + over side

          props.push({
            player,
            market:      market.key,
            marketLabel,
            line:        over.point,
            overOdds:    fmtOdds(over.price),
            underOdds:   fmtOdds(under?.price ?? null),
            book:        book.title,
          });
        }
      }
    }

    // Sort: pitcher K first, then TB, then H; within group alphabetical
    const ORDER = { pitcher_strikeouts: 0, batter_total_bases: 1, batter_hits: 2 };
    props.sort((a, b) =>
      (ORDER[a.market] ?? 9) - (ORDER[b.market] ?? 9) ||
      a.player.localeCompare(b.player)
    );

    const result = { gamePk: parseInt(gamePk), props };
    cache.set(cacheKey, result, TTL);
    res.setHeader("X-Cache", "MISS");
    console.log(`  ✓ Player props cached  gamePk=${gamePk} count=${props.length}`);
    res.json(result);

  } catch (err) {
    console.error(`  ✗ Player props failed  gamePk=${gamePk}: ${err.message}`);
    res.status(502).json({ error: "Player props unavailable", detail: err.message });
  }
});

module.exports = router;
