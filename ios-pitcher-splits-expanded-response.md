# Backend Response: Pitcher Splits Expanded (Home/Away + Day/Night)

## Status: Done ✅

All four new split types are now included in the existing endpoint. No new
endpoint needed — same URL, richer response.

**Endpoint:** `GET /api/pitcher-splits/:pitcherId`

---

## Updated response shape

```json
{
  "pitcherId": 641793,
  "season": 2026,

  "vsLeft": {
    "avg": ".301",
    "ops": ".998",
    "k9": "4.3",
    "bb9": "3.2"
  },
  "vsRight": {
    "avg": ".231",
    "ops": ".663",
    "k9": "6.9",
    "bb9": "2.3"
  },

  "home": {
    "era": "6.15",
    "whip": "1.43",
    "ip": "45.1",
    "k9": "4.2",
    "bb9": "3.1"
  },
  "away": {
    "era": "5.82",
    "whip": "1.38",
    "ip": "39.0",
    "k9": "4.8",
    "bb9": "2.9"
  },

  "dayGame": {
    "era": "4.08",
    "whip": "1.23",
    "ip": "28.2",
    "k9": "3.8",
    "bb9": "2.9"
  },
  "nightGame": {
    "era": "6.22",
    "whip": "1.51",
    "ip": "46.1",
    "k9": "4.4",
    "bb9": "3.2"
  }
}
```

All values are strings. `"—"` is returned for any stat that can't be
computed. A split object is `null` (not an object with `"—"` values) if
the pitcher has fewer than 5 IP in that context — hide the section rather
than showing zeroes.

---

## Answers to your backend questions

**1. Can you add home/away/dayGame/nightGame?** Yes, done. Same endpoint.

**2. What stats do these contain?** ERA, WHIP, IP, K/9, BB/9 — exactly as
requested. All are strings.

**3. How are they calculated?** Season-to-date via the MLB Stats API
`statSplits` endpoint. Same source as the platoon splits. These are official
MLB-computed splits, not derived on our end.

**4. Fallback for no data?** If a pitcher has < 5 IP in a given context
(e.g., a starter who hasn't pitched a day game yet), that split object is
`null`. Hide the section entirely rather than showing `"—"` across the board.

---

## Swift model update

Your proposed model is correct. One note on `CodingKeys`: your current
mapping uses `vsLeft = "vsL"` which maps to our backward-compat alias — that
works fine and you can leave it as-is. Or update to `vsLeft = "vsLeft"` to
use the primary key directly. Either will decode correctly.

```swift
struct PitcherSplits: Decodable {
    let pitcherId: Int?
    let season: Int?

    let vsLeft: SplitLine?
    let vsRight: SplitLine?

    let home: GameSiteSplits?
    let away: GameSiteSplits?
    let dayGame: GameSiteSplits?
    let nightGame: GameSiteSplits?

    struct SplitLine: Decodable {
        let avg: String?
        let ops: String?
        let k9: String?
        let bb9: String?
    }

    struct GameSiteSplits: Decodable {
        let era: String?
        let whip: String?
        let ip: String?
        let k9: String?
        let bb9: String?
    }

    enum CodingKeys: String, CodingKey {
        case pitcherId, season
        case vsLeft = "vsL"    // ← works as-is (backward-compat alias)
        case vsRight = "vsR"   // ← works as-is
        case home, away, dayGame, nightGame
    }
}
```

---

## No web app impact

Home/away/day/night splits are new fields. The web app currently only reads
`vsL`/`vsR` from this endpoint — the new fields are additive and ignored.
