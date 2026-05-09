# CODEX TASK 105 — Batch Gamelog Endpoint (Board Load Performance)

## Problem

Opening the Board tab fires **one HTTP request per lineup batter** to `/api/players/:id/gamelog?group=hitting`. On a full 15-game slate that is ~270 individual requests. The browser caps concurrent connections at 6 per domain, so those 270 calls queue in batches of 6 — producing a 4–15 second load delay even when every response hits the DB cache. Users notice.

## Solution

Add `POST /api/players/gamelogs/batch` to the backend. The frontend Board pre-fetch replaces its per-batter loop with a single call to this endpoint. 270 HTTP round trips → 1.

---

## Files to modify

- `backend/routes/players.js` — add batch route
- `prop-scout-v7.jsx` — replace the Board pre-fetch batter loop

## No changes to

- The existing `GET /api/players/:playerId/gamelog` route — leave it intact (still used by game-view lineup drawer and per-batter expand)
- `backend/server.js` — players router is already mounted at `/api/players`
- All other routes and state

---

## Change 1 — Add batch route to `backend/routes/players.js`

Place this block **before** the existing `router.get("/:playerId/gamelog", ...)` handler so Express sees it first.

```js
// ── POST /api/players/gamelogs/batch ──────────────────────────────────────────
// Accepts { playerIds: number[], group: "hitting"|"pitching" }
// Returns { results: { [playerId]: data }, misses: number[] }
// Resolves via the same 3-layer cache as the individual gamelog route:
//   L1 in-memory → L2 DB snapshot → L3 MLB API (parallel, capped at 8 concurrent)
router.post("/gamelogs/batch", async (req, res) => {
  const playerIds = Array.isArray(req.body?.playerIds) ? req.body.playerIds : [];
  const group = req.body?.group === "pitching" ? "pitching" : "hitting";
  const today = todayHonolulu();

  if (!playerIds.length) return res.json({ results: {}, misses: [] });

  const uniqueIds = [...new Set(playerIds.map(Number))].filter(Boolean);
  const results = {};
  const needDb  = [];

  // L1 — in-memory cache
  for (const id of uniqueIds) {
    const cacheKey = `gamelog:${id}:${group}`;
    const hit = cache.get(cacheKey);
    if (hit) results[id] = hit;
    else needDb.push(id);
  }

  // L2 — single DB query for all remaining IDs
  if (needDb.length && db.isConnected()) {
    try {
      const dbResult = await db.query(
        `SELECT player_id, data FROM player_gamelog_snapshots
         WHERE player_id = ANY($1) AND stat_group = $2 AND slate_date = $3`,
        [needDb, group, today]
      );
      for (const row of dbResult?.rows ?? []) {
        const id = row.player_id;
        results[id] = row.data;
        cache.set(`gamelog:${id}:${group}`, row.data, GAMELOG_TTL_MS);
      }
    } catch (dbErr) {
      console.warn("batch gamelog DB read failed:", dbErr.message);
    }
  }

  // L3 — MLB API for remaining misses (parallel, max 8 concurrent)
  const needApi = uniqueIds.filter(id => !results[id]);
  const misses  = [];

  if (needApi.length) {
    const CONCURRENCY = 8;
    for (let i = 0; i < needApi.length; i += CONCURRENCY) {
      const chunk = needApi.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(async (id) => {
        try {
          let season = SEASON;
          let splits = await gamelogStatsFor(id, group, season);
          if (!splits.length) {
            season -= 1;
            splits = await gamelogStatsFor(id, group, season);
          }
          const { person, seasonSplit } = await seasonStatsFor(id, group, season);
          if (!person) { misses.push(id); return; }

          const sorted = [...splits].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

          const payload = group === "pitching"
            ? (() => {
                const starts = sorted.filter(g => (g.stat?.gamesStarted ?? 0) > 0).slice(0, 5);
                const games = starts.map(g => ({
                  date:     g.date,
                  opponent: TEAM_ABBR[g.opponent?.id] ?? g.opponent?.name ?? "?",
                  ip:       g.stat?.inningsPitched ?? "0.0",
                  k:        g.stat?.strikeOuts ?? 0,
                  er:       g.stat?.earnedRuns ?? 0,
                  pc:       g.stat?.numberOfPitches ?? null,
                  era:      g.stat?.era ?? "0.00",
                  result:   (g.stat?.wins ?? 0) > 0 ? "W" : (g.stat?.losses ?? 0) > 0 ? "L" : "ND",
                }));
                const totalOuts   = games.reduce((sum, g) => sum + parseIpToOuts(g.ip), 0);
                const avgIPOuts   = games.length > 0 ? totalOuts / games.length : 0;
                const avgIPWhole  = Math.floor(avgIPOuts / 3);
                const avgIPThirds = Math.round(avgIPOuts % 3);
                const avgIP = games.length > 0 ? `${avgIPWhole}.${avgIPThirds}` : "—";
                return { group: "pitching", games, avgIP, seasonEra: seasonSplit?.era ?? "0.00" };
              })()
            : (() => {
                const games = sorted.slice(0, 10).map(g => ({
                  date:     g.date,
                  opponent: TEAM_ABBR[g.opponent?.id] ?? g.opponent?.name ?? "?",
                  ab:       g.stat?.atBats ?? 0,
                  h:        g.stat?.hits ?? 0,
                  hr:       g.stat?.homeRuns ?? 0,
                  rbi:      g.stat?.rbi ?? 0,
                  avg:      g.stat?.avg ?? ".000",
                }));
                const last7 = sorted.filter(g => (g.stat?.atBats ?? 0) > 0).slice(0, 7);
                const last7Hits = last7.reduce((sum, g) => sum + (g.stat?.hits ?? 0), 0);
                const last7Abs  = last7.reduce((sum, g) => sum + (g.stat?.atBats ?? 0), 0);
                const gp    = Number(seasonSplit?.gamesPlayed) || 0;
                const tbTot = Number(seasonSplit?.totalBases)  || 0;
                return {
                  group: "hitting", games,
                  seasonAvg: seasonSplit?.avg ?? ".000",
                  last7Avg:  last7Abs > 0 ? `${(last7Hits / last7Abs).toFixed(3).replace(/^0/, "")}` : ".000",
                  avg:    seasonSplit?.avg               ?? ".000",
                  ops:    seasonSplit?.ops               ?? ".000",
                  slg:    seasonSplit?.sluggingPercentage ?? ".000",
                  hr:     seasonSplit?.homeRuns           ?? 0,
                  avgTB:  gp > 0 ? (tbTot / gp).toFixed(1) : "—",
                  hand:   person?.batSide?.code           ?? null,
                  hitRate: games.slice(0, 5).map(g => g.h > 0 ? 1 : 0),
                };
              })();

          results[id] = payload;
          cache.set(`gamelog:${id}:${group}`, payload, GAMELOG_TTL_MS);

          // Write-through to DB (best-effort)
          if (db.isConnected()) {
            db.query(
              `INSERT INTO player_gamelog_snapshots (player_id, stat_group, slate_date, fetched_at, data)
               VALUES ($1, $2, $3, NOW(), $4)
               ON CONFLICT (player_id, stat_group, slate_date) DO UPDATE
                 SET fetched_at = NOW(), data = $4`,
              [id, group, today, JSON.stringify(payload)]
            ).catch(err => console.warn(`batch gamelog DB write failed for ${id}:`, err.message));
          }
        } catch (err) {
          console.warn(`batch gamelog MLB API failed for ${id}:`, err.message);
          misses.push(id);
        }
      }));
    }
  }

  return res.json({ results, misses });
});
```

