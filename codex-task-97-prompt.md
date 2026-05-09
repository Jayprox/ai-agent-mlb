# CODEX TASK 97 — AI Board F5 Moneyline Market + simF5MLConfidence

## File to modify

`prop-scout-v7.jsx` only. No backend changes — `aiBoard.js` is already generic.

## Read before starting

Read **CODEX TASK 97** and **CODEX TASK 97 — AMENDMENT** in `AGENT_SYSTEM_PROMPT.md`.
The AMENDMENT overrides the original spec in two ways:
1. `simConfidence: null` in `mapGameCandidate` → replaced with `simF5MLConfidence(...)` call
2. `computeGameBoard` f5ml push → must include `homeEra`, `awayEra`, `parkFactor`, `umpireRating`

The Amendment takes precedence everywhere it conflicts with the base spec.

---

## Architectural rule — must follow

Every AI Board market **must** supply a non-null `simConfidence`. The fallback scorer in `aiBoard.js` is `algo * 0.6 + sim * 0.4` — null sim degrades every card. All existing markets (K, Outs, HR, Hits) compute it via Monte Carlo. F5 ML must too. This rule applies to all future markets.

---

## Changes — in order

### 1 — Add `simF5MLConfidence` function (~line 2026, after `simHitsConfidence`)

```js
function simF5MLConfidence(homeEra, awayEra, parkFactor, umpireRating, lean, n = 500) {
  if (!homeEra || !awayEra || !lean) return null;

  const homeMean = Math.max(0, awayEra * (5 / 9));
  const awayMean = Math.max(0, homeEra * (5 / 9));

  const parkAdj = ((parkFactor ?? 1.0) - 1.0) * 0.5;
  const umpAdj  = umpireRating === "pitcher" ? -0.12
                : umpireRating === "hitter"  ?  0.12 : 0;
  const std = 1.5;

  let leanWins = 0;
  let resolved = 0;

  for (let i = 0; i < n; i++) {
    const [zpH, zpA] = sampleCorrelated(0.35);
    const homeRuns = Math.max(0, sampleNormal(homeMean + parkAdj + umpAdj, std) + 0.1 * zpH);
    const awayRuns = Math.max(0, sampleNormal(awayMean + parkAdj + umpAdj, std) + 0.1 * zpA);
    if (Math.abs(homeRuns - awayRuns) < 0.4) continue;
    resolved++;
    const homeWon = homeRuns > awayRuns;
    if ((lean === "HOME" && homeWon) || (lean === "AWAY" && !homeWon)) leanWins++;
  }

  return resolved > 0 ? Math.round((leanWins / resolved) * 100) : null;
}
```

Uses `sampleNormal` and `sampleCorrelated` — both already exist in the file above this point.

---

### 2 — `computeGameBoard` f5ml branch: add ERA/park/umpire to pushed object (~line 2791)

In the `games.push({...})` call inside the `f5ml` branch of `computeGameBoard`, add four fields:

```js
homeEra:      homeEra ?? null,
awayEra:      awayEra ?? null,
parkFactor:   pf.hit ?? pf.hr ?? 1.0,
umpireRating: umpire?.rating ?? null,
```

`homeEra` and `awayEra` should already be in scope — they are the ERA values used to compute the `score`. `pf` is the park factor object. `umpire` is the umpire object. Do not change the existing fields.

---

### 3 — Update `buildAiBoardPayload` signature and body (~line 2388)

**New signature** (add two params at the end):
```js
function buildAiBoardPayload(
  liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats,
  liveLineups, liveWeather, liveHittingLog, liveStatSplits,
  liveNrfiData, liveOddsMap
)
```

**Add F5 ML candidates** after the existing `hitsCandidates` line:
```js
const f5mlCandidates = computeGameBoard(
  "f5ml", liveSlate, liveNrfiData, liveWeather, liveOddsMap, livePitcherStats, liveUmpires
).slice(0, 5);
```

**Add `mapGameCandidate` helper** inside the function body (alongside existing `mapCandidate`):
```js
const mapGameCandidate = (g, market) => ({
  id:            `${market}:${g.gamePk}`,
  entityId:      g.gamePk,
  market,
  playerName:    null,
  name:          g.gameLabel,
  team:          null,
  gameLabel:     g.gameLabel,
  gamePk:        g.gamePk,
  gameTime:      g.gameTime ?? null,
  score:         g.score,
  simConfidence: simF5MLConfidence(g.homeEra, g.awayEra, g.parkFactor, g.umpireRating, g.lean),
  bookLine:      g.line ?? null,
  lean:          g.lean,
  leanAbbr:      g.leanAbbr,
  leanLabel:     g.leanLabel,
  stats: {
    homeSP:    g.homeSP?.name ?? null,
    homeEra:   g.homeEra ?? null,
    awaySP:    g.awaySP?.name ?? null,
    umpire:    g.factors?.find(f => f.label === "Umpire Tendency")?.value ?? null,
    topFactor: g.factors?.[0]?.detail ?? null,
  },
  factors:    g.factors ?? [],
  _candidate: g,
});
```

