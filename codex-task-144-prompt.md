# CODEX TASK 144 — Self-healing `/api/board/snapshot` (on-demand fallback)

## Background

The iOS team confirmed (see `board-hr-hits-missing-keys.md`) that on some dates
`GET /api/board/snapshot?date=YYYY-MM-DD` is missing the `hr` and `hits` keys
entirely, while `k` and `outs` are present with 20 candidates each.

Root cause: `backend/jobs/dailyAiSnapshot.js` computes all 10 board markets
(`k, outs, hits, hr, nrfi, total, spread, ml, f5ml, f5spread`) once at 10 AM
Honolulu and again ~95 min before first pitch. For `hr`/`hits`,
`computeBatterBoard()` depends on `liveLineups` having confirmed-or-roster
batters for that day's games. If at **both** snapshot runs no game yet has
lineup data for a market, `computeBatterBoard()` returns `[]`. Two stacked
guards then suppress that result entirely:

```js
// dailyAiSnapshot.js — boardMarkets loop
for (const { market, candidates: marketCandidates } of boardMarkets) {
  if (!marketCandidates?.length) continue;   // <-- guard #1, skips empty markets
  ...
  if (await saveBoardSnapshot(slateDate, market, withSummaries)) boardSnapshotsSaved++;
}
```

```js
// saveBoardSnapshot
async function saveBoardSnapshot(slateDate, market, candidatesWithSummaries) {
  if (!db.isConnected() || !candidatesWithSummaries.length) return false; // <-- guard #2
  ...
}
```

Result: **no row is ever written** to `board_daily_snapshots` for
`(slate_date, 'hr')` / `(slate_date, 'hits')` on those dates, so
`/api/board/snapshot` never includes those keys at all — which is what the
iOS client observed.

The web app doesn't hit this because it computes HR/Hits live, client-side,
from `computeBatterBoard()` directly (showing "LINEUP TBD" roster-based
candidates).

## Goal

Make `/api/board/snapshot` **self-healing**:

1. For **today's** date (Honolulu), if any of the 10 `BOARD_MARKETS` keys are
   missing from the DB snapshot, compute them **on-demand** (live, in the
   request handler) using the same board-compute pipeline as the cron job,
   write the result back to `board_daily_snapshots` (so future requests and
   the next cron run both benefit), and include the result in the response.
2. Always include all 10 `BOARD_MARKETS` keys in the response payload — even
   as `[]` — so clients can distinguish "computed, no candidates right now"
   from "not yet computed" (per iOS team's request #4).
3. Stop permanently suppressing empty results in the cron job — write `[]`
   rows so the table reflects "we tried and got nothing" rather than leaving
   a gap forever.
4. Avoid duplicating the ~250-line live-data-gathering pipeline: extract it
   into a shared module used by both the cron job and the on-demand route.

This is an **on-demand live-compute fallback**, not a UI/decoding change —
nothing in `src/board/index.js`, `src/scoring/*`, or the iOS app needs to
change for this task.

## Files to change

### 1. NEW FILE: `backend/services/liveBoardData.js`

Move the live-data-gathering helpers out of `backend/jobs/dailyAiSnapshot.js`
into this new shared module, and add two new exports:
`gatherLiveBoardData(activeSlate)` and `computeMarketCandidates(market, activeSlate, liveData)`.

```js
/**
 * Shared live-data gathering + board-market computation.
 * Used by:
 *   - backend/jobs/dailyAiSnapshot.js (scheduled snapshot generation)
 *   - backend/routes/boardDailySnapshot.js (on-demand fallback for missing markets)
 */

const axios = require("axios");
const cache = require("./cache");
const { getNrfiForGame } = require("../routes/nrfi");
const { getOddsMap }     = require("../routes/odds");

const BASE_URL = () => `http://localhost:${process.env.PORT ?? 3001}`;

async function internalGet(path) {
  try {
    const res = await axios.get(`${BASE_URL()}${path}`, { timeout: 12000 });
    return res.data;
  } catch {
    return null;
  }
}

async function internalPost(path, body) {
  try {
    const res = await axios.post(`${BASE_URL()}${path}`, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 20000,
    });
    return res.data;
  } catch {
    return null;
  }
}

