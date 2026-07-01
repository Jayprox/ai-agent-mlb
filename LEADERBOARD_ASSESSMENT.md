# Leaderboard Feature — Backend Assessment

**Re:** LEADERBOARD_FEATURE_1_3.md  
**Date:** June 30, 2026  
**From:** Web/Backend Team

---

## TL;DR

The feature is buildable. Three things in the proposal need adjustment before implementation starts:

1. **`pnl` is not a stored column** — it's computed at read time in Node.js. The SQL query in the proposal won't work as written. See Section 3.
2. **`username` is not on the `picks` table** — we need a schema change before a leaderboard query can return it. See Section 4.
3. **Privacy must be opt-in** — currently all picks are private. A public leaderboard requires users to explicitly consent. See Section 2.

Everything else in the proposal is accurate and implementable.

---

## Design Questions — Answered

### 1. Minimum picks threshold

**Recommendation: 10 graded picks minimum.**

1 pick is too low — a user who got lucky on one +150 underdog would top the P&L board immediately. 5 is better but still noisy. 10 graded picks gives a sample that's at least directionally meaningful, keeps the list uncluttered, and isn't a high bar for real users.

Make it a server-side constant (`MIN_GRADED_PICKS = 10`) so it can be tuned without a deploy. Expose it in the API response so clients can display "Requires 10+ graded picks to appear."

### 2. Tie-breaking

For **Win Rate** sort: secondary = `graded_picks DESC` (more picks = more confidence in the rate). Tertiary = `created_at ASC` (earliest user wins ties of equal picks).

For **P&L** sort: secondary = `win_rate DESC` (higher rate = more consistent). Tertiary = `graded_picks DESC`.

### 3. Public vs opt-in

**Strong recommendation: opt-in, not public by default.**

Currently every picks endpoint requires auth and scopes data to `req.userId`. Zero user-picked data is currently visible to other users. A public leaderboard is a material privacy change — users logged their picks for personal tracking, not for public ranking.

Implementation: add a `leaderboard_opt_in BOOLEAN NOT NULL DEFAULT FALSE` column to the `users` table. Only include users where this is `true`. Add a toggle in Settings → "Show me on the leaderboard." Ship the toggle with the feature; no one appears until they turn it on.

If you want a v1.3 that ships faster with real data, seed it by making the current `jayprox12@gmail.com` account (admin) opt-in, test it, and open opt-in to all users.

### 4. Historical snapshots vs real-time

**Real-time is fine for v1.3** as proposed.

One caveat: the query is a full table scan + GROUP BY on `picks` filtered by `result_hit` status. With under a few thousand users and tens of thousands of picks, this is fast. Add a 5-minute in-memory cache server-side (same `cache` service used everywhere else) and it's production-safe. See implementation section.

### 5. Performance

With current user volume: not a concern. The query will be fast with the right index.

**Add this index** when the feature ships:

```sql
CREATE INDEX IF NOT EXISTS picks_leaderboard_idx
  ON picks (user_id, voided, result_hit, grade_status)
  WHERE voided = FALSE;
```

At 100k+ picks and 10k+ users, revisit with a materialized view.

### 6. Caching

**5-minute server cache is the right call.** The leaderboard doesn't need to update the second a pick resolves. Use the same `cache` service already in use across all routes — `cache.set("leaderboard:win_rate", data, 5 * 60 * 1000)`.

Cache separately by `sortBy` value since those are different sorted result sets.

---

## Section 2 — What's Missing from the Current Schema

### Problem A: `pnl` is not a stored column

The picks table does not have a `pnl` column. In the current backend, P&L is computed on-the-fly in Node.js:

```js
function calcPnl(resultHit, odds, units) {
  if (resultHit === null || resultHit === undefined) return null;
  if (!resultHit) return -(units);
  // win
  if (!odds || (odds < 0 ? -100/odds : odds/100) === 0) return units;
  return odds < 0 ? (100 / -odds) * units : (odds / 100) * units;
}
```

**Solution for leaderboard:** Store `pnl` as a column when a pick is graded, in addition to computing it at read time. OR, replicate the formula in SQL (possible but messy). Storing it is cleaner.

**Schema change needed:**
```sql
ALTER TABLE picks ADD COLUMN IF NOT EXISTS pnl NUMERIC;
```

**Where to write it:** In the grading job (`gradePendingPicks`), after writing `result_hit`, also write the computed `pnl` value using the same formula. This makes the leaderboard query a simple `SUM(pnl)`.

### Problem B: `username` is not on `picks` rows

The picks table has `user_id` (text) but no `username`. The leaderboard query needs to return a display name.

**Solutions (pick one):**

**Option 1 (preferred): JOIN with `users` table**
The Postgres `users` table exists (used by the auth route). Join on `p.user_id = u.id`. Requires that `users` has a `username` column — it does (the auth route does `SELECT * FROM users WHERE LOWER(username) = LOWER($1)`).

