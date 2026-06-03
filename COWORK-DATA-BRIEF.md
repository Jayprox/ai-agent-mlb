# Prop Scout Mobile — Data Layer & API Architecture (Cowork Brief)

Use this document as the source of truth for how the **iOS app** (`mobile/`) gets data. Do not assume the mobile client calls MLB, The Odds API, Baseball Savant, or OpenAI directly — it does not.

> **Sprint context:** Read **`COWORK-HANDOFF.md`** first for shared daily snapshots (Postgres + cron), what's done on web vs pending on iOS, and the 10 AM HI refresh schedule.

---

## Project context

- **Repo:** `ai-agent-mlb` (monorepo: `mobile/`, `backend/`, `src/`, web shell `prop-scout-v7.jsx`)
- **Product focus:** **Mobile iOS (Expo SDK 54)** is the primary shipping client. The web UI is the **reference implementation** for shared snapshot reads (`GET /api/board/snapshot`, `GET /api/ai-board/edges`); mobile should converge to those endpoints — not duplicate full board enrichment + on-demand AI scoring per session.
- **Backend:** Node/Express in `backend/` — the **only** HTTP target for the mobile app.
- **Shared logic:** `src/` at repo root (board scoring, constants, utils) is **bundled into the app** via Metro — not fetched over the network.
- **Production API:** `https://ai-agent-mlb-production.up.railway.app` (set via `EXPO_PUBLIC_API_BASE` in `mobile/.env`).

---

## Critical rule: mobile → backend only

The iOS app **never** calls external APIs directly.

