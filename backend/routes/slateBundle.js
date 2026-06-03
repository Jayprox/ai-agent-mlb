/**
 * GET /api/slate-bundle
 *
 * Aggregates schedule + odds + nrfi + weather into a single response so mobile
 * can render the Slate screen with one round-trip instead of 15–30.
 *
 * Response shape:
 *   {
 *     schedule:   Game[]                           — same as GET /api/schedule
 *     odds:       { map, eventIdMap, ... } | null  — same as GET /api/odds
 *     nrfiMap:    { [gamePk]: NrfiResult | null }
 *     weatherMap: { [gamePk]: RawWeatherData | null }
 *     fetchedAt:  string (ISO)
 *   }
 *
 * Bundle TTL: 5 minutes (driven by schedule freshness).
 * Each sub-component uses its own internal cache, so upstream API calls only
 * fire on cache misses.  Any individual component failure is non-fatal —
 * the partial bundle is returned with the failed component as null / {}.
 */

const express = require("express");
const axios   = require("axios");
const router  = express.Router();
const cache   = require("../services/cache");
const { buildSchedulePayloadForJob } = require("./schedule");
const { getNrfiForGame }             = require("./nrfi");
const { getOddsMap }                 = require("./odds");

const BUNDLE_TTL_MS  = 5  * 60 * 1000; // 5 min
const WEATHER_TTL_MS = 60 * 60 * 1000; // 1 hr — matches weather.js

// ── Stadium table ──────────────────────────────────────────────────────────
// lat/lon/tz used for weather; roof:true → dome, skip weather fetch.
const STADIUMS = {
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
  "Oakland Coliseum":          { lat: 37.7516,  lon: -122.2005, tz: "America/Los_Angeles", roof: false },
  "Sutter Health Park":        { lat: 38.5762,  lon: -121.5029, tz: "America/Los_Angeles", roof: false },
  "Nationals Park":            { lat: 38.8730,  lon: -77.0074,  tz: "America/New_York",    roof: false },
  "Citi Field":                { lat: 40.7571,  lon: -73.8458,  tz: "America/New_York",    roof: false },
};

// ── Weather helpers ────────────────────────────────────────────────────────
// Returns the local game hour at the stadium timezone.
function stadiumHour(gameTimeIso, tz) {
  try {
    const d = new Date(gameTimeIso);
    return parseInt(
      new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(d),
      10
    );
  } catch {
    return 19; // default evening
  }
}

// Fetches weather for all non-dome games; dome games receive null.
// Uses per-stadium cache (1 hr) matching weather.js.
async function fetchWeatherMap(schedule) {
  const weatherMap = {};
  const fetches    = [];

  for (const game of schedule) {
    const sd = STADIUMS[game.stadium];
    if (!sd) continue;
    if (sd.roof) {
      weatherMap[game.gamePk] = null; // dome — mobile uses its DOME_RESULT
      continue;
    }

    const cacheKey = `weather:${game.stadium}`;
    const cached   = cache.get(cacheKey);
    if (cached) {
      weatherMap[game.gamePk] = cached;
      continue;
    }

    const hour = game.gameTime ? stadiumHour(game.gameTime, sd.tz) : 19;
    const url  = [
      `https://api.open-meteo.com/v1/forecast`,
      `?latitude=${sd.lat}&longitude=${sd.lon}`,
      `&hourly=temperature_2m,windspeed_10m,winddirection_10m,weathercode,precipitation_probability,relativehumidity_2m`,
      `&wind_speed_unit=mph&temperature_unit=fahrenheit`,
      `&timezone=${encodeURIComponent(sd.tz)}&forecast_days=1`,
    ].join("");

    fetches.push(
      axios.get(url, { timeout: 8000 })
        .then(({ data }) => {
          const h  = data.hourly;
          const idx = h.time.findIndex(t => new Date(t).getHours() === hour);
          const i   = idx >= 0 ? idx : Math.min(hour, h.time.length - 1);
          const result = {
            temp:                      Math.round(h.temperature_2m[i]),
            windspeed:                 h.windspeed_10m[i],
            winddirection:             h.winddirection_10m[i],
            weathercode:               h.weathercode[i],
            precipitation_probability: h.precipitation_probability[i],
            relativehumidity:          h.relativehumidity_2m[i],
            fetchedAt:                 new Date().toISOString(),
          };
          cache.set(cacheKey, result, WEATHER_TTL_MS);
          weatherMap[game.gamePk] = result;
        })
        .catch(() => {
          weatherMap[game.gamePk] = null;
        })
    );
  }

  await Promise.allSettled(fetches);
  return weatherMap;
}

// ── GET /api/slate-bundle ─────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const date      = req.query.date
    ?? new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
  const cacheKey  = `slate-bundle:${date}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    // ── 1. Schedule (source of truth for gamePks) ───────────────────────
    const schedule = await buildSchedulePayloadForJob(date);

    // ── 2. Odds (cache-first, live fetch on cold start; non-fatal) ──────
    const oddsMap = await getOddsMap();

    // ── 3. NRFI + Weather in parallel (one call per game / stadium) ──────
    const [nrfiResults, weatherMap] = await Promise.all([
      Promise.allSettled(schedule.map(g => getNrfiForGame(g.gamePk))),
      fetchWeatherMap(schedule),
    ]);

    const nrfiMap = {};
    schedule.forEach((g, i) => {
      const r = nrfiResults[i];
      nrfiMap[g.gamePk] = r.status === "fulfilled" ? r.value : null;
    });

    const bundle = { schedule, oddsMap, nrfiMap, weatherMap, fetchedAt: new Date().toISOString() };
    cache.set(cacheKey, bundle, BUNDLE_TTL_MS);

    res.setHeader("X-Cache", "MISS");
    console.log(
      `  ✓ slate-bundle  games=${schedule.length}` +
      `  nrfi=${Object.values(nrfiMap).filter(Boolean).length}` +
      `  weather=${Object.values(weatherMap).filter(Boolean).length}` +
      `  odds=${oddsMap ? Object.keys(oddsMap).length + " games" : "cold"}`
    );
    return res.json(bundle);

  } catch (err) {
    console.error(`  ✗ slate-bundle failed: ${err.message}`);
    return res.status(502).json({ error: "slate-bundle unavailable", detail: err.message });
  }
});

module.exports = router;
