# CODEX TASK 146 — Frontend: keep polling stale-empty board markets + manual refresh button

## Background

CODEX TASK 145 made `/api/board/snapshot` self-heal `hits`/`hr` (and any other
market) that were persisted as `[]` for today, recomputing them on-demand
(rate-limited by a 10-min negative cache) and exposing a manual
`?refresh=1` override.

But the web app (`prop-scout-v7.jsx`) never gives that backend fix a chance to
run again once it's loaded the Board tab once. Two effects are responsible:

1. The initial fetch (around line 3521-3547):
   ```js
   if ((boardDailySnapshot?.date === today && boardDailySnapshot?.empty !== true) || boardSnapshotLoading) return;
   ```
   This fetches `/api/board/snapshot?date=today` exactly once. After CODEX
   TASK 144/145, every market key is always present (even as `[]`), so
   `boardDailySnapshot?.date === today && boardDailySnapshot?.empty !== true`
   becomes `true` after the very first fetch — this effect then never runs
   again.

2. The "poll until snapshot exists" effect (around line 3549-3565):
   ```js
   if (view !== "board" || isHistoricalBoard || boardSnapshotCoversToday()) return;
   ```
   `boardSnapshotCoversToday()` (line 3001-3004) returns `true` as soon as
   `boardDailySnapshot.date === today` and `empty !== true` — again, true
   after the first fetch regardless of whether `hits`/`hr` are `[]`. So the
   90-second polling interval never even gets created.

Net result: if a user loads the Board tab while `hits`/`hr` are `[]` (e.g.
before lineups post), the page is stuck showing "Loading player stats — check
back shortly" for the rest of the session, even though the backend would now
return real data on a fresh request. The only "fix" today is a hard page
reload, and even that's a coin flip depending on the negative-cache timing.

## Goal

In `prop-scout-v7.jsx`:

1. **Keep polling** `/api/board/snapshot?date=today` every 90s (reusing the
   existing interval mechanism) for as long as today's snapshot either (a)
   doesn't exist yet, or (b) exists but has at least one market that's still
   an empty array (`[]`). Each successful poll merges the fresh response into
   `boardDailySnapshot` via the existing `setBoardDailySnapshot({ ...data, date: today })`
   call — no new merge logic needed, just a wider condition for *whether* to
   keep polling.
2. **Add a manual "↻ Refresh" button** in the "Shared daily board" banner that
   calls `/api/board/snapshot?date=today&refresh=1` and immediately merges
   the result into `boardDailySnapshot`, with a small loading state on the
   button while the request is in flight.

This is a frontend-only change. No backend changes needed — CODEX TASK 145 is
already deployed and provides the `refresh=1` param and the self-healing
behavior this task relies on.

## File to change: `prop-scout-v7.jsx`

### Edit 1 — add a `boardSnapshotRefreshing` state flag

Find:
```js
  const [boardDailySnapshot, setBoardDailySnapshot] = useState(null);
  const [boardSnapshotLoading, setBoardSnapshotLoading] = useState(false);
```

Replace with:
```js
  const [boardDailySnapshot, setBoardDailySnapshot] = useState(null);
  const [boardSnapshotLoading, setBoardSnapshotLoading] = useState(false);
  const [boardSnapshotRefreshing, setBoardSnapshotRefreshing] = useState(false);
```

### Edit 2 — add the empty-market helper and the manual refresh function

Find:
```js
  const boardSnapshotCoversToday = useCallback(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    return !!(boardDailySnapshot?.date === today && boardDailySnapshot?.empty !== true);
  }, [boardDailySnapshot]);

  /** Snapshot rows for a market (may be []). Null only when no shared snapshot for today. */
  const getBoardMarketSnapshot = useCallback((market) => {
    if (!boardSnapshotCoversToday()) return null;
    if (!Object.prototype.hasOwnProperty.call(boardDailySnapshot ?? {}, market)) return null;
    const snapshotCards = boardDailySnapshot[market];
    return Array.isArray(snapshotCards) ? snapshotCards : [];
  }, [boardDailySnapshot, boardSnapshotCoversToday]);
```

