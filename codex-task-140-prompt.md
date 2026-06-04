# CODEX TASK 140 — Picks Tab UI

## Goal

Build the Picks view in `prop-scout-v7.jsx`: a dedicated tab that shows the
authenticated user's logged picks, grouped by slate date, with a running record
summary bar and per-pick result badges. Includes a void action on each pick.

This task is purely frontend — all backend routes are already complete (Tasks 138 + 139).

---

## Background: What Already Exists

### Routes (Task 138 — complete)

- `GET /api/picks?days=N` — returns `{ picks: [...] }` for the current user
- `GET /api/picks/stats?days=N` — returns `{ wins, losses, pending, hitRate, totalPnl }`
- `PATCH /api/picks/:id/void` — voids a pick

### `apiFetch` (prop-scout-v7.jsx line ~349)

Auto-injects `Authorization: Bearer <token>` from `_authToken` module-level var.
Use `apiFetch(path)` — no manual auth header needed.

### Pick object shape (from `GET /api/picks`)

```js
{
  id:          "userId:playerId:market:slateDate",
  playerId:    "592450",
  playerName:  "Aaron Judge",
  gameLabel:   "NYY @ BOS",
  market:      "hr",           // "k" | "outs" | "hr" | "hits"
  side:        "over",         // "over" | "under"
  bookLine:    0.5,
  odds:        -125,           // null if not logged
  units:       1.0,
  slateDate:   "2026-06-03",   // "YYYY-MM-DD"
  source:      "board",        // "board" | "props"
  addedAt:     "2026-06-03T...",
  resultHit:   true,           // null = pending, true = HIT, false = MISS
  actualStat:  1,              // null if pending
  pnl:         0.8,            // null if pending or no odds
}
```

### Stats object shape (from `GET /api/picks/stats`)

```js
{
  wins:     12,
  losses:   8,
  pending:  3,
  hitRate:  60.0,   // null if no resolved picks
  totalPnl: 4.2,    // null if no odds-tracked picks
}
```

### Existing nav structure

Nav buttons are in a `<div>` around line 5390. Current views:
`slate`, `game`, `model`, `chat`, `board`, `ai-board`, `scout`, `predict`, `research-perf`

Add `"picks"` as a new view — gated behind `currentUser` (logged-in only).

### Market labels

```js
const MARKET_LABELS = { k: "K", outs: "Outs", hr: "HR", hits: "Hits" };
const MARKET_COLORS = { k: "#38bdf8", outs: "#34d399", hr: "#fbbf24", hits: "#f87171" };
```

---

## What To Build

### 1. State additions

Add near the other view-related state variables:

```js
const [picksViewData,    setPicksViewData]    = useState(null);
// null = not loaded; { picks: [...] } = loaded

const [picksViewStats,   setPicksViewStats]   = useState(null);
// null = not loaded; { wins, losses, pending, hitRate, totalPnl }

const [picksViewLoading, setPicksViewLoading] = useState(false);

const [picksViewDays,    setPicksViewDays]    = useState(0);
// 0 = all time; 7 = last 7 days; 30 = last 30 days
```

---

### 2. Fetch effect

Fires whenever `view === "picks"` or `picksViewDays` changes. Re-fetches on return to
the tab as well:

```js
useEffect(() => {
  if (view !== "picks" || !currentUser) return;
  setPicksViewLoading(true);

  Promise.all([
    apiFetch(`/api/picks?days=${picksViewDays}`),
    apiFetch(`/api/picks/stats?days=${picksViewDays}`),
  ])
    .then(([picksRes, statsRes]) => {
      setPicksViewData(picksRes ?? { picks: [] });
      setPicksViewStats(statsRes ?? null);
    })
    .catch(() => {
      setPicksViewData({ picks: [] });
      setPicksViewStats(null);
    })
    .finally(() => setPicksViewLoading(false));
}, [view, currentUser, picksViewDays]);
```

---

### 3. Void handler

```js
const voidPick = useCallback(async (pickId) => {
  try {
    await apiFetch(`/api/picks/${pickId}/void`, { method: "PATCH" });
    // Remove from view immediately, refresh stats
    setPicksViewData(prev => ({
      picks: (prev?.picks ?? []).filter(p => p.id !== pickId),
    }));
    // Update loggedPickIds so the logged indicator clears on Board cards
    setLoggedPickIds(prev => {
      const next = new Set(prev);
      next.delete(pickId);
      return next;
    });
    // Re-fetch stats
    apiFetch(`/api/picks/stats?days=${picksViewDays}`)
      .then(s => setPicksViewStats(s))
      .catch(() => {});
  } catch (_err) {
    showToast("Could not void pick — try again");
  }
}, [picksViewDays, showToast]);
```

---

### 4. Nav button

Add a "📋 Picks" nav button alongside the existing view buttons (after Scout or
Predict, whichever is last in the current order). Only show when `currentUser` is set:

```jsx
{currentUser && (
  <button
    onClick={() => setView("picks")}
    style={{
      background: view === "picks" ? "#3b82f6" : "#161827",
      border: `1px solid ${view === "picks" ? "#3b82f6" : "#1f2437"}`,
      borderRadius: 8,
      padding: isNarrowPhone ? "6px 10px" : "6px 12px",
      fontSize: isNarrowPhone ? 9 : 10,
      color: view === "picks" ? "#fff" : "#9ca3af",
      fontFamily: "monospace", fontWeight: 700,
      cursor: "pointer", textTransform: "uppercase",
    }}
  >
    📋 Picks
  </button>
)}
```

---

### 5. Picks view rendering

Add `{view === "picks" && currentUser && (() => { ... })()}` in the main content
area, using the same IIFE pattern as other views in this file.

#### 5a. Summary bar

```jsx
{/* Summary bar */}
<div style={{
  background: "#13141f", borderRadius: 10, padding: "12px 16px",
  marginBottom: 16, border: "1px solid rgba(255,255,255,0.06)",
  display: "flex", alignItems: "center", justifyContent: "space-between",
  flexWrap: "wrap", gap: 8,
}}>
  {picksViewLoading ? (
    <span style={{ fontSize: 11, color: "#6b7280" }}>Loading…</span>
  ) : picksViewStats ? (
    <>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        {/* W-L */}
        <div>
          <span style={{ fontSize: 18, fontWeight: 800, color: "#f9fafb" }}>
            {picksViewStats.wins}-{picksViewStats.losses}
          </span>
          {picksViewStats.pending > 0 && (
            <span style={{ fontSize: 10, color: "#6b7280", marginLeft: 6 }}>
              +{picksViewStats.pending} pending
            </span>
          )}
        </div>
        {/* Hit rate */}
        {picksViewStats.hitRate !== null && (
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24" }}>
            {picksViewStats.hitRate}%
          </div>
        )}
        {/* P&L */}
        {picksViewStats.totalPnl !== null && (
          <div style={{
            fontSize: 13, fontWeight: 700,
            color: picksViewStats.totalPnl >= 0 ? "#22c55e" : "#ef4444",
          }}>
            {picksViewStats.totalPnl >= 0 ? "+" : ""}{picksViewStats.totalPnl}u
          </div>
        )}
      </div>

      {/* Days filter */}
      <div style={{ display: "flex", gap: 4 }}>
        {[0, 7, 30].map(d => (
          <button key={d}
            onClick={() => setPicksViewDays(d)}
            style={{
              padding: "3px 8px", borderRadius: 6, border: "none",
              fontSize: 9, fontWeight: 700, cursor: "pointer",
              background: picksViewDays === d ? "#3b82f6" : "rgba(255,255,255,0.06)",
              color: picksViewDays === d ? "#fff" : "#6b7280",
            }}
          >
            {d === 0 ? "ALL" : `${d}D`}
          </button>
        ))}
      </div>
    </>
  ) : (
    <span style={{ fontSize: 11, color: "#6b7280" }}>No picks yet</span>
  )}
</div>
```

#### 5b. Group picks by date and render

