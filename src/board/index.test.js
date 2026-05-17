import { describe, it, expect } from "vitest";
import {
  computePitcherBoard,
  computeBatterBoard,
  computeGameBoard,
} from "./index.js";

const GAME_PK = 12345;
const BASE_GAME = {
  gamePk: GAME_PK,
  gameTime: "2025-05-15T18:05:00Z",
  home: { abbr: "NYY", name: "New York Yankees" },
  away: { abbr: "BOS", name: "Boston Red Sox" },
  stadium: "Yankee Stadium",
  probablePitchers: {
    home: { id: 1001, name: "Gerrit Cole", hand: "R", era: "2.80" },
    away: { id: 1002, name: "Chris Sale", hand: "L", era: "3.10" },
  },
  pitcher: { id: 1001, name: "Gerrit Cole", hand: "R", era: "2.80" },
  awayPitcher: { id: 1002, name: "Chris Sale", hand: "L", era: "3.10" },
  odds: { total: "8.5", homeML: -140, awayML: 120 },
};

const PITCHER_STATS = {
  1001: { era: "2.80", kPer9: "10.2", whip: "1.05", swStrPct: 14 },
  1002: { era: "3.10", kPer9: "9.8", whip: "1.12", swStrPct: 13 },
};

const GAME_LOG = {
  1001: { avgIP: "6.2", games: [{ k: 9, ip: "7.0", er: 1, pc: 95, date: "2025-05-10" }] },
  1002: { avgIP: "6.0", games: [{ k: 8, ip: "6.0", er: 2, pc: 88, date: "2025-05-10" }] },
};

const PLAYER_PROPS = {};
const TEAM_STATS = {};
const UMPIRES = {};
const ARSENAL = {};

describe("computePitcherBoard", () => {
  it("returns empty array for empty slate", () => {
    expect(computePitcherBoard("k", [], PITCHER_STATS, GAME_LOG, UMPIRES, PLAYER_PROPS, TEAM_STATS)).toEqual([]);
  });

  it("returns empty array for null slate", () => {
    expect(computePitcherBoard("k", null, PITCHER_STATS, GAME_LOG, UMPIRES, PLAYER_PROPS, TEAM_STATS)).toEqual([]);
  });

  it("returns candidates for a valid slate", () => {
    const result = computePitcherBoard("k", [BASE_GAME], PITCHER_STATS, GAME_LOG, UMPIRES, PLAYER_PROPS, TEAM_STATS, ARSENAL);
    expect(result.length).toBeGreaterThan(0);
  });

  it("candidates are sorted by score descending", () => {
    const result = computePitcherBoard("k", [BASE_GAME], PITCHER_STATS, GAME_LOG, UMPIRES, PLAYER_PROPS, TEAM_STATS, ARSENAL);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
    }
  });

  it("each candidate has required fields", () => {
    const result = computePitcherBoard("k", [BASE_GAME], PITCHER_STATS, GAME_LOG, UMPIRES, PLAYER_PROPS, TEAM_STATS, ARSENAL);
    result.forEach(c => {
      expect(c).toHaveProperty("id");
      expect(c).toHaveProperty("name");
      expect(c).toHaveProperty("team");
      expect(c).toHaveProperty("score");
      expect(c).toHaveProperty("gamePk");
      expect(c).toHaveProperty("gameLabel");
    });
  });

  it("works for type='outs'", () => {
    const result = computePitcherBoard("outs", [BASE_GAME], PITCHER_STATS, GAME_LOG, UMPIRES, PLAYER_PROPS, TEAM_STATS, ARSENAL);
    expect(Array.isArray(result)).toBe(true);
  });
});

const BATTER_A = { id: 2001, name: "Aaron Judge", hand: "R", order: 3, obp: "0.420", avg: "0.290" };
const BATTER_B = { id: 2002, name: "Giancarlo Stanton", hand: "R", order: 4, obp: "0.370", avg: "0.265" };

const LINEUPS = {
  [GAME_PK]: {
    confirmed: true,
    source: "official",
    home: [BATTER_A, BATTER_B],
    away: [],
    scratches: {},
  },
};
const HITTING_LOG = {
  2001: { avg: "0.290", slg: "0.580", hr: 22, ops: "1.000", hitRate: [1, 1, 0, 1, 1] },
  2002: { avg: "0.265", slg: "0.510", hr: 18, ops: "0.890", hitRate: [0, 1, 1, 0, 1] },
};
const WEATHER = {};
const STAT_SPLITS = {};

