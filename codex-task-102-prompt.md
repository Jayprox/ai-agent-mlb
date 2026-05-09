# CODEX TASK 102 — Predictive Lane Phase 2: The Predict Tab

## File to modify

`prop-scout-v7.jsx` only.

## Read before starting

Read **TASK 55** and **CODEX TASK 101** in `AGENT_SYSTEM_PROMPT.md` for the full architecture context. Phase 1 (CODEX TASK 101) already added `edge`, `impliedProb`, `bookOdds`, `lean`, `gamePk`, and `gameTime` to every AI Board candidate. This task builds the Predict tab that surfaces those fields.

## What gets built

A new `view === "predict"` tab gated behind `isScoutUser`. It reads from `aiBoardData`, filters to candidates where `edge >= 0.08` (8 percentage points), sorts by edge descending, and displays them in two sections: upcoming games and locked/final games. Each card shows SIM %, BOOK %, and EDGE prominently — edge is the primary signal, not the AI score.

---

## Changes — in order

### 1 — Add `"predict"` to the board data pre-fetch useEffect (~line 3871)

**Current:**
```js
if (view !== "board" && view !== "model" && view !== "ai-board") return;
```
**New:**
```js
if (view !== "board" && view !== "model" && view !== "ai-board" && view !== "predict") return;
```

---

### 2 — Add `"predict"` to the AI Board data useEffect (~line 4133)

**Current:**
```js
if (view !== "ai-board" || !currentUser || !isScoutUser) return;
```
**New:**
```js
if ((view !== "ai-board" && view !== "predict") || !currentUser || !isScoutUser) return;
```

This ensures `aiBoardData` loads when the user opens Predict directly without having visited AI Board first.

---

### 3 — Add "Predict" nav button (~line 6122, after the AI Board button)

Inside the `isScoutUser` block, add after the AI Board button:

```jsx
{isScoutUser && (
  <button
    onClick={() => setView("predict")}
    style={{
      background: view === "predict" ? "#fbbf24" : "#161827",
      border: `1px solid ${view === "predict" ? "#fbbf24" : "#1f2437"}`,
      borderRadius: 8,
      padding: isNarrowPhone ? "6px 10px" : "6px 12px",
      fontSize: isNarrowPhone ? 9 : 10,
      color: view === "predict" ? "#000" : "#9ca3af",
      fontFamily: "monospace",
      fontWeight: 700,
      cursor: "pointer",
      textTransform: "uppercase",
    }}
  >
    ⚡ Predict
  </button>
)}
```

---

### 4 — Add the Predict view block (~line 11706, after the AI Board IIFE closing tag)

