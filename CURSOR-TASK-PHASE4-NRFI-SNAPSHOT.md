# Cursor Task — Phase 4: Pre-snapshot NRFI Results

## Problem

Every time a user opens the Board (or the slate bundle is built cold), `GET /api/nrfi/:gamePk` fires a chain of live MLB API calls for each game:

1. `fetchGameMeta(gamePk)` — now fixed (reads from schedule_snapshots) ✅
2. `fetchRecentTeamGames(awayTeamId, ...)` → `GET /schedule?teamId={id}&startDate=...&endDate=...` — fetches 120 days of that team's schedule to find their last 20 completed games
3. `fetchRecentTeamGames(homeTeamId, ...)` → same for the home team
4. `getLinescore(gamePk)` × up to 20 games per team → `GET /game/{pk}/linescore` for each historical game to read first-inning scores

That's **2 team schedule calls + up to 40 linescore calls per game**. For 13 games: up to 26 schedule + 520 linescore calls on first load. Linescores are cached 24 hours so teams sharing opponents reduces this, but the first load is still extremely expensive.

NRFI results are based on historical team tendencies that don't change during the day. They should be computed once per day and served from Postgres.

---

## Goal

1. Add a `nrfi_snapshots` table
2. Add a `snapshotNrfiForSlate` job that computes NRFI for all today's games and saves results
3. Run the job at 10 AM HST (after schedule snapshot is warm) and again pregame
4. Update `GET /api/nrfi/:gamePk` and the exported `getNrfiForGame` function to read from DB first

After this change: opening Board = **zero** NRFI-related MLB schedule or linescore calls.

---

## What the NRFI result looks like

```json
{
  "awayFirst": { "scoredPct": "38%", "avgRuns": 0.45, "tendency": "Average 1st inning output" },
  "homeFirst": { "scoredPct": "24%", "avgRuns": 0.28, "tendency": "Slow starters" },
  "lean": "NRFI",
  "confidence": 58
}
```

---

## Files to touch

| File | Change |
|------|--------|
| `backend/jobs/snapshotJobs.js` | Add `nrfi_snapshots` table to `ensurePhaseOneTables()` + new `snapshotNrfiForSlate()` function + export it |
| `backend/jobs/scheduler.js` | Wire `snapshotNrfiForSlate` at 10 AM HST + pregame window |
| `backend/routes/nrfi.js` | Add DB read to route handler and `getNrfiForGame` export |

---

## Step 1 — Add `nrfi_snapshots` table

In `backend/jobs/snapshotJobs.js`, inside `ensurePhaseOneTables()`, add:

```js
await query(`
  CREATE TABLE IF NOT EXISTS nrfi_snapshots (
    game_pk     INTEGER      NOT NULL,
    slate_date  DATE         NOT NULL,
    fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    data        JSONB        NOT NULL,
    PRIMARY KEY (game_pk, slate_date)
  )
`);
```

---

## Step 2 — Add `snapshotNrfiForSlate` to `snapshotJobs.js`

Add the following function. It lazy-requires `getNrfiForGame` from the route (same pattern as `snapshotBullpen` using `buildGameBullpenForJob`):

```js
async function snapshotNrfiForSlate(date = todayHonolulu()) {
  if (!isConnected()) return;
  console.log(`  → Job: snapshotNrfiForSlate  date=${date}`);
  await ensurePhaseOneTables();

  const result = await query(
    "SELECT games FROM schedule_snapshots WHERE slate_date = $1",
    [date]
  );
  const games = result?.rows?.[0]?.games ?? [];

  if (!games.length) {
    console.log(`  · snapshotNrfiForSlate: no games found for ${date}`);
    return;
  }

  const { getNrfiForGame } = require("../routes/nrfi");

  let saved = 0;
  let skipped = 0;

  for (const game of games) {
    const gamePk = game.gamePk ?? game.id;
    if (!gamePk) continue;

    // Skip if already snapshotted today
    try {
      const existing = await query(
        "SELECT 1 FROM nrfi_snapshots WHERE game_pk = $1 AND slate_date = $2",
        [gamePk, date]
      );
      if (existing?.rows?.length) {
        skipped++;
        continue;
      }
    } catch (err) {
      console.warn(`  ⚠ snapshotNrfiForSlate: DB check failed for ${gamePk}: ${err.message}`);
    }

    try {
      const nrfi = await getNrfiForGame(gamePk);
      if (!nrfi) {
        console.warn(`  ⚠ snapshotNrfiForSlate: no result for gamePk=${gamePk}`);
        continue;
      }

      await query(
        `INSERT INTO nrfi_snapshots (game_pk, slate_date, fetched_at, data)
         VALUES ($1, $2, NOW(), $3)
         ON CONFLICT (game_pk, slate_date) DO UPDATE
           SET fetched_at = NOW(), data = $3`,
        [gamePk, date, JSON.stringify(nrfi)]
      );
      saved++;
    } catch (err) {
      console.warn(`  ⚠ snapshotNrfiForSlate: failed for gamePk=${gamePk}: ${err.message}`);
    }

    // 500ms between games — NRFI triggers multiple MLB calls per game
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`  ✓ snapshotNrfiForSlate  date=${date}  saved=${saved}  skipped=${skipped}`);
}
```

