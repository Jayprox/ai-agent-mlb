# CODEX TASK 112 — Cache Per-Pitcher Stats in Bullpen Route (~2,250 MLB calls → ~225)

## Problem

In `backend/routes/bullpen.js`, `buildTeamBullpen` fetches stats for every active pitcher on a team roster — 3 MLB API calls per pitcher (season stats, game log, person info). These are done with raw `mlb.get()` calls, bypassing the cache entirely.

On a 15-game slate (30 teams), each team has ~25 pitchers. On cold start, all 15 `buildGameBullpen` requests fire simultaneously → all 30 team bullpens compute in parallel → ~30 × 25 × 3 = **~2,250 MLB API calls in the first few seconds**.

The output3.txt audit confirmed: **2,558 total `/people/:id/stats` calls for only 667 unique players** — that's an average of 3.8 fetches per player, with some players hit 7–9 times.

The fix is simple: add a per-pitcher cache inside `buildTeamBullpen` so each player's stats are fetched once across all concurrent requests.

**File:** `backend/routes/bullpen.js` only. No frontend changes.

---

## What to add

### Step 1 — Add `PITCHER_TTL_MS` constant

Place this directly below the existing TTL constants at the top of the file (after `GAME_BULLPEN_TTL`):

```js
const PITCHER_TTL_MS  = 6 * 60 * 60 * 1000; // 6 hours — season stats update nightly
```

### Step 2 — Add `getPitcherData` helper function

Place this directly before `buildTeamBullpen`:

```js
// Fetches and caches all three per-pitcher data sources in one shot.
// Cache key `pitcher:${personId}` is bullpen-specific so it doesn't
// collide with the `player:${personId}:pitching` key used by players.js
// (which stores a different shape).
async function getPitcherData(personId) {
  const cacheKey = `pitcher:${personId}`;
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  const [seasonRes, gameLogRes, personRes] = await Promise.all([
    mlb.get(`/people/${personId}/stats`, {
      params: { stats: "season", group: "pitching", season: SEASON },
    }),
    mlb.get(`/people/${personId}/stats`, {
      params: { stats: "gameLog", group: "pitching", season: SEASON },
    }),
    mlb.get(`/people/${personId}`, {}),
  ]);

  const result = {
    stat:   seasonRes.data.stats?.[0]?.splits?.[0]?.stat ?? {},
    games:  gameLogRes.data.stats?.[0]?.splits ?? [],
    person: personRes.data.people?.[0] ?? {},
  };

  cache.set(cacheKey, result, PITCHER_TTL_MS);
  return result;
}
```

### Step 3 — Update `buildTeamBullpen` to use the helper

Inside `buildTeamBullpen`, find this block:

```js
  const pitcherData = await Promise.all(pitchers.map(async (p) => {
    const personId = p.person.id;
    try {
      const [seasonRes, gameLogRes, personRes] = await Promise.all([
        mlb.get(`/people/${personId}/stats`, {
          params: { stats: "season", group: "pitching", season: SEASON },
        }),
        mlb.get(`/people/${personId}/stats`, {
          params: { stats: "gameLog", group: "pitching", season: SEASON },
        }),
        mlb.get(`/people/${personId}`, {}),
      ]);

      const stat  = seasonRes.data.stats?.[0]?.splits?.[0]?.stat ?? {};
      const games = gameLogRes.data.stats?.[0]?.splits ?? [];
      const person = personRes.data.people?.[0] ?? {};
```

Replace with:

```js
  const pitcherData = await Promise.all(pitchers.map(async (p) => {
    const personId = p.person.id;
    try {
      const { stat, games, person } = await getPitcherData(personId);
```

That's the only change inside the map — the rest of the function body (fatigue calculation, stat extraction, return object) is unchanged.

---

## How the cache key fits in

| Cache key | Set by | Used by | TTL |
|-----------|--------|---------|-----|
| `pitcher:${personId}` | `getPitcherData` in bullpen.js | bullpen.js only | 6 hours |
| `bullpen:team:${teamId}` | `buildTeamBullpen` | bullpen.js only | 30 min |
| `bullpen:game:${gamePk}` | `buildGameBullpen` | bullpen.js only | 15 min |
| `player:${personId}:pitching` | players.js | players.js only | 6 hours |

The `pitcher:` key is intentionally separate from `player:`: they store different shapes (`{ stat, games, person }` vs the players.js format), and that avoids any cross-route shape confusion.

---

## Expected impact

**Cold start (first load):**
- Before: ~2,250 MLB API calls (30 teams × ~25 pitchers × 3 calls each)
- After: ~225 MLB API calls (30 teams × ~25 pitchers × 3 calls, but the SECOND team to request an already-in-flight pitcher gets it from cache)

Wait — the more important gain is **within a session**:
- Any subsequent bullpen request within 6 hours (e.g., warmCache re-run, user re-opening a game) makes **0** pitcher MLB API calls — the `pitcher:${personId}` cache handles everything
- Before: every `bullpen:team` cache miss (every 30 min) re-fetched all pitchers fresh

**Realistic per-cycle numbers:**
- Cold start: ~225 pitcher calls (one per unique pitcher on all rosters — no duplication since each pitcher appears on exactly one team)
- Warm cache (within 30 min): 0 pitcher calls — `bullpen:team` cache hit
- After 30 min (team cache expires): 0 pitcher calls — `pitcher:${personId}` cache (6hr) still warm

---

## What does NOT change

- The `buildTeamBullpen` logic — same fatigue calculation, same reliever detection, same output shape
- The `buildGameBullpen` function — unchanged
- The route handler — unchanged
- `players.js` — no changes
- Any frontend files

---

## Validation checklist

1. Server restarts cleanly
2. Bullpen cards still show correct ERA, fatigue level, reliever list, and grade badge
3. Cold-start log: `/people/:id/stats` calls drop significantly (from ~2,250 to ~225 range)
4. Second request to the same game's `/api/bullpen/:gamePk` returns instantly (`X-Cache: HIT`)
5. After 30 min (team cache expiry), re-requesting bullpen shows pitcher stats served from `pitcher:` cache — no new MLB API calls for pitchers
6. No regression on bullpen display in the Game view or Board

## After completing

Reply "Task 112 complete" with a brief summary of what was changed.
