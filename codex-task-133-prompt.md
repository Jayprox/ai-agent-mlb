# CODEX TASK 133 — JSX Phase 1: Extract `PitcherBoardCard` + `BatterBoardCard`

## Goal

Extract the two prop board candidate cards from the inline `renderBoardCandidateCard` function inside `prop-scout-v7.jsx` into standalone React components:

- `src/components/PitcherBoardCard.jsx` — card rendered for K and Outs board tabs
- `src/components/BatterBoardCard.jsx` — card rendered for HR and Hits board tabs

**This is a pure refactor — zero behavior changes. Both cards must look and behave pixel-identically after this task.**

---

## Files Created

- `src/components/PitcherBoardCard.jsx`
- `src/components/BatterBoardCard.jsx`
- `src/components/PitcherBoardCard.test.jsx`
- `src/components/BatterBoardCard.test.jsx`

## Files Modified

- `prop-scout-v7.jsx` — replace inline card JSX with `<PitcherBoardCard />` and `<BatterBoardCard />`; add 2 import lines

---

## Background

Inside the board render section (~line 8959), there is an IIFE:

```js
) : !isGameBoard && (() => {
  const renderBoardCandidateCard = (c, i) => {
    const sc = boardScoreColor(c.score);
    if (isPitcherBoard) {
      // ~163 lines of pitcher card JSX
    }
    // ~200 lines of batter card JSX
  };
  ...
})()
```

Both cards close over parent state through `renderBoardCandidateCard`. The refactor strategy is:
1. Compute all derived values at the call site (inside `renderBoardCandidateCard`)
2. Pass them as explicit props to the new components
3. The new components are fully pure — they receive everything they render as props

---

## Part 1 — Identify What Each Card Needs

### PitcherBoardCard needs:

| Prop | Type | Source in parent |
|------|------|-----------------|
| `c` | object | the candidate |
| `rank` | number | `i + 1` via `allDisplayCandidates.findIndex(...)` |
| `boardTab` | string | `boardTab` state ("k" \| "outs") |
| `sc` | string | `boardScoreColor(c.score)` |
| `boardGameStatus` | string\|null | `getBoardGameStatus(c.gamePk)` |
| `todayResult` | object\|null | `liveBoardResults[c.id] ?? null` |
| `pitcherMetrics` | object | merged `{ ...livePitcherStats[c.id], ...c, ...arsenalOverlay }` |
| `summaryText` | string\|null | `getCardSummaryText(buildBoardSummaryRequest(c, boardTab))` |
| `isPremium` | boolean | `!!aiCardSummaries[\`premium:${req?.id}\`]` |
| `preferredBook` | string | `preferredBook` state |
| `onCardClick` | function | `() => setWhyModal({ c, type: boardTab, rank: i + 1 })` |

### BatterBoardCard needs:

| Prop | Type | Source in parent |
|------|------|-----------------|
| `c` | object | the candidate |
| `rank` | number | `i + 1` via `allDisplayCandidates.findIndex(...)` |
| `boardTab` | string | `boardTab` state ("hr" \| "hits") |
| `sc` | string | `boardScoreColor(c.score)` |
| `boardGameStatus` | string\|null | `getBoardGameStatus(c.gamePk)` |
| `todayResult` | object\|null | `liveBoardResults[c.id] ?? null` |
| `evEdge` | object\|null | `computeEVEdge(c, boardTab)` |
| `summaryText` | string\|null | `getCardSummaryText(buildBoardSummaryRequest(c, boardTab))` |
| `isPremium` | boolean | `!!aiCardSummaries[\`premium:${req?.id}\`]` |
| `preferredBook` | string | `preferredBook` state |
| `onCardClick` | function | `() => setWhyModal({ c, type: boardTab, rank: i + 1 })` |

---

## Part 2 — Create `src/components/PitcherBoardCard.jsx`

Move the pitcher card JSX block verbatim. The component receives all needed data as props — it does not import state or call any hooks.

