# Prop Scout — Project Handoff

> **How to use this doc:** Upload `prop-scout-handoff.md` and `prop-scout-v7.jsx` to a new Claude session and say: *"Read the handoff doc and the JSX file. We're continuing development of Prop Scout."* Claude will have full context on every decision made and can pick up immediately.

---

## What Is Prop Scout?

A personal MLB sports betting research app that compresses pre-game prop research from hours to minutes. Responsive React app (max-width 960px, 2-column layout on tablet/desktop) with a dark Discord-style card UI. The main app shell still lives in `prop-scout-v7.jsx`, but the pure scoring/board/shared-presentational logic has now been extracted into `src/` modules with Vitest coverage.

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
├── prop-scout-v7.jsx       ← CURRENT main app shell (state/hooks/render)
├── main.jsx                ← Vite entry point (renders App)
├── index.html              ← Vite HTML shell
├── vite.config.js          ← Vite config + /api proxy to localhost:3001 + test block
├── vitest.config.js        ← Vitest config
├── package.json            ← Frontend deps + Vitest scripts/dev deps
├── src/
│   ├── constants.js        ← Shared pure constants (park factors, HFA, umpire stats, model tier)
│   ├── utils.js            ← Shared pure utils (odds helpers, border styles, summaries, scratch normalization)
│   ├── test-setup.js       ← Vitest jest-dom setup
│   ├── board/
│   │   ├── index.js        ← Board compute layer + AI payload builder
│   │   └── index.test.js
│   ├── components/
│   │   ├── shared.jsx      ← Shared presentational primitives
│   │   └── shared.test.jsx
│   └── scoring/
│       ├── batter.js       ← `hrBoardScore`, `hitBoardScore`
│       ├── pitcher.js      ← `kBoardScore`, `outsBoardScore`
│       ├── sim.js          ← Monte Carlo SIM confidence layer
│       ├── batter.test.js
│       ├── pitcher.test.js
│       └── sim.test.js
├── .env                    ← API keys (gitignored)
├── .gitignore
├── prop-scout-handoff.md   ← This file
├── backend/
│   ├── server.js           ← Express app, port 3001, open CORS
│   ├── migrations/
│   │   ├── 001_init.sql
│   │   ├── 002_picks_users_lab.sql
│   │   ├── 003_picks_rebuild.sql
│   │   ├── 004_gamelog_snapshots.sql
│   │   ├── 005_board_card_snapshots.sql
│   │   └── 006_card_summaries.sql
│   ├── package.json        ← Backend deps: express, axios, cors, dotenv
│   ├── services/
│   │   ├── mlbApi.js       ← axios instance for statsapi.mlb.com
│   │   └── cache.js        ← In-memory TTL cache
│   ├── jobs/
│   │   ├── scheduler.js                ← cron wiring
│   │   └── resolveCardSnapshotsJob.js  ← resolves locked board-card snapshots to hit/miss
│   └── routes/
│       ├── schedule.js     ← GET /api/schedule?date=YYYY-MM-DD
│       ├── lineups.js      ← GET /api/lineups/:gamePk
│       ├── players.js      ← GET /api/players/:playerId/stats
│       ├── umpires.js      ← GET /api/umpires/:gamePk
│       ├── arsenal.js      ← GET /api/arsenal/:pitcherId (Baseball Savant)
│       ├── splits.js       ← GET /api/splits/:batterId  (Baseball Savant)
│       └── boardSnapshot.js← POST/GET board-card snapshot persistence
└── checkpoints/
    ├── v6-odds-api/        ← Snapshot at Odds API milestone
    └── v7-multibook-odds/  ← Snapshot at multi-book table milestone (current)
