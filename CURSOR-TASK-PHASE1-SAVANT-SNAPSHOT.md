# Cursor Task — Phase 1: Pre-snapshot Pitcher Savant Data

## Problem

Every time a user opens the Board, Model, or AI Board view, the frontend fires:
- `GET /api/arsenal/:pitcherId` → backend calls `baseballsavant.mlb.com` CSV live
- `GET /api/pitcher-splits/:pitcherId` → backend calls `baseballsavant.mlb.com` CSV live (twice: L + R split)

On a 13-game slate with 26 probable starters, this produces **~104 live Savant CSV requests per session**, happening simultaneously when the board loads. This hammers Savant, is slow, and fails silently under rate limiting.

Both data sets are **static for the day** — pitcher arsenal and platoon splits don't change between games. They should be fetched once per day by a scheduled backend job and served from Postgres.

---

## Goal

Pre-snapshot pitcher arsenal and platoon splits at 10 AM and 2 PM Honolulu time (alongside existing gamelog jobs). Update the two routes to read from the DB snapshot first, falling back to live Savant only on cache miss.

After this change: opening Board = **0 Savant calls**. The snapshot job handles all Savant traffic.

---

## Files to touch

| File | Change |
|------|--------|
| `backend/jobs/snapshotJobs.js` | Add `snapshotPitcherSavant()` job function + `ensureSavantTable()` |
| `backend/jobs/scheduler.js` | Wire `snapshotPitcherSavant` at 10am + 2pm HST |
| `backend/routes/arsenal.js` | Read DB snapshot first before live Savant fetch |
| `backend/routes/pitcherSplits.js` | Export job helper + read DB snapshot first |

**Do not modify** any frontend files, any other backend routes, or the `player_gamelog_snapshots` table.

---

## Step 1 — New DB table

Add a `CREATE TABLE IF NOT EXISTS` call to the **existing** `ensurePhaseOneTables()` function in `backend/jobs/snapshotJobs.js`.

Add this block inside `ensurePhaseOneTables()`:

```js
await query(`
  CREATE TABLE IF NOT EXISTS pitcher_savant_snapshots (
    player_id   INTEGER      NOT NULL,
    slate_date  DATE         NOT NULL,
    fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    arsenal     JSONB,
    splits      JSONB,
    PRIMARY KEY (player_id, slate_date)
  )
`);
```

---

## Step 2 — Export job helper from `pitcherSplits.js`

`backend/routes/pitcherSplits.js` currently does not export anything. Add a named export at the bottom of the file that can be called from the snapshot job:

```js
// Called by snapshotJobs — returns { vsL, vsR, season } or null
module.exports.buildPitcherSplitsForJob = async (pitcherId, year = SEASON) => {
  const yearsToTry = [year, year - 1];
  for (const candidateYear of yearsToTry) {
    try {
      const [vsL, vsR] = await Promise.all([
        fetchPitcherVsHand(pitcherId, "L", candidateYear).catch(() => null),
        fetchPitcherVsHand(pitcherId, "R", candidateYear).catch(() => null),
      ]);
      if (vsL || vsR) {
        return { pitcherId: parseInt(pitcherId), season: candidateYear, vsL, vsR };
      }
    } catch {
      // try next year
    }
  }
  return null;
};
```

The function `fetchPitcherVsHand` is already defined at the top of the file — this export just wraps it. No changes to the existing route handler.

---

## Step 3 — Add `snapshotPitcherSavant` to `snapshotJobs.js`

Add the following function to `backend/jobs/snapshotJobs.js`. Import `buildArsenalPayloadForJob` from the arsenal route (already exported), and import `buildPitcherSplitsForJob` from the splits route.

Add these requires near the top of the file (alongside the other route requires that are already there):

```js
// These are lazy-required inside the job function to avoid circular import issues
// (same pattern used by snapshotBullpen, pollPlayerProps, etc.)
```

Add this function:

```js
async function snapshotPitcherSavant(date = todayHonolulu()) {
  if (!isConnected()) return;
  console.log(`  → Job: snapshotPitcherSavant  date=${date}`);
  await ensurePhaseOneTables();

  // Get today's probable pitchers from the schedule snapshot
  const result = await query(
    "SELECT games FROM schedule_snapshots WHERE slate_date = $1",
    [date]
  );
  const games = result?.rows?.[0]?.games ?? [];

  const pitcherIds = [
    ...new Set(
      games
        .flatMap(g => [
          g.probablePitchers?.away?.id,
          g.probablePitchers?.home?.id,
        ])
        .filter(Boolean)
    ),
  ];

  if (!pitcherIds.length) {
    console.log(`  · snapshotPitcherSavant: no pitchers found for ${date}`);
    return;
  }

  console.log(`  · snapshotPitcherSavant: ${pitcherIds.length} pitchers`);

  const { buildArsenalPayloadForJob } = require("../routes/arsenal");
  const { buildPitcherSplitsForJob }  = require("../routes/pitcherSplits");

  let fetched = 0;
  let skipped = 0;

  for (const pitcherId of pitcherIds) {
    // Idempotent — skip if both arsenal and splits are already snapshotted today
    try {
      const existing = await query(
        `SELECT 1 FROM pitcher_savant_snapshots
         WHERE player_id = $1 AND slate_date = $2
           AND arsenal IS NOT NULL AND splits IS NOT NULL`,
        [pitcherId, date]
      );
      if (existing?.rows?.length) {
        skipped++;
        continue;
      }
    } catch (err) {
      console.warn(`  ⚠ snapshotPitcherSavant: DB check failed for ${pitcherId}: ${err.message}`);
    }

    let arsenal = null;
    let splits  = null;

    // Arsenal
    try {
      const payload = await buildArsenalPayloadForJob(pitcherId);
      arsenal = payload ?? null;
    } catch (err) {
      console.warn(`  ⚠ snapshotPitcherSavant: arsenal failed for ${pitcherId}: ${err.message}`);
    }

    // Splits — wait 800ms after arsenal to be respectful of Savant rate limits
    await new Promise(r => setTimeout(r, 800));

    try {
      splits = await buildPitcherSplitsForJob(pitcherId);
    } catch (err) {
      console.warn(`  ⚠ snapshotPitcherSavant: splits failed for ${pitcherId}: ${err.message}`);
    }

    // Save whatever we got (partial saves are fine — null columns are handled by routes)
    try {
      await query(
        `INSERT INTO pitcher_savant_snapshots (player_id, slate_date, fetched_at, arsenal, splits)
         VALUES ($1, $2, NOW(), $3, $4)
         ON CONFLICT (player_id, slate_date) DO UPDATE
           SET fetched_at = NOW(),
               arsenal    = COALESCE(EXCLUDED.arsenal, pitcher_savant_snapshots.arsenal),
               splits     = COALESCE(EXCLUDED.splits,  pitcher_savant_snapshots.splits)`,
        [pitcherId, date, arsenal ? JSON.stringify(arsenal) : null, splits ? JSON.stringify(splits) : null]
      );
      fetched++;
    } catch (err) {
      console.warn(`  ⚠ snapshotPitcherSavant: DB save failed for ${pitcherId}: ${err.message}`);
    }

    // 800ms between pitchers — 26 pitchers × 1.6s avg = ~42 seconds total
    await new Promise(r => setTimeout(r, 800));
  }

  console.log(`  ✓ snapshotPitcherSavant  date=${date}  fetched=${fetched}  skipped=${skipped}`);
}
```

Add `snapshotPitcherSavant` to the `module.exports` at the bottom of `snapshotJobs.js`.

---

## Step 4 — Wire into `scheduler.js`

In `backend/jobs/scheduler.js`, `snapshotPitcherSavant` should already be imported (add it to the existing destructured import from `snapshotJobs`):

```js
const {
  snapshotSlate, snapshotOdds, snapshotBullpen,
  snapshotLinescore, snapshotUmpires, pollSchedule, pollInjuries, pollPlayerProps,
  snapshotPitcherGamelogs, snapshotBatterGamelogs, runScoutEvaluation, todayHonolulu,
  snapshotPitcherSavant,  // ← add this
} = require("./snapshotJobs");
```

Then add it alongside the existing pitcher/batter gamelog crons at 10am and 2pm HST:

```js
// Pre-fetch pitcher Savant data (arsenal + splits) at 10 AM and 2 PM Honolulu
// Runs after snapshotPitcherGamelogs so probable pitchers are confirmed in the schedule snapshot
cron.schedule("30 10,14 * * *", () => snapshotPitcherSavant(), { timezone: "Pacific/Honolulu" });
```

Note: scheduled at `:30` (10:30am / 2:30pm) so it runs after the gamelog jobs at `:00` (10:00am / 2:00pm) — ensures the schedule snapshot is warm before we look up pitcher IDs.

---

## Step 5 — Update `GET /api/arsenal/:pitcherId` to read DB first

In `backend/routes/arsenal.js`, update `buildArsenalPayload` to check the `pitcher_savant_snapshots` table before calling Savant.

