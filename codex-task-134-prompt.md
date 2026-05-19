# CODEX TASK 134 — Backtesting Phase 3: Board History Replay

## Goal

When the user navigates to a past date in Research Mode, the Board tab should load the frozen card snapshots for that date from the DB — with real HIT/MISS result badges — instead of re-scoring live data against the historical schedule.

Today, changing `slateDate` causes the schedule to reload but the board still runs the live scoring models on that past schedule, producing synthetic scores that don't match what was actually shown on that day. This task wires `GET /api/board-snapshot/:date` into the board view to show real historical data.

---

## Background: What Already Exists

### Frontend state (prop-scout-v7.jsx)

```js
const [slateDate, setSlateDate] = useState(null);        // null = today; "YYYY-MM-DD" = past date
const [researchMode, setResearchMode] = useState(false); // unlocked via 7 logo-clicks
const [lockedBoardCandidates, setLockedBoardCandidates] = useState(...); // today's locked cards from localStorage
```

`slateDate !== null` means the user is viewing a past date. The Research Mode date picker (lines ~5026–5053) sets `slateDate` when navigating.

### Backend endpoint (already built)

`GET /api/board-snapshot/:date` returns:
```json
{
  "hits": [ { "id": "592450", "name": "Aaron Judge", "market": "hits", "lean": "over", "score": 74, "scoreTier": "mid", "bookLine": 0.5, "lockedAt": "...", "resultHit": true, "actualStat": 2, "resolvedAt": "...", "card_data": { ...full card object } } ],
  "hr":   [...],
  "k":    [...],
  "outs": [...]
}
```

Cards with `resultHit: true` = HIT, `resultHit: false` = MISS, `resultHit: null` = unresolved (game didn't finish or resolution job hasn't run).

### Board render path (prop-scout-v7.jsx, line ~8325)

The board IIFE builds `liveBoardCandidates` (upcoming games) and `lockedCandidatesByGame` (locked games) and renders them in two sections — a live section at top and a locked "⊘ Locked · in play / final" section below. Cards are rendered via `renderBoardCandidateCard(c, i)` which dispatches to `<PitcherBoardCard>` or `<BatterBoardCard>`.

Result badges are driven by `liveBoardResults` state (`playerId → { h, hr, ab, live }`), which is populated by polling the live boxscore.

---

## What To Build

### 1. New state variable

```js
const [historicalSnapshot, setHistoricalSnapshot] = useState(null);
// null = not loaded; { date, hits, hr, k, outs } = loaded past snapshot
```

### 2. useEffect: fetch snapshot when slateDate is a past date and view is "board"

```js
useEffect(() => {
  if (!slateDate || view !== "board") {
    setHistoricalSnapshot(null);
    return;
  }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
  if (slateDate >= today) {
    setHistoricalSnapshot(null); // today or future — use live board
    return;
  }
  // Past date — fetch frozen snapshot
  setHistoricalSnapshot(null); // clear while loading
  fetch(`${API_BASE}/api/board-snapshot/${slateDate}`, authHeaders())
    .then(r => r.json())
    .then(data => {
      setHistoricalSnapshot({ date: slateDate, ...data });
    })
    .catch(() => {
      setHistoricalSnapshot({ date: slateDate, hits: [], hr: [], k: [], outs: [] });
    });
}, [slateDate, view]);
```

### 3. Board render — branch on historicalSnapshot

At the top of the `{view === "board" && (() => { ... })()}` block (around line 8325), add a branch:

**If `historicalSnapshot !== null` (past date):**

- Skip all live scoring (`computeBatterBoard`, `computePitcherBoard`, `lockedBoardCandidates`)
- Use `historicalSnapshot[boardTab] ?? []` as the card list (only valid for `hr | hits | k | outs` tabs; show "No data" for `games` tab)
- The `resultHit` field on each card directly drives the result badge — no need for `liveBoardResults`
- `getBoardGamePhase` returns `"final"` for all cards (whole day is over)
- `getBoardGameStatus` returns `"FINAL"` for all cards
- Show a single flat list, no live/locked split — all games are final

**Result badge mapping** (inside the card renderer, or pass as a prop):
```js
// For historical cards, gradeResult = resultHit (boolean | null)
// Pass directly to renderBoardCandidateCard as gradeResult override
const gradeResult = card.resultHit; // true | false | null
```

### 4. Historical board header

Replace the "Board" view header when in historical mode to show:
```
📅 History — 2026-05-14    [HR] [Hits] [K] [Outs]
  No data available for "Games" tab in history
```

Add a summary hit-rate line above the cards (when snapshot has resolved cards):
```
HR: 4/7 hit (57%)  ·  Hits: 11/18 hit (61%)  ·  K: 6/9 hit (67%)  ·  Outs: 3/5 hit (60%)
```

Only count cards where `resultHit !== null` in the denominator.

### 5. Loading state

While fetching the snapshot (before the fetch resolves), show:
```
Loading snapshot for 2026-05-14…
```
with a spinner — same spinner style used elsewhere in the app.

### 6. Empty state

If the snapshot for that date has no cards (the date predates board-snapshot persistence, or no games ran), show:
```
No board snapshot found for 2026-05-14.
Snapshots are saved starting from the date this feature was deployed.
```

### 7. Card rendering for historical cards

`renderBoardCandidateCard` passes `todayResult` to the board card components. For historical mode, replace this with a direct result prop approach:

- `boardGameStatus` = `"FINAL"` for all historical cards
- `todayResult` = derive from the card's `actualStat` and `resultHit`:
  - For `k` market: `{ k: card.actualStat, live: false }` (if resolved), else `null`
  - For `outs` market: convert outs → IP for display, or just pass `{ outs: card.actualStat, live: false }`
  - For `hits` market: `{ h: card.actualStat, hr: 0, ab: 3, live: false }` (approximate)
  - For `hr` market: `{ hr: card.actualStat, h: card.actualStat > 0 ? 1 : 0, ab: 4, live: false }`

---

## Files to Modify

**`prop-scout-v7.jsx`**:
- Add `historicalSnapshot` state (near line 2466)
- Add useEffect to fetch on slateDate/view change
- Add historical branch at top of board IIFE (line ~8325)
- Historical card list renderer (replaces live/locked two-section layout)
- Historical header with hit-rate summary
- Loading and empty states

**No backend changes needed** — `GET /api/board-snapshot/:date` already exists and returns the right shape.

---

## What NOT to Change

- The live board behavior (today's date) must be completely unchanged
- `lockedBoardCandidates` localStorage snapshot is untouched
- The Research Mode date picker UI is untouched — this task only affects the Board view, not Slate
- The `games` sub-tab is not supported in history mode (board_card_snapshots only stores `k | hits | hr | outs`)

---

## Checklist

- [ ] `historicalSnapshot` state added
- [ ] useEffect fetches past-date snapshots when `view === "board"` and `slateDate < today`
- [ ] Historical branch in board IIFE — uses snapshot data, not live scoring
- [ ] Loading spinner shown while fetch is in-flight
- [ ] Empty state shown when snapshot returns no cards
- [ ] Historical header shows "📅 History — YYYY-MM-DD"
- [ ] Hit-rate summary line shown above cards (resolved cards only)
- [ ] All cards show FINAL status and correct HIT/MISS badges from `resultHit`
- [ ] `games` tab shows "No history available" in history mode
- [ ] Live board (today) is completely unaffected
- [ ] `npm run build` passes

---

## After Completing

Reply "Task 134 complete" and describe what the history board looks like when navigating to a past date.