```

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 18 | Main app shell still in `prop-scout-v7.jsx`; pure logic extracted into `src/` modules |
| Styling | Inline styles only | No CSS framework |
| Build tool | Vite 5 | Dev server on :5173, proxies /api → :3001 |
| Testing | Vitest + Testing Library | 100+ unit/component/integration tests for extracted pure modules |
| Weather | Open-Meteo | Free, no key. `IS_SANDBOX = false` to enable |
| Odds | The Odds API | Key in `.env`. `IS_ODDS_SANDBOX = false` to enable |
| MLB Stats | MLB Stats API (statsapi.mlb.com) | Free, no key. CORS-blocked from browser → backend proxy |
| Backend | Node/Express on port 3001 | Expanded route set, admin job endpoints, scheduler, snapshot jobs |
| Arsenal | Baseball Savant/Statcast | Pending — CSV-based, lowest urgency |
| Database | PostgreSQL | Migrations + snapshot infrastructure are implemented; Railway/env wiring still matters |

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

## Current State — May 2026

The codebase is no longer "all logic in one file." The refactor is partially complete:

- `prop-scout-v7.jsx` now holds app state, effects, event handlers, and render logic
- Shared constants/utilities live in `src/constants.js` and `src/utils.js`
- Board scoring lives in `src/scoring/`
- Monte Carlo SIM confidence functions live in `src/scoring/sim.js`
- Shared presentational primitives live in `src/components/shared.jsx`
- Board compute/payload logic lives in `src/board/index.js`
- Vitest coverage is in place for constants, utils, scoring, sim, board compute, and shared components

This means a new session should not assume the old "single-file frontend" architecture anymore, even though `prop-scout-v7.jsx` is still the main top-level app file.

---

## Recent Codex Refactor Work (Tasks 127–132)

These six refactor tasks were completed after the older handoff sections below were written:

### Task 127 — Reusability Cleanup
- Final `resultBorderStyle()` conversion completed in `renderEdgeCard`
- Shared `summarizeOutcomes(items, outcomeFn)` helper added
- `hitSummary` and `gameHitSummary` now delegate to that helper
- Minor behavior fix: unresolved game-board tabs no longer show misleading `0/N` hit badges before any games resolve

### Task 128 — Phase 1 Split + Vitest
- Added Vitest, jsdom, Testing Library, and test scripts
- Created `src/constants.js` and `src/utils.js`
- Moved:
  - `PARK_FACTORS`
  - `NEUTRAL_PARK`
  - `HOME_FIELD_ADV`
  - `DEFAULT_HOME_ADV`
  - `MODEL_TIER`
  - `mlToImplied`
  - `formatLocalTime`
  - `resultBorderStyle`
  - `summarizeOutcomes`
- Added tests for constants/utils

### Task 129 — Phase 2 Scoring Leaves
- Created `src/scoring/batter.js` with `hrBoardScore`, `hitBoardScore`
- Created `src/scoring/pitcher.js` with `kBoardScore`, `outsBoardScore`
- Added focused scoring tests

### Task 130 — Phase 3 Shared UI Primitives
- Created `src/components/shared.jsx`
- Moved:
  - `LeanBadge`
  - `TIER_BADGES`
  - `TierBadge`
  - `GameStatusBadge`
  - `RankScoreColumn`
  - `Card`
  - `Divider`
- Added shared component tests

### Task 131 — Phase 4a Simulation Layer
- Created `src/scoring/sim.js`
- Moved:
  - `sampleStdNormal`
  - `sampleNormal`
  - `sampleCorrelated`
  - `simKConfidence`
  - `simOutsConfidence`
  - `simHRConfidence`
  - `simHitsConfidence`
  - `simF5MLConfidence`
- Added stochastic/directional tests around SIM confidence outputs

### Task 132 — Phase 4b Board Compute Layer
- Created `src/board/index.js`
- Moved:
  - `computePitcherBoard`
  - `computeBatterBoard`
  - `computeGameBoard`
  - `buildAiBoardPayload`
- Promoted shared board dependencies:
  - `UMPIRE_STATS` → `src/constants.js`
  - `normalizeScratchName`, `vigStrip`, `propEdgeData` → `src/utils.js`
- Added integration-style board tests

**Verification status after Task 132:**
- `npm run test` passes with **101 tests**
- `npm run build` passes
- `npm run dev` boots cleanly (backend proxy noise is expected if `localhost:3001` is not running)

---

## Board Card Snapshots (Task 118 / Task AC) — Current Status

This work is implemented in the repo now.

### Backend pieces present
- Migration: `backend/migrations/005_board_card_snapshots.sql`
- Route: `backend/routes/boardSnapshot.js`
- Resolver job: `backend/jobs/resolveCardSnapshotsJob.js`
- Scheduler wiring: `backend/jobs/scheduler.js`
- Admin endpoint: `GET /api/admin/jobs/resolve-card-snapshots`
- `ADMIN_SECRET` example env entry: `backend/.env.example`

### Frontend wiring present
- Board lock effect posts newly locked cards to `POST /api/board-snapshot`
- This is fire-and-forget and does not block UI lock behavior

### What the feature does
- Persists locked Board cards (`hits`, `hr`, `k`, `outs`) at game-lock time
- Stores full card payload + locked line + lean + score tier for backtesting
- Nightly resolver job grades snapshots to `result_hit` / `actual_stat` after games go final

### Important note
- This snapshot system is for player-prop board cards only
- It does **not** currently cover game-board markets (`nrfi`, `total`, `ml`, `spread`, `f5ml`, `f5spread`)

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

---

## ✅ Session 70 — CW: Review + Approve CODEX TASK 72

**Review status:** Approved ✅

### Task 72 — Nightly Calibration Resolver ✅

**`resolveLabCalibrationJob.js`** — `isFinal` detection matches the hardened Task 60 pattern. `gradeEntry` handles all four models correctly: f5ml uses innings 1–5 slice, fullgame uses final linescore totals, kprop does last-name substring match on `box.pitching[subjectKey]` array, totals sums `awayRuns + homeRuns`. Graceful `null` on missing fields → skipped count, not errors. Groups by `gamePk` before fetching — one boxscore call per game regardless of how many model entries exist for it.

**`scheduler.js`** — Import clean, cron at `30 4 * * *` Pacific/Honolulu is correctly 30 min after `gradePendingPicks`.

**`modelF5.js`** — `bookLine`, `bookTotal`, `pitcherLastName` type-guarded and passed into `appendEntry`. Additive — existing entries without these fields keep `null` and are skipped gracefully.

**`prop-scout-v7.jsx`** — kprop forEach destructure adds `pitcher` correctly (line 3672). `bookLine: prop.bookLine ?? null` and `pitcherLastName: String(pitcher?.name ?? "").split(" ").pop() || null` on the record payload (lines 3688–3689). Totals record adds `bookTotal: g.model.bookTotal ?? null` (line 3710).

**`server.js`** — Admin endpoint uses `x-admin-secret` header check, consistent with the existing `grade-picks` endpoint.

All `node --check` passes.

### What's next
Named backlog fully clear. Remaining items: mobile layout pass, multi-user picks architecture. Recalibration is now unblocked infrastructure-wise — just needs data to accumulate.

*Updated 2026-05-03 — Session 70 complete · CODEX TASK 72 approved*

---

## ✅ Session 71 — CW: Roster Fallback Expansion + Picks Grading Fix + Board Start Time

**Files changed:** `prop-scout-v7.jsx`

---

### Roster Fallback — Expanded to All Tabs

Previously the lineup fix (Session 70) only rendered roster fallback players in the Lineup tab. This session expanded it to all lineup-dependent views.

**`computeBatterBoard` (line 2060):**
```js
// Before
if (!lu?.confirmed) return;
// After
if (!lu?.confirmed && lu?.source !== "roster") return;
```

**`computeTopSlatePicks` (line 1648–1686):**
```js
const sgHasLineup = sgConfirmed || sgLu?.source === "roster";
// ...
if (sgHasLineup && opposingBatters.length >= 7) { // platoon scoring
```
`lineupConfirmed: sgConfirmed` on pick cards is preserved — green ✓ LINEUP badge only shows for officially confirmed lineups.

---

### Picks Grading Fix (Task 42)

**Root cause diagnosed and fixed.**

The initial picks hydration at mount used bare `fetch()` instead of `apiFetch()`. Since `/api/picks` requires a Bearer token (`requireAuth`), every hydration call was silently returning 401. The app permanently ran off `localStorage`, meaning grades written by the nightly `gradePendingPicks` job never reached the UI.

A second compounding issue: even if `apiFetch()` were used, `_authToken` is null at mount time (the sync `useEffect` hasn't run yet), so the call would fail anyway.

**Fix — replaced the broken hydration block with:**
```js
const hydratePicksFromServer = useCallback(async () => {
  if (!authToken) return;
  try {
    const data = await apiFetch("/api/picks");
    if (!data?.picks?.length) { setPicksServerReachable(true); return; }
    setPicksServerReachable(true);
    setPropLog(data.picks);
    localStorage.setItem("propscout_log", JSON.stringify(data.picks));
  } catch (_) {
    setPicksServerReachable(false);
  }
}, [authToken]);

// Fires once token is available (covers mount + login)
useEffect(() => { hydratePicksFromServer(); }, [hydratePicksFromServer]);

// Re-hydrates when Picks tab opens — surfaces nightly-graded results
useEffect(() => {
  if (view === "picks") hydratePicksFromServer();
}, [view]);
```

Also added `useCallback` to the React import line (line 1).

---

### Board Card Start Time — PARTIAL (Codex to finish)

**What CW did:** Added `gameTime: game.gameTime ?? null` to candidate objects in both `computePitcherBoard` (line 2037) and `computeBatterBoard` (line 2104). Updated the two subtitle render lines to call `formatLocalTime(c.gameTime)` inline.

**What's not working:** Time is not displaying. `game.gameTime` may be `undefined` on the slate objects as consumed by the scoring functions, or the field name from the backend differs. `formatLocalTime` already exists and works (used elsewhere on line 1266 as `formatLocalTime(sg.gameTime)`).

**Codex task:** Trace why `c.gameTime` is null/undefined on board cards. Check: (1) what field name the schedule snapshot uses (`gameTime` vs `time` vs `gameDateTimeLocal`), (2) whether `activeSlate` games have the field populated when passed to `computeBatterBoard`/`computePitcherBoard`, (3) fix the field name if mismatched. Desired output: `NYM @ COL 2:40 PM PDT` on the subtitle line of HR, Hits, K, and Outs board cards.

**Files to check:** `prop-scout-v7.jsx` lines 1266, 2036–2037, 2102–2104, 10445, 10592. Also `backend/jobs/snapshotJobs.js` to confirm field name on stored game objects.

---

## Codex Tasks Ready

### CODEX TASK 73 — Fix Board Card Start Time

**Status:** Ready
**LOE:** Small — field name trace + 1–2 line fix
**Type:** Frontend only

See "Board Card Start Time — PARTIAL" above. CW already added `gameTime` to candidate objects and the display lines — just needs the correct field name confirmed and patched.

---

### CODEX TASK 74 — Clarify Algorithmic vs Projection vs AI Labels

**Status:** Ready
**LOE:** Low — frontend label/badge changes only
**Type:** Frontend only

Replace inconsistent summary labels across the app with a 3-tier system:
- `⚙ Algorithmic` — Board (HR, Hits, K, Outs, Games), Model Picks
- `Estimated Projection` — projected stat values (e.g. "Proj 6.2 Ks")
- `✦ AI-Assisted` — Scout, HR Scout, Advisor

No scoring logic changes. Find all places where "Algorithmic", "AI-powered", "Model", or similar labels appear on cards and unify. The `TierBadge` component already exists and handles `"algorithmic"` — extend it if needed for the other two tiers.

---

### CODEX TASK 75 — Hybrid AI Summary Text for Board / Model Cards

**Status:** Ready (after Task 74)
**LOE:** Medium — new backend endpoint + frontend wiring
**Type:** Full-stack

**Problem:** Board and Model pick cards show generic footers like `Strong edge — multiple positive signals`.

**Implementation:**
1. New backend route `POST /api/summarize-pick` — accepts `{ propType, lean, factors[] }` payload, calls Claude Haiku with a constrained prompt, returns `{ summary: "..." }` (8–16 words, uses only supplied factors, no hype)
2. Cache per `(propType + lean + top2FactorKeys)` — avoid re-calling for identical signal combos
3. Frontend: swap the static summary string on Board and Model pick cards with the AI-generated sentence. Show static text as fallback while loading.

**Prompt constraint:** "Write one sentence (8–16 words) summarizing this pick using only these factors. No hype words. No new statistics."

---

### CODEX TASK 76 — Injury Flags + Lineup Scratch Alerts

**Status:** Ready
**LOE:** Medium — backend diff logic + frontend badge
**Type:** Full-stack

**Problem:** No signal when a player is scratched from a previously confirmed lineup.

**Implementation:**
1. Backend `GET /api/lineups/:gamePk` — when a confirmed lineup is saved, store previous confirmed lineup in DB snapshot. On subsequent calls, diff current vs previous confirmed. Return `scratched: [{ id, name, position }]` array.
2. Frontend: in the Lineup tab, show a red `SCRATCHED` badge next to missing players. Recalculate matchup confidence for affected props (reduce confidence by 10–15 pts if a key batter is missing).
3. Extend the lineup polling interval to check more frequently (every 5 min) when a game is within 90 min of first pitch.

*Updated 2026-05-05 — Session 71 complete · Roster fallback expanded · Picks grading fixed · Board time partial · Codex tasks 73–76 queued*

---

## ✅ Session 72 — CW: Review Codex Tasks 73, 74, 75, 76

### Task 73 — Fix Board Card Start Time ✅ Approved

Root cause correctly identified: `activeSlate` transformation called `formatLocalTime(sg.gameTime)` for the `time` field but never forwarded the raw ISO string. Fix threads `gameTime: sg.gameTime ?? null` through the slate transform and all six `computeGameBoard` game pushes. Combined with CW's earlier candidate field additions, the full chain is complete.

### Task 75 — Hybrid AI Summary Text ✅ Approved

`cardSummary.js` is clean. Anthropic Haiku primary → OpenAI fallback → deterministic string fallback if neither key is set. MD5 hash cache keyed on `(market + lean + positives + caution)`. Temperature 0.2 correct for factual output. Frontend hydration fires on Board/Model tab open with in-flight deduplication via `aiSummaryInFlight` ref Set.

**Minor note (non-blocking):** `hydrateCardSummaries` has `[aiCardSummaries]` in `useCallback` deps — effect re-runs on every summary resolution but `aiCardSummaries[req.id]` check prevents API re-calls. No loop, just slightly noisy re-renders. Can be cleaned up if perf becomes a concern.

### Task 76 — Injury Flags + Lineup Scratch Alerts ✅ Approved

Backend: 12h cache stores previous confirmed lineup per game, `diffScratches` does set-difference by player ID, `scratches: { away, home }` always present in response. Frontend: red Scratch Alert banner in Lineup tab (correctly gated on `!isRosterFallback`), SCRATCHED badge + -20pt confidence penalty on affected prop rows, `normalizeScratchName` fuzzy matching is solid.

### Task 74 — Label Clarification ⚠ Partially done

Only one `TierBadge tier="ai"` addition found. The full label audit (⚙ Algorithmic / Estimated Projection / ✦ AI-Assisted across all Board, Model Picks, Scout, HR Scout, Advisor surfaces) was not completed. Task remains open.

---

## Codex Tasks Ready

### CODEX TASK 74 (continued) — Complete Label Audit: 3 Specific Gaps

**Status:** Partially done — 3 specific gaps remain
**LOE:** Low — 3 targeted JSX additions, no logic changes
**Type:** Frontend only — `prop-scout-v7.jsx` only

**Background:** `TIER_BADGES` already defines all four tiers (`algorithmic`, `projection`, `ai`, `predictive`). `TierBadge` is already on tab headers (Advisor, Scout, HR Scout, Board) and most card rows. The three gaps below are the only places where individual pick cards are missing the badge their parent section already declares.

---

**Gap 1 — Scout individual pick cards missing `tier="ai"`**

Location: the `scoutPicks.map((pick, idx) => ...)` block starting at line ~6965.

Inside the collapsed card row (the `<div style={{ display: "flex", justifyContent: "space-between"...}}>` at the top of each card), there is a market color badge and player name but no `TierBadge`. Add `<TierBadge tier="ai" />` in that inner flex row, after the market badge and before or after the player name — consistent with how Model Picks cards do it (see line 5381).

---

**Gap 2 — HR Scout individual pick cards missing `tier="projection"`**

Location: the `picks.map((pick, idx) => ...)` inside the tier 1/2/3 `tierConfig.map` block starting at line ~7185.

Inside the collapsed card row (the `<div style={{ display: "flex", justifyContent: "space-between"...}}>` at the top of each card), there is an `HR {pick.hrScore}` score badge and batter name but no `TierBadge`. Add `<TierBadge tier="projection" />` in that row after the score badge — consistent with how the HR Scout header already declares `tier="projection"`.

---

**Gap 3 — Model Picks projected value label is bare**

Location: line ~5424:
```jsx
{p.projectedValue != null && (
  <span style={{ fontSize: 8, fontWeight: 700, color: "#6b7280", marginLeft: "auto" }}>proj: {p.projectedValue}</span>
)}
```

Change the label prefix from `proj:` to `est.` and wrap in a small `<TierBadge tier="projection" />` next to it, or simply change the prefix text to `Est.` so it reads `Est. 6.2` instead of `proj: 6.2`. Either approach is fine — the goal is to distinguish it visually from a live stat. Preferred: add `<TierBadge tier="projection" />` immediately before the span (consistent with how projection badges are used elsewhere).

---

**Do not change:**
- Any scoring logic
- Any backend files
- Any existing `TierBadge` placements (headers, board cards, Lab cards — all correct)
- `TIER_BADGES` definition (all four tiers already defined correctly)

---

### CODEX TASK 77 — Private Predictive Models Tab

**Status:** Ready
**LOE:** Medium — new gated tab reusing existing Lab state and model endpoints
**Type:** Frontend only

**Goal:** A clean, read-only "Models" tab visible only to `isScoutUser` that surfaces today's model predictions in a polished format. The existing Lab tab is an internal calibration/debugging surface — this tab is the user-facing output layer. Same data, cleaner presentation, no calibration recording, no pick logging.

---

**Context (read before touching anything):**
- `isScoutUser` is already defined: `const isScoutUser = !!currentUser && SCOUT_ALLOWLIST.includes(scoutIdentity)`
- The four model state variables **already exist** from the Lab tab: `labData`, `labFgData`, `labKData`, `labTotalsData` (and their loading twins)
- The four fetch callbacks **already exist**: `fetchLabData`, `fetchLabFgData`, `fetchLabKData`, `fetchLabTotalsData`
- The fetch `useEffect`s fire when `view === "lab" && labSubTab === "f5ml"` etc. — these need to **also fire for `view === "models"`**
- `TierBadge tier="predictive"` — already defined, renders a green `PREDICTIVE` chip
- `formatLocalTime(isoStr)` — already defined, converts ISO game time to "2:40 PM PDT"
- Nav buttons for Scout, HR Scout, Advisor, Lab are around lines 5641–5671

---

**Step 1 — Add `modelsSubTab` state**

Near where `labSubTab` is declared (search for `const [labSubTab`), add:
```js
const [modelsSubTab, setModelsSubTab] = useState("f5ml");
```

---

**Step 2 — Update Lab fetch useEffects to also trigger for `view === "models"`**

Find the four Lab fetch `useEffect`s. Each currently has a guard like:
```js
if (view !== "lab" || labSubTab !== "f5ml" || ...) return;
```

Change each to also trigger when the Models tab is active with the same sub-tab selected. Replace `view !== "lab"` with `(view !== "lab" && view !== "models")`. Also update the sub-tab reference to check against BOTH `labSubTab` and `modelsSubTab`:

```js
// F5 effect — change from:
if (view !== "lab" || labSubTab !== "f5ml" || !currentUser || !isScoutUser || labData !== null || labLoading) return;

// To:
if ((view !== "lab" && view !== "models") || (view === "lab" ? labSubTab : modelsSubTab) !== "f5ml" || !currentUser || !isScoutUser || labData !== null || labLoading) return;
```

Apply the same pattern to the fullgame, kprop, and totals effects (checking `"fullgame"`, `"kprop"`, `"totals"` respectively).

Also update the dependency arrays to include `modelsSubTab`:
```js
}, [view, labSubTab, modelsSubTab, currentUser, isScoutUser, labData, labLoading]);
```

---

**Step 3 — Add `📊 Models` nav button**

After the `🔬 Lab` nav button block (around line 5666–5670), add:
```jsx
{isScoutUser && (
  <button
    onClick={() => setView("models")}
    style={{
      background: view === "models" ? "#a78bfa" : "#161827",
      border: `1px solid ${view === "models" ? "#a78bfa" : "#1f2437"}`,
      borderRadius: 8,
      padding: isNarrowPhone ? "6px 10px" : "6px 12px",
      fontSize: isNarrowPhone ? 9 : 10,
      color: view === "models" ? "#000" : "#9ca3af",
      fontFamily: "monospace",
      fontWeight: 700,
      cursor: "pointer",
      textTransform: "uppercase",
    }}
  >
    📊 Models
  </button>
)}
```

---

**Step 4 — Add `view === "models"` render block**

Add the following JSX block immediately after the `{view === "lab" && ...}` render block closes (search for the closing of `{view === "lab" && isScoutUser && (() => {`). Place it at the same nesting level.

The Models tab displays all four models with a clean card layout. Here is the full render block:

```jsx
{view === "models" && isScoutUser && (() => {
  const isModF5 = modelsSubTab === "f5ml";
  const isModFG = modelsSubTab === "fullgame";
  const isModK  = modelsSubTab === "kprop";
  const isModTot = modelsSubTab === "totals";
  const activeData    = isModF5 ? labData    : isModFG ? labFgData    : isModK ? labKData    : labTotalsData;
  const activeLoading = isModF5 ? labLoading : isModFG ? labFgLoading : isModK ? labKLoading : labTotalsLoading;
  const doRefresh = () => (isModF5 ? fetchLabData(true) : isModFG ? fetchLabFgData(true) : isModK ? fetchLabKData(true) : fetchLabTotalsData(true));

  // Build top-3 factors from model.features for ML models
  function getTopFactors(g) {
    if (isModTot) {
      const f = g.model?.features ?? {};
      const factors = [
        { label: "Home offense", value: f.homeRPG != null ? `${f.homeRPG.toFixed(1)} R/G` : null },
        { label: "Away offense", value: f.awayRPG != null ? `${f.awayRPG.toFixed(1)} R/G` : null },
        { label: "Home SP ERA", value: f.homeSpEra != null ? f.homeSpEra.toFixed(2) : null },
        { label: "Away SP ERA", value: f.awaySpEra != null ? f.awaySpEra.toFixed(2) : null },
        { label: "Bullpen ERA", value: f.combinedBullpenEra != null ? f.combinedBullpenEra.toFixed(2) : null },
      ].filter(x => x.value != null).slice(0, 3);
      return factors;
    }
    if (isModK) {
      // For K prop we have two pitchers — return factors for each
      return [];
    }
    // ML models (F5, Full-Game)
    const m = g.model ?? {};
    const f = m.features ?? {};
    const leanSide = m.leanSide ?? "home";
    const awayName = g.away?.abbr ?? "Away";
    const homeName = g.home?.abbr ?? "Home";
    const rawFactors = [
      { label: "SP ERA edge", raw: f.eraDiff ?? 0 },
      { label: "WHIP edge", raw: f.whipDiff ?? 0 },
      { label: "Form trend", raw: f.formDiff ?? 0 },
      { label: "Ump tendency", raw: f.umpKTendency ?? 0 },
      { label: "Bullpen ERA edge", raw: f.bullpenEraDiff ?? 0 },
    ].filter(x => Math.abs(x.raw) > 0.001);
    rawFactors.sort((a, b) => Math.abs(b.raw) - Math.abs(a.raw));
    return rawFactors.slice(0, 3).map(x => ({
      label: x.label,
      value: x.raw > 0
        ? `favors ${awayName} (+${x.raw.toFixed(2)})`
        : `favors ${homeName} (${x.raw.toFixed(2)})`,
    }));
  }

  return (
    <div style={{ padding: "12px 0", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace", letterSpacing: "0.05em" }}>📊 MODELS</div>
            <TierBadge tier="predictive" />
            <span style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 800, color: "#fca5a5", fontFamily: "monospace", letterSpacing: "0.05em" }}>
              EXPERIMENTAL
            </span>
          </div>
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
            Private model output — not for distribution
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: "#9ca3af", fontFamily: "monospace", background: "rgba(255,255,255,0.04)", border: "1px solid #1f2437", borderRadius: 999, padding: "4px 8px" }}>
            {activeData?.date ?? "today"}
          </div>
          <button
            onClick={doRefresh}
            disabled={activeLoading}
            style={{
              background: activeLoading ? "rgba(255,255,255,0.04)" : "rgba(167,139,250,0.15)",
              border: `1px solid ${activeLoading ? "#2d3148" : "rgba(167,139,250,0.35)"}`,
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 10,
              fontWeight: 700,
              color: activeLoading ? "#4b5563" : "#a78bfa",
              cursor: activeLoading ? "default" : "pointer",
              fontFamily: "monospace",
            }}
          >
            ↺ Refresh
          </button>
        </div>
      </div>

      {/* Sub-tab selector */}
      <div style={{ display: "flex", gap: 6 }}>
        {[["f5ml", "F5 ML"], ["fullgame", "Full-Game ML"], ["kprop", "K Prop"], ["totals", "Totals"]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setModelsSubTab(key)}
            style={{
              background: modelsSubTab === key ? "rgba(167,139,250,0.18)" : "#161827",
              border: `1px solid ${modelsSubTab === key ? "rgba(167,139,250,0.45)" : "#1f2437"}`,
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 10,
              fontWeight: 700,
              color: modelsSubTab === key ? "#a78bfa" : "#9ca3af",
              cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {activeLoading && !activeData && (
        <Card>
          <div style={{ textAlign: "center", padding: 40, color: "#6b7280", fontSize: 11 }}>
            Running {isModF5 ? "F5" : isModFG ? "full-game" : isModK ? "K prop" : "totals"} model across today&apos;s slate…
          </div>
        </Card>
      )}

      {/* Error */}
      {activeData?.error && (
        <div style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)", borderRadius: 10, padding: "10px 12px", fontSize: 11, color: "#fca5a5" }}>
          {activeData.error}
        </div>
      )}

      {/* Empty state */}
      {!activeLoading && activeData && (activeData.games?.length ?? 0) === 0 && !activeData.error && (
        <Card>
          <div style={{ textAlign: "center", padding: 30, color: "#6b7280", fontSize: 11 }}>
            No {isModF5 ? "F5" : isModFG ? "full-game" : isModK ? "K prop" : "totals"} model games available yet.
          </div>
        </Card>
      )}

      {/* Game cards */}
      {activeData?.games?.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* ── ML model cards (F5 + Full-Game) ── */}
          {(isModF5 || isModFG) && activeData.games.map((g) => {
            const m = g.model ?? {};
            const lean = m.leanSide === "home" ? g.home?.abbr : g.away?.abbr;
            const leanProb = m.leanSide === "home" ? m.homeProb : m.awayProb;
            const probPct = leanProb != null ? `${Math.round(leanProb * 100)}%` : "—";
            const leanColor = m.hasEdge ? "#a78bfa" : "#9ca3af";
            const factors = getTopFactors(g);
            const awayOdds = m.awayEdge != null ? `${m.awayEdge >= 0 ? "+" : ""}${(m.awayEdge * 100).toFixed(0)}` : null;
            const homeOdds = m.homeEdge != null ? `${m.homeEdge >= 0 ? "+" : ""}${(m.homeEdge * 100).toFixed(0)}` : null;
            return (
              <Card key={g.gamePk} style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {/* Game + time */}
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>
                        {g.away?.abbr ?? "?"} @ {g.home?.abbr ?? "?"}
                      </div>
                      {g.gameTime && (
                        <div style={{ fontSize: 10, color: "#6b7280", fontFamily: "monospace" }}>
                          {formatLocalTime(g.gameTime)}
                        </div>
                      )}
                      {m.hasEdge && (
                        <span style={{ background: "rgba(167,139,250,0.14)", border: "1px solid rgba(167,139,250,0.35)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 800, color: "#a78bfa", fontFamily: "monospace" }}>
                          EDGE
                        </span>
                      )}
                      {g.dataWarning && (
                        <span style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 700, color: "#fbbf24", fontFamily: "monospace" }}>
                          DATA GAP
                        </span>
                      )}
                    </div>
                    {/* Pitchers */}
                    <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6 }}>
                      {g.awayPitcher?.name ?? "TBD"} vs {g.homePitcher?.name ?? "TBD"}
                    </div>
                    {/* Model output row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>LEAN</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: leanColor, fontFamily: "monospace" }}>{lean ?? "—"}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: leanColor, fontFamily: "monospace" }}>{probPct}</span>
                      </div>
                      {awayOdds && homeOdds && (
                        <div style={{ fontSize: 10, color: "#4b5563", fontFamily: "monospace" }}>
                          edge: {g.away?.abbr} {awayOdds}% · {g.home?.abbr} {homeOdds}%
                        </div>
                      )}
                    </div>
                    {/* Factors */}
                    {factors.length > 0 && (
                      <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 2 }}>
                        {factors.map((f, i) => (
                          <div key={i} style={{ fontSize: 10, color: "#6b7280" }}>
                            <span style={{ color: "#4b5563", fontFamily: "monospace" }}>· </span>
                            <span style={{ color: "#9ca3af" }}>{f.label}: </span>
                            <span style={{ color: "#d1d5db" }}>{f.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    <TierBadge tier="predictive" />
                  </div>
                </div>
              </Card>
            );
          })}

          {/* ── K Prop model cards ── */}
          {isModK && activeData.games.map((g) => {
            const umpTend = g.umpire?.kTendency != null ? (g.umpire.kTendency > 0 ? `+${(g.umpire.kTendency * 100).toFixed(0)}% K` : `${(g.umpire.kTendency * 100).toFixed(0)}% K`) : null;
            const renderKProp = (kp, pitcher, side) => {
              if (!kp || kp.dataWarning) return null;
              const edgeColor = kp.hasEdge ? "#a78bfa" : kp.lean === "OVER" ? "#22c55e" : "#ef4444";
              return (
                <div key={side} style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#d1d5db", fontFamily: "monospace" }}>{pitcher?.name ?? side}</span>
                    <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>line {kp.bookLine ?? "—"} K</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: edgeColor, fontFamily: "monospace" }}>
                      {kp.lean ?? "—"} {kp.predictedKs != null ? kp.predictedKs.toFixed(1) : "—"}
                    </span>
                    {kp.hasEdge && (
                      <span style={{ background: "rgba(167,139,250,0.14)", border: "1px solid rgba(167,139,250,0.35)", borderRadius: 999, padding: "2px 6px", fontSize: 8, fontWeight: 800, color: "#a78bfa", fontFamily: "monospace" }}>EDGE</span>
                    )}
                  </div>
                </div>
              );
            };
            return (
              <Card key={g.gamePk} style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>
                        {g.away?.abbr ?? "?"} @ {g.home?.abbr ?? "?"}
                      </div>
                      {g.gameTime && (
                        <div style={{ fontSize: 10, color: "#6b7280", fontFamily: "monospace" }}>{formatLocalTime(g.gameTime)}</div>
                      )}
                      {umpTend && (
                        <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>ump {umpTend}</span>
                      )}
                    </div>
                    {renderKProp(g.awayKProp, g.awayPitcher, "away")}
                    {renderKProp(g.homeKProp, g.homePitcher, "home")}
                    {!g.awayKProp && !g.homeKProp && (
                      <div style={{ fontSize: 10, color: "#4b5563" }}>No K prop data available</div>
                    )}
                  </div>
                  <TierBadge tier="predictive" />
                </div>
              </Card>
            );
          })}

          {/* ── Totals model cards ── */}
          {isModTot && activeData.games.map((g) => {
            const m = g.model ?? {};
            const edgeColor = m.hasEdge ? "#a78bfa" : m.lean === "OVER" ? "#22c55e" : "#ef4444";
            const factors = getTopFactors(g);
            return (
              <Card key={g.gamePk} style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>
                        {g.away?.abbr ?? "?"} @ {g.home?.abbr ?? "?"}
                      </div>
                      {g.gameTime && (
                        <div style={{ fontSize: 10, color: "#6b7280", fontFamily: "monospace" }}>{formatLocalTime(g.gameTime)}</div>
                      )}
                      {m.hasEdge && (
                        <span style={{ background: "rgba(167,139,250,0.14)", border: "1px solid rgba(167,139,250,0.35)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 800, color: "#a78bfa", fontFamily: "monospace" }}>EDGE</span>
                      )}
                      {g.dataWarning && (
                        <span style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 700, color: "#fbbf24", fontFamily: "monospace" }}>DATA GAP</span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6 }}>
                      {g.awayPitcher?.name ?? "TBD"} vs {g.homePitcher?.name ?? "TBD"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>TOTAL</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: edgeColor, fontFamily: "monospace" }}>
                          {m.lean ?? "—"} {m.predictedTotal != null ? m.predictedTotal.toFixed(1) : "—"}
                        </span>
                        <span style={{ fontSize: 10, color: "#4b5563", fontFamily: "monospace" }}>
                          (book {m.bookTotal ?? "—"})
                        </span>
                      </div>
                    </div>
                    {factors.length > 0 && (
                      <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 2 }}>
                        {factors.map((f, i) => (
                          <div key={i} style={{ fontSize: 10, color: "#6b7280" }}>
                            <span style={{ color: "#4b5563", fontFamily: "monospace" }}>· </span>
                            <span style={{ color: "#9ca3af" }}>{f.label}: </span>
                            <span style={{ color: "#d1d5db" }}>{f.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <TierBadge tier="predictive" />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
})()}
```

---

**Do NOT:**
- Create any new backend routes — `/api/model/f5`, `/api/model/fullgame`, `/api/model/kprop`, `/api/model/totals` are all already live
- Add calibration recording (`apiMutate("/api/model/calibration/record", ...)`) — that stays in Lab only
- Add any "Add to Picks" button — this tab is read-only in v1
- Change any Lab tab code except the four fetch `useEffect` guards (Step 2)
- Change `TIER_BADGES` or any existing badge definitions

**Verification:**
After making changes, run `node --check` on all modified `.js` backend files (none expected to be modified). Visually confirm:
1. `📊 Models` button appears in nav when `isScoutUser` is true
2. Sub-tab selector shows F5 ML / Full-Game ML / K Prop / Totals
3. Each card shows: game abbr, time, pitcher names, lean + prob, top factors, `PREDICTIVE` badge, `EDGE` badge when applicable
4. `EXPERIMENTAL` red badge in header
5. No "Add to Picks" button anywhere in the Models tab

---

### CODEX TASK 78 — UmpScorecards Weekly Refresh Job

**Status:** Ready
**LOE:** Low — backend cron job + admin trigger endpoint
**Type:** Backend only

**Problem:** `backend/data/umpires.json` is a static file populated manually. Umpire K/BB tendency stats drift across the season and the file never updates without a manual commit.

**Current data shape** (from `getUmpireStatsByName` in `snapshotJobs.js`):
```json
{
  "umpiresByName": {
    "Angel Hernandez": { "kRate": "19.2%", "bbRate": "9.1%", "tendency": "Tight zone — favors pitchers' ERA but suppresses Ks", "rating": "hitter" },
    ...
  }
}
```

**Implementation:**
1. Create `backend/jobs/refreshUmpireDataJob.js`
   - Fetch umpire stats from UmpScorecards.com (scrape `https://umpscorecards.com/umpires/` or use their available data export — check for a JSON/CSV endpoint at `https://umpscorecards.com` before resorting to HTML scrape)
   - Map to existing schema: `{ kRate, bbRate, tendency, rating }` per umpire full name
   - `rating`: derive from kRate — `>= 22% → "pitcher"`, `<= 17% → "hitter"`, else `"neutral"`
   - `tendency`: generate a short descriptive string consistent with existing entries
   - Write result to `backend/data/umpires.json` as `{ umpiresByName: { ... }, refreshedAt: ISO_STRING }`
2. Add cron in `scheduler.js`: every Monday at 3 AM Honolulu (`0 3 * * 1`)
3. Add admin trigger endpoint in `server.js`:
   ```
   GET /api/admin/jobs/refresh-umpire-data
   ```
   Same `x-admin-secret` header check as existing admin endpoints.

**Constraint:** Do not change the `umpiresByName[name]` shape — `getUmpireStatsByName` reads it directly and `snapshotUmpires` passes it into DB. Only the data values should update, not the schema.

---

### CODEX TASK 79 — Prediction Market Odds Rows (Kalshi + Polymarket)

**Status:** Ready
**LOE:** Medium — new backend route + two frontend table rows
**Type:** Full-stack

**Goal:** Add two rows to the multi-book odds table in the Intel tab — `KALSHI` and `POLY` — showing crowd-sourced win probabilities from each prediction market. No API keys required for either source. Both rows appear only when a matching market is found; they silently omit otherwise.

---

### Source 1 — Kalshi

**API:** `https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXMLBGAME&status=open`
No auth required for read-only data.

**Ticker format:** `KXMLBGAME-26APR221310CINTB`
- Strip prefix `KXMLBGAME-` → `26APR221310CINTB`
- Chars 0–1: year (`26`)
- Chars 2–4: month (`APR`)
- Chars 5–6: day (`22`)
- Chars 7–10: time HHMM (`1310`)
- Chars 11+: away+home abbrs concatenated (`CINTB` = CIN + TB)

**Team splitting:** Try all splits of the tail string where both parts are in the known Kalshi abbr set. Kalshi uses standard MLB abbreviations — same as our odds map keys.

**Price fields:** `yes_bid`, `yes_ask` (integer cents, 0–100 scale) or `yes_bid_dollars`, `yes_ask_dollars` (float 0–1 scale). Use midpoint: `(yes_bid + yes_ask) / 2` for cents, then divide by 100 for probability. "Yes" = away team wins.

---

### Source 2 — Polymarket

**API:** `https://gamma-api.polymarket.com/markets?active=true&limit=200&start_date_min=TODAY&end_date_max=TOMORROW`
No auth required.

**Market identification:** Filter for binary Yes/No markets (`outcomes[0]` contains "yes", `outcomes[1]` contains "no"). Both `outcomes` and `outcomePrices` are **stringified JSON arrays** — parse with `JSON.parse()`.

**Team extraction:** Parse `question` field (e.g. "Will the Yankees beat the Red Sox?"). `outcomePrices[0]` is the probability the team named first wins. Multiply decimal string by 100 for %.

**Question patterns to handle:**
- `"Will [the] [Team A] beat [the] [Team B]?"` → Team A is the "yes" team
- `"[Team A] to win vs [Team B]"` → Team A is the "yes" team

---

### Backend — create `backend/routes/predictionMarkets.js`** (new file):

```js
const express = require("express");
const axios = require("axios");
const cache = require("../services/cache");

const router = express.Router();
const CACHE_TTL = 15 * 60 * 1000;

// ── Shared team data ─────────────────────────────────────────────────────────
// All valid Kalshi/MLB abbreviations (used for ticker splitting)
const MLB_ABBRS = new Set([
  "ARI","ATL","BAL","BOS","CWS","CHC","CIN","CLE","COL",
  "DET","HOU","KC","LAA","LAD","MIA","MIL","MIN","NYM",
  "NYY","OAK","PHI","PIT","SD","SF","SEA","STL","TB","TEX","TOR","WSH",
]);

// Full/nickname → abbr for Polymarket question parsing
const NAME_TO_ABBR = {
  "arizona diamondbacks":"ARI","atlanta braves":"ATL","baltimore orioles":"BAL",
  "boston red sox":"BOS","chicago white sox":"CWS","chicago cubs":"CHC",
  "cincinnati reds":"CIN","cleveland guardians":"CLE","colorado rockies":"COL",
  "detroit tigers":"DET","houston astros":"HOU","kansas city royals":"KC",
  "los angeles angels":"LAA","los angeles dodgers":"LAD","miami marlins":"MIA",
  "milwaukee brewers":"MIL","minnesota twins":"MIN","new york mets":"NYM",
  "new york yankees":"NYY","oakland athletics":"OAK","philadelphia phillies":"PHI",
  "pittsburgh pirates":"PIT","san diego padres":"SD","san francisco giants":"SF",
  "seattle mariners":"SEA","st. louis cardinals":"STL","tampa bay rays":"TB",
  "texas rangers":"TEX","toronto blue jays":"TOR","washington nationals":"WSH",
  "diamondbacks":"ARI","braves":"ATL","orioles":"BAL","red sox":"BOS",
  "white sox":"CWS","cubs":"CHC","reds":"CIN","guardians":"CLE",
  "rockies":"COL","tigers":"DET","astros":"HOU","royals":"KC",
  "angels":"LAA","dodgers":"LAD","marlins":"MIA","brewers":"MIL",
  "twins":"MIN","mets":"NYM","yankees":"NYY","athletics":"OAK",
  "phillies":"PHI","pirates":"PIT","padres":"SD","giants":"SF",
  "mariners":"SEA","cardinals":"STL","rays":"TB","rangers":"TEX",
  "blue jays":"TOR","nationals":"WSH",
};

function todayHonolulu() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}
function tomorrowHonolulu() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}

// Store under both "A|B" and "B|A" so frontend match works regardless of home/away order
function addBothOrders(map, abbrA, abbrB, entry) {
  if (abbrA && abbrB) {
    map[`${abbrA}|${abbrB}`] = entry;
    map[`${abbrB}|${abbrA}`] = entry;
  }
}

// ── Kalshi helpers ────────────────────────────────────────────────────────────
// Parse "CINTB" → { away: "CIN", home: "TB" } using the known abbr set
function splitKalshiTeams(tail) {
  for (let i = 2; i <= tail.length - 2; i++) {
    const away = tail.slice(0, i);
    const home = tail.slice(i);
    if (MLB_ABBRS.has(away) && MLB_ABBRS.has(home)) return { away, home };
  }
  return null;
}

async function fetchKalshi() {
  const { data } = await axios.get(
    "https://api.elections.kalshi.com/trade-api/v2/markets",
    {
      params: { series_ticker: "KXMLBGAME", status: "open", limit: 200 },
      timeout: 12000,
      headers: { "User-Agent": "PropScout/1.0" },
    }
  );
  const markets = Array.isArray(data?.markets) ? data.markets : [];
  const byTeamPair = {};

  markets.forEach((m) => {
    const ticker = String(m.ticker ?? "");
    // Ticker: KXMLBGAME-26APR221310CINTB
    const suffix = ticker.replace(/^KXMLBGAME-/i, ""); // "26APR221310CINTB"
    if (suffix.length < 13) return;
    const teamTail = suffix.slice(11); // chars after YYMMMDDHHMM
    const teams = splitKalshiTeams(teamTail);
    if (!teams) return;

    // Prices: try integer cents fields first, then dollar fields
    let yesMid = null;
    if (m.yes_bid != null && m.yes_ask != null) {
      yesMid = (Number(m.yes_bid) + Number(m.yes_ask)) / 2; // 0–100 cents
    } else if (m.yes_bid_dollars != null && m.yes_ask_dollars != null) {
      yesMid = ((Number(m.yes_bid_dollars) + Number(m.yes_ask_dollars)) / 2) * 100;
    } else if (m.last_price != null) {
      yesMid = Number(m.last_price); // cents
    } else if (m.last_price_dollars != null) {
      yesMid = Number(m.last_price_dollars) * 100;
    }
    if (yesMid == null || isNaN(yesMid)) return;

    const awayProb = Math.round(yesMid); // "Yes" = away wins
    const homeProb = 100 - awayProb;
    const entry = { awayAbbr: teams.away, homeAbbr: teams.home, awayProb, homeProb, source: "kalshi" };
    addBothOrders(byTeamPair, teams.away, teams.home, entry);
  });

  return byTeamPair;
}

// ── Polymarket helpers ────────────────────────────────────────────────────────
function normalizeName(str) {
  return String(str ?? "").toLowerCase().replace(/[^a-z ]/g, "").trim();
}
function extractAbbr(text) {
  const n = normalizeName(text);
  const sorted = Object.keys(NAME_TO_ABBR).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (n.includes(key)) return NAME_TO_ABBR[key];
  }
  return null;
}
function parsePolyQuestion(question) {
  const q = normalizeName(question);
  const beatMatch = q.match(/will (?:the )?(.+?) beat (?:the )?(.+?)(?:\?|$)/);
  if (beatMatch) {
    const a = extractAbbr(beatMatch[1]);
    const b = extractAbbr(beatMatch[2]);
    if (a && b) return { winnerAbbr: a, loserAbbr: b };
  }
  const toWinMatch = q.match(/^(.+?) to win(?: vs (?:the )?(.+?))?(?:\?|$)/);
  if (toWinMatch) {
    const a = extractAbbr(toWinMatch[1]);
    const b = toWinMatch[2] ? extractAbbr(toWinMatch[2]) : null;
    if (a) return { winnerAbbr: a, loserAbbr: b };
  }
  return null;
}
function parseStringifiedArray(val) {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

async function fetchPolymarket() {
  const { data } = await axios.get("https://gamma-api.polymarket.com/markets", {
    params: {
      active: true,
      limit: 200,
      start_date_min: todayHonolulu(),
      end_date_max: tomorrowHonolulu(),
    },
    timeout: 12000,
    headers: { "User-Agent": "PropScout/1.0" },
  });
  const markets = Array.isArray(data) ? data : [];
  const byTeamPair = {};

  markets.forEach((m) => {
    if (!m.question || m.closed) return;
    const outcomes = parseStringifiedArray(m.outcomes);
    const prices = parseStringifiedArray(m.outcomePrices);
    if (outcomes.length !== 2 || prices.length !== 2) return;
    const isYesNo = normalizeName(outcomes[0]).includes("yes") &&
                    normalizeName(outcomes[1]).includes("no");
    if (!isYesNo) return;
    const parsed = parsePolyQuestion(m.question);
    if (!parsed?.winnerAbbr) return;
    const winnerProb = Math.round(parseFloat(prices[0]) * 100);
    if (isNaN(winnerProb)) return;
    const entry = {
      winnerAbbr: parsed.winnerAbbr,
      loserAbbr: parsed.loserAbbr,
      winnerProb,
      loserProb: 100 - winnerProb,
      source: "polymarket",
    };
    addBothOrders(byTeamPair, parsed.winnerAbbr, parsed.loserAbbr);
    // Manually add both orderings since addBothOrders needs the entry too
    if (parsed.winnerAbbr && parsed.loserAbbr) {
      byTeamPair[`${parsed.winnerAbbr}|${parsed.loserAbbr}`] = entry;
      byTeamPair[`${parsed.loserAbbr}|${parsed.winnerAbbr}`] = entry;
    }
  });

  return byTeamPair;
}

// ── Route ─────────────────────────────────────────────────────────────────────
router.get("/mlb-game-odds", async (_req, res) => {
  const cacheKey = `predmkt:mlb:${todayHonolulu()}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const [kalshiResult, polyResult] = await Promise.allSettled([
    fetchKalshi(),
    fetchPolymarket(),
  ]);

  const result = {
    date: todayHonolulu(),
    kalshi: kalshiResult.status === "fulfilled" ? kalshiResult.value : {},
    polymarket: polyResult.status === "fulfilled" ? polyResult.value : {},
    fetchedAt: new Date().toISOString(),
  };

  cache.set(cacheKey, result, CACHE_TTL);
  return res.json(result);
});

module.exports = router;
```

**Fix the `addBothOrders` call in `fetchPolymarket`:** The helper is defined but called incorrectly above — remove the `addBothOrders(byTeamPair, ...)` call in `fetchPolymarket` since the explicit assignment two lines below does it correctly. The final `fetchPolymarket` body should only use:
```js
byTeamPair[`${parsed.winnerAbbr}|${parsed.loserAbbr}`] = entry;
byTeamPair[`${parsed.loserAbbr}|${parsed.winnerAbbr}`] = entry;
```

**Mount in `backend/server.js`:**
```js
app.use("/api/prediction-markets", require("./routes/predictionMarkets"));
```

---

### Frontend — `prop-scout-v7.jsx`

**1. Add state:**
```js
const [livePredMarkets, setLivePredMarkets] = useState(null);
// shape: { date, kalshi: { "CIN|TB": { awayProb, homeProb } }, polymarket: { "NYY|BOS": { winnerAbbr, winnerProb, loserProb } } }
```

**2. Add fetch effect** (lazy, fires when Intel tab opens, same pattern as `liveTrends`):
```js
useEffect(() => {
  if (view !== "game" || tab !== "intel" || livePredMarkets !== null) return;
  apiFetch("/api/prediction-markets/mlb-game-odds")
    .then((data) => setLivePredMarkets(data ?? null))
    .catch(() => {});
}, [view, tab, livePredMarkets]);
```

**3. Add KALSHI + POLY rows** — inside the multi-book odds table block (around line 8940), after `{bookEntries.map(([label, b]) => ...)}` closes, add:

```jsx
{/* ── Prediction market rows: KALSHI then POLY ── */}
{(() => {
  if (!livePredMarkets) return null;
  const awayAbbr = game.away?.abbr;
  const homeAbbr = game.home?.abbr;
  const fwdKey = `${awayAbbr}|${homeAbbr}`;
  const revKey = `${homeAbbr}|${awayAbbr}`;

  // ── KALSHI row ──
  const kd = livePredMarkets.kalshi?.[fwdKey] ?? livePredMarkets.kalshi?.[revKey];
  const kalshiRow = kd ? (() => {
    // kd.awayAbbr is always the Kalshi "away" (from ticker); map to our away/home
    const ourAwayIsKalshiAway = kd.awayAbbr === awayAbbr;
    const awayProb = ourAwayIsKalshiAway ? kd.awayProb : kd.homeProb;
    const homeProb = ourAwayIsKalshiAway ? kd.homeProb : kd.awayProb;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "36px repeat(7, 1fr)", gap: 2, marginBottom: 3, background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.18)", borderRadius: 6, padding: "5px 4px", alignItems: "center" }}>
        <div style={{ fontSize: 8, fontWeight: 800, color: "#34d399", textAlign: "center", fontFamily: "monospace" }}>KSHI</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: awayProb > homeProb ? "#34d399" : "#9ca3af", textAlign: "center", fontFamily: "monospace" }}>{awayProb}%</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: homeProb > awayProb ? "#34d399" : "#9ca3af", textAlign: "center", fontFamily: "monospace" }}>{homeProb}%</div>
        {["—","—","—","—","—"].map((d, i) => <div key={i} style={{ fontSize: 9, color: "#4b5563", textAlign: "center", fontFamily: "monospace" }}>{d}</div>)}
      </div>
    );
  })() : null;

  // ── POLY row ──
  const pd = livePredMarkets.polymarket?.[fwdKey] ?? livePredMarkets.polymarket?.[revKey];
  const polyRow = pd ? (() => {
    const awayIsWinner = pd.winnerAbbr === awayAbbr;
    const awayProb = awayIsWinner ? pd.winnerProb : pd.loserProb;
    const homeProb = awayIsWinner ? pd.loserProb : pd.winnerProb;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "36px repeat(7, 1fr)", gap: 2, marginBottom: 3, background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.18)", borderRadius: 6, padding: "5px 4px", alignItems: "center" }}>
        <div style={{ fontSize: 8, fontWeight: 800, color: "#a78bfa", textAlign: "center", fontFamily: "monospace" }}>POLY</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: awayProb > homeProb ? "#a78bfa" : "#9ca3af", textAlign: "center", fontFamily: "monospace" }}>{awayProb}%</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: homeProb > awayProb ? "#a78bfa" : "#9ca3af", textAlign: "center", fontFamily: "monospace" }}>{homeProb}%</div>
        {["—","—","—","—","—"].map((d, i) => <div key={i} style={{ fontSize: 9, color: "#4b5563", textAlign: "center", fontFamily: "monospace" }}>{d}</div>)}
      </div>
    );
  })() : null;

  if (!kalshiRow && !polyRow) return null;
  return <>{kalshiRow}{polyRow}</>;
})()}
```

**Row styling:** KALSHI uses green (`#34d399`) — matching the Lab/calibration color since Kalshi is a regulated exchange. POLY uses purple (`#a78bfa`) — matching the Models tab. Both show only win % in the first two ML columns; total/spread cells show `—`.

