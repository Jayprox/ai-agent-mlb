import { describe, it, expect } from "vitest";

function lookupBoardResult(item, liveBoardResults) {
  const rawId = item?.entityId ?? item?.id ?? item?.playerId;
  if (rawId == null || rawId === "") return null;
  const direct = liveBoardResults[rawId]
    ?? liveBoardResults[String(rawId)]
    ?? liveBoardResults[Number(rawId)]
    ?? null;
  if (direct) return direct;
  if (typeof rawId === "string" && rawId.includes(":")) {
    const parts = rawId.split(":");
    const extractedId = parts[1];
    return liveBoardResults[extractedId]
      ?? liveBoardResults[Number(extractedId)]
      ?? null;
  }
  return null;
}

function boardOutcome(type, item, liveBoardResults) {
  const result = lookupBoardResult(item, liveBoardResults);
  if (!result) return null;
  if (type === "hr") return result.ab > 0 ? result.hr > 0 : null;
  if (type === "hits") return result.ab > 0 ? result.h > 0 : null;
  return null;
}

function lockedCandidatesForType(type, {
  useSharedBoard,
  boardCandidatesByType,
  lockedBoardCandidates,
  getBoardGamePhase,
}) {
  if (useSharedBoard) {
    const pool = boardCandidatesByType[type] ?? [];
    return pool.filter(item => getBoardGamePhase(item.gamePk) !== "upcoming");
  }
  return Object.values(lockedBoardCandidates).flatMap(g => g[type] ?? []);
}

describe("lookupBoardResult", () => {
  it("matches a plain numeric id", () => {
    const result = lookupBoardResult(
      { id: 592450 },
      { "592450": { ab: 3, h: 1, hr: 0 } }
    );
    expect(result).toEqual({ ab: 3, h: 1, hr: 0 });
  });

  it("matches a plain string id", () => {
    const result = lookupBoardResult(
      { id: "592450" },
      { "592450": { ab: 2, h: 0, hr: 0 } }
    );
    expect(result).toEqual({ ab: 2, h: 0, hr: 0 });
  });

  it("prefers entityId over composite id", () => {
    const result = lookupBoardResult(
      { entityId: 592450, id: "hr:592450:745461" },
      { "592450": { ab: 4, h: 2, hr: 1 } }
    );
    expect(result).toEqual({ ab: 4, h: 2, hr: 1 });
  });

  it("falls back to composite id split when entityId is absent", () => {
    const result = lookupBoardResult(
      { id: "hr:592450:745461" },
      { "592450": { ab: 3, h: 1, hr: 0 } }
    );
    expect(result).toEqual({ ab: 3, h: 1, hr: 0 });
  });

  it("resolves composite id when results are keyed by number", () => {
    const result = lookupBoardResult(
      { id: "hits:603993:745461" },
      { 603993: { ab: 2, h: 1, hr: 0 } }
    );
    expect(result).toEqual({ ab: 2, h: 1, hr: 0 });
  });

  it("returns null when id is missing from results", () => {
    expect(lookupBoardResult(
      { id: 999999 },
      { "592450": { ab: 3, h: 1 } }
    )).toBeNull();
  });

  it("returns null for an empty id", () => {
    expect(lookupBoardResult(
      { id: "" },
      { "": { ab: 1 } }
    )).toBeNull();
  });

  it("returns null when no id fields exist", () => {
    expect(lookupBoardResult(
      {},
      { "592450": { ab: 3 } }
    )).toBeNull();
  });

  it("falls back to playerId", () => {
    const result = lookupBoardResult(
      { playerId: 592450 },
      { "592450": { ab: 2, h: 0 } }
    );
    expect(result).toEqual({ ab: 2, h: 0 });
  });
});

