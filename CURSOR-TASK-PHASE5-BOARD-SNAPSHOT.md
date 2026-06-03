# Cursor Task — Phase 5: Pre-snapshot All Board Results

## Problem

Every time a user opens the Board, the frontend computes scores **in the browser** using live data it fetched independently:

```js
computePitcherBoard("k",    activeSlate, livePitcherStats, ...)
computePitcherBoard("outs", activeSlate, livePitcherStats, ...)
computeBatterBoard("hits",  activeSlate, liveLineups, ...)
computeBatterBoard("hr",    activeSlate, liveLineups, ...)
computeGameBoard("nrfi",    activeSlate, liveNrfiData, ...)
computeGameBoard("total",   activeSlate, liveNrfiData, ...)
computeGameBoard("spread",  activeSlate, liveNrfiData, ...)
computeGameBoard("ml",      activeSlate, liveNrfiData, ...)
computeGameBoard("f5ml",    activeSlate, liveNrfiData, ...)
computeGameBoard("f5spread",activeSlate, liveNrfiData, ...)
```

Each user fetches weather at a different moment, so wind speed/direction can differ slightly → different factor scores → different card rankings. Card text is then generated via `POST /api/card-summary` (Haiku). On cold start, two users hit the AI simultaneously before either result saves to DB, and both see different AI-generated text.

Result: Two users opening the Board in parallel see different confidence numbers and different summary sentences for the same game — even though the slate is identical.

---

## Goal

1. Add a `board_daily_snapshots` table
2. Extend `dailyAiSnapshot.js` to also compute **all ten board markets** server-side and save results (including pre-generated summaries) to `board_daily_snapshots`
3. Add `GET /api/board/snapshot` route that reads from this table
4. Update `prop-scout-v7.jsx` Board tab to read from the snapshot first; fall back to local compute only when no snapshot exists

After this change: all users reading the Board on the same day see **identical** scores and **identical** summaries — because they all read the same DB row written by one cron job.

---

## New table

Add inside `ensureEdgesTable()` in `dailyAiSnapshot.js` (right after the `ai_board_edges` table):

```js
await db.query(`
  CREATE TABLE IF NOT EXISTS board_daily_snapshots (
    slate_date   DATE         NOT NULL,
    market       TEXT         NOT NULL,
    candidates   JSONB        NOT NULL,
    generated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY  (slate_date, market)
  )
`);
```

---

## Step 1 — Extend `dailyAiSnapshot.js` to compute all board markets

### 1a — Add imports

At the top of `generateDailyAiSnapshot`, after the existing dynamic import of `buildAiBoardPayload` and `computeGameBoard`, also import the missing board functions:

```js
let buildAiBoardPayload, computeGameBoard, computePitcherBoard, computeBatterBoard;
try {
  const board = await import("../../src/board/index.js");
  buildAiBoardPayload  = board.buildAiBoardPayload;
  computeGameBoard     = board.computeGameBoard;
  computePitcherBoard  = board.computePitcherBoard;
  computeBatterBoard   = board.computeBatterBoard;
} catch (err) {
  console.warn("  ⚠ dailyAiSnapshot: board import failed:", err.message);
  return;
}
```

### 1b — Compute all board markets

After the existing `gameCandidates` block (which already computes total, nrfi, ml), add:

```js
// Board-specific markets not already in gameCandidates
const spreadCandidates   = computeGameBoard("spread",   activeSlate, liveNrfiData, liveWeather, oddsMap ?? {}, livePitcherStats, liveUmpires, liveLineups);
const f5spreadCandidates = computeGameBoard("f5spread", activeSlate, liveNrfiData, liveWeather, oddsMap ?? {}, livePitcherStats, liveUmpires, liveLineups);
const f5mlCandidates     = computeGameBoard("f5ml",     activeSlate, liveNrfiData, liveWeather, oddsMap ?? {}, livePitcherStats, liveUmpires, liveLineups);
const kCandidates        = computePitcherBoard("k",    activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal);
const outsCandidates     = computePitcherBoard("outs",  activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal);
const hitsCandidates     = computeBatterBoard("hits",   activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits);
const hrCandidates       = computeBatterBoard("hr",     activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits);
```

