# Prop Scout — API Map by Feature Area

All endpoints require `Authorization: Bearer <token>` unless marked **public**.
Base URL (prod): Railway deployment URL (see environment config).
Base URL (local): `http://localhost:3001`

---

## Auth

| Method | Endpoint | Notes |
|--------|----------|-------|
| `POST` | `/api/auth/login` | Body: `{ username, password }` → `{ token, userId, username, role }` |
| `GET`  | `/api/auth/me` | Returns `{ userId, username, role }` for the current token |
| `GET`  | `/api/auth/preferences` | Returns `{ preferredBook }` |
| `PUT`  | `/api/auth/preferences` | Body: `{ preferredBook }` — saves user's preferred sportsbook |

---

## Slate Tab

The recommended approach is a **single bundle call** that returns all data
needed to render the Slate game list.

| Method | Endpoint | Notes |
|--------|----------|-------|
| `GET` | `/api/slate-bundle?date=YYYY-MM-DD` | **Primary call.** Returns `{ schedule, odds, nrfiMap, weatherMap, fetchedAt }`. Bundle TTL: 5 min. If `date` is omitted, defaults to today (Honolulu TZ). |
| `GET` | `/api/schedule?date=YYYY-MM-DD` | Raw schedule only. Returns `Game[]`. Used standalone for historical dates (Picks backfill, etc). |
| `GET` | `/api/injuries` | Returns active IL list. Used for the injury banner on Slate. |

### Slate — live score polling
Poll every 60 seconds for games that are in progress or past their start time
(up to 5 hours after scheduled start):

| Method | Endpoint | Notes |
|--------|----------|-------|
| `GET` | `/api/linescore/:gamePk` | Returns `{ inning, halfInning, awayScore, homeScore, away: { abbr, runs }, home: { abbr, runs }, innings: [...], isFinal }` |

---

## Game Detail (all tabs)

Opened when a game card is tapped. Load all of these in parallel on open:

| Method | Endpoint | Notes |
|--------|----------|-------|
| `GET` | `/api/lineups/:gamePk` | Returns `{ away: Batter[], home: Batter[], confirmed: bool, source }` |
| `GET` | `/api/umpires/:gamePk` | Returns `{ name, homePlate: { name, kRate, bbRate, tendency, rating } }` |
| `GET` | `/api/players/:pitcherId/stats?group=pitching` | Season stats for home SP |
| `GET` | `/api/players/:pitcherId/gamelog?group=pitching` | Last 5 starts for home SP |
| `GET` | `/api/arsenal/:pitcherId` | Statcast pitch-mix for home SP. Returns `{ arsenal: PitchType[], pitcherStats }` |
| `GET` | `/api/players/:awayPitcherId/stats?group=pitching` | Season stats for away SP |
| `GET` | `/api/players/:awayPitcherId/gamelog?group=pitching` | Last 5 starts for away SP |
| `GET` | `/api/arsenal/:awayPitcherId` | Statcast pitch-mix for away SP |
| `GET` | `/api/bullpen/:gamePk` | Returns bullpen ERA, K rate, recent usage for both teams |
| `GET` | `/api/nrfi/:gamePk` | Returns `{ lean, confidence, factors, historicalPct }` for NRFI scoring |
| `GET` | `/api/team-stats/:teamId` | Season team batting stats including K%, OBP, SLG — used for pitcher matchup context |

### Game Detail — Overview tab
Uses data already loaded above (pitchers, umpire, nrfi, weather from slate-bundle).
No additional API calls.

### Game Detail — Lineup tab
Uses `/api/lineups/:gamePk` (loaded on open above).

Per-batter enrichment — load lazily when a batter row is expanded:

| Method | Endpoint | Notes |
|--------|----------|-------|
| `GET` | `/api/splits/:batterId` | Season home/away and L/R splits |
| `GET` | `/api/stat-splits/:batterId?group=hitting` | Detailed L/R/home/away splits from Statcast |
| `GET` | `/api/players/:batterId/gamelog?group=hitting` | Last 5 games for this batter |
| `GET` | `/api/players/:batterId/vs/:opposingPitcherId` | Head-to-head batter vs pitcher career stats |
| `GET` | `/api/players/:batterId/rbi-context` | RBI opportunity context (runners on base rate, clutch stats) |

### Game Detail — Arsenal tab
Uses `/api/arsenal/:pitcherId` and `/api/arsenal/:awayPitcherId` (loaded on open above).
No additional calls. The `ba`, `whiffPct`, and `slg` shown per pitch type are
pre-computed from raw Statcast CSV — **do not recompute client-side**.

### Game Detail — Intel tab
| Method | Endpoint | Notes |
|--------|----------|-------|
| `POST` | `/api/trends/:gameKey` | Body: `{ context }` — triggers AI trend summary generation for this game. Response: `{ summary }` |
| `GET`  | `/api/notes/:gameKey` | Returns saved scout notes for this game |
| `POST` | `/api/notes/:gameKey` | Body: `{ note }` — saves a scout note |

