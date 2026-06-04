# CODEX TASK 141 — Regression Tests: TabHitBadge Data Pipeline

## Goal

Add Vitest unit tests that cover the full data pipeline behind the tab hit-count
badge (the "8/20 hit" counter on the HR / Hits / K / Outs board tabs).

Two bugs were recently fixed in `prop-scout-v7.jsx`:

1. **`lookupBoardResult` composite-ID bug** — batter snapshot cards whose `id`
   is a composite string like `"hr:592450:745461"` were not matching entries in
   `liveBoardResults`, which is keyed by plain numeric player ID. Fix: prefer
   `item.entityId` over `item.id`; also split composite IDs as a last resort.

2. **`lockedCandidatesForType` snapshot-fallback bug** — when the daily
   snapshot is loaded (`useSharedBoard = true`) but a specific market (e.g.
   `"hr"`) has no snapshot key, `getBoardMarketSnapshot("hr")` returns `null`
   and the call `null ?? []` silently produced an empty array — causing the
   badge to disappear even though live-computed candidates were visible on the
   board. Fix: `lockedCandidatesForType` now reads from `boardCandidatesByType`
   (which already handles the snapshot-or-live fallback) instead of calling
   `getBoardMarketSnapshot` directly.

The tests should live in **`src/utils.test.js`** (for pure-function helpers)
and a new file **`src/board/tabHitBadge.test.js`** (for the lookup and outcome
helper logic, tested as plain JS functions extracted/replicated in the test).

---

## What to test

### 1. `summarizeOutcomes` (already in `src/utils.test.js` — ADD new cases)

Add to the existing `describe("summarizeOutcomes")` block:

| Case | Expected |
|------|----------|
| All outcomes `false` (all resolved but none hit) | `{ hits: 0, total: N, resolved: N }` — NOT null |
| Mix of `true`, `false`, `null` | counts only non-null in resolved; `hits` = count of `true` |
| Single item, `true` outcome | `{ hits: 1, total: 1, resolved: 1 }` |
| Single item, `false` outcome | `{ hits: 0, total: 1, resolved: 1 }` |

These guard against a regression where an all-miss board tab returns null
instead of showing "0/N hit".

---

### 2. `lookupBoardResult` logic — new file `src/board/tabHitBadge.test.js`

Extract the lookup logic as a pure function and test it directly. The function
signature to replicate in the test file:

```js
function lookupBoardResult(item, liveBoardResults) {
  const rawId = item?.entityId ?? item?.id ?? item?.playerId;
  if (rawId == null || rawId === "") return null;
  const direct = liveBoardResults[rawId]
    ?? liveBoardResults[String(rawId)]
    ?? liveBoardResults[Number(rawId)]
    ?? null;
  if (direct) return direct;
  if (typeof rawId === "string" && rawId.includes(":")) {
    const parts = rawId.split(":");
    const extractedId = parts[1];
    return liveBoardResults[extractedId]
      ?? liveBoardResults[Number(extractedId)]
      ?? null;
  }
  return null;
}
```

Test cases:

| Scenario | item | liveBoardResults | Expected |
|----------|------|-----------------|----------|
| Plain numeric id matches | `{ id: 592450 }` | `{ "592450": { ab:3, h:1, hr:0 } }` | result object |
| Plain string id matches | `{ id: "592450" }` | `{ "592450": { ab:2, h:0, hr:0 } }` | result object |
| `entityId` takes priority over `id` | `{ entityId: 592450, id: "hr:592450:745461" }` | `{ "592450": { ab:4, h:2, hr:1 } }` | result via entityId |
| Composite `id` fallback (no entityId) | `{ id: "hr:592450:745461" }` | `{ "592450": { ab:3, h:1, hr:0 } }` | result via split |
| Composite `id` with numeric key | `{ id: "hits:603993:745461" }` | `{ 603993: { ab:2, h:1, hr:0 } }` | result via Number(extractedId) |
| Missing from results | `{ id: 999999 }` | `{ "592450": { ab:3, h:1 } }` | `null` |
| Empty id | `{ id: "" }` | `{ "": { ab:1 } }` | `null` |
| No id fields | `{}` | `{ "592450": { ab:3 } }` | `null` |
| `playerId` fallback | `{ playerId: 592450 }` | `{ "592450": { ab:2, h:0 } }` | result object |

