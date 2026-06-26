# CODEX TASK 136 — Unified API Layer (Slate + Game Detail)

## Background

The web app and iOS app currently have divergent data-fetching patterns:

- **iOS** calls `GET /api/slate-bundle` — one request that returns schedule +
  odds + nrfi + weather + pitcherStats in a single round-trip.
- **Web app** calls `GET /api/schedule` for the initial slate, then fires
  ~90–120 individual follow-up requests once the slate loads:
  - `GET /api/players/{id}/stats?group=pitching` × 2 per game (~30 calls)
  - `GET /api/players/{id}/gamelog?group=pitching` × 2 per game (~30 calls)
  - `GET /api/lineups/{gamePk}` × N games (~15 calls)
  - `GET /api/nrfi/{gamePk}` × N games (~15 calls)
  - ...plus weather, umpires, bullpen, team-stats when a game is tapped

The goal of this task is to unify both clients onto the same two-tier API
surface: one slate endpoint and one game-detail endpoint. Both clients call
both. No client-specific endpoints.

---

## What to build

### Tier 1: `GET /api/slate` — unified slate bundle

**Replace** `GET /api/slate-bundle` with `GET /api/slate`. Keep a redirect (or
alias) from `/api/slate-bundle` → `/api/slate` for iOS backward compatibility
during the transition.

The response shape stays the same as the current `slate-bundle`, extended with
two additions:

```js
{
  schedule:         Game[],          // same as /api/schedule today
  oddsMap:          {...} | null,    // same as today
  nrfiMap:          { [gamePk]: NrfiResult | null },
  weatherMap:       { [gamePk]: WeatherData | null },
  pitcherStatsMap:  { [pitcherId]: { era, whip, k9 } },  // added recently
  fetchedAt:        string
}
```

No new fields needed — this already exists in `slateBundle.js`. This part of
the task is just the rename + alias.

**File:** `backend/routes/slateBundle.js` → rename to `backend/routes/slate.js`
and update the mount in `backend/server.js`:

```js
// server.js — replace
app.use("/api/slate-bundle", require("./routes/slate"));
// with
app.use("/api/slate",        require("./routes/slate"));
app.use("/api/slate-bundle", require("./routes/slate")); // backward-compat alias
```

---

### Tier 2: `GET /api/game/:gamePk` — unified game detail bundle

Create a new file `backend/routes/gameDetail.js`. Mount it in `server.js`:

```js
app.use("/api/game", require("./routes/gameDetail"));
```

**Endpoint:** `GET /api/game/:gamePk`

This replaces the 5–8 individual calls the web app currently fires when a user
taps a game card. It aggregates all per-game data in one server-side call with
parallel fetches and per-component caching.

**Response shape:**

```js
{
  gamePk:      number,
  lineups:     LineupData | null,       // from /api/lineups/:gamePk
  umpire:      UmpireData | null,       // from /api/umpires/:gamePk
  nrfi:        NrfiResult | null,       // from /api/nrfi/:gamePk
  weather:     WeatherData | null,      // from weather fetch logic in slate.js
  bullpen:     BullpenData | null,      // from /api/bullpen/:gamePk
  homePitcher: {
    stats:    PitcherStats | null,      // from /api/players/:id/stats?group=pitching
    gamelog:  PitcherGamelog | null,    // from /api/players/:id/gamelog?group=pitching
    arsenal:  ArsenalData | null,       // from /api/arsenal/:id
  } | null,
  awayPitcher: {
    stats:    PitcherStats | null,
    gamelog:  PitcherGamelog | null,
    arsenal:  ArsenalData | null,
  } | null,
  teamStats: {
    home: TeamStats | null,             // from /api/team-stats/:teamId
    away: TeamStats | null,
  },
  fetchedAt: string,
}
```

**Implementation notes:**

- All sub-fetches should run in parallel with `Promise.allSettled` — one slow
  sub-component should never block the whole response.
- Each sub-component uses its own existing cache (all these routes already have
  TTLs). The game detail endpoint doesn't need its own top-level cache — it
  just coordinates the parallel fetches.
- To get pitcher IDs and team IDs, the endpoint needs the game's schedule entry.
  Fetch `GET /api/schedule` (or use the in-memory cache from `buildSchedulePayloadForJob`)
  to look up the game by gamePk, then extract `probablePitchers.home.id`,
  `probablePitchers.away.id`, `home.id`, `away.id`.
- Reuse existing route handler logic by importing the internal fetch functions
  (same pattern as `fetchPitcherStatsSummary` added in `players.js`).
  Don't make HTTP calls back to localhost — call the internal functions directly.

---

### Tier 3: Update `prop-scout-v7.jsx` to use both new endpoints

**3a. Replace `/api/schedule` with `/api/slate`**

