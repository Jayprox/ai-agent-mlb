# CODEX TASK 118 — Board Card Backtesting: Snapshot at Lock + Result Resolution (Phase 1 & 2)

## Goal

Persist the full computed state of every Board card at the moment it locks (game goes live) to PostgreSQL, then automatically resolve each card to hit/miss once the game is final. This creates the data foundation for future history replay (Phase 3) and model accuracy dashboards (Phase 4).

**Scope: Player prop markets only — K, Hits, HR, Outs.**
Game-level markets (ML, Spread, NRFI, Total) are out of scope for this task.

**Files changed:**
- `backend/migrations/005_board_card_snapshots.sql` ← NEW
- `backend/routes/boardSnapshot.js` ← NEW
- `backend/jobs/resolveCardSnapshotsJob.js` ← NEW
- `backend/jobs/scheduler.js` ← ADD cron entries
- `backend/server.js` ← MOUNT route + ADD admin trigger
- `prop-scout-v7.jsx` ← ADD fire-and-forget POST in lock useEffect

---

## Part 1 — Migration: `backend/migrations/005_board_card_snapshots.sql`

Create this new file:

```sql
-- Board card backtesting snapshots
-- Captures the full computed state of each Board prop card at lock time (game goes live).
-- Player prop markets only: k | hits | hr | outs
-- Resolved to hit/miss by resolveCardSnapshotsJob after games are final.
CREATE TABLE IF NOT EXISTS board_card_snapshots (
  id            SERIAL       PRIMARY KEY,
  slate_date    DATE         NOT NULL,
  game_pk       INTEGER      NOT NULL,
  card_id       TEXT         NOT NULL,
  market        TEXT         NOT NULL,    -- 'k' | 'hits' | 'hr' | 'outs'
  lean          TEXT,                     -- 'over' | 'under'
  score         NUMERIC,
  score_tier    TEXT,                     -- 'high' | 'mid' | 'low'
  book_line     NUMERIC,                  -- the locked line (e.g. 5.5 Ks, 0.5 HR)
  ai_summary    TEXT,                     -- AI one-liner at lock time (nullable)
  card_data     JSONB        NOT NULL,    -- full card payload
  locked_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  result_hit    BOOLEAN,                  -- NULL = unresolved, true = hit, false = miss
  actual_stat   NUMERIC,                  -- actual Ks, hits, outs recorded, or HRs
  resolved_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bcs_unique
  ON board_card_snapshots(slate_date, card_id, market);

CREATE INDEX IF NOT EXISTS idx_bcs_date
  ON board_card_snapshots(slate_date);

CREATE INDEX IF NOT EXISTS idx_bcs_game_pk
  ON board_card_snapshots(game_pk);

CREATE INDEX IF NOT EXISTS idx_bcs_unresolved
  ON board_card_snapshots(slate_date)
  WHERE resolved_at IS NULL;
```

Apply this migration the same way existing migrations are applied in the project (check `db.js` or the startup sequence for the pattern — do not change the migration runner itself, just add the file).

---

## Part 2 — New Route: `backend/routes/boardSnapshot.js`

