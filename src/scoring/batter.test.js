import { describe, it, expect } from "vitest";
import { hrBoardScore, hitBoardScore } from "./batter.js";

const NEUTRAL_PF = { hr: 1.0, hit: 1.0, k: 1.0 };
const PITCHER_PARK = { hr: 0.87, hit: 0.96, k: 1.03 };
const HITTER_PARK = { hr: 1.35, hit: 1.15, k: 0.93 };

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
    const base = { slg: 0.400, hr: 10, ops: 0.720 };
    const power = { slg: 0.600, hr: 20, ops: 0.950 };
    expect(hrBoardScore(power, 3, "R", NEUTRAL_PF, false, null))
      .toBeGreaterThan(hrBoardScore(base, 3, "R", NEUTRAL_PF, false, null));
  });

  it("hitter-friendly park boosts score vs pitcher park", () => {
    const hlog = { slg: 0.450, hr: 15, ops: 0.800 };
    const hitScore = hrBoardScore(hlog, 3, "R", HITTER_PARK, false, null);
    const pitchScore = hrBoardScore(hlog, 3, "R", PITCHER_PARK, false, null);
    expect(hitScore).toBeGreaterThan(pitchScore);
  });

  it("wind boost adds to score", () => {
    const hlog = { slg: 0.450, hr: 15, ops: 0.800 };
    const withWind = hrBoardScore(hlog, 3, "R", NEUTRAL_PF, true, null);
    const withoutWind = hrBoardScore(hlog, 3, "R", NEUTRAL_PF, false, null);
    expect(withWind).toBeGreaterThan(withoutWind);
  });

  it("leadoff/cleanup batter scores higher than 8th spot", () => {
    const hlog = { slg: 0.450, hr: 15, ops: 0.800 };
    const top = hrBoardScore(hlog, 2, "R", NEUTRAL_PF, false, null);
    const bottom = hrBoardScore(hlog, 8, "R", NEUTRAL_PF, false, null);
    expect(top).toBeGreaterThan(bottom);
  });

  it("weak opposing pitcher ERA boosts score", () => {
    const hlog = { slg: 0.450, hr: 15, ops: 0.800 };
    const vsWeak = hrBoardScore(hlog, 3, "R", NEUTRAL_PF, false, null, 5.5);
    const vsAce = hrBoardScore(hlog, 3, "R", NEUTRAL_PF, false, null, 2.2);
    expect(vsWeak).toBeGreaterThan(vsAce);
  });
});

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
    const hot = { avg: 0.270, ops: 0.750, hitRate: [1, 1, 1, 1, 1] };
    expect(hitBoardScore(hot, 3, "R", NEUTRAL_PF, null))
      .toBeGreaterThan(hitBoardScore(base, 3, "R", NEUTRAL_PF, null));
  });
});