// ── Weather (moved verbatim from dailyAiSnapshot.js) ───────────────────────

const WEATHER_TTL_MS = 60 * 60 * 1000;
const STADIUMS_GEO = {
  /* ... copy the full STADIUMS_GEO object verbatim from
     backend/jobs/dailyAiSnapshot.js lines ~71-100 ... */
};

const WMO_CODES = {
  /* ... copy WMO_CODES verbatim from dailyAiSnapshot.js ... */
};

function stadiumHour(gameTimeIso, tz) { /* copy verbatim */ }
function isHrFavorable(direction, speed, orientation) { /* copy verbatim */ }
async function buildWeatherMap(schedule) { /* copy verbatim */ }

// ── Gather all live data needed for board scoring ───────────────────────────

/**
 * Fetches everything computeBatterBoard / computePitcherBoard / computeGameBoard
 * need, for a given active slate. Mirrors steps 2-6 of
 * dailyAiSnapshot.generateDailyAiSnapshot().
 */
async function gatherLiveBoardData(activeSlate) {
  const [oddsMap, ...nrfiArr] = await Promise.all([
    getOddsMap().catch(() => null),
    ...activeSlate.map(g => getNrfiForGame(g.gamePk).catch(() => null)),
  ]);
  const liveNrfiData = Object.fromEntries(activeSlate.map((g, i) => [g.gamePk, nrfiArr[i]]));
  const liveWeather  = await buildWeatherMap(activeSlate).catch(() => ({}));

  const liveLineups     = {};
  const liveUmpires     = {};
  const livePlayerProps = {};
  await Promise.allSettled(activeSlate.map(async game => {
    const [lineups, umpires, props] = await Promise.all([
      internalGet(`/api/lineups/${game.gamePk}`),
      internalGet(`/api/umpires/${game.gamePk}`),
      internalGet(`/api/player-props/${game.gamePk}`),
    ]);
    if (lineups) liveLineups[game.gamePk] = lineups;
    if (umpires) liveUmpires[game.gamePk] = umpires;
    if (props)   livePlayerProps[String(game.gamePk)] = props;
  }));

  const liveTeamStats = {};
  const seenTeams = new Set();
  await Promise.allSettled(activeSlate.flatMap(game =>
    [{ id: game.home?.id, abbr: game.home?.abbr }, { id: game.away?.id, abbr: game.away?.abbr }]
      .filter(t => t.id && t.abbr && !seenTeams.has(t.abbr))
      .map(async t => {
        seenTeams.add(t.abbr);
        const data = await internalGet(`/api/team-stats/${t.id}`);
        if (data?.kPct != null) liveTeamStats[t.abbr] = data;
      })
  ));

  const livePitcherStats = {};
  const liveGameLog      = {};
  const pitcherArsenal   = {};
  const liveStatSplits   = {};

  const pitcherIds = [...new Set(
    activeSlate.flatMap(g => [g.probablePitchers?.home?.id, g.probablePitchers?.away?.id])
      .filter(Boolean)
  )];

  await Promise.allSettled(pitcherIds.map(async pid => {
    const [stats, gamelog, arsenal, splits] = await Promise.all([
      internalGet(`/api/players/${pid}/stats?group=pitching`),
      internalGet(`/api/players/${pid}/gamelog?group=pitching`),
      internalGet(`/api/arsenal/${pid}`),
      internalGet(`/api/stat-splits/${pid}?group=pitching`),
    ]);
    if (stats)   livePitcherStats[pid] = stats;
    if (gamelog) liveGameLog[pid]      = gamelog;
    if (arsenal?.pitcherStats) pitcherArsenal[pid] = { pitcherStats: arsenal.pitcherStats };
    if (splits)  liveStatSplits[`${pid}:pitching`] = splits;
  }));

  const liveHittingLog = {};
  const batterIds = [...new Set(
    Object.values(liveLineups)
      .flatMap(lu => [...(lu.home ?? []), ...(lu.away ?? [])])
      .slice(0, 120)
      .map(b => b?.id).filter(Boolean)
  )];

  if (batterIds.length) {
    const batchData = await internalPost("/api/players/gamelogs/batch", {
      playerIds: batterIds,
      group: "hitting",
    });
    if (batchData && typeof batchData === "object") {
      Object.assign(liveHittingLog, batchData);
    }

    const topBatterIds = batterIds.slice(0, 60);
    await Promise.allSettled(topBatterIds.map(async bid => {
      const splits = await internalGet(`/api/stat-splits/${bid}?group=hitting`);
      if (splits) liveStatSplits[`${bid}:hitting`] = splits;
    }));
  }

  return {
    oddsMap, liveNrfiData, liveWeather, liveLineups, liveUmpires,
    livePlayerProps, liveTeamStats, livePitcherStats, liveGameLog,
    pitcherArsenal, liveStatSplits, liveHittingLog,
  };
}

