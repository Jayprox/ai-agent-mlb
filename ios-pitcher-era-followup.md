# Pitcher ERA — Follow-up Notes for iOS Team

Implementation guide looks good overall. Two things to flag before you build
against it.

---

## 1. `fetchPitcherStats()` is now implemented — backend is ready

The backend changes are done. `slateBundle.js` now batch-fetches season stats
for every probable pitcher on the slate and includes them in the response as
`pitcherStatsMap`. You don't need to wait on us for anything — the endpoint is
live.

Under the hood it reuses the same 3-layer cache as
`/api/players/{id}/stats` (in-memory → DB snapshot → MLB API), so adding
pitcher stats to the bundle adds essentially zero latency in steady state.

The log line for each bundle build now shows pitcher count:
```
✓ slate-bundle  games=15  nrfi=15  weather=13  odds=15 games  pitchers=28
```

---

## 2. Field name: use `k9`, not `kPer9`

The existing `/api/players/{id}/stats` endpoint returns `kPer9` (that's what
the web app uses internally). The new `pitcherStatsMap` in the slate bundle
uses **`k9`** to match your Swift model.

These are two different keys on two different responses — don't mix them up:

| Source | Field name |
|---|---|
| `GET /api/players/{id}/stats` (full stats endpoint) | `kPer9` |
| `GET /api/slate-bundle` → `pitcherStatsMap` | `k9` |

Your Swift `PitcherStats` struct is already correct:
```swift
struct PitcherStats: Decodable {
    let era: String?
    let whip: String?
    let k9: String?    // ← correct for slate-bundle
    let avgIP: String?
}
```

---

## 3. `avgIP` is not included in `pitcherStatsMap`

Your `PitcherStats` model includes `avgIP` but the slate bundle does **not**
populate it. avgIP requires a separate gamelog fetch per pitcher (it's computed
from recent starts, not season stats), which would double the API calls on cold
builds.

For a slate card, ERA and WHIP are the meaningful signals. Our recommendation:

- **Drop `avgIP` from `PitcherStats`** for now, or keep it optional and just
  accept that it will always decode as `nil` from the bundle.
- If you need avgIP for a detail view (e.g. tapping into a game), fetch it
  on-demand from `GET /api/players/{id}/gamelog?group=pitching` — that endpoint
  returns `avgIP` computed from the last 5 starts.

---

## Updated `pitcherStatsMap` shape (live now)

```json
{
  "pitcherStatsMap": {
    "123456": { "era": "3.12", "whip": "1.08", "k9": "9.4" },
    "789012": { "era": "4.01", "whip": "1.24", "k9": "7.8" }
  }
}
```

`avgIP` is absent. All values are strings (matching MLB Stats API output).
Any pitcher without a confirmed probable (TBD) will simply not appear in the
map — handle with optional chaining as you already do.