```jsx
{/* ══════════════════════════════════════
    PREDICT VIEW
══════════════════════════════════════ */}
{view === "predict" && isScoutUser && (() => {
  const MIN_EDGE = 0.08;

  const MARKET_META = {
    k:    { label: "K Prop", color: "#38bdf8" },
    outs: { label: "Outs",   color: "#a78bfa" },
    hr:   { label: "HR",     color: "#fb923c" },
    hits: { label: "Hits",   color: "#34d399" },
    f5ml: { label: "F5 ML",  color: "#fbbf24" },
  };

  // Grade function — mirrors getAiBoardGrade in the AI Board IIFE
  const gradeCandidate = (c) => {
    const todayResult = liveBoardResults[c.entityId ?? c.id] ?? null;
    if (c.market === "k" || c.market === "outs") {
      const hasResolvedResult = !!todayResult && !todayResult.live;
      const propLineValue = c.bookLine;
      const boardLean = c.lean;
      if (!hasResolvedResult || propLineValue == null) return null;
      return c.market === "k"
        ? (boardLean === "UNDER" ? todayResult.k < propLineValue : todayResult.k > propLineValue)
        : (boardLean === "UNDER" ? todayResult.outs < propLineValue : todayResult.outs > propLineValue);
    }
    const boardGameStatus = getBoardGameStatus(c.gamePk);
    const hasResult = todayResult && todayResult.ab > 0;
    if (c.market === "hr") {
      if (boardGameStatus !== "FINAL") return null;
      return hasResult ? todayResult.hr > 0 : false;
    }
    if (c.market === "hits") {
      if (boardGameStatus !== "FINAL") return null;
      if (!todayResult || typeof todayResult.h !== "number") return null;
      return todayResult.h > 0;
    }
    if (c.market === "f5ml") {
      const box = liveBoxscores[c.gamePk] ?? liveBoxscores[c.entityId];
      if (!box?.isFinal) return null;
      const innings = box.linescore?.innings ?? [];
      if (innings.length < 5) return null;
      const f5Away = innings.slice(0, 5).reduce((sum, inn) => sum + (inn?.away ?? 0), 0);
      const f5Home = innings.slice(0, 5).reduce((sum, inn) => sum + (inn?.home ?? 0), 0);
      if (f5Away === f5Home) return null;
      return c.lean === "HOME" ? f5Home > f5Away : f5Away > f5Home;
    }
    return null;
  };

  // Survivorship-bias-free hit counter using locked snapshot
  const predictSettled = (lockedAiBoardSnapshot ?? aiBoardData ?? [])
    .filter(c => c.edge != null && c.edge >= MIN_EDGE)
    .reduce((acc, c) => {
      const grade = gradeCandidate(c);
      if (grade === true)  { acc.hits++; acc.graded++; }
      if (grade === false) { acc.graded++; }
      return acc;
    }, { hits: 0, graded: 0 });

  // Filter + sort all edge plays
  const allEdgePlays = (aiBoardData ?? [])
    .filter(c => c.edge != null && c.edge >= MIN_EDGE)
    .sort((a, b) => b.edge - a.edge);

  // Split into upcoming vs locked/final
  const upcomingPlays = allEdgePlays.filter(c => getBoardGamePhase(c.gamePk) === "upcoming");
  const lockedPlays   = allEdgePlays.filter(c => getBoardGamePhase(c.gamePk) !== "upcoming");

  const renderEdgeCard = (c, i) => {
    const meta  = MARKET_META[c.market] ?? { label: c.market, color: "#6b7280" };
    const grade = gradeCandidate(c);
    const edgePts = Math.round(c.edge * 100);
    const edgeColor = edgePts >= 15 ? "#22c55e" : "#fbbf24";
    const simPct    = c.simConfidence != null ? `${c.simConfidence}%` : "—";
    const bookPct   = c.impliedProb  != null ? `${Math.round(c.impliedProb * 100)}%` : "—";
    const resultBorderColor = grade === true ? "#22c55e" : grade === false ? "#ef4444" : null;
    const cardStyle = resultBorderColor
      ? { borderLeft: `3px solid ${resultBorderColor}`, borderColor: resultBorderColor, paddingLeft: 10 }
      : {};

    return (
      <Card key={c.id} style={{ marginBottom: 8, padding: "10px 12px", ...cardStyle }}>
        {/* Name / market row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
          {c.market === "f5ml" ? (
            <span style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb" }}>{c.gameLabel}</span>
          ) : (
            <>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb" }}>{c.playerName ?? c.name}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#000", background: "#374151", borderRadius: 4, padding: "1px 5px" }}>{c.team}</span>
            </>
          )}
          <span style={{ fontSize: 8, fontWeight: 700, color: meta.color, background: `${meta.color}18`, border: `1px solid ${meta.color}40`, borderRadius: 4, padding: "1px 6px", fontFamily: "monospace" }}>{meta.label}</span>
          {grade === true  && <span style={{ fontSize: 8, fontWeight: 800, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 4, padding: "1px 6px" }}>✓ HIT</span>}
          {grade === false && <span style={{ fontSize: 8, fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 4, padding: "1px 6px" }}>✗ MISS</span>}
        </div>

        {/* Lean + book line */}
        <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 6, fontFamily: "monospace" }}>
          {c.lean} {c.bookLine != null ? c.bookLine : "—"}
          {c.bookOdds != null && <span style={{ color: "#6b7280", marginLeft: 4 }}>({c.bookOdds > 0 ? "+" : ""}{c.bookOdds})</span>}
        </div>

        {/* Edge row — the primary signal */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: c.aiReason ? 6 : 0 }}>
          <div style={{ background: "#141726", border: "1px solid #1f2437", borderRadius: 6, padding: "4px 8px", textAlign: "center", minWidth: 50 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", fontFamily: "monospace" }}>{simPct}</div>
            <div style={{ fontSize: 7, color: "#4b5563", letterSpacing: "0.06em" }}>SIM</div>
          </div>
          <div style={{ color: "#4b5563", fontSize: 10, fontWeight: 700 }}>vs</div>
          <div style={{ background: "#141726", border: "1px solid #1f2437", borderRadius: 6, padding: "4px 8px", textAlign: "center", minWidth: 50 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", fontFamily: "monospace" }}>{bookPct}</div>
            <div style={{ fontSize: 7, color: "#4b5563", letterSpacing: "0.06em" }}>BOOK</div>
          </div>
          <div style={{ background: `${edgeColor}14`, border: `1px solid ${edgeColor}40`, borderRadius: 6, padding: "4px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: edgeColor, fontFamily: "monospace" }}>+{edgePts}pts</div>
            <div style={{ fontSize: 7, color: edgeColor, opacity: 0.7, letterSpacing: "0.06em" }}>EDGE</div>
          </div>
        </div>

        {/* AI reason */}
        {c.aiReason && (
          <div style={{ fontSize: 10, color: "#d1d5db", fontStyle: "italic", lineHeight: 1.4, marginTop: 4 }}>{c.aiReason}</div>
        )}
      </Card>
    );
  };

  return (
    <div style={{ padding: "12px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>⚡ PREDICT</span>
            {predictSettled.graded > 0 && (
              <span style={{ fontSize: 8, fontWeight: 800, color: "#22c55e", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 999, padding: "2px 7px", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                {predictSettled.hits}/{predictSettled.graded} hit
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>Edge plays — model probability exceeds book implied · sorted by edge</div>
        </div>
      </div>

      {/* Loading state */}
      {aiBoardLoading && (
        <div style={{ textAlign: "center", padding: 48, color: "#6b7280", fontSize: 11 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⚡</div>
          Loading edge plays…
        </div>
      )}

      {/* No AI data yet */}
      {!aiBoardLoading && !aiBoardData && (
        <div style={{ textAlign: "center", padding: 40, color: "#6b7280", fontSize: 11 }}>
          Preparing candidates… open AI Board first if this persists.
        </div>
      )}

      {/* No edge plays */}
      {!aiBoardLoading && aiBoardData && allEdgePlays.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#6b7280", fontSize: 11 }}>
          No edge plays yet. Edge plays appear when the model's probability is ≥8pts above the book's implied probability.
        </div>
      )}

      {/* Upcoming plays */}
      {upcomingPlays.length > 0 && (
        <div style={{ marginBottom: lockedPlays.length > 0 ? 20 : 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", fontFamily: "monospace", letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 2px 8px" }}>
            Upcoming · {upcomingPlays.length} play{upcomingPlays.length !== 1 ? "s" : ""}
          </div>
          {upcomingPlays.map((c, i) => renderEdgeCard(c, i))}
        </div>
      )}

      {/* Locked / in-play / final */}
      {lockedPlays.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", fontFamily: "monospace", letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 2px 8px", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#a855f7" }}>⊘</span> Locked · in play / final
          </div>
          {lockedPlays.map((c, i) => {
            const phase = getBoardGamePhase(c.gamePk);
            return (
              <div key={c.id} style={{ opacity: phase === "final" ? 0.85 : 1 }}>
                {renderEdgeCard(c, i)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
})()}
```

