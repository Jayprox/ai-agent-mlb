# Prop Scout — Savant Fix Handoff

> This handoff documents the Baseball Savant backend issue that was active on `jayprox/codex_work_branch`, what was actually failing, how it was debugged, what code was changed, and the final verified result.

---

## Summary

The Baseball Savant integration in Prop Scout was partially wired correctly in the frontend, but the backend routes that powered it were using outdated Savant request patterns.

Symptoms:

- `GET /api/arsenal/:pitcherId` returned `502`
- `GET /api/splits/:batterId` returned `502`
- The frontend would therefore fall back or fail to show real Savant data

After the fix:

- Arsenal data loads again
- Batter pitch-type splits load again
- The app now shows the `SAVANT LIVE` badge in the Arsenal UI when live data is present

---

## What Was Happening

Two backend routes were involved:

- `backend/routes/arsenal.js`
- `backend/routes/splits.js`

These routes originally had a two-strategy approach:

1. Try Savant's `player-services/arsenal-scores` JSON endpoint
2. Fall back to `statcast_search/csv`

In practice, both were failing.

### Failure 1: JSON endpoint was no longer usable

The route attempted URLs like:

```text
https://baseballsavant.mlb.com/player-services/arsenal-scores?playerId=554430&year=2026&type=pitcher
```

and

```text
https://baseballsavant.mlb.com/player-services/arsenal-scores?playerId=592450&year=2026&type=batter
```

These returned `404` from Savant.

That meant the "primary" strategy in both routes was dead.

### Failure 2: CSV fallback used an outdated request format

The CSV fallback was making requests with `pitchers_lookup[]` / `batters_lookup[]`, but it was missing a now-required `player_id` query param that Savant's live site currently appends when exporting CSV.

Without `player_id`, Savant often returned only a header row or effectively no usable rows.

### Failure 3: CSV parser missed BOM-prefixed headers

Even when Savant returned CSV, the file started with a UTF-8 BOM. That caused the first header to be parsed incorrectly, so `pitch_type` was not recognized on some responses.

This made the code treat valid CSV responses as unusable.

### Failure 4: Early-season pitcher data can be empty for current season

For some pitchers, current-season Savant export still returned no usable rows even with the corrected query shape.

Example:

- Zack Wheeler (`554430`) for season `2026` came back empty
- The prior season `2025` did contain usable pitch data

So even after fixing the request format, a current-season fallback issue remained for some pitchers.

---

## Why It Was Happening

Root causes:

1. Savant changed or removed the previously used `arsenal-scores` endpoint behavior
2. Savant's current CSV export flow expects `player_id` in addition to the lookup arrays
3. The CSV parser did not strip a leading BOM
4. Current-season Statcast exports can be empty early in the season for some pitchers

The frontend itself was not the main problem. The frontend hooks were already wired to:

- fetch `/api/arsenal/:pitcherId` when a game opens
- fetch `/api/splits/:batterId` when a lineup drawer opens
- overlay returned data into the existing UI

The blocker was the backend request/parse logic.

---

## Steps Taken To Resolve It

### 1. Reproduced the issue locally

Started the backend and tested known IDs:

- pitcher: Zack Wheeler `554430`
- batter: Aaron Judge `592450`

Observed:

- `/api/arsenal/554430` returned `502`
- `/api/splits/592450` returned `502`

### 2. Confirmed the JSON strategy was broken

Tested Savant's `player-services/arsenal-scores` endpoint directly and confirmed it returned `404` for both pitcher and batter requests.

Conclusion:

- remove reliance on this endpoint
- treat CSV as the real source of truth

### 3. Verified the old CSV shape was incomplete

Direct CSV calls without `player_id` returned only headers or no usable rows.

Then I inspected Savant's current live Statcast Search page and its JS bundle to see how its own CSV export works.

Important discovery:

The current site export appends:

```text
&player_id=<playerId>
```

to the CSV request URL.

### 4. Updated backend CSV requests to match Savant's live export behavior

Both routes were updated to request CSV using:

- `group_by=pitch-type`
- `type=details`
- `player_id=<id>`

This restored usable CSV responses.

### 5. Fixed BOM handling in CSV parsing

The parser now strips a leading UTF-8 BOM before splitting headers.

This ensures the first header is correctly recognized as `pitch_type`.

### 6. Added previous-season fallback when current-season export is empty

If a current-season Savant CSV export returns no usable rows:

- try `year`
- then try `year - 1`

This is especially helpful early in the MLB season.

### 7. Re-tested both live backend routes

Verified:

- `/api/arsenal/554430` now returns usable arsenal data
- `/api/splits/592450` now returns usable batter splits

---

## Code Changes Made

Files changed:

- [backend/routes/arsenal.js](/Users/jayprox/Documents/Projects/git/ai-agent-mlb/backend/routes/arsenal.js)
- [backend/routes/splits.js](/Users/jayprox/Documents/Projects/git/ai-agent-mlb/backend/routes/splits.js)

### `backend/routes/arsenal.js`

Changes:

- removed the broken `arsenal-scores` JSON-first strategy
- updated CSV request shape to include `group_by=pitch-type`
- added `player_id=${pitcherId}` to Savant CSV requests
- made CSV parsing BOM-safe
- added fallback from current year to previous year
- improved logging to show when a year returns no usable rows
- response now reports the actual resolved season used

### `backend/routes/splits.js`

Changes:

- removed the broken batter `arsenal-scores` JSON-first strategy
- updated CSV request shape to include `group_by=pitch-type`
- added `player_id=${batterId}` to Savant CSV requests
- made CSV parsing BOM-safe
- added fallback from current year to previous year
- improved logging to show when a year returns no usable rows
- response now reports the actual resolved season used

---

## Verified Result

### Backend verification

Successful response from:

```text
GET /api/arsenal/554430
```

Returned:

- `season: 2025`
- `source: statcast_csv_prev_season`
- usable pitch mix data for Zack Wheeler

Successful response from:

```text
GET /api/splits/592450
```

Returned:

- `season: 2026`
- `source: statcast_csv`
- usable batter splits for Aaron Judge

### UI verification

The Prop Scout UI now shows:

- live Arsenal cards
- real pitch mix values
- `SAVANT LIVE` badge

The screenshot provided confirms the live Arsenal view is rendering successfully.

---

## Final Result

The Savant integration is working again.

Current behavior:

- pitcher arsenal loads from Savant CSV
- batter pitch-type splits load from Savant CSV
- current season is used when available
- previous season is used automatically when current season is empty
- frontend overlay logic works as intended without additional UI changes

This resolves the active Savant blocker described in the previous handoff.

---

## Notes For Next Session

Good next checks:

1. Open several different games and confirm more starters resolve correctly
2. Open lineup drawers for multiple batters and confirm live splits populate
3. Decide whether to surface the resolved Savant season in the UI when previous-season fallback is used
4. Optionally update the main project handoff doc so it no longer describes the broken JSON-first Savant strategy as the current implementation

---

## Worktree Notes

At the time of this handoff:

- modified: `backend/routes/arsenal.js`
- modified: `backend/routes/splits.js`
- untracked lockfiles were already present:
  - `backend/package-lock.json`
  - `package-lock.json`

No frontend files were changed for this fix.