Add `snapshotNrfiForSlate` to `module.exports` at the bottom of the file.

---

## Step 3 — Wire into `scheduler.js`

Add `snapshotNrfiForSlate` to the existing destructured import from `snapshotJobs`:

```js
const {
  snapshotSlate, snapshotOdds, snapshotBullpen,
  snapshotLinescore, snapshotUmpires, pollSchedule, pollInjuries, pollPlayerProps,
  snapshotPitcherGamelogs, snapshotBatterGamelogs, runScoutEvaluation, todayHonolulu,
  snapshotPitcherSavant,
  snapshotNrfiForSlate,  // ← add this
} = require("./snapshotJobs");
```

Add two cron entries — a fixed 10 AM run and a pregame re-run:

```js
// Pre-compute NRFI for today's slate at 10 AM Honolulu
// Runs after snapshotSlate (8 AM) so the schedule snapshot is warm
cron.schedule("0 10 * * *", async () => {
  try {
    await snapshotNrfiForSlate();
  } catch (err) {
    console.warn(`NRFI snapshot 10am run failed: ${err.message}`);
  }
}, { timezone: "Pacific/Honolulu" });
```

Also add a pregame re-run alongside the existing pregame pattern. Find the existing `*/5 8-16 * * *` pregame cron block for the Daily Card — add a separate one for NRFI (use a new guard variable `_nrfiSnapshotRan`):

Add the guard variable near `_pregameRan` and `_aiSnapshotRan` at the top of `scheduler.js`:

```js
let _nrfiSnapshotRan = { date: null };
```

Then add the pregame cron:

```js
// NRFI snapshot — pregame re-run (~95 min before first pitch, once per day)
// Re-computes with confirmed lineups and any SP changes
cron.schedule("*/5 8-16 * * *", async () => {
  const today = todayHonolulu();
  if (_nrfiSnapshotRan.date === today) return;

  try {
    const games = await getTodayGames();
    const earliestMs = games
      .map((g) => Date.parse(g.gameTime))
      .filter((ts) => Number.isFinite(ts))
      .sort((a, b) => a - b)[0];

    if (!earliestMs) return;

    const triggerAt = earliestMs - (95 * 60 * 1000);
    if (Date.now() < triggerAt) return;

    await snapshotNrfiForSlate();
    _nrfiSnapshotRan.date = today;
    console.log(`  ✓ NRFI snapshot pregame run completed for ${today}`);
  } catch (err) {
    console.warn(`NRFI snapshot pregame run failed: ${err.message}`);
  }
}, { timezone: "Pacific/Honolulu" });
```

---

## Step 4 — Update `nrfi.js` to read DB first

`nrfi.js` already imports `{ query, isConnected }` (added in Phase 2). No new imports needed.

### 4a — Update the route handler

Find the route handler (around line 195):

```js
router.get("/:gamePk", async (req, res) => {
  const { gamePk } = req.params;
  const cacheKey = `nrfi:${gamePk}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    const meta = await fetchGameMeta(gamePk);
    ...
