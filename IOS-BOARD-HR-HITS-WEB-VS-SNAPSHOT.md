# iOS Handoff: How Web Populates Board HR/Hits

## Summary

The web app's Board `HR` and `Hits` tabs are **not snapshot-only**.

Web does call:

- `GET /api/board/snapshot?date=YYYY-MM-DD`

but the visible Board cards use a **shared-or-live fallback**:

1. try shared snapshot data for the market
2. if that market is populated, use it
3. if that market is empty or missing, fall back to **client-side live computation**

That is why web can show populated `HR` / `Hits` cards while iOS, which currently reads snapshot-only, sees:

- `hr: []`
- `hits: []`

## 1. Does web HR/Hits come from `/api/board/snapshot`?

**Not exclusively.**

Web uses `/api/board/snapshot` for the shared daily board state, banner timestamp, and market payloads, but `HR` and `Hits` are not guaranteed to render from snapshot alone.

The current render path in [prop-scout-v7.jsx](/Users/jayprox/Documents/Projects/git/ai-agent-mlb/prop-scout-v7.jsx) computes live candidates locally, then chooses between:

- snapshot candidates
- live candidates

The key selection helpers are:

- `boardSnapshotCoversToday()`
- `getBoardMarketSnapshot(market)`
- `sharedMarketOrLive(market, liveCandidates)`
- `boardCandidatesByType`

## 2. If computed client-side, what functions and files are involved?

Yes. For `HR` and `Hits`, web computes the live candidate list client-side.

### Primary function

File:

- [src/board/index.js](/Users/jayprox/Documents/Projects/git/ai-agent-mlb/src/board/index.js)

Function:

- `computeBatterBoard(type, liveSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits)`

This is the main confirmed source of the web `HR` and `Hits` board candidate lists.

### Web call site

File:

- [prop-scout-v7.jsx](/Users/jayprox/Documents/Projects/git/ai-agent-mlb/prop-scout-v7.jsx)

Relevant calls:

- `computeBatterBoard("hr", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits)`
- `computeBatterBoard("hits", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits)`

### Related helpers

File:

- [src/scoring/batter.js](/Users/jayprox/Documents/Projects/git/ai-agent-mlb/src/scoring/batter.js)

Functions used by `computeBatterBoard(...)`:

- `hrBoardScore(...)`
- `hitBoardScore(...)`

Selection/fallback helpers in [prop-scout-v7.jsx](/Users/jayprox/Documents/Projects/git/ai-agent-mlb/prop-scout-v7.jsx):

- `boardSnapshotCoversToday()`
- `getBoardMarketSnapshot(market)`
- `sharedMarketOrLive(market, liveCandidates)`
- `buildLiveGame(sg)`

## 3. Every endpoint/input required for HR/Hits generation on web

These are the inputs used by the web's live `HR` / `Hits` computation path.

### Required or practically required

- `GET /api/schedule`
- `GET /api/schedule?date=YYYY-MM-DD`
  - builds `liveSlate`

- `GET /api/lineups/:gamePk`
  - provides lineup status and batters
  - `computeBatterBoard(...)` skips games without a confirmed lineup or roster-backed lineup

- `POST /api/players/gamelogs/batch`
  - used to populate `liveHittingLog`
  - this is a critical input for batter scoring

- `GET /api/stat-splits/:playerId?group=hitting`
  - used to populate `liveStatSplits`

- `POST /api/weather/batch`
  - provides weather flags like HR-favorable conditions

### Player props input

For board-wide batter markets, the web currently uses:

- `fetchPlayerPropsDirect(awayTeam, homeTeam, gamePk)`

This helper lives in [prop-scout-v7.jsx](/Users/jayprox/Documents/Projects/git/ai-agent-mlb/prop-scout-v7.jsx) and is part of the current live board flow.

There is also a backend route used elsewhere in the app/server-side flows:

- `GET /api/player-props/:gamePk`

but the board-wide web HR/Hits prefetch path is tied to `fetchPlayerPropsDirect(...)`.

### Other inputs that influence board objects

Inside `computeBatterBoard(...)`, candidate generation also uses:

- probable/facing pitcher data from the slate object
- batter handedness / lineup order from lineups
- park factors
- weather-derived HR friendliness
- hitter recent form and rates from gamelog data
- hitting splits vs pitcher hand

### Not primary requirements for standard HR/Hits board generation

These are used elsewhere in the app, but are not the core required inputs for the standard web `HR` / `Hits` board list:

- injuries
- umpires
- NRFI
- arsenal
- pitcher game logs
- team-level odds/game markets

## 4. Is there already a backend endpoint that returns the same populated HR/Hits list web shows?

**Not reliably, no.**

Existing related backend routes include:

- `GET /api/board/snapshot?date=YYYY-MM-DD`
- `GET /api/ai-board/edges`

But these are not equivalent to the web's current visible `HR` / `Hits` behavior:

- `/api/board/snapshot` is intended to be the shared source, but can still return `hr: []` and `hits: []`
- web can still look populated because it falls back to client-side `computeBatterBoard(...)`
- `/api/ai-board/edges` is a different product surface and not the standard Board `HR` / `Hits` candidate list

So there is **no current backend endpoint iOS can switch to today** that matches the web Board `HR` / `Hits` behavior exactly.

## 5. Smallest backend change to expose the same HR/Hits computation for iOS

### Recommended path

The best fix is to make:

- `GET /api/board/snapshot?date=YYYY-MM-DD`

return the same populated `hr` and `hits` candidate arrays that web can currently derive live.

That keeps one canonical shared source for:

- web shared board
- iOS board

### Recommended implementation approach

Use the same candidate-generation logic on the server that web already relies on conceptually:

- shared board market computation
- `computeBatterBoard(...)` / equivalent market candidate generation path

### Smallest backend fix

**Fix or extend `/api/board/snapshot`**, rather than asking iOS to use another existing route.

Why:

- no alternate existing route matches web behavior exactly
- web already treats snapshot as the shared source of truth when populated
- the missing piece is that snapshot recompute/persist is still producing empty `hr` / `hits` in cases where live web fallback can show cards

### If a new route is preferred

The smallest clean new route would be something like:

- `GET /api/board/live?date=YYYY-MM-DD`

returning:

- `hr`
- `hits`
- `k`
- `outs`
- optional metadata like `generatedAt`

But that is only worth doing if product wants a clearly separate live-computed API. For the current iOS issue, fixing `/api/board/snapshot` is the better path.

## 6. Is the web "Shared daily board" HR/Hits panel truly shared snapshot data?

**Not always.**

It is currently a **shared-or-live fallback**.

That means:

- the shared board banner and timestamp can come from `/api/board/snapshot`
- the visible `HR` / `Hits` cards can still come from live client-side `computeBatterBoard(...)` if snapshot data for that market is empty

So the web's "Shared daily board" `HR` / `Hits` view is **not proof that snapshot itself is populated**.

## Direct answers for iOS

- Web `HR` / `Hits` are **not snapshot-only**
- Web `HR` / `Hits` are currently backed by **client-side `computeBatterBoard(...)` fallback**
- iOS should **not switch to another existing endpoint**, because there is no current backend endpoint that exactly matches the web Board `HR` / `Hits` behavior
- The recommended backend fix is to **repair/extend `/api/board/snapshot` so it returns populated `hr` and `hits` using the same market computation path**

## Exact files/functions to reference

- [prop-scout-v7.jsx](/Users/jayprox/Documents/Projects/git/ai-agent-mlb/prop-scout-v7.jsx)
  - `boardSnapshotCoversToday()`
  - `getBoardMarketSnapshot(market)`
  - `sharedMarketOrLive(market, liveCandidates)`
  - `boardCandidatesByType`
  - `buildLiveGame(sg)`
  - `fetchPlayerPropsDirect(...)`

- [src/board/index.js](/Users/jayprox/Documents/Projects/git/ai-agent-mlb/src/board/index.js)
  - `computeBatterBoard(...)`

- [src/scoring/batter.js](/Users/jayprox/Documents/Projects/git/ai-agent-mlb/src/scoring/batter.js)
  - `hrBoardScore(...)`
  - `hitBoardScore(...)`
