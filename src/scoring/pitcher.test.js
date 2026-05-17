import { describe, it, expect } from "vitest";
import { kBoardScore, outsBoardScore } from "./pitcher.js";

const NEUTRAL_PF = { hr: 1.0, hit: 1.0, k: 1.0 };
const K_PARK = { hr: 0.87, hit: 0.96, k: 1.03 };
const HIT_PARK = { hr: 1.35, hit: 1.15, k: 0.93 };

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
    const withK9 = { kPer9: 10, whip: 1.10 };
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
    const hitterUmp = { rating: "hitter" };
    expect(kBoardScore(pStats, null, NEUTRAL_PF, pitcherUmp, null))
      .toBeGreaterThan(kBoardScore(pStats, null, NEUTRAL_PF, hitterUmp, null));
  });

  it("high opp team K% modestly boosts score", () => {
    const pStats = { kPer9: 9, whip: 1.15 };
    const highK = { kPct: 25 };
    const lowK = { kPct: 15 };
    expect(kBoardScore(pStats, null, NEUTRAL_PF, null, highK))
      .toBeGreaterThan(kBoardScore(pStats, null, NEUTRAL_PF, null, lowK));
  });

  it("recent K totals (gamelog) boost score", () => {
    const pStats = { kPer9: 8, whip: 1.20 };
    const hotGamelog = { games: [{ k: 10 }, { k: 9 }, { k: 8 }] };
    const coldGamelog = { games: [{ k: 2 }, { k: 3 }, { k: 2 }] };
    expect(kBoardScore(pStats, hotGamelog, NEUTRAL_PF, null, null))
      .toBeGreaterThan(kBoardScore(pStats, coldGamelog, NEUTRAL_PF, null, null));
  });
});

describe("outsBoardScore", () => {
  it("returns null for falsy pStats", () => {
    expect(outsBoardScore(null, null, NEUTRAL_PF)).toBeNull();
  });

  it("returns a number in [10, 95] for valid input", () => {
    const pStats = { whip: 1.05, era: 3.20 };
    const gamelog = { avgIP: "6.2", games: [{ ip: "7.0", er: 1, pc: 98, date: "2025-05-01" }] };
    const score = outsBoardScore(pStats, gamelog, NEUTRAL_PF);
    expect(score).toBeGreaterThanOrEqual(10);
    expect(score).toBeLessThanOrEqual(95);
  });

  it("longer average IP produces higher score", () => {
    const pStats = { whip: 1.10, era: 3.50 };
    const long = { avgIP: "7.0", games: [] };
    const short = { avgIP: "4.2", games: [] };
    expect(outsBoardScore(pStats, long, NEUTRAL_PF))
      .toBeGreaterThan(outsBoardScore(pStats, short, NEUTRAL_PF));
  });

  it("lower WHIP produces higher score", () => {
    const gamelog = { avgIP: "6.0", games: [] };
    const elite = { whip: 0.95, era: 3.00 };
    const shaky = { whip: 1.50, era: 5.00 };
    expect(outsBoardScore(elite, gamelog, NEUTRAL_PF))
      .toBeGreaterThan(outsBoardScore(shaky, gamelog, NEUTRAL_PF));
  });

  it("high pitch count in last start penalizes score", () => {
    const pStats = { whip: 1.10, era: 3.50 };
    const yesterday = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const highPC = { avgIP: "6.0", games: [{ ip: "6.0", er: 2, pc: 105, date: yesterday }] };
    const lowPC = { avgIP: "6.0", games: [{ ip: "6.0", er: 2, pc: 70, date: yesterday }] };
    expect(outsBoardScore(pStats, highPC, NEUTRAL_PF))
      .toBeLessThan(outsBoardScore(pStats, lowPC, NEUTRAL_PF));
  });

  it("pitcher-friendly park (lower hit factor) boosts score", () => {
    const pStats = { whip: 1.10, era: 3.50 };
    const gamelog = { avgIP: "6.0", games: [] };
    expect(outsBoardScore(pStats, gamelog, K_PARK))
      .toBeGreaterThan(outsBoardScore(pStats, gamelog, HIT_PARK));
  });
});
