# iOS Board HR/Hits — Web Data Flow Handoff

> **Audience:** iOS team (`ai-agent-mlb-ios-swift`)  
> **Repo reference:** `ai-agent-mlb` (web + backend)  
> **Last updated:** June 2026

---

## Problem

iOS shows **empty HR and Hits tabs** on Board while web shows populated player cards for the same slate/date.

iOS calls:
- `GET /api/board/snapshot?date=YYYY-MM-DD` (polls ~75s when empty)
- `GET /api/board/snapshot?date=YYYY-MM-DD&refresh=1` on manual refresh

Diagnostics show raw JSON often has `"hr": []` and `"hits": []` — not a client decode issue. K/Outs/Games from the same snapshot work fine.

---

## 1. Data source confirmation

### Does web call `/api/board/snapshot` for HR/Hits?

**Yes** — but it is **not the only source** for HR/Hits cards.

| When | File / function | Call |
|------|-----------------|------|
| Board view opens (today) | `prop-scout-v7.jsx` `useEffect` ~L3545 | `GET /api/board/snapshot?date={todayHonolulu}` |
| Poll while empty markets | `useEffect` ~L3576 | same, every **90s** |
| Manual refresh | `refreshBoardSnapshot()` ~L3027 | `GET /api/board/snapshot?date={today}&refresh=1` |

Markets are **not** fetched individually. One response includes all keys: `k`, `outs`, `hits`, `hr`, `nrfi`, `total`, `spread`, `ml`, `f5ml`, `f5spread`.

### What actually produces HR/Hits candidate lists on web?

At render time in the Board IIFE (~L9838+):

1. **Always computes live candidates client-side:**

```javascript
const livePropBoardCandidatesByType = {
  hr:   computeBatterBoard("hr", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits),
  hits: computeBatterBoard("hits", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits),
  k:    computePitcherBoard("k", ...),
  outs: computePitcherBoard("outs", ...),
};
```

2. **Then selects snapshot vs live** via `sharedMarketOrLive` / `boardCandidatesByType`:

```javascript
const sharedMarketOrLive = (market, liveCandidates) => {
  if (!useSharedBoard) return liveCandidates;
  const snapshotCandidates = getBoardMarketSnapshot(market);
  if (snapshotCandidates === null) return liveCandidates;
  if (Array.isArray(snapshotCandidates) && snapshotCandidates.length > 0) return snapshotCandidates;
  return liveCandidates.length > 0 ? liveCandidates : snapshotCandidates;
};
```

**Selection rule (mirror this on iOS):**

```
useSharedBoard = snapshot exists for today AND empty !== true
                 (boardSnapshotCoversToday())

for market in [hr, hits]:
  snap = snapshot[market]  // [] if key exists but empty

  if NOT useSharedBoard:
    use liveCompute(market)   // web only — runs computeBatterBoard in browser

  if snap.count > 0:
    use snap

  if liveCompute(market).count > 0:
    use liveCompute(market)   // ← web shows cards here when snap is []

  else:
    use snap  // []
```

**Production web:** `useSharedBoard === true` once snapshot doc exists, **even if `hr`/`hits` are `[]`**. Cards still appear because of the **live fallback above**.

**iOS today:** reads snapshot only → `[]` stays empty.

### Key helpers (web)

| Helper | File | Behavior |
|--------|------|----------|
| `boardSnapshotCoversToday()` | `prop-scout-v7.jsx` ~L3002 | `boardDailySnapshot.date === today && empty !== true` |
| `getBoardMarketSnapshot(market)` | ~L3008 | Returns `null` if no snapshot doc; `[]` if market key exists but empty |
| `boardSnapshotHasEmptyMarket(snapshot)` | ~L3019 | True if any of 10 markets is `[]` — triggers 90s poll |
| `sharedMarketOrLive(market, liveCandidates)` | ~L9846 | Selection logic above |

---

## 2. Exact compute entry points

### Definition

| Symbol | File | Export |
|--------|------|--------|
| `computeBatterBoard` | `src/board/index.js` | `export const computeBatterBoard` (~L137) |
| `hrBoardScore` / `hitBoardScore` | `src/scoring/batter.js` | Used inside `computeBatterBoard` |

Server-side uses the **same module**:

- `backend/services/liveBoardData.js` → `computeMarketCandidates()` (~L246)
- `backend/jobs/dailyAiSnapshot.js` → step 10 (~L338)

