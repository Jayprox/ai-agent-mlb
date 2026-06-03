# Cursor Task — Phase 3: Pre-snapshot Pitcher Season Stats

## Problem

`GET /api/players/:playerId/stats?group=pitching` fires two live MLB API calls per request:

```
GET https://statsapi.mlb.com/api/v1/people/{playerId}          ← person info
GET https://statsapi.mlb.com/api/v1/people/{playerId}/stats    ← season stats
```

On a 13-game slate with 26 probable starters, this is **52 live MLB API calls per board load**. This data is static for the day — pitcher season stats and identity don't change between games.

The existing `snapshotPitcherGamelogs` job (runs 10 AM + 2 PM HST) already fetches each starter's season stats. The schedule snapshot already stores their name, team, number, and hand. We have everything needed to build the stats payload without any new MLB API calls — we just need to save it.

---

## What's already working (do not change)

- `GET /api/players/:playerId/gamelog` — already 3-tier: in-memory → `player_gamelog_snapshots` DB → MLB API ✅
- `POST /api/players/gamelogs/batch` — already 3-tier ✅
- `snapshotPitcherGamelogs` job — already saves gamelog data to `player_gamelog_snapshots` with `stat_group = 'pitching'` ✅

---

## Goal

1. **Extend `snapshotPitcherGamelogs`** to also save the stats-shaped payload (same shape as `GET /api/players/:id/stats` returns) into `player_gamelog_snapshots` with `stat_group = 'season:pitching'`
2. **Update `GET /api/players/:playerId/stats`** to check the DB before calling MLB — adding the same 3-tier pattern as the gamelog route

No new DB tables needed. Reuse `player_gamelog_snapshots` with a different `stat_group` value.

---

## Files to touch

| File | Change |
|------|--------|
| `backend/jobs/snapshotJobs.js` | Extend `snapshotPitcherGamelogs` to also save `season:pitching` snapshot |
| `backend/routes/players.js` | Update `GET /:playerId/stats` to check DB first |

Do not touch `snapshotBatterGamelogs`, `GET /gamelog`, or any other route.

---

## Step 1 — Extend `snapshotPitcherGamelogs` in `snapshotJobs.js`