In the schedule `useEffect` (~line 3517), replace:
```js
const url = slateDate ? `/api/schedule?date=${slateDate}` : "/api/schedule";
apiFetch(url).then(games => { setLiveSlate(...) })
```
with:
```js
const url = slateDate ? `/api/slate?date=${slateDate}` : "/api/slate";
apiFetch(url).then(bundle => {
  setLiveSlate(Array.isArray(bundle.schedule) ? bundle.schedule : bundle);
  if (bundle.oddsMap)        setLiveOddsMap(bundle.oddsMap);
  if (bundle.nrfiMap)        setLiveNrfiData(bundle.nrfiMap);
  if (bundle.weatherMap)     setLiveWeather(bundle.weatherMap);
  if (bundle.pitcherStatsMap) {
    setLivePitcherStats(prev => ({ ...prev, ...bundle.pitcherStatsMap }));
  }
})
```

This seeds odds, NRFI, weather, and pitcher ERA from the bundle immediately on
load, before the background prefetch fires.

**3b. Remove redundant per-game background prefetches that are now covered by the bundle**

In the background prefetch `useEffect` (~line 4322), remove these individual
calls since the slate bundle now covers them:
- `GET /api/players/${pid}/stats?group=pitching` (covered by `pitcherStatsMap`)
- `GET /api/nrfi/${sg.gamePk}` (covered by `nrfiMap`)

Keep these (not covered by the slate bundle, still lazy-load per game):
- `GET /api/players/${pid}/gamelog?group=pitching`
- `GET /api/lineups/${sg.gamePk}`

**3c. Replace per-game detail fetches with `/api/game/:gamePk`**

When a game is selected (~line 4600–4670), replace the current 5–8 individual
fetch calls with a single:

```js
apiFetch(`/api/game/${gamePk}`)
  .then(detail => {
    if (detail.lineups)              setLiveLineups(prev => ({ ...prev, [gamePk]: detail.lineups }));
    if (detail.umpire)               setLiveUmpires(prev => ({ ...prev, [gamePk]: detail.umpire }));
    if (detail.nrfi)                 setLiveNrfiData(prev => ({ ...prev, [gamePk]: detail.nrfi }));
    if (detail.weather)              setLiveWeather(prev => ({ ...prev, [gamePk]: detail.weather }));
    if (detail.bullpen)              setLiveBullpen(prev => ({ ...prev, [gamePk]: detail.bullpen }));
    if (detail.homePitcher?.stats)   setLivePitcherStats(prev => ({ ...prev, [homePitcherId]: detail.homePitcher.stats }));
    if (detail.homePitcher?.gamelog) setLiveGameLog(prev => ({ ...prev, [homePitcherId]: detail.homePitcher.gamelog }));
    if (detail.awayPitcher?.stats)   setLivePitcherStats(prev => ({ ...prev, [awayPitcherId]: detail.awayPitcher.stats }));
    if (detail.awayPitcher?.gamelog) setLiveGameLog(prev => ({ ...prev, [awayPitcherId]: detail.awayPitcher.gamelog }));
    if (detail.teamStats?.home)      setLiveTeamStats(prev => ({ ...prev, [homeTeamId]: detail.teamStats.home }));
    if (detail.teamStats?.away)      setLiveTeamStats(prev => ({ ...prev, [awayTeamId]: detail.teamStats.away }));
  })
  .catch(() => {});
```

Use `Promise.allSettled` style — if the game detail call fails, the existing
individual-call fallbacks can still fire. Don't remove the individual fetch
logic yet — guard it so it only fires if `detail` is missing a sub-component
(treat the unified call as an optimization, not a hard dependency).

---

## Files to create / modify

| File | Action |
|---|---|
| `backend/routes/slateBundle.js` | Rename to `slate.js` |
| `backend/routes/gameDetail.js` | Create new |
| `backend/server.js` | Update mounts + add backward-compat alias |
| `prop-scout-v7.jsx` | Update schedule fetch, seed state from bundle, replace game-detail fetches |

---

## What NOT to change

- Do not modify any existing individual route files (`nrfi.js`, `lineups.js`,
  `umpires.js`, `bullpen.js`, `players.js`, etc.) — `gameDetail.js` imports
  from them, it doesn't replace them.
- Do not remove the existing individual endpoints (`/api/lineups/:gamePk`,
  `/api/umpires/:gamePk`, etc.) — iOS and any other consumers may still call
  them directly.
- Do not change the `/api/picks`, `/api/ai-board`, `/api/board`, or `/api/chat`
  routes — they are out of scope.
- The player props fetch (external Odds API call) stays lazy-loaded on the
  Props tab — it's too expensive to include in the game detail bundle.
- Arsenal and batter splits stay lazy-loaded — they are only needed on
  specific sub-tabs, not on game open.

---

## Success criteria

1. `GET /api/slate` returns the same shape as `GET /api/slate-bundle` (existing
   iOS contract preserved via alias).
2. `GET /api/game/:gamePk` returns all sub-components in one response, with
   graceful nulls for any that fail.
3. Web app initial load fires 1 request (`/api/slate`) instead of 1 + ~90.
4. Tapping a game fires 1 request (`/api/game/:gamePk`) instead of 5–8.
5. No existing functionality regresses — all data that was previously fetched
   is still fetched, just bundled differently.
6. `node -e "require('./backend/routes/slate')"` and
   `node -e "require('./backend/routes/gameDetail')"` both load without errors.
