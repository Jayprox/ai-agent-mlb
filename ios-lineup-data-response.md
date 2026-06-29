# Backend Response: Lineup Endpoint — position, batSide, avg

## Status: Done ✅

No new endpoint needed. All three fields are now in the existing
`GET /api/lineups/:gamePk` response.

---

## What was happening

Two separate issues:

1. **Field name mismatch** — `position` and `batSide` were already in the
   data but under different names (`pos` and `hand`). The iOS model couldn't
   decode them because the key names didn't match. Fixed by adding `position`
   and `batSide` as additional fields alongside the existing ones.

2. **`avg` was genuinely missing** — We weren't fetching season batting stats
   per batter. Fixed by adding a season stats lookup per batter (cached 24h).

---

## Updated batter shape

```json
{
  "id": 123456,
  "name": "James Wood",
  "order": 1,
  "pos": "OF",           ← existing (web app uses this)
  "position": "OF",      ← NEW (iOS alias)
  "hand": "L",           ← existing (web app uses this)
  "batSide": "L",        ← NEW (iOS alias)
  "avg": ".257",         ← NEW
  "primaryPos": "OF",
  "powerProfile": { ... },
  "recentForm": { ... }
}
```

`position` and `batSide` are exact aliases — same data, different key names.
Both the old keys (`pos`, `hand`) and the new keys (`position`, `batSide`)
are present so the web app is unaffected.

---

## avg details

- Source: MLB Stats API season hitting stats
- Fallback: previous season if current season has fewer than 10 AB
  (handles players early in the season or returning from injury)
- Returns `null` if no season data exists at all
- Format: string with leading period, e.g. `".257"` (not `"0.257"`)
- Cache TTL: 24 hours (season avg is stable intraday)
- Only populated when `confirmed: true` (actual lineup posted). For roster
  fallback lineups (`confirmed: false`), `avg` is `null`.

---

## No Swift changes needed

Your existing model already handles these as optional:

```swift
struct LineupBatter: Decodable {
    let position: String?   // ✅ now populated
    let batSide: String?    // ✅ now populated
    let avg: String?        // ✅ now populated
}
```

---

## Switch handedness display

`batSide` values:
- `"L"` — left-handed batter
- `"R"` — right-handed batter
- `"S"` — switch hitter (bats both sides)
- `null` — unknown (rare, treat as `"R"` for display purposes)
