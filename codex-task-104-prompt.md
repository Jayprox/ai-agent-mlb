# CODEX TASK 104 — Batter Gamelog Pre-fetch Cron

## Files to modify

- `backend/jobs/snapshotJobs.js` — add `snapshotBatterGamelogs()` + export
- `backend/jobs/scheduler.js` — add to cron schedule

## No changes to

- `backend/routes/players.js` — the gamelog route already reads from DB correctly; no change needed
- `prop-scout-v7.jsx` — no frontend changes

---

## Problem

`/api/players/:id/gamelog?group=hitting` is called once per lineup batter when the Board opens (~270 calls on a full slate). On a cold cache, each call makes 2–3 outbound MLB Stats API requests. This causes a 15–30 second load delay before any Board candidates appear. The pitcher pre-fetch cron (`snapshotPitcherGamelogs`) already solves this for SPs — this task applies the same pattern to batters.

---

## Change 1 — Add `snapshotBatterGamelogs` to `backend/jobs/snapshotJobs.js`

Place immediately after `snapshotPitcherGamelogs` (before `ipStringToOuts`).

```js
async function snapshotBatterGamelogs(date = todayHonolulu()) {
  if (!isConnected()) return;
  console.log(`  → Job: snapshotBatterGamelogs  date=${date}`);
  await ensurePhaseOneTables();

  const TEAM_ABBR_LOCAL = {
    108: "LAA", 109: "ARI", 110: "BAL", 111: "BOS", 112: "CHC",
    113: "CIN", 114: "CLE", 115: "COL", 116: "DET", 117: "HOU",
    118: "KC",  119: "LAD", 120: "WSH", 121: "NYM", 133: "OAK",
    134: "PIT", 135: "SD",  136: "SEA", 137: "SF",  138: "STL",
    139: "TB",  140: "TEX", 141: "TOR", 142: "MIN", 143: "PHI",
    144: "ATL", 145: "CWS", 146: "MIA", 147: "NYY", 158: "MIL",
  };

  // Get today's games from schedule snapshot
  const result = await query(
    "SELECT games FROM schedule_snapshots WHERE slate_date = $1",
    [date]
  );
  const games = result?.rows?.[0]?.games ?? [];

  if (!games.length) {
    console.log(`  · snapshotBatterGamelogs: no games found for ${date}`);
    return;
  }

  // Collect unique batter IDs from confirmed lineups or active rosters
  const batterIds = [];
  const seen = new Set();

  for (const game of games) {
    try {
      const { data } = await mlb.get(`/game/${game.gamePk}/boxscore`, {
        params: { hydrate: "person" },
      });

      const awayBatters = data?.teams?.away?.battingOrder ?? [];
      const homeBatters = data?.teams?.home?.battingOrder ?? [];
      const confirmed = awayBatters.length > 0 && homeBatters.length > 0;

      let ids = [];
      if (confirmed) {
        ids = [...awayBatters, ...homeBatters];
      } else {
        const awayTeamId = data?.teams?.away?.team?.id;
        const homeTeamId = data?.teams?.home?.team?.id;
        if (awayTeamId && homeTeamId) {
          try {
            const [awayRes, homeRes] = await Promise.all([
              mlb.get(`/teams/${awayTeamId}/roster`, {
                params: { rosterType: "active", season: SEASON, hydrate: "person" },
              }),
              mlb.get(`/teams/${homeTeamId}/roster`, {
                params: { rosterType: "active", season: SEASON, hydrate: "person" },
              }),
            ]);
            const nonPitcher = (roster) =>
              (roster.data.roster ?? [])
                .filter(p => p.position?.type !== "Pitcher" && p.status?.code === "A")
                .map(p => p.person.id);
            ids = [...nonPitcher(awayRes), ...nonPitcher(homeRes)];
          } catch (rosterErr) {
            console.warn(`  ⚠ snapshotBatterGamelogs: roster fallback failed for ${game.gamePk}:`, rosterErr.message);
          }
        }
      }

      for (const id of ids) {
        if (!seen.has(id)) {
          seen.add(id);
          batterIds.push(id);
        }
      }
    } catch (boxErr) {
      console.warn(`  ⚠ snapshotBatterGamelogs: boxscore failed for ${game.gamePk}:`, boxErr.message);
    }
  }

  if (!batterIds.length) {
    console.log(`  · snapshotBatterGamelogs: no batters found for ${date}`);
    return;
  }

  console.log(`  · snapshotBatterGamelogs: fetching ${batterIds.length} batters`);

  let fetched = 0;
  let skipped = 0;

  for (const batterId of batterIds) {
    // Idempotent — skip if already snapshotted today
    try {
      const existing = await query(
        `SELECT 1 FROM player_gamelog_snapshots
         WHERE player_id = $1 AND stat_group = 'hitting' AND slate_date = $2`,
        [batterId, date]
      );
      if (existing?.rows?.length) {
        skipped++;
        continue;
      }
    } catch (err) {
      console.warn(`  ⚠ snapshotBatterGamelogs: DB check failed for ${batterId}:`, err.message);
    }

    try {
      let season = SEASON;

      // Gamelog — fall back to prior season if empty
      const { data: glData } = await mlb.get(`/people/${batterId}/stats`, {
        params: { stats: "gameLog", group: "hitting", season },
      });
      let splits = glData.stats?.[0]?.splits ?? [];

      if (!splits.length) {
        const { data: prevGl } = await mlb.get(`/people/${batterId}/stats`, {
          params: { stats: "gameLog", group: "hitting", season: season - 1 },
        });
        splits = prevGl.stats?.[0]?.splits ?? [];
        season -= 1;
      }

      // Person info + season stats in parallel
      const [personRes, seasonRes] = await Promise.all([
        mlb.get(`/people/${batterId}`, { params: { hydrate: "currentTeam" } }),
        mlb.get(`/people/${batterId}/stats`, {
          params: { stats: "season", group: "hitting", season: SEASON },
        }),
      ]);
      const person = personRes.data.people?.[0] ?? null;
      const seasonSplit = seasonRes.data.stats?.[0]?.splits?.[0]?.stat ?? {};

      // Build payload — must match the hitting path in backend/routes/players.js exactly
      const sorted = [...splits].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
      const gameRows = sorted.slice(0, 10).map(g => ({
        date:     g.date,
        opponent: TEAM_ABBR_LOCAL[g.opponent?.id] ?? g.opponent?.name ?? "?",
        ab:       g.stat?.atBats   ?? 0,
        h:        g.stat?.hits     ?? 0,
        hr:       g.stat?.homeRuns ?? 0,
        rbi:      g.stat?.rbi      ?? 0,
        avg:      g.stat?.avg      ?? ".000",
      }));

      const last7 = sorted.filter(g => (g.stat?.atBats ?? 0) > 0).slice(0, 7);
      const last7Hits = last7.reduce((sum, g) => sum + (g.stat?.hits ?? 0), 0);
      const last7Abs  = last7.reduce((sum, g) => sum + (g.stat?.atBats ?? 0), 0);
      const gp    = Number(seasonSplit?.gamesPlayed) || 0;
      const tbTot = Number(seasonSplit?.totalBases)  || 0;

      const payload = {
        group:     "hitting",
        games:     gameRows,
        seasonAvg: seasonSplit?.avg ?? ".000",
        last7Avg:  last7Abs > 0
          ? `${(last7Hits / last7Abs).toFixed(3).replace(/^0/, "")}`
          : ".000",
        avg:    seasonSplit?.avg                ?? ".000",
        ops:    seasonSplit?.ops                ?? ".000",
        slg:    seasonSplit?.sluggingPercentage  ?? ".000",
        hr:     seasonSplit?.homeRuns            ?? 0,
        avgTB:  gp > 0 ? (tbTot / gp).toFixed(1) : "—",
        hand:   person?.batSide?.code            ?? null,
        hitRate: gameRows.slice(0, 5).map(g => g.h > 0 ? 1 : 0),
      };

      await query(
        `INSERT INTO player_gamelog_snapshots (player_id, stat_group, slate_date, fetched_at, data)
         VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (player_id, stat_group, slate_date) DO UPDATE
           SET fetched_at = NOW(), data = $4`,
        [batterId, "hitting", date, JSON.stringify(payload)]
      );

      fetched++;
    } catch (err) {
      console.warn(`  ⚠ snapshotBatterGamelogs: fetch failed for ${batterId}:`, err.message);
    }

    // 600ms pacing — respectful of MLB API rate limits
    await new Promise(r => setTimeout(r, 600));
  }

  console.log(`  ✓ snapshotBatterGamelogs  date=${date}  fetched=${fetched}  skipped=${skipped}`);
}
```

