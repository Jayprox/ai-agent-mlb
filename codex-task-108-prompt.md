# CODEX TASK 108 — Remove Picks Tab + All Logging Infrastructure

## Overview

Two goals combined into one task:
1. Remove the Picks tab entirely (view, nav button, grading logic)
2. Remove every "Log" button from every card in the app — Model picks, Lab picks, Game view NRFI, Game view Props

Since nothing will log after this task, all `propLog`-dependent state, derived variables, and helper functions become dead code and must be removed too.

**File:** `prop-scout-v7.jsx` only. No backend changes.

---

## Part A — Remove the Picks Tab (original spec, 13 items)

Search by name — do not rely on line numbers.

### A1. Nav button
Remove the `<button onClick={() => setView("picks")}>` entry in the nav bar (the one with purple active color `#a78bfa` and label "Picks").

### A2. Stale picks banner
Remove the IIFE block on the Slate view that renders an "⏰ N picks need grading" banner. Search for:
```js
const stale = propLog.filter(p => !p.result && p.timestamp
```
Remove the entire `{(() => { const stale = propLog.filter(...); ... })()}` block.

### A3. `picksFilter` state
Remove:
```js
const [picksFilter, setPicksFilter] = useState("all")
```

### A4. `gradedGames` ref
Remove:
```js
const gradedGames = useRef(new Set())
```

### A5. `histGradedGames` ref
Remove:
```js
const histGradedGames = useRef(new Set())
```

### A6. `hydratePicksFromServer` callback
Remove the entire `useCallback(async () => { ... })` definition for `hydratePicksFromServer`, plus the line in the view-change `useEffect` that calls:
```js
if (view === "picks") hydratePicksFromServer()
```

### A7. Today-slate auto-grading `useEffect`
Remove the `useEffect` identifiable by the comment:
```
// Fires when a live boxscore update arrives for a game that has pending picks
```

### A8. Historical catch-up grading `useEffect`
Remove the `useEffect` identifiable by the comment:
```
// Fires when the user opens the Picks tab. Finds pending picks whose gamePk
```

### A9. `getPickStatus` function
Remove:
```js
const getPickStatus = (pick) => ...
```

### A10. `isPickUnsettled` function
Remove:
```js
const isPickUnsettled = (pick) => getPickStatus(pick) !== "settled"
```

### A11. `computeGrade` function
Remove:
```js
const computeGrade = (pick, box) => ...
```

### A12. `markResult` function
Remove:
```js
const markResult = (id, result) => ...
```

### A13. `view === "picks"` render block
Remove the entire `{view === "picks" && (() => { ... })()}` block (~600 lines). It starts with a `renderPickStatusBadge` helper defined at the top of the IIFE and ends with the picksFilter filter buttons.

---

## Part B — Remove All Log Buttons from Cards

### B1. Model tab — "Log OVER" button on model pick cards

Search for:
```js
{logged ? "✓ Logged" : `+ Log OVER ${bookLine?.line ?? p.modelLine}`}
```

Remove the entire `<button onClick={() => !logged && logPick(overPick)} ...>` block that contains this text, including its wrapping `<button>` tag.

Also remove the `logged` derived variable just above it. Search for:
```js
const logged = isLogged(p)
```
(or similar — it checks `propLog.some(...)` for this pick) and remove that line.

### B2. Lab tab — "Log this Lab pick" button (appears in 3 card variants)

Search for ALL occurrences of:
```
title={labPickLogged ? "Already logged" : "Log this Lab pick"}
```

For each occurrence, remove the entire `<button ... onClick={() => !labPickLogged && logPick({...})} ... >` block.

Also remove the `labPickLogged` derived variable near each button. Search for:
```js
const labPickLogged = propLog.some(
```
(or similar pattern) and remove each occurrence.

### B3. Game view — NRFI "Log this pick" button

Search for:
```js
title={nrfiLogged ? "Already logged" : "Log this pick"}
```

