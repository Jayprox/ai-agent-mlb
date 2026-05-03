# Prop Scout — Project Handoff

> **How to use this doc:** Upload `prop-scout-handoff.md` and `prop-scout-v7.jsx` to a new Claude session and say: *"Read the handoff doc and the JSX file. We're continuing development of Prop Scout."* Claude will have full context on every decision made and can pick up immediately.

---

## What Is Prop Scout?

A personal MLB sports betting research app that compresses pre-game prop research from hours to minutes. Responsive React app (max-width 960px, 2-column layout on tablet/desktop) with a dark Discord-style card UI. The entire frontend is a single JSX file — intentional, keeps it portable.

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

Open `http://localhost:5173` in any browser — works on phone, tablet, and desktop. On screens wider than 640px the slate renders in 2 columns.

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

## Future Enhancements — Consolidated Backlog

Ordered from least to most complex. New user feedback has been merged with existing backlog items where they overlap.

---

### 🟢 Low Complexity — Frontend only, data already exists

**1. ✅ Better pitch type matchup surfacing** *(DONE Session 35)*
Primary Chase Pitch callout added to Lineup Matchup Intel card (Overview tab). Finds the highest-whiff pitch in the pitcher's live arsenal, shows an ELITE (≥38%) or SOLID badge, and optionally shows the aggregate lineup AVG vs that pitch type when 3+ batter splits are loaded.

**2. ✅ Pitcher last 3 starts breakdown** *(DONE Session 35)*
7-column mini table added to pitcher card (Overview tab): OPP | Date | IP | K | ER | RES | PC. K values shown in purple, ER color-coded green/amber/red. `pc` field added to `backend/routes/players.js` pitching gamelog objects (`numberOfPitches`).

**3. ✅ Team K% confluence note** *(DONE Session 35)*
K% confluence callout shown below the Primary Chase Pitch section. Two thresholds:
- Green: K/9 ≥ 9.0 AND lineup avg matchup score ≤ 45 → "High K environment"
- Amber/Red: K/9 ≤ 6.5 AND lineup avg matchup score ≥ 42 → "Contact matchup"

---

### 🟡 Medium Complexity — New data, single API call

**4. ✅ Out-of-position player flag** *(DONE Session 35)*
`⚠ {pos} (norm. {primaryPos})` badge in Lineup tab batter rows when a player is fielding outside their primary position. DH excluded (not meaningful). Same-outfield moves (LF↔CF↔RF) excluded — these are platoon decisions, not meaningful flags. Data source: `primaryPos` from `player.person.primaryPosition?.abbreviation` in the boxscore hydrate — requires `?hydrate=person` on the lineups endpoint.

Backend change: `backend/routes/lineups.js` updated — URL changed from `?hydrate=person` (was missing) — added `primaryPos: player.person.primaryPosition?.abbreviation ?? null` to `transformTeam`.

**5. UmpScorecards auto-refresh** *(backlogged by user choice)*
Small Node script + Cowork scheduled task. Low urgency — umpire data is stable year-over-year. Skipped for now.

**6. ✅ Pitcher vs L/R splits** *(DONE Session 35)*
New backend route `GET /api/pitcher-splits/:pitcherId` — `backend/routes/pitcherSplits.js`. Two parallel Savant CSV fetches (`stand=L`, `stand=R`). Aggregates pitch-level events (HIT_EVENTS/K_EVENTS/OUT_EVENTS/walk/HBP), requires min 15 PA. Returns `{ vsL, vsR, pitcherId, season }` with `{ avg, kPct, bbPct, pa }` per side. Falls back to prior year if current season has < 15 PA. 6-hour cache.

Frontend: compact two-box card (vs LHH / vs RHH) in pitcher card between stat boxes and W/L record line. AVG color-coded: **green ≤ .220** (pitcher dominant), **red ≥ .280** (batters hit hard), white = neutral. Shows as `.247 AVG` with K%, BB%, PA below. Loading skeleton shown while fetching. "Platoon splits unavailable (small sample)" fallback if both sides return null.

Mounted in `backend/server.js`:
```js
app.use("/api/pitcher-splits", require("./routes/pitcherSplits")); // Baseball Savant: pitcher vs LHH/RHH
```

---

### 🔵 Higher Complexity — AI integration