(The `gameCandidates` block already has total, nrfi, ml — leave those as-is.)

### 1c — Pre-generate summaries and save to DB

Add a new helper function `saveBoardSnapshot` in `dailyAiSnapshot.js`:

```js
async function saveBoardSnapshot(slateDate, market, candidatesWithSummaries) {
  if (!db.isConnected() || !candidatesWithSummaries.length) return;
  try {
    await db.query(
      `INSERT INTO board_daily_snapshots (slate_date, market, candidates, generated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (slate_date, market) DO UPDATE
         SET candidates = $3, generated_at = NOW()`,
      [slateDate, market, JSON.stringify(candidatesWithSummaries)]
    );
  } catch (err) {
    console.warn(`  ⚠ dailyAiSnapshot: saveBoardSnapshot failed for ${market}: ${err.message}`);
  }
}
```

Then, after the existing AI scoring and `saveEdges` call, add board snapshot generation. Generate summaries for all board markets using the same `generateCardSummaries` helper already in the file:

```js
// ── 10. Pre-snapshot all board markets ──────────────────────────────────────
// Each market gets AI summaries pre-generated so all users read identical text.
const boardMarkets = [
  { market: "k",        candidates: kCandidates },
  { market: "outs",     candidates: outsCandidates },
  { market: "hits",     candidates: hitsCandidates },
  { market: "hr",       candidates: hrCandidates },
  { market: "nrfi",     candidates: computeGameBoard("nrfi",     activeSlate, liveNrfiData, liveWeather, oddsMap ?? {}, livePitcherStats, liveUmpires, liveLineups) },
  { market: "total",    candidates: computeGameBoard("total",    activeSlate, liveNrfiData, liveWeather, oddsMap ?? {}, livePitcherStats, liveUmpires, liveLineups) },
  { market: "spread",   candidates: spreadCandidates },
  { market: "ml",       candidates: computeGameBoard("ml",       activeSlate, liveNrfiData, liveWeather, oddsMap ?? {}, livePitcherStats, liveUmpires, liveLineups) },
  { market: "f5ml",     candidates: f5mlCandidates },
  { market: "f5spread", candidates: f5spreadCandidates },
];

for (const { market, candidates } of boardMarkets) {
  if (!candidates?.length) continue;

  // Build summary cards for AI text generation
  const summaryInput = candidates.slice(0, 30).map(c => ({
    id:        String(c.id ?? c.gamePk ?? `${market}-${Math.random()}`),
    market,
    lean:      c.leanAbbr ?? c.lean ?? "",
    score:     c.score ?? 50,
    scoreTier: (c.score ?? 0) >= 75 ? "high" : (c.score ?? 0) >= 55 ? "mid" : "low",
    positives: [],  // computed inside generateCardSummaries via signals
    negatives: [],
    caution:   null,
    signals:   Array.isArray(c.signals) ? c.signals.slice(0, 4) : [],
    name:      c.name ?? null,
    hand:      c.hand ?? null,
    facingTeam: c.facingTeam ?? null,
    avgK3:     c.avgK3 ?? null,
    avgIP:     c.avgIP ?? null,
    era:       c.era ?? null,
    whip:      c.whip ?? null,
    oppKPct:   c.oppKPct ?? null,
    umpire:    c.umpire ?? null,
    umpireRating: c.umpireRating ?? null,
    bookLine:  c.bookLine ?? null,
    windFav:   c.windFav ?? false,
    matchup:   c.away && c.home ? `${c.away.abbr ?? ""} (away) @ ${c.home.abbr ?? ""} (home)` : null,
  }));

  let summaryMap = {};
  try {
    summaryMap = await generateCardSummaries(summaryInput);
  } catch (err) {
    console.warn(`  ⚠ dailyAiSnapshot: board summary gen failed for ${market}: ${err.message}`);
  }

  const withSummaries = candidates.map((c, idx) => {
    const sid = summaryInput[idx]?.id;
    return {
      ...c,
      _boardSummary: (sid && summaryMap[sid]) ? summaryMap[sid] : null,
    };
  });

  await saveBoardSnapshot(slateDate, market, withSummaries);
}
console.log(`  ✓ dailyAiSnapshot: board snapshots saved for ${boardMarkets.length} markets`);
```

**Important:** The nrfi/total/ml calls above re-run `computeGameBoard` for those three markets since those variables (`gameCandidates`) are a merged slice and not broken out by market. This is fine — they're cheap deterministic functions.

Also ensure `board_daily_snapshots` table is created. Add to `ensureEdgesTable()`:

```js
async function ensureEdgesTable() {
  if (!db.isConnected()) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS ai_board_edges (
      ...existing...
    )
  `);
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
```

---

## Step 2 — Add `GET /api/board/snapshot` route

Create `backend/routes/boardDailySnapshot.js`:

```js
const express = require("express");
const router  = express.Router();
const cache   = require("../services/cache");
const db      = require("../services/db");

