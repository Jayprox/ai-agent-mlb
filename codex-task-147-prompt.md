# CODEX TASK 147 — Fix on-demand recompute excluding Final games (hr/hits stay `[]`)

## Background

CODEX TASK 145 made `/api/board/snapshot` recompute `hits`/`hr` (and any other
stale-empty market) on-demand for today's date. But the recompute's
`activeSlate` is built like this in `fillMissingMarkets`:

```js
const schedule = await buildSchedulePayloadForJob(date);
activeSlate = schedule.filter((game) =>
  ["Scheduled", "Pre-Game", "Warmup", "In Progress"].includes(game.status)
);
```

This drops any game whose `status` is `"Final"` / `"Game Over"` / etc. from
`activeSlate` *before* `gatherLiveBoardData(activeSlate)` runs — so lineups,
hitting logs, stat splits, and player props are never fetched for finished
games.

`computeBatterBoard("hits"/"hr", liveSlate, liveLineups, ...)` (in
`src/board/index.js`) doesn't filter by game status at all — it only requires
`liveLineups[gamePk]` to be `confirmed` (or `source: "roster"`). It happily
produces (and the UI grades) candidates for games that have already gone
Final.

The **web client's** `activeSlate` (prop-scout-v7.jsx line ~4673) is the
*entire* day's schedule, unfiltered by status — that's why the web's
client-side live-fallback (`sharedMarketOrLive`, commit `924b2db`) can show
"17/20 hit" using games that finished earlier today, while the **server's**
on-demand recompute, given only non-final games, gets no lineup data for
those games and returns `[]`.

Confirmed via iOS investigation
(`board-hr-hits-snapshot-vs-shared-board-mismatch.md`): at the same moment,
`/api/board/snapshot?date=2026-06-10&refresh=1` returned `hits: [], hr: []`
while the web's live-computed Hits tab showed 20 populated, graded
candidates for the same date. `k`/`outs` (pitcher markets, populated earlier
by the cron before games went final) were unaffected.

There's also a secondary bug: if **every** game today is Final by the time
`fillMissingMarkets` runs, `activeSlate.length === 0` under the current
filter — which hits the `!activeSlate.length` "no games scheduled today"
branch and sets the negative cache, incorrectly treating "slate finished" the
same as "off day, nothing scheduled."

## Goal

In `backend/routes/boardDailySnapshot.js`, `fillMissingMarkets`: for today's
date, build `activeSlate` from the **full day's schedule, unfiltered by
status** — matching exactly what the web client does — instead of filtering
out `Final`/`Game Over` games.

This is a one-line change (drop the `.filter(...)`), plus an updated comment.
No changes to `src/board/index.js`, `gatherLiveBoardData`, or any other file.

## File to change: `backend/routes/boardDailySnapshot.js`

### Edit — remove the status filter on `activeSlate`

Find:
```js
  let activeSlate;
  try {
    const schedule = await buildSchedulePayloadForJob(date);
    activeSlate = schedule.filter((game) =>
      ["Scheduled", "Pre-Game", "Warmup", "In Progress"].includes(game.status)
    );
  } catch (err) {
    console.warn(`  ⚠ board/snapshot: schedule fetch failed: ${err.message}`);
    activeSlate = [];
  }

  if (!activeSlate.length) {
```

Replace with:
```js
  let activeSlate;
  try {
    // Use the full day's schedule, unfiltered by status — mirrors the web
    // client's `activeSlate` (prop-scout-v7.jsx). computeBatterBoard /
    // computePitcherBoard / computeGameBoard don't filter by game status
    // themselves (they key off lineup/data availability), and excluding
    // Final games here meant gatherLiveBoardData never fetched lineups for
    // games that finished earlier today — producing `[]` for hits/hr even
    // when the web's live fallback could compute real, graded candidates
    // for those same games. See CODEX TASK 147.
    activeSlate = await buildSchedulePayloadForJob(date);
  } catch (err) {
    console.warn(`  ⚠ board/snapshot: schedule fetch failed: ${err.message}`);
    activeSlate = [];
  }

  if (!activeSlate.length) {
```

## What NOT to change

- Don't change `src/board/index.js` (`computeBatterBoard`, `computePitcherBoard`,
  `computeGameBoard`) — they already handle finished games correctly given
  lineup data.
- Don't change `gatherLiveBoardData` — it already fetches per-game data for
  whatever `activeSlate` it's given; it just needs to be given the full slate.
- Don't change the web client (`prop-scout-v7.jsx`) — its `activeSlate` is
  already correct (full day, unfiltered) and is the reference behavior this
  task matches on the backend.
- Don't change the negative-cache (`_emptyMarketAt`) logic, `NEGATIVE_CACHE_TTL_MS`,
  `FALLBACK_BUDGET_MS`, or the `force`/`refresh=1` handling — those are
  orthogonal and already correct.
- Don't change `buildSchedulePayloadForJob` itself or its return shape —
  `game.status` values are still useful elsewhere (e.g. `getBoardGamePhase`
  on the client); this task only stops *filtering them out* before computing
  candidates.

## Verification

1. `node -e "require('./backend/routes/boardDailySnapshot.js')"` loads without error.
2. On a day where some games are Final and others are still Scheduled/In
   Progress, with `hits`/`hr` currently `[]` for today in
   `board_daily_snapshots`:
   - `GET /api/board/snapshot?date=<today>&refresh=1` should now return
     non-empty `hits`/`hr` arrays containing candidates from the Final
     games' lineups (assuming those games had confirmed lineups), matching
     (or closely matching) what the web's live-fallback shows for the same
     date/time.
3. On a day where **every** game is Final by the time this runs:
   - `activeSlate` should be the full (non-empty) schedule, NOT trigger the
     `!activeSlate.length` "no games today" branch.
   - `hits`/`hr` recompute should still attempt and persist whatever
     `computeBatterBoard` returns (could legitimately be `[]` if no games had
     confirmed lineups data cached, but the attempt should happen).
4. On a true off day (empty schedule from `buildSchedulePayloadForJob`),
   `activeSlate.length === 0` still holds, and the existing "no games
   scheduled today" branch (set `payload[market] = []` + negative cache for
   `stillMissing`) still runs as before.
5. Confirm `k`/`outs` (already-populated markets) are unaffected — they're
   not in `recheckCandidates` unless they were `[]`/missing, so this change
   doesn't alter their values.
6. Confirm a **past date** (`date=<yesterday>`) is unaffected —
   `fillMissingMarkets` returns immediately for non-today dates before this
   code path is reached.