Remove the entire `<button onClick={() => !nrfiLogged && logPick({...})} ...>` block.

Also remove the `nrfiLogged` derived variable:
```js
const nrfiLogged = propLog.some(p => p.gamePk === selectedId && p.propType === "NRFI")
```

### B4. Game view Props — "+" log button on prop cards

Search for:
```js
title={logged ? "Already logged" : "Log this pick"}
```
(in the game view props section, not the Lab tab)

Remove the `<button onClick={() => !logged && logPick(p)} ...>` block with the `＋` / `✓` label.

Also remove the associated `logged` / `isLogged` derived variable for that prop entry.

### B5. Game view Props expanded — OVER/UNDER log buttons

Search for:
```js
{/* Log buttons */}
```

Remove the entire `<div style={{ display: "flex", gap: 6 }}>` block that contains both the OVER and UNDER log buttons (the block with `overLogged` and `underLogged` buttons).

Also remove the `overLogged` and `underLogged` derived variables nearby:
```js
const overLogged = propLog.some(...)
const underLogged = propLog.some(...)
```

---

## Part C — Remove All Now-Dead Logging Infrastructure

Once all log buttons are gone, the following are unused and must be removed:

### C1. `logPick` function
Remove the entire `const logPick = (prop) => { ... }` function definition.

### C2. `propLog` state and `setPropLog`
Remove:
```js
const [propLog, setPropLog] = useState(...)
```
and the `useEffect` that initializes/syncs `propLog` from the API (search for `hydratePicksFromServer` or `GET /api/picks` fetch inside a `useEffect`).

### C3. `isLogged` / `isModelLog` / `getPickLoggedAt` helper functions
Remove these helper functions that check `propLog`:
- `const isLogged = ...` (checks if a pick is in propLog)
- `const isModelLog = ...`
- `const getPickLoggedAt = ...`

### C4. Model tab propLog-derived stats in the header
In the Model tab header, there is a W-L-pending summary derived from `propLog` and `todayModelLogs`. Search for:
```js
const todayModelLogs =
```
Remove `todayModelLogs`, `l7SettledModelLogs`, `modelPending`, `l7WinRate`, and any other `const` derived from `propLog` that feeds the Model tab header stats display. Also remove the JSX that renders those stats (the W-L record chip/badge in the Model tab header).

---

## What to KEEP (do NOT remove)

- `propLog` is only referenced in things being removed — once all log buttons and the Picks tab are gone, it has no other consumers. Remove it.
- Lab tab card layout, Lab scoring logic, Lab sub-tabs — all unchanged except the log button is removed from each card
- Model tab pick cards — unchanged except the log button is removed
- Game view NRFI section — unchanged except the log button is removed
- Game view Props section — unchanged except log buttons are removed; the parlay "🔗" button stays
- `backend/routes/picks.js` — no backend changes

---

## Validation checklist

1. `npm run build` passes — no JSX or JS errors
2. "Picks" nav button is gone
3. Stale picks banner is gone from Slate view
4. Model pick cards have no "Log" button — card layout is otherwise identical
5. Lab pick cards have no "Log this Lab pick" button — card layout is otherwise identical
6. Game view NRFI section has no log button
7. Game view Props cards have no "+" log button and no OVER/UNDER log buttons
8. Model tab header has no W-L-pending pick summary (or that section is cleanly removed)
9. No references remain to: `propLog`, `setPropLog`, `logPick`, `isLogged`, `isModelLog`, `getPickLoggedAt`, `labPickLogged`, `nrfiLogged`, `overLogged`, `underLogged`, `todayModelLogs`, `picksFilter`, `gradedGames`, `histGradedGames`, `hydratePicksFromServer`, `computeGrade`, `markResult`, `getPickStatus`, `isPickUnsettled`
10. All other tabs and card layouts render correctly

## After completing

Reply "Task 108 complete" with a brief summary of what was changed.
