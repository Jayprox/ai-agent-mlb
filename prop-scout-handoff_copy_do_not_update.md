# Prop Scout — Project Handoff

> **How to use this doc:** Upload `prop-scout-handoff.md` and `prop-scout-v7.jsx` to a new Claude session and say: *"Read the handoff doc and the JSX file. We're continuing development of Prop Scout."* Claude will have full context on every decision made and can pick up immediately.

---

## What Is Prop Scout?

A personal MLB sports betting research app that compresses pre-game prop research from hours to minutes. Mobile-first React app (max-width 480px) with a dark Discord-style card UI. The entire frontend is a single JSX file — intentional, keeps it portable.

---

## How to Run (New Machine Setup)

### Prerequisites
- Node.js (v18+)
- The project folder: `ai-agent-mlb/`
- A `.env` file in the project root (see Environment Variables below)

### Step 1 — Install frontend dependencies
```bash
cd ai-agent-mlb
npm install
```

### Step 2 — Install backend dependencies
```bash
cd ai-agent-mlb/backend
npm install
```

### Step 3 — Start the backend (Terminal 1)
```bash
cd ai-agent-mlb/backend
npm start
# Runs on http://localhost:3001
```

### Step 4 — Start the frontend (Terminal 2)
```bash
cd ai-agent-mlb
npm run dev
# Runs on http://localhost:5173
```

Open `http://localhost:5173` in a narrow browser window (under 520px wide) or use browser DevTools → Toggle Device Toolbar.

---

## Environment Variables

Create a `.env` file in `ai-agent-mlb/` with:

```
ODDS_API_KEY=your_key_here
VITE_ODDS_API_KEY=your_key_here
```

