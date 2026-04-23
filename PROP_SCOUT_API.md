# Prop Scout — Backend API Reference

Base URL (production): `https://<your-railway-domain>`  
Base URL (local dev): `http://localhost:3001`  
All responses are JSON. All game-level endpoints accept a `gamePk` (MLB integer game ID).  
All responses include an `X-Cache: HIT | MISS` header.

---

## Authentication
No API key required for data endpoints. Auth endpoints use JWT (see `/api/auth`).

---

## Slate & Schedule

### `GET /api/schedule`
Today's MLB slate with probable pitchers, venue, and game time.

**Query params:** none (always returns today)

**Response:**
```json
[
  {
    "gamePk": 716463,
    "status": "Preview",
    "gameTime": "2026-04-20T17:10:00Z",
    "away": { "id": 147, "name": "New York Yankees", "abbr": "NYY" },
    "home": { "id": 143, "name": "Philadelphia Phillies", "abbr": "PHI" },
    "venue": "Citizens Bank Park",
    "probablePitchers": {
      "away": { "id": 543037, "name": "Gerrit Cole", "hand": "R" },
      "home": { "id": 554430, "name": "Zack Wheeler", "hand": "R" }
    }
  }
]
```

---

## Lineups

### `GET /api/lineups/:gamePk`
Confirmed batting order with player IDs, batting order position, and hand.

**Response:**
```json
{
  "gamePk": 716463,
  "away": [
    { "id": 592450, "name": "Aaron Judge", "order": 3, "position": "RF", "batSide": "R" }
  ],
  "home": [
    { "id": 671739, "name": "Bryson Stott", "order": 1, "position": "SS", "batSide": "L" }
  ]
}
```

---

## Player Stats

### `GET /api/players/:playerId/stats?group=hitting|pitching`
Season stats + player info. Defaults to `hitting`.

**Response (hitting):**
```json
{
  "id": 592450, "name": "Aaron Judge", "team": "NYY",
  "position": "RF", "hand": "R",
  "avg": ".291", "ops": ".987", "hr": 18, "rbi": 52,
  "season": { "gamesPlayed": 60, "atBats": 205, "hits": 60, "homeRuns": 18, ... }
}
```

**Response (pitching):**
```json
{
  "id": 543037, "name": "Gerrit Cole", "team": "NYY",
  "era": "2.85", "whip": "1.04", "kPer9": "10.8", "bbPer9": "2.1",
  "wins": 6, "losses": 2, "ip": "69.0", "k": 83, "bb": 16
}
```

---

### `GET /api/players/:playerId/gamelog?group=hitting|pitching`
Recent game-by-game log. Returns last 10 games (hitting) or last 5 starts (pitching).

**Response (pitching):**
```json
{
  "group": "pitching",
  "seasonEra": "2.85",
  "avgIP": "6.1",
  "games": [
    { "date": "2026-04-17", "opponent": "BOS", "ip": "7.0", "k": 9, "er": 1, "pc": 98, "result": "W" }
  ]
}
```

**Response (hitting):**
```json
{
  "group": "hitting",
  "seasonAvg": ".291", "last7Avg": ".340",
  "avg": ".291", "ops": ".987", "slg": ".612", "hr": 18, "avgTB": "1.8",
  "hitRate": [1, 0, 1, 1, 1],
  "games": [
    { "date": "2026-04-17", "opponent": "BOS", "ab": 4, "h": 2, "hr": 1, "rbi": 2, "avg": ".340" }
  ]
}
```

---

### `GET /api/players/:batterId/rbi-context`
Career RBI rate context for batter props.

**Response:**
```json
{ "rbiPerGame": 0.621, "rbiRate": 0.142, "slg": ".512", "extraBaseHits": 387 }
```

---

### `GET /api/players/:batterId/vs/:pitcherId`
Career head-to-head batter vs pitcher stats.

**Response:**
```json
{
  "batterId": "592450", "pitcherId": "543037",
  "atBats": 22, "hits": 7, "avg": ".318", "homeRuns": 2,
  "strikeOuts": 5, "obp": ".375", "slg": ".590", "season": "career"
}
```
Returns `{ "atBats": 0 }` when no H2H history exists.

---

## Statcast / Pitch Analytics

### `GET /api/arsenal/:pitcherId?year=2026`
Pitcher's full pitch mix from Baseball Savant — usage, velocity, whiff rate, and batter performance per pitch type.

**Response:**
```json
{
  "pitcherId": 543037,
  "season": 2026,
  "arsenal": [
    {
      "abbr": "FF",
      "name": "4-Seam Fastball",
      "usagePct": 38,
      "avgVelo": 97.4,
      "whiffRate": "18%",
      "avg": ".241",
      "slg": ".441",
      "putAwayRate": "22%"
    },
    { "abbr": "SL", "name": "Slider", "usagePct": 31, "avgVelo": 88.2, "whiffRate": "36%", "avg": ".198", "slg": ".312" }
  ]
}
```

