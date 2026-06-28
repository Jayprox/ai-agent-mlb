# Backend Response: Top Matchups Endpoint

## Status: Done ✅

**Endpoint:** `GET /api/game/:gamePk/matchups`

Optional query param: `?limit=5` (default 5, max 10)

---

## Response shape

Matches your spec exactly:

```json
{
  "gamePk": 747056,
  "matchups": [
    {
      "batter":       { "id": 407812, "name": "Dylan Beavers", "position": "RF" },
      "pitcher":      { "id": 641793, "name": "Zack Littell" },
      "matchupScore": 68.4,
      "trend":        "up",
      "reason":       "Pitcher allows .847 OPS vs RHH"
    },
    {
      "batter":       { "id": 543558, "name": "Adley Rutschman", "position": "C" },
      "pitcher":      { "id": 641793, "name": "Zack Littell" },
      "matchupScore": 51.0,
      "trend":        "neutral",
      "reason":       null
    }
  ]
}
```

Sorted by `matchupScore` descending. Returns top `limit` matchups across
**both** pitcher–batter pairings (home batters vs away pitcher + away batters
vs home pitcher combined).

---

## Answers to your questions

**1. Score computation**

Three-layer model, all from reliable MLB Stats API data:

- **Layer 1 (always):** Pitcher's OPS-against vs batter's hand (from
  pitcher splits). Normalized: OPS 0.400 → score 0, 0.750 → 50, 1.100+ → 100.
- **Layer 2 (when available):** Career face-off stats for this specific
  batter vs this specific pitcher (MLB Stats API `vsPlayer`). Blended in as
  60% face-off / 40% split when ≥ 5 AB exists.
- **Layer 3:** Recent form adjustment. Hot streak (2+ HR last 7 games) →
  +8 pts. Cold streak (0 HR last 15, avg < .200) → −8 pts. Clamped to 0–100.

**2. Data freshness**

Computed on-demand, cached 5 minutes (matching lineup cache TTL — lineups
can still change up to game time). Career face-off stats cached 24 hours.
No pre-computation needed.

**3. Fallback for no historical data**

Falls back to pitcher's handedness split OPS (score anchored at 50 for
league average). If pitcher splits also unavailable, score defaults to 50
(neutral). The `reason` field will be `null` when there's nothing
significant to say.

**4. Starters only vs all batters**

Returns whichever batters are in the lineup. If the confirmed lineup is
posted, it's the batting order (spots 1–9). If lineups haven't been posted
yet, it falls back to the active roster (non-pitchers). The `note` field
on the response will say `"Lineups not yet posted"` in the fallback case —
you can use this to show a "lineups pending" state in the UI.

---

## Trend logic

| Condition | Trend |
|---|---|
| `hotStreak` (2+ HR last 7 games) | `"up"` |
| `coldStreak` (0 HR last 15, avg < .200) | `"down"` |
| `matchupScore >= 65` | `"up"` |
| `matchupScore <= 30` | `"down"` |
| Otherwise | `"neutral"` |

---

## Reason field

Auto-generated string from the dominant signal. Examples:
- `"3-for-8 career vs Littell (.375 AVG)"` — when career face-off ≥ 5 AB
- `"Pitcher allows .847 OPS vs RHH"` — when pitcher is struggling vs this hand
- `"Pitcher holds LHH to .591 OPS"` — when pitcher is dominant vs this hand
- `"2 HR in last 15 games"` — when hot streak is the primary signal
- `null` — when no single signal is strong enough to surface

---

## Swift model

No changes to your proposed model needed — the response matches your spec.

```swift
struct TopMatchupsResponse: Decodable {
    let gamePk: Int
    let matchups: [Matchup]
    let note: String?           // present when lineups not yet posted

    struct Matchup: Decodable {
        let batter: Player
        let pitcher: Player
        let matchupScore: Double
        let trend: String?      // "up" | "down" | "neutral"
        let reason: String?

        struct Player: Decodable {
            let id: Int
            let name: String
            let position: String?   // only on batter
        }
    }
}
```

---

## Edge cases

- **No probable pitchers posted yet:** Returns `{ matchups: [], note: "No probable pitchers posted" }`. Don't show the section.
- **Lineups not yet posted:** Falls back to roster — scores are less precise since batting order and platoon usage are unknown.
- **502 error:** MLB API unavailable. Hide the section gracefully.
