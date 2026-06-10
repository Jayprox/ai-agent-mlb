# Prop Scout iOS — WHY? Modal Factor Breakdown

## Overview

The WHY? modal shows a list of scored factors that explain _why_ a candidate
ranked where it did. For **prop markets** (K, Outs, HR, Hits) the factors are
**computed client-side** from the fields already present on the board snapshot
candidate — they are NOT returned by the API. For **game markets** (ML, Spread,
Total, NRFI, F5 ML, F5 RL) the factors ARE pre-computed server-side and live on
`candidate.factors`.

---

## Data source by market type

| Market | Factors source |
|--------|---------------|
| `k`, `outs`, `hr`, `hits` | Compute locally (see below) |
| `ml`, `spread`, `total`, `nrfi`, `f5ml`, `f5spread` | `candidate.factors` from board snapshot |

---

## Shared helper: parsing home team from gameLabel

All prop-market park factor lookups require the home team abbreviation. Parse
it from `candidate.gameLabel`:

```swift
// "PHI @ TOR" → "TOR"
func homeTeamAbbr(from gameLabel: String) -> String? {
    gameLabel.components(separatedBy: " @ ").last
}
```

Then look up `PARK_FACTORS[abbr] ?? NEUTRAL_PARK`.

---

## Park Factors table (embed as static constant)

```swift
struct ParkFactor {
    let hr: Double
    let hit: Double
    let k: Double
    let label: String
}

let NEUTRAL_PARK = ParkFactor(hr: 1.0, hit: 1.0, k: 1.0, label: "Neutral")

let PARK_FACTORS: [String: ParkFactor] = [
    "COL": ParkFactor(hr: 1.35, hit: 1.15, k: 0.93, label: "Hitter Haven"),
    "CIN": ParkFactor(hr: 1.15, hit: 1.05, k: 0.97, label: "Hitter-Friendly"),
    "PHI": ParkFactor(hr: 1.10, hit: 1.04, k: 0.98, label: "Hitter-Friendly"),
    "BOS": ParkFactor(hr: 1.08, hit: 1.09, k: 0.97, label: "Hitter-Friendly"),
    "TEX": ParkFactor(hr: 1.08, hit: 1.03, k: 0.98, label: "Hitter-Friendly"),
    "BAL": ParkFactor(hr: 1.07, hit: 1.03, k: 0.99, label: "Hitter-Friendly"),
    "CHC": ParkFactor(hr: 1.04, hit: 1.02, k: 0.99, label: "Neutral (wind-variable)"),
    "NYY": ParkFactor(hr: 1.05, hit: 1.01, k: 1.00, label: "Slight Hitter"),
    "TOR": ParkFactor(hr: 1.03, hit: 1.02, k: 1.00, label: "Slight Hitter"),
    "ARI": ParkFactor(hr: 1.02, hit: 1.01, k: 0.99, label: "Slight Hitter"),
    "ATL": ParkFactor(hr: 1.02, hit: 1.01, k: 1.00, label: "Neutral"),
    "DET": ParkFactor(hr: 1.01, hit: 1.00, k: 1.00, label: "Neutral"),
    "MIL": ParkFactor(hr: 1.00, hit: 1.01, k: 1.00, label: "Neutral"),
    "CHW": ParkFactor(hr: 1.00, hit: 1.00, k: 1.00, label: "Neutral"),
    "STL": ParkFactor(hr: 0.98, hit: 0.99, k: 1.01, label: "Slight Pitcher"),
    "WSH": ParkFactor(hr: 0.98, hit: 0.99, k: 1.00, label: "Slight Pitcher"),
    "MIN": ParkFactor(hr: 0.97, hit: 0.99, k: 1.01, label: "Slight Pitcher"),
    "CLE": ParkFactor(hr: 0.97, hit: 0.99, k: 1.00, label: "Slight Pitcher"),
    "PIT": ParkFactor(hr: 0.96, hit: 0.98, k: 1.01, label: "Pitcher-Friendly"),
    "NYM": ParkFactor(hr: 0.96, hit: 0.98, k: 1.01, label: "Pitcher-Friendly"),
    "LAA": ParkFactor(hr: 0.96, hit: 0.98, k: 1.01, label: "Pitcher-Friendly"),
    "HOU": ParkFactor(hr: 0.95, hit: 0.99, k: 1.01, label: "Pitcher-Friendly"),
    "MIA": ParkFactor(hr: 0.94, hit: 0.98, k: 1.02, label: "Pitcher-Friendly"),
    "TB":  ParkFactor(hr: 0.94, hit: 0.97, k: 1.02, label: "Pitcher-Friendly"),
    "OAK": ParkFactor(hr: 0.93, hit: 0.97, k: 1.01, label: "Pitcher-Friendly"),
    "LAD": ParkFactor(hr: 0.93, hit: 0.97, k: 1.02, label: "Pitcher-Friendly"),
    "KC":  ParkFactor(hr: 0.91, hit: 0.98, k: 1.01, label: "Pitcher-Friendly"),
    "SEA": ParkFactor(hr: 0.90, hit: 0.97, k: 1.02, label: "Pitcher-Friendly"),
    "SD":  ParkFactor(hr: 0.87, hit: 0.96, k: 1.03, label: "Pitcher Haven"),
    "SF":  ParkFactor(hr: 0.83, hit: 0.96, k: 1.03, label: "Pitcher Haven"),
]
```

