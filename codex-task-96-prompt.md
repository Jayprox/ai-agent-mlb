# CODEX TASK 96 — Board Option C: Rolling Lock + Per-Game Cap

## File to modify

`prop-scout-v7.jsx` only.

## Read before starting

Read **CODEX TASK 96** in `AGENT_SYSTEM_PROMPT.md` for full context.

## Problem being solved

The HR/Hits/K/Outs board tabs have two bugs today:
1. **Survivorship bias** — when a game finishes, confirmed players who didn't hit/get a K/etc. fall off the live board. The hit counter only sees the games with positive results, inflating accuracy every night.
2. **Early-game crowding** — lineups for afternoon games confirm first, filling the board's top-20 slots and pushing out evening/primetime games.

The fix: lock candidates at first pitch into a separate `lockedBoardCandidates` state. Count results against the locked snapshot (not the live board). Show upcoming games in a live section, locked games in a separate section below.

---

## Changes — in order

### 1 — Add `lockedBoardCandidates` state (near `boardTab` state declaration)

```js
const [lockedBoardCandidates, setLockedBoardCandidates] = useState(() => {
  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    const stored = JSON.parse(localStorage.getItem("board_locked_snapshot") || "{}");
    return stored.date === today ? (stored.candidates ?? {}) : {};
  } catch { return {}; }
});
// Shape: { [gamePk]: { hits: Candidate[], hr: Candidate[], k: Candidate[], outs: Candidate[] } }
```

Restores from localStorage on load (keyed by Honolulu date so it clears automatically the next day).

---

### 2 — Add `getBoardGamePhase` helper (near `getPickStatus` / `isPickUnsettled`)

```js
const getBoardGamePhase = (gamePk) => {
  const game = (liveSlate ?? []).find(g => String(g.gamePk) === String(gamePk));
  const s = game?.status ?? "";
  if (s === "Final" || s === "Game Over" || s === "Completed Early") return "final";
  if (s === "In Progress" || s === "Warmup") return "live";
  return "upcoming";
};
```

---

### 3 — Modify `computeBatterBoard` return (~line 2383): per-game cap of 5

**Current:**
```js
return candidates.sort((a, b) => b.score - a.score).slice(0, 20);
```

**New:**
```js
const byGame = {};
candidates.forEach(c => {
  if (!byGame[c.gamePk]) byGame[c.gamePk] = [];
  byGame[c.gamePk].push(c);
});
const capped = Object.values(byGame).flatMap(group =>
  group.sort((a, b) => b.score - a.score).slice(0, 5)
);
return capped.sort((a, b) => b.score - a.score);
```

No change to `computePitcherBoard` — at most 2 pitchers per game already.

---

### 4 — Add lock useEffect (after existing board useEffects)

Fires when `liveSlate` changes. Idempotent — only locks a `gamePk` once.

```js
useEffect(() => {
  if (!liveSlate || view !== "board") return;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });

  liveSlate.forEach(game => {
    const phase = getBoardGamePhase(game.gamePk);
    if (phase === "upcoming") return;
    if (lockedBoardCandidates[game.gamePk]) return;

    const newEntry = {
      hits: computeBatterBoard("hits", liveSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits)
              .filter(c => String(c.gamePk) === String(game.gamePk)),
      hr:   computeBatterBoard("hr", liveSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits)
              .filter(c => String(c.gamePk) === String(game.gamePk)),
      k:    computePitcherBoard("k", liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats)
              .filter(c => String(c.gamePk) === String(game.gamePk)),
      outs: computePitcherBoard("outs", liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats)
              .filter(c => String(c.gamePk) === String(game.gamePk)),
    };

    setLockedBoardCandidates(prev => {
      const updated = { ...prev, [game.gamePk]: newEntry };
      localStorage.setItem("board_locked_snapshot", JSON.stringify({ date: today, candidates: updated }));
      return updated;
    });
  });
}, [liveSlate, view]); // eslint-disable-line react-hooks/exhaustive-deps
```

---

### 5 — Rewrite `hitSummary` / `tabHitSummary` (~lines 10396–10411)

Count results from locked candidates only — misses can never fall off.

```js
const lockedCandidatesForType = (type) =>
  Object.values(lockedBoardCandidates).flatMap(g => g[type] ?? []);

const hitSummary = (type) => {
  const items = lockedCandidatesForType(type);
  if (!items.length) return null;
  const resolved = items.map(item => boardOutcome(type, item)).filter(v => v !== null);
  if (!resolved.length) return null;
  return { hits: resolved.filter(Boolean).length, total: items.length };
};

const tabHitSummary = {
  hr:   hitSummary("hr"),
  hits: hitSummary("hits"),
  k:    hitSummary("k"),
  outs: hitSummary("outs"),
};
```

`boardOutcome` is unchanged — it already reads from `liveBoardResults` keyed by player ID, which works for locked candidates.

---

### 6 — Split board render into live + locked sections (board IIFE, ~line 10346)

#### Add derived values at the top of the board IIFE (after `boardCandidatesByType` is declared):