describe("boardOutcome", () => {
  it("returns true for an HR hit", () => {
    expect(boardOutcome(
      "hr",
      { id: 592450 },
      { "592450": { ab: 3, h: 1, hr: 1 } }
    )).toBe(true);
  });

  it("returns false for an HR miss", () => {
    expect(boardOutcome(
      "hr",
      { id: 592450 },
      { "592450": { ab: 3, h: 2, hr: 0 } }
    )).toBe(false);
  });

  it("returns null for HR when the player has 0 AB", () => {
    expect(boardOutcome(
      "hr",
      { id: 592450 },
      { "592450": { ab: 0, h: 0, hr: 0 } }
    )).toBeNull();
  });

  it("returns true for a hits prop that got a hit", () => {
    expect(boardOutcome(
      "hits",
      { id: 592450 },
      { "592450": { ab: 4, h: 1, hr: 0 } }
    )).toBe(true);
  });

  it("returns false for a hits prop that went hitless", () => {
    expect(boardOutcome(
      "hits",
      { id: 592450 },
      { "592450": { ab: 4, h: 0, hr: 0 } }
    )).toBe(false);
  });

  it("returns null for hits when the player has 0 AB", () => {
    expect(boardOutcome(
      "hits",
      { id: 592450 },
      { "592450": { ab: 0, h: 0, hr: 0 } }
    )).toBeNull();
  });

  it("returns null when no result exists", () => {
    expect(boardOutcome("hits", { id: 592450 }, {})).toBeNull();
  });

  it("resolves composite ids for hits outcomes", () => {
    expect(boardOutcome(
      "hits",
      { id: "hits:592450:745461" },
      { "592450": { ab: 3, h: 2 } }
    )).toBe(true);
  });
});

describe("lockedCandidatesForType", () => {
  const getBoardGamePhase = (gamePk) => (gamePk % 2 === 0 ? "final" : "upcoming");

  it("returns all final snapshot candidates when shared board is on", () => {
    const result = lockedCandidatesForType("hr", {
      useSharedBoard: true,
      boardCandidatesByType: {
        hr: [{ id: 1, gamePk: 100 }, { id: 2, gamePk: 102 }],
      },
      lockedBoardCandidates: {},
      getBoardGamePhase,
    });
    expect(result).toEqual([{ id: 1, gamePk: 100 }, { id: 2, gamePk: 102 }]);
  });

  it("falls back to live candidates when snapshot market key is absent", () => {
    const result = lockedCandidatesForType("hr", {
      useSharedBoard: true,
      boardCandidatesByType: {
        hr: [{ id: 3, gamePk: 104 }, { id: 4, gamePk: 106 }],
      },
      lockedBoardCandidates: {},
      getBoardGamePhase,
    });
    expect(result).toEqual([{ id: 3, gamePk: 104 }, { id: 4, gamePk: 106 }]);
  });

  it("returns empty array when shared-board candidates are all upcoming", () => {
    const result = lockedCandidatesForType("hr", {
      useSharedBoard: true,
      boardCandidatesByType: {
        hr: [{ id: 5, gamePk: 101 }, { id: 6, gamePk: 103 }],
      },
      lockedBoardCandidates: {},
      getBoardGamePhase,
    });
    expect(result).toEqual([]);
  });

  it("filters mixed shared-board candidates down to final only", () => {
    const result = lockedCandidatesForType("hits", {
      useSharedBoard: true,
      boardCandidatesByType: {
        hits: [{ id: 7, gamePk: 100 }, { id: 8, gamePk: 101 }, { id: 9, gamePk: 102 }],
      },
      lockedBoardCandidates: {},
      getBoardGamePhase,
    });
    expect(result).toEqual([{ id: 7, gamePk: 100 }, { id: 9, gamePk: 102 }]);
  });

  it("reads from lockedBoardCandidates when shared board is off", () => {
    const result = lockedCandidatesForType("k", {
      useSharedBoard: false,
      boardCandidatesByType: {},
      lockedBoardCandidates: {
        100: { k: [{ id: "a", gamePk: 100 }] },
        102: { k: [{ id: "b", gamePk: 102 }] },
      },
      getBoardGamePhase,
    });
    expect(result).toEqual([{ id: "a", gamePk: 100 }, { id: "b", gamePk: 102 }]);
  });

  it("gracefully ignores games without the requested type", () => {
    const result = lockedCandidatesForType("outs", {
      useSharedBoard: false,
      boardCandidatesByType: {},
      lockedBoardCandidates: {
        100: { k: [{ id: "a", gamePk: 100 }] },
        102: { outs: [{ id: "b", gamePk: 102 }] },
        104: {},
      },
      getBoardGamePhase,
    });
    expect(result).toEqual([{ id: "b", gamePk: 102 }]);
  });
});
