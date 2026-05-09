# CODEX TASK 99 — Lock Odds to Pre-Game Snapshot

## File to modify

`prop-scout-v7.jsx` only.

## Read before starting

Read **CODEX TASK 99** in `AGENT_SYSTEM_PROMPT.md` for full context.

## Problem being solved

`liveOddsMap` refreshes every 20 minutes. Once a game starts, sportsbooks push live/in-game lines that replace pre-game ML, totals, and spreads. Since the app doesn't support live betting, these changes are noise — the user wants to see the odds at first pitch, frozen, for all in-progress and final games.

---

## Changes — in order

### 1 — Add `lockedOddsMap` state (~line 3568, near `liveOddsMap` state)

```js
const [lockedOddsMap, setLockedOddsMap] = useState(() => {
  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    const stored = JSON.parse(localStorage.getItem("locked_odds_snapshot") || "{}");
    return stored.date === today ? (stored.data ?? {}) : {};
  } catch { return {}; }
});
// Shape: { [gamePk]: oddsObject } — keyed by gamePk
```

---

### 2 — Add lock useEffect (after the odds auto-refresh interval, ~line 4388)

```js
// Lock odds at first pitch — prevents live in-game lines from overwriting pre-game odds.
useEffect(() => {
  if (!liveSlate?.length || !Object.keys(liveOddsMap).length) return;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
  let updated = false;
  const next = { ...lockedOddsMap };

  liveSlate.forEach(game => {
    if (next[game.gamePk]) return; // already locked — idempotent
    const s = game.status ?? "";
    const isLiveOrFinal =
      s === "In Progress" || s === "Warmup" ||
      s === "Final" || s === "Game Over" || s === "Completed Early";
    if (!isLiveOrFinal) return;
    const key = `${game.away.name}|${game.home.name}`;
    const oddsEntry = liveOddsMap[key];
    if (!oddsEntry) return; // no odds loaded yet — will catch on next liveOddsMap update
    next[game.gamePk] = oddsEntry;
    updated = true;
  });

  if (!updated) return;
  localStorage.setItem("locked_odds_snapshot", JSON.stringify({ date: today, data: next }));
  setLockedOddsMap(next);
}, [liveSlate, liveOddsMap]); // eslint-disable-line react-hooks/exhaustive-deps
```

---

### 3 — Add `effectiveOddsMap` derived value (after state declarations, before render blocks)

Use `useMemo`. This is the merged map: locked entries override live entries for non-upcoming games.

```js
const effectiveOddsMap = useMemo(() => {
  if (!liveSlate?.length) return liveOddsMap;
  const map = { ...liveOddsMap };
  liveSlate.forEach(game => {
    if (!lockedOddsMap[game.gamePk]) return;
    const key = `${game.away.name}|${game.home.name}`;
    map[key] = lockedOddsMap[game.gamePk];
  });
  return map;
}, [liveOddsMap, lockedOddsMap, liveSlate]);
```

---

### 4 — Replace `liveOddsMap` with `effectiveOddsMap` in 8 call sites

**4a. SlateCard prop (~line 6362):**
```jsx
<SlateCard ... liveOddsMap={effectiveOddsMap} ... />
```

**4b. `getGameOdds` function body (~line 4798)** — one line inside the function:
```js
const live = effectiveOddsMap[key];  // was: liveOddsMap[key]
```

**4c. Board `computeGameBoard` in the board useEffect deps / call (~line 5099):**
```js
computeGameBoard(gameSubTab, activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires)
```

**4d. Board `computeGameBoard` in the board render IIFE (~line 10527):**
```js
computeGameBoard(gameSubTab, activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires)
```

**4e–4j. The 6 `gameHitSummary` calls (~lines 10677–10682)** — replace `liveOddsMap` with `effectiveOddsMap` in each:
```js
nrfi:    gameHitSummary("nrfi",    computeGameBoard("nrfi",    activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires)),
total:   gameHitSummary("total",   computeGameBoard("total",   activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires)),
spread:  gameHitSummary("spread",  computeGameBoard("spread",  activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires)),
ml:      gameHitSummary("ml",      computeGameBoard("ml",      activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires)),
f5ml:    gameHitSummary("f5ml",    computeGameBoard("f5ml",    activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires)),
f5spread:gameHitSummary("f5spread",computeGameBoard("f5spread",activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires)),
```

**4k. `buildAiBoardPayload` call site (~line 4059):**
```js
const payload = buildAiBoardPayload(
  liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats,
  liveLineups, liveWeather, liveHittingLog, liveStatSplits,
  liveNrfiData, effectiveOddsMap   // ← was liveOddsMap
);
```

**4l. Board useEffect dep array (~line 5112)** — replace `liveOddsMap` with `effectiveOddsMap` in the deps:
```js
}, [view, boardTab, gameSubTab, activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires, liveLineups, livePlayerProps, liveHittingLog, liveStatSplits, liveGameLog, liveTeamStats, hydrateCardSummaries]);
```

---

## What does NOT change

- The odds auto-refresh interval (line ~4381) — still updates `liveOddsMap` every 20 min.
- `setLiveOddsMap({})` in the soft-refresh function — correct, `liveOddsMap` resets; `lockedOddsMap` does not.
- `lockedOddsMap` is never reset on soft-refresh — locked game odds persist through page refreshes.
- `fetchOdds`, `oddsCache`, `oddsApiInfo` — no changes.
- Any place `liveOddsMap` is read for API info display (remaining calls, fetchedAt) — leave those alone.

---

## Validation checklist

1. No JS errors on load.
2. Pre-game: slate cards show odds normally — no change.
3. Once a game goes "In Progress", the ML/total/spread on the slate card does NOT change on the next 20-min refresh cycle.
4. Game overview for an in-progress game shows pre-game lines, not live sportsbook lines.
5. Upcoming games still refresh odds correctly every 20 minutes.
6. Page reload mid-game — locked odds restore from localStorage, still showing pre-game lines.
7. No regression on Games board tabs (NRFI, Total, Spread, ML, F5 ML).