**Update the return array** to include F5 ML:
```js
return [
  ...kCandidates.map((c) => mapCandidate(c, "k")),
  ...outsCandidates.map((c) => mapCandidate(c, "outs")),
  ...hrCandidates.map((c) => mapCandidate(c, "hr")),
  ...hitsCandidates.map((c) => mapCandidate(c, "hits")),
  ...f5mlCandidates.map((g) => mapGameCandidate(g, "f5ml")),
];
```

---

### 4 — Update `buildAiBoardPayload` call site (~line 3970)

Pass the two new arguments:
```js
const payload = buildAiBoardPayload(
  liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats,
  liveLineups, liveWeather, liveHittingLog, liveStatSplits,
  liveNrfiData, liveOddsMap
);
```

Only one call site — no other updates needed.

---

### 5 — Add `f5ml` to `MARKET_META` (AI Board render IIFE, ~line 11119)

```js
const MARKET_META = {
  k:    { label: "K Prop", color: "#38bdf8" },
  outs: { label: "Outs",   color: "#a78bfa" },
  hr:   { label: "HR",     color: "#fb923c" },
  hits: { label: "Hits",   color: "#34d399" },
  f5ml: { label: "F5 ML",  color: "#fbbf24" },   // ← add
};
```

---

### 6 — Add `f5ml` to `aiBoardTabHitSummary` (~line 11160)

```js
const aiBoardTabHitSummary = ["k", "outs", "hr", "hits", "f5ml"].reduce(...)
```

---

### 7 — Add F5 ML grading to `getAiBoardGrade` (~line 11125)

Add this branch before the final `return null`:
```js
if (c.market === "f5ml") {
  const box = liveBoxscores[c.gamePk] ?? liveBoxscores[c.entityId];
  if (!box?.isFinal) return null;
  const innings = box.linescore?.innings ?? [];
  if (innings.length < 5) return null;
  const f5Away = innings.slice(0, 5).reduce((sum, inn) => sum + (inn?.away ?? 0), 0);
  const f5Home = innings.slice(0, 5).reduce((sum, inn) => sum + (inn?.home ?? 0), 0);
  if (f5Away === f5Home) return null; // push — leave unresolved
  const leanWon = c.lean === "HOME" ? f5Home > f5Away : f5Away > f5Home;
  return leanWon;
}
```

---

### 8 — Add "F5 ML" tab to the market filter tab row (~line 11189)

```js
[
  ["all",   "All"],
  ["k",     "K"],
  ["outs",  "Outs"],
  ["hr",    "HR"],
  ["hits",  "Hits"],
  ["f5ml",  "F5 ML"],   // ← add
]
```

---

### 9 — F5 ML card rendering (card render loop)

In the card `.map((c, i) => ...)` loop, find the section that renders the player name + team badge row. Wrap the existing content in a conditional and add a game-level layout for F5 ML:

**Name + market + team badge row:**
```jsx
{c.market === "f5ml" ? (
  <>
    <span style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb" }}>{c.gameLabel}</span>
    <span style={{ fontSize: 8, fontWeight: 700, color: meta.color,
      background: `${meta.color}18`, border: `1px solid ${meta.color}40`,
      borderRadius: 4, padding: "1px 6px", fontFamily: "monospace" }}>{meta.label}</span>
    <span style={{ fontSize: 9, fontWeight: 700, color: "#fbbf24",
      background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)",
      borderRadius: 4, padding: "1px 5px", fontFamily: "monospace" }}>
      {c.lean} {c.bookLine ?? "—"}
    </span>
  </>
) : (
  /* existing player name + team badge JSX — no changes */
)}
```

**Sub-line (game label / SP matchup row):**
```jsx
{c.market === "f5ml" ? (
  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
    {c.stats?.homeSP && c.stats?.awaySP
      ? `${c.stats.awaySP} vs ${c.stats.homeSP}`
      : c.leanLabel ?? c.gameLabel}
  </div>
) : (
  /* existing game label + book line row — no changes */
)}
```

**SIM badge:** Already conditional on `c.simConfidence != null`. Now that F5 ML sets simConfidence via `simF5MLConfidence(...)`, the badge **will** render on F5 ML cards. No code change needed — just verify it appears.

---

## Validation checklist

1. No JS errors on load.
2. AI Board shows "F5 ML" tab alongside K / Outs / HR / Hits.
3. F5 ML cards display game matchup (e.g. "NYY @ BOS"), lean direction, and F5 ML odds line.
4. SIM badge appears on F5 ML cards with a percentage (not hidden).
5. Once a game finishes with ≥ 5 innings complete, F5 ML card resolves with ✓ HIT or ✗ MISS.
6. The "X/Y hit" badge on the F5 ML tab counts correctly.
7. No regression on K / Outs / HR / Hits tabs.
