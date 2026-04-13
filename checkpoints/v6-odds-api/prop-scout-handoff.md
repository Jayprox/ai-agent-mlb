# Prop Scout — Project Handoff

## Overview

We're building a personal MLB sports betting research app called **Prop Scout**. The goal is to compress pre-game prop research from hours to minutes. It's a mobile-first React app (max-width 480px) with a desktop warning screen that prompts the user to resize their browser.

The entire app currently lives as a single JSX file (`prop-scout-v6.jsx`). The aesthetic is a dark Discord-style card UI with monospace fonts, green/yellow/red color coding, and a card-per-section layout inspired by a trading/finance dashboard.

---

## Current Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React (single JSX file, no build system yet) |
| Styling | Inline styles only, no CSS framework |
| Data | Mock data — structured to mirror real API response shapes |
| Weather API | Open-Meteo (wired, pending deployment) |
| Odds API | The Odds API ✅ wired, pending deployment — key in `.env` as `ODDS_API_KEY` |
| Stats API | MLB Stats API (requires backend proxy — CORS) |
| Arsenal API | Baseball Savant / Statcast (CSV-based, lowest urgency) |
| Database (planned) | PostgreSQL |
| Backend (planned) | Node/Express or Python/FastAPI |

---

## What's Been Built

### Slate View
- 6-game mock slate selector
- Each slate card shows: matchup, time, stadium, O/U total, line movement direction, NRFI/YRFI lean badge, weather badge, top K prop lean
- Tap any game to open the full game card

### Game Card — 5 Tabs

#### Overview Tab
- Head-to-head matchup score (hardened multi-factor formula — see Scoring Engine section)
- Unified pitcher + batter card with jersey number, team colors, key stats
- Hit rate tracker (last 10 games)
- Prop lean callout with tags

#### Lineup Tab
- Away/home toggle (away default — they face the home starter)
- Lineup vulnerability summary bar — shows how the whole lineup stacks vs each pitch in the starter's arsenal
- 9-batter hybrid rows: compact by default, tap to expand drawer
- Each row shows: order number, name, position, handedness, season AVG, last 5 game hit dots (green/grey), matchup score badge
- Expanded drawer shows: season stats, AVG + whiff % per pitch in starter's arsenal, matchup lean summary

#### Arsenal Tab
- Each pitch in the starter's arsenal with: usage bar, batter AVG against it, whiff rate, HANDLES / WEAK SPOT / NEUTRAL badge
- Exposure warnings: heavy usage (25%+) + weak spot = red alert; heavy usage + handles well = green multiplier callout

#### Intel Tab
- **Weather card** — temp, wind (translated to "8 mph OUT to RF" format), humidity, open air vs dome, rain chance, HR WEATHER badge. Sandbox/live toggle built in — currently shows mock data with amber DEMO badge, flips to live Open-Meteo API when `IS_SANDBOX = false`
- **Umpire card** — name, zone tendency, K rate, BB rate, PITCHER UMP / NEUTRAL UMP badge
- **NRFI/YRFI card** — both teams' first inning scoring % and tendencies, confidence-weighted lean badge
- **Bullpen strength cards** (one per team) — overall letter grade (A–C), fatigue level, setup depth, L/R balance, lean callout, expandable reliever list. Each reliever shows ERA, WHIP, last appearance, pitch count, fatigue status, vs LHB / vs RHB platoon splits, platoon edge summary

#### Props Tab
- Confidence meter per prop (0–100% bar)
- Color coded: green 70+, yellow 50–69, grey below 50
- Lean badge (OVER / UNDER / YES) + reasoning baked in per prop

---

## Matchup Scoring Engine

The core intelligence of the app. Calculates a 0–100 score for how a batter matches up against a specific pitcher's arsenal. Used on both the Overview H2H card and each individual batter row in the Lineup tab.

### Formula (per pitch)

```
AVG component   (45%) — scaled .150 floor to .400 ceiling
Whiff component (35%) — 0% whiff = best, 50%+ = worst
SLG component   (20%) — scaled .200 floor to .700 ceiling
```

