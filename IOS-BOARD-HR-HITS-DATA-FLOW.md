# iOS Board HR/Hits — Web Data Flow & API Contract

> **Audience:** iOS team (`ai-agent-mlb-ios-swift`)  
> **Problem:** iOS Board shows empty **HR** and **Hits** tabs while web shows populated cards for the same slate/date.  
> **Symptom:** `GET /api/board/snapshot` returns `"hr": []` and `"hits": []` while `k`, `outs`, and game markets are populated.  
> **Last updated:** June 2026  
> **Fix status:** ✅ `liveBoardData.js` batch merge fixed (`batchData.results ?? {}`) — deploy + `refresh=1` backfill pending  
> **Source repo (web + backend):** `ai-agent-mlb`

---

## Executive summary

1. **Web does call** `GET /api/board/snapshot`, but **HR/Hits cards are not snapshot-only**.
2. When snapshot markets are empty (`[]`), web **falls back to client-side** `computeBatterBoard()` using live API data (lineups + batter gamelogs batch).
3. **iOS reads snapshot only** → empty arrays stay empty.
4. **Backend bug:** `gatherLiveBoardData()` mis-parses the gamelogs batch response, so server-side snapshot jobs often persist `hr: []` / `hits: []` even after lineups post. **Fix required in `backend/services/liveBoardData.js`** before snapshot-only iOS can match web.

**Recommended iOS path:** Keep `/api/board/snapshot` as primary; when `hr`/`hits` are empty, call `&refresh=1` and poll every 90s (mirror web). **Do not port `computeBatterBoard` to Swift** unless you need offline dev.

---

## 1. Data source confirmation

### Does web call `/api/board/snapshot` for HR/Hits?

**Yes** — but it is **not the only source** for HR/Hits cards.

| When | File | Call |
|------|------|------|
| Board view opens (today) | `prop-scout-v7.jsx` ~L3545 | `GET /api/board/snapshot?date={todayHonolulu}` |
| Poll while any market still `[]` | `prop-scout-v7.jsx` ~L3576 | same, every **90 seconds** |
| Manual refresh | `refreshBoardSnapshot()` ~L3027 | `GET /api/board/snapshot?date={today}&refresh=1` |

Markets are **not** fetched individually. One response includes all keys:

`k`, `outs`, `hits`, `hr`, `nrfi`, `total`, `spread`, `ml`, `f5ml`, `f5spread`

### What produces the HR/Hits candidate list on web?

At Board render time (`prop-scout-v7.jsx` ~L9838+):

**Step 1 — Always compute live candidates in the browser:**

```javascript
const livePropBoardCandidatesByType = {
  hr:   computeBatterBoard("hr",   activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits),
  hits: computeBatterBoard("hits", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits),
  k:    computePitcherBoard("k",    ...),
  outs: computePitcherBoard("outs", ...),
};
```

**Step 2 — Select snapshot vs live (`sharedMarketOrLive`):**

```javascript
const sharedMarketOrLive = (market, liveCandidates) => {
  if (!useSharedBoard) return liveCandidates;
  const snapshotCandidates = getBoardMarketSnapshot(market);
  if (snapshotCandidates === null) return liveCandidates;
  if (Array.isArray(snapshotCandidates) && snapshotCandidates.length > 0) return snapshotCandidates;
  return liveCandidates.length > 0 ? liveCandidates : snapshotCandidates;
};
```

Active-tab variant (`boardCandidatesByType`) uses the same rule: **non-empty snapshot wins; else non-empty live; else `[]`.**

### Selection rule (mirror on iOS)

```
useSharedBoard = snapshot doc exists for today AND empty !== true
                 (boardSnapshotCoversToday() in prop-scout-v7.jsx)

for market in [hr, hits]:
  snap = snapshot[market]   // may be [] if key exists but empty

  if NOT useSharedBoard:
    → would use live compute (web only; iOS has no local compute)

  if snap.count > 0:
    → use snap

  if liveCompute(market).count > 0:    // web only
    → use liveCompute

  else:
    → []   // iOS lands here today
```

**Production web:** `useSharedBoard === true` once the snapshot document exists, **even when `hr`/`hits` are `[]`**. Cards still appear because web falls back to **live compute** (Step 1).

**iOS today:** snapshot-only → `[]` stays empty.

### Helper references (web)

