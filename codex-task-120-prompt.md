# CODEX TASK 120 — Cold-Start API Efficiency: Dedup Inflight Requests + Combine Bullpen Stats Calls

## Goal

Eliminate ~1,576 redundant MLB API calls that occur on every cold start. Three targeted fixes, all in the backend only. No frontend changes, no schema changes, no behaviour changes for users.

**Root cause summary:** On cold start, 16+ NRFI and bullpen route handlers fire in parallel. Each one calls `getLinescore` and `fetchRecentTeamGames` concurrently — because cache is cold, all 640+ inflight calls miss simultaneously and each makes its own MLB API request for the same data. Separately, each bullpen pitcher makes 2 separate `/stats` calls that the MLB API can serve in one.

**Files changed:**
- `backend/routes/nrfi.js` ← add inflight dedup to `getLinescore` and `fetchRecentTeamGames`
- `backend/routes/bullpen.js` ← combine season + gameLog stats into one API call in `getPitcherData`

---

## Part 1 — Inflight Dedup in `nrfi.js`

### Problem

`getLinescore(gamePk)` has a 24-hour cache (`linescore:prior:${gamePk}`). But on cold start, 16 NRFI game requests fire in parallel. Each game calls `computeTeamFirstInning` for both teams. Each team call fires `getLinescore` for 20 prior games. That's up to 640 linescore fetches firing simultaneously — all missing cache at once — and the same gamePk can be requested 22 times before any single fetch completes to populate the cache.

Same problem with `fetchRecentTeamGames(teamId, endDate)` — cached under `teamRecentGames:${teamId}:${endDate}`, but multiple parallel NRFI requests for different games involving the same team all miss simultaneously.

### Fix — module-level inflight Maps

Add two module-level Maps at the top of `nrfi.js` (after the imports):

```js
const _linescoreInFlight      = new Map(); // gamePk → Promise
const _recentGamesInFlight    = new Map(); // `${teamId}:${endDate}` → Promise
```

**Wrap `getLinescore`:**

Replace the current `getLinescore` function (around line 64) with this version:

```js
async function getLinescore(gamePk) {
  const cacheKey = `linescore:prior:${gamePk}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  if (_linescoreInFlight.has(gamePk)) return _linescoreInFlight.get(gamePk);

  const promise = mlb.get(`/game/${gamePk}/linescore`)
    .then(({ data }) => {
      cache.set(cacheKey, data, LINESCORE_TTL_MS);
      _linescoreInFlight.delete(gamePk);
      return data;
    })
    .catch((err) => {
      _linescoreInFlight.delete(gamePk);
      throw err;
    });

  _linescoreInFlight.set(gamePk, promise);
  return promise;
}
```

**Wrap `fetchRecentTeamGames`:**

Replace the current `fetchRecentTeamGames` function (around line 79) with this version.
Note: the function signature and behaviour are identical — only the inflight guard is added.

```js
async function fetchRecentTeamGames(teamId, endDate, excludeGamePk) {
  const cacheKey   = `teamRecentGames:${teamId}:${endDate}`;
  const inflightKey = `${teamId}:${endDate}`;

  let allGames = cache.get(cacheKey);

  if (!allGames) {
    if (_recentGamesInFlight.has(inflightKey)) {
      allGames = await _recentGamesInFlight.get(inflightKey);
    } else {
      const promise = mlb.get("/schedule", {
        params: {
          sportId: 1,
          teamId,
          startDate: shiftDate(endDate, -120),
          endDate,
          gameType: "R",
        },
      })
        .then(({ data }) => {
          const games = (data.dates || [])
            .flatMap((date) => date.games || [])
            .filter((game) => game.status?.codedGameState === "F" || game.status?.abstractGameState === "Final")
            .sort((a, b) => Date.parse(b.gameDate) - Date.parse(a.gameDate))
            .slice(0, LOOKBACK_GAMES)
            .map((game) => ({
              gamePk: game.gamePk,
              side: game.teams?.away?.team?.id === teamId ? "away" : "home",
            }));
          cache.set(cacheKey, games, TEAM_RECENT_GAMES_TTL_MS);
          _recentGamesInFlight.delete(inflightKey);
          return games;
        })
        .catch((err) => {
          _recentGamesInFlight.delete(inflightKey);
          throw err;
        });

      _recentGamesInFlight.set(inflightKey, promise);
      allGames = await promise;
    }
  }

  // Apply excludeGamePk after cache retrieval so the cached list stays reusable
  return allGames.filter((game) => game.gamePk !== excludeGamePk);
}
```

**Expected impact:** 640+ linescore calls → ~38 unique calls on first request wave (one per unique prior gamePk). Subsequent requests serve from the 24h cache. `fetchRecentTeamGames` schedule calls reduced from up to 32 parallel per slate → one per unique team per day.

---

## Part 2 — Combine Stats Calls in `bullpen.js`

### Problem

`getPitcherData(personId)` currently makes 3 MLB API calls per pitcher:
1. `/people/:id/stats?stats=season&group=pitching`
2. `/people/:id/stats?stats=gameLog&group=pitching`
3. `/people/:id`

Calls 1 and 2 hit the same endpoint with different `stats` params. The MLB Stats API supports fetching multiple stat types in a single call: `?stats=season,gameLog`. The response returns `data.stats` as an array where each element has a `type.displayName` identifying it.

### Fix — Combine into 2 calls (was 3)

Replace the `getPitcherData` function (currently around line 56) with:

```js
async function getPitcherData(personId) {
  const cacheKey = `pitcher:${personId}`;
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  const [combinedRes, personRes] = await Promise.all([
    mlb.get(`/people/${personId}/stats`, {
      params: { stats: "season,gameLog", group: "pitching", season: SEASON },
    }),
    mlb.get(`/people/${personId}`, {}),
  ]);

  // MLB returns stats[] array — find each type by displayName
  const statsArr = combinedRes.data.stats ?? [];
  const seasonEntry  = statsArr.find((s) =>
    /season|regular/i.test(s.type?.displayName ?? "")
  );
  const gameLogEntry = statsArr.find((s) =>
    /log/i.test(s.type?.displayName ?? "")
  );

  const result = {
    stat:   seasonEntry?.splits?.[0]?.stat  ?? {},
    games:  gameLogEntry?.splits             ?? [],
    person: personRes.data.people?.[0]       ?? {},
  };

  cache.set(cacheKey, result, PITCHER_TTL_MS);
  return result;
}
```

**Expected impact:** 3 MLB API calls per pitcher → 2. With ~13 relievers per team × 30 teams on a full slate = ~390 pitchers processed per warm cycle → saves ~390 MLB API calls per cold start.

**Safety note:** If the combined `stats=season,gameLog` call returns an empty or unexpected shape, `seasonEntry` and `gameLogEntry` both safely fall back to `{}` and `[]` respectively via the `?? {}` and `?? []` guards — identical behaviour to the previous code when a pitcher has no stats on record.

---

## Checklist

- [ ] `_linescoreInFlight` and `_recentGamesInFlight` Maps declared at module level in `nrfi.js`
- [ ] `getLinescore` in `nrfi.js` uses inflight dedup — cache check → inflight check → new fetch → populate both
- [ ] `fetchRecentTeamGames` in `nrfi.js` uses inflight dedup — same pattern
- [ ] Both inflight Maps clean up their entries on both resolve and reject (no memory leak)
- [ ] `getPitcherData` in `bullpen.js` now makes 2 calls (combined stats + person) instead of 3
- [ ] Season stat lookup uses `/season|regular/i` regex, game log uses `/log/i`
- [ ] All existing behaviour preserved — same fields returned from `getPitcherData`, same caching TTLs
- [ ] No frontend changes
- [ ] No schema or migration changes

---

## Out of Scope for This Task

- Task 63 (shared schedule cache) — the `gameMeta:${gamePk}` caching already prevents most duplicate schedule calls; Task 63 is a lower-priority follow-up if the output logs still show schedule duplication after this fix
- Any changes to warmCache, scheduler, or DB layer
- Changes to linescore.js (live linescore route — different TTL, different purpose)

---

## After Completing

Reply "Task 120 complete" with a brief summary of what changed in each file.