**7. ✅ AI Trends Summary** *(DONE Session 34 — replaces Game Notes)*
Replace the existing Game Notes section with an Anthropic API-generated narrative per game. Pass the full game object (pitchers, bullpen, weather, umpire, odds, lineup) as structured context. Model returns a 1–2 paragraph bettor-focused summary covering pitcher trends, bullpen fatigue, weather impact, umpire tendency, and standout matchups. Data-only — no web search. Key implementation notes:
- Cache per `gamePk` (2–4 hour TTL) — do not fire on every page load
- Use Claude Haiku (fast, cheap, sufficient for short narrative)
- Backend route: `POST /api/trends/:gamePk`
- Fallback: show nothing if API call fails (don't show an error state)

**8. Injury flags + Lineup scratch alerts** *(user feedback + pro bettor feature — same feature)*
Real-time injury and lineup scratch news is the same problem. Static manual flags are too slow to be useful. Best path: let the AI-powered Props Tab (item #9) handle this via web search — injury context flows in automatically. Out-of-position flag (item #4) covers the in-game roster signal without needing a separate injury feed. For scratch detection specifically: compare confirmed lineup to previous confirmed lineup and flag missing names as "SCRATCHED", then recalculate matchup scores and prop confidence for affected props.

**9. ✅ AI-powered Props Tab** *(DONE Session 34 — AI Analysis section in Props tab)*
Full Props tab overhaul using Anthropic API + web search. Pass the full game object as structured context, then let the AI search for real-time news (injuries, scratches, beat reporter notes) to supplement. Returns structured JSON:
```json
[{ "prop": "Judge OVER 1.5 TB", "odds": "-115", "confidence": 68, "reasoning": "..." }]
```
Frontend filters: confidence ≥ 55% and odds ≥ −200. Sort by confidence descending. Each prop card shows the line, confidence %, and one-sentence reason. Key implementation notes:
- Web search provider needs to be chosen before Codex starts (Brave Search, Serper, or Tavily — all have free tiers)
- Cache per `gamePk` (30–60 min TTL) — web search + LLM is the most expensive call combo
- Prompt must instruct the model to **omit a prop entirely** rather than guess a low confidence score — a wrong confidence is worse than no rating
- Injury/lineup info from web search covers item #8 automatically

---

### ⚫ Infrastructure (separate branch / longer term)

**10. PostgreSQL data layer** *(feat/postgres-data-layer — implemented)*
Fully designed in `handoff-postgres-data-layer.md` and implemented on `feat/postgres-data-layer`. Branch includes: `pg` + `node-cron`, `backend/services/db.js`, SQL migrations, snapshot jobs, scheduler wiring, DB-first reads for `schedule` / `bullpen` / `linescore` / `umpires`, and admin trigger endpoint. Needs `DATABASE_URL` / `ADMIN_SECRET` env wiring + first-run migration on Railway before merging to `main`. Enables all items below that require historical data.

**11. Historical prop hit rates + CLV tracking** *(pro bettor feature)*
Empirical backing for the confidence meter + proof of edge over time. Per pitcher: K prop hit rate last 10 starts. Per batter: hits/TB prop hit rate on specific lines. Closing Line Value (CLV): capture pre-game line at pick time, compare to closing line post-game — positive CLV over 50+ picks = real edge. Depends on PostgreSQL being live. Data source: OddsJam / Bet Labs, or build from scratch by logging prop outcomes nightly against MLB results.

**12. Public % / Sharp money split** *(pro bettor feature)*
The single highest-leverage missing feature. Currently shows *that* a line moved — not *why*. When public % and line movement diverge (reverse line movement), that's sharp action. Add a "Sharp Action" row to the Odds card showing public bet % and money % per side, flagging reverse line movement explicitly. Data source: Action Network API or Bet Labs (both paid). Most external-dependent item in the backlog.

**13. Prediction market odds** *(backlog)*
Kalshi + Polymarket odds alongside sportsbook lines. OddsPapi (oddspapi.io) aggregates both in a normalized response. Would add a prediction market row to the multi-book odds table in the Intel tab.

---

### ✅ Completed
- Baseball Savant arsenal + batter splits (`/api/arsenal/:pitcherId`, `/api/splits/:batterId`)
- Park factors (HR/hit/K factor per stadium — static table in frontend)
- Prop tracker (pick log with hit/miss grading)
- Bullpen tab (live data in Intel tab, expandable reliever cards)
- Live NRFI data (`/api/nrfi/:gamePk`)
- Live bullpen data (`/api/bullpen/:gamePk`)
- Live linescore + final score results on slate cards
- UmpScorecards live accuracy data (backend + frontend wired)
- Responsive layout (tablet + desktop 2-column grid)
- PostgreSQL data layer (implemented on `feat/postgres-data-layer`, pending Railway deploy)

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
| Desktop handling | Responsive, no gate | `windowWidth` state drives 1-col (< 640px) vs 2-col (≥ 640px) slate grid; max-width 960px centered |
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

---

## ✅ Session 29 — Slate Card Overhaul + Live Game Status + Timezone Support

All changes are in `prop-scout-v7.jsx` unless noted.

---

### Slate Card — Live Weather & NRFI Prefetch

**Problem:** All slate cards showed mock weather (74°) and mock NRFI from `SLATE[0]` because `buildLiveGame` used template data and weather/NRFI were only fetched when a specific game was opened.

**Fix:**
- Added weather + NRFI prefetch to the background prefetch `useEffect` (the one that already prefetches pitcher stats and lineups for all slate games on mount)
- `fetchWeather` handles domes internally — removed the `!STADIUMS[sg.stadium]?.roof` guard that was preventing dome stadiums from getting their `{ roof: true }` weather object set
- Updated `activeSlate` building from `liveSlate.map(buildLiveGame)` to merge `liveWeather[sg.gamePk]` and `liveNrfiData[sg.gamePk]` into each built game object

```js
const activeSlate = (!IS_STATS_SANDBOX && liveSlate)
  ? liveSlate.map(sg => {
      const built = buildLiveGame(sg);
      if (liveWeather[sg.gamePk])  built.weather = liveWeather[sg.gamePk];
      if (liveNrfiData[sg.gamePk]) built.nrfi = { ...built.nrfi, ...liveNrfiData[sg.gamePk] };
      return built;
    })
  : SLATE;
```

---

### Intel Tab — Dome Weather Card

Removed "DEMO · live when deployed" status label for domes. Dome data is computed locally (no external API call), so the label was misleading. Domes now show only the "DOME" heading and badge with no status line.

---

### Slate Card — Odds Redesign

Added three labeled rows to the right column of each slate card:

```
O/U 7.5  •
ML   +116 / -136
O/U Odds  -105 / -115
RL   +1.5(-196) / -1.5(+162)
```

- `ML` label clarifies moneyline numbers
- `O/U Odds` label replaces the previous unlabeled juice (previously mistakenly labeled "Juice")
- `RL` = runline (MLB spread, always ±1.5). Shows spread point + price per side.

---

### Spreads (Runline) — Full Stack

**Odds API:** Added `spreads` to the markets parameter:
```
&markets=h2h,totals,spreads
```

**`extractBook`:** Added spread parsing:
```js
awaySpread, awaySpreadOdds, homeSpread, homeSpreadOdds
```

**`getGameOdds`:** Added all four spread fields to the live odds merge.

**Mock SLATE data:** Added spread fields to all 6 mock games' `odds` objects.

**Intel tab — multi-book table:** Added `Away RL` and `Home RL` columns. Grid changed from `44px repeat(5, 1fr)` to `36px repeat(7, 1fr)`. Each cell shows spread point + odds in parentheses.

**Intel tab — mock/sandbox fallback:** Added a row of two `StatMini` boxes for away/home runline below the existing ML/total/odds rows.

---

### NRFI Badge — Confidence Threshold

Changed NRFI badge to only show when `confidence >= 62` (same threshold that would turn the border green). Previously it showed for any NRFI lean regardless of confidence, causing inconsistency.

```js
{game.nrfi?.lean === "NRFI" && (game.nrfi?.confidence ?? 0) >= 62 && <LeanBadge ... />}
```

---

### Slate Card — Removed Accent Border

Removed the left-border color logic entirely. It combined NRFI confidence + prop signals into one color which was confusing and inconsistent. The badges (NRFI, weather, prop lean) carry all the signal. Cards now use a flat border — green highlight only when selected.

---

### Slate Card — Tag Order

Standardized tag row order: **weather/dome → NRFI → line movement → prop badge**. Weather is always first for consistent layout.

---

### Local Timezone for Game Times

**`backend/routes/schedule.js`:** Added `gameTime: g.gameDate` (raw ISO datetime string) to the schedule response alongside the existing ET-formatted `time` field.

**`prop-scout-v7.jsx`:** Added `formatLocalTime(isoStr)` module-level helper:
```js
const formatLocalTime = (isoStr) => {
  if (!isoStr) return null;
  try {
    return new Date(isoStr).toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    });
  } catch { return null; }
};
```

Used in `buildLiveGame`: `time: formatLocalTime(sg.gameTime) ?? sg.time`

Users in PT see "10:35 AM PDT", CT sees "12:35 PM CDT", etc. Falls back to the backend's ET string if `gameTime` is missing.

**Note:** Schedule endpoint is cached 1 hour — restart backend once after deploying to pick up the new `gameTime` field.

---

### Game Status Indicators on Slate Cards

Added `status: sg.status ?? "Scheduled"` to `buildLiveGame`.

Status badges rendered inline next to team names:

| Status | Badge | Color |
|---|---|---|
| `"In Progress"`, `"Warmup"` | ● LIVE | Red pulsing dot |
| `"Final"`, `"Game Over"` | FINAL | Muted grey |
| starts with `"Delayed"` | DELAY | Amber |
| `"Postponed"`, `"Cancelled"`, `"Suspended"` | PPD | Amber |

`startsWith("Delayed")` covers all MLB API delay variants: `"Delayed"`, `"Delayed: Rain"`, `"Delayed Start: Rain"`, etc.

Pulse keyframe animation added inline: `@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }`

---

### Help Guide Updates

- **New section: "🃏 Reading the Slate Card"** — added as the first section, explains every element: selected card highlight, O/U line, ML, O/U Odds, RL, NRFI badge (with 62% threshold noted), weather/dome, and line movement badges
- **New glossary entries:** ML, RL, O/U Odds, Line Movement
- **Updated NRFI badge entry** to reflect 62% confidence threshold
- **Replaced "Left border color" entry** with "Selected card" (border removed)

---

### Files Changed in Session 29

- `prop-scout-v7.jsx`
- `backend/routes/schedule.js` (added `gameTime` field)
- `prop-scout-handoff.md`

---

### Next Up — Live Scores on In-Progress Cards

Discussed but not yet built. Plan:
1. New backend route `GET /api/game/:gamePk/linescore` — hits `statsapi.mlb.com/api/v1/game/{gamePk}/linescore` (lightweight: current score + inning only, not the full live feed)
2. Frontend polls every 60 seconds for all in-progress games
3. Overlay live score on the slate card alongside the LIVE badge (e.g. `BOT 6 · 3–1`)

MLB Stats API is free, no key, no rate limits. The linescore endpoint is much lighter than the full live feed (`/api/v1.1/game/{gamePk}/feed/live`).

---

*Updated April 18 2026 — Session 29 complete · slate overhaul · spreads · live game status · local timezone · NRFI confidence threshold*

---

## ✅ Session 30 — Responsive Layout: Tablet + Desktop Support

### What Changed

**Removed the mobile-only width restriction entirely.**

Previously the app blocked rendering above 520px with a `DesktopWarning` full-screen overlay. This caused a blank screen bug when the browser window was resized wider, and even prevented recovery when resizing back down (stale state issue).

#### Changes to `prop-scout-v7.jsx`

1. **Deleted `DesktopWarning` component** — the blocking overlay is gone. The app now renders at any screen width.

2. **Deleted `isWide` state** — removed `useState(window.innerWidth > 520/1440)` and all references. No more width gate.

3. **Added `windowWidth` state** — tracks `window.innerWidth` reactively via a resize listener. Used purely for responsive layout decisions (not blocking).

4. **Expanded main container** — `maxWidth: 480` → `maxWidth: 960`, centered with `margin: 0 auto`. Padding scales up slightly on wider screens (`windowWidth > 640`).

5. **2-column slate grid** — at `windowWidth > 640px` (tablets, iPads, desktop), slate cards render in a `display: grid; gridTemplateColumns: 1fr 1fr` layout. Under 640px stays single-column (phone).

#### Breakpoints summary

| Width | Layout |
|---|---|
| < 640px | Single column slate, narrow padding (phone) |
| 640px – 960px | 2-column slate grid, wider padding (tablet / iPad) |
| > 960px | Same as 640–960 but container max-width caps at 960px, centered (desktop) |

#### Also updated

- `What Is Prop Scout?` section — removed "Mobile-first (max-width 480px)" framing
- Run instructions — removed "narrow browser window (under 520px)" note
- Known Limitations — removed "Full desktop layout is future enhancement" item

---

### Files Changed in Session 30

- `prop-scout-v7.jsx`
- `prop-scout-handoff.md`

---

## ✅ Session 30b — Live Linescore on In-Progress Slate Cards

### What Was Built

Real-time score + inning overlaid on slate cards for games currently in progress.

#### Backend — `backend/routes/linescore.js` (new file)

- Route: `GET /api/linescore/:gamePk`
- Hits `statsapi.mlb.com/api/v1/game/{gamePk}/linescore` (free, no auth)
- Returns: `{ gamePk, inning, halfInning, awayScore, homeScore, outs }`
- `halfInning` is lowercase `"top"` or `"bottom"` from the MLB API (`inningHalf` field)
- 45-second cache — short enough to stay current, avoids hammering on multiple clients

Registered in `server.js`:
```js
app.use("/api/linescore", require("./routes/linescore"));
```

#### Frontend — `prop-scout-v7.jsx`

1. **`liveScores` state** — `{}` keyed by `gamePk`, holds linescore response objects

2. **Polling useEffect** — runs on `[liveSlate]`, checks each game's `status`:
   - Only fetches for `"In Progress"` or `"Warmup"` games
   - Calls `apiFetch("/api/linescore/:gamePk")` immediately on mount, then every 60 seconds
   - Cleans up interval on unmount
   ```js
   useEffect(() => {
     if (IS_STATS_SANDBOX || !liveSlate?.length) return;
     const pollScores = () => {
       liveSlate.forEach(sg => {
         const inProgress = sg.status === "In Progress" || sg.status === "Warmup";
         if (!inProgress) return;
         apiFetch(`/api/linescore/${sg.gamePk}`)
           .then(data => setLiveScores(prev => ({ ...prev, [sg.gamePk]: data })))
           .catch(() => {});
       });
     };
     pollScores();
     const interval = setInterval(pollScores, 60_000);
     return () => clearInterval(interval);
   }, [liveSlate]);
   ```

3. **SlateCard prop** — `liveScore={liveScores[g.gamePk ?? g.id] ?? null}` passed to each card

4. **Score display — in-progress games** — chip inline left side next to LIVE badge:
   - Format: `3–1 ▼6` (away–home score, half-inning arrow, inning number)
   - `▲` = top of inning, `▼` = bottom of inning
   - Red-tinted chip styling

5. **Score display — final games** — right column replaces odds with result summary:
   - Polling: fetched once on load (`!liveScores[sg.gamePk]` guard), not re-polled since score can't change
   - Final score at 14px bold top of right column: `4–14`
   - Result line below showing which lines hit:
     - **O/U result** — green `O 8` or red `U 8` depending on combined runs vs line
     - **ML winner** — `NYY -149` (winner abbreviation + their ML odds)
     - **RL result** — `-1.5` if winning margin ≥ 2 (favorite covered), `+1.5` if dog covered
   - ML/RL/O/U Odds rows hidden for final games (irrelevant post-game)

#### Visual results:

In-progress:
```
KC @ NYY  [● LIVE] [3–1 ▼6]          O/U 8 ●
                                       ML +123 / -149
                                       O/U Odds -102 / -118
                                       RL +1.5(-181) / -1.5(+149)
```

Final:
```
KC @ NYY  [FINAL]                      4–14
                                       O 8 · NYY -149 · -1.5
```

---

### Files Changed in Session 30b

- `backend/routes/linescore.js` (new)
- `backend/server.js` (registered new route)
- `prop-scout-v7.jsx`
- `prop-scout-handoff.md`

---

### Suggested Next Features (for Codex)

- **Live score on Game view header** — the game detail header card shows the matchup but not the live score when in-progress; pull from `liveScores[selectedId]` and display score + inning there too
- **Push to Railway** — add `VITE_ODDS_API_KEY` to Railway environment variables so spreads market works in production
- **Backend restart reminder** — after deploy, schedule cache may need a clear (`DELETE /api/cache`) to pick up the new `gameTime` field from `schedule.js`

---

*Updated April 18 2026 — Session 30b complete · live linescore · final score results (O/U, ML, RL) on slate cards*

---

## ✅ Session 31 — Overview Overhaul · Umpire Stats · Bullpen Fix

All changes are in `prop-scout-v7.jsx` and `backend/routes/bullpen.js` unless noted.

---

### Batter Hand Fix (`?H` → real hand)

**Problem:** Lineup batter cards showed `?H` for batting hand because `batSide` was null in the boxscore roster endpoint.

**Fix:** The `/api/players/:playerId/stats` route already hits `/people/:id` which has reliable `batSide` data. Added `hand: person?.batSide?.code ?? null` to the hitting gamelog response in `backend/routes/players.js`. Lineup enrichment now merges:

```js
hand: (hittingLog.hand && hittingLog.hand !== "?") ? hittingLog.hand : rawB.hand,
```

---

### NRFI/YRFI Result Chip on Final Game Cards

Added a small result chip to the final score row on completed game slate cards.

```jsx
const f1 = liveScore.firstInning;
const nrfiKnown = f1 && f1.away !== null && f1.home !== null;
const wasNrfi = nrfiKnown && f1.away === 0 && f1.home === 0;
{nrfiKnown && (
  <span style={{ fontSize: 9, fontWeight: 700, color: wasNrfi ? "#22c55e" : "#ef4444", fontFamily: "monospace" }}>
    · {wasNrfi ? "NRFI ✓" : `YRFI (${f1.away > 0 ? game.away.abbr : game.home.abbr} scored)`}
  </span>
)}
```

**Backend:** Added `firstInning: { away, home }` to `backend/routes/linescore.js` response (1st inning runs from `innings[0]`). `null` values used when inning hasn't been played yet.

---

### Overview Tab — Complete Redesign (Pinning Removed)

**Problem:** The batter pinning feature had cascading state management bugs:
- `pitcherSide` and `lineupSide` are separate states that can drift, causing wrong-pitcher matchups
- The away lineup had no pin icon due to a `lineupSide !== pitcherSide` condition that failed when `pitcherSide` drifted
- An `effectivePitcherSide` lock (attempted fix) broke the pitcher toggle tab
- H2H in the expanded drawer was using `activeMatchupPitcher?.id` (Overview toggle) instead of the correct `facingPitcher?.id` (Lineup-derived)

**Resolution:** Removed the entire pinning feature and replaced Overview with three data-dense cards:

#### 1. Pitcher Card
- Same stats (ERA, WHIP, K/9, BB/9, avgIP) + sparkline + season record (W-L-K)
- `pitcherRecord` computed from season stats
- "X/Y clean recent starts" count (0 ER in last 5 starts)

#### 2. Lineup Matchup Intel Card
- Handedness breakdown: count of RHB / LHB / SH in the opposing lineup vs pitcher hand
- "Pitcher/Batter Hand Edge" label based on platoon advantage
- Aggregate lineup matchup score (average of `batterMatchupScoreForPitcher` across all opposing batters)
- Top 3 danger batters sorted by matchup score

#### 3. Game Lean Card
- NRFI lean from clean-start rates (0 ER starts / total recent starts for SP)
- F5 lean from combined SP ERA comparison

#### Removed entirely:
- `pinnedBatterId` state
- `pinnedBatterSide`, `pinnedLineupBatter`, `activeBatter` derivations
- H2H score card in Overview
- Batter section in Overview Pitcher card
- Hit Rates card
- Pin button in Lineup batter rows
- Pin badge in Props header
- `effectivePitcherSide` / `effectiveToggleSide` locks

`activeBatter` simplified to `batter` (mock featured batter).
`activeMatchupPitcher` now driven purely by `pitcherSide`.

H2H in expanded Lineup drawer now correctly uses `facingPitcher` (the opponent's actual pitcher) instead of the Overview toggle state.

---

### Umpire Card — TBD Fix

**Problem:** Umpire showed "TBD" even for in-progress games.

**Root cause:** `backend/routes/umpires.js` was calling `GET /game/${gamePk}/officials` — this endpoint does NOT exist in the MLB Stats API and returns 404. Officials are embedded in the boxscore.

**Fix:** Changed to `GET /game/${gamePk}/boxscore` and parse `data.officials`:

```js
const { data } = await mlb.get(`/game/${gamePk}/boxscore`);
const officials = data.officials ?? [];
const hp = officials.find((o) => o.officialType === "Home Plate");
```

Error cache TTL reduced from 5 min to 3 min to retry faster.

---

### Umpire Card — K Rate / BB Rate Stats

**Problem:** Umpire name populated correctly but K Rate and BB Rate showed `—`.

**Root cause:** The MLB Stats API provides no zone/tendency stats for umpires — only name and ID.

**Solution:** Added a static `UMPIRE_STATS` lookup table (~60 entries) keyed by umpire full name, immediately after the `NEUTRAL_PARK` constant in `prop-scout-v7.jsx`:

```js
const UMPIRE_STATS = {
  "Pat Hoberg":   { kRate: "23.4%", bbRate: "7.3%",  tendency: "Wide zone — among highest K rates in MLB", rating: "pitcher" },
  "Gabe Morales": { kRate: "21.2%", bbRate: "8.5%",  tendency: "Average zone — neutral for props",         rating: "neutral" },
  // ~60 total entries
};
```

Umpire merge logic in `activeSlate`:

```js
umpire: (() => {
  const lu = liveUmpires[gamePkKey];
  if (!lu?.homePlate) return baseGame.umpire;
  const stats = UMPIRE_STATS[lu.homePlate.name] ?? null;
  return {
    ...baseGame.umpire,
    name: lu.homePlate.name,
    ...(stats ? { kRate: stats.kRate, bbRate: stats.bbRate, tendency: stats.tendency, rating: stats.rating } : {}),
  };
})(),
```

**Note:** These values are approximations from training knowledge, not live-scraped. Accuracy is generally good year-over-year but should be verified against [umpscorecards.com](https://umpscorecards.com) before high-stakes use. No public API exists for UmpScorecards data — annual manual update is the current plan.

---

### Odds Label Fix — In-Progress / Final Games

**Problem:** The Odds & Line Movement card showed "DEMO · live when deployed" for in-progress and final games, which was misleading (The Odds API removes in-progress games at first pitch — the label should indicate pre-game lines, not sandbox demo).

**Fix:**

```jsx
const isGameLive = gs === "In Progress" || gs === "Warmup" || gs === "Final" || gs === "Game Over";
return isGameLive
  ? <span style={{ color: "#6b7280" }}>PRE-GAME LINES</span>
  : <span style={{ color: "#f59e0b" }}>DEMO · live when deployed</span>;
```

---

### Bullpen Tab — All Fields Now Populating

**Problem:** Reliever cards showed ERA correctly but WHIP, LAST APP, PITCHES, vs LHB, vs RHB, status badge, grade color, and lean text were all empty/broken.

**Root cause:** `buildGameBullpen` in `backend/routes/bullpen.js` was doing its own lossy mapping that stripped and renamed fields:

| Field | Before | After |
|---|---|---|
| `whip` | ❌ stripped | ✅ included |
| `vsL` / `vsR` | ❌ stripped | ✅ included (shows `—` until platoon splits built) |
| `status` | ❌ stripped | ✅ included (FRESH/MODERATE/TIRED badge) |
| `gradeColor` | ❌ missing | ✅ included (grade badge + lean border) |
| `lean` / `note` | ❌ missing | ✅ included (lean callout text) |
| `lastApp` | renamed to `lastUsed` | ✅ back to `lastApp` |
| `pitches` | renamed to `pitchesLast3` | ✅ back to `pitches` |
| `role` | converted to "Closer"/"Setup"/"Middle Relief" | ✅ kept as CL/SU/MR (matches `roleColor()` lookup) |

**Fix:** Replaced the two inline `.map()` blocks in `buildGameBullpen` with a shared `mapTeam` helper that passes through all fields:

```js
const mapTeam = (t) => ({
  fatigueLevel: t.fatigueLevel,
  restDays:     t.restDays,
  pitchesLast3: t.pitchesLast3,
  grade:        t.grade,
  gradeColor:   t.gradeColor,
  setupDepth:   t.setupDepth.toLowerCase(),
  lrBalance:    t.lrBalance.toLowerCase(),
  note:         t.note,
  lean:         t.lean,
  relievers: t.relievers.map((r) => ({
    name: r.name, hand: r.hand, era: r.era, whip: r.whip,
    vsL: r.vsL, vsR: r.vsR, role: r.role,
    lastApp: r.lastApp, pitches: r.pitches, status: r.status,
  })),
});
```

**Note:** After deploying this backend fix, clear the bullpen cache (restart backend or wait 15 min) so the new shape is served fresh.

---

### Backlog

- **UmpScorecards accuracy** — replace approximated umpire K/BB rates with real values from umpscorecards.com (annual manual update; no public API)
- **Platoon splits for relievers** — `vsL` / `vsR` currently `"—"` for all live relievers; would require fetching per-reliever splits from Savant

---

### Files Changed in Session 31

- `prop-scout-v7.jsx`
- `backend/routes/players.js` (added `hand` field to hitting gamelog response)
- `backend/routes/linescore.js` (added `firstInning` object)
- `backend/routes/umpires.js` (fixed endpoint: `/officials` → `/boxscore`, reduced error TTL)
- `backend/routes/bullpen.js` (fixed `buildGameBullpen` field mapping via `mapTeam` helper)
- `prop-scout-handoff.md`

---

*Updated April 18 2026 — Session 31 complete · Overview redesign · umpire fix · NRFI chip on finals · bullpen field mapping fix*

---

## ✅ Session 32 — UmpScorecards Live Data · Bullpen K/9 + BB/9 · Schedule Timezone

---

### Umpire Card — UmpScorecards Live Integration (Frontend)

Codex had already built the backend (`backend/data/umpires.json`, updated `backend/routes/umpires.js`). This session wired it into the frontend.

**What Codex built (backend):**
- `backend/data/umpires.json` — 85 umpires scraped from `https://umpscorecards.com/api/umpires?startDate=2026-01-01&endDate=2026-12-31&seasonType=R`
- `backend/routes/umpires.js` — enriches `homePlate` with `stats: { ... }` from the JSON file; includes name normalization for accented names (e.g. Alfonso Márquez)
- `homePlate` shape is now: `{ id, name, stats: { overallAccuracy, accuracyAboveExpected, consistency, averageAbsoluteFavor, weightedScore, ... } | null }`
- Note: UmpScorecards does NOT provide kRate / bbRate — only accuracy metrics

**What CW built (frontend) — `prop-scout-v7.jsx`:**

Updated umpire merge logic in `buildLiveGame` to pass `lu.homePlate.stats` through as `umpire.scorecards`, while keeping the existing `UMPIRE_STATS` static lookup for `kRate`/`bbRate`/`tendency`/`rating` (still used by K prop engine and as fallback display):

```js
umpire: (() => {
  const lu = liveUmpires[gamePkKey];
  if (!lu?.homePlate) return baseGame.umpire;
  const staticStats = UMPIRE_STATS[lu.homePlate.name] ?? null;
  return {
    ...baseGame.umpire,
    name:       lu.homePlate.name,
    scorecards: lu.homePlate.stats ?? null,
    ...(staticStats ? { kRate, bbRate, tendency, rating } : {}),
  };
})(),
```

Umpire card now has three display states:
1. **SCORECARD LIVE** (`umpire.scorecards` populated) — shows 4 real metrics: Accuracy, vs Exp, Consistency, Favor/Gm. Badge derived from `accuracyAboveExpected`: ≥ +0.5% → ACCURATE (green), ≤ −1.0% → INCONSISTENT (amber), otherwise falls back to PITCHER/NEUTRAL UMP from static data.
2. **Static only** (ump not in dataset) — shows K Rate + BB Rate from `UMPIRE_STATS`. PITCHER/NEUTRAL UMP badge.
3. **TBD** — no assignment yet, shows defaults.

K prop engine unchanged — still reads `umpire.kRate` from static table.

**Backlog:** UmpScorecards dataset refresh — no public API for automated scraping. Plan: small Node script + Cowork scheduled task to re-fetch once daily. Stable year-over-year so low urgency.

---

### Bullpen Relievers — vs LHB / vs RHB → K/9 + BB/9

**Problem:** `vsL` / `vsR` platoon splits never populated — the MLB Stats API `statSplits` endpoint and `vsLeft`/`vsRight` stat types both returned no data (too early in season / insufficient AB threshold).

**Decision:** Removed platoon splits entirely. Replaced with **K/9** and **BB/9** — both come from the `season` stats call already in the bullpen route, so no new API calls needed.

**Backend changes — `backend/routes/bullpen.js`:**
- Removed `statSplits` / `vsLeft` / `vsRight` fetch attempts
- Reverted `Promise.all` back to 3 calls (season, gameLog, person)
- Added `k9: stat.strikeoutsPer9Inn ?? "—"` and `bb9: stat.walksPer9Inn ?? "—"` to reliever return object
- Updated `mapTeam` in `buildGameBullpen` to pass `k9` and `bb9` through

**Frontend changes — `prop-scout-v7.jsx`:**
- Replaced vs LHB / vs RHB / Platoon Edge section with K/9 + BB/9 two-stat row
- Color coding: K/9 green ≥ 10 / amber 7–10 / red ≤ 7; BB/9 green ≤ 3 / amber 3–5 / red ≥ 5

---

### Schedule Timezone — ET → Hawaii

**Problem:** Schedule was using ET to determine "today's date", which rolled to tomorrow after ~8 PM Pacific, showing the wrong slate.

**Fix — `backend/routes/schedule.js` line 47:**
```js
// Before
timeZone: "America/New_York"
// After
timeZone: "Pacific/Honolulu"   // UTC−10, no DST — never rolls mid-slate
```

The `formatGameTime` helper still formats display times in ET (harmless — frontend uses raw `gameTime` ISO string for local TZ display anyway).

Cache key is date-based (`schedule:YYYY-MM-DD`) so PT/HI date differences generate separate cache entries without conflict.

---

### Help Guide Updates (`prop-scout-v7.jsx`)

- **New section: "🔍 Reading the Intel Tab"** — added before Prop Types. Covers all four Intel cards: Umpire (SCORECARD LIVE vs fallback), NRFI/YRFI, Bullpen (grade/fatigue/K9/BB9), Odds & Line Movement
- **Pitch scouting notes tip** — removed stale pinning reference, updated to describe Lineup drawer H2H flow
- **Stat Glossary** — added: Ump Accuracy, vs Expected, Consistency, Favor/Gm, ACCURATE/INCONSISTENT badge, PITCHER/NEUTRAL UMP fallback, Reliever K/9, Reliever BB/9

---

### Files Changed in Session 32

- `prop-scout-v7.jsx`
- `backend/routes/umpires.js` (Codex — backend only)
- `backend/data/umpires.json` (Codex — 85 umpires from UmpScorecards)
- `backend/routes/bullpen.js` (platoon splits removed, K/9 + BB/9 added)
- `backend/routes/schedule.js` (timezone ET → Pacific/Honolulu)
- `prop-scout-handoff.md`

---

*Updated April 18 2026 — Session 32 complete · UmpScorecards live integration · Bullpen K/9+BB/9 · Schedule timezone fix*

---

## ✅ Session 33 — Overview Cleanup · Backlog Reorganization

All changes in `prop-scout-v7.jsx` unless noted.

---

### First Inning Tendencies — Moved to Overview Tab

Relocated the entire First Inning Tendencies card (NRFI/YRFI lean, team scoring %, LIVE badge, log pick button) from the Intel tab to the bottom of the Overview tab, below the F5 Lean card. No logic changes — pure UI relocation. The `nrfi` variable is defined above tab rendering so it's in scope in both tabs.

---

### Overview Tab — F5 Lean + First Inning Tendencies Cleanup

**Problem:** The old "Game Lean" card showed both an NRFI lean (computed from SP clean starts) and an F5 lean side by side. The NRFI lean conflicted with the more accurate live API data in the First Inning Tendencies card directly below it — two contradictory signals from different data sources.

**Fix:**
- Removed NRFI lean entirely from the Game Lean card
- Renamed card to "F5 Lean" — now shows only the F5 signal (avg ERA of both SPs), with a cleaner side-by-side ERA display for both teams
- First Inning Tendencies is now the single authoritative NRFI source
- NRFI lean badge and LIVE chip moved to the top of the First Inning Tendencies card; redundant inner header "NRFI / YRFI Lean" removed

**Result:** F5 and NRFI are clearly separated topics. No conflicting signals.

---

### Future Enhancements Backlog — Full Reorganization

Consolidated all backlog items (previous sessions + pro bettor features + new user feedback) into a single prioritized list ordered by complexity:
- 🟢 Low complexity (3 items) — frontend only, data already exists
- 🟡 Medium complexity (3 items) — new data, single API call
- 🔵 Higher complexity (3 items) — AI integration
- ⚫ Infrastructure (3 items) — separate branch / longer term
- ✅ Completed items listed

Key merges:
- "Injury flags" + "Lineup scratch alerts" + new user feedback on injuries → consolidated into item #8 (handled by AI Props web search)
- "Batter tendencies vs pitch types" (new feedback) → merged with existing pitch type matchup surfacing (item #1 — data already exists)
- "Pitcher vs L/R splits" (new feedback) → merged with existing platoon splits backlog item (item #6)

---

### Three Planned Updates

1. ✅ Move First Inning Tendencies → Overview tab — **DONE Session 33**
2. ✅ AI Trends Summary (replace Game Notes) — **DONE Session 34**
3. ✅ AI-powered Props Tab — **DONE Session 34**

---

### Files Changed in Session 33

- `prop-scout-v7.jsx`
- `prop-scout-handoff.md`

---

*Updated April 19 2026 — Session 33 complete · Overview cleanup · F5/NRFI separation · Backlog consolidated and reprioritized*

---

## ✅ Session 34 — AI Trends Bug Fix · AI-powered Props Tab

All changes in `prop-scout-v7.jsx` and `backend/` unless noted.

---

### AI Trends Bug Fix — `apiFetch` → `apiMutate`

**Problem:** AI Trends summary appeared briefly then disappeared every time.

**Root cause:** The trends fetch was calling `apiFetch(path, options)` — but `apiFetch` only accepts `(path)` and silently ignores any second argument. Every trends request was sent as a GET instead of POST. The backend has no GET route for `/api/trends/:gamePk`, so it failed, the `.catch()` ran, and `liveTrends[key]` was set to `null`, blanking the card.

**Fix:** One-line change — replaced `apiFetch(...)` with `apiMutate(path, "POST", { context })`.

`apiMutate` signature: `(path, method, body)` — handles Content-Type header, auth token, and `JSON.stringify` internally.

**Key distinction to remember:**
- `apiFetch(path)` — GET only, one argument, ignores options
- `apiMutate(path, method, body)` — POST/PATCH/DELETE with JSON body

---

### AI-powered Props Tab (Item #3)

Full AI Analysis section added below the existing deterministic props in the Props tab.

#### Backend — `backend/routes/props.js` (new file)

```
POST /api/props/:gamePk
Body: { context: string }
Returns: { props: [...], gamePk: number }
Cache TTL: 45 minutes
Model: claude-haiku-4-5-20251001
Max tokens: 1000
```

Same lazy-init Anthropic client pattern as `trends.js`. System prompt instructs the model to return **only** a JSON array — no markdown fences, no wrapper text. Backend extracts the array via regex (`/\[[\s\S]*\]/`) to handle any stray formatting, then validates each prop object has all required fields before caching.

Prop object shape:
```json
{
  "label": "Game Total UNDER 8.5",
  "propType": "Total",
  "confidence": 58,
  "lean": "UNDER",
  "positive": false,
  "reason": "ATL bullpen carries 187pc fatigue vs PHI's fresh Grade A– pen, suppressing late-inning offense."
}
```

Prop types: `"K"` | `"Total"` | `"NRFI"` | `"F5"` | `"Outs"` | `"RL"`

`positive` rules: OVER/NRFI/OVER F5/HOME -1.5/AWAY -1.5 → `true`; UNDER/YRFI/UNDER F5 → `false`

The prompt instructs the model to **omit a prop entirely** rather than guess — only include if confidence is genuinely ≥ 55.

Mounted in `backend/server.js`:
```js
app.use("/api/props", require("./routes/props")); // Anthropic: AI-generated prop recommendations per game
```

#### Frontend — `prop-scout-v7.jsx`

**`buildPropsContext(game, odds, parkFactors)`** — new module-level helper (after `buildTrendsContext`). Richer than the trends context builder — includes:
- Both SP full stat lines + arsenal (pitch type, usage %, whiff %)
- Weather (temp, wind, conditions, rain chance)
- Umpire (K rate, BB rate, tendency)
- Both bullpen grades with top 3 relievers + pitches/rest
- First-inning scoring data (NRFI lean, %, both teams)
- Lineup handedness (RHB/LHB count vs SP hand)
- Odds (O/U, ML, RL)
- Park factors (HR/hit multiplier)

**New state:**
```js
const [liveAiProps,  setLiveAiProps]  = useState({});  // gamePk → [...] | "loading" | null
const aiPropsFetched = useRef(new Set());               // stale-closure guard
```

**useEffect** — fires when `tab === "props"`, same `useRef` guard pattern as `trendsFetched` to prevent stale-closure re-fetches.

**Props tab render** — "AI ANALYSIS" section with purple `AI` badge appears below existing prop cards:
- Loading: pulsing purple dot + "Analyzing game data…"
- Loaded: prop cards with same `ConfBar`, `LeanBadge`, parlay 🔗, and log ＋ buttons as deterministic props
- Failure: silent null (no error state shown)

AI props fully integrate with the parlay slip and pick log — they use the same `logPick`, `isLogged`, and `parlayLabels` state.

#### What line sources the AI uses
- **Game total O/U line** (e.g. "8.5") — comes from The Odds API data passed in context
- **K prop line** — still from the deterministic `computeLiveProps` engine (K/9 × avgIP derived estimate), not a sportsbook line
- **NRFI/YRFI, F5, RL** — AI-generated lean, no sportsbook line attached

**Backlogged:** Sportsbook player prop lines (actual DK/FD K/TB props via The Odds API `markets=pitcher_strikeouts,batter_total_bases` endpoint). Would give the AI real market lines to anchor against instead of computed estimates. Costs additional API quota.

---

### Backlog Update

Items #7 (AI Trends) and #9 (AI Props) in the Future Enhancements section are now complete. New backlog addition:

**Sportsbook prop lines** *(medium complexity)*
Pull actual sportsbook K/TB/hits prop lines from The Odds API using `markets=pitcher_strikeouts,batter_total_bases,batter_hits`. Pass the real market lines (e.g. "Cole K's O/U 7.5 at -115") in the props context so the AI anchors its recommendations against actual listed lines instead of computed estimates. Costs additional API quota per request.

---

### Files Changed in Session 34

- `prop-scout-v7.jsx`
- `backend/routes/props.js` (new)
- `backend/server.js` (mounted `/api/props`)
- `prop-scout-handoff.md`

---

*Updated April 19 2026 — Session 34 complete · AI Trends bug fix · AI-powered Props Tab shipped*

---

## ✅ Session 35 — Low Complexity Backlog Items (1–3) + Medium Complexity Items (4, 6)

All changes in `prop-scout-v7.jsx` and `backend/` unless noted.

---

### Item 1 — Primary Chase Pitch Callout (Pitch Type Matchup Surfacing)

Added to the **Lineup Matchup Intel card** in the Overview tab, below the danger batters list.

- Scans `activePitcher.arsenalLive` for the highest-whiff pitch
- Shows **ELITE** badge (≥ 38% whiff) or **SOLID** badge otherwise
- When 3+ lineup batters have splits loaded (`batterSplits` state), computes and shows the lineup's aggregate AVG vs that pitch type
- If no arsenal live data, the section doesn't render

---

### Item 2 — Last 3 Starts Mini Table

Added to the **pitcher card** in the Overview tab, between the ERA sparkline and the "Last 3 ERA" summary line.

- 7-column CSS grid: **OPP | Date | IP | K | ER | RES | PC**
- K values: purple monospace
- ER: green (0), amber (1–2), red (3+)
- RES (win/loss/no-decision): green W, red L, muted ND
- PC (pitch count): from `g.pc` — added `pc: g.stat?.numberOfPitches ?? null` to `backend/routes/players.js` pitching gamelog objects

**Backend change:** `backend/routes/players.js` — added `pc` field to each game in the pitching gamelog response.

---

### Item 3 — K% Confluence Note

Added below the Primary Chase Pitch section in the Lineup Matchup Intel card.

**Thresholds:**
- **Green** ("High K environment — pitcher K/9 X.X, lineup weak vs breaking balls"): K/9 ≥ 9.0 AND avg lineup matchup score ≤ 45
- **Amber/Red** ("Contact matchup — pitcher K/9 X.X, lineup makes solid contact"): K/9 ≤ 6.5 AND avg lineup matchup score ≥ 42

Both conditions must be met for the note to show. Neither threshold alone is sufficient. Values tuned after testing with real pitchers (Painter K/9 10.05, Keller K/9 5.90).

---

### Item 4 — Out-of-Position Player Flag

Added `⚠ {pos} (norm. {primaryPos})` badge to each batter row in the **Lineup tab**.

**Logic:**
```js
const oop = b.primaryPos && b.pos !== b.primaryPos
  && b.pos !== "DH" && b.primaryPos !== "DH"
  && !(OF.has(b.pos) && OF.has(b.primaryPos));  // same-outfield moves not flagged
```

Outfield set: `LF`, `CF`, `RF` — rotations within the outfield are platoon decisions, not meaningful flags.

**Backend change — `backend/routes/lineups.js`:**
- URL changed to `?hydrate=person` (was missing the hydrate param)
- Added `primaryPos: player.person.primaryPosition?.abbreviation ?? null` to `transformTeam()`

---

### Batter Hand Fix — Overview Danger Batters (`?H`)

**Problem:** Overview tab danger batter rows showed `?H` for batting hand.

**Root cause:** The hand was read from `b.hand` (raw lineup data from boxscore, often null/`?`), not from `liveHittingLog` which has reliable `batSide` data from the `/people/:id` call.

**Fix:** Same pattern already used in the Lineup tab — now also applied to Overview danger batters:
```js
const hlog = liveHittingLog[b.id];
const hand = (hlog?.hand && hlog.hand !== "?") ? hlog.hand : (b.hand ?? "?");
```

---

### Item 6 — Pitcher vs L/R Splits

#### Backend — `backend/routes/pitcherSplits.js` (new file)

```
GET /api/pitcher-splits/:pitcherId
Cache TTL: 6 hours
```

Two parallel Baseball Savant CSV fetches — `stand=L` and `stand=R` — via the same Statcast CSV endpoint used by `splits.js`. Aggregates pitch-level events:
- `HIT_EVENTS`: single, double, triple, home_run
- `K_EVENTS`: strikeout, strikeout_double_play
- `OUT_EVENTS`: field_out, grounded_into_double_play, force_out, etc.
- Also: walk, hit_by_pitch

Computes per handedness: `avg`, `kPct`, `bbPct`, `pa`. Minimum 15 PA required — returns `null` for that side if sample too small. Falls back to prior year if current season has no qualifying data.

Return shape:
```json
{ "pitcherId": 669456, "season": 2026, "vsL": { "avg": ".261", "kPct": "24%", "bbPct": "8%", "pa": 47 }, "vsR": { "avg": ".218", "kPct": "31%", "bbPct": "6%", "pa": 89 } }
```

Mounted in `backend/server.js`:
```js
app.use("/api/pitcher-splits", require("./routes/pitcherSplits")); // Baseball Savant: pitcher vs LHH/RHH
```

#### Frontend — `prop-scout-v7.jsx`

**New state:**
```js
const [pitcherPlatoonSplits, setPitcherPlatoonSplits] = useState({});
// pitcherId → { vsL, vsR, season } | "loading" | null
```

**useEffect** — fires when `view === "game"` and `pitcherSide` changes. Lazy fetch with `key in pitcherPlatoonSplits` guard to avoid re-fetching.

**Pitcher card render** — compact two-box row (vs LHH / vs RHH) between the stat boxes and W/L record line:
- AVG color: green ≤ .220 (pitcher dominant), red ≥ .280 (batters hit hard), white = neutral range
- Format: `.247 AVG` (monospace, 11px bold)
- Sub-line: `{kPct} K · {bbPct} BB · {pa} PA`
- **Loading skeleton**: "loading…" shown while fetch is in-flight (was previously invisible)
- **Small sample fallback**: italic "Platoon splits unavailable (small sample)" if both vsL and vsR are null

---

### Backlog Status After Session 35

All three 🟢 Low Complexity items: **COMPLETE**
Medium complexity items 4 and 6: **COMPLETE**
Item 5 (UmpScorecards auto-refresh): **Backlogged** — user chose to skip for now

Remaining open items:
- **Item 8** (Injury flags / lineup scratch alerts) — covered by AI Props web search when that's upgraded
- **AI Props sportsbook lines** — pull actual DK/FD K/TB prop lines via Odds API `markets=pitcher_strikeouts,batter_total_bases` to give AI real market lines to anchor against
- ⚫ Infrastructure items (PostgreSQL, CLV tracking, sharp/public splits, prediction market odds)

---

### Files Changed in Session 35

- `prop-scout-v7.jsx`
- `backend/routes/players.js` (added `pc` field to pitching gamelog)
- `backend/routes/lineups.js` (added `?hydrate=person`, added `primaryPos` field)
- `backend/routes/pitcherSplits.js` (new file)
- `backend/server.js` (mounted `/api/pitcher-splits`)
- `prop-scout-handoff.md`

---

*Updated April 19 2026 — Session 35 complete · Backlog items 1–4 + 6 shipped · Platoon splits loading skeleton + fallback UX*

---

## ✅ Session 36 — Sportsbook Lines + Tavily Web Search + Cache Bug Fix

All changes in `prop-scout-v7.jsx` and `backend/` unless noted.

---

### Sportsbook Prop Lines (Client-Side Fetch)

Added a **SPORTSBOOK LINES** section to the Props tab, showing real DraftKings/FanDuel player prop lines for K, Total Bases, and Hits.

#### Architecture decision — client-side fetch

Initially built as a backend route (`backend/routes/playerProps.js`), but moved to a direct client-side fetch after discovering `ODDS_API_KEY` was not in `backend/.env` (the frontend uses `VITE_ODDS_API_KEY` already set in Vite's env). Avoids adding another key to the backend and reuses the event IDs already fetched during the existing `fetchOdds` call.

#### `oddsCache` — added `eventIdMap`

```js
const oddsCache = { data: null, ts: 0, remaining: null, used: null, fetchedAt: null, error: null, eventIdMap: null };
```

In `fetchOdds`, the event ID from the Odds API response is now stored per game key:

```js
const eventIdMap = {};
games.forEach(g => {
  eventIdMap[`${g.away_team}|${g.home_team}`] = g.id;
  // ... existing mapping
});
oddsCache.eventIdMap = eventIdMap;
```

#### `fetchPlayerPropsDirect` — new module-level function

```js
const playerPropsCache    = {};
const PLAYER_PROPS_TTL_MS = 10 * 60 * 1000;
const PLAYER_PROP_MARKETS = "pitcher_strikeouts,batter_total_bases,batter_hits";
const PLAYER_PROP_BOOKS   = "draftkings,fanduel,williamhill_us,betmgm";

const fetchPlayerPropsDirect = async (awayName, homeName) => {
  if (IS_ODDS_SANDBOX || !ODDS_API_KEY) return [];
  const cacheKey = `${awayName}|${homeName}`;
  const cached   = playerPropsCache[cacheKey];
  if (cached && (Date.now() - cached.ts) < PLAYER_PROPS_TTL_MS) return cached.props;
  if (!oddsCache.eventIdMap) await fetchOdds();
  const eventId = oddsCache.eventIdMap?.[cacheKey];
  if (!eventId) { playerPropsCache[cacheKey] = { props: [], ts: Date.now() }; return []; }
  const res = await fetch(
    `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/${eventId}/odds` +
    `?apiKey=${ODDS_API_KEY}&markets=${PLAYER_PROP_MARKETS}&regions=us&oddsFormat=american&bookmakers=${PLAYER_PROP_BOOKS}`
  );
  if (!res.ok) throw new Error(`Odds API ${res.status}`);
  // ... parse outcomes into flat prop list, sort, cache, return
};
```

#### `livePlayerProps` state + useEffect

```js
const [livePlayerProps, setLivePlayerProps] = useState({});
// gamePk → undefined (not fetched) | "loading" | { props } | { props, error: true }
const playerPropsFetched = useRef(new Set());
```

useEffect fires when `tab === "props"` — same lazy-fetch pattern with `useRef` guard. Sets `"loading"` state, then resolves to `{ props }` on success or `{ props: [], error: true }` on failure (never `null` — keeps section visible).

#### `ppReady` — timing guard for AI props

```js
const ppReady = IS_ODDS_SANDBOX || (ppState !== undefined && ppState !== "loading" && typeof ppState === "object");
```

AI props useEffect depends on `[..., livePlayerProps]` so it re-fires when player props load. `ppReady` blocks AI fetch until player props are settled, so the AI has real market lines in context.

#### Props tab render — SPORTSBOOK LINES section

- Shows between Prop Confidence Meters and AI Analysis
- Groups props by market: K lines first, then TB, then H
- Each row: player name · line · over/under odds · book name
- "No player prop lines posted yet" shown if `props` is empty (early in day or sandbox)

---

### Tavily Web Search Integration

Added real-time injury and lineup news to the AI Props context via Tavily.

#### Backend — `backend/routes/props.js`

**`tavilySearch(query)` helper:**

```js
const tavilySearch = async (query) => {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null; // key not configured — skip silently

  const cacheKey = `tavily:${Buffer.from(query).toString("base64").slice(0, 40)}`;
  const cached   = cache.get(cacheKey);
  if (cached !== undefined) return cached; // null is a valid cached result (prior failure)

  try {
    const res = await axios.post("https://api.tavily.com/search", {
      api_key: apiKey, query,
      search_depth: "basic", max_results: 3, include_answer: true,
    }, { timeout: 8000 });
    const answer = res.data.answer ?? null;
    cache.set(cacheKey, answer, SEARCH_TTL); // 20-minute TTL
    return answer;
  } catch (err) {
    cache.set(cacheKey, null, SEARCH_TTL);
    return null;
  }
};
```

**3 parallel searches** before each AI call:
1. Away SP injury status
2. Home SP injury status
3. `{awayAbbr} {homeAbbr}` lineup / scratch news

News injected into context:
```
Real-time news (factor into confidence if relevant):
1. [Tavily answer for SP 1]
2. [Tavily answer for SP 2]
3. [Tavily answer for lineup news]
```

Returns `{ props, gamePk, searchUsed }`. `searchUsed: true` when at least one Tavily answer was non-null.

**Setup:** Add `TAVILY_API_KEY=tvly-…` to `backend/.env`. Free tier at tavily.com. Gracefully skips if key is absent.

#### Frontend — `prop-scout-v7.jsx`

`liveAiProps` state now stores the full response object `{ props, searchUsed }` instead of just the array:

```js
const result = props ? { props, searchUsed: d.searchUsed ?? false } : null;
setLiveAiProps(prev => ({ ...prev, [key]: result }));
```

Reads:
```js
const aiProps    = Array.isArray(aiState?.props) ? aiState.props : [];
const searchUsed = aiState?.searchUsed === true;
```

Blue **WEB** badge shown in AI ANALYSIS header when `searchUsed === true`:
```jsx
{searchUsed && <span style={{ fontSize: 8, fontWeight: 700, color: "#38bdf8", ... }}>WEB</span>}
```

---

### Cache Bug Fix — `cache.get()` returning `null` for missing keys

**Root cause:** `backend/services/cache.js` returned `null` for a cache miss:

```js
if (!entry) return null; // BUG — should be undefined
```

But `tavilySearch` checked `if (cached !== undefined) return cached;` to distinguish "not cached yet" from "cached as null (prior failure)". Since `null !== undefined` is `true`, **every Tavily call returned `null` immediately on the first hit** — the API was never reached.

**Fix — `backend/services/cache.js`:**

```js
// Before
if (!entry) return null;
if (Date.now() > entry.expiresAt) { delete store[key]; return null; }
// After
if (!entry) return undefined;
if (Date.now() > entry.expiresAt) { delete store[key]; return undefined; }
```

All other cache consumers use `if (cached)` truthiness checks, so `undefined` vs `null` for a miss is backward compatible. Only `tavilySearch` needed the `undefined` signal.

---

### Backend route kept but unused

`backend/routes/playerProps.js` was built and mounted at `/api/player-props` in `server.js` as a backend alternative for sportsbook lines. The frontend switched to client-side fetch instead (see above), but the route is still registered and functional if needed.

---

### Files Changed in Session 36

- `prop-scout-v7.jsx`
- `backend/routes/props.js` (Tavily integration + `searchUsed` in response)
- `backend/routes/playerProps.js` (new — backend route, currently unused by frontend)
- `backend/server.js` (mounted `/api/player-props`)
- `backend/services/cache.js` (bug fix: `null` → `undefined` for cache misses)
- `backend/.env` (user added `TAVILY_API_KEY`)
- `prop-scout-handoff.md`

---

*Updated April 19 2026 — Session 36 complete · Sportsbook Lines · Tavily web search · cache.get() bug fix*

---

## 📋 Current Backlog (post-Session 44)

### 🟢 New Features

- **Lineup lock warning** — alert when a game's lineups haven't posted within 30 min of first pitch. Useful to avoid acting on stale data. Can derive from `game.time` + lineup confirmed status already tracked.
- **CLV tracking** — log the closing line vs the line at time of pick. Positive CLV over time is the strongest edge indicator. Requires a scheduled Odds API snapshot at first pitch for each game's total/ML/RL. K prop closing lines would need the sportsbook lines endpoint called one final time just before first pitch.

### ♿ Accessibility (WCAG 2.1 AA — pre-public release)

Required before any public launch to avoid ADA Title III exposure. Work periodically — each item below is independently shippable.

- **Font sizes** — increase minimum from 8–9px to 12px+ throughout. Most tedious fix; touches nearly every component.
- **Color-only signals** — add shape/text backup alongside all color indicators (green/red hit-miss dots, score badge colors, streak colors). E.g. add ✓/✗ icons, pattern fills, or text labels so colorblind users get the same info.
- **Semantic HTML** — replace interactive `<div>`/`<span>` with `<button>`, `<nav>`, `<main>`, `<section>`, `<header>`. Add `role` and `aria-*` attributes throughout.
- **`aria-label` on icon buttons** — the `?`, ✕ close, copy, and other icon-only buttons need accessible names.
- **Keyboard navigation** — all interactive elements need visible focus rings and keyboard event handlers (Enter/Space on custom buttons). Tab order should follow visual layout.
- **Contrast audit** — dark gray text on dark backgrounds in several areas fails 4.5:1 ratio. Run axe or Lighthouse and fix flagged elements.
- **`aria-live` regions** — dynamic updates (live score, AI props loading, sync status) need `aria-live="polite"` so screen readers announce changes.

Estimated effort: 2–3 weeks of focused work touching the entire JSX file.

### 🔒 Cybersecurity Hardening (pre-public release)

Lighter lift than accessibility. Can be done in a focused sprint.

- **`helmet.js`** — one-line addition to `server.js`. Gets CSP, HSTS, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy headers for free.
- **Rate limiting** — add `express-rate-limit` on all routes, stricter limits on `/api/auth/login` and `/api/auth/register` to prevent brute force.
- **Lock CORS** — change `origin: "*"` to the actual production domain(s) only.
- **Move Odds API key server-side** — `VITE_ODDS_API_KEY` is currently exposed in the browser bundle. Flip player prop fetching to go through the existing `backend/routes/playerProps.js` route (already built) and remove the client-side key.
- **Input validation** — add `zod` schema validation on all `POST`/`PATCH` body payloads (picks, notes, auth). Currently unsanitized.
- **Migrate picks/notes to Postgres** — flat JSON files (`picks.json`, notes) are fine for personal use but not at public scale. Railway Postgres is already set up; just needs the routes migrated.
- **Admin endpoint hardening** — `/api/admin/jobs/run` uses a single header secret. Add IP allowlist or convert to a proper cron job.
- **Request size limits** — add `express.json({ limit: "10kb" })` to prevent large payload attacks.

Estimated effort: 2–4 days for a focused backend security pass.

### ⚫ Infrastructure

- **Pick persistence on Railway** — Railway Postgres is now merged into `main` and production verified for schedule snapshots. See Session 37 below. Remaining follow-up: monitor scheduled jobs, confirm tomorrow's automatic slate refresh, and eventually move user picks/notes/digest off flat JSON if desired.
- **Sharp/public split data** — requires a paid data provider (e.g. Action Network, Bet Labs). Low priority.
- **Prediction market odds** — Kalshi/Polymarket MLB game props. Niche but interesting signal source.

### 🧹 Housekeeping

- ✅ **`backend/routes/playerProps.js`** — documented with a comment explaining it's unused (frontend fetches client-side). Kept in place as a clean backend alternative if we ever want to hide `VITE_ODDS_API_KEY` from the browser bundle.
- ✅ **Sportsbook lines → AI context** — verified. `livePlayerProps` is in the AI props effect dep array. Effect waits for `ppReady` before building context. `playerLines` is passed to `buildPropsContext` which appends `Market K lines` / `Market TB lines` / `Market Hits lines` to the AI prompt. If lines aren't posted yet, AI fires without market context (acceptable). Pipeline is correct.

---

## ✅ Session 37 — Railway Postgres Rollout + DB Fallback Hardening

Postgres infrastructure has been merged from `feat/postgres-data-layer` into `main` and deployed to Railway.

### What happened

After merging the Postgres branch, production initially showed an inaccurate 6-game slate while local showed the correct 15-game slate. Direct API testing showed:

- `/health` returned `200`
- `/api/schedule` initially returned Railway `502 Application failed to respond`
- the frontend fell back to its embedded/mock slate when schedule failed

Root cause: DB-first live-data routes were treating Postgres as too mandatory. If the Railway Postgres connection/table lookup was unavailable, slow, or not migrated yet, the route could fail before falling back to live MLB Stats API data.

### Backend hardening patch

Patched the DB layer so Postgres remains an optimization, not a blocker:

- `backend/services/db.js`
  - Added short Postgres connection/query/statement timeouts.
- `backend/routes/schedule.js`
  - Wrapped DB lookup in `try/catch`; falls back to live MLB schedule on DB error.
- `backend/routes/linescore.js`
  - Wrapped DB lookup in `try/catch`; falls back to live MLB linescore.
- `backend/routes/bullpen.js`
  - Wrapped game-level DB lookup in `try/catch`; falls back to live bullpen builder.
- `backend/routes/umpires.js`
  - Wrapped DB lookup in `try/catch`; falls back to live MLB boxscore officials.
- `backend/jobs/scheduler.js`
  - Wrapped scheduler slate lookups in `try/catch` so job loops do not crash/spam on DB issues.

Verification before deploy:

- `npm run build` passed.
- Backend modules loaded cleanly.
- Local `/api/schedule` returned full 15-game slate.
- Simulated broken `DATABASE_URL` still returned full schedule via MLB fallback.

Suggested commit message used/planned:

```bash
Harden Postgres fallback for live data routes
```

### Railway setup completed

Railway Postgres was provisioned in the same project as `ai-agent-mlb`.

App service variables were wired:

- `DATABASE_URL=${{ Postgres.DATABASE_URL }}` for production app runtime
- `ADMIN_SECRET=...` for manual job trigger
- `ENABLE_JOBS=true`

Migration was run from local terminal using the public Railway Postgres URL because the private internal host (`postgres.railway.internal`) is only resolvable inside Railway:

```bash
DATABASE_URL="postgresql://...@roundhouse.proxy.rlwy.net:47167/railway" node backend/scripts/migrate.js
```

Result:

```txt
✓ PostgreSQL connected
✅ Migrations applied
```

Manual snapshot trigger was run successfully:

```bash
curl -H "x-admin-secret: <ADMIN_SECRET>" \
  https://ai-agent-mlb-production.up.railway.app/api/admin/jobs/run
```

Result:

```json
{"ok":true,"ran":["snapshotSlate","snapshotOdds"]}
```

### Production verification

Cache was cleared and schedule was requested with a cache-busting query param:

```bash
curl -s -X DELETE https://ai-agent-mlb-production.up.railway.app/api/cache
curl -i "https://ai-agent-mlb-production.up.railway.app/api/schedule?cb=$(date +%s)"
```

Confirmed:

- HTTP `200`
- full 15-game slate returned
- header showed app-level DB read:

```txt
x-cache: DB-HIT, MISS
```

The `DB-HIT` confirms Railway Postgres is migrated, populated, and serving the schedule snapshot. `MISS` is Railway/Fastly edge cache metadata appended to the same header.

### Current status

- ✅ Postgres branch merged to `main`
- ✅ Railway deployment successful
- ✅ Migration applied
- ✅ Manual snapshot job succeeded
- ✅ `/api/schedule` served from Postgres with `DB-HIT`
- ✅ MLB fallback is hardened if DB is unavailable
- ✅ Production slate accuracy recovered

### Follow-up checks

- Monitor Railway logs for repeated:
  - `DB pool error`
  - `relation ... does not exist`
  - `snapshotSlate failed`
  - `snapshotOdds failed`
  - `Scheduler slate lookup skipped`
- Tomorrow, verify the scheduled 8 AM Honolulu `snapshotSlate` job refreshes the next slate automatically.
- During/after live games, verify DB-backed routes as snapshots become available:
  - `/api/linescore/:gamePk`
  - `/api/bullpen/:gamePk`
  - `/api/umpires/:gamePk`

---

*Updated April 19 2026 — Session 37 complete · Railway Postgres merged/deployed · migration + schedule DB-HIT verified · fallback hardened*

---

## ✅ Session 38 — Boxscore Tab + Auto-Grading + Extended Splits

### What shipped

**Boxscore tab (`BOXSCORE` — 7th tab)**
- New `backend/routes/boxscore.js` mounted at `GET /api/boxscore/:gamePk`
- Fetches `/game/{gamePk}/boxscore` + `/game/{gamePk}/linescore` in parallel (free MLB Stats API)
- Returns `{ gamePk, isFinal, linescore: { innings[], away/home R/H/E }, batting: { away[], home[] }, pitching: { away[], home[] } }`
- 60s TTL for live games, 24h for finals
- Frontend: single toggle controls both batting table and pitching card (away/home)
- Linescore grid with per-inning runs, R/H/E totals, winner highlighted green
- Batting table: hits bolded, runs blue, RBI yellow, HRs orange, Ks red
- Pitching card: SP labeled blue, Ks green, ER red

**Auto-grading picks**
- `computeGrade(pick, box)` handles: NRFI, YRFI, Game Total O/U, F5 total, Run Line, Pitcher K's O/U, Pitcher Outs O/U
- NRFI/YRFI matched with `.startsWith()` — handles labels like "NRFI · TEX @ SEA"
- `gamePk` comparison uses loose `==` — handles string/number mismatch from localStorage
- Grading fires two ways:
  1. On load: when `liveSlate.status === "Final"` for a game with pending picks
  2. Mid-session: when linescore poll returns `inning === null` with runs scored — catches games that finish while app is open without reload
- `gradedGames` ref prevents double-grading

**Extended splits — Pitcher Home/Away + Batter vs L/R**
- New `backend/routes/statSplits.js` mounted at `GET /api/stat-splits/:playerId?group=pitching|hitting`
- Calls MLB Stats API `stats=statSplits` with `sitCodes=h,a,vl,vr,d,n`
- Matches splits by `split.code` with description keyword fallback (API codes not always consistent)
- Falls back to prior season if current year returns no data
- 6h cache
- **Pitcher card (Overview)**: Home/Away ERA + WHIP + IP row appears below existing vs LHH/vs RHH row. Loads lazily on pitcher card open.
- **Batter drawer (Lineup)**: vs LHP / vs RHP AVG/OBP/SLG row above the vs-arsenal section. Side matching today's facing pitcher highlighted blue with "TODAY" badge. Loads lazily on drawer expand.

### Updated backlog

**Completed this session:**
- ✅ Boxscore tab (live + final games)
- ✅ Auto-grading (NRFI/YRFI/Total/F5/RL/K/Outs)
- ✅ Pitcher Home/Away splits (Overview pitcher card)
- ✅ Batter vs L/R splits (Lineup drawer)

**Completed this session (Session 39):**
- ✅ Pitcher Day/Night splits (Overview pitcher card — below Home/Away row)
- ✅ Batter Day/Night splits (Lineup drawer — below vs L/R row)
- Both highlight the applicable side with a "TODAY" badge based on `game.time` (day = before 5 PM)
- No new backend work — `statSplits` already returned `day`/`night` fields; pure frontend display addition

**Remaining Medium Complexity:**
- Batter Home/Away, Grass/Turf splits — lower priority
- CLV tracking — log closing line vs line at pick time; needs scheduled Odds API snapshot at first pitch

**Housekeeping:**
- Remove or document unused `backend/routes/playerProps.js`
- Verify sportsbook lines reach AI props context pre-game (K prop reason should cite actual DK/FD line)

---

## ✅ Session 39 — Day/Night Splits

### What shipped

**Pitcher Day/Night splits (Overview pitcher card)**
- New render block inserted below the Home/Away row in the pitcher card
- Reads `liveStatSplits[\`${activePitcher.id}:pitching\`].day` and `.night` (already populated from Session 38's statSplits fetch)
- Shows ERA + WHIP + IP for Day and Night
- "TODAY" badge + blue highlight on whichever applies: parses `game.time` string, day = start time before 5 PM

**Batter Day/Night splits (Lineup drawer)**
- New render block inserted below the vs L/R row in the batter expanded drawer
- Reads `liveStatSplits[\`${b.id}:hitting\`].day` and `.night`
- Shows AVG / OBP / SLG + AB sample
- "TODAY" badge + blue highlight matching same game time logic

### Verified working (screenshot confirmed)
- PJ Poulin pitcher card: DAY TODAY 3.86 ERA / 1.86 WHIP · 7.0 IP vs NIGHT 3.38 ERA / 0.94 WHIP · 5.1 IP — blue highlight + TODAY badge correct
- Willy Adames batter drawer: DAY TODAY .162 / OBP .184 / SLG .216 (37 AB) vs NIGHT .308 / OBP .368 / SLG .635 (52 AB) — positioned between vs L/R and arsenal section, TODAY badge firing correctly

*Updated April 19 2026 — Session 39 complete · Day/Night splits verified working (pitcher card + batter drawer)*

---

## ✅ Session 40 — Batter Home/Away + Grass/Turf Splits

### What shipped

**Backend (`backend/routes/statSplits.js`)**
- Added `gr,tu` to `sitCodes` parameter — MLB API now returns grass/turf splits alongside existing ones
- Added `grass` and `turf` entries to `CODE_MAP` (code match: `gr`/`tu`, description fallback: "grass"/"turf"/"artificial")
- Result object now includes `grass` and `turf` fields alongside existing `home`/`away`/`vsL`/`vsR`/`day`/`night`
- **Note:** clear backend cache after deploying so new fields are populated (hit `DELETE /api/cache` or restart)

**Frontend (`prop-scout-v7.jsx`)**
- Added `turf: true` to Rogers Centre, Tropicana Field, loanDepot park in `STADIUMS` map
- New **Home/Away** batter split row in expanded drawer (between Day/Night and vs-arsenal)
  - TODAY badge: derived from `lineupSide` — `"home"` → batter plays Home today, `"away"` → Away today
- Grass/Turf was attempted but MLB Stats API only returns 6 codes (h/a/d/n/vl/vr) — `gr`/`tu` not available. Frontend block removed.

**Batter drawer split order (final):**
1. vs LHP / vs RHP (TODAY = facing pitcher's hand)
2. Day / Night (TODAY = game time < 5 PM)
3. Home / Away (TODAY = lineupSide)
4. vs pitcher's pitches (arsenal)

*Updated April 19 2026 — Session 40 complete · Batter Home/Away + Grass/Turf splits*

---

## ✅ Session 41 — Board View (HR + Hits ranked list)

**Bug fixed:** Board view JSX block was placed inside `{showHelp && (...)}` (the help overlay) instead of as a sibling view block. It was never rendering because `showHelp` is false when `view === "board"`. Fixed by moving the block to the correct location — after the picks IIFE closes at line 5994, before the footer — matching the 8-space indentation of all other view blocks.

**Board view features:**
- Amber **BOARD** nav button (top right, after Picks)
- HR / Hits tab toggle (amber = active)
- Cross-slate ranked list of top 20 batters, sorted by composite score
- **HR board scoring** (`hrBoardScore`): SLG (30 pts), HR pace (25 pts), park factor (20 pts), wind (10 pts), batting order (10 pts), platoon split (5 pts) → 0–95 scale
- **Hits board scoring** (`hitBoardScore`): AVG (35 pts), recent form/last7Avg (25 pts), park factor (15 pts), batting order (15 pts), platoon split (10 pts) → 0–95 scale
- Score color: green ≥70, amber ≥55, red ≥40, gray <40
- Each card shows: rank, name, team badge, lineup slot, pitcher (hand), game label, AVG / HR / SLG / OPS / park %, L5 hit dots, prop line from Odds API if available
- ↑ WIND badge on HR cards when weather is favorable
- Click any card → opens that game's Lineup tab
- Score badge color-coded (green/amber/red)

**Pre-fetch logic (board view useEffect):**
- Triggers when `view === "board"` (or liveLineups changes)
- Eagerly fetches hitting gamelogs (`/api/players/:id/gamelog?group=hitting`) for all confirmed lineup batters
- Eagerly fetches player props (`fetchPlayerPropsDirect`) for all slate games
- Deduplicates with `boardPropsFetched` ref to avoid re-fetching

**Backend change (Session 40, still relevant):**
- `backend/routes/players.js` gamelog hitting response now includes `slg: seasonSplit?.sluggingPercentage ?? ".000"` — required for HR board scoring

**Prop markets expanded:**
- `PLAYER_PROP_MARKETS` now includes `batter_home_runs`
- `PLAYER_PROP_LABELS` has `batter_home_runs: "HR"` 
- Board prop line display: `HR O{line} {overOdds} · {book}` or `H O{line} {overOdds} · {book}`

**State added:**
- `boardTab` — "hr" | "hits", persists tab selection
- `boardPropsFetched` — useRef(Set) to track which gamePks have had props fetched

*Updated April 20 2026 — Session 41 complete · Board view (HR + Hits) fixed and verified live*

---

## ✅ Session 42 — Injury Feed

**What was added:**
- `backend/routes/injuries.js` already existed (pre-built) — just needed to be mounted
- `backend/server.js`: mounted `app.use("/api/injuries", require("./routes/injuries"))`
- Frontend state + fetch was also pre-built: `liveInjuries` state (array), `apiFetch("/api/injuries")` on mount, `injuredIds` Set computed at render time

**Three IL badge locations:**
1. **Slate card** (`SlateCard` component) — `⚠ SP IL` red pill badge in the lean badges row when either team's probable pitcher (`game.pitcher.id` or `game.awayPitcher.id`) is in the injury set. `injuredIds` passed as a new prop (defaults to `new Set()` so old calls don't break)
2. **Overview pitcher card** — `⚠ IL` red pill next to the pitcher's name (inside the name+badge row div, before `kLeanBadge`)
3. **Lineup tab batter rows** — `⚠ IL` red pill next to batter name (was pre-wired, just needed route mounted)

**Backend route behavior (`/api/injuries`):**
- Fetches MLB Stats API `/transactions` for last 14 days (`sportId=1`)
- Filters for IL placements only (not activations/reinstatements)
- Deduplicates by `playerId` — keeps most recent transaction per player
- Returns `{ injuries: [{ playerId, playerName, team, status, date, description }] }`
- 30-min backend cache (`CACHE_TTL_MS`)
- Only fires when `IS_STATS_SANDBOX = false`

*Updated April 20 2026 — Session 42 complete · Injury feed live*

---

## ✅ Session 43 — ROI Dashboard

**What was added:** A unit P&L row appended inside the existing "My Pick Log" stats card at the top of the Picks view. Only renders when `graded > 0`.

**Three tiles (flex row, equal width):**
1. **Net Units** — `hits × 0.909 − misses` (flat −110 assumption). Big monospace number, green/red. Shows `+X.Xu` or `−X.Xu`.
2. **ROI%** — `(netUnits / graded) × 100`. Green when positive, red when negative. Shows graded count below.
3. **Best Prop Type** — highest hit-rate prop type with ≥3 graded picks. Shows type label (K, Hits, TB, etc.) + hit rate %. Falls back to "—" + "need 3+ per type" when no type has enough data.

**Unit math:** flat −110 standard (industry default). Win = +0.909u, loss = −1u. No parlay or alternate line weighting — each pick is treated as 1 unit risked.

**getPropType resolver** (inline, same logic as Trends section): uses `p.propType` structured field first, then regex fallback on `p.label` for old picks logged before the structured field was added.

**No new state, no new API calls** — pure derivation from existing `propLog`, `hits`, `misses`, `graded` values already computed at the top of the picks IIFE.

**Backlog — closed out:**
- ✅ ROI dashboard
- ✅ Injury feed
- ✅ Board view (HR + Hits)
- Lineup lock warning — still open but low priority
- CLV tracking — still open, requires Odds API snapshot job

*Updated April 20 2026 — Session 43 complete · ROI dashboard · All major features shipped · On standby for feedback*

---

## ✅ Session 44 — Board View Expanded: K Props + Outs Tabs

**What changed:**
Board tab expanded from 2 tabs (HR, Hits) to 4 tabs — added ⚡ K Props and 📋 Outs for starting pitcher rankings.

**New scoring functions (module scope, after `hitBoardScore`):**
- `kBoardScore(pStats, gamelog, pf, umpire)` → 0–95: K/9 (35 pts), umpire K rating (20 pts), whiff pitch mix (20 pts), park K factor (15 pts), L3 avg K (10 pts)
- `outsBoardScore(pStats, gamelog, pf)` → 0–95: avg IP (35 pts), WHIP/control (25 pts), recent IP stability (20 pts), park factor (15 pts), opp K% (5 pts)
- `computePitcherBoard(type, liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps)` → top-20 SPs sorted by score

**Board view JSX changes (all in `prop-scout-v7.jsx`):**
- Tab toggle: `[["hr","⚾ HR"], ["hits","🎯 Hits"], ["k","⚡ K Props"], ["outs","📋 Outs"]]`
- `isPitcherBoard` flag: `boardTab === "k" || boardTab === "outs"`
- Compute branch: pitcher board uses `computePitcherBoard(...)`, batter board uses `computeBatterBoard(...)`
- Sub-header: unique ranking description for each of the 4 tabs
- `.map()` card branch: pitcher card shows ERA, K/9 (K tab only), WHIP, IP/gs, L3 avg K, `⚖ UMP+K` badge; batter card unchanged
- Pitcher cards click to `setTab("pitcher")`, batter cards click to `setTab("lineup")`
- Empty state message: "Waiting for slate to load…" for pitcher boards vs "Waiting for lineups to post…"

**PLAYER_PROP_MARKETS + LABELS (done in earlier session, referenced here):**
- Added `pitcher_outs_recorded` to `PLAYER_PROP_MARKETS` and `PLAYER_PROP_LABELS`

**Pre-fetch useEffect (done in earlier session):**
- Branches on `boardTab` — for k/outs, fetches `livePitcherStats` + `liveGameLog` for all slate SPs

**Help overlay update:**
- Board View section retitled "🏆 Board View — HR / Hits / K Props / Outs"
- Intro text updated to describe all 4 tabs
- Added entries: ⚡ K Props tab, 📋 Outs tab, ⚖ UMP+K badge, L3 avg K
- Updated L5 dots entry to clarify "Batter tabs only"
- Updated Prop line and X/Y loaded entries

**Backlog — closed out this session:**
- ✅ Board view expanded to 4 tabs (K Props + Outs for pitchers)

*Updated April 20 2026 — Session 44 complete · Board K Props + Outs tabs · pitcher card render*

---

## ✅ Session 45 — Model Picks Board Tab + Hit Counters

**What changed:**
The full tiered Model Picks card was moved out of the Slate view and into the Board view as its own first tab. Slate now stays cleaner with a compact top-3 summary, while the full model workflow lives with the rest of the board research tools.

**Slate view update (`prop-scout-v7.jsx`):**
- Replaced the full tiered Model Picks card with a compact gold-bordered top-3 card.
- Header reads `🎯 Model Picks` with a `VIEW ALL →` button.
- Shows only `topSlatePicks.slice(0, 3)`.
- Each compact row shows rank, pick label, game, lineup-confirmed badge, OVER/UNDER badge, and confidence percent.
- Clicking a row or `VIEW ALL →` now sets `boardTab` to `"model"` and switches to `setView("board")`.
- Scoring logic and `computeTopSlatePicks` were not changed.

**Board view update (`prop-scout-v7.jsx`):**
- Added a new `🎯 Model` tab before HR.
- `boardTab` now defaults to `"model"`.
- The full tiered Model Picks card now renders inside the Model tab as `🎯 Model Picks — Full Card`.
- Preserved the existing `TierSection` behavior: tier groupings, sportsbook line lookup, signal chips, confidence display, and log buttons.
- Existing HR / Hits / K / Outs board tabs remain intact and render only when their tab is selected.

**Per-tab hit counters:**
- Board tabs now show small top-right result pills when completed game data is available.
- Format is `{hits}/{total} hit`.
- Counters currently cover Model, HR, Hits, K, and Outs tabs.
- Live or unfinished games are ignored so they do not count as misses.
- Batter boards use final boxscore hitting results:
  - HR tab: hit when player HR > 0.
  - Hits tab: hit when player H > 0.
- Pitcher boards use final boxscore pitching results:
  - K tab: compares pitcher strikeouts against available prop/model line.
  - Outs tab: converts IP to outs and compares against available prop/model line.
- Board boxscore fetch now runs whenever Board view is open and stores both batter and pitcher final results in `liveBoardResults`.
- Board prefetch now loads batter and pitcher board data for all tabs while Board is open so counters can populate without visiting each tab first.

**Verification:**
- `npm run build` passed after the UI changes.

**Notes for Cowork:**
- No backend changes were made in this session.
- No scoring/model logic was changed.
- The only code file changed was `prop-scout-v7.jsx`.
- Handoff doc had stray committed conflict marker lines near the Session 37/38 boundary; those were removed while updating this note.

*Updated April 23 2026 — Session 45 complete · compact Slate model summary · Board Model tab · per-tab hit counters*

---

## ✅ Session 46 — Daily Card Scheduler + Top-Level MODEL View

**Backend — Daily Card scheduled pre-generation**

Files changed:
- `backend/routes/dailyCard.js`
- `backend/jobs/scheduler.js`
- `backend/server.js`

**What changed:**
- `dailyCard.js` now exports `{ router, regenerateDailyCard }` instead of only the router.
- Added `regenerateDailyCard()` helper:
  - clears the current Honolulu cache key (`daily-card:${todayHonolulu()}`)
  - calls the existing route internally via localhost
  - logs success/failure with games analyzed and token cost
- `server.js` now mounts the router via:
  - `const { router: dailyCardRouter, regenerateDailyCard } = require("./routes/dailyCard");`
  - `app.use("/api/daily-card", dailyCardRouter);`
- Added admin trigger endpoint:
  - `GET /api/admin/daily-card/regenerate`
  - requires `x-admin-secret === process.env.ADMIN_SECRET`
  - fire-and-forget trigger for regeneration
- `scheduler.js` now schedules two Daily Card jobs in `Pacific/Honolulu`:
  - **Morning run** at `9:00 AM`
  - **Pregame run** every 5 minutes from `8 AM–4 PM`, fires once when current time is within 95 minutes of the earliest slate game
- Pregame scheduling uses module-level guard:
  - `let _pregameRan = { date: null }`
- Added `getTodayGames()` helper in scheduler so the pregame job can read `gameTime` from `slate_snapshots.games`

**Important notes:**
- Existing Daily Card cache TTL and daily cap logic were not changed.
- Scheduled calls still count against the existing daily cap.
- Scheduler/admin regeneration works by hitting the same `/api/daily-card` path users already consume, so output format remains unchanged.

**Frontend — Model Picks moved to top-level nav**

File changed:
- `prop-scout-v7.jsx`

**What changed:**
- Added a new top-level nav tab:
  - `🎯 Model`
  - inserted between `Picks` and `Board`
- Slate compact Model summary still exists, but:
  - `VIEW ALL →` now goes to `setView("model")`
  - clicking a compact summary row also goes to `setView("model")`
- Full Model Picks card was removed from Board view.
- Board now starts directly with the ranking tabs:
  - `⚾ HR`
  - `🎯 Hits`
  - `⚡ K`
  - `📋 Outs`
- `boardTab` default was reset from `"model"` to `"hr"`

**MODEL view layout:**
- Header:
  - `🎯 Model Picks`
  - right-side badge: `ALGO · {count} picks`
- Full tier card always expanded in this view
- Reuses the same `TierSection` rendering for:
  - HIGH
  - MEDIUM
  - SPEC
- Empty-state message:
  - `"Model scoring requires probable pitchers — check back closer to game time."`

**Model performance header:**
- Added thin stats bar at top of MODEL view
- Reads from `propLog`
- Implemented backward-compatible parsing for both:
  - new shape (`loggedAt`, `outcome`)
  - legacy localStorage shape (`timestamp`, `result`)
- Current display behavior:
  - if no model picks logged today → `No picks logged today`
  - otherwise shows:
    - `Today: W-L-P`
    - `L7: XX%` when settled logs exist in last 7 days
    - `Pending: N`
- Model log filter uses `propType === "K" || propType === "Outs"` per task spec

**Shared rendering cleanup:**
- Moved `getBookLine()` and `TierSection` out of the old Board-only block into shared App scope so both the MODEL view and the Board rankings can stay cleanly separated
- Board prefetch effect now runs for both `view === "board"` and `view === "model"` so sportsbook line lookup still resolves on the Model tab

**Verification**
- `npm run build` passed
- `node --check backend/server.js` passed
- `node --check backend/routes/dailyCard.js` passed
- `node --check backend/jobs/scheduler.js` passed
- A direct `require('./backend/server')` test was intentionally not used for final verification because it immediately attempts to bind port 3001 in the sandbox

**Git/worktree note**
- `AGENT_SYSTEM_PROMPT.md` was already modified in the working tree before this session and was not edited by Codex during Session 46.

*Updated April 23 2026 — Session 46 complete · scheduled Daily Card regen · top-level MODEL tab · model stats header*

---

## ✅ Session 47 — Daily Card Moved to DB-Backed Read Model

**Goal of this session:**
Reduce Claude/token burn by preventing normal users from triggering a fresh Daily Card generation on cache miss. Daily Card is now intended to be generated only by scheduler/admin flows and then served from cache/DB.

**Files changed:**
- `backend/routes/dailyCard.js`
- `backend/migrations/001_init.sql`
- `prop-scout-v7.jsx`

**Backend behavior change (`backend/routes/dailyCard.js`):**

Daily Card is no longer public "generate on demand" on cache miss.

New flow for `GET /api/daily-card`:
1. Check in-memory cache
2. If miss, check Postgres table `daily_card_snapshots`
3. If DB row exists:
   - return it
   - rehydrate in-memory cache
   - set `X-Cache: DB-HIT`
4. If neither cache nor DB has today's card:
   - return `202` with:
     - `status: "pending"`
     - `error: "Daily Card not ready yet. Try again shortly."`
   - **No Claude call is made**

**Generation path split out:**
- Added `generateDailyCard()` helper to hold the actual Claude generation logic
- Added `readDailyCardSnapshot()` helper for DB reads
- Added `writeDailyCardSnapshot()` helper for DB upserts
- `regenerateDailyCard()` now:
  - clears in-memory cache for today's key
  - calls `generateDailyCard()`
  - writes fresh result to cache + Postgres

**Important outcome:**
- Scheduler/admin writes
- Users read
- Cold cache no longer causes token usage

**Postgres table added (`backend/migrations/001_init.sql`):**
- New table: `daily_card_snapshots`
- Columns:
  - `slate_date DATE PRIMARY KEY`
  - `generated_at TIMESTAMPTZ`
  - `card TEXT`
  - `games_analyzed INTEGER`
  - `tokens JSONB`
  - `source TEXT`
  - `status TEXT`

**Migration note:**
- This new table requires re-running:
  - `node backend/scripts/migrate.js`
- On Railway, the production DB will not store Daily Card rows until that migration is applied.

**Frontend handling (`prop-scout-v7.jsx`):**
- `fetchDailyCard()` now treats `202` as a valid JSON response instead of throwing an error
- Daily Card panel now has a dedicated pending state:
  - message explains the card is waiting on scheduled/admin generation
  - explicitly states the app will not trigger a Claude call while pending
  - provides a `↻ Check again` button
- Existing success/error rendering remains unchanged for ready cards or real failures

**Why this matters:**
- Prevents redeploys / cold starts / cache clears from causing unplanned Daily Card generation
- Makes token usage much more predictable
- Aligns Daily Card with the existing DB-first snapshot pattern used elsewhere in the app

**Verification:**
- `npm run build` passed
- `node --check backend/routes/dailyCard.js` passed
- SQL migration file was updated manually; note that `node --check` is not applicable to `.sql` files

**Next recommended step:**
- Re-run migrations locally / on Railway so `daily_card_snapshots` exists before relying on DB-backed Daily Card persistence in production

*Updated April 23 2026 — Session 47 complete · Daily Card DB-backed read model · no public token-triggered generation*

---

## ✅ Session 48 — Batter Power by Pitch Type + Rolling L7 Exit Velocity

**Goal:** Enrich the HR Scout scoring model and batter drawer with two new Savant-derived data layers — per-pitch-type power splits and a rolling 7-day exit velocity trend — computed from the existing in-memory Savant CSV with zero new HTTP requests.

**Files changed:**
- `backend/routes/batterPower.js`
- `backend/routes/hrScout.js`
- `prop-scout-v7.jsx`

### Part A — Pitch Type Power Splits (`batterPower.js`)

Added `pitchTypeSplits` computation inside the existing batted-ball loop:

- New accumulator: `pitchTypeAcc[abbr] = { battedBalls, barrels, hardHits, flyBalls, hrCount }`
- Guard: `hasPitchType` column check before accumulating
- Minimum threshold: 15 batted balls per pitch type before including in output
- Output per pitch type: `{ battedBalls, hrCount, barrelPct, hardHitPct, flyBallPct }`
- Added to returned `profile` object as `pitchTypeSplits`

### Part B — Rolling 7-Day Exit Velocity (`batterPower.js`)

Added `recentEv` via second pass over the same in-memory rows:

- Cutoff: `today - 7 days` as ISO string (`YYYY-MM-DD` lexicographic comparison)
- Minimum: 5 batted balls in L7 window
- Output: `{ evL7, bbL7, hardHitPctL7, barrelPctL7, evDelta }` where `evDelta = evL7 - seasonAvgEv`
- Added to returned `profile` object as `recentEv`
- Console log updated: `evL7=${profile.recentEv?.evL7 ?? "n/a"}`

### Part C — HR Scout scoring signals (`hrScout.js`)

**arsenalMap changed to dual storage:**
- Before: `arsenalMap.set(pitcherId, data?.pitcherStats ?? null)`
- After: `arsenalMap.set(pitcherId, { stats: data?.pitcherStats ?? null, arsenal: data?.arsenal ?? [] })`
- All `arsenalMap.get(...)` usages updated to use `?.stats` or `?.arsenal` accordingly

**`computeHRScore` extended (5th param `pitcherArsenal = []`):**
- Pitch-type signal: finds top pitch by `pct`, looks up `batter.powerProfile?.pitchTypeSplits?.[topPitch.abbr]`, adds `+2` if barrelPct ≥ 12, `-1` if ≤ 2
- L7 EV signal: `+2` if evDelta ≥ 4, `+1` if ≥ 2, `-1` if ≤ -3 (guarded by `bbL7 ≥ 5`)

**AI context enriched:** Added `PITCH SPLITS:` and `EV L7:` lines after the `POWER:` line in the prompt context block.

### Part D — Batter drawer UI (`prop-scout-v7.jsx`)

Two new display blocks added to the batter drawer:

- **L7 EV block** (inserted after StatMini chips row, before Career H2H): shows evL7, evDelta (green if ≥ +2, red if ≤ -3), bbL7, hardHitPctL7, barrelPctL7
- **Pitch-type power row** (inside `facingPitcher.arsenal.map` after progress bar): for each pitch in arsenal, if batter has `pitchTypeSplits[abbr]` with ≥15 BBs, shows barrelPct + hardHitPct inline

**Verification:**
- `npm run build` passed
- `node --check backend/routes/batterPower.js` passed
- `node --check backend/routes/hrScout.js` passed

*Updated 2026-05-01 — Session 48 complete · pitch type power splits · rolling L7 EV · HR Scout signals*

---

## ✅ Session 49 — AI Betting Advisor Tab

**Goal:** Build a two-persona conversational betting advisor tab. Full-slate context always pre-built. Pro persona surfaces high-confidence singles (-200 to +150). Lotto persona surfaces parlay/long-shot opportunities (+200 or better). Gated by `AI_PICKS_ALLOWLIST`.

**Files changed:**
- `backend/routes/advisor.js` (new file)
- `backend/server.js`
- `prop-scout-v7.jsx`

### Backend — `backend/routes/advisor.js`

New route `POST /api/advisor`. Key implementation details:

- Auth + allowlist: copied from `chat.js` — requires valid JWT, checks `AI_PICKS_ALLOWLIST` env var against `req.user.username`
- Rate limit: 20 messages/day per user, keyed by `userId:todayHonolulu()`, in-memory `usageMap`
- `buildAdvisorContext(date)`: loads all games from DB + MLB API fallback, then for every game in parallel fetches injuries, props/odds/umpires, pitcher detail (ERA/K9/WHIP/L3/K-line, HR props). Returns structured text block per game: ML/total/RL, umpire K/9 delta, SP stat line, top 3 HR props
- `PRO_SYSTEM_PROMPT`: singles-focused, -200 to +150 range, requires 3+ signals, returns `{ type: "picks", picks: [...] }`
- `LOTTO_SYSTEM_PROMPT`: parlay/long-shot focused, +200 or better, always includes parlay card, returns `{ type: "lotto", picks: [...], parlay: {...} }`
- Response shape: `{ type, content, picks, parlay, messagesUsedToday, maxMessagesPerDay }`

### Backend — `backend/server.js`

Added: `app.use("/api/advisor", require("./routes/advisor"))` after chat route.

### Frontend — `prop-scout-v7.jsx`

**New state (6 vars):** `advisorPersona` ("pro"), `advisorHistory` ([]), `advisorInput` (""), `advisorLoading` (false), `advisorError` (null), `advisorMessagesLeft` (20)

**New ref:** `advisorBottomRef` for auto-scroll

**Auto-scroll useEffect:** fires on `[advisorHistory, advisorLoading]`

**`handleAdvisorSend`:** serializes structured message objects to `"[picks]"` string before sending

**`handleAdvisorPersonaSwitch`:** clears history and error on switch

**Quick chips:** `ADVISOR_PRO_CHIPS` and `ADVISOR_LOTTO_CHIPS` arrays

**Nav tab:** Amber `🧠 Advisor` button (color `#f59e0b`), gated by `isScoutUser`

**`view === "advisor"` section:** persona toggle, description line, quick chips, message window with user/assistant/picks/parlay renderers, input bar, message counter

**Verification:**
- `npm run build` passed
- `node --check backend/routes/advisor.js` passed
- `node --check backend/server.js` passed

*Updated 2026-05-01 — Session 49 complete · AI Advisor tab · Pro + Lotto personas · full-slate context*

---

## ✅ Session 50 — Batter Board Props Retry + Games Board Enhancements

**Files changed:** `prop-scout-v7.jsx` only

### CODEX TASK 45 — Batter Board Props Retry (HR / Hits chips)

**Problem:** Batter board (HR/Hits) multi-book prop chips weren't showing because props fetched early in the day (before books post batter lines) were cached and the `boardPropsFetched` guard blocked all retries.

**Fix (board useEffect ~line 3150):** Replaced single `if (livePlayerProps[key] || boardPropsFetched.current.has(key)) return` guard with a three-step check:
1. Skip if currently loading (`=== "loading"`)
2. Skip if already has batter props (`batter_home_runs` or `batter_hits` present)
3. Skip if in-flight (`boardPropsFetched.current.has(key)`)

On fetch resolution with no batter props: `boardPropsFetched.current.delete(key)` + `delete playerPropsCache[key]` — enables retry on next lineup/slate update.

### CODEX TASK 46 — Games Board: Team Lean Badge + Book Odds Chips

**`computeGameBoard` changes:** Added `leanAbbr` and `odds` to all four `games.push(...)` calls. NRFI/Total get `leanAbbr: null`; Spread/ML get the leaning team's abbreviation. Local `const leanAbbr` in ML section renamed to `mlLeanAbbr` to avoid shadowing.

**Badge:** `{c.leanAbbr ?? c.lean}` — Run Line and Moneyline cards now show team abbr (e.g. "ATL") instead of "HOME"/"AWAY". NRFI/YRFI and OVER/UNDER unchanged.

**Book chips:** DK/FD/CZR/MGM chip row inserted after weather/park block on Total, Spread, and ML cards. Total shows `O/U line over/under`; Spread shows lean-side spread + odds; ML shows lean-side ML. NRFI gets no chips. Preferred book gets ★ prefix.

**Verification:** `node --check backend/server.js` passed · all key fields confirmed in source

*Updated 2026-05-01 — Session 50 complete · batter board props retry · games board team badges + book chips*

---

## ✅ Session 51 — Task 27 Confirmed + Pick Auto-Grading Phase A Spec

**Files changed:** None (investigation + spec session)

### Task 27 — Algo vs AI Badges (confirmed complete)

Audited the source. Both badges already exist from prior Codex runs:

- `⚙ ALGO` — on Model Pick cards in `TierSection` (~line 4544), with tooltip: *"Algorithmic pick — generated by the scoring model using Statcast + sportsbook data. No AI/LLM involved."*
- `✦ AI` — on Props tab pick cards (~line 7331), with tooltip: *"AI-powered pick — generated by Claude analyzing pitcher stats, lineup matchups, and park factors."*

No code changes needed. Task 27 Phase A is fully shipped.

### CODEX TASK 55 — Pick Auto-Grading Phase A: Historical Catch-Up

**Problem:** The existing grading `useEffect` only iterates over `liveSlate` (today's schedule). Pending picks from prior days never appear in today's slate so they remain `result === null` indefinitely.

**Fix:** Add a second `useEffect` that fires when `view === "picks"`. It finds all pending picks whose `gamePk` is NOT in today's `liveSlate`, groups them by game, fetches `/api/boxscore/${gamePk}` for each, runs `computeGrade`, and calls `markResult`. A new `histGradedGames` ref (a `Set`) prevents duplicate fetches within the same session. If the boxscore comes back not final, the ref entry is deleted to allow a future retry.

**Scope:** `prop-scout-v7.jsx` only. One new `useRef` (`histGradedGames`), one new `useEffect`. Zero changes to `computeGrade`, `markResult`, or the existing today-slate grading effect. No backend changes.

**Status:** COMPLETED ✅ (Codex TASK 55 — approved 2026-05-01)

*Updated 2026-05-01 — Session 51 complete · Task 27 confirmed shipped · Auto-Grading Phase A shipped*

---

## ✅ Session 52 — Auto-Grading Phase B + Task 27 Phase B (Merged Props View)

**Files changed:** None (spec + design session)

### Important discovery — Props tab is algorithmic, not AI

`computeLiveProps` (the function powering the Props tab "Prop Confidence Meters") is a **pure algorithmic JS function** — no GPT, no network call. The `✦ AI` badge on those cards is technically mislabeled. The backend `/api/props/:gamePk` (GPT-4o mini via OpenAI + Tavily) exists in `backend/routes/props.js` and is mounted in `server.js`, but is **never called from the frontend**. Task 27 Phase B will wire that endpoint to actually fire when the Props tab opens.

### Auto-Grading Phase B — Backend Settlement Worker (CODEX TASK 56)

**Problem:** Phase A (frontend catch-up) settles pending picks when the user opens the Picks tab. But if a user never reopens the app after a game finishes, picks stay pending forever. Phase B moves settlement to a nightly backend job so picks settle regardless of app usage.

**Implementation:**
- New file: `backend/jobs/gradePicksJob.js` — ports `computeGrade` logic to Node.js, reads `picks.json`, fetches MLB Stats API boxscores for unresolved games, writes `result: "hit"` / `"miss"` back
- `scheduler.js` — add cron at 4:00 AM Honolulu (after all west coast games finish)
- `server.js` — expose `GET /api/admin/jobs/grade-picks` for manual trigger (same `x-admin-secret` pattern)

**Status:** COMPLETED ✅ (Codex TASK 56 — approved 2026-05-01)

### Task 27 Phase B — Hybrid AI Props (design pending)

Two systems exist for the Props tab:
1. `computeLiveProps` — algorithmic, synchronous, currently displayed
2. `/api/props/:gamePk` (GPT-4o mini) — wired on backend but never called from frontend

**Design decision: merged card view.** Algo picks display immediately. AI picks load async. Cards are merged by prop type key — when both systems have a pick for the same prop, a dual confidence bar renders (⚙ row + ✦ row) with a `✦ BOTH AGREE` convergence badge if they share the same direction. AI-only or algo-only picks get a single bar with their source badge. AI reasoning shown as a secondary line beneath the algo reason on dual cards.

**Status:** COMPLETED ✅ (Codex TASK 57 — approved 2026-05-01). Merged card view shipped: algo picks render immediately, AI picks load async, cards merge by `propTypeKey`, dual cards show stacked `⚙`/`✦` confidence bars with `✦ BOTH AGREE` convergence badge when both systems agree on direction.

*Updated 2026-05-01 — Session 52 complete · Auto-Grading Phase B shipped · Merged Algo+AI Props view shipped*

---

## ✅ Session 53 — Advisor Missing Games Bug Fix

**Goal:** Fix Advisor replying "that game isn't on today's slate" for real games on a full-slate day.

**Root cause:** `buildAdvisorContext` in `backend/routes/advisor.js` capped the slate at 8 games via `.slice(0, 8)`. On a 15-game day, games 9+ were silently invisible to both Advisor personas.

**Files changed:**
- `backend/routes/advisor.js` — 1-line fix

**What changed:**
Removed `.slice(0, 8)` from `gameBlocks` — all games on the slate are now included in the Advisor's context.

**Commit message:** `fix: remove advisor slate cap — include all games in buildAdvisorContext`

*Updated 2026-05-01 — Session 53 complete · Advisor slate cap bug fixed*

---

## ✅ Session 54 — Backlog Additions (Codex)

**Files changed:** `AGENT_SYSTEM_PROMPT.md` only (two new backlog items documented)

---

### BACKLOG — Hybrid AI Summary Text for Board / Model Cards

**Status:** Open — backlog only, no implementation started
**LOE:** Medium
**Type:** Frontend + light AI call

**Problem:** Board and Model pick cards show generic summary lines like `Strong edge — multiple positive signals` which are not informative.

**Decision:** Hybrid approach — keep scoring and pick selection fully deterministic, but add a small AI rewrite step for the summary sentence only.

**Implementation shape:**
1. Scoring model stays unchanged
2. For each card, extract a compact structured payload: market/prop type, lean, top 2 positive factors, optional caution
3. Send only that payload to `gpt-4o-mini` for a constrained rewrite
4. AI returns one short sentence (8–16 words), using only supplied factors, no new stats, no hype

**Example output:** `Elite control and solid recent depth support the over on outs.`

---

### BACKLOG — Show Active Roster Before Confirmed Lineups

**Status:** Open — backlog only, no implementation started
**LOE:** Medium-Large
**Type:** Full-stack (lineups route + frontend + batter algorithms)

**Problem:** The app feels empty early in the day when official lineups haven't posted yet. HR, Hits, and other batter-facing tabs are sparsely populated.

**Desired behavior:**
- Pre-lineup: show active roster hitters, label section `Roster`, still compute algorithmic confidence, still surface props/odds
- Post-lineup: switch label to `Lineup`, replace roster with confirmed batting order, recompute rankings

**Important:** This is not just a label change — it affects any feature keyed on confirmed lineups, including Board → HR, Board → Hits, game-level batter views, and matchup logic that uses batting order as an input.

**Implementation shape:**
1. `lineups` route / frontend data model supports two states: `confirmed lineup` vs `fallback roster`
2. UI labels: `Roster` (fallback) vs `Lineup` (confirmed)
3. Batter algorithms run on roster players pre-lineup, omitting or lightening batting-order bonuses until confirmed
4. On confirmed lineup arrival: replace roster data + recompute rankings/confidence

*Updated 2026-05-02 — Session 54 · Two new backlog items added by Codex*

---

## ✅ Session 55 — Board/Slate UI Polish + Auto-Grade Hardening + New Backlog Items

**Files changed:** `prop-scout-v7.jsx`, `backend/jobs/gradePicksJob.js`

### Completed changes

**Slate view:**
- Slate cards now show probable starters — compact SP row (team abbr + pitcher last name) below the time/stadium line

**Board → Games:**
- Hit badges (`#/# hit`) extended to Run Line and Moneyline cards (previously only NRFI/Total)
- Away-side lean badge color fixed — was inheriting old red styling after team abbr switch; now correctly reflects team side
- Displayed score semantics updated: away/under/YRFI leans now show `100 - rawScore` so the number always represents the lean side's strength
- Card sort order updated to match the new displayed score

**Board → K/Outs:**
- Score moved to left rail under rank; prop side/line badge now on right — presentation only, no scoring math changed
- Sportsbook chips no longer disappear during batter-prop retries — retry logic now preserves existing pitcher prop payload while fetching batter props in the background

**Auto-grading:**
- Pitcher name matching hardened in both `computeGrade` (frontend) and `gradePicksJob.js` (backend)
- Specifically fixes labels like `JR Ritchie Strikeouts OVER 4.5` that were failing to match the pitcher in the boxscore
- Note: this fixes the name-matching half of the grading bug; the `isFinal` detection issue (BACKLOG TASK 60) remains open

### New backlog items added

**F5 Board Markets** — Add `F5 Moneyline` and `F5 Run Line` sub-tabs to Board → Games. Same card style, SP-weighted scoring, no bullpen influence. Scoped re-introduction — F5 was removed everywhere else in the app.

**Clarify Algorithmic vs Projection vs AI Labels** — 3-tier labeling across the app: `⚙ Algorithmic` (Board, Model Picks), `Estimated Projection` (projected stat values), `✦ AI-Assisted` (Scout, HR Scout, Advisor).

**Private Predictive Models Tab** — Experimental gated tab visible only to the user. F5 Moneyline as first market. Uses existing PS data as feature layer; produces its own model output clearly separate from the heuristic/research core.

### Verification

- `npm run build` passed
- `node --check backend/jobs/gradePicksJob.js` passed

*Updated 2026-05-02 — Session 55 complete · Board/Slate polish · auto-grade hardened · 3 new backlog items*

---

## ✅ Session 56 — CW: XS Fixes (Task 58 + Task 60) + F5 Board Markets Spec (CODEX TASK 61)

**Files changed:** `backend/routes/boxscore.js`, `prop-scout-v7.jsx`

### Task 60 — isFinal Detection Bug (backend/routes/boxscore.js)

Fixed `isFinal` detection for old games. MLB API can return `currentInning: 0` for finished games, making the original guard unreliable. Added `|| ls.abstractGameState === "Final"` as a secondary check. This unblocks historical auto-grading for K props and any other picks stuck as pending after games finished.

```js
// Before
const isFinal = inningsPlayed > 0 && !ls.currentInning;
// After
const isFinal = (inningsPlayed > 0 && !ls.currentInning)
  || ls.abstractGameState === "Final";
```

### Task 58 — Games Board Summary Text (prop-scout-v7.jsx)

Replaced the generic score-bucket ternary in the Games Board card footer with a snippet built from the card's existing `factors[]` array. Now shows the top 2 positive factors by weight (e.g. `"Home pitcher has a clear ERA edge · Wide ump zone"`) instead of `"Strong edge — multiple positive signals"`.

### CODEX TASK 61 — F5 Board Markets ✅ COMPLETED

Full spec written in `AGENT_SYSTEM_PROMPT.md`. Two new sub-tabs added to Board → Games: `F5 ML` and `F5 RL`.

**Files Codex touched:**
- `backend/routes/odds.js` — `extractBook` now parses `h2h_h1` (F5 ML) and `spreads_h1` (F5 RL); Odds API markets param updated
- `prop-scout-v7.jsx` — `f5ml` + `f5spread` scoring blocks in `computeGameBoard`, sub-tabs in Games tab row, hit summary grading using innings 1–5

**Scoring philosophy:** Mirrors the full-game ML/RL engine but with heavier SP weighting (ERA diff +20 max vs +15) and no bullpen signals. Umpire tendency and market-vs-model edge both apply. F5 picks are **not loggable** in this version.

**Codex bonus:** Live F5 outcome tracker sums linescore innings 1–5 from `liveBoxscores` to power the hit/miss badge on the F5 sub-tabs — not in the original spec, confirmed correct by CW review.

**Key constraint preserved:** F5 only introduced in Board → Games — not in Props tab, Model Picks, or anywhere else.

### Commit messages
- `fix: harden isFinal detection with abstractGameState fallback`
- `fix: replace generic Games board summary text with top signal factors`
- `feat: add F5 Moneyline + F5 Run Line sub-tabs to Board → Games`

---

## ✅ Session 57 — CW: Review + Approve CODEX TASK 61 (F5 Board Markets)

**Review status:** Approved ✅

CW reviewed the complete implementation against the CODEX TASK 61 spec. All scoring blocks, Odds API parsing, sub-tab wiring, hit summary grading, and scope constraints confirmed correct. `node --check` passed on both `.js` backend files. Codex's unscripted F5 live outcome tracker is a net positive addition.

No follow-up fixes needed. Both docs updated. Ready for next backlog item.

---

## ✅ Session 58 — CW: Review + Approve CODEX TASK 62 (Label Transparency Pass)

**Review status:** Approved ✅

CW reviewed the complete label implementation. All 3 tiers (`ALGORITHMIC` / `PROJECTION` / `AI-ASSISTED`) with correct colors (blue / teal / purple) and hover tooltips confirmed present. Correct placement verified across all 8 call sites: Model Picks header + cards, Board K/Outs/Games cards, Slate pitcher card, HR Scout header, Props tab header, Props merged-view cards (per branch), Advisor header, Scout header.

No backend changes, no logic changes. Pure label/UX pass. Scope constraints preserved.

### Commit message
- `feat: add algorithmic / projection / AI-assisted tier badges across pick surfaces`

*Updated 2026-05-02 — Session 58 complete · CODEX TASK 62 approved*

---

## ✅ Session 59 — CW: CODEX TASK 63 Spec (Active Roster Fallback)

**Files changed:** `AGENT_SYSTEM_PROMPT.md` (spec added), `prop-scout-handoff.md` (this entry)

Full spec written for CODEX TASK 63 — Active Roster Before Confirmed Lineups. Two-file change: backend and frontend.

### CODEX TASK 63 — Active Roster Fallback Before Confirmed Lineups ✅ COMPLETED

**LOE:** Medium  
**Files:** `backend/routes/lineups.js`, `prop-scout-v7.jsx`

**Problem:** The Lineup tab shows an empty state all morning until official batting orders post, making the app feel thin early in the day.

**Fix:** When `confirmed === false`, fetch the active 26-man roster via `GET /api/v1/teams/{teamId}/roster?rosterType=active&season=2026` and return those hitters as an unordered fallback. Frontend shows them under a "📋 Lineup Not Yet Posted" amber banner with the label `{ABBR} Roster (Lineup Pending)` and position abbreviations in the slot column instead of batting order numbers.

**Key constraints:**
- No enrichment (no `fetchBatterPowerProfile` / `fetchBatterRecentForm`) for roster fallback
- Roster players do NOT feed into Model Picks, Board, or K/Outs scoring — those still gate on `confirmed === true`
- Backend adds `source: "roster"` | `"lineup"` field to the response
- If roster API fails, fall back gracefully to empty arrays — never break the endpoint
- TTL unchanged (1-min cache for unconfirmed state)
- When real lineup posts, the 1-min TTL naturally replaces the roster view

Full spec in `AGENT_SYSTEM_PROMPT.md` under **CODEX TASK 63**.

*Updated 2026-05-02 — Session 59 complete · CODEX TASK 63 specced*

---

## ✅ Session 60 — CW: Review + Approve CODEX TASK 63 (Active Roster Fallback)

**Review status:** Approved ✅

CW reviewed the complete implementation. Backend `transformRoster` helper is clean and correct — non-pitcher filter, active status guard, jersey-number sort, `order: null`, no enrichment. Roster fetch wrapped in inner try/catch with `console.warn` fallback exactly as specced. `source: "lineup" | "roster"` field correct. Frontend `isRosterFallback` detection, label change, amber banner, and slot badge substitution all confirmed present and correct. All scope constraints preserved — Model Picks, Board, and K/Outs scoring untouched. `node --check` and `npm run build` both pass.

Minor dead-weight in slot badge styling (fontWeight/fontFamily conditionals evaluate to identical values in both branches) — not a bug, not worth a follow-up.

### Commit message
- `feat: show active roster in lineup tab before batting orders post`

*Updated 2026-05-02 — Session 60 complete · CODEX TASK 63 approved*

---

## ✅ Session 61 — CW: CODEX TASK 64 Spec (🔬 Lab Tab — F5 ML Predictive Model)

**Files changed:** `AGENT_SYSTEM_PROMPT.md` (spec added), `prop-scout-handoff.md` (this entry)

### CODEX TASK 64 — 🔬 Lab Tab: F5 Moneyline Predictive Model (pending Codex)

**LOE:** Large
**Files:** `backend/routes/modelF5.js` (new), `backend/server.js`, `prop-scout-v7.jsx`
**Access:** `isScoutUser` only

**Architecture decisions (confirmed with user):**
- Output: win probability % (not 0–95 score)
- All games shown on slate; edge games (≥ 4pp gap vs. book) get `EDGE` badge
- Tab name: 🔬 Lab (accent color: emerald `#34d399`)

**What gets built:**

1. **`backend/routes/modelF5.js`** — new route at `GET /api/model/f5`. Fetches today's slate, SP season stats + gamelog (last 3 starts), umpire assignments, and F5 ML odds per game. Builds feature vector: `eraDiff`, `whipDiff`, `homeField`, `umpKTendency`, `formDiff`. Runs pre-calibrated logistic regression (`sigmoid(β₀ + β₁x₁ + ...)`) to produce `homeProb` / `awayProb`. Computes edge vs. book implied probability. Returns per-game array sorted by `|leanEdge|` descending. 10-minute cache.

2. **`backend/server.js`** — mounts `modelF5` at `/api/model`

3. **`prop-scout-v7.jsx`** — adds 🔬 Lab nav button (emerald, gated on `isScoutUser`), `labData` + `labLoading` state, fetch on `view === "lab"`, full card list UI with probabilities, book implied, edge in pp, EDGE badge, disclaimer banner. Adds `predictive` tier to `TIER_BADGES`.

**Key constraints:**
- No Board / Model Picks / Scout / HR Scout / Advisor changes
- No pick logging wired in this version
- Coefficients are hard-coded constants — no training pipeline
- Double-gated on `isScoutUser` (nav button AND view render)

Full spec in `AGENT_SYSTEM_PROMPT.md` under **CODEX TASK 64**.

*Updated 2026-05-02 — Session 61 complete · CODEX TASK 64 specced*

---

## ✅ Session 62 — CW: Review + Approve CODEX TASK 64 (🔬 Lab Tab) + Hotfix

**Review status:** Approved with CW hotfix ✅

### What Codex built (confirmed correct)

- `backend/routes/modelF5.js` — clean. Coefficients correct, sigmoid correct, `mlToImplied` correct, `Promise.allSettled` at both the per-game and per-fetch levels, `dataWarning` flag, 10-min cache, sort by `|leanEdge|`, `requireLabAccess` server-side guard using `LAB_ALLOWLIST` env var
- `backend/server.js` — mounted at `/api/model` ✓
- `prop-scout-v7.jsx` — `predictive` tier in `TIER_BADGES`, `labData`/`labLoading` state, `fetchLabData()` with `force` refresh support, emerald Lab nav button after Advisor, double-gated view block, full card UI (header, disclaimer, loading, error, empty, per-game cards with probs, edge, ump, features)

### CW hotfix

`modelProbPct` was used in the card render to display the lean-side win probability (the large number on each card) but was never defined. Fixed by CW by adding:

```js
const modelProbPct = modelProb != null ? `${Math.round(modelProb * 100)}%` : "—";
```

Without this, the primary probability display on every card would render blank.

### Commit messages
- `feat: add 🔬 Lab tab with F5 ML logistic regression model`
- `fix: define modelProbPct in Lab card render`

*Updated 2026-05-02 — Session 62 complete · CODEX TASK 64 approved + hotfixed*

---

## ✅ Session 63 — CW: Review Codex Follow-Up Fixes for Task 64

**Review status:** Both fixes approved ✅

### Fix 1 — TDZ boot crash (`prop-scout-v7.jsx`)

`SCOUT_ALLOWLIST`, `scoutIdentity`, and `isScoutUser` moved earlier in the component so the Lab auto-load `useEffect` (which references `isScoutUser` in its dependency array) no longer hits a temporal dead zone. Declaration is now at line ~3096, well before the effect at line ~3590. Double-gate on both nav button and view block still intact.

### Fix 2 — Odds API H1 market fallback (`backend/routes/odds.js`)

Added graceful retry when The Odds API rejects H1 markets (`h2h_h1`, `spreads_h1`, `totals_h1`). Error response pattern-matched on "not supported by this endpoint" + H1 market name. On match: retries with base markets only (`h2h,totals,spreads`) and sets `partialMarkets: true` on the result. Non-H1 errors still propagate normally. `node --check` passes.

*Updated 2026-05-02 — Session 63 complete · Task 64 follow-up fixes reviewed*

---

## ✅ Session 64 — CW: CODEX TASKS 65–68 Specced (Lab Extension Suite)

**Files changed:** `AGENT_SYSTEM_PROMPT.md` (4 specs added)

All four tasks are additive Lab extensions. No changes to Board, Model Picks, Scout, HR Scout, Advisor, or any existing grading/pick infrastructure except where explicitly noted (Task 66 auto-grade wiring).

### CODEX TASK 65 — Lab: Auto-grade HIT/MISS on F5 ML Cards (XS, pending)
Inside the Lab card render loop, derive `f5Away` + `f5Home` from `liveBoxscores[g.gamePk].linescore.innings.slice(0,5)`. Compare against `g.model.leanSide`. Show ✓ HIT or ✗ MISS badge (same style as Board). Ties + incomplete games → no badge. No backend changes, no new state.

### CODEX TASK 66 — Lab: Pick Logging for F5 ML Model Picks (S-M, pending)
Log button on each Lab card using existing `logPick` with `propType: "LAB_F5ML"`. Explicit `gamePk: g.gamePk` (not `selectedId`). Dedup by game + label + date. Auto-grading wired into existing grade `useEffect` using F5 innings sum. Lab Picks section in Picks tab filtered to `propType === "LAB_F5ML"`.

### CODEX TASK 67 — Lab: Full-Game ML Model Sub-Tab (M, pending)
New `GET /api/model/fullgame` route in `modelF5.js`. Adds bullpen ERA diff signal (`GET /api/bullpen/:gamePk`). New `COEFF_FG` constants. Same output shape as F5. Frontend: `[F5 ML] [Full-Game ML]` sub-tab toggle inside Lab, `labSubTab` state, `labFgData`/`labFgLoading` state, same card layout + Bullpen ERA Δ chip. Full-game auto-grade using final boxscore scores.

### CODEX TASK 68 — Lab: Calibration Tracking / Track Record (M, pending)
New `backend/services/labCalibration.js` — read/write `backend/data/lab-outcomes.json`. Three new routes on the model router: `POST /calibration/record`, `POST /calibration/resolve`, `GET /calibration`. Frontend auto-records on data load (fire-and-forget), auto-resolves when grade becomes non-null. Collapsible "📊 Track Record" section at bottom of Lab: record, accuracy %, Brier score, edge-only accuracy. `backend/data/` added to `.gitignore`.

Full specs in `AGENT_SYSTEM_PROMPT.md` under **CODEX TASK 65–68**.

*Updated 2026-05-02 — Session 64 complete · CODEX TASKS 65–68 specced*

---

## ✅ Session 65 — CW: Review + Approve CODEX TASKS 65–68 (Lab Extension Suite)

**Review status:** All four tasks approved ✅

### Task 65 — Auto-grade HIT/MISS ✅
`labHit` derived from `liveBoxscores[g.gamePk].linescore.innings.slice(0,5)` inside the card map. F5 and full-game paths handled separately via `isLabF5` guard — F5 uses innings sum, full-game uses final `linescore.away.runs / home.runs`. Ties + incomplete games → `null`. Badges correct. No backend changes.

### Task 66 — Lab Pick Logging ✅
`computeLabF5MlGrade` helper defined cleanly and routed into the existing `computeGrade` dispatch (line ~4668) and all three grade `useEffect` call sites. `logPick` called with explicit `gamePk: g.gamePk` (not `selectedId`). Dedup by game + label + date + `propType`. Lab Picks section in Picks tab filtered to `LAB_F5ML`, shows model%, result badge, pending state. No backend changes.

### Task 67 — Full-Game ML Sub-Tab ✅
`COEFF_FG` with all 7 coefficients including `BULLPEN_ERA_DIFF: 0.13`. Codex refactored shared fetch/build logic into `fetchSlateAndOdds()` + `buildModelGames()` helpers — clean DRY improvement beyond the spec. `GET /api/model/fullgame` correct. `labSubTab` state, `labFgData`/`labFgLoading` state, separate fetch effects per sub-tab, `[F5 ML][Full-Game ML]` toggle, full-game card uses final boxscore scores for grading. `node --check` ✓.

### Task 68 — Calibration Tracking ✅
`backend/services/labCalibration.js` — atomic write via `.tmp` rename (correct, prevents corrupt reads on crash). `readLog` returns `[]` on ENOENT or corrupt JSON. `appendEntry` deduplicates on `id`. `resolveEntry` correct. Three routes on the model router: `POST /calibration/record`, `POST /calibration/resolve`, `GET /calibration`. `buildCalibrationSummary` computes accuracy, Brier score, edge-only accuracy correctly. Frontend: fire-and-forget `apiMutate` calls on data load and grade resolution. `📊 Track Record` collapsible section with small-sample caveat at N < 20. `backend/data/` already in `.gitignore` (line 17). `node --check` ✓.

**Bonus:** Codex proactively refactored Task 67's shared slate/odds/build logic into reusable helpers, making the full-game route much cleaner than a copy-paste of the F5 route.

### Commit messages
- `feat: add HIT/MISS auto-grade to Lab F5 and full-game ML cards`
- `feat: add Lab pick logging and Lab Picks section in Picks tab`
- `feat: add Full-Game ML sub-tab to Lab with bullpen ERA signal`
- `feat: add Lab calibration tracking with Brier score and track record display`

*Updated 2026-05-02 — Session 65 complete · CODEX TASKS 65–68 all approved*

---

## ✅ Session 66 — CW: Task 27 Phase B isFinal Bug Fix

**Files changed:** `backend/jobs/gradePicksJob.js`

Task 27 Phase B (nightly pick settlement) was already fully implemented — `gradePicksJob.js`, cron at 4 AM Honolulu, and admin trigger endpoint all existed. The one outstanding issue was a one-line `isFinal` detection bug in the job, where the `abstractGameState === "Final"` fallback (added to `boxscore.js` in Task 60) had never been backported to the job file.

**Fix applied — `backend/jobs/gradePicksJob.js` line 193:**
```js
// Before
const isFinal = inningsPlayed > 0 && !ls.currentInning;
// After
const isFinal = (inningsPlayed > 0 && !ls.currentInning)
  || ls.abstractGameState === "Final";
```

This mirrors the exact fix from Task 60. Without it, the nightly job could silently skip settling picks for games where MLB API returns `currentInning: 0` on completed games. Now grading is consistent between the frontend boxscore route and the backend settlement worker.

**Task 27 Phase B: fully complete ✅**

*Updated 2026-05-02 — Session 66 complete · Task 27 Phase B isFinal fix shipped*

---

## ✅ Session 67 — CW: CODEX TASKS 69–71 Specced (Lab Extension Suite 2)

**Files changed:** `AGENT_SYSTEM_PROMPT.md`

Three new specs written for the Lab's remaining organic work. Execution order: 71 → 69 → 70.

### CODEX TASK 71 — Lab: Full-Game ML Pick Logging (XS, pending)
Closes the gap from Task 67. Adds `computeLabFgMlGrade`, routes it through the `computeGrade` dispatch, adds a Log button (`propType: "LAB_FGML"`) to full-game cards, and extends the Picks tab Lab Picks filter to include `LAB_FGML`. No backend changes.

### CODEX TASK 69 — Lab: K Prop Predictive Model (M-L, pending)
New `GET /api/model/kprop` route in `modelF5.js`. Linear model: `predictedKs = INTERCEPT + PITCHER_K9*(k9-9.0) + OPP_K_PCT*(kPct-0.22) + UMP_K_TENDENCY*umpDelta + FORM_DELTA*(recentK9-k9)`. Book line from `/api/player-props/:gamePk` (pitcher_strikeouts market, last-name fuzzy match). Also adds `runsPerGame` to `teamStats.js` response (additive, non-breaking). Frontend: new `K Prop` sub-tab (3rd), two pitcher cards per game, OVER/UNDER lean + edge. Log with `propType: "LAB_KPROP"`. Auto-grade from pitching boxscore Ks. Calibration model `"kprop"` added.

### CODEX TASK 70 — Lab: Game Totals Model (M, pending)
New `GET /api/model/totals` route. Linear model: `predictedTotal = INTERCEPT + RPG deviations + SP ERA deviations + bullpen ERA deviation`. Book total from `oddsMap[key].total`. Frontend: new `Totals` sub-tab (4th), one card per game, OVER/UNDER lean. Log with `propType: "LAB_TOTALS"`. Auto-grade from final linescore runs sum. Calibration model `"totals"` added.

### Notes
- **Recalibration** (organic idea #3): data-dependent, no code needed until `lab-outcomes.json` accumulates ~20+ entries.
- **Hybrid AI Props** (organic idea #4): Task 57 already shipped the merged algo+AI card view. Nothing concrete left to spec — will revisit if a specific gap surfaces.

*Updated 2026-05-02 — Session 67 complete · CODEX TASKS 69–71 specced*

---

## ✅ Session 68 — CW: Review + Approve CODEX TASKS 69–71

**Review status:** All three tasks approved ✅

### Task 71 — Full-Game ML Pick Logging ✅
`computeLabFgMlGrade` defined correctly — reads `pick.lean` ("HOME"/"AWAY") which matches how `logPick` stores the lean side on full-game cards. Log button wired via shared `labPickType` variable (`isLabF5 ? "LAB_F5ML" : "LAB_FGML"`), so the existing card render branch handles both F5 and FG logging without duplication. Picks tab filter extended to all four `LAB_*` propTypes. Dispatch in `computeGrade` wired at correct location.

### Task 69 — K Prop Model ✅
`teamStats.js` addition of `runsPerGame` is clean and non-breaking (three new lines, existing callers unaffected). `modelF5.js`: `COEFF_K`, `parseIP`, `predictKs` all correct per spec. Route fetches 8 endpoints per game via `Promise.allSettled` (all graceful on failure). `buildKProp` helper cleanly encapsulates both pitcher K prop calculations. Name match uses last-name substring. Calibration record/resolve routes extended to accept `"kprop"` and `"totals"` models, and Codex proactively added a `subjectKey` field to the calibration ID for K Props — this disambiguates away vs home pitcher entries for the same gamePk, which the spec didn't address. Clever improvement. Frontend: `labKData`/`labKLoading` state, auto-load effect, K Prop sub-tab, two-card-per-game layout, `computeLabKPropGrade` reads `pitcherSide`/`pitcherLastName`/`bookLine` from pick payload — all correctly logged at line 3762–3769.

### Task 70 — Game Totals Model ✅
`COEFF_TOT`, `predictTotal` correct. Route uses `oddsMap[key].total` (string → `parseFloat`) for book total. `runsPerGame` falls back to 4.5 if unavailable. Calibration resolve fires with `model: "totals"`. Frontend: `labTotalsData`/`labTotalsLoading`, auto-load effect, 4-tab toggle (`[F5 ML][Full-Game ML][K Prop][Totals]`), `computeLabTotalsGrade` reads `pick.leanSide` + `pick.bookTotal` — correctly stored in logPick at line 3793.

### Bonus: Codex `subjectKey` improvement
The calibration `record` and `resolve` routes now accept an optional `subjectKey` that gets embedded in the entry ID — `"kprop:date:gamePk:away"` vs `"kprop:date:gamePk:home"`. This solves a dedup collision that the spec didn't account for (two K prop entries per game with the same gamePk). Clean proactive fix.

### Build note
`node --check` on all three backend files passes. `npm run build` fails in the sandbox due to missing `@rollup/rollup-linux-arm64-gnu` native module — this is a known environment platform issue, not a code bug.

### Commit messages
- `feat: add Full-Game ML pick logging (LAB_FGML) and computeLabFgMlGrade`
- `feat: add Lab K Prop predictive model — new sub-tab, route, grading`
- `feat: add Lab Game Totals model — 4th Lab sub-tab, route, grading`

*Updated 2026-05-03 — Session 68 complete · CODEX TASKS 69–71 all approved*

---

## ✅ Session 69 — CW: CODEX TASK 72 Specced (Nightly Calibration Resolver)

**Files changed:** `AGENT_SYSTEM_PROMPT.md`

### CODEX TASK 72 — Lab: Nightly Calibration Resolver Job (S, pending)

Root cause: calibration entries are resolved frontend-side only. If the app is closed before a game finishes, entries stay `result: null` and are excluded from accuracy/Brier score stats permanently.

Also fixes two payload gaps discovered during spec:
- kprop calibration records were not storing `bookLine` or `pitcherLastName` — the job can't grade K prop entries without them
- totals calibration records were not storing `bookTotal` — same problem

**Three-part fix:**
1. `modelF5.js` calibration/record route — accept and persist `bookLine`, `bookTotal`, `pitcherLastName` optional fields
2. `prop-scout-v7.jsx` — add those fields to the kprop and totals record payloads; add `pitcher` to the kprop forEach destructure to access pitcher name
3. New `backend/jobs/resolveLabCalibrationJob.js` — sweeps unresolved entries, groups by gamePk, fetches boxscore once per game, grades all entries for that game: f5ml (innings 1-5), fullgame (final score), kprop (pitcher SO vs bookLine), totals (total runs vs bookTotal). Skips gracefully when game not final or required fields missing.
4. Scheduler wired at 4:30 AM Honolulu (30 min after gradePendingPicks)
5. Admin endpoint `GET /api/admin/jobs/resolve-lab-calibration` for manual trigger

*Updated 2026-05-03 — Session 69 complete · CODEX TASK 72 specced*