| Helper | File | Role |
|--------|------|------|
| `boardSnapshotCoversToday()` | `prop-scout-v7.jsx` ~L3002 | `snapshot.date === today && snapshot.empty !== true` |
| `getBoardMarketSnapshot(market)` | ~L3008 | Returns `null` (no doc), `[]` (empty market), or candidates |
| `boardSnapshotHasEmptyMarket()` | ~L3019 | True if any `BOARD_SNAPSHOT_MARKETS` key is `[]` — drives 90s poll |
| `sharedMarketOrLive()` | ~L9846 | Snapshot vs live selection |

---

## 2. Exact compute entry points

### Where is `computeBatterBoard` defined?

| Symbol | File | Export |
|--------|------|--------|
| `computeBatterBoard` | `src/board/index.js` | `export const computeBatterBoard` (~L137) |
| `hrBoardScore` / `hitBoardScore` | `src/scoring/batter.js` | Called inside `computeBatterBoard`; return `null` if no `hlog` |

Server uses the **same module**:

- `backend/services/liveBoardData.js` → `computeMarketCandidates()`
- `backend/jobs/dailyAiSnapshot.js` → step 10 board market loop

### Web call sites (HR vs Hits)

| Location | Market | When |
|----------|--------|------|
| Board render ~L9841 | `"hr"` / `"hits"` | Every Board render |
| Card-summary effect ~L5128 | same | Only if snapshot missing (dev path) |
| Lock effect ~L5174 | same | Only if `!boardSnapshotCoversToday()` |

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

| Lineup state | `source` | `lineupState` on candidate | Scored? |
|--------------|----------|----------------------------|---------|
| Confirmed | `"lineup"` | `"confirmed"` | Yes, if gamelog exists |
| Roster fallback | `"roster"` | `"roster"` | Yes, if gamelog exists |
| Not posted yet | (no response) | — | Game skipped |

**Hard gate:** `liveHittingLog[playerId]` must exist or the batter is dropped (`hrBoardScore`/`hitBoardScore` return `null` at `src/scoring/batter.js` ~L6/L35).

---

## 3. Full input dependency list (web Board → HR/Hits)

Honolulu “today”, user opens Board tab.

### Hard requirements (no cards without these)

| # | Endpoint | Scope | Fields used | When fetched (web) |
|---|----------|-------|-------------|-------------------|
| 1 | `GET /api/schedule` or `?date=` | slate | `gamePk`, `status`, `gameTime`, `away`, `home`, `stadium`, `probablePitchers` | On load ~L3490; status merge every 5 min |
| 2 | `GET /api/lineups/:gamePk` | per game | `confirmed`, `source`, `away[]`, `home[]` (`id`, `name`, `order`, `hand`), `scratches` | Background ~L4323; poll unconfirmed every 3 min ~L4423 |
| 3 | `POST /api/players/gamelogs/batch` `{ playerIds, group: "hitting" }` | batch | **`results[playerId]`** → `avg`, `slg`, `hr`, `ops`, `hitRate[]` | Board open ~L3726 (**must parse `data.results`**) |

### Soft inputs (cards render without; scores/SIM improve)

| # | Endpoint | Scope | Used for |
|---|----------|-------|----------|
| 4 | Client odds / `GET /api/player-props/:gamePk` | per game | `propLine`; SIM % and EV sort |
| 5 | `POST /api/weather/batch` | slate | `liveWeather[gamePk].hrFavorable` |
| 6 | `GET /api/stat-splits/:id?group=hitting` | per batter | Platoon split (optional; often missing on Board) |

### Loaded for Board but **not** passed into `computeBatterBoard`

| Endpoint | Notes |
|----------|-------|
| `GET /api/odds` | Games / K tabs |
| `GET /api/nrfi/:gamePk` | Games tab |
| `GET /api/injuries` | Slate flags |
| Pitcher stats, arsenal, team-stats, umpires | K/Outs / Games; umpires only on Game screen |
| `GET /api/board/snapshot` | Display + `_boardSummary`; not a compute input |

### Polling (web)

| Data | Interval |
|------|----------|
| Snapshot empty markets | 90s |
| Unconfirmed lineups | 3 min |
| Schedule status | 5 min |
| Odds | 20 min |

---

## 4. Candidate JSON shape

### Live compute output (`computeBatterBoard`)

**HR example:**

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

**Hits** — same structure; `propLine.market === "batter_hits"`, `parkFactor` from hit factor, `simConfidence` from hits sim.

Per-game cap: top **5 batters per game** by score, then global sort (`src/board/index.js` ~L245–253).

### Snapshot persistence (`GET /api/board/snapshot`)

**Same candidate objects** as live compute, plus optional:

```json
"_boardSummary": "CJ Abrams posts .512 SLG with 12 HR; Alcantara 3.45 ERA limits upside."
```

Written by:

- `backend/jobs/dailyAiSnapshot.js` (10 AM HI / pregame / midnight Wave 1)
- `backend/routes/boardDailySnapshot.js` → `fillMissingMarkets()` (on-demand)

Storage: `board_daily_snapshots` table via `backend/services/boardSnapshotDb.js`.

**Schema is not different** — snapshot is a superset (adds `_boardSummary`).

---

## 5. Why snapshot `hr`/`hits` are `[]` while web shows cards

### Cause A — Web live fallback; iOS has none

| Client | `snap=[]`, live has data |
|--------|--------------------------|
| Web | Shows live-computed cards |
| iOS | Empty tab |

### Cause B — Backend hitting-log bug (keeps snapshot empty)

**File:** `backend/services/liveBoardData.js` ~L215–221

```javascript
const batchData = await internalPost("/api/players/gamelogs/batch", { ... });
if (batchData && typeof batchData === "object") {
  Object.assign(liveHittingLog, batchData);  // BUG
}
```

**API returns:** `{ results: { [playerId]: hlog }, misses: [] }` (`backend/routes/players.js`).

**Web client (correct):** `setLiveHittingLog(prev => ({ ...prev, ...data.results }))` (~L3742).

**Server (wrong):** assigns `{ results, misses }` keys onto `liveHittingLog` → **`liveHittingLog[playerId]` is always undefined** → `computeBatterBoard` returns zero batters → snapshot saves `"hr": []`, `"hits": []`.

**K/Outs/Games work** because they use per-pitcher API calls, not the batch path.

**Required fix:**

```javascript
Object.assign(liveHittingLog, batchData.results ?? {});
```

**Status:** ✅ Applied in `backend/services/liveBoardData.js` (June 2026). Deploy to Railway + run `GET /api/board/snapshot?date=TODAY&refresh=1` to backfill Postgres.

### Other server vs web notes

| Topic | Snapshot job | Web live |
|-------|--------------|----------|
| `computeBatterBoard` | Same `src/board/index.js` | Same in browser |
| `dailyAiSnapshot` schedule filter | Active statuses only (~L218) | All games in `liveSlate` (includes Final) |
| On-demand fill | Full schedule (`fillMissingMarkets`, TASK 147) | N/A |
| Empty market negative cache | 10 min; `refresh=1` bypasses | N/A |
| Slow gather timeout | 9s; background recompute (TASK 148) | Client compute, no timeout |

Empty arrays **are persisted** to Postgres — not a silent skip.

---

## 6. Recommended fix for iOS parity

### Option A (recommended): Fix backend + snapshot polling — **no new endpoint**

**Backend (required):**

1. Fix `liveBoardData.js` batch parsing (`batchData.results`).
2. Redeploy API.
3. Backfill: `GET /api/board/snapshot?date=TODAY&refresh=1`

**iOS behavior (mirror web):**

| Step | Action |
|------|--------|
| Primary read | `GET /api/board/snapshot?date=YYYY-MM-DD` |
| Empty `hr` or `hits` | `GET /api/board/snapshot?date=YYYY-MM-DD&refresh=1` |
| Poll | Every **90s** while any market in `BOARD_SNAPSHOT_MARKETS` is `[]` |
| Manual refresh | Always use `&refresh=1` |

**Do not port `computeBatterBoard` to Swift** — server already runs the same module.

### Option B (optional): New explicit endpoint

Not implemented today. Could add:

```
GET /api/board/live?date=YYYY-MM-DD&markets=hr,hits
```

Thin wrapper around `gatherLiveBoardData` + `computeMarketCandidates` (after batch fix). Same JSON array shape as snapshot markets.

### Option C

Nothing else exists that iOS should call instead of `/api/board/snapshot`.

**Note:** Historical board uses a **different** route: `GET /api/board-snapshot/:date` (backtest card rows) — not for live Board tabs.

### Auth

`GET /api/board/snapshot` — **no auth** required.

### iOS selection pseudocode

```swift
let BOARD_SNAPSHOT_MARKETS = ["k", "outs", "hits", "hr", "nrfi", "total", "spread", "ml", "f5ml", "f5spread"]

func snapshotHasEmptyMarket(_ snapshot: BoardSnapshot) -> Bool {
    BOARD_SNAPSHOT_MARKETS.contains { (snapshot[$0] ?? []).isEmpty }
}

func loadBoardSnapshot(date: String, forceRefresh: Bool) async throws -> BoardSnapshot {
    var url = "\(apiBase)/api/board/snapshot?date=\(date)"
    if forceRefresh { url += "&refresh=1" }
    return try await get(url)
}

// After primary load:
if snapshotHasEmptyMarket(snapshot) {
    // Poll every 90s; on pull-to-refresh call refresh=1
}
```