---

**Do NOT:**
- Require any API key or env var — both APIs are public
- Fail the entire request if one source errors — `Promise.allSettled` ensures one failure doesn't block the other
- Show either row when no matching market is found for that game
- Change the column header row — the existing `awayML` / `homeML` headers read well for % values too

**Verification:**
Run `node --check backend/routes/predictionMarkets.js`. Test `GET /api/prediction-markets/mlb-game-odds` and confirm response shape: `{ date, kalshi: { "CIN|TB": { awayProb: 47, homeProb: 53, ... } }, polymarket: { ... } }`. In the Intel tab, KSHI row (green) appears above POLY row (purple), both showing win percentages, both silently absent when no market match found.

---

### CODEX TASK 80 — Board Score Adjustment for Scratched Batters

**Status:** Ready (depends on Task 76 being live, which it is)
**LOE:** Small — extend existing Board scoring + card display
**Type:** Frontend only

**Problem:** When a confirmed batter is scratched (Task 76), the Lineup tab shows the alert and Props tab reduces confidence — but the Board (HR tab, Hits tab) still ranks that batter normally. A scratched #3 hitter sitting atop the HR board is misleading.

**Implementation — `prop-scout-v7.jsx`:**

1. **Pass scratches into `computeBatterBoard`** — add `liveLineups` to the function signature (it already receives it for the confirmed/roster gate). Inside the `batters.forEach`, check if the batter's name or ID appears in `liveLineups[game.gamePk]?.scratches?.[side]`. If scratched, either:
   - Skip entirely (`continue`) — cleanest UX, scratched players just disappear from rankings
   - Or keep but apply a large score penalty (e.g. `-50`) and tag `c.scratched = true` — allows showing a badge

   **Recommended: skip entirely.** The board is a "bet on these players today" list. A scratched player shouldn't appear at all.

2. **Card display** — if keeping with penalty approach instead: show a red `SCRATCHED` chip on the card (same style as the existing scratch badge in Props tab), and drop the card to the bottom of its tier.

3. **Scratch name matching** — reuse `normalizeScratchName` (already defined at module level after Task 76). Compare against `liveLineups[game.gamePk]?.scratches?.[side]?.map(s => normalizeScratchName(s.name))`.

**Function signature change:**
```js
// Before
const computeBatterBoard = (type, liveSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits)
// No change needed — liveLineups is already the second argument
```
The scratches data is already on the `liveLineups` objects from Task 76's backend change. No new fetch needed.

---

*Updated 2026-05-05 — Session 72 complete · Tasks 73/75/76 approved · Task 74 partial · Tasks 77–80 queued*

---

## ✅ Session 73 — CW: Review Codex Tasks 78 + 80 (Task 79 skipped by user)

### Task 78 — UmpScorecards Weekly Refresh ✅ Approved

`refreshUmpireDataJob.js` is solid. `flattenRows` handles multiple possible API response shapes defensively. `mapRow` uses broad field aliasing (`kRate ?? k_rate ?? strikeoutRate`) and falls back to `existingByName` for any missing field — partial fetch never corrupts good data. `deriveRating` and `deriveTendency` match spec thresholds exactly (≥22% pitcher, ≤17% hitter). Cron wired at Monday 3 AM Honolulu, admin endpoint follows existing `x-admin-secret` pattern. All `node --check` passes.

### Task 79 — Prediction Market Odds Row ⏭ Skipped by user (re-specced in Session 74 to use Polymarket direct API)

### Task 80 — Board Scratch Adjustment ✅ Approved

Lines 2141–2147 in `computeBatterBoard` build `scratchedIds` (by player ID) and `scratchedNames` (normalized name) from `lu.scratches[side]`, then skip any matching batter before scoring. Dual-check (ID + name) is the correct defensive approach. Scratched players simply don't appear in Board rankings — cleanest UX. All `node --check` passes.

### What's next for Codex

Remaining queue in order:
- **Task 74** (continued) — Complete the Algorithmic / Projection / AI label audit across all tabs
- **Task 77** — Private Predictive Models tab (F5 ML first market, gated to scout user)

---

## ✅ Session 74 — CW: Task 74 Final Approval + Task 77 Spec Written

### Task 74 — TierBadge Label Audit ✅ Approved

Three exact gaps were identified and fixed:
- **Gap 1** (~line 6990): Scout individual pick cards — `<TierBadge tier="ai" />` added
- **Gap 2** (~line 7223): HR Scout individual pick cards — `<TierBadge tier="projection" />` added
- **Gap 3** (~line 5424): HR Scout board card `proj:` label — changed to `<TierBadge tier="projection" /><span>Est. {p.projectedValue}</span>`

All three confirmed present, no scoring logic or backend changes.

### Task 77 — Private Predictive Models Tab 📝 Spec Written

Full spec now in the CODEX TASKS section above. Key design decisions:

**Architecture:** Reuses existing Lab state variables (`labData`, `labFgData`, `labKData`, `labTotalsData`) — no new backend routes, no new fetch functions. The four Lab `useEffect` fetch guards are updated to also fire when `view === "models"`.

**New state:** `modelsSubTab` (mirrors `labSubTab` — same four keys: `"f5ml"`, `"fullgame"`, `"kprop"`, `"totals"`).

**Tab button:** `📊 Models`, purple accent (`#a78bfa`), placed after `🔬 Lab` in the nav row, gated to `isScoutUser`.

**Cards display:** Clean layout showing — game header (away @ home + time), pitcher matchup, model lean + win probability %, top 3 factors derived from `model.features`, `EDGE` badge when `model.hasEdge === true`, `DATA GAP` badge when `dataWarning === true`, `PREDICTIVE` tier badge. No calibration recording, no pick logging.

**Lab tab untouched** except the four `useEffect` guard conditions — calibration recording continues to fire only from Lab context.

### What's next for Codex

- **Task 77** — Private Predictive Models tab (spec is ready, full JSX in the CODEX TASKS section)
- **Task 79** — Polymarket + Kalshi Prediction Market Odds Rows (re-specced in Session 74)
- **Task 81** — DB-first migration: lab calibration (see CODEX TASKS section)
- **Task 82** — DB-first migration: picks + auth (see CODEX TASKS section)

*Updated 2026-05-06 — Session 74 complete · Tasks 74/77/79 approved · Tasks 81/82 specced*

---

## ✅ Session 75 — CW: Task 79 Approved + DB Migration Brainstorm

### Task 79 — Kalshi + Polymarket Prediction Market Rows ✅ Approved

`predictionMarkets.js` is clean. `splitKalshiTeams` greedy split is correct — tries every 2–4 char boundary until both parts hit `MLB_ABBRS`. Price fallback chain handles all four Kalshi field variants. Polymarket `parseStringifiedArray` correctly handles both pre-parsed arrays and stringified JSON. `Promise.allSettled` means one source failure never blocks the other. Both rows placed correctly inside the `odds.live && odds.books` branch. KSHI/POLY flip logic correctly maps winner/loser to our game's away/home orientation. `node --check` passes.

### DB Migration Decision

Confirmed: `DATABASE_URL` is set in Railway prod, `db.js` logs "PostgreSQL connected" on boot. Existing snapshot tables (slate, odds, bullpen, etc.) are already live in Postgres.

**Remaining JSON files to migrate:**
- `data/picks.json` — user prop log (race condition risk, limits multi-user, blocks CLV tracking)
- `data/users.json` — login accounts + bcrypt hashes (passwords in flat file)
- `data/lab-outcomes.json` — model calibration records (grows unbounded, hard to query)
- `data/umpires.json` — weekly-refreshed static lookup — **staying as JSON**
- `data/notes.json` — empty — **no action**

**Approach:** DB-first with JSON fallback. When `DATABASE_URL` is set, use Postgres. When not set (local dev without DB), fall back to existing JSON file logic. No existing picks data to migrate — start fresh. Users DO need to be seeded into the DB so existing logins keep working.

**Two tasks:**
- **Task 81** — Migration SQL + `labCalibration.js` swap (lowest stakes, isolated test of DB-first pattern)
- **Task 82** — `picks.js` + `gradePicksJob.js` + `auth.js` swaps + user seed script (higher stakes, touches auth and core picks flow)

---

### CODEX TASK 81 — DB-First Migration: Lab Calibration

**Status:** Ready
**LOE:** Small — new SQL migration + one service file swap
**Type:** Backend only
**Deploy order:** Run `node backend/scripts/migrate.js` in Railway after merging to apply new tables

**Goal:** Add the three new DB tables (`users`, `picks`, `lab_outcomes`) via a new migration file, then swap `labCalibration.js` to write to `lab_outcomes` when Postgres is available, falling back to the JSON file when it's not.

---