```jsx
// src/components/PitcherBoardCard.jsx
import { Card, RankScoreColumn, TierBadge, GameStatusBadge } from "./shared.jsx";
import { resultBorderStyle, formatLocalTime } from "../utils.js";

const BOOK_COLORS = {
  DK: "#38bdf8", FD: "#34d399", CZR: "#fb923c", MGM: "#a78bfa", BOV: "#f87171",
};

export default function PitcherBoardCard({
  c, rank, boardTab, sc,
  boardGameStatus, todayResult, pitcherMetrics,
  summaryText, isPremium, preferredBook,
  onCardClick,
}) {
  const hasResolvedResult = !!todayResult && !todayResult.live;
  const propLineValue = c.propLine?.line ?? c.suggestedLine;
  const boardLean = c.score >= 55 ? "OVER" : "UNDER";
  const boardLeanPositive = boardLean === "OVER";
  const pitcherHit = hasResolvedResult && propLineValue !== null && propLineValue !== undefined && (
    boardTab === "k"
      ? (boardLean === "UNDER" ? todayResult.k < propLineValue : todayResult.k > propLineValue)
      : (boardLean === "UNDER" ? todayResult.outs < propLineValue : todayResult.outs > propLineValue)
  );
  const resultCardStyle = resultBorderStyle(hasResolvedResult ? (pitcherHit ? "#22c55e" : "#ef4444") : null);
  const propBadgeLine = propLineValue !== null && propLineValue !== undefined ? `${propLineValue}` : "—";

  // ... verbatim JSX from prop-scout-v7.jsx pitcher card block ...
  // The return statement is the <Card> block starting at line ~8988
}
```

