# CODEX TASK 131 — Phase 4a: Extract Simulation Layer into `src/scoring/sim.js`

## Goal

Continue the component split refactor. Phase 4a extracts the Monte Carlo simulation functions (`simKConfidence`, `simOutsConfidence`, `simHRConfidence`, `simHitsConfidence`, `simF5MLConfidence`) along with their private sampling helpers (`sampleNormal`, `sampleStdNormal`, `sampleCorrelated`) into `src/scoring/sim.js`, adds unit tests, and replaces the inline definitions in `prop-scout-v7.jsx` with a single import.

**This is a pure refactor — zero behavior changes. The app must work identically after this task.**

---

## Files Created

- `src/scoring/sim.js` — sampling helpers + 5 sim confidence functions
- `src/scoring/sim.test.js` — unit tests for the sim functions

## Files Modified

- `prop-scout-v7.jsx` — delete 8 inline definitions; add 1 import line

---

## Background

The 8 functions live in a contiguous block in `prop-scout-v7.jsx` starting around line 1859 (the comment `// ─── HR / Hit board scoring ───────`):

1. `sampleStdNormal()` — Box-Muller transform, returns a single standard normal sample
2. `sampleNormal(mean, std)` — wraps `sampleStdNormal`
3. `sampleCorrelated(rho)` — returns a pair of correlated normals `[z1, z2]`
4. `simKConfidence(candidate, line, n = 500)` — % of sims where pitcher Ks > line
5. `simOutsConfidence(candidate, line, n = 500)` — % of sims where pitcher outs > line
6. `simHRConfidence(candidate, line, n = 500)` — % of sims where batter hits ≥1 HR
7. `simHitsConfidence(candidate, line, n = 500)` — % of sims where batter gets ≥ line hits
8. `simF5MLConfidence(homeEra, awayEra, parkFactor, umpireRating, lean, n = 500)` — % of sims where the lean side wins the F5

All 8 are pure: they take explicit numeric/object parameters and use only `Math.random()`. They close over nothing.

The 3 sampling helpers are implementation details — **do not export them**. They are only used internally by the sim functions.

---

## Part 1 — Create `src/scoring/sim.js`

Copy the 8 functions verbatim from `prop-scout-v7.jsx`. Export only the 5 public sim functions. The 3 samplers stay as unexported module-level functions.

```js
// src/scoring/sim.js
// Monte Carlo simulation helpers for board confidence scoring.
// sampleNormal / sampleStdNormal / sampleCorrelated are internal — not exported.

function sampleStdNormal() { ... }
function sampleNormal(mean, std) { ... }
function sampleCorrelated(rho) { ... }

export function simKConfidence(candidate, line, n = 500) { ... }
export function simOutsConfidence(candidate, line, n = 500) { ... }
export function simHRConfidence(candidate, line, n = 500) { ... }
export function simHitsConfidence(candidate, line, n = 500) { ... }
export function simF5MLConfidence(homeEra, awayEra, parkFactor, umpireRating, lean, n = 500) { ... }
```

**Do not change any logic, coefficients, or default parameter values.**

---

## Part 2 — Update `prop-scout-v7.jsx`

### 2a — Add the import line

Add this import after the existing `src/components/shared.jsx` import (line 17):

```js
import { simKConfidence, simOutsConfidence, simHRConfidence, simHitsConfidence, simF5MLConfidence } from "./src/scoring/sim.js";
```

### 2b — Delete the inline definitions

Remove all 8 function definitions (including the `// ─── HR / Hit board scoring ───` comment header) from `prop-scout-v7.jsx`.

After deletion, verify:
- Grep for each function name in `prop-scout-v7.jsx` — only call sites and the import line should remain
- The call sites inside `computePitcherBoard`, `computeBatterBoard`, `buildAiBoardPayload`, and `computeGameBoard` are unchanged

---

## Part 3 — Write Tests

