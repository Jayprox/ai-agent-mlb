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
| `codex-task-104-prompt.md` | Most recently completed task. For reference only. |
| `codex-task-103-prompt.md` | Previous task — Calibration Panel. For reference only. |

---

## How specs work

Every task has a **CODEX TASK N** section in `AGENT_SYSTEM_PROMPT.md`. The spec describes the exact changes to make — what to add, what to replace, line number hints, and a validation checklist. Always read the spec in full before starting. The prompt files (`codex-task-96-prompt.md` etc.) are condensed copy-paste versions of the same spec.

---

## Current task queue

### ✅ No immediate task queued

Next items are in the backlog below — bring to Cowork to spec before implementing.

### 🟡 BACKLOG — Needs spec before implementing

| Feature | Notes |
|---|---|
| **BACKLOG TASK 61 — Remove Picks Tab** | Spec ready in `AGENT_SYSTEM_PROMPT.md`. Frontend-only (~600-line view block + supporting infrastructure). Read the full spec before starting. |
| **BACKLOG TASK 62 — Localize Game Times** | 4 targeted find-and-replace fixes in `prop-scout-v7.jsx`. `formatLocalTime()` already exists — just needs consistent use. Spec in `AGENT_SYSTEM_PROMPT.md`. |
| **BACKLOG TASK 63 — Share Schedule Cache** | Backend only. NRFI + bullpen routes call `/api/v1/schedule` 98x per startup — should be 1. Add `cache.get("schedule")` check in each route handler. Spec in `AGENT_SYSTEM_PROMPT.md`. |
| **BACKLOG TASK 64 — Cache Linescore Responses** | Backend only. 936 linescore calls on cold start, only 316 unique — eliminate 620 duplicate fetches with a simple `cache.get/set('linescore:${pk}', ...)` wrapper. Spec in `AGENT_SYSTEM_PROMPT.md`. |
| **BACKLOG TASK 65 — Fix Bullpen Double-Stats Bug** | Backend only, XS. Each bullpen pitcher calls `/api/v1/people/:id/stats` twice — remove the duplicate. Find it in `backend/routes/bullpen.js`. Spec in `AGENT_SYSTEM_PROMPT.md`. |
| Global Track Record | App-wide hit rate tracking across Board/Picks/Lab. Needs product decision + full spec. Prerequisite (Lab DB) is done. |
| (Any new features) | Bring to Cowork session for spec before implementing |

---

## Important conventions

- **Single file frontend**: All React code lives in `prop-scout-v7.jsx`. Do not split into components or create new files unless explicitly asked.
- **No global slice on `computeBatterBoard`**: After Task 96, the return is per-game capped (max 5 per game), not sliced to top-20.
- **AI Board architectural rule**: Every market on the AI Board must supply a non-null `simConfidence`. The fallback scorer is `algo * 0.6 + sim * 0.4` — null sim degrades scoring.
- **Line number hints in specs are approximate** — the file evolves with each task. Search for the surrounding function/variable name rather than jumping to a hardcoded line.
- **Validation**: After every task, run through the checklist at the bottom of the prompt file before marking done.

---

## After completing any task

Reply with "Task [N] complete" and a brief summary of what was changed.
