# CODEX TASK 136 — The Scout: AI Bettor Tab

## Goal

Add a **Scout** tab — a Scout-only feature where the user sets a daily profit goal and a unit size, hits "Build My Slate", and gets a curated set of straight-bet picks with detailed AI reasoning. The system uses only data already inside Prop Scout (algorithmic scoring models + live odds) to select picks that, if ~62% hit, generate the user's profit target.

This is distinct from the AI Board (which ranks everything). The Scout selects a specific number of picks sized to the profit math, shows true Kelly fractions per pick, and generates narrative reasoning for each one.

---

## Background: What Already Exists

### Scoring models (src/board/index.js)
- `computePitcherBoard("k", ...)` → K prop candidates with `score`, `simConfidence`, `lean`, `bookLine`, `propLine`
- `computePitcherBoard("outs", ...)` → Outs prop candidates (same shape)
- `computeGameBoard("total", ...)` → Over/Under total candidates with `score`, `lean`, `leanOdds`, `leanImplied`
- `computeGameBoard("spread", ...)` → Runline spread candidates
- `computeGameBoard("ml", ...)` → Full-game moneyline candidates
- `computeGameBoard("f5ml", ...)` → First-5-innings ML candidates
- `computeGameBoard("f5spread", ...)` → First-5-innings spread candidates

All game board candidates already have `score` (0–100), `lean`, and odds fields extracted.

### Odds utilities (src/utils.js)
- `mlToImplied(americanOdds)` — converts American odds to decimal implied probability
- `vigStrip(leanRaw, oppRaw)` — removes vig to get true implied probability
- `propEdgeData(propLine, lean)` — returns `{ bookOdds, impliedProb }` for prop cards

### AI scoring pipeline
- `POST /api/ai-board/score` — existing endpoint, calls Claude Haiku with candidate data, returns per-candidate `aiReason` strings. The Scout needs its own endpoint with a different prompt (bettor narrative vs scoring).

### Gating
- `isScoutUser` boolean already exists (SCOUT_ALLOWLIST check)
- All Scout-only features check this before rendering

### Key state already available at render time
- `liveSlate`, `liveLineups`, `liveWeather`, `livePlayerProps`
- `livePitcherStats`, `liveGameLog`, `liveUmpires`, `liveTeamStats`
- `liveHittingLog`, `liveStatSplits`, `pitcherArsenal`
- `liveNrfiData`, `liveOddsMap`

---

## What To Build

### 1. New utility: `kellyFraction` (src/utils.js)

```js
/**
 * Kelly criterion fraction of bankroll to wager.
 * @param {number} modelProb  - model's estimated win probability (0–1)
 * @param {number} americanOdds - book odds in American format (e.g. -110, +130)
 * @returns {number} fraction (0–1), clamped to [0, 0.30] — never bet >30% of bankroll
 */
export function kellyFraction(modelProb, americanOdds) {
  const n = parseInt(americanOdds);
  if (isNaN(n) || modelProb <= 0) return 0;
  // b = net odds per $1 wagered
  const b = n > 0 ? n / 100 : 100 / Math.abs(n);
  const q = 1 - modelProb;
  const f = (modelProb * b - q) / b;
  return Math.min(0.30, Math.max(0, f));
}
```

Add a test in `src/utils.test.js`:
```js
describe("kellyFraction", () => {
  it("returns positive fraction for +EV bet", () => {
    // model says 65% chance, book says -110 (implied ~52.4%)
    expect(kellyFraction(0.65, -110)).toBeGreaterThan(0);
  });
  it("returns 0 for -EV bet", () => {
    // model says 45% chance, book says -110 (implied ~52.4%)
    expect(kellyFraction(0.45, -110)).toBe(0);
  });
  it("clamps to 0.30 maximum", () => {
    expect(kellyFraction(0.99, +500)).toBe(0.30);
  });
});
```

---

### 2. Backend: `POST /api/scout/build-slate`

