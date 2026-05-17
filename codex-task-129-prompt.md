# CODEX TASK 129 — Phase 2: Extract Scoring Leaf Functions into `src/scoring/`

## Goal

Continue the component split refactor. Phase 2 extracts the four pure board-scoring functions (`hrBoardScore`, `hitBoardScore`, `kBoardScore`, `outsBoardScore`) into dedicated modules under `src/scoring/`, writes unit tests for each, and replaces the inline declarations in `prop-scout-v7.jsx` with imports.

**This is a pure refactor — zero behavior changes. The app must work identically after this task.**

---

## Files Created

- `src/scoring/batter.js` — hrBoardScore, hitBoardScore
- `src/scoring/pitcher.js` — kBoardScore, outsBoardScore
- `src/scoring/batter.test.js` — unit tests for batter scoring
- `src/scoring/pitcher.test.js` — unit tests for pitcher scoring

## Files Modified

- `prop-scout-v7.jsx` — replace inline declarations with imports from `src/scoring/`

---

## Background

The four functions live at module level in `prop-scout-v7.jsx` (currently around lines 2102–2261). They are pure — they take explicit numeric/object parameters, close over nothing, and return a score or null. They are the ideal next candidates for extraction.

`computeEVEdge` and `evSort` live inside a render IIFE and close over render-time state (`boardTop20`, `boardTab`). Leave those in `prop-scout-v7.jsx` — they are **not** part of this task.

---

## Part 1 — Create `src/scoring/batter.js`

Copy `hrBoardScore` and `hitBoardScore` verbatim from `prop-scout-v7.jsx` and export them as named exports. **Do not change any logic or values.**

```js
// src/scoring/batter.js

/**
 * hrBoardScore: 0–95 composite. Primary = SLG/HR pace.
 * Secondary = park, wind, order, platoon, opposing ERA.
 */
export const hrBoardScore = (hlog, order, pitcherHand, pf, wxFav, sd, facingPitcherEra = null) => {
  // ... verbatim body from prop-scout-v7.jsx ...
};

/**
 * hitBoardScore: 0–95 composite. Primary = AVG + recent form.
 * Secondary = park, order, platoon, opposing ERA.
 */
export const hitBoardScore = (hlog, order, pitcherHand, pf, sd, facingPitcherEra = null) => {
  // ... verbatim body from prop-scout-v7.jsx ...
};
```

---

## Part 2 — Create `src/scoring/pitcher.js`

Copy `kBoardScore` and `outsBoardScore` verbatim from `prop-scout-v7.jsx` and export them as named exports. **Do not change any logic or values.**

```js
// src/scoring/pitcher.js

/**
 * kBoardScore: 0–95 composite for K prop attractiveness.
 * Inputs: season pitcher stats obj, pitching gamelog, park factor, umpire obj, oppTeamStats
 */
export const kBoardScore = (pStats, gamelog, pf, umpire, oppTeamStats) => {
  // ... verbatim body from prop-scout-v7.jsx ...
};

/**
 * outsBoardScore: 0–95 composite for Outs (innings pitched) prop attractiveness.
 */
export const outsBoardScore = (pStats, gamelog, pf) => {
  // ... verbatim body from prop-scout-v7.jsx ...
};
```

---

## Part 3 — Update `prop-scout-v7.jsx`

Add two new import lines after the existing `src/utils.js` import:

```js
import { hrBoardScore, hitBoardScore } from "./src/scoring/batter.js";
import { kBoardScore, outsBoardScore } from "./src/scoring/pitcher.js";
```

Then delete the four inline declarations (the full function bodies, including their comment headers) from `prop-scout-v7.jsx`. They start around:
- `hrBoardScore` — search for `const hrBoardScore =`
- `hitBoardScore` — search for `const hitBoardScore =`
- `kBoardScore` — search for `const kBoardScore =`
- `outsBoardScore` — search for `const outsBoardScore =`

After deletion, the only references to these names in `prop-scout-v7.jsx` should be the import line and the call sites inside `computeBatterBoard` / `computePitcherBoard`.

---