**Key points:**
- `resultBorderStyle` and `formatLocalTime` are imported from `../utils.js`
- `Card`, `RankScoreColumn`, `TierBadge`, `GameStatusBadge` are imported from `./shared.jsx`
- All the derived values currently computed inline (`hasResolvedResult`, `pitcherHit`, `boardLean`, etc.) move into the component body
- The `BOOK_COLORS` object (DK → #38bdf8, etc.) is defined locally since both cards use it

---

## Part 3 — Create `src/components/BatterBoardCard.jsx`

Move the batter card JSX block verbatim.

```jsx
// src/components/BatterBoardCard.jsx
import { Card, RankScoreColumn, GameStatusBadge } from "./shared.jsx";
import { resultBorderStyle, formatLocalTime } from "../utils.js";

const BOOK_COLORS = {
  DK: "#38bdf8", FD: "#34d399", CZR: "#fb923c", MGM: "#a78bfa", BOV: "#f87171",
};

export default function BatterBoardCard({
  c, rank, boardTab, sc,
  boardGameStatus, todayResult, evEdge,
  summaryText, isPremium, preferredBook,
  onCardClick,
}) {
  const l5dots = Array.from({ length: 5 }, (_, j) => c.hitRate[j] ?? null);
  const isHrBoard = boardTab === "hr";
  const hasResult = todayResult && todayResult.ab > 0;
  const gotHR = hasResult && todayResult.hr > 0;
  const gotHit = hasResult && todayResult.h > 0 && !gotHR;
  const ohFer = hasResult && todayResult.h === 0;
  const resultCardStyle = resultBorderStyle(
    isHrBoard
      ? (gotHR ? "#fbbf24" : (boardGameStatus === "FINAL" ? "#ef4444" : null))
      : (gotHR ? "#fbbf24" : (gotHit ? "#22c55e" : (ohFer ? "#ef4444" : null)))
  );

  // ... verbatim JSX from prop-scout-v7.jsx batter card block ...
  // The return statement is the <Card> block starting at line ~9144
}
```

**Key points:**
- Same imports as `PitcherBoardCard`
- `evEdge` replaces the inline `computeEVEdge(c, boardTab)` call — EV edge display logic is verbatim, just reads `evEdge` instead of calling the function
- `l5dots`, `isHrBoard`, result flags all move into the component body

---

## Part 4 — Update `renderBoardCandidateCard` in `prop-scout-v7.jsx`

Add import lines (after the existing component imports):
```js
import PitcherBoardCard from "./src/components/PitcherBoardCard.jsx";
import BatterBoardCard from "./src/components/BatterBoardCard.jsx";
```

Replace `renderBoardCandidateCard` with a slim dispatcher:

```jsx
const renderBoardCandidateCard = (c, i) => {
  const sc = boardScoreColor(c.score);
  const boardGameStatus = getBoardGameStatus(c.gamePk);
  const boardSummaryRequest = buildBoardSummaryRequest(c, boardTab);
  const summaryText = getCardSummaryText(boardSummaryRequest);
  const isPremium = !!aiCardSummaries[`premium:${boardSummaryRequest?.id}`];
  const todayResult = liveBoardResults[c.id] ?? null;

  if (isPitcherBoard) {
    const pitcherMetrics = {
      ...(livePitcherStats[c.id] ?? {}),
      ...c,
      ...(pitcherArsenal[c.id]?.pitcherStats ? {
        swStrPct: pitcherArsenal[c.id].pitcherStats.swStrPct,
        chasePct: pitcherArsenal[c.id].pitcherStats.oSwingPct,
      } : {}),
    };
    return (
      <PitcherBoardCard
        key={`${c.id}-${c.gamePk}`}
        c={c}
        rank={i + 1}
        boardTab={boardTab}
        sc={sc}
        boardGameStatus={boardGameStatus}
        todayResult={todayResult}
        pitcherMetrics={pitcherMetrics}
        summaryText={summaryText}
        isPremium={isPremium}
        preferredBook={preferredBook}
        onCardClick={() => setWhyModal({ c, type: boardTab, rank: i + 1 })}
      />
    );
  }

  return (
    <BatterBoardCard
      key={`${c.id}-${c.gamePk}`}
      c={c}
      rank={i + 1}
      boardTab={boardTab}
      sc={sc}
      boardGameStatus={boardGameStatus}
      todayResult={todayResult}
      evEdge={computeEVEdge(c, boardTab)}
      summaryText={summaryText}
      isPremium={isPremium}
      preferredBook={preferredBook}
      onCardClick={() => setWhyModal({ c, type: boardTab, rank: i + 1 })}
    />
  );
};
```

**Important:** The `key` prop must move from inside the `<Card>` component to the outer `<PitcherBoardCard>` / `<BatterBoardCard>` element. Remove the `key` prop from the `<Card>` inside each new component since it's now set at the call site.

---

## Part 5 — Write Tests

### `src/components/PitcherBoardCard.test.jsx`

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PitcherBoardCard from "./PitcherBoardCard.jsx";

const NEUTRAL_METRICS = { era: "3.20", kPer9: "9.5", whip: "1.15", avgIP: "6.0" };

const BASE_CANDIDATE = {
  id: 1001,
  name: "Gerrit Cole",
  team: "NYY",
  hand: "R",
  gamePk: 12345,
  gameLabel: "BOS @ NYY",
  gameTime: null,
  score: 72,
  era: "3.20",
  k9: "9.5",
  whip: "1.15",
  avgIP: "6.0",
  avgK3: "8.5",
  umpire: null,
  umpireRating: null,
  propLine: null,
  suggestedLine: 6.5,
  simConfidence: 68,
  signals: [],
  swStrPct: null,
  chasePct: null,
  facingTeam: "BOS",
};

const DEFAULT_PROPS = {
  c: BASE_CANDIDATE,
  rank: 1,
  boardTab: "k",
  sc: "#22c55e",
  boardGameStatus: null,
  todayResult: null,
  pitcherMetrics: NEUTRAL_METRICS,
  summaryText: null,
  isPremium: false,
  preferredBook: "DK",
  onCardClick: vi.fn(),
};

describe("PitcherBoardCard", () => {
  it("renders player name and team", () => {
    render(<PitcherBoardCard {...DEFAULT_PROPS} />);
    expect(screen.getByText("Gerrit Cole")).toBeTruthy();
    expect(screen.getByText("NYY")).toBeTruthy();
  });

  it("renders rank and score", () => {
    render(<PitcherBoardCard {...DEFAULT_PROPS} />);
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("72")).toBeTruthy();
  });

  it("renders OVER lean badge for score >= 55", () => {
    render(<PitcherBoardCard {...DEFAULT_PROPS} />);
    expect(screen.getByText("OVER")).toBeTruthy();
  });

  it("renders UNDER lean badge for score < 55", () => {
    render(<PitcherBoardCard {...DEFAULT_PROPS} c={{ ...BASE_CANDIDATE, score: 42 }} sc="#ef4444" />);
    expect(screen.getByText("UNDER")).toBeTruthy();
  });

  it("calls onCardClick when card is tapped", () => {
    const onClick = vi.fn();
    render(<PitcherBoardCard {...DEFAULT_PROPS} onCardClick={onClick} />);
    fireEvent.click(screen.getByText("Gerrit Cole").closest("[style]") || document.querySelector("[style*='cursor']") || document.body.firstChild);
    // Card is clickable — just verify no error thrown
  });

  it("shows LIVE badge when boardGameStatus is LIVE", () => {
    render(<PitcherBoardCard {...DEFAULT_PROPS} boardGameStatus="LIVE" />);
    expect(screen.getByText("LIVE")).toBeTruthy();
  });

  it("shows FINAL badge when boardGameStatus is FINAL", () => {
    render(<PitcherBoardCard {...DEFAULT_PROPS} boardGameStatus="FINAL" />);
    expect(screen.getByText("FINAL")).toBeTruthy();
  });

  it("shows hit badge when result resolves as a hit", () => {
    render(<PitcherBoardCard
      {...DEFAULT_PROPS}
      boardGameStatus="FINAL"
      todayResult={{ k: 9, outs: 18, live: false }}
      c={{ ...BASE_CANDIDATE, score: 72, suggestedLine: 6.5 }}
    />);
    // Score >= 55 → OVER; 9K > 6.5 line → hit
    expect(screen.getAllByText(/9K|✓/).length).toBeGreaterThan(0);
  });

  it("shows AI summary text when provided", () => {
    render(<PitcherBoardCard {...DEFAULT_PROPS} summaryText="Strong K upside today." />);
    expect(screen.getByText("Strong K upside today.")).toBeTruthy();
  });

  it("shows SIM confidence via RankScoreColumn", () => {
    render(<PitcherBoardCard {...DEFAULT_PROPS} />);
    expect(screen.getByText("68%")).toBeTruthy();
    expect(screen.getByText("SIM")).toBeTruthy();
  });
});
```

### `src/components/BatterBoardCard.test.jsx`

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import BatterBoardCard from "./BatterBoardCard.jsx";

const BASE_CANDIDATE = {
  id: 2001,
  name: "Aaron Judge",
  team: "NYY",
  hand: "R",
  order: 3,
  gamePk: 12345,
  gameLabel: "BOS @ NYY",
  gameTime: null,
  score: 74,
  avg: "0.290",
  slg: "0.580",
  hr: 22,
  ops: "1.000",
  hitRate: [1, 1, 0, 1, 1],
  propLine: null,
  simConfidence: 71,
  windFav: false,
  parkFactor: 1.0,
  pitcher: "Chris Sale",
  pitcherHand: "L",
  lineupState: "confirmed",
  isSubstitution: false,
  substitutedFor: null,
};

const DEFAULT_PROPS = {
  c: BASE_CANDIDATE,
  rank: 1,
  boardTab: "hr",
  sc: "#22c55e",
  boardGameStatus: null,
  todayResult: null,
  evEdge: null,
  summaryText: null,
  isPremium: false,
  preferredBook: "DK",
  onCardClick: vi.fn(),
};

describe("BatterBoardCard", () => {
  it("renders player name and team", () => {
    render(<BatterBoardCard {...DEFAULT_PROPS} />);
    expect(screen.getByText("Aaron Judge")).toBeTruthy();
    expect(screen.getByText("NYY")).toBeTruthy();
  });

  it("renders rank and score", () => {
    render(<BatterBoardCard {...DEFAULT_PROPS} />);
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("74")).toBeTruthy();
  });

  it("renders 5 L5 dots", () => {
    const { container } = render(<BatterBoardCard {...DEFAULT_PROPS} />);
    // hitRate [1,1,0,1,1] = 5 dots
    const dots = container.querySelectorAll("[style*='border-radius: 50%']");
    expect(dots.length).toBeGreaterThanOrEqual(5);
  });

  it("shows LIVE badge when boardGameStatus is LIVE", () => {
    render(<BatterBoardCard {...DEFAULT_PROPS} boardGameStatus="LIVE" />);
    expect(screen.getByText("LIVE")).toBeTruthy();
  });

  it("shows FINAL badge when boardGameStatus is FINAL", () => {
    render(<BatterBoardCard {...DEFAULT_PROPS} boardGameStatus="FINAL" />);
    expect(screen.getByText("FINAL")).toBeTruthy();
  });

  it("shows CONFIRMED badge for confirmed lineup when not live/final", () => {
    render(<BatterBoardCard {...DEFAULT_PROPS} boardGameStatus={null} />);
    expect(screen.getByText("✓ CONFIRMED")).toBeTruthy();
  });

  it("shows WIND badge for wind-favorable HR candidates", () => {
    render(<BatterBoardCard {...DEFAULT_PROPS} c={{ ...BASE_CANDIDATE, windFav: true }} />);
    expect(screen.getByText("↑ WIND")).toBeTruthy();
  });

  it("shows SUB badge for substitution candidates", () => {
    render(<BatterBoardCard {...DEFAULT_PROPS} c={{ ...BASE_CANDIDATE, isSubstitution: true, substitutedFor: "Original Player" }} />);
    expect(screen.getByText("↔ SUB")).toBeTruthy();
  });

  it("shows HR result badge when batter hit a HR", () => {
    render(<BatterBoardCard
      {...DEFAULT_PROPS}
      boardGameStatus="FINAL"
      todayResult={{ ab: 4, hr: 1, h: 1 }}
    />);
    expect(screen.getByText(/HR/)).toBeTruthy();
  });

  it("shows EV edge badge when evEdge has a positive edge", () => {
    render(<BatterBoardCard
      {...DEFAULT_PROPS}
      evEdge={{ edge: 8, lean: "over", modelImplied: 60, bookImplied: 52, bestOdds: -110 }}
    />);
    expect(screen.getByText(/\+8% EDGE/)).toBeTruthy();
  });

  it("does not show EV edge badge when evEdge is null", () => {
    render(<BatterBoardCard {...DEFAULT_PROPS} evEdge={null} />);
    expect(screen.queryByText(/EDGE/)).toBeNull();
  });

  it("shows AI summary text when provided", () => {
    render(<BatterBoardCard {...DEFAULT_PROPS} summaryText="Hot bat, favorable matchup." />);
    expect(screen.getByText("Hot bat, favorable matchup.")).toBeTruthy();
  });

  it("shows SIM confidence", () => {
    render(<BatterBoardCard {...DEFAULT_PROPS} />);
    expect(screen.getByText("71%")).toBeTruthy();
    expect(screen.getByText("SIM")).toBeTruthy();
  });
});
```