// ── Per-market candidate computation (dispatch table) ───────────────────────

/**
 * Computes candidates for a single board market given an already-gathered
 * liveData bundle (from gatherLiveBoardData). Mirrors the boardMarkets
 * array built in dailyAiSnapshot.generateDailyAiSnapshot().
 */
async function computeMarketCandidates(market, activeSlate, liveData) {
  const board = await import("../../src/board/index.js");
  const { computePitcherBoard, computeBatterBoard, computeGameBoard } = board;

  const {
    oddsMap, liveNrfiData, liveWeather, liveLineups, liveUmpires,
    livePlayerProps, liveTeamStats, livePitcherStats, liveGameLog,
    pitcherArsenal, liveStatSplits, liveHittingLog,
  } = liveData;

  switch (market) {
    case "k":
      return computePitcherBoard("k", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal);
    case "outs":
      return computePitcherBoard("outs", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal);
    case "hits":
      return computeBatterBoard("hits", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits);
    case "hr":
      return computeBatterBoard("hr", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits);
    case "nrfi":
    case "total":
    case "spread":
    case "ml":
    case "f5ml":
    case "f5spread":
      return computeGameBoard(market, activeSlate, liveNrfiData, liveWeather, oddsMap ?? {}, livePitcherStats, liveUmpires, liveLineups);
    default:
      return [];
  }
}

module.exports = {
  internalGet,
  internalPost,
  buildWeatherMap,
  gatherLiveBoardData,
  computeMarketCandidates,
};
```

**Note on `STADIUMS_GEO` / `WMO_CODES` / `stadiumHour` / `isHrFavorable` /
`buildWeatherMap`**: copy these verbatim from
`backend/jobs/dailyAiSnapshot.js` (currently around lines 71-176). Do not
rewrite the stadium coordinate table by hand — copy/paste it exactly to avoid
typos.

---

### 2. NEW FILE: `backend/services/boardSnapshotDb.js`

Extract the `board_daily_snapshots` table helpers into their own module so
both the cron job and the route can read/write snapshot rows without
importing each other.

```js
const db = require("./db");

const BOARD_MARKETS = ["k", "outs", "hits", "hr", "nrfi", "total", "spread", "ml", "f5ml", "f5spread"];