Replace with:
```js
  const boardSnapshotCoversToday = useCallback(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    return !!(boardDailySnapshot?.date === today && boardDailySnapshot?.empty !== true);
  }, [boardDailySnapshot]);

  /** Snapshot rows for a market (may be []). Null only when no shared snapshot for today. */
  const getBoardMarketSnapshot = useCallback((market) => {
    if (!boardSnapshotCoversToday()) return null;
    if (!Object.prototype.hasOwnProperty.call(boardDailySnapshot ?? {}, market)) return null;
    const snapshotCards = boardDailySnapshot[market];
    return Array.isArray(snapshotCards) ? snapshotCards : [];
  }, [boardDailySnapshot, boardSnapshotCoversToday]);

  /** Mirrors backend BOARD_MARKETS (boardSnapshotDb.js) — used only to detect stale-empty markets. */
  const BOARD_SNAPSHOT_MARKETS = ["k", "outs", "hits", "hr", "nrfi", "total", "spread", "ml", "f5ml", "f5spread"];

  /** True if `snapshot` covers today but at least one market is still an empty array. */
  const boardSnapshotHasEmptyMarket = useCallback((snapshot) => {
    if (!snapshot || snapshot.empty === true) return false;
    return BOARD_SNAPSHOT_MARKETS.some(
      (market) => Array.isArray(snapshot[market]) && snapshot[market].length === 0
    );
  }, []);

  /** Manual "force refresh" — bypasses both the response cache and the negative cache (CODEX TASK 145). */
  const refreshBoardSnapshot = useCallback(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    setBoardSnapshotRefreshing(true);
    apiFetch(`/api/board/snapshot?date=${today}&refresh=1`)
      .then(data => {
        if (data && !data.empty) setBoardDailySnapshot({ ...data, date: today });
      })
      .catch(() => {})
      .finally(() => setBoardSnapshotRefreshing(false));
  }, []);
```

### Edit 3 — widen the polling effect's continue-condition

Find:
```js
  // Poll until today's shared board snapshot exists (midnight / 10 AM HI jobs)
  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    const isHistoricalBoard = !!(slateDate && slateDate < today);
    if (view !== "board" || isHistoricalBoard || boardSnapshotCoversToday()) return;

    const poll = () => {
      apiFetch(`/api/board/snapshot?date=${today}`)
        .then(data => {
          if (data && !data.empty) setBoardDailySnapshot({ ...data, date: today });
        })
        .catch(() => {});
    };

    const interval = setInterval(poll, 90_000);
    return () => clearInterval(interval);
  }, [view, slateDate, boardDailySnapshot]);
```

Replace with:
```js
  // Poll until today's shared board snapshot exists AND every market has data
  // (midnight / 10 AM HI jobs, plus the on-demand fallback filling in
  // stale-empty markets like hits/hr once lineups post — see CODEX TASK 145).
  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    const isHistoricalBoard = !!(slateDate && slateDate < today);
    if (view !== "board" || isHistoricalBoard) return;
    if (boardSnapshotCoversToday() && !boardSnapshotHasEmptyMarket(boardDailySnapshot)) return;

    const poll = () => {
      apiFetch(`/api/board/snapshot?date=${today}`)
        .then(data => {
          if (data && !data.empty) setBoardDailySnapshot({ ...data, date: today });
        })
        .catch(() => {});
    };

    const interval = setInterval(poll, 90_000);
    return () => clearInterval(interval);
  }, [view, slateDate, boardDailySnapshot, boardSnapshotCoversToday, boardSnapshotHasEmptyMarket]);
```

### Edit 4 — add the "↻ Refresh" button to the "Shared daily board" banner

Find:
```jsx
              {useSharedBoard ? (
                <div style={{
                  marginBottom: 10, padding: "8px 10px", borderRadius: 8,
                  background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.28)",
                  fontSize: 10, color: "#9ca3af", lineHeight: 1.45, fontFamily: "monospace",
                }}>
                  <span style={{ fontWeight: 800, color: "#22c55e" }}>Shared daily board</span>
                  {boardDailySnapshot?.generatedAt && (
                    <span style={{ color: "#6b7280" }}>
                      {" "}· snapshot {formatBoardSnapshotTime(boardDailySnapshot.generatedAt)} HI
                    </span>
                  )}
                  <span style={{ color: "#4b5563" }}> — same scores &amp; text for all users. Refreshes 10 AM HI + pregame.</span>
                </div>
              ) : allowLiveBoardFallback ? (
```