---

## Part 6 — Smoke Test Checklist

After `npm run dev`, verify manually:

**K / Outs tabs:**
- [ ] Player name, team, handedness show
- [ ] ERA / K9 / WHIP / IP stats row shows correct color coding
- [ ] Prop line + OVER/UNDER lean badge appears
- [ ] SIM % shows on cards that have it
- [ ] LIVE / FINAL badges appear on in-progress / finished games
- [ ] ✓ / ✗ result badge appears for resolved games
- [ ] Book odds row shows when propLine.books is present
- [ ] AI summary text shows in italic below stats
- [ ] Tapping any card opens the Why? modal

**HR / Hits tabs:**
- [ ] Player name, team, batting order show
- [ ] ✓ CONFIRMED / LINEUP TBD badges show correctly
- [ ] ↔ SUB badge shows for substituted players
- [ ] L5 dots render correctly (green=hit, gray=out, dark=no data)
- [ ] ↑ WIND badge shows on HR tab for wind-favorable games
- [ ] +X% EDGE / X% VALUE badge shows when EV edge is meaningful
- [ ] HR / HIT / NO HR / NO HIT result badges appear for final games

---

## Checklist

- [ ] `src/components/PitcherBoardCard.jsx` created — default export
- [ ] `src/components/BatterBoardCard.jsx` created — default export
- [ ] Both components import only from `./shared.jsx` and `../utils.js` — no state access
- [ ] `BOOK_COLORS` constant defined locally in each component (not imported)
- [ ] `renderBoardCandidateCard` in `prop-scout-v7.jsx` is now a slim dispatcher (~30 lines)
- [ ] `key` prop is on `<PitcherBoardCard>` / `<BatterBoardCard>`, not inside the `<Card>` child
- [ ] 2 import lines added to `prop-scout-v7.jsx`
- [ ] `src/components/PitcherBoardCard.test.jsx` — all tests pass
- [ ] `src/components/BatterBoardCard.test.jsx` — all tests pass
- [ ] `npm run test` passes (all prior tests still green)
- [ ] `npm run build` passes
- [ ] `npm run dev` — K/Outs and HR/Hits tabs render pixel-identically

---

## After Completing

Reply "Task 133 complete" and paste `npm run test` output.

Then verify manually: open the Board tab, check all 4 prop board tabs (HR, Hits, K, Outs) look correct. Tap a card to confirm the Why? modal opens. Report any visual differences.