```js
const express = require("express");
const { query, isConnected } = require("../services/db");

const router = express.Router();

// POST /api/board-snapshot
// Body: { slateDate: "YYYY-MM-DD", cards: [...] }
// Idempotent — ON CONFLICT DO NOTHING so re-locks never overwrite.
router.post("/", async (req, res) => {
  const { slateDate, cards } = req.body ?? {};
  if (!slateDate || !Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ error: "slateDate and cards[] required" });
  }
  if (!isConnected()) {
    return res.json({ ok: true, inserted: 0, skipped: cards.length, reason: "db_unavailable" });
  }

  let inserted = 0;
  let skipped  = 0;

  for (const card of cards) {
    if (!card?.id || !card?.market) { skipped++; continue; }

    // Separate the indexed columns from the JSONB blob
    const { id, market, gamePk, lean, score, scoreTier, bookLine, aiSummary, ...rest } = card;

    try {
      const result = await query(
        `INSERT INTO board_card_snapshots
           (slate_date, game_pk, card_id, market, lean, score, score_tier,
            book_line, ai_summary, card_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (slate_date, card_id, market) DO NOTHING`,
        [
          slateDate,
          gamePk ?? null,
          id,
          market,
          lean ?? null,
          score ?? null,
          scoreTier ?? null,
          bookLine ?? null,
          aiSummary ?? null,
          rest,
        ]
      );
      if (result.rowCount > 0) inserted++;
      else skipped++;
    } catch (err) {
      console.warn(`  ⚠ board-snapshot insert skipped: ${err.message}`);
      skipped++;
    }
  }

  console.log(`  ✓ board-snapshot: inserted=${inserted} skipped=${skipped} date=${slateDate}`);
  return res.json({ ok: true, inserted, skipped });
});

// GET /api/board-snapshot/:date
// Returns all snapshots for a slate date, grouped by market.
// Used by Phase 3 history replay.
router.get("/:date", async (req, res) => {
  const { date } = req.params;
  if (!isConnected()) {
    return res.json({ hits: [], hr: [], k: [], outs: [] });
  }

  try {
    const result = await query(
      `SELECT id, game_pk, card_id, market, lean, score, score_tier,
              book_line, ai_summary, card_data, locked_at,
              result_hit, actual_stat, resolved_at
       FROM board_card_snapshots
       WHERE slate_date = $1
       ORDER BY score DESC NULLS LAST`,
      [date]
    );

    const grouped = { hits: [], hr: [], k: [], outs: [] };
    for (const row of result.rows ?? []) {
      const market = row.market;
      if (!grouped[market]) continue;
      grouped[market].push({
        ...(row.card_data ?? {}),
        id:         row.card_id,
        market:     row.market,
        gamePk:     row.game_pk,
        lean:       row.lean,
        score:      row.score,
        scoreTier:  row.score_tier,
        bookLine:   row.book_line,
        aiSummary:  row.ai_summary,
        lockedAt:   row.locked_at,
        resultHit:  row.result_hit,
        actualStat: row.actual_stat,
        resolvedAt: row.resolved_at,
      });
    }

    return res.json(grouped);
  } catch (err) {
    console.warn(`  ⚠ board-snapshot GET failed: ${err.message}`);
    return res.json({ hits: [], hr: [], k: [], outs: [] });
  }
});

module.exports = router;
```

---

## Part 3 — New Job: `backend/jobs/resolveCardSnapshotsJob.js`

This job runs after games are final and resolves each card to hit/miss.

The `fetchBoxForGrading` and `parseIpToOuts` and `normalizeName` functions should be **copied verbatim** from `gradePicksJob.js` (do not import from there — keep this job self-contained to avoid coupling).

```js
const axios = require("axios");
const { query, isConnected } = require("../services/db");

const MLB_BASE = "https://statsapi.mlb.com/api/v1";

function parseIpToOuts(ip) {
  if (!ip) return 0;
  const [inn, thirds] = String(ip).split(".").map(Number);
  return (inn || 0) * 3 + (thirds || 0);
}

function normalizeName(s) {
  return String(s ?? "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchBoxForGrading(gamePk) {
  try {
    const [bsRes, lsRes] = await Promise.all([
      axios.get(`${MLB_BASE}/game/${gamePk}/boxscore`,  { timeout: 10000 }),
      axios.get(`${MLB_BASE}/game/${gamePk}/linescore`, { timeout: 10000 }),
    ]);
    const bs = bsRes.data;
    const ls = lsRes.data;
    const inningsPlayed = (ls.innings ?? []).length;
    const isFinal = (inningsPlayed > 0 && !ls.currentInning)
      || ls.abstractGameState === "Final";
    if (!isFinal) return null;

    const parseBatters = (players) =>
      Object.values(players ?? {})
        .filter((p) => p.stats?.batting)
        .map((p) => {
          const s = p.stats.batting;
          return {
            id:   p.person?.id,
            name: p.person?.fullName ?? "",
            h:    s.hits       ?? 0,
            hr:   s.homeRuns   ?? 0,
            rbi:  s.rbi        ?? 0,
            ab:   s.atBats     ?? 0,
          };
        })
        .filter((b) => b.ab > 0 || b.h > 0);

    const parsePitchers = (players) =>
      Object.values(players ?? {})
        .filter((p) => p.stats?.pitching?.inningsPitched)
        .map((p) => {
          const s = p.stats.pitching;
          return {
            name: p.person?.fullName ?? "",
            k:    s.strikeOuts      ?? 0,
            ip:   s.inningsPitched  ?? "0.0",
          };
        });

    return {
      isFinal: true,
      batting: {
        away: parseBatters(bs.teams?.away?.players),
        home: parseBatters(bs.teams?.home?.players),
      },
      pitching: {
        away: parsePitchers(bs.teams?.away?.players),
        home: parsePitchers(bs.teams?.home?.players),
      },
    };
  } catch (_) {
    return null;
  }
}

function findPitcher(box, nameRaw) {
  const all = [...(box.pitching?.away ?? []), ...(box.pitching?.home ?? [])];
  const normalized = normalizeName(nameRaw);
  const lastName = normalized.split(" ").pop();
  return (
    all.find((p) => normalizeName(p.name) === normalized) ??
    all.find((p) => normalizeName(p.name).includes(normalized)) ??
    all.find((p) => normalizeName(p.name).includes(lastName)) ??
    null
  );
}

function findBatter(box, nameRaw) {
  const all = [...(box.batting?.away ?? []), ...(box.batting?.home ?? [])];
  const normalized = normalizeName(nameRaw);
  const lastName = normalized.split(" ").pop();
  return (
    all.find((p) => normalizeName(p.name) === normalized) ??
    all.find((p) => normalizeName(p.name).includes(normalized)) ??
    all.find((p) => normalizeName(p.name).includes(lastName)) ??
    null
  );
}

function resolveCard(row, box) {
  const { market, lean, book_line: bookLine, card_data: cardData } = row;
  if (bookLine == null) return null;

  const name = cardData?.name ?? "";

  if (market === "k" || market === "outs") {
    const pitcher = findPitcher(box, name);
    if (!pitcher) return null;

    if (market === "k") {
      const actual = pitcher.k;
      const hit = lean === "over" ? actual > bookLine : actual < bookLine;
      return { resultHit: hit, actualStat: actual };
    }
    // outs
    const actual = parseIpToOuts(pitcher.ip);
    const hit = lean === "over" ? actual > bookLine : actual < bookLine;
    return { resultHit: hit, actualStat: actual };
  }

  if (market === "hits" || market === "hr") {
    const batter = findBatter(box, name);
    if (!batter) return null;

    if (market === "hits") {
      const actual = batter.h;
      const hit = lean === "over" ? actual > bookLine : actual < bookLine;
      return { resultHit: hit, actualStat: actual };
    }
    // hr — bookLine is usually 0.5; treat any HR as a hit regardless
    const actual = batter.hr;
    let hit;
    if (bookLine <= 0.5) {
      hit = actual >= 1;
    } else {
      hit = lean === "over" ? actual > bookLine : actual < bookLine;
    }
    return { resultHit: hit, actualStat: actual };
  }

  return null;
}

async function resolveCardSnapshots(date) {
  // Default to yesterday Honolulu
  if (!date) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    date = yesterday.toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
  }

  if (!isConnected()) {
    console.log(`  · resolveCardSnapshots: db unavailable, skipping ${date}`);
    return { date, resolved: 0, skipped: 0 };
  }

  const rows = await query(
    `SELECT id, game_pk, market, lean, score_tier, book_line, card_data
     FROM board_card_snapshots
     WHERE slate_date = $1 AND resolved_at IS NULL`,
    [date]
  );

  if (!rows?.rows?.length) {
    console.log(`  · resolveCardSnapshots: nothing to resolve for ${date}`);
    return { date, resolved: 0, skipped: 0 };
  }

  // Group by game_pk for efficient boxscore fetching
  const byGame = {};
  for (const row of rows.rows) {
    const key = String(row.game_pk);
    if (!byGame[key]) byGame[key] = [];
    byGame[key].push(row);
  }

  let resolved = 0;
  let skipped  = 0;

  await Promise.all(
    Object.entries(byGame).map(async ([gamePkStr, gameRows]) => {
      const box = await fetchBoxForGrading(gamePkStr);
      if (!box) {
        skipped += gameRows.length;
        return;
      }

      await Promise.all(
        gameRows.map(async (row) => {
          const outcome = resolveCard(row, box);
          if (!outcome) { skipped++; return; }

          try {
            await query(
              `UPDATE board_card_snapshots
               SET result_hit = $1, actual_stat = $2, resolved_at = NOW()
               WHERE id = $3`,
              [outcome.resultHit, outcome.actualStat, row.id]
            );
            resolved++;
          } catch (err) {
            console.warn(`  ⚠ resolveCardSnapshots update failed: ${err.message}`);
            skipped++;
          }
        })
      );
    })
  );

  console.log(`  ✓ resolveCardSnapshots: date=${date} resolved=${resolved} skipped=${skipped}`);
  return { date, resolved, skipped };
}

module.exports = { resolveCardSnapshots };
```

---

## Part 4 — Scheduler: `backend/jobs/scheduler.js`

Add this import at the top with the other job imports:

```js
const { resolveCardSnapshots } = require("./resolveCardSnapshotsJob");
```

Add these two cron entries inside `startScheduler()`, after the scout evaluation entries:

```js
// Resolve Board card snapshots — 1 AM and 2 AM Honolulu
// West coast games finish ~9–10 PM Honolulu; run twice to catch late finishes
cron.schedule("0 1 * * *", async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yDate = yesterday.toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
  await resolveCardSnapshots(yDate);
}, { timezone: "Pacific/Honolulu" });

cron.schedule("0 2 * * *", async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yDate = yesterday.toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
  await resolveCardSnapshots(yDate);
}, { timezone: "Pacific/Honolulu" });
```

---

## Part 5 — Server: `backend/server.js`

### 5a — Mount the new route (add with the other route mounts):

```js
app.use("/api/board-snapshot", require("./routes/boardSnapshot"));
```

### 5b — Add admin trigger (add near the other admin job triggers):

```js
app.get("/api/admin/jobs/resolve-card-snapshots", async (req, res) => {
  if (req.headers["x-admin-secret"] !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const dateParam = req.query.date ?? undefined;
    const result = await require("./jobs/resolveCardSnapshotsJob")
      .resolveCardSnapshots(dateParam);
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
```

---

## Part 6 — Frontend: `prop-scout-v7.jsx`

Find the Board lock `useEffect` that calls `setLockedBoardCandidates`. It is currently around **line 5267** and ends with this pattern:

```js
if (!hasNewBatters && !hasNewPitchers) return;

setLockedBoardCandidates(prev => {
  const updated = { ...prev, [game.gamePk]: newEntry };
  localStorage.setItem("board_locked_snapshot", JSON.stringify({ date: today, candidates: updated }));
  return updated;
});
```

**Insert the following block immediately BEFORE the `setLockedBoardCandidates(...)` call** — do not touch the `setLockedBoardCandidates` call itself:

```js
// ── Persist newly-locked cards to backend for backtesting (fire-and-forget) ──
if (!IS_SANDBOX) {
  const newlyLocked = [];
  if (hasNewBatters)  newlyLocked.push(...newEntry.hits, ...newEntry.hr);
  if (hasNewPitchers) newlyLocked.push(...newEntry.k,    ...newEntry.outs);
  if (newlyLocked.length > 0) {
    fetch(`${API_BASE}/api/board-snapshot`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ slateDate: today, cards: newlyLocked }),
    }).catch(() => {}); // never block or error the lock
  }
}
```

Notes:
- `today` is already computed at the top of this effect as the Honolulu `YYYY-MM-DD` string.
- `API_BASE` is `""` (empty string) — the Vite proxy forwards `/api` → `localhost:3001`.
- `IS_SANDBOX` is a top-level constant already defined in the file.
- This is strictly fire-and-forget. No `await`, no error handling beyond `.catch(() => {})`.
- The `newlyLocked` cards contain the full computed card object including `market`, `lean`, `score`, `scoreTier`, `bookLine`, `name`, all stats, etc. No transformation needed — send them as-is.

---

## Checklist

- [ ] `backend/migrations/005_board_card_snapshots.sql` created and migration applied
- [ ] `backend/routes/boardSnapshot.js` created with POST + GET handlers
- [ ] `app.use("/api/board-snapshot", ...)` added to `server.js`
- [ ] `backend/jobs/resolveCardSnapshotsJob.js` created
- [ ] Two cron entries added to `scheduler.js`
- [ ] Admin trigger `GET /api/admin/jobs/resolve-card-snapshots` added to `server.js`
- [ ] Fire-and-forget POST block added before `setLockedBoardCandidates` in `prop-scout-v7.jsx`
- [ ] No existing behaviour changed — lock logic, localStorage, and board rendering are untouched
- [ ] All new backend code wrapped in try/catch; failures use `console.warn`, never throw

---

## Out of Scope for This Task

- History replay UI (Phase 3 — separate task)
- Performance dashboard (Phase 4)
- Game-level markets (ML, Spread, NRFI, Total)
- AI summary population at lock time or backfill
- Any changes to how the Board renders or scores cards

---

## After Completing

Reply "Task 118 complete" with a brief summary of the changes to each file.