Replace with:
```jsx
              {useSharedBoard ? (
                <div style={{
                  marginBottom: 10, padding: "8px 10px", borderRadius: 8,
                  background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.28)",
                  fontSize: 10, color: "#9ca3af", lineHeight: 1.45, fontFamily: "monospace",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                }}>
                  <div>
                    <span style={{ fontWeight: 800, color: "#22c55e" }}>Shared daily board</span>
                    {boardDailySnapshot?.generatedAt && (
                      <span style={{ color: "#6b7280" }}>
                        {" "}· snapshot {formatBoardSnapshotTime(boardDailySnapshot.generatedAt)} HI
                      </span>
                    )}
                    <span style={{ color: "#4b5563" }}> — same scores &amp; text for all users. Refreshes 10 AM HI + pregame.</span>
                  </div>
                  <button
                    onClick={refreshBoardSnapshot}
                    disabled={boardSnapshotRefreshing}
                    style={{
                      flexShrink: 0, background: "rgba(34,197,94,0.12)",
                      border: "1px solid rgba(34,197,94,0.35)", borderRadius: 6,
                      padding: "3px 9px", fontSize: 9, fontWeight: 700,
                      color: boardSnapshotRefreshing ? "#6b7280" : "#22c55e",
                      fontFamily: "monospace", cursor: boardSnapshotRefreshing ? "default" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {boardSnapshotRefreshing ? "Refreshing…" : "↻ Refresh"}
                  </button>
                </div>
              ) : allowLiveBoardFallback ? (
```

## What NOT to change

- Do not change the initial-fetch effect (around line 3521-3547) — it's
  correct as-is; this task only widens the *follow-up polling* condition.
- Do not change `boardSnapshotCoversToday`, `getBoardMarketSnapshot`, or any
  of the `boardCandidatesByType` / `liveBoardCandidates` / `lockedBoardCandidates`
  derivation logic — those already correctly read from `boardDailySnapshot`
  and will pick up fresher data automatically once `boardDailySnapshot` state
  updates.
- Do not change the "Live board (not shared yet)" branch (`allowLiveBoardFallback`)
  or the "Shared board is being built" loading branch.
- Don't add the refresh button anywhere except the "Shared daily board" banner
  (i.e., don't show it in the `allowLiveBoardFallback` or loading states).
- `BOARD_SNAPSHOT_MARKETS` is a frontend-only mirror of the backend's
  `BOARD_MARKETS` for UI staleness detection — don't try to import it from the
  backend or wire it into any API call.

## Verification

1. The file still builds/lints cleanly (`npm run build` or equivalent if
   available).
2. With `boardDailySnapshot = { date: today, k: [...], outs: [...], hits: [], hr: [...], ... }`
   (i.e. `hits` empty, everything else present), confirm:
   - `boardSnapshotCoversToday()` is `true`.
   - `boardSnapshotHasEmptyMarket(boardDailySnapshot)` is `true` (because of `hits: []`).
   - The polling effect's early-return condition (`boardSnapshotCoversToday() && !boardSnapshotHasEmptyMarket(...)`)
     is `false`, so the 90s interval is created.
3. Once a poll response has every market non-empty, confirm
   `boardSnapshotHasEmptyMarket(...)` becomes `false` and the next effect run
   clears the interval (no more polling).
4. Click "↻ Refresh" — confirm it calls `/api/board/snapshot?date=<today>&refresh=1`,
   shows "Refreshing…" while in flight, and updates `boardDailySnapshot` (and
   thus the visible board) on response.
5. Confirm the refresh button only renders in the `useSharedBoard` (green
   "Shared daily board") banner, not in the amber "Live board (not shared
   yet)" banner or the "Shared board is being built" loading state.
6. Confirm historical dates (`slateDate < today`) are unaffected — both
   effects bail out via `isHistoricalBoard` exactly as before.
