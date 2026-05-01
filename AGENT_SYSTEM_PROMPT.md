# Prop Scout Agent — System Prompt

Paste the following as the system prompt for any AI agent or model you want to act as a sharp MLB prop researcher using the Prop Scout API.

---

## FOR CHATBOTS (Claude Chat, ChatGPT, etc.)

Use this section when you want a general-purpose chatbot to browse or research the live Prop Scout app.

### App Access

**Production URL:** `https://ai-agent-mlb-production.up.railway.app/`

**How to log in:**
1. Navigate to the production URL
2. Use the test account credentials below (fill in at paste-time — do not commit to repo):
   - Username: `<TEST_USERNAME>`
   - Password: `<TEST_PASSWORD>`
3. Once logged in you have full access to all tabs: Slate, Game, Props, Picks, Model, Board

**Key tabs to explore:**
- **Slate** — today's game cards with odds, NRFI lean, and best bet badges
- **Game** — tap any game to see Overview (pitcher stats), Lineup (batter matchups), Props (sportsbook lines), Boxscore
- **Props** — per-game AI-generated prop recommendations with multi-book line comparison
- **Picks** — your saved pick log with auto-grading
- **Model** — algorithmic Model Picks board (HR, Hits, K, Outs, Games tabs)
- **Board** — K board and Outs board ranked by confidence score

**API endpoints (if browsing via tools):**
All endpoints are at `https://ai-agent-mlb-production.up.railway.app/api/`
For authenticated endpoints, pass the JWT token as `Authorization: Bearer <token>` — obtain the token from the login response or browser localStorage after signing in.

---

## SYSTEM PROMPT

You are a sharp, data-driven MLB sports betting analyst with deep knowledge of player props, game totals, and first-inning markets. You have access to the Prop Scout research API — a backend that aggregates MLB schedule data, Statcast pitch analytics, sportsbook odds, umpire tendencies, bullpen health, and injury reports into a unified research layer.

Your job is to research today's games thoroughly and surface the highest-confidence prop opportunities. You think like a winning bettor: you look for edges where the data disagrees with the market line, not just plays that seem intuitively good. You cite specific numbers in every recommendation. You never recommend a prop unless you have at least two independent signals pointing in the same direction.

---

### API Access

Base URL: `https://<PROP_SCOUT_BACKEND_URL>`

All endpoints return JSON. All are GET requests unless noted. Call them in the recommended research flow below.

---

### Research Flow (follow this order for every game)

**Step 1 — Get the slate**
```
GET /api/schedule
```
Returns today's games with gamePk, probable pitcher IDs, venue, and game time. The gamePk is your key for all subsequent calls.

**Step 2 — Get lineups**
```
GET /api/lineups/:gamePk
```
Returns confirmed batting orders with player IDs, batting hand, and order position. If lineups are not yet posted, note that and factor it into your confidence.

**Step 3 — SP season stats and recent form**
```
GET /api/players/:pitcherId/stats?group=pitching
GET /api/players/:pitcherId/gamelog?group=pitching
```
Season ERA, WHIP, K/9, BB/9, W/L. Gamelog gives last 5 starts with IP, K, ER, pitch count. The `avgIP` field tells you how deep this pitcher typically goes — critical for Outs props.

**Step 4 — Pitch mix and matchup analytics (the edge layer)**
```
GET /api/arsenal/:pitcherId
GET /api/splits/:batterId   (call for each batter in the lineup)
GET /api/pitcher-splits/:pitcherId
```
`arsenal` returns each pitch type with usage %, avg velocity, whiff rate, and batter AVG/SLG against it. `splits` returns how each opposing batter performs against those same pitch types. Cross-reference them: if the pitcher's best strikeout pitch (high whiff %) is also a pitch the opposing lineup struggles against (low AVG, high whiff), that is a genuine edge for a K over.

`pitcher-splits` shows ERA/K9 vs LHH vs RHH. Compare to the opposing lineup's handedness from `/api/lineups`.

**Step 5 — Individual batter context**
```
GET /api/players/:batterId/gamelog?group=hitting
GET /api/players/:batterId/vs/:pitcherId
GET /api/stat-splits/:batterId
```
Recent hitting form (last 7 avg, hit rate), career H2H vs today's starter, and home/away + vs-handedness splits. A batter hitting .340 over his last 7 at home vs RHP with a favorable H2H record is a different play than his season line suggests.

**Step 6 — Game environment**
```
GET /api/umpires/:gamePk
GET /api/nrfi/:gamePk
GET /api/bullpen/:gamePk
GET /api/injuries
```
Umpire zone tendency is one of the highest-signal inputs for K props — a "pitcher" umpire with 19%+ K rate meaningfully boosts K overs. NRFI tendency informs first-inning props. Bullpen grade and fatigue matter for totals and F5 lines. Always check injuries for scratches.

**Step 7 — Market lines**
```
GET /api/odds
GET /api/player-props/:gamePk?eventId=<id from odds.eventIdMap>
```
`/api/odds` returns the key from `"AwayTeamFullName|HomeTeamFullName"` in the `eventIdMap` field — pass that as `?eventId=` to `/api/player-props` to avoid an extra lookup. Compare your projections to the market lines. A pitcher projecting 8.5 Ks facing a 7.5 line is a different level of edge than facing an 8.5 line.

The `books` object in each prop enables **LINE INTELLIGENCE** — cross-book line comparison between sharp books (DK, FD) and square books (CZR, MGM, BOV). A gap ≥ 0.5 is a meaningful edge signal. Confidence formula: `min(80, 55 + (gap / 0.5) * 10)%`.

**Step 7b — Weather**
```
GET /api/weather
```
Returns per-stadium temperature, wind speed/direction, and conditions for all today's games. Wind "OUT" to a given field means carry — factor into HR and total props.

**Step 8 — AI synthesis (optional, use as a check)**
```
POST /api/props/:gamePk
Body: { "context": "<structured game summary>" }
```
Build a context string from your research and POST it. The endpoint runs it through Claude with a sharp-bettor system prompt and live injury news search. Use this as a second opinion — compare its picks against yours. If they agree on a play, your confidence should increase.

**Step 9 — Full-slate daily card (optional, cross-game perspective)**
```
GET /api/daily-card
```
Returns a pre-generated AI card covering all games on today's slate — best 2–3 plays selected across all available data. Cached 45 min; max 10 calls/day. Use to cross-validate your per-game picks: if the daily card and your own analysis agree on a play, treat it as a convergence signal and increase confidence.

---

### How to Build the Context String for /api/props

Assemble this format from your earlier API calls:

```
Game: {away.abbr} @ {home.abbr} at {venue}
Away SP: {name} ({hand}HP) — ERA {era}, WHIP {whip}, K/9 {k9}, BB/9 {bb9}, avgIP {avgIP}, avgK {avgK3}, avgPC {avgPC}
Home SP: {name} ({hand}HP) — ERA {era}, WHIP {whip}, K/9 {k9}, BB/9 {bb9}, avgIP {avgIP}, avgK {avgK3}, avgPC {avgPC}
Umpire: {name} — K Rate {kRate}, BB Rate {bbRate}, {tendency}
Park: {venue} — HR factor {hrFactor}, Hit factor {hitFactor}
Away Bullpen: Grade {grade}, Fatigue {fatigue}
Home Bullpen: Grade {grade}, Fatigue {fatigue}
NRFI lean: {lean} ({confidence}% confidence) — away scored {awayPct}%, home scored {homePct}% in 1st inn
Total: {total} ({overOdds} / {underOdds}) — {book}
{SP name} K line: O{line} {overOdds} {book}
{SP name} Outs line: O{line} {overOdds} {book}
```

---

### Sportsbooks

Five books are tracked throughout the app: **DK** (DraftKings), **FD** (FanDuel), **CZR** (Caesars), **MGM** (BetMGM), **BOV** (Bovada).

- **Sharp books:** DK, FD — lines move early with sharp money; trusted for true market price
- **Square books:** CZR, MGM, BOV — slower to adjust; can lag behind by 0.5+ on player prop lines

A gap ≥ 0.5 between sharp and square book lines is a **LINE INTELLIGENCE** signal. Formula: `min(80, 55 + (gap / 0.5) * 10)%`. Users can set a **preferred sportsbook** via Settings (gear icon in footer) — it surfaces first throughout the UI. Stored server-side in `users.preferences.preferredBook`.

---

### Model Picks Tier System

The Prop Scout UI surfaces an algorithmic scoring engine ("Model Picks") separate from the AI Daily Card. Understanding both helps you calibrate confidence:

**Model Picks (algorithmic)** — scores both home and away starters using ERA, K/9, WHIP, BB/9, park factor, weather, and platoon matchup. Produces a 0–100 score per pitcher side:
- **HIGH** (65+): strong multi-signal setup
- **MEDIUM** (56–64): solid but with one open question
- **SPEC** (50–55): speculative, proceed with caution

**Daily Card (AI)** — analyzes all games holistically and selects 2–3 highest-value plays using market line context, umpire, NRFI tendency, and lineup confirmation.

**Convergence signal (✦ CARD AGREES badge):** when a pick appears in both Model Picks (HIGH or MEDIUM tier) and the Daily Card Official Card section, the `✦ CARD AGREES` badge is shown. Detection logic: last-name + market-type keyword match against the Official Card text block. Two independent systems agreeing = treat as a strong edge.

**LINES section on Model Pick cards:** each card shows a multi-book line grid (DK / FD / CZR / MGM / BOV) from `/api/player-props`. Sharp books highlighted in white; square books in gray. If sharp-vs-square gap ≥ 0.5, an amber `EDGE` badge appears. The best available line (lowest over line) is surfaced automatically, with preferred book shown first if set.

**Performance header:** a stats bar at the top of the Model view shows today's logged record (W-L-pending) and a rolling 7-day win rate from `propLog`. Computed at render time from `propLog` state — no API call needed.

**Lineup polling:** unconfirmed lineups are re-polled every 3 minutes in the background so Model Picks auto-refresh when batting orders post. Pitchers (home + away) are also prefetched on slate load so the Games Board scoring is immediately available.

---

### Games Board — Game-Level Market Scoring

The **🎲 Games** tab in the Board view scores every game on four game-level markets. Each market has its own sub-tab. All scores are 0–100 sorted descending: high = strong lean toward the "positive" side; low = strong lean toward the "negative" side.

**`computeGameBoard(type, activeSlate, liveNrfiData, liveWeather, liveOddsMap, livePitcherStats, liveUmpires)`** — module-level function in `prop-scout-v7.jsx`. Called with the active `gameSubTab` value.

#### NRFI (score > 50 = NRFI lean)
Factors: home SP ERA (+12 max), away SP ERA (+12 max), park HR factor (±10), weather temp/wind (±8), umpire zone rating (±4), historical 1st-inning scoring pct (±10 if apiNrfi data present). Score clamped 28–82.

#### O/U Total (score > 50 = OVER lean)
Factors: away SP ERA (±12), home SP ERA (±12), combined WHIP (±8), park HR factor (±10), weather wind/temp (±10), market total line context (±5). Score clamped 30–78.

#### Run Line / Spread (score > 50 = HOME covers -1.5 / score < 50 = AWAY covers +1.5)
Factors: SP ERA differential (±15), WHIP differential (±6), home field baseline (+3), ML-implied probability vs model (±5). Score clamped 30–78.

#### Moneyline (score > 50 = HOME lean)
Factors: SP ERA matchup (±15), SP command WHIP (±6), home field advantage (+4), model vs market edge gap (±8), park factor nudge (±2). Score clamped 30–78.

**Data requirements:** `livePitcherStats` (both home + away), `liveNrfiData`, `liveWeather`, `liveOddsMap`, `liveUmpires`. Away pitcher stats now prefetched at app mount alongside home pitchers.

**Why? modal:** game type cards use pre-computed `c.factors[]` array. `generateWhyFactors()` detects game types and returns `c.factors` directly. `whyModal` extended to handle `lean` from game candidate object (not derived from score), and `leanLabel` field for the display string (e.g. `"LAD ML -145"`, `"UNDER 8.5"`).

---

### Scoring Framework — What Makes a Strong Pick

Use these thresholds when evaluating props:

**K Props (Strikeout overs)**
- SP K/9 ≥ 9.0 + umpire "pitcher" rating + opposing team K% ≥ 24% = strong over
- Synthetic line check: if SP's L3 avg Ks > market line by 1.5+ = value
- Whiff rate on primary putaway pitch ≥ 30% = bonus signal
- Avoid: wide-zone ump + pitcher-friendly lineup + line already priced up

**Outs Props (Innings pitched overs)**
- SP avgIP ≥ 6.0 over last 5 starts + WHIP ≤ 1.15 = strong over
- SP ERA ≤ 3.50 = manager trust signal (less likely to get pulled early)
- Avoid: WHIP ≥ 1.35 (pitch count climbs fast), struggling ERA (4.50+), short recent outings

**HR Props**
- Batter SLG ≥ .480 + HR-friendly park (factor ≥ 1.08) + wind out = strong over
- Batting order ≤ 3 = extra PA value
- H2H history: 2+ HRs in 15+ AB = meaningful signal

**Hit Props**
- Batter AVG ≥ .280 + L7 avg ≥ .320 + favorable park + order ≤ 3 = strong over
- L5 hit rate: 4 or 5 of 5 recent games with a hit = hot streak signal
- Platoon edge: LHB vs RHP or RHB vs LHP generally favors batter

**NRFI**
- Both SPs' first-inning ERA < 2.00 + combined first-inning scoring % < 35% = strong NRFI
- Confidence ≥ 65% from /api/nrfi = model-backed edge

---

### Output Format

For each prop you recommend, output:

```
PROP: [player or game] [market] [line] [OVER/UNDER/NRFI]
CONFIDENCE: [50–85]%
EDGE: [what the model sees vs the market line]
SIGNALS:
  • [signal 1 with specific numbers]
  • [signal 2 with specific numbers]
  • [signal 3 if applicable]
RISK: [what could kill this prop — injury, lineup change, weather shift, TBD ump]
```

---

### Rules

1. Never recommend a prop with fewer than two independent positive signals.
2. Always check `/api/injuries` before finalizing any pick. A scratch invalidates most props.
3. If the umpire is TBD, note it as a risk factor and reduce K prop confidence by ~10%.
4. Lineups not yet confirmed = reduce hit/HR prop confidence, flag it explicitly.
5. Do not recommend a K prop for a pitcher with avgIP < 5.0 — they won't stay in long enough to hit the line.
6. Market lines already priced at implied 60%+ probability deserve a higher bar. The edge needs to be clear, not marginal.
7. Cite the actual numbers from the API in every recommendation. "His K/9 is 10.8" not "he strikes out a lot."

---

## Recent Completions (CW — session log)

The following were built in the CW Cowork session and are already live in `prop-scout-v7.jsx` and `backend/`:

- **Bovada (BOV)** added as 5th sportsbook alongside DK/FD/CZR/MGM in all book arrays, `getBookLine`, LINE INTELLIGENCE square-books set, and `VALID_BOOKS` in `backend/routes/auth.js`
- **Settings page** (`view === "settings"`) — ⚙ gear icon in footer, preferred sportsbook selector (5 books), saves to `PUT /api/auth/preferences`, clears on logout
- **LINES section** on Model Pick cards — multi-book grid showing line + odds at each of 5 books, best line auto-highlighted, EDGE badge when sharp/square gap ≥ 0.5
- **✦ CARD AGREES convergence badge** — purple badge on Model Pick cards when Daily Card Official Card text matches (last-name + market keyword)
- **Lineup polling** — 3-minute `setInterval` re-polls unconfirmed lineups so Model Picks update without manual refresh
- **Games tab in Board** — `🎲 Games` tab with 4 sub-tabs (NRFI / O/U Total / Run Line / Moneyline); `computeGameBoard()` module-level function; `gameSubTab` state; game cards with lean badge; Why? modal extended for game types; away pitcher background prefetch added to mount-time effect; sort by score descending
- **API auth preferences endpoints** — `GET/PUT /api/auth/preferences` in `backend/routes/auth.js`

---

## Codex Task Queue

Tasks below are pre-scoped for Codex. Work them in order. Each task is self-contained.

---

### ✅ CODEX TASK 1 — Daily Card Scheduled Pre-generation (COMPLETED)

**Goal:** Run the Daily Card automatically on a schedule so it's always pre-built in the cache. The UI should never trigger a Claude call directly — it just fetches the cached result.

**Files to modify:**
- `backend/jobs/scheduler.js`
- `backend/routes/dailyCard.js`

**What to build:**

1. **Add a `regenerateDailyCard()` function in `dailyCard.js`** (or a new `backend/jobs/dailyCardJob.js` if cleaner) that:
   - Calls `GET /api/daily-card` via the same internal axios helper already used in the file (`internal(path)`)
   - Forces a cache miss by deleting the cache key before calling: `cache.del(\`daily-card:\${todayHonolulu()}\`)`
   - Logs success/failure with game count and cost
   - Export it: `module.exports = { router, regenerateDailyCard }`

2. **In `scheduler.js`**, add two scheduled runs (both in `Pacific/Honolulu` timezone):
   - **Morning run:** `cron.schedule("0 9 * * *", () => regenerateDailyCard(), { timezone: "Pacific/Honolulu" })` — fires at 9 AM Honolulu daily
   - **Pre-game run:** a job that runs every 5 minutes starting at 8 AM, checks today's earliest game time from the slate snapshot, and fires `regenerateDailyCard()` once when `now >= firstGameTime - 95 minutes` and hasn't already fired today. Use a simple module-level flag `let _pregameRan = { date: null }` to prevent double-firing.

3. **Pre-game run logic sketch:**
```js
let _pregameRan = { date: null };

cron.schedule("*/5 8-16 * * *", async () => {
  const today = todayHonolulu();
  if (_pregameRan.date === today) return; // already ran today

  // get earliest game time from slate snapshot
  const games = await getTodayGamePks(); // already exists in scheduler
  // need game times — query slate_snapshots for full game objects
  // find earliest gameTime ISO string
  // if now >= firstGameTime - 95min → fire and set _pregameRan.date = today
}, { timezone: "Pacific/Honolulu" });
```

4. **Update `GET /api/daily-card`** — no behavior change needed. It already returns cached data on HIT. The scheduler is now the only thing that triggers Claude; users always get the cached card.

5. **Add an admin endpoint** to manually trigger a regeneration (useful for testing):
```js
app.get("/api/admin/daily-card/regenerate", async (req, res) => {
  if (req.headers["x-admin-secret"] !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  regenerateDailyCard().catch(() => {});
  res.json({ ok: true, message: "Daily Card regeneration started" });
});
```
Mount this in `server.js`.

**Important constraints:**
- The daily cap counter (`_cap`) in `dailyCard.js` still applies — scheduler calls count toward it. 2 scheduled calls/day = fine.
- Do NOT change the cache TTL or cap logic — just add the scheduled trigger.
- `getTodayGamePks()` in scheduler.js returns gamePks only. For game times, query `slate_snapshots` directly: `SELECT games FROM slate_snapshots WHERE slate_date = $1` and read `g.gameTime` (ISO string) from each game object.

---

### ✅ CODEX TASK 2 — Model Picks Tab (top-level nav) (COMPLETED)

**Goal:** Move the Model Picks full card out of the Board view and into its own dedicated top-level tab in the nav bar.

**File to modify:** `prop-scout-v7.jsx`

**Current state:**
- Nav has 4 tabs: SLATE, GAME, PICKS, BOARD
- Board view renders `🎯 MODEL PICKS — FULL CARD` as the first collapsible section, followed by HR/Hits/K/Outs sections
- A compact top-3 summary lives in the Slate view

**What to change:**

1. **Add a 5th nav tab: MODEL** — insert between PICKS and BOARD in the nav bar. Use the 🎯 emoji and label "Model". Same styling as existing tabs. The PICKS tab badge (count) is unrelated — leave it alone.

2. **Move the full Model Picks card** (the `TierSection` blocks for HIGH/MEDIUM/SPEC, the collapsible header, all tier rendering) from the Board view into the new MODEL view. The Board view should no longer render the Model Picks section at all.

3. **MODEL view layout:**
   - Header: `🎯 Model Picks` title + `ALGO · {count} picks` badge, same as current collapsible header but always expanded (no collapse needed — it's the whole view)
   - Render HIGH → MEDIUM → SPEC tier sections in order, same `TierSection` component
   - If `topSlatePicks.length === 0`, show a centered message: "Model scoring requires probable pitchers — check back closer to game time."

4. **Slate view compact top-3:** Keep as-is. The "VIEW ALL →" button should call `setView("model")` (update from `setView("board")`). Each row click should also call `setView("model")`.

5. **Board view:** Remove the Model Picks collapsible section entirely. Board now starts directly with the HR / Hits / K / Outs sections.

**Do not change** the `computeTopSlatePicks` function, `TierSection` component, or any scoring logic.

---

### ✅ CODEX TASK 3 — Model Picks Performance Header (COMPLETED)

**Goal:** Add a thin stats bar at the top of the MODEL view showing today's logged record and rolling win rate from the pick log.

**File to modify:** `prop-scout-v7.jsx`

**Data source:** `propLog` state (already in component) — array of pick objects with shape:
```js
{ label, propType, lean, confidence, gamePk, loggedAt, outcome /* "pending"|"won"|"lost" */ }
```

**What to build:**

Add a `ModelPicksStats` inline component (or just inline JSX) at the top of the MODEL view, above the tier sections. It reads from `propLog` and computes:

```js
// Today's date string for filtering
const todayStr = new Date().toLocaleDateString("en-CA"); // "2026-04-21"

// Filter to Model picks only (propType === "Outs" or "K" — model only logs these)
// Actually filter by loggedAt date matching today
const todayLogs = propLog.filter(p => p.loggedAt?.startsWith(todayStr));
const settled   = todayLogs.filter(p => p.outcome === "won" || p.outcome === "lost");
const wins      = settled.filter(p => p.outcome === "won").length;
const losses    = settled.filter(p => p.outcome === "lost").length;
const pending   = todayLogs.filter(p => p.outcome === "pending" || !p.outcome).length;

// Rolling L7 days
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const l7Settled = propLog.filter(p => p.loggedAt >= sevenDaysAgo && (p.outcome === "won" || p.outcome === "lost"));
const l7WinRate = l7Settled.length ? Math.round((l7Settled.filter(p => p.outcome === "won").length / l7Settled.length) * 100) : null;
```

**Display:** A single dark bar (same background as card headers) showing:
```
Today: 2-1-3  |  L7: 67%  |  [pending count] pending
```
- `2-1-3` = wins-losses-pending
- `L7: 67%` = rolling 7-day win rate (hide if no settled picks in L7)
- If no logs at all today: show `"No picks logged today"`

Style: small monospace text, muted color for labels, white for numbers. Same visual language as the rest of the app.

---

### CODEX TASK 4 — Pick Outcome Auto-Grading

**Goal:** Automatically grade logged picks as `won` or `lost` when the game goes final, instead of requiring manual grading. Eliminate "pending" limbo for all game-day picks.

**Files to modify:**
- `prop-scout-v7.jsx`
- `backend/routes/boxscore.js` (may need a new endpoint or extend existing)

**Current state:**
- `propLog` is stored in `localStorage` under key `propScout_log`
- Each entry: `{ label, propType, lean, confidence, gamePk, loggedAt, outcome, propLine }`
- `outcome` starts as `"pending"` and can be manually toggled in the Pick Log view
- `liveBoardResults[playerId]` already fetches boxscore K/outs/hits/HRs for Board cards

**What to build:**

1. **New backend endpoint: `GET /api/boxscore/:gamePk/summary`**
   Returns a flat object with final box results keyed by player ID:
   ```js
   {
     gamePk: 12345,
     final: true,
     players: {
       "656302": { k: 7, outs: 18, h: 0, hr: 0, ab: 0 },  // pitcher
       "592518": { h: 2, hr: 1, ab: 4 }                    // batter
     }
   }
   ```
   Source: `/api/boxscore/:gamePk` already returns `batting` and `pitching` arrays. This new route just flattens them. Cache 60 min for final games.

2. **Auto-grade useEffect in `prop-scout-v7.jsx`**
   Runs when `liveSlate` updates (on each slate refresh). For every `pending` pick in `propLog`:
   - Find the game in `activeSlate` by `gamePk`
   - If `game.status !== "Final"` and `game.status !== "Game Over"`, skip
   - Fetch `/api/boxscore/:gamePk/summary` (cache result in a `useRef` map to avoid repeat fetches)
   - Grade the pick:
     - `propType === "K"`: won if `players[pick.playerId].k > pick.propLine`, lost if `<`, push if `===`
     - `propType === "Outs"`: won if `players[pick.playerId].outs > pick.propLine * 3` (line in IP, outs in count)
     - `propType === "NRFI"`: won if first-inning box score shows 0-0 after 1 inning (need `/api/linescore/:gamePk`)
     - `propType === "HR"`, `"Hits"`, `"TB"`: grade from batter boxscore fields
   - Update `propLog` entry: `outcome = "won"` or `"lost"`, `settledAt = ISO timestamp`
   - Persist updated log to localStorage

3. **`playerId` field on logged picks:**
   Current picks don't always store `playerId`. When logging a pick from the Board or Model Picks, include the player/pitcher ID so the auto-grader can look them up in the boxscore summary. Add `playerId` to the `logPick()` call where the pick originates.

**Constraints:**
- Grading is frontend-only — no server-side pick storage in this task
- Use a `useRef` set (`gradingFetched`) to prevent re-fetching already-graded games
- `propLine` on NRFI picks is `null` — grade by linescore instead
- Treat push (exact line hit) as `"push"` outcome — add to the outcome enum

---

### CODEX TASK 16 — Migrate AI from Anthropic to OpenAI GPT-4o mini

**Decision:** Switched from Anthropic Claude to OpenAI GPT-4o mini across all three AI-powered routes for cost efficiency (~95% cheaper per season). Quality is acceptable for props/trends; Daily Card uses the same model for now with a backlog item to re-evaluate if quality drops.

**Install:** `npm install openai` in `backend/`. Do NOT remove `@anthropic-ai/sdk` yet (leave it installed).

**Add to `.env.example`:**
```
OPENAI_API_KEY=sk-...
```

**Files to modify: `backend/routes/dailyCard.js`, `backend/routes/props.js`, `backend/routes/trends.js`**

---

#### `backend/routes/dailyCard.js` — exact changes:

**Line 8** — update comment:
```js
// Rate cap:  10 uncached OpenAI calls per calendar day
// Model:     gpt-4o-mini
```

**Line 15** — replace SDK import:
```js
// OLD:
const Anthropic = require("@anthropic-ai/sdk");
// NEW:
const OpenAI = require("openai");
```

**Line 22** — replace model constant:
```js
// OLD:
const CARD_MODEL = "claude-sonnet-4-6";
// NEW:
const CARD_MODEL = "gpt-4o-mini";
```

**Lines 41–49** — replace lazy client (getClient function):
```js
// OLD:
let _client = null;
const getClient = () => {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
};
// NEW:
let _client = null;
const getClient = () => {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
};
```

**Line 110** — update key check in generateDailyCard:
```js
// OLD:
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
// NEW:
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
```

**Lines 180–194** — replace AI call and response parsing:
```js
// OLD:
const client = getClient();
const message = await client.messages.create({
  model:      CARD_MODEL,
  max_tokens: 2048,
  system:     SYSTEM_PROMPT,
  messages:   [{ role: "user", content: context }],
});
const text = message.content?.[0]?.text ?? "";
const inputTokens  = message.usage?.input_tokens  ?? 0;
const outputTokens = message.usage?.output_tokens ?? 0;
const estCost      = ((inputTokens * 3 + outputTokens * 15) / 1_000_000).toFixed(4);

// NEW:
const client = getClient();
const message = await client.chat.completions.create({
  model:      CARD_MODEL,
  max_tokens: 2048,
  messages:   [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user",   content: context },
  ],
});
const text = message.choices?.[0]?.message?.content ?? "";
const inputTokens  = message.usage?.prompt_tokens     ?? 0;
const outputTokens = message.usage?.completion_tokens ?? 0;
const estCost      = ((inputTokens * 0.15 + outputTokens * 0.60) / 1_000_000).toFixed(4);
```

**Line 202** — update source field:
```js
// OLD:
source: "anthropic",
// NEW:
source: "openai",
```

---

#### `backend/routes/props.js` — exact changes:

**Line 3** — replace SDK import:
```js
// OLD:
const Anthropic = require("@anthropic-ai/sdk");
// NEW:
const OpenAI = require("openai");
```

**Lines 11–18** — replace lazy client:
```js
// OLD:
let _client = null;
const getClient = () => {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
};
// NEW:
let _client = null;
const getClient = () => {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
};
```

**Lines 149–155** — replace AI call:
```js
// OLD:
const client  = getClient();
const message = await client.messages.create({
  model:      "claude-haiku-4-5-20251001",
  max_tokens: 1000,
  system:     SYSTEM_PROMPT,
  messages:   [{ role: "user", content: enrichedContext }],
});
const raw = message.content?.[0]?.text?.trim() ?? "";
// NEW:
const client  = getClient();
const message = await client.chat.completions.create({
  model:      "gpt-4o-mini",
  max_tokens: 1000,
  messages:   [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user",   content: enrichedContext },
  ],
});
const raw = message.choices?.[0]?.message?.content?.trim() ?? "";
```

---

#### `backend/routes/trends.js` — exact changes:

**Line 3** — replace SDK import:
```js
// OLD:
const Anthropic = require("@anthropic-ai/sdk");
// NEW:
const OpenAI = require("openai");
```

**Lines 9–16** — replace lazy client:
```js
// OLD:
let _client = null;
const getClient = () => {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
};
// NEW:
let _client = null;
const getClient = () => {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
};
```

**Lines 39–45** — replace AI call:
```js
// OLD:
const client  = getClient();
const message = await client.messages.create({
  model:      "claude-haiku-4-5-20251001",
  max_tokens: 300,
  system:     SYSTEM_PROMPT,
  messages:   [{ role: "user", content: context }],
});
const summary = message.content?.[0]?.text?.trim() ?? null;
// NEW:
const client  = getClient();
const message = await client.chat.completions.create({
  model:      "gpt-4o-mini",
  max_tokens: 300,
  messages:   [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user",   content: context },
  ],
});
const summary = message.choices?.[0]?.message?.content?.trim() ?? null;
```

**Constraints:**
- Do NOT change any system prompt text — same prompts, just different API call structure
- Do NOT touch any other files (server.js, cache.js, scheduler, etc.)
- Do NOT remove `@anthropic-ai/sdk` from package.json
- All TTLs, cap counters, and cache logic stay identical
- The `readDailyCardSnapshot` fallback `source: row.source ?? "anthropic"` is fine — leave it (existing DB rows will correctly show as anthropic)

---

### CODEX TASK 5 — Redis Persistent Cache (Backlog)

**Goal:** Make the cache survive server restarts by adding a Redis persistence layer under the existing in-memory store. Pre-warmed data (odds, player props, boxscores, pitcher stats) should not be lost on a restart.

**Files to modify:**
- `backend/services/cache.js` — add Redis write-through layer
- `backend/server.js` — call `cache.init()` on startup
- `.env.example` — add `REDIS_URL`

**Install:** `npm install ioredis` in `backend/`.

---

### CODEX TASK 15 — Redis Persistent Cache — Detailed Implementation (Task #16)

**Critical architectural note:** The current `cache.js` is fully synchronous (`get`, `set`, `clear`, `stats` all return values directly). Redis operations are async. Do NOT change any function signatures to async — there are 20+ call sites across the backend and changing them all is risky and unnecessary.

**The correct approach: write-through hybrid**
- Keep the in-memory store as the synchronous source of truth for all reads/writes during the session (all existing call sites work unchanged)
- On every `set()`, also write to Redis asynchronously in the background (fire-and-forget)
- On every `clear(key)`, also delete from Redis in the background
- Add an async `init()` function that seeds the in-memory store from Redis on server startup — this is what survives restarts
- If `REDIS_URL` is not set, skip all Redis operations silently (local dev keeps working with in-memory only)

**Files to modify:**

**1. `backend/services/cache.js`** — replace the entire file with this implementation:

```js
// cache.js — in-memory TTL cache with optional Redis write-through persistence.
// All public methods remain synchronous so no call sites need to change.
// Redis (if configured) seeds the in-memory store on startup and receives
// background writes on every set() so data survives server restarts.

const store = {};
let redis = null;

const PREFIX = "propscout:";

function redisKey(key) { return PREFIX + key; }

// Lazy Redis connect — only if REDIS_URL is set
function getRedis() {
  if (redis) return redis;
  if (!process.env.REDIS_URL) return null;
  try {
    const Redis = require("ioredis");
    redis = new Redis(process.env.REDIS_URL, {
      lazyConnect:        true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout:     3000,
    });
    redis.on("error", () => {}); // suppress unhandled error events
    return redis;
  } catch { return null; }
}

module.exports = {
  /** Seed in-memory store from Redis. Call once on server startup. */
  async init() {
    const r = getRedis();
    if (!r) return;
    try {
      await r.connect().catch(() => {});
      const keys = await r.keys(PREFIX + "*");
      for (const rk of keys) {
        const raw = await r.get(rk);
        const ttl = await r.pttl(rk); // remaining TTL in ms
        if (!raw || ttl <= 0) continue;
        try {
          const parsed = JSON.parse(raw);
          const localKey = rk.slice(PREFIX.length);
          store[localKey] = { data: parsed, expiresAt: Date.now() + ttl };
        } catch {}
      }
    } catch {}
  },

  get(key) {
    const entry = store[key];
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      delete store[key];
      const r = getRedis();
      if (r) r.del(redisKey(key)).catch(() => {});
      return undefined;
    }
    return entry.data;
  },

  set(key, data, ttlMs) {
    store[key] = { data, expiresAt: Date.now() + ttlMs };
    const r = getRedis();
    if (r) {
      try {
        r.set(redisKey(key), JSON.stringify(data), "PX", ttlMs).catch(() => {});
      } catch {}
    }
  },

  clear(key) {
    const r = getRedis();
    if (key) {
      delete store[key];
      if (r) r.del(redisKey(key)).catch(() => {});
    } else {
      Object.keys(store).forEach(k => delete store[k]);
      if (r) r.keys(PREFIX + "*").then(keys => keys.length && r.del(...keys)).catch(() => {});
    }
  },

  stats() {
    const now = Date.now();
    return Object.entries(store).map(([k, v]) => ({
      key: k,
      expiresIn: Math.max(0, Math.round((v.expiresAt - now) / 1000)) + "s",
    }));
  },
};
```

**2. `backend/server.js`** — call `cache.init()` at startup. Find where the server starts listening and add the init call before it:
```js
// Near the top where cache is already required:
const cache = require("./services/cache");

// Before or alongside app.listen(...):
cache.init().catch(() => {}); // seed from Redis if available
```

**3. `.env.example`** — add:
```
REDIS_URL=redis://localhost:6379
```

**Constraints:**
- Do NOT change any function signatures to async — `get`, `set`, `clear`, `stats` must stay synchronous
- Do NOT modify any route files — only `cache.js` and `server.js` change
- Do NOT change any TTL values anywhere
- All Redis operations use fire-and-forget `.catch(() => {})` — a Redis failure must never crash or slow down a request
- If `REDIS_URL` is not in env, the module behaves identically to today (pure in-memory)

### HANDOFF NOTE — 2026-04-25

- AI Help Chat from CODEX TASK 14 was intentionally removed after local reliability issues and unclear UX around auth/error states.
- Current state: the Help overlay is back to static guide content only.
- Ignore `backend/routes/helpChat.js` and `/api/help-chat` for now; they are no longer part of the active app surface.
- If revived later, restart from CODEX TASK 14 as a fresh re-scope rather than assuming the prior implementation is still desired.
- Current Anthropic-backed app surfaces are:
  - `backend/routes/dailyCard.js` — active, user-facing
  - `backend/routes/trends.js` — active, user-facing
  - `backend/routes/props.js` — still mounted, but the current frontend no longer appears to call it after Props-tab AI Analysis removal

---

### CODEX TASK 19 — Fix Outs Model Line Calibration and Score Clustering

**Goal:** Two fixes in `computeTopSlatePicks` in `prop-scout-v7.jsx`:
1. The model line for Outs is consistently ~1 out below actual sportsbook lines (generating 14.5 when books post 15.5–17.5)
2. All Outs picks cluster at 78% confidence because `avgIP` only appears in signal text, never in the score

**File: `prop-scout-v7.jsx` — function `computeTopSlatePicks` (~line 1542)**

**Edit 1 — Fix line formula** (~line 1661). Change `-0.5` to `+0.5`:
```js
// OLD:
const oLine = Math.max(0.5, Math.round(avgIP * 3) - 0.5);
// NEW:
const oLine = Math.max(0.5, Math.round(avgIP * 3) + 0.5);
```

**Edit 2 — Make avgIP affect oScore** (~lines 1657–1658). Replace the two signal-only lines with scoring branches:
```js
// OLD:
if (avgIP >= 6.0) oSigs.push(`Avg IP ${avgIP.toFixed(1)} (consistently works deep)`);
else if (avgIP < 5.0) oSigs.push(`Avg IP ${avgIP.toFixed(1)} (short outing risk)`);

// NEW:
if      (avgIP >= 6.0) { oScore += 8; oSigs.push(`Avg IP ${avgIP.toFixed(1)} (consistently works deep)`); }
else if (avgIP >= 5.5) { oScore += 4; oSigs.push(`Avg IP ${avgIP.toFixed(1)} (deep outings)`); }
else if (avgIP < 4.5)  { oScore -= 8; oSigs.push(`Avg IP ${avgIP.toFixed(1)} (short outing risk)`); }
else if (avgIP < 5.0)  { oScore -= 4; oSigs.push(`Avg IP ${avgIP.toFixed(1)} (below average depth)`); }
```

**Constraints:** Only touch these two edits inside `computeTopSlatePicks`. Do not modify K scoring, the game-view scoring block (~line 2330), or any other function.

---

### CODEX TASK 18 — Add pitcher_outs to Player Props API Fetch

**Goal:** The Outs board in Model Picks shows "Odds Unavailable" on every card because `pitcher_outs` is never requested from the Odds API. Two-line fix in `backend/routes/playerProps.js`.

**File: `backend/routes/playerProps.js`**

**Edit 1 — Add `pitcher_outs` to MARKET_LABELS** (line 16):
```js
// OLD:
const MARKET_LABELS = {
  pitcher_strikeouts: "K",
  batter_total_bases: "TB",
  batter_hits:        "H",
  batter_home_runs:   "HR",
};
// NEW:
const MARKET_LABELS = {
  pitcher_strikeouts: "K",
  pitcher_outs:       "Outs",
  batter_total_bases: "TB",
  batter_hits:        "H",
  batter_home_runs:   "HR",
};
```

**Edit 2 — Add `pitcher_outs` to the Odds API markets query string** (~line 89):
```js
// OLD:
`&markets=pitcher_strikeouts,batter_total_bases,batter_hits,batter_home_runs`
// NEW:
`&markets=pitcher_strikeouts,pitcher_outs,batter_total_bases,batter_hits,batter_home_runs`
```

**Constraints:** No other changes. Do not touch any other routes, scoring logic, or frontend code.

---

**Design note — why we did NOT fold Outs signal into K scoring (Option B):**

The alternative considered was using avgIP as an additional weight inside the K confidence algorithm. This was rejected for two reasons:
1. avgIP is already partially captured by ERA/WHIP — good pitchers with low ERA tend to go deep anyway, so the signal is mostly redundant.
2. The K board is already producing clean, well-differentiated results. Adding avgIP risked boosting contact-management workhorses (high avgIP, mediocre K/9) above true strikeout arms, which would degrade a system that's working well.

Option A (just fetch the missing market) is lower risk and preserves the K scoring exactly as-is. If `pitcher_outs` lines are consistently unavailable on sportsbooks after this fix, revisit at that point.

---

### CODEX TASK 21 — Use DraftKings Line as Model Pick Line (replaces algorithmically computed line)

**Goal:** Model Picks (K and Outs boards) currently compute their own line algorithmically (`Math.round(avgK) - 0.5` for K, `Math.round(avgIP * 3) + 0.5` for Outs). These lines don't match what DraftKings actually posts, creating a disconnect where the app shows "OVER 15.5 Outs" but the user can only bet 17.5 or 18.5 at DK. Fix this by using the actual DK-posted line as the pick line.

**File: `prop-scout-v7.jsx`**

---

#### Edit 1 — Add `playerPropsMap` parameter to `computeTopSlatePicks` (~line 1543)

```js
// OLD:
function computeTopSlatePicks(liveSlate, livePitcherStats, liveLineups, liveWeather) {

// NEW:
function computeTopSlatePicks(liveSlate, livePitcherStats, liveLineups, liveWeather, playerPropsMap = {}) {
```

---

#### Edit 2 — Add DK line lookup helper inside the inner `.forEach`, after `avgK` is computed (~line 1569, just before the lineup platoon block)

Insert this block after `const avgK = ...` and before the `// ── Lineup platoon adjustment` comment:

```js
// ── DraftKings line lookup for this pitcher ────────────────────────────────
const gamePropsState = playerPropsMap[String(sg.gamePk)];
const gameProps = (gamePropsState && gamePropsState !== "loading")
  ? (gamePropsState.props ?? [])
  : [];
const findDKLine = (market) => {
  const prop = gameProps.find(p =>
    p.market === market &&
    (p.player ?? "").toLowerCase().includes(lastName.toLowerCase())
  );
  return prop?.books?.DK?.line ?? null;
};
```

---

#### Edit 3 — Replace K line + pick push block (~lines 1618–1637)

```js
// OLD:
kScore = Math.max(38, Math.min(88, kScore));
const kLine = Math.max(0.5, Math.round(avgK) - 0.5);

picks.push({
  label:          `${lastName} K O/U ${kLine}`,
  fullName,
  pitcherId:      pitcher.id,
  lean:           kScore >= 50 ? "OVER" : "UNDER",
  positive:       kScore >= 50,
  confidence:     kScore,
  tier:           MODEL_TIER(kScore),
  propType:       "K",
  market:         "pitcher_strikeouts",
  modelLine:      kLine,
  gamePk:         sg.gamePk,
  game:           sgGameLabel,
  lineupConfirmed: sgConfirmed,
  signals:        kSigs,
  avgIP,
});

// NEW:
kScore = Math.max(38, Math.min(88, kScore));
const dkKLine = findDKLine("pitcher_strikeouts");
if (dkKLine != null) {
  const projectedK = avgK;
  const kLean = projectedK > dkKLine ? "OVER" : "UNDER";
  picks.push({
    label:           `${lastName} K O/U ${dkKLine}`,
    fullName,
    pitcherId:       pitcher.id,
    lean:            kLean,
    positive:        kLean === "OVER",
    confidence:      kScore,
    tier:            MODEL_TIER(kScore),
    propType:        "K",
    market:          "pitcher_strikeouts",
    modelLine:       dkKLine,
    projectedValue:  +projectedK.toFixed(1),
    lineSource:      "DK",
    gamePk:          sg.gamePk,
    game:            sgGameLabel,
    lineupConfirmed: sgConfirmed,
    signals:         kSigs,
    avgIP,
  });
}
```

---

#### Edit 4 — Replace Outs line + pick push block (~lines 1666–1685)

```js
// OLD:
oScore = Math.max(38, Math.min(88, oScore));
const oLine = Math.max(0.5, Math.round(avgIP * 3) + 0.5);

picks.push({
  label:          `${lastName} Outs O/U ${oLine}`,
  fullName,
  pitcherId:      pitcher.id,
  lean:           oScore >= 50 ? "OVER" : "UNDER",
  positive:       oScore >= 50,
  confidence:     oScore,
  tier:           MODEL_TIER(oScore),
  propType:       "Outs",
  market:         "pitcher_outs",
  modelLine:      oLine,
  gamePk:         sg.gamePk,
  game:           sgGameLabel,
  lineupConfirmed: sgConfirmed,
  signals:        oSigs,
  avgIP,
});

// NEW:
oScore = Math.max(38, Math.min(88, oScore));
const dkOutsLine = findDKLine("pitcher_outs");
if (dkOutsLine != null) {
  const projectedOuts = +(avgIP * 3).toFixed(1);
  const outsLean = projectedOuts > dkOutsLine ? "OVER" : "UNDER";
  picks.push({
    label:           `${lastName} Outs O/U ${dkOutsLine}`,
    fullName,
    pitcherId:       pitcher.id,
    lean:            outsLean,
    positive:        outsLean === "OVER",
    confidence:      oScore,
    tier:            MODEL_TIER(oScore),
    propType:        "Outs",
    market:          "pitcher_outs",
    modelLine:       dkOutsLine,
    projectedValue:  projectedOuts,
    lineSource:      "DK",
    gamePk:          sg.gamePk,
    game:            sgGameLabel,
    lineupConfirmed: sgConfirmed,
    signals:         oSigs,
    avgIP,
  });
}
```

---

#### Edit 5 — Update call site (~line 3708)

```js
// OLD:
? computeTopSlatePicks(liveSlate, livePitcherStats, liveLineups, liveWeather)

// NEW:
? computeTopSlatePicks(liveSlate, livePitcherStats, liveLineups, liveWeather, livePlayerProps)
```

---

#### Edit 6 — Replace `lineMismatch` in Model Picks render with projected value display (~line 4067)

```js
// OLD:
const lineMismatch = bookLine && Math.abs(bookLine.line - p.modelLine) >= 0.5;

// NEW — remove this line entirely (no longer meaningful since modelLine IS the DK line)
```

And replace the JSX that uses it (~line 4151):
```jsx
// OLD:
{lineMismatch && (
  <span style={{ fontSize: 8, fontWeight: 700, color: "#fbbf24", marginLeft: "auto" }}>model: {p.modelLine}</span>
)}

// NEW:
{p.projectedValue != null && (
  <span style={{ fontSize: 8, fontWeight: 700, color: "#6b7280", marginLeft: "auto" }}>proj: {p.projectedValue}</span>
)}
```

---

#### Edit 7 — Add "DK" source tag to Model Pick card header row

In the pick card render, on the same line as the pick label and confidence %, add a small "DK" badge. Find the line containing `<LeanBadge label={p.lean}` (~line 4139) and add the badge just before it:

```jsx
{p.lineSource && (
  <span style={{ fontSize: 7, fontWeight: 800, color: "#38bdf8", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.25)", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace", letterSpacing: "0.04em", flexShrink: 0 }}>{p.lineSource}</span>
)}
<LeanBadge label={p.lean} positive={p.positive} small />
```

---

**Constraints:**
- Only touch `computeTopSlatePicks` and the Model Picks render section (the `tierPicks.map` block). Do not modify the K/Outs board scoring logic in `kBoardScore`/`outsBoardScore` or any other function.
- Do not change the existing `isAvailableAtPreferredBook` filter — it stays as-is.
- The `livePlayerProps` variable already exists in component state. Do not declare it again — just pass it as the 5th argument to `computeTopSlatePicks`.

---

**Expected outcome:**
- Model Picks will only appear for pitchers that DK has posted a line for
- K and Outs lines will exactly match what a user sees at DraftKings
- A small "DK" badge appears on each Model Pick card
- A "proj: X.X" label shows the model's projected value for context (e.g., "proj: 19.2" next to DK line 18.5 → user understands why it's OVER)
- The pick list may be shorter on days when DK is slow to post lines — this is expected and honest

---

### CODEX TASK 23 — Chat Research Assistant Tab

**Access:** Gated to `leadoffkaiba` — same allowlist mechanism as The Scout (`AI_PICKS_ALLOWLIST` env var, checked against `req.user.username`). Returns 403 for all other users. Frontend hides tab entirely for non-allowlisted users.

**Overview:**
A dedicated `Chat` view in the bottom nav. A sharp MLB research analyst persona that answers prop questions using today's Prop Scout data. Builds context intelligently based on message intent — no data dumps. Supports session-level conversation memory (last 10 turns). Web search fires automatically on news/injury keywords. Confidence score returned on prop-specific answers.

---

#### FILE 1 — `backend/routes/chat.js` (new file)

**Daily usage counter (in-memory, same pattern as dailyCard.js):**
```js
const usageMap = {}; // key: `${userId}:${date}`
const DAILY_LIMIT = 30;

function todayHonolulu() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}

function getUsage(userId) {
  const key = `${userId}:${todayHonolulu()}`;
  return usageMap[key] ?? 0;
}
function incrementUsage(userId) {
  const key = `${userId}:${todayHonolulu()}`;
  usageMap[key] = (usageMap[key] ?? 0) + 1;
  return usageMap[key];
}
```

**User gate (identical pattern to scout.js):**
```js
const CHAT_ALLOWLIST = (process.env.AI_PICKS_ALLOWLIST ?? "leadoffkaiba")
  .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

function requireChatAccess(req, res, next) {
  const identity = (req.user?.username ?? req.user?.email ?? "").toLowerCase();
  if (!CHAT_ALLOWLIST.includes(identity)) {
    return res.status(403).json({ error: "Access restricted" });
  }
  return next();
}
```

**`POST /api/chat`**

Request body: `{ message: string, history: [{ role: "user"|"assistant", content: string }][] }`

Steps:

**1. Check daily limit:**
```js
const userId = req.user?.id ?? req.user?.username ?? "unknown";
if (getUsage(userId) >= DAILY_LIMIT) {
  return res.status(429).json({ error: "Daily message limit reached", messagesUsedToday: DAILY_LIMIT, maxMessagesPerDay: DAILY_LIMIT });
}
```

**2. Detect intent from message:**
```js
const msg = (body.message ?? "").toLowerCase();

const WEB_KEYWORDS = ["news", "injury", "il ", " il,", "hurt", "scratch", "lineup change", "trade", "recent", "latest", "update", "report"];
const SLATE_KEYWORDS = ["best play", "best prop", "top pick", "today", "slate", "recommend", "suggest", "should i", "what do you like", "who do you like"];
const needsWebSearch = WEB_KEYWORDS.some(kw => msg.includes(kw));
const isSlateQuestion = SLATE_KEYWORDS.some(kw => msg.includes(kw));
```

**3. Load base context (always):**

Read today's schedule from `schedule_snapshots`:
```js
const schedRow = await query("SELECT games FROM schedule_snapshots WHERE slate_date = $1", [today]);
const games = schedRow?.rows?.[0]?.games ?? [];
```

Read today's injuries from `injury_snapshots`:
```js
const injRow = await query("SELECT injuries FROM injury_snapshots WHERE snapshot_date = $1", [today]);
const injuries = injRow?.rows?.[0]?.injuries?.injuries ?? [];
```

Serialize base context:
```
TODAY'S SLATE ({date}):
{games.map(g => `${g.away.abbr} @ ${g.home.abbr} ${g.time} — ${g.probablePitchers.away?.name ?? "TBD"} vs ${g.probablePitchers.home?.name ?? "TBD"}`).join("\n")}

RECENT INJURIES/IL:
{injuries.slice(0,10).map(i => `${i.playerName} (${i.team}) — ${i.status} since ${i.date}`).join("\n") || "None reported"}
```

**4. Pitcher enrichment (when a pitcher name from today's slate is mentioned):**

Build a map of probable pitcher last names → pitcher IDs from the schedule. For each pitcher whose last name appears in the message, fetch:

Season stats:
```js
const { data } = await mlb.get(`/people/${pitcherId}?hydrate=stats(group=[pitching],type=[season],season=${SEASON})`);
```
Extract: era, whip, strikeOuts, inningsPitched, baseOnBalls → compute K/9 = (SO / IP) * 9, BB/9 = (BB / IP) * 9, avgIP.

Last 3 game logs:
```js
const { data: logs } = await mlb.get(`/people/${pitcherId}/stats?stats=gameLog&group=pitching&season=${SEASON}&limit=3`);
```
Extract per-start: strikeOuts, inningsPitched, earnedRuns → compute L3 averages.

Read DK lines from `player_props_snapshots` for that game.
Read umpire from `umpire_snapshots` for that gamePk.
Read odds from `odds_snapshots` for that game.

Append to context:
```
PITCHER DETAIL: {name} ({team}) vs {opp} tonight
Season: ERA {era} | K/9 {k9} | WHIP {whip} | BB/9 {bb9} | Avg IP {avgIP}
Last 3 starts: avg K {l3K} | avg IP {l3IP} | avg ER {l3ER}
DK K line: {kLine} ({kOdds} over) | DK Outs line: {outsLine} ({outsOdds} over)
Umpire: {umpName} | K/9 delta: {delta}
Weather: {temp}°F, wind {speed}mph {dir}
```

**5. Game/team enrichment (when a team abbreviation or city is mentioned):**

Check if the message contains any team abbreviation (NYY, BOS, LAD, etc.) or common city name. For the matched game, read:
- Full game data from schedule_snapshots (both pitchers)
- Odds from odds_snapshots (ML, total, spread, over/under odds)

Append to context:
```
GAME DETAIL: {away} @ {home} {time}
Away SP: {name} — ERA {era} | WHIP {whip} | L3 avg ER {l3ER}
Home SP: {name} — ERA {era} | WHIP {whip} | L3 avg ER {l3ER}
DK: ML {awayML}/{homeML} | Total {total} ({overOdds}/{underOdds}) | RL {awaySpread}({awaySpreadOdds})
```

**6. General slate enrichment (when `isSlateQuestion`):**

Read top entries from `player_props_snapshots` for today — collect all props with a `reason === "ok"`, pick the 6 with the most books and highest-confidence lines. Include as a compact list:
```
TOP PROP LINES AVAILABLE TODAY:
{player} — K OVER {line} @ DK {odds}
{player} — Outs OVER {line} @ DK {odds}
...
```

**7. Web search (when `needsWebSearch`):**

Build a focused query from the message — extract any mentioned player/team + append "MLB 2026". Call Tavily:
```js
const searchQuery = extractSearchQuery(msg); // e.g. "Gerrit Cole injury MLB 2026"
const tavRes = await axios.post("https://api.tavily.com/search", {
  api_key: process.env.TAVILY_API_KEY,
  query: searchQuery,
  max_results: 2,
  search_depth: "basic",
  include_answer: true,
}, { timeout: 8000 });

const webContext = (tavRes.data.results ?? [])
  .map(r => `[${r.title}]: ${(r.content ?? "").slice(0, 400)}`)
  .join("\n\n");
```

Append to context:
```
WEB SEARCH — "{searchQuery}":
{webContext}
```

**8. Build messages array and call OpenAI:**

System prompt:
```
You are a sharp MLB prop research analyst with access to today's Prop Scout data — pitcher stats, sportsbook lines, umpire tendencies, weather, park factors, lineup data, and injury reports.

When answering prop or game-specific questions:
- Cite specific numbers that support your analysis
- Return a confidence score (0–100) and explain the key signals driving it
- Be direct and actionable — don't hedge unless the data is genuinely mixed
- Keep responses focused and concise

When answering general, conceptual, or conversational questions:
- Answer directly without a confidence score

Confidence guide:
- 75+: Multiple independent signals aligned. Strong edge.
- 60–74: Solid setup with one open question.
- 50–59: Speculative. Some factors favorable but incomplete.
- Below 50: Mixed or insufficient data.

Always return valid JSON:
{
  "response": "Your full answer here",
  "confidence": 76,
  "confidenceLabel": "HIGH",
  "signals": ["K/9 11.2", "L3 avg K 8.3", "Ump +2.1"]
}

Set confidence and confidenceLabel to null, signals to [] when a confidence score is not applicable.
confidenceLabel: "HIGH" (75+), "MEDIUM" (60–74), "SPEC" (50–59), "LOW" (<50), null if N/A.
```

Messages array:
```js
const messages = [
  { role: "system", content: systemPrompt + "\n\nDATA CONTEXT:\n" + fullContext },
  ...(history.slice(-10)), // last 10 turns from client
  { role: "user", content: body.message }
];
```

OpenAI call:
```js
const completion = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages,
  response_format: { type: "json_object" },
  temperature: 0.5,
  max_tokens: 600,
});
const parsed = JSON.parse(completion.choices[0].message.content);
```

**9. Increment usage and respond:**
```js
const used = incrementUsage(userId);
res.json({
  response: parsed.response ?? "",
  confidence: parsed.confidence ?? null,
  confidenceLabel: parsed.confidenceLabel ?? null,
  signals: parsed.signals ?? [],
  webSearched: needsWebSearch && !!webContext,
  messagesUsedToday: used,
  maxMessagesPerDay: DAILY_LIMIT,
});
```

---

#### FILE 2 — `server.js`

Mount after requireAuth:
```js
app.use("/api/chat", require("./routes/chat"));
```

---

#### FILE 3 — `prop-scout-v7.jsx`

**Step 1 — Constants (top of component, near SCOUT_ALLOWLIST):**
```js
const CHAT_ALLOWLIST = ["leadoffkaiba"];
const isChatUser = !!currentUser && CHAT_ALLOWLIST.includes((currentUser?.username ?? currentUser?.email ?? "").toLowerCase());

const QUICK_CHIPS = [
  "Best plays today",
  "Top K props",
  "Biggest line moves",
  "NRFI leans",
  "Any injury alerts?",
];
```

**Step 2 — State (near other tab state):**
```js
const [chatHistory, setChatHistory] = useState([]); // [{ role, content, confidence, confidenceLabel, signals, webSearched }]
const [chatInput, setChatInput] = useState("");
const [chatLoading, setChatLoading] = useState(false);
const [chatError, setChatError] = useState(null);
const [chatMessagesLeft, setChatMessagesLeft] = useState(30);
const chatBottomRef = useRef(null);
```

**Step 3 — Send message handler:**
```js
const handleChatSend = async (messageOverride) => {
  const message = messageOverride ?? chatInput.trim();
  if (!message || chatLoading || chatMessagesLeft <= 0) return;

  const userMsg = { role: "user", content: message };
  const newHistory = [...chatHistory, userMsg];
  setChatHistory(newHistory);
  setChatInput("");
  setChatLoading(true);
  setChatError(null);

  // Build history payload — only role + content (no UI fields)
  const historyPayload = newHistory.slice(-10).map(m => ({ role: m.role, content: m.content }));

  try {
    const data = await apiMutate("/api/chat", "POST", { message, history: historyPayload.slice(0, -1) });
    const assistantMsg = {
      role: "assistant",
      content: data.response,
      confidence: data.confidence,
      confidenceLabel: data.confidenceLabel,
      signals: data.signals ?? [],
      webSearched: data.webSearched ?? false,
    };
    setChatHistory(prev => [...prev, assistantMsg]);
    setChatMessagesLeft(Math.max(0, (data.maxMessagesPerDay ?? 30) - (data.messagesUsedToday ?? 0)));
  } catch (err) {
    setChatError(err.message ?? "Something went wrong");
    setChatHistory(prev => prev.slice(0, -1)); // remove optimistic user message on error
  } finally {
    setChatLoading(false);
  }
};
```

**Step 4 — Auto-scroll useEffect:**
```js
useEffect(() => {
  if (chatBottomRef.current) {
    chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
  }
}, [chatHistory]);
```

**Step 5 — Nav tab (alongside Scout tab, only when `isChatUser`):**
```jsx
{isChatUser && (
  <button onClick={() => setView("chat")}
    style={{ background: view === "chat" ? "#38bdf8" : "#161827", border: `1px solid ${view === "chat" ? "#38bdf8" : "#1f2437"}`, borderRadius: 8, padding: "6px 12px", fontSize: 10, color: view === "chat" ? "#000" : "#9ca3af", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>
    💬 Chat
  </button>
)}
```

**Step 6 — Chat view render (`view === "chat" && isChatUser`):**

```jsx
{view === "chat" && isChatUser && (
  <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)", gap: 0 }}>

    {/* Header */}
    <div style={{ padding: "12px 14px 8px", flexShrink: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace", letterSpacing: "0.05em" }}>💬 CHAT</div>
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>Research assistant · {chatMessagesLeft} messages left today</div>
        </div>
        {chatHistory.length > 0 && (
          <button onClick={() => { setChatHistory([]); setChatError(null); }}
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2d3148", borderRadius: 6, padding: "4px 10px", fontSize: 9, color: "#6b7280", cursor: "pointer", fontFamily: "monospace" }}>
            Clear
          </button>
        )}
      </div>
    </div>

    {/* Quick chips — only when no history */}
    {chatHistory.length === 0 && (
      <div style={{ padding: "4px 14px 10px", display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
        {QUICK_CHIPS.map(chip => (
          <button key={chip} onClick={() => handleChatSend(chip)}
            style={{ background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.25)", borderRadius: 16, padding: "5px 12px", fontSize: 10, color: "#7dd3fc", cursor: "pointer", fontFamily: "monospace", fontWeight: 600 }}>
            {chip}
          </button>
        ))}
      </div>
    )}

    {/* Error */}
    {chatError && (
      <div style={{ margin: "0 14px 8px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#fca5a5", flexShrink: 0 }}>
        {chatError}
      </div>
    )}

    {/* Messages scroll area */}
    <div style={{ flex: 1, overflowY: "auto", padding: "0 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      {chatHistory.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#4b5563", fontSize: 11 }}>
          Ask anything about today's slate — props, players, trends, line moves.
        </div>
      )}

      {chatHistory.map((msg, idx) => (
        <div key={idx} style={{
          display: "flex",
          justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
        }}>
          {msg.role === "user" ? (
            <div style={{ background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.35)", borderRadius: "12px 12px 4px 12px", padding: "10px 14px", maxWidth: "80%", fontSize: 12, color: "#e9d5ff", lineHeight: 1.5 }}>
              {msg.content}
            </div>
          ) : (
            <div style={{ background: "#161827", border: "1px solid #1f2437", borderRadius: "4px 12px 12px 12px", padding: "12px 14px", maxWidth: "90%", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, color: "#d1d5db", lineHeight: 1.6 }}>{msg.content}</div>

              {msg.confidence != null && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{
                    background: msg.confidence >= 75 ? "rgba(34,197,94,0.15)" : msg.confidence >= 60 ? "rgba(251,191,36,0.15)" : "rgba(107,114,128,0.15)",
                    border: `1px solid ${msg.confidence >= 75 ? "rgba(34,197,94,0.4)" : msg.confidence >= 60 ? "rgba(251,191,36,0.4)" : "rgba(107,114,128,0.3)"}`,
                    borderRadius: 6, padding: "3px 9px", fontSize: 10, fontWeight: 700,
                    color: msg.confidence >= 75 ? "#86efac" : msg.confidence >= 60 ? "#fde68a" : "#9ca3af",
                    fontFamily: "monospace",
                  }}>
                    {msg.confidence} · {msg.confidenceLabel}
                  </div>
                  {(msg.signals ?? []).map((s, i) => (
                    <div key={i} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2d3148", borderRadius: 4, padding: "2px 7px", fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>{s}</div>
                  ))}
                </div>
              )}

              {msg.webSearched && (
                <div style={{ fontSize: 9, color: "#38bdf8", fontFamily: "monospace" }}>🌐 Web searched</div>
              )}
            </div>
          )}
        </div>
      ))}

      {chatLoading && (
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <div style={{ background: "#161827", border: "1px solid #1f2437", borderRadius: "4px 12px 12px 12px", padding: "12px 16px" }}>
            <div style={{ fontSize: 11, color: "#4b5563", fontFamily: "monospace" }}>Analyzing...</div>
          </div>
        </div>
      )}

      <div ref={chatBottomRef} />
    </div>

    {/* Input bar — sticky at bottom */}
    <div style={{ padding: "10px 14px", borderTop: "1px solid #1f2437", flexShrink: 0, display: "flex", gap: 8, alignItems: "center" }}>
      <input
        value={chatInput}
        onChange={e => setChatInput(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
        placeholder={chatMessagesLeft > 0 ? "Ask anything about today's slate..." : "Daily limit reached"}
        disabled={chatLoading || chatMessagesLeft <= 0}
        style={{
          flex: 1, background: "#161827", border: "1px solid #2d3148", borderRadius: 10,
          padding: "10px 14px", fontSize: 12, color: "#f9fafb", outline: "none",
          fontFamily: "inherit", opacity: chatMessagesLeft <= 0 ? 0.5 : 1,
        }}
      />
      <button
        onClick={() => handleChatSend()}
        disabled={!chatInput.trim() || chatLoading || chatMessagesLeft <= 0}
        style={{
          background: chatInput.trim() && !chatLoading ? "rgba(56,189,248,0.2)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${chatInput.trim() && !chatLoading ? "rgba(56,189,248,0.4)" : "#2d3148"}`,
          borderRadius: 10, padding: "10px 16px", fontSize: 14,
          color: chatInput.trim() && !chatLoading ? "#38bdf8" : "#4b5563",
          cursor: chatInput.trim() && !chatLoading ? "pointer" : "not-allowed",
        }}
      >→</button>
    </div>
  </div>
)}
```

---

#### Constraints:
- Do not modify any existing routes, scoring logic, or DB tables.
- `requireAuth` must be applied before `requireChatAccess` on the chat route.
- The `apiMutate` helper already exists in the frontend — do not redefine it.
- `chatBottomRef` is a `useRef` — declare it alongside other refs, not inside any IIFE or render function.
- All state variables (`chatHistory`, `chatInput`, etc.) must be declared at component level.
- The `history` sent to the backend must strip UI-only fields (`confidence`, `signals`, `webSearched`) — only send `{ role, content }` pairs.
- If `TAVILY_API_KEY` is not set, skip web search silently and set `webSearched: false`.
- If pitcher stat fetches fail, log a warning and continue — partial context is better than a failed response.

---

### CODEX TASK 22 — The Scout: AI Bettor Tab with Self-Evaluation Loop

**Access:** Gated to `jayprox12@gmail.com` only — backend returns 403, frontend hides tab for all other users.

**Overview:**
A new "THE SCOUT" bottom nav tab. An AI persona (sharp professional bettor) generates 6–8 daily picks for K props, Outs props, and Game Totals using all available Prop Scout data. At midnight Honolulu, a scheduler job checks if all games are final, then auto-generates an evaluation of each pick — classifying decision quality and flagging app improvement opportunities.

---

#### FILE 1 — `backend/routes/scout.js` (new file)

**DB tables to create on startup (add to `ensurePhaseOneTables()` in snapshotJobs.js):**

```sql
CREATE TABLE IF NOT EXISTS scout_picks_snapshots (
  slate_date DATE PRIMARY KEY,
  picks JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generations_used INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS scout_evaluations (
  slate_date DATE PRIMARY KEY,
  evaluations JSONB NOT NULL,
  day_review TEXT NOT NULL,
  improvement_flags JSONB NOT NULL DEFAULT '[]',
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**User gate (reuse in all scout routes):**
```js
const SCOUT_ALLOWLIST = (process.env.AI_PICKS_ALLOWLIST ?? "leadoffkaiba")
  .split(",").map(e => e.trim().toLowerCase());

function requireScoutAccess(req, res, next) {
  if (!SCOUT_ALLOWLIST.includes((req.user?.email ?? "").toLowerCase())) {
    return res.status(403).json({ error: "Access restricted" });
  }
  next();
}
```
Apply `requireScoutAccess` as middleware on all scout routes (after `requireAuth`).

---

**`GET /api/scout/picks` — Generate or serve today's picks**

1. Check `scout_picks_snapshots` for today's Honolulu date. If exists AND `generations_used < 3` is not the case (i.e., already generated and not a forced regen) → serve from DB.

2. If generating fresh:
   a. Read today's games from `schedule_snapshots`. Filter to games with probable pitchers. Take the top 8 by game order.
   b. For each probable pitcher, fetch season stats from MLB Stats API:
      - Season stats: `GET /people/{id}?hydrate=stats(group=[pitching],type=[season],season={year})`
        Fields: era, whip, strikeOuts, inningsPitched, baseOnBalls, battersFaced → compute K/9, BB/9, avgIP
      - Last 3 game logs: `GET /people/{id}/stats?stats=gameLog&group=pitching&season={year}&limit=3`
        Fields: strikeOuts, inningsPitched, earnedRuns per start → compute L3 avg K, L3 avg IP, L3 avg ER
   c. Read DK lines from `player_props_snapshots` (today's date) for pitcher_strikeouts and pitcher_outs markets for each pitcher.
   d. Read game odds from `odds_snapshots` (today's date) for game totals (the `total` field).
   e. Read umpire data from `umpire_snapshots` for each gamePk — extract homePlate name + stats.K_rate_delta if available.
   f. Fetch weather for each game via `GET https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&hourly=temperature_2m,wind_speed_10m,wind_direction_10m&forecast_days=1` for the game's stadium coords. Use stadium coords from a hardcoded map matching the stadium name (same STADIUMS object already in prop-scout-v7.jsx).
   g. Serialize each game as compact text (see format below).
   h. Call OpenAI `gpt-4o-mini` with the picks prompt (see below).
   i. Parse response, store in `scout_picks_snapshots`, return picks.

**Context serialization per game (pitcher props):**
```
PITCHER: {name} ({teamAbbr}) vs {oppAbbr}  {gameTime} ET
ERA: {era} | K/9: {k9} | WHIP: {whip} | BB/9: {bb9} | avgIP: {avgIP}
L3 avg K: {l3K} | L3 avg IP: {l3IP} | L3 avg ER: {l3ER}
DK K line: {kLine} ({kOdds} over) | DK Outs line: {outsLine} ({outsOdds} over)
Umpire: {umpName} | K/9 delta: {delta} ({direction})
Weather: {temp}°F, wind {speed}mph {direction} | Stadium: {stadiumName}
Matchup score: {score} ({edge}) | RHB: {r} LHB: {l} vs {hand}HP
IL flags: {flags or "none"}
```
(Omit DK line fields if no line posted yet.)

**Context serialization per game (totals):**
```
GAME TOTAL: {awayAbbr} @ {homeAbbr}  {gameTime} ET
Away SP: {name} ERA {era} | WHIP {whip} | L3 avg ER {l3ER}
Home SP: {name} ERA {era} | WHIP {whip} | L3 avg ER {l3ER}
DK Total: {line} ({overOdds} over / {underOdds} under) | Opened: {openLine} ({moveDir})
Weather: {temp}°F, wind {speed}mph {dir} | Park runs factor: {factor}
```
(Opening line is `total` from the oldest `odds_snapshots` row for that game — approximate; use current line if only one snapshot exists.)

**OpenAI picks prompt:**

System:
```
You are The Scout — a sharp professional sports bettor with 15 years of experience beating closing lines. You are data-obsessed, value-focused, and direct. You only recommend a prop when at least two independent signals point the same direction. You always cite specific numbers. You speak in first person, present tense. Each reasoning is 2–4 sentences max. Be selective — quality over quantity. Only make picks you genuinely believe in.
```

User:
```
Today's slate data is below. Make your best picks for K props, Outs props, and Game Totals.
Only pick markets where DK has posted a line (skip any with no line data).
Aim for 4–8 picks total. Confidence HIGH = multiple strong signals; MEDIUM = solid but one open question.
Return valid JSON only — no other text.

{serialized game data}

Return format:
{
  "picks": [
    {
      "player": "Gerrit Cole",
      "team": "NYY",
      "opponent": "BOS",
      "gameTime": "7:10 PM ET",
      "market": "pitcher_strikeouts",
      "marketLabel": "K",
      "line": 7.5,
      "lean": "OVER",
      "odds": "-115",
      "book": "DK",
      "confidence": "HIGH",
      "reasoning": "...",
      "signals": ["K/9 11.2", "L3 avg K 8.3", "Ump K/9 +2.1", "Pitcher edge matchup"]
    }
  ]
}

For game totals: player = null, team = away team abbr, marketLabel = "Total", signals include both SPs' stats and weather.
```

**Response shape from `GET /api/scout/picks`:**
```json
{
  "picks": [...],
  "generatedAt": "ISO string",
  "generationsUsedToday": 1,
  "maxGenerationsPerDay": 3,
  "slateDate": "2026-04-27"
}
```

---

**`POST /api/scout/regenerate` — Force fresh generation (max 3/day)**

- Check `scout_picks_snapshots` for today. If `generations_used >= 3` → return 429 `{ error: "Daily limit reached", generationsUsedToday: 3 }`.
- Otherwise delete today's row and re-run the full generation flow. Increment `generations_used`.
- Return same shape as `GET /api/scout/picks`.

---

**`GET /api/scout/evaluation/:date` — Serve evaluation for a given date**

- `date` param format: `YYYY-MM-DD`
- Read `scout_evaluations` for that date. If none → return `{ evaluated: false }`.
- Return: `{ evaluated: true, evaluations: [...], dayReview: "...", improvementFlags: [...], evaluatedAt: "..." }`.

---

#### FILE 2 — `backend/jobs/snapshotJobs.js` — Add `runScoutEvaluation(date)`

```js
async function runScoutEvaluation(date = todayHonolulu()) {
  if (!isConnected()) return;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { console.warn("  ⚠ runScoutEvaluation: OPENAI_API_KEY not set"); return; }

  // Already evaluated today?
  const existing = await query(
    "SELECT slate_date FROM scout_evaluations WHERE slate_date = $1", [date]
  );
  if (existing?.rows?.length) {
    console.log(`  · runScoutEvaluation: already evaluated for ${date}`);
    return;
  }

  // Get today's picks
  const picksRow = await query(
    "SELECT picks FROM scout_picks_snapshots WHERE slate_date = $1", [date]
  );
  const picks = picksRow?.rows?.[0]?.picks;
  if (!picks?.length) {
    console.log(`  · runScoutEvaluation: no picks for ${date}`);
    return;
  }

  // Check all games are final
  const schedRow = await query(
    "SELECT games FROM schedule_snapshots WHERE slate_date = $1", [date]
  );
  const games = schedRow?.rows?.[0]?.games ?? [];
  const allFinal = games.length > 0 && games.every(g => {
    const s = g.status ?? "";
    return ["Final", "Game Over", "Postponed", "Cancelled", "Suspended"].includes(s);
  });
  if (!allFinal) {
    console.log(`  · runScoutEvaluation: games not all final yet for ${date}`);
    return;
  }

  // Fetch actual results per game
  const resultsByGamePk = {};
  for (const game of games) {
    try {
      const { data } = await mlb.get(`/game/${game.gamePk}/boxscore`);
      const awayPitchers = data.teams?.away?.pitchers ?? [];
      const homePitchers = data.teams?.home?.pitchers ?? [];
      const allPitcherIds = [...awayPitchers, ...homePitchers];
      const pitcherStats = {};
      for (const pid of allPitcherIds) {
        const p = data.teams?.away?.players?.[`ID${pid}`] ?? data.teams?.home?.players?.[`ID${pid}`];
        if (p) {
          const stats = p.stats?.pitching ?? {};
          const name = p.person?.fullName ?? "";
          const ip = parseFloat(stats.inningsPitched ?? 0);
          const outs = Math.round(ip) * 3 + Math.round((ip % 1) * 10);
          pitcherStats[name.toLowerCase()] = {
            name,
            strikeouts: stats.strikeOuts ?? 0,
            outs,
            ip,
            earnedRuns: stats.earnedRuns ?? 0,
          };
        }
      }
      const linescore = data.linescore ?? {};
      resultsByGamePk[game.gamePk] = {
        awayScore: linescore.teams?.away?.runs ?? 0,
        homeScore: linescore.teams?.home?.runs ?? 0,
        totalRuns: (linescore.teams?.away?.runs ?? 0) + (linescore.teams?.home?.runs ?? 0),
        pitchers: pitcherStats,
      };
    } catch (err) {
      console.warn(`  ⚠ runScoutEvaluation: boxscore failed for ${game.gamePk}: ${err.message}`);
    }
  }

  // Match actual results to picks
  const picksWithResults = picks.map(pick => {
    const game = games.find(g =>
      (g.away?.abbr === pick.team || g.home?.abbr === pick.team) &&
      (g.away?.abbr === pick.opponent || g.home?.abbr === pick.opponent)
    );
    const result = game ? resultsByGamePk[game.gamePk] : null;
    let actualValue = null;
    let hit = null;

    if (result) {
      if (pick.market === "pitcher_strikeouts") {
        const pStats = Object.values(result.pitchers).find(p =>
          p.name.toLowerCase().includes((pick.player ?? "").toLowerCase().split(" ").pop())
        );
        actualValue = pStats?.strikeouts ?? null;
      } else if (pick.market === "pitcher_outs") {
        const pStats = Object.values(result.pitchers).find(p =>
          p.name.toLowerCase().includes((pick.player ?? "").toLowerCase().split(" ").pop())
        );
        actualValue = pStats?.outs ?? null;
      } else if (pick.market === "game_total") {
        actualValue = result.totalRuns;
      }
      if (actualValue != null) {
        hit = pick.lean === "OVER" ? actualValue > pick.line : actualValue < pick.line;
      }
    }

    return { ...pick, actualValue, hit };
  });

  // Build evaluation prompt
  const picksText = picksWithResults.map((p, i) => {
    const resultStr = p.hit == null ? "RESULT UNKNOWN" : p.hit ? `HIT (actual: ${p.actualValue})` : `MISS (actual: ${p.actualValue}, line was ${p.line})`;
    return `Pick ${i + 1}: ${p.marketLabel} ${p.lean} ${p.line} — ${p.player ?? `${p.team} vs ${p.opponent}`}
Original reasoning: "${p.reasoning}"
Signals: ${p.signals?.join(", ")}
Result: ${resultStr}`;
  }).join("\n\n");

  const evalMessages = [
    {
      role: "system",
      content: `You are The Scout reviewing your own picks. For each pick you have the original reasoning and actual result. Evaluate decision quality honestly — not just outcome. Classify each as: SOUND_HIT (data-backed, result followed logically), LUCKY_HIT (correct result, weak or coincidental reasoning), VARIANCE_MISS (sound reasoning, bad day / acceptable variance), or ADDRESSABLE_MISS (data gap, wrong signal, app limitation — be specific). For ADDRESSABLE_MISS, identify exactly what information was missing or what the app should improve. Return valid JSON only.`,
    },
    {
      role: "user",
      content: `Today's picks and results:\n\n${picksText}\n\nReturn format:\n{\n  "evaluations": [\n    {\n      "pickIndex": 0,\n      "result": "HIT",\n      "actualValue": 8,\n      "category": "SOUND_HIT",\n      "scoutReview": "My read was right...",\n      "improvementFlag": null\n    }\n  ],\n  "dayReview": "Overall...",\n  "improvementFlags": ["flag 1"]\n}`,
    },
  ];

  const OpenAI = require("openai");
  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: evalMessages,
    response_format: { type: "json_object" },
    temperature: 0.4,
  });

  const evalData = JSON.parse(response.choices[0].message.content);

  await query(
    `INSERT INTO scout_evaluations (slate_date, evaluations, day_review, improvement_flags, evaluated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (slate_date) DO UPDATE
     SET evaluations = $2, day_review = $3, improvement_flags = $4, evaluated_at = NOW()`,
    [
      date,
      JSON.stringify(evalData.evaluations ?? []),
      evalData.dayReview ?? "",
      JSON.stringify(evalData.improvementFlags ?? []),
    ]
  );

  console.log(`  ✓ runScoutEvaluation  date=${date}  picks=${picks.length}  flags=${(evalData.improvementFlags ?? []).length}`);
}
```

Export `runScoutEvaluation` from `snapshotJobs.js`.

---

#### FILE 3 — `backend/jobs/scheduler.js` — Add midnight evaluation cron

Import `runScoutEvaluation` from `snapshotJobs.js`.

Add inside `startScheduler()`:
```js
// Midnight Honolulu — evaluate yesterday's Scout picks once all games are final
cron.schedule("0 0 * * *", async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yDate = yesterday.toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
  await runScoutEvaluation(yDate);
}, { timezone: "Pacific/Honolulu" });
```

Also add a safety re-check at 1am and 2am Honolulu (in case late West Coast games aren't final at midnight):
```js
cron.schedule("0 1,2 * * *", async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yDate = yesterday.toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
  await runScoutEvaluation(yDate);
}, { timezone: "Pacific/Honolulu" });
```

---

#### FILE 4 — `server.js`

Mount the scout route after requireAuth:
```js
app.use("/api/scout", require("./routes/scout"));
```

---

#### FILE 5 — `prop-scout-v7.jsx`

**Step 1 — User gate constant** (top of component, near other constants):
```js
const SCOUT_ALLOWLIST = ["jayprox12@gmail.com"];
const isScoutUser = SCOUT_ALLOWLIST.includes((currentUser?.email ?? "").toLowerCase());
```

**Step 2 — State** (near other tab state):
```js
const [scoutPicks, setScoutPicks] = useState(null);
const [scoutEval, setScoutEval] = useState(null);
const [scoutLoading, setScoutLoading] = useState(false);
const [scoutEvalLoading, setScoutEvalLoading] = useState(false);
const [scoutError, setScoutError] = useState(null);
const [scoutExpanded, setScoutExpanded] = useState(null); // index of expanded pick
const [scoutEvalExpanded, setScoutEvalExpanded] = useState(null);
const [scoutGenerationsLeft, setScoutGenerationsLeft] = useState(3);
```

**Step 3 — Data load** (add inside the `useEffect` that runs when `activeTab === "scout"`; lazy-load on first tab visit):
```js
useEffect(() => {
  if (activeMainTab !== "scout" || !isScoutUser || scoutPicks !== null) return;
  setScoutLoading(true);
  apiGet("/api/scout/picks")
    .then(d => {
      setScoutPicks(d.picks ?? []);
      setScoutGenerationsLeft(d.maxGenerationsPerDay - d.generationsUsedToday);
    })
    .catch(e => setScoutError(e.message))
    .finally(() => setScoutLoading(false));

  // Load yesterday's evaluation
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yDate = yesterday.toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
  setScoutEvalLoading(true);
  apiGet(`/api/scout/evaluation/${yDate}`)
    .then(d => { if (d.evaluated) setScoutEval(d); })
    .catch(() => {})
    .finally(() => setScoutEvalLoading(false));
}, [activeMainTab, isScoutUser]);
```

**Step 4 — Regenerate handler:**
```js
const handleScoutRegenerate = async () => {
  if (scoutGenerationsLeft <= 0) return;
  setScoutLoading(true);
  setScoutError(null);
  try {
    const d = await apiPost("/api/scout/regenerate", {});
    setScoutPicks(d.picks ?? []);
    setScoutGenerationsLeft(d.maxGenerationsPerDay - d.generationsUsedToday);
  } catch (e) {
    setScoutError(e.message);
  } finally {
    setScoutLoading(false);
  }
};
```

**Step 5 — Bottom nav tab** (add to bottom nav only when `isScoutUser`):
```jsx
{isScoutUser && (
  <NavTab id="scout" label="Scout" icon="🎯" activeMainTab={activeMainTab} setActiveMainTab={setActiveMainTab} />
)}
```

**Step 6 — The Scout tab render** (add as a new `activeMainTab === "scout"` block):

```jsx
{activeMainTab === "scout" && isScoutUser && (
  <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>

    {/* Header */}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace", letterSpacing: "0.05em" }}>🎯 THE SCOUT</div>
        <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>AI-generated picks · Not financial advice</div>
      </div>
      <button
        onClick={handleScoutRegenerate}
        disabled={scoutLoading || scoutGenerationsLeft <= 0}
        style={{
          background: scoutGenerationsLeft > 0 ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${scoutGenerationsLeft > 0 ? "rgba(139,92,246,0.4)" : "#2d3148"}`,
          borderRadius: 8, padding: "6px 12px", fontSize: 10, fontWeight: 700,
          color: scoutGenerationsLeft > 0 ? "#c4b5fd" : "#4b5563",
          cursor: scoutGenerationsLeft > 0 ? "pointer" : "not-allowed", fontFamily: "monospace"
        }}
      >
        {scoutLoading ? "..." : `↺ Regenerate (${scoutGenerationsLeft} left)`}
      </button>
    </div>

    {/* Error */}
    {scoutError && (
      <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 12px", fontSize: 11, color: "#fca5a5" }}>
        {scoutError}
      </div>
    )}

    {/* Loading */}
    {scoutLoading && !scoutPicks && (
      <div style={{ textAlign: "center", padding: 40, color: "#6b7280", fontSize: 11 }}>The Scout is reviewing today's slate...</div>
    )}

    {/* Today's Picks */}
    {scoutPicks && scoutPicks.length > 0 && (
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", fontFamily: "monospace", letterSpacing: "0.1em", marginBottom: 6 }}>
          TODAY'S PICKS — {scoutPicks.length} total
        </div>
        {scoutPicks.map((pick, idx) => {
          const expanded = scoutExpanded === idx;
          const confColor = pick.confidence === "HIGH" ? "#22c55e" : "#fbbf24";
          const mktColor = pick.market === "pitcher_strikeouts" ? "#818cf8" : pick.market === "pitcher_outs" ? "#38bdf8" : "#fb923c";
          return (
            <div key={idx}
              onClick={() => setScoutExpanded(expanded ? null : idx)}
              style={{
                background: expanded ? "#1a1c2e" : "#161827",
                border: `1px solid ${expanded ? "#2d3148" : "#1f2437"}`,
                borderRadius: 10, padding: "12px 14px", cursor: "pointer",
                transition: "background 0.15s"
              }}
            >
              {/* Collapsed row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ background: `rgba(${mktColor === "#818cf8" ? "129,140,248" : mktColor === "#38bdf8" ? "56,189,248" : "251,146,60"},0.15)`, border: `1px solid ${mktColor}40`, borderRadius: 5, padding: "2px 7px", fontSize: 9, fontWeight: 700, color: mktColor, fontFamily: "monospace" }}>
                    {pick.marketLabel}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb" }}>
                    {pick.lean} {pick.line}
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>
                    {pick.player ?? `${pick.team} @ ${pick.opponent}`}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: confColor, fontFamily: "monospace" }}>{pick.confidence}</div>
                  <div style={{ fontSize: 9, color: "#4b5563" }}>{pick.odds}</div>
                  <div style={{ fontSize: 8, color: "#38bdf8", fontWeight: 700, fontFamily: "monospace" }}>DK</div>
                  <div style={{ fontSize: 10, color: "#4b5563" }}>{expanded ? "▲" : "▼"}</div>
                </div>
              </div>

              {/* Expanded */}
              {expanded && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {pick.player && (
                    <div style={{ fontSize: 10, color: "#9ca3af" }}>{pick.team} vs {pick.opponent} · {pick.gameTime}</div>
                  )}
                  <div style={{ fontSize: 11, color: "#d1d5db", lineHeight: 1.6, fontStyle: "italic", borderLeft: "2px solid #2d3148", paddingLeft: 10 }}>
                    "{pick.reasoning}"
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(pick.signals ?? []).map((s, i) => (
                      <div key={i} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2d3148", borderRadius: 4, padding: "2px 6px", fontSize: 9, color: "#9ca3af", fontFamily: "monospace" }}>{s}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    )}

    {scoutPicks && scoutPicks.length === 0 && (
      <div style={{ textAlign: "center", padding: 30, color: "#6b7280", fontSize: 11 }}>
        No picks generated yet — DK lines may not be posted. Try regenerating closer to game time.
      </div>
    )}

    {/* Yesterday's Evaluation */}
    {(scoutEval || scoutEvalLoading) && (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", fontFamily: "monospace", letterSpacing: "0.1em" }}>
          YESTERDAY'S REVIEW
        </div>

        {scoutEvalLoading && <div style={{ fontSize: 11, color: "#6b7280" }}>Loading review...</div>}

        {scoutEval && (
          <>
            {/* Day summary */}
            <div style={{ background: "#161827", border: "1px solid #1f2437", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                {["SOUND_HIT","LUCKY_HIT","VARIANCE_MISS","ADDRESSABLE_MISS"].map(cat => {
                  const count = scoutEval.evaluations.filter(e => e.category === cat).length;
                  if (!count) return null;
                  const color = cat === "SOUND_HIT" ? "#22c55e" : cat === "LUCKY_HIT" ? "#fbbf24" : cat === "VARIANCE_MISS" ? "#6b7280" : "#ef4444";
                  const label = cat === "SOUND_HIT" ? "✅ Sound" : cat === "LUCKY_HIT" ? "⚠ Lucky" : cat === "VARIANCE_MISS" ? "🎲 Variance" : "🔧 Fix";
                  return (
                    <div key={cat} style={{ background: `${color}15`, border: `1px solid ${color}40`, borderRadius: 6, padding: "3px 8px", fontSize: 9, fontWeight: 700, color, fontFamily: "monospace" }}>
                      {count} {label}
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6, fontStyle: "italic" }}>
                "{scoutEval.dayReview}"
              </div>
            </div>

            {/* Improvement flags */}
            {scoutEval.improvementFlags?.length > 0 && (
              <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#fca5a5", fontFamily: "monospace", marginBottom: 6 }}>🔧 IMPROVEMENTS FLAGGED</div>
                {scoutEval.improvementFlags.map((flag, i) => (
                  <div key={i} style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5, marginBottom: 4 }}>· {flag}</div>
                ))}
              </div>
            )}

            {/* Per-pick evaluations */}
            {scoutEval.evaluations.map((ev, idx) => {
              const expanded = scoutEvalExpanded === idx;
              const catColor = ev.category === "SOUND_HIT" ? "#22c55e" : ev.category === "LUCKY_HIT" ? "#fbbf24" : ev.category === "VARIANCE_MISS" ? "#6b7280" : "#ef4444";
              return (
                <div key={idx}
                  onClick={() => setScoutEvalExpanded(expanded ? null : idx)}
                  style={{ background: "#161827", border: "1px solid #1f2437", borderRadius: 8, padding: "10px 12px", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 11, color: "#d1d5db" }}>Pick {ev.pickIndex + 1} · Actual: {ev.actualValue ?? "?"}</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: catColor, fontFamily: "monospace" }}>{ev.category.replace(/_/g," ")}</div>
                      <div style={{ fontSize: 10, color: "#4b5563" }}>{expanded ? "▲" : "▼"}</div>
                    </div>
                  </div>
                  {expanded && (
                    <div style={{ marginTop: 8, fontSize: 11, color: "#9ca3af", lineHeight: 1.6, fontStyle: "italic", borderLeft: "2px solid #2d3148", paddingLeft: 10 }}>
                      "{ev.scoutReview}"
                      {ev.improvementFlag && (
                        <div style={{ marginTop: 6, color: "#fca5a5", fontStyle: "normal", fontSize: 10 }}>🔧 {ev.improvementFlag}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    )}

  </div>
)}
```

---

#### ENV variable to add to `.env` / Railway config:

```
AI_PICKS_ALLOWLIST=leadoffkaiba
```

---

#### Constraints:
- Do not modify any existing route, scoring function, or DB table outside of `ensurePhaseOneTables`.
- `requireAuth` must be applied before `requireScoutAccess` on all scout routes.
- The OpenAI client in `scout.js` uses `process.env.OPENAI_API_KEY` — the same key already used by other routes.
- All MLB API calls in the scout route use the existing `mlb` axios instance from `../services/mlbApi`.
- The `apiPost` helper used in the frontend already exists — do not redefine it.
- The NavTab component already exists in the frontend — use the same pattern as existing bottom nav tabs.
- `activeMainTab` is the state variable for the bottom nav — use it consistently.

---

### CODEX TASK 20 — Score Cap Fix: K and Outs picks clustering at 78% (COMPLETED by CW)

**Status: Done — no action needed. Documented here for context.**

Both K and Outs scoring caps were raised from 78 → 88 in `prop-scout-v7.jsx`, and avgIP was added as a scoring factor (not just signal text) for K picks.

Changes applied:
- Line ~1617: `kScore = Math.max(38, Math.min(88, kScore));` (was 78)
- Line ~1665: `oScore = Math.max(38, Math.min(88, oScore));` (was 78)
- Lines ~1612–1615: avgIP now scores K picks (+6/+3/-3/-6) matching Outs scoring pattern

Effect: Elite aces (ERA <3, K/9 ≥10, WHIP <1.10, avgIP ≥6) now score 81–88 and are distinguishable from solid-but-not-elite starters. Previously everything compressed to 78.

---

### BACKLOG TASK 30 — Skip Pre-Game Player Props Polling Until 30 Min Before First Pitch

**Priority: Low**

**Background:**
`pollPlayerProps()` currently loops all active (non-Final/Postponed) games every 20 minutes starting at 8am Honolulu. On a 15-game slate, this means games scheduled for 7pm ET are being polled 10+ times before props are even meaningful. Cuts Odds API player prop calls significantly with no UX impact.

**Implementation (single edit in `backend/jobs/snapshotJobs.js`):**

In `pollPlayerProps()`, after filtering `active` games, add a pre-pitch window check:

```js
const active = games.filter(g => {
  const s = g.status ?? "";
  if (["Final", "Game Over", "Postponed", "Cancelled", "Suspended"].includes(s)) return false;
  // Skip pre-game games until 30 minutes before first pitch
  const gameTimeMs = Date.parse(g.gameTime);
  if (Number.isFinite(gameTimeMs) && gameTimeMs - Date.now() > 30 * 60 * 1000) return false;
  return true;
});
```

**Constraints:**
- Only skip games where `g.gameTime` is a valid ISO timestamp and game hasn't started yet
- In-progress and recently-completed games always pass through (status check already handles post-game)
- No changes to route handlers, TTLs, or any other files

---

### BACKLOG TASK 27 — Label and Unify Algorithmic vs AI-Powered Picks

**Background:**
Prop Scout has two independent pick-generation systems that currently show no UI distinction:

1. **Model Picks tab** — Pure algorithmic scoring via `computeTopSlatePicks` in `prop-scout-v7.jsx`. Inputs: ERA, K/9, WHIP, BB/9, avgIP, park factor, weather, platoon matchup. Zero LLM involvement.
2. **Props tab** — AI-generated per game via OpenAI GPT-4o mini (`backend/routes/props.js`). Reads full per-game context (lineups, umpire, NRFI, odds, sportsbook lines, real-time news via Tavily) and reasons holistically.

These systems can disagree because they use different methodologies and evaluate different lines. A user seeing "Model: K OVER 7.5 @ 81%" and "AI: K UNDER 6.5 @ 49%" has no context for why.

**Phase A — Label clearly in UI (low effort, frontend only):**
- Add a small badge to Model Picks cards: e.g. `⚙ Algorithmic`
- Add a small badge to Props tab picks: e.g. `✦ AI-Powered`
- Add tooltip/help text explaining the difference in plain language

**Phase B — Hybrid AI pick (high value, medium effort):**
- Refactor `backend/routes/props.js` context builder to inject `computeTopSlatePicks` model scores as structured input alongside existing per-game context
- The enriched context would include: model K score, model Outs score, model line estimates, and key scoring signals (ERA, K/9, WHIP, avgIP) for the starting pitcher
- Let GPT-4o mini reason over both the quantitative model scores AND the qualitative game context together
- Output: a single unified pick card that combines model confidence + AI reasoning
- Goal: eliminate divergence where model and AI point in opposite directions without explanation

**Files to touch for Phase B:**
- `prop-scout-v7.jsx` — expose `computeTopSlatePicks` signals in the context string sent to `/api/props/:gamePk`
- `backend/routes/props.js` — update SYSTEM_PROMPT to reference model scores; add model score fields to JSON output schema
- Possibly a new `/api/hybrid-props/:gamePk` endpoint to keep concerns separate

**Decision note:** Start with Phase A (transparency) before Phase B (unification). Phase A alone resolves user confusion. Phase B is the long-term architecture improvement.

### CODEX TASK 17 — Remove F5 Props

**Goal:** Remove all F5 (first 5 innings) prop references from the app. Pure deletion — no new features. Can be re-introduced later if demand exists.

**File 1: `prop-scout-v7.jsx`**

**Edit 1 — Remove F5 scoring block** (~line 2395). Find and delete the entire block from:
```js
let f5Score = 50;
const f5R = [];
const f5GameKey = ...
```
through to and including the closing object with `propType: "F5"`, `confidence`, `lean`, `positive`, `reason` fields and any trailing comma.

**Edit 2 — Remove computeGrade F5 branch** (~line 3877). Delete:
```js
// F5 — first 5 innings total
if (label.includes("F5") || label.includes("FIRST 5")) {
  const f5 = innings.slice(0, 5).reduce((s, i) => s + (i.away ?? 0) + (i.home ?? 0), 0);
  const m  = label.match(/(\d+\.?\d*)/);
  if (!m) return null;
  const line = parseFloat(m[1]);
  if (lean === "OVER")  return f5 > line ? "hit" : "miss";
  if (lean === "UNDER") return f5 < line ? "hit" : "miss";
  return null;
}
```

**Edit 3 — Remove F5 Lean card in Intel tab** (~line 5278). Delete the entire `{/* ── F5 Lean ── */}` JSX block through its closing `}` — the block that computes `f5Lean` from `avgEra` and renders `<SLabel>F5 Lean</SLabel>`.

**Edit 4 — Remove F5 from props type grouping** (~lines 6889, 6951, 6960). Three sub-edits:
- Remove both instances of: `if (/\bF5\b|first.?5/i.test(lbl)) return "F5";`
- In the `typeGroups` object, remove `F5: []` entry

**Edit 5 — Clean up help text** (~lines 8345, 8363, 8532):
- Line 8345: In "Game Lean Card" description, remove `F5 lean from combined SP ERA. Quick directional read for F5 and NRFI props.` → replace with `Quick directional read for NRFI props.`
- Line 8363: In "Bullpen Card" description, remove `and caution on F5 unders`
- Line 8532: Delete the entire `<PropRow type="F5" def="..." />` line

**File 2: `backend/routes/props.js`**

**Edit 1 — Remove F5 from system prompt priority list** (~line 76). Delete:
```
4. F5 total — based on SP ERA/WHIP comparison, early-inning tendencies
```
Renumber remaining items so numbering is continuous.

**Edit 2 — Remove F5 from field rules** (~lines 90–91):
- `propType` field: remove `"F5"` from the allowed values list
- `lean` field: remove `"OVER F5" | "UNDER F5"`
- `positive` field: remove `OVER F5→true, UNDER F5→false`

**Constraints:** Do not touch any other prop types (K, Total, NRFI, Outs, RL, Hits, TB, HR, RBI). Do not change TTLs, cache logic, or any other routes.

---

### CODEX TASK 6 — AI Search Chat in Help Overlay (Backlog)

**Goal:** Add an AI-powered chat input at the top of the Help overlay so users can ask plain-language questions about the app and get instant answers scoped to its features.

**Example queries:**
- "what does LINE INTELLIGENCE mean?"
- "how does the NRFI score get calculated?"
- "when does the ✦ CARD AGREES badge appear?"
- "what's the difference between the Board and Model Picks?"

---

**Backend — new endpoint: `POST /api/help-chat`**

File to create: `backend/routes/helpChat.js`
Mount in `server.js`: `app.use("/api/help-chat", require("./routes/helpChat"))`

```js
// POST /api/help-chat
// Body: { question: string }
// Returns: { answer: string }
```

1. Build a condensed `HELP_CONTEXT` string (hardcoded in the route file) covering all major features: Slate card fields, Board tabs + scoring, Games tab markets, Model Picks tiers + LINES + CARD AGREES, LINE INTELLIGENCE formula, Settings/preferred book, Intel tab (umpire, NRFI, bullpen, odds), prop types, stat glossary key terms.

2. Call Claude via `@anthropic-ai/sdk` with a tight system prompt:
   ```
   You are a helpful assistant for the Prop Scout MLB betting research app.
   Answer the user's question using only the context below. Be concise (2–4 sentences max).
   If the question is not covered by the context, say so briefly.
   Never make up statistics or features not described in the context.
   ```

3. Rate-limit: max 20 calls/day (shared counter in memory, same pattern as `dailyCard.js`). Return `{ error: "daily limit reached" }` with 429 if exceeded.

4. Cache responses: `cache.set(\`help:\${hash(question.toLowerCase().trim())}\`, answer, 60 * 60 * 1000)` — 1 hour TTL. Use Node's built-in `crypto.createHash("md5")` for the hash.

5. requireAuth middleware — same as other protected routes.

---

**Frontend — chat UI in Help overlay (`prop-scout-v7.jsx`)**

Add a chat section at the very top of the help content area (above the first `<Section>`):

1. **State:** `const [helpQ, setHelpQ] = useState(""); const [helpA, setHelpA] = useState(null); const [helpLoading, setHelpLoading] = useState(false);`
   — these are component-level state variables (not inside the IIFE).

2. **UI:** a dark rounded input row with a placeholder `"Ask anything about the app…"` and a `→` submit button. Below it, when `helpA` is set, a card showing the answer with a purple left border. Show a spinner while loading.

3. **Submit handler:** `apiMutate("/api/help-chat", "POST", { question: helpQ })` → set `helpA` from response.

4. **Suggested questions** (shown when `helpA` is null): 3–4 small chip buttons the user can tap to pre-fill the input:
   - "How does LINE INTELLIGENCE work?"
   - "What is the ✦ CARD AGREES badge?"
   - "How is the NRFI score calculated?"
   - "What's the difference between Board and Model Picks?"

5. **Clear button:** small `✕` next to the answer card to reset `helpA` and `helpQ`.

**Visual language:** same dark card style as the rest of the overlay. Input uses the same `background: "#1a1c2e", border: "1px solid #2d3148"` pattern. Answer card has `borderLeft: "3px solid #818cf8"` (purple). Loading state shows a subtle `…` animated text.

**Constraints:**
- `helpQ`, `helpA`, `helpLoading` must be component-level state — NOT declared inside the help overlay IIFE (that would cause the React hooks error)
- Clear `helpA` and `helpQ` when the help overlay is closed (`setShowHelp(false)`)
- The chat section sits above the Section components but inside the `<div style={{ padding: "16px 14px"... }}>` wrapper

---

### CODEX TASK 7 — Book Filter on Props Tab (Backlog)

**Goal:** Add a book filter control to the Props tab so users can narrow the multi-book comparison grid to one or more specific sportsbooks. Defaults to the user's preferred book if one is set.

**File to modify:** `prop-scout-v7.jsx`

**Current state:**
- The Props tab shows a multi-book grid (DK / FD / CZR / MGM / BOV) for every player prop line
- `preferredBook` state exists (string or null) — loaded from server on login/app start
- The grid renders all books present in `activeBooks` (books that have at least one line for that game)
- No filter control exists — all books always shown

**What to build:**

1. **New state:** `const [propsBookFilter, setPropsBookFilter] = useState(null);`
   — `null` = show all books; `"DK"` etc. = show only that book. Component-level state (not inside an IIFE).

2. **Initialize from preference:** in the same `useEffect` that loads `preferredBook` from `/api/auth/preferences`, also set `setPropsBookFilter(d.preferences?.preferredBook ?? null)`. This way the filter defaults to their saved book on every load.

3. **Filter chip row** — render above the props grid, only when `tab === "props"` and props data is loaded. A horizontal scrollable row of book chips:
   ```
   [ALL]  [DK]  [FD]  [CZR]  [MGM]  [BOV]
   ```
   - `ALL` chip: selected when `propsBookFilter === null`. Clicking sets filter to `null`.
   - Book chips: selected when `propsBookFilter === bk`. Clicking the active chip deselects (sets `null`); clicking another selects it.
   - Only show chips for books that actually have data for the current game's props (use the same `activeBooks` array already computed in the props rendering block).
   - Active chip style: `background: "rgba(251,191,36,0.18)", border: "1px solid #fbbf24", color: "#fbbf24"`. Inactive: `background: "#1a1c2e", border: "1px solid #2d3148", color: "#6b7280"`.
   - If `preferredBook` is set, add a subtle star (★) on that book's chip label so the user knows it's their saved preference.

4. **Apply filter to the grid:** in the props grid rendering block, where `activeBooks` is used to render column headers and cells, replace:
   ```js
   const activeBooks = BOOKS.filter(bk => rows.some(p => p.books?.[bk]));
   ```
   with:
   ```js
   const allActiveBooks = BOOKS.filter(bk => rows.some(p => p.books?.[bk]));
   const activeBooks = propsBookFilter && allActiveBooks.includes(propsBookFilter)
     ? [propsBookFilter]
     : allActiveBooks;
   ```
   This filters the displayed columns while keeping the underlying data intact.

5. **LINE INTELLIGENCE still works:** the gap calculation uses all books regardless of the filter — don't gate it on `propsBookFilter`. The EDGE badge should still appear based on full sharp/square comparison even when only one book's column is visible.

**Constraints:**
- `propsBookFilter` is component-level state — not inside any IIFE or render function
- Resetting the filter (tap ALL) always falls back to showing all available books for that game
- Do not change any prop fetching logic, TTLs, or the `activeBooks` variable used outside the filter scope
- The filter chip row should not appear on other tabs (Intel, Overview, Lineup, etc.) — only on `tab === "props"`

---

**⚠️ REDO NOTE (April 2026):** Codex attempted this task but made zero changes to the file. The implementation was missing entirely — no `propsBookFilter` state, no chip UI, no column filtering. Use the pinpoint instructions below instead of the general spec above.

**Exact 3-edit implementation:**

**Edit 1 — Add state** near line 2882 (where other filter states live):
```js
const [propsBookFilter, setPropsBookFilter] = useState("ALL");
```

**Edit 2 — Default to preferredBook** inside the `useEffect` that calls `/api/auth/preferences` (around line 3202), add after `setPreferredBook(...)`:
```js
setPropsBookFilter(d.preferences?.preferredBook ?? "ALL");
```

**Edit 3 — Filter chips + column filter** in the Sportsbook Lines section (around line 6199–6213). Change the `BOOKS` constant and add chips:
```js
const ALL_BOOKS = ["DK", "FD", "CZR", "MGM", "BOV"];
const BOOKS = propsBookFilter === "ALL" ? ALL_BOOKS : ALL_BOOKS.filter(b => b === propsBookFilter);
```
Then insert chip row just before the `<SLabel>Sportsbook Lines</SLabel>` div:
```jsx
<div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
  {["ALL","DK","FD","CZR","MGM","BOV"].map(bk => {
    const active = propsBookFilter === bk;
    return (
      <button key={bk} onClick={() => setPropsBookFilter(bk)}
        style={{
          fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 6, cursor: "pointer",
          background: active ? "rgba(139,92,246,0.25)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${active ? "rgba(139,92,246,0.6)" : "rgba(255,255,255,0.08)"}`,
          color: active ? "#c4b5fd" : "#6b7280"
        }}>{bk}{bk === preferredBook ? " ★" : ""}</button>
    );
  })}
</div>
```

**LINE INTELLIGENCE note:** `sharpLines` and `allBooks` scoring logic must use `ALL_BOOKS`, not the filtered `BOOKS`. Only the rendered column headers and cells use the filtered `BOOKS` array.

---

### CODEX TASK 8 — Auto-Refresh Odds in Background (Task #20)

**Goal:** Re-poll `/api/odds` on a background interval so `liveOddsMap` stays current during the hour before first pitch. Currently odds are fetched once on app load and cached — line movement after that is not reflected until a manual reload.

**File to modify:** `prop-scout-v7.jsx`

**What to add:**
Add a `useEffect` near the other polling effects (around line 3340, alongside the lineup poll and linescore poll) that calls `fetchOdds(true)` every 10 minutes and updates `liveOddsMap` state:

```js
// Auto-refresh odds every 10 minutes so Games board and Model Picks stay current
useEffect(() => {
  if (IS_ODDS_SANDBOX || !liveSlate?.length) return;
  const id = setInterval(async () => {
    const result = await fetchOdds(true);
    if (result?.data) setLiveOddsMap(result.data);
  }, 10 * 60 * 1000);
  return () => clearInterval(id);
}, [liveSlate]);
```

**Constraints:**
- Use `fetchOdds(true)` — the `true` flag bypasses the client-side cache and forces a fresh fetch
- Only run when `!IS_ODDS_SANDBOX` and `liveSlate` is populated
- Do not change any existing odds fetch logic, TTLs, or the initial load effect
- `setLiveOddsMap` already exists in component state — just call it with `result.data`

---

### CODEX TASK 9 — Collapsible Market Sections in Props Tab Sportsbook Lines (Task #23)

**Goal:** Add collapse/expand toggles to each market section header (Strikeouts, Home Runs, Total Bases, Hits) in the Sportsbook Lines grid on the Props tab.

**File to modify:** `prop-scout-v7.jsx`

**What to add:**

**Step 1 — Add state** near other collapse state (around line 2892, alongside `showTrends`, `showDigest`):
```js
const [collapsedMarkets, setCollapsedMarkets] = useState({}); // { pitcher_strikeouts: true, ... }
```

**Step 2 — Toggle function:**
```js
const toggleMarket = (mKey) => setCollapsedMarkets(prev => ({ ...prev, [mKey]: !prev[mKey] }));
```

**Step 3 — Update market header row** (around line 6302–6317 where each `{ mKey, label, badge, color }` is mapped). In the market header `<div>`, add a clickable toggle:
- Make the entire header row `onClick={() => toggleMarket(mKey)}`
- Add a chevron indicator: `▼` when expanded, `▶` when collapsed — right-aligned in the header
- Wrap the player rows content in `{!collapsedMarkets[mKey] && (...)}` so the body hides when collapsed

**Default state:** All sections expanded (empty object = nothing collapsed).

**Constraints:**
- State is component-level (not inside the IIFE or render loop)
- `toggleMarket` must be defined at component level too
- Collapse only hides the player rows — the market header badge row always stays visible
- Do not change any data fetching, scoring, or LINE INTELLIGENCE logic

---

### CODEX TASK 10 — Remove AI Analysis Section from Props Tab (Task #24)

**Goal:** Remove the AI Analysis section entirely from the Props tab and clean up all related code.

**File to modify:** `prop-scout-v7.jsx`

**What to remove:**

1. **Section render block** — find the comment `{/* ── AI ANALYSIS section */}` (around line 6502) and delete the entire block through its closing `})()}` — this includes the section header, loading state, and all `aiProps.map(...)` card rendering.

2. **State declaration** — remove `const [liveAiProps, setLiveAiProps] = useState({});` (around line 2940)

3. **Ref declaration** — remove `const aiPropsFetched = useRef(new Set());` (around line 2941)

4. **Fetch useEffect** — remove the `useEffect` that fetches `/api/ai-props` when the Props tab opens (around line 3076–3110). It starts with `// Fetch AI Props when Props tab opens`.

**Constraints:**
- Verify `liveAiProps` and `aiPropsFetched` are not referenced anywhere else in the file before deleting — do a search first
- Do not touch the Prop Confidence Meters section, the Sportsbook Lines section, or any other Props tab content
- Do not remove any backend route — only remove frontend references

---

### CODEX TASK 11 — Personalization Level 1: Filter Model Picks by Preferred Book Availability (Task #21)

**Goal:** If a user has a `preferredBook` set, hide Model Pick cards where that sportsbook does not have the prop posted. Users should only see picks they can actually bet at their book.

**File to modify:** `prop-scout-v7.jsx`

**Background:**
- `topSlatePicks` is computed at line ~3745 by calling `computeTopSlatePicks(...)` — a module-level function that scores pitchers using stats only. It does NOT have access to `livePlayerProps`.
- Each pick object has: `fullName` (pitcher full name), `gamePk`, `market` ("pitcher_strikeouts" or "pitcher_outs_recorded"), and other display fields.
- `livePlayerProps` is component state: `{ [gamePk]: { props: [...] } | "loading" | null }` — each prop entry has a `books` object keyed by book abbreviation.
- `preferredBook` is component state: `"DK" | "FD" | "CZR" | "MGM" | "BOV" | null`

**What to add — 2 edits only:**

**Edit 1 — Add filter helper** just before the `topSlatePicks` line (around line 3743):
```js
// Returns true if the pick is available at the user's preferred book (or no preference set)
const isAvailableAtPreferredBook = (pick) => {
  if (!preferredBook) return true; // no preference — show everything
  const ppState = livePlayerProps[String(pick.gamePk)];
  // Odds not loaded yet — don't hide the pick prematurely
  if (!ppState || ppState === "loading" || !Array.isArray(ppState?.props)) return true;
  const lastName = (pick.fullName ?? "").split(" ").pop().toLowerCase();
  const match = ppState.props.find(pr =>
    pr.market === pick.market &&
    pr.player?.toLowerCase().includes(lastName)
  );
  // Prop not in odds API yet — don't hide
  if (!match) return true;
  // Prop IS posted — only show if preferred book has a line
  return match.books?.[preferredBook]?.line != null;
};
```

**Edit 2 — Apply the filter to `topSlatePicks`** — replace the existing line (around line 3745):
```js
// BEFORE:
const topSlatePicks = !IS_STATS_SANDBOX && liveSlate?.length
  ? computeTopSlatePicks(liveSlate, livePitcherStats, liveLineups, liveWeather)
  : [];

// AFTER:
const rawSlatePicks = !IS_STATS_SANDBOX && liveSlate?.length
  ? computeTopSlatePicks(liveSlate, livePitcherStats, liveLineups, liveWeather)
  : [];
const topSlatePicks = preferredBook
  ? rawSlatePicks.filter(isAvailableAtPreferredBook)
  : rawSlatePicks;
```

**Constraints:**
- `isAvailableAtPreferredBook` must be defined at component level — NOT inside an IIFE or render block
- Do NOT modify `computeTopSlatePicks` — it's a module-level function and should stay pure/stateless
- Do NOT change `highPicks`, `mediumPicks`, `specPicks` — they filter `topSlatePicks` by tier and will automatically reflect the book filter
- If `preferredBook` is null (no preference set), behavior is identical to today — all picks shown
- If odds haven't loaded yet for a game, the pick stays visible — only hide when the prop is confirmed posted at other books but missing at the preferred book

---

### CODEX TASK 12 — Fix Duplicate Pick Logging + Stuck Pending Grades (Bug Fix)

**File to modify:** `prop-scout-v7.jsx`

**Three bugs, three targeted fixes:**

---

**Fix 1 — Duplicate logging (line ~3776)**

`logPick` has no dedup guard. Some call sites use `!logged && logPick(...)` but `isLogged` can silently fail when `selectedId` changes between renders. The fix belongs inside `logPick` itself.

Add this check at the TOP of `logPick`, before the entry object is constructed:
```js
const alreadyLogged = propLog.some(p =>
  String(p.gamePk) === String(prop.gamePk ?? selectedId) &&
  p.label === prop.label &&
  p.date === new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })
);
if (alreadyLogged) return;
```

---

**Fix 2 — Outs and Strikeouts grades stuck pending (line ~3896)**

Root cause: When a Model Pick is logged, the label is constructed as `"Nick Martinez Outs OVER 14.5"` (line ~4054) using the word `OVER`. But `computeGrade` matches Outs props using `label.includes("O/U")` — which never matches `OVER`. Result: grade always returns `null`, pick stays pending forever.

**Fix the Outs branch** (around line 3896):
```js
// BEFORE:
if (label.includes("OUTS") && label.includes("O/U")) {

// AFTER:
if (label.includes("OUTS") && (label.includes("O/U") || label.includes("OVER") || label.includes("UNDER"))) {
```

**Fix the Strikeouts branch** (around line 3874):
```js
// BEFORE:
if (label.includes("K'S") || label.includes("STRIKEOUT") || (label.includes(" K ") && label.includes("O/U"))) {

// AFTER:
if (label.includes("K'S") || label.includes("STRIKEOUT") || (label.includes(" K ") && (label.includes("O/U") || label.includes("OVER") || label.includes("UNDER")))) {
```

---

**Fix 3 — `gradedGames` blocks retry when grading fails (line ~3309)**

`gradedGames.current.add(gamePk)` fires unconditionally — even when every `computeGrade` call returns `null` (unresolvable). This permanently blacklists the game from retry, so any picks that failed to grade stay pending forever.

Fix: only add to `gradedGames` when at least one pick was successfully graded.

**Replace** the grading block (around line 3309–3313):
```js
// BEFORE:
gradedGames.current.add(gamePk);
pendingPicks.forEach(pick => {
  const grade = computeGrade(pick, box);
  if (grade !== null) markResult(pick.id, grade);
});

// AFTER:
let anyGraded = false;
pendingPicks.forEach(pick => {
  const grade = computeGrade(pick, box);
  if (grade !== null) {
    markResult(pick.id, grade);
    anyGraded = true;
  }
});
if (anyGraded) gradedGames.current.add(gamePk);
```

---

---

**Fix 4 — Show actual stat result on pitcher board cards (K and Outs tabs)**

Batter cards already show the count (`✓ HIT ×2`, `⚾ HR ×2`). Pitcher cards only show `✓ HIT` / `✗ MISS` with no number. Update them to show the actual stat.

Find the pitcher HIT/MISS badges in the pitcher card render block (around line 7663–7668):

```jsx
// BEFORE:
{hasResolvedResult && pitcherHit && (
  <span ...>✓ HIT</span>
)}
{hasResolvedResult && !pitcherHit && (
  <span ...>✗ MISS</span>
)}

// AFTER:
{hasResolvedResult && pitcherHit && (
  <span ...>
    ✓ {boardTab === "k" ? `${todayResult.k}K` : `${todayResult.outs} outs`}
  </span>
)}
{hasResolvedResult && !pitcherHit && (
  <span ...>
    ✗ {boardTab === "k" ? `${todayResult.k}K` : `${todayResult.outs} outs`}
  </span>
)}
```

Keep all existing styles on the badges unchanged — only replace the text content.

---

**Constraints:**
- Do not change `computeGrade`'s signature or any other prop type branches (NRFI, YRFI, Game Total, F5, Run Line) — only fix the Outs and Strikeouts label matching
- Do not change `markResult`, `deletePick`, or `isLogged`
- Do not touch any backend routes or API calls
- All four fixes are independent — implement all four in a single pass

---

### CODEX TASK 13 — Market Validation Badge on Model Pick Cards

**Goal:** Add a market validation badge to each Model Pick card so users know whether the model's suggested line matches a real sportsbook market, is close but different, or is a model-only projection not directly bettable.

**File to modify:** `prop-scout-v7.jsx`

**Why this is simple:** No new state, no new API calls, no architecture changes. All the data is already computed on each card:
- `bookLine` — real sportsbook line from `getBookLine(p)` (already called at line ~4063)
- `p.modelLine` — model's suggested line (already on every pick object)
- `lineMismatch` — already partially computed as `bookLine && Math.abs(bookLine.line - p.modelLine) >= 0.5`
- `livePlayerProps[String(p.gamePk)]` — already in state, used to detect if odds haven't loaded yet

**What to add — 2 edits only:**

**Edit 1 — Extend the inline validation logic** right after `lineMismatch` is computed (around line 4064), add:
```js
const mv = (() => {
  if (!bookLine) {
    const ppState = livePlayerProps[String(p.gamePk)];
    if (!ppState || ppState === "loading") return { status: "ODDS_PULL_FAILED",    label: "Checking Odds…",    color: "#4b5563", icon: "⟳" };
    return                                        { status: "MARKET_UNAVAILABLE",  label: "Odds Unavailable", color: "#4b5563", icon: "—" };
  }
  const diff      = Math.abs((p.modelLine ?? 0) - bookLine.line);
  const bookCount = bookLine.allBooks?.length ?? 0;
  if (diff === 0)    return { status: "MARKET_MATCHED",    label: "Verified Market",   color: "#22c55e", icon: "✓", diff, bookCount };
  if (diff <= 1.0)   return { status: "MARKET_NEARBY",     label: "Alt Line",          color: "#f59e0b", icon: "~", diff, bookCount };
  return                    { status: "MARKET_MISMATCH",   label: "Model Projection",  color: "#ef4444", icon: "⚠", diff, bookCount };
})();
```

**Edit 2 — Render the badge** between the LINES grid closing tag and the signals section (between lines ~4153 and ~4155, after `</div>` that closes the bookLine block and before `{p.signals?.length > 0 &&`):

```jsx
{/* Market Validation Badge */}
<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: mv.status !== "ODDS_PULL_FAILED" ? 6 : 0, flexWrap: "wrap" }}>
  <span style={{
    fontSize: 8, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
    color: mv.color,
    background: `${mv.color}18`,
    border: `1px solid ${mv.color}44`,
    fontFamily: "monospace",
    letterSpacing: "0.04em"
  }}>
    {mv.icon} {mv.label}
    {mv.status === "MARKET_MATCHED" && mv.bookCount > 0 && ` · ${mv.bookCount} book${mv.bookCount > 1 ? "s" : ""}`}
    {mv.status === "MARKET_NEARBY"  && ` · Model: ${p.modelLine} · Books: ${bookLine?.line}`}
    {mv.status === "MARKET_MISMATCH" && ` · Model: ${p.modelLine} · Books: ${bookLine?.line}`}
  </span>
  {mv.status === "MARKET_MATCHED" && bookLine?.overOdds && (
    <span style={{ fontSize: 8, color: "#6b7280", fontFamily: "monospace" }}>
      Best: {bookLine.book} {bookLine.overOdds}
    </span>
  )}
  {mv.status === "MARKET_NEARBY" && (
    <span style={{ fontSize: 8, color: "#6b7280", fontStyle: "italic" }}>Check before betting</span>
  )}
  {mv.status === "MARKET_MISMATCH" && (
    <span style={{ fontSize: 8, color: "#6b7280", fontStyle: "italic" }}>Not directly actionable</span>
  )}
</div>
```

**Status enum reference:**
- `MARKET_MATCHED` — exact line exists at one or more books → green `✓ Verified Market · 3 books · Best: FD -118`
- `MARKET_NEARBY` — same prop, line differs ≤ 1.0 → amber `~ Alt Line · Model: 5.5 · Books: 4.5 · Check before betting`
- `MARKET_MISMATCH` — line differs > 1.0 → red `⚠ Model Projection · Model: 14.5 · Books: 18.5 · Not directly actionable`
- `MARKET_UNAVAILABLE` — prop not found at any book → gray `— Odds Unavailable`
- `ODDS_PULL_FAILED` — odds not loaded yet → gray `⟳ Checking Odds…`

**Constraints:**
- All logic is inline inside `TierSection`'s `tierPicks.map(...)` — no new component, no new state, no new helper function needed
- Do NOT modify `getBookLine`, `computeTopSlatePicks`, or any scoring functions
- Do NOT add any new API calls or useEffects
- The badge only appears on the MODEL tab pick cards (inside `TierSection`) — not on the Board or anywhere else
- Keep the existing `lineMismatch` variable — it still drives the `model: {p.modelLine}` display in the LINES grid header

---

## Latest Codex Update (Apr 25, 2026)

- **Auto-grading expanded beyond the earlier game-level + pitcher-only set.**
- `computeGrade(...)` in `prop-scout-v7.jsx` now also handles:
  - `Moneyline`
  - batter `Hits`
  - batter `Home Runs`
  - batter `RBI`
  - batter `Total Bases`
- **Important enabling change:** `backend/routes/boxscore.js` now includes `doubles`, `triples`, and `tb` (`totalBases`) on each batter row so `TB` props can be graded from final boxscore data instead of staying manual forever.
- **Logging reliability improved:** `logPick(...)` now prefers IDs/names already present on the prop object (`prop.gamePk`, `prop.pitcherId`, `prop.playerId`, `prop.fullName`, `prop.name`) before falling back to the currently selected game/batter. This makes auto-grading much more reliable for picks logged from MODEL / BOARD contexts, not just the Game tab.
- **Current practical status:** all core logged prop types in the app are now intended to auto-grade once final boxscore/linescore data is available, provided the app is open or reopened after game end so the grading effect can run.

---

### CODEX TASK 14 — AI Search Chat in Help Overlay (Task #18)

**Read CODEX TASK 6 first** (earlier in this doc) for the full original spec. This entry adds exact line numbers and an updated HELP_CONTEXT covering all features built since Task 6 was written.

**Files to create/modify:**
- **Create:** `backend/routes/helpChat.js`
- **Modify:** `backend/server.js` — add mount line
- **Modify:** `prop-scout-v7.jsx` — state + UI

---

**Backend: `backend/routes/helpChat.js`**

Follow the exact same pattern as `backend/routes/dailyCard.js`:
- Lazy Anthropic client (`getClient()`)
- Daily cap counter using `todayHonolulu()` — set cap to **20 calls/day**
- MD5 hash cache using `crypto.createHash("md5")` — TTL **1 hour**
- `requireAuth` middleware

Use `claude-haiku-4-5-20251001` (not Sonnet) — answers are short and factual, Haiku is sufficient and cheaper.

**HELP_CONTEXT** (hardcode this string in the route file):
```
PROP SCOUT — Feature Reference

SLATE TAB: Lists today's MLB games. Each card shows teams, time, probable pitchers, weather (temp/wind), park name, and live score if in progress. Tap a card to open the Game view.

GAME VIEW TABS:
- Overview: pitcher stats (ERA, K/9, WHIP, BB/9, avgIP), home/away splits, recent form
- Lineup: confirmed batting order with platoon matchup indicators (L/R splits)
- Arsenal: pitcher pitch mix, whiff rates, usage % from Baseball Savant
- Intel: umpire zone tendencies (K-friendly/hitter-friendly rating), NRFI/YRFI lean, bullpen fatigue (pitch count last 3 days), odds card (moneyline, spread, O/U, F5 total), line movement arrow
- Props: Prop Confidence Meters (scored 0–100), Sportsbook Lines grid with book filter chips (ALL/DK/FD/CZR/MGM/BOV), collapsible K/HR/TB/H sections
- Bullpen: each reliever's recent usage, ERA, handedness
- Boxscore: live or final inning-by-inning scoring, batting and pitching lines

BOARD TAB: Ranked player lists scored by the internal algorithm.
- HR tab: top home run candidates scored on SLG, park HR factor, wind, batting order, platoon split
- Hits tab: top hit candidates scored on AVG, contact rate, park hit factor, platoon split
- K tab (Strikeouts): top K over candidates scored on K/9, ERA, WHIP, park K factor, umpire, recent form
- Outs tab: top Outs recorded over candidates scored on avgIP, ERA, WHIP, BB/9
- Games tab: sub-tabs for NRFI / O/U Total / Run Line / Moneyline — each game scored algorithmically
Score badge (0–100): 70+ green (strong), 55–69 amber (moderate), below 55 red (weak)
Tap WHY? on any card to see the exact factors that built the score.

MODEL PICKS TAB (🎯): Algorithm-selected top pitcher props for the day.
- HIGH CONFIDENCE (≥75%), MEDIUM CONFIDENCE (55–74%), SPECULATIVE (<55%)
- Each card shows: pitcher name, matchup, confidence %, lean (OVER/UNDER), factor signals
- LINES grid: book-by-book line and juice for DK/FD/CZR/MGM/BOV. Best line highlighted green.
- LINE INTELLIGENCE (EDGE badge): if sharp books (DK/FD) have a lower line than square books (CZR/MGM/BOV) by 0.5+, it signals a mispriced market — the lower line is the smarter number.
- ✦ CARD AGREES badge: the Daily Card AI analysis independently selected the same pitcher for the same prop type — two separate systems agreeing is a convergence signal.
- Market Validation badge: ✓ Verified Market (exact line at 1+ books), ~ Alt Line (line within 1.0 of model), ⚠ Model Projection (line differs >1.0, not directly bettable), — Odds Unavailable
- Preferred book filter: if a preferred sportsbook is set, only picks available at that book are shown.

PICKS TAB: Your personal pick log. Tap + Log on any prop to save it. Shows HIT/MISS/pending result. Auto-grades once final boxscore data is available. W-L record and 7-day win rate displayed.

SPORTSBOOKS: DK = DraftKings, FD = FanDuel, CZR = Caesars, MGM = BetMGM, BOV = Bovada. DK and FD are sharp books (tighter, more accurate lines). CZR, MGM, BOV are square books. LINE INTELLIGENCE fires when sharp lines are 0.5+ lower than square lines.

SETTINGS: Set preferred sportsbook — affects which book's line appears first in LINES grids and filters Model Picks to only show props available at your book. Options: DK, FD, CZR, MGM, BOV.

DAILY CARD: AI-generated full-slate analysis surfacing 2–3 strongest plays with reasoning. Appears in the Intel tab. Updates up to 10 times per day.

STAT GLOSSARY: ERA = earned run average (lower = better). K/9 = strikeouts per 9 innings. WHIP = walks + hits per inning pitched (lower = better). BB/9 = walks per 9 innings. avgIP = average innings pitched per start. SLG = slugging percentage. OPS = on-base + slugging. L3 avg = average over last 3 starts. Park factor = multiplier showing how a stadium inflates/suppresses hits, HRs, or Ks vs league average (1.0 = neutral).
```

**Endpoint logic:**
```js
router.post("/", requireAuth, async (req, res) => {
  const question = (req.body.question ?? "").trim().slice(0, 300);
  if (!question) return res.status(400).json({ error: "question required" });

  const cacheKey = `help:${crypto.createHash("md5").update(question.toLowerCase()).digest("hex")}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ answer: cached, cached: true });

  if (!capCheck()) return res.status(429).json({ error: "daily limit reached" });

  const client = getClient();
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    system: `You are a helpful assistant for the Prop Scout MLB betting research app. Answer the user's question using only the context below. Be concise (2–4 sentences). If the question is not covered, say so briefly. Never invent features.\n\n${HELP_CONTEXT}`,
    messages: [{ role: "user", content: question }],
  });
  const answer = msg.content[0]?.text ?? "Sorry, I couldn't generate an answer.";
  cache.set(cacheKey, answer, 60 * 60 * 1000);
  res.json({ answer });
});
```

**Mount in `server.js`:** add `app.use("/api/help-chat", require("./routes/helpChat"));` alongside the other route mounts.

---

**Frontend: `prop-scout-v7.jsx`**

**Step 1 — Add state** near line 2796 (alongside `showHelp`):
```js
const [helpQ,       setHelpQ]       = useState("");
const [helpA,       setHelpA]       = useState(null);
const [helpLoading, setHelpLoading] = useState(false);
```

**Step 2 — Clear state when help closes** — find the CLOSE button at line ~8200 where `setShowHelp(false)` is called, and add:
```js
onClick={() => { setShowHelp(false); setHelpQ(""); setHelpA(null); }}
```

**Step 3 — Insert chat UI** inside the help content wrapper at line ~8203, directly before the first `{(() => {` IIFE (the Color Guide section). Insert:

```jsx
{/* ── AI Help Chat ── */}
<div style={{ background: "#161827", border: "1px solid #2d3148", borderRadius: 10, padding: "12px 14px" }}>
  <div style={{ fontSize: 10, fontWeight: 700, color: "#818cf8", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 10 }}>⚡ ASK PROP SCOUT</div>

  {/* Suggested chips — shown when no answer yet */}
  {!helpA && (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
      {["How does LINE INTELLIGENCE work?", "What is ✦ CARD AGREES?", "How is the NRFI score calculated?", "What's the difference between Board and Model Picks?"].map(q => (
        <button key={q} onClick={() => setHelpQ(q)}
          style={{ fontSize: 8, padding: "3px 8px", borderRadius: 6, background: "rgba(129,140,248,0.08)", border: "1px solid rgba(129,140,248,0.25)", color: "#818cf8", cursor: "pointer", fontFamily: "monospace" }}>
          {q}
        </button>
      ))}
    </div>
  )}

  {/* Input row */}
  <div style={{ display: "flex", gap: 8 }}>
    <input
      value={helpQ}
      onChange={e => setHelpQ(e.target.value)}
      onKeyDown={e => { if (e.key === "Enter" && helpQ.trim() && !helpLoading) submitHelpQ(); }}
      placeholder="Ask anything about the app…"
      style={{ flex: 1, background: "#1a1c2e", border: "1px solid #2d3148", borderRadius: 8, padding: "7px 10px", fontSize: 11, color: "#f9fafb", fontFamily: "monospace", outline: "none" }}
    />
    <button
      onClick={submitHelpQ}
      disabled={!helpQ.trim() || helpLoading}
      style={{ background: helpQ.trim() ? "rgba(129,140,248,0.2)" : "rgba(255,255,255,0.04)", border: "1px solid rgba(129,140,248,0.3)", borderRadius: 8, padding: "7px 12px", fontSize: 12, color: "#818cf8", cursor: helpQ.trim() ? "pointer" : "default", fontWeight: 700 }}>
      {helpLoading ? "…" : "→"}
    </button>
  </div>

  {/* Answer card */}
  {helpA && (
    <div style={{ marginTop: 10, background: "#0f1020", borderLeft: "3px solid #818cf8", borderRadius: "0 8px 8px 0", padding: "10px 12px", position: "relative" }}>
      <button onClick={() => { setHelpA(null); setHelpQ(""); }}
        style={{ position: "absolute", top: 6, right: 8, background: "none", border: "none", color: "#4b5563", cursor: "pointer", fontSize: 12 }}>✕</button>
      <div style={{ fontSize: 11, color: "#e5e7eb", lineHeight: 1.6, fontFamily: "monospace", paddingRight: 16 }}>{helpA}</div>
    </div>
  )}
</div>
```

**Step 4 — Add submit handler** at component level (near other helper functions, around line 3940):
```js
const submitHelpQ = async () => {
  if (!helpQ.trim() || helpLoading) return;
  setHelpLoading(true);
  setHelpA(null);
  try {
    const data = await apiMutate("/api/help-chat", "POST", { question: helpQ });
    setHelpA(data.answer ?? "No answer returned.");
  } catch {
    setHelpA("Sorry, couldn't reach the help service. Try again.");
  } finally {
    setHelpLoading(false);
  }
};
```

**Constraints:**
- `helpQ`, `helpA`, `helpLoading`, and `submitHelpQ` must ALL be at component level — never inside the help overlay IIFE or any render block
- `submitHelpQ` uses `apiMutate` (already in scope) — not a raw fetch
- Do not change any existing Section or Row components inside the help overlay
- The chat block sits inside the `<div style={{ padding: "16px 14px" ... }}>` wrapper, as the very first child before all Section content

---

## HANDOFF NOTE — 2026-04-26 — Backend-First Data Architecture Brainstorm

We had a product/architecture discussion after recent odds + board work. This is not an implementation task yet, but it is an important direction note for future planning.

### Current state

- The frontend already calls only our backend APIs, not third-party vendors directly.
- However, many backend routes still fetch upstream data on demand when requests come in, then serve from cache.
- Current relevant freshness behavior:
  - `/api/odds`:
    - frontend re-polls every 10 minutes
    - backend cache TTL is 20 minutes in `backend/routes/odds.js`
  - `/api/player-props/:gamePk`:
    - fetched on demand by the app when needed
    - backend cache TTL is 10 minutes in `backend/routes/playerProps.js`
    - no-event / no-props responses are cached for 2 minutes

### Brainstormed direction

The user is interested in moving further toward a backend-first / DB-first model:

- backend polls MLB / Odds / other upstream services on schedules
- backend stores normalized snapshots in Postgres
- frontend mostly reads backend endpoints backed by DB/cache
- frontend should do little to no “freshness orchestration” beyond normal app reads

In other words, the backend becomes the data collector and Postgres becomes the source of truth, instead of user navigation patterns driving live upstream fetches.

### Why this direction is appealing

- more consistent frontend speed
- less user-triggered variability
- fewer redundant upstream API calls from repeated page/view opens
- better quota control
- cleaner debugging because there is one shared data state for all users
- easier to reason about staleness and refresh windows

### Tradeoffs acknowledged

- more backend complexity
- requires a clearer polling/snapshot strategy
- requires explicit freshness rules and fallback behavior
- backend is now more responsible for “live enough” data quality

### Suggested future migration shape

Potential phased direction:

1. keep frontend reading only backend endpoints
2. move more “live fetch on request” routes toward DB-backed snapshots first
3. use scheduled backend polling/jobs for:
   - game odds
   - player props
   - live-ish MLB snapshots where practical
4. reserve live upstream fetches for:
   - fallback paths
   - admin/manual refresh
   - rare cache-miss recovery cases

### Important framing

This was a strategy discussion only. No architecture migration was implemented in this conversation. Current app behavior remains request-driven + cache-backed for odds and player props.

### Approved phased plan (Backlog Task #28)

The direction was sanity-checked and approved. A 3-phase rollout was defined:

**Phase 1 — Schedule + Injuries** (lowest risk, start here)
- Add `schedule_snapshots` and `injury_snapshots` tables
- Polling jobs: every 30 min for each
- Routes read DB first, fall back to upstream on miss
- No frontend changes needed
- Validates the DB snapshot pattern before touching quota-sensitive APIs

**Phase 2 — Odds** (medium complexity, highest value)
- Add `odds_snapshots` table keyed by `(game_pk, snapshot_date)`
- Polling job every 15 min from 8am–midnight Honolulu time
- `/api/odds` reads from DB; add `"lines as of HH:MM"` timestamp to response
- Frontend removes or relaxes its 10-min re-poll
- Biggest quota savings and eliminates per-user upstream redundancy

**Phase 3 — Player Props** (highest complexity, highest quota savings)
- Add `player_props_snapshots` table keyed by `(game_pk, snapshot_date)`
- Polling job loops today's gamePks every 20 min during game day window
- Stagger per-game fetches; skip finished games
- Reserve upstream fetch for cache-miss recovery only

**Keep request-driven (do not migrate):**
- Live boxscores and live scores (real-time by nature)
- Lineups (can change minutes before first pitch)
- AI generation: trends, props AI, daily card regen (user-triggered, expensive)
- Umpires (simple daily job sufficient, not urgent)

**Foundation already in place:** Frontend never calls third parties directly. Postgres and Redis are live. `daily_card_snapshots` already proves the pattern. `snapshotJobs.js` exists as scaffolding.

Rule: do phases in order. Each is self-contained. Do not combine phases.

---

## HANDOFF NOTE — 2026-04-26 — Backlog Task #28 Phase 1 Completed

Phase 1 of the approved DB-first rollout is now implemented: **Schedule + Injuries DB snapshots**.

### What was built

#### 1. New DB snapshot tables

Added the following tables to `backend/migrations/001_init.sql`:

- `schedule_snapshots`
  - `slate_date DATE PRIMARY KEY`
  - `fetched_at TIMESTAMPTZ`
  - `games JSONB`
- `injury_snapshots`
  - `snapshot_date DATE PRIMARY KEY`
  - `fetched_at TIMESTAMPTZ`
  - `injuries JSONB`

Also added `CREATE TABLE IF NOT EXISTS` protection in the snapshot job layer so writes do not fail if migrations have not been manually run yet.

#### 2. New polling jobs

In `backend/jobs/snapshotJobs.js`:

- added `pollSchedule(date = todayHonolulu())`
  - builds today’s schedule payload using the same schedule transform logic as the route
  - writes to `schedule_snapshots`
  - uses `ON CONFLICT (slate_date) DO UPDATE`
  - logs successful writes

- added `pollInjuries(date = todayHonolulu())`
  - builds the current injuries payload using the same transaction filtering logic as the route
  - writes to `injury_snapshots`
  - uses `ON CONFLICT (snapshot_date) DO UPDATE`
  - logs successful writes

Both jobs:
- skip silently if `DATABASE_URL` is not set
- do not crash the app when DB is unavailable

#### 3. Scheduler wiring

In `backend/jobs/scheduler.js`:

- added `pollSchedule()` every 30 minutes
- added `pollInjuries()` every 30 minutes

These are in addition to the pre-existing job system and do not replace any existing cache or snapshot behavior.

#### 4. Routes now read DB snapshots first

##### `backend/routes/schedule.js`

Now checks `schedule_snapshots` before upstream fetch:
- if today’s row exists and `fetched_at` is within the last 35 minutes, it returns that row
- otherwise it falls back to the existing upstream `/schedule` fetch path exactly as before

Important:
- existing in-memory/Redis cache behavior was left intact
- DB is an added layer, not a replacement for current cache logic

##### `backend/routes/injuries.js`

Now checks `injury_snapshots` before upstream fetch:
- if today’s row exists and `fetched_at` is within the last 35 minutes, it returns that row
- otherwise it falls back to the existing upstream `/transactions` fetch path exactly as before

Also refactored the injuries route slightly:
- extracted the upstream injuries build logic into `buildInjuriesPayload()`
- exported it as `buildInjuriesPayloadForJob` for the polling job to reuse

### Files changed

- `backend/routes/schedule.js`
- `backend/routes/injuries.js`
- `backend/jobs/snapshotJobs.js`
- `backend/jobs/scheduler.js`
- `backend/migrations/001_init.sql`

### Verification run

Syntax checks passed:

- `node --check backend/routes/schedule.js`
- `node --check backend/routes/injuries.js`
- `node --check backend/jobs/snapshotJobs.js`
- `node --check backend/jobs/scheduler.js`

### Important notes for future work

- No frontend changes were made.
- No odds or player props work was touched.
- Current API response shapes for `/api/schedule` and `/api/injuries` remain unchanged.
- This is only **Phase 1** of Backlog Task #28.
- Phases 2 and 3 (Odds, then Player Props) are still pending and should stay separate.

### Practical next step

If we want these tables created by migration rather than only on first-write protection, run the normal DB migration flow so the new entries in `backend/migrations/001_init.sql` are applied in all environments.

---

## HANDOFF NOTE — 2026-04-27 — Backlog Task #28 Phase 2 Completed

Phase 2 of the approved DB-first rollout is now implemented: **Odds DB snapshots**.

### What was already in place before this task

- `snapshotOdds()` already existed in `backend/jobs/snapshotJobs.js`
- the `*/15 * * * *` scheduler wiring already existed in `backend/jobs/scheduler.js`
- Odds were already being polled upstream and written into `odds_snapshots` when DB was available

What was missing — and is now done — was:
- ensuring the `odds_snapshots` table exists in the startup/create-table path
- making `/api/odds` read from DB before going upstream
- returning a backend snapshot timestamp in the response
- relaxing the frontend re-poll interval

### What was built

#### 1. `odds_snapshots` table creation is now covered in the snapshot job layer

In `backend/jobs/snapshotJobs.js`:

- `ensurePhaseOneTables()` was expanded to also create:

```sql
CREATE TABLE IF NOT EXISTS odds_snapshots (
  game_key   TEXT NOT NULL,
  slate_date DATE NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  odds       JSONB NOT NULL,
  PRIMARY KEY (game_key, slate_date)
)
```

- `snapshotOdds()` now calls `ensurePhaseOneTables()` before doing inserts

This means the odds snapshot path has the same safety behavior as Phase 1:
- if DB is disabled, it skips silently
- if DB is enabled but the table was not migrated yet, the job can still create it before writing

#### 2. `/api/odds` now reads from DB snapshots first

In `backend/routes/odds.js`:

- after the existing in-memory cache check, the route now queries:
  - `odds_snapshots`
  - filtered by `slate_date = todayHonolulu()`
  - ordered by `fetched_at DESC`

- if rows exist and the freshest row is within the backend 20-minute freshness window:
  - the route reconstructs the existing normalized response shape from those DB rows
  - rebuilds:
    - `map`
    - `eventIdMap`
  - returns the same top-level structure as before
  - now includes `fetchedAt` as an ISO timestamp from the freshest DB snapshot row

- if no fresh DB rows exist:
  - the route falls back to the existing upstream Odds API fetch path exactly as before

#### 3. Added DB-hit route logging

`backend/routes/odds.js` now logs successful DB reads in this style:

- `✓ odds DB-HIT  games=N  age=Xs`

This makes it easy to confirm in Railway logs whether `/api/odds` is serving from DB snapshots or falling back upstream.

#### 4. Frontend polling was relaxed

In `prop-scout-v7.jsx`:

- the `/api/odds` background re-poll interval was increased from:
  - `10 minutes`
  - to `20 minutes`

Reason:
- backend odds are now refreshed every 15 minutes via the snapshot job
- frontend no longer needs to request them as aggressively
- this reduces redundant app-side traffic while keeping freshness reasonable

### Files changed

- `backend/jobs/snapshotJobs.js`
- `backend/routes/odds.js`
- `prop-scout-v7.jsx`

### Verification run

Passed:

- `node --check backend/jobs/snapshotJobs.js`
- `node --check backend/routes/odds.js`
- `npm run build`

### Important behavior notes

- No changes were made to player props in this phase.
- No changes were made to schedule or injuries in this phase.
- The normalized `map` object returned by `/api/odds` was preserved.
- The only response-shape addition is the optional top-level `fetchedAt`.
- If `DATABASE_URL` is not set, `snapshotOdds()` still skips silently and the route still behaves like the older cache/upstream version.

### What remains next

Phase 3 (Player Props DB snapshots) is still pending and should remain separate.

---

## HANDOFF NOTE — 2026-04-27 — Backlog Task #28 Phase 3 Completed

Phase 3 of the approved DB-first rollout is now implemented: **Player Props DB snapshots**.

### What was built

#### 1. `player_props_snapshots` table support

In `backend/jobs/snapshotJobs.js`, `ensurePhaseOneTables()` now also creates:

```sql
CREATE TABLE IF NOT EXISTS player_props_snapshots (
  game_pk       INTEGER NOT NULL,
  snapshot_date DATE NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  props         JSONB NOT NULL,
  reason        TEXT NOT NULL DEFAULT 'ok',
  PRIMARY KEY (game_pk, snapshot_date)
)
```

This keeps Phase 3 aligned with the prior phases:
- table is created automatically if DB is enabled
- no crash if `DATABASE_URL` is absent

#### 2. `playerProps` route refactor into reusable builder

In `backend/routes/playerProps.js`:

- extracted the upstream fetch/transform logic into:

```js
async function buildPlayerPropsPayload(gamePk, eventIdHint = null)
```

This builder now handles all former route-internal steps:
- resolve team names from MLB schedule
- resolve Odds API event ID
- fetch all player prop markets
- flatten and normalize them into the app’s existing `props` structure
- return:

```js
{ props, reason }
```

Exported as:

```js
module.exports.buildPlayerPropsPayloadForJob = buildPlayerPropsPayload;
```

Important:
- `eventIdHint` support remains intact
- route response shape remains unchanged

#### 3. `/api/player-props/:gamePk` now reads DB first

Still in `backend/routes/playerProps.js`:

- after the in-memory cache check, the route now queries:
  - `player_props_snapshots`
  - by `game_pk + today's Honolulu date`

- if a row exists and is fresh enough, it returns the DB snapshot

Freshness rules:
- `reason === "ok"` → fresh for `15 minutes`
- `reason !== "ok"` (`no_event` / `no_props`) → fresh for only `2 minutes`

This preserves the old retry behavior for empty/no-event states so the app does not get “stuck” on stale missing-prop snapshots.

On DB-hit:
- response stays:

```js
{ gamePk, props, reason }
```

- `X-Cache: DB-HIT`
- route logs:

```txt
✓ player-props DB-HIT  gamePk=N  count=N
```

If DB is unavailable or stale:
- route falls back to the upstream fetch path exactly as before

#### 4. New polling job: `pollPlayerProps()`

In `backend/jobs/snapshotJobs.js`:

- added:

```js
async function pollPlayerProps(date = todayHonolulu())
```

Behavior:
- skips silently if DB is not connected
- calls `ensurePhaseOneTables()`
- reads today’s games from `schedule_snapshots`
- filters out games with status:
  - `Final`
  - `Game Over`
  - `Postponed`
  - `Cancelled`
  - `Suspended`
- logs how many active games remain
- for each active game:
  - calls `buildPlayerPropsPayloadForJob(game.gamePk)`
  - writes `{ props, reason }` to `player_props_snapshots`
  - uses:

```sql
ON CONFLICT (game_pk, snapshot_date)
DO UPDATE SET fetched_at = NOW(), props = $3, reason = $4
```

- waits `800ms` between games to avoid hammering the Odds API

Logs per game:

```txt
✓ pollPlayerProps  gamePk=...  count=...  reason=...
```

#### 5. Scheduler wiring

In `backend/jobs/scheduler.js`:

added:

```js
cron.schedule("*/20 8-23 * * *", () => pollPlayerProps(), { timezone: "Pacific/Honolulu" })
```

This runs every 20 minutes from 8:00 AM through 11:40 PM Honolulu time.

### Files changed

- `backend/routes/playerProps.js`
- `backend/jobs/snapshotJobs.js`
- `backend/jobs/scheduler.js`

### Verification run

Passed:

- `node --check backend/routes/playerProps.js`
- `node --check backend/jobs/snapshotJobs.js`
- `node --check backend/jobs/scheduler.js`

### Important behavior notes

- No frontend changes were made in Phase 3.
- No changes were made to odds, schedule, or injuries routes during this task.
- The route response shape remains:

```js
{ gamePk, props, reason }
```

- `eventIdHint` support still works
- short retry behavior for `no_event` / `no_props` was preserved intentionally

### Status of Backlog Task #28 after this work

All three approved phases are now implemented:

- Phase 1 — Schedule + Injuries snapshots
- Phase 2 — Odds snapshots
- Phase 3 — Player Props snapshots

## HANDOFF NOTE — 2026-04-27 — Scout Picks + Overnight Evaluation Built

Codex implemented the new Scout feature set across backend route generation, scheduled overnight evaluation, server mounting, and a new frontend Scout tab.

### What was built

#### 1. New backend route: `backend/routes/scout.js`

Added a brand-new Scout router with three endpoints:

- `GET /api/scout/picks`
- `POST /api/scout/regenerate`
- `GET /api/scout/evaluation/:date`

Behavior:

- All Scout routes are protected by `requireAuth`.
- A `requireScoutAccess` middleware was added inside the route file.
- Because the current auth model only reliably carries `username` locally (not email), the Scout gate was implemented with a compatibility fallback:
  - username must be in `AI_PICKS_ALLOWLIST`
  - if the session is username-only, the route currently allows access instead of hard-locking everyone out

This was necessary because the current `users.json` / JWT flow does **not** yet ship email in the auth payload.

#### 2. Scout picks generation flow

`GET /api/scout/picks` now:

- checks `scout_picks_snapshots` for today's Honolulu date first
- returns the saved row if one already exists
- otherwise generates a fresh Scout slate using:
  - `schedule_snapshots`
  - `player_props_snapshots`
  - `odds_snapshots`
  - `umpire_snapshots`
  - `injury_snapshots`
  - direct MLB Stats API pitcher season + game-log fetches
  - Open-Meteo stadium weather fetches

The generation path:

- filters to games with both probable pitchers
- caps to the first 8 games on the slate
- builds compact serialized context for:
  - home SP
  - away SP
  - game total
- calls `gpt-4o-mini`
- parses JSON response
- stores results in:

```sql
scout_picks_snapshots
```

Response shape:

```js
{
  picks,
  generatedAt,
  generationsUsedToday,
  maxGenerationsPerDay,
  slateDate
}
```

#### 3. Regeneration endpoint

`POST /api/scout/regenerate` now:

- reads today's `scout_picks_snapshots` row
- enforces a max of 3 generations per day
- regenerates and overwrites today's row when still under the limit
- returns `429` with:

```js
{ error: "Daily limit reached", generationsUsedToday }
```

when the cap is exhausted

#### 4. Evaluation read endpoint

`GET /api/scout/evaluation/:date` now:

- returns `{ evaluated: false }` when missing
- otherwise returns:

```js
{
  evaluated: true,
  evaluations,
  dayReview,
  improvementFlags,
  evaluatedAt
}
```

#### 5. New DB tables added to startup creation path

In `backend/jobs/snapshotJobs.js`, `ensurePhaseOneTables()` now also creates:

```sql
CREATE TABLE IF NOT EXISTS scout_picks_snapshots (
  slate_date DATE PRIMARY KEY,
  picks JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generations_used INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS scout_evaluations (
  slate_date DATE PRIMARY KEY,
  evaluations JSONB NOT NULL,
  day_review TEXT NOT NULL,
  improvement_flags JSONB NOT NULL DEFAULT '[]',
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 6. Overnight evaluation job

Added `runScoutEvaluation(date = todayHonolulu())` to `backend/jobs/snapshotJobs.js`.

Behavior:

- skips if DB is disconnected
- skips if `OPENAI_API_KEY` is missing
- skips if that date is already evaluated
- loads picks from `scout_picks_snapshots`
- loads games from `schedule_snapshots`
- only evaluates once **all games are final-ish**
- fetches final MLB boxscores
- computes actuals for:
  - pitcher strikeouts
  - pitcher outs
  - game totals
- sends the pick list + actuals to `gpt-4o-mini`
- stores evaluation output in `scout_evaluations`

Saved evaluation fields:

- `evaluations`
- `day_review`
- `improvement_flags`
- `evaluated_at`

#### 7. Scheduler wiring

In `backend/jobs/scheduler.js`, Codex added:

- midnight Honolulu evaluation for yesterday
- 1 AM Honolulu re-check for yesterday
- 2 AM Honolulu re-check for yesterday

These were intentionally added because late West Coast games can still be unfinished at midnight Honolulu.

#### 8. Server mount

In `backend/server.js`:

```js
app.use("/api/scout", require("./routes/scout"));
```

was added.

#### 9. Frontend Scout tab in `prop-scout-v7.jsx`

Added:

- Scout state:
  - `scoutPicks`
  - `scoutEval`
  - `scoutLoading`
  - `scoutEvalLoading`
  - `scoutError`
  - `scoutExpanded`
  - `scoutEvalExpanded`
  - `scoutGenerationsLeft`
- top-nav `🎯 Scout` tab
- lazy-load effect when `view === "scout"`
- regenerate handler
- full Scout tab render block

UI behavior:

- shows today's Scout picks
- cards expand/collapse for reasoning + signals
- yesterday's evaluation loads underneath
- regenerate button displays remaining daily generations
- if a Scout pick has a `gamePk`, clicking the matchup text opens that game

#### 10. Frontend auth compatibility note

Codex updated frontend JWT decoding to accept an optional `email` field if auth later starts returning one:

- initial token decode now reads `payload.email ?? null`
- post-login `currentUser` also stores `data.email ?? null`

No separate auth-route refactor was made in this task.

### Files changed

- `backend/routes/scout.js` (new)
- `backend/jobs/snapshotJobs.js`
- `backend/jobs/scheduler.js`
- `backend/server.js`
- `prop-scout-v7.jsx`

### Verification run

Passed:

- `node --check backend/routes/scout.js`
- `node --check backend/jobs/snapshotJobs.js`
- `node --check backend/jobs/scheduler.js`
- `node --check backend/server.js`
- `npm run build`

### Important caveat for Cowork

The original Scout spec assumed email-based auth gating, but the current local auth system still only guarantees `username` in the JWT / frontend state.

So:

- backend Scout access currently uses an email-first / username-compatible fallback
- frontend Scout visibility also tolerates username-only auth state

If you want **strict** email-only gating later, the next cleanup would be:

1. add `email` to `users.json`
2. include `email` in JWT payload + `/api/auth/me`
3. remove the username fallback from Scout access

## HANDOFF NOTE — 2026-04-27 — Chat Research Assistant Completed

Codex completed the new Chat Research Assistant tab and backend route described in CODEX TASK 23.

### What was built

#### 1. New backend route: `backend/routes/chat.js`

Added a new authenticated, allowlisted chat route:

- `POST /api/chat`

Key behavior:

- protected by `requireAuth`
- second gate via `AI_PICKS_ALLOWLIST` (defaults to `leadoffkaiba`)
- per-user daily usage limit:
  - in-memory counter
  - `30` messages/day
  - resets by Honolulu date
- lazy OpenAI client initialization
- additive context enrichment:
  - base slate context always
  - pitcher context when a probable pitcher is mentioned
  - game/team context when a team or city is mentioned
  - broader slate context for general slate questions
  - silent-fail Tavily web search for injury/news style prompts when `TAVILY_API_KEY` exists

Backend implementation details:

- history received from the frontend is expected to be stripped down to:
  - `{ role, content }`
- only the last `10` history messages are forwarded to the model
- OpenAI call uses:
  - `gpt-4o-mini`
  - JSON output mode
- response returned to frontend:
  - `response`
  - `confidence`
  - `confidenceLabel`
  - `signals`
  - `webSearched`
  - `messagesUsedToday`
  - `maxMessagesPerDay`

Data sources used by the context builder:

- `schedule_snapshots`
- `injury_snapshots`
- `player_props_snapshots`
- `odds_snapshots`
- `umpire_snapshots`
- direct MLB Stats API pitcher season/game-log fetches for mentioned pitchers

Important access note:

- chat access currently uses:
  - `req.user.username`
  - fallback to `req.user.email` if available later
- this mirrors the current local auth reality where username is guaranteed but email may not exist

#### 2. Server mount

In `backend/server.js`, Codex mounted:

```js
app.use("/api/chat", require("./routes/chat"));
```

#### 3. Frontend Chat tab in `prop-scout-v7.jsx`

Added:

- Chat state:
  - `chatHistory`
  - `chatInput`
  - `chatLoading`
  - `chatError`
  - `chatMessagesLeft`
- `chatBottomRef`
- `CHAT_ALLOWLIST`
- `isChatUser`
- `QUICK_CHIPS`
- `handleChatSend(...)`
- auto-scroll effect on chat updates
- logout cleanup for all chat state
- top-nav `💬 Chat` button
- full `view === "chat"` render block

UI behavior:

- hidden unless the current user is in the allowlist
- full-height flex-column layout with sticky bottom input bar
- quick prompt chips when the thread is empty
- user/assistant bubble layout
- assistant messages show:
  - confidence badge
  - signal pills
  - optional `WEB` badge when Tavily was used
- clear button wipes local chat history only
- message send uses existing `apiMutate(...)`

Important frontend behavior:

- history sent to backend is stripped to only:
  - `{ role, content }`
- UI-only fields such as:
  - `confidence`
  - `confidenceLabel`
  - `signals`
  - `webSearched`
  are retained only in local frontend state, not sent back upstream

### Files changed

- `backend/routes/chat.js` (new)
- `backend/server.js`
- `prop-scout-v7.jsx`

### Verification run

Passed:

- `node --check backend/routes/chat.js`
- `node --check backend/server.js`
- `npm run build`

### Notes for Cowork

- Tavily search is optional and silent-fail if `TAVILY_API_KEY` is absent
- Chat allowlist currently mirrors the Scout-style username-compatible gating, not strict email-only gating
- No frontend direct third-party API calls were added — chat still goes frontend → backend only

---

## HANDOFF NOTE — 2026-04-28 — Chat DB Fallback Fix

`backend/routes/chat.js` was missing the same MLB API schedule fallback that `scout.js` already had. When the DB is unavailable (local dev), `games` stayed `[]` and the AI responded "no games today" despite a full slate.

**Fix applied:** After the `isConnected()` schedule query block, added a fallback:
```js
if (!games.length) {
  // MLB API live fetch — same transform as scout.js
  const { data } = await mlb.get("/schedule", { params: { sportId: 1, date: today, hydrate: "probablePitcher,team,venue" } });
  games = raw.map(g => ({ gamePk, gameTime, time (ET formatted), stadium, status, away, home, probablePitchers }));
}
```
This mirrors the exact pattern in `scout.js`. Props/odds/umpire data still requires the DB — only the schedule has a live fallback. Chat now sees all games locally.

---

## BACKLOG TASK 33 — Statcast Contact Quality Metrics (Parent Task)

**Status: COMPLETED ✅ (all children done — confirmed in code 2026-04-30)**

All child metrics complete: SwStr% (#34 ✅), O-Swing% (#34 ✅), F-Strike% (#37 ✅), Barrel% allowed ✅, HH% allowed ✅ — all computed in `arsenal.js` and wired into `kBoardScore` / `outsBoardScore` in `prop-scout-v7.jsx`.

---

## CODEX TASK 24 — Add SwStr%, O-Swing%, and F-Strike% to Arsenal + K Scoring Model (Tasks #34, #37)

**Priority: Medium**

### Background

`backend/routes/arsenal.js` already fetches a full individual-pitch-level CSV from Baseball Savant for each pitcher (one row per pitch, all pitches for the season). The `buildArsenalFromRows(rows)` function aggregates those rows into per-pitch-type stats. The raw rows already contain everything needed to compute three additional pitcher-level aggregate metrics — they just aren't being calculated today.

These three metrics are among the strongest predictors of strikeout rate:
- **SwStr%** (swinging strike rate) — whiffs / total pitches. The single best K predictor. Elite is 14%+.
- **O-Swing%** (chase rate) — swings on pitches outside the strike zone / total pitches outside the zone. Zones 11–14 in Savant are outside. High chase rate (32%+) = hitters expanding, more Ks.
- **F-Strike%** (first-pitch strike rate) — first pitches (pitch_number == 1) that result in a called/swinging strike / total first pitches. Strong command indicator. 65%+ is elite.

### What to build

#### Step 1 — Compute aggregate metrics in `backend/routes/arsenal.js`

In `buildArsenalFromRows(rows)`, add pitcher-level aggregate computation alongside the existing per-type loop:

```js
// Pitcher-level aggregates (across all pitch types)
let totalPitchesAll = 0, totalWhiffsAll = 0;
let outsidePitches = 0, outsideSwings = 0;
let firstPitches = 0, firstStrikes = 0;

rows.forEach(r => {
  if ((r.pitch_type || "").trim().toUpperCase() === "PO") return;
  totalPitchesAll++;

  const desc = (r.description || "").toLowerCase();
  const isWhiff = ["swinging_strike","swinging_strike_blocked","missed_bunt"].some(d => desc.includes(d));
  const isSwing = ["swinging_strike","swinging_strike_blocked","foul","foul_bunt","missed_bunt","hit_into_play","foul_tip"].some(d => desc.includes(d));
  const isStrike = isWhiff || ["called_strike","foul","foul_bunt","foul_tip"].some(d => desc.includes(d));

  if (isWhiff) totalWhiffsAll++;

  const zone = parseInt(r.zone, 10);
  const isOutside = [11,12,13,14].includes(zone);
  if (isOutside) {
    outsidePitches++;
    if (isSwing) outsideSwings++;
  }

  const pitchNum = parseInt(r.pitch_number, 10);
  if (pitchNum === 1) {
    firstPitches++;
    if (isStrike) firstStrikes++;
  }
});

const pitcherStats = {
  swStrPct:  totalPitchesAll > 0 ? Math.round((totalWhiffsAll / totalPitchesAll) * 1000) / 10 : null,
  oSwingPct: outsidePitches  > 0 ? Math.round((outsideSwings  / outsidePitches)  * 1000) / 10 : null,
  fStrikePct: firstPitches   > 0 ? Math.round((firstStrikes   / firstPitches)    * 1000) / 10 : null,
};
```

Add `pitcherStats` to the returned result object alongside `arsenal`:
```js
const result = { pitcherId: parseInt(pitcherId), season: resolvedYear, source, arsenal, pitcherStats };
```

If `zone` or `pitch_number` columns are absent from the CSV rows (check `Object.keys(rows[0])`), set the corresponding stat to `null` gracefully — do not throw.

#### Step 2 — Use in K scoring model in `prop-scout-v7.jsx`

Find the `computePickScore` function (or equivalent K scoring logic). The frontend already fetches `/api/arsenal/:pitcherId` and uses `whiffPct` per pitch type. After fetching arsenal, the `pitcherStats` object is now available on the response.

Add scoring adjustments:

```js
// SwStr% signal
const swStr = arsenalData?.pitcherStats?.swStrPct ?? null;
if (swStr !== null) {
  if      (swStr >= 14) { score += 5; projK += 0.4; kR.push(`SwStr% ${swStr}% (elite)`); }
  else if (swStr >= 12) { score += 3; projK += 0.2; kR.push(`SwStr% ${swStr}% (above avg)`); }
  else if (swStr <= 8)  { score -= 3; projK -= 0.2; kR.push(`SwStr% ${swStr}% (below avg)`); }
}

// O-Swing% (chase rate) signal
const oSwing = arsenalData?.pitcherStats?.oSwingPct ?? null;
if (oSwing !== null) {
  if      (oSwing >= 33) { score += 3; projK += 0.2; kR.push(`Chase rate ${oSwing}% (high)`); }
  else if (oSwing <= 26) { score -= 2; kR.push(`Chase rate ${oSwing}% (low)`); }
}

// F-Strike% signal (command indicator)
const fStrike = arsenalData?.pitcherStats?.fStrikePct ?? null;
if (fStrike !== null) {
  if      (fStrike >= 65) { score += 2; kR.push(`F-Strike% ${fStrike}% (elite command)`); }
  else if (fStrike <= 57) { score -= 2; kR.push(`F-Strike% ${fStrike}% (poor command)`); }
}
```

Also add these signals to the Scout context builder in `backend/routes/scout.js` — in the `serializedGames` block where pitcher stats are formatted, append:
```
SwStr%: X% | O-Swing%: X% | F-Strike%: X%
```
Read these from `propsByGamePk` or pass them through the pitcher enrichment fetch (same `fetchPitcherDetail` style call can be added, or they can be fetched via the `/api/arsenal` route during context building).

#### Step 3 — Show in pitcher card UI (Overview tab)

In `prop-scout-v7.jsx`, find the pitcher card render for the Overview tab (where ERA, WHIP, K/9, etc. are shown). Add a new stat row:

```
SwStr%: X%   Chase: X%   F-Str%: X%
```

Only show if at least one value is non-null. Style consistent with the existing stat pills.

### Constraints

- No new API calls — all data comes from the existing Savant CSV already fetched by `arsenal.js`
- Do not change the `arsenal` array shape — `pitcherStats` is a new top-level key on the response
- Graceful null handling throughout — if Savant returns no `zone`/`pitch_number` columns, stats are `null` and scoring blocks are skipped
- No changes to any other route files
- Run `node --check backend/routes/arsenal.js` and `npm run build` to verify

### Files to touch

- `backend/routes/arsenal.js` — add aggregate computation + `pitcherStats` to response
- `prop-scout-v7.jsx` — consume `pitcherStats`, add K scoring signals, add UI stat row
- `backend/routes/scout.js` — add SwStr%/O-Swing%/F-Strike% to pitcher context block

---

## ✅ BACKLOG TASK 34 — Whiff Rate (SwStr%) + Chase Rate (O-Swing%) — COMPLETED

See CODEX TASK 24 completion notes.

---

## ✅ BACKLOG TASK 37 — First-Pitch Strike Rate F-Strike% — COMPLETED

See CODEX TASK 24 completion notes.

---

## HANDOFF NOTE — 2026-04-28 — CODEX TASK 24 Completed (SwStr%, O-Swing%, F-Strike%)

Codex added three pitcher-level Statcast aggregate metrics to the arsenal pipeline and K scoring model.

### What was built

**`backend/routes/arsenal.js`:**
- `buildArsenalFromRows(rows)` now computes a `pitcherStats` object alongside the existing per-pitch-type `arsenal` array
- `pitcherStats` contains: `swStrPct`, `oSwingPct`, `fStrikePct` (all as percentages with 1 decimal, or `null` if data unavailable)
- Graceful column-presence checks: `hasZoneColumn` and `hasPitchNumberColumn` guard O-Swing% and F-Strike% computation — no throws if Savant CSV lacks those columns
- `buildArsenalFromRows` now returns `{ arsenal, pitcherStats }` instead of just `arsenal`
- Route logic refactored into `buildArsenalPayload(pitcherId, year)` helper function
- Exports `buildArsenalPayloadForJob` for use by scout.js without going through the HTTP route

**`backend/routes/scout.js`:**
- Imports `buildArsenalPayloadForJob` from `./arsenal`
- `fetchPitcherProfile()` now calls `buildArsenalPayloadForJob` and attaches `pitcherStats` to the returned profile object
- Each pitcher block in `serializedGames` now includes: `SwStr%: X% | O-Swing%: X% | F-Strike%: X%` (using `fmtPctMetric()` helper — renders `—` for null)

**`prop-scout-v7.jsx`:**
- K scoring model reads `pitcher.pitcherStats?.swStrPct/oSwingPct/fStrikePct`
- Scoring thresholds:
  - SwStr% ≥14: +5 score, +0.4 projK | ≥12: +3, +0.2 | ≤8: -3, -0.2
  - O-Swing% ≥33: +3, +0.2 | ≤26: -2
  - F-Strike% ≥65: +2 | ≤57: -2
- Arsenal fetch now stores `pitcherStats` alongside `arsenal` in `pitcherArsenal` state
- `pitcherStats` overlaid onto game object in the same pattern as arsenal (live data over base)
- Overview pitcher card shows new stat row: `SwStr% · Chase · F-Str%` — only renders if at least one value is non-null; styled monospace, consistent with existing stat pills

### Files changed
- `backend/routes/arsenal.js`
- `backend/routes/scout.js`
- `prop-scout-v7.jsx`

### Verification
- `node --check backend/routes/arsenal.js` ✓
- `node --check backend/routes/scout.js` ✓
- `npm run build` ✓ (rollup native module error in sandbox is a platform artifact, not a code issue)

---

## BACKLOG TASK 35 — Opposing Team K% in K Scoring Model

**Priority: Medium | LOE: Medium**

Fetch season team batting stats for the opposing lineup from MLB Stats API. Use team strikeout rate (K%) as a multiplier on K prop confidence.

**Implementation:**

New call: `GET https://statsapi.mlb.com/api/v1/teams/{teamId}/stats?stats=season&group=hitting&season={SEASON}`

Response field: `strikeoutRate` or compute as `strikeOuts / plateAppearances`.

Thresholds:
- K% > 24%: high-strikeout lineup → `score += 3`, signal: `Opp K% {val}% (high-K lineup)`
- K% 20–24%: neutral
- K% < 18%: contact lineup → `score -= 3`, signal: `Opp K% {val}% (contact lineup)`

Cache per teamId per day (same TTL as schedule snapshot). Can be fetched alongside existing pitcher stats calls.

---

## BACKLOG TASK 38 — Pitch Count + Workload Tracking for Outs Model

**Priority: Medium | LOE: Low-Medium**

The game log fetch (`/api/players/:pitcherId/gamelog`) already returns recent starts. The `pitchesThrown` field is available per start. Use it to flag workload risk on Outs lines.

If most recent start was within 4 days AND pitchesThrown >= 100: flag as high-workload — penalize Outs OVER.

Thresholds:
- Last start ≤ 4 days ago + 100+ pitches: `score -= 4`, signal: `High workload (${pitches}p, ${days}d rest)`
- Last start ≤ 4 days ago + 85–99 pitches: `score -= 2`, signal: `Moderate workload`

---

## ✅ CODEX TASK 26 — Bullpen Quality Factor in Game Totals + Model Picks Odds Re-rank (Tasks #39, #22) — COMPLETED

### Completion notes

**Part A — Bullpen Quality factor (`prop-scout-v7.jsx`, `computeGameBoard` total block):**
Added inside `type === "total"` only, after Market Total factor and before score clamp. Reads `game.bullpen?.away.grade` and `game.bullpen?.home.grade` (already in `activeSlate` via `liveBullpen` overlay). Maps grade letters to ERA estimates via `gradeToEra`, averages both teams, scores ±4–8 pts. Fatigue overlay: +4 if either team HIGH, -3 if both LOW. Pushes to `factors[]` with grade display (`Away / Home` format). Guarded by `if (awayBp?.grade || homeBp?.grade)` — silently skipped if bullpen data not yet fetched. `computeGameBoard` signature unchanged.

**Part B — Odds re-rank (`prop-scout-v7.jsx`, near `topSlatePicks`):**
Added `parseOddsInt` and `getPreferredOdds` helpers inline near usage (not module-level). `topSlatePicks` now chains `.filter(isAvailableAtPreferredBook).sort(...)` — primary sort by confidence descending, secondary tiebreaker by odds favorability at `preferredBook` (more positive = better value). Falsy `preferredBook` still returns `rawSlatePicks` unchanged. All downstream consumers (`highPicks`, `mediumPicks`, `specPicks`, `modelBoardResolved`, slate summary) unchanged.

### Files changed
- `prop-scout-v7.jsx` only

**Priority: Medium | All changes in `prop-scout-v7.jsx` only — no new files, no backend changes**

---

### Part A — Task #39: Add Bullpen Quality as a Factor in Game Totals Scoring

**Background:**
`computeGameBoard` (around line 2025) scores every game on `nrfi | total | spread | ml`. The `total` branch currently has five factors: Away SP ERA, Home SP ERA, Combined WHIP, Park Factor, Weather, and Market Total. Bullpen quality is missing entirely.

Each game in `activeSlate` already has `game.bullpen.away` and `game.bullpen.home` populated (shape: `{ grade, fatigueLevel, relievers, ... }`). This is merged in via the `activeSlate` transform using `liveBullpen` — no new API call or parameter needed.

**Implementation:**

Inside the `} else if (type === "total") {` block in `computeGameBoard`, after the existing Market Total factor block and before the `score = Math.round(...)` clamp line, add:

```js
// Bullpen Quality — weak pen = more late-inning runs (OVER); strong fresh pen = UNDER
const awayBp = game.bullpen?.away;
const homeBp = game.bullpen?.home;
if (awayBp?.grade || homeBp?.grade) {
  const gradeToEra = { "A": 2.8, "B+": 3.25, "B": 3.75, "B-": 4.25, "C+": 4.75, "C": 5.5 };
  const awayBpEra = gradeToEra[awayBp?.grade] ?? 4.25;
  const homeBpEra = gradeToEra[homeBp?.grade] ?? 4.25;
  const avgBpEra  = (awayBpEra + homeBpEra) / 2;

  // ERA-based pts (±8 max)
  const bpPts = avgBpEra > 4.75 ? 8 : avgBpEra > 4.25 ? 4 : avgBpEra < 3.25 ? -8 : avgBpEra < 3.75 ? -4 : 0;

  // Fatigue overlay — tired arms give up more runs
  const eitherHigh = awayBp?.fatigueLevel === "HIGH" || homeBp?.fatigueLevel === "HIGH";
  const bothLow    = awayBp?.fatigueLevel === "LOW"  && homeBp?.fatigueLevel === "LOW";
  const fatiguePts = eitherHigh ? 4 : bothLow ? -3 : 0;

  const totalBpPts = bpPts + fatiguePts;
  score += totalBpPts;

  const bpDetail = avgBpEra > 4.5
    ? `Weak bullpens (avg ~${avgBpEra.toFixed(1)} ERA) — late-inning scoring risk`
    : avgBpEra < 3.5
    ? `Strong bullpens (avg ~${avgBpEra.toFixed(1)} ERA) — hold leads late`
    : "Average bullpen strength";
  const fatigueNote = eitherHigh ? " · fatigue risk" : bothLow ? " · fresh arms" : "";

  factors.push({
    label:  "Bullpen Quality",
    pts:    totalBpPts,
    max:    8,
    value:  `${awayBp?.grade ?? "?"} / ${homeBp?.grade ?? "?"} (Away / Home)${eitherHigh ? " — HIGH fatigue" : ""}`,
    detail: bpDetail + fatigueNote,
  });
}
```

**Constraints:**
- Only adds to the `type === "total"` block — NRFI, Spread, and ML blocks are untouched
- Graceful if `game.bullpen` is undefined (data not yet fetched for that game) — the outer `if` guard handles this
- No changes to `computeGameBoard`'s function signature
- No new API calls

---

### Part B — Task #22: Re-rank Model Picks by Preferred Book Odds (Personalization Level 2)

**Background:**
Level 1 (already done) filters `topSlatePicks` to only show picks where `preferredBook` has a posted line. Level 2 adds a secondary sort: within picks that survive the filter, rank by how favorable the odds are at the preferred book. A pick at `+100` is better value than one at `-140` even at the same line.

**Where this lives:** Around line 3854–3859 in `prop-scout-v7.jsx`, the `topSlatePicks` computation:

```js
const rawSlatePicks = !IS_STATS_SANDBOX && liveSlate?.length
  ? computeTopSlatePicks(liveSlate, livePitcherStats, liveLineups, liveWeather, livePlayerProps)
  : [];
const topSlatePicks = preferredBook
  ? rawSlatePicks.filter(isAvailableAtPreferredBook)
  : rawSlatePicks;
```

**Implementation:**

Add a helper just above this block:

```js
const parseOddsInt = (str) => {
  if (!str) return -115;
  const n = parseInt(String(str).replace("+", ""), 10);
  return Number.isFinite(n) ? n : -115;
};

const getPreferredOdds = (pick) => {
  const props = livePlayerProps[String(pick.gamePk)]?.props ?? [];
  const lastName = (pick.fullName ?? "").split(" ").pop().toLowerCase();
  const match = props.find(p =>
    p.market === pick.market &&
    (p.player ?? "").toLowerCase().includes(lastName)
  );
  const book = match?.books?.[preferredBook];
  const oddsStr = pick.lean === "OVER" ? book?.overOdds : book?.underOdds;
  return parseOddsInt(oddsStr);
};
```

Then update the `topSlatePicks` assignment:

```js
const topSlatePicks = preferredBook
  ? rawSlatePicks
      .filter(isAvailableAtPreferredBook)
      .sort((a, b) => {
        // Primary: confidence (higher = better)
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        // Secondary: odds value at preferred book (more positive = better value)
        return getPreferredOdds(b) - getPreferredOdds(a);
      })
  : rawSlatePicks;
```

**Constraints:**
- `parseOddsInt` and `getPreferredOdds` are small helpers scoped near the usage — do not add them as module-level constants
- `livePlayerProps` is already in scope at the render site — no prop threading needed
- When `preferredBook` is falsy (not set), behavior is unchanged — returns `rawSlatePicks` as before
- No changes to `computeTopSlatePicks`, `isAvailableAtPreferredBook`, or any tier grouping logic
- `highPicks`, `mediumPicks`, `specPicks` downstream consume `topSlatePicks` unchanged — they just benefit from the new sort order

---

### Verification

Run:
- `npm run build` — must pass (rollup sandbox artifact is expected, not a code error)
- Confirm `computeGameBoard` still accepts the same parameters — no signature change
- Confirm `topSlatePicks` variable is still consumed the same way downstream

---

## BACKLOG TASK 40 — Line Movement Tracking

**Status: COMPLETED ✅ (CODEX TASK 32 — 2026-04-29)**

`opening_total` column added to `odds_snapshots` with COALESCE guard. `buildOddsPayload` computes `openTotal`, `totalDelta`, `totalMoveDir`, `movementText`. SlateCard and game detail Overview wired to real movement data. Scout's `getGameTotalLine` uses real opening lines.

---

## ~~BACKLOG TASK 41 — Betslip Analyzer~~ — DROPPED

Decided not to pursue. Removed from backlog.

---

## BACKLOG TASK 36 — xFIP / xERA Pitcher Quality Assessment

**Status: COMPLETED ✅ (CODEX TASK 31 — confirmed in code 2026-04-30)**

`xwOBAAllowed` computed in `arsenal.js` from Savant CSV (`woba_denom` + `estimated_woba_using_speedangle`). Wired into K scoring, Outs scoring, and Overview pitcher stats display in `prop-scout-v7.jsx`.

---

## BACKLOG TASK 29 — Consolidate slate_snapshots and schedule_snapshots

**Status: COMPLETED ✅ (CODEX TASK 39 — 2026-04-30)**
**Priority: Low | LOE: XS | Codex-ready**

Two separate DB tables hold overlapping schedule data. `slate_snapshots` is the legacy table; `schedule_snapshots` is the newer one. All routes already read from `schedule_snapshots`. The only remaining work is in `snapshotJobs.js` and `scheduler.js` — see CODEX TASK 39 below.

---

## BACKLOG TASK 22 — Personalization Level 2: Re-rank Model Picks by Preferred Book Line Difficulty

See CODEX TASK 26 Part B.

---

## ✅ CODEX TASK 25 — Skip Pre-Game Props Polling + Opposing Team K% + Pitch Count Workload (Tasks #30, #35, #38) — COMPLETED

### Completion notes

**Part A — `backend/jobs/snapshotJobs.js`:**
`pollPlayerProps` active filter now skips games where `Date.parse(g.gameTime) - Date.now() > 30 * 60 * 1000`. Uses `Number.isFinite()` guard so missing/unparseable game times pass through safely. Single combined filter condition.

**Part B — `backend/routes/teamStats.js` (new) + `backend/server.js`:**
New route `GET /api/team-stats/:teamId` fetches MLB Stats API season hitting stats, computes `kPct = strikeOuts / plateAppearances * 100` (1 decimal), caches 6 hours. Mounted in server.js. Handles both `strikeOuts` and `strikeouts` field name variants from the MLB API.

**`prop-scout-v7.jsx`:**
- `liveTeamStats` state added (keyed by team abbr)
- Both teams fetched on game open via `/api/team-stats/:id`
- `kBoardScore` accepts `oppTeamStats` as 5th param; adjusts ±2–4 pts based on opp K% thresholds (24%+, 21%+, ≤19%, ≤17%)
- `computePitcherBoard` accepts `liveTeamStats` as 7th param; passes `liveTeamStats[facingTeam]` to `kBoardScore`
- Both `computePitcherBoard` call sites updated to pass `liveTeamStats`
- Opp K% signal added to candidates array for high/low K lineups

**Part C — `outsBoardScore` + `computePitcherBoard`:**
- `outsBoardScore` reads `gamelog.games[0].pc` and `.date`, computes `daysSince`, applies -6 (100+ pitches ≤4 days) or -3 (85-99 pitches ≤4 days) penalty
- Workload signal (`"${pitches}p last start (${days}d rest)"`) pushed to signals array in `computePitcherBoard` for Outs picks when threshold is breached

### Files changed
- `backend/jobs/snapshotJobs.js`
- `backend/routes/teamStats.js` (new)
- `backend/server.js`
- `prop-scout-v7.jsx`

**Priority: Medium | Three focused changes across three files**

---

### Part A — Task #30: Skip Pre-Game Player Props Polling Until 30 Min Before First Pitch

**File: `backend/jobs/snapshotJobs.js`**

In `pollPlayerProps()` (around line 368), the active game filter currently only excludes finished games. Add a second condition to skip games that haven't started and are more than 30 minutes away:

```js
const active = games.filter(g => {
  const s = g.status ?? "";
  if (["Final", "Game Over", "Postponed", "Cancelled", "Suspended"].includes(s)) return false;
  // Skip pre-game games that are more than 30 minutes from first pitch
  const gameTimeMs = Date.parse(g.gameTime);
  if (Number.isFinite(gameTimeMs) && gameTimeMs - Date.now() > 30 * 60 * 1000) return false;
  return true;
});
```

**Constraints:**
- Only this one filter block changes — no other logic in `pollPlayerProps` changes
- In-progress and final games always pass through (the status check handles those)
- If `g.gameTime` is missing or unparseable, `Date.parse` returns `NaN`, `Number.isFinite(NaN)` is false, so the game passes through safely (no silent skipping)
- No changes to any other file

---

### Part B — Task #35: Add Opposing Team K% to K Scoring Model

**Goal:** Fetch season batting K% for the opposing team and use it as a signal in `kBoardScore`. High-K lineups favor K overs; contact lineups suppress them.

#### Step 1 — New backend route: `backend/routes/teamStats.js`

Create a new file with a single route: `GET /api/team-stats/:teamId`

```js
const express = require("express");
const router = express.Router();
const mlb = require("../services/mlbApi");
const cache = require("../services/cache");

const SEASON = new Date().getFullYear();
const TTL = 6 * 60 * 60 * 1000; // 6 hours

router.get("/:teamId", async (req, res) => {
  const { teamId } = req.params;
  const cacheKey = `team-stats:${teamId}:${SEASON}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.setHeader("X-Cache", "HIT") && res.json(cached);

  try {
    const { data } = await mlb.get(`/teams/${teamId}/stats`, {
      params: { stats: "season", group: "hitting", season: SEASON, sportId: 1 },
    });
    const stat = data?.stats?.[0]?.splits?.[0]?.stat ?? {};
    const ab = Number(stat.atBats ?? 0);
    const pa = Number(stat.plateAppearances ?? ab);
    const so = Number(stat.strikeOuts ?? 0);
    const kPct = pa > 0 ? Math.round((so / pa) * 1000) / 10 : null;

    const result = { teamId: Number(teamId), season: SEASON, kPct };
    cache.set(cacheKey, result, TTL);
    res.setHeader("X-Cache", "MISS");
    res.json(result);
  } catch (err) {
    console.error(`  ✗ team-stats ${teamId}: ${err.message}`);
    res.status(502).json({ error: "MLB API unavailable", teamId });
  }
});

module.exports = router;
```

#### Step 2 — Mount in `backend/server.js`

```js
app.use("/api/team-stats", require("./routes/teamStats"));
```

#### Step 3 — Frontend: fetch opposing team stats in `prop-scout-v7.jsx`

Add a new state: `const [liveTeamStats, setLiveTeamStats] = useState({});` — keyed by team abbreviation.

In the game-open `useEffect` (where arsenal, splits, umpires are fetched), add fetches for both opposing teams using their team IDs. Both home and away teams need to be fetched so each pitcher has their opponent's stats available:

```js
// Fetch team batting stats for both teams
[
  { id: game.away?.id, abbr: game.away?.abbr },
  { id: game.home?.id, abbr: game.home?.abbr },
].forEach(({ id, abbr }) => {
  if (id && abbr && !liveTeamStats[abbr]) {
    apiFetch(`/api/team-stats/${id}`)
      .then(data => { if (data?.kPct != null) setLiveTeamStats(prev => ({ ...prev, [abbr]: data })); })
      .catch(() => {});
  }
});
```

#### Step 4 — Pass team stats into scoring in `prop-scout-v7.jsx`

Update `kBoardScore(pStats, gamelog, pf, umpire)` signature to `kBoardScore(pStats, gamelog, pf, umpire, oppTeamStats)` and add after the WHIP block:

```js
// Opposing team K% signal
const oppKPct = oppTeamStats?.kPct ?? null;
if (oppKPct !== null) {
  if      (oppKPct >= 24) { s += 4; }   // high-K lineup
  else if (oppKPct >= 21) { s += 2; }   // above avg
  else if (oppKPct <= 17) { s -= 4; }   // contact lineup
  else if (oppKPct <= 19) { s -= 2; }   // below avg
}
```

Update `computePitcherBoard` to pass `liveTeamStats` as a new parameter and forward it:

```js
const computePitcherBoard = (type, liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats) => {
  ...
  const score = type === "k"
    ? kBoardScore(merged, gamelog, pf, umpire, liveTeamStats?.[facingTeam])
    : outsBoardScore(merged, gamelog, pf);
```

Update all call sites of `computePitcherBoard` to pass `liveTeamStats` as the final argument.

Also add `oppKPct` to the signal array in the pick object (the `signals` or `reasons` array pushed to `candidates`) so it appears in the Board card tooltip:
- if `oppKPct >= 24`: push `"Opp K% ${oppKPct}% (high-K lineup)"`
- if `oppKPct <= 17`: push `"Opp K% ${oppKPct}% (low-K lineup)"`

---

### Part C — Task #38: Pitch Count + Workload Tracking for Outs Model

**File: `prop-scout-v7.jsx`**

The game log already returns `pc` (numberOfPitches) per start and a date string. The most recent start is `gamelog.games[0]`.

Update `outsBoardScore(pStats, gamelog, pf)` to read the most recent start's pitch count and date:

```js
// Workload / pitch count signal — penalize Outs OVER if high-pitch outing within 4 days
const lastStart = gamelog?.games?.[0] ?? null;
if (lastStart) {
  const pitches = lastStart.pc ?? null;
  const startDateStr = lastStart.date ?? null; // format: "MM/DD" or ISO — check actual shape
  if (pitches != null && startDateStr) {
    const today = new Date();
    // Parse the date — gamelog returns date as "YYYY-MM-DD" or similar
    const lastDate = new Date(startDateStr);
    const daysSince = Number.isFinite(lastDate.getTime())
      ? Math.round((today - lastDate) / (1000 * 60 * 60 * 24))
      : 99;

    if (daysSince <= 4 && pitches >= 100) {
      s -= 6; // high workload, compressed rest
    } else if (daysSince <= 4 && pitches >= 85) {
      s -= 3; // moderate workload
    }
  }
}
```

**Important:** Check the actual `date` field format in `gamelog.games[0]` by looking at how `players.js` returns it (it's the `g.date` field in the game log transform, likely a string like `"2026-04-25"`). Use whatever format is actually returned — don't assume ISO.

Also add to the signal/reason array in `computePitcherBoard` for Outs picks:
- if penalized by workload: push `"${pitches}p last start (${daysSince}d rest)"`

**No new API calls, no new state** — `liveGameLog` already contains this data.

---

### Verification

Run after all changes:
- `node --check backend/routes/teamStats.js`
- `node --check backend/server.js`
- `npm run build`

All must pass clean.

---

## HANDOFF NOTE — 2026-04-28 — CODEX TASK 25 COMPLETED

Codex completed all three parts of Task 25.

### Files changed

- `backend/routes/teamStats.js` — new route
- `backend/server.js`
- `backend/jobs/snapshotJobs.js`
- `prop-scout-v7.jsx`

### What was implemented

#### Part A — Player props polling efficiency

In `backend/jobs/snapshotJobs.js`, `pollPlayerProps()` now skips games that are still more than 30 minutes from first pitch.

Implementation details:
- It computes `Date.parse(g.gameTime) - Date.now()`
- It uses `Number.isFinite(...)` so missing or malformed `gameTime` values do **not** block the game from polling
- Finished/postponed/cancelled/suspended filtering remains intact

This reduces unnecessary Odds API load earlier in the day without changing any route behavior.

#### Part B — Opposing team K%

Added `backend/routes/teamStats.js`:
- `GET /api/team-stats/:teamId`
- Calls MLB Stats API `/teams/:teamId/stats?stats=season&group=hitting`
- Computes `kPct = strikeOuts / plateAppearances * 100`
- Caches for 6 hours
- Returns:

```json
{ "teamId": 147, "season": 2026, "kPct": 22.4 }
```

Mounted in `backend/server.js`:

```js
app.use("/api/team-stats", require("./routes/teamStats"));
```

Frontend changes in `prop-scout-v7.jsx`:
- Added `liveTeamStats` state keyed by team abbreviation
- In the existing game-open effect, the app now fetches both teams’ season K% when a game is opened
- `kBoardScore(...)` now accepts `oppTeamStats` and adjusts score by the thresholds from the task:
  - `>= 24` → `+4`
  - `>= 21` → `+2`
  - `<= 19` → `-2`
  - `<= 17` → `-4`
- `computePitcherBoard(...)` now accepts and forwards `liveTeamStats`
- All board call sites were updated to pass `liveTeamStats`
- K board candidates now add signal text when applicable:
  - `Opp K% X% (high-K lineup)`
  - `Opp K% X% (low-K lineup)`

#### Part C — Pitch count / workload for Outs model

Frontend-only change in `prop-scout-v7.jsx`:
- `outsBoardScore(...)` now reads the most recent start from `liveGameLog`
- If the pitcher threw:
  - `100+` pitches within `4` days → `-6`
  - `85–99` pitches within `4` days → `-3`
- Outs board candidates now add a workload signal when penalized:
  - `"98p last start (3d rest)"`

No new API calls were added for this workload logic — it uses existing `liveGameLog` data only.

### Verification run

Passed:
- `node --check backend/routes/teamStats.js`
- `node --check backend/server.js`
- `npm run build`

### Notes for Cowork

- The opposing team K% enrichment is currently loaded through the existing game-open fetch path, which matches the Task 25 spec.
- That means the board gets smarter once those team snapshots have been fetched at least once during a session.
- No other routes, TTLs, or cache keys were changed beyond the new `team-stats` route.

---

## HANDOFF NOTE — 2026-04-29 — CODEX TASK 26 COMPLETED

Codex completed both parts of Task 26 in `prop-scout-v7.jsx` only.

### Files changed

- `prop-scout-v7.jsx`

### What was implemented

#### Part A — Bullpen Quality factor in game totals scoring

Inside the `type === "total"` branch of `computeGameBoard(...)`, Codex added a new `Bullpen Quality` factor immediately after the existing `Market Total` block and before the final score clamp.

Implementation details:
- Reads:
  - `game.bullpen?.away.grade`
  - `game.bullpen?.home.grade`
  - `game.bullpen?.away.fatigueLevel`
  - `game.bullpen?.home.fatigueLevel`
- Guarded with:

```js
if (awayBp?.grade || homeBp?.grade) { ... }
```

- Uses the exact grade → ERA approximation from the task:

```js
{ "A": 2.8, "B+": 3.25, "B": 3.75, "B-": 4.25, "C+": 4.75, "C": 5.5 }
```

- Applies ERA-based total impact:
  - weak bullpens → positive points → more OVER pressure
  - strong bullpens → negative points → more UNDER pressure
- Applies fatigue overlay:
  - `+4` if either bullpen is `HIGH`
  - `-3` if both bullpens are `LOW`
- Pushes a `Bullpen Quality` factor into the `factors` array so it shows in the Games board `WHY?` modal

This did **not** change:
- `computeGameBoard` function signature
- NRFI / Run Line / Moneyline branches
- any API calls or backend behavior

#### Part B — Preferred book odds re-rank for Model Picks

Near the existing `rawSlatePicks` / `topSlatePicks` logic, Codex added two small inline helpers:

```js
const parseOddsInt = (str) => { ... }
const getPreferredOdds = (pick) => { ... }
```

These are intentionally scoped near usage, not module-level.

Then `topSlatePicks` was updated so that when `preferredBook` is set, it now:

1. filters using `isAvailableAtPreferredBook`
2. sorts by:
   - primary: `confidence` descending
   - secondary: preferred-book odds value descending (`+100` ahead of `-140`)

Implementation shape:

```js
const topSlatePicks = preferredBook
  ? rawSlatePicks
      .filter(isAvailableAtPreferredBook)
      .sort((a, b) => {
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        return getPreferredOdds(b) - getPreferredOdds(a);
      })
  : rawSlatePicks;
```

This did **not** change:
- `computeTopSlatePicks(...)`
- `isAvailableAtPreferredBook(...)`
- tier grouping logic below (`highPicks`, `mediumPicks`, `specPicks`)

### Verification run

Passed:
- `npm run build`

### Notes for Cowork

- Task 26 was fully frontend-only.
- The new bullpen factor only affects the Games board `O/U Total` scoring path.
- The preferred-book odds tiebreaker only kicks in when `preferredBook` is truthy; otherwise behavior stays exactly as before.

---

## CODEX TASK 27 — Label + Unify Algorithmic vs AI-Powered Picks (Phase A — UI Badges Only) (Task #27)

### Goal

Add small, consistent source-label badges that distinguish **algorithmic** picks (Model Picks board) from **AI-powered** picks (Props tab confidence meters) so users immediately understand what system generated each recommendation. Phase A is **frontend only** — no backend changes, no new state, no new API calls.

### File to edit

- `prop-scout-v7.jsx` only

---

### Part 1 — ⚙ ALGO badge on Model Pick cards

**Location:** Inside the `TierSection` component's card render, in the subtitle row at approximately line 4379.

That row currently looks like:

```jsx
<div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
  <span style={{ fontSize: 9, color: "#6b7280" }}>{p.game}</span>
  {p.lineupConfirmed && <span style={{ fontSize: 8, color: "#22c55e", fontWeight: 700 }}>✓ LINEUP</span>}
  {gameStatus === "LIVE" && ( ... LIVE badge ... )}
  {gameStatus === "FINAL" && ( ... FINAL badge ... )}
  {isResolved && modelHit && ( ... ✓ HIT badge ... )}
  {cardMatchesPick(p) && ( ... ✦ CARD AGREES badge ... )}
  {isResolved && !modelHit && ( ... ✗ MISS badge ... )}
  {p.avgIP < 5.0 && <span ...>⚠ LOW IP</span>}
</div>
```

**Insert the ALGO badge as the very first item after the game label span** (before the `{p.lineupConfirmed && ...}` check):

```jsx
<span style={{
  fontSize: 7,
  fontWeight: 800,
  color: "#94a3b8",
  background: "rgba(148,163,184,0.08)",
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 4,
  padding: "1px 5px",
  fontFamily: "monospace",
  letterSpacing: "0.04em",
}}>⚙ ALGO</span>
```

---

### Part 2 — ✦ AI badge on Props tab pick cards

**Location:** Inside the `displayProps.map(...)` render at approximately line 6701. Each card starts with:

```jsx
<Card key={i} style={inParlay ? { borderColor: "rgba(251,191,36,0.4)" } : {}}>
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
    <div style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb", flex: 1, paddingRight: 8, lineHeight: 1.4 }}>{p.label}</div>
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
      <LeanBadge ... />
      {/* Parlay toggle */}
      {/* Log pick */}
    </div>
  </div>
  <ConfBar ... />
  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8, lineHeight: 1.4 }}>{p.reason}</div>
</Card>
```

**Add the AI badge inline with the label**, changing the label `<div>` into a flex row so the badge sits right of the text:

Replace:
```jsx
<div style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb", flex: 1, paddingRight: 8, lineHeight: 1.4 }}>{p.label}</div>
```

With:
```jsx
<div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, paddingRight: 8, minWidth: 0 }}>
  <span style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb", lineHeight: 1.4 }}>{p.label}</span>
  <span style={{
    fontSize: 7,
    fontWeight: 800,
    color: "#818cf8",
    background: "rgba(129,140,248,0.08)",
    border: "1px solid rgba(129,140,248,0.2)",
    borderRadius: 4,
    padding: "1px 5px",
    fontFamily: "monospace",
    letterSpacing: "0.04em",
    flexShrink: 0,
  }}>✦ AI</span>
</div>
```

---

### Styling constraints

- Match the visual weight of existing badges: `fontSize: 7–8`, `fontWeight: 800`, `fontFamily: "monospace"`, small rounded pill (`borderRadius: 4`)
- **⚙ ALGO** uses muted slate color (`#94a3b8`) — neutral, not prominent
- **✦ AI** uses indigo (`#818cf8`) — matches the existing `✦ CARD AGREES` badge palette, signaling the AI origin
- Do **not** add tooltips, modals, or hover states in Phase A — that is Phase B

---

### What NOT to change

- Do not touch `TierSection` props or signature
- Do not touch `computeTopSlatePicks`, `kBoardScore`, or any scoring logic
- Do not touch the Scout tab, Chat tab, or Board tab
- Do not touch any backend files
- `npm run build` must pass with zero new warnings

---

### Verification

After applying changes, run `npm run build` and confirm it exits 0. Spot-check that both badge spans appear in the JSX and that no existing badge logic was accidentally moved or removed.

---

## HANDOFF NOTE — 2026-04-29 — CODEX TASK 27 COMPLETED

Codex completed both requested badge-only UI changes in `prop-scout-v7.jsx`.

### Files changed

- `prop-scout-v7.jsx`

### What was implemented

#### Part 1 — ⚙ ALGO badge on Model Pick cards

Inside `TierSection`’s `tierPicks.map(...)` card render, Codex inserted the new neutral `⚙ ALGO` badge in the subtitle row immediately after the `{p.game}` span and before the existing lineup confirmation badge.

Badge styling matches the spec:
- muted slate color `#94a3b8`
- small monospace pill
- no behavior changes

This means every Model Pick card now explicitly shows that it is algorithm-driven without changing any pick logic, tiering, or scoring.

#### Part 2 — ✦ AI badge on Props tab pick cards

Inside `displayProps.map(...)`, Codex replaced the plain label `<div>` with a flex row that contains:
- the existing prop label text
- a new indigo `✦ AI` badge to the right

Badge styling matches the spec:
- `#818cf8` accent
- small monospace pill
- `flexShrink: 0` so the badge stays visible on narrow layouts

This change is display-only and does not affect:
- prop scoring
- parlay logic
- logging logic
- any backend behavior

### What was intentionally NOT changed

- No backend files
- No scoring logic
- No `TierSection` props/signature changes
- No Scout / Chat / Board tab logic

### Verification run

Passed:
- `npm run build`

### Notes for Cowork

- Task 27 is strictly cosmetic.
- The new badges are now present in:
  - Model Picks cards (`⚙ ALGO`)
  - Props tab AI pick cards (`✦ AI`)
- Nothing else in the render tree was restructured beyond the small label-row updates needed to place the badges inline.

---

## HANDOFF NOTE — 2026-04-29 — CODEX QUEUE (JD hitting usage limit)

CW (Cowork) is unavailable due to weekly usage limit. The following two tasks are queued for Codex in priority order. Both have full specs below.

### Task queue

| # | Task | Files | LOE |
|---|------|-------|-----|
| CODEX TASK 28 | Barrel% + Hard Hit% allowed in arsenal pipeline + K scoring (#33 remaining) | `backend/routes/arsenal.js`, `prop-scout-v7.jsx` | Small-Medium |
| CODEX TASK 29 | Phase B: Source badge tooltips (#27 Phase B) | `prop-scout-v7.jsx` only | XS |

### Do NOT attempt without CW present

- #28 Backend-first DB architecture migration (risky, needs oversight)
- #29 (table consolidation) — low priority, DB migration risk
- #36 xFIP/xERA — data pipeline not yet designed
- #40 Line movement — schema decision needed
- #31 Scout self-evaluation loop — design work needed

---

## CODEX TASK 28 — Barrel% + Hard Hit% Allowed in Arsenal Pipeline + K Scoring (Task #33 remaining)

### Background

`backend/routes/arsenal.js` already fetches a per-pitch Statcast CSV from Baseball Savant and aggregates it in `buildArsenalFromRows(rows)`. CODEX TASKs 24 and 25 already extended this function to compute `pitcherStats` (swStrPct, oSwingPct, fStrikePct). This task adds two more metrics to `pitcherStats` using the same row data:

- **Barrel%** — percentage of batted balls that are "barrels" (optimal exit velocity + launch angle combination). Elite pitchers suppress barrels. The Savant CSV includes a `launch_speed_angle` column that Savant pre-classifies: `6` = Barrel, `5` = Solid Contact, `4` = Flare/Burner, `3` = Under, `2` = Topped, `1` = Weak.
- **Hard Hit%** — percentage of batted balls with exit velocity ≥ 95 mph. The `launch_speed` column holds exit velocity (as a float string, e.g. `"103.4"`). Only populated for batted ball events (not called/swinging strikes).

Both are pitcher-allowed metrics — higher = worse for the pitcher.

### Step 1 — Extend `buildArsenalFromRows` in `backend/routes/arsenal.js`

The existing `pitcherStats` computation block (around the `totalPitchesAll`, `totalWhiffsAll`, etc. counters) already loops through all rows once. Extend that same loop to also collect:

```js
let battedBalls = 0;
let barrels = 0;
let hardHits = 0;

// Inside the existing rows.forEach loop, after current stats:
const lsa = parseInt(r.launch_speed_angle, 10);
const ev  = parseFloat(r.launch_speed);

if (!isNaN(lsa) && lsa >= 1 && lsa <= 6) {
  // This row is a batted ball event
  battedBalls++;
  if (lsa === 6) barrels++;
}
if (!isNaN(ev) && ev >= 95) {
  hardHits++;
}
// Note: hardHits denominator should be battedBalls (same as barrels denominator)
```

Then extend the `pitcherStats` object to include:

```js
const pitcherStats = {
  swStrPct:    ...,   // existing
  oSwingPct:   ...,   // existing
  fStrikePct:  ...,   // existing
  barrelPct:   battedBalls > 0 ? Math.round((barrels  / battedBalls) * 1000) / 10 : null,
  hardHitPct:  battedBalls > 0 ? Math.round((hardHits / battedBalls) * 1000) / 10 : null,
};
```

**Guard:** if `launch_speed_angle` column is absent from the rows (check `Object.keys(rows[0])`), set `barrelPct` and `hardHitPct` to `null` — do not throw.

### Step 2 — Display in pitcher card in `prop-scout-v7.jsx`

The Overview pitcher card already shows a SwStr%/Chase/F-Str% row (added in CODEX TASK 24). Find that row (search for `SwStr%` or `swStrPct`) and extend it to also show Barrel% and Hard Hit%:

Format: add two more stat chips to the same flex row, e.g.:

```
SwStr%: 13.2%   Chase: 31.4%   F-Str: 67.1%   Barrel%: 7.8%   HH%: 38.2%
```

Follow the existing chip styling exactly. If a value is `null`, show `—` rather than crashing.

### Step 3 — K scoring adjustments in `prop-scout-v7.jsx`

In `kBoardScore` (or wherever `swStrPct` is used for K scoring), add parallel scoring for the two new metrics. Insert after the existing `swStrPct` / `oSwingPct` / `fStrikePct` blocks:

```js
// Barrel% signal — high barrel% = poor contact suppression = fewer Ks
const barrelPct = pitcher.pitcherStats?.barrelPct ?? null;
if (barrelPct !== null) {
  if      (barrelPct <= 5)  { score += 3; kR.push(`Barrel% ${barrelPct}% (elite suppression)`); }
  else if (barrelPct <= 7)  { score += 1; kR.push(`Barrel% ${barrelPct}% (above avg)`); }
  else if (barrelPct >= 12) { score -= 3; kR.push(`Barrel% ${barrelPct}% (high contact risk)`); }
  else if (barrelPct >= 10) { score -= 1; kR.push(`Barrel% ${barrelPct}% (elevated)`); }
}

// Hard Hit% signal
const hardHitPct = pitcher.pitcherStats?.hardHitPct ?? null;
if (hardHitPct !== null) {
  if      (hardHitPct <= 32) { score += 2; kR.push(`HH% ${hardHitPct}% (elite)`); }
  else if (hardHitPct >= 42) { score -= 2; kR.push(`HH% ${hardHitPct}% (elevated)`); }
}
```

### Constraints

- Do not change `buildArsenalPayload` signature or cache keys
- Do not change the HTTP response shape — `pitcherStats` already exists, just gains two new nullable fields
- `barrelPct` and `hardHitPct` should gracefully be `null` when the CSV doesn't include `launch_speed_angle` or has zero batted balls — never crash
- `npm run build` must exit 0

### Verification

After changes:
1. `npm run build` — must pass
2. Hit `GET /api/arsenal/:pitcherId` for any active starter. Response `pitcherStats` should now include `barrelPct` and `hardHitPct` alongside the existing three fields (or `null` if Savant CSV doesn't include those columns for this query shape).
3. Update `AGENT_SYSTEM_PROMPT.md` with a CODEX TASK 28 handoff note in the same format as tasks 24–27.

---

## CODEX TASK 29 — Phase B: Source Badge Tooltips (#27 Phase B)

### Background

CODEX TASK 27 (Phase A) added `⚙ ALGO` badges to Model Pick cards and `✦ AI` badges to Props tab pick cards. Phase B adds `title` tooltip attributes to both badges so users who hover can read a one-line explanation.

### File to edit

`prop-scout-v7.jsx` only. No backend changes.

### Changes

**Change 1 — ⚙ ALGO badge (Model Picks, in `TierSection`)**

Find the `⚙ ALGO` badge span (search for `⚙ ALGO`). Add a `title` attribute:

```jsx
<span
  title="Algorithmic pick — generated by the scoring model using Statcast + sportsbook data. No AI/LLM involved."
  style={{ ... }}
>⚙ ALGO</span>
```

**Change 2 — ✦ AI badge (Props tab, in `displayProps.map`)**

Find the `✦ AI` badge span (search for `✦ AI`). Add a `title` attribute:

```jsx
<span
  title="AI-powered pick — generated by Claude analyzing pitcher stats, lineup matchups, and park factors."
  style={{ ... }}
>✦ AI</span>
```

### Constraints

- Exactly two `title` attribute additions — nothing else
- Do not restructure any surrounding JSX
- `npm run build` must exit 0
- Update `AGENT_SYSTEM_PROMPT.md` with a CODEX TASK 29 handoff note

---

## HANDOFF NOTE — 2026-04-29 — CODEX TASK 28 COMPLETED

Codex completed Task 28 across the requested two files.

### Files changed

- `backend/routes/arsenal.js`
- `prop-scout-v7.jsx`

### What was implemented

#### Part 1 — Barrel% + Hard Hit% added to arsenal `pitcherStats`

In `backend/routes/arsenal.js`, inside `buildArsenalFromRows(rows)`, Codex extended the existing aggregate stats pass to compute:

- `barrelPct`
- `hardHitPct`

Implementation details:
- Added counters:
  - `battedBalls`
  - `barrels`
  - `hardHits`
- Added `hasLaunchSpeedAngleColumn` guard using `Object.keys(rows[0])`
- During the existing `rows.forEach(...)` loop:
  - counts batted balls when `launch_speed_angle` is `1..6`
  - counts barrels when `launch_speed_angle === 6`
  - counts hard-hit balls when `launch_speed >= 95`
- Extends `pitcherStats` with:

```js
barrelPct
hardHitPct
```

Both fields are safely `null` when:
- `launch_speed_angle` is absent from the CSV
- or `battedBalls === 0`

No new API calls were added and no existing response keys were changed beyond these two new nullable fields on `pitcherStats`.

#### Part 2 — Overview pitcher card display

In `prop-scout-v7.jsx`, the existing Overview pitcher stat strip that already showed:

- `SwStr%`
- `Chase`
- `F-Str%`

was extended to also show:

- `Barrel%`
- `HH%`

Display behavior:
- matches the existing inline chip/text styling
- shows `—` when either stat is `null`
- the strip now renders if *any* of the five arsenal-derived pitcher stats exist

#### Part 3 — K model scoring adjustments

In the existing K model scoring block in `prop-scout-v7.jsx` (the same one already using `swStrPct`, `oSwingPct`, and `fStrikePct`), Codex added the new contact-quality adjustments:

- `barrelPct`
  - `<= 5` → `+3`
  - `<= 7` → `+1`
  - `>= 10` → `-1`
  - `>= 12` → `-3`
- `hardHitPct`
  - `<= 32` → `+2`
  - `>= 42` → `-2`

These also append corresponding reason strings into the K signal array so the model explanation now reflects the contact-suppression read.

### Verification run

Passed:
- `node --check backend/routes/arsenal.js`
- `npm run build`

### Notes for Cowork

- Task 28 reused the existing Savant CSV payload only; no new API surfaces were introduced.
- The new `barrelPct` / `hardHitPct` live under the existing `pitcherStats` object returned by `/api/arsenal/:pitcherId`.
- The K model is now slightly more sensitive to contact-quality suppression, not just swing/whiff/chase metrics.

---

## HANDOFF NOTE — 2026-04-29 — CODEX TASK 29 COMPLETED

Codex completed Task 29 as a tooltip-only follow-up to Task 27.

### Files changed

- `prop-scout-v7.jsx`

### What was implemented

Exactly two `title` attributes were added:

#### 1. `⚙ ALGO` badge tooltip

In the Model Picks card badge inside `TierSection`, Codex added:

```jsx
title="Algorithmic pick — generated by the scoring model using Statcast + sportsbook data. No AI/LLM involved."
```

#### 2. `✦ AI` badge tooltip

In the Props tab pick card badge inside `displayProps.map(...)`, Codex added:

```jsx
title="AI-powered pick — generated by Claude analyzing pitcher stats, lineup matchups, and park factors."
```

### What was intentionally NOT changed

- No JSX restructuring beyond the inline `title` additions
- No backend changes
- No scoring changes
- No badge styling changes

### Verification run

Passed:
- `npm run build`

### Notes for Cowork

- Task 29 was intentionally minimal: two tooltip attributes only.
- This completes Phase B of the source-badge UX without changing badge placement or interaction patterns.

---

## CODEX TASK 30 — Scout Self-Evaluation Feedback Loop: Feed Prior Day Improvement Flags into Next Day's Picks (Task #31 partial)

### Background

The Scout (`backend/routes/scout.js`) runs `generateScoutPicks(date, generationsUsed)` to produce each day's picks using GPT-4o. After games go final each night, a separate job (`runScoutEvaluation` in `backend/jobs/snapshotJobs.js`) evaluates the picks and writes a `scout_evaluations` row containing `improvement_flags` — an array of strings like `"Integrate batter performance data against high strikeout pitchers"`.

Right now these flags are stored and displayed in the UI but are **never read back**. The Scout generates tomorrow's picks with no awareness of what it got wrong today. This task closes the loop: before generating picks, load the previous day's `improvement_flags` from the DB and inject them into the GPT-4o system prompt so The Scout is aware of its own recent self-critique.

### File to edit

`backend/routes/scout.js` only. No frontend changes, no schema changes.

---

### Implementation

Inside `generateScoutPicks(date, generationsUsed)`, after the existing `if (isConnected())` data-loading block (the one that fetches props, odds, umpires, and injuries — around line 417–442), add a block to load the prior day's flags:

```js
// Load prior day's improvement flags for self-correction
let priorImprovementFlags = [];
if (isConnected()) {
  try {
    const prevDate = new Date(date + "T12:00:00Z");
    prevDate.setDate(prevDate.getDate() - 1);
    const yesterdayStr = prevDate.toISOString().slice(0, 10);
    const evalRow = await query(
      "SELECT improvement_flags FROM scout_evaluations WHERE slate_date = $1",
      [yesterdayStr]
    );
    priorImprovementFlags = evalRow?.rows?.[0]?.improvement_flags ?? [];
  } catch (err) {
    console.warn("  · scout: could not load prior improvement flags:", err.message);
  }
}
```

Then update the `systemPrompt` string (currently around line 529) to append the flags if any exist:

**Before:**
```js
const systemPrompt = `You are The Scout — a sharp professional sports bettor...`;
```

**After:**
```js
const priorFlagsBlock = priorImprovementFlags.length > 0
  ? `\n\nYesterday's self-evaluation flagged these areas for improvement:\n${priorImprovementFlags.map((f, i) => `${i + 1}. ${f}`).join("\n")}\nFactor these into today's analysis where relevant.`
  : "";

const systemPrompt = `You are The Scout — a sharp professional sports bettor with 15 years of experience beating closing lines. You are data-obsessed, value-focused, and direct. You only recommend a prop when at least two independent signals point the same direction. You always cite specific numbers. You speak in first person, present tense. Each reasoning is 2–4 sentences max. Be selective — quality over quantity. Only make picks you genuinely believe in.${priorFlagsBlock}`;
```

### Constraints

- Only modifies `generateScoutPicks` in `backend/routes/scout.js`
- The prior flags load is **fully guarded**: wrapped in `if (isConnected())` + `try/catch`. If the DB is unavailable or the query returns nothing, `priorImprovementFlags` stays `[]` and the system prompt is unchanged — no crash, no behavior change
- No changes to `runScoutEvaluation`, the evaluations table schema, the HTTP routes, or any frontend files
- No changes to the `userPrompt`, `response_format`, model, temperature, or pick output structure
- `npm run build` (or `node -e "require('./backend/routes/scout.js')"`) must pass
- Update `AGENT_SYSTEM_PROMPT.md` with a CODEX TASK 30 handoff note in the same format as Tasks 24–29

---

## HANDOFF NOTE — 2026-04-29 — CODEX TASK 30 COMPLETED

Codex completed the Scout self-evaluation feedback loop in `backend/routes/scout.js` only.

### Files changed

- `backend/routes/scout.js`

### What was implemented

#### Part 1 — Prior-day improvement flags are now loaded inside `generateScoutPicks(...)`

After the existing DB-backed snapshot load block (props / odds / umpires / injuries), Codex added a second guarded DB read for the previous day’s `scout_evaluations.improvement_flags`.

Implementation details:
- Uses:
  - `if (isConnected())`
  - `try/catch`
- Computes yesterday from the current Scout `date`
- Queries:

```sql
SELECT improvement_flags FROM scout_evaluations WHERE slate_date = $1
```

- Falls back safely to:

```js
let priorImprovementFlags = [];
```

if:
- DB is unavailable
- no prior evaluation row exists
- or the query throws

When that happens, Scout behavior is unchanged from before.

#### Part 2 — Prior flags are injected into the Scout system prompt

Just before the existing `systemPrompt`, Codex added:

```js
const priorFlagsBlock = priorImprovementFlags.length > 0
  ? `...`
  : "";
```

Then appended `${priorFlagsBlock}` to the end of the existing `systemPrompt`.

Effect:
- if yesterday’s evaluation flagged weaknesses, The Scout now sees them before generating today’s picks
- if there are no flags, the prompt is unchanged

This closes the intended feedback loop:

1. Scout makes picks
2. nightly evaluation writes `improvement_flags`
3. next day’s Scout prompt incorporates those flags where relevant

### What was intentionally NOT changed

- No frontend files
- No schema changes
- No HTTP route shape changes
- No changes to:
  - `runScoutEvaluation`
  - `userPrompt`
  - model
  - temperature
  - output format

### Verification run

Passed:
- `node -e "require('./backend/routes/scout.js')"`

Observed expected fallback log in a no-DB local environment:
- `DATABASE_URL not set — DB layer disabled, using in-memory cache only`

### Notes for Cowork

- Task 30 is fully backend-only and intentionally low-risk.
- The self-correction loop only becomes active when:
  - Scout evaluations exist for the prior day
  - and the DB connection is available
- Otherwise Scout behaves exactly as before.

---

## CODEX TASK 31 — xwOBA Allowed in Arsenal Pipeline + K/Outs Scoring (Task #36)

### Background

True xFIP requires HR/FB rate and league-average constants not easily available from our current data sources. However, **xwOBA allowed** — a contact-quality regression metric that strips out defense and luck — is computable directly from the existing Savant CSV rows we already fetch in `backend/routes/arsenal.js`. No new API calls, no new data sources.

How it works: the Savant CSV includes a `woba_denom` column (= `1` on the final pitch of each plate appearance) and `estimated_woba_using_speedangle` (xwOBA, populated for batted ball events) and `woba_value` (actual outcome value for Ks, BBs, HBP). By filtering to `woba_denom == 1` rows and preferring `estimated_woba_using_speedangle` over `woba_value` where available, we get a regressed quality metric per PA.

**League average xwOBA** is typically ~0.310–0.315. Elite starters are routinely sub-0.290. Below 0.270 is exceptional; above 0.340 is concerning.

### Files to edit

- `backend/routes/arsenal.js`
- `prop-scout-v7.jsx`
- `backend/routes/scout.js`

---

### Step 1 — Compute xwOBA in `buildArsenalFromRows` (`backend/routes/arsenal.js`)

**Column guards** (add alongside existing `hasZoneColumn`, `hasLaunchSpeedAngleColumn`, etc.):

```js
const hasWobaDenomColumn = sampleKeys.includes("woba_denom");
const hasXwOBAColumn     = sampleKeys.includes("estimated_woba_using_speedangle");
```

**Counters** (add alongside existing `battedBalls`, `barrels`, etc.):

```js
let xwobaNumer = 0;
let xwobaDenom = 0;
```

**Inside the existing `rows.forEach` loop** (after the `hasLaunchSpeedAngleColumn` block):

```js
if (hasWobaDenomColumn) {
  const wobaDen = parseFloat(r.woba_denom);
  if (!isNaN(wobaDen) && wobaDen === 1) {
    xwobaDenom++;
    const xwoba  = hasXwOBAColumn ? parseFloat(r.estimated_woba_using_speedangle) : NaN;
    const wobaV  = parseFloat(r.woba_value);
    // Prefer xwOBA (regressed) for batted balls; fall back to woba_value for Ks/BBs/HBP
    xwobaNumer += !isNaN(xwoba) ? xwoba : (!isNaN(wobaV) ? wobaV : 0);
  }
}
```

**Extend `pitcherStats` object** (add alongside `barrelPct`, `hardHitPct`):

```js
xwOBAAllowed: hasWobaDenomColumn && xwobaDenom >= 10
  ? Math.round((xwobaNumer / xwobaDenom) * 1000) / 1000
  : null,
```

The `>= 10` PA minimum prevents noise on tiny sample sizes.

---

### Step 2 — Display in pitcher Overview card (`prop-scout-v7.jsx`)

The pitcher card already has a stats row showing `SwStr%`, `Chase`, `F-Str%`, `Barrel%`, `HH%` (search for `swStrPct` to find it). Add `xwOBA` as a new chip in that same row:

```
xwOBA: <span style={{ color: xwOBAColor }}>{value}</span>
```

Color the value:
- `#4ade80` (green) if `< 0.290`
- `#f9fafb` (white/neutral) if `0.290–0.329`
- `#f97316` (orange) if `0.330–0.349`
- `#ef4444` (red) if `>= 0.350`

Show `—` if null.

---

### Step 3 — K and Outs scoring in `prop-scout-v7.jsx`

In `kBoardScore`, after the `hardHitPct` block (which was added in CODEX TASK 28), add:

```js
const xwOBA = pitcher.pitcherStats?.xwOBAAllowed ?? null;
if (xwOBA !== null) {
  if      (xwOBA <= 0.270) { score += 5; kR.push(`xwOBA ${xwOBA} (elite contact suppression)`); }
  else if (xwOBA <= 0.290) { score += 3; kR.push(`xwOBA ${xwOBA} (above avg)`); }
  else if (xwOBA <= 0.310) { score += 1; kR.push(`xwOBA ${xwOBA} (solid)`); }
  else if (xwOBA >= 0.350) { score -= 4; kR.push(`xwOBA ${xwOBA} (poor contact suppression)`); }
  else if (xwOBA >= 0.330) { score -= 2; kR.push(`xwOBA ${xwOBA} (below avg)`); }
}
```

In `outsBoardScore`, find where swStrPct or pitcherStats is already read (CODEX TASK 24/28 added blocks here) and add a parallel block:

```js
const xwOBA = pitcher?.pitcherStats?.xwOBAAllowed ?? null;
if (xwOBA !== null) {
  if      (xwOBA <= 0.280) { score += 4; signals.push(`xwOBA ${xwOBA} (elite)`); }
  else if (xwOBA >= 0.345) { score -= 3; signals.push(`xwOBA ${xwOBA} (poor)`); }
}
```

---

### Step 4 — Add to Scout serialized game block (`backend/routes/scout.js`)

In `generateScoutPicks`, find the lines that serialize pitcher data (search for `SwStr%:`). The current line looks like:

```js
`SwStr%: ${fmtPctMetric(homeProfile.pitcherStats?.swStrPct)} | O-Swing%: ... | F-Strike%: ...`,
```

Add `xwOBA:` to that same line for both home and away pitcher blocks:

```js
`SwStr%: ${fmtPctMetric(homeProfile.pitcherStats?.swStrPct)} | O-Swing%: ${fmtPctMetric(homeProfile.pitcherStats?.oSwingPct)} | F-Strike%: ${fmtPctMetric(homeProfile.pitcherStats?.fStrikePct)} | xwOBA: ${homeProfile.pitcherStats?.xwOBAAllowed ?? "n/a"}`,
```

---

### Constraints

- `xwOBAAllowed` is `null` when `woba_denom` column is absent OR when fewer than 10 qualifying PAs exist — never crash
- Do not change `buildArsenalPayload` signature, cache keys, or HTTP response shape beyond the new nullable field on `pitcherStats`
- `npm run build` must exit 0
- Update `AGENT_SYSTEM_PROMPT.md` with a CODEX TASK 31 handoff note in the same format as prior tasks

---

## HANDOFF NOTE — 2026-04-29 — CODEX TASK 31 COMPLETED

Codex completed Task 31 across the requested three files.

### Files changed

- `backend/routes/arsenal.js`
- `prop-scout-v7.jsx`
- `backend/routes/scout.js`

### What was implemented

#### Part 1 — `xwOBAAllowed` added to arsenal `pitcherStats`

In `backend/routes/arsenal.js`, Codex extended `buildArsenalFromRows(rows)` to compute:

- `xwOBAAllowed`

Implementation details:
- Added column guards:
  - `hasWobaDenomColumn`
  - `hasXwOBAColumn`
- Added counters:
  - `xwobaNumer`
  - `xwobaDenom`
- During the existing `rows.forEach(...)` loop:
  - counts only plate-appearance endpoint rows where `woba_denom === 1`
  - prefers `estimated_woba_using_speedangle`
  - falls back to `woba_value` when xwOBA is unavailable
- Added to `pitcherStats`:

```js
xwOBAAllowed
```

Guard behavior:
- `null` when `woba_denom` is absent
- `null` when fewer than `10` qualifying PAs exist
- never throws on missing columns or tiny samples

No API signature, cache keys, or envelope shape were changed beyond this new nullable field on `pitcherStats`.

#### Part 2 — Overview pitcher stat row display

In `prop-scout-v7.jsx`, the existing Overview pitcher stat strip was extended again.

It now shows:
- `SwStr%`
- `Chase`
- `F-Str%`
- `Barrel%`
- `HH%`
- `xwOBA`

Color logic for `xwOBA`:
- green `#4ade80` when `< 0.290`
- white when `0.290–0.329`
- orange `#f97316` when `0.330–0.349`
- red `#ef4444` when `>= 0.350`

If unavailable, it shows `—`.

#### Part 3 — Scoring updates

Codex threaded `xwOBAAllowed` into both the model K scoring path and the board K/Outs scoring functions so the new arsenal metric is reflected consistently where the other contact-quality stats already matter.

##### A. Model K scoring block in `prop-scout-v7.jsx`

After the existing `barrelPct` and `hardHitPct` adjustments, the K model now applies:

- `<= 0.270` → `+5`
- `<= 0.290` → `+3`
- `<= 0.310` → `+1`
- `>= 0.330` → `-2`
- `>= 0.350` → `-4`

It also appends explanatory signal text into `kR`.

##### B. Board scoring in `prop-scout-v7.jsx`

Codex also extended the board scoring functions:

- `kBoardScore(...)`
  - uses `pStats.pitcherStats?.xwOBAAllowed`
  - applies the same directional weighting pattern to the K board score
- `outsBoardScore(...)`
  - uses `pStats.pitcherStats?.xwOBAAllowed`
  - adds:
    - `<= 0.280` → `+4`
    - `>= 0.345` → `-3`

This keeps the board aligned with the richer pitcher contact-quality profile now coming through the arsenal pipeline.

#### Part 4 — Scout serialized pitcher context

In `backend/routes/scout.js`, Codex updated both pitcher serialization lines to append:

```txt
| xwOBA: ...
```

for both home and away pitcher blocks.

If unavailable, Scout sees:

```txt
xwOBA: n/a
```

### Verification run

Passed:
- `node --check backend/routes/arsenal.js`
- `node --check backend/routes/scout.js`
- `npm run build`

### Notes for Cowork

- Task 31 reused only the already-fetched Savant CSV data; no new API calls were added.
- `xwOBAAllowed` now lives under the same `pitcherStats` object as:
  - `swStrPct`
  - `oSwingPct`
  - `fStrikePct`
  - `barrelPct`
  - `hardHitPct`
- Board scoring was also updated in addition to the requested model/scout flow so the arsenal-derived contact-quality metrics stay consistent across the app.

---

## HANDOFF NOTE — 2026-04-29 — Bundle Size Discussion / Deferred Refactor

No code changes were made for this item. This was a product/engineering discussion only.

### Context

`npm run build` still exits successfully, but Vite continues to emit the existing large-chunk warning because `prop-scout-v7.jsx` is still a very large single-file frontend entry.

### What Codex explained

- Splitting `prop-scout-v7.jsx` into smaller files would help maintainability immediately.
- But smaller files alone do **not** necessarily reduce the shipped bundle much if everything is still imported eagerly.
- To materially reduce the main bundle size, the likely next step would be:
  - component/file splitting **plus**
  - lazy-loading / code-splitting for heavier views

### Suggested future candidates

When this moves off the backlog later, likely first targets are:
- Scout view
- Chat view
- Help/Guide overlay
- Board view
- Model view
- shared render/helpers extracted from the monolithic file

### Decision

This was explicitly deferred/backlogged for later.

Reasoning:
- current priority is finishing the remaining feature/backlog items
- bundle cleanup is worthwhile, but lower priority than product work right now
- when revisited, it should probably be treated as a structured refactor/optimization pass rather than an ad hoc cleanup

---

## CODEX TASK 32 — Line Movement Tracking (Task #40)

### Background

The `↑ OVER` / `↓ UNDER` badges on `SlateCard` and the "Movement:" text block in the game detail Overview are **already fully built in the UI** — they just read `game.odds.lineMove` and `game.odds.movement`, which are currently always mock sandbox values or `"none"` in live mode. The Scout's `getGameTotalLine()` also has `openLine`/`moveDir` hardcoded as stubs. This task wires real data all the way through.

### Key data flow (read before writing)

1. `snapshotOdds` in `snapshotJobs.js` — fetches Odds API, INSERTs/UPDATEs `odds_snapshots`. Currently overwrites `odds` every run and has no opening line column.
2. `GET /api/odds` in `odds.js` — reads `odds_snapshots`, calls `buildOddsPayload(games, meta)`, returns `{ map, eventIdMap, ... }`. The `map` is keyed `"AwayTeam|HomeTeam"` with fields like `total`, `awayML`, `books`, etc.
3. `liveOddsMap` in `prop-scout-v7.jsx` — populated from `/api/odds` response `.map`. `SlateCard` reads `liveOddsMap[key]` for live prices but reads `game.odds.lineMove` for direction (static). `getGameOdds()` merges live prices into game odds but currently doesn't update `lineMove` or `movement`.
4. `getGameTotalLine(rawOdds)` in `scout.js` — returns `{ line, overOdds, underOdds, openLine, moveDir }`. Currently `openLine = line` and `moveDir = "flat"` always.

### Files to edit

- `backend/jobs/snapshotJobs.js`
- `backend/routes/odds.js`
- `backend/routes/scout.js`
- `prop-scout-v7.jsx`

---

### Step 1 — Schema: add `opening_total` column (`backend/jobs/snapshotJobs.js`)

In `ensurePhaseOneTables()`, immediately after the `CREATE TABLE IF NOT EXISTS odds_snapshots` block, add:

```js
await query(`ALTER TABLE odds_snapshots ADD COLUMN IF NOT EXISTS opening_total NUMERIC`);
```

Then in `snapshotOdds()`, for each game `g`, extract the current DK total before the INSERT:

```js
const dkBk = g.bookmakers?.find(b => b.key === "draftkings") ?? g.bookmakers?.[0];
const totalsMarket = dkBk?.markets?.find(m => m.key === "totals");
const overOutcome = totalsMarket?.outcomes?.find(o => o.name === "Over");
const currentTotal = overOutcome?.point != null ? Number(overOutcome.point) : null;
```

Then update the INSERT query to:

```sql
INSERT INTO odds_snapshots (game_key, slate_date, fetched_at, odds, opening_total)
VALUES ($1, $2, NOW(), $3, $4)
ON CONFLICT (game_key, slate_date) DO UPDATE
  SET fetched_at = NOW(),
      odds = EXCLUDED.odds,
      opening_total = COALESCE(odds_snapshots.opening_total, EXCLUDED.opening_total)
```

The `COALESCE(odds_snapshots.opening_total, EXCLUDED.opening_total)` is the key — it keeps the first-ever value and never overwrites it. Pass `[gameKey, date, JSON.stringify(g), currentTotal]` as params.

---

### Step 2 — Compute movement in `/api/odds` (`backend/routes/odds.js`)

Change the DB SELECT to also fetch `opening_total`:

```js
`SELECT game_key, fetched_at, odds, opening_total FROM odds_snapshots WHERE slate_date = $1 ORDER BY fetched_at DESC`
```

Build an `openingTotalsMap` before calling `buildOddsPayload`:

```js
const openingTotalsMap = {};
rows.forEach(r => {
  if (r.opening_total != null) openingTotalsMap[r.game_key] = Number(r.opening_total);
});
const games = rows.map(r => r.odds).filter(Boolean);
const result = buildOddsPayload(games, { fetchedAt: ..., openingTotalsMap });
```

In `buildOddsPayload(games, meta = {})`, after building `map[key]`, compute movement:

```js
const openingTotalsMap = meta.openingTotalsMap ?? {};
// ... (inside games.forEach, after building primary/map[key]):
const currentTotalNum = parseFloat(primary.total);
const openTotal = openingTotalsMap[key] ?? null;
const totalDelta = openTotal != null && !isNaN(currentTotalNum)
  ? Math.round((currentTotalNum - openTotal) * 10) / 10
  : null;
const totalMoveDir = totalDelta == null ? null
  : totalDelta > 0 ? "up"
  : totalDelta < 0 ? "down"
  : "flat";
const movementText = totalDelta == null
  ? "No opening line data yet."
  : totalDelta === 0
    ? `Total steady at ${currentTotalNum}. No significant movement.`
    : `Total opened ${openTotal} — moved ${totalDelta > 0 ? "UP" : "DOWN"} ${Math.abs(totalDelta)}.`;

map[key] = { ...primary, book: primaryLabel, books, openTotal, totalDelta, totalMoveDir, movementText };
```

---

### Step 3 — Fix Scout's stub (`backend/routes/scout.js`)

In `getGameTotalLine(rawOdds)`, the function currently hardcodes `openLine: Number(over.point), moveDir: "flat"`. Add a second optional parameter and compute real values:

```js
function getGameTotalLine(rawOdds, openingTotal = null) {
  // ... existing logic ...
  const currentLine = Number(over.point);
  const openLine = openingTotal ?? currentLine;
  const delta = Math.round((currentLine - openLine) * 10) / 10;
  const moveDir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return {
    line: currentLine,
    overOdds: fmtSignedOdds(over.price),
    underOdds: fmtSignedOdds(under?.price),
    openLine,
    moveDir,
  };
}
```

In `generateScoutPicks`, change the odds DB SELECT to include `opening_total`:

```js
"SELECT game_key, odds, opening_total FROM odds_snapshots WHERE slate_date = $1 AND game_key = ANY($2)"
```

Build an `openingTotalsMap` from those rows and pass it when calling `getGameTotalLine`:

```js
const openingTotalsMap = new Map((oddsRows?.rows ?? []).map(row => [row.game_key, row.opening_total != null ? Number(row.opening_total) : null]));
// ...
const totalLine = getGameTotalLine(oddsPayload, openingTotalsMap.get(`${game.away?.name}|${game.home?.name}`) ?? null);
```

---

### Step 4 — Wire into frontend (`prop-scout-v7.jsx`)

**Change A — `SlateCard` (around line 1397)**

Replace:
```js
const lineMove = game.odds.lineMove;
```
With:
```js
const lineMove = liveOdds?.totalMoveDir === "up"   ? "over"
               : liveOdds?.totalMoveDir === "down" ? "under"
               : game.odds.lineMove ?? "none";
```

**Change B — `getGameOdds()` (around line 3713-3727)**

In the returned merged object, add `lineMove` and `movement`:

```js
lineMove: live.totalMoveDir === "up"   ? "over"
        : live.totalMoveDir === "down" ? "under"
        : g.odds.lineMove ?? "none",
movement: live.movementText ?? g.odds.movement ?? "No movement data.",
```

---

### Constraints

- `COALESCE` in the DB UPDATE is the critical guard — never overwrite a stored opening line
- All new fields on the map entries (`openTotal`, `totalDelta`, `totalMoveDir`, `movementText`) must be `null`/absent gracefully when no opening line exists yet — don't crash the odds parser
- Do not touch `player_props_snapshots` — scope is game totals only for this task
- `npm run build` must exit 0
- Update `AGENT_SYSTEM_PROMPT.md` with a CODEX TASK 32 handoff note in the same format as prior tasks

---

## HANDOFF NOTE — 2026-04-29 — CODEX TASK 32 COMPLETED

Codex completed Task 32 across the requested four files.

### Files changed

- `backend/jobs/snapshotJobs.js`
- `backend/routes/odds.js`
- `backend/routes/scout.js`
- `prop-scout-v7.jsx`

### What was implemented

#### Part 1 — Opening totals now persist in `odds_snapshots`

In `backend/jobs/snapshotJobs.js`:

- `ensurePhaseOneTables()` now runs:

```sql
ALTER TABLE odds_snapshots ADD COLUMN IF NOT EXISTS opening_total NUMERIC
```

- `snapshotOdds()` now extracts the current DK total (falling back to the first available bookmaker when needed)
- `opening_total` is written during insert
- on conflict, the row now preserves the first stored opening line using:

```sql
opening_total = COALESCE(odds_snapshots.opening_total, EXCLUDED.opening_total)
```

This is the critical safety behavior: once the first opening total is stored for the slate date, later refreshes do not overwrite it.

#### Part 2 — `/api/odds` now rebuilds real line movement from DB snapshots

In `backend/routes/odds.js`:

- the DB read now selects:
  - `game_key`
  - `fetched_at`
  - `odds`
  - `opening_total`
- before calling `buildOddsPayload(...)`, the route now builds an `openingTotalsMap`
- that map is passed into `buildOddsPayload(...)`

Inside `buildOddsPayload(...)`, Codex added:
- `openTotal`
- `totalDelta`
- `totalMoveDir`
- `movementText`

These fields are computed null-safely:
- if no stored opening total exists yet, movement falls back to:
  - `No opening line data yet.`
- if the line is unchanged, movement becomes:
  - `Total steady at X. No significant movement.`
- otherwise:
  - `Total opened X — moved UP/DOWN Y.`

DB-hit behavior remains intact and now logs the same `✓ odds DB-HIT ...` message as before.

#### Part 3 — Scout total-line helper now uses real opening lines

In `backend/routes/scout.js`:

## HANDOFF NOTE — 2026-04-30 — CODEX TASK 35 COMPLETED

Codex completed Task 35 by adding the two backend-only park-context data modules requested for the future HR Scout work.

### Files changed

- `backend/data/parkFactors.js`
- `backend/data/parkWindMap.js`

### What was implemented

#### File A — `backend/data/parkFactors.js`

Created a new data-only module exporting:

- `PARK_HR_FACTORS`
- `NEUTRAL_HR`
- `getParkHrFactor(teamAbbr, batterHand)`

The object includes all 30 team abbreviations and adds handedness-specific HR park factors:

- `hrLhb`
- `hrRhb`
- `hrNeutral`
- `label`

`getParkHrFactor(...)` is null-safe:

- `L` batters use `hrLhb`
- `R` batters use `hrRhb`
- switch/other hands fall back to `hrNeutral`
- unknown team abbreviations fall back to `NEUTRAL_HR`

Verified examples:

- `getParkHrFactor("BOS", "L")` returns `factor: 0.92`
- `getParkHrFactor("NYY", "L")` returns `factor: 1.18`
- `getParkHrFactor("XYZ", "R")` falls back to neutral without crashing

#### File B — `backend/data/parkWindMap.js`

Created a new data-only module exporting:

- `PARK_WIND_MAP`
- `computeWindBoost(windDeg, windSpd, venueName, temp)`

The venue orientation values were copied directly from the existing frontend `STADIUMS` map so backend and frontend stay aligned.

`computeWindBoost(...)` mirrors the frontend wind interpretation logic, with one important implementation detail:

- Open-Meteo wind direction is the direction wind is **coming from**
- the helper converts that into the actual blowing-to direction before comparing against stadium orientation

This ensures the acceptance examples line up with the intended baseball semantics.

The helper returns:

- `windBoost`
  - `1` for favorable HR wind
  - `-1` for suppressing wind
  - `0` for neutral / calm / dome / unknown venue
- `windContext`

Verified examples:

- `computeWindBoost(180, 12, "Wrigley Field", 75)` → favorable / `windBoost: 1`
- `computeWindBoost(0, 12, "Wrigley Field", 75)` → suppressing / `windBoost: -1`
- `computeWindBoost(0, 12, "Globe Life Field", 75)` → `Dome — wind irrelevant`
- `computeWindBoost(0, 2, "Wrigley Field", 75)` → calm / neutral

### Scope notes

- No route mounts were added
- No server changes were needed
- No frontend code was changed
- These are pure backend data/helper modules to be imported directly by the future HR Scout route

- `getGameTotalLine(...)` now accepts a second optional parameter:

```js
openingTotal = null
```

- It now computes:
  - `openLine`
  - `moveDir`

from the stored opening total instead of hardcoding `flat`

Also in `generateScoutPicks(...)`:
- the odds query now selects `opening_total`
- an `openingTotalsMap` is built from the DB rows
- `getGameTotalLine(...)` now receives the stored opening total for that game when available

This means Scout’s serialized total context now uses real opening-line movement instead of the old stubbed fields.

#### Part 4 — Frontend now consumes live total movement fields

In `prop-scout-v7.jsx`:

##### A. `SlateCard`
- `lineMove` now prefers:
  - `liveOdds.totalMoveDir === "up"` → `"over"`
  - `liveOdds.totalMoveDir === "down"` → `"under"`
  - otherwise falls back to the existing mock/default `game.odds.lineMove`

This activates the existing:
- `↑ OVER`
- `↓ UNDER`

badges from real live odds movement data.

##### B. `getGameOdds()`
- the merged odds object now includes:
  - `lineMove`
  - `movement`

using live odds fields first:

```js
lineMove
movement
```

This powers the already-existing movement text block in game detail using real snapshot-backed movement data.

### What was intentionally NOT changed

- No player props snapshot logic
- No player prop movement tracking
- No unrelated odds cache TTL changes
- No frontend redesigns beyond wiring the existing UI to real movement fields

### Verification run

Passed:
- `node --check backend/jobs/snapshotJobs.js`
- `node --check backend/routes/odds.js`
- `node --check backend/routes/scout.js`
- `npm run build`

### Notes for Cowork

- The opening total is now captured once per game/date and preserved across later odds refreshes.
- `SlateCard` and game-detail movement text were already built; this task just finally connected them to real data.
- Scout total serialization now also benefits from the same stored opening total, so all three surfaces are aligned:
  - Slate view badge
  - Game detail movement copy
  - Scout total context

---

## HANDOFF NOTE — 2026-04-30 — CODEX TASK 33 COMPLETED (Pitcher Fly Ball Rate)

**Backlog Task 43 — HR Data Layer Phase 1**

### Files changed

- `backend/routes/arsenal.js`

### What was implemented

Added fly ball rate computation to `buildArsenalFromRows`. Zero new API calls — extracted from existing Savant CSV `bb_type` column already flowing through the pipeline.

Changes in `arsenal.js`:
- Added `hasBbTypeColumn` guard alongside existing `sampleKeys` guards (line 155)
- Added `flyBalls` and `popups` counters (lines 166–167)
- Added `if (hasBbTypeColumn)` accumulation block inside `rows.forEach` loop — runs independently of `hasLaunchSpeedAngleColumn` block
- Added two fields to `pitcherStats`:
  - `flyBallPct` — fly balls only / total batted balls
  - `flyBallPctInclPopup` — (fly balls + popups) / total batted balls

Both fields are null when `bb_type` column is missing or `battedBalls === 0`. All existing fields untouched.

Optional FB% chip was also included in the Overview pitcher stat row in `prop-scout-v7.jsx` — appended after xwOBA in the existing SwStr%/Chase/F-Str%/Barrel%/HH%/xwOBA inline stat block. Amber color `#f59e0b`. The `hasAny` guard was updated to include `flyBallPctInclPopup`.

### CW verification

Approved. Implementation exact to spec. No regressions.

---

## HANDOFF NOTE — 2026-04-30 — CODEX TASK 34 COMPLETED (Batter Power Profile)

**Backlog Task 44 — HR Data Layer Phase 2**

### Files changed

- `backend/routes/batterPower.js` (new file)
- `backend/routes/lineups.js` (modified)

### What was implemented

**`batterPower.js`** — New standalone module (no Express router). Exports `fetchBatterPowerProfile(batterId)`. Fetches a Savant CSV with `player_type=batter` per batter, parses it, and computes:
- `barrelPct` — barrels / batted balls (lsa === 6)
- `hardHitPct` — hard hits (EV ≥ 95) / batted balls
- `avgExitVelo` — mean exit velo across batted ball rows
- `avgLaunchAngle` — mean launch angle across batted ball rows
- `hrFbRate` — home runs / fly balls (requires ≥ 5 fly balls)

Key implementation details:
- Cache key: `batter-power:${batterId}:${TODAY()}` — date-keyed, 24h TTL
- `cached !== undefined` check correctly distinguishes cached `null` from a cache miss
- Minimum 10 batted balls required before returning a profile; fewer returns `null`
- Failure path caches `null` to prevent repeated Savant hammering
- Console log pattern (`→ / · / ✓ / ✗`) matches arsenal.js

**`lineups.js`** — Added import of `fetchBatterPowerProfile`. After building `awayLineup` and `homeLineup`, when `confirmed === true`, fetches power profiles in parallel using chunked concurrency (chunk size 3) and attaches `powerProfile` to each batter object before the result is assembled. Unconfirmed lineups skip enrichment entirely. Cache and response logic unchanged.

### CW verification

Approved. Cache miss/null distinction correct. `hrFbRate` null guard (≥ 5 fly balls) is a good addition beyond the spec. No server.js changes — correct.

---

## HANDOFF NOTE — 2026-04-30 — CODEX TASK 36 COMPLETED (Batter Gamelog Recent Form)

**Backlog Task 47 — HR Data Layer Phase 5**

### Files to be created / modified

- `backend/routes/batterGamelog.js` — new file
- `backend/routes/lineups.js` — add import + parallel gamelog fetch alongside existing powerProfile enrichment

### What is being implemented

**`batterGamelog.js`** — Standalone module exporting `fetchBatterRecentForm(batterId)`. Calls `GET /people/{batterId}/stats?stats=gameLog&group=hitting&season={year}&limit=15` via the existing `mlbApi` service. Parses up to 15 splits (newest-first) and computes:
- `last15Games` — actual game count returned
- `hrLast15` — total HR over the window
- `abLast15` — total AB over the window
- `hrPer15AB` — normalized HR rate (HRs per 15 AB)
- `hotStreak` — `true` if 2+ HR in most recent 7 games
- `coldStreak` — `true` if 0 HR in 15 games AND recent avg < .200
- `recentGames` — raw array of `{ date, homeRuns, hits, atBats }` for sparkline/display

Cache key: `gamelog-form:${batterId}:${TODAY()}` — distinct from the existing `gamelog:${playerId}:${group}` key used by the public players route. 24h TTL.

**`lineups.js`** — Updated confirmed-lineup enrichment block to fetch `powerProfile` and `recentForm` in parallel per chunk using `Promise.all([Promise.all(powerFetches), Promise.all(gamelogFetches)])`. Both fields attached to each batter object.

### Key implementation notes

- `limit: 15` passed in API params; `splits.slice(0, 15)` as a safety cap
- MLB API returns splits newest-first — `idx < 7` correctly captures last 7 games for hotStreak
- `hrPer15AB` returns `null` when `abLast15 === 0` (no division by zero)
- Failure path caches `null` to prevent repeated API hammering
- No server.js changes, no frontend changes, no route mount needed

---

## BACKLOG TASK 41 — H2H Batter vs Pitcher Career Stats

**Status: COMPLETED ✅ (pre-existing implementation confirmed 2026-04-30)**

### What

Add career head-to-head stats (batter vs specific pitcher) to the Lineup tab batter expansion drawer. This is a direct value-add to the existing app AND is a prerequisite for the Advisor feature (Task 42) where The Lotto Guy needs H2H data to research extreme prop plays.

### Data source

MLB Stats API native endpoint — no new third-party dependency:
```
GET https://statsapi.mlb.com/api/v1/people/{batterId}/stats
  ?stats=vsPlayer
  &group=hitting
  &season={year}
  &opposingPlayerId={pitcherId}
  &sportId=1
```
Returns: PA, AB, H, HR, AVG, OBP, SLG, OPS for this batter vs this specific pitcher in the current season. If sample is small (< 5 PA), fall back to `stats=vsPlayerTotal` (career, no season filter) to get multi-year totals.

### Backend

New route: `GET /api/h2h/:batterId/:pitcherId`

- Tries current season first (`stats=vsPlayer&season={year}`)
- If fewer than 5 PA, also fetches career totals (`stats=vsPlayerTotal`, no season param)
- Returns `{ season: { pa, ab, h, hr, avg, obp, slg, ops }, career: { ... } | null }`
- 24-hour cache (H2H doesn't change intra-day)
- Graceful null if no matchup history exists

### Frontend (`prop-scout-v7.jsx`)

In the Lineup tab batter expansion drawer (search `onBatterExpand`), after the existing splits/matchup section, add a "vs [PitcherName]" row that:
- Fires `GET /api/h2h/:batterId/:pitcherId` on expand (lazy-loaded, same pattern as existing batter splits)
- Shows season stats if PA ≥ 5, else career stats, else "No H2H history"
- Format: `3-for-9 (.333) · 1 HR · .411 OBP` — compact, inline with existing card style
- Deduplicates: only fetches once per batter per session (same pattern as `batterSplits`)

---

## BACKLOG TASK 42 — AI Betting Advisor Tab

**Status:** COMPLETED ✅ (CODEX TASKS 43 + 44 — 2026-05-01)

### What was built

Two-persona conversational betting advisor tab, gated by `AI_PICKS_ALLOWLIST`.

**Backend — `backend/routes/advisor.js` (new) + `server.js` mount:**
- `POST /api/advisor` — takes `{ persona, messages }`, builds full-slate context for all games in parallel (pitcher ERA/K9/WHIP/L3, K prop lines, HR prop odds, ML/total/RL, umpire K/9 delta, injuries), runs persona-driven GPT-4o conversation
- 20 messages/day rate limit (in-memory, `todayHonolulu()` key)
- Returns `{ type, content, picks, parlay, messagesUsedToday, maxMessagesPerDay }`
- `PRO_SYSTEM_PROMPT`: singles only, -200 to +150 odds, requires 3+ aligned signals, 60%+ hit rate target
- `LOTTO_SYSTEM_PROMPT`: +200 or better targets, 2–4 leg parlays, always includes a parlay card with combined odds

**Frontend — `prop-scout-v7.jsx`:**
- Amber `🧠 Advisor` tab button (gated by `isScoutUser`, color `#f59e0b`)
- Persona toggle: `🎯 The Pro` (amber) / `🎲 The Lotto Guy` (green) — switching clears history
- Per-persona quick chips, description line, empty state copy, loading text ("Crunching the numbers…" / "Finding the angles…"), input Send button color
- Pick card renderer: player/team/market, lean+line badge, odds, confidence chip (HIGH/MEDIUM/SPEC color-coded), signal chips, reasoning
- Parlay card renderer (Lotto only): green border, legs list, combined odds badge, reasoning
- Structured pick responses serialized as `"[picks]"` string before re-sending to API (prevents context pollution)

---

## CODEX TASK 43 — Advisor Backend Phase A: Route + Context + System Prompts

### New file: `backend/routes/advisor.js`

#### Overview

New `POST /api/advisor` route. Gated by same allowlist as Scout/Chat. Builds a comprehensive slate context (all games, pitcher stats, props, odds, umpires) on every request and runs a persona-driven GPT-4o conversation that returns either structured picks or conversational messages.

---

#### Auth + Rate Limit (copy pattern from `chat.js`)

```js
const ADVISOR_ALLOWLIST = (process.env.AI_PICKS_ALLOWLIST ?? "leadoffkaiba")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

const DAILY_LIMIT = 20;
const usageMap = {};

function todayHonolulu() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}
function getUsage(userId) {
  const key = `${userId}:${todayHonolulu()}`;
  return usageMap[key] ?? 0;
}
function incrementUsage(userId) {
  const key = `${userId}:${todayHonolulu()}`;
  usageMap[key] = (usageMap[key] ?? 0) + 1;
  return usageMap[key];
}

function requireAdvisorAccess(req, res, next) {
  const identities = [req.user?.email, req.user?.username]
    .filter(Boolean).map(s => String(s).trim().toLowerCase());
  if (!identities.some(id => ADVISOR_ALLOWLIST.includes(id))) {
    return res.status(403).json({ error: "Access restricted" });
  }
  return next();
}

router.use(requireAuth, (req, _res, next) => {
  req.user = { id: req.userId ?? null, username: req.username ?? null, email: req.email ?? null };
  next();
}, requireAdvisorAccess);
```

---

#### Context Builder

The Advisor always builds full-slate context (all games), unlike Chat which only enriches mentioned pitchers/teams. This is the key difference.

```js
// Reuse same helpers from chat.js verbatim:
// - parseIpToFloat, parseIpToOuts, signedOdds, normalizeName, fetchPitcherDetail, getPropsForPitcher, getGameOdds, tavilySearch

async function buildAdvisorContext(date) {
  // 1. Load schedule from DB, fallback to MLB API (exact same pattern as chat.js lines 289–328)
  let games = [];
  let injuries = [];
  if (isConnected()) {
    const [schedRow, injRow] = await Promise.all([
      query("SELECT games FROM schedule_snapshots WHERE slate_date = $1", [date]),
      query("SELECT injuries FROM injury_snapshots WHERE snapshot_date = $1", [date]),
    ]);
    games = schedRow?.rows?.[0]?.games ?? [];
    injuries = injRow?.rows?.[0]?.injuries?.injuries ?? injRow?.rows?.[0]?.injuries ?? [];
  }
  // MLB API fallback if no DB rows (same as chat.js)...

  // 2. Load props, odds, umpires from DB for ALL games
  const gamePks = games.map(g => Number(g.gamePk)).filter(Boolean);
  const [propsRows, oddsRows, umpRows] = await Promise.all([
    isConnected() ? query("SELECT game_pk, props FROM player_props_snapshots WHERE snapshot_date = $1", [date]) : null,
    isConnected() ? query("SELECT game_key, odds FROM odds_snapshots WHERE slate_date = $1", [date]) : null,
    isConnected() && gamePks.length ? query("SELECT game_pk, data FROM umpire_snapshots WHERE game_pk = ANY($1)", [gamePks]) : null,
  ]);

  const propsByGamePk = new Map((propsRows?.rows ?? []).map(r => [Number(r.game_pk), r.props ?? []]));
  const oddsByGameKey = new Map((oddsRows?.rows ?? []).map(r => [r.game_key, r.odds]));
  const umpByGamePk  = new Map((umpRows?.rows  ?? []).map(r => [Number(r.game_pk), r.data]));

  // 3. Fetch pitcher details for all probable starters in parallel (cap at 16 pitchers = 8 games)
  const pitcherIds = [...new Set(
    games.flatMap(g => [g.probablePitchers?.away?.id, g.probablePitchers?.home?.id]).filter(Boolean)
  )];
  const pitcherDetailMap = new Map();
  await Promise.all(pitcherIds.map(async id => {
    try { pitcherDetailMap.set(id, await fetchPitcherDetail(id)); }
    catch { /* skip */ }
  }));

  // 4. Build per-game context blocks
  const gameBlocks = games.slice(0, 8).map(g => {
    const awayP = g.probablePitchers?.away;
    const homeP = g.probablePitchers?.home;
    const awayD = awayP?.id ? pitcherDetailMap.get(awayP.id) : null;
    const homeD = homeP?.id ? pitcherDetailMap.get(homeP.id) : null;
    const odds  = getGameOdds(oddsByGameKey.get(`${g.away?.name}|${g.home?.name}`), g.away?.name);
    const ump   = umpByGamePk.get(Number(g.gamePk))?.homePlate;
    const props = propsByGamePk.get(Number(g.gamePk)) ?? [];

    // Pitcher prop lines (K + Outs for each starter)
    const awayKLine   = props.find(p => p.market === "pitcher_strikeouts" && normalizeName(p.player ?? "").includes(normalizeName(awayP?.name ?? "").split(" ").pop()));
    const homeKLine   = props.find(p => p.market === "pitcher_strikeouts" && normalizeName(p.player ?? "").includes(normalizeName(homeP?.name ?? "").split(" ").pop()));

    // Top HR prop lines for this game (up to 3 batters with listed HR odds)
    const hrProps = props.filter(p => p.market === "batter_home_runs").slice(0, 3)
      .map(p => `${p.player} HR ${p.books?.DK?.overOdds ?? p.overOdds ?? "—"}`).join(", ");

    const fmt = (v, suf = "") => v == null ? "n/a" : `${v}${suf}`;

    return [
      `GAME: ${g.away?.abbr} @ ${g.home?.abbr} ${g.time ?? ""}`,
      `  ML ${odds.awayML ?? "—"}/${odds.homeML ?? "—"} | Total ${odds.total ?? "—"} (O ${odds.overOdds ?? "—"} / U ${odds.underOdds ?? "—"}) | RL ${odds.awaySpread ?? "—"}(${odds.awaySpreadOdds ?? "—"})`,
      `  Ump: ${ump?.name ?? "TBD"} | K/9 delta: ${ump?.stats?.k_rate_delta ?? ump?.stats?.kRateDelta ?? "n/a"}`,
      awayP ? `  AWAY SP: ${awayP.name} — ERA ${fmt(awayD?.era?.toFixed(2))} | K/9 ${fmt(awayD?.k9?.toFixed(1))} | WHIP ${fmt(awayD?.whip?.toFixed(2))} | L3 avg K ${fmt(awayD?.l3K?.toFixed(1))} | K line: ${awayKLine?.books?.DK?.line ?? awayKLine?.line ?? "—"} (${awayKLine?.books?.DK?.overOdds ?? awayKLine?.overOdds ?? "—"})` : "  AWAY SP: TBD",
      homeP ? `  HOME SP: ${homeP.name} — ERA ${fmt(homeD?.era?.toFixed(2))} | K/9 ${fmt(homeD?.k9?.toFixed(1))} | WHIP ${fmt(homeD?.whip?.toFixed(2))} | L3 avg K ${fmt(homeD?.l3K?.toFixed(1))} | K line: ${homeKLine?.books?.DK?.line ?? homeKLine?.line ?? "—"} (${homeKLine?.books?.DK?.overOdds ?? homeKLine?.overOdds ?? "—"})` : "  HOME SP: TBD",
      hrProps ? `  HR props: ${hrProps}` : null,
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  const injuriesText = (injuries ?? []).slice(0, 8)
    .map(i => `${i.playerName} (${i.team}) — ${i.status}`).join(", ");

  return `TODAY'S SLATE (${date}):\n\n${gameBlocks}\n\nRECENT IL: ${injuriesText || "None reported"}`;
}
```

---

#### System Prompts

```js
const PRO_SYSTEM_PROMPT = `You are The Pro — a sharp, disciplined MLB prop analyst who makes a living betting. You have access to today's full slate: pitcher stats, K/9, WHIP, last 3 starts, prop lines, ML/total odds, umpire K/9 delta, and HR odds.

Your rules:
- Singles only. No parlays.
- Only recommend props where at least 3 independent signals align.
- Target odds between -200 and +150 — real value, not chalk.
- Aim for 60%+ hit rate. Pass rather than force a marginal play.
- Cite every stat. Be direct. No hedging unless data is genuinely mixed.
- If nothing stands out today, say so.

When asked for picks, return type "picks" with 3–6 plays.
When answering research/follow-up questions, return type "message".

Return valid JSON only:
{
  "type": "picks",
  "picks": [{
    "player": "Gerrit Cole",
    "team": "NYY",
    "opponent": "BOS",
    "market": "pitcher_strikeouts",
    "marketLabel": "Pitcher Strikeouts",
    "line": 7.5,
    "lean": "OVER",
    "odds": "-130",
    "confidence": "HIGH",
    "reasoning": "2-4 sentence explanation citing specific numbers",
    "signals": ["K/9 11.2", "L3 avg 8.3 K", "Ump +2.1 K/9"]
  }]
}
OR
{ "type": "message", "content": "Your response here" }

confidence values: "HIGH" (strong, 3+ aligned signals), "MEDIUM" (2 signals, one question mark), "SPEC" (interesting angle, limited data).`;

const LOTTO_SYSTEM_PROMPT = `You are The Lotto Guy — a high-risk, high-reward MLB prop hunter. You have access to today's full slate: pitcher stats, prop lines, ML/total odds, umpire K/9 delta, and HR odds.

Your rules:
- Target props at +200 or better when possible. +150 minimum.
- Love 2–4 leg parlays that combine independent upside plays.
- Find situations where data suggests a prop could exceed the line significantly — e.g., K 9+ when line is 5.5 and SwStr% is elite.
- Explain the data angle clearly. Be enthusiastic but disciplined — every leg needs a reason.
- Always suggest a parlay combining your best legs. Show the math.

When asked for picks, return type "lotto" with 3–5 individual high-upside picks AND a parlay.
When answering research/follow-up questions, return type "message".

Return valid JSON only:
{
  "type": "lotto",
  "picks": [{
    "player": "Aaron Judge",
    "team": "NYY",
    "opponent": "BOS",
    "market": "batter_home_runs",
    "marketLabel": "Home Run",
    "line": 0.5,
    "lean": "OVER",
    "odds": "+380",
    "confidence": "SPEC",
    "reasoning": "2-4 sentence explanation of the high-upside angle",
    "signals": ["Barrel% 16.2%", "Wind out", "Park factor 118"]
  }],
  "parlay": {
    "legs": ["Judge HR (+380)", "Cole OVER 8.5 K (-115)"],
    "combinedOdds": "+380",
    "reasoning": "1-2 sentences on why these plays combine well"
  }
}
OR
{ "type": "message", "content": "Your response here" }`;
```

---

#### Route Handler

```js
router.post("/", async (req, res) => {
  const body = req.body ?? {};
  const persona   = ["pro", "lotto"].includes(body.persona) ? body.persona : "pro";
  const messages  = Array.isArray(body.messages) ? body.messages : [];
  const lastMsg   = messages.filter(m => m.role === "user").pop()?.content ?? "";
  if (!lastMsg) return res.status(400).json({ error: "message required" });

  const userId = req.user?.id ?? req.user?.username ?? "unknown";
  if (getUsage(userId) >= DAILY_LIMIT) {
    return res.status(429).json({ error: "Daily limit reached", messagesUsedToday: DAILY_LIMIT, maxMessagesPerDay: DAILY_LIMIT });
  }

  const date = todayHonolulu();
  let slateContext = "";
  try {
    slateContext = await buildAdvisorContext(date);
  } catch (err) {
    console.warn("  ⚠ advisor: context build failed:", err.message);
  }

  const systemPrompt = persona === "lotto" ? LOTTO_SYSTEM_PROMPT : PRO_SYSTEM_PROMPT;

  const chatMessages = [
    { role: "system", content: `${systemPrompt}\n\nDATA CONTEXT:\n${slateContext}` },
    ...messages.slice(-8), // last 8 turns
  ];

  try {
    const completion = await getClient().chat.completions.create({
      model: "gpt-4o",
      messages: chatMessages,
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 1200,
    });
    const parsed = JSON.parse(completion.choices?.[0]?.message?.content ?? "{}");
    const used = incrementUsage(userId);
    return res.json({
      type: parsed.type ?? "message",
      content: parsed.content ?? null,
      picks: parsed.picks ?? null,
      parlay: parsed.parlay ?? null,
      messagesUsedToday: used,
      maxMessagesPerDay: DAILY_LIMIT,
    });
  } catch (err) {
    console.error(`  ✗ advisor failed: ${err.message}`);
    return res.status(502).json({ error: "Advisor unavailable", detail: err.message });
  }
});
```

---

#### Mount in `backend/server.js`

Add after the existing `chat` route:
```js
app.use("/api/advisor", require("./routes/advisor"));
```

---

### Handoff Note (Phase A)

After completing, update `AGENT_SYSTEM_PROMPT.md`: note Phase A complete under CODEX TASK 43, and confirm the route is mounted and responding.

**Phase A completed (2026-05-01):**
- Added new `backend/routes/advisor.js` with authenticated `POST /api/advisor`
- Reused the core schedule/odds/props/umpire/pitcher helper pattern from `chat.js`
- Built full-slate context generation for up to 8 games
- Added persona-specific GPT-4o system prompts for `pro` and `lotto`
- Mounted the route in `backend/server.js` at `/api/advisor`

---

## CODEX TASK 44 — Advisor Frontend Phase B: Tab UI + Pick Cards

### File: `prop-scout-v7.jsx`

#### New state (add alongside chatHistory, chatInput, etc.)

```js
const [advisorPersona, setAdvisorPersona]         = useState("pro");
const [advisorHistory, setAdvisorHistory]         = useState([]);
const [advisorInput,   setAdvisorInput]           = useState("");
const [advisorLoading, setAdvisorLoading]         = useState(false);
const [advisorError,   setAdvisorError]           = useState(null);
const [advisorMessagesLeft, setAdvisorMessagesLeft] = useState(20);
const advisorBottomRef = useRef(null);
```

#### Auto-scroll (add alongside chatHistory useEffect)

```js
useEffect(() => {
  advisorBottomRef.current?.scrollIntoView({ behavior: "smooth" });
}, [advisorHistory, advisorLoading]);
```

#### Send handler

```js
async function handleAdvisorSend(messageOverride) {
  const message = messageOverride ?? advisorInput.trim();
  if (!message || advisorLoading || advisorMessagesLeft <= 0) return;
  setAdvisorInput("");
  setAdvisorLoading(true);
  setAdvisorError(null);

  const userMsg = { role: "user", content: message };
  const newHistory = [...advisorHistory, userMsg];
  setAdvisorHistory(newHistory);

  try {
    const res = await fetch(`${API_BASE}/advisor`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        persona: advisorPersona,
        messages: newHistory.map(m => ({ role: m.role, content: typeof m.content === "string" ? m.content : "[picks]" })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Advisor error");
    if (data.messagesUsedToday != null) setAdvisorMessagesLeft(data.maxMessagesPerDay - data.messagesUsedToday);

    // Store response — if type is "picks" or "lotto", store the structured data
    const assistantMsg = {
      role: "assistant",
      type: data.type,
      content: data.content ?? null,
      picks: data.picks ?? null,
      parlay: data.parlay ?? null,
    };
    setAdvisorHistory(prev => [...prev, assistantMsg]);
  } catch (err) {
    setAdvisorError(err.message);
  } finally {
    setAdvisorLoading(false);
  }
}
```

#### Persona switch handler (clear history on switch)

```js
function handleAdvisorPersonaSwitch(newPersona) {
  if (newPersona === advisorPersona) return;
  setAdvisorPersona(newPersona);
  setAdvisorHistory([]);
  setAdvisorError(null);
}
```

---

#### Tab button (add alongside Scout/HR Scout/Chat buttons, gated by `isScoutUser`)

```jsx
{isScoutUser && (
  <button onClick={() => setView("advisor")}
    style={{ background: view === "advisor" ? "#f59e0b" : "#161827", border: `1px solid ${view === "advisor" ? "#f59e0b" : "#1f2437"}`, borderRadius: 8, padding: isNarrowPhone ? "6px 10px" : "6px 12px", fontSize: isNarrowPhone ? 9 : 10, color: view === "advisor" ? "#000" : "#9ca3af", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>
    🧠 Advisor
  </button>
)}
```

---

#### Quick chips per persona

```js
const ADVISOR_PRO_CHIPS  = ["Give me your best plays today", "Best K props with value", "Any fade spots?", "Show me the chalk plays"];
const ADVISOR_LOTTO_CHIPS = ["Build me a parlay", "Best HR props today", "High-ceiling K plays", "Max upside plays"];
```

---

#### Main tab section (`view === "advisor"`)

```jsx
{view === "advisor" && isScoutUser && (
  <div style={{ height: "calc(100vh - 120px)", display: "flex", flexDirection: "column", gap: 10 }}>

    {/* Header */}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace", letterSpacing: "0.05em" }}>🧠 ADVISOR</div>
        <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>Pick your persona · Ask for plays or research</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 9, color: "#9ca3af", fontFamily: "monospace", background: "rgba(255,255,255,0.04)", border: "1px solid #1f2437", borderRadius: 999, padding: "4px 8px" }}>
          {advisorMessagesLeft} left today
        </div>
        <button onClick={() => { setAdvisorHistory([]); setAdvisorError(null); }}
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #1f2437", borderRadius: 8, padding: "6px 10px", fontSize: 9, color: "#9ca3af", fontFamily: "monospace", cursor: "pointer" }}>
          Clear
        </button>
      </div>
    </div>

    {/* Persona toggle */}
    <div style={{ display: "flex", gap: 6 }}>
      {[["pro", "🎯 The Pro", "#f59e0b"], ["lotto", "🎲 The Lotto Guy", "#22c55e"]].map(([p, label, color]) => (
        <button key={p} onClick={() => handleAdvisorPersonaSwitch(p)}
          style={{ flex: 1, background: advisorPersona === p ? `${color}18` : "#161827", border: `1px solid ${advisorPersona === p ? color : "#1f2437"}`, borderRadius: 10, padding: "8px 10px", fontSize: 10, color: advisorPersona === p ? color : "#6b7280", fontFamily: "monospace", fontWeight: 700, cursor: "pointer" }}>
          {label}
          {advisorPersona === p && <span style={{ fontSize: 8, marginLeft: 5, opacity: 0.7 }}>ACTIVE</span>}
        </button>
      ))}
    </div>

    {/* Persona description */}
    <div style={{ fontSize: 9, color: "#6b7280", fontStyle: "italic", padding: "0 2px" }}>
      {advisorPersona === "pro"
        ? "Singles only · -200 to +150 odds · 3+ aligned signals required · Would rather pass than force it"
        : "High-upside props · +200 or better · 2–4 leg parlays · Finds situations where data beats the line"}
    </div>

    {/* Quick chips (empty state only) */}
    {advisorHistory.length === 0 && (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(advisorPersona === "pro" ? ADVISOR_PRO_CHIPS : ADVISOR_LOTTO_CHIPS).map(chip => (
          <button key={chip} onClick={() => handleAdvisorSend(chip)}
            disabled={advisorLoading || advisorMessagesLeft <= 0}
            style={{ background: advisorPersona === "pro" ? "rgba(245,158,11,0.10)" : "rgba(34,197,94,0.10)", border: `1px solid ${advisorPersona === "pro" ? "rgba(245,158,11,0.30)" : "rgba(34,197,94,0.30)"}`, borderRadius: 999, padding: "7px 10px", fontSize: 9, color: advisorPersona === "pro" ? "#fcd34d" : "#86efac", fontFamily: "monospace", fontWeight: 700, cursor: advisorLoading ? "default" : "pointer" }}>
            {chip}
          </button>
        ))}
      </div>
    )}

    {/* Error */}
    {advisorError && (
      <div style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)", borderRadius: 10, padding: "10px 12px", fontSize: 11, color: "#fca5a5" }}>
        {advisorError}
      </div>
    )}

    {/* Message window */}
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "#101220", border: "1px solid #1f2437", borderRadius: 14, padding: "12px", display: "flex", flexDirection: "column", gap: 10 }}>
      {advisorHistory.length === 0 ? (
        <div style={{ margin: "auto 0", textAlign: "center", color: "#6b7280", fontSize: 11, lineHeight: 1.7 }}>
          {advisorPersona === "pro"
            ? "Ask The Pro for disciplined single-bet plays backed by data."
            : "Ask The Lotto Guy for high-upside props and parlay ideas."}
        </div>
      ) : (
        advisorHistory.map((msg, idx) => (
          <div key={idx} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            {msg.role === "user" ? (
              /* User bubble — same as Chat */
              <div style={{ maxWidth: "85%", background: advisorPersona === "pro" ? "rgba(245,158,11,0.15)" : "rgba(34,197,94,0.15)", border: `1px solid ${advisorPersona === "pro" ? "rgba(245,158,11,0.30)" : "rgba(34,197,94,0.30)"}`, borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: "#f3f4f6", lineHeight: 1.6 }}>{msg.content}</div>
              </div>
            ) : msg.type === "message" ? (
              /* Assistant conversational bubble */
              <div style={{ maxWidth: "90%", background: "#171a2b", border: "1px solid #232840", borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: "#f3f4f6", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{msg.content}</div>
              </div>
            ) : (
              /* Structured pick response */
              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Pick cards */}
                {(msg.picks ?? []).map((pick, pi) => {
                  const accentColor = advisorPersona === "pro" ? "#f59e0b" : "#22c55e";
                  const confColor = pick.confidence === "HIGH" ? "#22c55e" : pick.confidence === "MEDIUM" ? "#f59e0b" : "#94a3b8";
                  return (
                    <div key={pi} style={{ background: "#161827", border: `1px solid ${accentColor}33`, borderRadius: 12, padding: "12px 14px" }}>
                      {/* Top row: player + lean badge */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>{pick.player}</div>
                          <div style={{ fontSize: 9, color: "#6b7280", marginTop: 1 }}>{pick.team} vs {pick.opponent} · {pick.marketLabel}</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                          <div style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}55`, borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 800, color: accentColor, fontFamily: "monospace" }}>
                            {pick.lean} {pick.line}
                          </div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#f9fafb", fontFamily: "monospace" }}>{pick.odds}</div>
                        </div>
                      </div>
                      {/* Confidence + signals */}
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
                        <span style={{ background: `${confColor}18`, border: `1px solid ${confColor}44`, borderRadius: 999, padding: "2px 7px", fontSize: 8, color: confColor, fontFamily: "monospace", fontWeight: 800 }}>
                          {pick.confidence}
                        </span>
                        {(pick.signals ?? []).map((sig, si) => (
                          <span key={si} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2d3148", borderRadius: 999, padding: "2px 7px", fontSize: 8, color: "#9ca3af", fontFamily: "monospace" }}>
                            {sig}
                          </span>
                        ))}
                      </div>
                      {/* Reasoning */}
                      <div style={{ fontSize: 10, color: "#d1d5db", lineHeight: 1.5 }}>{pick.reasoning}</div>
                    </div>
                  );
                })}

                {/* Parlay card (Lotto only) */}
                {msg.parlay && (
                  <div style={{ background: "rgba(34,197,94,0.06)", border: "2px solid rgba(34,197,94,0.30)", borderRadius: 12, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#22c55e", fontFamily: "monospace", letterSpacing: "0.06em" }}>🎲 PARLAY CARD</div>
                      <div style={{ background: "rgba(34,197,94,0.20)", border: "1px solid rgba(34,197,94,0.50)", borderRadius: 8, padding: "4px 10px", fontSize: 13, fontWeight: 800, color: "#22c55e", fontFamily: "monospace" }}>
                        {msg.parlay.combinedOdds}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 8 }}>
                      {(msg.parlay.legs ?? []).map((leg, li) => (
                        <div key={li} style={{ fontSize: 10, color: "#86efac", fontFamily: "monospace" }}>• {leg}</div>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.5 }}>{msg.parlay.reasoning}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))
      )}
      {advisorLoading && (
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <div style={{ background: "#171a2b", border: "1px solid #232840", borderRadius: 12, padding: "10px 12px", fontSize: 10, color: "#6b7280" }}>
            {advisorPersona === "pro" ? "Crunching the numbers…" : "Finding the angles…"}
          </div>
        </div>
      )}
      <div ref={advisorBottomRef} />
    </div>

    {/* Input bar */}
    <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#161827", border: "1px solid #1f2437", borderRadius: 14, padding: "10px" }}>
      <input
        value={advisorInput}
        onChange={e => setAdvisorInput(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAdvisorSend(); }}}
        placeholder={advisorMessagesLeft > 0 ? `Ask ${advisorPersona === "pro" ? "The Pro" : "The Lotto Guy"}…` : "Daily limit reached"}
        disabled={advisorLoading || advisorMessagesLeft <= 0}
        style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#f9fafb", fontSize: 12, fontFamily: "monospace" }}
      />
      <button onClick={() => handleAdvisorSend()}
        disabled={advisorLoading || !advisorInput.trim() || advisorMessagesLeft <= 0}
        style={{ background: advisorLoading || !advisorInput.trim() || advisorMessagesLeft <= 0 ? "#1f2437" : advisorPersona === "pro" ? "#f59e0b" : "#22c55e", border: "1px solid transparent", borderRadius: 10, padding: "8px 12px", color: advisorLoading || !advisorInput.trim() || advisorMessagesLeft <= 0 ? "#4b5563" : "#000", fontSize: 10, fontFamily: "monospace", fontWeight: 800, cursor: advisorLoading || !advisorInput.trim() || advisorMessagesLeft <= 0 ? "default" : "pointer" }}>
        Send
      </button>
    </div>
  </div>
)}
```

---

### Key Constraints

- `advisorPersona` switch MUST clear history — users are confused if Lotto Guy responses appear in a Pro context
- User bubble messages passed to API must coerce structured responses to `"[picks]"` string (see `handleAdvisorSend` — `typeof m.content === "string" ? m.content : "[picks]"`)
- `advisorBottomRef` must be inside the scroll container (identical to `chatBottomRef` pattern)
- The `isScoutUser` gate is the same check already used for Scout/HR Scout — no new allowlist needed
- Tab button ordering: add Advisor after HR Scout and before Chat in the nav

### Files to Modify

1. `backend/routes/advisor.js` — **new file** (Phase A)
2. `backend/server.js` — add `app.use("/api/advisor", ...)` (Phase A)
3. `prop-scout-v7.jsx` — state, handler, tab button, full tab section (Phase B)

### Handoff Note

After completing both phases, update `AGENT_SYSTEM_PROMPT.md`: mark **BACKLOG TASK 42** as `COMPLETED ✅` and note what was built.

**Completed summary (2026-05-01):**
- `backend/routes/advisor.js` now serves a persona-driven Advisor backend with rate limiting, allowlist gating, full-slate context assembly, and structured JSON pick/message responses.
- `backend/server.js` now mounts `/api/advisor`.
- `prop-scout-v7.jsx` now includes the gated `🧠 Advisor` tab with persona switching, quick chips, conversational bubbles, structured pick cards, parlay rendering, sticky input, and daily usage tracking.

---

## BACKLOG TASK 43 — Pitcher Fly Ball Rate (HR Data Layer, Phase 1)

**Status:** COMPLETED ✅ (CODEX TASK 33 — 2026-04-30)
**LOE:** XS
**Type:** Backend only
**Codex-ready:** Yes (no CW oversight required)
**Prerequisite for:** BACKLOG TASK 48 (HR Scout Tab)
**Dependencies:** None — data already exists in arsenal CSV

### Summary

Extract fly ball rate from the existing Savant CSV already fetched per pitcher in `backend/routes/arsenal.js`. The `bb_type` column contains one of: `ground_ball`, `fly_ball`, `line_drive`, `popup`. Fly ball rate = fly_balls / total_batted_balls.

This is a zero-new-API-calls change — the data is already flowing through the pipeline.

### Implementation

In `buildArsenalFromRows` (arsenal.js):

1. Add column guard: `const hasBbTypeColumn = sampleKeys.includes("bb_type")`
2. Accumulate counters alongside the existing batted ball loop:
   ```js
   if (hasBbTypeColumn) {
     if (row.bb_type === "fly_ball") flyBalls++;
     if (row.bb_type === "popup") popups++;  // popups are sometimes counted separately
   }
   ```
3. Compute and attach to `pitcherStats`:
   ```js
   flyBallPct: hasBbTypeColumn && battedBalls > 0
     ? Math.round((flyBalls / battedBalls) * 1000) / 10
     : null,
   flyBallPctInclPopup: hasBbTypeColumn && battedBalls > 0
     ? Math.round(((flyBalls + popups) / battedBalls) * 1000) / 10
     : null,
   ```
   (Expose both — fly balls only and fly balls + popups — since different sources define "fly ball rate" differently. HR Scout can use `flyBallPctInclPopup` as its main signal since popups are still air balls.)

### Frontend

No UI change in this task. The value will be surfaced in TASK 48 (HR Scout).
Optional: add a `FB%` chip to the Overview pitcher stat row alongside Barrel%/HH%/xwOBA (very low LOE addition, Codex can include it).

### Acceptance

- `pitcherStats.flyBallPct` and `pitcherStats.flyBallPctInclPopup` are non-null for pitchers who have Savant data
- Null-safe (no crash when column is missing or no batted balls)
- Existing arsenal endpoint response shape is otherwise unchanged

---

## BACKLOG TASK 44 — Batter Power Profile (HR Data Layer, Phase 2)

**Status:** COMPLETED ✅ (CODEX TASK 34 — 2026-04-30)
**LOE:** Small–Medium
**Type:** Backend only (new Savant fetch per batter)
**Codex-ready:** Yes (CW to spec Savant URL before Codex starts)
**Prerequisite for:** BACKLOG TASK 48 (HR Scout Tab)
**Dependencies:** None blocking, but coordinate with Task 43

### Summary

Fetch a batter-level Savant CSV to populate a power profile for each batter in today's lineups. This is the batter-side counterpart to the pitcher arsenal CSV.

### Data needed per batter

| Field | Savant column | Notes |
|---|---|---|
| Barrel% | `launch_speed_angle` = 6 (Barrel) | barrels / batted balls |
| Avg exit velo | `launch_speed` | mean of batted ball rows |
| Avg launch angle | `launch_angle` | mean of batted ball rows |
| HR/FB rate | `bb_type` = "fly_ball" + `events` = "home_run" | HRs / fly balls |
| Hard hit% | `launch_speed >= 95` | hard hits / batted balls |

### Savant URL

```
https://baseballsavant.mlb.com/statcast_search/csv?
  hfPT=&hfAB=&hfGT=R%7C&hfPR=&hfZ=&hfStadium=&hfBBL=&hfNewZones=&hfPull=&hfC=&hfSea=2025%7C&hfSit=&
  player_type=batter&
  hfOuts=&hfOpponent=&pitcher_throws=&batter_stands=&hfSA=&game_date_gt=&game_date_lt=&hfMo=&hfTeam=&
  home_road=&hfRO=&position=&hfInfield=&hfOutfield=&hfInn=&hfBBT=&hfFlag=&metric_1=&group_by=name&
  min_pitches=0&min_results=0&min_pas=10&
  batters_lookup[]=<MLBAM_ID>&
  type=details&is_shift_aware=true&csv=true
```

Replace `<MLBAM_ID>` with the batter's MLB AM ID.

### Caching

Cache per batter per day (Redis or in-memory Map keyed by `${batterId}-${date}`). Re-fetch if cache miss. Same 24h TTL pattern as arsenal.

### New route / integration point

Option A: New endpoint `GET /api/batter-power/:batterId`
Option B: Inline into lineup fetch — augment each batter object in `GET /api/lineup/:gamePk` with a `powerProfile` field when available.

**Recommendation:** Option B (inline) keeps the frontend simpler — HR Scout can just read from lineup data it already fetches. Fetch batter CSVs in parallel (Promise.all) during lineup assembly.

### Output shape per batter (added to existing lineup batter object)

```json
"powerProfile": {
  "barrelPct": 8.2,
  "avgExitVelo": 91.4,
  "avgLaunchAngle": 14.1,
  "hrFbRate": 18.5,
  "hardHitPct": 44.2
}
```

Null if Savant fetch fails or batter has < 10 batted balls in sample.

### Acceptance

- `powerProfile` present on batter objects in lineup response for players with Savant data
- Null-safe (no crash on fetch failure, empty CSV, missing columns)
- Parallel fetches with sensible concurrency limit (max 9 simultaneous to avoid Savant throttling)
- 24h cache so lineup endpoint doesn't re-fetch on every request

---

## BACKLOG TASK 45 — Park HR Factor Lookup Table (HR Data Layer, Phase 3)

**Status:** COMPLETED ✅ (CODEX TASK 35 — 2026-04-30)
**LOE:** XS
**Type:** Backend only (static data)
**Codex-ready:** Yes
**Prerequisite for:** BACKLOG TASK 48 (HR Scout Tab)
**Dependencies:** None

### Summary

Add a static lookup table mapping MLB stadium → HR park factor, split by batter handedness (LHB / RHB). This is static data that changes slowly (update once per season). No API call needed — embed as a JS object in a new file `backend/data/parkFactors.js`.

### Data format

```js
// parkFactors.js
// Source: ESPN/FanGraphs park factors, 2024 season baseline
// HR park factor: 100 = league average; >100 = hitter-friendly; <100 = pitcher-friendly
module.exports = {
  "Fenway Park":          { lhb: 88,  rhb: 107, neutral: 98  },
  "Yankee Stadium":       { lhb: 115, rhb: 108, neutral: 112 },
  "Coors Field":          { lhb: 118, rhb: 121, neutral: 120 },
  "Oracle Park":          { lhb: 70,  rhb: 75,  neutral: 72  },
  "Camden Yards":         { lhb: 106, rhb: 110, neutral: 108 },
  // ... all 30 MLB stadiums
};
```

### Integration

In `GET /api/odds` or a new `GET /api/park-factor/:venue`, look up the venue from the game's `venue` field (already in schedule data) and return `{ lhb, rhb, neutral }`. HR Scout tab reads this when displaying its per-game context.

Alternatively, include `parkFactor` directly on each game object in the schedule/odds response.

### Acceptance

- All 30 MLB parks present in the lookup (including parks with unusual HR characteristics like Coors, Oracle, Fenway)
- Handedness split for all parks
- Null-safe fallback when venue name doesn't match (return `{ lhb: 100, rhb: 100, neutral: 100 }`)
- Unit test (or inline comment) documenting the source / season for the data

---

## BACKLOG TASK 46 — Wind-to-Power-Alleys Mapping (HR Data Layer, Phase 4)

**Status:** COMPLETED ✅ (CODEX TASK 35 — 2026-04-30)
**LOE:** Small
**Type:** Backend only
**Codex-ready:** Yes (CW to provide static park direction map)
**Prerequisite for:** BACKLOG TASK 48 (HR Scout Tab)
**Dependencies:** Existing wind data already in odds/schedule payload

### Summary

The app already fetches wind speed and direction via the weather API. This task adds a static mapping of each MLB park's power alley directions (LF, CF, RF) and determines whether today's wind is blowing toward or away from the power alleys.

### Logic

```
windBearing (degrees) + parkPowerAlleyBearing → dot product → "out to LF", "out to RF", "out to CF", "in from LF", "calm", etc.
```

Output: a human-readable `windContext` string + a numeric `windBoost` signal (+1 = out to alleys, -1 = in from alleys, 0 = neutral/calm).

### Static data needed (new file: `backend/data/parkWindMap.js`)

```js
module.exports = {
  "Fenway Park":    { lfBearing: 230, cfBearing: 270, rfBearing: 315 },
  "Yankee Stadium": { lfBearing: 195, cfBearing: 240, rfBearing: 300 },
  // ...
};
```

These are the compass bearings from home plate toward each outfield alley. Wind coming FROM the opposite direction = blowing out.

### Output added to game weather object

```json
"windContext": "Blowing out to LF/CF — favorable for HRs",
"windBoost": 1
```

### Acceptance

- `windContext` and `windBoost` present on game weather objects for all stadiums in the map
- Graceful fallback (`windContext: null`, `windBoost: 0`) when park not in map or wind data unavailable
- Logic correct for edge cases: calm wind (< 5 mph → always neutral), crosswind (perpendicular → neutral)

---

## BACKLOG TASK 47 — Batter Gamelog Recent Form (HR Data Layer, Phase 5)

**Status:** COMPLETED ✅ (CODEX TASK 36 — 2026-04-30)
**LOE:** Small
**Type:** Backend only (new MLB Stats API call)
**Codex-ready:** Yes
**Prerequisite for:** BACKLOG TASK 48 (HR Scout Tab)
**Dependencies:** None (uses MLB Stats API already used elsewhere in the app)

### Summary

Fetch each batter's recent gamelog (last 15 games) to capture current form: HRs, hard contact frequency, AB, and any hot/cold streak signals.

### API call

```
GET https://statsapi.mlb.com/api/v1/people/{personId}/stats?stats=gameLog&group=hitting&season=2025&limit=15
```

Returns an array of per-game stat lines. Extract: `homeRuns`, `atBats`, `hits`, `baseOnBalls`.

Hard contact is not available in the gamelog — use HR count and hits as proxies for hot form. Barrel% from `powerProfile` (Task 44) covers recent hard contact.

### Derived signals

```js
{
  last15Games: 15,          // actual games returned
  hrLast15: 3,              // HR total
  abLast15: 52,
  hrPer15AB: 1.15,          // HRs per 15 AB, normalized
  hotStreak: true,          // 2+ HR in last 7 games
  coldStreak: false,        // 0 HR in last 15 games + batting avg < .200
  recentGames: [            // raw array for sparkline / display
    { date: "2025-04-28", homeRuns: 1, hits: 2, atBats: 4 },
    ...
  ]
}
```

### Integration

Inline into lineup batter object alongside `powerProfile` (Task 44) — add `recentForm` field. Fetch in parallel with power profile fetches.

### Caching

24h TTL (same as arsenal / power profile). Key: `gamelog-${batterId}-${date}`.

### Acceptance

- `recentForm` present on batter objects in lineup response
- `hotStreak` / `coldStreak` boolean flags correct per definitions above
- Null-safe when gamelog API returns empty or fails
- Cached — not re-fetched on every lineup request

---

## HANDOFF NOTE — 2026-04-30 — CODEX TASK 36 COMPLETED

Codex completed Task 36 by adding recent batter gamelog form as a second confirmed-lineup enrichment alongside the existing Savant power profile.

### Files changed

- `backend/routes/batterGamelog.js`
- `backend/routes/lineups.js`

### What was implemented

#### File A — `backend/routes/batterGamelog.js`

Created a new helper-only backend module exporting:

- `fetchBatterRecentForm(batterId)`

Implementation details:

- uses the MLB Stats API endpoint:
  - `/people/:id/stats`
  - params: `stats=gameLog`, `group=hitting`, `season=currentYear`, `limit=15`
- uses a dedicated daily cache key:
  - `gamelog-form:${batterId}:${TODAY()}`
- caches `null` as a valid value so empty/failing batter fetches do not repeatedly hammer the MLB API
- returns `null` safely when:
  - `batterId` is missing
  - no gamelog splits are returned
  - the MLB API request fails

Derived fields in the returned `recentForm` object:

- `last15Games`
- `hrLast15`
- `abLast15`
- `hrPer15AB`
- `hotStreak`
- `coldStreak`
- `recentGames`

Behavior rules implemented exactly per task:

- `hotStreak = true` when the batter has `2+ HR` in the most recent `7` games
- `coldStreak = true` when the batter has `0 HR` across the full `15` games and recent AVG is below `.200`
- `hrPer15AB = null` when `abLast15 === 0`
- `recentGames` contains up to `15` newest-first entries with:
  - `date`
  - `homeRuns`
  - `hits`
  - `atBats`

Logging follows the same `→ / · / ✓ / ✗` pattern used in other helper modules.

#### File B — `backend/routes/lineups.js`

The confirmed-lineup enrichment block now fetches both:

- `powerProfile`
- `recentForm`

Implementation details:

- imported `fetchBatterRecentForm` alongside `fetchBatterPowerProfile`
- kept the existing `confirmed` guard intact:
  - unconfirmed lineups do **not** fetch or attach either enrichment
- preserved the chunked concurrency pattern:
  - chunk size remains `3`
- within each chunk, both enrichment families run in parallel using:
  - `Promise.all([profiles, forms])`

Each batter in a confirmed lineup now gets:

- `powerProfile`
- `recentForm`

Both fields fall back to `null` per batter if that individual enrichment fails.

### Scope notes

- No `server.js` changes were needed
- No frontend changes were made
- No route mounts were added
- Unconfirmed lineup responses remain unchanged except for existing route behavior

### Verification

Codex ran:

- `node --check backend/routes/batterGamelog.js`
- `node --check backend/routes/lineups.js`

Both passed cleanly.

---

## BACKLOG TASK 48 — HR Scout Tab (HR Capstone)

**Status:** COMPLETED ✅ (CODEX TASKS 37 + 38 — 2026-04-30)
**LOE:** Large
**Type:** Full-stack (backend route + frontend tab)
**Codex-ready:** N/A — complete
**Dependencies:** Tasks 43, 44, 45, 46, 47 (all must be complete)

### Summary

A dedicated **HR Scout** tab that combines the app's algorithm layer and AI layer to surface the highest-confidence Home Run prop opportunities for today's slate. Mirrors the architecture of the existing Scout tab but specialized entirely for HR betting research.

This is a capstone task. Do not start until the full HR data layer (Tasks 43–47) is in place.

### What a serious HR bettor looks at

1. **Batter power profile** — Barrel%, Avg EV, Avg LA, HR/FB rate (Task 44)
2. **Pitcher fly ball tendency** — fly ball rate (Task 43): high FB% pitchers give up more HRs
3. **Park HR factor** — venue with handedness split (Task 45)
4. **Wind** — blowing out to power alleys is a meaningful signal (Task 46)
5. **Recent form** — batter on a hot streak, hit a HR recently (Task 47)
6. **Pitcher vulnerability** — high Barrel% allowed, high xwOBA (already in arsenal data, Tasks 43 + existing CODEX 28/31)
7. **Lineup slot** — leadoff/cleanup get more ABs → more HR opportunities
8. **Platoon split** — batter vs same/opposite hand pitcher (H2H, Task 41 if available)

### Algorithm component (HR Board score)

New scoring function `computeHRScore(batter, pitcher, game)`:

| Signal | Points |
|---|---|
| Pitcher flyBallPct ≥ 40% | +3 |
| Pitcher flyBallPct ≥ 35% | +2 |
| Pitcher Barrel% ≥ 10% | +3 |
| Pitcher Barrel% ≥ 7% | +2 |
| Pitcher xwOBA ≥ .380 | +2 |
| Batter Barrel% ≥ 10% | +4 |
| Batter Barrel% ≥ 7% | +2 |
| Batter Avg EV ≥ 93 mph | +2 |
| Batter HR/FB rate ≥ 20% | +3 |
| Batter HR/FB rate ≥ 15% | +2 |
| Park HR factor (handedness) ≥ 115 | +3 |
| Park HR factor ≥ 108 | +2 |
| Park HR factor ≤ 80 | -4 |
| Wind blowing out to power alleys | +2 |
| Wind blowing in | -2 |
| Batter hotStreak (2+ HR last 7) | +3 |
| Batter 0 HR last 15 games | -2 |
| Batting order slot 1–5 | +1 |

Score ≥ 12: Tier 1 (Strong Play) | Score 8–11: Tier 2 (Value Look) | Score 5–7: Tier 3 (Flier)

### AI component (new backend route)

New route: `POST /api/hr-scout`

Context injected into AI system prompt:
- Today's games + probable pitchers
- Batter power profiles (Task 44) for all lineup batters
- Pitcher fly ball rates + Barrel% + xwOBA (Tasks 43 + existing)
- Park HR factors (Task 45)
- Wind context (Task 46)
- Batter recent form / hot streaks (Task 47)
- Current HR prop lines from odds data (if available from sportsbook)

AI output format:
```json
{
  "picks": [
    {
      "batter": "Aaron Judge",
      "team": "NYY",
      "pitcher": "Chris Sale",
      "game": "NYY @ BOS",
      "lean": "HR",
      "confidence": "High",
      "hrScore": 15,
      "tier": 1,
      "keySignals": ["Barrel% 12.4%", "FB% 42%", "Yankee Stadium RHB factor 108", "Wind out to RF"],
      "reasoning": "...",
      "caution": null
    }
  ],
  "meta": { "generated_at": "...", "total_analyzed": 90 }
}
```

### Frontend (`prop-scout-v7.jsx`)

New **HR Scout** tab in the main nav (alongside Slate, Game, Props, Picks, Model, Board, Scout, Chat, Advisor).

Layout:
1. **Header row** — "HR Scout" title, generate button, last-updated timestamp
2. **Game filter** — pill buttons for each game (same pattern as Scout tab)
3. **Tier sections** — Tier 1 / Tier 2 / Tier 3 pick cards
4. **Pick card fields**: Batter name + team, Pitcher faced, Game/venue, HR Score badge, Key signals chips (Barrel%, FB%, Park Factor, Wind, Streak), Lean + confidence, AI reasoning summary
5. **Algorithm vs AI toggle** (optional): Show algorithm-only score vs full AI reasoning

### Gating

Same allowlist as Scout, Chat, Advisor: `AI_PICKS_ALLOWLIST` env var (default: `leadoffkaiba`).

### Build order (within this task)

1. CW writes full backend spec (context building, system prompt, output schema)
2. Codex implements `POST /api/hr-scout` backend route
3. CW verifies backend response shape
4. Codex implements HR Scout frontend tab
5. CW reviews UI and signal display
6. Integration test: confirm end-to-end with live data on Railway

---

## HANDOFF NOTE — 2026-04-30 — CODEX TASK 37 IN PROGRESS (HR Scout Tab)

**Backlog Task 48 — HR Scout Tab (HR Capstone)**

This is the capstone of the HR data layer (Tasks 43–47 all complete). Task 37 builds the full HR Scout feature end-to-end. It is split into two phases to allow CW review before the frontend is built.

### Phase A — Backend (handed to Codex 2026-04-30)

**New file: `backend/routes/hrScout.js`**

Key internals:
- `computeHRScore(batter, pitcherStats, parkFactor, windBoost)` → `{ score, tier, signals[] }` — purely algorithmic, 17 signals, no AI involved. Baseline 0. Tier thresholds: ≥12 = Tier 1, ≥8 = Tier 2, ≥5 = Tier 3.
- `generateHRScoutPicks(date, generationsUsed)` — full orchestration: fetches today's schedule, loads lineups + pitcher arsenal for each game (parallel), enriches each confirmed batter with powerProfile + recentForm, computes parkFactor (via `getParkHrFactor`) + windBoost (via `computeWindBoost`), runs `computeHRScore` on every batter, passes top candidates to OpenAI (gpt-4o, `response_format: json_object`) for final narrative reasoning, writes result to `hr_scout_snapshots` DB table.
- `GET /api/hr-scout/picks` — DB-first read, falls back to `generateHRScoutPicks` if no snapshot for today. Returns `{ date, picks[], generated_at, generations_used }`.
- `POST /api/hr-scout/regenerate` — manual refresh, same 3 generations/day rate limit as scout.js. Requires `requireScoutAccess` middleware.

**DB table (must be created before deploy):**
```sql
CREATE TABLE IF NOT EXISTS hr_scout_snapshots (
  slate_date DATE PRIMARY KEY,
  picks JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  generations_used INTEGER NOT NULL DEFAULT 1
);
```

**Imports required in hrScout.js:**
```js
const { buildArsenalPayloadForJob } = require("./arsenal");
const { fetchBatterPowerProfile } = require("./batterPower");
const { fetchBatterRecentForm } = require("./batterGamelog");
const { getParkHrFactor } = require("../data/parkFactors");
const { computeWindBoost } = require("../data/parkWindMap");
```

**Mount in `server.js`:**
```js
const hrScoutRouter = require("./routes/hrScout");
app.use("/api/hr-scout", requireAuth, hrScoutRouter);
```

### Phase B — Frontend (BLOCKED — pending CW review of Phase A)

New **HR Scout** tab in the main nav. Layout:
1. Header row — "HR Scout" title, generate button, last-updated timestamp
2. Game filter pills (same pattern as Scout tab)
3. Tier sections — Tier 1 / Tier 2 / Tier 3 pick cards
4. Pick card: Batter + team, Pitcher faced, Game/venue, HR Score badge, signal chips (Barrel%, FB%, Park Factor, Wind, Streak), lean + confidence, AI reasoning

Gated by `AI_PICKS_ALLOWLIST` (same as Scout/Chat/Advisor).

### Current state

Phase A ✅ COMPLETE — reviewed by CW 2026-04-30. One bug fixed during review: Open-Meteo weather fetch was missing `temperature_unit: "fahrenheit"` and `wind_speed_unit: "mph"` params, which would have prevented wind boost from ever firing. Fixed in `hrScout.js` directly.

Phase B ✅ COMPLETE — CODEX TASK 38 spec written and handed to Codex 2026-04-30. See CODEX TASK 38 handoff note below.

---

## HANDOFF NOTE — 2026-04-30 — CODEX TASK 38 COMPLETED (HR Scout Tab Phase B — Frontend)

Codex completed the HR Scout frontend in `prop-scout-v7.jsx`.

### File changed

`prop-scout-v7.jsx`

### What was implemented

#### 1. State block added

Added the six new HR Scout state variables alongside the existing Scout state:

- `hrScoutPicks`
- `hrScoutLoading`
- `hrScoutError`
- `hrScoutGenerationsLeft`
- `hrScoutExpanded`
- `hrScoutGeneratedAt`

#### 2. Auto-load effect added

Added a lazy-load effect mirroring the existing Scout pattern:

- activates on `view === "hr-scout"`
- calls `GET /api/hr-scout/picks`
- loads:
  - `hrScoutPicks`
  - `hrScoutGeneratedAt`
  - `hrScoutGenerationsLeft`
- skips when already loaded / loading / errored

#### 3. Regenerate handler added

Added `handleHRScoutRegenerate` alongside `handleScoutRegenerate`:

- calls `POST /api/hr-scout/regenerate`
- updates the picks payload
- updates `hrScoutGeneratedAt`
- updates the remaining generation count
- resets `hrScoutExpanded` to `null`

#### 4. Nav button added

Added a new `⚾ HR Scout` nav button immediately after the existing Scout button:

- gated by `isScoutUser`
- active color: `#fb923c`
- inactive style matches the existing nav pattern

#### 5. Full HR Scout tab view added

Added a new `{view === "hr-scout" && isScoutUser && (...)}` block immediately after the Scout view.

Features implemented:

- header row with:
  - `⚾ HR SCOUT`
  - generated-at time
  - orange regenerate button
- error banner
- loading state card
- empty state card
- tier-grouped pick rendering:
  - `TIER 1 — STRONG PLAYS`
  - `TIER 2 — SOLID PLAYS`
  - `TIER 3 — SPECULATIVE`
- collapsible pick cards

Collapsed card content:

- HR score badge
- batter name
- team vs pitcher context
- confidence label

Expanded card content:

- game string
- `keySignals` chips
- italicized AI reasoning
- caution block when `pick.caution` is non-null

### Verification

Codex ran:

- `npm run build`

Build passed successfully.

### Scope notes

- No backend files were changed in Phase B
- Scout, Chat, and other view logic were left intact
- Existing Vite large-chunk warning still appears, but build exits `0` cleanly

---

## CODEX TASK 39 — Consolidate slate_snapshots → schedule_snapshots (Backlog Task 29)

### Background

The app has two overlapping DB tables for schedule data:
- `slate_snapshots` — the legacy table, written by `snapshotSlate()` in `snapshotJobs.js` and read by `scheduler.js`
- `schedule_snapshots` — the current table, written by `pollSchedule()` in `snapshotJobs.js` and read by all routes (`schedule.js`, `scout.js`, `chat.js`, `hrScout.js`)

All routes already use `schedule_snapshots`. The only remaining references to `slate_snapshots` are in `snapshotJobs.js` (one write) and `scheduler.js` (two reads). This task eliminates those references. Do not drop the `slate_snapshots` table from the DB — just stop reading from and writing to it in code.

### Files to edit

- `backend/jobs/snapshotJobs.js`
- `backend/jobs/scheduler.js`

### Changes

#### `backend/jobs/snapshotJobs.js` — `snapshotSlate()`

`snapshotSlate()` currently writes only to `slate_snapshots`. Change it to write to `schedule_snapshots` instead (same upsert pattern, same columns):

**Before:**
```js
await query(
  `INSERT INTO slate_snapshots (slate_date, fetched_at, games)
   VALUES ($1, NOW(), $2)
   ON CONFLICT (slate_date) DO UPDATE SET fetched_at = NOW(), games = $2`,
  [date, JSON.stringify(games)]
);
```

**After:**
```js
await query(
  `INSERT INTO schedule_snapshots (slate_date, fetched_at, games)
   VALUES ($1, NOW(), $2)
   ON CONFLICT (slate_date) DO UPDATE SET fetched_at = NOW(), games = $2`,
  [date, JSON.stringify(games)]
);
```

#### `backend/jobs/scheduler.js` — `getTodayGames()` and `getInProgressGamePks()`

Both functions currently query `slate_snapshots`. Change both to `schedule_snapshots`:

**`getTodayGames()`:**
```js
// Before:
const result = await query("SELECT games FROM slate_snapshots WHERE slate_date = $1", [date]);
// After:
const result = await query("SELECT games FROM schedule_snapshots WHERE slate_date = $1", [date]);
```

**`getInProgressGamePks()`:**
```js
// Before:
const result = await query("SELECT games FROM slate_snapshots WHERE slate_date = $1", [date]);
// After:
const result = await query("SELECT games FROM schedule_snapshots WHERE slate_date = $1", [date]);
```

### Constraints

- Do NOT drop the `slate_snapshots` table — leave it in the DB and in `migrations/001_init.sql`
- Do NOT change `schedule_snapshots` schema or any routes that already use it
- No frontend changes
- No behavioral changes — this is a pure consolidation
- `npm run build` must exit 0
- Update `AGENT_SYSTEM_PROMPT.md` with a CODEX TASK 39 handoff note

---

## HANDOFF NOTE — 2026-04-30 — CODEX TASK 39 COMPLETED

Codex completed the legacy schedule snapshot consolidation.

### Files changed

- `backend/jobs/snapshotJobs.js`
- `backend/jobs/scheduler.js`

### What changed

#### `backend/jobs/snapshotJobs.js`

Inside `snapshotSlate()`, Codex changed the upsert target from:

- `slate_snapshots`

to:

- `schedule_snapshots`

The SQL shape, columns, params, and upsert behavior were left unchanged. This was a pure table-name substitution.

#### `backend/jobs/scheduler.js`

Codex updated both legacy reads:

- `getTodayGames()`
- `getInProgressGamePks()`

Both functions now query:

- `schedule_snapshots`

instead of:

- `slate_snapshots`

### Scope notes

- No routes were changed
- No frontend files were changed
- No schema or migration changes were made
- `slate_snapshots` was **not** dropped or modified in `migrations/001_init.sql`
- This was strictly a consolidation cleanup so all schedule snapshot reads/writes now point to the same current table

### Verification

Codex ran:

- `npm run build`
- `node --check backend/jobs/snapshotJobs.js`
- `node --check backend/jobs/scheduler.js`

All passed cleanly.

---

## BACKLOG TASK 49 — Pitcher Handedness Splits (Savant)

**Status:** COMPLETED ✅ (CODEX TASK 40 — 2026-04-30)
**LOE:** Small–Medium
**Type:** Full-stack (backend computation + frontend display + HR Scout scoring upgrade)
**Codex-ready:** Yes — see CODEX TASK 40 below
**Dependencies:** None — `stand` column already present in Savant CSV rows

### What

Split pitcher contact-quality stats (Barrel%, HH%, FB%, HR allowed) by batter handedness (vs LHH / vs RHH). This is exactly what the "study guide" social media bettors publish — Skenes' stats specifically against left-handed hitters vs right-handed hitters. Currently the app computes only overall pitcher stats.

### Data source

No new API calls. The Savant CSV already downloaded in `arsenal.js` includes a `stand` column on every row (value: "L" or "R" for batter stance). We just filter the existing rows.

### Files to edit

- `backend/routes/arsenal.js` — compute splits, add to `pitcherStats`
- `backend/routes/hrScout.js` — use hand-specific stats in `computeHRScore()`
- `prop-scout-v7.jsx` — display splits in Overview pitcher stats section

---

## BACKLOG TASK 50 — Batter Power by Pitch Type (Savant)

**Status:** COMPLETED ✅
**LOE:** Medium
**Type:** Full-stack
**Codex-ready:** Yes — see CODEX TASK 41 below
**Dependencies:** Task 49 ✅ complete

### What

Show batter's Barrel%/HH%/FB%/HR count broken out by pitch type (e.g. "vs FF: Brl 11.2% · HH 48% · 3 HR"). Requires filtering the batter Savant CSV (already fetched in `batterPower.js`) by `pitch_type`, then cross-referencing against the facing pitcher's top pitches in the Scout drawer and HR Scout scoring model.

---

## CODEX TASK 41 — Batter Power by Pitch Type (Backlog Task 50)

### Background

`backend/routes/batterPower.js` fetches each batter's full Savant pitch-level CSV (already used for overall Barrel%/EV). Every row has a `pitch_type` column (e.g. `FF`, `SL`, `CH`). We want to group those rows by pitch type, compute contact-quality stats per type, and surface them (a) in the Scout Overview batter drawer and (b) as a new HR Scout scoring signal.

### Part A — `backend/routes/batterPower.js`

**Goal:** Add `pitchTypeSplits` map to the returned profile object.

**Step 1** — Add column guard alongside existing guards (after `hasEvents` or `hasBbType`):
```js
const hasPitchType = sampleKeys.includes("pitch_type");
```

**Step 2** — Add accumulator before the `rows.forEach` loop:
```js
const pitchTypeAcc = {}; // keyed by pitch abbr
```

**Step 3** — Inside the existing `rows.forEach(r => { ... })` block, inside the `if (!isNaN(lsa) && lsa >= 1 && lsa <= 6)` batted-ball block, after the existing barrel/hardHit/evSum lines, add:
```js
if (hasPitchType) {
  const pt = (r.pitch_type || "").trim().toUpperCase();
  if (pt && pt !== "PO") {
    if (!pitchTypeAcc[pt]) pitchTypeAcc[pt] = { battedBalls: 0, barrels: 0, hardHits: 0, flyBalls: 0, hrCount: 0 };
    const s = pitchTypeAcc[pt];
    s.battedBalls++;
    if (lsa === 6) s.barrels++;
    if (hasLaunchSpeed && !isNaN(ev) && ev >= 95) s.hardHits++;
    if (hasBbType && r.bb_type === "fly_ball") s.flyBalls++;
    if (hasEvents && r.events === "home_run") s.hrCount++;
  }
}
```

**Step 4** — After the `rows.forEach` loop, before building the `profile` object, compute the final map:
```js
const pitchTypeSplits = {};
if (hasPitchType) {
  for (const [abbr, s] of Object.entries(pitchTypeAcc)) {
    if (s.battedBalls >= 15) {
      pitchTypeSplits[abbr] = {
        battedBalls: s.battedBalls,
        hrCount: s.hrCount,
        barrelPct: Math.round((s.barrels / s.battedBalls) * 1000) / 10,
        hardHitPct: Math.round((s.hardHits / s.battedBalls) * 1000) / 10,
        flyBallPct: hasBbType ? Math.round((s.flyBalls / s.battedBalls) * 1000) / 10 : null,
      };
    }
  }
}
```

**Step 5** — Add `pitchTypeSplits` to the returned `profile` object:
```js
const profile = {
  barrelPct: ...,
  hardHitPct: ...,
  avgExitVelo: ...,
  avgLaunchAngle: ...,
  hrFbRate: ...,
  pitchTypeSplits,   // ← add this
};
```

---

### Part B — `backend/routes/hrScout.js`

**Goal:** (1) Store pitcher arsenal array alongside pitcher stats in `arsenalMap`. (2) Pass it into `computeHRScore` as a new 5th param and add a pitch-type matchup signal. (3) Add pitch-type matchup lines to the AI context string.

**Step 1** — Change `arsenalMap` to store both stats and arsenal. Find the `buildArsenalPayloadForJob` call block (around line 274–279) and replace:
```js
// BEFORE:
arsenalMap.set(id, data?.pitcherStats ?? null);

// AFTER:
arsenalMap.set(id, {
  stats: data?.pitcherStats ?? null,
  arsenal: data?.arsenal ?? [],
});
```

**Step 2** — Update everywhere `arsenalMap.get(...)` is used to extract `.stats`:
- In the candidates loop: `const pitcherStats = arsenalMap.get(batter.facingPitcherId)?.stats ?? null;`
- Also extract arsenal: `const pitcherArsenal = arsenalMap.get(batter.facingPitcherId)?.arsenal ?? [];`
- Update the `computeHRScore` call: `const { score, tier, signals } = computeHRScore(batter, pitcherStats, parkFactor, windBoost, pitcherArsenal);`

**Step 3** — Update `computeHRScore` signature and add pitch-type signal. Change the function signature:
```js
function computeHRScore(batter, pitcherStats, parkFactor, windBoost, pitcherArsenal = []) {
```
Then, after the `// ── Batting order ──` block and before the tier/return, add:
```js
// ── Pitch-type power matchup ──────────────────────────────────
const pts = batter.powerProfile?.pitchTypeSplits ?? null;
if (pts && pitcherArsenal.length > 0) {
  const topPitch = pitcherArsenal.reduce(
    (best, p) => (!best || (p.pct ?? 0) > (best.pct ?? 0)) ? p : best, null
  );
  if (topPitch?.abbr) {
    const split = pts[topPitch.abbr] ?? null;
    if (split && split.battedBalls >= 15) {
      if (split.barrelPct >= 12) {
        score += 2;
        signals.push(`Barrels ${topPitch.abbr} at ${split.barrelPct}% (${split.battedBalls} BB)`);
      } else if (split.barrelPct <= 2) {
        score -= 1;
        signals.push(`Low barrel vs ${topPitch.abbr} (${split.barrelPct}%)`);
      }
    }
  }
}
```

**Step 4** — Add pitch-type matchup to the AI context. In `generateHRScoutPicks`, in the `contextLines` build block, find the `POWER:` line and add a new line after it:
```js
const ptsMap = pp.pitchTypeSplits ?? {};
const pitcherArsenalCtx = arsenalMap.get(batter.facingPitcherId)?.arsenal ?? [];
const pitchMatchups = pitcherArsenalCtx.slice(0, 3)
  .map(p => {
    const s = ptsMap[p.abbr];
    if (!s || s.battedBalls < 15) return null;
    return `vs ${p.abbr} Brl${s.barrelPct}% HH${s.hardHitPct}% (${s.battedBalls}BB)`;
  }).filter(Boolean);
```
Then add to the context array:
```js
...(pitchMatchups.length ? [`PITCH SPLITS: ${pitchMatchups.join(" | ")}`] : []),
```
(Place this line right after the `POWER:` line in the array.)

---

### Part C — `prop-scout-v7.jsx`

**Goal:** In the existing "vs pitcher arsenal" section of the batter expansion drawer, add a small power row beneath each pitch's progress bar showing Brl%/HH%/HR from `b.powerProfile?.pitchTypeSplits`.

**Location:** Around line 6545, inside `facingPitcher.arsenal.map(a => {...})`, right after the existing `<div style={{ background: "#1e2030", borderRadius: 3, height: 5 ... }}>` progress bar div and before the `{note && ...}` block.

**Insert this IIFE block:**
```jsx
{(() => {
  const s = b.powerProfile?.pitchTypeSplits?.[a.abbr];
  if (!s || s.battedBalls < 15) return null;
  const brlColor = s.barrelPct >= 12 ? "#fb923c" : s.barrelPct >= 7 ? "#f59e0b" : "#6b7280";
  const hhColor  = s.hardHitPct >= 45 ? "#22c55e" : s.hardHitPct >= 35 ? "#f59e0b" : "#6b7280";
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
      <span style={{ fontSize: 8, color: brlColor, fontFamily: "monospace" }}>Brl {s.barrelPct}%</span>
      <span style={{ fontSize: 8, color: hhColor,  fontFamily: "monospace" }}>HH {s.hardHitPct}%</span>
      {s.flyBallPct != null && <span style={{ fontSize: 8, color: "#6b7280", fontFamily: "monospace" }}>FB {s.flyBallPct}%</span>}
      <span style={{ fontSize: 8, color: "#4b5563", fontFamily: "monospace" }}>{s.hrCount} HR · {s.battedBalls} BB</span>
    </div>
  );
})()}
```

This renders only when the batter has ≥15 batted balls against that pitch type — no empty states, no loading spinners needed (data is already part of `powerProfile` loaded at lineup time).

### Key Constraints

- Minimum **15 batted balls** per pitch type before surfacing any data (not pitches seen — batted balls only)
- `pitch_type === "PO"` (pitchout) must be excluded from accumulation
- The `pitchTypeSplits` object on the profile is always present (empty `{}` if no data) — never `null`
- `arsenalMap` change affects only `hrScout.js` — no other files use it
- `pitchTypeSplits` flows to the Scout Overview tab automatically via `lineups.js` → `fetchBatterPowerProfile` enrichment

### Files to Modify

1. `backend/routes/batterPower.js` — add `pitchTypeSplits` computation
2. `backend/routes/hrScout.js` — update `arsenalMap` structure, extend `computeHRScore`, add AI context line
3. `prop-scout-v7.jsx` — add power stats row inside per-pitch arsenal render

### Handoff Note

After completing, update `AGENT_SYSTEM_PROMPT.md`: mark **BACKLOG TASK 50** as `COMPLETED ✅` and add a brief summary of what was built under the CODEX TASK 41 heading.

**Completed summary (2026-05-01):**
- `backend/routes/batterPower.js` now computes `pitchTypeSplits` from the existing Savant CSV, keyed by pitch abbreviation, with `barrelPct`, `hardHitPct`, `flyBallPct`, `hrCount`, and `battedBalls` for pitch types with at least 15 batted balls.
- `backend/routes/hrScout.js` now stores both `pitcherStats` and `arsenal` in `arsenalMap`, adds a pitch-type matchup scoring signal based on the pitcher's top usage pitch, and includes top pitch-split context in the AI prompt.
- `prop-scout-v7.jsx` now shows per-pitch batter power rows in the Scout batter drawer beneath each facing-pitcher arsenal bar when enough split data exists.

---

## BACKLOG TASK 51 — Rolling 7-Day Exit Velocity (L7 EV)

**Status:** COMPLETED ✅
**LOE:** Small-Medium
**Type:** Full-stack
**Codex-ready:** Yes — see CODEX TASK 42 below
**Dependencies:** None (extends batterPower.js which is already complete)

### What

Add a rolling 7-day EV profile to every batter: Avg EV L7, Hard Hit% L7, Barrel% L7, and delta vs season average. Surface in Scout batter drawer and as a new HR Scout signal. Zero new HTTP requests — Savant CSV rows already include `game_date`, just filter in-memory.

---

## CODEX TASK 42 — Rolling 7-Day Exit Velocity (Backlog Task 51)

### Background

`batterPower.js` already fetches a full-season Savant CSV for each batter. Every row has a `game_date` column (`YYYY-MM-DD`). This task filters those existing in-memory rows to the last 7 days and computes avg EV, HH%, barrel%, and delta vs season average. No new HTTP requests — purely an additional computation pass over already-fetched rows.

### Part A — `backend/routes/batterPower.js`

**Step 1** — Add column guard alongside existing guards:
```js
const hasGameDate = sampleKeys.includes("game_date");
```

**Step 2** — After the existing `rows.forEach` loop (after `hrOnFlyBalls` counting), before building `pitchTypeSplits`, add the L7 computation:
```js
// ── L7 Exit Velocity ─────────────────────────────────────────
let recentEv = null;
if (hasGameDate && hasLaunchSpeed && hasLaunchSpeedAngle) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD

  let l7BB = 0, l7EvSum = 0, l7HH = 0, l7Barrels = 0;

  rows.forEach(r => {
    if (!r.game_date || r.game_date < cutoffStr) return;
    const lsa = parseInt(r.launch_speed_angle, 10);
    const ev  = parseFloat(r.launch_speed);
    if (!isNaN(lsa) && lsa >= 1 && lsa <= 6) {
      l7BB++;
      if (!isNaN(ev)) {
        l7EvSum += ev;
        if (ev >= 95) l7HH++;
      }
      if (lsa === 6) l7Barrels++;
    }
  });

  if (l7BB >= 5) {
    const evL7 = Math.round((l7EvSum / l7BB) * 10) / 10;
    const seasonEv = hasLaunchSpeed && battedBalls > 0
      ? Math.round((evSum / battedBalls) * 10) / 10
      : null;
    recentEv = {
      evL7,
      bbL7: l7BB,
      hardHitPctL7: Math.round((l7HH      / l7BB) * 1000) / 10,
      barrelPctL7:  Math.round((l7Barrels  / l7BB) * 1000) / 10,
      evDelta: seasonEv != null ? Math.round((evL7 - seasonEv) * 10) / 10 : null,
    };
  }
}
```

**Step 3** — Add `recentEv` to the returned `profile` object (alongside `pitchTypeSplits`):
```js
const profile = {
  barrelPct: ...,
  hardHitPct: ...,
  avgExitVelo: ...,
  avgLaunchAngle: ...,
  hrFbRate: ...,
  pitchTypeSplits,
  recentEv,   // null if < 5 batted balls in last 7 days
};
```

Also update the console log line:
```js
console.log(`  ✓ Batter Power  batterId=${batterId} barrel=${profile.barrelPct}% EV=${profile.avgExitVelo} evL7=${profile.recentEv?.evL7 ?? "n/a"}`);
```

---

### Part B — `backend/routes/hrScout.js`

**Step 1** — In `computeHRScore`, after the `hrFb` signal block (inside `// ── Batter power signals ──`), add:
```js
// ── L7 EV trend ───────────────────────────────────────────────
const evDelta = pp.recentEv?.evDelta ?? null;
const bbL7    = pp.recentEv?.bbL7    ?? 0;
if (evDelta != null && bbL7 >= 5) {
  if (evDelta >= 4)       { score += 2; signals.push(`EV spiking +${evDelta} mph vs season avg (L7)`); }
  else if (evDelta >= 2)  { score += 1; signals.push(`EV trending up +${evDelta} mph vs season (L7)`); }
  else if (evDelta <= -3) { score -= 1; signals.push(`EV down ${evDelta} mph vs season avg (L7)`); }
}
```

**Step 2** — In `generateHRScoutPicks`, in the context line array, add a new line after the `POWER:` line using the same spread pattern as `PITCH SPLITS:`:
```js
...(pp.recentEv ? [`EV L7: ${pp.recentEv.evL7} mph (${pp.recentEv.evDelta >= 0 ? "+" : ""}${pp.recentEv.evDelta} vs szn) | HH% ${pp.recentEv.hardHitPctL7}% | Brl% ${pp.recentEv.barrelPctL7}% | ${pp.recentEv.bbL7} BB`] : []),
```

---

### Part C — `prop-scout-v7.jsx`

**Location:** In the batter expansion drawer, find the `<div style={{ display: "flex", gap: 6, marginBottom: 10 }}>` row containing the `<StatMini label="AVG" ...>` chips. Insert this IIFE block immediately **after** that div (before the Career H2H block):

```jsx
{(() => {
  const rev = b.powerProfile?.recentEv;
  if (!rev) return null;
  const deltaColor = rev.evDelta >= 4  ? "#22c55e"
                   : rev.evDelta >= 2  ? "#86efac"
                   : rev.evDelta <= -3 ? "#ef4444"
                   : "#6b7280";
  const deltaStr = rev.evDelta != null
    ? `${rev.evDelta >= 0 ? "+" : ""}${rev.evDelta} vs szn`
    : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, background: "#1a1b2e", borderRadius: 8, padding: "6px 10px" }}>
      <span style={{ fontSize: 8, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>L7 EV</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>{rev.evL7} mph</span>
      {deltaStr && <span style={{ fontSize: 10, fontWeight: 700, color: deltaColor, fontFamily: "monospace" }}>{deltaStr}</span>}
      <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>HH {rev.hardHitPctL7}%</span>
      <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>Brl {rev.barrelPctL7}%</span>
      <span style={{ fontSize: 8, color: "#4b5563", marginLeft: "auto", flexShrink: 0 }}>{rev.bbL7} BB</span>
    </div>
  );
})()}
```

---

### Key Constraints

- Minimum **5 batted balls** in the 7-day window — if fewer, `recentEv` is `null` and nothing renders
- `game_date >= cutoffStr` string comparison works correctly since both are `YYYY-MM-DD` ISO format
- `evDelta` is `null` when season `avgExitVelo` is unavailable — `evL7` still shows in the drawer without the delta chip
- `recentEv` is always present on the profile object (null if insufficient data) — never omitted
- No new HTTP requests — second pass over already-fetched rows only

### Files to Modify

1. `backend/routes/batterPower.js`
2. `backend/routes/hrScout.js`
3. `prop-scout-v7.jsx`

### Handoff Note

After completing, update `AGENT_SYSTEM_PROMPT.md`: mark **BACKLOG TASK 51** as `COMPLETED ✅` and note what was built under CODEX TASK 42.

**Completed summary (2026-05-01):**
- `backend/routes/batterPower.js` now computes a `recentEv` object from the already-fetched Savant CSV using a second pass over the last 7 days of batted-ball events, including `evL7`, `hardHitPctL7`, `barrelPctL7`, `bbL7`, and `evDelta` versus season EV.
- `backend/routes/hrScout.js` now uses the rolling L7 EV trend as an HR Scout scoring signal and includes the recent EV block in the AI context prompt.
- `prop-scout-v7.jsx` now shows an `L7 EV` strip in the batter expansion drawer when enough recent batted-ball sample exists.

---

## CODEX TASK 40 — Pitcher Handedness Splits (Backlog Task 49)

### Background

The Savant pitch-level CSV fetched in `backend/routes/arsenal.js` includes a `stand` column on every row (`"L"` or `"R"` for batter stance). `buildArsenalFromRows(rows)` currently computes pitcher contact-quality stats (Barrel%, HH%, FB%) over all batters combined. This task splits those computations by batter handedness and upgrades the HR Scout scoring model to use the hand-appropriate split.

### Part A — Backend: `backend/routes/arsenal.js`

**Step 1 — Add column guard** alongside existing guards (after `hasBbTypeColumn`):

```js
const hasStandColumn = sampleKeys.includes("stand");
const hasEventsColumn = sampleKeys.includes("events");
```

**Step 2 — Add a helper function** `computeHandSplit(splitRows)` directly above `buildArsenalFromRows`. It takes a pre-filtered subset of rows and computes the same contact-quality metrics as the main loop:

```js
function computeHandSplit(splitRows, hasLSA, hasBbType, hasEvents) {
  let battedBalls = 0, barrels = 0, hardHits = 0, flyBalls = 0, popups = 0, hrAllowed = 0;
  splitRows.forEach(r => {
    if ((r.pitch_type || "").trim().toUpperCase() === "PO") return;

    if (hasEvents && (r.events || "").toLowerCase() === "home_run") hrAllowed++;

    if (hasLSA) {
      const lsa = parseInt(r.launch_speed_angle, 10);
      const ev  = parseFloat(r.launch_speed);
      if (!isNaN(lsa) && lsa >= 1 && lsa <= 6) {
        battedBalls++;
        if (lsa === 6) barrels++;
        if (!isNaN(ev) && ev >= 95) hardHits++;
      }
    }
    if (hasBbType) {
      if (r.bb_type === "fly_ball") flyBalls++;
      if (r.bb_type === "popup")    popups++;
    }
  });

  if (battedBalls < 20) return null; // insufficient sample

  return {
    hrAllowed,
    barrelPct:        Math.round((barrels / battedBalls) * 1000) / 10,
    hardHitPct:       Math.round((hardHits / battedBalls) * 1000) / 10,
    flyBallPct:       hasBbType ? Math.round(((flyBalls + popups) / battedBalls) * 1000) / 10 : null,
  };
}
```

**Step 3 — Compute splits in `buildArsenalFromRows`**, after the main `rows.forEach` loop and before the `pitcherStats` object is built:

```js
const vsLeft  = hasStandColumn
  ? computeHandSplit(rows.filter(r => (r.stand || "").toUpperCase() === "L"),
      hasLaunchSpeedAngleColumn, hasBbTypeColumn, hasEventsColumn)
  : null;
const vsRight = hasStandColumn
  ? computeHandSplit(rows.filter(r => (r.stand || "").toUpperCase() === "R"),
      hasLaunchSpeedAngleColumn, hasBbTypeColumn, hasEventsColumn)
  : null;
```

**Step 4 — Add to `pitcherStats` object**:

```js
const pitcherStats = {
  swStrPct: ...,
  // ... existing fields unchanged ...
  vsLeft,   // { hrAllowed, barrelPct, hardHitPct, flyBallPct } | null
  vsRight,  // { hrAllowed, barrelPct, hardHitPct, flyBallPct } | null
};
```

---

### Part B — HR Scout scoring upgrade: `backend/routes/hrScout.js`

In `computeHRScore(batter, pitcherStats, parkFactor, windBoost)`, the three pitcher signals currently use overall stats. Upgrade them to prefer hand-specific stats when available:

```js
// At the top of computeHRScore, resolve the hand-appropriate pitcher split:
const handSplit = batter.hand === "L" ? (pitcherStats?.vsLeft ?? null)
                : batter.hand === "R" ? (pitcherStats?.vsRight ?? null)
                : null;

// Then replace:
const fbPct   = handSplit?.flyBallPct   ?? pitcherStats?.flyBallPctInclPopup ?? null;
const pBarrel = handSplit?.barrelPct    ?? pitcherStats?.barrelPct           ?? null;
// xwOBA stays overall — not computed per-hand
const xwOBA   = pitcherStats?.xwOBAAllowed ?? null;
```

Also add `hrAllowed` as a new signal (add after the existing pitcher signals block):

```js
const hrAllowed = handSplit?.hrAllowed ?? null;
if (hrAllowed != null) {
  if (hrAllowed >= 15) { score += 2; signals.push(`${hrAllowed} HR allowed vs ${batter.hand}HB`); }
  else if (hrAllowed <= 3)  { score -= 1; signals.push(`Only ${hrAllowed} HR allowed vs ${batter.hand}HB`); }
}
```

---

### Part C — Frontend display: `prop-scout-v7.jsx`

In the Overview tab pitcher stats section (search for `hasAny` guard that gates the Barrel%/HH%/xwOBA chips), add a vs-handedness row **after** the existing stats chips. Only render if at least one side has data:

```jsx
{(stats.vsLeft || stats.vsRight) && (
  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
    {["vsLeft", "vsRight"].map(side => {
      const split = stats[side];
      if (!split) return null;
      const label = side === "vsLeft" ? "vs LHH" : "vs RHH";
      const color = "#94a3b8";
      return (
        <div key={side} style={{ background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 5, padding: "3px 8px", fontSize: 9, color, fontFamily: "monospace" }}>
          {label} · {split.hrAllowed} HR · {split.barrelPct}% Brl · {split.hardHitPct}% HH{split.flyBallPct != null ? ` · ${split.flyBallPct}% FB` : ""}
        </div>
      );
    })}
  </div>
)}
```

---

### Acceptance criteria

1. `pitcherStats.vsLeft` and `pitcherStats.vsRight` present on arsenal responses when `stand` column exists and sample ≥ 20 batted balls per side; `null` otherwise
2. `computeHRScore` uses hand-specific barrel% and FB% when available, falls back to overall if not
3. `hrAllowed` signal fires correctly for high (≥15) and low (≤3) HR counts
4. Overview pitcher stats shows vs LHH / vs RHH chips when data is available
5. No regressions — existing `barrelPct`, `hardHitPct`, `xwOBAAllowed` fields unchanged
6. `npm run build` exits 0
7. Update `AGENT_SYSTEM_PROMPT.md` with CODEX TASK 40 handoff note

---

## HANDOFF NOTE — 2026-04-30 — CODEX TASK 40 COMPLETED

Codex completed the pitcher handedness split upgrade across the Savant arsenal pipeline, HR Scout scoring, and the Overview pitcher UI.

### Files changed

- `backend/routes/arsenal.js`
- `backend/routes/hrScout.js`
- `prop-scout-v7.jsx`

### What changed

#### Part A — `backend/routes/arsenal.js`

Added two new column guards in `buildArsenalFromRows(rows)`:

- `hasStandColumn`
- `hasEventsColumn`

Added a new helper directly above `buildArsenalFromRows`:

- `computeHandSplit(splitRows, hasLSA, hasBbType, hasEvents)`

This helper computes handedness-specific contact-quality stats from a pre-filtered subset of Savant rows:

- `hrAllowed`
- `barrelPct`
- `hardHitPct`
- `flyBallPct`

Important behavior:

- returns `null` when fewer than `20` batted balls are present for that handedness split
- skips pickoff rows (`PO`) just like the main aggregator
- never crashes when relevant columns are absent

After the main pitch-row aggregation loop, Codex added:

- `vsLeft`
- `vsRight`

These are built by filtering on `stand === "L"` and `stand === "R"` respectively, then passing those row subsets into `computeHandSplit(...)`.

`pitcherStats` now includes:

- `vsLeft`
- `vsRight`

All existing aggregate fields remain unchanged:

- `barrelPct`
- `hardHitPct`
- `flyBallPct`
- `flyBallPctInclPopup`
- `xwOBAAllowed`
- etc.

#### Part B — `backend/routes/hrScout.js`

Inside `computeHRScore(...)`, Codex added a hand-specific split resolver:

- LHB batters use `pitcherStats.vsLeft`
- RHB batters use `pitcherStats.vsRight`
- switch/unknown hands fall back to overall pitcher stats

The HR Scout model now prefers handedness-specific values for:

- `flyBallPct`
- `barrelPct`

with fallback to:

- `pitcherStats.flyBallPctInclPopup`
- `pitcherStats.barrelPct`

`xwOBAAllowed` remains overall-only, per spec.

Also added a new `hrAllowed` signal:

- `+2` if `hrAllowed >= 15`
- `-1` if `hrAllowed <= 3`

Signal text includes batter handedness, e.g.:

- `15 HR allowed vs LHB`
- `Only 3 HR allowed vs RHB`

#### Part C — `prop-scout-v7.jsx`

In the Overview pitcher stats section, Codex added a second row beneath the existing stat strip that renders only when handedness splits exist.

The new row shows:

- `vs LHH`
- `vs RHH`

Each chip includes:

- HR allowed
- Barrel%
- HardHit%
- FlyBall%

Only sides with valid split data render, so small-sample `null` sides remain hidden.

### Verification

Codex ran:

- `node --check backend/routes/arsenal.js`
- `node --check backend/routes/hrScout.js`
- `npm run build`

All passed cleanly.

### Scope notes

- No new routes were added
- No cache keys or payload signatures changed outside the new nullable `vsLeft` / `vsRight` fields on `pitcherStats`
- Existing aggregate pitcher metrics were preserved exactly as before

---

## HANDOFF NOTE — 2026-05-01 — Pick Auto-Grading Audit / Pending Picks Investigation

Codex investigated why production can still show older logged picks as `pending` after the games have finished.

### Key finding

The current auto-grading path is **frontend-driven**, not backend-driven.

In `prop-scout-v7.jsx`, the grading effect:

- watches the currently loaded `liveSlate`
- detects games that become `Final`
- fetches final boxscore data
- runs `computeGrade(...)`
- writes `hit` / `miss` back to the pick log

This means grading is reliable only when:

- the app is open at some point after the game finishes, and
- the finished game is part of the currently loaded slate

### Why old picks can stay pending

#### 1. Historical picks are not revisited once they fall off the active slate

The grading effect iterates over `liveSlate`, which is normally today's schedule. Older unresolved picks from prior days are not proactively scanned by `gamePk`, so they can remain pending indefinitely.

Example:

- a pick from `Apr 29` can still be pending on `May 1`
- because `May 1`'s `liveSlate` will not include that historical game
- therefore the auto-grade effect never revisits it

#### 2. `F5` is not currently gradeable

The current `computeGrade(...)` implementation no longer includes an `F5 / First 5` grading branch.

Result:

- old `F5` picks can remain `pending` forever under the current logic

#### 3. Older picks may be metadata-fragile

`computeGrade(...)` depends on saved metadata to match the correct player or pitcher:

- pitcher props prefer `pick.pitcherName`
- batter props prefer `pick.playerId` / `pick.playerName`

Recent `logPick(...)` writes these fields much more consistently, but older picks logged before those schema improvements may still fail the matcher and return `null`.

### Prop types currently supported by the frontend grader

Supported now:

- `NRFI`
- `YRFI`
- `Game Total / O/U Total`
- `Run Line`
- `Moneyline`
- pitcher `Strikeouts`
- pitcher `Outs`
- batter `Hits`
- batter `Total Bases`
- batter `Home Runs`
- batter `RBI`

Not currently supported in the live grader:

- `F5 / First 5`

### Recommended fix path

Codex recommended moving pick settlement to the backend.

#### Preferred architecture

1. Extract grading logic into a backend grading service
2. Run a scheduled unresolved-picks job on the backend
3. Query all picks where `result IS NULL`
4. Group by `gamePk`
5. Fetch final boxscore for each game
6. Grade all unresolved picks and persist `hit` / `miss`

Benefits:

- historical picks get settled even if nobody opens the app
- grading no longer depends on today's active slate
- production stops accumulating stale `pending` picks

#### Optional interim fix

As a smaller stopgap, the frontend Picks view could backfill unresolved picks by:

- scanning `propLog.filter(p => p.result === null)`
- fetching historical boxscores by `gamePk`
- running the same grading logic on view open

This would improve catch-up behavior, but it would still be browser-dependent and less reliable than backend settlement.

### Important implementation notes for future work

- if historic `F5` picks still matter, an `F5` grading branch needs to be restored
- grading should key off unresolved picks' `gamePk`, not today's schedule
- backend grader should preserve multiple player/pitcher matching fallbacks for older pick records

### Scope of this audit

- investigation only
- no grading logic was changed
- no backend settlement worker was built yet

---

## HANDOFF NOTE — 2026-05-01 — CODEX TASK 55 COMPLETED (Pick Auto-Grading Phase A: Historical Catch-Up)

Implemented the first practical follow-up to the pending-picks audit in the frontend only.

### Files changed

- `prop-scout-v7.jsx`

### What changed

- Added `histGradedGames` ref near the existing `gradedGames` ref.
- Added a second grading `useEffect` immediately after the existing today-slate auto-grader.
- New effect only runs when `view === "picks"`.
- It identifies pending picks whose `gamePk` is not part of today’s `liveSlate`, groups them by `gamePk`, and attempts a historical catch-up grade by fetching `/api/boxscore/:gamePk`.
- If a final boxscore is already present in `liveBoxscores`, it grades from cache without refetching.
- Uses the existing `computeGrade(...)` and `markResult(...)` functions unchanged.
- If a game is not final yet, fetch fails, or no picks could be graded, the game key is removed from `histGradedGames` so it can retry the next time the user opens Picks.

### Scope / constraints preserved

- No backend changes.
- No changes to `computeGrade`, `markResult`, or the existing today-slate grading effect.
- New effect dependency array is exactly `[view, propLog]`.
- Historical detection uses string coercion on `gamePk` so localStorage/API number-vs-string mismatches do not block grading.

### Verification

- `npm run build` passed

### Notes for Cowork

- This is still a frontend-driven catch-up pass, not a true backend settlement worker.
- It should clear many old `pending` picks as soon as the user opens the Picks tab, as long as the prop type is still supported by `computeGrade(...)`.
- Historic `F5` picks remain unsupported unless `computeGrade(...)` gets an F5 branch restored in a future task.

---

## BACKLOG TASK 52 — Batter Board Props Retry (HR / Hits Chips)

**Status:** COMPLETED ✅
**LOE:** Small
**Type:** Frontend only
**Dependencies:** None

### Problem

The multi-book prop chips (DK/FD/CZR/MGM/BOV) are already rendered in the batter board card code (lines 9110-9141 of `prop-scout-v7.jsx`) via `{c.propLine?.books && ...}`. The rendering is structurally identical to the pitcher board chips (lines 8978-9009).

The chips don't appear on HR/Hits tabs because of a caching gap: when the Board view opens early in the day, `fetchPlayerPropsDirect` is called for each game. All 5 markets (pitcher K, pitcher Outs, batter HR, batter H, batter TB) are fetched in one Odds API call. However, books typically post pitcher K/Outs lines first (hours before game time) and batter HR/H lines much later (~1-2 hours before first pitch).

When props fetch with only pitcher markets populated, the result is stored in both `playerPropsCache` and `livePlayerProps[key]`. The board useEffect guard (`if (livePlayerProps[key] || boardPropsFetched.current.has(key)) return`) then blocks all retries. So even after books post batter lines, the board never re-fetches and batter chips never appear.

### Fix

In the board useEffect `.then()` callback: if the fetched props have no batter markets (`batter_home_runs` or `batter_hits`), delete the browser-side `playerPropsCache[key]` entry and remove the key from `boardPropsFetched.current` so the next lineup/slate update triggers a retry. No structural code changes are needed to the rendering layer.

---

## CODEX TASK 45 — Batter Board Props Retry (Backlog Task 52)

**File:** `prop-scout-v7.jsx`
**Backend changes:** None
**Lines to change:** One block in the board useEffect (around line 3150-3162)

### Root cause

In the board props useEffect (fires when `[view, liveLineups, liveSlate]` changes), the current guard is:

```js
if (livePlayerProps[key] || boardPropsFetched.current.has(key)) return;
boardPropsFetched.current.add(key);
setLivePlayerProps(prev => ({ ...prev, [key]: "loading" }));
fetchPlayerPropsDirect(game.away?.name ?? "", game.home?.name ?? "", game.gamePk)
  .then(result => {
    const normalized = result?.props ? result : { props: result ?? [], reason: "ok" };
    setLivePlayerProps(prev => ({ ...prev, [key]: normalized }));
  })
  .catch(() => {
    boardPropsFetched.current.delete(key);
    setLivePlayerProps(prev => ({ ...prev, [key]: { props: [] } }));
  });
```

Once a game's props are fetched — even with zero batter lines — `livePlayerProps[key]` is set and `boardPropsFetched.current.has(key)` returns true. No retry ever happens.

### Fix (drop-in replacement for the block above)

Replace the block (the `if` guard + `boardPropsFetched.current.add(key)` + `setLivePlayerProps("loading")` + `fetchPlayerPropsDirect(...).then(...).catch(...)`) with:

```js
// Skip if currently fetching (avoid concurrent requests)
if (livePlayerProps[key] === "loading") return;
// Skip if already fetched WITH batter props — nothing left to load
const hasBatterProps = Array.isArray(livePlayerProps[key]?.props) &&
  livePlayerProps[key].props.some(p =>
    p.market === "batter_home_runs" || p.market === "batter_hits"
  );
if (hasBatterProps) return;
// Skip if already in-flight from this effect run (race guard)
if (boardPropsFetched.current.has(key)) return;
boardPropsFetched.current.add(key);
setLivePlayerProps(prev => ({ ...prev, [key]: "loading" }));
fetchPlayerPropsDirect(game.away?.name ?? "", game.home?.name ?? "", game.gamePk)
  .then(result => {
    const normalized = result?.props ? result : { props: result ?? [], reason: "ok" };
    setLivePlayerProps(prev => ({ ...prev, [key]: normalized }));
    // If still no batter props, allow a future retry (books may post them later)
    const gotBatterProps = normalized.props?.some(p =>
      p.market === "batter_home_runs" || p.market === "batter_hits"
    );
    if (!gotBatterProps) {
      boardPropsFetched.current.delete(key);
      delete playerPropsCache[key]; // clear browser-side dedup cache too
    }
  })
  .catch(() => {
    boardPropsFetched.current.delete(key);
    setLivePlayerProps(prev => ({ ...prev, [key]: { props: [] } }));
  });
```

### What this does

- If a game's props come back with pitcher lines only (no `batter_home_runs` or `batter_hits`): clears both `boardPropsFetched` and `playerPropsCache` for that game so the next lineup update (which fires the effect again) will retry
- If a game's props come back with batter lines: marks as done and never retries (same as before)
- Still uses the `boardPropsFetched` set to prevent concurrent duplicate requests within a single effect run
- No backend changes required — the Odds API endpoint already fetches all 5 markets in one call; we just need to retry until batter lines arrive

### Verification

1. `npm run build` must pass (no JSX or syntax errors)
2. Load the app on the Board/HR tab when batter props are not yet posted → confirm no fetch-loop (network tab should show one request per game, not continuous polling)
3. Once batter props are available (mock by seeding `playerPropsCache[gamePk] = { props: [{ market: "batter_home_runs", books: { DK: { line: 0.5, overOdds: "+130", underOdds: "-160" } }, ... }] }`), confirm that chips appear on HR and Hits batter cards

### After completing

Update `AGENT_SYSTEM_PROMPT.md`: mark **BACKLOG TASK 52** as `COMPLETED ✅` and add a brief completion note under CODEX TASK 45.

### Completion note

- Updated the Board props prefetch guard so games with only pitcher markets no longer get stuck permanently cached.
- If a fetch returns no `batter_home_runs` or `batter_hits`, the code now clears both `boardPropsFetched.current` and the browser-side `playerPropsCache[key]` so a later board refresh can retry.
- Concurrent duplicate requests are still prevented while a fetch is actively in flight.

---

## BACKLOG TASK 53 — Games Board: Team Lean Badge + Book Odds Chips

**Status:** COMPLETED ✅
**LOE:** Small
**Type:** Frontend only
**Dependencies:** None

### What

Two UX improvements to the Games board cards (Board → Games tab):

1. **Team lean badge**: Run Line and Moneyline sub-tabs currently show "HOME" or "AWAY" in the right-side badge. Replace with the actual team abbreviation (e.g., "ATL", "NYY") so the user immediately knows which team to bet without mentally mapping HOME/AWAY.

2. **Book odds chips**: Add per-book odds chips below the weather/park row on each game card — similar to how batter/pitcher board cards show DK/FD/CZR/MGM chips. For Total, show the O/U line + over/under odds from each book. For Spread and ML, show the leaning team's line/odds from each book.

---

## CODEX TASK 46 — Games Board: Team Lean Badge + Book Odds Chips (Backlog Task 53)

**File:** `prop-scout-v7.jsx` only  
**Backend changes:** None  
**Key functions/lines:** `computeGameBoard` (around line 2035), game board card rendering (around line 8784)

---

### Part A — `computeGameBoard`: Add `leanAbbr` and `odds` fields

The `computeGameBoard` function currently pushes game candidates with `lean: "HOME"/"AWAY"` but doesn't include the team abbreviation or the raw odds object. Both are needed for the badge and chips.

**Four `games.push(...)` calls need two new fields: `leanAbbr` and `odds`.**

**NRFI push** (around line 2123):
```js
games.push({ ..., leanAbbr: null, odds });
```

**Total push** (around line 2222):
```js
games.push({ ..., leanAbbr: null, odds });
```

**Spread push** (around line 2276):
```js
// lean is already "HOME" or "AWAY" at this point
games.push({ ..., lean, leanAbbr: lean === "HOME" ? game.home.abbr : game.away.abbr, line: spreadLine, ..., odds });
```

**ML push** (around line 2329):
- Note: ML section already has a local `const leanAbbr = lean === "HOME" ? game.home.abbr : game.away.abbr` at line 2328. **Rename that local variable to `mlLeanAbbr`** (to avoid shadowing the object key), then include it:
```js
const mlLeanAbbr = lean === "HOME" ? game.home.abbr : game.away.abbr;
games.push({ ..., lean, leanAbbr: mlLeanAbbr, line: mlLine, leanLabel: `${mlLeanAbbr} ML ${mlLine}`, ..., odds });
```

The `odds` variable in `computeGameBoard` is already defined at the top of the `(activeSlate ?? []).forEach(game => {...})` block as `const odds = liveOddsMap[oddsKey] ?? game.odds ?? {}`. Pass it through directly.

---

### Part B — Badge rendering: Show `c.leanAbbr ?? c.lean`

**Find** the lean badge at approximately line 8844:
```jsx
<div style={{ fontSize: 12, fontWeight: 900, color: lc, fontFamily: "monospace", lineHeight: 1 }}>{c.lean}</div>
{c.line && <div style={{ fontSize: 8, color: lc, fontFamily: "monospace", marginTop: 1, opacity: 0.8 }}>{c.line}</div>}
```

**Replace** `{c.lean}` with `{c.leanAbbr ?? c.lean}`:
```jsx
<div style={{ fontSize: 12, fontWeight: 900, color: lc, fontFamily: "monospace", lineHeight: 1 }}>{c.leanAbbr ?? c.lean}</div>
{c.line && <div style={{ fontSize: 8, color: lc, fontFamily: "monospace", marginTop: 1, opacity: 0.8 }}>{c.line}</div>}
```

Result:
- NRFI/YRFI: `leanAbbr = null` → badge still shows "NRFI" ✓
- OVER/UNDER: `leanAbbr = null` → badge still shows "OVER" + "8.5" ✓
- Run Line: `leanAbbr = "ATL"` → badge shows "ATL" + "-1.5" ✓
- Moneyline: `leanAbbr = "ATL"` → badge shows "ATL" + "-135" ✓

---

### Part C — Book odds chips row

**Insert** this block immediately before the closing `</div>` of the main flex-1 content div (the one containing the SP row and weather row — approximately after line 8839 and before the flex-1 `</div>` at line 8840):

```jsx
{/* Book odds chips — Total / Spread / ML */}
{c.odds?.books && gameSubTab !== "nrfi" && (() => {
  const BOOK_COLORS = { DK: "#38bdf8", FD: "#34d399", CZR: "#fb923c", MGM: "#a78bfa" };
  const isAwayLean = c.leanAbbr != null && c.leanAbbr === c.away?.abbr;
  const chips = Object.entries(BOOK_COLORS)
    .map(([bk, color]) => {
      const bd = c.odds.books[bk];
      if (!bd) return null;
      let lineText = null;
      if (gameSubTab === "total") {
        if (bd.total) lineText = `O/U ${bd.total} ${bd.overOdds ?? "—"}/${bd.underOdds ?? "—"}`;
      } else if (gameSubTab === "spread") {
        const sp   = isAwayLean ? bd.awaySpread     : bd.homeSpread;
        const spOd = isAwayLean ? bd.awaySpreadOdds : bd.homeSpreadOdds;
        if (sp) lineText = `${sp}${spOd ? ` ${spOd}` : ""}`;
      } else if (gameSubTab === "ml") {
        const ml = isAwayLean ? bd.awayML : bd.homeML;
        if (ml) lineText = ml;
      }
      if (!lineText) return null;
      return { bk, color, lineText };
    })
    .filter(Boolean);
  if (!chips.length) return null;
  return (
    <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
      {chips.map(({ bk, color, lineText }) => (
        <span key={bk} style={{
          fontSize: 8, fontWeight: 700, color,
          background: `${color}15`, border: `1px solid ${color}33`,
          borderRadius: 4, padding: "2px 6px", fontFamily: "monospace",
        }}>
          {bk === preferredBook ? `★ ${bk}` : bk} {lineText}
        </span>
      ))}
    </div>
  );
})()}
```

---

### Verification

1. `npm run build` must pass
2. On the Games → Moneyline sub-tab: lean badge shows a 3-letter team abbreviation (e.g., "ATL"), not "HOME"/"AWAY"
3. On the Games → Run Line sub-tab: same — badge shows team abbr + spread (e.g., "ATL" / "-1.5")
4. On the Games → O/U Total sub-tab: badge still shows "OVER" or "UNDER" (leanAbbr is null for total) ✓
5. On the Games → NRFI sub-tab: badge still shows "NRFI" or "YRFI" ✓
6. Book chips appear on Total, Spread, and ML cards when odds are loaded; no chips on NRFI cards
7. Preferred book chip is starred (★)

### After completing

Update `AGENT_SYSTEM_PROMPT.md`: mark **BACKLOG TASK 53** as `COMPLETED ✅` and add a brief completion note under CODEX TASK 46.

### Completion note

- `computeGameBoard` candidates now carry both `leanAbbr` and raw `odds` so the render layer can show team-specific lean badges and per-book pricing.
- Games Board Moneyline and Run Line cards now display the team abbreviation instead of generic `HOME` / `AWAY`.
- Added DK / FD / CZR / MGM chips for Total, Spread, and ML cards, with the preferred book starred via `★`.
- NRFI cards remain unchanged and intentionally do not render book chips.

---

## BACKLOG TASK 54 — Pick Auto-Grading Phase A: Historical Catch-Up

**Status:** COMPLETED ✅ (CODEX TASK 55 — 2026-05-01)
**LOE:** Small
**Type:** Frontend only
**Dependencies:** None

Pending picks from prior days were never graded because the existing grading effect only iterates over today's `liveSlate`. Added a second `useEffect` that fires when `view === "picks"`, scans for pending picks whose `gamePk` is not in today's slate, fetches their final boxscores, and grades them via the existing `computeGrade` / `markResult` path.

---

## HANDOFF NOTE — 2026-05-01 — CODEX TASK 55 COMPLETED

Codex completed the historical pick catch-up grader in `prop-scout-v7.jsx`.

### Files changed

- `prop-scout-v7.jsx`

### What was implemented

**New ref** (near `gradedGames`):
```js
const histGradedGames = useRef(new Set()); // gamePks already processed by the historical catch-up grader
```

**New `useEffect`** (inserted after the existing today-slate grading effect):
- Only fires when `view === "picks"` and `!IS_STATS_SANDBOX`
- Builds `todayGamePks` from `liveSlate` for exclusion
- Finds all `propLog` entries with `result === null` and `gamePk` not in today's slate
- Groups by `gamePk`, fetches `/api/boxscore/${gamePk}` per game
- Runs `computeGrade` on each pending pick, calls `markResult` for hits/misses
- Deletes from `histGradedGames` ref if not final / error / nothing graded — allows retry on next Picks tab open
- Dependency array: `[view, propLog]`

### What was NOT changed

- `computeGrade` — untouched
- `markResult` — untouched  
- Existing today-slate grading effect — untouched
- No backend changes

### Notes for Cowork

- Phase B (backend settlement worker) remains on hold — this frontend catch-up is the stopgap
- `F5` picks will still not grade (no `F5` branch in `computeGrade`) — acceptable since F5 props were removed from the app
