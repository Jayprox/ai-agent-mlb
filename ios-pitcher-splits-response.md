# Backend Response: Pitcher Splits — `/api/pitcher-splits/:pitcherId`

## Status: Done ✅

The endpoint already exists and is mounted. We've updated it to return the
exact shape your `PitcherSplits` Swift model expects.

---

## What changed

The previous implementation scraped Baseball Savant CSV data (which has been
unreliable). It's now been rewritten to use the MLB Stats API `statSplits`
endpoint — the same source that powers the rest of our pitcher stats. More
reliable, same cache TTL (6 hours).

### Response shape (matches your Swift model exactly)

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

- `vsLeft` / `vsRight` — platoon splits vs left and right-handed hitters
- `avg` — opponent batting average (string, e.g. `".268"`)
- `ops` — opponent OPS; derived from `obp + slg` if not directly available
- `k9` — strikeouts per 9 innings (computed from counts + IP)
- `bb9` — walks per 9 innings (computed from counts + IP)
- Any field that can't be computed returns `"—"`

---

## No Swift changes needed

Your model as written is correct and ready to go:

```swift
struct PitcherSplits: Decodable {
    let pitcherId: Int?
    let vsLeft: SplitLine?
    let vsRight: SplitLine?

    struct SplitLine: Decodable {
        let avg: String?
        let ops: String?
        let k9: String?
        let bb9: String?
    }
}
```

---

## Fallback behavior

- If the current season has no data yet (e.g., pitcher is new or injured),
  the endpoint automatically falls back to the previous season.
- If neither season has data, returns HTTP 502 with
  `{ "error": "No platoon splits available", "pitcherId": ... }`.
  Your UI should handle this gracefully (hide the splits block if nil).

---

## Caching

- Cache TTL: 6 hours
- "No data" responses are cached for 30 minutes to avoid hammering the API
- `X-Cache: HIT` / `X-Cache: MISS` header included for debugging

---

## One note on `ops`

The MLB Stats API returns opponent `ops` directly on most pitchers. For a
small number of cases where it's absent, we derive it from `obp + slg`. If
both are missing (very rare), `ops` returns `"—"`. Your UI already handles
optional fields, so no special casing needed.
