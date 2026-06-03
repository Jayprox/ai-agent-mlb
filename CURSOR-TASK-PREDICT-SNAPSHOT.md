# Cursor Task — Wire Predict to Daily AI Snapshot

## What this task does

The backend now pre-scores all Predict candidates once per day (10 AM HST + pregame re-run) and stores results in Postgres. A new `GET /api/ai-board/edges` endpoint serves those results with zero Anthropic calls on read.

**Goal:** Stop `POST /api/ai-board/score` from firing on every Predict tab open. Replace it with a single `GET /api/ai-board/edges` read from the daily snapshot. All clients (iOS + web) will see the same AI scores all day — no more per-session Anthropic spend.

---

## New backend endpoint

```
GET /api/ai-board/edges
```

**Response (success):**
```json
{
  "edges": [
    {
      "id": "corey-seager-k-2025-05-20",
      "market": "k",
      "playerName": "Corey Seager",
      "team": "TEX",
      "gameLabel": "TEX @ HOU",
      "score": 72,
      "simConfidence": 68,
      "bookLine": 1.5,
      "bookOdds": -115,
      "edge": 0.14,
      "aiScore": 77,
      "aiReason": "Corey Seager posts 34% K rate vs. RHP with two strikeouts per game in last five."
    }
  ],
  "generatedAt": "2026-05-20T23:04:11Z",
  "slateDate": "2026-05-20"
}
```

**Response (snapshot not yet generated today):**
```json
{ "edges": [], "generatedAt": null, "fallback": true }
```

The snapshot job runs at 10 AM HST and again ~95 min before first pitch, so by the time users typically open Predict the data is warm. The `fallback: true` flag means the job hasn't run yet today — show an appropriate message.

---

## Changes needed

### iOS — `mobile/src/hooks/usePredictPlays.ts`

**Current behavior:**
1. Depends on `useBoardData` (full board enrichment — O(games × 6 requests))
2. Calls `buildAiBoardPayload` locally on device
3. POSTs `{ candidates }` to `POST /api/ai-board/score` → fires Anthropic on every tab open

**New behavior:**
1. Drop the `useBoardData` dependency entirely
2. Drop `buildAiBoardPayload` call
3. Fetch `GET /api/ai-board/edges` via `apiRequest`
4. Return the edges array from the snapshot, filtered by the active market tab (if a market filter is applied)
5. Keep the `edge >= 8%` minimum threshold filter client-side (check if `c.edge >= 0.08` — skip candidates that don't meet it)
6. Keep the `getBoardGamePhase` split between upcoming vs locked games — this uses the game's `gameTime` from the edge object to determine if a game has started

**TanStack Query v5 pattern to use:**
```ts
const query = useQuery({
  queryKey: ['predict-edges'],
  queryFn: () => apiRequest<PredictEdgesResponse>('/api/ai-board/edges'),
  staleTime: 5 * 60 * 1000, // 5 min — matches server cache
  refetchOnWindowFocus: false,
});
```

**New type to add (or update existing):**
```ts
export interface PredictEdge {
  id: string;
  market: 'k' | 'outs' | 'hr' | 'hits' | 'f5ml' | 'total' | 'ml' | 'nrfi';
  playerName?: string;
  team?: string;
  gameLabel?: string;
  gamePk?: number;
  gameTime?: string; // ISO — used for getBoardGamePhase
  score: number;
  simConfidence: number;
  bookLine?: number | null;
  bookOdds?: number | null;
  edge: number;
  aiScore: number;
  aiReason?: string | null;
}

export interface PredictEdgesResponse {
  edges: PredictEdge[];
  generatedAt: string | null;
  slateDate?: string;
  fallback?: boolean;
}
```

**Loading/empty states:**
- While fetching: existing skeleton or spinner (no change)
- `fallback: true` (snapshot not yet run): show a message like "Today's picks are being generated. Check back after 10 AM." Do not show an error.
- `edges: []` after fallback is false: "No strong edges found for today."
- On fetch error: existing error handling

**Do not change:**
- `EdgeCard` component — it already renders `aiScore` and `aiReason`
- The sign-in gate on `PredictScreen`
- The market filter tabs — just filter `edges` by `market` client-side after the fetch
- `getBoardGamePhase` logic — apply it to split upcoming vs locked using `edge.gameTime`

---

### Web — `prop-scout-v7.jsx` (if Predict tab exists in web)

Search for any `POST /api/ai-board/score` call in the web client. If found, apply the same swap:

1. Replace the POST with `GET /api/ai-board/edges`
2. Replace the `buildAiBoardPayload` + `useBoardData` dependency with the response `edges` array
3. Same `edge >= 0.08` filter
4. Same fallback message if `fallback: true`

If the web client's Predict tab is already behind a feature flag or not rendered, leave it as-is — don't break anything.

---

## What NOT to change

- `POST /api/ai-board/score` route on the backend — keep it. It is used as fallback if the snapshot hasn't run, and may be called directly in testing.
- `useBoardData` — other screens (Board, Model) still depend on it. Only remove it from `usePredictPlays`.
- `buildAiBoardPayload` in `src/board/index.js` — still used by the daily snapshot job server-side.
- Card summary endpoints (`POST /api/card-summary`) — untouched.
- Chat, Daily Card — untouched.

---

## Acceptance criteria

- [ ] Opening Predict tab makes zero calls to `POST /api/ai-board/score`
- [ ] Opening Predict tab makes exactly one `GET /api/ai-board/edges` call (deduped by TanStack Query)
- [ ] `usePredictPlays` no longer imports or calls `useBoardData`
- [ ] Market filter tabs still work (filter applied client-side on `edges` array)
- [ ] Upcoming vs locked split still works (via `getBoardGamePhase` on `edge.gameTime`)
- [ ] `fallback: true` response shows a graceful "generating" message instead of an error or empty state
- [ ] No TypeScript errors
- [ ] Sign-in gate on Predict screen is unchanged

---

## Files to touch

**iOS:**
- `mobile/src/hooks/usePredictPlays.ts` — primary change
- `mobile/src/screens/PredictScreen.tsx` — update props/types if hook return shape changes; add fallback message handling
- `mobile/src/api/types.ts` (or wherever `PredictEdge` types live) — add/update types

**Web:**
- `prop-scout-v7.jsx` — search for `ai-board/score` and swap if present

---

## Reference

- Backend snapshot job: `backend/jobs/dailyAiSnapshot.js`
- New GET endpoint: `backend/routes/aiBoard.js` → `router.get('/edges', ...)`
- API docs: `PROP_SCOUT_API.md` → `GET /api/ai-board/edges` section
- Cost brief: `COWORK-QUALITY-COST-BRIEF.md` → AI section
