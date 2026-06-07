# CODEX TASK 143 — Frontend-First Picks Grading

## Overview

Picks currently stay "PENDING" forever because grading never runs successfully.
The fix is **frontend-first**: the app grades each pick using live data already
in memory (boxscores, linescores, game status), then writes the results to the
DB via a new `PATCH /api/picks/:id/grade` endpoint.

This runs **in the background regardless of which tab is active**. The nightly
backend job remains as a catch-up safety net for picks logged while the app was
closed.

---

## Full pick lifecycle

```
PENDING  →  LIVE  →  FINAL (grading…)  →  HIT / MISS / PUSH
                  ↘  PPD    (game postponed — VOID button stays)
                  ↘  SCRATCH (player not in boxscore — VOID button stays)
```

---

## Files to change

- `backend/routes/picks.js` — add DB columns + new grade endpoint
- `prop-scout-v7.jsx` — grading useEffect + pick card UI badges

Do **not** change `backend/jobs/gradePicksJob.js`, `scheduler.js`, or any
other backend file.

---

## Part 1 — Backend: new columns + grade endpoint

### 1a. Add columns in `ensurePicksSchema()`

Add after the existing ALTER TABLE lines:

```js
await query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS result_hit BOOLEAN`);
await query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS actual_stat NUMERIC`);
await query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS grade_status TEXT`);
// grade_status values: null (pending) | 'ppd' | 'scratch' | 'push'
```

### 1b. Update `GET /api/picks` SELECT

Replace:
```sql
bcs.result_hit, bcs.actual_stat
```
With:
```sql
COALESCE(p.result_hit, bcs.result_hit)   AS result_hit,
COALESCE(p.actual_stat, bcs.actual_stat) AS actual_stat,
p.grade_status
```

Also add `p.grade_status` to the mapped response object:
```js
gradeStatus: row.grade_status ?? null,
```

Keep the LEFT JOIN on `board_card_snapshots` — it is the backwards-compat
fallback for old picks.

Do the same COALESCE for `GET /api/picks/stats`.

### 1c. New `PATCH /api/picks/:id/grade` route

Add before the existing `PATCH /:id/void` route:

```js
router.patch("/:id/grade", async (req, res) => {
  const { id } = req.params;
  const { resultHit, actualStat, gradeStatus } = req.body;

  // resultHit must be boolean or null; gradeStatus must be string or null
  if (resultHit !== null && resultHit !== undefined && typeof resultHit !== "boolean") {
    return res.status(400).json({ error: "resultHit must be boolean or null" });
  }

  if (isConnected()) {
    await ensurePicksSchema();
    const result = await query(
      `UPDATE picks
       SET result_hit   = $1,
           actual_stat  = $2,
           grade_status = $3,
           result       = $4
       WHERE id = $5
         AND user_id = $6
         AND voided = FALSE
       RETURNING id`,
      [
        resultHit ?? null,
        actualStat ?? null,
        gradeStatus ?? null,
        resultHit === true ? "hit" : resultHit === false ? "miss" : null,
        id,
        req.userId,
      ]
    );
    if (!result?.rows?.length) return res.status(404).json({ error: "not_found" });
    return res.json({ ok: true });
  }

  // Flat-file fallback
  const store = readStore();
  const idx = store.picks.findIndex(p => p.id === id && p.userId === req.userId && !p.voided);
  if (idx === -1) return res.status(404).json({ error: "not_found" });
  store.picks[idx] = {
    ...store.picks[idx],
    resultHit: resultHit ?? null,
    actualStat: actualStat ?? null,
    gradeStatus: gradeStatus ?? null,
    result: resultHit === true ? "hit" : resultHit === false ? "miss" : null,
  };
  writeStore(store);
  return res.json({ ok: true });
});
```

---

## Part 2 — Frontend: background grading useEffect

### 2a. Helper: `gradePickLocally`

Define this pure function **outside** the component (at module level, near other
helper functions). It takes a pick and the live data maps and returns a grade
object or null.

```js
const GAME_MARKETS_SET = new Set(["ml","spread","total","nrfi","f5ml","f5spread"]);
const PROP_MARKETS_SET  = new Set(["k","outs","hr","hits"]);

function parseIpToOutsLocal(ip) {
  if (!ip) return 0;
  const [inn, thirds] = String(ip).split(".").map(Number);
  return (inn || 0) * 3 + (thirds || 0);
}