```

Add a DB read between the in-memory cache check and the live computation:

```js
router.get("/:gamePk", async (req, res) => {
  const { gamePk } = req.params;
  const cacheKey = `nrfi:${gamePk}`;

  // 1. In-memory cache
  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  // 2. DB snapshot
  if (isConnected()) {
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
      const snap = await query(
        "SELECT data FROM nrfi_snapshots WHERE game_pk = $1 AND slate_date = $2",
        [parseInt(gamePk, 10), today]
      );
      if (snap?.rows?.[0]?.data) {
        const result = snap.rows[0].data;
        cache.set(cacheKey, result, NRFI_TTL_MS);
        res.setHeader("X-Cache", "DB-HIT");
        return res.json(result);
      }
    } catch (err) {
      console.warn(`  ⚠ nrfi DB read failed for ${gamePk}: ${err.message}`);
    }
  }

  // 3. Live computation (fallback — fires all MLB schedule + linescore calls)
  try {
    const meta = await fetchGameMeta(gamePk);
    // ... rest of existing try block unchanged ...
```

### 4b — Update the exported `getNrfiForGame` function

The `getNrfiForGame` export at the bottom of `nrfi.js` is used by `slateBundle.js` and `snapshotNrfiForSlate`. It also needs the DB check so the slate bundle can serve from snapshot.

Find the export (around line 232):

```js
module.exports.getNrfiForGame = module.exports.getNrfiResult = async function getNrfiForGame(gamePk) {
  const cacheKey = `nrfi:${gamePk}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const meta = await fetchGameMeta(gamePk);
    ...
```

Add the DB check here too:

```js
module.exports.getNrfiForGame = module.exports.getNrfiResult = async function getNrfiForGame(gamePk) {
  const cacheKey = `nrfi:${gamePk}`;

  // 1. In-memory cache
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // 2. DB snapshot
  if (isConnected()) {
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
      const snap = await query(
        "SELECT data FROM nrfi_snapshots WHERE game_pk = $1 AND slate_date = $2",
        [parseInt(gamePk, 10), today]
      );
      if (snap?.rows?.[0]?.data) {
        const result = snap.rows[0].data;
        cache.set(cacheKey, result, NRFI_TTL_MS);
        return result;
      }
    } catch {
      // fall through to live computation
    }
  }

  // 3. Live computation (fallback)
  try {
    const meta = await fetchGameMeta(gamePk);
    // ... rest of existing function body unchanged ...
```

**Important:** `snapshotNrfiForSlate` calls `getNrfiForGame` to compute results. Since the snapshot hasn't been saved yet when the job runs, `getNrfiForGame` will fall through to the live computation — which is correct. The DB read only activates when the job has already written today's row. There's no circular problem here.

---

## What NOT to change

- `fetchRecentTeamGames` — leave it exactly as-is. It's the live fallback path and still needed when no snapshot exists.
- `getLinescore` — leave it as-is. Same reason.
- `fetchGameMeta` — already updated in Phase 2, don't touch it.
- The `slateBundle.js` — it calls `getNrfiForGame` which now benefits automatically from the DB read. No changes needed there.
- Any frontend files.

---

## Acceptance criteria

- [ ] `nrfi_snapshots` table created on server start
- [ ] `snapshotNrfiForSlate` runs at 10 AM HST and saves one row per game
- [ ] After 10 AM, `GET /api/nrfi/:gamePk` returns `X-Cache: DB-HIT` and logs show **zero** `→ MLB API GET .../schedule?...teamId=` or `GET .../game/.../linescore` lines from the NRFI route
- [ ] `getNrfiForGame` export also returns from DB when snapshot exists (so slate-bundle gets it for free)
- [ ] Pregame re-run fires once per day ~95 min before first pitch, re-computing with fresh data (clears the DB row and rewrites it via ON CONFLICT DO UPDATE)
- [ ] If no snapshot exists (before 10 AM or on cold start), route falls through to live computation with no errors
- [ ] `snapshotNrfiForSlate` is idempotent — re-running skips already-snapshotted games
- [ ] No syntax errors; all modified files parse cleanly

---

## Reference

- `nrfi.js` route: `backend/routes/nrfi.js` — `fetchGameMeta` already has DB lookup (Phase 2); add DB lookup to route handler and export
- `ensurePhaseOneTables()`: `backend/jobs/snapshotJobs.js` — add table definition here
- Pregame guard pattern: look at `_pregameRan` and `_aiSnapshotRan` in `scheduler.js` for the exact pattern to follow for `_nrfiSnapshotRan`
- `getTodayGames()` helper is already available in `scheduler.js` — use it for the pregame cron
- NRFI result TTL: `NRFI_TTL_MS = 60 * 60 * 1000` (1 hour) — defined in `nrfi.js`, use the same value when setting the in-memory cache on DB hit
