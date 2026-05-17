# CODEX TASK 128 — Phase 1: Vitest Setup + Extract Constants & Utils

## Goal

Begin splitting `prop-scout-v7.jsx` into modular files. Phase 1 is the safest possible start: extract pure data (constants) and pure functions (utilities) into standalone modules, wire up Vitest, and write tests to prove nothing regressed.

**This is a pure refactor — zero behavior changes. The app must work identically after this task.**

---

## Files Created

- `src/constants.js` — park factors, home field advantage, neutral park, model tier
- `src/utils.js` — mlToImplied, formatLocalTime, resultBorderStyle, summarizeOutcomes
- `src/constants.test.js` — tests for constants
- `src/utils.test.js` — tests for utils
- `vitest.config.js` — vitest configuration

## Files Modified

- `package.json` — add vitest + @testing-library/react devDependencies, add test script
- `vite.config.js` — add test config block
- `prop-scout-v7.jsx` — replace inline definitions with imports from src/

---

## Part 1 — Install Vitest

Add to `package.json` devDependencies:

```json
"vitest": "^1.6.0",
"@vitest/ui": "^1.6.0",
"@testing-library/react": "^16.0.0",
"@testing-library/jest-dom": "^6.4.0",
"jsdom": "^24.0.0"
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:ui": "vitest --ui"
```

---

## Part 2 — Vitest Config

Add a `vitest.config.js` at the project root:

```js
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test-setup.js",
  },
});
```

Create `src/test-setup.js`:
```js
import "@testing-library/jest-dom";
```

---

## Part 3 — Create `src/constants.js`

Search `prop-scout-v7.jsx` for each of these declarations and move them verbatim into `src/constants.js`. Do not change any values.

Items to extract (search by name):
- `const PARK_FACTORS` — the large object mapping team abbr → `{ hit, hr, k, run }`
- `const NEUTRAL_PARK` — the fallback park object `{ hit: 1.0, hr: 1.0, k: 1.0, run: 1.0 }`
- `const HOME_FIELD_ADV` — the 30-team lookup table mapping abbr → `[mlPts, spreadPts, f5Pts]`
- `const DEFAULT_HOME_ADV` — `[4, 3, 2]`
- `const MODEL_TIER` — the arrow function `(score) => score >= 65 ? "HIGH" : score >= 56 ? "MEDIUM" : "SPEC"`

Export all of them as named exports:

```js
export const PARK_FACTORS = { ... };
export const NEUTRAL_PARK = { ... };
export const HOME_FIELD_ADV = { ... };
export const DEFAULT_HOME_ADV = [4, 3, 2];
export const MODEL_TIER = (score) => ...;
```

In `prop-scout-v7.jsx`, replace each declaration with:
```js
import { PARK_FACTORS, NEUTRAL_PARK, HOME_FIELD_ADV, DEFAULT_HOME_ADV, MODEL_TIER } from "./src/constants.js";
```

---

## Part 4 — Create `src/utils.js`

Search `prop-scout-v7.jsx` for each of these and move them verbatim into `src/utils.js`. Do not change any logic.

Items to extract (search by name):
- `const mlToImplied` — converts American odds to implied probability
- `const formatLocalTime` — formats an ISO date string to local time display
- `const resultBorderStyle` — `(color) => color ? { borderLeft: ..., paddingLeft: 10 } : {}`
- `const summarizeOutcomes` — the shared hit summary helper added in Task 127

Export all as named exports:

```js
export const mlToImplied = ...;
export const formatLocalTime = ...;
export const resultBorderStyle = ...;
export const summarizeOutcomes = ...;
```

In `prop-scout-v7.jsx`, replace each declaration with:
```js
import { mlToImplied, formatLocalTime, resultBorderStyle, summarizeOutcomes } from "./src/utils.js";
```

**Important:** `resultBorderStyle` and `summarizeOutcomes` are currently defined inside render IIFEs (inside the component body). If so, move them to module level in `prop-scout-v7.jsx` first (right after the imports block), then move to `src/utils.js`. Verify they don't close over any component state — they should not.

---

## Part 5 — Write Tests

### `src/constants.test.js`

