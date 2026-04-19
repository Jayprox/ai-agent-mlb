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

**1. Better pitch type matchup surfacing** *(user feedback)*
Batter vs pitch type data already exists in the Lineup tab's expanded drawer and vulnerability bar. This is about visibility, not new data. Surface it more prominently — e.g. a callout when a batter particularly handles or struggles with the pitcher's primary pitch. Quick win.

**2. Pitcher last 3 starts breakdown** *(pro bettor feature)*
We already fetch the pitcher game log for the sparkline. Extend the pitcher card to show a mini table: last 3 starts with ER, IP, K, and PC per outing. Gives bettors a recency picture beyond season ERA. Frontend-only change.

**3. Team K% confluence note** *(pro bettor feature)*
Use the pitcher's K/9 and the opposing lineup's aggregate matchup score (already computed) to surface a single callout like "High K environment — pitcher K/9 10.2, lineup weak vs breaking balls." No new data needed.

---

### 🟡 Medium Complexity — New data, single API call

**4. Out-of-position player flag** *(user feedback)*
When live lineups are fetched, the MLB API returns each player's defensive position for that game. Compare it to their primary position from their profile. If they differ, badge the batter row in the Lineup tab — e.g. `⚠️ 2B (norm. SS)`. Signals roster moves, fatigue substitutions, or platoon decisions that affect lineup construction. No new backend route needed — data is already in the lineup response.

**5. UmpScorecards auto-refresh** *(backlog)*
Small Node script that re-fetches `backend/data/umpires.json` from the UmpScorecards API once per day. Low urgency — umpire data is stable year-over-year. Plan: Cowork scheduled task or node-cron job. Already designed conceptually; just needs the script written and wired.

**6. Pitcher vs L/R splits** *(user feedback + backlog)*
Attempted early season via MLB Stats API — returned empty data (insufficient AB sample). Worth revisiting mid-May/June when sample sizes build. Alternatively, Baseball Savant has reliable platoon splits year-round via the same CSV endpoint already used for batter splits (`/api/splits/:batterId` pattern). Would show pitcher ERA/WHIP vs LHH and RHH on the pitcher card. Same complexity as the batter splits route already built.

---

### 🔵 Higher Complexity — AI integration

**7. AI Trends Summary** *(planned — replaces Game Notes)*
Replace the existing Game Notes section with an Anthropic API-generated narrative per game. Pass the full game object (pitchers, bullpen, weather, umpire, odds, lineup) as structured context. Model returns a 1–2 paragraph bettor-focused summary covering pitcher trends, bullpen fatigue, weather impact, umpire tendency, and standout matchups. Data-only — no web search. Key implementation notes:
- Cache per `gamePk` (2–4 hour TTL) — do not fire on every page load
- Use Claude Haiku (fast, cheap, sufficient for short narrative)
- Backend route: `POST /api/trends/:gamePk` or inline in existing game object
- Fallback: show nothing if API call fails (don't show an error state)

**8. Injury flags + Lineup scratch alerts** *(user feedback + pro bettor feature — same feature)*
Real-time injury and lineup scratch news is the same problem. Static manual flags are too slow to be useful. Best path: let the AI-powered Props Tab (item #9) handle this via web search — injury context flows in automatically when the AI searches for player news. Out-of-position flag (item #4) covers the in-game roster signal without needing a separate injury feed.

**9. AI-powered Props Tab** *(planned — overhauls Props tab)*
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

**10. PostgreSQL data layer** *(feat/postgres-data-layer — fully designed)*
Fully designed in `handoff-postgres-data-layer.md` and implemented on the separate `feat/postgres-data-layer` branch. Branch includes backend-only scaffolding for `pg` + `node-cron`, `backend/services/db.js`, SQL migrations, snapshot jobs, scheduler wiring, DB-first reads for `schedule` / `bullpen` / `linescore` / `umpires`, and an admin trigger endpoint. It was intentionally kept off `main` because it still needs real `DATABASE_URL` / `ADMIN_SECRET` environment wiring plus first-run migration execution on Railway before it should be merged. Enables all items below that require historical data.

**11. Historical prop hit rates + CLV tracking** *(pro bettor feature)*
Track whether props hit over time and compare final line vs line at pick time (Closing Line Value). Depends on PostgreSQL being live — picks need to be stored with timestamps and graded after game completion. Also requires capturing pre-game odds at pick time for CLV calculation.

**12. Public % / Sharp money split** *(pro bettor feature)*
Show public betting % vs sharp money direction per game. Requires a paid third-party data source — Action Network, Bet Labs, or a similar sharp data aggregator. Most external-dependent item in the backlog. No free equivalent exists for reliable sharp/public splits.

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

### Three Planned Updates (In Progress)

1. ✅ Move First Inning Tendencies → Overview tab — **DONE this session**
2. 🔵 AI Trends Summary (replace Game Notes) — see backlog item #7
3. 🔵 AI-powered Props Tab — see backlog item #9

---

### Files Changed in Session 33

- `prop-scout-v7.jsx`
- `prop-scout-handoff.md`

---

*Updated April 19 2026 — Session 33 complete · Overview cleanup · F5/NRFI separation · Backlog consolidated and reprioritized*