describe("computeBatterBoard", () => {
  it("returns empty array for empty slate", () => {
    expect(computeBatterBoard("hr", [], LINEUPS, WEATHER, PLAYER_PROPS, HITTING_LOG, STAT_SPLITS)).toEqual([]);
  });

  it("returns candidates for a valid confirmed lineup", () => {
    const result = computeBatterBoard("hr", [BASE_GAME], LINEUPS, WEATHER, PLAYER_PROPS, HITTING_LOG, STAT_SPLITS);
    expect(result.length).toBeGreaterThan(0);
  });

  it("skips game with no confirmed lineup", () => {
    const unconfirmedLineups = {
      [GAME_PK]: { confirmed: false, source: "unknown", home: [BATTER_A], away: [] },
    };
    const result = computeBatterBoard("hr", [BASE_GAME], unconfirmedLineups, WEATHER, PLAYER_PROPS, HITTING_LOG, STAT_SPLITS);
    expect(result).toEqual([]);
  });

  it("candidates are sorted by score descending", () => {
    const result = computeBatterBoard("hr", [BASE_GAME], LINEUPS, WEATHER, PLAYER_PROPS, HITTING_LOG, STAT_SPLITS);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
    }
  });

  it("each candidate has required fields", () => {
    const result = computeBatterBoard("hits", [BASE_GAME], LINEUPS, WEATHER, PLAYER_PROPS, HITTING_LOG, STAT_SPLITS);
    result.forEach(c => {
      expect(c).toHaveProperty("id");
      expect(c).toHaveProperty("name");
      expect(c).toHaveProperty("score");
      expect(c).toHaveProperty("gamePk");
      expect(c).toHaveProperty("matchup");
    });
  });

  it("caps candidates at 5 per game", () => {
    const bigLineup = Array.from({ length: 9 }, (_, i) => ({
      id: 3000 + i, name: `Player ${i}`, hand: "R", order: i + 1, obp: "0.350", avg: "0.280",
    }));
    const bigLog = {};
    bigLineup.forEach(b => {
      bigLog[b.id] = { avg: "0.280", slg: "0.480", hr: 15, ops: "0.830", hitRate: [1, 1, 0, 1, 0] };
    });
    const bigLineups = { [GAME_PK]: { confirmed: true, source: "official", home: bigLineup, away: [], scratches: {} } };
    const result = computeBatterBoard("hr", [BASE_GAME], bigLineups, WEATHER, PLAYER_PROPS, bigLog, STAT_SPLITS);
    expect(result.length).toBeLessThanOrEqual(5);
  });
});

const NRFI_DATA = {};
const ODDS_MAP = {
  "Boston Red Sox|New York Yankees": { total: "8.5", homeML: -140, awayML: 120 },
};

describe("computeGameBoard", () => {
  it("returns empty array for empty slate", () => {
    expect(computeGameBoard("nrfi", [], NRFI_DATA, WEATHER, ODDS_MAP, PITCHER_STATS, UMPIRES)).toEqual([]);
  });

  it("returns a game entry for valid slate", () => {
    const result = computeGameBoard("nrfi", [BASE_GAME], NRFI_DATA, WEATHER, ODDS_MAP, PITCHER_STATS, UMPIRES);
    expect(result.length).toBe(1);
  });

  it("each entry has required fields", () => {
    const result = computeGameBoard("nrfi", [BASE_GAME], NRFI_DATA, WEATHER, ODDS_MAP, PITCHER_STATS, UMPIRES);
    result.forEach(g => {
      expect(g).toHaveProperty("gamePk");
      expect(g).toHaveProperty("score");
      expect(g).toHaveProperty("lean");
      expect(g).toHaveProperty("factors");
      expect(Array.isArray(g.factors)).toBe(true);
    });
  });

  it("score is within valid range", () => {
    const result = computeGameBoard("nrfi", [BASE_GAME], NRFI_DATA, WEATHER, ODDS_MAP, PITCHER_STATS, UMPIRES);
    result.forEach(g => {
      expect(g.score).toBeGreaterThanOrEqual(10);
      expect(g.score).toBeLessThanOrEqual(95);
    });
  });

  it("works for type='total'", () => {
    const result = computeGameBoard("total", [BASE_GAME], NRFI_DATA, WEATHER, ODDS_MAP, PITCHER_STATS, UMPIRES);
    expect(Array.isArray(result)).toBe(true);
  });
});
