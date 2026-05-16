# CODEX TASK 123 — NRFI: Weight First-Inning History + Top-Order OBP

## Goal

Strengthen the NRFI scoring model in `computeGameBoard` with two targeted improvements:

1. **Increase the weight of historical first-inning scoring data** — the `apiNrfi` data already contains each team's actual first-inning scoring percentage from recent games. This is the single most direct signal for NRFI/YRFI and should be the highest-weighted factor, not a secondary one.

2. **Add top-3 lineup OBP as a NRFI factor** — the top 3 batters in each lineup are the ones who bat in the first inning. Their collective on-base percentage is a direct measure of first-inning scoring probability. Teams with high-OBP leadoff/2/3 hitters score in the first inning far more often. This data is available via `liveLineups` which the game board doesn't currently use.

**Files changed:** `prop-scout-v7.jsx` only. No backend changes. No schema changes.

---

## Part 1 — Re-weight Historical First-Inning Scoring

In the `computeGameBoard` NRFI section, find the "API NRFI data" block (search for `Historical Scoring`):

```js
// API NRFI data (actual historical scoring rates)
if (apiNrfi?.awayFirst?.scoredPct || apiNrfi?.homeFirst?.scoredPct) {
  const awayPct = parseFloat(apiNrfi.awayFirst?.scoredPct) || 30;
  const homePct = parseFloat(apiNrfi.homeFirst?.scoredPct) || 30;
  const avgPct  = (awayPct + homePct) / 2;
  const histPts = avgPct < 22 ? 10 : avgPct < 28 ? 5 : avgPct < 35 ? 0 : avgPct < 42 ? -5 : -10;
  score += histPts;
  factors.push({ label: "Historical Scoring", ... });
}
```

Replace `histPts` scaling to give this factor more weight — it deserves to be the **strongest single factor** (±15 pts) since it's direct observed outcome data, not a proxy:

```js
if (apiNrfi?.awayFirst?.scoredPct || apiNrfi?.homeFirst?.scoredPct) {
  const awayPct = parseFloat(apiNrfi.awayFirst?.scoredPct) || 30;
  const homePct = parseFloat(apiNrfi.homeFirst?.scoredPct) || 30;
  const avgPct  = (awayPct + homePct) / 2;
  // Each team's individual tendency
  const awayPts = awayPct < 20 ? 6 : awayPct < 26 ? 3 : awayPct < 32 ? 0 : awayPct < 40 ? -4 : -7;
  const homePts = homePct < 20 ? 6 : homePct < 26 ? 3 : homePct < 32 ? 0 : homePct < 40 ? -4 : -7;
  const histPts = awayPts + homePts; // ±14 pts max from both teams combined
  score += histPts;
  factors.push({ label: "1st Inning Scoring History", pts: histPts, max: 14,
    value: `${game.away.abbr} scores ${awayPct.toFixed(0)}% / ${game.home.abbr} scores ${homePct.toFixed(0)}% in 1st`,
    detail: avgPct < 24 ? "Both teams rarely score in 1st — strong NRFI lean"
          : avgPct > 38 ? "Both teams frequently score early — YRFI lean"
          : awayPct > 38 || homePct > 38 ? "One team scores often in 1st — YRFI risk"
          : "Average first-inning scoring rates" });
}
```

---

## Part 2 — Add Top-Order OBP Factor

`computeGameBoard` receives `activeSlate` which has `game.gamePk`. The component also maintains `liveLineups` state — but `computeGameBoard` is a module-level pure function and **does not receive `liveLineups`**. The fix is to pass it in.

### 2a — Update `computeGameBoard` signature

Change:
```js
const computeGameBoard = (type, activeSlate, liveNrfiData, liveWeather, liveOddsMap, livePitcherStats, liveUmpires) => {
```

To:
```js
const computeGameBoard = (type, activeSlate, liveNrfiData, liveWeather, liveOddsMap, livePitcherStats, liveUmpires, liveLineups = {}) => {
```

