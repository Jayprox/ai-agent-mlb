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
| Arsenal | Baseball Savant/Statcast | Pending — CSV-based, lowest urgency |
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
- **Baseball Savant arsenal feed** — ✅ DONE. Backend routes `/api/arsenal/:pitcherId` and `/api/splits/:batterId` fetch from Savant's Statcast search CSV. Arsenal overlays into pitcher object on game open. Batter splits fetched lazily when lineup drawer opens. `good`/`note` auto-computed from live stats. Column names logged on first fetch for debugging.
- **Prop engine** — Once arsenal data lands, generate prop confidence scores from pitcher matchup data, park factors, weather, umpire zone.
- **Trends layer** — Prop hit rate on specific lines (e.g. Judge OVER 1.5 TB last 10 games), pitcher K prop home vs away hit rate, NRFI streaks
- **Injury flags** — Manual flag system to mark players questionable/out
- **Park factors** — HR factor, hit factor, K factor per stadium integrated into game card
- **Prop tracker** — Log picks, track hit rate over time
- **Full desktop layout** — Currently shows warning screen over 520px; responsive layout is future enhancement
- **Bullpen dedicated tab** — Currently in Intel tab; full dedicated tab discussed
- **PostgreSQL** — Pre-aggregated splits, arsenal snapshots, historical logs, park factors, umpire history

---

## 🤖 Codex Task Backlog

Tasks ready for Codex to pick up. Each is self-contained backend work — CW handles frontend wiring after.

---

### Task A — Live NRFI Data (Intel Tab)

**Current state:** The NRFI card in the Intel tab (first inning scoring %, tendency text, lean) uses mock template data for all live games. It's hardcoded from `SLATE[0]` and does not reflect real team tendencies.

**Goal:** Replace mock NRFI data with real per-team first-inning scoring history pulled from the MLB Stats API.

**Suggested approach:**
- New backend route: `GET /api/nrfi/:gamePk`
- For each team in the game, fetch their last N games from `statsapi.mlb.com/api/v1/schedule?gamePks=...` and check first-inning linescore
- Endpoint: `https://statsapi.mlb.com/api/v1/game/{gamePk}/linescore` — returns inning-by-inning runs
- Compute: `scoredPct` (% of games where team scored in the 1st), `avgRuns` (avg 1st inning runs), `tendency` (descriptive string)
- Cache TTL: 1 hour
- Return shape (must match existing frontend contract):
```json
{
  "awayFirst": { "scoredPct": "34%", "avgRuns": 0.41, "tendency": "Slow starters" },
  "homeFirst":  { "scoredPct": "47%", "avgRuns": 0.63, "tendency": "Average 1st inning output" },
  "lean": "NRFI",
  "confidence": 61
}
```
- Frontend already reads `game.nrfi` — just needs the live fetch wired in `buildLiveGame()` in `prop-scout-v7.jsx` (CW will handle this after backend is done)

#### 📋 Codex Prompt — Task A

> You are working on Prop Scout, an MLB betting research app. The backend is Node/Express in `backend/`. All existing routes are in `backend/routes/`. Use `backend/services/cache.js` for caching and `backend/services/mlbApi.js` for MLB Stats API calls.
>
> **Your task:** Build a new backend route `GET /api/nrfi/:gamePk` that returns real first-inning scoring data for both teams in a game.
>
> **Steps:**
> 1. Use the MLB Stats API to look up the game's away and home team IDs from `/api/v1/schedule?gamePks={gamePk}&hydrate=team`.
> 2. For each team, fetch their last 20 completed games from `/api/v1/schedule?teamId={teamId}&startDate=...&endDate=...&sportId=1&gameType=R` and collect each game's `gamePk`.
> 3. For each of those gamePks, fetch `/api/v1/game/{gamePk}/linescore` and check index 0 of the `innings` array for that team's runs scored in the 1st inning.
> 4. Compute: `scoredPct` (% of games with runs > 0 in the 1st, formatted as `"34%"`), `avgRuns` (average 1st inning runs, rounded to 2 decimals), `tendency` (a short descriptive string: e.g. `"Slow starters — bottom 25% in 1st inn scoring"`, `"Average 1st inning output"`, `"Strong first inning team"`, etc. based on thresholds).
> 5. Compute `lean` (`"NRFI"` or `"YRFI"`) and `confidence` (0–100 integer) based on both teams' combined `scoredPct`.
> 6. Cache the result for 1 hour using `cache.set(key, data, 60 * 60 * 1000)`.
> 7. Mount the route in `backend/server.js` as `app.use("/api/nrfi", require("./routes/nrfi"))`.
> 8. This route does NOT require auth — it's a public reference route like `/api/schedule` and `/api/lineups`.
> 9. Return shape must be exactly:
> ```json
> {
>   "awayFirst": { "scoredPct": "34%", "avgRuns": 0.41, "tendency": "Slow starters" },
>   "homeFirst":  { "scoredPct": "47%", "avgRuns": 0.63, "tendency": "Average 1st inning output" },
>   "lean": "NRFI",
>   "confidence": 61
> }
> ```
> 10. Update `prop-scout-handoff.md` noting Task A is complete with any important implementation details.

