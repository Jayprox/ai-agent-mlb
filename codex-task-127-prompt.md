# CODEX TASK 127 — Reusability Cleanup: resultBorderStyle + Unified Hit Summary

## Goal

Two small reusability cleanups left over from Task 125:

1. **One remaining `resultBorderColor`/`cardStyle` two-liner** that wasn't converted to use `resultBorderStyle()` — in `renderEdgeCard` (around line 11126).
2. **`hitSummary` and `gameHitSummary` are structurally identical** — extract a shared `summarizeOutcomes` helper to eliminate the duplication.

**Files changed:** `prop-scout-v7.jsx` only. No backend changes. No schema changes. Pure refactor — no visual or behavioral differences (one minor behavioral improvement noted in Part 2).

---

## Part 1 — Fix Remaining `resultBorderStyle` Instance

In `renderEdgeCard` (inside the predict/AI board section), find:

```js
const resultBorderColor = grade === true ? "#22c55e" : grade === false ? "#ef4444" : null;
const cardStyle = resultBorderColor
  ? { borderLeft: `3px solid ${resultBorderColor}`, borderColor: resultBorderColor, paddingLeft: 10 }
  : {};
```

Replace with:

```js
const resultBorderColor = grade === true ? "#22c55e" : grade === false ? "#ef4444" : null;
const cardStyle = {
  ...resultBorderStyle(resultBorderColor),
  ...(resultBorderColor ? { borderColor: resultBorderColor } : {}),
};
```

The intermediate `resultBorderColor` variable is kept because it's also used for the `borderColor` override (which `resultBorderStyle` doesn't set on its own — it only sets `borderLeft` and `paddingLeft`).

---

## Part 2 — Unified `summarizeOutcomes` Helper

### Current state

`hitSummary` (prop board) and `gameHitSummary` (game board) share the same structure:
1. Guard on empty items array
2. Map each item through an outcome function
3. Filter out nulls (unresolved)
4. Guard on zero resolved items
5. Return `{ hits, total }`

They differ only in: (a) how items are sourced, and (b) which outcome function is called. `gameHitSummary` is also missing the "zero resolved items" guard that `hitSummary` has — a minor bug where it returns `{ hits: 0, total: N }` before any games are final, making tabs show "0/5" when nothing has resolved yet.

### Add `summarizeOutcomes` helper

Find the block just before `hitSummary` is defined (around line 9935). Add the helper immediately before it:

```js
// Shared: resolves an array of board candidates through an outcome function
// and returns { hits, total } or null (if no items or none resolved yet).
const summarizeOutcomes = (items, outcomeFn) => {
  if (!items.length) return null;
  const resolved = items.map(outcomeFn).filter(v => v !== null);
  if (!resolved.length) return null;
  return { hits: resolved.filter(Boolean).length, total: items.length };
};
```

### Replace `hitSummary`

```js
// Before:
const hitSummary = (type) => {
  const items = lockedCandidatesForType(type);
  if (!items.length) return null;
  const resolved = items
    .map(item => boardOutcome(type, item))
    .filter(v => v !== null);
  if (!resolved.length) return null;
  return {
    hits: resolved.filter(Boolean).length,
    total: items.length,
  };
};

// After:
const hitSummary = (type) =>
  summarizeOutcomes(lockedCandidatesForType(type), item => boardOutcome(type, item));
```

### Replace `gameHitSummary`

```js
// Before:
const gameHitSummary = (type, items) => {
  if (!items.length) return null;
  const resolved = items
    .map(item => gameBoardOutcome(type, item))
    .filter(v => v !== null);
  return {
    hits: resolved.filter(Boolean).length,
    total: items.length,
  };
};

// After:
const gameHitSummary = (type, items) =>
  summarizeOutcomes(items, item => gameBoardOutcome(type, item));
```

**Behavioral note:** The old `gameHitSummary` returned `{ hits: 0, total: N }` when items existed but none were resolved yet (no games final). The new version returns `null` in that case — consistent with `hitSummary`. This is the correct behavior: game board hit badges should show nothing until at least one game has resolved, not "0/N" which falsely implies all picks missed.

---

## Checklist

- [ ] `renderEdgeCard` `cardStyle` uses `resultBorderStyle(resultBorderColor)` + separate `borderColor` override
- [ ] `resultBorderColor` intermediate variable kept (still needed for `borderColor`)
- [ ] `summarizeOutcomes(items, outcomeFn)` helper added before `hitSummary`
- [ ] `hitSummary` replaced with single-line wrapper using `summarizeOutcomes`
- [ ] `gameHitSummary` replaced with single-line wrapper using `summarizeOutcomes`
- [ ] `tabHitSummary` and `gameSubtabHitSummary` call sites unchanged (they call `hitSummary`/`gameHitSummary` which now delegate to the helper)
- [ ] No other logic changes

---

## After Completing

Reply "Task 127 complete" with a brief summary.