---

## Factor model

Each factor row in the modal has these fields:

```swift
struct WhyFactor {
    let label: String
    let value: String
    let detail: String
    let pts: Int
    let max: Int
}
```

---

## K props — 5 factors

Candidate fields used: `k9`, `avgK3`, `umpire`, `umpireRating`, `whip`, `gameLabel`

### 1. K/9
- **Field:** `candidate.k9` (String → parse Double)
- **Max:** 30

| Threshold | pts | detail |
|-----------|-----|--------|
| ≥ 10.0 | +30 | "Elite swing-and-miss (≥10)" |
| ≥ 9.0  | +22 | "Very good (≥9)" |
| ≥ 8.0  | +14 | "Above avg (≥8)" |
| ≥ 7.0  |  +7 | "Solid (≥7)" |
| < 7.0  |   0 | "Below avg" |

- **value display:** `candidate.k9` (raw string, e.g. `"10.74"`)

### 2. L3 avg K
- **Field:** `candidate.avgK3` (Double?)
- **Max:** 22

| Threshold | pts | detail |
|-----------|-----|--------|
| ≥ 7 | +22 | "Strong recent K production" |
| ≥ 6 | +16 | "Good recent production" |
| ≥ 5 | +10 | "Average production" |
| ≥ 4 |  +5 | "Modest production" |
| < 4 |   0 | "Low recent production" |

- **value display:** `"\(avgK3)K/start"`

### 3. Park (K factor)
- **Field:** `PARK_FACTORS[homeTeam].k`
- **Max:** 18
- **Formula:** `pts = Int((pf.k - 1.0) * 90).rounded()`

| Condition | detail |
|-----------|--------|
| `pf.k >= 1.05` | "K-friendly park (+X%)" |
| `pf.k <= 0.95` | "K-suppressing (-X%)" |
| else | "Neutral park" |

- **value display:** home team abbr (e.g. `"TOR"`)

### 4. Umpire
- **Fields:** `candidate.umpireRating` (String?), `candidate.umpire` (String?)
- **Max:** 15

| umpireRating | pts | detail |
|---|---|---|
| `"pitcher"` | +15 | "Tight zone — historically boosts K rates" |
| `"neutral"` | +8 | "Average zone" |
| `nil` (no umpire assigned) | +8 | "Not yet assigned" |
| `"hitter"` | +3 | "Wide zone — suppresses Ks" |

- **value display:** `candidate.umpire ?? "TBD"`

### 5. WHIP
- **Field:** `candidate.whip` (String → parse Double)
- **Max:** 10

