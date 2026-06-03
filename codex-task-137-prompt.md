# CODEX TASK 137 — Mobile Phase 1: Board Scoring Parity

## Goal

Close the three data gaps that cause iOS board scores to differ from the web app.
After this task, `computePitcherBoard`, `computeBatterBoard`, and `computeGameBoard`
will receive the same inputs on mobile as they do on web, producing identical scores
on both platforms.

**No backend changes needed.** All three endpoints already exist. This is purely
mobile-side wiring in `useBoardData` plus moving shared weather helpers into `src/`.

---

## Background: why scores diverge today

`useBoardData` passes three hardcoded empty values to the scoring functions:

```ts
liveWeather:    {}   // ← POST /api/weather/batch exists, never called
liveStatSplits: {}   // ← GET  /api/stat-splits/:id exists, never called
pitcherArsenal: {}   // ← GET  /api/arsenal/:pitcherId exists, already used
                     //   in Game → Arsenal tab, just not passed to board
```

Each gap silences a real scoring signal:
- **Weather** affects `computeGameBoard` totals, NRFI lean, and park HR factor
- **Stat splits** feed batter vs L/R matchup adjustment in `computeBatterBoard`
- **Arsenal** provides `swStrPct` and `chasePct` to `computePitcherBoard` K model

---

## Background: endpoint shapes

### `POST /api/weather/batch`

Request body:
```json
[
  { "gamePk": 12345, "lat": 40.8296, "lon": -73.9262,
    "tz": "America/New_York", "hour": 19, "key": "Yankee Stadium" }
]
```

Response: `{ [gamePk]: { temp, windspeed, winddirection, weathercode, precipitation_probability, relativehumidity } }`

Dome stadiums (roof: true in STADIUMS) must NOT be included in the request body —
set a hardcoded dome result for them immediately instead.

### `GET /api/stat-splits/:playerId?group=pitching|hitting`

Response:
```json
{
  "home": { "avg": ".285", "ops": ".812", ... },
  "away": { "avg": ".271", "ops": ".741", ... },
  "vsLeft": { "avg": ".301", ... },
  "vsRight": { "avg": ".268", ... },
  "day": { ... },
  "night": { ... }
}
```

The `liveStatSplits` map key format is `"${playerId}:pitching"` or `"${playerId}:hitting"`.

### `GET /api/arsenal/:pitcherId`

Response:
```json
{
  "pitcherId": 592450,
  "season": 2026,
  "arsenal": [...],
  "pitcherStats": {
    "swStrPct": 13.2,
    "chasePct": 31.4,
    "fStrikePct": 62.1
  }
}
```

`computePitcherBoard` consumes `pitcherArsenal[pitcherId].pitcherStats`.

---

## What to build

### 1. Move weather helpers to `src/utils.ts`

The web app has `isHrFavorable`, `windDescription`, and `WMO_CODES` defined inline in
`prop-scout-v7.jsx`. Move them (or re-implement identically) into `src/utils.ts` so
mobile can import them without duplicating logic.

**`WMO_CODES`** — maps numeric weather codes to text strings:
```ts
export const WMO_CODES: Record<number, string> = {
  0: "Clear", 1: "Mainly Clear", 2: "Partly Cloudy", 3: "Overcast",
  45: "Foggy", 48: "Icy Fog", 51: "Light Drizzle", 53: "Drizzle",
  55: "Heavy Drizzle", 61: "Light Rain", 63: "Rain", 65: "Heavy Rain",
  71: "Light Snow", 73: "Snow", 75: "Heavy Snow", 80: "Rain Showers",
  81: "Rain Showers", 82: "Violent Rain", 95: "Thunderstorm", 99: "Thunderstorm",
};
```

**`windDescription(direction, speed, stadiumOrientation)`**:
- Returns a string like `"Out to CF 12 mph"` or `"In from LF 8 mph"`
- Logic: calculate relative angle of wind vs stadium orientation, map to compass label

**`isHrFavorable(direction, speed, stadiumOrientation, temp)`**:
- Returns `boolean` — true when wind is blowing OUT at ≥ 8 mph OR temp ≥ 85°F
- Same thresholds as web

Reference `prop-scout-v7.jsx` for the exact logic of both functions — copy it
exactly so the output strings match web.

---

### 2. Wire weather into `useBoardData`

**File:** `mobile/src/hooks/useBoardData.ts`

After the main enrichment completes (all per-game parallel fetches done), add a
weather fetch step:

```ts
// ── Weather batch ──────────────────────────────────────────────────────────
const weatherMap: Record<number, WeatherResult> = {};

const DOME_RESULT: WeatherResult = {
  condition: "Dome", wind: "N/A", humidity: "N/A",
  rainChance: "N/A", roof: true, hrFavorable: false, live: false,
};

const gamesNeedingWeather: WeatherBatchItem[] = [];

for (const game of activeSlate) {
  const stadiumInfo = STADIUMS[game.stadium ?? ""];
  if (!stadiumInfo) continue;
  if (stadiumInfo.roof) {
    weatherMap[game.gamePk] = DOME_RESULT;
    continue;
  }
  const gameHour = game.gameTime
    ? new Date(game.gameTime).getHours()
    : 19; // default evening
  gamesNeedingWeather.push({
    gamePk: game.gamePk,
    lat: stadiumInfo.lat,
    lon: stadiumInfo.lon,
    tz: stadiumInfo.tz,
    hour: gameHour,
    key: game.stadium,
  });
}

if (gamesNeedingWeather.length > 0) {
  try {
    const raw = await apiRequest<Record<number, RawWeatherData>>(
      "/api/weather/batch",
      { method: "POST", body: JSON.stringify(gamesNeedingWeather) }
    );
    for (const game of gamesNeedingWeather) {
      const w = raw[game.gamePk];
      if (!w) continue;
      const stadiumInfo = STADIUMS[game.stadium ?? ""]!;
      weatherMap[game.gamePk] = {
        temp: w.temp,
        condition: WMO_CODES[w.weathercode] ?? "Unknown",
        wind: windDescription(w.winddirection, w.windspeed, stadiumInfo.orientation),
        humidity: `${Math.round(w.relativehumidity)}%`,
        rainChance: `${w.precipitation_probability}%`,
        roof: false,
        hrFavorable: isHrFavorable(w.winddirection, w.windspeed, stadiumInfo.orientation, w.temp),
        live: true,
      };
    }
  } catch {
    // weather fetch failure is non-fatal — board scores without it
  }
}
```

Return `liveWeather: weatherMap` from the hook's enrichment result.

---

### 3. Wire stat splits into `useBoardData`

Fetch pitching splits for every starting pitcher and hitting splits for the top 6
batters in each confirmed lineup. Run these in parallel after the main enrichment.

```ts
// ── Stat splits ────────────────────────────────────────────────────────────
const statSplitsMap: Record<string, StatSplits> = {};

const splitFetches: Promise<void>[] = [];

// Pitching splits — one per probable pitcher
for (const game of activeSlate) {
  for (const pitcher of [game.probablePitchers?.home, game.probablePitchers?.away]) {
    if (!pitcher?.id) continue;
    const key = `${pitcher.id}:pitching`;
    splitFetches.push(
      apiRequest<StatSplits>(`/api/stat-splits/${pitcher.id}?group=pitching`)
        .then(data => { statSplitsMap[key] = data; })
        .catch(() => {})
    );
  }
}

// Hitting splits — top 6 of each confirmed lineup
for (const [, lineup] of Object.entries(enrichmentMap)) {
  const lu = (lineup as any).lineups;
  if (!lu?.confirmed) continue;
  const batters = [
    ...(lu.home?.battingOrder ?? []),
    ...(lu.away?.battingOrder ?? []),
  ].slice(0, 12); // 6 per side
  for (const batter of batters) {
    if (!batter?.id) continue;
    const key = `${batter.id}:hitting`;
    splitFetches.push(
      apiRequest<StatSplits>(`/api/stat-splits/${batter.id}?group=hitting`)
        .then(data => { statSplitsMap[key] = data; })
        .catch(() => {})
    );
  }
}

await Promise.allSettled(splitFetches);
```

Return `liveStatSplits: statSplitsMap` from the hook.

---

### 4. Wire pitcher arsenal into `useBoardData`

Fetch arsenal for each starting pitcher and build the `pitcherArsenal` map that
`computePitcherBoard` expects.

```ts
// ── Pitcher arsenal (for board K/Outs scoring) ─────────────────────────────
const pitcherArsenalMap: Record<number, { pitcherStats: PitcherStats }> = {};

const arsenalFetches = activeSlate.flatMap(game =>
  [game.probablePitchers?.home, game.probablePitchers?.away]
    .filter(p => p?.id)
    .map(p =>
      apiRequest<ArsenalResponse>(`/api/arsenal/${p!.id}`)
        .then(data => {
          if (data?.pitcherStats) {
            pitcherArsenalMap[p!.id] = { pitcherStats: data.pitcherStats };
          }
        })
        .catch(() => {})
    )
);

await Promise.allSettled(arsenalFetches);
```

Return `pitcherArsenal: pitcherArsenalMap` from the hook.

---

### 5. Pass the new maps to the scoring functions

In `BoardScreen.tsx` (or wherever `computePitcherBoard` / `computeBatterBoard` /
`computeGameBoard` are called), update the call sites to pass the newly populated maps:

```ts
// Before (gaps):
computePitcherBoard("k", activeSlate, livePitcherStats, liveGameLog,
  liveUmpires, livePlayerProps, liveTeamStats, {});
//                                                     ^^^ was hardcoded

// After (parity):
computePitcherBoard("k", activeSlate, livePitcherStats, liveGameLog,
  liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal);

// Batter board (was missing statSplits):
computeBatterBoard("hits", activeSlate, liveLineups, liveWeather,
  livePlayerProps, liveHittingLog, liveStatSplits);
//                                                  ^^^

// Game board (was missing weather):
computeGameBoard("total", activeSlate, liveNrfiData, liveWeather,
  liveOddsMap, livePitcherStats, liveUmpires, liveLineups);
//                                ^^^
```