```sql
SELECT u.username, p.user_id, ...
FROM picks p
JOIN users u ON p.user_id = u.id
WHERE p.voided = FALSE ...
```

**Option 2: Denormalize `username` onto picks at log time**
When a pick is inserted, write `req.username` into a `username` column. No JOIN needed but duplicates data. Less clean.

Option 1 is recommended — it's cleaner and the `users` table is already in Postgres.

### Problem C: `grade_status` edge cases

The proposal's "graded picks" definition includes `grade_status IS NOT NULL` in the count. This needs adjustment:

- `grade_status = 'ppd'` — game postponed. Not a real outcome. Exclude from win rate.
- `grade_status = 'scratch'` — player didn't play. Exclude from win rate.
- `grade_status = 'push'` — exact line hit. Count toward total but not win or loss.

**Correct graded pick definition:**
```sql
-- Resolved with a real outcome (HIT or MISS)
COUNT(*) FILTER (WHERE result_hit IS NOT NULL AND grade_status IS NULL) AS graded_picks
-- Hits only
COUNT(*) FILTER (WHERE result_hit = TRUE AND grade_status IS NULL) AS hits
```

---

## Section 3 — Corrected SQL

Here is the accurate query replacing the pseudocode in the proposal:

```sql
SELECT
  ROW_NUMBER() OVER (
    ORDER BY
      CASE WHEN $1 = 'pnl' THEN SUM(pnl) END DESC NULLS LAST,
      CASE WHEN $1 = 'win_rate' THEN
        COUNT(*) FILTER (WHERE result_hit = TRUE AND grade_status IS NULL)::FLOAT
        / NULLIF(COUNT(*) FILTER (WHERE result_hit IS NOT NULL AND grade_status IS NULL), 0)
      END DESC NULLS LAST,
      -- Tie-breakers
      COUNT(*) FILTER (WHERE result_hit IS NOT NULL AND grade_status IS NULL) DESC,
      MIN(p.created_at) ASC
  ) AS rank,
  p.user_id,
  u.username,
  COUNT(*) FILTER (WHERE result_hit IS NOT NULL AND grade_status IS NULL)         AS graded_picks,
  COUNT(*) FILTER (WHERE result_hit = TRUE AND grade_status IS NULL)               AS hits,
  COUNT(*) FILTER (WHERE result_hit = FALSE AND grade_status IS NULL)              AS misses,
  COUNT(*) FILTER (WHERE voided = FALSE)                                           AS total_picks,
  COUNT(*) FILTER (WHERE grade_status = 'push')                                   AS pushes,
  ROUND(
    COUNT(*) FILTER (WHERE result_hit = TRUE AND grade_status IS NULL)::NUMERIC
    / NULLIF(COUNT(*) FILTER (WHERE result_hit IS NOT NULL AND grade_status IS NULL), 0) * 100,
    1
  )                                                                                AS win_rate_pct,
  ROUND(SUM(COALESCE(pnl, 0))::NUMERIC, 2)                                        AS pnl
FROM picks p
JOIN users u ON p.user_id = u.id
WHERE
  p.voided = FALSE
  AND u.leaderboard_opt_in = TRUE   -- opt-in gate
GROUP BY p.user_id, u.username
HAVING
  COUNT(*) FILTER (WHERE result_hit IS NOT NULL AND grade_status IS NULL) >= $2   -- min graded picks
ORDER BY
  CASE WHEN $1 = 'pnl' THEN SUM(pnl) END DESC NULLS LAST,
  CASE WHEN $1 = 'win_rate' THEN
    COUNT(*) FILTER (WHERE result_hit = TRUE AND grade_status IS NULL)::FLOAT
    / NULLIF(COUNT(*) FILTER (WHERE result_hit IS NOT NULL AND grade_status IS NULL), 0)
  END DESC NULLS LAST,
  COUNT(*) FILTER (WHERE result_hit IS NOT NULL AND grade_status IS NULL) DESC,
  MIN(p.created_at) ASC
LIMIT $3 OFFSET $4
```

**Parameters:** `[$1: sortBy, $2: minGradedPicks, $3: limit, $4: offset]`

---

## Section 4 — Schema Changes Required

Before the leaderboard endpoint can be built, these three schema changes need to land in the backend:

```sql
-- 1. Store computed P&L on pick resolution
ALTER TABLE picks ADD COLUMN IF NOT EXISTS pnl NUMERIC;

-- 2. Opt-in flag on users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS leaderboard_opt_in BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Leaderboard performance index
CREATE INDEX IF NOT EXISTS picks_leaderboard_idx
  ON picks (user_id, voided, result_hit, grade_status)
  WHERE voided = FALSE;
```

