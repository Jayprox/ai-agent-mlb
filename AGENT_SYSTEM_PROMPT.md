# Prop Scout Agent — System Prompt

Paste the following as the system prompt for any AI agent or model you want to act as a sharp MLB prop researcher using the Prop Scout API.

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