### Web call sites (HR vs Hits)

| Location | Market arg | When |
|----------|------------|------|
| Board render ~L9841 | `"hr"` / `"hits"` | Every Board render |
| Card-summary effect ~L5128–5130 | same | Only if snapshot missing (dev path) |
| Lock effect ~L5174–5177 | same | Only if `!boardSnapshotCoversToday()` |

### Arguments at render time

```javascript
computeBatterBoard(
  "hr" | "hits",     // type
  activeSlate,       // buildLiveGame() per game from liveSlate + weather/nrfi overlay
  liveLineups,       // { [gamePk]: { confirmed, source, away[], home[], scratches } }
  liveWeather,       // { [gamePk]: { hrFavorable, condition, ... } }
  livePlayerProps,   // { [gamePk]: { props: [...] } }
  liveHittingLog,    // { [playerId]: { avg, slg, hr, ops, hitRate[], ... } }
  liveStatSplits     // { [`${id}:hitting`]: { vsL, vsR, ... } }
)
```

### Lineup TBD / roster fallback

Inside `computeBatterBoard` (`src/board/index.js` ~L140–141):

```javascript
const lu = liveLineups[game.gamePk];
if (!lu?.confirmed && lu?.source !== "roster") return; // skip entire game
```

- **Confirmed lineup** → `source: "lineup"`, `lineupState: "confirmed"`
- **Roster fallback** → `source: "roster"`, `lineupState: "roster"` (provisional, still scored)
- **No lineup response yet** → game skipped, no candidates

UI: `BatterBoardCard.jsx` shows **LINEUP TBD** when `lineupState === "roster"`.

**Hard gate:** `liveHittingLog[playerId]` must exist or `hrBoardScore`/`hitBoardScore` return `null` and the player is dropped (~L171 in `src/board/index.js`).

---

## 3. Full input dependency list (web Board → HR/Hits)

Honolulu “today”, user opens Board tab.

### Hard requirements (no cards without these)

| # | Endpoint | Scope | Fields used | When fetched |
|---|----------|-------|-------------|--------------|
| 1 | `GET /api/schedule` or `?date=` | slate | `gamePk`, `status`, `gameTime`, `away`, `home`, `stadium`, `probablePitchers` | On load (`useEffect` ~L3490); status merge every 5 min |
| 2 | `GET /api/lineups/:gamePk` | per game | `confirmed`, `source`, `away[]`, `home[]` (`id`, `name`, `order`, `hand`), `scratches` | Background prefetch ~L4323; poll unconfirmed every 3 min ~L4423 |
| 3 | `POST /api/players/gamelogs/batch` `{ playerIds, group: "hitting" }` | batch | **`results[playerId]`** → `avg`, `slg`, `hr`, `ops`, `hitRate[]` | Board open effect ~L3726 (parses `data.results`) |

### Soft inputs (cards can render without; scores/SIM improve)

| # | Endpoint | Scope | Used for |
|---|----------|-------|----------|
| 4 | Client `fetchPlayerPropsDirect()` → Odds API **or** `GET /api/player-props/:gamePk` | per game | `propLine` on candidate; SIM line + EV sort |
| 5 | `POST /api/weather/batch` | slate batch | `liveWeather[gamePk].hrFavorable` (HR wind boost) |
| 6 | `GET /api/stat-splits/:id?group=hitting` | per batter | Platoon split in score (optional; web often missing on Board) |

### Loaded for Board but **not** passed into `computeBatterBoard`

| Endpoint | Notes |
|----------|-------|
| `GET /api/odds` | Games/K tabs |
| `GET /api/nrfi/:gamePk` | Games tab |
| `GET /api/injuries` | Slate flags only |
| Pitcher stats / arsenal / team-stats | K/Outs + Games |
| `GET /api/umpires/:gamePk` | Game view only, not Board prefetch |
| `GET /api/board/snapshot` | Display selection + `_boardSummary`; not compute input |
| `GET /api/auth/preferences` | UI only |

### Polling / cache summary

| Data | Web poll |
|------|----------|
| Snapshot empty markets | 90s (`/api/board/snapshot`) |
| Lineups unconfirmed | 3 min |
| Schedule status | 5 min |
| Odds | 20 min |
| Boxscore (grading badges) | on Board view, per final/live game |

---

## 4. Candidate shape