---

### `GET /api/splits/:batterId?year=2026`
Batter's performance against each pitch type this season (Statcast).

**Response:**
```json
{
  "batterId": 592450,
  "season": 2026,
  "splits": {
    "FF": { "avg": ".310", "whiff": "14%", "slg": ".680", "pitches": 312 },
    "SL": { "avg": ".198", "whiff": "38%", "slg": ".290", "pitches": 188 }
  }
}
```

---

### `GET /api/pitcher-splits/:pitcherId?year=2026`
Pitcher's ERA, WHIP, K/9, and BB/9 split by batter handedness.

**Response:**
```json
{
  "pitcherId": 543037,
  "vsLeft":  { "avg": ".215", "ops": ".641", "k9": "11.2", "bb9": "2.8" },
  "vsRight": { "avg": ".238", "ops": ".702", "k9": "10.4", "bb9": "1.9" }
}
```

---

### `GET /api/stat-splits/:playerId?group=hitting|pitching`
Home/away, vs LHP/RHP, and day/night splits for a player.

**Response (hitting):**
```json
{
  "playerId": 592450,
  "home":    { "avg": ".305", "ops": "1.012", "hr": 10 },
  "away":    { "avg": ".278", "ops": ".962",  "hr": 8  },
  "vsLeft":  { "avg": ".320", "ops": "1.040" },
  "vsRight": { "avg": ".272", "ops": ".951"  },
  "day":     { "avg": ".298", "ops": ".978"  },
  "night":   { "avg": ".285", "ops": ".996"  }
}
```

---

## Game Context

### `GET /api/umpires/:gamePk`
Home plate umpire with historical zone tendency stats.

**Response:**
```json
{
  "gamePk": 716463,
  "homePlate": {
    "id": 427,
    "name": "Angel Hernandez",
    "stats": {
      "kRate": "19.2%",
      "bbRate": "9.1%",
      "tendency": "Tight zone — favors pitchers",
      "rating": "pitcher"
    }
  }
}
```

---

### `GET /api/nrfi/:gamePk`
First-inning scoring tendencies for both teams.

**Response:**
```json
{
  "gamePk": 716463,
  "away": { "scoredPct": 0.38, "avgRuns": 0.52, "tendency": "Slow starters" },
  "home": { "scoredPct": 0.41, "avgRuns": 0.58, "tendency": "Average 1st inning output" },
  "lean": "NRFI",
  "confidence": 64
}
```

---

### `GET /api/bullpen/:gamePk`
Bullpen health, fatigue level, and individual reliever usage for a team.

**Response:**
```json
{
  "gamePk": 716463,
  "away": {
    "grade": "A",
    "fatigue": "FRESH",
    "pitchesLast3Days": 87,
    "relievers": [
      { "id": 518886, "name": "Clay Holmes", "era": "2.10", "whip": "1.01", "lastApp": "2026-04-17", "pitches": 14, "k9": "9.8", "bb9": "2.4" }
    ]
  },
  "home": { ... }
}
```

---

### `GET /api/injuries`
Active IL placements from the last 14 days across all MLB teams.

**Response:**
```json
[
  { "playerId": 592450, "playerName": "Aaron Judge", "team": "NYY", "date": "2026-04-10", "note": "10-Day IL — oblique strain" }
]
```

---

## Odds & Props

### `GET /api/odds`
Today's MLB game lines (moneyline, total, runline) from DraftKings, FanDuel, Caesars, BetMGM.  
Shared server cache — **20 minutes**. Does not burn quota on repeat calls.

**Response:**
```json
{
  "map": {
    "New York Yankees|Philadelphia Phillies": {
      "awayML": "+108", "homeML": "-128",
      "total": "8.5", "overOdds": "-110", "underOdds": "-110",
      "awaySpread": "+1.5", "awaySpreadOdds": "-170",
      "homeSpread": "-1.5", "homeSpreadOdds": "+142",
      "book": "DK",
      "books": {
        "DK":  { "awayML": "+108", "homeML": "-128", "total": "8.5" },
        "FD":  { "awayML": "+106", "homeML": "-126", "total": "8.5" }
      }
    }
  },
  "eventIdMap": { "New York Yankees|Philadelphia Phillies": "abc123eventid" },
  "remaining": "380",
  "used": "120",
  "fetchedAt": "1:04:22 PM"
}
```

---

### `GET /api/player-props/:gamePk?eventId=<oddsEventId>`
Sportsbook player prop lines (K, TB, H, HR) for a specific game.  
Shared server cache — **10 minutes**. Pass `eventId` from `/api/odds` to skip an extra lookup.

