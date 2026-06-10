# Prop Scout iOS — SIM % Confidence Fix

## Problem

The iOS WHY? modal shows a different SIM % than the web app for the same
player (e.g. iOS shows 79%, web shows 85%). This is because the iOS app is
recomputing the simulation in Swift using Swift's random number generator,
which cannot reproduce the same output as the web app's custom seeded RNG.

**Do not reimplement the simulation in Swift.** The number will never match.

---

## Fix

`simConfidence` is pre-computed server-side when the board snapshot is built.
It is already on every candidate in the `/api/board/snapshot` response.

```swift
// Just read it — do not recompute
let simPct: Int? = candidate.simConfidence
```

Display it as `"\(simPct)% SIM"` next to the OVER/UNDER lean badge.
If `simConfidence` is `nil`, hide the SIM badge entirely.

---

## Why it's pre-computed

When the snapshot is generated, each pitcher candidate runs a 500-iteration
Monte Carlo simulation using a **seeded RNG** keyed to:

```
"\(market):\(playerId):\(gamePk):\(line)"
// e.g. "k:669923:747066:5.5"
```

The seed makes the result **deterministic** — the same player + game + line
always produces the same SIM %. The seeded RNG is a JavaScript-specific
implementation (FNV-1a hash → xorshift) that cannot be ported to Swift without
replicating the exact bit-level arithmetic, which is not worth doing.

---

## Line used to seed (priority order)

The simulation uses the first available line in this order:

1. `candidate.propLine.books.DK.line`
2. `candidate.propLine.books.FD.line`
3. `candidate.propLine.books.CZR.line`
4. `candidate.suggestedLine` (server-computed fallback from avgK3 or k9 × avgIP)

If none of these are available, `simConfidence` will be `null`.

---

## Relevant candidate fields

| Field | Swift type | Description |
|-------|-----------|-------------|
| `simConfidence` | `Int?` | Pre-computed SIM % to display. Use this directly. |
| `lean` | `String?` | `"OVER"` or `"UNDER"` — the direction the SIM favors |
| `suggestedLine` | `Double?` | The fallback line used when no book line exists |
| `propLine` | Object? | Matched prop with per-book lines (DK/FD/CZR) |

---

## BoardCandidate model update

Make sure `simConfidence` is decoded from the snapshot response:

```swift
struct BoardCandidate: Codable {
    // ... existing fields ...
    let simConfidence: Int?   // add this if missing
    let suggestedLine: Double?
}
```

---

## Display

The SIM badge in the web app appears on the card list view (not inside the
WHY? modal). It shows alongside the lean:

```
● OVER   85% SIM
```

Show `simConfidence` only when it is non-nil. There is no need to recompute
or adjust it on the client side.