These can be added to the `ensurePicksSchema()` migration block already in `picks.js`. The `users` alter goes in the auth route's schema init.

**`pnl` backfill**: Any already-graded picks won't have `pnl` set. The leaderboard will use `COALESCE(pnl, 0)` for those. Optionally run a one-time migration to backfill historical `pnl` values using the same formula.

---

## Section 5 — API Response Additions

The proposed response shape is good. Two additions recommended:

```json
{
  "leaderboard": [
    {
      "rank": 1,
      "userId": "...",
      "username": "Player A",
      "winRate": 0.68,
      "winRatePct": "68.0",
      "pnl": 45.2,
      "totalPicks": 85,
      "gradedPicks": 85,
      "hits": 58,
      "misses": 27,
      "pushes": 0
    }
  ],
  "totalUsers": 847,        ← total users meeting min_picks threshold (for pagination)
  "sortedBy": "win_rate",
  "minGradedPicks": 10,     ← expose so clients can show "Requires 10+ picks"
  "myRank": 12,             ← caller's own rank, null if not opted in or below threshold
  "myStats": { ... }        ← caller's own stats row, even if not on leaderboard
}
```

`myRank` and `myStats` require auth — the endpoint can be called with or without a Bearer token. With auth, it includes the caller's position even if they don't appear on the list (e.g. below min picks threshold).

---

## Section 6 — "Your Rank" Feature

The proposal mentions showing the current user's rank. This needs a separate COUNT query:

```sql
-- How many opt-in users with ≥ min_picks beat the caller's metric?
SELECT COUNT(*) + 1 AS my_rank
FROM (
  SELECT
    SUM(pnl) AS pnl,
    COUNT(*) FILTER (WHERE result_hit = TRUE AND grade_status IS NULL)::FLOAT
    / NULLIF(COUNT(*) FILTER (WHERE result_hit IS NOT NULL AND grade_status IS NULL), 0)
    AS win_rate
  FROM picks p
  JOIN users u ON p.user_id = u.id
  WHERE p.voided = FALSE AND u.leaderboard_opt_in = TRUE
  GROUP BY p.user_id
  HAVING COUNT(*) FILTER (WHERE result_hit IS NOT NULL AND grade_status IS NULL) >= $min
) ranked
WHERE ranked.{metric} > $caller_metric
```

In practice, run both queries together and include `myRank` in the same response. If the caller isn't opt-in, return `myRank: null` and `myStats: null`.

---

## Section 7 — What Auth Requirement for the Endpoint?

**Recommendation: optional auth.**

- If called without a token → return the leaderboard, no `myRank` / `myStats`.
- If called with a valid token → return leaderboard + the caller's own position.

This lets a guest browse the leaderboard but personal context requires login. Use a `tryAuth` middleware variant (doesn't error on missing token, just skips setting `req.userId`).

---

## Section 8 — Anti-Gaming Considerations

The iOS team should be aware that a public P&L leaderboard has some gaming incentives:

| Risk | Mitigation |
|---|---|
| Only log wins | Voiding should be locked after game goes live (already enforced — the `VOID` button is disabled once `status = live`) |
| Log same pick 10x to inflate pick count | Each pick is deduplicated by `(user_id, player_id, market, slate_date)` — can't log the same pick twice |
| Inflate odds on wins | P&L is only as accurate as the odds the user enters. Leaderboard can show both P&L and flat-unit record. Consider showing `hits / gradedPicks` prominently over P&L for v1.3 |

The existing pick deduplication and live-locking provide good baseline protection. P&L leaderboard will always be noisier than win-rate — showing both and letting users sort is the right call.

---

## Summary — What Needs to Happen Before Building

| Task | Owner | Blocker? |
|---|---|---|
| `ALTER TABLE picks ADD COLUMN pnl NUMERIC` | Backend | Yes — leaderboard P&L needs it |
| Write `pnl` on pick grade | Backend | Yes — same as above |
| `ALTER TABLE users ADD COLUMN leaderboard_opt_in BOOLEAN DEFAULT FALSE` | Backend | Yes — privacy gate |
| Add opt-in toggle to Settings | Web + iOS | Yes — without it no one appears |
| `GET /api/leaderboard` endpoint | Backend | Yes |
| Leaderboard index on `picks` | Backend | No (performance, not correctness) |
| `pnl` backfill migration for existing picks | Backend | No (COALESCE to 0 handles it) |

**Estimated backend scope with these schema changes:** 2 days as proposed. The SQL is the hardest part (answered above). The endpoint wiring and caching are straightforward.

---

**Bottom line:** Greenlight the feature. Three schema changes need to land first (pnl column, opt-in flag, and the correct SQL formula). Recommend opt-in privacy model and 10-pick minimum. Once those are in, the iOS and web implementations can proceed in parallel.
