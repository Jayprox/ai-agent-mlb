# Cursor Onboarding — Prop Scout Project

## What this project is

Prop Scout is a full-stack MLB sports betting research app. It consists of:

- **`prop-scout-v7.jsx`** — the entire React frontend (single large file, ~12,000+ lines). This is where virtually all feature work happens.
- **`backend/`** — Express.js API server. Key routes: `server.js` (entry point), `routes/` (schedule, lineups, players, aiBoard, etc.), `services/` (mlbApi, cache, db).
- **`main.jsx`** — Vite entry point, just mounts the React app.

The app is deployed on Railway. The frontend is a single-page React app (no routing library — views are controlled by a `view` state variable). The backend proxies MLB Stats API data, manages a PostgreSQL DB for picks/users, and calls Anthropic's API for AI Board scoring.

---

## Key reference files — read these before making any changes

| File | Purpose |
|---|---|
| `AGENT_SYSTEM_PROMPT.md` | The spec bible. All CODEX TASK specs live here. Read the relevant task spec before implementing. |
| `prop-scout-handoff.md` | Full session history — what was built, what changed, and why. Read the last 5–10 sessions for context. |
| `codex-task-96-prompt.md` | **Current task** — ready to implement (see below). |
| `codex-task-97-prompt.md` | Previous task — already implemented and approved. For reference only. |

---

## How specs work

Every task has a **CODEX TASK N** section in `AGENT_SYSTEM_PROMPT.md`. The spec describes the exact changes to make — what to add, what to replace, line number hints, and a validation checklist. Always read the spec in full before starting. The prompt files (`codex-task-96-prompt.md` etc.) are condensed copy-paste versions of the same spec.

---

## Current task queue

### 🔴 IMMEDIATE — CODEX TASK 104 (Batter Gamelog Pre-fetch Cron)

**File:** `prop-scout-v7.jsx` only.

**Spec:** Read `codex-task-104-prompt.md` for the full implementation brief.

**What it does:** Adds `snapshotBatterGamelogs()` to the cron job so all lineup batters are pre-fetched to DB at 10 AM and 2 PM Honolulu — the same pattern as `snapshotPitcherGamelogs`. Eliminates the 15–30s cold-load delay on the Board tab.

**Summary of changes (2 backend files, no frontend):**
1. `snapshotJobs.js` — add `snapshotBatterGamelogs()` function + add to `module.exports`
2. `scheduler.js` — import + cron at `0 10,14 * * *` Honolulu

---

### 🟡 BACKLOG — Needs spec before implementing

These are tracked but not yet ready for code. Do not implement these yet.

| Task | Description |
|---|---|
| (Predictive Lane complete — Phases 1–3 done) | Next feature TBD |

---

## Important conventions

- **Single file frontend**: All React code lives in `prop-scout-v7.jsx`. Do not split into components or create new files unless explicitly asked.
- **No global slice on `computeBatterBoard`**: After Task 96, the return is per-game capped (max 5 per game), not sliced to top-20.
- **AI Board architectural rule**: Every market on the AI Board must supply a non-null `simConfidence`. The fallback scorer is `algo * 0.6 + sim * 0.4` — null sim degrades scoring.
- **Line number hints in specs are approximate** — the file evolves with each task. Search for the surrounding function/variable name rather than jumping to a hardcoded line.
- **Validation**: After every task, run through the checklist at the bottom of the prompt file before marking done.

---

## After completing Task 104

Reply with "Task 104 complete" and a brief summary of what was changed.
