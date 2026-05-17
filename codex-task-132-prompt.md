# CODEX TASK 132 — Phase 4b: Extract Board Compute Layer into `src/board/`

## Goal

Final extraction phase of the component split refactor. This task moves the board compute functions (`computePitcherBoard`, `computeBatterBoard`, `computeGameBoard`), the AI payload builder (`buildAiBoardPayload`), and their supporting helpers (`vigStrip`, `propEdgeData`) into `src/board/index.js`. It also promotes two shared constants/utilities that are referenced by both the board module and the main component body:

- `UMPIRE_STATS` → appended to `src/constants.js`
- `normalizeScratchName` → appended to `src/utils.js`

After this task, `prop-scout-v7.jsx` will contain only React component state, hooks, effects, event handlers, and JSX render logic — no more module-level scoring or compute functions.

**This is a pure refactor — zero behavior changes. The app must work identically after this task.**

---

## Files Created

- `src/board/index.js` — `computePitcherBoard`, `computeBatterBoard`, `computeGameBoard`, `buildAiBoardPayload`

## Files Modified

- `src/constants.js` — append `UMPIRE_STATS` as a named export
- `src/utils.js` — append `normalizeScratchName`, `vigStrip`, `propEdgeData` as named exports
- `prop-scout-v7.jsx` — add 3 import lines; delete 7 inline definitions

---

## Part 1 — Append to `src/constants.js`

Add `UMPIRE_STATS` as a named export at the end of `src/constants.js`. Copy it verbatim from `prop-scout-v7.jsx` (search for `const UMPIRE_STATS =`). It is currently around line 104 and spans ~60 lines.

```js
// Append to src/constants.js:
export const UMPIRE_STATS = {
  // ... verbatim from prop-scout-v7.jsx ...
};
```

Also add `UMPIRE_STATS` to the import in `prop-scout-v7.jsx`:

```js
// Before:
import {
  PARK_FACTORS,
  NEUTRAL_PARK,
  HOME_FIELD_ADV,
  DEFAULT_HOME_ADV,
  MODEL_TIER,
} from "./src/constants.js";

// After:
import {
  PARK_FACTORS,
  NEUTRAL_PARK,
  HOME_FIELD_ADV,
  DEFAULT_HOME_ADV,
  MODEL_TIER,
  UMPIRE_STATS,
} from "./src/constants.js";
```

Then delete the inline `const UMPIRE_STATS = { ... }` declaration from `prop-scout-v7.jsx`.

---

## Part 2 — Append to `src/utils.js`

Add `normalizeScratchName`, `vigStrip`, and `propEdgeData` as named exports at the end of `src/utils.js`. Copy each verbatim from `prop-scout-v7.jsx`.

- `normalizeScratchName` is around line 471: `const normalizeScratchName = (name) => ...`
- `vigStrip` is around line 2202: `const vigStrip = (leanRaw, oppRaw) => ...`
- `propEdgeData` is around line 2207: `function propEdgeData(propLine, lean) { ... }`

**Important:** `propEdgeData` calls `mlToImplied` and `vigStrip`. Since both `mlToImplied` and `vigStrip` are now in the same file (`src/utils.js`), there is no import needed — just ensure `vigStrip` is defined before `propEdgeData` in the file.

```js
// Append to src/utils.js:

export const normalizeScratchName = (name) =>
  String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export const vigStrip = (leanRaw, oppRaw) => {
  // ... verbatim ...
};

export function propEdgeData(propLine, lean) {
  // ... verbatim (it calls mlToImplied and vigStrip, both in this file) ...
}
```

Add the new names to the import in `prop-scout-v7.jsx`:

```js
// Before:
import {
  mlToImplied,
  formatLocalTime,
  resultBorderStyle,
  summarizeOutcomes,
} from "./src/utils.js";

// After:
import {
  mlToImplied,
  formatLocalTime,
  resultBorderStyle,
  summarizeOutcomes,
  normalizeScratchName,
  vigStrip,
  propEdgeData,
} from "./src/utils.js";
```

Then delete the three inline definitions from `prop-scout-v7.jsx`.

---

## Part 3 — Create `src/board/index.js`

Create a new directory `src/board/` and file `src/board/index.js`.

The file imports everything it needs from the already-extracted modules, then copies the four compute functions verbatim:

```js
// src/board/index.js
// Board compute layer — pure functions that transform live state into scored candidate arrays.

import {
  PARK_FACTORS,
  NEUTRAL_PARK,
  UMPIRE_STATS,
} from "../constants.js";
import {
  mlToImplied,
  normalizeScratchName,
  vigStrip,
  propEdgeData,
} from "../utils.js";
import { kBoardScore, outsBoardScore } from "../scoring/pitcher.js";
import { hrBoardScore, hitBoardScore } from "../scoring/batter.js";
import {
  simKConfidence,
  simOutsConfidence,
  simHRConfidence,
  simHitsConfidence,
  simF5MLConfidence,
} from "../scoring/sim.js";

export const computePitcherBoard = (...) => { /* verbatim */ };
export const computeBatterBoard  = (...) => { /* verbatim */ };
export const computeGameBoard    = (...) => { /* verbatim */ };
export function buildAiBoardPayload(...) { /* verbatim */ }
```

**Important notes for the copy:**

1. `computePitcherBoard` calls `kBoardScore`, `outsBoardScore`, `simKConfidence`, `simOutsConfidence`, and uses `PARK_FACTORS`, `NEUTRAL_PARK`. All are imported above.

2. `computeBatterBoard` calls `hrBoardScore`, `hitBoardScore`, `simHRConfidence`, `simHitsConfidence`, uses `PARK_FACTORS`, `NEUTRAL_PARK`, and calls `normalizeScratchName`. All imported above.

3. `computeGameBoard` uses `PARK_FACTORS`, `NEUTRAL_PARK`, `UMPIRE_STATS`. All imported above.

4. `buildAiBoardPayload` calls all three compute functions (in the same file — no import needed for them), calls `mlToImplied`, `vigStrip`, `propEdgeData`, `simF5MLConfidence`. All imported above.

5. Do **not** export `vigStrip` or `propEdgeData` from `src/board/index.js` — they are already exported from `src/utils.js` for the main component's use. The board module uses the `src/utils.js` versions via import.

---

## Part 4 — Update `prop-scout-v7.jsx`

### 4a — Add the board import line

Add this import after the existing `src/scoring/sim.js` import:

```js
import {
  computePitcherBoard,
  computeBatterBoard,
  computeGameBoard,
  buildAiBoardPayload,
} from "./src/board/index.js";
```

### 4b — Delete the inline definitions

Remove the full bodies of these 4 functions from `prop-scout-v7.jsx`:
- `computePitcherBoard` (search for `const computePitcherBoard =`)
- `computeBatterBoard` (search for `const computeBatterBoard =`)
- `buildAiBoardPayload` (search for `function buildAiBoardPayload(`)
- `computeGameBoard` (search for `const computeGameBoard =`)

After deletion, grep each name in `prop-scout-v7.jsx` — only the import line and existing call sites should remain. No definitions.

### 4c — Verify call sites are unchanged

The call sites inside the component (board render IIFEs, lock useEffect, AI board fetch) reference `computePitcherBoard`, `computeBatterBoard`, `computeGameBoard`, `buildAiBoardPayload` by name. These should continue to work without any modification since the names are imported from `src/board/index.js`.

---

## Part 5 — Write Tests

Create `src/board/index.test.js`. These are integration-style tests that pass minimal mock slate/state data and verify the contracts (shape, sort order, caps).