### Game Detail — Props tab
| Method | Endpoint | Notes |
|--------|----------|-------|
| `GET` | `/api/player-props/:gamePk` | Returns all available props for this game from multiple books (DK, FD, CZR, MGM). Shape: `{ props: PropLine[], reason }` |

### Game Detail — Boxscore tab
| Method | Endpoint | Notes |
|--------|----------|-------|
| `GET` | `/api/boxscore/:gamePk` | Returns `{ batting: { away, home }, pitching: { away, home }, linescore: { innings, away.runs, home.runs }, isFinal }` |

---

## Board Tab

### Board — all prop markets (HR, Hits, K, Outs)
Single call returns the full pre-scored snapshot for all markets:

| Method | Endpoint | Notes |
|--------|----------|-------|
| `GET` | `/api/board/snapshot?date=YYYY-MM-DD` | **Primary call for all prop boards.** Returns `{ hr: [], hits: [], k: [], outs: [], total: [], ml: [], spread: [], nrfi: [], generatedAt }`. Snapshot is generated server-side at 10 AM HI daily. |

Each candidate in the snapshot already contains:
- `score` (0–95 algorithmic score)
- `simConfidence` (pre-computed Monte Carlo SIM %, **read this directly, do not recompute**)
- `lean` ("OVER" / "UNDER")
- `bookLine`, `suggestedLine`, `propLine`
- All stats needed for the WHY? modal (`k9`, `avgK3`, `whip`, `era`, `avgIP`, `umpire`, `umpireRating`, `parkFactor`, `slg`, `ops`, `hr`, `avg`, `hitRate`, `order`, `windFav`, etc.)
- `_boardSummary` (AI narrative text)

### Board — WHY? modal factors
**Computed client-side** from candidate fields — no API call. See `why-modal-factors.md`.
Exception: game market candidates (`ml`, `spread`, `total`, `nrfi`, `f5ml`, `f5spread`)
have `factors` pre-computed server-side on `candidate.factors`.

### Board — Live score overlay on cards
Reuses the same `/api/linescore/:gamePk` polling from Slate (poll every 60s
for games past their start time).

### Board — Hit badge (tab-level result indicator)
| Method | Endpoint | Notes |
|--------|----------|-------|
| `GET` | `/api/board-snapshot/:date` | Historical daily snapshots — used to show HIT/MISS tab badges for past dates |
| `GET` | `/api/board-snapshot/stats?days=N` | Performance stats: hit rate by market, tier breakdown |

---

## Board — Games sub-tabs (NRFI, O/U Total, Run Line, Moneyline, F5 ML, F5 RL)

All game market candidates are returned in the same `/api/board/snapshot` response
under keys `nrfi`, `total`, `spread`, `ml`, `f5ml`, `f5spread`. No separate call needed.

Each game market candidate has:
- `factors` array (pre-computed server-side — `{ label, value, detail, pts, max }`)
- `score`, `lean`, `leanAbbr` (team abbreviation for the favored side)
- `bookLine`, odds fields
- `_boardSummary`

Live scores for game cards: reuse `/api/linescore/:gamePk` polling (same as above).

---

## AI Board Tab

| Method | Endpoint | Notes |
|--------|----------|-------|
| `GET` | `/api/ai-board/edges?date=YYYY-MM-DD` | **Primary call.** Returns pre-generated AI edge candidates for all markets. Shared daily snapshot — same for all users, generated once per day. |

Each edge candidate has `bookLine` which may be null if props weren't loaded at
snapshot time. Hydrate null `bookLine` client-side from `propLine` or
`livePlayerProps` using market mapping:
- `k` → `pitcher_strikeouts`
- `outs` → `pitcher_outs`
- `hr` → `batter_home_runs`
- `hits` → `batter_hits`

---

## Model Tab

Four separate model endpoints, each returning scored picks for their market:

| Method | Endpoint | Notes |
|--------|----------|-------|
| `GET` | `/api/model/f5` | F5 Moneyline model picks |
| `GET` | `/api/model/fullgame` | Full-game Moneyline model picks |
| `GET` | `/api/model/kprop` | K prop model picks |
| `GET` | `/api/model/totals` | Game totals (O/U) model picks |
| `GET` | `/api/model/calibration` | Model performance history — hit rate, calibration data |
| `POST` | `/api/model/calibration/record` | Record a model pick for calibration tracking |
| `POST` | `/api/model/calibration/resolve` | Resolve an existing calibration record with actual result |

---

## Chat Tab

| Method | Endpoint | Notes |
|--------|----------|-------|
| `POST` | `/api/advisor` | Chat with the AI advisor. See `chat-api.md` and `chat-personas.md` for full spec. |

Key points:
- Always send `persona` field: `"pro"` (singles only) or `"lotto"` (builds parlays)
- Daily limit: 20 messages/user/day — track `messagesUsedToday` from each response
- The backend automatically injects today's full slate as system context — do not send game data in the request body

---

## Picks Tab

All picks endpoints require auth. `picks` are scoped to the authenticated user.

