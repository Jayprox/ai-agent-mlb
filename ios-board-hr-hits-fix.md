# Board HR/Hits "No board data yet" — Backend fix shipped

## TL;DR

The `hr`/`hits` keys missing from `/api/board/snapshot` was a **backend
issue**, not an iOS decoding issue (thanks for the diagnostics that proved
that). It's fixed server-side — **no iOS code changes are required** to
resolve the original bug. There's one optional UX improvement worth
considering on your end (see "Optional follow-up" below).

## What was actually happening

`/api/board/snapshot?date=YYYY-MM-DD` is backed by a `board_daily_snapshots`
table that gets populated twice a day (10 AM Honolulu, and again ~95 min
before first pitch) by a cron job.

For HR/Hits, the candidate list depends on confirmed-or-roster lineup data
(`computeBatterBoard`). On days where neither cron run had lineup data yet
for any game, that computation returned `[]`. Two stacked guards then
**silently dropped the row entirely** instead of saving an empty array — so
`hr`/`hits` never appeared in the JSON response at all for that date. K/Outs
don't depend on lineups, so they were unaffected, which is why you only saw
the gap on those two markets.

The web app never hit this because it computes HR/Hits live, client-side,
from the same scoring functions — that's the "LINEUP TBD" state you may have
seen there.

## What changed on the backend

1. **`/api/board/snapshot` is now self-healing.** For **today's date**, if
   any of the 10 board markets (`k, outs, hits, hr, nrfi, total, spread, ml,
   f5ml, f5spread`) are missing from the DB snapshot, the endpoint now
   computes them **on-demand** at request time, writes the result back to
   the DB, and includes it in the response.
2. **Empty results are now persisted as `[]`** instead of being dropped, both
   by the cron job and by the on-demand fallback. This directly addresses
   request #4 from your diagnostics doc:

   > If `hr`/`hits` are expected to always be present (even if empty `[]`)
   > once the slate is generated, consider always including those keys in
   > the response so the client can distinguish "not yet computed" from
   > "computed, no candidates."

   **As of this fix, all 10 market keys will always be present in the
   response** — `hr: []` / `hits: []` now means "we checked, nothing
   currently qualifies," not "not computed yet."

## Answers to your specific questions

1. **Did the snapshot generator actually compute hr/hits for that date, or
   skip them?** — It computed `[]` (no qualifying candidates given lineup
   state at snapshot time) and then **dropped the row** due to an
   over-aggressive "don't save empty results" guard. Both the guard and the
   "skip if empty" loop have been removed.
2. **Does HR/Hits run on a different schedule/condition than K/Outs?** — Same
   schedule (same two cron runs, same data-gathering pass). The difference is
   purely that HR/Hits computation is lineup-dependent and K/Outs isn't.
3. **Is the web app reading from the same endpoint?** — No. Web computes
   HR/Hits live client-side via the same scoring functions, which is why it
   showed populated "LINEUP TBD" cards when the snapshot endpoint had
   nothing.
4. **Should hr/hits always be present, even as `[]`?** — Yes, and that's now
   the case (see above).

## What this means for you

- No required changes to `Models/BoardModels.swift` or your decoding logic —
  `decodeIfPresent` → `nil` for a missing key already worked correctly, and
  going forward the key won't be missing.
- You can safely remove any temporary diagnostic logging you added for this
  investigation, or leave it in — it should now consistently log
  `count = 0` (not "key missing") on slow-lineup days, and real counts once
  lineups post.

## Optional follow-up (UX, no urgency)

Now that `hr: []` / `hits: []` is a real, distinguishable state ("computed,
nothing qualifies right now — likely lineups not posted yet"), it might be
worth differentiating that from a true "no data available" state in the UI —
e.g. "Lineups not yet posted — check back closer to first pitch" vs the
generic "No board data yet." This is purely cosmetic and not required to
close out this bug; flagging it in case it's a quick win on your side.

## Verification

Once this is deployed, `GET /api/board/snapshot?date=YYYY-MM-DD` for **today**
should always return all 10 keys (`k, outs, hits, hr, nrfi, total, spread,
ml, f5ml, f5spread`), each an array (possibly empty), plus `date` and
`generatedAt`. If you spot-check early in the day before lineups post, expect
`hr`/`hits` to be `[]` rather than absent.
