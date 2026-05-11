# CODEX TASK 111 — Deduplicate Weather Calls (16 parallel → 1 batch)

## Problem

On every slate load, each game's weather is fetched independently. The frontend calls `fetchWeather(sg.gamePk, sg.stadium, sg.time, ...)` once per game inside a `liveSlate.forEach` loop (around line 4347–4350). With 15 games loading simultaneously, this fires **15–16 parallel `GET /api/weather` requests** in the first 6 seconds.

The backend `weather.js` route already caches per stadium (1-hour TTL). But on cold start, all 15 stadiums miss cache simultaneously → 15 parallel Open-Meteo API calls, hammering the external API and saturating the 6-connection browser limit.

---

## Architecture

**Backend** handles batching and caching. Frontend makes **one call** per slate load and receives all weather results.

- Backend: add `POST /api/weather/batch` to `backend/routes/weather.js`
- Frontend: replace the per-game `fetchWeather` forEach with a single batch call, distribute results into `liveWeather` state

The backend in-memory cache (`cache.get/set`) is the shared store — if stadium A's weather is already cached from a previous user, the batch endpoint returns it instantly from cache. No DB write needed; the existing `cache` service handles it.

---

## Part A — Backend: Add `/api/weather/batch` to `backend/routes/weather.js`

Add this new route **before** `module.exports = router;` at the bottom of the file:

```js
// ── POST /api/weather/batch ───────────────────────────────────────────────
// Accepts an array of game weather requests. Returns { [gamePk]: weatherData }
// Uses the same per-stadium cache as GET /api/weather.
//
// Body: [ { gamePk, lat, lon, tz, hour, key } ]
router.post("/batch", async (req, res) => {
  const games = req.body;
  if (!Array.isArray(games) || games.length === 0) {
    return res.status(400).json({ error: "Body must be a non-empty array" });
  }

  const results = await Promise.allSettled(
    games.map(async ({ gamePk, lat, lon, tz, hour, key }) => {
      const cacheKey = `weather:${key ?? `${lat},${lon}`}`;
      const cached   = cache.get(cacheKey);
      if (cached) return { gamePk, data: cached };

      const url = [
        `https://api.open-meteo.com/v1/forecast`,
        `?latitude=${lat}&longitude=${lon}`,
        `&hourly=temperature_2m,windspeed_10m,winddirection_10m,weathercode,precipitation_probability,relativehumidity_2m`,
        `&wind_speed_unit=mph&temperature_unit=fahrenheit`,
        `&timezone=${encodeURIComponent(tz)}&forecast_days=1`,
      ].join("");

      const response = await axios.get(url, { timeout: 8000 });
      const h        = response.data.hourly;
      const targetHr = parseInt(hour ?? 0, 10);
      const idx      = h.time.findIndex(t => new Date(t).getHours() === targetHr);
      const i        = idx >= 0 ? idx : Math.min(targetHr, h.time.length - 1);

      const data = {
        temp:                      Math.round(h.temperature_2m[i]),
        windspeed:                 h.windspeed_10m[i],
        winddirection:             h.winddirection_10m[i],
        weathercode:               h.weathercode[i],
        precipitation_probability: h.precipitation_probability[i],
        relativehumidity:          h.relativehumidity_2m[i],
        fetchedAt:                 new Date().toLocaleTimeString(),
      };

      cache.set(cacheKey, data, TTL_MS);
      console.log(`  ✓ Weather cached  key=${key ?? `${lat},${lon}`}  temp=${data.temp}°F  wind=${data.windspeed}mph`);
      return { gamePk, data };
    })
  );

  const output = {};
  results.forEach((r, i) => {
    const gamePk = games[i].gamePk;
    output[gamePk] = r.status === "fulfilled" ? r.value.data : null;
  });

  return res.json(output);
});
```

---

## Part B — Frontend: Replace per-game fetches with one batch call

### Current code (around line 4346–4351 in the `liveSlate` useEffect):

```js
      // Weather — fetchWeather handles domes internally (no API call, returns roof:true immediately)
      if (!liveWeather[sg.gamePk]) {
        fetchWeather(sg.gamePk, sg.stadium, sg.time, SLATE[0].weather)
          .then(data => setLiveWeather(prev => ({ ...prev, [sg.gamePk]: data })))
          .catch(() => {});
      }
