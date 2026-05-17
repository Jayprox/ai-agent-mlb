# CODEX TASK 130 — Phase 3: Extract Shared UI Primitives into `src/components/shared.jsx`

## Goal

Continue the component split refactor. Phase 3 extracts all shared presentational primitives (`LeanBadge`, `TIER_BADGES`, `TierBadge`, `GameStatusBadge`, `RankScoreColumn`, `Card`, `Divider`) from `prop-scout-v7.jsx` into a single `src/components/shared.jsx` module, adds component tests, and replaces the inline definitions with a single import.

**This is a pure refactor — zero behavior changes. The app must look and work identically after this task.**

---

## Files Created

- `src/components/shared.jsx` — all seven primitives as named exports
- `src/components/shared.test.jsx` — component tests using @testing-library/react

## Files Modified

- `prop-scout-v7.jsx` — delete the 7 inline definitions; add 1 import line from `./src/components/shared.jsx`

---

## Background

The seven primitives live in a contiguous "PRIMITIVES" block starting around line 1378 of `prop-scout-v7.jsx`. They are all fully self-contained: no closures over component state, no data-fetching, no imports beyond React's JSX transform. `TierBadge` depends on `LeanBadge` and `TIER_BADGES`, but since they move to the same file that internal dependency is transparent.

`Card` and `Divider` are also in this block — include them to keep the PRIMITIVES section clean.

---

## Part 1 — Create `src/components/shared.jsx`

Copy each of the following verbatim from `prop-scout-v7.jsx` and add `export` in front of each. **Do not change any logic or JSX.**

Items to extract (search by name):

- `LeanBadge` — `const LeanBadge = ({ label, positive, small, color: customColor, title }) => { ... }`
- `TIER_BADGES` — the config object (`const TIER_BADGES = { algorithmic: {...}, projection: {...}, ai: {...}, predictive: {...} }`)
- `TierBadge` — `const TierBadge = ({ tier, small = true }) => ...` (depends on `LeanBadge` and `TIER_BADGES`, both are in this same file)
- `GameStatusBadge` — `const GameStatusBadge = ({ status }) => ...`
- `RankScoreColumn` — `const RankScoreColumn = ({ rank, score, scoreColor: sc, simConfidence }) => ...`
- `Card` — `const Card = ({ children, style, onClick }) => ...`
- `Divider` — `const Divider = () => ...`

The file should start:

```jsx
// src/components/shared.jsx
// Shared presentational primitives — no state, no data-fetching.

export const LeanBadge = ...
export const TIER_BADGES = ...
export const TierBadge = ...
export const GameStatusBadge = ...
export const RankScoreColumn = ...
export const Card = ...
export const Divider = ...
```

Order matters: `LeanBadge` and `TIER_BADGES` must appear before `TierBadge` since `TierBadge` references them.

---

## Part 2 — Update `prop-scout-v7.jsx`

### 2a — Add the import line

Add this import after the existing `src/scoring/pitcher.js` import (line 16):

```js
import { LeanBadge, TierBadge, GameStatusBadge, RankScoreColumn, Card, Divider } from "./src/components/shared.jsx";
```

Note: `TIER_BADGES` is only used internally by `TierBadge` in the new file. It does **not** need to be imported into `prop-scout-v7.jsx` unless there is a call site that references it directly — check with grep first.

### 2b — Delete the inline definitions

Remove the full definitions (including comment headers) for all seven items from `prop-scout-v7.jsx`. The "PRIMITIVES" comment block header (`// ─────── PRIMITIVES ───────`) can stay or be removed — your choice.

After deletion, verify:
- No `ReferenceError` for any of the 7 names
- Grep for each name in `prop-scout-v7.jsx` — only call sites and the import line should remain

---

## Part 3 — Write Tests

Create `src/components/shared.test.jsx`. Use `@testing-library/react` (`render`, `screen`).

```jsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  LeanBadge,
  TierBadge,
  GameStatusBadge,
  RankScoreColumn,
  Card,
  Divider,
} from "./shared.jsx";

// ── LeanBadge ─────────────────────────────────────────────

describe("LeanBadge", () => {
  it("renders its label text", () => {
    render(<LeanBadge label="OVER" positive={true} small />);
    expect(screen.getByText("OVER")).toBeTruthy();
  });

  it("renders without crashing for negative signal", () => {
    render(<LeanBadge label="UNDER" positive={false} small />);
    expect(screen.getByText("UNDER")).toBeTruthy();
  });

  it("renders without crashing with a custom color", () => {
    render(<LeanBadge label="NEUTRAL" color="#f59e0b" small />);
    expect(screen.getByText("NEUTRAL")).toBeTruthy();
  });
});

// ── TierBadge ─────────────────────────────────────────────

describe("TierBadge", () => {
  it("renders ALGORITHMIC for 'algorithmic' tier", () => {
    render(<TierBadge tier="algorithmic" />);
    expect(screen.getByText("ALGORITHMIC")).toBeTruthy();
  });

  it("renders AI-ASSISTED for 'ai' tier", () => {
    render(<TierBadge tier="ai" />);
    expect(screen.getByText("AI-ASSISTED")).toBeTruthy();
  });

  it("falls back to ALGORITHMIC for unknown tier", () => {
    render(<TierBadge tier="unknown_tier" />);
    expect(screen.getByText("ALGORITHMIC")).toBeTruthy();
  });

  it("renders PREDICTIVE for 'predictive' tier", () => {
    render(<TierBadge tier="predictive" />);
    expect(screen.getByText("PREDICTIVE")).toBeTruthy();
  });
});

// ── GameStatusBadge ───────────────────────────────────────

describe("GameStatusBadge", () => {
  it("renders LIVE text for status=LIVE", () => {
    render(<GameStatusBadge status="LIVE" />);
    expect(screen.getByText("LIVE")).toBeTruthy();
  });

  it("renders FINAL text for status=FINAL", () => {
    render(<GameStatusBadge status="FINAL" />);
    expect(screen.getByText("FINAL")).toBeTruthy();
  });

  it("renders nothing for unknown status", () => {
    const { container } = render(<GameStatusBadge status="SCHEDULED" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for no status", () => {
    const { container } = render(<GameStatusBadge />);
    expect(container.firstChild).toBeNull();
  });
});

// ── RankScoreColumn ───────────────────────────────────────

describe("RankScoreColumn", () => {
  it("renders rank and score", () => {
    render(<RankScoreColumn rank={3} score={72} scoreColor="#22c55e" simConfidence={null} />);
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("72")).toBeTruthy();
  });

  it("renders SIM confidence when provided", () => {
    render(<RankScoreColumn rank={1} score={85} scoreColor="#22c55e" simConfidence={68} />);
    expect(screen.getByText("68%")).toBeTruthy();
    expect(screen.getByText("SIM")).toBeTruthy();
  });

  it("does not render SIM block when simConfidence is null", () => {
    render(<RankScoreColumn rank={1} score={85} scoreColor="#22c55e" simConfidence={null} />);
    expect(screen.queryByText("SIM")).toBeNull();
  });
});

// ── Card ──────────────────────────────────────────────────

describe("Card", () => {
  it("renders children", () => {
    render(<Card><span>hello</span></Card>);
    expect(screen.getByText("hello")).toBeTruthy();
  });
});

// ── Divider ───────────────────────────────────────────────

describe("Divider", () => {
  it("renders without crashing", () => {
    const { container } = render(<Divider />);
    expect(container.firstChild).toBeTruthy();
  });
});
```

---

## Part 4 — Verify `TIER_BADGES` Usage

Before writing the import line, grep `prop-scout-v7.jsx` for any direct reference to `TIER_BADGES` outside of the (now-deleted) `TierBadge` definition:

```bash
grep -n "TIER_BADGES" prop-scout-v7.jsx
```

If there are call sites that reference `TIER_BADGES` directly (not via `TierBadge`), add it to the import. If the only reference was inside the `TierBadge` body, it does not need to be imported.

---

## Part 5 — Smoke-Test the App

After updating imports, run `npm run dev` and verify:
- All board cards render with correct tier badges
- LIVE / FINAL status badges appear on game cards
- Rank + score column appears correctly on pitcher/batter cards
- No `ReferenceError` in console

---

## Checklist

- [ ] `src/components/shared.jsx` created — 7 named exports (`LeanBadge`, `TIER_BADGES`, `TierBadge`, `GameStatusBadge`, `RankScoreColumn`, `Card`, `Divider`)
- [ ] Order in the file: `LeanBadge` and `TIER_BADGES` before `TierBadge`
- [ ] `src/components/shared.test.jsx` created — all tests pass (`npm run test`)
- [ ] Import line added to `prop-scout-v7.jsx` (after scorer imports, before any component code)
- [ ] `TIER_BADGES` direct usage checked — imported if needed, otherwise left out
- [ ] All 7 inline definitions removed from `prop-scout-v7.jsx`
- [ ] No duplicate declarations remain
- [ ] `npm run test` passes (all prior tests still green + new component tests)
- [ ] `npm run build` passes
- [ ] `npm run dev` still works — visual output pixel-identical

---

## After Completing

Reply "Task 130 complete" and paste the output of `npm run test` so we can verify all tests pass.