| Threshold | pts | detail |
|-----------|-----|--------|
| ≤ 1.05 | +10 | "Elite control — stays in games" |
| ≤ 1.20 |  +6 | "Good control" |
| ≤ 1.35 |  +2 | "Average control" |
| > 1.35 |   0 | "Elevated baserunners — risk of early hook" |

- **value display:** `candidate.whip` (raw string, e.g. `"1.09"`)

---

## Outs props — 4 factors

Candidate fields used: `avgIP`, `whip`, `era`, `gameLabel`

### 1. Avg IP (recent)
- **Field:** `candidate.avgIP` (String, e.g. `"6.1"` means 6⅓ IP)
- **Max:** 35
- **Parsing:** `"6.1"` → 6 + 1/3 = 6.333 IP (baseball notation — tenths are outs, not decimals)

| IP threshold | pts | detail |
|---|---|---|
| ≥ 6.5 | +35 | "Goes deep — 6.5+ IP avg" |
| ≥ 6.0 | +26 | "Quality starts — 6+ IP avg" |
| ≥ 5.5 | +17 | "Solid depth — 5.5+ IP avg" |
| ≥ 5.0 |  +8 | "Average depth — ~5 IP" |
| < 5.0 |   0 | "Short outings — risky for outs props" |

- **value display:** `"\(avgIP) IP/start"`

### 2. WHIP (control)
- **Field:** `candidate.whip` (String → parse Double)
- **Max:** 28

| Threshold | pts | detail |
|---|---|---|
| ≤ 1.00 | +28 | "Elite control — extends outings" |
| ≤ 1.10 | +20 | "Very good control" |
| ≤ 1.20 | +12 | "Good control" |
| ≤ 1.35 |  +5 | "Average control" |
| > 1.35 |   0 | "Elevated baserunners — pitch count climbs fast" |

### 3. ERA (season)
- **Field:** `candidate.era` (String → parse Double)
- **Max:** 12

| Threshold | pts | detail |
|---|---|---|
| ≤ 3.0 | +10 | "Elite — limiting runs, keeps manager trust" |
| ≤ 3.5 |  +7 | "Very good" |
| ≤ 4.5 |  +3 | "Average — occasional rough starts" |
| > 4.5 |   0 | "Struggling — early exits more likely" |

### 4. Park (hit suppression)
- **Field:** `PARK_FACTORS[homeTeam].hit`
- **Max:** 10
- **Formula:** `pts = Int((1.0 - pf.hit) * 50).rounded()`

| Condition | detail |
|---|---|
| `pf.hit <= 0.95` | "Pitcher-friendly — suppresses hits" |
| `pf.hit >= 1.08` | "Hitter-friendly — pitch count rises, risk of early exit" |
| else | "Neutral park" |

---

## HR props — 4–5 factors

Candidate fields used: `slg`, `ops`, `hr`, `windFav`, `order`, `gameLabel`

### 1. Power (SLG)
- **Fields:** `candidate.slg` (String → parse Double), `candidate.ops` (String → parse Double)
- **Max:** 20, **Min:** −12
- **Formula:** prefer SLG if > 0: `pts = Int((slg - 0.410) * 55).clamped(-12, 20)`; else `Int((ops - 0.720) * 20).clamped(-12, 20)`

| SLG threshold | detail |
|---|---|
| ≥ 0.500 | "Power hitter (.500+ SLG)" |
| ≥ 0.440 | "Above-avg power (.440+)" |
| ≥ 0.380 | "Average power" |
| < 0.380 | "Below-avg power — few extra-base hits" |

- **value display:** SLG available → `"\(slg) SLG"`, else `"\(ops) OPS"`

### 2. HR pace
- **Field:** `candidate.hr` (Int or String → parse Int)
- **Max:** 15
- **Formula:** `pts = Int(hr * 0.7)`

| HR | detail |
|---|---|
| ≥ 20 | "High HR pace — proven power" |
| ≥ 10 | "Moderate HR pace" |
| ≥ 5  | "Low HR pace" |
| < 5  | "Very few HRs this season" |

- **value display:** `"\(hr) HR this season"`

