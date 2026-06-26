# iOS Handoff: `GET /api/game/:gamePk` — Unified Game Detail

## TL;DR

There's a new endpoint that replaces the 5–8 individual calls you currently
fire when a user taps a game card. One request, everything you need.

---

## Endpoint

```
GET /api/game/:gamePk
GET /api/game/:gamePk?date=2026-06-25   ← optional, for historical dates
```

---

## Response shape

```json
{
  "gamePk": 747056,
  "lineups": { ... },
  "umpire": { ... },
  "nrfi": { ... },
  "weather": { ... },
  "bullpen": { ... },
  "homePitcher": {
    "id": 592789,
    "stats": { "era": 3.12, "whip": 1.08, "strikeouts": 87, ... },
    "gamelog": [ ... ],
    "arsenal": { ... }
  },
  "awayPitcher": {
    "id": 669923,
    "stats": { ... },
    "gamelog": [ ... ],
    "arsenal": { ... }
  },
  "teamStats": {
    "home": { ... },
    "away": { ... }
  },
  "fetchedAt": "2026-06-25T18:04:22.000Z"
}
```

Every field is nullable — if a sub-component fails or isn't available yet
(e.g. lineups not posted), that key comes back as `null`. Design your models
accordingly so a null field is never a crash.

---

## What this replaces on game tap

| Old call | Now covered by |
|---|---|
| `GET /api/lineups/:gamePk` | `lineups` |
| `GET /api/umpires/:gamePk` | `umpire` |
| `GET /api/nrfi/:gamePk` | `nrfi` |
| Weather fetch | `weather` |
| `GET /api/bullpen/:gamePk` | `bullpen` |
| `GET /api/players/:id/stats?group=pitching` × 2 | `homePitcher.stats`, `awayPitcher.stats` |
| `GET /api/players/:id/gamelog?group=pitching` × 2 | `homePitcher.gamelog`, `awayPitcher.gamelog` |
| `GET /api/arsenal/:id` × 2 | `homePitcher.arsenal`, `awayPitcher.arsenal` |
| `GET /api/team-stats/:teamId` × 2 | `teamStats.home`, `teamStats.away` |

---

## Field note: pitcher stats

The `homePitcher.stats` / `awayPitcher.stats` object here uses the same
summary shape as `pitcherStatsMap` in the slate bundle:

```json
{ "era": 3.12, "whip": 1.08, "k9": 9.4 }
```

`k9` (not `kPer9`) — consistent with how it appears in the slate bundle.
The full stats object (returned by the old `/api/players/:id/stats` endpoint)
uses `kPer9`, but the bundle fields use `k9`. Your `PitcherStatsSummary`
Swift model from the slate bundle maps directly here.

---

## Rate limiting note

The backend runs all sub-fetches with a concurrency cap of 4 and in-flight
deduplication. If two users tap the same game simultaneously, only one set of
MLB API calls fires — both users get the same response when it resolves.
NRFI and weather are typically already warm from the slate bundle load, so
they resolve from cache instantly.

---

## Suggested adoption approach

1. On game tap, fire `GET /api/game/:gamePk` as the primary call.
2. Populate all available fields into your existing view models.
3. Treat `null` fields as "not yet available" — show a placeholder or omit
   the section rather than crashing.
4. You can still call individual endpoints as a fallback if the unified call
   fails, but in practice the endpoint is very reliable since it uses
   `Promise.allSettled` internally — partial failures return partial data,
   not a 5xx.

---

## Individual endpoints still available

All existing endpoints (`/api/lineups/:gamePk`, `/api/umpires/:gamePk`, etc.)
remain mounted and unchanged. You can migrate incrementally — adopt the game
detail bundle for new screens while existing screens continue using individual
calls until you're ready to swap.
