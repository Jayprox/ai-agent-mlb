# CODEX TASK 145 — Re-check stale-empty board markets + manual refresh

## Background

CODEX TASK 144 made `/api/board/snapshot` self-healing: if a market key is
**missing** from `board_daily_snapshots` for today's date, the endpoint
computes it on-demand and persists the result (even `[]`).

That task also fixed `saveBoardSnapshot` to persist `[]` instead of dropping
empty rows. This closed the original "hr/hits missing entirely" bug, but it
created a new gap:

- The 10 AM Honolulu cron (and/or the pregame cron, which can fire **before**
  10 AM for early-starting games) often runs *before* lineups are posted for
  some or all of today's games. `hits`/`hr` compute to `[]` at that point and
  get persisted as `[]` — correctly, per TASK 144.
- Both daily cron runs are gated by once-per-day flags (`_aiSnapshotRan`),
  so neither will run again today.
- Later in the day, once lineups post and games go live/finish, a user hits
  `/api/board/snapshot` again. But now `hits in payload` is `true` (it's
  `[]`, not missing), so:
  ```js
  if (BOARD_MARKETS.some((market) => !(market in payload))) {
  ```
  is `false` for `hits`/`hr` — the on-demand fallback never runs again, and
  the stale `[]` is served (and re-cached) for the rest of the day.

Net effect: the iOS Board tab and the web AI Board can show "Lineups not yet
posted" / empty Hits & HR cards all afternoon, even while those games are
live or finished and real candidates are now computable.

## Goal

In `backend/routes/boardDailySnapshot.js`:

1. **Treat "empty for today" as re-checkable**, not just "missing". For
   today's date, any market whose persisted `candidates` array is `[]`
   should be eligible for on-demand recompute, gated by the existing
   `_emptyMarketAt` negative-cache (10 min TTL) so we don't recompute on
   every single request — just once per ~10 minutes until it returns real
   candidates (at which point the negative-cache entry is cleared and it's
   left alone).
