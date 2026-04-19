# Prop Scout — PostgreSQL Data Layer Handoff

> **How to use this doc:** This is a self-contained task brief for Codex. Read this file plus `prop-scout-handoff.md` for full project context. Work only on the `feat/postgres-data-layer` branch.

---

## Goal

Add a PostgreSQL data layer so all external API calls happen on a server-side cron schedule rather than being triggered by user requests. Users read from the DB — fast, free of external latency, and Odds API usage drops to a flat ~96 calls/day regardless of traffic.

---

## Current Architecture

- Node/Express backend on port 3001 (`backend/`)
- In-memory TTL cache (`backend/services/cache.js`) — works but is per-process and ephemeral
- Routes hit external APIs on demand (MLB Stats API, The Odds API, Baseball Savant)
- Deployed on Railway. PostgreSQL addon available (first 500MB free)
- Frontend is a single `prop-scout-v7.jsx` — **do not modify it**

---

## What APIs Cost Money

Only **The Odds API** (`the-odds-api.com`) charges per call. MLB Stats API, Open-Meteo, Baseball Savant, and UmpScorecards are all free. The primary motivation for the DB layer is to flatten Odds API usage from `users × refreshes` to a fixed `~96 calls/day`.

---

## Your Task — Backend Only

No frontend changes. No changes to auth, picks, notes, digest, arsenal, or splits routes.

---

### 1. Install Dependencies

Add to `backend/package.json`:
- `pg` — PostgreSQL client
- `node-cron` — job scheduler

```bash
cd backend && npm install pg node-cron
```

---

### 2. Database Service

Create `backend/services/db.js`:

```js
const { Pool } = require("pg");

let pool = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });
  pool.on("error", (err) => console.error("DB pool error:", err.message));
  console.log("  ✓ PostgreSQL connected");
} else {
  console.warn("  ⚠ DATABASE_URL not set — DB layer disabled, using in-memory cache only");
}

/**
 * Run a parameterised query. Returns null if DB is not configured.
 */
async function query(sql, params = []) {
  if (!pool) return null;
  const result = await pool.query(sql, params);
  return result;
}

module.exports = { query, isConnected: () => !!pool };
```

---

### 3. Migration Script

Create `backend/migrations/001_init.sql`:

```sql
-- Slate snapshots (today's schedule)
CREATE TABLE IF NOT EXISTS slate_snapshots (
  id          SERIAL PRIMARY KEY,
  slate_date  DATE         NOT NULL,
  fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  games       JSONB        NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_slate_date ON slate_snapshots(slate_date);

-- Odds snapshots (one row per game per slate date)
CREATE TABLE IF NOT EXISTS odds_snapshots (
  id          SERIAL PRIMARY KEY,
  game_key    TEXT         NOT NULL,  -- "AwayFullName|HomeFullName"
  slate_date  DATE         NOT NULL,
  fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  odds        JSONB        NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_odds_date ON odds_snapshots(slate_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_odds_game_date ON odds_snapshots(game_key, slate_date);

-- Player stats cache
CREATE TABLE IF NOT EXISTS player_stats (
  player_id   INTEGER      NOT NULL,
  stat_group  TEXT         NOT NULL,  -- "pitching" | "hitting"
  season      INTEGER      NOT NULL,
  fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  stats       JSONB        NOT NULL,
  PRIMARY KEY (player_id, stat_group, season)
);

-- Bullpen snapshots (per game)
CREATE TABLE IF NOT EXISTS bullpen_snapshots (
  game_pk     INTEGER      PRIMARY KEY,
  fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  data        JSONB        NOT NULL
);

-- Linescore snapshots (live scores, updated frequently)
CREATE TABLE IF NOT EXISTS linescore_snapshots (
  game_pk     INTEGER      PRIMARY KEY,
  fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  data        JSONB        NOT NULL
);

-- Umpire assignments (per game)
CREATE TABLE IF NOT EXISTS umpire_snapshots (
  game_pk     INTEGER      PRIMARY KEY,
  fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  data        JSONB        NOT NULL
);
```

Create `backend/scripts/migrate.js`:

```js
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const fs   = require("fs");
const path = require("path");
const { query, isConnected } = require("../services/db");

async function migrate() {
  if (!isConnected()) {
    console.error("DATABASE_URL not set — cannot run migrations");
    process.exit(1);
  }
  const sql = fs.readFileSync(path.join(__dirname, "../migrations/001_init.sql"), "utf8");
  await query(sql);
  console.log("✅ Migrations applied");
  process.exit(0);
}

migrate().catch(err => { console.error("Migration failed:", err.message); process.exit(1); });
```

Run once on deploy:
```bash
node backend/scripts/migrate.js
```

---

### 4. Job Functions

Create `backend/jobs/snapshotJobs.js`:

```js
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const mlb    = require("../services/mlbApi");
const { query } = require("../services/db");
const axios  = require("axios");

const SEASON = new Date().getFullYear();

// ── Helpers ──────────────────────────────────────────────────

function todayHonolulu() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}

// ── Snapshot: Slate ──────────────────────────────────────────
// Fetches today's MLB schedule and upserts into slate_snapshots.
// Reuses the same MLB API call shape as backend/routes/schedule.js.
async function snapshotSlate(date = todayHonolulu()) {
  console.log(`  → Job: snapshotSlate  date=${date}`);
  try {
    const { data } = await mlb.get("/schedule", {
      params: { sportId: 1, date, hydrate: "probablePitcher,linescore,team,venue" },
    });
    const games = data.dates?.[0]?.games ?? [];
    await query(
      `INSERT INTO slate_snapshots (slate_date, fetched_at, games)
       VALUES ($1, NOW(), $2)
       ON CONFLICT (slate_date) DO UPDATE SET fetched_at = NOW(), games = $2`,
      [date, JSON.stringify(games)]
    );
    console.log(`  ✓ snapshotSlate  date=${date}  games=${games.length}`);
  } catch (err) {
    console.error(`  ✗ snapshotSlate failed: ${err.message}`);
  }
}

// ── Snapshot: Odds ───────────────────────────────────────────
// Fetches The Odds API for today's MLB games and upserts per-game.
async function snapshotOdds(date = todayHonolulu()) {
  const key = process.env.ODDS_API_KEY;
  if (!key) { console.warn("  ⚠ snapshotOdds: ODDS_API_KEY not set"); return; }
  console.log(`  → Job: snapshotOdds  date=${date}`);
  try {
    const res = await axios.get("https://api.the-odds-api.com/v4/sports/baseball_mlb/odds", {
      params: { apiKey: key, regions: "us", markets: "h2h,totals,spreads", oddsFormat: "american" },
      timeout: 12000,
    });
    const games = res.data ?? [];
    for (const g of games) {
      const gameKey = `${g.away_team}|${g.home_team}`;
      await query(
        `INSERT INTO odds_snapshots (game_key, slate_date, fetched_at, odds)
         VALUES ($1, $2, NOW(), $3)
         ON CONFLICT (game_key, slate_date) DO UPDATE SET fetched_at = NOW(), odds = $3`,
        [gameKey, date, JSON.stringify(g)]
      );
    }
    console.log(`  ✓ snapshotOdds  date=${date}  games=${games.length}  remaining=${res.headers["x-requests-remaining"] ?? "?"}`);
  } catch (err) {
    console.error(`  ✗ snapshotOdds failed: ${err.message}`);
  }
}

// ── Snapshot: Bullpen ────────────────────────────────────────
async function snapshotBullpen(gamePk) {
  console.log(`  → Job: snapshotBullpen  gamePk=${gamePk}`);
  try {
    // Reuse the buildGameBullpen logic by importing from the route
    const { buildGameBullpenForJob } = require("../routes/bullpen");
    const data = await buildGameBullpenForJob(gamePk);
    await query(
      `INSERT INTO bullpen_snapshots (game_pk, fetched_at, data)
       VALUES ($1, NOW(), $2)
       ON CONFLICT (game_pk) DO UPDATE SET fetched_at = NOW(), data = $2`,
      [gamePk, JSON.stringify(data)]
    );
    console.log(`  ✓ snapshotBullpen  gamePk=${gamePk}`);
  } catch (err) {
    console.error(`  ✗ snapshotBullpen ${gamePk} failed: ${err.message}`);
  }
}

// ── Snapshot: Linescore ──────────────────────────────────────
async function snapshotLinescore(gamePk) {
  try {
    const { data } = await mlb.get(`/game/${gamePk}/linescore`);
    const innings  = data.innings ?? [];
    const inning1  = innings[0] ?? null;
    const payload  = {
      gamePk:      Number(gamePk),
      inning:      data.currentInning      ?? null,
      halfInning:  data.inningHalf?.toLowerCase() ?? null,
      awayScore:   data.teams?.away?.runs  ?? 0,
      homeScore:   data.teams?.home?.runs  ?? 0,
      outs:        data.outs               ?? 0,
      firstInning: inning1 ? { away: inning1.away?.runs ?? null, home: inning1.home?.runs ?? null } : null,
    };
    await query(
      `INSERT INTO linescore_snapshots (game_pk, fetched_at, data)
       VALUES ($1, NOW(), $2)
       ON CONFLICT (game_pk) DO UPDATE SET fetched_at = NOW(), data = $2`,
      [gamePk, JSON.stringify(payload)]
    );
  } catch (err) {
    // Linescore unavailable pre-game — silent, not an error
  }
}

// ── Snapshot: Umpires ────────────────────────────────────────
async function snapshotUmpires(gamePk) {
  console.log(`  → Job: snapshotUmpires  gamePk=${gamePk}`);
  try {
    const { data }    = await mlb.get(`/game/${gamePk}/boxscore`);
    const officials   = data.officials ?? [];
    const hp          = officials.find(o => o.officialType === "Home Plate");
    const payload     = {
      gamePk:    Number(gamePk),
      homePlate: hp ? { id: hp.official.id, name: hp.official.fullName } : null,
      all:       officials.map(o => ({ id: o.official.id, name: o.official.fullName, position: o.officialType })),
    };
    await query(
      `INSERT INTO umpire_snapshots (game_pk, fetched_at, data)
       VALUES ($1, NOW(), $2)
       ON CONFLICT (game_pk) DO UPDATE SET fetched_at = NOW(), data = $2`,
      [gamePk, JSON.stringify(payload)]
    );
    console.log(`  ✓ snapshotUmpires  gamePk=${gamePk}  hp=${hp?.official?.fullName ?? "TBD"}`);
  } catch (err) {
    console.error(`  ✗ snapshotUmpires ${gamePk} failed: ${err.message}`);
  }
}

module.exports = { snapshotSlate, snapshotOdds, snapshotBullpen, snapshotLinescore, snapshotUmpires, todayHonolulu };
```