---

## Change 2 — Export in `backend/jobs/snapshotJobs.js`

Add `snapshotBatterGamelogs` to the existing `module.exports` object.

---

## Change 3 — Schedule in `backend/jobs/scheduler.js`

**Update the destructured import** from `./snapshotJobs` to include `snapshotBatterGamelogs`.

**Add cron schedule** after the pitcher gamelog line:
```js
// Pre-fetch batter gamelogs at 10 AM and 2 PM Honolulu
cron.schedule("0 10,14 * * *", () => snapshotBatterGamelogs(), { timezone: "Pacific/Honolulu" });
```

---

## Notes

- At 10 AM: lineups not yet posted → uses active roster fallback (~28 non-pitchers/team × ~15 games × 2 teams ≈ up to ~840 batters). Runtime ~8–10 min at 600ms pacing.
- At 2 PM: lineups mostly confirmed → ~18 batters/game × 15 games ≈ ~270 batters. Runtime ~3–4 min.
- Idempotent: a player already snapshotted today is skipped on both runs.
- Payload shape must match `players.js` hitting path exactly — the route reads the same DB row and serves it as-is.

---

## Validation checklist

1. No server startup errors.
2. Cron fires at 10 AM and 2 PM Honolulu — `snapshotBatterGamelogs` logged in Railway.
3. After cron runs, `player_gamelog_snapshots` has `stat_group = 'hitting'` rows for today's batters.
4. Opening Board tab returns `X-Cache: DB_HIT` for batter gamelog calls (check Network tab).
5. Board populates immediately after cron has run — no 15–30s cold-load delay.
6. Pitcher cron unaffected — `snapshotPitcherGamelogs` still fires normally.
7. No regression on the gamelog endpoint for pitchers or batters.

## After completing

Reply "Task 104 complete" with a brief summary.
