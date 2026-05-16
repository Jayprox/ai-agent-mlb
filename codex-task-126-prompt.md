# CODEX TASK 126 — Wire Savant Stats into K Board Scoring Model

## Goal

The K board scoring model (`kBoardScore`) was upgraded in Task 122 to use SwStr% as the primary signal and Chase Rate as a secondary signal. But the data **never actually reaches the model** due to two bugs discovered by audit.

This task fixes both bugs and wires Savant stats end-to-end into the K board.

**Files changed:**
- `prop-scout-v7.jsx` — main fix (function signatures, merge logic, call sites)
- `backend/routes/pitcherSplits.js` — missing `player_id` URL param
- `backend/routes/batterPower.js` — missing `player_id` URL param

No schema changes. No new backend routes. No new state.

---

## Root Cause Analysis

### Bug 1 — `computePitcherBoard` has no access to `pitcherArsenal`

`computePitcherBoard` is a module-level pure function with this signature:
```js
const computePitcherBoard = (type, liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats) => {
```

Inside, it builds a `merged` object:
```js
const pStats = livePitcherStats[p.id];  // ← MLB Stats API (ERA, K/9, WHIP...)
const merged = { ...(p ?? {}), ...(pStats ?? {}) };
kBoardScore(merged, ...)
```

`livePitcherStats` comes from `/api/players/:id/stats?group=pitching` — the MLB Stats API. It contains ERA, K/9, WHIP, etc. It does **NOT** contain `swStrPct`, `oSwingPct`, or `fStrikePct`.

Those Savant fields live in `pitcherArsenal` state (populated by `/api/arsenal/:pitcherId`), structured as:
```js
pitcherArsenal[pitcherId] = {
  arsenal: [...],
  pitcherStats: { swStrPct, oSwingPct, fStrikePct, ... }
}
```

Since `pitcherArsenal` is never passed to `computePitcherBoard`, `merged.swStrPct` is always `undefined`. **`kBoardScore` always falls back to K/9.**

### Bug 2 — Field name mismatch: `oSwingPct` vs `chasePct`/`oSwing`

`arsenal.js` returns `oSwingPct` (line 271 of that file).

`kBoardScore` reads:
```js
const chasePct = parseFloat(pStats.chasePct ?? pStats.oSwing) || null;
```

Neither `chasePct` nor `oSwing` exists on the arsenal object. Even if Bug 1 were fixed, **Chase Rate would still always be null** because the field name doesn't match.

The pitcher card display at line 10396 has the same mismatch:
```jsx
{(pitcherMetrics.chasePct ?? pitcherMetrics.oSwing) ? ...}
```

### Bug 3 — Backend: `pitcherSplits.js` and `batterPower.js` missing `player_id`

Both routes hit the Savant CSV endpoint without the `player_id` parameter that Savant now requires to filter results to a specific player. The requests may return empty CSVs or wrong player data.

---

## Part 1 — Update `computePitcherBoard` Signature and Merge Logic

### 1a — Add `pitcherArsenal = {}` as optional 8th parameter

Find `computePitcherBoard` (search for `const computePitcherBoard =`):

```js
// Before:
const computePitcherBoard = (type, liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats) => {

// After:
const computePitcherBoard = (type, liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal = {}) => {
```

### 1b — Merge Savant stats with field normalization

Inside the function, find where `merged` is built (right before `kBoardScore` is called):

```js
// Before:
const pStats  = livePitcherStats[p.id];
const gamelog = liveGameLog[p.id];
if (!pStats && !gamelog) return;
const pf      = PARK_FACTORS[game.home?.abbr] ?? NEUTRAL_PARK;
const umpire  = liveUmpires[game.gamePk];
const merged  = { ...(p ?? {}), ...(pStats ?? {}) };
```

```js
// After:
const pStats  = livePitcherStats[p.id];
const gamelog = liveGameLog[p.id];
if (!pStats && !gamelog) return;
const pf      = PARK_FACTORS[game.home?.abbr] ?? NEUTRAL_PARK;
const umpire  = liveUmpires[game.gamePk];
const arsenalStats = pitcherArsenal[p.id]?.pitcherStats ?? null;
const merged  = {
  ...(p ?? {}),
  ...(pStats ?? {}),
  // Overlay Savant fields — normalize oSwingPct → chasePct for kBoardScore
  ...(arsenalStats ? {
    swStrPct:   arsenalStats.swStrPct   ?? null,
    chasePct:   arsenalStats.oSwingPct  ?? null,
    fStrikePct: arsenalStats.fStrikePct ?? null,
  } : {}),
};
```

### 1c — Add `swStrPct` and `chasePct` to the candidate push object

Inside the same function, find where `candidates.push({...})` is called. Add two fields after `signals`:

```js
candidates.push({
  // ... all existing fields unchanged ...
  signals,
  swStrPct:  merged.swStrPct  ?? null,   // ← ADD
  chasePct:  merged.chasePct  ?? null,   // ← ADD
});
```

---

## Part 2 — Update Call Sites to Pass `pitcherArsenal`

### 2a — Board render IIFE (highest priority)

Find the `boardCandidatesByType` object in the board render IIFE (around line 9692):

```js
// Before:
const boardCandidatesByType = {
  hr:   computeBatterBoard("hr", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits),
  hits: computeBatterBoard("hits", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits),
  k:    computePitcherBoard("k", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats),
  outs: computePitcherBoard("outs", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats),
};

// After:
const boardCandidatesByType = {
  hr:   computeBatterBoard("hr", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits),
  hits: computeBatterBoard("hits", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits),
  k:    computePitcherBoard("k", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal),
  outs: computePitcherBoard("outs", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal),
};
```