```

### Replace the entire weather block with a batch fetch

Remove the `if (!liveWeather[sg.gamePk]) { fetchWeather(...) }` block from the `forEach` loop entirely.

After the `liveSlate.forEach(sg => { ... })` loop closes (before `}, [liveSlate])`), add the following batch weather fetch:

```js
    // Weather batch — one call for all games missing weather
    const weatherNeeded = liveSlate.filter(sg => {
      if (liveWeather[sg.gamePk]) return false; // already fetched
      const stadium = STADIUMS[sg.stadium];
      if (!stadium || stadium.roof) {
        // Dome — set immediately, no fetch needed
        setLiveWeather(prev => ({
          ...prev,
          [sg.gamePk]: { condition: "Dome", wind: "N/A", humidity: "N/A", rainChance: "N/A", roof: true, hrFavorable: false, live: false },
        }));
        return false;
      }
      return true;
    });

    if (weatherNeeded.length > 0 && !IS_SANDBOX) {
      const parseHour = (timeStr, tz) => {
        try {
          const now     = new Date();
          const dateStr = now.toLocaleDateString("en-CA", { timeZone: tz });
          const clean   = timeStr.replace(/ [A-Z]{2,3}$/, "");
          const d       = new Date(`${dateStr} ${clean}`);
          return isNaN(d) ? now : d;
        } catch { return new Date(); }
      };

      const payload = weatherNeeded.map(sg => {
        const stadium = STADIUMS[sg.stadium];
        return {
          gamePk: sg.gamePk,
          lat:    stadium.lat,
          lon:    stadium.lon,
          tz:     stadium.tz,
          hour:   parseHour(sg.time, stadium.tz).getHours(),
          key:    sg.stadium,
        };
      });

      fetch(`${API_BASE}/api/weather/batch`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      })
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(batchResult => {
          const updates = {};
          weatherNeeded.forEach(sg => {
            const w = batchResult[sg.gamePk];
            if (!w) return;
            const stadium = STADIUMS[sg.stadium];
            updates[sg.gamePk] = {
              temp:        w.temp,
              condition:   WMO_CODES[w.weathercode] ?? "Unknown",
              wind:        windDescription(w.winddirection, w.windspeed, stadium.orientation),
              humidity:    `${Math.round(w.relativehumidity)}%`,
              rainChance:  `${w.precipitation_probability}%`,
              roof:        false,
              hrFavorable: isHrFavorable(w.winddirection, w.windspeed, stadium.orientation, w.temp),
              live:        true,
              fetchedAt:   w.fetchedAt,
            };
          });
          setLiveWeather(prev => ({ ...prev, ...updates }));
        })
        .catch(() => {
          // Fallback — set non-live placeholder so cards don't stay blank
          const fallbacks = {};
          weatherNeeded.forEach(sg => {
            fallbacks[sg.gamePk] = { condition: "Unavailable", wind: "N/A", humidity: "N/A", rainChance: "N/A", roof: false, hrFavorable: false, live: false };
          });
          setLiveWeather(prev => ({ ...prev, ...fallbacks }));
        });
    }
```

---

## What does NOT change

- The standalone `fetchWeather` function (still used for the single-game view — line ~3698: `fetchWeather(selectedId, ...)`)
- The `weatherCache` client-side in-memory cache — still valid for single-game fetches
- The existing `GET /api/weather` route — unchanged, still works for single calls
- All weather display logic (`windDescription`, `isHrFavorable`, `WMO_CODES`) — unchanged

---

## Notes

- The `STADIUMS` object on the frontend is the source of `lat`, `lon`, `tz`, `orientation` — the batch payload is built from it.
- `IS_SANDBOX` check: sandbox mode already returns mock data synchronously via `fetchWeather`. The batch path is only taken in live mode.
- Dome detection is handled on the frontend before building the payload — domes are set immediately without hitting the API (same as before).
- On cold start, 15 Open-Meteo fetches still happen, but they go through the backend in a single coordinated `Promise.allSettled` call rather than 15 simultaneous browser requests. On warm cache (within 1hr), the batch endpoint returns all 15 stadiums from cache instantly.

---

## Validation checklist

1. `npm run build` passes
2. Slate loads and weather badges appear on all game cards (temp, wind, rain chance)
3. Browser DevTools Network: only **1 POST `/api/weather/batch`** fires on Slate load, not 15 GETs
4. Dome stadiums (Tropicana Field, Globe Life Field, etc.) show "Dome" immediately, no API call
5. Switching from Slate back to Slate again: weather already in state, no new batch call
6. Single game view still fetches weather correctly (uses the existing `fetchWeather` path)

## After completing

Reply "Task 111 complete" with a brief summary of what was changed.
