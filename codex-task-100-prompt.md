# CODEX TASK 100 — DB-backed Player Gamelog Snapshots

## Files to modify

- `backend/migrations/004_gamelog_snapshots.sql` — **already created**, do not recreate
- `backend/routes/players.js` — gamelog route: DB read-through + write-through
- `backend/jobs/snapshotJobs.js` — `snapshotPitcherGamelogs()` + table creation
- `backend/jobs/scheduler.js` — import + schedule

## Read before starting

Read **CODEX TASK 100** in `AGENT_SYSTEM_PROMPT.md` for full context and the complete code for each change.

## Problem being solved

Every time a player card opens, the backend calls the MLB Stats API live for the gamelog. With 20–30 players per slate, this generates dozens of outbound calls per session. The in-memory 6h TTL only helps if the Railway dyno hasn't restarted. The fix: persist gamelog data to PostgreSQL. The route reads from DB first; on a miss it fetches from MLB, writes through, then serves the result. A daily cron pre-fetches all starting pitchers at 10 AM and 2 PM Honolulu.

---

## Changes — in order

### 1 — Migration file (ALREADY DONE — do NOT modify)

`backend/migrations/004_gamelog_snapshots.sql` already exists with the `player_gamelog_snapshots` DDL. Skip this step.

---

### 2 — `backend/routes/players.js`

**Add import at top:**
```js
const db = require("../services/db");
```

**Add helper after `TEAM_ABBR` constant:**
```js
function todayHonolulu() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}
```

**Replace the entire `router.get("/:playerId/gamelog", ...)` handler body** with the three-layer read-through logic from the spec:
1. Check in-memory cache (`cache.get`) → serve `X-Cache: HIT`
2. Check `player_gamelog_snapshots` DB for today → serve `X-Cache: DB_HIT`, populate L1 cache
3. Fetch from MLB API → write-through to DB (best-effort, non-blocking) + populate L1 cache → serve `X-Cache: MISS`

The shape of the response object (`result`) does not change — this is a pure infrastructure change. Copy the existing result-building logic verbatim into the new handler; only the caching plumbing around it changes.

See **CODEX TASK 100** in `AGENT_SYSTEM_PROMPT.md` for the full handler code.

---

### 3 — `backend/jobs/snapshotJobs.js`

**Inside `ensurePhaseOneTables()`** — add after the `scout_evaluations` CREATE TABLE block:
```js
await query(`
  CREATE TABLE IF NOT EXISTS player_gamelog_snapshots (
    player_id   INTEGER      NOT NULL,
    stat_group  TEXT         NOT NULL,
    slate_date  DATE         NOT NULL,
    fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    data        JSONB        NOT NULL,
    PRIMARY KEY (player_id, stat_group, slate_date)
  )
`);
```

**Add `snapshotPitcherGamelogs` function** after `pollPlayerProps` and before `ipStringToOuts`. The function:
- Gets today's probable pitchers from `schedule_snapshots`
- Skips any pitcher that already has a row for today (idempotent)
- Fetches gamelog from MLB API (falls back to prior season if empty)
- Builds the same `{ group, games, avgIP, seasonEra }` shape as the `/gamelog` route
- Upserts to `player_gamelog_snapshots`
- Uses `ipStringToOuts` (already defined in this file) for avgIP computation
- 600ms delay between pitcher fetches to respect MLB API rate limits

See **CODEX TASK 100** in `AGENT_SYSTEM_PROMPT.md` for the full function code.

**Update `module.exports`** — add `snapshotPitcherGamelogs` to the exports object.

---

### 4 — `backend/jobs/scheduler.js`

**Update the destructured import** from `./snapshotJobs` to include `snapshotPitcherGamelogs`.

**Add cron schedule** inside `startScheduler()`, after the existing `0 10 * * *` umpires schedule:
```js
// Pre-fetch pitcher gamelogs at 10 AM and 2 PM Honolulu
cron.schedule("0 10,14 * * *", () => snapshotPitcherGamelogs(), { timezone: "Pacific/Honolulu" });
```

---

## What does NOT change

- Response shape of `/api/players/:playerId/gamelog` — identical JSON in all code paths
- `GAMELOG_TTL_MS = 6 * 60 * 60 * 1000` in `players.js` — still used for L1 TTL
- All other routes in `players.js` (`/stats`, `/rbi-context`, `/vs/:pitcherId`)
- `prop-scout-v7.jsx` — no frontend changes
- Any existing snapshot jobs or tables

---

## Validation checklist

1. No server startup errors.
2. First request for a player gamelog after dyno restart → `X-Cache: MISS`, data appears normally.
3. Second request for same player → `X-Cache: HIT` (in-memory).
4. After clearing in-memory cache (restart), repeat request → `X-Cache: DB_HIT`.
5. DB row exists in `player_gamelog_snapshots` for the fetched player + today's Honolulu date.
6. 10 AM / 2 PM Honolulu cron logs `snapshotPitcherGamelogs` with correct pitcher count.
7. After cron runs, opening a pitcher card → `X-Cache: DB_HIT`.
8. No regression on other player routes or any other view.
