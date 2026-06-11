# iOS TASK — Stop HR/Hits tabs from staying permanently blank

## Status check first

This task supersedes the "new `/api/board/live` endpoint" idea from the
feasibility doc (`board-hr-hits-live-fallback-ios-feasibility*.md`). **Do not
build a new endpoint or port `computeBatterBoard`/`computePitcherBoard` to
Swift.** The backend already added everything needed for this in CODEX TASK
145 (deployed). This task is the iOS-side consumer of that work — it's a
small, additive change to whatever view model currently calls
`/api/board/snapshot` (referred to below as `BoardViewModel`, adjust to the
actual type name).

## Background

`GET /api/board/snapshot?date=YYYY-MM-DD` now:

- Always returns all 10 market keys for today
  (`k, outs, hits, hr, nrfi, total, spread, ml, f5ml, f5spread`), each an
  array (possibly `[]`).
- Self-heals: if a market is `[]` for **today's date**, the backend recomputes
  it server-side (running `computeBatterBoard`/`computePitcherBoard` itself)
  on the *next* request, as long as it hasn't tried in the last 10 minutes.
  No client action required for this to kick in — it just needs the client to
  ask again.
- Supports `&refresh=1` (also accepts `refresh=true`/`refresh=yes`): forces an
  immediate recompute of any missing/empty market, bypassing both the
  5-minute response cache and the 10-minute negative cache. Markets that
  already have real data are left untouched. Response shape is identical to a
  normal snapshot request — **no new decoding model needed**.

The web app's fix (CODEX TASK 146 + commit `924b2db`) does two things with
this: (1) keeps re-fetching the snapshot every ~90s while any market the user
is viewing is still `[]` for today, and (2) adds a manual "↻ Refresh" button
that calls the same endpoint with `&refresh=1`.

## Goal

Implement the same two behaviors on iOS, scoped to wherever `BoardViewModel`
(or equivalent) currently fetches `/api/board/snapshot` and exposes
`hr`/`hits`/`k`/`outs`/game-market arrays to the Board UI.

### 1. Keep polling while today's snapshot has an empty market

- After the initial `/api/board/snapshot?date=<today>` load, check: is
  `snapshot.date == today` AND is at least one of
  `[k, outs, hits, hr, nrfi, total, spread, ml, f5ml, f5spread]` an empty
  array?
- If yes, start (or keep alive) a timer — e.g. every 60-90 seconds while the
  Board screen is visible — that re-calls
  `GET /api/board/snapshot?date=<today>` (no `refresh` param) and replaces
  the stored snapshot with the new response if it's not `{ empty: true, ... }`.
- Stop the timer once every market is non-empty (or the snapshot's `date` is
  no longer today, or the user navigates away from the Board screen).
- Decode with the existing `BoardSnapshot` model — the shape doesn't change.

### 2. Manual "↻ Refresh" action

- Add a refresh affordance to the Board screen (pull-to-refresh is fine if
  that's the existing pattern, or a small button matching the web's banner
  button).
- On trigger, call `GET /api/board/snapshot?date=<today>&refresh=1`, decode
  the same way, and replace the stored snapshot on success.
- Show a brief loading/spinner state — this call can take up to ~9 seconds if
  it ends up recomputing multiple stale-empty markets. Don't block the whole
  UI; a small inline spinner on the refresh control is enough.
- Disable the control (or no-op) while a refresh is already in flight.

### 3. No change to the "shared market `[]`" empty-state UI

- If, after polling/refresh, a market is still `[]`, that's a legitimate
  "lineups not posted yet / nothing qualifies" state — keep whatever
  empty-state messaging already exists for that. Don't fall back to local
  computation; there's nothing to compute locally.

## What NOT to do

- Don't add a new backend endpoint.
- Don't add a new Swift decoding model — `BoardSnapshot` already matches.
- Don't port `computeBatterBoard` / `computePitcherBoard` / any scoring logic
  from `src/board/index.js` to Swift.
- Don't poll faster than ~60s or call `&refresh=1` automatically/repeatedly —
  it's meant for explicit user action (it bypasses the negative cache that
  exists specifically to rate-limit recomputation).

## Verification

1. Build succeeds.
2. With a mocked/staged response where `hits: []` and `date == today`, confirm
   the polling timer starts and a follow-up `/api/board/snapshot?date=<today>`
   request fires after the interval.
3. With a mocked response where all markets are non-empty, confirm no timer
   is started (or an existing one is cancelled).
4. Trigger the manual refresh and confirm it calls
   `/api/board/snapshot?date=<today>&refresh=1`, shows a loading state, and
   updates the displayed candidates on response.
5. Confirm navigating away from the Board screen cancels the polling timer
   (no leaked timers / background network calls).
6. Confirm historical dates (anything other than today) never trigger polling
   or show the refresh control, matching the web behavior.
