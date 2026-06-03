# Cowork Handoff — Shared Daily Snapshots (May 2026)

> **Read this first**, then `COWORK-DATA-BRIEF.md` (how mobile calls the API) and `COWORK-QUALITY-COST-BRIEF.md` (freshness / cost strategy).  
> **Last updated:** May 26, 2026

---

## Product goal

**Every user sees the same numbers and copy for a given Honolulu calendar day** — board SIM %, factor scores, italic card summaries, and Predict edges — sourced from **one Postgres write path**, not per-device Monte Carlo or on-demand Anthropic calls.

The **web app** (`prop-scout-v7.jsx`) is the reference implementation for this model. **Mobile (Expo)** should converge to the same read-only snapshot endpoints; it still computes board locally and calls `POST /api/ai-board/score` today.

---

## Honolulu-time job schedule

All cron times use `Pacific/Honolulu` unless noted.

| When | Job | What it writes |
|------|-----|----------------|
| **12:05 AM** | `runNewSlateDay()` — Wave 1 | Schedule, odds, injuries, pitcher/batter gamelogs, Savant, NRFI; optional early Daily Card + **first** `generateDailyAiSnapshot("midnight-wave1")` if `ANTHROPIC_API_KEY` set |
| **8:00 AM** | `snapshotSlate` | Schedule refresh |
| **9:00 AM** | `regenerateDailyCard` | Daily Card narrative |
| **10:00 AM** | `generateDailyAiSnapshot("10am-scheduled")` | **Authoritative** board markets, card summaries, Predict edges in Postgres |
| **10:00 AM** | Gamelogs, Savant, NRFI, umpires | Research prefetch (same wall-clock window) |
| **~95 min before first pitch** | `generateDailyAiSnapshot("pregame")` | Re-score with confirmed lineups (once/day) |
| **~95 min before first pitch** | `snapshotNrfiForSlate`, Daily Card | Lineup-aware refresh |
| **Every 15 min** | `snapshotOdds` | Odds map (global, not HI-only) |
| **Every 1 min** | `snapshotLinescore` | In-progress games only |

**Why 10 AM HI:** ~2 hours before a typical East Coast first pitch (6 PM ET ≈ 12 PM HI). User asked to move earlier from 1 PM → 12 PM → **10 AM HI**.

---

## Snapshot APIs (read path — no LLM on GET)

| Endpoint | Purpose | Mobile today |
|----------|---------|--------------|
| `GET /api/board/snapshot?date=YYYY-MM-DD` | Pre-ranked candidates per market (`k`, `outs`, `hits`, `hr`, …) + embedded `_boardSummary` text | **Not wired** — board still uses `useBoardData` fan-out + local `@repo/board` |
| `GET /api/ai-board/edges?date=YYYY-MM-DD` | Pre-scored Predict / AI Board candidates; `fallback: true` if job not run yet | **Not wired** — still `POST /api/ai-board/score` |
| `POST /api/card-summary` | DB cache hit when snapshot ran; still used for misses | **Still on-demand POST** per card |

**Web (done):** Production board requires today's snapshot; polls `/api/board/snapshot` every 90s until present; Predict/AI Board/Chat use `/api/ai-board/edges`. Per-client `POST /api/card-summary` skipped when snapshot covers the tab. SIM uses **seeded RNG** (`src/scoring/sim.js`) so scores are deterministic for a given card key.

**Docs:** `PROP_SCOUT_API.md` (edges + snapshot), `CURSOR-TASK-PREDICT-SNAPSHOT.md`, `CURSOR-TASK-PHASE5-BOARD-SNAPSHOT.md`.

---

## Key backend files

| File | Role |
|------|------|
| `backend/jobs/scheduler.js` | All cron wiring |
| `backend/jobs/runNewSlateDay.js` | Midnight Wave 1 orchestration |
| `backend/jobs/dailyAiSnapshot.js` | Build enrichment → score → `board_daily_snapshots`, `ai_board_edges`, `card_summaries` |
| `backend/routes/boardDailySnapshot.js` | `GET /api/board/snapshot` |
| `backend/routes/aiBoard.js` | `GET /api/ai-board/edges` |
| `backend/lib/cardSummaryKeys.js` | Canonical `dbCardKey`, Honolulu `todayHonolulu()` |
| `backend/lib/bootstrapEnv.js` | Local dev: swap `railway.internal` → `DATABASE_PUBLIC_URL` |
| `backend/scripts/runBoardSnapshot.js` | Manual full snapshot — `npm run snapshot:today` |

**Admin trigger (Railway / local):** `GET /api/admin/jobs/midnight-slate` (optional `?skipAi=1` for facts-only).

---

## Database / local dev

- Snapshots require **Postgres** (`DATABASE_URL` on Railway).
- From a Mac, use **`DATABASE_PUBLIC_URL`** in `backend/.env` (or set `DATABASE_URL` to the public host). `bootstrapDatabaseEnv()` in `server.js` auto-swaps internal Railway URLs.
- One-shot: `npm run snapshot:today` (needs backend env + `ANTHROPIC_API_KEY`; runs against localhost:3001 internal routes).
- Typical successful run: 15 edges, 15 card summaries, **8/10 board markets** (often `hits`/`hr` thin before lineups — pregame run fills gaps).

**Two terminals for web dev:**

```bash
npm start          # backend :3001
npm run dev        # vite :5173
```

---

## Ship / ops tracker (Cowork)