## Part 4 — Write Tests

### `src/scoring/batter.test.js`

```js
import { describe, it, expect } from "vitest";
import { hrBoardScore, hitBoardScore } from "./batter.js";

const NEUTRAL_PF = { hr: 1.0, hit: 1.0, k: 1.0 };
const PITCHER_PARK = { hr: 0.87, hit: 0.96, k: 1.03 };
const HITTER_PARK  = { hr: 1.35, hit: 1.15, k: 0.93 };

// ── hrBoardScore ──────────────────────────────────────────

describe("hrBoardScore", () => {
  it("returns null for falsy hlog", () => {
    expect(hrBoardScore(null, 3, "R", NEUTRAL_PF, false, null)).toBeNull();
    expect(hrBoardScore(undefined, 3, "R", NEUTRAL_PF, false, null)).toBeNull();
  });

  it("returns a number in [15, 95] for valid input", () => {
    const hlog = { slg: 0.500, hr: 20, ops: 0.850 };
    const score = hrBoardScore(hlog, 3, "R", NEUTRAL_PF, false, null);
    expect(score).toBeGreaterThanOrEqual(15);
    expect(score).toBeLessThanOrEqual(95);
  });

  it("higher SLG produces a higher score", () => {
    const base  = { slg: 0.400, hr: 10, ops: 0.720 };
    const power = { slg: 0.600, hr: 20, ops: 0.950 };
    expect(hrBoardScore(power, 3, "R", NEUTRAL_PF, false, null))
      .toBeGreaterThan(hrBoardScore(base, 3, "R", NEUTRAL_PF, false, null));
  });

  it("hitter-friendly park boosts score vs pitcher park", () => {
    const hlog = { slg: 0.450, hr: 15, ops: 0.800 };
    const hitScore    = hrBoardScore(hlog, 3, "R", HITTER_PARK, false, null);
    const pitchScore  = hrBoardScore(hlog, 3, "R", PITCHER_PARK, false, null);
    expect(hitScore).toBeGreaterThan(pitchScore);
  });

  it("wind boost adds to score", () => {
    const hlog = { slg: 0.450, hr: 15, ops: 0.800 };
    const withWind    = hrBoardScore(hlog, 3, "R", NEUTRAL_PF, true, null);
    const withoutWind = hrBoardScore(hlog, 3, "R", NEUTRAL_PF, false, null);
    expect(withWind).toBeGreaterThan(withoutWind);
  });

  it("leadoff/cleanup batter scores higher than 8th spot", () => {
    const hlog = { slg: 0.450, hr: 15, ops: 0.800 };
    const top    = hrBoardScore(hlog, 2, "R", NEUTRAL_PF, false, null);
    const bottom = hrBoardScore(hlog, 8, "R", NEUTRAL_PF, false, null);
    expect(top).toBeGreaterThan(bottom);
  });

  it("weak opposing pitcher ERA boosts score", () => {
    const hlog = { slg: 0.450, hr: 15, ops: 0.800 };
    const vsWeak = hrBoardScore(hlog, 3, "R", NEUTRAL_PF, false, null, 5.5);
    const vsAce  = hrBoardScore(hlog, 3, "R", NEUTRAL_PF, false, null, 2.2);
    expect(vsWeak).toBeGreaterThan(vsAce);
  });
});

// ── hitBoardScore ─────────────────────────────────────────

describe("hitBoardScore", () => {
  it("returns null for falsy hlog", () => {
    expect(hitBoardScore(null, 3, "R", NEUTRAL_PF, null)).toBeNull();
  });

  it("returns a number in [15, 95] for valid input", () => {
    const hlog = { avg: 0.310, ops: 0.850, hitRate: [1, 1, 0, 1, 1] };
    const score = hitBoardScore(hlog, 3, "R", NEUTRAL_PF, null);
    expect(score).toBeGreaterThanOrEqual(15);
    expect(score).toBeLessThanOrEqual(95);
  });

  it("higher AVG produces a higher score", () => {
    const good = { avg: 0.330, ops: 0.900, hitRate: [1, 1, 1, 1, 1] };
    const poor = { avg: 0.220, ops: 0.620, hitRate: [0, 0, 0, 1, 0] };
    expect(hitBoardScore(good, 3, "R", NEUTRAL_PF, null))
      .toBeGreaterThan(hitBoardScore(poor, 3, "R", NEUTRAL_PF, null));
  });

  it("hitter-friendly park boosts score", () => {
    const hlog = { avg: 0.280, ops: 0.780, hitRate: [1, 0, 1, 1, 0] };
    expect(hitBoardScore(hlog, 3, "R", HITTER_PARK, null))
      .toBeGreaterThan(hitBoardScore(hlog, 3, "R", PITCHER_PARK, null));
  });

  it("better recent form (L5) scores higher", () => {
    const base = { avg: 0.270, ops: 0.750, hitRate: [0, 0, 0, 0, 0] };
    const hot  = { avg: 0.270, ops: 0.750, hitRate: [1, 1, 1, 1, 1] };
    expect(hitBoardScore(hot, 3, "R", NEUTRAL_PF, null))
      .toBeGreaterThan(hitBoardScore(base, 3, "R", NEUTRAL_PF, null));
  });
});
```