---

### 5. Export buildGameBullpen for Jobs

In `backend/routes/bullpen.js`, export `buildGameBullpen` so the job runner can call it directly:

```js
// At the bottom of bullpen.js, alongside module.exports = router:
module.exports = router;
module.exports.buildGameBullpenForJob = buildGameBullpen;
```

---

### 6. Scheduler

Create `backend/jobs/scheduler.js`:

```js
const cron = require("node-cron");
const { query, isConnected } = require("../services/db");
const {
  snapshotSlate, snapshotOdds, snapshotBullpen,
  snapshotLinescore, snapshotUmpires, todayHonolulu,
} = require("./snapshotJobs");

async function getTodayGamePks() {
  if (!isConnected()) return [];
  const date   = todayHonolulu();
  const result = await query("SELECT games FROM slate_snapshots WHERE slate_date = $1", [date]);
  const games  = result?.rows?.[0]?.games ?? [];
  return games.map(g => g.gamePk).filter(Boolean);
}

async function getInProgressGamePks() {
  if (!isConnected()) return [];
  const date   = todayHonolulu();
  const result = await query("SELECT games FROM slate_snapshots WHERE slate_date = $1", [date]);
  const games  = result?.rows?.[0]?.games ?? [];
  return games.filter(g => g.status?.detailedState === "In Progress" || g.status?.detailedState === "Warmup")
              .map(g => g.gamePk);
}

function startScheduler() {
  console.log("  ✓ Job scheduler started");

  // Daily slate snapshot — 8 AM Honolulu
  cron.schedule("0 8 * * *", () => snapshotSlate(), { timezone: "Pacific/Honolulu" });

  // Odds — every 15 minutes
  cron.schedule("*/15 * * * *", () => snapshotOdds());

  // Bullpen — every 30 minutes, all today's games
  cron.schedule("*/30 * * * *", async () => {
    const gamePks = await getTodayGamePks();
    for (const pk of gamePks) await snapshotBullpen(pk);
  });

  // Linescore — every minute, in-progress games only
  cron.schedule("* * * * *", async () => {
    const gamePks = await getInProgressGamePks();
    for (const pk of gamePks) await snapshotLinescore(pk);
  });

  // Umpires — 10 AM Honolulu daily (assigned day-of)
  cron.schedule("0 10 * * *", async () => {
    const gamePks = await getTodayGamePks();
    for (const pk of gamePks) await snapshotUmpires(pk);
  }, { timezone: "Pacific/Honolulu" });
}

module.exports = { startScheduler };
```