| Method | Endpoint | Notes |
|--------|----------|-------|
| `GET` | `/api/picks?days=N` | Fetch the user's picks. `days` defaults to 30. Returns `Pick[]` sorted by date desc. |
| `GET` | `/api/picks/stats?days=N` | Returns `{ wins, losses, pending, hitRate, totalPnl }` |
| `POST` | `/api/picks` | Log a new pick. Body fields below. |
| `PATCH` | `/api/picks/:id/grade` | Write grading result. Body: `{ resultHit, actualStat, gradeStatus }` |
| `PATCH` | `/api/picks/:id/void` | Void a pick. No body. |
| `PATCH` | `/api/picks/:id` | Update arbitrary fields on a pick (e.g. odds after the fact) |
| `DELETE` | `/api/picks/:id` | Delete a pick permanently |

### POST /api/picks body

```json
{
  "playerId": "669923",
  "playerName": "Cristopher Sánchez",
  "market": "k",
  "side": "OVER",
  "line": 5.5,
  "odds": -130,
  "units": 1,
  "gameLabel": "PHI @ TOR",
  "slateDate": "2025-06-09",
  "bookLine": 5.5,
  "score": 95,
  "lean": "OVER"
}
```

**Note:** For game picks (ml, spread, total, nrfi, f5ml, f5spread),
`playerId` stores the `gamePk` as a string.

### PATCH /api/picks/:id/grade body

```json
{
  "resultHit": true,
  "actualStat": 7,
  "gradeStatus": null
}
```

`gradeStatus` values: `null` (resolved — hit or miss), `"ppd"` (postponed),
`"scratch"` (player did not play), `"push"` (exact line hit).

### Pick grading — client-side

Grading is done client-side using live data already loaded by the app, then
written back via `PATCH /api/picks/:id/grade`. For the grading logic, see
`iOS-HANDOFF.md` → "Pick Grading Logic" section.

Data sources for grading:
- **Boxscore:** `GET /api/boxscore/:gamePk` — prop picks, find player by ID in batting/pitching arrays
- **Linescore:** `GET /api/linescore/:gamePk` — game picks (ML, spread, total, NRFI, F5)
- **Schedule:** `GET /api/schedule?date=YYYY-MM-DD` — needed for historical backfill to resolve gamePk from older picks

---

## Shared / Utility

| Method | Endpoint | Notes |
|--------|----------|-------|
| `GET` | `/api/weather?lat=&lon=&gameTime=` | Weather for a single game. Usually already bundled in `slate-bundle`. |
| `POST` | `/api/weather/batch` | Body: `{ games: [{ gamePk, lat, lon, gameTime }] }` — batch weather fetch |
| `GET` | `/api/odds` | Raw odds map for all today's games. Already included in `slate-bundle`. |
| `GET` | `/api/pitcher-splits/:key` | Pitcher home/away ERA splits |
| `GET` | `/api/stat-splits/:playerId?group=pitching` | Pitcher L/R splits from Statcast |
| `POST` | `/api/players/gamelogs/batch` | Body: `{ playerIds: [], group: "pitching" }` — batch gamelog fetch |

---

## Recommended call patterns by screen

### App launch
1. `GET /api/auth/me` — validate stored token
2. `GET /api/auth/preferences` — load preferred book

### Slate screen load
1. `GET /api/slate-bundle?date=YYYY-MM-DD` — single call for everything
2. `GET /api/injuries` — injury banner (can be parallel)
3. Start polling `GET /api/linescore/:gamePk` every 60s for active games

### Board screen load
1. `GET /api/board/snapshot?date=YYYY-MM-DD` — single call for all 8 markets

### Game detail open
Run all of these in parallel:
1. `GET /api/lineups/:gamePk`
2. `GET /api/umpires/:gamePk`
3. `GET /api/players/:homePitcherId/stats?group=pitching`
4. `GET /api/players/:homePitcherId/gamelog?group=pitching`
5. `GET /api/arsenal/:homePitcherId`
6. `GET /api/players/:awayPitcherId/stats?group=pitching`
7. `GET /api/players/:awayPitcherId/gamelog?group=pitching`
8. `GET /api/arsenal/:awayPitcherId`
9. `GET /api/bullpen/:gamePk`
10. `GET /api/nrfi/:gamePk`

### Picks screen load
1. `GET /api/picks?days=30`
2. `GET /api/picks/stats?days=30` (parallel)
3. Grade any ungraded picks client-side using already-loaded live data, then `PATCH /api/picks/:id/grade`

---

## Endpoints NOT needed for MVP

These exist in the backend but are not required for the core MVP screens:

| Endpoint | Used by |
|----------|---------|
| `/api/card-summary` | Legacy AI summary generation (replaced by `_boardSummary` on snapshot candidates) |
| `/api/board-snapshot` (POST) | Board snapshot generation job — server-side only |
| `/api/scout/*` | Scout tab (Phase 2) |
| `/api/daily-card` | Daily Card feature (Phase 2) |
| `/api/prediction-markets/*` | Prediction Markets tab (Phase 2) |
| `/api/chat` | Internal chat (separate from `/api/advisor`) |
| `/api/digest` | Digest feature |
| `/api/props/:gameId` | Legacy props endpoint (use `/api/player-props/:gamePk` instead) |