New file: `backend/routes/scout.js`
Mount in `backend/server.js`: `app.use("/api/scout", require("./routes/scout"));`

**Request body:**
```json
{
  "picks": [
    {
      "id": "unique-id",
      "market": "k",
      "playerName": "Gerrit Cole",
      "gameLabel": "BOS @ NYY",
      "lean": "OVER",
      "bookLine": 6.5,
      "bookOdds": -112,
      "score": 81,
      "simConfidence": 74,
      "impliedProb": 0.527,
      "kellyFraction": 0.18,
      "factors": ["7+ Ks in 4 of last 5", "Marlins rank 28th in K%", "Umpire Bucknor: +1.2 K/game"],
      "risks": ["Short rest (4 days)", "Wind in from RF"]
    }
  ]
}
```

**What the endpoint does:**
- Validates `picks` array (max 25)
- Calls Claude Haiku with a prompt that instructs it to act as a sharp sports bettor named "Scout" and generate per-pick reasoning
- Returns per-pick: `{ id, shortReason, confidenceStatement, keyRisk }`

**Haiku prompt template:**
```
You are Scout, a sharp sports bettor who focuses on finding high-confidence straight bets.
For each pick below, write:
1. shortReason (2–3 sentences): The primary reasons this bet has an edge. Use specific stats and matchup context from the factors provided.
2. confidenceStatement (1 sentence): Why the model and odds align here.
3. keyRisk (1 sentence): The single most important risk to know before placing this bet.

Be direct, specific, and data-driven. Avoid generic language. Reference actual numbers.

Picks:
${JSON.stringify(picks, null, 2)}

Respond with a JSON array: [{ "id": "...", "shortReason": "...", "confidenceStatement": "...", "keyRisk": "..." }]
```

**Error handling:** If Haiku is unavailable, return picks with empty `shortReason: null` — the frontend handles null gracefully.

---

### 3. Frontend state (prop-scout-v7.jsx, near line 2460)

```js
const [scoutGoal,          setScoutGoal]          = useState(50);    // daily profit target ($)
const [scoutUnit,          setScoutUnit]           = useState(25);    // risk per bet ($)
const [scoutSlate,         setScoutSlate]          = useState(null);  // { date, goal, unit, picks[], math } | null
const [scoutSlateLoading,  setScoutSlateLoading]   = useState(false);
const [scoutSlateError,    setScoutSlateError]     = useState(null);
```

---

### 4. Scout pick selection (pure function, outside component)

Add `buildScoutCandidates(allData)` function near `buildPerfMatrix`. This runs the three-stage funnel:

```js
function buildScoutCandidates({
  liveSlate, liveLineups, liveWeather, livePlayerProps,
  livePitcherStats, liveGameLog, liveUmpires, liveTeamStats,
  liveHittingLog, liveStatSplits, pitcherArsenal,
  liveNrfiData, liveOddsMap
}) {
  const candidates = [];

  // ── Stage 1: Pull from all 7 markets ──────────────────────────────────
  const kCards    = computePitcherBoard("k",    liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal);
  const outCards  = computePitcherBoard("outs", liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal);
  const totalGames   = computeGameBoard("total",   liveSlate, liveNrfiData, liveWeather, liveOddsMap, livePitcherStats, liveUmpires, liveLineups);
  const spreadGames  = computeGameBoard("spread",  liveSlate, liveNrfiData, liveWeather, liveOddsMap, livePitcherStats, liveUmpires, liveLineups);
  const mlGames      = computeGameBoard("ml",      liveSlate, liveNrfiData, liveWeather, liveOddsMap, livePitcherStats, liveUmpires, liveLineups);
  const f5mlGames    = computeGameBoard("f5ml",    liveSlate, liveNrfiData, liveWeather, liveOddsMap, livePitcherStats, liveUmpires, liveLineups);
  const f5spreadGames = computeGameBoard("f5spread", liveSlate, liveNrfiData, liveWeather, liveOddsMap, livePitcherStats, liveUmpires, liveLineups);

  // ── Stage 2: Normalize to common shape ──────────────────────────────
  // Prop cards (k, outs)
  for (const c of [...kCards, ...outCards]) {
    const { bookOdds, impliedProb } = propEdgeData(c.propLine ?? null, c.score >= 55 ? "OVER" : "UNDER");
    if (!bookOdds || impliedProb == null) continue;
    if (c.score < 62 || (c.simConfidence ?? 0) < 55) continue;         // quality floor
    const modelProb = (c.simConfidence ?? 50) / 100;
    if (modelProb <= impliedProb) continue;                              // must be +EV
    const kelly = kellyFraction(modelProb, bookOdds);
    if (kelly <= 0) continue;
    candidates.push({
      id:               `${c.id}-${c.market ?? (kCards.includes(c) ? "k" : "outs")}`,
      market:           kCards.includes(c) ? "k" : "outs",
      playerName:       c.name ?? c.playerName,
      gameLabel:        c.gameLabel,
      lean:             c.score >= 55 ? "OVER" : "UNDER",
      bookLine:         c.bookLine,
      bookOdds,
      score:            c.score,
      simConfidence:    c.simConfidence,
      impliedProb,
      modelProb,
      kellyFraction:    kelly,
      factors:          (c.positives ?? []).slice(0, 4),
      risks:            (c.negatives ?? []).slice(0, 2),
    });
  }

  // Game cards — use gameDisplayScore as model proxy
  // leanImplied and leanOdds are already computed inside computeGameBoard
  const gameDisplayScore = (g) =>
    g.model?.totalScore ?? g.model?.mlScore ?? g.model?.spreadScore ?? g.model?.f5mlScore ?? g.score ?? 0;

  for (const [gameList, market] of [
    [totalGames, "total"], [spreadGames, "spread"], [mlGames, "ml"],
    [f5mlGames, "f5ml"], [f5spreadGames, "f5spread"]
  ]) {
    for (const g of gameList) {
      const dispScore = gameDisplayScore(g);
      if (dispScore < 55) continue;
      const bookOdds = g.leanOdds ?? null;
      const impliedProb = g.leanImplied ?? null;
      if (!bookOdds || impliedProb == null) continue;
      const modelProb = Math.min(0.90, Math.max(0.50, dispScore / 100));
      if (modelProb <= impliedProb) continue;
      const kelly = kellyFraction(modelProb, bookOdds);
      if (kelly <= 0) continue;
      candidates.push({
        id:            `${g.gamePk}-${market}`,
        market,
        playerName:    null,
        gameLabel:     g.gameLabel ?? `${g.awayTeam} @ ${g.homeTeam}`,
        lean:          g.lean,
        leanLabel:     g.leanLabel ?? g.lean,
        bookLine:      g.bookLine ?? g.line ?? null,
        bookOdds,
        score:         dispScore,
        simConfidence: null,
        impliedProb,
        modelProb,
        kellyFraction: kelly,
        factors:       (g.model?.signals ?? []).map(s => s.detail ?? s.label).slice(0, 4),
        risks:         [],
      });
    }
  }

  // ── Stage 3: Sort by Kelly (highest conviction first) ─────────────────
  return candidates.sort((a, b) => b.kellyFraction - a.kellyFraction);
}
```

---

### 5. Scout math helper (pure function)