**Response:**
```json
{
  "gamePk": 716463,
  "props": [
    { "player": "Gerrit Cole", "market": "pitcher_strikeouts", "marketLabel": "K", "line": 7.5, "overOdds": "-115", "underOdds": "-105", "book": "DraftKings" },
    { "player": "Aaron Judge",  "market": "batter_home_runs",   "marketLabel": "HR", "line": 0.5, "overOdds": "+150", "underOdds": "-185", "book": "DraftKings" }
  ]
}
```

---

## AI Analysis

### `POST /api/props/:gamePk`
Generates 3–5 AI prop recommendations for a game using Claude + live web search.  
Cached **45 minutes** per game. Returns picks with confidence, lean, and cited reasoning.

**Request body:**
```json
{ "context": "<pre-formatted game summary string — see below>" }
```

**Context string format** (build this from the other endpoints):
```
Game: NYY @ PHI at Citizens Bank Park
Away SP: Gerrit Cole (RHP) — ERA 2.85, WHIP 1.04, K/9 10.8, BB/9 2.1, avgIP 6.4, avgK 8.7, avgPC 101
Home SP: Zack Wheeler (RHP) — ERA 2.91, WHIP 1.09, K/9 9.8, BB/9 2.2, avgIP 6.2, avgK 8.1, avgPC 97
Umpire: Angel Hernandez — K Rate 19.2%, BB Rate 9.1%, tendency: Tight zone — favors pitchers
Weather: 72°F, 9 mph OUT to RF, partly cloudy
Park: Citizens Bank Park — HR factor +8%, Hit factor +3%
Away Bullpen: Grade A, Fatigue FRESH
Home Bullpen: Grade B, Fatigue MODERATE
NRFI lean: NRFI (64% confidence) — away scored 38%, home scored 41% in 1st inn
Total: 8.5 (-110 / -110) — DK
Cole K line: O7.5 -115 DK
Wheeler K line: O6.5 -120 DK
```

**Response:**
```json
{
  "gamePk": 716463,
  "searchUsed": true,
  "props": [
    {
      "label": "Cole K's O/U 7.5",
      "propType": "K",
      "lean": "OVER",
      "positive": true,
      "confidence": 72,
      "reason": "Cole's 10.8 K/9 against a lineup with 26% team whiff rate meets Hernandez's tight zone (19.2% K rate) and a pitcher-neutral park — line of 7.5 is beatable given his 8.7 K avg over last 3 starts."
    }
  ]
}
```

**propType values:** `K` | `Total` | `NRFI` | `F5` | `Outs` | `RL`  
**lean values:** `OVER` | `UNDER` | `NRFI` | `YRFI` | `OVER F5` | `UNDER F5` | `AWAY -1.5` | `HOME -1.5`

---

## Live Game State

### `GET /api/linescore/:gamePk`
Live score by inning for in-progress games.

**Response:**
```json
{
  "gamePk": 716463,
  "status": "In Progress",
  "inning": 6, "isTop": false,
  "away": { "abbr": "NYY", "runs": 3, "hits": 6, "errors": 0 },
  "home": { "abbr": "PHI", "runs": 2, "hits": 5, "errors": 1 },
  "innings": [
    { "num": 1, "away": 1, "home": 0 },
    { "num": 2, "away": 0, "home": 2 }
  ]
}
```

---

### `GET /api/boxscore/:gamePk`
Full boxscore for in-progress or final games. Includes batter and pitcher lines.

**Response:**
```json
{
  "gamePk": 716463,
  "status": "Final",
  "away": {
    "batters": [{ "name": "Aaron Judge", "ab": 4, "h": 2, "hr": 1, "rbi": 2, "bb": 1, "k": 1 }],
    "pitchers": [{ "name": "Gerrit Cole", "ip": "7.0", "h": 5, "er": 2, "k": 9, "bb": 1 }]
  },
  "home": { ... }
}
```

---

## Recommended Research Flow

For a full pre-game picture, call endpoints in this order:

```
1. GET /api/schedule                          → get gamePk + pitcher IDs
2. GET /api/lineups/:gamePk                   → batting order + batter IDs
3. GET /api/players/:pitcherId/stats?group=pitching   → SP season stats
4. GET /api/players/:pitcherId/gamelog?group=pitching  → SP recent form
5. GET /api/arsenal/:pitcherId                → SP pitch mix (Statcast)
6. GET /api/pitcher-splits/:pitcherId         → SP vs L/R
7. GET /api/splits/:batterId  (per batter)    → batter vs pitch types
8. GET /api/players/:batterId/vs/:pitcherId   → H2H history
9. GET /api/stat-splits/:batterId             → home/away + L/R splits
10. GET /api/umpires/:gamePk                  → home plate ump tendency
11. GET /api/nrfi/:gamePk                     → first inning lean
12. GET /api/bullpen/:gamePk                  → bullpen health
13. GET /api/injuries                         → check for scratches
14. GET /api/odds                             → current lines + totals
15. GET /api/player-props/:gamePk?eventId=... → prop lines
16. POST /api/props/:gamePk  { context }      → AI picks with reasoning
```