async function ensureBoardSnapshotsTable() {
  if (!db.isConnected()) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS board_daily_snapshots (
      slate_date   DATE         NOT NULL,
      market       TEXT         NOT NULL,
      candidates   JSONB        NOT NULL,
      generated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      PRIMARY KEY  (slate_date, market)
    )
  `);
}

/**
 * Upserts a board snapshot row. Unlike the old implementation, this WRITES
 * empty arrays too — an empty `[]` row means "we computed this market and
 * there's genuinely nothing to show", which is different from "never
 * computed" (no row at all).
 */
async function saveBoardSnapshot(slateDate, market, candidates) {
  if (!db.isConnected()) return false;
  try {
    await ensureBoardSnapshotsTable();
    await db.query(
      `INSERT INTO board_daily_snapshots (slate_date, market, candidates, generated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (slate_date, market) DO UPDATE
         SET candidates = $3, generated_at = NOW()`,
      [slateDate, market, JSON.stringify(candidates ?? [])]
    );
    return true;
  } catch (err) {
    console.warn(`  ⚠ boardSnapshotDb: saveBoardSnapshot failed for ${market}: ${err.message}`);
    return false;
  }
}

/** Returns the set of markets that already have a row for slateDate. */
async function getSnapshotMarkets(slateDate) {
  if (!db.isConnected()) return new Set();
  try {
    const result = await db.query(
      `SELECT market FROM board_daily_snapshots WHERE slate_date = $1`,
      [slateDate]
    );
    return new Set((result?.rows ?? []).map(r => r.market));
  } catch (err) {
    console.warn(`  ⚠ boardSnapshotDb: getSnapshotMarkets failed: ${err.message}`);
    return new Set();
  }
}

module.exports = {
  BOARD_MARKETS,
  ensureBoardSnapshotsTable,
  saveBoardSnapshot,
  getSnapshotMarkets,
};
```

---

### 3. EDIT `backend/jobs/dailyAiSnapshot.js`

3a. **Remove** the now-duplicated helpers and import from the new shared
modules instead:

- Remove `internalGet`, `internalPost`, `BASE_URL`, `WEATHER_TTL_MS`,
  `STADIUMS_GEO`, `WMO_CODES`, `stadiumHour`, `isHrFavorable`,
  `buildWeatherMap` (the whole "Weather (inlined from slateBundle)" block,
  roughly lines 45-176).
- Remove the local `saveBoardSnapshot` function (but **keep**
  `ensureEdgesTable` and `saveEdges` — those manage `ai_board_edges`, which
  is unrelated to this task. It's fine that `ensureEdgesTable` *also*
  contains a `CREATE TABLE IF NOT EXISTS board_daily_snapshots` — leave that
  alone too, `CREATE TABLE IF NOT EXISTS` is idempotent and harmless next to
  `ensureBoardSnapshotsTable()`).
- Add imports near the top:

```js
const { gatherLiveBoardData, computeMarketCandidates } = require("../services/liveBoardData");
const { saveBoardSnapshot } = require("../services/boardSnapshotDb");
```

3b. **Replace steps 2-6** (shared maps, lineups/umpires/props fan-out, team
stats, pitcher stats/gamelog/arsenal/splits, batter gamelogs/splits —
currently roughly lines 379-465) with a single call:

```js
  // ── 2-6. Gather all live data needed for board scoring ───────────────────
  const liveData = await gatherLiveBoardData(activeSlate);
  const {
    oddsMap, liveNrfiData, liveWeather, liveLineups, liveUmpires,
    livePlayerProps, liveTeamStats, livePitcherStats, liveGameLog,
    pitcherArsenal, liveStatSplits, liveHittingLog,
  } = liveData;

  console.log(`  · pitchers=${Object.keys(livePitcherStats).length}  teamStats=${Object.keys(liveTeamStats).length}`);
```

This must run **before** step 7 (board scoring), since `buildAiBoardPayload`
and the per-market candidate builders consume these variables exactly as
before — only the gathering code moved, the variable names and shapes are
unchanged.

3c. In step "10. Pre-snapshot all board markets", replace the per-market
candidate computations (`kCandidates`, `outsCandidates`, `hitsCandidates`,
`hrCandidates`, `gameCandidates` pieces used in `boardMarkets`, etc.) with
calls to `computeMarketCandidates`. The `boardMarkets` array becomes:

```js
  const boardMarkets = [];
  for (const market of BOARD_MARKETS_FOR_SNAPSHOT) {
    boardMarkets.push({
      market,
      candidates: await computeMarketCandidates(market, activeSlate, liveData),
    });
  }
```

where `BOARD_MARKETS_FOR_SNAPSHOT` is the existing
`["k", "outs", "hits", "hr", "nrfi", "total", "spread", "ml", "f5ml", "f5spread"]`
array (you can import `BOARD_MARKETS` from `../services/boardSnapshotDb`
instead of redeclaring it).

> ⚠️ Step 7's `candidates` (from `buildAiBoardPayload`) and `gameCandidates`
> (used for the `allCandidates` / AI-scoring / edges / card-summary list,
> currently lines ~487-501) are a **separate concern** from the
> `boardMarkets` snapshot list — those still need their own
> `computeGameBoard("total"/"nrfi"/"ml", ...)` etc. calls for the
> AI-scoring/edges pipeline (capped with `.slice(0, 12)`), exactly as today.
> Only the **`boardMarkets` snapshot list** (step 10) should be rewritten to
> use `computeMarketCandidates`. Don't remove or restructure the
> `allCandidates` / `edges` / `summaryCards` logic — that's out of scope.

3d. **Remove the empty-result guard** in the `boardMarkets` loop:

```js
  for (const { market, candidates: marketCandidates } of boardMarkets) {
    if (!marketCandidates?.length) continue;   // <-- DELETE this line
```

With `saveBoardSnapshot` now writing `[]` rows, an empty market will still
get a row (`candidates: []`), which is what makes the response include the
key going forward. The `summaryInput` / `generateCardSummaries` block below
already handles `marketCandidates = []` fine (`.slice(0, 30)` on an empty
array → `[]`, `generateCardSummaries([])` should be a no-op — if it's not,
guard it with `if (marketCandidates.length) { ... } else { summaryMap = {}; }`).

3e. Update the final count log — `boardSnapshotsSaved` will now realistically
hit `boardMarkets.length` every run (since empty arrays save successfully
too). That's fine; the `throw new Error("board snapshots failed to persist...")`
branch should now only fire if `db.isConnected()` is false or every single
`saveBoardSnapshot` call throws — i.e. a real DB problem. Leave the
`throw` as-is.

---

### 4. EDIT `backend/routes/boardDailySnapshot.js`

Add the on-demand fallback. Full replacement file:

```js
const express = require("express");
const cache = require("../services/cache");
const db = require("../services/db");
const { buildSchedulePayloadForJob } = require("./schedule");
const { gatherLiveBoardData, computeMarketCandidates } = require("../services/liveBoardData");
const { BOARD_MARKETS, saveBoardSnapshot, getSnapshotMarkets } = require("../services/boardSnapshotDb");

const router = express.Router();

const SNAPSHOT_TTL = 5 * 60 * 1000;
const FALLBACK_BUDGET_MS = 9000;          // overall time budget for on-demand compute
const NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000; // don't retry an empty market for 10 min

function todayHonolulu() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}

// In-flight de-dupe: at most one live-compute pass per date at a time.
const _inFlight = new Map(); // date -> Promise<liveData|null>

// Negative cache: market computed empty recently, don't retry yet.
const _emptyMarketAt = new Map(); // `${date}:${market}` -> timestamp

async function getLiveData(date, activeSlate) {
  if (_inFlight.has(date)) return _inFlight.get(date);
  const p = gatherLiveBoardData(activeSlate)
    .catch(err => {
      console.warn(`  ⚠ board/snapshot: gatherLiveBoardData failed: ${err.message}`);
      return null;
    })
    .finally(() => _inFlight.delete(date));
  _inFlight.set(date, p);
  return p;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve("__timeout__"), ms)),
  ]);
}

/**
 * Fills any missing BOARD_MARKETS keys in `payload` for `date` via on-demand
 * live compute, writing successful results back to board_daily_snapshots.
 * Always leaves every BOARD_MARKETS key present in `payload` (possibly []).
 */
async function fillMissingMarkets(date, payload) {
  const missing = BOARD_MARKETS.filter(m => !(m in payload));
  if (!missing.length) return;

  const isToday = date === todayHonolulu();
  if (!isToday) {
    // Don't live-compute for past dates — just present the gap as empty.
    for (const m of missing) payload[m] = [];
    return;
  }

  const stillMissing = [];
  for (const m of missing) {
    const negKey = `${date}:${m}`;
    const negAt = _emptyMarketAt.get(negKey);
    if (negAt && Date.now() - negAt < NEGATIVE_CACHE_TTL_MS) {
      payload[m] = []; // recently confirmed empty, don't recompute yet
    } else {
      stillMissing.push(m);
    }
  }
  if (!stillMissing.length) return;

  let activeSlate;
  try {
    const schedule = await buildSchedulePayloadForJob(date);
    activeSlate = schedule.filter(g =>
      ["Scheduled", "Pre-Game", "Warmup", "In Progress"].includes(g.status)
    );
  } catch (err) {
    console.warn(`  ⚠ board/snapshot: schedule fetch failed: ${err.message}`);
    activeSlate = [];
  }

  if (!activeSlate.length) {
    for (const m of stillMissing) payload[m] = [];
    return;
  }

  const liveData = await withTimeout(getLiveData(date, activeSlate), FALLBACK_BUDGET_MS);
  if (liveData === "__timeout__" || !liveData) {
    // Couldn't gather live data in time — present gaps as empty for now,
    // don't negative-cache (a future request may succeed once data warms up).
    for (const m of stillMissing) payload[m] = [];
    return;
  }

  await Promise.allSettled(stillMissing.map(async market => {
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
    // Write-through so the cron job and future requests see this immediately.
    await saveBoardSnapshot(date, market, candidates);
  }));
}

// GET /api/board/snapshot?date=YYYY-MM-DD
router.get("/snapshot", async (req, res) => {
  const date = req.query.date ?? todayHonolulu();
  const cacheKey = `board-daily-snapshot:${date}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
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
    let usedFallback = false;
    if (BOARD_MARKETS.some(m => !(m in payload))) {
      usedFallback = true;
      await fillMissingMarkets(date, payload);
    }

    if (!hadAnyRows && !Object.keys(payload).some(k => BOARD_MARKETS.includes(k) && payload[k]?.length)) {
      // Still nothing at all (e.g. past date with no snapshot, or no active
      // slate today) — preserve the old "no_snapshot" shape for clients that
      // branch on `empty`.
      if (!payload.generatedAt && BOARD_MARKETS.every(m => (payload[m] ?? []).length === 0)) {
        return res.json({ empty: true, reason: "no_snapshot", date });
      }
    }

    if (payload.generatedAt == null) payload.generatedAt = new Date().toISOString();

    // Don't cache responses that were patched via on-demand fallback for
    // "today" — a later cron run or a follow-up request after lineups post
    // should be able to pick up real data instead of a cached empty array.
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

Notes on this route rewrite:

- `getSnapshotMarkets` is imported but not directly used in the snippet above
  — it's exported from `boardSnapshotDb.js` for potential reuse/tests; if you
  don't end up needing it here, it's fine to leave unused-but-exported, or
  remove the import if your linter complains about unused imports.
- The `empty: true, reason: "no_snapshot"` branch is preserved for **past
  dates with zero rows** and for **today with zero active games** (e.g.
  off-day), so existing client handling of that shape doesn't regress.
- For **today with at least one active game**, even if the DB had zero rows,
  `fillMissingMarkets` will attempt a live compute for all 10 markets and the
  response will include real `[]`/populated arrays instead of `{empty:true}`.

---

## What NOT to change

- `src/board/index.js` (`computePitcherBoard`, `computeBatterBoard`,
  `computeGameBoard`, `buildAiBoardPayload`) — no changes needed.
- `src/scoring/batter.js`, `src/scoring/pitcher.js` — no changes.
- The `allCandidates` / AI-scoring / `ai_board_edges` / `card_summaries`
  pipeline in `dailyAiSnapshot.js` (steps 7-9) — only the data-gathering
  (steps 2-6) and the `boardMarkets` snapshot list (step 10) are refactored.
- `backend/routes/modelF5.js` — has its own unrelated `BASE_URL` constant
  (`process.env.BACKEND_URL ?? http://127.0.0.1:${PORT}`). Do not touch it or
  try to consolidate it with `liveBoardData.js`'s `BASE_URL` — they're
  different modules with different env-var fallbacks.
- `ensureEdgesTable()` / `saveEdges()` in `dailyAiSnapshot.js` — keep as-is
  (manage `ai_board_edges`, unrelated to this task; harmless overlap with
  `ensureBoardSnapshotsTable()`'s `CREATE TABLE IF NOT EXISTS`).
- iOS app / `Models/BoardModels.swift` — no changes. `decodeIfPresent` on
  optional arrays already handles `[]` correctly; this task ensures the keys
  are present going forward but doesn't require any client change.
- `backend/jobs/scheduler.js` cron schedule — unchanged. The on-demand
  fallback is a safety net for gaps between cron runs, not a replacement for
  them.

## Verification

1. `node -e "require('./backend/services/liveBoardData.js')"` and
   `node -e "require('./backend/services/boardSnapshotDb.js')"` from
   `backend/` — both should load without throwing (catches syntax errors and
   missing-export typos).
2. `node -e "require('./backend/jobs/dailyAiSnapshot.js')"` — should still
   load cleanly after removing the inlined helpers.
3. Confirm `STADIUMS_GEO` and `WMO_CODES` in `liveBoardData.js` have the same
   number of entries as the originals in `dailyAiSnapshot.js` (diff the two
   objects, or `grep -c` on the dictionary keys) — a copy/paste error here
   would silently break weather for specific stadiums.
4. Start the backend locally with `DATABASE_PUBLIC_URL` set, then:
   - `curl "http://localhost:3001/api/board/snapshot?date=$(date +%F)"` for
     today's date. Confirm the response includes all 10 keys
     (`k, outs, hits, hr, nrfi, total, spread, ml, f5ml, f5spread`), each an
     array (possibly empty), plus `date` and `generatedAt`.
   - Check the response header `X-Cache` — first request for a date with
     gaps should be `FALLBACK`; a request for a date with a complete DB
     snapshot should be `MISS` then `HIT` on the next call within 5 minutes.
5. Query Postgres after step 4:
   `SELECT slate_date, market, jsonb_array_length(candidates), generated_at FROM board_daily_snapshots WHERE slate_date = CURRENT_DATE ORDER BY market;`
   — confirm rows now exist for `hr`/`hits` (even if `jsonb_array_length = 0`)
   for today, where previously they were absent.
6. Run the existing test suite (`npm test` or equivalent) to confirm nothing
   in `dailyAiSnapshot.js`'s refactored data-gathering broke
   `buildAiBoardPayload` / edges / card-summary generation — spot-check that
   `edges.length` and `summaryCards.length` in the job's log output are in
   the same ballpark as before the refactor (not suddenly 0).
7. Manually trigger `generateDailyAiSnapshot("manual-test")` (e.g. via
   `backend/scripts/runBoardSnapshot.js` if it exposes that, or a temporary
   script) and confirm it still completes and logs
   `✓ dailyAiSnapshot [...] complete  date=...  edges=N  summaries=M` with
   non-zero `boardSnapshotsSaved` (now expected to be `10/10` even on days
   with empty markets, since empty arrays now save successfully).
