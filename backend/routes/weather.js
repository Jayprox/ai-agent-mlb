const express = require("express");
const router  = express.Router();
const axios   = require("axios");
const cache   = require("../services/cache");

const TTL_MS = 60 * 60 * 1000; // 1 hour — weather doesn't change faster than this

// ── GET /api/weather ──────────────────────────────────────────────────────
// Proxy for Open-Meteo. Accepts lat/lon/tz/hour query params.
// key param is used as the cache key (stadiumName recommended).
// Returns the raw hourly slice for the requested hour so the frontend
// can do its own wind-direction interpretation and HR-favorable logic.
//
// Query params:
//   lat    — stadium latitude
//   lon    — stadium longitude
//   tz     — IANA timezone (e.g. "America/New_York")
//   hour   — target hour (0-23) in local stadium time
//   key    — cache key, e.g. "Citizens Bank Park"
//
// Response:
//   { temp, windspeed, winddirection, weathercode, precipitation_probability,
//     relativehumidity, fetchedAt, cached: bool }
router.get("/", async (req, res) => {
  const { lat, lon, tz, hour, key } = req.query;

  if (!lat || !lon || !tz) {
    return res.status(400).json({ error: "lat, lon, tz are required" });
  }

  const cacheKey = `weather:${key ?? `${lat},${lon}`}`;
  const cached   = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json({ ...cached, cached: true });
  }

  const url = [
    `https://api.open-meteo.com/v1/forecast`,
    `?latitude=${lat}&longitude=${lon}`,
    `&hourly=temperature_2m,windspeed_10m,winddirection_10m,weathercode,precipitation_probability,relativehumidity_2m`,
    `&wind_speed_unit=mph&temperature_unit=fahrenheit`,
    `&timezone=${encodeURIComponent(tz)}&forecast_days=1`,
  ].join("");

  try {
    const response = await axios.get(url, { timeout: 8000 });
    const h        = response.data.hourly;
    const targetHr = parseInt(hour ?? 0, 10);

    // Find the index matching the requested hour
    const idx = h.time.findIndex(t => new Date(t).getHours() === targetHr);
    const i   = idx >= 0 ? idx : Math.min(targetHr, h.time.length - 1);

    const result = {
      temp:                    Math.round(h.temperature_2m[i]),
      windspeed:               h.windspeed_10m[i],
      winddirection:           h.winddirection_10m[i],
      weathercode:             h.weathercode[i],
      precipitation_probability: h.precipitation_probability[i],
      relativehumidity:        h.relativehumidity_2m[i],
      fetchedAt:               new Date().toLocaleTimeString(),
    };

    cache.set(cacheKey, result, TTL_MS);
    res.setHeader("X-Cache", "MISS");
    console.log(`  ✓ Weather cached  key=${key ?? `${lat},${lon}`}  temp=${result.temp}°F  wind=${result.windspeed}mph`);
    return res.json({ ...result, cached: false });

  } catch (err) {
    const detail = err.response?.data?.reason ?? err.message;
    console.error(`  ✗ Weather fetch failed  key=${key}: ${detail}`);
    return res.status(502).json({ error: "Weather unavailable", detail });
  }
});

module.exports = router;