```js
const liveBoardCandidates = (boardCandidatesByType[boardTab] ?? []).filter(c =>
  getBoardGamePhase(c.gamePk) === "upcoming"
);

const liveCandidatesByGame = (() => {
  const groups = {};
  liveBoardCandidates.forEach(c => {
    if (!groups[c.gamePk]) groups[c.gamePk] = { gameLabel: c.gameLabel, gameTime: c.gameTime, gamePk: c.gamePk, candidates: [] };
    groups[c.gamePk].candidates.push(c);
  });
  return Object.values(groups).sort((a, b) => {
    const ta = a.gameTime ? Date.parse(a.gameTime) : Infinity;
    const tb = b.gameTime ? Date.parse(b.gameTime) : Infinity;
    return ta - tb;
  });
})();

const lockedCandidatesByGame = (() => {
  const groups = {};
  Object.entries(lockedBoardCandidates).forEach(([gamePk, entry]) => {
    const candidates = (entry[boardTab] ?? []);
    if (!candidates.length) return;
    const first = candidates[0];
    groups[gamePk] = { gameLabel: first?.gameLabel ?? gamePk, gameTime: first?.gameTime ?? null, gamePk, candidates };
  });
  return Object.values(groups).sort((a, b) => {
    const ta = a.gameTime ? Date.parse(a.gameTime) : Infinity;
    const tb = b.gameTime ? Date.parse(b.gameTime) : Infinity;
    return ta - tb;
  });
})();

const hasLocked = lockedCandidatesByGame.length > 0;
```

#### Replace the existing flat card list with the two-section layout:

Find where `boardCandidates.map(item => ...)` or `boardCandidatesByType[boardTab].map(item => ...)` renders cards for the HR/Hits/K/Outs tabs. Replace that entire block with:

```jsx
{/* ── Live board (upcoming games only) ── */}
{liveCandidatesByGame.length > 0 && (
  <div style={{ marginBottom: hasLocked ? 16 : 0 }}>
    {liveCandidatesByGame.map(group => (
      <div key={group.gamePk} style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", fontFamily: "monospace",
          letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 2px 6px",
          borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 6,
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{group.gameLabel}</span>
          {group.gameTime && (
            <span style={{ color: "#38bdf8" }}>
              {new Date(group.gameTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET
            </span>
          )}
        </div>
        {group.candidates.map(item => (
          /* EXISTING card render — copy the exact card JSX from the current flat list, unchanged */
          /* key={item.id} */
        ))}
      </div>
    ))}
  </div>
)}

{liveCandidatesByGame.length === 0 && !hasLocked && (
  <div style={{ textAlign: "center", color: "#4b5563", fontSize: 12, padding: "24px 0" }}>
    No confirmed lineups yet
  </div>
)}

{/* ── Locked section (in play / final) ── */}
{hasLocked && (
  <div>
    <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", fontFamily: "monospace",
      letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 2px 8px",
      display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ color: "#a855f7" }}>⊘</span> Locked · in play / final
    </div>
    {lockedCandidatesByGame.map(group => {
      const phase = getBoardGamePhase(group.gamePk);
      return (
        <div key={group.gamePk} style={{ marginBottom: 12, opacity: phase === "final" ? 0.85 : 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", fontFamily: "monospace",
            letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 2px 6px",
            borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 6,
            display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{group.gameLabel}</span>
            <span style={{ color: phase === "live" ? "#22c55e" : "#6b7280" }}>
              {phase === "live" ? "● LIVE" : "FINAL"}
            </span>
          </div>
          {group.candidates.map(item => (
            /* EXISTING card render — identical markup, no changes to card internals */
            /* key={item.id} */
          ))}
        </div>
      );
    })}
  </div>
)}
```

**Important:** The card internals (score badge, player name, stats, log button, result badges, etc.) must be identical to the current card markup. Do not change the card JSX — only the grouping/section wrapper changes.

---

### 7 — Update status bar counts (board header area)

Find where `boardCandidates.length` or `boardCandidatesByType[boardTab].length` is used in the header/status bar. Replace with:

```js
const loadedBatters = liveBoardCandidates.length;
const lockedCount   = lockedCandidatesByGame.reduce((sum, g) => sum + g.candidates.length, 0);
```

Use `loadedBatters` for the live count display. Showing `lockedCount` in the header is optional but avoids showing stale/zero totals.

---

## Edge cases to handle correctly

- **Page load mid-day**: `lockedBoardCandidates` restores from localStorage — locked sections appear immediately with live result indicators.
- **All games final**: Live section empty, only locked section visible. All results tracked correctly.
- **Game not yet in `liveSlate`**: `getBoardGamePhase` returns `"upcoming"` — never prematurely locks.
- **Day boundary**: Snapshot is keyed by Honolulu date. When the date changes the stored snapshot is ignored and `lockedBoardCandidates` initializes to `{}`.
- **Pitcher board (K/Outs)**: Same lock logic applies. At most 2 pitchers per game — cap has no effect, but lock mechanism still fires and keeps K/Outs results accurate.

---

## Validation checklist

1. No JS errors on load.
2. Board tabs (HR / Hits / K / Outs) show upcoming games in a live section, grouped by game with time in ET.
3. Once a game goes live or final, its candidates move to the locked section below, labeled "● LIVE" or "FINAL".
4. Locked section persists on page reload (restores from localStorage).
5. Hit rate badge (`X/Y hit`) at the top of each tab counts correctly — misses included even after game ends.
6. Per-game cap: no single game shows more than 5 candidates on the HR or Hits tab.
7. No regression on K / Outs tabs or any other view.
