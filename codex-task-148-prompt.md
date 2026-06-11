# CODEX TASK 148 — On-demand hr/hits recompute discards work on timeout (still `[]` after TASK 147)

## Status

TASK 147 (remove the `Final`-game filter from `activeSlate`) was deployed and
verified to load/parse correctly, but the iOS team re-tested on a new date
(`2026-06-11`) and got the **same symptom**: `/api/board/snapshot?date=2026-06-11&refresh=1`
returns `hits: [], hr: []` at a moment when the web's "Shared daily board"
panel (snapshot generated 3 minutes earlier, same date) shows fully populated,
`✓ CONFIRMED` Hits candidates. See
`board-hr-hits-mismatch-recurs-2026-06-11.md`.

This rules out "lineups not posted yet" — confirmed lineups demonstrably
exist for this slate at this time.

## Root cause

TASK 147 was correct on its own terms (the web's `activeSlate` *is* the full
unfiltered schedule, and `computeBatterBoard` doesn't filter by status). But
it interacts badly with the **9-second fallback budget** in
`fillMissingMarkets`:

```js
const FALLBACK_BUDGET_MS = 9000;
...
const liveData = await withTimeout(getLiveData(date, activeSlate), FALLBACK_BUDGET_MS);
if (liveData === "__timeout__" || !liveData) {
  for (const market of stillMissing) {
    if (!(market in payload)) payload[market] = [];
    _emptyMarketAt.set(`${date}:${market}`, Date.now());
  }
  return;   // <-- the in-flight gatherLiveBoardData() work is thrown away
}
```

`gatherLiveBoardData(activeSlate)` (`backend/services/liveBoardData.js`) does,
**sequentially**: odds/NRFI → weather → per-game lineups/umpires/player-props
→ per-team stats → per-pitcher stats/gamelog/arsenal/splits → hitting logs
(a batch POST for up to 120 batters, then up to 60 individual
`/api/stat-splits/:id?group=hitting` GETs, each with its own 12s timeout).

Before TASK 147, `activeSlate` was filtered down to `Scheduled`/`Pre-Game`/
`Warmup`/`In Progress` games only — a smaller slate, fewer batters/pitchers,
more likely to finish under 9s. **TASK 147 made `activeSlate` the full day's
schedule — strictly more games, more lineups, more batters, more stat-split
fetches** — which makes it *more* likely to exceed `FALLBACK_BUDGET_MS`, not
less.

When it times out:

1. `payload[market] = []` is set for `hits`/`hr` and returned to the client —
   expected for *this* request.
2. `_emptyMarketAt` is set to `Date.now()`, starting a fresh 10-minute
   negative-cache window.
3. **Critically, the `gatherLiveBoardData(activeSlate)` promise is still
   running** (it's cached in `_inFlight` by `getLiveData`, keyed by `date`,
   and isn't cancelled by `withTimeout` — `withTimeout` just stops *waiting*
   for it). But nothing ever consumes its result: no
   `computeMarketCandidates()` call, no `saveBoardSnapshot()`. The completed
   live data is silently discarded.
4. Because `&refresh=1` (`force`) bypasses the negative-cache *check* but
   still *re-sets* `_emptyMarketAt` to `Date.now()` on the next timeout, every
   manual refresh can re-extend the 10-minute blackout window — `hits`/`hr`
   can stay `[]` indefinitely even though a successful `gatherLiveBoardData`
   call (taking, say, 12-15s) completes moments after each timed-out request.

Meanwhile the web's "Shared daily board" Hits tab is populated via the
client-side live-fallback (`sharedMarketOrLive`, commit `924b2db`), which runs
in the browser with no 9-second budget — so it succeeds where the
backend's time-boxed recompute gives up.

## Goal

Don't discard the in-flight `gatherLiveBoardData` result on timeout. Let it
finish in the background, compute candidates for the still-missing
markets from it, and persist them via `saveBoardSnapshot` — so the *next*
poll (web's ~90s interval, iOS's ~75s interval) reads real data from
`board_daily_snapshots` instead of being stuck behind a 10-minute negative
cache that the original attempt's work would have satisfied.

Also shorten the negative-cache window specifically for the *timeout* case
(not the "genuinely computed `[]`" case), so a follow-up poll/refresh isn't
blocked for the full 10 minutes while the background compute is still
finishing.

## File to change: `backend/routes/boardDailySnapshot.js`

### Edit 1 — extract a shared compute-and-persist helper

Find:
```js
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
```

Replace with:
```js
  const liveDataPromise = getLiveData(date, activeSlate);
  const liveData = await withTimeout(liveDataPromise, FALLBACK_BUDGET_MS);

  if (liveData === "__timeout__") {
    // gatherLiveBoardData() is still running (it's cached in `_inFlight` by
    // getLiveData and isn't cancelled). Don't discard that work — let it
    // finish in the background, compute the still-missing markets from it,
    // and persist them so the *next* poll/refresh reads real data instead of
    // being stuck behind a 10-minute negative cache. See CODEX TASK 148.
    liveDataPromise
      .then((bgLiveData) => {
        if (!bgLiveData) return null;
        return computeAndPersistMarkets(stillMissing, activeSlate, bgLiveData, date);
      })
      .catch((err) => {
        console.warn(`  ⚠ board/snapshot: background recompute failed: ${err.message}`);
      });

    // Shorter retry window than the standard negative cache: the background
    // compute above should persist real data well within this, so the next
    // poll/refresh re-reads the DB (and finds the market non-empty) instead
    // of re-triggering another recompute attempt.
    const retryAt = Date.now() - (NEGATIVE_CACHE_TTL_MS - TIMEOUT_RETRY_MS);
    for (const market of stillMissing) {
      if (!(market in payload)) payload[market] = [];
      _emptyMarketAt.set(`${date}:${market}`, retryAt);
    }
    return;
  }

  if (!liveData) {
    for (const market of stillMissing) {
      if (!(market in payload)) payload[market] = [];
      _emptyMarketAt.set(`${date}:${market}`, Date.now());
    }
    return;
  }

  await computeAndPersistMarkets(stillMissing, activeSlate, liveData, date, payload);
}

/**
 * Computes candidates for `markets` from already-gathered `liveData` and
 * persists each to `board_daily_snapshots`. Updates the `_emptyMarketAt`
 * negative cache based on the actual outcome (cleared on success, set on
 * genuine empty result). If `payload` is provided, also writes the computed
 * candidates into it (used by the synchronous request path; omitted for the
 * background/timeout path since the response has already been sent).
 */
async function computeAndPersistMarkets(markets, activeSlate, liveData, date, payload) {
  await Promise.allSettled(markets.map(async (market) => {
    let candidates = [];
    try {
      candidates = await computeMarketCandidates(market, activeSlate, liveData);
    } catch (err) {
      console.warn(`  ⚠ board/snapshot: on-demand compute failed for ${market}: ${err.message}`);
    }
    if (payload) payload[market] = candidates;
    if (!candidates.length) {
      _emptyMarketAt.set(`${date}:${market}`, Date.now());
    } else {
      _emptyMarketAt.delete(`${date}:${market}`);
    }
    await saveBoardSnapshot(date, market, candidates);
  }));
}
```

### Edit 2 — add the `TIMEOUT_RETRY_MS` constant

Find:
```js
const SNAPSHOT_TTL = 5 * 60 * 1000;
const FALLBACK_BUDGET_MS = 9000;
const NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000;
```

Replace with:
```js
const SNAPSHOT_TTL = 5 * 60 * 1000;
const FALLBACK_BUDGET_MS = 9000;
const NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000;
// On a request timeout (gatherLiveBoardData still running in the background),
// only block re-attempts for this long, not the full negative-cache TTL —
// the background compute kicked off in the timeout branch should persist
// real data well within this window if the slate has any.
const TIMEOUT_RETRY_MS = 45 * 1000;
```

## What NOT to change

- Don't change `src/board/index.js`, `gatherLiveBoardData`,
  `computeMarketCandidates`, or the web client (`prop-scout-v7.jsx`).
- Don't change `FALLBACK_BUDGET_MS` itself, or the `activeSlate` change from
  TASK 147.
- Don't change the `getLiveData`/`_inFlight` caching mechanism — this task
  relies on it already keeping the promise alive after `withTimeout` stops
  waiting.
- Don't change the "off day" (`!activeSlate.length`) branch or the
  non-today/`missing`-markets-on-past-dates behavior.
- The `!force && negAt && ...` negative-cache *check* near the top of
  `fillMissingMarkets` is unchanged — only the value written to
  `_emptyMarketAt` in the timeout branch changes (shorter effective window via
  `TIMEOUT_RETRY_MS`), and only a genuinely-empty compute result still uses
  the full `NEGATIVE_CACHE_TTL_MS` (via `Date.now()` in
  `computeAndPersistMarkets`).

## Verification

1. `node -e "require('./backend/routes/boardDailySnapshot.js')"` loads without
   error.
2. On a day/time where `gatherLiveBoardData` for the full slate takes longer
   than 9s (likely most mornings with a full schedule):
   - First `GET /api/board/snapshot?date=<today>&refresh=1` while
     `hits`/`hr` are `[]`: response returns promptly (within
     `FALLBACK_BUDGET_MS`) with `hits: [], hr: []` (unchanged from before —
     this request still can't wait).
   - Within ~10-20s after that response, confirm (via logs or a follow-up
     direct DB check) that `board_daily_snapshots` rows for `hits`/`hr` for
     today now have non-empty `candidates`, with `generated_at` updated.
   - A **second** `GET /api/board/snapshot?date=<today>` (no refresh, ~30-90s
     later) returns non-empty `hits`/`hr` arrays read from the DB.
3. On a slate where `gatherLiveBoardData` finishes *within* 9s (small slate /
   warm caches): behavior is unchanged from TASK 147 — `hits`/`hr` populate
   on the same request that triggered the recompute.
4. Confirm `k`/`outs` and game markets (`nrfi`/`total`/`spread`/`ml`) are
   unaffected — same `computeAndPersistMarkets` path as before, just
   refactored.
5. Confirm a **past date** (`date=<yesterday>`) is unaffected —
   `fillMissingMarkets` returns immediately for non-today dates before this
   code path is reached.
6. Confirm an off day (`activeSlate.length === 0`) is unaffected — that
   branch returns before reaching this code.
