# CODEX TASK 115 — Fix AI Board K/Outs Showing Zero Candidates

## Problem

`computePitcherBoard` (line 2205-2206) reads pitchers from liveSlate items using:

```js
{ p: game.pitcher,     facingTeam: game.away?.abbr, isHome: true  },
{ p: game.awayPitcher, facingTeam: game.home?.abbr, isHome: false },
```

But `liveSlate` is populated directly from the `/api/schedule` API response, which returns games with this shape:

```json
{
  "gamePk": 12345,
  "probablePitchers": {
    "home": { "id": 111, "name": "...", "hand": "R", ... },
    "away": { "id": 222, "name": "...", "hand": "L", ... }
  },
  "away": { "abbr": "NYY", ... },
  "home": { "abbr": "BOS", ... }
}
```

Raw schedule items do NOT have `game.pitcher` or `game.awayPitcher` — those fields are only on the enriched per-game detail object built by the IIFE around line 4726. On liveSlate items they are both `undefined`.

So at line 2208:
```js
if (!p?.id) return;  // p is undefined → always returns → zero candidates
```

Every pitcher is skipped. `computePitcherBoard` always returns `[]` for both K and Outs. The stats ARE being fetched correctly (the useEffect at line ~3845 already uses `game.probablePitchers?.home/away`), but `computePitcherBoard` never finds them because it looks at the wrong field paths.

**File:** `prop-scout-v7.jsx` only. Two-line change.

---

## Fix — Use `game.probablePitchers?.home/away` in `computePitcherBoard`

Search for:
```js
      { p: game.pitcher,     facingTeam: game.away?.abbr, isHome: true  },
      { p: game.awayPitcher, facingTeam: game.home?.abbr, isHome: false },
```

Replace with:
```js
      { p: game.probablePitchers?.home, facingTeam: game.away?.abbr, isHome: true  },
      { p: game.probablePitchers?.away, facingTeam: game.home?.abbr, isHome: false },
```

---

## Why this works

- `liveSlate` items come directly from `/api/schedule` which returns `probablePitchers.home/away`
- The stats-fetching useEffect at line ~3845 already fetches stats using `game.probablePitchers?.home/away` — so `livePitcherStats[p.id]` and `liveGameLog[p.id]` are populated under the correct IDs
- After the fix, `computePitcherBoard` looks up the same IDs that were used to fetch → stats are found → `hasContent` check passes → K and Outs candidates populate on the AI Board

---

## What does NOT change

- The stats-fetching useEffect (lines ~3845–3863) — already correct, unchanged
- The board-locking useEffect (Task 114 fix) — unchanged
- `computeBatterBoard` — unchanged
- All other references to `game.pitcher` / `game.awayPitcher` elsewhere in the file — those are on the enriched per-game detail `game` object (the IIFE), not on raw liveSlate items, so they remain correct

---

## Validation checklist

1. `npm run build` passes
2. Open AI Board → K tab — pitcher candidate cards appear (should match the number of games with confirmed SPs)
3. Open AI Board → Outs tab — pitcher candidate cards appear
4. HR tab and Hits tab still work correctly (unchanged batter path)
5. The "No K candidates available yet" message should no longer show when SPs are announced
6. F5 ML tab still works (separate path)

---

## After completing

Reply "Task 115 complete" with a brief summary of what was changed.
