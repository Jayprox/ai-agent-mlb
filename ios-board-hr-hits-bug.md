# iOS Bug — Board HR/Hits tabs show "No board data yet"

## Symptom

On the Board tab, the **K** and **Outs** sub-tabs populate normally, but
**HR** and **Hits** show "No board data yet" — even on dates where the web
app (using the same `/api/board/snapshot?date=YYYY-MM-DD` endpoint) shows
populated cards for both markets.

## Root cause (most likely)

`GET /api/board/snapshot` returns one candidate object per market under keys
`hr`, `hits`, `k`, `outs`, etc. Each HR/Hits candidate includes an `order`
field — the batter's lineup spot (1–9).

For games where the lineup hasn't been officially posted yet, the backend
falls back to a roster-based candidate list. Those candidates have:

```json
{
  "lineupState": "roster",
  "stats": {
    "order": null,
    ...
  }
}
```

This is the **"LINEUP TBD"** state you may have seen on the web app — the
candidate is still real and scored, just without a confirmed batting-order
slot.

K and Outs candidates (pitcher-based) **never have an `order` field at all**,
so this never affects them.

### Why this breaks the whole array

If the Swift model for the board `stats` payload declares `order` as a
non-optional `Int` (e.g. `let order: Int`), then `JSONDecoder` will throw a
`DecodingError` on any roster-based HR/Hits candidate (`"order": null`).
Because Swift decodes arrays all-or-nothing, **a single bad element fails
decoding for the entire `hr` and/or `hits` array** — and whatever
error-handling wraps that decode likely falls back to an empty array, which
renders as "No board data yet."

This explains:
- Why K/Outs are fine (no `order` field to choke on).
- Why it's intermittent — on slates where every game's lineup is confirmed
  by the time you load the Board tab, `order` is always a real `Int` and
  decoding succeeds.

## What to check / fix

1. Find the Swift struct used to decode the `stats` object for `hr`/`hits`
   board candidates (likely shared with `k`/`outs` stats, or a
   `BoardCandidateStats` type).
2. Change `order` to `Int?` (optional).
3. Handle `nil` in the UI — e.g. hide the lineup-order badge, or show "TBD"
   when `order == nil` (matches `lineupState == "roster"` / "LINEUP TBD" on
   the candidate itself).
4. While auditing, it's worth temporarily switching `try?` → `try` (or
   logging the thrown `DecodingError`) around the `hr`/`hits` decode to
   confirm this is in fact the failing field — other batter-only fields
   (`avg`, `slg`, `ops`, `hitRate`, `windFav`, `matchup.batterVsHand`,
   `matchup.batterVsPitches`) are also worth a quick type check against the
   snapshot response if `order` turns out not to be it.

## Reference: full HR/Hits candidate shape

```json
{
  "id": "id:gamePk",
  "entityId": 12345,
  "market": "hits",
  "playerName": "Jung Hoo Lee",
  "team": "SF",
  "gameLabel": "SF @ LAD",
  "gamePk": 776543,
  "gameTime": "2026-06-10T19:10:00Z",
  "score": 62,
  "simConfidence": 58,
  "bookLine": 1.5,
  "lean": "OVER",
  "bookOdds": -120,
  "impliedProb": 0.55,
  "edge": 0.03,
  "stats": {
    "avg": ".301",
    "ops": ".845",
    "parkFactor": 1.02,
    "order": null,
    "l5": 3,
    "platoonAVG": null
  },
  "_candidate": { "lineupState": "roster", "...": "full internal candidate" }
}
```

`order: null` and `lineupState: "roster"` go together — these are the
"LINEUP TBD" candidates.
