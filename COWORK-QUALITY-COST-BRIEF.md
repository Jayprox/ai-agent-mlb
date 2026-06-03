# Prop Scout Mobile — Quality vs. Cost Balance (Cowork Brief)

> **Purpose:** Recommended strategy for data freshness, API usage, and AI spend.  
> **Read first:** `COWORK-HANDOFF.md` — shared daily snapshots, 10 AM HI schedule, web vs mobile status.  
> **Companion doc:** `COWORK-DATA-BRIEF.md` (how the app consumes the backend today).  
> **Last updated:** May 26, 2026

This is an **opinionated target**, not current behavior everywhere. Use it when prioritizing mobile/backend work.

---

## Summary

Prop Scout is a **pregame research** app, not a live trading terminal. The best balance:

1. **Backend** owns freshness via scheduled snapshots (Postgres + cron).
2. **Mobile** reads a small set of endpoints, runs board scoring locally (`@repo/board`), and calls **AI only on user intent**.
3. **Stop paying twice** for the same data (duplicate Slate/Board enrichment, Predict pulling full board pipeline, mobile polling faster than backend jobs).

**Quality** = correct probables, props, weather/splits inputs, and live scores during games.  
**Cost** = Odds API quota, redundant MLB fan-out per session, and OpenAI/Anthropic calls.

---

## Tiered freshness model (target)

| Tier | Data | Target freshness | Who refreshes | Cost driver |
|------|------|------------------|---------------|-------------|
| **Live** | Linescore, game status | ~**1 minute** | Backend cron + short cache | Low (MLB, free) |
| **Lines** | Odds, player props | ~**15–20 minutes** | Backend job → DB | **High** (Odds API) |
| **Pregame** | NRFI, lineups, bullpen, umpire | ~**30–60 minutes** | Backend jobs + on-demand for Game | Medium (MLB volume) |
| **Research** | Gamelogs, Savant, team stats | ~**6 hours** (+ 10am/2pm HST prefetch) | Backend cron | Low if shared |
| **AI** | Daily Card, card summaries, AI board, Chat | **Cron** (10 AM HI + pregame) + on intent for Chat | Server | **Highest** ($) — **cap via snapshot** |

There is **no single SLA** in code today — freshness is per-route TTL + per-hook `staleTime`. This table is the **recommended product standard** going forward.

**Implemented on backend + web:** `dailyAiSnapshot` writes board markets, card summaries, and Predict edges to Postgres; clients read `GET /api/board/snapshot` and `GET /api/ai-board/edges` with **zero Anthropic on GET**. Mobile still needs to adopt those reads.

---

## What to keep tight (worth the cost)

### 1. Live scores and status

