# CODEX TASK 98 — AI Board Survivorship Bias Fix

## File to modify

`prop-scout-v7.jsx` only.

## Read before starting

Read **CODEX TASK 98** in `AGENT_SYSTEM_PROMPT.md` for full context.

## Problem being solved

The AI Board hit counter (`aiBoardSettled`, `aiBoardTabHitSummary`) reads from `aiBoardData` — the live candidate list. `aiBoardData` can be replaced when the payload changes (lineup updates, stats refreshing, or a soft-refresh). When that happens, candidates who missed and were dropped from the new payload are silently removed from the hit counter. Only candidates that won tend to stay visible, inflating accuracy every night.

The fix: lock the scored candidates the first time they're populated each day into `lockedAiBoardSnapshot`. Count results against the snapshot. Display cards keep using live `aiBoardData`.

---

## Changes — in order

### 1 — Add `lockedAiBoardSnapshot` state (~line 3535, near `aiBoardData` state)

```js
const [lockedAiBoardSnapshot, setLockedAiBoardSnapshot] = useState(() => {
  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    const stored = JSON.parse(localStorage.getItem("ai_board_snapshot") || "{}");
    return stored.date === today ? (stored.data ?? null) : null;
  } catch { return null; }
});
```

Returns `null` (not `[]`) when no snapshot exists for today — this lets the fallback to `aiBoardData` work during the brief window before the first score.

---

### 2 — Lock snapshot in `.then()` branch (~line 4086)

Find the `.then((data) => { ... setAiBoardData(scored); ...})` block inside the AI Board useEffect. Immediately after `setAiBoardData(scored)`, add:

```js
setLockedAiBoardSnapshot(prev => {
  if (prev !== null) return prev; // already locked — don't overwrite
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
  localStorage.setItem("ai_board_snapshot", JSON.stringify({ date: today, data: scored }));
  return scored;
});
```

---

### 3 — Lock snapshot in `.catch()` branch (~line 4095)

Find the `.catch(() => { ... setAiBoardData(scored); ...})` block in the same useEffect. Immediately after `setAiBoardData(scored)`, add the **identical** lock block:

```js
setLockedAiBoardSnapshot(prev => {
  if (prev !== null) return prev;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
  localStorage.setItem("ai_board_snapshot", JSON.stringify({ date: today, data: scored }));
  return scored;
});
```

---

### 4 — Update `aiBoardSettled` to read from snapshot (~line 11385)

**Current:**
```js
const aiBoardSettled = (aiBoardData ?? []).reduce((acc, c) => {
```

**New:**
```js
const aiBoardSettled = (lockedAiBoardSnapshot ?? aiBoardData ?? []).reduce((acc, c) => {
```

---

### 5 — Update `aiBoardTabHitSummary` to read from snapshot (~line 11395)

**Current:**
```js
const aiBoardTabHitSummary = ["k", "outs", "hr", "hits", "f5ml"].reduce((acc, mkt) => {
  const mktCards = (aiBoardData ?? []).filter(c => c.market === mkt);
```

**New:**
```js
const aiBoardTabHitSummary = ["k", "outs", "hr", "hits", "f5ml"].reduce((acc, mkt) => {
  const mktCards = (lockedAiBoardSnapshot ?? aiBoardData ?? []).filter(c => c.market === mkt);
```

---

## What does NOT change

- `aiBoardData` is still used for everything else: rendering the cards, filtering by tab, showing the AI scores, displaying candidate count in the header.
- `lockedAiBoardSnapshot` is NOT reset on soft-refresh (the function that sets `aiBoardData(null)` at ~line 3961 should be left alone — do not add a reset there).
- `getAiBoardGrade` is unchanged — it reads from `liveBoxscores` and `liveBoardResults`, which are always live.

---

## Edge cases handled automatically

- **Soft-refresh**: `aiBoardData` resets to null, snapshot stays — hit counter remains stable while board refetches.
- **Page reload**: Snapshot restores from localStorage — counter is accurate immediately.
- **Day boundary**: Honolulu date key causes snapshot to init as `null` next morning, fresh start.
- **No snapshot yet**: `?? aiBoardData` fallback covers the brief window before first score.

---

## Validation checklist

1. No JS errors on load.
2. AI Board opens — hit counter shows correctly.
3. Trigger a soft-refresh — hit counter does not change after refresh completes.
4. Navigate away from AI Board and back — counter persists (doesn't recount from scratch).
5. Reload the page — counter restores from localStorage snapshot, not zero.
6. Card display still shows live/current candidates after refresh.
7. No regression on K / Outs / HR / Hits / F5 ML tabs.