**Step 1 — Create `backend/migrations/002_picks_users_lab.sql`**

```sql
-- Users table (mirrors users.json structure)
CREATE TABLE IF NOT EXISTS users (
  id            TEXT         PRIMARY KEY,
  username      TEXT         NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  preferences   JSONB        NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(LOWER(username));

-- Picks table (fresh start — no migration of existing picks.json)
CREATE TABLE IF NOT EXISTS picks (
  id          TEXT         PRIMARY KEY,
  user_id     TEXT         NOT NULL,
  game_pk     TEXT,
  result      TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  data        JSONB        NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_picks_user_id ON picks(user_id);
CREATE INDEX IF NOT EXISTS idx_picks_result  ON picks(result);
CREATE INDEX IF NOT EXISTS idx_picks_game_pk ON picks(game_pk);

-- Lab calibration records
CREATE TABLE IF NOT EXISTS lab_outcomes (
  id           TEXT         PRIMARY KEY,
  game_pk      INTEGER,
  date         TEXT,
  model        TEXT,
  lean_side    TEXT,
  lean_prob    NUMERIC,
  lean_edge    NUMERIC,
  has_edge     BOOLEAN,
  subject_key  TEXT,
  book_line    NUMERIC,
  book_total   NUMERIC,
  result       TEXT,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lab_model ON lab_outcomes(model);
CREATE INDEX IF NOT EXISTS idx_lab_date  ON lab_outcomes(date);
```

---

**Step 2 — Update `backend/scripts/migrate.js`**

The current script only runs `001_init.sql`. Update it to run both files in order:

```js
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const { query, isConnected } = require("../services/db");

async function migrate() {
  if (!isConnected()) {
    console.error("DATABASE_URL not set — cannot run migrations");
    process.exit(1);
  }
  const migrationsDir = path.join(__dirname, "../migrations");
  const files = ["001_init.sql", "002_picks_users_lab.sql"];
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await query(sql);
    console.log(`  ✓ Applied ${file}`);
  }
  console.log("✅ All migrations applied");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
```

---

**Step 3 — Rewrite `backend/services/labCalibration.js`**

Replace the entire file with the DB-first version below. The public API (`readLog`, `appendEntry`, `resolveEntry`, `writeLog`) is preserved exactly — callers in `modelF5.js` don't change at all.

```js
const fs = require("fs/promises");
const path = require("path");
const { query, isConnected } = require("./db");

const DATA_DIR = path.join(__dirname, "..", "data");
const LOG_PATH = path.join(DATA_DIR, "lab-outcomes.json");

// ── JSON fallback helpers (unchanged from original) ───────────────────────────
async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readLogJson() {
  try {
    const raw = await fs.readFile(LOG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === "ENOENT") return [];
    console.warn(`labCalibration read failed: ${err.message}`);
    return [];
  }
}

async function writeLogJson(entries) {
  await ensureDataDir();
  const tmpPath = `${LOG_PATH}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(entries, null, 2));
  await fs.rename(tmpPath, LOG_PATH);
}

// ── DB helpers ────────────────────────────────────────────────────────────────
function rowToEntry(row) {
  return {
    id:          row.id,
    gamePk:      row.game_pk,
    date:        row.date,
    model:       row.model,
    leanSide:    row.lean_side,
    leanProb:    row.lean_prob != null ? Number(row.lean_prob) : null,
    leanEdge:    row.lean_edge != null ? Number(row.lean_edge) : null,
    hasEdge:     row.has_edge,
    subjectKey:  row.subject_key,
    bookLine:    row.book_line != null ? Number(row.book_line) : null,
    bookTotal:   row.book_total != null ? Number(row.book_total) : null,
    result:      row.result,
    resolvedAt:  row.resolved_at,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────
async function readLog() {
  if (isConnected()) {
    const r = await query(
      "SELECT * FROM lab_outcomes ORDER BY created_at ASC"
    );
    return (r?.rows ?? []).map(rowToEntry);
  }
  return readLogJson();
}

async function appendEntry(entry) {
  if (isConnected()) {
    await query(
      `INSERT INTO lab_outcomes
         (id, game_pk, date, model, lean_side, lean_prob, lean_edge,
          has_edge, subject_key, book_line, book_total, result, resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO NOTHING`,
      [
        entry.id,
        entry.gamePk ?? null,
        entry.date ?? null,
        entry.model ?? null,
        entry.leanSide ?? null,
        entry.leanProb ?? null,
        entry.leanEdge ?? null,
        entry.hasEdge ?? false,
        entry.subjectKey ?? null,
        entry.bookLine ?? null,
        entry.bookTotal ?? null,
        entry.result ?? null,
        entry.resolvedAt ?? null,
      ]
    );
    return true;
  }
  // JSON fallback
  const entries = await readLogJson();
  if (entries.some(e => e.id === entry.id)) return false;
  entries.push(entry);
  await writeLogJson(entries);
  return true;
}

async function resolveEntry(id, result) {
  if (isConnected()) {
    await query(
      `UPDATE lab_outcomes SET result = $1, resolved_at = NOW() WHERE id = $2`,
      [result, id]
    );
    return true;
  }
  // JSON fallback
  const entries = await readLogJson();
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return false;
  entries[idx] = { ...entries[idx], result, resolvedAt: new Date().toISOString() };
  await writeLogJson(entries);
  return true;
}

// writeLog: used internally — keep for compatibility but prefer targeted updates
async function writeLog(entries) {
  if (isConnected()) {
    // In DB mode, writeLog is a no-op — use appendEntry/resolveEntry instead
    return;
  }
  await writeLogJson(entries);
}

module.exports = { readLog, writeLog, appendEntry, resolveEntry, LOG_PATH };
```

---

**Do NOT:**
- Change any files in `backend/routes/` or `backend/jobs/` in this task
- Change `modelF5.js` — it calls `labCalibration.js` functions which have the same signatures
- Remove the JSON fallback — local dev without `DATABASE_URL` must still work

**Verification:**
1. `node --check backend/services/labCalibration.js` — must pass
2. `node --check backend/scripts/migrate.js` — must pass
3. `node --check backend/migrations/002_picks_users_lab.sql` is not a JS file — skip. Verify SQL syntax by reading it.
4. Confirm `appendEntry`, `resolveEntry`, `readLog`, `writeLog`, `LOG_PATH` are all still exported

---

### CODEX TASK 82 — DB-First Migration: Picks + Auth

**Status:** Ready (do Task 81 first and confirm it deploys cleanly)
**LOE:** Medium — three file swaps + one seed script
**Type:** Backend only

**Goal:** Swap `picks.js`, `gradePicksJob.js`, and `auth.js` to DB-first with JSON fallback. Create a one-time `seed-users-db.js` script that populates the `users` table from `users.json` so existing logins keep working.

**Important context:**
- `users.json` has `id` as `"user1"`, `"user2"` etc. — keep these exact string IDs in the DB so existing JWTs (which encode `userId`) remain valid
- `users.json` has `passwordHash` field — the DB column is `password_hash` (snake_case)
- `users.json` has optional `preferences` object — maps to `preferences JSONB`
- No existing picks to migrate — `picks` table starts empty, users pick up fresh
- `picks.json` stores picks with `userId` as a string matching the user `id` field

---

**Step 1 — Create `backend/scripts/seed-users-db.js`**

This script reads `users.json` and inserts each user into the `users` table. Run once in Railway after Task 81 migrations are applied.

```js
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const { query, isConnected } = require("../services/db");

async function seedUsers() {
  if (!isConnected()) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const usersFile = path.join(__dirname, "../data/users.json");
  const users = JSON.parse(fs.readFileSync(usersFile, "utf8"));

  for (const u of users) {
    await query(
      `INSERT INTO users (id, username, password_hash, preferences)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
         SET username = EXCLUDED.username,
             password_hash = EXCLUDED.password_hash,
             preferences = EXCLUDED.preferences`,
      [
        u.id,
        u.username,
        u.passwordHash,
        JSON.stringify(u.preferences ?? {}),
      ]
    );
    console.log(`  ✓ Seeded user: ${u.username}`);
  }

  console.log("✅ User seed complete");
  process.exit(0);
}

seedUsers().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
```

---

**Step 2 — Rewrite `backend/routes/picks.js`**

Replace the entire file. The HTTP API surface is identical — same routes, same response shapes — callers (frontend) don't change.

```js
const express = require("express");
const fs = require("fs");
const path = require("path");
const requireAuth = require("../middleware/auth");
const { query, isConnected } = require("../services/db");

const router = express.Router();
router.use(requireAuth);

const DATA_DIR = path.join(__dirname, "..", "data");
const PICKS_FILE = path.join(DATA_DIR, "picks.json");

// ── JSON fallback helpers ─────────────────────────────────────────────────────
function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PICKS_FILE))
    fs.writeFileSync(PICKS_FILE, JSON.stringify({ picks: [] }, null, 2));
}
function readStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(PICKS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.picks) ? parsed : { picks: [] };
  } catch { return { picks: [] }; }
}
function writeStore(store) {
  ensureStore();
  fs.writeFileSync(PICKS_FILE, JSON.stringify(store, null, 2));
}

// ── Routes ────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  if (isConnected()) {
    const r = await query(
      "SELECT data FROM picks WHERE user_id = $1 ORDER BY created_at DESC",
      [req.userId]
    );
    return res.json({ picks: (r?.rows ?? []).map(row => row.data) });
  }
  const store = readStore();
  return res.json({ picks: store.picks.filter(p => p.userId === req.userId) });
});

