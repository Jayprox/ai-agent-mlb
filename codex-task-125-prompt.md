# CODEX TASK 125 — Extract Shared UI Atoms (ResultCard, GameStatusBadge, RankScoreColumn)

## Goal

`prop-scout-v7.jsx` contains several identical (or near-identical) JSX/style patterns that are copy-pasted across the pitcher board, batter board, and game board render sections. Extracting them into small helper components and functions eliminates maintenance risk (a visual tweak in one place now requires 4-5 identical edits), reduces JSX noise, and makes each card section easier to read.

**Files changed:** `prop-scout-v7.jsx` only. No backend changes. No schema changes.

This is a pure refactor — no logic, no scoring, no state, and no data-fetching changes.

---

## Duplicated Patterns to Fix

### Pattern A — `resultBorderColor` / `resultCardStyle` (5 occurrences)

Lines 5808-5813, 10161-10164, 10338-10341, 10521-10526, 10954-10957 all repeat:
```js
const resultBorderColor = /* some color or null */;
const resultCardStyle = resultBorderColor
  ? { borderLeft: `3px solid ${resultBorderColor}`, paddingLeft: 10 }
  : {};
```
And then spread `...resultCardStyle` into a container's `style` prop.

### Pattern B — LIVE / FINAL status badge (3 occurrences)

Lines 5826-5836, 10371-10380, 10560-10570 each have the full JSX block:
```jsx
{gameStatus === "LIVE" && (
  <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 5, padding: "1px 6px" }}>
    <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 5px #ef4444", animation: "pulse 1.2s infinite" }} />
    <span style={{ fontSize: 8, fontWeight: 700, color: "#ef4444", fontFamily: "monospace", letterSpacing: "0.05em" }}>LIVE</span>
  </div>
)}
{gameStatus === "FINAL" && (
  <div style={{ background: "rgba(107,114,128,0.15)", border: "1px solid rgba(107,114,128,0.3)", borderRadius: 5, padding: "1px 6px" }}>
    <span style={{ fontSize: 8, fontWeight: 700, color: "#6b7280", fontFamily: "monospace", letterSpacing: "0.05em" }}>FINAL</span>
  </div>
)}
```

### Pattern C — Rank + Score + SIM column (2 occurrences)

Lines 10347-10363 (pitcher board) and 10527-10547 (batter board) both render the same flex column:
```jsx
<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
  <div style={{ width: 22, height: 22, borderRadius: 6, background: "#1e2030", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#6b7280", marginTop: 1 }}>{rank}</div>
  <div style={{ fontSize: 14, fontWeight: 900, color: sc, fontFamily: "monospace", lineHeight: 1 }}>{score}</div>
  {simConfidence != null && (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#141726", border: "1px solid #1f2437", borderRadius: 8, padding: "4px 7px", minWidth: 36 }}>
      <div style={{ fontSize: 12, fontWeight: 800, fontFamily: "monospace", color: simConfidence >= 65 ? "#34d399" : simConfidence >= 50 ? "#fbbf24" : "#f87171" }}>{simConfidence}%</div>
      <div style={{ fontSize: 7, color: "#4b5563", marginTop: 1 }}>SIM</div>
    </div>
  )}
</div>
```

### Pattern D — Duplicate `scoreColor` function (2 definitions)

Line 5071 defines:
```js
const scoreColor = (s) => s >= 55 ? "#ef4444" : s >= 35 ? "#f59e0b" : "#22c55e";
```
(This is the **matchup score** colorizer — low score = pitcher edge = green.)

Line 9853 defines a **second** `scoreColor` with the opposite scale:
```js
const scoreColor = (s) => s >= 70 ? "#22c55e" : s >= 55 ? "#f59e0b" : s >= 40 ? "#ef4444" : "#6b7280";
```
(This is the **board score** colorizer — high score = good = green.)

