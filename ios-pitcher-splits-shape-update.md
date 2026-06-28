# iOS Update Required: Pitcher Splits Response Shape Changed

## What happened

The `/api/pitcher-splits/:pitcherId` endpoint has been rewritten to use the
MLB Stats API instead of Baseball Savant (which was unreliable). The response
shape now matches the spec from your `PITCHER_SPLITS_IMPLEMENTATION.md` —
but the **old fields are gone**. If you're currently displaying platoon splits
using the old response, you'll need to update to the new field names.

---

## Field changes

| Old field | New field | Notes |
|---|---|---|
| `vsL` | `vsLeft` | Same data, renamed |
| `vsR` | `vsRight` | Same data, renamed |
| `d.kPct` | `d.k9` | Strikeouts per 9 innings (e.g. `"9.2"`) |
| `d.bbPct` | `d.bb9` | Walks per 9 innings (e.g. `"2.1"`) |
| `d.pa` | *(removed)* | No longer returned |
| *(new)* | `d.ops` | Opponent OPS (e.g. `".724"`), string |
| `d.avg` | `d.avg` | Unchanged |

`vsL` / `vsR` are still included as aliases for now, but will be removed
in a future cleanup. Migrate to `vsLeft` / `vsRight`.

---

## New response shape

```json
{
  "pitcherId": 592789,
  "season": 2026,
  "vsLeft": {
    "avg": ".268",
    "ops": ".724",
    "k9": "9.2",
    "bb9": "2.1"
  },
  "vsRight": {
    "avg": ".245",
    "ops": ".681",
    "k9": "8.8",
    "bb9": "1.9"
  }
}
```

This matches the `PitcherSplits` / `SplitLine` model from your implementation
doc exactly — no Swift model changes needed if you've already added those
fields. Just remove any references to `kPct`, `bbPct`, or `pa`.

---

## If you haven't migrated your Swift model yet

```swift
struct PitcherSplits: Decodable {
    let pitcherId: Int?
    let vsLeft: SplitLine?    // ← was vsL
    let vsRight: SplitLine?   // ← was vsR

    struct SplitLine: Decodable {
        let avg: String?
        let ops: String?      // ← NEW
        let k9: String?       // ← replaces kPct
        let bb9: String?      // ← replaces bbPct
        // remove: kPct, bbPct, pa
    }
}
```

---

## Fallback / null handling

- Any field that can't be computed returns the string `"—"` (em dash),
  not `null`. Your display can check `value == "—"` to hide a stat.
- If the entire split is unavailable, `vsLeft` or `vsRight` will be `null`.
- HTTP 502 means no data exists for that pitcher (small sample / new pitcher).
  Hide the splits block rather than showing an error.