function gradePickLocally(pick, { liveBoxscores, liveScores, liveSlate }) {
  const market  = (pick.market ?? "").toLowerCase();
  const side    = (pick.side   ?? "").toLowerCase();
  const line    = pick.bookLine != null ? parseFloat(pick.bookLine) : null;

  // Resolve gamePk
  // Game picks: playerId IS the gamePk
  // Prop picks: find via gameLabel match in liveSlate
  let gamePk;
  if (GAME_MARKETS_SET.has(market)) {
    gamePk = pick.playerId;
  } else {
    const slateMatch = (liveSlate ?? []).find(g =>
      `${g.away?.abbr ?? ""} @ ${g.home?.abbr ?? ""}` === (pick.gameLabel ?? "")
    );
    gamePk = slateMatch?.gamePk ?? null;
  }
  if (!gamePk) return null;

  // Check game status
  const slateGame = (liveSlate ?? []).find(g => String(g.gamePk) === String(gamePk));
  const status = slateGame?.status ?? "";

  if (status === "Postponed" || status === "Cancelled" || status === "Suspended") {
    return { resultHit: null, actualStat: null, gradeStatus: "ppd" };
  }

  const isFinal = status === "Final" || status === "Game Over";
  if (!isFinal) return null; // game not over yet

  const box   = liveBoxscores[String(gamePk)];
  const score = liveScores[String(gamePk)];
  if (!box) return null; // boxscore not loaded — will retry on next render

  const innings  = box.linescore?.innings ?? [];
  const awayRuns = score?.awayScore ?? (box.linescore?.away?.runs ?? 0);
  const homeRuns = score?.homeScore ?? (box.linescore?.home?.runs ?? 0);

  // ── Game markets ──────────────────────────────────────────────────────────

  if (market === "nrfi") {
    const f1 = innings[0];
    if (!f1) return null;
    const runs = (f1.away ?? 0) + (f1.home ?? 0);
    const wantNrfi = side === "nrfi" || side === "over";
    return { resultHit: wantNrfi ? runs === 0 : runs > 0, actualStat: runs, gradeStatus: null };
  }

  if (market === "total") {
    const total = awayRuns + homeRuns;
    if (line == null) return null;
    if (total === line) return { resultHit: null, actualStat: total, gradeStatus: "push" };
    return { resultHit: side === "over" ? total > line : total < line, actualStat: total, gradeStatus: null };
  }

  if (market === "spread") {
    if (line == null) return null;
    // side is stored as team abbr (the lean team) or "home"/"away"
    const awayAbbr = (slateGame?.away?.abbr ?? "").toUpperCase();
    const leanIsAway = side.toUpperCase() === awayAbbr || side === "away";
    const margin = leanIsAway ? awayRuns - homeRuns : homeRuns - awayRuns;
    if (margin + line === 0) return { resultHit: null, actualStat: margin, gradeStatus: "push" };
    return { resultHit: margin + line > 0, actualStat: margin, gradeStatus: null };
  }

  if (market === "ml") {
    if (awayRuns === homeRuns) return { resultHit: null, actualStat: null, gradeStatus: "push" };
    const awayAbbr = (slateGame?.away?.abbr ?? "").toUpperCase();
    const leanIsAway = side.toUpperCase() === awayAbbr || side === "away";
    return { resultHit: leanIsAway ? awayRuns > homeRuns : homeRuns > awayRuns, actualStat: null, gradeStatus: null };
  }

  if (market === "f5ml") {
    if (innings.length < 5) return null;
    const f5Away = innings.slice(0, 5).reduce((s, i) => s + (i.away ?? 0), 0);
    const f5Home = innings.slice(0, 5).reduce((s, i) => s + (i.home ?? 0), 0);
    if (f5Away === f5Home) return { resultHit: null, actualStat: null, gradeStatus: "push" };
    const awayAbbr = (slateGame?.away?.abbr ?? "").toUpperCase();
    const leanIsAway = side.toUpperCase() === awayAbbr || side === "away";
    return { resultHit: leanIsAway ? f5Away > f5Home : f5Home > f5Away, actualStat: null, gradeStatus: null };
  }

  if (market === "f5spread") {
    if (innings.length < 5 || line == null) return null;
    const f5Away = innings.slice(0, 5).reduce((s, i) => s + (i.away ?? 0), 0);
    const f5Home = innings.slice(0, 5).reduce((s, i) => s + (i.home ?? 0), 0);
    const awayAbbr = (slateGame?.away?.abbr ?? "").toUpperCase();
    const leanIsAway = side.toUpperCase() === awayAbbr || side === "away";
    const margin = leanIsAway ? f5Away - f5Home : f5Home - f5Away;
    if (margin + line === 0) return { resultHit: null, actualStat: margin, gradeStatus: "push" };
    return { resultHit: margin + line > 0, actualStat: margin, gradeStatus: null };
  }

  // ── Prop markets ──────────────────────────────────────────────────────────

  const allBatters  = [...(box.batting?.away  ?? []), ...(box.batting?.home  ?? [])];
  const allPitchers = [...(box.pitching?.away ?? []), ...(box.pitching?.home ?? [])];
  const pid = pick.playerId != null ? String(pick.playerId) : null;

  if (market === "hr" || market === "hits") {
    // SCRATCH: player does not appear in boxscore batting at all
    const batter = pid ? allBatters.find(b => String(b.id) === pid) : null;
    if (!batter) return { resultHit: null, actualStat: null, gradeStatus: "scratch" };
    if (market === "hr") {
      const hr = batter.hr ?? 0;
      return { resultHit: hr > 0, actualStat: hr, gradeStatus: null };
    }
    const h = batter.h ?? 0;
    return { resultHit: h > 0, actualStat: h, gradeStatus: null };
  }

  if (market === "k" || market === "outs") {
    // SCRATCH: pitcher does not appear in boxscore pitching at all
    const pitcher = pid ? allPitchers.find(p => String(p.id) === pid) : null;
    if (!pitcher) return { resultHit: null, actualStat: null, gradeStatus: "scratch" };
    if (market === "k") {
      const k = pitcher.k ?? 0;
      if (line == null) return null;
      if (k === line) return { resultHit: null, actualStat: k, gradeStatus: "push" };
      return { resultHit: side === "over" ? k > line : k < line, actualStat: k, gradeStatus: null };
    }
    const outs = parseIpToOutsLocal(pitcher.ip);
    if (line == null) return null;
    if (outs === line) return { resultHit: null, actualStat: outs, gradeStatus: "push" };
    return { resultHit: side === "over" ? outs > line : outs < line, actualStat: outs, gradeStatus: null };
  }

  return null;
}
```

### 2b. Background grading useEffect

Add this useEffect inside the component, **after** the existing picks fetch
useEffect (around line 3102). It must have **no `view` condition** — it runs
regardless of which tab is active.

```js
// Background pick grading — runs whenever boxscores or picks data updates
useEffect(() => {
  if (!currentUser || !picksViewData?.picks?.length) return;

  const ungradedPicks = picksViewData.picks.filter(p =>
    !p.voided &&
    p.resultHit === null &&
    p.gradeStatus == null  // not already PPD/SCRATCH/PUSH
  );
  if (!ungradedPicks.length) return;

  ungradedPicks.forEach(pick => {
    const grade = gradePickLocally(pick, { liveBoxscores, liveScores, liveSlate });
    if (!grade) return;

    // Optimistic local update — update picksViewData immediately
    setPicksViewData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        picks: prev.picks.map(p =>
          p.id === pick.id
            ? { ...p, resultHit: grade.resultHit, actualStat: grade.actualStat, gradeStatus: grade.gradeStatus,
                pnl: grade.resultHit !== null ? calcPnl(grade.resultHit, p.odds, p.units) : p.pnl }
            : p
        ),
      };
    });

    // Persist to backend (fire-and-forget — don't block UI)
    apiFetch(`/api/picks/${encodeURIComponent(pick.id)}/grade`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resultHit:   grade.resultHit,
        actualStat:  grade.actualStat,
        gradeStatus: grade.gradeStatus,
      }),
    })
    .then(() => {
      // Re-fetch stats to update the summary tiles
      apiFetch(`/api/picks/stats?days=${picksViewDays}`)
        .then(stats => setPicksViewStats(stats))
        .catch(() => {});
    })
    .catch(() => {});
  });
}, [picksViewData, liveBoxscores, liveScores, liveSlate, currentUser]); // eslint-disable-line react-hooks/exhaustive-deps
```

Note: `calcPnl` is already defined in `backend/routes/picks.js` — replicate the
same formula in the frontend for optimistic update:
```js
// In prop-scout-v7.jsx (near other pick helpers):
const calcPickPnl = (resultHit, odds, units) => {
  if (resultHit === null || resultHit === undefined) return null;
  if (!resultHit) return -(units ?? 1);
  if (!odds) return null;
  const profit = odds > 0 ? (units ?? 1) * (odds / 100) : (units ?? 1) * (100 / Math.abs(odds));
  return Math.round(profit * 100) / 100;
};
```

### 2c. Pick card UI — new badges

In the picks tab card render (the `groups[dateKey].map((pick) => ...)` block,
around line 11155), update the badge logic:

**Current `pickGameStatus` derivation** — extend to also handle PPD and SCRATCH:
```js
// After the existing pickGameStatus block, add:
const pickGradeStatus = pick.gradeStatus ?? null;
```

**Replace the badge block** (currently renders `<GameStatusBadge>` or a
custom span for HIT/MISS/PENDING):

```jsx
{/* Result / status badge */}
{pick.resultHit === true  && (
  <span style={{ fontSize: 8, fontWeight: 800, color: "#22c55e", background: "rgba(34,197,94,0.18)", border: "1px solid rgba(34,197,94,0.4)", borderRadius: 999, padding: "2px 7px", fontFamily: "monospace", letterSpacing: "0.06em" }}>
    HIT
  </span>
)}
{pick.resultHit === false && (
  <span style={{ fontSize: 8, fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 999, padding: "2px 7px", fontFamily: "monospace", letterSpacing: "0.06em" }}>
    MISS
  </span>
)}
{pick.resultHit === null && pickGradeStatus === "push" && (
  <span style={{ fontSize: 8, fontWeight: 800, color: "#818cf8", background: "rgba(129,140,248,0.15)", border: "1px solid rgba(129,140,248,0.4)", borderRadius: 999, padding: "2px 7px", fontFamily: "monospace", letterSpacing: "0.06em" }}>
    PUSH
  </span>
)}
{pick.resultHit === null && pickGradeStatus === "ppd" && (
  <span style={{ fontSize: 8, fontWeight: 800, color: "#f59e0b", background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 999, padding: "2px 7px", fontFamily: "monospace", letterSpacing: "0.06em" }}>
    PPD
  </span>
)}
{pick.resultHit === null && pickGradeStatus === "scratch" && (
  <span style={{ fontSize: 8, fontWeight: 800, color: "#6b7280", background: "rgba(107,114,128,0.15)", border: "1px solid rgba(107,114,128,0.4)", borderRadius: 999, padding: "2px 7px", fontFamily: "monospace", letterSpacing: "0.06em" }}>
    SCRATCH
  </span>
)}
{pick.resultHit === null && !pickGradeStatus && (
  pickGameStatus
    ? <GameStatusBadge status={pickGameStatus} />
    : <span style={{ fontSize: 8, fontWeight: 800, color: "#6b7280", background: "rgba(107,114,128,0.15)", border: "1px solid rgba(107,114,128,0.4)", borderRadius: 999, padding: "2px 7px", fontFamily: "monospace", letterSpacing: "0.06em" }}>
        PENDING
      </span>
)}
```

### 2d. Void button — show for PPD and SCRATCH

**Current condition** (hide during LIVE or FINAL):
```js
{!pickGameStatus && pick.resultHit === null && ( <button>Void</button> )}
```

**New condition** (also show for PPD and SCRATCH):
```js
{pick.resultHit === null &&
 pickGameStatus !== "LIVE" &&
 (pickGradeStatus === "ppd" || pickGradeStatus === "scratch" || !pickGradeStatus) && (
  <button onClick={() => voidPick(pick.id)} ...>Void</button>
)}
```

---

## What NOT to change

- `backend/jobs/gradePicksJob.js` — legacy job stays as nightly catch-up
- `backend/jobs/scheduler.js` — schedule unchanged
- Any other backend files
- The LEFT JOIN on `board_card_snapshots` — backwards compat, keep it

---

## Verification

1. Log a pick for a game that is already FINAL
2. Within one render cycle, the card should flip from PENDING → HIT or MISS
3. Check DB: `SELECT id, result_hit, actual_stat, grade_status FROM picks WHERE result_hit IS NOT NULL`
4. Log a pick for a postponed game — card should show PPD with VOID button visible
5. Record tile should count HIT/MISS correctly, P&L should calculate
