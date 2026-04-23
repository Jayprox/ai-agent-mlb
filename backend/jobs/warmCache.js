/**
 * warmCache.js — Pre-warming job for the in-memory cache.
 *
 * Fires internal GET requests to our own backend routes so every game on
 * today's slate is fully cached before any user opens the app.
 * Uses Promise.allSettled so a single failed endpoint never blocks the rest.
 *
 * Called:
 *  - Once on server startup (5-second delay to let the server bind first)
 *  - Every 2 hours via the cron scheduler during the game day
 *  - Manually via GET /api/admin/warm-cache (admin secret required)
 */

const axios  = require("axios");
const cache  = require("../services/cache");
const { buildSchedulePayloadForJob } = require("../routes/schedule");

// Stadium coords for weather pre-warming — mirrors frontend STADIUMS constant
const STADIUMS = {
  "Citizens Bank Park":        { lat: 39.9061,  lon: -75.1665,  tz: "America/New_York",    roof: false },
  "Dodger Stadium":            { lat: 34.0739,  lon: -118.2400, tz: "America/Los_Angeles",  roof: false },
  "Globe Life Field":          { lat: 32.7473,  lon: -97.0832,  tz: "America/Chicago",      roof: true  },
  "American Family Field":     { lat: 43.0280,  lon: -87.9712,  tz: "America/Chicago",      roof: false },
  "Oracle Park":               { lat: 37.7786,  lon: -122.3893, tz: "America/Los_Angeles",  roof: false },
  "Rogers Centre":             { lat: 43.6414,  lon: -79.3894,  tz: "America/Toronto",      roof: true  },
  "Yankee Stadium":            { lat: 40.8296,  lon: -73.9262,  tz: "America/New_York",     roof: false },
  "Fenway Park":               { lat: 42.3467,  lon: -71.0972,  tz: "America/New_York",     roof: false },
  "Wrigley Field":             { lat: 41.9484,  lon: -87.6553,  tz: "America/Chicago",      roof: false },
  "Busch Stadium":             { lat: 38.6226,  lon: -90.1928,  tz: "America/Chicago",      roof: false },
  "T-Mobile Park":             { lat: 47.5914,  lon: -122.3325, tz: "America/Los_Angeles",  roof: false },
  "Camden Yards":              { lat: 39.2838,  lon: -76.6218,  tz: "America/New_York",     roof: false },
  "Petco Park":                { lat: 32.7076,  lon: -117.1570, tz: "America/Los_Angeles",  roof: false },
  "Truist Park":               { lat: 33.8907,  lon: -84.4677,  tz: "America/New_York",     roof: false },
  "Great American Ball Park":  { lat: 39.0979,  lon: -84.5082,  tz: "America/New_York",     roof: false },
  "loanDepot park":            { lat: 25.7781,  lon: -80.2197,  tz: "America/New_York",     roof: true  },
  "Minute Maid Park":          { lat: 29.7572,  lon: -95.3555,  tz: "America/Chicago",      roof: true  },
  "Tropicana Field":           { lat: 27.7683,  lon: -82.6534,  tz: "America/New_York",     roof: true  },
  "Chase Field":               { lat: 33.4453,  lon: -112.0667, tz: "America/Phoenix",      roof: true  },
  "Coors Field":               { lat: 39.7559,  lon: -104.9942, tz: "America/Denver",       roof: false },
  "PNC Park":                  { lat: 40.4469,  lon: -80.0057,  tz: "America/New_York",     roof: false },
  "Target Field":              { lat: 44.9817,  lon: -93.2778,  tz: "America/Chicago",      roof: false },
  "Kauffman Stadium":          { lat: 39.0517,  lon: -94.4803,  tz: "America/Chicago",      roof: false },
  "Progressive Field":         { lat: 41.4962,  lon: -81.6852,  tz: "America/New_York",     roof: false },
  "Comerica Park":             { lat: 42.3390,  lon: -83.0485,  tz: "America/New_York",     roof: false },
  "Guaranteed Rate Field":     { lat: 41.8299,  lon: -87.6338,  tz: "America/Chicago",      roof: false },
  "Angel Stadium":             { lat: 33.8003,  lon: -117.8827, tz: "America/Los_Angeles",  roof: false },
  "Oakland Coliseum":          { lat: 37.7516,  lon: -122.2005, tz: "America/Los_Angeles",  roof: false },
  "Sutter Health Park":        { lat: 38.5762,  lon: -121.5029, tz: "America/Los_Angeles",  roof: false },
  "Nationals Park":            { lat: 38.8730,  lon: -77.0074,  tz: "America/New_York",     roof: false },
  "Citi Field":                { lat: 40.7571,  lon: -73.8458,  tz: "America/New_York",     roof: false },
};