```js
function scoutMath(picks, unitSize, dailyGoal) {
  // Use actual odds per pick for true payout math
  const payouts = picks.map(p => {
    const odds = p.bookOdds ?? -110;
    const winAmt = odds > 0 ? (unitSize * odds / 100) : (unitSize * 100 / Math.abs(odds));
    return { win: winAmt, lose: unitSize };
  });

  const totalRisked = unitSize * picks.length;
  const avgWin = payouts.reduce((s, p) => s + p.win, 0) / picks.length;

  // At 62.5% hit rate
  const hitsAt625 = Math.round(picks.length * 0.625);
  const net625 = payouts.slice(0, hitsAt625).reduce((s, p) => s + p.win, 0)
               - payouts.slice(hitsAt625).reduce((s, p) => s + p.lose, 0);

  // Break-even hits needed
  // hits * avgWin - (n - hits) * unitSize = 0
  // hits * (avgWin + unitSize) = n * unitSize
  const breakEvenHits = totalRisked / (avgWin + unitSize);

  return {
    picksCount:    picks.length,
    totalRisked,
    hitsAt625,
    net625:        Math.round(net625 * 100) / 100,
    breakEvenHits: Math.round(breakEvenHits * 10) / 10,
    breakEvenPct:  Math.round((breakEvenHits / picks.length) * 100),
  };
}
```

---

### 6. Picks-needed formula

```js
function picksNeeded(dailyGoal, unitSize, avgOdds = -110) {
  const b = avgOdds > 0 ? avgOdds / 100 : 100 / Math.abs(avgOdds);
  const evPerUnit = 0.625 * b - 0.375; // expected value per $1 at 62.5% hit rate
  if (evPerUnit <= 0) return 10; // fallback
  return Math.ceil(dailyGoal / (unitSize * evPerUnit));
}
```

---

### 7. "Build My Slate" handler

```js
async function handleBuildScoutSlate() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });

  // Check cache
  try {
    const cached = JSON.parse(localStorage.getItem("scout_slate_v1") ?? "{}");
    if (cached.date === today && cached.goal === scoutGoal && cached.unit === scoutUnit && cached.picks?.length) {
      setScoutSlate(cached);
      return;
    }
  } catch {}

  setScoutSlateLoading(true);
  setScoutSlateError(null);

  try {
    // Build candidate pool
    const allCandidates = buildScoutCandidates({
      liveSlate, liveLineups, liveWeather, livePlayerProps,
      livePitcherStats, liveGameLog, liveUmpires, liveTeamStats,
      liveHittingLog, liveStatSplits, pitcherArsenal,
      liveNrfiData, liveOddsMap
    });

    const needed = picksNeeded(scoutGoal, scoutUnit);
    const topPicks = allCandidates.slice(0, Math.min(needed, 20)); // cap at 20

    if (topPicks.length === 0) {
      setScoutSlate({ date: today, goal: scoutGoal, unit: scoutUnit, picks: [], math: null });
      setScoutSlateLoading(false);
      return;
    }

    // Get AI reasoning
    let reasoningMap = {};
    try {
      const res = await apiFetch("/api/scout/build-slate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picks: topPicks }),
      });
      for (const r of res ?? []) {
        reasoningMap[r.id] = r;
      }
    } catch {}

    const enrichedPicks = topPicks.map(p => ({
      ...p,
      shortReason:          reasoningMap[p.id]?.shortReason ?? null,
      confidenceStatement:  reasoningMap[p.id]?.confidenceStatement ?? null,
      keyRisk:              reasoningMap[p.id]?.keyRisk ?? null,
    }));

    const math = scoutMath(enrichedPicks, scoutUnit, scoutGoal);
    const slate = { date: today, goal: scoutGoal, unit: scoutUnit, picks: enrichedPicks, math };

    localStorage.setItem("scout_slate_v1", JSON.stringify(slate));
    setScoutSlate(slate);
  } catch (err) {
    setScoutSlateError("Failed to build slate. Check that today's data has loaded.");
  } finally {
    setScoutSlateLoading(false);
  }
}
```

---

### 8. Scout tab navigation

Add "🎯 Scout" to the nav bar — visible only when `isScoutUser`. Placed after the AI Board tab button. `onClick={() => setView("scout")}`. Same pill style as other Scout tabs.

---

### 9. Scout view render (`view === "scout" && isScoutUser`)

