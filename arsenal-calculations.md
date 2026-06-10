# Prop Scout iOS — Arsenal Tab Stat Calculations

## Overview

The Arsenal tab shows per-pitch-type stats (Batter AVG, Batter Whiff %, SLG,
velocity, usage %) computed from **raw pitch-by-pitch Statcast CSV data**
from Baseball Savant. The stats are aggregated manually — they are NOT the
pre-calculated values from Savant's summary endpoints.

If the iOS app is using a different Savant endpoint or computing formulas
differently, the numbers will not match the web app.

---

## Data source

**Endpoint:**
```
GET https://baseballsavant.mlb.com/statcast_search/csv
  ?hfGT=R|
  &hfSea={year}|
  &player_type=pitcher
  &pitchers_lookup[]={pitcherId}
  &group_by=pitch-type
  &sort_col=pitches
  &sort_order=desc
  &min_pitches=0
  &min_results=0
  &type=details
  &player_id={pitcherId}
```

This returns **one row per pitch** (not aggregated). Each row has fields
including `pitch_type`, `description`, `events`, `release_speed`,
`woba_denom`, `stand`, etc.

The web app then aggregates these rows manually by pitch type.

---

## Per-pitch-type aggregation

For each pitch type (FF, CH, SI, SL, etc.), iterate every row where
`pitch_type == abbr`:

### Counting swings and whiffs

```
description field values:

SWING (counts toward swing total):
  "swinging_strike"
  "swinging_strike_blocked"
  "foul"
  "foul_bunt"
  "missed_bunt"
  "hit_into_play"
  "foul_tip"

WHIFF (subset of swings):
  "swinging_strike"
  "swinging_strike_blocked"
  "missed_bunt"
```

Use `description.toLowerCase().includes(value)` for matching.

### Counting at-bats and hits

Only rows where `events` is a plate-appearance-ending event count as an AB:

```
HITS (count as both hit and AB):
  "single"    → +1 hit, +1 AB, +1 total base
  "double"    → +1 hit, +1 AB, +2 total bases
  "triple"    → +1 hit, +1 AB, +3 total bases
  "home_run"  → +1 hit, +1 AB, +4 total bases

OUTS (count as AB only, no hit):
  "field_out"
  "strikeout"
  "grounded_into_double_play"
  "force_out"
  "double_play"
  "fielders_choice"
  "fielders_choice_out"
  "strikeout_double_play"
  "other_out"
  "triple_play"

EXCLUDED (walks, HBP, sac flies, etc. — do NOT count as AB):
  Everything else
```

### Velocity

Average of `release_speed` (or `effective_speed` if missing) for pitches
where the value is > 60 mph.

### Usage %

```
pct = round((pitches_of_this_type / total_pitches_all_types) * 100)
```

Exclude `pitch_type == "PO"` (pitch out) from all counts.

---

## Computed fields per pitch type

| Display name | Field | Formula |
|---|---|---|
| Batter AVG | `ba` | `hits / ab` formatted to 3 decimal places |
| Batter Whiff % | `whiffPct` | `round(whiffs / swings * 100)` — whiffs divided by **swings**, NOT total pitches |
| SLG | `slg` | `total_bases / ab` formatted to 3 decimal places |
| Velocity | `velo` | avg `release_speed` for pitches > 60 mph, 1 decimal |
| Usage % | `pct` | `round(pitches / total_pitches * 100)` |
| Prev year velo | `prevVelo` | same velocity calc run against prior season data |

**Critical note on Whiff %:** the formula is `whiffs / swings`, not
`whiffs / total_pitches`. This is the standard "whiff rate on swings" used
by Savant. Using total pitches as the denominator will produce a much lower
number and will not match.

---

## Pitch type filter

Only include pitch types with **≥ 10 pitches** in the dataset.
Exclude `pitch_type == "PO"` entirely.

Sort results by usage % descending.

---

## Overall pitcher stats (used for board scoring, not displayed per-pitch)

These are computed across all pitch types combined:

| Field | Formula |
|---|---|
| `swStrPct` | `round(total_whiffs / total_pitches * 1000) / 10` |
| `oSwingPct` | Chase rate: `outside_swings / outside_pitches` (zones 11–14) |
| `fStrikePct` | First-pitch strike rate: `first_pitch_strikes / first_pitches` |
| `barrelPct` | `barrels / batted_balls` using `launch_speed_angle == 6` |
| `hardHitPct` | `hard_hits / batted_balls` where `launch_speed >= 95` |
| `xwOBAAllowed` | `sum(estimated_woba_using_speedangle) / woba_denom` where `woba_denom == 1` |

---

## Caching

The web app caches arsenal data two ways:
1. **In-memory cache:** TTL 6 hours, keyed `arsenal:pitcher:{pitcherId}:{year}`
2. **DB cache:** `pitcher_savant_snapshots` table, keyed by `player_id` +
   `slate_date`

On cache miss, it tries the current season first, then falls back to the
previous season if no rows are returned.

The iOS app should cache arsenal responses per pitcher per day — Savant is
slow (~2–5s) and should not be called repeatedly.

---

## API endpoint

The iOS app does not need to call Savant directly. Use the backend route:

```
GET /api/arsenal/{pitcherId}
```

Returns:
```json
{
  "pitcherId": 669923,
  "season": 2025,
  "source": "statcast_csv",
  "arsenal": [
    {
      "abbr": "FF",
      "type": "4-Seam Fastball",
      "pct": 42,
      "velo": "93.1",
      "prevVelo": 92.4,
      "whiffPct": 19,
      "ba": "0.341",
      "slg": "0.512",
      "color": "#f97316"
    }
  ],
  "pitcherStats": {
    "swStrPct": 11.2,
    "oSwingPct": 32.4,
    "fStrikePct": 62.1,
    "barrelPct": 7.1,
    "hardHitPct": 38.2,
    "xwOBAAllowed": 0.298,
    "vsLeft": { "barrelPct": 6.1, "hardHitPct": 36.0, "flyBallPct": 28.0, "hrAllowed": 3 },
    "vsRight": { "barrelPct": 8.2, "hardHitPct": 40.1, "flyBallPct": 31.0, "hrAllowed": 5 }
  }
}
```

The `arsenal` array is already sorted by usage % descending and filtered to
≥ 10 pitches. The iOS app should display it as-is — do not recompute stats
from a separate Savant call.

---

## Lineup matchup overlay ("vs SEA LINEUP")

The web app overlays batter-side stats on top of the pitcher's arsenal when
a lineup is available. These come from a separate `GET /api/arsenal/:pitcherId`
call combined with lineup data — the `ba`, `whiffPct`, and `slg` shown in
the Arsenal tab when a lineup is selected represent that pitcher's stats
**against the facing lineup's batters specifically** (filtered by batter
handedness using the `stand` column from the Savant rows).

If the iOS app is showing different numbers when a lineup is selected vs. not,
it may be mixing the overall pitch-type stats with the batter-filtered stats.
The headline stats (`ba`, `whiffPct`, `slg` on each pitch card) should always
be the **overall season stats for that pitch type** — the lineup context is
shown as a secondary overlay, not a replacement.