```js
import { describe, it, expect } from "vitest";
import {
  computePitcherBoard,
  computeBatterBoard,
  computeGameBoard,
} from "./index.js";

// ── Shared fixtures ───────────────────────────────────────

const GAME_PK = 12345;
const BASE_GAME = {
  gamePk: GAME_PK,
  gameTime: "2025-05-15T18:05:00Z",
  home: { abbr: "NYY", name: "New York Yankees" },
  away: { abbr: "BOS", name: "Boston Red Sox" },
  stadium: "Yankee Stadium",
  probablePitchers: {
    home: { id: 1001, name: "Gerrit Cole",    hand: "R", era: "2.80" },
    away: { id: 1002, name: "Chris Sale",     hand: "L", era: "3.10" },
  },
  pitcher:      { id: 1001, name: "Gerrit Cole",  hand: "R", era: "2.80" },
  awayPitcher:  { id: 1002, name: "Chris Sale",   hand: "L", era: "3.10" },
  odds: { total: "8.5", homeML: -140, awayML: 120 },
};

const PITCHER_STATS = {
  1001: { era: "2.80", kPer9: "10.2", whip: "1.05", swStrPct: 14 },
  1002: { era: "3.10", kPer9: "9.8",  whip: "1.12", swStrPct: 13 },
};

const GAME_LOG = {
  1001: { avgIP: "6.2", games: [{ k: 9, ip: "7.0", er: 1, pc: 95, date: "2025-05-10" }] },
  1002: { avgIP: "6.0", games: [{ k: 8, ip: "6.0", er: 2, pc: 88, date: "2025-05-10" }] },
};

const PLAYER_PROPS = {};
const TEAM_STATS = {};
const UMPIRES = {};
const ARSENAL = {};

// ── computePitcherBoard ───────────────────────────────────

describe("computePitcherBoard", () => {
  it("returns empty array for empty slate", () => {
    expect(computePitcherBoard("k", [], PITCHER_STATS, GAME_LOG, UMPIRES, PLAYER_PROPS, TEAM_STATS)).toEqual([]);
  });

  it("returns empty array for null slate", () => {
    expect(computePitcherBoard("k", null, PITCHER_STATS, GAME_LOG, UMPIRES, PLAYER_PROPS, TEAM_STATS)).toEqual([]);
  });

  it("returns candidates for a valid slate", () => {
    const result = computePitcherBoard("k", [BASE_GAME], PITCHER_STATS, GAME_LOG, UMPIRES, PLAYER_PROPS, TEAM_STATS);
    expect(result.length).toBeGreaterThan(0);
  });

  it("candidates are sorted by score descending", () => {
    const result = computePitcherBoard("k", [BASE_GAME], PITCHER_STATS, GAME_LOG, UMPIRES, PLAYER_PROPS, TEAM_STATS);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
    }
  });

  it("each candidate has required fields", () => {
    const result = computePitcherBoard("k", [BASE_GAME], PITCHER_STATS, GAME_LOG, UMPIRES, PLAYER_PROPS, TEAM_STATS);
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
    const result = computePitcherBoard("outs", [BASE_GAME], PITCHER_STATS, GAME_LOG, UMPIRES, PLAYER_PROPS, TEAM_STATS);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── computeBatterBoard ────────────────────────────────────

const BATTER_A = { id: 2001, name: "Aaron Judge",  hand: "R", order: 3,  obp: "0.420", avg: "0.290" };
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
    // Build a lineup with 9 batters all with good stats
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

// ── computeGameBoard ──────────────────────────────────────

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
```

---

## Part 6 — Update `src/constants.test.js`

After appending `UMPIRE_STATS` to `src/constants.js`, add a minimal test to `src/constants.test.js`:

```js
import { UMPIRE_STATS } from "./constants.js";

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
```

---

## Part 7 — Smoke-Test the App

After all changes, run `npm run dev` and verify:
- Board tab renders HR/Hits/K/Outs candidates
- Game board renders NRFI/Total/Spread/ML/F5 candidates
- AI Board fetch triggers correctly (the board summary and AI board IIFEs use `buildAiBoardPayload`)
- No `ReferenceError` in console

---

## Checklist

- [ ] `UMPIRE_STATS` appended to `src/constants.js` as a named export
- [ ] `normalizeScratchName`, `vigStrip`, `propEdgeData` appended to `src/utils.js` as named exports
- [ ] `vigStrip` defined before `propEdgeData` in `src/utils.js`
- [ ] `src/board/index.js` created with 4 named exports
- [ ] All imports inside `src/board/index.js` use relative paths (`../constants.js`, `../utils.js`, `../scoring/pitcher.js`, etc.)
- [ ] `prop-scout-v7.jsx` updated: `UMPIRE_STATS` added to constants import, `normalizeScratchName`/`vigStrip`/`propEdgeData` added to utils import, board import line added
- [ ] 7 inline definitions removed from `prop-scout-v7.jsx`: `UMPIRE_STATS`, `normalizeScratchName`, `vigStrip`, `propEdgeData`, `computePitcherBoard`, `computeBatterBoard`, `computeGameBoard`, `buildAiBoardPayload`
- [ ] `src/board/index.test.js` created — all tests pass (`npm run test`)
- [ ] `src/constants.test.js` updated with `UMPIRE_STATS` tests — all pass
- [ ] `npm run test` passes (all prior tests still green + new board tests)
- [ ] `npm run build` passes
- [ ] `npm run dev` still works — board and game candidates render correctly

---

## After Completing

Reply "Task 132 complete" and paste the output of `npm run test` so we can verify all tests pass.