```
┌─────────────────────────────────────────────────────────┐
│  🎯 SCOUT                          [Algorithmic + AI]   │
│  Pick your goal and unit size to build today's slate.   │
└─────────────────────────────────────────────────────────┘

Daily Goal:   [ $25 ]  [ $50 ]  [ $100 ]  [ Custom ___ ]
Risk per bet: [ $5  ]  [ $10 ]  [ $25  ]  [ $50 ]  [ Custom ___ ]

──────────────────────────────────────────────────────────
  At $25/bet targeting $50:  need ~8 picks
  If 5/8 hit (62.5%) → +$X.XX
  If 4/8 hit (50%)   → -$X.XX
  Break-even: 4.X hits (56%)
──────────────────────────────────────────────────────────

  [🎯 Build My Slate]

─── after generation ───────────────────────────────────

  📋 Today's Slate — May 18, 2026  |  8 picks  |  $200 at risk
  Goal: $50 profit  ·  Hit 5/8 (62.5%) to win

  [Pick #1]  [Pick #2]  ...

  ──────────────────────────────────────────────────────
  Running: 3 resolved  ·  2 ✓ HIT  ·  1 ✗ MISS
  P&L so far: +$18.18  |  5 pending
  ──────────────────────────────────────────────────────

  [🔄 Regenerate Slate]
```

#### Math preview block (always visible above the button)

Live-updates as the user changes goal/unit. Uses `picksNeeded()` to show the expected pick count and break-even scenario. Show in a styled box with muted background — same dark card style used throughout.

#### Loading state

While building: spinner + "Scout is building your slate…"

#### No-picks state

If `picks.length === 0` after build:
```
Not enough qualifying plays today.
Only X candidates met the confidence and EV thresholds.
Try lowering your goal or checking back after lineups post.
```

---

### 10. Scout pick card component: `ScoutPickCard`

New file: `src/components/ScoutPickCard.jsx`

Props:
```js
{
  c,          // the pick object
  rank,       // 1-indexed
  unitSize,   // dollar amount
  gradeResult // true | false | null (from board results)
}
```

**Card layout:**
```
┌──────────────────────────────────────────────────────────┐
│ #1  [K Prop]  Gerrit Cole · NYY          ✓ HIT / ✗ MISS │
│     BOS @ NYY · OVER 6.5 K · DK -112                   │
│                                                          │
│  🧠 Cole has posted 7+ Ks in 4 of his last 5 starts.    │
│  Marlins rank 28th in K% vs RHP. Umpire Bucknor adds    │
│  +1.2 Ks per game on average.                           │
│                                                          │
│  📊 Model: 74% confident · Book implied: 52.7%          │
│  Kelly: 18% of bankroll → capped at $25 unit            │
│                                                          │
│  ⚠ Key risk: Short rest (4 days).                       │
│                                                          │
│  Bet: $25 to win $22.32                                  │
└──────────────────────────────────────────────────────────┘
```

**Payout line:** `odds > 0 ? "$X to win $Y" : "$X to win $Y"` using actual `bookOdds`.

**Kelly display:** Show the raw Kelly fraction as a %, note if it was capped at unit size.
- Example: "Kelly suggests 18% of bankroll — using your $25 unit"
- If Kelly > unitSize/bankroll (where bankroll is assumed to be 20× unitSize): "Kelly suggests $X, using your $25 cap"

**Result badge:** Same `✓ HIT` / `✗ MISS` style as existing board cards. `gradeResult` is passed from parent.

**Market badge label map:**
```js
const MARKET_LABELS = {
  k:        "K Prop",
  outs:     "Outs Prop",
  total:    "O/U Total",
  spread:   "Runline",
  ml:       "Moneyline",
  f5ml:     "F5 ML",
  f5spread: "F5 Spread",
};
```

Write `src/components/ScoutPickCard.test.jsx` with tests for:
- Renders player name and market badge
- Renders game label for game markets (no playerName)
- Shows payout line (bet $X to win $Y)
- Shows ✓ HIT when gradeResult=true
- Shows ✗ MISS when gradeResult=false
- Shows no badge when gradeResult=null
- Shows shortReason text when provided
- Shows keyRisk text when provided
- Does not show reasoning section when shortReason is null

