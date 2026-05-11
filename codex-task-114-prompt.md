# CODEX TASK 114 — Fix Board Lock Firing Before Lineup Data Is Ready

## Problem

When a game goes live ("In Progress"), the board locking `useEffect` fires immediately because `liveSlate` updates. But `liveLineups` is NOT in the effect's dependency array — it's captured as a stale closure value.

`computeBatterBoard` (line ~2306) skips any game where the lineup isn't confirmed:
```js
if (!lu?.confirmed && lu?.source !== "roster") return;
```

So if lineups haven't loaded yet when the game goes live, `computeBatterBoard` returns an empty array for that game. The lock stores an empty entry:

```js
setLockedBoardCandidates(prev => {
  const updated = { ...prev, [game.gamePk]: newEntry }; // newEntry.hits = [], .hr = [], etc.
  ...
});
```

And the guard on the next run:
```js
if (lockedBoardCandidates[game.gamePk]) return; // entry exists (even empty) → never retried
```

...permanently blocks re-locking. The result: games that go live before lineups are confirmed get locked with zero candidates and never recover. The Board shows only the remaining pre-game games.

**File:** `prop-scout-v7.jsx` only.

---

## Fix — Two changes to the locking `useEffect`

### Change 1 — Don't store empty locks

Inside the `liveSlate.forEach` loop, after building `newEntry`, add a guard before calling `setLockedBoardCandidates`:

Search for:
```js
      setLockedBoardCandidates(prev => {
        const updated = { ...prev, [game.gamePk]: newEntry };
        localStorage.setItem("board_locked_snapshot", JSON.stringify({ date: today, candidates: updated }));
        return updated;
      });
```

Replace with:
```js
      // Only lock if we actually have candidates — if lineup data isn't ready yet,
      // skip and let the effect retry when liveLineups updates.
      const hasContent = newEntry.hits.length > 0 || newEntry.hr.length > 0
                      || newEntry.k.length > 0    || newEntry.outs.length > 0;
      if (!hasContent) return;

      setLockedBoardCandidates(prev => {
        const updated = { ...prev, [game.gamePk]: newEntry };
        localStorage.setItem("board_locked_snapshot", JSON.stringify({ date: today, candidates: updated }));
        return updated;
      });
```

### Change 2 — Add `liveLineups` to the dep array so the effect retries when lineups arrive

Search for:
```js
  }, [liveSlate, view]); // eslint-disable-line react-hooks/exhaustive-deps
```

(This is the closing line of the locking useEffect — the one with the comment "Lock board candidates when a game goes live".)

Replace with:
```js
  }, [liveSlate, view, liveLineups]); // eslint-disable-line react-hooks/exhaustive-deps
```

---

## Why this works

With both changes together:

1. **Game goes live, lineups not confirmed yet** → `computeBatterBoard` returns empty → `hasContent` is false → skip lock → no empty entry stored → guard won't block future attempts

2. **Lineups arrive for the in-progress game** → `liveLineups` changes → effect re-fires → `getBoardGamePhase` still returns "live" → `lockedBoardCandidates[game.gamePk]` still undefined (we never stored an empty one) → `computeBatterBoard` now has lineup data → `hasContent` is true → lock stored ✓

3. **Game goes live, lineups already confirmed** → `computeBatterBoard` returns full candidate list → `hasContent` is true → locks immediately on first fire ✓

4. **Already locked game** → `if (lockedBoardCandidates[game.gamePk]) return;` early-exits → no re-lock ✓

The only downside of adding `liveLineups` to deps: the effect re-runs whenever any lineup updates. But since the guard exits immediately for already-locked games, this is cheap (just 15 early returns per liveLineups update). The net effect is correct locking behavior regardless of the ordering of lineup data vs. game start.

---

## What does NOT change

- `computeBatterBoard` — unchanged
- `getBoardGamePhase` — unchanged
- `lockedBoardCandidates` state initialization (localStorage restore) — unchanged
- The rendering logic for locked vs. upcoming games — unchanged
- All other tabs (HR, K, Outs) benefit from the same fix since they're all locked in the same effect

---

## Validation checklist

1. `npm run build` passes
2. Open the Board → Hits tab after games have started — all games that have begun should show locked candidate cards, not disappear
3. Open the app mid-day when multiple games are already live — locked cards appear for in-progress and final games
4. Hard-refresh the page — locked cards reload from localStorage correctly
5. A game that was locked correctly should NOT re-lock when new lineups arrive (guard holds)
6. HR tab, K tab, Outs tab — same fix applies, verify cards persist after game start on those tabs too

## After completing

Reply "Task 114 complete" with a brief summary of what was changed.