Find `snapshotPitcherGamelogs` (around line 411). After it loads `games` from the schedule snapshot and extracts `pitcherIds`, build a lookup map of pitcher identity from the schedule data (name, team, number, hand are already stored in the snapshot's `probablePitchers` fields):

Add this block immediately after the `pitcherIds` array is built (before the `if (!pitcherIds.length)` guard):

```js
// Build pitcher identity map from the schedule snapshot.
// The schedule snapshot stores name, team, number, and hand for each probable starter —
// so we can build the full stats payload without a separate people API call.
const pitcherIdentity = {};
games.forEach(g => {
  ["away", "home"].forEach(side => {
    const p = g.probablePitchers?.[side];
    if (p?.id) {
      pitcherIdentity[p.id] = {
        name:   p.name    ?? `Pitcher ${p.id}`,
        number: p.number  ?? "?",
        team:   p.team    ?? g[side]?.abbr ?? "?",
        hand:   p.hand    ?? "R",
      };
    }
  });
});
```

Then, inside the `for (const pitcherId of pitcherIds)` loop, after the existing DB save of the gamelog payload (the `INSERT INTO player_gamelog_snapshots ... stat_group = 'pitching'` line), add a second save for the stats shape:

```js
// Also snapshot the stats-shaped payload so GET /api/players/:id/stats?group=pitching
// can serve from DB instead of calling MLB API live.
const identity = pitcherIdentity[pitcherId] ?? {};
const statsPayload = {
  id:       pitcherId,
  name:     identity.name    ?? `Pitcher ${pitcherId}`,
  number:   identity.number  ?? "?",
  team:     identity.team    ?? "?",
  position: "P",
  hand:     identity.hand    ?? "R",
  season:   seasonSplit,
  era:      seasonSplit?.era                   ?? "0.00",
  whip:     seasonSplit?.whip                  ?? "0.00",
  kPer9:    seasonSplit?.strikeoutsPer9Inn     ?? "0.0",
  bbPer9:   seasonSplit?.walksPer9Inn          ?? "0.0",
  wins:     seasonSplit?.wins                  ?? 0,
  losses:   seasonSplit?.losses                ?? 0,
  ip:       seasonSplit?.inningsPitched        ?? "0.0",
  k:        seasonSplit?.strikeOuts            ?? 0,
  bb:       seasonSplit?.baseOnBalls           ?? 0,
};

await query(
  `INSERT INTO player_gamelog_snapshots (player_id, stat_group, slate_date, fetched_at, data)
   VALUES ($1, $2, $3, NOW(), $4)
   ON CONFLICT (player_id, stat_group, slate_date) DO UPDATE
     SET fetched_at = NOW(), data = $4`,
  [pitcherId, "season:pitching", date, JSON.stringify(statsPayload)]
);
```

**Important:** This second `INSERT` goes inside the same `try` block as the gamelog save, right after it. If the gamelog save succeeded, the stats save should too. The existing skip check at the top of the loop (`SELECT 1 ... WHERE stat_group = 'pitching'`) skips the whole pitcher on re-runs — that's fine because both rows (gamelog + stats) are saved in the same pass on first run.

The variable `seasonSplit` is already available in the loop — it's fetched earlier in the same `try` block as part of the gamelog logic (look for `personData.stats?.[0]?.splits?.[0]?.stat ?? {}`).

---

## Step 2 — Update `GET /api/players/:playerId/stats` in `players.js`

The route currently has 2 tiers: in-memory cache → MLB API. Add a DB tier in between.

Find the route handler (around line 75):

```js
router.get("/:playerId/stats", async (req, res) => {
  const { playerId } = req.params;
  const group        = req.query.group ?? "hitting";
  const cacheKey     = `player:${playerId}:${group}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    // Fetch person info + season stats in parallel
    const [personRes, statsRes] = await Promise.all([
```

After the in-memory cache check and before the `try` block that calls MLB, add a DB read:

```js
router.get("/:playerId/stats", async (req, res) => {
  const { playerId } = req.params;
  const group        = req.query.group ?? "hitting";
  const cacheKey     = `player:${playerId}:${group}`;

  // 1. In-memory cache
  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  // 2. DB snapshot (today's pre-fetched stats from snapshotPitcherGamelogs job)
  if (db.isConnected()) {
    try {
      const today = todayHonolulu();
      const snap = await db.query(
        `SELECT data FROM player_gamelog_snapshots
         WHERE player_id = $1 AND stat_group = $2 AND slate_date = $3`,
        [parseInt(playerId, 10), `season:${group}`, today]
      );
      if (snap?.rows?.[0]?.data) {
        const result = snap.rows[0].data;
        cache.set(cacheKey, result, 6 * 60 * 60 * 1000);
        res.setHeader("X-Cache", "DB-HIT");
        return res.json(result);
      }
    } catch (dbErr) {
      console.warn(`  ⚠ player stats DB read failed for ${playerId}: ${dbErr.message}`);
    }
  }

  // 3. Live MLB API fallback (only fires if snapshot is missing)
  try {
    const [personRes, statsRes] = await Promise.all([
      // ... rest of existing try block unchanged ...
```

The rest of the route handler (the `Promise.all`, result shaping, `cache.set`, and `res.json`) stays exactly as-is.

**Note:** `db` is already imported at the top of `players.js` (`const db = require("../services/db")`). `todayHonolulu()` is also already defined in that file. No new imports needed.

---

## What NOT to change

- `GET /api/players/:playerId/gamelog` — already fully DB-backed, leave it alone
- `POST /api/players/gamelogs/batch` — already fully DB-backed, leave it alone
- `snapshotBatterGamelogs` — batter stats are out of scope for this phase
- The existing gamelog save in `snapshotPitcherGamelogs` — the new stats save is additive, the gamelog save is unchanged
- The skip check in `snapshotPitcherGamelogs` (`SELECT 1 ... WHERE stat_group = 'pitching'`) — leave it as-is. Both rows save on first run, skip fires on re-runs.
- Any frontend files

---

## Acceptance criteria

- [ ] After `snapshotPitcherGamelogs` runs, `SELECT stat_group, count(*) FROM player_gamelog_snapshots WHERE slate_date = TODAY GROUP BY stat_group` shows rows for both `'pitching'` and `'season:pitching'`
- [ ] `GET /api/players/:id/stats?group=pitching` returns `X-Cache: DB-HIT` after the job has run
- [ ] Opening Board after 10:30 AM produces **zero** `→ MLB API GET .../people/{id}` or `→ MLB API GET .../people/{id}/stats` log lines from the stats route (individual player stat calls)
- [ ] If no snapshot exists (before 10 AM or for a player not in today's slate), the route falls through to the live MLB call with no errors
- [ ] No syntax errors; `players.js` and `snapshotJobs.js` parse cleanly

---

## Reference

- `player_gamelog_snapshots` table schema: `(player_id INTEGER, stat_group TEXT, slate_date DATE, fetched_at TIMESTAMPTZ, data JSONB, PRIMARY KEY (player_id, stat_group, slate_date))` — defined in `ensurePhaseOneTables()` in `snapshotJobs.js`
- `snapshotPitcherGamelogs` function: `backend/jobs/snapshotJobs.js` ~line 411
- `GET /api/players/:playerId/stats` route: `backend/routes/players.js` ~line 75
- Phase 1 (already done): `GET /api/arsenal/:id` and `GET /api/pitcher-splits/:id` both follow the same 3-tier pattern — use those as style reference
- `db.isConnected()` and `db.query()` are the correct method signatures from `backend/services/db.js`
