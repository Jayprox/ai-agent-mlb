# Re-test `/api/board/snapshot` hr/hits after CODEX TASK 148 (before building anything new)

## TL;DR

`board-hr-hits-root-cause-found.md` is correct that the web's visible
"Shared daily board" Hits/HR cards aren't simply `boardDailySnapshot.hits`/
`.hr` — but it's **not** correct that the web never calls
`/api/board/snapshot`, and a new endpoint isn't the next step yet. We need
one more data point first: a proper re-test of `/api/board/snapshot` against
the backend as it exists *right now* (CODEX TASK 148 just deployed), using
the timing the fix actually needs.

## What we found when we checked the web's code

The web calls `/api/board/snapshot` in three places (`prop-scout-v7.jsx`):

- on load (`?date=<today>`)
- a 90s poll loop while any market is `[]`
- the manual "↻ Refresh" button (`?date=<today>&refresh=1`)

The "Shared daily board · snapshot Jun 11, 10:00 AM HI" banner text comes
directly from this endpoint's `generatedAt` field — so the fetch is
definitely happening (it may just have aged out of the 59-entry resource list
you captured, or already been in React state before you started recording).

**However** — here's the part your investigation got right in spirit: even
when that fetch succeeds and `boardDailySnapshot.hits`/`.hr` come back `[]`,
the web has a fallback (`sharedMarketOrLive`, commit `924b2db`) that silently
swaps in a **client-side computed** version (`computeBatterBoard`, using
`/api/lineups/*`, `/api/players/*/stats`, `/api/players/*/gamelog`,
`/api/nrfi/*`, `/api/odds`, `/api/schedule`, etc. — the ~9 endpoints/game you
saw in the network log). That's why the Hits tab can look fully populated
under a "Shared daily board" banner even while the snapshot's own `hits`/`hr`
arrays are empty.

So: the web's populated view doesn't prove `/api/board/snapshot` is fixed —
it proves the *fallback* works. Whether the snapshot itself is fixed is
exactly what TASK 148 (just deployed) targeted, and it hasn't been re-tested
yet.

## What we need from iOS

One more controlled test against the **current** production deploy
(post-TASK-148):

1. `GET /api/board/snapshot?date=<today>&refresh=1`
   - Record `hits.length` and `hr.length` (expect these may still be `0` —
     TASK 148 made this *first* call return promptly without waiting for the
     full recompute).
2. **Wait 60-90 seconds** (TASK 148's background recompute needs this time to
   finish and persist to the DB — don't re-call sooner).
3. `GET /api/board/snapshot?date=<today>` (no `refresh` param)
   - Record `hits.length` and `hr.length` again.

Please report all four numbers (step 1 hits/hr, step 3 hits/hr), plus the
`date` and `generatedAt` from each response, and roughly what time (HI) each
call was made. If possible, run this on a date/time where you can also note
whether the web's Hits tab is currently showing live data via the fallback
(so we can compare).

## Why this matters before building anything new

- If step 3 comes back **non-empty**: TASK 148 worked. iOS's existing
  poll/refresh implementation (already verified complete) will pick this up
  on its next cycle automatically — **no further iOS changes needed**, and no
  new endpoint needed.
- If step 3 is **still empty**: the bug is in `computeBatterBoard` /
  `gatherLiveBoardData` / `computeMarketCandidates` actually returning `[]`
  server-side even with full live data — a backend logic bug, not a "wrong
  endpoint" problem. A new endpoint that calls the *same* functions would
  inherit the *same* bug. In that case we'll add targeted logging
  server-side to see exactly what's empty (lineups not confirmed server-side?
  hitting logs missing? something else), rather than building parallel
  infrastructure.

## What NOT to do yet

- Don't start porting `computeBatterBoard`/`computePitcherBoard` to Swift —
  this was correctly identified (twice now, in two separate feasibility
  passes) as a major, ongoing-maintenance undertaking that should be a last
  resort.
- Don't build a new `/api/board/live` endpoint yet — if it would just call
  the same `computeBatterBoard`/`computeMarketCandidates` that
  `/api/board/snapshot`'s on-demand recompute already calls, it can't succeed
  where that fails.
- No iOS code changes needed for this step — it's just two `curl`/Postman
  calls with a wait in between.
