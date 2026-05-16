# CODEX TASK 119 — Top-20 Filter Toggle for Hits and HR Board Tabs

## Goal

Add a **"Top 20"** toggle chip to the Hits and HR board tabs that limits the displayed card list to the top 20 ranked candidates. The toggle sits inline with the sub-header rank label. When active, only cards with rank ≤ 20 are shown. The filter applies to both live and locked candidates.

**Files changed:** `prop-scout-v7.jsx` only. No backend changes.

---

## Part 1 — New State Variable

Add a single new state variable near the other board-related state (around line 3658 where `boardTab` is defined):

```js
const [boardTop20, setBoardTop20] = useState(false);
```

Reset it to `false` whenever `boardTab` changes so switching from Hits → K doesn't carry the filter over:

```js
// Add boardTop20 reset inside the existing boardTab onChange handler,
// OR add a useEffect:
useEffect(() => {
  setBoardTop20(false);
}, [boardTab]);
```

---

## Part 2 — Apply the Filter to the Rendered Card List

The board renders two candidate lists that need to be filtered:

1. **`lockedBoardCandidatesForTab`** — locked candidates (around line 9635)
2. **`liveBoardCandidates`** — live (pre-lock) candidates (around line 9526)

The cards are already ranked by their position in these arrays (index 0 = rank 1). So "top 20" simply means slicing to the first 20 items.

Find where `lockedBoardCandidatesForTab` is used for rendering (it feeds the card list loop) and where `liveBoardCandidates` feeds the live card loop. Apply the filter at render time only — do NOT mutate the underlying arrays.

The filter should only apply on `boardTab === "hits"` or `boardTab === "hr"`. K and Outs tabs are unaffected.

```js
// At render time, when boardTop20 is true and tab is hits or hr:
const shouldApplyTop20 = boardTop20 && (boardTab === "hits" || boardTab === "hr");

const displayLockedCandidates = shouldApplyTop20
  ? lockedBoardCandidatesForTab.slice(0, 20)
  : lockedBoardCandidatesForTab;

const displayLiveCandidates = shouldApplyTop20
  ? liveBoardCandidates.slice(0, 20)
  : liveBoardCandidates;
```

Replace `lockedBoardCandidatesForTab` and `liveBoardCandidates` with `displayLockedCandidates` and `displayLiveCandidates` in the card render loops only (not in any logic that counts, computes, or snapshots candidates — those should always use the full arrays).

---

## Part 3 — Toggle Chip in the Sub-Header

Find the sub-header row (around line 9853–9878). It currently has a rank label on the left and a live/locked count on the right:

```
| Ranked by avg · recent form · park · matchup    75/389 live · 130 locked |
```

Add the toggle chip between the rank label and the count — but **only render it when `boardTab === "hits"` or `boardTab === "hr"`**.

The chip should look consistent with the existing board UI style:

```jsx
{(boardTab === "hits" || boardTab === "hr") && (
  <button
    onClick={() => setBoardTop20(v => !v)}
    style={{
      background:   boardTop20 ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.04)",
      border:       `1px solid ${boardTop20 ? "#fbbf24" : "#1f2437"}`,
      borderRadius: 6,
      padding:      "3px 9px",
      fontSize:     9,
      fontWeight:   700,
      color:        boardTop20 ? "#fbbf24" : "#6b7280",
      fontFamily:   "monospace",
      cursor:       "pointer",
      flexShrink:   0,
    }}
  >
    TOP 20
  </button>
)}
```

Place it inside the existing `display: "flex", justifyContent: "space-between"` sub-header div, between the rank label span and the count span. The flex layout will push everything into place naturally.

---

## Checklist

- [ ] `boardTop20` state added
- [ ] `boardTop20` resets to `false` when `boardTab` changes
- [ ] `displayLockedCandidates` and `displayLiveCandidates` computed at render time with slice
- [ ] Card render loops use the display arrays (not the originals)
- [ ] All other logic (counts, snapshots, summary hydration) still uses full arrays
- [ ] TOP 20 chip renders only on Hits and HR tabs
- [ ] Chip style matches existing board UI (monospace, border, amber when active)
- [ ] K and Outs tabs completely unaffected

---

## After Completing

Reply "Task 119 complete" with a brief summary of the changes.
