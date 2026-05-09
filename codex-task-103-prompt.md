# CODEX TASK 103 — Predictive Lane Phase 3: Calibration Panel

## File to modify

`prop-scout-v7.jsx` only.

## Read before starting

Read **TASK 55**, **CODEX TASK 101**, and **CODEX TASK 102** in `AGENT_SYSTEM_PROMPT.md` for architecture context. This task adds a calibration panel inside the existing Predict IIFE — no new views, no new state.

## What gets built

A "Model Calibration" section at the bottom of the Predict view. It groups every graded play in `lockedAiBoardSnapshot` into four `simConfidence` buckets (55–64%, 65–74%, 75–84%, 85%+) and shows actual hit rate vs. expected for each. Answers the question: when the model says 70% confidence, does it actually hit 70% of the time?

---

## Changes — in order

### 1 — Add calibration data computation inside the Predict IIFE (~line 11791, after `lockedPlays`, before `renderEdgeCard`)

```js
const BUCKETS = [
  { label: "55–64%", min: 55, max: 64, mid: 59.5 },
  { label: "65–74%", min: 65, max: 74, mid: 69.5 },
  { label: "75–84%", min: 75, max: 84, mid: 79.5 },
  { label: "85%+",   min: 85, max: 100, mid: 90   },
];

const calibrationBuckets = BUCKETS.map(b => {
  const inBucket = (lockedAiBoardSnapshot ?? []).filter(c =>
    c.simConfidence != null &&
    c.simConfidence >= b.min &&
    c.simConfidence <= b.max
  );
  let hits = 0, total = 0;
  for (const c of inBucket) {
    const grade = gradeCandidate(c);
    if (grade === true)  { hits++; total++; }
    if (grade === false) { total++; }
  }
  const actualRate = total > 0 ? hits / total : null;
  return { ...b, hits, total, actualRate };
});
```

---

### 2 — Add calibration JSX section inside the Predict IIFE's `return (...)` (~line 11906, after the locked plays section, before the closing `</div>`)

```jsx
{/* Calibration panel */}
{calibrationBuckets.some(b => b.total > 0) && (
  <div style={{ marginTop: 28, borderTop: "1px solid #1f2437", paddingTop: 16 }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", fontFamily: "monospace", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>
      Model Calibration
    </div>
    {calibrationBuckets.map(b => {
      if (b.total === 0) return null;
      const expectedPct = Math.round(b.mid);
      const actualPct   = b.actualRate != null ? Math.round(b.actualRate * 100) : null;
      const diff        = actualPct != null ? actualPct - expectedPct : null;
      const barColor    = diff == null ? "#4b5563"
        : diff >= -5  ? "#22c55e"
        : diff >= -15 ? "#fbbf24"
        : "#ef4444";
      return (
        <div key={b.label} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", fontFamily: "monospace" }}>{b.label}</span>
            <span style={{ fontSize: 10, fontFamily: "monospace", color: "#6b7280" }}>
              {b.hits}/{b.total}
              {actualPct != null && (
                <span style={{ marginLeft: 6, color: barColor, fontWeight: 700 }}>{actualPct}%</span>
              )}
              <span style={{ marginLeft: 4, color: "#4b5563" }}>vs {expectedPct}% exp</span>
            </span>
          </div>
          <div style={{ position: "relative", height: 6, background: "#1f2437", borderRadius: 3 }}>
            {actualPct != null && (
              <div style={{ width: `${Math.min(actualPct, 100)}%`, height: "100%", background: barColor, borderRadius: 3, transition: "width 0.3s" }} />
            )}
            <div style={{ position: "absolute", top: -2, left: `${Math.min(expectedPct, 100)}%`, width: 2, height: 10, background: "#4b5563", borderRadius: 1, transform: "translateX(-50%)" }} />
          </div>
        </div>
      );
    })}
    <div style={{ fontSize: 9, color: "#4b5563", marginTop: 10, fontFamily: "monospace" }}>
      Based on {calibrationBuckets.reduce((sum, b) => sum + b.total, 0)} graded plays · today&apos;s locked snapshot
    </div>
  </div>
)}
```

---

## What does NOT change

- Edge card layout, `predictSettled`, `gradeCandidate`, `renderEdgeCard` — all unchanged.
- No new state variables.
- No backend changes.
- AI Board tab — unchanged.

---

## Notes

- `gradeCandidate` is already defined earlier in the same Predict IIFE — call it directly.
- `lockedAiBoardSnapshot` is already in scope.
- Bar color logic: green if actual is within 5pts of expected, yellow if 6–15pts below, red if >15pts below.
- The expected marker (grey vertical tick) sits at the midpoint of the bucket on the progress bar.
- Panel is hidden entirely when no plays have resolved — `calibrationBuckets.some(b => b.total > 0)`.

---

## Validation checklist

1. No JS errors on load.
2. Predict tab renders identically when no plays are graded (calibration panel hidden).
3. After plays resolve, "Model Calibration" section appears at the bottom of Predict.
4. Each bucket row shows: label | hits/total | actual% (colored) | vs X% exp.
5. Progress bar fills to actual%, grey tick sits at expected%.
6. Green bar when actual ≥ expected − 5, yellow when 6–15pts below, red when >15pts below.
7. Footer shows correct total graded play count.
8. Buckets with zero graded plays are hidden (return null).
9. AI Board tab and edge cards unchanged.

## After completing

Reply "Task 103 complete" with a brief summary. This completes the Predictive Lane (Phases 1–3).
