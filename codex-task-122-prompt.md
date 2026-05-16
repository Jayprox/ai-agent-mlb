# CODEX TASK 122 — K Model: SwStr% as Primary Signal + Chase Rate

## Goal

Upgrade the `kBoardScore` function in `prop-scout-v7.jsx` to use **swing-and-miss rate (SwStr%)** and **chase rate (O-Swing%)** as the primary strikeout prediction signals, replacing the current K/9-first approach. SwStr% is the single most predictive individual-game K stat — it measures how often hitters swing and miss per pitch, independent of park or opponent lineup. A pitcher with 28% SwStr% will accumulate Ks regardless of conditions. K/9 is a rate stat that already embeds SwStr% implicitly but is noisier and more park-dependent.

**File changed:** `prop-scout-v7.jsx` only. No backend changes, no schema changes.

---

## Context — Current `kBoardScore` inputs

The current scoring function signature:
```js
const kBoardScore = (pStats, gamelog, pf, umpire, oppTeamStats)
```

`pStats` is the merged pitcher stats object. The Statcast fields — `swStr`, `swStrPct`, `chasePct`, `oSwing`, `fStrikePct` — may already be present on `pStats` if the backend's `/stats` route returns them (check `backend/routes/bullpen.js` and `backend/routes/pitcherStats.js` to confirm field names). If the fields aren't present yet, the new scoring logic must degrade gracefully to the current K/9 baseline.

---

## Part 1 — Revised `kBoardScore` Scoring Logic

Replace the current `kBoardScore` function (find it by searching for `const kBoardScore`) with the version below. The total score range and clamp (10–95) stay the same.

```js
const kBoardScore = (pStats, gamelog, pf, umpire, oppTeamStats) => {
  if (!pStats) return null;
  let s = 40;

  // ── SwStr% — PRIMARY signal (up to 35 pts) ─────────────────────────────────
  // SwStr% = swings-and-misses / total pitches. League avg ≈ 11%.
  // More reliable than K/9 because it's batter-independent.
  const swStrPct = parseFloat(pStats.swStrPct ?? pStats.swStr) || null;
  if (swStrPct !== null) {
    // Values typically 8–18%; elite starters are 14%+
    s += swStrPct >= 16 ? 35 : swStrPct >= 14 ? 27 : swStrPct >= 12 ? 18
       : swStrPct >= 11 ? 10 : swStrPct >= 10 ? 4  : 0;
  } else {
    // Fallback — K/9 when SwStr% unavailable (original logic)
    const k9 = parseFloat(pStats.kPer9 ?? pStats.k9) || 0;
    s += k9 >= 10 ? 27 : k9 >= 9 ? 20 : k9 >= 8 ? 12 : k9 >= 7 ? 6 : 0;
  }

  // ── Chase Rate (O-Swing%) — secondary swing-miss signal (up to 10 pts) ─────
  // O-Swing% = % of pitches outside zone that batters chase. League avg ≈ 30%.
  const chasePct = parseFloat(pStats.chasePct ?? pStats.oSwing) || null;
  if (chasePct !== null) {
    s += chasePct >= 36 ? 10 : chasePct >= 33 ? 6 : chasePct >= 31 ? 3
       : chasePct <= 26 ? -4 : chasePct <= 28 ? -2 : 0;
  }

  // ── Recent K production — avg Ks last 3 starts (20 pts) ────────────────────
  const recentStarts = gamelog?.games ?? [];
  const last3 = recentStarts.slice(0, 3);
  if (last3.length > 0) {
    const avgK = last3.reduce((acc, g) => acc + (g.k ?? 0), 0) / last3.length;
    s += avgK >= 7 ? 20 : avgK >= 6 ? 14 : avgK >= 5 ? 8 : avgK >= 4 ? 4 : 0;
  }

  // ── Park K factor (up to ±9 pts) ────────────────────────────────────────────
  s += (pf.k - 1.0) * 90;

  // ── Umpire tendency (up to 15 pts) ─────────────────────────────────────────
  if (umpire?.rating === "pitcher") s += 15;
  else if (umpire?.rating === "neutral" || !umpire) s += 8;
  else s += 3;

  // ── WHIP — pitcher in control of count (up to 8 pts) ───────────────────────
  const whip = parseFloat(pStats.whip) || 0;
  if (whip > 0) s += whip <= 1.05 ? 8 : whip <= 1.20 ? 5 : whip <= 1.35 ? 2 : 0;

  // ── Opposing team K% (up to ±4 pts) ────────────────────────────────────────
  const oppKPct = oppTeamStats?.kPct ?? null;
  if (oppKPct !== null) {
    s += oppKPct >= 24 ? 4 : oppKPct >= 21 ? 2 : oppKPct <= 17 ? -4 : oppKPct <= 19 ? -2 : 0;
  }

  // ── xwOBA allowed — contact quality (up to ±5 pts) ─────────────────────────
  const xwOBA = pStats?.pitcherStats?.xwOBAAllowed ?? null;
  if (xwOBA !== null) {
    s += xwOBA <= 0.270 ? 5 : xwOBA <= 0.290 ? 3 : xwOBA <= 0.310 ? 1
       : xwOBA >= 0.350 ? -4 : xwOBA >= 0.330 ? -2 : 0;
  }

  return Math.round(Math.max(10, Math.min(95, s)));
};
```

**Key changes vs current:**
- SwStr% replaces K/9 as primary signal (up to 35 pts vs 30 pts). K/9 is kept as graceful fallback.
- Chase Rate (O-Swing%) added as new secondary signal (up to ±10 pts).
- WHIP reduced from 10 pts to 8 pts max (SwStr% covers what WHIP was approximating).
- All other factors preserved at same weights.

---

## Part 2 — Expose SwStr% and Chase Rate in the Pitcher Board Card Display

Find where pitcher board cards display `k9` (around the pitcher card render in the `isPitcherBoard` section). Add a small supplemental line showing SwStr% and Chase Rate when available:

```jsx
{pStats.swStrPct && (
  <span style={{ fontSize: 9, color: "#818cf8" }}>
    SwStr% {parseFloat(pStats.swStrPct).toFixed(1)}%
    {pStats.chasePct ? ` · Chase ${parseFloat(pStats.chasePct).toFixed(1)}%` : ""}
  </span>
)}
```

Where `pStats` is accessible via `livePitcherStats[c.id]` or `c` (whichever field is on the candidate object). Only render if the value is present — no layout impact when absent.

---

## Checklist

- [ ] `kBoardScore` updated — SwStr% is primary signal (35 pts max), K/9 retained as fallback
- [ ] Chase Rate (O-Swing%) added as secondary signal (±10 pts)
- [ ] Graceful degradation — when `swStrPct` is null, falls back to K/9 branch exactly as before
- [ ] All existing factors (recent Ks, park, umpire, WHIP, oppKPct, xwOBA) preserved
- [ ] SwStr% / Chase Rate shown on pitcher board card when available
- [ ] No backend changes
- [ ] No schema changes

---

## After Completing

Reply "Task 122 complete" with a brief summary.
