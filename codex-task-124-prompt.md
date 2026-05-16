# CODEX TASK 124 — Line Value / EV Context on Prop Board Cards

## Goal

The HR and Hits prop board currently ranks players by model score (0–95). A professional bettor immediately asks: **"but at what price?"** A player scoring 72 at DK -200 has no edge. The same player at +115 is a strong play. Without odds context the ranking conflates player quality with betting value.

Add an **EV (Expected Value) badge** to HR and Hits board cards that compares the model's implied win probability against what the sportsbook is pricing. This gives users the second layer of signal they need: not just "who is most likely to hit" but "where does the model disagree with the market enough to bet."

**Files changed:** `prop-scout-v7.jsx` only. No backend changes. No schema changes.

---

## Context

Each board candidate has a `propLine` object (or null):
```js
propLine: {
  books: {
    DK:  { line: 0.5, over: -165, under: +130 },
    FD:  { line: 0.5, over: -155, under: +120 },
    CZR: { line: 0.5, over: -160, under: +125 },
  },
  line: 0.5,   // consensus line
}
```

The model `score` (0–95) can be treated as a rough implied probability for the OVER lean (score ≥ 55 = over lean). Specifically:
- A score of 55 → ~55% confidence
- A score of 70 → ~70% confidence
- A score of 85 → ~85% confidence

The book's `over` or `under` odds can be converted to implied probability using the existing `mlToImplied(odds)` function already in the codebase.

---

## Part 1 — Compute `evEdge` Per Candidate at Render Time

In the board render section (inside the `!isGameBoard` IIFE, near where `renderBoardCandidateCard` is defined), add a helper:

```js
const computeEVEdge = (c, type) => {
  if (!c.propLine) return null;
  // Get best available over/under odds
  const books = c.propLine.books ?? {};
  const lean  = c.score >= 55 ? "over" : "under";
  // Find best odds for the model's lean direction
  const bookOdds = ["DK", "FD", "CZR", "MGM", "BET365"].map(b => {
    const entry = books[b];
    if (!entry) return null;
    return lean === "over" ? entry.over : entry.under;
  }).filter(v => v != null && Number.isFinite(Number(v)));
  if (!bookOdds.length) return null;
  // Use best (highest) odds for the lean direction
  const bestOdds = bookOdds.reduce((best, v) => (Number(v) > Number(best) ? v : best));
  const bookImplied = mlToImplied(Number(bestOdds));
  if (!bookImplied) return null;
  // Model implied: score / 100 (simple linear mapping)
  const modelImplied = c.score / 100;
  const edge = modelImplied - bookImplied; // positive = model likes it more than the book
  return { edge: Math.round(edge * 100), bestOdds, lean, bookImplied: Math.round(bookImplied * 100) };
};
```

---

## Part 2 — Display EV Badge on HR and Hits Cards

In the batter card render (the `renderBoardCandidateCard` function for `!isPitcherBoard`), after the existing `propLine` display row, add the EV badge:

```jsx
{(() => {
  const ev = computeEVEdge(c, boardTab);
  if (!ev) return null;
  const isPositive = ev.edge >= 3; // only show if edge is meaningful (≥3%)
  const isNegative = ev.edge <= -5; // flag negative value too
  if (!isPositive && !isNegative) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
      <span style={{
        fontSize: 8,
        fontWeight: 800,
        fontFamily: "monospace",
        color: isPositive ? "#22c55e" : "#ef4444",
        background: isPositive ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)",
        border: `1px solid ${isPositive ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}`,
        borderRadius: 4,
        padding: "1px 6px",
      }}>
        {isPositive ? `+${ev.edge}% EDGE` : `${ev.edge}% VALUE`}
      </span>
      <span style={{ fontSize: 8, color: "#6b7280", fontFamily: "monospace" }}>
        Model {ev.lean === "over" ? "OVER" : "UNDER"} {ev.modelImplied}% vs book {ev.bookImplied}% ({ev.bestOdds})
      </span>
    </div>
  );
})()}
```

**Only render on HR and Hits tabs** (`!isPitcherBoard && (boardTab === "hr" || boardTab === "hits")`). K and Outs already show prop lines differently and use a different lean logic.

---

## Part 3 — Sort by EV When Edge Exists

The board currently sorts strictly by score. Add a secondary sort option: **when `boardTop20` is active**, sort by EV edge instead of raw score (so the top-20 shows the best-value plays, not just the highest-scoring players).

Find where `displayLiveCandidates` and `displayLockedCandidates` are computed (around lines that apply the `slice(0, 20)`). When `boardTop20 === true` and the tab is hits or hr, apply an EV-first sort before slicing:

```js
// EV-aware sort for Top 20 mode
const evSort = (arr) => {
  if (!boardTop20 || (boardTab !== "hits" && boardTab !== "hr")) return arr;
  return [...arr].sort((a, b) => {
    const evA = computeEVEdge(a, boardTab)?.edge ?? -99;
    const evB = computeEVEdge(b, boardTab)?.edge ?? -99;
    return evB - evA; // highest edge first
  });
};

const displayLiveCandidates = shouldApplyTop20
  ? evSort(liveBoardCandidates).slice(0, 20)
  : liveBoardCandidates;

const displayLockedCandidates = shouldApplyTop20
  ? evSort(lockedBoardCandidatesForTab).slice(0, 20)
  : lockedBoardCandidatesForTab;
```

---

## Checklist

- [ ] `computeEVEdge` helper added in the board render section
- [ ] EV badge renders on HR and Hits cards when edge ≥ 3% or ≤ -5%
- [ ] Badge is green for positive edge, red for negative value
- [ ] Shows model implied %, book implied %, and best available odds
- [ ] `evSort` applied when `boardTop20` is true (sorts by EV edge, not score)
- [ ] K and Outs tabs unaffected
- [ ] Games tab unaffected
- [ ] No new state, no backend changes, no schema changes

---

## After Completing

Reply "Task 124 complete" with a brief summary.