const BOARD_MARKETS = ["k", "outs", "hits", "hr", "nrfi", "total", "spread", "ml", "f5ml", "f5spread"];
const SNAPSHOT_TTL  = 5 * 60 * 1000; // 5 min — snapshot updates once or twice a day

function todayHonolulu() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}

// GET /api/board/snapshot?date=YYYY-MM-DD
// Returns { k: [...], outs: [...], ... } with pre-computed candidates and summaries.
// Returns { empty: true } when no snapshot exists (cold start / before 10 AM).
router.get("/", async (req, res) => {
  const date     = req.query.date ?? todayHonolulu();
  const cacheKey = `board-snapshot:${date}`;

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

    if (!result?.rows?.length) {
      return res.json({ empty: true, reason: "no_snapshot" });
    }

    const payload = { generatedAt: result.rows[0]?.generated_at ?? null };
    for (const row of result.rows) {
      if (BOARD_MARKETS.includes(row.market)) {
        payload[row.market] = Array.isArray(row.candidates) ? row.candidates : [];
      }
    }

    cache.set(cacheKey, payload, SNAPSHOT_TTL);
    res.setHeader("X-Cache", "MISS");
    return res.json(payload);
  } catch (err) {
    console.warn(`  ⚠ board-snapshot GET failed: ${err.message}`);
    return res.status(502).json({ error: "DB unavailable", detail: err.message });
  }
});

module.exports = router;
```

Mount in `backend/server.js`:

```js
app.use("/api/board",          require("./routes/boardDailySnapshot"));
```

(Note: `boardSnapshot.js` is mounted separately under `/api/board-snapshot` — this new route is `/api/board/snapshot`.)

---

## Step 3 — Update `prop-scout-v7.jsx` Board tab

### 3a — Add state

Near the existing board state (around where `aiBoardData`, `aiBoardLoading` are declared), add:

```js
const [boardDailySnapshot, setBoardDailySnapshot] = useState(null);
const [boardSnapshotLoading, setBoardSnapshotLoading] = useState(false);
```

### 3b — Fetch snapshot when Board tab opens

Add a `useEffect` that fires when `view === "board"`:

```js
useEffect(() => {
  if (view !== "board") return;
  if (boardDailySnapshot !== null || boardSnapshotLoading) return;

  setBoardSnapshotLoading(true);
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
  apiFetch(`/api/board/snapshot?date=${date}`)
    .then(data => {
      if (data && !data.empty) {
        setBoardDailySnapshot(data);
      } else {
        setBoardDailySnapshot(null); // no snapshot yet — fall back to local compute
      }
    })
    .catch(() => setBoardDailySnapshot(null))
    .finally(() => setBoardSnapshotLoading(false));
}, [view]); // eslint-disable-line react-hooks/exhaustive-deps
```

### 3c — Use snapshot in Board rendering

Find the Board tab rendering section. The pattern for each market is:

```js
// CURRENT (local compute):
const cards = computePitcherBoard("k", activeSlate, livePitcherStats, ...);
```

Replace with a snapshot-first pattern. Add a helper near the top of the component (outside JSX):

```js
// Returns snapshot candidates for a board market, or null if no snapshot loaded yet.
// The fallback (null) causes the render to use local compute.
const getBoardMarket = (market) => {
  if (!boardDailySnapshot || boardDailySnapshot.empty) return null;
  const snapshotCards = boardDailySnapshot[market];
  return Array.isArray(snapshotCards) && snapshotCards.length > 0 ? snapshotCards : null;
};
```

Then in each render path, use it like:

```js
// K tab
const kCards = getBoardMarket("k") ?? computePitcherBoard("k", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal);