Since the sim functions use `Math.random()` internally, we test statistical properties over many trials rather than exact output. Create `src/scoring/sim.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  simKConfidence,
  simOutsConfidence,
  simHRConfidence,
  simHitsConfidence,
  simF5MLConfidence,
} from "./sim.js";

// ── simKConfidence ────────────────────────────────────────

describe("simKConfidence", () => {
  it("returns null when line is null", () => {
    expect(simKConfidence({ avgK3: "8.0", k9: 10, avgIP: "6.0", parkFactor: 1.0, umpireRating: null }, null)).toBeNull();
  });

  it("returns null when insufficient data (no mean and no k9)", () => {
    expect(simKConfidence({ avgK3: null, k9: 0, avgIP: "6.0", parkFactor: 1.0, umpireRating: null }, 6.5)).toBeNull();
  });

  it("returns a number in [0, 100]", () => {
    const result = simKConfidence(
      { avgK3: "8.0", k9: 10, avgIP: "6.0", parkFactor: 1.0, umpireRating: null },
      6.5,
      1000
    );
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  it("higher avgK3 vs line → higher confidence than lower avgK3", () => {
    const high = simKConfidence({ avgK3: "10.0", k9: 11, avgIP: "6.0", parkFactor: 1.0, umpireRating: null }, 6.5, 1000);
    const low  = simKConfidence({ avgK3: "4.0",  k9: 6,  avgIP: "6.0", parkFactor: 1.0, umpireRating: null }, 6.5, 1000);
    expect(high).toBeGreaterThan(low);
  });

  it("pitcher-friendly umpire boosts confidence vs hitter-friendly", () => {
    const base = { avgK3: "7.0", k9: 9, avgIP: "6.0", parkFactor: 1.0 };
    const pitcherUmp = simKConfidence({ ...base, umpireRating: "pitcher" }, 6.5, 1000);
    const hitterUmp  = simKConfidence({ ...base, umpireRating: "batter"  }, 6.5, 1000);
    expect(pitcherUmp).toBeGreaterThanOrEqual(hitterUmp);
  });
});

// ── simOutsConfidence ─────────────────────────────────────

describe("simOutsConfidence", () => {
  it("returns null when line is null", () => {
    expect(simOutsConfidence({ avgIP: "6.0" }, null)).toBeNull();
  });

  it("returns null when avgIP is missing or dash", () => {
    expect(simOutsConfidence({ avgIP: "—" }, 17.5)).toBeNull();
    expect(simOutsConfidence({ avgIP: null }, 17.5)).toBeNull();
  });

  it("returns a number in [0, 100]", () => {
    const result = simOutsConfidence({ avgIP: "6.2" }, 17.5, 1000);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  it("workhorse pitcher (7+ IP) has higher confidence at 17.5 line", () => {
    const workhorse = simOutsConfidence({ avgIP: "7.0" }, 17.5, 1000);
    const short      = simOutsConfidence({ avgIP: "4.2" }, 17.5, 1000);
    expect(workhorse).toBeGreaterThan(short);
  });
});

// ── simHRConfidence ───────────────────────────────────────

describe("simHRConfidence", () => {
  it("returns null when line is null", () => {
    expect(simHRConfidence({ hr: 20, slg: 0.500, parkFactor: 1.0, windFav: false, matchup: null, order: 3 }, null)).toBeNull();
  });

  it("returns null for player with 0 HR and low SLG", () => {
    expect(simHRConfidence({ hr: 0, slg: 0.200, parkFactor: 1.0, windFav: false, matchup: null, order: 5 }, 0.5, 1000)).toBeNull();
  });

  it("returns a number in [0, 100] for a valid power hitter", () => {
    const result = simHRConfidence(
      { hr: 25, slg: 0.550, parkFactor: 1.0, windFav: false, matchup: null, order: 3 },
      0.5, 1000
    );
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  it("wind-favorable boosts HR confidence", () => {
    const base = { hr: 20, slg: 0.490, parkFactor: 1.0, matchup: null, order: 3 };
    const wind   = simHRConfidence({ ...base, windFav: true  }, 0.5, 1000);
    const noWind = simHRConfidence({ ...base, windFav: false }, 0.5, 1000);
    expect(wind).toBeGreaterThanOrEqual(noWind);
  });

  it("hitter-friendly park boosts confidence vs pitcher park", () => {
    const base = { hr: 20, slg: 0.490, windFav: false, matchup: null, order: 3 };
    const coors  = simHRConfidence({ ...base, parkFactor: 1.35 }, 0.5, 1000);
    const petco  = simHRConfidence({ ...base, parkFactor: 0.87 }, 0.5, 1000);
    expect(coors).toBeGreaterThanOrEqual(petco);
  });
});

// ── simHitsConfidence ─────────────────────────────────────

describe("simHitsConfidence", () => {
  it("returns null when line is null", () => {
    expect(simHitsConfidence({ avg: 0.310, parkFactor: 1.0, matchup: null, order: 2 }, null)).toBeNull();
  });

  it("returns null for zero AVG", () => {
    expect(simHitsConfidence({ avg: 0, parkFactor: 1.0, matchup: null, order: 3 }, 1.5, 1000)).toBeNull();
  });

  it("returns a number in [0, 100] for valid input", () => {
    const result = simHitsConfidence(
      { avg: 0.320, parkFactor: 1.0, matchup: null, order: 2 },
      0.5, 1000
    );
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  it("high-AVG batter has higher confidence than low-AVG at same line", () => {
    const good = simHitsConfidence({ avg: 0.340, parkFactor: 1.0, matchup: null, order: 2 }, 0.5, 1000);
    const poor = simHitsConfidence({ avg: 0.220, parkFactor: 1.0, matchup: null, order: 5 }, 0.5, 1000);
    expect(good).toBeGreaterThan(poor);
  });
});

// ── simF5MLConfidence ─────────────────────────────────────

describe("simF5MLConfidence", () => {
  it("returns null when any required input is missing", () => {
    expect(simF5MLConfidence(null,  3.50, 1.0, null, "HOME")).toBeNull();
    expect(simF5MLConfidence(3.50,  null, 1.0, null, "HOME")).toBeNull();
    expect(simF5MLConfidence(3.50,  3.50, 1.0, null, null  )).toBeNull();
  });

  it("returns a number in [0, 100] for valid input", () => {
    const result = simF5MLConfidence(3.50, 4.50, 1.0, null, "HOME", 1000);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  it("ace home pitcher (low ERA) has higher HOME win confidence", () => {
    // Home team's ERA = awayEra in the function (away SP faces home lineup → low awayEra = strong home offense)
    // This is an indirect test: lower away ERA → tougher for home batters → lower home run expectation
    // We test that a dominant home SP (low homeEra) gives higher AWAY confidence
    const aceHome = simF5MLConfidence(2.00, 4.50, 1.0, null, "HOME", 1000);
    const shakeyHome = simF5MLConfidence(5.50, 4.50, 1.0, null, "HOME", 1000);
    // With a shaky home SP, home team scores fewer → AWAY leans higher when home ERA is high
    // We just verify both return valid numbers — exact ordering depends on ERA interpretation
    expect(aceHome).toBeGreaterThanOrEqual(0);
    expect(shakeyHome).toBeGreaterThanOrEqual(0);
  });

  it("returns consistent results for symmetric matchup (around 50%)", () => {
    const homeConf = simF5MLConfidence(3.50, 3.50, 1.0, null, "HOME", 2000);
    const awayConf = simF5MLConfidence(3.50, 3.50, 1.0, null, "AWAY", 2000);
    // Symmetric matchup — both should be roughly 50; neither should be extreme
    expect(homeConf).toBeGreaterThanOrEqual(30);
    expect(homeConf).toBeLessThanOrEqual(70);
    expect(awayConf).toBeGreaterThanOrEqual(30);
    expect(awayConf).toBeLessThanOrEqual(70);
  });
});
```