---

### 7. Update Routes to Read DB First

For each route below, add a DB-first check before the existing MLB API call. Pattern:

```js
const { query, isConnected } = require("../services/db");

// At top of route handler, before existing cache check:
if (isConnected()) {
  const row = await query(
    "SELECT data, fetched_at FROM <table> WHERE <key> = $1", [id]
  );
  const entry = row?.rows?.[0];
  if (entry && (Date.now() - new Date(entry.fetched_at).getTime()) < TTL_MS) {
    res.setHeader("X-Cache", "DB-HIT");
    return res.json(entry.data);
  }
}
// ... existing logic continues unchanged
```

Apply to:

| Route file | Table | Key column | TTL |
|---|---|---|---|
| `schedule.js` | `slate_snapshots` | `slate_date` | 1 hour |
| `bullpen.js` | `bullpen_snapshots` | `game_pk` | 30 min |
| `linescore.js` | `linescore_snapshots` | `game_pk` | 60 sec |
| `umpires.js` | `umpire_snapshots` | `game_pk` | 1 hour |

Keep `cache.js` in-memory layer intact — it sits in front of the DB check as a first-line short-circuit.

---

### 8. Mount Scheduler in server.js

```js
// In backend/server.js, near the bottom before app.listen:
if (process.env.NODE_ENV === "production" || process.env.ENABLE_JOBS === "true") {
  const { startScheduler } = require("./jobs/scheduler");
  startScheduler();
}
```

---

### 9. Admin Endpoint

Add to `backend/server.js`:

```js
app.get("/api/admin/jobs/run", async (req, res) => {
  if (req.headers["x-admin-secret"] !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { snapshotSlate, snapshotOdds } = require("./jobs/snapshotJobs");
  await snapshotSlate();
  await snapshotOdds();
  res.json({ ok: true, ran: ["snapshotSlate", "snapshotOdds"] });
});
```

---

### 10. Environment Variables

Add to `backend/.env.example`:

```
DATABASE_URL=postgres://user:password@host:5432/dbname
ENABLE_JOBS=true
ADMIN_SECRET=replace_me
```

---

## Verification Checklist

1. `npm install` in `backend/` completes cleanly
2. `node backend/scripts/migrate.js` applies schema without errors (requires `DATABASE_URL`)
3. `node -e "require('./backend/services/db')"` — when `DATABASE_URL` is unset, logs a warning and does not crash
4. `node -e "const {startScheduler} = require('./backend/jobs/scheduler'); console.log('ok')"` — loads cleanly
5. All existing routes still work with no `DATABASE_URL` set (in-memory cache fallback unchanged)
6. `GET /api/schedule` returns `X-Cache: DB-HIT` after a `snapshotSlate` has run
7. `GET /api/admin/jobs/run` with correct `x-admin-secret` header triggers jobs and returns `{ ok: true }`

---

## What NOT to Touch

- `prop-scout-v7.jsx` — no frontend changes
- `backend/routes/auth.js`, `picks.js`, `notes.js`, `digest.js`
- `backend/routes/arsenal.js`, `splits.js` — user-triggered lazy fetches, not worth snapshotting
- `backend/routes/players.js` — low volume, leave as-is for now
- `backend/data/umpires.json` — UmpScorecards static file, untouched
- `backend/data/users.json`, `picks.json`, `notes.json`

---

## Railway Deploy Notes

- Add `DATABASE_URL` and `ENABLE_JOBS=true` and `ADMIN_SECRET` to Railway environment variables
- Run `node backend/scripts/migrate.js` once after first deploy (can be added as a Railway deploy command)
- Railway Postgres free tier: 500MB — more than sufficient for JSONB snapshots at this scale

---

*Created April 2026 — feat/postgres-data-layer task brief*
