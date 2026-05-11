# CODEX TASK 106 — Share Schedule Cache Across Routes (98 MLB API calls → ~3)

## Problem

On every cold start, `/api/v1/schedule` is called **98 times** to the MLB API. The two main culprits are `backend/routes/nrfi.js` and `backend/routes/bullpen.js` — both call the MLB API directly for schedule data instead of caching the results. On a 15-game slate:

- `nrfi.js` fires **3 schedule calls per game**: 1 in `fetchGameMeta` + 2 in `fetchRecentTeamGames` (once per team) = 45 total from NRFI
- `bullpen.js` fires **1 schedule call per game** in `buildGameBullpen` = 15 total from bullpen
- Remaining calls come from the same functions being invoked again during warmCache

---

## Files to modify

- `backend/routes/nrfi.js`
- `backend/routes/bullpen.js`

## No changes to

- `backend/routes/schedule.js` — the main schedule route is unchanged
- Any frontend files
- Any other backend routes

---

## Change 1 — Cache `fetchGameMeta` in `backend/routes/nrfi.js`

Search for this function:

```js
async function fetchGameMeta(gamePk) {
  const { data } = await mlb.get("/schedule", {
    params: {
      sportId: 1,
      gamePks: gamePk,
      hydrate: "team",
    },
  });

  const game = data.dates?.[0]?.games?.[0] ?? null;
  if (!game) return null;

  return {
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
}
```

Replace with:

```js
const GAME_META_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours — team assignments never change mid-day

async function fetchGameMeta(gamePk) {
  const cacheKey = `gameMeta:${gamePk}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

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

---

## Change 2 — Cache `fetchRecentTeamGames` in `backend/routes/nrfi.js`

Search for this function:

```js
async function fetchRecentTeamGames(teamId, endDate, excludeGamePk) {
  const { data } = await mlb.get("/schedule", {
    params: {
      sportId: 1,
      teamId,
      startDate: shiftDate(endDate, -120),
      endDate,
      gameType: "R",
    },
  });

  return (data.dates || [])
    .flatMap((date) => date.games || [])
    .filter((game) => game.gamePk !== excludeGamePk)
    .filter((game) => game.status?.codedGameState === "F" || game.status?.abstractGameState === "Final")
    .sort((a, b) => Date.parse(b.gameDate) - Date.parse(a.gameDate))
    .slice(0, LOOKBACK_GAMES)
    .map((game) => ({
      gamePk: game.gamePk,
      side: game.teams?.away?.team?.id === teamId ? "away" : "home",
    }));
}
```

Replace with:

```js
const TEAM_RECENT_GAMES_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchRecentTeamGames(teamId, endDate, excludeGamePk) {
  // Cache the raw completed-games list keyed by team+date (before excludeGamePk filter,
  // since the same list is reused for both away and home team lookups on a given day).
  const cacheKey = `teamRecentGames:${teamId}:${endDate}`;
  let allGames = cache.get(cacheKey);

  if (!allGames) {
    const { data } = await mlb.get("/schedule", {
      params: {
        sportId: 1,
        teamId,
        startDate: shiftDate(endDate, -120),
        endDate,
        gameType: "R",
      },
    });

    allGames = (data.dates || [])
      .flatMap((date) => date.games || [])
      .filter((game) => game.status?.codedGameState === "F" || game.status?.abstractGameState === "Final")
      .sort((a, b) => Date.parse(b.gameDate) - Date.parse(a.gameDate))
      .slice(0, LOOKBACK_GAMES)
      .map((game) => ({
        gamePk: game.gamePk,
        side: game.teams?.away?.team?.id === teamId ? "away" : "home",
      }));

    cache.set(cacheKey, allGames, TEAM_RECENT_GAMES_TTL_MS);
  }

  // Apply excludeGamePk after cache retrieval so the cached list stays reusable
  return allGames.filter((game) => game.gamePk !== excludeGamePk);
}
```

---

## Change 3 — Cache the schedule call in `buildGameBullpen` in `backend/routes/bullpen.js`

Search for this block inside `buildGameBullpen`:

```js
  const { data } = await mlb.get("/schedule", {
    params: { sportId: 1, gamePks: gamePk, hydrate: "team" },
  });
  const game = data.dates?.[0]?.games?.[0];
  if (!game) throw new Error(`Game not found for gamePk=${gamePk}`);

  const awayTeamId = game.teams?.away?.team?.id;
  const homeTeamId = game.teams?.home?.team?.id;
  if (!awayTeamId || !homeTeamId) throw new Error(`Missing team ids for gamePk=${gamePk}`);
```

Replace with:

```js
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
      away: { id: game.teams?.away?.team?.id, name: game.teams?.away?.team?.name ?? "" },
      home: { id: game.teams?.home?.team?.id, name: game.teams?.home?.team?.name ?? "" },
    };
    cache.set(metaCacheKey, gameMeta, GAME_META_TTL_MS);
  }

  const awayTeamId = gameMeta.away?.id;
  const homeTeamId = gameMeta.home?.id;
  if (!awayTeamId || !homeTeamId) throw new Error(`Missing team ids for gamePk=${gamePk}`);
```

---

## Notes

- The `gameMeta:${gamePk}` key is shared between `nrfi.js` and `bullpen.js`. Whichever route processes a game first populates the cache; the other route reads from it for free. This is intentional.
- The `teamRecentGames:${teamId}:${endDate}` cache stores the list **before** filtering out `excludeGamePk`. This means the same list can be served for any caller that needs the same team's recent history on the same date (e.g., multiple NRFI requests during warmCache).
- No DB write-through needed for either cache — all this data is schedule metadata and recent game lists that are fast to re-fetch if the server restarts.
- No new TTL constants need to be exported — they're defined locally in each file.

---

## Validation checklist

1. `npm run build` passes (backend restart — no frontend changes).
2. Restart server cold; check logs — `/api/v1/schedule` should appear **at most 3-4 times** in the first 60 seconds instead of 98.
3. NRFI responses still return correct `lean`, `confidence`, `awayFirst`, `homeFirst` values.
4. Bullpen cards still show correct ERA, fatigue level, and reliever list.
5. Second request to the same game's NRFI or bullpen endpoint returns instantly from L1 cache (check `X-Cache: HIT` header on NRFI route).
6. No regression on any other route.

## After completing

Reply "Task 106 complete" with a brief summary of what was changed.
