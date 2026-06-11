# iOS Handoff: HR / Hits Tabs Blank Despite Live, Final, and Upcoming Games

## Summary

The blank `HR` / `Hits` tabs were not caused by missing slate data alone. The real bug was in the **shared board snapshot selection logic**:

- once the shared daily snapshot existed for today
- and a market key like `hr` or `hits` was present
- but that key's value was `[]`

the app treated that empty shared array as **authoritative** and stopped falling back to live-computed candidates.

That meant the UI could stay blank even when:

- some games were live
- some games were final
- some games were still upcoming
- lineups and enough live data existed to compute usable batter candidates locally

## Root Cause

In the web app, the Board used `getBoardMarketSnapshot(market)` and `useSharedBoard` to decide whether to render shared snapshot candidates or live local candidates.

The bad behavior was:

1. `boardSnapshotCoversToday()` became `true` as soon as today's snapshot object existed.
2. `getBoardMarketSnapshot("hr")` or `getBoardMarketSnapshot("hits")` returned `[]`.
3. The Board render path still chose that `[]` instead of falling back to local `computeBatterBoard(...)`.
4. The empty state rendered: `"Loading player stats — check back shortly"`.

So the bug was not just "snapshot missing data". It was:

`shared empty market array overriding live fallback`

## Fix Applied in Web

File changed:

- [prop-scout-v7.jsx](/Users/jayprox/Documents/Projects/git/ai-agent-mlb/prop-scout-v7.jsx)

### What changed

I changed the Board candidate selection logic so that:

- if shared snapshot data for a market is `null` -> use live candidates
- if shared snapshot data for a market is a **non-empty array** -> use shared candidates
- if shared snapshot data for a market is `[]`:
  - use live candidates **if live candidates exist**
  - otherwise keep the empty snapshot array

In plain English:

> empty shared market arrays are no longer treated as final truth when live candidates are available

## Implementation Pattern

I added a helper with this behavior:

```js
const sharedMarketOrLive = (market, liveCandidates) => {
  if (!useSharedBoard) return liveCandidates;
  const snapshotCandidates = getBoardMarketSnapshot(market);
  if (snapshotCandidates === null) return liveCandidates;
  if (Array.isArray(snapshotCandidates) && snapshotCandidates.length > 0) return snapshotCandidates;
  return liveCandidates.length > 0 ? liveCandidates : snapshotCandidates;
};
```

Then I routed HR / Hits / K / Outs through that logic.

I also made the same fallback behavior consistent for game-market sub-tabs, so an empty shared market does not hard-freeze the view when live data can render cards.

## Why this matters for iOS

If the iOS app is currently doing something like:

```swift
if let shared = snapshot.hr {
  use(shared)
} else {
  use(liveComputed)
}
```

then it likely has the same bug, because `shared = []` still wins.

The iOS-side logic should instead be:

1. if shared market is missing -> use live/local fallback
2. if shared market is non-empty -> use shared market
3. if shared market is empty:
   - use live/local fallback if local candidates are available
   - otherwise use the empty shared result

## Important Distinction

There are two different cases:

### Case 1: Shared market is missing entirely

This was the original backend snapshot gap and was addressed by the backend self-healing work.

### Case 2: Shared market exists but is empty (`[]`)

This is the frontend/client-selection bug fixed here.

Even after the backend self-heals and supports refresh/recompute, the client still needs to avoid treating `[]` as authoritative when it can compute real candidates locally.

## Recommended iOS Fix

Mirror the same selection rule used by the web fix:

- prefer shared snapshot only when that market has at least one candidate
- if shared snapshot is empty, allow local/live candidate computation to replace it when available

## Verification Result

Web verification after fix:

- `npm run build` passed

Behavioral expectation:

- HR / Hits no longer stay blank just because today's shared snapshot has `hr: []` or `hits: []`
- live/local candidates can now render while the backend snapshot catches up