```jsx
{(() => {
  const picks = picksViewData?.picks ?? [];

  if (!picksViewLoading && picks.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0" }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>📋</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb", marginBottom: 6 }}>
          No picks logged yet
        </div>
        <div style={{ fontSize: 11, color: "#6b7280" }}>
          Long-press any Board or Props card to add a pick
        </div>
      </div>
    );
  }

  // Group by slateDate, sorted newest first
  const grouped = picks.reduce((acc, p) => {
    const key = p.slateDate ?? "Unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return sortedDates.map(date => (
    <div key={date} style={{ marginBottom: 20 }}>
      {/* Date header */}
      <div style={{
        fontSize: 9, fontWeight: 700, color: "#4b5563",
        textTransform: "uppercase", letterSpacing: "0.08em",
        marginBottom: 8, paddingLeft: 2,
      }}>
        {date === new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" })
          ? `Today — ${date}`
          : date}
      </div>

      {grouped[date].map(pick => {
        const isHit  = pick.resultHit === true;
        const isMiss = pick.resultHit === false;
        const isPending = pick.resultHit === null || pick.resultHit === undefined;

        const marketColor = MARKET_COLORS[pick.market] ?? "#9ca3af";
        const marketLabel = MARKET_LABELS[pick.market] ?? (pick.market ?? "—").toUpperCase();

        return (
          <div key={pick.id} style={{
            background: "#13141f",
            border: `1px solid ${isHit ? "rgba(34,197,94,0.25)" : isMiss ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.06)"}`,
            borderRadius: 10, padding: "10px 12px", marginBottom: 8,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            {/* Market badge */}
            <div style={{
              background: `${marketColor}22`,
              border: `1px solid ${marketColor}55`,
              borderRadius: 6, padding: "3px 7px",
              fontSize: 9, fontWeight: 800, color: marketColor,
              flexShrink: 0, minWidth: 28, textAlign: "center",
            }}>
              {marketLabel}
            </div>

            {/* Player + game info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pick.playerName ?? pick.playerId}
              </div>
              <div style={{ fontSize: 9, color: "#6b7280", marginTop: 1 }}>
                {pick.side?.toUpperCase()} {pick.bookLine != null ? pick.bookLine : ""}
                {pick.gameLabel ? ` · ${pick.gameLabel}` : ""}
                {pick.odds != null ? ` · ${pick.odds > 0 ? "+" : ""}${pick.odds}` : ""}
                {` · ${pick.units}u`}
              </div>
            </div>

            {/* P&L or result badge */}
            <div style={{ flexShrink: 0, textAlign: "right" }}>
              {isHit && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 800, color: "#22c55e",
                    background: "rgba(34,197,94,0.12)", borderRadius: 5,
                    padding: "2px 7px", marginBottom: pick.pnl != null ? 2 : 0 }}>
                    HIT
                  </div>
                  {pick.pnl != null && (
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#22c55e" }}>
                      +{pick.pnl}u
                    </div>
                  )}
                </div>
              )}
              {isMiss && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 800, color: "#ef4444",
                    background: "rgba(239,68,68,0.12)", borderRadius: 5,
                    padding: "2px 7px", marginBottom: pick.pnl != null ? 2 : 0 }}>
                    MISS
                  </div>
                  {pick.pnl != null && (
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#ef4444" }}>
                      {pick.pnl}u
                    </div>
                  )}
                </div>
              )}
              {isPending && (
                <div style={{ fontSize: 9, fontWeight: 700, color: "#6b7280",
                  background: "rgba(255,255,255,0.05)", borderRadius: 5,
                  padding: "2px 7px" }}>
                  PENDING
                </div>
              )}
            </div>

            {/* Void button */}
            <button
              onClick={() => voidPick(pick.id)}
              title="Void pick"
              style={{
                background: "none", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 6, padding: "3px 7px", cursor: "pointer",
                fontSize: 9, color: "#4b5563", flexShrink: 0,
              }}
            >
              void
            </button>
          </div>
        );
      })}
    </div>
  ));
})()}
```

---

### 6. Gate the view behind login

If `view === "picks"` but `!currentUser`, show a prompt:

```jsx
{view === "picks" && !currentUser && (
  <div style={{ textAlign: "center", padding: "60px 20px" }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb", marginBottom: 8 }}>
      Sign in to view your picks
    </div>
    <div style={{ fontSize: 11, color: "#6b7280" }}>
      Your pick log is saved to your account
    </div>
  </div>
)}
```

---

## Constants to add near the top of the component (or inline)

```js
const MARKET_LABELS = { k: "K", outs: "Outs", hr: "HR", hits: "Hits" };
const MARKET_COLORS = {
  k:    "#38bdf8",
  outs: "#34d399",
  hr:   "#fbbf24",
  hits: "#f87171",
};
```

If `MARKET_LABELS` or `MARKET_COLORS` already exist in `src/constants.js`, import
from there instead of defining inline.

---

## Files to Modify

**`prop-scout-v7.jsx`** only — no backend changes.

- Add 4 state variables (`picksViewData`, `picksViewStats`, `picksViewLoading`, `picksViewDays`)
- Add fetch `useEffect` for `view === "picks"`
- Add `voidPick` callback
- Add `"📋 Picks"` nav button (gated behind `currentUser`)
- Add `view === "picks"` render block in the main content area
- Add `MARKET_LABELS` / `MARKET_COLORS` if not already present

---

## What NOT to Change

- `backend/routes/picks.js` — untouched
- `src/components/*.jsx` — untouched
- Any other existing view or state — untouched
- The `loggedPickIds` load effect (line ~2998) — untouched; `voidPick` updates it directly

---

## Checklist

- [ ] `picksViewData`, `picksViewStats`, `picksViewLoading`, `picksViewDays` state added
- [ ] Fetch effect fires on `view === "picks"` and on `picksViewDays` change
- [ ] `voidPick` removes pick from list, updates `loggedPickIds`, re-fetches stats
- [ ] "📋 Picks" nav button visible only when `currentUser` is set
- [ ] Nav button uses blue (`#3b82f6`) active color to distinguish from other tabs
- [ ] Summary bar shows W-L, hit%, P&L (each null-guarded)
- [ ] ALL / 7D / 30D filter buttons update `picksViewDays` and re-fetch
- [ ] Picks grouped by `slateDate`, newest date first
- [ ] Each pick row shows: market badge, player name, side + line + odds + units, result badge
- [ ] HIT shows green badge + P&L (if odds present); MISS shows red badge + P&L; PENDING shows grey badge
- [ ] Void button present on every row; triggers `voidPick`
- [ ] Empty state renders when `picks.length === 0` and not loading
- [ ] Login gate renders when `view === "picks" && !currentUser`
- [ ] No console errors on first render

---

## After Completing

Reply "Task 140 complete" and confirm:
1. Where in the nav the Picks button was placed (which view is to its left)
2. Whether `MARKET_LABELS`/`MARKET_COLORS` were already in `src/constants.js` or added inline
3. Any deviation from the spec (e.g. if you used a different grouping approach)
