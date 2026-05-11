# CODEX TASK 113 — Fix Lineup Prefetch Render Loop (6,800 splits calls → ~36)

## Problem

The lineup prefetch `useEffect` (around line 4915) has `game.lineups` in its dependency array:

```js
  }, [view, selectedId, game.lineups]);
```

`game` is a derived object rebuilt on every render (line ~4697) using an IIFE that incorporates `liveLineups[gamePkKey]`. Because it's an IIFE, `game.lineups` is always a **brand new object reference** on every render — React's shallow dep comparison always sees it as changed.

This causes the effect to fire on every single render. Inside the effect, every successful fetch calls `setBatterSplits`, `setLiveHittingLog`, `setLiveRbiCtx`, `setLiveH2H` — each of which triggers a re-render, which creates a new `game` object, which fires the effect again.

The output4.txt audit confirmed the damage: **6,803 `/api/splits` calls for only 36 unique players** (avg 189 calls per player, max 1,131 for one batter). `rbi-context` had 1,382 calls for the same 36 players. All from this one runaway effect.

**File:** `prop-scout-v7.jsx` only. One line change.

---

## Fix — Replace `game.lineups` dep with a stable scalar

Search for:
```js
  }, [view, selectedId, game.lineups]);
```

Replace with:
```js
  }, [view, selectedId, !!liveLineups[selectedId]?.confirmed]); // eslint-disable-line react-hooks/exhaustive-deps
```

### Why this works

`!!liveLineups[selectedId]?.confirmed` is a **boolean** derived directly from state (not from the derived `game` object). It changes at most once per game selection:
- `false` when the game is first opened (unconfirmed lineup)
- `true` when the confirmed lineup arrives

React's dep comparison sees a primitive (`false` / `true`), not a new object reference, so the effect fires a maximum of **twice per game** instead of on every render:
1. Once when the user opens a game (selectedId changes)
2. Once when the confirmed lineup arrives (boolean flips to `true`)

The existing per-batter guards (`!batterSplits[b.id]`, `!liveHittingLog[b.id]`, etc.) prevent duplicate fetches on the second fire for batters already loaded during the first fire. This is correct and intentional.

---

## What does NOT change

- The effect body — all fetch logic, guards, and state setters are unchanged
- `onBatterExpand` — unchanged (separate lazy-fetch path for batter drawer opens)
- The `game` object definition — unchanged
- All other useEffects — unchanged
- Backend routes — no changes

---

## Validation checklist

1. `npm run build` passes
2. Open a game from the Slate view → Lineup tab loads with batter splits and stats appearing normally
3. Check browser DevTools Network: `/api/splits/:id` fires **once per batter** on game open, not in a burst of hundreds
4. Check backend logs: `/api/splits/` calls total should match the number of batters in the lineup (~18-26 calls), not thousands
5. Switching between games should trigger a fresh fetch for each game's batters (selectedId dep handles this)
6. Confirmed lineups (when they arrive after game open) should trigger a second fetch pass for any batters not yet loaded — not an infinite loop

## After completing

Reply "Task 113 complete" with a brief summary of what was changed.