---

### 11. Running P&L tracker

At the bottom of the slate, show resolved picks from `liveBoardResults` (already populated by live boxscore polling). For each pick in `scoutSlate.picks`, look up the player by `id` in `liveBoardResults` to get HIT/MISS. Sum:

```js
const resolvedPicks = scoutSlate.picks.filter(p => getPickResult(p) !== null);
const hits = resolvedPicks.filter(p => getPickResult(p) === true);
const misses = resolvedPicks.filter(p => getPickResult(p) === false);
const pnl = hits.reduce((s, p) => s + calcWin(p, scoutUnit), 0)
          - misses.reduce((s, p) => s + scoutUnit, 0);
```

Show: `Running: X resolved · Y ✓ HIT · Z ✗ MISS · P&L: +$X.XX | N pending`

For game-market picks, `gradeResult` will be `null` until a game-grading path is added — show as "pending" with no badge.

---

## Files to Create / Modify

**New files:**
- `backend/routes/scout.js` — `POST /api/scout/build-slate` endpoint
- `src/components/ScoutPickCard.jsx` — pick card component
- `src/components/ScoutPickCard.test.jsx` — 9 tests

**Modified files:**
- `src/utils.js` — add `kellyFraction` export
- `src/utils.test.js` — add 3 Kelly tests
- `backend/server.js` — mount `require("./routes/scout")`
- `prop-scout-v7.jsx`:
  - Add `scoutGoal`, `scoutUnit`, `scoutSlate`, `scoutSlateLoading`, `scoutSlateError` state
  - Add `buildScoutCandidates`, `scoutMath`, `picksNeeded` helper functions
  - Add `handleBuildScoutSlate` async function
  - Add "🎯 Scout" nav tab (Scout-only)
  - Add `{view === "scout" && isScoutUser && ...}` render block

---

## What NOT to Change

- Live board behavior untouched
- AI Board untouched — Scout is a separate view, separate endpoint, separate cache key
- No new DB tables or migrations — slate is cached in localStorage only
- Game-market picks show `gradeResult=null` (pending) — no game grading logic in this task
- `lockedBoardCandidates` and board snapshot persistence untouched

---

## Routing note

Mount scout route in server.js **before** the catch-all static handler:
```js
app.use("/api/scout", require("./routes/scout"));
```

---

## Checklist

- [ ] `kellyFraction` added to `src/utils.js` with 3 tests passing
- [ ] `POST /api/scout/build-slate` backend endpoint created and mounted
- [ ] Haiku prompt returns `shortReason`, `confidenceStatement`, `keyRisk` per pick
- [ ] `buildScoutCandidates` covers all 7 markets (k, outs, total, spread, ml, f5ml, f5spread)
- [ ] Stage 2 EV filter: only picks where `modelProb > impliedProb` pass
- [ ] Stage 3 sort by Kelly fraction descending
- [ ] `scoutGoal` / `scoutUnit` state added
- [ ] Math preview (picks needed + break-even) updates live as goal/unit change
- [ ] "Build My Slate" button triggers funnel + Haiku + cache write
- [ ] Cache read: same date + goal + unit returns cached slate without refetch
- [ ] "🔄 Regenerate Slate" bypasses cache (clears key, rebuilds)
- [ ] Loading spinner while building
- [ ] No-picks empty state shown when 0 candidates qualify
- [ ] `ScoutPickCard` renders rank, market badge, payout line, AI reasoning, Kelly note, result badge
- [ ] `ScoutPickCard.test.jsx` — all 9 tests pass
- [ ] Running P&L tracker at bottom of slate
- [ ] Scout tab only visible to `isScoutUser`
- [ ] `npm run build` passes
- [ ] `npm run test` — all tests pass (191 existing + new)

---

## After Completing

Reply "Task 136 complete" and describe what a 7-pick slate looks like in the UI — specifically the math summary block and one example pick card.