### Shape from `computeBatterBoard` (live compute)

**HR candidate (representative):**

```json
{
  "id": 682928,
  "name": "CJ Abrams",
  "hand": "L",
  "order": 1,
  "team": "WSH",
  "lineupState": "confirmed",
  "gamePk": 746123,
  "gameLabel": "MIA @ WSH",
  "gameTime": "2026-06-03T22:05:00Z",
  "pitcher": "Sandy Alcantara",
  "pitcherHand": "R",
  "park": "Nationals Park",
  "parkFactor": 0.98,
  "windFav": false,
  "score": 69,
  "avg": ".285",
  "slg": ".512",
  "hr": 12,
  "ops": ".891",
  "hitRate": [1, 0, 1, 1, 0],
  "propLine": {
    "market": "batter_home_runs",
    "player": "CJ Abrams",
    "books": {
      "DK": { "line": 0.5, "overOdds": "+180", "underOdds": "-240" }
    }
  },
  "simConfidence": 42,
  "matchup": {
    "batterHand": "L",
    "pitcherHand": "R",
    "batterVsHand": { "avg": ".310", "ops": ".920" },
    "pitcherTopPitches": [{ "abbr": "FF", "name": "4-Seam", "usage": 42 }],
    "batterVsPitches": { "FF": ".320" }
  }
}
```

**Hits candidate** — same structure; `propLine.market === "batter_hits"`, `parkFactor` uses `pf.hit`, `simConfidence` from `simHitsConfidence`.

### Snapshot persistence shape

`GET /api/board/snapshot` returns **the same candidate objects** plus optional:

```json
"_boardSummary": "CJ Abrams posts .512 SLG with 12 HR; Alcantara 3.45 ERA limits upside."
```

Written by `dailyAiSnapshot.js` / `fillMissingMarkets()` → `saveBoardSnapshot()` in `backend/services/boardSnapshotDb.js`.

**Same schema** — snapshot is a superset (adds `_boardSummary`, sometimes top-level `bookLine` on game markets).

---

## 5. Why snapshot `hr`/`hits` are `[]` while web shows cards

### Root cause #1 — web live fallback, iOS doesn’t have it

| Client | When `snap=[]` but lineups + hitting logs exist |
|--------|--------------------------------------------------|
| Web | Runs `computeBatterBoard` in browser → shows cards |
| iOS | Reads snapshot only → empty UI |

### Root cause #2 — server-side hitting log bug (likely why snap stays `[]`)

In `backend/services/liveBoardData.js` ~L215–221:

```javascript
const batchData = await internalPost("/api/players/gamelogs/batch", { ... });
if (batchData && typeof batchData === "object") {
  Object.assign(liveHittingLog, batchData);  // BUG
}
```

API returns `{ results: { [playerId]: hlog }, misses: [] }` (`backend/routes/players.js` ~L298).

Web client correctly uses `data.results` (`prop-scout-v7.jsx` ~L3742).

Server assigns `{ results, misses }` onto `liveHittingLog`, so **`liveHittingLog[playerId]` is always undefined** → `computeBatterBoard` returns **zero batters** → snapshot saves `"hr": []`, `"hits": []`.

K/Outs/Games still populate because they don’t use that batch path.

**Fix (one line):**

```javascript
Object.assign(liveHittingLog, batchData.results ?? {});
```

### Other server vs web differences

| Topic | Server snapshot job | Web live |
|-------|---------------------|----------|
| `computeBatterBoard` | Same `src/board/index.js` via `computeMarketCandidates` | Same function in browser |
| Schedule filter in `dailyAiSnapshot` | Only active statuses (~L218) | `activeSlate` = all games in `liveSlate` (includes Final) |
| On-demand fill (`fillMissingMarkets`) | Full schedule (TASK 147) | N/A |
| Negative cache | 10 min per empty market; `refresh=1` bypasses | N/A |
| Timeout | 9s budget; background recompute if slow (TASK 148) | Client compute has no timeout |

Empty arrays **are persisted** to Postgres — not skipped silently.

---

## 6. Recommended fix for iOS parity

### Recommended: **Option A + existing `refresh=1` (no new endpoint required)**

**Step 1 — Backend (required):** Fix `liveBoardData.js` batch parsing (`batchData.results`). Redeploy. Run `GET /api/board/snapshot?date=TODAY&refresh=1` once to backfill.