---

## Change 2 — Replace the Board pre-fetch batter loop in `prop-scout-v7.jsx`

Search for this block (inside the Board/Model/AI Board pre-fetch `useEffect`, around line 3873):

```js
    // ── Batter data (HR + Hits tabs) ──────────────────────────────────────────
    Object.values(liveLineups).forEach(lu => {
      [...(lu.away ?? []), ...(lu.home ?? [])].forEach(b => {
        if (!b?.id || liveHittingLog[b.id]) return;
        apiFetch(`/api/players/${b.id}/gamelog?group=hitting`)
          .then(data => setLiveHittingLog(prev => ({ ...prev, [b.id]: data })))
          .catch(() => {});
      });
    });
```

Replace with:

```js
    // ── Batter data (HR + Hits tabs) — single batch call ─────────────────────
    const missingBatterIds = [];
    Object.values(liveLineups).forEach(lu => {
      [...(lu.away ?? []), ...(lu.home ?? [])].forEach(b => {
        if (b?.id && !liveHittingLog[b.id]) missingBatterIds.push(b.id);
      });
    });
    if (missingBatterIds.length) {
      apiMutate("/api/players/gamelogs/batch", "POST", {
        playerIds: [...new Set(missingBatterIds)],
        group: "hitting",
      })
        .then(data => {
          if (data?.results) setLiveHittingLog(prev => ({ ...prev, ...data.results }));
        })
        .catch(() => {});
    }
```

---

## Notes

- The existing `GET /api/players/:playerId/gamelog` route is **unchanged** — it still serves the game-view lineup drawer and the per-batter expand (those are user-triggered, single-player fetches and don't need batching).
- The batch route reuses the exact same payload shape and cache key format (`gamelog:${id}:${group}`) as the individual route — they share the L1 in-memory cache transparently.
- MLB API fallback uses chunked parallelism (8 concurrent) so the endpoint never slams the MLB API harder than the old per-request approach did.
- `apiMutate` already exists in the frontend and handles auth headers — no new helper needed.
- No new DB tables, no schema changes.

---

## Validation checklist

1. `npm run build` passes — no JSX or syntax errors.
2. Open Board → HR tab. Check Network tab: should see **one** `POST /api/players/gamelogs/batch` request instead of dozens of individual `/gamelog` GETs.
3. Response shape is `{ results: { [id]: {...} }, misses: [] }`.
4. Board populates correctly — batter cards appear with correct stats.
5. Individual `GET /api/players/:id/gamelog` still works (used in lineup drawer on game view).
6. Second Board open (warm cache): batch call returns instantly from L1, no MLB API hits.
7. No regression on K/Outs tabs (pitcher gamelogs still use individual GET route).

## After completing

Reply "Task 105 complete" with a brief summary of what was changed.