---

## 7. API reference — `GET /api/board/snapshot`

### URL

```
GET /api/board/snapshot?date=YYYY-MM-DD
GET /api/board/snapshot?date=YYYY-MM-DD&refresh=1
```

| Param | Meaning |
|-------|---------|
| `date` | Honolulu calendar date (`en-CA` format). Default: today HI. |
| `refresh=1` | Bypass response cache + negative cache; force on-demand recompute of missing/empty markets. |

### Response (success)

```json
{
  "date": "2026-06-03",
  "generatedAt": "2026-06-03T21:10:00.000Z",
  "k": [ /* BoardCandidate[] */ ],
  "outs": [ /* BoardCandidate[] */ ],
  "hits": [ /* BoardCandidate[] */ ],
  "hr": [ /* BoardCandidate[] */ ],
  "nrfi": [ /* GameCandidate[] */ ],
  "total": [ /* ... */ ],
  "spread": [ /* ... */ ],
  "ml": [ /* ... */ ],
  "f5ml": [ /* ... */ ],
  "f5spread": [ /* ... */ ]
}
```

### Response (no snapshot yet)

```json
{ "empty": true, "reason": "no_snapshot", "date": "2026-06-03" }
```

### Headers

| Header | Meaning |
|--------|---------|
| `X-Cache: HIT` | 5-min in-memory cache |
| `X-Cache: MISS` | Read from DB |
| `X-Cache: FALLBACK` | On-demand compute ran this request |

### Backend files

| File | Role |
|------|------|
| `backend/routes/boardDailySnapshot.js` | GET handler, `fillMissingMarkets`, `refresh=1` |
| `backend/services/liveBoardData.js` | `gatherLiveBoardData`, `computeMarketCandidates` |
| `backend/services/boardSnapshotDb.js` | `BOARD_MARKETS`, `saveBoardSnapshot` |
| `backend/jobs/dailyAiSnapshot.js` | Scheduled writer (10 AM HI, pregame, midnight) |

---

## 8. Quick repro (curl)

```bash
DATE=$(TZ=Pacific/Honolulu date +%Y-%m-%d)
API=https://ai-agent-mlb-production.up.railway.app

# What iOS reads today (may show empty hr/hits)
curl -s "$API/api/board/snapshot?date=$DATE" \
  | jq '{date, generatedAt, hr: (.hr|length), hits: (.hits|length), k: (.k|length)}'

# Force server recompute (web manual refresh)
curl -s "$API/api/board/snapshot?date=$DATE&refresh=1" \
  | jq '{hr: (.hr|length), hits: (.hits|length), sampleHr: .hr[0].name, sampleHits: .hits[0].name}'

# Inspect one candidate
curl -s "$API/api/board/snapshot?date=$DATE" | jq '.hr[0], .hits[0]'
```

After the `liveBoardData.js` batch fix + `refresh=1`, expect `hr`/`hits` counts > 0 when lineups exist.

---

## 9. iOS wiring checklist

- [ ] Keep `GET /api/board/snapshot?date=` as primary source for all Board markets.
- [ ] When `hr.count == 0 || hits.count == 0`, call `&refresh=1`, then poll every **90s** until populated (match web `boardSnapshotHasEmptyMarket`).
- [ ] Decode same `BoardCandidate` shape; use `_boardSummary` for italic card text when present.
- [ ] Do **not** treat `[]` as “no snapshot document” — document can exist with empty markets.
- [ ] Block on backend deploy of **`batchData.results` fix** in `liveBoardData.js` before expecting snapshot-only parity.
- [ ] Manual pull-to-refresh → `&refresh=1`.
- [ ] No auth header required for snapshot GET.

---

## 10. Related docs (web repo)

| Doc | Contents |
|-----|----------|
| `COWORK-HANDOFF.md` | Shared snapshot architecture, cron schedule |
| `CURSOR-TASK-PHASE5-BOARD-SNAPSHOT.md` | Board snapshot design |
| `PROP_SCOUT_API.md` | Route reference |

---

*Generated from web repo analysis — `prop-scout-v7.jsx`, `src/board/index.js`, `backend/services/liveBoardData.js`, `backend/routes/boardDailySnapshot.js`.*
