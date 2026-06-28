# Backend Response: Pitcher Advanced Stats & Arsenal

## Direct answers to your 5 questions

---

### 1. Advanced stats endpoint

Call the existing **`GET /api/arsenal/:pitcherId`** — all the advanced stats
you need are already computed in the `pitcherStats` block of the response.
No new endpoint needed.

Field mapping:

| iOS field | Lives at | Notes |
|---|---|---|
| `swStr` | `result.pitcherStats.swStrPct` | Number, e.g. `7.3` — format as `"7.3%"` |
| `chase` | `result.pitcherStats.oSwingPct` | Number |
| `fStr` | `result.pitcherStats.fStrikePct` | Number |
| `barrels` | `result.pitcherStats.barrelPct` | Number |
| `xwOBA` | `result.pitcherStats.xwOBAAllowed` | Number, e.g. `0.387` |
| `fbv` | `result.arsenal.find(p => p.abbr === "FF" || p.abbr === "FA")?.velo` | String, e.g. `"94.4"` |
| `hrs` | ❌ Not currently computed | See note below |

**`hrs` (HR%):** Not available at pitch-aggregate level from the current
Statcast CSV parsing. Skipping it avoids significant added complexity — the
other 6 stats cover the same intent. Recommend dropping `hrs` from the
display row, or we can add it in a future pass.

---

### 2. Bar chart percentages

**Compute this client-side** from `ops` in `vsLeft`/`vsRight` — you already
have that data from `/api/pitcher-splits/:pitcherId`.

Suggested thresholds:

```swift
func barChartData(from ops: String?) -> BarChartData? {
    guard let ops = ops, let opsVal = Double(ops) else { return nil }
    let green:  Int
    let yellow: Int
    let red:    Int
    switch opsVal {
    case ..<0.650:  green = 75; yellow = 15; red = 10   // dominant
    case ..<0.750:  green = 55; yellow = 25; red = 20   // good
    case ..<0.850:  green = 35; yellow = 30; red = 35   // average
    default:         green = 15; yellow = 20; red = 65  // struggling
    }
    return BarChartData(green: green, yellow: yellow, red: red)
}
```

This keeps the bar chart reactive to live data without a separate backend
field. If you'd prefer backend-computed values, let us know and we can add
them — but you'd just be recalculating the same formula on our end.

---

### 3. Pitch breakdown table

Already in `result.arsenal[]` from **`GET /api/arsenal/:pitcherId`**.

Field mapping:

| iOS field | Lives at | Notes |
|---|---|---|
| `pitch` | `arsenal[i].type` | e.g. `"4-Seam Fastball"`, `"Slider"` |
| `shortCode` | `arsenal[i].abbr` | e.g. `"FF"`, `"SL"` |
| `count` | ❌ Not currently exposed | See note below — easy to add |
| `k` | ❌ Not tracked per pitch type | See note below |
| `rc` | ❌ Not computable from Statcast CSV | Skip — see note |
| `era` | ❌ Not computable from Statcast CSV | Skip — see note |
| `result` | Derive client-side from `whiffPct` | See note below |
| `whiffPct` | `arsenal[i].whiffPct` | Number — bonus field not in your model |
| `ba` | `arsenal[i].ba` | Batting avg against per pitch type |
| `slg` | `arsenal[i].slg` | Slugging against per pitch type |
| `velo` | `arsenal[i].velo` | Avg velocity for this pitch |

**`count`**: We track this internally but currently only expose it as `pct`
(usage %). Easy to add — let us know if you want it.

**`k` per pitch type**: Possible to add (we'd need to track strikeout events
per pitch type). Moderate effort. Worth adding if the table is high priority.

**`rc` and `era` per pitch type**: Not feasible from Statcast CSV — earned
runs per pitch type would require tracking which pitch led to which run, which
the pitch-level CSV doesn't support cleanly. Skip these.

**`result` (W/L/T)**: Compute client-side from `whiffPct`:
```swift
func pitchResult(whiffPct: Int?) -> String {
    guard let w = whiffPct else { return "—" }
    if w >= 28 { return "W" }
    if w <= 15 { return "L" }
    return "T"
}
```

---

### 4. Sample size filtering

Current minimum: **10 pitches** (filtered in `buildArsenalFromRows`).
For the breakdown table, 10 is fine — low-count pitches indicate the pitcher
is actively using them, even as a rare offering. Showing them gives a more
complete picture. If you want to filter at 25+ for cleaner display, that's
a client-side filter on `pct`.

---

### 5. Canonical pitch types and short codes

From our `PITCH_META` table (used for colors and display names):

| Code | Display Name | Color |
|---|---|---|
| FF / FA | 4-Seam Fastball | Orange |
| SI | Sinker | Yellow |
| FC | Cutter | Purple |
| SL | Slider | Sky blue |
| ST | Sweeper | Blue |
| CU | Curveball | Violet |
| KC | Knuckle-Curve | Pink |
| CH | Changeup | Green |
| FS | Splitter | Rose |
| KN | Knuckleball | Slate |

Any pitch code not in this table falls back to a gray color and uses the
raw code as the display name.

---

## Implementation priority (our recommendation)

**1. Advanced stats line** — Call `/api/arsenal/:pitcherId`, read
`pitcherStats`. All 6 fields (drop `hrs`) are ready today.

**2. Pitch breakdown table** — Call `/api/arsenal/:pitcherId`, read
`arsenal[]`. Map fields above. Compute `result` from `whiffPct` client-side.
Let us know if you want `count` and `k` added to the response.

**3. Bar charts** — Compute client-side from `ops` in platoon splits.
No backend work needed.

---

## Important caveat: data source reliability

Arsenal and advanced stats come from **Baseball Savant** (Statcast CSV).
Savant scraping is occasionally unreliable — we have a known issue tracked
in our backlog. When Savant is down, `/api/arsenal/:pitcherId` returns
HTTP 502. Design your UI to gracefully hide the advanced stats section
rather than showing an error state. The main pitcher card (ERA, WHIP, K/9)
comes from the MLB Stats API and is always reliable.