2. **Add a manual force-refresh option**: `GET /api/board/snapshot?date=...&refresh=1`
   (also accept `refresh=true`/`refresh=yes`, case-insensitive). When set,
   for **today's date**:
   - Bypass the 5-minute response cache for this request (don't read from it;
     don't write the result into it).
   - Bypass the `_emptyMarketAt` negative-cache TTL for any market that is
     currently missing or `[]`, forcing an immediate recompute attempt for
     those markets right now.
   - Markets that already have non-empty `candidates` are left untouched
     (force-refresh does not recompute markets that already have real data —
     only missing/empty ones).

This is purely a backend change to one file. No iOS or web changes needed —
the existing `/api/board/snapshot` clients will just start getting fresher
`hits`/`hr` (and any other market) data without any client-side action. The
`refresh=1` param is opt-in and additive (existing callers that never pass it
are unaffected beyond getting the new "recheck empty markets" behavior in #1).

## File to change

### `backend/routes/boardDailySnapshot.js`

Replace the entire file with the following:

```js
const express = require("express");
const cache = require("../services/cache");
const db = require("../services/db");
const { buildSchedulePayloadForJob } = require("./schedule");
const { gatherLiveBoardData, computeMarketCandidates } = require("../services/liveBoardData");
const { BOARD_MARKETS, saveBoardSnapshot } = require("../services/boardSnapshotDb");

const router = express.Router();

const SNAPSHOT_TTL = 5 * 60 * 1000;
const FALLBACK_BUDGET_MS = 9000;
const NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000;

function todayHonolulu() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}

const _inFlight = new Map();
const _emptyMarketAt = new Map();

async function getLiveData(date, activeSlate) {
  if (_inFlight.has(date)) return _inFlight.get(date);
  const promise = gatherLiveBoardData(activeSlate)
    .catch((err) => {
      console.warn(`  ⚠ board/snapshot: gatherLiveBoardData failed: ${err.message}`);
      return null;
    })
    .finally(() => _inFlight.delete(date));
  _inFlight.set(date, promise);
  return promise;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve("__timeout__"), ms)),
  ]);
}

/**
 * Fills in missing and stale-empty board markets for `date`, mutating `payload`
 * in place. For today's date, markets that are either absent from `payload` or
 * present-but-empty (`[]`) are candidates for on-demand recompute, subject to
 * the `_emptyMarketAt` negative cache unless `force` is set.
 */
async function fillMissingMarkets(date, payload, { force = false } = {}) {
  const isToday = date === todayHonolulu();

  const missing = BOARD_MARKETS.filter((market) => !(market in payload));

  if (!isToday) {
    for (const market of missing) payload[market] = [];
    return;
  }

  const emptyToday = BOARD_MARKETS.filter(
    (market) =>
      market in payload &&
      Array.isArray(payload[market]) &&
      payload[market].length === 0
  );

  const recheckCandidates = [...missing, ...emptyToday];
  if (!recheckCandidates.length) return;

  const stillMissing = [];
  for (const market of recheckCandidates) {
    const negKey = `${date}:${market}`;
    const negAt = _emptyMarketAt.get(negKey);
    if (!force && negAt && Date.now() - negAt < NEGATIVE_CACHE_TTL_MS) {
      if (!(market in payload)) payload[market] = [];
    } else {
      stillMissing.push(market);
    }
  }
  if (!stillMissing.length) return;

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
    for (const market of stillMissing) {
      if (!(market in payload)) payload[market] = [];
      _emptyMarketAt.set(`${date}:${market}`, Date.now());
    }
    return;
  }

  const liveData = await withTimeout(getLiveData(date, activeSlate), FALLBACK_BUDGET_MS);
  if (liveData === "__timeout__" || !liveData) {
    for (const market of stillMissing) {
      if (!(market in payload)) payload[market] = [];
      _emptyMarketAt.set(`${date}:${market}`, Date.now());
    }
    return;
  }

  await Promise.allSettled(stillMissing.map(async (market) => {
    let candidates = [];
    try {
      candidates = await computeMarketCandidates(market, activeSlate, liveData);
    } catch (err) {
      console.warn(`  ⚠ board/snapshot: on-demand compute failed for ${market}: ${err.message}`);
    }
    payload[market] = candidates;
    if (!candidates.length) {
      _emptyMarketAt.set(`${date}:${market}`, Date.now());
    } else {
      _emptyMarketAt.delete(`${date}:${market}`);
    }
    await saveBoardSnapshot(date, market, candidates);
  }));
}

router.get("/snapshot", async (req, res) => {
  const date = req.query.date ?? todayHonolulu();
  const force = ["1", "true", "yes"].includes(String(req.query.refresh ?? "").toLowerCase());
  const cacheKey = `board-daily-snapshot:${date}`;

  if (!force) {
    const cached = cache.get(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }
  }

  if (!db.isConnected()) {
    return res.json({ empty: true, reason: "db_unavailable" });
  }

  try {
    const result = await db.query(
      `SELECT market, candidates, generated_at
       FROM board_daily_snapshots
       WHERE slate_date = $1`,
      [date]
    );

    const payload = {
      date,
      generatedAt: result?.rows?.[0]?.generated_at ?? null,
    };
    for (const row of result?.rows ?? []) {
      if (BOARD_MARKETS.includes(row.market)) {
        payload[row.market] = Array.isArray(row.candidates) ? row.candidates : [];
      }
    }

    const hadAnyRows = (result?.rows?.length ?? 0) > 0;

    const hasMissing = BOARD_MARKETS.some((market) => !(market in payload));
    const hasEmptyToday =
      date === todayHonolulu() &&
      BOARD_MARKETS.some(
        (market) =>
          market in payload &&
          Array.isArray(payload[market]) &&
          payload[market].length === 0
      );

    let usedFallback = false;
    if (hasMissing || hasEmptyToday || force) {
      usedFallback = true;
      await fillMissingMarkets(date, payload, { force });
    }

    if (!hadAnyRows && !Object.keys(payload).some((key) => BOARD_MARKETS.includes(key) && payload[key]?.length)) {
      if (!payload.generatedAt && BOARD_MARKETS.every((market) => (payload[market] ?? []).length === 0)) {
        return res.json({ empty: true, reason: "no_snapshot", date });
      }
    }

    if (payload.generatedAt == null) payload.generatedAt = new Date().toISOString();

    if (!usedFallback) {
      cache.set(cacheKey, payload, SNAPSHOT_TTL);
    }
    res.setHeader("X-Cache", usedFallback ? "FALLBACK" : "MISS");
    return res.json(payload);
  } catch (err) {
    console.warn(`  ⚠ board daily snapshot GET failed: ${err.message}`);
    return res.status(502).json({ error: "DB unavailable", detail: err.message });
  }
});

module.exports = router;
```

### Summary of what actually changed vs. the TASK 144 version

- `fillMissingMarkets` signature is now `fillMissingMarkets(date, payload, { force = false } = {})`.
- It now computes `emptyToday` (markets present in `payload` with `candidates.length === 0`,
  only for today) in addition to `missing`, and unions them into `recheckCandidates`.
- The negative-cache check (`negAt && Date.now() - negAt < NEGATIVE_CACHE_TTL_MS`) is now
  skipped entirely when `force` is `true`.
- The `!activeSlate.length` and `liveData === "__timeout__" || !liveData` early-exit branches
  now also call `_emptyMarketAt.set(...)` for every market in `stillMissing`, so a schedule-fetch
  failure or live-data timeout doesn't cause every subsequent request to retry immediately —
  it now respects the same 10-minute negative-cache TTL. (Previously these branches only set
  `payload[market] = []` without touching `_emptyMarketAt`.)
- The route handler now parses `req.query.refresh` into a `force` boolean (`"1"`, `"true"`,
  `"yes"`, case-insensitive).
- When `force` is true, the response-cache read (`cache.get`) is skipped.
- The trigger condition for calling `fillMissingMarkets` is now
  `hasMissing || hasEmptyToday || force` (previously just `hasMissing`, expressed via
  `BOARD_MARKETS.some((market) => !(market in payload))`).
- Everything else (the `no_snapshot` short-circuit, `generatedAt` fallback, response caching
  via `SNAPSHOT_TTL`, `X-Cache` header logic) is unchanged.

## What NOT to change

- `backend/services/liveBoardData.js` and `backend/services/boardSnapshotDb.js` — no changes
  needed for this task.
- `backend/jobs/dailyAiSnapshot.js` and `backend/jobs/scheduler.js` — no changes needed for
  this task. (A separate follow-up may revisit the pregame cron's once-per-day,
  earliest-game-only trigger, but that's out of scope here.)
- Don't change the `no_snapshot` empty-state response shape (`{ empty: true, reason: "no_snapshot", date }`)
  or the `db_unavailable` response shape — iOS/web may depend on these.
- Don't make `force=true` recompute markets that already have non-empty `candidates` — only
  missing/empty ones.
- Don't change `BOARD_MARKETS`, the DB schema, or `SNAPSHOT_TTL` / `FALLBACK_BUDGET_MS` /
  `NEGATIVE_CACHE_TTL_MS` constant values.

## Verification

1. `node -e "require('./backend/routes/boardDailySnapshot.js')"` from the repo root loads
   without error.
2. With the dev server running and a populated `board_daily_snapshots` row for today where
   `hits` (or `hr`) is currently `[]`:
   - `GET /api/board/snapshot?date=<today>` — first request after this deploy should show
     `X-Cache: FALLBACK` and attempt a recompute for `hits`/`hr` (check server logs for
     `board/snapshot: on-demand compute failed for hits` only if it errors — otherwise it
     should silently recompute and persist).
   - A second immediate request for the same date, if `hits` is still `[]`, should NOT
     trigger another recompute (negative-cache hit) — should be fast and `X-Cache: FALLBACK`
     only because of how `usedFallback` is set, but no new live-data gathering should occur
     (verify via logs / timing).
   - `GET /api/board/snapshot?date=<today>&refresh=1` should bypass both caches and attempt
     an immediate recompute for any missing/empty markets, regardless of the negative-cache
     timer.
3. For a **past date** (`date=<yesterday>`), confirm `hits: []` (a real, final empty result)
   does NOT trigger any recompute attempt, with or without `refresh=1` — `fillMissingMarkets`
   returns immediately for non-today dates before `emptyToday` is even considered.
4. Confirm markets that already have non-empty `candidates` for today are left untouched by
   `refresh=1` (no recompute, no log entries for those markets).
5. Confirm `ensureEdgesTable`/`saveEdges`/AI-scoring pipeline in `dailyAiSnapshot.js` is
   completely untouched (this task doesn't modify that file at all).