---

### Task B — Live Bullpen Data (Intel Tab)

**Current state:** The Bullpen card (Intel tab + Bullpen tab) uses mock template data — fatigue level, grade (A–C), rest days, pitches last 3 days, reliever list — all hardcoded from SLATE template.

**Goal:** Replace mock bullpen data with real reliever usage from the MLB Stats API.

**Suggested approach:**
- New backend route: `GET /api/bullpen/:gamePk`
- Use `statsapi.mlb.com/api/v1/schedule?gamePks={gamePk}&hydrate=probablePitcher,roster(rosterType=active)` to get both team rosters
- For each non-SP reliever, fetch recent game logs: `statsapi.mlb.com/api/v1/people/{playerId}/stats?stats=gameLog&group=pitching`
- Compute per team:
  - `fatigueLevel`: "HIGH" / "MODERATE" / "FRESH" based on pitches thrown in last 3 days
  - `restDays`: days since last appearance for key relievers
  - `pitchesLast3`: total bullpen pitches last 3 days
  - `grade`: A (fresh, deep) / B (moderate) / C (taxed)
  - `relievers`: array of `{ name, hand, era, role, lastUsed, pitchesLast3 }`
- Cache TTL: 15 min (bullpen usage changes daily)
- Return shape (must match existing frontend contract):
```json
{
  "away": {
    "fatigueLevel": "MODERATE",
    "restDays": 1,
    "pitchesLast3": 134,
    "grade": "B",
    "setupDepth": "avg",
    "lrBalance": "balanced",
    "relievers": [
      { "name": "Clay Holmes", "hand": "R", "era": "2.84", "role": "Closer", "lastUsed": "Yesterday", "pitchesLast3": 18 }
    ]
  },
  "home": { ...same shape... }
}
```
- Frontend already reads `game.bullpen.away` and `game.bullpen.home` — CW will wire the live fetch in `buildLiveGame()` after backend is done

#### 📋 Codex Prompt — Task B

