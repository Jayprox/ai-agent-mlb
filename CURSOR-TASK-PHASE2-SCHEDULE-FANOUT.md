# Cursor Task — Phase 2: Eliminate Schedule Fan-out from NRFI + Bullpen Routes

## Problem

Every time a user opens the Board, the frontend fires `GET /api/nrfi/:gamePk` and `GET /api/bullpen/:gamePk` for each game (up to 26 calls on a full slate). Both routes need the away/home team IDs and game date to do their work. To get them, each calls:

```
GET https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePks={gamePk}&hydrate=team
```

Both routes share an in-memory cache key (`gameMeta:{gamePk}`), but when they run in parallel on first load, both miss the cache and each fires its own live schedule call — producing up to **26 duplicate schedule fetches per session**.

This data is already stored in `schedule_snapshots` (the Postgres table populated by `pollSchedule` every 30 min). There is no reason to call the MLB schedule API live.

---

## Goal

Update both `nrfi.js` and `bullpen.js` to read game metadata (away/home team IDs + game date) from the `schedule_snapshots` DB table first. Fall back to the live MLB schedule call only if the snapshot doesn't have the game. After this change, **zero live schedule calls** should fire from either route on a normal board load.

---

## What `schedule_snapshots` stores

The table has one row per `slate_date`. The `games` column is a JSONB array where each element looks like:

```json
{
  "gamePk": 823380,
  "id": 823380,
  "gameTime": "2026-05-22T23:10:00Z",
  "stadium": "Dodger Stadium",
  "away": { "id": 113, "name": "Cincinnati Reds", "abbr": "CIN" },
  "home": { "id": 119, "name": "Los Angeles Dodgers", "abbr": "LAD" },
  "probablePitchers": { ... },
  "status": "Scheduled"
}
```

The fields needed by `fetchGameMeta` are: `away.id`, `away.name`, `home.id`, `home.name`, `gameTime` (from which `gameDate` = `gameTime.slice(0, 10)`).

---

## Files to touch

| File | Change |
|------|--------|
| `backend/routes/nrfi.js` | Update `fetchGameMeta()` to check DB snapshot first |
| `backend/routes/bullpen.js` | Update the inline gameMeta lookup in `buildGameBullpen()` to check DB snapshot first |

Do not touch any other files.

---

## Step 1 — Update `fetchGameMeta` in `nrfi.js`

Add the db import at the top of `backend/routes/nrfi.js`:

```js
const { query, isConnected } = require("../services/db");
```

Then rewrite `fetchGameMeta` to check the DB before calling MLB:

```js
const GAME_META_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours — team assignments never change mid-day

async function fetchGameMeta(gamePk) {
  const cacheKey = `gameMeta:${gamePk}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const numericPk = parseInt(gamePk, 10);

  // ── 1. DB snapshot (today's schedule — already stored by pollSchedule every 30 min)
  if (isConnected()) {
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
      const snap = await query(
        "SELECT games FROM schedule_snapshots WHERE slate_date = $1",
        [today]
      );
      const games = snap?.rows?.[0]?.games ?? [];
      const game  = games.find(g => g.gamePk === numericPk || g.id === numericPk);
      if (game?.away?.id && game?.home?.id) {
        const result = {
          gameDate: (game.gameTime ?? game.time ?? today).slice(0, 10),
          away: { id: game.away.id, name: game.away.name ?? "" },
          home: { id: game.home.id, name: game.home.name ?? "" },
        };
        cache.set(cacheKey, result, GAME_META_TTL_MS);
        return result;
      }
    } catch (err) {
      console.warn(`  ⚠ nrfi fetchGameMeta DB read failed for ${gamePk}: ${err.message}`);
    }
  }

  // ── 2. Live MLB schedule fallback (only fires if snapshot is missing or stale)
  const { data } = await mlb.get("/schedule", {
    params: {
      sportId: 1,
      gamePks: gamePk,
      hydrate: "team",
    },
  });

  const game = data.dates?.[0]?.games?.[0] ?? null;
  if (!game) return null;

  const result = {
    gameDate: game.gameDate?.slice(0, 10),
    away: {
      id: game.teams?.away?.team?.id,
      name: game.teams?.away?.team?.name ?? "",
    },
    home: {
      id: game.teams?.home?.team?.id,
      name: game.teams?.home?.team?.name ?? "",
    },
  };

  cache.set(cacheKey, result, GAME_META_TTL_MS);
  return result;
}
```

The rest of `nrfi.js` is unchanged — `fetchRecentTeamGames`, `computeTeamFirstInning`, the route handler, and the exported `getNrfiForGame` all stay exactly as they are.

---

## Step 2 — Update `buildGameBullpen` in `bullpen.js`

`bullpen.js` already imports `{ query, isConnected }` from `../services/db` at line 5 — no new import needed.

Find `buildGameBullpen` (around line 255). It currently has this inline gameMeta lookup:

```js
async function buildGameBullpen(gamePk) {
  const cacheKey = `bullpen:game:${gamePk}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // Reuse the same gameMeta cache key as nrfi.js — if NRFI already fetched it, this is free
  const GAME_META_TTL_MS = 4 * 60 * 60 * 1000;
  const metaCacheKey = `gameMeta:${gamePk}`;
  let gameMeta = cache.get(metaCacheKey);

  if (!gameMeta) {
    const { data } = await mlb.get("/schedule", {
      params: { sportId: 1, gamePks: gamePk, hydrate: "team" },
    });
    const game = data.dates?.[0]?.games?.[0];
    if (!game) throw new Error(`Game not found for gamePk=${gamePk}`);
    gameMeta = {
      gameDate: game.gameDate?.slice(0, 10),
      away: { id: game.teams?.away?.team?.id, name: game.teams?.away?.team?.name ?? "" },
      home: { id: game.teams?.home?.team?.id, name: game.teams?.home?.team?.name ?? "" },
    };
    cache.set(metaCacheKey, gameMeta, GAME_META_TTL_MS);
  }
  ...
```

Replace that `if (!gameMeta)` block with the same three-tier lookup (in-memory → DB → MLB):

```js
async function buildGameBullpen(gamePk) {
  const cacheKey = `bullpen:game:${gamePk}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const GAME_META_TTL_MS = 4 * 60 * 60 * 1000;
  const metaCacheKey = `gameMeta:${gamePk}`;
  const numericPk    = parseInt(gamePk, 10);

  // ── 1. In-memory cache (shared with nrfi.js — if NRFI ran first this is free)
  let gameMeta = cache.get(metaCacheKey);

  // ── 2. DB snapshot
  if (!gameMeta && isConnected()) {
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
      const snap  = await query(
        "SELECT games FROM schedule_snapshots WHERE slate_date = $1",
        [today]
      );
      const games = snap?.rows?.[0]?.games ?? [];
      const game  = games.find(g => g.gamePk === numericPk || g.id === numericPk);
      if (game?.away?.id && game?.home?.id) {
        gameMeta = {
          gameDate: (game.gameTime ?? game.time ?? today).slice(0, 10),
          away: { id: game.away.id, name: game.away.name ?? "" },
          home: { id: game.home.id, name: game.home.name ?? "" },
        };
        cache.set(metaCacheKey, gameMeta, GAME_META_TTL_MS);
      }
    } catch (err) {
      console.warn(`  ⚠ bullpen buildGameBullpen DB read failed for ${gamePk}: ${err.message}`);
    }
  }

  // ── 3. Live MLB schedule fallback
  if (!gameMeta) {
    const { data } = await mlb.get("/schedule", {
      params: { sportId: 1, gamePks: gamePk, hydrate: "team" },
    });
    const game = data.dates?.[0]?.games?.[0];
    if (!game) throw new Error(`Game not found for gamePk=${gamePk}`);
    gameMeta = {
      gameDate: game.gameDate?.slice(0, 10),
      away: { id: game.teams?.away?.team?.id, name: game.teams?.away?.team?.name ?? "" },
      home: { id: game.teams?.home?.team?.id, name: game.teams?.home?.team?.name ?? "" },
    };
    cache.set(metaCacheKey, gameMeta, GAME_META_TTL_MS);
  }

  const awayTeamId = gameMeta.away?.id;
  const homeTeamId = gameMeta.home?.id;
  if (!awayTeamId || !homeTeamId) throw new Error(`Missing team ids for gamePk=${gamePk}`);

  // ... rest of buildGameBullpen unchanged (Promise.all for awayTeam/homeTeam, etc.)
```

Everything after the `if (!awayTeamId || !homeTeamId)` guard stays exactly as it was.

---

## What NOT to change

- `fetchRecentTeamGames` in `nrfi.js` — this fetches 120 days of a team's historical schedule to compute NRFI tendencies. It's a different call (by `teamId` + date range) and cannot use the today's snapshot. Leave it alone.
- The route handler `router.get("/:gamePk", ...)` in both files — unchanged
- `getNrfiForGame` / `getNrfiResult` export at the bottom of `nrfi.js` — unchanged
- `buildGameBullpenForJob` export at the bottom of `bullpen.js` — unchanged (if present)
- All other routes, jobs, and frontend files

---

## Acceptance criteria

- [ ] Opening Board with 13 games produces **zero** `→ MLB API GET .../schedule?...gamePks=` log lines (only `→ MLB API GET .../schedule?...teamId=` lines from `fetchRecentTeamGames` are acceptable)
- [ ] `fetchGameMeta` in `nrfi.js` has three tiers: in-memory cache → DB snapshot → MLB fallback
- [ ] `buildGameBullpen` in `bullpen.js` has the same three tiers with the shared `gameMeta:{gamePk}` in-memory key
- [ ] If the schedule snapshot doesn't exist (server just started, before first `pollSchedule` run), both routes fall through to the live MLB call with no errors
- [ ] `buildGameBullpenForJob` (used by `snapshotBullpen` cron) still works correctly — it calls `buildGameBullpen` internally, which will now benefit from the DB lookup automatically
- [ ] No syntax errors; both files parse cleanly

---

## Reference

- `schedule_snapshots` table: populated by `pollSchedule()` every 30 min in `backend/jobs/snapshotJobs.js`
- Existing DB import in `bullpen.js`: already has `const { query, isConnected } = require("../services/db")` at line 5
- `nrfi.js` needs the same import added
- The `gameMeta:{gamePk}` cache key is intentionally shared between both files — this deduplication is by design. After this change, whichever route runs first (nrfi or bullpen) populates it from the DB, and the other gets it from in-memory for free.
