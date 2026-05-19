# CODEX TASK 135 — Backtesting Phase 4: Performance Dashboard

## Goal

Add a **Performance** sub-view inside Research Mode that shows historical hit-rate statistics aggregated from `board_card_snapshots`. The dashboard breaks down pick performance by market (HR / Hits / K / Outs) and score tier (HIGH / MID / LOW) over selectable date ranges (7d / 30d / All-Time).

This is a read-only analytics view — no new locking or resolution logic, just querying what's already in the DB.

---

## Background: What Already Exists

### DB table (`board_card_snapshots`)

Relevant columns for aggregation:
```
slate_date    DATE         -- the game date
market        TEXT         -- 'k' | 'hits' | 'hr' | 'outs'
lean          TEXT         -- 'over' | 'under'
score         NUMERIC      -- 0–100 model score
score_tier    TEXT         -- 'high' | 'mid' | 'low'
book_line     NUMERIC      -- locked prop line
result_hit    BOOLEAN      -- NULL = unresolved, true = HIT, false = MISS
resolved_at   TIMESTAMPTZ  -- NULL = unresolved
```

Score tier boundaries (for display labels):
- `high` → score ≥ 75 → "HIGH (75+)"
- `mid`  → score 55–74 → "MID (55–74)"
- `low`  → score < 55  → "LOW (<55)"

### Research Mode gating

Research Mode is unlocked via 7 logo-clicks. The `researchMode` state boolean already exists in `prop-scout-v7.jsx`. The Performance dashboard should only be accessible when `researchMode === true`.

### Existing routes (backend/routes/boardSnapshot.js)

- `POST /api/board-snapshot` — card persistence
- `GET /api/board-snapshot/:date` — single-date snapshot (Task 134)

No aggregation endpoint exists yet.

---

## What To Build

### 1. Backend: `GET /api/board-snapshot/stats`

