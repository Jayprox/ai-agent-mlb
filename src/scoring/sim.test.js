import { describe, it, expect } from "vitest";
import {
  simKConfidence,
  simOutsConfidence,
  simHRConfidence,
  simHitsConfidence,
  simF5MLConfidence,
} from "./sim.js";

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

  it("higher avgK3 vs line -> higher confidence than lower avgK3", () => {
    const high = simKConfidence({ avgK3: "10.0", k9: 11, avgIP: "6.0", parkFactor: 1.0, umpireRating: null }, 6.5, 1000);
    const low = simKConfidence({ avgK3: "4.0", k9: 6, avgIP: "6.0", parkFactor: 1.0, umpireRating: null }, 6.5, 1000);
    expect(high).toBeGreaterThan(low);
  });

  it("pitcher-friendly umpire boosts confidence vs hitter-friendly", () => {
    const base = { avgK3: "7.0", k9: 9, avgIP: "6.0", parkFactor: 1.0 };
    const pitcherUmp = simKConfidence({ ...base, umpireRating: "pitcher" }, 6.5, 1000);
    const hitterUmp = simKConfidence({ ...base, umpireRating: "batter" }, 6.5, 1000);
    expect(pitcherUmp).toBeGreaterThanOrEqual(hitterUmp);
  });
});

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
    const short = simOutsConfidence({ avgIP: "4.2" }, 17.5, 1000);
    expect(workhorse).toBeGreaterThan(short);
  });
});

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
      0.5,
      1000
    );
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  it("wind-favorable boosts HR confidence", () => {
    const base = { hr: 20, slg: 0.490, parkFactor: 1.0, matchup: null, order: 3 };
    const wind = simHRConfidence({ ...base, windFav: true }, 0.5, 1000);
    const noWind = simHRConfidence({ ...base, windFav: false }, 0.5, 1000);
    expect(wind).toBeGreaterThanOrEqual(noWind);
  });

  it("hitter-friendly park boosts confidence vs pitcher park", () => {
    const base = { hr: 20, slg: 0.490, windFav: false, matchup: null, order: 3 };
    const coors = simHRConfidence({ ...base, parkFactor: 1.35 }, 0.5, 1000);
    const petco = simHRConfidence({ ...base, parkFactor: 0.87 }, 0.5, 1000);
    expect(coors).toBeGreaterThanOrEqual(petco);
  });
});

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
      0.5,
      1000
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

describe("simF5MLConfidence", () => {
  it("returns null when any required input is missing", () => {
    expect(simF5MLConfidence(null, 3.50, 1.0, null, "HOME")).toBeNull();
    expect(simF5MLConfidence(3.50, null, 1.0, null, "HOME")).toBeNull();
    expect(simF5MLConfidence(3.50, 3.50, 1.0, null, null)).toBeNull();
  });

  it("returns a number in [0, 100] for valid input", () => {
    const result = simF5MLConfidence(3.50, 4.50, 1.0, null, "HOME", 1000);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  it("ace home pitcher (low ERA) produces valid HOME confidence", () => {
    const aceHome = simF5MLConfidence(2.00, 4.50, 1.0, null, "HOME", 1000);
    const shakeyHome = simF5MLConfidence(5.50, 4.50, 1.0, null, "HOME", 1000);
    expect(aceHome).toBeGreaterThanOrEqual(0);
    expect(shakeyHome).toBeGreaterThanOrEqual(0);
  });

  it("returns consistent results for symmetric matchup (around 50%)", () => {
    const homeConf = simF5MLConfidence(3.50, 3.50, 1.0, null, "HOME", 2000);
    const awayConf = simF5MLConfidence(3.50, 3.50, 1.0, null, "AWAY", 2000);
    expect(homeConf).toBeGreaterThanOrEqual(30);
    expect(homeConf).toBeLessThanOrEqual(70);
    expect(awayConf).toBeGreaterThanOrEqual(30);
    expect(awayConf).toBeLessThanOrEqual(70);
  });
});