// Parse game time string to local hour (e.g. "7:08 PM ET" → 19)
function gameTimeToHour(timeStr, tz) {
  try {
    const now     = new Date();
    const dateStr = now.toLocaleDateString("en-CA", { timeZone: tz });
    const clean   = timeStr.replace(/ [A-Z]{2,3}$/, "");
    const d       = new Date(`${dateStr} ${clean}`);
    return isNaN(d) ? now.getHours() : new Date(d.toLocaleString("en-US", { timeZone: tz })).getHours();
  } catch {
    return new Date().getHours();
  }
}

// Fire a single internal GET, swallow errors — a failed warm is not fatal
async function hit(base, path) {
  try {
    await axios.get(`${base}${path}`, { timeout: 12000 });
  } catch {
    // Silently skip — cache miss is fine, user will trigger a fresh fetch
  }
}

// Build the list of URLs to warm for one game
function urlsForGame(game, base) {
  const { gamePk, probablePitchers, stadium, time } = game;
  const pitchers = [probablePitchers?.away, probablePitchers?.home].filter(p => p?.id);
  const urls = [];

  // Per-game endpoints
  urls.push(
    `/api/lineups/${gamePk}`,
    `/api/umpires/${gamePk}`,
    `/api/nrfi/${gamePk}`,
    `/api/bullpen/${gamePk}`,
  );

  // Weather — skip domes and unknown stadiums
  const sd = STADIUMS[stadium];
  if (sd && !sd.roof) {
    const hour = gameTimeToHour(time ?? "", sd.tz);
    urls.push(
      `/api/weather?lat=${sd.lat}&lon=${sd.lon}&tz=${encodeURIComponent(sd.tz)}&hour=${hour}&key=${encodeURIComponent(stadium)}`
    );
  }

  // Per-pitcher endpoints
  for (const p of pitchers) {
    urls.push(
      `/api/players/${p.id}/stats?group=pitching`,
      `/api/players/${p.id}/gamelog?group=pitching`,
      `/api/arsenal/${p.id}`,
      `/api/pitcher-splits/${p.id}`,
    );
  }

  return urls;
}

async function warmCache() {
  const PORT = process.env.PORT ?? 3001;
  const base = `http://localhost:${PORT}`;

  console.log("\n  → warmCache: starting pre-warm…");
  const t0 = Date.now();

  try {
    const date  = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    const games = await buildSchedulePayloadForJob(date);

    if (!games.length) {
      console.log("  · warmCache: no games today, skipping");
      return;
    }

    // Warm shared endpoints first (single call covers all games)
    await hit(base, "/api/injuries");
    await hit(base, "/api/odds");

    // Warm per-game endpoints — run games in parallel, 4 at a time
    const CHUNK = 4;
    for (let i = 0; i < games.length; i += CHUNK) {
      const chunk = games.slice(i, i + CHUNK);
      await Promise.allSettled(
        chunk.flatMap(game =>
          urlsForGame(game, base).map(url => hit(base, url))
        )
      );
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const cacheStats = cache.stats();
    console.log(`  ✓ warmCache complete  games=${games.length}  elapsed=${elapsed}s  cached=${cacheStats.size ?? "?"} keys`);

  } catch (err) {
    console.error(`  ✗ warmCache failed: ${err.message}`);
  }
}

module.exports = { warmCache };
