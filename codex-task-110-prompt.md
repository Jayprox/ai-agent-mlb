# CODEX TASK 110 — Fix Board Boxscore Over-Polling (98 calls/min → ~7/min)

## Problem

The Board/Model boxscore `useEffect` (around line 4465) fires far more than intended because `liveScores` is in its dependency array.

Here's what happens every 60 seconds:
1. `pollScores()` fires and calls `setLiveScores(prev => ({ ...prev, [gamePk]: data }))` **once per game** (14 calls for a 14-game slate)
2. Each `setLiveScores` call updates the `liveScores` state object
3. The board boxscore `useEffect` has `liveScores` in `[view, liveSlate, liveScores]` — so it re-fires **on every single `setLiveScores` update**
4. If 7 games are live or final → 7 boxscore fetches per re-fire × 14 re-fires = **98 `/api/boxscore` calls per 60-second cycle**

The `liveScores` dep is only used for the `linescoreFinished` fallback check:
```js
const ls = liveScores[g.gamePk];
const linescoreFinished = ls && ls.inning === null && ((ls.awayScore ?? 0) > 0 || (ls.homeScore ?? 0) > 0);
```

We need `liveScores` to be readable inside the effect **without** making it a reactive dependency.

**File:** `prop-scout-v7.jsx` only. No backend changes.

---

## Fix — Use a ref to read liveScores without triggering re-fires

### Step 1 — Add `liveScoresRef` near the `liveScores` state declaration

Search for:
```js
const [liveScores,   setLiveScores]   = useState({});     // gamePk    → { inning, halfInning, awayScore, homeScore, outs }
```

Add a ref directly below it:
```js
const [liveScores,   setLiveScores]   = useState({});     // gamePk    → { inning, halfInning, awayScore, homeScore, outs }
const liveScoresRef = useRef({});                          // always-current mirror, avoids dep-array re-fires
```

### Step 2 — Keep `liveScoresRef` in sync

Search for the `pollScores` linescore poll `useEffect`. Inside it, wherever `setLiveScores` is called:
```js
.then(data => setLiveScores(prev => ({ ...prev, [sg.gamePk]: data })))
```

Replace with:
```js
.then(data => {
  liveScoresRef.current = { ...liveScoresRef.current, [sg.gamePk]: data };
  setLiveScores(prev => ({ ...prev, [sg.gamePk]: data }));
})
```

### Step 3 — Update the board boxscore effect to read from the ref

Search for:
```js
      const ls = liveScores[g.gamePk];
      const linescoreFinished = ls && ls.inning === null && ((ls.awayScore ?? 0) > 0 || (ls.homeScore ?? 0) > 0);
```

Replace with:
```js
      const ls = liveScoresRef.current[g.gamePk];
      const linescoreFinished = ls && ls.inning === null && ((ls.awayScore ?? 0) > 0 || (ls.homeScore ?? 0) > 0);
```

### Step 4 — Remove `liveScores` from the dep array

Search for:
```js
  }, [view, liveSlate, liveScores]); // eslint-disable-line react-hooks/exhaustive-deps
```

Replace with:
```js
  }, [view, liveSlate]); // eslint-disable-line react-hooks/exhaustive-deps
```

---

## What this achieves

The board boxscore `useEffect` now fires only when:
- `view` changes (user switches tabs)
- `liveSlate` updates (once per 60s poll cycle — the outer slate polling interval)

It no longer fires for every individual `setLiveScores` call. 14 per-game score updates per cycle → still only 1 boxscore sweep per cycle → ~7 boxscore calls/min (one per live/final game) instead of 98.

---

## What does NOT change

- `liveScores` state itself — still used in all other places (`liveScores[g.gamePk]` in game card rendering, linescore display, etc.)
- The `pollScores` linescore useEffect — unchanged except the `then` handler above
- Board boxscore logic — identical behavior, just fires once per slate update instead of 14×

---

## Validation checklist

1. `npm run build` passes
2. Board HR/Hits tab still shows live scores and final results correctly
3. Model tab still shows live results on pick cards
4. Check browser DevTools Network tab: `/api/boxscore/` calls appear once per 60s for live games, not in bursts of 14×
5. No console errors related to `liveScoresRef`

## After completing

Reply "Task 110 complete" with a brief summary of what was changed.