- **Linescore:** ~60s for **in-progress** games only (backend already cron's `snapshotLinescore` every minute).
- **Schedule status:** ~5 min when any game is live; don't treat a quiet morning slate like a live scoreboard.
- **Do not** poll linescore for scheduled games that haven't started.

**Why:** Users notice stale LIVE badges; MLB linescore is cheap.

### 2. Odds and player props

- **Backend:** refresh every **15–20 minutes** during slate hours (odds job already ~15 min; props ~20 min).
- **Mobile:** 20 min `staleTime` via `slate-bundle` (matches backend snapshot cadence). ✅ Done.
- **Player props:** fetch for **Game / Props tab** (user intent), not for entire slate on every Board open.

**Why:** Odds API is the main quota risk; 15–20 min is fine for prop research.

### 3. Lineups near first pitch

- Refresh lineups **every 15 min** in the **2 hours before first pitch**, plus fetch when user opens a game.
- Avoid assuming lineups are stable all day.

**Why:** Confirmed lineups materially affect board quality; still cheaper than per-minute odds.

---

## What to loosen (small quality loss, large savings)

### 1. One enrichment pipeline (mobile) ✅ Done

~~**Today:** `useSlateCore` (`slate-enrich`) and `useBoardData` (`board-enrichment`) overlap — duplicate NRFI, linescore, and related per-game calls when users visit Slate then Board.~~

**Current:** `GET /api/slate-bundle` is the single first-paint call for Slate. It provides `schedule`, `oddsMap`, `nrfiMap`, and `weatherMap` in one response. `useBoardData` accepts `externalNrfi` and `externalWeather` from `useSlateCore` — no duplicate fetches. TanStack Query dedupes the bundle key across both hooks.

### 2. Board open ≠ full slate enrichment

**Today:** Opening Board triggers parallel requests for **every** game (lineups, props, umpire, boxscore for live, etc.).

**Target:**

- **Phase 1 (done):** Bundle covers first paint; board enrichment adds only per-game detail.
- **Phase 2 (optional):** Enrich only games that produce candidates for the active tab, or cap concurrent game fetches.

**Savings:** Large on full slates (15 games × 4+ calls).

### 3. Weather and stat-splits — batch, bounded ✅ Done

~~**Today:** `liveWeather` and `liveStatSplits` are empty in `useBoardData` — board runs with placeholders.~~

**Current:**
- Weather is fetched as part of `GET /api/slate-bundle` (per-stadium 1-hr cache; dome bypass).
- `GET /api/stat-splits/:id` fetched for starters + top 6 lineup batters in `useBoardData`.
- `GET /api/arsenal/:pitcherId` fetched per starter; `pitcherArsenal` passed to `computePitcherBoard`.

### 4. Savant only where needed

- **Game → Arsenal tab:** keep `usePitcherArsenal` / `useBatterSplits` (6h stale is fine).
- **Board:** arsenal fetched per starter in `useBoardData` — bounded (2 per game × up to 15 games).

### 5. Injuries

- **30–60 min** refresh is sufficient; no need to couple with schedule polls.

---

## AI: strictest cost lever

| Feature | Current risk | Recommended policy |
|---------|--------------|-------------------|
| **Daily Card** | Regenerated on demand | **Cron only** (9am + pregame window); mobile read-only, **30–60 min** cache |
| **Card summaries** | Fires for many board cards | Only **visible** cards (viewport), debounced; optional daily cap per user |
| **AI board / Predict** | Mobile: full `useBoardData` + `POST /api/ai-board/score`. Web: `GET /api/ai-board/edges` | **Mobile:** wire to edges snapshot (backend ✅). No scoring on tab open |
| **Board display** | Mobile: local `@repo/board` + per-session fan-out | **Mobile:** wire to `GET /api/board/snapshot` for ranks + `_boardSummary` (web ✅) |
| **Card summaries** | Mobile: `POST /api/card-summary` per card | Use snapshot text when present; POST only on cache miss / live edge cases |
| **Chat** | Per message | Keep **allowlist + daily message cap** (already in place) |

**Rule:** AI is a **premium layer** for explicit user action — not a side effect of opening Board.

**Biggest single win:** Stop coupling Predict tab to a full board enrichment on every visit.

---

## Target architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Railway cron (HI): midnight Wave 1, 10 AM AI snapshot, pregame  │
│  → Postgres: schedule, odds, board_daily_snapshots, edges, cards   │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  Express GET (no LLM): /api/slate-bundle, /api/board/snapshot,    │
│                        /api/ai-board/edges                       │
└───────────────────────────────┬──────────────────────────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              ▼                                   ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐
│  Web (reference) ✅          │   │  Mobile (target) 🔲          │
│  Snapshot board + edges      │   │  Still bundle + enrichment   │
│  Seeded SIM; shared copy     │   │  → migrate to GET snapshots  │
└─────────────────────────────┘   └─────────────────────────────┘
```

---

## Recommended freshness targets (concrete)

| Data | Backend refresh | Mobile read |
|------|-----------------|-------------|
| Live linescore | 60s (in-progress only) | Shared enrichment; 60s when live |
| Schedule + odds + NRFI + weather | Bundle: 5 min (2 min live) | `slate-bundle` staleTime 5 min |
| Odds | 15 min (cron) | Via bundle, 20 min effective |
| Player props | 20 min (cron) | On Game/Props tab; cache 20 min |
| Arsenal / stat-splits | 6h Savant | In `useBoardData`, 6h stale |
| Gamelogs / team stats | 6h + 10am/2pm prefetch | 6h stale in board enrichment |
| AI summaries | N/A | On-demand, visible cards only |
| AI board edges | 10 AM HI + pregame (`dailyAiSnapshot`) | `GET /api/ai-board/edges` — web ✅, mobile 🔲 |
| Board ranks + card text | Same job → `board_daily_snapshots` | `GET /api/board/snapshot` — web ✅, mobile 🔲 |

---

## What not to optimize first

- **Sub-minute odds** — not a sportsbook terminal; 15–20 min is industry-adequate for research.
- **Pull-to-refresh invalidating everything** — keep manual refresh, but respect `staleTime`.
- **Mobile Phase 3** (backend-computed board scores) — only worthwhile after Phase 2 enrichment pruning is validated.

---

## Highest-ROI remaining work

1. **Wire mobile Predict to `GET /api/ai-board/edges`** — web done; iOS still uses `POST /api/ai-board/score` (`CURSOR-TASK-PREDICT-SNAPSHOT.md`).
2. **Wire mobile Board to `GET /api/board/snapshot`** — display + summaries from Postgres; reduce `useBoardData` to live/why-only paths.
3. **Mobile Phase 3** — `GET /api/board-scores` (optional after snapshot reads).
4. **Fix Baseball Savant scraping** (Task #70) — swap CSV endpoints for official API.

Previously highest-ROI items now complete:  
✅ Unified slate enrichment via `GET /api/slate-bundle`  
✅ Weather + stat-splits + arsenal wired into board scoring  
✅ Mobile odds polling aligned to 20 min  

---

## Current state vs. target (honest gap list)

| Area | Status | Notes |
|------|--------|-------|
| Weather on mobile | ✅ **Done** | Via `slate-bundle`; dome bypass in place |
| Stat-splits on board | ✅ **Done** | Fetched per starter + top 6 batters in `useBoardData` |
| Arsenal on board | ✅ **Done** | `pitcherArsenal` fetched per starter, passed to `computePitcherBoard` |
| Slate vs Board enrich | ✅ **Done** | `slate-bundle` shared; `externalWeather`/`externalNrfi` passed through |
| Odds mobile poll | ✅ **Done** | 20 min via bundle |
| Shared board snapshot | ✅ **Web** / 🔲 **Mobile** | `GET /api/board/snapshot`; job at midnight (early), **10 AM HI** (authoritative), pregame |
| Predict / AI edges | ✅ **Web** / 🔲 **Mobile** | `GET /api/ai-board/edges`; **10 AM HI** + pregame; no `POST /api/ai-board/score` on web |
| Cross-client consistency | ✅ **Web verified** | Seeded SIM + snapshot copy; mobile still per-session compute |
| Backend DB snapshots | ✅ **Done** | Odds, props, schedule, board, edges, card summaries |
| Mobile Phase 3 | 🔲 **Not started** | Backend-computed board scores (after snapshot read path) |

---

## Instructions for Cowork

**When implementing features:**

- Classify data into the tier table above before choosing `staleTime` or a new cron job.
- Prefer **backend snapshot + longer mobile cache** over **mobile-driven upstream fan-out**.
- Never add direct MLB/Odds/Savant/OpenAI calls from `mobile/`.
- For AI routes, default to **lazy / capped** unless the user explicitly asked for that output.
- Weather and NRFI for Board come from `useSlateCore` (via the bundle) — do not re-fetch in `useBoardData`.

**When estimating cost:**

- Count **per-game × per-session** requests for Board/Slate changes.
- Treat **Odds API** and **LLM tokens** as the budget lines to protect.

---

## Related files

| Doc / path | Contents |
|------------|----------|
| `COWORK-HANDOFF.md` | **Sprint handoff** — schedule, APIs, web vs mobile, ops |
| `COWORK-DATA-BRIEF.md` | API architecture, endpoints, hooks |
| `CURSOR-TASK-PREDICT-SNAPSHOT.md` | Mobile/web edges migration steps |
| `CURSOR-TASK-PHASE5-BOARD-SNAPSHOT.md` | Board snapshot design |
| `prop-scout-mobile-handoff.md` | Mobile feature status (older) |
| `backend/jobs/scheduler.js` | Cron cadences |
| `backend/jobs/runNewSlateDay.js` | Midnight Wave 1 |
| `backend/jobs/dailyAiSnapshot.js` | AI + board snapshot writer |
| `PROP_SCOUT_API.md` | Route reference |

---

*End of brief.*
