# Lineup Tab — Score & Hot/Cold Tags

## Overview

Each batter row shows two things: a **matchup score** (0–100) and optionally
a **HOT** or **COLD** streak badge. Here's exactly what each means, where
the data comes from, and the recommended iOS implementation.

---

## Score (0–100)

### What it means

The score represents **how well this batter matches up against the opposing
pitcher's arsenal** — specifically, how the batter performs against each
pitch type the pitcher throws, weighted by how often the pitcher uses each
pitch. Higher = batter advantage, lower = pitcher advantage.

| Score range | Meaning |
|---|---|
| 65–100 | Favorable matchup — batter has edge |
| 40–64 | Neutral / mixed |
| 0–39 | Tough matchup — pitcher has edge |

### How the web app computes it (for reference)

The web app computes this client-side from three data sources:

1. **Pitcher arsenal** — which pitches the pitcher throws and at what usage %
   (e.g. 35% Slider, 28% Fastball, 22% Changeup…)
2. **Batter pitch-type splits** — the batter's AVG, whiff rate, and SLG
   against each pitch type (from Baseball Savant)
3. **Handedness** — same-hand matchups (pitcher/batter same side) apply a
   0.92 penalty (slight pitcher advantage)

For each pitch in the arsenal:
```
pitchScore = (avg_score × 0.45) + (whiff_score × 0.35) + (slg_score × 0.20)
```
Then weighted by pitch usage % and normalized to 0–100.

### Recommended iOS approach

The `/api/game/:gamePk/matchups` endpoint already returns a `matchupScore`
per batter-pitcher pairing — this is the simplest way to get scores for the
lineup tab without implementing the computation on iOS.

```
GET /api/game/:gamePk/matchups?limit=9
```

```json
{
  "gamePk": 747056,
  "matchups": [
    {
      "batter":       { "id": 407812, "name": "Dylan Beavers", "position": "RF" },
      "pitcher":      { "id": 641793, "name": "Kyle Bradish" },
      "matchupScore": 58.9,
      "trend":        "up",
      "reason":       "Pitcher allows .847 OPS vs RHH"
    }
  ]
}
```

**Caveat:** The matchups endpoint uses an OPS-based model (pitcher splits vs
batter handedness, blended with career H2H). The web app score uses a
pitch-type model. Both are 0–100 and directionally consistent, but values
won't be identical. If you want pixel-perfect parity with the web app, you'd
need to call the arsenal + batter splits endpoints and implement the formula
client-side — that's probably not worth it.

**Simplest integration:** Call `/matchups?limit=9` for the game, map results
by batter ID, show each batter's `matchupScore` in the row. Batters with no
matchup data (pitcher not posted yet, etc.) show `—` or omit the score.

### Score color coding

Use the same thresholds the web app uses:

| Score | Color |
|---|---|
| ≥ 65 | Green (`#22c55e`) |
| ≥ 45 | Yellow/amber (`#f59e0b`) |
| ≥ 30 | Orange-red (`#ef4444`) |
| < 30 | Gray (`#6b7280`) |

---

## Hot / Cold Tags

### What they mean

The web app compares a batter's **last 7-day batting average** against their
**season batting average**. If there's a meaningful gap (±.035), a badge is shown.

| Condition | Badge |
|---|---|
| L7 avg ≥ season avg + .035 | `▲ HOT` (green) |
| L7 avg ≤ season avg − .035 | `▼ COLD` (red) |
| Otherwise | No badge |

This is a **hitting consistency** signal — it fires when someone is clearly
running hot or cold with the bat overall, not specifically power.

### Data source

The web app fetches this from a batch endpoint:

```
POST /api/players/gamelogs/batch
Body: { "playerIds": [123, 456, ...], "group": "hitting" }
```

The response includes `seasonAvg` and `last7Avg` per player. The client
computes the delta and shows the badge if `|last7Avg - seasonAvg| >= 0.035`.

### Recommended iOS approach — use `recentForm` from the lineup endpoint

The lineup endpoint already returns `recentForm` for each confirmed batter.
You don't need to call the gamelog batch endpoint separately.

```json
{
  "id": 123456,
  "name": "James Wood",
  "recentForm": {
    "hotStreak": true,
    "coldStreak": false,
    "hrLast15": 3,
    "hrPer15AB": 1.2,
    "last15Games": 15
  }
}
```

**`recentForm.hotStreak`** — `true` if the batter hit **2+ home runs in the
last 7 games**. Show `▲ HOT` badge (green).

**`recentForm.coldStreak`** — `true` if the batter hit **0 home runs over the
last 15 games AND is batting under .200** in that stretch. Show `▼ COLD`
badge (red).

Note: The web app's hot/cold definition uses batting average delta; the
backend uses a power/HR definition. They're slightly different signals but
both valid for "is this batter running hot or cold right now." The
`recentForm` fields are already in the lineup response, so **use those**
rather than adding a new API call.

### Swift model (recentForm)

```swift
struct RecentForm: Decodable {
    let hotStreak: Bool
    let coldStreak: Bool
    let hrLast15: Int
    let hrPer15AB: Double?
    let last15Games: Int
}

struct LineupBatter: Decodable {
    let id: Int
    let name: String
    let order: Int?
    let position: String?
    let batSide: String?
    let avg: String?
    let recentForm: RecentForm?    // ← use this for hot/cold badge
    // powerProfile is also present but more complex — ignore for now
}
```

---

## Display summary

```
┌─────────────────────────────────────────────────────┐
│  1  James Wood                          ●●●○○  48.3 │
│     ▼ COLD                                          │
│     DH  ·  LH  ·  .257                             │
└─────────────────────────────────────────────────────┘
```

- **Dots (●●●○○):** last 5 games — hit or no hit. Not currently in lineup
  endpoint; skip for now or use `recentForm.hrLast15` to estimate.
- **Score badge:** from `/api/game/:gamePk/matchups`, mapped by batter ID
- **HOT/COLD badge:** from `recentForm.hotStreak` / `recentForm.coldStreak`
- **Subtitle:** `{position} · {batSide}H · {avg}` — all from lineup endpoint

---

## API calls for lineup tab

| Call | When | Data used |
|---|---|---|
| `GET /api/lineups/:gamePk` | On game tap | `position`, `batSide`, `avg`, `recentForm` |
| `GET /api/game/:gamePk/matchups?limit=9` | On game tap (parallel) | `matchupScore` per batter |

Both calls can fire in parallel. If matchups returns before lineups, hold the
scores and apply them once the lineup loads. If matchups fails, show `—`
for the score — the rest of the row still displays.