**Step 2 — iOS selection rule (mirror web `sharedMarketOrLive` without local compute):**

```swift
// iOS cannot run computeBatterBoard locally — use server refresh instead of live fallback
func boardCandidates(market: String, snapshot: BoardSnapshot) async -> [BoardCandidate] {
    var snap = snapshot.markets[market] ?? []
    if snap.isEmpty {
        // Same as web refreshBoardSnapshot()
        snap = await fetchSnapshot(date: today, refresh: true).markets[market] ?? []
    }
    return snap
}
```

**Step 3 — iOS polling (mirror web ~L3576):**

Poll `GET /api/board/snapshot?date=` every **90s** while **any** market in `[k, outs, hits, hr, nrfi, total, spread, ml, f5ml, f5spread]` is `[]`.

On manual pull-to-refresh: `&refresh=1`.

**Do not port `computeBatterBoard` to Swift** unless you need offline dev — server already shares the module.

### Option B (optional)

```
GET /api/board/live?date=YYYY-MM-DD&markets=hr,hits
```

Thin wrapper around `gatherLiveBoardData` + `computeMarketCandidates` (after batch fix). **Does not exist today.**

### Option C

Nothing else exists that iOS should call instead of `/api/board/snapshot`.

**Note:** Historical dates use `GET /api/board-snapshot/:date` (backtest card rows) — not for live Board tabs.

### Auth

`GET /api/board/snapshot` — **no auth** required.

---

## 7. Quick repro commands

```bash
DATE=$(TZ=Pacific/Honolulu date +%Y-%m-%d)
API=https://ai-agent-mlb-production.up.railway.app

# What iOS reads today (may show empty hr/hits)
curl -s "$API/api/board/snapshot?date=$DATE" | jq '{date, generatedAt, hr: (.hr|length), hits: (.hits|length), k: (.k|length)}'

# Force server recompute (web manual refresh)
curl -s "$API/api/board/snapshot?date=$DATE&refresh=1" | jq '{hr: (.hr|length), hits: (.hits|length), sampleHr: .hr[0].name, sampleHits: .hits[0].name}'

# After batch fix + refresh, expect hr/hits > 0 when lineups exist
curl -s "$API/api/board/snapshot?date=$DATE" | jq '.hr[0], .hits[0]'
```

Response header: `X-Cache: FALLBACK` = on-demand compute ran; `MISS` = DB read + possible fill.

---

## iOS wiring checklist

1. **Keep** `GET /api/board/snapshot?date=` as primary source.
2. **When** `hr.count == 0 || hits.count == 0` → call `&refresh=1`, then poll every 90s (match web).
3. **Decode** same `BoardCandidate` shape; read `_boardSummary` for italic card text.
4. **Don’t treat** `[]` as “no snapshot doc” — web treats `boardSnapshotCoversToday()` as true with empty arrays and falls back to live compute; iOS must **refresh server-side** instead.
5. **Block on backend fix** for `batchData.results` in `liveBoardData.js` — until then, server-side hr/hits will stay empty regardless of iOS polling.

---

## Related files (backend + web)

| File | Role |
|------|------|
| `prop-scout-v7.jsx` | Web Board UI, snapshot fetch, `sharedMarketOrLive`, live `computeBatterBoard` |
| `src/board/index.js` | `computeBatterBoard`, `computePitcherBoard`, `computeGameBoard` |
| `src/scoring/batter.js` | `hrBoardScore`, `hitBoardScore` |
| `backend/routes/boardDailySnapshot.js` | `GET /api/board/snapshot`, `fillMissingMarkets`, `refresh=1` |
| `backend/services/liveBoardData.js` | `gatherLiveBoardData`, `computeMarketCandidates` — **batch bug here** |
| `backend/services/boardSnapshotDb.js` | `BOARD_MARKETS`, `saveBoardSnapshot` |
| `backend/jobs/dailyAiSnapshot.js` | Cron writer (10 AM HI + pregame) |
| `backend/routes/players.js` | `POST /api/players/gamelogs/batch` → `{ results, misses }` |
| `backend/routes/lineups.js` | Roster vs confirmed lineup |

---

## Cross-reference

- `COWORK-HANDOFF.md` — shared snapshot architecture, cron schedule, Ship/ops tracker
- `CURSOR-TASK-PHASE5-BOARD-SNAPSHOT.md` — original board snapshot design
