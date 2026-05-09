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

### ✅ No immediate task — backlog cleared

A full backlog audit (Session 112) confirmed that every previously documented open item has been implemented. The codebase includes:

- **Predictive Lane** (Phases 1–3): edge scoring on AI Board candidates, Predict tab with MIN_EDGE=0.08 filter, Calibration Panel bucketing simConfidence vs actual hit rate
- **Batter Gamelog Pre-fetch Cron** (CODEX TASK 104): `snapshotBatterGamelogs` fires at 10 AM + 2 PM Honolulu, warming the DB before board opens
- **Active Roster Fallback**: lineups route returns `source: "roster"` pre-lineup; board/HR/Hits tabs show roster hitters with `ROSTER` badge
- **F5 Moneyline**: full Lab + Models tabs with `f5ml` scoring, AI Board integration, pick logging, and grading
- **Hybrid AI Card Summaries**: `backend/routes/cardSummary.js` (Haiku + GPT-4o-mini fallback); board cards hydrate `aiReason` text on load
- **Lab Calibration DB Migration**: `labCalibration.js` uses `lab_outcomes` PostgreSQL table with JSON file fallback

### 🟡 BACKLOG — Needs spec before implementing

| Feature | Notes |
|---|---|
| **CODEX TASK 105 — Batch Gamelog Endpoint** | 🔴 DO THIS FIRST. Spec + prompt at `codex-task-105-prompt.md`. 270 HTTP requests → 1. Fixes Board load delay users reported. |
| **BACKLOG TASK 61 — Remove Picks Tab** | Spec ready in `AGENT_SYSTEM_PROMPT.md`. Frontend-only (~600-line view block + supporting infrastructure). Read the full spec before starting. |
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