> You are working on Prop Scout, an MLB betting research app. The backend is Node/Express in `backend/`. All existing routes are in `backend/routes/`. Use `backend/services/cache.js` for caching and `backend/services/mlbApi.js` for MLB Stats API calls.
>
> **Your task:** Build a new backend route `GET /api/bullpen/:gamePk` that returns real bullpen fatigue and reliever usage data for both teams in a game.
>
> **Steps:**
> 1. Fetch the game's away and home team IDs from `/api/v1/schedule?gamePks={gamePk}&hydrate=team`.
> 2. For each team, fetch the active roster from `/api/v1/teams/{teamId}/roster?rosterType=active&hydrate=person`. Filter to relievers and middle relievers (position type `"Relief Pitcher"` or similar — exclude SP and catchers/fielders).
> 3. For each reliever, fetch their last 5 game appearances from `/api/v1/people/{playerId}/stats?stats=gameLog&group=pitching&season={currentYear}`. Only look at the last 3 calendar days. Sum `numberOfPitches` across those games for `pitchesLast3`. Record `lastUsed` as "Today", "Yesterday", or "X days ago".
> 4. Compute per team:
>    - `pitchesLast3`: total bullpen pitches thrown in last 3 days across all relievers
>    - `fatigueLevel`: `"HIGH"` if pitchesLast3 > 180, `"MODERATE"` if 100–180, `"FRESH"` if < 100
>    - `grade`: `"A"` if FRESH + 4+ available relievers, `"B"` if MODERATE, `"C"` if HIGH
>    - `restDays`: minimum rest days among the team's top 3 relievers (by recent usage)
>    - `setupDepth`: `"deep"` / `"avg"` / `"thin"` based on available fresh arms
>    - `lrBalance`: `"lefty-heavy"` / `"righty-heavy"` / `"balanced"` based on hand split of roster
>    - `relievers`: array sorted by `pitchesLast3` descending (most recently used first), each with `{ name, hand, era, role, lastUsed, pitchesLast3 }`
> 5. Cache result for 15 minutes using `cache.set(key, data, 15 * 60 * 1000)`.
> 6. Mount in `backend/server.js` as `app.use("/api/bullpen", require("./routes/bullpen"))`. Note: a `bullpen.js` stub may already exist in `backend/routes/` — check first and build on it if so.
> 7. This route does NOT require auth — public reference route.
> 8. Return shape must be exactly:
> ```json
> {
>   "away": {
>     "fatigueLevel": "MODERATE", "restDays": 1, "pitchesLast3": 134,
>     "grade": "B", "setupDepth": "avg", "lrBalance": "balanced",
>     "relievers": [{ "name": "Clay Holmes", "hand": "R", "era": "2.84", "role": "Closer", "lastUsed": "Yesterday", "pitchesLast3": 18 }]
>   },
>   "home": { "fatigueLevel": "FRESH", "restDays": 2, "pitchesLast3": 89, "grade": "A", "setupDepth": "deep", "lrBalance": "righty-heavy", "relievers": [...] }
> }
> ```
> 9. Update `prop-scout-handoff.md` noting Task B is complete with any important implementation details.

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

### Strategy: JSON first, CSV fallback
Both `arsenal.js` and `splits.js` use a two-strategy approach:
1. **Primary (Strategy 1):** `https://baseballsavant.mlb.com/player-services/arsenal-scores?playerId={id}&year={year}&type=pitcher|batter` — Savant's internal JSON API. Lightweight, fast, 10s timeout. Browser-like headers required.
2. **Fallback (Strategy 2):** `https://baseballsavant.mlb.com/statcast_search/csv?...` — Raw Statcast CSV. The route aggregates it by pitch type. 15s timeout. **Warning:** this endpoint has been observed hanging for server-side requests without proper headers — Strategy 1 was added specifically to avoid this.

If both fail, route returns `502`. 6-hour cache via `cache.js`.

### How Arsenal Fetch Works
1. When a game card opens, `useEffect` fires and calls `GET /api/arsenal/:pitcherId`
2. Backend tries `arsenal-scores` JSON first (Strategy 1), CSV fallback (Strategy 2)
3. Result shaped to `{ abbr, type, pct, velo, whiffPct, ba, slg, color }` per pitch
4. Cached 6 hours. State stored in `pitcherArsenal[pitcherId]`
5. Arsenal overlaid into `game.pitcher.arsenal` via the existing overlay pattern
6. `pitcher.arsenalLive = true` when real data is present

Backend log pattern when working:
```
→ Savant arsenal-scores  https://baseballsavant.mlb.com/player-services/arsenal-scores?playerId=701542&year=2026&type=pitcher
✓ Savant arsenal-scores  pitcherId=701542 rows=5 fields=pitch_type|pitch_percent|...
✓ Arsenal cached  pitcherId=701542 source=arsenal_scores_json pitches=5
```

If Strategy 1 fails: `⚠ arsenal-scores failed: ...` then CSV attempt logged.
If both fail: `✗ CSV fallback also failed: ...` and 502 returned.

