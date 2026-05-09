# CODEX TASK 101 — Predictive Lane Phase 1: Edge Data on AI Board Candidates

## File to modify

`prop-scout-v7.jsx` only.

## Read before starting

Read **TASK 55** and **CODEX TASK 101** in `AGENT_SYSTEM_PROMPT.md` for full context.

## What this task does

Adds `lean`, `bookOdds`, `impliedProb`, and `edge` to every AI Board candidate object. This is pure data plumbing — no new UI. Phase 2 (the Predict tab) will filter and display these fields.

- **`impliedProb`**: the sportsbook's vig-stripped probability for the lean side
- **`edge`**: `simConfidence / 100 − impliedProb` — positive means the model is more confident than the book
- **`bookOdds`**: the American odds integer at the best available book (DK > FD > CZR > MGM)
- **`lean`**: "OVER"/"UNDER" for prop markets, "HOME"/"AWAY" for F5 ML

`mlToImplied` already exists in the file (~line 2500). Two new helpers needed: `vigStrip` and `propEdgeData`.

---

## Changes — in order

### 1 — Add `vigStrip` helper (~line 2505, after `mlToImplied`)

```js
const vigStrip = (leanRaw, oppRaw) => {
  const total = leanRaw + oppRaw;
  return total > 0 ? leanRaw / total : leanRaw;
};
```

---

### 2 — Add `propEdgeData` helper (~line 2507, after `vigStrip`)

```js
function propEdgeData(propLine, lean) {
  const BOOK_PREF = ["DK", "FD", "CZR", "MGM"];
  for (const bk of BOOK_PREF) {
    const entry = propLine?.books?.[bk];
    if (!entry) continue;
    const leanOddsStr = lean === "OVER" ? entry.overOdds : entry.underOdds;
    if (!leanOddsStr) continue;
    const leanRaw  = mlToImplied(leanOddsStr);
    const oppOddsStr = lean === "OVER" ? entry.underOdds : entry.overOdds;
    const impliedProb = oppOddsStr
      ? vigStrip(leanRaw, mlToImplied(oppOddsStr))
      : leanRaw;
    return { bookOdds: parseInt(leanOddsStr, 10), impliedProb };
  }
  return { bookOdds: null, impliedProb: null };
}
```

---

### 3 — Update `mapCandidate` inside `buildAiBoardPayload` (~line 2436)

**After the `bookLine` line, add:**
```js
const lean = c.score >= 55 ? "OVER" : "UNDER";
const { bookOdds, impliedProb } = propEdgeData(c._candidate?.propLine ?? null, lean);
const edge = (c.simConfidence != null && impliedProb != null)
  ? Math.round((c.simConfidence / 100 - impliedProb) * 100) / 100
  : null;
```

**Update the return object** to include the new fields plus `gamePk` and `gameTime` (missing today):
```js
return {
  id: `${market}:${c.id}:${c.gamePk}`,
  entityId: c.id,
  market,
  playerName: c.name,
  team: c.team,
  gameLabel: c.gameLabel,
  gamePk:   c._candidate?.gamePk   ?? null,   // newly added
  gameTime: c._candidate?.gameTime ?? null,   // newly added
  score: c.score,
  simConfidence: c.simConfidence,
  bookLine,
  lean,         // newly added
  bookOdds,     // newly added
  impliedProb,  // newly added
  edge,         // newly added
  stats,
  _candidate: c,
};
```

---

### 4 — Rewrite `mapGameCandidate` inside `buildAiBoardPayload` (~line 2463)

Extract `simF5MLConfidence` into a variable (so it's computed once, not twice), then compute edge from `liveOddsMap`:

```js
const mapGameCandidate = (g, market) => {
  const simConf = simF5MLConfidence(g.homeEra, g.awayEra, g.parkFactor, g.umpireRating, g.lean);

  const f5Key   = `${g.away.name}|${g.home.name}`;
  const f5Odds  = liveOddsMap?.[f5Key];
  const leanMl  = g.lean === "HOME" ? (f5Odds?.homeML ?? null) : (f5Odds?.awayML ?? null);
  const oppMl   = g.lean === "HOME" ? (f5Odds?.awayML ?? null) : (f5Odds?.homeML ?? null);
  const leanRaw = leanMl ? mlToImplied(leanMl) : null;
  const oppRaw  = oppMl  ? mlToImplied(oppMl)  : null;
  const f5Implied = (leanRaw != null && oppRaw != null)
    ? vigStrip(leanRaw, oppRaw)
    : leanRaw;
  const f5Edge = (simConf != null && f5Implied != null)
    ? Math.round((simConf / 100 - f5Implied) * 100) / 100
    : null;

  return {
    id:            `${market}:${g.gamePk}`,
    entityId:      g.gamePk,
    market,
    playerName:    null,
    name:          g.gameLabel,
    team:          null,
    gameLabel:     g.gameLabel,
    gamePk:        g.gamePk,
    gameTime:      g.gameTime ?? null,
    score:         g.score,
    simConfidence: simConf,
    bookLine:      g.line ?? null,
    lean:          g.lean,
    leanAbbr:      g.leanAbbr,
    leanLabel:     g.leanLabel,
    bookOdds:      leanMl ? parseInt(leanMl, 10) : null,
    impliedProb:   f5Implied,
    edge:          f5Edge,
    stats: {
      homeSP:    g.homeSP?.name ?? null,
      homeEra:   g.homeEra ?? null,
      awaySP:    g.awaySP?.name ?? null,
      umpire:    g.factors?.find(f => f.label === "Umpire Tendency")?.value ?? null,
      topFactor: g.factors?.[0]?.detail ?? null,
    },
    factors:    g.factors ?? [],
    _candidate: g,
  };
};
```

---

## What does NOT change

- AI Board card render — new fields are additive, zero visual change
- `getAiBoardGrade`, `aiBoardSettled`, `aiBoardTabHitSummary`
- The AI Board useEffect and Anthropic API call
- All other views, routes, and backend files

---

## Validation checklist

1. No JS errors on load.
2. AI Board loads and cards display identically to before.
3. In React DevTools (or via a console log), inspect an AI Board candidate object:
   - Prop market (K/Outs/HR/Hits): has `lean: "OVER"` or `"UNDER"`, `bookOdds` (e.g., `-110`), `impliedProb` (~0.52), `edge` (float, positive or negative)
   - F5 ML candidate: has `lean: "HOME"` or `"AWAY"`, `bookOdds`, `impliedProb`, `edge`
4. A candidate with no book odds available has `bookOdds: null`, `impliedProb: null`, `edge: null`.
5. No regression on any tab or view.

## After completing

Reply "Task 101 complete" with a brief summary. User will review before proceeding to Phase 2 (the Predict tab).
