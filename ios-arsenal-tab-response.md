# Backend Response: Arsenal Tab

## Status: Done ✅

**Endpoint:** `GET /api/arsenal/:pitcherId/vs/:batterId`

All labels, notes, and risk callouts are pre-computed on the backend.
No client-side logic needed.

---

## When to call it

Call this endpoint when the user taps a batter row on the Arsenal tab —
the same moment the pitcher's arsenal is displayed alongside that batter's
performance vs each pitch type.

Both IDs are available from the lineup response (`GET /api/lineups/:gamePk`):
- `pitcherId` — the opposing pitcher's `id` (from game detail / probable pitchers)
- `batterId` — the tapped batter's `id`

---

## Request

```
GET /api/arsenal/:pitcherId/vs/:batterId
```

**Example:**
```
GET /api/arsenal/641793/vs/407812
```

No query params required. Response is cached (6 hours for Savant data).

---

## Response shape

```json
{
  "pitcherId": 641793,
  "batterId": 407812,
  "season": 2026,
  "arsenal": [
    {
      "abbr": "SL",
      "type": "Slider",
      "pct": 29,
      "velo": "88.0",
      "whiffPct": 18,
      "color": "#38bdf8",
      "prevVelo": "87.3",
      "batterAvg": ".198",
      "batterWhiff": "34%",
      "batterSlg": ".371",
      "label": "WEAK SPOT",
      "note": "Severe weakness vs SL — high K exposure",
      "riskNote": "Heavy usage (29%) + weak spot = significant risk"
    },
    {
      "abbr": "FF",
      "type": "4-Seam Fastball",
      "pct": 28,
      "velo": "91.6",
      "whiffPct": 10,
      "color": "#f97316",
      "prevVelo": "92.1",
      "batterAvg": ".341",
      "batterWhiff": "18%",
      "batterSlg": ".695",
      "label": "HANDLES",
      "note": "Solid contact rate vs FF",
      "riskNote": "Heavy usage (28%) + handles well = prop multiplier"
    },
    {
      "abbr": "FS",
      "type": "Splitter",
      "pct": 19,
      "velo": "83.9",
      "whiffPct": 18,
      "color": "#fb7185",
      "prevVelo": null,
      "batterAvg": ".222",
      "batterWhiff": "18%",
      "batterSlg": ".444",
      "label": "NEUTRAL",
      "note": "Average results vs FS",
      "riskNote": null
    }
  ],
  "pitcherStats": {
    "swStrPct": 11.2,
    "oSwingPct": 29.4,
    "fStrikePct": 62.1,
    "barrelPct": 7.8
  }
}
```

---

## Field reference

### Pitcher pitch fields

| Field | Type | Description |
|---|---|---|
| `abbr` | String | Pitch abbreviation: `"SL"`, `"FF"`, `"CH"`, `"SI"`, `"FC"`, `"CU"`, etc. |
| `type` | String | Full pitch name: `"Slider"`, `"4-Seam Fastball"`, `"Changeup"`, etc. |
| `pct` | Int | Usage percentage — how often the pitcher throws this pitch (0–100) |
| `velo` | String? | Average velocity in mph, e.g. `"88.0"`. Null if unavailable. |
| `whiffPct` | Int? | Pitcher's whiff rate on this pitch (% of swings that miss). Null if unavailable. |
| `color` | String | Hex color for the pitch type chip/badge (consistent across the app) |
| `prevVelo` | String? | Prior season average velocity — use to show YoY velocity delta. Null if unavailable. |

### Batter vs pitch fields

| Field | Type | Description |
|---|---|---|
| `batterAvg` | String? | Batter's batting average vs this pitch type, e.g. `".198"`. Null if no data. |
| `batterWhiff` | String? | Batter's whiff rate vs this pitch, e.g. `"34%"`. Null if no data. |
| `batterSlg` | String? | Batter's slugging percentage vs this pitch, e.g. `".371"`. Null if no data. |

### Pre-computed label fields

| Field | Type | Values | Description |
|---|---|---|---|
| `label` | String | `"HANDLES"` `"WEAK SPOT"` `"NEUTRAL"` | Matchup verdict badge for this pitch. |
| `note` | String? | See examples below | One-line description of why. Null if no batter data. |
| `riskNote` | String? | See examples below | Callout shown when a heavy-usage pitch (≥ 25%) is a clear edge. Null otherwise. |

---

## Label logic (for reference — no need to recompute)

**`label`** is determined by the batter's `batterAvg` and `batterWhiff`:

| Condition | Label |
|---|---|
| AVG ≥ .280 AND whiff < 25% | `HANDLES` |
| AVG ≤ .215 OR whiff ≥ 35% | `WEAK SPOT` |
| Otherwise | `NEUTRAL` |