Most snapshot work is implemented locally but **not live until deployed**. Track these before expecting prod users (web or mobile) to see shared boards.

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 1 | **Merge & deploy** snapshot branch to Railway (`ai-agent-mlb-production`) | — | ☐ | Large WIP: scheduler, `runNewSlateDay`, `dailyAiSnapshot`, board/edges routes, web snapshot reads, `bootstrapEnv`, etc. |
| 2 | **Restart API** after deploy | — | ☐ | Required for new cron (`0 10 * * *` HI) and route mounts to take effect |
| 3 | **`ENABLE_JOBS=true`** on Railway API service | — | ☐ | Without this, no midnight / 10 AM / pregame jobs run |
| 4 | **`ANTHROPIC_API_KEY`** on Railway | — | ☐ | Midnight Wave 1 **skips AI** if missing — facts load but no board/edges/summaries |
| 5 | **`DATABASE_URL`** on Railway (private URL on API service) | — | ☐ | Snapshots persist to Postgres; verify `isConnected()` in startup logs |
| 6 | **Post-deploy smoke test** | — | ☐ | See commands below — run after deploy and after first 10 AM HI job |
| 7 | **Monitor job logs** (first week) | — | ☐ | Check Railway logs after **12:05 AM HI** and **10:00 AM HI** for `dailyAiSnapshot` success / errors |
| 8 | **Manual backfill if needed** | — | ☐ | `npm run snapshot:today` from dev machine with `DATABASE_PUBLIC_URL` + `ANTHROPIC_API_KEY` if jobs missed or before first scheduled run |
| 9 | **`.env.example`** — add `ANTHROPIC_API_KEY` | — | ☐ | Prevents local/onboarding footguns; doc-only unless someone picks it up |

### Post-deploy smoke commands

Replace `$API` with `https://ai-agent-mlb-production.up.railway.app` (or staging URL).

```bash
# Today's Honolulu date (macOS)
DATE=$(TZ=Pacific/Honolulu date +%Y-%m-%d)

# Board snapshot — should NOT return { "empty": true } after a successful job
curl -s "$API/api/board/snapshot?date=$DATE" | head -c 500

# AI edges — fallback:false after 10 AM HI (or after manual snapshot:today)
curl -s "$API/api/ai-board/edges?date=$DATE"

# Optional: trigger midnight wave manually (needs ADMIN_SECRET if configured)
# curl -s "$API/api/admin/jobs/midnight-slate"
```

**Expected healthy signals in logs:**

- `✓ midnight slate rollover` / `midnight-slate [generateDailyAiSnapshot]` (12:05 AM HI)
- `✓ dailyAiSnapshot [10am-scheduled] complete` with edges + summaries counts (10:00 AM HI)
- `✓ dailyAiSnapshot [pregame] complete` (~95 min before earliest game)

**If jobs fail:** users on web prod see “Shared board is being built” until snapshot exists; mobile unaffected until wired but won't get shared data from backend anyway.

---

## Web fixes already shipped (reference for mobile)

1. **No mock slate in live mode** — if schedule API fails, show error/loading; never fall back to 6-game demo `SLATE` (scout vs normal user mismatch).
2. **Shared snapshot banner** — green “Shared daily board” when snapshot loaded; yellow “Live board (not shared yet)” in dev only.
3. **Deterministic SIM** — same seed key → same SIM % across browsers/incognito.
4. **Slate bundle** — schedule + odds + NRFI + weather still from live/bundle paths; snapshot layer is board display + AI copy + edges.

---

## Highest-priority mobile work (for Cowork)

1. **`usePredictPlays`** → `GET /api/ai-board/edges` (remove dependency on full `useBoardData` + `POST /api/ai-board/score`). See `CURSOR-TASK-PREDICT-SNAPSHOT.md`.
2. **Board tab** → `GET /api/board/snapshot` for display ranks + `_boardSummary`; keep or reduce enrichment only for “why” modals / live games.
3. **`useCardSummaries`** → prefer snapshot text by `dbCardKey`; stop batch POST when snapshot covers today.
4. **Optional Phase 3** — `GET /api/board-scores` (backend-computed factors) — only after snapshot read path is stable.

**Do not** call MLB / Odds / Savant / Anthropic from `mobile/` — only new `/api/*` reads.

---

## Known gaps / follow-ups

| Item | Notes |
|------|--------|
| iOS Predict still scores on open | Wire to edges endpoint |
| iOS board still full fan-out | Wire to board snapshot |
| Midnight snapshot may miss HR/hits markets | Re-run at 10 AM or pregame; or manual `snapshot:today` |
| Predict filter `edge >= 0.08` | Confirm game candidates include `edge` field in snapshot rows |

*(Deploy / env / monitoring — see **Ship / ops tracker** above.)*

---

## Verification checklist

**Prod (after Ship / ops tracker complete):**

- [ ] Two browsers (or incognito): same board order, SIM %, italic text on shared snapshot day
- [ ] `curl "$API/api/board/snapshot?date=<today HI>"` → non-`empty` payload with markets populated
- [ ] `curl "$API/api/ai-board/edges"` → `fallback: false` after 10 AM HI job
- [ ] Railway logs show successful `10am-scheduled` run

**Mobile (separate track):**
- [ ] Grep mobile for `ai-board/score` — should trend to zero once Predict is migrated
- [ ] Mobile grep: no new direct external API URLs

---

*For endpoint-level mobile detail see `COWORK-DATA-BRIEF.md`. For freshness tiers and cost rules see `COWORK-QUALITY-COST-BRIEF.md`.*
