# Backend Grading Response — `resultHit` & `gradeStatus`

**Re:** BACKEND_GRADING_DATA_INQUIRY.md  
**Date:** June 30, 2026  
**From:** Web/Backend Team

---

## TL;DR

All questions answered below. Short version:

1. **`resultHit` is correct and working** — it's `null` by design for today's games. The grading job runs overnight on *yesterday's* data, not the current day.
2. **`gradeStatus` does not exist on board snapshot candidates.** It's a picks-only concept. See below.
3. **Games market candidates are not in the board snapshot at all.** Only HR, Hits, K, Outs.
4. **There is a manual trigger endpoint** you can hit to force-grade a specific date on demand (for testing with past dates).

---

## 1. Is the grading service running?

**Yes.** The grading service (`resolveCardSnapshotsJob`) is running in production.

**Timeline:** The job runs as a scheduled cron task **twice nightly** — at **1:00 AM and 2:00 AM Honolulu time** (Hawaii Standard Time, UTC−10). This is roughly 11 PM – midnight Eastern. The second run catches any late West Coast finishes that weren't in the first pass.

**Target date:** The job always runs on **yesterday's date** — not today's. For board candidates dated June 30, grading runs at 1 AM and 2 AM on July 1.

**This is why you see 0 finished candidates** — if you're testing on today's date (June 30), none of today's candidates can be graded until early tomorrow morning. This is by design, not a bug.

---

## 2. What fields are in the database?

The `board_card_snapshots` table has these grading columns:

| Column | Type | Description |
|---|---|---|
| `result_hit` | `BOOLEAN` | `true` = prop hit, `false` = miss, `null` = not yet graded |
| `actual_stat` | `NUMERIC` | The real stat the player posted (e.g. 7 Ks, 2 hits) |
| `resolved_at` | `TIMESTAMP` | When grading was written. `null` = not yet graded. |

**`gradeStatus` does not exist in `board_card_snapshots`.** This field belongs to the `picks` table (user-logged bets) and represents special outcomes: `ppd`, `scratch`, `push`. Board candidates never have a `gradeStatus` — only user picks do. See Section 4 below.

---

## 3. What does the API return?

**Endpoint:** `GET /api/board-snapshot/:date`

The response for each card includes:

```json
{
  "id": "...",
  "name": "Juan Soto",
  "market": "hr",
  "lean": "over",
  "score": 78,
  "bookLine": 0.5,
  "resultHit": null,       ← null until graded (boolean once resolved)
  "actualStat": null,      ← null until graded (numeric once resolved)
  "resolvedAt": null,      ← null until graded (ISO timestamp once resolved)
  "..."
}
```

After grading runs, a resolved card looks like:

```json
{
  "resultHit": true,
  "actualStat": 1,
  "resolvedAt": "2026-07-01T09:14:22.000Z"
}
```

**No filtering is happening in the API layer.** The fields are in the DB and returned as-is. For today's ungraded candidates, they are legitimately `null`.

---

## 4. Clarification: `gradeStatus` is a picks-only field

`gradeStatus` lives on the **user's logged picks** (`/api/picks`), not on board candidates. It represents special outcome scenarios:

| Value | Meaning |
|---|---|
| `null` | Normal outcome — uses `resultHit` (true/false) |
| `"ppd"` | Game postponed or cancelled |
| `"scratch"` | Player was a late scratch (didn't appear in boxscore) |
| `"push"` | Exact line hit (e.g. 8 runs on an 8-run total) |

**Board candidates never carry a `gradeStatus`.** For the iOS Board/AI Board views showing HIT/MISS badges, you should read only `resultHit` (boolean or null):

- `null` → Pending / Not yet graded → show no badge
- `true` → HIT ✓ → show green badge
- `false` → MISS ✗ → show red badge

If you need `gradeStatus` for a specific board card, the user must have logged that card as a pick — then it's available via `GET /api/picks`.

---

## 5. Markets in the board snapshot

The board snapshot covers **four markets only**: `hr`, `hits`, `k`, `outs`.

The Games tab (NRFI / O/U / RL / ML) is **not snapshotted**. Games tab cards are not persisted to `board_card_snapshots` and will never appear in the snapshot endpoint response.

The `GET /api/board-snapshot/:date` response shape is:
```json
{
  "hr":   [...],
  "hits": [...],
  "k":    [...],
  "outs": [...]
}
```

---

## 6. How to test grading right now

### Option A — Use a past date

The board snapshot endpoint accepts any date. To verify grading is working, request a completed past date:

```
GET /api/board-snapshot/2026-06-29
```

Cards for June 29 should have `resultHit` populated (non-null) if the job has already run for that date.

### Option B — Manual trigger (admin endpoint)

There is an on-demand admin endpoint to force grading for any specific date:

```
GET /api/admin/jobs/resolve-card-snapshots?date=2026-06-29
Header: x-admin-secret: <ADMIN_SECRET>
```

Response:
```json
{ "ok": true, "date": "2026-06-29", "resolved": 12, "skipped": 3 }
```

This is the same job the cron runs. Use it for testing. Do not call it for today's date — games must be final before the grader can score them.

---

## 7. How grading works internally

The job (`backend/jobs/resolveCardSnapshotsJob.js`) runs this flow per date:

1. Queries `board_card_snapshots` WHERE `resolved_at IS NULL` for that date
2. Groups unresolved cards by `game_pk`
3. For each game: fetches `GET /api/v1/game/:gamePk/boxscore` and `/linescore` from the MLB Stats API
4. Checks `ls.abstractGameState === "Final"` — skips any game that isn't final yet
5. For each card, looks up the player in the boxscore by name and grades against `book_line`:
   - `k` market: `pitcher.strikeOuts > bookLine` (if lean = over)
   - `outs` market: `pitcher.inningsPitched` (converted to outs) vs `bookLine`
   - `hits` market: `batter.hits > bookLine`
   - `hr` market: `batter.homeRuns >= 1` (for 0.5 lines) or vs `bookLine`
6. Writes `result_hit`, `actual_stat`, `resolved_at` to the row

**Requirement for grading to fire:** The card must have a `book_line` value in the snapshot. Cards without a `bookLine` are skipped (can't grade a prop without a line). Make sure cards are snapshotted with their `bookLine` populated.

---

## 8. Summary for iOS implementation

| Question | Answer |
|---|---|
| Is grading running? | Yes — nightly at 1 AM + 2 AM Honolulu |
| When do today's games get graded? | Early tomorrow morning (July 1 for June 30 games) |
| Are fields in the DB? | Yes — `result_hit`, `actual_stat`, `resolved_at` |
| Is the API returning them? | Yes — they map to `resultHit`, `actualStat`, `resolvedAt` |
| Does `gradeStatus` exist on board cards? | No — picks only |
| Are Games tab cards snapshotted? | No — HR/Hits/K/Outs only |
| How to verify with a real response? | Hit `/api/board-snapshot/2026-06-29` (past date) |
| How to force-grade for testing? | `GET /api/admin/jobs/resolve-card-snapshots?date=2026-06-29` |

**For the Finished filter and HIT/MISS badges:** Read `resultHit` (boolean or null). `null` = not graded yet = hide the badge. No `gradeStatus` needed on the board view — that's exclusively for the Picks tab.