---

## What does NOT change

- The AI Board tab — unchanged, still shows all candidates ranked by AI score.
- `lockedAiBoardSnapshot`, `aiBoardSettled`, `aiBoardTabHitSummary` inside the AI Board IIFE — all unchanged.
- No backend changes.
- No new state variables needed.

---

## Notes

- `getBoardGamePhase` and `getBoardGameStatus` are already defined earlier in the file — use them directly.
- `liveBoardResults`, `liveBoxscores`, `lockedAiBoardSnapshot`, `aiBoardData`, `aiBoardLoading` are all already in scope.
- `Card` is the existing card component — use it exactly as the AI Board does.
- The `gradeCandidate` function inside the Predict IIFE is a duplicate of `getAiBoardGrade` in the AI Board IIFE — this is intentional to avoid refactoring the shared IIFE scope. They are identical in logic.

---

## Validation checklist

1. No JS errors on load.
2. "⚡ Predict" nav button appears for scout users, hidden for others.
3. Navigating to Predict triggers `aiBoardData` to load (same as AI Board).
4. Cards appear sorted by edge descending — highest edge play at the top.
5. Each card shows SIM %, BOOK %, and EDGE pts correctly.
6. A play with `edge: 0.20`, `simConfidence: 72`, `impliedProb: 0.52` displays: SIM 72% / BOOK 52% / +20pts.
7. Plays with `edge < 0.08` do not appear.
8. Upcoming plays in top section; in-progress/final in locked section below.
9. Hit counter in header counts correctly from `lockedAiBoardSnapshot`.
10. AI Board tab unchanged — no visual regression.

## After completing

Reply "Task 102 complete" with a brief summary. User will review before proceeding to Phase 3 (Calibration panel).
