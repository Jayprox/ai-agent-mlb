# CODEX TASK 121 — Lock Games Board Candidates at Game-Start

## Goal

The Games board (NRFI, O/U Total, Run Line, Moneyline, F5 ML, F5 RL) currently re-computes live on every render. When a game goes live, conditions re-score and the ranking changes — cards that were ranked #1 pre-game can be silently replaced mid-game. Users placed bets on pre-game picks, returned to check results, and found the picks had changed. This is a **critical bug** that causes the hit badge to report results against the wrong candidates.

**The fix mirrors what already exists for prop markets (HR/Hits/K/Outs):** add a `lockedGameBoardCandidates` state keyed by gamePk. When a game transitions from upcoming → live/final, snapshot `computeGameBoard` results for that gamePk across all 6 sub-tabs. At render time, substitute locked candidates for in-progress and final games.

**Files changed:** `prop-scout-v7.jsx` only. No backend changes. No schema changes.

---

## Part 1 — Add `lockedGameBoardCandidates` State

Add a new state variable directly after `lockedBoardCandidates` (around line 3723):

```js
const [lockedGameBoardCandidates, setLockedGameBoardCandidates] = useState(() => {
  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    const stored = JSON.parse(localStorage.getItem("game_board_locked_snapshot") || "{}");
    return stored.date === today ? (stored.candidates ?? {}) : {};
  } catch { return {}; }
});
```

Shape: `{ [gamePk]: { nrfi: item|null, total: item|null, spread: item|null, ml: item|null, f5ml: item|null, f5spread: item|null } }`

Each inner item is the single candidate object that `computeGameBoard` returns for that game, or `null` if the game wasn't on the slate for that market.

---

## Part 2 — Add the Lock useEffect

Add a new `useEffect` directly after the existing prop-board lock useEffect (which ends around line 5345). This effect runs whenever the slate or any game-scoring input changes:

```js
// Lock game board candidates when a game goes live — prevents rankings shifting mid-game.
useEffect(() => {
  if (!liveSlate || view !== "board") return;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });

  liveSlate.forEach(game => {
    const phase = getBoardGamePhase(game.gamePk);
    if (phase === "upcoming") return;                    // not live yet — skip
    if (lockedGameBoardCandidates[game.gamePk]) return; // already locked — skip

    const SUB_TABS = ["nrfi", "total", "spread", "ml", "f5ml", "f5spread"];
    const entry = {};
    SUB_TABS.forEach(sub => {
      const all = computeGameBoard(sub, activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires);
      entry[sub] = all.find(c => String(c.gamePk) === String(game.gamePk)) ?? null;
    });

    // Only commit if at least one sub-tab has a candidate (avoids empty lock on cold slate)
    if (!Object.values(entry).some(v => v !== null)) return;

    setLockedGameBoardCandidates(prev => {
      const updated = { ...prev, [game.gamePk]: entry };
      localStorage.setItem(
        "game_board_locked_snapshot",
        JSON.stringify({ date: today, candidates: updated })
      );
      return updated;
    });
  });
}, [liveSlate, view, activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires]); // eslint-disable-line react-hooks/exhaustive-deps
```

---

## Part 3 — Merge Locked + Live at Render Time

### 3a — Replace the `gameBoardCandidates` computation

Find the current computation (around line 9674):

```js
const gameBoardCandidates = isGameBoard
  ? computeGameBoard(gameSubTab, activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires)
  : [];
```

Replace it with a merged version that substitutes locked data for non-upcoming games:

```js
const gameBoardCandidates = (() => {
  if (!isGameBoard) return [];
  const live = computeGameBoard(
    gameSubTab, activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires
  );
  return live.map(c => {
    const locked = lockedGameBoardCandidates[c.gamePk]?.[gameSubTab];
    const phase  = getBoardGamePhase(c.gamePk);
    return (locked && phase !== "upcoming") ? locked : c;
  });
})();
```

This preserves rank order from the live array (which reflects the pre-lock ranking for locked games, since locked games' live items just get swapped out), and the order is stable once locked.

### 3b — Add a shared helper `getGameBoardCandidatesForSubTab`

The `gameSubtabHitSummary` object (around line 9824) currently calls `computeGameBoard` six separate times, each returning a fully live result. It needs to use locked data for the same reason.

Add this helper just before `gameSubtabHitSummary`:

```js
const getGameBoardCandidatesForSubTab = (sub) => {
  const live = computeGameBoard(
    sub, activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires
  );
  return live.map(c => {
    const locked = lockedGameBoardCandidates[c.gamePk]?.[sub];
    const phase  = getBoardGamePhase(c.gamePk);
    return (locked && phase !== "upcoming") ? locked : c;
  });
};
```

### 3c — Replace `gameSubtabHitSummary` to use the helper

Replace:

```js
const gameSubtabHitSummary = {
  nrfi: gameHitSummary("nrfi", computeGameBoard("nrfi", activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires)),
  total: gameHitSummary("total", computeGameBoard("total", activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires)),
  spread: gameHitSummary("spread", computeGameBoard("spread", activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires)),
  ml: gameHitSummary("ml", computeGameBoard("ml", activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires)),
  f5ml: gameHitSummary("f5ml", computeGameBoard("f5ml", activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires)),
  f5spread: gameHitSummary("f5spread", computeGameBoard("f5spread", activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires)),
};
```

With:

```js
const gameSubtabHitSummary = {
  nrfi:     gameHitSummary("nrfi",     getGameBoardCandidatesForSubTab("nrfi")),
  total:    gameHitSummary("total",    getGameBoardCandidatesForSubTab("total")),
  spread:   gameHitSummary("spread",   getGameBoardCandidatesForSubTab("spread")),
  ml:       gameHitSummary("ml",       getGameBoardCandidatesForSubTab("ml")),
  f5ml:     gameHitSummary("f5ml",     getGameBoardCandidatesForSubTab("f5ml")),
  f5spread: gameHitSummary("f5spread", getGameBoardCandidatesForSubTab("f5spread")),
};
```

---

## Checklist

- [ ] `lockedGameBoardCandidates` state added with localStorage hydration (keyed by Honolulu date)
- [ ] Lock useEffect fires when a game transitions away from "upcoming"
- [ ] Lock useEffect skips games already in `lockedGameBoardCandidates` (idempotent)
- [ ] Lock useEffect skips games with no candidates (avoids empty lock on cold slate)
- [ ] All 6 sub-tabs (`nrfi`, `total`, `spread`, `ml`, `f5ml`, `f5spread`) locked per game
- [ ] `game_board_locked_snapshot` written to localStorage on each lock event
- [ ] `gameBoardCandidates` uses locked data for in-progress and final games
- [ ] `gameBoardCandidates` still uses live data for upcoming games
- [ ] `getGameBoardCandidatesForSubTab` helper added
- [ ] `gameSubtabHitSummary` uses `getGameBoardCandidatesForSubTab` (not raw `computeGameBoard`)
- [ ] All other logic that reads `gameBoardCandidates` (card render loop, `gameBoardOutcome`, `gameHit`) continues to work — no changes needed there since they all derive from `gameBoardCandidates`
- [ ] No frontend changes outside `prop-scout-v7.jsx`
- [ ] No backend changes
- [ ] No schema changes

---

## Out of Scope for This Task

- Persisting game board locks to the `board_card_snapshots` PostgreSQL table (game markets use different outcome logic — can be a follow-up)
- Resolving game board results via the nightly cron (same — follow-up)
- Any changes to the prop board lock logic (already correct)
- Any changes to `computeGameBoard` internals

---

## After Completing

Reply "Task 121 complete" with a brief summary of what changed.