### 2b — Board summary request builder

Find the board summary IIFE (around line 5392-5396) where `computePitcherBoard` is called:

```js
// Before:
? computePitcherBoard("k", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats)
: computePitcherBoard("outs", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats)

// After:
? computePitcherBoard("k", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal)
: computePitcherBoard("outs", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal)
```

### 2c — `buildAiBoardPayload` function

Update `buildAiBoardPayload` signature to accept `pitcherArsenal`:

```js
// Before:
function buildAiBoardPayload(
  liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats,
  liveLineups, liveWeather, liveHittingLog, liveStatSplits,
  liveNrfiData, liveOddsMap
) {
  const kCandidates = computePitcherBoard("k", liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats).slice(0, 8);
  const outsCandidates = computePitcherBoard("outs", liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats).slice(0, 8);

// After:
function buildAiBoardPayload(
  liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats,
  liveLineups, liveWeather, liveHittingLog, liveStatSplits,
  liveNrfiData, liveOddsMap, pitcherArsenal = {}
) {
  const kCandidates = computePitcherBoard("k", liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal).slice(0, 8);
  const outsCandidates = computePitcherBoard("outs", liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal).slice(0, 8);
```

Then update the `buildAiBoardPayload` call site (around line 4306):

```js
// Before:
const payload = buildAiBoardPayload(
  liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats,
  liveLineups, liveWeather, liveHittingLog, liveStatSplits,
  liveNrfiData, effectiveOddsMap
);

// After:
const payload = buildAiBoardPayload(
  liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats,
  liveLineups, liveWeather, liveHittingLog, liveStatSplits,
  liveNrfiData, effectiveOddsMap, pitcherArsenal
);
```

### 2d — Lock useEffect — DO NOT update

The two `computePitcherBoard` calls inside the prop board lock useEffect (around lines 5445 and 5448) should **not** be updated. The lock fires at game-start when lineups are confirmed; omitting arsenal at lock-time is acceptable and keeping the default `{}` avoids adding `pitcherArsenal` to that effect's dependency array.

---

## Part 3 — Fix Pitcher Card Display (`pitcherMetrics`)

In the pitcher board card render section, find:

```js
const pitcherMetrics = livePitcherStats[c.id] ?? c ?? {};
```

Replace with:

```js
// Merge MLB stats + Savant arsenal + candidate object (which now carries swStrPct/chasePct)
const pitcherMetrics = {
  ...(livePitcherStats[c.id] ?? {}),
  ...c,
  ...(pitcherArsenal[c.id]?.pitcherStats ? {
    swStrPct: pitcherArsenal[c.id].pitcherStats.swStrPct,
    chasePct: pitcherArsenal[c.id].pitcherStats.oSwingPct,  // normalize field name
  } : {}),
};
```

This ensures the SwStr% / Chase Rate display line (added in Task 122) shows real data when available.

---

## Part 4 — Backend: Fix Missing `player_id` Params

### 4a — `backend/routes/pitcherSplits.js`

Find the URL construction (the `const url = [...]` block). Add `&player_id=${pitcherId}` after the `pitchers_lookup` line:

```js
// Before (relevant portion):
`&pitchers_lookup%5B%5D=${pitcherId}`,
`&stand=${hand}`,

// After:
`&pitchers_lookup%5B%5D=${pitcherId}`,
`&player_id=${pitcherId}`,
`&stand=${hand}`,
```

### 4b — `backend/routes/batterPower.js`

Find the URL construction. Add `&player_id=${batterId}` after the `batters_lookup` line:

```js
// Before (relevant portion):
`&batters_lookup%5B%5D=${batterId}`,
`&min_pitches=0`,

// After:
`&batters_lookup%5B%5D=${batterId}`,
`&player_id=${batterId}`,
`&min_pitches=0`,
```

---

## Checklist

- [ ] `computePitcherBoard` accepts optional `pitcherArsenal = {}` as 8th parameter
- [ ] Inside `computePitcherBoard`, `arsenalStats` is extracted from `pitcherArsenal[p.id]?.pitcherStats`
- [ ] `oSwingPct` is normalized to `chasePct` in the `merged` object
- [ ] `swStrPct` and `chasePct` added to the candidate push object
- [ ] Board render IIFE `boardCandidatesByType` passes `pitcherArsenal` to both K and Outs calls
- [ ] Board summary IIFE passes `pitcherArsenal` to both K and Outs calls
- [ ] `buildAiBoardPayload` accepts `pitcherArsenal = {}` and passes to `computePitcherBoard`
- [ ] `buildAiBoardPayload` call site passes `pitcherArsenal`
- [ ] Lock useEffect call sites unchanged (no 8th arg)
- [ ] `pitcherMetrics` in pitcher card includes Savant data with `oSwingPct → chasePct` normalization
- [ ] `pitcherSplits.js` URL includes `&player_id=${pitcherId}`
- [ ] `batterPower.js` URL includes `&player_id=${batterId}`
- [ ] `kBoardScore` itself unchanged (already reads `pStats.swStrPct` and `pStats.chasePct`)
- [ ] No new state, no new backend routes, no schema changes

---

## After Completing

Reply "Task 126 complete" with a brief summary of what changed.