**`note`** examples:
- `"Elite contact vs FF"` — AVG ≥ .300 and whiff < 20%
- `"Solid contact rate vs FF"` — AVG ≥ .280
- `"Severe weakness vs SL — high K exposure"` — AVG ≤ .180 or whiff ≥ 40%
- `"Weak contact vs SL"` — AVG ≤ .215
- `"High whiff rate (34%) — chases out of zone"` — whiff ≥ 30%
- `"Average results vs FS"` — nothing notable

**`riskNote`** appears when `pct ≥ 25` (heavy usage):
- `"Heavy usage (29%) + weak spot = significant risk"` — label is WEAK SPOT
- `"Heavy usage (28%) + handles well = prop multiplier"` — label is HANDLES
- `null` — pitch is NEUTRAL or usage < 25%

---

## Velocity delta (YoY)

Use `velo` and `prevVelo` to show a velocity change badge:

```
delta = parseFloat(velo) - parseFloat(prevVelo)
```

| Delta | Display |
|---|---|
| ≥ +1.5 mph | `▲ +1.5 mph YoY` (green) |
| +0.4 to +1.4 | `▲ +0.7 mph YoY` (green) |
| -0.4 to +0.3 | Hide — no meaningful change |
| -0.4 to -1.4 | `▼ -0.5 mph YoY` (amber) |
| ≤ -1.5 mph | `▼ -1.5 mph YoY` (red) |

Only show the badge if both `velo` and `prevVelo` are non-null and `|delta| ≥ 0.4`.

---

## Pitch color reference

Use `color` from the response for pitch chips. Standard values:

| Abbr | Pitch | Color |
|---|---|---|
| `FF` / `FA` | 4-Seam Fastball | `#f97316` |
| `SI` | Sinker | `#facc15` |
| `FC` | Cutter | `#a78bfa` |
| `SL` | Slider | `#38bdf8` |
| `ST` | Sweeper | `#60a5fa` |
| `CU` | Curveball | `#c084fc` |
| `CH` | Changeup | `#4ade80` |
| `FS` | Splitter | `#fb7185` |

---

## Swift model

```swift
struct ArsenalVsBatterResponse: Decodable {
    let pitcherId: Int
    let batterId: Int
    let season: Int
    let arsenal: [PitchCard]
    let pitcherStats: PitcherStats?

    struct PitchCard: Decodable {
        // Pitcher pitch info
        let abbr: String
        let type: String
        let pct: Int
        let velo: String?
        let whiffPct: Int?
        let color: String
        let prevVelo: String?

        // Batter vs pitch
        let batterAvg: String?
        let batterWhiff: String?
        let batterSlg: String?

        // Pre-computed labels — render directly, no logic needed
        let label: String           // "HANDLES" | "WEAK SPOT" | "NEUTRAL"
        let note: String?
        let riskNote: String?
    }

    struct PitcherStats: Decodable {
        let swStrPct: Double?
        let oSwingPct: Double?
        let fStrikePct: Double?
        let barrelPct: Double?
    }
}
```

---

## Display guidance

Each pitch card should show:

```
┌──────────────────────────────────────────────────┐
│  [SL]  Slider                        WEAK SPOT   │
│        88.0 mph · 29% usage · 18% whiff          │
│        ▼ -0.5 mph YoY  (amber badge)             │
│  ──────────────────────────────────────────────  │
│  [usage bar: 29% width, pitch color]             │
│  ──────────────────────────────────────────────  │
│    .198            34%                           │
│  BATTER AVG     BATTER WHIFF                     │
│                                                  │
│  Severe weakness vs SL — high K exposure         │
│                                                  │
│  ⚠ Heavy usage (29%) + weak spot =              │
│    significant risk                              │
└──────────────────────────────────────────────────┘
```

**Label badge colors:**
- `HANDLES` → green (`#22c55e`)
- `WEAK SPOT` → red (`#ef4444`)
- `NEUTRAL` → amber (`#f59e0b`)

**`riskNote` background:**
- WEAK SPOT risk → red tint background with red text
- Prop multiplier → green tint background with green text

---

## Edge cases

- **No batter split data for a pitch:** `batterAvg`, `batterWhiff`, `batterSlg` are all `null`. `label` is `"NEUTRAL"`, `note` is `null`, `riskNote` is `null`. Show the pitch card with just the pitcher's stats — omit the batter AVG / whiff section.
- **Pitcher with no Savant data:** Returns `502`. Hide the Arsenal tab section gracefully.
- **`prevVelo` is null:** Omit the YoY velocity badge entirely.
- **`pitcherStats` is null:** Omit the pitcher-level stats section.
