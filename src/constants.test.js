import { describe, it, expect } from "vitest";
import { PARK_FACTORS, NEUTRAL_PARK, HOME_FIELD_ADV, DEFAULT_HOME_ADV, MODEL_TIER, UMPIRE_STATS } from "./constants.js";

describe("PARK_FACTORS", () => {
  it("has an entry for every MLB team sample", () => {
    const teams = ["NYY", "LAD", "BOS", "HOU", "ATL", "CHC", "COL", "MIA"];
    teams.forEach(t => expect(PARK_FACTORS[t]).toBeDefined());
  });

  it("each entry has hit, hr, k keys", () => {
    Object.values(PARK_FACTORS).forEach(pf => {
      expect(pf).toHaveProperty("hit");
      expect(pf).toHaveProperty("hr");
      expect(pf).toHaveProperty("k");
    });
  });
});

describe("NEUTRAL_PARK", () => {
  it("has all core factors at 1.0", () => {
    expect(NEUTRAL_PARK.hit).toBe(1.0);
    expect(NEUTRAL_PARK.hr).toBe(1.0);
    expect(NEUTRAL_PARK.k).toBe(1.0);
  });
});

describe("HOME_FIELD_ADV", () => {
  it("has entries for 29 defined teams", () => {
    expect(Object.keys(HOME_FIELD_ADV).length).toBe(29);
  });

  it("each entry is a 3-element array", () => {
    Object.values(HOME_FIELD_ADV).forEach(v => {
      expect(Array.isArray(v)).toBe(true);
      expect(v.length).toBe(3);
    });
  });
});

describe("DEFAULT_HOME_ADV", () => {
  it("is [4, 3, 2]", () => {
    expect(DEFAULT_HOME_ADV).toEqual([4, 3, 2]);
  });
});

describe("MODEL_TIER", () => {
  it("returns HIGH for score >= 65", () => expect(MODEL_TIER(65)).toBe("HIGH"));
  it("returns MEDIUM for score 56-64", () => expect(MODEL_TIER(60)).toBe("MEDIUM"));
  it("returns SPEC for score < 56", () => expect(MODEL_TIER(50)).toBe("SPEC"));
});

describe("UMPIRE_STATS", () => {
  it("is a non-empty object", () => {
    expect(Object.keys(UMPIRE_STATS).length).toBeGreaterThan(0);
  });

  it("each entry has a rating field", () => {
    Object.values(UMPIRE_STATS).forEach(u => {
      expect(u).toHaveProperty("rating");
      expect(["pitcher", "hitter", "neutral"]).toContain(u.rating);
    });
  });
});