Add the db import at the top of the file (it's not there yet):

```js
const db = require("../services/db");
```

Then, at the top of `buildArsenalPayload`, before the in-memory cache check and before the Savant fetch, add a DB snapshot read:

```js
async function buildArsenalPayload(pitcherId, year = SEASON) {
  const cacheKey = `arsenal:pitcher:${pitcherId}:${year}`;

  // 1. In-memory cache (fastest)
  const cached = cache.get(cacheKey);
  if (cached) return { result: cached, cacheHit: true };

  // 2. DB snapshot (today's pre-fetched data — avoids live Savant call)
  if (db.isConnected()) {
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
      const snap = await db.query(
        `SELECT arsenal FROM pitcher_savant_snapshots
         WHERE player_id = $1 AND slate_date = $2 AND arsenal IS NOT NULL`,
        [parseInt(pitcherId, 10), today]
      );
      if (snap?.rows?.[0]?.arsenal) {
        const result = snap.rows[0].arsenal;
        cache.set(cacheKey, result, SAVANT_TTL); // warm in-memory cache too
        console.log(`  ✓ Arsenal DB hit  pitcherId=${pitcherId}`);
        return { result, cacheHit: true };
      }
    } catch (err) {
      console.warn(`  ⚠ Arsenal DB read failed, falling through to Savant: ${err.message}`);
    }
  }

  // 3. Live Savant fetch (fallback)
  // ... rest of existing function unchanged ...
```

The rest of the function body (the `for (const candidateYear of yearsToTry)` loop) stays exactly as-is.

---

## Step 6 — Update `GET /api/pitcher-splits/:pitcherId` to read DB first

In `backend/routes/pitcherSplits.js`, add the db import at the top:

```js
const db = require("../services/db");
```

Then update the route handler to check the DB snapshot before calling Savant. Find the existing route handler:

```js
router.get("/:pitcherId", async (req, res) => {
  const { pitcherId } = req.params;
  const year      = parseInt(req.query.year ?? SEASON, 10);
  const cacheKey  = `splits:pitcher:${pitcherId}:${year}`;

  const cached = cache.get(cacheKey);
  if (cached !== undefined) { ... }
```

Add a DB check after the in-memory cache check:

```js
router.get("/:pitcherId", async (req, res) => {
  const { pitcherId } = req.params;
  const year      = parseInt(req.query.year ?? SEASON, 10);
  const cacheKey  = `splits:pitcher:${pitcherId}:${year}`;

  // 1. In-memory cache
  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    res.setHeader("X-Cache", "HIT");
    if (cached === null) return res.status(502).json({ error: "No platoon splits available", pitcherId });
    return res.json(cached);
  }

  // 2. DB snapshot
  if (db.isConnected()) {
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
      const snap = await db.query(
        `SELECT splits FROM pitcher_savant_snapshots
         WHERE player_id = $1 AND slate_date = $2 AND splits IS NOT NULL`,
        [parseInt(pitcherId, 10), today]
      );
      if (snap?.rows?.[0]?.splits) {
        const result = snap.rows[0].splits;
        cache.set(cacheKey, result, TTL); // warm in-memory cache
        res.setHeader("X-Cache", "DB-HIT");
        return res.json(result);
      }
    } catch (err) {
      console.warn(`  ⚠ Pitcher splits DB read failed, falling through to Savant: ${err.message}`);
    }
  }

  // 3. Live Savant fetch (fallback)
  const yearsToTry = [year, year - 1];
  // ... rest of existing handler unchanged ...
```

---

## What NOT to change

- The `player_gamelog_snapshots` table — untouched
- `snapshotPitcherGamelogs` and `snapshotBatterGamelogs` — untouched
- Any frontend files
- Any other routes
- `warmCache.js` — if it calls `buildArsenalPayload` or pitcher splits it will now benefit from the DB hit automatically

---

## Acceptance criteria

- [ ] `pitcher_savant_snapshots` table created on server start
- [ ] `snapshotPitcherSavant()` runs at 10:30 AM and 2:30 PM HST
- [ ] Opening Board after 10:30 AM generates **zero** Savant CSV requests (verify in server logs — no `→ Savant CSV` or `→ Savant pitcher splits` lines)
- [ ] `GET /api/arsenal/:id` returns `X-Cache: DB-HIT` header when snapshot exists
- [ ] `GET /api/pitcher-splits/:id` returns `X-Cache: DB-HIT` header when snapshot exists
- [ ] If no snapshot exists (e.g. before 10:30 AM), routes fall back to live Savant — no errors
- [ ] `snapshotPitcherSavant` is idempotent — re-running the same day skips already-snapshotted pitchers
- [ ] No TypeScript errors, no new lint warnings

---

## Reference

- Existing pattern to follow: `snapshotPitcherGamelogs` in `backend/jobs/snapshotJobs.js` (lines 411–534)
- Arsenal job helper already exported: `module.exports.buildArsenalPayloadForJob` at bottom of `backend/routes/arsenal.js`
- Pitcher splits route: `backend/routes/pitcherSplits.js`
- Scheduler: `backend/jobs/scheduler.js` — look at how gamelog crons are wired at lines 73–75
- DB service: `backend/services/db.js` — use `db.query()` and `db.isConnected()`