The `liveLineups = {}` default means all existing callers that don't pass it still work unchanged — **do NOT update any existing call sites**. (The render and lock effect callers will use the default empty object; the OBP factor simply won't fire when lineups aren't passed. This keeps the change backwards-compatible and avoids touching the 4+ call sites.)

### 2b — Add the OBP factor inside the NRFI section

Inside the NRFI block (before the final `score = Math.round(...)` clamp), add:

```js
// Top-order OBP — batters 1-3 are guaranteed to bat in the 1st inning
// High top-3 OBP = more baserunners = higher YRFI probability
const lu = liveLineups[game.gamePk];
if (lu && (lu.away?.length >= 3 || lu.home?.length >= 3)) {
  const top3Away = (lu.away ?? []).slice(0, 3);
  const top3Home = (lu.home ?? []).slice(0, 3);
  const awayObpVals = top3Away.map(b => parseFloat(b.obp) || 0).filter(v => v > 0);
  const homeObpVals = top3Home.map(b => parseFloat(b.obp) || 0).filter(v => v > 0);
  if (awayObpVals.length > 0 || homeObpVals.length > 0) {
    const allObp = [...awayObpVals, ...homeObpVals];
    const avgTopOBP = allObp.reduce((a, v) => a + v, 0) / allObp.length;
    // League avg OBP ≈ .320; top-order OBP ≈ .330+
    const obpPts = avgTopOBP >= 0.390 ? -10 : avgTopOBP >= 0.360 ? -6 : avgTopOBP >= 0.345 ? -3
                 : avgTopOBP <= 0.290 ? 6   : avgTopOBP <= 0.310 ? 3  : 0;
    score += obpPts;
    factors.push({ label: "Top-Order OBP", pts: obpPts, max: 10,
      value: `Avg top-3 OBP: .${Math.round(avgTopOBP * 1000)}`,
      detail: avgTopOBP >= 0.360 ? "High-OBP leadoff hitters — YRFI risk in 1st"
            : avgTopOBP <= 0.300 ? "Low-OBP top order — fewer 1st-inning threats"
            : "Average top-order on-base ability" });
  }
}
```

**Important:** `b.obp` needs to be available on batter objects in `liveLineups`. Check whether the lineup fetch (`/api/lineups`) includes `obp` on each batter. If it does not, the factor simply won't fire (the `filter(v => v > 0)` will return empty and the block is skipped). **Do not add a backend call** — use only what's already on the batter objects.

### 2c — Update the render-time call sites to pass `liveLineups`

Update **only** these two call sites (the render IIFE and the helper, not the lock effect or summary hydration):

1. In `gameBoardCandidates` (the render IIFE that builds the candidate list):
```js
const live = computeGameBoard(
  gameSubTab, activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, blendedPitcherStatsForGameBoard, liveUmpires, liveLineups
);
```

2. In `getGameBoardCandidatesForSubTab`:
```js
const live = computeGameBoard(
  sub, activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, blendedPitcherStatsForGameBoard, liveUmpires, liveLineups
);
```

The lock useEffect and summary hydration useEffect callers keep their existing signature (no 8th arg) — they'll use the `liveLineups = {}` default. The lock fires at game-start when lineups are confirmed, so omitting lineups there is acceptable.

---

## Checklist

- [ ] Historical first-inning scoring factor re-weighted to ±14 pts (was ±10)
- [ ] Each team's first-inning tendency scored independently (not just the average)
- [ ] `computeGameBoard` accepts optional `liveLineups = {}` 8th parameter
- [ ] Top-order OBP factor added inside NRFI block (±10 pts)
- [ ] Top-order OBP factor gracefully skips if lineups empty or OBP field absent
- [ ] Render `gameBoardCandidates` call and `getGameBoardCandidatesForSubTab` pass `liveLineups`
- [ ] Lock useEffect and summary hydration callers unchanged (use default `{}`)
- [ ] No backend changes
- [ ] No schema changes

---

## After Completing

Reply "Task 123 complete" with a brief summary.
