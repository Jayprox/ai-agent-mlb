# iOS HR/Hits fix: no new endpoint needed — reuse `/api/board/snapshot?refresh=1`

## TL;DR

The feasibility doc's instinct is right that porting `computeBatterBoard` to
Swift (or chasing the earlier "shared empty array overrides live fallback"
fix) is the wrong path for iOS. But the proposed fix — a brand new
`GET /api/board/live?date=...&market=hr|hits` endpoint — **already exists**.
It's `/api/board/snapshot?date=YYYY-MM-DD&refresh=1`, shipped in CODEX TASK
145 (already deployed). Same response shape iOS already decodes, same
endpoint iOS already calls, one extra query param.

## Why the new-endpoint idea isn't needed

`/api/board/snapshot` already has an on-demand server-side fallback
(`fillMissingMarkets` in `backend/routes/boardDailySnapshot.js`) that, for
**today's date**, runs `computeBatterBoard` / `computePitcherBoard` /
`computeGameBoard` server-side via `computeMarketCandidates()` whenever a
market is missing **or present-but-`[]`**, persists the result, and returns
it inline in the normal snapshot payload — same `hr: [...]` / `hits: [...]`
arrays, same `BoardCandidate` shape, same JSON envelope (`{date,
generatedAt, k, outs, hits, hr, nrfi, total, spread, ml, f5ml, f5spread}`).

Two ways this already triggers:

1. **Passive (no client change at all, mostly):** even a plain
   `GET /api/board/snapshot?date=<today>` will recompute any market that's
   `[]` for today, as long as it hasn't already tried in the last 10 minutes
   (negative-cache TTL). So if iOS just **re-fetches the snapshot**
   periodically while `hr`/`hits` are `[]` (the same "keep polling while
   empty" pattern just shipped for web in CODEX TASK 146), the backend
   self-heals on its own once lineups post.
2. **Active ("Refresh" button / pull-to-refresh):** add `&refresh=1` to the
   same request. This bypasses both the 5-minute response cache and the
   10-minute negative cache for any market that's missing/empty, forcing an
   immediate recompute attempt. Markets that already have real data are left
   untouched — safe to call freely.

## Recommended iOS change (small, no new model)

Mirror the web's CODEX TASK 146 pattern:

1. After decoding `/api/board/snapshot`, check if `hr`/`hits` (or any market
   the current tab needs) is an empty array **and** `date == today`.
2. If so, on a timer (e.g. every 60-90s while that tab is visible) re-call
   `GET /api/board/snapshot?date=<today>` — decode with the **existing**
   `BoardSnapshot` model, no changes needed there. Replace the in-memory
   snapshot when the response comes back with non-empty data.
3. Add a manual refresh affordance (pull-to-refresh or a small "↻ Refresh"
   button, matching the web banner) that calls
   `GET /api/board/snapshot?date=<today>&refresh=1` once, immediately.
4. Keep the existing "shared market `[]` → don't show live/local fallback,
   show empty state" behavior for everything else — no need to chase the
   `sharedMarketOrLive` / local-`computeBatterBoard` path described in the
   earlier handoff doc. That path is real for the *web* app (which already
   fetches all the live inputs for other reasons), but isn't needed for iOS
   now that the backend self-heals.

## What NOT to build

- No new `/api/board/live` endpoint.
- No new Swift decoding model — response shape is identical to today's
  `/api/board/snapshot`.
- No Swift port of `computeBatterBoard` / `computePitcherBoard` / scoring
  logic — stays server-side, single source of truth.

## Open items / caveats

- `?refresh=1` can take up to ~9s (`FALLBACK_BUDGET_MS`) on the first call if
  it ends up recomputing multiple stale-empty markets at once — treat it like
  any other network call with a loading state, don't block the UI thread.
- If `hr`/`hits` are still `[]` after a refresh, that's a real "lineups not
  posted yet" state, not a bug — same empty-state UI as today is fine.
- This doesn't require any backend changes beyond what's already deployed
  (TASK 144 + 145). Purely additive on the iOS side.