### How Batter Splits Work
1. When a lineup batter drawer is expanded, `onBatterExpand` fires
2. Calls `GET /api/splits/:batterId`
3. Returns `{ splits: { FF: { avg, whiff, slg, pitches }, SL: {...}, ... } }`
4. Stored in `batterSplits[batterId]`
5. `augmentBatter(b)` merges splits into `b.vsPitches` + adds computed `good`/`note` fields
6. `calcMatchupScore` works with the enriched data automatically

### `computeGood(avg, whiff)` helper
Since live Savant data has no pre-computed `good` field, `computeGood` derives it:
- `avg >= .270 && whiff <= 0.22` → `"handles"`
- `avg <= .230 || whiff >= 0.30` → `"weakspot"`
- else → `"neutral"`

### Known Limitation
Batter splits in the Arsenal tab (Featured Batter) still use mock `vsPitches` from SLATE data, since the featured batter doesn't have a live MLB ID until player selection logic is built. Lineup Tab batters get live splits when their drawer is opened.

### SAVANT_HEADERS (required on all Savant requests)
```js
{
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://baseballsavant.mlb.com/',
  'X-Requested-With': 'XMLHttpRequest'
}
```

---

## 🔴 Current Debug State (April 13 2026 — start here next session)

The Baseball Savant integration was just deployed. The fix to use the JSON `arsenal-scores` endpoint (instead of the hanging CSV) was written but **not yet confirmed working** by the user.

### What the user needs to do:
1. Restart backend: `cd ai-agent-mlb/backend && npm start`
2. Open a game card in the Arsenal tab
3. Paste the backend terminal output into the chat

### What to look for:
- **If working:** Arsenal tab shows **SAVANT LIVE** badge and real pitch mix
- **If still failing:** Backend console will show `⚠ arsenal-scores failed:` or `✗ CSV fallback also failed:` with the actual error message

### Most likely failure modes at this point:
- **HTTP 429 / 403** — Savant rate-limiting the server IP. Fix: add retry-after delay or try different headers.
- **JSON shape mismatch** — `arsenal-scores` returned a shape the parser didn't expect. Fix: log `res.data` raw and adjust the mapper.
- **Empty rows (rows=0)** — Pitcher has too few appearances in current season. Fix: try prior year as fallback (`year - 1`).
- **ECONNREFUSED / timeout** — Network issue. Check if Savant is reachable from the server machine.

---

*Updated April 2026 — Prop Scout v7 (full live mode: weather + odds + MLB stats + Baseball Savant arsenal & splits)*

---

## 🔧 Session 25 — JWT Auth + User-Scoped Picks / Notes / Digest (Backend Only)

Built the backend authentication and private data layer on top of the `Finalized MVP version` baseline on `main`.

This is **backend done / frontend pending CW**.

### Summary