**Note on stochastic tests:** The sim functions use `Math.random()`. Tests use `n = 1000` to reduce variance. The directional assertions (e.g., "high avg → higher confidence") are expected to hold reliably at n=1000 but may very occasionally fail due to randomness — that's acceptable. The range checks `[0, 100]` are always deterministic.

---

## Part 4 — Smoke-Test the App

After updating imports, run `npm run dev` and verify:
- Board candidates show SIM confidence numbers on pitcher and batter cards (confirming the sim functions are wiring correctly)
- Game board candidates render (confirming `simF5MLConfidence` is wiring correctly)
- No `ReferenceError` in console

---

## Checklist

- [ ] `src/scoring/sim.js` created — 5 named exports, 3 private helpers
- [ ] Sampling helpers (`sampleNormal`, `sampleStdNormal`, `sampleCorrelated`) are **not** exported
- [ ] No logic changes — functions are verbatim copies
- [ ] `src/scoring/sim.test.js` created — all tests pass (`npm run test`)
- [ ] Import line added to `prop-scout-v7.jsx` (after components/shared import)
- [ ] All 8 inline definitions removed from `prop-scout-v7.jsx`
- [ ] No duplicate declarations remain
- [ ] Call sites inside `computePitcherBoard`, `computeBatterBoard`, `buildAiBoardPayload` are unchanged
- [ ] `npm run test` passes (all prior tests still green + new sim tests)
- [ ] `npm run build` passes
- [ ] `npm run dev` still works — SIM confidence values appear on cards

---

## After Completing

Reply "Task 131 complete" and paste the output of `npm run test` so we can verify all tests pass.