- `ODDS_API_KEY` — used by the backend (Node/Express via `process.env`)
- `VITE_ODDS_API_KEY` — used by the frontend (Vite via `import.meta.env`)
- Both point to the same key from [the-odds-api.com](https://the-odds-api.com)
- `.env` is gitignored — never commit it

---

## Sandbox Flags (top of prop-scout-v7.jsx)

These booleans at the top of the file control which data sources are live vs mock:

```js
const IS_SANDBOX        = false; // Open-Meteo weather API
const IS_ODDS_SANDBOX   = false; // The Odds API (sportsbook odds)
const IS_STATS_SANDBOX  = false; // MLB Stats API (via backend proxy)
const IS_SAVANT_SANDBOX = IS_STATS_SANDBOX; // Baseball Savant — shares Stats gate
```

| Flag | `true` | `false` |
|---|---|---|
| `IS_SANDBOX` | Mock weather | Live Open-Meteo weather |
| `IS_ODDS_SANDBOX` | Mock odds | Live Odds API (DK/FD/CZR/MGM table) |
| `IS_STATS_SANDBOX` | Mock SLATE games | Live MLB schedule + stats |
| `IS_SAVANT_SANDBOX` | Mock arsenal/splits | Live Savant arsenal + batter splits |

The footer auto-describes which sources are live. All flags `false` = full live mode.

**Important:** `IS_STATS_SANDBOX = false` requires the backend to be running (`npm start` in `backend/`). If the backend is down, the schedule fetch silently falls back to mock SLATE data. Savant routes also require the backend.

---

## Project File Structure

```
ai-agent-mlb/
├── prop-scout-v7.jsx       ← CURRENT frontend (single JSX file)
├── main.jsx                ← Vite entry point (renders App)
├── index.html              ← Vite HTML shell
├── vite.config.js          ← Vite config + /api proxy to localhost:3001
├── package.json            ← Frontend deps: react, react-dom, vite
├── .env                    ← API keys (gitignored)
├── .gitignore
├── prop-scout-handoff.md   ← This file
├── backend/
│   ├── server.js           ← Express app, port 3001, open CORS
│   ├── package.json        ← Backend deps: express, axios, cors, dotenv
│   ├── services/
│   │   ├── mlbApi.js       ← axios instance for statsapi.mlb.com
│   │   └── cache.js        ← In-memory TTL cache
│   └── routes/
│       ├── schedule.js     ← GET /api/schedule?date=YYYY-MM-DD
│       ├── lineups.js      ← GET /api/lineups/:gamePk
│       ├── players.js      ← GET /api/players/:playerId/stats
│       ├── umpires.js      ← GET /api/umpires/:gamePk
│       ├── arsenal.js      ← GET /api/arsenal/:pitcherId (Baseball Savant)
│       └── splits.js       ← GET /api/splits/:batterId  (Baseball Savant)
└── checkpoints/
    ├── v6-odds-api/        ← Snapshot at Odds API milestone
    └── v7-multibook-odds/  ← Snapshot at multi-book table milestone (current)
```

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 18, single JSX file | No component splitting — intentional |
| Styling | Inline styles only | No CSS framework |
| Build tool | Vite 5 | Dev server on :5173, proxies /api → :3001 |
| Weather | Open-Meteo | Free, no key. `IS_SANDBOX = false` to enable |
| Odds | The Odds API | Key in `.env`. `IS_ODDS_SANDBOX = false` to enable |
| MLB Stats | MLB Stats API (statsapi.mlb.com) | Free, no key. CORS-blocked from browser → backend proxy |
| Backend | Node/Express on port 3001 | 4 routes, TTL cache, open CORS |
| Arsenal/Splits | Baseball Savant Statcast CSV | ✅ Live. CSV-only strategy (JSON endpoint removed — returned 404). BOM-safe parser, `player_id` param, year-1 fallback. |
| Database | PostgreSQL | Planned, not started |

---

## API Architecture

### Vite Proxy
Frontend calls `/api/...` (relative URL). Vite dev server proxies to `http://localhost:3001`. `API_BASE = ""` in the JSX — never hardcode the localhost port in the frontend.

### Backend Routes

| Route | Cache TTL | Notes |
|---|---|---|
| `GET /api/schedule?date=YYYY-MM-DD` | 1 hour | Hydrates probable pitchers with hand + number via batched `/people` call |
| `GET /api/lineups/:gamePk` | 5 min (confirmed) / 1 min (pending) | Returns `{ confirmed, away[], home[] }` |
| `GET /api/players/:playerId/stats?group=pitching\|hitting` | 6 hours | Shaped to mirror mock data |
| `GET /api/umpires/:gamePk` | 1 hour | Returns `null` gracefully if not yet assigned |
| `GET /api/arsenal/:pitcherId` | 6 hours | Baseball Savant: pitch mix, velocity, whiff %. Returns `{ arsenal: [{abbr, type, pct, velo, whiffPct, ba, slg, color}] }` |
| `GET /api/splits/:batterId` | 6 hours | Baseball Savant: batter's AVG/whiff/SLG vs each pitch type. Returns `{ splits: { FF: { avg, whiff, slg, pitches } } }` |

**Known quirk:** MLB Stats API `currentTeam` does NOT include `abbreviation`. Both `schedule.js` and `players.js` use a `TEAM_ABBR[id]` lookup table to resolve it.

### The Odds API
- Endpoint: `/v4/sports/baseball_mlb/odds?regions=us&markets=h2h,totals&oddsFormat=american`
- Target books: DraftKings (`draftkings`), FanDuel (`fanduel`), Caesars (`williamhill_us`), BetMGM (`betmgm`)
- Game matching key: `"AwayTeamFullName|HomeTeamFullName"` — must match exactly between Odds API and live schedule team names
- 15-minute in-memory cache (`oddsCache` module-level object in JSX)
- Books that don't have a line for a game simply don't appear in the table

---

## What's Been Built

### Slate View
- Live game selector from real MLB schedule (or mock SLATE in sandbox mode)
- Each slate card: matchup, time, stadium, O/U, line movement direction, NRFI lean, weather badge, pitcher K prop lean
- Loading spinner while live schedule fetches
- "· LIVE" label on live games

### Game Card — 5 Tabs

#### Overview Tab
- Head-to-head matchup score (0–100, multi-factor formula)
- Pitcher card: jersey number, team, hand, ERA, WHIP, K/9, BB/9, avg IP/K/PC/ER
- Batter card: jersey number, team, hand, AVG, OPS, avg H/HR/TB, hit rate
- Batter hit rate tracker (last 10 games: hits / HR / 2+ TB)

#### Lineup Tab
- Away/home toggle
- 9-batter rows, tap to expand drawer
- Each row: order, name, position, hand, AVG, last 5 hit dots, matchup score badge
- Expanded drawer: season stats, AVG + whiff % per pitch in starter's arsenal, matchup lean
- Lineup vulnerability summary bar (whole lineup vs each pitch)
- Empty state if lineups not yet confirmed

#### Arsenal Tab
- Each pitch: usage bar, batter AVG vs it, whiff rate, HANDLES/WEAK SPOT/NEUTRAL badge
- Exposure alerts: heavy usage + weak spot = red alert; heavy usage + handles = green multiplier
- **SAVANT LIVE badge** when real arsenal is loaded from Baseball Savant
- Pitcher whiff rate per pitch shown in the pitch header (from Savant `whiffPct`)
- `good`/`note` auto-computed from live stats when mock fields are absent
- Loading state shown while arsenal is being fetched

#### Intel Tab
- **Weather card**: temp, wind direction relative to park (e.g. "7 mph IN from CF"), humidity, rain chance, open air vs dome. LIVE badge when real data. 30-min cache.
- **Umpire card**: home plate ump name from MLB API, K rate, BB rate, tendency, PITCHER/NEUTRAL UMP badge
- **NRFI/YRFI card**: both teams' first-inning scoring % and tendencies
- **Bullpen cards** (away + home): grade (A–C), fatigue level, setup depth, L/R balance, expandable reliever list
- **Odds & Line Movement card**:
  - Live mode: multi-book comparison table (DK / FD / CZR / MGM) showing away ML, home ML, total, over odds, under odds per book. Missing books omitted gracefully.
  - Demo mode: single StatMini layout with mock numbers
  - Line movement text always shown below
  - Refresh button (↺) + API calls remaining + last updated time

#### Props Tab
- Confidence meter per prop (0–100 bar), lean badge, reasoning
- Empty state ("Prop Engine Pending") when no props — all live games until the prop engine is built

---

## Matchup Scoring Engine

The core intelligence. Calculates 0–100 score for how a batter matches up against a pitcher's arsenal.

```
AVG component   (45%) — scaled .150 floor to .400 ceiling
Whiff component (35%) — 0% whiff = best, 50%+ = worst
SLG component   (20%) — scaled .200 floor to .700 ceiling
```

Modifiers: usage capped at 40% per pitch; same-hand matchup applies 0.92 penalty.

| Score | Color | Label |
|---|---|---|
| < 35 | 🟢 Green | Pitcher Edge |
| 35–54 | 🟡 Yellow | Neutral |
| 55+ | 🔴 Red | Batter Edge |

Game 1 of mock SLATE (NYY@PHI) has fully enriched `vsPitches` data. Other mock games fall back to estimated whiff (20%) and SLG (avg × 1.6).

---

## Data Flow (Live Mode)

```
React App (localhost:5173)
    ↓ /api/* (Vite proxy)
Node/Express (localhost:3001)
    ↓
MLB Stats API (statsapi.mlb.com) — free, no auth
    schedule → probable pitchers → lineups → umpires → player stats

React App (browser)
    ↓ direct fetch (browser-safe)
Open-Meteo — weather by stadium coordinates
The Odds API — DK/FD/CZR/MGM lines
```

The mock SLATE array is always present as a fallback scaffold. Live data overlays specific fields gracefully — the app stays functional even when APIs are unreachable.

---

## Mock-to-Live Overlay Pattern

`buildLiveGame(sg)` converts a live schedule game into a game-card-compatible object, using `SLATE[0]` as a template for fields not yet API-backed (arsenal, props, bullpen, nrfi, batter). As each new data source comes online, it overlays the corresponding field.

`activeSlate`: live schedule or mock SLATE, controlled by `IS_STATS_SANDBOX`.

`getGameOdds(g)`: merges live Odds API data over mock odds using `"AwayTeamFullName|HomeTeamFullName"` key.

---

## Future Enhancements (Logged, Not Started)

- **Prediction market odds (Kalshi / Polymarket)** — The Odds API does not cover prediction markets. OddsPapi (oddspapi.io) aggregates Kalshi + Polymarket + sportsbooks in one normalized response. Could add a prediction market row to the multi-book odds table.
- **Baseball Savant arsenal feed** — ✅ DONE. Backend routes `/api/arsenal/:pitcherId` and `/api/splits/:batterId` fetch from Savant Statcast CSV (CSV-only; JSON `arsenal-scores` endpoint was removed after it started returning 404). BOM stripping, `player_id` param, and `year → year-1` fallback all in place. Arsenal overlays into pitcher object on game open. Batter splits fetched lazily when lineup drawer opens. `good`/`note` auto-computed from live stats.
- **Prop engine** — ✅ DONE. Live props generate in the Props tab from real pitcher stats, Savant arsenal, umpire K rate, weather, and lineup splits. Three prop types: pitcher K O/U, batter hits O/U 0.5, batter TB O/U 1.5. See "Prop Engine Notes" section below for full details.
- **Trends layer** — Prop hit rate on specific lines (e.g. Judge OVER 1.5 TB last 10 games), pitcher K prop home vs away hit rate, NRFI streaks
- **Injury flags / web scraper** — Scrape MLB injury reports (mlb.com/news/transactions or Rotoworld/FantasyPros) to auto-flag questionable/out players in the lineup and prop engine. Note: api-sports.io has injury data via paid API if scraping becomes unreliable.
- **Park factors** — ✅ DONE. See session 6 notes below.
- **Prop tracker** — ✅ DONE. See session 7 notes below.
- **Full desktop layout** — Currently shows warning screen over 520px; responsive layout is future enhancement
- **Bullpen dedicated tab** — Currently in Intel tab; full dedicated tab discussed
- **PostgreSQL** — Pre-aggregated splits, arsenal snapshots, historical logs, park factors, umpire history

---

## Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Single JSX file | Intentional | Portable, easy to hand off, no build complexity |
| Desktop handling | Warning screen >520px | Prompts user to resize; full layout is future work |
| Scoring formula | 3-factor (AVG + whiff + SLG) | AVG-only caused score compression (all batters 22–27) |
| Mock scaffold | Always present | App stays functional when APIs down/slow |
| Overlay pattern | Field-by-field | Graceful — never breaks if one API fails |
| Vite proxy | `/api` → `:3001` | No CORS issues, no hardcoded ports in frontend |
| Book matching | Exact full-name key | Odds API uses full team names; must match schedule names |

---

## Baseball Savant Integration Notes

### Strategy: Statcast CSV (CSV-only)

Both `arsenal.js` and `splits.js` use `https://baseballsavant.mlb.com/statcast_search/csv` as the sole data source. The `player-services/arsenal-scores` JSON endpoint was removed after it began returning 404.

Key CSV request params that were required to make it work:
- `player_id=<id>` — required by Savant's current export flow (was missing in original implementation)
- `group_by=pitch-type` — matches Savant's live site export behavior
- `type=details` — raw pitch-level rows (aggregated manually by the route)
- 15s timeout + browser-like `SAVANT_HEADERS`

If the current season returns no usable rows (common early April), the route automatically retries with `year - 1`.

If both years fail, route returns `502`. 6-hour cache via `cache.js`.

### How Arsenal Fetch Works
1. When a game card opens, `useEffect` fires and calls `GET /api/arsenal/:pitcherId`
2. Backend fetches Statcast CSV (pitcher perspective), BOM-stripped, parsed row-by-row
3. Aggregated by `pitch_type`: counts pitches, swings, whiffs, AB outcomes per type
4. Filtered to pitches with `>= 10` instances, shaped to `{ abbr, type, pct, velo, whiffPct, ba, slg, color }`
5. Cached 6 hours. Response includes `season` and `source` fields (`statcast_csv` or `statcast_csv_prev_season`)
6. Frontend stores in `pitcherArsenal[pitcherId]`, overlays into `game.pitcher.arsenal`
7. `pitcher.arsenalLive = true` triggers **SAVANT LIVE** badge in Arsenal tab

Backend log pattern when working:
```
→ Savant CSV  https://baseballsavant.mlb.com/statcast_search/csv?...
✓ Savant CSV  pitcherId=554430 rows=312 cols=pitch_type|release_speed|...
✓ Arsenal cached  pitcherId=554430 source=statcast_csv season=2026 pitches=5
```

If current year is empty: `· Savant CSV returned no usable rows  pitcherId=554430 year=2026` then retries with `year=2025`.

### How Batter Splits Work
1. When a lineup batter drawer is expanded, `onBatterExpand` fires
2. Calls `GET /api/splits/:batterId` (same CSV approach, `player_type=batter`)
3. Returns `{ splits: { FF: { avg, whiff, slg, pitches }, SL: {...}, ... } }`
   - `avg` formatted as `".285"` (dot-prefixed string)
   - `whiff` formatted as `"25%"` (percent string)
   - `slg` formatted as `".450"` (dot-prefixed string)
4. Frontend stores in `batterSplits[batterId]`
5. `augmentBatter(b)` merges splits into `b.vsPitches`, computes `good`/`note` fields
6. `calcMatchupScore` uses `parseFloat()` on all values — handles both formats correctly

### `computeGood(avg, whiff)` helper
Since live Savant data has no pre-computed `good` field, `computeGood` derives it:
- `avg >= .280 && whiff < 25` → `true` ("HANDLES")
- `avg <= .215 || whiff >= 35` → `false` ("WEAK SPOT")
- else → `null` ("NEUTRAL")

Whiff thresholds are in **percent units** (25 = 25%), not decimal. `parseFloat("25%")` = 25, which is what the engine expects.

### Known Limitation
Batter splits in the Arsenal tab (Featured Batter) still use mock `vsPitches` from SLATE data — the featured batter doesn't have a live MLB ID until player selection logic is built. Lineup Tab batters get live splits when their drawer is opened.

### SAVANT_HEADERS (required on all Savant requests)
```js
{
  "User-Agent":       "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":           "application/json, text/javascript, */*; q=0.01",
  "Accept-Language":  "en-US,en;q=0.9",
  "Referer":          "https://baseballsavant.mlb.com/",
  "X-Requested-With": "XMLHttpRequest"
}
```

---

---

## Prop Engine Notes

### Architecture
The prop engine is a synchronous IIFE inside the App component body (not a separate hook or file). It runs on every render — it's fast and pure, no async. Wrapped in try/catch so errors fall back to `mockProps` gracefully.

```js
const liveProps = (() => {
  try {
    // ... compute props ...
    return out;
  } catch (e) { console.error("Prop engine error:", e); return []; }
})();
const displayProps = liveProps.length > 0 ? liveProps : mockProps;
```

`mockProps` is destructured from the game object (`props: mockProps`). In sandbox mode `liveProps` is always `[]`, so mock SLATE props show. In live mode, real props replace mock ones.

### Three Prop Types

**1. Pitcher K O/U**
- `baseK`: uses `pitcher.avgK` if valid, else derives from `(kPer9 / 9) * avgIP` (defaults avgIP to 5.5)
- Line: `Math.ceil(baseK) - 0.5` (e.g. 6.2 → 6.5, 8.7 → 8.5)
- Factors (each ±points to score, ±K to projected total):
  - Arsenal weighted whiff% vs 26% league avg
  - Umpire kRate vs 22.5% league avg
  - Weather temp (cold boosts K, hot reduces)
  - Lineup avg whiff% vs top 3 pitches (requires 3+ batters with splits loaded)
- Score capped 28–82

**2. Batter Hits O/U 0.5**
- Base: binomial probability `1 - (1 - AVG)^4` → scaled to confidence
- Adjustments: `calcMatchupScore` result, recent form (only if `hitRate` is an array — featured batter uses string format, so this factor is skipped)
- Weather: cold temp penalty
- Score capped 28–82

**3. Batter TB O/U 1.5**
- Base: OPS scaled from 0.600 floor to 1.100 ceiling
- Adjustments: wind/park HR factor, batter SLG vs top 3 arsenal pitches
- Score capped 28–78

### Known Limitation
The featured batter (`game.batter`) is still the mock SLATE[0] batter (Aaron Judge). Player selection logic not yet built. Batter props use real pitcher data (arsenal, matchup score) but mock batter stats.

### `hitRate` Format Gotcha
Lineup batters use `hitRate: [1,0,1,1,...]` (array). Featured batter uses `hitRate: "7/10"` (string). Prop engine guards: `Array.isArray(batter.hitRate)` before using array methods.

---

## ✅ Fixes Applied — April 13 2026 (Session 3)

### 1. Lineup Empty State Added
**Was:** Batter rows rendered nothing when `lineup = []` (pre-game or unconfirmed). Vulnerability card and legend still showed, but the batter list was a blank card — no user-facing message.

**Fix (prop-scout-v7.jsx):** Added a ternary guard around the batter `.map()`. When `lineup.length === 0`, renders a centered "📋 Lineups Not Yet Posted / Check back closer to first pitch." state instead of mapping nothing.

**Root cause context:** `lineups.js` uses the boxscore endpoint. Pre-game, the MLB API does not populate `battingOrder`, so `confirmed = false`. Frontend falls back to `baseGame.lineups = { away: [], home: [] }` from `buildLiveGame`. Empty state now handles this gracefully.

### 2. `schedule.js` `id` Field Added
**Was:** `backend/routes/schedule.js` returned each game with `gamePk` but no `id`. Frontend's `activeSlate.find(g => g.id === selectedId)` would always fall back to `activeSlate[0]` for live games.

**Fix (backend/routes/schedule.js):** Added `id: g.gamePk` alongside `gamePk` in the transformed game object. Now the frontend `find()` matches correctly without relying on `buildLiveGame`'s own `id` assignment.

### 3. Odds API Key Persistence (Documented Fix)
**Symptom:** Error persists after updating `.env`.

**Fix:** Vite bakes `VITE_*` env vars at startup. After any `.env` change you **must** fully restart both servers (Ctrl+C on both, then restart), then hard-refresh the browser (Cmd+Shift+R). No code change needed — just a restart workflow issue.

---

## ✅ Lineup Fix Confirmed Working
Empty state renders correctly when lineups are pending, and live batter rows populate once `confirmed = true`. No further action needed.

---

## 🔴 Still Open — Hand Off to Codex

### Odds API Key Error Persisting
**Symptom:** `Odds API error: Error: API key is missing` appears in the browser console even after updating `.env` with a valid `VITE_ODDS_API_KEY`.

**What's known:**
- Vite bakes `VITE_*` env vars at startup — editing `.env` while the dev server is running has no effect until a full restart
- Full restart procedure (kill both servers, `npm run dev`, `npm start`, then `Cmd+Shift+R` hard refresh) has been attempted and the error persists
- This means the key is either still not being read correctly, or the odds fetch logic has a separate validation issue

**For Codex to investigate:**
1. Add `console.log("ODDS KEY:", import.meta.env.VITE_ODDS_API_KEY)` at the top of `prop-scout-v7.jsx` to confirm the key is actually being picked up by Vite after restart
2. Check `backend/routes/odds.js` — the backend also uses `ODDS_API_KEY` via `process.env`. Confirm the backend `.env` is in the right directory (`ai-agent-mlb/` root, not `ai-agent-mlb/backend/`)
3. Search for where the "API key is missing" string is thrown — it may be a validation check in the odds route that's triggering even when the key is present (e.g., checking key length or format)
4. Confirm `IS_ODDS_SANDBOX = false` in `prop-scout-v7.jsx` — if it's `true`, the live odds fetch never runs and any key is irrelevant

**Key files:**
- `prop-scout-v7.jsx` — top of file, sandbox flags + `VITE_ODDS_API_KEY` usage
- `backend/routes/odds.js` — where the API key is read and the "missing" error is thrown
- `.env` in `ai-agent-mlb/` root — must contain both `ODDS_API_KEY` and `VITE_ODDS_API_KEY`

---

## ✅ Session 4 Additions — April 13 2026

### Batter Drawer — SLG + Note Surfaced
**Was:** The batter expanded drawer showed AVG and whiff% per pitch type. SLG was computed from live splits but hidden. The `note` field from `autoNote()` ("Elite contact vs FF", "Severe weakness vs CH — high K exposure") was computed but never rendered.

**Fix (prop-scout-v7.jsx, batter drawer pitch rows):**
- Added `SLG {p.slg}` next to AVG in the right-hand stat cluster, color-coded (green ≥ .450 / yellow / red < .320)
- Added `note` line below the AVG progress bar when `typeof p === "object"` (live data only — no note shown for mock data which is just a string)
- SLG/note only render when `p` is the full live object — mock string values are untouched

### Lineup Confirmed Indicator
**Was:** No visual signal that lineup data was real vs pending.

**Fix (prop-scout-v7.jsx, lineup tab toggle buttons):**
- Added `lineupConfirmed = liveLineups[gamePkKey]?.confirmed === true` at lineup tab render time
- When `true`, a small "LIVE" chip appears inside both toggle buttons
- Chip inherits the button's active color (black on green when selected, green on dark when deselected)

---

## ✅ Session 4 (cont.) — Pinned Batter Feature

### Tap-to-pin lineup batter → Props tab
**Was:** `game.batter` (the featured batter driving hit/TB props) was always `tpl.batter` from SLATE[0] mock data in live games. Real lineup batters were never used in the prop engine.

**Fix:**
- Added `pinnedBatterId` state (null = use mock featured batter)
- Each lineup batter row now has a 📌 pin button (right of matchup score, stops row expand propagation). Tap to pin, tap again to unpin.
- `pinnedLineupBatter` derived by searching `game.lineups.away + home` for the pinned id
- `activeBatter` = pinned lineup batter (with Savant splits merged via `augmentBatter`) or `game.batter` fallback
- Lineup batters lack `ops` — estimated as `(avg + 0.07) + (avg × 1.65)` so the TB prop can fire
- Prop engine now uses `activeBatter` throughout (all `batter.*` references replaced)
- Props tab header shows `📌 [LastName] ✕` when a batter is pinned; ✕ unpins

**Key variables (prop-scout-v7.jsx):**
- `pinnedBatterId` — state, batter `id` or null
- `pinnedLineupBatter` — derived, raw lineup batter object or null
- `activeBatter` — final augmented batter used by prop engine

---

## ✅ Session 4 (cont.) — Prop Engine Refinement

### Confidence range tightened
All three props (K O/U, Hits O/U 0.5, TB O/U 1.5) were capped at 28–82. Changed to **38–75** across the board. Eliminates misleadingly extreme values at both ends.

### Primary pitch matchup added to hit prop reason
When `pitcher.arsenalLive` is true and `batter.vsPitches` has a match for the pitcher's primary pitch (arsenal[0] = highest usage), the reason string now surfaces it:
- Good matchup: `"[Batter] hits .312 vs Four-Seam (38% usage)"`
- Bad matchup: `"Struggles vs Four-Seam (.198 avg — pitcher's primary pitch)"`
Falls back silently when arsenal isn't live or avg is neutral (.215–.280).

### LIVE / DEMO indicator on Props tab
Small badge next to "Prop Confidence Meters" label — green **LIVE** when `liveProps.length > 0` (real stats driving props), amber **DEMO** when falling back to SLATE mock props.

---

## Roadmap — What's Next

1. ✅ **Prop engine: Featured batter upgrade — DONE.** See below.

2. ✅ **Both pitchers on Overview — DONE.** See session 8 notes below.

3. ✅ **Bullpen data — DONE.** See session 5 notes below.

3. ✅ **NRFI accuracy — DONE.** See session 5 (cont.) notes below.

4. **Historical prop result tracking** — A lightweight log (JSON file or localStorage) that records each generated prop + line + lean, then lets you mark hit/miss. Would enable accuracy tracking over the season.

---

### Bug fixes (same session)

**Mock batter showing for live games** — `buildLiveGame` always falls back to `SLATE[0]` batter (Aaron Judge). In live mode with no pinned batter, the prop engine was generating "Judge Hits O/U 0.5" for unrelated games. Fixed by gating hit/TB props on `hasPinnedBatter = IS_STATS_SANDBOX || !!pinnedBatterId`. In live mode with no pin: only K prop generates; a dashed "📌 Pin a Batter" prompt card guides the user to the Lineup tab.

**SLG .000 bug** — Mock `vsPitches` objects don't have a `slg` field. `parseFloat(undefined)` → 0 → ".000" in the reason string. Fixed: SLG computation now requires `vs && typeof vs === "object" && vs.slg` — skips silently when slg not present (i.e., mock data).

**Correct live workflow now:**
1. Props tab loads → K prop generates from live pitcher stats → "📌 Pin a Batter" prompt shows
2. User goes to Lineup tab → taps 📌 on a batter → returns to Props tab
3. Hit & TB props generate with real splits, correct player name, correct game context

---

**Overview tab mock batter fix** — Overview was also rendering `game.batter` (Aaron Judge) for live games. Fixed: when `!IS_STATS_SANDBOX && !pinnedBatterId`, batter card shows a "📌 Go to Lineup tab and pin a batter" prompt instead of mock player. When pinned, overview shows `activeBatter` stats (with `??` fallbacks for fields lineup batters lack: `number→order`, `team→pos`, `avgH/avgHR/avgTB→tb`). Hit Rates card hidden in live mode (lineup batters have array `hitRate`, not string `"8/10"`). Arsenal section shows "Featured Batter" label when no pin.

---

---

## ✅ Session 5 — Live Bullpen Data

### New backend route: `/api/bullpen/:teamId`
**File:** `backend/routes/bullpen.js` (new)
**Registered in:** `backend/server.js`

**What it does:**
1. Fetches active roster for the team, filters to position `RP` / `CL` (up to 8)
2. For each reliever, parallel-fetches: season stats (ERA, WHIP, saves, holds) + game log (recent appearances + pitches)
3. Derives per-reliever: `role` (CL/SU/MR), `status` (TIRED/MODERATE/FRESH), `lastApp` ("1d ago"), `pitches` from last outing
4. Derives team-level: `fatigueLevel`, `grade`/`gradeColor`, `setupDepth`, `lrBalance`, `note`, `lean`
5. Cached 30 min. Returns `{ live: true, relievers[], fatigueLevel, grade, ... }` — same shape as `BullpenCard` mock data

**Frontend wiring (`prop-scout-v7.jsx`):**
- `liveBullpen` state keyed by `teamId`
- Fetched in the game-open useEffect alongside lineups/umpires/arsenal — both away and home team IDs from `sg.away.id` / `sg.home.id`
- Overlaid in the `game` object: `bullpen.away = liveBullpen[awayId] ?? baseGame.bullpen.away`
- LIVE badge on the "Bullpen Strength & Fatigue" section header when `bullpen.away?.live === true`

**Known limitation:** `vsL` / `vsR` (platoon splits per reliever) are `"—"` — platoon splits require additional API calls per arm. Can add later.

**Bug fixed (April 14 / 15):** The original bullpen route filtered the active roster for `RP` / `CL`, but MLB's roster feed currently labels active bullpen arms as generic `P`. That caused `/api/bullpen/:teamId` to return `404 No relievers found` for real teams, which made the frontend fall back to mock SLATE bullpen data.

**Fix:** `backend/routes/bullpen.js` now:
- starts from all active pitchers (`position.abbreviation === "P"`)
- fetches season stats + game logs for each pitcher
- classifies likely relievers using season usage (`gamesStarted === 0`, `gamesFinished > 0`, `saves > 0`, `holds > 0`, or `inheritedRunners > 0`)
- falls back to pitchers with `gamesStarted < gamesPlayed` if the strict reliever heuristic yields none
- sorts the resulting bullpen arms by leverage/use and caps to 8

**Verification:** Tested on a temporary backend at `localhost:3002`:
- `GET /api/bullpen/116` (DET) → live reliever payload returned
- `GET /api/bullpen/118` (KC) → live reliever payload returned
- `GET /api/bullpen/144` (ATL) → live reliever payload returned

**Important:** restart the backend on port `3001` to pick up the bullpen fix in the app UI.

---

---

## ✅ Session 5 (cont.) — Live NRFI Computation

### Live NRFI lean + confidence from pitcher ERA + weather

**Was:** NRFI lean/confidence was purely mock SLATE data for all games.

**Fix (`prop-scout-v7.jsx`):**

Added `liveNrfi` IIFE (synchronous, no async) that runs after the `game` object is built:
- Reads `game.pitcher.era` (live when `IS_STATS_SANDBOX = false`) and `weather`
- Skips computation if ERA is missing or mock (`IS_STATS_SANDBOX = true`) → returns `null`
- Scoring logic:
  - ERA < 2.50 → +15 (elite), < 3.50 → +8, < 4.50 → +2, > 5.50 → -12, else -6
  - Cold temp (< 50°) → +10, cool (< 60°) → +5
  - Wind blowing OUT (hrFavorable) → -8; blowing IN → +6
  - Dome: neutral, no weather factor
- `lean = score >= 0 ? "NRFI" : "YRFI"`
- `confidence = clamp(50 + |score|, 38, 75)`
- `tendency`: up to 2 human-readable reason strings joined with " · "

Final `nrfi` const merges live over mock:
```js
const nrfi = liveNrfi
  ? { ...game.nrfi, lean: liveNrfi.lean, confidence: liveNrfi.confidence, live: true, liveTendency: liveNrfi.tendency }
  : game.nrfi;
```

**CRITICAL BUG FIXED (same session):** `nrfi` was being destructured from `game` at the top of the render body AND redeclared as `const nrfi = liveNrfi ? ...` — causing a JavaScript `SyntaxError` (cannot redeclare block-scoped variable). Fixed by removing `nrfi` from the destructuring: `const { pitcher, batter, props: mockProps, umpire, bullpen } = game;` — `nrfi` is now only declared once as the merged live version.

**UI changes:**
- "First Inning Tendencies" section label now has a green **LIVE** chip when `nrfi.live === true` (styled same as the Bullpen LIVE chip)
- When `nrfi.liveTendency` is set, a teal-tinted note card renders below the lean badge: `📊 [reason1] · [reason2]`
- Mock team 1st-inn scoring boxes (`awayFirst.scoredPct` / `homeFirst.scoredPct`) still show; live overrides only lean/confidence/tendency

**Note:** 1st-inning scoring rate per team (awayFirst/homeFirst) remains mock — would require historical play-by-play aggregation to compute live. The liveNrfi computation focuses on the current game's pitcher and conditions, which are already available.

---

---

## ✅ Session 6 — Park Factors

### PARK_FACTORS lookup table + prop engine integration

**`prop-scout-v7.jsx` changes:**

**1. `PARK_FACTORS` constant** (module-level, above sandbox flags):
- 30-team keyed lookup by home team abbreviation (`COL`, `PHI`, `SF`, etc.)
- Each entry: `{ hr, hit, k, label }` — multi-year FanGraphs averages
- `NEUTRAL_PARK = { hr: 1.0, hit: 1.0, k: 1.0, label: "Neutral" }` fallback for unknown teams
- Notable extremes: COL hr 1.35 (Coors), SF hr 0.83 (Oracle), SD hr 0.87 (Petco), BOS hit 1.09 (Fenway)

**2. `parkFactor` derivation** (after `nrfi` const):
```js
const parkFactor = PARK_FACTORS[game.home?.abbr] ?? NEUTRAL_PARK;
```

**3. Prop engine adjustments:**
- **K prop (Factor 5)**: `parkFactor.k >= 1.03` → +4 score, `<= 0.95` → -3 score. Surfaces in reason string.
- **Hit prop**: `hit >= 1.10` → +5, `>= 1.05` → +3, `<= 0.96` → -4. Surfaces in reason string.
- **TB prop**: `hr >= 1.15` → +8, `>= 1.08` → +4, `<= 0.87` → -6, `<= 0.93` → -3. Surfaces in reason string.

**4. `liveNrfi` park adjustment** (before lean/confidence calc):
- `hr >= 1.15` → score -10 (YRFI lean), `>= 1.08` → -5
- `hr <= 0.87` → score +8 (NRFI lean), `<= 0.93` → +4
- Surfaces in tendency reasons when significant

**5. Intel tab — Park Factors card** (between Weather and Umpire):
- Shows park label ("Hitter Haven", "Pitcher-Friendly", etc.) + HITTER PARK / PITCHER PARK / NEUTRAL badge
- 3-column grid: HR Factor, Hit Factor, K Factor — color-coded (yellow = hitter-friendly, green = pitcher-friendly)
- Footer note: "Multi-year FanGraphs avg · >1.0 = hitter-friendly · affects Hit, TB & NRFI props"

**Color coding convention:**
- HR/Hit factor: yellow = hitter-friendly (≥1.10/1.05), green = pitcher-friendly (≤0.90/0.97), white = neutral
- K factor: green = pitcher-friendly (≥1.02 → more Ks), yellow = hitter-friendly (≤0.96 → fewer Ks)

---

---

## ✅ Session 7 — Prop Result Tracker

### Pick logging + hit/miss tracking persisted to localStorage

**New state:**
- `propLog` — array of logged picks, initialized from `localStorage.getItem("propscout_log")`, falls back to `[]`
- `picksFilter` — "all" | "pending" | "hit" | "miss", controls which picks show in PICKS view

**Pick entry shape:**
```js
{ id, timestamp, date, game, gamePk, label, lean, confidence, result }
// result: null (pending) | "hit" | "miss"
```

**Helper functions (defined after `openGame`):**
- `logPick(prop)` — creates entry from current game + prop, prepends to log, writes to localStorage
- `markResult(id, result)` — sets result field, writes to localStorage
- `deletePick(id)` — removes entry, writes to localStorage
- `isLogged(prop)` — checks if gamePk + label already in log (prevents double-logging)

**Props tab changes:**
- Each prop card now has a ＋ button (right of lean badge)
- Turns green ✓ when already logged (prevents re-logging the same prop for the same game)
- Styling: subtle border, transitions on hover

**App nav changes:**
- Added purple **Picks** button alongside Slate / Game
- Shows badge count (purple circle) when `propLog.length > 0`
- Active state: purple (#a78bfa) instead of green

**PICKS view layout:**
- Stats bar: Total / Pending / Hits / Misses in 4-column grid + accuracy % + accuracy bar
- Filter tabs: ALL / PENDING / HIT / MISS
- Pick cards: game + date header, prop label, lean badge, confidence bar, HIT ✓ / MISS ✗ buttons
- After grading: shows result chip + "undo" link to revert
- Delete button (✕) on each card
- Empty state with instructions when no picks match filter
- Card border color: green tint for hits, red tint for misses, default for pending

---

---

## ✅ Session 8 — Both Pitchers on Overview

### Away + Home SP toggle on the Overview tab

**`buildLiveGame` changes:**
- Added `mkPitcher(p)` helper (DRY — builds same pitcher shape for both starters)
- Added `awayPitcher: mkPitcher(ap)` field using `sg.probablePitchers?.away`
- `pitcher` remains home SP (faces away lineup), `awayPitcher` is away SP (faces home lineup)

**Game-open useEffect:**
- Now also fetches `/api/players/:awayPitcherId/stats?group=pitching` for the away starter
- Stores in same `livePitcherStats` map keyed by pitcher ID

**Game object overlay:**
- Added `awayPitcher` block (same structure as `pitcher`) — overlays ERA, WHIP, K/9, BB/9 from live stats when available

**New state:** `pitcherSide` ("home" | "away") — resets to "home" on `openGame()`

**Overview tab UI:**
- Pitcher card now has AWAY SP / HOME SP toggle buttons (matching lineup tab's away/home pattern)
- Active side shows: name, team, hand, "vs {facing team}" subtitle, ERA/WHIP/K9/BB9/Avg IP stat row — color-coded ERA and WHIP
- ERA color: green <3.5, red >4.5, white otherwise
- Home SP still shows the K LEAN OVER badge (prop engine only runs on home pitcher for now)
- Away SP avatar uses reversed gradient (blue→red) to visually distinguish

**Note:** Arsenal tab still shows home pitcher's arsenal only. Away pitcher arsenal could be added as a future enhancement (fetching away arsenal requires `pitcherArsenal[awayPitcherId]` and a second arsenal tab toggle).

---

---

## ✅ Session 8 (cont.) — Both Pitchers on Arsenal Tab

### AWAY SP / HOME SP toggle added to Arsenal tab

**useEffect:** Now also fetches `/api/arsenal/:awayPitcherId` for the away starter on game open (same pattern as home arsenal fetch).

**Game object:** `awayPitcher` overlay now includes `arsenal` and `arsenalLive` fields (same as `pitcher`).

**New state:** `arsenalSide` ("home" | "away") — resets to "home" on `openGame()`.

**Arsenal tab UI:**
- Toggle buttons (AWAY SP / HOME SP) at the top, matching Lineup and Overview tab patterns
- `arsPitcher` derived from `arsenalSide` — either `pitcher` (home) or `game.awayPitcher`
- Header label dynamically updates: "[Pitcher Name]'s Arsenal vs [Facing Team] Lineup" or vs pinned batter name
- Fetching… / SAVANT LIVE badge reflects the active pitcher's live state
- Pitch cards, matchup scores, HANDLES/WEAK SPOT/NEUTRAL badges all work the same — just switched pitcher

**Note:** Batter matchup data still uses `activeBatter.vsPitches` (pinned batter or mock batter). The away pitcher's arsenal shows pitch types without batter splits if no batter is pinned — cards without a matching `vsPitches` key return `null` and are filtered out silently. Users should pin a home-side batter when viewing the away pitcher's arsenal for full matchup data.

---

## ✅ Session 9 — UI Consistency Fixes

### Pinned batter + both-pitcher flows made internally consistent

After Session 8, a few screens were still mixing old mock/featured batter state with the new pinned-batter and away-pitcher logic. These were patched in `prop-scout-v7.jsx`.

**1. Overview tab matchup chips**
- **Was:** "PITCHER WINS" / "BATTER WINS" still read from `batter.vsPitches`, even when a lineup batter was pinned
- **Fix:** Added `activeBatterVsPitches` derived from `activeBatter?.vsPitches ?? {}` and switched those chip lists to use it
- **Result:** Overview now reflects the actual pinned/current batter instead of stale featured-batter data

**2. Lineup tab home-side matchup context**
- **Was:** Home lineup rows were still evaluated against the home pitcher or a placeholder "Home Starter", which made the home lineup's vulnerability summary, drawer pitch rows, and matchup framing incorrect
- **Fix:** Added `facingPitcher` in the Lineup tab:
  - away lineup → `pitcher` (home SP)
  - home lineup → `game.awayPitcher`
- **Result:** The Lineup tab now uses the correct opposing starter for both sides

**3. Lineup row score badges**
- **Was:** `batterMatchupScore()` always used the home pitcher, so score badges for the home lineup were wrong even after the rest of the Lineup tab was fixed
- **Fix:** Updated `batterMatchupScore(b, matchupPitcher = pitcher)` to accept the active opposing pitcher and passed `facingPitcher` from the row renderer
- **Result:** Lineup matchup score badges are now correct for both away and home batting orders

**4. Arsenal tab pinned batter mismatch**
- **Was:** Arsenal cards still pulled `rawVs` from `batter.vsPitches`, so pinning a lineup batter did not actually change the Arsenal matchup cards
- **Fix:** Switched Arsenal card split lookup to `activeBatterVsPitches?.[a.abbr]`
- **Result:** The Arsenal tab now honors the pinned batter and stays in sync with the header label and Props tab

**Verification:**
- `npm run build` passes after all Session 9 fixes

---

## ✅ Session 10 — Runtime Review Follow-Up

### Overview + Arsenal split handling tightened up

After Session 9, a focused runtime review of NRFI, Props, and Picks surfaced two smaller UI logic issues in `prop-scout-v7.jsx`. Neither was a build-time failure, but both could leave the game view internally inconsistent.

**1. Overview H2H score still used stale featured-batter state**
- **Was:** The main Overview matchup score was still computed from `batter.hand` + `batter.vsPitches`, even after the rest of the app was updated to respect `activeBatter`
- **Fix:** Added `overviewBatter` / `overviewVsPitches` derived from `activeBatter` and `activeBatterVsPitches`, then switched the score calculation to use those values
- **Result:** The large Overview matchup score now updates when a lineup batter is pinned instead of staying tied to the original featured batter

**2. Arsenal matchup cards were fragile with mock string splits**
- **Was:** Arsenal cards assumed non-live split values were objects, but mock lineup data often stores pitch splits as simple AVG strings like `".271"`. Spreading those values as objects could create malformed matchup data and misleading HANDLES / WEAK SPOT labels
- **Fix:** Added `normalizePitchMatchup(abbr, rawVs)` helper:
  - strings / numbers → normalized to `{ avg, whiff: null, good, note }`
  - live objects without derived fields → enriched with computed `good` + `note`
  - pre-enriched objects → passed through unchanged
- **Result:** Arsenal cards now render safely for both mock and live pitch splits

**Runtime review result:**
- NRFI logic reviewed again — no new obvious issues found
- Props engine reviewed again — no new obvious issues found beyond the already-fixed pinned-batter/parkFactor issues
- PICKS view reviewed again — no new obvious issues found

**Verification:**
- `npm run build` passes after Session 10 fixes

---

## ✅ Session 11 — Pinned Batter Browser QA Follow-Up

### Goal of this pass

Run a final sanity review of the pinned-batter flow across:
- Overview
- Arsenal
- Props

The intent was to make sure that when a lineup batter is pinned, every tab is evaluating that batter against the **correct opposing pitcher**, not just the correct split data.

### What was reviewed

Code paths traced in `prop-scout-v7.jsx`:
- pinned batter state + derivation
- batter-side detection
- Overview H2H score
- Overview "PITCHER WINS / BATTER WINS" chips
- Props hit prop matchup logic
- Props TB prop arsenal/SLG logic
- existing Arsenal tab pinned-batter flow

### New issue found

**Pinned home-lineup batters were still being evaluated against the home starter in parts of the app.**

This showed up because the pinned-batter work from Sessions 9 and 10 correctly switched the batter object and split data, but several calculations still implicitly used `pitcher` (the home SP) as the matchup source.

That meant:
- pinning an **away** batter behaved correctly by coincidence, because away batters do face the home SP
- pinning a **home** batter could still produce the wrong matchup score and wrong batter prop reasoning, because those hitters should be evaluated against `game.awayPitcher`

### Root cause

The app had no single "active opposing pitcher" abstraction for pinned batters.

It already had:
- `activeBatter`
- `activeBatterVsPitches`

But it did **not** yet have:
- a derived pitcher chosen from the pinned batter's lineup side

So multiple calculations still referenced `pitcher` directly.

### Fix applied

Added a new derivation block near the top of the game-view computation:

**1. Detect pinned batter side**
- `awayLineup = game.lineups?.away ?? []`
- `homeLineup = game.lineups?.home ?? []`
- `pinnedBatterSide` resolves to:
  - `"away"` if the pinned batter is in the away lineup
  - `"home"` if the pinned batter is in the home lineup
  - `null` if no pinned batter is active

**2. Add single source of truth for matchup pitcher**
- `activeMatchupPitcher`
- logic:
  - pinned home batter → `game.awayPitcher ?? pitcher`
  - otherwise → `pitcher`

This creates one consistent opponent source for pinned-batter analysis.

### Code paths updated

**1. Overview H2H score**
- **Was:** `calcMatchupScore(..., pitcher.arsenal, pitcher.hand)`
- **Fix:** switched to `activeMatchupPitcher.arsenal` and `activeMatchupPitcher.hand`
- **Result:** Overview score now reflects the actual opposing starter for both away and home pinned batters

**2. Overview "PITCHER WINS / BATTER WINS" chips**
- **Was:** chip lists filtered `pitcher.arsenal`
- **Fix:** chip lists now filter `activeMatchupPitcher.arsenal`
- **Result:** the pitch-type edge lists now align with the same pitcher used by the H2H score

**3. Batter Hits prop**
- **Was:** batter matchup score used `pitcher.arsenal` / `pitcher.hand`
- **Fix:** switched to `activeMatchupPitcher.arsenal` / `activeMatchupPitcher.hand`
- **Result:** hit prop confidence and matchup reasoning now use the correct opposing starter

**4. Batter Hits prop primary-pitch note**
- **Was:** used the home starter's primary pitch (`pitcher.arsenal[0]`)
- **Fix:** now uses `activeMatchupPitcher.arsenal[0]`
- **Result:** pitch-note text now references the correct opposing pitcher's top weapon

**5. Batter TB prop arsenal SLG check**
- **Was:** SLG vs top 3 pitches was based on `pitcher.arsenal`
- **Fix:** switched to `activeMatchupPitcher.arsenal`
- **Result:** TB prop power context now uses the right opponent arsenal when a home batter is pinned

### Files changed in this pass

- `prop-scout-v7.jsx`
- `prop-scout-handoff.md`

### Verification completed

**Build verification**
- `npm run build` passes after Session 11 changes

**Code-level QA conclusion**
- Overview pinned-batter flow now uses:
  - correct batter
  - correct batter splits
  - correct opposing pitcher
- Props pinned-batter flow now uses:
  - correct batter
  - correct batter splits
  - correct opposing pitcher for hit/TB calculations
- Arsenal tab remained aligned from earlier sessions and did not need additional changes here

### Manual verification still recommended

No live browser session was attached to this Codex thread during Session 11, so this pass was completed by code-path tracing + build verification rather than click-through UI testing.

Best next manual QA:
1. Open a game with both probable starters loaded
2. Pin an away-lineup batter
3. Confirm Overview score/chips, Arsenal cards, and Props hit/TB cards all update
4. Unpin, then pin a home-lineup batter
5. Confirm those same screens update again and clearly reflect the away starter as the matchup pitcher

If anything still looks off in the browser after that, the next most likely place to inspect is not state selection anymore, but the wording/labeling layer around the displayed prop reasons.

---

---

## ✅ Session 12 — Trends Lite (Picks View Analytics)

### Derived analytics card added to the Picks view

**No new APIs or backend changes.** All analytics are derived purely from existing `propLog` state (localStorage-persisted pick log).

**New state (component level):**
- `showTrends` — boolean, default `true`. Controls collapse/expand of the Trends card. Must live at component level (not inside the IIFE) to satisfy React's Rules of Hooks.

**Trends card renders between the stats bar and filter tabs** (only visible when `graded > 0` — hides itself when no graded picks exist).

**Four analytics computed inside a nested IIFE (`graded2 = propLog.filter(p => p.result !== null)`):**

**1. Last 10 + form delta:**
- Visual green/red dot strip showing last 10 graded picks left-to-right
- Large accuracy % (color-coded: ≥60% green / ≥45% amber / <45% red)
- Delta vs all-time: "▲ +8 vs all-time" (green) or "▼ -5 vs all-time" (red) or "= flat"

**2. Current streak:**
- Iterates `graded2` from newest, counts consecutive same-result picks
- Shows count in large text + label: "3 HITS in a row" / "2 MISSES in a row"
- Color-coded green (hit streak) or red (miss streak)

**3. By prop type:**
- Groups by regex: `/\bK\b|strikeout/i` → K, `/hit/i` → Hits, `/TB|total base/i` → TB, else Other
- Progress bar + % + fraction per type
- Only shows types that have ≥1 graded pick

**4. By confidence tier:**
- High (≥65%), Mid (50–64%), Low (<50%)
- 3-column grid with hit rate per tier
- Tier label uses purple (High) / amber (Mid) / gray (Low)
- Only shows tiers that have ≥1 graded pick

**Collapsible header:** tapping "📈 Trends" header shows/hides the body. Arrow indicator ▲/▼. Border-radius adjusts (square bottom when expanded, rounded when collapsed).

**`trendAccColor(pct)` helper** (inline, inside the IIFE):
- `pct >= 60` → `#22c55e` (green)
- `pct >= 45` → `#f59e0b` (amber)
- else → `#ef4444` (red)

---

---

## 🔜 Next Up: Trends Full (For Codex + Next CW Session)

### What Trends Lite does NOT cover (intentional — needs backend)

Trends Lite is derived entirely from the current browser's `propLog`. It resets if localStorage is cleared and doesn't persist across different browsers/devices. The full version needs:

1. **Backend persistence** — `/api/picks` endpoint (read/write) that saves the pick log to a JSON file (or SQLite) on the server. This makes picks device-agnostic and survives localStorage clears.

2. **Richer propLog entry schema** — current shape:
   ```js
   { id, timestamp, date, game, gamePk, label, lean, confidence, result }
   ```
   Full version needs to add:
   ```js
   { ...current, playerId, playerName, propType, line, pitcherName, pitcherId, homeTeam, awayTeam }
   ```
   `propType` = `"K"` | `"Hits"` | `"TB"` (structured, not regex-derived from label)
   `playerId` = MLB player ID (already available at prop-generation time)

3. **Per-player trends** — "Judge OVER 1.5 TB last 10 games" — requires `playerId` in schema + backend aggregation endpoint.

4. **Pitcher K prop split** — home vs away hit rate for K O/U — requires `pitcherId` + `homeTeam` fields.

5. **NRFI streak tracking** — would need each NRFI pick logged with its game result (requires a separate result source since NRFI results aren't in the MLB Stats API easily).

### Instructions for Codex (backend work)

**File: `backend/routes/picks.js`** — new route:
```
GET  /api/picks         → reads picks.json, returns { picks: [] }
POST /api/picks         → appends or upserts a pick entry, writes picks.json
PATCH /api/picks/:id    → updates result field (hit/miss/null) for a pick
DELETE /api/picks/:id   → removes pick by id
```
Storage: simple `picks.json` in `backend/data/` (create dir). No DB needed yet.

**File: `backend/server.js`** — register the picks route (`app.use("/api/picks", picksRouter)`).

**Schema upgrade in `prop-scout-v7.jsx`:**
- Update `logPick(prop)` helper to include `propType`, `playerId`, `playerName`, `pitcherId`, `pitcherName`, `homeTeam`, `awayTeam` when available
- Add `propType` field: derive at prop-generation time in `liveProps` IIFE, attach to each prop object before it's rendered in the Props tab
- Wire frontend to POST to `/api/picks` on log, PATCH on mark result, DELETE on delete (keep localStorage as local cache for offline fallback)

**CW will handle on next session:**
- Trends Full UI (per-player breakdowns, richer charts, pitcher K home/away split)
- Wire frontend state to `/api/picks` endpoint

### Manual QA still recommended (from Session 11)
No live browser session was attached to Sessions 11 or 12. Best first step on next session:
1. Open a game, pin an away-lineup batter → verify Overview/Arsenal/Props all update
2. Unpin, pin a home-lineup batter → confirm away starter is used as matchup pitcher
3. Log a few props → go to Picks → verify Trends card appears and analytics look correct
4. Grade some picks → verify streak + delta update

---

## ✅ Session 13 — Trends Full Backend Scaffold

### Scope of this session

This session intentionally covered only:
- backend route scaffolding for persisted picks
- flat-file storage schema
- `propType` schema enrichment in generated prop objects
- handoff documentation

This session intentionally did **not** wire the frontend to `/api/picks` yet.

The existing frontend helpers remain localStorage-only for now:
- `logPick`
- `markResult`
- `deletePick`

That wiring is still reserved for the next CW session.

### 1. New backend route: `backend/routes/picks.js`

Created a new Express router backed by a JSON flat file:
- file: `backend/routes/picks.js`
- storage: `backend/data/picks.json`

The route uses **synchronous** file operations on purpose:
- `fs.readFileSync`
- `fs.writeFileSync`

This matches the intended app model:
- single-user
- local development
- no concurrency complexity needed yet

### Storage behavior

Added:
- `backend/data/` directory
- `backend/data/picks.json`

Initial file shape:
```json
{ "picks": [] }
```

The route ensures the storage exists before reading or writing:
- creates `backend/data/` if missing
- creates `picks.json` with `{ picks: [] }` if missing

### CRUD operations added

**GET `/api/picks`**
- reads `picks.json`
- returns:
```js
{ picks: [...] }
```

**POST `/api/picks`**
- reads current file
- appends `req.body` as a new pick entry
- writes updated file
- returns the newly added entry
- response status: `201`

**PATCH `/api/picks/:id`**
- finds pick by `id`
- updates only the `result` field from `req.body.result`
- supports:
  - `"hit"`
  - `"miss"`
  - `null`
- writes updated file
- returns updated entry
- returns `404` if `id` not found

**DELETE `/api/picks/:id`**
- finds pick by `id`
- removes that entry
- writes updated file
- returns:
```js
{ ok: true }
```
- returns `404` if `id` not found

### 2. Registered route in `backend/server.js`

Added:
```js
const picksRouter = require("./routes/picks");
```

Registered:
```js
app.use("/api/picks", picksRouter);
```

Also updated the startup banner to list:
```js
/api/picks           local pick log CRUD
```

### 3. `propType` field added to generated live props

Updated the prop engine IIFE in `prop-scout-v7.jsx` so each generated live prop now includes a structured `propType` field.

Added values:
- pitcher strikeout prop → `propType: "K"`
- batter hits prop → `propType: "Hits"`
- batter total bases prop → `propType: "TB"`

This was added directly at prop-generation time so future logging code can rely on structured metadata instead of regex-matching the label text.

### Important non-changes

Per request, this session did **not**:
- wire frontend fetches to `/api/picks`
- change `logPick`
- change `markResult`
- change `deletePick`
- alter Picks view UI

The app still uses localStorage for the current live pick log flow.

### Files changed in Session 13

- `backend/routes/picks.js` — new JSON-backed CRUD route
- `backend/data/picks.json` — new flat-file store
- `backend/server.js` — route registration
- `prop-scout-v7.jsx` — added `propType` to live generated props
- `prop-scout-handoff.md` — Session 13 documentation

### Verification

Required verification for this session:
- `npm run build` from repo root

Result:
- build passes after Session 13 changes

### Next likely step

Next CW session should connect the current local pick actions to the new backend route:
- POST on log
- PATCH on grading
- DELETE on removal

At that point, Trends Full can stop depending solely on browser localStorage and begin using persisted server-backed picks.

---

## ✅ Session 14 — Live `/api/picks` Verification

### Goal of this pass

Verify that the new JSON-backed picks route works on a real local backend instance, not just by code inspection and build success.

### What was tested

Backend was started on `localhost:3001` and the new route was exercised end-to-end.

Verified operations:
- `GET /api/picks`
- `POST /api/picks`
- `PATCH /api/picks/:id`
- `DELETE /api/picks/:id`

### Important testing note

An initial automated check produced a false negative because the CRUD requests were fired in parallel:
- `PATCH` and `DELETE` raced ahead of `POST`
- this temporarily made it look like the route could not find the test id

After rerunning the requests **sequentially**, the route behaved correctly.

### Sequential verification result

Using a temporary test entry:
- initial `GET /api/picks` returned `{"picks":[]}`
- `POST /api/picks` created the test record successfully
- follow-up `GET /api/picks` returned the saved entry
- `PATCH /api/picks/test_pick_1` updated `result` to `"hit"`
- `DELETE /api/picks/test_pick_1` returned `{"ok":true}`
- final `GET /api/picks` returned `{"picks":[]}`

### User-side confirmation

The same full sequence was also run successfully from the user's own terminal, confirming the route works outside the Codex sandbox as expected.

### Conclusion

The backend scaffold introduced in Session 13 is now verified working in live local development:
- file-backed storage is readable/writable
- CRUD semantics are correct
- `404` behavior remains intact for missing ids

### Files changed in Session 14

- `prop-scout-handoff.md`

### Next step for Claude Cowork

Frontend wiring is now the real next task:
- keep or phase localStorage as fallback/cache
- POST on pick log
- PATCH on grading
- DELETE on remove
- decide whether initial Picks view should hydrate from `/api/picks` or merge localStorage + backend during transition

---

---

---

## ✅ Session 15 — Frontend Wiring to `/api/picks` (Option A: Backend-first, localStorage fallback)

### Design decision
**Option A** chosen: backend is the source of truth when available; localStorage is the local cache and fallback when the backend is unreachable. UI never blocks on backend calls — all mutations are fire-and-forget.

### New helper: `apiMutate` (module-level, alongside `apiFetch`)
```js
const apiMutate = async (path, method, body) => {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};
```
Used for POST, PATCH, and DELETE. The existing `apiFetch` remains GET-only.

### Picks hydration `useEffect` (on mount)
```js
useEffect(() => {
  fetch(`${API_BASE}/api/picks`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data?.picks?.length) return; // backend empty or down → keep localStorage
      setPropLog(data.picks);
      localStorage.setItem("propscout_log", JSON.stringify(data.picks));
    })
    .catch(() => {}); // silent — localStorage already loaded as initial state
}, []);
```
**Hydration logic:**
- Backend has picks → use them (overwrites localStorage with backend truth)
- Backend empty + localStorage has picks → keep localStorage (first-run or cleared backend)
- Backend unreachable → silent fallback, localStorage remains in use
- `propLog` `useState` still initializes from localStorage for instant first render — hydration only fires after mount

### `logPick` — enriched schema + background POST
Entry now includes the full Trends Full schema:
```js
{
  id, timestamp, date, game, gamePk, label, lean, confidence,  // existing
  propType,    // "K" | "Hits" | "TB" (from prop engine)
  homeTeam,    // game.home.abbr
  awayTeam,    // game.away.abbr
  pitcherId,   // pitcher.id (always home SP — K props only run on home pitcher)
  pitcherName, // pitcher.name
  playerId,    // activeBatter.id (only for Hits/TB props, null for K)
  playerName,  // activeBatter.name (only for Hits/TB props, null for K)
  result,      // null on creation
}
```
`isBatterProp = prop.propType === "Hits" || prop.propType === "TB"` gates `playerId`/`playerName` — K props log null for those fields.

Background POST: `apiMutate("/api/picks", "POST", entry).catch(() => {})` — fires after state update, never awaited.

### `markResult` — background PATCH
```js
apiMutate(`/api/picks/${id}`, "PATCH", { result }).catch(() => {});
```
State + localStorage still update synchronously before the PATCH fires.

### `deletePick` — background DELETE
```js
apiMutate(`/api/picks/${id}`, "DELETE").catch(() => {});
```
State + localStorage still update synchronously before the DELETE fires.

### Migration note
No one-time migration was built. If picks exist in localStorage but not in the backend (i.e., picks logged before Session 15), those picks will continue to render correctly from localStorage. Once the backend is restarted and new picks are logged, the backend will become the source of truth going forward. Old localStorage picks won't auto-migrate to the backend — they'll stay in localStorage until localStorage is cleared.

If migration is needed in the future: a one-time "sync to backend" button could POST all current `propLog` entries to `/api/picks` in sequence.

### Verification
All 7 wiring sites confirmed present via Node file scan:
- `apiMutate("/api/picks", "POST", entry)` ✓
- `apiMutate(\`/api/picks/\${id}\`, "PATCH", { result })` ✓
- `apiMutate(\`/api/picks/\${id}\`, "DELETE")` ✓
- `fetch(\`\${API_BASE}/api/picks\`)` (hydration) ✓
- `propType`, `pitcherId`, `playerName` in logPick entry ✓

### Files changed in Session 15
- `prop-scout-v7.jsx` — `apiMutate` helper, hydration `useEffect`, enriched `logPick`, wired `markResult` + `deletePick`
- `prop-scout-handoff.md` — Session 15 documentation

### What's next — Trends Full UI
The backend is wired. Next CW session should build the Trends Full analytics UI using the richer pick data:
- Per-player accuracy (requires `playerName` + `playerId` grouping)
- Pitcher K prop hit rate (requires `pitcherName` grouping)
- Home vs away K prop split (requires `homeTeam`/`awayTeam`)
- The `propType` field is now structured — swap regex matching in Trends Lite card to use `propType` directly
- After Trends Full: promote Bullpen out of Intel tab into its own dedicated 6th tab (data already exists in `game.bullpen`, pure frontend rearrangement)

---

---

## 🔜 Codex Tasks (Before Next CW Session)

### Task 1 — localStorage → Backend Migration Utility

**Why:** Picks logged before Session 15 exist only in localStorage (old schema, no `propType`/`pitcherId`/etc). The backend `/api/picks` starts empty for those users. Need a one-time sync path.

**What to build (prop-scout-v7.jsx):**
- Add a "☁ Sync to server" button in the Picks view stats bar (right side, next to "My Pick Log" header)
- Button only shows when: `propLog.length > 0` AND backend is reachable
- On click: POST each entry in `propLog` to `/api/picks` sequentially (not parallel — avoids race on file write)
- Guard: skip entries whose `id` already exists in backend (do a GET first, collect existing ids, diff)
- Show inline feedback: "Syncing… 3/8" → "✓ Synced" or "✗ Failed"
- Button state: `syncStatus` = `null | "syncing" | "done" | "error"` (component-level state)

**Files:** `prop-scout-v7.jsx` only — no backend changes needed, `/api/picks` already handles POST deduplication via `id` field (it appends, so duplicate ids would stack — add a check: if `store.picks.some(p => p.id === entry.id)` in `backend/routes/picks.js` POST handler, skip and return the existing entry instead of pushing).

Actually update `backend/routes/picks.js` POST to upsert by id (check if id exists, skip append if so). Then the frontend can safely POST all localStorage entries without worrying about dupes.

### Task 2 — Injury Web Scraper (Backend)

**Why:** Surface questionable/out players in the Lineup tab automatically. Currently no injury awareness.

**What to build:**
- New file: `backend/routes/injuries.js`
- Fetch `https://statsapi.mlb.com/api/v1/transactions?sportId=1&limit=100` — this is the official MLB transactions endpoint (free, no auth, same domain as rest of stats API). Filter to `typeCode: "IL"` (injured list placements) + `typeCode: "DL"` entries from the last 14 days.
- Shape each injury to: `{ playerId, playerName, team, status, date, description }`
- Cache 30 min (use existing `cache.js`)
- Register in `server.js`: `GET /api/injuries` → returns `{ injuries: [...] }`

**Frontend wiring (prop-scout-v7.jsx):**
- Add `liveInjuries` state: `useState([])`, fetch on mount alongside schedule fetch
- `injuredIds` = Set of playerIds from `liveInjuries`
- In Lineup tab batter rows: if `injuredIds.has(b.id)`, show a small red `⚠ IL` chip next to the batter name
- No prop engine changes needed yet — just visual flag in lineup

**Files:** `backend/routes/injuries.js` (new), `backend/server.js` (register route), `prop-scout-v7.jsx` (state + lineup row flag)

### Task 3 — Build Verification
After completing Tasks 1 and 2, run `npm run build` from `ai-agent-mlb/` and confirm it passes. Update `prop-scout-handoff.md` with a Session 16 section.

---

*Updated April 15 2026 — Prop Scout v7 · Session 15 complete · Codex tasks queued for Session 16*