- All HTTP goes through `mobile/src/api/client.ts` → `fetch(\`${API_BASE}${path}\`)`.
- `API_BASE` = `process.env.EXPO_PUBLIC_API_BASE` (see `mobile/src/config/env.ts`).
- There are **zero** references in `mobile/` to `mlb.com`, `statsapi`, `the-odds-api`, `baseballsavant`, etc.
- API keys (`ODDS_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) live **only on the backend**.

**Architecture:**

```
iOS app (Expo)
    │  HTTPS only — paths like /api/slate-bundle, /api/lineups, …
    ▼
Prop Scout backend (Express on Railway or localhost:3001)
    │  proxies / caches / enriches
    ▼
MLB Stats API, The Odds API, Baseball Savant CSV, OpenAI, Anthropic, weather, Postgres, Redis, …

iOS app also imports ../src/ at build time (Metro watchFolders) for client-side scoring — no HTTP from src/
```

When adding features, **add or use backend routes** under `/api/*`. Do not wire third-party SDKs or direct `fetch` to external URLs in `mobile/`.

---

## HTTP client pattern

**File:** `mobile/src/api/client.ts`

- Function: `apiRequest<T>(path, options?)`
- Base URL: `API_BASE` + path (e.g. `/api/slate-bundle`)
- Optional `token` → `Authorization: Bearer <JWT>`
- `401` → triggers global logout via `setUnauthorizedHandler` (unless `skipAuthRedirect: true`)
- Errors: parses `{ error }` from JSON body when present
- **No** axios, no GraphQL, no WebSockets

**Auth storage:** `expo-secure-store` via `mobile/src/storage/token.ts`  
**Auth state:** Zustand `mobile/src/stores/authStore.ts`  
**Bootstrap:** `AppProviders` calls `bootstrap()` on launch → read token → `GET /api/auth/me`

---

## State management

| Concern | Technology |
|--------|------------|
| Server / API data | **TanStack Query v5** (`@tanstack/react-query`) in hooks |
| Auth session | **Zustand** (`useAuthStore`) |
| AI card one-liners | Local React state in `useCardSummaries` (not TanStack) |
| Board / model rankings | **Client-side** — `@repo/board`, `@repo/utils`, `@repo/constants` |

**Metro shared imports** (`mobile/metro.config.js`):

```js
config.watchFolders = [path.join(workspaceRoot, 'src')];
// tsconfig: "@repo/*" → "../src/*"
```

Examples: `computePitcherBoard`, `computeBatterBoard`, `computeGameBoard`, `buildAiBoardPayload`, `formatLocalTime`, `PARK_FACTORS`, `UMPIRE_STATS`.

---

## Environment

```bash
# mobile/.env (never commit)
EXPO_PUBLIC_API_BASE=https://ai-agent-mlb-production.up.railway.app
# Local dev on physical device: use machine LAN IP, NOT localhost
# EXPO_PUBLIC_API_BASE=http://192.168.x.x:3001
```

Expo inlines `EXPO_PUBLIC_*` at build time.

---

## Auth: what requires login

| Feature | Auth required? | Notes |
|---------|----------------|-------|
| Slate, Board, Game, Model (Daily Card + K picks) | **No** | Most `apiRequest` calls omit token |
| Predict tab UI | Sign-in gate in UI | `POST /api/ai-board/score` uses token but `skipAuthRedirect` on 401 |
| Chat | **Yes** + backend allowlist | `POST /api/chat` → 403 if user not on `AI_PICKS_ALLOWLIST` |
| Login | `POST /api/auth/login`, `GET /api/auth/me` | JWT in Secure Store |

---

## Data consumption by screen

### Slate — `useSlateCore` (`mobile/src/hooks/useSlateCore.ts`)

| Query key | Endpoint | Refresh |
|-----------|----------|---------|
| `slate-bundle` | `GET /api/slate-bundle` | stale 5 min; 2 min when any game is live |
| `injuries` | `GET /api/injuries` | stale 30 min |
| `slate-enrich` | Per game: `GET /api/linescore/:pk` (live/final only) | stale 60s, refetch 60s |

`GET /api/slate-bundle` returns `{ schedule, oddsMap, nrfiMap, weatherMap }` in a single call, replacing the previous separate `GET /api/schedule`, `GET /api/odds`, and per-game `GET /api/nrfi/:pk` calls.

Transforms: `buildActiveSlate`, `mergeGameOdds`. Returns `activeSlate`, `liveOddsMap`, `liveNrfiData`, `liveWeather` to consumers.

**Screen:** `SlateListScreen` → `SlateCard` → navigates to `GameScreen`.

---

### Board — `useBoardData` + `useCardSummaries`

**`useBoardData`** (`mobile/src/hooks/useBoardData.ts`) — heavy enrichment, accepts `externalSlate`, `externalWeather`, `externalNrfi` from `useSlateCore` to avoid duplicate fetches:

**Per game (parallel `Promise.all`):**

- `GET /api/lineups/:gamePk`
- `GET /api/player-props/:gamePk`
- `GET /api/umpires/:gamePk`
- Live/final: `GET /api/boxscore/:gamePk`
- Per team (once per abbr): `GET /api/team-stats/:teamId`

**Per probable pitcher ID:**

- `GET /api/players/:id/stats?group=pitching`
- `GET /api/players/:id/gamelog?group=pitching`
- `GET /api/arsenal/:pitcherId` → `pitcherArsenal[id] = { pitcherStats: { swStrPct, oSwingPct, fStrikePct } }`

**All lineup batters (one batch):**

- `POST /api/players/gamelogs/batch` — `{ playerIds: number[], group: "hitting" }`

**Stat splits (after main enrichment):**

- `GET /api/stat-splits/:id?group=pitching` — for each probable pitcher
- `GET /api/stat-splits/:id?group=hitting` — for top 6 batters per confirmed lineup
- Keys: `"${id}:pitching"` / `"${id}:hitting"`

**Not fetched by `useBoardData` (supplied externally from `useSlateCore` bundle):**

- `liveWeather` — from `GET /api/slate-bundle` → `weatherMap`
- `liveNrfiData` — from `GET /api/slate-bundle` → `nrfiMap`

**Scoring on device:** `BoardScreen` calls `computeBatterBoard`, `computePitcherBoard`, `computeGameBoard` from `@repo/board/index.js`.

**`useCardSummaries`:** on demand `POST /api/card-summary` with card factor payloads; `isPremium` from user if logged in.

**Target (web):** When `GET /api/board/snapshot` covers today, use each card's `_boardSummary` from the snapshot and **skip** per-card POST. Keys align via `backend/lib/cardSummaryKeys.js` (`dbCardKey`).

**Screen:** `BoardScreen` — tabs HR / Hits / K / Outs / Games; `WhyModal` for explanations.

---

### Game — `useGameDetail` + tab hooks

**`useGameDetail`** (`mobile/src/hooks/useGameDetail.ts`) — query key `game-detail`, stale ~90s:

Parallel:

- `GET /api/lineups/:gamePk`
- `GET /api/umpires/:gamePk`
- `GET /api/nrfi/:gamePk`
- `GET /api/linescore/:gamePk`
- `GET /api/player-props/:gamePk`
- Per SP: `GET /api/players/:id/stats?group=pitching`, `GET /api/players/:id/gamelog?group=pitching`

Merges schedule row from `useSlateCore` with detail into a `game` object; park factors from `@repo/constants`; umpire static from `UMPIRE_STATS`.

**Tabs** (`GameScreen.tsx`): overview | lineup | arsenal | intel | props

| Tab | Data source |
|-----|-------------|
| Overview | `useGameDetail` pitcher stats/logs |
| Lineup | `lineups` from detail |
| Arsenal | `usePitcherArsenal` → `GET /api/arsenal/:pitcherId`; `useBatterSplits` → `GET /api/splits/:batterId` |
| Intel | game object (weather from bundle via `useSlateCore`) |
| Props | `playerProps` from detail — DK-focused display |

Arsenal: `retry: 0` on query — backend does current/prior season Savant fallback.

---

### Model — `useDailyCard` + `useModelPicks`

| Piece | Source |
|-------|--------|
| Daily Card narrative | `GET /api/daily-card` — public, no auth (`useDailyCard`) |
| K model picks | **No extra API** — `useModelPicks` wraps `useBoardData` + `computePitcherBoard('k', …)` |

**Screen:** `ModelScreen` — parses Daily Card sections client-side (`lib/dailyCardParser.ts`).

---

### Predict — `usePredictPlays` (migrate to snapshot)

**Target (web already does this):**

1. **`GET /api/ai-board/edges?date=YYYY-MM-DD`** — pre-scored candidates from `dailyAiSnapshot` job; **no Anthropic on read**.
2. Handle `fallback: true` before **10 AM Hawaii** (or if midnight job skipped AI): show “picks generating” — not an error.
3. Client filters: **edge ≥ 8%**, sort, split upcoming vs locked via `getBoardGamePhase`.

**Current mobile (needs change):**

1. Depends on **`useBoardData`** (full board enrichment if Board wasn't opened).
2. **`buildAiBoardPayload`** locally → **`POST /api/ai-board/score`** with JWT (Anthropic per open).

See `CURSOR-TASK-PREDICT-SNAPSHOT.md` and `COWORK-HANDOFF.md`.

**Screen:** `PredictScreen` — sign-in gate; `EdgeCard` list.

---

### Chat — `ChatScreen`

- `POST /api/chat` with `{ messages }` + Bearer token
- Quick chips are static strings
- Handles 403 (allowlist), daily message cap from response

---

## Complete list of mobile `/api/*` endpoints in use

```
GET  /api/slate-bundle              (replaces separate schedule + odds + per-game nrfi calls)
GET  /api/injuries
GET  /api/lineups/:gamePk
GET  /api/player-props/:gamePk
GET  /api/umpires/:gamePk
GET  /api/nrfi/:gamePk              (Game screen only — board uses slate-bundle)
GET  /api/linescore/:gamePk
GET  /api/boxscore/:gamePk          (board enrichment, live/final)
GET  /api/team-stats/:teamId
GET  /api/players/:id/stats?group=pitching
GET  /api/players/:id/gamelog?group=pitching
POST /api/players/gamelogs/batch
GET  /api/arsenal/:pitcherId
GET  /api/splits/:batterId
GET  /api/stat-splits/:id?group=pitching|hitting
GET  /api/daily-card
GET  /api/board/snapshot?date=YYYY-MM-DD   ← shared board ranks + summaries (web ✅, mobile 🔲)
GET  /api/ai-board/edges?date=YYYY-MM-DD   ← shared Predict edges (web ✅, mobile 🔲)
POST /api/card-summary                     ← DB cache after snapshot; avoid when snapshot has text
POST /api/ai-board/score                   ← legacy; replace with edges on mobile
POST /api/chat
POST /api/auth/login
GET  /api/auth/me
```

**Not used by mobile** (backend exists): `/api/weather/batch`, `/api/weather`, `/api/bullpen/:gamePk`, `/api/prediction-markets/*`, `/api/model/f5|fullgame|totals`, `/api/scout`, `/api/hr-scout`, `/api/advisor`, `/api/picks`, etc.

---

## Backend responsibilities (for context)

When mobile calls `/api/slate-bundle`, the backend:

- Calls `buildSchedulePayloadForJob` (MLB Stats API + Postgres cache)
- Calls `getOddsMap()` (The Odds API, 20-min shared cache)
- Fans out `getNrfiForGame(gamePk)` per game (MLB Stats API, 1-hr cache)
- Fans out Open-Meteo weather per non-dome stadium (1-hr per-stadium cache)

When mobile calls `/api/arsenal` or `/api/splits`:

- Fetches **Baseball Savant CSV** (see `prop-scout-savant-fix-handoff.md`)

When mobile calls `/api/daily-card`, `/api/card-summary`, `/api/ai-board/score`, `/api/chat`:

- Uses **OpenAI** and/or **Anthropic** on the server (card-summary and score are **cached / snapshotted** after `dailyAiSnapshot` runs — prefer GET snapshot/edges on read)

**Scheduled snapshot writer:** `backend/jobs/dailyAiSnapshot.js` — **10 AM HI** + **pregame (~95 min before first pitch)** + optional **midnight Wave 1** (`runNewSlateDay`). Cron in `backend/jobs/scheduler.js`.

Reference: `PROP_SCOUT_API.md`, `COWORK-HANDOFF.md`, `backend/server.js`, `backend/routes/`.

---

## Caching & performance notes

1. **TanStack Query** dedupes by `queryKey` — `slate-bundle` is shared between Slate and Board screens.
2. **`slate-bundle` vs `board-enrichment`**: bundle covers schedule + odds + nrfi + weather (one call); board enrichment adds lineups, props, umpires, stats, gamelogs, arsenal, stat-splits (per-game fan-out).
3. **First Board load** = O(games) parallel requests for enrichment — expected. Weather and NRFI are pre-loaded from the bundle.
4. **No offline DB** — in-memory cache only; app needs network for fresh data.
5. **Pull-to-refresh** calls hook `refetch()` on screens.
6. **Odds staleTime** is 20 min on mobile (matches backend snapshot cadence).

---

## Known data gaps (intentional backlog)

~~Weather~~ ✅ Fixed (Task 137 + 138) — `liveWeather` now populated via slate-bundle.  
~~Stat splits for board~~ ✅ Fixed (Task 137) — `liveStatSplits` now fetched per pitcher/batter.  
~~Pitcher arsenal for board~~ ✅ Fixed (Task 137) — `pitcherArsenal` now fetched in `useBoardData`.

**Remaining:**

1. **Shared board snapshot on mobile** — `GET /api/board/snapshot` (web done). Stops per-session enrichment + duplicate SIM/card text.
2. **Shared Predict edges on mobile** — `GET /api/ai-board/edges` (web done). Stops `POST /api/ai-board/score` on every Predict open.
3. **Bullpen / boxscore tabs** — not in Game UI yet; APIs exist: `GET /api/bullpen/:gamePk`, `GET /api/boxscore/:gamePk`.
4. **Mobile Phase 3** — backend-computed board scores via `GET /api/board-scores` (optional; after snapshot read path).

---

## Key files map

```
mobile/
  src/api/client.ts          # sole HTTP entry
  src/api/auth.ts            # login, me
  src/config/env.ts          # API_BASE
  src/providers/AppProviders.tsx  # QueryClient + auth bootstrap
  src/stores/authStore.ts
  src/hooks/
    useSlateCore.ts          # slate-bundle query; returns activeSlate, liveOddsMap, liveNrfiData, liveWeather
    useBoardData.ts          # board enrichment; accepts externalWeather + externalNrfi from useSlateCore
    useGameDetail.ts
    usePitcherArsenal.ts
    useBatterSplits.ts
    useDailyCard.ts
    useModelPicks.ts
    usePredictPlays.ts
    useCardSummaries.ts
  src/lib/slate.ts           # buildLiveGame, buildActiveSlate
  src/screens/               # tab screens
  metro.config.js            # watchFolders → ../src

../src/                      # shared scoring (import only, no HTTP)
backend/                     # all external integrations
```

---

## Instructions for Cowork

**Do:**

- Add features by extending hooks + `apiRequest` to **existing or new `/api/*` routes** on the backend.
- Reuse `@repo/board` and related `src/` modules for rankings before adding new client-side math.
- Match patterns: TanStack Query v5 in hooks, `apiRequest` in `queryFn`, stale times similar to sibling hooks.
- Pass `externalWeather` and `externalNrfi` from `useSlateCore` into `useBoardData` — do not re-fetch these.
- Test on device against production or LAN `EXPO_PUBLIC_API_BASE`.

**Do not:**

- Call MLB, Odds API, Savant, OpenAI, or Anthropic from `mobile/`.
- Put API keys in the Expo app or `.env` except `EXPO_PUBLIC_API_BASE`.
- Assume the web JSX app is the active client — use it only as UX reference.
- Duplicate board enrichment without considering shared `queryKey`s.
- Add per-game NRFI or weather fetches to `useBoardData` — these come from `useSlateCore` via the bundle.

**When unsure:** read `COWORK-HANDOFF.md`, `COWORK-QUALITY-COST-BRIEF.md`, `PROP_SCOUT_API.md`, and the matching `backend/routes/*.js` file for the endpoint you need.

---

## Quick verification checklist

- [ ] Grep `mobile/` for `https://` outside `env.ts` / `.env.example` — should find nothing except docs/lockfile.
- [ ] All `fetch` usage goes through `api/client.ts`.
- [ ] New data needs a backend route + mobile hook, not a new third-party client in the app.
- [ ] Weather and NRFI for Board come from `useSlateCore`, not re-fetched in `useBoardData`.

---

*Last updated: May 26, 2026*