```js
import { describe, it, expect } from "vitest";
import { PARK_FACTORS, NEUTRAL_PARK, HOME_FIELD_ADV, DEFAULT_HOME_ADV, MODEL_TIER } from "./constants.js";

describe("PARK_FACTORS", () => {
  it("has an entry for every MLB team", () => {
    const teams = ["NYY", "LAD", "BOS", "HOU", "ATL", "CHC", "COL", "MIA"];
    teams.forEach(t => expect(PARK_FACTORS[t]).toBeDefined());
  });
  it("each entry has hit, hr, k, run keys", () => {
    Object.values(PARK_FACTORS).forEach(pf => {
      expect(pf).toHaveProperty("hit");
      expect(pf).toHaveProperty("hr");
      expect(pf).toHaveProperty("k");
    });
  });
});

describe("NEUTRAL_PARK", () => {
  it("has all factors at 1.0", () => {
    expect(NEUTRAL_PARK.hit).toBe(1.0);
    expect(NEUTRAL_PARK.hr).toBe(1.0);
    expect(NEUTRAL_PARK.k).toBe(1.0);
  });
});

describe("HOME_FIELD_ADV", () => {
  it("has entries for 30 teams", () => {
    expect(Object.keys(HOME_FIELD_ADV).length).toBe(30);
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
```

### `src/utils.test.js`

```js
import { describe, it, expect } from "vitest";
import { mlToImplied, resultBorderStyle, summarizeOutcomes } from "./utils.js";

describe("mlToImplied", () => {
  it("converts negative American odds to implied probability", () => {
    // -200 → 200/300 = 0.6667
    expect(mlToImplied(-200)).toBeCloseTo(0.6667, 3);
  });
  it("converts positive American odds to implied probability", () => {
    // +150 → 100/250 = 0.4
    expect(mlToImplied(150)).toBeCloseTo(0.4, 3);
  });
  it("returns null or falsy for invalid input", () => {
    expect(mlToImplied(0)).toBeFalsy();
    expect(mlToImplied(null)).toBeFalsy();
  });
});

describe("resultBorderStyle", () => {
  it("returns border style when color is provided", () => {
    const style = resultBorderStyle("#22c55e");
    expect(style.borderLeft).toContain("#22c55e");
    expect(style.paddingLeft).toBe(10);
  });
  it("returns empty object when color is null", () => {
    expect(resultBorderStyle(null)).toEqual({});
  });
  it("returns empty object when color is undefined", () => {
    expect(resultBorderStyle(undefined)).toEqual({});
  });
});

describe("summarizeOutcomes", () => {
  it("returns null for empty items array", () => {
    expect(summarizeOutcomes([], () => true)).toBeNull();
  });
  it("returns null when no items resolve", () => {
    expect(summarizeOutcomes([{}, {}], () => null)).toBeNull();
  });
  it("counts hits and total correctly", () => {
    const items = [1, 2, 3, 4];
    const result = summarizeOutcomes(items, v => v % 2 === 0); // 2, 4 → true; 1, 3 → false
    expect(result.hits).toBe(2);
    expect(result.total).toBe(4);
  });
  it("excludes null outcomes from total count", () => {
    // total = items.length (not resolved count)
    const items = [1, 2, 3];
    const result = summarizeOutcomes(items, v => v === 2 ? true : null);
    expect(result.hits).toBe(1);
    expect(result.total).toBe(3);
  });
});
```

---

## Part 6 — Smoke-Test the App

After all imports are updated, run `npm run dev` and verify:
- App loads without console errors
- Board tab renders candidates
- Game tab renders candidates
- No `ReferenceError` or `undefined` errors in console

---

## Checklist

- [ ] `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` added to package.json devDependencies
- [ ] `test`, `test:watch`, `test:ui` scripts added to package.json
- [ ] `vitest.config.js` created at project root
- [ ] `src/test-setup.js` created
- [ ] `src/constants.js` created with all 5 exports
- [ ] `src/utils.js` created with all 4 exports
- [ ] `prop-scout-v7.jsx` imports from both new files (no duplicate declarations)
- [ ] `src/constants.test.js` written — all tests pass (`npm run test`)
- [ ] `src/utils.test.js` written — all tests pass (`npm run test`)
- [ ] `npm run dev` still works — app behaves identically

---

## After Completing

Reply "Task 128 complete" and paste the output of `npm run test` so we can verify all tests pass.