The second definition shadows the first inside the board render IIFE, which is correct behavior, but the naming collision is confusing and could mask bugs. The fix is to rename the board-scoped version to `boardScoreColor` and use that name for all calls inside the board render section.

---

## Part 1 — Add Helper Function `resultBorderStyle`

Find the area just before the first use of `resultBorderColor` in the board section (around line 9850, after the `scoreColor` board definition). Add:

```js
// Shared: generates result border style from a color string (or null)
const resultBorderStyle = (color) =>
  color ? { borderLeft: `3px solid ${color}`, paddingLeft: 10 } : {};
```

Then replace all 5 occurrences of the `resultBorderColor` / `resultCardStyle` two-liner with a single line using `resultBorderStyle(...)`. Each replacement looks like:

**Before (pitcher board, line ~10338):**
```js
const resultBorderColor = hasResolvedResult ? (pitcherHit ? "#22c55e" : "#ef4444") : null;
const resultCardStyle = resultBorderColor
  ? { borderLeft: `3px solid ${resultBorderColor}`, paddingLeft: 10 }
  : {};
```
**After:**
```js
const resultCardStyle = resultBorderStyle(hasResolvedResult ? (pitcherHit ? "#22c55e" : "#ef4444") : null);
```

Apply the same pattern to all other occurrences. The `resultBorderColor` variable is only used to compute `resultCardStyle`, so it can be dropped entirely once inlined.

**The 5 target locations and their color expressions:**

1. **Pitcher board (~line 10338)**  
   Color: `hasResolvedResult ? (pitcherHit ? "#22c55e" : "#ef4444") : null`

2. **Batter board HR/Hits (~line 10521)**  
   Color: `isHrBoard ? (gotHR ? "#fbbf24" : (boardGameStatus === "FINAL" ? "#ef4444" : null)) : (gotHR ? "#fbbf24" : (gotHit ? "#22c55e" : (ohFer ? "#ef4444" : null)))`

3. **Game board prop card (~line 10161)**  
   Color: `gameHit === null ? null : (gameHit ? "#22c55e" : "#ef4444")`

4. **AI board card (~line 10954)**  
   Color: `aiGrade === true ? "#22c55e" : aiGrade === false ? "#ef4444" : null`  
   Note: this one also sets `borderColor` inside the style — preserve that: `resultBorderStyle(color)` only sets `borderLeft` and `paddingLeft`; the `borderColor` override stays as a separate line on the container.

5. **K board / picks card (~line 5808)**  
   Color: `isResolved ? (modelHit ? "#22c55e" : (gameStatus === "FINAL" ? "#ef4444" : null)) : null`

---

## Part 2 — Add `GameStatusBadge` Component

Find the area where the existing small helper components like `TierBadge` and `LeanBadge` are defined (around line 4800-5000). Add a new component immediately after `TierBadge`:

```jsx
// Shared: LIVE pulsing badge / FINAL gray badge / null
const GameStatusBadge = ({ status }) => {
  if (status === "LIVE") return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 5, padding: "1px 6px" }}>
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 5px #ef4444", animation: "pulse 1.2s infinite" }} />
      <span style={{ fontSize: 8, fontWeight: 700, color: "#ef4444", fontFamily: "monospace", letterSpacing: "0.05em" }}>LIVE</span>
    </div>
  );
  if (status === "FINAL") return (
    <div style={{ background: "rgba(107,114,128,0.15)", border: "1px solid rgba(107,114,128,0.3)", borderRadius: 5, padding: "1px 6px" }}>
      <span style={{ fontSize: 8, fontWeight: 700, color: "#6b7280", fontFamily: "monospace", letterSpacing: "0.05em" }}>FINAL</span>
    </div>
  );
  return null;
};
```

Then replace the 3 duplicate LIVE/FINAL JSX blocks (lines 5826-5836, 10371-10380, 10560-10570) with:
```jsx
<GameStatusBadge status={gameStatus} />
```
or
```jsx
<GameStatusBadge status={boardGameStatus} />
```
depending on which variable is in scope at that location. The variable names differ (`gameStatus` in the picks section, `boardGameStatus` in the prop board) — use whichever is already defined at that render site.