---

### 3. `boardOutcome` logic — same file `src/board/tabHitBadge.test.js`

Replicate `boardOutcome` as a pure function taking `(type, item, liveBoardResults)`:

```js
function boardOutcome(type, item, liveBoardResults) {
  const result = lookupBoardResult(item, liveBoardResults);
  if (!result) return null;
  if (type === "hr")   return result.ab > 0 ? result.hr > 0 : null;
  if (type === "hits") return result.ab > 0 ? result.h  > 0 : null;
  // k / outs require a line and lean — not tested here (covered elsewhere)
  return null;
}
```

Test cases:

| Scenario | type | item.id | liveBoardResults entry | Expected |
|----------|------|---------|----------------------|----------|
| HR hit | `"hr"` | `592450` | `{ ab:3, h:1, hr:1 }` | `true` |
| HR miss (got hits but no HR) | `"hr"` | `592450` | `{ ab:3, h:2, hr:0 }` | `false` |
| HR — 0 AB (not yet batted) | `"hr"` | `592450` | `{ ab:0, h:0, hr:0 }` | `null` |
| Hits — got a hit | `"hits"` | `592450` | `{ ab:4, h:1, hr:0 }` | `true` |
| Hits — 0 for 4 | `"hits"` | `592450` | `{ ab:4, h:0, hr:0 }` | `false` |
| Hits — 0 AB | `"hits"` | `592450` | `{ ab:0, h:0, hr:0 }` | `null` |
| Not in results | `"hits"` | `592450` | `{}` | `null` |
| Composite id resolves and hits | `"hits"` | `"hits:592450:745461"` | `{ "592450": { ab:3, h:2 } }` | `true` |

---

### 4. `lockedCandidatesForType` fallback — same file

Replicate the corrected logic as a pure function and test both branches:

```js
function lockedCandidatesForType(type, {
  useSharedBoard,
  boardCandidatesByType,
  lockedBoardCandidates,
  getBoardGamePhase,
}) {
  if (useSharedBoard) {
    const pool = boardCandidatesByType[type] ?? [];
    return pool.filter(item => getBoardGamePhase(item.gamePk) !== "upcoming");
  }
  return Object.values(lockedBoardCandidates).flatMap(g => g[type] ?? []);
}
```

Test cases:

| Scenario | Expected |
|----------|----------|
| `useSharedBoard=true`, snapshot has HR candidates, all FINAL | all candidates returned |
| `useSharedBoard=true`, snapshot missing HR (key absent, falls back to live candidates), candidates are FINAL | live candidates returned (not empty) |
| `useSharedBoard=true`, snapshot has HR candidates, all UPCOMING | empty array |
| `useSharedBoard=true`, mix of FINAL and UPCOMING | only FINAL candidates returned |
| `useSharedBoard=false`, reads from `lockedBoardCandidates` | returns flattened type-specific candidates |
| `useSharedBoard=false`, type not present in some games | gracefully returns only populated entries |

Use a simple mock `getBoardGamePhase` that maps `gamePk % 2 === 0` → `"final"`,
`gamePk % 2 === 1` → `"upcoming"` to test filtering without needing real slate data.

---

## File locations

- `src/utils.test.js` — ADD cases to existing `describe("summarizeOutcomes")` block
- `src/board/tabHitBadge.test.js` — CREATE new file with `lookupBoardResult`,
  `boardOutcome`, and `lockedCandidatesForType` test suites

## Running tests

```
npm test
```

All existing tests must still pass. New tests must all pass.

## What NOT to change

- Do not modify `prop-scout-v7.jsx`
- Do not modify any existing test files except adding cases to
  `describe("summarizeOutcomes")` in `src/utils.test.js`
- Do not add new dependencies