### Modifiers
- **Usage cap:** each pitch's influence capped at 40% max — prevents a pitcher like Strider (62% FF) from dominating the entire score
- **Handedness multiplier:** same-hand matchups (RHP vs RHB) apply a 0.92 penalty

### Thresholds
| Score | Color | Label |
|---|---|---|
| < 35 | 🟢 Green | Pitcher Edge |
| 35–54 | 🟡 Yellow | Neutral |
| 55+ | 🔴 Red | Batter Edge |

### Why this replaced the old formula
Previous AVG-only formula caused score compression — all batters clustered in a narrow 22–27 band with no meaningful spread. The 3-factor formula produces a true 0–100 range.

---

## Data Architecture

Mock data mirrors real API shapes. Each game object in the `SLATE` array contains:

```
away / home         — team name, abbr
time                — "7:08 PM ET"
stadium             — stadium name (matches STADIUMS lookup table)
location            — city, state
weather             — { temp, condition, wind, humidity, roof, hrFavorable }
umpire              — { name, kRate, bbRate, tendency, rating }
odds                — { awayML, homeML, total, overOdds, underOdds, movement, lineMove }
nrfi                — { awayFirst, homeFirst, lean, confidence }
bullpen             — { away, home } each with grade, gradeColor, fatigueLevel,
                      setupDepth, lrBalance, lean, relievers[]
pitcher             — { name, team, number, hand, era, whip, kPer9, bbPer9,
                        avgIP, avgK, avgPC, avgER, season{}, arsenal[] }
batter              — { name, team, number, hand, avg, ops, hr, rbi,
                        avgH, avgHR, avgTB, hitRate, hrRate, tbOver, vsPitches{} }
lineups             — { away[], home[] } — 9 batters each with:
                        order, name, pos, hand, avg, hr, tb, hitRate[],
                        vsPitches{ abbr: { avg, whiff, slg } }
props               — [{ label, confidence, lean, positive, reason }]
```

> **Note:** Game 1 (NYY vs PHI) has fully enriched `vsPitches` data with `{ avg, whiff, slg }` per pitch. Other games have AVG-only — the scoring engine falls back to estimated whiff (20%) and SLG (avg × 1.6) gracefully.

---

## API Integration Plan

### Priority Order

| # | API | Status | Notes |
|---|---|---|---|
| 1 | Open-Meteo | ✅ Wired, pending deploy | No key required. `IS_SANDBOX = true` flag controls live vs demo |
| 2 | The Odds API | ✅ Wired, pending deploy | Key in `.env` as `ODDS_API_KEY`. `IS_ODDS_SANDBOX = true` flag controls live vs demo |
| 3 | MLB Stats API | 🔜 Next | Free, official. Requires backend proxy due to CORS |
| 4 | Baseball Savant | 🔜 Last | Free, CSV-based. Low urgency — mock data holds well |

### Open-Meteo Details
- Endpoint: `https://api.open-meteo.com/v1/forecast`
- Parameters: `temperature_2m`, `windspeed_10m`, `winddirection_10m`, `weathercode`, `precipitation_probability`, `relativehumidity_2m`
- Stadium coordinate + orientation table built for all 30 MLB parks (in file as `STADIUMS` const)
- Wind direction converted to betting strings ("8 mph OUT to RF") using stadium orientation angle
- 30-minute in-memory cache keyed by game ID
- **To go live: flip `IS_SANDBOX = false` at top of file**

### The Odds API ✅
- Powers: moneyline, total, over/under odds
- Key stored in `.env` as `ODDS_API_KEY`
- Endpoint: `GET /v4/sports/baseball_mlb/odds?regions=us&markets=h2h,totals&oddsFormat=american`
- Prefers DraftKings book; falls back to first available bookmaker
- Games matched to SLATE by `"AwayTeamFullName|HomeTeamFullName"` key
- Live data merged over mock via `getGameOdds()` — mock `movement` text preserved as fallback
- 15-minute in-memory cache (`oddsCache` module-level object)
- Manual refresh button available on Intel tab odds card when live
- API usage (remaining calls) displayed on Intel tab when live
- Slate cards show live O/U + ML when matched; green dot indicator
- **To go live: flip `IS_ODDS_SANDBOX = false` at top of file**