### 3. Park (HR factor)
- **Field:** `PARK_FACTORS[homeTeam].hr`
- **Max:** 10
- **Formula:** `pts = Int((pf.hr - 1.0) * 35).rounded()`

| Condition | detail |
|---|---|
| `pf.hr >= 1.10` | "HR-friendly (+X%)" |
| `pf.hr <= 0.90` | "HR-suppressing (-X%)" |
| else | "Neutral park for HRs" |

### 4. Wind _(conditional — only shown when true)_
- **Field:** `candidate.windFav` (Bool)
- Only add this factor when `windFav == true`
- **pts:** +8, **max:** 8
- **value display:** `"Blowing out"`
- **detail:** `"Wind out to CF/RF — historically adds 5–8% to HR rates"`

### 5. Batting order
- **Field:** `candidate.order` (Int)
- **Max:** 6

| Order | pts | detail |
|---|---|---|
| ≤ 3 | +6 | "Premium spot — most PA, best lineup protection" |
| ≤ 5 | +3 | "Middle of order" |
| ≥ 8 | −4 | "Bottom of order — fewer PA" |
| else | 0 | "Lower-middle order" |

- **value display:** `"#\(order)"`

---

## Hits props — 4 factors

Candidate fields used: `avg`, `ops`, `hitRate`, `order`, `gameLabel`

### 1. Season AVG
- **Fields:** `candidate.avg` (String → parse Double), `candidate.ops`
- **Max:** 20, **Min:** −12
- **Formula:** prefer AVG if > 0: `pts = Int((avg - 0.250) * 140).clamped(-12, 20)`; else `Int((ops - 0.720) * 15).clamped(-12, 20)`

| AVG threshold | detail |
|---|---|
| ≥ 0.300 | "Excellent contact hitter (.300+)" |
| ≥ 0.270 | "Good hitter (.270+)" |
| ≥ 0.240 | "Average (.240+)" |
| < 0.240 | "Struggling — below .240" |

- **value display:** AVG available → `"\(avg) AVG"`, else `"\(ops) OPS"`

### 2. Recent form (L5)
- **Field:** `candidate.hitRate` (array of Int: 1 = hit, 0 = no hit) — take first 5 elements
- **Max:** 8
- **Formula:** `l5 = hitRate.prefix(5).reduce(0, +); pts = Int((Double(l5)/5.0 - 0.40) * 28)`

| l5 | detail |
|---|---|
| ≥ 4 | "Hot — on a tear recently" |
| ≥ 3 | "Consistent — hitting in most games" |
| ≥ 2 | "Mixed — some cold games" |
| < 2 | "Cold — struggling to get on base" |

- **value display:** `"\(l5)/5 games with a hit"`

### 3. Park (hit factor)
- **Field:** `PARK_FACTORS[homeTeam].hit`
- **Max:** 8
- **Formula:** `pts = Int((pf.hit - 1.0) * 28).rounded()`

| Condition | detail |
|---|---|
| `pf.hit >= 1.08` | "Hitter-friendly (+X%)" |
| `pf.hit <= 0.93` | "Pitcher-friendly (-X%)" |
| else | "Neutral park for hits" |

### 4. Batting order
- Same logic as HR props batting order factor above.

---

## Game markets (ML, Spread, Total, NRFI, F5 ML, F5 RL)

For these markets, factors come directly from the board snapshot:

```swift
let factors: [WhyFactor] = candidate.factors ?? []
```

The `factors` array is already in the same `{ label, value, detail, pts, max }` shape — no client-side computation needed.

---

## Notes

- All score computations in `kBoardScore` / `outsBoardScore` (backend) use slightly different thresholds than `generateWhyFactors` (frontend display). The **WHY? modal uses the frontend thresholds above** — do not use the backend scoring function values for display.
- Park factor percentages in detail strings: `((pf.k - 1.0) * 100).rounded()` formatted as `"+2%"` or `"-7%"`.
- Score bar in the modal shows `candidate.score / 100` as a filled progress bar (0–95 range in practice).