---

## Part 3 — Add `RankScoreColumn` Component

In the same helper component area (after `GameStatusBadge`), add:

```jsx
// Shared: rank number + model score + optional SIM confidence column
const RankScoreColumn = ({ rank, score, scoreColor: sc, simConfidence }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
    <div style={{ width: 22, height: 22, borderRadius: 6, background: "#1e2030", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#6b7280", marginTop: 1 }}>{rank}</div>
    <div style={{ fontSize: 14, fontWeight: 900, color: sc, fontFamily: "monospace", lineHeight: 1 }}>{score}</div>
    {simConfidence != null && (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#141726", border: "1px solid #1f2437", borderRadius: 8, padding: "4px 7px", minWidth: 36 }}>
        <div style={{ fontSize: 12, fontWeight: 800, fontFamily: "monospace", color: simConfidence >= 65 ? "#34d399" : simConfidence >= 50 ? "#fbbf24" : "#f87171" }}>{simConfidence}%</div>
        <div style={{ fontSize: 7, color: "#4b5563", marginTop: 1 }}>SIM</div>
      </div>
    )}
  </div>
);
```

Replace the 2 occurrences of the rank+score+SIM JSX block (in the pitcher card and batter card renders) with:
```jsx
<RankScoreColumn rank={i + 1} score={c.score} scoreColor={sc} simConfidence={c.simConfidence} />
```

The `sc` variable is already computed before the card render starts (`const sc = scoreColor(c.score)` or `boardScoreColor(c.score)`), so pass it in as `scoreColor`.

---

## Part 4 — Rename Inner `scoreColor` to `boardScoreColor`

Inside the board render IIFE (the `!isGameBoard` block, around line 9853), rename the second `scoreColor` definition to `boardScoreColor`:

```js
// Before:
const scoreColor = (s) =>
  s >= 70 ? "#22c55e" : s >= 55 ? "#f59e0b" : s >= 40 ? "#ef4444" : "#6b7280";

// After:
const boardScoreColor = (s) =>
  s >= 70 ? "#22c55e" : s >= 55 ? "#f59e0b" : s >= 40 ? "#ef4444" : "#6b7280";
```

Then update the 2 call sites inside that same scope that use `scoreColor(c.score)` → `boardScoreColor(c.score)`:
- Line ~10321: `const sc = scoreColor(c.score);`  → `const sc = boardScoreColor(c.score);`
- Line ~10150: `const sc = scoreColor(displayScore);` → `const sc = boardScoreColor(displayScore);`

The outer `scoreColor` (line 5071, matchup colorizer) is unaffected and retains its name.

---

## Checklist

- [ ] `resultBorderStyle(color)` helper function added near the board render section
- [ ] All 5 `resultBorderColor` / `resultCardStyle` two-liners replaced with single `resultBorderStyle(...)` call
- [ ] `GameStatusBadge` component added in the shared component area (near `TierBadge`, `LeanBadge`)
- [ ] All 3 LIVE/FINAL badge JSX blocks replaced with `<GameStatusBadge status={...} />`
- [ ] `RankScoreColumn` component added in the shared component area
- [ ] Both rank+score+SIM JSX blocks (pitcher board + batter board) replaced with `<RankScoreColumn ... />`
- [ ] Inner board `scoreColor` renamed to `boardScoreColor` with 2 call sites updated
- [ ] Outer `scoreColor` (line ~5071, matchup colorizer) unchanged
- [ ] Visual output is pixel-identical — this is a pure refactor
- [ ] No scoring logic changes
- [ ] No state changes
- [ ] No backend changes
- [ ] No schema changes

---

## After Completing

Reply "Task 125 complete" with a brief summary of what changed.
