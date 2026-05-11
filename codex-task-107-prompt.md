# CODEX TASK 107 — Cache Linescore Responses (936 MLB API calls → ~316)

## Problem

In `backend/routes/nrfi.js`, the `computeTeamFirstInning` function fetches the linescore for every recent game a team has played (up to 20 games). These are **completed historical games** — the data is immutable and never changes. However, there is no cache on these fetches.

On a 15-game slate, NRFI computes 2 teams per game × up to 20 recent games each = **up to 600 linescore fetches**. Many teams share recent opponents, so the same game's linescore gets fetched multiple times. The audit found **936 total linescore calls with only 316 unique game PKs** — game `824850` alone was fetched 6 times.

---

## File to modify

- `backend/routes/nrfi.js` only

## No changes to

- `backend/routes/linescore.js` — the live-game linescore route is unrelated (different purpose, has its own DB-backed cache)
- Any other files

---

## Change — Add `getLinescore` cache helper and update `computeTeamFirstInning`

### Step 1 — Add `LINESCORE_TTL_MS` constant and `getLinescore` helper

Place this block directly after the existing `TEAM_RECENT_GAMES_TTL_MS` constant (around line 64):

```js
const LINESCORE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — completed games are immutable

async function getLinescore(gamePk) {
  const cacheKey = `linescore:prior:${gamePk}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const { data } = await mlb.get(`/game/${gamePk}/linescore`);
  cache.set(cacheKey, data, LINESCORE_TTL_MS);
  return data;
}
```

### Step 2 — Update `computeTeamFirstInning` to use the helper

Search for this block:

```js
  const lineScores = await Promise.allSettled(
    recentGames.map((game) => mlb.get(`/game/${game.gamePk}/linescore`))
  );

  const runs = lineScores.flatMap((result, index) => {
    if (result.status !== "fulfilled") return [];
    const side = recentGames[index].side;
    const inning = result.value.data?.innings?.[0];
    const firstRuns = Number(inning?.[side]?.runs);
    return Number.isNaN(firstRuns) ? [] : [firstRuns];
  });
```

Replace with:

```js
  const lineScores = await Promise.allSettled(
    recentGames.map((game) => getLinescore(game.gamePk))
  );

  const runs = lineScores.flatMap((result, index) => {
    if (result.status !== "fulfilled") return [];
    const side = recentGames[index].side;
    const inning = result.value?.innings?.[0];
    const firstRuns = Number(inning?.[side]?.runs);
    return Number.isNaN(firstRuns) ? [] : [firstRuns];
  });
```

Note the only differences:
- `mlb.get(...)` → `getLinescore(game.gamePk)` (uses cache helper)
- `result.value.data?.innings?.[0]` → `result.value?.innings?.[0]` (helper returns `data` directly, not the axios wrapper)

---

## Notes

- The cache key `linescore:prior:${gamePk}` is prefixed with `prior:` to avoid colliding with the live-game linescore route which uses `linescore:${gamePk}` in `backend/routes/linescore.js`.
- These are **prior completed games** used for NRFI trend calculation — they will not change, so 24-hour TTL is safe.
- `Promise.allSettled` is intentionally kept (not `Promise.all`) so one failed linescore doesn't abort the whole computation — no change needed there.
- The cache is shared across all concurrent NRFI requests. If 15 games are processing simultaneously during warmCache, the first team to fetch a given prior game's linescore populates the cache; all other teams that share that opponent get it for free.

---

## Validation checklist

1. Server restarts cleanly.
2. NRFI responses still return correct `lean`, `confidence`, `awayFirst.scoredPct`, `homeFirst.avgRuns` values.
3. Cold-start log: total linescore calls drop from ~936 to ~316 (one per unique prior game PK).
4. Second cold-start (L1 still warm): linescore calls approach 0.
5. No regression on game cards showing NRFI lean badges.

## After completing

Reply "Task 107 complete" with a brief summary of what was changed.