### MLB Stats API (after that)
- Will power: lineups, player stats, splits, probable pitchers, umpire assignments, schedule
- Key player IDs confirmed:
  - Zack Wheeler: `554430`
  - Aaron Judge: `592450`
- Requires backend proxy — cannot be called directly from browser (CORS)

### Baseball Savant (last)
- Powers pitch arsenal data: mix %, velocity, whiff rate by pitch type
- CSV export endpoint — not a true REST API
- Updates per start, so stale data is acceptable

---

## Planned Backend Architecture

```
React App (mobile PWA)
        ↕
Node/Express or Python/FastAPI backend
        ↕
MLB Stats API · Savant · Odds API · Open-Meteo
        ↕
PostgreSQL DB
  ├── Pre-aggregated splits (vs LHB/RHP, home/away, rolling L7/L14/L30)
  ├── Arsenal snapshots (updated per start)
  ├── Historical game logs
  ├── Park factors (HR, hit, K factor per stadium)
  └── Umpire history
```

### Data Refresh Cadence
| Data | Frequency |
|---|---|
| Player/roster data | Daily |
| Game schedule | Daily |
| Historical game logs | Nightly after games end |
| Pre-aggregated splits | Nightly |
| Pitcher arsenal | Per start or weekly |
| Bullpen usage | Nightly |
| Park factors / umpire history | Weekly or start of season |
| Confirmed lineups | Day-of, 3–4hrs before first pitch |
| Odds/props | Real-time or every 15–30 min |
| Weather | Day-of, within 2hrs of first pitch |

---

## Key Design Decisions

| Decision | Choice | Notes |
|---|---|---|
| Layout | Unified card (Option 3) | Option 2 split view saved in back pocket |
| Default lineup | Away team | They face the home starter |
| Scoring formula | 3-factor (AVG + whiff + SLG) | Old AVG-only caused score compression |
| Mock data structure | Mirrors real API shapes | Clean swap when going live |
| Sandbox control | Single `IS_SANDBOX` boolean | Top of file, flip to `false` at deploy |
| File structure | Single JSX file | Intentional — keeps it portable as artifact |
| Desktop handling | Warning screen at >520px | Prompts user to resize; full responsive layout is future enhancement |

---

## Future Enhancements (Logged, Not Started)

- **Trends layer** — prop hit rate on specific lines (e.g. Judge OVER 1.5 TB last 10 games), pitcher K prop home vs away hit rate, NRFI streaks
- **Injury flags** — manual flag system to mark players questionable/out (scraper considered but fragile; manual preferred for v1)
- **Park factors** — HR factor, hit factor, K factor per stadium integrated into game card
- **Prop tracker** — log picks, track hit rate over time
- **Batter deep dive** — stadium history and vs-pitcher career tabs (built as standalone earlier in session, not yet integrated into lineup drawer)
- **Option 2 split view** — pitcher/batter side-by-side layout built and saved as alternative to unified card
- **Full desktop layout** — currently shows warning on screens wider than 520px; responsive layout is future enhancement
- **Bullpen dedicated tab** — currently lives in Intel tab; a full dedicated tab was discussed for deeper depth

---

## File State

| File | Description |
|---|---|
| `prop-scout-v6.jsx` | ✅ Current working file — hand this off |
| `prop-scout-v5b.jsx` | 🗄 Previous version — pre-Odds API integration |
| `prop-scout-handoff.md` | 📄 This document |
| `.env` | 🔑 `ODDS_API_KEY` — do not commit |

All previous versions (v1–v5, v5-fixed) are complete self-contained JSX files. No component splitting yet — everything intentionally in one file for portability.

---

## How to Continue in Cowork

1. Upload both `prop-scout-v6.jsx` and this `prop-scout-handoff.md` file
2. Tell Claude: *"Read the handoff doc and the JSX file. We're continuing development of Prop Scout."*
3. Claude will have full context on everything built, every decision made, and exactly where to pick up

---

*Updated April 2026 — Prop Scout v6 (Odds API wired)*