### `src/scoring/pitcher.test.js`

```js
import { describe, it, expect } from "vitest";
import { kBoardScore, outsBoardScore } from "./pitcher.js";

const NEUTRAL_PF = { hr: 1.0, hit: 1.0, k: 1.0 };
const K_PARK     = { hr: 0.87, hit: 0.96, k: 1.03 };  // pitcher-friendly, high K
const HIT_PARK   = { hr: 1.35, hit: 1.15, k: 0.93 };  // hitter-friendly, low K

// ── kBoardScore ───────────────────────────────────────────

describe("kBoardScore", () => {
  it("returns null for falsy pStats", () => {
    expect(kBoardScore(null, null, NEUTRAL_PF, null, null)).toBeNull();
  });

  it("returns a number in [10, 95] for valid input", () => {
    const pStats = { swStrPct: 14, kPer9: 10, whip: 1.10 };
    const gamelog = { games: [{ k: 8 }, { k: 7 }, { k: 9 }], avgIP: "6.0" };
    const score = kBoardScore(pStats, gamelog, NEUTRAL_PF, null, null);
    expect(score).toBeGreaterThanOrEqual(10);
    expect(score).toBeLessThanOrEqual(95);
  });

  it("higher SwStr% produces higher score than K/9 fallback", () => {
    const withSwStr = { swStrPct: 16, whip: 1.10 };
    const withK9    = { kPer9: 10, whip: 1.10 };
    // swStr elite (16%+) = +35; K/9 elite (10+) = +27
    expect(kBoardScore(withSwStr, null, NEUTRAL_PF, null, null))
      .toBeGreaterThan(kBoardScore(withK9, null, NEUTRAL_PF, null, null));
  });

  it("pitcher-friendly park (higher k factor) boosts score", () => {
    const pStats = { kPer9: 9, whip: 1.15 };
    expect(kBoardScore(pStats, null, K_PARK, null, null))
      .toBeGreaterThan(kBoardScore(pStats, null, HIT_PARK, null, null));
  });

  it("pitcher-rated umpire boosts score vs hitter-rated", () => {
    const pStats = { kPer9: 9, whip: 1.15 };
    const pitcherUmp = { rating: "pitcher" };
    const hitterUmp  = { rating: "hitter" };
    expect(kBoardScore(pStats, null, NEUTRAL_PF, pitcherUmp, null))
      .toBeGreaterThan(kBoardScore(pStats, null, NEUTRAL_PF, hitterUmp, null));
  });

  it("high opp team K% modestly boosts score", () => {
    const pStats = { kPer9: 9, whip: 1.15 };
    const highK  = { kPct: 25 };
    const lowK   = { kPct: 15 };
    expect(kBoardScore(pStats, null, NEUTRAL_PF, null, highK))
      .toBeGreaterThan(kBoardScore(pStats, null, NEUTRAL_PF, null, lowK));
  });

  it("recent K totals (gamelog) boost score", () => {
    const pStats = { kPer9: 8, whip: 1.20 };
    const hotGamelog  = { games: [{ k: 10 }, { k: 9 }, { k: 8 }] };
    const coldGamelog = { games: [{ k: 2 },  { k: 3 }, { k: 2 }] };
    expect(kBoardScore(pStats, hotGamelog, NEUTRAL_PF, null, null))
      .toBeGreaterThan(kBoardScore(pStats, coldGamelog, NEUTRAL_PF, null, null));
  });
});

// ── outsBoardScore ────────────────────────────────────────

describe("outsBoardScore", () => {
  it("returns null for falsy pStats", () => {
    expect(outsBoardScore(null, null, NEUTRAL_PF)).toBeNull();
  });

  it("returns a number in [10, 95] for valid input", () => {
    const pStats  = { whip: 1.05, era: 3.20 };
    const gamelog = { avgIP: "6.2", games: [{ ip: "7.0", er: 1, pc: 98, date: "2025-05-01" }] };
    const score   = outsBoardScore(pStats, gamelog, NEUTRAL_PF);
    expect(score).toBeGreaterThanOrEqual(10);
    expect(score).toBeLessThanOrEqual(95);
  });

  it("longer average IP produces higher score", () => {
    const pStats  = { whip: 1.10, era: 3.50 };
    const long    = { avgIP: "7.0", games: [] };
    const short   = { avgIP: "4.2", games: [] };
    expect(outsBoardScore(pStats, long, NEUTRAL_PF))
      .toBeGreaterThan(outsBoardScore(pStats, short, NEUTRAL_PF));
  });

  it("lower WHIP produces higher score", () => {
    const gamelog = { avgIP: "6.0", games: [] };
    const elite   = { whip: 0.95, era: 3.00 };
    const shaky   = { whip: 1.50, era: 5.00 };
    expect(outsBoardScore(elite, gamelog, NEUTRAL_PF))
      .toBeGreaterThan(outsBoardScore(shaky, gamelog, NEUTRAL_PF));
  });

  it("high pitch count in last start penalizes score", () => {
    const pStats = { whip: 1.10, era: 3.50 };
    const yesterday = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const highPC = { avgIP: "6.0", games: [{ ip: "6.0", er: 2, pc: 105, date: yesterday }] };
    const lowPC  = { avgIP: "6.0", games: [{ ip: "6.0", er: 2, pc: 70,  date: yesterday }] };
    expect(outsBoardScore(pStats, highPC, NEUTRAL_PF))
      .toBeLessThan(outsBoardScore(pStats, lowPC, NEUTRAL_PF));
  });

  it("pitcher-friendly park (lower hit factor) boosts score", () => {
    const pStats  = { whip: 1.10, era: 3.50 };
    const gamelog = { avgIP: "6.0", games: [] };
    expect(outsBoardScore(pStats, gamelog, K_PARK))
      .toBeGreaterThan(outsBoardScore(pStats, gamelog, HIT_PARK));
  });
});
```

---

## Part 5 — Smoke-Test the App

After updating imports, run `npm run dev` and verify:
- App loads without console errors
- Board tab renders HR/Hits and K/Outs candidates
- No `ReferenceError` or `undefined` for the four scoring functions

---

## Checklist

- [ ] `src/scoring/batter.js` created — exports `hrBoardScore`, `hitBoardScore` verbatim
- [ ] `src/scoring/pitcher.js` created — exports `kBoardScore`, `outsBoardScore` verbatim
- [ ] `src/scoring/batter.test.js` created — tests pass (`npm run test`)
- [ ] `src/scoring/pitcher.test.js` created — tests pass (`npm run test`)
- [ ] `prop-scout-v7.jsx` imports from both new files (2 new import lines)
- [ ] Inline declarations of all 4 functions removed from `prop-scout-v7.jsx`
- [ ] No duplicate declarations remain
- [ ] `npm run dev` still works — app behaves identically

---

## After Completing

Reply "Task 129 complete" and paste the output of `npm run test` so we can verify all tests pass.