Add to `backend/routes/boardSnapshot.js` **above** the `/:date` route (so Express doesn't match `"stats"` as a `:date` param).

**Query parameters:**
- `days` — integer. `7` | `30` | omitted/`0` = all-time.

**SQL query:**
```sql
SELECT
  market,
  score_tier,
  COUNT(*)                                          AS total,
  COUNT(*) FILTER (WHERE result_hit IS NOT NULL)    AS resolved,
  COUNT(*) FILTER (WHERE result_hit = true)         AS hits,
  COUNT(*) FILTER (WHERE result_hit = false)        AS misses
FROM board_card_snapshots
WHERE
  ($1::int = 0 OR slate_date >= CURRENT_DATE - ($1::int || ' days')::interval)
GROUP BY market, score_tier
ORDER BY market, score_tier
```

**Response shape:**
```json
{
  "days": 30,
  "rows": [
    { "market": "hr",   "scoreTier": "high", "total": 12, "resolved": 12, "hits": 9,  "misses": 3  },
    { "market": "hr",   "scoreTier": "mid",  "total": 22, "resolved": 20, "hits": 11, "misses": 9  },
    { "market": "hits", "scoreTier": "high", "total": 8,  "resolved": 8,  "hits": 6,  "misses": 2  },
    ...
  ]
}
```

The endpoint must handle `!isConnected()` gracefully — return `{ days: 0, rows: [] }`.

---

### 2. Frontend state

Add near the other Research Mode state variables (around line 2470):

```js
const [perfStats, setPerfStats] = useState(null);
// null = not loaded; { days, rows } = loaded

const [perfDays, setPerfDays] = useState(30);
// 7 | 30 | 0 (all-time)
```

---

### 3. useEffect: fetch stats when dashboard is visible

```js
useEffect(() => {
  if (!researchMode || view !== "research-perf") return;
  setPerfStats(null); // clear while loading
  fetch(`${API_BASE}/api/board-snapshot/stats?days=${perfDays}`, authHeaders())
    .then(r => r.json())
    .then(data => setPerfStats(data))
    .catch(() => setPerfStats({ days: perfDays, rows: [] }));
}, [researchMode, view, perfDays]);
```

`view === "research-perf"` is the new view key for this tab (see §4 below).

---

### 4. Navigation: add "Performance" tab to Research Mode

Research Mode currently has a sub-nav (or can use the existing `view` state). Add a **Performance** entry to the Research Mode nav options. When clicked: `setView("research-perf")`.

The tab label: `📊 Performance`

Location: wherever the Research Mode date-picker / nav buttons live (~line 5026–5053 in `prop-scout-v7.jsx`).

---

### 5. Performance dashboard render (`view === "research-perf"`)

Mount the entire block as a new `{view === "research-perf" && researchMode && (() => { ... })()}` IIFE at the same level as the existing view blocks.

#### 5a. Date range selector

Three pill buttons — same style as other tab-selector pills in the app:

```
[Last 7 days]  [Last 30 days]  [All Time]
```

Active pill highlighted (same activeTab style). Clicking sets `perfDays` (7 / 30 / 0).

#### 5b. Loading state

While `perfStats === null`:
```
Loading performance data…
```
(same spinner style used elsewhere)

#### 5c. Empty state

If `perfStats.rows.length === 0`:
```
No resolved picks found for this date range.
Snapshots are saved from the date board-snapshot persistence was deployed.
```

#### 5d. Stats table — one section per market

Markets to display in order: **HR · Hits · K · Outs**. Skip a market if it has zero total rows.

For each market, render:

**Market header row** (spans full width, dark background):
```
🏠 Home Runs            Total: 34   Resolved: 32   Hit Rate: 62.5%
```
(use market-specific icon: HR = 🏠, Hits = 🎯, K = 🔥, Outs = 🛑)

**Tier breakdown rows** (three rows: HIGH / MID / LOW):

| Tier | Picks | Resolved | Hits | Misses | Hit % | Bar |
|------|-------|----------|------|--------|-------|-----|
| HIGH (75+) | 12 | 12 | 9 | 3 | 75.0% | ████████░░ |
| MID (55–74) | 22 | 20 | 11 | 9 | 55.0% | █████░░░░░ |
| LOW (<55) | — | — | — | — | — | — |

- "Picks" = `total` from DB
- "Resolved" = cards with `result_hit IS NOT NULL`
- Hit % = `hits / resolved * 100` (show `—` if resolved = 0)
- Bar = inline `<div>` progress bar, width = hit % of resolved, colored by tier:
  - HIGH ≥ 60% hit rate → green (`#22c55e`)
  - MID 45–59% → amber (`#f59e0b`)
  - LOW < 45% → red (`#ef4444`)
  - Unresolved (hit rate = null) → gray (`#374151`)
- If a tier has 0 picks for this market+date range, still show the row with all dashes.

#### 5e. Overall summary strip

Below all market tables, show a single summary strip:

```
Overall (resolved picks only):  142 picked  ·  128 resolved  ·  79 hits  ·  61.7% hit rate
```

Sum across all markets and tiers.

---

### 6. Helper: `buildPerfMatrix(rows)`

Pure function (outside the component, or at top of the IIFE) that takes the flat `rows` array from the API and returns a nested structure for rendering:

```js
function buildPerfMatrix(rows) {
  const MARKETS = ["hr", "hits", "k", "outs"];
  const TIERS   = ["high", "mid", "low"];
  const matrix  = {};
  for (const m of MARKETS) {
    matrix[m] = {};
    for (const t of TIERS) {
      matrix[m][t] = { total: 0, resolved: 0, hits: 0, misses: 0 };
    }
  }
  for (const row of rows) {
    const cell = matrix[row.market]?.[row.scoreTier];
    if (!cell) continue;
    cell.total    += Number(row.total)    || 0;
    cell.resolved += Number(row.resolved) || 0;
    cell.hits     += Number(row.hits)     || 0;
    cell.misses   += Number(row.misses)   || 0;
  }
  return matrix;
}
```

---

### 7. Market display labels

```js
const MARKET_LABELS = {
  hr:   { label: "Home Runs", icon: "🏠" },
  hits: { label: "Hits",      icon: "🎯" },
  k:    { label: "Strikeouts", icon: "🔥" },
  outs: { label: "Outs Recorded", icon: "🛑" },
};
const TIER_LABELS = {
  high: "HIGH (75+)",
  mid:  "MID (55–74)",
  low:  "LOW (<55)",
};
```

---

## Files to Modify

**`backend/routes/boardSnapshot.js`**:
- Add `GET /stats` route above `GET /:date`
- Accepts `?days=` query param (0 = all-time)

**`prop-scout-v7.jsx`**:
- Add `perfStats` and `perfDays` state (near line 2470)
- Add useEffect to fetch stats on `view === "research-perf"` / `perfDays` change
- Add "📊 Performance" tab to Research Mode nav
- Add `{view === "research-perf" && ...}` render block with full dashboard

---

## What NOT to Change

- Live board behavior is completely untouched
- Research Mode date picker (Task 134 history replay) is untouched
- `board_card_snapshots` schema is untouched — no new migrations
- No changes to the resolve job or snapshot persistence logic
- The `days=0` case must not break if the table is empty (return empty rows, not an error)

---

## Routing note: `"stats"` before `"/:date"`

Express matches routes in registration order. The stats route **must** be registered before the `/:date` route or the string `"stats"` will be captured as a date param and fail the date parse. Verify the route file order after making changes.

---

## Checklist

- [ ] `GET /api/board-snapshot/stats?days=` endpoint added (above `/:date` route)
- [ ] Returns correct aggregation grouped by `market` + `score_tier`
- [ ] `days=0` returns all-time data; missing/0 param treated as all-time
- [ ] `perfStats` and `perfDays` state added to frontend
- [ ] useEffect fetches on `view === "research-perf"` and `perfDays` change
- [ ] "📊 Performance" tab visible in Research Mode nav
- [ ] Loading spinner shown while fetch is in-flight
- [ ] Empty state shown when no resolved picks exist
- [ ] Date range pills (7d / 30d / All-Time) switch `perfDays` and refetch
- [ ] One section per market (HR / Hits / K / Outs) with tier rows
- [ ] Progress bar colored green/amber/red by hit rate
- [ ] Overall summary strip at bottom
- [ ] Tiers with 0 picks show `—` rather than `0%`
- [ ] `"stats"` route registered before `"/:date"` in boardSnapshot.js
- [ ] `npm run build` passes

---

## After Completing

Reply "Task 135 complete" and describe what the Performance dashboard looks like when switching to the 30-day view with data present.