---

### 6. Align odds polling to 20 minutes

In whichever hook manages the `/api/odds` query (likely `useSlateCore`), change
`staleTime` from 10 minutes to 20 minutes to match the backend snapshot job cadence:

```ts
// Before
staleTime: 10 * 60 * 1000,

// After
staleTime: 20 * 60 * 1000,
```

---

## TypeScript types to add

Add these to an appropriate types file (e.g. `mobile/src/types/weather.ts` or inline
in `useBoardData.ts`):

```ts
interface WeatherBatchItem {
  gamePk: number;
  lat: number;
  lon: number;
  tz: string;
  hour: number;
  key: string;
}

interface RawWeatherData {
  temp: number;
  windspeed: number;
  winddirection: number;
  weathercode: number;
  precipitation_probability: number;
  relativehumidity: number;
}

interface WeatherResult {
  temp?: number;
  condition: string;
  wind: string;
  humidity: string;
  rainChance: string;
  roof: boolean;
  hrFavorable: boolean;
  live: boolean;
}

interface StatSplits {
  home: Record<string, string>;
  away: Record<string, string>;
  vsLeft: Record<string, string>;
  vsRight: Record<string, string>;
  day: Record<string, string>;
  night: Record<string, string>;
}

interface PitcherStats {
  swStrPct: number | null;
  chasePct: number | null;
  fStrikePct: number | null;
}

interface ArsenalResponse {
  pitcherId: number;
  season: number;
  arsenal: unknown[];
  pitcherStats: PitcherStats;
}
```

---

## Files to modify

**`src/utils.ts`** (shared, used by both mobile and web):
- Export `WMO_CODES`, `windDescription`, `isHrFavorable`

**`mobile/src/hooks/useBoardData.ts`**:
- Add weather batch fetch → `liveWeather` map
- Add stat splits fetches → `liveStatSplits` map
- Add arsenal fetches → `pitcherArsenal` map
- Return all three new maps from the hook

**`mobile/src/screens/BoardScreen.tsx`** (and any screen calling scoring functions):
- Pass `liveWeather`, `liveStatSplits`, `pitcherArsenal` to compute calls

**`mobile/src/hooks/useSlateCore.ts`** (or wherever `/api/odds` is queried):
- `staleTime`: 10 min → 20 min

---

## What NOT to change

- Backend routes are untouched — all three endpoints already exist and work
- `computePitcherBoard`, `computeBatterBoard`, `computeGameBoard` logic untouched —
  the scoring models are already shared via `@repo/board`; only the inputs change
- Web app (`prop-scout-v7.jsx`) is frozen — do not modify it
- The Game → Arsenal tab's `usePitcherArsenal` hook is separate and untouched —
  the new board arsenal fetch is additive and runs in `useBoardData` independently
- Auth behavior unchanged — weather, stat-splits, and arsenal endpoints are all public

---

## Performance notes

- Arsenal fetches (2 per game × up to 15 games = 30 requests) run in parallel via
  `Promise.allSettled` — non-fatal on individual failures
- Stat split fetches (~24 batters + 2 pitchers per game) are also parallelised —
  individual failures silently skip that player (board scores without that split)
- Weather batch is one HTTP call for all non-dome games
- All three additions run after the existing enrichment completes — they do not
  block first paint of the board

---

## Checklist

- [ ] `WMO_CODES`, `windDescription`, `isHrFavorable` exported from `src/utils.ts`
- [ ] `windDescription` and `isHrFavorable` output matches web app exactly
- [ ] `POST /api/weather/batch` called in `useBoardData` with correct payload shape
- [ ] Dome stadiums set immediately without an HTTP call
- [ ] `liveWeather` map returned from hook and passed to all `computeGameBoard` calls
- [ ] `GET /api/stat-splits/:id?group=pitching` fetched for each probable pitcher
- [ ] `GET /api/stat-splits/:id?group=hitting` fetched for top 6 batters per lineup
- [ ] `liveStatSplits` map keyed as `"${id}:pitching"` / `"${id}:hitting"`
- [ ] `liveStatSplits` passed to all `computeBatterBoard` calls
- [ ] `GET /api/arsenal/:pitcherId` fetched for each probable pitcher
- [ ] `pitcherArsenal` map keyed by pitcher ID with `{ pitcherStats }` shape
- [ ] `pitcherArsenal` passed to all `computePitcherBoard` calls
- [ ] Odds `staleTime` updated to 20 minutes
- [ ] All new fetches use `apiRequest` from `mobile/src/api/client.ts`
- [ ] No direct calls to external APIs from mobile
- [ ] TypeScript types added for all new structures
- [ ] App builds without errors (`npx expo export` or `npx tsc --noEmit`)

---

## After completing

Reply "Task 137 complete" and confirm:
1. Which file `windDescription` and `isHrFavorable` were added to
2. Approximate number of new parallel requests added per board load on a 15-game slate
3. Whether `pitcherArsenal` required any changes to the `useBoardData` return type