// Outs tab
const outsCards = getBoardMarket("outs") ?? computePitcherBoard("outs", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal);

// Hits tab
const hitsCards = getBoardMarket("hits") ?? computeBatterBoard("hits", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits);

// HR tab
const hrCards = getBoardMarket("hr") ?? computeBatterBoard("hr", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits);

// Games tab (gameSubTab is e.g. "spread", "nrfi", etc.)
const gameCards = getBoardMarket(gameSubTab) ?? computeGameBoard(gameSubTab, activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, blendedPitcherStatsForGameBoard, liveUmpires);
```

### 3d — Use pre-generated summaries when available

When rendering a card that came from the snapshot (has a `_boardSummary` field), skip the `card-summary` call and use `_boardSummary` directly as the italic text.

Find `getCardSummaryText` or the place where the italic summary is rendered per card. Add a check:

```js
// In the card summary text getter, check for pre-generated snapshot summary first:
const summaryText = c._boardSummary 
  ?? getCardSummaryText(buildBoardSummaryRequest(c, type));
```

This means for snapshot cards, the text is already there — no `card-summary` API call fires.

---

## What NOT to change

- `computeGameBoard`, `computePitcherBoard`, `computeBatterBoard` in `src/board/index.js` — leave as-is, still used as fallback
- `POST /api/card-summary` — leave as-is, still called for non-snapshot cards (cold start, live games)
- `GET /api/ai-board/edges` — leave unchanged, still used by AI Board and Predict tabs
- `dailyAiSnapshot` existing logic — the new board snapshot code is additive (runs after the existing AI edges are saved)
- `backend/routes/boardSnapshot.js` (the per-game lock/history snapshot) — different feature, leave it alone

---

## Acceptance criteria

- [ ] `board_daily_snapshots` table created on server start
- [ ] After `generateDailyAiSnapshot` runs, `SELECT market, jsonb_array_length(candidates) FROM board_daily_snapshots WHERE slate_date = TODAY` shows 10 rows (k, outs, hits, hr, nrfi, total, spread, ml, f5ml, f5spread)
- [ ] `GET /api/board/snapshot` returns `{ k: [...], outs: [...], spread: [...], ... }` with non-empty arrays
- [ ] Two users opening Board after 10 AM see **identical** confidence numbers, **identical** summary text
- [ ] Before 10 AM or on cold start (no snapshot), Board falls back to local `computeXxx` with no errors
- [ ] No calls to `POST /api/card-summary` for snapshot cards (check network tab — no card-summary requests when snapshot is loaded)
- [ ] No syntax errors; all modified files parse cleanly

---

## File summary

| File | Change |
|------|--------|
| `backend/jobs/dailyAiSnapshot.js` | Import `computePitcherBoard`, `computeBatterBoard`; compute all 10 markets; pre-gen summaries; save to `board_daily_snapshots` |
| `backend/routes/boardDailySnapshot.js` | New file — `GET /api/board/snapshot` route |
| `backend/server.js` | Mount new route at `/api/board` |
| `prop-scout-v7.jsx` | Add `boardDailySnapshot` state; fetch on board open; use snapshot-first in all Board tab renders; use `_boardSummary` for text |

---

## Reference

- `generateDailyAiSnapshot` in `backend/jobs/dailyAiSnapshot.js` — add board snapshot code at the end (step 10), after the existing step 9 (card summaries)
- `ensureEdgesTable()` — add `board_daily_snapshots` DDL here
- `generateCardSummaries` helper is already in `dailyAiSnapshot.js` — reuse it for the board summary generation
- `computePitcherBoard` and `computeBatterBoard` are exported from `src/board/index.js` — same pattern as `computeGameBoard` dynamic import
- Board renders in `prop-scout-v7.jsx` — search for `computePitcherBoard(` and `computeGameBoard(` to find the exact call sites to replace with the snapshot-first pattern
- The `_boardSummary` field added to each card is non-breaking: existing code that calls `buildBoardSummaryRequest` + `hydrateCardSummaries` will just find the summary already set and skip the API call