router.post("/", async (req, res) => {
  const entry = { ...(req.body ?? {}), userId: req.userId };
  if (!entry.id) return res.status(400).json({ error: "id required" });

  if (isConnected()) {
    const existing = await query("SELECT data FROM picks WHERE id = $1", [entry.id]);
    if (existing?.rows?.length) {
      const row = existing.rows[0].data;
      if (row.userId !== req.userId) return res.status(403).json({ error: "Forbidden" });
      return res.json(row);
    }
    await query(
      `INSERT INTO picks (id, user_id, game_pk, result, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [entry.id, req.userId, entry.gamePk ?? null, entry.result ?? null, JSON.stringify(entry)]
    );
    return res.status(201).json(entry);
  }

  // JSON fallback
  const store = readStore();
  const existing = store.picks.find(p => p.id === entry.id);
  if (existing) {
    if (existing.userId !== req.userId) return res.status(403).json({ error: "Forbidden" });
    return res.json(existing);
  }
  store.picks.push(entry);
  writeStore(store);
  return res.status(201).json(entry);
});

router.patch("/:id", async (req, res) => {
  const result = req.body?.result ?? null;

  if (isConnected()) {
    const existing = await query("SELECT data FROM picks WHERE id = $1", [req.params.id]);
    if (!existing?.rows?.length) return res.status(404).json({ error: "Pick not found" });
    const row = existing.rows[0].data;
    if (row.userId !== req.userId) return res.status(403).json({ error: "Forbidden" });
    const updated = { ...row, result };
    await query(
      "UPDATE picks SET result = $1, data = $2 WHERE id = $3",
      [result, JSON.stringify(updated), req.params.id]
    );
    return res.json(updated);
  }

  // JSON fallback
  const store = readStore();
  const index = store.picks.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Pick not found" });
  if (store.picks[index].userId !== req.userId) return res.status(403).json({ error: "Forbidden" });
  store.picks[index] = { ...store.picks[index], result };
  writeStore(store);
  return res.json(store.picks[index]);
});

router.delete("/:id", async (req, res) => {
  if (isConnected()) {
    const existing = await query("SELECT data FROM picks WHERE id = $1", [req.params.id]);
    if (!existing?.rows?.length) return res.status(404).json({ error: "Pick not found" });
    if (existing.rows[0].data.userId !== req.userId) return res.status(403).json({ error: "Forbidden" });
    await query("DELETE FROM picks WHERE id = $1", [req.params.id]);
    return res.json({ ok: true });
  }

  // JSON fallback
  const store = readStore();
  const index = store.picks.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Pick not found" });
  if (store.picks[index].userId !== req.userId) return res.status(403).json({ error: "Forbidden" });
  store.picks.splice(index, 1);
  writeStore(store);
  return res.json({ ok: true });
});

module.exports = router;
```

---

**Step 3 — Rewrite `backend/jobs/gradePicksJob.js`**

Only the `readPicks` and `writePicks` helpers change. The `computeGrade` and `fetchBoxForGrading` functions are large and correct — **do not touch them**. Only replace the top section (imports + `readPicks` + `writePicks`) and the `gradePendingPicks` function body. Keep `computeGrade` and `fetchBoxForGrading` exactly as-is.

```js
// Replace ONLY the top of the file (imports + readPicks + writePicks)
// and the gradePendingPicks function. Do NOT touch computeGrade or fetchBoxForGrading.

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { query, isConnected } = require("../services/db");

const PICKS_FILE = path.join(__dirname, "..", "data", "picks.json");
const MLB_BASE = "https://statsapi.mlb.com/api/v1";

function readPicksJson() {
  try {
    const raw = fs.readFileSync(PICKS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.picks) ? parsed.picks : [];
  } catch { return []; }
}

function writePicksJson(picks) {
  const current = (() => {
    try { return JSON.parse(fs.readFileSync(PICKS_FILE, "utf8")); }
    catch { return { picks: [] }; }
  })();
  fs.writeFileSync(PICKS_FILE, JSON.stringify({ ...current, picks }, null, 2));
}

// ... (keep parseIpToOuts, normalizeName, computeGrade, fetchBoxForGrading EXACTLY AS-IS) ...

async function gradePendingPicks() {
  let picks;
  let useDb = isConnected();

  if (useDb) {
    const r = await query("SELECT id, game_pk, data FROM picks WHERE result IS NULL");
    picks = (r?.rows ?? []).map(row => ({ ...row.data, id: row.id, gamePk: row.game_pk }));
  } else {
    picks = readPicksJson();
  }

  const pending = picks.filter(p => p.result === null || p.result === undefined);
  if (!pending.length) {
    console.log("  · Grade job: no pending picks");
    return { graded: 0, total: 0 };
  }

  const byGame = {};
  pending.forEach(p => {
    const key = String(p.gamePk);
    if (!byGame[key]) byGame[key] = [];
    byGame[key].push(p);
  });

  let gradedCount = 0;
  const updates = {};

  await Promise.all(
    Object.entries(byGame).map(async ([gamePkStr, gamePicks]) => {
      const box = await fetchBoxForGrading(gamePkStr);
      if (!box) return;
      gamePicks.forEach(pick => {
        const grade = computeGrade(pick, box);
        if (grade !== null) { updates[pick.id] = grade; gradedCount++; }
      });
    })
  );

  if (gradedCount > 0) {
    if (useDb) {
      await Promise.all(
        Object.entries(updates).map(([id, result]) =>
          query(
            "UPDATE picks SET result = $1, data = data || $2 WHERE id = $3",
            [result, JSON.stringify({ result }), id]
          )
        )
      );
    } else {
      const updated = picks.map(p => updates[p.id] !== undefined ? { ...p, result: updates[p.id] } : p);
      writePicksJson(updated);
    }
    console.log(`  ✓ Grade job: settled ${gradedCount} pick(s)`);
  }

  return { graded: gradedCount, total: pending.length };
}

module.exports = { gradePendingPicks };
```

---

**Step 4 — Rewrite `backend/routes/auth.js`**

Same approach — identical HTTP API, DB-first with JSON fallback. The `VALID_BOOKS` validation and JWT signing logic are unchanged.

```js
const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const requireAuth = require("../middleware/auth");
const { query, isConnected } = require("../services/db");

const router = express.Router();

const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const VALID_BOOKS = ["DK", "FD", "CZR", "MGM", "BOV"];

// ── JSON fallback helpers ─────────────────────────────────────────────────────
function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
}
function readUsers() {
  ensureStore();
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function writeUsers(users) {
  ensureStore();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ── DB helpers ────────────────────────────────────────────────────────────────
function rowToUser(row) {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    preferences: row.preferences ?? {},
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "");

  let user;
  if (isConnected()) {
    const r = await query(
      "SELECT * FROM users WHERE LOWER(username) = LOWER($1)",
      [username]
    );
    user = r?.rows?.length ? rowToUser(r.rows[0]) : null;
  } else {
    const users = readUsers();
    user = users.find(u => String(u.username ?? "").toLowerCase() === username.toLowerCase()) ?? null;
  }

  if (!user || !user.passwordHash || !process.env.JWT_SECRET) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { userId: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
  return res.json({ token, userId: user.id, username: user.username });
});

router.get("/me", requireAuth, (req, res) => {
  return res.json({ userId: req.userId, username: req.username });
});

router.get("/preferences", requireAuth, async (req, res) => {
  if (isConnected()) {
    const r = await query("SELECT preferences FROM users WHERE id = $1", [req.userId]);
    if (!r?.rows?.length) return res.status(404).json({ error: "User not found" });
    return res.json({ preferences: r.rows[0].preferences ?? {} });
  }
  const users = readUsers();
  const user = users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({ preferences: user.preferences ?? {} });
});

router.put("/preferences", requireAuth, async (req, res) => {
  const { preferredBook } = req.body ?? {};
  if (preferredBook !== null && preferredBook !== undefined && !VALID_BOOKS.includes(preferredBook)) {
    return res.status(400).json({ error: `preferredBook must be one of: ${VALID_BOOKS.join(", ")} or null` });
  }

  if (isConnected()) {
    const r = await query("SELECT preferences FROM users WHERE id = $1", [req.userId]);
    if (!r?.rows?.length) return res.status(404).json({ error: "User not found" });
    const current = r.rows[0].preferences ?? {};
    const updated = { ...current, ...(preferredBook !== undefined ? { preferredBook: preferredBook ?? null } : {}) };
    await query("UPDATE users SET preferences = $1 WHERE id = $2", [JSON.stringify(updated), req.userId]);
    return res.json({ preferences: updated });
  }

  // JSON fallback
  const users = readUsers();
  const idx = users.findIndex(u => u.id === req.userId);
  if (idx === -1) return res.status(404).json({ error: "User not found" });
  users[idx].preferences = { ...(users[idx].preferences ?? {}), ...(preferredBook !== undefined ? { preferredBook: preferredBook ?? null } : {}) };
  writeUsers(users);
  return res.json({ preferences: users[idx].preferences });
});

module.exports = router;
```

---

**Do NOT:**
- Change `middleware/auth.js` — JWT verification is unchanged
- Change any frontend files
- Remove the JSON fallback from any file
- Touch `computeGrade` or `fetchBoxForGrading` in `gradePicksJob.js`

**Deploy order after merging:**
1. `node backend/scripts/migrate.js` — applies `002_picks_users_lab.sql`
2. `node backend/scripts/seed-users-db.js` — populates users table from `users.json`
3. Restart the Railway service — picks and auth now use Postgres

**Verification:**
1. `node --check` on all four new/modified files
2. Confirm `seed-users-db.js` logs each username without error
3. Test login with an existing account — JWT should return as before
4. Add a pick, reload the app — pick should persist (coming from DB now)
5. Check Railway logs for any `query` errors on startup

---

## ✅ Session 77 — CW: Task 83–87 Catch-Up + Task 88 Specced

**Files changed this session:** `prop-scout-v7.jsx`

---

### Task 83 — Revert Roster Fallback (Confirmed-Only) ✅
Reverted batter board to show batters only when lineup is confirmed. Roster fallback (pre-confirmation) removed from HR/Hits/Lineup tabs. Codex-approved.

### Task 74 — TierBadge Label Gaps (3 remaining) ✅
- Scout pick cards → `<TierBadge tier="ai" />`
- HR Scout pick cards → `<TierBadge tier="projection" />`
- `proj:` prefix in Model Picks → `Est.` with `<TierBadge tier="projection" />`
Codex-approved.

### Task 84 — Batter Board Card Summaries with H2H Matchup Context ✅
`matchup` object added to batter candidates in `computeBatterBoard`:
- `batterHand`, `pitcherHand`, `batterVsHand` (avg/ops vs pitcher handedness), `pitcherTopPitches` (top 2 by usage), `batterVsPitches` (batter avg vs those pitches)
- `buildBoardSummaryRequest` and `hydrateCardSummaries` pass `matchup` through to POST
- `cardSummary.js` system prompt updated with H2H instruction + example; `matchup` included in cache hash
Codex-approved.

### Task 85 — Roster Mode on Board (HR/Hits) with Badges ✅
Board (HR/Hits tabs) shows roster players pre-confirmation with `LINEUP TBD` (gray) badge; `✓ CONFIRMED` (green) when confirmed. Badges hidden once game goes LIVE or FINAL.

### Task 86 — Lineup Tab Shows Roster Players ✅
Lineup tab inside game cards now shows roster players before lineup confirmation, with a `ROSTER` chip in the tab toggle. Vulnerability analysis card gated on `lineupConfirmed` (confirmed-only); placeholder shown for roster state.

### Task 87 — Browser Refresh Logout Fix + Soft Refresh Button ✅
**Part A:** `_authToken` initialized from localStorage at module level (not inside useEffect), eliminating the 401-on-reload logout bug.
**Part B:** Soft refresh button (circular ↻) added to top nav bar after the Board tab button. `handleSoftRefresh` resets all live data states. Spinner animation while refreshing. "X min ago" / "just now" timestamp label appears after first refresh.

---

### CODEX TASK 88 — Lab: Season Overview Panel + Calibration Curves (pending Codex)

Full spec in `AGENT_SYSTEM_PROMPT.md` under **CODEX TASK 88**.

**Summary:**
- **Part A** — Season Overview panel above the sub-tab buttons: ROI simulation (edge picks only, +100/-110 juice), combined stats (accuracy, Brier, total settled), 4-row model comparison table
- **Part B** — Calibration curve SVG after each model's Track Record stats grid: confidence buckets (50–54%, 55–64%, 65–74%, 75–84%, 85%+) vs actual hit rate, with diagonal reference line
- Pure frontend — no backend changes; data already in `labCalibration.entries` + `labCalibration.summary`
- One new state: `showLabSeasonOverview` (boolean, default `true`)

*Updated 2026-05-06 — Session 77 complete · CODEX TASK 88 specced*

---

## 🗒 Session 78 — CW: AI Board Brainstorm + CODEX TASK 89 Specced

**No files changed this session.** Spec written only.

---

### AI-Powered Board — Strategic Decision

Decision: replace Scout, HR Scout, and Advisor tabs with a single **AI-Powered Board** tab.

Rationale:
- Scout / HR Scout / Advisor are three separate fetch + render pipelines doing overlapping things
- A unified AI Board consolidates them into one ranked list across all markets
- Adds two new quality layers: Monte Carlo simulation confidence + Haiku AI scoring

**Three-phase plan:**
- **Phase 1 (Task 89)** — Monte Carlo sim layer: adds `simConfidence` (0–100) to every board card, pure frontend math, no LLM
- **Phase 2 (Task 90)** — AI Board tab: single Haiku call produces composite AI scores; Scout/HR Scout/Advisor removed
- **Phase 3** — Scrapped (web search/trends)

---

### CODEX TASK 89 — Monte Carlo Simulation Layer (pending Codex)

Full spec in `AGENT_SYSTEM_PROMPT.md` under **CODEX TASK 89**.

**Summary:**
- 4 new module-level pure functions: `sampleNormal`, `simKConfidence`, `simOutsConfidence`, `simHRConfidence`, `simHitsConfidence`
- Each runs N=50 simulations using Box-Muller normal sampling (K, Outs, Hits) or Bernoulli trials (HR)
- `simConfidence` wired into `computePitcherBoard` and `computeBatterBoard` candidate objects
- `parkFactor: pf.k` added to pitcher candidates (required by `simKConfidence`)
- UI: `SIM XX%` secondary badge shown next to existing score badge on board cards
- Board sort order unchanged (still by algorithmic `score`)
- No backend changes, no new state, no new API calls

*Updated 2026-05-06 — Session 78 complete · CODEX TASK 89 specced*

---

## 🗒 Session 79 — CW: Task 89 Approved + Task 90 Specced (AI Board Tab)

**Task 89 approved:** Monte Carlo simulation layer confirmed clean. `simConfidence` on all board cards.

---

### CODEX TASK 90 — AI Board Tab (pending Codex)

Full spec in `AGENT_SYSTEM_PROMPT.md` under **CODEX TASK 90**.

**Decision:** Existing Board tab is UNTOUCHED. New `"ai-board"` tab added alongside it.

**Summary:**
- New `backend/routes/aiBoard.js` — POST `/api/ai-board/score`, Haiku-backed with MD5 cache (4h TTL), deterministic fallback (60% algo + 40% sim blend)
- Mount: `app.use("/api/ai-board", require("./routes/aiBoard"))` in server.js
- Frontend: 2 new state vars (`aiBoardData`, `aiBoardLoading`), `buildAiBoardPayload` helper (top 8 per market = 32 candidates max), useEffect gated on `view === "ai-board"`, `isScoutUser`, `liveSlate?.length`
- Tab button: `🤖 AI Board` purple (`#a78bfa`), scout users only, placed after Board button
- Cards: AI score (large, colored by 75/55 thresholds), ALG + SIM secondary badges, market chip (K Prop/Outs/HR/Hits), AI reason sentence, book line
- Sorted by `aiScore` descending
- `handleSoftRefresh` resets `aiBoardData` to null

**Separate backlog item (not in this task):** Remove Scout, HR Scout, Advisor tabs after AI Board ships.

*Updated 2026-05-06 — Session 79 complete · CODEX TASK 90 specced*

---

## 🗒 Session 80 — CW: Task 90 Approved + Task 91 Specced (Remove Scout/HR Scout/Advisor)

**Task 90 approved:** AI Board tab confirmed clean — `aiBoard.js`, `server.js`, `prop-scout-v7.jsx` all passed syntax checks. `npm run build` passed.

---

### CODEX TASK 91 — Remove Scout, HR Scout, Advisor Tabs (pending Codex)

Full spec in `AGENT_SYSTEM_PROMPT.md` under **CODEX TASK 91**.

**File:** `prop-scout-v7.jsx` only — no backend changes needed.

**Summary — 13 removals in order:**

1. 20 state lines: all `scout*`, `hrScout*`, `advisor*` useState declarations (~lines 3387–3411)
2. `advisorBottomRef` useRef (~line 3498)
3. 4 lines from `handleLogout`: `setScoutPicks(null)`, `setScoutEval(null)`, `setScoutError(null)`, `setScoutGenerationsLeft(3)` (~lines 3846–3849)
4. Scout fetch useEffect (~lines 3870–3891) — fetches `/api/scout/picks` and `/api/scout/evaluation/:date`
5. HR Scout fetch useEffect (~lines 3893–3906) — fetches `/api/hr-scout/picks`
6. Advisor scroll useEffect (~lines 4161–4163) — `advisorBottomRef.current?.scrollIntoView`
7. `handleAdvisorSend` + `handleAdvisorPersonaSwitch` functions (~lines 5050–5097)
8. Scout nav button (~lines 5894–5896) — `🎯 Scout`, `view === "scout"`, sky blue active color
9. HR Scout nav button (~lines 5897–5915) — `⚾ HR Scout`, `view === "hr-scout"`, orange active color
10. Advisor nav button (~lines 5916–5921) — `🧠 Advisor`, `view === "advisor"`, amber active color
11. Advisor view block (~lines 6522–6677) — full chat UI between chat input and Lab view
12. Scout view block (~lines 7743–7935) — full Scout picks + evaluation UI
13. HR Scout view block (~lines 7937–8137) — full HR Scout picks UI, ends just before GAME VIEW comment

**No backend changes** — `/api/scout`, `/api/hr-scout`, `/api/advisor` routes can be cleaned up in a separate task later.

*Updated 2026-05-06 — Session 80 complete · CODEX TASK 91 specced*

---

## 🗒 Session 81 — CW: Task 91 Approved + Task 92 Specced (AI Board Market Filter Tabs)

**Task 91 approved:** Scout, HR Scout, and Advisor tabs fully removed. Zero orphaned references. Brace/paren balance confirmed perfect. File reduced by ~700 lines to 11,781.

---

### CODEX TASK 92 — AI Board Market Filter Tabs (pending Codex)

Full spec in `AGENT_SYSTEM_PROMPT.md` under **CODEX TASK 92**.

**Summary:**
- New `aiBoardTab` state: `"all" | "k" | "outs" | "hr" | "hits"`, default `"all"`
- Tab toggle row: All / K / Outs / HR / Hits — inserted between the AI Board header and loading spinner
- Active color: purple `#a78bfa` (matches AI Board branding)
- Per-tab hit/total badge: computed from `getAiBoardGrade` per market, same badge style as regular Board
- Filtered card list: `aiBoardTab === "all"` → show all 32; otherwise filter by `c.market === aiBoardTab`
- Empty state per market: "No X candidates available."
- Rank numbers (i+1) reset within filtered view
- Soft refresh resets `aiBoardTab` back to `"all"`
- No backend changes, no new API calls

*Updated 2026-05-06 — Session 81 complete · CODEX TASK 92 specced*

---

## 🗒 Session 82 — CW: Picks Rebuild Specced (Tasks 93 + 94)

**Decision:** Scrap existing picks entirely. Fresh migration. Build correctly from day one.

---

### CODEX TASK 93 — Picks Rebuild: Backend (completed)

Full spec in `AGENT_SYSTEM_PROMPT.md` under **CODEX TASK 93**.

**Files:** `backend/migrations/003_picks_rebuild.sql`, `backend/routes/picks.js`, `backend/jobs/gradePicksJob.js`, `backend/jobs/scheduler.js`

**Summary:**
- Migration 003: `DROP TABLE IF EXISTS picks` + recreate with `status TEXT NOT NULL DEFAULT 'pending'` (indexed), `prop_type TEXT`, `snapshot JSONB` (replaces `data JSONB`)
- `picks.js` route: POST stores `status: "pending"` + `prop_type` as dedicated columns; PATCH generalized to partial update `status` and/or `result` (no longer hardcodes result to null); GET returns `status` + `result` from columns merged with `snapshot`
- `gradePicksJob.js`: adds `computeLabGrade` for LAB_F5ML / LAB_FGML / LAB_KPROP / LAB_TOTALS; adds `fetchGameStatus` helper to detect in-progress games; rewrites `gradePendingPicks` to set `status = "live"` for in-progress games and `status = "settled"` + `result` for final games; queries by `status != "settled"` instead of `result IS NULL`
- `scheduler.js`: adds new cron — every 5 min noon–midnight ET for LIVE badge updates; keeps existing 4 AM nightly catch-up

---

### CODEX TASK 94 — Picks Rebuild: Frontend (completed)

Full spec in `AGENT_SYSTEM_PROMPT.md` under **CODEX TASK 94**.

**File:** `prop-scout-v7.jsx` only.

**Summary:**
- localStorage version wipe: `propscout_log_version` check → if not `"2"`, clear log and set version
- `logPick` enriched with fat snapshot: `status: "pending"`, `gameTime` (from liveSlate lookup), `score`, `simConfidence`, `aiScore`, `aiReason`, `suggestedLine`, `bookLines` map (DK/FD/CZR/MGM at log time)
- `markResult` updated to send `{ result, status: "settled" }` in PATCH
- New useEffect: re-fetch picks from `/api/picks` when Picks tab opens if any picks have non-settled/pending/null status
- Pick card badges updated: `✓ HIT` (green) / `✗ MISS` (red) / `● LIVE` (amber) / `PENDING` (dimmed gray) — rendered from `status` + `result` with backward compat for legacy picks

**Completion notes:**
- Added `backend/migrations/003_picks_rebuild.sql` with the clean picks schema (`status`, `result`, `prop_type`, `snapshot`)
- Rebuilt `backend/routes/picks.js` around the new schema while preserving flat-file fallback
- Extended `gradePicksJob.js` with LAB pick grading and live/final status transitions
- Added the 5-minute daytime grading cron in `scheduler.js` while keeping the nightly catch-up
- Frontend now version-resets legacy local picks (`propscout_log_version = "2"`)
- `logPick` now stores a fat snapshot (`status`, `gameTime`, `score`, `simConfidence`, `aiScore`, `aiReason`, `suggestedLine`, `bookLines`)
- `markResult` now patches both `result` and `status`
- Picks tab re-syncs from server on open when any pick is unresolved and renders badges from `status + result` with legacy backward compatibility

*Updated 2026-05-07 — Session 82 complete · CODEX TASK 93 + 94 completed*

---

## 🗒 Session 83 — CW: Task 94 Completed + MC Simulation N bump

**Task 94 approved and complete.** Frontend picks rebuild done:
- `propscout_log_version` wipe on first load
- Fat snapshot in `logPick` (gameTime, score, simConfidence, aiScore, aiReason, suggestedLine, bookLines map)
- `markResult` sends `status: "settled"` in PATCH
- Picks tab re-fetches from server when non-settled picks exist
- Badge rendering: `✓ HIT` / `✗ MISS` / `● LIVE` / `PENDING` from status + result

**Monte Carlo simulation bump:** All 4 sim functions updated from `n = 50` → `n = 200` directly in `prop-scout-v7.jsx`. Reduces worst-case standard error from ±7.1% to ±3.5%, virtually eliminating threshold-crossing noise. Zero performance impact in browser. No spec needed — change applied directly by CW.

*Updated 2026-05-07 — Session 83 complete · Picks rebuild done · MC N=200*

---

## 🗒 Session 84 — CW: CODEX TASK 95 Specced + Backlog updates

**Monte Carlo N=500:** All 4 sim functions bumped from `n = 200` → `n = 500` directly by CW. Reduces worst-case standard error to ±2.2%.

**Task #49 added to backlog:** Add K and Outs cards to AI Board (filter tabs already wired, just need card generation logic).

**CODEX TASK 95 completed:** Strengthen Monte Carlo — Bayesian Prior Blending + Correlated Inputs. Single file change (`prop-scout-v7.jsx`), 4 sim functions + helper block.

Changes per function:
- `simKConfidence` — normal-normal Bayesian blend of `avgK3` with `k9`-derived season prior; park ↔ umpire correlated sampling per iteration (ρ=0.3)
- `simOutsConfidence` — Bayesian shrinkage of `meanOuts` toward league-avg 16.5 outs; no correlated inputs
- `simHRConfidence` — Beta shrinkage of `basePHR` toward league avg 3.5% (pseudoObs=8); park ↔ wind correlated per iteration (ρ=0.45)
- `simHitsConfidence` — 35% shrinkage of `vsHandAVG` toward season `avg`; stochastic park per iteration (σ=0.06)

New helpers: `sampleStdNormal()`, `sampleCorrelated(rho)`. `sampleNormal` signature preserved.

**Completion notes:**
- Added `sampleStdNormal()` and `sampleCorrelated(rho)` helpers while preserving `sampleNormal(mean, std)` signature
- `simKConfidence` now uses a normal-normal Bayesian blend of recent K form with a `k9 × estimated IP` season prior, plus correlated park/umpire sampling (`ρ = 0.3`)
- `simOutsConfidence` now shrinks observed outs toward a 16.5-out league-average starter prior
- `simHRConfidence` now Beta-shrinks HR rate toward a 3.5% league baseline and samples correlated park/wind effects (`ρ = 0.45`)
- `simHitsConfidence` now shrinks platoon AVG 35% toward season AVG and samples stochastic park factor per iteration
- Threaded `avgIP` into the K sim call so the season-prior estimate uses the pitcher’s existing workload context

*Updated 2026-05-07 — Session 84 complete · CODEX TASK 95 completed*

---

## 🗒 Session 85 — Codex: Nav Declutter (AI Board focus)

**Files changed this session:** `prop-scout-v7.jsx`

**Changes:**
- Removed the `🔬 Lab` nav button
- Removed the `📊 Models` nav button
- Removed the inline `↺ Refresh` button from the `AI Board` header

**Notes:**
- Underlying `lab` / `models` view code was left intact for now; this was a surface-level declutter pass only
- Global soft refresh button in the top nav remains available

*Updated 2026-05-07 — Session 85 complete · Nav declutter applied*

---

## 🗒 Session 86 — Codex: AI Board Hits Badge Fix

**Files changed this session:** `prop-scout-v7.jsx`

**Changes:**
- Fixed `AI Board` Hits grading so the per-tab `#/# hit` badge resolves from final batter `h` totals directly
- This was a result-shape issue in `getAiBoardGrade(...)`, not a missing-data issue

*Updated 2026-05-07 — Session 86 complete · AI Hits badge fixed*

---

## 🗒 Session 87 — Codex: AI Board Render Loop Fix

**Files changed this session:** `prop-scout-v7.jsx`

**Changes:**
- Fixed `AI Board` maximum update depth loop when no candidates were available
- Root cause: the AI Board fetch effect depended on `aiBoardData` while also writing a fresh empty `[]` back into that same state
- Fix:
  - removed `aiBoardData` from the effect dependency list
  - made the empty-payload branch preserve the existing empty array reference instead of creating a new one every pass

*Updated 2026-05-07 — Session 87 complete · AI Board loop fixed*

---

## 🗒 Session 88 — Codex: AI Board Empty-State Clarification

**Files changed this session:** `prop-scout-v7.jsx`

**Changes:**
- Improved the `AI Board` market-filter empty state message
- When a specific tab like `Hits` has no candidates but other AI Board markets do, the message now explicitly suggests trying the available markets or `All`
- No scoring or fetch logic changed; this was a UI clarity pass only

*Updated 2026-05-07 — Session 88 complete · AI Board empty-state clarified*

---

## 🗒 Session 89 — Codex: AI Board Partial-Market Retry Fix

**Files changed this session:** `prop-scout-v7.jsx`

**Changes:**
- Fixed an AI Board refresh bug where early `HR/Hits` results could lock the view before `K/Outs` candidates were ready
- Root cause: the AI Board fetch effect treated any non-empty AI result set as fully loaded, even if the underlying candidate mix later changed
- Added an `aiBoardPayloadSig` ref and now re-run scoring whenever the AI Board candidate signature changes
- Soft refresh now also clears that signature so the next pass starts cleanly

*Updated 2026-05-08 — Session 89 complete · AI Board partial-market retry fixed*

---

## 🗒 Session 90 — Codex: AI Board Prefetch Parity Fix

**Files changed this session:** `prop-scout-v7.jsx`

**Changes:**
- Fixed a second AI Board data-availability gap: the prefetch effect for pitcher/batter/props data was only running for `board` and `model`
- AI Board now participates in that same prefetch effect, so opening `ai-board` directly will kick off the same upstream fetches as the normal Board
- This is especially important for `K/Outs`, which depend on pitcher stats, game logs, and props being hydrated before AI Board can score them

*Updated 2026-05-08 — Session 90 complete · AI Board prefetch parity fixed*

---

## 🗒 Session 91 — Codex: AI Board Result-Key Fix

**Files changed this session:** `prop-scout-v7.jsx`

**Changes:**
- Fixed an AI Board grading mismatch where card grading was looking up `liveBoardResults` by the synthetic AI card id instead of the original player/pitcher entity id
- Added `entityId` to the AI Board payload and preserved it when AI-scored cards are materialized
- `getAiBoardGrade(...)` now resolves against `liveBoardResults[c.entityId]`, which restores correct settlement for market-level `#/#` badges and per-card hit/miss accents
- This specifically unblocks the missing `Hits` tab badge and allows settled hit cards to render their green accent reliably

*Updated 2026-05-08 — Session 91 complete · AI Board result-key fix applied*

---

## 🗒 Session 92 — Backlog Brainstorm: Separate Predictive Product Lane

**Status:** Brainstorm only — no implementation started

**Direction captured:**
- Keep Prop Scout’s main identity as a research-first app
- Explore a separate predictive-model lane as its own tab / product surface rather than merging it into the core research flows
- Current `AI Board` should still be thought of as AI-assisted ranking, not a true predictive model
- Any future predictive tab should stay clearly labeled and separated from:
  - algorithmic / research recommendations
  - AI-assisted ranking views
- Treat this as a future product / architecture brainstorm before any implementation work

*Updated 2026-05-08 — Session 92 added · predictive product lane brainstorm logged*

---

## 🗒 Session 93 — Codex: Remove Remaining Top-Nav Refresh Control

**Files changed this session:** `prop-scout-v7.jsx`

**Changes:**
- Removed the remaining global top-nav soft refresh button (`↻`)
- Removed the adjacent "just now" label from the header
- Underlying `handleSoftRefresh` logic remains in code for now; this was a UI declutter pass only

*Updated 2026-05-08 — Session 93 complete · top-nav refresh control removed*

---

## 🗒 Session 94 — Backlog Brainstorm: AI Board F5 Moneyline

**Status:** Brainstorm only — no implementation started

**Direction captured:**
- Explore expanding `AI Board` into `F5 Moneyline` first
- `F5 Run Line` can be evaluated later as a follow-up if ML feels useful
- Recommendation is to start with `F5 ML` because it is cleaner than `F5 RL`:
  - stronger SP-driven signal
  - less bullpen noise
  - easier validation
- This should pair naturally with the Monte Carlo direction:
  - structured F5 candidates generated first
  - algorithm / sim context passed into AI
  - AI used as a re-ranker + explanation layer
- Keep this explicitly separate from any future true predictive-model lane

*Updated 2026-05-08 — Session 94 added · AI Board F5 ML brainstorm logged*

---

## 🗒 Session 98 — Backlog Brainstorm: Sim Models Beyond Monte Carlo

**Status:** Brainstorm only — no implementation started

**Direction captured:**
- Future predictive / AI Board sim work should not assume Monte Carlo is the only option
- Monte Carlo is the outer simulation wrapper; the underlying market model can vary by stat type
- Suggested mapping captured for later review:
  - `F5 ML / F5 RL / Totals` → Poisson first, then Negative Binomial or inning-state/Markov sim
  - `Ks` → Poisson count model + Bayesian shrinkage
  - `Outs` → Normal / bootstrap / shrinkage-based outing model
  - `Hits` → Binomial by PA
  - `HR` → Bernoulli / rare-event Poisson
  - `NRFI / YRFI` → Bernoulli or first-inning Poisson
- If the predictive lane expands later, revisit the best fit per market instead of defaulting everything to Monte Carlo only

*Updated 2026-05-09 — Session 98 added · broader sim-model brainstorm logged*

---

## 🗒 Session 85 — CW: Board Option C specced + backlog items

**CODEX TASK 95 approved.** All 4 sim functions verified: Bayesian prior blending (normal-normal conjugate for K/Outs, Beta shrinkage for HR, platoon shrinkage for Hits) + correlated inputs (Cholesky sampleCorrelated helper, park↔ump for K ρ=0.3, park↔wind for HR ρ=0.45, stochastic park for Hits).

**Backlog items added:**
- Task #49: Add K and Outs cards to AI Board
- Task #50: DB-backed player gamelog snapshots (interim fix: GAMELOG_TTL_MS bumped 30min → 6h in `backend/routes/players.js`)
- Task #51: Lock odds to pre-game snapshot once game goes live
- Task #52: Fix AI Board survivorship bias in hit tracking
- Task #53: Board Option C — rolling lock + per-game cap

**CODEX TASK 96 specced:** Board Option C — rolling lock + per-game cap for HR/Hits/K/Outs tabs.

Key changes:
- `lockedBoardCandidates` state (localStorage-persisted, keyed by Honolulu date)
- `getBoardGamePhase(gamePk)` helper → "upcoming" | "live" | "final"
- `computeBatterBoard` modified: per-game soft cap of 5 (was global top-20)
- New useEffect: locks candidates at first pitch, fires on `liveSlate` change
- `hitSummary` / `tabHitSummary` rewritten to count from locked candidates only
- Board render split: live section (upcoming, grouped by game + time) + locked section (in-play/final with LIVE/FINAL status badge)

*Updated 2026-05-08 — Session 85 complete · CODEX TASK 96 specced*

---

## 🗒 Session 95 — CW: Codex sessions 86–94 reviewed + Tasks 54/55 added + CODEX TASK 97 specced

**Sessions 86–91 and 93 reviewed — all completed fixes, no action needed:**
- Session 86: AI Board Hits badge fix (result-shape issue in getAiBoardGrade)
- Session 87: AI Board max-update-depth loop fix (aiBoardData dep removed)
- Session 88: AI Board empty-state clarification (UI only)
- Session 89: AI Board partial-market retry fix (aiBoardPayloadSig ref)
- Session 90: AI Board prefetch parity fix (ai-board view now triggers upstream fetches)
- Session 91: AI Board result-key fix (entityId → liveBoardResults lookup)
- Session 93: Top-nav soft refresh button removed (UI declutter)

**Sessions 92 and 94 were brainstorms — added to backlog:**
- Task #54: AI Board F5 Moneyline market
- Task #55: Separate Predictive Product Lane (architecture direction — AI Board stays AI-assisted ranking, not predictive)

**CODEX TASK 97 specced:** AI Board F5 Moneyline market (`prop-scout-v7.jsx` only).

Key changes:
- `buildAiBoardPayload` gets 2 new params (`liveNrfiData`, `liveOddsMap`) + F5 ML candidates via `computeGameBoard("f5ml", ...)` top 5
- New `mapGameCandidate` helper (no playerName/simConfidence, lean + leanAbbr + factors in stats)
- `MARKET_META` gets `f5ml: { label: "F5 ML", color: "#fbbf24" }`
- "F5 ML" tab added to AI Board filter row
- `getAiBoardGrade` gets f5ml branch: checks `liveBoxscores` innings 1–5, compares lean to f5 winner
- Card render detects `c.market === "f5ml"` and shows game matchup + lean instead of player name + team
- SIM badge hidden automatically (simConfidence null for game markets)

*Updated 2026-05-08 — Session 95 complete · CODEX TASK 97 specced*

---

## 🗒 Session 96 — CW: CODEX TASK 97 sim amendment + AI Board sim architectural rule

**Architectural rule established:** Every AI Board market must supply a `simConfidence` value. The fallback scorer (`algo * 0.6 + sim * 0.4`) degrades to algo-only without it. All current markets (K, Outs, HR, Hits) already have Monte Carlo sims. F5 ML was missing one — fixed in this amendment. Any future market added to the AI Board must include an appropriate sim.

**CODEX TASK 97 amendment appended to AGENT_SYSTEM_PROMPT.md:**
- New `simF5MLConfidence(homeEra, awayEra, parkFactor, umpireRating, lean, n=500)` function — samples F5 run scoring for each team per iteration using ERA-derived means, correlated park/ump adjustments (ρ=0.35), std=1.5. Near-ties skipped. Returns % of resolved sims where lean wins.
- `computeGameBoard` f5ml branch now adds `homeEra`, `awayEra`, `parkFactor`, `umpireRating` to the pushed candidate object
- `mapGameCandidate` now calls `simF5MLConfidence(...)` instead of `simConfidence: null`
- SIM badge will now render on F5 ML cards exactly like K/Outs/HR/Hits

*Updated 2026-05-08 — Session 96 complete · CODEX TASK 97 sim amendment*

---

## 🗒 Session 97 — CW: CODEX TASK 97 prompt written

**Deliverable:** `codex-task-97-prompt.md` — copy-paste prompt for Codex to implement AI Board F5 ML market.

**Prompt covers 9 ordered changes to `prop-scout-v7.jsx`:**
1. `simF5MLConfidence` function — ERA-scaled F5 run scoring Monte Carlo, correlated park/ump (ρ=0.35), std=1.5, N=500
2. `computeGameBoard` f5ml push — add `homeEra`, `awayEra`, `parkFactor`, `umpireRating` to pushed candidate
3. `buildAiBoardPayload` — new params `liveNrfiData`/`liveOddsMap`, F5 ML candidates slice(0,5), `mapGameCandidate` helper with `simConfidence: simF5MLConfidence(...)`
4. Call site — pass two new args
5. `MARKET_META` — add `f5ml: { label: "F5 ML", color: "#fbbf24" }`
6. `aiBoardTabHitSummary` — add `"f5ml"` to market array
7. `getAiBoardGrade` — f5ml branch: check liveBoxscores innings 1–5, compare lean vs f5 winner
8. Market filter tab row — add "F5 ML" tab
9. Card render — game-level layout for f5ml (gameLabel + lean + odds), SP matchup sub-line, SIM badge renders automatically

**Amendment fully incorporated:** `simConfidence: null` overridden with `simF5MLConfidence(...)` call. SIM badge will appear on F5 ML cards.

*Updated 2026-05-09 — Session 97 complete · CODEX TASK 97 prompt written*

---

## 🗒 Session 99 — Codex: AI Board F5 Moneyline + simF5MLConfidence

**Files changed this session:** `prop-scout-v7.jsx`

**Changes:**
- Added `simF5MLConfidence(...)` after the existing sim helper block
- Updated `computeGameBoard("f5ml")` to include:
  - `homeEra`
  - `awayEra`
  - `parkFactor`
  - `umpireRating`
- Expanded `buildAiBoardPayload(...)` with:
  - new `liveNrfiData` / `liveOddsMap` params
  - top-5 `f5ml` candidates
  - `mapGameCandidate(...)` using `simF5MLConfidence(...)`
- Updated the AI Board fetch call site to pass the two new arguments
- Added `f5ml` to:
  - `MARKET_META`
  - AI Board filter tabs
  - AI Board hit-summary market array
  - `getAiBoardGrade(...)` using first-5 innings from final boxscores
- Added game-level AI Board card rendering for F5 ML:
  - matchup title
  - lean + odds chip
  - SP matchup sub-line
  - SIM badge now renders because `simConfidence` is non-null

*Updated 2026-05-09 — Session 99 complete · AI Board F5 ML implemented*

---

## 🗒 Session 98 — CW: CODEX TASK 97 review + approved

**All 9 spec changes verified in `prop-scout-v7.jsx`:**

1. ✅ `simF5MLConfidence` at line 2028 — exact spec match (ERA-scaled means, correlated park/ump ρ=0.35, std=1.5, N=500, near-tie skip at <0.4 diff)
2. ✅ `computeGameBoard` f5ml push (line 2858) — `homeEra`, `awayEra`, `parkFactor`, `umpireRating` added
3. ✅ `buildAiBoardPayload` signature (line 2415) — `liveNrfiData`, `liveOddsMap` added; f5mlCandidates via `computeGameBoard("f5ml", ...).slice(0,5)`; `mapGameCandidate` helper with `simConfidence: simF5MLConfidence(...)` at line 2466
4. ✅ Call site (line 4037) — passes `liveNrfiData, liveOddsMap`
5. ✅ `MARKET_META` (line 11192) — `f5ml: { label: "F5 ML", color: "#fbbf24" }`
6. ✅ `aiBoardTabHitSummary` (line 11240) — includes `"f5ml"`
7. ✅ `getAiBoardGrade` f5ml branch (lines 11217–11227) — checks `liveBoxscores` innings 1–5, compares lean vs f5 winner, null on tie/incomplete
8. ✅ Filter tab row (line 11276) — "F5 ML" tab added
9. ✅ Card render (lines 11375–11413) — game matchup layout for f5ml; SP sub-line; SIM badge auto-renders (simConfidence non-null)

**Task #54 closed.** CODEX TASK 97 approved.

*Updated 2026-05-09 — Session 98 complete · CODEX TASK 97 approved*

---

## 🗒 Session 99 — CW: CODEX TASK 96 prompt written

**Deliverable:** `codex-task-96-prompt.md` — copy-paste prompt for Codex to implement Board Option C (rolling lock + per-game cap).

**Prompt covers 7 ordered changes to `prop-scout-v7.jsx`:**
1. `lockedBoardCandidates` state — localStorage-backed, keyed by Honolulu date, restores on load
2. `getBoardGamePhase(gamePk)` helper — returns "upcoming" | "live" | "final" from liveSlate game status
3. `computeBatterBoard` return — per-game cap of 5 (was global top-20 slice); no change to `computePitcherBoard`
4. Lock useEffect — fires on `liveSlate` change; idempotent; locks each gamePk once at first pitch/warmup
5. `hitSummary` / `tabHitSummary` rewrite — counts from `lockedCandidatesForType()` instead of live board; misses can never fall off
6. Board render split — live section (upcoming, grouped by game + ET time) + locked section (in-play/final with LIVE/FINAL badge); card internals unchanged
7. Status bar counts — `loadedBatters` from `liveBoardCandidates.length`, `lockedCount` from locked groups

*Updated 2026-05-09 — Session 99 complete · CODEX TASK 96 prompt written*

---

## 🗒 Session 100 — CW: CODEX TASK 96 review + approved

**All 7 spec changes verified in `prop-scout-v7.jsx`:**

1. ✅ `lockedBoardCandidates` state (line 3607) — localStorage restore, Honolulu date key, exact spec match
2. ✅ `getBoardGamePhase(gamePk)` helper (line 3999) — "upcoming" | "live" | "final" from liveSlate status
3. ✅ `computeBatterBoard` per-game cap (lines 2410–2418) — byGame grouping, slice(0,5) per game, re-sort
4. ✅ Lock useEffect (lines 5097–5123) — fires on liveSlate/view, idempotent, localStorage save
5. ✅ `lockedCandidatesForType` + `hitSummary` + `tabHitSummary` (lines 10547–10568) — counts from locked candidates only
6. ✅ Board render split (lines 11272–11330) — live section + locked section with LIVE/FINAL badges
7. ✅ Status bar counts (lines 10516–10517, 10744–10745) — `loadedBatters` + `lockedCount` displayed

**Bonus:** Cursor refactored the card render into a `renderBoardCandidateCard(item, index)` helper (line 10926), called from both live and locked sections — cleaner than duplicating JSX, no spec deviation.

**Task #53 closed.** CODEX TASK 96 approved.

*Updated 2026-05-09 — Session 100 complete · CODEX TASK 96 approved*

---

## 🗒 Session 101 — CW: CODEX TASK 98 specced + prompt written

**Task:** Fix AI Board survivorship bias in hit tracking (Task #52).

**Root cause:** `aiBoardSettled` and `aiBoardTabHitSummary` read from `aiBoardData` (the live candidate list). When the payload changes — lineup updates, stats refreshing, or a soft-refresh — `aiBoardData` is replaced. Candidates who missed and got dropped from the new payload are silently removed from the hit counter. Same root cause as the Board survivorship bias (Task 96), but for the AI Board view.

**Fix:** Lock the scored candidates on first population each day into `lockedAiBoardSnapshot` (localStorage-backed, Honolulu date keyed). Count results against the snapshot. Display cards keep using live `aiBoardData`.

**CODEX TASK 98 spec appended to AGENT_SYSTEM_PROMPT.md.**
**Prompt written at `codex-task-98-prompt.md`.**

5 changes to `prop-scout-v7.jsx`:
1. `lockedAiBoardSnapshot` state — localStorage restore, null init (not empty array)
2. Snapshot lock in `.then()` branch — fires once on first score of the day
3. Snapshot lock in `.catch()` branch — same logic for fallback scoring
4. `aiBoardSettled` reads from `lockedAiBoardSnapshot ?? aiBoardData ?? []`
5. `aiBoardTabHitSummary` reads from `lockedAiBoardSnapshot ?? aiBoardData ?? []`

Soft-refresh does NOT reset the snapshot — counter stays stable while board refetches.

*Updated 2026-05-09 — Session 101 complete · CODEX TASK 98 specced*

---

## 🗒 Session 102 — CW: CODEX TASK 98 review + approved

**All 5 changes verified in `prop-scout-v7.jsx`:**

1. ✅ `lockedAiBoardSnapshot` state (line 3536) — localStorage restore, Honolulu date key, null init
2. ✅ Snapshot lock in `.then()` branch (lines 4094–4099) — `prev !== null` guard, fires once
3. ✅ Snapshot lock in `.catch()` branch (lines 4113–4118) — identical lock logic for fallback path
4. ✅ `aiBoardSettled` (line 11404) — reads `lockedAiBoardSnapshot ?? aiBoardData ?? []`
5. ✅ `aiBoardTabHitSummary` (line 11415) — reads `lockedAiBoardSnapshot ?? aiBoardData ?? []`

**Soft-refresh check:** `setAiBoardData(null)` at line 3968 does NOT touch `lockedAiBoardSnapshot` — snapshot persists across refreshes as intended.

**Task #52 closed.** CODEX TASK 98 approved.

*Updated 2026-05-09 — Session 102 complete · CODEX TASK 98 approved*

---

## 🗒 Session 103 — CW: CODEX TASK 99 specced + prompt written

**Task:** Lock odds to pre-game snapshot once game goes live (Task #51).

**Root cause:** `liveOddsMap` auto-refreshes every 20 minutes. Once a game starts, sportsbooks push live in-game lines — ML, totals, and spreads shift in ways irrelevant to pre-game research. Since no live betting is supported, the user wants to see first-pitch odds frozen for all in-progress/final games.

**Fix:**
- `lockedOddsMap` state `{ [gamePk]: oddsObject }` — localStorage-backed, Honolulu date keyed
- Lock useEffect — fires on `liveSlate`/`liveOddsMap` change; idempotent; snapshots odds for each game at first transition to In Progress/Warmup/Final
- `effectiveOddsMap` useMemo — base is `liveOddsMap`, locked entries override for non-upcoming games
- 8 call-site replacements: SlateCard prop, `getGameOdds` body, `computeGameBoard` ×4, `buildAiBoardPayload`, board dep array

**Soft-refresh:** `liveOddsMap` resets to `{}` but `lockedOddsMap` is untouched — locked game odds persist.

**CODEX TASK 99 spec appended to AGENT_SYSTEM_PROMPT.md.**
**Prompt written at `codex-task-99-prompt.md`.**

*Updated 2026-05-09 — Session 103 complete · CODEX TASK 99 specced*

---

## 🗒 Session 104 — CW: CODEX TASK 99 review + approved

**All changes verified in `prop-scout-v7.jsx`:**

1. ✅ `lockedOddsMap` state (line 3569) — localStorage restore, Honolulu date key, `{}` init
2. ✅ `effectiveOddsMap` useMemo (line 3646) — base `liveOddsMap`, locked entries override for non-upcoming games; correct deps `[liveOddsMap, lockedOddsMap, liveSlate]`
3. ✅ Lock useEffect (lines 4407–4431) — fires on `[liveSlate, liveOddsMap]`; idempotent guard; skips if no odds loaded yet; localStorage save
4. ✅ `buildAiBoardPayload` call site (line 4086) — `effectiveOddsMap` passed
5. ✅ `getGameOdds` body (line 4841) — `effectiveOddsMap[key]`
6. ✅ Board `computeGameBoard` call (line 5142) — `effectiveOddsMap`
7. ✅ Board dep array (line 5155) — `effectiveOddsMap`
8. ✅ Board render IIFE `computeGameBoard` (line 10570) — `effectiveOddsMap`
9. ✅ All 6 `gameHitSummary` calls (lines 10720–10725) — `effectiveOddsMap`
10. ✅ `SlateCard` prop (line 6405) — `liveOddsMap={effectiveOddsMap}`

**Soft-refresh check:** `setLiveOddsMap({})` at line 3978 confirmed — `lockedOddsMap` untouched.

**Task #51 closed.** CODEX TASK 99 approved.

*Updated 2026-05-09 — Session 104 complete · CODEX TASK 99 approved*

---

## 🗒 Session 105 — Spec: CODEX TASK 100 (DB-backed Gamelog Snapshots)

### Root cause

Every player card open triggers a live MLB Stats API call for `/people/:id/stats?stats=gameLog`. With 20–30 players per slate, this is dozens of live outbound calls per session. The interim 6h in-memory TTL helps within one process lifetime but is wiped on every Railway dyno restart. On busy days, this causes rate-limit pressure and cold-response latency.

### Fix

**Three-layer cache for `/api/players/:playerId/gamelog`:**
- L1: In-memory (`cache.get/set`) — fastest, 6h TTL, process-scoped
- L2: `player_gamelog_snapshots` DB — survives restarts; keyed `(player_id, stat_group, slate_date)` with Honolulu date; auto-expires at day boundary
- L3: MLB API — only reached on true cold miss; write-through to L2 on fetch

**Pitcher pre-fetch cron:** `snapshotPitcherGamelogs()` runs at 10 AM and 2 PM Honolulu — reads today's probable pitchers from `schedule_snapshots`, fetches each gamelog, upserts to DB. Skips already-snapshotted pitchers (idempotent). 600ms spacing between API calls.

### Files changed (4)

| File | Change |
|---|---|
| `backend/migrations/004_gamelog_snapshots.sql` | **New file** — `player_gamelog_snapshots` DDL |
| `backend/routes/players.js` | Gamelog route: DB read-through + write-through; added `db` import + `todayHonolulu` helper |
| `backend/jobs/snapshotJobs.js` | Added `snapshotPitcherGamelogs()` function; table CREATE in `ensurePhaseOneTables()` |
| `backend/jobs/scheduler.js` | Import + cron at `0 10,14 * * *` Honolulu |

### Response contract

The shape of `/api/players/:playerId/gamelog` is **unchanged** — this is a pure infrastructure change. The `X-Cache` header now reports `HIT` (L1), `DB_HIT` (L2), or `MISS` (L3).

### Backlog

- Task #50 (DB-backed gamelog snapshots) → closed as CODEX TASK 100

**CODEX TASK 100 spec appended to `AGENT_SYSTEM_PROMPT.md`.**
**Prompt written at `codex-task-100-prompt.md`.**
**Migration file created at `backend/migrations/004_gamelog_snapshots.sql`.**

*Updated 2026-05-09 — Session 105 complete · CODEX TASK 100 specced*

---

## 🗒 Session 106 — Architecture Spec: Separate Predictive Product Lane (Task #55)

**Status:** Architecture direction complete — no implementation started yet.

### The core problem

The AI Board surfaces great candidates, but the user has to mentally compare `simConfidence` (68%) against the book's implied probability (55%) themselves to know if there's an edge. The Predictive Product Lane solves this by showing only plays where the model's probability beats the book, with the edge explicitly displayed.

### Three product tiers (clarified)

| Tier | Tab | Signal |
|---|---|---|
| Algorithmic | Board (HR/Hits/K/Outs/Games) | Rule-based scoring, no probabilities |
| AI-ranked | AI Board | Algo + sim → AI re-ranker → ranked list |
| **Predictive** | **Predict (new)** | Edge = simConfidence - book implied prob; filter to positive-edge only |

### What's already built

Everything needed is in place: `simConfidence` on every AI Board card, `livePlayerProps` with American odds, `effectiveOddsMap` for game markets, `lab_outcomes` DB table already tracking `lean_prob`/`lean_edge`/`has_edge`, `lockedAiBoardSnapshot` for bias-free history, `getAiBoardGrade` for resolution. The only missing piece is connecting `simConfidence` and `impliedProb` on the same card object.

### Three implementation phases (all frontend-only, no new backend)

**Phase 1** — Add `impliedProb`, `bookOdds`, `edge` to AI Board candidate objects in `buildAiBoardPayload`. For prop markets: look up American odds from `livePlayerProps`. For F5 ML: compute from `effectiveOddsMap`. Edge = `(simConfidence / 100) - vigStrippedImpliedProb`.

**Phase 2** — New "Predict" tab (`view === "predict"`). Filter AI Board candidates to `edge >= 0.08`. Sort by edge descending. Card shows: player/game, market, SIM %, BOOK %, EDGE pts, book line, AI reason. Hit/miss badges on settled games. Locked section below upcoming games.

**Phase 3** — Calibration panel inside Predict tab. Group resolved plays from `lockedAiBoardSnapshot` by `simConfidence` bucket (55–64%, 65–74%, 75–84%, 85%+). Show predicted % vs. actual hit rate over N plays. No new backend required.

### Spec location

Full architecture spec appended to `AGENT_SYSTEM_PROMPT.md` under **TASK 55**.

*Updated 2026-05-09 — Session 106 complete · Task #55 architecture spec written*

---

## 🗒 Session 107 — Spec: CODEX TASK 101 (Predictive Lane Phase 1 — Edge Data)

**Predictive Lane Phase 1** — pure data plumbing in `buildAiBoardPayload`. No new UI.

### What's added to every AI Board candidate

| Field | Description |
|---|---|
| `lean` | "OVER"/"UNDER" for props; "HOME"/"AWAY" for F5 ML |
| `bookOdds` | American odds integer at best book (DK > FD > CZR > MGM) for the lean side |
| `impliedProb` | Vig-stripped book probability (0–1) |
| `edge` | `simConfidence/100 − impliedProb` — positive = model has an advantage |
| `gamePk` | Newly added to prop candidates (was already on game candidates) |
| `gameTime` | Newly added to prop candidates (was already on game candidates) |

### New helpers added

- `vigStrip(leanRaw, oppRaw)` — normalizes raw probabilities to remove vig: `leanRaw / (leanRaw + oppRaw)`
- `propEdgeData(propLine, lean)` — looks up best book's `overOdds`/`underOdds` from `propLine.books`, returns `{ bookOdds, impliedProb }`

### For F5 ML candidates

Edge computed from `liveOddsMap[away.name|home.name].homeML` or `.awayML`. `simF5MLConfidence` extracted into a variable (was inline) so it's computed once for both `simConfidence` and `edge`.

**CODEX TASK 101 spec appended to `AGENT_SYSTEM_PROMPT.md`.**
**Prompt written at `codex-task-101-prompt.md`.**

*Updated 2026-05-09 — Session 107 complete · CODEX TASK 101 specced (Predictive Lane Phase 1)*

---

## 🗒 Session 108 — CW: CODEX TASK 101 review + approved (with correction)

**Initial submission had a spec error:** `mapCandidate` used `c._candidate?.propLine`, `c._candidate?.gamePk`, `c._candidate?.gameTime` — but `c` is the raw candidate from `computePitcherBoard`/`computeBatterBoard`, which has these fields directly. The `_candidate` property is set on the *output* of `mapCandidate`, not the input. The `?.` operator silenced the error but `propEdgeData` was always receiving `null`, so `edge` was always `null` for prop candidates.

**Fix applied (3 lines in `mapCandidate`):**
- `c._candidate?.propLine ?? null` → `c.propLine ?? null`
- `c._candidate?.gamePk ?? null` → `c.gamePk ?? null`
- `c._candidate?.gameTime ?? null` → `c.gameTime ?? null`

**All changes verified:**

1. ✅ `vigStrip` const (line 2537) — `leanRaw / (leanRaw + oppRaw)`
2. ✅ `propEdgeData(propLine, lean)` function (line 2542) — DK > FD > CZR > MGM priority; vig-strips when both sides available
3. ✅ `mapCandidate` — `lean` derived from score, `propEdgeData(c.propLine, lean)` called correctly, `edge` computed, `gamePk`/`gameTime` added
4. ✅ `mapGameCandidate` — `simConf` extracted from inline call; F5 edge from `liveOddsMap[away.name|home.name]`; all four fields added

**CODEX TASK 101 approved.** Phase 1 complete — edge data now lives on every AI Board candidate. Ready for Phase 2 (Predict tab).

*Updated 2026-05-09 — Session 108 complete · CODEX TASK 101 approved*

---

## 🗒 Session 109 — CW: CODEX TASK 102 specced (Predictive Lane Phase 2 — Predict tab)

**CODEX TASK 101 fully approved** at the start of this session.

### CODEX TASK 102 — Predict Tab

Phase 2 of the Predictive Lane. 4 changes to `prop-scout-v7.jsx`, no backend changes.

**Changes:**
1. Add `"predict"` to board data pre-fetch useEffect condition (so schedule/lineups load when Predict is active)
2. Add `"predict"` to AI Board data useEffect condition (so `aiBoardData` populates when Predict is opened directly)
3. Add `"⚡ Predict"` nav button — yellow active state, `isScoutUser` gated, monospace uppercase
4. Add full `{view === "predict" && isScoutUser && (() => { ... })()}` view block:
   - `MIN_EDGE = 0.08` threshold
   - `MARKET_META` label/color lookup per market
   - `gradeCandidate(c)` — intentional duplicate of `getAiBoardGrade` in AI Board IIFE (avoids shared-scope refactor)
   - `predictSettled` — hit counter from `lockedAiBoardSnapshot` (survivorship-bias-free)
   - `allEdgePlays` — filter `aiBoardData` to `edge >= 0.08`, sort by edge descending
   - `upcomingPlays` / `lockedPlays` split via `getBoardGamePhase`
   - `renderEdgeCard` — card layout: name/market row, lean + book line, SIM/BOOK/EDGE tile row, AI reason
   - Edge tile color: `≥15pts → #22c55e (green)`, `<15pts → #fbbf24 (yellow)`
   - HIT/MISS badges when `gradeCandidate` resolves; colored left border on graded cards
   - Three empty states: loading, no data, no edge plays

**CODEX TASK 102 spec appended to `AGENT_SYSTEM_PROMPT.md`.**
**Prompt written at `codex-task-102-prompt.md`.**

*Updated 2026-05-09 — Session 109 complete · CODEX TASK 102 specced (Predictive Lane Phase 2)*

---

## 🗒 Session 110 — CW: CODEX TASK 102 review + approved; CODEX TASK 103 specced (Calibration Panel)

**CODEX TASK 102 approved** — all 4 changes verified clean:
1. ✅ `"predict"` added to board data pre-fetch useEffect
2. ✅ `"predict"` added to AI Board data useEffect
3. ✅ `"⚡ Predict"` nav button — `isScoutUser` gated, yellow active state
4. ✅ Predict IIFE — MIN_EDGE=0.08, gradeCandidate, predictSettled, edge card layout, upcoming/locked split, three empty states

Minor deviation: Cursor dropped unused `i` index param from `renderEdgeCard` calls — cleaner, no issue.

**Phase 2 complete.** Predictive Lane now has a fully functional Predict tab.

---

### CODEX TASK 103 — Calibration Panel

2 changes to `prop-scout-v7.jsx`, inside the existing Predict IIFE. No new state, no backend changes.

**Change 1 — `calibrationBuckets` data computation** (after `lockedPlays`, before `renderEdgeCard`):
- `BUCKETS`: four ranges — 55–64%, 65–74%, 75–84%, 85%+ with midpoints 59.5 / 69.5 / 79.5 / 90
- Each bucket: filter `lockedAiBoardSnapshot` by `simConfidence` range, run `gradeCandidate` on each, count hits/total, compute `actualRate`

**Change 2 — Calibration JSX section** (inside `return (...)`, after locked plays, before closing `</div>`):
- Hidden when no graded plays (`calibrationBuckets.some(b => b.total > 0)`)
- Per-bucket row: label | hits/total | actual% (colored) | vs X% exp
- Progress bar: fills to actual%, grey tick at expected%
- Bar color: green (≥ expected−5), yellow (6–15pts below), red (>15pts below)
- Footer: total graded play count

**CODEX TASK 103 spec appended to `AGENT_SYSTEM_PROMPT.md`.**
**Prompt written at `codex-task-103-prompt.md`.**

*Updated 2026-05-09 — Session 110 complete · CODEX TASK 103 specced (Calibration Panel)*

---

## 🗒 Session 111 — Bug: Board not loading + CODEX TASK 104 specced (Batter Gamelog Pre-fetch)

### Bug diagnosed

**Symptom:** Board tabs showed "Loading player stats — check back shortly" with "0/270 live" for 15–30 seconds on first open each day.

**Root cause:** Board pre-fetch fires one `/api/players/:id/gamelog?group=hitting` call per lineup batter (~270 on a full slate). On a cold cache (no in-memory, no DB), each call hits the MLB Stats API for 2–3 outbound requests. Under that load the board is blank until the fetches resolve.

**Not a code bug** — board eventually loaded after ~30s. The `.catch(() => {})` on each fetch silently drops any that fail, so a truly broken backend would look identical.

---

### CODEX TASK 104 — Batter Gamelog Pre-fetch Cron

2 backend files, no frontend changes.

**Change 1 — `snapshotBatterGamelogs(date)` in `snapshotJobs.js`** (after `snapshotPitcherGamelogs`):
- Reads gamePks from `schedule_snapshots`
- For each game, calls `/game/${gamePk}/boxscore?hydrate=person`
  - If `battingOrder` populated → use confirmed lineup IDs
  - Otherwise → fetch active roster from `/teams/${teamId}/roster` (non-pitchers only)
- Deduplicates across games with a `Set`
- For each unique batter: skip if already in DB today (idempotent); otherwise fetch gamelog + person + season stats from MLB API; build exact same payload shape as `players.js` hitting path; upsert to `player_gamelog_snapshots`
- 600ms pacing between batters

**Change 2 — export** `snapshotBatterGamelogs` in `module.exports`

**Change 3 — scheduler.js:** import + cron at `0 10,14 * * *` Honolulu (same as pitchers)

**Timing note:** 10 AM run uses roster fallback (~840 batters, ~8–10 min). 2 PM run uses confirmed lineups (~270 batters, ~3–4 min). Second run skips already-snapshotted players so it only fetches new/late-arriving lineup entries.

**CODEX TASK 104 spec appended to `AGENT_SYSTEM_PROMPT.md`.**
**Prompt written at `codex-task-104-prompt.md`.**

*Updated 2026-05-09 — Session 111 complete · CODEX TASK 104 specced (Batter Gamelog Pre-fetch)*

---

## 🗒 Session 112 — CW: CODEX TASK 104 approved + Full backlog audit

### CODEX TASK 104 approved

Cursor implementation verified clean:
- ✅ `snapshotBatterGamelogs(date)` added to `snapshotJobs.js` after `snapshotPitcherGamelogs`
- ✅ Exported in `module.exports`
- ✅ Imported and scheduled in `scheduler.js` — `cron.schedule("0 10,14 * * *", ..., { timezone: "Pacific/Honolulu" })`
- ✅ User confirmed board loads instantly after cron run — no more 15–30s cold-load delay

---

### Full backlog audit — codebase has outrun the docs

A systematic audit of the actual codebase against the handoff backlog items found that **every "open" item listed in the prior session was already fully implemented**. The docs were stale, not the code.

#### Confirmed implemented (docs now updated):

**Backlog Task 35 — Opposing Team K% in K Scoring Model ✅**
- `kBoardScore` uses `oppTeamStats?.kPct` with four tiers: `≥24 → +4`, `≥21 → +2`, `≤19 → -2`, `≤17 → -4`
- `computePitcherBoard` resolves `liveTeamStats?.[facingTeam]` and passes it in
- `liveTeamStats` state populated via `/api/team-stats/:id` calls in a dedicated useEffect
- `backend/routes/teamStats.js` route exists
- Signal text (`"Opp K% 26% (high-K lineup)"`) displayed on board card
- More refined than original spec (4 tiers vs 2)
- `AGENT_SYSTEM_PROMPT.md` entry marked `✅ COMPLETED`

**Backlog Task 38 — Pitch Count + Workload Tracking for Outs Model ✅**
- `outsBoardScore` penalizes `≥100 pitches within 4 days → -6` and `85–99 pitches → -3`
- Slightly more aggressive than original spec (`-6/-3` vs `-4/-2`) but functionally complete
- Signal text (`"114p last start (3d rest)"`) displayed on board card
- `AGENT_SYSTEM_PROMPT.md` entry marked `✅ COMPLETED`

**Active Roster Before Confirmed Lineups ✅**
- `backend/routes/lineups.js` returns `source: "roster"` when no confirmed batting order is found
- Frontend checks `isRosterFallback = liveLineups[gamePkKey]?.source === "roster"`
- Lineup header renders `"LAD Roster (Lineup Pending)"` with a `ROSTER` badge on each player row
- Board tabs (HR/Hits) remain populated all day using roster hitters before official lineups post

**F5 Moneyline ✅**
- `simF5MLConfidence()` scoring function fully implemented
- `computeGameBoard("f5ml", ...)` live and included in `buildAiBoardPayload`
- Full **Lab tab** with `f5ml` as default sub-tab — card scoring, AI Board integration, pick logging (`LAB_F5ML`), grading (`computeLabF5MlGrade`)
- Also has a **Models tab** with same `f5ml` sub-tab for model comparison

**Hybrid AI Summary Text ✅**
- `backend/routes/cardSummary.js` uses Haiku (`claude-haiku-4-5-20251001`) with GPT-4o-mini fallback
- Frontend: `hydrateCardSummaries` batch-posts to `/api/card-summary`, stores results in `aiCardSummaries` state
- `getCardSummaryText(request)` called on Board cards; result rendered as `aiReason` italic line under each card
- Fires automatically when Board tab opens; de-duped via `aiSummaryInFlight` ref

**Lab Calibration DB Migration ✅**
- `backend/services/labCalibration.js` is fully dual-path:
  - When DB is connected → reads/writes `lab_outcomes` PostgreSQL table
  - When DB is not connected → falls back to `lab-outcomes.json`
- `lab-outcomes.json` still exists as a safety net but is no longer the primary store in production

---

#### Genuinely open (not yet implemented):

**Global Track Record — all tabs**
- No recommendation history table in DB
- No cross-tab hit rate tracking beyond the existing Lab tab
- Documented as a future architecture direction in the handoff notes
- Requires product decision on what counts: every surfaced card, top cards only, or user-logged picks only
- Depends on Lab Calibration DB (now done) as a prerequisite
- Still needs a full spec before implementation

---

### State of the backlog

The original long-form backlog (Tasks 1–60+) is **fully exhausted**. Everything that had an implementation spec has been built. The remaining open work is either:
1. **New features** yet to be specced (Global Track Record, any new ideas)
2. **Incremental improvements** to existing systems

*Updated 2026-05-09 — Session 112 complete · Backlog audit*

---

## 🗒 Session 113 — CW: BACKLOG TASK 61 added (Remove Picks Tab)

User identified the Picks tab as no longer needed. Lab has its own DB-backed track record (`lab_outcomes`); Model Picks surfaces today's summary inline. The tab should be removed.

### Scope audit

`logPick` is called from 8 places outside the Picks tab (Lab, Model Picks, NRFI), so `propLog` state and `logPick` must stay. The removal is limited to Picks-specific infrastructure.

### What gets removed (BACKLOG TASK 61 spec in `AGENT_SYSTEM_PROMPT.md`)

- Picks nav button (purple, `#a78bfa` active)
- Stale picks banner on Slate view ("⏰ N picks need grading")
- `picksFilter` state
- `gradedGames` / `histGradedGames` refs
- `hydratePicksFromServer` callback + its call in the view-change effect
- Today-slate auto-grading useEffect (iterates `liveBoxscores`, calls `computeGrade` + `markResult`)
- Historical catch-up grading useEffect (fetches old boxscores on `view === "picks"`)
- `getPickStatus` / `isPickUnsettled` functions
- `computeGrade` function (only called by the two grading effects)
- `markResult` function (only called by grading effects + Picks view)
- `view === "picks"` IIFE (~600 lines)

### What stays

- `propLog` state, `logPick` — used by Lab, Model Picks, NRFI
- `todayModelLogs` / `l7SettledModelLogs` / `l7WinRate` — rendered in Model tab header
- Lab logged-state checks — `propLog.some(...)` on Lab cards
- `backend/routes/picks.js` — no backend changes

*Updated 2026-05-09 — Session 113 complete · BACKLOG TASK 61 added (Remove Picks Tab)*

---

## 🗒 Session 114 — Bug fix: picks.js 502 crash + CODEX TASK 105 specced (Batch Gamelog)

### Bug fix — `picks.js` crashing server with 502

**Symptom:** All API routes returning 502 Bad Gateway — entire Railway server down.

**Root cause:** `backend/routes/picks.js` queried `SELECT ... status ...` from the `picks` DB table. The `status` column was never created in the DB schema. On first request to `GET /api/picks`, the unhandled promise rejection from `pg` crashed the Express process.

**Fix (applied directly to `backend/routes/picks.js`):**
- Removed `status` from the `SELECT` column list (GET route)
- Removed `status` from the `INSERT` column list and values array (POST route)
- Simplified PATCH to only update `result` — `status` updates dropped since column doesn't exist
- The `snapshot` JSONB column already stores the full pick object including any status value

No migration needed. This is a stable interim fix until BACKLOG TASK 61 (Remove Picks Tab) ships and the frontend stops calling `/api/picks` entirely.

---

### CODEX TASK 105 — Batch Gamelog Endpoint

**Root cause of Board slowness:** Even with the DB-backed gamelog cache, the Board pre-fetch fires one HTTP request per batter (~270 on a full slate). The browser caps concurrent connections at 6 per domain → 270 ÷ 6 = 45 sequential batches → 4–15 second delay even on a warm DB.

**2 files, clean scope:**

**`backend/routes/players.js`** — new `POST /api/players/gamelogs/batch` route (placed before the existing `/:playerId/gamelog` handler):
- Accepts `{ playerIds: number[], group: "hitting"|"pitching" }`
- L1: checks in-memory cache for each ID (same `gamelog:${id}:${group}` key as individual route)
- L2: one bulk DB query — `WHERE player_id = ANY($1) AND stat_group = $2 AND slate_date = $3`
- L3: parallel MLB API fallback for remaining misses (8-concurrency cap via chunked `Promise.all`)
- Write-through to DB and L1 for API hits — same logic as individual route
- Returns `{ results: { [playerId]: data }, misses: [] }`

**`prop-scout-v7.jsx`** — Board pre-fetch batter loop replaced:
- Collect all unique batter IDs not already in `liveHittingLog`
- One `apiMutate("/api/players/gamelogs/batch", "POST", { playerIds, group: "hitting" })`
- Merge `data.results` into `liveHittingLog` in a single `setLiveHittingLog` call
- 270 HTTP round trips → 1

Individual `GET /api/players/:playerId/gamelog` unchanged — still used by lineup drawer and per-batter expand.

**Prompt file:** `codex-task-105-prompt.md`

*Updated 2026-05-09 — Session 114 complete · picks.js hotfix + CODEX TASK 105 specced*

---

## 🗒 Session 115 — BACKLOG TASK 62 added (Localize game times to user timezone)

User noticed board cards display "3:07 PM ET" regardless of the viewer's location.

**Root cause:** `formatLocalTime(isoStr)` already exists at line ~325 and correctly converts ISO datetimes to the browser's local timezone (e.g. "10:07 AM PT", "7:07 AM HST"). But it's applied inconsistently — some views use it, others fall through to `game.time` (a raw ET-formatted string from the backend) or even hardcode `timeZone: "America/New_York"` explicitly.

**4 locations to fix in `prop-scout-v7.jsx` (no backend changes):**
1. Board game card subtitle — `{game.time}` → `{formatLocalTime(game.gameTime) ?? game.time}`
2. K/Outs board card game time — same swap
3. AI Board group header — hardcoded `toLocaleTimeString(..., { timeZone: "America/New_York" }) ET` → `{formatLocalTime(group.gameTime)}`
4. Verify two regex-based parsers of `game.time` don't affect display (internal logic only)

Spec added as **BACKLOG TASK 62** in `AGENT_SYSTEM_PROMPT.md`.

*Updated 2026-05-09 — Session 115 complete · BACKLOG TASK 62 added (Localize game times)*

---

## 🗒 Session 116 — CW: CODEX TASK 105 approved (Batch Gamelog Endpoint)

**CODEX TASK 105 approved** — both files verified clean.

**`backend/routes/players.js`:**
- `POST /gamelogs/batch` added at line 143, before the existing `GET /:playerId/gamelog` handler (no Express routing conflict)
- L1 in-memory cache check per ID → L2 single bulk DB query `WHERE player_id = ANY($1)` → L3 chunked parallel MLB API (8 concurrent per chunk)
- Same cache key format, TTL, and write-through pattern as the individual route
- Payload shape identical for both hitting and pitching groups

**`prop-scout-v7.jsx`:**
- Board pre-fetch batter loop replaced with `missingBatterIds` collector + single `apiMutate("/api/players/gamelogs/batch", "POST", ...)` call
- Deduped with `[...new Set(missingBatterIds)]`
- Results merged into `liveHittingLog` in one `setLiveHittingLog` call
- Pitcher data loop unchanged — correct, pitcher count (~30) doesn't need batching

**Result:** 270 individual HTTP requests → 1 on Board open. On a warm DB (after cron runs) the batch returns in one fast round trip.

*Updated 2026-05-09 — Session 116 complete · CODEX TASK 105 approved*

---

## 🗒 Session 117 — Cold-start API audit: 3 new backlog tasks (TASKS 63, 64, 65)

**Task:** Analyzed `backend/output.txt` — a 5,529-line log of all outbound API calls made during a cold-start page load (64 seconds total, 00:54:39 → 00:55:43).

**Total outbound MLB/Savant API calls on cold start: ~3,800+**

### Three problems identified (and specced as backlog tasks):

**BACKLOG TASK 63 — Share schedule cache across all routes**
- `/api/v1/schedule` called **98 times** to the MLB API during one startup
- Every NRFI and bullpen route handler calls the MLB API directly instead of checking the shared in-memory cache that `warmCache` already populated
- Fix: add `cache.get("schedule")` check at top of each route handler before making the fetch
- Impact: 98 calls → 1 per TTL window

**BACKLOG TASK 64 — Cache linescore responses (dedup 936 → ~316)**
- `/api/v1/game/:pk/linescore` called **936 times**, only 316 unique game PKs
- Pitcher-splits route fetches linescore for every prior start — multiple starters share the same past game PKs, so the same completed linescore gets re-fetched 3-6x per startup
- Game `824850` alone was fetched **6 times**
- Fix: `cache.get/set('linescore:${gamePk}', data, 24h)` wrapper — completed games are immutable
- Impact: eliminates all 620 duplicate linescore fetches

**BACKLOG TASK 65 — Fix bullpen double-stats bug**
- Every bullpen pitcher triggers `/api/v1/people/:id/stats` called **twice** consecutively, then `/api/v1/people/:id` once — 3 calls per pitcher
- 30 bullpen fetches × 13 pitchers × 1 extra stats call = **~390 extra calls**, estimated ~856 total redundant people/stats calls across all bullpen processing
- Fix: find and remove the duplicate stats fetch in `backend/routes/bullpen.js`
- Impact: ~50% reduction in bullpen-related MLB API calls

### Combined impact of tasks 63 + 64 + 65:
~1,576 needless MLB API calls eliminated per cold start, reducing total outbound calls from ~3,800 to ~2,200.

### Other observations (not immediately specced):
- Batter Power CSV + Gamelog + people/stats fire in groups of 3 concurrently — this is expected behavior but still heavy on cold cache (~280 batters × 3 = 840 calls)
- Savant pitcher CSVs (for arsenal) each contain 300-2,700 rows — these are huge downloads; already cached on L1 after first fetch
- DB warm cache (`warmCache` cron) runs before frontend connects — if it completes before user lands, most of the above is moot; the issue only manifests on cold start or after a Railway restart

*Updated 2026-05-09 — Session 117 complete · Cold-start audit + BACKLOG TASKs 63/64/65 added*

---

## 🗒 Session 118 — Score-Tier-Aware AI Summaries + Pre-Fetch Fix

### Score-tier-aware summaries for all Board cards

Previously AI summaries were only meaningfully generated for high-scoring (≥75) cards. Yellow and red cards fell through to `fallbackCardSummary` — a semicolon-joined phrase string like "Hot — on a tear recently; Good hitter (.270+). Neutral park for hits." which wasn't useful.

**Root cause 1 — `buildBoardSummaryRequest` didn't compute `negatives[]` or `scoreTier`.**
Fixed by adding to the returned payload:
```js
const scoreTier = score == null ? "mid" : score >= 75 ? "high" : score >= 55 ? "mid" : "low";
const sortedNeg = [...(factors ?? [])].filter(f => (f?.pts ?? 0) <= 0).sort((a, b) => (a?.pts ?? 0) - (b?.pts ?? 0));
negatives = sortedNeg.slice(0, 2).map(f => String(f?.detail ?? f?.label ?? "").trim()).filter(Boolean);
return { ..., negatives, score, scoreTier };
```

**Root cause 2 — `hydrateCardSummaries` POST body was missing `score`, `scoreTier`, `negatives`.**
The destructure list when building the API call omitted these three fields — backend received `scoreTier: undefined` → defaulted to `"mid"` for every card. Fixed by adding all three to the destructure and POST payload.

**Root cause 3 — Pre-fetch useEffect had `.slice(0, 20)`, capping AI requests to top 20 candidates.**
Cards ranked 21+ (Basallo #22, Judge #40, etc.) always fell through to fallback text. Fixed by increasing to `.slice(0, 60)` and also pre-fetching locked candidates:
```js
const lockedRequests = Object.values(lockedBoardCandidates)
  .flatMap(entry => {
    const tabCandidates = isGameBoard ? [] : (entry[boardTab] ?? []);
    return tabCandidates.map(c => buildBoardSummaryRequest(c, boardTab));
  });
const allRequests = [...requests, ...lockedRequests.filter(r => !requests.some(lr => lr.id === r.id))];
```

**Backend (`backend/routes/cardSummary.js`) changes:**
- Added `cardPayload()` helper including `score`, `scoreTier`, `negatives`
- Updated all three system prompts (Haiku, gpt-4o-mini, gpt-4o) with tier-aware tone instructions:
  - `high (≥75)` → confident edge statement, lead with what makes this pick strong; cite ≥2 stats
  - `mid (55–74)` → balanced — name main edge but acknowledge key headwind
  - `low (<55)` → honest risk assessment — lead with what's working AGAINST the pick, do NOT spin positive
- Added `negatives[]` and `scoreTier` to cache key payload so changing fields busts stale cache
- Updated `fallbackSummary()` to be tier-aware (low tier leads with negatives)

### Layout audit (research question, no code changes)

1. **Mobile-first or desktop-first?** Hybrid, desktop-leaning. Root container `maxWidth: 960` centered. Base layout assumes wider viewport then shrinks via JS conditionals.
2. **Nav style:** Top nav only — horizontal flex-wrap button row in app header. No bottom nav bar.
3. **CSS responsiveness:** No `@media` queries. Pure inline JS conditionals on `windowWidth > 640` and `isNarrowPhone` (≤430). Flexbox + CSS Grid for layout.
4. **Card widths:** Slate cards go 1-column (mobile) → 2-column grid (>640px). Board/prop cards always single-column. Root padding: 12px mobile → 24px desktop, capped at 960px.

*Updated 2026-05-15 — Session 118 complete · Score-tier summaries + pre-fetch fix + layout audit*

---

## 🗒 Session 119 — Backtesting Architecture + CODEX TASK 118 (Phases 1 & 2)

### Why backtesting is limited without this

Going back to a past date in research mode doesn't produce a faithful replay because:
- Odds API is live-only — historical lines not available
- `lockedBoardCandidates` is in-memory only — lost on refresh/session end
- AI summaries are cached for only 6 hours

### Architecture scoped (4 phases)

**Phase 1 — Snapshot at lock time** (implemented)
**Phase 2 — Result resolution via cron** (implemented)
**Phase 3 — History replay UI** (backlog — needs data first)
**Phase 4 — Performance dashboard** (backlog — needs Phase 3 + sample size)

Player prop markets only for Phases 1 & 2: K, Hits, HR, Outs. Game-level markets (ML, Spread, NRFI, Total) out of scope.

### CODEX TASK 118 — implemented and approved

**New files:**
- `backend/migrations/005_board_card_snapshots.sql` — new table with columns: `id`, `slate_date`, `game_pk`, `card_id`, `market`, `lean`, `score`, `score_tier`, `book_line`, `ai_summary`, `card_data` (JSONB), `locked_at`, `result_hit`, `actual_stat`, `resolved_at`. Unique index on `(slate_date, card_id, market)` — idempotent.
- `backend/routes/boardSnapshot.js` — `POST /api/board-snapshot` (idempotent insert, `ON CONFLICT DO NOTHING`) + `GET /api/board-snapshot/:date` (returns cards grouped by market for Phase 3 replay).
- `backend/jobs/resolveCardSnapshotsJob.js` — self-contained job (copies `fetchBoxForGrading`, `normalizeName`, `parseIpToOuts` from gradePicksJob pattern). Queries unresolved snapshots for a date, fetches MLB boxscores, resolves K/Outs via pitcher match + Hits/HR via batter match. HR: line ≤0.5 → binary (any HR = hit), line >0.5 → lean comparison.

**Modified files:**
- `backend/server.js` — route mounted at `/api/board-snapshot`; admin trigger `GET /api/admin/jobs/resolve-card-snapshots?date=YYYY-MM-DD`.
- `backend/jobs/scheduler.js` — two cron entries at 1 AM and 2 AM Honolulu to resolve yesterday's snapshots.
- `prop-scout-v7.jsx` — fire-and-forget `fetch POST /api/board-snapshot` added immediately before `setLockedBoardCandidates`. Builds `newlyLocked` from cards just gaining content (`hasNewBatters`/`hasNewPitchers`). Each card enriched with `market`, `lean` (score ≥55 → "over"), `scoreTier`, `bookLine` (DK → FD → CZR → propLine → suggestedLine priority). `IS_SANDBOX` guarded.

**Migration applied** to Railway Postgres via `psql` public URL. Table confirmed live with `\d board_card_snapshots`.

**Admin smoke test command:**
```bash
curl -H "x-admin-secret: YOUR_SECRET" \
  "https://ai-agent-mlb-production.up.railway.app/api/admin/jobs/resolve-card-snapshots?date=YYYY-MM-DD"
```
Returns `{ ok: true, date, resolved: N, skipped: M }`.

**Important note on lean derivation:** `lean` is computed as `score >= 55 → "over"`. This is a valid approximation for batter/pitcher prop markets. If under-leaning cards are ever added to the Board, this logic needs revisiting.

**Backlog tasks added:**
- Task #72 — Phase 3: History replay UI in date picker
- Task #73 — Phase 4: Performance dashboard (hit rate by tier/market)

*Updated 2026-05-15 — Session 119 complete · CODEX TASK 118 specced, implemented, approved, migrated*

---

## 🗒 Session 120 — CODEX TASK 119 Specced (Top-20 Filter for Hits/HR Tabs)

### Feature

Toggle chip labeled **"TOP 20"** on the Hits and HR board tabs that limits the displayed card list to rank ≤ 20. Renders inline with the existing sub-header rank label row.

### Key design decisions

- New state: `boardTop20` (boolean), resets to `false` on `boardTab` change
- Filter applied at render time only via `.slice(0, 20)` on display arrays — the underlying `lockedBoardCandidatesForTab` and `liveBoardCandidates` arrays are never mutated
- All other logic (counts, AI summary hydration, backtesting snapshot POST) continues to use full arrays
- K and Outs tabs completely unaffected
- Chip style: amber (`#fbbf24`) when active, matches existing board UI monospace palette

**Prompt file:** `codex-task-119-prompt.md`

*Updated 2026-05-15 — Session 120 complete · CODEX TASK 119 specced*

---

## 🗒 Session 121 — Codex: Top-20 Filter for Hits/HR Board Tabs

**Files changed this session:** `prop-scout-v7.jsx`

**Changes:**
- Added `boardTop20` state and reset it to `false` whenever `boardTab` changes
- Applied the filter at render time only via:
  - `displayLiveCandidates`
  - `displayLockedCandidates`
- Re-grouped those filtered arrays back into the existing per-game live / locked board sections so the rolling-lock layout remains unchanged
- Added a `TOP 20` toggle chip to the prop-board sub-header
- Restricted the chip to `Hits` and `HR` only
- Left all non-display logic untouched:
  - summaries / counts
  - AI summary hydration
  - backtesting snapshot lock flow
  - K / Outs tabs

*Updated 2026-05-15 — Session 121 complete · CODEX TASK 119 implemented*

---

## 🗒 Session 122 — Codex: Cold-Start API Efficiency

**Files changed this session:** `backend/routes/nrfi.js`, `backend/routes/bullpen.js`

**Changes:**
- Added module-level inflight dedup Maps in `nrfi.js`:
  - `_linescoreInFlight`
  - `_recentGamesInFlight`
- `getLinescore(gamePk)` now uses cache → inflight → fetch, so parallel cold-start requests reuse the same MLB linescore Promise
- `fetchRecentTeamGames(teamId, endDate, excludeGamePk)` now uses cache → inflight → fetch, keyed by `${teamId}:${endDate}`
- Both inflight Maps clean up on resolve and reject
- `bullpen.js#getPitcherData(personId)` now combines `stats=season` and `stats=gameLog` into a single `stats=season,gameLog` MLB request plus the existing `/people/:id` profile call
- Returned bullpen data shape is unchanged:
  - `stat`
  - `games`
  - `person`

**Validation:**
- `node --check backend/routes/nrfi.js` passed
- `node --check backend/routes/bullpen.js` passed
- `npm run build` passed

*Updated 2026-05-15 — Session 122 complete · CODEX TASK 120 implemented*

---

## 🗒 Session 123 — Codex: Lock Games Board Candidates at Game Start

**Files changed this session:** `prop-scout-v7.jsx`

**Changes:**
- Added `lockedGameBoardCandidates` state with Honolulu-date localStorage restore using key:
  - `game_board_locked_snapshot`
- Added a game-board lock `useEffect` that snapshots a game the first time it leaves `"upcoming"`
- Each locked game stores candidates for all 6 Games sub-tabs:
  - `nrfi`
  - `total`
  - `spread`
  - `ml`
  - `f5ml`
  - `f5spread`
- Lock effect is idempotent:
  - skips already-locked `gamePk`s
  - skips empty locks when a cold slate has not produced any game candidates yet
- Replaced active `gameBoardCandidates` with a merged live+locked computation:
  - upcoming games still use live `computeGameBoard(...)`
  - live/final games substitute the locked pregame candidate for the active sub-tab
- Added `getGameBoardCandidatesForSubTab(sub)` helper
- Rewrote `gameSubtabHitSummary` to use the merged helper so top-of-tab `#/# hit` badges resolve against locked pregame candidates instead of drifting live rankings

**Why:**
- Fixes the Games-board survivorship / mid-game rerank bug where users returned to check results and found the pregame card itself had changed

**Validation:**
- `npm run build` passed

*Updated 2026-05-16 — Session 123 complete · CODEX TASK 121 implemented*

---

## 🗒 Session 124 — Codex: K Model / NRFI / EV Audit Pass

**Files changed this session:** `prop-scout-v7.jsx`

**Task 122 — K model**
- Reworked `kBoardScore(...)` so SwStr% is now the primary strikeout signal
- Added Chase Rate (`chasePct` / `oSwing`) as a secondary swing-miss input
- Preserved K/9 as the fallback branch when swing-miss fields are missing
- Left recent Ks, park, umpire, WHIP, opponent K%, and xwOBA factors in place
- Added SwStr% / Chase% display to pitcher board cards when available

**Task 123 — NRFI**
- Expanded `computeGameBoard(...)` to accept optional `liveLineups = {}`
- Upweighted historical first-inning scoring into a stronger dual-team factor:
  - `1st Inning Scoring History`
- Added `Top-Order OBP` factor using lineup spots 1–3 when OBP is present on lineup objects
- Updated only the two render-time Games-board candidate builders to pass `liveLineups`
- Left lock/snapshot callers untouched so they use the safe default empty object

**Task 124 — EV board context**
- Added `computeEVEdge(...)` helper inside the board render IIFE
- HR and Hits board cards now show an EV/value badge when the edge is material
- `TOP 20` mode on Hits / HR now sorts by EV edge before slicing
- K / Outs / Games tabs unchanged

**Validation:**
- `npm run build` passed

*Updated 2026-05-16 — Session 124 complete · CODEX TASKS 122–124 implemented*

---

## 🗒 Session 125 — Codex: Shared UI Atoms Refactor

**Files changed this session:** `prop-scout-v7.jsx`

**Changes:**
- Added shared helpers/components:
  - `resultBorderStyle(color)`
  - `GameStatusBadge`
  - `RankScoreColumn`
- Replaced the targeted duplicated result-border style blocks with `resultBorderStyle(...)`
- Replaced the repeated LIVE / FINAL badge JSX with `GameStatusBadge`
- Replaced the repeated prop-board rank + score + SIM column JSX with `RankScoreColumn`
- Renamed the inner board render `scoreColor` helper to `boardScoreColor` to avoid confusing shadowing of the outer matchup colorizer

**Scope:**
- Pure refactor only
- No scoring changes
- No state changes
- No backend changes
- No schema changes

**Validation:**
- `npm run build` passed

*Updated 2026-05-16 — Session 125 complete · CODEX TASK 125 implemented*

---

## 🗒 Session 126 — Codex: Savant K-Board Wiring Fix

**Files changed this session:**
- `prop-scout-v7.jsx`
- `backend/routes/pitcherSplits.js`
- `backend/routes/batterPower.js`

**Frontend changes:**
- `computePitcherBoard(...)` now accepts optional `pitcherArsenal = {}`
- Merged Savant pitcher stats from `pitcherArsenal[p.id]?.pitcherStats`
- Normalized:
  - `swStrPct`
  - `oSwingPct -> chasePct`
  - `fStrikePct`
- Added `swStrPct` and `chasePct` to pitcher candidates
- Updated the intended call sites to pass `pitcherArsenal`:
  - board render `boardCandidatesByType`
  - board summary hydration
  - `buildAiBoardPayload(...)`
  - AI Board payload call site
- Left the prop-board lock effect call sites unchanged, per spec
- Updated pitcher-card metric merging so the existing SwStr% / Chase% display line now shows real Savant values

**Backend changes:**
- `pitcherSplits.js`
  - added `&player_id=${pitcherId}` to the Savant CSV request
- `batterPower.js`
  - added `&player_id=${batterId}` to the Savant CSV request

**Scope / non-changes:**
- `kBoardScore(...)` itself unchanged
- no new state
- no new routes
- no schema changes

**Validation:**
- `node --check backend/routes/pitcherSplits.js` passed
- `node --check backend/routes/batterPower.js` passed
- `npm run build` passed

*Updated 2026-05-16 — Session 126 complete · CODEX TASK 126 implemented*

---

## 🗒 Session 127 — Picks System (Tasks 138–143 + Polish)

**Files changed this session:**
- `prop-scout-v7.jsx`
- `backend/server.js`
- `backend/routes/picks.js` (new)
- `backend/db.js` (migration)
- `src/board/tabHitBadge.test.js` (new)
- `src/utils.test.js`
- `railway.json`

---

**Task 138 — Picks Backend (DB migration + route upgrade)**

- `picks` table: added 12 new columns — `player_id`, `market`, `side`, `book_line`, `odds`, `units`, `slate_date`, `voided`, `voided_at`, `source`, `game_label`, `player_name`
- `GET /api/picks` LEFT JOINs `board_card_snapshots` for auto-grading
- `POST /api/picks` with duplicate guard (HTTP 409 `{ error: "already_logged", id }`)
- `PATCH /api/picks/:id/void`
- `calcPnl(resultHit, odds, units)` helper
- Flat-file fallback preserved throughout

---

**Task 139 — Add Pick Flow (long-press removed, replaced with tap icon)**

- Originally implemented with `useLongPress` hook; later replaced with a `+`/`✓` circle icon at bottom-right of every board card
- Icon states: `+` gray (upcoming), `+` muted (FINAL/game done), `✓` blue (already logged)
- `openAddPickSheet` opens a centered modal with side toggle, odds/units inputs, book line pre-filled
- `loggedPickIds` Set prevents duplicate API calls
- `submitAddPick` calls `POST /api/picks`

---

**Task 140 — Picks Tab UI**

- 📋 PICKS tab (gated behind `currentUser`)
- Summary tiles: RECORD, HIT RATE, P&L
- Picks grouped by `slateDate`, each pick card shows: market badge, player name, side/line/units, result badge, actual stat, P&L, Void button
- ALL / 7D / 30D range filter
- `voidPick` removes pick optimistically then calls `PATCH /api/picks/:id/void`

---

**Task 141 — Regression tests**

- `src/board/tabHitBadge.test.js`: tests for `lookupBoardResult`, `boardOutcome`, `lockedCandidatesForType`
- Additional `summarizeOutcomes` edge cases in `src/utils.test.js`

---

**Task 142 — Tap icon replaces long-press**

- Removed `useLongPress` from `BatterBoardCard` and `PitcherBoardCard`
- New `onAddPick` prop on all three card components (Batter, Pitcher, Game)
- Icon `bottom: 6, right: 8` on all cards; disabled (muted) when game is FINAL or already logged

---

**Task 143 — Frontend-first picks grading**

- Added `result_hit BOOLEAN`, `actual_stat NUMERIC`, `grade_status TEXT` columns to `picks` table
- New `PATCH /api/picks/:id/grade` endpoint
- `GET /api/picks` now uses `COALESCE(p.result_hit, bcs.result_hit)`
- Module-level `gradePickLocally(pick, { liveBoxscores, liveScores, liveSlate })` handles all 10 markets: `ml`, `spread`, `total`, `nrfi`, `f5ml`, `f5spread`, `k`, `outs`, `hr`, `hits`
- Background `useEffect` (no `view` condition) grades picks as games go final
- Historical backfill `useEffect` runs once per session: fetches historical schedule + boxscores for past ungraded picks, builds synthetic slate entry from `gameLabel`, grades and persists
- `grade_status` values: `null` (pending), `"ppd"` (postponed), `"scratch"` (player not in boxscore), `"push"` (exact line)
- `gradingPickIdsRef` prevents double-grading

---

**Polish / bug fixes:**

- **Live LIVE badge on Slate tab:** score poller now polls games past their scheduled start time (`msSinceStart > 0 && < 5h`) regardless of stale schedule cache status; `SlateCard` uses `liveScore.inning` as LIVE fallback (guarded by `!isFinal`)
- **Collapsible pick date sections:** today always open; fully resolved past dates auto-collapse; summary bar shows `Jun 5 · 3/5 hit · +1.2u`; user can toggle any date
- **Market-aware `actualStat` labels:** `won by X`, `X total runs`, `X K`, `X outs`, `X hits`, `X HR`, `0 F1 runs`
- **`HOME`/`AWAY` in pick meta** replaced with actual team abbreviation parsed from `gameLabel`
- **P&L flat-unit fallback:** wins with no odds logged now count as `+units` instead of null (Option B — vig-adjusted when odds available, flat otherwise)
- **`+` icon added** to `GameBoardCard`, `EdgeCard` (Predict), AI Board inline cards, Model TierSection cards
- **`getAiBookLine(c)` helper:** hydrates `bookLine` from `livePlayerProps` at render time for AI Board and Predict cards when snapshot `bookLine` is null
- **`pickGameStatus` on picks tab:** shows `GameStatusBadge` (LIVE/FINAL) for today's unresolved picks
- **Void button** hidden once game is LIVE; visible for PPD/SCRATCH edge cases
- **`slateDate` normalization:** ISO timestamp normalized to `YYYY-MM-DD` for display (`String(pick.slateDate).slice(0, 10)`)
- **`railway.json` fixed:** `buildCommand: "npm install --include=dev && npm run build && cd backend && npm install"` (Nixpacks production install fix)

---

**Architecture notes:**

- Game picks store `player_id = gamePk` (numeric); grading uses `player_id` directly as gamePk for game markets
- Prop picks store `player_id = MLB player ID`; backfill resolves gamePk by fetching `/api/schedule?date=YYYY-MM-DD` and matching `gameLabel`
- `gradePickLocally` returns `{ resultHit, actualStat, gradeStatus }` — null if game not final yet
- Backend `gradePicksJob.js` remains as nightly catch-up for picks logged while app was closed

---

**Feature freeze notice:**

As of this session, the app is entering a feature-freeze period. Only bug fixes and enhancements to existing features will be accepted. No new features.

---

**Remaining backlog:**

- Task 70: Fix Baseball Savant scraping
- Task 72: Backtesting Phase 3 — History replay UI
- Task 73: Backtesting Phase 4 — Performance dashboard
- Task 137: Mobile Scoring Parity (not implemented, no mobile/src/ directory)

*Updated 2026-06-07 — Session 127 complete · CODEX TASKS 138–143 implemented*