Added simple JWT-based auth for a fixed set of 10 pre-created accounts, then scoped all personal data routes by `userId`:

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET/POST/PATCH/DELETE /api/picks`
- `GET/POST /api/notes/:gamePk`
- `GET /api/digest`
- `POST /api/digest/refresh`

Public MLB reference routes remain unauthenticated:
- schedule
- lineups
- players
- umpires
- arsenal
- splits

### New dependencies

Added to `backend/package.json`:

- `jsonwebtoken`
- `bcrypt`

Installed successfully in `backend/`.

### User store

Created:

- `backend/data/users.json`

Seeded with the 10 fixed user slots:

```json
[
  { "id": "user1", "username": "user1", "passwordHash": "" },
  ...
  { "id": "user10", "username": "user10", "passwordHash": "" }
]
```

Also created empty local stores:

- `backend/data/picks.json`
- `backend/data/notes.json`

### Seed script

Created:

- `backend/seed-users.js`

Usage:

```bash
node backend/seed-users.js
```

The owner edits the `USERS` array at the top of that file, for example:

```js
const USERS = [
  { id: "user1", username: "jd",      password: "changeme1" },
  { id: "user2", username: "friend1", password: "changeme2" },
  ...
];
```

What it does:

- bcrypt-hashes each password with `saltRounds = 10`
- writes `{ id, username, passwordHash }` only
- never stores plaintext passwords
- logs:

```txt
✅ users.json written with N accounts
```

### Auth middleware

Created:

- `backend/middleware/auth.js`

Behavior:

- reads `Authorization: Bearer <token>`
- verifies with `process.env.JWT_SECRET`
- on success:
  - `req.userId`
  - `req.username`
- on missing / invalid / expired token:

```json
{ "error": "Unauthorized" }
```

with `401`.

### Auth routes

Created:

- `backend/routes/auth.js`

#### `POST /api/auth/login`

Body:

```json
{ "username": "...", "password": "..." }
```

Behavior:

- reads `users.json`
- username match is case-insensitive
- bcrypt-compares password against `passwordHash`
- on success signs JWT:

```json
{ "userId": "...", "username": "..." }
```

with `expiresIn: "30d"`

Response:

```json
{ "token": "...", "userId": "...", "username": "..." }
```

Failure behavior:

- wrong username or wrong password:

```json
{ "error": "Invalid credentials" }
```

- account exists but `passwordHash` is empty:

```json
{ "error": "Account not configured" }
```

#### `GET /api/auth/me`

Protected route.

Returns:

```json
{ "userId": req.userId, "username": req.username }
```

### Picks route changes

Created / updated:

- `backend/routes/picks.js`

All routes protected with `requireAuth`.

User scoping:

- `GET /api/picks`
  - returns only picks where `pick.userId === req.userId`
- `POST /api/picks`
  - injects `userId: req.userId` before saving
- `PATCH /api/picks/:id`
  - `404` if pick missing
  - `403` if pick belongs to another user
- `DELETE /api/picks/:id`
  - `404` if pick missing
  - `403` if pick belongs to another user

### Notes route changes

Created / updated:

- `backend/routes/notes.js`

All routes protected with `requireAuth`.

Storage is now internally keyed by:

```txt
${req.userId}:${gamePk}
```

Public route shape stays the same:

- `GET /api/notes/:gamePk`
- `POST /api/notes/:gamePk`

So the frontend does not need to change the URL shape, only send auth.

### Digest route

Created:

- `backend/routes/digest.js`

Protected routes:

- `GET /api/digest`
- `POST /api/digest/refresh`

Behavior:

- computes the last 7 days of **graded** picks only (`hit` / `miss`)
- filters to `pick.userId === req.userId`
- cache key is now user-scoped:

```txt
digest:7d:${req.userId}
```

`POST /refresh` clears only that user’s digest cache key.

### Server wiring

Updated `backend/server.js` to mount:

```js
app.use("/api/auth", authRouter);
app.use("/api/picks", picksRouter);
app.use("/api/notes", notesRouter);
app.use("/api/digest", digestRouter);
```

Added startup banner lines:

```txt
/api/auth/login     POST — login, returns JWT
/api/auth/me        GET  — current user (protected)
```

Also added env guidance near the top:

```js
// Required env vars: ODDS_API_KEY, JWT_SECRET
// Optional: DATABASE_URL (falls back to flat JSON)
```

Updated:

- `backend/.env.example`

with:

```txt
JWT_SECRET=replace_me
```

### Verification

Installed the new backend deps, then ran the exact requested module-load check:

```bash
node -e "require('./backend/routes/auth'); require('./backend/routes/picks'); require('./backend/routes/notes'); require('./backend/routes/digest'); console.log('✅ all modules load cleanly')"
```

Result:

```txt
✅ all modules load cleanly
```

### Files added / changed in Session 25

- `backend/package.json`
- `backend/.env.example`
- `backend/server.js`
- `backend/seed-users.js`
- `backend/middleware/auth.js`
- `backend/routes/auth.js`
- `backend/routes/picks.js`
- `backend/routes/notes.js`
- `backend/routes/digest.js`
- `backend/data/users.json`
- `backend/data/picks.json`
- `backend/data/notes.json`
- `prop-scout-handoff.md`

### Frontend auth — done (CW Session 26)

- **`_authToken`** module-level variable — `apiFetch` and `apiMutate` both read it automatically. Set once on login, cleared on logout or 401. No need to pass token to individual call sites.
- **401 handling** — both helpers dispatch `window.dispatchEvent(new Event("propscout:unauthorized"))` on 401. A `useEffect` in App listens and calls logout.
- **Auth state** — `authToken`, `currentUser` (`{ userId, username }`), `loginUser`, `loginPass`, `loginError`, `loginLoading` — all in App.
- **Login screen** — full-screen gate rendered when `!authToken`. Dark Discord style, centered card (max 360px), ⚾ branding, username + password fields, green Sign In button, red error chip. Token stored in `localStorage` as `propscout_token`. JWT payload decoded client-side via `atob` to initialize `currentUser` without an extra network call.
- **`handleLogin`** — calls `POST /api/auth/login`, sets `_authToken`, updates state + localStorage.
- **`handleLogout`** — clears localStorage, resets `_authToken`, clears `propLog` + `liveDigest`.
- **Footer** — username display (`👤 username`) + "Sign Out" button above the data-source line.

---

## ✅ Session 27 — Pitcher Outs Prop + Help Page + Railway Deployment

### Pitcher Outs Prop (`propType: "Outs"`)
New prop engine added to `prop-scout-v7.jsx`, fires whenever `avgIP >= 4`.

**Line:** `Math.round(avgIP × 3) - 0.5` (e.g. 6.2 IP → 18.5 outs line)

**5 factors:**
1. **WHIP** — high WHIP = bullpen risk, proj outs down; elite WHIP = proj outs up
2. **BB/9** — walks inflate pitch count; high BB/9 shortens outing
3. **Opposing lineup avg matchup score** — tough lineup (avg score 55+) = earlier hook
4. **Weather** — cold suppresses offense → pitcher goes deeper; hot = opposite
5. **Park factor** — hitter-friendly parks shorten pitcher outings

Confidence range: 38–74. `backend/routes/digest.js` TYPE_BUCKETS updated to include `"Outs"`.

### Help Page (`?` button in footer)
New full-screen overlay accessible via purple `?` button in the footer (left of username).

Four sections:
- **Color Guide** — green/yellow/red explained with the quick rule
- **How Scoring Works** — 3-factor matchup score breakdown + confidence meter
- **Prop Types** — K, Outs, Hits, TB, HR, F5, NRFI, RBI in plain English
- **Stat Glossary** — ERA, WHIP, K/9, BB/9, AVG, OPS, SLG, wOBA, IP, PC, K%, HR Factor

### Railway Deployment
App is live at `ai-agent-mlb-production.up.railway.app`.

Deploy config (`railway.json`):
- Build: `npm install && npm run build && cd backend && npm install`
- Start: `NODE_ENV=production node backend/server.js`

Required Railway env vars: `ODDS_API_KEY`, `JWT_SECRET`, `NODE_ENV=production`, `PORT=3001`

Express serves the Vite `dist/` build as static files in production mode with SPA fallback.

`backend/data/users.json` is committed (bcrypt hashes only, safe). `picks.json` and `notes.json` are gitignored (ephemeral on Railway — Railway volume upgrade needed for persistence).

### 10 User Accounts
Seeded via `node backend/seed-users.js`. All accounts stored in `backend/data/users.json`.
To add/change accounts: edit `USERS` array in `backend/seed-users.js`, re-run script, commit `users.json`.

---

*Updated April 16 2026 — Session 27 complete · Pitcher Outs prop · Help page · Railway live*

---

## ✅ Session 28 — Live NRFI Route + Game-Level Bullpen Route

Completed both open Codex backend tasks from the `🤖 Codex Task Backlog`.

### Task A — Live NRFI Data

Created:

- `backend/routes/nrfi.js`

Mounted in `backend/server.js` as:

```js
app.use("/api/nrfi", require("./routes/nrfi"));
```

#### New route

```txt
GET /api/nrfi/:gamePk
```

#### What it does

For the requested `gamePk`:

1. looks up away/home team IDs from MLB schedule
2. fetches each team’s last 20 completed regular-season games
3. fetches each game’s linescore
4. checks 1st-inning runs for the target team
5. computes:
   - `scoredPct`
   - `avgRuns`
   - `tendency`
6. derives `lean` and `confidence`

#### Return shape

```json
{
  "awayFirst": { "scoredPct": "34%", "avgRuns": 0.41, "tendency": "Slow starters" },
  "homeFirst": { "scoredPct": "47%", "avgRuns": 0.63, "tendency": "Average 1st inning output" },
  "lean": "NRFI",
  "confidence": 61
}
```

#### Cache

- key: `nrfi:${gamePk}`
- TTL: 1 hour

#### Notes

- uses `gameDate - 1 day` as the cutoff so the current game is not included in the history window
- returns simple tendency labels:
  - `Strong first inning team`
  - `Average 1st inning output`
  - `Slow starters`
  - `Very slow starters`

### Task B — Live Bullpen Data

Updated:

- `backend/routes/bullpen.js`

Mounted in `backend/server.js` as:

```js
app.use("/api/bullpen", require("./routes/bullpen"));
```

#### Important compatibility note

There was already an existing team-level bullpen route in the repo used by the current app:

```txt
GET /api/bullpen/:teamId
```

To avoid breaking the existing frontend, `bullpen.js` was extended instead of replaced.

The route now supports **both**:

- `teamId` (< 1000) → existing single-team bullpen payload
- `gamePk` (> 1000) → new away/home bullpen payload for a full game

So the path remains:

```txt
GET /api/bullpen/:id
```

but behavior is detected by numeric ID shape.

#### New game-level return shape

For a `gamePk`, the route now returns:

```json
{
  "away": {
    "fatigueLevel": "MODERATE",
    "restDays": 1,
    "pitchesLast3": 134,
    "grade": "B",
    "setupDepth": "avg",
    "lrBalance": "balanced",
    "relievers": [
      { "name": "Clay Holmes", "hand": "R", "era": "2.84", "role": "Closer", "lastUsed": "Yesterday", "pitchesLast3": 18 }
    ]
  },
  "home": { "...same shape..." : true }
}
```

#### Implementation details

- game-level route looks up away/home team IDs from MLB schedule
- then reuses the existing team-level bullpen builder for each club
- game-level cache:
  - key: `bullpen:game:${gamePk}`
  - TTL: 15 minutes
- team-level cache remains:
  - key: `bullpen:team:${teamId}`
  - TTL: 30 minutes

#### Preserved behavior

The original richer team-level bullpen payload was preserved for backward compatibility with the current live app:

- `gradeColor`
- `note`
- `lean`
- original reliever card fields (`lastApp`, `pitches`, `status`, etc.)

The new game-level route maps that richer data down to the simpler away/home contract needed by CW.

### Verification

Ran module-load verification:

```bash
node -e "require('./backend/routes/nrfi'); require('./backend/routes/bullpen'); console.log('✅ nrfi+bullpen routes load cleanly')"
```

Result:

```txt
✅ nrfi+bullpen routes load cleanly
```

Started a temporary backend on port `3002` and live-tested:

- `GET /api/schedule`
- `GET /api/nrfi/824454`
- `GET /api/bullpen/824454`
- `GET /api/bullpen/144`
- repeated `GET /api/nrfi/824454` for cache hit
- repeated `GET /api/bullpen/824454` for cache hit

Observed:

- `nrfi` returned live away/home first-inning scoring data and an `NRFI` lean
- game-level bullpen returned away/home bullpen summaries in the new contract
- existing team-level bullpen still returned the old richer shape
- repeat requests returned `X-Cache: HIT` for both new routes

### Files changed in Session 28

- `backend/routes/nrfi.js`
- `backend/routes/bullpen.js`
- `backend/server.js`
- `prop-scout-handoff.md`

### Ready for CW

This is a clean handoff point for Claude Cowork.

Backend now provides:

- live first-inning scoring history via `/api/nrfi/:gamePk`
- live game-level bullpen data via `/api/bullpen/:gamePk` semantics on the existing `/api/bullpen/:id` route

CW can now wire these into `buildLiveGame()` / Intel without needing more backend work first.

---

*Updated April 16 2026 — Session 28 complete · live NRFI + game-level bullpen backend shipped and verified*
